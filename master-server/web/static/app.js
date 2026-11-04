let authToken = localStorage.getItem('master_token') || ''
let allLicenses = []

document.addEventListener('DOMContentLoaded', () => {
  if (window.lucide) lucide.createIcons()

  const loginForm = document.getElementById('login-form')
  if (loginForm) {
    loginForm.addEventListener('submit', handleLogin)
  }

  if (authToken) {
    showDashboard()
    loadDashboardData()
  } else {
    showLogin()
  }

  // Auto-refresh every 30s
  setInterval(() => {
    if (authToken && !document.hidden) {
      loadDashboardData(true)
    }
  }, 30000)
})

function showLogin() {
  document.getElementById('login-section').classList.remove('hidden')
  document.getElementById('dashboard-section').classList.add('hidden')
}

function showDashboard() {
  document.getElementById('login-section').classList.add('hidden')
  document.getElementById('dashboard-section').classList.remove('hidden')
}

async function handleLogin(e) {
  e.preventDefault()
  const passwordInput = document.getElementById('password-input')
  const errorBox = document.getElementById('login-error')
  const errorMsg = document.getElementById('login-error-msg')
  const submitBtn = document.getElementById('login-btn')

  errorBox.classList.add('hidden')
  submitBtn.disabled = true
  submitBtn.innerHTML = 'Verificando...'

  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: passwordInput.value }),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao autenticar')
    }

    authToken = data.token
    localStorage.setItem('master_token', authToken)
    showDashboard()
    loadDashboardData()
  } catch (err) {
    errorBox.classList.remove('hidden')
    errorMsg.textContent = err.message
  } finally {
    submitBtn.disabled = false
    submitBtn.innerHTML = '<i data-lucide="lock" class="h-4 w-4"></i><span>Entrar no Painel Master</span>'
    if (window.lucide) lucide.createIcons()
  }
}

function logout() {
  authToken = ''
  localStorage.removeItem('master_token')
  showLogin()
}

async function apiFetch(url, options = {}) {
  options.headers = {
    ...options.headers,
    'Authorization': `Bearer ${authToken}`,
  }
  const res = await fetch(url, options)
  if (res.status === 401) {
    logout()
    throw new Error('Sessão expirada. Faça login novamente.')
  }
  return res
}

async function loadDashboardData(silent = false) {
  const refreshIcon = document.getElementById('refresh-icon')
  if (!silent && refreshIcon) refreshIcon.classList.add('animate-spin')

  try {
    const [overviewRes, licensesRes] = await Promise.all([
      apiFetch('/api/admin/fleet/overview'),
      apiFetch('/api/admin/licenses'),
    ])

    if (overviewRes.ok) {
      const overview = await overviewRes.json()
      document.getElementById('stat-total-clients').textContent = overview.total_clients || 0
      document.getElementById('stat-online-instances').textContent = overview.online_instances || 0
      document.getElementById('stat-total-devices').textContent = overview.total_monitored_devices || 0
      document.getElementById('stat-expiring-soon').textContent = overview.expiring_soon_count || 0
    }

    if (licensesRes.ok) {
      allLicenses = await licensesRes.json()
      renderLicensesTable(allLicenses)
    }
  } catch (err) {
    console.error('Erro ao carregar dados:', err)
  } finally {
    if (!silent && refreshIcon) refreshIcon.classList.remove('animate-spin')
  }
}

