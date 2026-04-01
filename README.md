# Booking Insights

Mini Next.js app to analyze accounting journal entries and spot suspicious bookings quickly.

## Scope (current)

- Task 0: synthetic SAP-like booking data model + generator script
- Task 1: production-style mini dashboard UI for booking exploration
- Task 2.1: anomaly / typo / near-duplicate audit workflow (precision-first)

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

## Task 2.1 (Anomaly / typo / near-duplicate)

- Manual trigger via `Run Audit` button
- Deterministic local detection in `src/lib/anomaly-detection.ts`
- Optional AI explanation overlay via `POST /api/audit`
- Findings panel with evidence docs + table row highlighting

### Azure Foundry configuration (optional)

Set these env vars if you want AI explanations:

```bash
AZURE_OPENAI_ENDPOINT=...
AZURE_OPENAI_KEY=...
AZURE_OPENAI_API_VERSION=...
AZURE_OPENAI_CHAT_DEPLOYMENT=...
```

Without these, the app still works with deterministic local explanations.

## Intentionally out of scope for this stage

- Real backend/database
- Authentication/authorization
- Multi-company normalization

## Next steps

- Task 2.2 duplicate booking detection
- Task 2.3 booking manual / rule suggestions
- Add dedicated unit + API + UI tests for Task 2.1
