-- =========================================================
-- Golden Dataset PDM — Data Vault 2.0 Style
-- Target platform: ANSI SQL (Snowflake/Postgres-compatible)
-- Hash algorithm: SHA-256, hex-encoded (CHAR(64))
-- =========================================================

-- ===================== HUBS =====================

CREATE TABLE hub_customer (
    customer_hk      CHAR(64)     NOT NULL,   -- SHA256(UPPER(TRIM(email)))
    email            VARCHAR(255) NOT NULL,
    load_date        TIMESTAMP    NOT NULL,
    record_source    VARCHAR(50)  NOT NULL,
    CONSTRAINT pk_hub_customer PRIMARY KEY (customer_hk)
);

CREATE TABLE hub_order (
    order_hk         CHAR(64)     NOT NULL,   -- SHA256(UPPER(TRIM(order_source_id)))
    order_source_id  VARCHAR(20)  NOT NULL,
    load_date        TIMESTAMP    NOT NULL,
    record_source    VARCHAR(50)  NOT NULL,
    CONSTRAINT pk_hub_order PRIMARY KEY (order_hk)
);

CREATE TABLE hub_product (
    product_hk         CHAR(64)     NOT NULL, -- SHA256(UPPER(TRIM(product_source_id)))
    product_source_id  VARCHAR(20)  NOT NULL,
    load_date          TIMESTAMP    NOT NULL,
    record_source      VARCHAR(50)  NOT NULL,
    CONSTRAINT pk_hub_product PRIMARY KEY (product_hk)
);

-- ===================== LINKS =====================

CREATE TABLE lnk_customer_order (
    customer_order_hk CHAR(64)  NOT NULL,   -- SHA256(customer_hk || '|' || order_hk)
    customer_hk        CHAR(64)  NOT NULL,
    order_hk            CHAR(64)  NOT NULL,
    load_date            TIMESTAMP NOT NULL,
    record_source         VARCHAR(50) NOT NULL,
    CONSTRAINT pk_lnk_customer_order PRIMARY KEY (customer_order_hk),
    CONSTRAINT fk_lco_customer FOREIGN KEY (customer_hk) REFERENCES hub_customer (customer_hk),
    CONSTRAINT fk_lco_order FOREIGN KEY (order_hk) REFERENCES hub_order (order_hk)
);

CREATE TABLE lnk_order_product (
    order_product_hk CHAR(64)  NOT NULL,    -- SHA256(order_hk || '|' || product_hk || '|' || line_no)
    order_hk           CHAR(64)  NOT NULL,
    product_hk           CHAR(64)  NOT NULL,
    line_no                INT       NOT NULL,
    load_date               TIMESTAMP NOT NULL,
    record_source            VARCHAR(50) NOT NULL,
    CONSTRAINT pk_lnk_order_product PRIMARY KEY (order_product_hk),
    CONSTRAINT fk_lop_order FOREIGN KEY (order_hk) REFERENCES hub_order (order_hk),
    CONSTRAINT fk_lop_product FOREIGN KEY (product_hk) REFERENCES hub_product (product_hk)
);

-- Same-As Link: records the CRM/ERP identity-resolution decision explicitly
CREATE TABLE lnk_same_as_customer (
    same_as_hk       CHAR(64)  NOT NULL,     -- SHA256(customer_hk_1 || '|' || customer_hk_2)
    customer_hk_1      CHAR(64)  NOT NULL,
    customer_hk_2        CHAR(64)  NOT NULL,
    load_date              TIMESTAMP NOT NULL,
    record_source            VARCHAR(50) NOT NULL,
    CONSTRAINT pk_lnk_same_as_customer PRIMARY KEY (same_as_hk)
);

-- ===================== SATELLITES =====================

