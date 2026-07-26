-- 003: Full-text search for products

ALTER TABLE products ADD COLUMN search_vector tsvector;

UPDATE products SET search_vector =
  setweight(to_tsvector('spanish', coalesce(name, '')), 'A') ||
  setweight(to_tsvector('spanish', coalesce(category, '')), 'B') ||
  setweight(to_tsvector('spanish', coalesce(description, '')), 'C');

CREATE INDEX idx_products_search ON products USING GIN(search_vector);

CREATE OR REPLACE FUNCTION products_search_vector_update() RETURNS trigger AS $$
BEGIN
  NEW.search_vector :=
    setweight(to_tsvector('spanish', coalesce(NEW.name, '')), 'A') ||
    setweight(to_tsvector('spanish', coalesce(NEW.category, '')), 'B') ||
    setweight(to_tsvector('spanish', coalesce(NEW.description, '')), 'C');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_products_search_vector
  BEFORE INSERT OR UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION products_search_vector_update();
