package database

import (
	"context"
	"database/sql"
	"fmt"
	"log"
	"os"
	"time"

	_ "github.com/lib/pq"
)

// DefaultDatabaseURL fallback for local Docker PostgreSQL
const DefaultDatabaseURL = "postgres://netpulse:netpulse_secret@localhost:5432/netpulse?sslmode=disable"

// Connect attempts to connect to PostgreSQL.
// If DATABASE_URL is not set, it checks DefaultDatabaseURL.
func Connect() (*sql.DB, error) {
	connStr := os.Getenv("DATABASE_URL")
	if connStr == "" {
		connStr = DefaultDatabaseURL
	}

	db, err := sql.Open("postgres", connStr)
	if err != nil {
		return nil, fmt.Errorf("failed to open database: %w", err)
	}

	db.SetMaxOpenConns(25)
	db.SetMaxIdleConns(5)
	db.SetConnMaxLifetime(5 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if err := db.PingContext(ctx); err != nil {
		db.Close()
		return nil, fmt.Errorf("postgres ping failed: %w", err)
	}

	log.Printf("[Database] 🐘 Conectado com sucesso ao PostgreSQL (%s)", maskURL(connStr))
	return db, nil
}

// RunMigrations executes the initial schema DDL if tables do not exist.
func RunMigrations(db *sql.DB, schemaPath string) error {
	content, err := os.ReadFile(schemaPath)
	if err != nil {
		// If file not found in relative path, try common alternative locations
		altPaths := []string{
			"migrations/001_init_schema.sql",
			"../migrations/001_init_schema.sql",
			"backend/migrations/001_init_schema.sql",
		}
		found := false
		for _, p := range altPaths {
			if c, readErr := os.ReadFile(p); readErr == nil {
				content = c
				found = true
				break
			}
		}
		if !found {
			return fmt.Errorf("migration file not found: %w", err)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if _, err := db.ExecContext(ctx, string(content)); err != nil {
		return fmt.Errorf("failed to apply migrations: %w", err)
	}

	log.Printf("[Database] ✅ Migrations do PostgreSQL verificadas/executadas com sucesso.")
	return nil
}

func maskURL(raw string) string {
	if len(raw) > 25 {
		return raw[:15] + "..." + raw[len(raw)-10:]
	}
	return raw
}
