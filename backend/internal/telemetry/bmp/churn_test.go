package bmp

import (
	"testing"
	"time"
)

func TestChurnTracker(t *testing.T) {
	tracker := NewChurnTracker()

	now := time.Now()

	// Initial check
	res := tracker.GetRanking()
	if len(res.TopChurners) != 0 {
		t.Fatalf("Expected 0 churners, got %d", len(res.TopChurners))
	}
	if res.AverageStability != 100.0 {
		t.Errorf("Expected 100%% average stability for empty tracker, got %v", res.AverageStability)
	}

	// Record normal announcements for peer A
	tracker.RecordUpdate("45.166.28.254", "BGP", "170.82.183.217", "BGP-SEA", 266445, 100, 0, now)

	// Record heavy withdrawns for peer B (flapping)
	tracker.RecordUpdate("45.166.28.249", "BGP2", "187.16.195.253", "BGP-PTT-BEL", 26162, 50, 80, now)

	ranking := tracker.GetRanking()
	if len(ranking.TopChurners) != 2 {
		t.Fatalf("Expected 2 peers in ranking, got %d", len(ranking.TopChurners))
	}

	// Peer B should be ranked #1 churner because of 80 withdrawns
	top := ranking.TopChurners[0]
	if top.PeerIP != "187.16.195.253" {
		t.Errorf("Expected top churner to be 187.16.195.253, got %s", top.PeerIP)
	}
	if top.Withdrawn1h != 80 {
		t.Errorf("Expected 80 withdrawns, got %d", top.Withdrawn1h)
	}
	if top.StabilityScore >= 100.0 {
		t.Errorf("Expected penalized stability score, got %f", top.StabilityScore)
	}
	if top.Status != "moderate_churn" && top.Status != "high_churn" {
		t.Errorf("Expected churn status, got %s", top.Status)
	}

	// Peer A should have 100% stability score
	second := ranking.TopChurners[1]
	if second.PeerIP != "170.82.183.217" {
		t.Errorf("Expected second peer to be 170.82.183.217, got %s", second.PeerIP)
	}
	if second.StabilityScore != 100.0 {
		t.Errorf("Expected 100%% stability for peer with zero withdrawns, got %f", second.StabilityScore)
	}
}
