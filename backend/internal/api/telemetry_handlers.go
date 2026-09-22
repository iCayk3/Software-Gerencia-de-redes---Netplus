package api

import (
	"net/http"
	"strconv"

	"network-software/internal/telemetry"
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
