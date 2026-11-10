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

// ZabbixStore manages persistent storage of Zabbix server settings and credentials.
type ZabbixStore struct {
	mu       sync.RWMutex
	filePath string
	config   models.ZabbixConfig
}

// NewZabbixStore initializes the Zabbix configuration store.
func NewZabbixStore(dataDir string) (*ZabbixStore, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory: %w", err)
	}

	filePath := filepath.Join(dataDir, "zabbix_config.json")
	store := &ZabbixStore{
		filePath: filePath,
	}

	if err := store.load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("failed to load zabbix config: %w", err)
	}

	return store, nil
}

func (s *ZabbixStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		// Initialize default webhook secret if file doesn't exist
		s.config = models.ZabbixConfig{
			WebhookSecret: generateSecret(16),
			Enabled:       false,
			UpdatedAt:     time.Now(),
		}
		return nil
	}

	var cfg models.ZabbixConfig
	if err := json.Unmarshal(data, &cfg); err != nil {
		return err
	}

	if cfg.WebhookSecret == "" {
		cfg.WebhookSecret = generateSecret(16)
	}
	s.config = cfg
	return nil
}

func (s *ZabbixStore) saveLocked() error {
	data, err := json.MarshalIndent(s.config, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(s.filePath, data, 0644)
}

func generateSecret(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("sec%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

// GetConfig returns the full ZabbixConfig (internal use only).
func (s *ZabbixStore) GetConfig() models.ZabbixConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.config
}

// GetSafeConfig returns the ZabbixConfig with sensitive credentials masked.
func (s *ZabbixStore) GetSafeConfig() models.SafeZabbixConfig {
	s.mu.RLock()
	defer s.mu.RUnlock()

	return models.SafeZabbixConfig{
		URL:           s.config.URL,
		HasAPIToken:   s.config.APIToken != "",
		HasPassword:   s.config.Password != "",
		Username:      s.config.Username,
		WebhookSecret: s.config.WebhookSecret,
		Enabled:       s.config.Enabled,
		UpdatedAt:     s.config.UpdatedAt,
	}
}

// SaveConfig updates the Zabbix configuration.
func (s *ZabbixStore) SaveConfig(newCfg models.ZabbixConfig) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	// If token or password was omitted in update payload, preserve existing
	if newCfg.APIToken == "" && s.config.APIToken != "" {
		newCfg.APIToken = s.config.APIToken
	}
	if newCfg.Password == "" && s.config.Password != "" {
		newCfg.Password = s.config.Password
	}
	if newCfg.WebhookSecret == "" {
		if s.config.WebhookSecret != "" {
			newCfg.WebhookSecret = s.config.WebhookSecret
		} else {
			newCfg.WebhookSecret = generateSecret(16)
		}
	}
	newCfg.UpdatedAt = time.Now()

	s.config = newCfg
	return s.saveLocked()
}
