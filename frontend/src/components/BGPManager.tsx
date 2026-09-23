import React, { useState, useEffect } from 'react'
import {
  Activity,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Filter,
  Server
} from 'lucide-react'
import {
  fetchDevices,
  fetchAllBGP,
  fetchDeviceBGP,
  type Device,
  type BGPSession
} from '../services/api'
import { TableRowSkeleton } from './common/Skeleton'

export const BGPManager: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all')
  const [sessions, setSessions] = useState<BGPSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filters & Search
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'established' | 'down'>('all')

  // Raw output modal
  const [modalSession, setModalSession] = useState<BGPSession | null>(null)

  const loadInitialData = async () => {
    try {
      const devs = await fetchDevices()
      setDevices(devs)
    } catch {
      // ignore
    }
    loadBGPSessions('all')
  }

  const loadBGPSessions = async (devId: string, fresh = false) => {
    setLoading(true)
    setError(null)
    try {
      if (devId === 'all') {
        const data = await fetchAllBGP(fresh)
        setSessions(data || [])
      } else {
        const data = await fetchDeviceBGP(devId, fresh)
        setSessions(data || [])
      }
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar sessões BGP')
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadInitialData()
  }, [])

  const handleDeviceChange = (devId: string) => {
    setSelectedDeviceId(devId)
    loadBGPSessions(devId)
  }

  // Filtered Sessions
  const filteredSessions = sessions.filter((s) => {
    const q = search.toLowerCase()
    const matchesSearch =
      s.peer_ip.toLowerCase().includes(q) ||
      s.remote_as.toLowerCase().includes(q) ||
      s.device_name.toLowerCase().includes(q) ||
      (s.description && s.description.toLowerCase().includes(q))

    if (!matchesSearch) return false

    const isEstablished = s.state.toLowerCase() === 'established'
    if (statusFilter === 'established') return isEstablished
    if (statusFilter === 'down') return !isEstablished
    return true
  })

  // Summary Metrics
  const totalSessions = sessions.length
  const establishedSessions = sessions.filter((s) => s.state.toLowerCase() === 'established').length
  const downSessions = totalSessions - establishedSessions
  const totalPrefixes = sessions.reduce((acc, curr) => acc + (curr.prefixes_received || 0), 0)

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Activity className="h-5 w-5 text-cyan-400" />
            <span>Gerenciador de Sessões BGP</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Monitoramento de peers, estados da FSM, ASNs e contadores de prefixos via SSH
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
              <option value="all">Todos os Equipamentos ({devices.length})</option>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.vendor})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={() => loadBGPSessions(selectedDeviceId, true)}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Atualizar BGP</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800 text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* Metrics Summary */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-400 font-medium">Total de Peers BGP</span>
          <div className="text-2xl font-bold text-slate-100 mt-1">{totalSessions}</div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-400 font-medium">Sessões Estabelecidas</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
            <CheckCircle2 className="h-5 w-5" />
            <span>{establishedSessions}</span>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-400 font-medium">Sessões em Queda / Alerta</span>
          <div className={`text-2xl font-bold mt-1 flex items-center gap-1.5 ${downSessions > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
            <AlertTriangle className="h-5 w-5" />
            <span>{downSessions}</span>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-400 font-medium">Total de Prefixos Recebidos</span>
          <div className="text-2xl font-bold text-cyan-400 mt-1">
            {totalPrefixes.toLocaleString()}
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/30 p-3 rounded-xl border border-slate-800/80">
        <div className="relative w-full sm:w-80">
          <Search className="h-4 w-4 text-slate-500 absolute left-3 top-2.5" />
          <input
            type="text"
            placeholder="Buscar por IP, AS, roteador..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950/80 border border-slate-700/80 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
          />
        </div>

        {/* Status Filters */}
        <div className="flex items-center gap-1.5 self-end sm:self-center">
          <Filter className="h-3.5 w-3.5 text-slate-500 mr-1" />
          {[
            { id: 'all', label: 'Todas' },
            { id: 'established', label: 'Estabelecidas' },
            { id: 'down', label: 'Caídas / Idle' },
          ].map((btn) => (
            <button
              key={btn.id}
              onClick={() => setStatusFilter(btn.id as any)}
              className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                statusFilter === btn.id
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                  : 'bg-slate-800 text-slate-400 hover:text-slate-200'
              }`}
            >
              {btn.label}
            </button>
          ))}
        </div>
      </div>

      {/* Sessions Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        {loading && sessions.length === 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Equipamento</th>
                  <th className="py-3 px-4 font-medium">Peer BGP</th>
                  <th className="py-3 px-4 font-medium">AS Remoto</th>
                  <th className="py-3 px-4 font-medium">Estado</th>
                  <th className="py-3 px-4 font-medium">Uptime</th>
                  <th className="py-3 px-4 font-medium">Prefixos</th>
                  <th className="py-3 px-4 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-slate-300">
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRowSkeleton key={i} columns={7} />
                ))}
              </tbody>
            </table>
          </div>
        ) : filteredSessions.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Nenhuma sessão BGP encontrada para os critérios selecionados.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Equipamento</th>
                  <th className="py-3 px-4 font-medium">Peer BGP</th>
                  <th className="py-3 px-4 font-medium">AS Remoto</th>
                  <th className="py-3 px-4 font-medium">Estado</th>
                  <th className="py-3 px-4 font-medium">Uptime</th>
                  <th className="py-3 px-4 font-medium">Prefixos</th>
                  <th className="py-3 px-4 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-slate-300">
                {filteredSessions.map((session, idx) => {
                  const isEstablished = session.state.toLowerCase() === 'established'
                  return (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-slate-200 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Server className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          <span>{session.device_name}</span>
                        </div>
                      </td>

                      <td className="py-2.5 px-4 font-mono font-medium whitespace-nowrap">
                        <div className="text-slate-100">{session.peer_ip}</div>
                        {session.description && (
                          <div className="text-[10px] text-slate-500 font-sans">{session.description}</div>
                        )}
                      </td>

                      <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                        <span className="text-cyan-300">AS{session.remote_as}</span>
                        {session.local_as && (
                          <span className="text-slate-500 text-[10px] ml-1.5">(local: AS{session.local_as})</span>
                        )}
                      </td>

                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {isEstablished ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" /> Established
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                            <AlertTriangle className="h-3 w-3" /> {session.state}
                          </span>
                        )}
                      </td>

                      <td className="py-2.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                        {session.uptime}
                      </td>

                      <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                        <span
                          className={`font-semibold ${
                            session.prefixes_received > 0 ? 'text-cyan-300' : 'text-slate-500'
                          }`}
                        >
                          {session.prefixes_received.toLocaleString()}
                        </span>
                      </td>

                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        {session.raw_output && (
                          <button
                            onClick={() => setModalSession(session)}
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

      {/* Raw Output Modal */}
      {modalSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-cyan-400" />
                <span className="font-semibold text-sm text-slate-200">
                  Saída CLI BGP &bull; {modalSession.device_name} ({modalSession.peer_ip})
                </span>
              </div>
              <button
                onClick={() => setModalSession(null)}
                className="text-slate-400 hover:text-slate-200 text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>
            <div className="p-4 bg-slate-950 overflow-x-auto">
              <pre className="font-mono text-xs text-emerald-400 whitespace-pre-wrap">
                {modalSession.raw_output}
              </pre>
            </div>
            <div className="p-3 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setModalSession(null)}
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
