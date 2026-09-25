package bmp

import (
	"fmt"
	"io"
	"log"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"network-software/internal/models"
	"network-software/internal/storage"
)

// Server coordinates the TCP listener for BMP (RFC 7854) connections.
type Server struct {
	port  int
	store *storage.DeviceStore

	mu            sync.RWMutex
	listener      net.Listener
	running       bool
	stopChan      chan struct{}
	clients       map[string]*BMPClientInfo // keyed by RemoteAddr
	peers         map[string]*BMPPeerState  // keyed by "routerIP:peerIP"
	recentEvents  []BMPEvent
	maxEvents     int
	totalMessages uint64
	totalRoutes   uint64
	churnTracker  *ChurnTracker

	// Event hooks
	onPeerUp      func(event BMPEvent)
	onPeerDown    func(event BMPEvent)
	onRouteChange func(event BMPEvent)
}

// NewServer initializes a new BMP server.
func NewServer(port int, store *storage.DeviceStore) *Server {
	if port <= 0 {
		port = 11019 // Standard IANA BMP port
	}
	return &Server{
		port:         port,
		store:        store,
		stopChan:     make(chan struct{}),
		clients:      make(map[string]*BMPClientInfo),
		peers:        make(map[string]*BMPPeerState),
		recentEvents: make([]BMPEvent, 0, 150),
		maxEvents:    150,
		churnTracker: NewChurnTracker(),
	}
}

// GetChurnRanking returns the BGP churn and peer instability ranking.
func (s *Server) GetChurnRanking() ChurnRankingResponse {
	if s.churnTracker == nil {
		return ChurnRankingResponse{AverageStability: 100.0}
	}
	return s.churnTracker.GetRanking()
}

// SetHooks configures lifecycle event listeners for BMP telemetry.
func (s *Server) SetHooks(onPeerUp, onPeerDown, onRouteChange func(event BMPEvent)) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.onPeerUp = onPeerUp
	s.onPeerDown = onPeerDown
	s.onRouteChange = onRouteChange
}

// Start begins listening on TCP port for BMP exporters.
func (s *Server) Start() error {
	s.mu.Lock()
	if s.running {
		s.mu.Unlock()
		return nil
	}

	addr := fmt.Sprintf("0.0.0.0:%d", s.port)
	l, err := net.Listen("tcp", addr)
	if err != nil {
		s.mu.Unlock()
		return fmt.Errorf("failed to bind BMP TCP port %d: %w", s.port, err)
	}

	s.listener = l
	s.running = true
	s.stopChan = make(chan struct{})
	s.mu.Unlock()

	log.Printf("[BMP] 🚀 BMP Universal Collector listening on TCP port %d (RFC 7854)", s.port)

	go s.acceptLoop()
	return nil
}

// Stop gracefully shuts down the BMP listener and active connections.
func (s *Server) Stop() {
	s.mu.Lock()
	defer s.mu.Unlock()

	if !s.running {
		return
	}

	s.running = false
	if s.listener != nil {
		_ = s.listener.Close()
	}
	close(s.stopChan)
	log.Printf("[BMP] BMP Server stopped.")
}

func (s *Server) acceptLoop() {
	for {
		conn, err := s.listener.Accept()
		if err != nil {
			select {
			case <-s.stopChan:
				return
			default:
				log.Printf("[BMP] Accept error: %v", err)
				return
			}
		}

		go s.handleConnection(conn)
	}
}

