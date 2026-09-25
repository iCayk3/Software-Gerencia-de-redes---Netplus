package bmp

import (
	"encoding/binary"
	"fmt"
	"net"
)

// CommonHeader represents the 6-byte RFC 7854 BMP common header.
type CommonHeader struct {
	Version uint8
	Length  uint32
	MsgType uint8
}

// ParseCommonHeader parses the initial 6 bytes of a BMP message.
func ParseCommonHeader(buf []byte) (CommonHeader, error) {
	if len(buf) < 6 {
		return CommonHeader{}, fmt.Errorf("buffer too short for BMP common header: %d bytes", len(buf))
	}

	version := buf[0]
	length := binary.BigEndian.Uint32(buf[1:5])
	msgType := buf[5]

	if version != BMPVersion3 {
		return CommonHeader{}, fmt.Errorf("unsupported BMP version %d (expected 3)", version)
	}
	if length < 6 {
		return CommonHeader{}, fmt.Errorf("invalid BMP message length %d", length)
	}

	return CommonHeader{
		Version: version,
		Length:  length,
		MsgType: msgType,
	}, nil
}

// ParsePerPeerHeader parses the 42-byte RFC 7854 per-peer header.
func ParsePerPeerHeader(buf []byte) (PerPeerHeader, error) {
	if len(buf) < 42 {
		return PerPeerHeader{}, fmt.Errorf("buffer too short for per-peer header: %d bytes (need 42)", len(buf))
	}

	pType := buf[0]
	flags := buf[1]
	dist := binary.BigEndian.Uint64(buf[2:10])

	isIPv6 := (flags & PeerFlagIPv6) != 0
	isPostPolicy := (flags & PeerFlagPostPolicy) != 0

	var peerAddr string
	if isIPv6 {
		peerAddr = net.IP(buf[10:26]).String()
	} else {
		// IPv4 is stored in the last 4 bytes of the 16-byte field
		peerAddr = net.IPv4(buf[22], buf[23], buf[24], buf[25]).String()
	}

	peerAS := binary.BigEndian.Uint32(buf[26:30])
	peerBGPID := net.IPv4(buf[30], buf[31], buf[32], buf[33]).String()
	sec := binary.BigEndian.Uint32(buf[34:38])
	usec := binary.BigEndian.Uint32(buf[38:42])

	return PerPeerHeader{
		PeerType:          pType,
		PeerFlags:         flags,
		PeerDistinguisher: dist,
		PeerAddress:       peerAddr,
		PeerAS:            peerAS,
		PeerBGPID:         peerBGPID,
		TimestampSec:      sec,
		TimestampUsec:     usec,
		IsIPv6:            isIPv6,
		IsPostPolicy:      isPostPolicy,
	}, nil
}

// ParseInitiation parses RFC 7854 Type 4 Initiation Message TLVs.
func ParseInitiation(payload []byte) (sysName, sysDescr string, err error) {
	offset := 0
	for offset+4 <= len(payload) {
		tlvType := binary.BigEndian.Uint16(payload[offset : offset+2])
		tlvLen := int(binary.BigEndian.Uint16(payload[offset+2 : offset+4]))
		offset += 4

		if offset+tlvLen > len(payload) {
			break
		}

		val := string(payload[offset : offset+tlvLen])
		offset += tlvLen

		switch tlvType {
		case TLVSysDescr:
			sysDescr = val
		case TLVSysName:
			sysName = val
		case TLVString:
			if sysName == "" {
				sysName = val
			} else if sysDescr == "" {
				sysDescr = val
			}
		}
	}
	return sysName, sysDescr, nil
}

// PeerUpData contains decoded information from a BMP Peer Up notification.
type PeerUpData struct {
	LocalAddr  string
	LocalPort  uint16
	RemotePort uint16
	LocalAS    uint32
	LocalBGPID string
}

