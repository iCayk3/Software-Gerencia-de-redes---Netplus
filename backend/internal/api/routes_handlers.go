package api

import (
	"encoding/json"
	"fmt"
	"net/http"

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

	device, err := c.store.GetByID(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Dispositivo não encontrado")
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
	fresh := r.URL.Query().Get("fresh") == "true"

	if c.trafficSvc != nil {
		allRoutes, err := c.trafficSvc.GetAllStaticRoutes(fresh)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "Erro ao obter rotas estáticas: "+err.Error())
			return
		}
		WriteJSON(w, http.StatusOK, allRoutes)
		return
	}

	devices := c.store.GetAll()
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
	device, err := c.store.GetByID(id)
	if err != nil {
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

	driver, err := drivers.NewDriver(device)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := driver.AddStaticRoute(req); err != nil {
		WriteError(w, http.StatusInternalServerError, "Erro ao aplicar rota estática: "+err.Error())
		return
	}

	if c.trafficSvc != nil {
		c.trafficSvc.InvalidateDevice(id)
	}

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
			CommandExecuted:  fmt.Sprintf("ip route-static %s %s description %s", req.Destination, req.NextHop, req.Description),
			Status:           "SUCCESS",
		})
	}

	WriteJSON(w, http.StatusCreated, map[string]string{
		"message": "Rota estática configurada com sucesso no roteador",
	})
}

// DeleteDeviceStaticRoute handles DELETE /api/devices/{id}/routes/static
func (c *RoutesController) DeleteDeviceStaticRoute(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	device, err := c.store.GetByID(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Dispositivo não encontrado")
		return
	}

	dest := r.URL.Query().Get("destination")
	nextHop := r.URL.Query().Get("next_hop")

	if dest == "" || nextHop == "" {
		WriteError(w, http.StatusBadRequest, "Parâmetros 'destination' e 'next_hop' são obrigatórios na URL")
		return
	}

	driver, err := drivers.NewDriver(device)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	if err := driver.DeleteStaticRoute(dest, nextHop); err != nil {
		WriteError(w, http.StatusInternalServerError, "Erro ao remover rota estática: "+err.Error())
		return
	}

	if c.trafficSvc != nil {
		c.trafficSvc.InvalidateDevice(id)
	}

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
			Action:           models.ActionDeleteStaticRoute,
			TargetDeviceID:   device.ID,
			TargetDeviceName: device.Name,
			CommandExecuted:  fmt.Sprintf("undo ip route-static %s %s", dest, nextHop),
			Status:           "SUCCESS",
		})
	}

	WriteJSON(w, http.StatusOK, map[string]string{
		"message": "Rota estática removida com sucesso do roteador",
	})
}
