import React from 'react'
import { Zap, Camera, Sliders, FileText } from 'lucide-react'
import type { TrafficProfile } from '../../services/api'

export interface TrafficProfilesBarProps {
  profiles: TrafficProfile[]
  selectedProfileId: string
  onSelectProfileId: (id: string) => void
  activeProfile: TrafficProfile | null
  profilesLoading: boolean
  canOperate: boolean
  onOpenDiff: (profile: TrafficProfile) => void
  onOpenCapture: () => void
  onOpenManage: () => void
}

export const TrafficProfilesBar: React.FC<TrafficProfilesBarProps> = ({
  profiles,
  selectedProfileId,
  onSelectProfileId,
  activeProfile,
  profilesLoading,
  canOperate,
  onOpenDiff,
  onOpenCapture,
  onOpenManage,
}) => {
  const currentProfile = profiles.find((p) => p.id === selectedProfileId)

  return (
    <div className="relative overflow-hidden bg-gradient-to-r from-slate-900/95 via-slate-900/90 to-slate-950/95 border border-slate-800/80 rounded-2xl p-3.5 sm:p-4 shadow-2xl backdrop-blur-xl">
      {/* Top Hairline Accent */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/40 to-transparent pointer-events-none" />

      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3.5">
        {/* Lado Esquerdo: Perfil Ativo e Seletor de Cenário */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Indicador de Cenário Ativo */}
          <div className="flex items-center gap-2.5 px-3 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800/90 shadow-inner">
            <span className="relative flex h-2 w-2">
              {activeProfile ? (
                <>
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </>
              ) : (
                <span className="relative inline-flex rounded-full h-2 w-2 bg-slate-500"></span>
              )}
            </span>
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              Cenário Ativo:
            </span>
            <span className={`text-xs font-semibold font-mono ${activeProfile ? 'text-emerald-400' : 'text-slate-400 font-sans'}`}>
              {activeProfile ? activeProfile.name : 'Nenhum ativado'}
            </span>
          </div>

          {/* Seletor de Cenários / Presets */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400 font-medium">Trocar Cenário:</span>
            <select
              value={selectedProfileId}
              onChange={(e) => onSelectProfileId(e.target.value)}
              className="bg-slate-950/90 border border-slate-700/80 hover:border-cyan-500/50 rounded-xl px-3 py-1.5 text-xs text-white font-medium focus:outline-none focus:ring-1 focus:ring-cyan-500 focus:border-cyan-500 transition cursor-pointer shadow-inner min-w-[220px] max-w-xs"
            >
              <option value="" disabled>
                Escolha um nome para o perfil
              </option>
              {profiles.map((p) => (
                <option key={p.id} value={p.id} className="bg-slate-900 text-slate-100">
                  {p.is_active ? '● [ATIVO] ' : ''}
                  {p.name}
                </option>
              ))}
            </select>
          </div>

          {/* Descrição / Placeholder do Perfil */}
          <div className="hidden lg:flex items-center gap-2 text-xs bg-slate-950/60 px-3 py-1.5 rounded-xl border border-slate-800/80 min-h-[32px] max-w-md shadow-inner">
            <FileText className="h-3.5 w-3.5 text-cyan-400/80 shrink-0" />
            <span
              className={`truncate text-xs ${
                currentProfile?.description ? 'text-slate-300' : 'text-slate-500 italic'
              }`}
              title={currentProfile?.description || 'Escolha um nome para o perfil'}
            >
              {currentProfile?.description || 'Escolha um nome para o perfil'}
            </span>
          </div>
        </div>

        {/* Lado Direito: Ações Corporativas */}
        <div className="flex flex-wrap items-center gap-2 self-start xl:self-center">
          {/* Botão Subir / Aplicar Cenário */}
          <button
            type="button"
            onClick={() => {
              if (currentProfile) onOpenDiff(currentProfile)
            }}
            disabled={!selectedProfileId || profilesLoading}
            className="flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-cyan-600 via-blue-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white shadow-lg shadow-cyan-600/25 border border-cyan-400/30 transition-all cursor-pointer disabled:opacity-40 hover:-translate-y-0.5 active:translate-y-0"
            title="Comparar com estado atual da rede e gerar scripts para os roteadores"
          >
            <Zap className="h-3.5 w-3.5 fill-current text-white" />
            <span>Subir / Aplicar Cenário</span>
          </button>

          {/* Botão Salvar Estado Atual como Perfil */}
          <button
            type="button"
            onClick={onOpenCapture}
            disabled={!canOperate}
            className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold bg-slate-800/90 hover:bg-slate-700/90 text-slate-200 hover:text-white border border-slate-700/80 hover:border-slate-600 transition-all cursor-pointer disabled:opacity-40 hover:-translate-y-0.5 active:translate-y-0 shadow-sm"
            title="Capturar todos os prepends, local-preferences e rotas estáticas atuais como um novo perfil"
          >
            <Camera className="h-3.5 w-3.5 text-cyan-400" />
            <span>Salvar Estado Atual</span>
          </button>

          {/* Botão Gerenciar Perfis */}
          <button
            type="button"
            onClick={onOpenManage}
            className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-slate-800/60 hover:bg-slate-700/70 text-slate-300 hover:text-white border border-slate-700/70 hover:border-slate-600 transition cursor-pointer"
            title="Listar todos os perfis e cenários cadastrados"
          >
            <Sliders className="h-3.5 w-3.5 text-slate-400" />
            <span>Gerenciar Perfis</span>
          </button>
        </div>
      </div>
    </div>
  )
}
