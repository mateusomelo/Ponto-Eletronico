const nodemailer = require('nodemailer');

function criarTransporter() {
  if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER) return null;
  return nodemailer.createTransport({
    host:   process.env.EMAIL_HOST,
    port:   parseInt(process.env.EMAIL_PORT || '587'),
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });
}

const FROM = () =>
  process.env.EMAIL_FROM || `"Ponto Eletrônico" <${process.env.EMAIL_USER || 'noreply@ponto.com'}>`;

const BASE_URL = () => (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

function wrapHtml(titulo, corpo) {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f1f5f9;margin:0;padding:32px 16px}
  .card{background:#fff;border-radius:16px;max-width:520px;margin:0 auto;padding:40px 36px;box-shadow:0 4px 24px rgba(0,0,0,.07)}
  .logo{display:flex;align-items:center;gap:12px;margin-bottom:28px}
  .logo-icon{width:42px;height:42px;border-radius:12px;background:linear-gradient(135deg,#1e3a5f,#3b82f6);display:flex;align-items:center;justify-content:center}
  .logo-icon svg{width:22px;height:22px;fill:none;stroke:#fff;stroke-width:2}
  .logo-text{font-size:1.05rem;font-weight:700;color:#1e293b}
  h2{font-size:1.2rem;color:#1e293b;margin:0 0 12px}
  p{color:#475569;line-height:1.65;margin:0 0 14px;font-size:.9rem}
  .btn{display:inline-block;padding:13px 26px;background:#3b82f6;color:#fff !important;text-decoration:none;border-radius:10px;font-weight:600;font-size:.9rem;margin:6px 0 18px}
  .footer{margin-top:28px;padding-top:20px;border-top:1px solid #e2e8f0;font-size:.78rem;color:#94a3b8;text-align:center}
  .alert{background:#fef3c7;border-left:4px solid #fbbf24;border-radius:8px;padding:12px 14px;font-size:.85rem;color:#78350f;margin-bottom:14px}
  .success{background:#dcfce7;border-color:#86efac;color:#15803d}
  .danger{background:#fee2e2;border-color:#fca5a5;color:#b91c1c}
</style>
</head>
<body>
<div class="card">
  <div class="logo">
    <div class="logo-icon">
      <svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15 15"/></svg>
    </div>
    <span class="logo-text">Ponto Eletrônico</span>
  </div>
  <h2>${titulo}</h2>
  ${corpo}
  <div class="footer">© ${new Date().getFullYear()} Ponto Eletrônico &nbsp;·&nbsp; Este é um e-mail automático, não responda.</div>
</div>
</body></html>`;
}

async function enviarEmail({ para, assunto, html, texto }) {
  const transporter = criarTransporter();
  if (!transporter) {
    console.log(`[Email] SMTP não configurado — suprimido: "${assunto}" → ${para}`);
    return false;
  }
  try {
    await transporter.sendMail({ from: FROM(), to: para, subject: assunto, html, text: texto });
    console.log(`[Email] Enviado: "${assunto}" → ${para}`);
    return true;
  } catch (err) {
    console.error('[Email] Falha ao enviar:', err.message);
    return false;
  }
}

async function enviarResetSenhaEmailJS(email, nome, token) {
  const serviceId  = process.env.EMAILJS_SERVICE_ID;
  const templateId = process.env.EMAILJS_TEMPLATE_RESET_ID;
  const publicKey  = process.env.EMAILJS_PUBLIC_KEY;
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;

  if (!serviceId || !templateId || !publicKey) {
    console.log('[Email] EmailJS reset: EMAILJS_SERVICE_ID / EMAILJS_TEMPLATE_RESET_ID / EMAILJS_PUBLIC_KEY não configurados');
    return false;
  }

  const url = `${BASE_URL()}/redefinir-senha.html?token=${token}`;
  const payload = JSON.stringify({
    service_id:  serviceId,
    template_id: templateId,
    user_id:     publicKey,
    ...(privateKey ? { accessToken: privateKey } : {}),
    template_params: {
      to_email:  email,
      to_name:   nome,
      reset_url: url,
      expiry:    '2 horas',
    },
  });

  try {
    const resp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    payload,
    });
    if (resp.ok) {
      console.log(`[Email] Reset via EmailJS enviado → ${email}`);
      return true;
    }
    const txt = await resp.text();
    console.error(`[Email] EmailJS reset falhou (${resp.status}): ${txt}`);
    return false;
  } catch (err) {
    console.error('[Email] EmailJS reset erro:', err.message);
    return false;
  }
}

async function enviarResetSenha(email, nome, token) {
  const url = `${BASE_URL()}/redefinir-senha.html?token=${token}`;
  return enviarEmail({
    para:   email,
    assunto: 'Redefinição de senha — Ponto Eletrônico',
    html: wrapHtml('Redefinição de senha', `
      <p>Olá, <strong>${nome}</strong>!</p>
      <p>Recebemos uma solicitação para redefinir a senha da sua conta.</p>
      <a href="${url}" class="btn">Redefinir minha senha</a>
      <p>Este link é válido por <strong>2 horas</strong>. Se você não solicitou, ignore este e-mail — sua senha continua a mesma.</p>
    `),
    texto: `Acesse: ${url}`,
  });
}

async function enviarAlertaFatura(email, nome, valor, dataVenc, diasRestantes) {
  const titulo = diasRestantes === 0 ? 'Sua fatura vence hoje!'
    : diasRestantes < 0              ? 'Sua fatura está vencida!'
    : `Sua fatura vence em ${diasRestantes} dia${diasRestantes > 1 ? 's' : ''}`;
  return enviarEmail({
    para:   email,
    assunto: `${titulo} — Ponto Eletrônico`,
    html: wrapHtml(titulo, `
      <p>Olá, <strong>${nome}</strong>!</p>
      <div class="alert">${titulo}<br>Valor: <strong>${valor}</strong> · Vencimento: <strong>${dataVenc}</strong></div>
      <p>Regularize o pagamento para evitar a suspensão do acesso da sua empresa.</p>
      <a href="${BASE_URL()}/pagamentos.html" class="btn">Ir para Pagamentos</a>
    `),
    texto: `${titulo}. Valor: ${valor}. Vencimento: ${dataVenc}. Acesse: ${BASE_URL()}/pagamentos.html`,
  });
}

async function enviarEmpresaSuspensa(email, nome, empresaNome) {
  return enviarEmail({
    para:   email,
    assunto: `Acesso suspenso — ${empresaNome}`,
    html: wrapHtml('Acesso suspenso', `
      <p>Olá, <strong>${nome}</strong>!</p>
      <div class="alert danger">O acesso da empresa <strong>${empresaNome}</strong> foi suspenso por falta de pagamento.</div>
      <p>Para reativar o acesso, regularize o pagamento da fatura em aberto.</p>
      <a href="${BASE_URL()}/pagamentos.html" class="btn" style="background:#dc2626">Ver fatura pendente</a>
      <p>Em caso de dúvidas, entre em contato com o suporte.</p>
    `),
    texto: `O acesso de ${empresaNome} foi suspenso. Regularize em: ${BASE_URL()}/pagamentos.html`,
  });
}

async function enviarEmpresaReativada(email, nome, empresaNome) {
  return enviarEmail({
    para:   email,
    assunto: `Acesso reativado — ${empresaNome}`,
    html: wrapHtml('Acesso reativado!', `
      <p>Olá, <strong>${nome}</strong>!</p>
      <div class="alert success">O acesso da empresa <strong>${empresaNome}</strong> foi reativado com sucesso!</div>
      <p>Você já pode utilizar todas as funcionalidades normalmente.</p>
      <a href="${BASE_URL()}/dashboard.html" class="btn" style="background:#16a34a">Acessar o sistema</a>
    `),
    texto: `O acesso de ${empresaNome} foi reativado. Acesse: ${BASE_URL()}/dashboard.html`,
  });
}

async function enviarAlteracaoSenha(email, nome) {
  return enviarEmail({
    para:   email,
    assunto: 'Sua senha foi alterada — Ponto Eletrônico',
    html: wrapHtml('Senha alterada', `
      <p>Olá, <strong>${nome}</strong>!</p>
      <p>A senha da sua conta foi alterada com sucesso.</p>
      <p>Se você não realizou essa alteração, entre em contato com o administrador imediatamente.</p>
    `),
    texto: `Sua senha foi alterada. Se não foi você, contate o administrador.`,
  });
}

async function enviarBoasVindas(email, nomeAdmin, nomeEmpresa, trialDias) {
  const url = `${BASE_URL()}/dashboard.html`;
  return enviarEmail({
    para:   email,
    assunto: `Bem-vindo ao Ponto Eletrônico — ${nomeEmpresa}`,
    html: wrapHtml(`Bem-vindo, ${nomeAdmin}!`, `
      <p>Sua conta foi criada com sucesso! 🎉</p>
      <div class="alert success">
        A empresa <strong>${nomeEmpresa}</strong> está ativa com <strong>${trialDias} dias gratuitos</strong> para explorar todas as funcionalidades.
      </div>
      <p>Durante o período de teste você tem acesso completo ao sistema. Comece agora:</p>
      <a href="${url}" class="btn" style="background:#16a34a">Acessar o sistema</a>
      <p style="margin-top:18px;font-size:.82rem;color:#64748b">
        Próximos passos sugeridos:<br>
        1. Configure os horários e regras da sua empresa<br>
        2. Cadastre seus funcionários<br>
        3. Registre o primeiro ponto
      </p>
    `),
    texto: `Bem-vindo ao Ponto Eletrônico! Acesse: ${url}`,
  });
}

module.exports = {
  enviarEmail,
  enviarResetSenha,
  enviarResetSenhaEmailJS,
  enviarAlertaFatura,
  enviarEmpresaSuspensa,
  enviarEmpresaReativada,
  enviarAlteracaoSenha,
  enviarBoasVindas,
};
