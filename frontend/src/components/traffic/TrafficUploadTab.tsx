import React from 'react'
import {
  Server,
  LayoutGrid,
  Table as TableIcon,
  Search,
  Moon,
  RefreshCw,
  Plus,
  Globe,
  Route as RouteIcon,
  Edit3,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Trash2,
  SlidersHorizontal,
} from 'lucide-react'
import type {
  Device,
  StaticRoute,
  BGPASSection,
  UploadOverviewResponse,
  TrafficSyncStatus,
} from '../../services/api'
import { sanitizeText } from '../../services/api'
import { CardSkeleton } from '../common/Skeleton'
import { renderASLogo } from './trafficHelpers'

export interface TrafficUploadTabProps {
  selectedDeviceId: string
  onDeviceChange: (id: string) => void
  uploadViewMode: 'cards' | 'table'
  setUploadViewMode: (mode: 'cards' | 'table') => void
  search: string
  setSearch: (s: string) => void
  devices: Device[]
  syncStatus: TrafficSyncStatus | null
  loading: boolean
  error: string | null
  uploadOverview: UploadOverviewResponse | null
  onRefresh: () => void
  onOpenAddRouteGeneric: () => void
  onOpenAddRouteForSection: (section: BGPASSection) => void
  onOpenDeleteRoute: (route: StaticRoute) => void
  onOpenCustomizeAS: (section: BGPASSection) => void
  onOpenLocalPref: (section: BGPASSection) => void
  expandedUploadGroups: Record<string, boolean>
  onToggleUploadGroup: (id: string) => void
  deletingId: string | null
  density?: 'comfortable' | 'compact'
  isSuperAdmin?: boolean
}

