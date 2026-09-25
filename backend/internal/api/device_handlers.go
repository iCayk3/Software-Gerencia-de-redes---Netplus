package api

import (
	"encoding/json"
	"errors"
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
// Returns devices scoped strictly to the authenticated user's tenant (or all for SuperAdmin).
func (c *DeviceController) ListDevices(w http.ResponseWriter, r *http.Request) {
	tenantScope := ResolveTenantScope(r)
	devices := c.store.GetAllSafeByTenant(tenantScope)
	WriteJSON(w, http.StatusOK, devices)
}

// CreateDevice handles POST /api/devices
func (c *DeviceController) CreateDevice(w http.ResponseWriter, r *http.Request) {
	claims := GetAuthUser(r)
	var d models.Device
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		WriteError(w, http.StatusBadRequest, "Corpo da requisição inválido: "+err.Error())
		return
	}

	if d.Name == "" || d.Host == "" || d.Vendor == "" {
		WriteError(w, http.StatusBadRequest, "Campos 'name', 'host' e 'vendor' são obrigatórios")
		return
	}

	// Security: If not SuperAdmin, force device to belong to user's tenant
	if claims != nil && !claims.IsSuperAdmin {
		d.TenantID = claims.TenantID
	} else if d.TenantID == "" {
		d.TenantID = "default-tenant"
	}

	created, err := c.store.Create(d)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Falha ao criar equipamento: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, created.ToSafe())
}

// GetDevice handles GET /api/devices/{id} with tenant access verification
func (c *DeviceController) GetDevice(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID do equipamento é obrigatório")
		return
	}

	dev, err := CheckDeviceTenantAccess(r, c.store, id)
	if err != nil {
		if errors.Is(err, ErrAccessDeniedToDevice) {
			WriteError(w, http.StatusForbidden, err.Error())
			return
		}
		WriteError(w, http.StatusNotFound, "Equipamento não encontrado")
		return
	}

	WriteJSON(w, http.StatusOK, dev.ToSafe())
}

// UpdateDevice handles PUT /api/devices/{id}
func (c *DeviceController) UpdateDevice(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID do equipamento é obrigatório")
		return
	}

	// Security: Check tenant ownership
	if _, err := CheckDeviceTenantAccess(r, c.store, id); err != nil {
		if errors.Is(err, ErrAccessDeniedToDevice) {
			WriteError(w, http.StatusForbidden, err.Error())
			return
		}
		WriteError(w, http.StatusNotFound, "Equipamento não encontrado")
		return
	}

	var d models.Device
	if err := json.NewDecoder(r.Body).Decode(&d); err != nil {
		WriteError(w, http.StatusBadRequest, "Corpo da requisição inválido: "+err.Error())
		return
	}
	d.ID = id

	claims := GetAuthUser(r)
	if claims != nil && !claims.IsSuperAdmin {
		d.TenantID = claims.TenantID
	}

	if err := c.store.Update(d); err != nil {
		if err == storage.ErrDeviceNotFound {
			WriteError(w, http.StatusNotFound, "Equipamento não encontrado")
			return
		}
		WriteError(w, http.StatusInternalServerError, "Falha ao atualizar equipamento: "+err.Error())
		return
	}

	updated, _ := c.store.GetByID(id)
	WriteJSON(w, http.StatusOK, updated.ToSafe())
}

