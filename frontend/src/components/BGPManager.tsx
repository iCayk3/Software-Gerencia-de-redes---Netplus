import React, { useState, useEffect } from 'react'
import {
  Activity,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  FileText,
  Server,
  Radio,
  Copy,
  Check,
  ShieldCheck,
  Edit3,
  X
} from 'lucide-react'
import {
  fetchDevices,
  fetchAllBGP,
  fetchDeviceBGP,
  fetchBMPStatus,
  fetchBMPConfigGuide,
  fetchBGPChurnRanking,
  fetchRPKISummary,
  fetchASMetadata,
  fetchPeerMetadata,
  updatePeerMetadata,
  sanitizeText,
  type Device,
  type BGPSession,
  type BMPStatus,
  type BMPConfigGuide,
  type ChurnRankingResponse,
  type RPKISummary,
  type ASMetadata,
  type PeerMetadata
} from '../services/api'
import { TableRowSkeleton } from './common/Skeleton'

export const BGPManager: React.FC = () => {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all')
  const [sessions, setSessions] = useState<BGPSession[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // BMP Telemetry State
  const [bmpStatus, setBmpStatus] = useState<BMPStatus | null>(null)
  const [showBMPModal, setShowBMPModal] = useState(false)
  const [bmpGuide, setBmpGuide] = useState<BMPConfigGuide | null>(null)
  const [selectedGuideVendor, setSelectedGuideVendor] = useState<'huawei' | 'mikrotik_v7' | 'cisco_iosxr' | 'juniper_junos'>('huawei')
  const [copiedIndex, setCopiedIndex] = useState<number | null>(null)

  // BGP Churn & RPKI Telemetry State
  const [churnRanking, setChurnRanking] = useState<ChurnRankingResponse | null>(null)
  const [rpkiSummary, setRpkiSummary] = useState<RPKISummary | null>(null)

  const [asMetadata, setAsMetadata] = useState<Record<string, ASMetadata>>({})
  const [peerMetadata, setPeerMetadata] = useState<Record<string, PeerMetadata>>({})

  // Session Description Editing Modal State (Opção B - Edição 100% individual por Sessão)
  const [editingSession, setEditingSession] = useState<BGPSession | null>(null)
  const [editAlias, setEditAlias] = useState('')
  const [savingAlias, setSavingAlias] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [editSuccess, setEditSuccess] = useState<string | null>(null)

  // Resolvedor do Nome/Detentor do AS (Global pelo número do AS)
  const getASHolder = (remoteAs: string): string => {
    const cleanAs = remoteAs.replace(/^AS/i, '').trim()
    const meta = asMetadata[cleanAs]
    if (meta?.alias) return sanitizeText(meta.alias)

    const known: Record<string, string> = {
      '267943': 'SOL PROVEDOR DE INTERNET',
      '267643': 'SOL PROVEDOR DE INTERNET',
      '266445': 'SEA Telecom (Trânsito Principal)',
      '262503': 'WIKI Telecom (Trânsito Secundário)',
      '26162': 'IX.br / PTT Metro',
      '20121': 'IX.br / PTT São Paulo',
    }
    return known[cleanAs] || '-'
  }

  // Resolvedor da Descrição Individual da Sessão BGP
  const getSessionDescription = (session: BGPSession): string => {
    const specificKey = `${session.device_id}:${session.peer_ip}`
    if (peerMetadata[specificKey]?.description) {
      return sanitizeText(peerMetadata[specificKey].description)
    }
    if (peerMetadata[session.peer_ip]?.description) {
      return sanitizeText(peerMetadata[session.peer_ip].description)
    }
    if (session.description && session.description.trim() !== '') {
      return sanitizeText(session.description)
    }
    return '-'
  }

  const handleOpenEditSession = (session: BGPSession) => {
    setEditingSession(session)
    const currentDesc = getSessionDescription(session)
    const holder = getASHolder(session.remote_as)
    // Sugestão inicial: descrição individual já salva > descrição do roteador > titular do AS
    if (currentDesc !== '-') {
      setEditAlias(currentDesc)
    } else if (session.description && session.description.trim() !== '') {
      setEditAlias(sanitizeText(session.description))
    } else if (holder !== '-') {
      setEditAlias(holder)
    } else {
      setEditAlias('')
    }
    setEditError(null)
    setEditSuccess(null)
  }

  const handleSaveSession = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingSession) return
    setSavingAlias(true)
    setEditError(null)
    setEditSuccess(null)
    try {
      const cleanDesc = editAlias.trim()
      const specificKey = `${editingSession.device_id}:${editingSession.peer_ip}`

      await updatePeerMetadata({
        device_id: editingSession.device_id,
        peer_ip: editingSession.peer_ip,
        remote_as: editingSession.remote_as,
        description: cleanDesc
      })

      // Atualiza o estado local exclusivamente desta sessão/IP
      setPeerMetadata(prev => ({
        ...prev,
        [specificKey]: {
          key: specificKey,
          device_id: editingSession.device_id,
          peer_ip: editingSession.peer_ip,
          remote_as: editingSession.remote_as,
          description: cleanDesc,
          updated_at: new Date().toISOString()
        },
        [editingSession.peer_ip]: {
          key: editingSession.peer_ip,
          device_id: editingSession.device_id,
          peer_ip: editingSession.peer_ip,
          remote_as: editingSession.remote_as,
          description: cleanDesc,
          updated_at: new Date().toISOString()
        }
      }))

      // Atualiza também a sessão correspondente no array em memória
      setSessions(prev => prev.map(s => {
        const isMatch = s.peer_ip === editingSession.peer_ip &&
          (!editingSession.device_id || !s.device_id || s.device_id === editingSession.device_id)
        if (isMatch) {
          return { ...s, description: cleanDesc }
        }
        return s
      }))

      setEditSuccess('Descrição da sessão salva com sucesso!')
      setTimeout(() => {
        setEditingSession(null)
        setEditSuccess(null)
      }, 700)
    } catch (err: any) {
      setEditError(err.message || 'Erro ao salvar descrição da sessão')
    } finally {
      setSavingAlias(false)
    }
  }

  // Filters & Search
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'established' | 'down'>('all')
  const [sourceFilter, setSourceFilter] = useState<'all' | 'bmp' | 'ssh'>('all')

  // Raw output modal
  const [modalSession, setModalSession] = useState<BGPSession | null>(null)

  const loadInitialData = async () => {
    try {
      const [devs, bmp, churn, rpki, meta, peers] = await Promise.all([
        fetchDevices().catch(() => []),
        fetchBMPStatus().catch(() => null),
        fetchBGPChurnRanking().catch(() => null),
        fetchRPKISummary().catch(() => null),
        fetchASMetadata().catch(() => ({} as Record<string, ASMetadata>)),
        fetchPeerMetadata().catch(() => ({} as Record<string, PeerMetadata>))
      ])
      setDevices(devs)
      setBmpStatus(bmp)
      setChurnRanking(churn)
      setRpkiSummary(rpki)
      if (meta) setAsMetadata(meta)
      if (peers) setPeerMetadata(peers)
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
      // Refresh BMP status and Churn
      fetchBMPStatus().then(st => setBmpStatus(st)).catch(() => {})
      fetchBGPChurnRanking().then(ch => setChurnRanking(ch)).catch(() => {})
      fetchRPKISummary().then(rp => setRpkiSummary(rp)).catch(() => {})
      fetchBMPStatus().then(st => setBmpStatus(st)).catch(() => {})
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar sessões BGP')
      setSessions([])
    } finally {
      setLoading(false)
    }
  }

  const openBMPGuide = async () => {
    setShowBMPModal(true)
    if (!bmpGuide) {
      try {
        const guide = await fetchBMPConfigGuide()
        setBmpGuide(guide)
      } catch {
        // fallback
      }
    }
  }

  const handleCopy = (text: string, idx: number) => {
    navigator.clipboard.writeText(text)
    setCopiedIndex(idx)
    setTimeout(() => setCopiedIndex(null), 2000)
  }

  useEffect(() => {
    loadInitialData()
    const timer = setInterval(() => {
      fetchBMPStatus().then(st => setBmpStatus(st)).catch(() => {})
    }, 15000)
    return () => clearInterval(timer)
  }, [])

  const handleDeviceChange = (devId: string) => {
    setSelectedDeviceId(devId)
    loadBGPSessions(devId)
  }

  // Filtered Sessions
  const filteredSessions = sessions.filter((s) => {
    const q = search.toLowerCase()
    const holder = getASHolder(s.remote_as).toLowerCase()
    const sessionDesc = getSessionDescription(s).toLowerCase()
    const matchesSearch =
      s.peer_ip.toLowerCase().includes(q) ||
      s.remote_as.toLowerCase().includes(q) ||
      s.device_name.toLowerCase().includes(q) ||
      holder.includes(q) ||
      sessionDesc.includes(q) ||
      (s.description && s.description.toLowerCase().includes(q))

    if (!matchesSearch) return false

    const isEstablished = s.state.toLowerCase() === 'established'
    if (statusFilter === 'established' && !isEstablished) return false
    if (statusFilter === 'down' && isEstablished) return false

    if (sourceFilter === 'bmp' && s.telemetry_source !== 'bmp') return false
    if (sourceFilter === 'ssh' && s.telemetry_source === 'bmp') return false

    return true
  })

  // Summary Metrics
  const totalSessions = sessions.length
  const establishedSessions = sessions.filter((s) => s.state.toLowerCase() === 'established').length
  const downSessions = totalSessions - establishedSessions
  const bmpSessionsCount = sessions.filter((s) => s.telemetry_source === 'bmp').length
  const totalPrefixes = sessions.reduce((acc, curr) => acc + (curr.prefixes_received || 0), 0)

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
              <Activity className="h-5 w-5 text-cyan-400" />
              <span>Gerenciador Universal de BGP</span>
            </h2>
            {bmpStatus?.running ? (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950/80 text-emerald-400 border border-emerald-800">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-ping"></span>
                BMP RFC 7854 Ativo ({bmpStatus.connected_routers} router{bmpStatus.connected_routers !== 1 ? 's' : ''})
              </span>
            ) : (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-950/80 text-amber-400 border border-amber-800">
                <Radio className="h-3 w-3" />
                BMP Porta 11019
              </span>
            )}
            {rpkiSummary && (
              <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-950/80 text-cyan-400 border border-cyan-800">
                <ShieldCheck className="h-3 w-3 text-cyan-400" />
                RPKI {rpkiSummary.valid_percentage.toFixed(0)}% Válido
              </span>
            )}
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Telemetria em tempo real via stream BMP (RFC 7854) com fallback inteligente para SSH nos roteadores de borda.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          {/* Button to open Huawei/Vendor BMP configuration guide */}
          <button
            onClick={openBMPGuide}
            className="flex items-center gap-1.5 px-3 py-2 bg-cyan-950/70 hover:bg-cyan-900/80 text-cyan-300 border border-cyan-800/80 rounded-lg text-xs font-medium transition cursor-pointer"
          >
            <Radio className="h-3.5 w-3.5 text-cyan-400" />
            <span>Ativar BMP no Huawei / Roteadores</span>
          </button>

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
      <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
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
          <span className="text-xs text-slate-400 font-medium">Telemetria BMP Live</span>
          <div className="text-2xl font-bold text-emerald-400 mt-1 flex items-center gap-1.5">
            <Radio className="h-5 w-5 text-emerald-400 animate-pulse" />
            <span>{bmpSessionsCount}</span>
            <span className="text-xs text-slate-500 font-normal">/ {totalSessions} peers</span>
          </div>
        </div>

        <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-4 shadow-sm">
          <span className="text-xs text-slate-400 font-medium">Total de Prefixos</span>
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

        {/* Status & Source Filters */}
        <div className="flex flex-wrap items-center gap-2 self-end sm:self-center">
          <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 px-1 font-semibold uppercase">Origem:</span>
            {[
              { id: 'all', label: 'Todas' },
              { id: 'bmp', label: '🟢 BMP Live' },
              { id: 'ssh', label: '🟡 SSH' },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setSourceFilter(btn.id as any)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition cursor-pointer ${
                  sourceFilter === btn.id
                    ? 'bg-slate-800 text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-lg border border-slate-800">
            <span className="text-[10px] text-slate-500 px-1 font-semibold uppercase">Estado:</span>
            {[
              { id: 'all', label: 'Todos' },
              { id: 'established', label: 'Up' },
              { id: 'down', label: 'Down' },
            ].map((btn) => (
              <button
                key={btn.id}
                onClick={() => setStatusFilter(btn.id as any)}
                className={`px-2 py-0.5 rounded text-xs font-medium transition cursor-pointer ${
                  statusFilter === btn.id
                    ? 'bg-slate-800 text-cyan-300 font-semibold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {btn.label}
              </button>
            ))}
          </div>
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
                  <th className="py-3 px-4 font-medium">Detentor do AS / Descrição</th>
                  <th className="py-3 px-4 font-medium">Origem</th>
                  <th className="py-3 px-4 font-medium">Estado</th>
                  <th className="py-3 px-4 font-medium">Uptime</th>
                  <th className="py-3 px-4 font-medium">Prefixos</th>
                  <th className="py-3 px-4 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-slate-300">
                {Array.from({ length: 5 }).map((_, i) => (
                  <TableRowSkeleton key={i} columns={10} />
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
                  <th className="py-3 px-4 font-medium">Detentor do AS / Descrição</th>
                  <th className="py-3 px-4 font-medium">Origem</th>
                  <th className="py-3 px-4 font-medium">Estado</th>
                  <th className="py-3 px-4 font-medium">Estabilidade</th>
                  <th className="py-3 px-4 font-medium">Uptime</th>
                  <th className="py-3 px-4 font-medium">Prefixos</th>
                  <th className="py-3 px-4 font-medium text-right">Ação</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/40 text-slate-300">
                {filteredSessions.map((session, idx) => {
                  const isEstablished = session.state.toLowerCase() === 'established'
                  const isBMP = session.telemetry_source === 'bmp'

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
                      </td>

                      <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono text-xs font-bold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/80">
                            AS{session.remote_as}
                          </span>
                        </div>
                        {session.local_as && (
                          <div className="text-slate-500 text-[10px] mt-0.5 font-sans">
                            Local: AS{session.local_as}
                          </div>
                        )}
                      </td>

                      {/* Detentor do AS / Descrição da Sessão */}
                      <td className="py-2.5 px-4 font-sans text-xs">
                        {(() => {
                          const sessionDesc = getSessionDescription(session)
                          const holder = getASHolder(session.remote_as)
                          const hasCustomDesc = sessionDesc !== '-'
                          const hasHolder = holder !== '-'
                          const primaryText = hasCustomDesc ? sessionDesc : (hasHolder ? holder : '-')
                          const isPlaceholder = primaryText === '-'

                          return (
                            <div className="space-y-0.5 min-w-[170px]">
                              <div className="flex items-center gap-1.5 group/holder">
                                <span className={`font-semibold ${!isPlaceholder ? 'text-slate-100' : 'text-slate-500'}`}>
                                  {primaryText}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditSession(session)}
                                  title={`Editar descrição exclusiva desta sessão (${session.peer_ip})`}
                                  className="p-1 rounded-md text-slate-500 hover:text-cyan-300 hover:bg-slate-800 transition-colors cursor-pointer shrink-0 opacity-70 group-hover/holder:opacity-100"
                                >
                                  <Edit3 className="h-3 w-3" />
                                </button>
                              </div>
                              {hasCustomDesc && hasHolder && holder !== primaryText && (
                                <div className="text-[10px] text-cyan-400/90 font-medium truncate max-w-[200px]" title={`Detentor do AS${session.remote_as}: ${holder}`}>
                                  {holder}
                                </div>
                              )}
                            </div>
                          )
                        })()}
                      </td>

                      {/* Origem da Leitura (BMP Live Stream vs SSH Polling) */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {isBMP ? (
                          <span
                            title="Telemetria em tempo real via stream BMP (RFC 7854) - Zero impacto de CPU no roteador"
                            className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-950/90 text-emerald-400 border border-emerald-800"
                          >
                            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                            BMP Live
                          </span>
                        ) : (
                          <span
                            title="Leitura periódica por comandos CLI via SSH"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700"
                          >
                            SSH Polling
                          </span>
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

                      {/* Estabilidade / Churn */}
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        {(() => {
                          const churnPeer = churnRanking?.top_churners?.find(c => c.peer_ip === session.peer_ip)
                          if (!churnPeer) {
                            return (
                              <span className="text-[11px] font-mono text-emerald-400 font-medium">100% Estável</span>
                            )
                          }
                          const score = churnPeer.stability_score
                          const color = score >= 95 ? 'text-emerald-400' : score >= 80 ? 'text-amber-400' : 'text-rose-400'
                          const barColor = score >= 95 ? 'bg-emerald-500' : score >= 80 ? 'bg-amber-500' : 'bg-rose-500'
                          return (
                            <div className="flex items-center gap-1.5" title={`Flaps 1h: ${churnPeer.withdrawn_1h} withdrawns | Total: ${churnPeer.total_flaps}`}>
                              <div className="w-10 bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                <div className={`h-1.5 rounded-full ${barColor}`} style={{ width: `${score}%` }} />
                              </div>
                              <span className={`font-mono text-[11px] font-bold ${color}`}>
                                {score.toFixed(0)}%
                              </span>
                              {churnPeer.withdrawn_1h > 0 && (
                                <span className="text-[10px] text-rose-400 font-mono">
                                  ({churnPeer.withdrawn_1h}w/h)
                                </span>
                              )}
                            </div>
                          )
                        })()}
                      </td>

                      <td className="py-2.5 px-4 font-mono text-slate-400 whitespace-nowrap">
                        {session.uptime}
                      </td>

                      <td className="py-2.5 px-4 font-mono whitespace-nowrap">
                        <div>
                          <span
                            className={`font-semibold ${
                              session.prefixes_received > 0 ? 'text-cyan-300' : 'text-slate-500'
                            }`}
                          >
                            {session.prefixes_received.toLocaleString()}
                          </span>
                          {session.pre_policy_prefixes !== undefined && session.pre_policy_prefixes > 0 && (
                            <div className="text-[10px] text-slate-500 font-sans mt-0.5">
                              Pre: {session.pre_policy_prefixes.toLocaleString()} | Post: {(session.post_policy_prefixes ?? session.prefixes_received).toLocaleString()}
                              {session.rejected_prefixes !== undefined && session.rejected_prefixes > 0 && (
                                <span className="text-amber-400 ml-1">({session.rejected_prefixes} rejeitados)</span>
                              )}
                            </div>
                          )}
                        </div>
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

      {/* BMP Setup Guide Modal */}
      {showBMPModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Radio className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-white text-base">Ativação Universal de BMP (RFC 7854)</h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Porta de escuta do NetPulse: <code className="text-cyan-300 font-mono">TCP {bmpStatus?.port || 11019}</code>
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowBMPModal(false)}
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
                  onClick={() => setSelectedGuideVendor(v.id as any)}
                  className={`pb-3 px-3 font-semibold transition border-b-2 cursor-pointer ${
                    selectedGuideVendor === v.id
                      ? 'border-cyan-400 text-cyan-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {v.label}
                </button>
              ))}
            </div>

            <div className="p-6 overflow-y-auto space-y-4">
              {bmpGuide?.vendors[selectedGuideVendor] ? (
                <>
                  <div className="flex items-start gap-3 p-3.5 bg-cyan-950/30 border border-cyan-800/60 rounded-xl text-xs text-cyan-300">
                    <ShieldCheck className="h-5 w-5 text-cyan-400 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-semibold text-white">{bmpGuide.vendors[selectedGuideVendor].title}</p>
                      <p className="text-slate-400 mt-0.5">{bmpGuide.vendors[selectedGuideVendor].description}</p>
                    </div>
                  </div>

                  {/* Commands Box */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Comandos de Configuração:
                      </span>
                      <button
                        onClick={() => handleCopy(bmpGuide.vendors[selectedGuideVendor].commands.join('\n'), 1)}
                        className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer"
                      >
                        {copiedIndex === 1 ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        <span>{copiedIndex === 1 ? 'Copiado!' : 'Copiar Tudo'}</span>
                      </button>
                    </div>
                    <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-400 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                      {bmpGuide.vendors[selectedGuideVendor].commands.join('\n')}
                    </pre>
                  </div>

                  {/* Verification Commands */}
                  {bmpGuide.vendors[selectedGuideVendor].verify_commands?.length > 0 && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                          Comandos de Checagem e Diagnóstico:
                        </span>
                        <button
                          onClick={() => handleCopy(bmpGuide.vendors[selectedGuideVendor].verify_commands.join('\n'), 2)}
                          className="flex items-center gap-1 text-xs text-cyan-400 hover:text-cyan-300 cursor-pointer"
                        >
                          {copiedIndex === 2 ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          <span>{copiedIndex === 2 ? 'Copiado!' : 'Copiar'}</span>
                        </button>
                      </div>
                      <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-cyan-300 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                        {bmpGuide.vendors[selectedGuideVendor].verify_commands.join('\n')}
                      </pre>
                    </div>
                  )}
                </>
              ) : (
                <div className="text-center py-8 text-slate-400 text-sm">
                  Carregando instruções...
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950 flex justify-end">
              <button
                onClick={() => setShowBMPModal(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium rounded-xl transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}

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

      {/* Edit Session Description Modal (Opção B - Individual por Sessão) */}
      {editingSession && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-4 animate-in fade-in duration-150">
          <div className="bg-slate-900 border border-slate-700/80 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150">
            <div className="p-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/70">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-950/80 border border-cyan-800 text-cyan-400">
                  <Edit3 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-sm text-slate-100">
                    Editar Descrição da Sessão BGP
                  </h3>
                  <div className="flex items-center gap-2 text-[11px] text-slate-400 mt-0.5">
                    <span className="font-mono text-cyan-300 font-bold">{editingSession.peer_ip}</span>
                    <span>&bull;</span>
                    <span>{editingSession.device_name}</span>
                    <span>&bull;</span>
                    <span className="font-mono text-slate-400">AS{editingSession.remote_as}</span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingSession(null)}
                className="text-slate-400 hover:text-slate-200 p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveSession} className="p-5 space-y-4">
              {editError && (
                <div className="p-3 bg-rose-950/50 border border-rose-800/80 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-rose-400" />
                  <span>{editError}</span>
                </div>
              )}

              {editSuccess && (
                <div className="p-3 bg-emerald-950/50 border border-emerald-800/80 rounded-xl text-xs text-emerald-300 flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                  <span>{editSuccess}</span>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Descrição Exclusiva desta Sessão / Link
                </label>
                <input
                  type="text"
                  value={editAlias}
                  onChange={(e) => setEditAlias(e.target.value)}
                  placeholder="Ex: Link 01 - Primário 10G, Trânsito WIKI, RS1..."
                  autoFocus
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-700 text-sm text-slate-100 focus:outline-none focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition placeholder-slate-600"
                />
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Esta descrição será aplicada <strong>exclusivamente</strong> a esta sessão (<code className="text-cyan-400">{editingSession.peer_ip}</code>), sem afetar as demais sessões do mesmo AS.
                </p>
              </div>

              {editingSession.description && (
                <div className="p-3 rounded-xl bg-slate-950/50 border border-slate-800 text-[11px] space-y-1">
                  <div className="text-slate-400 font-medium">Descrição informada no roteador:</div>
                  <div className="font-mono text-cyan-400/90">{editingSession.description}</div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-800/80">
                <button
                  type="button"
                  onClick={() => setEditingSession(null)}
                  disabled={savingAlias}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-xl transition cursor-pointer disabled:opacity-50"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingAlias}
                  className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 active:bg-cyan-700 text-white text-xs font-semibold rounded-xl shadow-lg shadow-cyan-900/30 transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                >
                  {savingAlias ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Salvar Descrição da Sessão</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
