-- 003 down: remove full-text search

DROP TRIGGER IF EXISTS trg_products_search_vector ON products;
DROP FUNCTION IF EXISTS products_search_vector_update();
DROP INDEX IF EXISTS idx_products_search;
ALTER TABLE products DROP COLUMN IF EXISTS search_vector;
