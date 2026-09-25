package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
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
	IsSuperAdmin bool            `json:"is_superadmin"`
	Status       string          `json:"status"`
	CreatedAt    time.Time       `json:"created_at"`
	LastLogin    *time.Time      `json:"last_login,omitempty"`
}

func (s *MemoryUserStore) loadOrSeed() {
	s.mu.Lock()
	defer s.mu.Unlock()

	_ = os.MkdirAll(filepath.Dir(s.filePath), 0755)
	data, err := os.ReadFile(s.filePath)
	if err == nil {
		var list []*storedUser
		if err := json.Unmarshal(data, &list); err == nil && len(list) > 0 {
			hasValidHash := false
			for _, su := range list {
				if su.PasswordHash != "" {
					hasValidHash = true
				}
				isSuper := su.IsSuperAdmin
				if su.Email == "admin@netpulse.com" || (su.Role == models.RoleAdmin && (su.TenantID == "default-tenant" || su.TenantID == "")) {
					isSuper = true
				}
				tenantID := su.TenantID
				if tenantID == "" {
					tenantID = "default-tenant"
				}
				s.users[su.Email] = &models.User{
					ID:           su.ID,
					TenantID:     tenantID,
					Name:         su.Name,
					Email:        su.Email,
					PasswordHash: su.PasswordHash,
					Role:         su.Role,
					IsSuperAdmin: isSuper,
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

	// Seed default demonstration users across tenants
	defaultUsers := []struct {
		Name         string
		Email        string
		Password     string
		Role         models.UserRole
		TenantID     string
		IsSuperAdmin bool
	}{
		{"Administrador Geral (Netplus)", "admin@netpulse.com", "admin123", models.RoleAdmin, "default-tenant", true},
		{"Operador NOC (Netplus)", "operador@netpulse.com", "operador123", models.RoleNOCOperator, "default-tenant", false},
		{"Diretoria (Netplus)", "diretoria@netpulse.com", "diretoria123", models.RoleViewer, "default-tenant", false},
		{"Admin Alpha Fibra (Cliente)", "admin@alphafibra.com.br", "alpha123", models.RoleAdmin, "tenant-alpha", false},
		{"Operador BGP Alpha (Cliente)", "operador@alphafibra.com.br", "operador123", models.RoleNOCOperator, "tenant-alpha", false},
		{"Operador NOC Beta (Cliente)", "noc@betatelecom.com.br", "beta123", models.RoleNOCOperator, "tenant-beta", false},
	}

	for _, d := range defaultUsers {
		hash, _ := bcrypt.GenerateFromPassword([]byte(d.Password), bcrypt.DefaultCost)
		id := "usr-" + generateID()
		u := &models.User{
			ID:           id,
			TenantID:     d.TenantID,
			Name:         d.Name,
			Email:        d.Email,
			PasswordHash: string(hash),
			Role:         d.Role,
			IsSuperAdmin: d.IsSuperAdmin,
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
			IsSuperAdmin: u.IsSuperAdmin,
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
		if tenantID == "" || tenantID == "all" || u.TenantID == tenantID {
			res = append(res, u.ToProfile())
		}
	}
	return res, nil
}

func (s *MemoryUserStore) CreateUser(u models.User) (*models.User, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, exists := s.users[u.Email]; exists {
		return nil, errors.New("já existe um usuário com este e-mail")
	}

	if u.ID == "" {
		u.ID = "usr-" + generateID()
	}
	if u.TenantID == "" {
		u.TenantID = "default-tenant"
	}
	if u.Status == "" {
		u.Status = "active"
	}
	u.CreatedAt = time.Now()

	userCopy := u
	s.users[u.Email] = &userCopy
	s.saveLocked()
	return &userCopy, nil
}

func (s *MemoryUserStore) UpdateUser(u models.User) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var existing *models.User
	for _, usr := range s.users {
		if usr.ID == u.ID {
			existing = usr
			break
		}
	}

	if existing == nil {
		return errors.New("usuário não encontrado")
	}

	if u.Name != "" {
		existing.Name = u.Name
	}
	if u.Role != "" {
		existing.Role = u.Role
	}
	if u.TenantID != "" {
		existing.TenantID = u.TenantID
	}
	if u.Status != "" {
		existing.Status = u.Status
	}
	if u.PasswordHash != "" {
		existing.PasswordHash = u.PasswordHash
	}
	existing.IsSuperAdmin = u.IsSuperAdmin

	s.saveLocked()
	return nil
}

func (s *MemoryUserStore) DeleteUser(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	var targetEmail string
	for email, u := range s.users {
		if u.ID == id {
			targetEmail = email
			break
		}
	}

	if targetEmail == "" {
		return errors.New("usuário não encontrado")
	}

	delete(s.users, targetEmail)
	s.saveLocked()
	return nil
}
