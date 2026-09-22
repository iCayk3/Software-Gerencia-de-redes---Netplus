/**
 * NetPulse - Servidor Mock de Desenvolvimento Local (100% Node.js)
 * Permite continuar todo o desenvolvimento do frontend e das regras de tráfego
 * em computadores que não possuem Go instalado e sem conexão direta aos roteadores.
 *
 * Porta: 8080
 * Zero dependências externas (usa apenas bibliotecas nativas do Node.js: http, fs, path).
 */

const http = require('http')
const fs = require('fs')
const path = require('path')
const url = require('url')

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 8080
const ROOT_DIR = __dirname
const DATA_DIR = path.join(ROOT_DIR, 'backend', 'data')

// Funções utilitárias para manipulação de JSON
function readJSON(filename, fallback = []) {
  const filePath = path.join(DATA_DIR, filename)
  try {
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
    }
  } catch (err) {
    console.error(`[MockServer] Erro ao ler ${filename}:`, err.message)
  }
  return fallback
}

function writeJSON(filename, data) {
  const filePath = path.join(DATA_DIR, filename)
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true })
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8')
    return true
  } catch (err) {
    console.error(`[MockServer] Erro ao gravar ${filename}:`, err.message)
    return false
  }
}

// Resposta JSON padrão
function sendJSON(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  })
  res.end(JSON.stringify(data))
}

function sendError(res, statusCode, message) {
  sendJSON(res, statusCode, { error: message })
}

// Parse do corpo da requisição POST/PUT
function parseBody(req) {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => {
      body += chunk
    })
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {})
      } catch {
        resolve({})
      }
    })
  })
}

