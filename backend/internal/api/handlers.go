package api

import (
	"encoding/json"
	"net/http"
	"runtime"
	"time"

	"network-software/internal/models"
	"network-software/internal/network"
)

var startTime = time.Now()

// HandleHealth returns server uptime and system info.
func HandleHealth(w http.ResponseWriter, r *http.Request) {
	resp := models.HealthResponse{
		Status:    "online",
		Version:   "1.0.0",
		GoVersion: runtime.Version(),
		Uptime:    time.Since(startTime).Round(time.Second).String(),
		Timestamp: time.Now(),
	}
	WriteJSON(w, http.StatusOK, resp)
}

// HandleGetInterfaces returns local network adapters.
func HandleGetInterfaces(w http.ResponseWriter, r *http.Request) {
	ifaces, err := network.GetNetworkInterfaces()
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to retrieve network interfaces: "+err.Error())
		return
	}
	WriteJSON(w, http.StatusOK, ifaces)
}

// HandlePing pings a target host/IP.
func HandlePing(w http.ResponseWriter, r *http.Request) {
	var req models.PingRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Host == "" {
		WriteError(w, http.StatusBadRequest, "Field 'host' is required")
		return
	}

	result := network.PingHost(req.Host, req.Timeout, req.Port)
	WriteJSON(w, http.StatusOK, result)
}

// HandlePortScan scans ports on a given host.
func HandlePortScan(w http.ResponseWriter, r *http.Request) {
	var req models.PortScanRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Host == "" {
		WriteError(w, http.StatusBadRequest, "Field 'host' is required")
		return
	}

	result := network.ScanPorts(req.Host, req.Ports, req.Timeout)
	WriteJSON(w, http.StatusOK, result)
}

// HandleDNS queries DNS records for a domain.
func HandleDNS(w http.ResponseWriter, r *http.Request) {
	domain := r.URL.Query().Get("domain")
	if domain == "" {
		WriteError(w, http.StatusBadRequest, "Query parameter 'domain' is required")
		return
	}

	result := network.LookupDNS(domain)
	WriteJSON(w, http.StatusOK, result)
}
