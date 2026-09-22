package telemetry

import (
	"os"
	"path/filepath"
	"testing"

	"network-software/internal/models"
)

func setupTestAlertStore(t *testing.T) (*AlertStore, func()) {
	tmpDir, err := os.MkdirTemp("", "alertstore-test-*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}

	store, err := NewAlertStore(tmpDir)
	if err != nil {
		os.RemoveAll(tmpDir)
		t.Fatalf("failed to create alert store: %v", err)
	}

	cleanup := func() {
		os.RemoveAll(tmpDir)
	}

	return store, cleanup
}

func TestDeviceOfflineAndRecovery(t *testing.T) {
	alertStore, cleanup := setupTestAlertStore(t)
	defer cleanup()

	broadcaster := NewBroadcaster()
	detector := NewDetector(alertStore, broadcaster)

	dev := models.Device{
		ID:   "dev-1",
		Name: "Router-Core-1",
		Host: "192.168.1.1",
		Port: 22,
	}

	// 1. Device becomes offline
	detector.EvaluateDeviceReachability(dev, false, "connection refused")
	active := alertStore.GetActiveAlerts()
	if len(active) != 1 {
		t.Fatalf("expected 1 active alert, got %d", len(active))
	}
	if active[0].Type != models.AlertDeviceOffline {
		t.Errorf("expected AlertDeviceOffline, got %s", active[0].Type)
	}
	if active[0].Severity != models.SeverityCritical {
		t.Errorf("expected Critical severity, got %s", active[0].Severity)
	}

	// 2. Calling offline again shouldn't duplicate the alert
	detector.EvaluateDeviceReachability(dev, false, "timeout")
	active = alertStore.GetActiveAlerts()
	if len(active) != 1 {
		t.Fatalf("expected 1 active alert (no duplication), got %d", len(active))
	}

	// 3. Device recovers -> Auto-resolve
	detector.EvaluateDeviceReachability(dev, true, "")
	active = alertStore.GetActiveAlerts()
	if len(active) != 0 {
		t.Fatalf("expected 0 active alerts after auto-recovery, got %d", len(active))
	}
}

func TestBGPSessionDropAndRecovery(t *testing.T) {
	alertStore, cleanup := setupTestAlertStore(t)
	defer cleanup()

	broadcaster := NewBroadcaster()
	detector := NewDetector(alertStore, broadcaster)

	// Peer 10.0.0.2 is established initially
	prevSessions := []models.BGPSession{
		{
			DeviceID:         "dev-1",
			DeviceName:       "Router-Core",
			PeerIP:           "10.0.0.2",
			RemoteAS:         "65002",
			State:            "Established",
			PrefixesReceived: 500,
		},
	}

	// 1. Peer goes Idle (Dropped)
	currSessions := []models.BGPSession{
		{
			DeviceID:         "dev-1",
			DeviceName:       "Router-Core",
			PeerIP:           "10.0.0.2",
			RemoteAS:         "65002",
			State:            "Idle",
			PrefixesReceived: 0,
		},
	}

	detector.EvaluateBGPSessions("dev-1", "Router-Core", currSessions, prevSessions)
	active := alertStore.GetActiveAlerts()
	if len(active) != 1 {
		t.Fatalf("expected 1 active alert for BGP drop, got %d", len(active))
	}
	if active[0].Type != models.AlertBGPDown {
		t.Errorf("expected AlertBGPDown, got %s", active[0].Type)
	}

	// 2. Peer recovers to Established
	currSessions[0].State = "Established"
	currSessions[0].PrefixesReceived = 500
	detector.EvaluateBGPSessions("dev-1", "Router-Core", currSessions, currSessions)

	active = alertStore.GetActiveAlerts()
	if len(active) != 0 {
		t.Fatalf("expected 0 active alerts after BGP recovery, got %d", len(active))
	}
}

func TestBGPPrefixDrop(t *testing.T) {
	alertStore, cleanup := setupTestAlertStore(t)
	defer cleanup()

	broadcaster := NewBroadcaster()
	detector := NewDetector(alertStore, broadcaster)

	prevSessions := []models.BGPSession{
		{
			DeviceID:         "dev-1",
			DeviceName:       "Router-Core",
			PeerIP:           "10.0.0.2",
			RemoteAS:         "65002",
			State:            "Established",
			PrefixesReceived: 1000,
		},
	}

	// Still Established, but prefixes dropped to 0!
	currSessions := []models.BGPSession{
		{
			DeviceID:         "dev-1",
			DeviceName:       "Router-Core",
			PeerIP:           "10.0.0.2",
			RemoteAS:         "65002",
			State:            "Established",
			PrefixesReceived: 0,
		},
	}

	detector.EvaluateBGPSessions("dev-1", "Router-Core", currSessions, prevSessions)
	active := alertStore.GetActiveAlerts()
	if len(active) != 1 {
		t.Fatalf("expected 1 active alert for prefix drop, got %d", len(active))
	}
	if active[0].Type != models.AlertBGPPrefixDrop {
		t.Errorf("expected AlertBGPPrefixDrop, got %s", active[0].Type)
	}
}

func TestOSPFNeighborDropAndRecovery(t *testing.T) {
	alertStore, cleanup := setupTestAlertStore(t)
	defer cleanup()

	broadcaster := NewBroadcaster()
	detector := NewDetector(alertStore, broadcaster)

	// Neighbor dropped to Init
	neighbors := []models.OSPFNeighbor{
		{
			DeviceID:   "dev-1",
			DeviceName: "Router-Core",
			NeighborID: "10.255.255.2",
			Interface:  "GigabitEthernet0/0/1",
			Area:       "0.0.0.0",
			State:      "Init",
		},
	}

	detector.EvaluateOSPFNeighbors("dev-1", "Router-Core", neighbors)
	active := alertStore.GetActiveAlerts()
	if len(active) != 1 {
		t.Fatalf("expected 1 active alert for OSPF drop, got %d", len(active))
	}
	if active[0].Type != models.AlertOSPFDown {
		t.Errorf("expected AlertOSPFDown, got %s", active[0].Type)
	}

	// Neighbor recovers to Full
	neighbors[0].State = "Full"
	detector.EvaluateOSPFNeighbors("dev-1", "Router-Core", neighbors)
	active = alertStore.GetActiveAlerts()
	if len(active) != 0 {
		t.Fatalf("expected 0 active alerts after OSPF recovery, got %d", len(active))
	}
}

func TestAcknowledgeAlert(t *testing.T) {
	tmpDir, _ := os.MkdirTemp("", "alertstore-ack-*")
	defer os.RemoveAll(tmpDir)

	store, _ := NewAlertStore(filepath.Join(tmpDir, "alerts"))
	alert := store.AddAlert(models.Alert{
		DeviceID:   "dev-1",
		DeviceName: "Router",
		Type:       models.AlertBGPDown,
		Severity:   models.SeverityCritical,
		Message:    "Peer 10.0.0.1 down",
	})

	ack, err := store.AcknowledgeAlert(alert.ID)
	if err != nil {
		t.Fatalf("failed to ack alert: %v", err)
	}
	if !ack.Acknowledged || ack.Status != "acknowledged" {
		t.Errorf("expected status 'acknowledged', got %s", ack.Status)
	}
}
