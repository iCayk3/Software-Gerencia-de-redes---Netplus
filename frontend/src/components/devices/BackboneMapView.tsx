import React, { useEffect, useRef, useState, useMemo } from 'react'
import L from 'leaflet'
import {
  Server,
  Network,
  Radio,
  Layers,
  Crown,
  MapPin,
  Search,
  Terminal,
  ArrowUpDown,
  CheckCircle2,
  Compass,
  Edit2,
  Plus,
  KeyRound,
  Eye,
  EyeOff,
  ExternalLink,
  ShieldCheck,
  X,
  Sparkles,
} from 'lucide-react'
import type { Device, DeviceRole } from '../../services/api'
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
  const markersLayerRef = useRef<L.LayerGroup | null>(null)
  const tileLayerRef = useRef<L.TileLayer | null>(null)

  // Filters state
  const [roleFilter, setRoleFilter] = useState<'all' | DeviceRole>('all')
  const [statusFilter, setStatusFilter] = useState<'all' | 'online' | 'offline'>('all')
  const [search, setSearch] = useState('')
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)

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
    // Auto-migrate from any legacy 'dark' or 'osm' that caused "API Required"
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

  // Cancel placement mode on Escape
  useEffect(() => {
    if (!placingDeviceId) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPlacingDeviceId(null)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [placingDeviceId])

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
    const res = {
      total: devices.length,
      bgp: 0,
      pe: 0,
      sw: 0,
      olt: 0,
      online: 0,
      offline: 0,
      placed: placedDevices.length,
      unplaced: unplacedDevices.length,
    }
    devices.forEach((d) => {
      const r = d.device_role || (d.is_bgp ? 'bgp' : 'sw')
      if (r === 'bgp') res.bgp++
      else if (r === 'pe') res.pe++
      else if (r === 'sw') res.sw++
      else if (r === 'olt') res.olt++

      if (d.status === 'online') res.online++
      else res.offline++
    })
    return res
  }, [devices, placedDevices, unplacedDevices])

  // Initialize Leaflet Map once
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return

    // Default center in Northern/Eastern Brazil (Pará/Belém region or central Brazil)
    const initialLat = placedDevices.length > 0 ? Number(placedDevices[0].latitude) : -1.4558
    const initialLng = placedDevices.length > 0 ? Number(placedDevices[0].longitude) : -48.4902

    const map = L.map(mapContainerRef.current, {
      center: [initialLat, initialLng],
      zoom: placedDevices.length > 0 ? 10 : 5,
      zoomControl: false,
      attributionControl: false,
    })

    // Custom positioned zoom control at top-right
    L.control.zoom({ position: 'topright' }).addTo(map)

    // Layer group to hold dynamic markers
    const markersGroup = L.layerGroup().addTo(map)
    markersLayerRef.current = markersGroup
    mapInstanceRef.current = map
    setMapReady(true)

    // Ensure map tiles calculate correct container dimensions immediately
    setTimeout(() => {
      map.invalidateSize()
    }, 150)

    // Resize observer to auto-adapt if window or layout flexbox changes
    let resizeObserver: ResizeObserver | null = null
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      resizeObserver = new ResizeObserver(() => {
        map.invalidateSize()
      })
      resizeObserver.observe(mapContainerRef.current)
    }

    // Handle click on map when placing a device
    map.on('click', async (e: L.LeafletMouseEvent) => {
      const activePlacingId = placingDeviceIdRef.current
      if (!activePlacingId || !onUpdateCoordinates) return

      const { lat, lng } = e.latlng
      setSavingLocation(true)
      try {
        await onUpdateCoordinates(activePlacingId, Number(lat.toFixed(6)), Number(lng.toFixed(6)))
        setPlacingDeviceId(null)
      } finally {
        setSavingLocation(false)
      }
    })

    return () => {
      if (resizeObserver) {
        resizeObserver.disconnect()
      }
      map.remove()
      mapInstanceRef.current = null
      tileLayerRef.current = null
      setMapReady(false)
    }
  }, [])

  // Synchronize dynamic tile layer (Google Satélite / Google Ruas / Esri Dark / Google Relevo)
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
    // Send tile layer to back so markers are always visible on top
    if ((newLayer as any).bringToBack) {
      (newLayer as any).bringToBack()
    }
    tileLayerRef.current = newLayer
  }, [activeLayer, googleApiKey, mapReady])

  // Keep a ref to placingDeviceId for the Leaflet event listener
  const placingDeviceIdRef = useRef<string | null>(placingDeviceId)
  useEffect(() => {
    placingDeviceIdRef.current = placingDeviceId
    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize()
    }, 50)
    return () => clearTimeout(timer)
  }, [placingDeviceId])

  // Update markers when visibleDevices changes
  useEffect(() => {
    const map = mapInstanceRef.current
    const layer = markersLayerRef.current
    if (!map || !layer) return

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

      // Custom HTML Marker Pin
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

      // Click event selects device for quick actions flyout
      marker.on('click', () => {
        setSelectedDevice(dev)
      })

      // Drag event updates coordinates directly when marker is dropped
      marker.on('dragend', async (e: L.LeafletEvent) => {
        const target = e.target as L.Marker
        const newPos = target.getLatLng()
        if (onUpdateCoordinates) {
          await onUpdateCoordinates(
            dev.id,
            Number(newPos.lat.toFixed(6)),
            Number(newPos.lng.toFixed(6))
          )
        }
      })
    })

    // If there are placed markers, fit bounds smoothly
    if (visibleDevices.length > 0 && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 14 })
    }
  }, [visibleDevices, devices])

  // Center on entire backbone bounds
  const handleResetView = () => {
    const map = mapInstanceRef.current
    if (!map || visibleDevices.length === 0) return
    const bounds = L.latLngBounds(
      visibleDevices.map((d) => [Number(d.latitude), Number(d.longitude)])
    )
    if (bounds.isValid()) {
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 14 })
    }
  }

  return (
    <div className="space-y-4">
      {/* Top Backbone KPI Summary */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        <div className="p-3.5 rounded-2xl bg-[#1C202C] border border-[#242836] shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#25334D] border border-[#3B5B8C]/40 flex items-center justify-center text-[#93B4E6] shrink-0">
            <Server className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Backbone Total</span>
            <span className="text-lg font-bold text-white">{counts.total}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#1C202C] border border-[#242836] shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-blue-950/70 border border-blue-500/40 flex items-center justify-center text-blue-400 shrink-0">
            <ArrowUpDown className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Bordas BGP</span>
            <span className="text-lg font-bold text-blue-300">{counts.bgp}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#1C202C] border border-[#242836] shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-purple-950/70 border border-purple-500/40 flex items-center justify-center text-purple-400 shrink-0">
            <Network className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Roteadores PE</span>
            <span className="text-lg font-bold text-purple-300">{counts.pe}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#1C202C] border border-[#242836] shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-emerald-950/70 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shrink-0">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Switches Core</span>
            <span className="text-lg font-bold text-emerald-300">{counts.sw}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#1C202C] border border-[#242836] shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-amber-950/70 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
            <Radio className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">OLTs Ópticas</span>
            <span className="text-lg font-bold text-amber-300">{counts.olt}</span>
          </div>
        </div>

        <div className="p-3.5 rounded-2xl bg-[#1C202C] border border-[#242836] shadow-sm flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-[#161922] border border-[#242836] flex items-center justify-center text-emerald-400 shrink-0">
            <CheckCircle2 className="h-5 w-5" />
          </div>
          <div>
            <span className="text-[11px] font-medium text-slate-400 block uppercase tracking-wider">Status Online</span>
            <span className="text-lg font-bold text-white">
              {counts.online} <span className="text-xs font-normal text-slate-400">/ {counts.total}</span>
            </span>
          </div>
        </div>
      </div>

      {/* Map Control Bar & Filters */}
      <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 bg-[#1C202C] border border-[#242836] p-3.5 rounded-2xl shadow-sm">
        {/* Role Pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            type="button"
            onClick={() => setRoleFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border ${
              roleFilter === 'all'
                ? 'bg-[#25334D] text-[#93B4E6] border-[#3B5B8C]'
                : 'bg-[#161922] text-slate-400 border-[#242836] hover:text-white'
            }`}
          >
            Todos ({counts.total})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('bgp')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border flex items-center gap-1.5 ${
              roleFilter === 'bgp'
                ? 'bg-blue-950 border-blue-500 text-blue-300'
                : 'bg-[#161922] text-slate-400 border-[#242836] hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-blue-500"></span>
            <span>BGP ({counts.bgp})</span>
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('pe')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border flex items-center gap-1.5 ${
              roleFilter === 'pe'
                ? 'bg-purple-950 border-purple-500 text-purple-300'
                : 'bg-[#161922] text-slate-400 border-[#242836] hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-purple-500"></span>
            <span>PE ({counts.pe})</span>
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('sw')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border flex items-center gap-1.5 ${
              roleFilter === 'sw'
                ? 'bg-emerald-950 border-emerald-500 text-emerald-300'
                : 'bg-[#161922] text-slate-400 border-[#242836] hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>SW ({counts.sw})</span>
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('olt')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition cursor-pointer border flex items-center gap-1.5 ${
              roleFilter === 'olt'
                ? 'bg-amber-950 border-amber-500 text-amber-300'
                : 'bg-[#161922] text-slate-400 border-[#242836] hover:text-white'
            }`}
          >
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>OLT ({counts.olt})</span>
          </button>
        </div>

        {/* Right Search & Controls */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status selector */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="px-3 py-1.5 rounded-xl bg-[#161922] border border-[#242836] text-slate-300 text-xs font-medium focus:outline-none focus:border-[#3B5B8C] cursor-pointer"
          >
            <option value="all">Status: Todos</option>
            <option value="online">Apenas Online</option>
            <option value="offline">Apenas Offline</option>
          </select>

          {/* Search */}
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

          {/* Google Maps API Key Config Button */}
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

          {/* Reset Zoom */}
          <button
            type="button"
            onClick={handleResetView}
            className="px-3 py-1.5 rounded-xl bg-[#161922] hover:bg-[#202738] text-slate-300 hover:text-white border border-[#242836] text-xs font-medium transition cursor-pointer flex items-center gap-1.5"
            title="Ajustar visualização para enquadrar todos os equipamentos"
          >
            <Compass className="h-3.5 w-3.5 text-[#93B4E6]" />
            <span className="hidden sm:inline">Centralizar</span>
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
                  Clique em qualquer ponto do mapa para definir a posição de{' '}
                  <strong className="text-white bg-amber-900/80 px-1.5 py-0.5 rounded font-mono">
                    {devices.find((d) => d.id === placingDeviceId)?.name || 'equipamento'}
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
            Cancelar
          </button>
        </div>
      )}

      {/* Main Map Box & Lateral Overlay */}
      <div className={`relative rounded-2xl border border-[#242836] overflow-hidden bg-[#13151D] shadow-2xl h-[620px] sm:h-[680px] ${placingDeviceId ? 'cursor-crosshair [&_.leaflet-container]:!cursor-crosshair [&_.leaflet-grab]:!cursor-crosshair' : ''}`}>
        {/* Leaflet DOM container */}
        <div ref={mapContainerRef} className="w-full h-full z-0" />

        {/* Floating Unplaced Devices Drawer (if any devices lack coordinates) */}
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
                      {onEditDevice && (
                        <button
                          type="button"
                          onClick={() => onEditDevice(d)}
                          className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-[#252C3D] transition cursor-pointer"
                          title="Editar"
                        >
                          <Edit2 className="h-3 w-3" />
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Selected Device Popup Flyout */}
        {selectedDevice && (
          <div className="absolute bottom-4 left-4 right-4 sm:right-auto sm:max-w-md bg-[#1C202C] border border-[#3B5B8C] rounded-2xl p-4 shadow-2xl z-20 space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-150">
            <div className="flex items-start justify-between gap-3 border-b border-[#242836] pb-3">
              <div className="flex items-center gap-2.5">
                <div
                  className="h-10 w-10 rounded-xl flex items-center justify-center font-bold text-xs shrink-0"
                  style={{
                    backgroundColor: '#161922',
                    border: `2px solid ${
                      ROLE_CONFIG[selectedDevice.device_role || (selectedDevice.is_bgp ? 'bgp' : 'sw')].markerColor
                    }`,
                    color:
                      ROLE_CONFIG[selectedDevice.device_role || (selectedDevice.is_bgp ? 'bgp' : 'sw')].markerColor,
                  }}
                >
                  {ROLE_CONFIG[selectedDevice.device_role || (selectedDevice.is_bgp ? 'bgp' : 'sw')].icon}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="text-sm font-bold text-white leading-snug">{selectedDevice.name}</h4>
                    {isBGPMasterDevice(selectedDevice, devices) && (
                      <span className="flex items-center gap-1 text-[9px] bg-amber-500/20 text-amber-300 border border-amber-500/40 px-1.5 py-0.5 rounded-md font-bold">
                        <Crown className="h-2.5 w-2.5 text-amber-400" />
                        MASTER
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] font-mono text-slate-400">{selectedDevice.host}</span>
                    <span className="text-slate-600">&bull;</span>
                    <span
                      className={`text-[10px] font-semibold flex items-center gap-1 ${
                        selectedDevice.status === 'online' ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full ${
                          selectedDevice.status === 'online' ? 'bg-emerald-400' : 'bg-rose-500'
                        }`}
                      ></span>
                      {selectedDevice.status === 'online' ? 'Online' : 'Offline'}
                    </span>
                  </div>
                </div>
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
              {onSelectDeviceForTerminal && (
                <button
                  type="button"
                  onClick={() => onSelectDeviceForTerminal(selectedDevice)}
                  className="flex-1 py-1.5 px-2.5 rounded-xl bg-[#25334D] hover:bg-[#3B5B8C] text-slate-200 hover:text-white text-xs font-semibold border border-[#3B5B8C]/40 transition cursor-pointer flex items-center justify-center gap-1.5 min-w-[100px]"
                >
                  <Terminal className="h-3.5 w-3.5 text-[#93B4E6]" />
                  <span>Terminal</span>
                </button>
              )}

              {selectedDevice.is_bgp && onSelectDeviceForBGP && (
                <button
                  type="button"
                  onClick={() => onSelectDeviceForBGP(selectedDevice)}
                  className="flex-1 py-1.5 px-2.5 rounded-xl bg-blue-950/70 hover:bg-blue-900 text-blue-200 text-xs font-semibold border border-blue-500/40 transition cursor-pointer flex items-center justify-center gap-1.5 min-w-[90px]"
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
      </div>

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
                    className="w-full pl-3 pr-10 py-2 bg-[#13151D] border border-[#2D3345] rounded-xl text-xs text-slate-100 placeholder-slate-600 font-mono focus:outline-none focus:border-[#3B5B8C]"
                  />
                  <button
                    type="button"
                    onClick={() => setShowKeySecret(!showKeySecret)}
                    className="absolute right-2.5 top-2.5 text-slate-500 hover:text-slate-300 cursor-pointer"
                    title={showKeySecret ? 'Ocultar chave' : 'Mostrar chave'}
                  >
                    {showKeySecret ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  Alternativamente, você também pode definir no arquivo <code className="text-[#93B4E6] bg-[#161922] px-1 py-0.5 rounded">frontend/.env</code> como <code className="text-[#93B4E6] bg-[#161922] px-1 py-0.5 rounded">VITE_GOOGLE_MAPS_API_KEY=sua_chave</code>.
                </p>
              </div>

              {/* Quick instructions */}
              <div className="p-3 bg-[#161922]/70 border border-[#242836] rounded-xl space-y-1.5 text-[11px] text-slate-400">
                <span className="font-semibold text-slate-300 block">Como obter sua chave no Google Cloud Console:</span>
                <ol className="list-decimal list-inside space-y-1 text-slate-400">
                  <li>Acesse o <a href="https://console.cloud.google.com" target="_blank" rel="noreferrer" className="text-[#93B4E6] hover:underline inline-flex items-center gap-0.5">Google Cloud Console <ExternalLink className="h-2.5 w-2.5" /></a> e selecione seu projeto.</li>
                  <li>Em <strong>APIs & Services &gt; Library</strong>, ative a <strong>Maps JavaScript API</strong>.</li>
                  <li>Em <strong>Credentials</strong>, crie uma <strong>API Key</strong> e cole no campo acima.</li>
                </ol>
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
