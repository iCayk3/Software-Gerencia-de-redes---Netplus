package api

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"

	"network-software/internal/drivers"
	"network-software/internal/models"
	"network-software/internal/storage"
	"network-software/internal/zabbix"
)

// ZabbixController handles Zabbix API integration and incoming webhooks.
type ZabbixController struct {
	zabbixStore *storage.ZabbixStore
	linkStore   *storage.LinkStore
	deviceStore *storage.DeviceStore
	auditStore  storage.IAuditStore
}

func NewZabbixController(
	zabbixStore *storage.ZabbixStore,
	linkStore *storage.LinkStore,
	deviceStore *storage.DeviceStore,
	auditStore storage.IAuditStore,
) *ZabbixController {
	return &ZabbixController{
		zabbixStore: zabbixStore,
		linkStore:   linkStore,
		deviceStore: deviceStore,
		auditStore:  auditStore,
	}
}

// HandleWebhook receives real-time Problem / Recovery events from Zabbix Media Type Webhooks.
// POST /api/webhooks/zabbix?token=<webhook_secret>
func (c *ZabbixController) HandleWebhook(w http.ResponseWriter, r *http.Request) {
	cfg := c.zabbixStore.GetConfig()

	// 1. Verify webhook secret if configured
	if cfg.WebhookSecret != "" {
		token := r.URL.Query().Get("token")
		if token == "" {
			token = r.Header.Get("X-Zabbix-Token")
		}
		if token == "" {
			token = r.Header.Get("Authorization")
			token = strings.TrimPrefix(token, "Bearer ")
		}

		if token != cfg.WebhookSecret {
			log.Printf("[Zabbix Webhook] ⛔ Token inválido ou ausente: %s", token)
			WriteError(w, http.StatusUnauthorized, "Token de webhook inválido")
			return
		}
	}

	// 2. Decode incoming payload
	var payload models.ZabbixWebhookPayload
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		log.Printf("[Zabbix Webhook] ❌ Erro ao decodificar JSON: %v", err)
		WriteError(w, http.StatusBadRequest, "Payload JSON inválido: "+err.Error())
		return
	}

	log.Printf("[Zabbix Webhook] 🔔 Recebido evento Zabbix: host=%s (%s), item=%s, key=%s, trigger=%s, val=%s",
		payload.HostName, payload.HostIP, payload.ItemName, payload.ItemKey, payload.TriggerName, payload.EventValue)

	// Determine if this is a Problem (down) or Recovery (active)
	// Zabbix: {EVENT.VALUE} = "1" (Problem), "0" (Recovery/Resolved)
	isDown := payload.EventValue == "1" ||
		strings.EqualFold(payload.EventValue, "problem") ||
		strings.EqualFold(payload.EventValue, "down")

	// 3. Extract interface name from ItemKey, ItemName or TriggerName
	extractedIface := extractInterfaceFromWebhook(payload)

	// 4. Find matching device in deviceStore
	matchedDevices := c.findMatchingDevices(payload.HostIP, payload.HostName)

	var updatedLinks []models.BackboneLink
	allLinks := c.linkStore.GetAll()

	for _, link := range allLinks {
		matched := false

		// Check if link matches either endpoint device
		for _, dev := range matchedDevices {
			if link.SourceDeviceID == dev.ID {
				if extractedIface == "" || link.SourceInterface == "" || zabbix.MatchInterfaces(link.SourceInterface, extractedIface) {
					matched = true
				}
			}
			if link.TargetDeviceID == dev.ID {
				if extractedIface == "" || link.TargetInterface == "" || zabbix.MatchInterfaces(link.TargetInterface, extractedIface) {
					matched = true
				}
			}
		}

		// Also check direct match if link interface matches extracted interface name
		if !matched && extractedIface != "" {
			if zabbix.MatchInterfaces(link.SourceInterface, extractedIface) ||
				zabbix.MatchInterfaces(link.TargetInterface, extractedIface) {
				// Verify if device host/name partially matches
				for _, dev := range matchedDevices {
					if link.SourceDeviceID == dev.ID || link.TargetDeviceID == dev.ID {
						matched = true
						break
					}
				}
			}
		}

		if matched {
			newStatus := "active"
			probDesc := ""
			if isDown {
				newStatus = "down"
				probDesc = payload.TriggerName
				if probDesc == "" {
					probDesc = payload.ItemName
				}
				if probDesc == "" {
					probDesc = "Interface Link Down (Zabbix Alert)"
				}
			}

			updated, err := c.linkStore.UpdateLinkZabbixStatus(link.ID, newStatus, probDesc)
			if err == nil && updated != nil {
				updatedLinks = append(updatedLinks, *updated)
				log.Printf("[Zabbix Webhook] 🚦 Enlace '%s' (%s) atualizado para STATUS: %s (Alerta: %s)",
					updated.Name, updated.ID, newStatus, probDesc)

				if c.auditStore != nil {
					_ = c.auditStore.Record(&models.AuditLog{
						TenantID:        updated.TenantID,
						UserID:          "system-zabbix-webhook",
						UserName:        "Zabbix Monitoring Webhook",
						ClientIP:        r.RemoteAddr,
						Action:          models.ActionUpdateBackboneLink,
						CommandExecuted: fmt.Sprintf("Zabbix Webhook: Enlace %s -> %s (%s)", updated.Name, newStatus, probDesc),
						Status:          "SUCCESS",
					})
				}
			}
		}
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":       true,
		"event_value":   payload.EventValue,
		"is_down":       isDown,
		"interface":     extractedIface,
		"devices_found": len(matchedDevices),
		"updated_links": len(updatedLinks),
		"links":         updatedLinks,
	})
}

