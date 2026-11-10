package drivers

import (
	"fmt"

	"network-software/internal/compliance"
	"network-software/internal/models"
	"network-software/internal/sshclient"
	"network-software/internal/telnetclient"
)

// FiberhomeDriver handles communication with Fiberhome OLTs (AN5516-04, AN6000-2, AN5516-06, etc.)
// supporting both Telnet (standard port 23) and SSH (port 22).
type FiberhomeDriver struct {
	device       *models.Device
	telnetClient *telnetclient.TelnetClient
	sshClient    *sshclient.SSHClient
}

// NewFiberhomeDriver creates a new driver for FiberHome equipment.
func NewFiberhomeDriver(device *models.Device) *FiberhomeDriver {
	port := device.Port
	if port <= 0 {
		if device.Protocol == "ssh" {
			port = 22
		} else {
			port = 23
		}
	}

	return &FiberhomeDriver{
		device:       device,
		telnetClient: telnetclient.NewTelnetClient(device.Host, port, device.Username, device.Password),
		sshClient:    sshclient.NewSSHClient(device.Host, port, device.Username, device.Password),
	}
}

func (d *FiberhomeDriver) isTelnet() bool {
	if d.device.Protocol == "telnet" {
		return true
	}
	if d.device.Protocol == "ssh" {
		return false
	}
	// Default heuristic: port 23 or undefined protocol on OLT -> telnet
	return d.device.Port == 23 || d.device.Port == 0 || d.device.DeviceRole == models.RoleOLT
}

func (d *FiberhomeDriver) TestConnection() (models.SSHTestResult, error) {
	if d.isTelnet() {
		latency, banner, err := d.telnetClient.TestConnection()
		if err != nil {
			return models.SSHTestResult{
				Success: false,
				Error:   err.Error(),
			}, err
		}
		return models.SSHTestResult{
			Success:   true,
			LatencyMs: latency,
			Banner:    banner,
		}, nil
	}

	latency, banner, err := d.sshClient.TestConnection()
	if err != nil {
		return models.SSHTestResult{
			Success: false,
			Error:   err.Error(),
		}, err
	}
	return models.SSHTestResult{
		Success:   true,
		LatencyMs: latency,
		Banner:    banner,
	}, nil
}

func (d *FiberhomeDriver) RunCommand(cmd string) (string, error) {
	if d.isTelnet() {
		return d.telnetClient.RunCommand(cmd)
	}
	return d.sshClient.RunCommand(cmd)
}

func (d *FiberhomeDriver) GetBGPSessions() ([]models.BGPSession, error) {
	return []models.BGPSession{}, nil
}

func (d *FiberhomeDriver) GetOSPFNeighbors() ([]models.OSPFNeighbor, error) {
	return []models.OSPFNeighbor{}, nil
}

func (d *FiberhomeDriver) GetStaticRoutes() ([]models.StaticRoute, error) {
	return []models.StaticRoute{}, nil
}

func (d *FiberhomeDriver) AddStaticRoute(req models.StaticRouteRequest) error {
	return fmt.Errorf("rotas estáticas não são gerenciadas em OLTs FiberHome pelo NetPulse")
}

func (d *FiberhomeDriver) DeleteStaticRoute(destination, nextHop string) error {
	return fmt.Errorf("rotas estáticas não são gerenciadas em OLTs FiberHome pelo NetPulse")
}

func (d *FiberhomeDriver) GetBGPPrepends() (*models.DevicePrependOverview, error) {
	return nil, nil
}

func (d *FiberhomeDriver) ApplyBGPPrepend(req models.PrependApplyRequest) error {
	return fmt.Errorf("BGP Prepend não é aplicável a OLTs")
}

func (d *FiberhomeDriver) SetBGPLocalPreference(req models.LocalPrefApplyRequest) error {
	return fmt.Errorf("BGP Local-Preference não é aplicável a OLTs")
}

func (d *FiberhomeDriver) GetBGPImportPolicy(peerIP string) (string, int, int, error) {
	return "", 0, 0, fmt.Errorf("BGP Import Policy não é aplicável a OLTs")
}

func (d *FiberhomeDriver) GetAllBGPImportPolicies() (map[string]models.BGPImportPolicyInfo, error) {
	return map[string]models.BGPImportPolicyInfo{}, nil
}

func (d *FiberhomeDriver) AuditCompliance(expectedASN string) (*models.DeviceComplianceAudit, error) {
	ins := compliance.NewInspector()
	return ins.AuditDevice(d.device, d, expectedASN)
}
