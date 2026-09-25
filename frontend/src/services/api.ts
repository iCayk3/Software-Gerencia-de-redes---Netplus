export interface HealthResponse {
  status: string
  version: string
  go_version: string
  uptime: string
  timestamp: string
}

export interface NetworkInterface {
  index: number
  name: string
  hardware_addr: string
  flags: string[]
  mtu: number
  ip_addresses: string[] | null
  is_up: boolean
  is_loopback: boolean
}

export interface PingRequest {
  host: string
  timeout_ms?: number
  port?: number
}

export interface PingResponse {
  host: string
  ip: string
  success: boolean
  latency_ms: number
  message: string
  method: string
}

export interface PortResult {
  port: number
  service: string
  is_open: boolean
  latency_ms: number
}

export interface PortScanResponse {
  host: string
  ip: string
  total_ports: number
  open_ports: number
  duration_ms: number
  results: PortResult[]
}

export interface DNSLookupResponse {
  domain: string
  ips: string[] | null
  cname?: string
  mx?: string[] | null
  txt?: string[] | null
  error?: string
}

// --- Network Equipment & Routing Types ---

export type VendorType = 'huawei' | 'datacom' | 'mikrotik_v6' | 'mikrotik_v7'

export interface Device {
  id: string
  name: string
  host: string
  port: number
  vendor: VendorType
  model?: string
  username: string
  password?: string
  has_password?: boolean
  auth_type: string
  is_bgp?: boolean
  created_at: string
  last_seen?: string
  status: 'online' | 'offline' | 'untested'
}

export interface BGPSession {
  device_id: string
  device_name: string
  peer_ip: string
  remote_as: string
  local_as?: string
  state: string
  uptime: string
  prefixes_received: number
  prefixes_sent?: number
  description?: string
  raw_output?: string
  telemetry_source?: 'bmp' | 'ssh'
  pre_policy_prefixes?: number
  post_policy_prefixes?: number
  rejected_prefixes?: number
  router_id?: string
  last_update?: string
}

export interface OSPFNeighbor {
  device_id: string
  device_name: string
  neighbor_id: string
  ip: string
  interface: string
  area: string
  state: string
  role: string
  dead_time?: string
  raw_output?: string
}

export interface SSHTestResult {
  success: boolean
  latency_ms: number
  banner?: string
  error?: string
}

export interface CommandExecResponse {
  device_id: string
  device_name: string
  command: string
  output: string
  duration_ms: number
  success: boolean
  error?: string
}

export interface StaticRoute {
  id: string
  device_id: string
  device_name: string
  destination: string
  next_hop: string
  interface?: string
  preference?: number
  tag?: string
  description?: string
  status?: string
  raw_output?: string
}

export interface StaticRouteRequest {
  destination: string
  next_hop: string
  preference?: number
  description?: string
}

export interface BGPPeerPrepend {
  id: string
  device_id: string
  device_name: string
  peer_ip: string
  peer_name: string
  remote_as: string
  local_as: string
  prepend_count: number
  policy_name: string
  is_blocked: boolean
  status: string
}

export interface PrefixPrependState {
  id: string
  device_id: string
  device_name: string
  prefix: string
  peer_ip: string
  peer_name: string
  prepend_count: number
  is_blocked: boolean
  community?: string
  policy_name?: string
}

export interface ASPrependGroup {
  id: string
  device_id?: string
  device_name?: string
  remote_as: string
  group_name: string
  community_base: string
  role: string
  peer_count: number
  peer_ips: string[]
  peers: BGPPeerPrepend[]
  prefixes: PrefixPrependState[]
}

export interface DevicePrependOverview {
  device_id: string
  device_name: string
  local_as: string
  peers: BGPPeerPrepend[]
  prefixes: PrefixPrependState[]
  as_groups?: ASPrependGroup[]
}

// --- Telemetry & Alerts Types ---

export type AlertSeverity = 'critical' | 'warning' | 'info'
export type AlertType = 'device_offline' | 'bgp_down' | 'bgp_prefix_drop' | 'ospf_down' | 'syslog_event'

