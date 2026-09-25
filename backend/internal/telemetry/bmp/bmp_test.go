package bmp

import (
	"encoding/binary"
	"net"
	"testing"
)

func TestParseCommonHeader(t *testing.T) {
	buf := make([]byte, 6)
	buf[0] = BMPVersion3
	binary.BigEndian.PutUint32(buf[1:5], 48)
	buf[5] = MsgPeerUp

	hdr, err := ParseCommonHeader(buf)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if hdr.Version != 3 {
		t.Errorf("expected version 3, got %d", hdr.Version)
	}
	if hdr.Length != 48 {
		t.Errorf("expected length 48, got %d", hdr.Length)
	}
	if hdr.MsgType != MsgPeerUp {
		t.Errorf("expected msgType %d, got %d", MsgPeerUp, hdr.MsgType)
	}
}

func TestParsePerPeerHeaderIPv4(t *testing.T) {
	buf := make([]byte, 42)
	buf[0] = PeerTypeGlobal
	buf[1] = PeerFlagPostPolicy // 0x40 (IPv4, PostPolicy)

	// Peer Distinguisher (bytes 2..10)
	binary.BigEndian.PutUint64(buf[2:10], 0)

	// Peer Address (bytes 10..26) -> IPv4 at [22:26]
	peerIP := net.ParseIP("187.16.216.1").To4()
	copy(buf[22:26], peerIP)

	// Peer AS (bytes 26..30)
	binary.BigEndian.PutUint32(buf[26:30], 26162)

	// Peer BGP ID (bytes 30..34)
	bgpID := net.ParseIP("187.16.216.1").To4()
	copy(buf[30:34], bgpID)

	// Timestamp (bytes 34..42)
	binary.BigEndian.PutUint32(buf[34:38], 1700000000)
	binary.BigEndian.PutUint32(buf[38:42], 500000)

	pph, err := ParsePerPeerHeader(buf)
	if err != nil {
		t.Fatalf("failed to parse per-peer header: %v", err)
	}

	if pph.PeerAddress != "187.16.216.1" {
		t.Errorf("expected peer address 187.16.216.1, got %s", pph.PeerAddress)
	}
	if pph.PeerAS != 26162 {
		t.Errorf("expected peer AS 26162, got %d", pph.PeerAS)
	}
	if pph.PeerBGPID != "187.16.216.1" {
		t.Errorf("expected peer BGP ID 187.16.216.1, got %s", pph.PeerBGPID)
	}
	if !pph.IsPostPolicy {
		t.Errorf("expected IsPostPolicy to be true")
	}
	if pph.IsIPv6 {
		t.Errorf("expected IsIPv6 to be false")
	}
}

func TestParseInitiation(t *testing.T) {
	// Build Initiation payload: TLV sysName (type 2) + TLV sysDescr (type 1)
	name := "NE8000-F1A-CORE"
	descr := "Huawei Versatile Routing Platform V800R019"

	payload := make([]byte, 4+len(name)+4+len(descr))
	binary.BigEndian.PutUint16(payload[0:2], TLVSysName)
	binary.BigEndian.PutUint16(payload[2:4], uint16(len(name)))
	copy(payload[4:4+len(name)], []byte(name))

	offset := 4 + len(name)
	binary.BigEndian.PutUint16(payload[offset:offset+2], TLVSysDescr)
	binary.BigEndian.PutUint16(payload[offset+2:offset+4], uint16(len(descr)))
	copy(payload[offset+4:], []byte(descr))

	sysName, sysDescr, err := ParseInitiation(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if sysName != name {
		t.Errorf("expected sysName '%s', got '%s'", name, sysName)
	}
	if sysDescr != descr {
		t.Errorf("expected sysDescr '%s', got '%s'", descr, sysDescr)
	}
}

func TestParsePeerDown(t *testing.T) {
	payload := []byte{PeerDownReasonRemoteNotification}
	down, err := ParsePeerDown(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if down.Reason != PeerDownReasonRemoteNotification {
		t.Errorf("expected reason %d, got %d", PeerDownReasonRemoteNotification, down.Reason)
	}
}
