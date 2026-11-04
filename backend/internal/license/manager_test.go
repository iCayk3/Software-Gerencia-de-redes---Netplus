package license

import (
	"os"
	"testing"
)

func TestLicenseManager_DefaultTrial(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "license_test_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	lm := NewManager(tmpDir, "")
	status := lm.GetStatus(2)

	if status.Status != StatusActive {
		t.Errorf("expected status %s, got %s", StatusActive, status.Status)
	}
	if status.Tier != TierTrial {
		t.Errorf("expected tier %s, got %s", TierTrial, status.Tier)
	}
	if status.MaxDevices != 5 {
		t.Errorf("expected max devices 5, got %d", status.MaxDevices)
	}
	if status.DeviceUsage != 2 {
		t.Errorf("expected device usage 2, got %d", status.DeviceUsage)
	}
	if status.DaysRemaining <= 0 {
		t.Errorf("expected positive days remaining, got %d", status.DaysRemaining)
	}

	// Test CanAddDevice
	if err := lm.CanAddDevice(2); err != nil {
		t.Errorf("expected CanAddDevice to succeed for 2/5, got: %v", err)
	}
	if err := lm.CanAddDevice(5); err == nil {
		t.Errorf("expected CanAddDevice to fail for 5/5, but got nil")
	}
}

func TestLicenseManager_ActivateKey(t *testing.T) {
	tmpDir, err := os.MkdirTemp("", "license_test_activate_*")
	if err != nil {
		t.Fatalf("failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tmpDir)

	lm := NewManager(tmpDir, "")

	// Activate Pro key
	newLic, err := lm.Activate("NP-PRO-2026-KEY")
	if err != nil {
		t.Fatalf("failed to activate key: %v", err)
	}
	if newLic.Tier != TierPro {
		t.Errorf("expected tier %s, got %s", TierPro, newLic.Tier)
	}
	if newLic.MaxDevices != 20 {
		t.Errorf("expected 20 devices, got %d", newLic.MaxDevices)
	}

	// Activate Enterprise key
	entLic, err := lm.Activate("NP-ENTERPRISE-UNLIMITED-KEY")
	if err != nil {
		t.Fatalf("failed to activate key: %v", err)
	}
	if entLic.Tier != TierEnterprise {
		t.Errorf("expected tier %s, got %s", TierEnterprise, entLic.Tier)
	}
	if entLic.MaxDevices != 0 {
		t.Errorf("expected 0 (unlimited) devices, got %d", entLic.MaxDevices)
	}
	if err := lm.CanAddDevice(100); err != nil {
		t.Errorf("expected unlimited devices to pass, got: %v", err)
	}
}
