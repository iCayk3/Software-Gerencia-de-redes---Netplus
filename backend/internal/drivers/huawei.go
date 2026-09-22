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

// BGPManualExecutionOnly enforces the safety policy requested by user:
// BGP commands are generated for manual review/execution and NEVER sent or committed to live routers automatically.
const BGPManualExecutionOnly = true

type HuaweiDriver struct {
	device *models.Device
	client *sshclient.SSHClient
}

func NewHuaweiDriver(device *models.Device, client *sshclient.SSHClient) *HuaweiDriver {
	return &HuaweiDriver{device: device, client: client}
}

func (d *HuaweiDriver) TestConnection() (models.SSHTestResult, error) {
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

func (d *HuaweiDriver) RunCommand(cmd string) (string, error) {
	// Send 'screen-length 0 temporary' first to disable paging, then run the requested command
	cmds := []string{"screen-length 0 temporary", cmd}
	return d.client.RunInteractiveSession(cmds, 1200*time.Millisecond)
}

func (d *HuaweiDriver) GetBGPSessions() ([]models.BGPSession, error) {
	output, err := d.RunCommand("display bgp peer")
	if err != nil {
		return nil, fmt.Errorf("huawei bgp command failed: %w", err)
	}

	return ParseHuaweiBGP(output, d.device.ID, d.device.Name), nil
}

func (d *HuaweiDriver) GetOSPFNeighbors() ([]models.OSPFNeighbor, error) {
	output, err := d.RunCommand("display ospf peer brief")
	if err != nil {
		return nil, fmt.Errorf("huawei ospf command failed: %w", err)
	}

	return ParseHuaweiOSPF(output, d.device.ID, d.device.Name), nil
}

func (d *HuaweiDriver) GetStaticRoutes() ([]models.StaticRoute, error) {
	output, err := d.RunCommand("display current-configuration | include ip route-static")
	if err != nil {
		return nil, fmt.Errorf("huawei static routes command failed: %w", err)
	}

	return ParseHuaweiStaticRoutes(output, d.device.ID, d.device.Name), nil
}

func (d *HuaweiDriver) AddStaticRoute(req models.StaticRouteRequest) error {
	ip, mask := splitCIDR(req.Destination)
	cmd := fmt.Sprintf("ip route-static %s %s %s", ip, mask, req.NextHop)
	if req.Preference > 0 {
		cmd += fmt.Sprintf(" preference %d", req.Preference)
	}
	if req.Description != "" {
		cmd += fmt.Sprintf(" description %s", req.Description)
	}

	cmds := []string{"system-view", cmd, "commit", "return"}
	_, err := d.client.RunInteractiveSession(cmds, 1000*time.Millisecond)
	return err
}

func (d *HuaweiDriver) DeleteStaticRoute(destination, nextHop string) error {
	ip, mask := splitCIDR(destination)
	cmd := fmt.Sprintf("undo ip route-static %s %s %s", ip, mask, nextHop)
	cmds := []string{"system-view", cmd, "commit", "return"}
	_, err := d.client.RunInteractiveSession(cmds, 1000*time.Millisecond)
	return err
}

// GetBGPPrepends queries and parses BGP prepends and export policies on Huawei (read-only).
func (d *HuaweiDriver) GetBGPPrepends() (*models.DevicePrependOverview, error) {
	bgpCfg, err := d.RunCommand("display current-configuration configuration bgp")
	if err != nil {
		return nil, fmt.Errorf("huawei bgp config query failed: %w", err)
	}

	sessions, _ := d.GetBGPSessions()
	tagPol, _ := d.RunCommand("display route-policy RP-TAG-V4-ORIGIN")

	return ParseHuaweiBGPPrepends(bgpCfg, tagPol, sessions, d.device.ID, d.device.Name), nil
}

// ApplyBGPPrepend applies AS-Path Prepending or selective blocking on Huawei routers.
// If the consultant's 3-Tier Origin Tagging architecture (RP-TAG-V4-ORIGIN) is in place,
// it adjusts the community tags on the origin node and issues 'refresh bgp all export' with zero session flap.
func (d *HuaweiDriver) ApplyBGPPrepend(req models.PrependApplyRequest) error {
	if req.PeerIP == "" {
		return fmt.Errorf("peer_ip é obrigatório para ajuste de prepend")
	}

	// 1. Check if route-policy RP-TAG-V4-ORIGIN exists
	tagPolOutput, err := d.RunCommand("display route-policy RP-TAG-V4-ORIGIN")
	hasOriginTagging := err == nil && strings.Contains(tagPolOutput, "RP-TAG-V4-ORIGIN")

	bgpCfg, _ := d.RunCommand("display current-configuration configuration bgp")
	peerAS, peerDesc, exportPol := extractHuaweiPeerInfo(bgpCfg, req.PeerIP)

	if hasOriginTagging {
		// 2. Determine the community family base for this peer
		peerBase := DetermineHuaweiPeerCommunityBase(req.PeerIP, peerAS, peerDesc, exportPol)

		// 3. If a specific prefix is specified:
		if req.Prefix != "" {
			pfxCfg, _ := d.RunCommand("display ip ip-prefix")
			if pfxCfg == "" {
				pfxCfg, _ = d.RunCommand("display current-configuration configuration ip-prefix")
			}

			node, currentComms, err := FindHuaweiPrefixNode(tagPolOutput, pfxCfg, req.Prefix)
			if err != nil {
				return fmt.Errorf("não foi possível localizar o node do prefixo %s na policy RP-TAG-V4-ORIGIN: %w", req.Prefix, err)
			}

			updatedComms, _ := UpdateHuaweiOriginCommunity(currentComms, peerBase, req.PrependCount, req.Block)
			applyCommCmd := fmt.Sprintf("apply community %s additive", strings.Join(updatedComms, " "))

			cmds := []string{
				"system-view",
				fmt.Sprintf("route-policy RP-TAG-V4-ORIGIN permit node %d", node),
				applyCommCmd,
				"commit",
				"return",
				"refresh bgp all export",
			}

			if BGPManualExecutionOnly {
				log.Printf("[MODO MANUAL BGP - PREPEND] Comandos gerados para %s (prefixo %s): %s", req.PeerIP, req.Prefix, strings.Join(cmds, " ; "))
				return nil
			}

			output, err := d.client.RunInteractiveSession(cmds, 1200*time.Millisecond)
			if err != nil {
				return fmt.Errorf("falha ao executar configuração de prepend no Huawei: %w (output: %s)", err, output)
			}
			return nil
		}

		// If prefix is empty, apply to all nodes in RP-TAG-V4-ORIGIN
		allNodes := ExtractAllHuaweiOriginNodes(tagPolOutput)
		if len(allNodes) == 0 {
			return fmt.Errorf("nenhum node encontrado na route-policy RP-TAG-V4-ORIGIN")
		}

		cmds := []string{"system-view"}
		for _, nd := range allNodes {
			updatedComms, _ := UpdateHuaweiOriginCommunity(nd.Communities, peerBase, req.PrependCount, req.Block)
			cmds = append(cmds,
				fmt.Sprintf("route-policy RP-TAG-V4-ORIGIN permit node %d", nd.Node),
				fmt.Sprintf("apply community %s additive", strings.Join(updatedComms, " ")),
			)
		}
		cmds = append(cmds, "commit", "return", "refresh bgp all export")

		if BGPManualExecutionOnly {
			log.Printf("[MODO MANUAL BGP - PREPEND] Comandos gerados para todos os nós para %s: %s", req.PeerIP, strings.Join(cmds, " ; "))
			return nil
		}

		output, err := d.client.RunInteractiveSession(cmds, 1800*time.Millisecond)
		if err != nil {
			return fmt.Errorf("falha ao executar configuração global de prepend no Huawei: %w (output: %s)", err, output)
		}
		return nil
	}

	// Direct export route-policy fallback (if RP-TAG-V4-ORIGIN is not used)
	if exportPol == "" {
		return fmt.Errorf("nenhuma policy de export ou RP-TAG-V4-ORIGIN encontrada para o peer %s", req.PeerIP)
	}

	localAS := "267943"
	asMatch := regexp.MustCompile(`(?i)\bbgp\s+(\d+)`).FindStringSubmatch(bgpCfg)
	if len(asMatch) > 1 {
		localAS = asMatch[1]
	}

	cmds := []string{"system-view"}
	if req.Block {
		cmds = append(cmds, fmt.Sprintf("route-policy %s deny node 5", exportPol))
	} else {
		cmds = append(cmds, fmt.Sprintf("undo route-policy %s deny node 5", exportPol))
		if req.PrependCount > 0 {
			asns := make([]string, req.PrependCount)
			for i := 0; i < req.PrependCount; i++ {
				asns[i] = localAS
			}
			cmds = append(cmds,
				fmt.Sprintf("route-policy %s permit node 10", exportPol),
				fmt.Sprintf("apply as-path %s additive", strings.Join(asns, " ")),
			)
		} else {
			cmds = append(cmds,
				fmt.Sprintf("route-policy %s permit node 10", exportPol),
				"undo apply as-path",
			)
		}
	}
	cmds = append(cmds, "commit", "return", fmt.Sprintf("refresh bgp %s export", req.PeerIP))

	if BGPManualExecutionOnly {
		log.Printf("[MODO MANUAL BGP - PREPEND] Comandos gerados para fallback %s: %s", req.PeerIP, strings.Join(cmds, " ; "))
		return nil
	}

	output, err := d.client.RunInteractiveSession(cmds, 1200*time.Millisecond)
	if err != nil {
		return fmt.Errorf("falha ao configurar export policy no Huawei: %w (output: %s)", err, output)
	}
	return nil
}

// GetAllBGPImportPolicies extracts import policies and generic local-preference for all peers efficiently.
func (d *HuaweiDriver) GetAllBGPImportPolicies() (map[string]models.BGPImportPolicyInfo, error) {
	bgpCfg, err := d.RunCommand("display current-configuration configuration bgp")
	if err != nil {
		return nil, err
	}

	re := regexp.MustCompile(`(?i)^\s*peer\s+([0-9a-fA-F\.\:]+)\s+route-policy\s+(\S+)\s+import`)
	peerPolicyMap := make(map[string]string)
	uniquePolicies := make(map[string]bool)

	for _, line := range strings.Split(bgpCfg, "\n") {
		m := re.FindStringSubmatch(strings.TrimSpace(line))
		if len(m) >= 3 {
			peerIP := m[1]
			pol := m[2]
			peerPolicyMap[peerIP] = pol
			uniquePolicies[pol] = true
		}
	}

	type polResult struct {
		node      int
		localPref int
	}
	parsedPolicies := make(map[string]polResult)
	for pol := range uniquePolicies {
		out, err := d.RunCommand(fmt.Sprintf("display route-policy %s", pol))
		if err == nil && out != "" {
			node, lp := ParseHuaweiGenericLocalPref(out)
			parsedPolicies[pol] = polResult{node: node, localPref: lp}
		}
	}

	result := make(map[string]models.BGPImportPolicyInfo)
	for peerIP, pol := range peerPolicyMap {
		info, ok := parsedPolicies[pol]
		if ok {
			result[peerIP] = models.BGPImportPolicyInfo{
				PolicyName: pol,
				Node:       info.node,
				LocalPref:  info.localPref,
			}
		} else {
			result[peerIP] = models.BGPImportPolicyInfo{
				PolicyName: pol,
				Node:       11,
				LocalPref:  100,
			}
		}
	}

	return result, nil
}

// GetBGPImportPolicy extracts the import route-policy and generic local-preference for a peer.
func (d *HuaweiDriver) GetBGPImportPolicy(peerIP string) (policyName string, node int, localPref int, err error) {
	all, err := d.GetAllBGPImportPolicies()
	if err != nil {
		return "", 11, 100, err
	}
	if info, ok := all[peerIP]; ok {
		return info.PolicyName, info.Node, info.LocalPref, nil
	}
	return "", 11, 100, nil
}

// SetBGPLocalPreference configures the generic local-preference on the peer's import route-policy and commits it.
func (d *HuaweiDriver) SetBGPLocalPreference(req models.LocalPrefApplyRequest) error {
	if req.LocalPref <= 0 {
		return fmt.Errorf("local-preference deve ser um número inteiro positivo")
	}

	policy := req.PolicyName
	node := req.Node

	if policy == "" || node == 0 {
		pol, nd, _, err := d.GetBGPImportPolicy(req.PeerIP)
		if err == nil && pol != "" {
			policy = pol
			if node == 0 {
				node = nd
			}
		}
	}

	if policy == "" {
		return fmt.Errorf("não foi encontrada route-policy de importação para o peer %s", req.PeerIP)
	}
	if node == 0 {
		node = 11
	}

	cmds := []string{
		"system-view",
		fmt.Sprintf("route-policy %s permit node %d", policy, node),
		fmt.Sprintf("apply local-preference %d", req.LocalPref),
		"commit",
		"return",
		fmt.Sprintf("refresh bgp %s import", req.PeerIP),
	}

	if BGPManualExecutionOnly {
		log.Printf("[MODO MANUAL BGP - LOCAL-PREF] Comandos gerados para %s (valor %d): %s (nenhuma alteração executada no roteador)", req.PeerIP, req.LocalPref, strings.Join(cmds, " ; "))
		return nil
	}

	_, err := d.client.RunInteractiveSession(cmds, 1500*time.Millisecond)
	return err
}

// ParseHuaweiGenericLocalPref parses route-policy output and identifies the generic permit node and its local-pref.
func ParseHuaweiGenericLocalPref(polOutput string) (node int, localPref int) {
	node = 11
	localPref = 100

	sections := regexp.MustCompile(`(?i)permit\s*:\s*(\d+)`).FindAllStringSubmatchIndex(polOutput, -1)
	if len(sections) == 0 {
		return
	}

	for i := 0; i < len(sections); i++ {
		start := sections[i][0]
		end := len(polOutput)
		if i+1 < len(sections) {
			end = sections[i+1][0]
		}
		chunk := polOutput[start:end]

		nodeMatch := regexp.MustCompile(`(?i)permit\s*:\s*(\d+)`).FindStringSubmatch(chunk)
		if len(nodeMatch) < 2 {
			continue
		}
		curNode, _ := strconv.Atoi(nodeMatch[1])

		lpMatch := regexp.MustCompile(`(?i)apply\s+local-preference\s+(\d+)`).FindStringSubmatch(chunk)
		if len(lpMatch) < 2 {
			continue
		}
		curLP, _ := strconv.Atoi(lpMatch[1])

		// If it's a specific prefix policy (PL-PREFERENCE), skip to find the generic one
		if strings.Contains(strings.ToLower(chunk), "pl-preference") || strings.Contains(strings.ToLower(chunk), "if-match ip-prefix") {
			continue
		}

		node = curNode
		localPref = curLP
		return
	}

	// Fallback to any node with local-preference
	lpMatch := regexp.MustCompile(`(?i)apply\s+local-preference\s+(\d+)`).FindStringSubmatch(polOutput)
	if len(lpMatch) >= 2 {
		localPref, _ = strconv.Atoi(lpMatch[1])
	}
	return
}


var localASRegex = regexp.MustCompile(`(?i)Local\s+AS\s+number\s*:\s*(\d+)`)

// ParseHuaweiBGP parses 'display bgp peer' output into structured models.
func ParseHuaweiBGP(output, deviceID, deviceName string) []models.BGPSession {
	var sessions []models.BGPSession

	localAS := ""
	if match := localASRegex.FindStringSubmatch(output); len(match) > 1 {
		localAS = match[1]
	}

	lines := strings.Split(output, "\n")
	tableStarted := false

	// Regex for peer line:
	// Example: 10.0.0.1 4 65001 14321 14320 0 03:24:12 Established 500
	// Or:      192.168.1.2 4 65002 0 0 0 00:00:00 Idle 0
	peerRegex := regexp.MustCompile(`^\s*([0-9a-fA-F\.\:]+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+(\d+)\s+([0-9\:\-\w]+)\s+([A-Za-z]+)\s*(\d+)?`)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(strings.ToLower(trimmed), "peer") && strings.Contains(strings.ToLower(trimmed), "state") {
			tableStarted = true
			continue
		}
		if !tableStarted || trimmed == "" {
			continue
		}

		if match := peerRegex.FindStringSubmatch(trimmed); len(match) >= 9 {
			peerIP := match[1]
			remoteAS := match[3]
			uptime := match[7]
			state := match[8]
			prefixCount := 0
			if len(match) >= 10 && match[9] != "" {
				prefixCount, _ = strconv.Atoi(match[9])
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

// ParseHuaweiOSPF parses 'display ospf peer brief' output into structured models.
func ParseHuaweiOSPF(output, deviceID, deviceName string) []models.OSPFNeighbor {
	var neighbors []models.OSPFNeighbor
	lines := strings.Split(output, "\n")
	tableStarted := false

	// Regex for OSPF brief peer line:
	// Area Id Interface Neighbor id State
	// 0.0.0.0 GigabitEthernet0/0/1 10.255.255.1 Full
	// 0.0.0.0 10GE1/0/1 10.255.255.2 Full/DR
	ospfRegex := regexp.MustCompile(`^\s*([0-9\.]+)\s+([A-Za-z0-9\/\.\-]+)\s+([0-9\.]+)\s+([A-Za-z0-9\/\-]+)`)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.Contains(strings.ToLower(trimmed), "area id") && strings.Contains(strings.ToLower(trimmed), "neighbor id") {
			tableStarted = true
			continue
		}
		if strings.HasPrefix(trimmed, "---") || strings.HasPrefix(trimmed, "OSPF Process") {
			continue
		}
		if !tableStarted || trimmed == "" {
			continue
		}

		if match := ospfRegex.FindStringSubmatch(trimmed); len(match) >= 5 {
			area := match[1]
			iface := match[2]
			neighborID := match[3]
			fullState := match[4]

			state := fullState
			role := "-"
			if parts := strings.Split(fullState, "/"); len(parts) == 2 {
				state = parts[0]
				role = parts[1]
			}

			neighbors = append(neighbors, models.OSPFNeighbor{
				DeviceID:   deviceID,
				DeviceName: deviceName,
				NeighborID: neighborID,
				IP:         neighborID,
				Interface:  iface,
				Area:       area,
				State:      state,
				Role:       role,
				RawOutput:  trimmed,
			})
		}
	}

	return neighbors
}

// ParseHuaweiStaticRoutes parses 'display current-configuration | include ip route-static' output.
func ParseHuaweiStaticRoutes(output, deviceID, deviceName string) []models.StaticRoute {
	var routes []models.StaticRoute
	lines := strings.Split(output, "\n")

	prefRegex := regexp.MustCompile(`(?i)preference\s+(\d+)`)
	tagRegex := regexp.MustCompile(`(?i)tag\s+(\d+)`)
	descRegex := regexp.MustCompile(`(?i)description\s+([^\r\n]+)`)
	baseRegex := regexp.MustCompile(`(?i)ip\s+route-static\s+([0-9\.]+)\s+([0-9\.]+|\d+)\s+([0-9a-zA-Z\.\/\-]+)`)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if !strings.HasPrefix(strings.ToLower(trimmed), "ip route-static") {
			continue
		}

		match := baseRegex.FindStringSubmatch(trimmed)
		if len(match) < 4 {
			continue
		}

		destIP := match[1]
		mask := match[2]
		nextHop := match[3]

		destination := formatDestination(destIP, mask)

		pref := 60 // Default Huawei static route preference
		if m := prefRegex.FindStringSubmatch(trimmed); len(m) > 1 {
			pref, _ = strconv.Atoi(m[1])
		}

		tag := ""
		if m := tagRegex.FindStringSubmatch(trimmed); len(m) > 1 {
			tag = m[1]
		}

		description := ""
		if m := descRegex.FindStringSubmatch(trimmed); len(m) > 1 {
			description = strings.TrimSpace(m[1])
		}

		routeID := fmt.Sprintf("rt-%s-%s", strings.ReplaceAll(destination, "/", "_"), nextHop)

		routes = append(routes, models.StaticRoute{
			ID:          routeID,
			DeviceID:    deviceID,
			DeviceName:  deviceName,
			Destination: destination,
			NextHop:     nextHop,
			Preference:  pref,
			Tag:         tag,
			Description: description,
			Status:      "active",
			RawOutput:   trimmed,
		})
	}

	return routes
}

func formatDestination(ip, mask string) string {
	if mask == "0.0.0.0" || mask == "0" {
		return "0.0.0.0/0"
	}
	if n, err := strconv.Atoi(mask); err == nil && n >= 0 && n <= 32 {
		return fmt.Sprintf("%s/%d", ip, n)
	}
	parts := strings.Split(mask, ".")
	if len(parts) == 4 {
		ones := 0
		for _, p := range parts {
			val, _ := strconv.Atoi(p)
			for val > 0 {
				if val&1 == 1 {
					ones++
				}
				val >>= 1
			}
		}
		return fmt.Sprintf("%s/%d", ip, ones)
	}
	return fmt.Sprintf("%s/%s", ip, mask)
}

func splitCIDR(cidr string) (string, string) {
	parts := strings.Split(cidr, "/")
	if len(parts) == 2 {
		return parts[0], parts[1]
	}
	return cidr, "32"
}

// ParseHuaweiBGPPrepends parses BGP configuration and route-policies into structured prepend models (read-only).
func ParseHuaweiBGPPrepends(bgpCfg, tagPol string, sessions []models.BGPSession, deviceID, deviceName string) *models.DevicePrependOverview {
	overview := &models.DevicePrependOverview{
		DeviceID:   deviceID,
		DeviceName: deviceName,
		Peers:      []models.BGPPeerPrepend{},
		Prefixes:   []models.PrefixPrependState{},
	}

	// 1. Extract Local AS
	asMatch := regexp.MustCompile(`(?i)\bbgp\s+(\d+)`).FindStringSubmatch(bgpCfg)
	if len(asMatch) > 1 {
		overview.LocalAS = asMatch[1]
	} else if len(sessions) > 0 {
		overview.LocalAS = sessions[0].LocalAS
	}

	// Session lookup map
	sessionMap := make(map[string]models.BGPSession)
	for _, s := range sessions {
		sessionMap[s.PeerIP] = s
	}

	// 2. Parse peers from bgpCfg
	type peerInfo struct {
		ip          string
		asNumber    string
		description string
		routePolicy string
		ignored     bool
	}
	peersMap := make(map[string]*peerInfo)

	lines := strings.Split(bgpCfg, "\n")
	peerASRegex := regexp.MustCompile(`(?i)^\s*peer\s+([0-9a-fA-F\.\:]+)\s+as-number\s+(\d+)`)
	peerDescRegex := regexp.MustCompile(`(?i)^\s*peer\s+([0-9a-fA-F\.\:]+)\s+description\s+([^\r\n]+)`)
	peerPolicyRegex := regexp.MustCompile(`(?i)^\s*peer\s+([0-9a-fA-F\.\:]+)\s+route-policy\s+(\S+)\s+export`)
	peerIgnoreRegex := regexp.MustCompile(`(?i)^\s*peer\s+([0-9a-fA-F\.\:]+)\s+ignore`)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if m := peerASRegex.FindStringSubmatch(trimmed); len(m) > 2 {
			ip := m[1]
			if _, exists := peersMap[ip]; !exists {
				peersMap[ip] = &peerInfo{ip: ip}
			}
			peersMap[ip].asNumber = m[2]
		}
		if m := peerDescRegex.FindStringSubmatch(trimmed); len(m) > 2 {
			ip := m[1]
			if _, exists := peersMap[ip]; !exists {
				peersMap[ip] = &peerInfo{ip: ip}
			}
			peersMap[ip].description = strings.TrimSpace(m[2])
		}
		if m := peerPolicyRegex.FindStringSubmatch(trimmed); len(m) > 2 {
			ip := m[1]
			if _, exists := peersMap[ip]; !exists {
				peersMap[ip] = &peerInfo{ip: ip}
			}
			peersMap[ip].routePolicy = strings.TrimSpace(m[2])
		}
		if m := peerIgnoreRegex.FindStringSubmatch(trimmed); len(m) > 1 {
			ip := m[1]
			if _, exists := peersMap[ip]; !exists {
				peersMap[ip] = &peerInfo{ip: ip}
			}
			peersMap[ip].ignored = true
		}
	}

	for _, p := range peersMap {
		if p.asNumber == overview.LocalAS && strings.Contains(strings.ToLower(p.description), "collector") {
			continue
		}

		peerName := p.description
		if peerName == "" {
			peerName = fmt.Sprintf("AS%s (%s)", p.asNumber, p.ip)
		}

		status := "Unknown"
		if s, ok := sessionMap[p.ip]; ok {
			status = s.State
		}
		if p.ignored {
			status = "Ignored (Admin Down)"
		}

		overview.Peers = append(overview.Peers, models.BGPPeerPrepend{
			ID:           fmt.Sprintf("peer-%s-%s", deviceID, p.ip),
			DeviceID:     deviceID,
			DeviceName:   deviceName,
			PeerIP:       p.ip,
			PeerName:     peerName,
			RemoteAS:     p.asNumber,
			LocalAS:      overview.LocalAS,
			PrependCount: 0,
			PolicyName:   p.routePolicy,
			IsBlocked:    p.ignored,
			Status:       status,
		})
	}

	// 3. Extract announced networks (prefix list)
	netV4Regex := regexp.MustCompile(`(?i)^\s*network\s+([0-9\.]+)\s+([0-9\.]+)(?:\s+route-policy\s+(\S+))?`)
	var announcedPrefixes []string
	seenPrefix := make(map[string]bool)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if m := netV4Regex.FindStringSubmatch(trimmed); len(m) >= 3 {
			cidr := formatDestination(m[1], m[2])
			if !seenPrefix[cidr] {
				seenPrefix[cidr] = true
				announcedPrefixes = append(announcedPrefixes, cidr)
			}
		}
	}

	// 4. Map communities from RP-TAG-V4-ORIGIN per prefix
	prefixCommunityMap := make(map[string]string)
	tagLines := strings.Split(tagPol, "\n")
	currentPrefixTag := ""
	for _, tLine := range tagLines {
		tTrimmed := strings.TrimSpace(tLine)
		if strings.Contains(tTrimmed, "EXACT-V4-") {
			for _, pfx := range announcedPrefixes {
				clean := strings.ReplaceAll(pfx, "45.166.", "")
				clean = strings.ReplaceAll(clean, ".0/", "")
				clean = strings.ReplaceAll(clean, "/", "")
				if strings.Contains(tTrimmed, clean) {
					currentPrefixTag = pfx
					break
				}
			}
		}
		if currentPrefixTag != "" && strings.Contains(tTrimmed, "apply community") {
			prefixCommunityMap[currentPrefixTag] = tTrimmed
			currentPrefixTag = ""
		}
	}

	// 5. Generate PrefixPrependState for each prefix against external peers
	for _, pfx := range announcedPrefixes {
		for _, peer := range overview.Peers {
			if peer.RemoteAS == overview.LocalAS {
				continue
			}

			pState := models.PrefixPrependState{
				ID:           fmt.Sprintf("pfx-%s-%s-%s", deviceID, strings.ReplaceAll(pfx, "/", "_"), peer.PeerIP),
				DeviceID:     deviceID,
				DeviceName:   deviceName,
				Prefix:       pfx,
				PeerIP:       peer.PeerIP,
				PeerName:     peer.PeerName,
				PrependCount: 0,
				IsBlocked:    peer.IsBlocked,
				PolicyName:   peer.PolicyName,
			}

			commStr := prefixCommunityMap[pfx]
			pState.Community = commStr

			base := DetermineHuaweiPeerCommunityBase(peer.PeerIP, peer.RemoteAS, peer.PeerName, peer.PolicyName)
			if strings.Contains(commStr, fmt.Sprintf("1:%s1", base)) {
				pState.PrependCount = 1
			} else if strings.Contains(commStr, fmt.Sprintf("1:%s2", base)) {
				pState.PrependCount = 2
			} else if strings.Contains(commStr, fmt.Sprintf("1:%s3", base)) {
				pState.PrependCount = 3
			} else if strings.Contains(commStr, fmt.Sprintf("0:%s0", base)) || strings.Contains(commStr, "0:10000") {
				pState.IsBlocked = true
			}

			overview.Prefixes = append(overview.Prefixes, pState)
		}
	}

	// 6. Build ASPrependGroups (Group by Operator / IX / Community Base)
	type asGroupAccumulator struct {
		base     string
		remoteAS string
		name     string
		role     string
		peers    []models.BGPPeerPrepend
		peerIPs  []string
	}
	groupsMap := make(map[string]*asGroupAccumulator)
	groupOrder := []string{}

	for _, peer := range overview.Peers {
		if peer.RemoteAS == overview.LocalAS {
			continue
		}

		base := DetermineHuaweiPeerCommunityBase(peer.PeerIP, peer.RemoteAS, peer.PeerName, peer.PolicyName)
		key := base
		if key == "" {
			key = peer.RemoteAS
		}

		if _, exists := groupsMap[key]; !exists {
			groupOrder = append(groupOrder, key)
			gName := peer.PeerName
			role := "other"
			if base == "2002" {
				gName = "Wiki Telecom"
				role = "transit_secondary"
			} else if base == "2003" {
				gName = "SEA Telecom"
				role = "transit_primary"
			} else if base == "4000" {
				gName = "PTT Brasília (IX.br BSB)"
				role = "ix_ptt"
			} else if base == "4100" {
				gName = "PTT São Paulo (IX.br SP)"
				role = "ix_ptt"
			} else if base == "4400" {
				gName = "PTT Fortaleza / Ceará (IX.br CE)"
				role = "ix_ptt"
			} else if base == "4500" {
				gName = "PTT Belém (IX.br BEL)"
				role = "ix_ptt"
			} else if strings.Contains(strings.ToLower(peer.PeerName), "ptt") || strings.Contains(strings.ToLower(peer.PeerName), "ix") {
				role = "ix_ptt"
			}

			groupsMap[key] = &asGroupAccumulator{
				base:     base,
				remoteAS: peer.RemoteAS,
				name:     gName,
				role:     role,
			}
		}

		acc := groupsMap[key]
		acc.peers = append(acc.peers, peer)
		acc.peerIPs = append(acc.peerIPs, peer.PeerIP)
	}

	overview.ASGroups = make([]models.ASPrependGroup, 0)
	for _, key := range groupOrder {
		acc := groupsMap[key]

		// Deduped prefixes for this AS Group
		asPrefixes := make([]models.PrefixPrependState, 0)
		for _, pfx := range announcedPrefixes {
			commStr := prefixCommunityMap[pfx]
			pState := models.PrefixPrependState{
				ID:           fmt.Sprintf("grp-pfx-%s-%s-%s", deviceID, acc.base, strings.ReplaceAll(pfx, "/", "_")),
				DeviceID:     deviceID,
				DeviceName:   deviceName,
				Prefix:       pfx,
				PeerIP:       strings.Join(acc.peerIPs, ", "),
				PeerName:     acc.name,
				PrependCount: 0,
				IsBlocked:    false,
				Community:    commStr,
				PolicyName:   fmt.Sprintf("Base %s (%s)", acc.base, acc.name),
			}

			if strings.Contains(commStr, fmt.Sprintf("1:%s1", acc.base)) {
				pState.PrependCount = 1
			} else if strings.Contains(commStr, fmt.Sprintf("1:%s2", acc.base)) {
				pState.PrependCount = 2
			} else if strings.Contains(commStr, fmt.Sprintf("1:%s3", acc.base)) {
				pState.PrependCount = 3
			} else if strings.Contains(commStr, fmt.Sprintf("0:%s0", acc.base)) || strings.Contains(commStr, "0:10000") {
				pState.IsBlocked = true
			}

			asPrefixes = append(asPrefixes, pState)
		}

		overview.ASGroups = append(overview.ASGroups, models.ASPrependGroup{
			ID:            fmt.Sprintf("asgrp-%s-%s", deviceID, acc.base),
			DeviceID:      deviceID,
			DeviceName:    deviceName,
			RemoteAS:      acc.remoteAS,
			GroupName:     acc.name,
			CommunityBase: acc.base,
			Role:          acc.role,
			PeerCount:     len(acc.peers),
			PeerIPs:       acc.peerIPs,
			Peers:         acc.peers,
			Prefixes:      asPrefixes,
		})
	}

	return overview
}

