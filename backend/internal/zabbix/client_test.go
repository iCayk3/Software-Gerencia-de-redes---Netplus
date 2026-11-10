package zabbix

import (
	"testing"
)

func TestExtractInterfacesFromItems(t *testing.T) {
	items := []ZabbixItem{
		{
			ItemID: "101",
			Name:   "Interface 10GE0/1/1: Operational status",
			Key:    "net.if.status[10GE0/1/1]",
		},
		{
			ItemID: "102",
			Name:   "Interface 10GE0/1/1: Bits received",
			Key:    "net.if.in[10GE0/1/1]",
		},
		{
			ItemID: "103",
			Name:   "Interface GigabitEthernet0/0/2(Uplink): Operational status",
			Key:    "ifOperStatus.2",
		},
		{
			ItemID: "104",
			Name:   "Interface Eth-Trunk1: Operational status",
			Key:    "net.if.status[Eth-Trunk1]",
		},
		{
			ItemID: "105",
			Name:   "ether1: Bits sent",
			Key:    "net.if.out[ether1]",
		},
		{
			ItemID: "106",
			Name:   "LoopBack0: Status",
			Key:    "net.if.status[LoopBack0]",
		},
	}

	extracted := ExtractInterfacesFromItems(items)

	expected := map[string]bool{
		"10GE0/1/1":              true,
		"GigabitEthernet0/0/2":   true,
		"Eth-Trunk1":             true,
		"ether1":                 true,
	}

	for _, iface := range extracted {
		delete(expected, iface)
	}

	if len(expected) > 0 {
		t.Fatalf("Missing expected interfaces: %+v (extracted: %+v)", expected, extracted)
	}
}

func TestMatchInterfaces(t *testing.T) {
	cases := []struct {
		a, b   string
		match  bool
	}{
		{"10GE0/1/1", "10GE0/1/1", true},
		{"10GE 0/1/1", "10GE0/1/1", true},
		{"TenGigabitEthernet0/1/1", "10GE0/1/1", true},
		{"Eth-Trunk 1", "Eth-Trunk1", true},
		{"ether1", "ether1", true},
		{"10GE0/1/1", "10GE0/1/2", false},
		{"GigabitEthernet0/0/1", "GigabitEthernet0/0/2", false},
	}

	for _, c := range cases {
		res := MatchInterfaces(c.a, c.b)
		if res != c.match {
			t.Errorf("MatchInterfaces(%q, %q) = %v; want %v", c.a, c.b, res, c.match)
		}
	}
}
