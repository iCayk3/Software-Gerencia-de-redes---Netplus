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

// ASMetadataStore handles persistent storage of AS metadata in a local JSON file.
type ASMetadataStore struct {
	mu       sync.RWMutex
	filePath string
	metadata map[string]models.ASMetadata
}

// NewASMetadataStore initializes or loads the AS metadata store.
func NewASMetadataStore(dataDir string) (*ASMetadataStore, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	filePath := filepath.Join(dataDir, "as_metadata.json")
	store := &ASMetadataStore{
		filePath: filePath,
		metadata: make(map[string]models.ASMetadata),
	}

	if err := store.load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("failed to load as_metadata: %w", err)
	}

	return store, nil
}

func (s *ASMetadataStore) normalizeASN(asn string) string {
	asn = strings.TrimSpace(asn)
	asn = strings.TrimPrefix(strings.ToUpper(asn), "AS")
	return asn
}

func (s *ASMetadataStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}

	var list []models.ASMetadata
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}

	s.metadata = make(map[string]models.ASMetadata)
	for _, item := range list {
		norm := s.normalizeASN(item.ASN)
		item.ASN = norm
		s.metadata[norm] = item
	}

	return nil
}

func (s *ASMetadataStore) save() error {
	list := make([]models.ASMetadata, 0, len(s.metadata))
	for _, m := range s.metadata {
		list = append(list, m)
	}

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.filePath, data, 0644)
}

// GetAll returns a copy of all AS metadata.
func (s *ASMetadataStore) GetAll() map[string]models.ASMetadata {
	s.mu.RLock()
	defer s.mu.RUnlock()

	result := make(map[string]models.ASMetadata, len(s.metadata))
	for k, v := range s.metadata {
		result[k] = v
	}
	return result
}

// GetByASN finds AS metadata by ASN (supports "266445" or "AS266445").
func (s *ASMetadataStore) GetByASN(asn string) (models.ASMetadata, bool) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	meta, ok := s.metadata[s.normalizeASN(asn)]
	return meta, ok
}

// Set saves or updates AS metadata.
func (s *ASMetadataStore) Set(meta models.ASMetadata) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	norm := s.normalizeASN(meta.ASN)
	if norm == "" {
		return errors.New("ASN cannot be empty")
	}

	meta.ASN = norm
	meta.UpdatedAt = time.Now()
	s.metadata[norm] = meta

	return s.save()
}

// Delete removes AS metadata.
func (s *ASMetadataStore) Delete(asn string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	delete(s.metadata, s.normalizeASN(asn))
	return s.save()
}
