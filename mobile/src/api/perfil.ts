import { File, UploadTask, UploadType } from 'expo-file-system';
import { API, API_BASE, getToken } from './client';

export const PerfilAPI = {
  alterarSenha: (senha_atual: string, nova_senha: string) =>
    API.post('/auth/alterar-senha', { senha_atual, nova_senha }),

  uploadFoto: async (fotoUri: string): Promise<{ foto: string }> => {
    const token = await getToken();
    const file = new File(fotoUri);
    const task = new UploadTask(file, `${API_BASE}/auth/me/foto`, {
      httpMethod: 'POST',
      uploadType: UploadType.MULTIPART,
      fieldName: 'foto',
      mimeType: 'image/jpeg',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const result = await task.uploadAsync();
    const data = result.body ? JSON.parse(result.body) : null;
    if (result.status < 200 || result.status >= 300) {
      throw new Error(data?.erro || `Erro no upload (HTTP ${result.status}).`);
    }
    return data;
  },
};
