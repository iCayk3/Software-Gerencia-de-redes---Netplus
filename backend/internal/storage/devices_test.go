package storage

import (
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"network-software/internal/crypto"
	"network-software/internal/models"
)

func TestDeviceStoreEncryption(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "devicestore-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp dir: %v", err)
	}
	defer os.RemoveAll(tempDir)

	store, err := NewDeviceStore(tempDir)
	if err != nil {
		t.Fatalf("NewDeviceStore failed: %v", err)
	}

	plainPass := "Sup3rS3cr3t#RouterPass"
	dev, err := store.Create(models.Device{
		Name:     "Test-Router",
		Host:     "10.0.0.1",
		Port:     22,
		Vendor:   models.VendorHuawei,
		Username: "admin",
		Password: plainPass,
	})
	if err != nil {
		t.Fatalf("Create device failed: %v", err)
	}

	// In memory, password must be accessible as plaintext
	loadedDev, err := store.GetByID(dev.ID)
	if err != nil {
		t.Fatalf("GetByID failed: %v", err)
	}
	if loadedDev.Password != plainPass {
		t.Errorf("In-memory password should be %q, got %q", plainPass, loadedDev.Password)
	}

	// On disk (devices.json), password MUST be encrypted with PrefixV1
	data, err := os.ReadFile(filepath.Join(tempDir, "devices.json"))
	if err != nil {
		t.Fatalf("Failed to read devices.json: %v", err)
	}

	var rawList []map[string]interface{}
	if err := json.Unmarshal(data, &rawList); err != nil {
		t.Fatalf("Failed to parse raw devices.json: %v", err)
	}

	if len(rawList) != 1 {
		t.Fatalf("Expected 1 device on disk, got %d", len(rawList))
	}

	diskPassword, ok := rawList[0]["password"].(string)
	if !ok || diskPassword == "" {
		t.Fatalf("Expected password on disk to be a non-empty string")
	}

	if diskPassword == plainPass {
		t.Errorf("CRITICAL SECURITY FLAW: Password was stored in plaintext on disk!")
	}

	if !strings.HasPrefix(diskPassword, crypto.PrefixV1) {
		t.Errorf("Password on disk should start with %s, got: %s", crypto.PrefixV1, diskPassword)
	}

	// Now re-initialize a new store from the same directory to test loading & transparent decryption
	store2, err := NewDeviceStore(tempDir)
	if err != nil {
		t.Fatalf("Second NewDeviceStore failed: %v", err)
	}

	loadedDev2, err := store2.GetByID(dev.ID)
	if err != nil {
		t.Fatalf("GetByID on store2 failed: %v", err)
	}

	if loadedDev2.Password != plainPass {
		t.Errorf("Expected decrypted password %q, got %q", plainPass, loadedDev2.Password)
	}
}

func TestMigrateExistingDevicesJSON(t *testing.T) {
	dataPath := "../../data"
	if _, err := os.Stat(filepath.Join(dataPath, "devices.json")); os.IsNotExist(err) {
		t.Skip("No ../../data/devices.json found to migrate")
	}

	store, err := NewDeviceStore(dataPath)
	if err != nil {
		t.Fatalf("Failed to initialize store on real data: %v", err)
	}

	devices := store.GetAll()
	if len(devices) == 0 {
		t.Skip("devices.json is empty")
	}

	// Verify that each device in memory has a valid non-empty password
	for _, d := range devices {
		if d.Password == "" {
			t.Errorf("Device %s has empty password", d.Name)
		}
	}

	// Read file from disk and check that passwords on disk are now encrypted with PrefixV1
	data, err := os.ReadFile(filepath.Join(dataPath, "devices.json"))
	if err != nil {
		t.Fatalf("Failed to read devices.json: %v", err)
	}

	var rawList []map[string]interface{}
	if err := json.Unmarshal(data, &rawList); err != nil {
		t.Fatalf("Failed to parse raw devices.json: %v", err)
	}

	for _, raw := range rawList {
		pwd, _ := raw["password"].(string)
		name, _ := raw["name"].(string)
		if pwd != "" && !strings.HasPrefix(pwd, crypto.PrefixV1) {
			t.Errorf("Device %s password was NOT encrypted on disk: %s", name, pwd)
		}
	}
}
