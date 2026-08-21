INSERT INTO payment_methods (name, description, enabled) VALUES
('cash_on_delivery', 'Paga en efectivo cuando recibes tu pedido', true),
('nequi', 'Paga desde la app Nequi', true),
('daviplata', 'Paga desde la app DaviPlata', true),
('boton_bancolombia', 'Paga con Botón Bancolombia', true)
ON CONFLICT DO NOTHING;
