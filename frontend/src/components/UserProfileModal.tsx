import React, { useState } from 'react'
import {
  X,
  User,
  Key,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  Layout,
  Sliders,
  PanelLeft,
  Layers,
} from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { updateUser } from '../services/api'

export type NavStyleType = 'dock' | 'sidebar' | 'both'

interface UserProfileModalProps {
  isOpen: boolean
  onClose: () => void
  navStyle: NavStyleType
  onNavStyleChange: (style: NavStyleType) => void
  density: 'comfortable' | 'compact'
  onToggleDensity: () => void
}

export const UserProfileModal: React.FC<UserProfileModalProps> = ({
  isOpen,
  onClose,
  navStyle,
  onNavStyleChange,
  density,
  onToggleDensity,
}) => {
  const { user, isSuperAdmin, currentTenant } = useAuth()

  const [activeTab, setActiveTab] = useState<'profile' | 'appearance'>('appearance')
  const [name, setName] = useState(user?.name || '')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  if (!isOpen) return null

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault()
    setFeedback(null)

    if (newPassword && newPassword.length < 6) {
      setFeedback({ type: 'error', text: 'A nova senha deve ter no mínimo 6 caracteres.' })
      return
    }

    if (newPassword && newPassword !== confirmPassword) {
      setFeedback({ type: 'error', text: 'A confirmação de senha não confere.' })
      return
    }

    if (!user) {
      setFeedback({ type: 'error', text: 'Usuário não autenticado.' })
      return
    }

    setSaving(true)
    try {
      await updateUser(user.id, {
        name: name.trim() || user.name,
        ...(newPassword ? { password: newPassword } : {}),
      })

      setFeedback({ type: 'success', text: 'Perfil e credenciais atualizados com sucesso!' })
      setNewPassword('')
      setConfirmPassword('')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Falha ao salvar alterações de perfil'
      setFeedback({ type: 'error', text: msg })
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/75 backdrop-blur-xs transition-opacity"
        onClick={onClose}
      />

      {/* Modal Container */}
      <div className="relative w-full max-w-xl bg-[#161922] border border-[#242836] rounded-2xl shadow-2xl overflow-hidden z-10 animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#242836] flex items-center justify-between bg-[#13151D]/60">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-xl bg-[#25334D] border border-[#3B5B8C]/40 flex items-center justify-center text-[#93B4E6]">
              <User className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-slate-100">Configurações & Perfil do Usuário</h2>
              <p className="text-xs text-slate-400">Preferências visuais, estilo de menu e credenciais</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-[#1C202C] transition cursor-pointer focus:outline-none focus:ring-0"
            title="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Sub-Tabs de Navegação Interna */}
        <div className="flex items-center px-6 pt-3 border-b border-[#242836] gap-4 bg-[#161922]">
          <button
            type="button"
            onClick={() => setActiveTab('appearance')}
            className={`flex items-center gap-2 pb-3 text-xs font-semibold border-b-2 transition cursor-pointer focus:outline-none focus:ring-0 select-none ${
              activeTab === 'appearance'
                ? 'border-[#4A72B2] text-[#93B4E6]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layout className="h-4 w-4" />
            <span>Navegação & Interface</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('profile')}
            className={`flex items-center gap-2 pb-3 text-xs font-semibold border-b-2 transition cursor-pointer focus:outline-none focus:ring-0 select-none ${
              activeTab === 'profile'
                ? 'border-[#4A72B2] text-[#93B4E6]'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Key className="h-4 w-4" />
            <span>Dados Pessoais & Senha</span>
          </button>
        </div>

        {/* Feedback Alert */}
        {feedback && (
          <div
            className={`mx-6 mt-4 p-3 rounded-xl border flex items-center justify-between text-xs animate-in fade-in ${
              feedback.type === 'success'
                ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
                : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="h-4 w-4 shrink-0" />
              ) : (
                <AlertCircle className="h-4 w-4 shrink-0" />
              )}
              <span>{feedback.text}</span>
            </div>
            <button onClick={() => setFeedback(null)} className="text-slate-400 hover:text-white">
              &times;
            </button>
          </div>
        )}

        {/* Tab 1: Navegação & Interface */}
        {activeTab === 'appearance' && (
          <div className="p-6 space-y-6">
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                Qual estilo de menu você prefere?
              </label>
              <p className="text-xs text-slate-400 mb-3.5">
                Escolha a forma como você deseja navegar entre os módulos do NetPulse:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Opção 1: Dock Flutuante */}
                <button
                  type="button"
                  onClick={() => onNavStyleChange('dock')}
                  className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer focus:outline-none focus:ring-0 select-none ${
                    navStyle === 'dock'
                      ? 'bg-[#25334D] border-[#3B5B8C] text-white ring-1 ring-[#4A72B2]/60 shadow-lg'
                      : 'bg-[#1C202C] border-[#242836] text-slate-300 hover:bg-[#252C3D] hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <span className="p-2 rounded-lg bg-[#161922] text-[#93B4E6]">
                      <Sliders className="h-4 w-4" />
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="text-[10px] font-semibold text-[#93B4E6]">Padrão</span>
                      {navStyle === 'dock' && (
                        <span className="w-2 h-2 rounded-full bg-[#4A72B2]" />
                      )}
                    </span>
                  </div>
                  <span className="text-xs font-bold block">Menu Dock (Apple)</span>
                  <span className="text-[11px] text-slate-400 mt-1 leading-snug">
                    Dock flutuante na base da tela com ampliação rápida. Tela 100% limpa.
                  </span>
                </button>

                {/* Opção 2: Sidebar Tradicional */}
                <button
                  type="button"
                  onClick={() => onNavStyleChange('sidebar')}
                  className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer focus:outline-none focus:ring-0 select-none ${
                    navStyle === 'sidebar'
                      ? 'bg-[#25334D] border-[#3B5B8C] text-white ring-1 ring-[#4A72B2]/60 shadow-lg'
                      : 'bg-[#1C202C] border-[#242836] text-slate-300 hover:bg-[#252C3D] hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <span className="p-2 rounded-lg bg-[#161922] text-[#93B4E6]">
                      <PanelLeft className="h-4 w-4" />
                    </span>
                    {navStyle === 'sidebar' && (
                      <span className="w-2 h-2 rounded-full bg-[#4A72B2]" />
                    )}
                  </div>
                  <span className="text-xs font-bold block">Barra Lateral</span>
                  <span className="text-[11px] text-slate-400 mt-1 leading-snug">
                    Sidebar clássica vertical à esquerda com agrupamento completo.
                  </span>
                </button>

                {/* Opção 3: Ambos */}
                <button
                  type="button"
                  onClick={() => onNavStyleChange('both')}
                  className={`flex flex-col items-start p-3.5 rounded-xl border text-left transition-all cursor-pointer focus:outline-none focus:ring-0 select-none ${
                    navStyle === 'both'
                      ? 'bg-[#25334D] border-[#3B5B8C] text-white ring-1 ring-[#4A72B2]/60 shadow-lg'
                      : 'bg-[#1C202C] border-[#242836] text-slate-300 hover:bg-[#252C3D] hover:border-slate-700'
                  }`}
                >
                  <div className="flex items-center justify-between w-full mb-2">
                    <span className="p-2 rounded-lg bg-[#161922] text-[#93B4E6]">
                      <Layers className="h-4 w-4" />
                    </span>
                    {navStyle === 'both' && (
                      <span className="w-2 h-2 rounded-full bg-[#4A72B2]" />
                    )}
                  </div>
                  <span className="text-xs font-bold block">Ambos (Híbrido)</span>
                  <span className="text-[11px] text-slate-400 mt-1 leading-snug">
                    Barra lateral para navegação profunda e Dock para troca ágil de telas.
                  </span>
                </button>
              </div>
            </div>

            {/* Densidade */}
            <div className="pt-4 border-t border-[#242836] flex items-center justify-between">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">Densidade das Tabelas & Cards</span>
                <span className="text-[11px] text-slate-400">
                  {density === 'comfortable' ? 'Modo Confortável (mais espaçado)' : 'Modo Compacto (mais dados na tela)'}
                </span>
              </div>
              <button
                type="button"
                onClick={onToggleDensity}
                className="px-3 py-1.5 rounded-xl bg-[#1C202C] hover:bg-[#252C3D] border border-[#242836] text-xs text-slate-200 transition cursor-pointer focus:outline-none focus:ring-0"
              >
                Alternar para {density === 'comfortable' ? 'Compacto' : 'Confortável'}
              </button>
            </div>
          </div>
        )}

        {/* Tab 2: Dados Pessoais & Senha */}
        {activeTab === 'profile' && (
          <form onSubmit={handleSaveProfile} className="p-6 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nome de Exibição</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#13151D] border border-[#242836] rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-[#3B5B8C]"
                  placeholder="Seu nome completo"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">E-mail de Acesso</label>
                <input
                  type="text"
                  value={user?.email || ''}
                  disabled
                  className="w-full bg-[#13151D]/60 border border-[#242836] rounded-xl px-3.5 py-2 text-xs text-slate-400 cursor-not-allowed opacity-80"
                />
              </div>
            </div>

            <div className="p-3 bg-[#13151D] border border-[#242836] rounded-xl flex items-center justify-between text-xs text-slate-400">
              <span>Nível de Acesso: <strong className="text-slate-200 font-semibold">{isSuperAdmin ? 'SuperAdmin Global' : user?.role}</strong></span>
              <span>Empresa: <strong className="text-slate-200 font-semibold">{currentTenant?.name || user?.tenant_id || 'Principal'}</strong></span>
            </div>

            <div className="pt-3 border-t border-[#242836]">
              <span className="text-xs font-semibold text-slate-200 block mb-3">Redefinir Senha de Acesso</span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="relative">
                  <label className="block text-xs font-medium text-slate-300 mb-1">Nova Senha</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Mínimo 6 caracteres"
                    className="w-full bg-[#13151D] border border-[#242836] rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-[#3B5B8C]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-7 text-slate-400 hover:text-slate-200 cursor-pointer focus:outline-none"
                  >
                    {showPassword ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                  </button>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Confirmar Nova Senha</label>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repita a nova senha"
                    className="w-full bg-[#13151D] border border-[#242836] rounded-xl px-3.5 py-2 text-xs text-slate-200 focus:outline-hidden focus:border-[#3B5B8C]"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-4 border-t border-[#242836]">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 rounded-xl bg-[#1C202C] hover:bg-[#252C3D] text-slate-300 text-xs transition cursor-pointer focus:outline-none focus:ring-0"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-5 py-2 rounded-xl bg-[#25334D] hover:bg-[#2E3E5E] border border-[#3B5B8C] text-[#93B4E6] font-medium text-xs transition cursor-pointer shadow-md focus:outline-none focus:ring-0"
              >
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        )}

        {/* Footer para a tab de Navegação */}
        {activeTab === 'appearance' && (
          <div className="px-6 py-4 bg-[#13151D]/60 border-t border-[#242836] flex items-center justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2 rounded-xl bg-[#25334D] hover:bg-[#2E3E5E] border border-[#3B5B8C] text-[#93B4E6] font-medium text-xs transition cursor-pointer shadow-md focus:outline-none focus:ring-0"
            >
              Concluído
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
