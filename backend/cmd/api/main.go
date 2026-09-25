package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"

	"network-software/internal/api"
	"network-software/internal/database"
	"network-software/internal/storage"
	"network-software/internal/storage/postgres"
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

	bmpPort := 11019
	if bp := os.Getenv("BMP_PORT"); bp != "" {
		if val, err := strconv.Atoi(bp); err == nil && val > 0 {
			bmpPort = val
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

	telEngine, err := telemetry.NewEngine(store, dataDir, syslogPort, bmpPort, pollInterval)
	if err != nil {
		log.Fatalf("Failed to initialize telemetry engine: %v", err)
	}

	// Start background readings collector, Syslog UDP server, and BMP TCP collector
	telEngine.Start()
	defer telEngine.Stop()

	// Database & Enterprise Storage (PostgreSQL with graceful fallback)
	var tenantStore storage.ITenantStore
	var userStore storage.IUserStore
	var auditStore storage.IAuditStore

	db, err := database.Connect()
	if err == nil && db != nil {
		_ = database.RunMigrations(db, "migrations/001_init_schema.sql")
		_ = database.AutoMigrateFromJSON(db)
		tenantStore = postgres.NewTenantStore(db)
		userStore = postgres.NewUserStore(db)
		auditStore = postgres.NewAuditStore(db)
		log.Printf("[Database] 🐘 Repositório PostgreSQL ativado para Empresas, Usuários e Trilha de Auditoria.")
	} else {
		log.Printf("[Database] ⚠️  PostgreSQL não conectado (%v). Usando armazenamento local em arquivo.", err)
		tenantStore = storage.NewMemoryTenantStore(filepath.Join(dataDir, "tenants.json"))
		userStore = storage.NewMemoryUserStore(filepath.Join(dataDir, "users.json"))
		auditStore = storage.NewMemoryAuditStore(filepath.Join(dataDir, "audit_logs.json"))
	}

	router := api.NewRouter(store, asMetaStore, telEngine, dataDir, tenantStore, userStore, auditStore)
	addr := fmt.Sprintf(":%s", port)

	log.Printf("==================================================")
	log.Printf("   NetPulse - BGP & OSPF Routing Manager (Go)     ")
	log.Printf("   Vendors: Huawei (NE/CloudEngine), Datacom DmOS,")
	log.Printf("            MikroTik (RouterOS v6 & v7)           ")
	log.Printf("   Server listening on http://localhost%s       ", addr)
	log.Printf("   API Health Check: http://localhost%s/api/health", addr)
	log.Printf("   Telemetry Engine: Background Collector (every %ds)", pollInterval)
	log.Printf("   Syslog Server:    UDP Port %d (Active)        ", syslogPort)
	log.Printf("   BMP Collector:    TCP Port %d (RFC 7854 Active)", bmpPort)
	log.Printf("==================================================")

	if err := http.ListenAndServe(addr, router); err != nil {
		log.Fatalf("Server stopped unexpectedly: %v", err)
	}
}
