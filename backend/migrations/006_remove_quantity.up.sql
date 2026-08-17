UPDATE cart_items SET quantity = 1;
UPDATE order_items SET quantity = 1, subtotal = product_price;
ALTER TABLE cart_items DROP COLUMN quantity;
ALTER TABLE order_items DROP COLUMN quantity;
