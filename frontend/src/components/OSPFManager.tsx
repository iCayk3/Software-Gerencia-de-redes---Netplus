import React, { useState, useEffect } from 'react'
import {
  Network,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertCircle,
  FileText,
  Server
} from 'lucide-react'
import {
  fetchDevices,
  fetchAllOSPF,
  fetchDeviceOSPF,
  type Device,
  type OSPFNeighbor
} from '../services/api'

export const OSPFManager: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all')
  const [neighbors, setNeighbors] = useState<OSPFNeighbor[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [modalNeighbor, setModalNeighbor] = useState<OSPFNeighbor | null>(null)

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
  const uniqueAreas = new Set(neighbors.map((n) => n.area)).size

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Network className="h-5 w-5 text-cyan-400" />
            <span>Gerenciador de Vizinhanças OSPF</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Inspeção de adjacências OSPF, papéis DR/BDR, estados e interfaces de rede via SSH
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
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800 text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* Metrics Summary */}
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

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-400 font-medium">Áreas Detectadas</span>
          <div className="text-2xl font-bold text-cyan-400 mt-1">{uniqueAreas}</div>
        </div>
      </div>

      {/* Search Input */}
      <div className="relative w-full sm:w-80">
        <Search className="h-4 w-4 text-slate-500 absolute left-3 top-2.5" />
        <input
          type="text"
          placeholder="Buscar por Router-ID, IP, interface..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full pl-9 pr-3 py-1.5 bg-slate-950/80 border border-slate-700/80 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
        />
      </div>

      {/* Neighbors Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        {filteredNeighbors.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            {loading
              ? 'Conectando via SSH e buscando vizinhos OSPF...'
              : 'Nenhum vizinho OSPF encontrado.'}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px] border-b border-slate-800">
                <tr>
                  <th className="py-3 px-4 font-medium">Equipamento</th>
                  <th className="py-3 px-4 font-medium">Router ID Vizinho</th>
                  <th className="py-3 px-4 font-medium">Endereço IP</th>
                  <th className="py-3 px-4 font-medium">Interface</th>
                  <th className="py-3 px-4 font-medium">Área</th>
                  <th className="py-3 px-4 font-medium">Papel</th>
                  <th className="py-3 px-4 font-medium">Estado</th>
                  <th className="py-3 px-4 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-slate-300">
                {filteredNeighbors.map((n, idx) => {
                  const isFull = n.state.toLowerCase().includes('full')
                  return (
                    <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-slate-200 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <Server className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                          <span>{n.device_name}</span>
                        </div>
                      </td>

                      <td className="py-2.5 px-4 font-mono font-medium text-slate-100 whitespace-nowrap">
                        {n.neighbor_id}
                      </td>

                      <td className="py-2.5 px-4 font-mono text-cyan-300 whitespace-nowrap">
                        {n.ip}
                      </td>

                      <td className="py-2.5 px-4 font-mono text-slate-300 whitespace-nowrap">
                        {n.interface}
                      </td>

                      <td className="py-2.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                        {n.area}
                      </td>

                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-slate-800 text-slate-300 border border-slate-700">
                          {n.role || '-'}
                        </span>
                      </td>

                      <td className="py-2.5 px-4 whitespace-nowrap">
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

                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
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
