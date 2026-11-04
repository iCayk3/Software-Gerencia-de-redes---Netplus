package license

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Default features supported by NetPulse
var DefaultFeatures = []string{
	"bgp_traffic_engineering",
	"ospf_management",
	"bmp_churn_tracker",
	"rpki_validation",
	"syslog_anomaly_detection",
	"audit_trail",
	"ssh_cli_terminal",
}

type LicenseManager struct {
	mu             sync.RWMutex
	dataDir        string
	masterURL      string
	instanceID     string
	currentLicense LicenseInfo
	startTime      time.Time
	httpClient     *http.Client
	stopChan       chan struct{}
}

func NewManager(dataDir string, masterURL string) *LicenseManager {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Printf("[License] Falha ao criar diretório de dados para licença: %v", err)
	}

	lm := &LicenseManager{
		dataDir:    dataDir,
		masterURL:  strings.TrimRight(masterURL, "/"),
		startTime:  time.Now(),
		httpClient: &http.Client{Timeout: 10 * time.Second},
		stopChan:   make(chan struct{}),
	}

	lm.instanceID = lm.loadOrCreateInstanceID()
	lm.loadInitialLicense()

	return lm
}

// loadOrCreateInstanceID gets or generates persistent UUID for this machine
func (lm *LicenseManager) loadOrCreateInstanceID() string {
	idPath := filepath.Join(lm.dataDir, "instance_id")
	if data, err := os.ReadFile(idPath); err == nil && len(data) >= 16 {
		return strings.TrimSpace(string(data))
	}

	b := make([]byte, 16)
	_, _ = rand.Read(b)
	newID := fmt.Sprintf("np-inst-%s", hex.EncodeToString(b))
	_ = os.WriteFile(idPath, []byte(newID), 0644)
	return newID
}

// loadInitialLicense checks env, disk file, or initializes Default Trial
func (lm *LicenseManager) loadInitialLicense() {
	licensePath := filepath.Join(lm.dataDir, "license.json")

	// 0. Check if running in standalone / unrestricted mode (no license required)
	isStandalone := os.Getenv("DISABLE_LICENSE_CHECK") == "true" || os.Getenv("NETPULSE_STANDALONE_MODE") == "true"
	if isStandalone {
		lm.currentLicense = LicenseInfo{
			Key:             "NETPULSE-ENTERPRISE-UNLIMITED-VITALICIA",
			Tier:            TierEnterprise,
			ClientName:      "Instalação NetPulse On-Premise",
			MaxDevices:      0, // 0 = sem limites
			DeviceUsage:     0,
			IssuedAt:        time.Now().Add(-24 * time.Hour),
			ExpiresAt:       time.Now().Add(100 * 365 * 24 * time.Hour), // 100 anos / vitalícia
			Status:          StatusActive,
			Features:        DefaultFeatures,
			GracePeriodDays: 365,
			InstanceID:      lm.instanceID,
			MasterURL:       "",
			MasterConnected: false,
		}
		lm.calculateRemainingDays()
		_ = lm.saveToDisk()
		log.Printf("[License] 🚀 Modo Autônomo / Irrestrito ativo (Enterprise Vitalício, roteadores ilimitados).")
		return
	}

	// 1. Check if license.json exists
	if data, err := os.ReadFile(licensePath); err == nil {
		var info LicenseInfo
		if err := json.Unmarshal(data, &info); err == nil && info.Key != "" {
			lm.currentLicense = info
			lm.currentLicense.InstanceID = lm.instanceID
			lm.currentLicense.MasterURL = lm.masterURL
			lm.calculateRemainingDays()
			log.Printf("[License] 🔑 Licença carregada do disco: %s (Plano %s)", info.ClientName, info.Tier)
			return
		}
	}

	// 2. Check environment variable NETPULSE_LICENSE_KEY
	if envKey := strings.TrimSpace(os.Getenv("NETPULSE_LICENSE_KEY")); envKey != "" {
		if err := lm.applyKey(envKey); err == nil {
			log.Printf("[License] 🔑 Licença aplicada a partir da variável NETPULSE_LICENSE_KEY")
			return
		}
	}

	// 3. Fallback: Local Trial / Lab License
	lm.currentLicense = LicenseInfo{
		Key:             "NETPULSE-TRIAL-COMMUNITY-2026",
		Tier:            TierTrial,
		ClientName:      "Provedor Local (Ambiente de Testes / Lab)",
		MaxDevices:      5,
		DeviceUsage:     0,
		IssuedAt:        time.Now().Add(-24 * time.Hour),
		ExpiresAt:       time.Now().Add(90 * 24 * time.Hour), // 90 days local trial
		Status:          StatusActive,
		Features:        DefaultFeatures,
		GracePeriodDays: 14,
		InstanceID:      lm.instanceID,
		MasterURL:       lm.masterURL,
		MasterConnected: false,
	}
	lm.calculateRemainingDays()
	_ = lm.saveToDisk()
	log.Printf("[License] 🚀 Inicializado com licença de Avaliação / Lab (Até %d roteadores).", lm.currentLicense.MaxDevices)
}

