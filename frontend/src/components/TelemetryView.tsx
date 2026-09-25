import React, { useState, useEffect, useCallback } from 'react'
import {
  Radio,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Activity,
  Server,
  Network,
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  ShieldCheck,
  Terminal,
  Zap,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CheckCheck,
  Copy,
  HelpCircle,
  Search,
  ArrowRight
} from 'lucide-react'
import {
  fetchTelemetryOverview,
  fetchTelemetryStatus,
  fetchAlerts,
  acknowledgeAlert,
  triggerTelemetryCollect,
  fetchTelemetryHistory,
  fetchBMPStatus,
  fetchBMPEvents,
  fetchBMPConfigGuide,
  fetchBGPChurnRanking,
  fetchRPKISummary,
  type TelemetryOverview,
  type TelemetryStatus,
  type Alert,
  type TelemetrySnapshot,
  type BMPStatus,
  type BMPEvent,
  type BMPConfigGuide,
  type ChurnRankingResponse,
  type RPKISummary
} from '../services/api'
import { MetricCardSkeleton } from './common/Skeleton'
import { BGPChurnView } from './telemetry/BGPChurnView'
import { RPKIValidatorView } from './telemetry/RPKIValidatorView'

export interface TelemetryViewProps {
  onAlertsUpdated?: (count: number) => void
  activeSubTab?: 'overview' | 'alerts' | 'churn' | 'rpki'
  onSelectSubTab?: (subTab: string) => void
}