func (s *Server) handleConnection(conn net.Conn) {
	defer conn.Close()

	remoteAddr := conn.RemoteAddr().String()
	routerIP, _, _ := net.SplitHostPort(remoteAddr)

	clientInfo := &BMPClientInfo{
		RemoteAddr:   remoteAddr,
		RouterIP:     routerIP,
		ConnectedAt:  time.Now(),
		LastActivity: time.Now(),
	}

	// Correlate with inventory
	s.correlateDevice(clientInfo)

	s.mu.Lock()
	s.clients[remoteAddr] = clientInfo
	s.mu.Unlock()

	log.Printf("[BMP] 📡 New BMP router connected from %s (Identified: %s [%s])",
		remoteAddr, clientInfo.DeviceName, clientInfo.Vendor)

	defer func() {
		s.mu.Lock()
		delete(s.clients, remoteAddr)
		s.mu.Unlock()
		log.Printf("[BMP] BMP router %s disconnected", remoteAddr)
	}()

	hdrBuf := make([]byte, 6)

	for {
		// 1. Read 6-byte common header
		_, err := io.ReadFull(conn, hdrBuf)
		if err != nil {
			if err != io.EOF && !strings.Contains(err.Error(), "closed") {
				log.Printf("[BMP] Read header error from %s: %v", remoteAddr, err)
			}
			return
		}

		hdr, err := ParseCommonHeader(hdrBuf)
		if err != nil {
			log.Printf("[BMP] Bad header from %s: %v", remoteAddr, err)
			return
		}

		// 2. Read message payload
		payloadLen := int(hdr.Length - 6)
		payload := make([]byte, payloadLen)
		if payloadLen > 0 {
			_, err = io.ReadFull(conn, payload)
			if err != nil {
				log.Printf("[BMP] Incomplete payload from %s: %v", remoteAddr, err)
				return
			}
		}

		s.mu.Lock()
		s.totalMessages++
		clientInfo.MessagesReceived++
		clientInfo.LastActivity = time.Now()
		s.mu.Unlock()

		s.processMessage(clientInfo, hdr.MsgType, payload)
	}
}

func (s *Server) correlateDevice(client *BMPClientInfo) {
	if s.store == nil {
		return
	}

	devices := s.store.GetAll()
	for _, d := range devices {
		if d.Host == client.RouterIP || (client.SysName != "" && strings.EqualFold(d.Name, client.SysName)) {
			client.DeviceID = d.ID
			client.DeviceName = d.Name
			client.Vendor = string(d.Vendor)
			return
		}
	}
}

