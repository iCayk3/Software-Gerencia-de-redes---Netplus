package database

import (
	"context"
	"database/sql"
	"encoding/json"
	"log"
	"os"
	"time"

	"network-software/internal/models"

	"golang.org/x/crypto/bcrypt"
)

// AutoMigrateFromJSON imports existing JSON configuration files into PostgreSQL if the database is fresh.
func AutoMigrateFromJSON(db *sql.DB) error {
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()

	// 1. Seed Users if table is empty
	var userCount int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM users").Scan(&userCount); err == nil && userCount == 0 {
		log.Println("[Migrator] 👤 Inicializando usuários padrão de demonstração...")
		seedUsers(ctx, db)
	}

	// 2. Import Devices from JSON if table is empty
	var deviceCount int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM devices").Scan(&deviceCount); err == nil && deviceCount == 0 {
		importDevices(ctx, db)
	}

	// 3. Import AS Metadata from JSON if table is empty
	var asCount int
	if err := db.QueryRowContext(ctx, "SELECT COUNT(*) FROM as_metadata").Scan(&asCount); err == nil && asCount == 0 {
		importASMetadata(ctx, db)
	}

	return nil
}

func seedUsers(ctx context.Context, db *sql.DB) {
	defaultUsers := []struct {
		ID       string
		Name     string
		Email    string
		Password string
		Role     models.UserRole
	}{
		{
			ID:       "usr-admin-01",
			Name:     "Administrador Geral",
			Email:    "admin@netpulse.com",
			Password: "admin123",
			Role:     models.RoleAdmin,
		},
		{
			ID:       "usr-noc-01",
			Name:     "Operador NOC",
			Email:    "operador@netpulse.com",
			Password: "operador123",
			Role:     models.RoleNOCOperator,
		},
		{
			ID:       "usr-viewer-01",
			Name:     "Diretoria / Visualizador",
			Email:    "diretoria@netpulse.com",
			Password: "diretoria123",
			Role:     models.RoleViewer,
		},
	}

	for _, u := range defaultUsers {
		hash, err := bcrypt.GenerateFromPassword([]byte(u.Password), bcrypt.DefaultCost)
		if err != nil {
			log.Printf("[Migrator] Erro ao gerar hash bcrypt para %s: %v", u.Email, err)
			continue
		}

		query := `
			INSERT INTO users (id, tenant_id, name, email, password_hash, role, status, created_at)
			VALUES ($1, 'default-tenant', $2, $3, $4, $5, 'active', NOW())
			ON CONFLICT (email) DO NOTHING
		`
		if _, err := db.ExecContext(ctx, query, u.ID, u.Name, u.Email, string(hash), string(u.Role)); err != nil {
			log.Printf("[Migrator] Erro ao cadastrar usuario inicial %s: %v", u.Email, err)
		} else {
			log.Printf("[Migrator] ✅ Usuário criado: %s (%s)", u.Email, u.Role)
		}
	}
}

func importDevices(ctx context.Context, db *sql.DB) {
	paths := []string{"data/devices.json", "backend/data/devices.json", "../data/devices.json"}
	var data []byte
	for _, p := range paths {
		if c, err := os.ReadFile(p); err == nil {
			data = c
			break
		}
	}
	if len(data) == 0 {
		return
	}

	var devices []models.Device
	if err := json.Unmarshal(data, &devices); err != nil {
		log.Printf("[Migrator] Falha ao fazer parse de devices.json: %v", err)
		return
	}

	for _, d := range devices {
		query := `
			INSERT INTO devices (id, tenant_id, name, host, port, vendor, model, username, password, auth_type, is_bgp, status, last_seen, created_at)
			VALUES ($1, 'default-tenant', $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name,
				host = EXCLUDED.host,
				port = EXCLUDED.port,
				vendor = EXCLUDED.vendor,
				model = EXCLUDED.model,
				username = EXCLUDED.username,
				password = EXCLUDED.password,
				is_bgp = EXCLUDED.is_bgp,
				status = EXCLUDED.status,
				last_seen = EXCLUDED.last_seen
		`
		_, err := db.ExecContext(ctx, query,
			d.ID, d.Name, d.Host, d.Port, string(d.Vendor), d.Model,
			d.Username, d.Password, string(d.AuthType), d.IsBGP, d.Status,
			d.LastSeen, d.CreatedAt,
		)
		if err != nil {
			log.Printf("[Migrator] Erro ao importar dispositivo %s (%s): %v", d.Name, d.Host, err)
		} else {
			log.Printf("[Migrator] 📡 Roteador importado para PostgreSQL: %s [%s]", d.Name, d.Host)
		}
	}
}

func importASMetadata(ctx context.Context, db *sql.DB) {
	paths := []string{"data/as_metadata.json", "backend/data/as_metadata.json", "../data/as_metadata.json"}
	var data []byte
	for _, p := range paths {
		if c, err := os.ReadFile(p); err == nil {
			data = c
			break
		}
	}
	if len(data) == 0 {
		return
	}

	var list []models.ASMetadata
	if err := json.Unmarshal(data, &list); err != nil {
		return
	}

	for _, m := range list {
		query := `
			INSERT INTO as_metadata (asn, tenant_id, alias, role, color, custom_gateway, updated_at)
			VALUES ($1, 'default-tenant', $2, $3, $4, $5, NOW())
			ON CONFLICT (asn, tenant_id) DO NOTHING
		`
		_, _ = db.ExecContext(ctx, query, m.ASN, m.Alias, m.Role, m.Color, m.CustomGateway)
	}
}