// Dataset Mock Estático de BGP e OSPF baseado nas configurações reais dos equipamentos
const MOCK_BGP_SESSIONS = [
  // BGP1 (45.166.28.254 - NE8000)
  {
    device_id: '7a5d2d4230302c56',
    device_name: 'BGP',
    peer_ip: '170.82.183.217',
    remote_as: '266445',
    local_as: '267943',
    state: 'Established',
    uptime: '1475h10m',
    prefixes_received: 1089542,
    prefixes_sent: 7,
    description: 'BGP-SEA-IPV4',
  },
  {
    device_id: '7a5d2d4230302c56',
    device_name: 'BGP',
    peer_ip: '2804:37F0:80F0:105::1',
    remote_as: '266445',
    local_as: '267943',
    state: 'Established',
    uptime: '1475h10m',
    prefixes_received: 215430,
    prefixes_sent: 2,
    description: 'BGP-SEA-IPV6',
  },
  {
    device_id: '7a5d2d4230302c56',
    device_name: 'BGP',
    peer_ip: '45.184.145.253',
    remote_as: '26162',
    local_as: '267943',
    state: 'Established',
    uptime: '840h22m',
    prefixes_received: 14210,
    prefixes_sent: 7,
    description: 'BGP-PTT-BRASILIA-RS1-IPV4',
  },
  {
    device_id: '7a5d2d4230302c56',
    device_name: 'BGP',
    peer_ip: '45.184.145.254',
    remote_as: '26162',
    local_as: '267943',
    state: 'Established',
    uptime: '840h22m',
    prefixes_received: 14208,
    prefixes_sent: 7,
    description: 'BGP-PTT-BRASILIA-RS2-IPV4',
  },
  {
    device_id: '7a5d2d4230302c56',
    device_name: 'BGP',
    peer_ip: '2001:12F8:0:13::253',
    remote_as: '26162',
    local_as: '267943',
    state: 'Established',
    uptime: '840h20m',
    prefixes_received: 6810,
    prefixes_sent: 2,
    description: 'BGP-PTT-BRASILIA-RS1-IPV6',
  },
  {
    device_id: '7a5d2d4230302c56',
    device_name: 'BGP',
    peer_ip: '2001:12F8:0:13::254',
    remote_as: '26162',
    local_as: '267943',
    state: 'Established',
    uptime: '840h20m',
    prefixes_received: 6812,
    prefixes_sent: 2,
    description: 'BGP-PTT-BRASILIA-RS2-IPV6',
  },
  {
    device_id: '7a5d2d4230302c56',
    device_name: 'BGP',
    peer_ip: '10.254.254.2',
    remote_as: '267943',
    local_as: '267943',
    state: 'Established',
    uptime: '2150h',
    prefixes_received: 45,
    prefixes_sent: 45,
    description: 'IBGP-PRB-PMV',
  },
  // BGP2 (45.166.28.249 - NE40)
  {
    device_id: '738398e45a892540',
    device_name: 'BGP2',
    peer_ip: '45.166.28.250',
    remote_as: '262503',
    local_as: '267943',
    state: 'Established',
    uptime: '920h',
    prefixes_received: 980400,
    prefixes_sent: 7,
    description: 'BGP-WIKI-IPV4',
  },
  {
    device_id: '738398e45a892540',
    device_name: 'BGP2',
    peer_ip: '2804:49c0::1',
    remote_as: '262503',
    local_as: '267943',
    state: 'Established',
    uptime: '920h',
    prefixes_received: 195200,
    prefixes_sent: 2,
    description: 'BGP-WIKI-IPV6',
  },
  {
    device_id: '738398e45a892540',
    device_name: 'BGP2',
    peer_ip: '187.16.218.69',
    remote_as: '26162',
    local_as: '267943',
    state: 'Established',
    uptime: '610h',
    prefixes_received: 95400,
    prefixes_sent: 7,
    description: 'BGP-PTT-SP-RS1-IPV4',
  },
  {
    device_id: '738398e45a892540',
    device_name: 'BGP2',
    peer_ip: '187.16.218.70',
    remote_as: '26162',
    local_as: '267943',
    state: 'Established',
    uptime: '610h',
    prefixes_received: 95390,
    prefixes_sent: 7,
    description: 'BGP-PTT-SP-RS2-IPV4',
  },
  {
    device_id: '738398e45a892540',
    device_name: 'BGP2',
    peer_ip: '45.68.79.253',
    remote_as: '26162',
    local_as: '267943',
    state: 'Established',
    uptime: '750h',
    prefixes_received: 22100,
    prefixes_sent: 7,
    description: 'BGP-PTT-BELEM-RS1-IPV4',
  },
  {
    device_id: '738398e45a892540',
    device_name: 'BGP2',
    peer_ip: '45.68.79.254',
    remote_as: '26162',
    local_as: '267943',
    state: 'Established',
    uptime: '750h',
    prefixes_received: 22095,
    prefixes_sent: 7,
    description: 'BGP-PTT-BELEM-RS2-IPV4',
  },
  {
    device_id: '738398e45a892540',
    device_name: 'BGP2',
    peer_ip: '45.68.80.253',
    remote_as: '26162',
    local_as: '267943',
    state: 'Established',
    uptime: '430h',
    prefixes_received: 18400,
    prefixes_sent: 7,
    description: 'BGP-PTT-CE-RS1-IPV4',
  },
]

const MOCK_OSPF_NEIGHBORS = [
  {
    device_id: '7a5d2d4230302c56',
    device_name: 'BGP',
    neighbor_id: '10.254.254.2',
    ip: '10.255.0.2',
    interface: '100GE0/3/0',
    area: '0.0.0.0',
    state: 'Full',
    role: 'DR',
    dead_time: '34s',
  },
  {
    device_id: '738398e45a892540',
    device_name: 'BGP2',
    neighbor_id: '10.254.254.1',
    ip: '10.255.0.1',
    interface: '100GE0/3/1',
    area: '0.0.0.0',
    state: 'Full',
    role: 'BDR',
    dead_time: '32s',
  },
]

