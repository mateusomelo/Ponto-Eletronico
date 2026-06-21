import { API } from './client';

export const FechamentoAPI = {
  listar: (params: Record<string, any> = {}) => API.get('/fechamento', params),
  detalhe: (id: number) => API.get(`/fechamento/${id}`),
  assinar: (id: number) => API.patch(`/fechamento/${id}/assinar`),
  rejeitar: (id: number, motivo: string) => API.patch(`/fechamento/${id}/rejeitar`, { motivo }),
  usuariosDisponiveis: (competencia: string) => API.get('/fechamento/usuarios-disponiveis', { competencia }),
  criar: (body: { competencia: string; observacao?: string; usuario_ids: number[] }) => API.post('/fechamento', body),
};

export const LogsAPI = {
  listar: (params: Record<string, any> = {}) => API.get('/logs', params),
};

export const PagamentosAPI = {
  minhaAssinatura: () => API.get('/stripe/minha-assinatura'),
};
