package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"net"
	"net/http"
	"strings"

	"network-software/internal/drivers"
	"network-software/internal/models"
	"network-software/internal/storage"
	"network-software/internal/traffic"
)

type RoutesController struct {
	store      *storage.DeviceStore
	trafficSvc *traffic.Service
	auditStore storage.IAuditStore
}

func NewRoutesController(store *storage.DeviceStore, trafficSvc *traffic.Service, auditStore storage.IAuditStore) *RoutesController {
	return &RoutesController{store: store, trafficSvc: trafficSvc, auditStore: auditStore}
}

// GetDeviceStaticRoutes handles GET /api/devices/{id}/routes/static
func (c *RoutesController) GetDeviceStaticRoutes(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	device, err := CheckDeviceTenantAccess(r, c.store, id)
	if err != nil {
		if errors.Is(err, ErrAccessDeniedToDevice) {
			WriteError(w, http.StatusForbidden, err.Error())
			return
		}
		WriteError(w, http.StatusNotFound, "Dispositivo não encontrado")
		return
	}

	fresh := r.URL.Query().Get("fresh") == "true"

	if c.trafficSvc != nil {
		routes, err := c.trafficSvc.GetStaticRoutes(id, fresh)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "Erro ao obter rotas estáticas: "+err.Error())
			return
		}
		WriteJSON(w, http.StatusOK, routes)
		return
	}

	driver, err := drivers.NewDriver(device)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	routes, err := driver.GetStaticRoutes()
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Erro ao obter rotas estáticas: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, routes)
}

// GetAllStaticRoutes handles GET /api/routes/static/all
func (c *RoutesController) GetAllStaticRoutes(w http.ResponseWriter, r *http.Request) {
	tenantScope := ResolveTenantScope(r)
	fresh := r.URL.Query().Get("fresh") == "true"

	devices := c.store.GetAllByTenant(tenantScope)
	allowedMap := make(map[string]bool, len(devices))
	for _, d := range devices {
		allowedMap[d.ID] = true
	}

	if c.trafficSvc != nil {
		allRoutes, err := c.trafficSvc.GetAllStaticRoutes(fresh)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "Erro ao obter rotas estáticas: "+err.Error())
			return
		}
		if tenantScope != "" {
			filtered := make([]models.StaticRoute, 0)
			for _, rt := range allRoutes {
				if allowedMap[rt.DeviceID] {
					filtered = append(filtered, rt)
				}
			}
			WriteJSON(w, http.StatusOK, filtered)
			return
		}
		WriteJSON(w, http.StatusOK, allRoutes)
		return
	}

	allRoutes := make([]models.StaticRoute, 0)
	for _, d := range devices {
		dev := d
		driver, err := drivers.NewDriver(&dev)
		if err == nil {
			routes, err := driver.GetStaticRoutes()
			if err == nil {
				allRoutes = append(allRoutes, routes...)
			}
		}
	}
	WriteJSON(w, http.StatusOK, allRoutes)
}

// AddDeviceStaticRoute handles POST /api/devices/{id}/routes/static
func (c *RoutesController) AddDeviceStaticRoute(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	device, err := CheckDeviceTenantAccess(r, c.store, id)
	if err != nil {
		if errors.Is(err, ErrAccessDeniedToDevice) {
			WriteError(w, http.StatusForbidden, err.Error())
			return
		}
		WriteError(w, http.StatusNotFound, "Dispositivo não encontrado")
		return
	}

	var req models.StaticRouteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Corpo da requisição inválido: "+err.Error())
		return
	}

	if req.Destination == "" || req.NextHop == "" {
		WriteError(w, http.StatusBadRequest, "Campos 'destination' e 'next_hop' são obrigatórios")
		return
	}

	cmds, cliScript := buildStaticRouteCLI(device, req)

	if c.auditStore != nil {
		user := GetAuthUser(r)
		userName, userEmail, userID := "Sistema", "system@netpulse.com", "sys"
		if user != nil {
			userName, userEmail, userID = user.Name, user.Email, user.UserID
		}
		_ = c.auditStore.Record(&models.AuditLog{
			TenantID:         "default-tenant",
			UserID:           userID,
			UserName:         userName,
			UserEmail:        userEmail,
			ClientIP:         r.RemoteAddr,
			Action:           models.ActionAddStaticRoute,
			TargetDeviceID:   device.ID,
			TargetDeviceName: device.Name,
			CommandExecuted:  cliScript,
			Status:           "MANUAL_DISPATCH",
		})
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":      "MANUAL_DISPATCH",
		"message":     fmt.Sprintf("[Modo Manual Ativo] Comandos CLI gerados para %s (%s). Nenhuma alteração foi executada no roteador.", device.Name, device.Host),
		"commands":    cmds,
		"cli_script":  cliScript,
		"device_id":   device.ID,
		"device_name": device.Name,
		"device_host": device.Host,
		"vendor":      device.Vendor,
	})
}

