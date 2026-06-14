/* ============================================================
   API Client - Centraliza todas as requisições ao backend
   ============================================================ */

const API_BASE = '/api';

function getToken() {
  return localStorage.getItem('token') || sessionStorage.getItem('token');
}

function setToken(token, lembrar = false) {
  if (lembrar) localStorage.setItem('token', token);
  else sessionStorage.setItem('token', token);
}

function clearToken() {
  localStorage.removeItem('token');
  sessionStorage.removeItem('token');
  localStorage.removeItem('usuario');
  sessionStorage.removeItem('usuario');
}

function setUsuario(user, lembrar = false) {
  const storage = lembrar ? localStorage : sessionStorage;
  storage.setItem('usuario', JSON.stringify(user));
}

function getUsuario() {
  const raw = localStorage.getItem('usuario') || sessionStorage.getItem('usuario');
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

async function request(method, path, body = null, options = {}) {
  const token = getToken();

  const headers = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const config = { method, headers };
  if (body) config.body = JSON.stringify(body);

  let url = path.startsWith('/api') ? path : `${API_BASE}${path}`;

  // Append query params if passed
  if (options.params) {
    const qs = new URLSearchParams(options.params).toString();
    if (qs) url += '?' + qs;
  }

  try {
    const res = await fetch(url, config);

    if (res.status === 401) {
      clearToken();
      window.location.href = '/index.html';
      return;
    }

    // Empresa suspensa → redireciona para página de bloqueio
    if (res.status === 403) {
      const ct2 = res.headers.get('content-type') || '';
      if (ct2.includes('application/json')) {
        const errData = await res.json();
        if (errData.code === 'COMPANY_SUSPENDED') {
          clearToken();
          window.location.href = '/empresa-suspensa.html';
          return;
        }
        throw { status: 403, data: errData };
      }
    }

    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) {
      const data = await res.json();
      if (!res.ok) throw { status: res.status, data };
      return data;
    }

    if (!res.ok) throw { status: res.status, data: { erro: 'Erro na requisição' } };
    return res;
  } catch (err) {
    if (err.status) throw err;
    throw { status: 0, data: { erro: 'Erro de conexão com o servidor.' } };
  }
}

const API = {
  get:    (path, params) => request('GET',    path, null, { params }),
  post:   (path, body)   => request('POST',   path, body),
  put:    (path, body)   => request('PUT',    path, body),
  patch:  (path, body)   => request('PATCH',  path, body),
  delete: (path)         => request('DELETE', path),

  // Raw fetch for blob responses (PDF/Excel)
  download: async (path, params = {}) => {
    const token = getToken();
    const qs = new URLSearchParams(params).toString();
    const url = `${API_BASE}${path}${qs ? '?' + qs : ''}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) throw { status: res.status, data: { erro: 'Erro ao baixar arquivo.' } };
    return res;
  },
};

// ── Auth helpers ────────────────────────────────────────────

function requireAuth() {
  if (!getToken()) {
    window.location.href = '/index.html';
    return false;
  }
  return true;
}

function hasPermission(perm) {
  const user = getUsuario();
  if (!user || !user.permissoes) return false;
  return user.permissoes.includes(perm);
}

function isAdmin() {
  const user = getUsuario();
  return user && user.cargo_nivel === 1;
}

function isSupervisor() {
  const user = getUsuario();
  return user && user.cargo_nivel <= 2;
}

function isSuperAdmin() {
  const user = getUsuario();
  return user && user.role === 'super_admin';
}

window.API   = API;
window.Auth  = { getToken, setToken, clearToken, setUsuario, getUsuario, requireAuth, hasPermission, isAdmin, isSupervisor, isSuperAdmin };
