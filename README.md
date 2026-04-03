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

1. `perf(duplicates): memoize normalized text + bigram counts` 
2. `test: add vitest coverage for anomalies, duplicates, booking manual`

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
