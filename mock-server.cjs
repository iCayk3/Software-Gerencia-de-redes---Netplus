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
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-ID',
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
  // Alpha Fibra (dev-alpha-01 - NE40)
  {
    device_id: 'dev-alpha-01',
    device_name: 'Alpha-Borda-NE40',
    peer_ip: '187.16.218.69',
    remote_as: '26162',
    local_as: '26162',
    state: 'Established',
    uptime: '320h45m',
    prefixes_received: 94210,
    prefixes_sent: 4,
    description: 'ALPHA-PTT-SP-RS1',
  },
  {
    device_id: 'dev-alpha-01',
    device_name: 'Alpha-Borda-NE40',
    peer_ip: '177.100.0.1',
    remote_as: '266445',
    local_as: '26162',
    state: 'Established',
    uptime: '120h10m',
    prefixes_received: 980100,
    prefixes_sent: 4,
    description: 'ALPHA-UPSTREAM-TRANSITO',
  },
  // Beta Telecom (dev-beta-01 - CCR2004)
  {
    device_id: 'dev-beta-01',
    device_name: 'Beta-Core-CCR2004',
    peer_ip: '170.82.183.217',
    remote_as: '266445',
    local_as: '266445',
    state: 'Established',
    uptime: '840h15m',
    prefixes_received: 1045200,
    prefixes_sent: 6,
    description: 'BETA-TRANSITO-SEA-IPV4',
  },
  {
    device_id: 'dev-beta-01',
    device_name: 'Beta-Core-CCR2004',
    peer_ip: '45.184.145.253',
    remote_as: '26162',
    local_as: '266445',
    state: 'Established',
    uptime: '410h00m',
    prefixes_received: 14210,
    prefixes_sent: 6,
    description: 'BETA-PTT-BSB-RS1',
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
  const query = Object.fromEntries(parsedUrl.searchParams.entries())
  const tenantScope = req.headers['x-tenant-id'] || query.tenant_id || ''

  // Tratamento de pre-flight CORS
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Tenant-ID',
    })
    res.end()
    return
  }

  console.log(`[MockServer] ${method} ${pathname} ${tenantScope ? `[Tenant: ${tenantScope}]` : ''}`)

  // 1. Health Check
  if (pathname === '/api/health') {
    return sendJSON(res, 200, {
      status: 'ok (Modo Simulação Node.js)',
      version: '2.0.0-multi-tenant-mock',
      go_version: 'node-mock-v2.0',
      uptime: '3h12m',
      timestamp: new Date().toISOString(),
    })
  }

  // --- 1.1 Autenticação & Gestão de Usuários (RBAC) ---
  if (pathname === '/api/auth/login' && method === 'POST') {
    const body = await parseBody(req)
    const users = readJSON('users.json', [])
    const found = users.find((u) => u.email?.toLowerCase() === body.email?.toLowerCase())
    if (found) {
      const { password_hash, ...safeUser } = found
      if (found.email?.toLowerCase() === 'admin@netpulse.com' || (found.role === 'admin' && (found.tenant_id === 'default-tenant' || !found.tenant_id))) {
        safeUser.is_superadmin = true
      }
      return sendJSON(res, 200, {
        token: `mock-jwt-token-${safeUser.id}-${Date.now()}`,
        expires_at: new Date(Date.now() + 86400000).toISOString(),
        user: safeUser,
      })
    }
    // Fallback default admin if no specific user matched
    return sendJSON(res, 200, {
      token: `mock-jwt-token-admin-${Date.now()}`,
      expires_at: new Date(Date.now() + 86400000).toISOString(),
      user: {
        id: 'usr-admin-default',
        tenant_id: 'default-tenant',
        name: 'Administrador NOC (Mock)',
        email: body.email || 'admin@netpulse.com',
        role: 'admin',
        is_superadmin: true,
        status: 'active',
        created_at: new Date().toISOString(),
      },
    })
  }

  if (pathname === '/api/auth/me' && method === 'GET') {
    const users = readJSON('users.json', [])
    const adminUser = users.find((u) => u.is_superadmin) || users[0] || {
      id: 'usr-admin-default',
      tenant_id: 'default-tenant',
      name: 'Administrador NOC (Mock)',
      email: 'admin@netpulse.com',
      role: 'admin',
      is_superadmin: true,
      status: 'active',
      created_at: new Date().toISOString(),
    }
    const { password_hash, ...safeUser } = adminUser
    return sendJSON(res, 200, safeUser)
  }

  if (pathname === '/api/auth/logout' && method === 'POST') {
    return sendJSON(res, 200, { message: 'Sessão encerrada com sucesso' })
  }

  if (pathname === '/api/auth/users' && method === 'GET') {
    const users = readJSON('users.json', [])
    const tenants = readJSON('tenants.json', [])
    let filtered = users
    if (tenantScope) {
      filtered = users.filter((u) => u.tenant_id === tenantScope)
    }
    const safeUsers = filtered.map(({ password_hash, ...u }) => {
      const t = tenants.find((item) => item.id === u.tenant_id)
      return {
        ...u,
        tenant_name: t ? t.name : u.tenant_id,
      }
    })
    return sendJSON(res, 200, safeUsers)
  }

  if (pathname === '/api/auth/users' && method === 'POST') {
    const body = await parseBody(req)
    const users = readJSON('users.json', [])
    const newUser = {
      id: `usr-${Math.random().toString(16).substring(2, 10)}`,
      tenant_id: body.tenant_id || tenantScope || 'default-tenant',
      name: body.name || 'Novo Usuário',
      email: body.email || 'user@empresa.com.br',
      password_hash: '$2a$10$mockHashPlaceholder',
      role: body.role || 'noc_operator',
      is_superadmin: Boolean(body.is_superadmin),
      status: 'active',
      created_at: new Date().toISOString(),
    }
    users.push(newUser)
    writeJSON('users.json', users)
    const { password_hash, ...safeUser } = newUser
    return sendJSON(res, 201, safeUser)
  }

  const putUserMatch = pathname.match(/^\/api\/auth\/users\/([^/]+)$/)
  if (putUserMatch && method === 'PUT') {
    const userId = putUserMatch[1]
    const body = await parseBody(req)
    const users = readJSON('users.json', [])
    const idx = users.findIndex((u) => u.id === userId)
    if (idx !== -1) {
      users[idx] = {
        ...users[idx],
        name: body.name !== undefined ? body.name : users[idx].name,
        email: body.email !== undefined ? body.email : users[idx].email,
        role: body.role !== undefined ? body.role : users[idx].role,
        tenant_id: body.tenant_id !== undefined ? body.tenant_id : users[idx].tenant_id,
        is_superadmin: body.is_superadmin !== undefined ? Boolean(body.is_superadmin) : users[idx].is_superadmin,
        status: body.status !== undefined ? body.status : users[idx].status,
      }
      writeJSON('users.json', users)
      const { password_hash, ...safeUser } = users[idx]
      return sendJSON(res, 200, safeUser)
    }
    return sendError(res, 404, 'Usuário não encontrado')
  }

  if (putUserMatch && method === 'DELETE') {
    const userId = putUserMatch[1]
    const users = readJSON('users.json', [])
    const filtered = users.filter((u) => u.id !== userId)
    writeJSON('users.json', filtered)
    return sendJSON(res, 200, { message: 'Usuário removido com sucesso' })
  }

  // --- 1.2 Empresas Clientes (Tenants CRUD) ---
  if (pathname === '/api/tenants' && method === 'GET') {
    const tenants = readJSON('tenants.json', [])
    const devices = readJSON('devices.json', [])
    const users = readJSON('users.json', [])
    const enriched = tenants.map((t) => ({
      ...t,
      device_count: devices.filter((d) => d.tenant_id === t.id).length,
      user_count: users.filter((u) => u.tenant_id === t.id).length,
    }))
    return sendJSON(res, 200, enriched)
  }

  if (pathname === '/api/tenants' && method === 'POST') {
    const body = await parseBody(req)
    const tenants = readJSON('tenants.json', [])
    const newTenant = {
      id: `tenant-${Math.random().toString(16).substring(2, 10)}`,
      name: body.name || 'Nova Empresa Cliente',
      slug: body.slug || body.name?.toLowerCase().replace(/\s+/g, '-') || 'cliente',
      asn: body.asn ? String(body.asn) : '',
      document: body.document || '',
      contact_email: body.contact_email || '',
      contact_phone: body.contact_phone || '',
      logo_url: body.logo_url || '',
      plan: body.plan || 'standard',
      status: body.status || 'active',
      created_at: new Date().toISOString(),
    }
    tenants.push(newTenant)
    writeJSON('tenants.json', tenants)
    return sendJSON(res, 201, {
      ...newTenant,
      device_count: 0,
      user_count: 0,
    })
  }

  const tenantMatch = pathname.match(/^\/api\/tenants\/([^/]+)$/)
  if (tenantMatch && method === 'GET') {
    const tenantId = tenantMatch[1]
    const tenants = readJSON('tenants.json', [])
    const target = tenants.find((t) => t.id === tenantId)
    if (target) {
      const devices = readJSON('devices.json', [])
      const users = readJSON('users.json', [])
      return sendJSON(res, 200, {
        ...target,
        device_count: devices.filter((d) => d.tenant_id === target.id).length,
        user_count: users.filter((u) => u.tenant_id === target.id).length,
      })
    }
    return sendError(res, 404, 'Empresa cliente não encontrada')
  }

  if (tenantMatch && method === 'PUT') {
    const tenantId = tenantMatch[1]
    const body = await parseBody(req)
    const tenants = readJSON('tenants.json', [])
    const idx = tenants.findIndex((t) => t.id === tenantId)
    if (idx !== -1) {
      tenants[idx] = {
        ...tenants[idx],
        ...body,
        id: tenantId,
      }
      writeJSON('tenants.json', tenants)
      return sendJSON(res, 200, tenants[idx])
    }
    return sendError(res, 404, 'Empresa cliente não encontrada')
  }

  if (tenantMatch && method === 'DELETE') {
    const tenantId = tenantMatch[1]
    const tenants = readJSON('tenants.json', [])
    const filtered = tenants.filter((t) => t.id !== tenantId)
    writeJSON('tenants.json', filtered)
    return sendJSON(res, 200, { message: 'Empresa cliente removida com sucesso' })
  }

  // 2. Dispositivos (CRUD com escopo Multi-Tenant)
  if (pathname === '/api/devices' && method === 'GET') {
    const devices = readJSON('devices.json', [])
    const tenants = readJSON('tenants.json', [])
    let filtered = devices
    if (tenantScope) {
      filtered = devices.filter((d) => d.tenant_id === tenantScope)
    }
    const safeDevices = filtered.map(({ password, ...d }) => {
      const t = tenants.find((item) => item.id === d.tenant_id)
      return {
        ...d,
        tenant_name: t ? t.name : d.tenant_id,
        has_password: Boolean(password),
      }
    })
    return sendJSON(res, 200, safeDevices)
  }

  if (pathname === '/api/devices' && method === 'POST') {
    const body = await parseBody(req)
    const devices = readJSON('devices.json', [])
    const newDevice = {
      id: Math.random().toString(16).substring(2, 18),
      tenant_id: body.tenant_id || tenantScope || 'default-tenant',
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
    const { password, ...safeDev } = newDevice
    return sendJSON(res, 201, safeDev)
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
    if (tenantScope) {
      const devices = readJSON('devices.json', [])
      const tenantDevIds = devices.filter((d) => d.tenant_id === tenantScope).map((d) => d.id)
      return sendJSON(res, 200, MOCK_BGP_SESSIONS.filter((s) => tenantDevIds.includes(s.device_id)))
    }
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
    if (tenantScope) {
      const devices = readJSON('devices.json', [])
      const tenantDevIds = devices.filter((d) => d.tenant_id === tenantScope).map((d) => d.id)
      return sendJSON(res, 200, MOCK_OSPF_NEIGHBORS.filter((s) => tenantDevIds.includes(s.device_id)))
    }
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
    const allPrepends = [
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
    ]
    if (tenantScope) {
      const devices = readJSON('devices.json', [])
      const tenantDevIds = devices.filter((d) => d.tenant_id === tenantScope).map((d) => d.id)
      return sendJSON(res, 200, allPrepends.filter((p) => tenantDevIds.includes(p.device_id)))
    }
    return sendJSON(res, 200, allPrepends)
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

    const allSections = [
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
    ]

    let filteredSections = allSections
    if (tenantScope) {
      const devices = readJSON('devices.json', [])
      const tenantDevIds = devices.filter((d) => d.tenant_id === tenantScope).map((d) => d.id)
      filteredSections = allSections.filter((s) => tenantDevIds.includes(s.device_id))
    }

    return sendJSON(res, 200, {
      sections: filteredSections,
      other_routes: tenantScope && tenantScope !== 'default-tenant' ? [] : [
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

  // 10. Telemetria e Alertas
  if (pathname === '/api/telemetry/overview') {
    const devices = readJSON('devices.json', [])
    const alerts = readJSON('alerts.json', [])
    return sendJSON(res, 200, {
      total_devices: devices.length,
      online_devices: devices.filter(d => d.status === 'online').length,
      offline_devices: devices.filter(d => d.status === 'offline').length,
      total_bgp_peers: 7,
      established_bgp: 7,
      down_bgp: 0,
      total_prefixes: 2200000,
      total_ospf_neighbors: 3,
      full_ospf: 3,
      down_ospf: 0,
      active_alerts_count: alerts.filter(a => a.status === 'active').length,
      last_updated: new Date().toISOString(),
      recent_snapshots: [],
    })
  }

  if (pathname === '/api/telemetry/status') {
    return sendJSON(res, 200, {
      running: true,
      poll_interval_seconds: 45,
      last_poll_time: new Date().toISOString(),
      next_poll_time: new Date(Date.now() + 45000).toISOString(),
      total_cycles: 42,
      active_alerts_count: 0,
      syslog_port: 1514,
      syslog_active: true,
      bmp_port: 11019,
      bmp_active: true,
      bmp_connected_routers: 2,
      bmp_total_peers: 6,
    })
  }

  if (pathname === '/api/telemetry/collect' && method === 'POST') {
    return sendJSON(res, 200, { message: 'Ciclo de leitura disparado' })
  }

  if (pathname === '/api/telemetry/history') {
    return sendJSON(res, 200, [])
  }

  // 11. BMP Universal Telemetry (RFC 7854) Mock
  if (pathname === '/api/bmp/status') {
    return sendJSON(res, 200, {
      running: true,
      port: 11019,
      connected_routers: 2,
      total_peers_monitored: 6,
      established_peers: 6,
      down_peers: 0,
      total_messages_parsed: 18450,
      total_routes_received: 2201940,
      clients: [
        {
          remote_addr: '45.166.28.254:49152',
          router_ip: '45.166.28.254',
          sys_name: 'BGP',
          sys_descr: 'Huawei Versatile Routing Platform V800R019 (NE8000 F1A)',
          device_id: '7a5d2d4230302c56',
          device_name: 'BGP',
          vendor: 'huawei',
          connected_at: new Date(Date.now() - 3600000).toISOString(),
          messages_received: 9400,
          peers_count: 3,
          last_activity: new Date().toISOString(),
        },
        {
          remote_addr: '45.166.28.249:50123',
          router_ip: '45.166.28.249',
          sys_name: 'BGP2',
          sys_descr: 'Huawei Versatile Routing Platform V800R019 (NE40)',
          device_id: '738398e45a892540',
          device_name: 'BGP2',
          vendor: 'huawei',
          connected_at: new Date(Date.now() - 7200000).toISOString(),
          messages_received: 9050,
          peers_count: 3,
          last_activity: new Date().toISOString(),
        }
      ]
    })
  }

  if (pathname === '/api/bmp/peers') {
    return sendJSON(res, 200, [
      {
        peer_ip: '170.82.183.217',
        remote_as: 266445,
        local_as: 267943,
        router_ip: '45.166.28.254',
        router_name: 'BGP',
        device_id: '7a5d2d4230302c56',
        state: 'Established',
        uptime: '28d 14h',
        pre_policy_prefixes: 1089542,
        post_policy_prefixes: 1089542,
        rejected_prefixes: 0,
        total_announced: 1100200,
        total_withdrawn: 10658,
        last_update: new Date().toISOString(),
      },
      {
        peer_ip: '45.166.28.250',
        remote_as: 262503,
        local_as: 267943,
        router_ip: '45.166.28.249',
        router_name: 'BGP2',
        device_id: '738398e45a892540',
        state: 'Established',
        uptime: '15d 08h',
        pre_policy_prefixes: 980400,
        post_policy_prefixes: 980400,
        rejected_prefixes: 12,
        total_announced: 990100,
        total_withdrawn: 9700,
        last_update: new Date().toISOString(),
      },
      {
        peer_ip: '187.16.218.69',
        remote_as: 26162,
        local_as: 267943,
        router_ip: '45.166.28.249',
        router_name: 'BGP2',
        device_id: '738398e45a892540',
        state: 'Established',
        uptime: '25d 10h',
        pre_policy_prefixes: 95400,
        post_policy_prefixes: 95400,
        rejected_prefixes: 4,
        total_announced: 96000,
        total_withdrawn: 600,
        last_update: new Date().toISOString(),
      },
      {
        peer_ip: '45.184.145.253',
        remote_as: 26162,
        local_as: 267943,
        router_ip: '45.166.28.254',
        router_name: 'BGP',
        device_id: '7a5d2d4230302c56',
        state: 'Established',
        uptime: '35d 02h',
        pre_policy_prefixes: 14210,
        post_policy_prefixes: 14210,
        rejected_prefixes: 0,
        total_announced: 14300,
        total_withdrawn: 90,
        last_update: new Date().toISOString(),
      }
    ])
  }

  if (pathname === '/api/bmp/events') {
    return sendJSON(res, 200, [
      {
        id: 'bmp-ev-1',
        timestamp: new Date().toISOString(),
        router_ip: '45.166.28.254',
        router_name: 'BGP',
        peer_ip: '170.82.183.217',
        remote_as: 266445,
        event_type: 'route_update',
        details: '+12 anúncios, -2 retiradas (AS-Path: [266445 1299], NextHop: 170.82.183.217)'
      },
      {
        id: 'bmp-ev-2',
        timestamp: new Date(Date.now() - 120000).toISOString(),
        router_ip: '45.166.28.249',
        router_name: 'BGP2',
        peer_ip: '187.16.218.69',
        remote_as: 26162,
        event_type: 'route_update',
        details: '+45 anúncios, -5 retiradas (AS-Path: [26162], NextHop: 187.16.218.69)'
      },
      {
        id: 'bmp-ev-3',
        timestamp: new Date(Date.now() - 3600000).toISOString(),
        router_ip: '45.166.28.254',
        router_name: 'BGP',
        peer_ip: '45.184.145.253',
        remote_as: 26162,
        event_type: 'peer_up',
        details: 'Sessão BGP estabelecida com peer 45.184.145.253 (AS 26162) via BMP'
      }
    ])
  }

  if (pathname === '/api/bmp/config-guide') {
    return sendJSON(res, 200, {
      bmp_port: 11019,
      rfc: 'RFC 7854 (BGP Monitoring Protocol)',
      vendors: {
        huawei: {
          title: 'Huawei (NetEngine 8000 / NE40E / VRP8)',
          description: 'Configuração nativa NetEngine 8000 F1A / NE40E (VRP8). Por padrão monitora todos os peers BGP automaticamente.',
          commands: [
            'system-view',
            'bmp',
            ' bmp-session <IP_DO_NETPULSE> alias netpulse',
            '  tcp connect port 11019',
            '  # Opcional se usar loopback como IP de origem:',
            '  # connect-interface LoopBack0',
            '  quit',
            'quit',
            'commit',
            'return'
          ],
          verify_commands: [
            'display bmp session',
            'display bmp session verbose',
            'display tcp status | include 11019'
          ]
        },
        mikrotik_v7: {
          title: 'MikroTik (RouterOS v7)',
          description: 'Suporte nativo a BMP no RouterOS v7 para exportação de sessões e rotas BGP.',
          commands: [
            '/routing/bmp/add name=netpulse address=<IP_DO_NETPULSE> port=11019 enabled=yes',
            '/routing/bmp/monitor/add bmp=netpulse connection=all'
          ],
          verify_commands: [
            '/routing/bmp/print detail'
          ]
        }
      }
    })
  }

  // 11.5 BMP Churn Ranking & Stability Mock
  if (pathname === '/api/bmp/churn/ranking') {
    const now = new Date()
    const timeline = []
    for (let i = 11; i >= 0; i--) {
      timeline.push({
        timestamp: new Date(now.getTime() - i * 5 * 60000).toISOString(),
        withdrawn: Math.floor(Math.random() * 8) + 1,
        announced: Math.floor(Math.random() * 40) + 10,
      })
    }

    return sendJSON(res, 200, {
      last_calculated: now.toISOString(),
      total_withdrawn_1h: 74,
      total_announced_1h: 1680,
      average_stability: 94.1,
      top_churners: [
        {
          peer_ip: '187.16.195.253',
          router_ip: '45.166.28.249',
          router_name: 'BGP2',
          peer_name: 'PTT Belém (IX.br BEL)',
          remote_as: 26162,
          withdrawn_1h: 42,
          announced_1h: 180,
          withdrawn_24h: 310,
          announced_24h: 1420,
          total_flaps: 42,
          stability_score: 83.2,
          status: 'moderate_churn',
          history_1h: timeline,
          last_update: now.toISOString(),
        },
        {
          peer_ip: '45.68.79.253',
          router_ip: '45.166.28.249',
          router_name: 'BGP2',
          peer_name: 'PTT São Paulo (IX.br SP)',
          remote_as: 26162,
          withdrawn_1h: 28,
          announced_1h: 320,
          withdrawn_24h: 195,
          announced_24h: 2300,
          total_flaps: 28,
          stability_score: 88.8,
          status: 'moderate_churn',
          history_1h: timeline,
          last_update: now.toISOString(),
        },
        {
          peer_ip: '170.82.183.217',
          router_ip: '45.166.28.254',
          router_name: 'BGP',
          peer_name: 'SEA Telecom',
          remote_as: 266445,
          withdrawn_1h: 3,
          announced_1h: 450,
          withdrawn_24h: 22,
          announced_24h: 3800,
          total_flaps: 3,
          stability_score: 98.8,
          status: 'stable',
          history_1h: timeline,
          last_update: now.toISOString(),
        },
        {
          peer_ip: '45.181.228.24',
          router_ip: '45.166.28.249',
          router_name: 'BGP2',
          peer_name: 'Wiki Telecom',
          remote_as: 262503,
          withdrawn_1h: 1,
          announced_1h: 510,
          withdrawn_24h: 14,
          announced_24h: 4100,
          total_flaps: 1,
          stability_score: 99.6,
          status: 'stable',
          history_1h: timeline,
          last_update: now.toISOString(),
        },
        {
          peer_ip: '45.184.145.253',
          router_ip: '45.166.28.254',
          router_name: 'BGP',
          peer_name: 'PTT Brasília (IX.br BSB)',
          remote_as: 26162,
          withdrawn_1h: 0,
          announced_1h: 220,
          withdrawn_24h: 8,
          announced_24h: 1900,
          total_flaps: 0,
          stability_score: 100.0,
          status: 'stable',
          history_1h: timeline,
          last_update: now.toISOString(),
        }
      ],
      timeline_aggregate: timeline
    })
  }

  // 11.6 RPKI Validation Endpoints Mock
  if (pathname === '/api/rpki/summary') {
    return sendJSON(res, 200, {
      total_evaluated: 1840,
      valid_count: 1782,
      invalid_count: 3,
      not_found_count: 55,
      valid_percentage: 96.8,
      own_as_protected: true,
      own_prefixes_count: 8,
      last_updated: new Date().toISOString(),
      recent_invalids: [
        {
          prefix: '203.0.113.0/24',
          origin_asn: 64512,
          status: 'invalid',
          reason: 'ROA Inválido: ASN originador 64512 difere do detentor autorizado AS 65530',
          peer_ip: '170.82.183.217',
          router_name: 'BGP',
          as_path: '266445 64512',
          validated_at: new Date().toISOString()
        },
        {
          prefix: '198.51.100.0/24',
          origin_asn: 64520,
          status: 'invalid',
          reason: 'ROA Inválido: máscara /24 excede o max-length autorizado /22',
          peer_ip: '45.181.228.24',
          router_name: 'BGP2',
          as_path: '262503 64520',
          validated_at: new Date().toISOString()
        }
      ]
    })
  }

  if (pathname === '/api/rpki/validate') {
    const prefix = query.prefix || ''
    const asn = parseInt(query.asn || '0', 10)
    let status = 'valid'
    let reason = 'ROA Assinado e Válido no Registro.br / RIR'

    if (prefix.startsWith('45.166.') && asn !== 267943) {
      status = 'invalid'
      reason = 'ROA Inválido (Alerta de Hijack): ASN difere do detentor AS 267943'
    } else if (asn === 64512 || asn === 65001) {
      status = 'invalid'
      reason = 'ROA Inválido: ASN originador não autorizado'
    } else if (asn === 0) {
      status = 'not_found'
      reason = 'Sem ROA registrado no RIR (Not Found)'
    }

    return sendJSON(res, 200, {
      prefix,
      origin_asn: asn,
      status,
      reason,
      matching_roa: status === 'valid' ? {
        prefix,
        max_length: 24,
        asn: asn || 267943,
        trust_anchor: 'Registro.br'
      } : null,
      validated_at: new Date().toISOString()
    })
  }

  if (pathname === '/api/rpki/invalids') {
    return sendJSON(res, 200, [
      {
        prefix: '203.0.113.0/24',
        origin_asn: 64512,
        status: 'invalid',
        reason: 'ROA Inválido: ASN originador 64512 difere do detentor autorizado AS 65530',
        peer_ip: '170.82.183.217',
        router_name: 'BGP',
        as_path: '266445 64512',
        validated_at: new Date().toISOString()
      },
      {
        prefix: '198.51.100.0/24',
        origin_asn: 64520,
        status: 'invalid',
        reason: 'ROA Inválido: máscara /24 excede o max-length autorizado /22',
        peer_ip: '45.181.228.24',
        router_name: 'BGP2',
        as_path: '262503 64520',
        validated_at: new Date().toISOString()
      }
    ])
  }

  // 12. Utilitários de Diagnóstico Mock
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
