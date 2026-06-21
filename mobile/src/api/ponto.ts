import { File, UploadTask, UploadType } from 'expo-file-system';
import { API, API_BASE, ApiError, getToken } from './client';

export interface RegistroPonto {
  id: number;
  tipo: 'entrada' | 'saida';
  data_hora: string;
  latitude?: number;
  longitude?: number;
  precisao?: number;
  foto_registro?: string | null;
  endereco_aprox?: string | null;
  dispositivo?: string;
  so?: string;
  navegador?: string;
}

export interface StatusPonto {
  ultimo: { tipo: string; data_hora: string } | null;
  proximo_registro: 'entrada' | 'saida';
  no_trabalho: boolean;
}

export const PontoAPI = {
  status:  (): Promise<StatusPonto> => API.get('/ponto/status'),
  hoje:    (): Promise<{ registros: RegistroPonto[] }> => API.get('/ponto/hoje'),
  emailConfig: () => API.get('/ponto/email-config'),
  historico: (params: Record<string, any> = {}) => API.get('/ponto/historico', params),
  logComprovante: (registroId: number, body: any) => API.post(`/ponto/${registroId}/log-comprovante`, body),
  enviarComprovanteServidor: (registroId: number) => API.post(`/ponto/${registroId}/comprovante`),

  registrar: async (form: {
    tipo: 'entrada' | 'saida';
    latitude: number;
    longitude: number;
    precisao?: number;
    fotoUri?: string | null;
  }): Promise<{ mensagem: string; registro: RegistroPonto }> => {
    const parameters: Record<string, string> = {
      tipo: form.tipo,
      latitude: String(form.latitude),
      longitude: String(form.longitude),
      precisao: String(form.precisao ?? 0),
    };

    if (!form.fotoUri) {
      // Sem foto (não deve ocorrer no app mobile, mas mantido por segurança)
      const fd = new FormData();
      Object.entries(parameters).forEach(([k, v]) => fd.append(k, v));
      return API.upload('/ponto/registrar', fd);
    }

    // Upload nativo via expo-file-system — evita os problemas de FormData/Blob
    // do React Native 0.85+ ao enviar arquivos locais.
    const token = await getToken();
    const file = new File(form.fotoUri);
    const task = new UploadTask(file, `${API_BASE}/ponto/registrar`, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'foto',
      mimeType: 'image/jpeg',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      parameters,
    });

    const result = await task.uploadAsync();
    let data: any = null;
    try { data = result.body ? JSON.parse(result.body) : null; } catch { /* corpo não-JSON */ }

    if (result.status < 200 || result.status >= 300) {
      throw new ApiError(result.status, data || { erro: `Erro no upload (HTTP ${result.status}).` });
    }
    return data;
  },
};

export const DashboardAPI = {
  resumo: () => API.get('/dashboard'),
};
