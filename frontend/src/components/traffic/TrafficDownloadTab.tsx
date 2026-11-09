import React, { useState, useMemo } from 'react'
import {
  Server,
  LayoutGrid,
  Table as TableIcon,
  Search,
  Moon,
  HelpCircle,
  RefreshCw,
  ShieldCheck,
  X,
  Globe,
  Network,
  Zap,
  ChevronDown,
  ChevronUp,
  Route as RouteIcon,
  SlidersHorizontal,
  Edit3,
  Crown,
  Layers,
  Save,
} from 'lucide-react'
import type {
  Device,
  DevicePrependOverview,
  ASPrependGroup,
  PrefixPrependState,
  ASMetadata,
} from '../../services/api'
import { CardSkeleton } from '../common/Skeleton'
import { getBGPMasterDevice } from '../../utils/bgpMaster'
import { BatchPrependModal } from './BatchPrependModal'
import type { BatchPrependTarget } from './trafficHelpers'

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
  onApplyBatchPrepend?: (targets: BatchPrependTarget[], prependCount: number, isBlock: boolean) => Promise<void>
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
  onApplyBatchPrepend,
  density = 'comfortable',
  asMetadata = {},
  isSuperAdmin = false,
  onOpenCustomizeAS,
}) => {
  const [selectedTargets, setSelectedTargets] = useState<Map<string, BatchPrependTarget>>(new Map())
  const [isBatchModalOpen, setIsBatchModalOpen] = useState(false)
  const [batchModalMode, setBatchModalMode] = useState<'save_preview' | 'edit_batch'>('save_preview')
  const [openGroupMenuId, setOpenGroupMenuId] = useState<string | null>(null)

  // Automatic perception of the Central BGP Master Router
  const masterDevice = useMemo(() => getBGPMasterDevice(devices), [devices])

  // Selection handlers
  const toggleTarget = (target: BatchPrependTarget) => {
    setSelectedTargets((prev) => {
      const next = new Map(prev)
      if (next.has(target.id)) {
        next.delete(target.id)
      } else {
        next.set(target.id, target)
      }
      return next
    })
  }

  // Handler for modifying prepend directly on a specific block
  const handleTargetPrependChange = (
    pfx: PrefixPrependState,
    grp: ASPrependGroup,
    value: string
  ) => {
    const isBlock = value === 'deny'
    const count = isBlock ? 0 : parseInt(value, 10)
    const targetId = `${pfx.peer_ip}_${pfx.prefix}`

    setSelectedTargets((prev) => {
      const next = new Map(prev)
      next.set(targetId, {
        id: targetId,
        prefix: pfx.prefix,
        peerIp: pfx.peer_ip,
        peerName: grp.group_name || pfx.peer_name,
        remoteAs: grp.remote_as,
        communityBase: grp.community_base,
        currentCommunity: pfx.community,
        asGroupId: grp.id,
        currentPrependCount: pfx.prepend_count,
        currentIsBlock: pfx.is_blocked,
        newPrependCount: count,
        newIsBlock: isBlock,
      })
      return next
    })
  }

  // Handler for applying batch prepend to selected items of a specific AS group
  const applyGroupBatchPrepend = (
    grp: ASPrependGroup,
    prependCount: number,
    isBlock: boolean
  ) => {
    setSelectedTargets((prev) => {
      const next = new Map(prev)
      const hasSelectedInGroup = grp.prefixes.some((pfx) => next.has(`${pfx.peer_ip}_${pfx.prefix}`))
      const targetsToApply = hasSelectedInGroup
        ? grp.prefixes.filter((pfx) => next.has(`${pfx.peer_ip}_${pfx.prefix}`))
        : grp.prefixes

      targetsToApply.forEach((pfx) => {
        const id = `${pfx.peer_ip}_${pfx.prefix}`
        next.set(id, {
          id,
          prefix: pfx.prefix,
          peerIp: pfx.peer_ip,
          peerName: grp.group_name || pfx.peer_name,
          remoteAs: grp.remote_as,
          communityBase: grp.community_base,
          currentCommunity: pfx.community,
          asGroupId: grp.id,
          currentPrependCount: pfx.prepend_count,
          currentIsBlock: pfx.is_blocked,
          newPrependCount: prependCount,
          newIsBlock: isBlock,
        })
      })
      return next
    })
    setOpenGroupMenuId(null)
  }

  // Handler for overriding prepends for all currently selected targets
  const handleBatchOverride = (count: number, isBlock: boolean) => {
    setSelectedTargets((prev) => {
      const next = new Map(prev)
      next.forEach((target, key) => {
        next.set(key, {
          ...target,
          newPrependCount: count,
          newIsBlock: isBlock,
        })
      })
      return next
    })
  }

  const toggleGroupTargets = (grp: ASPrependGroup) => {
    setSelectedTargets((prev) => {
      const next = new Map(prev)
      const allSelected = grp.prefixes.length > 0 && grp.prefixes.every((pfx) => next.has(`${pfx.peer_ip}_${pfx.prefix}`))
      if (allSelected) {
        grp.prefixes.forEach((pfx) => next.delete(`${pfx.peer_ip}_${pfx.prefix}`))
      } else {
        grp.prefixes.forEach((pfx) => {
          const id = `${pfx.peer_ip}_${pfx.prefix}`
          const existing = next.get(id)
          next.set(id, {
            id,
            prefix: pfx.prefix,
            peerIp: pfx.peer_ip,
            peerName: grp.group_name || pfx.peer_name,
            remoteAs: grp.remote_as,
            communityBase: grp.community_base,
            currentCommunity: pfx.community,
            asGroupId: grp.id,
            currentPrependCount: pfx.prepend_count,
            currentIsBlock: pfx.is_blocked,
            newPrependCount: existing?.newPrependCount !== undefined ? existing.newPrependCount : pfx.prepend_count,
            newIsBlock: existing?.newIsBlock !== undefined ? existing.newIsBlock : pfx.is_blocked,
          })
        })
      }
      return next
    })
  }

  const toggleAllTargets = () => {
    if (!prependOverview) return
    setSelectedTargets((prev) => {
      const next = new Map(prev)
      const allCount = prependOverview.prefixes.length
      if (next.size === allCount && allCount > 0) {
        return new Map()
      }
      prependOverview.prefixes.forEach((pfx) => {
        const id = `${pfx.peer_ip}_${pfx.prefix}`
        const matchingGroup = prependOverview.as_groups?.find(
          (g) => g.peers.some((pr) => pr.peer_ip === pfx.peer_ip) || g.peer_ips.includes(pfx.peer_ip)
        )
        const existing = next.get(id)
        next.set(id, {
          id,
          prefix: pfx.prefix,
          peerIp: pfx.peer_ip,
          peerName: pfx.peer_name,
          remoteAs: matchingGroup?.remote_as,
          communityBase: matchingGroup?.community_base,
          currentCommunity: pfx.community,
          asGroupId: matchingGroup?.id,
          currentPrependCount: pfx.prepend_count,
          currentIsBlock: pfx.is_blocked,
          newPrependCount: existing?.newPrependCount !== undefined ? existing.newPrependCount : pfx.prepend_count,
          newIsBlock: existing?.newIsBlock !== undefined ? existing.newIsBlock : pfx.is_blocked,
        })
      })
      return next
    })
  }

  const clearSelection = () => {
    setSelectedTargets(new Map())
  }
  return (
    <div className="space-y-6">
      {/* Controls Bar for Download */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-[#1C202C] border border-[#242836] rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-slate-400" />
            <select
              value={selectedPrependDevice}
              onChange={(e) => onPrependDeviceChange(e.target.value)}
              className="bg-[#161922] border border-[#2D3345] text-slate-200 text-xs rounded-xl px-3 py-2 font-medium focus:ring-2 focus:ring-[#3B5B8C] focus:outline-none cursor-pointer"
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
          <div className="flex bg-[#161922] p-0.5 rounded-xl border border-[#242836] text-xs">
            <button
              type="button"
              onClick={() => setDownloadViewMode('cards')}
              title="Visualização em Cards por Detentor do AS / Operadora"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                downloadViewMode === 'cards'
                  ? 'bg-[#3B5B8C] text-white shadow-xs'
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
                  ? 'bg-[#3B5B8C] text-white shadow-xs'
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
              className="bg-[#161922] border border-[#2D3345] text-slate-200 text-xs rounded-xl pl-8 pr-3 py-2 focus:ring-2 focus:ring-[#3B5B8C] focus:outline-none w-56 sm:w-72"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#161922] border border-[#242836] text-[11px] text-slate-400">
            <Moon className="h-3.5 w-3.5 text-[#93B4E6]" />
            <span>
              Auto-Sync: <strong>Diário às 03:30 (Madrugada)</strong>
            </span>
          </div>

          {/* Botão de Dicas & Boas Práticas */}
          <button
            type="button"
            onClick={() => setShowDownloadHelp((prev) => !prev)}
            title="Dicas de Engenharia de Download & Zero-Flap"
            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition cursor-pointer ${
              showDownloadHelp
                ? 'bg-[#25334D] text-blue-200 border-[#3B5B8C]/60 shadow-xs'
                : 'bg-[#1E2330] hover:bg-[#252C3D] text-slate-300 border-[#2D3345]'
            }`}
          >
            <HelpCircle className="h-4 w-4 text-[#93B4E6]" />
            <span className="hidden sm:inline">Dicas</span>
          </button>

          <button
            onClick={onRefresh}
            disabled={prependsLoading}
            title="Forçar atualização via SSH no roteador"
            className="p-2 bg-[#1E2330] hover:bg-[#252C3D] text-slate-300 rounded-xl border border-[#2D3345] transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw
              className={`h-4 w-4 ${prependsLoading ? 'animate-spin text-[#4A72B2]' : ''}`}
            />
          </button>
        </div>
      </div>

      {/* BGP Master Controller Perception Banner */}
      <div className="p-4 rounded-2xl bg-[#1C202C] border border-[#242836] shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-start sm:items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#25334D] border border-[#3B5B8C]/40 flex items-center justify-center text-[#E5A93C] shrink-0">
            <Crown className="h-5 w-5" />
          </div>
          <div className="space-y-0.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-white text-xs">
                Roteador BGP Master / Controlador:
              </span>
              <span className="font-mono font-semibold text-xs text-[#93B4E6] bg-[#161922] px-2 py-0.5 rounded-md border border-[#242836]">
                {masterDevice?.name || 'BGP-RT.01.PA.PIRB.01'}
              </span>
              {masterDevice?.host && (
                <span className="text-[11px] text-slate-400 font-mono">
                  ({masterDevice.host})
                </span>
              )}
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Políticas de anúncio BGP, prepends e communities de origem são centralizadas neste equipamento e distribuídas via iBGP.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto shrink-0">
          <span className="text-[11px] text-[#2E9E6B] font-medium flex items-center gap-1.5 bg-[#161922] px-3 py-1.5 rounded-xl border border-[#242836]">
            <span className="w-1.5 h-1.5 rounded-full bg-[#2E9E6B]"></span>
            Percepção Automática Ativa
          </span>
        </div>
      </div>

      {/* Informações / Dicas de Engenharia de Download (Retrátil) */}
      {showDownloadHelp && (
        <div className="p-4 rounded-2xl bg-[#1C202C] border border-[#242836] flex items-start gap-3.5 shadow-md animate-in fade-in slide-in-from-top-2 duration-150">
          <div className="p-2 rounded-xl bg-[#25334D] border border-[#3B5B8C]/30 text-[#93B4E6] shrink-0 mt-0.5">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div className="text-xs space-y-1.5 flex-1">
            <div className="flex items-center justify-between">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-bold text-white text-xs uppercase tracking-wide">
                  Engenharia de Tráfego de Download (AS-Path Prepending & Bloqueio Seletivo)
                </span>
                <span className="text-[11px] font-medium text-[#2E9E6B] flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-[#2E9E6B]"></span>
                  Zero Flap &bull; Route-Refresh Ativo
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowDownloadHelp(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-[#1E2330] transition cursor-pointer"
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
                      const isAllGroupSelected =
                        grp.prefixes.length > 0 &&
                        grp.prefixes.every((pfx) =>
                          selectedTargets.has(`${pfx.peer_ip}_${pfx.prefix}`)
                        )
                      const isSomeGroupSelected = grp.prefixes.some((pfx) =>
                        selectedTargets.has(`${pfx.peer_ip}_${pfx.prefix}`)
                      )
                      const isGroupOnSecondary =
                        masterDevice && grp.device_name && grp.device_name !== masterDevice.name

                      return (
                      <div
                        key={grp.id}
                        className="flex flex-col bg-[#1C202C] border border-[#242836] hover:border-[#2D3345] rounded-2xl shadow-md overflow-hidden transition duration-200"
                      >
                        {/* AS Card Header */}
                        <div className={`border-b border-[#242836] bg-[#181C26] ${density === 'compact' ? 'p-3.5' : 'p-5'}`}>
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex items-center gap-3">
                              {/* Checkbox to select entire AS group */}
                              <input
                                type="checkbox"
                                checked={isAllGroupSelected}
                                ref={(el) => {
                                  if (el) el.indeterminate = isSomeGroupSelected && !isAllGroupSelected
                                }}
                                onChange={() => toggleGroupTargets(grp)}
                                className="h-4 w-4 rounded border-[#2D3345] bg-[#161922] text-[#3B5B8C] focus:ring-0 cursor-pointer shrink-0"
                                title={
                                  isAllGroupSelected
                                    ? 'Desmarcar todos os prefixos deste AS'
                                    : 'Selecionar todos os prefixos deste AS para alteração em lote'
                                }
                              />

                              {/* Dedicated Image Area */}
                              <div
                                onClick={() => isSuperAdmin && onOpenCustomizeAS && onOpenCustomizeAS(grp)}
                                className={`rounded-2xl bg-[#161922] border border-[#242836] flex items-center justify-center shrink-0 shadow-sm overflow-hidden relative ${
                                  isSuperAdmin && onOpenCustomizeAS ? 'hover:border-[#3B5B8C] cursor-pointer group' : ''
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
                                    className={`${density === 'compact' ? 'h-4 w-4' : 'h-6 w-6'} text-[#93B4E6]`}
                                  />
                                ) : (
                                  <Network
                                    className={`${density === 'compact' ? 'h-4 w-4' : 'h-6 w-6'} text-[#4A72B2]`}
                                  />
                                )}
                                {isSuperAdmin && onOpenCustomizeAS && (
                                  <div className="absolute inset-0 bg-[#161922]/80 opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                    <Edit3 className="h-3.5 w-3.5 text-[#93B4E6]" />
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
                                      className="font-mono text-[11px] text-slate-400 flex items-center gap-1.5"
                                      title={
                                        isGroupOnSecondary
                                          ? `Sessão física no roteador ${grp.device_name}, gerenciada centralmente no Master ${masterDevice?.name}`
                                          : `Roteador BGP: ${grp.device_name}`
                                      }
                                    >
                                      <Server className="h-3 w-3 text-slate-500" />
                                      {grp.device_name}
                                      {isGroupOnSecondary ? (
                                        <>
                                          <span className="text-slate-600">&bull;</span>
                                          <span className="text-[#93B4E6] text-[10px] font-sans font-medium">
                                            Controlado no Master
                                          </span>
                                        </>
                                      ) : (
                                        <Crown className="h-3 w-3 text-[#E5A93C]" />
                                      )}
                                    </span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {/* Additional Button for Multi-block selection in this AS */}
                              {(() => {
                                const selectedInGroup = grp.prefixes.filter((p) =>
                                  selectedTargets.has(`${p.peer_ip}_${p.prefix}`)
                                )
                                if (selectedInGroup.length === 0) return null

                                return (
                                  <div className="relative">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setOpenGroupMenuId(
                                          openGroupMenuId === grp.id ? null : grp.id
                                        )
                                      }
                                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#25334D] hover:bg-[#3B5B8C] text-slate-200 hover:text-white text-xs font-semibold border border-[#3B5B8C]/40 shadow-xs transition cursor-pointer"
                                      title="Ajustar prepends dos blocos selecionados deste AS"
                                    >
                                      <SlidersHorizontal className="h-3.5 w-3.5 text-[#93B4E6]" />
                                      <span>Ajustar ({selectedInGroup.length})</span>
                                      <ChevronDown className="h-3 w-3 text-slate-400" />
                                    </button>

                                    {openGroupMenuId === grp.id && (
                                      <div className="absolute right-0 mt-1.5 w-60 rounded-xl bg-[#1C202C] border border-[#2D3345] shadow-2xl p-1.5 z-40 space-y-1 animate-in fade-in duration-150">
                                        <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-[#242836] pb-1">
                                          Definir para {selectedInGroup.length} {selectedInGroup.length === 1 ? 'bloco' : 'blocos'}:
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => applyGroupBatchPrepend(grp, 0, false)}
                                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-[#2E9E6B] hover:bg-[#161922] transition flex items-center justify-between cursor-pointer"
                                        >
                                          <span>0P (Primário / Sem Prepend)</span>
                                          <span className="text-[10px] bg-[#161922] px-1.5 py-0.5 rounded text-emerald-400">0P</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => applyGroupBatchPrepend(grp, 1, false)}
                                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-[#D99B26] hover:bg-[#161922] transition flex items-center justify-between cursor-pointer"
                                        >
                                          <span>1x Prepend (+1 Salto AS)</span>
                                          <span className="text-[10px] bg-[#161922] px-1.5 py-0.5 rounded text-amber-400">1P</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => applyGroupBatchPrepend(grp, 2, false)}
                                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-[#D99B26] hover:bg-[#161922] transition flex items-center justify-between cursor-pointer"
                                        >
                                          <span>2x Prepend (+2 Saltos AS)</span>
                                          <span className="text-[10px] bg-[#161922] px-1.5 py-0.5 rounded text-amber-400">2P</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => applyGroupBatchPrepend(grp, 3, false)}
                                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-[#D99B26] hover:bg-[#161922] transition flex items-center justify-between cursor-pointer"
                                        >
                                          <span>3x Prepend (+3 Saltos AS)</span>
                                          <span className="text-[10px] bg-[#161922] px-1.5 py-0.5 rounded text-amber-400">3P</span>
                                        </button>
                                        <button
                                          type="button"
                                          onClick={() => applyGroupBatchPrepend(grp, 0, true)}
                                          className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs text-[#D9534F] hover:bg-[#161922] transition flex items-center justify-between cursor-pointer"
                                        >
                                          <span>Bloquear Anúncio (Deny)</span>
                                          <span className="text-[10px] bg-[#161922] px-1.5 py-0.5 rounded text-rose-400">Deny</span>
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                )
                              })()}

                              {/* SuperAdmin Edit Button */}
                              {isSuperAdmin && onOpenCustomizeAS && (
                                <button
                                  type="button"
                                  onClick={() => onOpenCustomizeAS(grp)}
                                  className="p-1.5 rounded-lg bg-[#1E2330] hover:bg-[#252C3D] text-slate-400 hover:text-white border border-[#2D3345] transition cursor-pointer shrink-0"
                                  title="Editar Nome e Imagem do AS (Super Admin)"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          {/* Unified Sessions Bar */}
                          <div className="mt-3 pt-3 border-t border-[#242836] flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2 text-slate-300">
                              <Zap className="h-3.5 w-3.5 text-[#D99B26] shrink-0" />
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
                              className="text-[11px] text-[#93B4E6] hover:text-white font-medium flex items-center gap-1 cursor-pointer"
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
                            <div className="mt-2.5 p-2.5 rounded-xl bg-[#161922] border border-[#242836] text-[11px] font-mono text-slate-300 flex flex-wrap gap-2 animate-in fade-in duration-150">
                              {grp.peer_ips.map((ip, idx) => (
                                <span
                                  key={idx}
                                  className="text-[#93B4E6]"
                                >
                                  {ip}
                                </span>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Body: Announced Prefixes */}
                        <div className="p-4 flex-1 flex flex-col justify-between bg-[#1C202C]">
                          <div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <RouteIcon className="h-3.5 w-3.5 text-[#4A72B2]" />
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
                                className="text-[11px] text-[#93B4E6] hover:text-white font-medium flex items-center gap-1 cursor-pointer transition py-0.5 px-1.5 rounded hover:bg-[#1E2330]"
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
                                {grp.prefixes.map((pfx) => {
                                  const targetId = `${pfx.peer_ip}_${pfx.prefix}`
                                  const target = selectedTargets.get(targetId)
                                  const isSelected = selectedTargets.has(targetId)
                                  const currentPrependCount =
                                    target?.newPrependCount !== undefined
                                      ? target.newPrependCount
                                      : pfx.prepend_count
                                  const currentIsBlock =
                                    target?.newIsBlock !== undefined ? target.newIsBlock : pfx.is_blocked
                                  const isModified =
                                    target !== undefined &&
                                    ((target.newPrependCount !== undefined &&
                                      target.newPrependCount !== pfx.prepend_count) ||
                                      (target.newIsBlock !== undefined &&
                                        target.newIsBlock !== pfx.is_blocked))
                                  const selectValue = currentIsBlock ? 'deny' : String(currentPrependCount)

                                  return (
                                    <div
                                      key={pfx.id}
                                      className={`p-3 rounded-xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 ${
                                        isSelected
                                          ? 'bg-[#1E2536] border-[#3B5B8C]'
                                          : 'bg-[#161922] border-[#242836] hover:border-[#2D3345]'
                                      }`}
                                    >
                                      <div className="space-y-1">
                                        <div className="flex flex-wrap items-center gap-3">
                                          <input
                                            type="checkbox"
                                            checked={isSelected}
                                            onChange={() =>
                                              toggleTarget({
                                                id: targetId,
                                                prefix: pfx.prefix,
                                                peerIp: pfx.peer_ip,
                                                peerName: grp.group_name || pfx.peer_name,
                                                remoteAs: grp.remote_as,
                                                communityBase: grp.community_base,
                                                currentCommunity: pfx.community,
                                                asGroupId: grp.id,
                                                currentPrependCount: pfx.prepend_count,
                                                currentIsBlock: pfx.is_blocked,
                                                newPrependCount: currentPrependCount,
                                                newIsBlock: currentIsBlock,
                                              })
                                            }
                                            className="h-4 w-4 rounded border-[#2D3345] bg-[#161922] text-[#3B5B8C] focus:ring-0 cursor-pointer shrink-0"
                                            title="Selecionar para alteração em lote"
                                          />
                                          <span className="font-mono font-semibold text-slate-100 text-xs">
                                            {pfx.prefix}
                                          </span>

                                          {/* Prepend selector directly on the block */}
                                          <div className="flex items-center gap-2">
                                            <select
                                              value={selectValue}
                                              onChange={(e) => handleTargetPrependChange(pfx, grp, e.target.value)}
                                              className={`text-xs font-semibold rounded-lg px-2.5 py-1 transition cursor-pointer border focus:ring-1 focus:ring-[#3B5B8C] focus:outline-none ${
                                                currentIsBlock
                                                  ? 'bg-rose-950/40 text-rose-300 border-rose-800/60'
                                                  : currentPrependCount === 0
                                                  ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                                                  : 'bg-amber-950/40 text-amber-300 border-amber-800/60'
                                              }`}
                                              title="Clique para alterar o prepend diretamente neste bloco"
                                            >
                                              <option value="0" className="bg-[#161922] text-emerald-300">0P (Primário / Sem Prepend)</option>
                                              <option value="1" className="bg-[#161922] text-amber-300">1x Prepend (1P)</option>
                                              <option value="2" className="bg-[#161922] text-amber-300">2x Prepend (2P)</option>
                                              <option value="3" className="bg-[#161922] text-amber-300">3x Prepend (3P)</option>
                                              <option value="deny" className="bg-[#161922] text-rose-300">Bloqueado (Deny)</option>
                                            </select>

                                            {isModified && (
                                              <span className="text-[10px] text-[#93B4E6] font-medium flex items-center gap-1 bg-[#161922] px-1.5 py-0.5 rounded border border-[#3B5B8C]/40">
                                                <span className="w-1.5 h-1.5 rounded-full bg-[#93B4E6] animate-pulse"></span>
                                                Modificado
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>

                                      <button
                                        type="button"
                                        onClick={() => onOpenPrependModal(pfx, grp)}
                                        className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#25334D] hover:bg-[#3B5B8C] text-slate-300 hover:text-white text-xs font-medium border border-[#3B5B8C]/40 transition cursor-pointer self-start sm:self-auto shrink-0"
                                      >
                                        <SlidersHorizontal className="h-3.5 w-3.5" />
                                        <span>Ajustar Prepend</span>
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          {/* Footer Info */}
                          {expandedPrefixGroups[grp.id] && (
                            <div className="mt-3 pt-2 text-[10px] text-slate-500 flex items-center gap-1.5 border-t border-[#242836] animate-in fade-in duration-150">
                              <ShieldCheck className="h-3.5 w-3.5 text-[#2E9E6B] shrink-0" />
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
                      className="p-4 rounded-2xl bg-[#1C202C] border border-[#242836] shadow-sm space-y-3"
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
                          className={`text-xs font-medium inline-flex items-center gap-1.5 ${
                            peer.status === 'Established'
                              ? 'text-[#2E9E6B]'
                              : 'text-[#D99B26]'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${peer.status === 'Established' ? 'bg-[#2E9E6B]' : 'bg-[#D99B26]'}`}></span>
                          {peer.status}
                        </span>
                      </div>

                      <div className="text-xs space-y-1 font-mono text-slate-300 bg-[#161922] p-2.5 rounded-xl border border-[#242836]">
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-sans">Route-Policy:</span>
                          <span
                            className="text-[#93B4E6] truncate max-w-[160px]"
                            title={peer.policy_name}
                          >
                            {peer.policy_name || 'N/A'}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-sans">Prepend Padrão:</span>
                          <span className="font-bold text-[#D99B26]">
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
              <div className="bg-[#1C202C] border border-[#242836] rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-[#242836] flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <RouteIcon className="h-4 w-4 text-[#4A72B2]" />
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
                      <tr className="border-b border-[#242836] text-slate-400 font-semibold bg-[#161922]">
                        <th className="py-3 px-4 w-10">
                          <input
                            type="checkbox"
                            checked={
                              prependOverview.prefixes.length > 0 &&
                              selectedTargets.size === prependOverview.prefixes.length
                            }
                            onChange={toggleAllTargets}
                            className="h-4 w-4 rounded border-[#2D3345] bg-[#161922] text-[#3B5B8C] focus:ring-0 cursor-pointer shrink-0"
                            title="Selecionar / Desmarcar todos os prefixos"
                          />
                        </th>
                        <th className="py-3 px-4">Prefixo Anunciado</th>
                        <th className="py-3 px-4">Destino / Upstream</th>
                        <th className="py-3 px-4">Prepend Aplicado</th>
                        <th className="py-3 px-4">BGP Community</th>
                        <th className="py-3 px-4">Status de Entrada Estimado</th>
                        <th className="py-3 px-4 text-right">Ações</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[#242836] font-mono">
                      {prependOverview.prefixes.map((p) => {
                        const targetId = `${p.peer_ip}_${p.prefix}`
                        const isSelected = selectedTargets.has(targetId)
                        const target = selectedTargets.get(targetId)
                        const matchingGroup = prependOverview.as_groups?.find(
                          (g) =>
                            g.peers.some((pr) => pr.peer_ip === p.peer_ip) ||
                            g.peer_ips.includes(p.peer_ip)
                        )

                        return (
                          <tr
                            key={p.id}
                            className={`transition ${
                              isSelected ? 'bg-[#1E2536]/80' : 'hover:bg-[#1E2330]/50'
                            }`}
                          >
                            <td className="py-3 px-4">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() =>
                                  toggleTarget({
                                    id: targetId,
                                    prefix: p.prefix,
                                    peerIp: p.peer_ip,
                                    peerName: p.peer_name,
                                    remoteAs: matchingGroup?.remote_as,
                                    communityBase: matchingGroup?.community_base,
                                    currentCommunity: p.community,
                                    asGroupId: matchingGroup?.id,
                                  })
                                }
                                className="h-4 w-4 rounded border-[#2D3345] bg-[#161922] text-[#3B5B8C] focus:ring-0 cursor-pointer shrink-0"
                                title="Selecionar para alteração em lote"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <span className="font-mono font-semibold text-slate-100 text-xs">
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
                              {(() => {
                                const currentPrependCount =
                                  target?.newPrependCount !== undefined ? target.newPrependCount : p.prepend_count
                                const currentIsBlock =
                                  target?.newIsBlock !== undefined ? target.newIsBlock : p.is_blocked
                                const isModified =
                                  target !== undefined &&
                                  ((target.newPrependCount !== undefined &&
                                    target.newPrependCount !== p.prepend_count) ||
                                    (target.newIsBlock !== undefined &&
                                      target.newIsBlock !== p.is_blocked))
                                const selectValue = currentIsBlock ? 'deny' : String(currentPrependCount)

                                return (
                                  <div className="flex items-center gap-2">
                                    <select
                                      value={selectValue}
                                      onChange={(e) => {
                                        const matchingGrp = matchingGroup || {
                                          id: `grp-${p.peer_ip}`,
                                          group_name: p.peer_name,
                                          remote_as: '',
                                          role: 'transit' as const,
                                          community_base: '',
                                          peer_count: 1,
                                          peers: [],
                                          peer_ips: [p.peer_ip],
                                          prefixes: [p],
                                        }
                                        handleTargetPrependChange(p, matchingGrp, e.target.value)
                                      }}
                                      className={`text-xs font-semibold rounded-lg px-2.5 py-1 transition cursor-pointer border focus:ring-1 focus:ring-[#3B5B8C] focus:outline-none ${
                                        currentIsBlock
                                          ? 'bg-rose-950/40 text-rose-300 border-rose-800/60'
                                          : currentPrependCount === 0
                                          ? 'bg-emerald-950/40 text-emerald-300 border-emerald-800/60'
                                          : 'bg-amber-950/40 text-amber-300 border-amber-800/60'
                                      }`}
                                      title="Alterar prepend diretamente neste bloco"
                                    >
                                      <option value="0" className="bg-[#161922] text-emerald-300">0P (Primário / Sem Prepend)</option>
                                      <option value="1" className="bg-[#161922] text-amber-300">1x Prepend (1P)</option>
                                      <option value="2" className="bg-[#161922] text-amber-300">2x Prepend (2P)</option>
                                      <option value="3" className="bg-[#161922] text-amber-300">3x Prepend (3P)</option>
                                      <option value="deny" className="bg-[#161922] text-rose-300">Bloqueado (Deny)</option>
                                    </select>
                                    {isModified && (
                                      <span className="text-[10px] text-[#93B4E6] font-medium flex items-center gap-1 bg-[#161922] px-1.5 py-0.5 rounded border border-[#3B5B8C]/40">
                                        <span className="w-1.5 h-1.5 rounded-full bg-[#93B4E6] animate-pulse"></span>
                                        Modificado
                                      </span>
                                    )}
                                  </div>
                                )
                              })()}
                            </td>
                            <td className="py-3 px-4 text-slate-300">
                              {p.community || '-'}
                            </td>
                            <td className="py-3 px-4 font-sans">
                              {(() => {
                                const currentPrependCount =
                                  target?.newPrependCount !== undefined ? target.newPrependCount : p.prepend_count
                                const currentIsBlock =
                                  target?.newIsBlock !== undefined ? target.newIsBlock : p.is_blocked
                                return currentIsBlock ? (
                                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#D9534F]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#D9534F]"></span>
                                    Anúncio Interrompido
                                  </span>
                                ) : currentPrependCount > 0 ? (
                                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#D99B26]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#D99B26]"></span>
                                    Despriorizado (+{currentPrependCount} saltos AS)
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2E9E6B]">
                                    <span className="w-1.5 h-1.5 rounded-full bg-[#2E9E6B]"></span>
                                    Prioritário (Caminho Mais Curto)
                                  </span>
                                )
                              })()}
                            </td>
                            <td className="py-3 px-4 font-sans text-right">
                              <button
                                onClick={() => onOpenPrependModal(p, matchingGroup)}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#3B5B8C] hover:bg-[#4A72B2] text-white text-xs font-medium shadow-xs transition cursor-pointer"
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

      {/* Floating Sticky Batch Action Toolbar */}
      {selectedTargets.size > 0 && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 max-w-4xl w-[94%] sm:w-auto bg-[#1C202C]/95 backdrop-blur-md border border-[#3B5B8C] shadow-2xl rounded-2xl px-5 py-3.5 flex flex-wrap items-center justify-between gap-4 animate-in slide-in-from-bottom-4 duration-200">
          <div className="flex items-center gap-3">
            <div className="h-8 w-8 rounded-xl bg-[#25334D] border border-[#3B5B8C]/40 flex items-center justify-center text-[#93B4E6] shrink-0">
              <Layers className="h-4 w-4" />
            </div>
            <div>
              <span className="text-xs font-bold text-white block">
                {selectedTargets.size} {selectedTargets.size === 1 ? 'sessão/bloco selecionado' : 'sessões/blocos selecionados'}
              </span>
              <span className="text-[11px] text-slate-400">
                Alvo de Configuração: Master BGP ({masterDevice?.name || 'BGP-RT.01.PA.PIRB.01'})
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] text-slate-400 mr-1 hidden sm:inline">Definir todos para:</span>
            <button
              type="button"
              onClick={() => handleBatchOverride(0, false)}
              className="px-3 py-1.5 rounded-lg bg-[#161922] hover:bg-[#202738] text-[#2E9E6B] border border-[#242836] hover:border-[#2E9E6B]/50 text-xs font-semibold transition cursor-pointer"
              title="Definir 0 Prepend (Caminho Primário) para todos selecionados"
            >
              0P (Primário)
            </button>
            <button
              type="button"
              onClick={() => handleBatchOverride(1, false)}
              className="px-3 py-1.5 rounded-lg bg-[#161922] hover:bg-[#202738] text-[#D99B26] border border-[#242836] hover:border-[#D99B26]/50 text-xs font-semibold transition cursor-pointer"
              title="Adicionar 1 Salto AS para todos selecionados"
            >
              1P
            </button>
            <button
              type="button"
              onClick={() => handleBatchOverride(2, false)}
              className="px-3 py-1.5 rounded-lg bg-[#161922] hover:bg-[#202738] text-[#D99B26] border border-[#242836] hover:border-[#D99B26]/50 text-xs font-semibold transition cursor-pointer"
              title="Adicionar 2 Saltos AS para todos selecionados"
            >
              2P
            </button>
            <button
              type="button"
              onClick={() => handleBatchOverride(3, false)}
              className="px-3 py-1.5 rounded-lg bg-[#161922] hover:bg-[#202738] text-[#D99B26] border border-[#242836] hover:border-[#D99B26]/50 text-xs font-semibold transition cursor-pointer"
              title="Adicionar 3 Saltos AS para todos selecionados"
            >
              3P
            </button>
            <button
              type="button"
              onClick={() => handleBatchOverride(0, true)}
              className="px-3 py-1.5 rounded-lg bg-[#161922] hover:bg-[#202738] text-[#D9534F] border border-[#242836] hover:border-[#D9534F]/50 text-xs font-semibold transition cursor-pointer"
              title="Bloquear anúncio (Deny) para todos selecionados"
            >
              Bloquear
            </button>

            <div className="h-4 w-px bg-[#242836] mx-1 hidden sm:block"></div>

            <button
              type="button"
              onClick={() => {
                setBatchModalMode('save_preview')
                setIsBatchModalOpen(true)
              }}
              className="px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
              title="Salvar alterações e exibir prévia dos comandos CLI para o roteador master"
            >
              <Save className="h-3.5 w-3.5" />
              <span>Salvar ({selectedTargets.size})</span>
            </button>
            <button
              type="button"
              onClick={clearSelection}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-[#161922] transition cursor-pointer"
              title="Limpar Seleção"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* Batch Prepend Modal */}
      {isBatchModalOpen && (
        <BatchPrependModal
          isOpen={isBatchModalOpen}
          mode={batchModalMode}
          onClose={() => setIsBatchModalOpen(false)}
          targets={Array.from(selectedTargets.values())}
          devices={devices}
          masterDevice={masterDevice}
          onApplyBatch={async (targets, prependCount, isBlock) => {
            if (onApplyBatchPrepend) {
              await onApplyBatchPrepend(targets, prependCount, isBlock)
              clearSelection()
            }
          }}
        />
      )}
    </div>
  )
}
