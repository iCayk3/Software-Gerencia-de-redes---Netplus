package telemetry

import (
	"fmt"
	"log"
	"net"
	"regexp"
	"strings"
	"sync"

	"network-software/internal/models"
	"network-software/internal/storage"
)

var (
	// Huawei BGP PEER_STATE_CHG (VRP8 / VRP5 NE40, NE8000, CloudEngine, etc.):
	// Example: <190>Sep 22 2026 14:16:58 BGP-RT.02.PA.PMVR.01 %%01BGP/6/PEER_STATE_CHG(l):CID=0x801304ef;The state of the peer changed after receiving an event. (PrevState=OPENCONFIRM, CurrState=ESTABLISHED, InputEvent=RECV_KA, Peer=45.68.79.253, SourceInterface=-, VpnInstance=_public_)
	huaweiPeerStateChgRegex = regexp.MustCompile(`(?i)(?:%%\d+)?BGP\/\d+\/PEER_STATE_CHG.*?PrevState=([A-Za-z0-9_]+),\s*CurrState=([A-Za-z0-9_]+),\s*InputEvent=([A-Za-z0-9_]+),\s*Peer=((?:\d{1,3}\.){3}\d{1,3}|[0-9a-fA-F:]{3,})`)

	// Huawei BGP ADJCHANGE:
	// Example: %BGP/5/ADJCHANGE: neighbor 192.168.1.1 Down (HoldTimer expired)
	huaweiBGPRegex = regexp.MustCompile(`(?i)(?:%%\d+)?BGP\/\d+\/ADJCHANGE.*?neighbor\s+((?:\d{1,3}\.){3}\d{1,3}|[0-9a-fA-F:]+)\s+(Down|Up|Established)(?:\s*\((.*?)\))?`)

	// Huawei OSPF:
	huaweiOSPFRegex = regexp.MustCompile(`(?i)(?:%%\d+)?OSPF\/\d+\/(?:ADJCHANGE|NBR_CHG_REASON).*?neighbor\s+((?:\d{1,3}\.){3}\d{1,3})\s+.*?state\s+([A-Za-z0-9]+)`)

	// Datacom DmOS regex:
	// Example: %ROUTING-BGP-5-PEER_DOWN: Peer 192.168.1.1 is Down
	datacomBGPRegex = regexp.MustCompile(`(?i)PEER_(DOWN|UP).*?Peer\s+((?:\d{1,3}\.){3}\d{1,3}|[0-9a-fA-F:]+)`)

	// Cisco IOS / IOS-XR regex:
	// Example: %BGP-5-ADJCHANGE: neighbor 192.168.1.1 Up
	// Example: %ROUTING-BGP-5-ADJCHANGE: neighbor 192.168.1.1 Down BGP Notification sent
	ciscoBGPRegex = regexp.MustCompile(`(?i)%?(?:ROUTING-)?BGP-\d+-ADJCHANGE\s*:?\s*neighbor\s+((?:\d{1,3}\.){3}\d{1,3}|[0-9a-fA-F:]+)\s+(Down|Up)(?:\s+(.*))?`)

	// MikroTik regex (strict IP matching to avoid capturing words like "peer changed"):
	// Example: bgp,connection,error remote 192.168.1.1: session terminated
	// Example: bgp,connection,info remote 192.168.1.1: established
	mikrotikBGPRegex = regexp.MustCompile(`(?i)\bbgp[,\s].*?(?:remote|peer)\s+((?:\d{1,3}\.){3}\d{1,3}|[0-9a-fA-F:]{4,}).*?\b(terminated|down|established|error)\b`)

	// Hostname extraction from Syslog headers:
	// Huawei: <189>Sep 22 2026 02:59:43 BGP-RT.01.PA.PIRB.01 %%01CLI...
	huaweiHostnameRegex  = regexp.MustCompile(`<\d+>.*?\s+([A-Za-z0-9_\.\-]+)\s+%%`)
	genericHostnameRegex = regexp.MustCompile(`<\d+>(?:[A-Za-z]{3}\s+\d+\s+[\d\:]+\s+)?([A-Za-z0-9_\.\-]+)[\s\:]`)
)

