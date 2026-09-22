package drivers

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"

	"network-software/internal/models"
	"network-software/internal/sshclient"
)

type MikrotikDriver struct {
	device  *models.Device
	client  *sshclient.SSHClient
	version int // 6 or 7
}

func NewMikrotikV6Driver(device *models.Device, client *sshclient.SSHClient) *MikrotikDriver {
	return &MikrotikDriver{device: device, client: client, version: 6}
}

func NewMikrotikV7Driver(device *models.Device, client *sshclient.SSHClient) *MikrotikDriver {
	return &MikrotikDriver{device: device, client: client, version: 7}
}

func (d *MikrotikDriver) TestConnection() (models.SSHTestResult, error) {
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

func (d *MikrotikDriver) RunCommand(cmd string) (string, error) {
	return d.client.RunCommand(cmd)
}

func (d *MikrotikDriver) GetBGPSessions() ([]models.BGPSession, error) {
	cmd := ""
	if d.version == 7 {
		cmd = "/routing/bgp/session/print detail without-paging"
	} else {
		cmd = "/routing bgp peer print status without-paging"
	}

	output, err := d.RunCommand(cmd)
	if err != nil {
		return nil, fmt.Errorf("mikrotik bgp command failed: %w", err)
	}

	if d.version == 7 {
		return ParseMikrotikV7BGP(output, d.device.ID, d.device.Name), nil
	}
	return ParseMikrotikV6BGP(output, d.device.ID, d.device.Name), nil
}

func (d *MikrotikDriver) GetOSPFNeighbors() ([]models.OSPFNeighbor, error) {
	cmd := ""
	if d.version == 7 {
		cmd = "/routing/ospf/neighbor/print detail without-paging"
	} else {
		cmd = "/routing ospf neighbor print without-paging"
	}

	output, err := d.RunCommand(cmd)
	if err != nil {
		return nil, fmt.Errorf("mikrotik ospf command failed: %w", err)
	}

	return ParseMikrotikOSPF(output, d.device.ID, d.device.Name), nil
}

func (d *MikrotikDriver) GetStaticRoutes() ([]models.StaticRoute, error) {
	cmd := ""
	if d.version == 7 {
		cmd = "/ip/route/print detail where static without-paging"
	} else {
		cmd = "/ip route print detail where static without-paging"
	}

	output, err := d.RunCommand(cmd)
	if err != nil {
		return nil, fmt.Errorf("mikrotik static routes command failed: %w", err)
	}

	return ParseMikrotikStaticRoutes(output, d.device.ID, d.device.Name), nil
}

func (d *MikrotikDriver) AddStaticRoute(req models.StaticRouteRequest) error {
	cmd := ""
	if d.version == 7 {
		cmd = fmt.Sprintf("/ip/route/add dst-address=%s gateway=%s", req.Destination, req.NextHop)
		if req.Preference > 0 {
			cmd += fmt.Sprintf(" distance=%d", req.Preference)
		}
		if req.Description != "" {
			cmd += fmt.Sprintf(" comment=%q", req.Description)
		}
	} else {
		cmd = fmt.Sprintf("/ip route add dst-address=%s gateway=%s", req.Destination, req.NextHop)
		if req.Preference > 0 {
			cmd += fmt.Sprintf(" distance=%d", req.Preference)
		}
		if req.Description != "" {
			cmd += fmt.Sprintf(" comment=%q", req.Description)
		}
	}

	_, err := d.RunCommand(cmd)
	return err
}

func (d *MikrotikDriver) DeleteStaticRoute(destination, nextHop string) error {
	cmd := ""
	if d.version == 7 {
		if nextHop != "" {
			cmd = fmt.Sprintf("/ip/route/remove [find dst-address=%q and gateway=%q]", destination, nextHop)
		} else {
			cmd = fmt.Sprintf("/ip/route/remove [find dst-address=%q]", destination)
		}
	} else {
		if nextHop != "" {
			cmd = fmt.Sprintf("/ip route remove [find dst-address=%q and gateway=%q]", destination, nextHop)
		} else {
			cmd = fmt.Sprintf("/ip route remove [find dst-address=%q]", destination)
		}
	}

	_, err := d.RunCommand(cmd)
	return err
}

func (d *MikrotikDriver) GetBGPPrepends() (*models.DevicePrependOverview, error) {
	sessions, err := d.GetBGPSessions()
	if err != nil {
		return nil, fmt.Errorf("mikrotik bgp sessions query failed: %w", err)
	}

	filterCmd := "/routing filter print detail without-paging"
	if d.version == 7 {
		filterCmd = "/routing/filter/rule/print detail without-paging"
	}
	filterOutput, _ := d.RunCommand(filterCmd)

	return ParseMikrotikBGPPrepends(filterOutput, sessions, d.device.ID, d.device.Name, d.version), nil
}

func (d *MikrotikDriver) ApplyBGPPrepend(req models.PrependApplyRequest) error {
	if BGPManualExecutionOnly {
		return nil
	}
	if d.version == 7 {
		return d.applyMikrotikV7Prepend(req)
	}
	return d.applyMikrotikV6Prepend(req)
}

func (d *MikrotikDriver) applyMikrotikV6Prepend(req models.PrependApplyRequest) error {
	chain := "BGP-OUT"
	filterOut, _ := d.RunCommand("/routing filter print detail without-paging")
	if strings.Contains(filterOut, "chain=bgp-out") {
		chain = "bgp-out"
	}

	if req.Prefix != "" {
		if req.Block {
			if strings.Contains(filterOut, req.Prefix) {
				_, err := d.RunCommand(fmt.Sprintf(`/routing filter set [find prefix="%s"] action=discard`, req.Prefix))
				if err != nil {
					return fmt.Errorf("mikrotik v6 falha ao descartar prefixo: %w", err)
				}
			} else {
				_, err := d.RunCommand(fmt.Sprintf(`/routing filter add chain=%s prefix=%s action=discard`, chain, req.Prefix))
				if err != nil {
					return fmt.Errorf("mikrotik v6 falha ao adicionar regra de descarte: %w", err)
				}
			}
		} else {
			if strings.Contains(filterOut, req.Prefix) {
				_, err := d.RunCommand(fmt.Sprintf(`/routing filter set [find prefix="%s"] action=accept set-bgp-prepend=%d`, req.Prefix, req.PrependCount))
				if err != nil {
					return fmt.Errorf("mikrotik v6 falha ao ajustar prepend: %w", err)
				}
			} else {
				_, err := d.RunCommand(fmt.Sprintf(`/routing filter add chain=%s prefix=%s action=accept set-bgp-prepend=%d`, chain, req.Prefix, req.PrependCount))
				if err != nil {
					return fmt.Errorf("mikrotik v6 falha ao adicionar regra com prepend: %w", err)
				}
			}
		}
	} else {
		if req.Block {
			_, err := d.RunCommand(fmt.Sprintf(`/routing filter set [find chain="%s"] action=discard`, chain))
			if err != nil {
				return fmt.Errorf("mikrotik v6 falha ao bloquear chain: %w", err)
			}
		} else {
			_, err := d.RunCommand(fmt.Sprintf(`/routing filter set [find chain="%s"] action=accept set-bgp-prepend=%d`, chain, req.PrependCount))
			if err != nil {
				return fmt.Errorf("mikrotik v6 falha ao aplicar prepend na chain: %w", err)
			}
		}
	}

	// Trigger BGP route-refresh soft update
	d.RunCommand("/routing bgp peer refresh-all")
	return nil
}

func (d *MikrotikDriver) applyMikrotikV7Prepend(req models.PrependApplyRequest) error {
	chain := "BGP-OUT"
	filterOut, _ := d.RunCommand("/routing/filter/rule/print detail without-paging")
	if strings.Contains(filterOut, "bgp-out") {
		chain = "bgp-out"
	}

	if req.Prefix != "" {
		ruleMatch := req.Prefix
		if req.Block {
			newRule := fmt.Sprintf("if (dst == %s) { reject; }", req.Prefix)
			if strings.Contains(filterOut, ruleMatch) {
				_, err := d.RunCommand(fmt.Sprintf(`/routing/filter/rule/set [find where rule~"%s"] rule="%s"`, ruleMatch, newRule))
				if err != nil {
					return fmt.Errorf("mikrotik v7 falha ao atualizar regra de bloqueio: %w", err)
				}
			} else {
				_, err := d.RunCommand(fmt.Sprintf(`/routing/filter/rule/add chain=%s rule="%s"`, chain, newRule))
				if err != nil {
					return fmt.Errorf("mikrotik v7 falha ao criar regra de bloqueio: %w", err)
				}
			}
		} else {
			var newRule string
			if req.PrependCount > 0 {
				newRule = fmt.Sprintf("if (dst == %s) { set bgp-path.prepend %d; accept; }", req.Prefix, req.PrependCount)
			} else {
				newRule = fmt.Sprintf("if (dst == %s) { accept; }", req.Prefix)
			}

			if strings.Contains(filterOut, ruleMatch) {
				_, err := d.RunCommand(fmt.Sprintf(`/routing/filter/rule/set [find where rule~"%s"] rule="%s"`, ruleMatch, newRule))
				if err != nil {
					return fmt.Errorf("mikrotik v7 falha ao atualizar prepend: %w", err)
				}
			} else {
				_, err := d.RunCommand(fmt.Sprintf(`/routing/filter/rule/add chain=%s rule="%s"`, chain, newRule))
				if err != nil {
					return fmt.Errorf("mikrotik v7 falha ao criar regra com prepend: %w", err)
				}
			}
		}
	}

	// Trigger BGP route-refresh soft update
	d.RunCommand("/routing/bgp/connection/refresh")
	return nil
}

func (d *MikrotikDriver) GetBGPImportPolicy(peerIP string) (policyName string, node int, localPref int, err error) {
	return "", 0, 100, nil
}

func (d *MikrotikDriver) GetAllBGPImportPolicies() (map[string]models.BGPImportPolicyInfo, error) {
	return make(map[string]models.BGPImportPolicyInfo), nil
}

func (d *MikrotikDriver) SetBGPLocalPreference(req models.LocalPrefApplyRequest) error {
	if req.LocalPref <= 0 {
		return fmt.Errorf("local-preference deve ser um número inteiro positivo")
	}
	// On MikroTik v6:
	// /routing filter add/set ... set-bgp-local-pref=X
	// For now return not supported or configure filter
	return fmt.Errorf("alteração de local-preference via API para MikroTik ainda não configurada")
}


// ParseMikrotikBGPPrepends extracts prepends from MikroTik filters (read-only).
func ParseMikrotikBGPPrepends(filterOutput string, sessions []models.BGPSession, deviceID, deviceName string, version int) *models.DevicePrependOverview {
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

	v6PrependRegex := regexp.MustCompile(`(?i)set-bgp-prepend=(\d+)`)
	v7PrependRegex := regexp.MustCompile(`(?i)set\s+bgp-path-prepend\s+(\d+)`)

	for _, s := range sessions {
		prependCount := 0
		if version == 7 {
			if m := v7PrependRegex.FindStringSubmatch(filterOutput); len(m) > 1 {
				prependCount, _ = strconv.Atoi(m[1])
			}
		} else {
			if m := v6PrependRegex.FindStringSubmatch(filterOutput); len(m) > 1 {
				prependCount, _ = strconv.Atoi(m[1])
			}
		}

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
			PolicyName:   "BGP-OUT",
			IsBlocked:    false,
			Status:       s.State,
		})
	}

	return overview
}

