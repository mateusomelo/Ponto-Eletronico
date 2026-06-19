import React, { createContext, useContext, useEffect, useState } from 'react';
import { API, ApiError, clearToken, getToken, getUsuario, setToken, setUsuario } from '../api/client';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  foto: string | null;
  cargo_id: number;
  cargo_nome: string;
  cargo_nivel: number;
  role: 'super_admin' | 'company_admin' | 'employee';
  company_id: number | null;
  permissoes?: string[];
  company_status?: string | null;
  company_nome?: string | null;
}

interface AuthContextValue {
  usuario: Usuario | null;
  carregando: boolean;
  login: (email: string, senha: string, lembrar?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  hasPermission: (perm: string) => boolean;
  isAdmin: () => boolean;
  isSupervisor: () => boolean;
  isSuperAdmin: () => boolean;
  refreshUsuario: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuarioState] = useState<Usuario | null>(null);
  const [carregando, setCarregando] = useState(true);

  async function carregarSessao() {
    const token = await getToken();
    if (!token) { setCarregando(false); return; }
    try {
      const me = await API.get('/auth/me');
      setUsuarioState(me);
      await setUsuario(me);
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await clearToken();
        setUsuarioState(null);
      } else {
        // Sem conexão: usa o último usuário salvo localmente
        const cached = await getUsuario<Usuario>();
        if (cached) setUsuarioState(cached);
      }
    } finally {
      setCarregando(false);
    }
  }

  useEffect(() => { carregarSessao(); }, []);

  async function login(email: string, senha: string, lembrar = true) {
    const data = await API.post('/auth/login', { email, senha, lembrar });
    await setToken(data.token);
    await setUsuario(data.usuario);
    setUsuarioState(data.usuario);
    // Busca permissões completas
    await carregarSessao();
  }

  async function logout() {
    try { await API.post('/auth/logout'); } catch { /* ignora falha de rede no logout */ }
    await clearToken();
    setUsuarioState(null);
  }

  function hasPermission(perm: string) {
    return !!usuario?.permissoes?.includes(perm);
  }
  function isAdmin()      { return !!usuario && usuario.cargo_nivel === 1; }
  function isSupervisor() { return !!usuario && usuario.cargo_nivel <= 2; }
  function isSuperAdmin() { return !!usuario && usuario.role === 'super_admin'; }

  return (
    <AuthContext.Provider
      value={{ usuario, carregando, login, logout, hasPermission, isAdmin, isSupervisor, isSuperAdmin, refreshUsuario: carregarSessao }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth deve ser usado dentro de AuthProvider');
  return ctx;
}