// SyslogServer listens for UDP Syslog packets from network routers and switches.
type SyslogServer struct {
	port     int
	store    *storage.DeviceStore
	detector *Detector

	mu       sync.Mutex
	conn     *net.UDPConn
	running  bool
	stopChan chan struct{}
}

// NewSyslogServer initializes a UDP Syslog listener.
func NewSyslogServer(port int, store *storage.DeviceStore, detector *Detector) *SyslogServer {
	if port <= 0 {
		port = 1514
	}
	return &SyslogServer{
		port:     port,
		store:    store,
		detector: detector,
		stopChan: make(chan struct{}),
	}
}

// Start begins listening on the configured UDP port.
func (s *SyslogServer) Start() error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return nil
	}

	addr := net.UDPAddr{
		Port: s.port,
		IP:   net.ParseIP("0.0.0.0"),
	}

	conn, err := net.ListenUDP("udp", &addr)
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("failed to bind UDP syslog port %d: %w", s.port, err)
	}

	s.conn = conn
	s.running = true
	s.stopChan = make(chan struct{})
	s.mu.Unlock()

	log.Printf("[Syslog] Listening for network events on UDP port %d", s.port)

	go s.listenLoop()
	return nil
}

// Stop terminates the UDP listener.
func (s *SyslogServer) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}
	s.running = false
	close(s.stopChan)
	if s.conn != nil {
		_ = s.conn.Close()
	}
}

// Port returns the active UDP port.
func (s *SyslogServer) Port() int {
	return s.port
}

// IsRunning reports whether the listener is active.
func (s *SyslogServer) IsRunning() bool {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.running
}

func (s *SyslogServer) listenLoop() {
	buf := make([]byte, 4096)

	for {
		n, remoteAddr, err := s.conn.ReadFromUDP(buf)
		if err != nil {
			s.mu.Lock()
			running := s.running
			s.mu.Unlock()
			if !running {
				return
			}
			continue
		}

		if n > 0 {
			msg := string(buf[:n])
			s.handleMessage(remoteAddr.IP.String(), msg)
		}
	}
}

