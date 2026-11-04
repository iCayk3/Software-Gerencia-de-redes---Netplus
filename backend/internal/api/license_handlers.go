package api

import (
	"encoding/json"
	"net/http"

	"network-software/internal/license"
	"network-software/internal/storage"
)

type LicenseController struct {
	licenseMgr *license.LicenseManager
	store      *storage.DeviceStore
}

func NewLicenseController(licenseMgr *license.LicenseManager, store *storage.DeviceStore) *LicenseController {
	return &LicenseController{
		licenseMgr: licenseMgr,
		store:      store,
	}
}

// GetStatus returns the operational status and metrics of the installation license
func (c *LicenseController) GetStatus(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	deviceCount := len(c.store.GetAll())

	status := c.licenseMgr.GetStatus(deviceCount)
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(status)
}

// Activate applies a new license key on the local instance
func (c *LicenseController) Activate(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
		return
	}

	var req license.ActivateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, "JSON inválido", http.StatusBadRequest)
		return
	}

	newStatus, err := c.licenseMgr.Activate(req.Key)
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	newStatus.DeviceUsage = len(c.store.GetAll())

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(newStatus)
}