// DeleteDevice handles DELETE /api/devices/{id}
func (c *DeviceController) DeleteDevice(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID do equipamento é obrigatório")
		return
	}

	// Security: Check tenant ownership
	if _, err := CheckDeviceTenantAccess(r, c.store, id); err != nil {
		if errors.Is(err, ErrAccessDeniedToDevice) {
			WriteError(w, http.StatusForbidden, err.Error())
			return
		}
		WriteError(w, http.StatusNotFound, "Equipamento não encontrado")
		return
	}

	if err := c.store.Delete(id); err != nil {
		if err == storage.ErrDeviceNotFound {
			WriteError(w, http.StatusNotFound, "Equipamento não encontrado")
			return
		}
		WriteError(w, http.StatusInternalServerError, "Falha ao excluir equipamento: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "Equipamento excluído com sucesso"})
}

// TestDevice handles POST /api/devices/{id}/test
func (c *DeviceController) TestDevice(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	device, err := CheckDeviceTenantAccess(r, c.store, id)
	if err != nil {
		if errors.Is(err, ErrAccessDeniedToDevice) {
			WriteError(w, http.StatusForbidden, err.Error())
			return
		}
		WriteError(w, http.StatusNotFound, "Equipamento não encontrado")
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
	device, err := CheckDeviceTenantAccess(r, c.store, id)
	if err != nil {
		if errors.Is(err, ErrAccessDeniedToDevice) {
			WriteError(w, http.StatusForbidden, err.Error())
			return
		}
		WriteError(w, http.StatusNotFound, "Equipamento não encontrado")
		return
	}

	if r.URL.Query().Get("fresh") != "true" && c.engine != nil {
		if cached, ok := c.engine.GetCollector().GetCachedBGP(id); ok && len(cached) > 0 {
			WriteJSON(w, http.StatusOK, cached)
			return
		}
	}

	// Se o roteador estiver conectado ao BMP (RFC 7854), entrega telemetria em tempo real sem SSH
	if c.engine != nil && c.engine.GetBMPServer() != nil && c.engine.GetBMPServer().HasActiveSession(device.Host, device.Name) {
		bmpSessions := c.engine.GetBMPServer().GetDeviceBGPSessions(device.ID, device.Name, device.Host)
		if len(bmpSessions) > 0 {
			c.store.UpdateStatus(device.ID, "online")
			WriteJSON(w, http.StatusOK, bmpSessions)
			return
		}
	}

	driver, err := drivers.NewDriver(device)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	sessions, err := driver.GetBGPSessions()
	if err != nil {
		c.store.UpdateStatus(device.ID, "offline")
		WriteError(w, http.StatusInternalServerError, "Erro ao obter sessões BGP: "+err.Error())
		return
	}
	c.store.UpdateStatus(device.ID, "online")

	for i := range sessions {
		sessions[i].TelemetrySource = "ssh"
	}

	WriteJSON(w, http.StatusOK, sessions)
}

// GetDeviceOSPF handles GET /api/devices/{id}/ospf
func (c *DeviceController) GetDeviceOSPF(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	device, err := CheckDeviceTenantAccess(r, c.store, id)
	if err != nil {
		if errors.Is(err, ErrAccessDeniedToDevice) {
			WriteError(w, http.StatusForbidden, err.Error())
			return
		}
		WriteError(w, http.StatusNotFound, "Equipamento não encontrado")
		return
	}

	if r.URL.Query().Get("fresh") != "true" && c.engine != nil {
		if cached, ok := c.engine.GetCollector().GetCachedOSPF(id); ok && len(cached) > 0 {
			WriteJSON(w, http.StatusOK, cached)
			return
		}
	}

	driver, err := drivers.NewDriver(device)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	neighbors, err := driver.GetOSPFNeighbors()
	if err != nil {
		c.store.UpdateStatus(device.ID, "offline")
		WriteError(w, http.StatusInternalServerError, "Erro ao obter vizinhos OSPF: "+err.Error())
		return
	}
	c.store.UpdateStatus(device.ID, "online")

	WriteJSON(w, http.StatusOK, neighbors)
}

// ExecDeviceCommand handles POST /api/devices/{id}/exec
func (c *DeviceController) ExecDeviceCommand(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	device, err := CheckDeviceTenantAccess(r, c.store, id)
	if err != nil {
		if errors.Is(err, ErrAccessDeniedToDevice) {
			WriteError(w, http.StatusForbidden, err.Error())
			return
		}
		WriteError(w, http.StatusNotFound, "Equipamento não encontrado")
		return
	}

	var req models.CommandExecRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Corpo da requisição inválido")
		return
	}

	if req.Command == "" {
		WriteError(w, http.StatusBadRequest, "O comando não pode estar vazio")
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
// Returns BGP sessions strictly scoped to the tenant's devices.
func (c *DeviceController) GetAllBGP(w http.ResponseWriter, r *http.Request) {
	tenantScope := ResolveTenantScope(r)
	devices := c.store.GetAllByTenant(tenantScope)
	allowedMap := make(map[string]bool, len(devices))
	for _, d := range devices {
		allowedMap[d.ID] = true
	}

	if r.URL.Query().Get("fresh") != "true" && c.engine != nil {
		cached := c.engine.GetCollector().GetAllCachedBGP()
		if len(cached) > 0 {
			filtered := make([]models.BGPSession, 0)
			for _, s := range cached {
				if tenantScope == "" || allowedMap[s.DeviceID] {
					filtered = append(filtered, s)
				}
			}
			WriteJSON(w, http.StatusOK, filtered)
			return
		}
	}

	var wg sync.WaitGroup
	var mu sync.Mutex
	allSessions := make([]models.BGPSession, 0)

	for _, d := range devices {
		dev := d
		wg.Add(1)
		go func() {
			defer wg.Done()

			// Checa telemetria BMP em tempo real
			if c.engine != nil && c.engine.GetBMPServer() != nil && c.engine.GetBMPServer().HasActiveSession(dev.Host, dev.Name) {
				bmpSessions := c.engine.GetBMPServer().GetDeviceBGPSessions(dev.ID, dev.Name, dev.Host)
				if len(bmpSessions) > 0 {
					mu.Lock()
					allSessions = append(allSessions, bmpSessions...)
					mu.Unlock()
					return
				}
			}

			driver, err := drivers.NewDriver(&dev)
			if err != nil {
				return
			}
			sessions, err := driver.GetBGPSessions()
			if err == nil {
				for i := range sessions {
					sessions[i].TelemetrySource = "ssh"
				}
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
// Returns OSPF neighbors strictly scoped to the tenant's devices.
func (c *DeviceController) GetAllOSPF(w http.ResponseWriter, r *http.Request) {
	tenantScope := ResolveTenantScope(r)
	devices := c.store.GetAllByTenant(tenantScope)
	allowedMap := make(map[string]bool, len(devices))
	for _, d := range devices {
		allowedMap[d.ID] = true
	}

	if r.URL.Query().Get("fresh") != "true" && c.engine != nil {
		cached := c.engine.GetCollector().GetAllCachedOSPF()
		if len(cached) > 0 {
			filtered := make([]models.OSPFNeighbor, 0)
			for _, n := range cached {
				if tenantScope == "" || allowedMap[n.DeviceID] {
					filtered = append(filtered, n)
				}
			}
			WriteJSON(w, http.StatusOK, filtered)
			return
		}
	}

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
