package api

import (
	"encoding/json"
	"net/http"
	"strings"

	"network-software/internal/models"
	"network-software/internal/storage"
	"network-software/internal/traffic"
)

// ProfileController handles HTTP endpoints for Traffic Engineering Profiles.
type ProfileController struct {
	profileSvc *traffic.ProfileService
	auditStore storage.IAuditStore
}

// NewProfileController instantiates the ProfileController.
func NewProfileController(profileSvc *traffic.ProfileService, auditStore storage.IAuditStore) *ProfileController {
	return &ProfileController{
		profileSvc: profileSvc,
		auditStore: auditStore,
	}
}

// ListProfiles handles GET /api/traffic/profiles
func (pc *ProfileController) ListProfiles(w http.ResponseWriter, r *http.Request) {
	profiles := pc.profileSvc.GetAllProfiles()
	WriteJSON(w, http.StatusOK, profiles)
}

// GetProfile handles GET /api/traffic/profiles/{id}
func (pc *ProfileController) GetProfile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID do perfil é obrigatório")
		return
	}

	profile, err := pc.profileSvc.GetProfileByID(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, profile)
}

// CreateProfile handles POST /api/traffic/profiles
func (pc *ProfileController) CreateProfile(w http.ResponseWriter, r *http.Request) {
	var p models.TrafficProfile
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		WriteError(w, http.StatusBadRequest, "JSON inválido: "+err.Error())
		return
	}

	if strings.TrimSpace(p.Name) == "" {
		WriteError(w, http.StatusBadRequest, "Nome do perfil é obrigatório")
		return
	}

	if err := pc.profileSvc.SaveProfile(&p); err != nil {
		WriteError(w, http.StatusInternalServerError, "Erro ao salvar perfil: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, p)
}

// UpdateProfile handles PUT /api/traffic/profiles/{id}
func (pc *ProfileController) UpdateProfile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID do perfil é obrigatório")
		return
	}

	var p models.TrafficProfile
	if err := json.NewDecoder(r.Body).Decode(&p); err != nil {
		WriteError(w, http.StatusBadRequest, "JSON inválido: "+err.Error())
		return
	}

	p.ID = id
	if err := pc.profileSvc.SaveProfile(&p); err != nil {
		WriteError(w, http.StatusInternalServerError, "Erro ao atualizar perfil: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, p)
}

// DeleteProfile handles DELETE /api/traffic/profiles/{id}
func (pc *ProfileController) DeleteProfile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID do perfil é obrigatório")
		return
	}

	if err := pc.profileSvc.DeleteProfile(id); err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, map[string]string{"message": "Perfil excluído com sucesso"})
}

// CaptureProfileRequest is the payload for capturing current state.
type CaptureProfileRequest struct {
	Name        string            `json:"name"`
	Description string            `json:"description"`
	Tag         models.ProfileTag `json:"tag"`
	Color       string            `json:"color"`
}

// CaptureCurrentProfile handles POST /api/traffic/profiles/capture
func (pc *ProfileController) CaptureCurrentProfile(w http.ResponseWriter, r *http.Request) {
	var req CaptureProfileRequest
	_ = json.NewDecoder(r.Body).Decode(&req)

	profile, err := pc.profileSvc.CaptureCurrentState(req.Name, req.Description, req.Tag, req.Color)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusCreated, profile)
}

// DiffProfile handles POST /api/traffic/profiles/{id}/diff
func (pc *ProfileController) DiffProfile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID do perfil é obrigatório")
		return
	}

	profile, err := pc.profileSvc.GetProfileByID(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, err.Error())
		return
	}

	diff, err := pc.profileSvc.CalculateDiff(profile)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	scripts, commands, err := pc.profileSvc.GenerateScripts(profile)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	result := map[string]any{
		"profile":            profile,
		"diff":               diff,
		"scripts_by_device":  scripts,
		"commands_by_device": commands,
	}

	WriteJSON(w, http.StatusOK, result)
}

// ApplyProfile handles POST /api/traffic/profiles/{id}/apply
func (pc *ProfileController) ApplyProfile(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if id == "" {
		WriteError(w, http.StatusBadRequest, "ID do perfil é obrigatório")
		return
	}

	claims := GetAuthUser(r)
	userName := "Operador"
	userEmail := "operador@netpulse.com"
	if claims != nil {
		if claims.Name != "" {
			userName = claims.Name
		}
		if claims.Email != "" {
			userEmail = claims.Email
		}
	}
	clientIP := r.RemoteAddr
	if forwarded := r.Header.Get("X-Forwarded-For"); forwarded != "" {
		clientIP = strings.Split(forwarded, ",")[0]
	}

	result, err := pc.profileSvc.StageAndActivate(id, pc.auditStore, userName, userEmail, clientIP)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, result)
}
