package traffic

import (
	"context"
	"fmt"
	"log"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"network-software/internal/drivers"
	"network-software/internal/models"
	"network-software/internal/storage"
)

// Service provides cached and scheduled read-only Traffic Engineering queries.
type Service struct {
	store       *storage.DeviceStore
	asMetaStore *storage.ASMetadataStore

	mu             sync.RWMutex
	staticRoutes   map[string][]models.StaticRoute
	bgpSessions    map[string][]models.BGPSession
	prepends       map[string]*models.DevicePrependOverview
	importPolicies map[string]map[string]models.BGPImportPolicyInfo // deviceID -> peerIP -> info
	lastSyncTime   *time.Time
	nextSyncTime   *time.Time
	cancelFunc     context.CancelFunc
}

// SyncStatus holds metadata about the 24h schedule.
type SyncStatus struct {
	LastSyncTime *time.Time `json:"last_sync_time"`
	NextSyncTime *time.Time `json:"next_sync_time"`
}

// NewService creates a new Traffic Engineering service.
func NewService(store *storage.DeviceStore, asMetaStore *storage.ASMetadataStore) *Service {
	return &Service{
		store:          store,
		asMetaStore:    asMetaStore,
		staticRoutes:   make(map[string][]models.StaticRoute),
		bgpSessions:    make(map[string][]models.BGPSession),
		prepends:       make(map[string]*models.DevicePrependOverview),
		importPolicies: make(map[string]map[string]models.BGPImportPolicyInfo),
	}
}

// Start launches the daily 03:30 AM (madrugada) auto-sync scheduler.
func (s *Service) Start() {
	ctx, cancel := context.WithCancel(context.Background())
	s.cancelFunc = cancel

	now := time.Now()
	next := calculateNextDawn(now, 3, 30) // 03:30 AM
	s.mu.Lock()
	s.nextSyncTime = &next
	s.mu.Unlock()

	go func() {
		// Run initial background sync after 4s of boot to seed cache
		time.Sleep(4 * time.Second)
		s.SyncAll(ctx)

		for {
			now := time.Now()
			nextDawn := calculateNextDawn(now, 3, 30)
			waitDur := nextDawn.Sub(now)

			s.mu.Lock()
			s.nextSyncTime = &nextDawn
			s.mu.Unlock()

			log.Printf("[TrafficSync] Próxima sincronização diária da madrugada agendada para: %s (em %s)",
				nextDawn.Format("02/01/2006 15:04:05"), waitDur.Round(time.Minute))

			select {
			case <-time.After(waitDur):
				log.Printf("[TrafficSync] 🌙 Executando atualização automática diária da madrugada (03:30 AM)...")
				s.SyncAll(ctx)
			case <-ctx.Done():
				return
			}
		}
	}()
}

// Stop terminates background timers.
func (s *Service) Stop() {
	if s.cancelFunc != nil {
		s.cancelFunc()
	}
}

// SyncAll queries all devices and updates the in-memory cache.
func (s *Service) SyncAll(ctx context.Context) {
	devices := s.store.GetAll()
	var wg sync.WaitGroup

	for _, d := range devices {
		select {
		case <-ctx.Done():
			return
		default:
		}

		dev := d
		wg.Add(1)
		go func() {
			defer wg.Done()
			driver, err := drivers.NewDriver(&dev)
			if err != nil {
				return
			}

			// Read static routes (read-only)
			routes, err := driver.GetStaticRoutes()
			if err == nil {
				s.mu.Lock()
				s.staticRoutes[dev.ID] = routes
				s.mu.Unlock()
			}

			// Skip BGP routines if device is not flagged as a BGP router
			if !dev.IsBGP {
				return
			}

			// Read BGP sessions (read-only)
			sessions, err := driver.GetBGPSessions()
			if err == nil && len(sessions) > 0 {
				s.mu.Lock()
				s.bgpSessions[dev.ID] = sessions
				s.mu.Unlock()
			}

			// Read prepends (read-only)
			prepends, err := driver.GetBGPPrepends()
			if err == nil && prepends != nil {
				s.mu.Lock()
				s.prepends[dev.ID] = prepends
				s.mu.Unlock()
			}

			// Read BGP import policies and local-preferences (read-only)
			policies, err := driver.GetAllBGPImportPolicies()
			if err == nil && len(policies) > 0 {
				s.mu.Lock()
				s.importPolicies[dev.ID] = policies
				s.mu.Unlock()
			}
		}()
	}

	wg.Wait()
	now := time.Now()
	s.mu.Lock()
	s.harmonizeASPrependsLocked()
	s.lastSyncTime = &now
	s.mu.Unlock()
	log.Printf("[TrafficSync] ✅ Sincronização da Engenharia de Tráfego concluída. %d dispositivo(s) atualizado(s).", len(devices))
}

