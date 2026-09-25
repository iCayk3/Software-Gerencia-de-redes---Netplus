package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
	"time"

	"network-software/internal/models"
	"network-software/internal/storage"

	"golang.org/x/crypto/bcrypt"
)

func setupE2EEnvironment(t *testing.T) (http.Handler, *storage.DeviceStore, storage.ITenantStore, storage.IUserStore) {
	t.Helper()
	_ = os.Setenv("JWT_SECRET", "netpulse-test-jwt-secret-key-32bytes-ok!!")

	tmpDir := t.TempDir()
	tenantStore := storage.NewMemoryTenantStore(filepath.Join(tmpDir, "tenants.json"))
	userStore := storage.NewMemoryUserStore(filepath.Join(tmpDir, "users.json"))
	deviceStore, err := storage.NewDeviceStore(filepath.Join(tmpDir, "devices.json"))
	if err != nil {
		t.Fatalf("Failed to init device store: %v", err)
	}

	// 1. Seed Tenants
	tenantCentral := models.Tenant{
		ID:        "default-tenant",
		Name:      "Netplus NOC Central",
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
	tenantBeta := models.Tenant{
		ID:        "tenant-beta",
		Name:      "Beta Telecom Conectividade (Cliente)",
		Slug:      "beta-telecom",
		ASN:       "266445",
		Plan:      "standard",
		Status:    "active",
		CreatedAt: time.Now(),
	}
	_, _ = tenantStore.Create(tenantCentral)
	_, _ = tenantStore.Create(tenantAlpha)
	_, _ = tenantStore.Create(tenantBeta)

	// 2. Seed Users with known passwords
	hashAdmin, _ := bcrypt.GenerateFromPassword([]byte("admin123"), bcrypt.DefaultCost)
	hashAlpha, _ := bcrypt.GenerateFromPassword([]byte("alpha123"), bcrypt.DefaultCost)
	hashBeta, _ := bcrypt.GenerateFromPassword([]byte("beta123"), bcrypt.DefaultCost)

	userSuperAdmin := models.User{
		ID:           "usr-superadmin",
		TenantID:     "default-tenant",
		Name:         "Super Administrador NOC",
		Email:        "admin@netpulse.com",
		PasswordHash: string(hashAdmin),
		Role:         models.RoleAdmin,
		IsSuperAdmin: true,
		Status:       "active",
		CreatedAt:    time.Now(),
	}
	userAlpha := models.User{
		ID:           "usr-operador-alpha",
		TenantID:     "tenant-alpha",
		Name:         "Operador BGP Alpha",
		Email:        "operador@alphafibra.com.br",
		PasswordHash: string(hashAlpha),
		Role:         models.RoleNOCOperator,
		IsSuperAdmin: false,
		Status:       "active",
		CreatedAt:    time.Now(),
	}
	userBeta := models.User{
		ID:           "usr-operador-beta",
		TenantID:     "tenant-beta",
		Name:         "Operador NOC Beta",
		Email:        "noc@betatelecom.com.br",
		PasswordHash: string(hashBeta),
		Role:         models.RoleNOCOperator,
		IsSuperAdmin: false,
		Status:       "active",
		CreatedAt:    time.Now(),
	}

	_, _ = userStore.CreateUser(userSuperAdmin)
	_, _ = userStore.CreateUser(userAlpha)
	_, _ = userStore.CreateUser(userBeta)

	// 3. Seed Devices per Tenant
	devNetplus1 := models.Device{
		ID:        "dev-netplus-1",
		TenantID:  "default-tenant",
		Name:      "Netplus-Borda-NE8000",
		Host:      "45.166.28.254",
		Port:      22,
		Vendor:    models.VendorHuawei,
		Status:    "online",
		IsBGP:     true,
		CreatedAt: time.Now(),
	}
	devNetplus2 := models.Device{
		ID:        "dev-netplus-2",
		TenantID:  "default-tenant",
		Name:      "Netplus-Borda-NE40",
		Host:      "45.166.28.249",
		Port:      22,
		Vendor:    models.VendorHuawei,
		Status:    "online",
		IsBGP:     true,
		CreatedAt: time.Now(),
	}
	devAlpha1 := models.Device{
		ID:        "dev-alpha-1",
		TenantID:  "tenant-alpha",
		Name:      "Alpha-Borda-NE40",
		Host:      "187.16.218.69",
		Port:      22,
		Vendor:    models.VendorHuawei,
		Status:    "online",
		IsBGP:     true,
		CreatedAt: time.Now(),
	}
	devBeta1 := models.Device{
		ID:        "dev-beta-1",
		TenantID:  "tenant-beta",
		Name:      "Beta-Core-CCR2004",
		Host:      "170.82.183.217",
		Port:      22,
		Vendor:    models.VendorMikrotikV7,
		Status:    "online",
		IsBGP:     true,
		CreatedAt: time.Now(),
	}

	_, _ = deviceStore.Create(devNetplus1)
	_, _ = deviceStore.Create(devNetplus2)
	_, _ = deviceStore.Create(devAlpha1)
	_, _ = deviceStore.Create(devBeta1)

	// Initialize API Router
	auditStore := storage.NewMemoryAuditStore(filepath.Join(tmpDir, "audit.json"))
	router := NewRouter(deviceStore, nil, nil, tmpDir, tenantStore, userStore, auditStore)

	return router, deviceStore, tenantStore, userStore
}

func TestE2EMultiTenant_AuthenticationAndClaims(t *testing.T) {
	router, _, _, _ := setupE2EEnvironment(t)

	// Case 1: Login SuperAdmin
	loginBody, _ := json.Marshal(map[string]string{
		"email":    "admin@netpulse.com",
		"password": "admin123",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginBody))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("SuperAdmin login failed: expected 200, got %d (body: %s)", rec.Code, rec.Body.String())
	}
	var loginResp models.LoginResponse
	if err := json.Unmarshal(rec.Body.Bytes(), &loginResp); err != nil {
		t.Fatalf("Failed to parse login response: %v", err)
	}
	if !loginResp.User.IsSuperAdmin {
		t.Errorf("Expected IsSuperAdmin = true for admin@netpulse.com")
	}

	// Case 2: Login Client Alpha
	loginAlphaBody, _ := json.Marshal(map[string]string{
		"email":    "operador@alphafibra.com.br",
		"password": "operador123",
	})
	req = httptest.NewRequest(http.MethodPost, "/api/auth/login", bytes.NewReader(loginAlphaBody))
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Alpha operator login failed: expected 200, got %d", rec.Code)
	}
	if err := json.Unmarshal(rec.Body.Bytes(), &loginResp); err != nil {
		t.Fatalf("Failed to parse Alpha login response: %v", err)
	}
	if loginResp.User.IsSuperAdmin {
		t.Errorf("Expected IsSuperAdmin = false for Alpha operator")
	}
	if loginResp.User.TenantID != "tenant-alpha" {
		t.Errorf("Expected TenantID = 'tenant-alpha', got '%s'", loginResp.User.TenantID)
	}
}

