import { Booking, BookingRule, FindingSampleRow } from "@/types";

const CLEARING_ACCOUNTS = new Set([
  "100000",
  "110000",
  "200000",
  "220000",
  "230000",
]);

const CONFIG = {
  minSupport: 4,
  dominantShare: 0.6,
  rareShare: 0.1,
  maxRules: 10,
  maxPerCategory: 3,
};

type Observation = {
  documentId: string;
  partnerId: string | null;
  bookingText: string;
  patternText: string;
  glAccount: string;
  taxCode: string | null;
  costCenter: string | null;
  row: FindingSampleRow;
};

type CandidateRule = BookingRule & { score: number; category: string };

/**
 * Normalizes text to catch recurring patterns (e.g., "Invoice 1234" and "Invoice 5678" -> "invoice")
 */
function normalizePattern(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(
      /\b[0-9a-f]{8}\b-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-\b[0-9a-f]{12}\b/g,
      " ",
    ) // Strip UUIDs
    .replace(/[\d.,]+/g, " ") // Strip numbers/amounts
    .replace(/[^\w\s]/g, " ") // Strip punctuation
    .replace(/\s+/g, " ") // Compress spaces
    .trim();
}

function isWeakPattern(pattern: string): boolean {
  if (!pattern) return true;
  const tokens = pattern.split(" ").filter(Boolean);
  if (tokens.length < 2) return true;
  const shortTokens = tokens.filter((t) => t.length <= 2).length;
  return shortTokens / tokens.length > 0.5;
}

/**
 * Parses bookings into Line-Level Observations.
 * Crucially, this extracts the Partner ID from the clearing/AP line
 * and applies it to the expense lines so cross-line rules work.
 */
function getObservations(bookings: Booking[]): Observation[] {
  const byDoc = new Map<string, Booking[]>();
  for (const b of bookings) {
    const list = byDoc.get(b.document_id) ?? [];
    list.push(b);
    byDoc.set(b.document_id, list);
  }

  const observations: Observation[] = [];

  for (const [docId, lines] of byDoc.entries()) {
    // Find the partner ID from ANY line in the document
    const partnerLine = lines.find((l) => l.vendor_id || l.customer_id);
    const partnerId =
      partnerLine?.vendor_id ?? partnerLine?.customer_id ?? null;

    for (const line of lines) {
      // We generate rules for actual business/expense accounts, not clearing accounts
      if (CLEARING_ACCOUNTS.has(line.gl_account)) continue;

      observations.push({
        documentId: docId,
        partnerId,
        bookingText: line.booking_text || "",
        patternText: normalizePattern(line.booking_text),
        glAccount: line.gl_account,
        taxCode: line.tax_code ?? null,
        costCenter: line.cost_center ?? null,
        row: {
          document_id: line.document_id,
          line_id: line.line_id,
          posting_date: line.posting_date,
          gl_account: line.gl_account,
          booking_text: line.booking_text,
          amount: line.amount,
        },
      });
    }
  }

  return observations;
}

/** Utility to group observations by a generic key */
function groupObservations<K extends string>(
  items: Observation[],
  keyFn: (o: Observation) => K | null,
) {
  const map = new Map<K, Observation[]>();
  for (const item of items) {
    const k = keyFn(item);
    if (!k) continue;
    const list = map.get(k) ?? [];
    list.push(item);
    map.set(k, list);
  }
  return map;
}

/** Utility to calculate support/confidence distribution for a target attribute */
function getStats<T extends string>(
  items: Observation[],
  targetFn: (o: Observation) => T | null,
) {
  const counts = new Map<T, Observation[]>();
  let total = 0;

  for (const item of items) {
    const val = targetFn(item);
    if (!val) continue;
    total += 1;
    const list = counts.get(val) ?? [];
    list.push(item);
    counts.set(val, list);
  }

  const entries = Array.from(counts.entries())
    .map(([key, list]) => ({
      key,
      count: list.length,
      share: total === 0 ? 0 : list.length / total, // share vs total observations with value
      items: list,
    }))
    .sort((a, b) => b.count - a.count);

  return { entries, total };
}

function rankCandidates(candidates: CandidateRule[]): BookingRule[] {
  const byCategory = new Map<string, CandidateRule[]>();
  for (const candidate of candidates) {
    const list = byCategory.get(candidate.category) ?? [];
    list.push(candidate);
    byCategory.set(candidate.category, list);
  }

  const picked = new Set<CandidateRule>();
  for (const list of byCategory.values()) {
    const sorted = list.sort((a, b) => b.score - a.score);
    for (const item of sorted.slice(0, CONFIG.maxPerCategory)) {
      picked.add(item);
    }
  }

  const remainder = candidates.filter((c) => !picked.has(c));
  const ordered = [...Array.from(picked), ...remainder].sort(
    (a, b) => b.score - a.score,
  );

  return ordered
    .slice(0, CONFIG.maxRules)
    .map(({ score, category, ...rule }) => rule as BookingRule);
}