export const TrafficUploadTab: React.FC<TrafficUploadTabProps> = ({
  selectedDeviceId,
  onDeviceChange,
  uploadViewMode,
  setUploadViewMode,
  search,
  setSearch,
  devices,
  syncStatus,
  loading,
  error,
  uploadOverview,
  onRefresh,
  onOpenAddRouteGeneric,
  onOpenAddRouteForSection,
  onOpenDeleteRoute,
  onOpenCustomizeAS,
  onOpenLocalPref,
  expandedUploadGroups,
  onToggleUploadGroup,
  deletingId,
  density = 'comfortable',
  isSuperAdmin = false,
}) => {
  // Filtered AS Sections
  const filteredSections = (uploadOverview?.sections || []).filter((sec) => {
    const q = search.toLowerCase()
    return (
      sec.remote_as.includes(q) ||
      (sec.metadata.alias && sec.metadata.alias.toLowerCase().includes(q)) ||
      sec.peer_name.toLowerCase().includes(q) ||
      sec.peer_ip.toLowerCase().includes(q) ||
      sec.device_name.toLowerCase().includes(q) ||
      sec.static_routes.some(
        (r) =>
          r.destination.toLowerCase().includes(q) ||
          (r.description && r.description.toLowerCase().includes(q))
      )
    )
  })

  // All combined routes for table mode
  const allTableRoutes: StaticRoute[] = [
    ...(uploadOverview?.sections.flatMap((s) => s.static_routes) || []),
    ...(uploadOverview?.other_routes || []),
  ].filter((r) => {
    const q = search.toLowerCase()
    return (
      r.destination.toLowerCase().includes(q) ||
      r.next_hop.toLowerCase().includes(q) ||
      (r.description && r.description.toLowerCase().includes(q)) ||
      (r.device_name && r.device_name.toLowerCase().includes(q))
    )
  })

  return (
    <div className="space-y-6">
      {/* Controls Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
        <div className="flex flex-wrap items-center gap-3">
          {/* Device Selector */}
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-slate-400" />
            <select
              value={selectedDeviceId}
              onChange={(e) => onDeviceChange(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 font-medium focus:ring-2 focus:ring-cyan-500 focus:outline-none cursor-pointer"
            >
              <option value="all">🌐 Todos os Roteadores BGP</option>
              {devices
                .filter((d) => d.is_bgp !== false)
                .map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.host}) - {d.vendor}
                  </option>
                ))}
            </select>
          </div>

          {/* View Mode Toggle: Cards vs Table */}
          <div className="flex bg-slate-800/80 p-0.5 rounded-xl border border-slate-700/80 text-xs">
            <button
              onClick={() => setUploadViewMode('cards')}
              title="Visualização em Seções/Quadrados por AS"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                uploadViewMode === 'cards'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Cards por AS</span>
            </button>
            <button
              onClick={() => setUploadViewMode('table')}
              title="Visualização em Tabela Geral"
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                uploadViewMode === 'table'
                  ? 'bg-cyan-600 text-white shadow-sm'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <TableIcon className="h-3.5 w-3.5" />
              <span>Tabela Geral</span>
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative">
            <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Filtrar por AS, Operadora, Prefixo ou Gateway..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-slate-800/80 border border-slate-700 text-slate-200 text-xs rounded-xl pl-8 pr-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none w-56 sm:w-72"
            />
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Madrugada auto-sync indicator */}
          <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-[11px] text-slate-400">
            <Moon className="h-3.5 w-3.5 text-indigo-400" />
            <span>
              Auto-Sync: <strong>Diário às 03:30 (Madrugada)</strong>
            </span>
            {syncStatus?.last_sync_time && (
              <span className="text-slate-500 border-l border-slate-700 pl-2">
                Última:{' '}
                {new Date(syncStatus.last_sync_time).toLocaleTimeString('pt-BR', {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            )}
          </div>

          <button
            onClick={onRefresh}
            disabled={loading}
            title="Forçar atualização via SSH nos roteadores"
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
          </button>

          <button
            onClick={onOpenAddRouteGeneric}
            className="flex items-center gap-2 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-cyan-600/20 transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Nova Rota Avulsa</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
          {error}
        </div>
      )}

      {loading && !uploadOverview ? (
        <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 ${density === 'compact' ? 'gap-3.5' : 'gap-6'}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} compact={density === 'compact'} />
          ))}
        </div>
      ) : uploadViewMode === 'cards' ? (
        /* ================= MODO CARDS / QUADRADOS POR AS ================= */
        <div className="space-y-8">
          {filteredSections.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs bg-slate-900/60 border border-slate-800 rounded-2xl">
              <Globe className="h-8 w-8 text-slate-600 mx-auto mb-2" />
              <p className="font-semibold text-slate-300">Nenhuma sessão BGP encontrada</p>
              <p className="text-slate-500 mt-1">
                Verifique se os roteadores possuem sessões BGP configuradas ou ajuste o filtro.
              </p>
            </div>
          ) : (
            <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 ${density === 'compact' ? 'gap-3.5' : 'gap-6'}`}>
              {filteredSections.map((sec) => {
                const isEstablished = sec.bgp_state.toLowerCase() === 'established'

                return (
                  <div
                    key={sec.id}
                    className="flex flex-col bg-slate-900/90 border border-slate-800/90 hover:border-slate-700 rounded-2xl shadow-xl overflow-hidden transition duration-200"
                  >
                    {/* AS Card Header */}
                    <div className={`border-b border-slate-800/80 bg-slate-950/40 ${density === 'compact' ? 'p-3.5' : 'p-5'}`}>
                      <div className="flex items-start justify-between gap-3">
                        {/* Logo / Image Box */}
                        <div className="flex items-center gap-3.5">
                          <div
                            onClick={() => isSuperAdmin && onOpenCustomizeAS(sec)}
                            title={isSuperAdmin ? 'Clique para trocar imagem ou editar AS' : undefined}
                            className={`rounded-2xl bg-slate-800/90 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0 shadow-md ${
                              isSuperAdmin ? 'hover:border-cyan-500/60 transition cursor-pointer group relative' : ''
                            } ${density === 'compact' ? 'h-11 w-11' : 'h-14 w-14'}`}
                          >
                            {renderASLogo(sec.metadata, sec.peer_name)}
                            {isSuperAdmin && (
                              <div className="absolute inset-0 bg-cyan-950/70 backdrop-blur-xs opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                <ImageIcon className="h-4 w-4 text-cyan-300" />
                              </div>
                            )}
                          </div>

                          <div>
                            <h3 className="text-sm font-bold text-white tracking-tight leading-tight">
                              {sanitizeText(sec.metadata.alias) || sec.peer_name}
                            </h3>
                            <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                              {sec.peer_name} &bull;{' '}
                              <span className="text-slate-300 font-sans font-medium">
                                {sec.device_name}
                              </span>
                            </p>
                          </div>
                        </div>

                        {/* Edit AS Button (SuperAdmin Only) */}
                        {isSuperAdmin && (
                          <button
                            onClick={() => onOpenCustomizeAS(sec)}
                            title="Personalizar Nome e Imagem do AS (Super Admin)"
                            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/80 transition cursor-pointer shrink-0"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>

                      {/* BGP Session Status Bar */}
                      <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`h-2 w-2 rounded-full ${
                              isEstablished ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                            }`}
                          />
                          <span
                            className={`font-semibold ${
                              isEstablished ? 'text-emerald-400' : 'text-rose-400'
                            }`}
                          >
                            {sec.bgp_state}
                          </span>
                          {sec.uptime && (
                            <span className="text-slate-500 font-mono">({sec.uptime})</span>
                          )}
                        </div>

                        <div className="flex items-center gap-1 text-slate-400 font-mono">
                          <span className="text-slate-500 font-sans">Next-Hop:</span>
                          <strong className="text-emerald-400">{sec.peer_ip}</strong>
                        </div>
                      </div>

                      {/* Local-Preference (Upload TE) & Action */}
                      <div className="mt-2.5 text-xs flex items-center justify-between bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800/90 shadow-inner">
                        <div className="flex items-center gap-1.5 font-mono">
                          <span className="text-slate-400 font-sans text-[11px] font-medium">
                            Local-Pref:
                          </span>
                          <span className="font-bold text-amber-400 bg-amber-950/70 px-2 py-0.5 rounded-lg border border-amber-700/60 text-xs">
                            {sec.local_pref ?? 100}
                          </span>
                          {sec.import_policy && (
                            <span
                              className="text-[10px] text-slate-500 hidden sm:inline font-mono"
                              title={`Route-policy de import: ${sec.import_policy}`}
                            >
                              ({sec.import_policy})
                            </span>
                          )}
                        </div>
                        <button
                          onClick={() => onOpenLocalPref(sec)}
                          title="Ajustar Local-Preference no equipamento"
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                        >
                          <SlidersHorizontal className="h-3 w-3 text-amber-400" />
                          <span>Ajustar</span>
                        </button>
                      </div>
                    </div>

                    {/* AS Card Body: Rotas / Blocos de Saída */}
                    <div className="p-4 flex-1 flex flex-col justify-between bg-slate-900/40">
                      <div>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <RouteIcon className="h-3.5 w-3.5 text-cyan-400" />
                            <span className="text-xs font-semibold text-slate-300">
                              Blocos de Saída Direcionados ({sec.static_routes.length})
                            </span>
                            <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                              via {sec.peer_ip}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => onToggleUploadGroup(sec.id)}
                            className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 cursor-pointer transition py-0.5 px-1.5 rounded hover:bg-cyan-950/40"
                          >
                            <span>
                              {expandedUploadGroups[sec.id] ? 'Ocultar Blocos' : 'Ver Blocos'}
                            </span>
                            {expandedUploadGroups[sec.id] ? (
                              <ChevronUp className="h-3 w-3" />
                            ) : (
                              <ChevronDown className="h-3 w-3" />
                            )}
                          </button>
                        </div>

                        {expandedUploadGroups[sec.id] && (
                          <div className="mt-3 space-y-3 animate-in fade-in duration-150">
                            {sec.static_routes.length === 0 ? (
                              <div className="p-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/30 text-center text-slate-400 text-[11px] space-y-1">
                                <p className="text-slate-300 font-medium">
                                  Nenhum bloco estático direcionado
                                </p>
                                <p className="text-slate-500 text-[10px]">
                                  Clique no botão abaixo para injetar uma rota estática via este AS.
                                </p>
                              </div>
                            ) : (
                              <div className="space-y-2">
                                {sec.static_routes.map((route) => {
                                  const isDefault = route.destination === '0.0.0.0/0'
                                  const isDeleting = deletingId === route.id

                                  return (
                                    <div
                                      key={route.id}
                                      className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 text-xs transition"
                                    >
                                      <div className="flex flex-col">
                                        <div className="flex items-center gap-1.5 font-mono">
                                          <span
                                            className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                                              isDefault
                                                ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                                : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                            }`}
                                          >
                                            {route.destination}
                                          </span>
                                          {isDefault && (
                                            <span className="text-[10px] font-sans font-bold text-amber-400">
                                              Default
                                            </span>
                                          )}
                                        </div>
                                        <div className="text-[10px] text-slate-400 font-sans mt-1 flex items-center gap-2">
                                          <span>
                                            Pref:{' '}
                                            <strong className="text-slate-300">
                                              {route.preference || 60}
                                            </strong>
                                          </span>
                                          {route.description && (
                                            <span
                                              className="text-slate-400 truncate max-w-[160px]"
                                              title={route.description}
                                            >
                                              &bull; {route.description}
                                            </span>
                                          )}
                                        </div>
                                      </div>

                                      {/* Delete Route */}
                                      <button
                                        onClick={() => onOpenDeleteRoute(route)}
                                        disabled={isDeleting}
                                        title="Ver comando de remoção para este host"
                                        className="p-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 hover:text-rose-200 border border-rose-900/50 transition cursor-pointer disabled:opacity-50 shrink-0"
                                      >
                                        <Trash2
                                          className={`h-3.5 w-3.5 ${isDeleting ? 'animate-spin' : ''}`}
                                        />
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}

                            {/* AS Card Footer: Botão de Mais [+] */}
                            <div className="pt-1">
                              <button
                                onClick={() => onOpenAddRouteForSection(sec)}
                                className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-600 hover:to-blue-600 border border-cyan-500/40 hover:border-transparent text-cyan-300 hover:text-white text-xs font-semibold shadow-sm transition cursor-pointer group"
                              >
                                <Plus className="h-4 w-4 text-cyan-400 group-hover:text-white transition" />
                                <span>Adicionar Bloco de Saída</span>
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      ) : (
        /* ================= MODO TABELA COMPLETA ================= */
        <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <RouteIcon className="h-4 w-4 text-cyan-400" />
              <span className="text-sm font-semibold text-white">
                Todas as Rotas Estáticas de Upload
              </span>
              <span className="text-xs text-slate-500">({allTableRoutes.length} rotas)</span>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950/40">
                  <th className="py-3 px-4">Equipamento</th>
                  <th className="py-3 px-4">Destino / Prefixo</th>
                  <th className="py-3 px-4">Próximo Salto (Gateway / Saída)</th>
                  <th className="py-3 px-4">Preferência</th>
                  <th className="py-3 px-4">Descrição / Comentário</th>
                  <th className="py-3 px-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono">
                {allTableRoutes.map((route) => {
                  const isDefault = route.destination === '0.0.0.0/0'
                  const isDeleting = deletingId === route.id

                  return (
                    <tr key={route.id} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 px-4 font-sans font-medium text-slate-200">
                        {route.device_name}
                      </td>
                      <td className="py-3 px-4">
                        <span
                          className={`px-2 py-0.5 rounded font-bold ${
                            isDefault
                              ? 'bg-amber-950 text-amber-300 border border-amber-800'
                              : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                          }`}
                        >
                          {route.destination}
                        </span>
                        {isDefault && (
                          <span className="ml-1.5 text-[10px] text-amber-400 font-sans font-semibold">
                            (Default)
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-emerald-400 font-semibold">
                        {route.next_hop}
                      </td>
                      <td className="py-3 px-4 text-slate-400">
                        {route.preference || 60}
                      </td>
                      <td className="py-3 px-4 font-sans text-slate-300">
                        {route.description || <span className="text-slate-600 italic">-</span>}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onOpenDeleteRoute(route)}
                          disabled={isDeleting}
                          title="Ver comando de remoção para este host"
                          className="p-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 hover:text-rose-200 border border-rose-900/50 transition cursor-pointer disabled:opacity-50"
                        >
                          <Trash2 className={`h-3.5 w-3.5 ${isDeleting ? 'animate-spin' : ''}`} />
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