// GetStaticRoutes returns cached routes or queries live if fresh=true or not in cache.
func (s *Service) GetStaticRoutes(deviceID string, fresh bool) ([]models.StaticRoute, error) {
	if !fresh {
		s.mu.RLock()
		cached, ok := s.staticRoutes[deviceID]
		s.mu.RUnlock()
		if ok && len(cached) > 0 {
			return cached, nil
		}
	}

	device, err := s.store.GetByID(deviceID)
	if err != nil {
		return nil, err
	}
	driver, err := drivers.NewDriver(device)
	if err != nil {
		return nil, err
	}
	routes, err := driver.GetStaticRoutes()
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	s.staticRoutes[deviceID] = routes
	s.mu.Unlock()
	return routes, nil
}

// GetAllStaticRoutes returns all cached static routes or syncs if empty.
func (s *Service) GetAllStaticRoutes(fresh bool) ([]models.StaticRoute, error) {
	if !fresh {
		s.mu.RLock()
		var all []models.StaticRoute
		for _, rList := range s.staticRoutes {
			all = append(all, rList...)
		}
		s.mu.RUnlock()
		if len(all) > 0 {
			return all, nil
		}
	}

	s.SyncAll(context.Background())
	s.mu.RLock()
	var all []models.StaticRoute
	for _, rList := range s.staticRoutes {
		all = append(all, rList...)
	}
	s.mu.RUnlock()
	return all, nil
}

// GetBGPSessions returns cached sessions or queries live if fresh=true or not in cache.
func (s *Service) GetBGPSessions(deviceID string, fresh bool) ([]models.BGPSession, error) {
	if !fresh {
		s.mu.RLock()
		cached, ok := s.bgpSessions[deviceID]
		s.mu.RUnlock()
		if ok && len(cached) > 0 {
			return cached, nil
		}
	}

	device, err := s.store.GetByID(deviceID)
	if err != nil {
		return nil, err
	}
	driver, err := drivers.NewDriver(device)
	if err != nil {
		return nil, err
	}
	sessions, err := driver.GetBGPSessions()
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	s.bgpSessions[deviceID] = sessions
	s.mu.Unlock()
	return sessions, nil
}

// GetPrepends returns cached prepends or queries live if fresh=true or not in cache.
func (s *Service) GetPrepends(deviceID string, fresh bool) (*models.DevicePrependOverview, error) {
	if !fresh {
		s.mu.RLock()
		cached, ok := s.prepends[deviceID]
		s.mu.RUnlock()
		if ok && cached != nil {
			return cached, nil
		}
	}

	device, err := s.store.GetByID(deviceID)
	if err != nil {
		return nil, err
	}
	driver, err := drivers.NewDriver(device)
	if err != nil {
		return nil, err
	}
	prepends, err := driver.GetBGPPrepends()
	if err != nil {
		return nil, err
	}

	s.mu.Lock()
	s.prepends[deviceID] = prepends
	s.harmonizeASPrependsLocked()
	res := s.prepends[deviceID]
	s.mu.Unlock()
	return res, nil
}

// GetAllPrepends returns all cached prepends or syncs if empty for BGP-enabled devices.
func (s *Service) GetAllPrepends(fresh bool) ([]models.DevicePrependOverview, error) {
	bgpDevices := make([]models.Device, 0)
	for _, d := range s.store.GetAll() {
		if d.IsBGP {
			bgpDevices = append(bgpDevices, d)
		}
	}

	if fresh {
		for _, d := range bgpDevices {
			_, _ = s.GetPrepends(d.ID, true)
		}
	} else {
		// Check if we have prepends in cache for all BGP devices
		s.mu.RLock()
		missingAny := false
		for _, d := range bgpDevices {
			if _, ok := s.prepends[d.ID]; !ok {
				missingAny = true
				break
			}
		}
		s.mu.RUnlock()
		if missingAny {
			s.SyncAll(context.Background())
		}
	}

	s.mu.Lock()
	s.harmonizeASPrependsLocked()
	all := make([]models.DevicePrependOverview, 0)
	for _, d := range bgpDevices {
		if p, ok := s.prepends[d.ID]; ok && p != nil {
			all = append(all, *p)
		}
	}
	s.mu.Unlock()
	return all, nil
}