// SetClientName updates the client name from the local database
func (lm *LicenseManager) SetClientName(name string) {
	if strings.TrimSpace(name) == "" {
		return
	}
	lm.mu.Lock()
	defer lm.mu.Unlock()
	lm.currentLicense.ClientName = strings.TrimSpace(name)
	_ = lm.saveToDisk()
}

func (lm *LicenseManager) calculateRemainingDays() {
	if lm.currentLicense.ExpiresAt.IsZero() || lm.currentLicense.MaxDevices == 0 {
		lm.currentLicense.Status = StatusActive
		diff := time.Until(lm.currentLicense.ExpiresAt)
		days := int(diff.Hours() / 24)
		if days < 0 {
			days = 36500
		}
		lm.currentLicense.DaysRemaining = days
		return
	}

	diff := time.Until(lm.currentLicense.ExpiresAt)
	days := int(diff.Hours() / 24)
	if days < 0 {
		days = 0
		if time.Since(lm.currentLicense.ExpiresAt) <= time.Duration(lm.currentLicense.GracePeriodDays)*24*time.Hour {
			lm.currentLicense.Status = StatusGracePeriod
		} else {
			lm.currentLicense.Status = StatusExpired
		}
	} else if lm.currentLicense.Status != StatusSuspended {
		lm.currentLicense.Status = StatusActive
	}
	lm.currentLicense.DaysRemaining = days
}

// Start initiates periodic background heartbeats to the central Master Server
func (lm *LicenseManager) Start(ctx context.Context, getDeviceCount func() int) {
	// First initial sync
	go func() {
		time.Sleep(3 * time.Second)
		count := 0
		if getDeviceCount != nil {
			count = getDeviceCount()
		}
		lm.syncWithMaster(count)
	}()

	ticker := time.NewTicker(30 * time.Minute)
	go func() {
		for {
			select {
			case <-ticker.C:
				count := 0
				if getDeviceCount != nil {
					count = getDeviceCount()
				}
				lm.syncWithMaster(count)
			case <-lm.stopChan:
				ticker.Stop()
				return
			case <-ctx.Done():
				ticker.Stop()
				return
			}
		}
	}()
}

// Stop shuts down the license worker
func (lm *LicenseManager) Stop() {
	close(lm.stopChan)
}

