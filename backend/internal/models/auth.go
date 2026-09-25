package models

import (
	"time"

	"github.com/golang-jwt/jwt/v5"
)

// UserRole defines the access level for RBAC.
type UserRole string

const (
	RoleAdmin       UserRole = "admin"        // Full platform access, device creation/editing, user management
	RoleNOCOperator UserRole = "noc_operator" // Can inject/delete static routes, trigger BGP refreshes
	RoleViewer      UserRole = "viewer"       // Read-only dashboard viewer (e.g. NOC L1, Directors, Clients)
)

// User represents an operator or tenant administrator.
type User struct {
	ID           string     `json:"id"`
	TenantID     string     `json:"tenant_id"`
	Name         string     `json:"name"`
	Email        string     `json:"email"`
	PasswordHash string     `json:"-"` // Never serialized to JSON
	Role         UserRole   `json:"role"`
	IsSuperAdmin bool       `json:"is_superadmin"`
	Status       string     `json:"status"` // "active", "suspended"
	CreatedAt    time.Time  `json:"created_at"`
	LastLogin    *time.Time `json:"last_login,omitempty"`
}

// UserProfile is the safe public view of a User.
type UserProfile struct {
	ID           string     `json:"id"`
	TenantID     string     `json:"tenant_id"`
	TenantName   string     `json:"tenant_name,omitempty"`
	Name         string     `json:"name"`
	Email        string     `json:"email"`
	Role         UserRole   `json:"role"`
	IsSuperAdmin bool       `json:"is_superadmin"`
	Status       string     `json:"status"`
	CreatedAt    time.Time  `json:"created_at"`
	LastLogin    *time.Time `json:"last_login,omitempty"`
}

// ToProfile converts a User to a safe UserProfile.
func (u *User) ToProfile() UserProfile {
	return UserProfile{
		ID:           u.ID,
		TenantID:     u.TenantID,
		Name:         u.Name,
		Email:        u.Email,
		Role:         u.Role,
		IsSuperAdmin: u.IsSuperAdmin,
		Status:       u.Status,
		CreatedAt:    u.CreatedAt,
		LastLogin:    u.LastLogin,
	}
}

// LoginRequest is the payload sent to /api/auth/login.
type LoginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

// LoginResponse returns the JWT and authenticated user info.
type LoginResponse struct {
	Token     string      `json:"token"`
	ExpiresAt time.Time   `json:"expires_at"`
	User      UserProfile `json:"user"`
}

// UserClaims is the JWT claims payload.
type UserClaims struct {
	UserID       string   `json:"user_id"`
	TenantID     string   `json:"tenant_id"`
	Email        string   `json:"email"`
	Name         string   `json:"name"`
	Role         UserRole `json:"role"`
	IsSuperAdmin bool     `json:"is_superadmin"`
	jwt.RegisteredClaims
}

// CreateUserRequest is the payload to create a new user.
type CreateUserRequest struct {
	TenantID     string   `json:"tenant_id"`
	Name         string   `json:"name"`
	Email        string   `json:"email"`
	Password     string   `json:"password"`
	Role         UserRole `json:"role"`
	IsSuperAdmin bool     `json:"is_superadmin"`
}

// UpdateUserRequest is the payload to update an existing user.
type UpdateUserRequest struct {
	TenantID     string   `json:"tenant_id,omitempty"`
	Name         string   `json:"name,omitempty"`
	Email        string   `json:"email,omitempty"`
	Password     string   `json:"password,omitempty"`
	Role         UserRole `json:"role,omitempty"`
	Status       string   `json:"status,omitempty"`
	IsSuperAdmin *bool    `json:"is_superadmin,omitempty"`
}
