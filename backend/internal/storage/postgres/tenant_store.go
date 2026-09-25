package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"network-software/internal/models"
)

// TenantStore manages client companies in PostgreSQL.
type TenantStore struct {
	db *sql.DB
}

func NewTenantStore(db *sql.DB) *TenantStore {
	return &TenantStore{db: db}
}

func (s *TenantStore) GetAll() ([]models.Tenant, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()

	query := `
		SELECT 
			t.id, t.name, t.slug, COALESCE(t.asn, ''), COALESCE(t.document, ''),
			COALESCE(t.contact_email, ''), COALESCE(t.contact_phone, ''), COALESCE(t.logo_url, ''),
			t.plan, t.status, t.created_at,
			(SELECT COUNT(*) FROM devices d WHERE d.tenant_id = t.id) AS device_count,
			(SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count
		FROM tenants t
		ORDER BY t.created_at ASC
	`
	rows, err := s.db.QueryContext(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("erro ao listar tenants: %w", err)
	}
	defer rows.Close()

	var result []models.Tenant
	for rows.Next() {
		var t models.Tenant
		if err := rows.Scan(
			&t.ID, &t.Name, &t.Slug, &t.ASN, &t.Document,
			&t.ContactEmail, &t.ContactPhone, &t.LogoURL,
			&t.Plan, &t.Status, &t.CreatedAt,
			&t.DeviceCount, &t.UserCount,
		); err != nil {
			return nil, fmt.Errorf("erro ao ler tenant: %w", err)
		}
		result = append(result, t)
	}
	return result, nil
}

func (s *TenantStore) GetByID(id string) (*models.Tenant, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	query := `
		SELECT 
			t.id, t.name, t.slug, COALESCE(t.asn, ''), COALESCE(t.document, ''),
			COALESCE(t.contact_email, ''), COALESCE(t.contact_phone, ''), COALESCE(t.logo_url, ''),
			t.plan, t.status, t.created_at,
			(SELECT COUNT(*) FROM devices d WHERE d.tenant_id = t.id) AS device_count,
			(SELECT COUNT(*) FROM users u WHERE u.tenant_id = t.id) AS user_count
		FROM tenants t
		WHERE t.id = $1
	`
	var t models.Tenant
	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&t.ID, &t.Name, &t.Slug, &t.ASN, &t.Document,
		&t.ContactEmail, &t.ContactPhone, &t.LogoURL,
		&t.Plan, &t.Status, &t.CreatedAt,
		&t.DeviceCount, &t.UserCount,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("empresa cliente não encontrada")
		}
		return nil, fmt.Errorf("erro ao buscar tenant: %w", err)
	}
	return &t, nil
}

func (s *TenantStore) GetBySlug(slug string) (*models.Tenant, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	query := `
		SELECT 
			t.id, t.name, t.slug, COALESCE(t.asn, ''), COALESCE(t.document, ''),
			COALESCE(t.contact_email, ''), COALESCE(t.contact_phone, ''), COALESCE(t.logo_url, ''),
			t.plan, t.status, t.created_at
		FROM tenants t
		WHERE t.slug = $1
	`
	var t models.Tenant
	err := s.db.QueryRowContext(ctx, query, slug).Scan(
		&t.ID, &t.Name, &t.Slug, &t.ASN, &t.Document,
		&t.ContactEmail, &t.ContactPhone, &t.LogoURL,
		&t.Plan, &t.Status, &t.CreatedAt,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, errors.New("empresa cliente não encontrada")
		}
		return nil, fmt.Errorf("erro ao buscar tenant por slug: %w", err)
	}
	return &t, nil
}

func (s *TenantStore) Create(t models.Tenant) (*models.Tenant, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if t.ID == "" {
		t.ID = fmt.Sprintf("tenant-%d", time.Now().UnixNano())
	}
	if t.Status == "" {
		t.Status = "active"
	}
	if t.Plan == "" {
		t.Plan = "enterprise"
	}
	t.CreatedAt = time.Now()

	query := `
		INSERT INTO tenants (id, name, slug, asn, document, contact_email, contact_phone, logo_url, plan, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
	`
	_, err := s.db.ExecContext(ctx, query,
		t.ID, t.Name, t.Slug, t.ASN, t.Document,
		t.ContactEmail, t.ContactPhone, t.LogoURL,
		t.Plan, t.Status, t.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("erro ao criar tenant: %w", err)
	}
	return &t, nil
}

func (s *TenantStore) Update(t models.Tenant) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	query := `
		UPDATE tenants
		SET name = COALESCE(NULLIF($2, ''), name),
		    slug = COALESCE(NULLIF($3, ''), slug),
		    asn = COALESCE(NULLIF($4, ''), asn),
		    document = COALESCE(NULLIF($5, ''), document),
		    contact_email = COALESCE(NULLIF($6, ''), contact_email),
		    contact_phone = COALESCE(NULLIF($7, ''), contact_phone),
		    logo_url = COALESCE(NULLIF($8, ''), logo_url),
		    plan = COALESCE(NULLIF($9, ''), plan),
		    status = COALESCE(NULLIF($10, ''), status)
		WHERE id = $1
	`
	res, err := s.db.ExecContext(ctx, query,
		t.ID, t.Name, t.Slug, t.ASN, t.Document,
		t.ContactEmail, t.ContactPhone, t.LogoURL,
		t.Plan, t.Status,
	)
	if err != nil {
		return fmt.Errorf("erro ao atualizar tenant: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errors.New("empresa cliente não encontrada")
	}
	return nil
}

func (s *TenantStore) Delete(id string) error {
	if id == "default-tenant" {
		return errors.New("a empresa central (default-tenant) não pode ser excluída")
	}

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	query := `DELETE FROM tenants WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("erro ao excluir tenant: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errors.New("empresa cliente não encontrada")
	}
	return nil
}
