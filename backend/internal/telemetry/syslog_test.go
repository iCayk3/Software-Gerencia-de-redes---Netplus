package telemetry

import (
	"os"
	"strings"
	"testing"

	"network-software/internal/models"
	"network-software/internal/storage"
)

func TestSyslogHuaweiPeerStateChg(t *testing.T) {
	alertStore, cleanup := setupTestAlertStore(t)
	defer cleanup()

	broadcaster := NewBroadcaster()
	detector := NewDetector(alertStore, broadcaster)

	tmpDir, _ := os.MkdirTemp("", "devicestore-test-*")
	defer os.RemoveAll(tmpDir)
	devStore, _ := storage.NewDeviceStore(tmpDir)

	_, _ = devStore.Create(models.Device{
		ID:   "dev-bgp2",
		Name: "BGP2",
		Host: "45.166.28.249",
		Port: 22,
	})

	server := NewSyslogServer(1514, devStore, detector)

	// Case 1: Huawei BGP ESTABLISHED (UP)
	rawUp := "<190>Sep 22 2026 14:16:58 BGP-RT.02.PA.PMVR.01 %%01BGP/6/PEER_STATE_CHG(l):CID=0x801304ef;The state of the peer changed after receiving an event. (PrevState=OPENCONFIRM, CurrState=ESTABLISHED, InputEvent=RECV_KA, Peer=45.68.79.253, SourceInterface=-, VpnInstance=_public_)"
	server.handleMessage("45.166.28.249", rawUp)

	alerts := alertStore.GetActiveAlerts()
	if len(alerts) != 1 {
		t.Fatalf("expected 1 alert, got %d", len(alerts))
	}

	upAlert := alerts[0]
	if upAlert.Target != "Peer 45.68.79.253" {
		t.Errorf("expected Target 'Peer 45.68.79.253', got '%s'", upAlert.Target)
	}
	if upAlert.Severity != models.SeverityInfo {
		t.Errorf("expected SeverityInfo for ESTABLISHED, got %s", upAlert.Severity)
	}
	if !strings.Contains(upAlert.Message, "Sessão BGP Estabelecida") || !strings.Contains(upAlert.Message, "Keepalive recebido") {
		t.Errorf("unexpected alert message: %s", upAlert.Message)
	}

	// Case 2: Huawei BGP IDLE (DOWN via TCP_FAIL)
	rawDown := "<190>Sep 22 2026 14:16:07 BGP-RT.02.PA.PMVR.01 %%01BGP/6/PEER_STATE_CHG(l):CID=0x801304ef;The state of the peer changed after receiving an event. (PrevState=ESTABLISHED, CurrState=IDLE, InputEvent=TCP_FAIL, Peer=45.68.79.254, SourceInterface=-, VpnInstance=_public_)"
	server.handleMessage("45.166.28.249", rawDown)

	alerts = alertStore.GetActiveAlerts()
	if len(alerts) != 2 {
		t.Fatalf("expected 2 alerts, got %d", len(alerts))
	}

	downAlert := alerts[0]
	if downAlert.Target != "Peer 45.68.79.254" {
		t.Errorf("expected Target 'Peer 45.68.79.254', got '%s'", downAlert.Target)
	}
	if downAlert.Severity != models.SeverityCritical {
		t.Errorf("expected SeverityCritical for IDLE drop, got %s", downAlert.Severity)
	}
	if !strings.Contains(downAlert.Message, "Queda de Sessão BGP") || !strings.Contains(downAlert.Message, "Falha na conexão TCP") {
		t.Errorf("unexpected alert message: %s", downAlert.Message)
	}
}

func TestSyslogMikrotikDoesNotFalsePositiveOnHuawei(t *testing.T) {
	alertStore, cleanup := setupTestAlertStore(t)
	defer cleanup()

	broadcaster := NewBroadcaster()
	detector := NewDetector(alertStore, broadcaster)

	tmpDir, _ := os.MkdirTemp("", "devicestore-test-*")
	defer os.RemoveAll(tmpDir)
	devStore, _ := storage.NewDeviceStore(tmpDir)

	server := NewSyslogServer(1514, devStore, detector)

	// Real MikroTik message
	rawMikrotik := "bgp,connection,error remote 10.200.0.1: session terminated"
	server.handleMessage("10.200.0.254", rawMikrotik)

	alerts := alertStore.GetActiveAlerts()
	if len(alerts) != 1 {
		t.Fatalf("expected 1 alert, got %d", len(alerts))
	}
	if alerts[0].Target != "Peer 10.200.0.1" {
		t.Errorf("expected target 'Peer 10.200.0.1', got '%s'", alerts[0].Target)
	}
	if alerts[0].Severity != models.SeverityCritical {
		t.Errorf("expected SeverityCritical, got %s", alerts[0].Severity)
	}
}
