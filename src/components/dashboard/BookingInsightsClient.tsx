"use client";

import { useState } from "react";
import { Booking, AuditFinding, FindingType } from "@/types";
import { columns } from "@/components/dashboard/columns";
import { DataTable } from "@/components/dashboard/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate } from "@/utils/formatters";
import type { DashboardStats } from "@/lib/booking-insights";
import { detectAnomalyFindings } from "@/features/anomalies/detection";

interface BookingInsightsClientProps {
  bookings: Booking[];
  stats: DashboardStats;
}

type AuditState = "idle" | "running" | "completed" | "error";
type MainTab = "ledger" | "anomalies";

const TYPE_SECTIONS: Array<{ type: FindingType; label: string }> = [
  { type: "TYPO_NEAR_DUPLICATE", label: "Typos / Near-Duplicates" },
  { type: "UNUSUAL_ACCOUNT_COMBINATION", label: "Unusual Account Patterns" },
  { type: "OUTLIER_TEXT_PATTERN", label: "Suspicious Text Patterns" },
  { type: "UNUSUAL_TEXT_PATTERN", label: "Unusual Text Patterns" },
];

const TYPE_LABELS: Record<FindingType, string> = {
  TYPO_NEAR_DUPLICATE: "Near Duplicate",
  UNUSUAL_ACCOUNT_COMBINATION: "Unusual Account",
  OUTLIER_TEXT_PATTERN: "Typo Variant",
  UNUSUAL_TEXT_PATTERN: "Unusual Text",
};