func extractInterfaceFromWebhook(payload models.ZabbixWebhookPayload) string {
	// 1. Try ItemKey: e.g. net.if.status[10GE0/1/1], ifOperStatus.12, net.if.in["GigabitEthernet0/0/1"]
	reKey := regexp.MustCompile(`\["?'?([^"'\],]+)`)
	if m := reKey.FindStringSubmatch(payload.ItemKey); len(m) > 1 {
		clean := cleanCandidate(m[1])
		if isValidIface(clean) {
			return clean
		}
	}

	// 2. Try ItemName: e.g. "Interface 10GE0/1/1: Operational status"
	reName := regexp.MustCompile(`(?i)(?:Interface|Porta|Port)\s+([A-Za-z0-9\/\-\.:]+)`)
	if m := reName.FindStringSubmatch(payload.ItemName); len(m) > 1 {
		clean := cleanCandidate(m[1])
		if isValidIface(clean) {
			return clean
		}
	}

	// 3. Try TriggerName: e.g. "Interface 10GE0/1/1: Link down"
	if m := reName.FindStringSubmatch(payload.TriggerName); len(m) > 1 {
		clean := cleanCandidate(m[1])
		if isValidIface(clean) {
			return clean
		}
	}

	// 4. Match common interface syntax anywhere in TriggerName or ItemName
	reStd := regexp.MustCompile(`(?i)\b((?:10GE|40GE|100GE|25GE|GE|GigabitEthernet|FastEthernet|Ethernet|Eth-Trunk|XGE|ether|sfp|sfpplus|xe-|ge-|et-)[0-9\/\-\.:]+)\b`)
	if m := reStd.FindStringSubmatch(payload.TriggerName); len(m) > 1 {
		return cleanCandidate(m[1])
	}
	if m := reStd.FindStringSubmatch(payload.ItemName); len(m) > 1 {
		return cleanCandidate(m[1])
	}
	if m := reStd.FindStringSubmatch(payload.ItemKey); len(m) > 1 {
		return cleanCandidate(m[1])
	}

	return ""
}

func cleanCandidate(s string) string {
	s = strings.TrimSpace(s)
	s = strings.Trim(s, "():;,[]'\"")
	if idx := strings.Index(s, "("); idx > 0 {
		s = strings.TrimSpace(s[:idx])
	}
	return s
}

