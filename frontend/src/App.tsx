import { useState, useEffect, useCallback } from 'react'
import { Header, type TabType } from './components/Header'
import { DeviceManager } from './components/DeviceManager'
import { TelemetryView } from './components/TelemetryView'
import { BGPManager } from './components/BGPManager'
import { OSPFManager } from './components/OSPFManager'
import { TerminalView } from './components/TerminalView'
import { DiagnosticsView } from './components/DiagnosticsView'
import { TrafficManager } from './components/TrafficManager'
import { fetchHealth, fetchAlerts, type HealthResponse, type Device } from './services/api'
import { ShieldCheck, Terminal, Network } from 'lucide-react'

export function App() {
  const [activeTab, setActiveTab] = useState<TabType>('devices')
  const [health, setHealth] = useState<HealthResponse | null>(null)
  const [loadingHealth, setLoadingHealth] = useState(true)
  const [targetTerminalDevice, setTargetTerminalDevice] = useState<Device | null>(null)
  const [activeAlertsCount, setActiveAlertsCount] = useState<number>(0)

  const checkHealthAndAlerts = useCallback(async () => {
    try {
      const [healthData, alertsData] = await Promise.all([
        fetchHealth(),
        fetchAlerts('active').catch(() => [])
      ])
      setHealth(healthData)
      setActiveAlertsCount(alertsData.length)
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

  const handleSelectDeviceForTerminal = (dev: Device) => {
    setTargetTerminalDevice(dev)
    setActiveTab('terminal')
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-cyan-500 selection:text-white">
      {/* Header */}
      <Header
        health={health}
        loadingHealth={loadingHealth}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        activeAlertsCount={activeAlertsCount}
      />

      {/* Main Content Area */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Offline Warning Banner */}
        {!loadingHealth && !health && (
          <div className="mb-6 p-4 rounded-xl bg-amber-950/40 border border-amber-800/80 text-amber-300 flex items-start gap-3 shadow-lg">
            <Terminal className="h-5 w-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <p className="font-semibold text-sm">Servidor backend em Go não detectado em http://localhost:8080</p>
              <p className="text-xs text-amber-200/80 mt-1">
                Para iniciar o backend, execute o comando no diretório <code className="bg-amber-900/40 px-1 py-0.5 rounded">backend</code>:{' '}
                <code className="bg-slate-900 px-2 py-0.5 rounded text-white font-mono">go run ./cmd/api</code>
              </p>
            </div>
          </div>
        )}

        {/* View Switcher */}
        {activeTab === 'devices' && (
          <DeviceManager onSelectDeviceForTerminal={handleSelectDeviceForTerminal} />
        )}
        {activeTab === 'telemetry' && (
          <TelemetryView onAlertsUpdated={(cnt) => setActiveAlertsCount(cnt)} />
        )}
        {activeTab === 'traffic' && <TrafficManager />}
        {activeTab === 'bgp' && <BGPManager />}
        {activeTab === 'ospf' && <OSPFManager />}
        {activeTab === 'terminal' && <TerminalView initialDevice={targetTerminalDevice} />}
        {activeTab === 'diagnostics' && <DiagnosticsView />}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-900 bg-slate-950/80 py-6 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Network className="h-4 w-4 text-cyan-500" />
            <span>NetPulse &bull; Telemetria, BGP & OSPF (Huawei, Datacom DmOS, MikroTik v6/v7)</span>
          </div>
          <div className="flex items-center gap-4 text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-400" />
              SSH & Telemetry Engine (Go 1.27)
            </span>
            <span>&bull;</span>
            <span>React 19 + TypeScript + Tailwind CSS</span>
          </div>
        </div>
      </footer>
    </div>
  )
}

export default App
