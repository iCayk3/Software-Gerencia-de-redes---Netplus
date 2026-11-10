package storage

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"network-software/internal/models"
)

var ErrLinkNotFound = errors.New("link not found")

// LinkStore manages persistent storage of backbone point-to-point links.
type LinkStore struct {
	mu       sync.RWMutex
	filePath string
	links    map[string]models.BackboneLink
}

// NewLinkStore initializes or loads the links store from links.json.
func NewLinkStore(dataDir string) (*LinkStore, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	filePath := filepath.Join(dataDir, "links.json")
	store := &LinkStore{
		filePath: filePath,
		links:    make(map[string]models.BackboneLink),
	}

	if err := store.load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("failed to load links: %w", err)
	}

	return store, nil
}

func (s *LinkStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}

	var list []models.BackboneLink
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}

	s.links = make(map[string]models.BackboneLink)
	for _, l := range list {
		if l.TenantID == "" {
			l.TenantID = "default-tenant"
		}
		if l.Status == "" {
			l.Status = "active"
		}
		if l.Type == "" {
			l.Type = models.LinkTypeFiber
		}
		if l.RoutingMode == "" {
			l.RoutingMode = models.LinkRoutingRoad
		}
		if l.Color == "" {
			l.Color = "#00E5FF"
		}
		s.links[l.ID] = l
	}

	return nil
}

func (s *LinkStore) save() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.saveLocked()
}

func (s *LinkStore) saveLocked() error {
	list := make([]models.BackboneLink, 0, len(s.links))
	for _, l := range s.links {
		list = append(list, l)
	}

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.filePath, data, 0644)
}

func generateLinkID() string {
	bytes := make([]byte, 8)
	if _, err := rand.Read(bytes); err != nil {
		return fmt.Sprintf("lnk-%d", time.Now().UnixNano())
	}
	return "lnk-" + hex.EncodeToString(bytes)
}

// GetAll returns all links across all tenants.
func (s *LinkStore) GetAll() []models.BackboneLink {
	return s.GetAllByTenant("")
}

// GetAllByTenant returns links filtered by tenantID (or all if empty or "all").
func (s *LinkStore) GetAllByTenant(tenantID string) []models.BackboneLink {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make([]models.BackboneLink, 0, len(s.links))
	for _, l := range s.links {
		if tenantID == "" || tenantID == "all" || l.TenantID == tenantID {
			result = append(result, l)
		}
	}
	return result
}

// GetByID returns a single link by ID.
func (s *LinkStore) GetByID(id string) (*models.BackboneLink, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	link, ok := s.links[id]
	if !ok {
		return nil, ErrLinkNotFound
	}
	return &link, nil
}

// Create inserts a new link into the store.
func (s *LinkStore) Create(link models.BackboneLink) (*models.BackboneLink, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	if link.ID == "" {
		link.ID = generateLinkID()
	}
	if link.TenantID == "" {
		link.TenantID = "default-tenant"
	}
	if link.Type == "" {
		link.Type = models.LinkTypeFiber
	}
	if link.RoutingMode == "" {
		link.RoutingMode = models.LinkRoutingRoad
	}
	if link.Status == "" {
		link.Status = "active"
	}
	if link.Color == "" {
		link.Color = "#00E5FF"
	}
	now := time.Now()
	link.CreatedAt = now
	link.UpdatedAt = now

	s.links[link.ID] = link
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return &link, nil
}