func isValidIface(s string) bool {
	if len(s) < 2 {
		return false
	}
	if regexp.MustCompile(`^\d+$`).MatchString(s) {
		return false
	}
	return true
}

func (c *ZabbixController) findMatchingDevices(hostIP, hostName string) []models.Device {
	allDevs := c.deviceStore.GetAll()
	var matched []models.Device

	for _, d := range allDevs {
		if hostIP != "" && d.Host == hostIP {
			matched = append(matched, d)
			continue
		}
		if hostName != "" {
			if strings.EqualFold(d.Name, hostName) ||
				strings.EqualFold(d.Host, hostName) ||
				strings.Contains(strings.ToLower(d.Name), strings.ToLower(hostName)) ||
				strings.Contains(strings.ToLower(hostName), strings.ToLower(d.Name)) {
				matched = append(matched, d)
			}
		}
	}
	return matched
}

// GetConfig returns the safe Zabbix settings.
// GET /api/zabbix/config
func (c *ZabbixController) GetConfig(w http.ResponseWriter, r *http.Request) {
	safe := c.zabbixStore.GetSafeConfig()
	WriteJSON(w, http.StatusOK, safe)
}

// SaveConfig updates the Zabbix server settings.
// POST /api/zabbix/config
func (c *ZabbixController) SaveConfig(w http.ResponseWriter, r *http.Request) {
	var req models.ZabbixConfig
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Payload inválido: "+err.Error())
		return
	}

	if err := c.zabbixStore.SaveConfig(req); err != nil {
		WriteError(w, http.StatusInternalServerError, "Erro ao salvar configurações do Zabbix: "+err.Error())
		return
	}

	claims := GetAuthUser(r)
	if c.auditStore != nil && claims != nil {
		_ = c.auditStore.Record(&models.AuditLog{
			TenantID:        claims.TenantID,
			UserID:          claims.UserID,
			UserName:        claims.Name,
			UserEmail:       claims.Email,
			ClientIP:        r.RemoteAddr,
			Action:          models.ActionUpdateDevice,
			CommandExecuted: "Atualizou configurações de integração com Zabbix: " + req.URL,
			Status:          "SUCCESS",
		})
	}

	WriteJSON(w, http.StatusOK, c.zabbixStore.GetSafeConfig())
}

// TestConnection tests connectivity to the configured Zabbix server.
// POST /api/zabbix/test
func (c *ZabbixController) TestConnection(w http.ResponseWriter, r *http.Request) {
	var cfg models.ZabbixConfig
	// Check if body contains credentials for testing before saving
	if err := json.NewDecoder(r.Body).Decode(&cfg); err != nil || cfg.URL == "" {
		cfg = c.zabbixStore.GetConfig()
	} else {
		// Fill missing secrets from stored config if not supplied
		stored := c.zabbixStore.GetConfig()
		if cfg.APIToken == "" {
			cfg.APIToken = stored.APIToken
		}
		if cfg.Password == "" {
			cfg.Password = stored.Password
		}
	}

	if cfg.URL == "" {
		WriteError(w, http.StatusBadRequest, "URL do Zabbix não configurada")
		return
	}

	client, err := zabbix.NewClient(cfg)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "Configuração do Zabbix inválida: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 10*time.Second)
	defer cancel()

	result, err := client.TestConnection(ctx)
	if err != nil {
		WriteJSON(w, http.StatusOK, result)
		return
	}

	WriteJSON(w, http.StatusOK, result)
}