export interface Alert {
  id: string
  device_id: string
  device_name: string
  type: AlertType
  severity: AlertSeverity
  target: string
  message: string
  started_at: string
  resolved_at?: string
  acknowledged: boolean
  status: 'active' | 'acknowledged' | 'resolved'
}

export interface TelemetrySnapshot {
  timestamp: string
  device_id: string
  device_name: string
  online: boolean
  latency_ms: number
  bgp_peer_count: number
  bgp_established: number
  bgp_down: number
  total_prefixes: number
  ospf_neighbor_count: number
  ospf_established: number
  ospf_down: number
}

export interface TelemetryStatus {
  running: boolean
  poll_interval_seconds: number
  last_poll_time?: string
  next_poll_time?: string
  total_cycles: number
  active_alerts_count: number
  syslog_port: number
  syslog_active: boolean
  bmp_port?: number
  bmp_active?: boolean
  bmp_connected_routers?: number
  bmp_total_peers?: number
}

export interface BMPClientInfo {
  remote_addr: string
  router_ip: string
  sys_name?: string
  sys_descr?: string
  device_id?: string
  device_name?: string
  vendor?: string
  connected_at: string
  messages_received: number
  peers_count: number
  last_activity: string
}

export interface BMPStatus {
  running: boolean
  port: number
  connected_routers: number
  total_peers_monitored: number
  established_peers: number
  down_peers: number
  total_messages_parsed: number
  total_routes_received: number
  clients: BMPClientInfo[]
}

export interface BMPPeerState {
  peer_ip: string
  remote_as: number
  local_as: number
  local_addr?: string
  router_id?: string
  router_ip: string
  router_name: string
  device_id?: string
  state: string
  established_at?: string
  down_at?: string
  down_reason?: string
  uptime: string
  pre_policy_prefixes: number
  post_policy_prefixes: number
  rejected_prefixes: number
  total_announced: number
  total_withdrawn: number
  last_update: string
}

export interface BMPEvent {
  id: string
  timestamp: string
  router_ip: string
  router_name: string
  device_id?: string
  peer_ip: string
  remote_as: number
  event_type: 'peer_up' | 'peer_down' | 'route_update' | 'stats_report'
  reason?: string
  details: string
}

export interface BMPConfigGuide {
  bmp_port: number
  rfc: string
  vendors: Record<string, {
    title: string
    description: string
    commands: string[]
    verify_commands: string[]
  }>
}

// --- BGP Churn Telemetry Types (Flapping & Oscillations) ---
export interface ChurnBucket {
  timestamp: string
  withdrawn: number
  announced: number
}

export interface PeerChurnMetrics {
  peer_ip: string
  router_ip: string
  router_name: string
  peer_name: string
  remote_as: number
  withdrawn_1h: number
  announced_1h: number
  withdrawn_24h: number
  announced_24h: number
  total_flaps: number
  stability_score: number // 0 to 100%
  status: 'stable' | 'moderate_churn' | 'high_churn' | 'critical_flapping'
  history_1h?: ChurnBucket[]
  last_flap?: string
  last_update: string
}

export interface ChurnRankingResponse {
  last_calculated: string
  total_withdrawn_1h: number
  total_announced_1h: number
  average_stability: number
  top_churners: PeerChurnMetrics[]
  timeline_aggregate: ChurnBucket[]
}

// --- RPKI Route Origin Authorization (RFC 6811) Types ---
export type RPKIStatusType = 'valid' | 'invalid' | 'not_found'

export interface ROAEntry {
  prefix: string
  max_length: number
  asn: number
  trust_anchor?: string
}

export interface RPKIValidationResult {
  prefix: string
  origin_asn: number
  status: RPKIStatusType
  reason: string
  peer_ip?: string
  router_name?: string
  as_path?: string
  matching_roa?: ROAEntry
  validated_at: string
}

export interface RPKISummary {
  total_evaluated: number
  valid_count: number
  invalid_count: number
  not_found_count: number
  valid_percentage: number
  recent_invalids: RPKIValidationResult[]
  own_as_protected: boolean
  own_prefixes_count: number
  last_updated: string
}