// ParseMikrotikV7BGP parses ROS v7 '/routing/bgp/session/print detail' output.
func ParseMikrotikV7BGP(output, deviceID, deviceName string) []models.BGPSession {
	var sessions []models.BGPSession

	// Blocks in MikroTik detail outputs are separated by item index numbers (e.g. " 0 E name=" or " 1   name=")
	blocks := splitMikrotikBlocks(output)

	nameRegex := regexp.MustCompile(`name="?([^"\s]+)"?`)
	remoteAddrRegex := regexp.MustCompile(`remote\.address=([0-9a-fA-F\.\:]+)`)
	remoteASRegex := regexp.MustCompile(`remote(?:\.address=[^\s]+)?(?:\s+)?\.as=(\d+)|remote\.as=(\d+)`)
	localASRegex := regexp.MustCompile(`local(?:\.address=[^\s]+)?(?:\s+)?\.as=(\d+)|local\.as=(\d+)`)
	stateRegex := regexp.MustCompile(`state="?([A-Za-z\-]+)"?`)
	uptimeRegex := regexp.MustCompile(`uptime="?([^"\s]+)"?`)
	pfxRegex := regexp.MustCompile(`(?:prefix-count|prefixes-received)=(\d+)`)

	for _, block := range blocks {
		remoteAddrMatch := remoteAddrRegex.FindStringSubmatch(block)
		if len(remoteAddrMatch) < 2 {
			continue
		}
		peerIP := remoteAddrMatch[1]

		name := ""
		if m := nameRegex.FindStringSubmatch(block); len(m) > 1 {
			name = m[1]
		}

		remoteAS := ""
		if m := remoteASRegex.FindStringSubmatch(block); len(m) > 1 {
			for i := 1; i < len(m); i++ {
				if m[i] != "" {
					remoteAS = m[i]
					break
				}
			}
		}

		localAS := ""
		if m := localASRegex.FindStringSubmatch(block); len(m) > 1 {
			for i := 1; i < len(m); i++ {
				if m[i] != "" {
					localAS = m[i]
					break
				}
			}
		}

		state := "Unknown"
		if m := stateRegex.FindStringSubmatch(block); len(m) > 1 {
			state = capitalizeState(m[1])
		}

		uptime := "-"
		if m := uptimeRegex.FindStringSubmatch(block); len(m) > 1 {
			uptime = m[1]
		}

		pfxCount := 0
		if m := pfxRegex.FindStringSubmatch(block); len(m) > 1 {
			pfxCount, _ = strconv.Atoi(m[1])
		}

		sessions = append(sessions, models.BGPSession{
			DeviceID:         deviceID,
			DeviceName:       deviceName,
			PeerIP:           peerIP,
			RemoteAS:         remoteAS,
			LocalAS:          localAS,
			State:            state,
			Uptime:           uptime,
			PrefixesReceived: pfxCount,
			Description:      name,
			RawOutput:        strings.TrimSpace(block),
		})
	}

	return sessions
}

