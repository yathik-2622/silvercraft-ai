# Expected Output — Stage 2: Conceptual Data Model Agent
### Golden Dataset: Retail Sales (CRM + ERP)

Input: the approved `SourceAnalysisReport` from Stage 1 (with all 3 flags resolved by the human reviewer as follows — assume Gate 1 reviewer decisions: (1) confirmed the 3 identity matches, kept the 2 CRM-only + 1 ERP-only as distinct customers → **6 total customers**; (2) confirmed zero-amount cancelled order is valid; (3) confirmed product changes should be historized).

---
## Entities

| Entity | Definition | Subject Area | Key Business Attributes | Source Lineage |
|---|---|---|---|---|
| **Customer** | A person or account that places orders | Customer | Full Name, Email, Loyalty Segment | crm_customers, erp_customers (merged, 6 unique customers) |
| **Order** | A single purchase transaction placed by a Customer | Order | Order Date, Status, Total Amount | orders |
| **Order Line** | An individual product/quantity entry within an Order | Order | Quantity, Unit Price (at time of sale) | order_lines |
| **Product** | An item available for sale | Product | Product Name, Category, Current Unit Price, Active Flag | products |

## Conceptual Relationships

| From | Verb Phrase | To | Cardinality | Optionality |
|---|---|---|---|---|
| Customer | places | Order | 1 Customer : 0..N Orders | Order mandatory-to-Customer, Customer optional-to-Order (a customer may have zero orders, e.g. E-006 has one, others could have none) |
| Order | contains | Order Line | 1 Order : 1..N Order Lines | mandatory both sides |
| Product | is ordered via | Order Line | 1 Product : 0..N Order Lines | Order Line mandatory-to-Product, Product optional-to-Order Line |

Note: the **Customer–Order–Product** many-to-many (a Customer conceptually buys many Products, a Product is bought by many Customers) is intentionally **not** modeled directly — it is correctly mediated through the Order Line associative concept, which is retained as its own entity rather than collapsed, because it carries its own attributes (quantity, price-at-sale).

## Subject Area Diagram
```
Sales (sub-domain)
├── Customer subject area:  [Customer]
├── Order subject area:     [Order] ──contains──> [Order Line]
└── Product subject area:   [Product]
```

## Style Recommendation (advisory, from Stage 2)
- **Signal**: Product shows attribute-level change over time (price, active_flag) — a genuine historization need on one entity only.
- **Signal**: Customer identity resolution across 2 sources was required and partially ambiguous — moderate source volatility/integration complexity, but small source count (2).
- **Signal**: Order / Order Line are append-only transactional facts — no update pattern observed.
- **Recommendation**: **Canonical/Hybrid** — Product (and arguably Customer, if regulatory PII retention requires audit trail) as `historized`; Order/Order Line as `stable`. Confidence: Medium — dataset is small enough that either Data Vault or Canonical could be justified; this golden set is intentionally built to make all three styles instructive to compare (see LDM/PDM walkthroughs for 3NF and Data Vault as well).

## Flags carried forward
- Confirm at Gate 2: should **Customer** also be historized (region/segment could plausibly change), or does Product alone justify the historization need? (Golden-set answer used in the walkthroughs: **Customer = historized, Product = historized, Order/Order Line = stable** — this maximizes test coverage of the Canonical style's mixed pattern.)
