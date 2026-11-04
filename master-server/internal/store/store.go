package store

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"netpulse-master/internal/models"
)

var (
	ErrLicenseNotFound = errors.New("license not found")
	ErrDuplicateKey    = errors.New("license key already exists")
)

var DefaultFeatures = []string{
	"bgp_traffic_engineering",
	"ospf_management",
	"bmp_churn_tracker",
	"rpki_validation",
	"syslog_anomaly_detection",
	"audit_trail",
	"ssh_cli_terminal",
}

type Store struct {
	mu       sync.RWMutex
	filePath string
	licenses map[string]*models.License // keyed by ID
	byKey    map[string]string          // Key -> ID
}

func NewStore(dataDir string) (*Store, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data dir: %w", err)
	}

	filePath := filepath.Join(dataDir, "master_licenses.json")
	s := &Store{
		filePath: filePath,
		licenses: make(map[string]*models.License),
		byKey:    make(map[string]string),
	}

	if err := s.load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("failed to load master licenses: %w", err)
	}

	return s, nil
}

func (s *Store) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}

	var list []*models.License
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}

	s.licenses = make(map[string]*models.License)
	s.byKey = make(map[string]string)

	for _, l := range list {
		s.licenses[l.ID] = l
		s.byKey[l.Key] = l.ID
	}
	return nil
}

func (s *Store) saveLocked() error {
	list := make([]*models.License, 0, len(s.licenses))
	for _, l := range s.licenses {
		list = append(list, l)
	}

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.filePath, data, 0644)
}

func GenerateLicenseKey(tier models.LicenseTier, maxDevices int, expiresAt time.Time) string {
	b := make([]byte, 4)
	_, _ = rand.Read(b)
	randHex := strings.ToUpper(hex.EncodeToString(b))

	tierCode := "PRO"
	switch tier {
	case models.TierEnterprise:
		tierCode = "ENT"
	case models.TierStarter:
		tierCode = "STR"
	case models.TierTrial:
		tierCode = "TRL"
	}

	devCode := fmt.Sprintf("%dDEV", maxDevices)
	if maxDevices == 0 {
		devCode = "UNLIMITED"
	}

	return fmt.Sprintf("NP-%s-%s-%s-%d", tierCode, devCode, randHex, expiresAt.Year())
}

func (s *Store) Create(req models.CreateLicenseRequest) (*models.License, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now()
	expiresAt := now.Add(time.Duration(req.ValidDays) * 24 * time.Hour)
	if req.ExpiresAt != nil && !req.ExpiresAt.IsZero() {
		expiresAt = *req.ExpiresAt
	}

	graceDays := req.GracePeriodDays
	if graceDays <= 0 {
		graceDays = 14
	}

	features := req.Features
	if len(features) == 0 {
		features = DefaultFeatures
	}

	idBytes := make([]byte, 8)
	_, _ = rand.Read(idBytes)
	id := fmt.Sprintf("lic-%s", hex.EncodeToString(idBytes))

	key := GenerateLicenseKey(req.Tier, req.MaxDevices, expiresAt)

	lic := &models.License{
		ID:              id,
		Key:             key,
		ClientName:      strings.TrimSpace(req.ClientName),
		ClientEmail:     strings.TrimSpace(req.ClientEmail),
		Tier:            req.Tier,
		MaxDevices:      req.MaxDevices,
		Status:          models.StatusActive,
		IssuedAt:        now,
		ExpiresAt:       expiresAt,
		GracePeriodDays: graceDays,
		Features:        features,
		Notes:           strings.TrimSpace(req.Notes),
	}

	s.licenses[id] = lic
	s.byKey[key] = id

	if err := s.saveLocked(); err != nil {
		return nil, fmt.Errorf("failed to persist license: %w", err)
	}

	return lic, nil
}

func (s *Store) List() []models.License {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]models.License, 0, len(s.licenses))
	for _, l := range s.licenses {
		lCopy := *l
		lCopy.Status = l.ComputeStatus()
		result = append(result, lCopy)
	}
	return result
}

