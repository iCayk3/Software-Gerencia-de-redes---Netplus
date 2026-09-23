package traffic

import (
	"network-software/internal/models"
	"testing"
)

func TestHarmonizeASPrepends(t *testing.T) {
	svc := &Service{
		prepends: make(map[string]*models.DevicePrependOverview),
	}

	// BGP1 has full origin policy and networks
	bgp1 := &models.DevicePrependOverview{
		DeviceID:   "dev-bgp1",
		DeviceName: "BGP1",
		LocalAS:    "267943",
		Peers: []models.BGPPeerPrepend{
			{
				PeerIP:     "170.82.183.217",
				PeerName:   "SEA Telecom",
				RemoteAS:   "266445",
				PolicyName: "RP-UPL-SEA-V4-OUT",
			},
		},
		ASGroups: []models.ASPrependGroup{
			{
				ID:            "asgrp-bgp1-2003",
				RemoteAS:      "266445",
				GroupName:     "SEA Telecom",
				CommunityBase: "2003",
				PeerIPs:       []string{"170.82.183.217"},
				Prefixes: []models.PrefixPrependState{
					{Prefix: "45.166.28.0/22", Community: "apply community 1:20030 1:41003 1:44000"},
					{Prefix: "45.166.28.0/23", Community: "apply community 1:40000 1:20023 1:20030"},
					{Prefix: "45.166.30.0/23", Community: "apply community 1:40000 1:20023 1:20030"},
					{Prefix: "45.166.28.0/24", Community: "apply community 1:20030 1:41001 1:44000 1:45000"},
					{Prefix: "45.166.29.0/24", Community: "apply community 1:20030 1:41001 1:44000 1:45000"},
					{Prefix: "45.166.30.0/24", Community: "apply community 1:20030 1:41001 1:44000 1:45000"},
					{Prefix: "45.166.31.0/24", Community: "apply community 1:20030 1:41001 1:44000 1:45000"},
				},
			},
		},
	}

	// BGP2 only has 45.166.28.0/22 locally, but hosts PTT-SP, PTT-BEL, PTT-CE, Wiki
	bgp2 := &models.DevicePrependOverview{
		DeviceID:   "dev-bgp2",
		DeviceName: "BGP2",
		LocalAS:    "267943",
		Peers: []models.BGPPeerPrepend{
			{
				PeerIP:     "187.16.216.254",
				PeerName:   "BGP-PTT-SP-IPV4",
				RemoteAS:   "26162",
				PolicyName: "RP-IX-PTTSP-V4-OUT",
			},
			{
				PeerIP:     "187.16.195.254",
				PeerName:   "BGP-PTT-BEL-IPV4",
				RemoteAS:   "26162",
				PolicyName: "RP-IX-PTTBEL-V4-OUT",
			},
			{
				PeerIP:     "45.68.79.254",
				PeerName:   "BGP-PTT-CE-IPV4",
				RemoteAS:   "26162",
				PolicyName: "RP-IX-PTTCE-V4-OUT",
			},
			{
				PeerIP:     "45.181.228.24",
				PeerName:   "BGP-WIKI",
				RemoteAS:   "262503",
				PolicyName: "RP-UPL-WIKI-V4-OUT",
			},
		},
		ASGroups: []models.ASPrependGroup{
			{
				ID:            "asgrp-bgp2-4100",
				RemoteAS:      "26162",
				GroupName:     "PTT São Paulo (IX.br SP)",
				CommunityBase: "4100",
				PeerIPs:       []string{"187.16.216.254"},
				Prefixes: []models.PrefixPrependState{
					{Prefix: "45.166.28.0/22", Community: "apply community 1:10000"},
				},
			},
			{
				ID:            "asgrp-bgp2-4500",
				RemoteAS:      "26162",
				GroupName:     "PTT Belém (IX.br BEL)",
				CommunityBase: "4500",
				PeerIPs:       []string{"187.16.195.254"},
				Prefixes: []models.PrefixPrependState{
					{Prefix: "45.166.28.0/22", Community: "apply community 1:10000"},
				},
			},
			{
				ID:            "asgrp-bgp2-4400",
				RemoteAS:      "26162",
				GroupName:     "PTT Fortaleza / Ceará (IX.br CE)",
				CommunityBase: "4400",
				PeerIPs:       []string{"45.68.79.254"},
				Prefixes: []models.PrefixPrependState{
					{Prefix: "45.166.28.0/22", Community: "apply community 1:10000"},
				},
			},
			{
				ID:            "asgrp-bgp2-2002",
				RemoteAS:      "262503",
				GroupName:     "Wiki Telecom",
				CommunityBase: "2002",
				PeerIPs:       []string{"45.181.228.24"},
				Prefixes: []models.PrefixPrependState{
					{Prefix: "45.166.28.0/22", Community: "apply community 1:10000"},
				},
			},
		},
	}

	svc.prepends["dev-bgp1"] = bgp1
	svc.prepends["dev-bgp2"] = bgp2

	// Run harmonization
	svc.harmonizeASPrependsLocked()

	// Verify BGP2 AS Groups now have all 7 prefixes
	for _, grp := range bgp2.ASGroups {
		if len(grp.Prefixes) != 7 {
			t.Fatalf("expected 7 prefixes in group %s (%s), got %d", grp.GroupName, grp.CommunityBase, len(grp.Prefixes))
		}
	}

	// Verify PTT SP (base 4100):
	// /22 should have 3P (1:41003)
	// /24s should have 1P (1:41001)
	pttSP := bgp2.ASGroups[0]
	if pttSP.Prefixes[0].Prefix != "45.166.28.0/22" || pttSP.Prefixes[0].PrependCount != 3 {
		t.Errorf("PTT SP /22: expected 3P, got %dP (prefix: %s)", pttSP.Prefixes[0].PrependCount, pttSP.Prefixes[0].Prefix)
	}
	for i := 3; i < 7; i++ {
		pfxState := pttSP.Prefixes[i]
		if pfxState.PrependCount != 1 {
			t.Errorf("PTT SP %s: expected 1P, got %dP", pfxState.Prefix, pfxState.PrependCount)
		}
	}

	// Verify PTT Belém (base 4500):
	// /24s should have 0P (1:45000)
	pttBel := bgp2.ASGroups[1]
	for i := 3; i < 7; i++ {
		pfxState := pttBel.Prefixes[i]
		if pfxState.PrependCount != 0 {
			t.Errorf("PTT Belém %s: expected 0P, got %dP", pfxState.Prefix, pfxState.PrependCount)
		}
	}

	// Verify Wiki (base 2002):
	// /23s should have 3P (1:20023)
	wiki := bgp2.ASGroups[3]
	if wiki.Prefixes[1].PrependCount != 3 || wiki.Prefixes[2].PrependCount != 3 {
		t.Errorf("Wiki /23s: expected 3P, got %dP and %dP", wiki.Prefixes[1].PrependCount, wiki.Prefixes[2].PrependCount)
	}
}
