package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"network-software/internal/models"
	"network-software/internal/storage"
)

func TestAuthAndRBAC(t *testing.T) {
	_ = os.Remove("test_users.json")
	_ = os.Remove("test_audit.json")
	defer os.Remove("test_users.json")
	defer os.Remove("test_audit.json")

	// Initialize memory stores
	userStore := storage.NewMemoryUserStore("test_users.json")
	auditStore := storage.NewMemoryAuditStore("test_audit.json")

	authCtrl := NewAuthController(userStore, auditStore)

	// 1. Test Login with valid credentials
	loginBody, _ := json.Marshal(models.LoginRequest{
		Email:    "admin@netpulse.com",
		Password: "admin123",
	})
	req := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(loginBody))
	rec := httptest.NewRecorder()
	authCtrl.Login(rec, req)

	if rec.Code != http.StatusOK {
		t.Fatalf("expected login 200, got %d: %s", rec.Code, rec.Body.String())
	}

	var loginResp models.LoginResponse
	if err := json.NewDecoder(rec.Body).Decode(&loginResp); err != nil {
		t.Fatalf("failed to decode login response: %v", err)
	}

	if loginResp.Token == "" {
		t.Fatal("expected non-empty JWT token")
	}
	if loginResp.User.Role != models.RoleAdmin {
		t.Errorf("expected role admin, got %s", loginResp.User.Role)
	}

	// 2. Test Login with invalid credentials
	badLoginBody, _ := json.Marshal(models.LoginRequest{
		Email:    "admin@netpulse.com",
		Password: "wrongpassword",
	})
	badReq := httptest.NewRequest("POST", "/api/auth/login", bytes.NewReader(badLoginBody))
	badRec := httptest.NewRecorder()
	authCtrl.Login(badRec, badReq)

	if badRec.Code != http.StatusUnauthorized {
		t.Errorf("expected 401 for wrong password, got %d", badRec.Code)
	}

	// 3. Test RBAC: Viewer trying to execute an action
	viewerToken, _, err := GenerateJWT(&models.User{
		ID:        "viewer-1",
		TenantID:  "default-tenant",
		Name:      "Diretoria Viewer",
		Email:     "diretoria@netpulse.com",
		Role:      models.RoleViewer,
		Status:    "active",
		CreatedAt: time.Now(),
	})
	if err != nil {
		t.Fatalf("failed to generate viewer token: %v", err)
	}

	protectedHandler := RequireRole(models.RoleAdmin, models.RoleNOCOperator)(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(`{"success":true}`))
	})

	// Wrap with AuthMiddleware
	handlerToTest := AuthMiddleware(http.HandlerFunc(protectedHandler))

	// Viewer request -> should be 403 Forbidden
	vReq := httptest.NewRequest("POST", "/api/devices/dev-1/routes/static", nil)
	vReq.Header.Set("Authorization", "Bearer "+viewerToken)
	vRec := httptest.NewRecorder()
	handlerToTest.ServeHTTP(vRec, vReq)

	if vRec.Code != http.StatusForbidden {
		t.Errorf("expected 403 Forbidden for viewer, got %d: %s", vRec.Code, vRec.Body.String())
	}

	// Admin request with token -> should be 200 OK
	aReq := httptest.NewRequest("POST", "/api/devices/dev-1/routes/static", nil)
	aReq.Header.Set("Authorization", "Bearer "+loginResp.Token)
	aRec := httptest.NewRecorder()
	handlerToTest.ServeHTTP(aRec, aReq)

	if aRec.Code != http.StatusOK {
		t.Errorf("expected 200 OK for admin, got %d: %s", aRec.Code, aRec.Body.String())
	}
}

func TestAuditTrailRecording(t *testing.T) {
	_ = os.Remove("test_audit_trail.json")
	defer os.Remove("test_audit_trail.json")

	auditStore := storage.NewMemoryAuditStore("test_audit_trail.json")

	entry := &models.AuditLog{
		TenantID:         "default-tenant",
		UserID:           "usr-test",
		UserName:         "Operador Teste",
		UserEmail:        "op@test.com",
		ClientIP:         "192.168.1.50",
		Action:           models.ActionAddStaticRoute,
		TargetDeviceID:   "dev-1",
		TargetDeviceName: "BGP-Edge-1",
		CommandExecuted:  "ip route-static 10.0.0.0 255.0.0.0 192.168.1.1",
		Status:           "SUCCESS",
	}

	if err := auditStore.Record(entry); err != nil {
		t.Fatalf("failed to record audit entry: %v", err)
	}

	logs, total, err := auditStore.Query(models.AuditFilter{
		TenantID: "default-tenant",
		DeviceID: "dev-1",
		Limit:    10,
	})
	if err != nil {
		t.Fatalf("failed to query audit logs: %v", err)
	}

	if total != 1 || len(logs) != 1 {
		t.Fatalf("expected 1 log, got total=%d len=%d", total, len(logs))
	}

	if logs[0].CommandExecuted != entry.CommandExecuted {
		t.Errorf("expected command %s, got %s", entry.CommandExecuted, logs[0].CommandExecuted)
	}
}
