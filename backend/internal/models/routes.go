package models

// StaticRoute represents a configured static route on a network router.
type StaticRoute struct {
	ID          string `json:"id"`
	DeviceID    string `json:"device_id"`
	DeviceName  string `json:"device_name"`
	Destination string `json:"destination"` // e.g., "0.0.0.0/0" or "187.16.216.0/22"
	NextHop     string `json:"next_hop"`    // gateway IP or interface
	Interface   string `json:"interface,omitempty"`
	Preference  int    `json:"preference,omitempty"` // distance / metric
	Tag         string `json:"tag,omitempty"`
	Description string `json:"description,omitempty"`
	Status      string `json:"status,omitempty"` // "active", "inactive"
	RawOutput   string `json:"raw_output,omitempty"`
}

// StaticRouteRequest represents the payload for creating or deleting a static route.
type StaticRouteRequest struct {
	Destination string `json:"destination"` // e.g. "0.0.0.0/0" or "192.168.1.0/24"
	NextHop     string `json:"next_hop"`    // gateway IP
	Preference  int    `json:"preference,omitempty"`
	Description string `json:"description,omitempty"`
}
