package models

import "time"

// ComplianceStatus indicates the verification state of a compliance check item.
type ComplianceStatus string

const (
	CompliancePassed  ComplianceStatus = "passed"
	ComplianceWarning ComplianceStatus = "warning"
	ComplianceFailed  ComplianceStatus = "failed"
)

// ComplianceCheckItem represents a single audited rule in the router's configuration.
type ComplianceCheckItem struct {
	ID          string           `json:"id"`
	Category    string           `json:"category"` // connectivity, bgp_core, traffic_engineering, telemetry
	Title       string           `json:"title"`
	Description string           `json:"description"`
	Status      ComplianceStatus `json:"status"` // passed, warning, failed
	Message     string           `json:"message"`
	FoundValue  string           `json:"found_value,omitempty"`
	Remediation string           `json:"remediation,omitempty"`
}

// DeviceComplianceAudit contains the full smart inspection report of a router's configuration.
type DeviceComplianceAudit struct {
	DeviceID          string                `json:"device_id"`
	DeviceName        string                `json:"device_name"`
	Vendor            VendorType            `json:"vendor"`
	Host              string                `json:"host"`
	AuditedAt         time.Time             `json:"audited_at"`
	IsManageable      bool                  `json:"is_manageable"`   // True if safe and ready for NetPulse traffic operations
	OverallStatus     ComplianceStatus      `json:"overall_status"` // passed, warning, failed
	OverallScore      int                   `json:"overall_score"`  // 0 to 100%
	Summary           string                `json:"summary"`
	LocalASN          string                `json:"local_asn,omitempty"`
	RouterID          string                `json:"router_id,omitempty"`
	ActiveSessions    int                   `json:"active_sessions"`
	TotalSessions     int                   `json:"total_sessions"`
	HasOriginTagging  bool                  `json:"has_origin_tagging"`
	HasExportPolicy   bool                  `json:"has_export_policy"`
	HasTelemetry      bool                  `json:"has_telemetry"`
	Items             []ComplianceCheckItem `json:"items"`
	RemediationScript string                `json:"remediation_script,omitempty"`
}
