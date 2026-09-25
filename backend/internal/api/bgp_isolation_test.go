package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"network-software/internal/models"
	"network-software/internal/storage"
)

func TestBGPMultiTenantIsolation(t *testing.T) {
	_ = os.Remove("test_bgp_devices.json")
	_ = os.Remove("test_bgp_users.json")
	_ = os.Remove("test_bgp_tenants.json")
	_ = os.Remove("test_bgp_audit.json")
	defer os.Remove("test_bgp_devices.json")
	defer os.Remove("test_bgp_users.json")
	defer os.Remove("test_bgp_tenants.json")
	defer os.Remove("test_bgp_audit.json")

	devStore, err := storage.NewDeviceStore("test_bgp_devices.json")
	if err != nil {
		t.Fatalf("failed to init device store: %v", err)
	}

	// 1. Cadastrar 2 equipamentos em tenants diferentes
	// Roteador Central (Netplus)
	devNetplus, _ := devStore.Create(models.Device{
		ID:        "dev-netplus-01",
		TenantID:  "default-tenant",
		Name:      "Borda Central Netplus",
		Host:      "192.168.100.1",
		Vendor:    models.VendorHuawei,
		Username:  "admin",
		Status:    "online",
		IsBGP:     true,
		CreatedAt: time.Now(),
	})

	// Roteador Cliente (Alpha Fibra)
	devAlpha, _ := devStore.Create(models.Device{
		ID:        "dev-alpha-01",
		TenantID:  "tenant-alpha",
		Name:      "Borda BGP Alpha Fibra",
		Host:      "10.50.0.1",
		Vendor:    models.VendorDatacom,
		Username:  "admin",
		Status:    "online",
		IsBGP:     true,
		CreatedAt: time.Now(),
	})

	userStore := storage.NewMemoryUserStore("test_bgp_users.json")

	// SuperAdmin
	superAdmin := &models.User{
		ID:           "usr-super",
		TenantID:     "default-tenant",
		Name:         "Super Admin",
		Email:        "super@netpulse.com",
		Role:         models.RoleAdmin,
		IsSuperAdmin: true,
	}
	superToken, _, _ := GenerateJWT(superAdmin)

	// Cliente Alpha
	clientAlpha := &models.User{
		ID:           "usr-alpha",
		TenantID:     "tenant-alpha",
		Name:         "Operador Alpha",
		Email:        "operador@alphafibra.com.br",
		Role:         models.RoleNOCOperator,
		IsSuperAdmin: false,
	}
	clientToken, _, _ := GenerateJWT(clientAlpha)

	devCtrl := NewDeviceController(devStore, nil)

	// =========================================================================
	// TESTE 1: Cliente Alpha lista dispositivos -> DEVE VER APENAS dev-alpha-01
	// =========================================================================
	reqAlphaList := httptest.NewRequest("GET", "/api/devices", nil)
	reqAlphaList.Header.Set("Authorization", "Bearer "+clientToken)
	recAlphaList := httptest.NewRecorder()

	AuthMiddleware(http.HandlerFunc(devCtrl.ListDevices)).ServeHTTP(recAlphaList, reqAlphaList)
	if recAlphaList.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", recAlphaList.Code)
	}

	var alphaDevices []models.SafeDevice
	_ = json.NewDecoder(recAlphaList.Body).Decode(&alphaDevices)

	if len(alphaDevices) != 1 {
		t.Fatalf("expected exactly 1 device for Alpha client, got %d", len(alphaDevices))
	}
	if alphaDevices[0].ID != devAlpha.ID {
		t.Errorf("expected device %s, got %s", devAlpha.ID, alphaDevices[0].ID)
	}
	if alphaDevices[0].TenantID != "tenant-alpha" {
		t.Errorf("expected tenant_id tenant-alpha, got %s", alphaDevices[0].TenantID)
	}

	// =========================================================================
	// TESTE 2: Cliente Alpha tenta acessar roteador da Netplus -> DEVE DAR 403
	// =========================================================================
	reqForbiddenBGP := httptest.NewRequest("GET", "/api/devices/"+devNetplus.ID+"/bgp", nil)
	reqForbiddenBGP.SetPathValue("id", devNetplus.ID)
	reqForbiddenBGP.Header.Set("Authorization", "Bearer "+clientToken)
	recForbiddenBGP := httptest.NewRecorder()

	AuthMiddleware(http.HandlerFunc(devCtrl.GetDeviceBGP)).ServeHTTP(recForbiddenBGP, reqForbiddenBGP)
	if recForbiddenBGP.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for cross-tenant device BGP access, got %d: %s", recForbiddenBGP.Code, recForbiddenBGP.Body.String())
	}

	// =========================================================================
	// TESTE 3: SuperAdmin lista dispositivos -> DEVE VER TODOS (2 dispositivos)
	// =========================================================================
	reqSuperList := httptest.NewRequest("GET", "/api/devices", nil)
	reqSuperList.Header.Set("Authorization", "Bearer "+superToken)
	recSuperList := httptest.NewRecorder()

	AuthMiddleware(http.HandlerFunc(devCtrl.ListDevices)).ServeHTTP(recSuperList, reqSuperList)
	if recSuperList.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", recSuperList.Code)
	}

	var superDevices []models.SafeDevice
	_ = json.NewDecoder(recSuperList.Body).Decode(&superDevices)
	if len(superDevices) != 2 {
		t.Fatalf("expected 2 devices for SuperAdmin global view, got %d", len(superDevices))
	}

	// =========================================================================
	// TESTE 4: SuperAdmin filtra dispositivos por tenant_id=tenant-alpha
	// =========================================================================
	reqSuperFilter := httptest.NewRequest("GET", "/api/devices?tenant_id=tenant-alpha", nil)
	reqSuperFilter.Header.Set("Authorization", "Bearer "+superToken)
	recSuperFilter := httptest.NewRecorder()

	AuthMiddleware(http.HandlerFunc(devCtrl.ListDevices)).ServeHTTP(recSuperFilter, reqSuperFilter)
	if recSuperFilter.Code != http.StatusOK {
		t.Fatalf("expected 200 OK, got %d", recSuperFilter.Code)
	}

	var filteredDevices []models.SafeDevice
	_ = json.NewDecoder(recSuperFilter.Body).Decode(&filteredDevices)
	if len(filteredDevices) != 1 || filteredDevices[0].ID != devAlpha.ID {
		t.Fatalf("expected only alpha device when superadmin filters by tenant_id, got %v", filteredDevices)
	}

	_ = userStore // prevent unused var
}
