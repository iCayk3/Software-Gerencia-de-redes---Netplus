package models

import "time"

type LicenseStatus string

const (
	StatusActive      LicenseStatus = "active"
	StatusGracePeriod LicenseStatus = "grace_period"
	StatusExpired     LicenseStatus = "expired"
	StatusSuspended   LicenseStatus = "suspended"
)

type LicenseTier string

const (
	TierTrial      LicenseTier = "trial"
	TierStarter    LicenseTier = "starter"
	TierPro        LicenseTier = "pro"
	TierEnterprise LicenseTier = "enterprise"
)

type License struct {
	ID              string        `json:"id"`
	Key             string        `json:"key"`
	ClientName      string        `json:"client_name"`
	ClientEmail     string        `json:"client_email"`
	Tier            LicenseTier   `json:"tier"`
	MaxDevices      int           `json:"max_devices"` // 0 = unlimited
	Status          LicenseStatus `json:"status"`
	IssuedAt        time.Time     `json:"issued_at"`
	ExpiresAt       time.Time     `json:"expires_at"`
	GracePeriodDays int           `json:"grace_period_days"`
	Features        []string      `json:"features"`
	Notes           string        `json:"notes"`

	// Live Heartbeat telemetry from client edge instance
	LastHeartbeat     *time.Time `json:"last_heartbeat,omitempty"`
	LastInstanceID    string     `json:"last_instance_id,omitempty"`
	LastHostname      string     `json:"last_hostname,omitempty"`
	LastRemoteIP      string     `json:"last_remote_ip,omitempty"`
	LastVersion       string     `json:"last_version,omitempty"`
	LastDeviceCount   int        `json:"last_device_count"`
	LastUptimeSeconds int64      `json:"last_uptime_seconds"`
}

// ComputeStatus calculates effective status based on expiration and grace period
func (l *License) ComputeStatus() LicenseStatus {
	if l.Status == StatusSuspended {
		return StatusSuspended
	}

	now := time.Now()
	if now.Before(l.ExpiresAt) {
		return StatusActive
	}

	graceEnd := l.ExpiresAt.Add(time.Duration(l.GracePeriodDays) * 24 * time.Hour)
	if now.Before(graceEnd) {
		return StatusGracePeriod
	}

	return StatusExpired
}

// IsOnline returns true if a heartbeat was received within the last 45 minutes
func (l *License) IsOnline() bool {
	if l.LastHeartbeat == nil {
		return false
	}
	return time.Since(*l.LastHeartbeat) < 45*time.Minute
}

type HeartbeatPayload struct {
	InstanceID    string `json:"instance_id"`
	LicenseKey    string `json:"license_key"`
	ClientName    string `json:"client_name"`
	Version       string `json:"version"`
	DeviceCount   int    `json:"device_count"`
	Hostname      string `json:"hostname"`
	UptimeSeconds int64  `json:"uptime_seconds"`
}

type HeartbeatResponse struct {
	Status     LicenseStatus `json:"status"`
	Tier       LicenseTier   `json:"tier"`
	ClientName string        `json:"client_name"`
	ExpiresAt  time.Time     `json:"expires_at"`
	MaxDevices int           `json:"max_devices"`
	Features   []string      `json:"features"`
	Message    string        `json:"message"`
}

type CreateLicenseRequest struct {
	ClientName      string      `json:"client_name"`
	ClientEmail     string      `json:"client_email"`
	Tier            LicenseTier `json:"tier"`
	MaxDevices      int         `json:"max_devices"`
	ValidDays       int         `json:"valid_days"`
	ExpiresAt       *time.Time  `json:"expires_at,omitempty"`
	GracePeriodDays int         `json:"grace_period_days"`
	Features        []string    `json:"features"`
	Notes           string      `json:"notes"`
}

type UpdateLicenseRequest struct {
	ClientName      string         `json:"client_name"`
	ClientEmail     string         `json:"client_email"`
	Tier            LicenseTier    `json:"tier"`
	MaxDevices      int            `json:"max_devices"`
	Status          *LicenseStatus `json:"status,omitempty"`
	ExpiresAt       *time.Time     `json:"expires_at,omitempty"`
	GracePeriodDays int            `json:"grace_period_days"`
	Features        []string       `json:"features"`
	Notes           string         `json:"notes"`
}

type FleetOverview struct {
	TotalClients    int `json:"total_clients"`
	ActiveLicenses  int `json:"active_licenses"`
	OnlineInstances int `json:"online_instances"`
	TotalMonitored  int `json:"total_monitored_devices"`
	ExpiringSoon    int `json:"expiring_soon_count"` // within 15 days
}
