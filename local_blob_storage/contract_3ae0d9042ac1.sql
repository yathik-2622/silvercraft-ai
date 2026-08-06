CREATE TABLE IF NOT EXISTS customers (
    customer_id STRING NULL,
    full_name STRING NULL,
    email STRING NULL,
    signup_date STRING NULL,
    account_status STRING NULL,
    lifetime_value NUMBER NULL,
    PRIMARY KEY (customer_id)
);