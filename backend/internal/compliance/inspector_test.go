package compliance

import (
	"errors"
	"strings"
	"testing"

	"network-software/internal/models"
)

type mockRunner struct {
	testConnFunc func() (models.SSHTestResult, error)
	runCmdFunc  func(cmd string) (string, error)
}

func (m *mockRunner) TestConnection() (models.SSHTestResult, error) {
	if m.testConnFunc != nil {
		return m.testConnFunc()
	}
	return models.SSHTestResult{Success: true, LatencyMs: 12.5, Banner: "Huawei Versatile Routing Platform Software"}, nil
}

func (m *mockRunner) RunCommand(cmd string) (string, error) {
	if m.runCmdFunc != nil {
		return m.runCmdFunc(cmd)
	}
	return "", nil
}

func TestAuditDevice_SSHFailure(t *testing.T) {
	ins := NewInspector()
	dev := &models.Device{
		ID:     "dev-fail",
		Name:   "BGP-Down",
		Vendor: models.VendorHuawei,
		Host:   "10.0.0.1",
	}

	runner := &mockRunner{
		testConnFunc: func() (models.SSHTestResult, error) {
			return models.SSHTestResult{Success: false, Error: "connection reset by peer"}, errors.New("timeout")
		},
	}

	audit, err := ins.AuditDevice(dev, runner, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if audit.OverallStatus != models.ComplianceFailed {
		t.Errorf("expected failed status, got %s", audit.OverallStatus)
	}
	if audit.IsManageable {
		t.Errorf("expected is_manageable=false on SSH failure")
	}
	if audit.OverallScore != 0 {
		t.Errorf("expected 0 score, got %d", audit.OverallScore)
	}
	if len(audit.Items) != 1 || audit.Items[0].Status != models.ComplianceFailed {
		t.Errorf("expected 1 failed item")
	}
}

func TestAuditDevice_HuaweiCompliant(t *testing.T) {
	ins := NewInspector()
	dev := &models.Device{
		ID:     "dev-huawei-ok",
		Name:   "BGP-RT.01",
		Vendor: models.VendorHuawei,
		Host:   "45.166.28.254",
	}

	runner := &mockRunner{
		runCmdFunc: func(cmd string) (string, error) {
			switch {
			case strings.Contains(cmd, "configuration bgp"):
				return "bgp 267943\n router-id 45.166.28.254\n peer 170.82.183.217 as-number 266445\n peer 170.82.183.217 route-policy POL-SEA-EXPORT export\n", nil
			case strings.Contains(cmd, "RP-TAG-V4-ORIGIN"):
				return "route-policy RP-TAG-V4-ORIGIN permit node 10\n if-match ip-prefix EXACT-V4-2228\n apply community 267943:1000 1:20030 additive\n", nil
			case strings.Contains(cmd, "info-center"):
				return "info-center loghost 10.10.10.1 facility local7 1514\n", nil
			default:
				return "", nil
			}
		},
	}

	audit, err := ins.AuditDevice(dev, runner, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if audit.OverallStatus != models.CompliancePassed {
		t.Errorf("expected passed status, got %s", audit.OverallStatus)
	}
	if !audit.IsManageable {
		t.Errorf("expected is_manageable=true for fully compliant Huawei router")
	}
	if audit.LocalASN != "267943" {
		t.Errorf("expected LocalASN 267943, got %s", audit.LocalASN)
	}
	if !audit.HasOriginTagging {
		t.Errorf("expected HasOriginTagging=true")
	}
	if audit.RemediationScript != "" {
		t.Errorf("expected empty remediation script for already compliant router")
	}
}

func TestAuditDevice_HuaweiMissingOriginTagging(t *testing.T) {
	ins := NewInspector()
	dev := &models.Device{
		ID:     "dev-huawei-warning",
		Name:   "BGP-RT.02",
		Vendor: models.VendorHuawei,
		Host:   "45.166.28.249",
	}

	runner := &mockRunner{
		runCmdFunc: func(cmd string) (string, error) {
			switch {
			case strings.Contains(cmd, "configuration bgp"):
				return "bgp 267943\n router-id 45.166.28.249\n peer 170.82.183.217 as-number 266445\n", nil
			case strings.Contains(cmd, "RP-TAG-V4-ORIGIN"):
				return "Error: The route-policy does not exist.", nil
			default:
				return "", nil
			}
		},
	}

	audit, err := ins.AuditDevice(dev, runner, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if audit.OverallStatus != models.ComplianceWarning {
		t.Errorf("expected warning status, got %s", audit.OverallStatus)
	}
	if audit.IsManageable {
		t.Errorf("expected is_manageable=false when missing RP-TAG-V4-ORIGIN")
	}
	if audit.HasOriginTagging {
		t.Errorf("expected HasOriginTagging=false")
	}
	if audit.RemediationScript == "" || !strings.Contains(audit.RemediationScript, "RP-TAG-V4-ORIGIN") {
		t.Errorf("expected remediation script with RP-TAG-V4-ORIGIN")
	}
}

func TestAuditDevice_HuaweiFallbackBgpPeer(t *testing.T) {
	ins := NewInspector()
	dev := &models.Device{
		ID:     "dev-huawei-fallback",
		Name:   "BGP-RT.01",
		Vendor: models.VendorHuawei,
		Host:   "45.166.28.254",
	}

	runner := &mockRunner{
		runCmdFunc: func(cmd string) (string, error) {
			switch {
			case strings.Contains(cmd, "configuration bgp"):
				// Simula retorno vazio ou sem permissão de display current-configuration
				return "Error: You do not have permission to run this command.", nil
			case strings.Contains(cmd, "display bgp peer"):
				return `BGP local router ID : 45.166.28.254,   Local AS number : 267943
Total number of peers : 1        Peers in established state : 1

Peer            V    AS  MsgRcvd  MsgSent  OutQ  Up/Down       State  PrefRcv
170.82.183.217  4 266445   12345    12340     0 04:12:30 Established     500`, nil
			default:
				return "", nil
			}
		},
	}

	audit, err := ins.AuditDevice(dev, runner, "")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	if audit.LocalASN != "267943" {
		t.Errorf("expected LocalASN 267943 from fallback, got '%s'", audit.LocalASN)
	}
	if audit.RouterID != "45.166.28.254" {
		t.Errorf("expected RouterID 45.166.28.254 from fallback, got '%s'", audit.RouterID)
	}
	if audit.TotalSessions != 1 {
		t.Errorf("expected 1 session from fallback, got %d", audit.TotalSessions)
	}
}

func TestAuditDevice_UsesExpectedASNWhenBgpMissing(t *testing.T) {
	ins := NewInspector()
	dev := &models.Device{
		ID:     "dev-huawei-nobgp",
		Name:   "BGP-RT.01",
		Vendor: models.VendorHuawei,
		Host:   "45.166.28.254",
	}

	runner := &mockRunner{
		runCmdFunc: func(cmd string) (string, error) {
			return "", nil
		},
	}

	audit, err := ins.AuditDevice(dev, runner, "267943")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	foundItem := false
	for _, item := range audit.Items {
		if item.ID == "chk-bgp-process" {
			foundItem = true
			if !strings.Contains(item.Message, "bgp 267943") {
				t.Errorf("expected message to mention 'bgp 267943', got '%s'", item.Message)
			}
			if !strings.Contains(item.Remediation, "bgp 267943") {
				t.Errorf("expected remediation to mention 'bgp 267943', got '%s'", item.Remediation)
			}
		}
	}
	if !foundItem {
		t.Errorf("expected chk-bgp-process item")
	}
}
