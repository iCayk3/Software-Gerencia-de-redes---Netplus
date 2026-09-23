package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"network-software/internal/drivers"
	"network-software/internal/models"
	"network-software/internal/storage"
	"network-software/internal/traffic"
)

type TrafficController struct {
	store       *storage.DeviceStore
	asMetaStore *storage.ASMetadataStore
	trafficSvc  *traffic.Service
	uploadDir   string
	auditStore  storage.IAuditStore
}

func NewTrafficController(store *storage.DeviceStore, asMetaStore *storage.ASMetadataStore, trafficSvc *traffic.Service, uploadDir string, auditStore storage.IAuditStore) *TrafficController {
	return &TrafficController{
		store:       store,
		asMetaStore: asMetaStore,
		trafficSvc:  trafficSvc,
		uploadDir:   uploadDir,
		auditStore:  auditStore,
	}
}

// GetUploadOverview handles GET /api/traffic/upload/overview
func (tc *TrafficController) GetUploadOverview(w http.ResponseWriter, r *http.Request) {
	deviceID := r.URL.Query().Get("device_id")
	fresh := r.URL.Query().Get("fresh") == "true"

	if tc.trafficSvc == nil {
		WriteError(w, http.StatusInternalServerError, "Serviço de tráfego não inicializado")
		return
	}

	overview, err := tc.trafficSvc.GetUploadOverview(deviceID, fresh)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Erro ao obter visão geral de upload: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, overview)
}

// GetASMetadata handles GET /api/traffic/as-metadata
func (tc *TrafficController) GetASMetadata(w http.ResponseWriter, r *http.Request) {
	if tc.asMetaStore == nil {
		WriteJSON(w, http.StatusOK, map[string]models.ASMetadata{})
		return
	}
	WriteJSON(w, http.StatusOK, tc.asMetaStore.GetAll())
}

// UpdateASMetadata handles POST /api/traffic/as-metadata
func (tc *TrafficController) UpdateASMetadata(w http.ResponseWriter, r *http.Request) {
	var req models.ASMetadataUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Corpo da requisição inválido: "+err.Error())
		return
	}

	asn := strings.TrimSpace(req.ASN)
	asn = strings.TrimPrefix(strings.ToUpper(asn), "AS")
	if asn == "" {
		WriteError(w, http.StatusBadRequest, "Campo 'asn' é obrigatório")
		return
	}

	meta := models.ASMetadata{
		ASN:           asn,
		Alias:         req.Alias,
		ImageURL:      req.ImageURL,
		Description:   req.Description,
		Role:          req.Role,
		Color:         req.Color,
		CustomGateway: req.CustomGateway,
		UpdatedAt:     time.Now(),
	}

	if tc.asMetaStore != nil {
		// If image_url was omitted, preserve existing image_url if present
		if meta.ImageURL == "" {
			if existing, ok := tc.asMetaStore.GetByASN(asn); ok {
				meta.ImageURL = existing.ImageURL
			}
		}
		if err := tc.asMetaStore.Set(meta); err != nil {
			WriteError(w, http.StatusInternalServerError, "Erro ao salvar metadados do AS: "+err.Error())
			return
		}
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message":  "Metadados do AS atualizados com sucesso",
		"metadata": meta,
	})
}

