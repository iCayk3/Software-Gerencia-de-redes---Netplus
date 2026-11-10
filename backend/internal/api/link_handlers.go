package api

import (
	"encoding/json"
	"errors"
	"net/http"

	"network-software/internal/models"
	"network-software/internal/storage"
)

// LinkController handles HTTP endpoints for backbone point-to-point links.
type LinkController struct {
	linkStore   *storage.LinkStore
	deviceStore *storage.DeviceStore
	auditStore  storage.IAuditStore
}

func NewLinkController(linkStore *storage.LinkStore, deviceStore *storage.DeviceStore, auditStore storage.IAuditStore) *LinkController {
	return &LinkController{
		linkStore:   linkStore,
		deviceStore: deviceStore,
		auditStore:  auditStore,
	}
}

// ListLinks handles GET /api/backbone/links
func (c *LinkController) ListLinks(w http.ResponseWriter, r *http.Request) {
	claims := GetAuthUser(r)
	tenantID := ""
	if claims != nil {
		if claims.IsSuperAdmin {
			tenantID = r.URL.Query().Get("tenant_id")
		} else {
			tenantID = claims.TenantID
		}
	}

	links := c.linkStore.GetAllByTenant(tenantID)
	WriteJSON(w, http.StatusOK, links)
}

// GetLink handles GET /api/backbone/links/{id}
func (c *LinkController) GetLink(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID do enlace é obrigatório")
		return
	}

	link, err := c.linkStore.GetByID(id)
	if err != nil {
		if errors.Is(err, storage.ErrLinkNotFound) {
			WriteError(w, http.StatusNotFound, "Enlace não encontrado")
			return
		}
		WriteError(w, http.StatusInternalServerError, "Erro ao buscar enlace: "+err.Error())
		return
	}

	claims := GetAuthUser(r)
	if claims != nil && !claims.IsSuperAdmin && claims.TenantID != link.TenantID {
		WriteError(w, http.StatusForbidden, "Acesso negado a este enlace")
		return
	}

	WriteJSON(w, http.StatusOK, link)
}

// CreateLink handles POST /api/backbone/links
func (c *LinkController) CreateLink(w http.ResponseWriter, r *http.Request) {
	var req models.BackboneLink
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Payload inválido: "+err.Error())
		return
	}

	if req.SourceDeviceID == "" || req.TargetDeviceID == "" {
		WriteError(w, http.StatusBadRequest, "source_device_id e target_device_id são obrigatórios")
		return
	}
	if req.SourceDeviceID == req.TargetDeviceID {
		WriteError(w, http.StatusBadRequest, "Equipamento de origem e destino devem ser diferentes")
		return
	}

	claims := GetAuthUser(r)
	if claims != nil {
		if !claims.IsSuperAdmin || req.TenantID == "" {
			req.TenantID = claims.TenantID
		}
	}
	if req.TenantID == "" {
		req.TenantID = "default-tenant"
	}

	created, err := c.linkStore.Create(req)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Falha ao criar enlace: "+err.Error())
		return
	}

	if c.auditStore != nil && claims != nil {
		_ = c.auditStore.Record(&models.AuditLog{
			TenantID:        created.TenantID,
			UserID:          claims.UserID,
			UserName:        claims.Name,
			UserEmail:       claims.Email,
			ClientIP:        r.RemoteAddr,
			Action:          models.ActionCreateBackboneLink,
			CommandExecuted: "Criou enlace PTP: " + created.Name,
			Status:          "SUCCESS",
		})
	}

	WriteJSON(w, http.StatusCreated, created)
}

// UpdateLink handles PUT /api/backbone/links/{id}
func (c *LinkController) UpdateLink(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID do enlace é obrigatório")
		return
	}

	existing, err := c.linkStore.GetByID(id)
	if err != nil {
		if errors.Is(err, storage.ErrLinkNotFound) {
			WriteError(w, http.StatusNotFound, "Enlace não encontrado")
			return
		}
		WriteError(w, http.StatusInternalServerError, "Erro ao buscar enlace: "+err.Error())
		return
	}

	claims := GetAuthUser(r)
	if claims != nil && !claims.IsSuperAdmin && claims.TenantID != existing.TenantID {
		WriteError(w, http.StatusForbidden, "Acesso negado a este enlace")
		return
	}

	var req models.BackboneLink
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Payload inválido: "+err.Error())
		return
	}
	req.ID = id
	if claims != nil && !claims.IsSuperAdmin {
		req.TenantID = claims.TenantID
	}

	if err := c.linkStore.Update(req); err != nil {
		WriteError(w, http.StatusInternalServerError, "Falha ao atualizar enlace: "+err.Error())
		return
	}

	updated, _ := c.linkStore.GetByID(id)

	if c.auditStore != nil && claims != nil {
		_ = c.auditStore.Record(&models.AuditLog{
			TenantID:        updated.TenantID,
			UserID:          claims.UserID,
			UserName:        claims.Name,
			UserEmail:       claims.Email,
			ClientIP:        r.RemoteAddr,
			Action:          models.ActionUpdateBackboneLink,
			CommandExecuted: "Atualizado traçado/propriedades do enlace PTP: " + updated.Name,
			Status:          "SUCCESS",
		})
	}

	WriteJSON(w, http.StatusOK, updated)
}

// DeleteLink handles DELETE /api/backbone/links/{id}
func (c *LinkController) DeleteLink(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID do enlace é obrigatório")
		return
	}

	existing, err := c.linkStore.GetByID(id)
	if err != nil {
		if errors.Is(err, storage.ErrLinkNotFound) {
			WriteError(w, http.StatusNotFound, "Enlace não encontrado")
			return
		}
		WriteError(w, http.StatusInternalServerError, "Erro ao buscar enlace: "+err.Error())
		return
	}

	claims := GetAuthUser(r)
	if claims != nil && !claims.IsSuperAdmin && claims.TenantID != existing.TenantID {
		WriteError(w, http.StatusForbidden, "Acesso negado a este enlace")
		return
	}

	if err := c.linkStore.Delete(id); err != nil {
		WriteError(w, http.StatusInternalServerError, "Falha ao remover enlace: "+err.Error())
		return
	}

	if c.auditStore != nil && claims != nil {
		_ = c.auditStore.Record(&models.AuditLog{
			TenantID:        existing.TenantID,
			UserID:          claims.UserID,
			UserName:        claims.Name,
			UserEmail:       claims.Email,
			ClientIP:        r.RemoteAddr,
			Action:          models.ActionDeleteBackboneLink,
			CommandExecuted: "Removido enlace PTP: " + existing.Name,
			Status:          "SUCCESS",
		})
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "Enlace removido com sucesso"})
}
