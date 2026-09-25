package bmp

import (
	"sort"
	"sync"
	"time"
)

// ChurnBucket represents an aggregated time window of route fluctuations.
type ChurnBucket struct {
	Timestamp time.Time `json:"timestamp"`
	Withdrawn int       `json:"withdrawn"`
	Announced int       `json:"announced"`
}

// PeerChurnMetrics tracks fluctuations and stability for a specific BGP peer.
type PeerChurnMetrics struct {
	PeerIP         string        `json:"peer_ip"`
	RouterIP       string        `json:"router_ip"`
	RouterName     string        `json:"router_name"`
	PeerName       string        `json:"peer_name"`
	RemoteAS       uint32        `json:"remote_as"`
	Withdrawn1h    int           `json:"withdrawn_1h"`
	Announced1h    int           `json:"announced_1h"`
	Withdrawn24h   int           `json:"withdrawn_24h"`
	Announced24h   int           `json:"announced_24h"`
	TotalFlaps     int           `json:"total_flaps"`
	StabilityScore float64       `json:"stability_score"` // 0.0 to 100.0%
	Status         string        `json:"status"`          // "stable", "moderate_churn", "high_churn", "critical_flapping"
	History1h      []ChurnBucket `json:"history_1h"`
	LastFlap       *time.Time    `json:"last_flap,omitempty"`
	LastUpdate     time.Time     `json:"last_update"`

	// Internal bucket ring: 12 buckets of 5 minutes = 60 minutes
	buckets1h [12]int
	// Internal bucket ring for 24h: 24 buckets of 1 hour = 24 hours
	buckets24h [24]int
}

// ChurnRankingResponse represents the system-wide BGP Churn analysis response.
type ChurnRankingResponse struct {
	LastCalculated    time.Time          `json:"last_calculated"`
	TotalWithdrawn1h  int                `json:"total_withdrawn_1h"`
	TotalAnnounced1h  int                `json:"total_announced_1h"`
	AverageStability  float64            `json:"average_stability"`
	TopChurners       []PeerChurnMetrics `json:"top_churners"`
	TimelineAggregate []ChurnBucket      `json:"timeline_aggregate"`
}

// ChurnTracker manages time-bucketed route fluctuations per BGP peer.
type ChurnTracker struct {
	mu    sync.RWMutex
	peers map[string]*PeerChurnMetrics // Key: routerIP:peerIP
}

// NewChurnTracker initializes a new thread-safe BGP churn tracker.
func NewChurnTracker() *ChurnTracker {
	return &ChurnTracker{
		peers: make(map[string]*PeerChurnMetrics),
	}
}

// RecordUpdate logs announced and withdrawn route events for a peer.
func (ct *ChurnTracker) RecordUpdate(routerIP, routerName, peerIP, peerName string, remoteAS uint32, announced, withdrawn int, t time.Time) {
	if t.IsZero() {
		t = time.Now()
	}

	key := routerIP + ":" + peerIP

	ct.mu.Lock()
	defer ct.mu.Unlock()

	p, exists := ct.peers[key]
	if !exists {
		p = &PeerChurnMetrics{
			PeerIP:         peerIP,
			RouterIP:       routerIP,
			RouterName:     routerName,
			PeerName:       peerName,
			RemoteAS:       remoteAS,
			StabilityScore: 100.0,
			Status:         "stable",
			History1h:      make([]ChurnBucket, 0, 12),
		}
		ct.peers[key] = p
	}

	if peerName != "" && p.PeerName == "" {
		p.PeerName = peerName
	}
	if routerName != "" && p.RouterName == "" {
		p.RouterName = routerName
	}

	p.LastUpdate = t
	if withdrawn > 0 {
		p.TotalFlaps += withdrawn
		p.LastFlap = &t
	}

	// Update sliding window totals
	p.Withdrawn1h += withdrawn
	p.Announced1h += announced
	p.Withdrawn24h += withdrawn
	p.Announced24h += announced

	// Record in active 5-min bucket (modulo 12)
	bucketIdx := (t.Minute() / 5) % 12
	p.buckets1h[bucketIdx] += withdrawn

	// Recalculate stability score (100% base, penalty per withdrawn/flaps in 1h)
	// Up to 10 withdrawns: score remains ~95-100%
	// 50 withdrawns: score ~80%
	// 200+ withdrawns: score drops below 50%
	penalty := float64(p.Withdrawn1h) * 0.4
	if penalty > 100.0 {
		penalty = 100.0
	}
	p.StabilityScore = 100.0 - penalty
	if p.StabilityScore < 0 {
		p.StabilityScore = 0
	}

	if p.StabilityScore >= 95.0 {
		p.Status = "stable"
	} else if p.StabilityScore >= 80.0 {
		p.Status = "moderate_churn"
	} else if p.StabilityScore >= 50.0 {
		p.Status = "high_churn"
	} else {
		p.Status = "critical_flapping"
	}
}

// GetRanking calculates and returns the ranked list of top churn peers.
func (ct *ChurnTracker) GetRanking() ChurnRankingResponse {
	ct.mu.RLock()
	defer ct.mu.RUnlock()

	now := time.Now()
	res := ChurnRankingResponse{
		LastCalculated:    now,
		TopChurners:       make([]PeerChurnMetrics, 0, len(ct.peers)),
		TimelineAggregate: make([]ChurnBucket, 12),
	}

	// Initialize 12 aggregate buckets for the last 60 minutes
	currentBucket := (now.Minute() / 5) % 12
	for i := 0; i < 12; i++ {
		offset := (currentBucket - 11 + i + 12) % 12
		bucketTime := now.Add(-time.Duration(11-i) * 5 * time.Minute)
		res.TimelineAggregate[i] = ChurnBucket{
			Timestamp: bucketTime,
			Withdrawn: 0,
			Announced: 0,
		}
		_ = offset
	}

	totalScore := 0.0
	for _, p := range ct.peers {
		item := *p
		// Build 1h history points for peer
		item.History1h = make([]ChurnBucket, 12)
		for i := 0; i < 12; i++ {
			bTime := now.Add(-time.Duration(11-i) * 5 * time.Minute)
			item.History1h[i] = ChurnBucket{
				Timestamp: bTime,
				Withdrawn: p.buckets1h[i],
				Announced: 0,
			}
			res.TimelineAggregate[i].Withdrawn += p.buckets1h[i]
		}

		res.TotalWithdrawn1h += item.Withdrawn1h
		res.TotalAnnounced1h += item.Announced1h
		totalScore += item.StabilityScore
		res.TopChurners = append(res.TopChurners, item)
	}

	if len(ct.peers) > 0 {
		res.AverageStability = totalScore / float64(len(ct.peers))
	} else {
		res.AverageStability = 100.0
	}

	// Sort by highest withdrawns / churn first
	sort.Slice(res.TopChurners, func(i, j int) bool {
		if res.TopChurners[i].Withdrawn1h != res.TopChurners[j].Withdrawn1h {
			return res.TopChurners[i].Withdrawn1h > res.TopChurners[j].Withdrawn1h
		}
		return res.TopChurners[i].StabilityScore < res.TopChurners[j].StabilityScore
	})

	return res
}
