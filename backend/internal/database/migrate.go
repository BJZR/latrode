package database

import (
	"database/sql"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"sort"
	"strings"
)

func (db *DB) ensureMigrationTable() error {
	_, err := db.DB.Exec(`CREATE TABLE IF NOT EXISTS schema_migrations (
		id SERIAL PRIMARY KEY,
		filename VARCHAR(255) UNIQUE NOT NULL,
		applied_at TIMESTAMP DEFAULT NOW()
	)`)
	return err
}

func (db *DB) getAppliedMigrations() (map[string]bool, error) {
	rows, err := db.DB.Query(`SELECT filename FROM schema_migrations`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	applied := make(map[string]bool)
	for rows.Next() {
		var filename string
		if err := rows.Scan(&filename); err != nil {
			return nil, err
		}
		applied[filename] = true
	}
	return applied, nil
}

func (db *DB) RunMigrations(migrationsDir string) error {
	if err := db.ensureMigrationTable(); err != nil {
		return fmt.Errorf("creating migrations table: %w", err)
	}

	applied, err := db.getAppliedMigrations()
	if err != nil {
		return fmt.Errorf("checking applied migrations: %w", err)
	}

	entries, err := os.ReadDir(migrationsDir)
	if err != nil {
		return fmt.Errorf("reading migrations dir: %w", err)
	}

	var pending []os.DirEntry
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".up.sql") {
			continue
		}
		if !applied[entry.Name()] {
			pending = append(pending, entry)
		}
	}

	if len(pending) == 0 {
		log.Println("[migrate] no pending migrations")
		return nil
	}

	sort.Slice(pending, func(i, j int) bool {
		return pending[i].Name() < pending[j].Name()
	})

	for _, entry := range pending {
		content, err := os.ReadFile(filepath.Join(migrationsDir, entry.Name()))
		if err != nil {
			return fmt.Errorf("reading migration %s: %w", entry.Name(), err)
		}

		tx, err := db.DB.Begin()
		if err != nil {
			return fmt.Errorf("begin tx for %s: %w", entry.Name(), err)
		}

		if _, err := tx.Exec(string(content)); err != nil {
			tx.Rollback()
			return fmt.Errorf("executing migration %s: %w", entry.Name(), err)
		}

		if _, err := tx.Exec(`INSERT INTO schema_migrations (filename) VALUES ($1)`, entry.Name()); err != nil {
			tx.Rollback()
			return fmt.Errorf("recording migration %s: %w", entry.Name(), err)
		}

		if err := tx.Commit(); err != nil {
			return fmt.Errorf("committing migration %s: %w", entry.Name(), err)
		}

		log.Printf("[migrate] applied %s", entry.Name())
	}

	return nil
}

func (db *DB) RollbackLast(migrationsDir string) error {
	var filename string
	err := db.DB.QueryRow(`SELECT filename FROM schema_migrations ORDER BY id DESC LIMIT 1`).Scan(&filename)
	if err == sql.ErrNoRows {
		log.Println("[migrate] no migrations to rollback")
		return nil
	}
	if err != nil {
		return fmt.Errorf("finding last migration: %w", err)
	}

	rollbackFile := strings.Replace(filename, ".up.sql", ".down.sql", 1)
	rollbackPath := filepath.Join(migrationsDir, rollbackFile)

	content, err := os.ReadFile(rollbackPath)
	if err != nil {
		return fmt.Errorf("reading rollback file %s: %w", rollbackFile, err)
	}

	tx, err := db.DB.Begin()
	if err != nil {
		return fmt.Errorf("begin tx: %w", err)
	}

	if _, err := tx.Exec(string(content)); err != nil {
		tx.Rollback()
		return fmt.Errorf("executing rollback %s: %w", rollbackFile, err)
	}

	if _, err := tx.Exec(`DELETE FROM schema_migrations WHERE filename = $1`, filename); err != nil {
		tx.Rollback()
		return fmt.Errorf("removing migration record: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return fmt.Errorf("committing rollback: %w", err)
	}

	log.Printf("[migrate] rolled back %s", filename)
	return nil
}
