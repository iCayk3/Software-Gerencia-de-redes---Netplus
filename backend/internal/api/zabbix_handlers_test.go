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

func setupZabbixTestEnv(t *testing.T) (*ZabbixController, *storage.LinkStore, *storage.DeviceStore, func()) {
	tmpDir, err := os.MkdirTemp("", "zabbix_test_*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}

	zabbixStore, err := storage.NewZabbixStore(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create zabbix store: %v", err)
	}
	_ = zabbixStore.SaveConfig(models.ZabbixConfig{
		URL:           "http://fake-zabbix.local",
		WebhookSecret: "test-secret-1234",
		Enabled:       true,
	})

	linkStore, err := storage.NewLinkStore(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create link store: %v", err)
	}

	deviceStore, err := storage.NewDeviceStore(tmpDir)
	if err != nil {
		t.Fatalf("Failed to create device store: %v", err)
	}

	dev1, _ := deviceStore.Create(models.Device{
		Name:   "SW.PE.02.PA.JABR.01",
		Host:   "10.80.80.2",
		Vendor: models.VendorHuawei,
	})
	dev2, _ := deviceStore.Create(models.Device{
		Name:   "BGP-RT.02.PA.PMVR.01",
		Host:   "10.80.80.1",
		Vendor: models.VendorHuawei,
	})

	_, _ = linkStore.Create(models.BackboneLink{
		ID:              "link-test-01",
		Name:            "Enlace Jaboti -> Primavera",
		SourceDeviceID:  dev1.ID,
		TargetDeviceID:  dev2.ID,
		SourceInterface: "10GE0/1/1",
		TargetInterface: "10GE0/1/2",
		Status:          "active",
		Path:            [][2]float64{{-1.2, -47.1}, {-1.3, -47.2}},
	})

	ctrl := NewZabbixController(zabbixStore, linkStore, deviceStore, nil)

	cleanup := func() {
		_ = os.RemoveAll(tmpDir)
	}

	return ctrl, linkStore, deviceStore, cleanup
}

func TestZabbixWebhookDownAndRecovery(t *testing.T) {
	ctrl, linkStore, _, cleanup := setupZabbixTestEnv(t)
	defer cleanup()

	// 1. Send Problem event (interface down)
	problemPayload := models.ZabbixWebhookPayload{
		EventValue:  "1",
		HostIP:      "10.80.80.2",
		HostName:    "SW.PE.02.PA.JABR.01",
		ItemName:    "Interface 10GE0/1/1: Operational status",
		ItemKey:     "net.if.status[10GE0/1/1]",
		TriggerName: "Interface 10GE0/1/1: Link down",
	}

	data, _ := json.Marshal(problemPayload)
	req := httptest.NewRequest("POST", "/api/webhooks/zabbix?token=test-secret-1234", bytes.NewReader(data))
	w := httptest.NewRecorder()

	ctrl.HandleWebhook(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", w.Code, w.Body.String())
	}

	// Verify link is now DOWN
	link, err := linkStore.GetByID("link-test-01")
	if err != nil {
		t.Fatalf("Failed to fetch link: %v", err)
	}
	if link.Status != "down" {
		t.Errorf("Expected link status 'down', got '%s'", link.Status)
	}
	if link.ZabbixProblem != "Interface 10GE0/1/1: Link down" {
		t.Errorf("Unexpected problem desc: '%s'", link.ZabbixProblem)
	}

	// 2. Send Recovery event (interface recovered to OK)
	recoveryPayload := models.ZabbixWebhookPayload{
		EventValue:  "0",
		HostIP:      "10.80.80.2",
		HostName:    "SW.PE.02.PA.JABR.01",
		ItemName:    "Interface 10GE0/1/1: Operational status",
		ItemKey:     "net.if.status[10GE0/1/1]",
		TriggerName: "Interface 10GE0/1/1: Link down (RESOLVED)",
	}

	dataRec, _ := json.Marshal(recoveryPayload)
	reqRec := httptest.NewRequest("POST", "/api/webhooks/zabbix?token=test-secret-1234", bytes.NewReader(dataRec))
	wRec := httptest.NewRecorder()

	ctrl.HandleWebhook(wRec, reqRec)

	if wRec.Code != http.StatusOK {
		t.Fatalf("Expected 200 OK, got %d: %s", wRec.Code, wRec.Body.String())
	}

	// Verify link is now ACTIVE
	linkRec, _ := linkStore.GetByID("link-test-01")
	if linkRec.Status != "active" {
		t.Errorf("Expected link status 'active' after recovery, got '%s'", linkRec.Status)
	}
	if linkRec.ZabbixProblem != "" {
		t.Errorf("Expected empty ZabbixProblem after recovery, got '%s'", linkRec.ZabbixProblem)
	}
}

func TestZabbixWebhookUnauthorized(t *testing.T) {
	ctrl, _, _, cleanup := setupZabbixTestEnv(t)
	defer cleanup()

	problemPayload := models.ZabbixWebhookPayload{
		EventValue: "1",
		HostIP:     "10.80.80.2",
	}
	data, _ := json.Marshal(problemPayload)
	req := httptest.NewRequest("POST", "/api/webhooks/zabbix?token=WRONG_TOKEN", bytes.NewReader(data))
	w := httptest.NewRecorder()

	ctrl.HandleWebhook(w, req)

	if w.Code != http.StatusUnauthorized {
		t.Fatalf("Expected 401 Unauthorized for invalid token, got %d", w.Code)
	}
}
