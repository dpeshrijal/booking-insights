import { describe, expect, it } from "vitest";
import { generateBookingManualRules } from "./rules";
import type { Booking } from "@/types";

function makeDoc(params: {
  id: string;
  text: string;
  gl: string;
  amount?: number;
  date?: string;
  vendor?: string;
  taxCode?: string;
  costCenter?: string | null;
}): Booking[] {
  const amount = params.amount ?? 200;
  const date = params.date ?? "2024-11-10";
  const vendor = params.vendor ?? "V-TEST";
  const taxCode = params.taxCode ?? "V1";
  const costCenter = params.costCenter ?? "CC-IT";
  return [
    {
      company_code: "1000",
      posting_date: date,
      document_id: params.id,
      line_id: 1,
      gl_account: params.gl,
      cost_center: costCenter,
      amount,
      currency: "EUR",
      debit_credit: "S",
      booking_text: params.text,
      vendor_id: vendor,
      customer_id: null,
      tax_code: taxCode,
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
      tax_code: taxCode,
    },
  ];
}

describe("generateBookingManualRules", () => {
  it("creates a GL + tax code consistency rule", () => {
    const bookings: Booking[] = [];
    for (let i = 0; i < 4; i++) {
      bookings.push(
        ...makeDoc({
          id: `t${i}`,
          text: "KR Vendor Inv 1001 Software Services",
          gl: "560000",
          taxCode: "V1",
        }),
      );
    }

    const rules = generateBookingManualRules(bookings);
    expect(rules.some((r) => r.id === "gl-tax-560000-V1")).toBe(true);
  });

  it("creates a GL + cost center rule", () => {
    const bookings: Booking[] = [];
    for (let i = 0; i < 4; i++) {
      bookings.push(
        ...makeDoc({
          id: `c${i}`,
          text: "SA Payroll Accrual Nov/2024",
          gl: "510000",
          taxCode: "V0",
          costCenter: "CC-HR",
        }),
      );
    }

    const rules = generateBookingManualRules(bookings);
    expect(rules.some((r) => r.id === "gl-cc-510000-CC-HR")).toBe(true);
  });

  it("creates a partner + GL pattern rule", () => {
    const bookings: Booking[] = [];
    for (let i = 0; i < 4; i++) {
      bookings.push(
        ...makeDoc({
          id: `p${i}`,
          text: "KR Vendor Inv 1001 Microsoft Services",
          gl: "560000",
          taxCode: "V1",
          vendor: "V-MSFT",
        }),
      );
    }

    const rules = generateBookingManualRules(bookings);
    expect(rules.some((r) => r.id === "partner-gl-V-MSFT-560000")).toBe(true);
  });
});
