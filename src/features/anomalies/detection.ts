import { AuditFinding, Booking, FindingSampleRow } from "@/types";

const RULES = {
  typoNearDuplicate: {
    similarityMin: 0.9,
    similarityMax: 0.985,
    maxDocsPerFinding: 200,
    maxRowsPerFinding: 200,
  },
  unusualAccount: {
    minTextFrequency: 4,
    rareShareThreshold: 0.15,
    maxDocsPerFinding: 200,
    maxRowsPerFinding: 200,
  },
  outlierText: {
    frequentTextMinCount: 4,
    nearestSimilarityMin: 0.9,
    nearestSimilarityMax: 0.995,
    maxDocsPerFinding: 200,
    maxRowsPerFinding: 200,
  },
  unusualPattern: {
    maxDocsPerFinding: 200,
    maxRowsPerFinding: 200,
  },
};

const CLEARING_ACCOUNTS = new Set([
  "100000",
  "110000",
  "200000",
  "220000",
  "230000",
]);

const VAGUE_TERMS = new Set([
  "misc",
  "miscellaneous",
  "other",
  "various",
  "general",
  "common",
  "see attachment",
  "see doc",
  "see invoice",
  "tbd",
  "n/a",
  "na",
  "payment",
  "booking",
  "entry",
  "posting",
  "correction",
  "adjustment",
  "pmt",
  "inv",
  "doc",
  "ref",
  "asdf",
]);

type DocSummary = {
  documentId: string;
  companyCode: string;
  postingDate: string;
  normalizedText: string;
  bookingText: string;
  primaryAccount: string;
  partnerId: string | null;
  sampleRows: FindingSampleRow[];
};

function normalizeText(value: string): string {
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

function alphaTokens(text: string): string[] {
  return normalizeText(text)
    .split(/\s+/)
    .filter((token) => /[a-z]/i.test(token));
}

function isOnlyNumericDifference(leftText: string, rightText: string): boolean {
  if (leftText === rightText) return false;
  const leftAlpha = alphaTokens(leftText);
  const rightAlpha = alphaTokens(rightText);
  if (leftAlpha.length !== rightAlpha.length) return false;
  return leftAlpha.every((token, index) => token === rightAlpha[index]);
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

    summaries.push({
      documentId: first.document_id,
      companyCode: first.company_code,
      postingDate: first.posting_date,
      normalizedText: normalizeText(first.booking_text),
      bookingText: first.booking_text,
      primaryAccount: nonClearing.gl_account,
      partnerId: partnerRow.vendor_id ?? partnerRow.customer_id ?? null,
      sampleRows: rows.slice(0, 3).map(toSampleRow),
    });
  }

  return summaries;
}

function groupByNormalizedText(
  summaries: DocSummary[],
): Map<string, DocSummary[]> {
  const grouped = new Map<string, DocSummary[]>();
  for (const summary of summaries) {
    const rows = grouped.get(summary.normalizedText) ?? [];
    rows.push(summary);
    grouped.set(summary.normalizedText, rows);
  }
  return grouped;
}

//  1. Very Similar Texts 
// Two distinct texts scoring 90-98.5% bigram similarity = possible typo or
// wording drift. Pure text comparison, no financial context needed.

function detectTypoNearDuplicates(
  groupedByText: Map<string, DocSummary[]>,
): AuditFinding[] {
  const texts = Array.from(groupedByText.keys());
  const findings: AuditFinding[] = [];

  for (let i = 0; i < texts.length; i++) {
    for (let j = i + 1; j < texts.length; j++) {
      const leftText = texts[i];
      const rightText = texts[j];
      const similarity = bigramDiceSimilarity(leftText, rightText);

      if (
        similarity < RULES.typoNearDuplicate.similarityMin ||
        similarity > RULES.typoNearDuplicate.similarityMax
      ) {
        continue;
      }
      if (isOnlyNumericDifference(leftText, rightText)) {
        continue;
      }

      const leftDocs = groupedByText.get(leftText) ?? [];
      const rightDocs = groupedByText.get(rightText) ?? [];
      if (leftDocs.length === 1 || rightDocs.length === 1) {
        continue;
      }
      const matchedDocIds = new Set<string>();
      const sampleRows: FindingSampleRow[] = [];

      for (const doc of leftDocs) {
        matchedDocIds.add(doc.documentId);
        sampleRows.push(...doc.sampleRows.slice(0, 1));
      }
      for (const doc of rightDocs) {
        matchedDocIds.add(doc.documentId);
        sampleRows.push(...doc.sampleRows.slice(0, 1));
      }

      findings.push({
        id: `typo-${leftText}-${rightText}`.replace(/\s+/g, "-"),
        type: "TYPO_NEAR_DUPLICATE",
        reason: `Booking text "${leftDocs[0]?.bookingText}" is ${Math.round(similarity * 100)}% similar to "${rightDocs[0]?.bookingText}" - possible typo or wording drift.`,
        documentIds: Array.from(matchedDocIds).slice(
          0,
          RULES.typoNearDuplicate.maxDocsPerFinding,
        ),
        sampleRows: sampleRows.slice(
          0,
          RULES.typoNearDuplicate.maxRowsPerFinding,
        ),
      });
    }
  }

  return findings;
}

