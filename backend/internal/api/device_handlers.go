package api

import (
	"encoding/json"
	"net/http"
	"sync"
	"time"

	"network-software/internal/drivers"
	"network-software/internal/models"
	"network-software/internal/storage"
	"network-software/internal/telemetry"
)

type DeviceController struct {
	store  *storage.DeviceStore
	engine *telemetry.Engine
}

func NewDeviceController(store *storage.DeviceStore, engine *telemetry.Engine) *DeviceController {
	return &DeviceController{store: store, engine: engine}
}

// ListDevices handles GET /api/devices
func (c *DeviceController) ListDevices(w http.ResponseWriter, r *http.Request) {
	devices := c.store.GetAllSafe()
	WriteJSON(w, http.StatusOK, devices)
}

// CreateDevice handles POST /api/devices
func (c *DeviceController) CreateDevice(w http.ResponseWriter, r *http.Request) {
	var d models.Device
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}

	if d.Name == "" || d.Host == "" || d.Vendor == "" {
		WriteError(w, http.StatusBadRequest, "Fields 'name', 'host' and 'vendor' are required")
		return
	}

	created, err := c.store.Create(d)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to create device: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, created.ToSafe())
}

// UpdateDevice handles PUT /api/devices/{id}
func (c *DeviceController) UpdateDevice(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "Device ID is required")
		return
	}

	var d models.Device
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body: "+err.Error())
		return
	}
	d.ID = id

	if err := c.store.Update(d); err != nil {
		if err == storage.ErrDeviceNotFound {
			WriteError(w, http.StatusNotFound, "Device not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "Failed to update device: "+err.Error())
		return
	}

	updated, _ := c.store.GetByID(id)
	WriteJSON(w, http.StatusOK, updated.ToSafe())
}

// DeleteDevice handles DELETE /api/devices/{id}
func (c *DeviceController) DeleteDevice(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "Device ID is required")
		return
	}

	if err := c.store.Delete(id); err != nil {
		if err == storage.ErrDeviceNotFound {
			WriteError(w, http.StatusNotFound, "Device not found")
			return
		}
		WriteError(w, http.StatusInternalServerError, "Failed to delete device: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "Device deleted successfully"})
}

// TestDevice handles POST /api/devices/{id}/test
func (c *DeviceController) TestDevice(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	device, err := c.store.GetByID(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Device not found")
		return
	}

	driver, err := drivers.NewDriver(device)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	result, _ := driver.TestConnection()
	if result.Success {
		c.store.UpdateStatus(device.ID, "online")
	} else {
		c.store.UpdateStatus(device.ID, "offline")
	}

	WriteJSON(w, http.StatusOK, result)
}

// GetDeviceBGP handles GET /api/devices/{id}/bgp
func (c *DeviceController) GetDeviceBGP(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if r.URL.Query().Get("fresh") != "true" && c.engine != nil {
		if cached, ok := c.engine.GetCollector().GetCachedBGP(id); ok && len(cached) > 0 {
			WriteJSON(w, http.StatusOK, cached)
			return
		}
	}

	device, err := c.store.GetByID(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Device not found")
		return
	}

	driver, err := drivers.NewDriver(device)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	sessions, err := driver.GetBGPSessions()
	if err != nil {
		c.store.UpdateStatus(device.ID, "offline")
		WriteError(w, http.StatusInternalServerError, "Error retrieving BGP sessions: "+err.Error())
		return
	}
	c.store.UpdateStatus(device.ID, "online")

	WriteJSON(w, http.StatusOK, sessions)
}

// GetDeviceOSPF handles GET /api/devices/{id}/ospf
func (c *DeviceController) GetDeviceOSPF(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if r.URL.Query().Get("fresh") != "true" && c.engine != nil {
		if cached, ok := c.engine.GetCollector().GetCachedOSPF(id); ok && len(cached) > 0 {
			WriteJSON(w, http.StatusOK, cached)
			return
		}
	}

	device, err := c.store.GetByID(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Device not found")
		return
	}

	driver, err := drivers.NewDriver(device)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	neighbors, err := driver.GetOSPFNeighbors()
	if err != nil {
		c.store.UpdateStatus(device.ID, "offline")
		WriteError(w, http.StatusInternalServerError, "Error retrieving OSPF neighbors: "+err.Error())
		return
	}
	c.store.UpdateStatus(device.ID, "online")

	WriteJSON(w, http.StatusOK, neighbors)
}

// ExecDeviceCommand handles POST /api/devices/{id}/exec
func (c *DeviceController) ExecDeviceCommand(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	device, err := c.store.GetByID(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Device not found")
		return
	}

	var req models.CommandExecRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Invalid request body")
		return
	}

	if req.Command == "" {
		WriteError(w, http.StatusBadRequest, "Command cannot be empty")
		return
	}

	driver, err := drivers.NewDriver(device)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	start := time.Now()
	output, err := driver.RunCommand(req.Command)
	duration := float64(time.Since(start).Microseconds()) / 1000.0

	resp := models.CommandExecResponse{
		DeviceID:   device.ID,
		DeviceName: device.Name,
		Command:    req.Command,
		Output:     output,
		DurationMs: duration,
		Success:    err == nil,
	}
	if err != nil {
		resp.Error = err.Error()
	}

	WriteJSON(w, http.StatusOK, resp)
}

// GetAllBGP handles GET /api/bgp/all
func (c *DeviceController) GetAllBGP(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("fresh") != "true" && c.engine != nil {
		cached := c.engine.GetCollector().GetAllCachedBGP()
		if len(cached) > 0 {
			WriteJSON(w, http.StatusOK, cached)
			return
		}
	}

	devices := c.store.GetAll()
	var wg sync.WaitGroup
	var mu sync.Mutex
	allSessions := make([]models.BGPSession, 0)

	for _, d := range devices {
		dev := d
		wg.Add(1)
		go func() {
			defer wg.Done()
			driver, err := drivers.NewDriver(&dev)
			if err != nil {
				return
			}
			sessions, err := driver.GetBGPSessions()
			if err == nil {
				mu.Lock()
				allSessions = append(allSessions, sessions...)
				mu.Unlock()
			}
		}()
	}

	wg.Wait()
	WriteJSON(w, http.StatusOK, allSessions)
}

// GetAllOSPF handles GET /api/ospf/all
func (c *DeviceController) GetAllOSPF(w http.ResponseWriter, r *http.Request) {
	if r.URL.Query().Get("fresh") != "true" && c.engine != nil {
		cached := c.engine.GetCollector().GetAllCachedOSPF()
		if len(cached) > 0 {
			WriteJSON(w, http.StatusOK, cached)
			return
		}
	}

	devices := c.store.GetAll()
	var wg sync.WaitGroup
	var mu sync.Mutex
	allNeighbors := make([]models.OSPFNeighbor, 0)

	for _, d := range devices {
		dev := d
		wg.Add(1)
		go func() {
			defer wg.Done()
			driver, err := drivers.NewDriver(&dev)
			if err != nil {
				return
			}
			neighbors, err := driver.GetOSPFNeighbors()
			if err == nil {
				mu.Lock()
				allNeighbors = append(allNeighbors, neighbors...)
				mu.Unlock()
			}
		}()
	}

	wg.Wait()
	WriteJSON(w, http.StatusOK, allNeighbors)
}
