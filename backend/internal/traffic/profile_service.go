package traffic

import (
	"fmt"
	"strings"
	"time"

	"network-software/internal/models"
	"network-software/internal/storage"
)

// ProfileService coordinates Traffic Engineering profile management, diffing, and CLI staging.
type ProfileService struct {
	trafficSvc   *Service
	profileStore *storage.ProfileStore
	deviceStore  *storage.DeviceStore
}

// NewProfileService creates a new ProfileService instance.
func NewProfileService(trafficSvc *Service, profileStore *storage.ProfileStore, deviceStore *storage.DeviceStore) *ProfileService {
	return &ProfileService{
		trafficSvc:   trafficSvc,
		profileStore: profileStore,
		deviceStore:  deviceStore,
	}
}

// GetAllProfiles returns all saved profiles.
func (ps *ProfileService) GetAllProfiles() []models.TrafficProfile {
	return ps.profileStore.GetAll()
}

// GetProfileByID returns a profile by ID.
func (ps *ProfileService) GetProfileByID(id string) (*models.TrafficProfile, error) {
	return ps.profileStore.GetByID(id)
}

// SaveProfile creates or updates a profile.
func (ps *ProfileService) SaveProfile(p *models.TrafficProfile) error {
	return ps.profileStore.Save(p)
}

// DeleteProfile deletes a non-default profile.
func (ps *ProfileService) DeleteProfile(id string) error {
	return ps.profileStore.Delete(id)
}

// CaptureCurrentState snapshots the live/cached state of the network into a new TrafficProfile.
func (ps *ProfileService) CaptureCurrentState(name, description string, tag models.ProfileTag, color string) (*models.TrafficProfile, error) {
	if name == "" {
		name = fmt.Sprintf("Snapshot %s", time.Now().Format("02/01 15:04"))
	}
	if tag == "" {
		tag = models.ProfileTagCustom
	}
	if color == "" {
		color = "cyan"
	}

	// 1. Capture Prepends from all routers
	prependsOverview, err := ps.trafficSvc.GetAllPrepends(false)
	var profilePrepends []models.ProfilePrependRule
	if err == nil && prependsOverview != nil {
		for _, dev := range prependsOverview {
			for _, grp := range dev.ASGroups {
				for _, pfx := range grp.Prefixes {
					profilePrepends = append(profilePrepends, models.ProfilePrependRule{
						DeviceID:     dev.DeviceID,
						RemoteAS:     grp.RemoteAS,
						GroupName:    grp.GroupName,
						Prefix:       pfx.Prefix,
						PrependCount: pfx.PrependCount,
						Block:        pfx.IsBlocked,
					})
				}
			}
		}
	}

	// 2. Capture Local-Preferences and Static Routes from Upload Overview
	uploadOverview, err := ps.trafficSvc.GetUploadOverview("all", false)
	var profileLocalPrefs []models.ProfileLocalPrefRule
	var profileRoutes []models.ProfileRouteRule
	if err == nil && uploadOverview != nil {
		for _, sec := range uploadOverview.Sections {
			if sec.LocalPref > 0 {
				profileLocalPrefs = append(profileLocalPrefs, models.ProfileLocalPrefRule{
					DeviceID:   sec.DeviceID,
					DeviceName: sec.DeviceName,
					RemoteAS:   sec.RemoteAS,
					PeerIP:     sec.PeerIP,
					PeerName:   sec.PeerName,
					LocalPref:  sec.LocalPref,
					PolicyName: sec.ImportPolicy,
					PolicyNode: sec.ImportPolicyNode,
				})
			}
			for _, r := range sec.StaticRoutes {
				profileRoutes = append(profileRoutes, models.ProfileRouteRule{
					DeviceID:    r.DeviceID,
					DeviceName:  r.DeviceName,
					Destination: r.Destination,
					NextHop:     r.NextHop,
					Preference:  r.Preference,
					Description: r.Description,
				})
			}
		}
		for _, r := range uploadOverview.OtherRoutes {
			profileRoutes = append(profileRoutes, models.ProfileRouteRule{
				DeviceID:    r.DeviceID,
				DeviceName:  r.DeviceName,
				Destination: r.Destination,
				NextHop:     r.NextHop,
				Preference:  r.Preference,
				Description: r.Description,
			})
		}
	}

	newProfile := models.TrafficProfile{
		ID:          fmt.Sprintf("prof-%d", time.Now().Unix()),
		Name:        name,
		Description: description,
		Tag:         tag,
		Color:       color,
		IsActive:    false,
		IsDefault:   false,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
		Prepends:    profilePrepends,
		LocalPrefs:  profileLocalPrefs,
		Routes:      profileRoutes,
	}

	if err := ps.profileStore.Save(&newProfile); err != nil {
		return nil, fmt.Errorf("falha ao salvar perfil capturado: %w", err)
	}

	return &newProfile, nil
}

