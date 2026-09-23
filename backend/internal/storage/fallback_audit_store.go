package storage

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"os"
	"sync"
	"time"

	"network-software/internal/models"
)

// MemoryAuditStore is an in-memory/file-based fallback audit store.
type MemoryAuditStore struct {
	mu       sync.RWMutex
	filePath string
	logs     []models.AuditLog
}

func NewMemoryAuditStore(filePath string) *MemoryAuditStore {
	store := &MemoryAuditStore{
		filePath: filePath,
		logs:     []models.AuditLog{},
	}
	store.load()
	return store
}

func (s *MemoryAuditStore) load() {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err == nil {
		_ = json.Unmarshal(data, &s.logs)
	}
}

func (s *MemoryAuditStore) Record(entry *models.AuditLog) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if entry.ID == "" {
		b := make([]byte, 16)
		rand.Read(b)
		entry.ID = "aud-" + hex.EncodeToString(b)
	}
	if entry.Timestamp.IsZero() {
		entry.Timestamp = time.Now()
	}
	if entry.TenantID == "" {
		entry.TenantID = "default-tenant"
	}

	// Prepend to list for latest first
	s.logs = append([]models.AuditLog{*entry}, s.logs...)

	// Limit in-memory history to last 500 records
	if len(s.logs) > 500 {
		s.logs = s.logs[:500]
	}

	data, _ := json.MarshalIndent(s.logs, "", "  ")
	_ = os.WriteFile(s.filePath, data, 0644)
	return nil
}

func (s *MemoryAuditStore) Query(filter models.AuditFilter) ([]models.AuditLog, int, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var filtered []models.AuditLog
	for _, l := range s.logs {
		if filter.DeviceID != "" && l.TargetDeviceID != filter.DeviceID {
			continue
		}
		if filter.UserID != "" && l.UserID != filter.UserID {
			continue
		}
		if filter.Action != "" && l.Action != filter.Action {
			continue
		}
		filtered = append(filtered, l)
	}

	total := len(filtered)
	limit := filter.Limit
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	offset := filter.Offset
	if offset < 0 {
		offset = 0
	}

	if offset >= total {
		return []models.AuditLog{}, total, nil
	}
	end := offset + limit
	if end > total {
		end = total
	}

	return filtered[offset:end], total, nil
}
