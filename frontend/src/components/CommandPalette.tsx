import React, { useState, useEffect, useRef, useMemo } from 'react'
import {
  Search,
  Server,
  Download,
  Upload,
  Activity,
  Network,
  Radio,
  Bell,
  Cpu,
  Terminal,
  ShieldCheck,
  Globe,
  SlidersHorizontal,
  X,
  CornerDownLeft
} from 'lucide-react'
import type { MainSectionType } from './Sidebar'
import type { Device } from '../services/api'

export interface CommandItem {
  id: string
  title: string
  subtitle?: string
  badge?: string
  badgeColor?: string
  category: 'Navegação' | 'Equipamentos' | 'Links & AS' | 'Ações'
  icon: React.ComponentType<{ className?: string }>
  onSelect: () => void
}

interface CommandPaletteProps {
  isOpen: boolean
  onClose: () => void
  onNavigate: (section: MainSectionType, subTab?: string) => void
  onSelectDeviceForTerminal?: (device: Device) => void
  devices: Device[]
  currentDensity: 'comfortable' | 'compact'
  onToggleDensity: () => void
}

export const CommandPalette: React.FC<CommandPaletteProps> = ({
  isOpen,
  onClose,
  onNavigate,
  onSelectDeviceForTerminal,
  devices,
  currentDensity,
  onToggleDensity,
}) => {
  const [query, setQuery] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)

  // Focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('')
      setSelectedIndex(0)
      setTimeout(() => inputRef.current?.focus(), 50)
    }
  }, [isOpen])

  // Static Links & AS groups known in the network
  const staticASLinks = [
    { name: 'SEA Telecom (Trânsito IP Primário)', asn: 'AS266445', role: 'Trânsito IP', router: 'BGP' },
    { name: 'PTT São Paulo (IX.br SP)', asn: 'AS26162', role: 'Ponto de Troca de Tráfego', router: 'BGP & BGP2' },
    { name: 'PTT Belém (IX.br PA)', asn: 'AS26162', role: 'Ponto de Troca de Tráfego', router: 'BGP2' },
    { name: 'PTT Brasília (IX.br DF)', asn: 'AS26162', role: 'Ponto de Troca de Tráfego', router: 'BGP' },
    { name: 'PTT Ceará (IX.br CE)', asn: 'AS26162', role: 'Ponto de Troca de Tráfego', router: 'BGP2' },
    { name: 'Wiki Telecom (Trânsito Secundário)', asn: 'AS53062', role: 'Trânsito IP', router: 'BGP2' },
  ]

  // Construct all possible command palette items
  const allCommands = useMemo<CommandItem[]>(() => {
    const items: CommandItem[] = []

    // 1. Navigation items
    items.push(
      {
        id: 'nav-download',
        title: 'Download (AS-Path Prepending)',
        subtitle: 'Engenharia de tráfego de entrada, prepends 0P a 3P e bloqueio por AS',
        category: 'Navegação',
        icon: Download,
        badge: 'Tráfego',
        badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
        onSelect: () => {
          onNavigate('traffic', 'download')
          onClose()
        },
      },
      {
        id: 'nav-upload',
        title: 'Upload (Local-Preference & Rotas)',
        subtitle: 'Engenharia de tráfego de saída, preferência local e rotas estáticas',
        category: 'Navegação',
        icon: Upload,
        badge: 'Tráfego',
        badgeColor: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30',
        onSelect: () => {
          onNavigate('traffic', 'upload')
          onClose()
        },
      },
      {
        id: 'nav-bgp',
        title: 'Sessões BGP em Tempo Real',
        subtitle: 'Status de peers, uptime, rotas recebidas e exportadas',
        category: 'Navegação',
        icon: Activity,
        badge: 'BGP',
        badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
        onSelect: () => {
          onNavigate('traffic', 'bgp')
          onClose()
        },
      },
      {
        id: 'nav-ospf',
        title: 'Vizinhos OSPF',
        subtitle: 'Topologia IGP interna, estados Full/2-Way e métricas',
        category: 'Navegação',
        icon: Network,
        badge: 'IGP',
        badgeColor: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30',
        onSelect: () => {
          onNavigate('traffic', 'ospf')
          onClose()
        },
      },
      {
        id: 'nav-devices',
        title: 'Inventário de Equipamentos',
        subtitle: 'Lista de roteadores, switches, IPs de gerência e credenciais',
        category: 'Navegação',
        icon: Server,
        badge: 'Infra',
        badgeColor: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
        onSelect: () => {
          onNavigate('devices', 'inventory')
          onClose()
        },
      },
      {
        id: 'nav-terminal',
        title: 'Terminal SSH Interativo',
        subtitle: 'Console SSH direto para execução de comandos CLI nos roteadores',
        category: 'Navegação',
        icon: Terminal,
        badge: 'SSH',
        badgeColor: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
        onSelect: () => {
          onNavigate('devices', 'terminal')
          onClose()
        },
      },
      {
        id: 'nav-telemetry',
        title: 'Visão Geral NOC & Telemetria',
        subtitle: 'Indicadores de CPU, memória, ciclos de coleta e integridade',
        category: 'Navegação',
        icon: Radio,
        badge: 'NOC',
        badgeColor: 'bg-amber-500/10 text-amber-400 border-amber-500/30',
        onSelect: () => {
          onNavigate('telemetry', 'overview')
          onClose()
        },
      },
      {
        id: 'nav-alerts',
        title: 'Central de Alertas & Syslog',
        subtitle: 'Feed de logs Syslog (porta 1514) e incidentes BGP/Link',
        category: 'Navegação',
        icon: Bell,
        badge: 'Alertas',
        badgeColor: 'bg-rose-500/10 text-rose-400 border-rose-500/30',
        onSelect: () => {
          onNavigate('telemetry', 'alerts')
          onClose()
        },
      },
      {
        id: 'nav-diagnostics',
        title: 'Diagnósticos: Ping & Latência',
        subtitle: 'Testes de latência ICMP e jitter para múltiplos destinos',
        category: 'Navegação',
        icon: Cpu,
        badge: 'Rede',
        badgeColor: 'bg-slate-500/10 text-slate-400 border-slate-500/30',
        onSelect: () => {
          onNavigate('diagnostics', 'ping')
          onClose()
        },
      }
    )

    // 2. Devices
    devices.forEach((dev) => {
      items.push({
        id: `dev-${dev.id}`,
        title: dev.name,
        subtitle: `${dev.host}:${dev.port} • ${dev.vendor.toUpperCase()} • ${dev.is_bgp ? 'Roteador BGP' : 'Switch/PE'}`,
        category: 'Equipamentos',
        icon: Server,
        badge: dev.is_bgp ? 'BGP Edge' : 'Infra',
        badgeColor: dev.is_bgp
          ? 'bg-purple-500/10 text-purple-300 border-purple-500/30'
          : 'bg-slate-500/10 text-slate-400 border-slate-500/30',
        onSelect: () => {
          if (onSelectDeviceForTerminal) {
            onSelectDeviceForTerminal(dev)
          } else {
            onNavigate('devices', 'inventory')
          }
          onClose()
        },
      })
    })

    // 3. AS Links
    staticASLinks.forEach((link, idx) => {
      items.push({
        id: `link-${idx}`,
        title: link.name,
        subtitle: `${link.asn} • ${link.role} • Termina em ${link.router}`,
        category: 'Links & AS',
        icon: Globe,
        badge: link.asn,
        badgeColor: 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30 font-mono',
        onSelect: () => {
          onNavigate('traffic', 'download')
          onClose()
        },
      })
    })

    // 4. Quick Actions
    items.push({
      id: 'action-density',
      title: currentDensity === 'comfortable' ? 'Mudar para Modo Compacto' : 'Mudar para Modo Confortável',
      subtitle: currentDensity === 'comfortable'
        ? 'Reduzir espaçamento para visualizar mais links e dados sem scroll'
        : 'Aumentar espaçamento e tamanho dos cards para leitura espaçada',
      category: 'Ações',
      icon: SlidersHorizontal,
      badge: currentDensity === 'comfortable' ? 'Ativar Compacto' : 'Ativar Conforto',
      badgeColor: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30',
      onSelect: () => {
        onToggleDensity()
        onClose()
      },
    })

    return items
  }, [devices, currentDensity, onNavigate, onSelectDeviceForTerminal, onClose, onToggleDensity])

  // Filter commands based on user query
  const filteredCommands = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return allCommands

    return allCommands.filter((item) => {
      const matchTitle = item.title.toLowerCase().includes(q)
      const matchSub = item.subtitle ? item.subtitle.toLowerCase().includes(q) : false
      const matchBadge = item.badge ? item.badge.toLowerCase().includes(q) : false
      const matchCat = item.category.toLowerCase().includes(q)
      return matchTitle || matchSub || matchBadge || matchCat
    })
  }, [allCommands, query])

  // Keyboard navigation within the palette
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev + 1 < filteredCommands.length ? prev + 1 : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSelectedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredCommands.length - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      if (filteredCommands[selectedIndex]) {
        filteredCommands[selectedIndex].onSelect()
      }
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onClose()
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (listRef.current) {
      const activeEl = listRef.current.querySelector('[data-selected="true"]') as HTMLElement
      if (activeEl) {
        activeEl.scrollIntoView({ block: 'nearest' })
      }
    }
  }, [selectedIndex])

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-md flex items-start justify-center pt-[10vh] sm:pt-[14vh] px-4 animate-in fade-in duration-150"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[75vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search Input Bar */}
        <div className="relative flex items-center px-4 py-3.5 border-b border-slate-800 bg-slate-950/60">
          <Search className="h-5 w-5 text-cyan-400 shrink-0 mr-3" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedIndex(0)
            }}
            placeholder="Buscar equipamento, IP, ASN, link ou ferramenta... (ex: SEA, BGP, 45.166)"
            className="w-full bg-transparent text-sm sm:text-base text-white placeholder-slate-500 focus:outline-none"
          />
          {query ? (
            <button
              onClick={() => {
                setQuery('')
                inputRef.current?.focus()
              }}
              className="p-1 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          ) : (
            <kbd className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 text-[11px] font-mono font-medium text-slate-400 bg-slate-800 rounded border border-slate-700">
              ESC
            </kbd>
          )}
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          className="flex-1 overflow-y-auto p-2 space-y-1 no-scrollbar max-h-[55vh]"
        >
          {filteredCommands.length === 0 ? (
            <div className="text-center py-12 text-slate-400">
              <Search className="h-8 w-8 mx-auto text-slate-600 mb-2 stroke-[1.5]" />
              <p className="text-sm font-medium">Nenhum resultado encontrado para "{query}"</p>
              <p className="text-xs text-slate-500 mt-1">Tente buscar por "Huawei", "SEA Telecom", "BGP" ou um IP.</p>
            </div>
          ) : (
            filteredCommands.map((item, idx) => {
              const Icon = item.icon
              const isSelected = idx === selectedIndex

              return (
                <div
                  key={item.id}
                  data-selected={isSelected}
                  onClick={item.onSelect}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? 'bg-gradient-to-r from-cyan-600/20 via-blue-600/20 to-slate-800/80 border border-cyan-500/40 text-white'
                      : 'hover:bg-slate-800/60 text-slate-300 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`p-2 rounded-lg shrink-0 ${
                        isSelected
                          ? 'bg-cyan-500 text-slate-950 font-bold shadow-md shadow-cyan-500/30'
                          : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold truncate text-white">{item.title}</span>
                        {item.badge && (
                          <span
                            className={`text-[10px] px-2 py-0.2 rounded-full border shrink-0 ${
                              item.badgeColor || 'bg-slate-800 text-slate-400 border-slate-700'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.subtitle && (
                        <p className="text-xs text-slate-400 truncate mt-0.5 font-mono text-[11px]">
                          {item.subtitle}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-slate-500 uppercase tracking-wider font-semibold hidden sm:inline">
                      {item.category}
                    </span>
                    {isSelected && (
                      <CornerDownLeft className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                    )}
                  </div>
                </div>
              )
            })
          )}
        </div>

        {/* Footer info bar */}
        <div className="px-4 py-2.5 border-t border-slate-800/80 bg-slate-950/80 flex items-center justify-between text-xs text-slate-400">
          <div className="flex items-center gap-4 text-[11px]">
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-300">↑</kbd>
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-300">↓</kbd>
              <span className="text-slate-400">Navegar</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-300">Enter</kbd>
              <span className="text-slate-400">Abrir</span>
            </span>
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 font-mono text-[10px] text-slate-300">Esc</kbd>
              <span className="text-slate-400">Fechar</span>
            </span>
          </div>
          <div className="flex items-center gap-1.5 text-[11px] text-slate-400">
            <ShieldCheck className="h-3 w-3 text-cyan-400" />
            <span>Navegação Rápida NetPulse</span>
          </div>
        </div>
      </div>
    </div>
  )
}
