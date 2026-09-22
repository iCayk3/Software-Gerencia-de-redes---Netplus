package telemetry

import (
	"context"
	"log"
	"sync"
	"time"

	"network-software/internal/models"
	"network-software/internal/storage"
)

// Engine coordinates the collector, detector, syslog server, alerts store and SSE broadcaster.
type Engine struct {
	store        *storage.DeviceStore
	alertStore   *AlertStore
	broadcaster  *Broadcaster
	detector     *Detector
	collector    *Collector
	syslogServer *SyslogServer

	mu                  sync.RWMutex
	running             bool
	pollIntervalSeconds int
	totalCycles         int
	cancelFunc          context.CancelFunc
	manualTrigger       chan struct{}
}

// NewEngine constructs and wires the telemetry system.
func NewEngine(store *storage.DeviceStore, dataDir string, syslogPort int, pollIntervalSec int) (*Engine, error) {
	if pollIntervalSec <= 0 {
		pollIntervalSec = 45 // 45 seconds default
	}

	alertStore, err := NewAlertStore(dataDir)
	if err != nil {
		return nil, err
	}

	broadcaster := NewBroadcaster()
	detector := NewDetector(alertStore, broadcaster)
	collector := NewCollector(store, alertStore, detector, broadcaster)
	syslogServer := NewSyslogServer(syslogPort, store, detector)

	return &Engine{
		store:               store,
		alertStore:          alertStore,
		broadcaster:         broadcaster,
		detector:            detector,
		collector:           collector,
		syslogServer:        syslogServer,
		pollIntervalSeconds: pollIntervalSec,
		manualTrigger:       make(chan struct{}, 1),
	}, nil
}

// Start launches the background polling worker and Syslog UDP server.
func (e *Engine) Start() {
	e.mu.Lock()
	if e.running {
		e.mu.Unlock()
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	e.cancelFunc = cancel
	e.running = true
	e.mu.Unlock()

	// 1. Start Syslog Server (non-blocking)
	if err := e.syslogServer.Start(); err != nil {
		log.Printf("[Telemetry] Warning: Could not start Syslog UDP server: %v", err)
	}

	// 2. Start Polling Loop in background
	go e.loop(ctx)
}

// Stop gracefully terminates the engine.
func (e *Engine) Stop() {
	e.mu.Lock()
	defer e.mu.Unlock()

	if !e.running {
		return
	}

	if e.cancelFunc != nil {
		e.cancelFunc()
	}
	e.syslogServer.Stop()
	e.running = false
}

func (e *Engine) loop(ctx context.Context) {
	ticker := time.NewTicker(time.Duration(e.pollIntervalSeconds) * time.Second)
	defer ticker.Stop()

	// Run initial cycle immediately after 3 seconds to let server finish boot
	select {
	case <-time.After(3 * time.Second):
		e.runSingleCycle(ctx)
	case <-ctx.Done():
		return
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			e.runSingleCycle(ctx)
		case <-e.manualTrigger:
			e.runSingleCycle(ctx)
		}
	}
}

func (e *Engine) runSingleCycle(ctx context.Context) {
	e.collector.RunCycle(ctx)

	e.mu.Lock()
	e.totalCycles++
	e.mu.Unlock()
}

// TriggerManualCycle requests an immediate on-demand reading cycle.
func (e *Engine) TriggerManualCycle() {
	select {
	case e.manualTrigger <- struct{}{}:
	default:
		// Cycle already queued
	}
}

// GetStatus returns the current telemetry engine diagnostic information.
func (e *Engine) GetStatus() models.TelemetryEngineStatus {
	e.mu.RLock()
	defer e.mu.RUnlock()

	lastTime := e.collector.LastCycleTime()
	var nextTime *time.Time
	if lastTime != nil {
		nt := lastTime.Add(time.Duration(e.pollIntervalSeconds) * time.Second)
		nextTime = &nt
	}

	return models.TelemetryEngineStatus{
		Running:             e.running,
		PollIntervalSeconds: e.pollIntervalSeconds,
		LastPollTime:        lastTime,
		NextPollTime:        nextTime,
		TotalCycles:         e.totalCycles,
		ActiveAlertsCount:   len(e.alertStore.GetActiveAlerts()),
		SyslogPort:          e.syslogServer.Port(),
		SyslogActive:        e.syslogServer.IsRunning(),
	}
}

// GetAlertStore exposes the underlying AlertStore.
func (e *Engine) GetAlertStore() *AlertStore {
	return e.alertStore
}

// GetCollector exposes the underlying Collector.
func (e *Engine) GetCollector() *Collector {
	return e.collector
}

// GetBroadcaster exposes the SSE broadcaster.
func (e *Engine) GetBroadcaster() *Broadcaster {
	return e.broadcaster
}

// GetOverview returns aggregate stats.
func (e *Engine) GetOverview() models.TelemetryOverview {
	return e.collector.GetOverview()
}
