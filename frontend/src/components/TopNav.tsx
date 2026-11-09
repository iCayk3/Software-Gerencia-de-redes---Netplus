import React from 'react'
import {
  Download,
  Upload,
  Activity,
  Network,
  Server,
  Terminal,
  Radio,
  Bell,
  Wifi,
  Globe,
  Menu,
  ShieldCheck,
  Search,
  Building2,
  Users,
  Layers,
  KeyRound,
  UserCog,
  MapPin,
} from 'lucide-react'
import type { MainSectionType } from './Sidebar'
import type { HealthResponse } from '../services/api'
import { useAuth } from '../context/AuthContext'

export interface SubTabItem {
  id: string
  label: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
}

interface TopNavProps {
  activeSection: MainSectionType
  activeSubTab: string
  onSelectSubTab: (subTabId: string) => void
  activeAlertsCount?: number
  health?: HealthResponse | null
  onOpenMobileSidebar: () => void
  onOpenAlerts: () => void
  onOpenSearch: () => void
  onOpenProfile?: () => void
  density?: 'comfortable' | 'compact'
  onToggleDensity?: () => void
}

export const TopNav: React.FC<TopNavProps> = ({
  activeSection,
  activeSubTab,
  onSelectSubTab,
  activeAlertsCount = 0,
  onOpenMobileSidebar,
  onOpenAlerts,
  onOpenSearch,
  onOpenProfile,
}) => {
  const { user } = useAuth()

  // Configuração das sub-abas dinâmicas de cada seção
  const sectionSubTabs: Record<MainSectionType, { title: string; subtitle: string; tabs: SubTabItem[] }> = {
    bgp: {
      title: 'Protocolo BGP & Engenharia de Tráfego',
      subtitle: 'Controle de entrada e saída por AS, prepends de download, local-pref, sessões BMP, churn e RPKI',
      tabs: [
        { id: 'download', label: 'Download (AS-Path Prepending)', icon: Download },
        { id: 'upload', label: 'Upload (Local-Preference & Rotas)', icon: Upload },
        { id: 'sessions', label: 'Sessões BGP & BMP', icon: Activity },
        { id: 'churn', label: 'Estabilidade & Churn', icon: Activity },
        { id: 'rpki', label: 'Validador RPKI (ROA)', icon: ShieldCheck },
      ],
    },
    ospf: {
      title: 'Protocolo OSPF & Topologia de Rede Interna',
      subtitle: 'Inspeção de vizinhos OSPF, estados de adjacência, áreas de roteamento e comandos de diagnóstico CLI',
      tabs: [
        { id: 'neighbors', label: 'Vizinhos & Adjacências', icon: Network },
        { id: 'areas', label: 'Áreas & Topologia', icon: Layers },
        { id: 'diagnostics', label: 'Comandos & Diagnósticos CLI', icon: Terminal },
      ],
    },
    traffic: {
      title: 'Protocolo BGP & Engenharia de Tráfego',
      subtitle: 'Controle de entrada e saída por AS, prepends de download, local-pref, sessões BMP, churn e RPKI',
      tabs: [
        { id: 'download', label: 'Download (AS-Path Prepending)', icon: Download },
        { id: 'upload', label: 'Upload (Local-Preference & Rotas)', icon: Upload },
        { id: 'sessions', label: 'Sessões BGP & BMP', icon: Activity },
        { id: 'churn', label: 'Estabilidade & Churn', icon: Activity },
        { id: 'rpki', label: 'Validador RPKI (ROA)', icon: ShieldCheck },
      ],
    },
    devices: {
      title: 'Equipamentos & Infraestrutura de Rede',
      subtitle: 'Gerenciamento de roteadores, switches, credenciais SSH, bordas BGP e terminal remoto',
      tabs: [
        { id: 'inventory', label: 'Inventário de Equipamentos', icon: Server },
        { id: 'map', label: 'Mapa do Backbone', icon: MapPin },
        { id: 'terminal', label: 'Terminal SSH Interativo', icon: Terminal },
      ],
    },
    map: {
      title: 'Mapa Geográfico do Backbone',
      subtitle: 'Visualização e geolocalização de roteadores BGP, PEs, Switches e OLTs ópticas',
      tabs: [
        { id: 'map', label: 'Mapa do Backbone', icon: MapPin },
        { id: 'inventory', label: 'Inventário de Equipamentos', icon: Server },
        { id: 'terminal', label: 'Terminal SSH Interativo', icon: Terminal },
      ],
    },
    telemetry: {
      title: 'NOC & Telemetria em Tempo Real',
      subtitle: 'Visão geral do NOC, métricas de ciclo de coleta, integridade de roteadores e alertas Syslog',
      tabs: [
        { id: 'overview', label: 'Visão Geral NOC', icon: Radio },
        { id: 'alerts', label: 'Central de Alertas & Syslog', icon: Bell, badge: activeAlertsCount },
      ],
    },
    diagnostics: {
      title: 'Ferramentas de Diagnóstico de Rede',
      subtitle: 'Testes de conectividade ICMP/TCP, mapeamento de portas e resolução de nomes DNS',
      tabs: [
        { id: 'ping', label: 'Ping & Latência', icon: Activity },
        { id: 'interfaces', label: 'Interfaces de Rede', icon: Wifi },
        { id: 'ports', label: 'Scanner de Portas', icon: Server },
        { id: 'dns', label: 'Consulta DNS', icon: Globe },
      ],
    },
    audit: {
      title: 'Trilha de Auditoria Imutável (Audit Trail)',
      subtitle: 'Histórico de quem executou, quando, IP de origem, dispositivo afetado e comandos emitidos',
      tabs: [
        { id: 'logs', label: 'Trilha de Auditoria', icon: ShieldCheck },
      ],
    },
    tenants: {
      title: 'Configurações da Empresa & Rede',
      subtitle: 'Definição dos parâmetros oficiais da sua organização: ASN oficial, dados cadastrais e parâmetros BGP para gerência pelo Servidor Master',
      tabs: [
        { id: 'list', label: 'Dados da Empresa & ASN', icon: Building2 },
      ],
    },
    users: {
      title: 'Gestão de Usuários & Controle de Acesso (RBAC)',
      subtitle: 'Gerenciamento de credenciais, níveis de permissão e vinculação de operadores às suas empresas',
      tabs: [
        { id: 'list', label: 'Usuários Cadastrados', icon: Users },
      ],
    },
    license: {
      title: 'Licença & Servidor Master Central',
      subtitle: 'Informações do plano contratado, capacidade de roteadores e sincronização com o master',
      tabs: [
        { id: 'overview', label: 'Status da Licença', icon: KeyRound },
      ],
    },
  }

  const currentSectionConfig = sectionSubTabs[activeSection] || sectionSubTabs.bgp

  return (
    <header className="border-b border-[#242836] bg-[#13151D]/95 backdrop-blur sticky top-0 z-20">
      <div className="px-4 sm:px-6 lg:px-8">
        {/* Top Meta Bar */}
        <div className="flex items-center justify-between h-14 border-b border-[#242836]/60 gap-4">
          <div className="flex items-center gap-3">
            {/* Mobile Sidebar Hamburger Toggle */}
            <button
              onClick={onOpenMobileSidebar}
              className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white rounded-lg hover:bg-[#1C202C]"
              title="Abrir Menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div>
              <h1 className="text-sm sm:text-base font-bold text-slate-100 flex items-center gap-2">
                <span>{currentSectionConfig.title}</span>
              </h1>
            </div>
          </div>

          {/* Right Status Controls */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Quick Search Ctrl + K */}
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1C202C] hover:bg-[#252A3A] text-slate-300 hover:text-white border border-[#2D3345] text-xs transition shadow-xs cursor-pointer"
              title="Buscar equipamento, AS, link ou ferramenta (Ctrl + K)"
            >
              <Search className="h-3.5 w-3.5 text-[#4A72B2]" />
              <span className="hidden md:inline text-slate-400 text-[11px]">Buscar...</span>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.2 text-[10px] font-mono text-slate-400 bg-[#13151D] rounded border border-[#2D3345]">
                Ctrl K
              </kbd>
            </button>

            {/* Active Alerts Pill Button */}
            {activeAlertsCount > 0 && (
              <button
                onClick={onOpenAlerts}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs font-semibold hover:bg-rose-500/25 transition cursor-pointer shadow-sm animate-pulse"
              >
                <Bell className="h-3.5 w-3.5 text-rose-400" />
                <span>{activeAlertsCount} Alerta{activeAlertsCount > 1 ? 's' : ''}</span>
              </button>
            )}

            {/* User Profile & Preferences */}
            {onOpenProfile && (
              <button
                onClick={onOpenProfile}
                className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1C202C] hover:bg-[#252A3A] text-slate-300 hover:text-white border border-[#2D3345] text-xs transition shadow-xs cursor-pointer"
                title="Configurações e Perfil do Usuário"
              >
                <UserCog className="h-3.5 w-3.5 text-[#4A72B2]" />
                <span className="hidden sm:inline text-slate-200 text-xs font-medium">
                  {user?.name || 'Perfil'}
                </span>
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Sub-Tabs Navigation Strip */}
        <div className="flex items-center space-x-1 sm:space-x-1.5 py-2 overflow-x-auto no-scrollbar">
          {currentSectionConfig.tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeSubTab === tab.id
            const hasBadge = tab.badge !== undefined && tab.badge > 0

            return (
              <button
                key={tab.id}
                onClick={() => onSelectSubTab(tab.id)}
                className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all duration-150 whitespace-nowrap cursor-pointer relative ${
                  isActive
                    ? 'bg-[#25334D] text-[#E2E5EC] border border-[#3B5B8C]/40 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#1C202C] border border-transparent'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-[#93B4E6]' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
                {hasBadge && (
                  <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-rose-500 text-white animate-pulse">
                    {tab.badge}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      </div>
    </header>
  )
}
