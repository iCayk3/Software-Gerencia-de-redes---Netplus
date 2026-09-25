package storage

import (
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"sync"
	"time"

	"network-software/internal/models"
)

// ProfileStore manages traffic engineering profiles in a persistent JSON file.
type ProfileStore struct {
	mu       sync.RWMutex
	filePath string
	profiles map[string]models.TrafficProfile
}

// NewProfileStore creates or loads a ProfileStore from dataDir.
func NewProfileStore(dataDir string) (*ProfileStore, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("failed to create data directory for profiles: %w", err)
	}

	filePath := filepath.Join(dataDir, "traffic_profiles.json")
	store := &ProfileStore{
		filePath: filePath,
		profiles: make(map[string]models.TrafficProfile),
	}

	if err := store.load(); err != nil && !errors.Is(err, os.ErrNotExist) {
		return nil, fmt.Errorf("failed to load traffic profiles: %w", err)
	}

	// If no profiles exist, seed the standard ISP operational profiles
	if len(store.profiles) == 0 {
		store.seedDefaults()
		_ = store.saveLocked()
	}

	return store, nil
}

func (s *ProfileStore) load() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.filePath)
	if err != nil {
		return err
	}

	var list []models.TrafficProfile
	if err := json.Unmarshal(data, &list); err != nil {
		return err
	}

	s.profiles = make(map[string]models.TrafficProfile)
	for _, p := range list {
		s.profiles[p.ID] = p
	}

	return nil
}

func (s *ProfileStore) saveLocked() error {
	list := make([]models.TrafficProfile, 0, len(s.profiles))
	for _, p := range s.profiles {
		list = append(list, p)
	}

	data, err := json.MarshalIndent(list, "", "  ")
	if err != nil {
		return err
	}

	return os.WriteFile(s.filePath, data, 0644)
}

// GetAll returns all profiles sorted with active/default first.
func (s *ProfileStore) GetAll() []models.TrafficProfile {
	s.mu.RLock()
	defer s.mu.RUnlock()

	list := make([]models.TrafficProfile, 0, len(s.profiles))
	for _, p := range s.profiles {
		list = append(list, p)
	}
	return list
}

// GetByID returns a profile by its ID.
func (s *ProfileStore) GetByID(id string) (*models.TrafficProfile, error) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	p, exists := s.profiles[id]
	if !exists {
		return nil, fmt.Errorf("profile with ID '%s' not found", id)
	}
	return &p, nil
}

// Save creates or updates a profile.
func (s *ProfileStore) Save(p *models.TrafficProfile) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if p.ID == "" {
		p.ID = fmt.Sprintf("prof-%d", time.Now().UnixNano())
	}
	now := time.Now()
	if p.CreatedAt.IsZero() {
		p.CreatedAt = now
	}
	p.UpdatedAt = now

	// If this profile is marked active, deactivate others
	if p.IsActive {
		for id, existing := range s.profiles {
			if id != p.ID && existing.IsActive {
				existing.IsActive = false
				s.profiles[id] = existing
			}
		}
	}

	s.profiles[p.ID] = *p
	return s.saveLocked()
}

// Delete removes a profile by ID. Default profiles cannot be deleted.
func (s *ProfileStore) Delete(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	p, exists := s.profiles[id]
	if !exists {
		return fmt.Errorf("profile '%s' not found", id)
	}
	if p.IsDefault {
		return errors.New("não é permitido excluir um perfil de referência padrão de fábrica")
	}

	delete(s.profiles, id)
	return s.saveLocked()
}

// SetActive marks a specific profile as the active one in the network.
func (s *ProfileStore) SetActive(id string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	target, exists := s.profiles[id]
	if !exists {
		return fmt.Errorf("profile '%s' not found", id)
	}

	for k, p := range s.profiles {
		if k == id {
			p.IsActive = true
		} else {
			p.IsActive = false
		}
		s.profiles[k] = p
	}

	target.IsActive = true
	target.UpdatedAt = time.Now()
	s.profiles[id] = target

	return s.saveLocked()
}