// ParseMikrotikV6BGP parses ROS v6 '/routing bgp peer print status' output.
func ParseMikrotikV6BGP(output, deviceID, deviceName string) []models.BGPSession {
	var sessions []models.BGPSession

	blocks := splitMikrotikBlocks(output)

	nameRegex := regexp.MustCompile(`name="?([^"\s]+)"?`)
	remoteAddrRegex := regexp.MustCompile(`remote-address=([0-9a-fA-F\.\:]+)`)
	remoteASRegex := regexp.MustCompile(`remote-as=(\d+)`)
	stateRegex := regexp.MustCompile(`state="?([A-Za-z\-]+)"?`)
	uptimeRegex := regexp.MustCompile(`uptime="?([^"\s]+)"?`)
	pfxRegex := regexp.MustCompile(`prefix-count=(\d+)`)

	for _, block := range blocks {
		remoteAddrMatch := remoteAddrRegex.FindStringSubmatch(block)
		if len(remoteAddrMatch) < 2 {
			continue
		}
		peerIP := remoteAddrMatch[1]

		name := ""
		if m := nameRegex.FindStringSubmatch(block); len(m) > 1 {
			name = m[1]
		}

		remoteAS := ""
		if m := remoteASRegex.FindStringSubmatch(block); len(m) > 1 {
			remoteAS = m[1]
		}

		state := "Unknown"
		if m := stateRegex.FindStringSubmatch(block); len(m) > 1 {
			state = capitalizeState(m[1])
		}

		uptime := "-"
		if m := uptimeRegex.FindStringSubmatch(block); len(m) > 1 {
			uptime = m[1]
		}

		pfxCount := 0
		if m := pfxRegex.FindStringSubmatch(block); len(m) > 1 {
			pfxCount, _ = strconv.Atoi(m[1])
		}

		sessions = append(sessions, models.BGPSession{
			DeviceID:         deviceID,
			DeviceName:       deviceName,
			PeerIP:           peerIP,
			RemoteAS:         remoteAS,
			State:            state,
			Uptime:           uptime,
			PrefixesReceived: pfxCount,
			Description:      name,
			RawOutput:        strings.TrimSpace(block),
		})
	}

	return sessions
}