// Grupos e Prefixos de Prepend (Download TE)
const MOCK_PREPEND_GROUPS_BGP = [
  {
    id: 'asgrp-7a5d2d4230302c56-2003',
    device_id: '7a5d2d4230302c56',
    device_name: 'BGP',
    remote_as: '266445',
    group_name: 'SEA Telecom',
    community_base: '2003',
    role: 'transit_primary',
    peer_count: 2,
    peer_ips: ['170.82.183.217', '2804:37F0:80F0:105::1'],
    peers: [],
    prefixes: [
      {
        id: 'pfx-bgp-sea-1',
        device_id: '7a5d2d4230302c56',
        device_name: 'BGP',
        prefix: '45.166.28.0/22',
        peer_ip: '170.82.183.217',
        peer_name: 'BGP-SEA',
        prepend_count: 0,
        is_blocked: false,
      },
      {
        id: 'pfx-bgp-sea-2',
        device_id: '7a5d2d4230302c56',
        device_name: 'BGP',
        prefix: '45.166.28.0/23',
        peer_ip: '170.82.183.217',
        peer_name: 'BGP-SEA',
        prepend_count: 0,
        is_blocked: false,
      },
      {
        id: 'pfx-bgp-sea-3',
        device_id: '7a5d2d4230302c56',
        device_name: 'BGP',
        prefix: '45.166.30.0/23',
        peer_ip: '170.82.183.217',
        peer_name: 'BGP-SEA',
        prepend_count: 1,
        is_blocked: false,
      },
      {
        id: 'pfx-bgp-sea-4',
        device_id: '7a5d2d4230302c56',
        device_name: 'BGP',
        prefix: '45.166.30.0/24',
        peer_ip: '170.82.183.217',
        peer_name: 'BGP-SEA',
        prepend_count: 0,
        is_blocked: false,
      },
      {
        id: 'pfx-bgp-sea-5',
        device_id: '7a5d2d4230302c56',
        device_name: 'BGP',
        prefix: '45.166.31.0/24',
        peer_ip: '170.82.183.217',
        peer_name: 'BGP-SEA',
        prepend_count: 0,
        is_blocked: false,
      },
    ],
  },
  {
    id: 'asgrp-7a5d2d4230302c56-4000',
    device_id: '7a5d2d4230302c56',
    device_name: 'BGP',
    remote_as: '26162',
    group_name: 'PTT Brasília (IX.br BSB)',
    community_base: '4000',
    role: 'ix_ptt',
    peer_count: 4,
    peer_ips: ['45.184.145.253', '45.184.145.254', '2001:12F8:0:13::253', '2001:12F8:0:13::254'],
    peers: [],
    prefixes: [
      {
        id: 'pfx-bgp-bsb-1',
        device_id: '7a5d2d4230302c56',
        device_name: 'BGP',
        prefix: '45.166.28.0/22',
        peer_ip: '45.184.145.253',
        peer_name: 'BGP-PTT-BRASILIA',
        prepend_count: 0,
        is_blocked: false,
      },
      {
        id: 'pfx-bgp-bsb-2',
        device_id: '7a5d2d4230302c56',
        device_name: 'BGP',
        prefix: '45.166.30.0/24',
        peer_ip: '45.184.145.253',
        peer_name: 'BGP-PTT-BRASILIA',
        prepend_count: 0,
        is_blocked: false,
      },
      {
        id: 'pfx-bgp-bsb-3',
        device_id: '7a5d2d4230302c56',
        device_name: 'BGP',
        prefix: '45.166.31.0/24',
        peer_ip: '45.184.145.253',
        peer_name: 'BGP-PTT-BRASILIA',
        prepend_count: 0,
        is_blocked: true,
      },
    ],
  },
]

