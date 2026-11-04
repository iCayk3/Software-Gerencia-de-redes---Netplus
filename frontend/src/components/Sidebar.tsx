import React from 'react'
import {
  ArrowUpDown,
  Server,
  Radio,
  Cpu,
  Network,
  ChevronLeft,
  ChevronRight,
  Wifi,
  ShieldAlert,
  ShieldCheck,
  LogOut,
  Building2,
  Users,
  KeyRound,
  X
} from 'lucide-react'
import type { HealthResponse } from '../services/api'
import { useAuth } from '../context/AuthContext'

export type MainSectionType = 'bgp' | 'ospf' | 'devices' | 'telemetry' | 'diagnostics' | 'audit' | 'tenants' | 'users' | 'traffic' | 'license'

interface NavSectionItem {
  id: MainSectionType
  label: string
  shortLabel: string
  description: string
  icon: React.ComponentType<{ className?: string }>
  badge?: number
  defaultSubTab: string
}

interface SidebarProps {
  activeSection: MainSectionType
  onSelectSection: (section: MainSectionType) => void
  activeAlertsCount?: number
  isCollapsed: boolean
  onToggleCollapse: () => void
  isMobileOpen: boolean
  onCloseMobile: () => void
  health: HealthResponse | null
  loadingHealth: boolean
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeSection,
  onSelectSection,
  activeAlertsCount = 0,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  health,
  loadingHealth,
}) => {
  const { user, isSuperAdmin, logout } = useAuth()

  const navSections: NavSectionItem[] = [
    {
      id: 'bgp',
      label: 'Protocolo BGP',
      shortLabel: 'BGP',
      description: 'Engenharia de tráfego, sessões, churn & RPKI',
      icon: ArrowUpDown,
      defaultSubTab: 'download',
    },
    {
      id: 'ospf',
      label: 'Protocolo OSPF',
      shortLabel: 'OSPF',
      description: 'Adjacências, áreas, topologia & CLI',
      icon: Network,
      defaultSubTab: 'neighbors',
    },
    {
      id: 'devices',
      label: 'Equipamentos & Infra',
      shortLabel: 'Equipamentos',
      description: 'Inventário, bordas BGP e SSH',
      icon: Server,
      defaultSubTab: 'inventory',
    },
    {
      id: 'telemetry',
      label: 'NOC & Telemetria',
      shortLabel: 'Telemetria',
      description: 'Monitoramento, Syslog e Alertas',
      icon: Radio,
      badge: activeAlertsCount,
      defaultSubTab: 'overview',
    },
    {
      id: 'diagnostics',
      label: 'Ferramentas de Rede',
      shortLabel: 'Diagnósticos',
      description: 'Ping, portas, DNS e interfaces',
      icon: Cpu,
      defaultSubTab: 'ping',
    },
    {
      id: 'audit',
      label: 'Trilha de Auditoria',
      shortLabel: 'Auditoria',
      description: 'Logs imutáveis de ações e comandos',
      icon: ShieldCheck,
      defaultSubTab: 'logs',
    },
    {
      id: 'license',
      label: 'Licença & Sistema',
      shortLabel: 'Licença',
      description: 'Plano, capacidades e servidor master',
      icon: KeyRound,
      defaultSubTab: 'overview',
    },
    ...(isSuperAdmin || user?.role === 'admin' ? [{
      id: 'tenants' as MainSectionType,
      label: 'Configurações da Empresa',
      shortLabel: 'Empresa',
      description: 'Dados da empresa, ASN oficial e BGP',
      icon: Building2,
      defaultSubTab: 'list',
    }] : []),
    ...(isSuperAdmin || user?.role === 'admin' ? [{
      id: 'users' as MainSectionType,
      label: 'Usuários & Permissões',
      shortLabel: 'Usuários',
      description: 'Operadores NOC, RBAC e empresas',
      icon: Users,
      defaultSubTab: 'list',
    }] : []),
  ]

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#13151D] border-r border-[#242836] text-[#E2E5EC] select-none">
      {/* Branding Header */}
      <div className={`flex items-center gap-3 p-4 border-b border-[#242836] transition-all ${
        isCollapsed ? 'justify-center px-2' : 'justify-between'
      }`}>
        <div className="flex items-center gap-3 overflow-hidden">
          <div className="h-10 w-10 rounded-xl bg-[#25334D] border border-[#3B5B8C]/40 flex items-center justify-center shrink-0 shadow-md text-[#93B4E6]">
            <Network className="h-5 w-5" />
          </div>
          {!isCollapsed && (
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <span className="font-bold text-base text-slate-100 tracking-tight">NetPulse</span>
                <span className="text-[11px] font-mono text-slate-400">
                  v2.0
                </span>
              </div>
              <p className="text-[11px] text-slate-400 truncate">BGP & OSPF Routing Suite</p>
            </div>
          )}
        </div>

        {/* Mobile close button */}
        <button
          onClick={onCloseMobile}
          className="md:hidden p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#1C202C]"
        >
          <X className="h-5 w-5" />
        </button>
      </div>

      {/* Navigation Sections */}
      <div className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {!isCollapsed && (
          <div className="px-3 pb-2 text-[10px] font-bold uppercase tracking-wider text-slate-500">
            Navegação Principal
          </div>
        )}

        {navSections.map((item) => {
          const Icon = item.icon
          const isActive = activeSection === item.id
          const hasBadge = item.badge !== undefined && item.badge > 0

          return (
            <button
              key={item.id}
              onClick={() => {
                onSelectSection(item.id)
                onCloseMobile()
              }}
              title={isCollapsed ? item.label : undefined}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 cursor-pointer relative group ${
                isActive
                  ? 'bg-[#222A3D] text-[#E2E5EC] border border-[#3B5B8C]/40 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-[#1C202C] border border-transparent'
              } ${isCollapsed ? 'justify-center px-0' : ''}`}
            >
              {/* Active Indicator Bar */}
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-1 bg-[#4A72B2] rounded-r-full" />
              )}

              <div
                className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 transition-colors ${
                  isActive
                    ? 'bg-[#2D3852] text-[#93B4E6] border border-[#3B5B8C]/30'
                    : 'bg-[#1C202C] text-slate-400 group-hover:text-slate-200 group-hover:bg-[#222736]'
                }`}
              >
                <Icon className="h-4 w-4" />
              </div>

              {!isCollapsed && (
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <span className={`text-xs font-semibold truncate ${isActive ? 'text-white font-bold' : ''}`}>
                      {item.label}
                    </span>
                    {hasBadge && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-full bg-rose-500 text-white animate-pulse">
                        {item.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-slate-500 truncate mt-0.5">{item.description}</p>
                </div>
              )}

              {/* Collapsed badge indicator */}
              {isCollapsed && hasBadge && (
                <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-[#13151D]" />
              )}
            </button>
          )
        })}
      </div>

      {/* Backend Status & Collapse Toggle */}
      <div className="p-3 border-t border-[#242836] space-y-2 bg-[#10121A]">
        {/* Current Authenticated User Profile Pill */}
        {user && (
          <div className={`p-2.5 rounded-xl bg-[#161922] border border-[#242836] flex items-center gap-2 ${
            isCollapsed ? 'justify-center' : 'justify-between'
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div
                className={`h-7 w-7 rounded-lg flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  isSuperAdmin
                    ? 'bg-[#25334D] text-amber-300 border border-amber-500/20'
                    : user.role === 'admin'
                    ? 'bg-[#25334D] text-rose-300 border border-rose-500/20'
                    : user.role === 'noc_operator'
                    ? 'bg-[#25334D] text-[#93B4E6] border border-[#3B5B8C]/30'
                    : 'bg-[#25334D] text-emerald-300 border border-emerald-500/20'
                }`}
                title={`${user.name} (${user.email})`}
              >
                {user.name ? user.name.slice(0, 2).toUpperCase() : 'U'}
              </div>
              {!isCollapsed && (
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-slate-200 truncate">{user.name}</div>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="text-[11px] font-medium text-slate-400">
                      {isSuperAdmin
                        ? 'SuperAdmin'
                        : user.role === 'admin'
                        ? 'Admin'
                        : user.role === 'noc_operator'
                        ? 'Operador'
                        : 'Visualizador'}
                    </span>
                  </div>
                </div>
              )}
            </div>
            {!isCollapsed && (
              <button
                onClick={logout}
                className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-[#1C202C] rounded-lg transition cursor-pointer"
                title="Encerrar Sessão (Logout)"
              >
                <LogOut className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}

        {/* Backend Connectivity Status */}
        {!isCollapsed ? (
          <div className="p-2.5 rounded-xl bg-[#161922] border border-[#242836] text-[11px] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wifi className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-slate-400">Backend:</span>
            </div>
            {loadingHealth ? (
              <span className="text-slate-500 animate-pulse">Conectando...</span>
            ) : health?.status === 'online' || health?.status?.includes('ok') ? (
              <span className="inline-flex items-center gap-1.5 font-medium text-[#2E9E6B]">
                <span className="h-1.5 w-1.5 rounded-full bg-[#2E9E6B] animate-pulse" />
                Online
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 font-medium text-[#D9534F]">
                <ShieldAlert className="h-3.5 w-3.5" />
                Offline
              </span>
            )}
          </div>
        ) : (
          <div className="flex justify-center py-1">
            <span
              className={`h-2.5 w-2.5 rounded-full ${
                health?.status === 'online' || health?.status?.includes('ok')
                  ? 'bg-[#2E9E6B] ring-2 ring-[#2E9E6B]/20 animate-pulse'
                  : 'bg-[#D9534F]'
              }`}
              title={health?.status === 'online' || health?.status?.includes('ok') ? 'Backend Online' : 'Backend Offline'}
            />
          </div>
        )}

        {/* Desktop Collapse / Expand Button */}
        <button
          onClick={onToggleCollapse}
          title={isCollapsed ? 'Expandir Menu' : 'Recolher Menu'}
          className="hidden md:flex items-center justify-center gap-2 w-full py-2 px-3 text-xs text-slate-400 hover:text-slate-200 hover:bg-[#1C202C] rounded-xl transition cursor-pointer border border-transparent hover:border-[#242836]"
        >
          {isCollapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <>
              <ChevronLeft className="h-4 w-4" />
              <span>Recolher Barra Lateral</span>
            </>
          )}
        </button>
      </div>
    </div>
  )

  return (
    <>
      {/* Desktop Persistent Sidebar */}
      <aside
        className={`hidden md:block shrink-0 transition-all duration-200 ease-in-out z-30 ${
          isCollapsed ? 'w-20' : 'w-64'
        }`}
      >
        <div className="h-screen sticky top-0">{sidebarContent}</div>
      </aside>

      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden flex">
          <div
            className="fixed inset-0 bg-black/70 backdrop-blur-xs transition-opacity"
            onClick={onCloseMobile}
          />
          <div className="relative w-72 max-w-[85vw] h-full shadow-2xl animate-in slide-in-from-left duration-200">
            {sidebarContent}
          </div>
        </div>
      )}
    </>
  )
}
