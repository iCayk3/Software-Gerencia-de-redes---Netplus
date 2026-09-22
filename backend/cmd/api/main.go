package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"

	"network-software/internal/api"
	"network-software/internal/storage"
	"network-software/internal/telemetry"
)

func main() {
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	dataDir := os.Getenv("DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}

	syslogPort := 1514
	if sp := os.Getenv("SYSLOG_PORT"); sp != "" {
		if val, err := strconv.Atoi(sp); err == nil && val > 0 {
			syslogPort = val
		}
	}

	pollInterval := 45 // seconds
	if pi := os.Getenv("POLL_INTERVAL"); pi != "" {
		if val, err := strconv.Atoi(pi); err == nil && val > 0 {
			pollInterval = val
		}
	}

	store, err := storage.NewDeviceStore(dataDir)
	if err != nil {
		log.Fatalf("Failed to initialize device storage: %v", err)
	}

	asMetaStore, err := storage.NewASMetadataStore(dataDir)
	if err != nil {
		log.Fatalf("Failed to initialize AS metadata storage: %v", err)
	}

	telEngine, err := telemetry.NewEngine(store, dataDir, syslogPort, pollInterval)
	if err != nil {
		log.Fatalf("Failed to initialize telemetry engine: %v", err)
	}

	// Start background readings collector and Syslog UDP server
	telEngine.Start()
	defer telEngine.Stop()

	router := api.NewRouter(store, asMetaStore, telEngine, dataDir)
	addr := fmt.Sprintf(":%s", port)

	log.Printf("==================================================")
	log.Printf("   NetPulse - BGP & OSPF Routing Manager (Go)     ")
	log.Printf("   Vendors: Huawei (NE/CloudEngine), Datacom DmOS,")
	log.Printf("            MikroTik (RouterOS v6 & v7)           ")
	log.Printf("   Server listening on http://localhost%s       ", addr)
	log.Printf("   API Health Check: http://localhost%s/api/health", addr)
	log.Printf("   Telemetry Engine: Background Collector (every %ds)", pollInterval)
	log.Printf("   Syslog Server:    UDP Port %d (Active)        ", syslogPort)
	log.Printf("==================================================")

	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatalf("Server stopped unexpectedly: %v", err)
	}
}
