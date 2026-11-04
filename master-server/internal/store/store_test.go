package store

import (
	"os"
	"testing"
	"time"

	"netpulse-master/internal/models"
)

func TestStore_CreateAndHeartbeat(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "master_store_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	s, err := NewStore(tmpDir)
	if err != nil {
		t.Fatalf("failed to create store: %v", err)
	}

	// 1. Create license
	req := models.CreateLicenseRequest{
		ClientName:  "Test Telecom",
		ClientEmail: "noc@test.com",
		Tier:        models.TierPro,
		MaxDevices:  15,
		ValidDays:   30,
	}

	lic, err := s.Create(req)
	if err != nil {
		t.Fatalf("failed to create license: %v", err)
	}
	if lic.ClientName != "Test Telecom" {
		t.Errorf("expected client name 'Test Telecom', got '%s'", lic.ClientName)
	}
	if lic.MaxDevices != 15 {
		t.Errorf("expected 15 devices, got %d", lic.MaxDevices)
	}
	if lic.Status != models.StatusActive {
		t.Errorf("expected status 'active', got '%s'", lic.Status)
	}

	// 2. Record Heartbeat
	hb := models.HeartbeatPayload{
		InstanceID:    "inst-12345",
		LicenseKey:    lic.Key,
		ClientName:    lic.ClientName,
		Version:       "1.0.0",
		DeviceCount:   7,
		Hostname:      "noc-server-01",
		UptimeSeconds: 3600,
	}

	updated, err := s.RecordHeartbeat(hb, "203.0.113.50")
	if err != nil {
		t.Fatalf("failed to record heartbeat: %v", err)
	}
	if updated.LastDeviceCount != 7 {
		t.Errorf("expected 7 devices recorded, got %d", updated.LastDeviceCount)
	}
	if updated.LastRemoteIP != "203.0.113.50" {
		t.Errorf("expected IP '203.0.113.50', got '%s'", updated.LastRemoteIP)
	}
	if !updated.IsOnline() {
		t.Errorf("expected instance to be online after heartbeat")
	}

	// 3. Fleet Overview
	overview := s.GetFleetOverview()
	if overview.OnlineInstances < 1 {
		t.Errorf("expected at least 1 online instance, got %d", overview.OnlineInstances)
	}
	if overview.TotalMonitored != 7 {
		t.Errorf("expected 7 total monitored devices, got %d", overview.TotalMonitored)
	}
}

func TestStore_StatusComputation(t *testing.T) {
	// Active
	l1 := models.License{
		Status:    models.StatusActive,
		ExpiresAt: time.Now().Add(10 * 24 * time.Hour),
	}
	if l1.ComputeStatus() != models.StatusActive {
		t.Errorf("expected active, got %s", l1.ComputeStatus())
	}

	// Grace Period
	l2 := models.License{
		Status:          models.StatusActive,
		ExpiresAt:       time.Now().Add(-2 * 24 * time.Hour),
		GracePeriodDays: 14,
	}
	if l2.ComputeStatus() != models.StatusGracePeriod {
		t.Errorf("expected grace_period, got %s", l2.ComputeStatus())
	}

	// Expired
	l3 := models.License{
		Status:          models.StatusActive,
		ExpiresAt:       time.Now().Add(-20 * 24 * time.Hour),
		GracePeriodDays: 14,
	}
	if l3.ComputeStatus() != models.StatusExpired {
		t.Errorf("expected expired, got %s", l3.ComputeStatus())
	}

	// Suspended overrides expiration
	l4 := models.License{
		Status:    models.StatusSuspended,
		ExpiresAt: time.Now().Add(10 * 24 * time.Hour),
	}
	if l4.ComputeStatus() != models.StatusSuspended {
		t.Errorf("expected suspended, got %s", l4.ComputeStatus())
	}
}
