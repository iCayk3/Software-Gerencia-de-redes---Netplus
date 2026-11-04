import React, { useState } from 'react'
import {
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  RefreshCw,
  Layers,
  Network,
  Activity,
  Terminal,
  FileCode2,
  X
} from 'lucide-react'
import type { DeviceComplianceAudit } from '../services/api'

interface DeviceComplianceModalProps {
  audit: DeviceComplianceAudit | null
  isOpen: boolean
  onClose: () => void
  onReAudit: (deviceId: string) => void
  isReAuditing: boolean
}

export const DeviceComplianceModal: React.FC<DeviceComplianceModalProps> = ({
  audit,
  isOpen,
  onClose,
  onReAudit,
  isReAuditing,
}) => {
  const [copied, setCopied] = useState(false)
  const [activeTab, setActiveTab] = useState<'all' | 'traffic' | 'core'>('all')

  if (!isOpen || !audit) return null

  const handleCopyScript = () => {
    if (audit.remediation_script) {
      navigator.clipboard.writeText(audit.remediation_script)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const filteredItems = audit.items.filter((item) => {
    if (activeTab === 'traffic') return item.category === 'traffic_engineering'
    if (activeTab === 'core') return item.category === 'bgp_core' || item.category === 'connectivity'
    return true
  })

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'passed':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
            <CheckCircle2 className="h-3.5 w-3.5" /> Conforme
          </span>
        )
      case 'warning':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-amber-500/15 text-amber-400 border border-amber-500/30">
            <AlertTriangle className="h-3.5 w-3.5" /> Requer Ajuste
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-rose-500/15 text-rose-400 border border-rose-500/30">
            <XCircle className="h-3.5 w-3.5" /> Não Conforme
          </span>
        )
    }
  }

  const getCategoryLabel = (category: string) => {
    switch (category) {
      case 'traffic_engineering':
        return 'Engenharia de Tráfego'
      case 'bgp_core':
        return 'BGP Core'
      case 'connectivity':
        return 'Conectividade'
      case 'telemetry':
        return 'Telemetria'
      default:
        return category
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden my-6 animate-in fade-in zoom-in-95 flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center gap-3">
            <div className={`p-2.5 rounded-xl border ${
              audit.is_manageable
                ? 'bg-emerald-950/50 border-emerald-800 text-emerald-400'
                : audit.overall_status === 'warning'
                ? 'bg-amber-950/50 border-amber-800 text-amber-400'
                : 'bg-rose-950/50 border-rose-800 text-rose-400'
            }`}>
              <ShieldCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-100 text-lg">{audit.device_name}</h3>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 font-mono border border-slate-700">
                  {audit.host}
                </span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 uppercase tracking-wider font-semibold border border-slate-700">
                  {audit.vendor}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                Auditoria de inteligência de configuração para compatibilidade com o padrão NetPulse
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-2 rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body Scrollable */}
        <div className="p-6 space-y-6 overflow-y-auto flex-1 text-slate-200">
          {/* Status Banner */}
          <div className={`p-4 rounded-xl border flex flex-col md:flex-row md:items-center justify-between gap-4 ${
            audit.is_manageable
              ? 'bg-gradient-to-r from-emerald-950/60 to-slate-900 border-emerald-800/80 text-emerald-200'
              : audit.overall_status === 'warning'
              ? 'bg-gradient-to-r from-amber-950/60 to-slate-900 border-amber-800/80 text-amber-200'
              : 'bg-gradient-to-r from-rose-950/60 to-slate-900 border-rose-800/80 text-rose-200'
          }`}>
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-black/40">
                  Status de Prontidão
                </span>
                <span className="font-bold text-base text-white">
                  {audit.is_manageable
                    ? '🟢 Pronto para Gerenciamento Total'
                    : audit.overall_status === 'warning'
                    ? '🟡 Parcialmente Compatível (Requer Ajuste Pré-definido)'
                    : '🔴 Incompatível ou Inacessível'}
                </span>
              </div>
              <p className="text-xs text-slate-300 max-w-xl">
                {audit.summary}
              </p>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              <div className="text-right">
                <div className="text-2xl font-black font-mono text-white tracking-tight">
                  {audit.overall_score}%
                </div>
                <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                  Índice de Conformidade
                </div>
              </div>
              <div className="w-14 h-14 rounded-full border-4 border-slate-800 flex items-center justify-center bg-slate-950 relative">
                <div
                  className={`absolute inset-0 rounded-full border-4 ${
                    audit.overall_score >= 80
                      ? 'border-emerald-500'
                      : audit.overall_score >= 50
                      ? 'border-amber-500'
                      : 'border-rose-500'
                  }`}
                  style={{
                    clipPath: `polygon(0 0, 100% 0, 100% 100%, 0 ${audit.overall_score}%)`
                  }}
                />
                <span className="text-xs font-bold text-white z-10">{audit.overall_score}</span>
              </div>
            </div>
          </div>

          {/* Quick Metrics Bar */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1 font-medium">
                <Network className="h-3.5 w-3.5 text-cyan-400" />
                <span>AS Local (ASN)</span>
              </div>
              <div className="font-mono text-sm font-bold text-slate-100">
                {audit.local_asn ? `AS ${audit.local_asn}` : 'Não Detectado'}
              </div>
              {audit.router_id && (
                <div className="text-[10px] text-slate-500 font-mono mt-0.5">
                  RID: {audit.router_id}
                </div>
              )}
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1 font-medium">
                <Activity className="h-3.5 w-3.5 text-purple-400" />
                <span>Sessões BGP</span>
              </div>
              <div className="font-mono text-sm font-bold text-slate-100">
                {audit.total_sessions > 0
                  ? `${audit.active_sessions} ativas / ${audit.total_sessions} total`
                  : 'Nenhum Peer'}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Upstreams & PTTs
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1 font-medium">
                <Layers className="h-3.5 w-3.5 text-amber-400" />
                <span>Padrão 3-Camadas</span>
              </div>
              <div className="font-semibold text-xs mt-0.5 flex items-center gap-1">
                {audit.has_origin_tagging ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> RP-TAG Ativo
                  </span>
                ) : (
                  <span className="text-amber-400 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3" /> Ausente
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Zero-Flap Origin Tags
              </div>
            </div>

            <div className="p-3 bg-slate-950/60 rounded-xl border border-slate-800">
              <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mb-1 font-medium">
                <Terminal className="h-3.5 w-3.5 text-blue-400" />
                <span>Telemetria Syslog</span>
              </div>
              <div className="font-semibold text-xs mt-0.5 flex items-center gap-1">
                {audit.has_telemetry ? (
                  <span className="text-emerald-400 flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3" /> Porta 1514 OK
                  </span>
                ) : (
                  <span className="text-slate-400 flex items-center gap-1">
                    Não configurada
                  </span>
                )}
              </div>
              <div className="text-[10px] text-slate-500 mt-0.5">
                Eventos em Tempo Real
              </div>
            </div>
          </div>

          {/* Checklist Tabs */}
          <div>
            <div className="flex items-center justify-between mb-3 border-b border-slate-800 pb-2">
              <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-2">
                <FileCode2 className="h-4 w-4 text-cyan-400" />
                <span>Diagnóstico Detalhado das Configurações Lidas</span>
              </h4>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium cursor-pointer transition-colors ${
                    activeTab === 'all'
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  Todos ({audit.items.length})
                </button>
                <button
                  onClick={() => setActiveTab('traffic')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium cursor-pointer transition-colors ${
                    activeTab === 'traffic'
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  Eng. de Tráfego
                </button>
                <button
                  onClick={() => setActiveTab('core')}
                  className={`px-2.5 py-1 text-xs rounded-lg font-medium cursor-pointer transition-colors ${
                    activeTab === 'core'
                      ? 'bg-cyan-600 text-white'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                  }`}
                >
                  BGP & Acesso
                </button>
              </div>
            </div>

            {/* Items List */}
            <div className="space-y-2.5">
              {filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`p-3.5 rounded-xl border transition-all ${
                    item.status === 'passed'
                      ? 'bg-slate-950/40 border-slate-800/80 hover:border-slate-700'
                      : item.status === 'warning'
                      ? 'bg-amber-950/20 border-amber-800/50 hover:border-amber-700/80'
                      : 'bg-rose-950/20 border-rose-800/50 hover:border-rose-700/80'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-semibold uppercase px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                          {getCategoryLabel(item.category)}
                        </span>
                        <h5 className="font-semibold text-slate-200 text-sm">{item.title}</h5>
                      </div>
                      <p className="text-xs text-slate-400">{item.description}</p>
                      <div className="text-xs text-slate-300 font-mono bg-slate-900/80 p-2 rounded-lg border border-slate-800 mt-2">
                        {item.message}
                      </div>
                      {item.remediation && (
                        <div className="text-xs text-amber-300/90 bg-amber-950/30 p-2 rounded-lg border border-amber-800/50 mt-1.5 flex items-start gap-1.5">
                          <AlertTriangle className="h-3.5 w-3.5 text-amber-400 shrink-0 mt-0.5" />
                          <span><strong>Recomendação:</strong> {item.remediation}</span>
                        </div>
                      )}
                    </div>
                    <div className="shrink-0">{getStatusBadge(item.status)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Remediation Script Section (One-Click Setup) */}
          {audit.remediation_script && (
            <div className="p-4 rounded-xl bg-slate-950 border border-cyan-800/40 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold text-cyan-300 uppercase tracking-wider flex items-center gap-2">
                    <Terminal className="h-4 w-4 text-cyan-400" />
                    <span>Script de Adequação ao Padrão Pré-Definido ({audit.vendor.toUpperCase()})</span>
                  </h4>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Execute estes comandos no console do seu roteador para habilitar o gerenciamento automatizado sem flap.
                  </p>
                </div>
                <button
                  onClick={handleCopyScript}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-white rounded-lg text-xs font-semibold cursor-pointer shadow-md shadow-cyan-600/20 transition-all shrink-0"
                >
                  {copied ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-300" />
                      <span>Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" />
                      <span>Copiar Script</span>
                    </>
                  )}
                </button>
              </div>

              <div className="relative">
                <pre className="p-3.5 bg-slate-900/90 rounded-lg text-xs font-mono text-cyan-200 overflow-x-auto max-h-56 border border-slate-800 select-all whitespace-pre-wrap">
                  {audit.remediation_script}
                </pre>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <div className="text-[11px] text-slate-400 font-mono">
            Última auditoria: {new Date(audit.audited_at).toLocaleTimeString('pt-BR')}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => onReAudit(audit.device_id)}
              disabled={isReAuditing}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-medium border border-slate-700 cursor-pointer disabled:opacity-50 transition-colors"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${isReAuditing ? 'animate-spin text-cyan-400' : 'text-cyan-400'}`} />
              <span>{isReAuditing ? 'Auditando...' : 'Re-auditar Agora'}</span>
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg text-xs font-semibold cursor-pointer transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