function renderLicensesTable(licenses) {
  const tbody = document.getElementById('licenses-tbody')
  const emptyState = document.getElementById('empty-state')
  tbody.innerHTML = ''

  if (!licenses || licenses.length === 0) {
    emptyState.classList.remove('hidden')
    return
  }
  emptyState.classList.add('hidden')

  licenses.forEach((lic) => {
    const tr = document.createElement('tr')
    tr.className = 'hover:bg-slate-800/40 transition'

    const isOnline = lic.last_heartbeat && (new Date() - new Date(lic.last_heartbeat)) < 45 * 60 * 1000
    const expiresDate = new Date(lic.expires_at)
    const daysRemaining = Math.max(0, Math.round((expiresDate - new Date()) / (1000 * 60 * 60 * 24)))

    tr.innerHTML = `
      <td class="py-3 px-4">
        <div class="font-bold text-white text-sm">${escapeHtml(lic.client_name)}</div>
        <div class="text-[11px] text-slate-400">${escapeHtml(lic.client_email || 'Sem e-mail cadastrado')}</div>
        ${lic.last_hostname ? `<div class="text-[10px] text-slate-500 font-mono mt-0.5">Host: ${escapeHtml(lic.last_hostname)} (${escapeHtml(lic.last_remote_ip || 'IP N/D')})</div>` : ''}
      </td>
      <td class="py-3 px-4">
        ${getTierBadge(lic.tier)}
      </td>
      <td class="py-3 px-4">
        <div class="flex items-center gap-1.5 font-mono text-[11px] text-cyan-300 bg-slate-950 px-2 py-1 rounded border border-slate-800 w-fit">
          <span>${escapeHtml(lic.key)}</span>
          <button onclick="copyToClipboard('${lic.key}')" title="Copiar Chave" class="text-slate-400 hover:text-white ml-1">
            <i data-lucide="copy" class="h-3 w-3"></i>
          </button>
        </div>
      </td>
      <td class="py-3 px-4 text-center">
        <div class="font-extrabold text-sm ${lic.last_device_count > 0 ? 'text-white' : 'text-slate-500'}">
          ${lic.last_device_count} <span class="text-slate-500 font-normal">/ ${lic.max_devices === 0 ? '∞' : lic.max_devices}</span>
        </div>
        <div class="text-[10px] text-slate-400">${lic.max_devices === 0 ? 'Ilimitado' : 'Máx permitidos'}</div>
      </td>
      <td class="py-3 px-4">
        <div class="flex items-center gap-1.5">
          <span class="h-2 w-2 rounded-full ${isOnline ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'}"></span>
          <span class="font-semibold ${isOnline ? 'text-emerald-400' : 'text-slate-400'}">
            ${isOnline ? 'Online' : 'Offline'}
          </span>
          ${getStatusTag(lic.status)}
        </div>
        <div class="text-[10px] text-slate-400 mt-1">
          ${lic.last_heartbeat ? `Sinal há ${timeAgo(new Date(lic.last_heartbeat))}` : 'Aguardando primeiro sinal'}
        </div>
      </td>
      <td class="py-3 px-4">
        <div class="font-semibold text-slate-200">${daysRemaining} dias restantes</div>
        <div class="text-[10px] text-slate-400">${expiresDate.toLocaleDateString('pt-BR')}</div>
      </td>
      <td class="py-3 px-4 text-right">
        <div class="flex items-center justify-end gap-1.5">
          <button
            onclick="quickRenew('${lic.id}', 365)"
            class="px-2 py-1 bg-emerald-950/60 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-800 rounded-lg text-[11px] font-semibold transition"
            title="Renovar por +1 Ano"
          >
            +1 Ano
          </button>
          <button
            onclick="quickRenew('${lic.id}', 30)"
            class="px-2 py-1 bg-blue-950/60 hover:bg-blue-900/60 text-blue-300 border border-blue-800 rounded-lg text-[11px] font-semibold transition"
            title="Renovar por +30 Dias"
          >
            +30d
          </button>
          <button
            onclick="toggleStatus('${lic.id}', '${lic.status}')"
            class="px-2 py-1 ${lic.status === 'suspended' ? 'bg-emerald-950 text-emerald-300 border-emerald-800' : 'bg-amber-950 text-amber-300 border-amber-800'} border rounded-lg text-[11px] font-semibold transition"
            title="${lic.status === 'suspended' ? 'Reativar Licença' : 'Suspender/Bloquear'}"
          >
            ${lic.status === 'suspended' ? 'Reativar' : 'Suspender'}
          </button>
          <button
            onclick="deleteLicense('${lic.id}', '${escapeHtml(lic.client_name)}')"
            class="p-1 text-slate-500 hover:text-rose-400 rounded-lg transition"
            title="Excluir Licença"
          >
            <i data-lucide="trash-2" class="h-3.5 w-3.5"></i>
          </button>
        </div>
      </td>
    `
    tbody.appendChild(tr)
  })

  if (window.lucide) lucide.createIcons()
}

function getTierBadge(tier) {
  switch (tier) {
    case 'enterprise':
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-purple-950 text-purple-300 border border-purple-800">Enterprise</span>`
    case 'pro':
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-cyan-950 text-cyan-300 border border-cyan-800">Pro ISP</span>`
    case 'starter':
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-blue-950 text-blue-300 border border-blue-800">Starter</span>`
    default:
      return `<span class="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-950 text-amber-300 border border-amber-800">Trial</span>`
  }
}

function getStatusTag(status) {
  switch (status) {
    case 'active':
      return `<span class="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-400 border border-emerald-800 ml-1">Ativa</span>`
    case 'grace_period':
      return `<span class="text-[9px] px-1.5 py-0.2 rounded bg-amber-950 text-amber-400 border border-amber-800 ml-1">Graça</span>`
    case 'suspended':
      return `<span class="text-[9px] px-1.5 py-0.2 rounded bg-rose-950 text-rose-400 border border-rose-800 ml-1 font-bold">Suspensa</span>`
    default:
      return `<span class="text-[9px] px-1.5 py-0.2 rounded bg-slate-800 text-slate-400 border border-slate-700 ml-1">${status}</span>`
  }
}