//  2. Typos (single-use variant of a known frequent text) 
// A text used only once that closely resembles a text used 6+ times.
// Strong signal that someone mistyped a recurring description.

function detectTypoVariants(
  groupedByText: Map<string, DocSummary[]>,
): AuditFinding[] {
  const frequentTexts = Array.from(groupedByText.entries())
    .filter(
      ([, entries]) => entries.length >= RULES.outlierText.frequentTextMinCount,
    )
    .map(([text]) => text);

  const findings: AuditFinding[] = [];

  for (const [text, entries] of groupedByText.entries()) {
    if (entries.length !== 1) continue;

    const nearest = frequentTexts
      .map((candidate) => ({
        candidate,
        score: bigramDiceSimilarity(text, candidate),
      }))
      .filter(
        ({ score }) =>
          score >= RULES.outlierText.nearestSimilarityMin &&
          score < RULES.outlierText.nearestSimilarityMax,
      )
      .sort((a, b) => b.score - a.score)[0];

    if (!nearest) continue;
    if (isOnlyNumericDifference(text, nearest.candidate)) continue;

    const candidateBookingText =
      groupedByText.get(nearest.candidate)?.[0]?.bookingText ??
      nearest.candidate;

    findings.push({
      id: `typo-variant-${text}`.replace(/\s+/g, "-"),
      type: "OUTLIER_TEXT_PATTERN",
      reason: `Single-use text "${entries[0]?.bookingText}" closely resembles common text "${candidateBookingText}" (${Math.round(nearest.score * 100)}% match) - likely a typo on a recurring transaction.`,
      documentIds: entries
        .map((e) => e.documentId)
        .slice(0, RULES.outlierText.maxDocsPerFinding),
      sampleRows: entries
        .flatMap((e) => e.sampleRows.slice(0, 1))
        .slice(0, RULES.outlierText.maxRowsPerFinding),
    });
  }

  return findings;
}

//  3. Unusual Account Combination 
// A booking text that consistently maps to one GL account but occasionally
// appears on a rare different account - flags text-to-account mapping anomalies.

function detectUnusualAccountCombinations(
  groupedByText: Map<string, DocSummary[]>,
): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const [, entries] of groupedByText.entries()) {
    if (entries.length < RULES.unusualAccount.minTextFrequency) continue;

    const accountCounts = new Map<string, number>();
    for (const entry of entries) {
      accountCounts.set(
        entry.primaryAccount,
        (accountCounts.get(entry.primaryAccount) ?? 0) + 1,
      );
    }

    const dominant = Array.from(accountCounts.entries()).sort(
      (a, b) => b[1] - a[1],
    )[0];

    for (const [account, count] of accountCounts.entries()) {
      if (account === dominant[0]) continue;
      const share = count / entries.length;
      if (share >= RULES.unusualAccount.rareShareThreshold) continue;

      const evidence = entries.filter((e) => e.primaryAccount === account);

      findings.push({
        id: `acct-${entries[0]?.normalizedText}-${account}`.replace(
          /\s+/g,
          "-",
        ),
        type: "UNUSUAL_ACCOUNT_COMBINATION",
        reason: `Booking text "${entries[0]?.bookingText}" almost always posts to G/L ${dominant[0]} but appears on G/L ${account} in only ${Math.round(share * 100)}% of cases - possible miscoding.`,
        documentIds: evidence
          .map((e) => e.documentId)
          .slice(0, RULES.unusualAccount.maxDocsPerFinding),
        sampleRows: evidence
          .flatMap((e) => e.sampleRows.slice(0, 1))
          .slice(0, RULES.unusualAccount.maxRowsPerFinding),
      });
    }
  }

  return findings;
}