func TestE2EMultiTenant_SuperAdminGlobalAndScopedViews(t *testing.T) {
	router, _, _, userStore := setupE2EEnvironment(t)
	superUser, _ := userStore.GetByEmail("admin@netpulse.com")
	superToken, _, _ := GenerateJWT(superUser)

	// 1. SuperAdmin Global View (sem filtro) -> deve retornar os 4 roteadores
	req := httptest.NewRequest(http.MethodGet, "/api/devices", nil)
	req.Header.Set("Authorization", "Bearer "+superToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", rec.Code)
	}
	var allDevices []models.SafeDevice
	_ = json.Unmarshal(rec.Body.Bytes(), &allDevices)
	if len(allDevices) != 4 {
		t.Errorf("SuperAdmin global view should return 4 devices, got %d", len(allDevices))
	}

	// 2. SuperAdmin Scoped View com Query Param ?tenant_id=tenant-alpha -> deve retornar 1 dispositivo (Alpha)
	req = httptest.NewRequest(http.MethodGet, "/api/devices?tenant_id=tenant-alpha", nil)
	req.Header.Set("Authorization", "Bearer "+superToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", rec.Code)
	}
	var alphaDevices []models.SafeDevice
	_ = json.Unmarshal(rec.Body.Bytes(), &alphaDevices)
	if len(alphaDevices) != 1 || alphaDevices[0].ID != "dev-alpha-1" {
		t.Errorf("Expected 1 device (dev-alpha-1) when scoped to Alpha, got %d", len(alphaDevices))
	}

	// 3. SuperAdmin Scoped View com Header X-Tenant-ID: tenant-beta -> deve retornar 1 dispositivo (Beta)
	req = httptest.NewRequest(http.MethodGet, "/api/devices", nil)
	req.Header.Set("Authorization", "Bearer "+superToken)
	req.Header.Set("X-Tenant-ID", "tenant-beta")
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", rec.Code)
	}
	var betaDevices []models.SafeDevice
	_ = json.Unmarshal(rec.Body.Bytes(), &betaDevices)
	if len(betaDevices) != 1 || betaDevices[0].ID != "dev-beta-1" {
		t.Errorf("Expected 1 device (dev-beta-1) when scoped to Beta, got %d", len(betaDevices))
	}
}

