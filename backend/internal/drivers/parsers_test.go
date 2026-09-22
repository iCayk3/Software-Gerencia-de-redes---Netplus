package drivers

import (
	"network-software/internal/models"
	"testing"
)

func TestParseHuaweiBGP(t *testing.T) {
	sample := `
 BGP local router ID : 10.0.0.1
 Local AS number : 65000
 Total number of peers : 2                 Peers in established state : 1

  Peer            V    AS  MsgRcvd  MsgSent  OutQ  Up/Down       State PrefRcv
  192.168.1.1     4 65001    14321    14320     0 03:24:12 Established     500
  192.168.1.2     4 65002        0        0     0 00:00:00        Active       0
`
	sessions := ParseHuaweiBGP(sample, "dev-1", "Huawei-Borda-NE8000")
	if len(sessions) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(sessions))
	}

	if sessions[0].PeerIP != "192.168.1.1" || sessions[0].RemoteAS != "65001" || sessions[0].State != "Established" || sessions[0].PrefixesReceived != 500 {
		t.Errorf("unexpected session 0: %+v", sessions[0])
	}
	if sessions[0].LocalAS != "65000" {
		t.Errorf("expected local AS 65000, got %s", sessions[0].LocalAS)
	}

	if sessions[1].PeerIP != "192.168.1.2" || sessions[1].State != "Active" || sessions[1].PrefixesReceived != 0 {
		t.Errorf("unexpected session 1: %+v", sessions[1])
	}
}

func TestParseHuaweiOSPF(t *testing.T) {
	sample := `
          OSPF Process 1 with Router ID 10.0.0.1
                   Peer Statistic Information
 ----------------------------------------------------------------------------
 Area Id          Interface                        Neighbor id      State
 0.0.0.0          GigabitEthernet0/0/1             10.255.255.1     Full
 0.0.0.0          10GE1/0/1                        10.255.255.2     Full/DR
 0.0.0.1          Vlanif100                        10.255.255.3     2-Way
`
	neighbors := ParseHuaweiOSPF(sample, "dev-1", "Huawei-S6730")
	if len(neighbors) != 3 {
		t.Fatalf("expected 3 neighbors, got %d", len(neighbors))
	}

	if neighbors[0].NeighborID != "10.255.255.1" || neighbors[0].State != "Full" || neighbors[0].Interface != "GigabitEthernet0/0/1" {
		t.Errorf("unexpected neighbor 0: %+v", neighbors[0])
	}
	if neighbors[1].NeighborID != "10.255.255.2" || neighbors[1].State != "Full" || neighbors[1].Role != "DR" {
		t.Errorf("unexpected neighbor 1: %+v", neighbors[1])
	}
}

func TestParseDatacomBGP(t *testing.T) {
	sample := `
BGP router identifier 10.255.0.1, local AS number 65100 vrf-name default
BGP table version 42
Neighbor        V   AS MsgRcvd MsgSent   TblVer  InQ OutQ Up/Down  State/PfxRcd
192.168.10.1    4 65001   1200    1205        0    0    0 02:40:12     250
192.168.20.1    4 65002      0       0        0    0    0 00:00:00  Active
`
	sessions := ParseDatacomBGP(sample, "dev-2", "Datacom-DmOS")
	if len(sessions) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(sessions))
	}

	if sessions[0].PeerIP != "192.168.10.1" || sessions[0].State != "Established" || sessions[0].PrefixesReceived != 250 {
		t.Errorf("unexpected session 0: %+v", sessions[0])
	}
	if sessions[0].LocalAS != "65100" {
		t.Errorf("expected local AS 65100, got %s", sessions[0].LocalAS)
	}

	if sessions[1].PeerIP != "192.168.20.1" || sessions[1].State != "Active" {
		t.Errorf("unexpected session 1: %+v", sessions[1])
	}
}

func TestParseDatacomOSPF(t *testing.T) {
	sample := `
Neighbor ID     Pri   State           Dead Time   Address         Interface
10.255.255.1      1   FULL/DR         00:00:34    10.0.0.2        xe-0/0/1
10.255.255.2      1   FULL/BDR        00:00:38    10.0.0.6        xe-0/0/2
`
	neighbors := ParseDatacomOSPF(sample, "dev-2", "Datacom-DmOS")
	if len(neighbors) != 2 {
		t.Fatalf("expected 2 neighbors, got %d", len(neighbors))
	}

	if neighbors[0].NeighborID != "10.255.255.1" || neighbors[0].State != "FULL" || neighbors[0].Role != "DR" || neighbors[0].Interface != "xe-0/0/1" {
		t.Errorf("unexpected neighbor 0: %+v", neighbors[0])
	}
}