// Update updates an existing link. Preserves fields omitted in partial requests.
func (s *LinkStore) Update(link models.BackboneLink) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, ok := s.links[link.ID]
	if !ok {
		return ErrLinkNotFound
	}

	if link.Name == "" {
		link.Name = existing.Name
	}
	if link.TenantID == "" {
		link.TenantID = existing.TenantID
	}
	if link.SourceDeviceID == "" {
		link.SourceDeviceID = existing.SourceDeviceID
	}
	if link.TargetDeviceID == "" {
		link.TargetDeviceID = existing.TargetDeviceID
	}
	if link.Type == "" {
		link.Type = existing.Type
	}
	if link.RoutingMode == "" {
		link.RoutingMode = existing.RoutingMode
	}
	if len(link.Path) == 0 {
		link.Path = existing.Path
	}
	if len(link.Waypoints) == 0 && len(existing.Waypoints) > 0 {
		link.Waypoints = existing.Waypoints
	}
	if link.Capacity == "" {
		link.Capacity = existing.Capacity
	}
	if link.Color == "" {
		link.Color = existing.Color
	}
	if link.DistanceKm <= 0 {
		link.DistanceKm = existing.DistanceKm
	}
	if link.Notes == "" {
		link.Notes = existing.Notes
	}
	if link.Status == "" {
		link.Status = existing.Status
	}
	if link.SourceInterface == "" && existing.SourceInterface != "" {
		link.SourceInterface = existing.SourceInterface
	}
	if link.TargetInterface == "" && existing.TargetInterface != "" {
		link.TargetInterface = existing.TargetInterface
	}
	if link.ZabbixProblem == "" && existing.ZabbixProblem != "" && link.Status == existing.Status {
		link.ZabbixProblem = existing.ZabbixProblem
	}
	if link.ZabbixLastAlert == nil && existing.ZabbixLastAlert != nil {
		link.ZabbixLastAlert = existing.ZabbixLastAlert
	}
	if link.TrafficMonitoredEnd == "" && existing.TrafficMonitoredEnd != "" {
		link.TrafficMonitoredEnd = existing.TrafficMonitoredEnd
	}
	if link.TrafficMonitoredIface == "" && existing.TrafficMonitoredIface != "" {
		link.TrafficMonitoredIface = existing.TrafficMonitoredIface
	}
	if link.TrafficRxBps == 0 && existing.TrafficRxBps > 0 {
		link.TrafficRxBps = existing.TrafficRxBps
	}
	if link.TrafficTxBps == 0 && existing.TrafficTxBps > 0 {
		link.TrafficTxBps = existing.TrafficTxBps
	}
	if link.TrafficUpdatedAt == nil && existing.TrafficUpdatedAt != nil {
		link.TrafficUpdatedAt = existing.TrafficUpdatedAt
	}
	link.CreatedAt = existing.CreatedAt
	link.UpdatedAt = time.Now()

	s.links[link.ID] = link
	return s.saveLocked()
}

// UpdateLinkZabbixStatus updates link status and problem description for specified link IDs.
func (s *LinkStore) UpdateLinkZabbixStatus(linkID string, status string, problem string) (*models.BackboneLink, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, ok := s.links[linkID]
	if !ok {
		return nil, ErrLinkNotFound
	}

	existing.Status = status
	existing.ZabbixProblem = problem
	now := time.Now()
	existing.ZabbixLastAlert = &now
	existing.UpdatedAt = now

	s.links[linkID] = existing
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return &existing, nil
}

// UpdateLinkTraffic updates RX/TX bandwidth metrics for a specific link.
func (s *LinkStore) UpdateLinkTraffic(linkID string, rxBps, txBps float64, monitoredIface string) (*models.BackboneLink, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	existing, ok := s.links[linkID]
	if !ok {
		return nil, ErrLinkNotFound
	}

	existing.TrafficRxBps = rxBps
	existing.TrafficTxBps = txBps
	if monitoredIface != "" {
		existing.TrafficMonitoredIface = monitoredIface
	}
	now := time.Now()
	existing.TrafficUpdatedAt = &now
	existing.UpdatedAt = now

	s.links[linkID] = existing
	if err := s.saveLocked(); err != nil {
		return nil, err
	}
	return &existing, nil
}

// Delete removes a link by ID.
func (s *LinkStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if _, ok := s.links[id]; !ok {
		return ErrLinkNotFound
	}

	delete(s.links, id)
	return s.saveLocked()
}
