package drivers

import (
	"fmt"
	"strings"

	"network-software/internal/models"
	"network-software/internal/sshclient"
)

// NetworkDriver defines the unified operations supported across all equipment vendors.
type NetworkDriver interface {
	TestConnection() (models.SSHTestResult, error)
	GetBGPSessions() ([]models.BGPSession, error)
	GetOSPFNeighbors() ([]models.OSPFNeighbor, error)
	GetStaticRoutes() ([]models.StaticRoute, error)
	AddStaticRoute(req models.StaticRouteRequest) error
	DeleteStaticRoute(destination, nextHop string) error
	GetBGPPrepends() (*models.DevicePrependOverview, error)
	ApplyBGPPrepend(req models.PrependApplyRequest) error
	SetBGPLocalPreference(req models.LocalPrefApplyRequest) error
	GetBGPImportPolicy(peerIP string) (policyName string, node int, localPref int, err error)
	GetAllBGPImportPolicies() (map[string]models.BGPImportPolicyInfo, error)
	RunCommand(cmd string) (string, error)
	AuditCompliance(expectedASN string) (*models.DeviceComplianceAudit, error)
}

// ResolveVendor detects and normalizes the effective vendor of a device
// based on explicit vendor, model name, and hostname hints.
func ResolveVendor(dev *models.Device) models.VendorType {
	if dev == nil {
		return models.VendorHuawei
	}

	modelUpper := strings.ToUpper(strings.TrimSpace(dev.Model))
	nameUpper := strings.ToUpper(strings.TrimSpace(dev.Name))

	// MikroTik detection (e.g. CCR-1036, RB4011, CRS326, Cloud Core, RouterBOARD, RouterOS)
	if strings.HasPrefix(modelUpper, "CCR") ||
		strings.HasPrefix(modelUpper, "RB") ||
		strings.HasPrefix(modelUpper, "CRS") ||
		strings.Contains(modelUpper, "ROUTEROS") ||
		strings.Contains(modelUpper, "MIKROTIK") ||
		strings.Contains(modelUpper, "CLOUD CORE") ||
		strings.Contains(nameUpper, "ROUTEROS") ||
		strings.Contains(nameUpper, "MIKROTIK") {
		if dev.Vendor == models.VendorMikrotikV7 {
			return models.VendorMikrotikV7
		}
		return models.VendorMikrotikV6
	}

	// Datacom detection (e.g. DM4370, DM4100, DmOS, Datacom)
	if strings.HasPrefix(modelUpper, "DM") ||
		strings.Contains(modelUpper, "DATACOM") ||
		strings.Contains(modelUpper, "DMOS") ||
		strings.Contains(nameUpper, "DATACOM") ||
		strings.Contains(nameUpper, "DMOS") {
		return models.VendorDatacom
	}

	// FiberHome detection (e.g. AN5516-04, AN6000-2, AN5516, AN6000, FiberHome, OLT)
	if strings.Contains(modelUpper, "AN5516") ||
		strings.Contains(modelUpper, "AN6000") ||
		strings.Contains(modelUpper, "FIBERHOME") ||
		strings.Contains(nameUpper, "AN5516") ||
		strings.Contains(nameUpper, "AN6000") ||
		strings.Contains(nameUpper, "FIBERHOME") ||
		dev.Vendor == models.VendorFiberhome {
		return models.VendorFiberhome
	}

	// Huawei detection (e.g. NE8000, NE40, S6730, S5700, CE6800, Huawei, VRP)
	if strings.HasPrefix(modelUpper, "NE") ||
		strings.HasPrefix(modelUpper, "S67") ||
		strings.HasPrefix(modelUpper, "S57") ||
		strings.HasPrefix(modelUpper, "CE") ||
		strings.Contains(modelUpper, "HUAWEI") ||
		strings.Contains(modelUpper, "VRP") ||
		strings.Contains(nameUpper, "HUAWEI") {
		return models.VendorHuawei
	}

	if dev.Vendor != "" {
		return dev.Vendor
	}

	return models.VendorHuawei
}

// NewDriver instantiates the appropriate vendor driver for a device.
func NewDriver(device *models.Device) (NetworkDriver, error) {
	client := sshclient.NewSSHClient(device.Host, device.Port, device.Username, device.Password)
	vendor := ResolveVendor(device)

	switch vendor {
	case models.VendorHuawei:
		return NewHuaweiDriver(device, client), nil
	case models.VendorDatacom:
		return NewDatacomDriver(device, client), nil
	case models.VendorMikrotikV6:
		return NewMikrotikV6Driver(device, client), nil
	case models.VendorMikrotikV7:
		return NewMikrotikV7Driver(device, client), nil
	case models.VendorFiberhome:
		return NewFiberhomeDriver(device), nil
	default:
		// If protocol is explicitly telnet or role is OLT, use FiberHome/Telnet driver
		if device.Protocol == "telnet" || device.Port == 23 || device.DeviceRole == models.RoleOLT {
			return NewFiberhomeDriver(device), nil
		}
		return nil, fmt.Errorf("unsupported vendor '%s'", vendor)
	}
}
