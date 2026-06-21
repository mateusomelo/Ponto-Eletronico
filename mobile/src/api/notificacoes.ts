import { API } from './client';

export const NotificacoesAPI = {
  naoLidas: (): Promise<{ total: number }> => API.get('/notificacoes/nao-lidas'),
};
