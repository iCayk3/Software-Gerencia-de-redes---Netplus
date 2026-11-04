package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"network-software/internal/license"
	"network-software/internal/models"
	"network-software/internal/storage"
)

func TestLicenseController_GetStatusAndActivate(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "license_api_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	devStore, err := storage.NewDeviceStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to create dev store: %v", err)
	}

	lm := license.NewManager(tmpDir, "")
	ctrl := NewLicenseController(lm, devStore)

	// 1. GET /api/license/status
	req := httptest.NewRequest(http.MethodGet, "/api/license/status", nil)
	w := httptest.NewRecorder()
	ctrl.GetStatus(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", w.Code)
	}

	var status license.LicenseInfo
	if err := json.NewDecoder(w.Body).Decode(&status); err != nil {
		t.Fatalf("failed to decode status: %v", err)
	}
	if status.Tier != license.TierTrial {
		t.Errorf("expected initial tier 'trial', got '%s'", status.Tier)
	}

	// 2. POST /api/license/activate
	activateBody, _ := json.Marshal(license.ActivateRequest{Key: "NP-PRO-2026-KEY"})
	reqActivate := httptest.NewRequest(http.MethodPost, "/api/license/activate", bytes.NewBuffer(activateBody))
	wActivate := httptest.NewRecorder()
	ctrl.Activate(wActivate, reqActivate)

	if wActivate.Code != http.StatusOK {
		t.Fatalf("expected status 200, got %d", wActivate.Code)
	}

	var activated license.LicenseInfo
	if err := json.NewDecoder(wActivate.Body).Decode(&activated); err != nil {
		t.Fatalf("failed to decode activated license: %v", err)
	}
	if activated.Tier != license.TierPro {
		t.Errorf("expected tier 'pro', got '%s'", activated.Tier)
	}
	if activated.MaxDevices != 20 {
		t.Errorf("expected max devices 20, got %d", activated.MaxDevices)
	}
}

func TestDeviceController_LicenseEnforcement(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "dev_license_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	devStore, err := storage.NewDeviceStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to create dev store: %v", err)
	}

	lm := license.NewManager(tmpDir, "")
	// Activate trial with max 3 devices
	_, _ = lm.Activate("NP-TRIAL-3DEV")

	devCtrl := NewDeviceController(devStore, nil)
	devCtrl.SetLicenseManager(lm)

	// Add 3 devices
	for i := 1; i <= 3; i++ {
		_, err := devStore.Create(models.Device{
			Name:   "Router " + string(rune('0'+i)),
			Host:   "10.0.0." + string(rune('0'+i)),
			Vendor: "huawei",
		})
		if err != nil {
			t.Fatalf("failed to seed device: %v", err)
		}
	}

	// Try adding 4th device via controller
	dev4 := models.Device{
		Name:   "Router 4",
		Host:   "10.0.0.4",
		Vendor: "huawei",
	}
	body, _ := json.Marshal(dev4)
	req := httptest.NewRequest(http.MethodPost, "/api/devices", bytes.NewBuffer(body))
	w := httptest.NewRecorder()
	devCtrl.CreateDevice(w, req)

	if w.Code != http.StatusForbidden {
		t.Fatalf("expected status 403 Forbidden due to license limit, got %d", w.Code)
	}
}
