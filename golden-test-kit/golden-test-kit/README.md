# Golden Test Kit — Silver Layer Assisted Data Modeling

A single golden dataset run through all 4 pipeline stages, in all 3 supported LDM/PDM styles, so you can regression-test each SKILL.md agent against a known-correct expected output.

## Why this dataset
It's small (6 source files, ~30 rows total) but deliberately exercises every sub-agent behavior that matters:

| Test target | Where it's exercised |
|---|---|
| Identity resolution / dedup across sources | `crm_customers.csv` vs `erp_customers.csv` — 3 matching customers, 2 CRM-only, 1 ERP-only |
| PII/sensitivity classification | email, phone on Customer |
| Null handling in profiling & constraint derivation | `crm_customers.csv` — C1003 has blank phone |
| N:M relationship via associative entity | Order ↔ Product via Order Line |
| Point-in-time fact vs. mutable dimension | `order_lines.unit_price` (frozen at sale) vs `products.unit_price` (changes) |
| Attribute-level change detection / historization | `products_load1...csv` → `products_load2...csv`: P-01 price change, P-04 active_flag change; P-02/P-03 unchanged (tests that unchanged rows do NOT spawn a new version/satellite row) |
| Business-rule edge case | O-5004: Cancelled order with total_amt = 0.00 |

## Folder structure
```
golden-dataset/                     <- raw source files, feed these to Stage 1
01-source-analysis/expected-output.md
02-conceptual-model/expected-output.md
03-3nf/expected-output.md + ddl_3nf.sql
04-datavault/expected-output.md + ddl_datavault.sql
05-canonical/expected-output.md + ddl_canonical.sql
```

## How to use this for testing
1. Feed `golden-dataset/*.csv` into `01-source-analysis-agent.md`. Diff its output against `01-source-analysis/expected-output.md` — check especially that it **flags** (does not silently resolve) the 3 identity-resolution decisions.
2. Approve Gate 1 with the assumed decisions documented in `02-conceptual-model/expected-output.md`, run `02-conceptual-data-model-agent.md`, diff output.
3. At Gate 2, select a style and run the matching Stage 3 + 4 agents; diff against the corresponding folder (`03-3nf`, `04-datavault`, or `05-canonical`).
4. Row-count checks at the bottom of each style's `expected-output.md` are the fastest smoke test — if those don't match, there's a logic defect before you even need to check column-level correctness.

## Known limitation of this golden set (by design, keep it small)
- No genuinely ambiguous clustering case (every table clusters unambiguously) — if you need to test the `ambiguous[]` output path, add a table that plausibly belongs to two subject areas.
- Only one historization event captured for Customer's own attributes (none, in fact — Customer versioning logic is structurally present in the Canonical PDM but not exercised by this dataset alone). To fully test Customer SCD behavior, add `crm_customers_load2.csv` with a changed `loyalty_segment` for at least one customer, mirroring the Product load1/load2 pattern.
