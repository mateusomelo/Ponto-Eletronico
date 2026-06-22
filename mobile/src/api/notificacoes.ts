import { API } from './client';

export interface Notificacao {
  id: number;
  tipo: string;
  titulo: string;
  mensagem: string | null;
  fechamento_id: number | null;
  lida: boolean;
  created_at: string;
}

export const NotificacoesAPI = {
  naoLidas: (): Promise<{ total: number }> => API.get('/notificacoes/nao-lidas'),
  listar: (): Promise<{ notificacoes: Notificacao[] }> => API.get('/notificacoes', { por_pagina: 50 }),
  marcarLida: (id: number) => API.patch(`/notificacoes/${id}/ler`, {}),
  marcarTodasLidas: () => API.patch('/notificacoes/ler-todas', {}),
};
