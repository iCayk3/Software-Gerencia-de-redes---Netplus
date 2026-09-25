package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"network-software/internal/models"
	"network-software/internal/storage"
)

// TenantController handles HTTP endpoints for multi-tenant companies.
type TenantController struct {
	store      storage.ITenantStore
	auditStore storage.IAuditStore
}

func NewTenantController(store storage.ITenantStore, auditStore storage.IAuditStore) *TenantController {
	return &TenantController{
		store:      store,
		auditStore: auditStore,
	}
}

// ListTenants handles GET /api/tenants
// Superadmins see all companies. Tenant admins see only their own company.
func (c *TenantController) ListTenants(w http.ResponseWriter, r *http.Request) {
	claims := GetAuthUser(r)
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "Autenticação obrigatória")
		return
	}

	if claims.IsSuperAdmin {
		tenants, err := c.store.GetAll()
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "Erro ao listar empresas: "+err.Error())
			return
		}
		WriteJSON(w, http.StatusOK, tenants)
		return
	}

	// Normal tenant users see only their company
	tenant, err := c.store.GetByID(claims.TenantID)
	if err != nil {
		WriteJSON(w, http.StatusOK, []models.Tenant{})
		return
	}
	WriteJSON(w, http.StatusOK, []models.Tenant{*tenant})
}

// GetTenant handles GET /api/tenants/{id}
func (c *TenantController) GetTenant(w http.ResponseWriter, r *http.Request) {
	claims := GetAuthUser(r)
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "Autenticação obrigatória")
		return
	}

	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID da empresa é obrigatório")
		return
	}

	// Restrict to own tenant unless superadmin
	if !claims.IsSuperAdmin && claims.TenantID != id {
		WriteError(w, http.StatusForbidden, "Acesso negado aos dados desta empresa")
		return
	}

	tenant, err := c.store.GetByID(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Empresa não encontrada")
		return
	}

	WriteJSON(w, http.StatusOK, tenant)
}

// CreateTenant handles POST /api/tenants (Superadmin only)
func (c *TenantController) CreateTenant(w http.ResponseWriter, r *http.Request) {
	claims := GetAuthUser(r)
	if claims == nil || !claims.IsSuperAdmin {
		WriteError(w, http.StatusForbidden, "Apenas administradores globais podem cadastrar novas empresas clientes")
		return
	}

	var req models.CreateTenantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Corpo da requisição inválido: "+err.Error())
		return
	}

	name := strings.TrimSpace(req.Name)
	if name == "" {
		WriteError(w, http.StatusBadRequest, "O nome da empresa é obrigatório")
		return
	}

	asn := strings.TrimSpace(req.ASN)
	asn = strings.TrimPrefix(strings.ToUpper(asn), "AS")

	slug := strings.TrimSpace(req.Slug)
	if slug == "" {
		slug = strings.ToLower(strings.ReplaceAll(name, " ", "-"))
	}

	newTenant := models.Tenant{
		Name:         name,
		Slug:         slug,
		ASN:          asn,
		Document:     strings.TrimSpace(req.Document),
		ContactEmail: strings.TrimSpace(req.ContactEmail),
		ContactPhone: strings.TrimSpace(req.ContactPhone),
		LogoURL:      strings.TrimSpace(req.LogoURL),
		Plan:         req.Plan,
		Status:       req.Status,
	}

	created, err := c.store.Create(newTenant)
	if err != nil {
		WriteError(w, http.StatusBadRequest, "Erro ao cadastrar empresa: "+err.Error())
		return
	}

	if c.auditStore != nil {
		_ = c.auditStore.Record(&models.AuditLog{
			TenantID:        created.ID,
			UserID:          claims.UserID,
			UserName:        claims.Name,
			UserEmail:       claims.Email,
			ClientIP:        r.RemoteAddr,
			Action:          models.ActionCreateTenant,
			CommandExecuted: fmt.Sprintf("Cadastrou empresa cliente %s (ASN: %s, Slug: %s)", created.Name, created.ASN, created.Slug),
			Status:          "SUCCESS",
		})
	}

	WriteJSON(w, http.StatusCreated, created)
}

// UpdateTenant handles PUT /api/tenants/{id}
func (c *TenantController) UpdateTenant(w http.ResponseWriter, r *http.Request) {
	claims := GetAuthUser(r)
	if claims == nil {
		WriteError(w, http.StatusUnauthorized, "Autenticação obrigatória")
		return
	}

	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID da empresa é obrigatório")
		return
	}

	if !claims.IsSuperAdmin && claims.TenantID != id {
		WriteError(w, http.StatusForbidden, "Acesso negado para modificar esta empresa")
		return
	}

	var req models.UpdateTenantRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Corpo da requisição inválido: "+err.Error())
		return
	}

	asn := strings.TrimSpace(req.ASN)
	if asn != "" {
		asn = strings.TrimPrefix(strings.ToUpper(asn), "AS")
	}

	tenant := models.Tenant{
		ID:           id,
		Name:         strings.TrimSpace(req.Name),
		Slug:         strings.TrimSpace(req.Slug),
		ASN:          asn,
		Document:     strings.TrimSpace(req.Document),
		ContactEmail: strings.TrimSpace(req.ContactEmail),
		ContactPhone: strings.TrimSpace(req.ContactPhone),
		LogoURL:      strings.TrimSpace(req.LogoURL),
		Plan:         req.Plan,
		Status:       req.Status,
	}

	if err := c.store.Update(tenant); err != nil {
		WriteError(w, http.StatusBadRequest, "Erro ao atualizar empresa: "+err.Error())
		return
	}

	updated, _ := c.store.GetByID(id)

	if c.auditStore != nil {
		_ = c.auditStore.Record(&models.AuditLog{
			TenantID:        id,
			UserID:          claims.UserID,
			UserName:        claims.Name,
			UserEmail:       claims.Email,
			ClientIP:        r.RemoteAddr,
			Action:          models.ActionUpdateTenant,
			CommandExecuted: fmt.Sprintf("Atualizou dados da empresa cliente ID %s", id),
			Status:          "SUCCESS",
		})
	}

	WriteJSON(w, http.StatusOK, updated)
}

// DeleteTenant handles DELETE /api/tenants/{id} (Superadmin only)
func (c *TenantController) DeleteTenant(w http.ResponseWriter, r *http.Request) {
	claims := GetAuthUser(r)
	if claims == nil || !claims.IsSuperAdmin {
		WriteError(w, http.StatusForbidden, "Apenas administradores globais podem remover empresas clientes")
		return
	}

	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID da empresa é obrigatório")
		return
	}

	if err := c.store.Delete(id); err != nil {
		WriteError(w, http.StatusBadRequest, "Erro ao excluir empresa: "+err.Error())
		return
	}

	if c.auditStore != nil {
		_ = c.auditStore.Record(&models.AuditLog{
			TenantID:        id,
			UserID:          claims.UserID,
			UserName:        claims.Name,
			UserEmail:       claims.Email,
			ClientIP:        r.RemoteAddr,
			Action:          models.ActionDeleteTenant,
			CommandExecuted: fmt.Sprintf("Excluiu empresa cliente ID %s", id),
			Status:          "SUCCESS",
		})
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "Empresa excluída com sucesso"})
}
