import { useState, useEffect, useCallback } from 'react'
import { Sidebar, type MainSectionType } from './components/Sidebar'
import { TopNav } from './components/TopNav'
import { DeviceManager } from './components/DeviceManager'
import { TelemetryView } from './components/TelemetryView'
import { BGPManager } from './components/BGPManager'
import { OSPFManager } from './components/OSPFManager'
import { TerminalView } from './components/TerminalView'
import { DiagnosticsView } from './components/DiagnosticsView'
import { TrafficManager } from './components/TrafficManager'
import { CommandPalette } from './components/CommandPalette'
import { fetchHealth, fetchAlerts, fetchDevices, type HealthResponse, type Device } from './services/api'
import { ShieldCheck, Terminal, Network } from 'lucide-react'

export function App() {
  // Navigation State: Seção Lateral e Sub-Aba Superior
  const [activeSection, setActiveSection] = useState<MainSectionType>('traffic')
  const [activeSubTab, setActiveSubTab] = useState<string>('download')
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(false)
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false)

  // Health & Alert State
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loadingHealth, setLoadingHealth] = useState(true)
  const [targetTerminalDevice, setTargetTerminalDevice] = useState<Device | null>(null)
  const [activeAlertsCount, setActiveAlertsCount] = useState<number>(0)
  const [devicesList, setDevicesList] = useState<Device[]>([])
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false)

  // Densidade de interface persistida no LocalStorage
  const [density, setDensity] = useState<'comfortable' | 'compact'>(() => {
    return (localStorage.getItem('netpulse_density') as 'comfortable' | 'compact') || 'comfortable'
  })

  const handleToggleDensity = () => {
    setDensity((prev) => {
      const next = prev === 'comfortable' ? 'compact' : 'comfortable'
      localStorage.setItem('netpulse_density', next)
      return next
    })
  }

  // Atalho Global Ctrl + K / Cmd + K
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault()
        setIsCommandPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const checkHealthAndAlerts = useCallback(async () => {
    try {
      const [healthData, alertsData, devicesData] = await Promise.all([
        fetchHealth(),
        fetchAlerts('active').catch(() => []),
        fetchDevices().catch(() => [])
      ])
      setHealth(healthData)
      setActiveAlertsCount(alertsData.length)
      if (devicesData && devicesData.length > 0) {
        setDevicesList(devicesData)
      }
    } catch {
      setHealth(null)
    } finally {
      setLoadingHealth(false)
    }
  }, [])

  useEffect(() => {
    checkHealthAndAlerts()
    const timer = setInterval(checkHealthAndAlerts, 10000)
    return () => clearInterval(timer)
  }, [checkHealthAndAlerts])

  // Troca de Seção Lateral com definição inteligente da sub-aba padrão
  const handleSectionChange = (section: MainSectionType, subTab?: string) => {
    setActiveSection(section)
    if (subTab) {
      setActiveSubTab(subTab)
      return
    }
    switch (section) {
      case 'traffic':
        setActiveSubTab('download')
        break
      case 'devices':
        setActiveSubTab('inventory')
        break
      case 'telemetry':
        setActiveSubTab('overview')
        break
      case 'diagnostics':
        setActiveSubTab('ping')
        break
    }
  }

  // Ações de atalho a partir de outros componentes
  const handleSelectDeviceForTerminal = (dev: Device) => {
    setTargetTerminalDevice(dev)
    setActiveSection('devices')
    setActiveSubTab('terminal')
  }

  const handleSelectDeviceForBGP = () => {
    setActiveSection('traffic')
    setActiveSubTab('bgp')
  }

  const handleOpenAlerts = () => {
    setActiveSection('telemetry')
    setActiveSubTab('alerts')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex font-sans selection:bg-cyan-500 selection:text-white">
      {/* 1. Menu Lateral (Sidebar) */}
      <Sidebar
        activeSection={activeSection}
        onSelectSection={handleSectionChange}
        activeAlertsCount={activeAlertsCount}
        isCollapsed={isSidebarCollapsed}
        onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
        isMobileOpen={isMobileSidebarOpen}
        onCloseMobile={() => setIsMobileSidebarOpen(false)}
        health={health}
        loadingHealth={loadingHealth}
      />

      {/* 2. Área Principal de Trabalho */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* TopNav com Sub-abas contextuais da seção */}
        <TopNav
          activeSection={activeSection}
          activeSubTab={activeSubTab}
          onSelectSubTab={setActiveSubTab}
          activeAlertsCount={activeAlertsCount}
          health={health}
          onOpenMobileSidebar={() => setIsMobileSidebarOpen(true)}
          onOpenAlerts={handleOpenAlerts}
          onOpenSearch={() => setIsCommandPaletteOpen(true)}
          density={density}
          onToggleDensity={handleToggleDensity}
        />

        {/* Conteúdo Dinâmico */}
        <main className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-6">
          {/* Offline Warning Banner */}
          {!loadingHealth && !health && (
            <div className="mb-6 p-4 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-300 flex items-start gap-3 shadow-lg animate-in fade-in">
              <Terminal className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
              <div>
                <p className="font-semibold text-sm">Servidor backend não detectado em http://localhost:8080</p>
                <p className="text-xs text-amber-200/80 mt-1">
                  Certifique-se de executar o backend em Go (<code className="bg-slate-900 px-1.5 py-0.5 rounded text-white font-mono">go run ./cmd/api</code>) ou o modo de simulação Node.js (<code className="bg-slate-900 px-1.5 py-0.5 rounded text-white font-mono">node mock-server.cjs</code>).
                </p>
              </div>
            </div>
          )}

          {/* ================= SEÇÃO 1: ENGENHARIA DE TRÁFEGO & BGP ================= */}
          {activeSection === 'traffic' && (
            <>
              {activeSubTab === 'download' && (
                <TrafficManager activeSubTab="download" hideInternalSubTabs={true} density={density} />
              )}
              {activeSubTab === 'upload' && (
                <TrafficManager activeSubTab="upload" hideInternalSubTabs={true} density={density} />
              )}
              {activeSubTab === 'bgp' && <BGPManager />}
              {activeSubTab === 'ospf' && <OSPFManager />}
            </>
          )}

          {/* ================= SEÇÃO 2: EQUIPAMENTOS & INFRAESTRUTURA ================= */}
          {activeSection === 'devices' && (
            <>
              {activeSubTab === 'inventory' && (
                <DeviceManager
                  onSelectDeviceForTerminal={handleSelectDeviceForTerminal}
                  onSelectDeviceForBGP={handleSelectDeviceForBGP}
                  density={density}
                />
              )}
              {activeSubTab === 'terminal' && (
                <TerminalView initialDevice={targetTerminalDevice} />
              )}
            </>
          )}

          {/* ================= SEÇÃO 3: NOC & TELEMETRIA ================= */}
          {activeSection === 'telemetry' && (
            <TelemetryView
              onAlertsUpdated={(cnt) => setActiveAlertsCount(cnt)}
              activeSubTab={activeSubTab as 'overview' | 'alerts'}
            />
          )}

          {/* ================= SEÇÃO 4: FERRAMENTAS DE REDE & DIAGNÓSTICOS ================= */}
          {activeSection === 'diagnostics' && (
            <DiagnosticsView
              activeSubTab={activeSubTab as any}
              onSubTabChange={(t) => setActiveSubTab(t)}
              hideInternalTabs={true}
            />
          )}
        </main>

        {/* Rodapé Compacto */}
        <footer className="border-t border-slate-900 bg-slate-950/90 py-4 px-4 sm:px-6 lg:px-8 text-xs text-slate-500 shrink-0">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Network className="h-4 w-4 text-cyan-500" />
              <span>NetPulse Enterprise &bull; Plataforma de Tráfego, BGP & OSPF</span>
            </div>
            <div className="flex items-center gap-3 text-slate-400 text-[11px]">
              <span className="flex items-center gap-1">
                <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
                Modo Manual Seguro Ativo (Zero Commits Automáticos)
              </span>
              <span>&bull;</span>
              <span>Huawei &bull; Datacom DmOS &bull; MikroTik</span>
            </div>
          </div>
        </footer>
      </div>

      {/* 3. Command Palette Global (Ctrl + K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        onNavigate={handleSectionChange}
        onSelectDeviceForTerminal={handleSelectDeviceForTerminal}
        devices={devicesList}
        currentDensity={density}
        onToggleDensity={handleToggleDensity}
      />
    </div>
  )
}

export default App
