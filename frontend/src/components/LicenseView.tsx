import React, { useState, useEffect } from 'react'
import {
  ShieldCheck,
  Server,
  Calendar,
  Cloud,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  KeyRound,
  Zap,
  Building2,
  Radio,
  Lock
} from 'lucide-react'
import { fetchLicenseStatus, activateLicense, type LicenseInfo } from '../services/api'
import { useAuth } from '../context/AuthContext'

export const LicenseView: React.FC = () => {
  const { user } = useAuth()
  const [license, setLicense] = useState<LicenseInfo | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [keyInput, setKeyInput] = useState('')
  const [activating, setActivating] = useState(false)
  const [activateSuccess, setActivateSuccess] = useState<string | null>(null)
  const [activateError, setActivateError] = useState<string | null>(null)
  const [copiedId, setCopiedId] = useState(false)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchLicenseStatus()
      setLicense(data)
    } catch (err: any) {
      setError(err.message || 'Falha ao consultar status da licença')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleCopyInstanceId = () => {
    if (license?.instance_id) {
      navigator.clipboard.writeText(license.instance_id)
      setCopiedId(true)
      setTimeout(() => setCopiedId(false), 2000)
    }
  }

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!keyInput.trim()) return

    setActivating(true)
    setActivateSuccess(null)
    setActivateError(null)

    try {
      const updated = await activateLicense(keyInput.trim())
      setLicense(updated)
      setActivateSuccess(`Licença ativada com sucesso para o plano ${updated.tier.toUpperCase()}!`)
      setKeyInput('')
    } catch (err: any) {
      setActivateError(err.message || 'Falha ao ativar chave de licença')
    } finally {
      setActivating(false)
    }
  }

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case 'enterprise':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-purple-950/80 text-purple-300 border border-purple-700/80 shadow-sm shadow-purple-900/30 flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-purple-400" /> Enterprise
          </span>
        )
      case 'pro':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-cyan-950/80 text-cyan-300 border border-cyan-700/80 shadow-sm shadow-cyan-900/30 flex items-center gap-1.5">
            <Zap className="h-3 w-3 text-cyan-400" /> Pro ISP
          </span>
        )
      case 'starter':
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-950/80 text-blue-300 border border-blue-700/80 flex items-center gap-1.5">
            Starter
          </span>
        )
      default:
        return (
          <span className="px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-950/80 text-amber-300 border border-amber-700/80 flex items-center gap-1.5">
            Avaliação / Lab
          </span>
        )
    }
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-emerald-950/70 border border-emerald-800/80 text-emerald-400 text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Licença Ativa
          </div>
        )
      case 'grace_period':
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-950/70 border border-amber-800/80 text-amber-400 text-xs font-semibold">
            <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
            Período de Graça
          </div>
        )
      case 'suspended':
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-rose-950/70 border border-rose-800/80 text-rose-400 text-xs font-semibold">
            <XCircle className="h-3.5 w-3.5 text-rose-400" />
            Instalação Suspensa
          </div>
        )
      default:
        return (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-xs font-semibold">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            {status}
          </div>
        )
    }
  }

  const modulesList = [
    { id: 'bgp', name: 'BGP Traffic Engineering', desc: 'Prepend, Local-Pref e controle de anúncios', icon: Zap },
    { id: 'ospf', name: 'Protocolo OSPF', desc: 'Topologia dinâmica, áreas e adjacências', icon: Radio },
    { id: 'bmp', name: 'BMP Churn Tracker (RFC 7854)', desc: 'Monitoramento contínuo de oscilações BGP', icon: Cloud },
    { id: 'rpki', name: 'RPKI Route Validator (RFC 6811)', desc: 'Prevenção de sequestros de prefixos e ROA', icon: ShieldCheck },
    { id: 'syslog', name: 'Syslog Anomaly Engine', desc: 'Detecção de quedas e risco operacional', icon: AlertTriangle },
    { id: 'audit', name: 'Trilha de Auditoria Imutável', desc: 'Registro de conformidade e ações de NOC', icon: Lock },
  ]

  const deviceUsagePercent = license && license.max_devices > 0
    ? Math.min(100, Math.round((license.device_usage / license.max_devices) * 100))
    : 0

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-6 backdrop-blur-md shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-cyan-500/20">
            <KeyRound className="h-6 w-6 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-xl sm:text-2xl font-bold text-white tracking-tight">Licença & Servidor Master</h1>
              {license && getTierBadge(license.tier)}
            </div>
            <p className="text-sm text-slate-400 mt-1 flex items-center gap-2">
              <Building2 className="h-3.5 w-3.5 text-cyan-400" />
              <span>{license?.client_name || 'Instalação NetPulse On-Premise'}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {license && getStatusBadge(license.status)}
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl transition border border-slate-700 shadow-sm"
            title="Atualizar Informações"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-rose-950/50 border border-rose-800/80 rounded-xl text-rose-300 text-sm flex items-center gap-3">
          <AlertTriangle className="h-5 w-5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Roteadores */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Capacidade de Roteadores</span>
            <div className="p-2 rounded-xl bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
              <Server className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-white">
                {license?.device_usage ?? 0}
              </span>
              <span className="text-slate-400 text-sm font-medium">
                / {license?.max_devices === 0 ? 'Ilimitado' : `${license?.max_devices ?? 0} permitidos`}
              </span>
            </div>
            {license && license.max_devices > 0 ? (
              <div className="mt-3">
                <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-500 ${
                      deviceUsagePercent > 90 ? 'bg-rose-500' : deviceUsagePercent > 70 ? 'bg-amber-400' : 'bg-cyan-500'
                    }`}
                    style={{ width: `${deviceUsagePercent}%` }}
                  />
                </div>
                <div className="flex justify-between text-[11px] text-slate-400 mt-1.5">
                  <span>{deviceUsagePercent}% utilizado</span>
                  <span>{Math.max(0, license.max_devices - license.device_usage)} restantes</span>
                </div>
              </div>
            ) : (
              <p className="text-xs text-purple-400 mt-2 font-medium">Sem limite de roteadores físicos cadastrados.</p>
            )}
          </div>
        </div>

        {/* Card 2: Vigência */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Vigência & Validade</span>
            <div className="p-2 rounded-xl bg-blue-950/80 text-blue-400 border border-blue-800/60">
              <Calendar className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="flex items-baseline gap-2">
              <span className="text-2xl sm:text-3xl font-extrabold text-white">
                {license?.max_devices === 0 || (license?.days_remaining && license.days_remaining > 3650)
                  ? 'Vitalícia'
                  : (license?.days_remaining ?? 0)}
              </span>
              {license?.max_devices !== 0 && (!license?.days_remaining || license.days_remaining <= 3650) && (
                <span className="text-slate-400 text-sm font-medium">dias restantes</span>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2">
              Expira em:{' '}
              <strong className="text-slate-200">
                {license?.max_devices === 0 || (license?.days_remaining && license.days_remaining > 3650)
                  ? 'Sem Expiração (Uso Irrestrito)'
                  : (license?.expires_at ? new Date(license.expires_at).toLocaleDateString('pt-BR') : 'Indeterminado')}
              </strong>
            </p>
          </div>
        </div>

        {/* Card 3: Servidor Master */}
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-5 shadow-lg backdrop-blur-sm space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Servidor Master (Central)</span>
            <div className="p-2 rounded-xl bg-indigo-950/80 text-indigo-400 border border-indigo-800/60">
              <Cloud className="h-4 w-4" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              {license?.master_connected ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-sm font-semibold text-emerald-400">Sincronizado & Online</span>
                </>
              ) : !license?.master_url ? (
                <>
                  <span className="h-2 w-2 rounded-full bg-cyan-400" />
                  <span className="text-sm font-semibold text-cyan-400">Modo Autônomo / Standalone</span>
                </>
              ) : (
                <>
                  <span className="h-2 w-2 rounded-full bg-amber-400" />
                  <span className="text-sm font-semibold text-amber-400">Modo Offline Tolerante</span>
                </>
              )}
            </div>
            <p className="text-xs text-slate-400 mt-2 truncate">
              Servidor:{' '}
              <span className="text-slate-300 font-mono">
                {license?.master_url || 'Operação Local Standalone (Sem dependência externa)'}
              </span>
            </p>
          </div>
        </div>
      </div>

      {/* Instance ID & Diagnostics Banner */}
      {license?.instance_id && (
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-slate-400">
            <span className="font-semibold text-slate-300">Identificador Único desta Instância:</span>
            <code className="bg-slate-950 px-2 py-1 rounded text-cyan-300 font-mono border border-slate-800">
              {license.instance_id}
            </code>
          </div>
          <button
            onClick={handleCopyInstanceId}
            className="flex items-center gap-1.5 text-cyan-400 hover:text-cyan-300 transition shrink-0 font-medium"
          >
            {copiedId ? (
              <>
                <Check className="h-3.5 w-3.5 text-emerald-400" />
                <span className="text-emerald-400">Copiado!</span>
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5" />
                <span>Copiar Identificador para Suporte</span>
              </>
            )}
          </button>
        </div>
      )}

      {/* Modules & Feature Entitlements */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-4">
        <div>
          <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-cyan-400" />
            Módulos Habilitados pelo Plano
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">Recursos de telecomunicações ativos nesta instalação</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {modulesList.map((m) => {
            const Icon = m.icon
            return (
              <div
                key={m.id}
                className="bg-slate-800/50 border border-slate-800 rounded-xl p-3.5 flex items-start gap-3"
              >
                <div className="p-2 rounded-lg bg-cyan-950/60 text-cyan-400 border border-cyan-800/40 shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-semibold text-xs text-slate-200">{m.name}</span>
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                  </div>
                  <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">{m.desc}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Activation / Renewal Form (Accessible to Admin) */}
      {user?.role === 'admin' && (
        <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-6 shadow-xl backdrop-blur-sm space-y-4">
          <div>
            <h2 className="text-base font-bold text-white tracking-tight flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-indigo-400" />
              Ativar ou Renovar Chave de Licença
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Insira a chave criptográfica fornecida pelo seu consultor ou emitida pelo Servidor Master
            </p>
          </div>

          <form onSubmit={handleActivate} className="space-y-3">
            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                placeholder="Ex: NP-PRO-2026-XXXX-YYYY-ZZZZ"
                value={keyInput}
                onChange={(e) => setKeyInput(e.target.value)}
                className="flex-1 bg-slate-950 border border-slate-700/80 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder:text-slate-500 font-mono focus:outline-none focus:border-cyan-500 transition shadow-inner"
              />
              <button
                type="submit"
                disabled={activating || !keyInput.trim()}
                className="px-6 py-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold text-sm shadow-lg shadow-cyan-600/20 disabled:opacity-50 disabled:cursor-not-allowed transition flex items-center justify-center gap-2 shrink-0"
              >
                {activating ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Validando...</span>
                  </>
                ) : (
                  <>
                    <KeyRound className="h-4 w-4" />
                    <span>Ativar Licença</span>
                  </>
                )}
              </button>
            </div>

            {activateSuccess && (
              <div className="p-3 bg-emerald-950/60 border border-emerald-800 rounded-xl text-emerald-300 text-xs flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>{activateSuccess}</span>
              </div>
            )}

            {activateError && (
              <div className="p-3 bg-rose-950/60 border border-rose-800 rounded-xl text-rose-300 text-xs flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                <span>{activateError}</span>
              </div>
            )}

            <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-3 border-t border-slate-800/80 gap-2">
              <span className="text-xs text-slate-400">Deseja operar localmente sem restrições ou sem Servidor Master?</span>
              <button
                type="button"
                disabled={activating}
                onClick={async () => {
                  setActivating(true)
                  setActivateSuccess(null)
                  setActivateError(null)
                  try {
                    const updated = await activateLicense('NETPULSE-ENTERPRISE-UNLIMITED-VITALICIA')
                    setLicense(updated)
                    setActivateSuccess('Modo Enterprise Vitalício ativado! Limite de roteadores e expiração foram removidos.')
                  } catch (err: any) {
                    setActivateError(err.message || 'Falha ao ativar modo livre')
                  } finally {
                    setActivating(false)
                  }
                }}
                className="text-xs text-cyan-400 hover:text-cyan-300 font-semibold underline flex items-center gap-1.5 transition self-start sm:self-auto cursor-pointer"
              >
                <Zap className="h-3.5 w-3.5 text-cyan-400" />
                Ativar Modo Livre / Ilimitado (Sem Licença)
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  )
}
