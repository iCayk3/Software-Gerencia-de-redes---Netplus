package telemetry

import (
	"context"
	"log"
	"strings"
	"sync"
	"time"

	"network-software/internal/drivers"
	"network-software/internal/models"
	"network-software/internal/storage"
)

// Collector performs scheduled or on-demand data collection across network devices.
type Collector struct {
	store       *storage.DeviceStore
	alertStore  *AlertStore
	detector    *Detector
	broadcaster *Broadcaster

	mu              sync.RWMutex
	cachedBGP       map[string][]models.BGPSession
	cachedOSPF      map[string][]models.OSPFNeighbor
	latestSnapshots map[string]models.TelemetrySnapshot
	lastCycleTime   *time.Time
}

// NewCollector initializes the telemetry collector.
func NewCollector(
	store *storage.DeviceStore,
	alertStore *AlertStore,
	detector *Detector,
	broadcaster *Broadcaster,
) *Collector {
	return &Collector{
		store:           store,
		alertStore:      alertStore,
		detector:        detector,
		broadcaster:     broadcaster,
		cachedBGP:       make(map[string][]models.BGPSession),
		cachedOSPF:      make(map[string][]models.OSPFNeighbor),
		latestSnapshots: make(map[string]models.TelemetrySnapshot),
	}
}

// RunCycle executes a full reading cycle across all registered devices.
func (c *Collector) RunCycle(ctx context.Context) {
	devices := c.store.GetAll()
	if len(devices) == 0 {
		now := time.Now()
		c.mu.Lock()
		c.lastCycleTime = &now
		c.mu.Unlock()
		return
	}

	var wg sync.WaitGroup
	// Limit concurrency to 5 devices at a time to prevent port/CPU exhaustion
	sem := make(chan struct{}, 5)

	for _, d := range devices {
		select {
		case <-ctx.Done():
			return
		default:
		}

		dev := d
		wg.Add(1)
		sem <- struct{}{}

		go func() {
			defer wg.Done()
			defer func() { <-sem }()

			c.collectDevice(dev)
		}()
	}

	wg.Wait()

	now := time.Now()
	c.mu.Lock()
	c.lastCycleTime = &now
	c.mu.Unlock()

	// Broadcast completion event to SSE clients
	c.broadcaster.Broadcast("telemetry_cycle", map[string]interface{}{
		"timestamp":    now,
		"devices_poll": len(devices),
	})
}

func (c *Collector) collectDevice(dev models.Device) {
	driver, err := drivers.NewDriver(&dev)
	if err != nil {
		c.detector.EvaluateDeviceReachability(dev, false, err.Error())
		c.store.UpdateStatus(dev.ID, "offline")
		return
	}

	testResult, err := driver.TestConnection()
	if err != nil || !testResult.Success {
		errDetail := ""
		if err != nil {
			errDetail = err.Error()
		} else if testResult.Error != "" {
			errDetail = testResult.Error
		}
		c.detector.EvaluateDeviceReachability(dev, false, errDetail)
		c.store.UpdateStatus(dev.ID, "offline")

		c.mu.Lock()
		c.latestSnapshots[dev.ID] = models.TelemetrySnapshot{
			Timestamp:  time.Now(),
			DeviceID:   dev.ID,
			DeviceName: dev.Name,
			Online:     false,
			LatencyMs:  testResult.LatencyMs,
		}
		c.mu.Unlock()
		return
	}

	// Device is reachable
	c.store.UpdateStatus(dev.ID, "online")
	c.detector.EvaluateDeviceReachability(dev, true, "")

	// 1. Collect BGP (only if device is flagged as BGP router)
	var currBGP []models.BGPSession
	if dev.IsBGP {
		bgpSessions, err := driver.GetBGPSessions()
		if err != nil {
			log.Printf("[Collector] Warning: BGP fetch error on %s: %v", dev.Name, err)
		} else {
			currBGP = bgpSessions
		}
	}

	// 2. Collect OSPF
	var currOSPF []models.OSPFNeighbor
	ospfNeighbors, err := driver.GetOSPFNeighbors()
	if err != nil {
		log.Printf("[Collector] Warning: OSPF fetch error on %s: %v", dev.Name, err)
	} else {
		currOSPF = ospfNeighbors
	}

	// Retrieve previous BGP sessions for comparison
	c.mu.RLock()
	prevBGP := c.cachedBGP[dev.ID]
	c.mu.RUnlock()

	// 3. Run Detection rules
	if dev.IsBGP && (len(currBGP) > 0 || len(prevBGP) > 0) {
		c.detector.EvaluateBGPSessions(dev.ID, dev.Name, currBGP, prevBGP)
	}
	if len(currOSPF) > 0 {
		c.detector.EvaluateOSPFNeighbors(dev.ID, dev.Name, currOSPF)
	}

	// 4. Compute Metrics for Snapshot
	bgpEstablished := 0
	bgpDown := 0
	totalPrefixes := 0
	for _, s := range currBGP {
		if strings.EqualFold(s.State, "Established") {
			bgpEstablished++
		} else {
			bgpDown++
		}
		totalPrefixes += s.PrefixesReceived
	}

	ospfEstablished := 0
	ospfDown := 0
	for _, n := range currOSPF {
		if strings.EqualFold(n.State, "Full") || strings.EqualFold(n.State, "2-Way") {
			ospfEstablished++
		} else {
			ospfDown++
		}
	}

	snap := models.TelemetrySnapshot{
		Timestamp:         time.Now(),
		DeviceID:          dev.ID,
		DeviceName:        dev.Name,
		Online:            true,
		LatencyMs:         testResult.LatencyMs,
		BGPPeerCount:      len(currBGP),
		BGPEstablished:    bgpEstablished,
		BGPDown:           bgpDown,
		TotalPrefixes:     totalPrefixes,
		OSPFNeighborCount: len(currOSPF),
		OSPFEstablished:   ospfEstablished,
		OSPFDown:          ospfDown,
	}

	// 5. Update Cache & AlertStore
	c.mu.Lock()
	c.cachedBGP[dev.ID] = currBGP
	c.cachedOSPF[dev.ID] = currOSPF
	c.latestSnapshots[dev.ID] = snap
	c.mu.Unlock()

	c.alertStore.AddSnapshot(snap)
}

