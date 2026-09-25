import React, { useState, useEffect } from 'react'
import {
  Users,
  Plus,
  Search,
  Building2,
  Shield,
  Key,
  Edit2,
  Trash2,
  CheckCircle2,
  AlertCircle,
  Crown,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react'
import {
  fetchUsers,
  createUser,
  updateUser,
  deleteUser,
  fetchTenants,
  type UserProfile,
  type Tenant,
  type UserRole
} from '../services/api'
import { useAuth } from '../context/AuthContext'

export const UserManager: React.FC = () => {
  const { user: currentUser, isSuperAdmin } = useAuth()

  const [users, setUsers] = useState<UserProfile[]>([])
  const [tenants, setTenants] = useState<Tenant[]>([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [tenantFilter, setTenantFilter] = useState<string>('all')
  const [roleFilter, setRoleFilter] = useState<string>('all')

  // Modals
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingUser, setEditingUser] = useState<UserProfile | null>(null)
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    tenant_id: 'default-tenant',
    role: 'noc_operator' as UserRole,
    is_superadmin: false,
    status: 'active',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [formSubmitting, setFormSubmitting] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  const loadData = async () => {
    setLoading(true)
    try {
      const [usersData, tenantsData] = await Promise.all([
        fetchUsers(),
        fetchTenants().catch(() => [])
      ])
      setUsers(usersData)
      setTenants(tenantsData)
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Erro ao carregar dados' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleOpenCreateModal = () => {
    setEditingUser(null)
    setFormData({
      name: '',
      email: '',
      password: '',
      tenant_id: isSuperAdmin ? 'default-tenant' : (currentUser?.tenant_id || 'default-tenant'),
      role: 'noc_operator',
      is_superadmin: false,
      status: 'active',
    })
    setShowPassword(false)
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleOpenEditModal = (u: UserProfile) => {
    setEditingUser(u)
    setFormData({
      name: u.name,
      email: u.email,
      password: '', // Em branco para não alterar caso não queira redefinir
      tenant_id: u.tenant_id,
      role: u.role,
      is_superadmin: !!u.is_superadmin,
      status: u.status || 'active',
    })
    setShowPassword(false)
    setFormError(null)
    setIsModalOpen(true)
  }

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setFormSubmitting(true)
    setFormError(null)

    try {
      if (editingUser) {
        await updateUser(editingUser.id, {
          name: formData.name,
          email: formData.email,
          role: formData.role,
          tenant_id: formData.tenant_id,
          status: formData.status,
          password: formData.password || undefined,
          is_superadmin: formData.is_superadmin,
        })
        setFeedbackMsg({ type: 'success', text: `Usuário "${formData.name}" atualizado com sucesso!` })
      } else {
        if (!formData.password) {
          setFormError('A senha é obrigatória para novos usuários')
          setFormSubmitting(false)
          return
        }
        await createUser({
          name: formData.name,
          email: formData.email,
          password: formData.password,
          role: formData.role,
          tenant_id: formData.tenant_id,
          is_superadmin: formData.is_superadmin,
        })
        setFeedbackMsg({ type: 'success', text: `Usuário "${formData.name}" cadastrado com sucesso!` })
      }
      setIsModalOpen(false)
      loadData()
    } catch (err: any) {
      setFormError(err.message || 'Erro ao processar requisição')
    } finally {
      setFormSubmitting(false)
    }
  }

  const handleDeleteUser = async (u: UserProfile) => {
    if (u.id === currentUser?.id) {
      alert('Você não pode excluir o seu próprio usuário logado.')
      return
    }

    if (!confirm(`Deseja realmente remover o usuário "${u.name}" (${u.email})?`)) {
      return
    }

    try {
      await deleteUser(u.id)
      setFeedbackMsg({ type: 'success', text: `Usuário "${u.name}" excluído com sucesso.` })
      loadData()
    } catch (err: any) {
      setFeedbackMsg({ type: 'error', text: err.message || 'Erro ao excluir usuário' })
    }
  }

  // Filtragem
  const filteredUsers = users.filter((u) => {
    const matchesSearch =
      u.name.toLowerCase().includes(search.toLowerCase()) ||
      u.email.toLowerCase().includes(search.toLowerCase())
    const matchesTenant = tenantFilter === 'all' || u.tenant_id === tenantFilter
    const matchesRole = roleFilter === 'all' || u.role === roleFilter
    return matchesSearch && matchesTenant && matchesRole
  })

  return (
    <div className="space-y-6">
      {/* Header & Ações */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/60 p-5 rounded-2xl border border-slate-800 shadow-xl backdrop-blur-md">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400">
              <Users className="h-5 w-5" />
            </span>
            <h1 className="text-xl font-bold text-white tracking-tight">Gestão de Usuários & Operadores</h1>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Cadastre os operadores e vincule cada usuário à sua empresa cliente com isolamento rigoroso de permissões e BGP.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={loading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 transition border border-slate-700 hover:text-white cursor-pointer"
            title="Atualizar lista"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            onClick={handleOpenCreateModal}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/20 transition cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Usuário</span>
          </button>
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

      {/* Barra de Filtros e Pesquisa */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900/40 p-3 rounded-xl border border-slate-800">
        <div className="relative w-full sm:w-72">
          <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por nome ou e-mail..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 bg-slate-950/70 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder:text-slate-500 focus:outline-hidden focus:border-indigo-500"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {isSuperAdmin && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Empresa:</span>
              <select
                value={tenantFilter}
                onChange={(e) => setTenantFilter(e.target.value)}
                className="bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
              >
                <option value="all">Todas as Empresas</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">Papel:</span>
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className="bg-slate-950/70 border border-slate-800 rounded-lg px-2.5 py-1 text-xs text-slate-200 focus:outline-hidden focus:border-indigo-500"
            >
              <option value="all">Todos os Papéis</option>
              <option value="admin">Administrador</option>
              <option value="noc_operator">Operador NOC</option>
              <option value="viewer">Visualizador</option>
            </select>
          </div>
        </div>
      </div>

      {/* Tabela de Usuários */}
      <div className="bg-slate-900/60 rounded-2xl border border-slate-800 overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider text-[11px]">
              <tr>
                <th className="py-3 px-4">Operador / Usuário</th>
                <th className="py-3 px-4">Empresa Pertencente</th>
                <th className="py-3 px-4">Papel & Permissões</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Último Acesso</th>
                <th className="py-3 px-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {filteredUsers.map((u) => {
                const tenant = tenants.find((t) => t.id === u.tenant_id)
                const tenantName = u.tenant_name || tenant?.name || u.tenant_id

                return (
                  <tr key={u.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center font-bold text-slate-200 text-xs">
                          {u.name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="font-semibold text-slate-100 flex items-center gap-1.5">
                            <span>{u.name}</span>
                            {u.is_superadmin && (
                              <span className="flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded border border-amber-500/30">
                                <Crown className="h-2.5 w-2.5" />
                                SuperAdmin
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono">{u.email}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                        <span className="font-medium text-slate-300">{tenantName}</span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      {u.role === 'admin' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-950/60 text-indigo-300 border border-indigo-800/50 text-[11px] font-medium">
                          <Shield className="h-3 w-3 text-indigo-400" />
                          Administrador
                        </span>
                      ) : u.role === 'noc_operator' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-cyan-950/60 text-cyan-300 border border-cyan-800/50 text-[11px] font-medium">
                          <Key className="h-3 w-3 text-cyan-400" />
                          Operador NOC
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 text-[11px] font-medium">
                          Visualizador
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full border ${
                          u.status === 'active'
                            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-800/50'
                            : 'bg-amber-950/40 text-amber-400 border-amber-800/50'
                        }`}
                      >
                        {u.status === 'active' ? 'Ativo' : 'Suspenso'}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-slate-400 text-[11px]">
                      {u.last_login ? new Date(u.last_login).toLocaleString('pt-BR') : 'Nunca acessou'}
                    </td>

                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          onClick={() => handleOpenEditModal(u)}
                          className="p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                          title="Editar usuário"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        {u.id !== currentUser?.id && (
                          <button
                            onClick={() => handleDeleteUser(u)}
                            className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-800 rounded-lg transition cursor-pointer"
                            title="Excluir usuário"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {filteredUsers.length === 0 && !loading && (
          <div className="p-8 text-center text-slate-400 text-xs">Nenhum usuário encontrado.</div>
        )}
      </div>

      {/* Modal de Criação / Edição de Usuário */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs animate-in fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-6 w-full max-w-md shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                <Users className="h-5 w-5 text-indigo-400" />
                <span>{editingUser ? 'Editar Usuário' : 'Novo Usuário'}</span>
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

            <form onSubmit={handleSaveUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-300 font-medium mb-1">Nome Completo *</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João da Silva"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">E-mail Corporativo *</label>
                <input
                  type="email"
                  required
                  placeholder="usuario@empresa.com.br"
                  value={formData.email}
                  onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-hidden focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-slate-300 font-medium mb-1">
                  {editingUser ? 'Nova Senha (deixe em branco para não alterar)' : 'Senha de Acesso *'}
                </label>
                <div className="relative">
                  <input
                    type={showPassword ? 'text' : 'password'}
                    placeholder={editingUser ? '••••••••' : 'Mínimo 6 caracteres'}
                    value={formData.password}
                    onChange={(e) => setFormData({ ...formData, password: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 pr-9 text-slate-200 focus:outline-hidden focus:border-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Seleção de Empresa Cliente */}
              <div>
                <label className="block text-slate-300 font-medium mb-1">Empresa Cliente / Tenant *</label>
                {isSuperAdmin ? (
                  <select
                    value={formData.tenant_id}
                    onChange={(e) => setFormData({ ...formData, tenant_id: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-hidden focus:border-indigo-500"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} (ASN: {t.asn || 'N/D'})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl text-slate-300 flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-cyan-400" />
                    <span>{currentUser?.tenant_name || currentUser?.tenant_id}</span>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-300 font-medium mb-1">Papel de Acesso</label>
                  <select
                    value={formData.role}
                    onChange={(e: any) => setFormData({ ...formData, role: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-hidden focus:border-indigo-500"
                  >
                    <option value="admin">Administrador</option>
                    <option value="noc_operator">Operador NOC</option>
                    <option value="viewer">Visualizador</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-300 font-medium mb-1">Status</label>
                  <select
                    value={formData.status}
                    onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl p-2.5 text-slate-200 focus:outline-hidden focus:border-indigo-500"
                  >
                    <option value="active">Ativo</option>
                    <option value="suspended">Suspenso</option>
                  </select>
                </div>
              </div>

              {isSuperAdmin && (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl flex items-center gap-2.5">
                  <input
                    type="checkbox"
                    id="is_superadmin"
                    checked={formData.is_superadmin}
                    onChange={(e) => setFormData({ ...formData, is_superadmin: e.target.checked })}
                    className="rounded border-slate-700 text-indigo-600 focus:ring-indigo-500"
                  />
                  <label htmlFor="is_superadmin" className="text-slate-300 flex items-center gap-1.5 cursor-pointer">
                    <Crown className="h-3.5 w-3.5 text-amber-400" />
                    <span>Acesso SuperAdmin Global (Netplus NOC Master)</span>
                  </label>
                </div>
              )}

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
                  className="px-5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs shadow-lg shadow-indigo-600/20 transition cursor-pointer"
                >
                  {formSubmitting ? 'Salvando...' : editingUser ? 'Salvar Alterações' : 'Cadastrar Usuário'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
