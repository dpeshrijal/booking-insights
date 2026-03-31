"use client";

import { ColumnDef } from "@tanstack/react-table";
import { Booking } from "@/types";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * columnDefinitions: The blueprint for our data grid.
 * Each column defines its header text and how its cell value should be rendered.
 */
export const columns: ColumnDef<Booking>[] = [
  {
    accessorKey: "document_id",
    header: "Document",
    cell: ({ row }) => (
      <span className="font-mono text-[11px] font-bold text-slate-900 tracking-tighter">
        {row.getValue("document_id")}
      </span>
    ),
  },
  {
    accessorKey: "posting_date",
    header: "Date",
    cell: ({ row }) => (
      <span className="text-slate-500 font-medium whitespace-nowrap">
        {formatDate(row.getValue("posting_date"))}
      </span>
    ),
  },
  {
    accessorKey: "tax_code",
    header: "Tax",
    cell: ({ row }) => (
      <span className="font-mono text-xs font-semibold text-slate-500">
        {row.getValue("tax_code")}
      </span>
    ),
  },
  {
    accessorKey: "gl_account",
    header: "G/L Account",
    cell: ({ row }) => (
      <code className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600 border border-slate-200">
        {row.getValue("gl_account")}
      </code>
    ),
  },
  {
    accessorKey: "booking_text",
    header: "Booking Text",
    cell: ({ row }) => {
      const booking = row.original;
      return (
        <div className="flex flex-col min-w-[200px]">
          <span className="font-semibold text-slate-700 leading-tight">
            {booking.booking_text}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-slate-400 font-bold">
            {booking.cost_center || "General"}
          </span>
        </div>
      );
    },
  },
  {
    accessorKey: "amount",
    header: () => <div className="text-right">Amount</div>,
    cell: ({ row }) => {
      const amount = Number(row.getValue("amount"));
      const booking = row.original;

      return (
        <div
          className={cn(
            "text-right font-mono font-bold tracking-tight",
            amount < 0 ? "text-rose-600" : "text-emerald-600",
          )}
        >
          {formatCurrency(amount, booking.currency)}
        </div>
      );
    },
  },
  {
    accessorKey: "vendor_id",
    header: "Partner",
    cell: ({ row }) => {
      const booking = row.original;
      const partner = booking.vendor_id ?? booking.customer_id;
      return (
        <span className="font-mono text-xs text-slate-500">{partner ?? "N/A"}</span>
      );
    },
  },
  {
    accessorKey: "debit_credit",
    header: () => <div className="text-center">Status</div>,
    cell: ({ row }) => {
      const type = row.getValue("debit_credit") as string;
      const isDebit = type === "S";

      return (
        <div className="flex justify-center">
          <Badge
            variant="outline"
            className={cn(
              "px-2 py-0 font-bold text-[9px] uppercase tracking-widest border-none shadow-none",
              isDebit
                ? "bg-emerald-50 text-emerald-700"
                : "bg-slate-50 text-slate-500",
            )}
          >
            {isDebit ? "Debit" : "Credit"}
          </Badge>
        </div>
      );
    },
  },
];
