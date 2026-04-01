import { describe, expect, it } from "vitest";
import { detectDuplicateFindings } from "./detection";
import type { Booking } from "@/types";

function makeDoc(params: {
  id: string;
  text: string;
  gl: string;
  amount?: number;
  date?: string;
  vendor?: string;
}): Booking[] {
  const amount = params.amount ?? 500;
  const date = params.date ?? "2024-11-10";
  const vendor = params.vendor ?? "V-TEST";
  return [
    {
      company_code: "1000",
      posting_date: date,
      document_id: params.id,
      line_id: 1,
      gl_account: params.gl,
      cost_center: "CC-IT",
      amount,
      currency: "EUR",
      debit_credit: "S",
      booking_text: params.text,
      vendor_id: vendor,
      customer_id: null,
      tax_code: "V0",
    },
    {
      company_code: "1000",
      posting_date: date,
      document_id: params.id,
      line_id: 2,
      gl_account: "200000",
      cost_center: null,
      amount: -amount,
      currency: "EUR",
      debit_credit: "H",
      booking_text: params.text,
      vendor_id: vendor,
      customer_id: null,
      tax_code: "V0",
    },
  ];
}

describe("detectDuplicateFindings", () => {
  it("detects duplicates for same partner, amount, text, and close dates", () => {
    const bookings: Booking[] = [
      ...makeDoc({
        id: "100",
        text: "KR Vendor Inv 1001 Software Services",
        gl: "560000",
        amount: 980.75,
        date: "2024-11-05",
        vendor: "V-MSFT",
      }),
      ...makeDoc({
        id: "101",
        text: "KR Vendor Inv 1001 Software Services",
        gl: "560000",
        amount: 980.75,
        date: "2024-11-06",
        vendor: "V-MSFT",
      }),
    ];

    const findings = detectDuplicateFindings(bookings);
    expect(findings.length).toBe(1);
    expect(findings[0].documentIds.sort()).toEqual(["100", "101"]);
  });

  it("does not match duplicates when partner differs", () => {
    const bookings: Booking[] = [
      ...makeDoc({
        id: "200",
        text: "KR Vendor Inv 1001 Software Services",
        gl: "560000",
        amount: 980.75,
        date: "2024-11-05",
        vendor: "V-MSFT",
      }),
      ...makeDoc({
        id: "201",
        text: "KR Vendor Inv 1001 Software Services",
        gl: "560000",
        amount: 980.75,
        date: "2024-11-06",
        vendor: "V-ADOBE",
      }),
    ];

    const findings = detectDuplicateFindings(bookings);
    expect(findings.length).toBe(0);
  });

  it("does not match when date gap is too large", () => {
    const bookings: Booking[] = [
      ...makeDoc({
        id: "300",
        text: "KR Vendor Inv 1001 Software Services",
        gl: "560000",
        amount: 980.75,
        date: "2024-11-01",
        vendor: "V-MSFT",
      }),
      ...makeDoc({
        id: "301",
        text: "KR Vendor Inv 1001 Software Services",
        gl: "560000",
        amount: 980.75,
        date: "2024-11-20",
        vendor: "V-MSFT",
      }),
    ];

    const findings = detectDuplicateFindings(bookings);
    expect(findings.length).toBe(0);
  });
});