// CalculateDiff compares the target profile against the current network state.
func (ps *ProfileService) CalculateDiff(target *models.TrafficProfile) (*models.ProfileDiffSummary, error) {
	diff := &models.ProfileDiffSummary{
		ProfileID:      target.ID,
		ProfileName:    target.Name,
		PrependsDiff:   []models.PrependDiff{},
		LocalPrefsDiff: []models.LocalPrefDiff{},
		RoutesDiff:     []models.RouteDiff{},
	}

	// 1. Diff Prepends
	currentPrepends, _ := ps.trafficSvc.GetAllPrepends(false)
	currentPrependMap := make(map[string]models.PrefixPrependState) // key: RemoteAS:Prefix or GroupName:Prefix
	if currentPrepends != nil {
		for _, dev := range currentPrepends {
			for _, grp := range dev.ASGroups {
				for _, pfx := range grp.Prefixes {
					key := fmt.Sprintf("%s:%s", grp.RemoteAS, pfx.Prefix)
					currentPrependMap[key] = pfx
				}
			}
		}
	}

	for _, rule := range target.Prepends {
		key := fmt.Sprintf("%s:%s", rule.RemoteAS, rule.Prefix)
		curr, exists := currentPrependMap[key]
		currCount := 0
		currBlock := false
		if exists {
			currCount = curr.PrependCount
			currBlock = curr.IsBlocked
		}
		changed := !exists || currCount != rule.PrependCount || currBlock != rule.Block
		if changed {
			diff.TotalChanges++
		}
		diff.PrependsDiff = append(diff.PrependsDiff, models.PrependDiff{
			DeviceID:     rule.DeviceID,
			GroupName:    rule.GroupName,
			RemoteAS:     rule.RemoteAS,
			Prefix:       rule.Prefix,
			CurrentCount: currCount,
			TargetCount:  rule.PrependCount,
			CurrentBlock: currBlock,
			TargetBlock:  rule.Block,
			Changed:      changed,
		})
	}

	// 2. Diff Local-Preferences
	uploadOverview, _ := ps.trafficSvc.GetUploadOverview("all", false)
	currentLocalPrefMap := make(map[string]int) // key: PeerIP
	if uploadOverview != nil {
		for _, sec := range uploadOverview.Sections {
			if sec.LocalPref > 0 {
				currentLocalPrefMap[sec.PeerIP] = sec.LocalPref
			}
		}
	}

	for _, rule := range target.LocalPrefs {
		currPref, exists := currentLocalPrefMap[rule.PeerIP]
		changed := !exists || currPref != rule.LocalPref
		if changed {
			diff.TotalChanges++
		}
		diff.LocalPrefsDiff = append(diff.LocalPrefsDiff, models.LocalPrefDiff{
			DeviceID:    rule.DeviceID,
			PeerIP:      rule.PeerIP,
			PeerName:    rule.PeerName,
			RemoteAS:    rule.RemoteAS,
			CurrentPref: currPref,
			TargetPref:  rule.LocalPref,
			Changed:     changed,
		})
	}

	// 3. Diff Static Routes
	currentRoutesMap := make(map[string]bool) // key: Destination:NextHop
	if uploadOverview != nil {
		for _, sec := range uploadOverview.Sections {
			for _, r := range sec.StaticRoutes {
				currentRoutesMap[fmt.Sprintf("%s:%s", r.Destination, r.NextHop)] = true
			}
		}
		for _, r := range uploadOverview.OtherRoutes {
			currentRoutesMap[fmt.Sprintf("%s:%s", r.Destination, r.NextHop)] = true
		}
	}

	for _, r := range target.Routes {
		key := fmt.Sprintf("%s:%s", r.Destination, r.NextHop)
		if !currentRoutesMap[key] {
			diff.TotalChanges++
			diff.RoutesDiff = append(diff.RoutesDiff, models.RouteDiff{
				DeviceID:    r.DeviceID,
				Destination: r.Destination,
				NextHop:     r.NextHop,
				Preference:  r.Preference,
				Action:      "ADD",
			})
		}
	}

	return diff, nil
}

