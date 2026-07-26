-- 002: Add Wompi payment columns to orders

ALTER TABLE orders ADD COLUMN IF NOT EXISTS wompi_transaction_id VARCHAR(255) DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wompi_status VARCHAR(50) DEFAULT '';
ALTER TABLE orders ADD COLUMN IF NOT EXISTS wompi_reference VARCHAR(255) DEFAULT '';
