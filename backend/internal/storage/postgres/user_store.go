package postgres

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"

	"network-software/internal/models"
)

// UserStore manages user accounts and credentials in PostgreSQL.
type UserStore struct {
	db *sql.DB
}

func NewUserStore(db *sql.DB) *UserStore {
	return &UserStore{db: db}
}

// GetByEmail retrieves a user and their password hash for authentication.
func (s *UserStore) GetByEmail(email string) (*models.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	query := `
		SELECT id, tenant_id, name, email, password_hash, role, COALESCE(is_superadmin, FALSE), status, created_at, last_login
		FROM users
		WHERE email = $1
	`
	var u models.User
	var lastLogin sql.NullTime

	err := s.db.QueryRowContext(ctx, query, email).Scan(
		&u.ID, &u.TenantID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.IsSuperAdmin, &u.Status, &u.CreatedAt, &lastLogin,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("usuário não encontrado")
		}
		return nil, fmt.Errorf("erro ao buscar usuário: %w", err)
	}

	if lastLogin.Valid {
		u.LastLogin = &lastLogin.Time
	}
	return &u, nil
}

// GetByID retrieves a user by ID.
func (s *UserStore) GetByID(id string) (*models.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	query := `
		SELECT id, tenant_id, name, email, password_hash, role, COALESCE(is_superadmin, FALSE), status, created_at, last_login
		FROM users
		WHERE id = $1
	`
	var u models.User
	var lastLogin sql.NullTime

	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&u.ID, &u.TenantID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.IsSuperAdmin, &u.Status, &u.CreatedAt, &lastLogin,
	)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("usuário não encontrado")
		}
		return nil, fmt.Errorf("erro ao buscar usuário: %w", err)
	}

	if lastLogin.Valid {
		u.LastLogin = &lastLogin.Time
	}
	return &u, nil
}

// UpdateLastLogin updates the last login timestamp for the user.
func (s *UserStore) UpdateLastLogin(userID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	query := `UPDATE users SET last_login = NOW() WHERE id = $1`
	_, err := s.db.ExecContext(ctx, query, userID)
	return err
}

// ListUsers returns all users, optionally filtered by tenant.
func (s *UserStore) ListUsers(tenantID string) ([]models.UserProfile, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	var rows *sql.Rows
	var err error

	if tenantID == "" || tenantID == "all" {
		query := `
			SELECT u.id, u.tenant_id, COALESCE(t.name, ''), u.name, u.email, u.role, COALESCE(u.is_superadmin, FALSE), u.status, u.created_at, u.last_login
			FROM users u
			LEFT JOIN tenants t ON t.id = u.tenant_id
			ORDER BY u.created_at ASC
		`
		rows, err = s.db.QueryContext(ctx, query)
	} else {
		query := `
			SELECT u.id, u.tenant_id, COALESCE(t.name, ''), u.name, u.email, u.role, COALESCE(u.is_superadmin, FALSE), u.status, u.created_at, u.last_login
			FROM users u
			LEFT JOIN tenants t ON t.id = u.tenant_id
			WHERE u.tenant_id = $1
			ORDER BY u.created_at ASC
		`
		rows, err = s.db.QueryContext(ctx, query, tenantID)
	}

	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var profiles []models.UserProfile
	for rows.Next() {
		var p models.UserProfile
		var lastLogin sql.NullTime
		if err := rows.Scan(
			&p.ID, &p.TenantID, &p.TenantName, &p.Name, &p.Email,
			&p.Role, &p.IsSuperAdmin, &p.Status, &p.CreatedAt, &lastLogin,
		); err != nil {
			return nil, err
		}
		if lastLogin.Valid {
			p.LastLogin = &lastLogin.Time
		}
		profiles = append(profiles, p)
	}
	return profiles, nil
}

// CreateUser inserts a new user into PostgreSQL.
func (s *UserStore) CreateUser(u models.User) (*models.User, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	if u.ID == "" {
		u.ID = fmt.Sprintf("usr-%d", time.Now().UnixNano())
	}
	if u.Status == "" {
		u.Status = "active"
	}
	u.CreatedAt = time.Now()

	query := `
		INSERT INTO users (id, tenant_id, name, email, password_hash, role, is_superadmin, status, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
	`
	_, err := s.db.ExecContext(ctx, query,
		u.ID, u.TenantID, u.Name, u.Email, u.PasswordHash, u.Role, u.IsSuperAdmin, u.Status, u.CreatedAt,
	)
	if err != nil {
		return nil, fmt.Errorf("erro ao inserir usuário: %w", err)
	}
	return &u, nil
}

// UpdateUser modifies an existing user.
func (s *UserStore) UpdateUser(u models.User) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	var err error
	if u.PasswordHash != "" {
		query := `
			UPDATE users 
			SET name = COALESCE(NULLIF($2, ''), name),
			    tenant_id = COALESCE(NULLIF($3, ''), tenant_id),
			    role = COALESCE(NULLIF($4, ''), role),
			    is_superadmin = $5,
			    status = COALESCE(NULLIF($6, ''), status),
			    password_hash = $7
			WHERE id = $1
		`
		_, err = s.db.ExecContext(ctx, query, u.ID, u.Name, u.TenantID, string(u.Role), u.IsSuperAdmin, u.Status, u.PasswordHash)
	} else {
		query := `
			UPDATE users 
			SET name = COALESCE(NULLIF($2, ''), name),
			    tenant_id = COALESCE(NULLIF($3, ''), tenant_id),
			    role = COALESCE(NULLIF($4, ''), role),
			    is_superadmin = $5,
			    status = COALESCE(NULLIF($6, ''), status)
			WHERE id = $1
		`
		_, err = s.db.ExecContext(ctx, query, u.ID, u.Name, u.TenantID, string(u.Role), u.IsSuperAdmin, u.Status)
	}
	return err
}

// DeleteUser deletes a user by ID.
func (s *UserStore) DeleteUser(id string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	query := `DELETE FROM users WHERE id = $1`
	res, err := s.db.ExecContext(ctx, query, id)
	if err != nil {
		return fmt.Errorf("erro ao excluir usuário: %w", err)
	}
	n, _ := res.RowsAffected()
	if n == 0 {
		return errors.New("usuário não encontrado")
	}
	return nil
}
