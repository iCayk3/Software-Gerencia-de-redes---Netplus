package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"network-software/internal/models"
	"network-software/internal/storage"
)

func TestMultiTenantManagement(t *testing.T) {
	_ = os.Remove("test_multi_tenants.json")
	_ = os.Remove("test_multi_users.json")
	_ = os.Remove("test_multi_audit.json")
	defer os.Remove("test_multi_tenants.json")
	defer os.Remove("test_multi_users.json")
	defer os.Remove("test_multi_audit.json")

	tenantStore := storage.NewMemoryTenantStore("test_multi_tenants.json")
	userStore := storage.NewMemoryUserStore("test_multi_users.json")
	auditStore := storage.NewMemoryAuditStore("test_multi_audit.json")

	tenantCtrl := NewTenantController(tenantStore, auditStore)
	authCtrl := NewAuthController(userStore, tenantStore, auditStore)

	// 1. SuperAdmin Login
	superUser, _ := userStore.GetByEmail("admin@netpulse.com")
	superToken, _, _ := GenerateJWT(superUser)

	// 2. Client Admin Login
	clientUser, _ := userStore.GetByEmail("admin@alphafibra.com.br")
	clientToken, _, _ := GenerateJWT(clientUser)

	// --- Test SuperAdmin creating a new Tenant (Company) ---
	newTenantBody, _ := json.Marshal(models.CreateTenantRequest{
		Name:         "Delta Telecom ISP",
		Slug:         "delta-telecom",
		ASN:          "269999",
		ContactEmail: "noc@deltatelecom.net",
		Plan:         "enterprise",
	})

	createReq := httptest.NewRequest("POST", "/api/tenants", bytes.NewReader(newTenantBody))
	createReq.Header.Set("Authorization", "Bearer "+superToken)
	createRec := httptest.NewRecorder()

	AuthMiddleware(http.HandlerFunc(tenantCtrl.CreateTenant)).ServeHTTP(createRec, createReq)
	if createRec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for tenant, got %d: %s", createRec.Code, createRec.Body.String())
	}

	var createdTenant models.Tenant
	if err := json.NewDecoder(createRec.Body).Decode(&createdTenant); err != nil {
		t.Fatalf("failed to decode created tenant: %v", err)
	}
	if createdTenant.ASN != "269999" || createdTenant.Slug != "delta-telecom" {
		t.Errorf("unexpected tenant data: %+v", createdTenant)
	}

	// --- Test Client Admin forbidden from creating a Tenant ---
	forbiddenReq := httptest.NewRequest("POST", "/api/tenants", bytes.NewReader(newTenantBody))
	forbiddenReq.Header.Set("Authorization", "Bearer "+clientToken)
	forbiddenRec := httptest.NewRecorder()

	AuthMiddleware(http.HandlerFunc(tenantCtrl.CreateTenant)).ServeHTTP(forbiddenRec, forbiddenReq)
	if forbiddenRec.Code != http.StatusForbidden {
		t.Fatalf("expected 403 Forbidden for client creating tenant, got %d", forbiddenRec.Code)
	}

	// --- Test SuperAdmin creating user for the new tenant ---
	newUserBody, _ := json.Marshal(models.CreateUserRequest{
		TenantID: createdTenant.ID,
		Name:     "Operador Delta",
		Email:    "operador@deltatelecom.net",
		Password: "delta_secure_pass",
		Role:     models.RoleNOCOperator,
	})

	createUserReq := httptest.NewRequest("POST", "/api/auth/users", bytes.NewReader(newUserBody))
	createUserReq.Header.Set("Authorization", "Bearer "+superToken)
	createUserRec := httptest.NewRecorder()

	AuthMiddleware(http.HandlerFunc(authCtrl.CreateUser)).ServeHTTP(createUserRec, createUserReq)
	if createUserRec.Code != http.StatusCreated {
		t.Fatalf("expected 201 Created for user, got %d: %s", createUserRec.Code, createUserRec.Body.String())
	}

	var createdUser models.UserProfile
	if err := json.NewDecoder(createUserRec.Body).Decode(&createdUser); err != nil {
		t.Fatalf("failed to decode created user: %v", err)
	}
	if createdUser.TenantID != createdTenant.ID || createdUser.Role != models.RoleNOCOperator {
		t.Errorf("unexpected user profile data: %+v", createdUser)
	}

	// --- Test Client listing users (must only see users from their own tenant) ---
	listUsersReq := httptest.NewRequest("GET", "/api/auth/users", nil)
	listUsersReq.Header.Set("Authorization", "Bearer "+clientToken)
	listUsersRec := httptest.NewRecorder()

	AuthMiddleware(http.HandlerFunc(authCtrl.ListUsers)).ServeHTTP(listUsersRec, listUsersReq)
	if listUsersRec.Code != http.StatusOK {
		t.Fatalf("expected 200 OK for list users, got %d", listUsersRec.Code)
	}

	var clientUsersList []models.UserProfile
	if err := json.NewDecoder(listUsersRec.Body).Decode(&clientUsersList); err != nil {
		t.Fatalf("failed to decode client users: %v", err)
	}

	for _, u := range clientUsersList {
		if u.TenantID != "tenant-alpha" {
			t.Errorf("tenant isolation leak! Client from tenant-alpha saw user from tenant %s (%s)", u.TenantID, u.Email)
		}
	}
}