// SyncStatus queries Zabbix API for active problems on all registered backbone links.
// POST /api/zabbix/sync
func (c *ZabbixController) SyncStatus(w http.ResponseWriter, r *http.Request) {
	cfg := c.zabbixStore.GetConfig()
	if !cfg.Enabled || cfg.URL == "" {
		WriteError(w, http.StatusBadRequest, "Integração com Zabbix está desativada ou não configurada")
		return
	}

	client, err := zabbix.NewClient(cfg)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Erro ao instanciar cliente Zabbix: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 30*time.Second)
	defer cancel()

	claims := GetAuthUser(r)
	tenantID := ""
	if claims != nil && !claims.IsSuperAdmin {
		tenantID = claims.TenantID
	}

	links := c.linkStore.GetAllByTenant(tenantID)
	checked := 0
	downCount := 0
	var updatedLinks []models.BackboneLink

	for _, link := range links {
		// Only check links that have at least one interface assigned
		if link.SourceInterface == "" && link.TargetInterface == "" {
			continue
		}

		checked++
		isDown := false
		problemDesc := ""

		// Check Source Device Interface
		if link.SourceInterface != "" {
			if dev, err := c.deviceStore.GetByID(link.SourceDeviceID); err == nil && dev != nil {
				down, desc, _ := client.CheckHostInterfaceDown(ctx, dev.Host, dev.Name, link.SourceInterface)
				if down {
					isDown = true
					problemDesc = fmt.Sprintf("[%s %s] %s", dev.Name, link.SourceInterface, desc)
				}
			}
		}

		// Check Target Device Interface (if source didn't flag down)
		if !isDown && link.TargetInterface != "" {
			if dev, err := c.deviceStore.GetByID(link.TargetDeviceID); err == nil && dev != nil {
				down, desc, _ := client.CheckHostInterfaceDown(ctx, dev.Host, dev.Name, link.TargetInterface)
				if down {
					isDown = true
					problemDesc = fmt.Sprintf("[%s %s] %s", dev.Name, link.TargetInterface, desc)
				}
			}
		}

		// Determine new status
		newStatus := "active"
		if isDown {
			newStatus = "down"
			downCount++
		} else if link.Status == "planned" {
			newStatus = "planned" // Preserve planned status
		}

		if link.Status != newStatus || link.ZabbixProblem != problemDesc {
			updated, err := c.linkStore.UpdateLinkZabbixStatus(link.ID, newStatus, problemDesc)
			if err == nil && updated != nil {
				updatedLinks = append(updatedLinks, *updated)
			}
		}
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":       true,
		"checked_links": checked,
		"down_links":    downCount,
		"updated_links": len(updatedLinks),
		"links":         updatedLinks,
	})
}

// CollectLinkTraffic queries Zabbix (or router SSH) for live RX/TX bandwidth on a specific link.
// POST /api/backbone/links/{id}/traffic
func (c *ZabbixController) CollectLinkTraffic(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID do enlace é obrigatório")
		return
	}

	link, err := c.linkStore.GetByID(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Enlace não encontrado: "+err.Error())
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	rx, tx, iface, err := c.collectTrafficForLink(ctx, link)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "Falha na coleta de tráfego: "+err.Error())
		return
	}

	updated, err := c.linkStore.UpdateLinkTraffic(link.ID, rx, tx, iface)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Erro ao salvar métricas de tráfego: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":   true,
		"link_id":   link.ID,
		"rx_bps":    rx,
		"tx_bps":    tx,
		"interface": iface,
		"link":      updated,
	})
}

// CollectAllLinksTraffic collects real-time traffic for all backbone links in batch.
// POST /api/backbone/links/collect-traffic
func (c *ZabbixController) CollectAllLinksTraffic(w http.ResponseWriter, r *http.Request) {
	claims := GetAuthUser(r)
	tenantID := ""
	if claims != nil && !claims.IsSuperAdmin {
		tenantID = claims.TenantID
	}

	links := c.linkStore.GetAllByTenant(tenantID)
	ctx, cancel := context.WithTimeout(r.Context(), 45*time.Second)
	defer cancel()

	var updatedList []models.BackboneLink
	successCount := 0

	for _, link := range links {
		// Only collect for links that have at least one interface assigned
		if link.SourceInterface == "" && link.TargetInterface == "" && link.TrafficMonitoredIface == "" {
			continue
		}

		rx, tx, iface, err := c.collectTrafficForLink(ctx, &link)
		if err == nil {
			updated, err := c.linkStore.UpdateLinkTraffic(link.ID, rx, tx, iface)
			if err == nil && updated != nil {
				updatedList = append(updatedList, *updated)
				successCount++
			}
		}
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"success":       true,
		"total_links":   len(links),
		"updated_links": successCount,
		"links":         updatedList,
	})
}

