import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import L from 'leaflet'
import {
  MapPin,
  Search,
  Terminal,
  ArrowUpDown,
  CheckCircle2,
  Compass,
  Edit2,
  Plus,
  KeyRound,
  ShieldCheck,
  X,
  Sparkles,
  Route,
  Waypoints,
  Trash2,
  Cable,
  Check,
  Sliders,
  Undo2,
  Activity,
  AlertTriangle,
  RefreshCw,
  Copy,
  CheckCircle,
  Link2,
  ArrowDown,
  ArrowUp,
  Gauge,
  Maximize2,
  Minimize2,
} from 'lucide-react'
import type { Device, DeviceRole } from '../../services/api'
import {
  fetchBackboneLinks,
  createBackboneLink,
  updateBackboneLink,
  deleteBackboneLink,
  calculateRoadRoute,
  haversineDistance,
  fetchZabbixConfig,
  saveZabbixConfig,
  testZabbixConnection,
  syncZabbixLinks,
  fetchZabbixWebhookScript,
  fetchDeviceInterfaces,
  collectLinkTraffic,
  collectAllLinksTraffic,
  formatBps,
  parseCapacityToBps,
  type BackboneLink,
  type LinkType,
  type LinkRoutingMode,
  type LinkStatus,
  type ZabbixConfig,
  type ZabbixSyncResult,
  type ZabbixWebhookScriptResponse,
} from '../../services/api'
import { isBGPMasterDevice } from '../../utils/bgpMaster'

export type MapLayerType = 'google_satellite' | 'google_streets' | 'esri_dark' | 'google_terrain'

interface LayerOption {
  id: MapLayerType
  name: string
  shortName: string
  icon: string
  description: string
  url: (apiKey?: string) => string
  attribution: string
  maxZoom: number
  subdomains?: string[]
}

const LAYER_PROVIDERS: Record<MapLayerType, LayerOption> = {
  google_satellite: {
    id: 'google_satellite',
    name: 'Google Maps Satélite (Híbrido)',
    shortName: 'Satélite',
    icon: '🛰️',
    description: 'Imagens aéreas de alta resolução com nomes de cidades e rodovias',
    url: (key) =>
      key
        ? `https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}&key=${encodeURIComponent(key)}`
        : 'https://mt{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps',
    maxZoom: 20,
    subdomains: ['0', '1', '2', '3'],
  },
  google_streets: {
    id: 'google_streets',
    name: 'Google Maps Ruas (Roadmap)',
    shortName: 'Ruas',
    icon: '🗺️',
    description: 'Mapa rodoviário clássico do Google Maps',
    url: (key) =>
      key
        ? `https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}&key=${encodeURIComponent(key)}`
        : 'https://mt{s}.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps',
    maxZoom: 20,
    subdomains: ['0', '1', '2', '3'],
  },
  esri_dark: {
    id: 'esri_dark',
    name: 'NOC Dark Gray (Esri ArcGIS)',
    shortName: 'NOC Escuro',
    icon: '🌑',
    description: 'Cartografia escura profissional para NOCs de telecomunicações',
    url: () =>
      'https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/World_Dark_Gray_Base/MapServer/tile/{z}/{y}/{x}',
    attribution: '&copy; Esri &mdash; Esri, DeLorme, NAVTEQ',
    maxZoom: 16,
    subdomains: ['a', 'b', 'c'],
  },
  google_terrain: {
    id: 'google_terrain',
    name: 'Google Maps Terreno / Relevo',
    shortName: 'Relevo',
    icon: '⛰️',
    description: 'Topografia e curvas de relevo geográfico',
    url: (key) =>
      key
        ? `https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}&key=${encodeURIComponent(key)}`
        : 'https://mt{s}.google.com/vt/lyrs=p&x={x}&y={y}&z={z}',
    attribution: '&copy; Google Maps',
    maxZoom: 18,
    subdomains: ['0', '1', '2', '3'],
  },
}

export interface BackboneMapViewProps {
  devices: Device[]
  onEditDevice?: (dev: Device) => void
  onSelectDeviceForTerminal?: (dev: Device) => void
  onSelectDeviceForBGP?: (dev: Device) => void
  onAddDevice?: () => void
  onUpdateCoordinates?: (deviceId: string, lat: number, lng: number) => Promise<void>
}

// Visual color tokens per backbone role
const ROLE_CONFIG: Record<
  DeviceRole,
  { label: string; bg: string; text: string; border: string; markerColor: string; icon: string }
> = {
  bgp: {
    label: 'BGP (Borda)',
    bg: 'bg-blue-950/70',
    text: 'text-blue-400',
    border: 'border-blue-500/40',
    markerColor: '#3B82F6',
    icon: 'BGP',
  },
  pe: {
    label: 'PE (Distribuição)',
    bg: 'bg-purple-950/70',
    text: 'text-purple-400',
    border: 'border-purple-500/40',
    markerColor: '#A855F7',
    icon: 'PE',
  },
  sw: {
    label: 'SW (Switch Core)',
    bg: 'bg-emerald-950/70',
    text: 'text-emerald-400',
    border: 'border-emerald-500/40',
    markerColor: '#10B981',
    icon: 'SW',
  },
  olt: {
    label: 'OLT (Óptica)',
    bg: 'bg-amber-950/70',
    text: 'text-amber-400',
    border: 'border-amber-500/40',
    markerColor: '#F59E0B',
    icon: 'OLT',
  },
  other: {
    label: 'Backbone / Outro',
    bg: 'bg-slate-900/80',
    text: 'text-slate-300',
    border: 'border-slate-700',
    markerColor: '#64748B',
    icon: 'DEV',
  },
}

const LINK_COLOR_PALETTE = [
  { id: '#00E5FF', label: 'Ciano Neon' },
  { id: '#10B981', label: 'Esmeralda' },
  { id: '#F59E0B', label: 'Âmbar' },
  { id: '#A855F7', label: 'Púrpura' },
  { id: '#EC4899', label: 'Rosa' },
  { id: '#3B82F6', label: 'Azul BGP' },
]

const CAPACITY_PRESETS = ['1G', '10G', '40G', '100G', '200G', '400G']

/**
 * Calculates the exact geographic midpoint (at 50% cumulative distance) along a cable path.
 * Guarantees traffic badges sit centered along the cable line away from endpoints/routers.
 */
function calculatePathMidpoint(path: [number, number][]): [number, number] {
  if (!path || path.length === 0) return [0, 0]
  if (path.length === 1) return path[0]
  if (path.length === 2) {
    return [(path[0][0] + path[1][0]) / 2, (path[0][1] + path[1][1]) / 2]
  }

  let totalDist = 0
  const dists: number[] = [0]
  for (let i = 0; i < path.length - 1; i++) {
    const d = haversineDistance(path[i], path[i + 1])
    totalDist += d
    dists.push(totalDist)
  }

  if (totalDist <= 0) return path[Math.floor(path.length / 2)]

  const targetDist = totalDist / 2
  for (let i = 0; i < path.length - 1; i++) {
    if (dists[i + 1] >= targetDist) {
      const segLen = dists[i + 1] - dists[i]
      const ratio = segLen > 0 ? (targetDist - dists[i]) / segLen : 0.5
      return [
        Number((path[i][0] + (path[i + 1][0] - path[i][0]) * ratio).toFixed(6)),
        Number((path[i][1] + (path[i + 1][1] - path[i][1]) * ratio).toFixed(6)),
      ]
    }
  }

  return path[Math.floor(path.length / 2)]
}