// GetUploadOverview builds the smart Traffic Engineering sections grouped by BGP AS.
func (s *Service) GetUploadOverview(filterDeviceID string, fresh bool) (*models.UploadOverviewResponse, error) {
	var targetDevices []models.Device

	if filterDeviceID != "" && filterDeviceID != "all" {
		dev, err := s.store.GetByID(filterDeviceID)
		if err != nil {
			return nil, err
		}
		targetDevices = append(targetDevices, *dev)
	} else {
		for _, d := range s.store.GetAll() {
			if d.IsBGP {
				targetDevices = append(targetDevices, d)
			}
		}
	}

	sections := make([]models.BGPASSection, 0)
	matchedRouteIDs := make(map[string]bool)
	allRoutes := make([]models.StaticRoute, 0)

	for _, d := range targetDevices {
		dev := d
		routes, _ := s.GetStaticRoutes(dev.ID, fresh)
		allRoutes = append(allRoutes, routes...)

		sessions, _ := s.GetBGPSessions(dev.ID, fresh)
		prepends, _ := s.GetPrepends(dev.ID, fresh)

		// Map peer names from prepends config if available
		peerNames := make(map[string]string)
		if prepends != nil {
			for _, p := range prepends.Peers {
				if p.PeerName != "" {
					peerNames[p.PeerIP] = p.PeerName
				}
			}
		}

		driver, _ := drivers.NewDriver(&dev)

		// Read cached import policies for this device, or query once if missing/fresh
		s.mu.RLock()
		devImportPolicies, hasImportCache := s.importPolicies[dev.ID]
		s.mu.RUnlock()

		if (!hasImportCache || fresh) && driver != nil {
			if pols, err := driver.GetAllBGPImportPolicies(); err == nil && len(pols) > 0 {
				s.mu.Lock()
				s.importPolicies[dev.ID] = pols
				s.mu.Unlock()
				devImportPolicies = pols
			}
		}

		// Build sections for each BGP session
		for _, sess := range sessions {
			remoteAS := strings.TrimSpace(sess.RemoteAS)
			if remoteAS == "" || remoteAS == "0" {
				continue
			}

			peerName := sess.Description
			if peerName == "" {
				peerName = peerNames[sess.PeerIP]
			}
			if peerName == "" {
				peerName = "BGP-AS" + remoteAS
			}

			importPolicy, policyNode, localPref := "", 11, 100
			if devImportPolicies != nil {
				if info, ok := devImportPolicies[sess.PeerIP]; ok {
					importPolicy = info.PolicyName
					policyNode = info.Node
					localPref = info.LocalPref
				}
			}

			// Look up AS metadata
			var meta models.ASMetadata
			if s.asMetaStore != nil {
				if m, ok := s.asMetaStore.GetByASN(remoteAS); ok {
					meta = m
				}
			}

			// Smart defaults if metadata not yet customized by user
			if meta.ASN == "" {
				meta.ASN = remoteAS
			}
			if meta.Alias == "" {
				meta.Alias = cleanPeerDescription(peerName, remoteAS)
			}
			if meta.Role == "" {
				meta.Role = deduceRole(meta.Alias, peerName, remoteAS)
			}

			// Find static routes matching this AS / Next-Hop
			matchedRoutes := make([]models.StaticRoute, 0)
			for _, r := range routes {
				if r.DeviceID != dev.ID {
					continue
				}

				// Check next-hop match or custom gateway or ASN tag in description
				isMatch := (r.NextHop == sess.PeerIP) ||
					(meta.CustomGateway != "" && r.NextHop == meta.CustomGateway) ||
					(strings.Contains(strings.ToUpper(r.Description), "AS"+remoteAS))

				if isMatch {
					matchedRoutes = append(matchedRoutes, r)
					matchedRouteIDs[r.ID] = true
				}
			}

			secID := fmt.Sprintf("%s_%s_%s", dev.ID, remoteAS, sess.PeerIP)
			sections = append(sections, models.BGPASSection{
				ID:               secID,
				DeviceID:         dev.ID,
				DeviceName:       dev.Name,
				DeviceHost:       dev.Host,
				DeviceVendor:     string(dev.Vendor),
				RemoteAS:         remoteAS,
				LocalAS:          sess.LocalAS,
				PeerIP:           sess.PeerIP,
				PeerName:         peerName,
				BGPState:         sess.State,
				Uptime:           sess.Uptime,
				PrefixesReceived: sess.PrefixesReceived,
				LocalPref:        localPref,
				ImportPolicy:     importPolicy,
				ImportPolicyNode: policyNode,
				Metadata:         meta,
				StaticRoutes:     matchedRoutes,
			})
		}
	}

	// Any routes not matched to any BGP session section
	otherRoutes := make([]models.StaticRoute, 0)
	for _, r := range allRoutes {
		if !matchedRouteIDs[r.ID] {
			otherRoutes = append(otherRoutes, r)
		}
	}

	s.mu.RLock()
	lastSync := s.lastSyncTime
	s.mu.RUnlock()

	return &models.UploadOverviewResponse{
		Sections:     sections,
		OtherRoutes:  otherRoutes,
		LastSyncTime: lastSync,
	}, nil
}