const MOCK_PREPEND_GROUPS_BGP2 = [
  {
    id: 'asgrp-738398e45a892540-4100',
    device_id: '738398e45a892540',
    device_name: 'BGP2',
    remote_as: '26162',
    group_name: 'PTT São Paulo (IX.br SP)',
    community_base: '4100',
    role: 'ix_ptt',
    peer_count: 4,
    peer_ips: ['187.16.218.69', '187.16.218.70', '2001:12f8::218:69', '2001:12f8::218:70'],
    peers: [],
    prefixes: [
      {
        id: 'pfx-bgp2-sp-1',
        device_id: '738398e45a892540',
        device_name: 'BGP2',
        prefix: '45.166.28.0/22',
        peer_ip: '187.16.218.69',
        peer_name: 'BGP-PTT-SP',
        prepend_count: 0,
        is_blocked: false,
      },
      {
        id: 'pfx-bgp2-sp-2',
        device_id: '738398e45a892540',
        device_name: 'BGP2',
        prefix: '45.166.30.0/24',
        peer_ip: '187.16.218.69',
        peer_name: 'BGP-PTT-SP',
        prepend_count: 2,
        is_blocked: false,
      },
    ],
  },
  {
    id: 'asgrp-738398e45a892540-4500',
    device_id: '738398e45a892540',
    device_name: 'BGP2',
    remote_as: '26162',
    group_name: 'PTT Belém (IX.br BEL)',
    community_base: '4500',
    role: 'ix_ptt',
    peer_count: 4,
    peer_ips: ['45.68.79.253', '45.68.79.254'],
    peers: [],
    prefixes: [
      {
        id: 'pfx-bgp2-bel-1',
        device_id: '738398e45a892540',
        device_name: 'BGP2',
        prefix: '45.166.28.0/22',
        peer_ip: '45.68.79.253',
        peer_name: 'BGP-PTT-BELEM',
        prepend_count: 0,
        is_blocked: false,
      },
    ],
  },
  {
    id: 'asgrp-738398e45a892540-4400',
    device_id: '738398e45a892540',
    device_name: 'BGP2',
    remote_as: '26162',
    group_name: 'PTT Ceará (IX.br CE)',
    community_base: '4400',
    role: 'ix_ptt',
    peer_count: 4,
    peer_ips: ['45.68.80.253', '45.68.80.254'],
    peers: [],
    prefixes: [
      {
        id: 'pfx-bgp2-ce-1',
        device_id: '738398e45a892540',
        device_name: 'BGP2',
        prefix: '45.166.28.0/22',
        peer_ip: '45.68.80.253',
        peer_name: 'BGP-PTT-CE',
        prepend_count: 0,
        is_blocked: false,
      },
    ],
  },
  {
    id: 'asgrp-738398e45a892540-2002',
    device_id: '738398e45a892540',
    device_name: 'BGP2',
    remote_as: '262503',
    group_name: 'Wiki Telecom',
    community_base: '2002',
    role: 'transit_secondary',
    peer_count: 2,
    peer_ips: ['45.166.28.250', '2804:49c0::1'],
    peers: [],
    prefixes: [
      {
        id: 'pfx-bgp2-wiki-1',
        device_id: '738398e45a892540',
        device_name: 'BGP2',
        prefix: '45.166.28.0/22',
        peer_ip: '45.166.28.250',
        peer_name: 'BGP-WIKI',
        prepend_count: 1,
        is_blocked: false,
      },
    ],
  },
]

