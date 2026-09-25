package models

import (
	"time"
)

// Standard Audit Actions
const (
	ActionAddStaticRoute    = "ADD_STATIC_ROUTE"
	ActionDeleteStaticRoute = "DELETE_STATIC_ROUTE"
	ActionApplyPrepend      = "APPLY_BGP_PREPEND"
	ActionCreateDevice      = "CREATE_DEVICE"
	ActionUpdateDevice      = "UPDATE_DEVICE"
	ActionDeleteDevice      = "DELETE_DEVICE"
	ActionUpdateASMetadata  = "UPDATE_AS_METADATA"
	ActionUserLogin         = "USER_LOGIN"
	ActionCreateTenant      = "CREATE_TENANT"
	ActionUpdateTenant      = "UPDATE_TENANT"
	ActionDeleteTenant      = "DELETE_TENANT"
	ActionCreateUser        = "CREATE_USER"
	ActionUpdateUser        = "UPDATE_USER"
	ActionDeleteUser        = "DELETE_USER"
)

// AuditLog represents an immutable record of an operator action.
type AuditLog struct {
	ID               string         `json:"id"`
	TenantID         string         `json:"tenant_id"`
	Timestamp        time.Time      `json:"timestamp"`
	UserID           string         `json:"user_id"`
	UserName         string         `json:"user_name"`
	UserEmail        string         `json:"user_email"`
	ClientIP         string         `json:"client_ip"`
	Action           string         `json:"action"`
	TargetDeviceID   string         `json:"target_device_id,omitempty"`
	TargetDeviceName string         `json:"target_device_name,omitempty"`
	CommandExecuted  string         `json:"command_executed"`
	Status           string         `json:"status"` // "SUCCESS", "FAILED", "MANUAL_DISPATCH"
	Metadata         map[string]any `json:"metadata,omitempty"`
}

// AuditFilter contains query criteria for retrieving audit logs.
type AuditFilter struct {
	TenantID string
	DeviceID string
	UserID   string
	Action   string
	Limit    int
	Offset   int
}

// AuditListResponse is the paginated response for audit trail queries.
type AuditListResponse struct {
	Logs   []AuditLog `json:"logs"`
	Total  int        `json:"total"`
	Limit  int        `json:"limit"`
	Offset int        `json:"offset"`
}