export const TelemetryView: React.FC<TelemetryViewProps> = ({ onAlertsUpdated, activeSubTab, onSelectSubTab }) => {
  const [overview, setOverview] = useState<TelemetryOverview | null>(null)
  const [status, setStatus] = useState<TelemetryStatus | null>(null)
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [history, setHistory] = useState<TelemetrySnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [collecting, setCollecting] = useState(false)
  const [alertFilter, setAlertFilter] = useState<'active' | 'acknowledged' | 'resolved' | 'all'>('active')
  const [showSyslogGuide, setShowSyslogGuide] = useState(false)
  const [actionMessage, setActionMessage] = useState<string | null>(null)

  // BMP Telemetry State
  const [bmpStatus, setBmpStatus] = useState<BMPStatus | null>(null)
  const [bmpEvents, setBmpEvents] = useState<BMPEvent[]>([])
  const [showBMPGuide, setShowBMPGuide] = useState(false)
  const [bmpGuide, setBmpGuide] = useState<BMPConfigGuide | null>(null)
  const [selectedBMPVendor, setSelectedBMPVendor] = useState<'huawei' | 'mikrotik_v7' | 'cisco_iosxr' | 'juniper_junos'>('huawei')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  // BGP Churn & RPKI Summary State
  const [churnSummary, setChurnSummary] = useState<ChurnRankingResponse | null>(null)
  const [rpkiSummary, setRpkiSummary] = useState<RPKISummary | null>(null)

  // Estados de Paginação e Busca para a Central de Logs / Alertas
  const [currentPage, setCurrentPage] = useState<number>(1)
  const [pageSize, setPageSize] = useState<number>(10)
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [acknowledgingAll, setAcknowledgingAll] = useState<boolean>(false)

  const loadData = useCallback(async () => {
    try {
      const [ov, st, al, hist, bmp, events, churn, rpki] = await Promise.all([
        fetchTelemetryOverview(),
        fetchTelemetryStatus(),
        fetchAlerts('all'),
        fetchTelemetryHistory(20),
        fetchBMPStatus().catch(() => null),
        fetchBMPEvents(15).catch(() => []),
        fetchBGPChurnRanking().catch(() => null),
        fetchRPKISummary().catch(() => null)
      ])
      setOverview(ov)
      setStatus(st)
      setAlerts(al)
      setHistory(hist)
      setBmpStatus(bmp)
      setBmpEvents(events)
      setChurnSummary(churn)
      setRpkiSummary(rpki)

      const activeCount = al.filter(a => a.status === 'active' || a.status === 'acknowledged').length
      if (onAlertsUpdated) {
        onAlertsUpdated(activeCount)
      }
    } catch (err) {
      console.error('Erro ao carregar telemetria:', err)
    } finally {
      setLoading(false)
    }
  }, [onAlertsUpdated])

  const openBMPGuideModal = async () => {
    setShowBMPGuide(true)
    if (!bmpGuide) {
      try {
        const g = await fetchBMPConfigGuide()
        setBmpGuide(g)
      } catch {
        // fallback
      }
    }
  }

  const handleCopyCommand = (text: string, idx: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  useEffect(() => {
    loadData()
    // Periodic refresh every 10 seconds
    const interval = setInterval(loadData, 10000)
    return () => clearInterval(interval)
  }, [loadData])

  const handleTriggerCollect = async () => {
    setCollecting(true)
    setActionMessage('Ciclo de leitura disparado! Coletando dados via SSH...')
    try {
      await triggerTelemetryCollect()
      // Wait 3 seconds for workers to start returning data
      setTimeout(async () => {
        await loadData()
        setCollecting(false)
        setActionMessage('Leituras atualizadas com sucesso!')
        setTimeout(() => setActionMessage(null), 3000)
      }, 3000)
    } catch {
      setCollecting(false)
      setActionMessage('Erro ao acionar ciclo de leitura.')
      setTimeout(() => setActionMessage(null), 3000)
    }
  }

  const handleAcknowledge = async (id: string) => {
    try {
      await acknowledgeAlert(id)
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Falha ao reconhecer alerta')
    }
  }

  const filteredAlerts = alerts.filter(a => {
    if (alertFilter !== 'all' && a.status !== alertFilter) return false
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      a.device_name.toLowerCase().includes(q) ||
      a.message.toLowerCase().includes(q) ||
      (a.target && a.target.toLowerCase().includes(q)) ||
      a.severity.toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q)
    )
  })

  const totalAlerts = filteredAlerts.length
  const totalPages = Math.max(1, Math.ceil(totalAlerts / pageSize))
  const safeCurrentPage = Math.min(Math.max(1, currentPage), totalPages)
  const startIndex = (safeCurrentPage - 1) * pageSize
  const endIndex = Math.min(startIndex + pageSize, totalAlerts)
  const paginatedAlerts = filteredAlerts.slice(startIndex, endIndex)
  const activeOnPageCount = paginatedAlerts.filter(a => a.status === 'active').length

  const handleAcknowledgeAllVisible = async () => {
    const activeVisible = paginatedAlerts.filter(a => a.status === 'active')
    if (activeVisible.length === 0) return
    setAcknowledgingAll(true)
    try {
      await Promise.all(activeVisible.map(a => acknowledgeAlert(a.id)))
      await loadData()
    } catch (err: any) {
      alert(err.message || 'Falha ao reconhecer alertas')
    } finally {
      setAcknowledgingAll(false)
    }
  }

  const activeAlertsCount = alerts.filter(a => a.status === 'active' || a.status === 'acknowledged').length

  const formatRelativeTime = (isoString: string) => {
    const diff = Math.floor((new Date().getTime() - new Date(isoString).getTime()) / 1000)
    if (diff < 60) return `há ${diff}s`
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
    return `há ${Math.floor(diff / 3600)}h`
  }

  if (loading && !overview) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <Radio className="h-10 w-10 text-cyan-400 animate-spin" />
        <p className="text-slate-400 text-sm">Carregando telemetria e estado dos roteadores...</p>
      </div>
    )
  }

  if (activeSubTab === 'churn') {
    return <BGPChurnView />
  }

  if (activeSubTab === 'rpki') {
    return <RPKIValidatorView />
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Control Bar */}
      {(!activeSubTab || activeSubTab === 'overview') && (
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Radio className={`h-6 w-6 ${collecting ? 'animate-spin' : 'animate-pulse'}`} />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white tracking-tight">Telemetria & Detecção de Anomalias</h2>
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800/80">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  Motor Ativo ({status?.poll_interval_seconds || 45}s)
                </span>
                {status?.syslog_active && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-950 text-indigo-400 border border-indigo-800/80">
                    <Zap className="h-3 w-3 text-indigo-400" />
                    Syslog UDP :{status.syslog_port}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                <span>
                  Última leitura: {overview?.last_updated ? new Date(overview.last_updated).toLocaleTimeString() : 'Aguardando...'}
                </span>
                <span>&bull;</span>
                <span>Ciclos executados: {status?.total_cycles || 0}</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={handleTriggerCollect}
              disabled={collecting}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white shadow-lg shadow-cyan-600/20 disabled:opacity-50 transition cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${collecting ? 'animate-spin' : ''}`} />
              <span>{collecting ? 'Coletando...' : 'Coletar Agora'}</span>
            </button>
            <button
              onClick={loadData}
              title="Atualizar painel"
              className="p-2.5 rounded-xl border border-slate-700 bg-slate-800/70 hover:bg-slate-700 text-slate-300 hover:text-white transition cursor-pointer"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>

        {actionMessage && (
          <div className="mt-4 p-3 rounded-lg bg-cyan-950/60 border border-cyan-800/80 text-cyan-300 text-xs flex items-center gap-2">
            <Zap className="h-4 w-4 text-cyan-400 animate-pulse" />
            <span>{actionMessage}</span>
          </div>
        )}
      </div>
      )}

      {/* KPI Cards & History Trend */}
      {(!activeSubTab || activeSubTab === 'overview') && (
        <>
          {/* KPI Cards */}
          {loading && !overview ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <MetricCardSkeleton key={i} />
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Roteadores */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Roteadores</span>
            <Server className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white">{overview?.online_devices ?? 0}</span>
            <span className="text-xs text-slate-500">/ {overview?.total_devices ?? 0} online</span>
          </div>
          <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{
                width: `${overview?.total_devices ? (overview.online_devices / overview.total_devices) * 100 : 0}%`
              }}
            />
          </div>
        </div>

        {/* BGP Peers */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sessões BGP</span>
            <Activity className="h-4 w-4 text-blue-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-bold text-emerald-400">{overview?.established_bgp ?? 0}</span>
              <span className="text-xs text-slate-500 ml-1.5">Up</span>
            </div>
            {(overview?.down_bgp ?? 0) > 0 && (
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-rose-950 text-rose-400 border border-rose-800">
                {overview?.down_bgp} Down
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Total de {overview?.total_bgp_peers ?? 0} peers cadastrados
          </p>
        </div>

        {/* OSPF Neighbors */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Vizinhos OSPF</span>
            <Network className="h-4 w-4 text-indigo-400" />
          </div>
          <div className="mt-2 flex items-baseline justify-between">
            <div>
              <span className="text-2xl font-bold text-indigo-400">{overview?.full_ospf ?? 0}</span>
              <span className="text-xs text-slate-500 ml-1.5">Full</span>
            </div>
            {(overview?.down_ospf ?? 0) > 0 && (
              <span className="px-2 py-0.5 rounded text-xs font-semibold bg-amber-950 text-amber-400 border border-amber-800">
                {overview?.down_ospf} Alerta
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-2">
            Total de {overview?.total_ospf_neighbors ?? 0} adjacências
          </p>
        </div>

        {/* Total Prefixos */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Prefixos na Rede</span>
            <Layers className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">
              {(overview?.total_prefixes ?? 0).toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">rotas ativas</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">Recebidas de peers BGP</p>
        </div>
      </div>
    )}

      {/* History Trend Mini-Chart (SVG) */}
      {history.length > 1 && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-cyan-400" />
              <h3 className="text-sm font-semibold text-white">Tendência Temporal das Últimas Coletas</h3>
            </div>
            <span className="text-xs text-slate-500">{history.length} amostras</span>
          </div>
          <div className="h-28 w-full flex items-end gap-1.5 pt-4">
            {history.map((snap, idx) => {
              const maxPfx = Math.max(...history.map(h => h.total_prefixes), 10)
              const heightPct = Math.max((snap.total_prefixes / maxPfx) * 100, 8)
              return (
                <div
                  key={idx}
                  className="flex-1 flex flex-col items-center gap-1 group relative h-full justify-end"
                >
                  {/* Tooltip */}
                  <div className="absolute bottom-full mb-2 hidden group-hover:flex flex-col items-center z-20 pointer-events-none">
                    <div className="bg-slate-950 border border-slate-700 text-slate-200 text-xs rounded px-2 py-1 shadow-lg whitespace-nowrap">
                      <p className="font-semibold text-white">{snap.device_name || 'Dispositivo'}</p>
                      <p>Prefixos: {snap.total_prefixes.toLocaleString()}</p>
                      <p>Peers Up: {snap.bgp_established}</p>
                      <p className="text-[10px] text-slate-400">
                        {new Date(snap.timestamp).toLocaleTimeString()}
                      </p>
                    </div>
                  </div>
                  <div
                    style={{ height: `${heightPct}%` }}
                    className={`w-full rounded-t transition-all ${
                      snap.bgp_down > 0
                        ? 'bg-rose-500/80 hover:bg-rose-400'
                        : 'bg-cyan-500/60 hover:bg-cyan-400'
                    }`}
                  />
                  <span className="text-[9px] text-slate-500 truncate w-full text-center">
                    {new Date(snap.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ================= PAINEL DE TELEMETRIA UNIVERSAL BMP (RFC 7854) ================= */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
              <Radio className="h-5 w-5 animate-pulse" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="font-bold text-white text-base">Telemetria Universal BGP (BMP - RFC 7854)</h3>
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                  TCP :{bmpStatus?.port || 11019}
                </span>
                <span className="text-[11px] text-slate-400 font-mono hidden sm:inline">RFC 7854 Native</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Leitura padrão do NOC: stream contínuo de peers, rotas e quedas BGP em tempo real com <strong className="text-slate-200">ZERO consumo de CPU/SSH</strong> nos roteadores.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={openBMPGuideModal}
              className="flex items-center gap-1.5 px-3 py-2 bg-cyan-950/80 hover:bg-cyan-900 text-cyan-300 border border-cyan-800 rounded-xl text-xs font-semibold transition cursor-pointer"
            >
              <HelpCircle className="h-4 w-4 text-cyan-400" />
              <span>Como Ativar no Huawei / Roteadores</span>
            </button>
          </div>
        </div>

        {/* BMP Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* Roteadores BMP */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Roteadores Conectados</span>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-white">{bmpStatus?.connected_routers ?? 0}</span>
              <span className="text-xs text-slate-500">sessões TCP ativas</span>
            </div>
            {bmpStatus?.clients && bmpStatus.clients.length > 0 ? (
              <div className="mt-2 space-y-1">
                {bmpStatus.clients.map((c, i) => (
                  <div key={i} className="text-[11px] text-slate-400 flex items-center gap-1.5 truncate">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-400"></span>
                    <span className="font-semibold text-slate-200">{c.device_name || c.sys_name || c.router_ip}</span>
                    <span className="text-slate-500 font-mono text-[10px]">({c.router_ip})</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[11px] text-slate-500 mt-2">Aguardando conexão dos roteadores...</p>
            )}
          </div>

          {/* Peers BGP Monitorados */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Peers BGP via BMP</span>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-emerald-400">{bmpStatus?.established_peers ?? 0}</span>
              <span className="text-xs text-slate-500">Established</span>
              {(bmpStatus?.down_peers ?? 0) > 0 && (
                <span className="text-xs font-bold text-rose-400 ml-auto bg-rose-950 px-2 py-0.5 rounded border border-rose-800">
                  {bmpStatus?.down_peers} Down
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Total de {bmpStatus?.total_peers_monitored ?? 0} peers rastreados continuamente
            </p>
          </div>

          {/* Mensagens BMP Processadas */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Mensagens BMP</span>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-cyan-400">{(bmpStatus?.total_messages_parsed ?? 0).toLocaleString()}</span>
              <span className="text-xs text-slate-500">pacotes decodificados</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Peer Up/Down, Estatísticas e Route Updates
            </p>
          </div>

          {/* Rotas e Updates */}
          <div className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-3.5">
            <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Rotas Recebidas</span>
            <div className="mt-1.5 flex items-baseline gap-2">
              <span className="text-2xl font-bold text-indigo-400">{(bmpStatus?.total_routes_received ?? 0).toLocaleString()}</span>
              <span className="text-xs text-slate-500">prefixos</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-2">
              Com visibilidade Pre-Policy e Post-Policy
            </p>
          </div>
        </div>

        {/* Live BMP Events Stream */}
        {bmpEvents.length > 0 && (
          <div className="border border-slate-800/80 rounded-xl overflow-hidden bg-slate-950/50">
            <div className="px-4 py-2.5 bg-slate-950 border-b border-slate-800 flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2 w-2 rounded-full bg-cyan-400 animate-ping"></span>
                <span className="font-semibold text-slate-200">Eventos BGP em Tempo Real (Live Stream BMP)</span>
              </div>
              <span className="text-slate-500 text-[11px]">{bmpEvents.length} eventos recentes</span>
            </div>
            <div className="divide-y divide-slate-800/40 max-h-56 overflow-y-auto font-mono text-xs">
              {bmpEvents.slice(0, 10).map((ev, i) => {
                let badgeClass = 'bg-blue-950 text-blue-400 border-blue-800'
                let badgeLabel = 'UPDATE'
                if (ev.event_type === 'peer_up') {
                  badgeClass = 'bg-emerald-950 text-emerald-400 border-emerald-800'
                  badgeLabel = 'PEER UP'
                } else if (ev.event_type === 'peer_down') {
                  badgeClass = 'bg-rose-950 text-rose-400 border-rose-800'
                  badgeLabel = 'PEER DOWN'
                } else if (ev.event_type === 'stats_report') {
                  badgeClass = 'bg-purple-950 text-purple-400 border-purple-800'
                  badgeLabel = 'STATS'
                }

                return (
                  <div key={ev.id || i} className="px-4 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-slate-900/40">
                    <div className="flex items-center gap-2.5">
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold border ${badgeClass}`}>
                        {badgeLabel}
                      </span>
                      <span className="text-slate-300 font-semibold">{ev.router_name || ev.router_ip}</span>
                      <span className="text-slate-500">&rarr;</span>
                      <span className="text-cyan-300">{ev.peer_ip} (AS{ev.remote_as})</span>
                    </div>
                    <div className="flex items-center gap-3 text-slate-400 text-[11px] font-sans">
                      <span className="truncate max-w-md">{ev.details || ev.reason}</span>
                      <span className="text-slate-500 shrink-0 font-mono text-[10px]">
                        {new Date(ev.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}
        {/* ================= RESUMO DE BGP CHURN & RPKI ROA ================= */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Card Resumo BGP Churn */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-orange-500/10 border border-orange-500/30 flex items-center justify-center text-orange-400">
                    <Activity className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Ranking de BGP Churn</h4>
                    <p className="text-[11px] text-slate-400">Estabilidade e oscilações de rotas (withdrawns/h)</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-emerald-400 bg-emerald-950 px-2.5 py-1 rounded-full border border-emerald-800">
                  {churnSummary ? `${churnSummary.average_stability.toFixed(1)}% Estável` : '98.5% Estável'}
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Withdrawns 1h</span>
                  <div className="text-lg font-bold font-mono text-rose-400 mt-0.5">
                    {churnSummary?.total_withdrawn_1h ?? 0}
                  </div>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Anúncios 1h</span>
                  <div className="text-lg font-bold font-mono text-cyan-400 mt-0.5">
                    {churnSummary?.total_announced_1h ?? 0}
                  </div>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Top Flapping</span>
                  <div className="text-xs font-bold text-slate-200 mt-1 truncate">
                    {churnSummary?.top_churners?.[0]?.peer_name || churnSummary?.top_churners?.[0]?.peer_ip || 'Nenhum'}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => onSelectSubTab && onSelectSubTab('churn')}
              className="mt-4 w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-orange-950/40 hover:bg-orange-900/60 text-orange-300 border border-orange-800/60 text-xs font-semibold transition cursor-pointer"
            >
              <span>Ver Gráficos & Ranking Completo de Churn</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Card Resumo RPKI Security */}
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="h-9 w-9 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                    <ShieldCheck className="h-5 w-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-white text-sm">Segurança RPKI (RFC 6811)</h4>
                    <p className="text-[11px] text-slate-400">Validação criptográfica de origem e proteção anti-hijack</p>
                  </div>
                </div>
                <span className="text-xs font-mono font-bold text-cyan-400 bg-cyan-950 px-2.5 py-1 rounded-full border border-cyan-800">
                  AS 267943 Protegido
                </span>
              </div>

              <div className="grid grid-cols-3 gap-2 mt-4 text-center">
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Válidas (ROA OK)</span>
                  <div className="text-lg font-bold font-mono text-emerald-400 mt-0.5">
                    {rpkiSummary ? `${rpkiSummary.valid_percentage.toFixed(1)}%` : '98.5%'}
                  </div>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Rotas Inválidas</span>
                  <div className={`text-lg font-bold font-mono mt-0.5 ${(rpkiSummary?.invalid_count ?? 0) > 0 ? 'text-rose-400' : 'text-slate-400'}`}>
                    {rpkiSummary?.invalid_count ?? 0}
                  </div>
                </div>
                <div className="bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                  <span className="text-[10px] uppercase font-semibold text-slate-400">Inspecionadas</span>
                  <div className="text-xs font-bold text-slate-200 mt-1 font-mono">
                    {(rpkiSummary?.total_evaluated ?? 0).toLocaleString()}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={() => onSelectSubTab && onSelectSubTab('rpki')}
              className="mt-4 w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800/60 text-xs font-semibold transition cursor-pointer"
            >
              <span>Abrir Validador RPKI & Rotas Inválidas</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>
      </>
      )}

      {/* Alerts & Detection Feed */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
              <Bell className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">Central de Alertas & Detecções</h3>
                {activeAlertsCount > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40">
                    {activeAlertsCount} pendente{activeAlertsCount > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Anomalias identificadas automaticamente por telemetria contínua e eventos Syslog
              </p>
            </div>
          </div>

          {/* Filter tabs */}
          <div className="flex items-center bg-slate-800/80 p-1 rounded-xl border border-slate-700/60 text-xs">
            <button
              onClick={() => {
                setAlertFilter('active')
                setCurrentPage(1)
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                alertFilter === 'active'
                  ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Ativos ({alerts.filter(a => a.status === 'active').length})
            </button>
            <button
              onClick={() => {
                setAlertFilter('acknowledged')
                setCurrentPage(1)
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                alertFilter === 'acknowledged'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Reconhecidos ({alerts.filter(a => a.status === 'acknowledged').length})
            </button>
            <button
              onClick={() => {
                setAlertFilter('resolved')
                setCurrentPage(1)
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                alertFilter === 'resolved'
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Resolvidos ({alerts.filter(a => a.status === 'resolved').length})
            </button>
            <button
              onClick={() => {
                setAlertFilter('all')
                setCurrentPage(1)
              }}
              className={`px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                alertFilter === 'all'
                  ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Todos ({alerts.length})
            </button>
          </div>
        </div>

        {/* Search & Actions Sub-Toolbar */}
        <div className="px-5 py-3 border-b border-slate-800 bg-slate-950/40 flex flex-col sm:flex-row items-center justify-between gap-3">
          <div className="relative w-full sm:w-80">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filtrar logs por IP, roteador, mensagem..."
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value)
                setCurrentPage(1)
              }}
              className="w-full pl-9 pr-3 py-1.5 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto justify-between sm:justify-end">
            {activeOnPageCount > 0 && (
              <button
                onClick={handleAcknowledgeAllVisible}
                disabled={acknowledgingAll}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-cyan-300 border border-slate-700 transition cursor-pointer disabled:opacity-50"
                title="Reconhecer todos os alertas ativos desta página"
              >
                <CheckCheck className={`h-3.5 w-3.5 ${acknowledgingAll ? 'animate-spin' : 'text-cyan-400'}`} />
                <span>Reconhecer Visíveis ({activeOnPageCount})</span>
              </button>
            )}

            <div className="text-xs text-slate-400 font-medium whitespace-nowrap">
              <span>Total: <strong className="text-white font-mono">{totalAlerts}</strong> logs</span>
            </div>
          </div>
        </div>

        {/* Alert List */}
        {paginatedAlerts.length === 0 ? (
          <div className="p-12 text-center">
            <div className="h-12 w-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto mb-3">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <h4 className="text-sm font-semibold text-white">Nenhum alerta nesta categoria</h4>
            <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
              {searchQuery
                ? `Nenhum alerta corresponde à busca "${searchQuery}".`
                : 'Todas as sessões e equipamentos monitorados estão operando normalmente.'}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-800/60">
            {paginatedAlerts.map(alert => {
              const isCrit = alert.severity === 'critical'
              const isWarn = alert.severity === 'warning'

              return (
                <div
                  key={alert.id}
                  className={`p-4 sm:p-5 transition hover:bg-slate-800/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 ${
                    alert.status === 'active' ? 'bg-slate-900/40' : 'opacity-80'
                  }`}
                >
                  <div className="flex items-start gap-3.5 flex-1">
                    {/* Severity Icon */}
                    <div
                      className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 mt-0.5 ${
                        isCrit
                          ? 'bg-rose-500/15 text-rose-400 border border-rose-500/30'
                          : isWarn
                          ? 'bg-amber-500/15 text-amber-400 border border-amber-500/30'
                          : 'bg-blue-500/15 text-blue-400 border border-blue-500/30'
                      }`}
                    >
                      {isCrit ? (
                        <XCircle className="h-5 w-5" />
                      ) : isWarn ? (
                        <AlertTriangle className="h-5 w-5" />
                      ) : (
                        <CheckCircle2 className="h-5 w-5" />
                      )}
                    </div>

                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                            isCrit
                              ? 'bg-rose-950 text-rose-400 border border-rose-800'
                              : isWarn
                              ? 'bg-amber-950 text-amber-400 border border-amber-800'
                              : 'bg-blue-950 text-blue-400 border border-blue-800'
                          }`}
                        >
                          {alert.severity}
                        </span>

                        <span className="font-semibold text-sm text-white">{alert.device_name}</span>
                        <span className="text-slate-500">&bull;</span>
                        <span className="text-xs font-mono text-cyan-400">{alert.target}</span>

                        <span className="text-xs text-slate-500 ml-auto sm:ml-0">
                          {formatRelativeTime(alert.started_at)}
                        </span>
                      </div>

                      <p className="text-xs text-slate-300 whitespace-pre-line leading-relaxed">{alert.message}</p>

                      {alert.resolved_at && (
                        <p className="text-[11px] text-emerald-400/90 flex items-center gap-1">
                          <Check className="h-3 w-3" />
                          <span>Resolvido às {new Date(alert.resolved_at).toLocaleTimeString()}</span>
                        </p>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                    {alert.status === 'active' && (
                      <button
                        onClick={() => handleAcknowledge(alert.id)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer"
                      >
                        <Check className="h-3.5 w-3.5 text-cyan-400" />
                        <span>Reconhecer</span>
                      </button>
                    )}
                    {alert.status === 'acknowledged' && (
                      <span className="text-xs text-amber-400/80 italic font-medium px-2 py-1 bg-amber-950/40 rounded border border-amber-900/60">
                        Reconhecido pelo NOC
                      </span>
                    )}
                    {alert.status === 'resolved' && (
                      <span className="text-xs text-emerald-400/80 italic font-medium px-2 py-1 bg-emerald-950/40 rounded border border-emerald-900/60">
                        Resolvido
                      </span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Pagination Footer */}
        {totalAlerts > 0 && (
          <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-400">
            {/* Left Info & Page Size */}
            <div className="flex items-center gap-4 flex-wrap">
              <span>
                Exibindo <strong className="text-white font-mono">{startIndex + 1}</strong> a{' '}
                <strong className="text-white font-mono">{endIndex}</strong> de{' '}
                <strong className="text-cyan-400 font-mono">{totalAlerts}</strong> eventos
              </span>

              <div className="flex items-center gap-1.5 border-l border-slate-800 pl-4">
                <span className="text-slate-500">Por página:</span>
                <select
                  value={pageSize}
                  onChange={(e) => {
                    setPageSize(Number(e.target.value))
                    setCurrentPage(1)
                  }}
                  className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-lg px-2 py-1 focus:outline-none focus:border-cyan-500 cursor-pointer font-mono"
                >
                  <option value={5}>5</option>
                  <option value={10}>10</option>
                  <option value={20}>20</option>
                  <option value={50}>50</option>
                </select>
              </div>
            </div>

            {/* Right Navigation Buttons */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                {/* Primeira Página */}
                <button
                  onClick={() => setCurrentPage(1)}
                  disabled={safeCurrentPage === 1}
                  className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-700/60 transition cursor-pointer"
                  title="Primeira página"
                >
                  <ChevronsLeft className="h-4 w-4" />
                </button>

                {/* Página Anterior */}
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={safeCurrentPage === 1}
                  className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-700/60 transition cursor-pointer"
                  title="Página anterior"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>

                {/* Números das Páginas */}
                <div className="flex items-center gap-1 px-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1)
                    .filter(p => p === 1 || p === totalPages || Math.abs(p - safeCurrentPage) <= 1)
                    .map((p, idx, arr) => {
                      const prevPage = arr[idx - 1]
                      const showEllipsis = prevPage && p - prevPage > 1

                      return (
                        <React.Fragment key={p}>
                          {showEllipsis && <span className="text-slate-600 px-1 font-mono">...</span>}
                          <button
                            onClick={() => setCurrentPage(p)}
                            className={`min-w-[28px] h-7 px-2 rounded-lg text-xs font-semibold font-mono transition cursor-pointer ${
                              safeCurrentPage === p
                                ? 'bg-cyan-600 text-white shadow-md shadow-cyan-600/30'
                                : 'bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/60'
                            }`}
                          >
                            {p}
                          </button>
                        </React.Fragment>
                      )
                    })}
                </div>

                {/* Próxima Página */}
                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={safeCurrentPage === totalPages}
                  className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-700/60 transition cursor-pointer"
                  title="Próxima página"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>

                {/* Última Página */}
                <button
                  onClick={() => setCurrentPage(totalPages)}
                  disabled={safeCurrentPage === totalPages}
                  className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 disabled:opacity-30 disabled:cursor-not-allowed border border-slate-700/60 transition cursor-pointer"
                  title="Última página"
                >
                  <ChevronsRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Syslog Setup Guide Accordion */}
      <div className="bg-slate-900/70 border border-slate-800 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowSyslogGuide(!showSyslogGuide)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition cursor-pointer"
        >
          <div className="flex items-center gap-3">
            <Terminal className="h-4 w-4 text-cyan-400" />
            <div>
              <h4 className="text-sm font-semibold text-white">
                Como configurar os Roteadores para enviar Eventos Syslog ao NetPulse
              </h4>
              <p className="text-xs text-slate-400">
                Receba alertas instantâneos de queda de BGP/OSPF no mesmo segundo em que ocorrem (UDP 1514)
              </p>
            </div>
          </div>
          {showSyslogGuide ? (
            <ChevronUp className="h-4 w-4 text-slate-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-slate-400" />
          )}
        </button>

        {showSyslogGuide && (
          <div className="p-4 border-t border-slate-800/80 bg-slate-950/50 space-y-4 text-xs font-mono">
            {/* Huawei */}
            <div>
              <p className="text-cyan-400 font-semibold mb-1">Huawei VRP (NE8000 / CloudEngine / S6730):</p>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300 select-all">
                system-view<br />
                info-center enable<br />
                info-center loghost &lt;IP-DO-NETPULSE&gt; port 1514
              </div>
            </div>

            {/* Datacom */}
            <div>
              <p className="text-cyan-400 font-semibold mb-1">Datacom (DmOS):</p>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300 select-all">
                configure terminal<br />
                logging host &lt;IP-DO-NETPULSE&gt; transport udp port 1514
              </div>
            </div>

            {/* MikroTik */}
            <div>
              <p className="text-cyan-400 font-semibold mb-1">MikroTik RouterOS (v6 & v7):</p>
              <div className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-slate-300 select-all">
                /system logging action add name=netpulse target=remote remote=&lt;IP-DO-NETPULSE&gt; remote-port=1514<br />
                /system logging add topics=bgp,info action=netpulse<br />
                /system logging add topics=ospf,info action=netpulse
              </div>
            </div>
          </div>
        )}
      </div>

      {/* BMP Setup Guide Modal */}
      {showBMPGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Radio className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Ativação de Telemetria Universal BMP (RFC 7854)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Porta de escuta do NetPulse: <code className="text-cyan-300 font-mono">TCP {bmpStatus?.port || 11019}</code>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBMPGuide(false)}
                className="text-slate-400 hover:text-white text-lg p-1 cursor-pointer"
              >
                &times;
              </button>
            </div>

            {/* Vendor Selector Tabs */}
            <div className="flex border-b border-slate-800 bg-slate-950/60 px-5 pt-3 gap-2 overflow-x-auto text-xs">
              {[
                { id: 'huawei', label: 'Huawei (NE8000 / NE40)' },
                { id: 'mikrotik_v7', label: 'MikroTik (RouterOS v7)' },
                { id: 'cisco_iosxr', label: 'Cisco (IOS-XR)' },
                { id: 'juniper_junos', label: 'Juniper (Junos)' },
              ].map((v) => (
                <button
                  key={v.id}
                  onClick={() => setSelectedBMPVendor(v.id as any)}
                  className={`pb-3 px-3 font-semibold transition border-b-2 cursor-pointer ${
                    selectedBMPVendor === v.id
                      ? 'border-cyan-400 text-cyan-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {bmpGuide?.vendors[selectedBMPVendor] ? (
                <>
                  <div className="flex items-start gap-3 p-3.5 bg-cyan-950/30 border border-cyan-800/60 rounded-xl text-xs text-cyan-300">
                    <ShieldCheck className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">{bmpGuide.vendors[selectedBMPVendor].title}</p>
                      <p className="text-slate-400 mt-0.5">{bmpGuide.vendors[selectedBMPVendor].description}</p>
                    </div>
                  </div>

                  {/* Commands Box */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Comandos de Configuração:
                      </span>
                      <button
                        onClick={() => handleCopyCommand(bmpGuide.vendors[selectedBMPVendor].commands.join('\n'), 1)}
                        className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer"
                      >
                        {copiedIndex === 1 ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedIndex === 1 ? 'Copiado!' : 'Copiar Comandos'}</span>
                      </button>
                    </div>
                    <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                      {bmpGuide.vendors[selectedBMPVendor].commands.join('\n')}
                    </pre>
                  </div>

                  {/* Verification Commands */}
                  {bmpGuide.vendors[selectedBMPVendor].verify_commands?.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Comandos de Checagem e Diagnóstico:
                        </span>
                        <button
                          onClick={() => handleCopyCommand(bmpGuide.vendors[selectedBMPVendor].verify_commands.join('\n'), 2)}
                          className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer"
                        >
                          {copiedIndex === 2 ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          <span>{copiedIndex === 2 ? 'Copiado!' : 'Copiar'}</span>
                        </button>
                      </div>
                      <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-cyan-300 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                        {bmpGuide.vendors[selectedBMPVendor].verify_commands.join('\n')}
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm">
                  Carregando instruções de configuração...
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => setShowBMPGuide(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition cursor-pointer"
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