export function generateBookingManualRules(bookings: Booking[]): BookingRule[] {
  const obs = getObservations(bookings);
  const candidates: CandidateRule[] = [];

  // 1. GL + Tax Code dominant mapping
  for (const [gl, items] of groupObservations(obs, (o) => o.glAccount)) {
    if (items.length < CONFIG.minSupport) continue;
    const stats = getStats(items, (o) => o.taxCode);
    const dominant = stats.entries[0];

    if (!dominant || dominant.share < CONFIG.dominantShare) continue;

    candidates.push({
      id: `gl-tax-${gl}-${dominant.key}`,
      title: `Tax code consistency for G/L ${gl}`,
      check: `Postings to G/L ${gl} typically use tax code ${dominant.key}.`,
      explanation: `Observed in ${dominant.count}/${stats.total} lines (${Math.round(dominant.share * 100)}%).`,
      evidenceRows: dominant.items.slice(0, 3).map((i) => i.row),
      score: dominant.count * dominant.share,
      category: "gl-tax",
    });
  }

  // 2. GL + Cost Center dominant mapping
  for (const [gl, items] of groupObservations(obs, (o) => o.glAccount)) {
    const withCostCenter = items.filter((o) => o.costCenter);
    if (withCostCenter.length < CONFIG.minSupport) continue;

    const stats = getStats(withCostCenter, (o) => o.costCenter);
    const dominant = stats.entries[0];

    if (!dominant || dominant.share < CONFIG.dominantShare) continue;

    candidates.push({
      id: `gl-cc-${gl}-${dominant.key}`,
      title: `Cost center for G/L ${gl}`,
      check: `Postings to G/L ${gl} typically map to cost center ${dominant.key}.`,
      explanation: `Observed in ${dominant.count}/${stats.total} tracked lines (${Math.round(dominant.share * 100)}%).`,
      evidenceRows: dominant.items.slice(0, 3).map((i) => i.row),
      score: dominant.count * dominant.share,
      category: "gl-cc",
    });
  }

  // 3. Partner + GL dominant mapping
  for (const [partner, items] of groupObservations(obs, (o) => o.partnerId)) {
    if (items.length < CONFIG.minSupport) continue;

    const stats = getStats(items, (o) => o.glAccount);
    const dominant = stats.entries[0];

    if (!dominant || dominant.share < CONFIG.dominantShare) continue;

    candidates.push({
      id: `partner-gl-${partner}-${dominant.key}`,
      title: `Partner posting pattern`,
      check: `Invoices from Partner ${partner} are typically posted to G/L ${dominant.key}.`,
      explanation: `Observed in ${dominant.count}/${stats.total} lines (${Math.round(dominant.share * 100)}%).`,
      evidenceRows: dominant.items.slice(0, 3).map((i) => i.row),
      score: dominant.count * dominant.share,
      category: "partner-gl",
    });
  }

  // 4. Recurring booking text pattern -> GL
  for (const [pattern, items] of groupObservations(obs, (o) => o.patternText)) {
    if (pattern.length < 5 || items.length < CONFIG.minSupport) continue;
    if (isWeakPattern(pattern)) continue;

    const stats = getStats(items, (o) => o.glAccount);
    const dominant = stats.entries[0];

    if (!dominant || dominant.share < CONFIG.dominantShare) continue;

    candidates.push({
      id: `text-gl-${pattern}`,
      title: `Recurring text mapping`,
      check: `Text pattern "${pattern}" should map to G/L ${dominant.key}.`,
      explanation: `Observed in ${dominant.count}/${stats.total} postings (${Math.round(dominant.share * 100)}%).`,
      evidenceRows: dominant.items.slice(0, 3).map((i) => i.row),
      score: dominant.count * dominant.share,
      category: "text-gl",
    });

    // 5. Rare mapping alert for frequent text (Anomaly Detection)
    // Piggybacking on the text loop since we already have the distribution
    if (items.length >= CONFIG.minSupport + 2) {
      for (const entry of stats.entries) {
        if (entry.key === dominant.key) continue;
        if (entry.share <= CONFIG.rareShare) {
          candidates.push({
            id: `rare-text-${pattern}-${entry.key}`,
            title: `Suspicious mapping for "${pattern}"`,
            check: `Text pattern "${pattern}" usually maps to G/L ${dominant.key}, but mapped to ${entry.key} here.`,
            explanation: `Only ${entry.count}/${stats.total} postings (${Math.round(entry.share * 100)}%) used G/L ${entry.key}.`,
            evidenceRows: entry.items.slice(0, 3).map((i) => i.row),
            score: dominant.count * dominant.share * (1 - entry.share),
            category: "rare-text",
          });
        }
      }
    }
  }

  return rankCandidates(candidates);
}
