package network

import (
	"fmt"
	"net"
	"os/exec"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"

	"network-software/internal/models"
)

var windowsTimeRegex = regexp.MustCompile(`tempo[=<](\d+)ms|time[=<](\d+)ms|Tempo=(\d+)ms`)

// PingHost pings a host using OS ping or TCP handshake fallback and returns latency and status.
func PingHost(host string, timeoutMs int, port int) models.PingResponse {
	if timeoutMs <= 0 {
		timeoutMs = 2000
	}

	trimmedHost := strings.TrimSpace(host)
	if trimmedHost == "" {
		return models.PingResponse{
			Host:    host,
			Success: false,
			Message: "Host cannot be empty",
		}
	}

	// Resolve IP if possible
	resolvedIP := ""
	ips, err := net.LookupIP(trimmedHost)
	if err == nil && len(ips) > 0 {
		resolvedIP = ips[0].String()
	} else {
		resolvedIP = trimmedHost
	}

	// If explicit port is specified, do TCP ping
	if port > 0 {
		start := time.Now()
		address := net.JoinHostPort(trimmedHost, strconv.Itoa(port))
		conn, err := net.DialTimeout("tcp", address, time.Duration(timeoutMs)*time.Millisecond)
		latency := float64(time.Since(start).Microseconds()) / 1000.0

		if err != nil {
			return models.PingResponse{
				Host:      trimmedHost,
				IP:        resolvedIP,
				Success:   false,
				LatencyMs: latency,
				Message:   fmt.Sprintf("TCP connect failed: %v", err),
				Method:    "tcp",
			}
		}
		_ = conn.Close()

		return models.PingResponse{
			Host:      trimmedHost,
			IP:        resolvedIP,
			Success:   true,
			LatencyMs: latency,
			Message:   fmt.Sprintf("TCP port %d open/reachable", port),
			Method:    "tcp",
		}
	}

	// Use OS ping
	return systemPing(trimmedHost, resolvedIP, timeoutMs)
}

func systemPing(host string, resolvedIP string, timeoutMs int) models.PingResponse {
	var cmd *exec.Cmd

	if runtime.GOOS == "windows" {
		cmd = exec.Command("ping", "-n", "1", "-w", strconv.Itoa(timeoutMs), host)
	} else {
		seconds := (timeoutMs + 999) / 1000
		cmd = exec.Command("ping", "-c", "1", "-W", strconv.Itoa(seconds), host)
	}

	start := time.Now()
	out, err := cmd.CombinedOutput()
	duration := float64(time.Since(start).Microseconds()) / 1000.0
	outputStr := string(out)

	if err != nil {
		// Try TCP fallback on port 80/443 if ping is blocked by firewall
		tcpStart := time.Now()
		conn, tcpErr := net.DialTimeout("tcp", net.JoinHostPort(host, "80"), time.Duration(timeoutMs)*time.Millisecond)
		if tcpErr == nil {
			_ = conn.Close()
			return models.PingResponse{
				Host:      host,
				IP:        resolvedIP,
				Success:   true,
				LatencyMs: float64(time.Since(tcpStart).Microseconds()) / 1000.0,
				Message:   "Ping ICMP blocked/failed, reached via HTTP (TCP 80)",
				Method:    "tcp_fallback",
			}
		}

		return models.PingResponse{
			Host:      host,
			IP:        resolvedIP,
			Success:   false,
			LatencyMs: duration,
			Message:   "Request timed out or host unreachable",
			Method:    "icmp",
		}
	}

	// Try extracting latency from output
	latency := duration
	matches := windowsTimeRegex.FindStringSubmatch(outputStr)
	for i := 1; i < len(matches); i++ {
		if matches[i] != "" {
			if ms, parseErr := strconv.ParseFloat(matches[i], 64); parseErr == nil {
				latency = ms
				break
			}
		}
	}

	return models.PingResponse{
		Host:      host,
		IP:        resolvedIP,
		Success:   true,
		LatencyMs: latency,
		Message:   "Host is UP",
		Method:    "icmp",
	}
}
