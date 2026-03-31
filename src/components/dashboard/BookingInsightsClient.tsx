"use client";

import { Booking } from "@/types";
import { columns } from "@/components/dashboard/columns";
import { DataTable } from "@/components/dashboard/DataTable";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/utils/formatters";
import type { DashboardStats } from "@/lib/booking-insights";

interface BookingInsightsClientProps {
  bookings: Booking[];
  stats: DashboardStats;
}

export function BookingInsightsClient({
  bookings,
  stats,
}: BookingInsightsClientProps) {
  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,oklch(0.97_0.01_220)_0%,oklch(1_0_0)_45%)] text-slate-900">
      <main className="mx-auto flex w-full max-w-[1200px] flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
        <header className="pt-2">
          <h1 className="text-2xl font-semibold tracking-[-0.03em] text-slate-900 md:text-3xl">
            Booking Insights
          </h1>
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

        <section className="rounded-3xl border border-slate-200 bg-white p-4 shadow-sm md:p-5">
          <DataTable columns={columns} data={bookings} />
        </section>
      </main>
    </div>
  );
}

function StatCard({ title, value }: { title: string; value: string }) {
  return (
    <Card className="gap-2 rounded-2xl border border-slate-200 bg-white py-3 shadow-sm">
      <CardHeader className="px-4 pb-0">
        <CardTitle className="text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4">
        <p className="text-xl font-semibold tracking-tight text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}
