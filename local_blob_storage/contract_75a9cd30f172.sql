CREATE TABLE customers (
    customer_id VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) NOT NULL,
    signup_date DATE NOT NULL,
    account_status VARCHAR(50) NOT NULL,
    lifetime_value NUMERIC(10,2) NOT NULL,
    PRIMARY KEY (customer_id)
);