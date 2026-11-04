package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"network-software/internal/models"
	"network-software/internal/rpki"
	"network-software/internal/storage"
	"network-software/internal/telemetry"
	"network-software/internal/telemetry/bmp"
)

func TestTelemetryMultiTenant_Isolation(t *testing.T) {
	tmpDir := t.TempDir()
	tenantStore := storage.NewMemoryTenantStore(filepath.Join(tmpDir, "tenants.json"))
	deviceStore, err := storage.NewDeviceStore(filepath.Join(tmpDir, "devices.json"))
	if err != nil {
		t.Fatalf("Failed to init device store: %v", err)
	}

	// 1. Seed Tenants
	tenantCentral := models.Tenant{
		ID:        "default-tenant",
		Name:      "Netplus Telecom (NOC Central)",
		Slug:      "netplus",
		ASN:       "267943",
		Plan:      "enterprise",
		Status:    "active",
		CreatedAt: time.Now(),
	}
	tenantAlpha := models.Tenant{
		ID:        "tenant-alpha",
		Name:      "Alpha Fibra Internet (Cliente)",
		Slug:      "alpha-fibra",
		ASN:       "26162",
		Plan:      "pro",
		Status:    "active",
		CreatedAt: time.Now(),
	}
	_, _ = tenantStore.Create(tenantCentral)
	_, _ = tenantStore.Create(tenantAlpha)

	// 2. Seed Devices: 2 for Central, 0 for Alpha
	dev1 := models.Device{
		ID:        "dev-central-1",
		TenantID:  "default-tenant",
		Name:      "BGP-Core-01",
		Host:      "10.0.0.1",
		Port:      22,
		Vendor:    "huawei",
		Status:    "online",
		IsBGP:     true,
		CreatedAt: time.Now(),
	}
	dev2 := models.Device{
		ID:        "dev-central-2",
		TenantID:  "default-tenant",
		Name:      "BGP-Core-02",
		Host:      "10.0.0.2",
		Port:      22,
		Vendor:    "huawei",
		Status:    "offline",
		IsBGP:     true,
		CreatedAt: time.Now(),
	}
	_, _ = deviceStore.Create(dev1)
	_, _ = deviceStore.Create(dev2)

	// 3. Setup Telemetry Engine & Controllers
	engine, err := telemetry.NewEngine(deviceStore, tmpDir, 0, 0, 60)
	if err != nil {
		t.Fatalf("Failed to init engine: %v", err)
	}

	telCtrl := NewTelemetryController(engine, deviceStore, tenantStore)
	rpkiCtrl := NewRPKIController(rpki.NewValidator(), tenantStore, deviceStore)

	// Test Case 1: Company Alpha Fibra (has 0 devices) - overview MUST return all 0s
	{
		req := httptest.NewRequest(http.MethodGet, "/api/telemetry/overview", nil)
		req.Header.Set("X-Tenant-ID", "tenant-alpha")
		rec := httptest.NewRecorder()
		telCtrl.GetOverview(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", rec.Code)
		}
		var ov models.TelemetryOverview
		if err := json.Unmarshal(rec.Body.Bytes(), &ov); err != nil {
			t.Fatalf("Failed to parse overview JSON: %v", err)
		}
		if ov.TotalDevices != 0 {
			t.Errorf("Expected 0 devices for Alpha Fibra, got %d", ov.TotalDevices)
		}
		if ov.TotalBGPPeers != 0 {
			t.Errorf("Expected 0 BGP peers for Alpha Fibra, got %d", ov.TotalBGPPeers)
		}
		if ov.TotalPrefixes != 0 {
			t.Errorf("Expected 0 prefixes for Alpha Fibra, got %d", ov.TotalPrefixes)
		}
	}

	// Test Case 2: Global view (no tenant) - returns aggregated real total
	{
		req := httptest.NewRequest(http.MethodGet, "/api/telemetry/overview", nil)
		rec := httptest.NewRecorder()
		telCtrl.GetOverview(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", rec.Code)
		}
		var ov models.TelemetryOverview
		if err := json.Unmarshal(rec.Body.Bytes(), &ov); err != nil {
			t.Fatalf("Failed to parse overview JSON: %v", err)
		}
		if ov.TotalDevices != 2 {
			t.Errorf("Expected 2 devices in global overview, got %d", ov.TotalDevices)
		}
		if ov.OnlineDevices != 1 {
			t.Errorf("Expected 1 online device, got %d", ov.OnlineDevices)
		}
	}

	// Test Case 3: RPKI Summary for Alpha Fibra has ASN 26162
	{
		req := httptest.NewRequest(http.MethodGet, "/api/rpki/summary", nil)
		req.Header.Set("X-Tenant-ID", "tenant-alpha")
		rec := httptest.NewRecorder()
		rpkiCtrl.GetSummary(rec, req)

		if rec.Code != http.StatusOK {
			t.Fatalf("Expected 200, got %d", rec.Code)
		}
		var sum rpki.RPKISummary
		if err := json.Unmarshal(rec.Body.Bytes(), &sum); err != nil {
			t.Fatalf("Failed to parse RPKI summary JSON: %v", err)
		}
		if sum.OwnASN != "26162" {
			t.Errorf("Expected OwnASN 26162 for Alpha Fibra, got %q", sum.OwnASN)
		}
		if sum.TotalEvaluated != 0 {
			t.Errorf("Expected 0 evaluated routes for Alpha Fibra (0 devices), got %d", sum.TotalEvaluated)
		}
	}

	// Test Case 4: RPKI Summary Global
	{
		req := httptest.NewRequest(http.MethodGet, "/api/rpki/summary", nil)
		rec := httptest.NewRecorder()
		rpkiCtrl.GetSummary(rec, req)

		var sum rpki.RPKISummary
		if err := json.Unmarshal(rec.Body.Bytes(), &sum); err != nil {
			t.Fatalf("Failed to parse RPKI summary JSON: %v", err)
		}
		if sum.OwnASN != "Multi-AS" {
			t.Errorf("Expected OwnASN Multi-AS for global summary, got %q", sum.OwnASN)
		}
	}

	// Test Case 5: BMP Status for Alpha Fibra (0 connected routers)
	{
		req := httptest.NewRequest(http.MethodGet, "/api/bmp/status", nil)
		req.Header.Set("X-Tenant-ID", "tenant-alpha")
		rec := httptest.NewRecorder()
		telCtrl.GetBMPStatus(rec, req)

		var bmpStat bmp.BMPStatus
		if err := json.Unmarshal(rec.Body.Bytes(), &bmpStat); err != nil {
			t.Fatalf("Failed to parse BMP status JSON: %v", err)
		}
		if bmpStat.ConnectedRouters != 0 {
			t.Errorf("Expected 0 connected routers for Alpha Fibra, got %d", bmpStat.ConnectedRouters)
		}
	}
}
