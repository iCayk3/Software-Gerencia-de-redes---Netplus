import React, { useState, useEffect } from 'react'
import {
  ArrowUpDown,
  Upload,
  Download,
  Plus,
  Trash2,
  RefreshCw,
  Search,
  Server,
  Route as RouteIcon,
  X,
  ShieldCheck,
  Globe,
  Moon,
  Edit3,
  Image as ImageIcon,
  Network,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  LayoutGrid,
  Table as TableIcon,
  UploadCloud,
  Check,
  Zap,
  SlidersHorizontal,
  Copy,
  AlertTriangle,
  Clock,
  ShieldAlert,
  Camera,
  Sliders,
  Layers,
  Lock,
  CheckCircle,
  HelpCircle
} from 'lucide-react'
import {
  fetchDevices,
  fetchDevicePrepends,
  fetchAllPrepends,
  fetchTrafficStatus,
  fetchUploadOverview,
  createStaticRoute,
  deleteStaticRoute,
  updateASMetadata,
  uploadASImage,
  fetchTrafficProfiles,
  deleteTrafficProfile,
  captureCurrentProfile,
  diffTrafficProfile,
  applyTrafficProfile,
  sanitizeText,
  type Device,
  type StaticRoute,
  type StaticRouteRequest,
  type DevicePrependOverview,
  type PrefixPrependState,
  type ASPrependGroup,
  type BGPPeerPrepend,
  type TrafficSyncStatus,
  type BGPASSection,
  type UploadOverviewResponse,
  type ASMetadata,
  type TrafficProfile,
  type ProfileTag,
  type ProfileDiffResponse,
  type ApplyProfileResult
} from '../services/api'
import { CardSkeleton } from './common/Skeleton'
import { useAuth } from '../context/AuthContext'

export interface TrafficManagerProps {
  activeSubTab?: 'upload' | 'download'
  onSubTabChange?: (tab: 'upload' | 'download') => void
  hideInternalSubTabs?: boolean
  density?: 'comfortable' | 'compact'
}