export interface TelemetryOverview {
  total_devices: number
  online_devices: number
  offline_devices: number
  total_bgp_peers: number
  established_bgp: number
  down_bgp: number
  total_prefixes: number
  total_ospf_neighbors: number
  full_ospf: number
  down_ospf: number
  active_alerts_count: number
  last_updated: string
  recent_snapshots?: TelemetrySnapshot[]
}

// --- Authentication & RBAC Types ---

export type UserRole = 'admin' | 'noc_operator' | 'viewer'

export interface UserProfile {
  id: string
  tenant_id: string
  name: string
  email: string
  role: UserRole
  status: string
  created_at: string
  last_login?: string
}

export interface LoginRequest {
  email: string
  password: string
}

export interface LoginResponse {
  token: string
  expires_at: string
  user: UserProfile
}

export interface AuditLog {
  id: string
  tenant_id: string
  timestamp: string
  user_id: string
  user_name: string
  user_email: string
  client_ip: string
  action: string
  target_device_id?: string
  target_device_name?: string
  command_executed: string
  status: string
  metadata?: Record<string, any>
}

export interface AuditFilter {
  device_id?: string
  user_id?: string
  action?: string
  limit?: number
  offset?: number
}

export interface AuditListResponse {
  logs: AuditLog[]
  total: number
  limit: number
  offset: number
}

const API_BASE = '/api'
const AUTH_TOKEN_KEY = 'netpulse_auth_token'

export function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY)
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(AUTH_TOKEN_KEY, token)
  } else {
    localStorage.removeItem(AUTH_TOKEN_KEY)
  }
}

export async function apiFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const token = getStoredToken()
  const headers = new Headers(init.headers || {})
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`)
  }
  return fetch(input, { ...init, headers })
}

// Base & Diagnostic APIs
export async function fetchHealth(): Promise<HealthResponse> {
  const res = await apiFetch(`${API_BASE}/health`)
  if (!res.ok) throw new Error(`Falha no healthcheck: HTTP ${res.status}`)
  return res.json()
}

export async function fetchInterfaces(): Promise<NetworkInterface[]> {
  const res = await apiFetch(`${API_BASE}/network/interfaces`)
  if (!res.ok) throw new Error(`Erro ao buscar interfaces: HTTP ${res.status}`)
  return res.json()
}

export async function sendPing(req: PingRequest): Promise<PingResponse> {
  const res = await apiFetch(`${API_BASE}/network/ping`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) throw new Error(`Erro ao executar ping: HTTP ${res.status}`)
  return res.json()
}

export async function scanPorts(host: string, ports?: number[], timeoutMs?: number): Promise<PortScanResponse> {
  const res = await apiFetch(`${API_BASE}/network/scan-ports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ host, ports, timeout_ms: timeoutMs }),
  })
  if (!res.ok) throw new Error(`Erro no scanner de portas: HTTP ${res.status}`)
  return res.json()
}

export async function lookupDNS(domain: string): Promise<DNSLookupResponse> {
  const res = await apiFetch(`${API_BASE}/network/dns?domain=${encodeURIComponent(domain)}`)
  if (!res.ok) throw new Error(`Erro no lookup DNS: HTTP ${res.status}`)
  return res.json()
}

// Devices APIs
export async function fetchDevices(): Promise<Device[]> {
  const res = await apiFetch(`${API_BASE}/devices`)
  if (!res.ok) throw new Error(`Erro ao buscar equipamentos: HTTP ${res.status}`)
  return res.json()
}

export async function createDevice(device: Partial<Device>): Promise<Device> {
  const res = await apiFetch(`${API_BASE}/devices`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(device),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao cadastrar equipamento: HTTP ${res.status}`)
  }
  return res.json()
}

export async function updateDevice(id: string, device: Partial<Device>): Promise<Device> {
  const res = await apiFetch(`${API_BASE}/devices/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(device),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao atualizar equipamento: HTTP ${res.status}`)
  }
  return res.json()
}

export async function deleteDevice(id: string): Promise<void> {
  const res = await apiFetch(`${API_BASE}/devices/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Erro ao excluir equipamento: HTTP ${res.status}`)
}

export async function testDeviceSSH(id: string): Promise<SSHTestResult> {
  const res = await apiFetch(`${API_BASE}/devices/${encodeURIComponent(id)}/test`, {
    method: 'POST',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao testar SSH: HTTP ${res.status}`)
  }
  return res.json()
}