// InvalidateDevice clears the cache for a device.
func (s *Service) InvalidateDevice(deviceID string) {
	s.mu.Lock()
	delete(s.staticRoutes, deviceID)
	delete(s.bgpSessions, deviceID)
	delete(s.prepends, deviceID)
	delete(s.importPolicies, deviceID)
	s.mu.Unlock()
}

// ApplyPrepend applies AS-Path Prepending or selective blocking on a router and invalidates cache.
func (s *Service) ApplyPrepend(req models.PrependApplyRequest) error {
	device, err := s.store.GetByID(req.DeviceID)
	if err != nil {
		return fmt.Errorf("dispositivo não encontrado: %w", err)
	}

	driver, err := drivers.NewDriver(device)
	if err != nil {
		return fmt.Errorf("erro ao inicializar driver: %w", err)
	}

	if err := driver.ApplyBGPPrepend(req); err != nil {
		return err
	}

	// Invalidate prepend cache for this device so fresh live state will be queried
	s.mu.Lock()
	delete(s.prepends, req.DeviceID)
	s.mu.Unlock()

	return nil
}

// SetBGPLocalPreference applies generic BGP local-preference on a peer/AS through its driver.
func (s *Service) SetBGPLocalPreference(req models.LocalPrefApplyRequest) error {
	device, err := s.store.GetByID(req.DeviceID)
	if err != nil {
		return fmt.Errorf("dispositivo não encontrado: %w", err)
	}

	driver, err := drivers.NewDriver(device)
	if err != nil {
		return fmt.Errorf("erro ao inicializar driver: %w", err)
	}

	if err := driver.SetBGPLocalPreference(req); err != nil {
		return err
	}

	// Update in-memory cache directly for immediate UI reflection
	s.mu.Lock()
	if devPolicies, ok := s.importPolicies[req.DeviceID]; ok {
		info, exists := devPolicies[req.PeerIP]
		if !exists {
			info = models.BGPImportPolicyInfo{PolicyName: req.PolicyName, Node: req.Node, LocalPref: req.LocalPref}
		} else {
			info.LocalPref = req.LocalPref
			if req.PolicyName != "" {
				info.PolicyName = req.PolicyName
			}
			if req.Node != 0 {
				info.Node = req.Node
			}
		}
		devPolicies[req.PeerIP] = info
	}
	s.mu.Unlock()

	return nil
}

// GetSyncStatus returns metadata about the schedule.
func (s *Service) GetSyncStatus() SyncStatus {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return SyncStatus{
		LastSyncTime: s.lastSyncTime,
		NextSyncTime: s.nextSyncTime,
	}
}

func calculateNextDawn(now time.Time, hour, minute int) time.Time {
	next := time.Date(now.Year(), now.Month(), now.Day(), hour, minute, 0, 0, now.Location())
	if !next.After(now) {
		next = next.Add(24 * time.Hour)
	}
	return next
}

func cleanPeerDescription(raw, asn string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "AS " + asn
	}
	s := strings.TrimPrefix(raw, "BGP-")
	s = strings.TrimPrefix(s, "bgp-")
	s = strings.TrimSuffix(s, "-IPV4")
	s = strings.TrimSuffix(s, "-ipv4")
	s = strings.TrimSuffix(s, "-V4")
	s = strings.ReplaceAll(s, "-", " ")
	s = strings.ReplaceAll(s, "_", " ")
	s = strings.TrimSpace(s)
	if strings.EqualFold(s, "SEA") {
		return "SEA Telecom"
	}
	if strings.Contains(strings.ToUpper(s), "PTT") && strings.Contains(strings.ToUpper(s), "BRASILIA") {
		return strings.ReplaceAll(strings.ToUpper(s), "PTT BRASILIA", "PTT Brasília")
	}
	if s == "" {
		return "AS " + asn
	}
	return s
}