// DeleteDeviceStaticRoute handles DELETE /api/devices/{id}/routes/static
func (c *RoutesController) DeleteDeviceStaticRoute(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	device, err := CheckDeviceTenantAccess(r, c.store, id)
	if err != nil {
		if errors.Is(err, ErrAccessDeniedToDevice) {
			WriteError(w, http.StatusForbidden, err.Error())
			return
		}
		WriteError(w, http.StatusNotFound, "Dispositivo não encontrado")
		return
	}

	dest := r.URL.Query().Get("destination")
	nextHop := r.URL.Query().Get("next_hop")

	if dest == "" || nextHop == "" {
		WriteError(w, http.StatusBadRequest, "Parâmetros 'destination' e 'next_hop' são obrigatórios na URL")
		return
	}

	cmds, cliScript := buildDeleteStaticRouteCLI(device, dest, nextHop)

	if c.auditStore != nil {
		user := GetAuthUser(r)
		userName, userEmail, userID := "Sistema", "system@netpulse.com", "sys"
		if user != nil {
			userName, userEmail, userID = user.Name, user.Email, user.UserID
		}
		_ = c.auditStore.Record(&models.AuditLog{
			TenantID:         device.TenantID,
			UserID:           userID,
			UserName:         userName,
			UserEmail:        userEmail,
			ClientIP:         r.RemoteAddr,
			Action:           models.ActionDeleteStaticRoute,
			TargetDeviceID:   device.ID,
			TargetDeviceName: device.Name,
			CommandExecuted:  cliScript,
			Status:           "MANUAL_DISPATCH",
		})
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":      "MANUAL_DISPATCH",
		"message":     fmt.Sprintf("[Modo Manual Ativo] Comandos CLI de remoção gerados para %s (%s). Nenhuma alteração foi executada no roteador.", device.Name, device.Host),
		"commands":    cmds,
		"cli_script":  cliScript,
		"device_id":   device.ID,
		"device_name": device.Name,
		"device_host": device.Host,
		"vendor":      device.Vendor,
	})
}

