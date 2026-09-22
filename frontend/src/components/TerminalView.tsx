import React, { useState, useEffect } from 'react'
import {
  Terminal as TerminalIcon,
  Play,
  RotateCcw,
  Copy,
  Check,
  Server,
  Sparkles
} from 'lucide-react'
import {
  fetchDevices,
  execDeviceCommand,
  type Device
} from '../services/api'

interface TerminalViewProps {
  initialDevice?: Device | null
}

const VENDOR_PRESETS: Record<string, { label: string; cmd: string }[]> = {
  huawei: [
    { label: 'Peers BGP', cmd: 'display bgp peer' },
    { label: 'Vizinhos OSPF', cmd: 'display ospf peer brief' },
    { label: 'Tabela de Rotas', cmd: 'display ip routing-table' },
    { label: 'Interfaces Resumo', cmd: 'display interface brief' },
    { label: 'Uso de CPU', cmd: 'display cpu-usage' },
    { label: 'Versão do Sistema', cmd: 'display version' },
  ],
  datacom: [
    { label: 'Resumo BGP', cmd: 'show ip bgp summary' },
    { label: 'Vizinhos OSPF', cmd: 'show ip ospf neighbor' },
    { label: 'Tabela de Rotas', cmd: 'show ip route' },
    { label: 'Interfaces Resumo', cmd: 'show interface brief' },
    { label: 'Recursos do Sistema', cmd: 'show system resources' },
    { label: 'Versão DmOS', cmd: 'show version' },
  ],
  mikrotik_v7: [
    { label: 'Sessões BGP (v7)', cmd: '/routing/bgp/session/print detail without-paging' },
    { label: 'Vizinhos OSPF (v7)', cmd: '/routing/ospf/neighbor/print detail without-paging' },
    { label: 'Rotas IP', cmd: '/ip/route/print without-paging' },
    { label: 'Interfaces', cmd: '/interface/print without-paging' },
    { label: 'Recursos de Hardware', cmd: '/system/resource/print' },
  ],
  mikrotik_v6: [
    { label: 'Peers BGP (v6)', cmd: '/routing bgp peer print status without-paging' },
    { label: 'Vizinhos OSPF (v6)', cmd: '/routing ospf neighbor print without-paging' },
    { label: 'Rotas IP', cmd: '/ip route print without-paging' },
    { label: 'Interfaces', cmd: '/interface print without-paging' },
    { label: 'Recursos de Hardware', cmd: '/system resource print' },
  ],
}

