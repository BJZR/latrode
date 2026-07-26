-- 001: Initial schema

DO $$ BEGIN
  CREATE EXTENSION IF NOT EXISTS "pgcrypto";
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS users (
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

CREATE TABLE IF NOT EXISTS sessions (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    token VARCHAR(255) UNIQUE NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
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

CREATE TABLE IF NOT EXISTS product_colors (
    id SERIAL PRIMARY KEY,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    hex VARCHAR(7) NOT NULL,
    stock INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS inventory (
    id SERIAL PRIMARY KEY,
    color_id INTEGER REFERENCES product_colors(id) ON DELETE CASCADE,
    size VARCHAR(20) NOT NULL,
    stock INTEGER DEFAULT 0,
    UNIQUE(color_id, size)
);

CREATE TABLE IF NOT EXISTS cart_items (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    color_id INTEGER REFERENCES product_colors(id) ON DELETE SET NULL,
    size VARCHAR(20) DEFAULT '',
    quantity INTEGER DEFAULT 1,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, product_id, color_id, size)
);

CREATE TABLE IF NOT EXISTS favorites (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    product_id INTEGER REFERENCES products(id) ON DELETE CASCADE,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(user_id, product_id)
);

CREATE TABLE IF NOT EXISTS orders (
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

CREATE TABLE IF NOT EXISTS order_items (
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

CREATE TABLE IF NOT EXISTS payment_methods (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT '',
    enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
    id SERIAL PRIMARY KEY,
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS password_reset_codes (
    id SERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL,
    code VARCHAR(10) NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    used BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS activity_logs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(50) DEFAULT '',
    entity_id INTEGER DEFAULT 0,
    ip_address VARCHAR(45) DEFAULT '',
    created_at TIMESTAMP DEFAULT NOW()
);
