package models

// BGPPeerPrepend represents the AS-Path Prepending status on a specific BGP peer/session.
type BGPPeerPrepend struct {
	ID           string `json:"id"`
	DeviceID     string `json:"device_id"`
	DeviceName   string `json:"device_name"`
	PeerIP       string `json:"peer_ip"`
	PeerName     string `json:"peer_name"`
	RemoteAS     string `json:"remote_as"`
	LocalAS      string `json:"local_as"`
	PrependCount int    `json:"prepend_count"` // 0 = Primary/None, 1, 2, 3, etc.
	PolicyName   string `json:"policy_name"`
	IsBlocked    bool   `json:"is_blocked"`
	Status       string `json:"status"` // "active", "down", etc.
}

// PrefixPrependState represents the announcement and prepend status of a specific IP prefix towards a peer.
type PrefixPrependState struct {
	ID           string `json:"id"`
	DeviceID     string `json:"device_id"`
	DeviceName   string `json:"device_name"`
	Prefix       string `json:"prefix"`
	PeerIP       string `json:"peer_ip"`
	PeerName     string `json:"peer_name"`
	PrependCount int    `json:"prepend_count"` // 0 = Primary, 1 = 1P, 2 = 2P, 3 = 3P
	IsBlocked    bool   `json:"is_blocked"`
	Community    string `json:"community,omitempty"`
	PolicyName   string `json:"policy_name,omitempty"`
}

// ASPrependGroup groups multiple peer sessions of the same operator/IX into a single logical entity.
type ASPrependGroup struct {
	ID            string               `json:"id"`
	DeviceID      string               `json:"device_id,omitempty"`
	DeviceName    string               `json:"device_name,omitempty"`
	RemoteAS      string               `json:"remote_as"`
	GroupName     string               `json:"group_name"`
	CommunityBase string               `json:"community_base"`
	Role          string               `json:"role"` // "transit_primary", "transit_secondary", "ix_ptt", "peering", "other"
	PeerCount     int                  `json:"peer_count"`
	PeerIPs       []string             `json:"peer_ips"`
	Peers         []BGPPeerPrepend     `json:"peers"`
	Prefixes      []PrefixPrependState `json:"prefixes"` // Distinct per prefix announced
}

// DevicePrependOverview groups all prepend data for a single router.
type DevicePrependOverview struct {
	DeviceID   string               `json:"device_id"`
	DeviceName string               `json:"device_name"`
	LocalAS    string               `json:"local_as"`
	Peers      []BGPPeerPrepend     `json:"peers"`
	Prefixes   []PrefixPrependState `json:"prefixes"`
	ASGroups   []ASPrependGroup     `json:"as_groups"`
}

// PrependApplyRequest is the request payload to change prepend on a peer or prefix.
type PrependApplyRequest struct {
	DeviceID     string `json:"device_id"`
	PeerIP       string `json:"peer_ip"`
	Prefix       string `json:"prefix,omitempty"` // If empty, applies to peer as a whole
	PrependCount int    `json:"prepend_count"`   // 0 = primary/remove prepend, 1..5 = prepends
	Block        bool   `json:"block,omitempty"` // If true, sets policy to deny/block announcement
}
