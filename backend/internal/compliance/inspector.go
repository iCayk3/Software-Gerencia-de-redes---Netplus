package compliance

import (
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"network-software/internal/models"
)

// RouterCommandRunner defines the minimal interface needed by the Compliance Inspector
// to interact with a physical or simulated router.
type RouterCommandRunner interface {
	RunCommand(cmd string) (string, error)
	TestConnection() (models.SSHTestResult, error)
}

// Inspector executes deep configuration audits on routers to verify readiness
// for NetPulse Traffic Engineering and Automation.
type Inspector struct{}

// NewInspector creates a new configuration compliance inspector.
func NewInspector() *Inspector {
	return &Inspector{}
}

// AuditDevice connects and verifies whether a device complies with NetPulse 3-tier
// Traffic Engineering architecture and management standards.
func (ins *Inspector) AuditDevice(dev *models.Device, runner RouterCommandRunner) (*models.DeviceComplianceAudit, error) {
	now := time.Now()
	audit := &models.DeviceComplianceAudit{
		DeviceID:      dev.ID,
		DeviceName:    dev.Name,
		Vendor:        dev.Vendor,
		Host:          dev.Host,
		AuditedAt:     now,
		Items:         make([]models.ComplianceCheckItem, 0),
		OverallStatus: models.CompliancePassed,
	}

	// 1. Check SSH Connectivity & Privilege
	testResult, err := runner.TestConnection()
	if err != nil || !testResult.Success {
		errMsg := "Falha de conexão SSH: equipamento inacessível ou credenciais rejeitadas"
		if testResult.Error != "" {
			errMsg = testResult.Error
		}
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-ssh-conn",
			Category:    "connectivity",
			Title:       "Conectividade SSH & Terminal",
			Description: "Validação de handshake SSH, credenciais criptografadas e resposta de terminal.",
			Status:      models.ComplianceFailed,
			Message:     errMsg,
			Remediation: "Verifique conectividade IP (ping), porta de gerência (padrão 22 ou 2210), credenciais de acesso e regras de firewall/ACL.",
		})

		audit.OverallStatus = models.ComplianceFailed
		audit.OverallScore = 0
		audit.IsManageable = false
		audit.Summary = fmt.Sprintf("Equipamento %s (%s) está inacessível via SSH. Não é possível gerenciar ou coletar configurações.", dev.Name, dev.Host)
		return audit, nil
	}

	audit.Items = append(audit.Items, models.ComplianceCheckItem{
		ID:          "chk-ssh-conn",
		Category:    "connectivity",
		Title:       "Conectividade SSH & Terminal",
		Description: "Validação de handshake SSH, credenciais criptografadas e resposta de terminal.",
		Status:      models.CompliancePassed,
		Message:     fmt.Sprintf("Conexão SSH ativa (latência: %.1fms). Banner: %s", testResult.LatencyMs, testResult.Banner),
		FoundValue:  fmt.Sprintf("%.1fms", testResult.LatencyMs),
	})

	// 2. Vendor-Specific Configuration Inspection
	switch dev.Vendor {
	case models.VendorHuawei:
		ins.inspectHuawei(audit, runner)
	case models.VendorMikrotikV7:
		ins.inspectMikrotikV7(audit, runner)
	case models.VendorMikrotikV6:
		ins.inspectMikrotikV6(audit, runner)
	case models.VendorDatacom:
		ins.inspectDatacom(audit, runner)
	default:
		ins.inspectGeneric(audit, runner)
	}

	// 3. Compute Overall Score and Manageability
	score := 0
	hasFailed := false
	hasWarning := false

	for _, item := range audit.Items {
		switch item.Status {
		case models.CompliancePassed:
			score += 25
		case models.ComplianceWarning:
			score += 10
			hasWarning = true
		case models.ComplianceFailed:
			hasFailed = true
		}
	}

	// Normalize score to 100 max
	if score > 100 {
		score = 100
	}
	audit.OverallScore = score

	if hasFailed {
		audit.OverallStatus = models.ComplianceFailed
		audit.IsManageable = false
		audit.Summary = "O equipamento possui falhas críticas de configuração que impedem a gerência automatizada pelo NetPulse."
	} else if hasWarning || !audit.HasOriginTagging {
		audit.OverallStatus = models.ComplianceWarning
		audit.IsManageable = false // Requires pre-defined standard policies to be safe for commits
		audit.Summary = "Equipamento online com BGP ativo, porém faltam políticas de Engenharia de Tráfego padrão NetPulse (RP-TAG-ORIGIN). Aplique o script de adequação."
	} else {
		audit.OverallStatus = models.CompliancePassed
		audit.IsManageable = true
		audit.Summary = "Equipamento 100% em conformidade com o padrão pré-definido. Pronto para gerência de tráfego, prepends e telemetria."
	}

	return audit, nil
}

