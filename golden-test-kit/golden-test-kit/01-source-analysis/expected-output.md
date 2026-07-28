# Expected Output — Stage 1: Source Analysis Agent
### Golden Dataset: Retail Sales (CRM + ERP), 6 source files

This is the reference `SourceAnalysisReport` a correctly-functioning Source Analysis Agent should converge on when fed the files in `/golden-dataset`. Use it to grade agent output — exact wording will vary, but conclusions/flags should match.

---
## 1. Profiling (representative excerpts)

| Table | Attribute | Type | Null% | Distinct | Notes |
|---|---|---|---|---|---|
| crm_customers | phone | string | 20% (1/5 blank: C1003) | 4/5 | pattern `+91-XXXXX-XXXXX`, 1 anomaly (missing) |
| crm_customers | email | string | 0% | 5/5 unique | pattern matches email regex 100% |
| erp_customers | credit_limit | numeric | 0% | 4/4 | range 15,000–50,000 |
| orders | total_amt | numeric | 0% | — | one zero-value row (O-5004, status=Cancelled) — flag: verify zero-amount business rule vs. data issue |
| order_lines | unit_price | numeric | 0% | — | O-5003 unit_price (780.00) for P-01 differs from both product load snapshots (750.00 / 799.00) — **flag: transactional price-at-sale differs from product master, expected for point-in-time pricing, confirm with reviewer** |
| products (load1 vs load2) | unit_price | numeric | — | — | P-01 changed 750.00 → 799.00 between loads; P-04 `active_flag` changed N → Y — **flag: attribute-level change detected, candidate for historization** |

**Freshness signal**: two product loads with different `last_updated` timestamps confirm the source updates in place (not append-only) — relevant to LDM/PDM historization decisions in Stage 3/4.

## 2. Data Dictionary (excerpt, flagging the duplicate concept)

| Table.Attribute | Business Name | Definition | Confidence | Duplicate Of |
|---|---|---|---|---|
| crm_customers.cust_id | CRM Customer ID | CRM-system identifier for a customer | High | — |
| erp_customers.customer_no | ERP Customer Number | ERP-system identifier for a customer | High | **flagged as likely same concept as crm_customers.cust_id** — see Relationship Discovery §5 |
| crm_customers.full_name / erp_customers.cust_name | Customer Full Name | Customer's full legal/display name | High | same concept, two sources |
| crm_customers.email / erp_customers.email_address | Customer Email | Customer's primary email address | High | same concept, two sources — **used as the strongest match signal for identity resolution** |
| orders.total_amt | Order Total Amount | Total monetary value of the order | Medium (zero-value row unexplained) | — |
| products.unit_price | Product Unit Price | Current list price of the product | High | — |

## 3. Classification (attribute level, excerpt)

| Table.Attribute | Sensitivity | Category | Regulatory Tag | Rationale |
|---|---|---|---|---|
| crm_customers.email / erp_customers.email_address | PII | Identifier-adjacent | GDPR-relevant | direct personal identifier |
| crm_customers.phone | PII | Descriptive | GDPR-relevant | direct personal identifier |
| crm_customers.loyalty_segment | Internal | Status/Code | — | business classification, not personal-sensitive |
| erp_customers.credit_limit | Confidential | Quantitative | — | financial data, restrict to authorized roles |
| erp_customers.region | Internal | Descriptive | — | low sensitivity |
| products.* | Public/Internal | Descriptive/Quantitative | — | product catalog data, low sensitivity |

## 4. Clustering

**Subject Areas:**
- **Customer**: `crm_customers`, `erp_customers` — high confidence (0.9); clustered on naming similarity + shared email values
- **Order**: `orders`, `order_lines` — high confidence (0.95); clustered on FK pattern (`order_id`) and co-occurrence
- **Product**: `products` (both loads treated as one evolving table) — high confidence (0.9)

**Sub-domain**: `Sales` — contains Customer, Order, Product subject areas (single sub-domain is sufficient at this scale; a larger source landscape would split further).

**Ambiguous**: none at this scale — flag this as a **known limitation of a small golden set**; a real test suite should also include at least one genuinely ambiguous table to test the `ambiguous[]` output path.

## 5. Relationship Discovery

| From | To | Cardinality | Evidence | Confidence |
|---|---|---|---|---|
| erp_customers.customer_no | orders.customer_no | 1:N | declared-style (values match, consistent FK pattern) | High |
| orders.order_id | order_lines.order_id | 1:N | declared-style | High |
| order_lines.product_id | products.product_id | N:1 | declared-style | High |
| **crm_customers ↔ erp_customers** | **same real-world entity** | **identity match, not a structural FK** | inferred — email value overlap: alice.nair@example.com, rahul.mehta@example.com, sara.iqbal@example.com match across both tables | High for 3 of 5 CRM rows; **C1004 (John Peter) and C1005 (Divya Rao) have no ERP match — CRM-only customers; E-006 (Karthik) has no CRM match — ERP-only customer** — all three explicitly flagged, not auto-merged |

**Orphan/dangling key check**: none found — all `customer_no`, `order_id`, `product_id` FK values resolve.

## 6. Quality Summary
- Coverage: 100% of supplied tables profiled, dictionary'd, classified, clustered
- Low-confidence items: 1 (orders.total_amt zero-value business rule)
- Unresolved conflicts requiring Gate 1 human decision:
  1. Confirm Customer identity-resolution matches (3 confirmed matches + 2 CRM-only + 1 ERP-only)
  2. Confirm zero-amount Cancelled order is expected behavior, not a data defect
  3. Confirm product price/active_flag changes should carry forward as a historization signal into Stage 2/3

---
**This is the artifact that should be sitting behind HITL Gate 1 when testing.** A passing agent surfaces all three flags above without being told to; it should not silently auto-merge the CRM/ERP customer records.
