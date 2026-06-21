import { PontoAPI, RegistroPonto } from './ponto';

/**
 * Envia o comprovante de ponto por e-mail. O envio acontece no servidor
 * (que tem a Private Key do EmailJS) — chamadas diretas ao EmailJS feitas
 * fora de um navegador (como no app mobile) são bloqueadas pelo "strict
 * mode" da conta, que exige a Private Key quando a origem não é validável.
 */
export async function enviarComprovante(_tipo: 'entrada' | 'saida', registro: RegistroPonto): Promise<void> {
  try {
    await PontoAPI.enviarComprovanteServidor(registro.id);
  } catch {
    // Comprovante é um recurso adicional — falha aqui nunca deve travar o registro de ponto.
  }
}