// Routing APIs (Supports ?fresh=true to bypass telemetry cache)
export async function fetchDeviceBGP(id: string, fresh = false): Promise<BGPSession[]> {
  const url = `${API_BASE}/devices/${encodeURIComponent(id)}/bgp${fresh ? '?fresh=true' : ''}`
  const res = await apiFetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao buscar BGP: HTTP ${res.status}`)
  }
  return res.json()
}

export async function fetchAllBGP(fresh = false): Promise<BGPSession[]> {
  const url = `${API_BASE}/bgp/all${fresh ? '?fresh=true' : ''}`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error(`Erro ao buscar sessões BGP: HTTP ${res.status}`)
  return res.json()
}

export async function fetchDeviceOSPF(id: string, fresh = false): Promise<OSPFNeighbor[]> {
  const url = `${API_BASE}/devices/${encodeURIComponent(id)}/ospf${fresh ? '?fresh=true' : ''}`
  const res = await apiFetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao buscar OSPF: HTTP ${res.status}`)
  }
  return res.json()
}

export async function fetchAllOSPF(fresh = false): Promise<OSPFNeighbor[]> {
  const url = `${API_BASE}/ospf/all${fresh ? '?fresh=true' : ''}`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error(`Erro ao buscar vizinhos OSPF: HTTP ${res.status}`)
  return res.json()
}

export async function execDeviceCommand(id: string, command: string): Promise<CommandExecResponse> {
  const res = await apiFetch(`${API_BASE}/devices/${encodeURIComponent(id)}/exec`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ command }),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao executar comando: HTTP ${res.status}`)
  }
  return res.json()
}

// --- Telemetry & Alerts APIs ---

export async function fetchTelemetryStatus(): Promise<TelemetryStatus> {
  const res = await apiFetch(`${API_BASE}/telemetry/status`)
  if (!res.ok) throw new Error(`Erro ao buscar status de telemetria: HTTP ${res.status}`)
  return res.json()
}

export async function fetchTelemetryOverview(): Promise<TelemetryOverview> {
  const res = await apiFetch(`${API_BASE}/telemetry/overview`)
  if (!res.ok) throw new Error(`Erro ao buscar overview de telemetria: HTTP ${res.status}`)
  return res.json()
}

export async function triggerTelemetryCollect(): Promise<{ message: string }> {
  const res = await apiFetch(`${API_BASE}/telemetry/collect`, { method: 'POST' })
  if (!res.ok) throw new Error(`Erro ao disparar coleta: HTTP ${res.status}`)
  return res.json()
}

export async function fetchTelemetryHistory(limit = 30): Promise<TelemetrySnapshot[]> {
  const res = await apiFetch(`${API_BASE}/telemetry/history?limit=${limit}`)
  if (!res.ok) throw new Error(`Erro ao buscar histórico: HTTP ${res.status}`)
  return res.json()
}

export async function fetchAlerts(status = 'all'): Promise<Alert[]> {
  const res = await apiFetch(`${API_BASE}/alerts?status=${encodeURIComponent(status)}`)
  if (!res.ok) throw new Error(`Erro ao buscar alertas: HTTP ${res.status}`)
  return res.json()
}

export async function acknowledgeAlert(id: string): Promise<Alert> {
  const res = await apiFetch(`${API_BASE}/alerts/${encodeURIComponent(id)}/ack`, { method: 'POST' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao reconhecer alerta: HTTP ${res.status}`)
  }
  return res.json()
}

// --- Universal BMP Telemetry (RFC 7854) APIs ---

export async function fetchBMPStatus(): Promise<BMPStatus> {
  const res = await apiFetch(`${API_BASE}/bmp/status`)
  if (!res.ok) throw new Error(`Erro ao buscar status do BMP: HTTP ${res.status}`)
  return res.json()
}

export async function fetchBMPPeers(): Promise<BMPPeerState[]> {
  const res = await apiFetch(`${API_BASE}/bmp/peers`)
  if (!res.ok) throw new Error(`Erro ao buscar peers BMP: HTTP ${res.status}`)
  return res.json()
}