// UploadASImage handles POST /api/traffic/as-metadata/upload-image
func (tc *TrafficController) UploadASImage(w http.ResponseWriter, r *http.Request) {
	// 5 MB max
	if err := r.ParseMultipartForm(5 << 20); err != nil {
		WriteError(w, http.StatusBadRequest, "Falha ao processar formulário multipart: "+err.Error())
		return
	}

	asn := strings.TrimSpace(r.FormValue("asn"))
	asn = strings.TrimPrefix(strings.ToUpper(asn), "AS")
	if asn == "" {
		WriteError(w, http.StatusBadRequest, "Campo 'asn' é obrigatório")
		return
	}

	file, header, err := r.FormFile("image")
	if err != nil {
		WriteError(w, http.StatusBadRequest, "Arquivo de imagem obrigatório ('image'): "+err.Error())
		return
	}
	defer file.Close()

	ext := strings.ToLower(filepath.Ext(header.Filename))
	if ext != ".png" && ext != ".jpg" && ext != ".jpeg" && ext != ".svg" && ext != ".webp" && ext != ".gif" {
		WriteError(w, http.StatusBadRequest, "Formato não suportado. Use PNG, JPG, JPEG, SVG ou WebP")
		return
	}

	if err := os.MkdirAll(tc.uploadDir, 0755); err != nil {
		WriteError(w, http.StatusInternalServerError, "Erro ao preparar diretório de uploads: "+err.Error())
		return
	}

	filename := fmt.Sprintf("as_%s_%d%s", asn, time.Now().Unix(), ext)
	dstPath := filepath.Join(tc.uploadDir, filename)

	dst, err := os.Create(dstPath)
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Erro ao salvar imagem no disco: "+err.Error())
		return
	}
	defer dst.Close()

	if _, err := io.Copy(dst, file); err != nil {
		WriteError(w, http.StatusInternalServerError, "Erro ao gravar dados do arquivo: "+err.Error())
		return
	}

	imageURL := "/api/uploads/" + filename

	// Update existing ASMetadata or create minimal entry
	if tc.asMetaStore != nil {
		meta, ok := tc.asMetaStore.GetByASN(asn)
		if !ok {
			meta = models.ASMetadata{
				ASN:   asn,
				Alias: "AS " + asn,
			}
		}
		meta.ImageURL = imageURL
		_ = tc.asMetaStore.Set(meta)
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message":   "Upload realizado com sucesso",
		"image_url": imageURL,
		"asn":       asn,
	})
}

// GetDevicePrepends handles GET /api/devices/{id}/bgp/prepends
func (tc *TrafficController) GetDevicePrepends(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	fresh := r.URL.Query().Get("fresh") == "true"

	if tc.trafficSvc != nil {
		overview, err := tc.trafficSvc.GetPrepends(id, fresh)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "Failed to retrieve BGP prepends: "+err.Error())
			return
		}
		WriteJSON(w, http.StatusOK, overview)
		return
	}

	device, err := tc.store.GetByID(id)
	if err != nil {
		WriteError(w, http.StatusNotFound, "Device not found")
		return
	}

	driver, err := drivers.NewDriver(device)
	if err != nil {
		WriteError(w, http.StatusBadRequest, err.Error())
		return
	}

	overview, err := driver.GetBGPPrepends()
	if err != nil {
		WriteError(w, http.StatusInternalServerError, "Failed to retrieve BGP prepends: "+err.Error())
		return
	}

	WriteJSON(w, http.StatusOK, overview)
}

// GetAllPrepends handles GET /api/bgp/prepends/all
func (tc *TrafficController) GetAllPrepends(w http.ResponseWriter, r *http.Request) {
	fresh := r.URL.Query().Get("fresh") == "true"

	if tc.trafficSvc != nil {
		allOverviews, err := tc.trafficSvc.GetAllPrepends(fresh)
		if err != nil {
			WriteError(w, http.StatusInternalServerError, "Failed to retrieve BGP prepends: "+err.Error())
			return
		}
		if allOverviews == nil {
			allOverviews = make([]models.DevicePrependOverview, 0)
		}
		WriteJSON(w, http.StatusOK, allOverviews)
		return
	}

	devices := tc.store.GetAll()
	allOverviews := make([]models.DevicePrependOverview, 0)
	for _, d := range devices {
		if !d.IsBGP {
			continue
		}
		dev := d
		driver, err := drivers.NewDriver(&dev)
		if err == nil {
			ov, err := driver.GetBGPPrepends()
			if err == nil && ov != nil {
				allOverviews = append(allOverviews, *ov)
			}
		}
	}
	WriteJSON(w, http.StatusOK, allOverviews)
}

// GetSyncStatus handles GET /api/traffic/status
func (tc *TrafficController) GetSyncStatus(w http.ResponseWriter, r *http.Request) {
	if tc.trafficSvc != nil {
		WriteJSON(w, http.StatusOK, tc.trafficSvc.GetSyncStatus())
		return
	}
	WriteJSON(w, http.StatusOK, map[string]string{"status": "service not configured"})
}

