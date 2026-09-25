package storage

import (
	"encoding/json"
	"fmt"
	"os"
	"sync"
	"time"

	"network-software/internal/models"

	"golang.org/x/crypto/bcrypt"
)

// MemoryUserStore is an in-memory/file-based fallback store when PostgreSQL is not yet started.
type MemoryUserStore struct {
	mu       sync.RWMutex
	filePath string
	users    map[string]*models.User
}

func NewMemoryUserStore(filePath string) *MemoryUserStore {
	store := &MemoryUserStore{
		filePath: filePath,
		users:    make(map[string]*models.User),
	}
	store.loadOrSeed()
	return store
}

type storedUser struct {
	ID           string          `json:"id"`
	TenantID     string          `json:"tenant_id"`
	Name         string          `json:"name"`
	Email        string          `json:"email"`
	PasswordHash string          `json:"password_hash"`
	Role         models.UserRole `json:"role"`
	Status       string          `json:"status"`
	CreatedAt    time.Time       `json:"created_at"`
	LastLogin    *time.Time      `json:"last_login,omitempty"`
}

func (s *MemoryUserStore) loadOrSeed() {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err == nil {
		var list []*storedUser
		if err := json.Unmarshal(data, &list); err == nil && len(list) > 0 {
			hasValidHash := false
			for _, su := range list {
				if su.PasswordHash != "" {
					hasValidHash = true
				}
				s.users[su.Email] = &models.User{
					ID:           su.ID,
					TenantID:     su.TenantID,
					Name:         su.Name,
					Email:        su.Email,
					PasswordHash: su.PasswordHash,
					Role:         su.Role,
					Status:       su.Status,
					CreatedAt:    su.CreatedAt,
					LastLogin:    su.LastLogin,
				}
			}
			if hasValidHash {
				return
			}
		}
	}

	// Seed default demonstration users
	defaultUsers := []struct {
		Name     string
		Email    string
		Password string
		Role     models.UserRole
	}{
		{"Administrador Geral", "admin@netpulse.com", "admin123", models.RoleAdmin},
		{"Operador NOC", "operador@netpulse.com", "operador123", models.RoleNOCOperator},
		{"Diretoria / Visualizador", "diretoria@netpulse.com", "diretoria123", models.RoleViewer},
	}

	for _, d := range defaultUsers {
		hash, _ := bcrypt.GenerateFromPassword([]byte(d.Password), bcrypt.DefaultCost)
		id := "usr-" + generateID()
		u := &models.User{
			ID:           id,
			TenantID:     "default-tenant",
			Name:         d.Name,
			Email:        d.Email,
			PasswordHash: string(hash),
			Role:         d.Role,
			Status:       "active",
			CreatedAt:    time.Now(),
		}
		s.users[u.Email] = u
	}
	s.saveLocked()
}

func (s *MemoryUserStore) saveLocked() {
	var list []*storedUser
	for _, u := range s.users {
		list = append(list, &storedUser{
			ID:           u.ID,
			TenantID:     u.TenantID,
			Name:         u.Name,
			Email:        u.Email,
			PasswordHash: u.PasswordHash,
			Role:         u.Role,
			Status:       u.Status,
			CreatedAt:    u.CreatedAt,
			LastLogin:    u.LastLogin,
		})
	}
	data, _ := json.MarshalIndent(list, "", "  ")
	_ = os.WriteFile(s.filePath, data, 0644)
}

func (s *MemoryUserStore) GetByEmail(email string) (*models.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	u, ok := s.users[email]
	if !ok {
		return nil, fmt.Errorf("usuário não encontrado")
	}
	return u, nil
}

func (s *MemoryUserStore) GetByID(id string) (*models.User, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	for _, u := range s.users {
		if u.ID == id {
			return u, nil
		}
	}
	return nil, fmt.Errorf("usuário não encontrado")
}

func (s *MemoryUserStore) UpdateLastLogin(userID string) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	for _, u := range s.users {
		if u.ID == userID {
			now := time.Now()
			u.LastLogin = &now
			s.saveLocked()
			return nil
		}
	}
	return nil
}

func (s *MemoryUserStore) ListUsers(tenantID string) ([]models.UserProfile, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()
	var res []models.UserProfile
	for _, u := range s.users {
		res = append(res, u.ToProfile())
	}
	return res, nil
}
