import { storageDelete, storageGet, storageSet } from './storage';

// Mesmo backend Railway usado pela web (frontend/public/_redirects)
export const API_BASE = 'https://ponto-eletronico-production-a838.up.railway.app/api';

const TOKEN_KEY   = 'ponto_token';
const USUARIO_KEY = 'ponto_usuario';

export async function getToken(): Promise<string | null> {
  return storageGet(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await storageSet(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await storageDelete(TOKEN_KEY);
  await storageDelete(USUARIO_KEY);
}

export async function setUsuario(user: unknown): Promise<void> {
  await storageSet(USUARIO_KEY, JSON.stringify(user));
}

export async function getUsuario<T = any>(): Promise<T | null> {
  const raw = await storageGet(USUARIO_KEY);
  try { return raw ? JSON.parse(raw) : null; } catch { return null; }
}

export class ApiError extends Error {
  status: number;
  data: any;
  constructor(status: number, data: any) {
    super(data?.erro || 'Erro na requisição');
    this.status = status;
    this.data = data;
  }
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function request(method: Method, path: string, body: any = null, params?: Record<string, any>) {
  const token = await getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  let url = path.startsWith('http') ? path : `${API_BASE}${path}`;
  if (params) {
    const qs = new URLSearchParams(params as any).toString();
    if (qs) url += '?' + qs;
  }

  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, { erro: 'Erro de conexão com o servidor.' });
  }

  const ct = res.headers.get('content-type') || '';
  const data = ct.includes('application/json') ? await res.json() : null;

  if (!res.ok) throw new ApiError(res.status, data || { erro: 'Erro na requisição.' });
  return data;
}

export const API = {
  get:    (path: string, params?: Record<string, any>) => request('GET', path, null, params),
  post:   (path: string, body?: any) => request('POST', path, body),
  put:    (path: string, body?: any) => request('PUT', path, body),
  patch:  (path: string, body?: any) => request('PATCH', path, body),
  delete: (path: string) => request('DELETE', path),

  // Upload multipart (foto, etc.) — usa FormData
  upload: async (path: string, formData: FormData) => {
    const token = await getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;

    let res: Response;
    try {
      res = await fetch(`${API_BASE}${path}`, { method: 'POST', headers, body: formData as any });
    } catch (err: any) {
      throw new ApiError(0, { erro: `Erro de conexão no upload: ${err?.message || String(err)}` });
    }

    const ct = res.headers.get('content-type') || '';
    let data: any = null;
    try { data = ct.includes('application/json') ? await res.json() : null; } catch { /* corpo vazio/ inválido */ }
    if (!res.ok) throw new ApiError(res.status, data || { erro: `Erro no upload (HTTP ${res.status}).` });
    return data;
  },
};
