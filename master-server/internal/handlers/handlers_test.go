package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"netpulse-master/internal/auth"
	"netpulse-master/internal/models"
	"netpulse-master/internal/store"
)

func TestHeartbeatHandler(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "master_hb_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	s, _ := store.NewStore(tmpDir)
	hbHandler := NewHeartbeatHandler(s)

	// Create a test license first
	lic, err := s.Create(models.CreateLicenseRequest{
		ClientName: "Heartbeat ISP",
		Tier:       models.TierPro,
		MaxDevices: 10,
		ValidDays:  30,
	})
	if err != nil {
		t.Fatalf("failed to create license: %v", err)
	}

	// Send heartbeat
	hbPayload := models.HeartbeatPayload{
		InstanceID:    "inst-edge-99",
		LicenseKey:    lic.Key,
		ClientName:    lic.ClientName,
		Version:       "1.0.0",
		DeviceCount:   4,
		Hostname:      "noc-edge",
		UptimeSeconds: 1200,
	}

	body, _ := json.Marshal(hbPayload)
	req := httptest.NewRequest(http.MethodPost, "/api/v1/heartbeat", bytes.NewBuffer(body))
	w := httptest.NewRecorder()

	hbHandler.HandleHeartbeat(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", w.Code)
	}

	var resp models.HeartbeatResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}

	if resp.Status != models.StatusActive {
		t.Errorf("expected active status, got %s", resp.Status)
	}
	if resp.MaxDevices != 10 {
		t.Errorf("expected 10 max devices, got %d", resp.MaxDevices)
	}
}

func TestAdminHandler_CRUD(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "master_admin_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	s, _ := store.NewStore(tmpDir)
	am := auth.NewAuthManager()
	adminHandler := NewAdminHandler(s, am)

	// 1. Create license via API
	createReq := models.CreateLicenseRequest{
		ClientName: "New Fiber ISP",
		Tier:       models.TierEnterprise,
		MaxDevices: 0,
		ValidDays:  365,
	}
	body, _ := json.Marshal(createReq)
	req := httptest.NewRequest(http.MethodPost, "/api/admin/licenses", bytes.NewBuffer(body))
	w := httptest.NewRecorder()
	adminHandler.CreateLicense(w, req)

	if w.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created, got %d", w.Code)
	}

	var created models.License
	_ = json.NewDecoder(w.Body).Decode(&created)

	if created.ClientName != "New Fiber ISP" {
		t.Errorf("expected name 'New Fiber ISP', got '%s'", created.ClientName)
	}

	// 2. Overview
	reqOverview := httptest.NewRequest(http.MethodGet, "/api/admin/fleet/overview", nil)
	wOverview := httptest.NewRecorder()
	adminHandler.GetOverview(wOverview, reqOverview)

	if wOverview.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for overview, got %d", wOverview.Code)
	}
}
