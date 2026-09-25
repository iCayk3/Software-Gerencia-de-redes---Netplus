package bmp

import (
	"time"
)

// Standard RFC 7854 constants
const (
	BMPVersion3 uint8 = 3

	// Message Types
	MsgRouteMonitoring uint8 = 0
	MsgStatisticsReport uint8 = 1
	MsgPeerDown         uint8 = 2
	MsgPeerUp           uint8 = 3
	MsgInitiation       uint8 = 4
	MsgTermination      uint8 = 5
	MsgRouteMirroring   uint8 = 6

	// Peer Types
	PeerTypeGlobal uint8 = 0
	PeerTypeRD     uint8 = 1
	PeerTypeLocal  uint8 = 2

	// Peer Flags
	PeerFlagIPv6       uint8 = 0x80
	PeerFlagPostPolicy uint8 = 0x40
	PeerFlagTwoByteAS   uint8 = 0x20

	// Initiation TLV Types
	TLVString   uint16 = 0
	TLVSysDescr uint16 = 1
	TLVSysName  uint16 = 2

	// Peer Down Reasons
	PeerDownReasonLocalNotification  uint8 = 1
	PeerDownReasonLocalFSMError      uint8 = 2
	PeerDownReasonRemoteNotification uint8 = 3
	PeerDownReasonRemoteNoNotif      uint8 = 4
	PeerDownReasonInfoLost           uint8 = 5

	// Statistics Types
	StatRejectedByInboundPolicy uint16 = 0
	StatDuplicatePrefixAdvert   uint16 = 1
	StatDuplicateWithdraw       uint16 = 2
	StatClusterListLoop         uint16 = 3
	StatASPathLoop              uint16 = 4
	StatOriginatorIDLoop        uint16 = 5
	StatASConfedLoop            uint16 = 6
	StatRoutesAdjRIBIn          uint16 = 7
	StatRoutesLocRIB            uint16 = 8
)

// PerPeerHeader represents the 42-byte RFC 7854 per-peer header.
type PerPeerHeader struct {
	PeerType          uint8
	PeerFlags         uint8
	PeerDistinguisher uint64
	PeerAddress       string
	PeerAS            uint32
	PeerBGPID         string
	TimestampSec      uint32
	TimestampUsec     uint32
	IsIPv6            bool
	IsPostPolicy      bool
}

// BMPPeerState captures the real-time operational state of a BGP peer observed via BMP.
type BMPPeerState struct {
	PeerIP             string     `json:"peer_ip"`
	PeerName           string     `json:"peer_name,omitempty"`
	RemoteAS           uint32     `json:"remote_as"`
	LocalAS            uint32    `json:"local_as"`
	LocalAddr          string    `json:"local_addr"`
	RouterID           string    `json:"router_id"`
	RouterIP           string    `json:"router_ip"`
	RouterName         string    `json:"router_name"`
	DeviceID           string    `json:"device_id,omitempty"`
	State              string    `json:"state"` // "Established", "Down"
	EstablishedAt      *time.Time `json:"established_at,omitempty"`
	DownAt             *time.Time `json:"down_at,omitempty"`
	DownReason         string    `json:"down_reason,omitempty"`
	Uptime             string    `json:"uptime"`
	PrePolicyPrefixes  int       `json:"pre_policy_prefixes"`
	PostPolicyPrefixes int       `json:"post_policy_prefixes"`
	RejectedPrefixes   int       `json:"rejected_prefixes"`
	TotalAnnounced     int       `json:"total_announced"`
	TotalWithdrawn     int       `json:"total_withdrawn"`
	LastUpdate         time.Time `json:"last_update"`
}

// BMPClientInfo captures an active TCP BMP connection from a router (e.g. Huawei NE8000 / NE40).
type BMPClientInfo struct {
	RemoteAddr       string    `json:"remote_addr"`
	RouterIP         string    `json:"router_ip"`
	SysName          string    `json:"sys_name"`
	SysDescr         string    `json:"sys_descr"`
	DeviceID         string    `json:"device_id,omitempty"`
	DeviceName       string    `json:"device_name,omitempty"`
	Vendor           string    `json:"vendor,omitempty"`
	ConnectedAt      time.Time `json:"connected_at"`
	MessagesReceived uint64    `json:"messages_received"`
	PeersCount       int       `json:"peers_count"`
	LastActivity     time.Time `json:"last_activity"`
}

// BMPEvent represents an instantaneous event observed via BMP (Peer Up, Peer Down, Route Flap).
type BMPEvent struct {
	ID         string    `json:"id"`
	Timestamp  time.Time `json:"timestamp"`
	RouterIP   string    `json:"router_ip"`
	RouterName string    `json:"router_name"`
	DeviceID   string    `json:"device_id,omitempty"`
	PeerIP     string    `json:"peer_ip"`
	RemoteAS   uint32    `json:"remote_as"`
	EventType  string    `json:"event_type"` // "peer_up", "peer_down", "route_update", "stats_report"
	Reason     string    `json:"reason,omitempty"`
	Details    string    `json:"details"`
}

// BMPStatus captures overall operational telemetry of the BMP listener.
type BMPStatus struct {
	Running             bool            `json:"running"`
	Port                int             `json:"port"`
	ConnectedRouters    int             `json:"connected_routers"`
	TotalPeersMonitored int             `json:"total_peers_monitored"`
	EstablishedPeers    int             `json:"established_peers"`
	DownPeers           int             `json:"down_peers"`
	TotalMessagesParsed uint64          `json:"total_messages_parsed"`
	TotalRoutesReceived uint64          `json:"total_routes_received"`
	Clients             []BMPClientInfo `json:"clients"`
}