// ParsePeerUp parses an RFC 7854 Type 3 Peer Up Message body (starts after the 42-byte PerPeerHeader).
func ParsePeerUp(payload []byte, pph PerPeerHeader) (PeerUpData, error) {
	if len(payload) < 20 {
		return PeerUpData{}, fmt.Errorf("peer up payload too short: %d bytes (need >= 20)", len(payload))
	}

	var localAddr string
	if pph.IsIPv6 {
		localAddr = net.IP(payload[0:16]).String()
	} else {
		localAddr = net.IPv4(payload[12], payload[13], payload[14], payload[15]).String()
	}

	localPort := binary.BigEndian.Uint16(payload[16:18])
	remotePort := binary.BigEndian.Uint16(payload[18:20])

	var localAS uint32
	var localBGPID string

	// Sent BGP OPEN message starts at offset 20
	// BGP Header: 16 bytes Marker (0xFF), 2 bytes Length, 1 byte Type (1=OPEN)
	if len(payload) >= 20+19+10 {
		bgpOffset := 20
		// Check for BGP Marker
		hasMarker := true
		for i := 0; i < 16; i++ {
			if payload[bgpOffset+i] != 0xFF {
				hasMarker = false
				break
			}
		}
		if hasMarker {
			bgpType := payload[bgpOffset+18]
			if bgpType == 1 { // BGP OPEN
				myAS2 := binary.BigEndian.Uint16(payload[bgpOffset+20 : bgpOffset+22])
				localAS = uint32(myAS2)
				localBGPID = net.IPv4(payload[bgpOffset+24], payload[bgpOffset+25], payload[bgpOffset+26], payload[bgpOffset+27]).String()

				// Check optional parameters for 4-byte ASN (Capability 65)
				optParamLen := int(payload[bgpOffset+28])
				optStart := bgpOffset + 29
				optEnd := optStart + optParamLen
				if optEnd <= len(payload) {
					idx := optStart
					for idx+2 <= optEnd {
						paramType := payload[idx]
						paramLen := int(payload[idx+1])
						idx += 2
						if paramType == 2 && idx+paramLen <= optEnd { // Capabilities Optional Parameter
							capIdx := idx
							capEnd := idx + paramLen
							for capIdx+2 <= capEnd {
								capCode := payload[capIdx]
								capLen := int(payload[capIdx+1])
								capIdx += 2
								if capCode == 65 && capLen == 4 && capIdx+4 <= capEnd { // 4-octet AS
									localAS = binary.BigEndian.Uint32(payload[capIdx : capIdx+4])
								}
								capIdx += capLen
							}
						}
						idx += paramLen
					}
				}
			}
		}
	}

	return PeerUpData{
		LocalAddr:  localAddr,
		LocalPort:  localPort,
		RemotePort: remotePort,
		LocalAS:    localAS,
		LocalBGPID: localBGPID,
	}, nil
}

// PeerDownData contains decoded information from an RFC 7854 Peer Down message.
type PeerDownData struct {
	Reason        uint8
	ReasonDesc    string
	BGPErrorCode  uint8
	BGPSysSubcode uint8
}

// ParsePeerDown parses an RFC 7854 Type 2 Peer Down Message body.
func ParsePeerDown(payload []byte) (PeerDownData, error) {
	if len(payload) < 1 {
		return PeerDownData{}, fmt.Errorf("peer down payload empty")
	}

	reason := payload[0]
	desc := "Unknown"
	switch reason {
	case PeerDownReasonLocalNotification:
		desc = "Local system closed session, notification sent"
	case PeerDownReasonLocalFSMError:
		desc = "Local system closed session, FSM error"
	case PeerDownReasonRemoteNotification:
		desc = "Remote peer closed session, notification received"
	case PeerDownReasonRemoteNoNotif:
		desc = "Remote peer closed session (TCP RST / timeout)"
	case PeerDownReasonInfoLost:
		desc = "Information lost / router reboot"
	}

	res := PeerDownData{
		Reason:     reason,
		ReasonDesc: desc,
	}

	// If notification PDU is included (starts after reason byte)
	// BGP Header is 19 bytes (16 marker + 2 len + 1 type=3 Notification)
	if len(payload) >= 1+19+2 {
		notifOffset := 1 + 19
		res.BGPErrorCode = payload[notifOffset]
		res.BGPSysSubcode = payload[notifOffset+1]
	}

	return res, nil
}

