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
} from 'lucide-react'
import type { Device, DeviceRole } from '../../services/api'
import {
  fetchBackboneLinks,
  createBackboneLink,
  updateBackboneLink,
  deleteBackboneLink,
  calculateRoadRoute,
  haversineDistance,
  type BackboneLink,
  type LinkType,
  type LinkRoutingMode,
  type LinkStatus,
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
        if (isAddWaypointMode) setIsAddWaypointMode(false)
        if (isManualDrawMode) setIsManualDrawMode(false)
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
      mapInstanceRef.current?.invalidateSize()
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
      map.invalidateSize()
    }, 150)

    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize()
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
    const newLayer = L.tileLayer(tileUrl, {
      maxZoom: provider.maxZoom,
      subdomains: provider.subdomains,
      attribution: provider.attribution,
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
      const color = link.color || '#00E5FF'

      // Outer glowing halo
      const glowLine = L.polyline(link.path, {
        color,
        weight: isSelected ? 8 : 6,
        opacity: isSelected ? 0.6 : 0.25,
        lineCap: 'round',
        lineJoin: 'round',
      })

      // Inner core cable line
      const coreLine = L.polyline(link.path, {
        color,
        weight: isSelected ? 4 : 3,
        opacity: 0.95,
        dashArray: link.type === 'radio' || link.status === 'planned' ? '6, 6' : undefined,
        lineCap: 'round',
        lineJoin: 'round',
      })

      const tooltipContent = `
        <div style="font-family: inherit; font-size: 11px; padding: 2px 4px; line-height: 1.3;">
          <strong style="color: #FFFFFF;">${link.name}</strong><br/>
          <span style="color: ${color}; font-weight: 700;">${link.capacity || '10G'}</span> •
          <span style="color: #94A3B8;">${link.distance_km ? link.distance_km.toFixed(1) + ' km' : ''}</span>
          ${link.type === 'radio' ? ' • <span style="color: #F59E0B;">Rádio</span>' : ' • <span style="color: #38BDF8;">Fibra</span>'}
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
    })
  }, [links, selectedLink, mapReady])

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
    setLinkFormWaypoints([])
    setLinkFormPath([])
    setLinkFormDistanceKm(0)

    setIsLinkModalOpen(true)

    if (srcId && tgtId) {
      handleRecalculateRoute(srcId, tgtId, 'road', [])
    }
  }

  // Save new or edited link
  const handleSaveLink = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!linkFormSourceId || !linkFormTargetId) return

    setIsSavingLink(true)
    try {
      const payload: Partial<BackboneLink> = {
        name: linkFormName.trim(),
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

      setIsLinkModalOpen(false)
      setIsAddWaypointMode(false)
      setIsManualDrawMode(false)
      setEditingLinkTarget(null)
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

  return (
    <div className="space-y-4">
      {/* Top Map Control Bar */}
      <div className="p-4 rounded-2xl bg-[#1C202C] border border-[#242836] shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
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
        <div className="p-3.5 rounded-2xl bg-amber-950/60 border border-amber-600/70 text-amber-200 text-xs flex items-center justify-between shadow-lg animate-in fade-in duration-150">
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
        <div className="p-3.5 rounded-2xl bg-cyan-950/70 border border-cyan-500/70 text-cyan-200 text-xs flex items-center justify-between shadow-xl animate-in fade-in duration-150">
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

      {/* Main Map Box & Lateral Overlay */}
      <div
        className={`relative rounded-2xl border border-[#242836] overflow-hidden bg-[#13151D] shadow-2xl h-[620px] sm:h-[680px] ${
          placingDeviceId || isAddWaypointMode || isManualDrawMode
            ? 'cursor-crosshair [&_.leaflet-container]:!cursor-crosshair [&_.leaflet-grab]:!cursor-crosshair'
            : ''
        }`}
      >
        {/* Leaflet DOM container */}
        <div ref={mapContainerRef} className="w-full h-full z-0" />

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
                        isSelected
                          ? 'bg-[#25334D] border-[#3B5B8C] text-white'
                          : 'bg-[#161922] border-[#242836] text-slate-300 hover:border-[#3B5B8C]/60'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <strong className="truncate font-semibold flex items-center gap-1.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ backgroundColor: link.color || '#00E5FF' }}
                          />
                          <span>{link.name}</span>
                        </strong>
                        <span className="text-[10px] px-1.5 py-0.2 rounded font-bold bg-[#1C202C] text-cyan-300 font-mono">
                          {link.capacity || '10G'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center justify-between">
                        <span className="truncate">
                          {src?.name || 'Origem'} ➔ {tgt?.name || 'Destino'}
                        </span>
                        <span className="font-mono text-slate-300 font-bold shrink-0">
                          {link.distance_km ? link.distance_km.toFixed(1) + ' km' : ''}
                        </span>
                      </div>
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
                <span className="text-[#93B4E6] uppercase">{selectedDevice.vendor} {selectedDevice.model || ''}</span>
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
            <div className="flex items-center justify-between border-b border-[#242836] pb-2">
              <div className="flex items-center gap-2">
                <span
                  className="w-3 h-3 rounded-full shrink-0"
                  style={{ backgroundColor: selectedLink.color || '#00E5FF' }}
                />
                <h4 className="font-bold text-white text-sm truncate">{selectedLink.name}</h4>
              </div>
              <button
                type="button"
                onClick={() => setSelectedLink(null)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-[#161922] transition cursor-pointer"
                title="Fechar"
              >
                &times;
              </button>
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
                title="Editar propriedades do enlace"
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
                    <label className="block text-xs font-medium text-slate-400 mb-1">
                      Cor do Cabo no Mapa
                    </label>
                    <div className="flex items-center gap-1.5 pt-1">
                      {LINK_COLOR_PALETTE.map((pal) => (
                        <button
                          key={pal.id}
                          type="button"
                          onClick={() => setLinkFormColor(pal.id)}
                          className={`w-6 h-6 rounded-full transition cursor-pointer border-2 ${
                            linkFormColor === pal.id ? 'border-white scale-110 shadow-md' : 'border-transparent'
                          }`}
                          style={{ backgroundColor: pal.id }}
                          title={pal.label}
                        />
                      ))}
                    </div>
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
    </div>
  )
}
