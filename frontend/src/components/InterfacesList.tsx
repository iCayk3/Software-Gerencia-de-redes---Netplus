import React, { useEffect, useState } from 'react'
import { Wifi, RefreshCw, Copy, Check, Shield, Globe } from 'lucide-react'
import { fetchInterfaces, type NetworkInterface } from '../services/api'

export const InterfacesList: React.FC = () => {
  const [interfaces, setInterfaces] = useState<NetworkInterface[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [copiedText, setCopiedText] = useState<string | null>(null)

  const loadData = async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchInterfaces()
      setInterfaces(data || [])
    } catch (err: any) {
      setError(err.message || 'Erro ao carregar interfaces de rede')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
  }, [])

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedText(text)
    setTimeout(() => setCopiedText(null), 1800)
  }

  const filtered = interfaces.filter((iface) => {
    const q = search.toLowerCase()
    return (
      iface.name.toLowerCase().includes(q) ||
      iface.hardware_addr.toLowerCase().includes(q) ||
      iface.ip_addresses?.some((ip) => ip.toLowerCase().includes(q))
    )
  })

  return (
    <div className="space-y-6">
      {/* Header with Search and Refresh */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <Wifi className="h-5 w-5 text-cyan-400" />
            <span>Adaptadores de Rede Locais</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            Interfaces físicas e virtuais detectadas no sistema operacional
          </p>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <input
            type="text"
            placeholder="Filtrar por nome, IP ou MAC..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="px-3.5 py-2 bg-slate-950/70 border border-slate-700 rounded-lg text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 w-full md:w-64"
          />
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-lg text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-lg bg-rose-950/30 border border-rose-800 text-rose-300 text-sm">
          {error}
        </div>
      )}

      {/* Grid of Interfaces */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filtered.map((iface) => (
          <div
            key={iface.index}
            className="bg-slate-900/40 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition-all shadow-md flex flex-col justify-between"
          >
            <div>
              {/* Header card */}
              <div className="flex items-center justify-between gap-2 mb-3">
                <span className="font-semibold text-slate-100 text-sm truncate" title={iface.name}>
                  {iface.name}
                </span>
                <div className="flex items-center gap-1.5">
                  {iface.is_loopback && (
                    <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                      Loopback
                    </span>
                  )}
                  <span
                    className={`text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full ${
                      iface.is_up
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-slate-800 text-slate-500 border border-slate-700'
                    }`}
                  >
                    {iface.is_up ? 'UP' : 'DOWN'}
                  </span>
                </div>
              </div>

              {/* MAC Address */}
              <div className="mb-3 text-xs">
                <span className="text-slate-400 block text-[11px]">Endereço Físico (MAC):</span>
                <div className="flex items-center justify-between font-mono bg-slate-950/60 px-2.5 py-1.5 rounded mt-1 border border-slate-800/80">
                  <span className="text-slate-300 truncate">
                    {iface.hardware_addr || 'Sem MAC (Lógico)'}
                  </span>
                  {iface.hardware_addr && (
                    <button
                      onClick={() => copyToClipboard(iface.hardware_addr)}
                      className="text-slate-400 hover:text-cyan-400 cursor-pointer transition-colors ml-2"
                      title="Copiar MAC"
                    >
                      {copiedText === iface.hardware_addr ? (
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="h-3.5 w-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* IP Addresses */}
              <div className="space-y-1.5 mb-3">
                <span className="text-slate-400 block text-[11px]">Endereços IP:</span>
                {iface.ip_addresses && iface.ip_addresses.length > 0 ? (
                  <div className="space-y-1">
                    {iface.ip_addresses.map((ip, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between font-mono text-xs bg-slate-950/40 px-2.5 py-1 rounded border border-slate-800/60"
                      >
                        <span className="text-cyan-300 truncate">{ip}</span>
                        <button
                          onClick={() => copyToClipboard(ip)}
                          className="text-slate-400 hover:text-cyan-400 cursor-pointer transition-colors ml-2"
                          title="Copiar IP"
                        >
                          {copiedText === ip ? (
                            <Check className="h-3.5 w-3.5 text-emerald-400" />
                          ) : (
                            <Copy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-slate-500 italic">Nenhum IP atribuído</div>
                )}
              </div>
            </div>

            {/* Footer / MTU & Flags */}
            <div className="pt-3 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1">
                <Shield className="h-3 w-3 text-slate-500" />
                MTU: {iface.mtu}
              </span>
              <span className="flex items-center gap-1 truncate max-w-[150px]" title={iface.flags.join(', ')}>
                <Globe className="h-3 w-3 text-slate-500" />
                {iface.flags.join(', ')}
              </span>
            </div>
          </div>
        ))}

        {!loading && filtered.length === 0 && (
          <div className="col-span-full p-8 text-center text-slate-500 text-sm">
            Nenhuma interface de rede encontrada para o filtro informado.
          </div>
        )}
      </div>
    </div>
  )
}
