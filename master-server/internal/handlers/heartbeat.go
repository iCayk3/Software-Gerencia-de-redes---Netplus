package handlers

import (
	"encoding/json"
	"log"
	"net"
	"net/http"
	"strings"

	"netpulse-master/internal/models"
	"netpulse-master/internal/store"
)

type HeartbeatHandler struct {
	store *store.Store
}

func NewHeartbeatHandler(s *store.Store) *HeartbeatHandler {
	return &HeartbeatHandler{store: s}
}

func getClientIP(r *http.Request) string {
	if xff := r.Header.Get("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		return strings.TrimSpace(parts[0])
	}
	if xrip := r.Header.Get("X-Real-IP"); xrip != "" {
		return strings.TrimSpace(xrip)
	}
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err == nil {
		return host
	}
	return r.RemoteAddr
}

// HandleHeartbeat processes client Edge telemetry and returns active entitlement
func (h *HeartbeatHandler) HandleHeartbeat(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var payload models.HeartbeatPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "JSON inválido"})
		return
	}

	clientIP := getClientIP(r)

	lic, err := h.store.RecordHeartbeat(payload, clientIP)
	if err != nil {
		log.Printf("[Master] ⚠️ Heartbeat recebido com chave desconhecida (%s) de %s", payload.LicenseKey, clientIP)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Chave de licença não encontrada no Servidor Master"})
		return
	}

	log.Printf("[Master] 💓 Heartbeat: %s (%s) | %d Roteadores | Host: %s | IP: %s | Status: %s",
		lic.ClientName, lic.Tier, payload.DeviceCount, payload.Hostname, clientIP, lic.Status)

	// Check if suspended
	statusCode := http.StatusOK
	if lic.Status == models.StatusSuspended {
		statusCode = http.StatusForbidden
	}

	resp := models.HeartbeatResponse{
		Status:     lic.Status,
		Tier:       lic.Tier,
		ClientName: lic.ClientName,
		ExpiresAt:  lic.ExpiresAt,
		MaxDevices: lic.MaxDevices,
		Features:   lic.Features,
		Message:    "Licença sincronizada com o Servidor Master",
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(statusCode)
	json.NewEncoder(w).Encode(resp)
}

// HandleVerify allows an edge instance to verify a key immediately
func (h *HeartbeatHandler) HandleVerify(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Key string `json:"key"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil || req.Key == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Chave de licença obrigatória"})
		return
	}

	lic, err := h.store.GetByKey(req.Key)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": "Licença inválida ou inexistente"})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(lic)
}
