package api

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"network-software/internal/models"
	"network-software/internal/storage"

	"golang.org/x/crypto/bcrypt"
)

type AuthController struct {
	userStore   storage.IUserStore
	tenantStore storage.ITenantStore
	auditStore  storage.IAuditStore
}

func NewAuthController(userStore storage.IUserStore, tenantStore storage.ITenantStore, auditStore storage.IAuditStore) *AuthController {
	return &AuthController{
		userStore:   userStore,
		tenantStore: tenantStore,
		auditStore:  auditStore,
	}
}

// Login handles POST /api/auth/login
func (ac *AuthController) Login(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	var req models.LoginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Requisição inválida"})
		return
	}

	user, err := ac.userStore.GetByEmail(req.Email)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "E-mail ou senha incorretos"})
		return
	}

	if user.Status != "active" {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Usuário suspenso ou inativo"})
		return
	}

	if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.Password)); err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "E-mail ou senha incorretos"})
		return
	}

	token, exp, err := GenerateJWT(user)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Falha ao gerar token de sessão"})
		return
	}

	_ = ac.userStore.UpdateLastLogin(user.ID)

	// Enrich profile with TenantName
	profile := user.ToProfile()
	if ac.tenantStore != nil {
		if t, err := ac.tenantStore.GetByID(user.TenantID); err == nil && t != nil {
			profile.TenantName = t.Name
		}
	}

	// Record audit login event
	if ac.auditStore != nil {
		_ = ac.auditStore.Record(&models.AuditLog{
			TenantID:        user.TenantID,
			UserID:          user.ID,
			UserName:        user.Name,
			UserEmail:       user.Email,
			ClientIP:        r.RemoteAddr,
			Action:          models.ActionUserLogin,
			CommandExecuted: fmt.Sprintf("Usuário efetuou login no console (Tenant: %s)", user.TenantID),
			Status:          "SUCCESS",
		})
	}

	_ = json.NewEncoder(w).Encode(models.LoginResponse{
		Token:     token,
		ExpiresAt: exp,
		User:      profile,
	})
}

// Me handles GET /api/auth/me
func (ac *AuthController) Me(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	claims := GetAuthUser(r)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Não autenticado"})
		return
	}

	user, err := ac.userStore.GetByID(claims.UserID)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Usuário não encontrado"})
		return
	}

	profile := user.ToProfile()
	if ac.tenantStore != nil {
		if t, err := ac.tenantStore.GetByID(user.TenantID); err == nil && t != nil {
			profile.TenantName = t.Name
		}
	}

	_ = json.NewEncoder(w).Encode(profile)
}

// ListUsers handles GET /api/auth/users
func (ac *AuthController) ListUsers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	claims := GetAuthUser(r)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Não autenticado"})
		return
	}

	targetTenant := claims.TenantID
	if claims.IsSuperAdmin {
		// Superadmin can query any tenant or all
		if q := r.URL.Query().Get("tenant_id"); q != "" {
			targetTenant = q
		} else {
			targetTenant = "all"
		}
	}

	users, err := ac.userStore.ListUsers(targetTenant)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao listar usuários: " + err.Error()})
		return
	}

	// Enrich tenant names if possible
	if ac.tenantStore != nil {
		tenantMap := make(map[string]string)
		if allTenants, err := ac.tenantStore.GetAll(); err == nil {
			for _, t := range allTenants {
				tenantMap[t.ID] = t.Name
			}
		}
		for i := range users {
			if name, ok := tenantMap[users[i].TenantID]; ok {
				users[i].TenantName = name
			}
		}
	}

	_ = json.NewEncoder(w).Encode(users)
}

