package api

import (
	"net/http"
	"os"
	"path/filepath"

	"network-software/internal/storage"
	"network-software/internal/telemetry"
	"network-software/internal/traffic"
)

// NewRouter registers all routes and attaches middleware.
func NewRouter(store *storage.DeviceStore, asMetaStore *storage.ASMetadataStore, engine *telemetry.Engine, dataDir string) http.Handler {
	mux := http.NewServeMux()

	uploadDir := filepath.Join(dataDir, "uploads")
	_ = os.MkdirAll(uploadDir, 0755)

	trafficSvc := traffic.NewService(store, asMetaStore)
	trafficSvc.Start()

	devCtrl := NewDeviceController(store, engine)
	telCtrl := NewTelemetryController(engine)
	routesCtrl := NewRoutesController(store, trafficSvc)
	trafficCtrl := NewTrafficController(store, asMetaStore, trafficSvc, uploadDir)

	// Base & Health check
	mux.HandleFunc("GET /api/health", HandleHealth)

	// Network diagnostic utilities
	mux.HandleFunc("GET /api/network/interfaces", HandleGetInterfaces)
	mux.HandleFunc("POST /api/network/ping", HandlePing)
	mux.HandleFunc("POST /api/network/scan-ports", HandlePortScan)
	mux.HandleFunc("GET /api/network/dns", HandleDNS)

	// Device Inventory management
	mux.HandleFunc("GET /api/devices", devCtrl.ListDevices)
	mux.HandleFunc("POST /api/devices", devCtrl.CreateDevice)
	mux.HandleFunc("PUT /api/devices/{id}", devCtrl.UpdateDevice)
	mux.HandleFunc("DELETE /api/devices/{id}", devCtrl.DeleteDevice)
	mux.HandleFunc("POST /api/devices/{id}/test", devCtrl.TestDevice)

	// Routing inspection per device
	mux.HandleFunc("GET /api/devices/{id}/bgp", devCtrl.GetDeviceBGP)
	mux.HandleFunc("GET /api/devices/{id}/ospf", devCtrl.GetDeviceOSPF)
	mux.HandleFunc("POST /api/devices/{id}/exec", devCtrl.ExecDeviceCommand)

	// Consolidated routing inspection across all devices
	mux.HandleFunc("GET /api/bgp/all", devCtrl.GetAllBGP)
	mux.HandleFunc("GET /api/ospf/all", devCtrl.GetAllOSPF)

	// Static Routes & Traffic Engineering (Upload)
	mux.HandleFunc("GET /api/devices/{id}/routes/static", routesCtrl.GetDeviceStaticRoutes)
	mux.HandleFunc("GET /api/routes/static/all", routesCtrl.GetAllStaticRoutes)
	mux.HandleFunc("POST /api/devices/{id}/routes/static", routesCtrl.AddDeviceStaticRoute)
	mux.HandleFunc("DELETE /api/devices/{id}/routes/static", routesCtrl.DeleteDeviceStaticRoute)

	// Smart Traffic Engineering (Upload Overview by BGP AS)
	mux.HandleFunc("GET /api/traffic/upload/overview", trafficCtrl.GetUploadOverview)
	mux.HandleFunc("POST /api/traffic/upload/local-pref", trafficCtrl.SetLocalPreference)
	mux.HandleFunc("GET /api/traffic/as-metadata", trafficCtrl.GetASMetadata)
	mux.HandleFunc("POST /api/traffic/as-metadata", trafficCtrl.UpdateASMetadata)
	mux.HandleFunc("POST /api/traffic/as-metadata/upload-image", trafficCtrl.UploadASImage)

	// Static file server for uploaded AS logos/images
	mux.Handle("GET /api/uploads/", http.StripPrefix("/api/uploads/", http.FileServer(http.Dir(uploadDir))))

	// AS-Path Prepending & Traffic Engineering (Download)
	mux.HandleFunc("GET /api/traffic/status", trafficCtrl.GetSyncStatus)
	mux.HandleFunc("GET /api/devices/{id}/bgp/prepends", trafficCtrl.GetDevicePrepends)
	mux.HandleFunc("GET /api/bgp/prepends/all", trafficCtrl.GetAllPrepends)
	mux.HandleFunc("POST /api/devices/{id}/bgp/prepends", trafficCtrl.ApplyPrepend)
	mux.HandleFunc("POST /api/traffic/download/prepend", trafficCtrl.ApplyPrepend)

	// Telemetry & Anomaly Detections
	mux.HandleFunc("GET /api/telemetry/status", telCtrl.GetStatus)
	mux.HandleFunc("GET /api/telemetry/overview", telCtrl.GetOverview)
	mux.HandleFunc("POST /api/telemetry/collect", telCtrl.TriggerCollect)
	mux.HandleFunc("GET /api/telemetry/history", telCtrl.GetHistory)
	mux.HandleFunc("GET /api/alerts", telCtrl.ListAlerts)
	mux.HandleFunc("POST /api/alerts/{id}/ack", telCtrl.AcknowledgeAlert)
	mux.HandleFunc("GET /api/telemetry/events", telCtrl.StreamEvents)

	// Wrap with middlewares
	handler := RequestLogger(mux)
	handler = EnableCORS(handler)

	return handler
}
