package database

import (
	"database/sql"
	"fmt"
	"time"

	_ "github.com/lib/pq"
	"latrode-fusion/internal/config"
)

type DB struct {
	DB *sql.DB
}

func Connect(cfg *config.Config) (*DB, error) {
	db, err := sql.Open("postgres", cfg.DatabaseURL())
	if err != nil {
		return nil, fmt.Errorf("unable to connect: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(10)
	db.SetConnMaxLifetime(5 * time.Minute)
	db.SetConnMaxIdleTime(3 * time.Minute)

	if err := db.Ping(); err != nil {
		return nil, fmt.Errorf("unable to ping: %w", err)
	}

	return &DB{DB: db}, nil
}

func (db *DB) cleanPaymentMethods() {
	for _, m := range []struct {
		Name        string
		Description string
	}{
		{"cash_on_delivery", "Paga en efectivo cuando recibes tu pedido"},
		{"nequi", "Paga desde la app Nequi"},
		{"daviplata", "Paga desde la app DaviPlata"},
		{"boton_bancolombia", "Paga con Botón Bancolombia"},
	} {
		db.DB.Exec(`INSERT INTO payment_methods (name, description, enabled, created_at)
			SELECT $1, $2, true, NOW()
			WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE name = $1)`, m.Name, m.Description)
	}
}

func (db *DB) Seed() {
	db.cleanPaymentMethods()
}

func (db *DB) Close() {
	db.DB.Close()
}