export const TerminalView: React.FC<TerminalViewProps> = ({ initialDevice }) => {
  const [devices, setDevices] = useState<Device[]>([])
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null)
  const [command, setCommand] = useState('')
  const [executing, setExecuting] = useState(false)
  const [consoleOutput, setConsoleOutput] = useState<string>('')
  const [copied, setCopied] = useState(false)
  const [lastDuration, setLastDuration] = useState<number | null>(null)

  useEffect(() => {
    fetchDevices().then((data) => {
      setDevices(data)
      if (initialDevice) {
        const found = data.find((d) => d.id === initialDevice.id)
        if (found) setSelectedDevice(found)
      } else if (data.length > 0 && !selectedDevice) {
        setSelectedDevice(data[0])
      }
    })
  }, [initialDevice])

  const handleRunCommand = async (cmdToRun?: string) => {
    const targetCmd = cmdToRun || command
    if (!selectedDevice || !targetCmd.trim()) return

    setExecuting(true)
    const timestamp = new Date().toLocaleTimeString()
    setConsoleOutput((prev) => `${prev ? prev + '\n\n' : ''}[${timestamp}] ${selectedDevice.name}# ${targetCmd}\nExecutando via SSH...`)

    try {
      const res = await execDeviceCommand(selectedDevice.id, targetCmd.trim())
      setLastDuration(res.duration_ms)
      setConsoleOutput((prev) => {
        // Replace the last executing notice with actual output
        const lines = prev.split('\n')
        lines.pop() // remove "Executando via SSH..."
        return lines.join('\n') + '\n' + (res.output || '(Comando executado sem retorno de texto)')
      })
    } catch (err: any) {
      setConsoleOutput((prev) => `${prev}\n[ERRO]: ${err.message || 'Falha na execução'}`)
    } finally {
      setExecuting(false)
    }
  }

  const handleCopy = () => {
    if (!consoleOutput) return
    navigator.clipboard.writeText(consoleOutput)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleClear = () => {
    setConsoleOutput('')
    setLastDuration(null)
  }

  const presets = selectedDevice ? VENDOR_PRESETS[selectedDevice.vendor] || [] : []

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <TerminalIcon className="h-5 w-5 text-cyan-400" />
            <span>Terminal e Console SSH Direto</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Execute comandos diagnósticos ad-hoc em tempo real com desativação de paginação automática
          </p>
        </div>

        {/* Device Picker */}
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Server className="h-4 w-4 text-slate-500" />
          <select
            value={selectedDevice?.id || ''}
            onChange={(e) => {
              const d = devices.find((dev) => dev.id === e.target.value) || null
              setSelectedDevice(d)
            }}
            className="w-full md:w-64 px-3.5 py-2 bg-slate-950/80 border border-slate-700 rounded-lg text-xs text-slate-100 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            {devices.length === 0 && <option value="">Nenhum equipamento cadastrado</option>}
            {devices.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} ({d.host} &bull; {d.vendor})
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Shortcuts bar */}
      {presets.length > 0 && (
        <div className="bg-slate-900/40 border border-slate-800/80 p-4 rounded-xl space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400">
            <Sparkles className="h-4 w-4" />
            <span>Atalhos rápidos para {selectedDevice?.vendor.toUpperCase()}:</span>
          </div>
          <div className="flex flex-wrap gap-2">
            {presets.map((p, i) => (
              <button
                key={i}
                disabled={executing}
                onClick={() => {
                  setCommand(p.cmd)
                  handleRunCommand(p.cmd)
                }}
                className="px-2.5 py-1 text-xs rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-cyan-300 border border-slate-700/60 transition-colors cursor-pointer disabled:opacity-50"
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Command Input Bar */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <div className="absolute left-3.5 top-2.5 font-mono text-cyan-500 font-bold text-xs select-none">
            {selectedDevice ? `${selectedDevice.name}#` : '>'}
          </div>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && !executing && handleRunCommand()}
            placeholder={
              selectedDevice
                ? `Digite um comando para enviar ao ${selectedDevice.name}... (Enter para enviar)`
                : 'Selecione um equipamento acima'
            }
            disabled={!selectedDevice || executing}
            className="w-full pl-36 pr-4 py-2.5 bg-slate-950/90 border border-slate-700 rounded-lg text-xs font-mono text-slate-100 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
          />
        </div>

        <button
          onClick={() => handleRunCommand()}
          disabled={!selectedDevice || !command.trim() || executing}
          className="px-5 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-lg text-xs flex items-center gap-2 shadow-md shadow-cyan-600/20 cursor-pointer disabled:opacity-50"
        >
          <Play className={`h-3.5 w-3.5 ${executing ? 'animate-spin' : ''}`} />
          <span>{executing ? 'Executando...' : 'Executar'}</span>
        </button>
      </div>

      {/* Terminal Output Window */}
      <div className="bg-slate-950 border border-slate-800 rounded-xl overflow-hidden shadow-2xl flex flex-col min-h-[420px]">
        {/* Terminal Header */}
        <div className="bg-slate-900 px-4 py-2.5 border-b border-slate-800 flex items-center justify-between text-xs">
          <div className="flex items-center gap-2">
            <div className="flex gap-1.5">
              <span className="h-3 w-3 rounded-full bg-rose-500/80 inline-block"></span>
              <span className="h-3 w-3 rounded-full bg-amber-500/80 inline-block"></span>
              <span className="h-3 w-3 rounded-full bg-emerald-500/80 inline-block"></span>
            </div>
            <span className="text-slate-400 font-mono ml-2">
              {selectedDevice ? `${selectedDevice.username}@${selectedDevice.host}:${selectedDevice.port}` : 'SSH Terminal'}
            </span>
          </div>

          <div className="flex items-center gap-3">
            {lastDuration !== null && (
              <span className="text-[11px] text-slate-500 font-mono">
                {lastDuration.toFixed(0)} ms
              </span>
            )}
            <button
              onClick={handleCopy}
              className="flex items-center gap-1 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title="Copiar terminal"
            >
              {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
              <span>{copied ? 'Copiado' : 'Copiar'}</span>
            </button>
            <button
              onClick={handleClear}
              className="flex items-center gap-1 text-slate-400 hover:text-rose-400 transition-colors cursor-pointer"
              title="Limpar console"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Limpar</span>
            </button>
          </div>
        </div>

        {/* Terminal Body */}
        <div className="p-4 flex-1 overflow-auto font-mono text-xs text-emerald-400 leading-relaxed bg-[#070b12] select-text">
          {consoleOutput ? (
            <pre className="whitespace-pre-wrap">{consoleOutput}</pre>
          ) : (
            <div className="text-slate-600 italic select-none">
              Console pronto. Escolha um atalho acima ou digite um comando manual para executar via SSH no equipamento.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