// seedDefaults initializes standard real-world ISP profiles for the user's topology.
func (s *ProfileStore) seedDefaults() {
	now := time.Now()

	// 1. Operação Padrão (Balanceado Nominal)
	p1 := models.TrafficProfile{
		ID:          "prof-padrao",
		Name:        "Operação Padrão (Nominal)",
		Description: "Trânsito principal via SEA Telecom (LocalPref 200, 0P), PTTs prioritários (LocalPref 700) e Wiki Telecom como contingência (LocalPref 150, 3P no /23).",
		Tag:         models.ProfileTagNormal,
		Color:       "emerald",
		IsActive:    true,
		IsDefault:   true,
		CreatedAt:   now,
		UpdatedAt:   now,
		Prepends: []models.ProfilePrependRule{
			{DeviceID: "all", RemoteAS: "266445", GroupName: "SEA Telecom", Prefix: "", PrependCount: 0, Block: false},
			{DeviceID: "all", RemoteAS: "20121", GroupName: "PTT São Paulo", Prefix: "45.166.28.0/22", PrependCount: 3, Block: false},
			{DeviceID: "all", RemoteAS: "20121", GroupName: "PTT São Paulo", Prefix: "45.166.28.0/24", PrependCount: 1, Block: false},
			{DeviceID: "all", RemoteAS: "20121", GroupName: "PTT São Paulo", Prefix: "45.166.29.0/24", PrependCount: 1, Block: false},
			{DeviceID: "all", RemoteAS: "20121", GroupName: "PTT São Paulo", Prefix: "45.166.30.0/24", PrependCount: 1, Block: false},
			{DeviceID: "all", RemoteAS: "20121", GroupName: "PTT São Paulo", Prefix: "45.166.31.0/24", PrependCount: 1, Block: false},
			{DeviceID: "all", RemoteAS: "26162", GroupName: "PTT Belém", Prefix: "", PrependCount: 0, Block: false},
			{DeviceID: "all", RemoteAS: "26162", GroupName: "PTT Fortaleza", Prefix: "", PrependCount: 0, Block: false},
			{DeviceID: "all", RemoteAS: "26162", GroupName: "PTT Brasília", Prefix: "", PrependCount: 0, Block: false},
			{DeviceID: "all", RemoteAS: "262503", GroupName: "Wiki Telecom", Prefix: "45.166.28.0/23", PrependCount: 3, Block: false},
			{DeviceID: "all", RemoteAS: "262503", GroupName: "Wiki Telecom", Prefix: "45.166.30.0/23", PrependCount: 3, Block: false},
			{DeviceID: "all", RemoteAS: "262503", GroupName: "Wiki Telecom", Prefix: "", PrependCount: 0, Block: false},
		},
		LocalPrefs: []models.ProfileLocalPrefRule{
			{RemoteAS: "266445", PeerIP: "170.82.183.217", PeerName: "SEA Telecom", LocalPref: 200},
			{RemoteAS: "262503", PeerIP: "45.181.228.24", PeerName: "Wiki Telecom", LocalPref: 150},
			{RemoteAS: "262503", PeerIP: "10.200.1.162", PeerName: "Wiki Telecom", LocalPref: 150},
			{RemoteAS: "26162", PeerIP: "45.184.145.253", PeerName: "PTT BSB", LocalPref: 700},
			{RemoteAS: "26162", PeerIP: "45.68.79.253", PeerName: "PTT Belém", LocalPref: 700},
			{RemoteAS: "20121", PeerIP: "187.16.216.252", PeerName: "PTT SP", LocalPref: 700},
			{RemoteAS: "26162", PeerIP: "187.16.195.253", PeerName: "PTT Fortaleza", LocalPref: 700},
		},
		Routes: []models.ProfileRouteRule{
			{Destination: "0.0.0.0/0", NextHop: "45.181.228.24", Preference: 60, Description: "TE-UPLOAD-AS262503-WIKI"},
		},
	}
	s.profiles[p1.ID] = p1

	// 2. Contingência - SEA Telecom Indisponível (Drenar SEA, Elevar Wiki)
	p2 := models.TrafficProfile{
		ID:          "prof-contingencia-sea",
		Name:        "Contingência: SEA Telecom Indisponível",
		Description: "Drena o tráfego da SEA Telecom (Prepend 3P, LocalPref 50) e eleva a Wiki Telecom como trânsito principal (LocalPref 350, 0P no download).",
		Tag:         models.ProfileTagContingency,
		Color:       "amber",
		IsActive:    false,
		IsDefault:   true,
		CreatedAt:   now,
		UpdatedAt:   now,
		Prepends: []models.ProfilePrependRule{
			{DeviceID: "all", RemoteAS: "266445", GroupName: "SEA Telecom", Prefix: "", PrependCount: 3, Block: false},
			{DeviceID: "all", RemoteAS: "262503", GroupName: "Wiki Telecom", Prefix: "", PrependCount: 0, Block: false},
			{DeviceID: "all", RemoteAS: "20121", GroupName: "PTT São Paulo", Prefix: "", PrependCount: 1, Block: false},
			{DeviceID: "all", RemoteAS: "26162", GroupName: "PTT Belém", Prefix: "", PrependCount: 0, Block: false},
			{DeviceID: "all", RemoteAS: "26162", GroupName: "PTT Fortaleza", Prefix: "", PrependCount: 0, Block: false},
		},
		LocalPrefs: []models.ProfileLocalPrefRule{
			{RemoteAS: "266445", PeerIP: "170.82.183.217", PeerName: "SEA Telecom", LocalPref: 50},
			{RemoteAS: "262503", PeerIP: "45.181.228.24", PeerName: "Wiki Telecom", LocalPref: 350},
			{RemoteAS: "262503", PeerIP: "10.200.1.162", PeerName: "Wiki Telecom", LocalPref: 350},
			{RemoteAS: "26162", PeerIP: "45.68.79.253", PeerName: "PTT Belém", LocalPref: 700},
			{RemoteAS: "20121", PeerIP: "187.16.216.252", PeerName: "PTT SP", LocalPref: 700},
			{RemoteAS: "26162", PeerIP: "187.16.195.253", PeerName: "PTT Fortaleza", LocalPref: 700},
		},
		Routes: []models.ProfileRouteRule{
			{Destination: "0.0.0.0/0", NextHop: "45.181.228.24", Preference: 50, Description: "TE-UPLOAD-CONTINGENCIA-WIKI"},
		},
	}
	s.profiles[p2.ID] = p2

	// 3. Manutenção / Rompimento Saída SP (Drenar PTT SP)
	p3 := models.TrafficProfile{
		ID:          "prof-manutencao-ptt-sp",
		Name:        "Manutenção: Drenar PTT São Paulo",
		Description: "Drena o tráfego do PTT SP aplicando 3P em todos os blocos e reduzindo LocalPref para 100. Prioriza PTT Belém e Fortaleza (LocalPref 800) e trânsito SEA.",
		Tag:         models.ProfileTagMaintenance,
		Color:       "rose",
		IsActive:    false,
		IsDefault:   true,
		CreatedAt:   now,
		UpdatedAt:   now,
		Prepends: []models.ProfilePrependRule{
			{DeviceID: "all", RemoteAS: "20121", GroupName: "PTT São Paulo", Prefix: "", PrependCount: 3, Block: false},
			{DeviceID: "all", RemoteAS: "26162", GroupName: "PTT Belém", Prefix: "", PrependCount: 0, Block: false},
			{DeviceID: "all", RemoteAS: "26162", GroupName: "PTT Fortaleza", Prefix: "", PrependCount: 0, Block: false},
			{DeviceID: "all", RemoteAS: "266445", GroupName: "SEA Telecom", Prefix: "", PrependCount: 0, Block: false},
			{DeviceID: "all", RemoteAS: "262503", GroupName: "Wiki Telecom", Prefix: "", PrependCount: 2, Block: false},
		},
		LocalPrefs: []models.ProfileLocalPrefRule{
			{RemoteAS: "20121", PeerIP: "187.16.216.252", PeerName: "PTT SP", LocalPref: 100},
			{RemoteAS: "26162", PeerIP: "45.68.79.253", PeerName: "PTT Belém", LocalPref: 800},
			{RemoteAS: "26162", PeerIP: "187.16.195.253", PeerName: "PTT Fortaleza", LocalPref: 800},
			{RemoteAS: "266445", PeerIP: "170.82.183.217", PeerName: "SEA Telecom", LocalPref: 200},
			{RemoteAS: "262503", PeerIP: "45.181.228.24", PeerName: "Wiki Telecom", LocalPref: 150},
		},
		Routes: []models.ProfileRouteRule{},
	}
	s.profiles[p3.ID] = p3

	// 4. Equalização 50/50 Dual-Transit (Pico / Evento Especial)
	p4 := models.TrafficProfile{
		ID:          "prof-equalizado-ecmp",
		Name:        "Balanceamento 50/50: SEA + Wiki",
		Description: "Equaliza Local-Preference em 200 para SEA Telecom e Wiki Telecom, e remove prepends (0P) em ambos para dividir o volume de entrada e saída por igual.",
		Tag:         models.ProfileTagPeak,
		Color:       "cyan",
		IsActive:    false,
		IsDefault:   true,
		CreatedAt:   now,
		UpdatedAt:   now,
		Prepends: []models.ProfilePrependRule{
			{DeviceID: "all", RemoteAS: "266445", GroupName: "SEA Telecom", Prefix: "", PrependCount: 0, Block: false},
			{DeviceID: "all", RemoteAS: "262503", GroupName: "Wiki Telecom", Prefix: "", PrependCount: 0, Block: false},
			{DeviceID: "all", RemoteAS: "20121", GroupName: "PTT São Paulo", Prefix: "", PrependCount: 0, Block: false},
			{DeviceID: "all", RemoteAS: "26162", GroupName: "PTT Belém", Prefix: "", PrependCount: 0, Block: false},
			{DeviceID: "all", RemoteAS: "26162", GroupName: "PTT Fortaleza", Prefix: "", PrependCount: 0, Block: false},
		},
		LocalPrefs: []models.ProfileLocalPrefRule{
			{RemoteAS: "266445", PeerIP: "170.82.183.217", PeerName: "SEA Telecom", LocalPref: 200},
			{RemoteAS: "262503", PeerIP: "45.181.228.24", PeerName: "Wiki Telecom", LocalPref: 200},
			{RemoteAS: "26162", PeerIP: "45.68.79.253", PeerName: "PTT Belém", LocalPref: 700},
			{RemoteAS: "20121", PeerIP: "187.16.216.252", PeerName: "PTT SP", LocalPref: 700},
			{RemoteAS: "26162", PeerIP: "187.16.195.253", PeerName: "PTT Fortaleza", LocalPref: 700},
		},
		Routes: []models.ProfileRouteRule{},
	}
	s.profiles[p4.ID] = p4
}