export const TrafficManager: React.FC<TrafficManagerProps> = ({
  activeSubTab: externalSubTab,
  onSubTabChange,
  hideInternalSubTabs = false,
  density = 'comfortable',
}) => {
  const { canOperate } = useAuth()
  const [internalSubTab, setInternalSubTab] = useState<'upload' | 'download'>('download')
  const activeSubTab = externalSubTab || internalSubTab
  const setActiveSubTab = (tab: 'upload' | 'download') => {
    setInternalSubTab(tab)
    if (onSubTabChange) onSubTabChange(tab)
  }
  const [devices, setDevices] = useState<Device[]>([])

  // --- Upload State (Intelligent AS Sections & Rotas Estáticas) ---
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('all')
  const [uploadOverview, setUploadOverview] = useState<UploadOverviewResponse | null>(null)
  const [uploadViewMode, setUploadViewMode] = useState<'cards' | 'table'>('cards')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')

  // Add Route Modal State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [targetSection, setTargetSection] = useState<BGPASSection | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [modalError, setModalError] = useState<string | null>(null)
  const [formDevice, setFormDevice] = useState<string>('')
  const [formDest, setFormDest] = useState<string>('0.0.0.0/0')
  const [formNextHop, setFormNextHop] = useState<string>('')
  const [formPref, setFormPref] = useState<string>('60')
  const [formDesc, setFormDesc] = useState<string>('')
  const [deletingId, setDeletingId] = useState<string | null>(null)

  // Delete Route Modal State (Manual Safe Mode)
  const [isDeleteRouteModalOpen, setIsDeleteRouteModalOpen] = useState(false)
  const [routeToDelete, setRouteToDelete] = useState<StaticRoute | null>(null)
  const [deleteRouteSuccessMsg, setDeleteRouteSuccessMsg] = useState<string | null>(null)
  const [addRouteSuccessMsg, setAddRouteSuccessMsg] = useState<string | null>(null)

  // AS Customizer Modal State (Alias & Logo Upload)
  const [isASModalOpen, setIsASModalOpen] = useState(false)
  const [customizingSection, setCustomizingSection] = useState<BGPASSection | null>(null)
  const [asFormAlias, setAsFormAlias] = useState('')
  const [asFormRole, setAsFormRole] = useState('transit_primary')
  const [asFormDescription, setAsFormDescription] = useState('')
  const [asFormImageUrl, setAsFormImageUrl] = useState('')
  const [asImageFile, setAsImageFile] = useState<File | null>(null)
  const [asImagePreview, setAsImagePreview] = useState<string | null>(null)
  const [asSaving, setAsSaving] = useState(false)
  const [asModalError, setAsModalError] = useState<string | null>(null)

  // Local-Preference Modal State (Upload Traffic Engineering)
  const [isLocalPrefModalOpen, setIsLocalPrefModalOpen] = useState(false)
  const [localPrefSection, setLocalPrefSection] = useState<BGPASSection | null>(null)
  const [targetLocalPref, setTargetLocalPref] = useState<number>(100)
  const [localPrefError, setLocalPrefError] = useState<string | null>(null)

  // --- Download State (AS-Path Prepending) ---
  const [selectedPrependDevice, setSelectedPrependDevice] = useState<string>('all')
  const [prependOverview, setPrependOverview] = useState<DevicePrependOverview | null>(null)
  const [prependsLoading, setPrependsLoading] = useState(false)
  const [prependsError, setPrependsError] = useState<string | null>(null)
  const [prependSearch, setPrependSearch] = useState('')
  const [downloadViewMode, setDownloadViewMode] = useState<'cards' | 'table'>('cards')
  const [expandedPeerGroup, setExpandedPeerGroup] = useState<string | null>(null)
  const [expandedPrefixGroups, setExpandedPrefixGroups] = useState<Record<string, boolean>>({})

  const togglePrefixGroup = (groupId: string) => {
    setExpandedPrefixGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }))
  }

  const [expandedUploadGroups, setExpandedUploadGroups] = useState<Record<string, boolean>>({})

  const toggleUploadGroup = (groupId: string) => {
    setExpandedUploadGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }))
  }

  const [showDownloadHelp, setShowDownloadHelp] = useState(false)

  // --- Download Prepend Modal State ---
  const [isPrependModalOpen, setIsPrependModalOpen] = useState(false)
  const [targetPrependPrefix, setTargetPrependPrefix] = useState<PrefixPrependState | null>(null)
  const [targetPrependGroup, setTargetPrependGroup] = useState<ASPrependGroup | null>(null)
  const [cliTargetRouter, setCliTargetRouter] = useState<string>('all')
  const [prependCountChoice, setPrependCountChoice] = useState<number>(0)
  const [isBlockChoice, setIsBlockChoice] = useState<boolean>(false)
  const [prependModalError, setPrependModalError] = useState<string | null>(null)
  const [prependSuccessMsg, setPrependSuccessMsg] = useState<string | null>(null)

  // --- Scheduler / Cache State ---
  const [syncStatus, setSyncStatus] = useState<TrafficSyncStatus | null>(null)

  // --- Traffic Engineering Profiles & Contingency Scenarios State ---
  const [profiles, setProfiles] = useState<TrafficProfile[]>([])
  const [profilesLoading, setProfilesLoading] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')
  const [activeProfile, setActiveProfile] = useState<TrafficProfile | null>(null)

  // Capture Modal State
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false)
  const [captureName, setCaptureName] = useState('')
  const [captureDesc, setCaptureDesc] = useState('')
  const [captureTag, setCaptureTag] = useState<ProfileTag>('custom')
  const [captureColor, setCaptureColor] = useState('cyan')
  const [capturing, setCapturing] = useState(false)
  const [captureError, setCaptureError] = useState<string | null>(null)

  // Diff & Staging Modal State
  const [isDiffModalOpen, setIsDiffModalOpen] = useState(false)
  const [diffProfile, setDiffProfile] = useState<TrafficProfile | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffData, setDiffData] = useState<ProfileDiffResponse | null>(null)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [selectedDiffDevice, setSelectedDiffDevice] = useState<string>('all')
  const [diffModalTab, setDiffModalTab] = useState<'diff' | 'scripts'>('diff')
  const [applyingProfile, setApplyingProfile] = useState(false)
  const [applyResult, setApplyResult] = useState<ApplyProfileResult | null>(null)

  // Manage Profiles Modal State
  const [isManageModalOpen, setIsManageModalOpen] = useState(false)
  const [profileActionMsg, setProfileActionMsg] = useState<string | null>(null)
  const [deletingProfileId, setDeletingProfileId] = useState<string | null>(null)

  useEffect(() => {
    loadInitialData()
  }, [])

  const loadProfiles = async () => {
    setProfilesLoading(true)
    try {
      const data = await fetchTrafficProfiles()
      setProfiles(data)
      const currentActive = data.find(p => p.is_active) || null
      setActiveProfile(currentActive)
      if (data.length > 0) {
        setSelectedProfileId(prev => (prev ? prev : (currentActive?.id || data[0].id)))
      }
    } catch (err: any) {
      console.error('Erro ao carregar perfis de tráfego:', err)
    } finally {
      setProfilesLoading(false)
    }
  }

  const loadInitialData = async () => {
    try {
      const [devs, st] = await Promise.all([
        fetchDevices(),
        fetchTrafficStatus().catch(() => null)
      ])
      setDevices(devs)
      if (st) setSyncStatus(st)
      if (devs.length > 0) {
        if (!formDevice) setFormDevice(devs[0].id)
      }
    } catch {
      // ignore
    }
    loadPrepends('all')
    loadOverview('all')
    loadProfiles()
  }

  // --- Profile Operations Handlers ---
  const handleOpenCapture = () => {
    if (!canOperate) {
      alert('Operação restrita: Apenas Administrador e Operador NOC podem salvar perfis.')
      return
    }
    const today = new Date().toLocaleDateString('pt-BR')
    setCaptureName(`Cenário Customizado (${today})`)
    setCaptureDesc('Snapshot do estado atual de prepends, local-preferences e rotas estáticas')
    setCaptureTag('custom')
    setCaptureColor('cyan')
    setCaptureError(null)
    setIsCaptureModalOpen(true)
  }

  const handleSaveCapture = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!captureName.trim()) {
      setCaptureError('O nome do perfil é obrigatório')
      return
    }
    setCapturing(true)
    setCaptureError(null)
    try {
      const created = await captureCurrentProfile({
        name: captureName.trim(),
        description: captureDesc.trim(),
        tag: captureTag,
        color: captureColor,
      })
      await loadProfiles()
      setSelectedProfileId(created.id)
      setIsCaptureModalOpen(false)
      setProfileActionMsg(`Perfil "${created.name}" capturado e salvo com sucesso!`)
      setTimeout(() => setProfileActionMsg(null), 5000)
    } catch (err: any) {
      setCaptureError(err.message || 'Erro ao salvar perfil atual')
    } finally {
      setCapturing(false)
    }
  }

  const handleOpenDiff = async (profile: TrafficProfile) => {
    setDiffProfile(profile)
    setDiffData(null)
    setDiffError(null)
    setApplyResult(null)
    setDiffModalTab('diff')
    setSelectedDiffDevice('all')
    setIsDiffModalOpen(true)
    setDiffLoading(true)

    try {
      const result = await diffTrafficProfile(profile.id)
      setDiffData(result)
    } catch (err: any) {
      setDiffError(err.message || 'Erro ao calcular diferenças do perfil')
    } finally {
      setDiffLoading(false)
    }
  }

  const handleApplyProfile = async (profileId: string) => {
    if (!canOperate) {
      alert('Operação restrita: Apenas Administrador e Operador NOC podem ativar perfis.')
      return
    }
    setApplyingProfile(true)
    setDiffError(null)
    try {
      const res = await applyTrafficProfile(profileId)
      setApplyResult(res)
      await loadProfiles()
      setDiffModalTab('scripts')
      setProfileActionMsg(`Cenário "${res.profile_name}" ativado com sucesso no sistema!`)
      setTimeout(() => setProfileActionMsg(null), 6000)
    } catch (err: any) {
      setDiffError(err.message || 'Erro ao ativar perfil')
    } finally {
      setApplyingProfile(false)
    }
  }

  const handleDeleteProfile = async (id: string, name: string) => {
    if (!canOperate) {
      alert('Operação restrita: Apenas Administrador e Operador NOC podem excluir perfis.')
      return
    }
    if (!confirm(`Deseja realmente excluir o perfil "${name}"? Esta ação não pode ser desfeita.`)) {
      return
    }
    setDeletingProfileId(id)
    try {
      await deleteTrafficProfile(id)
      await loadProfiles()
      setProfileActionMsg(`Perfil "${name}" excluído com sucesso.`)
      setTimeout(() => setProfileActionMsg(null), 4000)
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir perfil')
    } finally {
      setDeletingProfileId(null)
    }
  }

  const getProfileTagBadge = (tag: ProfileTag) => {
    switch (tag) {
      case 'normal':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
            Nominal
          </span>
        )
      case 'contingency':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800">
            Contingência
          </span>
        )
      case 'maintenance':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800">
            Manutenção
          </span>
        )
      case 'peak':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800">
            Pico / ECMP
          </span>
        )
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800">
            Custom
          </span>
        )
    }
  }

  const formatProfileTag = (tag: ProfileTag) => {
    switch (tag) {
      case 'normal': return 'Operação Nominal'
      case 'contingency': return 'Contingência'
      case 'maintenance': return 'Manutenção'
      case 'peak': return 'Pico / ECMP'
      default: return 'Personalizado'
    }
  }


  // --- Upload Overview Handlers ---
  const loadOverview = async (devId: string, fresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchUploadOverview(devId, fresh)
      setUploadOverview(data)
      fetchTrafficStatus().then(st => st && setSyncStatus(st)).catch(() => {})
    } catch (err: any) {
      setError(err.message || 'Erro ao consultar engenharia de tráfego de upload')
    } finally {
      setLoading(false)
    }
  }

  const handleDeviceChange = (devId: string) => {
    setSelectedDeviceId(devId)
    loadOverview(devId)
  }

  // --- Add Route Modal Triggers ---
  const openAddRouteForSection = (section: BGPASSection) => {
    if (!canOperate) {
      alert('Operação restrita: Apenas Administrador e Operador NOC podem adicionar rotas estáticas.')
      return
    }
    setTargetSection(section)
    setFormDevice(section.device_id)
    setFormNextHop(section.metadata.custom_gateway || section.peer_ip)
    setFormDest('0.0.0.0/0')
    setFormPref('60')
    const aliasTag = section.metadata.alias ? section.metadata.alias.replace(/\s+/g, '-') : section.peer_name
    setFormDesc(`TE-UPLOAD-AS${section.remote_as}-${aliasTag}`)
    setModalError(null)
    setIsAddModalOpen(true)
  }

  const openAddRouteGeneric = () => {
    if (!canOperate) {
      alert('Operação restrita: Apenas Administrador e Operador NOC podem adicionar rotas estáticas.')
      return
    }
    setTargetSection(null)
    if (devices.length > 0 && !formDevice) {
      setFormDevice(devices[0].id)
    }
    setFormDest('0.0.0.0/0')
    setFormNextHop('')
    setFormPref('60')
    setFormDesc('TE-UPLOAD-ROTA-ESTATICA')
    setModalError(null)
    setIsAddModalOpen(true)
  }

  const handleAddRoute = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!formDevice) {
      setModalError('Selecione um equipamento')
      return
    }
    if (!formDest || !formNextHop) {
      setModalError('Destino e Próximo Salto são obrigatórios')
      return
    }

    setSubmitting(true)
    setModalError(null)
    try {
      const payload: StaticRouteRequest = {
        destination: formDest.trim(),
        next_hop: formNextHop.trim(),
        preference: parseInt(formPref, 10) || 60,
        description: formDesc.trim(),
      }

      // Copy commands to clipboard immediately
      const cliCode = getStaticRouteCliPreview()
      handleCopyToClipboard(cliCode, 'add_route')

      // Record in audit log (Manual Dispatch mode)
      const res = await createStaticRoute(formDevice, payload)
      setAddRouteSuccessMsg(res.message || 'Comandos copiados com sucesso! Operação registrada na auditoria.')
      setTimeout(() => {
        setIsAddModalOpen(false)
        setAddRouteSuccessMsg(null)
        loadOverview(selectedDeviceId, true)
      }, 1800)
    } catch (err: any) {
      setModalError(err.message || 'Erro ao registrar rota estática no sistema')
    } finally {
      setSubmitting(false)
    }
  }

  const openDeleteRouteModal = (route: StaticRoute) => {
    if (!canOperate) {
      alert('Operação restrita: Apenas Administrador e Operador NOC podem excluir rotas estáticas.')
      return
    }
    setRouteToDelete(route)
    setDeleteRouteSuccessMsg(null)
    setIsDeleteRouteModalOpen(true)
  }

  const handleConfirmDeleteRoute = async () => {
    if (!routeToDelete) return
    setDeletingId(routeToDelete.id)
    try {
      const cliCode = getDeleteStaticRouteCliPreview(routeToDelete)
      handleCopyToClipboard(cliCode, 'delete_route')

      const res = await deleteStaticRoute(routeToDelete.device_id, routeToDelete.destination, routeToDelete.next_hop)
      setDeleteRouteSuccessMsg(res.message || 'Comando de remoção copiado! Cole no terminal SSH do host.')
      setTimeout(() => {
        setIsDeleteRouteModalOpen(false)
        setRouteToDelete(null)
        setDeleteRouteSuccessMsg(null)
        loadOverview(selectedDeviceId, true)
      }, 1800)
    } catch (err: any) {
      alert(err.message || 'Erro ao registrar remoção da rota')
    } finally {
      setDeletingId(null)
    }
  }

  // --- AS Customization Handlers (Alias & Logo) ---
  const openCustomizeASModal = (section: BGPASSection) => {
    setCustomizingSection(section)
    setAsFormAlias(section.metadata.alias || section.peer_name)
    setAsFormRole(section.metadata.role || 'transit_primary')
    setAsFormDescription(section.metadata.description || '')
    setAsFormImageUrl(section.metadata.image_url || '')
    setAsImageFile(null)

    if (section.metadata.image_url) {
      const fullUrl = section.metadata.image_url.startsWith('http') || section.metadata.image_url.startsWith('data:')
        ? section.metadata.image_url
        : `http://localhost:8080${section.metadata.image_url}`
      setAsImagePreview(fullUrl)
    } else {
      setAsImagePreview(null)
    }

    setAsModalError(null)
    setIsASModalOpen(true)
  }

  const handleImageFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0]
      setAsImageFile(file)
      const reader = new FileReader()
      reader.onload = () => {
        setAsImagePreview(reader.result as string)
      }
      reader.readAsDataURL(file)
    }
  }

  const handleSaveASMetadata = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!customizingSection) return

    setAsSaving(true)
    setAsModalError(null)
    try {
      let finalImageUrl = asFormImageUrl

      if (asImageFile) {
        const uploadRes = await uploadASImage(customizingSection.remote_as, asImageFile)
        finalImageUrl = uploadRes.image_url
      }

      await updateASMetadata({
        asn: customizingSection.remote_as,
        alias: asFormAlias.trim(),
        role: asFormRole,
        description: asFormDescription.trim(),
        image_url: finalImageUrl,
      })

      setIsASModalOpen(false)
      loadOverview(selectedDeviceId, false)
    } catch (err: any) {
      setAsModalError(err.message || 'Erro ao salvar personalização do AS')
    } finally {
      setAsSaving(false)
    }
  }

  // --- Local-Preference Handlers (Upload) ---
  const openLocalPrefModal = (section: BGPASSection) => {
    if (!canOperate) {
      alert('Operação restrita: Apenas Administrador e Operador NOC podem alterar Local-Preference.')
      return
    }
    setLocalPrefSection(section)
    setTargetLocalPref(section.local_pref || 100)
    setLocalPrefError(null)
    setIsLocalPrefModalOpen(true)
  }

  /*
   * NOTA: Os métodos handleSaveLocalPref e handleApplyPrependSubmit estão reservados
   * para quando o usuário autorizar a execução direta/automatizada via API no futuro.
   * Atualmente, o software opera em MODO MANUAL SEGURO (apenas gera comandos CLI).
   */

  // --- Download / Prepend Handlers ---
  const loadPrepends = async (devId: string, fresh = false) => {
    setPrependsLoading(true)
    setPrependsError(null)
    try {
      if (devId === 'all') {
        const overviews = (await fetchAllPrepends(fresh)) || []
        const allPeers: BGPPeerPrepend[] = []
        const allPrefixes: PrefixPrependState[] = []
        const allGroups: ASPrependGroup[] = []
        let localAs = ''
        for (const ov of overviews) {
          if (ov.peers) allPeers.push(...ov.peers)
          if (ov.prefixes) allPrefixes.push(...ov.prefixes)
          if (ov.as_groups) allGroups.push(...ov.as_groups)
          if (ov.local_as && !localAs) localAs = ov.local_as
        }
        setPrependOverview({
          device_id: 'all',
          device_name: 'Todos os Links da Rede',
          local_as: localAs,
          peers: allPeers,
          prefixes: allPrefixes,
          as_groups: allGroups,
        })
      } else {
        const data = await fetchDevicePrepends(devId, fresh)
        setPrependOverview(data)
      }
      fetchTrafficStatus().then(st => st && setSyncStatus(st)).catch(() => {})
    } catch (err: any) {
      setPrependsError(err.message || 'Erro ao consultar prepends BGP da rede')
      setPrependOverview(null)
    } finally {
      setPrependsLoading(false)
    }
  }

  const handlePrependDeviceChange = (devId: string) => {
    setSelectedPrependDevice(devId)
    loadPrepends(devId)
  }

  const openPrependModal = (prefixState: PrefixPrependState, group?: ASPrependGroup) => {
    if (!canOperate) {
      alert('Operação restrita: Apenas Administrador e Operador NOC podem alterar prepends BGP.')
      return
    }
    setTargetPrependPrefix(prefixState)
    setTargetPrependGroup(group || null)
    setPrependCountChoice(prefixState.prepend_count)
    setIsBlockChoice(prefixState.is_blocked)
    setPrependModalError(null)
    setPrependSuccessMsg(null)
    const targetDevId = group?.device_id || prefixState.device_id || (selectedPrependDevice !== 'all' ? selectedPrependDevice : 'all')
    setCliTargetRouter(targetDevId)
    setIsPrependModalOpen(true)
  }

  const renderGroupRoleBadge = (role: string) => {
    switch (role) {
      case 'transit_primary':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-950/80 text-blue-300 border border-blue-800">
            Trânsito Primário
          </span>
        )
      case 'transit_secondary':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800">
            Trânsito Secundário
          </span>
        )
      case 'ix_ptt':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800">
            IX / PTT
          </span>
        )
      case 'peering':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
            Peering Privado
          </span>
        )
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
            BGP Peer
          </span>
        )
    }
  }

  // Clipboard copy state and helper
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const handleCopyToClipboard = (text: string, key: string) => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(text)
    } else {
      const el = document.createElement('textarea')
      el.value = text
      document.body.appendChild(el)
      el.select()
      document.execCommand('copy')
      document.body.removeChild(el)
    }
    setCopiedKey(key)
    setTimeout(() => setCopiedKey(null), 3000)
  }

  const cidrToNetmask = (prefix: number): string => {
    if (prefix <= 0) return '0.0.0.0'
    if (prefix >= 32) return '255.255.255.255'
    const mask = (0xffffffff << (32 - prefix)) >>> 0
    return [
      (mask >>> 24) & 255,
      (mask >>> 16) & 255,
      (mask >>> 8) & 255,
      mask & 255,
    ].join('.')
  }

  const getStaticRouteCliPreview = () => {
    const dev = devices.find(d => d.id === formDevice)
    const vendor = (dev?.vendor || 'huawei').toLowerCase()
    const devName = dev?.name || 'Roteador'
    const devHost = dev?.host || ''
    const dest = formDest.trim() || '0.0.0.0/0'
    const gateway = formNextHop.trim() || '<gateway>'
    const pref = parseInt(formPref, 10) || 60
    const desc = formDesc.trim()

    if (vendor === 'huawei') {
      let ip = dest
      let mask = '255.255.255.255'
      if (dest.includes('/')) {
        const parts = dest.split('/')
        ip = parts[0]
        if (parts[1] === '0') {
          ip = '0.0.0.0'
          mask = '0.0.0.0'
        } else {
          const cidr = parseInt(parts[1], 10)
          if (!isNaN(cidr) && cidr >= 0 && cidr <= 32) {
            mask = cidrToNetmask(cidr)
          }
        }
      }
      let cmd = `ip route-static ${ip} ${mask} ${gateway}`
      if (pref > 0) cmd += ` preference ${pref}`
      if (desc) cmd += ` description ${desc}`

      return [
        `# [${devName}] ${devHost} (Huawei VRP)`,
        'system-view',
        cmd,
        'commit',
        'return',
      ].join('\n')
    } else if (vendor === 'mikrotik_v7') {
      let cmd = `/ip/route/add dst-address=${dest} gateway=${gateway}`
      if (pref > 0) cmd += ` distance=${pref}`
      if (desc) cmd += ` comment="${desc}"`
      return [
        `# [${devName}] ${devHost} (MikroTik RouterOS v7)`,
        cmd,
      ].join('\n')
    } else if (vendor === 'mikrotik_v6' || vendor.startsWith('mikrotik')) {
      let cmd = `/ip route add dst-address=${dest} gateway=${gateway}`
      if (pref > 0) cmd += ` distance=${pref}`
      if (desc) cmd += ` comment="${desc}"`
      return [
        `# [${devName}] ${devHost} (MikroTik RouterOS v6)`,
        cmd,
      ].join('\n')
    } else if (vendor === 'datacom') {
      let cmd = `ip route ${dest} ${gateway}`
      if (pref > 0) cmd += ` ${pref}`
      return [
        `# [${devName}] ${devHost} (Datacom DmOS)`,
        'configure terminal',
        cmd,
        'exit',
      ].join('\n')
    }

    return `ip route-static ${dest} ${gateway} preference ${pref}`
  }

  const getDeleteStaticRouteCliPreview = (route: StaticRoute | null) => {
    if (!route) return ''
    const dev = devices.find(d => d.id === route.device_id)
    const vendor = (dev?.vendor || 'huawei').toLowerCase()
    const devName = dev?.name || route.device_name || 'Roteador'
    const devHost = dev?.host || ''
    const dest = route.destination
    const gateway = route.next_hop

    if (vendor === 'huawei') {
      let ip = dest
      let mask = '255.255.255.255'
      if (dest.includes('/')) {
        const parts = dest.split('/')
        ip = parts[0]
        if (parts[1] === '0') {
          ip = '0.0.0.0'
          mask = '0.0.0.0'
        } else {
          const cidr = parseInt(parts[1], 10)
          if (!isNaN(cidr) && cidr >= 0 && cidr <= 32) {
            mask = cidrToNetmask(cidr)
          }
        }
      }
      return [
        `# [${devName}] ${devHost} (Huawei VRP)`,
        'system-view',
        `undo ip route-static ${ip} ${mask} ${gateway}`,
        'commit',
        'return',
      ].join('\n')
    } else if (vendor === 'mikrotik_v7') {
      return [
        `# [${devName}] ${devHost} (MikroTik RouterOS v7)`,
        `/ip/route/remove [find dst-address="${dest}" and gateway="${gateway}"]`,
      ].join('\n')
    } else if (vendor === 'mikrotik_v6' || vendor.startsWith('mikrotik')) {
      return [
        `# [${devName}] ${devHost} (MikroTik RouterOS v6)`,
        `/ip route remove [find dst-address="${dest}" and gateway="${gateway}"]`,
      ].join('\n')
    } else if (vendor === 'datacom') {
      return [
        `# [${devName}] ${devHost} (Datacom DmOS)`,
        'configure terminal',
        `no ip route ${dest} ${gateway}`,
        'exit',
      ].join('\n')
    }

    return `undo ip route-static ${dest} ${gateway}`
  }

  const getLocalPrefCliPreview = () => {
    if (!localPrefSection) return ''
    const vendor = (localPrefSection.device_vendor || '').toLowerCase()
    const devName = localPrefSection.device_name || 'Roteador'
    const devHost = localPrefSection.device_host || ''
    const peerIp = localPrefSection.peer_ip
    const policyName = localPrefSection.import_policy || `RP-IN-${peerIp}`
    const node = localPrefSection.import_policy_node || 11

    if (vendor === 'huawei') {
      return [
        `# [${devName}] ${devHost} (Huawei VRP)`,
        'system-view',
        `route-policy ${policyName} permit node ${node}`,
        ` apply local-preference ${targetLocalPref}`,
        'commit',
        'return',
        `refresh bgp ${peerIp} import`,
      ].join('\n')
    } else if (vendor === 'mikrotik_v7') {
      return [
        `# [${devName}] ${devHost} (MikroTik RouterOS v7)`,
        `/routing/filter/rule/add chain=bgp-in rule="if (bgp-peer == ${peerIp}) { set bgp-local-pref ${targetLocalPref}; }"`,
        '/routing/bgp/connection/refresh',
      ].join('\n')
    } else if (vendor === 'mikrotik_v6' || vendor.startsWith('mikrotik')) {
      return [
        `# [${devName}] ${devHost} (MikroTik RouterOS v6)`,
        `/routing filter add chain=bgp-in peer="${peerIp}" set-bgp-local-pref=${targetLocalPref}`,
        '/routing bgp peer refresh-all',
      ].join('\n')
    } else if (vendor === 'datacom') {
      return [
        `# [${devName}] ${devHost} (Datacom DmOS)`,
        'configure terminal',
        'route-map RM-BGP-IN permit 10',
        ` set local-preference ${targetLocalPref}`,
        'exit',
      ].join('\n')
    }

    return [
      `# [${devName}] ${devHost}`,
      'system-view',
      `route-policy ${policyName} permit node ${node}`,
      ` apply local-preference ${targetLocalPref}`,
      'commit',
      'return',
      `refresh bgp ${peerIp} import`,
    ].join('\n')
  }

  const getPrependCliPreviewForDevice = (dev: Device) => {
    if (!targetPrependPrefix) return ''
    const isHuawei = dev.vendor === 'huawei'
    const isMikrotik = dev.vendor?.startsWith('mikrotik')

    if (isHuawei) {
      const pfx = targetPrependPrefix.prefix || ''
      let nodeNum = 10
      if (pfx.endsWith('/22')) nodeNum = 10
      else if (pfx.includes('.28.') && pfx.endsWith('/23')) nodeNum = 20
      else if (pfx.includes('.30.') && pfx.endsWith('/23')) nodeNum = 30
      else if (pfx.includes('.28.') && pfx.endsWith('/24')) nodeNum = 40
      else if (pfx.includes('.29.') && pfx.endsWith('/24')) nodeNum = 50
      else if (pfx.includes('.30.') && pfx.endsWith('/24')) nodeNum = 60
      else if (pfx.includes('.31.') && pfx.endsWith('/24')) nodeNum = 70

      let base = targetPrependGroup?.community_base || ''
      if (!base) {
        const peerNameLower = (targetPrependPrefix.peer_name || '').toLowerCase()
        const isWiki = peerNameLower.includes('wiki')
        const isSea = peerNameLower.includes('sea') || targetPrependPrefix.peer_ip.includes('170.82.')
        const isBel = peerNameLower.includes('bel') || peerNameLower.includes('belem')
        const isCe = peerNameLower.includes('ce') || peerNameLower.includes('fortaleza') || peerNameLower.includes('ceara')
        const isSp = peerNameLower.includes('sp') || peerNameLower.includes('sao paulo')
        const isBsb = peerNameLower.includes('ptt') || peerNameLower.includes('brasilia') || peerNameLower.includes('bsb')

        base = '2003'
        if (isWiki) base = '2002'
        else if (isSea) base = '2003'
        else if (isBel) base = '4500'
        else if (isCe) base = '4400'
        else if (isSp) base = '4100'
        else if (isBsb) base = '4000'
      }

      const newComm = isBlockChoice ? `0:${base}0` : `1:${base}${prependCountChoice}`

      let commLine = `apply community 267943:1000 ${newComm} 1:40000 1:41000 1:42000 1:43000 additive`
      if (targetPrependPrefix.community) {
        const raw = targetPrependPrefix.community.replace(/apply\s+community\s+/i, '').replace(/\s+additive/i, '').trim()
        const tokens = raw.split(/\s+/)
        let replaced = false
        const re = new RegExp(`^[01]:${base}\\d$`)
        const updated = tokens.map(t => {
          if (re.test(t)) {
            replaced = true
            return newComm
          }
          return t
        })
        if (!replaced) updated.push(newComm)
        commLine = `apply community ${updated.join(' ')} additive`
      }

      return [
        `# [${dev.name}] ${dev.host} (${dev.model || 'Huawei'})`,
        'system-view',
        `route-policy RP-TAG-V4-ORIGIN permit node ${nodeNum}`,
        commLine,
        'commit',
        'return',
        'refresh bgp all export',
      ].join('\n')
    }

    if (isMikrotik) {
      if (dev.vendor === 'mikrotik_v7') {
        if (isBlockChoice) {
          return [
            `# [${dev.name}] ${dev.host} (MikroTik RouterOS v7)`,
            `/routing/filter/rule/set [find where rule~"${targetPrependPrefix.prefix}"] rule="if (dst == ${targetPrependPrefix.prefix}) { reject; }"`,
            '/routing/bgp/connection/refresh',
          ].join('\n')
        }
        return [
          `# [${dev.name}] ${dev.host} (MikroTik RouterOS v7)`,
          `/routing/filter/rule/set [find where rule~"${targetPrependPrefix.prefix}"] rule="if (dst == ${targetPrependPrefix.prefix}) { set bgp-path.prepend ${prependCountChoice}; accept; }"`,
          '/routing/bgp/connection/refresh',
        ].join('\n')
      } else {
        if (isBlockChoice) {
          return [
            `# [${dev.name}] ${dev.host} (MikroTik RouterOS v6)`,
            `/routing filter set [find prefix="${targetPrependPrefix.prefix}"] action=discard`,
            '/routing bgp peer refresh-all',
          ].join('\n')
        }
        return [
          `# [${dev.name}] ${dev.host} (MikroTik RouterOS v6)`,
          `/routing filter set [find prefix="${targetPrependPrefix.prefix}"] action=accept set-bgp-prepend=${prependCountChoice}`,
          '/routing bgp peer refresh-all',
        ].join('\n')
      }
    }

    return `# [${dev.name}] Vendor não suportado diretamente para comandos CLI`
  }

  const getPrependCliPreview = () => {
    if (!targetPrependPrefix) return ''
    if (cliTargetRouter === 'all') {
      const bgpDevs = devices.filter(d => d.is_bgp !== false && (d.vendor === 'huawei' || d.vendor?.startsWith('mikrotik')))
      return bgpDevs.map(d => getPrependCliPreviewForDevice(d)).join('\n\n')
    }
    const currentDevice = devices.find(d => d.id === cliTargetRouter) ||
      (targetPrependGroup?.device_id ? devices.find(d => d.id === targetPrependGroup.device_id) : undefined) ||
      devices.find(d => d.id === targetPrependPrefix.device_id) ||
      devices.find(d => d.is_bgp !== false) ||
      devices[0]
    return currentDevice ? getPrependCliPreviewForDevice(currentDevice) : ''
  }

  // Filtered AS Sections
  const filteredSections = (uploadOverview?.sections || []).filter(sec => {
    const q = search.toLowerCase()
    return (
      sec.remote_as.includes(q) ||
      (sec.metadata.alias && sec.metadata.alias.toLowerCase().includes(q)) ||
      sec.peer_name.toLowerCase().includes(q) ||
      sec.peer_ip.toLowerCase().includes(q) ||
      sec.device_name.toLowerCase().includes(q) ||
      sec.static_routes.some(r => r.destination.toLowerCase().includes(q) || (r.description && r.description.toLowerCase().includes(q)))
    )
  })

  // All combined routes for table mode
  const allTableRoutes: StaticRoute[] = [
    ...(uploadOverview?.sections.flatMap(s => s.static_routes) || []),
    ...(uploadOverview?.other_routes || [])
  ].filter(r => {
    const q = search.toLowerCase()
    return (
      r.destination.toLowerCase().includes(q) ||
      r.next_hop.toLowerCase().includes(q) ||
      (r.description && r.description.toLowerCase().includes(q)) ||
      (r.device_name && r.device_name.toLowerCase().includes(q))
    )
  })

  // Helper to render AS image
  const renderASLogo = (meta: ASMetadata, peerName: string) => {
    if (meta.image_url) {
      const src = meta.image_url.startsWith('http') || meta.image_url.startsWith('data:')
        ? meta.image_url
        : `http://localhost:8080${meta.image_url}`
      return (
        <img
          src={src}
          alt={meta.alias || peerName}
          className="w-full h-full object-contain p-1"
          onError={(e) => {
            ;(e.target as HTMLElement).style.display = 'none'
          }}
        />
      )
    }

    if (meta.role === 'ix_ptt') {
      return <Network className="h-6 w-6 text-purple-400" />
    }
    if (meta.role === 'peering') {
      return <Globe className="h-6 w-6 text-emerald-400" />
    }
    return <Zap className="h-6 w-6 text-cyan-400" />
  }

  const getRoleBadge = (role?: string) => {
    switch (role) {
      case 'transit_primary':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800">
            Trânsito Primário
          </span>
        )
      case 'transit_secondary':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800">
            Trânsito Backup
          </span>
        )
      case 'ix_ptt':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800">
            IX / PTT
          </span>
        )
      case 'peering':
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
            Peering Privado
          </span>
        )
      default:
        return (
          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-800 text-slate-300 border border-slate-700">
            BGP Peer
          </span>
        )
    }
  }

  return (
    <div className="space-y-6">
      {/* Read-Only RBAC Alert for Viewers */}
      {!canOperate && (
        <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-300 text-xs flex items-center gap-2.5 shadow-lg">
          <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
          <span>
            <strong>Modo Somente Leitura (Visualizador):</strong> Seu usuário possui permissão de leitura analítica. As ações de engenharia de tráfego (aplicação de prepends, rotas estáticas e local-preference) estão bloqueadas e restritas a <strong>Admin</strong> ou <strong>Operador NOC</strong>.
          </span>
        </div>
      )}

      {/* Top Header & Subtabs */}
      {!hideInternalSubTabs && (
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="h-9 w-9 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <ArrowUpDown className="h-5 w-5" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white tracking-tight">Engenharia de Tráfego BGP</h2>
                <p className="text-xs text-slate-400">
                  Gerenciamento inteligente de Upload por AS (rotas estáticas direcionadas) e Download (AS-Path Prepending)
                </p>
              </div>
            </div>
          </div>

          {/* Sub-tab Switcher */}
          <div className="flex bg-slate-900 border border-slate-800 p-1 rounded-xl">
            <button
              onClick={() => setActiveSubTab('upload')}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeSubTab === 'upload'
                  ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload (Quadrados por AS & Rotas)</span>
            </button>
            <button
              onClick={() => {
                setActiveSubTab('download')
                if (selectedPrependDevice) loadPrepends(selectedPrependDevice)
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition cursor-pointer ${
                activeSubTab === 'download'
                  ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white shadow-md'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download (AS-Path Prepending)</span>
            </button>
          </div>
        </div>
      )}

      {/* Profile Action Feedback Banner */}
      {profileActionMsg && (
        <div className="p-3.5 rounded-xl bg-emerald-950/60 border border-emerald-700/80 text-emerald-200 text-xs flex items-center justify-between shadow-lg animate-in fade-in duration-150">
          <div className="flex items-center gap-2.5">
            <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
            <span className="font-semibold">{profileActionMsg}</span>
          </div>
          <button
            onClick={() => setProfileActionMsg(null)}
            className="text-emerald-400 hover:text-white p-1 rounded-lg transition"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* ===================== BARRA DE PERFIS DE ENGENHARIA DE TRÁFEGO / CENÁRIOS ===================== */}
      <div className="bg-slate-900/95 border border-slate-800 rounded-2xl p-4 shadow-xl backdrop-blur-md">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          
          {/* Lado Esquerdo: Perfil Ativo e Seletor Rápido de Cenário */}
          <div className="flex flex-wrap items-center gap-3">
            {/* Indicador de Perfil Ativo */}
            <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-950 border border-slate-800">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Cenário Ativo:</span>
              <span className="text-xs font-bold text-emerald-400">
                {activeProfile ? activeProfile.name : 'Nenhum ativado'}
              </span>
              {activeProfile && getProfileTagBadge(activeProfile.tag)}
            </div>

            {/* Seletor de Cenários / Presets */}
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400 font-medium">Trocar Cenário:</span>
              <select
                value={selectedProfileId}
                onChange={(e) => setSelectedProfileId(e.target.value)}
                className="bg-slate-950 border border-slate-700 hover:border-slate-600 rounded-xl px-3 py-1.5 text-xs text-white font-medium focus:outline-none focus:border-cyan-500 transition cursor-pointer max-w-xs"
              >
                {profiles.map(p => (
                  <option key={p.id} value={p.id}>
                    {p.is_active ? '● [ATIVO] ' : ''}{p.name} ({formatProfileTag(p.tag)})
                  </option>
                ))}
              </select>
            </div>

            {/* Descrição do Perfil Selecionado */}
            {(() => {
              const cur = profiles.find(p => p.id === selectedProfileId)
              if (!cur) return null
              return (
                <div className="hidden lg:flex items-center gap-1.5 text-xs text-slate-400 bg-slate-950/60 px-3 py-1 rounded-lg border border-slate-800/80">
                  <span className="text-slate-500 italic truncate max-w-sm" title={cur.description}>
                    {cur.description}
                  </span>
                  {getProfileTagBadge(cur.tag)}
                </div>
              )
            })()}
          </div>

          {/* Lado Direito: Ações (Subir/Aplicar Perfil, Salvar Atual, Gerenciar) */}
          <div className="flex flex-wrap items-center gap-2 self-start xl:self-center">
            {/* Botão Subir / Aplicar Cenário */}
            <button
              type="button"
              onClick={() => {
                const target = profiles.find(p => p.id === selectedProfileId)
                if (target) handleOpenDiff(target)
              }}
              disabled={!selectedProfileId || profilesLoading}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white shadow-lg shadow-amber-600/20 transition cursor-pointer disabled:opacity-50"
              title="Comparar com estado atual da rede e gerar scripts para os roteadores"
            >
              <Zap className="h-3.5 w-3.5 fill-current" />
              <span>Subir / Aplicar Cenário</span>
            </button>

            {/* Botão Salvar Estado Atual como Perfil */}
            <button
              type="button"
              onClick={handleOpenCapture}
              disabled={!canOperate}
              className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition cursor-pointer disabled:opacity-50"
              title="Capturar todos os prepends, local-preferences e rotas estáticas atuais como um novo perfil"
            >
              <Camera className="h-3.5 w-3.5 text-cyan-400" />
              <span>Salvar Estado Atual</span>
            </button>

            {/* Botão Gerenciar Perfis */}
            <button
              type="button"
              onClick={() => setIsManageModalOpen(true)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700/80 transition cursor-pointer"
              title="Listar todos os perfis e cenários cadastrados"
            >
              <Sliders className="h-3.5 w-3.5 text-slate-400" />
              <span>Gerenciar Perfis</span>
            </button>
          </div>

        </div>
      </div>

      {/* ===================== ABA 1: UPLOAD (QUADRADOS POR AS / ROTAS ESTÁTICAS) ===================== */}
      {activeSubTab === 'upload' && (
        <div className="space-y-6">
          {/* Controls Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              {/* Device Selector */}
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-slate-400" />
                <select
                  value={selectedDeviceId}
                  onChange={(e) => handleDeviceChange(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 font-medium focus:ring-2 focus:ring-cyan-500 focus:outline-none cursor-pointer"
                >
                  <option value="all">🌐 Todos os Roteadores BGP</option>
                  {devices.filter(d => d.is_bgp !== false).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.host}) - {d.vendor}
                    </option>
                  ))}
                </select>
              </div>

              {/* View Mode Toggle: Cards vs Table */}
              <div className="flex bg-slate-800/80 p-0.5 rounded-xl border border-slate-700/80 text-xs">
                <button
                  onClick={() => setUploadViewMode('cards')}
                  title="Visualização em Seções/Quadrados por AS"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                    uploadViewMode === 'cards'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Cards por AS</span>
                </button>
                <button
                  onClick={() => setUploadViewMode('table')}
                  title="Visualização em Tabela Geral"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                    uploadViewMode === 'table'
                      ? 'bg-cyan-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <TableIcon className="h-3.5 w-3.5" />
                  <span>Tabela Geral</span>
                </button>
              </div>

              {/* Search Bar */}
              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Filtrar por AS, Operadora, Prefixo ou Gateway..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="bg-slate-800/80 border border-slate-700 text-slate-200 text-xs rounded-xl pl-8 pr-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none w-56 sm:w-72"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Madrugada auto-sync indicator */}
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-[11px] text-slate-400">
                <Moon className="h-3.5 w-3.5 text-indigo-400" />
                <span>Auto-Sync: <strong>Diário às 03:30 (Madrugada)</strong></span>
                {syncStatus?.last_sync_time && (
                  <span className="text-slate-500 border-l border-slate-700 pl-2">
                    Última: {new Date(syncStatus.last_sync_time).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>

              <button
                onClick={() => loadOverview(selectedDeviceId, true)}
                disabled={loading}
                title="Forçar atualização via SSH nos roteadores"
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
              </button>

              <button
                onClick={openAddRouteGeneric}
                className="flex items-center gap-2 px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-semibold rounded-xl shadow-lg shadow-cyan-600/20 transition cursor-pointer"
              >
                <Plus className="h-4 w-4" />
                <span>Nova Rota Avulsa</span>
              </button>
            </div>
          </div>

          {error && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
              {error}
            </div>
          )}

          {loading && !uploadOverview ? (
            <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 ${density === 'compact' ? 'gap-3.5' : 'gap-6'}`}>
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} compact={density === 'compact'} />
              ))}
            </div>
          ) : uploadViewMode === 'cards' ? (
            /* ================= MODO CARDS / QUADRADOS POR AS ================= */
            <div className="space-y-8">
              {filteredSections.length === 0 ? (
                <div className="p-12 text-center text-slate-400 text-xs bg-slate-900/60 border border-slate-800 rounded-2xl">
                  <Globe className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                  <p className="font-semibold text-slate-300">Nenhuma sessão BGP encontrada</p>
                  <p className="text-slate-500 mt-1">
                    Verifique se os roteadores possuem sessões BGP configuradas ou ajuste o filtro.
                  </p>
                </div>
              ) : (
                <div className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 ${density === 'compact' ? 'gap-3.5' : 'gap-6'}`}>
                  {filteredSections.map((sec) => {
                    const isEstablished = sec.bgp_state.toLowerCase() === 'established'

                    return (
                      <div
                        key={sec.id}
                        className="flex flex-col bg-slate-900/90 border border-slate-800/90 hover:border-slate-700 rounded-2xl shadow-xl overflow-hidden transition duration-200"
                      >
                        {/* AS Card Header */}
                        <div className={`border-b border-slate-800/80 bg-slate-950/40 ${density === 'compact' ? 'p-3.5' : 'p-5'}`}>
                          <div className="flex items-start justify-between gap-3">
                            {/* Logo / Image Box */}
                            <div className="flex items-center gap-3.5">
                              <div
                                onClick={() => openCustomizeASModal(sec)}
                                title="Clique para trocar imagem ou editar AS"
                                className={`rounded-2xl bg-slate-800/90 border border-slate-700 flex items-center justify-center overflow-hidden shrink-0 hover:border-cyan-500/60 transition cursor-pointer group relative shadow-md ${
                                  density === 'compact' ? 'h-11 w-11' : 'h-14 w-14'
                                }`}
                              >
                                {renderASLogo(sec.metadata, sec.peer_name)}
                                <div className="absolute inset-0 bg-cyan-950/70 backdrop-blur-xs opacity-0 group-hover:opacity-100 flex items-center justify-center transition">
                                  <ImageIcon className="h-4 w-4 text-cyan-300" />
                                </div>
                              </div>

                              <div>
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="px-2 py-0.5 rounded-lg text-xs font-black font-mono bg-cyan-950/90 text-cyan-300 border border-cyan-800/80">
                                    AS {sec.remote_as}
                                  </span>
                                  {getRoleBadge(sec.metadata.role)}
                                </div>
                                <h3 className="text-sm font-bold text-white tracking-tight leading-tight">
                                  {sanitizeText(sec.metadata.alias) || sec.peer_name}
                                </h3>
                                <p className="text-[11px] text-slate-400 font-mono mt-0.5">
                                  {sec.peer_name} &bull; <span className="text-slate-300 font-sans font-medium">{sec.device_name}</span>
                                </p>
                              </div>
                            </div>

                            {/* Edit AS Button */}
                            <button
                              onClick={() => openCustomizeASModal(sec)}
                              title="Personalizar Alias, Papel e Imagem do AS"
                              className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700/80 transition cursor-pointer shrink-0"
                            >
                              <Edit3 className="h-3.5 w-3.5" />
                            </button>
                          </div>

                          {/* BGP Session Status Bar */}
                          <div className="mt-4 pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px]">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`h-2 w-2 rounded-full ${
                                  isEstablished ? 'bg-emerald-400 animate-pulse' : 'bg-rose-500'
                                }`}
                              />
                              <span className={`font-semibold ${isEstablished ? 'text-emerald-400' : 'text-rose-400'}`}>
                                {sec.bgp_state}
                              </span>
                              {sec.uptime && (
                                <span className="text-slate-500 font-mono">({sec.uptime})</span>
                              )}
                            </div>

                            <div className="flex items-center gap-1 text-slate-400 font-mono">
                              <span className="text-slate-500 font-sans">Next-Hop:</span>
                              <strong className="text-emerald-400">{sec.peer_ip}</strong>
                            </div>
                          </div>

                          {/* Local-Preference (Upload TE) & Action */}
                          <div className="mt-2.5 text-xs flex items-center justify-between bg-slate-900/90 px-3 py-1.5 rounded-xl border border-slate-800/90 shadow-inner">
                            <div className="flex items-center gap-1.5 font-mono">
                              <span className="text-slate-400 font-sans text-[11px] font-medium">Local-Pref:</span>
                              <span className="font-bold text-amber-400 bg-amber-950/70 px-2 py-0.5 rounded-lg border border-amber-700/60 text-xs">
                                {sec.local_pref ?? 100}
                              </span>
                              {sec.import_policy && (
                                <span className="text-[10px] text-slate-500 hidden sm:inline font-mono" title={`Route-policy de import: ${sec.import_policy}`}>
                                  ({sec.import_policy})
                                </span>
                              )}
                            </div>
                            <button
                              onClick={() => openLocalPrefModal(sec)}
                              title="Ajustar Local-Preference no equipamento"
                              className="flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[11px] font-semibold transition cursor-pointer hover:scale-[1.02] active:scale-[0.98]"
                            >
                              <SlidersHorizontal className="h-3 w-3 text-amber-400" />
                              <span>Ajustar</span>
                            </button>
                          </div>
                        </div>

                        {/* AS Card Body: Rotas / Blocos de Saída */}
                        <div className="p-4 flex-1 flex flex-col justify-between bg-slate-900/40">
                          <div>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <RouteIcon className="h-3.5 w-3.5 text-cyan-400" />
                                <span className="text-xs font-semibold text-slate-300">
                                  Blocos de Saída Direcionados ({sec.static_routes.length})
                                </span>
                                <span className="text-[10px] text-slate-500 font-mono hidden sm:inline">
                                  via {sec.peer_ip}
                                </span>
                              </div>
                              <button
                                type="button"
                                onClick={() => toggleUploadGroup(sec.id)}
                                className="text-[11px] text-cyan-400 hover:text-cyan-300 font-medium flex items-center gap-1 cursor-pointer transition py-0.5 px-1.5 rounded hover:bg-cyan-950/40"
                              >
                                <span>{expandedUploadGroups[sec.id] ? 'Ocultar Blocos' : 'Ver Blocos'}</span>
                                {expandedUploadGroups[sec.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                              </button>
                            </div>

                            {expandedUploadGroups[sec.id] && (
                              <div className="mt-3 space-y-3 animate-in fade-in duration-150">
                                {sec.static_routes.length === 0 ? (
                                  <div className="p-4 rounded-xl border border-dashed border-slate-800 bg-slate-950/30 text-center text-slate-400 text-[11px] space-y-1">
                                    <p className="text-slate-300 font-medium">Nenhum bloco estático direcionado</p>
                                    <p className="text-slate-500 text-[10px]">
                                      Clique no botão abaixo para injetar uma rota estática via este AS.
                                    </p>
                                  </div>
                                ) : (
                                  <div className="space-y-2">
                                    {sec.static_routes.map((route) => {
                                      const isDefault = route.destination === '0.0.0.0/0'
                                      const isDeleting = deletingId === route.id

                                      return (
                                        <div
                                          key={route.id}
                                          className="flex items-center justify-between p-2.5 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700 text-xs transition"
                                        >
                                          <div className="flex flex-col">
                                            <div className="flex items-center gap-1.5 font-mono">
                                              <span
                                                className={`px-2 py-0.5 rounded font-bold text-[11px] ${
                                                  isDefault
                                                    ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                                    : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                                }`}
                                              >
                                                {route.destination}
                                              </span>
                                              {isDefault && (
                                                <span className="text-[10px] font-sans font-bold text-amber-400">
                                                  Default
                                                </span>
                                              )}
                                            </div>
                                            <div className="text-[10px] text-slate-400 font-sans mt-1 flex items-center gap-2">
                                              <span>Pref: <strong className="text-slate-300">{route.preference || 60}</strong></span>
                                              {route.description && (
                                                <span className="text-slate-400 truncate max-w-[160px]" title={route.description}>
                                                  &bull; {route.description}
                                                </span>
                                              )}
                                            </div>
                                          </div>

                                          {/* Delete Route */}
                                          <button
                                            onClick={() => openDeleteRouteModal(route)}
                                            disabled={isDeleting}
                                            title="Ver comando de remoção para este host"
                                            className="p-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 hover:text-rose-200 border border-rose-900/50 transition cursor-pointer disabled:opacity-50 shrink-0"
                                          >
                                            <Trash2 className={`h-3.5 w-3.5 ${isDeleting ? 'animate-spin' : ''}`} />
                                          </button>
                                        </div>
                                      )
                                    })}
                                  </div>
                                )}

                                {/* AS Card Footer: Botão de Mais [+] */}
                                <div className="pt-1">
                                  <button
                                    onClick={() => openAddRouteForSection(sec)}
                                    className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-600 hover:to-blue-600 border border-cyan-500/40 hover:border-transparent text-cyan-300 hover:text-white text-xs font-semibold shadow-sm transition cursor-pointer group"
                                  >
                                    <Plus className="h-4 w-4 text-cyan-400 group-hover:text-white transition" />
                                    <span>Adicionar Bloco de Saída</span>
                                  </button>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          ) : (
            /* ================= MODO TABELA COMPLETA ================= */
            <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
              <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <RouteIcon className="h-4 w-4 text-cyan-400" />
                  <span className="text-sm font-semibold text-white">Todas as Rotas Estáticas de Upload</span>
                  <span className="text-xs text-slate-500">({allTableRoutes.length} rotas)</span>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950/40">
                      <th className="py-3 px-4">Equipamento</th>
                      <th className="py-3 px-4">Destino / Prefixo</th>
                      <th className="py-3 px-4">Próximo Salto (Gateway / Saída)</th>
                      <th className="py-3 px-4">Preferência</th>
                      <th className="py-3 px-4">Descrição / Comentário</th>
                      <th className="py-3 px-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-mono">
                    {allTableRoutes.map((route) => {
                      const isDefault = route.destination === '0.0.0.0/0'
                      const isDeleting = deletingId === route.id

                      return (
                        <tr key={route.id} className="hover:bg-slate-800/30 transition">
                          <td className="py-3 px-4 font-sans font-medium text-slate-200">
                            {route.device_name}
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`px-2 py-0.5 rounded font-bold ${
                                isDefault
                                  ? 'bg-amber-950 text-amber-300 border border-amber-800'
                                  : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                              }`}
                            >
                              {route.destination}
                            </span>
                            {isDefault && (
                              <span className="ml-1.5 text-[10px] text-amber-400 font-sans font-semibold">
                                (Default)
                              </span>
                            )}
                          </td>
                          <td className="py-3 px-4 text-emerald-400 font-semibold">
                            {route.next_hop}
                          </td>
                          <td className="py-3 px-4 text-slate-400">
                            {route.preference || 60}
                          </td>
                          <td className="py-3 px-4 font-sans text-slate-300">
                            {route.description || <span className="text-slate-600 italic">-</span>}
                          </td>
                          <td className="py-3 px-4 text-right">
                            <button
                              onClick={() => openDeleteRouteModal(route)}
                              disabled={isDeleting}
                              title="Ver comando de remoção para este host"
                              className="p-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 hover:text-rose-200 border border-rose-900/50 transition cursor-pointer disabled:opacity-50"
                            >
                              <Trash2 className={`h-3.5 w-3.5 ${isDeleting ? 'animate-spin' : ''}`} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================== ABA 2: DOWNLOAD (AS-PATH PREPENDING - SOMENTE CONSULTA) ===================== */}
      {activeSubTab === 'download' && (
        <div className="space-y-6">
          {/* Controls Bar for Download */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-slate-900/80 border border-slate-800 rounded-2xl p-4 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Server className="h-4 w-4 text-slate-400" />
                <select
                  value={selectedPrependDevice}
                  onChange={(e) => handlePrependDeviceChange(e.target.value)}
                  className="bg-slate-800 border border-slate-700 text-slate-200 text-xs rounded-xl px-3 py-2 font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                >
                  <option value="all">🌐 Todos os Links da Rede (Visão Global)</option>
                  {devices.filter(d => d.is_bgp !== false).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.host}) - {d.vendor}
                    </option>
                  ))}
                </select>
              </div>

              {/* View Mode Toggle: Cards por AS vs Tabela Geral */}
              <div className="flex bg-slate-800/80 p-0.5 rounded-xl border border-slate-700/80 text-xs">
                <button
                  type="button"
                  onClick={() => setDownloadViewMode('cards')}
                  title="Visualização em Cards por Detentor do AS / Operadora"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                    downloadViewMode === 'cards'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                  <span>Cards por AS / Operadora</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDownloadViewMode('table')}
                  title="Visualização Detalhada por Sessão BGP"
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg font-medium transition cursor-pointer ${
                    downloadViewMode === 'table'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <TableIcon className="h-3.5 w-3.5" />
                  <span>Tabela Detalhada</span>
                </button>
              </div>

              <div className="relative">
                <Search className="h-3.5 w-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Buscar por Operadora, AS, prefixo ou comunidade..."
                  value={prependSearch}
                  onChange={(e) => setPrependSearch(e.target.value)}
                  className="bg-slate-800/80 border border-slate-700 text-slate-200 text-xs rounded-xl pl-8 pr-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none w-56 sm:w-72"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="hidden lg:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800/60 border border-slate-700/60 text-[11px] text-slate-400">
                <Moon className="h-3.5 w-3.5 text-indigo-400" />
                <span>Auto-Sync: <strong>Diário às 03:30 (Madrugada)</strong></span>
              </div>

              {/* Botão de Dicas & Boas Práticas */}
              <button
                type="button"
                onClick={() => setShowDownloadHelp((prev) => !prev)}
                title="Dicas de Engenharia de Download & Zero-Flap"
                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-semibold transition cursor-pointer ${
                  showDownloadHelp
                    ? 'bg-indigo-600/30 text-indigo-200 border-indigo-500/60 shadow-md shadow-indigo-500/10'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
              >
                <HelpCircle className="h-4 w-4 text-indigo-400" />
                <span className="hidden sm:inline">Dicas</span>
              </button>

              <button
                onClick={() => loadPrepends(selectedPrependDevice, true)}
                disabled={prependsLoading}
                title="Forçar atualização via SSH no roteador"
                className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl border border-slate-700 transition cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`h-4 w-4 ${prependsLoading ? 'animate-spin text-indigo-400' : ''}`} />
              </button>
            </div>
          </div>

          {/* Informações / Dicas de Engenharia de Download (Retrátil) */}
          {showDownloadHelp && (
            <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/60 via-slate-900 to-slate-900 border border-indigo-700/50 flex items-start gap-3.5 shadow-xl animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 shrink-0 mt-0.5">
                <ShieldCheck className="h-4 w-4" />
              </div>
              <div className="text-xs space-y-1.5 flex-1">
                <div className="flex items-center justify-between">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold text-white text-xs uppercase tracking-wide">
                      Engenharia de Tráfego de Download (AS-Path Prepending & Bloqueio Seletivo)
                    </span>
                    <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 text-[10px] font-bold">
                      Zero Flap &bull; Route-Refresh Ativo
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setShowDownloadHelp(false)}
                    className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition cursor-pointer"
                    title="Fechar dicas"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
                <p className="text-slate-300 text-[11px] leading-relaxed">
                  Ajuste o caminho de entrada do seu tráfego por bloco IP e por operadora através de Community Tagging de origem. Aplicações em produção são efetivadas com soft-refresh sem reiniciar sessões BGP.
                </p>
              </div>
            </div>
          )}

          {prependsError && (
            <div className="p-4 rounded-xl bg-rose-950/40 border border-rose-800 text-rose-300 text-xs">
              {prependsError}
            </div>
          )}

          {/* Download Peers & Policy Cards */}
          {prependsLoading ? (
            <div className={`grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 ${density === 'compact' ? 'gap-3.5' : 'gap-6'}`}>
              {Array.from({ length: 6 }).map((_, i) => (
                <CardSkeleton key={i} compact={density === 'compact'} />
              ))}
            </div>
          ) : prependOverview ? (
            <div className="space-y-6">
              {/* Header with Local ASN & Total counts */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-1 border-b border-slate-800/60 text-xs text-slate-400">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-indigo-400" />
                  <span className="font-semibold text-slate-300 uppercase tracking-wider">
                    {downloadViewMode === 'cards'
                      ? `Detentores de AS Auditados (${prependOverview.as_groups?.length || 0})`
                      : `Sessões BGP Auditadas (${prependOverview.peers.length})`}
                  </span>
                </div>
                {prependOverview.local_as && (
                  <span className="font-mono">
                    ASN Local do Roteador: <strong className="text-indigo-300 font-mono tracking-tight">AS{prependOverview.local_as}</strong>
                  </span>
                )}
              </div>

              {/* ================= MODE 1: CARDS POR AS / OPERADORA (RECOMMENDED) ================= */}
              {downloadViewMode === 'cards' ? (
                <div>
                  {(() => {
                    const groups = (prependOverview.as_groups && prependOverview.as_groups.length > 0)
                      ? prependOverview.as_groups
                      : []

                    const filtered = groups.filter((grp) => {
                      const q = prependSearch.toLowerCase()
                      return (
                        grp.group_name.toLowerCase().includes(q) ||
                        grp.remote_as.includes(q) ||
                        grp.community_base.includes(q) ||
                        grp.peer_ips.some(ip => ip.toLowerCase().includes(q)) ||
                        grp.prefixes.some(p => p.prefix.toLowerCase().includes(q))
                      )
                    })

                    if (filtered.length === 0) {
                      return (
                        <div className="p-12 text-center text-slate-400 text-xs bg-slate-900/60 border border-slate-800 rounded-2xl">
                          <Globe className="h-8 w-8 text-slate-600 mx-auto mb-2" />
                          <p className="font-semibold text-slate-300">Nenhum AS ou operadora encontrado</p>
                          <p className="text-slate-500 mt-1">
                            {groups.length === 0
                              ? 'Não foram detectados grupos de AS ou comunidades configuradas neste roteador.'
                              : 'Ajuste o filtro de busca ou alterne para a visualização em tabela detalhada.'}
                          </p>
                        </div>
                      )
                    }

                    return (
                      <div className={`grid grid-cols-1 lg:grid-cols-2 2xl:grid-cols-3 ${density === 'compact' ? 'gap-3.5' : 'gap-6'}`}>
                        {filtered.map((grp) => (
                          <div
                            key={grp.id}
                            className="flex flex-col bg-slate-900/90 border border-slate-800/90 hover:border-slate-700 rounded-2xl shadow-xl overflow-hidden transition duration-200"
                          >
                            {/* AS Card Header */}
                            <div className={`border-b border-slate-800/80 bg-slate-950/40 ${density === 'compact' ? 'p-3.5' : 'p-5'}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex items-center gap-3.5">
                                  <div className={`rounded-2xl bg-slate-800/90 border border-slate-700 flex items-center justify-center shrink-0 shadow-md ${
                                    density === 'compact' ? 'h-9 w-9' : 'h-12 w-12'
                                  }`}>
                                    {grp.role === 'ix_ptt' ? (
                                      <Globe className={`${density === 'compact' ? 'h-4 w-4' : 'h-6 w-6'} text-purple-400`} />
                                    ) : (
                                      <Network className={`${density === 'compact' ? 'h-4 w-4' : 'h-6 w-6'} text-indigo-400`} />
                                    )}
                                  </div>
                                  <div>
                                    <h4 className="font-bold text-white text-base leading-snug">
                                      {grp.group_name}
                                    </h4>
                                    <div className="flex flex-wrap items-center gap-1.5 mt-1">
                                      {grp.device_name && (
                                        <span className="font-mono text-[11px] font-bold text-slate-200 bg-slate-800/90 px-2 py-0.5 rounded border border-slate-700 flex items-center gap-1" title={`Roteador BGP: ${grp.device_name}`}>
                                          <Server className="h-3 w-3 text-indigo-400" />
                                          {grp.device_name}
                                        </span>
                                      )}
                                      <span className="font-mono text-[11px] font-bold text-cyan-300 bg-cyan-950/80 px-2 py-0.5 rounded border border-cyan-800/80">
                                        AS{grp.remote_as}
                                      </span>
                                      {renderGroupRoleBadge(grp.role)}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Unified Sessions Bar */}
                              <div className="mt-3 pt-3 border-t border-slate-800/60 flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2 text-slate-300">
                                  <Zap className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                                  <span className="font-semibold text-[11px]">
                                    {grp.peer_count} {grp.peer_count === 1 ? 'Sessão BGP vinculada' : 'Sessões BGP unificadas'}
                                  </span>
                                  <span className="text-[10px] text-slate-500 font-sans hidden sm:inline">
                                    (IPv4 & IPv6)
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setExpandedPeerGroup(expandedPeerGroup === grp.id ? null : grp.id)}
                                  className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer"
                                >
                                  <span>{expandedPeerGroup === grp.id ? 'Ocultar IPs' : 'Ver IPs'}</span>
                                  {expandedPeerGroup === grp.id ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                </button>
                              </div>

                              {/* Collapsible Peer IPs list */}
                              {expandedPeerGroup === grp.id && (
                                <div className="mt-2.5 p-2.5 rounded-xl bg-slate-950/90 border border-slate-800 text-[11px] font-mono text-slate-300 flex flex-wrap gap-1.5 animate-in fade-in duration-150">
                                  {grp.peer_ips.map((ip, idx) => (
                                    <span key={idx} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-indigo-200">
                                      {ip}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Body: Announced Prefixes */}
                            <div className="p-4 flex-1 flex flex-col justify-between bg-slate-900/40">
                              <div>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2">
                                    <RouteIcon className="h-3.5 w-3.5 text-indigo-400" />
                                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                      Prefixos Anunciados ({grp.prefixes.length})
                                    </span>
                                    <span className="text-[10px] text-slate-500 hidden sm:inline">
                                      Engenharia por Bloco
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => togglePrefixGroup(grp.id)}
                                    className="text-[11px] text-indigo-400 hover:text-indigo-300 font-medium flex items-center gap-1 cursor-pointer transition py-0.5 px-1.5 rounded hover:bg-indigo-950/40"
                                  >
                                    <span>{expandedPrefixGroups[grp.id] ? 'Ocultar Prefixos' : 'Ver Prefixos'}</span>
                                    {expandedPrefixGroups[grp.id] ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                                  </button>
                                </div>

                                {expandedPrefixGroups[grp.id] && (
                                  <div className="mt-3 space-y-2 animate-in fade-in duration-150">
                                    {grp.prefixes.map((pfx) => (
                                      <div
                                        key={pfx.id}
                                        className="p-3 rounded-xl bg-slate-950/60 border border-slate-800/80 hover:border-slate-700/80 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                                      >
                                        <div className="space-y-1">
                                          <div className="flex items-center gap-2">
                                            <span className="font-mono font-bold text-white text-xs px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                                              {pfx.prefix}
                                            </span>
                                            {pfx.is_blocked ? (
                                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800 inline-flex items-center gap-1">
                                                <AlertTriangle className="h-3 w-3 text-rose-400" />
                                                Bloqueado (Deny)
                                              </span>
                                            ) : pfx.prepend_count === 0 ? (
                                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800 inline-flex items-center gap-1">
                                                <CheckCircle2 className="h-3 w-3 text-emerald-400" />
                                                0P (Primário)
                                              </span>
                                            ) : (
                                              <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800 inline-flex items-center gap-1">
                                                <Clock className="h-3 w-3 text-amber-400" />
                                                {pfx.prepend_count}x Prepend ({pfx.prepend_count}P)
                                              </span>
                                            )}
                                          </div>
                                        </div>

                                        <button
                                          type="button"
                                          onClick={() => openPrependModal(pfx, grp)}
                                          className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md shadow-indigo-600/20 transition cursor-pointer self-start sm:self-auto"
                                        >
                                          <SlidersHorizontal className="h-3.5 w-3.5" />
                                          <span>Ajustar Prepend</span>
                                        </button>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Footer Info */}
                              {expandedPrefixGroups[grp.id] && (
                                <div className="mt-3 pt-2 text-[10px] text-slate-500 flex items-center gap-1.5 border-t border-slate-800/40 animate-in fade-in duration-150">
                                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                  <span>Ajustar este bloco afeta simultaneamente todas as {grp.peer_count} sessões deste AS sem repetição.</span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              ) : (
                /* ================= MODE 2: TABELA DETALHADA ================= */
                <div className="space-y-6">
                  {/* Peers / Upstreams Grid */}
                  <div>
                    <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-2 mb-3">
                      <Globe className="h-4 w-4 text-indigo-400" />
                      <span>Sessões BGP Individuais ({prependOverview.peers.length})</span>
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {prependOverview.peers.map((peer) => (
                        <div
                          key={peer.id}
                          className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-md space-y-3"
                        >
                          <div className="flex items-start justify-between">
                            <div>
                              <span className="text-sm font-bold text-white block">
                                {peer.peer_name || peer.peer_ip}
                              </span>
                              <span className="text-xs text-slate-400 font-mono">
                                IP: {peer.peer_ip} {peer.remote_as && `(AS${peer.remote_as})`}
                              </span>
                            </div>
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                peer.status === 'Established'
                                  ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                                  : 'bg-amber-950 text-amber-400 border border-amber-800'
                              }`}
                            >
                              {peer.status}
                            </span>
                          </div>

                          <div className="text-xs space-y-1 font-mono text-slate-300 bg-slate-950/60 p-2.5 rounded-xl border border-slate-800/80">
                            <div className="flex justify-between">
                              <span className="text-slate-500 font-sans">Route-Policy:</span>
                              <span className="text-indigo-300 truncate max-w-[160px]" title={peer.policy_name}>
                                {peer.policy_name || 'N/A'}
                              </span>
                            </div>
                            <div className="flex justify-between">
                              <span className="text-slate-500 font-sans">Prepend Padrão:</span>
                              <span className="font-bold text-amber-300">
                                {peer.prepend_count === 0 ? '0 (Primário)' : `${peer.prepend_count}x (${peer.prepend_count}P)`}
                              </span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Prefixes Table */}
                  <div className="bg-slate-900/90 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                    <div className="p-4 border-b border-slate-800 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <RouteIcon className="h-4 w-4 text-indigo-400" />
                        <span className="text-sm font-semibold text-white">Prefixos Anunciados e Comunidades Tagged</span>
                        <span className="text-xs text-slate-500">({prependOverview.prefixes.length} blocos)</span>
                      </div>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950/40">
                            <th className="py-3 px-4">Prefixo Anunciado</th>
                            <th className="py-3 px-4">Destino / Upstream</th>
                            <th className="py-3 px-4">Prepend Aplicado</th>
                            <th className="py-3 px-4">BGP Community</th>
                            <th className="py-3 px-4">Status de Entrada Estimado</th>
                            <th className="py-3 px-4 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {prependOverview.prefixes.map((p) => {
                            const matchingGroup = prependOverview.as_groups?.find(g =>
                              g.peers.some(pr => pr.peer_ip === p.peer_ip) ||
                              g.peer_ips.includes(p.peer_ip)
                            )

                            return (
                              <tr key={p.id} className="hover:bg-slate-800/30 transition">
                                <td className="py-3 px-4">
                                  <span className="px-2 py-0.5 rounded font-bold bg-indigo-950 text-indigo-300 border border-indigo-800">
                                    {p.prefix}
                                  </span>
                                </td>
                                <td className="py-3 px-4 font-sans text-slate-200">
                                  {p.peer_name} <span className="text-slate-500 font-mono text-[11px]">({p.peer_ip})</span>
                                </td>
                                <td className="py-3 px-4">
                                  {p.is_blocked ? (
                                    <span className="px-2 py-0.5 rounded font-bold text-rose-300 bg-rose-950/60 border border-rose-800/60 inline-flex items-center gap-1">
                                      <AlertTriangle className="h-3 w-3" />
                                      Bloqueado (Deny)
                                    </span>
                                  ) : (
                                    <span className="px-2 py-0.5 rounded font-bold text-amber-300 bg-amber-950/60 border border-amber-800/60">
                                      {p.prepend_count === 0 ? 'Nenhum (0P / Primário)' : `${p.prepend_count}x Prepend (${p.prepend_count}P)`}
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 text-slate-300">
                                  {p.community || '-'}
                                </td>
                                <td className="py-3 px-4 font-sans">
                                  {p.is_blocked ? (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-rose-950/80 text-rose-400 border border-rose-800">
                                      <ShieldAlert className="h-3 w-3" />
                                      Anúncio Interrompido
                                    </span>
                                  ) : p.prepend_count > 0 ? (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-amber-950/80 text-amber-400 border border-amber-800">
                                      <Clock className="h-3 w-3" />
                                      Despriorizado (+{p.prepend_count} saltos AS)
                                    </span>
                                  ) : (
                                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-950 text-emerald-400 border border-emerald-800">
                                      <CheckCircle2 className="h-3 w-3" />
                                      Prioritário (Caminho Mais Curto)
                                    </span>
                                  )}
                                </td>
                                <td className="py-3 px-4 font-sans text-right">
                                  <button
                                    onClick={() => openPrependModal(p, matchingGroup)}
                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-950 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 hover:text-white text-xs font-semibold shadow-xs transition cursor-pointer"
                                  >
                                    <SlidersHorizontal className="h-3.5 w-3.5" />
                                    <span>Ajustar Prepend</span>
                                  </button>
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div className="p-12 text-center text-slate-400 text-xs bg-slate-900/60 border border-slate-800 rounded-2xl">
              Nenhum dado de prepend disponível.
            </div>
          )}
        </div>
      )}

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
                      Operadora: <strong className="text-cyan-300">{targetSection.metadata.alias || targetSection.peer_name}</strong>
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
                <strong className="block font-bold text-amber-300">Modo Manual Ativo (Zero Commits Automáticos):</strong>
                O sistema gera os comandos CLI exatos para o host selecionado. Nenhuma alteração é enviada diretamente ao equipamento pelo software.
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
                <span><strong>Comandos copiados com sucesso!</strong> Cole no terminal SSH (Putty) do roteador.</span>
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

              {/* Prefixo de Destino com atalhos rápidos */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-slate-400 font-medium">Bloco / Prefixo de Destino (CIDR)</label>
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
                    &bull; Vinculado automaticamente ao Peer IP de {targetSection.metadata.alias || targetSection.peer_name}
                  </span>
                )}
              </div>

              {/* Preferência e Descrição */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Preferência (Distância)</label>
                  <input
                    type="number"
                    placeholder="60"
                    value={formPref}
                    onChange={(e) => setFormPref(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 text-slate-200 font-mono rounded-xl px-3 py-2 focus:ring-2 focus:ring-cyan-500 focus:outline-none"
                  />
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Huawei padrão: 60 / MikroTik: 1</span>
                </div>
                <div>
                  <label className="block text-slate-400 font-medium mb-1">Descrição / Comentário</label>
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
                    Comandos CLI Gerados para o Host ({devices.find(d => d.id === formDevice)?.name || 'Roteador'}):
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyToClipboard(getStaticRouteCliPreview(), 'add_route')}
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
                  {getStaticRouteCliPreview()}
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
                  onClick={() => handleCopyToClipboard(getStaticRouteCliPreview(), 'add_route')}
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

      {/* ===================== MODAL 1B: REMOVER ROTA ESTÁTICA (MODO MANUAL SEGURO) ===================== */}
      {isDeleteRouteModalOpen && routeToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center justify-center text-rose-400">
                  <Trash2 className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-white">
                    Remover Rota Estática
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Host: <strong className="text-rose-300">{routeToDelete.device_name}</strong> &bull; Bloco: <strong className="text-cyan-300">{routeToDelete.destination}</strong>
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
                <strong className="block font-bold text-amber-300">Modo Manual Ativo (Zero Alteração no Roteador):</strong>
                O comando de remoção abaixo foi gerado para você executar com segurança no terminal SSH do roteador. Nenhuma alteração é enviada diretamente ao equipamento pelo software.
              </div>
            </div>

            {/* Feedback Notifications */}
            {copiedKey === 'delete_route' && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span><strong>Comando de remoção copiado!</strong> Cole no terminal SSH (Putty) do roteador.</span>
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
                <span className="text-slate-500 block text-[10px] font-sans">Prefixo / Destino:</span>
                <span className="text-cyan-300 font-bold">{routeToDelete.destination}</span>
              </div>
              <div>
                <span className="text-slate-500 block text-[10px] font-sans">Gateway / Próximo Salto:</span>
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
                  onClick={() => handleCopyToClipboard(getDeleteStaticRouteCliPreview(routeToDelete), 'delete_route')}
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
                {getDeleteStaticRouteCliPreview(routeToDelete)}
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
                onClick={() => handleCopyToClipboard(getDeleteStaticRouteCliPreview(routeToDelete), 'delete_route')}
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

      {/* ===================== MODAL 2: PERSONALIZAR AS (ALIAS & LOGO UPLOAD) ===================== */}
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
                <span className="font-mono font-bold text-cyan-300">AS{customizingSection.remote_as}</span>
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
                      <img src={asImagePreview} alt="Preview" className="w-full h-full object-contain p-1" />
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
                <label className="block text-slate-400 font-medium mb-1">Descrição / Contrato</label>
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

      {/* ===================== MODAL 3: AJUSTAR LOCAL-PREFERENCE (UPLOAD TE) ===================== */}
      {isLocalPrefModalOpen && localPrefSection && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
            {/* Header */}
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
                    {localPrefSection.metadata.alias || localPrefSection.peer_name} &bull; {localPrefSection.device_name}
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
                <strong className="block font-bold text-amber-300">Modo Manual Ativo (Zero Alteração no Roteador):</strong>
                O sistema gera os comandos exatos prontos para você revisar e colar no terminal SSH. Nenhuma alteração é enviada diretamente ao equipamento pelo software.
              </div>
            </div>

            {/* Error & Success Feedback */}
            {localPrefError && (
              <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-800 text-rose-300 text-xs">
                {localPrefError}
              </div>
            )}
            {copiedKey === 'localpref' && (
              <div className="p-3 rounded-xl bg-emerald-950/70 border border-emerald-700 text-emerald-200 text-xs flex items-center gap-2 animate-in fade-in">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
                <span><strong>Comandos copiados com sucesso!</strong> Cole no terminal SSH do roteador para aplicar manualmente com zero flap.</span>
              </div>
            )}

            <div className="space-y-4 text-xs font-sans">
              {/* Context Summary Cards */}
              <div className="grid grid-cols-2 gap-3 p-3 rounded-xl bg-slate-950/70 border border-slate-800 text-[11px] font-mono">
                <div>
                  <span className="text-slate-500 block text-[10px] font-sans">Peer IP / Próximo Salto:</span>
                  <span className="text-emerald-400 font-bold">{localPrefSection.peer_ip}</span>
                </div>
                <div>
                  <span className="text-slate-500 block text-[10px] font-sans">Policy de Importação:</span>
                  <span className="text-cyan-300 font-bold">
                    {localPrefSection.import_policy ? `${localPrefSection.import_policy} (node ${localPrefSection.import_policy_node || 11})` : 'Padrão / Auto'}
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
                    { val: 900, label: '900 (Primário Absoluto)' }
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
                        <div className="text-[10px] font-sans text-slate-400 truncate mt-0.5">{preset.label.split(' ')[1]}</div>
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
                <span className="text-[10px] text-slate-500 mt-1 block">
                  Quanto maior o valor da Local-Preference, maior a preferência para o tráfego de saída (Upload).
                </span>
              </div>

              {/* Command Preview with Copy Button */}
              <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-300 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[11px] font-sans font-semibold">
                    Comandos CLI Gerados para Execução Manual:
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyToClipboard(getLocalPrefCliPreview(), 'localpref')}
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
                  {getLocalPrefCliPreview()}
                </div>
                <p className="text-slate-400 text-[10px] font-sans">
                  * Cole os comandos no Putty/terminal SSH. O <code>refresh bgp import</code> atualiza as rotas suavemente sem reiniciar a sessão BGP.
                </p>
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
                  onClick={() => handleCopyToClipboard(getLocalPrefCliPreview(), 'localpref')}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-orange-600 hover:from-amber-500 hover:to-orange-500 text-white font-bold rounded-xl shadow-lg shadow-amber-600/30 transition cursor-pointer flex items-center gap-2"
                >
                  {copiedKey === 'localpref' ? (
                    <>
                      <Check className="h-4 w-4 text-white" />
                      <span>Comandos Copiados!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span>Copiar Comandos para o Terminal</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL 4: AJUSTAR AS-PATH PREPEND (DOWNLOAD TE) ===================== */}
      {isPrependModalOpen && targetPrependPrefix && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto">
            {/* Header */}
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

            {/* Error / Success Feedback */}
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

            {/* Scope / Sessions Banner */}
            {targetPrependGroup ? (
              <div className="p-3.5 rounded-xl bg-indigo-950/40 border border-indigo-500/30 text-indigo-200 text-xs flex items-start gap-2.5">
                <Zap className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="font-semibold text-indigo-300">
                      Unificação Ativa ({targetPrependGroup.peer_count} {targetPrependGroup.peer_count === 1 ? 'Sessão BGP' : 'Sessões BGP'})
                    </strong>
                    <span className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-indigo-900/60 border border-indigo-700 text-indigo-200">
                      Base TE: 1:{targetPrependGroup.community_base}X
                    </span>
                  </div>
                  <p className="text-[11px] text-indigo-200/80 leading-relaxed">
                    A política de export de todas as sessões do <strong>{targetPrependGroup.group_name}</strong> já filtra essa comunidade. Ao ajustar o prepend deste bloco, todas as sessões passam a propagar a alteração simultaneamente, sem duplicidade na engenharia.
                  </p>
                </div>
              </div>
            ) : (
              /* Safety Banner: Manual Mode */
              <div className="p-3 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex items-start gap-2.5">
                <ShieldAlert className="h-5 w-5 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <strong className="font-semibold block text-amber-300">Modo Manual Ativo (Zero Alteração no Roteador)</strong>
                  <p className="text-[11px] text-amber-200/80 mt-0.5 leading-relaxed">
                    O sistema gera e valida o bloco de comandos CLI exato com a comunidade correta. Nenhuma modificação é enviada diretamente ao seu equipamento.
                  </p>
                </div>
              </div>
            )}

            <div className="space-y-4 text-xs font-sans">
              {/* Prepend Selection Options */}
              <div>
                <label className="block text-slate-300 font-semibold mb-2">
                  Selecione a Estratégia de Entrada para este Bloco:
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {/* 0x - Primário */}
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
                      {!isBlockChoice && prependCountChoice === 0 && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                    </div>
                    <span className="text-[11px] text-slate-400 font-sans">
                      Sem prepend. Caminho preferencial direto.
                    </span>
                  </button>

                  {/* 1x Prepend */}
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
                      {!isBlockChoice && prependCountChoice === 1 && <Check className="h-4 w-4 text-amber-400" />}
                    </div>
                    <span className="text-[11px] text-slate-400 font-sans">
                      Adiciona +1 salto AS. Despriorização leve.
                    </span>
                  </button>

                  {/* 2x Prepend */}
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
                      {!isBlockChoice && prependCountChoice === 2 && <Check className="h-4 w-4 text-amber-400" />}
                    </div>
                    <span className="text-[11px] text-slate-400 font-sans">
                      Adiciona +2 saltos AS. Despriorização média.
                    </span>
                  </button>

                  {/* 3x Prepend */}
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
                      {!isBlockChoice && prependCountChoice === 3 && <Check className="h-4 w-4 text-amber-400" />}
                    </div>
                    <span className="text-[11px] text-slate-400 font-sans">
                      Adiciona +3 saltos AS. Rota de backup.
                    </span>
                  </button>

                  {/* Bloquear Anúncio */}
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
                  <span>Aplicação Segura via BGP Route-Refresh (RFC 2918)</span>
                </div>
                <p className="text-[11px] text-slate-400">
                  A tag de comunidade é atualizada na route-policy de origem. O comando <code>refresh bgp all export</code> propaga as comunidades para a operadora sem derrubar a sessão BGP (Zero-Flap).
                </p>
              </div>

              {/* Router Selector Tabs & Live CLI Preview */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <label className="text-slate-300 font-semibold text-xs">
                    Gerar Comandos CLI para:
                  </label>
                  {/* Router Selector Tabs */}
                  <div className="flex bg-slate-950 p-0.5 rounded-xl border border-slate-800 text-[11px] overflow-x-auto">
                    {devices.filter(d => d.is_bgp !== false).map(d => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => setCliTargetRouter(d.id)}
                        className={`px-3 py-1 rounded-lg font-medium transition cursor-pointer whitespace-nowrap ${
                          cliTargetRouter === d.id
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'text-slate-400 hover:text-white'
                        }`}
                      >
                        {d.name}
                      </button>
                    ))}

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
                      : `Terminal do roteador: ${devices.find(d => d.id === cliTargetRouter)?.name || 'Selecionado'}`}
                  </span>
                  <button
                    type="button"
                    onClick={() => handleCopyToClipboard(getPrependCliPreview(), 'prepend')}
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

                <div className="bg-slate-950 border border-slate-800 p-3.5 rounded-xl font-mono text-[11px] text-emerald-400 leading-relaxed whitespace-pre-wrap select-all max-h-52 overflow-y-auto shadow-inner">
                  {getPrependCliPreview()}
                </div>
                <p className="text-slate-400 text-[10px] font-sans">
                  * Cole no seu terminal SSH (Putty). O modo de segurança manual garante que apenas os comandos revisados por você sejam executados.
                </p>
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
                  onClick={() => handleCopyToClipboard(getPrependCliPreview(), 'prepend')}
                  className="px-5 py-2.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-500 hover:to-blue-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 transition cursor-pointer flex items-center gap-2"
                >
                  {copiedKey === 'prepend' ? (
                    <>
                      <Check className="h-4 w-4 text-white" />
                      <span>Comandos Copiados!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      <span>Copiar Comandos para o Terminal</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===================== MODAL: SALVAR ESTADO ATUAL COMO PERFIL ===================== */}
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
                  placeholder="Ex: Operação Padrão, Rompimento Fibra Belém, Manutenção SEA"
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

              {/* Informação sobre os dados capturados */}
              <div className="p-3 bg-slate-950/80 rounded-xl border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <span className="text-cyan-400 font-semibold flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  O que será registrado neste perfil:
                </span>
                <p>• Todos os anúncios BGP e AS-Path Prepends configurados (Download)</p>
                <p>• Todas as preferências de Local-Preference em peers de trânsito e PTTs (Upload)</p>
                <p>• Todas as rotas estáticas ativas direcionadas aos gateways das operadoras</p>
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

      {/* ===================== MODAL: REVISAR DIFERENÇAS E APLICAR CENÁRIO ===================== */}
      {isDiffModalOpen && diffProfile && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/85 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-4xl w-full max-h-[90vh] flex flex-col p-6 shadow-2xl space-y-4">
            
            {/* Modal Header */}
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
                <strong>Modo Seguro Operacional (Zero Commits Automáticos):</strong> Nenhum comando é enviado aos seus roteadores físicos sem a sua revisão e cópia para o terminal SSH. O sistema calcula o diff e gera os scripts prontos para você.
              </span>
            </div>

            {/* Tabs do Modal: Comparativo Visual vs Scripts CLI */}
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
                  <span>Prepends: <strong className="text-white">{diffData.diff.prepends_diff.filter(p => p.changed).length}</strong></span>
                  <span>LocalPref: <strong className="text-white">{diffData.diff.local_prefs_diff.filter(l => l.changed).length}</strong></span>
                  <span>Rotas: <strong className="text-white">{diffData.diff.routes_diff.filter(r => r.action !== 'KEEP').length}</strong></span>
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
                /* TAB 1: COMPARATIVO VISUAL */
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
                                  {p.group_name} <span className="text-slate-500 font-mono text-[10px]">AS{p.remote_as}</span>
                                </td>
                                <td className="px-3 py-2 font-mono text-[11px] text-slate-300">
                                  {p.prefix || 'Todos os prefixos'}
                                </td>
                                <td className="px-3 py-2">
                                  {p.current_block ? (
                                    <span className="text-rose-400 font-bold">Bloqueado (0:0)</span>
                                  ) : (
                                    <span className="text-slate-300 font-mono">{p.current_count} Prepends</span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  {p.target_block ? (
                                    <span className="text-rose-400 font-bold">Bloquear (0:0)</span>
                                  ) : (
                                    <span className={`font-mono font-bold ${p.changed ? 'text-amber-400' : 'text-slate-400'}`}>
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
                                  {lp.peer_name} <span className="text-slate-500 font-mono text-[10px]">AS{lp.remote_as}</span>
                                </td>
                                <td className="px-3 py-2 font-mono text-[11px] text-slate-400">
                                  {lp.peer_ip}
                                </td>
                                <td className="px-3 py-2 font-mono text-slate-300">
                                  {lp.current_pref || '100 (Default)'}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`font-mono font-bold ${lp.changed ? 'text-cyan-400' : 'text-slate-400'}`}>
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
                                <td className="px-3 py-2 font-mono text-[11px] text-white">{r.destination}</td>
                                <td className="px-3 py-2 font-mono text-[11px] text-slate-300">{r.next_hop}</td>
                                <td className="px-3 py-2 font-mono text-slate-400">{r.preference}</td>
                                <td className="px-3 py-2">
                                  <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                    r.action === 'ADD'
                                      ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                                      : r.action === 'DELETE'
                                      ? 'bg-rose-950 border border-rose-800 text-rose-300'
                                      : 'bg-slate-800 text-slate-400'
                                  }`}>
                                    {r.action === 'ADD' ? 'ADICIONAR' : r.action === 'DELETE' ? 'REMOVER' : 'MANTER'}
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
                  {/* Seletor de Roteador para Script */}
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
                      {devices.filter(d => diffData?.scripts_by_device && diffData.scripts_by_device[d.id]).map(d => (
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

                    {/* Botão Copiar Script */}
                    <button
                      type="button"
                      onClick={() => {
                        let text = ''
                        if (selectedDiffDevice === 'all') {
                          text = Object.values(diffData?.scripts_by_device || {}).join('\n\n')
                        } else {
                          text = diffData?.scripts_by_device[selectedDiffDevice] || ''
                        }
                        handleCopyToClipboard(text, 'profile_script')
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

                  {/* Terminal Code Block */}
                  <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl font-mono text-[11px] text-emerald-400 leading-relaxed whitespace-pre-wrap select-all max-h-72 overflow-y-auto shadow-inner">
                    {selectedDiffDevice === 'all'
                      ? Object.values(diffData?.scripts_by_device || {}).join('\n\n') || '# Nenhum comando gerado para este cenário'
                      : diffData?.scripts_by_device[selectedDiffDevice] || '# Nenhum comando necessário para este equipamento'}
                  </div>
                  <p className="text-[10px] text-slate-500 font-sans">
                    * Os comandos acima estão formatados com nodes de route-policy, communities e commits específicos para cada equipamento.
                  </p>
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
                  title="Marca o perfil como ativo no sistema e registra log de auditoria"
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

      {/* ===================== MODAL: GERENCIAR PERFIS ===================== */}
      {isManageModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
                  <Sliders className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Perfis de Tráfego & Cenários de Contingência</h3>
                  <p className="text-xs text-slate-400">Gerencie cenários pré-configurados e criados por você</p>
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
              {profiles.map(p => (
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
    </div>
  )
}