CREATE TABLE sat_customer_crm (
    customer_hk      CHAR(64)     NOT NULL,
    load_date        TIMESTAMP    NOT NULL,
    load_end_date    TIMESTAMP    NULL,
    hash_diff         CHAR(64)     NOT NULL,
    full_name          VARCHAR(200) NOT NULL,
    phone               VARCHAR(30)  NULL,
    signup_date          DATE         NOT NULL,
    loyalty_segment       VARCHAR(20)  NULL,
    record_source          VARCHAR(50)  NOT NULL,
    CONSTRAINT pk_sat_customer_crm PRIMARY KEY (customer_hk, load_date),
    CONSTRAINT fk_sc_crm_customer FOREIGN KEY (customer_hk) REFERENCES hub_customer (customer_hk)
);

CREATE TABLE sat_customer_erp (
    customer_hk      CHAR(64)     NOT NULL,
    load_date        TIMESTAMP    NOT NULL,
    load_end_date    TIMESTAMP    NULL,
    hash_diff         CHAR(64)     NOT NULL,
    cust_name          VARCHAR(200) NOT NULL,
    region              VARCHAR(50)  NULL,
    credit_limit          DECIMAL(12,2) NULL,
    record_source            VARCHAR(50)  NOT NULL,
    CONSTRAINT pk_sat_customer_erp PRIMARY KEY (customer_hk, load_date),
    CONSTRAINT fk_sc_erp_customer FOREIGN KEY (customer_hk) REFERENCES hub_customer (customer_hk)
);

CREATE TABLE sat_order_detail (
    order_hk         CHAR(64)     NOT NULL,
    load_date        TIMESTAMP    NOT NULL,
    load_end_date    TIMESTAMP    NULL,
    hash_diff         CHAR(64)     NOT NULL,
    order_date          DATE          NOT NULL,
    status                VARCHAR(20)   NOT NULL,
    total_amt               DECIMAL(12,2) NOT NULL,
    record_source              VARCHAR(50)  NOT NULL,
    CONSTRAINT pk_sat_order_detail PRIMARY KEY (order_hk, load_date),
    CONSTRAINT fk_sod_order FOREIGN KEY (order_hk) REFERENCES hub_order (order_hk)
);

CREATE TABLE sat_order_line_detail (
    order_product_hk CHAR(64)     NOT NULL,
    load_date        TIMESTAMP    NOT NULL,
    load_end_date    TIMESTAMP    NULL,
    hash_diff         CHAR(64)     NOT NULL,
    qty                 INT           NOT NULL,
    unit_price_at_sale     DECIMAL(12,2) NOT NULL,
    record_source              VARCHAR(50)  NOT NULL,
    CONSTRAINT pk_sat_order_line_detail PRIMARY KEY (order_product_hk, load_date),
    CONSTRAINT fk_sold_link FOREIGN KEY (order_product_hk) REFERENCES lnk_order_product (order_product_hk)
);

CREATE TABLE sat_product_detail (
    product_hk       CHAR(64)     NOT NULL,
    load_date        TIMESTAMP    NOT NULL,
    load_end_date    TIMESTAMP    NULL,
    hash_diff         CHAR(64)     NOT NULL,
    product_name        VARCHAR(200)  NOT NULL,
    category              VARCHAR(100)  NULL,
    unit_price               DECIMAL(12,2) NOT NULL,
    active_flag                 CHAR(1)       NOT NULL,
    record_source                  VARCHAR(50)  NOT NULL,
    CONSTRAINT pk_sat_product_detail PRIMARY KEY (product_hk, load_date),
    CONSTRAINT fk_spd_product FOREIGN KEY (product_hk) REFERENCES hub_product (product_hk)
);

CREATE INDEX ix_sat_product_detail_hk ON sat_product_detail (product_hk);

-- Expected row counts after both product loads (see expected-output.md):
-- hub_customer: 6 | hub_order: 5 | hub_product: 4
-- sat_customer_crm: 5 | sat_customer_erp: 4 | sat_order_detail: 5 | sat_order_line_detail: 7
-- sat_product_detail: 6  (P-01 x2, P-04 x2, P-02 x1, P-03 x1 — hash_diff dedup on P-02/P-03)