// syncWithMaster performs HTTPS heartbeat to the central Master Server
func (lm *LicenseManager) syncWithMaster(deviceCount int) {
	if lm.masterURL == "" {
		lm.mu.Lock()
		lm.currentLicense.DeviceUsage = deviceCount
		lm.calculateRemainingDays()
		lm.mu.Unlock()
		return
	}

	hostname, _ := os.Hostname()
	payload := HeartbeatPayload{
		InstanceID:    lm.instanceID,
		LicenseKey:    lm.currentLicense.Key,
		ClientName:    lm.currentLicense.ClientName,
		Version:       "1.0.0",
		DeviceCount:   deviceCount,
		Hostname:      hostname,
		UptimeSeconds: int64(time.Since(lm.startTime).Seconds()),
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return
	}

	url := fmt.Sprintf("%s/api/v1/heartbeat", lm.masterURL)
	req, err := http.NewRequest("POST", url, bytes.NewBuffer(bodyBytes))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Instance-ID", lm.instanceID)

	resp, err := lm.httpClient.Do(req)
	lm.mu.Lock()
	defer lm.mu.Unlock()

	lm.currentLicense.DeviceUsage = deviceCount

	if err != nil {
		lm.currentLicense.MasterConnected = false
		log.Printf("[License] ⚠️ Servidor Master inacessível (%v). Operando em modo tolerante offline.", err)
		lm.calculateRemainingDays()
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusOK {
		var hbResp HeartbeatResponse
		if err := json.NewDecoder(resp.Body).Decode(&hbResp); err == nil {
			lm.currentLicense.MasterConnected = true
			lm.currentLicense.LastHeartbeat = time.Now()
			lm.currentLicense.Status = hbResp.Status
			if hbResp.Tier != "" {
				lm.currentLicense.Tier = hbResp.Tier
			}
			if hbResp.ClientName != "" {
				lm.currentLicense.ClientName = hbResp.ClientName
			}
			if !hbResp.ExpiresAt.IsZero() {
				lm.currentLicense.ExpiresAt = hbResp.ExpiresAt
			}
			if hbResp.MaxDevices > 0 {
				lm.currentLicense.MaxDevices = hbResp.MaxDevices
			}
			if len(hbResp.Features) > 0 {
				lm.currentLicense.Features = hbResp.Features
			}
			lm.calculateRemainingDays()
			_ = lm.saveToDisk()
			log.Printf("[License] ✅ Sincronizado com Master Server com sucesso. Status: %s", lm.currentLicense.Status)
			return
		}
	} else if resp.StatusCode == http.StatusForbidden || resp.StatusCode == http.StatusPaymentRequired {
		lm.currentLicense.Status = StatusSuspended
		lm.currentLicense.MasterConnected = true
		_ = lm.saveToDisk()
		log.Printf("[License] ⛔ Licença suspensa pelo Servidor Master.")
	}
}

// GetStatus returns the current snapshot of license info
func (lm *LicenseManager) GetStatus(currentDeviceUsage int) LicenseInfo {
	lm.mu.Lock()
	defer lm.mu.Unlock()

	lm.currentLicense.DeviceUsage = currentDeviceUsage
	lm.currentLicense.InstanceID = lm.instanceID
	lm.currentLicense.MasterURL = lm.masterURL
	lm.calculateRemainingDays()

	return lm.currentLicense
}

// CanAddDevice checks if the plan allows adding another router
func (lm *LicenseManager) CanAddDevice(currentDeviceCount int) error {
	lm.mu.RLock()
	defer lm.mu.RUnlock()

	// If license check is explicitly bypassed or unlimited enterprise mode
	if os.Getenv("DISABLE_LICENSE_CHECK") == "true" || os.Getenv("NETPULSE_STANDALONE_MODE") == "true" || lm.currentLicense.MaxDevices == 0 {
		return nil
	}

	if lm.currentLicense.Status == StatusSuspended {
		return fmt.Errorf("a licença desta instalação está suspensa. Entre em contato com o suporte")
	}

	if lm.currentLicense.Status == StatusExpired {
		return fmt.Errorf("a licença desta instalação está expirada. Renove sua chave para adicionar equipamentos")
	}

	if lm.currentLicense.MaxDevices > 0 && currentDeviceCount >= lm.currentLicense.MaxDevices {
		return fmt.Errorf("limite de equipamentos do plano %s atingido (%d/%d). Faça upgrade da licença para monitorar mais roteadores",
			strings.ToUpper(string(lm.currentLicense.Tier)),
			currentDeviceCount,
			lm.currentLicense.MaxDevices,
		)
	}

	return nil
}

// Activate applies a new license key
func (lm *LicenseManager) Activate(key string) (LicenseInfo, error) {
	key = strings.TrimSpace(key)
	if key == "" {
		return LicenseInfo{}, fmt.Errorf("chave de licença não pode estar vazia")
	}

	lm.mu.Lock()
	defer lm.mu.Unlock()

	if err := lm.applyKey(key); err != nil {
		return LicenseInfo{}, err
	}

	_ = lm.saveToDisk()
	log.Printf("[License] 🎉 Nova licença ativada com sucesso! Cliente: %s, Plano: %s", lm.currentLicense.ClientName, lm.currentLicense.Tier)
	return lm.currentLicense, nil
}

// applyKey parses key patterns (simple token, custom format or triggers master check)
func (lm *LicenseManager) applyKey(key string) error {
	upper := strings.ToUpper(key)

	tier := TierStarter
	maxDevs := 5
	validDays := 365
	clientName := "Provedor Licenciado NetPulse"

	if strings.Contains(upper, "ENTERPRISE") || strings.Contains(upper, "UNLIMITED") || strings.Contains(upper, "LIVRE") || strings.Contains(upper, "STANDALONE") || strings.Contains(upper, "VITALICIA") {
		tier = TierEnterprise
		maxDevs = 0 // unlimited
		validDays = 36500
		clientName = "Provedor Enterprise (Ilimitado)"
	} else if strings.Contains(upper, "PRO") {
		tier = TierPro
		maxDevs = 20
		clientName = "Provedor Pro ISP"
	} else if strings.Contains(upper, "TRIAL") {
		tier = TierTrial
		maxDevs = 3
		validDays = 30
		clientName = "Provedor em Período de Testes"
	}

	lm.currentLicense = LicenseInfo{
		Key:             key,
		Tier:            tier,
		ClientName:      clientName,
		MaxDevices:      maxDevs,
		IssuedAt:        time.Now(),
		ExpiresAt:       time.Now().Add(time.Duration(validDays) * 24 * time.Hour),
		Status:          StatusActive,
		Features:        DefaultFeatures,
		GracePeriodDays: 14,
		InstanceID:      lm.instanceID,
		MasterURL:       lm.masterURL,
		MasterConnected: false,
	}

	lm.calculateRemainingDays()
	return nil
}

func (lm *LicenseManager) saveToDisk() error {
	data, err := json.MarshalIndent(lm.currentLicense, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(lm.dataDir, "license.json"), data, 0644)
}

// ReadLicenseFile helper to read raw bytes
func (lm *LicenseManager) ReadLicenseFile() ([]byte, error) {
	f, err := os.Open(filepath.Join(lm.dataDir, "license.json"))
	if err != nil {
		return nil, err
	}
	defer f.Close()
	return io.ReadAll(f)
}