// ==============================================================================
// Huawei Inspection (VRP - NE8000 / NE40 / S6730)
// ==============================================================================

func (ins *Inspector) inspectHuawei(audit *models.DeviceComplianceAudit, runner RouterCommandRunner) {
	bgpCfg, _ := runner.RunCommand("display current-configuration configuration bgp")
	tagPol, _ := runner.RunCommand("display route-policy RP-TAG-V4-ORIGIN")
	prefixCfg, _ := runner.RunCommand("display ip ip-prefix")
	if prefixCfg == "" {
		prefixCfg, _ = runner.RunCommand("display current-configuration configuration ip-prefix")
	}
	syslogCfg, _ := runner.RunCommand("display current-configuration | include info-center")

	// 1. BGP Process & ASN
	asnRe := regexp.MustCompile(`(?m)^bgp\s+(\d+)`)
	asnMatch := asnRe.FindStringSubmatch(bgpCfg)
	ridRe := regexp.MustCompile(`(?m)router-id\s+([0-9\.]+)`)
	ridMatch := ridRe.FindStringSubmatch(bgpCfg)

	if len(asnMatch) > 1 {
		audit.LocalASN = asnMatch[1]
		if len(ridMatch) > 1 {
			audit.RouterID = ridMatch[1]
		}
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-bgp-process",
			Category:    "bgp_core",
			Title:       "Processo BGP & AS Local",
			Description: "Identificação do processo de roteamento BGP ativo e Autonomous System Number (ASN).",
			Status:      models.CompliancePassed,
			Message:     fmt.Sprintf("Processo BGP ativo com AS %s (Router-ID: %s)", audit.LocalASN, audit.RouterID),
			FoundValue:  fmt.Sprintf("AS %s", audit.LocalASN),
		})
	} else {
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-bgp-process",
			Category:    "bgp_core",
			Title:       "Processo BGP & AS Local",
			Description: "Identificação do processo de roteamento BGP ativo e Autonomous System Number (ASN).",
			Status:      models.ComplianceFailed,
			Message:     "Nenhum bloco 'bgp <ASN>' localizado na configuração ativa.",
			Remediation: "Habilite o BGP com 'system-view' e 'bgp <seu_asn>'.",
		})
		return
	}

	// 2. BGP Peers & Sessions
	peerRe := regexp.MustCompile(`(?m)peer\s+([0-9\.]+)\s+as-number\s+(\d+)`)
	peerMatches := peerRe.FindAllStringSubmatch(bgpCfg, -1)
	audit.TotalSessions = len(peerMatches)

	// Count export policies
	exportPolRe := regexp.MustCompile(`(?m)peer\s+[0-9\.]+\s+route-policy\s+(\S+)\s+export`)
	exportMatches := exportPolRe.FindAllStringSubmatch(bgpCfg, -1)
	if len(exportMatches) > 0 {
		audit.HasExportPolicy = true
	}

	if audit.TotalSessions > 0 {
		audit.ActiveSessions = audit.TotalSessions
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-bgp-peers",
			Category:    "bgp_core",
			Title:       "Sessões BGP com Upstreams / PTTs",
			Description: "Verificação de peers BGP externos e internos configurados na tabela do roteador.",
			Status:      models.CompliancePassed,
			Message:     fmt.Sprintf("%d peer(s) BGP configurado(s) no bloco BGP.", audit.TotalSessions),
			FoundValue:  fmt.Sprintf("%d peers", audit.TotalSessions),
		})
	} else {
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-bgp-peers",
			Category:    "bgp_core",
			Title:       "Sessões BGP com Upstreams / PTTs",
			Description: "Verificação de peers BGP externos e internos configurados na tabela do roteador.",
			Status:      models.ComplianceWarning,
			Message:     "Nenhum peer BGP configurado no roteador.",
			Remediation: "Configure vizinhanças BGP com 'peer <IP> as-number <ASN>'.",
		})
	}

	// 3. Pre-defined 3-Tier Origin Tagging Policy (Camada 1)
	if strings.Contains(tagPol, "RP-TAG-V4-ORIGIN") {
		audit.HasOriginTagging = true
		hasCommunity := strings.Contains(tagPol, "apply community")
		msg := "Política pré-definida RP-TAG-V4-ORIGIN detectada."
		if hasCommunity {
			msg += " Nós possuem regras de apply community ativas."
		}

		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-origin-policy",
			Category:    "traffic_engineering",
			Title:       "Padrão Pré-Definido NetPulse (RP-TAG-V4-ORIGIN)",
			Description: "Arquitetura em 3 camadas de tagging de origem que permite prepends com zero flap BGP.",
			Status:      models.CompliancePassed,
			Message:     msg,
			FoundValue:  "Presente",
		})
	} else {
		audit.HasOriginTagging = false
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-origin-policy",
			Category:    "traffic_engineering",
			Title:       "Padrão Pré-Definido NetPulse (RP-TAG-V4-ORIGIN)",
			Description: "Arquitetura em 3 camadas de tagging de origem que permite prepends com zero flap BGP.",
			Status:      models.ComplianceWarning,
			Message:     "Política 'RP-TAG-V4-ORIGIN' ausente. Engenharia de tráfego automatizada desabilitada até adequação.",
			Remediation: "Crie a route-policy RP-TAG-V4-ORIGIN e vincule aos seus blocos anunciados.",
		})
	}

	// 4. Telemetry Configuration (Syslog UDP 1514)
	if strings.Contains(syslogCfg, "1514") || strings.Contains(syslogCfg, "loghost") {
		audit.HasTelemetry = true
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-telemetry",
			Category:    "telemetry",
			Title:       "Telemetria Contínua (Syslog / BMP)",
			Description: "Encaminhamento em tempo real de traps e eventos de queda de sessão BGP para o NetPulse.",
			Status:      models.CompliancePassed,
			Message:     "Info-center configurado com loghost remoto para telemetria.",
			FoundValue:  "Ativo",
		})
	} else {
		audit.HasTelemetry = false
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-telemetry",
			Category:    "telemetry",
			Title:       "Telemetria Contínua (Syslog / BMP)",
			Description: "Encaminhamento em tempo real de traps e eventos de queda de sessão BGP para o NetPulse.",
			Status:      models.ComplianceWarning,
			Message:     "Syslog remoto para porta 1514 do NetPulse não detectado.",
			Remediation: "Configure 'info-center loghost <IP_DO_NETPULSE> facility local7' para alertas instantâneos.",
		})
	}

	// Generate Remediation Script if not compliant
	if !audit.HasOriginTagging {
		asn := audit.LocalASN
		if asn == "" {
			asn = "SEU_ASN"
		}
		audit.RemediationScript = fmt.Sprintf(`# ==============================================================================
# SCRIPT DE ADEQUAÇÃO AO PADRÃO NETPULSE - HUAWEI VRP
# Compatível com NE8000, NE40, S6730
# ==============================================================================
system-view

# 1. Definir Prefix-Lists dos seus Blocos Próprios (exemplo: /22 e /24)
# Substitua pelo seu bloco IP real anunciado:
ip ip-prefix EXACT-V4-ORIGIN index 10 permit 0.0.0.0 0 less-equal 32

# 2. Camada 1: Política de Origem com Tags Iniciais (RP-TAG-V4-ORIGIN)
route-policy RP-TAG-V4-ORIGIN permit node 10
 if-match ip-prefix EXACT-V4-ORIGIN
 apply community %s:1000 1:20030 1:40000 additive
#
# 3. Associar no Processo BGP
bgp %s
 ipv4-family unicast
  # Aplique o route-policy no seu anúncio de rede:
  # network <SEU_BLOCO_IP> <MASCARA> route-policy RP-TAG-V4-ORIGIN
#
commit
return

# 4. Atualizar anúncios sem flap via Route-Refresh (RFC 2918)
refresh bgp all export
`, asn, asn)
	}
}

