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
  ShieldAlert
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
  type ASMetadata
} from '../services/api'
import { CardSkeleton } from './common/Skeleton'

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
  const [isOtherRoutesOpen, setIsOtherRoutesOpen] = useState(true)

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

  useEffect(() => {
    loadInitialData()
  }, [])

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

      await createStaticRoute(formDevice, payload)
      setIsAddModalOpen(false)
      loadOverview(selectedDeviceId, true)
    } catch (err: any) {
      setModalError(err.message || 'Erro ao aplicar rota estática no roteador')
    } finally {
      setSubmitting(false)
    }
  }

  const handleDeleteRoute = async (route: StaticRoute) => {
    const confirmMsg = `Tem certeza que deseja remover a rota estática para ${route.destination} via ${route.next_hop} no equipamento ${route.device_name}?`
    if (!window.confirm(confirmMsg)) {
      return
    }

    setDeletingId(route.id)
    try {
      await deleteStaticRoute(route.device_id, route.destination, route.next_hop)
      loadOverview(selectedDeviceId, true)
    } catch (err: any) {
      alert(err.message || 'Erro ao remover rota estática')
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

  const getLocalPrefCliPreview = () => {
    if (!localPrefSection) return ''
    return [
      'system-view',
      `route-policy ${localPrefSection.import_policy || '<policy>'} permit node ${localPrefSection.import_policy_node || 11}`,
      `apply local-preference ${targetLocalPref}`,
      'commit',
      'return',
      `refresh bgp ${localPrefSection.peer_ip} import`,
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

  // Filtered Other Routes
  const filteredOtherRoutes = (uploadOverview?.other_routes || []).filter(r => {
    const q = search.toLowerCase()
    return (
      r.destination.toLowerCase().includes(q) ||
      r.next_hop.toLowerCase().includes(q) ||
      (r.description && r.description.toLowerCase().includes(q)) ||
      (r.device_name && r.device_name.toLowerCase().includes(q))
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
                                  {sec.metadata.alias || sec.peer_name}
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
                        <div className="p-4 flex-1 flex flex-col justify-between space-y-3">
                          <div>
                            <div className="flex items-center justify-between mb-2.5">
                              <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                                <RouteIcon className="h-3.5 w-3.5 text-cyan-400" />
                                Blocos de Saída Direcionados ({sec.static_routes.length})
                              </span>
                              <span className="text-[10px] text-slate-500 font-mono">
                                via {sec.peer_ip}
                              </span>
                            </div>

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
                                        onClick={() => handleDeleteRoute(route)}
                                        disabled={isDeleting}
                                        title="Remover este bloco do roteador"
                                        className="p-1.5 rounded-lg bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 hover:text-rose-200 border border-rose-900/50 transition cursor-pointer disabled:opacity-50 shrink-0"
                                      >
                                        <Trash2 className={`h-3.5 w-3.5 ${isDeleting ? 'animate-spin' : ''}`} />
                                      </button>
                                    </div>
                                  )
                                })}
                              </div>
                            )}
                          </div>

                          {/* AS Card Footer: Botão de Mais [+] */}
                          <div className="pt-2">
                            <button
                              onClick={() => openAddRouteForSection(sec)}
                              className="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-gradient-to-r from-cyan-600/20 to-blue-600/20 hover:from-cyan-600 hover:to-blue-600 border border-cyan-500/40 hover:border-transparent text-cyan-300 hover:text-white text-xs font-semibold shadow-sm transition cursor-pointer group"
                            >
                              <Plus className="h-4 w-4 text-cyan-400 group-hover:text-white transition" />
                              <span>Adicionar Bloco de Saída</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}

              {/* ================= SEÇÃO: OUTRAS ROTAS ESTÁTICAS / INTERNAS ================= */}
              {filteredOtherRoutes.length > 0 && (
                <div className="bg-slate-900/80 border border-slate-800 rounded-2xl shadow-xl overflow-hidden">
                  <button
                    onClick={() => setIsOtherRoutesOpen(!isOtherRoutesOpen)}
                    className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-800/40 transition cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5">
                      <div className="h-7 w-7 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-400">
                        <RouteIcon className="h-4 w-4" />
                      </div>
                      <div>
                        <span className="text-sm font-bold text-white">Outras Rotas Estáticas / Internas</span>
                        <span className="text-xs text-slate-400 ml-2">
                          ({filteredOtherRoutes.length} rotas para gateways internos ou descarte Null0)
                        </span>
                      </div>
                    </div>
                    {isOtherRoutesOpen ? (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    )}
                  </button>

                  {isOtherRoutesOpen && (
                    <div className="border-t border-slate-800 overflow-x-auto">
                      <table className="w-full text-left border-collapse text-xs">
                        <thead>
                          <tr className="border-b border-slate-800 text-slate-400 font-semibold bg-slate-950/40">
                            <th className="py-3 px-4">Equipamento</th>
                            <th className="py-3 px-4">Destino / Prefixo</th>
                            <th className="py-3 px-4">Próximo Salto / Gateway</th>
                            <th className="py-3 px-4">Preferência</th>
                            <th className="py-3 px-4">Descrição</th>
                            <th className="py-3 px-4 text-right">Ações</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800/60 font-mono">
                          {filteredOtherRoutes.map((r) => {
                            const isDiscard = r.next_hop.toUpperCase().includes('NULL')
                            const isDeleting = deletingId === r.id
                            return (
                              <tr key={r.id} className="hover:bg-slate-800/30 transition">
                                <td className="py-3 px-4 font-sans font-medium text-slate-200">
                                  {r.device_name}
                                </td>
                                <td className="py-3 px-4">
                                  <span
                                    className={`px-2 py-0.5 rounded font-bold ${
                                      isDiscard
                                        ? 'bg-slate-800 text-slate-300 border border-slate-700'
                                        : 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                                    }`}
                                  >
                                    {r.destination}
                                  </span>
                                </td>
                                <td className="py-3 px-4 font-semibold text-slate-300">
                                  {r.next_hop}
                                </td>
                                <td className="py-3 px-4 text-slate-400">
                                  {r.preference || 60}
                                </td>
                                <td className="py-3 px-4 font-sans text-slate-400">
                                  {r.description || '-'}
                                </td>
                                <td className="py-3 px-4 text-right">
                                  <button
                                    onClick={() => handleDeleteRoute(r)}
                                    disabled={isDeleting}
                                    title="Remover rota estática"
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
                  )}
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
                              onClick={() => handleDeleteRoute(route)}
                              disabled={isDeleting}
                              title="Remover rota estática"
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
          {/* Active Download Traffic Engineering Callout */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-indigo-950/40 to-slate-900 border border-indigo-800/60 flex items-start gap-3 shadow-md">
            <ShieldCheck className="h-5 w-5 text-indigo-400 shrink-0 mt-0.5" />
            <div className="text-xs space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-bold text-indigo-200 uppercase tracking-wide">
                  Engenharia de Tráfego de Download (AS-Path Prepending & Bloqueio Seletivo)
                </span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-950 border border-emerald-800 text-emerald-400 text-[10px] font-bold">
                  Zero Flap &bull; Route-Refresh Ativo
                </span>
              </div>
              <p className="text-slate-400">
                Ajuste o caminho de entrada do seu tráfego por bloco IP e por operadora através de Community Tagging de origem. Aplicações em produção são efetivadas com soft-refresh sem reiniciar sessões BGP.
              </p>
            </div>
          </div>

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
                                      <span
                                        className="font-mono text-[11px] font-bold text-indigo-300 bg-indigo-950/80 px-2 py-0.5 rounded border border-indigo-800/80"
                                        title={`Comunidade BGP base: 1:${grp.community_base}X`}
                                      >
                                        Tag: 1:{grp.community_base}X
                                      </span>
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
                            <div className="p-4 flex-1 flex flex-col justify-between space-y-3 bg-slate-900/40">
                              <div>
                                <div className="flex items-center justify-between mb-2.5">
                                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                    <RouteIcon className="h-3.5 w-3.5 text-indigo-400" />
                                    Prefixos Anunciados ({grp.prefixes.length})
                                  </span>
                                  <span className="text-[10px] text-slate-500">
                                    Engenharia por Bloco
                                  </span>
                                </div>

                                <div className="space-y-2">
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
                              </div>

                              {/* Footer Info */}
                              <div className="pt-2 text-[10px] text-slate-500 flex items-center gap-1.5 border-t border-slate-800/40">
                                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                                <span>Ajustar este bloco afeta simultaneamente todas as {grp.peer_count} sessões deste AS sem repetição.</span>
                              </div>
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
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl space-y-4">
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

            {modalError && (
              <div className="p-3 rounded-lg bg-rose-950/50 border border-rose-800 text-rose-300 text-xs">
                {modalError}
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
                      {d.name} ({d.host}) - {d.vendor}
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

              {/* Preferência */}
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
                  <span className="text-[10px] text-slate-500 mt-0.5 block">Huawei padrão: 60</span>
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

              {/* Informative Command Preview */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800 font-mono text-[11px] text-slate-300 space-y-1">
                <span className="text-slate-500 text-[10px] uppercase tracking-wider font-sans block">
                  Comando que será enviado ao roteador:
                </span>
                <p className="text-cyan-400">
                  ip route-static {formDest || '<bloco>'} {formNextHop || '<gateway>'} preference {formPref || '60'} {formDesc ? `description ${formDesc}` : ''}
                </p>
                <p className="text-slate-500 text-[10px] font-sans">
                  * No Huawei, o comando entra em system-view e executa <strong>commit</strong> imediatamente.
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
                  type="submit"
                  disabled={submitting}
                  className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-semibold rounded-xl shadow-lg shadow-cyan-600/30 transition cursor-pointer disabled:opacity-50 flex items-center gap-2"
                >
                  {submitting ? (
                    <>
                      <RefreshCw className="h-4 w-4 animate-spin" />
                      <span>Enviando Comando...</span>
                    </>
                  ) : (
                    <>
                      <Check className="h-4 w-4" />
                      <span>Enviar Comando para o Roteador</span>
                    </>
                  )}
                </button>
              </div>
            </form>
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
    </div>
  )
}
