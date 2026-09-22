import React, { useState } from 'react'
import { Server, Search, CheckCircle2, XCircle, ShieldCheck } from 'lucide-react'
import { scanPorts, type PortScanResponse } from '../services/api'

const COMMON_PORT_PRESETS = [
  { label: 'Web & Proxies (80, 443, 8080, 8443)', ports: [80, 443, 8080, 8443] },
  { label: 'Acesso Remoto (21, 22, 23, 3389)', ports: [21, 22, 23, 3389] },
  { label: 'Bancos de Dados (3306, 5432, 1433, 6379)', ports: [3306, 5432, 1433, 6379] },
  { label: 'Portas Padrão (Top 17)', ports: [21, 22, 23, 25, 53, 80, 110, 143, 443, 445, 1433, 3306, 3389, 5432, 6379, 8080, 8443] },
]

export const PortScanner: React.FC = () => {
  const [host, setHost] = useState('127.0.0.1')
  const [portInput, setPortInput] = useState('80, 443, 3000, 5173, 8080')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<PortScanResponse | null>(null)
  const [filterOnlyOpen, setFilterOnlyOpen] = useState(false)

  const handleScan = async () => {
    if (!host.trim()) return
    setLoading(true)

    // Parse ports
    const parsedPorts = portInput
      .split(',')
      .map((p) => parseInt(p.trim(), 10))
      .filter((p) => !isNaN(p) && p > 0 && p <= 65535)

    try {
      const res = await scanPorts(host.trim(), parsedPorts.length > 0 ? parsedPorts : undefined)
      setResult(res)
    } catch (err: any) {
      alert(err.message || 'Erro ao escanear portas')
    } finally {
      setLoading(false)
    }
  }

  const displayedResults = result?.results.filter((r) => (!filterOnlyOpen ? true : r.is_open)) || []

  return (
    <div className="space-y-6">
      {/* Scanner Control Box */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold">
            <Server className="h-5 w-5" />
            <span>Scanner de Portas TCP</span>
          </div>
          <span className="text-xs text-slate-400">Varredura concorrente em Go</span>
        </div>

        {/* Presets */}
        <div className="flex flex-wrap gap-2 mb-4">
          <span className="text-xs text-slate-400 self-center">Predefinições:</span>
          {COMMON_PORT_PRESETS.map((preset, idx) => (
            <button
              key={idx}
              onClick={() => setPortInput(preset.ports.join(', '))}
              className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700/60 transition-colors cursor-pointer"
            >
              {preset.label}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-4">
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Host ou IP de Destino
            </label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="ex: 127.0.0.1 ou scanme.nmap.org"
              className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
            />
          </div>

          <div className="md:col-span-5">
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Portas a Escanear (separadas por vírgula)
            </label>
            <input
              type="text"
              value={portInput}
              onChange={(e) => setPortInput(e.target.value)}
              placeholder="80, 443, 8080..."
              className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
            />
          </div>

          <div className="md:col-span-3">
            <button
              onClick={handleScan}
              disabled={loading}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-lg shadow-md shadow-cyan-600/20 text-sm transition-all cursor-pointer disabled:opacity-50"
            >
              <Search className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              <span>{loading ? 'Escaneando...' : 'Iniciar Scan'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Results View */}
      {result && (
        <div className="space-y-4">
          {/* Summary Badges */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-400">Alvo Escaneado</span>
              <div className="text-lg font-bold text-slate-100 mt-1 truncate">{result.host}</div>
              <span className="text-[11px] text-slate-400 font-mono">{result.ip}</span>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-400">Portas Abertas</span>
              <div className="text-2xl font-bold text-emerald-400 mt-1">
                {result.open_ports} / {result.total_ports}
              </div>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4">
              <span className="text-xs text-slate-400">Tempo de Varredura</span>
              <div className="text-2xl font-bold text-cyan-400 mt-1">
                {result.duration_ms.toFixed(0)} ms
              </div>
            </div>
            <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 flex flex-col justify-between">
              <span className="text-xs text-slate-400">Filtrar Abertas</span>
              <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer mt-2">
                <input
                  type="checkbox"
                  checked={filterOnlyOpen}
                  onChange={(e) => setFilterOnlyOpen(e.target.checked)}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 cursor-pointer"
                />
                <span>Exibir apenas portas abertas</span>
              </label>
            </div>
          </div>

          {/* Results Table */}
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
            <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
              <span className="text-sm font-semibold text-slate-200 flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-cyan-400" />
                <span>Resultados ({displayedResults.length})</span>
              </span>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-950/60 text-slate-400 uppercase tracking-wider text-[11px]">
                  <tr>
                    <th className="py-2.5 px-4 font-medium">Porta</th>
                    <th className="py-2.5 px-4 font-medium">Serviço Provável</th>
                    <th className="py-2.5 px-4 font-medium">Estado</th>
                    <th className="py-2.5 px-4 font-medium">Latência de Resposta</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/40 text-slate-300">
                  {displayedResults.map((p) => (
                    <tr key={p.port} className="hover:bg-slate-800/30 transition-colors">
                      <td className="py-2 px-4 font-mono font-semibold text-slate-200">{p.port}</td>
                      <td className="py-2 px-4 font-medium text-slate-400">{p.service}</td>
                      <td className="py-2 px-4">
                        {p.is_open ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="h-3 w-3" /> ABERTA
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-500 border border-slate-700">
                            <XCircle className="h-3 w-3" /> FECHADA
                          </span>
                        )}
                      </td>
                      <td className="py-2 px-4 font-mono text-slate-400">
                        {p.latency_ms > 0 ? `${p.latency_ms.toFixed(1)} ms` : '-'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