// GenerateScripts prepares consolidated CLI commands per router without touching the equipment.
func (ps *ProfileService) GenerateScripts(target *models.TrafficProfile) (map[string]string, map[string][]string, error) {
	devices := ps.deviceStore.GetAll()
	scripts := make(map[string]string)
	commands := make(map[string][]string)

	for _, dev := range devices {
		var devCommands []string
		var scriptLines []string

		scriptLines = append(scriptLines, fmt.Sprintf("# =========================================================================="))
		scriptLines = append(scriptLines, fmt.Sprintf("# NetPulse TE - Script para Equipamento: %s (%s)", dev.Name, dev.Host))
		scriptLines = append(scriptLines, fmt.Sprintf("# Perfil Alvo: %s (%s)", target.Name, target.Tag))
		scriptLines = append(scriptLines, fmt.Sprintf("# Gerado em: %s (Modo Seguro - Zero Commits Automáticos)", time.Now().Format("02/01/2006 15:04:05")))
		scriptLines = append(scriptLines, fmt.Sprintf("# =========================================================================="))
		scriptLines = append(scriptLines, "")

		isHuawei := dev.Vendor == models.VendorHuawei
		isMikrotik := strings.HasPrefix(string(dev.Vendor), "mikrotik")

		if isHuawei {
			devCommands = append(devCommands, "system-view")
			scriptLines = append(scriptLines, "system-view")

			// 1. Local-Preference updates
			hasLocalPref := false
			for _, lp := range target.LocalPrefs {
				if lp.DeviceID == "" || lp.DeviceID == "all" || lp.DeviceID == dev.ID {
					if !hasLocalPref {
						scriptLines = append(scriptLines, "")
						scriptLines = append(scriptLines, "# --- [1] Ajustes de Local-Preference (Engenharia de Upload) ---")
						hasLocalPref = true
					}
					policyName := lp.PolicyName
					if policyName == "" {
						policyName = fmt.Sprintf("RP-IN-AS%s", lp.RemoteAS)
					}
					node := lp.PolicyNode
					if node == 0 {
						node = 11
					}
					c1 := fmt.Sprintf("route-policy %s permit node %d", policyName, node)
					c2 := fmt.Sprintf(" apply local-preference %d", lp.LocalPref)
					c3 := "return"
					c4 := fmt.Sprintf("refresh bgp %s import", lp.PeerIP)

					devCommands = append(devCommands, c1, c2, "commit", c3, c4)
					scriptLines = append(scriptLines, c1, c2, "commit", c3, c4)
				}
			}

			// 2. Prepend / Announcement adjustments
			hasPrepend := false
			for _, pr := range target.Prepends {
				if pr.DeviceID == "" || pr.DeviceID == "all" || pr.DeviceID == dev.ID {
					if !hasPrepend {
						scriptLines = append(scriptLines, "")
						scriptLines = append(scriptLines, "# --- [2] Ajustes de AS-Path Prepending & Comunidades (Download) ---")
						hasPrepend = true
					}
					desc := fmt.Sprintf("# Alvo: %s (AS%s) Prefix: %s -> %dP", pr.GroupName, pr.RemoteAS, pr.Prefix, pr.PrependCount)
					scriptLines = append(scriptLines, desc)

					// Build descriptive routing command
					commNode := fmt.Sprintf("# [Huawei Community Node] AS%s Prepend=%d Block=%t", pr.RemoteAS, pr.PrependCount, pr.Block)
					devCommands = append(devCommands, commNode)
					scriptLines = append(scriptLines, commNode)
				}
			}

			// 3. Static Routes
			hasRoutes := false
			for _, r := range target.Routes {
				if r.DeviceID == "" || r.DeviceID == "all" || r.DeviceID == dev.ID {
					if !hasRoutes {
						scriptLines = append(scriptLines, "")
						scriptLines = append(scriptLines, "# --- [3] Rotas Estáticas de Desvio de Upload ---")
						hasRoutes = true
					}
					pref := r.Preference
					if pref == 0 {
						pref = 60
					}
					cmd := fmt.Sprintf("ip route-static %s %s preference %d description %s", r.Destination, r.NextHop, pref, r.Description)
					devCommands = append(devCommands, cmd)
					scriptLines = append(scriptLines, cmd)
				}
			}

			scriptLines = append(scriptLines, "")
			scriptLines = append(scriptLines, "commit")
			scriptLines = append(scriptLines, "return")
			devCommands = append(devCommands, "commit", "return")

		} else if isMikrotik {
			scriptLines = append(scriptLines, "# --- [MikroTik RouterOS Script] ---")
			for _, r := range target.Routes {
				if r.DeviceID == "" || r.DeviceID == "all" || r.DeviceID == dev.ID {
					cmd := fmt.Sprintf("/ip route add dst-address=%s gateway=%s distance=%d comment=\"%s\"", r.Destination, r.NextHop, r.Preference, r.Description)
					devCommands = append(devCommands, cmd)
					scriptLines = append(scriptLines, cmd)
				}
			}
		}

		scripts[dev.ID] = strings.Join(scriptLines, "\n")
		commands[dev.ID] = devCommands
	}

	return scripts, commands, nil
}

