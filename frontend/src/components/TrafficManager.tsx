import React, { useState, useEffect } from 'react'
import {
  ArrowUpDown,
  Upload,
  Download,
  X,
  ShieldAlert,
  CheckCircle,
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
  fetchASMetadata,
  fetchTrafficProfiles,
  deleteTrafficProfile,
  captureCurrentProfile,
  diffTrafficProfile,
  applyTrafficProfile,
  applyPrepend,
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
  type TrafficProfile,
  type ProfileTag,
  type ProfileDiffResponse,
  type ApplyProfileResult,
  type ASMetadata,
} from '../services/api'
import { useAuth } from '../context/AuthContext'
import {
  copyToClipboard,
  getStaticRouteCliPreview,
  getDeleteStaticRouteCliPreview,
  getLocalPrefCliPreview,
  getPrependCliPreviewForDevice,
  type BatchPrependTarget,
} from './traffic/trafficHelpers'
import { getBGPMasterDevice } from '../utils/bgpMaster'
import { TrafficProfilesBar } from './traffic/TrafficProfilesBar'
import { TrafficUploadTab } from './traffic/TrafficUploadTab'
import { TrafficDownloadTab } from './traffic/TrafficDownloadTab'
import { TrafficModals } from './traffic/TrafficModals'

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
  const { canOperate, isSuperAdmin, user } = useAuth()
  const canCustomizeAS = isSuperAdmin || user?.role === 'admin'
  const [internalSubTab, setInternalSubTab] = useState<'upload' | 'download'>('download')
  const activeSubTab = externalSubTab || internalSubTab
  const setActiveSubTab = (tab: 'upload' | 'download') => {
    setInternalSubTab(tab)
    if (onSubTabChange) onSubTabChange(tab)
  }
  const [devices, setDevices] = useState<Device[]>([])
  const [asMetadata, setAsMetadata] = useState<Record<string, ASMetadata>>({})

  // --- Upload State ---
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

  // Delete Route Modal State
  const [isDeleteRouteModalOpen, setIsDeleteRouteModalOpen] = useState(false)
  const [routeToDelete, setRouteToDelete] = useState<StaticRoute | null>(null)
  const [deleteRouteSuccessMsg, setDeleteRouteSuccessMsg] = useState<string | null>(null)
  const [addRouteSuccessMsg, setAddRouteSuccessMsg] = useState<string | null>(null)

  // AS Customizer Modal State
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

  // Local-Preference Modal State
  const [isLocalPrefModalOpen, setIsLocalPrefModalOpen] = useState(false)
  const [localPrefSection, setLocalPrefSection] = useState<BGPASSection | null>(null)
  const [targetLocalPref, setTargetLocalPref] = useState<number>(100)
  const [localPrefError, setLocalPrefError] = useState<string | null>(null)

  // --- Download State ---
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

  // Download Prepend Modal State
  const [isPrependModalOpen, setIsPrependModalOpen] = useState(false)
  const [targetPrependPrefix, setTargetPrependPrefix] = useState<PrefixPrependState | null>(null)
  const [targetPrependGroup, setTargetPrependGroup] = useState<ASPrependGroup | null>(null)
  const [cliTargetRouter, setCliTargetRouter] = useState<string>('all')
  const [prependCountChoice, setPrependCountChoice] = useState<number>(0)
  const [isBlockChoice, setIsBlockChoice] = useState<boolean>(false)
  const [prependModalError, setPrependModalError] = useState<string | null>(null)
  const [prependSuccessMsg, setPrependSuccessMsg] = useState<string | null>(null)

  // Scheduler / Cache State
  const [syncStatus, setSyncStatus] = useState<TrafficSyncStatus | null>(null)

  // Profiles State
  const [profiles, setProfiles] = useState<TrafficProfile[]>([])
  const [profilesLoading, setProfilesLoading] = useState(false)
  const [selectedProfileId, setSelectedProfileId] = useState<string>('')
  const [activeProfile, setActiveProfile] = useState<TrafficProfile | null>(null)

  // Capture Modal State
  const [isCaptureModalOpen, setIsCaptureModalOpen] = useState(false)
  const [captureName, setCaptureName] = useState('')
  const [captureDesc, setCaptureDesc] = useState('')
  const [captureTag, setCaptureTag] = useState<ProfileTag>('custom')
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

  // Clipboard State
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const handleCopyText = (text: string, key: string) => {
    copyToClipboard(text, () => {
      setCopiedKey(key)
      setTimeout(() => setCopiedKey(null), 3000)
    })
  }

  const loadProfiles = async () => {
    setProfilesLoading(true)
    try {
      const data = await fetchTrafficProfiles()
      setProfiles(data)
      const currentActive = data.find((p) => p.is_active)
      setActiveProfile(currentActive || null)
      if (!selectedProfileId && data.length > 0) {
        setSelectedProfileId(currentActive ? currentActive.id : data[0].id)
      }
    } catch {
      // Ignorar em caso de falha suave
    } finally {
      setProfilesLoading(false)
    }
  }

  const loadInitialData = async () => {
    try {
      const devs = await fetchDevices()
      setDevices(devs)
      if (devs.length > 0) {
        const bgpDevs = devs.filter((d) => d.is_bgp !== false)
        if (bgpDevs.length > 0) {
          setFormDevice(bgpDevs[0].id)
        } else {
          setFormDevice(devs[0].id)
        }
      }
      loadOverview('all')
      loadPrepends('all')
      loadProfiles()
      fetchASMetadata().then((meta) => meta && setAsMetadata(meta)).catch(() => {})
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar dados iniciais')
    }
  }

  useEffect(() => {
    loadInitialData()
  }, [])

  // --- Profile Handlers ---
  const handleOpenCapture = () => {
    if (!canOperate) {
      alert('Operação restrita: Apenas Administrador e Operador NOC podem salvar novos perfis.')
      return
    }
    setCaptureName('')
    setCaptureDesc('')
    setCaptureTag('normal')
    setCaptureError(null)
    setIsCaptureModalOpen(true)
  }

  const handleSaveCapture = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!captureName.trim()) {
      setCaptureError('Informe um nome para o perfil.')
      return
    }
    setCapturing(true)
    setCaptureError(null)
    try {
      const res = await captureCurrentProfile({
        name: captureName.trim(),
        description: captureDesc.trim(),
        tag: captureTag,
        color: captureTag === 'contingency' ? 'rose' : captureTag === 'normal' ? 'emerald' : 'cyan',
      })
      setIsCaptureModalOpen(false)
      setProfileActionMsg(`Perfil "${res.name}" capturado com sucesso!`)
      setTimeout(() => setProfileActionMsg(null), 5000)
      loadProfiles()
    } catch (err: any) {
      setCaptureError(err.message || 'Erro ao salvar perfil.')
    } finally {
      setCapturing(false)
    }
  }

  const handleOpenDiff = async (profile: TrafficProfile) => {
    setDiffProfile(profile)
    setDiffLoading(true)
    setDiffError(null)
    setDiffData(null)
    setApplyResult(null)
    setDiffModalTab('diff')
    setSelectedDiffDevice('all')
    setIsDiffModalOpen(true)

    try {
      const data = await diffTrafficProfile(profile.id)
      setDiffData(data)
    } catch (err: any) {
      setDiffError(err.message || 'Erro ao calcular diferenças do perfil')
    } finally {
      setDiffLoading(false)
    }
  }

  const handleApplyProfile = async (profileId: string) => {
    if (!canOperate) {
      alert('Operação restrita: Apenas Administrador e Operador NOC podem aplicar perfis.')
      return
    }
    setApplyingProfile(true)
    try {
      const res = await applyTrafficProfile(profileId)
      setApplyResult(res)
      setProfileActionMsg(`Cenário "${res.profile_name}" ativado com sucesso!`)
      setTimeout(() => setProfileActionMsg(null), 6000)
      await loadProfiles()
      await loadOverview(selectedDeviceId, true)
      await loadPrepends(selectedPrependDevice, true)
    } catch (err: any) {
      alert(err.message || 'Erro ao aplicar perfil no sistema.')
    } finally {
      setApplyingProfile(false)
    }
  }

  const handleDeleteProfile = async (profileId: string, profileName: string) => {
    if (!canOperate) {
      alert('Operação restrita: Apenas Administrador e Operador NOC podem excluir perfis.')
      return
    }
    if (!confirm(`Deseja realmente excluir o perfil "${profileName}"? Esta ação não pode ser desfeita.`)) {
      return
    }
    setDeletingProfileId(profileId)
    try {
      await deleteTrafficProfile(profileId)
      setProfileActionMsg(`Perfil "${profileName}" excluído.`)
      setTimeout(() => setProfileActionMsg(null), 4000)
      loadProfiles()
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir perfil')
    } finally {
      setDeletingProfileId(null)
    }
  }

  // --- Upload Overview Handlers ---
  const loadOverview = async (devId: string, fresh = false) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchUploadOverview(devId, fresh)
      setUploadOverview(data)
      fetchTrafficStatus().then((st) => st && setSyncStatus(st)).catch(() => {})
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

  // --- Add Route Handlers ---
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

      const cliCode = getStaticRouteCliPreview(
        devices,
        formDevice,
        formDest,
        formNextHop,
        formPref,
        formDesc
      )
      handleCopyText(cliCode, 'add_route')

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
      const cliCode = getDeleteStaticRouteCliPreview(devices, routeToDelete)
      handleCopyText(cliCode, 'delete_route')

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

  // --- AS Customization Handlers ---
  const openCustomizeASModal = (section: BGPASSection) => {
    if (!canCustomizeAS) {
      alert('Acesso restrito: Apenas administradores podem personalizar nome e imagem de AS.')
      return
    }
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

  const openCustomizeASModalFromGroup = (group: ASPrependGroup) => {
    if (!canCustomizeAS) {
      alert('Acesso restrito: Apenas administradores podem personalizar nome e imagem de AS.')
      return
    }
    const meta = asMetadata[group.remote_as] || {
      asn: group.remote_as,
      alias: group.group_name,
      role: group.role,
    }
    const customSection: BGPASSection = {
      id: `grp-${group.remote_as}`,
      device_id: group.device_id || selectedPrependDevice,
      device_name: group.device_name || '',
      device_host: '',
      device_vendor: '',
      remote_as: group.remote_as,
      local_as: '',
      peer_ip: group.peer_ips?.[0] || '',
      peer_name: group.group_name,
      bgp_state: 'Established',
      uptime: '',
      prefixes_received: 0,
      metadata: meta,
      static_routes: [],
    }
    openCustomizeASModal(customSection)
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
      const updatedMeta = await fetchASMetadata().catch(() => null)
      if (updatedMeta) setAsMetadata(updatedMeta)
      loadOverview(selectedDeviceId)
      loadPrepends(selectedPrependDevice)
    } catch (err: any) {
      setAsModalError(err.message || 'Erro ao salvar personalização do AS')
    } finally {
      setAsSaving(false)
    }
  }

  // --- Local-Preference Handlers ---
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
      fetchTrafficStatus().then((st) => st && setSyncStatus(st)).catch(() => {})
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
    const masterDev = getBGPMasterDevice(devices)
    const targetDevId = masterDev?.id || group?.device_id || prefixState.device_id || (selectedPrependDevice !== 'all' ? selectedPrependDevice : 'all')
    setCliTargetRouter(targetDevId)
    setIsPrependModalOpen(true)
  }

  // Batch Prepend Handler: applies prepends targeting the BGP Master Router
  const handleApplyBatchPrepend = async (
    targets: BatchPrependTarget[],
    prependCountChoice: number,
    isBlockChoice: boolean
  ) => {
    if (!canOperate) {
      alert('Operação restrita: Apenas Administrador e Operador NOC podem alterar prepends BGP.')
      return
    }
    const masterDev = getBGPMasterDevice(devices)
    const targetDevId = masterDev?.id || devices[0]?.id
    if (!targetDevId) throw new Error('Nenhum roteador BGP disponível')

    // Execute prepend calls for each target, all targeting the Master router
    for (const target of targets) {
      await applyPrepend({
        device_id: targetDevId,
        peer_ip: target.peerIp,
        prefix: target.prefix,
        prepend_count: prependCountChoice,
        block: isBlockChoice,
      })
    }

    // Optimistic update of prependOverview
    setPrependOverview((prev) => {
      if (!prev) return prev
      const targetIds = new Set(targets.map((t) => `${t.peerIp}_${t.prefix}`))
      const updatedPrefixes = prev.prefixes.map((pfx) => {
        if (targetIds.has(`${pfx.peer_ip}_${pfx.prefix}`)) {
          return {
            ...pfx,
            prepend_count: isBlockChoice ? 0 : prependCountChoice,
            is_blocked: isBlockChoice,
          }
        }
        return pfx
      })

      const updatedGroups = (prev.as_groups || []).map((grp) => ({
        ...grp,
        prefixes: grp.prefixes.map((pfx) => {
          if (targetIds.has(`${pfx.peer_ip}_${pfx.prefix}`)) {
            return {
              ...pfx,
              prepend_count: isBlockChoice ? 0 : prependCountChoice,
              is_blocked: isBlockChoice,
            }
          }
          return pfx
        }),
      }))

      return {
        ...prev,
        prefixes: updatedPrefixes,
        as_groups: updatedGroups,
      }
    })

    setProfileActionMsg(
      `Prepend em lote (${targets.length} ${targets.length === 1 ? 'alvo' : 'alvos'}) aplicado com sucesso no BGP Master ${masterDev?.name || ''}!`
    )
  }

  // Prepend CLI Preview Calculator
  const getPrependCliPreview = () => {
    if (!targetPrependPrefix) return ''
    if (cliTargetRouter === 'all') {
      const bgpDevs = devices.filter(
        (d) => d.is_bgp !== false && (d.vendor === 'huawei' || d.vendor?.startsWith('mikrotik'))
      )
      return bgpDevs
        .map((d) =>
          getPrependCliPreviewForDevice(
            d,
            targetPrependPrefix,
            targetPrependGroup,
            prependCountChoice,
            isBlockChoice
          )
        )
        .join('\n\n')
    }
    const masterDev = getBGPMasterDevice(devices)
    const currentDevice =
      devices.find((d) => d.id === cliTargetRouter) ||
      masterDev ||
      (targetPrependGroup?.device_id ? devices.find((d) => d.id === targetPrependGroup.device_id) : undefined) ||
      devices.find((d) => d.id === targetPrependPrefix.device_id) ||
      devices.find((d) => d.is_bgp !== false) ||
      devices[0]
    return currentDevice
      ? getPrependCliPreviewForDevice(
          currentDevice,
          targetPrependPrefix,
          targetPrependGroup,
          prependCountChoice,
          isBlockChoice
        )
      : ''
  }

  return (
    <div className="space-y-6">
      {/* Read-Only RBAC Alert for Viewers */}
      {!canOperate && (
        <div className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-300 text-xs flex items-center gap-2.5 shadow-lg">
          <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0" />
          <span>
            <strong>Modo Somente Leitura (Visualizador):</strong> Seu usuário possui permissão de leitura analítica.
            As ações de engenharia de tráfego estão bloqueadas e restritas a <strong>Admin</strong> ou <strong>Operador NOC</strong>.
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
                  Gerenciamento inteligente de Upload por AS e Download (AS-Path Prepending)
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

      {/* ===================== BARRA DE PERFIS DE ENGENHARIA DE TRÁFEGO ===================== */}
      <TrafficProfilesBar
        profiles={profiles}
        selectedProfileId={selectedProfileId}
        onSelectProfileId={setSelectedProfileId}
        activeProfile={activeProfile}
        profilesLoading={profilesLoading}
        canOperate={canOperate}
        onOpenDiff={handleOpenDiff}
        onOpenCapture={handleOpenCapture}
        onOpenManage={() => setIsManageModalOpen(true)}
      />

      {/* ===================== ABA 1: UPLOAD ===================== */}
      {activeSubTab === 'upload' && (
        <TrafficUploadTab
          selectedDeviceId={selectedDeviceId}
          onDeviceChange={handleDeviceChange}
          uploadViewMode={uploadViewMode}
          setUploadViewMode={setUploadViewMode}
          search={search}
          setSearch={setSearch}
          devices={devices}
          syncStatus={syncStatus}
          loading={loading}
          error={error}
          uploadOverview={uploadOverview}
          onRefresh={() => loadOverview(selectedDeviceId, true)}
          onOpenAddRouteGeneric={openAddRouteGeneric}
          onOpenAddRouteForSection={openAddRouteForSection}
          onOpenDeleteRoute={openDeleteRouteModal}
          onOpenCustomizeAS={openCustomizeASModal}
          onOpenLocalPref={openLocalPrefModal}
          expandedUploadGroups={expandedUploadGroups}
          onToggleUploadGroup={toggleUploadGroup}
          deletingId={deletingId}
          density={density}
          isSuperAdmin={canCustomizeAS}
        />
      )}

      {/* ===================== ABA 2: DOWNLOAD ===================== */}
      {activeSubTab === 'download' && (
        <TrafficDownloadTab
          selectedPrependDevice={selectedPrependDevice}
          onPrependDeviceChange={handlePrependDeviceChange}
          downloadViewMode={downloadViewMode}
          setDownloadViewMode={setDownloadViewMode}
          prependSearch={prependSearch}
          setPrependSearch={setPrependSearch}
          devices={devices}
          prependsLoading={prependsLoading}
          prependsError={prependsError}
          prependOverview={prependOverview}
          showDownloadHelp={showDownloadHelp}
          setShowDownloadHelp={setShowDownloadHelp}
          expandedPeerGroup={expandedPeerGroup}
          setExpandedPeerGroup={setExpandedPeerGroup}
          expandedPrefixGroups={expandedPrefixGroups}
          togglePrefixGroup={togglePrefixGroup}
          onRefresh={() => loadPrepends(selectedPrependDevice, true)}
          onOpenPrependModal={openPrependModal}
          onApplyBatchPrepend={handleApplyBatchPrepend}
          density={density}
          asMetadata={asMetadata}
          isSuperAdmin={canCustomizeAS}
          onOpenCustomizeAS={openCustomizeASModalFromGroup}
        />
      )}

      {/* ===================== MODAIS DE ENGENHARIA DE TRÁFEGO ===================== */}
      <TrafficModals
        // Add Route
        isAddModalOpen={isAddModalOpen}
        setIsAddModalOpen={setIsAddModalOpen}
        targetSection={targetSection}
        devices={devices}
        formDevice={formDevice}
        setFormDevice={setFormDevice}
        formDest={formDest}
        setFormDest={setFormDest}
        formNextHop={formNextHop}
        setFormNextHop={setFormNextHop}
        formPref={formPref}
        setFormPref={setFormPref}
        formDesc={formDesc}
        setFormDesc={setFormDesc}
        submitting={submitting}
        modalError={modalError}
        copiedKey={copiedKey}
        addRouteSuccessMsg={addRouteSuccessMsg}
        handleAddRoute={handleAddRoute}
        onCopyText={handleCopyText}
        staticRouteCliPreview={getStaticRouteCliPreview(
          devices,
          formDevice,
          formDest,
          formNextHop,
          formPref,
          formDesc
        )}
        // Delete Route
        isDeleteRouteModalOpen={isDeleteRouteModalOpen}
        setIsDeleteRouteModalOpen={setIsDeleteRouteModalOpen}
        routeToDelete={routeToDelete}
        setRouteToDelete={setRouteToDelete}
        deleteRouteSuccessMsg={deleteRouteSuccessMsg}
        deletingId={deletingId}
        handleConfirmDeleteRoute={handleConfirmDeleteRoute}
        deleteStaticRouteCliPreview={getDeleteStaticRouteCliPreview(devices, routeToDelete)}
        // AS Customizer
        isASModalOpen={isASModalOpen}
        setIsASModalOpen={setIsASModalOpen}
        customizingSection={customizingSection}
        asFormAlias={asFormAlias}
        setAsFormAlias={setAsFormAlias}
        asFormRole={asFormRole}
        setAsFormRole={setAsFormRole}
        asFormDescription={asFormDescription}
        setAsFormDescription={setAsFormDescription}
        asFormImageUrl={asFormImageUrl}
        setAsFormImageUrl={setAsFormImageUrl}
        asImagePreview={asImagePreview}
        setAsImagePreview={setAsImagePreview}
        asSaving={asSaving}
        asModalError={asModalError}
        handleSaveASMetadata={handleSaveASMetadata}
        handleImageFileChange={handleImageFileChange}
        // Local-Pref
        isLocalPrefModalOpen={isLocalPrefModalOpen}
        setIsLocalPrefModalOpen={setIsLocalPrefModalOpen}
        localPrefSection={localPrefSection}
        targetLocalPref={targetLocalPref}
        setTargetLocalPref={setTargetLocalPref}
        localPrefError={localPrefError}
        localPrefCliPreview={getLocalPrefCliPreview(localPrefSection, targetLocalPref)}
        // Prepend
        isPrependModalOpen={isPrependModalOpen}
        setIsPrependModalOpen={setIsPrependModalOpen}
        targetPrependPrefix={targetPrependPrefix}
        targetPrependGroup={targetPrependGroup}
        cliTargetRouter={cliTargetRouter}
        setCliTargetRouter={setCliTargetRouter}
        prependCountChoice={prependCountChoice}
        setPrependCountChoice={setPrependCountChoice}
        isBlockChoice={isBlockChoice}
        setIsBlockChoice={setIsBlockChoice}
        prependModalError={prependModalError}
        prependSuccessMsg={prependSuccessMsg}
        prependCliPreview={getPrependCliPreview()}
        // Capture Profile
        isCaptureModalOpen={isCaptureModalOpen}
        setIsCaptureModalOpen={setIsCaptureModalOpen}
        captureName={captureName}
        setCaptureName={setCaptureName}
        captureTag={captureTag}
        setCaptureTag={setCaptureTag}
        captureDesc={captureDesc}
        setCaptureDesc={setCaptureDesc}
        capturing={capturing}
        captureError={captureError}
        handleSaveCapture={handleSaveCapture}
        // Diff & Staging
        isDiffModalOpen={isDiffModalOpen}
        setIsDiffModalOpen={setIsDiffModalOpen}
        diffProfile={diffProfile}
        diffLoading={diffLoading}
        diffData={diffData}
        diffError={diffError}
        diffModalTab={diffModalTab}
        setDiffModalTab={setDiffModalTab}
        selectedDiffDevice={selectedDiffDevice}
        setSelectedDiffDevice={setSelectedDiffDevice}
        applyResult={applyResult}
        applyingProfile={applyingProfile}
        canOperate={canOperate}
        handleApplyProfile={handleApplyProfile}
        // Manage Profiles
        isManageModalOpen={isManageModalOpen}
        setIsManageModalOpen={setIsManageModalOpen}
        profiles={profiles}
        deletingProfileId={deletingProfileId}
        handleDeleteProfile={handleDeleteProfile}
        handleOpenDiff={handleOpenDiff}
      />
    </div>
  )
}
export default TrafficManager
