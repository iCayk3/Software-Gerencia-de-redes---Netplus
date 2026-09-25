package models

import (
	"time"
)

// ProfileTag categorizes the operational intent of a profile.
type ProfileTag string

const (
	ProfileTagNormal      ProfileTag = "normal"      // Nominal day-to-day operation
	ProfileTagContingency ProfileTag = "contingency" // Link failure or mitigation scenario
	ProfileTagMaintenance ProfileTag = "maintenance" // Scheduled provider maintenance
	ProfileTagPeak        ProfileTag = "peak"        // High-traffic event / equal balancing
	ProfileTagCustom      ProfileTag = "custom"      // User-defined profile
)

// ProfilePrependRule defines how an AS group / peer announcements and prepends should be set.
type ProfilePrependRule struct {
	DeviceID     string `json:"device_id"`               // "all" or specific device ID
	RemoteAS     string `json:"remote_as"`               // e.g. "20121", "266445", "262503", "26162"
	GroupName    string `json:"group_name"`              // e.g. "PTT São Paulo", "SEA Telecom", "Wiki Telecom"
	Prefix       string `json:"prefix,omitempty"`        // "" or specific prefix like "45.166.28.0/22"
	PrependCount int    `json:"prepend_count"`           // 0, 1, 2, 3, etc.
	Block        bool   `json:"block"`                   // true = block announcement
}

// ProfileLocalPrefRule defines the BGP Local-Preference to be set for upload traffic engineering.
type ProfileLocalPrefRule struct {
	DeviceID   string `json:"device_id"`
	DeviceName string `json:"device_name,omitempty"`
	RemoteAS   string `json:"remote_as"`
	PeerIP     string `json:"peer_ip"`
	PeerName   string `json:"peer_name,omitempty"`
	LocalPref  int    `json:"local_pref"` // 100, 150, 200, 700, etc.
	PolicyName string `json:"policy_name,omitempty"`
	PolicyNode int    `json:"policy_node,omitempty"`
}

// ProfileRouteRule defines static routes that should exist or be activated for upload.
type ProfileRouteRule struct {
	DeviceID    string `json:"device_id"`
	DeviceName  string `json:"device_name,omitempty"`
	Destination string `json:"destination"` // e.g. "0.0.0.0/0"
	NextHop     string `json:"next_hop"`
	Preference  int    `json:"preference"`
	Description string `json:"description"`
}

// TrafficProfile represents a complete preset / template of Traffic Engineering policies.
type TrafficProfile struct {
	ID          string                 `json:"id"`
	TenantID    string                 `json:"tenant_id,omitempty"`
	Name        string                 `json:"name"`
	Description string                 `json:"description"`
	Tag         ProfileTag             `json:"tag"`
	Color       string                 `json:"color"`      // "emerald", "cyan", "amber", "rose", "purple"
	IsActive    bool                   `json:"is_active"`  // Currently applied profile
	IsDefault   bool                   `json:"is_default"` // Factory default reference
	CreatedAt   time.Time              `json:"created_at"`
	UpdatedAt   time.Time              `json:"updated_at"`
	Prepends    []ProfilePrependRule   `json:"prepends"`
	LocalPrefs  []ProfileLocalPrefRule `json:"local_prefs"`
	Routes      []ProfileRouteRule     `json:"routes"`
}

// PrependDiff represents the difference in prepend for a peer/prefix between current state and target profile.
type PrependDiff struct {
	DeviceID     string `json:"device_id"`
	GroupName    string `json:"group_name"`
	RemoteAS     string `json:"remote_as"`
	Prefix       string `json:"prefix"`
	CurrentCount int    `json:"current_count"`
	TargetCount  int    `json:"target_count"`
	CurrentBlock bool   `json:"current_block"`
	TargetBlock  bool   `json:"target_block"`
	Changed      bool   `json:"changed"`
}

// LocalPrefDiff represents the difference in local preference between current state and target profile.
type LocalPrefDiff struct {
	DeviceID     string `json:"device_id"`
	PeerIP       string `json:"peer_ip"`
	PeerName     string `json:"peer_name"`
	RemoteAS     string `json:"remote_as"`
	CurrentPref  int    `json:"current_pref"`
	TargetPref   int    `json:"target_pref"`
	Changed      bool   `json:"changed"`
}

// RouteDiff represents static routes to add or modify.
type RouteDiff struct {
	DeviceID    string `json:"device_id"`
	Destination string `json:"destination"`
	NextHop     string `json:"next_hop"`
	Preference  int    `json:"preference"`
	Action      string `json:"action"` // "ADD", "DELETE", "KEEP"
}

// ProfileDiffSummary aggregates all changes required to transition from the current state to the target profile.
type ProfileDiffSummary struct {
	ProfileID         string          `json:"profile_id"`
	ProfileName       string          `json:"profile_name"`
	TotalChanges      int             `json:"total_changes"`
	PrependsDiff      []PrependDiff   `json:"prepends_diff"`
	LocalPrefsDiff    []LocalPrefDiff `json:"local_prefs_diff"`
	RoutesDiff        []RouteDiff     `json:"routes_diff"`
}

// ApplyProfileRequest is the payload to stage and/or execute a traffic engineering profile.
type ApplyProfileRequest struct {
	ProfileID   string `json:"profile_id"`
	AutoExecute bool   `json:"auto_execute"` // If true, dispatches via SSH; if false, generates staging scripts
}

// ApplyProfileResult returns the outcome and generated scripts for each router.
type ApplyProfileResult struct {
	ProfileID        string              `json:"profile_id"`
	ProfileName      string              `json:"profile_name"`
	Status           string              `json:"status"` // "SUCCESS", "MANUAL_DISPATCH", "FAILED"
	Executed         bool                `json:"executed"`
	Message          string              `json:"message"`
	DiffSummary      *ProfileDiffSummary `json:"diff_summary"`
	ScriptsByDevice  map[string]string   `json:"scripts_by_device"`  // deviceID -> formatted CLI script
	CommandsByDevice map[string][]string `json:"commands_by_device"` // deviceID -> individual CLI commands
}
