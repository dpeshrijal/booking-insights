# Booking Insights

Mini Next.js app to analyze accounting journal entries and spot suspicious bookings quickly.

## Scope (current)

- Task 0: synthetic SAP-like booking data model + generator script
- Task 1: production-style mini dashboard UI for booking exploration

## Stack

- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS + shadcn/ui primitives
- TanStack Table

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Data generation

Generator script:

```bash
node scripts/generate-data.js
```

Output file:

- `src/data/bookings.json`

### Data assumptions

- One company code (`1000`) and one currency (`EUR`) for MVP focus.
- Debit/credit represented as `S` and `H` (SAP-style).
- Document numbers are synthetic and sequential.
- P&L postings are balanced against `100000` bank clearing account.
- Tax codes are simplified (`V0`, `V1`, `V2`, `A0`) and not jurisdiction-specific.

## Task 0 validation checklist

- 200-800 lines
- 2+ lines per document
- Document-level balance = 0
- 20-40 distinct G/L accounts
- Date span across roughly 2 months
- Includes intentionally suspicious records:
  - typo / near-duplicate texts
  - duplicate-like postings in short time window
  - unusual account + text combination

## Architecture notes (Task 1)

- `src/app/page.tsx`: server component entrypoint that loads data and computes summary stats.
- `src/components/dashboard/BookingInsightsClient.tsx`: client layer for search/filter interactions.
- `src/components/dashboard/DataTable.tsx`: reusable typed table with sorting + pagination.
- `src/lib/booking-insights.ts`: pure aggregation helpers.
- `src/components/dashboard/columns.tsx`: explicit, typed accounting-centric table columns.

## UX choices

- Minimal, high-contrast desktop-first layout with strong visual hierarchy.
- Fast scan cards for lines/docs/accounts/date span.
- Operator workflow controls on top: quick search + cost center chips.
- Dense but readable ledger table with sortable headers and page-size control.

## Intentionally out of scope for this stage

- Real backend/database
- Authentication/authorization
- Multi-company normalization
- Feature logic for anomaly scoring (Task 2)

## Next steps

- Implement Task 2 heuristics in isolated modules:
  - text similarity anomaly detector
  - duplicate booking detector
  - rule/manual suggestion engine
- Add unit tests around data quality and heuristic confidence scoring.
- Add short Loom walkthrough and feature-by-feature PR history.