func TestE2EMultiTenant_StrictClientDataIsolation(t *testing.T) {
	router, _, _, userStore := setupE2EEnvironment(t)
	alphaUser, _ := userStore.GetByEmail("operador@alphafibra.com.br")
	alphaToken, _, _ := GenerateJWT(alphaUser)

	betaUser, _ := userStore.GetByEmail("noc@betatelecom.com.br")
	betaToken, _, _ := GenerateJWT(betaUser)

	// 1. Operador Alpha lista roteadores -> deve ver APENAS dev-alpha-1
	req := httptest.NewRequest(http.MethodGet, "/api/devices", nil)
	req.Header.Set("Authorization", "Bearer "+alphaToken)
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", rec.Code)
	}
	var devicesAlpha []models.SafeDevice
	_ = json.Unmarshal(rec.Body.Bytes(), &devicesAlpha)
	if len(devicesAlpha) != 1 {
		t.Fatalf("Alpha operator must only see 1 device, got %d", len(devicesAlpha))
	}
	if devicesAlpha[0].ID != "dev-alpha-1" {
		t.Errorf("Alpha operator saw device '%s' instead of 'dev-alpha-1'", devicesAlpha[0].ID)
	}

	// 2. Operador Alpha tenta burlar passando ?tenant_id=tenant-beta -> deve CONTINUAR vendo apenas dev-alpha-1
	req = httptest.NewRequest(http.MethodGet, "/api/devices?tenant_id=tenant-beta", nil)
	req.Header.Set("Authorization", "Bearer "+alphaToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", rec.Code)
	}
	var bypassedDevices []models.SafeDevice
	_ = json.Unmarshal(rec.Body.Bytes(), &bypassedDevices)
	if len(bypassedDevices) != 1 || bypassedDevices[0].ID != "dev-alpha-1" {
		t.Errorf("Security Breach! Client operator was able to alter tenant scope via query param!")
	}

	// 3. Operador Beta lista roteadores -> deve ver APENAS dev-beta-1
	req = httptest.NewRequest(http.MethodGet, "/api/devices", nil)
	req.Header.Set("Authorization", "Bearer "+betaToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("Expected 200, got %d", rec.Code)
	}
	var devicesBeta []models.SafeDevice
	_ = json.Unmarshal(rec.Body.Bytes(), &devicesBeta)
	if len(devicesBeta) != 1 || devicesBeta[0].ID != "dev-beta-1" {
		t.Fatalf("Beta operator must only see 1 device (dev-beta-1), got %d", len(devicesBeta))
	}

	// 4. Tentativa de Cross-Tenant ID Access: Operador Alpha tenta consultar diretamente dev-beta-1 por ID
	req = httptest.NewRequest(http.MethodGet, "/api/devices/dev-beta-1", nil)
	req.Header.Set("Authorization", "Bearer "+alphaToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when Alpha attempts to access Beta router directly, got %d", rec.Code)
	}

	// 5. Tentativa de Cross-Tenant ID Access: Operador Alpha tenta consultar roteador central da Netplus
	req = httptest.NewRequest(http.MethodGet, "/api/devices/dev-netplus-1", nil)
	req.Header.Set("Authorization", "Bearer "+alphaToken)
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("Expected 403 Forbidden when Alpha attempts to access Netplus router directly, got %d", rec.Code)
	}
}

func TestE2EMultiTenant_RBACBoundaries(t *testing.T) {
	router, _, _, userStore := setupE2EEnvironment(t)
	alphaUser, _ := userStore.GetByEmail("operador@alphafibra.com.br")
	alphaToken, _, _ := GenerateJWT(alphaUser)

	superUser, _ := userStore.GetByEmail("admin@netpulse.com")
	superToken, _, _ := GenerateJWT(superUser)

	// 1. Operador não-SuperAdmin tenta criar nova empresa cliente -> 403 Forbidden
	newTenantBody, _ := json.Marshal(models.CreateTenantRequest{
		Name: "Nova Empresa Hack",
		Slug: "nova-hack",
		ASN:  "12345",
	})
	req := httptest.NewRequest(http.MethodPost, "/api/tenants", bytes.NewReader(newTenantBody))
	req.Header.Set("Authorization", "Bearer "+alphaToken)
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusForbidden {
		t.Errorf("Client operator should NOT be allowed to create tenants, expected 403 Forbidden, got %d", rec.Code)
	}

	// 2. SuperAdmin cria nova empresa cliente -> 201 Created
	req = httptest.NewRequest(http.MethodPost, "/api/tenants", bytes.NewReader(newTenantBody))
	req.Header.Set("Authorization", "Bearer "+superToken)
	req.Header.Set("Content-Type", "application/json")
	rec = httptest.NewRecorder()
	router.ServeHTTP(rec, req)

	if rec.Code != http.StatusCreated {
		t.Fatalf("SuperAdmin should be allowed to create tenants, expected 201, got %d (body: %s)", rec.Code, rec.Body.String())
	}
}
