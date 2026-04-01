import { Booking, DuplicateFinding, FindingSampleRow } from "@/types";

const RULES = {
  maxDateGapDays: 7,
  minTextSimilarity: 0.9,
  minAccountOverlap: 0.7,
  minConfidence: 0.7,
  amountToleranceAbsolute: 1.0,
  amountTolerancePercent: 0.01,
};

const CLEARING_ACCOUNTS = new Set([
  "100000",
  "110000",
  "200000",
  "220000",
  "230000",
]);

type DocSummary = {
  documentId: string;
  companyCode: string;
  postingDate: string;
  currency: string;
  bookingText: string;
  normalizedText: string;
  partnerId: string | null;
  primaryAccount: string;
  accountSignature: string[];
  totalVolume: number; // Changed from totalDebit for safety
  sampleRows: FindingSampleRow[];
};

type PairScore = {
  score: number;
  criteria: string[];
};

function normalizeText(value: string | null | undefined): string {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/[^\w\s/.-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function toSampleRow(row: Booking): FindingSampleRow {
  return {
    document_id: row.document_id,
    line_id: row.line_id,
    posting_date: row.posting_date,
    gl_account: row.gl_account,
    booking_text: row.booking_text,
    amount: row.amount,
  };
}

function bigramDiceSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;

  const counts = new Map<string, number>();
  for (let i = 0; i < a.length - 1; i++) {
    const gram = a.slice(i, i + 2);
    counts.set(gram, (counts.get(gram) ?? 0) + 1);
  }

  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const gram = b.slice(i, i + 2);
    const count = counts.get(gram) ?? 0;
    if (count > 0) {
      counts.set(gram, count - 1);
      intersection += 1;
    }
  }

  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

function getDayDiff(left: string, right: string): number {
  const a = Date.parse(left);
  const b = Date.parse(right);
  if (isNaN(a) || isNaN(b)) return 999; // Fallback for invalid dates
  return Math.abs(a - b) / (1000 * 60 * 60 * 24);
}

function amountWithinTolerance(left: number, right: number): boolean {
  const diff = Math.abs(left - right);
  // Calculate allowed diff based on the larger amount to be safe
  const allowed = Math.max(
    RULES.amountToleranceAbsolute,
    Math.max(Math.abs(left), Math.abs(right)) * RULES.amountTolerancePercent,
  );
  return diff <= allowed;
}

function accountOverlapRatio(left: string[], right: string[]): number {
  if (left.length === 0 || right.length === 0) return 0;
  const leftSet = new Set(left);
  const intersection = right.filter((account) => leftSet.has(account)).length;
  const union = new Set([...left, ...right]).size;
  return union === 0 ? 0 : intersection / union;
}

function summarizeByDocument(bookings: Booking[]): DocSummary[] {
  const byDocument = new Map<string, Booking[]>();
  for (const row of bookings) {
    const rows = byDocument.get(row.document_id) ?? [];
    rows.push(row);
    byDocument.set(row.document_id, rows);
  }

  const summaries: DocSummary[] = [];
  for (const rows of byDocument.values()) {
    const first = rows[0];
    const nonClearing =
      rows.find((r) => !CLEARING_ACCOUNTS.has(r.gl_account)) ?? first;
    const partnerRow = rows.find((r) => r.vendor_id || r.customer_id) ?? first;

    // Safety fix: totalVolume measures the absolute size of the transaction,
    // ensuring credit-only or negative-mapped docs don't result in 0
    const totalVolume =
      rows.reduce((acc, r) => acc + Math.abs(r.amount), 0) / 2;

    const nonClearingAccounts = rows
      .filter((r) => !CLEARING_ACCOUNTS.has(r.gl_account))
      .map((r) => r.gl_account);
    const accountSignature = Array.from(
      new Set(nonClearingAccounts.length ? nonClearingAccounts : rows.map((r) => r.gl_account)),
    ).sort();

    summaries.push({
      documentId: first.document_id,
      companyCode: first.company_code,
      postingDate: first.posting_date,
      currency: first.currency,
      bookingText: first.booking_text,
      normalizedText: normalizeText(first.booking_text),
      partnerId: partnerRow.vendor_id ?? partnerRow.customer_id ?? null,
      primaryAccount: nonClearing.gl_account,
      accountSignature,
      totalVolume: Number(totalVolume.toFixed(2)),
      sampleRows: rows.slice(0, 3).map(toSampleRow),
    });
  }

  return summaries;
}

function scorePair(left: DocSummary, right: DocSummary): PairScore | null {
  const dateGap = getDayDiff(left.postingDate, right.postingDate);
  if (dateGap > RULES.maxDateGapDays) return null;

  const textSimilarity = bigramDiceSimilarity(
    left.normalizedText,
    right.normalizedText,
  );

  const overlap = accountOverlapRatio(
    left.accountSignature,
    right.accountSignature,
  );

  const partnerMatch =
    left.partnerId && right.partnerId && left.partnerId === right.partnerId;

  if (!partnerMatch) return null;
  if (textSimilarity < RULES.minTextSimilarity) return null;
  if (overlap < RULES.minAccountOverlap) return null;
  if (left.primaryAccount !== right.primaryAccount) return null;

  let score = 0;
  const criteria: string[] = [];

  criteria.push(
    `Amount match (${left.totalVolume.toFixed(2)} ${left.currency})`,
  );
  score += 0.3;

  criteria.push(`Same partner (${left.partnerId})`);
  score += 0.2;

  criteria.push(`Similar text (${Math.round(textSimilarity * 100)}%)`);
  score += 0.25;

  criteria.push(`Same primary G/L (${left.primaryAccount})`);
  score += 0.1;

  criteria.push(`Similar account set (${Math.round(overlap * 100)}%)`);
  score += 0.1;

  if (dateGap === 0) {
    criteria.push("Same posting date");
    score += 0.1;
  } else {
    criteria.push(`Date gap ${Math.round(dateGap)} days`);
    score += Math.max(0, 0.05 * (1 - dateGap / RULES.maxDateGapDays));
  }

  if (score < RULES.minConfidence) return null;

  return { score: Number(Math.min(1, score).toFixed(2)), criteria };
}

function unionFind(ids: string[]) {
  const parent = new Map<string, string>();
  for (const id of ids) parent.set(id, id);

  const find = (id: string): string => {
    const p = parent.get(id);
    if (!p || p === id) return id;
    const root = find(p);
    parent.set(id, root);
    return root;
  };

  const union = (a: string, b: string) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  const groups = () => {
    const bucket = new Map<string, string[]>();
    for (const id of ids) {
      const root = find(id);
      const list = bucket.get(root) ?? [];
      list.push(id);
      bucket.set(root, list);
    }
    return bucket;
  };

  return { union, groups };
}

export function detectDuplicateFindings(
  bookings: Booking[],
): DuplicateFinding[] {
  const summaries = summarizeByDocument(bookings);

  // 1. Group by broad rules (Company + Currency)
  const buckets = new Map<string, DocSummary[]>();
  for (const summary of summaries) {
    const key = `${summary.companyCode}|${summary.currency}`;
    const list = buckets.get(key) ?? [];
    list.push(summary);
    buckets.set(key, list);
  }

  const findings: DuplicateFinding[] = [];
  const pairs: Array<[DocSummary, DocSummary, PairScore]> = [];

  for (const [, bucket] of buckets) {
    if (bucket.length < 2) continue;

    // 2. Sliding Window optimization by amount
    // Fixes the rounding bug where $100.49 and $100.51 end up in different buckets
    bucket.sort((a, b) => a.totalVolume - b.totalVolume);

    for (let i = 0; i < bucket.length; i++) {
      for (let j = i + 1; j < bucket.length; j++) {
        const left = bucket[i];
        const right = bucket[j];

        // Since the array is sorted, if 'right' is out of tolerance,
        // ALL subsequent elements in this loop will also be out of tolerance. Break early.
        if (!amountWithinTolerance(left.totalVolume, right.totalVolume)) {
          break;
        }

        const score = scorePair(left, right);
        if (score) pairs.push([left, right, score]);
      }
    }
  }

  // 3. Cluster overlaps using Union-Find
  if (pairs.length > 0) {
    const ids = Array.from(
      new Set(
        pairs.flatMap(([left, right]) => [left.documentId, right.documentId]),
      ),
    );

    const uf = unionFind(ids);
    for (const [left, right] of pairs) {
      uf.union(left.documentId, right.documentId);
    }

    const clusters = uf.groups();
    const docLookup = new Map(summaries.map((s) => [s.documentId, s]));

    for (const [root, clusterIds] of clusters.entries()) {
      if (clusterIds.length < 2) continue;

      const clusterPairs = pairs.filter(
        ([left, right]) =>
          clusterIds.includes(left.documentId) &&
          clusterIds.includes(right.documentId),
      );

      const confidence = Math.max(
        ...clusterPairs.map(([, , score]) => score.score),
      );
      const criteria = Array.from(
        new Set(clusterPairs.flatMap(([, , score]) => score.criteria)),
      );

      const sampleRows = clusterIds
        .map((id) => docLookup.get(id)!)
        .flatMap((doc) => doc.sampleRows);

      findings.push({
        id: `dup-${root}`,
        documentIds: clusterIds,
        sampleRows,
        confidence: Number(confidence.toFixed(2)),
        criteria,
      });
    }
  }

  return findings.sort((a, b) => b.confidence - a.confidence);
}