// extractHuaweiPeerInfo parses peer line details from BGP configuration.
func extractHuaweiPeerInfo(bgpCfg, peerIP string) (asNumber, description, exportPolicy string) {
	for _, line := range strings.Split(bgpCfg, "\n") {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "peer "+peerIP) {
			if m := regexp.MustCompile(`(?i)as-number\s+(\d+)`).FindStringSubmatch(trimmed); len(m) > 1 {
				asNumber = m[1]
			}
			if m := regexp.MustCompile(`(?i)description\s+([^\r\n]+)`).FindStringSubmatch(trimmed); len(m) > 1 {
				description = strings.TrimSpace(m[1])
			}
			if m := regexp.MustCompile(`(?i)route-policy\s+(\S+)\s+export`).FindStringSubmatch(trimmed); len(m) > 1 {
				exportPolicy = strings.TrimSpace(m[1])
			}
		}
	}
	return
}

// DetermineHuaweiPeerCommunityBase resolves the 4-digit community base for a peer according to the consultant matrix.
func DetermineHuaweiPeerCommunityBase(peerIP, peerAS, peerDesc, exportPol string) string {
	descUpper := strings.ToUpper(peerDesc)
	expUpper := strings.ToUpper(exportPol)

	// Wiki Telecom (BGP2 - Trânsito IP)
	if strings.Contains(descUpper, "WIKI") || strings.Contains(expUpper, "WIKI") {
		return "2002"
	}

	// SEA Telecom (BGP1 - Trânsito IP AS 266445)
	if peerAS == "266445" || strings.Contains(descUpper, "SEA") || strings.Contains(expUpper, "SEA") {
		return "2003"
	}

	// PTT Belém / Pará (BGP2 - PTTBEL)
	if strings.Contains(descUpper, "BEL") || strings.Contains(descUpper, "BELEM") || strings.Contains(expUpper, "PTTBEL") {
		return "4500"
	}

	// PTT Fortaleza / Ceará (BGP2 - PTTCE)
	if strings.Contains(descUpper, "CE") || strings.Contains(descUpper, "CEARA") || strings.Contains(descUpper, "FOR") ||
		strings.Contains(descUpper, "FORTALEZA") || strings.Contains(expUpper, "PTTCE") || strings.Contains(expUpper, "PTTFOR") {
		return "4400"
	}

	// PTT São Paulo (BGP2 - PTTSP)
	if strings.Contains(descUpper, "SP") || strings.Contains(descUpper, "SAO PAULO") || strings.Contains(expUpper, "PTTSP") {
		return "4100"
	}

	// PTT Brasília (BGP1 - PTTBRA / BSB AS 26162)
	if (peerAS == "26162" && (strings.Contains(descUpper, "BRASILIA") || strings.Contains(descUpper, "BSB"))) ||
		strings.Contains(expUpper, "PTTBRA") || strings.Contains(descUpper, "PTT-BRASILIA") {
		return "4000"
	}

	// PTT Campinas
	if strings.Contains(descUpper, "CMP") || strings.Contains(descUpper, "CAMPINAS") || strings.Contains(expUpper, "PTTCMP") {
		return "4300"
	}

	// Fallback based on remote AS
	if peerAS != "" && len(peerAS) >= 4 {
		return peerAS[len(peerAS)-4:]
	}
	return "2003"
}

