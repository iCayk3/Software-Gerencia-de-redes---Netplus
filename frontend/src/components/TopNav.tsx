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
  Cpu,
  Wifi,
  Globe,
  Menu,
  ShieldCheck,
  Search,
  SlidersHorizontal
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
  health: HealthResponse | null
  onOpenMobileSidebar: () => void
  onOpenAlerts: () => void
  onOpenSearch: () => void
  density: 'comfortable' | 'compact'
  onToggleDensity: () => void
}

export const TopNav: React.FC<TopNavProps> = ({
  activeSection,
  activeSubTab,
  onSelectSubTab,
  activeAlertsCount = 0,
  health,
  onOpenMobileSidebar,
  onOpenAlerts,
  onOpenSearch,
  density,
  onToggleDensity,
}) => {
  const { user } = useAuth()

  // Configuração das sub-abas dinâmicas de cada seção
  const sectionSubTabs: Record<MainSectionType, { title: string; subtitle: string; tabs: SubTabItem[] }> = {
    traffic: {
      title: 'Engenharia de Tráfego BGP & Roteamento',
      subtitle: 'Controle de entrada e saída por AS, prepends de download, local-pref e inspeção BGP/OSPF',
      tabs: [
        { id: 'download', label: 'Download (AS-Path Prepending)', icon: Download },
        { id: 'upload', label: 'Upload (Local-Preference & Rotas)', icon: Upload },
        { id: 'bgp', label: 'Sessões BGP', icon: Activity },
        { id: 'ospf', label: 'Vizinhos OSPF', icon: Network },
      ],
    },
    devices: {
      title: 'Equipamentos & Infraestrutura de Rede',
      subtitle: 'Gerenciamento de roteadores, switches, credenciais SSH, bordas BGP e terminal remoto',
      tabs: [
        { id: 'inventory', label: 'Inventário de Equipamentos', icon: Server },
        { id: 'terminal', label: 'Terminal SSH Interativo', icon: Terminal },
      ],
    },
    telemetry: {
      title: 'NOC & Telemetria em Tempo Real',
      subtitle: 'Monitoramento BMP, ranking de churn BGP, validação RPKI e detecção de anomalias',
      tabs: [
        { id: 'overview', label: 'Visão Geral NOC', icon: Radio },
        { id: 'churn', label: 'Ranking BGP Churn', icon: Activity },
        { id: 'rpki', label: 'Segurança RPKI (ROA)', icon: ShieldCheck },
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
  }

  const currentSectionConfig = sectionSubTabs[activeSection] || sectionSubTabs.traffic

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-20">
      <div className="px-4 sm:px-6 lg:px-8">
        {/* Top Meta Bar */}
        <div className="flex items-center justify-between h-14 border-b border-slate-800/60 gap-4">
          <div className="flex items-center gap-3">
            {/* Mobile Sidebar Hamburger Toggle */}
            <button
              onClick={onOpenMobileSidebar}
              className="md:hidden p-2 -ml-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800"
              title="Abrir Menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div>
              <h1 className="text-sm sm:text-base font-bold text-white flex items-center gap-2">
                <span>{currentSectionConfig.title}</span>
              </h1>
            </div>
          </div>

          {/* Right Status Controls */}
          <div className="flex items-center gap-2.5 sm:gap-3">
            {/* Quick Search Ctrl + K */}
            <button
              onClick={onOpenSearch}
              className="flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white border border-slate-700/70 text-xs transition shadow-sm cursor-pointer"
              title="Buscar equipamento, AS, link ou ferramenta (Ctrl + K)"
            >
              <Search className="h-3.5 w-3.5 text-cyan-400" />
              <span className="hidden md:inline text-slate-400 text-[11px]">Buscar...</span>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.2 text-[10px] font-mono text-slate-400 bg-slate-900 rounded border border-slate-700">
                Ctrl K
              </kbd>
            </button>

            {/* Density Mode Toggle */}
            <button
              onClick={onToggleDensity}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition cursor-pointer ${
                density === 'compact'
                  ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300 shadow-sm shadow-cyan-500/10'
                  : 'bg-slate-800/60 border-slate-700/60 text-slate-400 hover:text-white'
              }`}
              title={
                density === 'compact'
                  ? 'Modo Compacto Ativo (Clique para Confortável)'
                  : 'Modo Confortável Ativo (Clique para Compacto)'
              }
            >
              <SlidersHorizontal className="h-3.5 w-3.5" />
              <span className="hidden lg:inline text-[11px]">
                {density === 'compact' ? 'Compacto' : 'Conforto'}
              </span>
            </button>

            {/* Active Alerts Pill Button */}
            {activeAlertsCount > 0 && (
              <button
                onClick={onOpenAlerts}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold hover:bg-rose-500/30 transition cursor-pointer shadow-lg shadow-rose-500/10 animate-pulse"
              >
                <Bell className="h-3.5 w-3.5 text-rose-400" />
                <span>{activeAlertsCount} Alerta{activeAlertsCount > 1 ? 's' : ''}</span>
              </button>
            )}

            {/* Zero Flap Security Tag (in Traffic section) */}
            {activeSection === 'traffic' && (
              <span className="hidden xl:inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-1.5 rounded-xl bg-emerald-950/80 text-emerald-300 border border-emerald-800/80">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                <span>Zero Flap</span>
              </span>
            )}

            {/* Engine Tag */}
            {health && (
              <div className="hidden 2xl:flex items-center gap-1.5 text-xs text-slate-400 px-2.5 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/60 font-mono text-[11px]">
                <Cpu className="h-3 w-3 text-cyan-400" />
                <span>{health.go_version || 'Go 1.27'}</span>
              </div>
            )}

            {/* Authenticated User Role Badge */}
            {user && (
              <div
                className={`hidden sm:flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl border ${
                  user.role === 'admin'
                    ? 'bg-red-950/80 text-red-300 border-red-800/80'
                    : user.role === 'noc_operator'
                    ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800/80'
                    : 'bg-emerald-950/80 text-emerald-300 border-emerald-800/80'
                }`}
                title={`Logado como ${user.name} (${user.email})`}
              >
                <span
                  className={`h-1.5 w-1.5 rounded-full ${
                    user.role === 'admin'
                      ? 'bg-red-400 animate-pulse'
                      : user.role === 'noc_operator'
                      ? 'bg-cyan-400 animate-pulse'
                      : 'bg-emerald-400'
                  }`}
                />
                <span className="truncate max-w-[120px]">{user.name}</span>
              </div>
            )}
          </div>
        </div>

        {/* Dynamic Sub-Tabs Navigation Strip */}
        <div className="flex items-center space-x-1.5 sm:space-x-2 py-2.5 overflow-x-auto no-scrollbar">
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
                    ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-600/25 border border-cyan-400/30'
                    : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800/80 border border-transparent'
                }`}
              >
                <Icon className={`h-3.5 w-3.5 ${isActive ? 'text-white' : 'text-slate-400'}`} />
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
