package license

import "time"

// LicenseStatus represents the lifecycle state of a license
type LicenseStatus string

const (
	StatusActive      LicenseStatus = "active"
	StatusGracePeriod LicenseStatus = "grace_period"
	StatusExpired     LicenseStatus = "expired"
	StatusTrial       LicenseStatus = "trial"
	StatusSuspended   LicenseStatus = "suspended"
	StatusUnlicensed  LicenseStatus = "unlicensed"
)

// LicenseTier defines the subscription plan tier
type LicenseTier string

const (
	TierTrial      LicenseTier = "trial"
	TierStarter    LicenseTier = "starter"
	TierPro        LicenseTier = "pro"
	TierEnterprise LicenseTier = "enterprise"
)

// LicenseInfo holds public and operational details about the active license
type LicenseInfo struct {
	Key              string        `json:"key"`
	Tier             LicenseTier   `json:"tier"`
	ClientName       string        `json:"client_name"`
	MaxDevices       int           `json:"max_devices"` // 0 = unlimited
	DeviceUsage      int           `json:"device_usage"`
	IssuedAt         time.Time     `json:"issued_at"`
	ExpiresAt        time.Time     `json:"expires_at"`
	DaysRemaining    int           `json:"days_remaining"`
	Status           LicenseStatus `json:"status"`
	Features         []string      `json:"features"`
	GracePeriodDays  int           `json:"grace_period_days"`
	LastHeartbeat    time.Time     `json:"last_heartbeat"`
	MasterConnected  bool          `json:"master_connected"`
	MasterURL        string        `json:"master_url"`
	InstanceID       string        `json:"instance_id"`
}

// HeartbeatPayload is sent to the central Master Server
type HeartbeatPayload struct {
	InstanceID     string `json:"instance_id"`
	LicenseKey     string `json:"license_key"`
	ClientName     string `json:"client_name"`
	Version        string `json:"version"`
	DeviceCount    int    `json:"device_count"`
	Hostname       string `json:"hostname"`
	UptimeSeconds  int64  `json:"uptime_seconds"`
}

// HeartbeatResponse is received from the central Master Server
type HeartbeatResponse struct {
	Status     LicenseStatus `json:"status"`
	Tier       LicenseTier   `json:"tier"`
	ClientName string        `json:"client_name"`
	ExpiresAt  time.Time     `json:"expires_at"`
	MaxDevices int           `json:"max_devices"`
	Features   []string      `json:"features"`
	Message    string        `json:"message"`
}

// ActivateRequest payload to activate a new key
type ActivateRequest struct {
	Key string `json:"key"`
}