func (s *Server) processMessage(client *BMPClientInfo, msgType uint8, payload []byte) {
	switch msgType {
	case MsgInitiation:
		sysName, sysDescr, _ := ParseInitiation(payload)
		s.mu.Lock()
		if sysName != "" {
			client.SysName = sysName
		}
		if sysDescr != "" {
			client.SysDescr = sysDescr
		}
		s.correlateDevice(client)
		s.mu.Unlock()
		log.Printf("[BMP] Initiation from %s: sysName='%s' sysDescr='%s'", client.RemoteAddr, sysName, sysDescr)

	case MsgPeerUp:
		if len(payload) < 42 {
			return
		}
		pph, err := ParsePerPeerHeader(payload[0:42])
		if err != nil {
			return
		}
		upData, _ := ParsePeerUp(payload[42:], pph)

		now := time.Now()
		peerKey := fmt.Sprintf("%s:%s", client.RouterIP, pph.PeerAddress)

		s.mu.Lock()
		peer, exists := s.peers[peerKey]
		if !exists {
			peer = &BMPPeerState{
				PeerIP:     pph.PeerAddress,
				RemoteAS:   pph.PeerAS,
				RouterID:   pph.PeerBGPID,
				RouterIP:   client.RouterIP,
				RouterName: client.DeviceName,
				DeviceID:   client.DeviceID,
			}
			s.peers[peerKey] = peer
		}

		peer.State = "Established"
		peer.RemoteAS = pph.PeerAS
		peer.LocalAS = upData.LocalAS
		peer.LocalAddr = upData.LocalAddr
		peer.RouterID = pph.PeerBGPID
		peer.RouterIP = client.RouterIP
		peer.RouterName = client.DeviceName
		peer.DeviceID = client.DeviceID
		peer.EstablishedAt = &now
		peer.DownAt = nil
		peer.DownReason = ""
		peer.LastUpdate = now

		client.PeersCount = s.countRouterPeers(client.RouterIP)

		event := BMPEvent{
			ID:         fmt.Sprintf("bmp-%d", time.Now().UnixNano()),
			Timestamp:  now,
			RouterIP:   client.RouterIP,
			RouterName: client.DeviceName,
			DeviceID:   client.DeviceID,
			PeerIP:     pph.PeerAddress,
			RemoteAS:   pph.PeerAS,
			EventType:  "peer_up",
			Details:    fmt.Sprintf("Sessão BGP estabelecida com peer %s (AS %d) via BMP", pph.PeerAddress, pph.PeerAS),
		}
		s.addEventLocked(event)
		hook := s.onPeerUp
		s.mu.Unlock()

		log.Printf("[BMP] 🟢 Peer UP: %s (AS %d) no roteador %s (%s)",
			pph.PeerAddress, pph.PeerAS, client.DeviceName, client.RouterIP)

		if hook != nil {
			hook(event)
		}

	case MsgPeerDown:
		if len(payload) < 42 {
			return
		}
		pph, err := ParsePerPeerHeader(payload[0:42])
		if err != nil {
			return
		}
		downData, _ := ParsePeerDown(payload[42:])

		now := time.Now()
		peerKey := fmt.Sprintf("%s:%s", client.RouterIP, pph.PeerAddress)

		s.mu.Lock()
		peer, exists := s.peers[peerKey]
		if !exists {
			peer = &BMPPeerState{
				PeerIP:     pph.PeerAddress,
				RemoteAS:   pph.PeerAS,
				RouterIP:   client.RouterIP,
				RouterName: client.DeviceName,
				DeviceID:   client.DeviceID,
			}
			s.peers[peerKey] = peer
		}

		peer.State = "Down"
		peer.DownAt = &now
		peer.DownReason = downData.ReasonDesc
		peer.LastUpdate = now

		event := BMPEvent{
			ID:         fmt.Sprintf("bmp-%d", time.Now().UnixNano()),
			Timestamp:  now,
			RouterIP:   client.RouterIP,
			RouterName: client.DeviceName,
			DeviceID:   client.DeviceID,
			PeerIP:     pph.PeerAddress,
			RemoteAS:   pph.PeerAS,
			EventType:  "peer_down",
			Reason:     downData.ReasonDesc,
			Details:    fmt.Sprintf("Sessão BGP caiu com peer %s (AS %d): %s", pph.PeerAddress, pph.PeerAS, downData.ReasonDesc),
		}
		s.addEventLocked(event)
		hook := s.onPeerDown
		s.mu.Unlock()

		log.Printf("[BMP] 🔴 Peer DOWN: %s (AS %d) no roteador %s: %s",
			pph.PeerAddress, pph.PeerAS, client.DeviceName, downData.ReasonDesc)

		if hook != nil {
			hook(event)
		}

	case MsgRouteMonitoring:
		if len(payload) < 42 {
			return
		}
		pph, err := ParsePerPeerHeader(payload[0:42])
		if err != nil {
			return
		}
		rmData, err := ParseRouteMonitoring(payload[42:])
		if err != nil {
			return
		}

		now := time.Now()
		peerKey := fmt.Sprintf("%s:%s", client.RouterIP, pph.PeerAddress)

		s.mu.Lock()
		peer, exists := s.peers[peerKey]
		if !exists {
			peer = &BMPPeerState{
				PeerIP:     pph.PeerAddress,
				RemoteAS:   pph.PeerAS,
				RouterID:   pph.PeerBGPID,
				RouterIP:   client.RouterIP,
				RouterName: client.DeviceName,
				DeviceID:   client.DeviceID,
				State:      "Established",
			}
			s.peers[peerKey] = peer
		}

		peer.TotalAnnounced += rmData.AnnouncedCount
		peer.TotalWithdrawn += rmData.WithdrawnCount
		s.totalRoutes += uint64(rmData.AnnouncedCount)

		if pph.IsPostPolicy {
			peer.PostPolicyPrefixes += rmData.AnnouncedCount - rmData.WithdrawnCount
			if peer.PostPolicyPrefixes < 0 {
				peer.PostPolicyPrefixes = 0
			}
		} else {
			peer.PrePolicyPrefixes += rmData.AnnouncedCount - rmData.WithdrawnCount
			if peer.PrePolicyPrefixes < 0 {
				peer.PrePolicyPrefixes = 0
			}
		}

		peer.LastUpdate = now

		if s.churnTracker != nil {
			s.churnTracker.RecordUpdate(client.RouterIP, client.DeviceName, pph.PeerAddress, peer.PeerName, pph.PeerAS, rmData.AnnouncedCount, rmData.WithdrawnCount, now)
		}

		var event *BMPEvent
		if rmData.AnnouncedCount > 0 || rmData.WithdrawnCount > 0 {
			event = &BMPEvent{
				ID:         fmt.Sprintf("bmp-%d", time.Now().UnixNano()),
				Timestamp:  now,
				RouterIP:   client.RouterIP,
				RouterName: client.DeviceName,
				DeviceID:   client.DeviceID,
				PeerIP:     pph.PeerAddress,
				RemoteAS:   pph.PeerAS,
				EventType:  "route_update",
				Details: fmt.Sprintf("+%d anúncios, -%d retiradas (AS-Path: %s, NextHop: %s)",
					rmData.AnnouncedCount, rmData.WithdrawnCount, rmData.ASPath, rmData.NextHop),
			}
			s.addEventLocked(*event)
		}
		hook := s.onRouteChange
		s.mu.Unlock()

		if event != nil && hook != nil {
			hook(*event)
		}

	case MsgStatisticsReport:
		if len(payload) < 42 {
			return
		}
		pph, err := ParsePerPeerHeader(payload[0:42])
		if err != nil {
			return
		}
		statsData, err := ParseStatsReport(payload[42:])
		if err != nil {
			return
		}

		peerKey := fmt.Sprintf("%s:%s", client.RouterIP, pph.PeerAddress)
		s.mu.Lock()
		if peer, exists := s.peers[peerKey]; exists {
			peer.RejectedPrefixes = int(statsData.RejectedByInboundPolicy)
			if statsData.RoutesInAdjRIBIn > 0 {
				peer.PrePolicyPrefixes = int(statsData.RoutesInAdjRIBIn)
			}
			if statsData.RoutesInLocRIB > 0 {
				peer.PostPolicyPrefixes = int(statsData.RoutesInLocRIB)
			}
		}
		s.mu.Unlock()

	case MsgTermination:
		log.Printf("[BMP] Router %s terminated BMP session", client.RemoteAddr)
	}
}

