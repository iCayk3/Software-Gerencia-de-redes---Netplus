package storage

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"network-software/internal/crypto"
	"network-software/internal/models"
)

var (
	ErrDeviceNotFound = errors.New("device not found")
)

// DeviceStore handles persistent storage of devices in a local JSON file.
type DeviceStore struct {
	mu       sync.RWMutex
	filePath string
	devices  map[string]models.Device
}

// NewDeviceStore initializes or loads the device store.
func NewDeviceStore(dataDir string) (*DeviceStore, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	filePath := filepath.Join(dataDir, "devices.json")
	store := &DeviceStore{
		filePath: filePath,
		devices:  make(map[string]models.Device),
	}

	if err := store.load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("failed to load devices: %w", err)
	}

	return store, nil
}

func (s *DeviceStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}

	var list []models.Device
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}

	s.devices = make(map[string]models.Device)
	key := crypto.GetEncryptionKey()
	hadPlaintext := false

	for _, d := range list {
		if d.TenantID == "" {
			d.TenantID = "default-tenant"
		}
		if d.Password != "" && !strings.HasPrefix(d.Password, crypto.PrefixV1) {
			hadPlaintext = true
		}
		if d.Password != "" {
			if plain, err := crypto.Decrypt(d.Password, key); err == nil {
				d.Password = plain
			} else {
				log.Printf("[Security Warning] ⚠️ Falha ao descriptografar senha de %s (%s): %v. Verifique a variável DEVICE_ENCRYPTION_KEY.", d.Name, d.Host, err)
			}
		}
		s.devices[d.ID] = d
	}

	// Auto-migrate plaintext passwords to encrypted on disk immediately
	if hadPlaintext {
		_ = s.saveLocked()
	}

	return nil
}

func (s *DeviceStore) save() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveLocked()
}

func (s *DeviceStore) saveLocked() error {
	key := crypto.GetEncryptionKey()
	list := make([]models.Device, 0, len(s.devices))
	for _, d := range s.devices {
		dCopy := d
		if dCopy.Password != "" {
			if enc, err := crypto.Encrypt(dCopy.Password, key); err == nil {
				dCopy.Password = enc
			}
		}
		list = append(list, dCopy)
	}

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.filePath, data, 0644)
}

func generateID() string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(bytes)
}

// GetAll returns a list of all devices in the store.
func (s *DeviceStore) GetAll() []models.Device {
	return s.GetAllByTenant("")
}

// GetAllByTenant returns devices belonging to a specific tenant (or all if tenantID is empty or "all").
func (s *DeviceStore) GetAllByTenant(tenantID string) []models.Device {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]models.Device, 0, len(s.devices))
	for _, d := range s.devices {
		if tenantID == "" || tenantID == "all" || d.TenantID == tenantID {
			result = append(result, d)
		}
	}
	return result
}

// GetAllSafe returns devices with sensitive credentials masked.
func (s *DeviceStore) GetAllSafe() []models.SafeDevice {
	return s.GetAllSafeByTenant("")
}

// GetAllSafeByTenant returns safe devices filtered by tenantID (or all if empty or "all").
func (s *DeviceStore) GetAllSafeByTenant(tenantID string) []models.SafeDevice {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]models.SafeDevice, 0, len(s.devices))
	for _, d := range s.devices {
		if tenantID == "" || tenantID == "all" || d.TenantID == tenantID {
			result = append(result, d.ToSafe())
		}
	}
	return result
}

// GetByID returns a device by its ID.
func (s *DeviceStore) GetByID(id string) (*models.Device, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	d, ok := s.devices[id]
	if !ok {
		return nil, ErrDeviceNotFound
	}
	return &d, nil
}

// GetByIDAndTenant returns a device by ID ensuring it belongs to tenantID (unless tenantID is empty/all).
func (s *DeviceStore) GetByIDAndTenant(id, tenantID string) (*models.Device, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	d, ok := s.devices[id]
	if !ok {
		return nil, ErrDeviceNotFound
	}
	if tenantID != "" && tenantID != "all" && d.TenantID != tenantID {
		return nil, ErrDeviceNotFound
	}
	return &d, nil
}

// Create inserts a new device.
func (s *DeviceStore) Create(d models.Device) (*models.Device, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if d.ID == "" {
		d.ID = generateID()
	}
	if d.TenantID == "" {
		d.TenantID = "default-tenant"
	}
	if d.Port <= 0 {
		d.Port = 22
	}
	if d.Status == "" {
		d.Status = "untested"
	}
	if d.DeviceRole == "" {
		if d.IsBGP {
			d.DeviceRole = models.RoleBGP
		} else {
			d.DeviceRole = models.RoleSW
		}
	}
	d.CreatedAt = time.Now()

	s.devices[d.ID] = d
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return &d, nil
}

// Update updates an existing device.
func (s *DeviceStore) Update(d models.Device) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, ok := s.devices[d.ID]
	if !ok {
		return ErrDeviceNotFound
	}

	// Preserve password if blank in update request
	if d.Password == "" {
		d.Password = existing.Password
	}
	if d.TenantID == "" {
		d.TenantID = existing.TenantID
	}
	if d.Port <= 0 {
		d.Port = 22
	}
	if d.DeviceRole == "" {
		d.DeviceRole = existing.DeviceRole
	}
	if d.Latitude == nil {
		d.Latitude = existing.Latitude
	}
	if d.Longitude == nil {
		d.Longitude = existing.Longitude
	}
	if d.Site == "" {
		d.Site = existing.Site
	}
	if d.City == "" {
		d.City = existing.City
	}
	d.CreatedAt = existing.CreatedAt
	d.LastSeen = existing.LastSeen

	s.devices[d.ID] = d
	return s.saveLocked()
}

// Delete removes a device by ID.
func (s *DeviceStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.devices[id]; !ok {
		return ErrDeviceNotFound
	}
	delete(s.devices, id)
	return s.saveLocked()
}

// UpdateStatus updates the online/offline status and last seen timestamp.
func (s *DeviceStore) UpdateStatus(id string, status string) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if d, ok := s.devices[id]; ok {
		now := time.Now()
		d.Status = status
		d.LastSeen = &now
		s.devices[id] = d
		_ = s.saveLocked()
	}
}
