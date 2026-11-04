package main

import (
	"context"
	"embed"
	"fmt"
	"io/fs"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"netpulse-master/internal/auth"
	"netpulse-master/internal/handlers"
	"netpulse-master/internal/store"
)

//go:embed web/* web/static/*
var webFiles embed.FS

func main() {
	port := os.Getenv("MASTER_PORT")
	if port == "" {
		port = "8090"
	}

	dataDir := os.Getenv("MASTER_DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}

	licenseStore, err := store.NewStore(dataDir)
	if err != nil {
		log.Fatalf("[Master] Falha ao inicializar armazenamento: %v", err)
	}

	authMgr := auth.NewAuthManager()
	hbHandler := handlers.NewHeartbeatHandler(licenseStore)
	adminHandler := handlers.NewAdminHandler(licenseStore, authMgr)

	mux := http.NewServeMux()

	// 1. Healthcheck
	mux.HandleFunc("GET /healthz", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"online"}`))
	})
	mux.HandleFunc("GET /api/v1/health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"status":"online","service":"netpulse-master-server","version":"1.0.0"}`))
	})

	// 2. Client Heartbeat & License Verification (Called by NetPulse Edge instances)
	mux.HandleFunc("POST /api/v1/heartbeat", hbHandler.HandleHeartbeat)
	mux.HandleFunc("POST /api/v1/verify", hbHandler.HandleVerify)

	// 3. Vendor Admin API (Protected by RequireAdmin)
	mux.HandleFunc("POST /api/admin/login", adminHandler.Login)
	mux.HandleFunc("GET /api/admin/fleet/overview", authMgr.RequireAdmin(adminHandler.GetOverview))
	mux.HandleFunc("GET /api/admin/licenses", authMgr.RequireAdmin(adminHandler.ListLicenses))
	mux.HandleFunc("POST /api/admin/licenses", authMgr.RequireAdmin(adminHandler.CreateLicense))
	mux.HandleFunc("PUT /api/admin/licenses/{id}", authMgr.RequireAdmin(adminHandler.UpdateLicense))
	mux.HandleFunc("POST /api/admin/licenses/{id}/toggle-status", authMgr.RequireAdmin(adminHandler.ToggleStatus))
	mux.HandleFunc("POST /api/admin/licenses/{id}/renew", authMgr.RequireAdmin(adminHandler.RenewLicense))
	mux.HandleFunc("DELETE /api/admin/licenses/{id}", authMgr.RequireAdmin(adminHandler.DeleteLicense))

	// 4. Web Dashboard (Embedded Assets)
	subFS, err := fs.Sub(webFiles, "web")
	if err != nil {
		log.Fatalf("[Master] Falha ao carregar arquivos web: %v", err)
	}

	fileServer := http.FileServer(http.FS(subFS))
	mux.Handle("/", fileServer)

	// Attach CORS and Logger
	handler := handlers.EnableCORS(mux)

	addr := fmt.Sprintf(":%s", port)
	server := &http.Server{
		Addr:         addr,
		Handler:      handler,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  60 * time.Second,
	}

	log.Printf("==================================================")
	log.Printf("   NetPulse - Central License & Master Server     ")
	log.Printf("   Web Dashboard: http://localhost:%s           ", port)
	log.Printf("   Heartbeat API: http://localhost:%s/api/v1/heartbeat", port)
	log.Printf("   Data Directory: %s                            ", dataDir)
	log.Printf("==================================================")

	stopChan := make(chan os.Signal, 1)
	signal.Notify(stopChan, os.Interrupt, syscall.SIGTERM)

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("[Master] Servidor parou inesperadamente: %v", err)
		}
	}()

	<-stopChan
	log.Printf("[Master] Encerrando servidor com segurança...")

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = server.Shutdown(ctx)
	log.Printf("[Master] Servidor encerrado.")
}
