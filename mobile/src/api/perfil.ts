import { API } from './client';

export const PerfilAPI = {
  alterarSenha: (senha_atual: string, nova_senha: string) =>
    API.post('/auth/alterar-senha', { senha_atual, nova_senha }),
};
