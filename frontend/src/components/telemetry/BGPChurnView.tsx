import React, { useState, useEffect, useCallback } from 'react'
import {
  Activity,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  TrendingDown,
  Clock,
  Server,
  Zap,
  Flame,
  Search
} from 'lucide-react'
import {
  fetchBGPChurnRanking,
  type ChurnRankingResponse
} from '../../services/api'

interface BGPChurnViewProps {
  density?: 'comfortable' | 'compact'
}

export const BGPChurnView: React.FC<BGPChurnViewProps> = () => {
  const [churnData, setChurnData] = useState<ChurnRankingResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'unstable' | 'stable'>('all')
  const [error, setError] = useState<string | null>(null)

  const loadChurn = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const data = await fetchBGPChurnRanking()
      setChurnData(data)
      setError(null)
    } catch (err: any) {
      console.error('Erro ao carregar ranking de BGP Churn:', err)
      setError(err.message || 'Falha ao buscar ranking de oscilações BGP')
    } finally {
      setLoading(false)
      if (isManual) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadChurn()
    const timer = setInterval(() => loadChurn(), 10000)
    return () => clearInterval(timer)
  }, [loadChurn])

  const formatRelativeTime = (isoString?: string) => {
    if (!isoString) return 'Sem registro'
    const diff = Math.floor((new Date().getTime() - new Date(isoString).getTime()) / 1000)
    if (diff < 60) return `há ${diff}s`
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
    return `há ${Math.floor(diff / 3600)}h`
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'critical_flapping':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950/80 text-rose-400 border border-rose-800">
            <Flame className="h-3 w-3 text-rose-400 animate-pulse" />
            Flapping Crítico
          </span>
        )
      case 'high_churn':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-orange-950/80 text-orange-400 border border-orange-800">
            <AlertTriangle className="h-3 w-3 text-orange-400" />
            Alto Churn
          </span>
        )
      case 'moderate_churn':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-400 border border-amber-800">
            <TrendingDown className="h-3 w-3 text-amber-400" />
            Oscilação Moderada
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800">
            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
            Estável
          </span>
        )
    }
  }

  const getScoreColor = (score: number) => {
    if (score >= 95) return 'text-emerald-400 bg-emerald-500'
    if (score >= 80) return 'text-amber-400 bg-amber-500'
    if (score >= 60) return 'text-orange-400 bg-orange-500'
    return 'text-rose-400 bg-rose-500'
  }

  const filteredPeers = (churnData?.top_churners || []).filter((p) => {
    if (statusFilter === 'unstable' && p.status === 'stable') return false
    if (statusFilter === 'stable' && p.status !== 'stable') return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      p.peer_ip.toLowerCase().includes(q) ||
      p.peer_name.toLowerCase().includes(q) ||
      p.router_name.toLowerCase().includes(q) ||
      p.remote_as.toString().includes(q)
    )
  })

  // Calculate timeline max value for SVG graph
  const timeline = churnData?.timeline_aggregate || []
  const maxFluctuation = Math.max(
    ...timeline.map((t) => Math.max(t.withdrawn, t.announced)),
    10
  )

  if (loading && !churnData) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <Activity className="h-10 w-10 text-cyan-400 animate-spin" />
        <p className="text-slate-400 text-sm">Carregando métricas de oscilação BGP Churn...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400 shrink-0">
              <Activity className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white tracking-tight">Ranking de BGP Churn & Instabilidade</h2>
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-cyan-950 text-cyan-400 border border-cyan-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-cyan-400 animate-ping"></span>
                  BMP RFC 7854 Stream
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                <span>
                  Último cálculo: {churnData?.last_calculated ? new Date(churnData.last_calculated).toLocaleTimeString() : 'Aguardando...'}
                </span>
                <span>&bull;</span>
                <span>Rastreamento contínuo de Withdrawns e Flaps por hora</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadChurn(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white shadow-lg shadow-orange-600/20 disabled:opacity-50 transition cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Atualizando...' : 'Recalcular Agora'}</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-4 p-3 rounded-lg bg-rose-950/60 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-rose-400" />
            <span>{error}</span>
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Withdrawns 1h */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Withdrawns (Última 1h)</span>
            <TrendingDown className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${(churnData?.total_withdrawn_1h ?? 0) > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {(churnData?.total_withdrawn_1h ?? 0).toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">rotas retiradas</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">Oscilações recebidas de trânsitos/PTTs</p>
        </div>

        {/* Total Announced 1h */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Anúncios (Última 1h)</span>
            <Zap className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">
              {(churnData?.total_announced_1h ?? 0).toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">updates recebidos</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">Reinserções e novas rotas</p>
        </div>

        {/* Estabilidade Média */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Estabilidade Global</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${getScoreColor(churnData?.average_stability ?? 100).split(' ')[0]}`}>
              {(churnData?.average_stability ?? 100).toFixed(1)}%
            </span>
            <span className="text-xs text-slate-500">score BGP</span>
          </div>
          <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className={`h-1.5 rounded-full transition-all duration-500 ${getScoreColor(churnData?.average_stability ?? 100).split(' ')[1]}`}
              style={{ width: `${Math.min(100, Math.max(0, churnData?.average_stability ?? 100))}%` }}
            />
          </div>
        </div>

        {/* Top Churner / Vizinho Crítico */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Maior Flapping</span>
            <Flame className="h-4 w-4 text-amber-400" />
          </div>
          <div className="mt-2 truncate">
            {churnData?.top_churners && churnData.top_churners.length > 0 && churnData.top_churners[0].withdrawn_1h > 0 ? (
              <>
                <span className="text-lg font-bold text-rose-400 truncate block">
                  {churnData.top_churners[0].peer_name || churnData.top_churners[0].peer_ip}
                </span>
                <span className="text-xs text-slate-400">
                  {churnData.top_churners[0].withdrawn_1h} withdrawns/h ({churnData.top_churners[0].router_name})
                </span>
              </>
            ) : (
              <>
                <span className="text-lg font-bold text-emerald-400">Nenhum Flap</span>
                <span className="text-xs text-slate-500 block">Rede em estado ótimo</span>
              </>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-2">Vizinho com maior oscilação</p>
        </div>
      </div>

      {/* Linha do Tempo Agregada de Oscilações (60 Minutos) */}
      {timeline.length > 0 && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-orange-400" />
              <h3 className="text-sm font-semibold text-white">Oscilação de Rotas nos Últimos 60 Minutos (Withdrawns vs Anúncios)</h3>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-rose-400">
                <span className="h-2 w-2 rounded-xs bg-rose-500"></span>
                Withdrawns (Rotas Caídas)
              </span>
              <span className="flex items-center gap-1.5 text-cyan-400">
                <span className="h-2 w-2 rounded-xs bg-cyan-500"></span>
                Anúncios (Novas / Reinseridas)
              </span>
            </div>
          </div>

          <div className="h-32 w-full flex items-end gap-2 pt-4">
            {timeline.map((bucket, idx) => {
              const withPct = Math.max((bucket.withdrawn / maxFluctuation) * 100, 4)
              const annPct = Math.max((bucket.announced / maxFluctuation) * 100, 4)
              const timeLabel = new Date(bucket.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

              return (
                <div key={idx} className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end">
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                    <div className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded-lg p-2.5 shadow-xl whitespace-nowrap">
                      <p className="font-semibold text-white mb-1">{timeLabel}</p>
                      <p className="text-rose-400 font-mono">Withdrawns: {bucket.withdrawn}</p>
                      <p className="text-cyan-400 font-mono">Anúncios: {bucket.announced}</p>
                    </div>
                  </div>

                  {/* Dual Bar (Withdrawn and Announced) */}
                  <div className="w-full flex items-end justify-center gap-0.5 h-full">
                    {/* Withdrawn bar */}
                    <div
                      style={{ height: `${withPct}%` }}
                      className="w-1/2 bg-rose-500/80 hover:bg-rose-400 rounded-t transition-all"
                    />
                    {/* Announced bar */}
                    <div
                      style={{ height: `${annPct}%` }}
                      className="w-1/2 bg-cyan-500/60 hover:bg-cyan-400 rounded-t transition-all"
                    />
                  </div>
                  <span className="text-[10px] text-slate-500 truncate w-full text-center font-mono">
                    {timeLabel}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Ranking Table of Peers */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="font-bold text-white text-base">Classificação de Estabilidade por Vizinho BGP</h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Identificação de vizinhos com oscilações anormais e penalidade de flapping
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Buscar IP, ASN, nome..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 pr-3 py-1.5 bg-slate-950/80 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
              />
            </div>

            {/* Filter buttons */}
            <div className="flex items-center bg-slate-950/80 p-1 rounded-lg border border-slate-800 text-xs">
              <button
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1 rounded-md font-medium transition cursor-pointer ${
                  statusFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Todos ({churnData?.top_churners?.length || 0})
              </button>
              <button
                onClick={() => setStatusFilter('unstable')}
                className={`px-3 py-1 rounded-md font-medium transition cursor-pointer ${
                  statusFilter === 'unstable' ? 'bg-orange-950 text-orange-400 border border-orange-800' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Com Churn ({churnData?.top_churners?.filter((p) => p.status !== 'stable').length || 0})
              </button>
              <button
                onClick={() => setStatusFilter('stable')}
                className={`px-3 py-1 rounded-md font-medium transition cursor-pointer ${
                  statusFilter === 'stable' ? 'bg-emerald-950 text-emerald-400 border border-emerald-800' : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                Estáveis ({churnData?.top_churners?.filter((p) => p.status === 'stable').length || 0})
              </button>
            </div>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4 w-12 text-center">#</th>
                <th className="py-3 px-4">Vizinho BGP (Peer)</th>
                <th className="py-3 px-4">Roteador</th>
                <th className="py-3 px-4 text-center">Status de Estabilidade</th>
                <th className="py-3 px-4 text-right">Withdrawns (1h / 24h)</th>
                <th className="py-3 px-4 text-right">Anúncios (1h / 24h)</th>
                <th className="py-3 px-4 text-center">Score de Estabilidade</th>
                <th className="py-3 px-4 text-right">Último Flap</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-slate-300">
              {filteredPeers.length > 0 ? (
                filteredPeers.map((peer, idx) => {
                  const scoreColors = getScoreColor(peer.stability_score).split(' ')
                  const textColor = scoreColors[0]
                  const barColor = scoreColors[1]

                  return (
                    <tr key={`${peer.router_ip}-${peer.peer_ip}`} className="hover:bg-slate-800/30 transition-colors">
                      {/* Rank Position */}
                      <td className="py-3 px-4 text-center font-bold text-slate-400">
                        {idx + 1}
                      </td>

                      {/* Peer info */}
                      <td className="py-3 px-4">
                        <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                          <span>{peer.peer_name || peer.peer_ip}</span>
                          <span className="text-[10px] text-cyan-400 font-mono">AS{peer.remote_as}</span>
                        </div>
                        <div className="text-[11px] text-slate-500 font-mono mt-0.5">{peer.peer_ip}</div>
                      </td>

                      {/* Router */}
                      <td className="py-3 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 text-slate-300">
                          <Server className="h-3.5 w-3.5 text-cyan-400" />
                          <span>{peer.router_name || peer.router_ip}</span>
                        </div>
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        {getStatusBadge(peer.status)}
                      </td>

                      {/* Withdrawns */}
                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono">
                        <span className={`font-bold ${peer.withdrawn_1h > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                          {peer.withdrawn_1h.toLocaleString()}
                        </span>
                        <span className="text-slate-500 text-[10px] ml-1">/ {peer.withdrawn_24h.toLocaleString()}</span>
                      </td>

                      {/* Announced */}
                      <td className="py-3 px-4 text-right whitespace-nowrap font-mono">
                        <span className="text-slate-200">{peer.announced_1h.toLocaleString()}</span>
                        <span className="text-slate-500 text-[10px] ml-1">/ {peer.announced_24h.toLocaleString()}</span>
                      </td>

                      {/* Stability Score Bar */}
                      <td className="py-3 px-4 text-center whitespace-nowrap">
                        <div className="flex items-center justify-center gap-2">
                          <div className="w-20 bg-slate-800 rounded-full h-2 overflow-hidden">
                            <div
                              className={`h-2 rounded-full transition-all ${barColor}`}
                              style={{ width: `${peer.stability_score}%` }}
                            />
                          </div>
                          <span className={`font-mono font-bold text-xs ${textColor}`}>
                            {peer.stability_score.toFixed(1)}%
                          </span>
                        </div>
                      </td>

                      {/* Last Flap */}
                      <td className="py-3 px-4 text-right whitespace-nowrap text-slate-400 font-sans">
                        {peer.last_flap ? formatRelativeTime(peer.last_flap) : 'Nenhum recente'}
                      </td>
                    </tr>
                  )
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-slate-500">
                    Nenhum vizinho BGP corresponde aos filtros aplicados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