// HuaweiOriginNodeInfo represents a node inside RP-TAG-V4-ORIGIN route-policy.
type HuaweiOriginNodeInfo struct {
	Node        int
	PrefixList  string
	Communities []string
}

// ExtractAllHuaweiOriginNodes parses all nodes from 'display route-policy RP-TAG-V4-ORIGIN'.
func ExtractAllHuaweiOriginNodes(tagPol string) []HuaweiOriginNodeInfo {
	var nodes []HuaweiOriginNodeInfo
	lines := strings.Split(tagPol, "\n")

	nodeRegex := regexp.MustCompile(`(?i)(?:permit\s*:?\s*(\d+)|route-policy\s+\S+\s+permit\s+node\s+(\d+))`)
	prefixRegex := regexp.MustCompile(`(?i)if-match\s+ip-prefix\s+(\S+)`)
	commRegex := regexp.MustCompile(`(?i)apply\s+community\s+([^\r\n]+)`)

	var currentNode *HuaweiOriginNodeInfo

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if m := nodeRegex.FindStringSubmatch(trimmed); len(m) > 0 {
			numStr := m[1]
			if numStr == "" {
				numStr = m[2]
			}
			if numStr != "" {
				if currentNode != nil {
					nodes = append(nodes, *currentNode)
				}
				n, _ := strconv.Atoi(numStr)
				currentNode = &HuaweiOriginNodeInfo{Node: n}
			}
		}

		if currentNode != nil {
			if m := prefixRegex.FindStringSubmatch(trimmed); len(m) > 1 {
				currentNode.PrefixList = m[1]
			}
			if m := commRegex.FindStringSubmatch(trimmed); len(m) > 1 {
				rawComms := m[1]
				rawComms = strings.TrimSuffix(strings.TrimSpace(rawComms), "additive")
				tokens := strings.Fields(rawComms)
				currentNode.Communities = tokens
			}
		}
	}
	if currentNode != nil {
		nodes = append(nodes, *currentNode)
	}

	return nodes
}

