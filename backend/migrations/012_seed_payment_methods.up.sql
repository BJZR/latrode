INSERT INTO payment_methods (name, description, enabled) VALUES
('Contra Entrega', 'Paga en efectivo cuando recibas tu pedido', true),
('Nequi', 'Paga por Nequi al número 3022833007', true),
('Daviplata', 'Paga por Daviplata al número 3022833007', true),
('Botón Bancolombia', 'Paga por botón de pago de Bancolombia', true)
ON CONFLICT DO NOTHING;