func TestParseMikrotikV7BGP(t *testing.T) {
	sample := `
Flags: E - established
 0 E name="peer-ix"
     remote.address=187.16.216.1 .as=26162
     local.address=187.16.216.2 .as=65000
     state=established uptime=1w3d4h
     prefixes-received=125430

 1   name="peer-upstream"
     remote.address=10.1.1.1 .as=65001
     state=idle uptime=0s
     prefix-count=0
`
	sessions := ParseMikrotikV7BGP(sample, "dev-3", "Mikrotik-CCR2004-v7")
	if len(sessions) != 2 {
		t.Fatalf("expected 2 sessions, got %d", len(sessions))
	}

	if sessions[0].PeerIP != "187.16.216.1" || sessions[0].RemoteAS != "26162" || sessions[0].State != "Established" || sessions[0].PrefixesReceived != 125430 {
		t.Errorf("unexpected session 0: %+v", sessions[0])
	}
	if sessions[1].PeerIP != "10.1.1.1" || sessions[1].State != "Idle" || sessions[1].PrefixesReceived != 0 {
		t.Errorf("unexpected session 1: %+v", sessions[1])
	}
}

func TestParseMikrotikV6OSPF(t *testing.T) {
	sample := `
Flags: X - disabled, I - inactive, D - dynamic 
 #    INTERFACE               ROUTER-ID       PRIORITY STATE          STATE-CHANGES ADJACENCY   
 0  D ether1                  10.255.255.1           1 Full                       5 00:05:23    
 1  D ether2-core             10.255.255.2           1 2-Way                      2 00:01:10    
 2  D vlan100                 10.255.255.3           1 Full/DR                    3 01:23:45    
`
	neighbors := ParseMikrotikOSPF(sample, "dev-3", "Mikrotik-CCR1036-v6")
	if len(neighbors) != 3 {
		t.Fatalf("expected 3 neighbors, got %d", len(neighbors))
	}

	if neighbors[0].Interface != "ether1" || neighbors[0].NeighborID != "10.255.255.1" || neighbors[0].State != "Full" {
		t.Errorf("unexpected neighbor 0: %+v", neighbors[0])
	}
	if neighbors[1].Interface != "ether2-core" || neighbors[1].NeighborID != "10.255.255.2" || neighbors[1].State != "2-Way" {
		t.Errorf("unexpected neighbor 1: %+v", neighbors[1])
	}
	if neighbors[2].Interface != "vlan100" || neighbors[2].NeighborID != "10.255.255.3" || neighbors[2].State != "Full" || neighbors[2].Role != "DR" {
		t.Errorf("unexpected neighbor 2: %+v", neighbors[2])
	}
}

func TestParseMikrotikV7OSPF(t *testing.T) {
	sample := `
 0 instance=default-v2 area=backbone-v2 address=192.168.1.2 router-id=10.0.0.2 
   interface=ether1 priority=1 dr-id=10.0.0.2 backup-dr-id=10.0.0.1 state="Full"
`
	neighbors := ParseMikrotikOSPF(sample, "dev-4", "Mikrotik-CCR2004-v7")
	if len(neighbors) != 1 {
		t.Fatalf("expected 1 neighbor, got %d", len(neighbors))
	}

	if neighbors[0].NeighborID != "10.0.0.2" || neighbors[0].IP != "192.168.1.2" || neighbors[0].State != "Full" || neighbors[0].Role != "DR" {
		t.Errorf("unexpected neighbor 0: %+v", neighbors[0])
	}
}

func TestParseHuaweiStaticRoutes(t *testing.T) {
	sample := `
ip route-static 0.0.0.0 0.0.0.0 10.14.0.1 description UPLOAD-TRANSITO-A
ip route-static 0.0.0.0 0.0.0.0 10.14.0.2 preference 100 description UPLOAD-BACKUP
ip route-static 187.16.216.0 255.255.252.0 NULL0
`
	routes := ParseHuaweiStaticRoutes(sample, "dev-1", "Huawei-Borda")
	if len(routes) != 3 {
		t.Fatalf("expected 3 static routes, got %d", len(routes))
	}

	if routes[0].Destination != "0.0.0.0/0" || routes[0].NextHop != "10.14.0.1" || routes[0].Description != "UPLOAD-TRANSITO-A" || routes[0].Preference != 60 {
		t.Errorf("unexpected route 0: %+v", routes[0])
	}
	if routes[1].Destination != "0.0.0.0/0" || routes[1].NextHop != "10.14.0.2" || routes[1].Preference != 100 {
		t.Errorf("unexpected route 1: %+v", routes[1])
	}
	if routes[2].Destination != "187.16.216.0/22" || routes[2].NextHop != "NULL0" {
		t.Errorf("unexpected route 2: %+v", routes[2])
	}
}

