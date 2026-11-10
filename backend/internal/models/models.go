package models

import "time"

// HealthResponse represents the health check status.
type HealthResponse struct {
	Status    string    `json:"status"`
	Version   string    `json:"version"`
	GoVersion string    `json:"go_version"`
	Uptime    string    `json:"uptime"`
	Timestamp time.Time `json:"timestamp"`
}

// NetworkInterface represents a local network adapter.
type NetworkInterface struct {
	Index        int      `json:"index"`
	Name         string   `json:"name"`
	HardwareAddr string   `json:"hardware_addr"`
	Flags        []string `json:"flags"`
	MTU          int      `json:"mtu"`
	IPAddresses  []string `json:"ip_addresses"`
	IsUp         bool     `json:"is_up"`
	IsLoopback   bool     `json:"is_loopback"`
}

// PingRequest represents the payload to ping a target.
type PingRequest struct {
	Host    string `json:"host"`
	Timeout int    `json:"timeout_ms,omitempty"`
	Port    int    `json:"port,omitempty"`
}

// PingResponse represents the result of pinging a host.
type PingResponse struct {
	Host      string  `json:"host"`
	IP        string  `json:"ip"`
	Success   bool    `json:"success"`
	LatencyMs float64 `json:"latency_ms"`
	Message   string  `json:"message"`
	Method    string  `json:"method"`
}

// PortScanRequest represents request for scanning ports on a target.
type PortScanRequest struct {
	Host    string `json:"host"`
	Ports   []int  `json:"ports,omitempty"`
	Timeout int    `json:"timeout_ms,omitempty"`
}

// PortResult represents scan result for a single port.
type PortResult struct {
	Port      int     `json:"port"`
	Service   string  `json:"service"`
	IsOpen    bool    `json:"is_open"`
	LatencyMs float64 `json:"latency_ms"`
}

// PortScanResponse represents overall port scan result.
type PortScanResponse struct {
	Host       string       `json:"host"`
	IP         string       `json:"ip"`
	TotalPorts int          `json:"total_ports"`
	OpenPorts  int          `json:"open_ports"`
	DurationMs float64      `json:"duration_ms"`
	Results    []PortResult `json:"results"`
}

// DNSLookupResponse represents DNS query results.
type DNSLookupResponse struct {
	Domain string   `json:"domain"`
	IPs    []string `json:"ips"`
	CNAME  string   `json:"cname,omitempty"`
	MX     []string `json:"mx,omitempty"`
	TXT    []string `json:"txt,omitempty"`
	Error  string   `json:"error,omitempty"`
}

// --- Routing & Equipment Management Models ---

// VendorType defines the supported router/switch manufacturers.
type VendorType string

const (
	VendorHuawei     VendorType = "huawei"
	VendorDatacom    VendorType = "datacom"
	VendorMikrotikV6 VendorType = "mikrotik_v6"
	VendorMikrotikV7 VendorType = "mikrotik_v7"
)

// DeviceRole defines the backbone role/function of a device in the infrastructure.
type DeviceRole string

const (
	RoleBGP   DeviceRole = "bgp"   // BGP Edge Router / Roteador de Borda
	RolePE    DeviceRole = "pe"    // Provider Edge / Agregação & Distribuição
	RoleSW    DeviceRole = "sw"    // Backbone Core / Switch de Distribuição / Acesso
	RoleOLT   DeviceRole = "olt"   // Optical Line Terminal / Concentrador PON
	RoleOther DeviceRole = "other" // Outro equipamento de infraestrutura
)

// Device represents a network router or switch in the inventory.
type Device struct {
	ID         string     `json:"id"`
	TenantID   string     `json:"tenant_id"` // Client company / tenant owner
	Name       string     `json:"name"`
	Host       string     `json:"host"`
	Port       int        `json:"port"`
	Vendor     VendorType `json:"vendor"`
	Model      string     `json:"model,omitempty"` // e.g., "NE8000 F1A", "NE40", "S6730", "DmOS", "CCR2004"
	Username   string     `json:"username"`
	Password   string     `json:"password,omitempty"`
	AuthType   string     `json:"auth_type"` // "password" | "key"
	IsBGP      bool       `json:"is_bgp"`    // If true, device is polled for BGP sessions, routes and traffic engineering
	DeviceRole DeviceRole `json:"device_role,omitempty"` // "bgp", "pe", "sw", "olt", "other"
	Latitude   *float64   `json:"latitude,omitempty"`
	Longitude  *float64   `json:"longitude,omitempty"`
	Site       string     `json:"site,omitempty"`        // POP / Data Center name (e.g. "POP Castanhal")
	City       string     `json:"city,omitempty"`        // e.g. "Castanhal - PA"
	CreatedAt  time.Time  `json:"created_at"`
	LastSeen   *time.Time `json:"last_seen,omitempty"`
	Status     string     `json:"status"` // "online", "offline", "untested"
}

