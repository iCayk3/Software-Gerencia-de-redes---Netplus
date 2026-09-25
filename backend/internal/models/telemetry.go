package models

import "time"

// AlertSeverity defines the severity level of an alert.
type AlertSeverity string

const (
	SeverityCritical AlertSeverity = "critical"
	SeverityWarning  AlertSeverity = "warning"
	SeverityInfo     AlertSeverity = "info"
)

// AlertType defines the category of anomaly detected.
type AlertType string

const (
	AlertDeviceOffline AlertType = "device_offline"
	AlertBGPDown       AlertType = "bgp_down"
	AlertBGPPrefixDrop AlertType = "bgp_prefix_drop"
	AlertOSPFDown      AlertType = "ospf_down"
	AlertSyslogEvent   AlertType = "syslog_event"
	AlertBMPEvent      AlertType = "bmp_event"
)

// Alert represents an anomaly detected in the network.
type Alert struct {
	ID           string        `json:"id"`
	DeviceID     string        `json:"device_id"`
	DeviceName   string        `json:"device_name"`
	Type         AlertType     `json:"type"`
	Severity     AlertSeverity `json:"severity"`
	Target       string        `json:"target"` // e.g. "Peer 192.168.1.2 (AS 65002)" or "OSPF Area 0 Int Gi0/1"
	Message      string        `json:"message"`
	StartedAt    time.Time     `json:"started_at"`
	ResolvedAt   *time.Time    `json:"resolved_at,omitempty"`
	Acknowledged bool          `json:"acknowledged"`
	Status       string        `json:"status"` // "active", "acknowledged", "resolved"
}

// TelemetrySnapshot captures instantaneous metrics at a point in time.
type TelemetrySnapshot struct {
	Timestamp          time.Time `json:"timestamp"`
	DeviceID           string    `json:"device_id"`
	DeviceName         string    `json:"device_name"`
	Online             bool      `json:"online"`
	LatencyMs          float64   `json:"latency_ms"`
	BGPPeerCount       int       `json:"bgp_peer_count"`
	BGPEstablished     int       `json:"bgp_established"`
	BGPDown            int       `json:"bgp_down"`
	TotalPrefixes      int       `json:"total_prefixes"`
	OSPFNeighborCount  int       `json:"ospf_neighbor_count"`
	OSPFEstablished    int       `json:"ospf_established"`
	OSPFDown           int       `json:"ospf_down"`
}

// TelemetryEngineStatus represents the operational status of the telemetry service.
type TelemetryEngineStatus struct {
	Running             bool       `json:"running"`
	PollIntervalSeconds int        `json:"poll_interval_seconds"`
	LastPollTime        *time.Time `json:"last_poll_time,omitempty"`
	NextPollTime        *time.Time `json:"next_poll_time,omitempty"`
	TotalCycles         int        `json:"total_cycles"`
	ActiveAlertsCount   int        `json:"active_alerts_count"`
	SyslogPort          int        `json:"syslog_port"`
	SyslogActive        bool       `json:"syslog_active"`
	BMPPort             int        `json:"bmp_port"`
	BMPActive           bool       `json:"bmp_active"`
	BMPConnectedRouters int        `json:"bmp_connected_routers"`
	BMPTotalPeers       int        `json:"bmp_total_peers"`
}

// TelemetryOverview aggregates network-wide high-level metrics for fast dashboard rendering.
type TelemetryOverview struct {
	TotalDevices       int                 `json:"total_devices"`
	OnlineDevices      int                 `json:"online_devices"`
	OfflineDevices     int                 `json:"offline_devices"`
	TotalBGPPeers      int                 `json:"total_bgp_peers"`
	EstablishedBGP     int                 `json:"established_bgp"`
	DownBGP            int                 `json:"down_bgp"`
	TotalPrefixes      int                 `json:"total_prefixes"`
	TotalOSPFNeighbors int                 `json:"total_ospf_neighbors"`
	FullOSPF           int                 `json:"full_ospf"`
	DownOSPF           int                 `json:"down_ospf"`
	ActiveAlertsCount  int                 `json:"active_alerts_count"`
	LastUpdated        time.Time           `json:"last_updated"`
	RecentSnapshots    []TelemetrySnapshot `json:"recent_snapshots,omitempty"`
}
