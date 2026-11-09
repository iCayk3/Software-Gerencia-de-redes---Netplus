import React from 'react'
import {
  Plus,
  Trash2,
  X,
  ShieldCheck,
  CheckCircle2,
  Check,
  Copy,
  RefreshCw,
  Edit3,
  UploadCloud,
  Image as ImageIcon,
  SlidersHorizontal,
  Zap,
  ShieldAlert,
  AlertTriangle,
  Camera,
  Layers,
  Download,
  Upload,
  Route as RouteIcon,
  CheckCircle,
  Sliders,
  Lock,
  Crown,
} from 'lucide-react'
import type {
  Device,
  StaticRoute,
  BGPASSection,
  PrefixPrependState,
  ASPrependGroup,
  TrafficProfile,
  ProfileTag,
  ProfileDiffResponse,
  ApplyProfileResult,
} from '../../services/api'
import { getProfileTagBadge } from './trafficHelpers'
import { isBGPMasterDevice } from '../../utils/bgpMaster'

export interface TrafficModalsProps {
  // Add Route Modal
  isAddModalOpen: boolean
  setIsAddModalOpen: (open: boolean) => void
  targetSection: BGPASSection | null
  devices: Device[]
  formDevice: string
  setFormDevice: (dev: string) => void
  formDest: string
  setFormDest: (dest: string) => void
  formNextHop: string
  setFormNextHop: (hop: string) => void
  formPref: string
  setFormPref: (pref: string) => void
  formDesc: string
  setFormDesc: (desc: string) => void
  submitting: boolean
  modalError: string | null
  copiedKey: string | null
  addRouteSuccessMsg: string | null
  handleAddRoute: (e: React.FormEvent) => void
  onCopyText: (text: string, key: string) => void
  staticRouteCliPreview: string

  // Delete Route Modal
  isDeleteRouteModalOpen: boolean
  setIsDeleteRouteModalOpen: (open: boolean) => void
  routeToDelete: StaticRoute | null
  setRouteToDelete: (r: StaticRoute | null) => void
  deleteRouteSuccessMsg: string | null
  deletingId: string | null
  handleConfirmDeleteRoute: () => void
  deleteStaticRouteCliPreview: string

  // AS Modal
  isASModalOpen: boolean
  setIsASModalOpen: (open: boolean) => void
  customizingSection: BGPASSection | null
  asFormAlias: string
  setAsFormAlias: (s: string) => void
  asFormRole: string
  setAsFormRole: (s: string) => void
  asFormDescription: string
  setAsFormDescription: (s: string) => void
  asFormImageUrl: string
  setAsFormImageUrl: (s: string) => void
  asImagePreview: string | null
  setAsImagePreview: (s: string | null) => void
  asSaving: boolean
  asModalError: string | null
  handleSaveASMetadata: (e: React.FormEvent) => void
  handleImageFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void

  // Local-Pref Modal
  isLocalPrefModalOpen: boolean
  setIsLocalPrefModalOpen: (open: boolean) => void
  localPrefSection: BGPASSection | null
  targetLocalPref: number
  setTargetLocalPref: (val: number) => void
  localPrefError: string | null
  localPrefCliPreview: string

  // Prepend Modal
  isPrependModalOpen: boolean
  setIsPrependModalOpen: (open: boolean) => void
  targetPrependPrefix: PrefixPrependState | null
  targetPrependGroup: ASPrependGroup | null
  cliTargetRouter: string
  setCliTargetRouter: (router: string) => void
  prependCountChoice: number
  setPrependCountChoice: (val: number) => void
  isBlockChoice: boolean
  setIsBlockChoice: (b: boolean) => void
  prependModalError: string | null
  prependSuccessMsg: string | null
  prependCliPreview: string

  // Capture Profile Modal
  isCaptureModalOpen: boolean
  setIsCaptureModalOpen: (open: boolean) => void
  captureName: string
  setCaptureName: (s: string) => void
  captureTag: ProfileTag
  setCaptureTag: (tag: ProfileTag) => void
  captureDesc: string
  setCaptureDesc: (s: string) => void
  capturing: boolean
  captureError: string | null
  handleSaveCapture: (e: React.FormEvent) => void

  // Diff & Staging Modal
  isDiffModalOpen: boolean
  setIsDiffModalOpen: (open: boolean) => void
  diffProfile: TrafficProfile | null
  diffLoading: boolean
  diffData: ProfileDiffResponse | null
  diffError: string | null
  diffModalTab: 'diff' | 'scripts'
  setDiffModalTab: (tab: 'diff' | 'scripts') => void
  selectedDiffDevice: string
  setSelectedDiffDevice: (dev: string) => void
  applyResult: ApplyProfileResult | null
  applyingProfile: boolean
  canOperate: boolean
  handleApplyProfile: (profileId: string) => void

  // Manage Profiles Modal
  isManageModalOpen: boolean
  setIsManageModalOpen: (open: boolean) => void
  profiles: TrafficProfile[]
  deletingProfileId: string | null
  handleDeleteProfile: (id: string, name: string) => void
  handleOpenDiff: (profile: TrafficProfile) => void
}