// RouteMonitoringData contains decoded BGP UPDATE metrics from Route Monitoring messages.
type RouteMonitoringData struct {
	WithdrawnCount int
	AnnouncedCount int
	Prefixes       []string
	Withdrawn      []string
	ASPath         string
	NextHop        string
	LocalPref      uint32
	Communities    []string
}

// ParseRouteMonitoring parses an RFC 7854 Type 0 Route Monitoring Message body (BGP UPDATE).
func ParseRouteMonitoring(payload []byte) (RouteMonitoringData, error) {
	// BGP message must have at least 19 bytes header (16 marker + 2 len + 1 type)
	if len(payload) < 19 {
		return RouteMonitoringData{}, fmt.Errorf("route monitoring payload too short for BGP PDU")
	}

	bgpType := payload[18]
	if bgpType != 2 { // Not an UPDATE (could be KEEPALIVE or other in mirrors)
		return RouteMonitoringData{}, nil
	}

	offset := 19
	if offset+2 > len(payload) {
		return RouteMonitoringData{}, nil
	}

	withdrawnLen := int(binary.BigEndian.Uint16(payload[offset : offset+2]))
	offset += 2

	res := RouteMonitoringData{}

	// Skip withdrawn routes while counting
	if withdrawnLen > 0 && offset+withdrawnLen <= len(payload) {
		wEnd := offset + withdrawnLen
		wIdx := offset
		for wIdx < wEnd {
			pfxLen := int(payload[wIdx])
			wIdx++
			bytesNeeded := (pfxLen + 7) / 8
			if wIdx+bytesNeeded <= wEnd {
				pfxStr := formatPrefix(payload[wIdx:wIdx+bytesNeeded], pfxLen)
				res.Withdrawn = append(res.Withdrawn, pfxStr)
				res.WithdrawnCount++
			}
			wIdx += bytesNeeded
		}
		offset = wEnd
	}

	if offset+2 > len(payload) {
		return res, nil
	}

	totalAttrLen := int(binary.BigEndian.Uint16(payload[offset : offset+2]))
	offset += 2

	// Parse BGP Path Attributes
	if totalAttrLen > 0 && offset+totalAttrLen <= len(payload) {
		attrEnd := offset + totalAttrLen
		attrIdx := offset

		for attrIdx+2 <= attrEnd {
			flags := payload[attrIdx]
			attrType := payload[attrIdx+1]
			attrIdx += 2

			var attrLen int
			isExtended := (flags & 0x10) != 0
			if isExtended {
				if attrIdx+2 > attrEnd {
					break
				}
				attrLen = int(binary.BigEndian.Uint16(payload[attrIdx : attrIdx+2]))
				attrIdx += 2
			} else {
				if attrIdx >= attrEnd {
					break
				}
				attrLen = int(payload[attrIdx])
				attrIdx++
			}

			if attrIdx+attrLen > attrEnd {
				break
			}

			attrVal := payload[attrIdx : attrIdx+attrLen]
			attrIdx += attrLen

			switch attrType {
			case 2: // AS_PATH
				res.ASPath = parseASPath(attrVal)
			case 3: // NEXT_HOP
				if len(attrVal) == 4 {
					res.NextHop = net.IPv4(attrVal[0], attrVal[1], attrVal[2], attrVal[3]).String()
				}
			case 5: // LOCAL_PREF
				if len(attrVal) == 4 {
					res.LocalPref = binary.BigEndian.Uint32(attrVal)
				}
			case 8: // COMMUNITIES
				res.Communities = parseCommunities(attrVal)
			}
		}

		offset = attrEnd
	}

	// Remaining payload is NLRI (Announced IPv4 Prefixes)
	nlriEnd := len(payload)
	for offset < nlriEnd {
		pfxLen := int(payload[offset])
		offset++
		bytesNeeded := (pfxLen + 7) / 8
		if offset+bytesNeeded <= nlriEnd {
			pfxStr := formatPrefix(payload[offset:offset+bytesNeeded], pfxLen)
			res.Prefixes = append(res.Prefixes, pfxStr)
			res.AnnouncedCount++
		}
		offset += bytesNeeded
	}

	return res, nil
}

