import React, { useState, useEffect } from 'react'
import {
  Network,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  FileText,
  Server,
  Layers,
  Terminal,
  Copy,
  Check,
  ShieldCheck,
  Info
} from 'lucide-react'
import {
  fetchDevices,
  fetchAllOSPF,
  fetchDeviceOSPF,
  type Device,
  type OSPFNeighbor
} from '../services/api'

export interface OSPFManagerProps {
  activeSubTab?: 'neighbors' | 'areas' | 'diagnostics'
  onSelectSubTab?: (tab: string) => void
  density?: 'comfortable' | 'compact'
}

interface VendorCommand {
  name: string
  command: string
  description: string
  purpose: 'verification' | 'troubleshooting' | 'database' | 'routing'
}

export const OSPFManager: React.FC<OSPFManagerProps> = ({
  activeSubTab = 'neighbors',
  onSelectSubTab,
  density = 'comfortable'
}) => {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all')
  const [neighbors, setNeighbors] = useState<OSPFNeighbor[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [modalNeighbor, setModalNeighbor] = useState<OSPFNeighbor | null>(null)
  const [copiedCommand, setCopiedCommand] = useState<string | null>(null)
  const [selectedVendor, setSelectedVendor] = useState<'huawei' | 'datacom' | 'mikrotik_v7' | 'mikrotik_v6' | 'cisco'>('huawei')

  const loadInitialData = async () => {
    try {
      const devs = await fetchDevices()
      setDevices(devs)
    } catch {
      // ignore
    }
    loadOSPFNeighbors('all')
  }

  const loadOSPFNeighbors = async (devId: string, fresh = false) => {
    setLoading(true)
    setError(null)
    try {
      if (devId === 'all') {
        const data = await fetchAllOSPF(fresh)
        setNeighbors(data || [])
      } else {
        const data = await fetchDeviceOSPF(devId, fresh)
        setNeighbors(data || [])
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar vizinhos OSPF')
      setNeighbors([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInitialData()
  }, [])

  const handleDeviceChange = (devId: string) => {
    setSelectedDeviceId(devId)
    loadOSPFNeighbors(devId)
  }

  const handleCopyCommand = (cmd: string) => {
    navigator.clipboard.writeText(cmd)
    setCopiedCommand(cmd)
    setTimeout(() => setCopiedCommand(null), 2500)
  }

  const filteredNeighbors = neighbors.filter((n) => {
    const q = search.toLowerCase()
    return (
      n.neighbor_id.toLowerCase().includes(q) ||
      n.ip.toLowerCase().includes(q) ||
      n.interface.toLowerCase().includes(q) ||
      n.device_name.toLowerCase().includes(q) ||
      n.area.toLowerCase().includes(q)
    )
  })

  // Metrics
  const totalNeighbors = neighbors.length
  const fullNeighbors = neighbors.filter((n) => n.state.toLowerCase().includes('full')).length
  const pendingNeighbors = totalNeighbors - fullNeighbors
  const uniqueAreas = Array.from(new Set(neighbors.map((n) => n.area || '0.0.0.0'))).sort()

  // Area distribution grouping
  const areaGroups = uniqueAreas.map((areaId) => {
    const areaNeighbors = neighbors.filter((n) => (n.area || '0.0.0.0') === areaId)
    const areaFullCount = areaNeighbors.filter((n) => n.state.toLowerCase().includes('full')).length
    const interfaces = Array.from(new Set(areaNeighbors.map((n) => n.interface)))
    const routers = Array.from(new Set(areaNeighbors.map((n) => n.device_name)))
    const isBackbone = areaId === '0.0.0.0' || areaId === '0'
    return {
      areaId,
      isBackbone,
      neighbors: areaNeighbors,
      totalCount: areaNeighbors.length,
      fullCount: areaFullCount,
      interfaces,
      routers
    }
  })

  // Vendor diagnostic commands catalog
  const vendorCommands: Record<string, { label: string; commands: VendorCommand[] }> = {
    huawei: {
      label: 'Huawei VRP (NE8000 / NE40E / S6730)',
      commands: [
        {
          name: 'Resumo das Adjacências OSPF',
          command: 'display ospf peer brief',
          description: 'Exibe tabela concisa de todos os vizinhos OSPF, estados (Full/Init) e interfaces.',
          purpose: 'verification'
        },
        {
          name: 'Detalhes Completos dos Vizinhos',
          command: 'display ospf peer',
          description: 'Mostra temporizadores de Dead Time, prioridade de DR/BDR, endereço IP e MTU.',
          purpose: 'verification'
        },
        {
          name: 'Tabela de Rotas OSPF Aprendidas',
          command: 'display ospf routing',
          description: 'Lista todos os prefixos IGP calculados pelo algoritmo Dijkstra (SPF).',
          purpose: 'routing'
        },
        {
          name: 'Base de Dados Topológica (LSDB)',
          command: 'display ospf lsdb',
          description: 'Inspeciona anúncios LSA (Router, Network, Summary e External) presentes na LSDB.',
          purpose: 'database'
        },
        {
          name: 'Contadores de Erros e Desconexões',
          command: 'display ospf error',
          description: 'Exibe falhas de autenticação, incompatibilidade de MTU, Timers e máscara de rede.',
          purpose: 'troubleshooting'
        },
        {
          name: 'Configuração da Interface OSPF',
          command: 'display ospf interface brief',
          description: 'Lista interfaces ativas no processo OSPF, custos métricos e papéis de DR/BDR.',
          purpose: 'verification'
        }
      ]
    },
    datacom: {
      label: 'Datacom DmOS (DM4000 / DM4200 / DM4300)',
      commands: [
        {
          name: 'Vizinhos OSPF em Tempo Real',
          command: 'show ip ospf neighbor',
          description: 'Lista todas as adjacências com estados atuais, temporizador de dead time e IPs vizinhos.',
          purpose: 'verification'
        },
        {
          name: 'Detalhes das Interfaces OSPF',
          command: 'show ip ospf interface',
          description: 'Verifica custos de enlace, tipo de rede OSPF (Point-to-Point ou Broadcast) e prioridades.',
          purpose: 'verification'
        },
        {
          name: 'Base de Dados OSPF (LSDB)',
          command: 'show ip ospf database',
          description: 'Exibe a Link State Database com identificação dos roteadores originadores de cada LSA.',
          purpose: 'database'
        },
        {
          name: 'Rotas OSPF Instaladas na FIB',
          command: 'show ip route ospf',
          description: 'Mostra rotas ativas instaladas na tabela de encaminhamento principal com métricas.',
          purpose: 'routing'
        }
      ]
    },
    mikrotik_v7: {
      label: 'MikroTik RouterOS v7 (CCR2004 / CCR2116 / CCR2216)',
      commands: [
        {
          name: 'Vizinhos OSPF v7 Detalhados',
          command: '/routing/ospf/neighbor/print detail',
          description: 'Exibe adjacências com Router-ID, estado (Full), endereço IP e porta na arquitetura v7.',
          purpose: 'verification'
        },
        {
          name: 'Instâncias & Áreas OSPF v7',
          command: '/routing/ospf/instance/print',
          description: 'Lista instâncias OSPF ativas, Router-ID configurado e distribuição de rotas.',
          purpose: 'verification'
        },
        {
          name: 'Modelos de Interface OSPF v7',
          command: '/routing/ospf/interface-template/print detail',
          description: 'Exibe interfaces participantes, custos métricos e modo de rede (ptp/broadcast).',
          purpose: 'verification'
        },
        {
          name: 'Base de Dados LSA v7',
          command: '/routing/ospf/lsa/print',
          description: 'Inspeciona anúncios LSA Type 1, Type 2 e Type 5 armazenados em memória.',
          purpose: 'database'
        }
      ]
    },
    mikrotik_v6: {
      label: 'MikroTik RouterOS v6 (CCR1036 / CCR1072 Legadas)',
      commands: [
        {
          name: 'Vizinhos OSPF Legado',
          command: '/routing ospf neighbor print detail',
          description: 'Exibe tabela clássica de vizinhos OSPF do RouterOS v6.',
          purpose: 'verification'
        },
        {
          name: 'Interfaces OSPF v6',
          command: '/routing ospf interface print',
          description: 'Lista interfaces com custos, prioridades de DR e temporizadores de Hello.',
          purpose: 'verification'
        },
        {
          name: 'Rotas OSPF v6',
          command: '/ip route print where ospf',
          description: 'Filtra rotas com flag "Ao" aprendidas via OSPF v6 na tabela de rotas.',
          purpose: 'routing'
        }
      ]
    },
    cisco: {
      label: 'Cisco IOS-XR / IOS-XE / Juniper Junos',
      commands: [
        {
          name: 'Vizinhos OSPF Cisco',
          command: 'show ip ospf neighbor detail',
          description: 'Adjacências completas com estado de vizinhança, Dead Timer e MTU.',
          purpose: 'verification'
        },
        {
          name: 'Resumo das Interfaces Cisco',
          command: 'show ip ospf interface brief',
          description: 'Lista rápida de interfaces com custos métricos configurados.',
          purpose: 'verification'
        },
        {
          name: 'Vizinhos OSPF Juniper Junos',
          command: 'show ospf neighbor detail',
          description: 'Exibição completa de adjacências e interfaces no formato Junos.',
          purpose: 'verification'
        }
      ]
    }
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-150">
      {/* Top Header Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2">
            <Network className="h-5 w-5 text-cyan-400" />
            <span>Protocolo OSPF & Topologia Interna (IGP)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Inspeção de adjacências OSPF, papéis DR/BDR, áreas de roteamento e comandos de diagnóstico CLI via SSH
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Device Selector */}
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-slate-500" />
            <select
              value={selectedDeviceId}
              onChange={(e) => handleDeviceChange(e.target.value)}
              className="px-3 py-2 bg-slate-950/80 border border-slate-700 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value="all">Todos os Roteadores ({devices.length})</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.vendor})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => loadOSPFNeighbors(selectedDeviceId, true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Atualizar OSPF</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800 text-rose-300 text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metrics Summary Strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-400 font-medium">Total de Vizinhos</span>
          <div className="text-2xl font-bold text-slate-100 mt-1">{totalNeighbors}</div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-400 font-medium">Adjacências FULL</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
            <CheckCircle2 className="h-5 w-5" />
            <span>{fullNeighbors}</span>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-400 font-medium">Não-Full / Alerta</span>
          <div className={`text-2xl font-bold mt-1 flex items-center gap-1.5 ${pendingNeighbors > 0 ? 'text-amber-400' : 'text-slate-400'}`}>
            <AlertCircle className="h-5 w-5" />
            <span>{pendingNeighbors}</span>
          </div>
        </div>

        <div
          onClick={() => onSelectSubTab?.('areas')}
          className={`bg-slate-900/40 border border-slate-800 rounded-xl p-4 shadow-sm transition ${
            onSelectSubTab ? 'hover:border-cyan-500/40 cursor-pointer group' : ''
          }`}
          title={onSelectSubTab ? 'Clique para ver topologia detalhada das áreas' : undefined}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-400 font-medium group-hover:text-cyan-300 transition">
              Áreas Detectadas
            </span>
            {onSelectSubTab && (
              <span className="text-[10px] text-cyan-400 opacity-0 group-hover:opacity-100 transition">
                Ver áreas &rarr;
              </span>
            )}
          </div>
          <div className="text-2xl font-bold text-cyan-400 mt-1 flex items-center gap-1.5">
            <Layers className="h-5 w-5" />
            <span>{uniqueAreas.length}</span>
          </div>
        </div>
      </div>

      {/* ================= ABA 1: VIZINHOS & ADJACÊNCIAS ================= */}
      {(activeSubTab === 'neighbors' || !activeSubTab) && (
        <div className="space-y-4">
          {/* Search Input & Actions */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="relative w-full sm:w-80">
              <Search className="h-4 w-4 text-slate-500 absolute left-3 top-2.5" />
              <input
                type="text"
                placeholder="Buscar por Router-ID, IP, interface, área..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-3 py-1.5 bg-slate-950/80 border border-slate-700/80 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            <div className="flex items-center gap-3">
              {onSelectSubTab && (
                <button
                  onClick={() => onSelectSubTab('diagnostics')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 text-xs transition cursor-pointer"
                >
                  <Terminal className="h-3.5 w-3.5 text-cyan-400" />
                  <span>Comandos CLI OSPF</span>
                </button>
              )}

              <span className="text-xs text-slate-400">
                Exibindo <span className="font-semibold text-white">{filteredNeighbors.length}</span> de {neighbors.length} vizinhos
              </span>
            </div>
          </div>

          {/* Neighbors Table */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            {filteredNeighbors.length === 0 ? (
              <div className="p-12 text-center text-slate-500 text-sm">
                {loading
                  ? 'Conectando via SSH e buscando vizinhos OSPF nos roteadores...'
                  : 'Nenhum vizinho OSPF encontrado para os filtros selecionados.'}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                    <tr>
                      <th className={`${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'} font-medium`}>Equipamento</th>
                      <th className={`${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'} font-medium`}>Router ID Vizinho</th>
                      <th className={`${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'} font-medium`}>Endereço IP</th>
                      <th className={`${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'} font-medium`}>Interface</th>
                      <th className={`${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'} font-medium`}>Área OSPF</th>
                      <th className={`${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'} font-medium`}>Papel</th>
                      <th className={`${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'} font-medium`}>Estado</th>
                      <th className={`${density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'} font-medium text-right`}>CLI</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/40 text-slate-300">
                    {filteredNeighbors.map((n, idx) => {
                      const isFull = n.state.toLowerCase().includes('full')
                      const cellClass = density === 'compact' ? 'py-1.5 px-3' : 'py-2.5 px-4'
                      return (
                        <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                          <td className={`${cellClass} font-medium text-slate-200 whitespace-nowrap`}>
                            <div className="flex items-center gap-1.5">
                              <Server className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                              <span>{n.device_name}</span>
                            </div>
                          </td>

                          <td className={`${cellClass} font-mono font-medium text-slate-100 whitespace-nowrap`}>
                            {n.neighbor_id}
                          </td>

                          <td className={`${cellClass} font-mono text-cyan-300 whitespace-nowrap`}>
                            {n.ip}
                          </td>

                          <td className={`${cellClass} font-mono text-slate-300 whitespace-nowrap`}>
                            {n.interface}
                          </td>

                          <td className={`${cellClass} font-mono text-slate-400 whitespace-nowrap`}>
                            <button
                              onClick={() => onSelectSubTab?.('areas')}
                              className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-950 border border-slate-800 text-cyan-300 hover:border-cyan-500/50 cursor-pointer"
                              title="Ver detalhes da área"
                            >
                              {n.area}
                            </button>
                          </td>

                          <td className={`${cellClass} whitespace-nowrap`}>
                            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                              {n.role || '-'}
                            </span>
                          </td>

                          <td className={`${cellClass} whitespace-nowrap`}>
                            {isFull ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                                <CheckCircle2 className="h-3 w-3" /> {n.state}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                <AlertCircle className="h-3 w-3" /> {n.state}
                              </span>
                            )}
                          </td>

                          <td className={`${cellClass} text-right whitespace-nowrap`}>
                            {n.raw_output && (
                              <button
                                onClick={() => setModalNeighbor(n)}
                                className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded transition-colors cursor-pointer"
                                title="Ver linha original da CLI"
                              >
                                <FileText className="h-4 w-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ================= ABA 2: ÁREAS & TOPOLOGIA ================= */}
      {activeSubTab === 'areas' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left 2 Cols: Area Cards */}
            <div className="lg:col-span-2 space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Layers className="h-4 w-4 text-cyan-400" />
                <span>Distribuição Topológica por Área OSPF</span>
              </h3>

              {areaGroups.length === 0 ? (
                <div className="p-8 bg-slate-900/40 border border-slate-800 rounded-xl text-center text-slate-500 text-xs">
                  Nenhuma área OSPF identificada nos roteadores consultados.
                </div>
              ) : (
                <div className="space-y-3">
                  {areaGroups.map((grp) => (
                    <div
                      key={grp.areaId}
                      className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 hover:border-slate-700 transition"
                    >
                      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-3">
                        <div className="flex items-center gap-2">
                          <span className={`px-2.5 py-0.5 rounded-md text-xs font-mono font-bold ${
                            grp.isBackbone
                              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                              : 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                          }`}>
                            Área {grp.areaId}
                          </span>
                          {grp.isBackbone && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-cyan-950 text-cyan-400 border border-cyan-800">
                              Backbone Area (Área 0)
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-3 text-xs">
                          <span className="text-slate-400">
                            Adjacências: <strong className="text-white">{grp.totalCount}</strong>
                          </span>
                          <span className="text-emerald-400 font-medium">
                            {grp.fullCount} FULL
                          </span>
                        </div>
                      </div>

                      <div className="pt-3 grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-[11px] font-medium text-slate-400 block mb-1">
                            Roteadores Participantes:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {grp.routers.map((r, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded bg-slate-950 text-slate-300 border border-slate-800 font-mono text-[11px]"
                              >
                                {r}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div>
                          <span className="text-[11px] font-medium text-slate-400 block mb-1">
                            Interfaces do Enlace:
                          </span>
                          <div className="flex flex-wrap gap-1.5">
                            {grp.interfaces.map((intf, i) => (
                              <span
                                key={i}
                                className="px-2 py-0.5 rounded bg-slate-800/60 text-cyan-300 border border-slate-700/60 font-mono text-[11px]"
                              >
                                {intf}
                              </span>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Right Col: OSPF Architecture Guide */}
            <div className="space-y-4">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Info className="h-4 w-4 text-cyan-400" />
                <span>Hierarquia & Tipos de Área OSPF</span>
              </h3>

              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 space-y-3 text-xs text-slate-300">
                <div className="p-2.5 rounded-lg bg-cyan-950/40 border border-cyan-800/50">
                  <div className="font-semibold text-cyan-300">Área 0.0.0.0 (Backbone)</div>
                  <p className="text-[11px] text-slate-300 mt-1">
                    Núcleo obrigatório do domínio IGP. Todas as sub-áreas devem manter adjacência física ou via Virtual-Link com o Backbone para evitar laços de roteamento.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="font-semibold text-white">Área Standard (Normal)</div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Aceita todos os anúncios LSA (LSA 1/2 intra-área, LSA 3 inter-área de ABRs e LSA 4/5 externas de ASBRs BGP).
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="font-semibold text-white">Área Stub & Totally Stub</div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Bloqueia LSAs externas (Tipo 5), injetando rota padrão default <code className="text-cyan-300">0.0.0.0/0</code> para economizar memória e ciclos de CPU.
                  </p>
                </div>

                <div className="p-2.5 rounded-lg bg-slate-950/60 border border-slate-800">
                  <div className="font-semibold text-white">Área NSSA (Not-So-Stubby)</div>
                  <p className="text-[11px] text-slate-400 mt-1">
                    Permite injeção de rotas externas locais via LSA Tipo 7, as quais o ABR traduz para LSA Tipo 5 ao propagar para o Backbone.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ================= ABA 3: DIAGNÓSTICOS & CLI ================= */}
      {activeSubTab === 'diagnostics' && (
        <div className="space-y-6">
          {/* Vendor Selector Pill Bar */}
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
            <span className="text-xs text-slate-400 mr-2 font-medium">Fabricante:</span>
            {(Object.keys(vendorCommands) as Array<keyof typeof vendorCommands>).map((vKey) => (
              <button
                key={vKey}
                onClick={() => setSelectedVendor(vKey as any)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer ${
                  selectedVendor === vKey
                    ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                    : 'bg-slate-800/80 text-slate-400 hover:text-white hover:bg-slate-700'
                }`}
              >
                {vendorCommands[vKey].label.split(' ')[0]}
              </button>
            ))}
          </div>

          {/* Current Vendor Title */}
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Terminal className="h-4 w-4 text-cyan-400" />
              <span>{vendorCommands[selectedVendor].label}</span>
            </h3>
            <span className="text-xs text-slate-400">
              {vendorCommands[selectedVendor].commands.length} comandos de verificação
            </span>
          </div>

          {/* Commands Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {vendorCommands[selectedVendor].commands.map((cmdItem, idx) => {
              const isCopied = copiedCommand === cmdItem.command
              return (
                <div
                  key={idx}
                  className="bg-slate-900/60 border border-slate-800 rounded-xl p-4 flex flex-col justify-between hover:border-slate-700 transition"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-xs text-white">{cmdItem.name}</span>
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                        cmdItem.purpose === 'troubleshooting'
                          ? 'bg-rose-950 text-rose-300 border border-rose-800'
                          : cmdItem.purpose === 'routing'
                          ? 'bg-blue-950 text-blue-300 border border-blue-800'
                          : cmdItem.purpose === 'database'
                          ? 'bg-purple-950 text-purple-300 border border-purple-800'
                          : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                      }`}>
                        {cmdItem.purpose.toUpperCase()}
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 mt-1.5 leading-relaxed">
                      {cmdItem.description}
                    </p>
                  </div>

                  <div className="mt-3 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2 bg-slate-950/60 -mx-4 -mb-4 px-4 py-2.5 rounded-b-xl">
                    <code className="text-xs font-mono text-cyan-300 truncate">
                      {cmdItem.command}
                    </code>
                    <button
                      onClick={() => handleCopyCommand(cmdItem.command)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer shrink-0 ${
                        isCopied
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                      }`}
                      title="Copiar comando CLI"
                    >
                      {isCopied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      <span>{isCopied ? 'Copiado!' : 'Copiar'}</span>
                    </button>
                  </div>
                </div>
              )
            })}
          </div>

          {/* OSPF Troubleshooting Common Causes */}
          <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Checklist de Troubleshooting OSPF (Problemas Frequentes)</span>
            </h4>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                <span className="font-semibold text-amber-300 block mb-1">
                  1. Vizinho travado em ExStart / Exchange:
                </span>
                <p className="text-slate-400 text-[11px]">
                  Causa quase universal: <strong>MTU divergente</strong> no enlace. OSPF rejeita DBDs se o MTU não coincidir. Solução: nivelar MTU na interface ou utilizar <code className="text-cyan-300">ospf mtu-ignore</code>.
                </p>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                <span className="font-semibold text-amber-300 block mb-1">
                  2. Conflito de Router-ID:
                </span>
                <p className="text-slate-400 text-[11px]">
                  Dois roteadores no mesmo domínio configurados com o mesmo Router-ID geram rejeição mútua de LSAs. Use o IP da Loopback0 como Router-ID unívoco.
                </p>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                <span className="font-semibold text-amber-300 block mb-1">
                  3. Incompatibilidade de Timers (Hello / Dead):
                </span>
                <p className="text-slate-400 text-[11px]">
                  Os temporizadores de Hello (padrão 10s) e Dead (padrão 40s) devem coincidir exatamente em ambas as pontas do enlace para formação da adjacência.
                </p>
              </div>

              <div className="p-3 bg-slate-950/60 border border-slate-800 rounded-lg">
                <span className="font-semibold text-amber-300 block mb-1">
                  4. Máscara de Sub-rede ou Área Incompatível:
                </span>
                <p className="text-slate-400 text-[11px]">
                  Em redes do tipo Broadcast/Ethernet, os pacotes Hello verificam a máscara da sub-rede. Se diferir, o vizinho não sai do estado Init.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Raw Output Modal */}
      {modalNeighbor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-cyan-400" />
                <span className="font-semibold text-sm text-slate-200">
                  Saída CLI OSPF &bull; {modalNeighbor.device_name} (Neighbor: {modalNeighbor.neighbor_id})
                </span>
              </div>
              <button
                onClick={() => setModalNeighbor(null)}
                className="text-slate-400 hover:text-slate-200 text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="p-4 bg-slate-950 overflow-x-auto">
              <pre className="font-mono text-xs text-emerald-400 whitespace-pre-wrap">
                {modalNeighbor.raw_output}
              </pre>
            </div>
            <div className="p-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setModalNeighbor(null)}
                className="px-4 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded-lg cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
