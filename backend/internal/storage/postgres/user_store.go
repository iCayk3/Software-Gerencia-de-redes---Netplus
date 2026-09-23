package postgres

import (
	"context"
	"database/sql"
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
		SELECT id, tenant_id, name, email, password_hash, role, status, created_at, last_login
		FROM users
		WHERE email = $1
	`
	var u models.User
	var lastLogin sql.NullTime

	err := s.db.QueryRowContext(ctx, query, email).Scan(
		&u.ID, &u.TenantID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.Status, &u.CreatedAt, &lastLogin,
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
		SELECT id, tenant_id, name, email, password_hash, role, status, created_at, last_login
		FROM users
		WHERE id = $1
	`
	var u models.User
	var lastLogin sql.NullTime

	err := s.db.QueryRowContext(ctx, query, id).Scan(
		&u.ID, &u.TenantID, &u.Name, &u.Email, &u.PasswordHash, &u.Role, &u.Status, &u.CreatedAt, &lastLogin,
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

// ListUsers returns all users for a given tenant.
func (s *UserStore) ListUsers(tenantID string) ([]models.UserProfile, error) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	query := `
		SELECT id, tenant_id, name, email, role, status, created_at, last_login
		FROM users
		WHERE tenant_id = $1
		ORDER BY created_at ASC
	`
	rows, err := s.db.QueryContext(ctx, query, tenantID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var profiles []models.UserProfile
	for rows.Next() {
		var p models.UserProfile
		var lastLogin sql.NullTime
		if err := rows.Scan(&p.ID, &p.TenantID, &p.Name, &p.Email, &p.Role, &p.Status, &p.CreatedAt, &lastLogin); err != nil {
			return nil, err
		}
		if lastLogin.Valid {
			p.LastLogin = &lastLogin.Time
		}
		profiles = append(profiles, p)
	}
	return profiles, nil
}
