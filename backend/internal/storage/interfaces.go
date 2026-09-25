package storage

import (
	"network-software/internal/models"
)

// ITenantStore defines the contract for multi-tenant client companies management.
type ITenantStore interface {
	GetAll() ([]models.Tenant, error)
	GetByID(id string) (*models.Tenant, error)
	GetBySlug(slug string) (*models.Tenant, error)
	Create(t models.Tenant) (*models.Tenant, error)
	Update(t models.Tenant) error
	Delete(id string) error
}

// IUserStore defines the contract for user authentication and management.
type IUserStore interface {
	GetByEmail(email string) (*models.User, error)
	GetByID(id string) (*models.User, error)
	UpdateLastLogin(userID string) error
	ListUsers(tenantID string) ([]models.UserProfile, error)
	CreateUser(u models.User) (*models.User, error)
	UpdateUser(u models.User) error
	DeleteUser(id string) error
}

// IAuditStore defines the contract for immutable audit trail recording and queries.
type IAuditStore interface {
	Record(entry *models.AuditLog) error
	Query(filter models.AuditFilter) ([]models.AuditLog, int, error)
}