// StatsReportData contains decoded statistics from an RFC 7854 Statistics Report.
type StatsReportData struct {
	StatsCount             uint32
	RejectedByInboundPolicy uint64
	DuplicatePrefixAdvert   uint64
	DuplicateWithdraw       uint64
	RoutesInAdjRIBIn        uint64
	RoutesInLocRIB          uint64
}

// ParseStatsReport parses an RFC 7854 Type 1 Statistics Report body.
func ParseStatsReport(payload []byte) (StatsReportData, error) {
	if len(payload) < 4 {
		return StatsReportData{}, fmt.Errorf("stats payload too short: %d bytes", len(payload))
	}

	count := binary.BigEndian.Uint32(payload[0:4])
	res := StatsReportData{StatsCount: count}

	offset := 4
	for offset+4 <= len(payload) {
		statType := binary.BigEndian.Uint16(payload[offset : offset+2])
		statLen := int(binary.BigEndian.Uint16(payload[offset+2 : offset+4]))
		offset += 4

		if offset+statLen > len(payload) {
			break
		}

		valBytes := payload[offset : offset+statLen]
		offset += statLen

		var val uint64
		if statLen == 4 {
			val = uint64(binary.BigEndian.Uint32(valBytes))
		} else if statLen == 8 {
			val = binary.BigEndian.Uint64(valBytes)
		}

		switch statType {
		case StatRejectedByInboundPolicy:
			res.RejectedByInboundPolicy = val
		case StatDuplicatePrefixAdvert:
			res.DuplicatePrefixAdvert = val
		case StatDuplicateWithdraw:
			res.DuplicateWithdraw = val
		case StatRoutesAdjRIBIn:
			res.RoutesInAdjRIBIn = val
		case StatRoutesLocRIB:
			res.RoutesInLocRIB = val
		}
	}

	return res, nil
}

// Helper functions for BGP attribute parsing

func formatPrefix(octets []byte, pfxLen int) string {
	ipBytes := make([]byte, 4)
	copy(ipBytes, octets)
	return fmt.Sprintf("%s/%d", net.IPv4(ipBytes[0], ipBytes[1], ipBytes[2], ipBytes[3]).String(), pfxLen)
}

func parseASPath(val []byte) string {
	idx := 0
	asns := make([]string, 0)
	for idx+2 <= len(val) {
		_ = val[idx] // segType: 2 = AS_SEQUENCE, 1 = AS_SET
		segLen := int(val[idx+1])
		idx += 2

		// segType 2 = AS_SEQUENCE, segType 1 = AS_SET
		for i := 0; i < segLen && idx+4 <= len(val); i++ {
			asn := binary.BigEndian.Uint32(val[idx : idx+4])
			asns = append(asns, fmt.Sprintf("%d", asn))
			idx += 4
		}
	}
	if len(asns) == 0 {
		return ""
	}
	return fmt.Sprintf("[%s]", joinStrings(asns, " "))
}

func parseCommunities(val []byte) []string {
	comms := make([]string, 0, len(val)/4)
	for idx := 0; idx+4 <= len(val); idx += 4 {
		high := binary.BigEndian.Uint16(val[idx : idx+2])
		low := binary.BigEndian.Uint16(val[idx+2 : idx+4])
		comms = append(comms, fmt.Sprintf("%d:%d", high, low))
	}
	return comms
}

func joinStrings(elems []string, sep string) string {
	if len(elems) == 0 {
		return ""
	}
	res := elems[0]
	for _, s := range elems[1:] {
		res += sep + s
	}
	return res
}
