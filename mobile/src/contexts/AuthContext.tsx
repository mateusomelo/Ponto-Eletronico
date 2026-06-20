import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { API, ApiError, clearToken, getToken, getUsuario, setToken, setUsuario } from '../api/client';
import { autenticarComBiometria, biometriaHabilitada, setBiometriaHabilitada } from '../api/biometria';
import { registrarPushToken } from '../api/push';

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
  bloqueadoPorBiometria: boolean;
  login: (email: string, senha: string, lembrar?: boolean) => Promise<void>;
  logout: () => Promise<void>;
  desbloquearComBiometria: () => Promise<boolean>;
  biometriaAtiva: boolean;
  alternarBiometria: (ativar: boolean) => Promise<void>;
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
  const [bloqueadoPorBiometria, setBloqueadoPorBiometria] = useState(false);
  const [biometriaAtiva, setBiometriaAtiva] = useState(false);

  async function carregarUsuario() {
    try {
      const me = await API.get('/auth/me');
      setUsuarioState(me);
      await setUsuario(me);
      registrarPushToken().catch(() => {});
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        await clearToken();
        setUsuarioState(null);
      } else {
        const cached = await getUsuario<Usuario>();
        if (cached) setUsuarioState(cached);
      }
    }
  }

  async function carregarSessao() {
    const token = await getToken();
    if (!token) { setCarregando(false); return; }

    const ativa = await biometriaHabilitada();
    setBiometriaAtiva(ativa);

    if (ativa) {
      // Mostra o usuário em cache (UI de bloqueio pode exibir o nome) mas
      // não libera o app até a biometria confirmar.
      const cached = await getUsuario<Usuario>();
      if (cached) setUsuarioState(cached);
      setBloqueadoPorBiometria(true);
      setCarregando(false);
      return;
    }

    await carregarUsuario();
    setCarregando(false);
  }

  useEffect(() => { carregarSessao(); }, []);

  // Bloqueia novamente com biometria sempre que o app volta do background
  // (não só no cold start) — mesmo comportamento de apps bancários.
  const appStateRef = useRef(AppState.currentState);
  const biometriaAtivaRef = useRef(biometriaAtiva);
  const logadoRef = useRef(!!usuario);
  biometriaAtivaRef.current = biometriaAtiva;
  logadoRef.current = !!usuario;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next: AppStateStatus) => {
      const veioDoBackground = appStateRef.current.match(/inactive|background/) && next === 'active';
      if (veioDoBackground && biometriaAtivaRef.current && logadoRef.current) {
        setBloqueadoPorBiometria(true);
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  async function desbloquearComBiometria() {
    const ok = await autenticarComBiometria();
    if (ok) {
      setBloqueadoPorBiometria(false);
      await carregarUsuario();
    }
    return ok;
  }

  async function alternarBiometria(ativar: boolean) {
    await setBiometriaHabilitada(ativar);
    setBiometriaAtiva(ativar);
  }

  async function login(email: string, senha: string, lembrar = true) {
    const data = await API.post('/auth/login', { email, senha, lembrar });
    await setToken(data.token);
    await setUsuario(data.usuario);
    setUsuarioState(data.usuario);
    setBloqueadoPorBiometria(false);
    // Busca permissões completas
    await carregarUsuario();
  }

  async function logout() {
    try { await API.post('/auth/logout'); } catch { /* ignora falha de rede no logout */ }
    await clearToken();
    await setBiometriaHabilitada(false);
    setBiometriaAtiva(false);
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
      value={{
        usuario, carregando, bloqueadoPorBiometria, login, logout, desbloquearComBiometria,
        biometriaAtiva, alternarBiometria, hasPermission, isAdmin, isSupervisor, isSuperAdmin,
        refreshUsuario: carregarSessao,
      }}
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
