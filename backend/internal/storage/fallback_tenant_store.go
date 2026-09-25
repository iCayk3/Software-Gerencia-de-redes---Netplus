package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"network-software/internal/models"
)

var (
	ErrTenantNotFound = errors.New("tenant not found")
	ErrTenantExists   = errors.New("tenant slug or id already exists")
)

// MemoryTenantStore handles in-memory and local JSON persistence for client companies.
type MemoryTenantStore struct {
	mu       sync.RWMutex
	filePath string
	tenants  map[string]models.Tenant
}

func NewMemoryTenantStore(filePath string) *MemoryTenantStore {
	store := &MemoryTenantStore{
		filePath: filePath,
		tenants:  make(map[string]models.Tenant),
	}
	store.loadOrSeed()
	return store
}

func (s *MemoryTenantStore) loadOrSeed() {
	s.mu.Lock()
	defer s.mu.Unlock()

	_ = os.MkdirAll(filepath.Dir(s.filePath), 0755)
	data, err := os.ReadFile(s.filePath)
	if err == nil {
		var list []models.Tenant
		if err := json.Unmarshal(data, &list); err == nil && len(list) > 0 {
			for _, t := range list {
				s.tenants[t.ID] = t
			}
			return
		}
	}

	// Default seed companies
	defaultTenants := []models.Tenant{
		{
			ID:           "default-tenant",
			Name:         "Netplus Telecom (NOC Central)",
			Slug:         "netplus",
			ASN:          "267943",
			Document:     "00.000.000/0001-00",
			ContactEmail: "noc@netplus.com.br",
			ContactPhone: "+55 (11) 3000-0000",
			Plan:         "enterprise",
			Status:       "active",
			CreatedAt:    time.Now().Add(-30 * 24 * time.Hour),
		},
		{
			ID:           "tenant-alpha",
			Name:         "Alpha Fibra Internet (Cliente)",
			Slug:         "alpha-fibra",
			ASN:          "26162",
			Document:     "12.345.678/0001-90",
			ContactEmail: "noc@alphafibra.com.br",
			ContactPhone: "+55 (11) 4000-1122",
			Plan:         "enterprise",
			Status:       "active",
			CreatedAt:    time.Now().Add(-10 * 24 * time.Hour),
		},
		{
			ID:           "tenant-beta",
			Name:         "Beta Telecom Conectividade (Cliente)",
			Slug:         "beta-telecom",
			ASN:          "266445",
			Document:     "98.765.432/0001-10",
			ContactEmail: "noc@betatelecom.com.br",
			ContactPhone: "+55 (61) 3200-9988",
			Plan:         "pro",
			Status:       "active",
			CreatedAt:    time.Now().Add(-5 * 24 * time.Hour),
		},
	}

	for _, t := range defaultTenants {
		s.tenants[t.ID] = t
	}
	s.saveLocked()
}

func (s *MemoryTenantStore) saveLocked() error {
	list := make([]models.Tenant, 0, len(s.tenants))
	for _, t := range s.tenants {
		list = append(list, t)
	}
	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.filePath, data, 0644)
}

func (s *MemoryTenantStore) GetAll() ([]models.Tenant, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]models.Tenant, 0, len(s.tenants))
	for _, t := range s.tenants {
		result = append(result, t)
	}
	return result, nil
}

func (s *MemoryTenantStore) GetByID(id string) (*models.Tenant, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	t, ok := s.tenants[id]
	if !ok {
		return nil, ErrTenantNotFound
	}
	return &t, nil
}

func (s *MemoryTenantStore) GetBySlug(slug string) (*models.Tenant, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	target := strings.ToLower(slug)
	for _, t := range s.tenants {
		if strings.ToLower(t.Slug) == target {
			return &t, nil
		}
	}
	return nil, ErrTenantNotFound
}

func (s *MemoryTenantStore) Create(t models.Tenant) (*models.Tenant, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if t.ID == "" {
		t.ID = "tenant-" + generateID()
	}
	if t.Slug == "" {
		t.Slug = strings.ToLower(strings.ReplaceAll(t.Name, " ", "-"))
	}
	if t.Status == "" {
		t.Status = "active"
	}
	if t.Plan == "" {
		t.Plan = "enterprise"
	}
	t.CreatedAt = time.Now()

	// Check duplicates
	if _, exists := s.tenants[t.ID]; exists {
		return nil, ErrTenantExists
	}
	for _, existing := range s.tenants {
		if strings.EqualFold(existing.Slug, t.Slug) {
			return nil, fmt.Errorf("já existe uma empresa com o slug '%s'", t.Slug)
		}
	}

	s.tenants[t.ID] = t
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return &t, nil
}

func (s *MemoryTenantStore) Update(t models.Tenant) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, ok := s.tenants[t.ID]
	if !ok {
		return ErrTenantNotFound
	}

	if t.Name != "" {
		existing.Name = t.Name
	}
	if t.Slug != "" {
		existing.Slug = t.Slug
	}
	if t.ASN != "" {
		existing.ASN = t.ASN
	}
	if t.Document != "" {
		existing.Document = t.Document
	}
	if t.ContactEmail != "" {
		existing.ContactEmail = t.ContactEmail
	}
	if t.ContactPhone != "" {
		existing.ContactPhone = t.ContactPhone
	}
	if t.LogoURL != "" {
		existing.LogoURL = t.LogoURL
	}
	if t.Plan != "" {
		existing.Plan = t.Plan
	}
	if t.Status != "" {
		existing.Status = t.Status
	}

	s.tenants[t.ID] = existing
	return s.saveLocked()
}

func (s *MemoryTenantStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if id == "default-tenant" {
		return errors.New("a empresa central (default-tenant) não pode ser excluída")
	}

	if _, ok := s.tenants[id]; !ok {
		return ErrTenantNotFound
	}

	delete(s.tenants, id)
	return s.saveLocked()
}
