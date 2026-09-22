import React, { useState, useEffect, useRef } from 'react'
import { Activity, Play, Square, Clock, ArrowUpRight, CheckCircle2, XCircle, RotateCcw } from 'lucide-react'
import { sendPing, type PingResponse } from '../services/api'

interface PingHistoryItem extends PingResponse {
  timestamp: string
}

const PRESETS = [
  { label: 'Google DNS', host: '8.8.8.8' },
  { label: 'Cloudflare', host: '1.1.1.1' },
  { label: 'Localhost', host: '127.0.0.1' },
  { label: 'GitHub', host: 'github.com' },
  { label: 'OpenDNS', host: '208.67.222.222' },
]

export const PingTool: React.FC = () => {
  const [host, setHost] = useState('8.8.8.8')
  const [port, setPort] = useState('')
  const [history, setHistory] = useState<PingHistoryItem[]>([])
  const [isRunning, setIsRunning] = useState(false)
  const [continuous, setContinuous] = useState(false)
  const intervalRef = useRef<any>(null)

  const executePing = async () => {
    if (!host.trim()) return
    setIsRunning(true)
    try {
      const portNum = port.trim() ? parseInt(port.trim(), 10) : undefined
      const res = await sendPing({ host: host.trim(), port: portNum })
      const item: PingHistoryItem = {
        ...res,
        timestamp: new Date().toLocaleTimeString(),
      }
      setHistory((prev) => [item, ...prev.slice(0, 49)]) // Keep last 50
    } catch (err: any) {
      setHistory((prev) => [
        {
          host,
          ip: '-',
          success: false,
          latency_ms: 0,
          message: err.message || 'Falha na conexão',
          method: 'error',
          timestamp: new Date().toLocaleTimeString(),
        },
        ...prev.slice(0, 49),
      ])
    } finally {
      setIsRunning(false)
    }
  }

  // Handle continuous ping
  useEffect(() => {
    if (continuous) {
      executePing()
      intervalRef.current = setInterval(() => {
        executePing()
      }, 1500)
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
        intervalRef.current = null
      }
    }
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [continuous, host, port])

  const clearHistory = () => setHistory([])

  // Statistics calculation
  const totalPings = history.length
  const successfulPings = history.filter((h) => h.success).length
  const packetLoss = totalPings > 0 ? (((totalPings - successfulPings) / totalPings) * 100).toFixed(0) : '0'
  const avgLatency =
    successfulPings > 0
      ? (
          history.filter((h) => h.success).reduce((acc, curr) => acc + curr.latency_ms, 0) /
          successfulPings
        ).toFixed(1)
      : '0'

  return (
    <div className="space-y-6">
      {/* Top Controller Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold">
            <Activity className="h-5 w-5" />
            <span>Diagnóstico de Latência (Ping ICMP / TCP)</span>
          </div>
          {/* Quick Presets */}
          <div className="hidden md:flex items-center gap-2">
            <span className="text-xs text-slate-400">Atalhos rápidos:</span>
            {PRESETS.map((p) => (
              <button
                key={p.host}
                onClick={() => {
                  setHost(p.host)
                  setPort('')
                }}
                className={`text-xs px-2.5 py-1 rounded transition-colors cursor-pointer ${
                  host === p.host
                    ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
          <div className="md:col-span-6">
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Host ou Endereço IP
            </label>
            <input
              type="text"
              value={host}
              onChange={(e) => setHost(e.target.value)}
              placeholder="ex: 8.8.8.8 ou google.com"
              className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
              disabled={continuous}
            />
          </div>

          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-slate-400 mb-1">
              Porta TCP (Opcional)
            </label>
            <input
              type="number"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="ex: 80, 443"
              className="w-full px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
              disabled={continuous}
            />
          </div>

          <div className="md:col-span-4 flex items-center gap-2">
            {!continuous ? (
              <button
                onClick={executePing}
                disabled={isRunning}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-lg shadow-md shadow-cyan-600/20 text-sm transition-all cursor-pointer disabled:opacity-50"
              >
                <Play className="h-4 w-4" />
                <span>{isRunning ? 'Disparando...' : 'Enviar Ping'}</span>
              </button>
            ) : null}

            <button
              onClick={() => setContinuous(!continuous)}
              className={`flex items-center justify-center gap-2 px-4 py-2.5 font-medium rounded-lg text-sm transition-all cursor-pointer ${
                continuous
                  ? 'bg-rose-600 hover:bg-rose-500 text-white shadow-md shadow-rose-600/30'
                  : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
              }`}
            >
              {continuous ? (
                <>
                  <Square className="h-4 w-4 fill-white" />
                  <span>Parar</span>
                </>
              ) : (
                <>
                  <Clock className="h-4 w-4" />
                  <span>Contínuo</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Metrics Summary Cards */}
      {totalPings > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4">
            <span className="text-xs text-slate-400 font-medium">Total de Pacotes</span>
            <div className="text-2xl font-bold text-slate-100 mt-1">{totalPings}</div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4">
            <span className="text-xs text-slate-400 font-medium">Latência Média</span>
            <div className="text-2xl font-bold text-cyan-400 mt-1">{avgLatency} ms</div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4">
            <span className="text-xs text-slate-400 font-medium">Perda de Pacotes</span>
            <div className={`text-2xl font-bold mt-1 ${packetLoss === '0' ? 'text-emerald-400' : 'text-rose-400'}`}>
              {packetLoss}%
            </div>
          </div>
          <div className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4">
            <span className="text-xs text-slate-400 font-medium">Status do Alvo</span>
            <div className="text-lg font-bold text-slate-100 mt-1 flex items-center gap-1.5 truncate">
              {history[0]?.success ? (
                <span className="text-emerald-400 flex items-center gap-1">
                  <CheckCircle2 className="h-4 w-4" /> {history[0].ip || 'UP'}
                </span>
              ) : (
                <span className="text-rose-400 flex items-center gap-1">
                  <XCircle className="h-4 w-4" /> INALCANÇÁVEL
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Ping Results History Table */}
      <div className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden shadow-lg">
        <div className="p-4 border-b border-slate-800/80 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-200">
            <ArrowUpRight className="h-4 w-4 text-cyan-400" />
            <span>Histórico de Respostas ({history.length})</span>
          </div>
          {history.length > 0 && (
            <button
              onClick={clearHistory}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Limpar</span>
            </button>
          )}
        </div>

        {history.length === 0 ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Nenhum ping disparado ainda. Insira um host ou selecione um atalho acima e clique em &quot;Enviar Ping&quot;.
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[380px] overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-950/60 text-slate-400 sticky top-0 uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-2.5 px-4 font-medium">Hora</th>
                  <th className="py-2.5 px-4 font-medium">Host / IP</th>
                  <th className="py-2.5 px-4 font-medium">Status</th>
                  <th className="py-2.5 px-4 font-medium">Latência</th>
                  <th className="py-2.5 px-4 font-medium">Método</th>
                  <th className="py-2.5 px-4 font-medium">Mensagem</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-slate-300">
                {history.map((item, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-2 px-4 text-slate-400 whitespace-nowrap font-mono">{item.timestamp}</td>
                    <td className="py-2 px-4 whitespace-nowrap font-mono">
                      <span className="text-slate-200">{item.host}</span>
                      {item.ip && item.ip !== item.host && (
                        <span className="text-slate-500 ml-1.5">({item.ip})</span>
                      )}
                    </td>
                    <td className="py-2 px-4 whitespace-nowrap">
                      {item.success ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <CheckCircle2 className="h-3 w-3" /> UP
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
                          <XCircle className="h-3 w-3" /> TIMEOUT
                        </span>
                      )}
                    </td>
                    <td className="py-2 px-4 whitespace-nowrap font-mono font-medium">
                      {item.success ? (
                        <span
                          className={
                            item.latency_ms < 50
                              ? 'text-emerald-400'
                              : item.latency_ms < 150
                              ? 'text-yellow-400'
                              : 'text-amber-400'
                          }
                        >
                          {item.latency_ms.toFixed(1)} ms
                        </span>
                      ) : (
                        <span className="text-slate-500">-</span>
                      )}
                    </td>
                    <td className="py-2 px-4 whitespace-nowrap uppercase font-mono text-[10px] text-slate-400">
                      {item.method}
                    </td>
                    <td className="py-2 px-4 text-slate-400 truncate max-w-xs">{item.message}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
