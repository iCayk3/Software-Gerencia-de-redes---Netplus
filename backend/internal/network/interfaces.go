package network

import (
	"net"
	"network-software/internal/models"
	"strings"
)

// GetNetworkInterfaces returns a list of all local network adapters with their IP addresses.
func GetNetworkInterfaces() ([]models.NetworkInterface, error) {
	ifaces, err := net.Interfaces()
	if err != nil {
		return nil, err
	}

	var result []models.NetworkInterface
	for _, iface := range ifaces {
		flags := strings.Split(iface.Flags.String(), "|")
		isUp := iface.Flags&net.FlagUp != 0
		isLoopback := iface.Flags&net.FlagLoopback != 0

		var ipAddrs []string
		addrs, err := iface.Addrs()
		if err == nil {
			for _, addr := range addrs {
				ipAddrs = append(ipAddrs, addr.String())
			}
		}

		result = append(result, models.NetworkInterface{
			Index:        iface.Index,
			Name:         iface.Name,
			HardwareAddr: iface.HardwareAddr.String(),
			Flags:        flags,
			MTU:          iface.MTU,
			IPAddresses:  ipAddrs,
			IsUp:         isUp,
			IsLoopback:   isLoopback,
		})
	}

	return result, nil
}
