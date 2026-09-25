package drivers

import (
	"fmt"
	"log"
	"regexp"
	"strconv"
	"strings"
	"time"

	"network-software/internal/models"
	"network-software/internal/sshclient"
)

type DatacomDriver struct {
	device *models.Device
	client *sshclient.SSHClient
}

func NewDatacomDriver(device *models.Device, client *sshclient.SSHClient) *DatacomDriver {
	return &DatacomDriver{device: device, client: client}
}

func (d *DatacomDriver) TestConnection() (models.SSHTestResult, error) {
	latency, banner, err := d.client.TestConnection()
	if err != nil {
		return models.SSHTestResult{
			Success:   false,
			LatencyMs: latency,
			Error:     err.Error(),
		}, err
	}
	return models.SSHTestResult{
		Success:   true,
		LatencyMs: latency,
		Banner:    banner,
	}, nil
}

func (d *DatacomDriver) RunCommand(cmd string) (string, error) {
	// Disable paging in DmOS via 'terminal length 0'
	cmds := []string{"terminal length 0", cmd}
	return d.client.RunInteractiveSession(cmds, 1200*time.Millisecond)
}

func (d *DatacomDriver) GetBGPSessions() ([]models.BGPSession, error) {
	output, err := d.RunCommand("show ip bgp summary")
	if err != nil {
		return nil, fmt.Errorf("datacom bgp command failed: %w", err)
	}

	return ParseDatacomBGP(output, d.device.ID, d.device.Name), nil
}

func (d *DatacomDriver) GetOSPFNeighbors() ([]models.OSPFNeighbor, error) {
	output, err := d.RunCommand("show ip ospf neighbor")
	if err != nil {
		return nil, fmt.Errorf("datacom ospf command failed: %w", err)
	}

	return ParseDatacomOSPF(output, d.device.ID, d.device.Name), nil
}

func (d *DatacomDriver) GetStaticRoutes() ([]models.StaticRoute, error) {
	output, err := d.RunCommand("show running-config ip-route")
	if err != nil {
		return nil, fmt.Errorf("datacom static routes command failed: %w", err)
	}

	return ParseDatacomStaticRoutes(output, d.device.ID, d.device.Name), nil
}

func (d *DatacomDriver) AddStaticRoute(req models.StaticRouteRequest) error {
	// Modo Seguro: Zero disparo automático para roteadores
	cmd := fmt.Sprintf("ip route %s %s", req.Destination, req.NextHop)
	if req.Preference > 0 {
		cmd += fmt.Sprintf(" %d", req.Preference)
	}

	cmds := []string{"configure terminal", cmd, "exit"}
	log.Printf("[MODO MANUAL SEGURO - DATACOM] Rota estática gerada para host %s (%s): %s", d.device.Name, d.device.Host, strings.Join(cmds, " ; "))
	return nil
}

func (d *DatacomDriver) DeleteStaticRoute(destination, nextHop string) error {
	// Modo Seguro: Zero disparo automático para roteadores
	cmd := fmt.Sprintf("no ip route %s %s", destination, nextHop)
	cmds := []string{"configure terminal", cmd, "exit"}
	log.Printf("[MODO MANUAL SEGURO - DATACOM] Remoção de rota gerada para host %s (%s): %s", d.device.Name, d.device.Host, strings.Join(cmds, " ; "))
	return nil
}

func (d *DatacomDriver) GetBGPPrepends() (*models.DevicePrependOverview, error) {
	sessions, err := d.GetBGPSessions()
	if err != nil {
		return nil, fmt.Errorf("datacom bgp sessions query failed: %w", err)
	}

	rmOutput, _ := d.RunCommand("show running-config route-map")

	return ParseDatacomBGPPrepends(rmOutput, sessions, d.device.ID, d.device.Name), nil
}

func (d *DatacomDriver) ApplyBGPPrepend(req models.PrependApplyRequest) error {
	// Strictly read-only for network safety
	return fmt.Errorf("alteração de BGP desativada por segurança operacional (modo somente consulta ativo)")
}

func (d *DatacomDriver) GetBGPImportPolicy(peerIP string) (policyName string, node int, localPref int, err error) {
	return "", 0, 100, nil
}

func (d *DatacomDriver) GetAllBGPImportPolicies() (map[string]models.BGPImportPolicyInfo, error) {
	return make(map[string]models.BGPImportPolicyInfo), nil
}

func (d *DatacomDriver) SetBGPLocalPreference(req models.LocalPrefApplyRequest) error {
	return fmt.Errorf("alteração de local-preference via API para Datacom ainda não configurada")
}


// ParseDatacomBGPPrepends parses route-map prepend configurations for Datacom DmOS (read-only).
func ParseDatacomBGPPrepends(rmOutput string, sessions []models.BGPSession, deviceID, deviceName string) *models.DevicePrependOverview {
	overview := &models.DevicePrependOverview{
		DeviceID:   deviceID,
		DeviceName: deviceName,
		Peers:      []models.BGPPeerPrepend{},
		Prefixes:   []models.PrefixPrependState{},
		ASGroups:   []models.ASPrependGroup{},
	}

	if len(sessions) > 0 {
		overview.LocalAS = sessions[0].LocalAS
	}

	prependRegex := regexp.MustCompile(`(?i)set\s+as-path\s+prepend\s+([0-9\s]+)`)

	prependCount := 0
	if m := prependRegex.FindStringSubmatch(rmOutput); len(m) > 1 {
		asns := strings.Fields(m[1])
		prependCount = len(asns)
	}

	for _, s := range sessions {
		peerName := s.Description
		if peerName == "" {
			peerName = fmt.Sprintf("AS%s (%s)", s.RemoteAS, s.PeerIP)
		}

		overview.Peers = append(overview.Peers, models.BGPPeerPrepend{
			ID:           fmt.Sprintf("peer-%s-%s", deviceID, s.PeerIP),
			DeviceID:     deviceID,
			DeviceName:   deviceName,
			PeerIP:       s.PeerIP,
			PeerName:     peerName,
			RemoteAS:     s.RemoteAS,
			LocalAS:      s.LocalAS,
			PrependCount: prependCount,
			PolicyName:   "ROUTE-MAP-OUT",
			IsBlocked:    s.State != "Established",
			Status:       s.State,
		})
	}

	return overview
}

