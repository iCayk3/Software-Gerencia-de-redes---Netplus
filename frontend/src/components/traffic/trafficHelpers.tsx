import { Network, Globe, Zap } from 'lucide-react'
import type {
  Device,
  StaticRoute,
  BGPASSection,
  ASMetadata,
  ProfileTag,
  ASPrependGroup,
  PrefixPrependState
} from '../../services/api'

export const cidrToNetmask = (prefix: number): string => {
  if (prefix <= 0) return '0.0.0.0'
  if (prefix >= 32) return '255.255.255.255'
  const mask = (0xffffffff << (32 - prefix)) >>> 0
  return [
    (mask >>> 24) & 255,
    (mask >>> 16) & 255,
    (mask >>> 8) & 255,
    mask & 255,
  ].join('.')
}

export const getProfileTagBadge = (tag: ProfileTag) => {
  switch (tag) {
    case 'normal':
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800">
          Nominal
        </span>
      )
    case 'contingency':
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800">
          Contingência
        </span>
      )
    case 'maintenance':
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800">
          Manutenção
        </span>
      )
    case 'peak':
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-950/80 text-purple-300 border border-purple-800">
          Pico / ECMP
        </span>
      )
    default:
      return (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800">
          Custom
        </span>
      )
  }
}

export const formatProfileTag = (tag: ProfileTag) => {
  switch (tag) {
    case 'normal': return 'Operação Nominal'
    case 'contingency': return 'Contingência'
    case 'maintenance': return 'Manutenção'
    case 'peak': return 'Pico / ECMP'
    default: return 'Personalizado'
  }
}

export const renderGroupRoleBadge = (role: string) => {
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

export const getRoleBadge = (role?: string) => {
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

export const renderASLogo = (meta: ASMetadata, peerName: string) => {
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

export const copyToClipboard = (text: string, onCopied?: () => void) => {
  if (!text) return

  // Modern async clipboard API: zero UI blocking, zero layout jumps
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        if (onCopied) onCopied()
      })
      .catch(() => {
        fallbackCopy(text, onCopied)
      })
    return
  }

  fallbackCopy(text, onCopied)
}

function fallbackCopy(text: string, onCopied?: () => void) {
  try {
    const el = document.createElement('textarea')
    el.value = text
    el.setAttribute('readonly', '')
    el.style.position = 'fixed'
    el.style.top = '0'
    el.style.left = '0'
    el.style.width = '1px'
    el.style.height = '1px'
    el.style.opacity = '0'
    document.body.appendChild(el)
    el.select()
    document.execCommand('copy')
    document.body.removeChild(el)
  } catch {
    // Ignore error
  }
  if (onCopied) {
    onCopied()
  }
}

// CLI Preview Generators
export const getStaticRouteCliPreview = (
  devices: Device[],
  formDevice: string,
  formDest: string,
  formNextHop: string,
  formPref: string,
  formDesc: string
) => {
  const dev = devices.find(d => d.id === formDevice)
  const vendor = (dev?.vendor || 'huawei').toLowerCase()
  const devName = dev?.name || 'Roteador'
  const devHost = dev?.host || ''
  const dest = formDest.trim() || '0.0.0.0/0'
  const gateway = formNextHop.trim() || '<gateway>'
  const pref = parseInt(formPref, 10) || 60
  const desc = formDesc.trim()

  if (vendor === 'huawei') {
    let ip = dest
    let mask = '255.255.255.255'
    if (dest.includes('/')) {
      const parts = dest.split('/')
      ip = parts[0]
      if (parts[1] === '0') {
        ip = '0.0.0.0'
        mask = '0.0.0.0'
      } else {
        const cidr = parseInt(parts[1], 10)
        if (!isNaN(cidr) && cidr >= 0 && cidr <= 32) {
          mask = cidrToNetmask(cidr)
        }
      }
    }
    let cmd = `ip route-static ${ip} ${mask} ${gateway}`
    if (pref > 0) cmd += ` preference ${pref}`
    if (desc) cmd += ` description ${desc}`

    return [
      `# [${devName}] ${devHost} (Huawei VRP)`,
      'system-view',
      cmd,
      'commit',
      'return',
    ].join('\n')
  } else if (vendor === 'mikrotik_v7') {
    let cmd = `/ip/route/add dst-address=${dest} gateway=${gateway}`
    if (pref > 0) cmd += ` distance=${pref}`
    if (desc) cmd += ` comment="${desc}"`
    return [
      `# [${devName}] ${devHost} (MikroTik RouterOS v7)`,
      cmd,
    ].join('\n')
  } else if (vendor === 'mikrotik_v6' || vendor.startsWith('mikrotik')) {
    let cmd = `/ip route add dst-address=${dest} gateway=${gateway}`
    if (pref > 0) cmd += ` distance=${pref}`
    if (desc) cmd += ` comment="${desc}"`
    return [
      `# [${devName}] ${devHost} (MikroTik RouterOS v6)`,
      cmd,
    ].join('\n')
  } else if (vendor === 'datacom') {
    let cmd = `ip route ${dest} ${gateway}`
    if (pref > 0) cmd += ` ${pref}`
    return [
      `# [${devName}] ${devHost} (Datacom DmOS)`,
      'configure terminal',
      cmd,
      'exit',
    ].join('\n')
  }

  return `ip route-static ${dest} ${gateway} preference ${pref}`
}

