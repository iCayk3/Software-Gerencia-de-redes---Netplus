import React, { useState, useMemo } from 'react'
import {
  X,
  SlidersHorizontal,
  Check,
  Copy,
  Zap,
  Crown,
  Route as RouteIcon,
  Layers,
  Save,
  Info,
} from 'lucide-react'
import type { Device } from '../../services/api'
import { getBatchPrependCliPreviewForDevice, type BatchPrependTarget } from './trafficHelpers'

export interface BatchPrependModalProps {
  isOpen: boolean
  onClose: () => void
  targets: BatchPrependTarget[]
  devices: Device[]
  masterDevice: Device | null
  onApplyBatch?: (targets: BatchPrependTarget[], prependCount: number, isBlock: boolean) => Promise<void>
  mode?: 'save_preview' | 'edit_batch'
}

export const BatchPrependModal: React.FC<BatchPrependModalProps> = ({
  isOpen,
  onClose,
  targets,
  devices,
  masterDevice,
  onApplyBatch,
  mode = 'save_preview',
}) => {
  const [prependCountChoice, setPrependCountChoice] = useState<number>(0)
  const [isBlockChoice, setIsBlockChoice] = useState<boolean>(false)
  const [copied, setCopied] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  // Target device is always the BGP Master controller (or fallback)
  const targetDevice = useMemo(() => {
    return masterDevice || devices.find((d) => d.is_bgp !== false) || devices[0]
  }, [masterDevice, devices])

  // Generate consolidated CLI script for all selected targets
  const batchCliScript = useMemo(() => {
    if (!targetDevice || targets.length === 0) return ''
    return getBatchPrependCliPreviewForDevice(
      targetDevice,
      targets,
      prependCountChoice,
      isBlockChoice
    )
  }, [targetDevice, targets, prependCountChoice, isBlockChoice])

  if (!isOpen || targets.length === 0) return null

  const handleCopy = () => {
    if (!batchCliScript) return
    navigator.clipboard.writeText(batchCliScript)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleExecute = async () => {
    if (!onApplyBatch) return
    setSubmitting(true)
    setErrorMsg(null)
    setSuccessMsg(null)
    try {
      await onApplyBatch(targets, prependCountChoice, isBlockChoice)
      setSuccessMsg(`Alteração em lote aplicada com sucesso para ${targets.length} sessões/blocos!`)
      setTimeout(() => {
        onClose()
      }, 1400)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao processar lote'
      setErrorMsg(msg)
    } finally {
      setSubmitting(false)
    }
  }

  const isSavePreview = mode === 'save_preview'

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-[#1C202C] border border-[#242836] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-[#242836] pb-3">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-[#25334D] border border-[#3B5B8C]/40 flex items-center justify-center text-[#93B4E6] shrink-0">
              {isSavePreview ? <Save className="h-5 w-5" /> : <Layers className="h-5 w-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-white flex items-center gap-2">
                <span>{isSavePreview ? 'Salvar Engenharia de Prepend (Prévia CLI)' : 'Ajustar Prepend em Lote'}</span>
                <span className="text-xs px-2 py-0.5 rounded-md font-mono bg-[#25334D] text-[#93B4E6] border border-[#3B5B8C]/40">
                  {targets.length} {targets.length === 1 ? 'alvo' : 'alvos'}
                </span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                {isSavePreview
                  ? 'Revise os comandos consolidados prontos para execução no BGP Master'
                  : 'Altere simultaneamente as políticas de anúncio de múltiplas operadoras e blocos'}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white p-1 cursor-pointer transition rounded-lg hover:bg-[#161922]"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Master Controller Banner */}
        <div className="p-3.5 rounded-xl bg-gradient-to-r from-[#25334D]/80 to-[#1C202C] border border-[#3B5B8C]/50 text-slate-200 text-xs flex items-start gap-3 shadow-sm">
          <Crown className="h-5 w-5 text-[#E5A93C] shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <strong className="font-semibold text-white">
                Roteador BGP Master Ativo: {targetDevice?.name || 'BGP-RT.01.PA.PIRB.01'}
              </strong>
              <span className="text-[10px] font-mono bg-[#161922] text-[#93B4E6] px-1.5 py-0.5 rounded border border-[#242836]">
                {targetDevice?.host || 'Host BGP Master'}
              </span>
            </div>
            <p className="text-[11px] text-slate-300 leading-relaxed">
              Toda a engenharia de tráfego é tratada centralmente neste equipamento, que propaga as comunidades para os demais roteadores de borda via iBGP.
            </p>
          </div>
        </div>

        {/* Simulation / Safe Mode Badge */}
        {isSavePreview && (
          <div className="p-3 rounded-xl bg-[#25334D]/40 border border-[#3B5B8C]/40 text-slate-300 text-xs flex items-start gap-2.5">
            <Info className="h-4 w-4 text-[#93B4E6] shrink-0 mt-0.5" />
            <div className="text-[11px] leading-relaxed">
              <strong>Modo Prévia Ativo:</strong> Nenhuma alteração foi executada no equipamento físico. Os comandos abaixo foram compilados para conferência técnica e aplicação manual no terminal do roteador BGP Master.
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs">
            {errorMsg}
          </div>
        )}
        {successMsg && (
          <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
            <Check className="h-4 w-4 text-emerald-400" />
            {successMsg}
          </div>
        )}

        {/* Targets Summary Table in save_preview mode */}
        {isSavePreview ? (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                Prefixos e Sessões Planejadas ({targets.length}):
              </span>
              <span className="text-[10px] text-slate-500">
                Resumo De ➔ Para
              </span>
            </div>
            <div className="rounded-xl border border-[#242836] overflow-hidden max-h-48 overflow-y-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead className="bg-[#161922] text-slate-400 font-semibold border-b border-[#242836]">
                  <tr>
                    <th className="py-2 px-3">Prefixo</th>
                    <th className="py-2 px-3">Operadora / IX</th>
                    <th className="py-2 px-3">Prepend Anterior</th>
                    <th className="py-2 px-3">Novo Prepend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#242836] bg-[#1C202C]">
                  {targets.map((t, idx) => {
                    const isBlock = t.newIsBlock !== undefined ? t.newIsBlock : isBlockChoice
                    const count = t.newPrependCount !== undefined ? t.newPrependCount : prependCountChoice
                    return (
                      <tr key={`${t.peerIp}-${t.prefix}-${idx}`} className="hover:bg-[#1E2330]/60">
                        <td className="py-2 px-3 font-bold text-white">{t.prefix}</td>
                        <td className="py-2 px-3 font-sans text-slate-300">
                          {t.peerName || t.peerIp} {t.remoteAs ? `(AS${t.remoteAs})` : ''}
                        </td>
                        <td className="py-2 px-3 text-slate-400">
                          {t.currentIsBlock
                            ? 'Bloqueado (Deny)'
                            : t.currentPrependCount === 0 || t.currentPrependCount === undefined
                            ? '0P (Primário)'
                            : `${t.currentPrependCount}x (${t.currentPrependCount}P)`}
                        </td>
                        <td className="py-2 px-3">
                          {isBlock ? (
                            <span className="text-xs font-semibold text-[#D9534F] inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#D9534F]"></span>
                              Bloqueado (Deny)
                            </span>
                          ) : count === 0 ? (
                            <span className="text-xs font-semibold text-[#2E9E6B] inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#2E9E6B]"></span>
                              0P (Primário)
                            </span>
                          ) : (
                            <span className="text-xs font-semibold text-[#D99B26] inline-flex items-center gap-1">
                              <span className="w-1.5 h-1.5 rounded-full bg-[#D99B26]"></span>
                              {count}x Prepend ({count}P)
                            </span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Chips Summary in edit_batch mode */
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold uppercase tracking-wider text-[11px]">
                Sessões e Prefixos no Lote ({targets.length}):
              </span>
              <span className="text-[10px] text-slate-500">
                Todas receberão o novo prepend escolhido
              </span>
            </div>
            <div className="p-2.5 rounded-xl bg-[#161922] border border-[#242836] flex flex-wrap gap-2 max-h-32 overflow-y-auto">
              {targets.map((t, idx) => (
                <span
                  key={`${t.peerIp}-${t.prefix}-${idx}`}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-[#1C202C] border border-[#242836] text-[11px] font-mono text-slate-200"
                >
                  <RouteIcon className="h-3 w-3 text-[#4A72B2]" />
                  <span className="font-semibold text-white">{t.peerName || t.peerIp}</span>
                  <span className="text-slate-400">({t.prefix})</span>
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Choice Selector Grid (only in edit_batch mode) */}
        {!isSavePreview && (
          <div className="space-y-3">
            <label className="block text-slate-300 font-semibold text-xs">
              Selecione a Estratégia de Entrada para Todo o Lote:
            </label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {/* 0P */}
              <button
                type="button"
                onClick={() => {
                  setIsBlockChoice(false)
                  setPrependCountChoice(0)
                }}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                  !isBlockChoice && prependCountChoice === 0
                    ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 ring-2 ring-emerald-500/20 shadow-md'
                    : 'bg-[#161922] border-[#242836] text-slate-300 hover:bg-[#1E2330]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-emerald-400">0P (Primário / Sem Prepend)</span>
                  {!isBlockChoice && prependCountChoice === 0 && (
                    <Check className="h-4 w-4 text-emerald-400" />
                  )}
                </div>
                <span className="text-[11px] text-slate-400">
                  Caminho prioritário mais curto para todas as sessões selecionadas.
                </span>
              </button>

              {/* 1P */}
              <button
                type="button"
                onClick={() => {
                  setIsBlockChoice(false)
                  setPrependCountChoice(1)
                }}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                  !isBlockChoice && prependCountChoice === 1
                    ? 'bg-[#25334D] border-[#3B5B8C] text-blue-200 ring-2 ring-[#3B5B8C]/30 shadow-md'
                    : 'bg-[#161922] border-[#242836] text-slate-300 hover:bg-[#1E2330]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-[#93B4E6]">1x Prepend (1P)</span>
                  {!isBlockChoice && prependCountChoice === 1 && (
                    <Check className="h-4 w-4 text-[#93B4E6]" />
                  )}
                </div>
                <span className="text-[11px] text-slate-400">
                  Adiciona +1 salto AS para despriorizar levemente.
                </span>
              </button>

              {/* 2P */}
              <button
                type="button"
                onClick={() => {
                  setIsBlockChoice(false)
                  setPrependCountChoice(2)
                }}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                  !isBlockChoice && prependCountChoice === 2
                    ? 'bg-amber-950/50 border-amber-600 text-amber-200 ring-2 ring-amber-500/20 shadow-md'
                    : 'bg-[#161922] border-[#242836] text-slate-300 hover:bg-[#1E2330]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-amber-400">2x Prepend (2P)</span>
                  {!isBlockChoice && prependCountChoice === 2 && (
                    <Check className="h-4 w-4 text-amber-400" />
                  )}
                </div>
                <span className="text-[11px] text-slate-400">
                  Despriorização média. O tráfego prefere outras operadoras se existirem.
                </span>
              </button>

              {/* 3P */}
              <button
                type="button"
                onClick={() => {
                  setIsBlockChoice(false)
                  setPrependCountChoice(3)
                }}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                  !isBlockChoice && prependCountChoice === 3
                    ? 'bg-amber-950/60 border-amber-500 text-amber-200 ring-2 ring-amber-500/30 shadow-md'
                    : 'bg-[#161922] border-[#242836] text-slate-300 hover:bg-[#1E2330]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-amber-300">3x Prepend (3P)</span>
                  {!isBlockChoice && prependCountChoice === 3 && (
                    <Check className="h-4 w-4 text-amber-300" />
                  )}
                </div>
                <span className="text-[11px] text-slate-400">
                  Caminho muito longo. Usado para rota de contingência ou backup.
                </span>
              </button>

              {/* Block */}
              <button
                type="button"
                onClick={() => {
                  setIsBlockChoice(true)
                  setPrependCountChoice(0)
                }}
                className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 sm:col-span-2 ${
                  isBlockChoice
                    ? 'bg-rose-950/60 border-rose-500 text-rose-200 ring-2 ring-rose-500/20 shadow-md'
                    : 'bg-[#161922] border-[#242836] text-slate-300 hover:bg-[#1E2330]'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-rose-400">
                    Bloquear Anúncios (Deny Seletivo no Lote)
                  </span>
                  {isBlockChoice && <Check className="h-4 w-4 text-rose-400" />}
                </div>
                <span className="text-[11px] text-slate-400">
                  Aplica a comunidade de descarte. Os blocos não serão anunciados para estas operadoras.
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Live CLI Preview for Master */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-slate-300 font-semibold text-xs flex items-center gap-1.5">
              <span>Script Consolidado para o BGP Master:</span>
              <strong className="text-[#E5A93C] font-mono">{targetDevice?.name}</strong>
            </span>
            <button
              type="button"
              onClick={handleCopy}
              className="flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-[#25334D] hover:bg-[#2E3E5E] text-[#93B4E6] border border-[#3B5B8C]/40 transition cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span className="text-emerald-400 font-medium">Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copiar Script</span>
                </>
              )}
            </button>
          </div>
          <div className="bg-[#13151D] border border-[#242836] p-3.5 rounded-xl font-mono text-[11px] text-[#2E9E6B] leading-relaxed whitespace-pre-wrap select-all max-h-48 overflow-y-auto shadow-inner">
            {batchCliScript}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-3 border-t border-[#242836]">
          <div className="text-[11px] text-slate-400 flex items-center gap-1">
            <Zap className="h-3.5 w-3.5 text-[#E5A93C]" />
            <span>{isSavePreview ? 'Pronto para execução no terminal do NOC' : 'Executa sem flap via BGP Route-Refresh'}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="px-4 py-2 rounded-xl bg-[#161922] hover:bg-[#252C3D] text-slate-300 text-xs transition cursor-pointer"
            >
              Fechar
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className="px-5 py-2.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-blue-600/30 transition cursor-pointer flex items-center gap-2 text-xs"
            >
              <Copy className="h-4 w-4" />
              <span>{copied ? 'Comandos Copiados!' : 'Copiar Comandos CLI'}</span>
            </button>
            {!isSavePreview && (
              <button
                type="button"
                onClick={handleExecute}
                disabled={submitting}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold rounded-xl shadow-lg shadow-emerald-600/30 transition cursor-pointer flex items-center gap-2 text-xs disabled:opacity-50"
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>{submitting ? 'Aplicando em Lote...' : `Aplicar em ${targets.length} Sessões`}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
