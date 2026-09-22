package models

import "time"

// ASMetadata defines custom branding and operational role for an Autonomous System.
type ASMetadata struct {
	ASN           string    `json:"asn"`                      // e.g. "266445" or "26162"
	Alias         string    `json:"alias"`                    // e.g. "SEA Telecom (Trânsito Primário)"
	ImageURL      string    `json:"image_url,omitempty"`      // e.g. "/api/uploads/as266445.png" or base64 or external URL
	Description   string    `json:"description,omitempty"`    // e.g. "Circuito dedicado 10Gbps via SEA"
	Role          string    `json:"role,omitempty"`           // "transit_primary", "transit_secondary", "ix_ptt", "peering", "other"
	Color         string    `json:"color,omitempty"`          // UI badge or accent color
	CustomGateway string    `json:"custom_gateway,omitempty"` // Optional override next-hop IP
	UpdatedAt     time.Time `json:"updated_at"`
}

// BGPASSection represents a BGP peer / transit section grouped for traffic engineering.
type BGPASSection struct {
	ID               string        `json:"id"`
	DeviceID         string        `json:"device_id"`
	DeviceName       string        `json:"device_name"`
	DeviceHost       string        `json:"device_host"`
	DeviceVendor     string        `json:"device_vendor"`
	RemoteAS         string        `json:"remote_as"`
	LocalAS          string        `json:"local_as"`
	PeerIP           string        `json:"peer_ip"`
	PeerName         string        `json:"peer_name"` // from BGP description, e.g. "BGP-SEA"
	BGPState         string        `json:"bgp_state"` // "Established", "Active", etc.
	Uptime           string        `json:"uptime"`
	PrefixesReceived int           `json:"prefixes_received"`
	LocalPref        int           `json:"local_pref"`                 // e.g. 200, 150, 700
	ImportPolicy     string        `json:"import_policy,omitempty"`     // e.g. "SEA-IN"
	ImportPolicyNode int           `json:"import_policy_node,omitempty"`// e.g. 11, 99
	Metadata         ASMetadata    `json:"metadata"`
	StaticRoutes     []StaticRoute `json:"static_routes"`
}

// UploadOverviewResponse represents the consolidated Traffic Engineering overview for Upload.
type UploadOverviewResponse struct {
	Sections     []BGPASSection `json:"sections"`
	OtherRoutes  []StaticRoute  `json:"other_routes"`
	LastSyncTime *time.Time     `json:"last_sync_time,omitempty"`
}

// ASMetadataUpdateRequest is the payload for creating or updating AS metadata.
type ASMetadataUpdateRequest struct {
	ASN           string `json:"asn"`
	Alias         string `json:"alias"`
	ImageURL      string `json:"image_url,omitempty"`
	Description   string `json:"description,omitempty"`
	Role          string `json:"role,omitempty"`
	Color         string `json:"color,omitempty"`
	CustomGateway string `json:"custom_gateway,omitempty"`
}

// LocalPrefApplyRequest is the payload to change generic BGP Local-Preference on a peer/AS.
type LocalPrefApplyRequest struct {
	DeviceID   string `json:"device_id"`
	PeerIP     string `json:"peer_ip"`
	RemoteAS   string `json:"remote_as"`
	LocalPref  int    `json:"local_pref"`
	PolicyName string `json:"policy_name,omitempty"`
	Node       int    `json:"node,omitempty"`
}

// BGPImportPolicyInfo contains the import policy, permit node, and local-preference for a peer.
type BGPImportPolicyInfo struct {
	PolicyName string `json:"policy_name"`
	Node       int    `json:"node"`
	LocalPref  int    `json:"local_pref"`
}

