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

export interface AuditFlag {
  id: string;
  type: "TYPO" | "DUPLICATE" | "ANOMALY";
  severity: "low" | "medium" | "high";
  documentId: string;
  description: string;
  evidence?: string;
}

export interface BookingRule {
  id: string;
  title: string;
  logic: string;
  explanation: string;
  evidenceDocIds: string[];
}
