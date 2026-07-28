-- =========================================================
-- Golden Dataset PDM — Canonical / Hybrid Style
-- Target platform: ANSI SQL (Snowflake/Postgres-compatible)
-- =========================================================

-- ===================== HISTORIZED: CUSTOMER =====================

CREATE TABLE customer (
    customer_version_key   BIGINT        NOT NULL,   -- surrogate, one row per version
    customer_bk             VARCHAR(255)  NOT NULL,   -- durable business key = email
    full_name                 VARCHAR(200)  NOT NULL,
    email                        VARCHAR(255)  NOT NULL,
    phone                          VARCHAR(30)   NULL,
    region                           VARCHAR(50)   NULL,
    loyalty_segment                    VARCHAR(20)   NULL,
    credit_limit                          DECIMAL(12,2) NULL,
    effective_start_date                     DATE          NOT NULL,
    effective_end_date                          DATE          NULL,      -- NULL/open = current
    is_current_flag                                BOOLEAN       NOT NULL DEFAULT TRUE,
    CONSTRAINT pk_customer PRIMARY KEY (customer_version_key)
);

CREATE INDEX ix_customer_bk_current ON customer (customer_bk, is_current_flag);

CREATE VIEW vw_customer_current AS
SELECT * FROM customer WHERE is_current_flag = TRUE;

-- ===================== HISTORIZED: PRODUCT =====================

CREATE TABLE product (
    product_version_key    BIGINT        NOT NULL,
    product_bk               VARCHAR(20)   NOT NULL,   -- durable business key = product_source_id
    product_name                VARCHAR(200)  NOT NULL,
    category                       VARCHAR(100)  NULL,
    unit_price                        DECIMAL(12,2) NOT NULL,
    active_flag                          CHAR(1)       NOT NULL,
    effective_start_date                    DATE          NOT NULL,
    effective_end_date                         DATE          NULL,
    is_current_flag                               BOOLEAN       NOT NULL DEFAULT TRUE,
    CONSTRAINT pk_product PRIMARY KEY (product_version_key)
);

CREATE INDEX ix_product_bk_current ON product (product_bk, is_current_flag);

CREATE VIEW vw_product_current AS
SELECT * FROM product WHERE is_current_flag = TRUE;

-- ===================== STABLE: ORDER =====================

CREATE TABLE "order" (
    order_key              BIGINT        NOT NULL,
    order_source_id          VARCHAR(20)   NOT NULL,
    customer_bk_ref             VARCHAR(255)  NOT NULL,  -- resolves as-of order_date via vw_customer_current or PIT logic
    order_date                     DATE          NOT NULL,
    status                            VARCHAR(20)   NOT NULL,
    total_amt                           DECIMAL(12,2) NOT NULL,
    CONSTRAINT pk_order PRIMARY KEY (order_key),
    CONSTRAINT fk_order_customer FOREIGN KEY (customer_bk_ref) REFERENCES customer (customer_bk)
);

-- ===================== STABLE: ORDER_LINE =====================

CREATE TABLE order_line (
    order_line_key          BIGINT        NOT NULL,
    order_key                  BIGINT        NOT NULL,
    line_no                        INT           NOT NULL,
    product_bk_ref                   VARCHAR(20)   NOT NULL,  -- resolves as-of order_date
    qty                                  INT           NOT NULL,
    unit_price_at_sale                      DECIMAL(12,2) NOT NULL,
    CONSTRAINT pk_order_line PRIMARY KEY (order_line_key),
    CONSTRAINT fk_orderline_order FOREIGN KEY (order_key) REFERENCES "order" (order_key),
    CONSTRAINT fk_orderline_product FOREIGN KEY (product_bk_ref) REFERENCES product (product_bk),
    CONSTRAINT uq_order_line UNIQUE (order_key, line_no)
);

CREATE INDEX ix_order_customer ON "order" (customer_bk_ref);
CREATE INDEX ix_orderline_order ON order_line (order_key);
CREATE INDEX ix_orderline_product ON order_line (product_bk_ref);

-- Expected row counts after both product loads (see expected-output.md):
-- customer: 6 (all current, no second version in this golden set) | product: 6 (P-01 x2, P-04 x2, P-02 x1, P-03 x1)
-- vw_product_current: 4 | order: 5 | order_line: 7