func (s *SyslogServer) handleMessage(remoteIP, rawMsg string) {
	trimmed := strings.TrimSpace(rawMsg)
	headerHostname := extractSyslogHostname(trimmed)

	// 1. Match device by Host IP
	devices := s.store.GetAll()
	var matchedDevice *models.Device
	for _, d := range devices {
		if d.Host == remoteIP {
			matchedDevice = &d
			break
		}
	}

	// 2. If not matched by IP (e.g. device registered with Loopback IP, but sent from physical interface),
	// match by hostname extracted from syslog message
	if matchedDevice == nil && headerHostname != "" {
		for _, d := range devices {
			if strings.EqualFold(d.Name, headerHostname) ||
				strings.Contains(strings.ToLower(headerHostname), strings.ToLower(d.Name)) ||
				strings.Contains(strings.ToLower(d.Name), strings.ToLower(headerHostname)) {
				matchedDevice = &d
				break
			}
		}
	}

	devID := "unknown"
	devName := fmt.Sprintf("IP %s", remoteIP)
	if matchedDevice != nil {
		devID = matchedDevice.ID
		if headerHostname != "" && !strings.EqualFold(matchedDevice.Name, headerHostname) {
			devName = fmt.Sprintf("%s [%s] (%s)", matchedDevice.Name, headerHostname, remoteIP)
		} else {
			devName = fmt.Sprintf("%s (%s)", matchedDevice.Name, remoteIP)
		}
	} else if headerHostname != "" {
		devName = fmt.Sprintf("%s (%s)", headerHostname, remoteIP)
	}

	log.Printf("[Syslog UDP] Pacote recebido de %s (%s): %s", remoteIP, devName, trimmed)

	// 1. Huawei BGP PEER_STATE_CHG (VRP8 / VRP5)
	if match := huaweiPeerStateChgRegex.FindStringSubmatch(trimmed); len(match) > 4 {
		prevState := strings.ToUpper(strings.TrimSpace(match[1]))
		currState := strings.ToUpper(strings.TrimSpace(match[2]))
		event := strings.TrimSpace(match[3])
		peerIP := strings.TrimSpace(match[4])

		severity := models.SeverityWarning
		icon := "🟡"
		title := fmt.Sprintf("Sessão BGP em Negociação (%s)", currState)
		if currState == "ESTABLISHED" {
			severity = models.SeverityInfo
			icon = "🟢"
			title = "Sessão BGP Estabelecida (ESTABLISHED)"
		} else if currState == "IDLE" || currState == "DOWN" {
			severity = models.SeverityCritical
			icon = "🔴"
			title = "Queda de Sessão BGP (DOWN/IDLE)"
		}

		eventDesc := translateBGPInputEvent(event)
		target := fmt.Sprintf("Peer %s", peerIP)
		message := fmt.Sprintf("%s [Huawei BGP] %s\nPeer: %s | Transição: %s ➔ %s | Evento: %s (%s)",
			icon, title, peerIP, prevState, currState, eventDesc, event)

		s.detector.RecordSyslogAlert(
			devID,
			devName,
			string(models.AlertSyslogEvent),
			severity,
			target,
			message,
		)
		return
	}

	// 2. Huawei BGP ADJCHANGE
	if match := huaweiBGPRegex.FindStringSubmatch(trimmed); len(match) > 2 {
		peerIP := match[1]
		state := match[2]
		reason := ""
		if len(match) > 3 && match[3] != "" {
			reason = fmt.Sprintf(" | Motivo: %s", strings.TrimSpace(match[3]))
		}

		severity := models.SeverityCritical
		icon := "🔴"
		title := "Queda de Sessão BGP"
		if strings.EqualFold(state, "Up") || strings.EqualFold(state, "Established") {
			severity = models.SeverityInfo
			icon = "🟢"
			title = "Sessão BGP Estabelecida"
		}

		s.detector.RecordSyslogAlert(
			devID,
			devName,
			string(models.AlertSyslogEvent),
			severity,
			fmt.Sprintf("Peer %s", peerIP),
			fmt.Sprintf("%s [Huawei BGP] %s com %s (%s)%s", icon, title, peerIP, state, reason),
		)
		return
	}

	// 3. Huawei OSPF
	if match := huaweiOSPFRegex.FindStringSubmatch(trimmed); len(match) > 2 {
		nbr := match[1]
		state := match[2]
		severity := models.SeverityWarning
		icon := "🟡"
		if strings.EqualFold(state, "Full") || strings.EqualFold(state, "2Way") {
			severity = models.SeverityInfo
			icon = "🟢"
		}

		s.detector.RecordSyslogAlert(
			devID,
			devName,
			string(models.AlertSyslogEvent),
			severity,
			fmt.Sprintf("OSPF Neighbor %s", nbr),
			fmt.Sprintf("%s [Huawei OSPF] Vizinho OSPF %s mudou para '%s'", icon, nbr, state),
		)
		return
	}

	// 4. Cisco IOS / IOS-XR BGP
	if match := ciscoBGPRegex.FindStringSubmatch(trimmed); len(match) > 2 {
		peerIP := match[1]
		state := match[2]
		detail := ""
		if len(match) > 3 && match[3] != "" {
			detail = fmt.Sprintf(" | Detalhe: %s", strings.TrimSpace(match[3]))
		}

		severity := models.SeverityCritical
		icon := "🔴"
		title := "Queda de Sessão BGP"
		if strings.EqualFold(state, "Up") || strings.EqualFold(state, "Established") {
			severity = models.SeverityInfo
			icon = "🟢"
			title = "Sessão BGP Estabelecida"
		}

		s.detector.RecordSyslogAlert(
			devID,
			devName,
			string(models.AlertSyslogEvent),
			severity,
			fmt.Sprintf("Peer %s", peerIP),
			fmt.Sprintf("%s [Cisco BGP] %s com %s (%s)%s", icon, title, peerIP, state, detail),
		)
		return
	}

	// 5. Datacom BGP
	if match := datacomBGPRegex.FindStringSubmatch(trimmed); len(match) > 2 {
		action := strings.ToUpper(match[1])
		peerIP := match[2]
		severity := models.SeverityCritical
		icon := "🔴"
		title := "Queda de Sessão BGP"
		if action == "UP" {
			severity = models.SeverityInfo
			icon = "🟢"
			title = "Sessão BGP Estabelecida"
		}

		s.detector.RecordSyslogAlert(
			devID,
			devName,
			string(models.AlertSyslogEvent),
			severity,
			fmt.Sprintf("Peer %s", peerIP),
			fmt.Sprintf("%s [Datacom BGP] %s com %s", icon, title, peerIP),
		)
		return
	}

	// 6. MikroTik BGP
	if match := mikrotikBGPRegex.FindStringSubmatch(trimmed); len(match) > 2 {
		peerIP := match[1]
		statusText := strings.ToLower(match[2])
		severity := models.SeverityWarning
		icon := "🟡"
		title := fmt.Sprintf("Evento BGP (%s)", statusText)

		if strings.Contains(statusText, "down") || strings.Contains(statusText, "terminated") || strings.Contains(statusText, "error") {
			severity = models.SeverityCritical
			icon = "🔴"
			title = fmt.Sprintf("Queda de Sessão BGP (%s)", strings.ToUpper(statusText))
		} else if strings.Contains(statusText, "established") {
			severity = models.SeverityInfo
			icon = "🟢"
			title = "Sessão BGP Estabelecida (ESTABLISHED)"
		}

		s.detector.RecordSyslogAlert(
			devID,
			devName,
			string(models.AlertSyslogEvent),
			severity,
			fmt.Sprintf("Peer %s", peerIP),
			fmt.Sprintf("%s [MikroTik BGP] %s no peer %s", icon, title, peerIP),
		)
		return
	}
}

