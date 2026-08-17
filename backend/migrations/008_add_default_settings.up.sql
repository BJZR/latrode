INSERT INTO settings (key, value) VALUES
  ('iva', '19'),
  ('comision', '3000'),
  ('envio', '5000')
ON CONFLICT (key) DO NOTHING;
