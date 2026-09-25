package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"network-software/internal/models"
)

// PeerMetadataStore handles persistent storage of custom peer/session descriptions in a local JSON file.
type PeerMetadataStore struct {
	mu       sync.RWMutex
	filePath string
	metadata map[string]models.PeerMetadata
}

// NewPeerMetadataStore initializes or loads the Peer metadata store.
func NewPeerMetadataStore(dataDir string) (*PeerMetadataStore, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	filePath := filepath.Join(dataDir, "peer_metadata.json")
	store := &PeerMetadataStore{
		filePath: filePath,
		metadata: make(map[string]models.PeerMetadata),
	}

	if err := store.load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("failed to load peer_metadata: %w", err)
	}

	return store, nil
}

func (s *PeerMetadataStore) makeKey(deviceID, peerIP string) string {
	dID := strings.TrimSpace(deviceID)
	pIP := strings.TrimSpace(peerIP)
	if dID != "" {
		return fmt.Sprintf("%s:%s", dID, pIP)
	}
	return pIP
}

func (s *PeerMetadataStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}

	var list []models.PeerMetadata
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}

	s.metadata = make(map[string]models.PeerMetadata)
	for _, item := range list {
		key := item.Key
		if key == "" {
			key = s.makeKey(item.DeviceID, item.PeerIP)
		}
		item.Key = key
		s.metadata[key] = item
		// Also index by peerIP as fallback
		if item.PeerIP != "" {
			if _, exists := s.metadata[item.PeerIP]; !exists {
				s.metadata[item.PeerIP] = item
			}
		}
	}

	return nil
}

func (s *PeerMetadataStore) save() error {
	list := make([]models.PeerMetadata, 0, len(s.metadata))
	visited := make(map[string]bool)
	for _, m := range s.metadata {
		if visited[m.Key] {
			continue
		}
		visited[m.Key] = true
		list = append(list, m)
	}

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.filePath, data, 0644)
}

// GetAll returns a copy of all peer metadata.
func (s *PeerMetadataStore) GetAll() map[string]models.PeerMetadata {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]models.PeerMetadata, len(s.metadata))
	for k, v := range s.metadata {
		result[k] = v
	}
	return result
}

// Get finds peer metadata by device ID and peer IP, with fallback to peer IP alone.
func (s *PeerMetadataStore) Get(deviceID, peerIP string) (models.PeerMetadata, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if deviceID != "" {
		if meta, ok := s.metadata[s.makeKey(deviceID, peerIP)]; ok {
			return meta, true
		}
	}
	meta, ok := s.metadata[strings.TrimSpace(peerIP)]
	return meta, ok
}

// Set saves or updates peer metadata.
func (s *PeerMetadataStore) Set(meta models.PeerMetadata) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	peerIP := strings.TrimSpace(meta.PeerIP)
	if peerIP == "" {
		return errors.New("PeerIP cannot be empty")
	}

	key := s.makeKey(meta.DeviceID, peerIP)
	meta.Key = key
	meta.PeerIP = peerIP
	meta.UpdatedAt = time.Now()
	s.metadata[key] = meta

	// Also index by peerIP alone if DeviceID is empty or for fallback
	s.metadata[peerIP] = meta

	return s.save()
}