// ParseMikrotikOSPF parses ROS v6 and v7 OSPF neighbor print output (both tabular and detail formats).
func ParseMikrotikOSPF(output, deviceID, deviceName string) []models.OSPFNeighbor {
	var neighbors []models.OSPFNeighbor

	// Check if this is the key=value (detail) format
	if strings.Contains(output, "router-id=") || strings.Contains(output, "instance=") {
		blocks := splitMikrotikBlocks(output)

		routerIDRegex := regexp.MustCompile(`router-id=([0-9\.]+)`)
		addressRegex := regexp.MustCompile(`address=([0-9a-fA-F\.\:]+)`)
		ifaceRegex := regexp.MustCompile(`interface="?([^"\s]+)"?`)
		areaRegex := regexp.MustCompile(`area="?([^"\s]+)"?`)
		stateRegex := regexp.MustCompile(`state="?([^"\s]+)"?`)
		drRegex := regexp.MustCompile(`dr-(?:address|id)=([0-9\.]+)`)

		for _, block := range blocks {
			rIDMatch := routerIDRegex.FindStringSubmatch(block)
			if len(rIDMatch) < 2 {
				continue
			}
			neighborID := rIDMatch[1]

			ip := neighborID
			if m := addressRegex.FindStringSubmatch(block); len(m) > 1 {
				ip = m[1]
			}

			iface := "-"
			if m := ifaceRegex.FindStringSubmatch(block); len(m) > 1 {
				iface = m[1]
			}

			area := "backbone"
			if m := areaRegex.FindStringSubmatch(block); len(m) > 1 {
				area = m[1]
			}

			state := "Unknown"
			if m := stateRegex.FindStringSubmatch(block); len(m) > 1 {
				state = m[1]
			}

			role := "DROther"
			if m := drRegex.FindStringSubmatch(block); len(m) > 1 {
				if m[1] == neighborID || m[1] == ip {
					role = "DR"
				}
			}

			neighbors = append(neighbors, models.OSPFNeighbor{
				DeviceID:   deviceID,
				DeviceName: deviceName,
				NeighborID: neighborID,
				IP:         ip,
				Interface:  iface,
				Area:       area,
				State:      state,
				Role:       role,
				RawOutput:  strings.TrimSpace(block),
			})
		}
		return neighbors
	}

	// Tabular format from '/routing ospf neighbor print without-paging'
	// Example lines:
	//  # INTERFACE               ROUTER-ID       PRIORITY STATE          STATE-CHANGES ADJACENCY
	//  0 ether1                  10.255.255.1           1 Full                       5 00:05:23
	//  1 ether2-core             10.255.255.2           1 2-Way                      2 00:01:10
	//  2 vlan100                 10.255.255.3           1 Full/DR                    3 01:23:45
	// Or with flags:
	//  0  D ether1               10.255.255.1           1 Full                       5 00:05:23
	lines := strings.Split(output, "\n")
	tableRegex := regexp.MustCompile(`^\s*\d+\s+(?:[A-Z]+\s+)?([a-zA-Z0-9_\-\.\/<]+)\s+([0-9]+\.[0-9]+\.[0-9]+\.[0-9]+)\s+(\d+)\s+([A-Za-z0-9\/\-]+)`)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if strings.HasPrefix(trimmed, "#") || strings.Contains(strings.ToUpper(trimmed), "ROUTER-ID") || strings.HasPrefix(trimmed, "Flags:") {
			continue
		}

		if match := tableRegex.FindStringSubmatch(line); len(match) >= 5 {
			iface := match[1]
			neighborID := match[2]
			stateRaw := match[4]

			state := stateRaw
			role := "DROther"
			if parts := strings.Split(stateRaw, "/"); len(parts) == 2 {
				state = parts[0]
				role = parts[1]
			}

			neighbors = append(neighbors, models.OSPFNeighbor{
				DeviceID:   deviceID,
				DeviceName: deviceName,
				NeighborID: neighborID,
				IP:         neighborID,
				Interface:  iface,
				Area:       "backbone",
				State:      state,
				Role:       role,
				RawOutput:  trimmed,
			})
		}
	}

	return neighbors
}

