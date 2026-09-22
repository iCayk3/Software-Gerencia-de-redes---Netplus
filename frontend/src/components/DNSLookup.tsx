import React, { useState } from 'react'
import { Globe, Search, Copy, Check, Mail, FileText, Server } from 'lucide-react'
import { lookupDNS, type DNSLookupResponse } from '../services/api'

export const DNSLookup: React.FC = () => {
  const [domain, setDomain] = useState('github.com')
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<DNSLookupResponse | null>(null)
  const [copiedText, setCopiedText] = useState<string | null>(null)

  const handleLookup = async () => {
    if (!domain.trim()) return
    setLoading(true)
    try {
      const res = await lookupDNS(domain.trim())
      setResult(res)
    } catch (err: any) {
      setResult({
        domain,
        ips: null,
        error: err.message || 'Erro ao consultar DNS',
      })
    } finally {
      setLoading(false)
    }
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopiedText(text)
    setTimeout(() => setCopiedText(null), 1800)
  }

  return (
    <div className="space-y-6">
      {/* Search Input Box */}
      <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-6 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2 text-cyan-400 font-semibold">
            <Globe className="h-5 w-5" />
            <span>Consulta e Resolução de Nomes DNS</span>
          </div>
          <span className="text-xs text-slate-400">Registros A, AAAA, CNAME, MX e TXT</span>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLookup()}
            placeholder="ex: github.com ou google.com"
            className="flex-1 px-3.5 py-2.5 bg-slate-950/70 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:border-cyan-500 text-sm"
          />
          <button
            onClick={handleLookup}
            disabled={loading}
            className="flex items-center justify-center gap-2 px-6 py-2.5 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-medium rounded-lg shadow-md shadow-cyan-600/20 text-sm transition-all cursor-pointer disabled:opacity-50"
          >
            <Search className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            <span>{loading ? 'Consultando...' : 'Resolver DNS'}</span>
          </button>
        </div>
      </div>

      {/* Results View */}
      {result && (
        <div className="space-y-4">
          {result.error ? (
            <div className="p-4 rounded-xl bg-rose-950/30 border border-rose-800 text-rose-300 text-sm">
              {result.error}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* IP Addresses (A / AAAA) */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 shadow-md">
                <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300 mb-3">
                  <Server className="h-4 w-4 text-cyan-400" />
                  <span>Endereços IP Resolvidos (A / AAAA)</span>
                </div>
                {result.ips && result.ips.length > 0 ? (
                  <div className="space-y-1.5">
                    {result.ips.map((ip, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between font-mono text-xs bg-slate-950/60 px-3 py-2 rounded-lg border border-slate-800"
                      >
                        <span className="text-slate-200">{ip}</span>
                        <button
                          onClick={() => copyToClipboard(ip)}
                          className="text-slate-400 hover:text-cyan-400 cursor-pointer transition-colors"
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
                  <span className="text-xs text-slate-500 italic">Nenhum IP encontrado.</span>
                )}
              </div>

              {/* CNAME */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 shadow-md">
                <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300 mb-3">
                  <Globe className="h-4 w-4 text-cyan-400" />
                  <span>Apelido Canônico (CNAME)</span>
                </div>
                {result.cname ? (
                  <div className="font-mono text-xs bg-slate-950/60 px-3 py-2 rounded-lg border border-slate-800 text-slate-200 break-all">
                    {result.cname}
                  </div>
                ) : (
                  <span className="text-xs text-slate-500 italic">
                    Nenhum registro CNAME direto (o domínio é root/apex).
                  </span>
                )}
              </div>

              {/* MX Records */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 shadow-md">
                <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300 mb-3">
                  <Mail className="h-4 w-4 text-cyan-400" />
                  <span>Servidores de Email (MX)</span>
                </div>
                {result.mx && result.mx.length > 0 ? (
                  <div className="space-y-1.5">
                    {result.mx.map((mx, i) => (
                      <div
                        key={i}
                        className="font-mono text-xs bg-slate-950/60 px-3 py-2 rounded-lg border border-slate-800 text-slate-300"
                      >
                        {mx}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-slate-500 italic">Nenhum registro MX configurado.</span>
                )}
              </div>

              {/* TXT Records */}
              <div className="bg-slate-900/40 border border-slate-800 rounded-xl p-5 shadow-md">
                <div className="flex items-center gap-2 text-sm font-semibold text-cyan-300 mb-3">
                  <FileText className="h-4 w-4 text-cyan-400" />
                  <span>Registros TXT</span>
                </div>
                {result.txt && result.txt.length > 0 ? (
                  <div className="space-y-1.5 max-h-48 overflow-y-auto">
                    {result.txt.map((txt, i) => (
                      <div
                        key={i}
                        className="font-mono text-[11px] bg-slate-950/60 px-3 py-2 rounded-lg border border-slate-800 text-slate-300 break-all"
                      >
                        {txt}
                      </div>
                    ))}
                  </div>
                ) : (
                  <span className="text-xs text-slate-500 italic">Nenhum registro TXT configurado.</span>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