// CreateUser handles POST /api/auth/users
func (ac *AuthController) CreateUser(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	claims := GetAuthUser(r)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Não autenticado"})
		return
	}

	var req models.CreateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Corpo da requisição inválido"})
		return
	}

	req.Email = strings.TrimSpace(strings.ToLower(req.Email))
	req.Name = strings.TrimSpace(req.Name)

	if req.Email == "" || req.Name == "" || req.Password == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Nome, e-mail e senha são obrigatórios"})
		return
	}

	// Security: If not SuperAdmin, force creation inside own tenant and disallow creating other SuperAdmins
	if !claims.IsSuperAdmin {
		req.TenantID = claims.TenantID
		req.IsSuperAdmin = false
	} else if req.TenantID == "" {
		req.TenantID = "default-tenant"
	}

	// Validate target tenant exists
	if ac.tenantStore != nil && req.TenantID != "" {
		if _, err := ac.tenantStore.GetByID(req.TenantID); err != nil {
			w.WriteHeader(http.StatusBadRequest)
			_ = json.NewEncoder(w).Encode(map[string]string{"error": "A empresa selecionada (tenant_id) não existe"})
			return
		}
	}

	if req.Role == "" {
		req.Role = models.RoleViewer
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao criptografar senha"})
		return
	}

	newUser := models.User{
		TenantID:     req.TenantID,
		Name:         req.Name,
		Email:        req.Email,
		PasswordHash: string(hash),
		Role:         req.Role,
		IsSuperAdmin: req.IsSuperAdmin,
		Status:       "active",
	}

	created, err := ac.userStore.CreateUser(newUser)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": err.Error()})
		return
	}

	if ac.auditStore != nil {
		_ = ac.auditStore.Record(&models.AuditLog{
			TenantID:        created.TenantID,
			UserID:          claims.UserID,
			UserName:        claims.Name,
			UserEmail:       claims.Email,
			ClientIP:        r.RemoteAddr,
			Action:          models.ActionCreateUser,
			CommandExecuted: fmt.Sprintf("Cadastrou novo usuário %s (%s, Role: %s, Tenant: %s)", created.Name, created.Email, created.Role, created.TenantID),
			Status:          "SUCCESS",
		})
	}

	profile := created.ToProfile()
	if ac.tenantStore != nil {
		if t, err := ac.tenantStore.GetByID(created.TenantID); err == nil && t != nil {
			profile.TenantName = t.Name
		}
	}

	w.WriteHeader(http.StatusCreated)
	_ = json.NewEncoder(w).Encode(profile)
}

// UpdateUser handles PUT /api/auth/users/{id}
func (ac *AuthController) UpdateUser(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	claims := GetAuthUser(r)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Não autenticado"})
		return
	}

	id := r.PathValue("id")
	if id == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "ID do usuário é obrigatório"})
		return
	}

	existing, err := ac.userStore.GetByID(id)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Usuário não encontrado"})
		return
	}

	// Security: Non-superadmins cannot modify users outside their tenant
	if !claims.IsSuperAdmin && existing.TenantID != claims.TenantID {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Permissão negada para editar usuário de outro cliente"})
		return
	}

	var req models.UpdateUserRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Corpo da requisição inválido"})
		return
	}

	existing.Name = strings.TrimSpace(req.Name)
	if req.Role != "" {
		existing.Role = req.Role
	}
	if req.Status != "" {
		existing.Status = req.Status
	}

	// Only SuperAdmin can reassign tenant or grant superadmin flag
	if claims.IsSuperAdmin {
		if req.TenantID != "" {
			existing.TenantID = req.TenantID
		}
		if req.IsSuperAdmin != nil {
			existing.IsSuperAdmin = *req.IsSuperAdmin
		}
	}

	if req.Password != "" {
		hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
		if err == nil {
			existing.PasswordHash = string(hash)
		}
	}

	if err := ac.userStore.UpdateUser(*existing); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao atualizar usuário: " + err.Error()})
		return
	}

	if ac.auditStore != nil {
		_ = ac.auditStore.Record(&models.AuditLog{
			TenantID:        existing.TenantID,
			UserID:          claims.UserID,
			UserName:        claims.Name,
			UserEmail:       claims.Email,
			ClientIP:        r.RemoteAddr,
			Action:          models.ActionUpdateUser,
			CommandExecuted: fmt.Sprintf("Atualizou perfil do usuário ID %s (%s)", existing.ID, existing.Email),
			Status:          "SUCCESS",
		})
	}

	_ = json.NewEncoder(w).Encode(existing.ToProfile())
}

// DeleteUser handles DELETE /api/auth/users/{id}
func (ac *AuthController) DeleteUser(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	claims := GetAuthUser(r)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Não autenticado"})
		return
	}

	id := r.PathValue("id")
	if id == "" {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "ID do usuário é obrigatório"})
		return
	}

	if id == claims.UserID {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Você não pode excluir o seu próprio usuário"})
		return
	}

	existing, err := ac.userStore.GetByID(id)
	if err != nil {
		w.WriteHeader(http.StatusNotFound)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Usuário não encontrado"})
		return
	}

	if !claims.IsSuperAdmin && existing.TenantID != claims.TenantID {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Permissão negada para excluir usuário de outro cliente"})
		return
	}

	if err := ac.userStore.DeleteUser(id); err != nil {
		w.WriteHeader(http.StatusBadRequest)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao excluir usuário: " + err.Error()})
		return
	}

	if ac.auditStore != nil {
		_ = ac.auditStore.Record(&models.AuditLog{
			TenantID:        existing.TenantID,
			UserID:          claims.UserID,
			UserName:        claims.Name,
			UserEmail:       claims.Email,
			ClientIP:        r.RemoteAddr,
			Action:          models.ActionDeleteUser,
			CommandExecuted: fmt.Sprintf("Excluiu o usuário ID %s (%s)", existing.ID, existing.Email),
			Status:          "SUCCESS",
		})
	}

	_ = json.NewEncoder(w).Encode(map[string]string{"message": "Usuário excluído com sucesso"})
}