export const getDeleteStaticRouteCliPreview = (devices: Device[], route: StaticRoute | null) => {
  if (!route) return ''
  const dev = devices.find(d => d.id === route.device_id)
  const vendor = (dev?.vendor || 'huawei').toLowerCase()
  const devName = dev?.name || route.device_name || 'Roteador'
  const devHost = dev?.host || ''
  const dest = route.destination
  const gateway = route.next_hop

  if (vendor === 'huawei') {
    let ip = dest
    let mask = '255.255.255.255'
    if (dest.includes('/')) {
      const parts = dest.split('/')
      ip = parts[0]
      if (parts[1] === '0') {
        ip = '0.0.0.0'
        mask = '0.0.0.0'
      } else {
        const cidr = parseInt(parts[1], 10)
        if (!isNaN(cidr) && cidr >= 0 && cidr <= 32) {
          mask = cidrToNetmask(cidr)
        }
      }
    }
    return [
      `# [${devName}] ${devHost} (Huawei VRP)`,
      'system-view',
      `undo ip route-static ${ip} ${mask} ${gateway}`,
      'commit',
      'return',
    ].join('\n')
  } else if (vendor === 'mikrotik_v7') {
    return [
      `# [${devName}] ${devHost} (MikroTik RouterOS v7)`,
      `/ip/route/remove [find dst-address="${dest}" and gateway="${gateway}"]`,
    ].join('\n')
  } else if (vendor === 'mikrotik_v6' || vendor.startsWith('mikrotik')) {
    return [
      `# [${devName}] ${devHost} (MikroTik RouterOS v6)`,
      `/ip route remove [find dst-address="${dest}" and gateway="${gateway}"]`,
    ].join('\n')
  } else if (vendor === 'datacom') {
    return [
      `# [${devName}] ${devHost} (Datacom DmOS)`,
      'configure terminal',
      `no ip route ${dest} ${gateway}`,
      'exit',
    ].join('\n')
  }

  return `undo ip route-static ${dest} ${gateway}`
}

export const getLocalPrefCliPreview = (localPrefSection: BGPASSection | null, targetLocalPref: number) => {
  if (!localPrefSection) return ''
  const vendor = (localPrefSection.device_vendor || '').toLowerCase()
  const devName = localPrefSection.device_name || 'Roteador'
  const devHost = localPrefSection.device_host || ''
  const peerIp = localPrefSection.peer_ip
  const policyName = localPrefSection.import_policy || `RP-IN-${peerIp}`
  const node = localPrefSection.import_policy_node || 11

  if (vendor === 'huawei') {
    return [
      `# [${devName}] ${devHost} (Huawei VRP)`,
      'system-view',
      `route-policy ${policyName} permit node ${node}`,
      ` apply local-preference ${targetLocalPref}`,
      'commit',
      'return',
      `refresh bgp ${peerIp} import`,
    ].join('\n')
  } else if (vendor === 'mikrotik_v7') {
    return [
      `# [${devName}] ${devHost} (MikroTik RouterOS v7)`,
      `/routing/filter/rule/add chain=bgp-in rule="if (bgp-peer == ${peerIp}) { set bgp-local-pref ${targetLocalPref}; }"`,
      '/routing/bgp/connection/refresh',
    ].join('\n')
  } else if (vendor === 'mikrotik_v6' || vendor.startsWith('mikrotik')) {
    return [
      `# [${devName}] ${devHost} (MikroTik RouterOS v6)`,
      `/routing filter add chain=bgp-in peer="${peerIp}" set-bgp-local-pref=${targetLocalPref}`,
      '/routing bgp peer refresh-all',
    ].join('\n')
  } else if (vendor === 'datacom') {
    return [
      `# [${devName}] ${devHost} (Datacom DmOS)`,
      'configure terminal',
      'route-map RM-BGP-IN permit 10',
      ` set local-preference ${targetLocalPref}`,
      'exit',
    ].join('\n')
  }

  return [
    `# [${devName}] ${devHost}`,
    'system-view',
    `route-policy ${policyName} permit node ${node}`,
    ` apply local-preference ${targetLocalPref}`,
    'commit',
    'return',
    `refresh bgp ${peerIp} import`,
  ].join('\n')
}