export async function fetchBMPEvents(limit = 50): Promise<BMPEvent[]> {
  const res = await apiFetch(`${API_BASE}/bmp/events?limit=${limit}`)
  if (!res.ok) throw new Error(`Erro ao buscar eventos BMP: HTTP ${res.status}`)
  return res.json()
}

export async function fetchBMPConfigGuide(): Promise<BMPConfigGuide> {
  const res = await apiFetch(`${API_BASE}/bmp/config-guide`)
  if (!res.ok) throw new Error(`Erro ao buscar guia BMP: HTTP ${res.status}`)
  return res.json()
}

// --- BGP Churn & RPKI Security APIs ---
export async function fetchBGPChurnRanking(): Promise<ChurnRankingResponse> {
  const res = await apiFetch(`${API_BASE}/bmp/churn/ranking`)
  if (!res.ok) throw new Error(`Erro ao buscar ranking de BGP Churn: HTTP ${res.status}`)
  return res.json()
}

export async function fetchRPKISummary(): Promise<RPKISummary> {
  const res = await apiFetch(`${API_BASE}/rpki/summary`)
  if (!res.ok) throw new Error(`Erro ao buscar resumo de RPKI: HTTP ${res.status}`)
  return res.json()
}

export async function validateRPKI(prefix: string, asn: number): Promise<RPKIValidationResult> {
  const res = await apiFetch(`${API_BASE}/rpki/validate?prefix=${encodeURIComponent(prefix)}&asn=${asn}`)
  if (!res.ok) throw new Error(`Erro ao validar prefixo RPKI: HTTP ${res.status}`)
  return res.json()
}

export async function fetchRPKIInvalids(limit = 50): Promise<RPKIValidationResult[]> {
  const res = await apiFetch(`${API_BASE}/rpki/invalids?limit=${limit}`)
  if (!res.ok) throw new Error(`Erro ao buscar rotas inválidas RPKI: HTTP ${res.status}`)
  return res.json()
}

// Static Routes & Traffic Engineering APIs
export async function fetchDeviceStaticRoutes(id: string, fresh = false): Promise<StaticRoute[]> {
  const url = `${API_BASE}/devices/${encodeURIComponent(id)}/routes/static${fresh ? '?fresh=true' : ''}`
  const res = await apiFetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao buscar rotas estáticas: HTTP ${res.status}`)
  }
  return res.json()
}

export async function fetchAllStaticRoutes(fresh = false): Promise<StaticRoute[]> {
  const url = `${API_BASE}/routes/static/all${fresh ? '?fresh=true' : ''}`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error(`Erro ao buscar todas as rotas estáticas: HTTP ${res.status}`)
  return res.json()
}

export interface StaticRouteCommandResult {
  status: string
  message: string
  commands?: string[]
  cli_script?: string
  device_id?: string
  device_name?: string
  device_host?: string
  vendor?: string
}

export async function createStaticRoute(deviceId: string, req: StaticRouteRequest): Promise<StaticRouteCommandResult> {
  const res = await apiFetch(`${API_BASE}/devices/${encodeURIComponent(deviceId)}/routes/static`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao aplicar rota estática: HTTP ${res.status}`)
  }
  return res.json()
}

export async function deleteStaticRoute(deviceId: string, destination: string, nextHop: string): Promise<StaticRouteCommandResult> {
  const url = `${API_BASE}/devices/${encodeURIComponent(deviceId)}/routes/static?destination=${encodeURIComponent(destination)}&next_hop=${encodeURIComponent(nextHop)}`
  const res = await apiFetch(url, { method: 'DELETE' })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao remover rota estática: HTTP ${res.status}`)
  }
  return res.json()
}

export interface TrafficSyncStatus {
  last_sync_time?: string
  next_sync_time?: string
}

export async function fetchTrafficStatus(): Promise<TrafficSyncStatus> {
  const res = await apiFetch(`${API_BASE}/traffic/status`)
  if (!res.ok) throw new Error(`Erro ao buscar status de sincronização: HTTP ${res.status}`)
  return res.json()
}

// BGP AS-Path Prepending (Download Traffic Engineering)
export async function fetchDevicePrepends(deviceId: string, fresh = false): Promise<DevicePrependOverview> {
  const url = `${API_BASE}/devices/${encodeURIComponent(deviceId)}/bgp/prepends${fresh ? '?fresh=true' : ''}`
  const res = await apiFetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao buscar prepends: HTTP ${res.status}`)
  }
  return res.json()
}

