import { useState, useEffect, useCallback, Suspense, lazy } from 'react'
import { Sidebar, type MainSectionType } from './components/Sidebar'
import { TopNav } from './components/TopNav'
import { CommandPalette } from './components/CommandPalette'
import { LoginPage } from './components/LoginPage'
import { AuthProvider, useAuth } from './context/AuthContext'
import { fetchHealth, fetchAlerts, fetchDevices, type HealthResponse, type Device } from './services/api'
import { ShieldCheck, Terminal, Network, Loader2 } from 'lucide-react'

// Dynamic Code-Splitting via React.lazy:
const TrafficManager = lazy(() => import('./components/TrafficManager').then(m => ({ default: m.TrafficManager })))
const DeviceManager = lazy(() => import('./components/DeviceManager').then(m => ({ default: m.DeviceManager })))
const TelemetryView = lazy(() => import('./components/TelemetryView').then(m => ({ default: m.TelemetryView })))
const BGPManager = lazy(() => import('./components/BGPManager').then(m => ({ default: m.BGPManager })))
const BGPChurnView = lazy(() => import('./components/telemetry/BGPChurnView').then(m => ({ default: m.BGPChurnView })))
const RPKIValidatorView = lazy(() => import('./components/telemetry/RPKIValidatorView').then(m => ({ default: m.RPKIValidatorView })))
const OSPFManager = lazy(() => import('./components/OSPFManager').then(m => ({ default: m.OSPFManager })))
const TerminalView = lazy(() => import('./components/TerminalView').then(m => ({ default: m.TerminalView })))
const DiagnosticsView = lazy(() => import('./components/DiagnosticsView').then(m => ({ default: m.DiagnosticsView })))
const AuditView = lazy(() => import('./components/AuditView').then(m => ({ default: m.AuditView })))
const TenantManager = lazy(() => import('./components/TenantManager').then(m => ({ default: m.TenantManager })))
const UserManager = lazy(() => import('./components/UserManager').then(m => ({ default: m.UserManager })))
const LicenseView = lazy(() => import('./components/LicenseView').then(m => ({ default: m.LicenseView })))

function ViewLoader() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[350px] text-slate-400 space-y-3 animate-in fade-in duration-150">
      <div className="w-10 h-10 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
        <Loader2 className="w-5 h-5 text-cyan-400 animate-spin" />
      </div>
      <p className="text-xs text-slate-400 font-mono tracking-wide">Carregando módulo NetPulse...</p>
    </div>
  )
}