func TestParseMikrotikStaticRoutes(t *testing.T) {
	sample := `
 0 A S  dst-address=0.0.0.0/0 gateway=10.14.0.1 distance=1 comment="UPLOAD-TRANSITO-A"
 1   S  dst-address=0.0.0.0/0 gateway=10.14.0.2 distance=10 comment="UPLOAD-BACKUP"
`
	routes := ParseMikrotikStaticRoutes(sample, "dev-2", "Mikrotik-Borda")
	if len(routes) != 2 {
		t.Fatalf("expected 2 static routes, got %d", len(routes))
	}

	if routes[0].Destination != "0.0.0.0/0" || routes[0].NextHop != "10.14.0.1" || routes[0].Description != "UPLOAD-TRANSITO-A" || routes[0].Preference != 1 {
		t.Errorf("unexpected route 0: %+v", routes[0])
	}
}

func TestParseDatacomStaticRoutes(t *testing.T) {
	sample := `
ip route 0.0.0.0/0 10.14.0.1
ip route 187.16.216.0/22 10.14.0.2 10
`
	routes := ParseDatacomStaticRoutes(sample, "dev-3", "Datacom-DmOS")
	if len(routes) != 2 {
		t.Fatalf("expected 2 static routes, got %d", len(routes))
	}

	if routes[0].Destination != "0.0.0.0/0" || routes[0].NextHop != "10.14.0.1" {
		t.Errorf("unexpected route 0: %+v", routes[0])
	}
	if routes[1].Destination != "187.16.216.0/22" || routes[1].NextHop != "10.14.0.2" || routes[1].Preference != 10 {
		t.Errorf("unexpected route 1: %+v", routes[1])
	}
}

func TestParseHuaweiBGPPrepends(t *testing.T) {
	bgpCfg := `
bgp 267943
 peer 170.82.183.217 as-number 266445
 peer 170.82.183.217 description BGP-SEA
 peer 170.82.183.217 route-policy RP-UPL-SEA-V4-OUT export
 peer 45.184.145.253 as-number 26162
 peer 45.184.145.253 description BGP-PTT-BRASILIA-RS1-IPV4
 peer 45.184.145.253 ignore
 network 45.166.28.0 255.255.252.0 route-policy RP-TAG-V4-ORIGIN
 network 45.166.28.0 255.255.255.0 route-policy RP-TAG-V4-ORIGIN
`
	tagPol := `
Route-policy: RP-TAG-V4-ORIGIN
  permit : 10
    if-match ip-prefix EXACT-V4-2228
    apply community 1:20030 1:41003
  permit : 40
    if-match ip-prefix EXACT-V4-2824
    apply community 1:20031 1:41001
`
	sessions := []models.BGPSession{
		{
			PeerIP:   "170.82.183.217",
			RemoteAS: "266445",
			LocalAS:  "267943",
			State:    "Established",
		},
	}

	overview := ParseHuaweiBGPPrepends(bgpCfg, tagPol, sessions, "dev-huawei", "Huawei-BGP")
	if overview == nil {
		t.Fatal("expected overview to be non-nil")
	}
	if overview.LocalAS != "267943" {
		t.Errorf("expected LocalAS 267943, got %s", overview.LocalAS)
	}
	if len(overview.Peers) < 2 {
		t.Fatalf("expected at least 2 peers, got %d", len(overview.Peers))
	}

	// Check SEA peer
	var seaPeer *models.BGPPeerPrepend
	for i, p := range overview.Peers {
		if p.PeerIP == "170.82.183.217" {
			seaPeer = &overview.Peers[i]
		}
	}
	if seaPeer == nil {
		t.Fatal("expected SEA peer to be found")
	}
	if seaPeer.Status != "Established" {
		t.Errorf("expected SEA status Established, got %s", seaPeer.Status)
	}

	// Check prefixes
	if len(overview.Prefixes) == 0 {
		t.Fatal("expected prefix prepend states, got 0")
	}
}

