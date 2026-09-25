package api

import (
	"log"
	"net/http"
	"os"
	"path/filepath"

	"network-software/internal/models"
	"network-software/internal/rpki"
	"network-software/internal/storage"
	"network-software/internal/telemetry"
	"network-software/internal/traffic"
)

// NewRouter registers all routes and attaches middleware.
func NewRouter(
	store *storage.DeviceStore,
	asMetaStore *storage.ASMetadataStore,
	engine *telemetry.Engine,
	dataDir string,
	tenantStore storage.ITenantStore,
	userStore storage.IUserStore,
	auditStore storage.IAuditStore,
) http.Handler {
	mux := http.NewServeMux()

	uploadDir := filepath.Join(dataDir, "uploads")
	_ = os.MkdirAll(uploadDir, 0755)

	trafficSvc := traffic.NewService(store, asMetaStore)
	trafficSvc.Start()

	profileStore, err := storage.NewProfileStore(dataDir)
	if err != nil {
		log.Printf("[Router] Aviso: falha ao inicializar ProfileStore: %v", err)
	}
	profileSvc := traffic.NewProfileService(trafficSvc, profileStore, store)
	profileCtrl := NewProfileController(profileSvc, auditStore)

	devCtrl := NewDeviceController(store, engine)
	telCtrl := NewTelemetryController(engine, store)
	routesCtrl := NewRoutesController(store, trafficSvc, auditStore)

	peerMetaStore, err := storage.NewPeerMetadataStore(dataDir)
	if err != nil {
		log.Printf("[Router] Aviso: falha ao inicializar PeerMetadataStore: %v", err)
	}

	trafficCtrl := NewTrafficController(store, asMetaStore, trafficSvc, uploadDir, auditStore)
	if peerMetaStore != nil {
		trafficCtrl.SetPeerMetadataStore(peerMetaStore)
	}

	tenantCtrl := NewTenantController(tenantStore, auditStore)
	authCtrl := NewAuthController(userStore, tenantStore, auditStore)
	auditCtrl := NewAuditController(auditStore)
	rpkiCtrl := NewRPKIController(rpki.NewValidator())

	// Base & Health check
	mux.HandleFunc("GET /api/health", HandleHealth)

	// Multi-Tenant Company Management
	mux.HandleFunc("GET /api/tenants", tenantCtrl.ListTenants)
	mux.HandleFunc("GET /api/tenants/{id}", tenantCtrl.GetTenant)
	mux.HandleFunc("POST /api/tenants", RequireSuperAdmin(tenantCtrl.CreateTenant))
	mux.HandleFunc("PUT /api/tenants/{id}", RequireRole(models.RoleAdmin)(tenantCtrl.UpdateTenant))
	mux.HandleFunc("DELETE /api/tenants/{id}", RequireSuperAdmin(tenantCtrl.DeleteTenant))

	// Authentication & Multi-Tenant User Management
	mux.HandleFunc("POST /api/auth/login", authCtrl.Login)
	mux.HandleFunc("GET /api/auth/me", authCtrl.Me)
	mux.HandleFunc("GET /api/auth/users", RequireRole(models.RoleAdmin)(authCtrl.ListUsers))
	mux.HandleFunc("POST /api/auth/users", RequireRole(models.RoleAdmin)(authCtrl.CreateUser))
	mux.HandleFunc("PUT /api/auth/users/{id}", RequireRole(models.RoleAdmin)(authCtrl.UpdateUser))
	mux.HandleFunc("DELETE /api/auth/users/{id}", RequireRole(models.RoleAdmin)(authCtrl.DeleteUser))

	// Audit Trail (Compliance & Operation Logging)
	mux.HandleFunc("GET /api/audit/logs", auditCtrl.ListAuditLogs)

	// Network diagnostic utilities
	mux.HandleFunc("GET /api/network/interfaces", HandleGetInterfaces)
	mux.HandleFunc("POST /api/network/ping", HandlePing)
	mux.HandleFunc("POST /api/network/scan-ports", HandlePortScan)
	mux.HandleFunc("GET /api/network/dns", HandleDNS)

	// Device Inventory management
	mux.HandleFunc("GET /api/devices", devCtrl.ListDevices)
	mux.HandleFunc("GET /api/devices/{id}", devCtrl.GetDevice)
	mux.HandleFunc("POST /api/devices", RequireRole(models.RoleAdmin)(devCtrl.CreateDevice))
	mux.HandleFunc("PUT /api/devices/{id}", RequireRole(models.RoleAdmin)(devCtrl.UpdateDevice))
	mux.HandleFunc("DELETE /api/devices/{id}", RequireRole(models.RoleAdmin)(devCtrl.DeleteDevice))
	mux.HandleFunc("POST /api/devices/{id}/test", devCtrl.TestDevice)

	// Routing inspection per device
	mux.HandleFunc("GET /api/devices/{id}/bgp", devCtrl.GetDeviceBGP)
	mux.HandleFunc("GET /api/devices/{id}/ospf", devCtrl.GetDeviceOSPF)
	mux.HandleFunc("POST /api/devices/{id}/exec", RequireRole(models.RoleAdmin, models.RoleNOCOperator)(devCtrl.ExecDeviceCommand))

	// Consolidated routing inspection across all devices
	mux.HandleFunc("GET /api/bgp/all", devCtrl.GetAllBGP)
	mux.HandleFunc("GET /api/ospf/all", devCtrl.GetAllOSPF)

	// Static Routes & Traffic Engineering (Upload)
	mux.HandleFunc("GET /api/devices/{id}/routes/static", routesCtrl.GetDeviceStaticRoutes)
	mux.HandleFunc("GET /api/routes/static/all", routesCtrl.GetAllStaticRoutes)
	mux.HandleFunc("POST /api/devices/{id}/routes/static", RequireRole(models.RoleAdmin, models.RoleNOCOperator)(routesCtrl.AddDeviceStaticRoute))
	mux.HandleFunc("DELETE /api/devices/{id}/routes/static", RequireRole(models.RoleAdmin, models.RoleNOCOperator)(routesCtrl.DeleteDeviceStaticRoute))

	// Smart Traffic Engineering (Upload Overview by BGP AS)
	mux.HandleFunc("GET /api/traffic/upload/overview", trafficCtrl.GetUploadOverview)
	mux.HandleFunc("POST /api/traffic/upload/local-pref", RequireRole(models.RoleAdmin, models.RoleNOCOperator)(trafficCtrl.SetLocalPreference))
	mux.HandleFunc("GET /api/traffic/as-metadata", trafficCtrl.GetASMetadata)
	mux.HandleFunc("POST /api/traffic/as-metadata", RequireRole(models.RoleAdmin, models.RoleNOCOperator)(trafficCtrl.UpdateASMetadata))
	mux.HandleFunc("POST /api/traffic/as-metadata/upload-image", RequireRole(models.RoleAdmin)(trafficCtrl.UploadASImage))
	mux.HandleFunc("GET /api/traffic/peer-metadata", trafficCtrl.GetPeerMetadata)
	mux.HandleFunc("POST /api/traffic/peer-metadata", RequireRole(models.RoleAdmin, models.RoleNOCOperator)(trafficCtrl.UpdatePeerMetadata))

	// Static file server for uploaded AS logos/images
	mux.Handle("GET /api/uploads/", http.StripPrefix("/api/uploads/", http.FileServer(http.Dir(uploadDir))))

	// AS-Path Prepending & Traffic Engineering (Download)
	mux.HandleFunc("GET /api/traffic/status", trafficCtrl.GetSyncStatus)
	mux.HandleFunc("GET /api/devices/{id}/bgp/prepends", trafficCtrl.GetDevicePrepends)
	mux.HandleFunc("GET /api/bgp/prepends/all", trafficCtrl.GetAllPrepends)
	mux.HandleFunc("POST /api/devices/{id}/bgp/prepends", RequireRole(models.RoleAdmin, models.RoleNOCOperator)(trafficCtrl.ApplyPrepend))
	mux.HandleFunc("POST /api/traffic/download/prepend", RequireRole(models.RoleAdmin, models.RoleNOCOperator)(trafficCtrl.ApplyPrepend))

	// Traffic Engineering Profiles & Presets (Cenários e Perfis Rápidos)
	mux.HandleFunc("GET /api/traffic/profiles", profileCtrl.ListProfiles)
	mux.HandleFunc("GET /api/traffic/profiles/{id}", profileCtrl.GetProfile)
	mux.HandleFunc("POST /api/traffic/profiles", RequireRole(models.RoleAdmin, models.RoleNOCOperator)(profileCtrl.CreateProfile))
	mux.HandleFunc("PUT /api/traffic/profiles/{id}", RequireRole(models.RoleAdmin, models.RoleNOCOperator)(profileCtrl.UpdateProfile))
	mux.HandleFunc("DELETE /api/traffic/profiles/{id}", RequireRole(models.RoleAdmin)(profileCtrl.DeleteProfile))
	mux.HandleFunc("POST /api/traffic/profiles/capture", RequireRole(models.RoleAdmin, models.RoleNOCOperator)(profileCtrl.CaptureCurrentProfile))
	mux.HandleFunc("POST /api/traffic/profiles/{id}/diff", profileCtrl.DiffProfile)
	mux.HandleFunc("POST /api/traffic/profiles/{id}/apply", RequireRole(models.RoleAdmin, models.RoleNOCOperator)(profileCtrl.ApplyProfile))

	// Telemetry & Anomaly Detections
	mux.HandleFunc("GET /api/telemetry/status", telCtrl.GetStatus)
	mux.HandleFunc("GET /api/telemetry/overview", telCtrl.GetOverview)
	mux.HandleFunc("POST /api/telemetry/collect", telCtrl.TriggerCollect)
	mux.HandleFunc("GET /api/telemetry/history", telCtrl.GetHistory)
	mux.HandleFunc("GET /api/alerts", telCtrl.ListAlerts)
	mux.HandleFunc("POST /api/alerts/{id}/ack", telCtrl.AcknowledgeAlert)
	mux.HandleFunc("GET /api/telemetry/events", telCtrl.StreamEvents)

	// Universal BMP Telemetry (RFC 7854)
	mux.HandleFunc("GET /api/bmp/status", telCtrl.GetBMPStatus)
	mux.HandleFunc("GET /api/bmp/peers", telCtrl.GetBMPPeers)
	mux.HandleFunc("GET /api/bmp/events", telCtrl.GetBMPEvents)
	mux.HandleFunc("GET /api/bmp/config-guide", telCtrl.GetBMPConfigGuide)
	mux.HandleFunc("GET /api/bmp/churn/ranking", telCtrl.GetBMPChurnRanking)

	// RPKI Validation & Origin Security (RFC 6811)
	mux.HandleFunc("GET /api/rpki/summary", rpkiCtrl.GetSummary)
	mux.HandleFunc("GET /api/rpki/validate", rpkiCtrl.Validate)
	mux.HandleFunc("GET /api/rpki/invalids", rpkiCtrl.GetInvalids)

	// Wrap with middlewares: CORS -> Logger -> Auth
	handler := AuthMiddleware(mux)
	handler = RequestLogger(handler)
	handler = EnableCORS(handler)

	return handler
}