export const getPrependCliPreviewForDevice = (
  dev: Device,
  targetPrependPrefix: PrefixPrependState | null,
  targetPrependGroup: ASPrependGroup | null,
  prependCountChoice: number,
  isBlockChoice: boolean
) => {
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

export interface BatchPrependTarget {
  id: string
  prefix: string
  peerIp: string
  peerName: string
  remoteAs?: string
  communityBase?: string
  currentCommunity?: string
  asGroupId?: string
  currentPrependCount?: number
  currentIsBlock?: boolean
  newPrependCount?: number
  newIsBlock?: boolean
}

export const getBatchPrependCliPreviewForDevice = (
  dev: Device,
  targets: BatchPrependTarget[],
  prependCountChoice = 0,
  isBlockChoice = false
): string => {
  if (!targets || targets.length === 0) return ''
  const isHuawei = dev.vendor === 'huawei'
  const isMikrotik = dev.vendor?.startsWith('mikrotik')

  if (isHuawei) {
    const lines: string[] = [
      `# [${dev.name}] ${dev.host} (${dev.model || 'Huawei'}) - Controlador BGP Master`,
      `# Alteração em Lote de Prepend (${targets.length} sessões/rotas selecionadas)`,
      'system-view',
    ]

    const prefixMap = new Map<string, { nodeNum: number; comms: string[] }>()

    targets.forEach((t) => {
      const pfx = t.prefix || ''
      let nodeNum = 10
      if (pfx.endsWith('/22')) nodeNum = 10
      else if (pfx.includes('.28.') && pfx.endsWith('/23')) nodeNum = 20
      else if (pfx.includes('.30.') && pfx.endsWith('/23')) nodeNum = 30
      else if (pfx.includes('.28.') && pfx.endsWith('/24')) nodeNum = 40
      else if (pfx.includes('.29.') && pfx.endsWith('/24')) nodeNum = 50
      else if (pfx.includes('.30.') && pfx.endsWith('/24')) nodeNum = 60
      else if (pfx.includes('.31.') && pfx.endsWith('/24')) nodeNum = 70

      let base = t.communityBase || ''
      if (!base) {
        const peerNameLower = (t.peerName || '').toLowerCase()
        if (peerNameLower.includes('wiki')) base = '2002'
        else if (peerNameLower.includes('sea') || t.peerIp?.includes('170.82.')) base = '2003'
        else if (peerNameLower.includes('bel') || peerNameLower.includes('belem')) base = '4500'
        else if (peerNameLower.includes('ce') || peerNameLower.includes('fortaleza') || peerNameLower.includes('ceara')) base = '4400'
        else if (peerNameLower.includes('sp') || peerNameLower.includes('sao paulo')) base = '4100'
        else if (peerNameLower.includes('ptt') || peerNameLower.includes('brasilia') || peerNameLower.includes('bsb')) base = '4000'
        else base = '2003'
      }

      const pCount = t.newPrependCount !== undefined ? t.newPrependCount : prependCountChoice
      const pBlock = t.newIsBlock !== undefined ? t.newIsBlock : isBlockChoice
      const newComm = pBlock ? `0:${base}0` : `1:${base}${pCount}`

      if (!prefixMap.has(pfx)) {
        prefixMap.set(pfx, { nodeNum, comms: [] })
      }
      const existingComms = prefixMap.get(pfx)!.comms
      if (!existingComms.includes(newComm)) {
        existingComms.push(newComm)
      }
    })

    prefixMap.forEach((entry, pfx) => {
      lines.push(`route-policy RP-TAG-V4-ORIGIN permit node ${entry.nodeNum}`)
      lines.push(` # Prefixo: ${pfx}`)
      lines.push(` apply community 267943:1000 ${entry.comms.join(' ')} additive`)
    })

    lines.push('commit')
    lines.push('return')

    return lines.join('\n')
  }

  if (isMikrotik) {
    const lines: string[] = [
      `# [${dev.name}] ${dev.host} (MikroTik RouterOS)`,
      `# Alteração em Lote de Prepend (${targets.length} sessões)`,
    ]

    targets.forEach((t) => {
      const pCount = t.newPrependCount !== undefined ? t.newPrependCount : prependCountChoice
      const pBlock = t.newIsBlock !== undefined ? t.newIsBlock : isBlockChoice

      if (dev.vendor === 'mikrotik_v7') {
        if (pBlock) {
          lines.push(`/routing/filter/rule/set [find where rule~"${t.prefix}"] rule="if (dst == ${t.prefix}) { reject; }"`)
        } else {
          lines.push(`/routing/filter/rule/set [find where rule~"${t.prefix}"] rule="if (dst == ${t.prefix}) { set bgp-path.prepend ${pCount}; accept; }"`)
        }
      } else {
        if (pBlock) {
          lines.push(`/routing filter set [find prefix="${t.prefix}"] action=discard`)
        } else {
          lines.push(`/routing filter set [find prefix="${t.prefix}"] action=accept set-bgp-prepend=${pCount}`)
        }
      }
    })

    if (dev.vendor === 'mikrotik_v7') {
      lines.push('/routing/bgp/connection/refresh')
    } else {
      lines.push('/routing bgp peer refresh-all')
    }

    return lines.join('\n')
  }

  return `# [${dev.name}] Alteração em Lote (${targets.length} alvos)`
}
