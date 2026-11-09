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
  Building2,
  Layers,
  Crown,
  MapPin,
  Locate,
  LayoutGrid,
} from 'lucide-react'
import {
  fetchDevices,
  createDevice,
  updateDevice,
  deleteDevice,
  testDeviceSSH,
  auditDeviceCompliance,
  type Device,
  type VendorType,
  type DeviceRole,
  type SSHTestResult,
  type DeviceComplianceAudit,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import { DeviceCardSkeleton } from './common/Skeleton'
import { DeviceComplianceModal } from './DeviceComplianceModal'
import { isBGPMasterDevice, setBGPMasterDeviceId } from '../utils/bgpMaster'
import { BackboneMapView } from './devices/BackboneMapView'

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

const ROLE_OPTIONS: { id: DeviceRole; label: string; badge: string; color: string; desc: string }[] = [
  { id: 'bgp', label: 'BGP (Borda)', badge: 'BGP', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30', desc: 'Roteador de Borda com varredura BGP' },
  { id: 'pe', label: 'PE (Distribuição)', badge: 'PE', color: 'bg-purple-500/10 text-purple-400 border-purple-500/30', desc: 'Provider Edge / Agregação' },
  { id: 'sw', label: 'SW (Switch)', badge: 'SW', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30', desc: 'Switch Core / Backbone' },
  { id: 'olt', label: 'OLT (Óptica)', badge: 'OLT', color: 'bg-amber-500/10 text-amber-400 border-amber-500/30', desc: 'Terminal Óptico GPON/PON' },
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

  // View Mode: 'cards' | 'map'
  const [viewMode, setViewMode] = useState<'cards' | 'map'>('cards')

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
  const [formIsMaster, setFormIsMaster] = useState(false)
  const [formDeviceRole, setFormDeviceRole] = useState<DeviceRole>('bgp')
  const [formLatitude, setFormLatitude] = useState('')
  const [formLongitude, setFormLongitude] = useState('')
  const [formSite, setFormSite] = useState('')
  const [formCity, setFormCity] = useState('')
  const [, setMasterTrigger] = useState(0)

  useEffect(() => {
    const handler = () => setMasterTrigger((prev) => prev + 1)
    window.addEventListener('bgp_master_changed', handler)
    return () => window.removeEventListener('bgp_master_changed', handler)
  }, [])

  // Geolocation capture via browser API
  const handleCaptureLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      alert('Geolocalização não suportada pelo navegador')
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFormLatitude(pos.coords.latitude.toFixed(6))
        setFormLongitude(pos.coords.longitude.toFixed(6))
      },
      (err) => {
        alert('Não foi possível obter sua localização: ' + err.message)
      },
      { enableHighAccuracy: true, timeout: 10000 }
    )
  }

  // Update coordinates directly from map placement
  const handleUpdateCoordinates = async (deviceId: string, lat: number, lng: number) => {
    try {
      await updateDevice(deviceId, { latitude: lat, longitude: lng })
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, latitude: lat, longitude: lng } : d))
      )
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar coordenadas'
      setError(msg)
    }
  }

  // Testing SSH state per device
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResults, setTestResults] = useState<Record<string, SSHTestResult>>({})

  // Configuration Compliance Inspection state
  const [auditingId, setAuditingId] = useState<string | null>(null)
  const [selectedAudit, setSelectedAudit] = useState<DeviceComplianceAudit | null>(null)
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false)
  const [auditResults, setAuditResults] = useState<Record<string, DeviceComplianceAudit>>({})

  const handleAuditDevice = async (deviceId: string) => {
    setAuditingId(deviceId)
    try {
      const audit = await auditDeviceCompliance(deviceId)
      setAuditResults((prev) => ({ ...prev, [deviceId]: audit }))
      setSelectedAudit(audit)
      setIsAuditModalOpen(true)
      setDevices((prev) =>
        prev.map((d) => (d.id === deviceId ? { ...d, status: audit.overall_status === 'failed' ? 'offline' : 'online' } : d))
      )
    } catch (err: any) {
      setError(err.message || 'Erro ao auditar configuração do equipamento')
    } finally {
      setAuditingId(null)
    }
  }

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
    setFormIsMaster(false)
    setFormDeviceRole('bgp')
    setFormLatitude('')
    setFormLongitude('')
    setFormSite('')
    setFormCity('')
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
    setFormIsMaster(isBGPMasterDevice(dev, devices))
    setFormDeviceRole(dev.device_role || (dev.is_bgp ? 'bgp' : 'sw'))
    setFormLatitude(
      dev.latitude !== undefined && dev.latitude !== null && !isNaN(Number(dev.latitude))
        ? String(dev.latitude)
        : ''
    )
    setFormLongitude(
      dev.longitude !== undefined && dev.longitude !== null && !isNaN(Number(dev.longitude))
        ? String(dev.longitude)
        : ''
    )
    setFormSite(dev.site || '')
    setFormCity(dev.city || '')
    setIsModalOpen(true)
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      const latVal = formLatitude.trim() ? parseFloat(formLatitude.trim()) : undefined
      const lngVal = formLongitude.trim() ? parseFloat(formLongitude.trim()) : undefined

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
          is_master: formIsMaster,
          device_role: formDeviceRole,
          latitude: latVal !== undefined && !isNaN(latVal) ? latVal : undefined,
          longitude: lngVal !== undefined && !isNaN(lngVal) ? lngVal : undefined,
          site: formSite.trim() || undefined,
          city: formCity.trim() || undefined,
        })
        if (formIsMaster) {
          setBGPMasterDeviceId(editingDevice.id)
        }
      } else {
        const created = await createDevice({
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
          is_master: formIsMaster,
          device_role: formDeviceRole,
          latitude: latVal !== undefined && !isNaN(latVal) ? latVal : undefined,
          longitude: lngVal !== undefined && !isNaN(lngVal) ? lngVal : undefined,
          site: formSite.trim() || undefined,
          city: formCity.trim() || undefined,
        })
        if (formIsMaster && created?.id) {
          setBGPMasterDeviceId(created.id)
        }
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
      <div className="bg-[#1C202C] border border-[#242836] rounded-xl p-6 shadow-md flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Server className="h-5 w-5 text-[#4A72B2]" />
            <span>Infraestrutura & Backbone (Bordas, PEs, Switches e OLTs)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Gerenciamento, credenciais SSH e visualização geográfica do backbone (Huawei, Datacom, MikroTik)
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* View Mode Toggle */}
          <div className="flex items-center bg-[#161922] p-1 rounded-xl border border-[#242836]">
            <button
              type="button"
              onClick={() => setViewMode('cards')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === 'cards'
                  ? 'bg-[#25334D] text-[#93B4E6] border border-[#3B5B8C]/40 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <LayoutGrid className="h-3.5 w-3.5" />
              <span>Inventário ({devices.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode('map')}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
                viewMode === 'map'
                  ? 'bg-[#25334D] text-[#93B4E6] border border-[#3B5B8C]/40 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <MapPin className="h-3.5 w-3.5 text-[#E5A93C]" />
              <span>Mapa do Backbone</span>
            </button>
          </div>

          <button
            onClick={loadDevices}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 bg-[#1E2330] hover:bg-[#252C3D] text-[#E2E5EC] border border-[#2D3345] rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-[#4A72B2]' : ''}`} />
            <span>Atualizar</span>
          </button>

          <button
            onClick={openAddModal}
            className="flex items-center gap-2 px-4 py-2 bg-[#3B5B8C] hover:bg-[#4A72B2] text-white font-medium rounded-lg text-xs shadow-xs transition-colors cursor-pointer"
          >
            <Plus className="h-4 w-4" />
            <span>Novo Equipamento</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-[#1C202C] border border-[#D9534F]/40 text-[#D9534F] text-sm">
          {error}
        </div>
      )}

      {/* Main View: Geographic Map or Inventory Cards */}
      {viewMode === 'map' ? (
        <BackboneMapView
          devices={devices}
          onEditDevice={openEditModal}
          onSelectDeviceForTerminal={onSelectDeviceForTerminal}
          onSelectDeviceForBGP={onSelectDeviceForBGP}
          onAddDevice={openAddModal}
          onUpdateCoordinates={handleUpdateCoordinates}
        />
      ) : loading && devices.length === 0 ? (
        <div className={`grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 ${density === 'compact' ? 'gap-3.5' : 'gap-5'}`}>
          {Array.from({ length: 3 }).map((_, i) => (
            <DeviceCardSkeleton key={i} compact={density === 'compact'} />
          ))}
        </div>
      ) : devices.length === 0 ? (
        <div className="bg-[#1C202C] border border-[#242836] rounded-2xl p-12 text-center">
          <Network className="h-12 w-12 text-slate-600 mx-auto mb-3" />
          <h3 className="text-base font-semibold text-slate-300">Nenhum equipamento cadastrado ainda</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mt-1 mb-6">
            Cadastre seus roteadores de borda (BGP), PEs de distribuição, switches de core ou OLTs para começar a visualizar e operar seu backbone.
          </p>
          <button
            onClick={openAddModal}
            className="inline-flex items-center gap-2 px-4 py-2 bg-[#3B5B8C] hover:bg-[#4A72B2] text-white font-medium rounded-lg text-xs cursor-pointer shadow-xs"
          >
            <Plus className="h-4 w-4" />
            <span>Cadastrar Primeiro Equipamento</span>
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
            const isMaster = isBGPMasterDevice(dev, devices)
            const role = dev.device_role || (dev.is_bgp ? 'bgp' : 'sw')
            const roleCfg = ROLE_OPTIONS.find((r) => r.id === role) || ROLE_OPTIONS[0]

            return (
              <div
                key={dev.id}
                className={`bg-[#1C202C] border ${isMaster ? 'border-[#E5A93C]/50 ring-1 ring-[#E5A93C]/20' : 'border-[#242836]'} hover:border-[#3B5B8C]/40 rounded-xl shadow-md flex flex-col justify-between transition-all ${
                  density === 'compact' ? 'p-3.5' : 'p-5'
                }`}
              >
                <div>
                  {/* Top card header */}
                  <div className={`flex items-start justify-between gap-2 ${density === 'compact' ? 'mb-2' : 'mb-3'}`}>
                    <div>
                      <h3 className="font-semibold text-slate-100 text-base flex items-center gap-2">
                        <span>{dev.name}</span>
                        {isMaster && (
                          <span
                            className="text-[10px] font-bold text-[#E5A93C] bg-[#E5A93C]/10 border border-[#E5A93C]/30 px-1.5 py-0.5 rounded-md flex items-center gap-1 shadow-xs"
                            title="Roteador BGP Master / Controlador Principal de Tráfego: Todas as alterações de Prepend e políticas de exportação serão geradas e tratadas neste equipamento"
                          >
                            <Crown className="h-3 w-3 text-[#E5A93C]" />
                            MASTER
                          </span>
                        )}
                      </h3>
                      {dev.model && (
                        <span className="text-[11px] text-slate-400 font-mono tracking-tight">{dev.model}</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap justify-end">
                      {isSuperAdmin && dev.tenant_id && (
                        <span
                          className="text-[11px] text-slate-400 flex items-center gap-1"
                          title={`Empresa: ${tenants.find((t) => t.id === dev.tenant_id)?.name || dev.tenant_name || dev.tenant_id}`}
                        >
                          <Building2 className="h-3 w-3 text-slate-500 shrink-0" />
                          <span className="truncate max-w-[100px]">
                            {tenants.find((t) => t.id === dev.tenant_id)?.name || dev.tenant_name || dev.tenant_id}
                          </span>
                        </span>
                      )}
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${roleCfg.color}`}>
                        {roleCfg.badge}
                      </span>
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                        {vendorInfo.badge}
                      </span>
                    </div>
                  </div>

                  {/* Connection Details */}
                  <div className={`text-slate-300 bg-[#161922] rounded-lg border border-[#242836] ${
                    density === 'compact' ? 'space-y-1 text-[11px] p-2.5 mb-2.5' : 'space-y-1.5 text-xs p-3 mb-4'
                  }`}>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Host / IP:</span>
                      <span className="font-mono text-slate-200 tracking-tight">{dev.host}:{dev.port}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Usuário SSH:</span>
                      <span className="font-mono text-slate-300 tracking-tight">{dev.username}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">Status SSH:</span>
                      {dev.status === 'online' ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#2E9E6B]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#2E9E6B]"></span> Online
                        </span>
                      ) : dev.status === 'offline' ? (
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[#D9534F]">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#D9534F]"></span> Inacessível
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-500">Não testado</span>
                      )}
                    </div>
                    {dev.site && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Site / POP:</span>
                        <span className="text-slate-200 text-right truncate max-w-[170px]" title={dev.site}>
                          {dev.site}
                        </span>
                      </div>
                    )}
                    {dev.city && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Cidade:</span>
                        <span className="text-slate-300 text-right truncate max-w-[170px]" title={dev.city}>
                          {dev.city}
                        </span>
                      </div>
                    )}
                    {dev.latitude != null && dev.longitude != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-slate-500">Coordenadas:</span>
                        <span className="font-mono text-[11px] text-[#93B4E6]" title={`${dev.latitude}, ${dev.longitude}`}>
                          {dev.latitude.toFixed(4)}, {dev.longitude.toFixed(4)}
                        </span>
                      </div>
                    )}
                    {auditResults[dev.id] && (
                      <div className="flex items-center justify-between pt-1 border-t border-[#242836]">
                        <span className="text-slate-500">Padrão NetPulse:</span>
                        {auditResults[dev.id].is_manageable ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#2E9E6B]">
                            <CheckCircle2 className="h-3 w-3" /> Conforme ({auditResults[dev.id].overall_score}%)
                          </span>
                        ) : auditResults[dev.id].overall_status === 'failed' ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D9534F]">
                            <XCircle className="h-3 w-3" /> Falha ({auditResults[dev.id].overall_score}%)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-[#D99B26]">
                            <AlertCircle className="h-3 w-3" /> Requer Ajuste ({auditResults[dev.id].overall_score}%)
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Test Feedback banner if available */}
                  {testResult && (
                    <div
                      className={`mb-4 p-2.5 rounded-lg text-xs border ${
                        testResult.success
                          ? 'bg-[#161922] border-[#2E9E6B]/40 text-[#2E9E6B]'
                          : 'bg-[#161922] border-[#D9534F]/40 text-[#D9534F]'
                      }`}
                    >
                      <div className="flex items-center justify-between font-medium">
                        <span>{testResult.success ? 'Conexão SSH OK' : 'Falha SSH'}</span>
                        {testResult.latency_ms > 0 && (
                          <span className="font-mono">{testResult.latency_ms.toFixed(1)} ms</span>
                        )}
                      </div>
                      {testResult.banner && (
                        <div className="text-[10px] text-slate-400 truncate mt-0.5">
                          {testResult.banner}
                        </div>
                      )}
                      {testResult.error && (
                        <div className="text-[11px] text-[#D9534F] break-words mt-0.5">
                          {testResult.error}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer Actions */}
                <div className="pt-3 border-t border-[#242836] flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <button
                      onClick={() => handleTestSSH(dev)}
                      disabled={isTesting}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#1E2330] hover:bg-[#282F40] text-slate-200 text-xs rounded-lg font-medium border border-[#2D3345] cursor-pointer disabled:opacity-50"
                      title="Testar Conexão SSH"
                    >
                      <ShieldCheck className={`h-3.5 w-3.5 ${isTesting ? 'animate-spin text-[#4A72B2]' : 'text-slate-400'}`} />
                      <span>{isTesting ? 'Testando...' : 'Testar SSH'}</span>
                    </button>

                    <button
                      onClick={() => handleAuditDevice(dev.id)}
                      disabled={auditingId === dev.id}
                      className="flex items-center gap-1.5 px-2.5 py-1.5 bg-[#25334D] hover:bg-[#2F4163] text-blue-200 text-xs rounded-lg font-medium border border-[#3B5B8C]/40 cursor-pointer disabled:opacity-50 transition-colors"
                      title="Auditar e verificar se a configuração do equipamento está no padrão pré-definido"
                    >
                      <Layers className={`h-3.5 w-3.5 ${auditingId === dev.id ? 'animate-spin text-[#93B4E6]' : 'text-[#93B4E6]'}`} />
                      <span>{auditingId === dev.id ? 'Auditando...' : 'Auditar Padrão'}</span>
                    </button>

                    {onSelectDeviceForTerminal && (
                      <button
                        onClick={() => onSelectDeviceForTerminal(dev)}
                        className="p-1.5 bg-[#1E2330] hover:bg-[#282F40] text-slate-300 hover:text-white text-xs rounded-lg border border-[#2D3345] cursor-pointer"
                        title="Abrir no Terminal SSH"
                      >
                        <Terminal className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {onSelectDeviceForBGP && (
                      <button
                        onClick={() => onSelectDeviceForBGP(dev)}
                        className="p-1.5 bg-[#1E2330] hover:bg-[#282F40] text-slate-300 hover:text-white text-xs rounded-lg border border-[#2D3345] cursor-pointer"
                        title="Ver Sessões BGP"
                      >
                        <Activity className="h-3.5 w-3.5" />
                      </button>
                    )}

                    {dev.is_bgp && !isMaster && (
                      <button
                        type="button"
                        onClick={() => setBGPMasterDeviceId(dev.id)}
                        className="flex items-center gap-1 px-2.5 py-1.5 bg-[#1E2330] hover:bg-[#282F40] text-slate-300 hover:text-[#E5A93C] text-xs rounded-lg border border-[#2D3345] cursor-pointer transition"
                        title="Definir este roteador como o BGP Master / Controlador Principal da Rede"
                      >
                        <Crown className="h-3.5 w-3.5 text-[#E5A93C]" />
                        <span className="text-[11px] font-medium hidden sm:inline">Definir Master</span>
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => openEditModal(dev)}
                      className="p-1.5 text-slate-400 hover:text-slate-200 cursor-pointer hover:bg-[#1E2330] rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(dev.id, dev.name)}
                      className="p-1.5 text-slate-400 hover:text-rose-400 cursor-pointer hover:bg-[#1E2330] rounded-lg transition-colors"
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

              {/* Papel no Backbone */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-slate-300">
                  Papel no Backbone *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {ROLE_OPTIONS.map((r) => (
                    <button
                      key={r.id}
                      type="button"
                      onClick={() => {
                        setFormDeviceRole(r.id)
                        if (r.id === 'bgp') {
                          setFormIsBGP(true)
                        } else if (!editingDevice) {
                          setFormIsBGP(false)
                          setFormIsMaster(false)
                        }
                      }}
                      className={`p-2.5 rounded-xl border text-left transition cursor-pointer flex flex-col gap-0.5 ${
                        formDeviceRole === r.id
                          ? 'bg-[#25334D] border-[#3B5B8C] text-white ring-1 ring-[#3B5B8C]'
                          : 'bg-slate-950/70 border-slate-700 text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs">{r.badge}</span>
                        {formDeviceRole === r.id && (
                          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400"></span>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 leading-tight truncate">
                        {r.label}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

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

              {/* Localização no Mapa do Backbone */}
              <div className="p-3.5 bg-slate-950/80 border border-slate-800 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-[#4A72B2]" />
                    <label className="text-xs font-semibold text-slate-200">
                      Localização no Mapa do Backbone
                    </label>
                  </div>
                  <button
                    type="button"
                    onClick={handleCaptureLocation}
                    className="text-[11px] text-[#93B4E6] hover:text-white flex items-center gap-1 cursor-pointer bg-[#25334D] hover:bg-[#3B5B8C] px-2 py-0.5 rounded-lg border border-[#3B5B8C]/40 transition"
                    title="Capturar coordenadas GPS atuais"
                  >
                    <Locate className="h-3 w-3" />
                    <span>Usar Meu GPS</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Site / POP (Opcional)</label>
                    <input
                      type="text"
                      value={formSite}
                      onChange={(e) => setFormSite(e.target.value)}
                      placeholder="ex: POP Castanhal Central, DC Matriz"
                      className="w-full px-3 py-1.5 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Cidade / UF (Opcional)</label>
                    <input
                      type="text"
                      value={formCity}
                      onChange={(e) => setFormCity(e.target.value)}
                      placeholder="ex: Castanhal - PA"
                      className="w-full px-3 py-1.5 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Latitude</label>
                    <input
                      type="number"
                      step="any"
                      value={formLatitude}
                      onChange={(e) => setFormLatitude(e.target.value)}
                      placeholder="ex: -1.2974"
                      className="w-full px-3 py-1.5 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Longitude</label>
                    <input
                      type="number"
                      step="any"
                      value={formLongitude}
                      onChange={(e) => setFormLongitude(e.target.value)}
                      placeholder="ex: -47.9205"
                      className="w-full px-3 py-1.5 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 font-mono"
                    />
                  </div>
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
                  onChange={(e) => {
                    setFormIsBGP(e.target.checked)
                    if (!e.target.checked) setFormIsMaster(false)
                  }}
                  className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-purple-600 focus:ring-purple-500 cursor-pointer"
                />
              </div>

              {/* BGP Master Controller Flag */}
              {formIsBGP && (
                <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-lg flex items-start justify-between gap-3 animate-in fade-in duration-150">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2">
                      <Crown className="h-4 w-4 text-amber-400" />
                      <label htmlFor="isMasterCheckbox" className="text-xs font-semibold text-slate-200 cursor-pointer">
                        Roteador BGP Master / Controlador Principal
                      </label>
                    </div>
                    <p className="text-[11px] text-slate-400">
                      Define este equipamento como o controlador central de políticas BGP. Todas as alterações de Prepend e comunidades de export serão tratadas nele (ex: <code>BGP-RT.01.PA.PIRB.01</code>).
                    </p>
                  </div>
                  <input
                    id="isMasterCheckbox"
                    type="checkbox"
                    checked={formIsMaster}
                    onChange={(e) => setFormIsMaster(e.target.checked)}
                    className="mt-1 h-4 w-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500 cursor-pointer"
                  />
                </div>
              )}

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

      {/* Configuration Compliance Audit Modal */}
      <DeviceComplianceModal
        audit={selectedAudit}
        isOpen={isAuditModalOpen}
        onClose={() => setIsAuditModalOpen(false)}
        onReAudit={handleAuditDevice}
        isReAuditing={auditingId === selectedAudit?.device_id}
      />
    </div>
  )
}
