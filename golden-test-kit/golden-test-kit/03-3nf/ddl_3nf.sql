-- =========================================================
-- Golden Dataset PDM — 3NF Style
-- Target platform: ANSI SQL (Snowflake/Postgres-compatible)
-- =========================================================

CREATE TABLE customer (
    customer_key        BIGINT        NOT NULL,   -- surrogate PK
    customer_source_id  VARCHAR(20)   NOT NULL,    -- source system natural key retained
    full_name           VARCHAR(200)  NOT NULL,
    email                VARCHAR(255)  NOT NULL,
    phone                VARCHAR(30)   NULL,        -- 20% null observed in source (Stage 1 profiling)
    region               VARCHAR(50)   NULL,
    loyalty_segment      VARCHAR(20)   NULL,
    credit_limit         DECIMAL(12,2) NULL,
    CONSTRAINT pk_customer PRIMARY KEY (customer_key),
    CONSTRAINT uq_customer_email UNIQUE (email)
);

CREATE TABLE product (
    product_key         BIGINT        NOT NULL,
    product_source_id   VARCHAR(20)   NOT NULL,
    product_name         VARCHAR(200)  NOT NULL,
    category             VARCHAR(100)  NULL,
    unit_price           DECIMAL(12,2) NOT NULL,
    active_flag          CHAR(1)       NOT NULL DEFAULT 'Y',
    CONSTRAINT pk_product PRIMARY KEY (product_key)
);

CREATE TABLE "order" (
    order_key            BIGINT        NOT NULL,
    order_source_id      VARCHAR(20)   NOT NULL,
    customer_key         BIGINT        NOT NULL,
    order_date           DATE          NOT NULL,
    status                VARCHAR(20)   NOT NULL,
    total_amt             DECIMAL(12,2) NOT NULL,   -- zero-value allowed, confirmed at Gate 1 (Cancelled orders)
    CONSTRAINT pk_order PRIMARY KEY (order_key),
    CONSTRAINT fk_order_customer FOREIGN KEY (customer_key) REFERENCES customer (customer_key)
);

CREATE TABLE order_line (
    order_line_key        BIGINT        NOT NULL,
    order_key              BIGINT        NOT NULL,
    line_no                 INT           NOT NULL,
    product_key             BIGINT        NOT NULL,
    qty                      INT           NOT NULL,
    unit_price_at_sale       DECIMAL(12,2) NOT NULL,  -- captured at transaction time, not derived from product.unit_price
    CONSTRAINT pk_order_line PRIMARY KEY (order_line_key),
    CONSTRAINT fk_orderline_order FOREIGN KEY (order_key) REFERENCES "order" (order_key),
    CONSTRAINT fk_orderline_product FOREIGN KEY (product_key) REFERENCES product (product_key),
    CONSTRAINT uq_order_line UNIQUE (order_key, line_no)
);

CREATE INDEX ix_order_customer ON "order" (customer_key);
CREATE INDEX ix_orderline_order ON order_line (order_key);
CREATE INDEX ix_orderline_product ON order_line (product_key);

-- Expected row counts after load (see expected-output.md):
-- customer: 6 | order: 5 | order_line: 7 | product: 4
