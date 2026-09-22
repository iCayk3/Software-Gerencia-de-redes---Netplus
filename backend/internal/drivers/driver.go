package drivers

import (
	"fmt"
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
}

// NewDriver instantiates the appropriate vendor driver for a device.
func NewDriver(device *models.Device) (NetworkDriver, error) {
	client := sshclient.NewSSHClient(device.Host, device.Port, device.Username, device.Password)

	switch device.Vendor {
	case models.VendorHuawei:
		return NewHuaweiDriver(device, client), nil
	case models.VendorDatacom:
		return NewDatacomDriver(device, client), nil
	case models.VendorMikrotikV6:
		return NewMikrotikV6Driver(device, client), nil
	case models.VendorMikrotikV7:
		return NewMikrotikV7Driver(device, client), nil
	default:
		return nil, fmt.Errorf("unsupported vendor '%s'", device.Vendor)
	}
}