// ==============================================================================
// MikroTik RouterOS v7 Inspection
// ==============================================================================

func (ins *Inspector) inspectMikrotikV7(audit *models.DeviceComplianceAudit, runner RouterCommandRunner) {
	bgpConns, _ := runner.RunCommand("/routing/bgp/connection/print detail")
	filterRules, _ := runner.RunCommand("/routing/filter/rule/print detail")

	// 1. Processo & ASN
	asRe := regexp.MustCompile(`local\.as=(\d+)`)
	asMatch := asRe.FindStringSubmatch(bgpConns)
	if len(asMatch) > 1 {
		audit.LocalASN = asMatch[1]
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-bgp-process",
			Category:    "bgp_core",
			Title:       "Processo BGP & AS Local (RouterOS v7)",
			Description: "Instância e conexões BGP ativas no MikroTik RouterOS v7.",
			Status:      models.CompliancePassed,
			Message:     fmt.Sprintf("BGP RouterOS v7 ativo com AS local %s", audit.LocalASN),
			FoundValue:  fmt.Sprintf("AS %s", audit.LocalASN),
		})
	} else {
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-bgp-process",
			Category:    "bgp_core",
			Title:       "Processo BGP & AS Local (RouterOS v7)",
			Description: "Instância e conexões BGP ativas no MikroTik RouterOS v7.",
			Status:      models.ComplianceFailed,
			Message:     "Nenhuma conexão BGP com local.as configurada em /routing/bgp/connection.",
			Remediation: "Adicione sua conexão BGP com /routing/bgp/connection/add local.as=<ASN>.",
		})
		return
	}

	// 2. Peers / Connections
	nameRe := regexp.MustCompile(`name="([^"]+)"`)
	names := nameRe.FindAllStringSubmatch(bgpConns, -1)
	audit.TotalSessions = len(names)
	if audit.TotalSessions > 0 {
		audit.ActiveSessions = audit.TotalSessions
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-bgp-peers",
			Category:    "bgp_core",
			Title:       "Conexões BGP (Peers)",
			Description: "Sessões BGP com trânsitos IP e IXs.",
			Status:      models.CompliancePassed,
			Message:     fmt.Sprintf("%d conexão(ões) BGP cadastrada(s).", audit.TotalSessions),
			FoundValue:  strconv.Itoa(audit.TotalSessions),
		})
	}

	// 3. Origin Tagging Filter
	if strings.Contains(filterRules, "bgp-origin-tag") {
		audit.HasOriginTagging = true
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-origin-policy",
			Category:    "traffic_engineering",
			Title:       "Filtro de Origem NetPulse (bgp-origin-tag)",
			Description: "Filtro de tagging de comunidades de origem no RouterOS v7.",
			Status:      models.CompliancePassed,
			Message:     "Chain 'bgp-origin-tag' localizada em /routing/filter/rule.",
			FoundValue:  "Presente",
		})
	} else {
		audit.HasOriginTagging = false
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-origin-policy",
			Category:    "traffic_engineering",
			Title:       "Filtro de Origem NetPulse (bgp-origin-tag)",
			Description: "Filtro de tagging de comunidades de origem no RouterOS v7.",
			Status:      models.ComplianceWarning,
			Message:     "Chain 'bgp-origin-tag' ausente. Aplique a regra para permitir engenharia de tráfego.",
			Remediation: "Crie a chain de filtro em /routing/filter/rule.",
		})

		audit.RemediationScript = fmt.Sprintf(`# ==============================================================================
# SCRIPT DE ADEQUAÇÃO AO PADRÃO NETPULSE - MIKROTIK ROUTEROS V7
# ==============================================================================
/routing/filter/rule/add chain=bgp-origin-tag rule="if (dst in 0.0.0.0/0) { bgp-communities.add %s:1000; bgp-communities.add 1:20030; accept; }"
`, audit.LocalASN)
	}
}