// splitMikrotikBlocks separates output by numeric item index (e.g. " 0   ..." or " 1 E ...")
func splitMikrotikBlocks(output string) []string {
	re := regexp.MustCompile(`(?m)^\s*\d+\s+`)
	indices := re.FindAllStringIndex(output, -1)
	if len(indices) == 0 {
		return []string{output}
	}

	var blocks []string
	for i := 0; i < len(indices); i++ {
		start := indices[i][0]
		end := len(output)
		if i+1 < len(indices) {
			end = indices[i+1][0]
		}
		blocks = append(blocks, output[start:end])
	}
	return blocks
}

func capitalizeState(s string) string {
	s = strings.TrimSpace(s)
	if strings.EqualFold(s, "established") {
		return "Established"
	}
	if strings.EqualFold(s, "active") {
		return "Active"
	}
	if strings.EqualFold(s, "idle") {
		return "Idle"
	}
	if strings.EqualFold(s, "connect") {
		return "Connect"
	}
	if strings.EqualFold(s, "opensent") {
		return "OpenSent"
	}
	if strings.EqualFold(s, "openconfirm") {
		return "OpenConfirm"
	}
	return strings.Title(strings.ToLower(s))
}

// ParseMikrotikStaticRoutes parses ROS v6 and v7 '/ip route print detail where static' output.
func ParseMikrotikStaticRoutes(output, deviceID, deviceName string) []models.StaticRoute {
	var routes []models.StaticRoute
	blocks := splitMikrotikBlocks(output)

	dstRegex := regexp.MustCompile(`dst-address=([0-9a-fA-F\.\:\/]+)`)
	gwRegex := regexp.MustCompile(`gateway=([^\s]+)`)
	distRegex := regexp.MustCompile(`distance=(\d+)`)
	commentRegex := regexp.MustCompile(`comment="?([^"\r\n]+)"?`)

	for _, block := range blocks {
		dstMatch := dstRegex.FindStringSubmatch(block)
		if len(dstMatch) < 2 {
			continue
		}
		destination := dstMatch[1]

		nextHop := "-"
		if m := gwRegex.FindStringSubmatch(block); len(m) > 1 {
			nextHop = m[1]
		}

		dist := 1
		if m := distRegex.FindStringSubmatch(block); len(m) > 1 {
			dist, _ = strconv.Atoi(m[1])
		}

		comment := ""
		if m := commentRegex.FindStringSubmatch(block); len(m) > 1 {
			comment = strings.TrimSpace(m[1])
		}

		status := "active"
		if strings.Contains(block, "disabled=yes") || strings.Contains(block, " X ") {
			status = "inactive"
		}

		routeID := fmt.Sprintf("rt-%s-%s", strings.ReplaceAll(destination, "/", "_"), nextHop)

		routes = append(routes, models.StaticRoute{
			ID:          routeID,
			DeviceID:    deviceID,
			DeviceName:  deviceName,
			Destination: destination,
			NextHop:     nextHop,
			Preference:  dist,
			Description: comment,
			Status:      status,
			RawOutput:   strings.TrimSpace(block),
		})
	}

	return routes
}

