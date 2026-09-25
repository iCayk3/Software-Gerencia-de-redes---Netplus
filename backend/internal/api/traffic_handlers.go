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
	store         *storage.DeviceStore
	asMetaStore   *storage.ASMetadataStore
	peerMetaStore *storage.PeerMetadataStore
	trafficSvc    *traffic.Service
	uploadDir     string
	auditStore    storage.IAuditStore
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

func (tc *TrafficController) SetPeerMetadataStore(p *storage.PeerMetadataStore) {
	tc.peerMetaStore = p
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
		if existing, ok := tc.asMetaStore.GetByASN(asn); ok {
			if meta.ImageURL == "" {
				meta.ImageURL = existing.ImageURL
			}
			if meta.Role == "" {
				meta.Role = existing.Role
			}
			if meta.Description == "" {
				meta.Description = existing.Description
			}
			if meta.Color == "" {
				meta.Color = existing.Color
			}
			if meta.CustomGateway == "" {
				meta.CustomGateway = existing.CustomGateway
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

// GetPeerMetadata handles GET /api/traffic/peer-metadata
func (tc *TrafficController) GetPeerMetadata(w http.ResponseWriter, r *http.Request) {
	if tc.peerMetaStore == nil {
		WriteJSON(w, http.StatusOK, map[string]models.PeerMetadata{})
		return
	}
	WriteJSON(w, http.StatusOK, tc.peerMetaStore.GetAll())
}

// UpdatePeerMetadata handles POST /api/traffic/peer-metadata
func (tc *TrafficController) UpdatePeerMetadata(w http.ResponseWriter, r *http.Request) {
	var req models.PeerMetadataUpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		WriteError(w, http.StatusBadRequest, "Corpo da requisição inválido: "+err.Error())
		return
	}

	peerIP := strings.TrimSpace(req.PeerIP)
	if peerIP == "" {
		WriteError(w, http.StatusBadRequest, "Campo 'peer_ip' é obrigatório")
		return
	}

	meta := models.PeerMetadata{
		DeviceID:    strings.TrimSpace(req.DeviceID),
		PeerIP:      peerIP,
		RemoteAS:    strings.TrimSpace(req.RemoteAS),
		Description: strings.TrimSpace(req.Description),
		UpdatedAt:   time.Now(),
	}

	if tc.peerMetaStore != nil {
		if err := tc.peerMetaStore.Set(meta); err != nil {
			WriteError(w, http.StatusInternalServerError, "Erro ao salvar descrição da sessão BGP: "+err.Error())
			return
		}
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"message":  "Descrição da sessão atualizada com sucesso",
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

	dev, _ := tc.store.GetByID(req.DeviceID)
	cmds, cliScript := buildPrependCLI(dev, req)

	if tc.auditStore != nil {
		user := GetAuthUser(r)
		userName, userEmail, userID := "Sistema", "system@netpulse.com", "sys"
		if user != nil {
			userName, userEmail, userID = user.Name, user.Email, user.UserID
		}
		_ = tc.auditStore.Record(&models.AuditLog{
			TenantID:         "default-tenant",
			UserID:           userID,
			UserName:         userName,
			UserEmail:        userEmail,
			ClientIP:         r.RemoteAddr,
			Action:           models.ActionApplyPrepend,
			TargetDeviceID:   req.DeviceID,
			CommandExecuted:  cliScript,
			Status:           "MANUAL_DISPATCH",
		})
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":        "MANUAL_DISPATCH",
		"message":       msg,
		"device_id":     req.DeviceID,
		"peer_ip":       req.PeerIP,
		"prefix":        req.Prefix,
		"prepend_count": req.PrependCount,
		"block":         req.Block,
		"mode":          "manual",
		"commands":      cmds,
		"cli_script":    cliScript,
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

	dev, _ := tc.store.GetByID(req.DeviceID)
	cmds, cliScript := buildLocalPrefCLI(dev, req)

	if tc.auditStore != nil {
		user := GetAuthUser(r)
		userName, userEmail, userID := "Sistema", "system@netpulse.com", "sys"
		if user != nil {
			userName, userEmail, userID = user.Name, user.Email, user.UserID
		}
		_ = tc.auditStore.Record(&models.AuditLog{
			TenantID:         "default-tenant",
			UserID:           userID,
			UserName:         userName,
			UserEmail:        userEmail,
			ClientIP:         r.RemoteAddr,
			Action:           "SET_LOCAL_PREFERENCE",
			TargetDeviceID:   req.DeviceID,
			CommandExecuted:  cliScript,
			Status:           "MANUAL_DISPATCH",
		})
	}

	WriteJSON(w, http.StatusOK, map[string]any{
		"status":     "MANUAL_DISPATCH",
		"message":    fmt.Sprintf("[Modo Manual Ativo] Comandos para Local-Preference %d gerados com sucesso. Nenhuma alteração foi executada no equipamento.", req.LocalPref),
		"peer_ip":    req.PeerIP,
		"local_pref": req.LocalPref,
		"mode":       "manual",
		"commands":   cmds,
		"cli_script": cliScript,
	})
}

func buildPrependCLI(dev *models.Device, req models.PrependApplyRequest) ([]string, string) {
	devName := "Roteador"
	devHost := ""
	vendor := models.VendorHuawei
	if dev != nil {
		devName = dev.Name
		devHost = dev.Host
		vendor = dev.Vendor
	}

	switch vendor {
	case models.VendorHuawei:
		nodeNum := 10
		if strings.HasSuffix(req.Prefix, "/22") {
			nodeNum = 10
		} else if strings.Contains(req.Prefix, ".28.") && strings.HasSuffix(req.Prefix, "/23") {
			nodeNum = 20
		} else if strings.Contains(req.Prefix, ".30.") && strings.HasSuffix(req.Prefix, "/23") {
			nodeNum = 30
		} else if strings.Contains(req.Prefix, ".28.") && strings.HasSuffix(req.Prefix, "/24") {
			nodeNum = 40
		} else if strings.Contains(req.Prefix, ".29.") && strings.HasSuffix(req.Prefix, "/24") {
			nodeNum = 50
		} else if strings.Contains(req.Prefix, ".30.") && strings.HasSuffix(req.Prefix, "/24") {
			nodeNum = 60
		} else if strings.Contains(req.Prefix, ".31.") && strings.HasSuffix(req.Prefix, "/24") {
			nodeNum = 70
		}

		base := "2003"
		pfxLower := strings.ToLower(req.PeerIP)
		if strings.Contains(pfxLower, "wiki") || strings.Contains(req.PeerIP, "45.181.") || strings.Contains(req.PeerIP, "10.200.") {
			base = "2002"
		} else if strings.Contains(req.PeerIP, "45.68.") {
			base = "4500" // Belém
		} else if strings.Contains(req.PeerIP, "187.16.195.") {
			base = "4400" // Fortaleza
		} else if strings.Contains(req.PeerIP, "187.16.216.") {
			base = "4100" // SP
		} else if strings.Contains(req.PeerIP, "45.184.") {
			base = "4000" // BSB
		}

		comm := fmt.Sprintf("1:%s%d", base, req.PrependCount)
		if req.Block {
			comm = fmt.Sprintf("0:%s0", base)
		}

		cmds := []string{
			"system-view",
			fmt.Sprintf("route-policy RP-TAG-V4-ORIGIN permit node %d", nodeNum),
			fmt.Sprintf("apply community 267943:1000 %s 1:40000 1:41000 1:42000 1:43000 additive", comm),
			"commit",
			"return",
			"refresh bgp all export",
		}
		script := fmt.Sprintf("# [%s] %s (Huawei VRP)\n%s", devName, devHost, strings.Join(cmds, "\n"))
		return cmds, script

	case models.VendorMikrotikV7:
		rule := fmt.Sprintf("if (dst == %s) { set bgp-path-prepend=%d; accept; }", req.Prefix, req.PrependCount)
		if req.Block {
			rule = fmt.Sprintf("if (dst == %s) { reject; }", req.Prefix)
		}
		cmds := []string{
			fmt.Sprintf(`/routing/filter/rule/set [find where rule~"%s"] rule="%s"`, req.Prefix, rule),
			"/routing/bgp/connection/refresh",
		}
		script := fmt.Sprintf("# [%s] %s (MikroTik RouterOS v7)\n%s", devName, devHost, strings.Join(cmds, "\n"))
		return cmds, script

	case models.VendorMikrotikV6:
		cmd := fmt.Sprintf(`/routing filter set [find prefix="%s"] action=accept set-bgp-prepend=%d`, req.Prefix, req.PrependCount)
		if req.Block {
			cmd = fmt.Sprintf(`/routing filter set [find prefix="%s"] action=discard`, req.Prefix)
		}
		cmds := []string{cmd, "/routing bgp peer refresh-all"}
		script := fmt.Sprintf("# [%s] %s (MikroTik RouterOS v6)\n%s", devName, devHost, strings.Join(cmds, "\n"))
		return cmds, script

	default:
		cmd := fmt.Sprintf("# Prepend %dx para %s (bloco %s)", req.PrependCount, req.PeerIP, req.Prefix)
		return []string{cmd}, fmt.Sprintf("# [%s] %s\n%s", devName, devHost, cmd)
	}
}

func buildLocalPrefCLI(dev *models.Device, req models.LocalPrefApplyRequest) ([]string, string) {
	devName := "Roteador"
	devHost := ""
	vendor := models.VendorHuawei
	if dev != nil {
		devName = dev.Name
		devHost = dev.Host
		vendor = dev.Vendor
	}

	policyName := req.PolicyName
	if policyName == "" {
		policyName = fmt.Sprintf("RP-IN-%s", req.PeerIP)
	}
	nodeNum := req.Node
	if nodeNum <= 0 {
		nodeNum = 11
	}

	switch vendor {
	case models.VendorHuawei:
		cmds := []string{
			"system-view",
			fmt.Sprintf("route-policy %s permit node %d", policyName, nodeNum),
			fmt.Sprintf(" apply local-preference %d", req.LocalPref),
			"commit",
			"return",
			fmt.Sprintf("refresh bgp %s import", req.PeerIP),
		}
		script := fmt.Sprintf("# [%s] %s (Huawei VRP)\n%s", devName, devHost, strings.Join(cmds, "\n"))
		return cmds, script

	case models.VendorMikrotikV7:
		cmds := []string{
			fmt.Sprintf(`/routing/filter/rule/add chain=bgp-in rule="if (bgp-peer == %s) { set bgp-local-pref %d; }"`, req.PeerIP, req.LocalPref),
			"/routing/bgp/connection/refresh",
		}
		script := fmt.Sprintf("# [%s] %s (MikroTik RouterOS v7)\n%s", devName, devHost, strings.Join(cmds, "\n"))
		return cmds, script

	case models.VendorMikrotikV6:
		cmds := []string{
			fmt.Sprintf(`/routing filter add chain=bgp-in peer="%s" set-bgp-local-pref=%d`, req.PeerIP, req.LocalPref),
			"/routing bgp peer refresh-all",
		}
		script := fmt.Sprintf("# [%s] %s (MikroTik RouterOS v6)\n%s", devName, devHost, strings.Join(cmds, "\n"))
		return cmds, script

	case models.VendorDatacom:
		cmds := []string{
			"configure terminal",
			"route-map RM-BGP-IN permit 10",
			fmt.Sprintf(" set local-preference %d", req.LocalPref),
			"exit",
		}
		script := fmt.Sprintf("# [%s] %s (Datacom DmOS)\n%s", devName, devHost, strings.Join(cmds, "\n"))
		return cmds, script

	default:
		cmd := fmt.Sprintf("# Local-Preference %d para peer %s", req.LocalPref, req.PeerIP)
		return []string{cmd}, fmt.Sprintf("# [%s] %s\n%s", devName, devHost, cmd)
	}
}
