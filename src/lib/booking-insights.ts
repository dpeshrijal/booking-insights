import { Booking } from "@/types";

export interface DashboardStats {
  totalLines: number;
  uniqueDocuments: number;
  glAccounts: number;
  dateRange: {
    from: string;
    to: string;
  };
}

export function getDashboardStats(bookings: Booking[]): DashboardStats {
  const documentIds = new Set<string>();
  const glAccounts = new Set<string>();
  let minDate = "9999-12-31";
  let maxDate = "0000-01-01";

  for (const booking of bookings) {
    documentIds.add(booking.document_id);
    glAccounts.add(booking.gl_account);

    if (booking.posting_date < minDate) minDate = booking.posting_date;
    if (booking.posting_date > maxDate) maxDate = booking.posting_date;
  }

  return {
    totalLines: bookings.length,
    uniqueDocuments: documentIds.size,
    glAccounts: glAccounts.size,
    dateRange: {
      from: minDate,
      to: maxDate,
    },
  };
}