func TestHuaweiPrependLogic(t *testing.T) {
	tagPol := `
Route-policy: RP-TAG-V4-ORIGIN
  permit : 10
    if-match ip-prefix EXACT-V4-2228
    apply community 267943:1000 1:20030 1:40000 1:41000 additive
  permit : 40
    if-match ip-prefix EXACT-V4-2824
    apply community 267943:1000 1:20031 1:40000 additive
`
	pfxCfg := `
ip ip-prefix EXACT-V4-2228 index 10 permit 45.166.28.0 22
ip ip-prefix EXACT-V4-2824 index 10 permit 45.166.28.0 24
`

	// 1. Locate node for 45.166.28.0/22
	node, comms, err := FindHuaweiPrefixNode(tagPol, pfxCfg, "45.166.28.0/22")
	if err != nil {
		t.Fatalf("expected node to be found, got error: %v", err)
	}
	if node != 10 {
		t.Errorf("expected node 10, got %d", node)
	}

	// 2. Apply 2x Prepend on SEA (base 2003)
	updatedComms, targetComm := UpdateHuaweiOriginCommunity(comms, "2003", 2, false)
	if targetComm != "1:20032" {
		t.Errorf("expected targetComm 1:20032, got %s", targetComm)
	}
	// Verify replacement
	found2P := false
	for _, c := range updatedComms {
		if c == "1:20032" {
			found2P = true
		}
		if c == "1:20030" {
			t.Errorf("old community 1:20030 should have been replaced, but was still present")
		}
	}
	if !found2P {
		t.Errorf("expected 1:20032 in updatedComms: %v", updatedComms)
	}

	// 3. Apply Selective Block on SEA (base 2003)
	blockedComms, blockComm := UpdateHuaweiOriginCommunity(updatedComms, "2003", 0, true)
	if blockComm != "0:20030" {
		t.Errorf("expected blockComm 0:20030, got %s", blockComm)
	}
	foundBlock := false
	for _, c := range blockedComms {
		if c == "0:20030" {
			foundBlock = true
		}
		if c == "1:20032" {
			t.Errorf("community 1:20032 should have been replaced by block")
		}
	}
	if !foundBlock {
		t.Errorf("expected 0:20030 in blockedComms: %v", blockedComms)
	}

	// 4. Test PTT Brasília (base 4000) 1x Prepend
	pttComms, pttComm := UpdateHuaweiOriginCommunity(blockedComms, "4000", 1, false)
	if pttComm != "1:40001" {
		t.Errorf("expected pttComm 1:40001, got %s", pttComm)
	}
	foundPTT1P := false
	for _, c := range pttComms {
		if c == "1:40001" {
			foundPTT1P = true
		}
	}
	if !foundPTT1P {
		t.Errorf("expected 1:40001 in pttComms: %v", pttComms)
	}

	// 5. Test fallback prefix name resolver (without pfxCfg)
	node40, comms40, err := FindHuaweiPrefixNode(tagPol, "", "45.166.28.0/24")
	if err != nil {
		t.Fatalf("expected node 40 via fallback resolver: %v", err)
	}
	if node40 != 40 {
		t.Errorf("expected node 40, got %d", node40)
	}
	if len(comms40) != 3 {
		t.Errorf("expected 3 communities in node 40, got %d", len(comms40))
	}
}

func TestBGP2CommunitiesResolution(t *testing.T) {
	tests := []struct {
		desc      string
		exportPol string
		peerAS    string
		expected  string
	}{
		{"WIKI TELECOM", "RP-UPL-WIKI-V4-OUT", "28573", "2002"},
		{"PTT-BELEM", "RP-IX-PTTBEL-V4-OUT", "26162", "4500"},
		{"PTT-CEARA", "RP-IX-PTTCE-V4-OUT", "26162", "4400"},
		{"PTT-SP", "RP-IX-PTTSP-V4-OUT", "26162", "4100"},
		{"SEA TELECOM", "RP-UPL-SEA-V4-OUT", "266445", "2003"},
		{"PTT BRASILIA", "RP-IX-PTTBRA-V4-OUT", "26162", "4000"},
	}

	for _, tc := range tests {
		base := DetermineHuaweiPeerCommunityBase("", tc.peerAS, tc.desc, tc.exportPol)
		if base != tc.expected {
			t.Errorf("peer %s (%s): expected base %s, got %s", tc.desc, tc.exportPol, tc.expected, base)
		}
	}
}