func (c *ZabbixController) collectTrafficForLink(ctx context.Context, link *models.BackboneLink) (float64, float64, string, error) {
	// Determine target device and interface
	deviceID := link.SourceDeviceID
	iface := link.SourceInterface

	if link.TrafficMonitoredEnd == "target" && link.TargetInterface != "" {
		deviceID = link.TargetDeviceID
		iface = link.TargetInterface
	}
	if link.TrafficMonitoredIface != "" {
		iface = link.TrafficMonitoredIface
	}
	if iface == "" {
		if link.SourceInterface != "" {
			deviceID = link.SourceDeviceID
			iface = link.SourceInterface
		} else if link.TargetInterface != "" {
			deviceID = link.TargetDeviceID
			iface = link.TargetInterface
		}
	}
	if iface == "" || deviceID == "" {
		return 0, 0, "", fmt.Errorf("enlace '%s' não possui interface cadastrada para monitoramento", link.Name)
	}

	dev, err := c.deviceStore.GetByID(deviceID)
	if err != nil || dev == nil {
		return 0, 0, iface, fmt.Errorf("equipamento '%s' não encontrado", deviceID)
	}

	// 1. Try Zabbix API
	cfg := c.zabbixStore.GetConfig()
	if cfg.Enabled && cfg.URL != "" {
		if client, err := zabbix.NewClient(cfg); err == nil {
			if traf, err := client.GetInterfaceTraffic(ctx, dev.Host, dev.Name, iface); err == nil && traf != nil {
				return traf.RxBps, traf.TxBps, iface, nil
			}
		}
	}

	// 2. Fallback to router direct SSH driver
	if dev.Username != "" && (dev.Password != "" || dev.AuthType == "key") {
		if driver, err := drivers.NewDriver(dev); err == nil {
			rx, tx, err := queryRouterTrafficCLI(driver, dev.Vendor, iface)
			if err == nil {
				return rx, tx, iface, nil
			}
		}
	}

	return 0, 0, iface, fmt.Errorf("não foi possível obter tráfego da interface '%s' via Zabbix ou SSH", iface)
}

func queryRouterTrafficCLI(driver drivers.NetworkDriver, vendor models.VendorType, iface string) (float64, float64, error) {
	var cmd string
	switch vendor {
	case models.VendorHuawei:
		cmd = fmt.Sprintf("display interface %s", iface)
	case models.VendorMikrotikV6, models.VendorMikrotikV7:
		cmd = fmt.Sprintf("/interface monitor-traffic %s once", iface)
	case models.VendorDatacom:
		cmd = fmt.Sprintf("show interface %s", iface)
	default:
		cmd = fmt.Sprintf("display interface %s", iface)
	}

	out, err := driver.RunCommand(cmd)
	if err != nil {
		return 0, 0, err
	}

	return parseTrafficFromCLI(out, vendor)
}

func parseTrafficFromCLI(out string, vendor models.VendorType) (float64, float64, error) {
	reIn := regexp.MustCompile(`(?i)input rate\s+([0-9\.]+)\s*([kKmMgGtT]?)\s*bits/sec`)
	reOut := regexp.MustCompile(`(?i)output rate\s+([0-9\.]+)\s*([kKmMgGtT]?)\s*bits/sec`)

	var rx, tx float64
	if m := reIn.FindStringSubmatch(out); len(m) > 1 {
		val, _ := strconv.ParseFloat(m[1], 64)
		mult := parseUnitMultiplier(m[2])
		rx = val * mult
	}
	if m := reOut.FindStringSubmatch(out); len(m) > 1 {
		val, _ := strconv.ParseFloat(m[1], 64)
		mult := parseUnitMultiplier(m[2])
		tx = val * mult
	}

	if rx == 0 && tx == 0 {
		reMkRx := regexp.MustCompile(`(?i)rx-bits-per-second:\s*([0-9\.]+)\s*([kKmMgGtT]?)(?:bps|bits/s)?`)
		reMkTx := regexp.MustCompile(`(?i)tx-bits-per-second:\s*([0-9\.]+)\s*([kKmMgGtT]?)(?:bps|bits/s)?`)
		if m := reMkRx.FindStringSubmatch(out); len(m) > 1 {
			val, _ := strconv.ParseFloat(m[1], 64)
			rx = val * parseUnitMultiplier(m[2])
		}
		if m := reMkTx.FindStringSubmatch(out); len(m) > 1 {
			val, _ := strconv.ParseFloat(m[1], 64)
			tx = val * parseUnitMultiplier(m[2])
		}
	}

	return rx, tx, nil
}

