import { API } from './client';

export interface Empresa {
  id: number;
  nome: string;
  nome_fantasia?: string | null;
  razao_social?: string | null;
  tipo_documento?: 'cnpj' | 'cpf';
  documento?: string | null;
  email?: string | null;
  telefone?: string | null;
  plano: 'basico' | 'profissional' | 'enterprise';
  status: 'active' | 'trial' | 'past_due' | 'suspended';
  tolerancia_dias?: number;
  trial_fim?: string | null;
  criado_em?: string;
  total_usuarios?: number;
  total_registros?: number;
}

export const EmpresasAPI = {
  listar: (): Promise<Empresa[]> => API.get('/empresas'),
  obter: (id: number): Promise<Empresa> => API.get(`/empresas/${id}`),
  criar: (body: Partial<Empresa> & { trial_dias?: number }) => API.post('/empresas', body),
  editar: (id: number, body: Partial<Empresa>) => API.put(`/empresas/${id}`, body),
  alterarStatus: (id: number, status: Empresa['status']) => API.patch(`/empresas/${id}/status`, { status }),
  excluir: (id: number) => API.delete(`/empresas/${id}`),
  listarUsuarios: async (id: number) => {
    const data = await API.get(`/empresas/${id}/usuarios`);
    return data?.usuarios || [];
  },
  criarUsuario: (id: number, body: { nome: string; email: string; senha: string; role?: string }) =>
    API.post(`/empresas/${id}/usuarios`, body),
  excluirUsuario: (id: number, uid: number) => API.delete(`/empresas/${id}/usuarios/${uid}`),
};

export const MetricasAPI = {
  resumo: () => API.get('/superadmin/metricas'),
};

export const StripeAPI = {
  info: (empresaId: number) => API.get(`/stripe/empresas/${empresaId}/info`),
  assinar: (empresaId: number): Promise<{ checkout_url: string }> => API.post(`/stripe/empresas/${empresaId}/assinar`, {}),
  cancelar: (empresaId: number) => API.post(`/stripe/empresas/${empresaId}/cancelar`, {}),
};

export const SuperAdminsAPI = {
  listar: () => API.get('/superadmin'),
  criar: (body: { nome: string; email: string; senha: string }) => API.post('/superadmin', body),
  editar: (id: number, body: any) => API.put(`/superadmin/${id}`, body),
  excluir: (id: number) => API.delete(`/superadmin/${id}`),
};
