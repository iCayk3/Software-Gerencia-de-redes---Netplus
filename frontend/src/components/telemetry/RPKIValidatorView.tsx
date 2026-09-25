import React, { useState, useEffect, useCallback } from 'react'
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  Search,
  Lock,
  Layers,
  Server,
  Clock
} from 'lucide-react'
import {
  fetchRPKISummary,
  validateRPKI,
  fetchRPKIInvalids,
  type RPKISummary,
  type RPKIValidationResult
} from '../../services/api'

interface RPKIValidatorViewProps {
  density?: 'comfortable' | 'compact'
}

export const RPKIValidatorView: React.FC<RPKIValidatorViewProps> = () => {
  const [summary, setSummary] = useState<RPKISummary | null>(null)
  const [invalids, setInvalids] = useState<RPKIValidationResult[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Interactive Validation State
  const [testPrefix, setTestPrefix] = useState('45.166.28.0/22')
  const [testASN, setTestASN] = useState('267943')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<RPKIValidationResult | null>(null)
  const [testError, setTestError] = useState<string | null>(null)

  // Filter & Search for Invalids
  const [searchQuery, setSearchQuery] = useState('')

  const loadRPKI = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true)
    try {
      const [sum, invs] = await Promise.all([
        fetchRPKISummary(),
        fetchRPKIInvalids(50).catch(() => [])
      ])
      setSummary(sum)
      setInvalids(invs)
      setError(null)
    } catch (err: any) {
      console.error('Erro ao carregar dados RPKI:', err)
      setError(err.message || 'Falha ao buscar telemetria RPKI')
    } finally {
      setLoading(false)
      if (isManual) setRefreshing(false)
    }
  }, [])

  useEffect(() => {
    loadRPKI()
    const timer = setInterval(() => loadRPKI(), 15000)
    return () => clearInterval(timer)
  }, [loadRPKI])

  const handleTestValidation = async (e?: React.FormEvent) => {
    if (e) e.preventDefault()
    if (!testPrefix.trim()) return

    const asnNum = parseInt(testASN.replace(/\D/g, ''), 10) || 0
    setTesting(true)
    setTestError(null)

    try {
      const result = await validateRPKI(testPrefix.trim(), asnNum)
      setTestResult(result)
    } catch (err: any) {
      setTestError(err.message || 'Erro ao consultar RPKI')
    } finally {
      setTesting(false)
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'valid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            Válido (ROA OK)
          </span>
        )
      case 'invalid':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-950 text-rose-400 border border-rose-800 animate-pulse">
            <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
            Inválido (Hijack / MaxLen)
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700">
            <HelpCircle className="h-3.5 w-3.5 text-slate-400" />
            Não Encontrado (NotFound)
          </span>
        )
    }
  }

  const filteredInvalids = invalids.filter((item) => {
    if (!searchQuery.trim()) return true
    const q = searchQuery.toLowerCase()
    return (
      item.prefix.toLowerCase().includes(q) ||
      item.origin_asn.toString().includes(q) ||
      (item.peer_ip && item.peer_ip.toLowerCase().includes(q)) ||
      (item.router_name && item.router_name.toLowerCase().includes(q)) ||
      item.reason.toLowerCase().includes(q)
    )
  })

  if (loading && !summary) {
    return (
      <div className="flex flex-col items-center justify-center p-16 space-y-4">
        <ShieldCheck className="h-10 w-10 text-cyan-400 animate-spin" />
        <p className="text-slate-400 text-sm">Carregando telemetria de segurança RPKI (ROA)...</p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-4">
            <div className="h-12 w-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold text-white tracking-tight">Validador RPKI & Proteção ROA</h2>
                <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium bg-emerald-950 text-emerald-400 border border-emerald-800">
                  <Lock className="h-3 w-3 text-emerald-400" />
                  RFC 6811 & RFC 7115
                </span>
                {summary?.own_as_protected && (
                  <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-cyan-950 text-cyan-400 border border-cyan-800">
                    AS 267943 Protegido ({summary.own_prefixes_count} prefixos)
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-slate-500" />
                <span>
                  Última validação: {summary?.last_updated ? new Date(summary.last_updated).toLocaleTimeString() : 'Aguardando...'}
                </span>
                <span>&bull;</span>
                <span>Prevenção contínua contra BGP Hijack e vazamentos de rota</span>
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => loadRPKI(true)}
              disabled={refreshing}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold bg-gradient-to-r from-emerald-600 to-cyan-600 hover:from-emerald-500 hover:to-cyan-500 text-white shadow-lg shadow-emerald-600/20 disabled:opacity-50 transition cursor-pointer"
            >
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
              <span>{refreshing ? 'Atualizando...' : 'Revalidar Rotas'}</span>
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
        {/* Rotas Válidas */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Rotas Válidas (ROA OK)</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-emerald-400 font-mono">
              {(summary?.valid_count ?? 0).toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">
              ({(summary?.valid_percentage ?? 0).toFixed(1)}%)
            </span>
          </div>
          <div className="mt-3 w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-500 h-1.5 rounded-full transition-all duration-500"
              style={{ width: `${Math.min(100, Math.max(0, summary?.valid_percentage ?? 0))}%` }}
            />
          </div>
        </div>

        {/* Rotas Inválidas (Alerta de Segurança) */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Rotas Inválidas</span>
            <ShieldAlert className="h-4 w-4 text-rose-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className={`text-2xl font-bold font-mono ${(summary?.invalid_count ?? 0) > 0 ? 'text-rose-400' : 'text-slate-200'}`}>
              {summary?.invalid_count ?? 0}
            </span>
            <span className="text-xs text-slate-500">anúncios suspeitos</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">
            {(summary?.invalid_count ?? 0) > 0 ? 'Detectado em trânsito IP / PTT' : 'Nenhuma rota inválida'}
          </p>
        </div>

        {/* Rotas Not Found (Sem ROA) */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Sem ROA (Not Found)</span>
            <HelpCircle className="h-4 w-4 text-slate-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-slate-200 font-mono">
              {(summary?.not_found_count ?? 0).toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">prefixos</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">Operadores sem assinatura RPKI</p>
        </div>

        {/* Total Avaliado */}
        <div className="bg-slate-900/70 border border-slate-800 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Inspecionado</span>
            <Layers className="h-4 w-4 text-cyan-400" />
          </div>
          <div className="mt-2 flex items-baseline gap-2">
            <span className="text-2xl font-bold text-white font-mono">
              {(summary?.total_evaluated ?? 0).toLocaleString()}
            </span>
            <span className="text-xs text-slate-500">rotas ativas</span>
          </div>
          <p className="text-xs text-slate-500 mt-2">Verificadas contra Registro.br e RIRs</p>
        </div>
      </div>

      {/* Interactive ROA Quick Checker Form */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 shadow-xl">
        <div className="flex items-center gap-2 mb-4">
          <Search className="h-4 w-4 text-cyan-400" />
          <h3 className="font-bold text-white text-base">Ferramenta Rápida de Validação de ROA</h3>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Consulte se um prefixo IP e ASN de origem possuem Route Origin Authorization (ROA) válido nos repositórios criptográficos globais.
        </p>

        <form onSubmit={handleTestValidation} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
              Prefixo IPv4 ou IPv6
            </label>
            <input
              type="text"
              placeholder="ex: 45.166.28.0/22"
              value={testPrefix}
              onChange={(e) => setTestPrefix(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-400 uppercase mb-1">
              ASN de Origem
            </label>
            <input
              type="text"
              placeholder="ex: 267943"
              value={testASN}
              onChange={(e) => setTestASN(e.target.value)}
              className="w-full px-3 py-2 bg-slate-950 border border-slate-700 rounded-xl text-xs text-slate-200 font-mono focus:outline-none focus:border-cyan-500"
            />
          </div>

          <div className="flex items-end">
            <button
              type="submit"
              disabled={testing || !testPrefix.trim()}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-cyan-600/20 disabled:opacity-50 transition cursor-pointer"
            >
              <ShieldCheck className={`h-4 w-4 ${testing ? 'animate-spin' : ''}`} />
              <span>{testing ? 'Consultando RPKI...' : 'Validar ROA'}</span>
            </button>
          </div>
        </form>

        {testError && (
          <div className="mt-3 p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
            {testError}
          </div>
        )}

        {testResult && (
          <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 text-xs space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-200">Resultado da Validação:</span>
                {getStatusBadge(testResult.status)}
              </div>
              <span className="text-slate-500 text-[11px] font-mono">
                {new Date(testResult.validated_at).toLocaleTimeString()}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-2 pt-2 border-t border-slate-800 text-slate-300">
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Prefixo Testado:</span>
                <span className="font-mono text-cyan-300 font-bold">{testResult.prefix}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">ASN Originador:</span>
                <span className="font-mono text-white font-bold">AS{testResult.origin_asn}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] uppercase">Diagnóstico / Motivo:</span>
                <span className="text-slate-300">{testResult.reason}</span>
              </div>
            </div>

            {testResult.matching_roa && (
              <div className="p-2.5 rounded-lg bg-emerald-950/30 border border-emerald-800/40 text-[11px] text-emerald-300 flex items-center justify-between">
                <span>
                  ROA Autorizado: <strong>{testResult.matching_roa.prefix}</strong> (Max-Length: /{testResult.matching_roa.max_length}) para AS{testResult.matching_roa.asn}
                </span>
                <span className="text-slate-400 font-mono">
                  Trust Anchor: {testResult.matching_roa.trust_anchor || 'Registro.br'}
                </span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Feed / Tabela de Rotas Inválidas Recebidas de Trânsitos IP */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
        <div className="p-5 border-b border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="h-9 w-9 rounded-lg bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-white text-base">Rotas com ROA Inválido Detectadas</h3>
                {filteredInvalids.length > 0 && (
                  <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40">
                    {filteredInvalids.length} ocorrência{filteredInvalids.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400">
                Rotas recebidas de trânsitos ou peers com violação RFC 6811 (Origem incorreta ou máscara excedida)
              </p>
            </div>
          </div>

          {/* Search */}
          <div className="relative">
            <Search className="h-4 w-4 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filtrar por prefixo, AS, trânsito..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-3 py-1.5 bg-slate-950/80 border border-slate-700 rounded-lg text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
            />
          </div>
        </div>

        {/* Table of Invalids */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 text-slate-400 uppercase tracking-wider font-semibold border-b border-slate-800">
              <tr>
                <th className="py-3 px-4">Prefixo Suspeito</th>
                <th className="py-3 px-4">ASN Origem</th>
                <th className="py-3 px-4">Recebido de (Trânsito / Peer)</th>
                <th className="py-3 px-4">Roteador</th>
                <th className="py-3 px-4">AS-Path</th>
                <th className="py-3 px-4">Motivo da Violação ROA</th>
                <th className="py-3 px-4 text-center">Ação Recomendada</th>
                <th className="py-3 px-4 text-right">Data/Hora</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/40 text-slate-300">
              {filteredInvalids.length > 0 ? (
                filteredInvalids.map((inv, idx) => (
                  <tr key={idx} className="hover:bg-slate-800/30 transition-colors">
                    {/* Prefixo */}
                    <td className="py-3 px-4 font-mono font-bold text-rose-400 whitespace-nowrap">
                      {inv.prefix}
                    </td>

                    {/* ASN Origem */}
                    <td className="py-3 px-4 font-mono whitespace-nowrap">
                      <span className="text-white font-semibold">AS{inv.origin_asn}</span>
                    </td>

                    {/* Peer / Trânsito */}
                    <td className="py-3 px-4 font-mono text-slate-300 whitespace-nowrap">
                      {inv.peer_ip || 'Trânsito IP'}
                    </td>

                    {/* Roteador */}
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Server className="h-3.5 w-3.5 text-cyan-400" />
                        <span>{inv.router_name || 'BGP Core'}</span>
                      </div>
                    </td>

                    {/* AS-Path */}
                    <td className="py-3 px-4 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                      {inv.as_path || `... ${inv.origin_asn}`}
                    </td>

                    {/* Motivo */}
                    <td className="py-3 px-4 text-slate-300 max-w-xs">
                      <span className="text-rose-300 font-medium">{inv.reason}</span>
                    </td>

                    {/* Ação Recomendada */}
                    <td className="py-3 px-4 text-center whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/80 text-rose-400 border border-rose-800">
                        Descartar Rota (RFC 7115)
                      </span>
                    </td>

                    {/* Data */}
                    <td className="py-3 px-4 text-right whitespace-nowrap text-slate-500 font-mono text-[11px]">
                      {new Date(inv.validated_at).toLocaleTimeString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center space-y-2">
                      <ShieldCheck className="h-8 w-8 text-emerald-400" />
                      <p className="font-semibold text-white">Nenhuma rota inválida detectada no momento!</p>
                      <p className="text-xs text-slate-500">
                        Todos os trânsitos IP estão propagando rotas legítimas e validadas por ROA.
                      </p>
                    </div>
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
