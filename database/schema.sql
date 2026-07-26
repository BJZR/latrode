CREATE DATABASE latrode;

\c latrode;

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TABLE users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(100) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) DEFAULT 'customer',
    phone VARCHAR(20) DEFAULT '',
    address TEXT DEFAULT '',
    city VARCHAR(100) DEFAULT '',
    postal_code VARCHAR(20) DEFAULT '',
    country VARCHAR(100) DEFAULT 'Colombia',
    document_type VARCHAR(20) DEFAULT '',
    document_number VARCHAR(50) DEFAULT '',
    google_id VARCHAR(255) DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT DEFAULT '',
    price DECIMAL(10,2) NOT NULL,
    stock INTEGER DEFAULT 0,
    category VARCHAR(100) DEFAULT '',
    image_url TEXT DEFAULT '',
    sizes TEXT DEFAULT '[]',
    material VARCHAR(255) DEFAULT '',
    care TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE product_colors (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    hex VARCHAR(7) NOT NULL,
    stock INTEGER DEFAULT 0
);

CREATE TABLE inventory (
    id SERIAL PRIMARY KEY,
    color_id INTEGER REFERENCES product_colors(id) ON DELETE CASCADE,
    size VARCHAR(20) NOT NULL,
    stock INTEGER DEFAULT 0,
    UNIQUE(color_id, size)
);

CREATE TABLE cart_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    color_id INTEGER REFERENCES product_colors(id) ON DELETE SET NULL,
    size VARCHAR(20) DEFAULT '',
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, product_id, color_id, size)
);

CREATE TABLE favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    total DECIMAL(10,2) NOT NULL,
    status VARCHAR(20) DEFAULT 'pending',
    payment_status VARCHAR(20) DEFAULT 'pending',
    payment_method VARCHAR(50) DEFAULT 'cash_on_delivery',
    shipping_name VARCHAR(255) DEFAULT '',
    shipping_phone VARCHAR(20) DEFAULT '',
    shipping_address TEXT DEFAULT '',
    shipping_city VARCHAR(100) DEFAULT '',
    shipping_postal_code VARCHAR(20) DEFAULT '',
    shipping_country VARCHAR(100) DEFAULT 'Colombia',
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE order_items (
    id SERIAL PRIMARY KEY,
    order_id INTEGER REFERENCES orders(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE SET NULL,
    product_name VARCHAR(255) NOT NULL,
    product_price DECIMAL(10,2) NOT NULL,
    color_name VARCHAR(100) DEFAULT '',
    size VARCHAR(20) DEFAULT '',
    quantity INTEGER NOT NULL,
    subtotal DECIMAL(10,2) NOT NULL
);

CREATE TABLE payment_methods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT '',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE password_reset_codes (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(50) DEFAULT '',
    entity_id INTEGER DEFAULT 0,
    ip_address VARCHAR(45) DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW()
);

-- Admin user (password: admin123)
INSERT INTO users (username, email, password_hash, role) VALUES
('admin', 'latrode.co@gmail.com', '$2a$10$SbzbIMJBDnsAfsqPc94e1u8TEvCgk8u2bRrzm3m3rh.SYFo7t5dD2', 'admin');

-- Seed payment methods
INSERT INTO payment_methods (name, description) VALUES
('Contra Entrega', 'Paga en efectivo cuando recibas tu pedido');

-- Seed settings
INSERT INTO settings (key, value) VALUES
('site_name', 'Latrode'),
('site_description', 'Tienda de ropa urbana'),
('contact_phone', '302 283 3007'),
('contact_email', 'latrode.co@gmail.com'),
('free_shipping_min', '150000');

-- Seed products
INSERT INTO products (name, description, price, stock, category, image_url, sizes, material, care) VALUES
('Hoodie Oversize', 'Hoodie de algodón oversize con capucha ajustable y bolsillo frontal. Diseño minimalista y corte moderno.', 129900, 25, 'Hoodies', '1.jpeg', ARRAY['S','M','L','XL'], 'Algodón 320gsm', 'Lavar en frío, no usar blanqueador'),
('Camiseta Algodon Premium', 'Camiseta de algodón peinado 180gsm. Corte clásico y costura reforzada.', 59900, 50, 'Camisetas', '2.jpeg', ARRAY['S','M','L','XL'], 'Algodón peinado 180gsm', 'Lavar en frío, planchar al revés'),
('Gorra Street 6Panel', 'Gorra urbana 6 paneles con visera curva y cierre ajustable. Bordado frontal.', 49900, 30, 'Accesorios', '3.jpeg', ARRAY['Único'], 'Poliéster 280gsm', 'Lavar a mano, secar al aire'),
('Jean Slim Fit', 'Jean slim fit de elastano con mezclilla premium. Cintura media y corte ajustado.', 159900, 20, 'Pantalones', '4.jpeg', ARRAY['28','30','32','34','36'], 'Mezclilla 98% / Elastano 2%', 'Lavar en frío, no planchar directamente'),
('Chaqueta Bomber', 'Chaqueta bomber con cierre metálico y cuello redondo. Puños y dobladillo acanalados.', 249900, 15, 'Chaquetas', '5.jpeg', ARRAY['S','M','L','XL'], 'Nailon con forro poliéster', 'Limpieza en seco recomendada'),
('Short Deportivo', 'Short deportivo de tejido ligero con cintura elástica y cordón ajustable.', 69900, 40, 'Shorts', 'short.jpg', ARRAY['S','M','L','XL'], 'Poliéster 100%', 'Lavar en frío, secado rápido'),
('Short Playa Estampado', 'Short de playa con estampado tropical y cintura elástica. Fresco y cómodo.', 79900, 35, 'Shorts', 'short1.jpg', ARRAY['S','M','L','XL'], 'Algodón 100%', 'Lavar en frío, no retorcer'),
('Jogger Urbano', 'Jogger urbano con bolsillos laterales y cintura elástica. Puños ajustados con elastano.', 119900, 30, 'Pantalones', 'short2.jpg', ARRAY['S','M','L','XL'], 'Algodón 80% / Poliéster 20%', 'Lavar en frío, no usar secadora');

-- Seed product colors
INSERT INTO product_colors (product_id, name, hex) VALUES
(1, 'Negro', '#000000'),
(1, 'Gris', '#808080'),
(1, 'Blanco', '#FFFFFF'),
(2, 'Blanco', '#FFFFFF'),
(2, 'Negro', '#000000'),
(2, 'Gris', '#808080'),
(3, 'Negro', '#000000'),
(3, 'Rojo', '#CC0000'),
(3, 'Azul', '#000080'),
(4, 'Azul Claro', '#4A7CBF'),
(4, 'Azul Oscuro', '#1B3A5C'),
(4, 'Negro', '#1A1A1A'),
(5, 'Negro', '#000000'),
(5, 'Verde Militar', '#4A5D23'),
(5, 'Azul Marino', '#1B2A47'),
(6, 'Negro', '#000000'),
(6, 'Gris', '#808080'),
(6, 'Azul', '#0066CC'),
(7, 'Azul', '#0066CC'),
(7, 'Rojo', '#CC0000'),
(7, 'Verde', '#009966'),
(8, 'Negro', '#000000'),
(8, 'Gris', '#808080'),
(8, 'Carbón', '#36454F');