function AppContent() {
  const { user, token, activeTenantId, loading: authLoading } = useAuth()

  // Navigation State: Seção Lateral e Sub-Aba Superior
  const [activeSection, setActiveSection] = useState<MainSectionType>('bgp')
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

  // Sincroniza o título da aba do navegador com a seção ativa
  useEffect(() => {
    const sectionNames: Record<string, string> = {
      bgp: 'BGP & Engenharia de Tráfego',
      ospf: 'Protocolo OSPF',
      devices: 'Equipamentos & Borda',
      telemetry: 'NOC & Telemetria',
      diagnostics: 'Ferramentas de Rede',
      audit: 'Trilha de Auditoria',
      tenants: 'Configurações da Empresa',
      users: 'Usuários & Permissões',
      license: 'Licença & Sistema',
      traffic: 'Engenharia de Tráfego',
    }
    const label = sectionNames[activeSection] || 'Plataforma'
    const alertPrefix = activeAlertsCount > 0 ? `(${activeAlertsCount}) ` : ''
    document.title = `${alertPrefix}NetPulse • ${label}`
  }, [activeSection, activeAlertsCount])

  const checkHealthAndAlerts = useCallback(async () => {
    try {
      const [healthData, alertsData, devicesData] = await Promise.all([
        fetchHealth(),
        fetchAlerts('active').catch(() => []),
        fetchDevices().catch(() => [])
      ])
      setHealth((prev) => (prev?.status === healthData.status && prev?.uptime === healthData.uptime ? prev : healthData))
      setActiveAlertsCount((prev) => (prev === alertsData.length ? prev : alertsData.length))
      if (devicesData && devicesData.length > 0) {
        setDevicesList((prev) => {
          if (prev.length === devicesData.length && prev.every((d, i) => d.id === devicesData[i]?.id && d.status === devicesData[i]?.status)) {
            return prev
          }
          return devicesData
        })
      }
    } catch {
      setHealth(null)
    } finally {
      setLoadingHealth(false)
    }
  }, [])

  useEffect(() => {
    if (!token) return
    checkHealthAndAlerts()
    const timer = setInterval(checkHealthAndAlerts, 15000)
    return () => clearInterval(timer)
  }, [checkHealthAndAlerts, activeTenantId, token])

  // Troca de Seção Lateral com definição inteligente da sub-aba padrão
  const handleSectionChange = (section: MainSectionType, subTab?: string) => {
    setActiveSection(section)
    if (subTab) {
      setActiveSubTab(subTab)
      return
    }
    switch (section) {
      case 'bgp':
      case 'traffic':
        setActiveSubTab('download')
        break
      case 'ospf':
        setActiveSubTab('neighbors')
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
      case 'audit':
        setActiveSubTab('logs')
        break
      case 'tenants':
        setActiveSubTab('list')
        break
      case 'users':
        setActiveSubTab('list')
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
    setActiveSection('bgp')
    setActiveSubTab('sessions')
  }

  const handleOpenAlerts = () => {
    setActiveSection('telemetry')
    setActiveSubTab('alerts')
  }

  // Se estiver carregando verificação de autenticação
  if (authLoading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-400 gap-3 selection:bg-cyan-500 selection:text-white">
        <div className="h-12 w-12 rounded-2xl bg-gradient-to-tr from-cyan-500 via-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-xl shadow-cyan-500/20 animate-pulse">
          <Network className="h-6 w-6" />
        </div>
        <div className="flex items-center gap-2 text-xs font-medium text-slate-300">
          <div className="h-3.5 w-3.5 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
          <span>Verificando sessão corporativa...</span>
        </div>
      </div>
    )
  }

  // Se não autenticado, renderizar tela de login B2B
  if (!token || !user) {
    return <LoginPage />
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
                  Certifique-se de executar o backend em Go (<code className="bg-slate-900 px-1.5 py-0.5 rounded text-white font-mono">go run ./cmd/api</code>) ou os contêineres Docker (<code className="bg-slate-900 px-1.5 py-0.5 rounded text-white font-mono">docker compose up -d</code>).
                </p>
              </div>
            </div>
          )}

          <Suspense fallback={<ViewLoader />}>
            {/* ================= SEÇÃO 1: PROTOCOLO BGP & ENGENHARIA DE TRÁFEGO ================= */}
            {(activeSection === 'bgp' || activeSection === 'traffic') && (
              <>
                {activeSubTab === 'download' && (
                  <TrafficManager activeSubTab="download" hideInternalSubTabs={true} density={density} />
                )}
                {activeSubTab === 'upload' && (
                  <TrafficManager activeSubTab="upload" hideInternalSubTabs={true} density={density} />
                )}
                {(activeSubTab === 'sessions' || activeSubTab === 'bgp') && <BGPManager />}
                {activeSubTab === 'churn' && <BGPChurnView density={density} />}
                {activeSubTab === 'rpki' && <RPKIValidatorView density={density} />}
              </>
            )}

            {/* ================= SEÇÃO 2: PROTOCOLO OSPF & TOPOLOGIA INTERNA ================= */}
            {activeSection === 'ospf' && (
              <OSPFManager
                activeSubTab={activeSubTab as any}
                onSelectSubTab={(tab) => setActiveSubTab(tab)}
                density={density}
              />
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
                activeSubTab={activeSubTab as 'overview' | 'alerts' | 'churn' | 'rpki'}
                onSelectSubTab={(tab) => setActiveSubTab(tab)}
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

            {/* ================= SEÇÃO 5: TRILHA DE AUDITORIA (AUDIT TRAIL) ================= */}
            {activeSection === 'audit' && (
              <AuditView density={density} />
            )}

            {/* ================= SEÇÃO 6: EMPRESAS CLIENTES (MULTI-TENANCY) ================= */}
            {activeSection === 'tenants' && (
              <TenantManager />
            )}

            {/* ================= SEÇÃO 7: GESTÃO DE USUÁRIOS (RBAC) ================= */}
            {activeSection === 'users' && (
              <UserManager />
            )}

            {/* ================= SEÇÃO 8: LICENÇA & SERVIDOR MASTER ================= */}
            {activeSection === 'license' && (
              <LicenseView />
            )}
          </Suspense>
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
      {isCommandPaletteOpen && (
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          onClose={() => setIsCommandPaletteOpen(false)}
          onNavigate={handleSectionChange}
          onSelectDeviceForTerminal={handleSelectDeviceForTerminal}
          devices={devicesList}
          currentDensity={density}
          onToggleDensity={handleToggleDensity}
        />
      )}
    </div>
  )
}

export function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  )
}

export default App

