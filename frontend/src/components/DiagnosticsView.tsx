import React, { useState } from 'react'
import { Activity, Wifi, Server, Globe } from 'lucide-react'
import { PingTool } from './PingTool'
import { InterfacesList } from './InterfacesList'
import { PortScanner } from './PortScanner'
import { DNSLookup } from './DNSLookup'

export const DiagnosticsView: React.FC = () => {
  const [subTab, setSubTab] = useState<'ping' | 'interfaces' | 'ports' | 'dns'>('ping')

  const subTabs = [
    { id: 'ping', label: 'Ping & Latência', icon: Activity },
    { id: 'interfaces', label: 'Interfaces Locais', icon: Wifi },
    { id: 'ports', label: 'Scanner de Portas', icon: Server },
    { id: 'dns', label: 'Consulta DNS', icon: Globe },
  ]

  return (
    <div className="space-y-6">
      {/* Subtab navigation */}
      <div className="flex space-x-2 border-b border-slate-800 pb-3">
        {subTabs.map((t) => {
          const Icon = t.icon
          const isActive = subTab === t.id
          return (
            <button
              key={t.id}
              onClick={() => setSubTab(t.id as any)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                isActive
                  ? 'bg-slate-800 text-cyan-400 border border-slate-700'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              <span>{t.label}</span>
            </button>
          )
        })}
      </div>

      {subTab === 'ping' && <PingTool />}
      {subTab === 'interfaces' && <InterfacesList />}
      {subTab === 'ports' && <PortScanner />}
      {subTab === 'dns' && <DNSLookup />}
    </div>
  )
}
