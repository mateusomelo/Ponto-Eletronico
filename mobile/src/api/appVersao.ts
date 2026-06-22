import Constants from 'expo-constants';
import { API } from './client';

export interface VersaoInfo {
  versao: string;
  changelog: string | null;
  apk_url: string;
}

// Compara versões no formato "1.2.1" (semver simples, sem pre-release/build tags)
export function versaoMaisNova(a: string, b: string): boolean {
  const pa = a.split('.').map((n) => parseInt(n, 10) || 0);
  const pb = b.split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] || 0;
    const y = pb[i] || 0;
    if (x > y) return true;
    if (x < y) return false;
  }
  return false;
}

export function versaoInstalada(): string {
  return Constants.expoConfig?.version || '0.0.0';
}

export async function verificarAtualizacao(): Promise<{ disponivel: boolean; info?: VersaoInfo }> {
  try {
    const info: VersaoInfo = await API.get('/app-versoes/atual', { plataforma: 'android' });
    if (!info?.versao) return { disponivel: false };
    const disponivel = versaoMaisNova(info.versao, versaoInstalada());
    return { disponivel, info };
  } catch {
    return { disponivel: false };
  }
}
