package telemetry

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"sync"
	"time"

	"network-software/internal/models"
)

var (
	ErrAlertNotFound = errors.New("alert not found")
)

// AlertStore manages storage and persistence of network alerts and telemetry snapshots.
type AlertStore struct {
	mu        sync.RWMutex
	filePath  string
	alerts    map[string]models.Alert
	snapshots []models.TelemetrySnapshot
	maxSnaps  int
}

// NewAlertStore initializes or restores the alert store.
func NewAlertStore(dataDir string) (*AlertStore, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data dir: %w", err)
	}

	filePath := filepath.Join(dataDir, "alerts.json")
	store := &AlertStore{
		filePath:  filePath,
		alerts:    make(map[string]models.Alert),
		snapshots: make([]models.TelemetrySnapshot, 0),
		maxSnaps:  200,
	}

	if err := store.load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("failed to load alerts: %w", err)
	}

	return store, nil
}

func (s *AlertStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}

	var list []models.Alert
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}

	s.alerts = make(map[string]models.Alert)
	for _, a := range list {
		s.alerts[a.ID] = a
	}
	return nil
}

func (s *AlertStore) save() error {
	list := make([]models.Alert, 0, len(s.alerts))
	for _, a := range s.alerts {
		list = append(list, a)
	}

	// Keep newest first
	sort.Slice(list, func(i, j int) bool {
		return list[i].StartedAt.After(list[j].StartedAt)
	})

	// Retain up to 300 alerts to avoid unbounded growth
	if len(list) > 300 {
		list = list[:300]
	}

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.filePath, data, 0644)
}

func generateAlertID() string {
	b := make([]byte, 6)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("alt-%d", time.Now().UnixNano())
	}
	return "alt-" + hex.EncodeToString(b)
}

// AddAlert inserts or activates an alert.
func (s *AlertStore) AddAlert(a models.Alert) models.Alert {
	s.mu.Lock()
	defer s.mu.Unlock()

	if a.ID == "" {
		a.ID = generateAlertID()
	}
	if a.StartedAt.IsZero() {
		a.StartedAt = time.Now()
	}
	if a.Status == "" {
		a.Status = "active"
	}

	s.alerts[a.ID] = a
	_ = s.save()
	return a
}

// FindActiveAlert locates an alert currently active for the given device, type and target.
func (s *AlertStore) FindActiveAlert(deviceID string, alertType models.AlertType, target string) *models.Alert {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, a := range s.alerts {
		if a.DeviceID == deviceID && a.Type == alertType && a.Target == target && (a.Status == "active" || a.Status == "acknowledged") {
			cpy := a
			return &cpy
		}
	}
	return nil
}

// ResolveAlert marks an active alert as resolved.
func (s *AlertStore) ResolveAlert(id string) (*models.Alert, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	a, ok := s.alerts[id]
	if !ok {
		return nil, ErrAlertNotFound
	}

	now := time.Now()
	a.ResolvedAt = &now
	a.Status = "resolved"
	s.alerts[id] = a
	_ = s.save()
	return &a, nil
}

// AcknowledgeAlert flags an alert as acknowledged by an operator.
func (s *AlertStore) AcknowledgeAlert(id string) (*models.Alert, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	a, ok := s.alerts[id]
	if !ok {
		return nil, ErrAlertNotFound
	}

	a.Acknowledged = true
	if a.Status == "active" {
		a.Status = "acknowledged"
	}
	s.alerts[id] = a
	_ = s.save()
	return &a, nil
}

// GetActiveAlerts returns only currently active or acknowledged alerts.
func (s *AlertStore) GetActiveAlerts() []models.Alert {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]models.Alert, 0)
	for _, a := range s.alerts {
		if a.Status == "active" || a.Status == "acknowledged" {
			result = append(result, a)
		}
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].StartedAt.After(result[j].StartedAt)
	})

	return result
}

// GetAllAlerts returns all alerts sorted by time.
func (s *AlertStore) GetAllAlerts(statusFilter string) []models.Alert {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]models.Alert, 0, len(s.alerts))
	for _, a := range s.alerts {
		if statusFilter == "" || statusFilter == "all" || a.Status == statusFilter {
			result = append(result, a)
		}
	}

	sort.Slice(result, func(i, j int) bool {
		return result[i].StartedAt.After(result[j].StartedAt)
	})

	return result
}

// AddSnapshot stores a telemetry snapshot into the circular buffer.
func (s *AlertStore) AddSnapshot(snap models.TelemetrySnapshot) {
	s.mu.Lock()
	defer s.mu.Unlock()

	s.snapshots = append(s.snapshots, snap)
	if len(s.snapshots) > s.maxSnaps {
		s.snapshots = s.snapshots[len(s.snapshots)-s.maxSnaps:]
	}
}

// GetSnapshots returns the latest snapshots up to limit.
func (s *AlertStore) GetSnapshots(limit int) []models.TelemetrySnapshot {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 || limit > len(s.snapshots) {
		limit = len(s.snapshots)
	}

	start := len(s.snapshots) - limit
	result := make([]models.TelemetrySnapshot, limit)
	copy(result, s.snapshots[start:])
	return result
}
