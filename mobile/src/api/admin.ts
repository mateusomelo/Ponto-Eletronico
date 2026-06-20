import { API } from './client';

export interface Usuario {
  id: number;
  nome: string;
  email: string;
  cpf?: string;
  telefone?: string | null;
  foto?: string | null;
  cargo_id: number;
  cargo_nome: string;
  cargo_nivel: number;
  ativo: number | boolean;
  bloqueado: number | boolean;
  ultimo_acesso?: string | null;
}

export interface Cargo {
  id: number;
  nome: string;
  descricao?: string;
  nivel: number;
  total_usuarios: number;
  permissoes: { id: number; nome: string; descricao: string }[];
}

export interface Permissao {
  id: number;
  nome: string;
  descricao: string;
}

export const UsuariosAPI = {
  listar: (params: Record<string, any> = {}) => API.get('/usuarios', params),
  obter: (id: number) => API.get(`/usuarios/${id}`),
  criar: (body: any) => API.post('/usuarios', body),
  editar: (id: number, body: any) => API.put(`/usuarios/${id}`, body),
  excluir: (id: number) => API.delete(`/usuarios/${id}`),
  bloquear: (id: number) => API.post(`/usuarios/${id}/bloquear`),
  resetarSenha: (id: number) => API.post(`/usuarios/${id}/resetar-senha`),
};

export const CargosAPI = {
  listar: (): Promise<Cargo[]> => API.get('/cargos'),
  obter: (id: number): Promise<Cargo> => API.get(`/cargos/${id}`),
  listarPermissoes: (): Promise<Permissao[]> => API.get('/cargos/permissoes'),
  criar: (body: any) => API.post('/cargos', body),
  editar: (id: number, body: any) => API.put(`/cargos/${id}`, body),
  excluir: (id: number) => API.delete(`/cargos/${id}`),
};

export const ConfiguracoesAPI = {
  obter: (): Promise<Record<string, { valor: string; descricao: string }>> => API.get('/configuracoes'),
  salvar: (updates: Record<string, string>) => API.put('/configuracoes', updates),
};
