import React from 'react'
import {
  Server,
  LayoutGrid,
  Table as TableIcon,
  Search,
  Moon,
  HelpCircle,
  RefreshCw,
  ShieldCheck,
  ShieldAlert,
  X,
  Globe,
  Network,
  Zap,
  ChevronDown,
  ChevronUp,
  Route as RouteIcon,
  AlertTriangle,
  CheckCircle2,
  Clock,
  SlidersHorizontal,
  Edit3,
} from 'lucide-react'
import type {
  Device,
  DevicePrependOverview,
  ASPrependGroup,
  PrefixPrependState,
  ASMetadata,
} from '../../services/api'
import { CardSkeleton } from '../common/Skeleton'

export interface TrafficDownloadTabProps {
  selectedPrependDevice: string
  onPrependDeviceChange: (id: string) => void
  downloadViewMode: 'cards' | 'table'
  setDownloadViewMode: (mode: 'cards' | 'table') => void
  prependSearch: string
  setPrependSearch: (s: string) => void
  devices: Device[]
  prependsLoading: boolean
  prependsError: string | null
  prependOverview: DevicePrependOverview | null
  showDownloadHelp: boolean
  setShowDownloadHelp: React.Dispatch<React.SetStateAction<boolean>>
  expandedPeerGroup: string | null
  setExpandedPeerGroup: (id: string | null) => void
  expandedPrefixGroups: Record<string, boolean>
  togglePrefixGroup: (groupId: string) => void
  onRefresh: () => void
  onOpenPrependModal: (prefixState: PrefixPrependState, group?: ASPrependGroup) => void
  density?: 'comfortable' | 'compact'
  asMetadata?: Record<string, ASMetadata>
  isSuperAdmin?: boolean
  onOpenCustomizeAS?: (group: ASPrependGroup) => void
}