func deduceRole(alias, peerName, asn string) string {
	combined := strings.ToLower(alias + " " + peerName)
	if strings.Contains(combined, "ptt") || strings.Contains(combined, "ix") {
		return "ix_ptt"
	}
	if strings.Contains(combined, "bkp") || strings.Contains(combined, "backup") || strings.Contains(combined, "sec") {
		return "transit_secondary"
	}
	if strings.Contains(combined, "cdn") || strings.Contains(combined, "peer") {
		return "peering"
	}
	return "transit_primary"
}

// harmonizeASPrependsLocked ensures all routers within the same LocalAS share knowledge of all announced AS prefixes
// and their origin community tags (e.g. routes originated on BGP1 and propagated via iBGP to BGP2).
func (s *Service) harmonizeASPrependsLocked() {
	type asData struct {
		prefixes    []string
		seenPrefix  map[string]bool
		communities map[string]string // prefix -> master community string
	}
	asInfo := make(map[string]*asData)

	// 1. Collect all distinct announced prefixes and community mappings per LocalAS
	for _, ov := range s.prepends {
		if ov == nil || ov.LocalAS == "" {
			continue
		}
		data, ok := asInfo[ov.LocalAS]
		if !ok {
			data = &asData{
				seenPrefix:  make(map[string]bool),
				communities: make(map[string]string),
			}
			asInfo[ov.LocalAS] = data
		}

		// Collect from ASGroups
		for _, grp := range ov.ASGroups {
			for _, p := range grp.Prefixes {
				if p.Prefix != "" && !data.seenPrefix[p.Prefix] {
					data.seenPrefix[p.Prefix] = true
					data.prefixes = append(data.prefixes, p.Prefix)
				}
				if p.Prefix != "" && p.Community != "" {
					if existing, exists := data.communities[p.Prefix]; !exists || len(p.Community) > len(existing) {
						data.communities[p.Prefix] = p.Community
					}
				}
			}
		}

		// Collect from Prefixes (flat list)
		for _, p := range ov.Prefixes {
			if p.Prefix != "" && !data.seenPrefix[p.Prefix] {
				data.seenPrefix[p.Prefix] = true
				data.prefixes = append(data.prefixes, p.Prefix)
			}
			if p.Prefix != "" && p.Community != "" {
				if existing, exists := data.communities[p.Prefix]; !exists || len(p.Community) > len(existing) {
					data.communities[p.Prefix] = p.Community
				}
			}
		}
	}

	// Sort prefixes in logical CIDR order: /22, then /23s, then /24s
	for _, data := range asInfo {
		sortPrefixList(data.prefixes)
	}

	// 2. Propagate missing prefixes to every router in the LocalAS
	for _, ov := range s.prepends {
		if ov == nil || ov.LocalAS == "" {
			continue
		}
		data, ok := asInfo[ov.LocalAS]
		if !ok || len(data.prefixes) == 0 {
			continue
		}

		// A. Enrich ASGroups
		for gIdx := range ov.ASGroups {
			grp := &ov.ASGroups[gIdx]
			grpPrefixMap := make(map[string]int)
			for pIdx, p := range grp.Prefixes {
				grpPrefixMap[p.Prefix] = pIdx
			}

			for _, pfx := range data.prefixes {
				commStr := data.communities[pfx]
				if pIdx, exists := grpPrefixMap[pfx]; exists {
					// Update community and prepend if missing or more detailed
					existing := &grp.Prefixes[pIdx]
					if (existing.Community == "" || existing.Community == "-" || len(commStr) > len(existing.Community)) && commStr != "" {
						existing.Community = commStr
					}
					if grp.CommunityBase != "" && existing.Community != "" {
						calculatePrependState(existing, grp.CommunityBase)
					}
				} else {
					// Add missing prefix to this AS Group
					pState := models.PrefixPrependState{
						ID:           fmt.Sprintf("grp-pfx-%s-%s-%s", ov.DeviceID, grp.CommunityBase, strings.ReplaceAll(pfx, "/", "_")),
						DeviceID:     ov.DeviceID,
						DeviceName:   ov.DeviceName,
						Prefix:       pfx,
						PeerIP:       strings.Join(grp.PeerIPs, ", "),
						PeerName:     grp.GroupName,
						PrependCount: 0,
						IsBlocked:    false,
						Community:    commStr,
						PolicyName:   fmt.Sprintf("Base %s (%s)", grp.CommunityBase, grp.GroupName),
					}
					if grp.CommunityBase != "" {
						calculatePrependState(&pState, grp.CommunityBase)
					}
					grp.Prefixes = append(grp.Prefixes, pState)
				}
			}

			// Re-sort grp.Prefixes to match logical order
			orderMap := make(map[string]int)
			for idx, pfx := range data.prefixes {
				orderMap[pfx] = idx
			}
			sort.SliceStable(grp.Prefixes, func(i, j int) bool {
				return orderMap[grp.Prefixes[i].Prefix] < orderMap[grp.Prefixes[j].Prefix]
			})
		}

		// B. Enrich flat Prefixes list for external peers
		existingFlatMap := make(map[string]bool)
		for _, p := range ov.Prefixes {
			existingFlatMap[fmt.Sprintf("%s_%s", p.Prefix, p.PeerIP)] = true
		}

		for _, peer := range ov.Peers {
			if peer.RemoteAS == ov.LocalAS {
				continue
			}
			base := drivers.DetermineHuaweiPeerCommunityBase(peer.PeerIP, peer.RemoteAS, peer.PeerName, peer.PolicyName)
			for _, pfx := range data.prefixes {
				key := fmt.Sprintf("%s_%s", pfx, peer.PeerIP)
				if !existingFlatMap[key] {
					commStr := data.communities[pfx]
					pState := models.PrefixPrependState{
						ID:           fmt.Sprintf("pfx-%s-%s-%s", ov.DeviceID, strings.ReplaceAll(pfx, "/", "_"), peer.PeerIP),
						DeviceID:     ov.DeviceID,
						DeviceName:   ov.DeviceName,
						Prefix:       pfx,
						PeerIP:       peer.PeerIP,
						PeerName:     peer.PeerName,
						PrependCount: 0,
						IsBlocked:    peer.IsBlocked,
						PolicyName:   peer.PolicyName,
						Community:    commStr,
					}
					if base != "" {
						calculatePrependState(&pState, base)
					}
					ov.Prefixes = append(ov.Prefixes, pState)
					existingFlatMap[key] = true
				}
			}
		}
	}
}