// translateBGPInputEvent translates BGP finite state machine input events into clear Portuguese.
func translateBGPInputEvent(event string) string {
	switch strings.ToUpper(strings.TrimSpace(event)) {
	case "RECV_KA":
		return "Keepalive recebido (Sessão Saudável)"
	case "RECV_OPEN":
		return "Mensagem Open recebida"
	case "TCP_FAIL":
		return "Falha na conexão TCP (Enlace ou Roteador Inacessível)"
	case "HOLDTIMER_EXPIRED", "HOLD_TIMER_EXPIRE", "HOLDTIMER":
		return "Hold-Timer expirado (Sem resposta do Peer)"
	case "NOTIFICATION_RECV":
		return "Notificação de erro recebida do peer"
	case "NOTIFICATION_SENT":
		return "Notificação de erro enviada ao peer"
	case "ADMIN_DOWN", "CEASE":
		return "Desconexão administrativa manual"
	case "START":
		return "Início de tentativa de conexão"
	case "CONNECT_RETRY":
		return "Temporizador de reconexão disparado"
	default:
		return event
	}
}

// extractSyslogHostname extracts the router's hostname from syslog headers.
func extractSyslogHostname(rawMsg string) string {
	if m := huaweiHostnameRegex.FindStringSubmatch(rawMsg); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	if m := genericHostnameRegex.FindStringSubmatch(rawMsg); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