export const BackboneMapView: React.FC<BackboneMapViewProps> = ({
  devices,
  onEditDevice,
  onSelectDeviceForTerminal,
  onSelectDeviceForBGP,
  onAddDevice,
  onUpdateCoordinates,
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null)
  const mapInstanceRef = useRef<L.Map | null>(null)
  const linksLayerRef = useRef<L.LayerGroup | null>(null)
  const editLayerRef = useRef<L.LayerGroup | null>(null)
  const markersLayerRef = useRef<L.LayerGroup | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)

  // Filters state
  const [roleFilter, setRoleFilter] = useState<'all' | DeviceRole>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [search, setSearch] = useState('')
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)

  // Backbone Links state
  const [links, setLinks] = useState<BackboneLink[]>([])
  const [loadingLinks, setLoadingLinks] = useState(false)
  const [selectedLink, setSelectedLink] = useState<BackboneLink | null>(null)
  const [isLinksDrawerOpen, setIsLinksDrawerOpen] = useState(false)

  // Fullscreen view state
  const mapWrapperRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isFsMenuVisible, setIsFsMenuVisible] = useState(false)
  const fsMenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fsMenuRef = useRef<HTMLDivElement>(null)

  const showFsMenu = useCallback(() => {
    if (fsMenuTimerRef.current) {
      clearTimeout(fsMenuTimerRef.current)
      fsMenuTimerRef.current = null
    }
    setIsFsMenuVisible(true)
  }, [])

  const scheduleHideFsMenu = useCallback(() => {
    if (fsMenuTimerRef.current) {
      clearTimeout(fsMenuTimerRef.current)
    }
    fsMenuTimerRef.current = setTimeout(() => {
      // Don't hide if an input inside the menu is currently focused
      if (document.activeElement && fsMenuRef.current?.contains(document.activeElement)) {
        return
      }
      setIsFsMenuVisible(false)
    }, 5000)
  }, [])

  const toggleFullscreen = useCallback(async () => {
    try {
      if (!document.fullscreenElement) {
        if (mapWrapperRef.current?.requestFullscreen) {
          await mapWrapperRef.current.requestFullscreen()
        }
        setIsFullscreen(true)
      } else {
        if (document.exitFullscreen) {
          await document.exitFullscreen()
        }
        setIsFullscreen(false)
      }
    } catch {
      // Fallback to CSS-only fullscreen
      setIsFullscreen((prev) => !prev)
    }
  }, [])

  useEffect(() => {
    const handleFullscreenChange = () => {
      const isFs = !!document.fullscreenElement
      setIsFullscreen(isFs)
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize()
      }, 150)
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize()
      }, 400)
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {})
        }
        setIsFullscreen(false)
      }
    }

    document.addEventListener('fullscreenchange', handleFullscreenChange)
    window.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange)
      window.removeEventListener('keydown', handleKeyDown)
    }
  }, [isFullscreen])

  useEffect(() => {
    if (!isFullscreen) {
      setIsFsMenuVisible(false)
      if (fsMenuTimerRef.current) {
        clearTimeout(fsMenuTimerRef.current)
        fsMenuTimerRef.current = null
      }
    } else {
      // Starts hidden in fullscreen mode to prioritize the map
      setIsFsMenuVisible(false)
      if (fsMenuTimerRef.current) {
        clearTimeout(fsMenuTimerRef.current)
        fsMenuTimerRef.current = null
      }
    }
  }, [isFullscreen])

  useEffect(() => {
    return () => {
      if (fsMenuTimerRef.current) {
        clearTimeout(fsMenuTimerRef.current)
      }
    }
  }, [])

  useEffect(() => {
    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize()
    }, 120)
    setTimeout(() => {
      mapInstanceRef.current?.invalidateSize()
    }, 350)
  }, [isFullscreen])

  // Link Creation & Editing State
  const [isLinkModalOpen, setIsLinkModalOpen] = useState(false)
  const [editingLinkTarget, setEditingLinkTarget] = useState<BackboneLink | null>(null)
  const [linkFormSourceId, setLinkFormSourceId] = useState('')
  const [linkFormTargetId, setLinkFormTargetId] = useState('')
  const [linkFormName, setLinkFormName] = useState('')
  const [linkFormType, setLinkFormType] = useState<LinkType>('fiber')
  const [linkFormRoutingMode, setLinkFormRoutingMode] = useState<LinkRoutingMode>('road')
  const [linkFormCapacity, setLinkFormCapacity] = useState('10G')
  const [linkFormColor, setLinkFormColor] = useState('#00E5FF')
  const [linkFormStatus, setLinkFormStatus] = useState<LinkStatus>('active')
  const [linkFormNotes, setLinkFormNotes] = useState('')
  const [linkFormWaypoints, setLinkFormWaypoints] = useState<[number, number][]>([])
  const [linkFormPath, setLinkFormPath] = useState<[number, number][]>([])
  const [linkFormDistanceKm, setLinkFormDistanceKm] = useState(0)
  const [isCalculatingRoute, setIsCalculatingRoute] = useState(false)
  const [isSavingLink, setIsSavingLink] = useState(false)

  // Source & Target Interface Assignment for Links
  const [linkFormSourceIface, setLinkFormSourceIface] = useState('')
  const [linkFormTargetIface, setLinkFormTargetIface] = useState('')
  const [linkFormTrafficEnd, setLinkFormTrafficEnd] = useState<'source' | 'target'>('source')
  const [isCollectingTraffic, setIsCollectingTraffic] = useState(false)
  const [sourceInterfaces, setSourceInterfaces] = useState<string[]>([])
  const [targetInterfaces, setTargetInterfaces] = useState<string[]>([])
  const [loadingSourceIfaces, setLoadingSourceIfaces] = useState(false)
  const [loadingTargetIfaces, setLoadingTargetIfaces] = useState(false)

  // Zabbix Integration State
  const [isZabbixModalOpen, setIsZabbixModalOpen] = useState(false)
  const [zabbixConfig, setZabbixConfig] = useState<ZabbixConfig | null>(null)
  const [zabbixFormUrl, setZabbixFormUrl] = useState('')
  const [zabbixFormToken, setZabbixFormToken] = useState('')
  const [zabbixFormUser, setZabbixFormUser] = useState('')
  const [zabbixFormPass, setZabbixFormPass] = useState('')
  const [zabbixFormSecret, setZabbixFormSecret] = useState('')
  const [zabbixFormEnabled, setZabbixFormEnabled] = useState(true)
  const [zabbixActiveTab, setZabbixActiveTab] = useState<'config' | 'webhook' | 'sync'>('config')
  const [testingZabbix, setTestingZabbix] = useState(false)
  const [testResult, setTestResult] = useState<{ success: boolean; version?: string; error?: string } | null>(null)
  const [syncingZabbix, setSyncingZabbix] = useState(false)
  const [syncResult, setSyncResult] = useState<ZabbixSyncResult | null>(null)
  const [webhookScriptData, setWebhookScriptData] = useState<ZabbixWebhookScriptResponse | null>(null)
  const [copiedScript, setCopiedScript] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)
  const [isSavingZabbix, setIsSavingZabbix] = useState(false)

  // Interactive Map Modes for Links
  const [isAddWaypointMode, setIsAddWaypointMode] = useState(false)
  const [isManualDrawMode, setIsManualDrawMode] = useState(false)
  const [isEditingLinkPath, setIsEditingLinkPath] = useState(false)
  const [editingPath, setEditingPath] = useState<[number, number][]>([])
  const [editingDistanceKm, setEditingDistanceKm] = useState(0)

  // Map Layer & Google Maps API configuration
  const [activeLayer, setActiveLayer] = useState<MapLayerType>(() => {
    const stored = localStorage.getItem('netpulse_map_layer')
    if (
      stored === 'google_satellite' ||
      stored === 'google_streets' ||
      stored === 'esri_dark' ||
      stored === 'google_terrain'
    ) {
      return stored as MapLayerType
    }
    localStorage.setItem('netpulse_map_layer', 'google_satellite')
    return 'google_satellite'
  })

  const [googleApiKey, setGoogleApiKey] = useState<string>(() => {
    return (
      localStorage.getItem('netpulse_google_maps_api_key') ||
      (import.meta.env.VITE_GOOGLE_MAPS_API_KEY as string) ||
      ''
    )
  })

  const [isApiKeyModalOpen, setIsApiKeyModalOpen] = useState(false)
  const [tempApiKey, setTempApiKey] = useState(googleApiKey)
  const [showKeySecret, setShowKeySecret] = useState(false)
  const [keySavedToast, setKeySavedToast] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  // Load Links from API
  const loadLinks = useCallback(async () => {
    setLoadingLinks(true)
    try {
      const data = await fetchBackboneLinks()
      setLinks(data)
    } catch {
      // Non-blocking fallback
    } finally {
      setLoadingLinks(false)
    }
  }, [])

  useEffect(() => {
    loadLinks()
  }, [loadLinks])

  // Periodic background polling for link traffic (every 30 seconds)
  useEffect(() => {
    if (links.length === 0) return
    const interval = setInterval(async () => {
      try {
        const res = await collectAllLinksTraffic()
        if (res && res.links && res.links.length > 0) {
          setLinks((prev) =>
            prev.map((l) => {
              const updated = res.links.find((u) => u.id === l.id)
              return updated || l
            })
          )
          setSelectedLink((prev) => {
            if (!prev) return null
            const updated = res.links.find((u) => u.id === prev.id)
            return updated || prev
          })
        }
      } catch {
        // Non-blocking background poll
      }
    }, 30000)
    return () => clearInterval(interval)
  }, [links.length])

  // Load Zabbix configuration on mount
  useEffect(() => {
    fetchZabbixConfig()
      .then((cfg) => {
        setZabbixConfig(cfg)
        setZabbixFormUrl(cfg.url || '')
        setZabbixFormUser(cfg.username || '')
        setZabbixFormSecret(cfg.webhook_secret || '')
        setZabbixFormEnabled(cfg.enabled)
      })
      .catch(() => {})
  }, [])

  // Auto-fetch interfaces for Source Device
  useEffect(() => {
    if (!linkFormSourceId) {
      setSourceInterfaces([])
      return
    }
    let cancelled = false
    setLoadingSourceIfaces(true)
    fetchDeviceInterfaces(linkFormSourceId)
      .then((res) => {
        if (!cancelled && res.interfaces) {
          setSourceInterfaces(res.interfaces)
        }
      })
      .catch(() => {
        if (!cancelled) setSourceInterfaces([])
      })
      .finally(() => {
        if (!cancelled) setLoadingSourceIfaces(false)
      })
    return () => {
      cancelled = true
    }
  }, [linkFormSourceId])

  // Auto-fetch interfaces for Target Device
  useEffect(() => {
    if (!linkFormTargetId) {
      setTargetInterfaces([])
      return
    }
    let cancelled = false
    setLoadingTargetIfaces(true)
    fetchDeviceInterfaces(linkFormTargetId)
      .then((res) => {
        if (!cancelled && res.interfaces) {
          setTargetInterfaces(res.interfaces)
        }
      })
      .catch(() => {
        if (!cancelled) setTargetInterfaces([])
      })
      .finally(() => {
        if (!cancelled) setLoadingTargetIfaces(false)
      })
    return () => {
      cancelled = true
    }
  }, [linkFormTargetId])

  // Fetch Webhook Script when Zabbix modal is opened
  useEffect(() => {
    if (isZabbixModalOpen) {
      fetchZabbixWebhookScript()
        .then((data) => setWebhookScriptData(data))
        .catch(() => {})
    }
  }, [isZabbixModalOpen])

  const handleSelectLayer = (layer: MapLayerType) => {
    setActiveLayer(layer)
    localStorage.setItem('netpulse_map_layer', layer)
  }

  const handleSaveApiKey = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = tempApiKey.trim()
    setGoogleApiKey(trimmed)
    if (trimmed) {
      localStorage.setItem('netpulse_google_maps_api_key', trimmed)
    } else {
      localStorage.removeItem('netpulse_google_maps_api_key')
    }
    setKeySavedToast(true)
    setTimeout(() => {
      setKeySavedToast(false)
      setIsApiKeyModalOpen(false)
    }, 1200)
  }

  const handleRemoveApiKey = () => {
    setTempApiKey('')
    setGoogleApiKey('')
    localStorage.removeItem('netpulse_google_maps_api_key')
    setKeySavedToast(true)
    setTimeout(() => {
      setKeySavedToast(false)
      setIsApiKeyModalOpen(false)
    }, 800)
  }

  // Close API key modal on Escape
  useEffect(() => {
    if (!isApiKeyModalOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsApiKeyModalOpen(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isApiKeyModalOpen])

  // Device coordinate placement mode
  const [placingDeviceId, setPlacingDeviceId] = useState<string | null>(null)
  const [savingLocation, setSavingLocation] = useState(false)

  // Cancel placement mode or drawing mode on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (placingDeviceId) setPlacingDeviceId(null)
        if (isAddWaypointMode) {
          setIsAddWaypointMode(false)
          setIsLinkModalOpen(true)
        }
        if (isManualDrawMode) {
          setIsManualDrawMode(false)
          setIsLinkModalOpen(true)
        }
        if (isEditingLinkPath) {
          setIsEditingLinkPath(false)
          setEditingLinkTarget(null)
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [placingDeviceId, isAddWaypointMode, isManualDrawMode, isEditingLinkPath])

  // Classify devices into placed on map vs unplaced
  const placedDevices = useMemo(() => {
    return devices.filter(
      (d) =>
        d.latitude !== undefined &&
        d.latitude !== null &&
        d.longitude !== undefined &&
        d.longitude !== null &&
        !isNaN(Number(d.latitude)) &&
        !isNaN(Number(d.longitude))
    )
  }, [devices])

  const unplacedDevices = useMemo(() => {
    return devices.filter(
      (d) =>
        d.latitude === undefined ||
        d.latitude === null ||
        d.longitude === undefined ||
        d.longitude === null ||
        isNaN(Number(d.latitude)) ||
        isNaN(Number(d.longitude))
    )
  }, [devices])

  // Filtered devices to display on map
  const visibleDevices = useMemo(() => {
    return placedDevices.filter((dev) => {
      const role = dev.device_role || (dev.is_bgp ? 'bgp' : 'sw')
      if (roleFilter !== 'all' && role !== roleFilter) return false
      if (statusFilter !== 'all' && dev.status !== statusFilter) return false
      if (search.trim()) {
        const q = search.toLowerCase()
        const matches =
          dev.name.toLowerCase().includes(q) ||
          dev.host.toLowerCase().includes(q) ||
          (dev.site && dev.site.toLowerCase().includes(q)) ||
          (dev.city && dev.city.toLowerCase().includes(q)) ||
          (dev.model && dev.model.toLowerCase().includes(q))
        if (!matches) return false
      }
      return true
    })
  }, [placedDevices, roleFilter, statusFilter, search])

  // Backbone KPI counts
  const counts = useMemo(() => {
    const res: Record<DeviceRole, number> & {
      total: number
      online: number
      offline: number
      placed: number
      unplaced: number
      links: number
      totalFiberKm: number
    } = {
      total: devices.length,
      bgp: 0,
      pe: 0,
      sw: 0,
      olt: 0,
      other: 0,
      online: 0,
      offline: 0,
      placed: placedDevices.length,
      unplaced: unplacedDevices.length,
      links: links.length,
      totalFiberKm: Number(links.reduce((acc, l) => acc + (l.distance_km || 0), 0).toFixed(1)),
    }
    devices.forEach((d) => {
      const r = d.device_role || (d.is_bgp ? 'bgp' : 'sw')
      if (r === 'bgp') res.bgp++
      else if (r === 'pe') res.pe++
      else if (r === 'sw') res.sw++
      else if (r === 'olt') res.olt++
      else res.other++

      if (d.status === 'online') res.online++
      else res.offline++
    })
    return res
  }, [devices, placedDevices, unplacedDevices, links])

  // Route calculation engine
  const handleRecalculateRoute = useCallback(
    async (
      sourceId: string,
      targetId: string,
      mode: LinkRoutingMode,
      waypoints: [number, number][] = []
    ) => {
      const src = devices.find((d) => d.id === sourceId)
      const tgt = devices.find((d) => d.id === targetId)
      if (
        !src ||
        !tgt ||
        src.latitude == null ||
        src.longitude == null ||
        tgt.latitude == null ||
        tgt.longitude == null
      ) {
        return
      }

      const pStart: [number, number] = [Number(src.latitude), Number(src.longitude)]
      const pEnd: [number, number] = [Number(tgt.latitude), Number(tgt.longitude)]

      if (mode === 'direct') {
        const path: [number, number][] = [pStart, pEnd]
        setLinkFormPath(path)
        setLinkFormDistanceKm(Number(haversineDistance(pStart, pEnd).toFixed(2)))
        return
      }

      if (mode === 'road') {
        setIsCalculatingRoute(true)
        try {
          const points: [number, number][] = [pStart, ...waypoints, pEnd]
          const result = await calculateRoadRoute(points)
          setLinkFormPath(result.path)
          setLinkFormDistanceKm(result.distanceKm)
        } finally {
          setIsCalculatingRoute(false)
        }
        return
      }

      // mode === 'manual': if no points, initialize endpoints
      if (linkFormPath.length < 2) {
        const path: [number, number][] = [pStart, pEnd]
        setLinkFormPath(path)
        setLinkFormDistanceKm(Number(haversineDistance(pStart, pEnd).toFixed(2)))
      }
    },
    [devices, linkFormPath.length]
  )

  // Synchronize ref callbacks for Leaflet event listener
  const placingDeviceIdRef = useRef<string | null>(placingDeviceId)
  const isAddWaypointModeRef = useRef(isAddWaypointMode)
  const isManualDrawModeRef = useRef(isManualDrawMode)
  const isEditingLinkPathRef = useRef(isEditingLinkPath)
  const linkSourceIdRef = useRef(linkFormSourceId)
  const linkTargetIdRef = useRef(linkFormTargetId)
  const linkWaypointsRef = useRef(linkFormWaypoints)
  const handleRecalculateRouteRef = useRef(handleRecalculateRoute)
  const onUpdateCoordinatesRef = useRef(onUpdateCoordinates)
  const hasAutoFittedRef = useRef(false)

  useEffect(() => {
    placingDeviceIdRef.current = placingDeviceId
    isAddWaypointModeRef.current = isAddWaypointMode
    isManualDrawModeRef.current = isManualDrawMode
    isEditingLinkPathRef.current = isEditingLinkPath
    linkSourceIdRef.current = linkFormSourceId
    linkTargetIdRef.current = linkFormTargetId
    linkWaypointsRef.current = linkFormWaypoints
    handleRecalculateRouteRef.current = handleRecalculateRoute
    onUpdateCoordinatesRef.current = onUpdateCoordinates
  }, [
    placingDeviceId,
    isAddWaypointMode,
    isManualDrawMode,
    isEditingLinkPath,
    linkFormSourceId,
    linkFormTargetId,
    linkFormWaypoints,
    handleRecalculateRoute,
    onUpdateCoordinates,
  ])

  // Invalidate map size when placement or edit mode toggles
  useEffect(() => {
    const timer = setTimeout(() => {
      try {
        mapInstanceRef.current?.invalidateSize()
      } catch {
        // Safe fallback
      }
    }, 50)
    return () => clearTimeout(timer)
  }, [placingDeviceId, isEditingLinkPath, isAddWaypointMode, isManualDrawMode])

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    const initialLat = placedDevices.length > 0 ? Number(placedDevices[0].latitude) : -1.4558
    const initialLng = placedDevices.length > 0 ? Number(placedDevices[0].longitude) : -48.4902

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: placedDevices.length > 0 ? 10 : 5,
      zoomControl: false,
      attributionControl: false,
    })

    L.control.zoom({ position: 'topright' }).addTo(map)

    // Layer groups hierarchy: links at bottom, edit overlay in middle, device markers on top
    const linksGroup = L.layerGroup().addTo(map)
    linksLayerRef.current = linksGroup

    const editGroup = L.layerGroup().addTo(map)
    editLayerRef.current = editGroup

    const markersGroup = L.layerGroup().addTo(map)
    markersLayerRef.current = markersGroup

    mapInstanceRef.current = map
    setMapReady(true)

    setTimeout(() => {
      try {
        map.invalidateSize()
      } catch {
        // Safe fallback
      }
    }, 150)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        try {
          map.invalidateSize()
        } catch {
          // Safe fallback
        }
      })
      resizeObserver.observe(mapContainerRef.current)
    }

    // Unified Leaflet map click listener
    map.on('click', async (e: L.LeafletMouseEvent) => {
      // 1. Placing device coordinates
      const activePlacingId = placingDeviceIdRef.current
      if (activePlacingId && onUpdateCoordinatesRef.current) {
        const { lat, lng } = e.latlng
        setSavingLocation(true)
        try {
          await onUpdateCoordinatesRef.current(activePlacingId, Number(lat.toFixed(6)), Number(lng.toFixed(6)))
          setPlacingDeviceId(null)
        } finally {
          setSavingLocation(false)
        }
        return
      }

      // 2. In interactive cable path editing mode: append vertex
      if (isEditingLinkPathRef.current) {
        const { lat, lng } = e.latlng
        const newCoord: [number, number] = [Number(lat.toFixed(6)), Number(lng.toFixed(6))]
        setEditingPath((prev) => {
          const next = [...prev, newCoord]
          let d = 0
          for (let i = 0; i < next.length - 1; i++) {
            d += haversineDistance(next[i], next[i + 1])
          }
          setEditingDistanceKm(Number(d.toFixed(2)))
          return next
        })
        return
      }

      // 3. Adding alternative waypoint in road routing mode (ramal / vicinal)
      if (isAddWaypointModeRef.current) {
        const { lat, lng } = e.latlng
        const newWp: [number, number] = [Number(lat.toFixed(6)), Number(lng.toFixed(6))]
        setLinkFormWaypoints((prev) => {
          const next = [...prev, newWp]
          handleRecalculateRouteRef.current?.(
            linkSourceIdRef.current,
            linkTargetIdRef.current,
            'road',
            next
          )
          return next
        })
        return
      }

      // 4. Drawing manual cable point-by-point
      if (isManualDrawModeRef.current) {
        const { lat, lng } = e.latlng
        const newCoord: [number, number] = [Number(lat.toFixed(6)), Number(lng.toFixed(6))]
        setLinkFormPath((prev) => {
          const next = [...prev, newCoord]
          let d = 0
          for (let i = 0; i < next.length - 1; i++) {
            d += haversineDistance(next[i], next[i + 1])
          }
          setLinkFormDistanceKm(Number(d.toFixed(2)))
          return next
        })
        return
      }
    })

    return () => {
      if (resizeObserver) resizeObserver.disconnect()
      map.remove()
      mapInstanceRef.current = null
      linksLayerRef.current = null
      editLayerRef.current = null
      markersLayerRef.current = null
      tileLayerRef.current = null
      setMapReady(false)
    }
  }, [])

  // Synchronize dynamic tile layer
  useEffect(() => {
    const map = mapInstanceRef.current
    if (!map || !mapReady) return

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current)
      tileLayerRef.current = null
    }

    const provider = LAYER_PROVIDERS[activeLayer] || LAYER_PROVIDERS.google_satellite
    const tileUrl = provider.url(googleApiKey)
    const subdomains =
      provider.subdomains && provider.subdomains.length > 0
        ? provider.subdomains
        : ['0', '1', '2', '3']

    const newLayer = L.tileLayer(tileUrl, {
      maxZoom: provider.maxZoom || 18,
      subdomains,
      attribution: provider.attribution || '',
    })

    newLayer.addTo(map)
    if ((newLayer as any).bringToBack) {
      ;(newLayer as any).bringToBack()
    }
    tileLayerRef.current = newLayer
  }, [activeLayer, googleApiKey, mapReady])

  // Render Backbone Links on the map
  useEffect(() => {
    const map = mapInstanceRef.current
    const layer = linksLayerRef.current
    if (!map || !layer || !mapReady) return

    layer.clearLayers()

    links.forEach((link) => {
      if (!link.path || link.path.length < 2) return

      const isSelected = selectedLink?.id === link.id
      const isDown = link.status === 'down'
      const color = isDown ? '#EF4444' : (link.color || '#00E5FF')

      // Ensure the rendered path extends completely into the exact coordinates of source and target devices
      const srcDev = devices.find((d) => d.id === link.source_device_id)
      const tgtDev = devices.find((d) => d.id === link.target_device_id)

      const renderedPath: [number, number][] = [...link.path]
      if (srcDev && srcDev.latitude != null && srcDev.longitude != null) {
        const srcCoord: [number, number] = [Number(srcDev.latitude), Number(srcDev.longitude)]
        if (
          Math.abs(srcCoord[0] - renderedPath[0][0]) > 0.00005 ||
          Math.abs(srcCoord[1] - renderedPath[0][1]) > 0.00005
        ) {
          renderedPath.unshift(srcCoord)
        }
      }
      if (tgtDev && tgtDev.latitude != null && tgtDev.longitude != null) {
        const tgtCoord: [number, number] = [Number(tgtDev.latitude), Number(tgtDev.longitude)]
        const lastIdx = renderedPath.length - 1
        if (
          Math.abs(tgtCoord[0] - renderedPath[lastIdx][0]) > 0.00005 ||
          Math.abs(tgtCoord[1] - renderedPath[lastIdx][1]) > 0.00005
        ) {
          renderedPath.push(tgtCoord)
        }
      }

      // Outer glowing halo
      const glowLine = L.polyline(renderedPath, {
        color,
        weight: isSelected ? 10 : (isDown ? 8 : 6),
        opacity: isDown ? 0.8 : (isSelected ? 0.6 : 0.25),
        className: isDown ? 'leaflet-noc-link-down-glow' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
      })

      const hasTraffic =
        (link.traffic_rx_bps != null && link.traffic_rx_bps > 0) ||
        (link.traffic_tx_bps != null && link.traffic_tx_bps > 0)
      const rxText = formatBps(link.traffic_rx_bps || 0)
      const txText = formatBps(link.traffic_tx_bps || 0)
      const capacityBps = parseCapacityToBps(link.capacity)
      const maxTraffic = Math.max(link.traffic_rx_bps || 0, link.traffic_tx_bps || 0)
      const usagePercent = capacityBps > 0 ? Math.min(100, (maxTraffic / capacityBps) * 100) : 0
      const isSaturated = usagePercent >= 85
      const isWarning = usagePercent >= 70 && !isSaturated

      // Inner core cable line
      const coreLine = L.polyline(renderedPath, {
        color: isDown ? '#EF4444' : (isSaturated ? '#EF4444' : color),
        weight: isSelected ? 5 : (isDown ? 4 : (isSaturated ? 4 : 3)),
        opacity: 0.98,
        dashArray: isDown ? '8, 6' : (link.type === 'radio' || link.status === 'planned' ? '6, 6' : undefined),
        className: isDown ? 'leaflet-noc-link-down-pulse' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
      })

      const tooltipContent = `
        <div style="font-family: inherit; font-size: 11px; padding: 4px 6px; line-height: 1.35; min-width: 170px;">
          ${isDown ? '<div style="color: #EF4444; font-weight: 800; font-size: 10px; margin-bottom: 2px; text-transform: uppercase; letter-spacing: 0.5px;">🚨 ROTA FORA DO AR (LINK DOWN - ZABBIX)</div>' : ''}
          <strong style="color: #FFFFFF; font-size: 12px;">${link.name}</strong><br/>
          <span style="color: ${color}; font-weight: 700;">${link.capacity || '10G'}</span> •
          <span style="color: #94A3B8;">${link.distance_km ? link.distance_km.toFixed(1) + ' km' : ''}</span>
          ${link.type === 'radio' ? ' • <span style="color: #F59E0B;">Rádio</span>' : ' • <span style="color: #38BDF8;">Fibra</span>'}
          ${link.source_interface || link.target_interface ? `<br/><span style="color: #A78BFA; font-size: 10px; font-weight: 600;">Portas: ${link.source_interface || '?'} ➔ ${link.target_interface || '?'}</span>` : ''}
          ${hasTraffic ? `
            <div style="margin-top: 4px; padding-top: 4px; border-top: 1px solid rgba(255,255,255,0.15);">
              <div style="font-size: 10px; color: #94A3B8;">Tráfego Atual (${link.traffic_monitored_end === 'target' ? 'Ponta B' : 'Ponta A'}):</div>
              <div style="display: flex; gap: 8px; font-weight: 700; font-family: monospace; font-size: 11px;">
                <span style="color: #38BDF8;">↓ RX: ${rxText}</span>
                <span style="color: #34D399;">↑ TX: ${txText}</span>
              </div>
              ${capacityBps > 0 ? `
                <div style="display: flex; align-items: center; gap: 4px; margin-top: 3px;">
                  <div style="flex: 1; height: 4px; background: rgba(255,255,255,0.15); border-radius: 2px; overflow: hidden;">
                    <div style="width: ${usagePercent.toFixed(1)}%; height: 100%; background: ${usagePercent > 85 ? '#EF4444' : usagePercent > 70 ? '#F59E0B' : '#10B981'};"></div>
                  </div>
                  <span style="font-size: 9px; color: #E2E8F0; font-weight: 600;">${usagePercent.toFixed(0)}%</span>
                </div>
              ` : ''}
            </div>
          ` : ''}
          ${isDown && link.zabbix_problem ? `<br/><span style="color: #FCA5A5; font-size: 10px; font-style: italic;">Falha: ${link.zabbix_problem}</span>` : ''}
        </div>
      `
      glowLine.bindTooltip(tooltipContent, { sticky: true, className: 'leaflet-noc-link-tooltip' })
      coreLine.bindTooltip(tooltipContent, { sticky: true, className: 'leaflet-noc-link-tooltip' })

      const handleClick = (e: L.LeafletMouseEvent) => {
        L.DomEvent.stopPropagation(e)
        setSelectedDevice(null)
        setSelectedLink(link)
      }

      glowLine.on('click', handleClick)
      coreLine.on('click', handleClick)

      glowLine.addTo(layer)
      coreLine.addTo(layer)

      // Floating Midpoint Badge with Live Traffic or Down Alarm (Positioned at 50% cable distance)
      const midCoord = calculatePathMidpoint(renderedPath)
      if (midCoord && (hasTraffic || isDown)) {
        const badgeBorder = isDown
          ? '#EF4444'
          : isSaturated
            ? '#EF4444'
            : isWarning
              ? '#F59E0B'
              : (color || '#00E5FF')

        const badgeGlow = isDown || isSaturated
          ? 'rgba(239, 68, 68, 0.7)'
          : isWarning
            ? 'rgba(245, 158, 11, 0.6)'
            : 'rgba(0, 229, 255, 0.4)'

        const animClass = isDown ? 'noc-badge-down' : (isSaturated ? 'noc-badge-saturated' : '')

        const badgeHtml = `
          <div class="${animClass}"
               style="
                 transform: translate(-50%, -50%);
                 display: inline-flex;
                 align-items: center;
                 gap: 3px;
                 padding: 2px 5px;
                 background: rgba(8, 12, 22, 0.96);
                 backdrop-filter: blur(8px);
                 -webkit-backdrop-filter: blur(8px);
                 border: 1px solid ${badgeBorder};
                 border-radius: 9999px;
                 box-shadow: 0 2px 8px rgba(0, 0, 0, 0.85), 0 0 6px ${badgeGlow};
                 font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
                 user-select: none;
                 white-space: nowrap;
                 cursor: pointer;
                 transition: transform 0.15s ease;
               "
               title="${link.name} • Clique para ver detalhes"
               onmouseover="this.style.transform='translate(-50%, -50%) scale(1.12)'"
               onmouseout="this.style.transform='translate(-50%, -50%) scale(1)'">
            ${
              isDown
                ? `<span style="display: inline-flex; align-items: center; gap: 4px; color: #FFFFFF; font-weight: 900; font-size: 9px; letter-spacing: 0.4px; text-transform: uppercase;">
                    <span style="width: 6px; height: 6px; border-radius: 50%; background: #EF4444; box-shadow: 0 0 6px #EF4444; display: inline-block;"></span>
                    🚨 FORA DO AR (DOWN)
                   </span>`
                : `
                   <!-- RX (Download / Entrada) -->
                   <span style="
                     display: inline-flex;
                     align-items: center;
                     gap: 2.5px;
                     background: rgba(6, 182, 212, 0.22);
                     border: 1px solid rgba(6, 182, 212, 0.55);
                     padding: 1px 4.5px;
                     border-radius: 4px;
                     color: #38BDF8;
                     font-size: 9.5px;
                     font-weight: 800;
                     letter-spacing: 0.1px;
                   ">
                     <span style="font-size: 10px; font-weight: 900; color: #00E5FF; line-height: 1;">↓</span>
                     ${rxText}
                   </span>

                   <!-- TX (Upload / Saída) -->
                   <span style="
                     display: inline-flex;
                     align-items: center;
                     gap: 2.5px;
                     background: rgba(16, 185, 129, 0.22);
                     border: 1px solid rgba(16, 185, 129, 0.55);
                     padding: 1px 4.5px;
                     border-radius: 4px;
                     color: #34D399;
                     font-size: 9.5px;
                     font-weight: 800;
                     letter-spacing: 0.1px;
                   ">
                     <span style="font-size: 10px; font-weight: 900; color: #10B981; line-height: 1;">↑</span>
                     ${txText}
                   </span>

                   <!-- Saturation / Capacity Gauge -->
                   ${
                     isSaturated
                       ? `<span style="
                            background: #DC2626;
                            color: #FFFFFF;
                            font-weight: 900;
                            font-size: 8.5px;
                            padding: 1px 4px;
                            border-radius: 4px;
                            letter-spacing: 0.3px;
                            box-shadow: 0 0 6px rgba(220, 38, 38, 0.85);
                          ">⚠️ ${usagePercent.toFixed(0)}% LOTADO</span>`
                       : isWarning
                         ? `<span style="
                              background: rgba(245, 158, 11, 0.3);
                              border: 1px solid #F59E0B;
                              color: #FBBF24;
                              font-weight: 800;
                              font-size: 8.5px;
                              padding: 1px 4px;
                              border-radius: 4px;
                            ">⚡ ${usagePercent.toFixed(0)}%</span>`
                         : capacityBps > 0
                           ? `<span style="
                                background: rgba(255, 255, 255, 0.08);
                                border: 1px solid rgba(255, 255, 255, 0.15);
                                color: #CBD5E1;
                                font-weight: 700;
                                font-size: 8.5px;
                                padding: 1px 4px;
                                border-radius: 4px;
                              ">${usagePercent.toFixed(0)}% de ${link.capacity || '10G'}</span>`
                           : ''
                   }
                `
            }
          </div>
        `

        const midIcon = L.divIcon({
          html: badgeHtml,
          className: 'leaflet-noc-mid-badge',
          iconSize: [0, 0],
          iconAnchor: [0, 0],
        })
        const midMarker = L.marker(midCoord, { icon: midIcon, interactive: true })
        midMarker.on('click', (e) => {
          L.DomEvent.stopPropagation(e)
          setSelectedDevice(null)
          setSelectedLink(link)
        })
        midMarker.addTo(layer)
      }
    })
  }, [links, selectedLink, devices, mapReady])

  // Render Interactive Edit Layer (drafting new links or modifying existing cables)
  useEffect(() => {
    const map = mapInstanceRef.current
    const layer = editLayerRef.current
    if (!map || !layer || !mapReady) return

    layer.clearLayers()

    // 1. If actively editing an existing link's path
    if (isEditingLinkPath && editingPath.length >= 2) {
      const activeColor = editingLinkTarget?.color || '#00E5FF'

      // Active cable polyline
      L.polyline(editingPath, {
        color: activeColor,
        weight: 4,
        opacity: 0.9,
      }).addTo(layer)

      // Control vertex markers (draggable)
      editingPath.forEach((pt, idx) => {
        const isEndpoint = idx === 0 || idx === editingPath.length - 1
        const handleHtml = `
          <div style="width: 14px; height: 14px; border-radius: 50%; background-color: ${
            isEndpoint ? '#3B82F6' : activeColor
          }; border: 2px solid #FFFFFF; box-shadow: 0 0 10px rgba(0,0,0,0.8); cursor: grab; display: flex; align-items: center; justify-content: center; font-size: 8px; font-weight: 900; color: #FFFFFF;">
            ${idx + 1}
          </div>
        `
        const icon = L.divIcon({
          html: handleHtml,
          className: 'vertex-edit-handle',
          iconSize: [14, 14],
          iconAnchor: [7, 7],
        })

        const marker = L.marker(pt, {
          icon,
          draggable: true,
          title: `Vértice ${idx + 1} (Arraste para mover o cabo | Botão direito para excluir)`,
        }).addTo(layer)

        marker.on('drag', (e: any) => {
          const { lat, lng } = e.latlng
          setEditingPath((prev) => {
            const next = [...prev]
            next[idx] = [Number(lat.toFixed(6)), Number(lng.toFixed(6))]
            let d = 0
            for (let i = 0; i < next.length - 1; i++) {
              d += haversineDistance(next[i], next[i + 1])
            }
            setEditingDistanceKm(Number(d.toFixed(2)))
            return next
          })
        })

        marker.on('contextmenu', (e: any) => {
          L.DomEvent.stopPropagation(e)
          if (!isEndpoint && editingPath.length > 2) {
            setEditingPath((prev) => {
              const next = prev.filter((_, i) => i !== idx)
              let d = 0
              for (let i = 0; i < next.length - 1; i++) {
                d += haversineDistance(next[i], next[i + 1])
              }
              setEditingDistanceKm(Number(d.toFixed(2)))
              return next
            })
          }
        })
      })
      return
    }

    // 2. If creating a link with live preview
    if (isLinkModalOpen || isAddWaypointMode || isManualDrawMode) {
      if (linkFormPath.length >= 2) {
        L.polyline(linkFormPath, {
          color: linkFormColor,
          weight: 4,
          opacity: 0.9,
          dashArray: isAddWaypointMode || isManualDrawMode ? '5, 5' : undefined,
        }).addTo(layer)
      }

      // Waypoints markers in road mode
      if (linkFormRoutingMode === 'road' && linkFormWaypoints.length > 0) {
        linkFormWaypoints.forEach((wp, wIdx) => {
          const wpHtml = `
            <div style="width: 20px; height: 20px; border-radius: 50%; background-color: #F59E0B; border: 2px solid #FFFFFF; box-shadow: 0 0 10px rgba(245,158,11,0.9); display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 900; color: #000000; cursor: pointer;">
              ${wIdx + 1}
            </div>
          `
          const wpIcon = L.divIcon({
            html: wpHtml,
            className: 'waypoint-marker',
            iconSize: [20, 20],
            iconAnchor: [10, 10],
          })
          const wpMarker = L.marker(wp, {
            icon: wpIcon,
            title: `Ponto de passagem no ramal ${wIdx + 1} (Clique para remover)`,
          }).addTo(layer)

          wpMarker.on('click', (e) => {
            L.DomEvent.stopPropagation(e)
            setLinkFormWaypoints((prev) => {
              const next = prev.filter((_, i) => i !== wIdx)
              handleRecalculateRoute(linkFormSourceId, linkFormTargetId, 'road', next)
              return next
            })
          })
        })
      }

      // Manual draw vertices
      if (isManualDrawMode && linkFormPath.length > 0) {
        linkFormPath.forEach((pt, idx) => {
          const handleHtml = `
            <div style="width: 12px; height: 12px; border-radius: 50%; background-color: ${linkFormColor}; border: 2px solid #FFFFFF; box-shadow: 0 0 6px rgba(0,0,0,0.8); cursor: pointer;"></div>
          `
          const icon = L.divIcon({
            html: handleHtml,
            className: 'manual-draw-handle',
            iconSize: [12, 12],
            iconAnchor: [6, 6],
          })
          L.marker(pt, { icon, title: `Ponto ${idx + 1}` }).addTo(layer)
        })
      }
    }
  }, [
    isEditingLinkPath,
    editingPath,
    editingLinkTarget,
    isLinkModalOpen,
    isAddWaypointMode,
    isManualDrawMode,
    linkFormPath,
    linkFormColor,
    linkFormRoutingMode,
    linkFormWaypoints,
    linkFormSourceId,
    linkFormTargetId,
    handleRecalculateRoute,
    mapReady,
  ])

  // Update device markers
  useEffect(() => {
    const map = mapInstanceRef.current
    const layer = markersLayerRef.current
    if (!map || !layer || !mapReady) return

    layer.clearLayers()
    const bounds = L.latLngBounds([])

    visibleDevices.forEach((dev) => {
      const lat = Number(dev.latitude)
      const lng = Number(dev.longitude)
      if (isNaN(lat) || isNaN(lng)) return

      const role = dev.device_role || (dev.is_bgp ? 'bgp' : 'sw')
      const config = ROLE_CONFIG[role] || ROLE_CONFIG.other
      const isMaster = isBGPMasterDevice(dev, devices)
      const isOnline = dev.status === 'online'

      const markerHtml = `
        <div class="relative flex items-center justify-center cursor-pointer group" style="width: 44px; height: 44px;">
          ${
            isOnline
              ? '<span class="absolute w-9 h-9 rounded-full bg-emerald-400/25 animate-ping"></span>'
              : '<span class="absolute w-9 h-9 rounded-full bg-rose-500/20"></span>'
          }
          <div class="relative z-10 w-9 h-9 rounded-2xl flex flex-col items-center justify-center font-bold text-[10px] shadow-2xl transition-transform transform group-hover:scale-110"
               style="background-color: #161922; border: 2px solid ${config.markerColor}; color: ${config.markerColor};">
            ${
              isMaster
                ? '<span class="absolute -top-2.5 bg-amber-500 text-black px-1 rounded text-[8px] font-black uppercase tracking-widest shadow">MASTER</span>'
                : ''
            }
            <span class="tracking-tighter">${config.icon}</span>
            <span class="w-1.5 h-1.5 rounded-full ${isOnline ? 'bg-emerald-400' : 'bg-rose-500'} mt-0.5"></span>
          </div>
        </div>
      `

      const customIcon = L.divIcon({
        html: markerHtml,
        className: 'netpulse-map-marker',
        iconSize: [44, 44],
        iconAnchor: [22, 22],
        popupAnchor: [0, -20],
      })

      const marker = L.marker([lat, lng], {
        icon: customIcon,
        draggable: true,
        title: `${dev.name} (Arraste para mover ou clique para detalhes)`,
      }).addTo(layer)
      bounds.extend([lat, lng])

      marker.on('click', () => {
        setSelectedLink(null)
        setSelectedDevice(dev)
      })

      marker.on('dragend', async (e: L.LeafletEvent) => {
        const target = e.target as L.Marker
        const newPos = target.getLatLng()
        if (onUpdateCoordinatesRef.current) {
          await onUpdateCoordinatesRef.current(
            dev.id,
            Number(newPos.lat.toFixed(6)),
            Number(newPos.lng.toFixed(6))
          )
        }
      })
    })

    if (visibleDevices.length > 0 && mapReady && !hasAutoFittedRef.current) {
      hasAutoFittedRef.current = true
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 })
    }
  }, [visibleDevices, devices, mapReady])

  // Reset zoom view
  const handleResetView = () => {
    const map = mapInstanceRef.current
    if (!map) return

    if (placedDevices.length > 0) {
      const bounds = L.latLngBounds([])
      placedDevices.forEach((d) => bounds.extend([Number(d.latitude), Number(d.longitude)]))
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 })
    } else {
      map.setView([-1.4558, -48.4902], 5)
    }
  }

  // Start new link flow
  const handleOpenCreateLink = (preselectedSource?: Device) => {
    setSelectedDevice(null)
    setSelectedLink(null)
    setEditingLinkTarget(null)

    const src = preselectedSource || placedDevices[0]
    const tgt = placedDevices.find((d) => d.id !== src?.id) || placedDevices[1]

    const srcId = src?.id || ''
    const tgtId = tgt?.id || ''

    setLinkFormSourceId(srcId)
    setLinkFormTargetId(tgtId)
    setLinkFormName(src && tgt ? `Enlace ${src.name} ➔ ${tgt.name}` : 'Novo Enlace PTP')
    setLinkFormType('fiber')
    setLinkFormRoutingMode('road')
    setLinkFormCapacity('10G')
    setLinkFormColor('#00E5FF')
    setLinkFormStatus('active')
    setLinkFormNotes('')
    setLinkFormSourceIface('')
    setLinkFormTargetIface('')
    setLinkFormWaypoints([])
    setLinkFormPath([])
    setLinkFormDistanceKm(0)

    setIsLinkModalOpen(true)

    if (srcId && tgtId) {
      handleRecalculateRoute(srcId, tgtId, 'road', [])
    }
  }

  // Force Link Active manually
  const handleForceActiveLink = async (link: BackboneLink) => {
    try {
      const updated = await updateBackboneLink(link.id, {
        status: 'active',
        zabbix_problem: '',
      })
      setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
      setSelectedLink(updated)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao atualizar enlace'
      alert(msg)
    }
  }

  // Zabbix operations
  const handleSaveZabbixConfig = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSavingZabbix(true)
    try {
      const updated = await saveZabbixConfig({
        url: zabbixFormUrl.trim(),
        api_token: zabbixFormToken.trim() || undefined,
        username: zabbixFormUser.trim() || undefined,
        password: zabbixFormPass.trim() || undefined,
        webhook_secret: zabbixFormSecret.trim() || undefined,
        enabled: zabbixFormEnabled,
      })
      setZabbixConfig(updated)
      setZabbixFormPass('')
      setZabbixFormToken('')
      alert('Configurações do Zabbix salvas com sucesso!')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar Zabbix'
      alert(msg)
    } finally {
      setIsSavingZabbix(false)
    }
  }

  const handleTestZabbix = async () => {
    setTestingZabbix(true)
    setTestResult(null)
    try {
      const res = await testZabbixConnection({
        url: zabbixFormUrl.trim() || undefined,
        api_token: zabbixFormToken.trim() || undefined,
        username: zabbixFormUser.trim() || undefined,
        password: zabbixFormPass.trim() || undefined,
      })
      setTestResult(res)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao testar Zabbix'
      setTestResult({ success: false, error: msg })
    } finally {
      setTestingZabbix(false)
    }
  }

  const handleSyncZabbix = async () => {
    setSyncingZabbix(true)
    setSyncResult(null)
    try {
      const res = await syncZabbixLinks()
      setSyncResult(res)
      if (res.links && res.links.length > 0) {
        setLinks((prev) =>
          prev.map((l) => {
            const found = res.links.find((u) => u.id === l.id)
            return found || l
          })
        )
        if (selectedLink) {
          const updatedSel = res.links.find((u) => u.id === selectedLink.id)
          if (updatedSel) setSelectedLink(updatedSel)
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao sincronizar com Zabbix'
      alert(msg)
    } finally {
      setSyncingZabbix(false)
    }
  }

  // Save new or edited link
  const handleSaveLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!linkFormSourceId || !linkFormTargetId) return

    setIsSavingLink(true)
    try {
      const monitoredIface =
        linkFormTrafficEnd === 'source' ? linkFormSourceIface.trim() : linkFormTargetIface.trim()

      const payload: Partial<BackboneLink> = {
        name: linkFormName.trim(),
        source_device_id: linkFormSourceId,
        target_device_id: linkFormTargetId,
        source_interface: linkFormSourceIface.trim(),
        target_interface: linkFormTargetIface.trim(),
        traffic_monitored_end: linkFormTrafficEnd,
        traffic_monitored_iface: monitoredIface,
        type: linkFormType,
        routing_mode: linkFormRoutingMode,
        capacity: linkFormCapacity,
        color: linkFormColor,
        status: linkFormStatus,
        notes: linkFormNotes.trim(),
        path: linkFormPath,
        waypoints: linkFormWaypoints,
        distance_km: linkFormDistanceKm,
      }

      let savedLink: BackboneLink
      if (editingLinkTarget) {
        savedLink = await updateBackboneLink(editingLinkTarget.id, payload)
        setLinks((prev) => prev.map((l) => (l.id === savedLink.id ? savedLink : l)))
        setSelectedLink(savedLink)
      } else {
        savedLink = await createBackboneLink(payload)
        setLinks((prev) => [...prev, savedLink])
        setSelectedLink(savedLink)
      }

      setIsLinkModalOpen(false)
      setIsAddWaypointMode(false)
      setIsManualDrawMode(false)
      setEditingLinkTarget(null)

      // Automatically collect traffic immediately in the background if an interface is defined
      if (monitoredIface) {
        collectLinkTraffic(savedLink.id)
          .then((res) => {
            if (res && res.link) {
              setLinks((prev) => prev.map((l) => (l.id === res.link.id ? res.link : l)))
              setSelectedLink((curr) => (curr?.id === res.link.id ? res.link : curr))
            }
          })
          .catch(() => {})
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar enlace'
      alert(msg)
    } finally {
      setIsSavingLink(false)
    }
  }

  // Delete link
  const handleDeleteLink = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este enlace de backbone?')) return
    try {
      await deleteBackboneLink(id)
      setLinks((prev) => prev.filter((l) => l.id !== id))
      if (selectedLink?.id === id) setSelectedLink(null)
    } catch (err: any) {
      alert(err.message || 'Erro ao excluir enlace')
    }
  }

  // Enter interactive path editing mode for an existing link
  const handleStartEditPath = (link: BackboneLink) => {
    setEditingLinkTarget(link)
    setEditingPath([...link.path])
    setEditingDistanceKm(link.distance_km)
    setIsEditingLinkPath(true)
    setSelectedLink(null)
  }

  // Save interactive path editing
  const handleSaveEditedPath = async () => {
    if (!editingLinkTarget) return
    setIsSavingLink(true)
    try {
      const updated = await updateBackboneLink(editingLinkTarget.id, {
        path: editingPath,
        distance_km: editingDistanceKm,
        routing_mode: 'manual',
      })
      setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
      setSelectedLink(updated)
      setIsEditingLinkPath(false)
      setEditingLinkTarget(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar traçado do enlace'
      alert(msg)
    } finally {
      setIsSavingLink(false)
    }
  }

  // Convert road route to manual points for point-by-point tweaking
  const handleConvertRoadToManual = () => {
    setLinkFormRoutingMode('manual')
    setIsManualDrawMode(true)
  }

  // Undo last waypoint in Ramal mode
  const handleUndoWaypoint = () => {
    setLinkFormWaypoints((prev) => {
      if (prev.length === 0) return prev
      const next = prev.slice(0, -1)
      handleRecalculateRoute(linkSourceIdRef.current, linkTargetIdRef.current, 'road', next)
      return next
    })
  }

  // Clear all waypoints in Ramal mode
  const handleClearWaypoints = () => {
    setLinkFormWaypoints([])
    handleRecalculateRoute(linkSourceIdRef.current, linkTargetIdRef.current, 'road', [])
  }

  // Undo last point in manual draw mode
  const handleUndoManualPoint = () => {
    setLinkFormPath((prev) => {
      if (prev.length === 0) return prev
      const next = prev.slice(0, -1)
      let d = 0
      for (let i = 0; i < next.length - 1; i++) {
        d += haversineDistance(next[i], next[i + 1])
      }
      setLinkFormDistanceKm(Number(d.toFixed(2)))
      return next
    })
  }

  // Clear all manual points
  const handleClearManualPoints = () => {
    setLinkFormPath([])
    setLinkFormDistanceKm(0)
  }

  // Finalize Ramal or Manual Draw and return to modal
  const handleFinishWaypointMode = () => {
    setIsAddWaypointMode(false)
    setIsLinkModalOpen(true)
  }

  const handleFinishManualDrawMode = () => {
    setIsManualDrawMode(false)
    setIsLinkModalOpen(true)
  }

  // Direct Save Link from the active map banner
  const handleDirectSaveFromBanner = async () => {
    if (!linkFormSourceId || !linkFormTargetId) {
      setIsAddWaypointMode(false)
      setIsManualDrawMode(false)
      setIsLinkModalOpen(true)
      return
    }

    const srcDev = devices.find((d) => d.id === linkFormSourceId)
    const tgtDev = devices.find((d) => d.id === linkFormTargetId)
    const defaultName =
      linkFormName.trim() ||
      `Enlace ${srcDev?.name || 'A'} ➔ ${tgtDev?.name || 'B'}`

    setIsSavingLink(true)
    try {
      const payload: Partial<BackboneLink> = {
        name: defaultName,
        source_device_id: linkFormSourceId,
        target_device_id: linkFormTargetId,
        type: linkFormType,
        routing_mode: linkFormRoutingMode,
        capacity: linkFormCapacity,
        color: linkFormColor,
        status: linkFormStatus,
        notes: linkFormNotes.trim(),
        path: linkFormPath,
        waypoints: linkFormWaypoints,
        distance_km: linkFormDistanceKm,
      }

      if (editingLinkTarget) {
        const updated = await updateBackboneLink(editingLinkTarget.id, payload)
        setLinks((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
        setSelectedLink(updated)
      } else {
        const created = await createBackboneLink(payload)
        setLinks((prev) => [...prev, created])
        setSelectedLink(created)
      }

      setIsAddWaypointMode(false)
      setIsManualDrawMode(false)
      setIsLinkModalOpen(false)
      setEditingLinkTarget(null)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao salvar enlace'
      alert(msg)
    } finally {
      setIsSavingLink(false)
    }
  }

  return (
    <div
      ref={mapWrapperRef}
      onMouseMove={(e) => {
        if (isFullscreen && e.clientY <= 25) {
          showFsMenu()
        }
      }}
      className={
        isFullscreen
          ? 'fixed inset-0 z-[9999] w-screen h-screen bg-[#0B0F19] p-0 m-0 overflow-hidden relative'
          : 'space-y-4'
      }
    >
      {/* Top Edge Hover Strip to Reveal Menu in Fullscreen */}
      {isFullscreen && (
        <div
          onMouseEnter={showFsMenu}
          className="absolute top-0 left-0 right-0 h-4 z-40 cursor-default"
          aria-hidden="true"
        />
      )}

      {/* Top Map Control Bar */}
      <div
        ref={fsMenuRef}
        onMouseEnter={() => {
          if (isFullscreen) showFsMenu()
        }}
        onMouseLeave={() => {
          if (isFullscreen) scheduleHideFsMenu()
        }}
        className={
          isFullscreen
            ? `absolute top-3 left-3 right-3 z-40 p-4 rounded-2xl bg-[#1C202C]/95 border border-[#242836] shadow-2xl backdrop-blur-md flex flex-col md:flex-row md:items-center justify-between gap-4 transition-all duration-300 ease-in-out ${
                isFsMenuVisible
                  ? 'translate-y-0 opacity-100 pointer-events-auto shadow-2xl'
                  : '-translate-y-[130%] opacity-0 pointer-events-none'
              }`
            : 'p-4 rounded-2xl bg-[#1C202C] border border-[#242836] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4'
        }
      >
        {/* Left: KPI summary chips */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={() => setRoleFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              roleFilter === 'all'
                ? 'bg-[#25334D] text-[#93B4E6] border border-[#3B5B8C]/50 shadow-sm'
                : 'bg-[#161922] text-slate-400 hover:text-white border border-[#242836]'
            }`}
          >
            <span>Todos</span>
            <span className="bg-[#1C202C] px-1.5 py-0.2 rounded-md text-[10px] text-slate-300">
              {counts.total}
            </span>
          </button>

          {(['bgp', 'pe', 'sw', 'olt'] as DeviceRole[]).map((role) => {
            const cfg = ROLE_CONFIG[role]
            const count = counts[role]
            const isActive = roleFilter === role
            return (
              <button
                key={role}
                type="button"
                onClick={() => setRoleFilter(isActive ? 'all' : role)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                  isActive
                    ? `${cfg.bg} ${cfg.text} border ${cfg.border} ring-1 ring-current`
                    : 'bg-[#161922] text-slate-400 hover:text-white border border-[#242836]'
                }`}
              >
                <span>{cfg.label}</span>
                <span className="bg-[#1C202C] px-1.5 py-0.2 rounded-md text-[10px] text-slate-300">
                  {count}
                </span>
              </button>
            )
          })}

          {/* Links counter chip */}
          <button
            type="button"
            onClick={() => setIsLinksDrawerOpen((prev) => !prev)}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
              isLinksDrawerOpen
                ? 'bg-cyan-950/70 text-cyan-300 border border-cyan-500/50 shadow-sm'
                : 'bg-[#161922] text-slate-300 hover:text-white border border-[#242836]'
            }`}
            title="Ver enlaces de fibra óptica e rádio cadastrados"
          >
            <Cable className="h-3.5 w-3.5 text-cyan-400" />
            <span>Enlaces</span>
            {loadingLinks ? (
              <span className="w-2.5 h-2.5 border-2 border-cyan-400 border-t-transparent rounded-full animate-spin" />
            ) : (
              <span className="bg-[#1C202C] px-1.5 py-0.2 rounded-md text-[10px] text-cyan-300 font-bold">
                {counts.links}
              </span>
            )}
            {counts.totalFiberKm > 0 && (
              <span className="text-[10px] text-slate-500 font-mono hidden xl:inline">
                ({counts.totalFiberKm} km)
              </span>
            )}
          </button>

          {/* Status Quick Filter (Online / Offline) */}
          <div className="flex items-center bg-[#161922] p-0.5 rounded-xl border border-[#242836]">
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'online' ? 'all' : 'online')}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'online'
                  ? 'bg-emerald-950/70 text-emerald-300 border border-emerald-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Filtrar equipamentos online"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>Online ({counts.online})</span>
            </button>
            <button
              type="button"
              onClick={() => setStatusFilter(statusFilter === 'offline' ? 'all' : 'offline')}
              className={`px-2 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 ${
                statusFilter === 'offline'
                  ? 'bg-rose-950/70 text-rose-300 border border-rose-500/40 shadow-xs'
                  : 'text-slate-400 hover:text-white'
              }`}
              title="Filtrar equipamentos offline"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span>Offline ({counts.offline})</span>
            </button>
          </div>
        </div>

        {/* Right: Search, Layers & Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap justify-end">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-500" />
            <input
              type="text"
              placeholder="Buscar por Nome, IP, POP, Cidade..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onFocus={() => {
                if (isFullscreen) showFsMenu()
              }}
              onBlur={() => {
                if (isFullscreen) scheduleHideFsMenu()
              }}
              className="bg-[#161922] border border-[#242836] text-slate-200 text-xs rounded-xl pl-9 pr-3 py-1.5 focus:border-[#3B5B8C] focus:outline-none w-52 sm:w-64"
            />
          </div>

          {/* Layer Selector */}
          <div className="flex items-center bg-[#161922] p-0.5 rounded-xl border border-[#242836]">
            {(['google_satellite', 'google_streets', 'esri_dark', 'google_terrain'] as MapLayerType[]).map((lId) => {
              const opt = LAYER_PROVIDERS[lId]
              const isActive = activeLayer === lId
              return (
                <button
                  key={lId}
                  type="button"
                  onClick={() => handleSelectLayer(lId)}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition cursor-pointer flex items-center gap-1 ${
                    isActive
                      ? 'bg-[#25334D] text-[#93B4E6] border border-[#3B5B8C]/40 shadow-xs'
                      : 'text-slate-400 hover:text-white'
                  }`}
                  title={`${opt.name}: ${opt.description}`}
                >
                  <span className="text-xs">{opt.icon}</span>
                  <span className="hidden xl:inline">{opt.shortName}</span>
                </button>
              )
            })}
          </div>

          {/* Google Maps API Key Config */}
          <button
            type="button"
            onClick={() => {
              setTempApiKey(googleApiKey)
              setIsApiKeyModalOpen(true)
            }}
            className={`px-2.5 py-1.5 rounded-xl border text-xs font-medium transition cursor-pointer flex items-center gap-1.5 ${
              googleApiKey
                ? 'bg-amber-950/40 text-amber-300 border-amber-600/40 hover:bg-amber-900/50'
                : 'bg-[#161922] text-slate-300 hover:text-white border-[#242836] hover:bg-[#202738]'
            }`}
            title="Configurar chave de API Google Maps"
          >
            <KeyRound className="h-3.5 w-3.5 text-amber-400" />
            <span className="hidden lg:inline">API Google</span>
            {googleApiKey ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" title="Chave Google Maps configurada" />
            ) : null}
          </button>

          {/* Center View */}
          <button
            type="button"
            onClick={handleResetView}
            className="px-3 py-1.5 rounded-xl bg-[#161922] hover:bg-[#202738] text-slate-300 hover:text-white border border-[#242836] text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
            title="Ajustar visualização para enquadrar todos os equipamentos"
          >
            <Compass className="h-3.5 w-3.5 text-[#93B4E6]" />
            <span className="hidden sm:inline">Centralizar</span>
          </button>

          {/* Fullscreen Button in Toolbar */}
          <button
            type="button"
            onClick={toggleFullscreen}
            className={`px-3 py-1.5 rounded-xl border text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 shadow-sm ${
              isFullscreen
                ? 'bg-cyan-950/80 text-cyan-300 border-cyan-500/60 hover:bg-cyan-900 ring-1 ring-cyan-500/50'
                : 'bg-[#161922] hover:bg-[#202738] text-slate-300 hover:text-white border-[#242836]'
            }`}
            title={isFullscreen ? 'Sair da tela cheia (Esc)' : 'Visualizar mapa em tela cheia'}
          >
            {isFullscreen ? (
              <>
                <Minimize2 className="h-3.5 w-3.5 text-cyan-400" />
                <span className="hidden sm:inline">Restaurar</span>
              </>
            ) : (
              <>
                <Maximize2 className="h-3.5 w-3.5 text-[#93B4E6]" />
                <span className="hidden sm:inline">Tela Cheia</span>
              </>
            )}
          </button>

          {/* Zabbix Integration Button */}
          <button
            type="button"
            onClick={() => setIsZabbixModalOpen(true)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm ${
              zabbixConfig?.enabled
                ? 'bg-red-950/40 hover:bg-red-900/60 text-red-200 border-red-500/50'
                : 'bg-[#161922] hover:bg-[#202738] text-slate-300 hover:text-white border-[#242836]'
            }`}
            title="Monitoramento Zabbix: API de Interfaces e Webhook de Link Down em tempo real"
          >
            <Activity className={`h-3.5 w-3.5 ${zabbixConfig?.enabled ? 'text-red-400' : 'text-slate-400'}`} />
            <span>Zabbix</span>
            {zabbixConfig?.enabled ? (
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" title="Zabbix Ativo" />
            ) : null}
          </button>

          {/* New PTP Link button */}
          <button
            type="button"
            onClick={() => handleOpenCreateLink()}
            className="px-3.5 py-1.5 rounded-xl bg-cyan-950/60 hover:bg-cyan-900 text-cyan-200 border border-cyan-500/50 text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
            title="Criar novo enlace de fibra óptica seguindo as rodovias ou ramais"
          >
            <Route className="h-4 w-4 text-cyan-400" />
            <span>Novo Enlace</span>
          </button>

          {/* Add Device */}
          {onAddDevice && (
            <button
              type="button"
              onClick={onAddDevice}
              className="px-3.5 py-1.5 rounded-xl bg-[#3B5B8C] hover:bg-[#4A72B2] text-white text-xs font-bold transition cursor-pointer flex items-center gap-1.5 shadow-sm"
            >
              <Plus className="h-4 w-4" />
              <span>Cadastrar</span>
            </button>
          )}
        </div>
      </div>

      {/* Positioning Alert Mode */}
      {placingDeviceId && (
        <div className={`p-3.5 rounded-2xl bg-amber-950/60 border border-amber-600/70 text-amber-200 text-xs flex items-center justify-between shadow-lg animate-in fade-in duration-150 ${isFullscreen ? 'absolute top-3 left-3 right-3 z-30 backdrop-blur-md' : ''}`}>
          <div className="flex items-center gap-2.5">
            <MapPin className="h-4 w-4 text-amber-400 animate-bounce shrink-0" />
            <span>
              <strong>Modo de Posicionamento Ativo:</strong>{' '}
              {savingLocation ? (
                'Salvando coordenadas geográficas no equipamento...'
              ) : (
                <>
                  Clique no local exato do mapa onde está instalado{' '}
                  <strong>
                    {devices.find((d) => d.id === placingDeviceId)?.name || 'o equipamento'}
                  </strong>
                  .
                </>
              )}
            </span>
          </div>
          <button
            type="button"
            disabled={savingLocation}
            onClick={() => setPlacingDeviceId(null)}
            className="px-3 py-1 rounded-lg bg-amber-900/60 hover:bg-amber-800 text-amber-100 text-xs font-bold transition cursor-pointer border border-amber-600/50 disabled:opacity-50"
          >
            Cancelar (Esc)
          </button>
        </div>
      )}

      {/* Interactive Path Editing Mode Banner */}
      {isEditingLinkPath && (
        <div className={`p-3.5 rounded-2xl bg-cyan-950/70 border border-cyan-500/70 text-cyan-200 text-xs flex items-center justify-between shadow-xl animate-in fade-in duration-150 ${isFullscreen ? 'absolute top-3 left-3 right-3 z-30 backdrop-blur-md' : ''}`}>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Cable className="h-4 w-4 text-cyan-400 animate-pulse shrink-0" />
            <span>
              <strong>Editando Traçado do Enlace:</strong> {editingLinkTarget?.name} •{' '}
              <span className="text-white font-mono font-bold">{editingDistanceKm.toFixed(1)} km</span>{' '}
              ({editingPath.length} pontos). Arraste os pontos para curvar o cabo pelo ramal. Clique no mapa para adicionar pontos. Botão direito para excluir.
            </span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                setIsEditingLinkPath(false)
                setEditingLinkTarget(null)
              }}
              className="px-3 py-1 rounded-lg bg-[#161922] hover:bg-[#202738] text-slate-300 text-xs font-medium transition cursor-pointer border border-[#242836]"
            >
              Cancelar (Esc)
            </button>
            <button
              type="button"
              disabled={isSavingLink}
              onClick={handleSaveEditedPath}
              className="px-3.5 py-1 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-black text-xs font-bold transition cursor-pointer shadow-md flex items-center gap-1"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Salvar Traçado</span>
            </button>
          </div>
        </div>
      )}

      {/* Waypoint Ramal Mode Banner */}
      {isAddWaypointMode && (
        <div className={`p-3.5 rounded-2xl bg-amber-950/80 border border-amber-500/80 text-amber-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xl backdrop-blur-md animate-in fade-in duration-150 ${isFullscreen ? 'absolute top-3 left-3 right-3 z-30' : ''}`}>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Waypoints className="h-4 w-4 text-amber-400 animate-pulse shrink-0" />
            <span>
              <strong>Definindo Ramal / Rota Alternativa:</strong> Clique no mapa nos pontos por onde o cabo deve desviar da rodovia.
              {linkFormWaypoints.length > 0 && (
                <span className="ml-1 text-white font-mono font-bold">
                  ({linkFormWaypoints.length} {linkFormWaypoints.length === 1 ? 'ponto marcado' : 'pontos marcados'} • {linkFormDistanceKm.toFixed(1)} km)
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {linkFormWaypoints.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleUndoWaypoint}
                  className="px-2.5 py-1.5 rounded-xl bg-[#161922] hover:bg-[#202738] text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer border border-[#242836] flex items-center gap-1"
                  title="Desfazer o último ponto adicionado"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  <span>Desfazer</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearWaypoints}
                  className="px-2.5 py-1.5 rounded-xl bg-[#161922] hover:bg-[#202738] text-rose-300 hover:text-rose-200 text-xs font-medium transition cursor-pointer border border-[#242836]"
                  title="Remover todos os pontos do ramal"
                >
                  Limpar
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleFinishWaypointMode}
              className="px-3.5 py-1.5 rounded-xl bg-[#161922] hover:bg-[#202738] text-slate-200 hover:text-white text-xs font-semibold transition cursor-pointer border border-[#242836] flex items-center gap-1.5"
            >
              <span>Voltar ao Form</span>
            </button>
            <button
              type="button"
              disabled={isSavingLink || isCalculatingRoute}
              onClick={handleDirectSaveFromBanner}
              className="px-4 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold transition cursor-pointer shadow-md flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Concluir e Salvar Enlace</span>
            </button>
          </div>
        </div>
      )}

      {/* Manual Draw Mode Banner */}
      {isManualDrawMode && (
        <div className={`p-3.5 rounded-2xl bg-emerald-950/80 border border-emerald-500/80 text-emerald-200 text-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-2xl backdrop-blur-md animate-in fade-in duration-150 ${isFullscreen ? 'absolute top-3 left-3 right-3 z-30' : ''}`}>
          <div className="flex items-center gap-2.5 flex-wrap">
            <Route className="h-4 w-4 text-emerald-400 animate-pulse shrink-0" />
            <span>
              <strong>Desenho Manual do Cabo:</strong> Clique ponto a ponto no mapa seguindo postes ou terreno próprio.
              {linkFormPath.length > 0 && (
                <span className="ml-1 text-white font-mono font-bold">
                  ({linkFormPath.length} {linkFormPath.length === 1 ? 'ponto marcado' : 'pontos'} • {linkFormDistanceKm.toFixed(1)} km)
                </span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            {linkFormPath.length > 0 && (
              <>
                <button
                  type="button"
                  onClick={handleUndoManualPoint}
                  className="px-2.5 py-1.5 rounded-xl bg-[#161922] hover:bg-[#202738] text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer border border-[#242836] flex items-center gap-1"
                  title="Desfazer o último ponto desenhado"
                >
                  <Undo2 className="h-3.5 w-3.5" />
                  <span>Desfazer</span>
                </button>
                <button
                  type="button"
                  onClick={handleClearManualPoints}
                  className="px-2.5 py-1.5 rounded-xl bg-[#161922] hover:bg-[#202738] text-rose-300 hover:text-rose-200 text-xs font-medium transition cursor-pointer border border-[#242836]"
                  title="Remover todos os pontos desenhados"
                >
                  Limpar
                </button>
              </>
            )}
            <button
              type="button"
              onClick={handleFinishManualDrawMode}
              className="px-3.5 py-1.5 rounded-xl bg-[#161922] hover:bg-[#202738] text-slate-200 hover:text-white text-xs font-semibold transition cursor-pointer border border-[#242836] flex items-center gap-1.5"
            >
              <span>Voltar ao Form</span>
            </button>
            <button
              type="button"
              disabled={linkFormPath.length < 2 || isSavingLink}
              onClick={handleDirectSaveFromBanner}
              className="px-4 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold transition cursor-pointer shadow-md flex items-center gap-1.5 disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Concluir e Salvar Enlace</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Map Box & Lateral Overlay */}
      <div
        className={`relative overflow-hidden bg-[#13151D] shadow-2xl ${
          isFullscreen
            ? 'w-full h-full rounded-none border-none'
            : 'rounded-2xl border border-[#242836] h-[620px] sm:h-[680px]'
        } ${
          placingDeviceId || isAddWaypointMode || isManualDrawMode
            ? 'cursor-crosshair [&_.leaflet-container]:!cursor-crosshair [&_.leaflet-grab]:!cursor-crosshair'
            : ''
        }`}
      >
        {/* Leaflet DOM container */}
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating In-Map Pill for Ramal Waypoints */}
        {isAddWaypointMode && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-[#1C202C]/95 border border-amber-500/80 rounded-2xl p-2 px-3.5 shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2 duration-150 text-xs text-amber-200">
            <span className="flex items-center gap-1.5 font-bold">
              <Waypoints className="h-4 w-4 text-amber-400 animate-pulse" />
              <span>Ramal:</span>
              <span className="text-white font-mono">{linkFormWaypoints.length} pts • {linkFormDistanceKm.toFixed(1)} km</span>
            </span>
            <div className="h-4 w-px bg-slate-700 mx-1" />
            {linkFormWaypoints.length > 0 && (
              <button
                type="button"
                onClick={handleUndoWaypoint}
                className="px-2 py-1 rounded-lg bg-[#161922] hover:bg-[#202738] text-slate-300 hover:text-white text-[11px] font-semibold border border-[#242836] flex items-center gap-1 cursor-pointer"
                title="Desfazer o último ponto adicionado"
              >
                <Undo2 className="h-3 w-3" />
                <span>Desfazer</span>
              </button>
            )}
            <button
              type="button"
              disabled={isSavingLink || isCalculatingRoute}
              onClick={handleDirectSaveFromBanner}
              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold shadow-md flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Concluir Ramal</span>
            </button>
          </div>
        )}

        {/* Floating In-Map Pill for Manual Draw */}
        {isManualDrawMode && (
          <div className="absolute top-3 left-1/2 -translate-x-1/2 z-30 bg-[#1C202C]/95 border border-emerald-500/80 rounded-2xl p-2 px-3.5 shadow-2xl backdrop-blur-md flex items-center gap-2.5 animate-in fade-in slide-in-from-top-2 duration-150 text-xs text-emerald-200">
            <span className="flex items-center gap-1.5 font-bold">
              <Route className="h-4 w-4 text-emerald-400 animate-pulse" />
              <span>Manual:</span>
              <span className="text-white font-mono">{linkFormPath.length} pts • {linkFormDistanceKm.toFixed(1)} km</span>
            </span>
            <div className="h-4 w-px bg-slate-700 mx-1" />
            {linkFormPath.length > 0 && (
              <button
                type="button"
                onClick={handleUndoManualPoint}
                className="px-2 py-1 rounded-lg bg-[#161922] hover:bg-[#202738] text-slate-300 hover:text-white text-[11px] font-semibold border border-[#242836] flex items-center gap-1 cursor-pointer"
                title="Desfazer o último ponto desenhado"
              >
                <Undo2 className="h-3 w-3" />
                <span>Desfazer</span>
              </button>
            )}
            <button
              type="button"
              disabled={linkFormPath.length < 2 || isSavingLink}
              onClick={handleDirectSaveFromBanner}
              className="px-3 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold shadow-md flex items-center gap-1 cursor-pointer disabled:opacity-50"
            >
              <Check className="h-3.5 w-3.5" />
              <span>Concluir Desenho</span>
            </button>
          </div>
        )}

        {/* Links Drawer (Floating lateral panel) */}
        {isLinksDrawerOpen && !placingDeviceId && !isEditingLinkPath && (
          <div className="absolute top-4 right-4 z-20 max-w-sm w-full bg-[#1C202C]/95 border border-[#242836] rounded-2xl p-4 shadow-2xl backdrop-blur-md space-y-3 animate-in fade-in slide-in-from-right duration-150 max-h-[580px] flex flex-col">
            <div className="flex items-center justify-between border-b border-[#242836] pb-2 shrink-0">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Cable className="h-4 w-4 text-cyan-400" />
                <span>Enlaces de Backbone ({links.length})</span>
              </span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={isCollectingTraffic}
                  onClick={async () => {
                    setIsCollectingTraffic(true)
                    try {
                      const res = await collectAllLinksTraffic()
                      if (res && res.links) {
                        setLinks(res.links)
                        if (selectedLink) {
                          const updatedSel = res.links.find((u) => u.id === selectedLink.id)
                          if (updatedSel) setSelectedLink(updatedSel)
                        }
                      }
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : 'Erro ao coletar tráfego'
                      alert(msg)
                    } finally {
                      setIsCollectingTraffic(false)
                    }
                  }}
                  className="px-2 py-1 bg-[#161922] hover:bg-[#252C3D] text-slate-300 hover:text-white rounded-lg text-[10px] font-bold border border-[#2D3345] cursor-pointer flex items-center gap-1 transition"
                  title="Atualizar tráfego de todos os enlaces via Zabbix"
                >
                  <RefreshCw className={`h-3 w-3 ${isCollectingTraffic ? 'animate-spin text-cyan-400' : ''}`} />
                  <span>Tráfego</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleOpenCreateLink()}
                  className="px-2 py-1 bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 rounded-lg text-[10px] font-bold border border-cyan-500/40 cursor-pointer"
                >
                  + Enlace
                </button>
                <button
                  type="button"
                  onClick={() => setIsLinksDrawerOpen(false)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>

            <div className="overflow-y-auto space-y-2 flex-1 pr-1">
              {links.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-500">
                  Nenhum enlace ponto a ponto cadastrado ainda. Clique em <strong>+ Enlace</strong> para traçar uma rota pelas rodovias ou ramais.
                </div>
              ) : (
                links.map((link) => {
                  const src = devices.find((d) => d.id === link.source_device_id)
                  const tgt = devices.find((d) => d.id === link.target_device_id)
                  const isSelected = selectedLink?.id === link.id
                  const isDown = link.status === 'down'
                  const hasTraffic =
                    (link.traffic_rx_bps != null && link.traffic_rx_bps > 0) ||
                    (link.traffic_tx_bps != null && link.traffic_tx_bps > 0)

                  return (
                    <div
                      key={link.id}
                      onClick={() => {
                        setSelectedDevice(null)
                        setSelectedLink(link)
                        // Fit bounds to link
                        if (link.path && link.path.length > 1 && mapInstanceRef.current) {
                          const bounds = L.latLngBounds(link.path)
                          mapInstanceRef.current.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
                        }
                      }}
                      className={`p-2.5 rounded-xl border transition cursor-pointer text-xs space-y-1 ${
                        isDown
                          ? 'bg-red-950/40 border-red-500/70 text-red-100 ring-1 ring-red-500/50'
                          : isSelected
                          ? 'bg-[#25334D] border-[#3B5B8C] text-white'
                          : 'bg-[#161922] border-[#242836] text-slate-300 hover:border-[#3B5B8C]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <strong className="truncate font-semibold flex items-center gap-1.5">
                          <span
                            className={`w-2.5 h-2.5 rounded-full shrink-0 ${isDown ? 'bg-red-500 animate-pulse' : ''}`}
                            style={{ backgroundColor: isDown ? '#EF4444' : (link.color || '#00E5FF') }}
                          />
                          <span>{link.name}</span>
                        </strong>
                        <div className="flex items-center gap-1">
                          {isDown ? (
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-red-900 text-red-200 border border-red-700/60 animate-pulse">
                              DOWN
                            </span>
                          ) : (
                            <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-[#1C202C] text-cyan-300 font-mono">
                              {link.capacity || '10G'}
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center justify-between">
                        <span className="truncate">
                          {src?.name || 'Origem'} ➔ {tgt?.name || 'Destino'}
                        </span>
                        <span className="font-mono text-slate-300 font-bold shrink-0">
                          {link.distance_km ? link.distance_km.toFixed(1) + ' km' : ''}
                        </span>
                      </div>
                      {(link.source_interface || link.target_interface) && (
                        <div className="text-[10px] text-purple-300 font-mono flex items-center gap-1 truncate pt-0.5">
                          <span>Portas: {link.source_interface || '?'} ➔ {link.target_interface || '?'}</span>
                        </div>
                      )}
                      {hasTraffic && !isDown && (
                        <div className="text-[10px] font-mono flex items-center justify-between pt-1 border-t border-[#242836]/60 text-slate-300">
                          <span className="text-sky-400 font-semibold flex items-center gap-0.5">
                            <ArrowDown className="h-2.5 w-2.5" /> {formatBps(link.traffic_rx_bps)}
                          </span>
                          <span className="text-emerald-400 font-semibold flex items-center gap-0.5">
                            <ArrowUp className="h-2.5 w-2.5" /> {formatBps(link.traffic_tx_bps)}
                          </span>
                        </div>
                      )}
                      {isDown && link.zabbix_problem && (
                        <div className="text-[10px] text-red-300 italic truncate pt-0.5">
                          ⚠️ {link.zabbix_problem}
                        </div>
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

        {/* Floating Unplaced Devices Drawer */}
        {unplacedDevices.length > 0 && !placingDeviceId && (
          <div className="absolute top-4 left-4 z-20 max-w-xs w-full bg-[#1C202C]/95 border border-[#242836] rounded-2xl p-3.5 shadow-2xl backdrop-blur-md space-y-2">
            <div className="flex items-center justify-between border-b border-[#242836] pb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <MapPin className="h-3.5 w-3.5 text-amber-400" />
                <span>Sem Localização ({unplacedDevices.length})</span>
              </span>
              <span className="text-[10px] text-slate-500 font-mono">Clique para posicionar</span>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-1.5 pr-1">
              {unplacedDevices.map((d) => {
                const role = d.device_role || (d.is_bgp ? 'bgp' : 'sw')
                const cfg = ROLE_CONFIG[role] || ROLE_CONFIG.other
                return (
                  <div
                    key={d.id}
                    className="p-2 rounded-xl bg-[#161922] border border-[#242836] hover:border-[#3B5B8C] transition flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className={`text-[9px] font-black px-1 rounded ${cfg.bg} ${cfg.text}`}>
                          {cfg.icon}
                        </span>
                        <strong className="text-white truncate block text-[11px]">{d.name}</strong>
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono block truncate">{d.host}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {onUpdateCoordinates && (
                        <button
                          type="button"
                          onClick={() => setPlacingDeviceId(d.id)}
                          className="px-2 py-1 rounded-lg bg-[#25334D] hover:bg-[#3B5B8C] text-[#93B4E6] hover:text-white text-[10px] font-bold transition cursor-pointer"
                          title="Clique no mapa para posicionar este equipamento"
                        >
                          Posicionar
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Selected Device Details Flyout Overlay */}
        {selectedDevice && !isEditingLinkPath && (
          <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-20 sm:max-w-md bg-[#1C202C]/95 border border-[#242836] rounded-2xl p-4 shadow-2xl backdrop-blur-md space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-center justify-between border-b border-[#242836] pb-2">
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs font-black px-2 py-0.5 rounded-lg border ${
                    ROLE_CONFIG[selectedDevice.device_role || (selectedDevice.is_bgp ? 'bgp' : 'sw')].bg
                  } ${
                    ROLE_CONFIG[selectedDevice.device_role || (selectedDevice.is_bgp ? 'bgp' : 'sw')].text
                  } ${
                    ROLE_CONFIG[selectedDevice.device_role || (selectedDevice.is_bgp ? 'bgp' : 'sw')].border
                  }`}
                >
                  {ROLE_CONFIG[selectedDevice.device_role || (selectedDevice.is_bgp ? 'bgp' : 'sw')].label}
                </span>
                <h4 className="font-bold text-white text-sm truncate">{selectedDevice.name}</h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDevice(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#161922] transition cursor-pointer"
                title="Fechar"
              >
                &times;
              </button>
            </div>

            {/* Geographical details */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-[#161922] p-2.5 rounded-xl border border-[#242836]">
              <div>
                <span className="text-slate-500 font-sans text-[10px] block">Site / POP:</span>
                <span className="text-slate-200 font-semibold">{selectedDevice.site || 'Não especificado'}</span>
              </div>
              <div>
                <span className="text-slate-500 font-sans text-[10px] block">Cidade / UF:</span>
                <span className="text-slate-200 font-semibold">{selectedDevice.city || 'Não especificado'}</span>
              </div>
              <div>
                <span className="text-slate-500 font-sans text-[10px] block">Fabricante & Modelo:</span>
                <span className="text-[#93B4E6] uppercase">
                  {selectedDevice.vendor} {selectedDevice.model || ''}
                  <span className={`ml-1 text-[9px] font-bold px-1 rounded border ${
                    selectedDevice.protocol === 'telnet' || selectedDevice.port === 23 || selectedDevice.device_role === 'olt' || selectedDevice.vendor === 'fiberhome'
                      ? 'bg-orange-500/10 text-orange-400 border-orange-500/30'
                      : 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30'
                  }`}>
                    {selectedDevice.protocol === 'telnet' || selectedDevice.port === 23 || selectedDevice.device_role === 'olt' || selectedDevice.vendor === 'fiberhome' ? 'TELNET' : 'SSH'}
                  </span>
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-sans text-[10px] block">Coordenadas:</span>
                <span className="text-slate-400 text-[11px]">
                  {selectedDevice.latitude?.toFixed(4)}, {selectedDevice.longitude?.toFixed(4)}
                </span>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={() => handleOpenCreateLink(selectedDevice)}
                className="py-1.5 px-2.5 rounded-xl bg-cyan-950/60 hover:bg-cyan-900 text-cyan-300 text-xs font-semibold border border-cyan-500/40 transition cursor-pointer flex items-center justify-center gap-1.5"
                title="Criar enlace de fibra óptica a partir deste equipamento"
              >
                <Route className="h-3.5 w-3.5 text-cyan-400" />
                <span>Ligar Enlace</span>
              </button>

              {onSelectDeviceForTerminal && (
                <button
                  type="button"
                  onClick={() => onSelectDeviceForTerminal(selectedDevice)}
                  className="flex-1 py-1.5 px-2.5 rounded-xl bg-[#25334D] hover:bg-[#3B5B8C] text-slate-200 hover:text-white text-xs font-semibold border border-[#3B5B8C]/40 transition cursor-pointer flex items-center justify-center gap-1.5 min-w-[90px]"
                >
                  <Terminal className="h-3.5 w-3.5 text-[#93B4E6]" />
                  <span>Terminal</span>
                </button>
              )}

              {selectedDevice.is_bgp && onSelectDeviceForBGP && (
                <button
                  type="button"
                  onClick={() => onSelectDeviceForBGP(selectedDevice)}
                  className="flex-1 py-1.5 px-2.5 rounded-xl bg-blue-950/70 hover:bg-blue-900 text-blue-200 text-xs font-semibold border border-blue-500/40 transition cursor-pointer flex items-center justify-center gap-1.5 min-w-[80px]"
                >
                  <ArrowUpDown className="h-3.5 w-3.5 text-blue-400" />
                  <span>BGP</span>
                </button>
              )}

              {onUpdateCoordinates && (
                <button
                  type="button"
                  onClick={() => {
                    setPlacingDeviceId(selectedDevice.id)
                    setSelectedDevice(null)
                  }}
                  className="py-1.5 px-2.5 rounded-xl bg-amber-950/60 hover:bg-amber-900 text-amber-200 text-xs font-semibold border border-amber-600/40 transition cursor-pointer flex items-center justify-center gap-1.5"
                  title="Clique para reposicionar este equipamento em outro local do mapa"
                >
                  <MapPin className="h-3.5 w-3.5 text-amber-400" />
                  <span>Mover</span>
                </button>
              )}

              {onEditDevice && (
                <button
                  type="button"
                  onClick={() => {
                    const dev = selectedDevice
                    setSelectedDevice(null)
                    onEditDevice(dev)
                  }}
                  className="p-1.5 rounded-xl bg-[#161922] hover:bg-[#202738] text-slate-300 hover:text-white border border-[#242836] transition cursor-pointer"
                  title="Editar dados e coordenadas deste equipamento"
                >
                  <Edit2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* Selected Link Details Flyout Overlay */}
        {selectedLink && !isEditingLinkPath && (
          <div className="absolute bottom-4 left-4 right-4 sm:left-auto sm:right-4 z-20 sm:max-w-md bg-[#1C202C]/95 border border-[#242836] rounded-2xl p-4 shadow-2xl backdrop-blur-md space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
            {/* Alarm banner if link is down in Zabbix */}
            {selectedLink.status === 'down' && (
              <div className="p-3 rounded-xl bg-red-950/80 border border-red-500/70 text-red-200 text-xs flex flex-col gap-1.5 shadow-lg animate-pulse">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5 font-bold text-red-400">
                    <AlertTriangle className="h-4 w-4 text-red-400" />
                    <span>ROTA FORA DO AR (LINK DOWN - ZABBIX)</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleForceActiveLink(selectedLink)}
                    className="px-2 py-0.5 rounded bg-red-900 hover:bg-red-800 text-white text-[10px] font-bold transition cursor-pointer shadow-xs"
                    title="Forçar enlace como ativo temporariamente"
                  >
                    Forçar Ativo
                  </button>
                </div>
                {selectedLink.zabbix_problem && (
                  <p className="text-[11px] text-red-300 font-mono bg-red-950 p-1.5 rounded border border-red-800/50">
                    {selectedLink.zabbix_problem}
                  </p>
                )}
                {selectedLink.zabbix_last_alert && (
                  <span className="text-[10px] text-red-400/80">
                    Alerta recebido em: {new Date(selectedLink.zabbix_last_alert).toLocaleString()}
                  </span>
                )}
              </div>
            )}

            <div className="flex items-center justify-between border-b border-[#242836] pb-2">
              <div className="flex items-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full shrink-0 ${selectedLink.status === 'down' ? 'bg-red-500 animate-pulse' : ''}`}
                  style={{ backgroundColor: selectedLink.status === 'down' ? '#EF4444' : (selectedLink.color || '#00E5FF') }}
                />
                <h4 className="font-bold text-white text-sm truncate">{selectedLink.name}</h4>
              </div>
              <div className="flex items-center gap-1.5">
                {selectedLink.status === 'down' && (
                  <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-red-900 text-red-200 border border-red-700/60">
                    DOWN
                  </span>
                )}
                <button
                  type="button"
                  onClick={() => setSelectedLink(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#161922] transition cursor-pointer"
                  title="Fechar"
                >
                  &times;
                </button>
              </div>
            </div>

            {/* Link details grid */}
            <div className="grid grid-cols-2 gap-2 text-xs font-mono bg-[#161922] p-2.5 rounded-xl border border-[#242836]">
              <div>
                <span className="text-slate-500 font-sans text-[10px] block">Extremos:</span>
                <span className="text-slate-200 font-semibold truncate block">
                  {devices.find((d) => d.id === selectedLink.source_device_id)?.name || 'Origem'} ➔{' '}
                  {devices.find((d) => d.id === selectedLink.target_device_id)?.name || 'Destino'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-sans text-[10px] block">Comprimento Real:</span>
                <span className="text-white font-bold font-mono">
                  {selectedLink.distance_km ? selectedLink.distance_km.toFixed(1) + ' km' : '0 km'}
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-sans text-[10px] block">Meio & Capacidade:</span>
                <span className="text-cyan-300 font-semibold">
                  {selectedLink.type === 'radio' ? 'Rádio Digital' : 'Fibra Óptica'} ({selectedLink.capacity || '10G'})
                </span>
              </div>
              <div>
                <span className="text-slate-500 font-sans text-[10px] block">Traçado / Rota:</span>
                <span className="text-amber-400 font-semibold">
                  {selectedLink.routing_mode === 'road'
                    ? 'Rodovia / Estradas'
                    : selectedLink.routing_mode === 'manual'
                    ? 'Ramal / Desenho Manual'
                    : 'Rádio PTP Direto'}
                </span>
              </div>

              {/* Interfaces Row */}
              <div className="col-span-2 pt-1 border-t border-[#242836]/60">
                <span className="text-slate-500 font-sans text-[10px] block">Portas Monitoradas no Zabbix:</span>
                <span className="text-purple-300 font-semibold flex items-center gap-1.5">
                  <Link2 className="h-3 w-3 text-purple-400" />
                  <span>{selectedLink.source_interface || 'Porta A não inf.'}</span>
                  <span className="text-slate-500">➔</span>
                  <span>{selectedLink.target_interface || 'Porta B não inf.'}</span>
                </span>
              </div>
            </div>

            {/* Real-Time Traffic Section */}
            <div className="p-3 rounded-xl bg-[#161922] border border-[#242836] space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  <Gauge className="h-4 w-4 text-cyan-400" />
                  <span>Tráfego em Tempo Real (Zabbix)</span>
                </span>
                <button
                  type="button"
                  disabled={isCollectingTraffic}
                  onClick={async () => {
                    setIsCollectingTraffic(true)
                    try {
                      const res = await collectLinkTraffic(selectedLink.id)
                      if (res && res.link) {
                        setSelectedLink(res.link)
                        setLinks((prev) => prev.map((l) => (l.id === res.link.id ? res.link : l)))
                      }
                    } catch (err: unknown) {
                      const msg = err instanceof Error ? err.message : 'Erro ao coletar tráfego'
                      alert(msg)
                    } finally {
                      setIsCollectingTraffic(false)
                    }
                  }}
                  className="text-[10px] font-bold text-cyan-400 hover:text-cyan-200 flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-950/60 border border-cyan-600/40 hover:bg-cyan-900 cursor-pointer transition disabled:opacity-50"
                  title="Consultar tráfego atual via Zabbix API"
                >
                  <RefreshCw className={`h-3 w-3 ${isCollectingTraffic ? 'animate-spin' : ''}`} />
                  <span>{isCollectingTraffic ? 'Coletando...' : 'Atualizar'}</span>
                </button>
              </div>

              {/* RX and TX Metrics */}
              <div className="grid grid-cols-2 gap-2 pt-0.5 font-mono">
                <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] font-sans text-slate-400 flex items-center gap-1 mb-0.5">
                    <ArrowDown className="h-3 w-3 text-sky-400" />
                    <span>Download (RX)</span>
                  </span>
                  <span className="text-sm font-bold text-sky-400 block truncate">
                    {formatBps(selectedLink.traffic_rx_bps || 0)}
                  </span>
                </div>

                <div className="p-2 rounded-lg bg-slate-950/80 border border-slate-800">
                  <span className="text-[10px] font-sans text-slate-400 flex items-center gap-1 mb-0.5">
                    <ArrowUp className="h-3 w-3 text-emerald-400" />
                    <span>Upload (TX)</span>
                  </span>
                  <span className="text-sm font-bold text-emerald-400 block truncate">
                    {formatBps(selectedLink.traffic_tx_bps || 0)}
                  </span>
                </div>
              </div>

              {/* Bandwidth Utilization Progress Bar */}
              {(() => {
                const capBps = parseCapacityToBps(selectedLink.capacity)
                const maxTraffic = Math.max(
                  selectedLink.traffic_rx_bps || 0,
                  selectedLink.traffic_tx_bps || 0
                )
                const pct = capBps > 0 ? Math.min(100, (maxTraffic / capBps) * 100) : 0
                const barColor =
                  pct > 85 ? 'bg-red-500' : pct > 70 ? 'bg-amber-500' : 'bg-emerald-500'

                return (
                  <div className="space-y-1 pt-1">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-slate-400">
                        Ocupação do Enlace ({selectedLink.capacity || '10G'}):
                      </span>
                      <span className="font-bold text-white font-mono">{pct.toFixed(1)}%</span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-slate-800 overflow-hidden border border-slate-700/50">
                      <div
                        className={`h-full transition-all duration-500 ${barColor}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[9px] text-slate-500">
                      <span>
                        Interface: {selectedLink.traffic_monitored_iface || selectedLink.source_interface || 'Ponta A'} ({selectedLink.traffic_monitored_end === 'target' ? 'Ponta B' : 'Ponta A'})
                      </span>
                      {selectedLink.traffic_updated_at && (
                        <span>
                          {new Date(selectedLink.traffic_updated_at).toLocaleTimeString()}
                        </span>
                      )}
                    </div>
                  </div>
                )
              })()}
            </div>

            {/* Latency estimation info */}
            <div className="p-2 rounded-xl bg-[#161922] border border-[#242836] text-[11px] text-slate-400 flex items-center justify-between">
              <span>Latência teórica da fibra (~5µs/km):</span>
              <strong className="text-emerald-400 font-mono">
                {((selectedLink.distance_km || 0) * 0.005).toFixed(2)} ms RTT
              </strong>
            </div>

            {/* Link action buttons */}
            <div className="flex items-center gap-2 pt-1 flex-wrap">
              <button
                type="button"
                onClick={() => handleStartEditPath(selectedLink)}
                className="flex-1 py-1.5 px-2.5 rounded-xl bg-cyan-950/60 hover:bg-cyan-900 text-cyan-200 text-xs font-semibold border border-cyan-500/40 transition cursor-pointer flex items-center justify-center gap-1.5"
                title="Ajustar curvas e passar o cabo por ramais específicos diretamente no mapa"
              >
                <Sliders className="h-3.5 w-3.5 text-cyan-400" />
                <span>Editar Traçado / Ramal</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  setEditingLinkTarget(selectedLink)
                  setLinkFormSourceId(selectedLink.source_device_id)
                  setLinkFormTargetId(selectedLink.target_device_id)
                  setLinkFormSourceIface(selectedLink.source_interface || '')
                  setLinkFormTargetIface(selectedLink.target_interface || '')
                  setLinkFormTrafficEnd((selectedLink.traffic_monitored_end as 'source' | 'target') || 'source')
                  setLinkFormName(selectedLink.name)
                  setLinkFormType(selectedLink.type)
                  setLinkFormRoutingMode(selectedLink.routing_mode)
                  setLinkFormCapacity(selectedLink.capacity || '10G')
                  setLinkFormColor(selectedLink.color || '#00E5FF')
                  setLinkFormStatus(selectedLink.status)
                  setLinkFormNotes(selectedLink.notes || '')
                  setLinkFormWaypoints(selectedLink.waypoints || [])
                  setLinkFormPath(selectedLink.path || [])
                  setLinkFormDistanceKm(selectedLink.distance_km || 0)
                  setIsLinkModalOpen(true)
                }}
                className="p-1.5 rounded-xl bg-[#161922] hover:bg-[#202738] text-slate-300 hover:text-white border border-[#242836] transition cursor-pointer"
                title="Editar propriedades e interfaces do enlace"
              >
                <Edit2 className="h-3.5 w-3.5" />
              </button>

              <button
                type="button"
                onClick={() => handleDeleteLink(selectedLink.id)}
                className="p-1.5 rounded-xl bg-rose-950/40 hover:bg-rose-900 text-rose-300 border border-rose-500/40 transition cursor-pointer"
                title="Excluir enlace"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        )}

        {/* Floating In-Map Fullscreen Button (Positioned bottom-left to never collide with link/device detail cards) */}
        <button
          type="button"
          onClick={toggleFullscreen}
          className={`absolute bottom-5 left-5 z-20 p-2.5 rounded-xl bg-[#0F172A]/90 hover:bg-[#1E293B] text-slate-200 hover:text-white border border-slate-700/80 shadow-2xl backdrop-blur-md transition cursor-pointer items-center gap-1.5 group ${
            selectedLink || selectedDevice ? 'hidden sm:flex' : 'flex'
          }`}
          title={isFullscreen ? 'Sair da tela cheia (Esc)' : 'Expandir mapa em tela cheia'}
        >
          {isFullscreen ? (
            <>
              <Minimize2 className="h-4 w-4 text-cyan-400 group-hover:scale-110 transition" />
              <span className="text-xs font-bold hidden sm:inline">Restaurar</span>
            </>
          ) : (
            <>
              <Maximize2 className="h-4 w-4 text-cyan-400 group-hover:scale-110 transition" />
              <span className="text-xs font-bold hidden sm:inline">Tela Cheia</span>
            </>
          )}
        </button>
      </div>

      {/* New / Edit Backbone Link Modal */}
      {isLinkModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget && !isAddWaypointMode && !isManualDrawMode) {
              setIsLinkModalOpen(false)
            }
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto"
        >
          <div className="bg-[#1C202C] border border-[#2D3345] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-[#242836] flex items-center justify-between shrink-0 bg-[#161922]">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-cyan-950/60 border border-cyan-500/40 flex items-center justify-center text-cyan-400">
                  <Route className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100 text-sm">
                    {editingLinkTarget ? 'Editar Enlace de Backbone' : 'Novo Enlace Ponto a Ponto (PTP)'}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Traçado de cabo óptico por rodovias, ramais vicinais ou rádio enlace
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsLinkModalOpen(false)
                  setIsAddWaypointMode(false)
                  setIsManualDrawMode(false)
                }}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[#1C202C] transition cursor-pointer"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSaveLink} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
                {/* Source & Target Devices Selector */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Equipamento de Origem (Ponta A) *
                    </label>
                    <select
                      value={linkFormSourceId}
                      onChange={(e) => {
                        const newSrc = e.target.value
                        setLinkFormSourceId(newSrc)
                        handleRecalculateRoute(newSrc, linkFormTargetId, linkFormRoutingMode, linkFormWaypoints)
                      }}
                      required
                      className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="">Selecione a origem...</option>
                      {placedDevices.map((d) => (
                        <option key={d.id} value={d.id} disabled={d.id === linkFormTargetId}>
                          {d.name} ({d.site || d.city || d.host})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Equipamento de Destino (Ponta B) *
                    </label>
                    <select
                      value={linkFormTargetId}
                      onChange={(e) => {
                        const newTgt = e.target.value
                        setLinkFormTargetId(newTgt)
                        handleRecalculateRoute(linkFormSourceId, newTgt, linkFormRoutingMode, linkFormWaypoints)
                      }}
                      required
                      className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="">Selecione o destino...</option>
                      {placedDevices.map((d) => (
                        <option key={d.id} value={d.id} disabled={d.id === linkFormSourceId}>
                          {d.name} ({d.site || d.city || d.host})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Source & Target Interfaces (Ports) for Zabbix Monitoring */}
                <div className="p-3.5 rounded-xl bg-purple-950/20 border border-purple-500/30 space-y-3">
                  <div className="flex items-center justify-between border-b border-purple-500/20 pb-2">
                    <span className="text-xs font-bold text-purple-200 flex items-center gap-1.5">
                      <Link2 className="h-4 w-4 text-purple-400" />
                      <span>Interfaces Conectadas & Monitoramento Zabbix</span>
                    </span>
                    <span className="text-[10px] text-purple-300/70 font-mono">SNMP / JSON-RPC</span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-purple-200 flex items-center gap-1">
                          <span>Porta na Origem (Ponta A)</span>
                        </label>
                        {loadingSourceIfaces && (
                          <span className="text-[10px] text-purple-400 flex items-center gap-1 animate-pulse">
                            Buscando portas...
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        list="source-interfaces-list"
                        value={linkFormSourceIface}
                        onChange={(e) => setLinkFormSourceIface(e.target.value)}
                        placeholder="ex: 10GE0/1/1, ether1, XGE0/0/1"
                        className="w-full px-3 py-2 bg-slate-950/70 border border-purple-500/40 rounded-lg text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-purple-400"
                      />
                      <datalist id="source-interfaces-list">
                        {sourceInterfaces.map((iface) => (
                          <option key={iface} value={iface} />
                        ))}
                      </datalist>

                      {/* Quick suggestion chips */}
                      {sourceInterfaces.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5 max-h-16 overflow-y-auto">
                          {sourceInterfaces.slice(0, 6).map((iface) => (
                            <button
                              type="button"
                              key={iface}
                              onClick={() => setLinkFormSourceIface(iface)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition border ${
                                linkFormSourceIface === iface
                                  ? 'bg-purple-600 text-white border-purple-400'
                                  : 'bg-[#161922] text-slate-300 border-[#242836] hover:bg-purple-900/40'
                              }`}
                            >
                              {iface}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-purple-200 flex items-center gap-1">
                          <span>Porta no Destino (Ponta B)</span>
                        </label>
                        {loadingTargetIfaces && (
                          <span className="text-[10px] text-purple-400 flex items-center gap-1 animate-pulse">
                            Buscando portas...
                          </span>
                        )}
                      </div>
                      <input
                        type="text"
                        list="target-interfaces-list"
                        value={linkFormTargetIface}
                        onChange={(e) => setLinkFormTargetIface(e.target.value)}
                        placeholder="ex: 10GE0/1/2, ether2, XGE0/0/2"
                        className="w-full px-3 py-2 bg-slate-950/70 border border-purple-500/40 rounded-lg text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-purple-400"
                      />
                      <datalist id="target-interfaces-list">
                        {targetInterfaces.map((iface) => (
                          <option key={iface} value={iface} />
                        ))}
                      </datalist>

                      {/* Quick suggestion chips */}
                      {targetInterfaces.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5 max-h-16 overflow-y-auto">
                          {targetInterfaces.slice(0, 6).map((iface) => (
                            <button
                              type="button"
                              key={iface}
                              onClick={() => setLinkFormTargetIface(iface)}
                              className={`px-1.5 py-0.5 rounded text-[10px] font-mono cursor-pointer transition border ${
                                linkFormTargetIface === iface
                                  ? 'bg-purple-600 text-white border-purple-400'
                                  : 'bg-[#161922] text-slate-300 border-[#242836] hover:bg-purple-900/40'
                              }`}
                            >
                              {iface}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Choice of Which Interface Measures Traffic */}
                  <div className="pt-2 border-t border-purple-500/20">
                    <label className="block text-xs font-semibold text-purple-200 mb-1.5 flex items-center gap-1.5">
                      <Gauge className="h-3.5 w-3.5 text-cyan-400" />
                      <span>Interface para Coleta de Tráfego:</span>
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <label
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition text-xs ${
                          linkFormTrafficEnd === 'source'
                            ? 'bg-purple-900/40 border-purple-400 text-white'
                            : 'bg-[#161922] border-[#242836] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name="traffic_end"
                          value="source"
                          checked={linkFormTrafficEnd === 'source'}
                          onChange={() => setLinkFormTrafficEnd('source')}
                          className="accent-purple-500 cursor-pointer"
                        />
                        <div className="min-w-0">
                          <span className="font-semibold block truncate">Ponta A (Origem)</span>
                          <span className="text-[10px] font-mono text-purple-300 block truncate">
                            {linkFormSourceIface || 'Porta A não inf.'}
                          </span>
                        </div>
                      </label>

                      <label
                        className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer transition text-xs ${
                          linkFormTrafficEnd === 'target'
                            ? 'bg-purple-900/40 border-purple-400 text-white'
                            : 'bg-[#161922] border-[#242836] text-slate-400 hover:text-slate-200'
                        }`}
                      >
                        <input
                          type="radio"
                          name="traffic_end"
                          value="target"
                          checked={linkFormTrafficEnd === 'target'}
                          onChange={() => setLinkFormTrafficEnd('target')}
                          className="accent-purple-500 cursor-pointer"
                        />
                        <div className="min-w-0">
                          <span className="font-semibold block truncate">Ponta B (Destino)</span>
                          <span className="text-[10px] font-mono text-purple-300 block truncate">
                            {linkFormTargetIface || 'Porta B não inf.'}
                          </span>
                        </div>
                      </label>
                    </div>
                  </div>

                  <div className="text-[10px] text-purple-300/80 leading-relaxed pt-0.5">
                    💡 O NetPulse coletará automaticamente o tráfego desta interface e exibirá sobre a linha do cabo. Se a porta cair no Zabbix, a linha do cabo mudará para <strong>Vermelho Neon</strong>.
                  </div>
                </div>

                {/* Link Name */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Identificação / Nome do Enlace *
                  </label>
                  <input
                    type="text"
                    required
                    value={linkFormName}
                    onChange={(e) => setLinkFormName(e.target.value)}
                    placeholder="ex: Fibra BGP Pirabas ➔ PE Capanema (Via Ramal KM 14)"
                    className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500"
                  />
                </div>

                {/* Routing Mode Cards (Road vs Alternative Ramal vs Manual Draw vs Direct Radio) */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Modo de Traçado da Rota *
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setLinkFormRoutingMode('road')
                        setIsManualDrawMode(false)
                        handleRecalculateRoute(linkFormSourceId, linkFormTargetId, 'road', linkFormWaypoints)
                      }}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                        linkFormRoutingMode === 'road' && linkFormWaypoints.length === 0
                          ? 'bg-[#25334D] border-[#3B5B8C] text-white ring-1 ring-[#3B5B8C]'
                          : 'bg-[#161922] border-[#242836] text-slate-400 hover:border-[#3B5B8C]/40'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold text-white">
                        <span>🛣️ Rodovias (Auto)</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        Calcula o traçado automático pelas rodovias e estradas principais.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setLinkFormRoutingMode('road')
                        setIsManualDrawMode(false)
                        setIsAddWaypointMode(true)
                        setIsLinkModalOpen(false) // Minimizes modal so user clicks on the ramal road on map!
                      }}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                        linkFormRoutingMode === 'road' && (linkFormWaypoints.length > 0 || isAddWaypointMode)
                          ? 'bg-[#25334D] border-amber-500/60 text-white ring-1 ring-amber-500'
                          : 'bg-[#161922] border-[#242836] text-slate-400 hover:border-amber-500/40'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold text-amber-300">
                        <span>🔀 Por Ramal / Vicinal</span>
                        {linkFormWaypoints.length > 0 && (
                          <span className="bg-amber-500/20 text-amber-300 px-1 rounded text-[9px] font-bold">
                            {linkFormWaypoints.length}
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        Clique em ramais ou rotas alternativas no mapa para forçar a passagem do cabo.
                      </p>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setLinkFormRoutingMode('manual')
                        setIsAddWaypointMode(false)
                        setIsManualDrawMode(true)
                        setIsLinkModalOpen(false) // Minimizes modal so user clicks freely on map!
                      }}
                      className={`p-3 rounded-xl border text-left transition cursor-pointer flex flex-col gap-1 ${
                        linkFormRoutingMode === 'manual'
                          ? 'bg-[#25334D] border-emerald-500/60 text-white ring-1 ring-emerald-500'
                          : 'bg-[#161922] border-[#242836] text-slate-400 hover:border-emerald-500/40'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-300">
                        <span>✏️ Desenho Manual</span>
                      </div>
                      <p className="text-[10px] text-slate-400 leading-tight">
                        Desenhe o cabo clique a clique no mapa (ideal para rios, fazendas e travessias).
                      </p>
                    </button>
                  </div>
                </div>

                {/* Waypoints List if in Ramal mode */}
                {linkFormWaypoints.length > 0 && (
                  <div className="p-3 bg-amber-950/20 border border-amber-800/40 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-amber-300 flex items-center gap-1.5">
                        <Waypoints className="h-3.5 w-3.5 text-amber-400" />
                        <span>Pontos de Passagem no Ramal ({linkFormWaypoints.length}):</span>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddWaypointMode(true)
                          setIsLinkModalOpen(false)
                        }}
                        className="text-[10px] text-amber-400 hover:underline font-bold"
                      >
                        + Adicionar no Mapa
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {linkFormWaypoints.map((wp, idx) => (
                        <span
                          key={idx}
                          className="px-2 py-0.5 rounded-lg bg-[#161922] border border-[#242836] text-[10px] text-slate-300 flex items-center gap-1"
                        >
                          <span className="text-amber-400 font-bold">#{idx + 1}</span>
                          <span>
                            {wp[0].toFixed(3)}, {wp[1].toFixed(3)}
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              const updated = linkFormWaypoints.filter((_, i) => i !== idx)
                              setLinkFormWaypoints(updated)
                              handleRecalculateRoute(linkFormSourceId, linkFormTargetId, 'road', updated)
                            }}
                            className="text-slate-500 hover:text-rose-400 ml-0.5 cursor-pointer"
                          >
                            &times;
                          </button>
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Cable Specifications: Medium, Capacity, Color */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Meio Físico
                    </label>
                    <select
                      value={linkFormType}
                      onChange={(e) => setLinkFormType(e.target.value as LinkType)}
                      className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      <option value="fiber">Fibra Óptica Monomodo</option>
                      <option value="radio">Rádio Enlace Digital</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Capacidade / Banda
                    </label>
                    <select
                      value={linkFormCapacity}
                      onChange={(e) => setLinkFormCapacity(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
                    >
                      {CAPACITY_PRESETS.map((cap) => (
                        <option key={cap} value={cap}>
                          {cap}bps
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-slate-400 mb-1 flex items-center justify-between">
                      <span>Cor do Cabo</span>
                      <span className="text-[10px] text-slate-500 font-mono">{linkFormColor}</span>
                    </label>
                    <div className="flex items-center gap-1.5 pt-1">
                      {LINK_COLOR_PALETTE.map((pal) => (
                        <button
                          key={pal.id}
                          type="button"
                          onClick={() => setLinkFormColor(pal.id)}
                          className={`w-6 h-6 rounded-full transition cursor-pointer border-2 ${
                            linkFormColor === pal.id ? 'border-white scale-110 shadow-md ring-1 ring-white/40' : 'border-transparent hover:scale-105'
                          }`}
                          style={{ backgroundColor: pal.id }}
                          title={pal.label}
                        />
                      ))}
                      {/* Custom color input */}
                      <label
                        className="w-6 h-6 rounded-full border border-slate-600 flex items-center justify-center cursor-pointer overflow-hidden hover:scale-105 transition"
                        title="Cor personalizada (Clique para abrir paleta de cores)"
                        style={{ backgroundColor: linkFormColor }}
                      >
                        <input
                          type="color"
                          value={linkFormColor}
                          onChange={(e) => setLinkFormColor(e.target.value)}
                          className="opacity-0 w-0 h-0 cursor-pointer"
                        />
                      </label>
                    </div>
                    <span className="text-[9px] text-slate-500 block mt-1">
                      🚨 Em caso de queda (DOWN), o cabo fica vermelho no mapa.
                    </span>
                  </div>
                </div>

                {/* Real-time Route Calculation Info Box */}
                <div className="p-3.5 rounded-xl bg-[#161922] border border-[#242836] flex items-center justify-between">
                  <div>
                    <span className="text-[10px] text-slate-400 block">Comprimento Real Calculado:</span>
                    <div className="flex items-center gap-2">
                      <span className="text-base font-bold text-white font-mono">
                        {isCalculatingRoute ? (
                          <span className="text-cyan-400 animate-pulse text-xs">Calculando curvas da estrada...</span>
                        ) : (
                          `${linkFormDistanceKm.toFixed(2)} km`
                        )}
                      </span>
                      {linkFormPath.length > 2 && (
                        <span className="text-[10px] text-slate-500">({linkFormPath.length} pontos no traçado)</span>
                      )}
                    </div>
                  </div>

                  {linkFormRoutingMode === 'road' && (
                    <button
                      type="button"
                      onClick={handleConvertRoadToManual}
                      className="px-2.5 py-1.5 rounded-lg bg-[#25334D] hover:bg-[#3B5B8C] text-cyan-300 hover:text-white text-[10px] font-bold transition cursor-pointer"
                      title="Transforma as curvas da estrada em pontos editáveis livremente"
                    >
                      Converter em Pontos Manuais
                    </button>
                  )}
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1">
                    Observações do Ramal / Rota (Opcional)
                  </label>
                  <textarea
                    rows={2}
                    value={linkFormNotes}
                    onChange={(e) => setLinkFormNotes(e.target.value)}
                    placeholder="ex: Sai pela rodovia PA-136, desvia no KM 12 pelo ramal de terra até a torre de transmissão."
                    className="w-full px-3 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 resize-none"
                  />
                </div>
              </div>

              {/* Pinned Modal Footer */}
              <div className="p-4 border-t border-[#242836] flex items-center justify-between gap-3 shrink-0 bg-[#161922]">
                <button
                  type="button"
                  onClick={() => {
                    setIsLinkModalOpen(false)
                    setIsAddWaypointMode(false)
                    setIsManualDrawMode(false)
                  }}
                  className="px-4 py-2 bg-[#1E2330] hover:bg-[#252C3D] text-slate-300 rounded-xl text-xs font-medium cursor-pointer border border-[#2D3345] transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingLink || isCalculatingRoute || !linkFormSourceId || !linkFormTargetId}
                  className="px-5 py-2 bg-[#3B5B8C] hover:bg-[#4A72B2] text-white rounded-xl text-xs font-semibold shadow-sm cursor-pointer transition disabled:opacity-50"
                >
                  {isSavingLink ? 'Salvando Enlace...' : 'Salvar Enlace'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Google Maps API Key Modal */}
      {isApiKeyModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsApiKeyModalOpen(false)
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
        >
          <div className="bg-[#1C202C] border border-[#2D3345] rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-[#242836] flex items-center justify-between shrink-0 bg-[#161922]">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-amber-950/40 border border-amber-600/40 flex items-center justify-center text-amber-400">
                  <KeyRound className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100 text-sm">Configuração da API Google Maps</h3>
                  <p className="text-[11px] text-slate-400">Camadas cartográficas e chave oficial da Google Cloud</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsApiKeyModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[#1C202C] transition cursor-pointer"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleSaveApiKey} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
                {/* Informative Status Banner */}
                <div className="p-3.5 rounded-xl bg-[#161922] border border-[#242836] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-200 flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-[#93B4E6]" />
                      <span>Status da Integração:</span>
                    </span>
                    {googleApiKey ? (
                      <span className="text-[10px] font-bold text-emerald-400 bg-emerald-950/60 border border-emerald-500/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                        Chave Google Maps Ativa
                      </span>
                    ) : (
                      <span className="text-[10px] font-bold text-[#93B4E6] bg-[#25334D] border border-[#3B5B8C]/40 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        Modo Livre Ativo (Sem Chave)
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    O NetPulse <strong>não exige</strong> obrigatoriamente nenhuma chave de API para funcionar. O mapa opera nativamente com <strong>Google Satélite, Google Ruas e NOC Dark Gray (Esri)</strong> de alta resolução. Caso você queira utilizar sua própria chave da Google Cloud Platform para cotas corporativas dedicadas, configure-a abaixo.
                  </p>
                </div>

                {/* API Key Input */}
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-slate-300">
                    Chave de API da Google Cloud (API Key)
                  </label>
                  <div className="relative">
                    <input
                      type={showKeySecret ? 'text' : 'password'}
                      value={tempApiKey}
                      onChange={(e) => setTempApiKey(e.target.value)}
                      placeholder="AIzaSy..."
                      className="w-full px-3 py-2 bg-[#161922] border border-[#242836] rounded-xl text-xs text-slate-100 placeholder-slate-600 focus:outline-none focus:border-[#3B5B8C] font-mono pr-20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowKeySecret((prev) => !prev)}
                      className="absolute right-2 top-2 text-[10px] text-slate-400 hover:text-white px-2 py-0.5 rounded-md hover:bg-[#1C202C] cursor-pointer"
                    >
                      {showKeySecret ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </div>

                {/* Toast feedback */}
                {keySavedToast && (
                  <div className="p-2.5 rounded-xl bg-emerald-950/60 border border-emerald-600/50 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
                    <CheckCircle2 className="h-4 w-4 text-emerald-400" />
                    <span>Configuração da API atualizada com sucesso!</span>
                  </div>
                )}
              </div>

              {/* Modal Actions */}
              <div className="p-4 border-t border-[#242836] flex items-center justify-between gap-2 shrink-0 bg-[#161922]">
                <div>
                  {googleApiKey && (
                    <button
                      type="button"
                      onClick={handleRemoveApiKey}
                      className="text-xs text-rose-400 hover:text-rose-300 cursor-pointer font-medium hover:underline"
                    >
                      Remover Chave
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsApiKeyModalOpen(false)}
                    className="px-4 py-2 bg-[#1E2330] hover:bg-[#252C3D] text-slate-300 rounded-xl text-xs font-medium cursor-pointer border border-[#2D3345] transition"
                  >
                    Fechar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-[#3B5B8C] hover:bg-[#4A72B2] text-white rounded-xl text-xs font-semibold shadow-sm cursor-pointer transition"
                  >
                    Salvar Chave
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Zabbix Integration & Webhook Setup Modal */}
      {isZabbixModalOpen && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) setIsZabbixModalOpen(false)
          }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto animate-in fade-in duration-150"
        >
          <div className="bg-[#1C202C] border border-[#2D3345] rounded-2xl w-full max-w-2xl shadow-2xl overflow-hidden my-auto max-h-[90vh] flex flex-col animate-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 border-b border-[#242836] flex items-center justify-between shrink-0 bg-[#161922]">
              <div className="flex items-center gap-2.5">
                <div className="h-9 w-9 rounded-xl bg-red-950/50 border border-red-500/40 flex items-center justify-center text-red-400">
                  <Activity className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-100 text-sm flex items-center gap-2">
                    <span>Integração com Zabbix (API & Webhook)</span>
                    {zabbixConfig?.enabled && (
                      <span className="px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-400 border border-emerald-500/40 text-[10px] font-bold">
                        ATIVO
                      </span>
                    )}
                  </h3>
                  <p className="text-[11px] text-slate-400">
                    Monitore portas e exiba automaticamente rotas caídas em vermelho pulsante no mapa
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsZabbixModalOpen(false)}
                className="text-slate-400 hover:text-white p-1.5 rounded-lg hover:bg-[#1C202C] transition cursor-pointer"
                title="Fechar"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Tabs */}
            <div className="flex border-b border-[#242836] bg-[#161922] px-4 gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setZabbixActiveTab('config')}
                className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition cursor-pointer ${
                  zabbixActiveTab === 'config'
                    ? 'border-red-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Servidor & Conexão
              </button>
              <button
                type="button"
                onClick={() => setZabbixActiveTab('webhook')}
                className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition cursor-pointer ${
                  zabbixActiveTab === 'webhook'
                    ? 'border-red-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Webhook em Tempo Real
              </button>
              <button
                type="button"
                onClick={() => setZabbixActiveTab('sync')}
                className={`py-2.5 px-3 text-xs font-semibold border-b-2 transition cursor-pointer ${
                  zabbixActiveTab === 'sync'
                    ? 'border-red-500 text-white'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                }`}
              >
                Sincronizar Enlaces ({links.length})
              </button>
            </div>

            {/* Tab 1: Config Form */}
            {zabbixActiveTab === 'config' && (
              <form onSubmit={handleSaveZabbixConfig} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1">
                  {/* Enable Switch */}
                  <div className="flex items-center justify-between p-3 rounded-xl bg-[#161922] border border-[#242836]">
                    <div>
                      <span className="text-xs font-bold text-white block">Ativar Monitoramento Zabbix</span>
                      <span className="text-[11px] text-slate-400 block">
                        Habilita a recepção de alertas e consulta automática de interfaces
                      </span>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={zabbixFormEnabled}
                        onChange={(e) => setZabbixFormEnabled(e.target.checked)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-600"></div>
                    </label>
                  </div>

                  {/* Zabbix URL */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      URL do Servidor Zabbix (com ou sem /api_jsonrpc.php) *
                    </label>
                    <input
                      type="url"
                      required
                      value={zabbixFormUrl}
                      onChange={(e) => setZabbixFormUrl(e.target.value)}
                      placeholder="http://10.80.80.5/zabbix ou https://zabbix.provedor.net"
                      className="w-full px-3 py-2 bg-[#161922] border border-[#242836] rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500 font-mono"
                    />
                  </div>

                  {/* API Token vs User/Pass */}
                  <div className="p-3.5 rounded-xl bg-[#161922] border border-[#242836] space-y-3">
                    <span className="text-xs font-bold text-slate-200 block">
                      Autenticação na API (JSON-RPC 2.0)
                    </span>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs text-slate-400">
                          API Token (Recomendado para Zabbix 5.4, 6.x e 7.x)
                        </label>
                        {zabbixConfig?.has_api_token && (
                          <span className="text-[10px] text-emerald-400 font-semibold">✓ Token já configurado</span>
                        )}
                      </div>
                      <input
                        type="password"
                        value={zabbixFormToken}
                        onChange={(e) => setZabbixFormToken(e.target.value)}
                        placeholder={zabbixConfig?.has_api_token ? '•••••••••••••••••••• (deixe vazio para manter)' : 'Bearer API Token gerado no Zabbix'}
                        className="w-full px-3 py-2 bg-[#0E1118] border border-[#242836] rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500 font-mono"
                      />
                    </div>

                    <div className="pt-2 border-t border-[#242836]/60">
                      <span className="text-[11px] text-slate-400 block mb-2">
                        Ou utilize Usuário e Senha (para Zabbix legado ou sem API Token):
                      </span>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <input
                            type="text"
                            value={zabbixFormUser}
                            onChange={(e) => setZabbixFormUser(e.target.value)}
                            placeholder="Usuário (ex: Admin)"
                            className="w-full px-3 py-2 bg-[#0E1118] border border-[#242836] rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500"
                          />
                        </div>
                        <div>
                          <input
                            type="password"
                            value={zabbixFormPass}
                            onChange={(e) => setZabbixFormPass(e.target.value)}
                            placeholder={zabbixConfig?.has_password ? '•••••••• (deixe vazio para manter)' : 'Senha'}
                            className="w-full px-3 py-2 bg-[#0E1118] border border-[#242836] rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500 font-mono"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Webhook Secret */}
                  <div>
                    <label className="block text-xs font-medium text-slate-300 mb-1">
                      Token Secreto do Webhook (Validação de Segurança)
                    </label>
                    <input
                      type="text"
                      value={zabbixFormSecret}
                      onChange={(e) => setZabbixFormSecret(e.target.value)}
                      placeholder="Chave secreta alfanumérica"
                      className="w-full px-3 py-2 bg-[#161922] border border-[#242836] rounded-xl text-xs text-white placeholder-slate-600 focus:outline-none focus:border-red-500 font-mono"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      Este token é adicionado no webhook do Zabbix como parâmetro de autenticação para proteger contra envios indevidos.
                    </p>
                  </div>

                  {/* Test Result Toast */}
                  {testResult && (
                    <div
                      className={`p-3 rounded-xl border text-xs flex items-center gap-2.5 animate-in fade-in ${
                        testResult.success
                          ? 'bg-emerald-950/60 border-emerald-500/50 text-emerald-300'
                          : 'bg-red-950/60 border-red-500/50 text-red-300'
                      }`}
                    >
                      {testResult.success ? (
                        <>
                          <CheckCircle className="h-4 w-4 text-emerald-400 shrink-0" />
                          <div>
                            <strong>Conexão com Zabbix OK!</strong>
                            <span className="block text-[11px] opacity-90">
                              Versão do Servidor: {testResult.version || 'Detectada com sucesso'}
                            </span>
                          </div>
                        </>
                      ) : (
                        <>
                          <AlertTriangle className="h-4 w-4 text-red-400 shrink-0" />
                          <div>
                            <strong>Falha no teste:</strong>
                            <span className="block text-[11px] opacity-90">{testResult.error}</span>
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Modal Footer */}
                <div className="p-4 border-t border-[#242836] flex items-center justify-between gap-2 shrink-0 bg-[#161922]">
                  <button
                    type="button"
                    disabled={testingZabbix || !zabbixFormUrl}
                    onClick={handleTestZabbix}
                    className="px-3.5 py-2 rounded-xl bg-[#1E2330] hover:bg-[#252C3D] text-slate-200 border border-[#2D3345] text-xs font-semibold transition cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                  >
                    <RefreshCw className={`h-3.5 w-3.5 ${testingZabbix ? 'animate-spin' : ''}`} />
                    <span>{testingZabbix ? 'Testando Conexão...' : 'Testar Conexão'}</span>
                  </button>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setIsZabbixModalOpen(false)}
                      className="px-4 py-2 bg-[#1E2330] hover:bg-[#252C3D] text-slate-300 rounded-xl text-xs font-medium cursor-pointer border border-[#2D3345] transition"
                    >
                      Fechar
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingZabbix}
                      className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-xl text-xs font-semibold shadow-sm cursor-pointer transition disabled:opacity-50"
                    >
                      {isSavingZabbix ? 'Salvando...' : 'Salvar Configurações'}
                    </button>
                  </div>
                </div>
              </form>
            )}

            {/* Tab 2: Webhook Instructions & Script */}
            {zabbixActiveTab === 'webhook' && (
              <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 text-xs">
                {/* Webhook URL Card */}
                <div className="p-3.5 rounded-xl bg-[#161922] border border-[#242836] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-white flex items-center gap-1.5">
                      <Link2 className="h-4 w-4 text-red-400" />
                      <span>URL do Webhook do NetPulse (Endpoint Receptor)</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        const targetUrl = webhookScriptData?.webhook_url
                          ? (webhookScriptData.webhook_url.includes(':8088') || webhookScriptData.webhook_url.includes(':3000')
                              ? webhookScriptData.webhook_url
                              : webhookScriptData.webhook_url.replace('/api/webhooks/zabbix', ':8088/api/webhooks/zabbix'))
                          : `http://${window.location.hostname}:8088/api/webhooks/zabbix`
                        const fullUrl = `${targetUrl}?token=${encodeURIComponent(webhookScriptData?.webhook_secret || zabbixFormSecret)}`
                        navigator.clipboard.writeText(fullUrl)
                        setCopiedUrl(true)
                        setTimeout(() => setCopiedUrl(false), 2000)
                      }}
                      className="px-2.5 py-1 bg-red-950/60 hover:bg-red-900 text-red-200 rounded-lg font-semibold flex items-center gap-1 text-[11px] border border-red-500/40 cursor-pointer"
                    >
                      {copiedUrl ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedUrl ? 'Copiado!' : 'Copiar URL Completa'}</span>
                    </button>
                  </div>
                  <div className="p-2 rounded-lg bg-[#0E1118] border border-[#242836] font-mono text-[11px] text-cyan-200 select-all break-all">
                    {(() => {
                      const base = webhookScriptData?.webhook_url
                        ? (webhookScriptData.webhook_url.includes(':8088') || webhookScriptData.webhook_url.includes(':3000')
                            ? webhookScriptData.webhook_url
                            : webhookScriptData.webhook_url.replace('/api/webhooks/zabbix', ':8088/api/webhooks/zabbix'))
                        : `http://${window.location.hostname}:8088/api/webhooks/zabbix`
                      return `${base}?token=${webhookScriptData?.webhook_secret || zabbixFormSecret}`
                    })()}
                  </div>
                  <div className="p-2 rounded-lg bg-amber-950/40 border border-amber-600/40 text-[11px] text-amber-200">
                    ⚠️ <strong>Atenção à Porta de Rede:</strong> O NetPulse responde na porta <strong>:8088</strong> (ou :3000). Certifique-se de que a URL no Zabbix contenha <code>:8088</code> (ex: <code>http://10.12.199.251:8088/api/webhooks/zabbix</code>). Não utilize a porta 80 padrão pois ela está ocupada por outro serviço no servidor.
                  </div>
                </div>

                {/* Step-by-step Guide */}
                <div className="p-3.5 rounded-xl bg-[#161922] border border-[#242836] space-y-2">
                  <span className="font-bold text-slate-200 block">Como configurar no Zabbix (3 Passos Rápidos):</span>
                  <ol className="list-decimal list-inside space-y-1.5 text-slate-300 text-[11px]">
                    <li>No Zabbix, vá em <strong>Administração ➔ Tipos de Mídia</strong> e clique em <strong>Criar tipo de mídia</strong>.</li>
                    <li>Defina o nome como <code className="text-cyan-300">NetPulse Webhook</code> e selecione o Tipo <code className="text-cyan-300">Webhook</code>.</li>
                    <li>Copie o script JavaScript abaixo e cole no campo de Script do tipo de mídia.</li>
                    <li>Em <strong>Ações de Trigger</strong>, adicione uma operação para enviar mensagem via NetPulse Webhook!</li>
                  </ol>
                </div>

                {/* JavaScript Code snippet */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-300">Script JavaScript do Webhook:</span>
                    <button
                      type="button"
                      onClick={() => {
                        if (webhookScriptData?.script) {
                          navigator.clipboard.writeText(webhookScriptData.script)
                          setCopiedScript(true)
                          setTimeout(() => setCopiedScript(false), 2000)
                        }
                      }}
                      className="px-2.5 py-1 bg-red-950/60 hover:bg-red-900 text-red-200 rounded-lg font-semibold flex items-center gap-1 text-[11px] border border-red-500/40 cursor-pointer"
                    >
                      {copiedScript ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                      <span>{copiedScript ? 'Copiado para Área de Transferência!' : 'Copiar Script JS'}</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-xl bg-[#0E1118] border border-[#242836] text-[11px] font-mono text-slate-300 overflow-x-auto max-h-56 leading-relaxed">
                    {webhookScriptData?.script || '// Carregando script...'}
                  </pre>
                </div>

                {/* Parameters table */}
                {webhookScriptData?.parameters && (
                  <div className="space-y-1.5">
                    <span className="font-semibold text-slate-300">Parâmetros do Webhook configurados no Zabbix:</span>
                    <div className="border border-[#242836] rounded-xl overflow-hidden max-h-40 overflow-y-auto">
                      <table className="w-full text-left text-[11px]">
                        <thead className="bg-[#161922] text-slate-400 border-b border-[#242836]">
                          <tr>
                            <th className="p-2 font-mono">Nome do Parâmetro</th>
                            <th className="p-2 font-mono">Valor Macro no Zabbix</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[#242836]">
                          {webhookScriptData.parameters.map((p) => (
                            <tr key={p.name} className="hover:bg-[#161922]/50">
                              <td className="p-2 font-mono text-cyan-300 font-semibold">{p.name}</td>
                              <td className="p-2 font-mono text-slate-300">{p.value}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 3: Link Sync */}
            {zabbixActiveTab === 'sync' && (
              <div className="p-4 sm:p-6 space-y-4 overflow-y-auto flex-1 text-xs">
                <div className="p-4 rounded-xl bg-[#161922] border border-[#242836] flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <strong className="text-white block text-sm">Sincronização Sob Demanda</strong>
                    <span className="text-[11px] text-slate-400 block">
                      Consulta todos os enlaces cadastrados com portas configuradas diretamente na API do Zabbix.
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={syncingZabbix || !zabbixConfig?.enabled}
                    onClick={handleSyncZabbix}
                    className="px-4 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white font-bold transition cursor-pointer flex items-center justify-center gap-2 shadow-sm disabled:opacity-50 shrink-0"
                  >
                    <RefreshCw className={`h-4 w-4 ${syncingZabbix ? 'animate-spin' : ''}`} />
                    <span>{syncingZabbix ? 'Sincronizando...' : 'Sincronizar Estados Agora'}</span>
                  </button>
                </div>

                {/* Sync Result */}
                {syncResult && (
                  <div className="p-3 rounded-xl bg-[#161922] border border-[#242836] space-y-1">
                    <span className="font-bold text-white block">Resultado da Sincronização:</span>
                    <div className="grid grid-cols-3 gap-2 font-mono text-center pt-1">
                      <div className="p-2 rounded bg-[#0E1118]">
                        <span className="text-[10px] text-slate-400 block font-sans">Verificados</span>
                        <strong className="text-white text-base">{syncResult.checked_links}</strong>
                      </div>
                      <div className="p-2 rounded bg-red-950/40 border border-red-500/30">
                        <span className="text-[10px] text-red-300 block font-sans">Caídos (DOWN)</span>
                        <strong className="text-red-400 text-base">{syncResult.down_links}</strong>
                      </div>
                      <div className="p-2 rounded bg-emerald-950/40 border border-emerald-500/30">
                        <span className="text-[10px] text-emerald-300 block font-sans">Atualizados</span>
                        <strong className="text-emerald-400 text-base">{syncResult.updated_links}</strong>
                      </div>
                    </div>
                  </div>
                )}

                {/* Enlaces List Overview */}
                <div className="space-y-2">
                  <span className="font-semibold text-slate-300 block">Status dos Enlaces Cadastrados:</span>
                  <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                    {links.map((l) => (
                      <div
                        key={l.id}
                        className={`p-2.5 rounded-xl border flex items-center justify-between gap-2 ${
                          l.status === 'down'
                            ? 'bg-red-950/40 border-red-500/60 text-red-200'
                            : 'bg-[#161922] border-[#242836] text-slate-300'
                        }`}
                      >
                        <div className="min-w-0">
                          <span className="font-bold text-white block truncate">{l.name}</span>
                          <span className="text-[10px] text-slate-400 block font-mono">
                            Portas: {l.source_interface || 'N/A'} ➔ {l.target_interface || 'N/A'}
                          </span>
                          {l.status === 'down' && l.zabbix_problem && (
                            <span className="text-[10px] text-red-300 italic block truncate">
                              ⚠️ {l.zabbix_problem}
                            </span>
                          )}
                        </div>
                        <div className="shrink-0 flex items-center gap-1.5">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                              l.status === 'down'
                                ? 'bg-red-900 text-red-200 border border-red-700 animate-pulse'
                                : 'bg-emerald-950 text-emerald-300 border border-emerald-500/40'
                            }`}
                          >
                            {l.status.toUpperCase()}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
