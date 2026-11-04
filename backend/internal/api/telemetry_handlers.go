package api

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"

	"network-software/internal/models"
	"network-software/internal/storage"
	"network-software/internal/telemetry"
	"network-software/internal/telemetry/bmp"
)

type TelemetryController struct {
	engine      *telemetry.Engine
	store       *storage.DeviceStore
	tenantStore storage.ITenantStore
}

func NewTelemetryController(engine *telemetry.Engine, store *storage.DeviceStore, tenantStore storage.ITenantStore) *TelemetryController {
	return &TelemetryController{engine: engine, store: store, tenantStore: tenantStore}
}

// GetStatus handles GET /api/telemetry/status
func (c *TelemetryController) GetStatus(w http.ResponseWriter, r *http.Request) {
	status := c.engine.GetStatus()
	WriteJSON(w, http.StatusOK, status)
}

// GetOverview handles GET /api/telemetry/overview
func (c *TelemetryController) GetOverview(w http.ResponseWriter, r *http.Request) {
	tenantScope := ResolveTenantScope(r)
	overview := c.engine.GetOverviewForTenant(tenantScope)
	WriteJSON(w, http.StatusOK, overview)
}

// TriggerCollect handles POST /api/telemetry/collect
func (c *TelemetryController) TriggerCollect(w http.ResponseWriter, r *http.Request) {
	c.engine.TriggerManualCycle()
	WriteJSON(w, http.StatusOK, map[string]string{
		"message": "Ciclo de leitura de telemetria disparado com sucesso",
	})
}

// GetHistory handles GET /api/telemetry/history
func (c *TelemetryController) GetHistory(w http.ResponseWriter, r *http.Request) {
	limitStr := r.URL.Query().Get("limit")
	limit := 30
	if limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}

	snapshots := c.engine.GetAlertStore().GetSnapshots(limit)
	tenantScope := ResolveTenantScope(r)
	if tenantScope != "" && c.store != nil {
		devices := c.store.GetAllByTenant(tenantScope)
		allowedMap := make(map[string]bool, len(devices))
		for _, d := range devices {
			allowedMap[d.ID] = true
		}
		filtered := make([]models.TelemetrySnapshot, 0)
		for _, s := range snapshots {
			if allowedMap[s.DeviceID] {
				filtered = append(filtered, s)
			}
		}
		WriteJSON(w, http.StatusOK, filtered)
		return
	}

	WriteJSON(w, http.StatusOK, snapshots)
}

// ListAlerts handles GET /api/alerts
func (c *TelemetryController) ListAlerts(w http.ResponseWriter, r *http.Request) {
	statusFilter := r.URL.Query().Get("status")
	if statusFilter == "" {
		statusFilter = "all"
	}

	alerts := c.engine.GetAlertStore().GetAllAlerts(statusFilter)
	tenantScope := ResolveTenantScope(r)

	if tenantScope != "" && c.store != nil {
		devices := c.store.GetAllByTenant(tenantScope)
		allowedMap := make(map[string]bool, len(devices))
		for _, d := range devices {
			allowedMap[d.ID] = true
		}
		filteredAlerts := make([]models.Alert, 0)
		for _, a := range alerts {
			if allowedMap[a.DeviceID] {
				filteredAlerts = append(filteredAlerts, a)
			}
		}
		WriteJSON(w, http.StatusOK, filteredAlerts)
		return
	}

	WriteJSON(w, http.StatusOK, alerts)
}

// AcknowledgeAlert handles POST /api/alerts/{id}/ack
func (c *TelemetryController) AcknowledgeAlert(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "Alert ID is required")
		return
	}

	alert, err := c.engine.GetAlertStore().AcknowledgeAlert(id)
	if err != nil {
		if err == telemetry.ErrAlertNotFound {
			WriteError(w, http.StatusNotFound, "Alerta não encontrado")
			return
		}
		WriteError(w, http.StatusInternalServerError, "Erro ao reconhecer alerta: "+err.Error())
		return
	}

	c.engine.GetBroadcaster().Broadcast("alert_acknowledged", alert)
	WriteJSON(w, http.StatusOK, alert)
}

// StreamEvents handles GET /api/telemetry/events (SSE)
func (c *TelemetryController) StreamEvents(w http.ResponseWriter, r *http.Request) {
	c.engine.GetBroadcaster().ServeHTTP(w, r)
}

