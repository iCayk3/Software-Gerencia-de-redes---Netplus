package api

import (
	"fmt"
	"net/http"
	"strconv"

	"network-software/internal/telemetry"
	"network-software/internal/telemetry/bmp"
)

type TelemetryController struct {
	engine *telemetry.Engine
}

func NewTelemetryController(engine *telemetry.Engine) *TelemetryController {
	return &TelemetryController{engine: engine}
}

// GetStatus handles GET /api/telemetry/status
func (c *TelemetryController) GetStatus(w http.ResponseWriter, r *http.Request) {
	status := c.engine.GetStatus()
	WriteJSON(w, http.StatusOK, status)
}

// GetOverview handles GET /api/telemetry/overview
func (c *TelemetryController) GetOverview(w http.ResponseWriter, r *http.Request) {
	overview := c.engine.GetOverview()
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
	WriteJSON(w, http.StatusOK, snapshots)
}

// ListAlerts handles GET /api/alerts
func (c *TelemetryController) ListAlerts(w http.ResponseWriter, r *http.Request) {
	statusFilter := r.URL.Query().Get("status")
	if statusFilter == "" {
		statusFilter = "all"
	}

	alerts := c.engine.GetAlertStore().GetAllAlerts(statusFilter)
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
	WriteJSON(w, http.StatusOK, bmpServer.GetStatus())
}

// GetBMPPeers handles GET /api/bmp/peers
func (c *TelemetryController) GetBMPPeers(w http.ResponseWriter, r *http.Request) {
	bmpServer := c.engine.GetBMPServer()
	if bmpServer == nil {
		WriteError(w, http.StatusServiceUnavailable, "BMP Collector não inicializado")
		return
	}
	WriteJSON(w, http.StatusOK, bmpServer.GetPeers())
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

	WriteJSON(w, http.StatusOK, bmpServer.GetRecentEvents(limit))
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
	WriteJSON(w, http.StatusOK, ranking)
}