function filterTable() {
  const query = document.getElementById('search-input').value.toLowerCase().trim()
  const statusFilter = document.getElementById('status-filter').value

  const filtered = allLicenses.filter((lic) => {
    const isOnline = lic.last_heartbeat && (new Date() - new Date(lic.last_heartbeat)) < 45 * 60 * 1000

    let matchesStatus = true
    if (statusFilter === 'online') matchesStatus = isOnline
    else if (statusFilter !== 'all') matchesStatus = (lic.status === statusFilter)

    let matchesQuery = true
    if (query) {
      matchesQuery = (lic.client_name && lic.client_name.toLowerCase().includes(query)) ||
                     (lic.key && lic.key.toLowerCase().includes(query)) ||
                     (lic.client_email && lic.client_email.toLowerCase().includes(query)) ||
                     (lic.last_hostname && lic.last_hostname.toLowerCase().includes(query)) ||
                     (lic.last_remote_ip && lic.last_remote_ip.toLowerCase().includes(query))
    }

    return matchesStatus && matchesQuery
  })

  renderLicensesTable(filtered)
}

function openCreateModal() {
  document.getElementById('modal-title').textContent = 'Emitir Nova Licença'
  document.getElementById('form-license-id').value = ''
  document.getElementById('form-client-name').value = ''
  document.getElementById('form-client-email').value = ''
  document.getElementById('form-tier').value = 'pro'
  document.getElementById('form-max-devices').value = '10'
  document.getElementById('form-valid-days').value = '365'
  document.getElementById('form-notes').value = ''
  document.getElementById('modal-error').classList.add('hidden')
  document.getElementById('license-modal').classList.remove('hidden')
}

function closeModal() {
  document.getElementById('license-modal').classList.add('hidden')
}

async function handleSaveLicense(e) {
  e.preventDefault()
  const id = document.getElementById('form-license-id').value
  const clientName = document.getElementById('form-client-name').value.trim()
  const clientEmail = document.getElementById('form-client-email').value.trim()
  const tier = document.getElementById('form-tier').value
  const maxDevices = parseInt(document.getElementById('form-max-devices').value, 10) || 0
  const validDays = parseInt(document.getElementById('form-valid-days').value, 10) || 365
  const notes = document.getElementById('form-notes').value.trim()
  const errorBox = document.getElementById('modal-error')
  const submitBtn = document.getElementById('modal-submit-btn')

  submitBtn.disabled = true
  submitBtn.textContent = 'Gravando...'
  errorBox.classList.add('hidden')

  try {
    const payload = {
      client_name: clientName,
      client_email: clientEmail,
      tier,
      max_devices: maxDevices,
      valid_days: validDays,
      notes,
    }

    const res = await apiFetch('/api/admin/licenses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    const data = await res.json()
    if (!res.ok) {
      throw new Error(data.error || 'Falha ao emitir licença')
    }

    closeModal()
    loadDashboardData()
    copyToClipboard(data.key)
    alert(`Licença emitida com sucesso!\n\nChave gerada:\n${data.key}\n\nA chave foi copiada para sua área de transferência. Envie para o cliente ativar em "Licença & Sistema".`)
  } catch (err) {
    errorBox.classList.remove('hidden')
    errorBox.textContent = err.message
  } finally {
    submitBtn.disabled = false
    submitBtn.textContent = 'Emitir Licença'
  }
}

async function quickRenew(id, days) {
  if (!confirm(`Deseja prorrogar a vigência desta licença por +${days} dias?`)) return
  try {
    const res = await apiFetch(`/api/admin/licenses/${encodeURIComponent(id)}/renew`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ days }),
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Falha ao renovar')
    }
    loadDashboardData(true)
  } catch (err) {
    alert(err.message)
  }
}

async function toggleStatus(id, currentStatus) {
  const action = currentStatus === 'suspended' ? 'reativar' : 'suspender'
  if (!confirm(`Tem certeza que deseja ${action} esta licença?`)) return

  try {
    const res = await apiFetch(`/api/admin/licenses/${encodeURIComponent(id)}/toggle-status`, {
      method: 'POST',
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Falha ao alterar status')
    }
    loadDashboardData(true)
  } catch (err) {
    alert(err.message)
  }
}

async function deleteLicense(id, name) {
  if (!confirm(`ATENÇÃO: Deseja realmente excluir a licença do cliente "${name}"? Essa ação não pode ser desfeita.`)) return

  try {
    const res = await apiFetch(`/api/admin/licenses/${encodeURIComponent(id)}`, {
      method: 'DELETE',
    })
    if (!res.ok) {
      const data = await res.json()
      throw new Error(data.error || 'Falha ao excluir')
    }
    loadDashboardData(true)
  } catch (err) {
    alert(err.message)
  }
}

function copyToClipboard(text) {
  navigator.clipboard.writeText(text).then(() => {
    // Show mini visual toast
    const toast = document.createElement('div')
    toast.className = 'fixed bottom-5 right-5 bg-cyan-600 text-white text-xs px-4 py-2.5 rounded-xl shadow-2xl z-50 animate-in fade-in'
    toast.textContent = 'Chave copiada para a área de transferência!'
    document.body.appendChild(toast)
    setTimeout(() => toast.remove(), 2500)
  })
}

function timeAgo(date) {
  const seconds = Math.floor((new Date() - date) / 1000)
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}m`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  return `${days}d`
}

function escapeHtml(text) {
  if (!text) return ''
  const div = document.createElement('div')
  div.textContent = text
  return div.innerHTML
}