// GetBMPStatus handles GET /api/bmp/status
func (c *TelemetryController) GetBMPStatus(w http.ResponseWriter, r *http.Request) {
	bmpServer := c.engine.GetBMPServer()
	if bmpServer == nil {
		WriteError(w, http.StatusServiceUnavailable, "BMP Collector não inicializado")
		return
	}

	status := bmpServer.GetStatus()
	tenantScope := ResolveTenantScope(r)
	if tenantScope != "" && c.store != nil {
		devices := c.store.GetAllByTenant(tenantScope)
		allowedDevIDs := make(map[string]bool, len(devices))
		allowedIPs := make(map[string]bool, len(devices))
		for _, d := range devices {
			allowedDevIDs[d.ID] = true
			allowedIPs[d.Host] = true
		}

		filteredClients := make([]bmp.BMPClientInfo, 0)
		for _, client := range status.Clients {
			if allowedDevIDs[client.DeviceID] || allowedIPs[client.RouterIP] {
				filteredClients = append(filteredClients, client)
			}
		}

		allPeers := bmpServer.GetPeers()
		estCount := 0
		downCount := 0
		totalPeers := 0
		for _, p := range allPeers {
			if allowedIPs[p.RouterIP] {
				totalPeers++
				if strings.EqualFold(p.State, "Established") {
					estCount++
				} else {
					downCount++
				}
			}
		}

		status.ConnectedRouters = len(filteredClients)
		status.TotalPeersMonitored = totalPeers
		status.EstablishedPeers = estCount
		status.DownPeers = downCount
		status.Clients = filteredClients
		if len(filteredClients) == 0 {
			status.TotalMessagesParsed = 0
			status.TotalRoutesReceived = 0
		}
	}

	WriteJSON(w, http.StatusOK, status)
}

// GetBMPPeers handles GET /api/bmp/peers
func (c *TelemetryController) GetBMPPeers(w http.ResponseWriter, r *http.Request) {
	bmpServer := c.engine.GetBMPServer()
	if bmpServer == nil {
		WriteError(w, http.StatusServiceUnavailable, "BMP Collector não inicializado")
		return
	}

	peers := bmpServer.GetPeers()
	tenantScope := ResolveTenantScope(r)
	if tenantScope != "" && c.store != nil {
		devices := c.store.GetAllByTenant(tenantScope)
		allowedIPs := make(map[string]bool, len(devices))
		for _, d := range devices {
			allowedIPs[d.Host] = true
		}
		filtered := make([]bmp.BMPPeerState, 0)
		for _, p := range peers {
			if allowedIPs[p.RouterIP] {
				filtered = append(filtered, p)
			}
		}
		WriteJSON(w, http.StatusOK, filtered)
		return
	}

	WriteJSON(w, http.StatusOK, peers)
}

// GetBMPEvents handles GET /api/bmp/events
func (c *TelemetryController) GetBMPEvents(w http.ResponseWriter, r *http.Request) {
	bmpServer := c.engine.GetBMPServer()
	if bmpServer == nil {
		WriteError(w, http.StatusServiceUnavailable, "BMP Collector não inicializado")
		return
	}

	limitStr := r.URL.Query().Get("limit")
	limit := 50
	if limitStr != "" {
		if val, err := strconv.Atoi(limitStr); err == nil && val > 0 {
			limit = val
		}
	}

	events := bmpServer.GetRecentEvents(limit)
	tenantScope := ResolveTenantScope(r)
	if tenantScope != "" && c.store != nil {
		devices := c.store.GetAllByTenant(tenantScope)
		allowedDevIDs := make(map[string]bool, len(devices))
		allowedIPs := make(map[string]bool, len(devices))
		for _, d := range devices {
			allowedDevIDs[d.ID] = true
			allowedIPs[d.Host] = true
		}
		filtered := make([]bmp.BMPEvent, 0)
		for _, ev := range events {
			if allowedDevIDs[ev.DeviceID] || allowedIPs[ev.RouterIP] {
				filtered = append(filtered, ev)
			}
		}
		WriteJSON(w, http.StatusOK, filtered)
		return
	}

	WriteJSON(w, http.StatusOK, events)
}