// SafeDevice is the version of Device returned to the frontend (with sensitive fields masked).
type SafeDevice struct {
	ID          string     `json:"id"`
	TenantID    string     `json:"tenant_id"`
	Name        string     `json:"name"`
	Host        string     `json:"host"`
	Port        int        `json:"port"`
	Vendor      VendorType `json:"vendor"`
	Model       string     `json:"model,omitempty"`
	Username    string     `json:"username"`
	HasPassword bool       `json:"has_password"`
	AuthType    string     `json:"auth_type"`
	IsBGP       bool       `json:"is_bgp"`
	DeviceRole  DeviceRole `json:"device_role,omitempty"`
	Latitude    *float64   `json:"latitude,omitempty"`
	Longitude   *float64   `json:"longitude,omitempty"`
	Site        string     `json:"site,omitempty"`
	City        string     `json:"city,omitempty"`
	CreatedAt   time.Time  `json:"created_at"`
	LastSeen    *time.Time `json:"last_seen,omitempty"`
	Status      string     `json:"status"`
}

// ToSafe converts Device to SafeDevice.
func (d *Device) ToSafe() SafeDevice {
	role := d.DeviceRole
	if role == "" {
		if d.IsBGP {
			role = RoleBGP
		} else {
			role = RoleSW
		}
	}
	return SafeDevice{
		ID:          d.ID,
		TenantID:    d.TenantID,
		Name:        d.Name,
		Host:        d.Host,
		Port:        d.Port,
		Vendor:      d.Vendor,
		Model:       d.Model,
		Username:    d.Username,
		HasPassword: d.Password != "",
		AuthType:    d.AuthType,
		IsBGP:       d.IsBGP,
		DeviceRole:  role,
		Latitude:    d.Latitude,
		Longitude:   d.Longitude,
		Site:        d.Site,
		City:        d.City,
		CreatedAt:   d.CreatedAt,
		LastSeen:    d.LastSeen,
		Status:      d.Status,
	}
}

// BGPSession represents a normalized BGP peer session.
type BGPSession struct {
	DeviceID         string `json:"device_id"`
	DeviceName       string `json:"device_name"`
	PeerIP           string `json:"peer_ip"`
	RemoteAS         string `json:"remote_as"`
	LocalAS          string `json:"local_as,omitempty"`
	State            string `json:"state"` // "Established", "Active", "Idle", "Connect", "OpenSent", etc.
	Uptime           string `json:"uptime"`
	PrefixesReceived   int    `json:"prefixes_received"`
	PrefixesSent       int    `json:"prefixes_sent,omitempty"`
	Description        string `json:"description,omitempty"`
	RawOutput          string `json:"raw_output,omitempty"`
	TelemetrySource    string `json:"telemetry_source,omitempty"`    // "bmp" or "ssh"
	PrePolicyPrefixes  int    `json:"pre_policy_prefixes,omitempty"`
	PostPolicyPrefixes int    `json:"post_policy_prefixes,omitempty"`
	RejectedPrefixes   int    `json:"rejected_prefixes,omitempty"`
	RouterID           string `json:"router_id,omitempty"`
	LastUpdate         string `json:"last_update,omitempty"`
}

// OSPFNeighbor represents a normalized OSPF adjacency.
type OSPFNeighbor struct {
	DeviceID   string `json:"device_id"`
	DeviceName string `json:"device_name"`
	NeighborID string `json:"neighbor_id"` // Neighbor router ID (e.g. 10.255.255.1)
	IP         string `json:"ip"`
	Interface  string `json:"interface"`
	Area       string `json:"area"`
	State      string `json:"state"` // "Full", "2-Way", "Init", "Attempt", "Down", etc.
	Role       string `json:"role"`  // "DR", "BDR", "DROther", "Point-to-Point"
	DeadTime   string `json:"dead_time,omitempty"`
	RawOutput  string `json:"raw_output,omitempty"`
}

// SSHTestResult represents the result of an SSH connectivity test.
type SSHTestResult struct {
	Success   bool    `json:"success"`
	LatencyMs float64 `json:"latency_ms"`
	Banner    string  `json:"banner,omitempty"`
	Error     string  `json:"error,omitempty"`
}

// CommandExecRequest represents an ad-hoc CLI command execution payload.
type CommandExecRequest struct {
	Command string `json:"command"`
}

// CommandExecResponse represents the result of executing an ad-hoc CLI command.
type CommandExecResponse struct {
	DeviceID   string  `json:"device_id"`
	DeviceName string  `json:"device_name"`
	Command    string  `json:"command"`
	Output     string  `json:"output"`
	DurationMs float64 `json:"duration_ms"`
	Success    bool    `json:"success"`
	Error      string  `json:"error,omitempty"`
}