export const TrafficModals: React.FC<TrafficModalsProps> = ({
  // Add Route
  isAddModalOpen,
  setIsAddModalOpen,
  targetSection,
  devices,
  formDevice,
  setFormDevice,
  formDest,
  setFormDest,
  formNextHop,
  setFormNextHop,
  formPref,
  setFormPref,
  formDesc,
  setFormDesc,
  submitting,
  modalError,
  copiedKey,
  addRouteSuccessMsg,
  handleAddRoute,
  onCopyText,
  staticRouteCliPreview,

  // Delete Route
  isDeleteRouteModalOpen,
  setIsDeleteRouteModalOpen,
  routeToDelete,
  setRouteToDelete,
  deleteRouteSuccessMsg,
  deletingId,
  handleConfirmDeleteRoute,
  deleteStaticRouteCliPreview,

  // AS Customizer
  isASModalOpen,
  setIsASModalOpen,
  customizingSection,
  asFormAlias,
  setAsFormAlias,
  asFormRole,
  setAsFormRole,
  asFormDescription,
  setAsFormDescription,
  asFormImageUrl,
  setAsFormImageUrl,
  asImagePreview,
  setAsImagePreview,
  asSaving,
  asModalError,
  handleSaveASMetadata,
  handleImageFileChange,

  // Local-Pref
  isLocalPrefModalOpen,
  setIsLocalPrefModalOpen,
  localPrefSection,
  targetLocalPref,
  setTargetLocalPref,
  localPrefError,
  localPrefCliPreview,

  // Prepend
  isPrependModalOpen,
  setIsPrependModalOpen,
  targetPrependPrefix,
  targetPrependGroup,
  cliTargetRouter,
  setCliTargetRouter,
  prependCountChoice,
  setPrependCountChoice,
  isBlockChoice,
  setIsBlockChoice,
  prependModalError,
  prependSuccessMsg,
  prependCliPreview,

  // Capture Profile
  isCaptureModalOpen,
  setIsCaptureModalOpen,
  captureName,
  setCaptureName,
  captureTag,
  setCaptureTag,
  captureDesc,
  setCaptureDesc,
  capturing,
  captureError,
  handleSaveCapture,

  // Diff & Staging
  isDiffModalOpen,
  setIsDiffModalOpen,
  diffProfile,
  diffLoading,
  diffData,
  diffError,
  diffModalTab,
  setDiffModalTab,
  selectedDiffDevice,
  setSelectedDiffDevice,
  applyResult,
  applyingProfile,
  canOperate,
  handleApplyProfile,

  // Manage Profiles
  isManageModalOpen,
  setIsManageModalOpen,
  profiles,
  deletingProfileId,
  handleDeleteProfile,
  handleOpenDiff,
}) => {
  return (
    <>
      {/* ===================== MODAL 1: DEFINIR ROTA ESTÁTICA [+] ===================== */}
      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Plus className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    {targetSection
                      ? `Definir Bloco de Saída: AS ${targetSection.remote_as}`
                      : 'Nova Rota Estática de Upload'}
                  </h3>
                  {targetSection && (
                    <p className="text-[11px] text-slate-400">
                      Operadora:{' '}
                      <strong className="text-cyan-300">
                        {targetSection.metadata.alias || targetSection.peer_name}
                      </strong>
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setIsAddModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Safety Mode Banner */}
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-200 shadow-sm">
              <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold text-amber-300">
                  Modo Manual Ativo (Zero Commits Automáticos):
                </strong>
                O sistema gera os comandos CLI exatos para o host selecionado. Nenhuma alteração é
                enviada diretamente ao equipamento pelo software.
              </div>
            </div>

            {modalError && (
              <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-300 text-xs">
                {modalError}
              </div>
            )}

            {copiedKey === 'add_route' && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>
                  <strong>Comandos copiados com sucesso!</strong> Cole no terminal SSH (Putty) do
                  roteador.
                </span>
              </div>
            )}

            {addRouteSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{addRouteSuccessMsg}</span>
              </div>
            )}

            <form onSubmit={handleAddRoute} className="space-y-4 text-xs font-sans">
              {/* Equipamento */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">Roteador</label>
                <select
                  value={formDevice}
                  onChange={(e) => setFormDevice(e.target.value)}
                  disabled={Boolean(targetSection)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none cursor-pointer disabled:opacity-75"
                >
                  {devices.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.host}) - {d.vendor?.toUpperCase()}
                    </option>
                  ))}
                </select>
              </div>

              {/* Prefixo de Destino */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400 font-medium">
                    Bloco / Prefixo de Destino (CIDR)
                  </label>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => setFormDest('0.0.0.0/0')}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[10px] font-mono cursor-pointer"
                    >
                      0.0.0.0/0 (Default)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormDest('45.166.28.0/22')}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[10px] font-mono cursor-pointer"
                    >
                      /22
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormDest('45.166.28.0/24')}
                      className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-cyan-400 text-[10px] font-mono cursor-pointer"
                    >
                      /24
                    </button>
                  </div>
                </div>
                <input
                  type="text"
                  placeholder="ex: 0.0.0.0/0 ou 177.54.120.0/22"
                  value={formDest}
                  onChange={(e) => setFormDest(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 font-mono rounded-xl px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  required
                />
              </div>

              {/* Próximo Salto */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Próximo Salto (Gateway / Next-Hop IP)
                </label>
                <input
                  type="text"
                  placeholder="ex: 170.82.183.217"
                  value={formNextHop}
                  onChange={(e) => setFormNextHop(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 font-mono rounded-xl px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  required
                />
                {targetSection && (
                  <span className="text-[10px] text-emerald-400/90 mt-1 block">
                    &bull; Vinculado automaticamente ao Peer IP de{' '}
                    {targetSection.metadata.alias || targetSection.peer_name}
                  </span>
                )}
              </div>

              {/* Preferência e Descrição */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    Preferência (Distância)
                  </label>
                  <input
                    type="number"
                    placeholder="60"
                    value={formPref}
                    onChange={(e) => setFormPref(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-200 font-mono rounded-xl px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Huawei padrão: 60 / MikroTik: 1
                  </span>
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">
                    Descrição / Comentário
                  </label>
                  <input
                    type="text"
                    placeholder="ex: TE-UPLOAD-AS266445"
                    value={formDesc}
                    onChange={(e) => setFormDesc(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Command Preview with Copy Button */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px] font-sans font-semibold">
                    Comandos CLI Gerados para o Host (
                    {devices.find((d) => d.id === formDevice)?.name || 'Roteador'}):
                  </span>
                  <button
                    type="button"
                    onClick={() => onCopyText(staticRouteCliPreview, 'add_route')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {copiedKey === 'add_route' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-300 font-bold">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="text-cyan-300 space-y-0.5 bg-black/60 p-3 rounded-lg border border-slate-800/80 font-mono leading-relaxed select-all whitespace-pre-wrap">
                  {staticRouteCliPreview}
                </div>
                <p className="text-slate-500 text-[10px] font-sans">
                  * Cole os comandos no Putty/terminal SSH do host para criar a rota com segurança.
                </p>
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={() => onCopyText(staticRouteCliPreview, 'add_route')}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl border border-slate-700 transition cursor-pointer flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  <span>Copiar Comandos</span>
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-cyan-600/30 transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Registrando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Copiar & Registrar Auditoria</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL 1B: REMOVER ROTA ESTÁTICA ===================== */}
      {isDeleteRouteModalOpen && routeToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <Trash2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">Remover Rota Estática</h3>
                  <p className="text-[11px] text-slate-400">
                    Host: <strong className="text-rose-300">{routeToDelete.device_name}</strong>{' '}
                    &bull; Bloco:{' '}
                    <strong className="text-cyan-300">{routeToDelete.destination}</strong>
                  </p>
                </div>
              </div>
              <button
                onClick={() => {
                  setIsDeleteRouteModalOpen(false)
                  setRouteToDelete(null)
                }}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Safety Mode Banner */}
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-200">
              <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold text-amber-300">
                  Modo Manual Ativo (Zero Alteração no Roteador):
                </strong>
                O comando de remoção abaixo foi gerado para você executar com segurança no terminal
                SSH do roteador. Nenhuma alteração é enviada diretamente ao equipamento pelo software.
              </div>
            </div>

            {/* Feedback Notifications */}
            {copiedKey === 'delete_route' && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>
                  <strong>Comando de remoção copiado!</strong> Cole no terminal SSH (Putty) do
                  roteador.
                </span>
              </div>
            )}
            {deleteRouteSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>{deleteRouteSuccessMsg}</span>
              </div>
            )}

            {/* Details Box */}
            <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] font-mono">
              <div>
                <span className="text-slate-500 block text-[10px] font-sans">
                  Prefixo / Destino:
                </span>
                <span className="text-cyan-300 font-bold">{routeToDelete.destination}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-sans">
                  Gateway / Próximo Salto:
                </span>
                <span className="text-emerald-400 font-bold">{routeToDelete.next_hop}</span>
              </div>
            </div>

            {/* Command Preview with Copy Button */}
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[11px] font-sans font-semibold">
                  Comando CLI de Remoção para {routeToDelete.device_name}:
                </span>
                <button
                  type="button"
                  onClick={() => onCopyText(deleteStaticRouteCliPreview, 'delete_route')}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                >
                  {copiedKey === 'delete_route' ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-400" />
                      <span className="text-emerald-300 font-bold">Copiado!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5 text-slate-400" />
                      <span>Copiar</span>
                    </>
                  )}
                </button>
              </div>
              <div className="text-rose-300 space-y-0.5 bg-black/60 p-3 rounded-lg border border-slate-800/80 font-mono leading-relaxed select-all whitespace-pre-wrap">
                {deleteStaticRouteCliPreview}
              </div>
              <p className="text-slate-500 text-[10px] font-sans">
                * Cole os comandos no Putty/terminal SSH do host para remover a rota com segurança.
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setIsDeleteRouteModalOpen(false)
                  setRouteToDelete(null)
                }}
                className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => onCopyText(deleteStaticRouteCliPreview, 'delete_route')}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold rounded-xl border border-slate-700 transition cursor-pointer flex items-center gap-2"
              >
                <Copy className="h-4 w-4" />
                <span>Copiar Comando</span>
              </button>
              <button
                type="button"
                disabled={Boolean(deletingId)}
                onClick={handleConfirmDeleteRoute}
                className="px-5 py-2.5 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-semibold rounded-xl shadow-lg shadow-rose-600/30 transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                {deletingId ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" />
                    <span>Registrando...</span>
                  </>
                ) : (
                  <>
                    <Check className="h-4 w-4" />
                    <span>Copiar & Registrar Remoção</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL 2: PERSONALIZAR AS (ALIAS & LOGO) ===================== */}
      {isASModalOpen && customizingSection && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                  <Edit3 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Personalizar AS {customizingSection.remote_as}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Defina o nome amigável e a logo oficial da operadora
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsASModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {asModalError && (
              <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-300 text-xs">
                {asModalError}
              </div>
            )}

            <form onSubmit={handleSaveASMetadata} className="space-y-4 text-xs font-sans">
              {/* AS Number (Read-only badge) */}
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800">
                <span className="text-slate-400">Número do AS (ASN):</span>
                <span className="font-mono font-bold text-cyan-300">
                  AS{customizingSection.remote_as}
                </span>
              </div>

              {/* Apelido / Alias */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Nome Amigável / Alias da Operadora
                </label>
                <input
                  type="text"
                  placeholder="ex: SEA Telecom (Trânsito Primário)"
                  value={asFormAlias}
                  onChange={(e) => setAsFormAlias(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  required
                />
              </div>

              {/* Papel / Função */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Papel / Classificação no Tráfego
                </label>
                <select
                  value={asFormRole}
                  onChange={(e) => setAsFormRole(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none cursor-pointer"
                >
                  <option value="transit_primary">Trânsito Primário (Principal)</option>
                  <option value="transit_secondary">Trânsito Secundário (Backup)</option>
                  <option value="ix_ptt">IX / PTT (Ponto de Troca de Tráfego)</option>
                  <option value="peering">Peering Privado / CDN</option>
                  <option value="other">Outro BGP Peer</option>
                </select>
              </div>

              {/* Imagem / Logo Upload & Preview */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Logo / Imagem da Operadora
                </label>

                <div className="flex items-center gap-4 p-3 rounded-xl bg-slate-950/60 border border-slate-800">
                  {/* Image Preview Box */}
                  <div className="h-16 w-16 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0">
                    {asImagePreview ? (
                      <img
                        src={asImagePreview}
                        alt="Preview"
                        className="w-full h-full object-contain p-1"
                      />
                    ) : (
                      <ImageIcon className="h-6 w-6 text-slate-600" />
                    )}
                  </div>

                  {/* Upload Controls */}
                  <div className="flex-1 space-y-2">
                    <label className="flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold transition cursor-pointer">
                      <UploadCloud className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Subir Imagem (PNG/JPG/SVG)</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/svg+xml,image/webp"
                        onChange={handleImageFileChange}
                        className="hidden"
                      />
                    </label>

                    <div className="text-[10px] text-slate-500">
                      Ou informe uma URL direta de imagem:
                    </div>
                    <input
                      type="text"
                      placeholder="https://exemplo.com/logo.png"
                      value={asFormImageUrl}
                      onChange={(e) => {
                        setAsFormImageUrl(e.target.value)
                        setAsImagePreview(e.target.value)
                      }}
                      className="w-full bg-slate-800/60 border border-slate-700/80 text-slate-200 text-[11px] rounded-lg px-2.5 py-1 focus:ring-1 focus:ring-cyan-500 focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Descrição / Observações */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Descrição / Contrato
                </label>
                <input
                  type="text"
                  placeholder="ex: Circuito 10Gbps via SEA Telecom"
                  value={asFormDescription}
                  onChange={(e) => setAsFormDescription(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                />
              </div>

              {/* Actions */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsASModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={asSaving}
                  className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-cyan-600/30 transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {asSaving ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Salvar Personalização</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL 3: AJUSTAR LOCAL-PREFERENCE ===================== */}
      {isLocalPrefModalOpen && localPrefSection && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Ajustar Local-Preference</span>
                    <span className="text-xs px-2 py-0.5 rounded-md font-mono bg-amber-950/80 text-amber-300 border border-amber-800/80">
                      AS{localPrefSection.remote_as}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400">
                    {localPrefSection.metadata.alias || localPrefSection.peer_name} &bull;{' '}
                    {localPrefSection.device_name}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsLocalPrefModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Safety Mode Banner */}
            <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/60 flex items-start gap-2.5 text-xs text-amber-200 shadow-sm">
              <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
              <div>
                <strong className="block font-bold text-amber-300">
                  Modo Manual Ativo (Zero Alteração no Roteador):
                </strong>
                O sistema gera os comandos exatos prontos para você revisar e colar no terminal
                SSH. Nenhuma alteração é enviada diretamente ao equipamento pelo software.
              </div>
            </div>

            {localPrefError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                {localPrefError}
              </div>
            )}
            {copiedKey === 'localpref' && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span>
                  <strong>Comandos copiados com sucesso!</strong> Cole no terminal SSH do roteador
                  para aplicar manualmente com zero flap.
                </span>
              </div>
            )}

            <div className="space-y-4 text-xs font-sans">
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px] font-sans">
                    Peer IP / Próximo Salto:
                  </span>
                  <span className="text-emerald-400 font-bold">{localPrefSection.peer_ip}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-sans">
                    Policy de Importação:
                  </span>
                  <span className="text-cyan-300 font-bold">
                    {localPrefSection.import_policy
                      ? `${localPrefSection.import_policy} (node ${localPrefSection.import_policy_node || 11})`
                      : 'Padrão / Auto'}
                  </span>
                </div>
              </div>

              {/* Presets Grid */}
              <div>
                <label className="block text-slate-400 font-medium mb-1.5">
                  Valores Recomendados (Presets BGP Upload):
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { val: 100, label: '100 (Default BGP)' },
                    { val: 150, label: '150 (Secundário)' },
                    { val: 200, label: '200 (Trânsito Normal)' },
                    { val: 250, label: '250 (Prioritário)' },
                    { val: 700, label: '700 (PTT / IX)' },
                    { val: 900, label: '900 (Primário Absoluto)' },
                  ].map((preset) => {
                    const isSelected = targetLocalPref === preset.val
                    return (
                      <button
                        key={preset.val}
                        type="button"
                        onClick={() => setTargetLocalPref(preset.val)}
                        className={`py-2 px-2.5 rounded-xl border text-center font-mono text-xs transition cursor-pointer ${
                          isSelected
                            ? 'bg-amber-500/20 border-amber-500 text-amber-300 font-bold shadow-md shadow-amber-500/20 ring-1 ring-amber-400'
                            : 'bg-slate-800/60 border-slate-700/80 hover:bg-slate-800 text-slate-300'
                        }`}
                      >
                        <div className="text-sm">{preset.val}</div>
                        <div className="text-[10px] font-sans text-slate-400 truncate mt-0.5">
                          {preset.label.split(' ')[1]}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Custom Value Input */}
              <div>
                <label className="block text-slate-400 font-medium mb-1">
                  Valor Customizado de Local-Preference (0 - 4294967295):
                </label>
                <input
                  type="number"
                  min="1"
                  max="4294967295"
                  value={targetLocalPref}
                  onChange={(e) => setTargetLocalPref(parseInt(e.target.value, 10) || 0)}
                  className="w-full bg-slate-800 border border-slate-700 text-amber-300 font-mono font-bold text-base rounded-xl px-3 py-2.5 focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  required
                />
              </div>

              {/* Command Preview */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px] font-sans font-semibold">
                    Comandos CLI Gerados para Execução Manual:
                  </span>
                  <button
                    type="button"
                    onClick={() => onCopyText(localPrefCliPreview, 'localpref')}
                    className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer"
                  >
                    {copiedKey === 'localpref' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-300 font-bold">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                        <span>Copiar</span>
                      </>
                    )}
                  </button>
                </div>
                <div className="text-amber-300 space-y-0.5 bg-black/60 p-3 rounded-lg border border-slate-800/80 font-mono leading-relaxed select-all whitespace-pre-wrap">
                  {localPrefCliPreview}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsLocalPrefModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => onCopyText(localPrefCliPreview, 'localpref')}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-amber-600/30 transition cursor-pointer flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  <span>Copiar Comandos para o Terminal</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL 4: AJUSTAR AS-PATH PREPEND ===================== */}
      {isPrependModalOpen && targetPrependPrefix && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-[100] animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="h-10 w-10 rounded-xl bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400 shrink-0">
                  <SlidersHorizontal className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <span>Ajustar Prepend de Download</span>
                    <span className="text-xs px-2 py-0.5 rounded-md font-mono bg-indigo-950 text-indigo-300 border border-indigo-800">
                      {targetPrependPrefix.prefix}
                    </span>
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5 flex flex-wrap items-center gap-1.5">
                    <span>Operadora / IX:</span>
                    <strong className="text-indigo-300 font-semibold">
                      {targetPrependGroup?.group_name || targetPrependPrefix.peer_name}
                    </strong>
                    {targetPrependGroup && (
                      <span className="font-mono text-[10px] bg-slate-800 text-slate-300 px-1.5 py-0.2 rounded border border-slate-700">
                        AS{targetPrependGroup.remote_as}
                      </span>
                    )}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsPrependModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {prependModalError && (
              <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs">
                {prependModalError}
              </div>
            )}
            {prependSuccessMsg && (
              <div className="p-3 rounded-xl bg-emerald-950/50 border border-emerald-800 text-emerald-300 text-xs flex items-center gap-2">
                <Check className="h-4 w-4 text-emerald-400" />
                {prependSuccessMsg}
              </div>
            )}

            {targetPrependGroup ? (
              <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 text-xs flex items-start gap-2.5">
                <Zap className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="font-semibold text-indigo-300">
                      Unificação Ativa ({targetPrependGroup.peer_count} Sessões BGP)
                    </strong>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/60 border border-indigo-700 text-indigo-200">
                      Base TE: 1:{targetPrependGroup.community_base}X
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                    A política de export de todas as sessões do{' '}
                    <strong>{targetPrependGroup.group_name}</strong> propaga as comunidades
                    simultaneamente.
                  </p>
                </div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
                <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold block text-amber-300">
                    Modo Manual Ativo (Zero Alteração no Roteador)
                  </strong>
                  <p className="text-[11px] text-amber-200/80 mt-0.5 leading-relaxed">
                    O sistema gera e valida o bloco de comandos CLI exato com a comunidade correta.
                  </p>
                </div>
              </div>
            )}

            {targetPrependGroup?.device_name && (
              <div className="p-3 rounded-xl bg-[#25334D]/60 border border-[#3B5B8C]/40 text-slate-200 text-xs flex items-start gap-2.5">
                <Crown className="h-4 w-4 text-[#E5A93C] shrink-0 mt-0.5" />
                <div className="text-[11px] leading-relaxed">
                  <strong>Topologia Centralizada:</strong> Comandos gerados prioritariamente para o{' '}
                  <strong className="text-white">BGP Master</strong>. Políticas aplicadas no Master
                  são propagadas automaticamente via iBGP para a sessão em{' '}
                  <strong className="text-[#93B4E6]">{targetPrependGroup.device_name}</strong>.
                </div>
              </div>
            )}

            <div className="space-y-4 text-xs font-sans">
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Selecione a Estratégia de Entrada para este Bloco:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsBlockChoice(false)
                      setPrependCountChoice(0)
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                      !isBlockChoice && prependCountChoice === 0
                        ? 'bg-emerald-950/60 border-emerald-500 text-emerald-200 ring-2 ring-emerald-500/20 shadow-md'
                        : 'bg-slate-800/70 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">0x (Primário)</span>
                      {!isBlockChoice && prependCountChoice === 0 && (
                        <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 font-sans">
                      Sem prepend. Caminho preferencial direto.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsBlockChoice(false)
                      setPrependCountChoice(1)
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                      !isBlockChoice && prependCountChoice === 1
                        ? 'bg-amber-950/60 border-amber-500 text-amber-200 ring-2 ring-amber-500/20 shadow-md'
                        : 'bg-slate-800/70 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">1x Prepend (1P)</span>
                      {!isBlockChoice && prependCountChoice === 1 && (
                        <Check className="h-4 w-4 text-amber-400" />
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 font-sans">
                      Adiciona +1 salto AS. Despriorização leve.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsBlockChoice(false)
                      setPrependCountChoice(2)
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                      !isBlockChoice && prependCountChoice === 2
                        ? 'bg-amber-950/60 border-amber-500 text-amber-200 ring-2 ring-amber-500/20 shadow-md'
                        : 'bg-slate-800/70 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">2x Prepend (2P)</span>
                      {!isBlockChoice && prependCountChoice === 2 && (
                        <Check className="h-4 w-4 text-amber-400" />
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 font-sans">
                      Adiciona +2 saltos AS. Despriorização média.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsBlockChoice(false)
                      setPrependCountChoice(3)
                    }}
                    className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                      !isBlockChoice && prependCountChoice === 3
                        ? 'bg-amber-950/60 border-amber-500 text-amber-200 ring-2 ring-amber-500/20 shadow-md'
                        : 'bg-slate-800/70 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm">3x Prepend (3P)</span>
                      {!isBlockChoice && prependCountChoice === 3 && (
                        <Check className="h-4 w-4 text-amber-400" />
                      )}
                    </div>
                    <span className="text-[11px] text-slate-400 font-sans">
                      Adiciona +3 saltos AS. Rota de backup.
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsBlockChoice(true)
                    }}
                    className={`sm:col-span-2 p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                      isBlockChoice
                        ? 'bg-rose-950/60 border-rose-500 text-rose-200 ring-2 ring-rose-500/20 shadow-md'
                        : 'bg-slate-800/70 border-slate-700/80 text-slate-300 hover:bg-slate-800'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sm flex items-center gap-1.5 text-rose-400">
                        <AlertTriangle className="h-4 w-4" />
                        Bloquear Anúncio (Deny / Interromper Download)
                      </span>
                      {isBlockChoice && <Check className="h-4 w-4 text-rose-400" />}
                    </div>
                    <span className="text-[11px] text-slate-400 font-sans">
                      Aplica comunidade de descarte. O bloco não é anunciado para esta operadora.
                    </span>
                  </button>
                </div>
              </div>

              {/* Zero-Flap Guarantee Callout */}
              <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 space-y-1">
                <div className="flex items-center gap-2 text-indigo-300 font-semibold text-[11px]">
                  <Zap className="h-3.5 w-3.5" />
                  <span>Aplicação Segura via BGP Route-Policy (RFC 2918)</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  As comunidades de anúncio são atualizadas no nó do BGP Master sem derrubar a
                  sessão BGP (Zero-Flap).
                </p>
              </div>

              {/* Router Selector Tabs & Live CLI Preview */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-slate-300 font-semibold text-xs">
                    Gerar Comandos CLI para:
                  </label>
                  <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800 text-[11px] overflow-x-auto">
                    {devices
                      .filter((d) => d.is_bgp !== false)
                      .map((d) => {
                        const isMaster = isBGPMasterDevice(d, devices)
                        return (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => setCliTargetRouter(d.id)}
                            className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                              cliTargetRouter === d.id
                                ? 'bg-[#3B5B8C] text-white shadow-sm'
                                : 'text-slate-400 hover:text-white'
                            }`}
                          >
                            {isMaster && <Crown className="h-3 w-3 text-[#E5A93C]" />}
                            <span>{d.name}</span>
                            {isMaster && (
                              <span className="text-[10px] text-[#E5A93C] font-semibold">
                                (Master)
                              </span>
                            )}
                          </button>
                        )
                      })}

                    <button
                      type="button"
                      onClick={() => setCliTargetRouter('all')}
                      className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer whitespace-nowrap ${
                        cliTargetRouter === 'all'
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white'
                      }`}
                    >
                      Todos os BGPs
                    </button>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-[11px] text-slate-500 font-mono">
                    {cliTargetRouter === 'all'
                      ? 'Exibindo comandos para todos os roteadores BGP combinados'
                      : `Terminal do roteador: ${devices.find((d) => d.id === cliTargetRouter)?.name || 'Selecionado'}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => onCopyText(prependCliPreview, 'prepend')}
                    className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 transition cursor-pointer"
                  >
                    {copiedKey === 'prepend' ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span className="text-emerald-400 font-semibold">Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-slate-400" />
                        <span>Copiar Comandos</span>
                      </>
                    )}
                  </button>
                </div>

                <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl font-mono text-[11px] text-emerald-400 leading-relaxed whitespace-pre-wrap select-text max-h-52 overflow-y-auto shadow-inner">
                  {prependCliPreview}
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsPrependModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => onCopyText(prependCliPreview, 'prepend')}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition cursor-pointer flex items-center gap-2"
                >
                  <Copy className="h-4 w-4" />
                  <span>Copiar Comandos para o Terminal</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL 5: SALVAR ESTADO ATUAL COMO PERFIL ===================== */}
      {isCaptureModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                  <Camera className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Salvar Configuração Atual como Perfil</h3>
                  <p className="text-xs text-slate-400">Gera um snapshot reutilizável com 1 clique</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsCaptureModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCapture} className="space-y-4">
              {captureError && (
                <div className="p-3 rounded-xl bg-rose-950/50 border border-rose-800 text-rose-300 text-xs">
                  {captureError}
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Nome do Perfil / Cenário *
                </label>
                <input
                  type="text"
                  required
                  value={captureName}
                  onChange={(e) => setCaptureName(e.target.value)}
                  placeholder="Escolha um nome para o perfil"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Classificação / Tipo do Cenário
                </label>
                <select
                  value={captureTag}
                  onChange={(e) => setCaptureTag(e.target.value as ProfileTag)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-xs text-white focus:outline-none focus:border-cyan-500 transition cursor-pointer"
                >
                  <option value="normal">Operação Padrão / Nominal</option>
                  <option value="contingency">Contingência / Rompimento de Link</option>
                  <option value="maintenance">Manutenção Programada de Operadora</option>
                  <option value="peak">Horário de Pico / Balanceamento ECMP</option>
                  <option value="custom">Personalizado</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
                  Descrição Operacional
                </label>
                <textarea
                  rows={2}
                  value={captureDesc}
                  onChange={(e) => setCaptureDesc(e.target.value)}
                  placeholder="Ex: Utilizado para drenar o link da operadora secundária e priorizar PTT São Paulo"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-cyan-500 transition"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCaptureModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={capturing}
                  className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-cyan-600/30 transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {capturing ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Salvando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Salvar Snapshot</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ===================== MODAL 6: REVISAR DIFERENÇAS E APLICAR CENÁRIO ===================== */}
      {isDiffModalOpen && diffProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col p-6 shadow-2xl space-y-4">
            <div className="flex items-start justify-between border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    <Zap className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-bold text-white">{diffProfile.name}</h3>
                      {getProfileTagBadge(diffProfile.tag)}
                      {diffProfile.is_active && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                          ● Atualmente Ativo
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">{diffProfile.description}</p>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsDiffModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Aviso de Modo Seguro */}
            <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-800/60 text-[11px] text-amber-200 flex items-center gap-2.5">
              <ShieldCheck className="h-4 w-4 text-amber-400 shrink-0" />
              <span>
                <strong>Modo Seguro Operacional (Zero Commits Automáticos):</strong> Nenhum comando é
                enviado aos seus roteadores físicos sem a sua revisão e cópia para o terminal SSH.
              </span>
            </div>

            {/* Tabs do Modal */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDiffModalTab('diff')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    diffModalTab === 'diff'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white bg-slate-950 border border-slate-800'
                  }`}
                >
                  <Layers className="h-3.5 w-3.5" />
                  <span>Comparativo Visual ({diffData?.diff.total_changes ?? 0} Mudanças)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDiffModalTab('scripts')}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    diffModalTab === 'scripts'
                      ? 'bg-amber-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white bg-slate-950 border border-slate-800'
                  }`}
                >
                  <Copy className="h-3.5 w-3.5" />
                  <span>Scripts CLI para os Roteadores</span>
                </button>
              </div>

              {diffData && (
                <div className="flex items-center gap-3 text-[11px] text-slate-400">
                  <span>
                    Prepends:{' '}
                    <strong className="text-white">
                      {diffData.diff.prepends_diff.filter((p) => p.changed).length}
                    </strong>
                  </span>
                  <span>
                    LocalPref:{' '}
                    <strong className="text-white">
                      {diffData.diff.local_prefs_diff.filter((l) => l.changed).length}
                    </strong>
                  </span>
                  <span>
                    Rotas:{' '}
                    <strong className="text-white">
                      {diffData.diff.routes_diff.filter((r) => r.action !== 'KEEP').length}
                    </strong>
                  </span>
                </div>
              )}
            </div>

            {/* Conteúdo com Scroll */}
            <div className="flex-1 overflow-y-auto max-h-[50vh] pr-1 space-y-4">
              {diffLoading ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-3">
                  <RefreshCw className="h-6 w-6 animate-spin text-amber-500" />
                  <span className="text-xs">Calculando diferenças entre o estado atual e o perfil...</span>
                </div>
              ) : diffError ? (
                <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
                  {diffError}
                </div>
              ) : diffModalTab === 'diff' ? (
                <div className="space-y-4">
                  {/* Download Prepends Diff Table */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                      <Download className="h-3.5 w-3.5 text-indigo-400" />
                      <span>Download (AS-Path Prepending & Anúncios BGP)</span>
                    </h4>
                    {!diffData || diffData.diff.prepends_diff.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">Nenhuma regra de prepend definida.</p>
                    ) : (
                      <div className="border border-slate-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="px-3 py-2 font-medium">Operadora / PTT</th>
                              <th className="px-3 py-2 font-medium">Prefixo</th>
                              <th className="px-3 py-2 font-medium">Estado Atual</th>
                              <th className="px-3 py-2 font-medium">Estado Alvo</th>
                              <th className="px-3 py-2 font-medium">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                            {diffData.diff.prepends_diff.map((p, idx) => (
                              <tr key={idx} className={p.changed ? 'bg-amber-950/10' : ''}>
                                <td className="px-3 py-2 font-semibold text-white">
                                  {p.group_name}{' '}
                                  <span className="text-slate-500 font-mono text-[10px]">
                                    AS{p.remote_as}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-mono text-[11px] text-slate-300">
                                  {p.prefix || 'Todos os prefixos'}
                                </td>
                                <td className="px-3 py-2">
                                  {p.current_block ? (
                                    <span className="text-rose-400 font-bold">Bloqueado (0:0)</span>
                                  ) : (
                                    <span className="text-slate-300 font-mono">
                                      {p.current_count} Prepends
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {p.target_block ? (
                                    <span className="text-rose-400 font-bold">Bloquear (0:0)</span>
                                  ) : (
                                    <span
                                      className={`font-mono font-bold ${
                                        p.changed ? 'text-amber-400' : 'text-slate-400'
                                      }`}
                                    >
                                      {p.target_count} Prepends
                                    </span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {p.changed ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950 border border-amber-800 text-amber-300">
                                      MODIFICAR
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 text-[11px]">Inalterado</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Upload Local-Preference Diff Table */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                      <Upload className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Upload (BGP Local-Preference & Prioridades)</span>
                    </h4>
                    {!diffData || diffData.diff.local_prefs_diff.length === 0 ? (
                      <p className="text-xs text-slate-500 italic">Nenhuma regra de local-pref definida.</p>
                    ) : (
                      <div className="border border-slate-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="px-3 py-2 font-medium">Peer BGP</th>
                              <th className="px-3 py-2 font-medium">IP do Peer</th>
                              <th className="px-3 py-2 font-medium">Local-Pref Atual</th>
                              <th className="px-3 py-2 font-medium">Local-Pref Alvo</th>
                              <th className="px-3 py-2 font-medium">Ação</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                            {diffData.diff.local_prefs_diff.map((lp, idx) => (
                              <tr key={idx} className={lp.changed ? 'bg-amber-950/10' : ''}>
                                <td className="px-3 py-2 font-semibold text-white">
                                  {lp.peer_name}{' '}
                                  <span className="text-slate-500 font-mono text-[10px]">
                                    AS{lp.remote_as}
                                  </span>
                                </td>
                                <td className="px-3 py-2 font-mono text-[11px] text-slate-400">
                                  {lp.peer_ip}
                                </td>
                                <td className="px-3 py-2 font-mono text-slate-300">
                                  {lp.current_pref || '100 (Default)'}
                                </td>
                                <td className="px-3 py-2">
                                  <span
                                    className={`font-mono font-bold ${
                                      lp.changed ? 'text-cyan-400' : 'text-slate-400'
                                    }`}
                                  >
                                    {lp.target_pref}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  {lp.changed ? (
                                    <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950 border border-cyan-800 text-cyan-300">
                                      AJUSTAR
                                    </span>
                                  ) : (
                                    <span className="text-slate-500 text-[11px]">Inalterado</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>

                  {/* Static Routes Diff Table */}
                  {diffData && diffData.diff.routes_diff.length > 0 && (
                    <div>
                      <h4 className="text-xs font-bold text-slate-300 mb-2 flex items-center gap-1.5">
                        <RouteIcon className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Rotas Estáticas de Upload</span>
                      </h4>
                      <div className="border border-slate-800 rounded-xl overflow-hidden">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-950 text-slate-400 border-b border-slate-800">
                            <tr>
                              <th className="px-3 py-2 font-medium">Destino</th>
                              <th className="px-3 py-2 font-medium">Gateway / Próximo Salto</th>
                              <th className="px-3 py-2 font-medium">Preferência</th>
                              <th className="px-3 py-2 font-medium">Ação Proposta</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60 bg-slate-900/40">
                            {diffData.diff.routes_diff.map((r, idx) => (
                              <tr key={idx}>
                                <td className="px-3 py-2 font-mono text-[11px] text-white">
                                  {r.destination}
                                </td>
                                <td className="px-3 py-2 font-mono text-[11px] text-slate-300">
                                  {r.next_hop}
                                </td>
                                <td className="px-3 py-2 font-mono text-slate-400">{r.preference}</td>
                                <td className="px-3 py-2">
                                  <span
                                    className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      r.action === 'ADD'
                                        ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                                        : r.action === 'DELETE'
                                          ? 'bg-rose-950 border border-rose-800 text-rose-300'
                                          : 'bg-slate-800 text-slate-400'
                                    }`}
                                  >
                                    {r.action === 'ADD'
                                      ? 'ADICIONAR'
                                      : r.action === 'DELETE'
                                        ? 'REMOVER'
                                        : 'MANTER'}
                                  </span>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                /* TAB 2: SCRIPTS CLI */
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                      <button
                        type="button"
                        onClick={() => setSelectedDiffDevice('all')}
                        className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                          selectedDiffDevice === 'all'
                            ? 'bg-amber-600 text-white'
                            : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                        }`}
                      >
                        Todos os Roteadores
                      </button>
                      {devices
                        .filter(
                          (d) =>
                            diffData?.scripts_by_device && diffData.scripts_by_device[d.id]
                        )
                        .map((d) => (
                          <button
                            key={d.id}
                            type="button"
                            onClick={() => setSelectedDiffDevice(d.id)}
                            className={`px-3 py-1 rounded-lg text-xs font-medium transition cursor-pointer whitespace-nowrap ${
                              selectedDiffDevice === d.id
                                ? 'bg-amber-600 text-white'
                                : 'bg-slate-950 text-slate-400 hover:text-white border border-slate-800'
                            }`}
                          >
                            {d.name} ({d.vendor?.toUpperCase()})
                          </button>
                        ))}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        let text = ''
                        if (selectedDiffDevice === 'all') {
                          text = Object.values(diffData?.scripts_by_device || {}).join('\n\n')
                        } else {
                          text = diffData?.scripts_by_device[selectedDiffDevice] || ''
                        }
                        onCopyText(text, 'profile_script')
                      }}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 text-xs transition cursor-pointer"
                    >
                      {copiedKey === 'profile_script' ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-400" />
                          <span className="text-emerald-400 font-bold">Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5 text-slate-400" />
                          <span>Copiar Script</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl font-mono text-[11px] text-emerald-400 leading-relaxed whitespace-pre-wrap select-all max-h-72 overflow-y-auto shadow-inner">
                    {selectedDiffDevice === 'all'
                      ? Object.values(diffData?.scripts_by_device || {}).join('\n\n') ||
                        '# Nenhum comando gerado para este cenário'
                      : diffData?.scripts_by_device[selectedDiffDevice] ||
                        '# Nenhum comando necessário para este equipamento'}
                  </div>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="border-t border-slate-800 pt-4 flex items-center justify-between">
              <div>
                {applyResult && (
                  <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1.5">
                    <CheckCircle className="h-4 w-4" />
                    {applyResult.message}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setIsDiffModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition cursor-pointer"
                >
                  Fechar
                </button>
                <button
                  type="button"
                  onClick={() => handleApplyProfile(diffProfile.id)}
                  disabled={applyingProfile || !canOperate}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white text-xs font-bold rounded-xl shadow-lg shadow-amber-600/30 transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {applyingProfile ? (
                    <>
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                      <span>Ativando no Sistema...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-3.5 w-3.5" />
                      <span>Ativar Perfil no Sistema</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL 7: GERENCIAR PERFIS ===================== */}
      {isManageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
                  <Sliders className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Perfis de Tráfego & Cenários de Contingência
                  </h3>
                  <p className="text-xs text-slate-400">
                    Gerencie cenários pré-configurados e criados por você
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsManageModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
              {profiles.map((p) => (
                <div
                  key={p.id}
                  className={`p-4 rounded-xl border transition ${
                    p.is_active
                      ? 'bg-slate-950 border-emerald-500/50 shadow-sm'
                      : 'bg-slate-950/60 border-slate-800 hover:border-slate-700'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-sm text-white">{p.name}</span>
                        {getProfileTagBadge(p.tag)}
                        {p.is_active && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                            ● Ativo
                          </span>
                        )}
                        {p.is_default && (
                          <span className="flex items-center gap-1 text-[10px] text-slate-500 border border-slate-800 px-1.5 py-0.5 rounded">
                            <Lock className="h-3 w-3" /> Padrão
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-400 mt-1">{p.description}</p>
                      <div className="flex items-center gap-3 mt-2 text-[11px] text-slate-500">
                        <span>{p.prepends?.length || 0} regras de download</span>
                        <span>•</span>
                        <span>{p.local_prefs?.length || 0} regras de upload</span>
                        <span>•</span>
                        <span>{p.routes?.length || 0} rotas estáticas</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setIsManageModalOpen(false)
                          handleOpenDiff(p)
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs font-bold bg-amber-600/90 hover:bg-amber-600 text-white transition cursor-pointer flex items-center gap-1"
                      >
                        <Zap className="h-3 w-3" />
                        <span>Revisar / Subir</span>
                      </button>

                      {!p.is_default && (
                        <button
                          type="button"
                          onClick={() => handleDeleteProfile(p.id, p.name)}
                          disabled={deletingProfileId === p.id || !canOperate}
                          className="p-1.5 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-rose-950/30 transition cursor-pointer disabled:opacity-50"
                          title="Excluir perfil"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="border-t border-slate-800 pt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setIsManageModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs text-slate-400 hover:text-white transition cursor-pointer"
              >
                Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}
