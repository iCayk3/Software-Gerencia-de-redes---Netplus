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
	ID           string    `json:"id"`
	TenantID     string    `json:"tenant_id"`
	Name         string    `json:"name"`
	Email        string    `json:"email"`
	PasswordHash string    `json:"-"` // Never serialized to JSON
	Role         UserRole  `json:"role"`
	Status       string    `json:"status"` // "active", "suspended"
	CreatedAt    time.Time `json:"created_at"`
	LastLogin    *time.Time `json:"last_login,omitempty"`
}

// UserProfile is the safe public view of a User.
type UserProfile struct {
	ID        string     `json:"id"`
	TenantID  string     `json:"tenant_id"`
	Name      string     `json:"name"`
	Email     string     `json:"email"`
	Role      UserRole   `json:"role"`
	Status    string     `json:"status"`
	CreatedAt time.Time  `json:"created_at"`
	LastLogin *time.Time `json:"last_login,omitempty"`
}

// ToProfile converts a User to a safe UserProfile.
func (u *User) ToProfile() UserProfile {
	return UserProfile{
		ID:        u.ID,
		TenantID:  u.TenantID,
		Name:      u.Name,
		Email:     u.Email,
		Role:      u.Role,
		Status:    u.Status,
		CreatedAt: u.CreatedAt,
		LastLogin: u.LastLogin,
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
	UserID   string   `json:"user_id"`
	TenantID string   `json:"tenant_id"`
	Email    string   `json:"email"`
	Name     string   `json:"name"`
	Role     UserRole `json:"role"`
	jwt.RegisteredClaims
}
