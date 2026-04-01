import { describe, expect, it } from "vitest";
import { detectAnomalyFindings } from "./detection";
import type { Booking } from "@/types";

function makeDoc(params: {
  id: string;
  text: string;
  gl: string;
  amount?: number;
  date?: string;
  vendor?: string;
}): Booking[] {
  const amount = params.amount ?? 100;
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

describe("detectAnomalyFindings", () => {
  it("flags near-duplicate texts when both variants appear multiple times", () => {
    const bookings: Booking[] = [
      ...makeDoc({ id: "1", text: "KR Vendor Inv Cloud Services Nov/2024", gl: "560000" }),
      ...makeDoc({ id: "2", text: "KR Vendor Inv Cloud Services Nov/2024", gl: "560000" }),
      ...makeDoc({ id: "3", text: "KR Vendor Inv Cloud Servics Nov/2024", gl: "560000" }),
      ...makeDoc({ id: "4", text: "KR Vendor Inv Cloud Servics Nov/2024", gl: "560000" }),
    ];

    const findings = detectAnomalyFindings(bookings);
    expect(findings.some((f) => f.type === "TYPO_NEAR_DUPLICATE")).toBe(true);
  });

  it("flags single-use typo variants against frequent text", () => {
    const bookings: Booking[] = [
      ...makeDoc({ id: "10", text: "Monthly Support Fee", gl: "560000" }),
      ...makeDoc({ id: "11", text: "Monthly Support Fee", gl: "560000" }),
      ...makeDoc({ id: "12", text: "Monthly Support Fee", gl: "560000" }),
      ...makeDoc({ id: "13", text: "Monthly Support Fee", gl: "560000" }),
      ...makeDoc({ id: "14", text: "Monthly Suport Fee", gl: "560000" }),
    ];

    const findings = detectAnomalyFindings(bookings);
    expect(findings.some((f) => f.type === "OUTLIER_TEXT_PATTERN")).toBe(true);
  });

  it("flags unusual account combinations for recurring texts", () => {
    const bookings: Booking[] = [];
    for (let i = 0; i < 6; i++) {
      bookings.push(
        ...makeDoc({
          id: `20${i}`,
          text: "KR Vendor Inv Utility Provider Nov/2024",
          gl: "530000",
        }),
      );
    }
    bookings.push(
      ...makeDoc({
        id: "206",
        text: "KR Vendor Inv Utility Provider Nov/2024",
        gl: "570000",
      }),
    );

    const findings = detectAnomalyFindings(bookings);
    expect(findings.some((f) => f.type === "UNUSUAL_ACCOUNT_COMBINATION")).toBe(true);
  });
});