func parseUnitMultiplier(unit string) float64 {
	switch strings.ToUpper(strings.TrimSpace(unit)) {
	case "K":
		return 1_000
	case "M":
		return 1_000_000
	case "G":
		return 1_000_000_000
	case "T":
		return 1_000_000_000_000
	default:
		return 1
	}
}

// GetDeviceInterfaces retrieves the list of network interfaces for a device,
// querying Zabbix API first, or fallback to direct router SSH if available.
// GET /api/devices/{id}/interfaces
func (c *ZabbixController) GetDeviceInterfaces(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID do equipamento é obrigatório")
		return
	}

	device, err := c.deviceStore.GetByID(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Equipamento não encontrado")
		return
	}

	effectiveVendor := drivers.ResolveVendor(device)
	if device.Vendor != effectiveVendor {
		device.Vendor = effectiveVendor
		_ = c.deviceStore.Update(*device)
	}

	ctx, cancel := context.WithTimeout(r.Context(), 15*time.Second)
	defer cancel()

	var interfaces []string
	source := "manual"

	// 1. Try querying Zabbix if configured
	cfg := c.zabbixStore.GetConfig()
	if cfg.Enabled && cfg.URL != "" {
		if client, err := zabbix.NewClient(cfg); err == nil {
			if ifaces, err := client.GetHostInterfaces(ctx, device.Host, device.Name); err == nil && len(ifaces) > 0 {
				interfaces = ifaces
				source = "zabbix"
			}
		}
	}

	// 2. If no interfaces from Zabbix, fallback to querying the router via SSH driver
	if len(interfaces) == 0 && device.Username != "" && (device.Password != "" || device.AuthType == "key") {
		if driver, err := drivers.NewDriver(device); err == nil {
			cmd := getInterfaceCommand(effectiveVendor)
			if out, err := driver.RunCommand(cmd); err == nil && len(out) > 0 {
				ifaces := parseInterfacesFromCLI(out, effectiveVendor)
				if len(ifaces) > 0 {
					interfaces = ifaces
					source = "router_ssh"
				}
			}
		}
	}

	// 3. Fallback to common vendor interface presets if device is offline or not yet connected
	if len(interfaces) == 0 {
		interfaces = getDefaultVendorInterfaces(effectiveVendor)
		source = "presets"
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"device_id":   device.ID,
		"device_name": device.Name,
		"host":        device.Host,
		"vendor":      effectiveVendor,
		"source":      source,
		"interfaces":  interfaces,
	})
}

func getInterfaceCommand(v models.VendorType) string {
	switch v {
	case models.VendorHuawei:
		return "display interface brief"
	case models.VendorDatacom:
		return "show running-config interface"
	case models.VendorMikrotikV6, models.VendorMikrotikV7:
		return "/interface print terse without-paging"
	default:
		return "display interface brief"
	}
}

