package network

import (
	"fmt"
	"net"
	"strings"

	"network-software/internal/models"
)

// LookupDNS queries DNS information for a given host or domain.
func LookupDNS(domain string) models.DNSLookupResponse {
	cleanDomain := strings.TrimSpace(domain)
	// Remove protocol prefix if accidentally included
	cleanDomain = strings.TrimPrefix(cleanDomain, "http://")
	cleanDomain = strings.TrimPrefix(cleanDomain, "https://")
	if idx := strings.Index(cleanDomain, "/"); idx != -1 {
		cleanDomain = cleanDomain[:idx]
	}
	if idx := strings.Index(cleanDomain, ":"); idx != -1 {
		cleanDomain = cleanDomain[:idx]
	}

	res := models.DNSLookupResponse{
		Domain: cleanDomain,
	}

	if cleanDomain == "" {
		res.Error = "Domain cannot be empty"
		return res
	}

	// Lookup IPs
	ips, err := net.LookupIP(cleanDomain)
	if err != nil {
		res.Error = fmt.Sprintf("Lookup failed: %v", err)
		return res
	}
	for _, ip := range ips {
		res.IPs = append(res.IPs, ip.String())
	}

	// Lookup CNAME
	cname, err := net.LookupCNAME(cleanDomain)
	if err == nil && cname != cleanDomain && cname != cleanDomain+"." {
		res.CNAME = cname
	}

	// Lookup MX
	mxRecords, err := net.LookupMX(cleanDomain)
	if err == nil {
		for _, mx := range mxRecords {
			res.MX = append(res.MX, fmt.Sprintf("%s (pref: %d)", mx.Host, mx.Pref))
		}
	}

	// Lookup TXT
	txtRecords, err := net.LookupTXT(cleanDomain)
	if err == nil {
		res.TXT = txtRecords
	}

	return res
}