//  4. Unusual Text Patterns 
// Texts that are structurally or semantically suspicious on their own:
// repeated words, vague/non-descriptive terms, excessive numeric ratio,
// mixed scripts, excessive special characters.

function getUnusualPatternReason(text: string): string | null {
  const trimmed = text.trim();
  const normalized = normalizeText(trimmed);
  const tokens = normalized.split(/\s+/);

  const tokenSet = new Set<string>();
  const repeated: string[] = [];
  for (const token of tokens) {
    if (token.length > 2) {
      if (tokenSet.has(token)) repeated.push(token);
      else tokenSet.add(token);
    }
  }
  if (repeated.length > 0) {
    return `Booking text "${text}" contains repeated words (${repeated.map((w) => `"${w}"`).join(", ")}) - possible data entry error or system glitch.`;
  }

  const isVague =
    tokens.length <= 3 && tokens.every((t) => VAGUE_TERMS.has(t.toLowerCase()));
  if (isVague) {
    return `Booking text "${text}" is too vague to support an audit trail - generic terms do not identify the underlying transaction.`;
  }

  const numericTokens = tokens.filter((t) => /^\d+$/.test(t));
  if (tokens.length >= 3 && numericTokens.length / tokens.length > 0.5) {
    return `Booking text "${text}" consists mostly of numbers with little descriptive content - may be a system dump or miscoded entry.`;
  }

  const hasLatin = /[a-zA-Z]/.test(trimmed);
  const hasNonLatin = /[^\x00-\x7F]/.test(trimmed);
  if (hasLatin && hasNonLatin) {
    return `Booking text "${text}" mixes latin and non-latin characters - may indicate encoding issues or copy-paste from an external source.`;
  }

  const specialChars = trimmed.replace(/[\w\s]/g, "");
  if (trimmed.length > 6 && specialChars.length / trimmed.length > 0.3) {
    return `Booking text "${text}" contains an unusually high proportion of special characters - likely malformed or corrupted input.`;
  }

  return null;
}

function detectUnusualTextPatterns(summaries: DocSummary[]): AuditFinding[] {
  const findings: AuditFinding[] = [];

  for (const summary of summaries) {
    const reason = getUnusualPatternReason(summary.bookingText);
    if (!reason) continue;

    findings.push({
      id: `unusual-${summary.documentId}`.replace(/\s+/g, "-"),
      type: "UNUSUAL_TEXT_PATTERN",
      reason,
      documentIds: [summary.documentId].slice(
        0,
        RULES.unusualPattern.maxDocsPerFinding,
      ),
      sampleRows: summary.sampleRows.slice(
        0,
        RULES.unusualPattern.maxRowsPerFinding,
      ),
    });
  }

  return findings;
}

//  Pipeline 

function dedupeFindings(findings: AuditFinding[]): AuditFinding[] {
  const seen = new Set<string>();
  const deduped: AuditFinding[] = [];

  for (const finding of findings) {
    const docsKey = [...finding.documentIds].sort().join("-");
    const key = `${finding.type}:${docsKey}`;
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(finding);
  }

  return deduped;
}

function sortByPriority(findings: AuditFinding[]): AuditFinding[] {
  return findings.sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    return b.documentIds.length - a.documentIds.length;
  });
}

export function detectAnomalyFindings(bookings: Booking[]): AuditFinding[] {
  const summaries = summarizeByDocument(bookings);
  const groupedByText = groupByNormalizedText(summaries);

  const findings = [
    ...detectTypoNearDuplicates(groupedByText), // very similar texts
    ...detectTypoVariants(groupedByText), // typos on known recurring texts
    ...detectUnusualAccountCombinations(groupedByText), // text mapped to wrong GL account
    ...detectUnusualTextPatterns(summaries), // repeated words, vague, mixed script
  ];

  const deduped = dedupeFindings(findings);
  return sortByPriority(deduped);
}

