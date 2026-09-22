package network

import (
	"fmt"
	"net"
	"sync"
	"time"

	"network-software/internal/models"
)

var commonPorts = map[int]string{
	21:   "FTP",
	22:   "SSH",
	23:   "Telnet",
	25:   "SMTP",
	53:   "DNS",
	80:   "HTTP",
	110:  "POP3",
	143:  "IMAP",
	443:  "HTTPS",
	445:  "SMB",
	1433: "MSSQL",
	3306: "MySQL",
	3389: "RDP",
	5432: "PostgreSQL",
	6379: "Redis",
	8080: "HTTP-Alt",
	8443: "HTTPS-Alt",
	9000: "Portainer/Sonar",
}

// DefaultCommonPorts returns the list of standard ports to check.
func DefaultCommonPorts() []int {
	return []int{21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 1433, 3306, 3389, 5432, 6379, 8080, 8443}
}

// ScanPorts scans a target host for open ports concurrently.
func ScanPorts(host string, ports []int, timeoutMs int) models.PortScanResponse {
	if timeoutMs <= 0 {
		timeoutMs = 800
	}
	if len(ports) == 0 {
		ports = DefaultCommonPorts()
	}

	// Limit to max 250 ports per request for safety and performance
	if len(ports) > 250 {
		ports = ports[:250]
	}

	resolvedIP := ""
	ips, err := net.LookupIP(host)
	if err == nil && len(ips) > 0 {
		resolvedIP = ips[0].String()
	} else {
		resolvedIP = host
	}

	start := time.Now()
	var wg sync.WaitGroup
	var mu sync.Mutex
	results := make([]models.PortResult, 0, len(ports))
	openCount := 0

	// Worker pool semaphore to limit concurrent sockets
	sem := make(chan struct{}, 30)

	for _, p := range ports {
		port := p
		wg.Add(1)
		sem <- struct{}{}

		go func() {
			defer wg.Done()
			defer func() { <-sem }()

			service := commonPorts[port]
			if service == "" {
				service = "Unknown"
			}

			target := fmt.Sprintf("%s:%d", host, port)
			pStart := time.Now()
			conn, err := net.DialTimeout("tcp", target, time.Duration(timeoutMs)*time.Millisecond)
			latency := float64(time.Since(pStart).Microseconds()) / 1000.0

			isOpen := false
			if err == nil {
				isOpen = true
				_ = conn.Close()
			}

			mu.Lock()
			if isOpen {
				openCount++
			}
			results = append(results, models.PortResult{
				Port:      port,
				Service:   service,
				IsOpen:    isOpen,
				LatencyMs: latency,
			})
			mu.Unlock()
		}()
	}

	wg.Wait()

	return models.PortScanResponse{
		Host:       host,
		IP:         resolvedIP,
		TotalPorts: len(ports),
		OpenPorts:  openCount,
		DurationMs: float64(time.Since(start).Microseconds()) / 1000.0,
		Results:    results,
	}
}