// --- Backbone Links (Point-to-Point Topology & Fiber Routes) ---

// LinkType defines physical medium.
type LinkType string

const (
	LinkTypeFiber LinkType = "fiber"
	LinkTypeRadio LinkType = "radio"
)

// LinkRoutingMode defines how the link path was created.
type LinkRoutingMode string

const (
	LinkRoutingRoad   LinkRoutingMode = "road"   // Auto-followed highways/roads
	LinkRoutingManual LinkRoutingMode = "manual" // Hand-drawn / custom points
	LinkRoutingDirect LinkRoutingMode = "direct" // Straight line
)

// BackboneLink represents a point-to-point connection between two network devices.
type BackboneLink struct {
	ID             string          `json:"id"`
	TenantID       string          `json:"tenant_id"`
	Name           string          `json:"name"`
	SourceDeviceID string          `json:"source_device_id"`
	TargetDeviceID string          `json:"target_device_id"`
	Type           LinkType        `json:"type"`                // "fiber", "radio"
	RoutingMode    LinkRoutingMode `json:"routing_mode"`         // "road", "manual", "direct"
	Path           [][2]float64    `json:"path"`                 // Array of [lat, lng] coordinates
	Waypoints      [][2]float64    `json:"waypoints,omitempty"` // Intermediate forced via-points
	Capacity        string          `json:"capacity,omitempty"`   // e.g. "10G", "40G", "100G"
	SourceInterface string          `json:"source_interface,omitempty"` // Interface/porta na origem (ex: 10GE0/1/1)
	TargetInterface string          `json:"target_interface,omitempty"` // Interface/porta no destino (ex: 10GE0/1/2)
	Color           string          `json:"color,omitempty"`      // Hex color code, e.g. "#00E5FF"
	DistanceKm      float64         `json:"distance_km"`
	Notes           string          `json:"notes,omitempty"`
	Status          string          `json:"status"`               // "active", "planned", "degraded", "down"
	ZabbixProblem   string          `json:"zabbix_problem,omitempty"`   // Descrição da falha no Zabbix quando link down
	ZabbixLastAlert *time.Time      `json:"zabbix_last_alert,omitempty"`// Timestamp do último evento recebido
	CreatedAt       time.Time       `json:"created_at"`
	UpdatedAt       time.Time       `json:"updated_at"`
}

// --- Zabbix Integration & Network Monitoring ---

// ZabbixConfig holds settings for Zabbix server JSON-RPC API and Webhook integration.
type ZabbixConfig struct {
	URL           string    `json:"url"`                      // e.g. "http://10.80.80.5/zabbix" or "https://zabbix.provedor.net"
	APIToken      string    `json:"api_token,omitempty"`      // Zabbix API Token (Bearer)
	Username      string    `json:"username,omitempty"`       // User/Pass fallback for Zabbix < 5.4
	Password      string    `json:"password,omitempty"`       // Password
	WebhookSecret string    `json:"webhook_secret,omitempty"` // Shared secret passed in webhook (?token=...)
	Enabled       bool      `json:"enabled"`                  // Whether integration is active
	UpdatedAt     time.Time `json:"updated_at"`
}

// SafeZabbixConfig masks sensitive credentials before returning to UI.
type SafeZabbixConfig struct {
	URL           string    `json:"url"`
	HasAPIToken   bool      `json:"has_api_token"`
	HasPassword   bool      `json:"has_password"`
	Username      string    `json:"username,omitempty"`
	WebhookSecret string    `json:"webhook_secret,omitempty"`
	Enabled       bool      `json:"enabled"`
	UpdatedAt     time.Time `json:"updated_at"`
}

// ZabbixWebhookPayload represents the incoming payload from Zabbix Media Type Webhook.
type ZabbixWebhookPayload struct {
	EventValue      string `json:"event_value"`      // "1" = Problem, "0" = Recovery/Resolved
	EventID         string `json:"event_id,omitempty"`
	EventTitle      string `json:"event_title,omitempty"`
	HostName        string `json:"host_name"`
	HostIP          string `json:"host_ip"`
	ItemName        string `json:"item_name,omitempty"`
	ItemKey         string `json:"item_key,omitempty"`
	TriggerName     string `json:"trigger_name,omitempty"`
	TriggerSeverity string `json:"trigger_severity,omitempty"`
	Message         string `json:"message,omitempty"`
}

// ZabbixTestResult represents the connection test result.
type ZabbixTestResult struct {
	Success bool   `json:"success"`
	Version string `json:"version,omitempty"`
	Error   string `json:"error,omitempty"`
}
