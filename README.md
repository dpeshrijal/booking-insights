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

## Task 2 output (self‑review)

**Short list of 3 features chosen**
1. Anomaly / typo / near‑duplicate detection (2.1)
2. Duplicate booking detection (2.2)
3. Booking manual / rule suggestions (2.3)

**Per feature: what / why / trade‑off**
1. **Anomaly / typo / near‑duplicate (2.1)**  
   What: flags suspicious booking texts (typos, unusual patterns, near‑duplicates) with concise explanations and evidence rows.  
   Why: helps auditors quickly spot data‑quality issues without needing a full duplicate‑matching workflow.  
   Trade‑off: heuristic thresholds can miss subtle anomalies or flag benign variations.
2. **Duplicate booking detection (2.2)**  
   What: heuristic clustering by amount, similar text, short date gap, same partner, and account overlap with confidence/criteria.  
   Why: identifies likely duplicate postings without requiring a full ledger reconciliation engine.  
   Trade‑off: may miss duplicates that have been partially corrected or posted under different accounts.
3. **Booking manual / rule suggestions (2.3)**  
   What: derives 5–10 “posting rules” from historical patterns (tax codes, cost centers, partner↔GL usage) with evidence.  
   Why: provides guardrails and consistency guidance for future postings.  
   Trade‑off: rules are data‑dependent and can overfit to current period behavior.

**Five review findings (concrete improvements)**
1. Performance: memoize normalized text and bigram maps for duplicate similarity (reduces repeated CPU work).
2. Testing: add focused unit tests for anomalies, duplicates, and booking manual rules.
3. DX: extract reusable detection utilities into feature‑scoped modules for clarity and future features.
4. Reliability: add stricter data validation in the generator for balanced documents and schema coverage.
5. UX: tighten findings layouts (clearer labels, evidence rows, and deterministic explanations).

**PRs/commits implementing 2 fixes**
1. `perf(duplicates): memoize normalized text + bigram counts` (commit/PR id: fill before submit)
2. `test: add vitest coverage for anomalies, duplicates, booking manual` (commit/PR id: fill before submit)

## Task 3 (Context engineering / knowledge graph sketch)

- **Connected context sources (what we ingest and why)**:  
  - CRM (Salesforce/HubSpot) for deal notes, negotiated discounts, and approval justifications tied to customer accounts.  
  - Data dictionary / BI repo (dbt/Looker) for KPI definitions, SQL transformations, metric lineage, and ownership.  
  - Document repositories (SharePoint/Ironclad) for MSAs, travel/expense SOPs, and corporate policies that govern posting behavior.  
  - Ticketing/comms (Jira/Slack/email) for exception requests, approvals, and audit trails that explain “why” decisions were made.
- **Core entities (the graph schema)**: KPI, Definition, Owner, Query/Transformation, Approval, Policy, Document, Vendor/Customer, Exception. Each entity is versioned and linked to `effective_date` so we can answer “as of when?”
- **Key relations (how we prevent hallucinations)**:  
  - `Customer → HAS_TERMS_IN → Contract` to explain pricing/discount logic.  
  - `BookingLine → SUBJECT_TO → Policy` to explain why a posting is valid/invalid.  
  - `Discount/Exception → APPROVED_BY → Employee` to show who approved a deviation.  
  - `KPI → DEFINED_BY → Query/dbt_model → OWNED_BY → Data Engineer` to explain calculations and ownership.
- **Retrieval strategy (hybrid, evidence-first)**:  
  - Use an LLM router to classify the question.  
  - Relational questions (“Who approved this discount?”) run graph queries (Cypher/SQL).  
  - Semantic questions (“What is the travel policy?”) run vector search over chunked policies/SOPs.  
  - Results are merged, ranked by recency + approval status + relevance, and fed to the answer generator.
- **Answering flow (what the user sees)**:  
  - The model can only answer from retrieved nodes/chunks.  
  - The UI shows the answer plus citations (policy section IDs, CRM note IDs, approval IDs, query IDs).  
  - If evidence is missing, the system says so and suggests what data is needed.
- **Risk #1 – context staleness**:  
  - **Risk**: a KPI or policy changes, but the graph still serves the old version.  
  - **Mitigation**: event‑driven updates (webhooks from repo/CRM), strict versioning, and `last_modified` metadata in every node and vector chunk.
- **Risk #2 – false edge hallucination**:  
  - **Risk**: vector similarity links a discount approval for Client A to a booking for Client B.  
  - **Mitigation**: enforce deterministic keys for transactional edges (customer ID, doc ID, approval ID). Vector search is only used for global text (policies, SOPs), not for transactional ownership.

## Intentionally out of scope for this stage

- Real backend/database
- Authentication/authorization
- Multi-company normalization

## Next steps

- Task 2.2 duplicate booking detection
- Task 2.3 booking manual / rule suggestions
- Add dedicated unit + API + UI tests for Task 2.1