// StageAndActivate marks the profile active, generates the scripts and records in the audit trail without touching routers.
func (ps *ProfileService) StageAndActivate(profileID string, auditStore storage.IAuditStore, userName, userEmail, clientIP string) (*models.ApplyProfileResult, error) {
	profile, err := ps.profileStore.GetByID(profileID)
	if err != nil {
		return nil, err
	}

	diff, err := ps.CalculateDiff(profile)
	if err != nil {
		return nil, fmt.Errorf("erro ao calcular diff do perfil: %w", err)
	}

	scripts, commands, err := ps.GenerateScripts(profile)
	if err != nil {
		return nil, fmt.Errorf("erro ao gerar scripts CLI: %w", err)
	}

	// Mark active in store
	if err := ps.profileStore.SetActive(profileID); err != nil {
		return nil, fmt.Errorf("erro ao atualizar perfil ativo: %w", err)
	}

	// Audit trail record (Safe Mode: commands staged for operator execution)
	if auditStore != nil {
		auditLog := models.AuditLog{
			TenantID:        "default",
			Timestamp:       time.Now(),
			UserID:          "usr-active",
			UserName:        userName,
			UserEmail:       userEmail,
			ClientIP:        clientIP,
			Action:          "APPLY_TRAFFIC_PROFILE",
			TargetDeviceID:  "all",
			CommandExecuted: fmt.Sprintf("Perfil '%s' (%s) selecionado. %d alterações preparadas em modo manual seguro.", profile.Name, profile.Tag, diff.TotalChanges),
			Status:          "MANUAL_DISPATCH",
			Metadata: map[string]any{
				"profile_id":    profile.ID,
				"profile_name":  profile.Name,
				"total_changes": diff.TotalChanges,
			},
		}
		_ = auditStore.Record(&auditLog)
	}

	return &models.ApplyProfileResult{
		ProfileID:        profile.ID,
		ProfileName:      profile.Name,
		Status:           "MANUAL_DISPATCH",
		Executed:         false, // NEVER auto-executed on routers, honoring safe-mode rule
		Message:          fmt.Sprintf("Perfil '%s' ativado com sucesso! Foram gerados os scripts seguros para cada roteador.", profile.Name),
		DiffSummary:      diff,
		ScriptsByDevice:  scripts,
		CommandsByDevice: commands,
	}, nil
}