func parseInterfacesFromCLI(output string, v models.VendorType) []string {
	seen := make(map[string]bool)
	var result []string

	lines := strings.Split(output, "\n")

	// MikroTik: terse print puts `name=ether1` or `name="sfp-sfpplus1"`
	reMkName := regexp.MustCompile(`(?i)\bname=(?:"([^"]+)"|([^\s]+))`)

	// Datacom: `interface gigabit-ethernet 1/1/1`
	reDcIface := regexp.MustCompile(`(?i)^\s*interface\s+([a-zA-Z0-9\-]+(?:\s+[0-9\/\-]+)?)`)

	// General / Huawei interface identifiers
	rePort := regexp.MustCompile(`(?i)\b((?:100GE|40GE|25GE|10GE|GE|XGigabitEthernet|GigabitEthernet|FastEthernet|Ethernet|Eth-Trunk|Vlanif|ten-gigabit-ethernet|gigabit-ethernet|XGE|ether|sfp|sfpplus|sfp-sfpplus|xe-|ge-|et-|lag-)[0-9\/\-\.:]+)\b`)

	for _, line := range lines {
		// 1. Check MikroTik syntax if applicable
		if v == models.VendorMikrotikV6 || v == models.VendorMikrotikV7 || strings.Contains(line, "name=") {
			if m := reMkName.FindStringSubmatch(line); len(m) > 1 {
				name := m[1]
				if name == "" {
					name = m[2]
				}
				clean := cleanCandidate(name)
				if isValidIface(clean) && !seen[clean] {
					seen[clean] = true
					result = append(result, clean)
					continue
				}
			}
		}

		// 2. Check Datacom DmOS syntax
		if v == models.VendorDatacom || strings.Contains(line, "interface gigabit-ethernet") || strings.Contains(line, "interface ten-gigabit-ethernet") {
			if m := reDcIface.FindStringSubmatch(line); len(m) > 1 {
				name := strings.TrimSpace(m[1])
				// Normalize "gigabit-ethernet 1/1/1" -> "gigabit-ethernet-1/1/1"
				name = strings.ReplaceAll(name, " ", "-")
				clean := cleanCandidate(name)
				if isValidIface(clean) && !seen[clean] {
					seen[clean] = true
					result = append(result, clean)
					continue
				}
			}
		}

		// 3. Fallback to standard interface identifiers
		matches := rePort.FindAllString(line, -1)
		for _, m := range matches {
			clean := cleanCandidate(m)
			if isValidIface(clean) && !seen[clean] {
				seen[clean] = true
				result = append(result, clean)
			}
		}
	}

	sort.Strings(result)
	return result
}

func getDefaultVendorInterfaces(v models.VendorType) []string {
	switch v {
	case models.VendorHuawei:
		return []string{
			"10GE0/1/1", "10GE0/1/2", "10GE0/1/3", "10GE0/1/4",
			"GigabitEthernet0/0/1", "GigabitEthernet0/0/2", "GigabitEthernet0/0/3",
			"Eth-Trunk1", "Eth-Trunk2",
		}
	case models.VendorDatacom:
		return []string{
			"gigabit-ethernet-1/1/1", "gigabit-ethernet-1/1/2", "gigabit-ethernet-1/1/3", "gigabit-ethernet-1/1/4",
			"gigabit-ethernet-1/1/5", "gigabit-ethernet-1/1/6", "gigabit-ethernet-1/1/7", "gigabit-ethernet-1/1/8",
			"ten-gigabit-ethernet-1/1/1", "ten-gigabit-ethernet-1/1/2", "ten-gigabit-ethernet-1/1/3", "ten-gigabit-ethernet-1/1/4",
			"lag-1", "lag-2",
		}
	case models.VendorMikrotikV6, models.VendorMikrotikV7:
		return []string{
			"ether1", "ether2", "ether3", "ether4", "ether5",
			"ether6", "ether7", "ether8", "ether9", "ether10",
			"sfp1", "sfp-sfpplus1", "sfp-sfpplus2",
			"bonding1",
		}
	default:
		return []string{
			"10GE0/1/1", "10GE0/1/2", "GigabitEthernet0/0/1", "ether1", "sfp-sfpplus1",
		}
	}
}

