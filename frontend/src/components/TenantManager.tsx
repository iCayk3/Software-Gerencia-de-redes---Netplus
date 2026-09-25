import React, { useState, useEffect } from 'react'
import {
  Building2,
  Plus,
  Search,
  Server,
  Users,
  Edit2,
  Trash2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Network,
  RefreshCw,
  Mail,
  FileText
} from 'lucide-react'
import {
  fetchTenants,
  createTenant,
  updateTenant,
  deleteTenant,
  type Tenant
} from '../services/api'
import { useAuth } from '../context/AuthContext'

export const TenantManager: React.FC = () => {
  const { isSuperAdmin, activeTenantId, setActiveTenant, refreshTenants: globalRefreshTenants } = useAuth()

  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'suspended'>('all')

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingTenant, setEditingTenant] = useState<Tenant | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    slug: '',
    asn: '',
    document: '',
    contact_email: '',
    contact_phone: '',
    logo_url: '',
    plan: 'enterprise',
    status: 'active' as 'active' | 'suspended',
  })
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadTenants = async () => {
    setLoading(true)
    try {
      const data = await fetchTenants()
      setTenants(data)
      globalRefreshTenants()
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Erro ao carregar empresas' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadTenants()
  }, [])

  const handleOpenCreateModal = () => {
    setEditingTenant(null)
    setFormData({
      name: '',
      slug: '',
      asn: '',
      document: '',
      contact_email: '',
      contact_phone: '',
      logo_url: '',
      plan: 'enterprise',
      status: 'active',
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (t: Tenant) => {
    setEditingTenant(t)
    setFormData({
      name: t.name,
      slug: t.slug,
      asn: t.asn || '',
      document: t.document || '',
      contact_email: t.contact_email || '',
      contact_phone: t.contact_phone || '',
      logo_url: t.logo_url || '',
      plan: t.plan || 'enterprise',
      status: t.status as 'active' | 'suspended',
    })
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleSaveTenant = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormSubmitting(true)
    setFormError(null)

    try {
      if (editingTenant) {
        await updateTenant(editingTenant.id, formData)
        setFeedbackMsg({ type: 'success', text: `Empresa "${formData.name}" atualizada com sucesso!` })
      } else {
        await createTenant(formData)
        setFeedbackMsg({ type: 'success', text: `Empresa "${formData.name}" cadastrada com sucesso!` })
      }
      setIsModalOpen(false)
      loadTenants()
    } catch (err: any) {
      setFormError(err.message || 'Erro ao processar requisição')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDeleteTenant = async (t: Tenant) => {
    const tenantId = t.id
    if (tenantId === 'default-tenant') {
      alert('A empresa central do sistema não pode ser excluída.')
      return
    }

    if (!confirm(`Deseja realmente remover a empresa cliente "${t.name}"? Todos os vínculos de roteadores e usuários associados serão afetados.`)) {
      return
    }

    try {
      await deleteTenant(tenantId)
      setFeedbackMsg({ type: 'success', text: `Empresa "${t.name}" excluída com sucesso.` })
      if (activeTenantId === tenantId) {
        setActiveTenant(null)
      }
      loadTenants()
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Erro ao excluir empresa' })
    }
  }

  // Filtragem
  const filteredTenants = tenants.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.slug.toLowerCase().includes(search.toLowerCase()) ||
      (t.asn && t.asn.includes(search)) ||
      (t.contact_email && t.contact_email.toLowerCase().includes(search.toLowerCase()))
    const matchesStatus = statusFilter === 'all' || t.status === statusFilter
    return matchesSearch && matchesStatus
  })

  // Contadores
  const totalTenants = tenants.length
  const totalRouters = tenants.reduce((acc, t) => acc + (t.device_count || 0), 0)
  const totalUsers = tenants.reduce((acc, t) => acc + (t.user_count || 0), 0)

  return (
    <div className="space-y-6">
      {/* Header & Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-cyan-500/10 border border-cyan-500/20 text-cyan-400">
              <Building2 className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold text-white tracking-tight">Empresas Clientes & Provedores</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Gestão centralizada de empresas B2B. Cada cliente possui seu ASN oficial e enxerga apenas suas próprias sessões BGP.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadTenants}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700 hover:text-white cursor-pointer"
            title="Atualizar lista"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          {isSuperAdmin && (
            <button
              onClick={handleOpenCreateModal}
              className="flex items-center gap-2 px-4 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow-lg shadow-cyan-600/20 transition cursor-pointer"
            >
              <Plus className="h-4 w-4" />
              <span>Nova Empresa Cliente</span>
            </button>
          )}
        </div>
      </div>

      {/* Banner de Feedback */}
      {feedbackMsg && (
        <div
          className={`p-3.5 rounded-xl border flex items-center justify-between text-xs animate-in fade-in ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-950/40 border-emerald-800/80 text-emerald-300'
              : 'bg-rose-950/40 border-rose-800/80 text-rose-300'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
            <span>{feedbackMsg.text}</span>
          </div>
          <button onClick={() => setFeedbackMsg(null)} className="text-slate-400 hover:text-white">
            &times;
          </button>
        </div>
      )}

      {/* Cards de Métricas */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Empresas Cadastradas</p>
            <p className="text-2xl font-bold text-white mt-1">{totalTenants}</p>
          </div>
          <div className="p-3 rounded-xl bg-cyan-500/10 text-cyan-400">
            <Building2 className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Roteadores de Borda</p>
            <p className="text-2xl font-bold text-white mt-1">{totalRouters}</p>
          </div>
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-400">
            <Server className="h-5 w-5" />
          </div>
        </div>

        <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-medium text-slate-400 uppercase tracking-wider">Operadores / Usuários</p>
            <p className="text-2xl font-bold text-white mt-1">{totalUsers}</p>
          </div>
          <div className="p-3 rounded-xl bg-indigo-500/10 text-indigo-400">
            <Users className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Barra de Filtros e Pesquisa */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome, slug, ASN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950/70 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-hidden focus:border-cyan-500"
          />
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <span className="text-xs text-slate-400">Status:</span>
          <select
            value={statusFilter}
            onChange={(e: any) => setStatusFilter(e.target.value)}
            className="bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-hidden focus:border-cyan-500"
          >
            <option value="all">Todos</option>
            <option value="active">Ativos</option>
            <option value="suspended">Suspensos</option>
          </select>
        </div>
      </div>

      {/* Lista de Empresas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredTenants.map((t) => {
          const tenantId = t.id
          const isSelected = activeTenantId === tenantId

          return (
            <div
              key={tenantId}
              className={`p-5 rounded-2xl border transition-all duration-200 flex flex-col justify-between ${
                isSelected
                  ? 'bg-cyan-950/20 border-cyan-500/60 shadow-lg shadow-cyan-950/40 ring-1 ring-cyan-500/40'
                  : 'bg-slate-900/60 border-slate-800 hover:border-slate-700'
              }`}
            >
              <div>
                {/* Header do Card */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-xl bg-slate-800/80 border border-slate-700 flex items-center justify-center text-cyan-400 font-bold shrink-0">
                      {t.logo_url ? (
                        <img src={t.logo_url} alt={t.name} className="h-8 w-8 object-contain rounded-lg" />
                      ) : (
                        <Building2 className="h-5 w-5 text-cyan-400" />
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-sm text-white flex items-center gap-1.5">
                        <span>{t.name}</span>
                        {tenantId === 'default-tenant' && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-cyan-500/20 text-cyan-300 rounded border border-cyan-500/30">
                            NOC Central
                          </span>
                        )}
                      </h3>
                      <p className="text-[11px] text-slate-400 font-mono mt-0.5">slug: {t.slug}</p>
                    </div>
                  </div>

                  <span
                    className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                      t.status === 'active'
                        ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
                        : 'bg-amber-950/40 text-amber-400 border-amber-800/50'
                    }`}
                  >
                    {t.status === 'active' ? 'Ativo' : 'Suspenso'}
                  </span>
                </div>

                {/* Dados da Empresa & ASN */}
                <div className="mt-4 pt-3 border-t border-slate-800/80 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-400 flex items-center gap-1.5">
                      <Network className="h-3.5 w-3.5 text-cyan-400" />
                      ASN Oficial:
                    </span>
                    <span className="font-mono font-semibold px-2 py-0.5 bg-slate-800 rounded border border-slate-700 text-cyan-300">
                      AS{t.asn || 'N/D'}
                    </span>
                  </div>

                  {t.document && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <FileText className="h-3.5 w-3.5 text-slate-500" />
                        CNPJ/ID:
                      </span>
                      <span className="font-mono text-slate-300">{t.document}</span>
                    </div>
                  )}

                  {t.contact_email && (
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-slate-400 flex items-center gap-1.5">
                        <Mail className="h-3.5 w-3.5 text-slate-500" />
                        Contato:
                      </span>
                      <span className="text-slate-300 truncate max-w-[170px]" title={t.contact_email}>
                        {t.contact_email}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-1 text-[11px]">
                    <span className="text-slate-400">Roteadores BGP:</span>
                    <span className="font-semibold text-slate-200">{t.device_count ?? 0}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400">Usuários Vinculados:</span>
                    <span className="font-semibold text-slate-200">{t.user_count ?? 0}</span>
                  </div>
                </div>
              </div>

              {/* Ações do Card */}
              <div className="mt-4 pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                {isSuperAdmin && (
                  <button
                    onClick={() => setActiveTenant(isSelected ? null : tenantId)}
                    className={`flex-1 py-1.5 px-2.5 rounded-lg text-xs font-medium transition flex items-center justify-center gap-1.5 cursor-pointer ${
                      isSelected
                        ? 'bg-cyan-500 text-slate-950 font-semibold'
                        : 'bg-slate-800 hover:bg-slate-700 text-slate-200'
                    }`}
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>{isSelected ? 'Visão Ativa' : 'Entrar no Cliente'}</span>
                  </button>
                )}

                {isSuperAdmin && (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenEditModal(t)}
                      className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                      title="Editar empresa"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    {tenantId !== 'default-tenant' && (
                      <button
                        onClick={() => handleDeleteTenant(t)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                        title="Excluir empresa"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {filteredTenants.length === 0 && !loading && (
        <div className="p-8 text-center bg-slate-900/40 rounded-2xl border border-slate-800 text-slate-400 text-xs">
          Nenhuma empresa encontrada correspondente aos filtros.
        </div>
      )}

      {/* Modal de Criação / Edição de Empresa */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-lg shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Building2 className="h-5 w-5 text-cyan-400" />
                <span>{editingTenant ? 'Editar Empresa Cliente' : 'Nova Empresa Cliente'}</span>
              </h2>
              <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white text-lg">
                &times;
              </button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-950/40 border border-rose-800 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            <form onSubmit={handleSaveTenant} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Nome da Empresa / Provedor *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: Provedor Conexão Fibra"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-hidden focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">ASN Oficial da Rede *</label>
                  <input
                    type="text"
                    required
                    placeholder="Ex: 267943"
                    value={formData.asn}
                    onChange={(e) => setFormData({ ...formData, asn: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 font-mono focus:outline-hidden focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Slug / Identificador</label>
                  <input
                    type="text"
                    placeholder="Ex: conexao-fibra"
                    value={formData.slug}
                    onChange={(e) => setFormData({ ...formData, slug: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 font-mono focus:outline-hidden focus:border-cyan-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">CNPJ / Documento</label>
                  <input
                    type="text"
                    placeholder="00.000.000/0001-00"
                    value={formData.document}
                    onChange={(e) => setFormData({ ...formData, document: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-hidden focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Plano B2B</label>
                  <select
                    value={formData.plan}
                    onChange={(e) => setFormData({ ...formData, plan: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-hidden focus:border-cyan-500"
                  >
                    <option value="enterprise">Enterprise</option>
                    <option value="isp_pro">ISP Pro</option>
                    <option value="trial">Trial / Testes</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">E-mail do NOC / Suporte</label>
                  <input
                    type="email"
                    placeholder="noc@empresa.com.br"
                    value={formData.contact_email}
                    onChange={(e) => setFormData({ ...formData, contact_email: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-hidden focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Telefone Plantão</label>
                  <input
                    type="text"
                    placeholder="+55 (11) 99999-9999"
                    value={formData.contact_phone}
                    onChange={(e) => setFormData({ ...formData, contact_phone: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-hidden focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e: any) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-hidden focus:border-cyan-500"
                >
                  <option value="active">Ativo (Permitir acesso)</option>
                  <option value="suspended">Suspenso (Bloquear acesso)</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={formSubmitting}
                  className="px-5 py-2 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white font-medium text-xs shadow-lg shadow-cyan-600/20 transition cursor-pointer"
                >
                  {formSubmitting ? 'Salvando...' : editingTenant ? 'Salvar Alterações' : 'Cadastrar Empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