var datacomLocalASRegex = regexp.MustCompile(`(?i)local\s+AS\s+number\s+(\d+)`)

// ParseDatacomBGP parses DmOS 'show ip bgp summary' output into structured models.
func ParseDatacomBGP(output, deviceID, deviceName string) []models.BGPSession {
	var sessions []models.BGPSession

	localAS := ""
	if match := datacomLocalASRegex.FindStringSubmatch(output); len(match) > 1 {
		localAS = match[1]
	}

	lines := strings.Split(output, "\n")
	tableStarted := false

	// Neighbor V AS MsgRcvd MsgSent TblVer InQ OutQ Up/Down State/PfxRcd
	// 192.168.10.1 4 65001 1200 1205 0 0 0 02:40:12 250
	// 192.168.20.1 4 65002 0 0 0 0 0 00:00:00 Active
	peerRegex := regexp.MustCompile(`^\s*([0-9a-fA-F\.\:]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([0-9\:\-\w]+)\s+([A-Za-z0-9]+)`)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(strings.ToLower(trimmed), "neighbor") && strings.Contains(strings.ToLower(trimmed), "state") {
			tableStarted = true
			continue
		}
		if !tableStarted || trimmed == "" {
			continue
		}

		if match := peerRegex.FindStringSubmatch(trimmed); len(match) >= 11 {
			peerIP := match[1]
			remoteAS := match[3]
			uptime := match[9]
			stateOrPfx := match[10]

			state := "Established"
			prefixCount := 0

			// In DmOS (Cisco-like BGP summary), if State/PfxRcd is numeric, it is Established with N prefixes
			if pfx, err := strconv.Atoi(stateOrPfx); err == nil {
				prefixCount = pfx
				state = "Established"
			} else {
				state = stateOrPfx
			}

			sessions = append(sessions, models.BGPSession{
				DeviceID:         deviceID,
				DeviceName:       deviceName,
				PeerIP:           peerIP,
				RemoteAS:         remoteAS,
				LocalAS:          localAS,
				State:            state,
				Uptime:           uptime,
				PrefixesReceived: prefixCount,
				RawOutput:        trimmed,
			})
		}
	}

	return sessions
}

// ParseDatacomOSPF parses DmOS 'show ip ospf neighbor' output into structured models.
func ParseDatacomOSPF(output, deviceID, deviceName string) []models.OSPFNeighbor {
	var neighbors []models.OSPFNeighbor
	lines := strings.Split(output, "\n")
	tableStarted := false

	// Neighbor ID Pri State Dead Time Address Interface
	// 10.255.255.1 1 FULL/DR 00:00:34 10.0.0.2 xe-0/0/1
	ospfRegex := regexp.MustCompile(`^\s*([0-9\.]+)\s+(\d+)\s+([A-Za-z0-9\/]+)\s+([0-9\:\-\w]+)\s+([0-9\.]+)\s+([A-Za-z0-9\/\.\-]+)`)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(strings.ToLower(trimmed), "neighbor id") && strings.Contains(strings.ToLower(trimmed), "state") {
			tableStarted = true
			continue
		}
		if !tableStarted || trimmed == "" {
			continue
		}

		if match := ospfRegex.FindStringSubmatch(trimmed); len(match) >= 7 {
			neighborID := match[1]
			stateRole := match[3]
			deadTime := match[4]
			address := match[5]
			iface := match[6]

			state := stateRole
			role := "-"
			if parts := strings.Split(stateRole, "/"); len(parts) == 2 {
				state = parts[0]
				role = parts[1]
			}

			neighbors = append(neighbors, models.OSPFNeighbor{
				DeviceID:   deviceID,
				DeviceName: deviceName,
				NeighborID: neighborID,
				IP:         address,
				Interface:  iface,
				Area:       "0.0.0.0",
				State:      state,
				Role:       role,
				DeadTime:   deadTime,
				RawOutput:  trimmed,
			})
		}
	}

	return neighbors
}

// ParseDatacomStaticRoutes parses DmOS 'show running-config ip-route' output.
func ParseDatacomStaticRoutes(output, deviceID, deviceName string) []models.StaticRoute {
	var routes []models.StaticRoute
	lines := strings.Split(output, "\n")

	routeRegex := regexp.MustCompile(`(?i)^\s*ip\s+route\s+([0-9\.\:\/]+)\s+([0-9a-zA-Z\.\/\-]+)(?:\s+(\d+))?`)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		match := routeRegex.FindStringSubmatch(trimmed)
		if len(match) < 3 {
			continue
		}

		destination := match[1]
		nextHop := match[2]
		pref := 1
		if len(match) >= 4 && match[3] != "" {
			pref, _ = strconv.Atoi(match[3])
		}

		routeID := fmt.Sprintf("rt-%s-%s", strings.ReplaceAll(destination, "/", "_"), nextHop)

		routes = append(routes, models.StaticRoute{
			ID:          routeID,
			DeviceID:    deviceID,
			DeviceName:  deviceName,
			Destination: destination,
			NextHop:     nextHop,
			Preference:  pref,
			Status:      "active",
			RawOutput:   trimmed,
		})
	}

	return routes
}