// GetWebhookScript returns the ready-to-use JavaScript code for Zabbix 5/6/7 Media Type Webhook.
// GET /api/zabbix/webhook-script
func (c *ZabbixController) GetWebhookScript(w http.ResponseWriter, r *http.Request) {
	cfg := c.zabbixStore.GetConfig()
	scheme := "http"
	if r.TLS != nil || r.Header.Get("X-Forwarded-Proto") == "https" {
		scheme = "https"
	}

	serverHost := r.Header.Get("X-Forwarded-Host")
	if serverHost == "" {
		serverHost = r.Host
	}
	if serverHost == "" {
		serverHost = "10.12.199.251:8088"
	}

	// If serverHost has no port or port 80/443, explicitly force :8088 because port 80 on host is used by another service (Fastify/rbxhub)
	if !strings.Contains(serverHost, ":") {
		serverHost = serverHost + ":8088"
	} else if strings.HasSuffix(serverHost, ":80") {
		serverHost = strings.TrimSuffix(serverHost, ":80") + ":8088"
	}

	webhookURL := fmt.Sprintf("%s://%s/api/webhooks/zabbix", scheme, serverHost)

	script := fmt.Sprintf(`// NetPulse Webhook Media Type Script (Zabbix 5.x, 6.x, 7.x)
// Copie e cole este script em: Administração -> Tipos de Mídia -> Criar Tipo de Mídia (Tipo: Webhook)

try {
    Zabbix.log(4, '[NetPulse Webhook] Payload bruto recebido: ' + value);
    var params = JSON.parse(value);
    var req = new HttpRequest();
    req.addHeader('Content-Type: application/json');

    var netpulseUrl = (params.NETPULSE_URL || '%s') + '?token=' + encodeURIComponent(params.NETPULSE_TOKEN || '%s');

    var payload = {
        event_value: String(params.EVENT_VALUE),       // 1 = Problem (Down), 0 = Recovery (OK)
        event_id: String(params.EVENT_ID || ''),
        event_title: String(params.EVENT_NAME || ''),
        host_name: String(params.HOST_NAME || ''),
        host_ip: String(params.HOST_IP || ''),
        item_name: String(params.ITEM_NAME || ''),
        item_key: String(params.ITEM_KEY || ''),
        trigger_name: String(params.TRIGGER_NAME || ''),
        trigger_severity: String(params.TRIGGER_SEVERITY || ''),
        message: String(params.ALERT_MESSAGE || '')
    };

    var resp = req.post(netpulseUrl, JSON.stringify(payload));
    Zabbix.log(4, '[NetPulse Webhook] Resposta: ' + resp);

    if (req.getStatus() !== 200) {
        throw 'NetPulse HTTP Error ' + req.getStatus() + ': ' + resp;
    }

    return resp;
} catch (error) {
    Zabbix.log(3, '[NetPulse Webhook] Falha ao enviar notificação: ' + error);
    throw error;
}
`, webhookURL, cfg.WebhookSecret)

	parameters := []map[string]string{
		{"name": "NETPULSE_URL", "value": webhookURL},
		{"name": "NETPULSE_TOKEN", "value": cfg.WebhookSecret},
		{"name": "EVENT_VALUE", "value": "{EVENT.VALUE}"},
		{"name": "EVENT_ID", "value": "{EVENT.ID}"},
		{"name": "EVENT_NAME", "value": "{EVENT.NAME}"},
		{"name": "HOST_NAME", "value": "{HOST.NAME}"},
		{"name": "HOST_IP", "value": "{HOST.IP}"},
		{"name": "ITEM_NAME", "value": "{ITEM.NAME}"},
		{"name": "ITEM_KEY", "value": "{ITEM.KEY}"},
		{"name": "TRIGGER_NAME", "value": "{TRIGGER.NAME}"},
		{"name": "TRIGGER_SEVERITY", "value": "{TRIGGER.SEVERITY}"},
		{"name": "ALERT_MESSAGE", "value": "{ALERT.MESSAGE}"},
	}

	WriteJSON(w, http.StatusOK, map[string]interface{}{
		"webhook_url":    webhookURL,
		"webhook_secret": cfg.WebhookSecret,
		"script":         script,
		"parameters":     parameters,
	})
}