// GetCachedBGP returns cached BGP sessions for a device.
func (c *Collector) GetCachedBGP(deviceID string) ([]models.BGPSession, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	sessions, ok := c.cachedBGP[deviceID]
	return sessions, ok
}

// GetAllCachedBGP returns all cached BGP sessions across all devices.
func (c *Collector) GetAllCachedBGP() []models.BGPSession {
	c.mu.RLock()
	defer c.mu.RUnlock()

	var result []models.BGPSession
	for _, sessions := range c.cachedBGP {
		result = append(result, sessions...)
	}
	return result
}

// GetCachedOSPF returns cached OSPF neighbors for a device.
func (c *Collector) GetCachedOSPF(deviceID string) ([]models.OSPFNeighbor, bool) {
	c.mu.RLock()
	defer c.mu.RUnlock()

	neighbors, ok := c.cachedOSPF[deviceID]
	return neighbors, ok
}

// GetAllCachedOSPF returns all cached OSPF neighbors across all devices.
func (c *Collector) GetAllCachedOSPF() []models.OSPFNeighbor {
	c.mu.RLock()
	defer c.mu.RUnlock()

	var result []models.OSPFNeighbor
	for _, neighbors := range c.cachedOSPF {
		result = append(result, neighbors...)
	}
	return result
}

// GetOverview computes an aggregate summary of the entire network.
func (c *Collector) GetOverview() models.TelemetryOverview {
	c.mu.RLock()
	defer c.mu.RUnlock()

	devices := c.store.GetAll()
	onlineDevs := 0
	offlineDevs := 0

	for _, d := range devices {
		if d.Status == "online" {
			onlineDevs++
		} else {
			offlineDevs++
		}
	}

	totalBGP := 0
	estBGP := 0
	downBGP := 0
	totalPfx := 0

	for _, sessions := range c.cachedBGP {
		for _, s := range sessions {
			totalBGP++
			if strings.EqualFold(s.State, "Established") {
				estBGP++
			} else {
				downBGP++
			}
			totalPfx += s.PrefixesReceived
		}
	}

	totalOSPF := 0
	fullOSPF := 0
	downOSPF := 0

	for _, neighbors := range c.cachedOSPF {
		for _, n := range neighbors {
			totalOSPF++
			if strings.EqualFold(n.State, "Full") || strings.EqualFold(n.State, "2-Way") {
				fullOSPF++
			} else {
				downOSPF++
			}
		}
	}

	activeAlerts := len(c.alertStore.GetActiveAlerts())

	lastUp := time.Now()
	if c.lastCycleTime != nil {
		lastUp = *c.lastCycleTime
	}

	return models.TelemetryOverview{
		TotalDevices:       len(devices),
		OnlineDevices:      onlineDevs,
		OfflineDevices:     offlineDevs,
		TotalBGPPeers:      totalBGP,
		EstablishedBGP:     estBGP,
		DownBGP:            downBGP,
		TotalPrefixes:      totalPfx,
		TotalOSPFNeighbors: totalOSPF,
		FullOSPF:           fullOSPF,
		DownOSPF:           downOSPF,
		ActiveAlertsCount:  activeAlerts,
		LastUpdated:        lastUp,
		RecentSnapshots:    c.alertStore.GetSnapshots(30),
	}
}

// LastCycleTime returns the timestamp of the most recent collection run.
func (c *Collector) LastCycleTime() *time.Time {
	c.mu.RLock()
	defer c.mu.RUnlock()
	return c.lastCycleTime
}