func buildStaticRouteCLI(device *models.Device, req models.StaticRouteRequest) ([]string, string) {
	switch device.Vendor {
	case models.VendorHuawei:
		dest := req.Destination
		ip := dest
		mask := "255.255.255.255"
		if strings.Contains(dest, "/") {
			parts := strings.Split(dest, "/")
			ip = parts[0]
			if parts[1] == "0" {
				ip = "0.0.0.0"
				mask = "0.0.0.0"
			} else {
				mask = cidrToMask(parts[1])
			}
		}
		cmd := fmt.Sprintf("ip route-static %s %s %s", ip, mask, req.NextHop)
		if req.Preference > 0 {
			cmd += fmt.Sprintf(" preference %d", req.Preference)
		}
		if req.Description != "" {
			cmd += fmt.Sprintf(" description %s", req.Description)
		}
		cmds := []string{"system-view", cmd, "commit", "return"}
		script := fmt.Sprintf("# [%s] %s (Huawei VRP)\nsystem-view\n%s\ncommit\nreturn", device.Name, device.Host, cmd)
		return cmds, script

	case models.VendorMikrotikV7:
		cmd := fmt.Sprintf("/ip/route/add dst-address=%s gateway=%s", req.Destination, req.NextHop)
		if req.Preference > 0 {
			cmd += fmt.Sprintf(" distance=%d", req.Preference)
		}
		if req.Description != "" {
			cmd += fmt.Sprintf(" comment=%q", req.Description)
		}
		script := fmt.Sprintf("# [%s] %s (MikroTik RouterOS v7)\n%s", device.Name, device.Host, cmd)
		return []string{cmd}, script

	case models.VendorMikrotikV6:
		cmd := fmt.Sprintf("/ip route add dst-address=%s gateway=%s", req.Destination, req.NextHop)
		if req.Preference > 0 {
			cmd += fmt.Sprintf(" distance=%d", req.Preference)
		}
		if req.Description != "" {
			cmd += fmt.Sprintf(" comment=%q", req.Description)
		}
		script := fmt.Sprintf("# [%s] %s (MikroTik RouterOS v6)\n%s", device.Name, device.Host, cmd)
		return []string{cmd}, script

	case models.VendorDatacom:
		cmd := fmt.Sprintf("ip route %s %s", req.Destination, req.NextHop)
		if req.Preference > 0 {
			cmd += fmt.Sprintf(" %d", req.Preference)
		}
		cmds := []string{"configure terminal", cmd, "exit"}
		script := fmt.Sprintf("# [%s] %s (Datacom DmOS)\nconfigure terminal\n%s\nexit", device.Name, device.Host, cmd)
		return cmds, script

	default:
		cmd := fmt.Sprintf("ip route %s %s", req.Destination, req.NextHop)
		return []string{cmd}, fmt.Sprintf("# [%s] %s\n%s", device.Name, device.Host, cmd)
	}
}

func buildDeleteStaticRouteCLI(device *models.Device, destination, nextHop string) ([]string, string) {
	switch device.Vendor {
	case models.VendorHuawei:
		dest := destination
		ip := dest
		mask := "255.255.255.255"
		if strings.Contains(dest, "/") {
			parts := strings.Split(dest, "/")
			ip = parts[0]
			if parts[1] == "0" {
				ip = "0.0.0.0"
				mask = "0.0.0.0"
			} else {
				mask = cidrToMask(parts[1])
			}
		}
		cmd := fmt.Sprintf("undo ip route-static %s %s %s", ip, mask, nextHop)
		cmds := []string{"system-view", cmd, "commit", "return"}
		script := fmt.Sprintf("# [%s] %s (Huawei VRP)\nsystem-view\n%s\ncommit\nreturn", device.Name, device.Host, cmd)
		return cmds, script

	case models.VendorMikrotikV7:
		cmd := fmt.Sprintf("/ip/route/remove [find dst-address=%q and gateway=%q]", destination, nextHop)
		script := fmt.Sprintf("# [%s] %s (MikroTik RouterOS v7)\n%s", device.Name, device.Host, cmd)
		return []string{cmd}, script

	case models.VendorMikrotikV6:
		cmd := fmt.Sprintf("/ip route remove [find dst-address=%q and gateway=%q]", destination, nextHop)
		script := fmt.Sprintf("# [%s] %s (MikroTik RouterOS v6)\n%s", device.Name, device.Host, cmd)
		return []string{cmd}, script

	case models.VendorDatacom:
		cmd := fmt.Sprintf("no ip route %s %s", destination, nextHop)
		cmds := []string{"configure terminal", cmd, "exit"}
		script := fmt.Sprintf("# [%s] %s (Datacom DmOS)\nconfigure terminal\n%s\nexit", device.Name, device.Host, cmd)
		return cmds, script

	default:
		cmd := fmt.Sprintf("no ip route %s %s", destination, nextHop)
		return []string{cmd}, fmt.Sprintf("# [%s] %s\n%s", device.Name, device.Host, cmd)
	}
}

func cidrToMask(prefixLen string) string {
	var bits int
	fmt.Sscanf(prefixLen, "%d", &bits)
	if bits <= 0 || bits > 32 {
		return "255.255.255.255"
	}
	mask := net.CIDRMask(bits, 32)
	return fmt.Sprintf("%d.%d.%d.%d", mask[0], mask[1], mask[2], mask[3])
}
