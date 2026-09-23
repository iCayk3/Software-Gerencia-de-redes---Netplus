package api

import (
	"encoding/json"
	"net/http"

	"network-software/internal/models"
	"network-software/internal/storage"

	"golang.org/x/crypto/bcrypt"
)

type AuthController struct {
	userStore  storage.IUserStore
	auditStore storage.IAuditStore
}

func NewAuthController(userStore storage.IUserStore, auditStore storage.IAuditStore) *AuthController {
	return &AuthController{
		userStore:  userStore,
		auditStore: auditStore,
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

	// Record audit login event
	if ac.auditStore != nil {
		_ = ac.auditStore.Record(&models.AuditLog{
			TenantID:        user.TenantID,
			UserID:          user.ID,
			UserName:        user.Name,
			UserEmail:       user.Email,
			ClientIP:        r.RemoteAddr,
			Action:          models.ActionUserLogin,
			CommandExecuted: "User logged into Web Console",
			Status:          "SUCCESS",
		})
	}

	_ = json.NewEncoder(w).Encode(models.LoginResponse{
		Token:     token,
		ExpiresAt: exp,
		User:      user.ToProfile(),
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

	_ = json.NewEncoder(w).Encode(user.ToProfile())
}

// ListUsers handles GET /api/auth/users (Admin only)
func (ac *AuthController) ListUsers(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")

	claims := GetAuthUser(r)
	tenantID := "default-tenant"
	if claims != nil && claims.TenantID != "" {
		tenantID = claims.TenantID
	}

	users, err := ac.userStore.ListUsers(tenantID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "Erro ao listar usuários"})
		return
	}

	_ = json.NewEncoder(w).Encode(users)
}
