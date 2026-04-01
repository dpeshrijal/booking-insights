export interface Booking {
  company_code: string;
  posting_date: string;
  document_id: string;
  line_id: number;
  gl_account: string;
  cost_center: string | null;
  amount: number;
  currency: string;
  debit_credit: "S" | "H";
  booking_text: string;
  vendor_id: string | null;
  customer_id?: string | null;
  tax_code: string;
}

export type FindingType =
  | "TYPO_NEAR_DUPLICATE"
  | "UNUSUAL_ACCOUNT_COMBINATION"
  | "OUTLIER_TEXT_PATTERN"
  | "UNUSUAL_TEXT_PATTERN";

export interface FindingSampleRow {
  document_id: string;
  line_id: number;
  posting_date: string;
  gl_account: string;
  booking_text: string;
  amount: number;
}

export interface AuditFinding {
  id: string;
  type: FindingType;
  reason: string;
  documentIds: string[];
  sampleRows: FindingSampleRow[];
  aiExplanation?: string;
}
