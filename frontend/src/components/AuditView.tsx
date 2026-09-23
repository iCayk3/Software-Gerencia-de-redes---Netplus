import React, { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck,
  Search,
  Filter,
  RefreshCw,
  Clock,
  Terminal,
  Globe,
  CheckCircle2,
  AlertCircle,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  Route,
  Zap,
  Lock
} from 'lucide-react'
import {
  fetchAuditLogs,
  type AuditLog,
  type AuditListResponse
} from '../services/api'

interface AuditViewProps {
  density?: 'comfortable' | 'compact'
}

export const AuditView: React.FC<AuditViewProps> = ({ density = 'comfortable' }) => {
  const cellPadding = density === 'compact' ? 'py-2 px-3' : 'py-3 px-4'
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState<string | null>(null)

  // Filters & Pagination
  const [actionFilter, setActionFilter] = useState<string>('all')
  const [searchQuery, setSearchQuery] = useState<string>('')
  const [page, setPage] = useState<number>(1)
  const limit = 20

  const loadAuditLogs = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const offset = (page - 1) * limit
      const filter = {
        action: actionFilter === 'all' ? undefined : actionFilter,
        limit,
        offset,
      }
      const res: AuditListResponse = await fetchAuditLogs(filter)
      setLogs(res.logs || [])
      setTotal(res.total || 0)
    } catch (err: any) {
      setError(err.message || 'Falha ao carregar trilha de auditoria')
    } finally {
      setLoading(false)
    }
  }, [page, actionFilter])

  useEffect(() => {
    loadAuditLogs()
  }, [loadAuditLogs])

  const handleCopyCommand = (cmd: string, logId: string) => {
    navigator.clipboard.writeText(cmd)
    setCopiedId(logId)
    setTimeout(() => setCopiedId(null), 2000)
  }

  // Filter logs locally by search query (user name, email, command, device)
  const filteredLogs = logs.filter((log) => {
    if (!searchQuery) return true
    const q = searchQuery.toLowerCase()
    return (
      log.user_name.toLowerCase().includes(q) ||
      log.user_email.toLowerCase().includes(q) ||
      log.command_executed.toLowerCase().includes(q) ||
      (log.target_device_name && log.target_device_name.toLowerCase().includes(q)) ||
      log.action.toLowerCase().includes(q) ||
      log.client_ip.toLowerCase().includes(q)
    )
  })

  // Format timestamp to localized readable string
  const formatDateTime = (ts: string) => {
    try {
      const d = new Date(ts)
      return d.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      })
    } catch {
      return ts
    }
  }

  // Action Badge Helper
  const renderActionBadge = (action: string) => {
    switch (action) {
      case 'ADD_STATIC_ROUTE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
            <Route className="h-3 w-3" />
            + Rota Estática
          </span>
        )
      case 'DELETE_STATIC_ROUTE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/30">
            <Route className="h-3 w-3" />
            - Rota Estática
          </span>
        )
      case 'APPLY_BGP_PREPEND':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
            <Zap className="h-3 w-3" />
            BGP Prepend
          </span>
        )
      case 'USER_LOGIN':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/10 text-purple-400 border border-purple-500/30">
            <Lock className="h-3 w-3" />
            Login
          </span>
        )
      case 'CREATE_DEVICE':
      case 'UPDATE_DEVICE':
      case 'DELETE_DEVICE':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
            <Terminal className="h-3 w-3" />
            Equipamento
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-slate-800 text-slate-300 border border-slate-700">
            {action}
          </span>
        )
    }
  }

  // Status Badge Helper
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'SUCCESS':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle2 className="h-3 w-3" />
            Sucesso
          </span>
        )
      case 'MANUAL_DISPATCH':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <ShieldCheck className="h-3 w-3" />
            Modo Manual
          </span>
        )
      case 'FAILED':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <AlertCircle className="h-3 w-3" />
            Falha
          </span>
        )
      default:
        return (
          <span className="text-[11px] text-slate-400 px-2 py-0.5 rounded bg-slate-800">
            {status}
          </span>
        )
    }
  }

  const totalPages = Math.ceil(total / limit) || 1

  return (
    <div className="space-y-6">
      {/* Top Banner / Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Total de Ações Auditadas
            </span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <ShieldCheck className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-white">{total}</div>
          <p className="mt-1 text-[11px] text-slate-500">Registros gravados no banco de dados</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Segurança Operacional
            </span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <CheckCircle2 className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-emerald-400">100% Imutável</div>
          <p className="mt-1 text-[11px] text-slate-500">Auditoria B2B conforme checklist SOC2</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Rastreamento de Origem
            </span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400 border border-blue-500/20">
              <Globe className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-blue-400">IP & Usuário</div>
          <p className="mt-1 text-[11px] text-slate-500">Identificação ponta a ponta por operador</p>
        </div>

        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
              Políticas de Acesso
            </span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/20">
              <Lock className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-purple-400">RBAC Ativo</div>
          <p className="mt-1 text-[11px] text-slate-500">Admin &bull; Operador NOC &bull; Diretoria</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {/* Action Filter */}
          <div className="flex items-center gap-2 bg-slate-950 border border-slate-700/80 rounded-xl px-3 py-2 text-xs">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value)
                setPage(1)
              }}
              className="bg-transparent text-slate-200 focus:outline-none cursor-pointer"
            >
              <option value="all" className="bg-slate-900">Todas as Ações</option>
              <option value="ADD_STATIC_ROUTE" className="bg-slate-900">+ Adicionar Rota Estática</option>
              <option value="DELETE_STATIC_ROUTE" className="bg-slate-900">- Remover Rota Estática</option>
              <option value="APPLY_BGP_PREPEND" className="bg-slate-900">⚡ Aplicar BGP Prepend</option>
              <option value="USER_LOGIN" className="bg-slate-900">🔒 Login de Usuário</option>
              <option value="UPDATE_AS_METADATA" className="bg-slate-900">🏷️ Metadados de AS</option>
            </select>
          </div>

          {/* Search Box */}
          <div className="relative flex-1 sm:w-72">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar por usuário, IP ou comando..."
              className="w-full bg-slate-950 border border-slate-700/80 rounded-xl pl-9 pr-3 py-2 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Refresh & Pagination info */}
        <div className="flex items-center gap-3 justify-end">
          <button
            onClick={loadAuditLogs}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold border border-slate-700 transition cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs flex items-center gap-2">
          <AlertCircle className="h-4 w-4 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Logs Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-800 bg-slate-950/60 text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                <th className="py-3 px-4">Data / Horário</th>
                <th className="py-3 px-4">Operador</th>
                <th className="py-3 px-4">Ação</th>
                <th className="py-3 px-4">Dispositivo</th>
                <th className="py-3 px-4">Comando Executado</th>
                <th className="py-3 px-4">IP Cliente</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 text-xs text-slate-300">
              {loading && logs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <div className="h-6 w-6 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
                      <span>Carregando trilha de auditoria...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    <ShieldCheck className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                    <p className="font-semibold text-slate-400">Nenhum registro de auditoria encontrado</p>
                    <p className="text-[11px] text-slate-500 mt-1">
                      Ações de operadores (prepends, rotas e logins) aparecerão automaticamente aqui.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr
                    key={log.id}
                    className="hover:bg-slate-800/40 transition-colors duration-150"
                  >
                    {/* Timestamp */}
                    <td className={`${cellPadding} whitespace-nowrap text-slate-400 font-mono text-[11px]`}>
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3 text-slate-500" />
                        <span>{formatDateTime(log.timestamp)}</span>
                      </div>
                    </td>

                    {/* Operator */}
                    <td className={`${cellPadding} whitespace-nowrap`}>
                      <div className="flex items-center gap-2">
                        <div className="h-6 w-6 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-[10px] font-bold text-cyan-400">
                          {log.user_name ? log.user_name.slice(0, 2).toUpperCase() : 'OP'}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-200">{log.user_name || 'Operador'}</div>
                          <div className="text-[10px] text-slate-500">{log.user_email}</div>
                        </div>
                      </div>
                    </td>

                    {/* Action */}
                    <td className={`${cellPadding} whitespace-nowrap`}>
                      {renderActionBadge(log.action)}
                    </td>

                    {/* Target Device */}
                    <td className={`${cellPadding} whitespace-nowrap`}>
                      <span className="font-mono text-xs text-slate-300">
                        {log.target_device_name || log.target_device_id || 'Global'}
                      </span>
                    </td>

                    {/* Command Executed */}
                    <td className={`${cellPadding} max-w-xs md:max-w-md`}>
                      <div className="flex items-center gap-2 group">
                        <code className="text-[11px] font-mono bg-slate-950 px-2 py-1 rounded border border-slate-800 text-cyan-300 truncate max-w-[280px] sm:max-w-[400px]">
                          {log.command_executed}
                        </code>
                        <button
                          onClick={() => handleCopyCommand(log.command_executed, log.id)}
                          className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition"
                          title="Copiar comando"
                        >
                          {copiedId === log.id ? (
                            <Check className="h-3 w-3 text-emerald-400" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Client IP */}
                    <td className={`${cellPadding} whitespace-nowrap font-mono text-[11px] text-slate-400`}>
                      {log.client_ip || '127.0.0.1'}
                    </td>

                    {/* Status */}
                    <td className={`${cellPadding} whitespace-nowrap text-right`}>
                      {renderStatusBadge(log.status)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Table Footer with Pagination */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between text-xs text-slate-400">
          <div>
            Mostrando <span className="font-semibold text-slate-200">{filteredLogs.length}</span> de{' '}
            <span className="font-semibold text-slate-200">{total}</span> registros
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="Página Anterior"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-[11px] font-mono px-2 py-1 rounded bg-slate-900 border border-slate-800">
              {page} / {totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              className="p-1.5 rounded-lg border border-slate-800 hover:bg-slate-800 text-slate-300 disabled:opacity-30 disabled:pointer-events-none transition cursor-pointer"
              title="Próxima Página"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