export function BookingInsightsClient({
  bookings,
  stats,
}: BookingInsightsClientProps) {
  const [auditState, setAuditState] = useState<AuditState>("idle");
  const [findings, setFindings] = useState<AuditFinding[]>([]);
  const [mainTab, setMainTab] = useState<MainTab>("ledger");
  const findingsByType = TYPE_SECTIONS.map((section) => ({
    ...section,
    items: findings.filter((finding) => finding.type === section.type),
  })).filter((section) => section.items.length > 0);

  async function handleRunAudit() {
    try {
      setAuditState("running");

      const detected = detectAnomalyFindings(bookings);
      if (detected.length === 0) {
        setFindings([]);
        setAuditState("completed");
        setMainTab("anomalies");
        return;
      }

      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ findings: detected.slice(0, 40) }),
      });

      if (!response.ok) {
        setFindings(
          detected.map((finding) => ({
            ...finding,
            aiExplanation: undefined,
          })),
        );
        setAuditState("completed");
        setMainTab("anomalies");
        return;
      }

      const payload = (await response.json()) as {
        explanations?: Record<string, string>;
        source?: "ai" | "ai_unavailable";
        error?: string;
      };
      const explanations = payload.explanations ?? {};

      setFindings(
        detected.map((finding) => ({
          ...finding,
          aiExplanation: explanations[finding.id],
        })),
      );

      setAuditState("completed");
      setMainTab("anomalies");
    } catch {
      setAuditState("error");
      setMainTab("anomalies");
    }
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,oklch(0.95_0.015_220)_0%,oklch(1_0_0)_42%)] text-slate-900">
      <main className="mx-auto flex w-full max-w-[1240px] flex-col gap-7 px-4 py-8 md:px-8 md:py-12">
        <header className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-950 md:text-3xl">
            Booking Insights
          </h1>
          <Button
            onClick={handleRunAudit}
            disabled={auditState === "running"}
            className="h-10 rounded-full bg-slate-950 px-5 text-xs font-semibold uppercase tracking-[0.14em] text-white shadow-sm hover:bg-slate-800 focus-visible:ring-slate-400"
          >
            {auditState === "running" ? "Running..." : "Run Audit"}
          </Button>
        </header>

        <section className="grid grid-cols-1 gap-4 md:grid-cols-4">
          <StatCard title="Posting Lines" value={stats.totalLines.toLocaleString()} />
          <StatCard title="Documents" value={stats.uniqueDocuments.toLocaleString()} />
          <StatCard title="G/L Accounts" value={stats.glAccounts.toLocaleString()} />
          <StatCard
            title="Date Span"
            value={`${formatDate(stats.dateRange.from)} - ${formatDate(stats.dateRange.to)}`}
          />
        </section>

        <section className="rounded-3xl border border-slate-300 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 pt-5">
            <div className="mb-4 inline-flex rounded-lg border border-slate-300 bg-slate-50 p-1">
              <button
                type="button"
                onClick={() => setMainTab("ledger")}
                className={[
                  "rounded-md px-3 py-1.5 text-xs font-semibold",
                  mainTab === "ledger"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100",
                ].join(" ")}
              >
                Ledger
              </button>
              <button
                type="button"
                onClick={() => setMainTab("anomalies")}
                className={[
                  "rounded-md px-3 py-1.5 text-xs font-semibold",
                  mainTab === "anomalies"
                    ? "bg-slate-900 text-white"
                    : "text-slate-700 hover:bg-slate-100",
                ].join(" ")}
              >
                Anomalies
              </button>
              <span className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-400">
                Duplicates
              </span>
              <span className="rounded-md px-3 py-1.5 text-xs font-semibold text-slate-400">
                Booking Manual
              </span>
            </div>
          </div>

          <div className="p-5">
            {mainTab === "ledger" && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-800">
                    Ledger Table
                  </h2>
                  <p className="text-xs font-medium text-slate-700">Full posting dataset</p>
                </div>
                <DataTable columns={columns} data={bookings} />
              </div>
            )}

            {mainTab === "anomalies" && (
              <div>
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-slate-800">
                    Anomalies
                  </h2>
                  <p className="text-xs font-medium text-slate-700">
                    {auditState === "idle" && "Run audit to generate anomalies"}
                    {auditState === "running" && "Analyzing booking texts..."}
                    {auditState === "completed" && `${findings.length} findings`}
                    {auditState === "error" && "Audit failed"}
                  </p>
                </div>

                {auditState === "idle" && (
                  <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
                    Click <span className="font-semibold">Run Audit</span> to generate anomaly findings.
                  </div>
                )}

                {auditState === "running" && (
                  <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                    Analyzing booking texts and preparing anomaly cards...
                  </div>
                )}

                {auditState === "error" && (
                  <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800">
                    Audit failed. Please retry.
                  </div>
                )}

                {auditState === "completed" && findings.length === 0 && (
                  <div className="rounded-xl border border-slate-300 bg-slate-50 p-4 text-sm text-slate-700">
                    No suspicious booking-text anomalies were detected.
                  </div>
                )}

                {auditState === "completed" && findings.length > 0 && (
                  <div className="space-y-5">
                    {findingsByType.map((section) => (
                      <div key={section.type} className="space-y-3">
                        <h3 className="text-xs font-semibold uppercase tracking-[0.12em] text-slate-600">
                          {section.label}
                        </h3>
                        {section.items.map((finding) => {
                          return (
                            <div
                              key={finding.id}
                              className="rounded-xl border border-slate-300 p-4"
                            >
                              <div className="mb-2 flex flex-wrap items-center gap-2">
                                <div className="flex flex-wrap items-center gap-2">
                                  <Badge
                                    variant="outline"
                                    className="border-slate-300 bg-slate-100 text-slate-800"
                                  >
                                    {TYPE_LABELS[finding.type]}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className="border-slate-300 bg-white text-slate-700"
                                  >
                                    AI explanation
                                  </Badge>
                                </div>
                              </div>
                              <p className="text-sm font-medium text-slate-800">
                                {finding.aiExplanation ?? "AI explanation unavailable."}
                              </p>
                              <p className="mt-2 text-xs text-slate-600">
                                Document IDs: {finding.documentIds.join(", ")}
                              </p>

                              <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
                                <div className="space-y-2">
                                  {finding.sampleRows.map((row) => (
                                    <div
                                      key={`${row.document_id}-${row.line_id}`}
                                      className="grid grid-cols-[120px_100px_1fr_130px] items-center gap-2 text-xs"
                                    >
                                      <span className="font-mono font-semibold text-slate-800">
                                        {row.document_id}/{row.line_id}
                                      </span>
                                      <span className="text-slate-700">{formatDate(row.posting_date)}</span>
                                      <span className="truncate text-slate-800">
                                        {row.gl_account} | {row.booking_text}
                                      </span>
                                      <span className="text-right font-semibold text-slate-900">
                                        {formatCurrency(row.amount, "EUR")}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card className="gap-2 rounded-2xl border border-slate-300 bg-white py-3 shadow-sm">
      <CardHeader className="px-4 pb-0">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-700">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-xl font-semibold tracking-tight text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}
