package telemetry

import (
	"fmt"
	"strings"
	"time"

	"network-software/internal/models"
)

// Detector analyzes telemetry snapshots and event streams to detect network anomalies.
type Detector struct {
	alertStore  *AlertStore
	broadcaster *Broadcaster
}

// NewDetector creates a new anomaly detector.
func NewDetector(alertStore *AlertStore, broadcaster *Broadcaster) *Detector {
	return &Detector{
		alertStore:  alertStore,
		broadcaster: broadcaster,
	}
}

// EvaluateDeviceReachability checks device accessibility.
func (d *Detector) EvaluateDeviceReachability(device models.Device, online bool, errDetail string) {
	target := fmt.Sprintf("%s (%s:%d)", device.Name, device.Host, device.Port)

	if !online {
		existing := d.alertStore.FindActiveAlert(device.ID, models.AlertDeviceOffline, target)
		if existing == nil {
			msg := fmt.Sprintf("Equipamento %s (%s) está inacessível via SSH/Rede.", device.Name, device.Host)
			if errDetail != "" {
				msg += fmt.Sprintf(" Detalhe: %s", errDetail)
			}
			newAlert := d.alertStore.AddAlert(models.Alert{
				DeviceID:   device.ID,
				DeviceName: device.Name,
				Type:       models.AlertDeviceOffline,
				Severity:   models.SeverityCritical,
				Target:     target,
				Message:    msg,
				StartedAt:  time.Now(),
				Status:     "active",
			})
			d.broadcaster.Broadcast("alert_created", newAlert)
		}
	} else {
		// Device is online: auto-resolve any active offline alert
		existing := d.alertStore.FindActiveAlert(device.ID, models.AlertDeviceOffline, target)
		if existing != nil {
			resolved, err := d.alertStore.ResolveAlert(existing.ID)
			if err == nil && resolved != nil {
				d.broadcaster.Broadcast("alert_resolved", resolved)
			}
		}
	}
}

// EvaluateBGPSessions compares current BGP sessions to find dropped peers or prefix drops.
func (d *Detector) EvaluateBGPSessions(deviceID, deviceName string, sessions []models.BGPSession, prevSessions []models.BGPSession) {
	prevMap := make(map[string]models.BGPSession)
	for _, s := range prevSessions {
		prevMap[s.PeerIP] = s
	}

	for _, s := range sessions {
		target := fmt.Sprintf("Peer %s (AS %s)", s.PeerIP, s.RemoteAS)
		isEstablished := strings.EqualFold(s.State, "Established")

		if !isEstablished {
			// BGP peer is not established (Idle, Active, Connect, Down, etc.)
			existing := d.alertStore.FindActiveAlert(deviceID, models.AlertBGPDown, target)
			if existing == nil {
				newAlert := d.alertStore.AddAlert(models.Alert{
					DeviceID:   deviceID,
					DeviceName: deviceName,
					Type:       models.AlertBGPDown,
					Severity:   models.SeverityCritical,
					Target:     target,
					Message:    fmt.Sprintf("Sessão BGP com %s (AS %s) caiu no roteador %s. Estado: %s", s.PeerIP, s.RemoteAS, deviceName, s.State),
					StartedAt:  time.Now(),
					Status:     "active",
				})
				d.broadcaster.Broadcast("alert_created", newAlert)
			}
		} else {
			// Peer is Established -> auto-resolve any active AlertBGPDown
			existing := d.alertStore.FindActiveAlert(deviceID, models.AlertBGPDown, target)
			if existing != nil {
				resolved, err := d.alertStore.ResolveAlert(existing.ID)
				if err == nil && resolved != nil {
					d.broadcaster.Broadcast("alert_resolved", resolved)
				}
			}

			// Check for Prefix Drop (was receiving prefixes > 0, now dropped to 0)
			if prev, ok := prevMap[s.PeerIP]; ok {
				if prev.PrefixesReceived > 0 && s.PrefixesReceived == 0 {
					pfxTarget := fmt.Sprintf("Prefixos %s (AS %s)", s.PeerIP, s.RemoteAS)
					if d.alertStore.FindActiveAlert(deviceID, models.AlertBGPPrefixDrop, pfxTarget) == nil {
						newAlert := d.alertStore.AddAlert(models.Alert{
							DeviceID:   deviceID,
							DeviceName: deviceName,
							Type:       models.AlertBGPPrefixDrop,
							Severity:   models.SeverityWarning,
							Target:     pfxTarget,
							Message:    fmt.Sprintf("Queda abrupta de rotas recebidas do peer %s: prefixos caíram de %d para 0", s.PeerIP, prev.PrefixesReceived),
							StartedAt:  time.Now(),
							Status:     "active",
						})
						d.broadcaster.Broadcast("alert_created", newAlert)
					}
				} else if s.PrefixesReceived > 0 {
					// Auto-resolve prefix drop
					pfxTarget := fmt.Sprintf("Prefixos %s (AS %s)", s.PeerIP, s.RemoteAS)
					existingPfx := d.alertStore.FindActiveAlert(deviceID, models.AlertBGPPrefixDrop, pfxTarget)
					if existingPfx != nil {
						resolved, err := d.alertStore.ResolveAlert(existingPfx.ID)
						if err == nil && resolved != nil {
							d.broadcaster.Broadcast("alert_resolved", resolved)
						}
					}
				}
			}
		}
	}
}

// EvaluateOSPFNeighbors evaluates OSPF adjacencies for drops.
func (d *Detector) EvaluateOSPFNeighbors(deviceID, deviceName string, neighbors []models.OSPFNeighbor) {
	for _, n := range neighbors {
		target := fmt.Sprintf("Vizinho %s (%s - Área %s)", n.NeighborID, n.Interface, n.Area)
		isUp := strings.EqualFold(n.State, "Full") || strings.EqualFold(n.State, "2-Way")

		if !isUp {
			existing := d.alertStore.FindActiveAlert(deviceID, models.AlertOSPFDown, target)
			if existing == nil {
				newAlert := d.alertStore.AddAlert(models.Alert{
					DeviceID:   deviceID,
					DeviceName: deviceName,
					Type:       models.AlertOSPFDown,
					Severity:   models.SeverityWarning,
					Target:     target,
					Message:    fmt.Sprintf("Adjacência OSPF com %s na interface %s entrou no estado '%s'", n.NeighborID, n.Interface, n.State),
					StartedAt:  time.Now(),
					Status:     "active",
				})
				d.broadcaster.Broadcast("alert_created", newAlert)
			}
		} else {
			// Adjacency is up -> auto-resolve
			existing := d.alertStore.FindActiveAlert(deviceID, models.AlertOSPFDown, target)
			if existing != nil {
				resolved, err := d.alertStore.ResolveAlert(existing.ID)
				if err == nil && resolved != nil {
					d.broadcaster.Broadcast("alert_resolved", resolved)
				}
			}
		}
	}
}

// RecordSyslogAlert generates an immediate alert from a parsed Syslog notification.
func (d *Detector) RecordSyslogAlert(deviceID, deviceName, alertType string, severity models.AlertSeverity, target, message string) models.Alert {
	newAlert := d.alertStore.AddAlert(models.Alert{
		DeviceID:   deviceID,
		DeviceName: deviceName,
		Type:       models.AlertType(alertType),
		Severity:   severity,
		Target:     target,
		Message:    message,
		StartedAt:  time.Now(),
		Status:     "active",
	})
	d.broadcaster.Broadcast("alert_created", newAlert)
	return newAlert
}