func calculatePrependState(pState *models.PrefixPrependState, base string) {
	if base == "" || pState.Community == "" {
		return
	}
	if strings.Contains(pState.Community, fmt.Sprintf("1:%s1", base)) {
		pState.PrependCount = 1
		pState.IsBlocked = false
	} else if strings.Contains(pState.Community, fmt.Sprintf("1:%s2", base)) {
		pState.PrependCount = 2
		pState.IsBlocked = false
	} else if strings.Contains(pState.Community, fmt.Sprintf("1:%s3", base)) {
		pState.PrependCount = 3
		pState.IsBlocked = false
	} else if strings.Contains(pState.Community, fmt.Sprintf("0:%s0", base)) || strings.Contains(pState.Community, "0:10000") {
		pState.IsBlocked = true
	} else if strings.Contains(pState.Community, fmt.Sprintf("1:%s0", base)) {
		pState.PrependCount = 0
		pState.IsBlocked = false
	}
}

func parsePrefixSortKey(pfx string) (maskLen int, ipNum uint32) {
	parts := strings.Split(pfx, "/")
	if len(parts) == 2 {
		if m, err := strconv.Atoi(parts[1]); err == nil {
			maskLen = m
		}
	}
	ipStr := parts[0]
	octets := strings.Split(ipStr, ".")
	if len(octets) == 4 {
		b0, _ := strconv.Atoi(octets[0])
		b1, _ := strconv.Atoi(octets[1])
		b2, _ := strconv.Atoi(octets[2])
		b3, _ := strconv.Atoi(octets[3])
		ipNum = uint32(b0)<<24 | uint32(b1)<<16 | uint32(b2)<<8 | uint32(b3)
	}
	return maskLen, ipNum
}

func sortPrefixList(list []string) {
	sort.SliceStable(list, func(i, j int) bool {
		maskI, ipI := parsePrefixSortKey(list[i])
		maskJ, ipJ := parsePrefixSortKey(list[j])
		if maskI != maskJ {
			return maskI < maskJ
		}
		return ipI < ipJ
	})
}