func (s *Store) GetByID(id string) (*models.License, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	lic, ok := s.licenses[id]
	if !ok {
		return nil, ErrLicenseNotFound
	}
	lCopy := *lic
	lCopy.Status = lic.ComputeStatus()
	return &lCopy, nil
}

func (s *Store) GetByKey(key string) (*models.License, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	id, ok := s.byKey[key]
	if !ok {
		return nil, ErrLicenseNotFound
	}
	lic, ok := s.licenses[id]
	if !ok {
		return nil, ErrLicenseNotFound
	}
	lCopy := *lic
	lCopy.Status = lic.ComputeStatus()
	return &lCopy, nil
}

func (s *Store) Update(id string, req models.UpdateLicenseRequest) (*models.License, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	lic, ok := s.licenses[id]
	if !ok {
		return nil, ErrLicenseNotFound
	}

	if req.ClientName != "" {
		lic.ClientName = strings.TrimSpace(req.ClientName)
	}
	if req.ClientEmail != "" {
		lic.ClientEmail = strings.TrimSpace(req.ClientEmail)
	}
	if req.Tier != "" {
		lic.Tier = req.Tier
	}
	if req.MaxDevices >= 0 {
		lic.MaxDevices = req.MaxDevices
	}
	if req.Status != nil {
		lic.Status = *req.Status
	}
	if req.ExpiresAt != nil && !req.ExpiresAt.IsZero() {
		lic.ExpiresAt = *req.ExpiresAt
	}
	if req.GracePeriodDays > 0 {
		lic.GracePeriodDays = req.GracePeriodDays
	}
	if len(req.Features) > 0 {
		lic.Features = req.Features
	}
	if req.Notes != "" {
		lic.Notes = strings.TrimSpace(req.Notes)
	}

	if err := s.saveLocked(); err != nil {
		return nil, err
	}

	lCopy := *lic
	lCopy.Status = lic.ComputeStatus()
	return &lCopy, nil
}

func (s *Store) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	lic, ok := s.licenses[id]
	if !ok {
		return ErrLicenseNotFound
	}

	delete(s.byKey, lic.Key)
	delete(s.licenses, id)

	return s.saveLocked()
}

func (s *Store) RecordHeartbeat(payload models.HeartbeatPayload, remoteIP string) (*models.License, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	id, ok := s.byKey[payload.LicenseKey]
	if !ok {
		return nil, ErrLicenseNotFound
	}

	lic, ok := s.licenses[id]
	if !ok {
		return nil, ErrLicenseNotFound
	}

	now := time.Now()
	lic.LastHeartbeat = &now
	lic.LastInstanceID = payload.InstanceID
	lic.LastHostname = payload.Hostname
	lic.LastRemoteIP = remoteIP
	lic.LastVersion = payload.Version
	lic.LastDeviceCount = payload.DeviceCount
	lic.LastUptimeSeconds = payload.UptimeSeconds

	_ = s.saveLocked()

	lCopy := *lic
	lCopy.Status = lic.ComputeStatus()
	return &lCopy, nil
}

func (s *Store) GetFleetOverview() models.FleetOverview {
	s.mu.RLock()
	defer s.mu.RUnlock()

	now := time.Now()
	overview := models.FleetOverview{
		TotalClients: len(s.licenses),
	}

	for _, l := range s.licenses {
		status := l.ComputeStatus()
		if status == models.StatusActive || status == models.StatusGracePeriod {
			overview.ActiveLicenses++
		}
		if l.IsOnline() {
			overview.OnlineInstances++
		}
		overview.TotalMonitored += l.LastDeviceCount

		// Expiring within 15 days
		if status == models.StatusActive && l.ExpiresAt.Before(now.Add(15*24*time.Hour)) {
			overview.ExpiringSoon++
		}
	}

	return overview
}