// FindHuaweiPrefixNode locates the route-policy node number and current communities matching targetPrefix.
func FindHuaweiPrefixNode(tagPol, pfxCfg, targetPrefix string) (int, []string, error) {
	allNodes := ExtractAllHuaweiOriginNodes(tagPol)
	if len(allNodes) == 0 {
		return 0, nil, fmt.Errorf("nenhum node encontrado na policy RP-TAG-V4-ORIGIN")
	}

	targetPrefix = strings.TrimSpace(targetPrefix)
	cleanPrefix, maskStr := splitCIDR(targetPrefix)

	// 1. Match ip-prefix from pfxCfg (e.g. 'ip ip-prefix EXACT-V4-2228 index 10 permit 45.166.28.0 22')
	targetPrefixList := ""
	pfxRegex := regexp.MustCompile(`(?i)ip-prefix\s+(\S+)\s+(?:index\s+\d+\s+)?permit\s+([0-9\.]+)\s+(\d+)`)
	for _, line := range strings.Split(pfxCfg, "\n") {
		if m := pfxRegex.FindStringSubmatch(strings.TrimSpace(line)); len(m) >= 4 {
			pName := m[1]
			pIP := m[2]
			pMask := m[3]
			if pIP == cleanPrefix && pMask == maskStr {
				targetPrefixList = pName
				break
			}
		}
	}

	// 2. Consultant naming convention fallback (e.g. 45.166.28.0/22 -> EXACT-V4-2228 or EXACT-V4-2824)
	if targetPrefixList == "" {
		ipParts := strings.Split(cleanPrefix, ".")
		thirdOctet := ""
		if len(ipParts) >= 3 {
			thirdOctet = ipParts[2]
		}
		cand1 := fmt.Sprintf("EXACT-V4-%s%s", maskStr, thirdOctet)
		cand2 := fmt.Sprintf("EXACT-V4-%s%s", thirdOctet, maskStr)

		for _, nd := range allNodes {
			if strings.EqualFold(nd.PrefixList, cand1) || strings.EqualFold(nd.PrefixList, cand2) {
				targetPrefixList = nd.PrefixList
				break
			}
		}
	}

	// 3. Search node matching prefix list name or IP
	for _, nd := range allNodes {
		if targetPrefixList != "" && strings.EqualFold(nd.PrefixList, targetPrefixList) {
			return nd.Node, nd.Communities, nil
		}
		if cleanPrefix != "" && strings.Contains(nd.PrefixList, cleanPrefix) {
			return nd.Node, nd.Communities, nil
		}
	}

	// Fallback to first node if only one exists
	if len(allNodes) == 1 {
		return allNodes[0].Node, allNodes[0].Communities, nil
	}

	return 0, nil, fmt.Errorf("prefixo %s não encontrado nos nodes de RP-TAG-V4-ORIGIN", targetPrefix)
}

// UpdateHuaweiOriginCommunity replaces or adds the peer-specific community according to prependCount and block status.
func UpdateHuaweiOriginCommunity(communities []string, peerBase string, prependCount int, block bool) ([]string, string) {
	var targetComm string
	if block {
		targetComm = fmt.Sprintf("0:%s0", peerBase)
	} else {
		count := prependCount
		if count < 0 {
			count = 0
		}
		if count > 3 {
			count = 3
		}
		targetComm = fmt.Sprintf("1:%s%d", peerBase, count)
	}

	replaced := false
	pattern := fmt.Sprintf(`^[01]:%s\d$`, peerBase)
	re := regexp.MustCompile(pattern)

	var result []string
	for _, c := range communities {
		if re.MatchString(c) {
			result = append(result, targetComm)
			replaced = true
		} else {
			result = append(result, c)
		}
	}

	if !replaced {
		result = append(result, targetComm)
	}

	return result, targetComm
}

