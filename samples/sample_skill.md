# Performance Tuning Skill
- Always ensure large FACT tables are partitioned by date (e.g. `order_date`, `tx_date`).
- Ensure DIMENSION tables have clustering keys on frequently joined columns (e.g. `customer_id`).
- When generating DDL, include `PARTITION BY` and `CLUSTER BY` clauses where appropriate.
- Avoid using `SELECT *`, always specify column names explicitly in any generated views or queries.
- Suggest materialized views for complex aggregations that are queried frequently.
