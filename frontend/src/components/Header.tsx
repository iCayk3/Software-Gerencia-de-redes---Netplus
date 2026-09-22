import React from 'react'
import {
  Activity,
  Server,
  Wifi,
  ShieldAlert,
  Cpu,
  Network,
  Terminal,
  Radio,
  Bell,
  ArrowUpDown
} from 'lucide-react'
import type { HealthResponse } from '../services/api'

export type TabType = 'devices' | 'telemetry' | 'traffic' | 'bgp' | 'ospf' | 'terminal' | 'diagnostics'

interface HeaderProps {
  health: HealthResponse | null
  loadingHealth: boolean
  activeTab: TabType
  setActiveTab: (tab: TabType) => void
  activeAlertsCount?: number
}

export const Header: React.FC<HeaderProps> = ({
  health,
  loadingHealth,
  activeTab,
  setActiveTab,
  activeAlertsCount = 0,
}) => {
  const tabs = [
    { id: 'devices', label: 'Equipamentos', icon: Server },
    { id: 'telemetry', label: 'Telemetria & NOC', icon: Radio, badge: activeAlertsCount },
    { id: 'traffic', label: 'Engenharia de Tráfego', icon: ArrowUpDown },
    { id: 'bgp', label: 'Sessões BGP', icon: Activity },
    { id: 'ospf', label: 'Vizinhos OSPF', icon: Network },
    { id: 'terminal', label: 'Terminal SSH', icon: Terminal },
    { id: 'diagnostics', label: 'Diagnósticos (Ping/Portas)', icon: Cpu },
  ]

  return (
    <header className="border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Project Title */}
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shadow-lg shadow-cyan-500/20">
              <Network className="h-5 w-5 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-lg text-white tracking-tight">NetPulse</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-cyan-950 text-cyan-400 border border-cyan-800">
                  BGP & OSPF Telemetry
                </span>
              </div>
              <p className="text-xs text-slate-400">Huawei &bull; Datacom DmOS &bull; MikroTik</p>
            </div>
          </div>

          {/* Right Status Controls */}
          <div className="flex items-center gap-3 sm:gap-4">
            {/* Active Alerts Pill Button */}
            {activeAlertsCount > 0 && (
              <button
                onClick={() => setActiveTab('telemetry')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs font-semibold hover:bg-rose-500/30 transition cursor-pointer shadow-lg shadow-rose-500/10 animate-pulse"
              >
                <Bell className="h-3.5 w-3.5 text-rose-400" />
                <span>{activeAlertsCount} Alerta{activeAlertsCount > 1 ? 's' : ''}</span>
              </button>
            )}

            {/* Backend Status Badge */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800/80 border border-slate-700/60 text-xs">
              <Wifi className="h-3.5 w-3.5 text-slate-400" />
              <span className="text-slate-400">Backend:</span>
              {loadingHealth ? (
                <span className="text-slate-400 animate-pulse">Conectando...</span>
              ) : health?.status === 'online' ? (
                <div className="flex items-center gap-1.5 text-emerald-400 font-medium">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>Online ({health.uptime})</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-rose-400 font-medium">
                  <ShieldAlert className="h-3.5 w-3.5" />
                  <span>Desconectado</span>
                </div>
              )}
            </div>

            {health && (
              <div className="hidden md:flex items-center gap-1.5 text-xs text-slate-400 px-2.5 py-1 rounded bg-slate-800/50">
                <Cpu className="h-3 w-3 text-cyan-400" />
                <span>{health.go_version}</span>
              </div>
            )}
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="flex space-x-1 sm:space-x-2 border-t border-slate-800/60 py-2 overflow-x-auto">
          {tabs.map((tab) => {
            const Icon = tab.icon
            const isActive = activeTab === tab.id
            const hasBadge = tab.badge !== undefined && tab.badge > 0

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all whitespace-nowrap cursor-pointer relative ${
                  isActive
                    ? 'bg-cyan-500/15 text-cyan-400 border border-cyan-500/40 shadow-xs'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-cyan-400' : 'text-slate-500'}`} />
                <span>{tab.label}</span>
                {hasBadge && (
                  <span className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-rose-500 text-white">
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