// GetBMPConfigGuide handles GET /api/bmp/config-guide
func (c *TelemetryController) GetBMPConfigGuide(w http.ResponseWriter, r *http.Request) {
	port := 11019
	if bmpServer := c.engine.GetBMPServer(); bmpServer != nil {
		port = bmpServer.Port()
	}

	guide := map[string]interface{}{
		"bmp_port": port,
		"rfc":      "RFC 7854 (BGP Monitoring Protocol)",
		"vendors": map[string]interface{}{
			"huawei": map[string]interface{}{
				"title":       "Huawei (NetEngine 8000 / NE40E / VRP8)",
				"description": "Configuração nativa NetEngine 8000 F1A / NE40E (VRP8). Por padrão monitora todos os peers BGP automaticamente.",
				"commands": []string{
					"system-view",
					"bmp",
					" bmp-session <IP_DO_NETPULSE> alias netpulse",
					fmt.Sprintf("  tcp connect port %d", port),
					"  # Opcional se usar loopback como IP de origem:",
					"  # connect-interface LoopBack0",
					"  quit",
					"quit",
					"commit",
					"return",
				},
				"verify_commands": []string{
					"display bmp session",
					"display bmp session verbose",
					fmt.Sprintf("display tcp status | include %d", port),
				},
			},
			"mikrotik_v7": map[string]interface{}{
				"title":       "MikroTik (RouterOS v7)",
				"description": "Suporte nativo a BMP no RouterOS v7 para exportação de sessões e rotas BGP.",
				"commands": []string{
					fmt.Sprintf("/routing/bmp/add name=netpulse address=<IP_DO_NETPULSE> port=%d enabled=yes", port),
					"/routing/bmp/monitor/add bmp=netpulse connection=all",
				},
				"verify_commands": []string{
					"/routing/bmp/print detail",
				},
			},
			"cisco_iosxr": map[string]interface{}{
				"title":       "Cisco (IOS-XR / NCS / ASR9000)",
				"description": "Configuração de monitoramento BMP no Cisco IOS-XR.",
				"commands": []string{
					"bmp server 1",
					fmt.Sprintf(" host <IP_DO_NETPULSE> port %d", port),
					" description NetPulse BMP Telemetry",
					"commit",
					"router bgp <SEU_ASN>",
					" bmp server 1",
					"commit",
				},
				"verify_commands": []string{
					"show bmp server 1 summary",
				},
			},
			"juniper_junos": map[string]interface{}{
				"title":       "Juniper (Junos OS - MX / PTX)",
				"description": "Configuração de estação BMP no Junos.",
				"commands": []string{
					"set routing-options bmp stations NetPulse-BMP connection-mode active",
					"set routing-options bmp stations NetPulse-BMP station-address <IP_DO_NETPULSE>",
					fmt.Sprintf("set routing-options bmp stations NetPulse-BMP station-port %d", port),
					"set routing-options bmp stations NetPulse-BMP monitor enable",
					"commit",
				},
				"verify_commands": []string{
					"show route bmp status",
				},
			},
		},
	}

	WriteJSON(w, http.StatusOK, guide)
}

// GetBMPChurnRanking returns the BGP churn metrics and instability ranking.
func (tc *TelemetryController) GetBMPChurnRanking(w http.ResponseWriter, r *http.Request) {
	if tc.engine == nil || tc.engine.GetBMPServer() == nil {
		WriteJSON(w, http.StatusOK, bmp.ChurnRankingResponse{AverageStability: 100.0})
		return
	}
	ranking := tc.engine.GetBMPServer().GetChurnRanking()
	tenantScope := ResolveTenantScope(r)
	if tenantScope != "" && tc.store != nil {
		devices := tc.store.GetAllByTenant(tenantScope)
		allowedIPs := make(map[string]bool, len(devices))
		for _, d := range devices {
			allowedIPs[d.Host] = true
		}
		filteredChurners := make([]bmp.PeerChurnMetrics, 0)
		withdrawn1h := 0
		announced1h := 0
		for _, churner := range ranking.TopChurners {
			if allowedIPs[churner.RouterIP] {
				filteredChurners = append(filteredChurners, churner)
				withdrawn1h += churner.Withdrawn1h
				announced1h += churner.Announced1h
			}
		}
		ranking.TopChurners = filteredChurners
		ranking.TotalWithdrawn1h = withdrawn1h
		ranking.TotalAnnounced1h = announced1h
		if len(devices) == 0 {
			ranking.AverageStability = 100.0
			ranking.TimelineAggregate = make([]bmp.ChurnBucket, 0)
		}
	}
	WriteJSON(w, http.StatusOK, ranking)
}
