import { Usuario } from '../contexts/AuthContext';
import { PontoAPI, RegistroPonto } from './ponto';

function gerarProtocolo(dataHora: string, id: number, tz: string) {
  const d = new Date(dataHora);
  const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(d);
  const year  = parts.find(p => p.type === 'year')!.value;
  const month = parts.find(p => p.type === 'month')!.value;
  const day   = parts.find(p => p.type === 'day')!.value;
  return `PT-${year}${month}${day}-${String(id).padStart(6, '0')}`;
}

/**
 * Envia comprovante de ponto por e-mail via EmailJS REST API.
 * Não usa o SDK @emailjs/browser (depende de `document`, indisponível no React Native) —
 * chama o endpoint REST diretamente, replicando a mesma lógica de frontend/public/ponto.html.
 */
export async function enviarComprovante(tipo: 'entrada' | 'saida', registro: RegistroPonto, usuario: Usuario) {
  try {
    const cfg: any = await PontoAPI.emailConfig();
    if (!cfg?.habilitado) return;
    if (tipo === 'entrada' && !cfg.enviarEntrada) return;
    if (tipo === 'saida'   && !cfg.enviarSaida)   return;
    if (!cfg.templateId || !usuario?.email) return;

    const tz = cfg.fuso_horario || 'America/Sao_Paulo';
    const protocolo = cfg.incluirProtocolo ? gerarProtocolo(registro.data_hora, registro.id, tz) : '';

    const base = cfg.backendUrl || '';
    const fotoUrl = cfg.incluirFoto && registro.foto_registro ? base + registro.foto_registro : '';
    const logoUrl = cfg.incluirLogo && cfg.empresaLogo ? base + cfg.empresaLogo : '';

    const d = new Date(registro.data_hora);
    const data = d.toLocaleDateString('pt-BR', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: '2-digit' });
    const hora = d.toLocaleTimeString('pt-BR', { timeZone: tz });

    const nome    = usuario.nome || '';
    const cargo   = usuario.cargo_nome || '';
    const empresa = cfg.empresaNome || '';
    const ipExibir = cfg.incluirDispositivo ? (registro.ip_publico || registro.ip || 'Não disponível') : 'Não disponível';

    const params = {
      nome_funcionario: nome,
      cargo,
      empresa,
      horario_completo: hora,
      data_envio: new Date().toLocaleString('pt-BR', { timeZone: tz }),
      foto_registro: fotoUrl,
      to_name: nome,
      to_email: usuario.email,
      funcionario_nome: nome,
      funcionario_cargo: cargo,
      empresa_nome: empresa,
      empresa_logo: logoUrl,
      data, hora,
      horario: hora,
      tipo_registro: tipo === 'entrada' ? 'ENTRADA' : 'SAÍDA',
      status_msg: tipo === 'entrada' ? 'ENTRADA REGISTRADA COM SUCESSO' : 'SAÍDA REGISTRADA COM SUCESSO',
      latitude: cfg.incluirGps && registro.latitude ? String(Number(registro.latitude).toFixed(6)) : 'Não disponível',
      longitude: cfg.incluirGps && registro.longitude ? String(Number(registro.longitude).toFixed(6)) : 'Não disponível',
      protocolo,
      foto_url: fotoUrl,
      ip: ipExibir,
      navegador: cfg.incluirDispositivo ? (registro.navegador || 'App Mobile') : '',
      dispositivo: cfg.incluirDispositivo ? (registro.dispositivo || 'Mobile') : '',
      enviado_em: new Date().toLocaleString('pt-BR', { timeZone: tz }),
      reply_to: cfg.replyTo || usuario.email,
      from_name: cfg.fromName || 'Ponto Eletrônico',
    };

    const resp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: cfg.serviceId,
        template_id: cfg.templateId,
        user_id: cfg.publicKey,
        template_params: params,
      }),
    });

    if (resp.ok) {
      PontoAPI.logComprovante(registro.id, { sucesso: true, emailPara: usuario.email, reenviado: false }).catch(() => {});
    } else {
      const erroMsg = await resp.text();
      PontoAPI.logComprovante(registro.id, { sucesso: false, emailPara: usuario.email, erroMsg, reenviado: false }).catch(() => {});
    }
  } catch (err: any) {
    if (registro?.id && usuario?.email) {
      PontoAPI.logComprovante(registro.id, {
        sucesso: false, emailPara: usuario.email, erroMsg: err?.message || 'Erro desconhecido', reenviado: false,
      }).catch(() => {});
    }
  }
}
