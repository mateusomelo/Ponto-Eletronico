import * as FileSystemLegacy from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { API, API_BASE, getToken } from './client';

export const RelatoriosAPI = {
  dados: (params: Record<string, any> = {}) => API.get('/relatorios/dados', params),
  resumoUsuario: (params: Record<string, any> = {}) => API.get('/relatorios/resumo-usuario', params),

  baixarEAbrir: async (tipo: 'pdf' | 'excel', params: Record<string, any> = {}) => {
    const token = await getToken();
    const qs = new URLSearchParams(params as any).toString();
    const url = `${API_BASE}/relatorios/${tipo}${qs ? '?' + qs : ''}`;
    const ext = tipo === 'pdf' ? 'pdf' : 'xlsx';
    const dest = `${FileSystemLegacy.cacheDirectory || ''}relatorio-ponto.${ext}`;

    const result = await FileSystemLegacy.downloadAsync(url, dest, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (result.status !== 200) {
      throw new Error(`Falha ao baixar relatório (HTTP ${result.status}).`);
    }

    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(result.uri);
    }
    return result.uri;
  },
};