// ==============================================================================
// MikroTik RouterOS v6 Inspection
// ==============================================================================

func (ins *Inspector) inspectMikrotikV6(audit *models.DeviceComplianceAudit, runner RouterCommandRunner) {
	bgpInstance, _ := runner.RunCommand("/routing bgp instance print detail")
	filters, _ := runner.RunCommand("/routing filter print detail")

	asRe := regexp.MustCompile(`as=(\d+)`)
	asMatch := asRe.FindStringSubmatch(bgpInstance)
	if len(asMatch) > 1 {
		audit.LocalASN = asMatch[1]
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-bgp-process",
			Category:    "bgp_core",
			Title:       "Instância BGP & AS Local (RouterOS v6)",
			Description: "Instância de BGP default no MikroTik RouterOS v6.",
			Status:      models.CompliancePassed,
			Message:     fmt.Sprintf("Instância BGP ativa com AS %s", audit.LocalASN),
			FoundValue:  fmt.Sprintf("AS %s", audit.LocalASN),
		})
	} else {
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-bgp-process",
			Category:    "bgp_core",
			Title:       "Instância BGP & AS Local (RouterOS v6)",
			Description: "Instância de BGP default no MikroTik RouterOS v6.",
			Status:      models.ComplianceFailed,
			Message:     "Nenhuma instância BGP configurada.",
			Remediation: "Configure a instância com /routing bgp instance set default as=<ASN>.",
		})
		return
	}

	if strings.Contains(filters, "bgp-origin-tag") {
		audit.HasOriginTagging = true
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-origin-policy",
			Category:    "traffic_engineering",
			Title:       "Filtro de Origem NetPulse (bgp-origin-tag)",
			Description: "Chain de filtros de comunidades no RouterOS v6.",
			Status:      models.CompliancePassed,
			Message:     "Chain 'bgp-origin-tag' localizada em /routing filter.",
			FoundValue:  "Presente",
		})
	} else {
		audit.HasOriginTagging = false
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-origin-policy",
			Category:    "traffic_engineering",
			Title:       "Filtro de Origem NetPulse (bgp-origin-tag)",
			Description: "Chain de filtros de comunidades no RouterOS v6.",
			Status:      models.ComplianceWarning,
			Message:     "Chain 'bgp-origin-tag' ausente.",
			Remediation: "Crie a regra de filtro /routing filter add chain=bgp-origin-tag.",
		})

		audit.RemediationScript = fmt.Sprintf(`# ==============================================================================
# SCRIPT DE ADEQUAÇÃO AO PADRÃO NETPULSE - MIKROTIK ROUTEROS V6
# ==============================================================================
/routing filter add chain=bgp-origin-tag set-bgp-communities=%s:1000,1:20030 action=accept
`, audit.LocalASN)
	}
}