func (s *Server) countRouterPeers(routerIP string) int {
	cnt := 0
	for _, p := range s.peers {
		if p.RouterIP == routerIP {
			cnt++
		}
	}
	return cnt
}

func (s *Server) addEventLocked(event BMPEvent) {
	if len(s.recentEvents) >= s.maxEvents {
		s.recentEvents = s.recentEvents[1:]
	}
	s.recentEvents = append(s.recentEvents, event)
}

// HasActiveSession checks if a device has an active BMP connection.
func (s *Server) HasActiveSession(host, name string) bool {
	s.mu.RLock()
	defer s.mu.RUnlock()

	for _, c := range s.clients {
		if c.RouterIP == host || (name != "" && strings.EqualFold(c.DeviceName, name)) || (name != "" && strings.EqualFold(c.SysName, name)) {
			return true
		}
	}
	return false
}

// GetDeviceBGPSessions returns normalized BGPSession structs for a device populated via BMP telemetry.
func (s *Server) GetDeviceBGPSessions(devID, devName, host string) []models.BGPSession {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var sessions []models.BGPSession
	now := time.Now()

	for _, p := range s.peers {
		match := false
		if p.DeviceID != "" && p.DeviceID == devID {
			match = true
		} else if p.RouterIP == host {
			match = true
		} else if devName != "" && strings.EqualFold(p.RouterName, devName) {
			match = true
		}

		if match {
			uptime := "00:00:00"
			if p.EstablishedAt != nil {
				dur := now.Sub(*p.EstablishedAt)
				uptime = formatDuration(dur)
			}

			pfx := p.PostPolicyPrefixes
			if pfx == 0 && p.PrePolicyPrefixes > 0 {
				pfx = p.PrePolicyPrefixes
			}

			sessions = append(sessions, models.BGPSession{
				DeviceID:           devID,
				DeviceName:         devName,
				PeerIP:             p.PeerIP,
				RemoteAS:           strconv.FormatUint(uint64(p.RemoteAS), 10),
				LocalAS:            strconv.FormatUint(uint64(p.LocalAS), 10),
				State:              p.State,
				Uptime:             uptime,
				PrefixesReceived:   pfx,
				TelemetrySource:    "bmp",
				PrePolicyPrefixes:  p.PrePolicyPrefixes,
				PostPolicyPrefixes: p.PostPolicyPrefixes,
				RejectedPrefixes:   p.RejectedPrefixes,
				RouterID:           p.RouterID,
				LastUpdate:         p.LastUpdate.Format(time.RFC3339),
			})
		}
	}

	return sessions
}