export async function fetchAllPrepends(fresh = false): Promise<DevicePrependOverview[]> {
  const url = `${API_BASE}/bgp/prepends/all${fresh ? '?fresh=true' : ''}`
  const res = await apiFetch(url)
  if (!res.ok) throw new Error(`Erro ao buscar prepends de todos os equipamentos: HTTP ${res.status}`)
  return res.json()
}

export interface PrependApplyRequest {
  device_id: string
  peer_ip: string
  prefix?: string
  prepend_count: number
  block?: boolean
}

export interface PrependCommandResult {
  status?: string
  message: string
  commands?: string[]
  cli_script?: string
}

export async function applyPrepend(req: PrependApplyRequest): Promise<PrependCommandResult> {
  const res = await apiFetch(`${API_BASE}/traffic/download/prepend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao aplicar prepend: HTTP ${res.status}`)
  }
  return res.json()
}

// AS Metadata & Intelligent Traffic Engineering Upload Sections
export interface ASMetadata {
  asn: string
  alias: string
  image_url?: string
  description?: string
  role?: 'transit_primary' | 'transit_secondary' | 'ix_ptt' | 'peering' | 'other' | string
  color?: string
  custom_gateway?: string
  updated_at?: string
}

export interface BGPASSection {
  id: string
  device_id: string
  device_name: string
  device_host: string
  device_vendor: string
  remote_as: string
  local_as: string
  peer_ip: string
  peer_name: string
  bgp_state: string
  uptime: string
  prefixes_received: number
  local_pref?: number
  import_policy?: string
  import_policy_node?: number
  metadata: ASMetadata
  static_routes: StaticRoute[]
}

export interface UploadOverviewResponse {
  sections: BGPASSection[]
  other_routes: StaticRoute[]
  last_sync_time?: string
}

export interface LocalPrefApplyRequest {
  device_id: string
  peer_ip: string
  remote_as: string
  local_pref: number
  policy_name?: string
  node?: number
}

export function sanitizeText(text: string | null | undefined): string {
  if (!text) return ''
  return text
    .replace(/Tr\ufffdnsito/gi, 'Trânsito')
    .replace(/Secund\ufffdrio/gi, 'Secundário')
    .replace(/Tr\ufffdfego/gi, 'Tráfego')
    .replace(/Padr\ufffdo/gi, 'Padrão')
    .replace(/Conex\ufffdo/gi, 'Conexão')
    .replace(/Sess\ufffdo/gi, 'Sessão')
    .replace(/Sess\ufffdes/gi, 'Sessões')
    .replace(/\ufffd/g, '')
}

export async function fetchUploadOverview(deviceId = 'all', fresh = false): Promise<UploadOverviewResponse> {
  const url = `${API_BASE}/traffic/upload/overview?device_id=${encodeURIComponent(deviceId)}${fresh ? '&fresh=true' : ''}`
  const res = await apiFetch(url)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao buscar visão geral de upload: HTTP ${res.status}`)
  }
  const data: UploadOverviewResponse = await res.json()
  if (data?.sections) {
    data.sections.forEach((sec) => {
      if (sec.metadata?.alias) sec.metadata.alias = sanitizeText(sec.metadata.alias)
      if (sec.metadata?.description) sec.metadata.description = sanitizeText(sec.metadata.description)
    })
  }
  return data
}

export interface LocalPrefCommandResult {
  status?: string
  message: string
  peer_ip?: string
  local_pref?: number
  commands?: string[]
  cli_script?: string
}

export async function applyLocalPreference(req: LocalPrefApplyRequest): Promise<LocalPrefCommandResult> {
  const res = await apiFetch(`${API_BASE}/traffic/upload/local-pref`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao aplicar Local-Preference: HTTP ${res.status}`)
  }
  return res.json()
}