// Servidor Principal
const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
  const pathname = parsedUrl.pathname
  const method = req.method.toUpperCase()

  // Tratamento de pre-flight CORS
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    })
    res.end()
    return
  }

  console.log(`[MockServer] ${method} ${pathname}`)

  // 1. Health Check
  if (pathname === '/api/health') {
    return sendJSON(res, 200, {
      status: 'ok (Modo Simulação Node.js)',
      version: '1.0.0-dev-offline',
      go_version: 'node-mock-v1.0',
      uptime: '3h12m',
      timestamp: new Date().toISOString(),
    })
  }

  // 2. Dispositivos (CRUD)
  if (pathname === '/api/devices' && method === 'GET') {
    const devices = readJSON('devices.json', [])
    return sendJSON(res, 200, devices)
  }

  if (pathname === '/api/devices' && method === 'POST') {
    const body = await parseBody(req)
    const devices = readJSON('devices.json', [])
    const newDevice = {
      id: Math.random().toString(16).substring(2, 18),
      name: body.name || 'Novo-Dispositivo',
      host: body.host || '127.0.0.1',
      port: body.port || 22,
      vendor: body.vendor || 'huawei',
      model: body.model || '',
      username: body.username || 'admin',
      password: body.password || '',
      auth_type: body.auth_type || 'password',
      is_bgp: body.is_bgp ?? true,
      created_at: new Date().toISOString(),
      last_seen: new Date().toISOString(),
      status: 'online',
    }
    devices.push(newDevice)
    writeJSON('devices.json', devices)
    return sendJSON(res, 201, newDevice)
  }

  // PUT /api/devices/:id
  const putDevMatch = pathname.match(/^\/api\/devices\/([^/]+)$/)
  if (putDevMatch && method === 'PUT') {
    const devId = putDevMatch[1]
    const body = await parseBody(req)
    const devices = readJSON('devices.json', [])
    const idx = devices.findIndex((d) => d.id === devId)
    if (idx !== -1) {
      devices[idx] = {
        ...devices[idx],
        ...body,
        id: devId,
        password: body.password || devices[idx].password,
        last_seen: new Date().toISOString(),
      }
      writeJSON('devices.json', devices)
      return sendJSON(res, 200, devices[idx])
    }
    return sendError(res, 404, 'Equipamento não encontrado')
  }

  // DELETE /api/devices/:id
  if (putDevMatch && method === 'DELETE') {
    const devId = putDevMatch[1]
    const devices = readJSON('devices.json', [])
    const filtered = devices.filter((d) => d.id !== devId)
    writeJSON('devices.json', filtered)
    return sendJSON(res, 200, { message: 'Equipamento removido com sucesso' })
  }

  // POST /api/devices/:id/test (Teste SSH Mock)
  const testDevMatch = pathname.match(/^\/api\/devices\/([^/]+)\/test$/)
  if (testDevMatch && method === 'POST') {
    return sendJSON(res, 200, {
      success: true,
      latency_ms: 12,
      banner: 'SSH-2.0-Huawei-VRP (Simulação Local)',
    })
  }

  // 3. Sessões BGP
  if (pathname === '/api/bgp/all') {
    return sendJSON(res, 200, MOCK_BGP_SESSIONS)
  }

  const bgpDevMatch = pathname.match(/^\/api\/devices\/([^/]+)\/bgp$/)
  if (bgpDevMatch) {
    const devId = bgpDevMatch[1]
    const filtered = MOCK_BGP_SESSIONS.filter((s) => s.device_id === devId)
    return sendJSON(res, 200, filtered)
  }

  // 4. Vizinhos OSPF
  if (pathname === '/api/ospf/all') {
    return sendJSON(res, 200, MOCK_OSPF_NEIGHBORS)
  }

  const ospfDevMatch = pathname.match(/^\/api\/devices\/([^/]+)\/ospf$/)
  if (ospfDevMatch) {
    const devId = ospfDevMatch[1]
    const filtered = MOCK_OSPF_NEIGHBORS.filter((s) => s.device_id === devId)
    return sendJSON(res, 200, filtered)
  }

  // 5. Download Prepends
  if (pathname === '/api/bgp/prepends/all') {
    return sendJSON(res, 200, [
      {
        device_id: '7a5d2d4230302c56',
        device_name: 'BGP',
        local_as: '267943',
        peers: [],
        prefixes: [],
        as_groups: MOCK_PREPEND_GROUPS_BGP,
        last_sync_time: new Date().toISOString(),
      },
      {
        device_id: '738398e45a892540',
        device_name: 'BGP2',
        local_as: '267943',
        peers: [],
        prefixes: [],
        as_groups: MOCK_PREPEND_GROUPS_BGP2,
        last_sync_time: new Date().toISOString(),
      },
    ])
  }

  const prepDevMatch = pathname.match(/^\/api\/devices\/([^/]+)\/bgp\/prepends$/)
  if (prepDevMatch) {
    const devId = prepDevMatch[1]
    const groups = devId === '7a5d2d4230302c56' ? MOCK_PREPEND_GROUPS_BGP : MOCK_PREPEND_GROUPS_BGP2
    return sendJSON(res, 200, {
      device_id: devId,
      device_name: devId === '7a5d2d4230302c56' ? 'BGP' : 'BGP2',
      local_as: '267943',
      peers: [],
      prefixes: [],
      as_groups: groups,
      last_sync_time: new Date().toISOString(),
    })
  }

  if (pathname === '/api/traffic/download/prepend' && method === 'POST') {
    return sendJSON(res, 200, {
      message: 'Comando BGP Prepend validado (Modo Manual Seguro - Zero Alteração)',
    })
  }

  // 6. Upload Overview (Local-Preference)
  if (pathname === '/api/traffic/upload/overview') {
    const asMeta = readJSON('as_metadata.json', [])
    const getMeta = (asn) => asMeta.find((m) => m.asn === asn) || { asn, alias: `AS${asn}`, role: 'transit_primary' }

    return sendJSON(res, 200, {
      sections: [
        {
          id: 'sec-sea',
          device_id: '7a5d2d4230302c56',
          device_name: 'BGP',
          device_host: '45.166.28.254',
          device_vendor: 'huawei',
          remote_as: '266445',
          local_as: '267943',
          peer_ip: '170.82.183.217',
          peer_name: 'BGP-SEA',
          bgp_state: 'Established',
          uptime: '1475h',
          prefixes_received: 1089542,
          local_pref: 200,
          import_policy: 'SEA-IN',
          import_policy_node: 11,
          metadata: getMeta('266445'),
          static_routes: [],
        },
        {
          id: 'sec-wiki',
          device_id: '738398e45a892540',
          device_name: 'BGP2',
          device_host: '45.166.28.249',
          device_vendor: 'huawei',
          remote_as: '262503',
          local_as: '267943',
          peer_ip: '45.166.28.250',
          peer_name: 'BGP-WIKI',
          bgp_state: 'Established',
          uptime: '920h',
          prefixes_received: 980400,
          local_pref: 150,
          import_policy: 'WIKI-IN',
          import_policy_node: 10,
          metadata: getMeta('262503'),
          static_routes: [],
        },
        {
          id: 'sec-ptt-sp',
          device_id: '738398e45a892540',
          device_name: 'BGP2',
          device_host: '45.166.28.249',
          device_vendor: 'huawei',
          remote_as: '26162',
          local_as: '267943',
          peer_ip: '187.16.218.69',
          peer_name: 'BGP-PTT-SP',
          bgp_state: 'Established',
          uptime: '610h',
          prefixes_received: 95400,
          local_pref: 1000,
          import_policy: 'PTT-SP-IN',
          import_policy_node: 10,
          metadata: getMeta('26162'),
          static_routes: [],
        },
        {
          id: 'sec-ptt-bsb',
          device_id: '7a5d2d4230302c56',
          device_name: 'BGP',
          device_host: '45.166.28.254',
          device_vendor: 'huawei',
          remote_as: '26162',
          local_as: '267943',
          peer_ip: '45.184.145.253',
          peer_name: 'BGP-PTT-BRASILIA',
          bgp_state: 'Established',
          uptime: '840h',
          prefixes_received: 14210,
          local_pref: 1000,
          import_policy: 'PTT-BRASILIA-IPV4-IN',
          import_policy_node: 11,
          metadata: getMeta('26162'),
          static_routes: [],
        },
      ],
      other_routes: [
        {
          id: 'rt-discard-1',
          device_id: '7a5d2d4230302c56',
          device_name: 'BGP',
          destination: '45.166.28.0/22',
          next_hop: 'NULL0',
          preference: 255,
          status: 'active',
          description: 'AGREGADO-BGP-V4-DISCARD',
        },
        {
          id: 'rt-cgnat-1',
          device_id: '7a5d2d4230302c56',
          device_name: 'BGP',
          destination: '45.166.29.128/26',
          next_hop: '10.16.0.2',
          preference: 60,
          status: 'active',
          description: 'CGNAT',
        },
      ],
      last_sync_time: new Date().toISOString(),
    })
  }

  if (pathname === '/api/traffic/upload/local-pref' && method === 'POST') {
    return sendJSON(res, 200, {
      message: 'Comando Local-Preference gerado (Modo Manual Seguro - Zero Alteração)',
    })
  }

  // 7. AS Metadata (Personalização de Alias e Logos)
  if (pathname === '/api/traffic/as-metadata' && method === 'GET') {
    const list = readJSON('as_metadata.json', [])
    const map = {}
    list.forEach((item) => {
      map[item.asn] = item
    })
    return sendJSON(res, 200, map)
  }

  if (pathname === '/api/traffic/as-metadata' && method === 'POST') {
    const body = await parseBody(req)
    const list = readJSON('as_metadata.json', [])
    const idx = list.findIndex((m) => m.asn === body.asn)
    const updated = {
      ...(idx !== -1 ? list[idx] : {}),
      ...body,
      updated_at: new Date().toISOString(),
    }
    if (idx !== -1) {
      list[idx] = updated
    } else {
      list.push(updated)
    }
    writeJSON('as_metadata.json', list)
    return sendJSON(res, 200, { message: 'Metadados salvos', metadata: updated })
  }

  // 8. Alertas
  if (pathname === '/api/alerts' && method === 'GET') {
    const alerts = readJSON('alerts.json', [])
    return sendJSON(res, 200, alerts)
  }

  const ackMatch = pathname.match(/^\/api\/alerts\/([^/]+)\/ack$/)
  if (ackMatch && method === 'POST') {
    const alertId = ackMatch[1]
    const alerts = readJSON('alerts.json', [])
    const target = alerts.find((a) => a.id === alertId)
    if (target) {
      target.acknowledged = true
      writeJSON('alerts.json', alerts)
      return sendJSON(res, 200, target)
    }
    return sendError(res, 404, 'Alerta não encontrado')
  }

  // 9. Status de Sincronização
  if (pathname === '/api/traffic/status') {
    return sendJSON(res, 200, {
      last_sync_time: new Date().toISOString(),
      next_sync_time: 'Diário às 03:30 (Madrugada)',
    })
  }

  // 10. Utilitários de Diagnóstico Mock
  if (pathname === '/api/network/interfaces') {
    return sendJSON(res, 200, [
      {
        index: 1,
        name: 'Ethernet Local',
        hardware_addr: '00:15:5d:01:02:03',
        flags: ['up', 'broadcast', 'multicast'],
        mtu: 1500,
        ip_addresses: ['192.168.1.100/24'],
        is_up: true,
        is_loopback: false,
      },
    ])
  }

  if (pathname === '/api/network/ping' && method === 'POST') {
    const body = await parseBody(req)
    return sendJSON(res, 200, {
      host: body.host || '1.1.1.1',
      ip: body.host || '1.1.1.1',
      success: true,
      latency_ms: 14.5,
      message: 'Ping OK (Simulação Local)',
      method: 'tcp-handshake',
    })
  }

  // 404 para outras rotas
  sendError(res, 404, `Rota ${method} ${pathname} não encontrada no servidor de desenvolvimento`)
})

server.listen(PORT, () => {
  console.log(`=====================================================`)
  console.log(` NetPulse - Servidor de Desenvolvimento Mock (Node.js)`)
  console.log(` Porta da API: http://localhost:${PORT}`)
  console.log(` Zero dependências de Go - Pronto para uso em casa!`)
  console.log(`=====================================================`)
})