// GetAllBGPSessions returns all BGP sessions monitored via BMP across all devices.
func (s *Server) GetAllBGPSessions() []models.BGPSession {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var sessions []models.BGPSession
	now := time.Now()

	for _, p := range s.peers {
		uptime := "00:00:00"
		if p.EstablishedAt != nil {
			dur := now.Sub(*p.EstablishedAt)
			uptime = formatDuration(dur)
		}

		pfx := p.PostPolicyPrefixes
		if pfx == 0 && p.PrePolicyPrefixes > 0 {
			pfx = p.PrePolicyPrefixes
		}

		name := p.RouterName
		if name == "" {
			name = p.RouterIP
		}

		sessions = append(sessions, models.BGPSession{
			DeviceID:           p.DeviceID,
			DeviceName:         name,
			PeerIP:             p.PeerIP,
			RemoteAS:           strconv.FormatUint(uint64(p.RemoteAS), 10),
			LocalAS:            strconv.FormatUint(uint64(p.LocalAS), 10),
			State:              p.State,
			Uptime:             uptime,
			PrefixesReceived:   pfx,
			TelemetrySource:    "bmp",
			PrePolicyPrefixes:  p.PrePolicyPrefixes,
			PostPolicyPrefixes: p.PostPolicyPrefixes,
			RejectedPrefixes:   p.RejectedPrefixes,
			RouterID:           p.RouterID,
			LastUpdate:         p.LastUpdate.Format(time.RFC3339),
		})
	}

	return sessions
}

// GetStatus returns the operational summary of the BMP server.
func (s *Server) GetStatus() BMPStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()

	estCount := 0
	downCount := 0
	for _, p := range s.peers {
		if strings.EqualFold(p.State, "Established") {
			estCount++
		} else {
			downCount++
		}
	}

	clientsList := make([]BMPClientInfo, 0, len(s.clients))
	for _, c := range s.clients {
		clientsList = append(clientsList, *c)
	}

	return BMPStatus{
		Running:             s.running,
		Port:                s.port,
		ConnectedRouters:    len(s.clients),
		TotalPeersMonitored: len(s.peers),
		EstablishedPeers:    estCount,
		DownPeers:           downCount,
		TotalMessagesParsed: s.totalMessages,
		TotalRoutesReceived: s.totalRoutes,
		Clients:             clientsList,
	}
}

// GetRecentEvents returns the latest event buffer.
func (s *Server) GetRecentEvents(limit int) []BMPEvent {
	s.mu.RLock()
	defer s.mu.RUnlock()

	if limit <= 0 || limit > len(s.recentEvents) {
		limit = len(s.recentEvents)
	}

	res := make([]BMPEvent, limit)
	start := len(s.recentEvents) - limit
	for i := 0; i < limit; i++ {
		// Return newest first
		res[i] = s.recentEvents[len(s.recentEvents)-1-i]
	}
	_ = start
	return res
}

// GetPeers returns the detailed state of all peers tracked via BMP.
func (s *Server) GetPeers() []BMPPeerState {
	s.mu.RLock()
	defer s.mu.RUnlock()

	res := make([]BMPPeerState, 0, len(s.peers))
	now := time.Now()
	for _, p := range s.peers {
		cp := *p
		if cp.EstablishedAt != nil {
			cp.Uptime = formatDuration(now.Sub(*cp.EstablishedAt))
		}
		res = append(res, cp)
	}
	return res
}

// Port returns the listening TCP port.
func (s *Server) Port() int {
	return s.port
}

// IsRunning reports whether the BMP server is active.
func (s *Server) IsRunning() bool {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.running
}

func formatDuration(d time.Duration) string {
	days := int(d.Hours()) / 24
	hours := int(d.Hours()) % 24
	minutes := int(d.Minutes()) % 60
	seconds := int(d.Seconds()) % 60

	if days > 0 {
		return fmt.Sprintf("%dd %02dh %02dm", days, hours, minutes)
	}
	return fmt.Sprintf("%02d:%02d:%02d", hours, minutes, seconds)
}
