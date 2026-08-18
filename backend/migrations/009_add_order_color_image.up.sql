DO $$ BEGIN
  ALTER TABLE order_items ADD COLUMN color_image_url VARCHAR(500) DEFAULT '';
EXCEPTION WHEN duplicate_column THEN NULL;
END $$;