// ApplyPrepend handles POST /api/devices/{id}/bgp/prepends and POST /api/traffic/download/prepend
func (tc *TrafficController) ApplyPrepend(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req models.PrependApplyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Payload inválido: "+err.Error())
		return
	}

	if req.DeviceID == "" && id != "" {
		req.DeviceID = id
	}

	if req.DeviceID == "" || req.PeerIP == "" {
		WriteError(w, http.StatusBadRequest, "Campos 'device_id' e 'peer_ip' são obrigatórios")
		return
	}

	if tc.trafficSvc != nil {
		if err := tc.trafficSvc.ApplyPrepend(req); err != nil {
			WriteError(w, http.StatusInternalServerError, "Erro ao aplicar prepend no equipamento: "+err.Error())
			return
		}
	} else {
		device, err := tc.store.GetByID(req.DeviceID)
		if err != nil {
			WriteError(w, http.StatusNotFound, "Dispositivo não encontrado")
			return
		}
		driver, err := drivers.NewDriver(device)
		if err != nil {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := driver.ApplyBGPPrepend(req); err != nil {
			WriteError(w, http.StatusInternalServerError, "Erro ao aplicar prepend no equipamento: "+err.Error())
			return
		}
	}

	msg := fmt.Sprintf("[Modo Manual Ativo] Comandos de Prepend (%dx) gerados para %s. Nenhuma alteração foi executada no equipamento.", req.PrependCount, req.PeerIP)
	if req.Block {
		msg = fmt.Sprintf("[Modo Manual Ativo] Comandos de Bloqueio gerados para %s. Nenhuma alteração foi executada no equipamento.", req.PeerIP)
	}

	if tc.auditStore != nil {
		user := GetAuthUser(r)
		userName, userEmail, userID := "Sistema", "system@netpulse.com", "sys"
		if user != nil {
			userName, userEmail, userID = user.Name, user.Email, user.UserID
		}
		actionDesc := fmt.Sprintf("Prepend %dx aplicado para peer %s (bloco %s)", req.PrependCount, req.PeerIP, req.Prefix)
		if req.Block {
			actionDesc = fmt.Sprintf("Bloqueio de rota aplicado para peer %s (bloco %s)", req.PeerIP, req.Prefix)
		}
		_ = tc.auditStore.Record(&models.AuditLog{
			TenantID:         "default-tenant",
			UserID:           userID,
			UserName:         userName,
			UserEmail:        userEmail,
			ClientIP:         r.RemoteAddr,
			Action:           models.ActionApplyPrepend,
			TargetDeviceID:   req.DeviceID,
			CommandExecuted:  actionDesc,
			Status:           "MANUAL_DISPATCH",
		})
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message":       msg,
		"device_id":     req.DeviceID,
		"peer_ip":       req.PeerIP,
		"prefix":        req.Prefix,
		"prepend_count": req.PrependCount,
		"block":         req.Block,
		"mode":          "manual",
	})
}

// SetLocalPreference handles POST /api/traffic/upload/local-pref
func (tc *TrafficController) SetLocalPreference(w http.ResponseWriter, r *http.Request) {
	var req models.LocalPrefApplyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Corpo da requisição inválido: "+err.Error())
		return
	}

	if req.DeviceID == "" || req.PeerIP == "" || req.LocalPref <= 0 {
		WriteError(w, http.StatusBadRequest, "Campos 'device_id', 'peer_ip' e 'local_pref' (>0) são obrigatórios")
		return
	}

	if tc.trafficSvc != nil {
		if err := tc.trafficSvc.SetBGPLocalPreference(req); err != nil {
			WriteError(w, http.StatusInternalServerError, "Erro ao processar Local-Preference: "+err.Error())
			return
		}
	} else {
		dev, err := tc.store.GetByID(req.DeviceID)
		if err != nil {
			WriteError(w, http.StatusNotFound, "Dispositivo não encontrado")
			return
		}
		driver, err := drivers.NewDriver(dev)
		if err != nil {
			WriteError(w, http.StatusBadRequest, err.Error())
			return
		}
		if err := driver.SetBGPLocalPreference(req); err != nil {
			WriteError(w, http.StatusInternalServerError, "Erro ao processar Local-Preference: "+err.Error())
			return
		}
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message":    fmt.Sprintf("[Modo Manual Ativo] Comandos para Local-Preference %d gerados com sucesso. Nenhuma alteração foi executada no equipamento.", req.LocalPref),
		"peer_ip":    req.PeerIP,
		"local_pref": req.LocalPref,
		"mode":       "manual",
	})
}