export const TrafficDownloadTab: React.FC<TrafficDownloadTabProps> = ({
  selectedPrependDevice,
  onPrependDeviceChange,
  downloadViewMode,
  setDownloadViewMode,
  prependSearch,
  setPrependSearch,
  devices,
  prependsLoading,
  prependsError,
  prependOverview,
  showDownloadHelp,
  setShowDownloadHelp,
  expandedPeerGroup,
  setExpandedPeerGroup,
  expandedPrefixGroups,
  togglePrefixGroup,
  onRefresh,
  onOpenPrependModal,
  density = 'comfortable',
  asMetadata = {},
  isSuperAdmin = false,
  onOpenCustomizeAS,
}) => {
  return (
    <div className="space-y-6">
      {/* Controls Bar for Download */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-slate-400" />
            <select
              value={selectedPrependDevice}
              onChange={(e) => onPrependDeviceChange(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
            >
              <option value="all">🌐 Todos os Links da Rede (Visão Global)</option>
              {devices
                .filter((d) => d.is_bgp !== false)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.host}) - {d.vendor}
                  </option>
                ))}
            </select>
          </div>

          {/* View Mode Toggle: Cards por AS vs Tabela Geral */}
          <div className="flex bg-slate-800/80 p-0.5 rounded-xl border border-slate-700/80 text-xs">
            <button
              type="button"
              onClick={() => setDownloadViewMode('cards')}
              title="Visualização em Cards por Detentor do AS / Operadora"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                downloadViewMode === 'cards'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Cards por AS / Operadora</span>
            </button>
            <button
              type="button"
              onClick={() => setDownloadViewMode('table')}
              title="Visualização Detalhada por Sessão BGP"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                downloadViewMode === 'table'
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Tabela Detalhada</span>
            </button>
          </div>

          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por Operadora, AS, prefixo ou comunidade..."
              value={prependSearch}
              onChange={(e) => setPrependSearch(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 text-slate-200 text-xs rounded-xl pl-8 pr-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none w-56 sm:w-72"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-[11px] text-slate-400">
            <Moon className="h-3.5 w-3.5 text-indigo-400" />
            <span>
              Auto-Sync: <strong>Diário às 03:30 (Madrugada)</strong>
            </span>
          </div>

          {/* Botão de Dicas & Boas Práticas */}
          <button
            type="button"
            onClick={() => setShowDownloadHelp((prev) => !prev)}
            title="Dicas de Engenharia de Download & Zero-Flap"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
              showDownloadHelp
                ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/60 shadow-md shadow-indigo-500/10'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
            }`}
          >
            <HelpCircle className="h-4 w-4 text-indigo-400" />
            <span className="hidden sm:inline">Dicas</span>
          </button>

          <button
            onClick={onRefresh}
            disabled={prependsLoading}
            title="Forçar atualização via SSH no roteador"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${prependsLoading ? 'animate-spin text-indigo-400' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* Informações / Dicas de Engenharia de Download (Retrátil) */}
      {showDownloadHelp && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-700/50 flex items-start gap-3.5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0 mt-0.5">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="text-xs space-y-1.5 flex-1">
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-white text-xs uppercase tracking-wide">
                  Engenharia de Tráfego de Download (AS-Path Prepending & Bloqueio Seletivo)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 text-[10px] font-bold">
                  Zero Flap &bull; Route-Refresh Ativo
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowDownloadHelp(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                title="Fechar dicas"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
            <p className="text-slate-300 text-[11px] leading-relaxed">
              Ajuste o caminho de entrada do seu tráfego por bloco IP e por operadora através de
              Community Tagging de origem. Aplicações em produção são efetivadas com soft-refresh
              sem reiniciar sessões BGP.
            </p>
          </div>
        </div>
      )}

      {prependsError && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
          {prependsError}
        </div>
      )}

      {/* Download Peers & Policy Cards */}
      {prependsLoading ? (
        <div className={`grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 ${density === 'compact' ? 'gap-3.5' : 'gap-6'}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} compact={density === 'compact'} />
          ))}
        </div>
      ) : prependOverview ? (
        <div className="space-y-6">
          {/* Header with Local ASN & Total counts */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-800/60 text-xs text-slate-400">
            <div className="flex items-center gap-2">
              <Globe className="h-4 w-4 text-indigo-400" />
              <span className="font-semibold text-slate-300 uppercase tracking-wider">
                {downloadViewMode === 'cards'
                  ? `Detentores de AS Auditados (${prependOverview.as_groups?.length || 0})`
                  : `Sessões BGP Auditadas (${prependOverview.peers.length})`}
              </span>
            </div>
            {prependOverview.local_as && (
              <span className="font-mono">
                ASN Local do Roteador:{' '}
                <strong className="text-indigo-300 font-mono tracking-tight">
                  AS{prependOverview.local_as}
                </strong>
              </span>
            )}
          </div>

          {/* ================= MODE 1: CARDS POR AS / OPERADORA ================= */}
          {downloadViewMode === 'cards' ? (
            <div>
              {(() => {
                const groups =
                  prependOverview.as_groups && prependOverview.as_groups.length > 0
                    ? prependOverview.as_groups
                    : []

                const filtered = groups.filter((grp) => {
                  const q = prependSearch.toLowerCase()
                  return (
                    grp.group_name.toLowerCase().includes(q) ||
                    grp.remote_as.includes(q) ||
                    grp.community_base.includes(q) ||
                    grp.peer_ips.some((ip) => ip.toLowerCase().includes(q)) ||
                    grp.prefixes.some((p) => p.prefix.toLowerCase().includes(q))
                  )
                })

                if (filtered.length === 0) {
                  return (
                    <div className="p-12 text-center text-slate-400 text-xs bg-slate-900/60 border border-slate-800 rounded-2xl">
                      <Globe className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                      <p className="font-semibold text-slate-300">
                        Nenhum AS ou operadora encontrado
                      </p>
                      <p className="text-slate-500 mt-1">
                        {groups.length === 0
                          ? 'Não foram detectados grupos de AS ou comunidades configuradas neste roteador.'
                          : 'Ajuste o filtro de busca ou alterne para a visualização em tabela detalhada.'}
                      </p>
                    </div>
                  )
                }

                return (
                  <div className={`grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 ${density === 'compact' ? 'gap-3.5' : 'gap-6'}`}>
                    {filtered.map((grp) => {
                      const meta = asMetadata[grp.remote_as]
                      const asTitle = meta?.alias || grp.group_name
                      const asImageUrl = meta?.image_url

                      return (
                      <div
                        key={grp.id}
                        className="flex flex-col bg-slate-900/90 border border-slate-800/90 hover:border-slate-700 rounded-2xl shadow-xl overflow-hidden transition duration-200"
                      >
                        {/* AS Card Header */}
                        <div className={`border-b border-slate-800/80 bg-slate-950/40 ${density === 'compact' ? 'p-3.5' : 'p-5'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3.5">
                              {/* Dedicated Image Area */}
                              <div
                                onClick={() => isSuperAdmin && onOpenCustomizeAS && onOpenCustomizeAS(grp)}
                                className={`rounded-2xl bg-slate-800/90 border border-slate-700 flex items-center justify-center shrink-0 shadow-md overflow-hidden relative ${
                                  isSuperAdmin && onOpenCustomizeAS ? 'hover:border-cyan-500/60 cursor-pointer group' : ''
                                } ${density === 'compact' ? 'h-9 w-9' : 'h-12 w-12'}`}
                                title={isSuperAdmin ? 'Clique para trocar imagem ou editar AS' : undefined}
                              >
                                {asImageUrl ? (
                                  <img
                                    src={
                                      asImageUrl.startsWith('http') || asImageUrl.startsWith('data:')
                                        ? asImageUrl
                                        : `http://localhost:8080${asImageUrl}`
                                    }
                                    alt={asTitle}
                                    className="w-full h-full object-contain p-1"
                                    onError={(e) => {
                                      ;(e.target as HTMLElement).style.display = 'none'
                                    }}
                                  />
                                ) : grp.role === 'ix_ptt' ? (
                                  <Globe
                                    className={`${density === 'compact' ? 'h-4 w-4' : 'h-6 w-6'} text-purple-400`}
                                  />
                                ) : (
                                  <Network
                                    className={`${density === 'compact' ? 'h-4 w-4' : 'h-6 w-6'} text-indigo-400`}
                                  />
                                )}
                                {isSuperAdmin && onOpenCustomizeAS && (
                                  <div className="absolute inset-0 bg-cyan-950/70 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                    <Edit3 className="h-3.5 w-3.5 text-cyan-300" />
                                  </div>
                                )}
                              </div>

                              <div>
                                <h4 className="font-bold text-white text-base leading-snug">
                                  {asTitle}
                                </h4>
                                {grp.device_name && (
                                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                    <span
                                      className="font-mono text-[11px] font-bold text-slate-200 bg-slate-800/90 px-2 py-0.5 rounded border border-slate-700 flex items-center gap-1"
                                      title={`Roteador BGP: ${grp.device_name}`}
                                    >
                                      <Server className="h-3 w-3 text-indigo-400" />
                                      {grp.device_name}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* SuperAdmin Edit Button */}
                            {isSuperAdmin && onOpenCustomizeAS && (
                              <button
                                type="button"
                                onClick={() => onOpenCustomizeAS(grp)}
                                className="p-1.5 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-cyan-300 border border-slate-700/80 transition cursor-pointer shrink-0"
                                title="Editar Nome e Imagem do AS (Super Admin)"
                              >
                                <Edit3 className="h-3.5 w-3.5" />
                              </button>
                            )}
                          </div>

                          {/* Unified Sessions Bar */}
                          <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 text-slate-300">
                              <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                              <span className="font-semibold text-[11px]">
                                {grp.peer_count}{' '}
                                {grp.peer_count === 1
                                  ? 'Sessão BGP vinculada'
                                  : 'Sessões BGP unificadas'}
                              </span>
                              <span className="text-[10px] text-slate-500 font-sans hidden sm:inline">
                                (IPv4 & IPv6)
                              </span>
                            </div>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedPeerGroup(
                                  expandedPeerGroup === grp.id ? null : grp.id
                                )
                              }
                              className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer"
                            >
                              <span>
                                {expandedPeerGroup === grp.id ? 'Ocultar IPs' : 'Ver IPs'}
                              </span>
                              {expandedPeerGroup === grp.id ? (
                                <ChevronUp className="h-3 w-3" />
                              ) : (
                                <ChevronDown className="h-3 w-3" />
                              )}
                            </button>
                          </div>

                          {/* Collapsible Peer IPs list */}
                          {expandedPeerGroup === grp.id && (
                            <div className="mt-2.5 p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-[11px] font-mono text-slate-300 flex flex-wrap gap-1.5 animate-in fade-in duration-150">
                              {grp.peer_ips.map((ip, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-200"
                                >
                                  {ip}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Body: Announced Prefixes */}
                        <div className="p-4 flex-1 flex flex-col justify-between bg-slate-900/40">
                          <div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <RouteIcon className="h-3.5 w-3.5 text-indigo-400" />
                                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                  Prefixos Anunciados ({grp.prefixes.length})
                                </span>
                                <span className="text-[10px] text-slate-500 hidden sm:inline">
                                  Engenharia por Bloco
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => togglePrefixGroup(grp.id)}
                                className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer transition py-0.5 px-1.5 rounded hover:bg-indigo-950/40"
                              >
                                <span>
                                  {expandedPrefixGroups[grp.id]
                                    ? 'Ocultar Prefixos'
                                    : 'Ver Prefixos'}
                                </span>
                                {expandedPrefixGroups[grp.id] ? (
                                  <ChevronUp className="h-3 w-3" />
                                ) : (
                                  <ChevronDown className="h-3 w-3" />
                                )}
                              </button>
                            </div>

                            {expandedPrefixGroups[grp.id] && (
                              <div className="mt-3 space-y-2 animate-in fade-in duration-150">
                                {grp.prefixes.map((pfx) => (
                                  <div
                                    key={pfx.id}
                                    className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                                  >
                                    <div className="space-y-1">
                                      <div className="flex items-center gap-2">
                                        <span className="font-mono font-bold text-white text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                                          {pfx.prefix}
                                        </span>
                                        {pfx.is_blocked ? (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800 inline-flex items-center gap-1">
                                            <AlertTriangle className="h-3 w-3 text-rose-400" />
                                            Bloqueado (Deny)
                                          </span>
                                        ) : pfx.prepend_count === 0 ? (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800 inline-flex items-center gap-1">
                                            <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                            0P (Primário)
                                          </span>
                                        ) : (
                                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800 inline-flex items-center gap-1">
                                            <Clock className="h-3 w-3 text-amber-400" />
                                            {pfx.prepend_count}x Prepend ({pfx.prepend_count}P)
                                          </span>
                                        )}
                                      </div>
                                    </div>

                                    <button
                                      type="button"
                                      onClick={() => onOpenPrependModal(pfx, grp)}
                                      className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition cursor-pointer self-start sm:self-auto"
                                    >
                                      <SlidersHorizontal className="h-3.5 w-3.5" />
                                      <span>Ajustar Prepend</span>
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* Footer Info */}
                          {expandedPrefixGroups[grp.id] && (
                            <div className="mt-3 pt-2 text-[10px] text-slate-500 flex items-center gap-1.5 border-t border-slate-800/40 animate-in fade-in duration-150">
                              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                              <span>
                                Ajustar este bloco afeta simultaneamente todas as {grp.peer_count}{' '}
                                sessões deste AS sem repetição.
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    )})}
                  </div>
                )
              })()}
            </div>
          ) : (
            /* ================= MODE 2: TABELA DETALHADA ================= */
            <div className="space-y-6">
              {/* Peers / Upstreams Grid */}
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-3">
                  <Globe className="h-4 w-4 text-indigo-400" />
                  <span>Sessões BGP Individuais ({prependOverview.peers.length})</span>
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {prependOverview.peers.map((peer) => (
                    <div
                      key={peer.id}
                      className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md space-y-3"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <span className="text-sm font-bold text-white block">
                            {peer.peer_name || peer.peer_ip}
                          </span>
                          <span className="text-xs text-slate-400 font-mono">
                            IP: {peer.peer_ip} {peer.remote_as && `(AS${peer.remote_as})`}
                          </span>
                        </div>
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            peer.status === 'Established'
                              ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                              : 'bg-amber-950 text-amber-400 border border-amber-800'
                          }`}
                        >
                          {peer.status}
                        </span>
                      </div>

                      <div className="text-xs space-y-1 font-mono text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-sans">Route-Policy:</span>
                          <span
                            className="text-indigo-300 truncate max-w-[160px]"
                            title={peer.policy_name}
                          >
                            {peer.policy_name || 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-sans">Prepend Padrão:</span>
                          <span className="font-bold text-amber-300">
                            {peer.prepend_count === 0
                              ? '0 (Primário)'
                              : `${peer.prepend_count}x (${peer.prepend_count}P)`}
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Prefixes Table */}
              <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RouteIcon className="h-4 w-4 text-indigo-400" />
                    <span className="text-sm font-semibold text-white">
                      Prefixos Anunciados e Comunidades Tagged
                    </span>
                    <span className="text-xs text-slate-500">
                      ({prependOverview.prefixes.length} blocos)
                    </span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950/40">
                        <th className="py-3 px-4">Prefixo Anunciado</th>
                        <th className="py-3 px-4">Destino / Upstream</th>
                        <th className="py-3 px-4">Prepend Aplicado</th>
                        <th className="py-3 px-4">BGP Community</th>
                        <th className="py-3 px-4">Status de Entrada Estimado</th>
                        <th className="py-3 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60 font-mono">
                      {prependOverview.prefixes.map((p) => {
                        const matchingGroup = prependOverview.as_groups?.find(
                          (g) =>
                            g.peers.some((pr) => pr.peer_ip === p.peer_ip) ||
                            g.peer_ips.includes(p.peer_ip)
                        )

                        return (
                          <tr key={p.id} className="hover:bg-slate-800/30 transition">
                            <td className="py-3 px-4">
                              <span className="px-2 py-0.5 rounded font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                                {p.prefix}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-sans text-slate-200">
                              {p.peer_name}{' '}
                              <span className="text-slate-500 font-mono text-[11px]">
                                ({p.peer_ip})
                              </span>
                            </td>
                            <td className="py-3 px-4">
                              {p.is_blocked ? (
                                <span className="px-2 py-0.5 rounded font-bold text-rose-300 bg-rose-950/60 border border-rose-800/60 inline-flex items-center gap-1">
                                  <AlertTriangle className="h-3 w-3" />
                                  Bloqueado (Deny)
                                </span>
                              ) : (
                                <span className="px-2 py-0.5 rounded font-bold text-amber-300 bg-amber-950/60 border border-amber-800/60">
                                  {p.prepend_count === 0
                                    ? 'Nenhum (0P / Primário)'
                                    : `${p.prepend_count}x Prepend (${p.prepend_count}P)`}
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-300">
                              {p.community || '-'}
                            </td>
                            <td className="py-3 px-4 font-sans">
                              {p.is_blocked ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950/80 text-rose-400 border border-rose-800">
                                  <ShieldAlert className="h-3 w-3" />
                                  Anúncio Interrompido
                                </span>
                              ) : p.prepend_count > 0 ? (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-800">
                                  <Clock className="h-3 w-3" />
                                  Despriorizado (+{p.prepend_count} saltos AS)
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                                  <CheckCircle2 className="h-3 w-3" />
                                  Prioritário (Caminho Mais Curto)
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 font-sans text-right">
                              <button
                                onClick={() => onOpenPrependModal(p, matchingGroup)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 hover:text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                              >
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                                <span>Ajustar Prepend</span>
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-12 text-center text-slate-400 text-xs bg-slate-900/60 border border-slate-800 rounded-2xl">
          Nenhum dado de prepend disponível.
        </div>
      )}
    </div>
  )
}
