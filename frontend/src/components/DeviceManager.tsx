import React, { useState, useEffect } from 'react'
import {
  Server,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Terminal,
  ShieldCheck,
  AlertCircle,
  Network,
  Activity,
  Building2
} from 'lucide-react'
import {
  fetchDevices,
  createDevice,
  updateDevice,
  deleteDevice,
  testDeviceSSH,
  type Device,
  type VendorType,
  type SSHTestResult
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import { DeviceCardSkeleton } from './common/Skeleton'

interface DeviceManagerProps {
  onSelectDeviceForTerminal?: (device: Device) => void
  onSelectDeviceForBGP?: (device: Device) => void
  density?: 'comfortable' | 'compact'
}

const VENDOR_OPTIONS: { id: VendorType; label: string; badge: string; color: string }[] = [
  { id: 'huawei', label: 'Huawei (VRP - NE8000 / NE40 / S6730)', badge: 'Huawei VRP', color: 'bg-red-500/10 text-red-400 border-red-500/30' },
  { id: 'datacom', label: 'Datacom (DmOS Moderno)', badge: 'Datacom DmOS', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' },
  { id: 'mikrotik_v7', label: 'MikroTik (RouterOS v7)', badge: 'MikroTik v7', color: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30' },
  { id: 'mikrotik_v6', label: 'MikroTik (RouterOS v6)', badge: 'MikroTik v6', color: 'bg-indigo-500/10 text-indigo-400 border-indigo-500/30' },
]

export const DeviceManager: React.FC<DeviceManagerProps> = ({
  onSelectDeviceForTerminal,
  onSelectDeviceForBGP,
  density = 'comfortable',
}) => {
  const { isSuperAdmin, tenants, activeTenantId } = useAuth()

  const [devices, setDevices] = useState<Device[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingDevice, setEditingDevice] = useState<Device | null>(null)
  const [formTenantId, setFormTenantId] = useState<string>('default-tenant')
  const [formName, setFormName] = useState('')
  const [formHost, setFormHost] = useState('')
  const [formPort, setFormPort] = useState(22)
  const [formVendor, setFormVendor] = useState<VendorType>('huawei')
  const [formModel, setFormModel] = useState('')
  const [formUsername, setFormUsername] = useState('')
  const [formPassword, setFormPassword] = useState('')
  const [formIsBGP, setFormIsBGP] = useState(true)

  // Testing SSH state per device
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, SSHTestResult>>({})

  const loadDevices = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchDevices()
      setDevices(data)
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar roteadores')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadDevices()
  }, [activeTenantId])

  const openAddModal = () => {
    setEditingDevice(null)
    setFormTenantId(activeTenantId || tenants[0]?.id || 'default-tenant')
    setFormName('')
    setFormHost('')
    setFormPort(22)
    setFormVendor('huawei')
    setFormModel('NE8000 F1A')
    setFormUsername('admin')
    setFormPassword('')
    setFormIsBGP(true)
    setIsModalOpen(true)
  }

  const openEditModal = (dev: Device) => {
    setEditingDevice(dev)
    setFormTenantId(dev.tenant_id || activeTenantId || tenants[0]?.id || 'default-tenant')
    setFormName(dev.name)
    setFormHost(dev.host)
    setFormPort(dev.port)
    setFormVendor(dev.vendor)
    setFormModel(dev.model || '')
    setFormUsername(dev.username)
    setFormPassword('')
    setFormIsBGP(dev.is_bgp ?? true)
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      if (editingDevice) {
        await updateDevice(editingDevice.id, {
          tenant_id: isSuperAdmin ? formTenantId : undefined,
          name: formName,
          host: formHost,
          port: Number(formPort),
          vendor: formVendor,
          model: formModel,
          username: formUsername,
          password: formPassword || undefined,
          is_bgp: formIsBGP,
        })
      } else {
        await createDevice({
          tenant_id: isSuperAdmin ? formTenantId : (activeTenantId || undefined),
          name: formName,
          host: formHost,
          port: Number(formPort),
          vendor: formVendor,
          model: formModel,
          username: formUsername,
          password: formPassword,
          auth_type: 'password',
          is_bgp: formIsBGP,
        })
      }
      setIsModalOpen(false)
      loadDevices()
    } catch (err: any) {
      alert(err.message || 'Erro ao salvar equipamento')
    }
  }

  const handleDelete = async (id: string, name: string) => {
    if (!confirm(`Deseja realmente remover o equipamento "${name}"?`)) return
    try {
      await deleteDevice(id)
      setDevices((prev) => prev.filter((d) => d.id !== id))
    } catch (err: any) {
      alert(err.message || 'Erro ao remover equipamento')
    }
  }

  const handleTestSSH = async (dev: Device) => {
    setTestingId(dev.id)
    try {
      const res = await testDeviceSSH(dev.id)
      setTestResults((prev) => ({ ...prev, [dev.id]: res }))
      // Update device status in list
      setDevices((prev) =>
        prev.map((d) => (d.id === dev.id ? { ...d, status: res.success ? 'online' : 'offline' } : d))
      )
    } catch (err: any) {
      setTestResults((prev) => ({
        ...prev,
        [dev.id]: { success: false, latency_ms: 0, error: err.message },
      }))
    } finally {
      setTestingId(null)
    }
  }

  return (
    <div className="space-y-6">
      {/* Top Banner & Action */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Server className="h-5 w-5 text-cyan-400" />
            <span>Inventário de Equipamentos (Bordas, Cores e Switches)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Gerenciamento e credenciais SSH para Huawei (NE8000, NE40, S6730), Datacom DmOS e MikroTik
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={loadDevices}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-lg text-xs shadow-md shadow-cyan-600/20 transition-all cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Equipamento</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800 text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* Grid of Devices */}
      {loading && devices.length === 0 ? (
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${density === 'compact' ? 'gap-3.5' : 'gap-5'}`}>
          {Array.from({ length: 3 }).map((_, i) => (
            <DeviceCardSkeleton key={i} compact={density === 'compact'} />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="bg-slate-900/40 border border-slate-800 rounded-2xl p-12 text-center">
          <Network className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300">Nenhum equipamento cadastrado ainda</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-6">
            Cadastre seus roteadores de borda (NE8000, NE40), switches de core (S6730), Datacom DmOS ou MikroTiks para começar a inspecionar BGP e OSPF.
          </p>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white font-medium rounded-lg text-xs cursor-pointer shadow-md shadow-cyan-600/20"
          >
            <Plus className="h-4 w-4" />
            <span>Cadastrar Primeiro Roteador</span>
          </button>
        </div>
      ) : (
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${density === 'compact' ? 'gap-3.5' : 'gap-5'}`}>
          {devices.map((dev) => {
            const vendorInfo = VENDOR_OPTIONS.find((v) => v.id === dev.vendor) || {
              badge: dev.vendor,
              color: 'bg-slate-800 text-slate-300 border-slate-700',
            }
            const testResult = testResults[dev.id]
            const isTesting = testingId === dev.id

            return (
              <div
                key={dev.id}
                className={`bg-slate-900/50 border border-slate-800 hover:border-slate-700 rounded-xl shadow-lg flex flex-col justify-between transition-all ${
                  density === 'compact' ? 'p-3.5' : 'p-5'
                }`}
              >
                <div>
                  {/* Top card header */}
                  <div className={`flex items-start justify-between gap-2 ${density === 'compact' ? 'mb-2' : 'mb-3'}`}>
                    <div>
                      <h3 className="font-semibold text-slate-100 text-base flex items-center gap-1.5">
                        <span>{dev.name}</span>
                      </h3>
                      {dev.model && (
                        <span className="text-[11px] text-slate-400 font-mono tracking-tight">{dev.model}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 flex-wrap justify-end">
                      {isSuperAdmin && dev.tenant_id && (
                        <span
                          className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800 text-cyan-300 border border-slate-700 flex items-center gap-1"
                          title={`Empresa: ${tenants.find((t) => t.id === dev.tenant_id)?.name || dev.tenant_name || dev.tenant_id}`}
                        >
                          <Building2 className="h-3 w-3 text-cyan-400 shrink-0" />
                          <span className="truncate max-w-[100px]">
                            {tenants.find((t) => t.id === dev.tenant_id)?.name || dev.tenant_name || dev.tenant_id}
                          </span>
                        </span>
                      )}
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${vendorInfo.color}`}
                      >
                        {vendorInfo.badge}
                      </span>
                      {dev.is_bgp ? (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-950/80 text-purple-300 border border-purple-800 flex items-center gap-1" title="Roteador BGP / Borda com varredura ativa">
                          <Network className="h-3 w-3 text-purple-400" />
                          BGP
                        </span>
                      ) : (
                        <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-400 border border-slate-700" title="Equipamento interno ou de acesso (sem varredura BGP)">
                          Não-BGP
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Connection Details */}
                  <div className={`text-slate-300 bg-slate-950/50 rounded-lg border border-slate-800/80 ${
                    density === 'compact' ? 'space-y-1 text-[11px] p-2.5 mb-2.5' : 'space-y-1.5 text-xs p-3 mb-4'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Host / IP:</span>
                      <span className="font-mono text-cyan-300 tracking-tight">{dev.host}:{dev.port}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Usuário SSH:</span>
                      <span className="font-mono text-slate-300 tracking-tight">{dev.username}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Status SSH:</span>
                      {dev.status === 'online' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-400">
                          <CheckCircle2 className="h-3 w-3" /> Online
                        </span>
                      ) : dev.status === 'offline' ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-400">
                          <XCircle className="h-3 w-3" /> Inacessível
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">Não testado</span>
                      )}
                    </div>
                  </div>

                  {/* Test Feedback banner if available */}
                  {testResult && (
                    <div
                      className={`mb-4 p-2.5 rounded-lg text-xs border ${
                        testResult.success
                          ? 'bg-emerald-950/30 border-emerald-800 text-emerald-300'
                          : 'bg-rose-950/30 border-rose-800 text-rose-300'
                      }`}
                    >
                      <div className="flex items-center justify-between font-medium">
                        <span>{testResult.success ? 'Conexão SSH OK' : 'Falha SSH'}</span>
                        {testResult.latency_ms > 0 && (
                          <span className="font-mono">{testResult.latency_ms.toFixed(1)} ms</span>
                        )}
                      </div>
                      {testResult.banner && (
                        <div className="text-[10px] text-emerald-400/80 truncate mt-0.5">
                          {testResult.banner}
                        </div>
                      )}
                      {testResult.error && (
                        <div className="text-[11px] text-rose-400 break-words mt-0.5">
                          {testResult.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="pt-3 border-t border-slate-800/80 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleTestSSH(dev)}
                      disabled={isTesting}
                      className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs rounded font-medium border border-slate-700/80 cursor-pointer disabled:opacity-50"
                      title="Testar Conexão SSH"
                    >
                      <ShieldCheck className={`h-3.5 w-3.5 ${isTesting ? 'animate-spin text-cyan-400' : 'text-cyan-400'}`} />
                      <span>{isTesting ? 'Testando...' : 'Testar SSH'}</span>
                    </button>

                    {onSelectDeviceForTerminal && (
                      <button
                        onClick={() => onSelectDeviceForTerminal(dev)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 text-xs rounded border border-slate-700/80 cursor-pointer"
                        title="Abrir no Terminal SSH"
                      >
                        <Terminal className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {onSelectDeviceForBGP && (
                      <button
                        onClick={() => onSelectDeviceForBGP(dev)}
                        className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-400 text-xs rounded border border-slate-700/80 cursor-pointer"
                        title="Ver Sessões BGP"
                      >
                        <Activity className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(dev)}
                      className="p-1.5 text-slate-400 hover:text-slate-200 cursor-pointer hover:bg-slate-800 rounded transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(dev.id, dev.name)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer hover:bg-slate-800 rounded transition-colors"
                      title="Excluir"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Add / Edit Device Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-xs p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-semibold text-slate-100 flex items-center gap-2">
                <Server className="h-5 w-5 text-cyan-400" />
                <span>{editingDevice ? 'Editar Equipamento' : 'Novo Equipamento'}</span>
              </h3>
              <button
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-200 text-lg cursor-pointer"
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSave} className="p-6 space-y-4">
              {/* Tenant Selector for SuperAdmin */}
              {isSuperAdmin && (
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Empresa Cliente (Tenant Proprietário) *
                  </label>
                  <select
                    value={formTenantId}
                    onChange={(e) => setFormTenantId(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    {tenants.map((t) => (
                      <option key={t.id} value={t.id}>
                        🏢 {t.name} {t.asn ? `(AS${t.asn})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Nome Identificador *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="ex: Borda-NE8000-01"
                    className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Fabricante e Versão *
                  </label>
                  <select
                    value={formVendor}
                    onChange={(e) => setFormVendor(e.target.value as VendorType)}
                    className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
                  >
                    {VENDOR_OPTIONS.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    IP ou Hostname *
                  </label>
                  <input
                    type="text"
                    required
                    value={formHost}
                    onChange={(e) => setFormHost(e.target.value)}
                    placeholder="192.168.1.1 ou 10.0.0.1"
                    className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Porta SSH *
                  </label>
                  <input
                    type="number"
                    required
                    value={formPort}
                    onChange={(e) => setFormPort(Number(e.target.value))}
                    className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1">
                  Modelo do Equipamento (Opcional)
                </label>
                <input
                  type="text"
                  value={formModel}
                  onChange={(e) => setFormModel(e.target.value)}
                  placeholder="ex: NE8000 F1A, NE40, CloudEngine S6730, CCR2004..."
                  className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Usuário SSH *
                  </label>
                  <input
                    type="text"
                    required
                    value={formUsername}
                    onChange={(e) => setFormUsername(e.target.value)}
                    placeholder="admin"
                    className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Senha SSH {editingDevice ? '(deixe em branco para manter)' : '*'}
                  </label>
                  <input
                    type="password"
                    required={!editingDevice}
                    value={formPassword}
                    onChange={(e) => setFormPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>
              </div>

              {/* BGP Border Router Flag */}
              <div className="p-3 bg-slate-950/80 border border-slate-800 rounded-lg flex items-start justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <Network className="h-4 w-4 text-purple-400" />
                    <label htmlFor="isBGPCheckbox" className="text-xs font-semibold text-slate-200 cursor-pointer">
                      Roteador de Borda BGP
                    </label>
                  </div>
                  <p className="text-[11px] text-slate-400">
                    Habilita varredura de sessões BGP, comunidades e engenharia de tráfego (Prepends e Local-Pref). Deixe desmarcado para Switches, OLTs ou PEs internos.
                  </p>
                </div>
                <input
                  id="isBGPCheckbox"
                  type="checkbox"
                  checked={formIsBGP}
                  onChange={(e) => setFormIsBGP(e.target.checked)}
                  className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
              </div>

              <div className="p-3 bg-cyan-950/30 border border-cyan-900/50 rounded-lg flex items-start gap-2 text-[11px] text-cyan-300">
                <AlertCircle className="h-4 w-4 shrink-0 text-cyan-400 mt-0.5" />
                <span>
                  O sistema desativa automaticamente a paginação de tela (<code className="bg-slate-900 px-1 py-0.5 rounded">screen-length 0 temporary</code> no Huawei e <code className="bg-slate-900 px-1 py-0.5 rounded">terminal length 0</code> no Datacom).
                </span>
              </div>

              <div className="pt-4 border-t border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-medium cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white rounded-lg text-xs font-medium shadow-md shadow-cyan-600/20 cursor-pointer"
                >
                  Salvar Equipamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