// ==============================================================================
// Datacom Inspection (DmOS)
// ==============================================================================

func (ins *Inspector) inspectDatacom(audit *models.DeviceComplianceAudit, runner RouterCommandRunner) {
	bgpCfg, _ := runner.RunCommand("show running-config router bgp")
	routeMapCfg, _ := runner.RunCommand("show running-config route-map")

	asnRe := regexp.MustCompile(`router\s+bgp\s+(\d+)`)
	asnMatch := asnRe.FindStringSubmatch(bgpCfg)
	if len(asnMatch) > 1 {
		audit.LocalASN = asnMatch[1]
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-bgp-process",
			Category:    "bgp_core",
			Title:       "Processo BGP & AS Local (Datacom DmOS)",
			Description: "Processo router bgp ativo no Datacom DmOS.",
			Status:      models.CompliancePassed,
			Message:     fmt.Sprintf("Processo BGP ativo com AS %s", audit.LocalASN),
			FoundValue:  fmt.Sprintf("AS %s", audit.LocalASN),
		})
	} else {
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-bgp-process",
			Category:    "bgp_core",
			Title:       "Processo BGP & AS Local (Datacom DmOS)",
			Description: "Processo router bgp ativo no Datacom DmOS.",
			Status:      models.ComplianceFailed,
			Message:     "Processo BGP não encontrado no Datacom.",
			Remediation: "Habilite com 'router bgp <ASN>'.",
		})
		return
	}

	if strings.Contains(routeMapCfg, "RP-TAG-ORIGIN") || strings.Contains(routeMapCfg, "TAG-ORIGIN") {
		audit.HasOriginTagging = true
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-origin-policy",
			Category:    "traffic_engineering",
			Title:       "Route-Map de Origem NetPulse (Datacom DmOS)",
			Description: "Route-map de comunidades para controle de tráfego.",
			Status:      models.CompliancePassed,
			Message:     "Route-map de origem detectado.",
			FoundValue:  "Presente",
		})
	} else {
		audit.HasOriginTagging = false
		audit.Items = append(audit.Items, models.ComplianceCheckItem{
			ID:          "chk-origin-policy",
			Category:    "traffic_engineering",
			Title:       "Route-Map de Origem NetPulse (Datacom DmOS)",
			Description: "Route-map de comunidades para controle de tráfego.",
			Status:      models.ComplianceWarning,
			Message:     "Route-map de origem ausente.",
			Remediation: "Crie o route-map RP-TAG-ORIGIN no DmOS.",
		})
	}
}

func (ins *Inspector) inspectGeneric(audit *models.DeviceComplianceAudit, runner RouterCommandRunner) {
	audit.Items = append(audit.Items, models.ComplianceCheckItem{
		ID:          "chk-vendor-support",
		Category:    "connectivity",
		Title:       "Compatibilidade de Fabricante",
		Description: "Validação de suporte específico de driver de rede.",
		Status:      models.ComplianceWarning,
		Message:     fmt.Sprintf("Fabricante '%s' não possui perfil de inspeção especializado.", audit.Vendor),
	})
}
