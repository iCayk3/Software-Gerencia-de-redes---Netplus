package storage

import (
	"network-software/internal/models"
)

// IUserStore defines the contract for user authentication and management.
type IUserStore interface {
	GetByEmail(email string) (*models.User, error)
	GetByID(id string) (*models.User, error)
	UpdateLastLogin(userID string) error
	ListUsers(tenantID string) ([]models.UserProfile, error)
}

// IAuditStore defines the contract for immutable audit trail recording and queries.
type IAuditStore interface {
	Record(entry *models.AuditLog) error
	Query(filter models.AuditFilter) ([]models.AuditLog, int, error)
}