export async function fetchASMetadata(): Promise<Record<string, ASMetadata>> {
  const res = await apiFetch(`${API_BASE}/traffic/as-metadata`)
  if (!res.ok) throw new Error(`Erro ao buscar metadados de AS: HTTP ${res.status}`)
  const data = await res.json()
  if (data && typeof data === 'object') {
    Object.values(data).forEach((m: any) => {
      if (m?.alias) m.alias = sanitizeText(m.alias)
      if (m?.description) m.description = sanitizeText(m.description)
    })
  }
  return data
}

export async function updateASMetadata(meta: Partial<ASMetadata> & { asn: string }): Promise<{ message: string; metadata: ASMetadata }> {
  const res = await apiFetch(`${API_BASE}/traffic/as-metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao atualizar metadados do AS: HTTP ${res.status}`)
  }
  return res.json()
}

export interface PeerMetadata {
  key?: string
  device_id?: string
  peer_ip: string
  remote_as?: string
  description: string
  updated_at?: string
}

export async function fetchPeerMetadata(): Promise<Record<string, PeerMetadata>> {
  try {
    const res = await apiFetch(`${API_BASE}/traffic/peer-metadata`)
    if (!res.ok) return {}
    const data = await res.json()
    if (data && typeof data === 'object') {
      Object.values(data).forEach((m: any) => {
        if (m?.description) m.description = sanitizeText(m.description)
      })
    }
    return data || {}
  } catch {
    return {}
  }
}

export async function updatePeerMetadata(meta: { device_id?: string; peer_ip: string; remote_as?: string; description: string }): Promise<{ message: string; metadata: PeerMetadata }> {
  const res = await apiFetch(`${API_BASE}/traffic/peer-metadata`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(meta),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao atualizar descrição da sessão: HTTP ${res.status}`)
  }
  return res.json()
}

export async function uploadASImage(asn: string, file: File): Promise<{ message: string; image_url: string; asn: string }> {
  const formData = new FormData()
  formData.append('asn', asn)
  formData.append('image', file)

  const res = await apiFetch(`${API_BASE}/traffic/as-metadata/upload-image`, {
    method: 'POST',
    body: formData,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao enviar imagem do AS: HTTP ${res.status}`)
  }
  return res.json()
}

// --- Auth & Session APIs ---

export async function loginUser(req: LoginRequest): Promise<LoginResponse> {
  const res = await apiFetch(`${API_BASE}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro de autenticação: HTTP ${res.status}`)
  }
  const data: LoginResponse = await res.json()
  setStoredToken(data.token)
  return data
}

export async function fetchMe(): Promise<UserProfile> {
  const res = await apiFetch(`${API_BASE}/auth/me`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Não autenticado: HTTP ${res.status}`)
  }
  return res.json()
}

export async function fetchUsers(): Promise<UserProfile[]> {
  const res = await apiFetch(`${API_BASE}/auth/users`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao listar usuários: HTTP ${res.status}`)
  }
  return res.json()
}

// --- Audit Trail APIs ---

export async function fetchAuditLogs(filter?: AuditFilter): Promise<AuditListResponse> {
  const params = new URLSearchParams()
  if (filter?.device_id) params.set('device_id', filter.device_id)
  if (filter?.user_id) params.set('user_id', filter.user_id)
  if (filter?.action) params.set('action', filter.action)
  if (filter?.limit) params.set('limit', String(filter.limit))
  if (filter?.offset) params.set('offset', String(filter.offset))

  const queryString = params.toString() ? `?${params.toString()}` : ''
  const res = await apiFetch(`${API_BASE}/audit/logs${queryString}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao consultar logs de auditoria: HTTP ${res.status}`)
  }
  return res.json()
}

// --- Traffic Engineering Profiles & Presets ---

export type ProfileTag = 'normal' | 'contingency' | 'maintenance' | 'peak' | 'custom'

export interface ProfilePrependRule {
  device_id: string
  remote_as: string
  group_name: string
  prefix?: string
  prepend_count: number
  block: boolean
}

export interface ProfileLocalPrefRule {
  device_id: string
  device_name?: string
  remote_as: string
  peer_ip: string
  peer_name?: string
  local_pref: number
  policy_name?: string
  policy_node?: number
}

