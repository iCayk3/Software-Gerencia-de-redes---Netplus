package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"netpulse-master/internal/auth"
	"netpulse-master/internal/models"
	"netpulse-master/internal/store"
)

type AdminHandler struct {
	store *store.Store
	auth  *auth.AuthManager
}

func NewAdminHandler(s *store.Store, a *auth.AuthManager) *AdminHandler {
	return &AdminHandler{store: s, auth: a}
}

// Login handles master admin authentication
func (h *AdminHandler) Login(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req struct {
		Password string `json:"password"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Requisição inválida"})
		return
	}

	token, err := h.auth.Login(req.Password)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusUnauthorized)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"token":      token,
		"expires_in": 86400,
	})
}

// GetOverview returns aggregate metrics across the entire customer fleet
func (h *AdminHandler) GetOverview(w http.ResponseWriter, r *http.Request) {
	overview := h.store.GetFleetOverview()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(overview)
}

// ListLicenses returns all customer licenses
func (h *AdminHandler) ListLicenses(w http.ResponseWriter, r *http.Request) {
	licenses := h.store.List()
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(licenses)
}

// CreateLicense issues a new license key
func (h *AdminHandler) CreateLicense(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req models.CreateLicenseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "JSON inválido"})
		return
	}

	if req.ClientName == "" {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "Nome do cliente é obrigatório"})
		return
	}

	if req.Tier == "" {
		req.Tier = models.TierPro
	}
	if req.ValidDays <= 0 {
		req.ValidDays = 365
	}

	lic, err := h.store.Create(req)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(lic)
}

// UpdateLicense updates an existing license parameters
func (h *AdminHandler) UpdateLicense(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "ID obrigatório", http.StatusBadRequest)
		return
	}

	var req models.UpdateLicenseRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": "JSON inválido"})
		return
	}

	updated, err := h.store.Update(id, req)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updated)
}

// ToggleStatus suspends or reactivates a license
func (h *AdminHandler) ToggleStatus(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "ID obrigatório", http.StatusBadRequest)
		return
	}

	lic, err := h.store.GetByID(id)
	if err != nil {
		http.Error(w, "Licença não encontrada", http.StatusNotFound)
		return
	}

	newStatus := models.StatusSuspended
	if lic.Status == models.StatusSuspended {
		newStatus = models.StatusActive
	}

	updated, err := h.store.Update(id, models.UpdateLicenseRequest{
		Status: &newStatus,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updated)
}

// RenewLicense extends expiration date by X days
func (h *AdminHandler) RenewLicense(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "ID obrigatório", http.StatusBadRequest)
		return
	}

	var req struct {
		Days int `json:"days"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if req.Days <= 0 {
		req.Days = 30
	}

	lic, err := h.store.GetByID(id)
	if err != nil {
		http.Error(w, "Licença não encontrada", http.StatusNotFound)
		return
	}

	baseTime := lic.ExpiresAt
	if baseTime.Before(time.Now()) {
		baseTime = time.Now()
	}
	newExpiry := baseTime.Add(time.Duration(req.Days) * 24 * time.Hour)
	activeStatus := models.StatusActive

	updated, err := h.store.Update(id, models.UpdateLicenseRequest{
		ExpiresAt: &newExpiry,
		Status:    &activeStatus,
	})
	if err != nil {
		http.Error(w, err.Error(), http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(updated)
}

// DeleteLicense deletes a customer license
func (h *AdminHandler) DeleteLicense(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		http.Error(w, "ID obrigatório", http.StatusBadRequest)
		return
	}

	if err := h.store.Delete(id); err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusNotFound)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]string{"message": "Licença excluída com sucesso"})
}

// EnableCORS middleware for development/API flexibility
func EnableCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Instance-ID")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusOK)
			return
		}
		next.ServeHTTP(w, r)
	})
}