export interface ProfileRouteRule {
  device_id: string
  device_name?: string
  destination: string
  next_hop: string
  preference: number
  description: string
}

export interface TrafficProfile {
  id: string
  tenant_id?: string
  name: string
  description: string
  tag: ProfileTag
  color: string
  is_active: boolean
  is_default: boolean
  created_at: string
  updated_at: string
  prepends: ProfilePrependRule[]
  local_prefs: ProfileLocalPrefRule[]
  routes: ProfileRouteRule[]
}

export interface PrependDiff {
  device_id: string
  group_name: string
  remote_as: string
  prefix: string
  current_count: number
  target_count: number
  current_block: boolean
  target_block: boolean
  changed: boolean
}

export interface LocalPrefDiff {
  device_id: string
  peer_ip: string
  peer_name: string
  remote_as: string
  current_pref: number
  target_pref: number
  changed: boolean
}

export interface RouteDiff {
  device_id: string
  destination: string
  next_hop: string
  preference: number
  action: 'ADD' | 'DELETE' | 'KEEP'
}

export interface ProfileDiffSummary {
  profile_id: string
  profile_name: string
  total_changes: number
  prepends_diff: PrependDiff[]
  local_prefs_diff: LocalPrefDiff[]
  routes_diff: RouteDiff[]
}

export interface ProfileDiffResponse {
  profile: TrafficProfile
  diff: ProfileDiffSummary
  scripts_by_device: Record<string, string>
  commands_by_device: Record<string, string[]>
}

export interface ApplyProfileResult {
  profile_id: string
  profile_name: string
  status: 'SUCCESS' | 'MANUAL_DISPATCH' | 'FAILED'
  executed: boolean
  message: string
  diff_summary?: ProfileDiffSummary
  scripts_by_device: Record<string, string>
  commands_by_device: Record<string, string[]>
}

export async function fetchTrafficProfiles(): Promise<TrafficProfile[]> {
  const res = await apiFetch(`${API_BASE}/traffic/profiles`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao consultar perfis: HTTP ${res.status}`)
  }
  return res.json()
}

export async function fetchTrafficProfile(id: string): Promise<TrafficProfile> {
  const res = await apiFetch(`${API_BASE}/traffic/profiles/${encodeURIComponent(id)}`)
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao consultar perfil: HTTP ${res.status}`)
  }
  return res.json()
}

export async function createTrafficProfile(profile: Partial<TrafficProfile>): Promise<TrafficProfile> {
  const res = await apiFetch(`${API_BASE}/traffic/profiles`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao criar perfil: HTTP ${res.status}`)
  }
  return res.json()
}

export async function updateTrafficProfile(id: string, profile: Partial<TrafficProfile>): Promise<TrafficProfile> {
  const res = await apiFetch(`${API_BASE}/traffic/profiles/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(profile),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao atualizar perfil: HTTP ${res.status}`)
  }
  return res.json()
}

export async function deleteTrafficProfile(id: string): Promise<{ message: string }> {
  const res = await apiFetch(`${API_BASE}/traffic/profiles/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao excluir perfil: HTTP ${res.status}`)
  }
  return res.json()
}

export async function captureCurrentProfile(req: {
  name: string
  description?: string
  tag?: ProfileTag
  color?: string
}): Promise<TrafficProfile> {
  const res = await apiFetch(`${API_BASE}/traffic/profiles/capture`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(req),
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao capturar estado atual: HTTP ${res.status}`)
  }
  return res.json()
}

export async function diffTrafficProfile(id: string): Promise<ProfileDiffResponse> {
  const res = await apiFetch(`${API_BASE}/traffic/profiles/${encodeURIComponent(id)}/diff`, {
    method: 'POST',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao calcular diferenças do perfil: HTTP ${res.status}`)
  }
  return res.json()
}

export async function applyTrafficProfile(id: string): Promise<ApplyProfileResult> {
  const res = await apiFetch(`${API_BASE}/traffic/profiles/${encodeURIComponent(id)}/apply`, {
    method: 'POST',
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    throw new Error(err.error || `Erro ao ativar perfil: HTTP ${res.status}`)
  }
  return res.json()
}

