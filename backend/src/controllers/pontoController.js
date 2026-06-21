const path      = require('path');
const fs        = require('fs');
const { pool }  = require('../database/connection');
const LogAcesso = require('../models/LogAcesso');

const { getClientIp } = require('../utils/ip');

// ── Helpers de fuso horário ───────────────────────────────────
// Retorna data local no fuso informado como 'YYYY-MM-DD' (ex: '2025-01-15')
function todayInTZ(tz) {
  return new Date().toLocaleDateString('sv', { timeZone: tz || 'America/Sao_Paulo' });
}

// Retorna mês local no fuso como 'YYYY-MM'
function monthInTZ(tz) {
  return todayInTZ(tz).slice(0, 7);
}

// Retorna [inicioUTC, fimUTC] em formato 'YYYY-MM-DD HH:MM:SS' cobrindo
// um dia inteiro (00:00–23:59:59) no fuso dado.
// Funciona para qualquer fuso, inclusive fusos com DST.
function dayBoundsUTC(dateStr, tz) {
  // Calcula o offset UTC no meio-dia desse dia (evita ambiguidade de DST na meia-noite)
  const noonUTC   = new Date(`${dateStr}T12:00:00Z`);
  const noonLocal = new Date(noonUTC.toLocaleString('en-US', { timeZone: tz || 'America/Sao_Paulo' }));
  const offsetMs  = noonLocal.getTime() - noonUTC.getTime(); // ex: -10800000 para BRT (-3h)

  // Meia-noite local = meia-noite UTC deslocada pelo offset
  const midnightMs = new Date(`${dateStr}T00:00:00Z`).getTime() - offsetMs;
  const toSQL = ms => new Date(ms).toISOString().slice(0, 19).replace('T', ' ');
  return [toSQL(midnightMs), toSQL(midnightMs + 86400000)];
}

// Lê fuso_horario da empresa no banco de configuracoes
async function getCompanyTZ(company_id) {
  if (!company_id) return 'America/Sao_Paulo';
  try {
    const [[row]] = await pool.query(
      "SELECT valor FROM configuracoes WHERE company_id = ? AND chave = 'fuso_horario' LIMIT 1",
      [company_id]
    );
    return (row && row.valor) || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
}

function isMobileDevice(ua) {
  return /Android.*Mobile|iPhone|iPad|iPod/i.test(ua) ||
         (/Android/i.test(ua) && !/Windows/i.test(ua));
}

function parseUserAgent(ua) {
  if (!ua) return { navegador: 'Desconhecido', dispositivo: 'Desconhecido', so: 'Desconhecido' };

  let navegador  = 'Outro';
  let dispositivo = 'Desktop';
  let so         = 'Desconhecido';

  if (/chrome/i.test(ua) && !/edg/i.test(ua))        navegador = 'Chrome';
  else if (/firefox/i.test(ua))                        navegador = 'Firefox';
  else if (/safari/i.test(ua) && !/chrome/i.test(ua)) navegador = 'Safari';
  else if (/edg/i.test(ua))                            navegador = 'Edge';
  else if (/opera|opr/i.test(ua))                      navegador = 'Opera';

  if (/mobile|android|iphone/i.test(ua))  dispositivo = 'Mobile';
  else if (/ipad|tablet/i.test(ua))       dispositivo = 'Tablet';

  if (/windows/i.test(ua))      so = 'Windows';
  else if (/android/i.test(ua)) so = 'Android';
  else if (/iphone|ipad/i.test(ua)) so = 'iOS';
  else if (/mac os/i.test(ua))  so = 'macOS';
  else if (/linux/i.test(ua))   so = 'Linux';

  return { navegador, dispositivo, so };
}

// Geocodificação reversa via Nominatim (OSM) — fire-and-forget
async function geocodificar(id, lat, lng) {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      {
        headers: { 'User-Agent': 'PontoEletronicoCorporativo/1.0' },
        signal:  AbortSignal.timeout(6000),
      }
    );
    if (!res.ok) return;
    const data = await res.json();
    const addr = data.display_name || null;
    if (addr) {
      await pool.query('UPDATE registros_ponto SET endereco_aprox = ? WHERE id = ?', [addr, id]);
    }
  } catch { /* silencioso — geocoding é opcional */ }
}

// Filtra campos sensíveis de acordo com permissões
function filtrarRegistro(r, temDetalhes) {
  // IP fica guardado no banco para auditoria técnica interna, mas nunca é
  // exposto via API — não é exibido para empresas/usuários em nenhum caso.
  const { ip, ip_publico, ...semIp } = r;
  if (temDetalhes) return semIp;
  // foto_registro fica sempre visível — é a foto da própria pessoa.
  // Só removemos metadados de localização/dispositivo, que não fazem sentido
  // para o funcionário ver no histórico do próprio ponto.
  const { latitude, longitude, precisao, user_agent, ...pub } = semIp;
  return pub;
}

// POST /api/ponto/registrar  (multipart/form-data)
async function registrar(req, res) {
  const { tipo, latitude, longitude, precisao } = req.body;
  const fotoFile = req.file;
  const ip       = getClientIp(req);
  const ua       = req.headers['user-agent'] || '';
  const { navegador, dispositivo, so } = parseUserAgent(ua);
  const mobile   = isMobileDevice(ua);
  const fotoUrl  = fotoFile ? `/uploads/registros/${fotoFile.filename}` : null;

  // ── Validações obrigatórias ───────────────────────────────
  if (!tipo || !['entrada', 'saida'].includes(tipo)) {
    if (fotoFile) fs.unlink(fotoFile.path, () => {});
    return res.status(400).json({ erro: "Tipo deve ser 'entrada' ou 'saida'." });
  }

  if (!latitude || !longitude) {
    if (fotoFile) fs.unlink(fotoFile.path, () => {});
    return res.status(400).json({ erro: 'Localização GPS é obrigatória para registrar o ponto.' });
  }

  // Foto obrigatória somente em dispositivos móveis
  if (mobile && !fotoFile) {
    return res.status(400).json({ erro: 'Foto obrigatória para dispositivos móveis.' });
  }

  try {
    // Fuso da empresa — usado para competência e queries de data
    const tz = await getCompanyTZ(req.user.company_id);
    const competenciaAtual = monthInTZ(tz);
    const [[periodoClosed]] = await pool.query(
      `SELECT id FROM fechamentos_folha
       WHERE usuario_id = ? AND status = 'fechado' AND competencia = ? LIMIT 1`,
      [req.user.id, competenciaAtual]
    );
    if (periodoClosed) {
      if (fotoFile) fs.unlink(fotoFile.path, () => {});
      return res.status(409).json({ erro: 'O período atual está fechado. Não é possível registrar ponto.' });
    }

    // Verificar duplicata recente — comparação feita no MySQL para evitar problemas de fuso
    const [ultimo] = await pool.query(
      `SELECT tipo, TIMESTAMPDIFF(SECOND, data_hora, NOW()) AS segundos_atras
       FROM registros_ponto
       WHERE usuario_id = ?
       ORDER BY data_hora DESC LIMIT 1`,
      [req.user.id]
    );

    if (ultimo.length && ultimo[0].tipo === tipo) {
      const segundos = parseInt(ultimo[0].segundos_atras ?? 999);
      if (segundos >= 0 && segundos < 60) {
        if (fotoFile) fs.unlink(fotoFile.path, () => {});
        return res.status(409).json({ erro: `Você já registrou ${tipo} recentemente. Aguarde 1 minuto.` });
      }
    }

    // IP do socket (Netlify/proxy direto) vs. IP real do cliente (X-Forwarded-For)
    const ip_publico = getClientIp(req);
    const ip_socket  = (req.socket?.remoteAddress || '').replace(/^::ffff:/i, '') || ip_publico;

    const [result] = await pool.query(
      `INSERT INTO registros_ponto
         (usuario_id, tipo, data_hora, ip, ip_publico, latitude, longitude, precisao,
          foto_registro, dispositivo, so, navegador, user_agent)
       VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id, tipo, ip_socket, ip_publico,
        parseFloat(latitude), parseFloat(longitude),
        precisao ? parseFloat(precisao) : null,
        fotoUrl, dispositivo, so, navegador, ua,
      ]
    );

    const id = result.insertId;

    // Geocodificação assíncrona (não bloqueia a resposta)
    geocodificar(id, latitude, longitude);

    await LogAcesso.registrar({
      usuario_id: req.user.id,
      acao:       `ponto.${tipo}`,
      descricao:  `Registro de ${tipo} — GPS: ${latitude},${longitude}`,
      ip:         ip_publico,
      user_agent: ua,
    });

    const [reg] = await pool.query('SELECT * FROM registros_ponto WHERE id = ?', [id]);
    const { ip: _ip, ip_publico: _ipPub, ...registroSemIp } = reg[0];

    return res.status(201).json({
      mensagem:  `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} registrada com sucesso.`,
      registro:  registroSemIp,
    });
  } catch (err) {
    if (fotoFile) fs.unlink(fotoFile.path, () => {});
    console.error('[Ponto] registrar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/ponto/historico
async function historico(req, res) {
  try {
    const { usuario_id, busca, data_inicio, data_fim, tipo, pagina = 1, por_pagina = 30 } = req.query;

    const pg     = Math.max(1, parseInt(pagina)    || 1);
    const pp     = Math.min(100, parseInt(por_pagina) || 30);
    const offset = (pg - 1) * pp;
    const uid    = (req.user.cargo_nivel >= 3) ? req.user.id : (usuario_id || null);
    const temDetalhes = req.user.cargo_nivel <= 2 || req.user.permissoes.includes('registros.detalhes');

    const cid    = req.user.company_id;
    const tz     = await getCompanyTZ(cid);
    const params = [];
    let where = 'WHERE 1=1';

    if (cid)  { where += ' AND u.company_id = ?'; params.push(cid); }
    if (uid)  { where += ' AND r.usuario_id = ?'; params.push(uid); }
    if (tipo) { where += ' AND r.tipo = ?';        params.push(tipo); }
    if (data_inicio) {
      const [startUTC] = dayBoundsUTC(data_inicio, tz);
      where += ' AND r.data_hora >= ?'; params.push(startUTC);
    }
    if (data_fim) {
      const [, endUTC] = dayBoundsUTC(data_fim, tz);
      where += ' AND r.data_hora < ?';  params.push(endUTC);
    }
    if (busca && req.user.cargo_nivel < 3) {
      where += ' AND (u.nome LIKE ? OR u.email LIKE ?)';
      params.push(`%${busca}%`, `%${busca}%`);
    }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM registros_ponto r JOIN usuarios u ON u.id = r.usuario_id ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT r.id, r.tipo, r.data_hora, r.ip, r.ip_publico,
              r.latitude, r.longitude, r.precisao,
              r.foto_registro, r.endereco_aprox,
              r.dispositivo, r.so, r.navegador, r.observacao,
              u.nome AS usuario_nome, u.email AS usuario_email
       FROM registros_ponto r
       JOIN usuarios u ON u.id = r.usuario_id
       ${where}
       ORDER BY r.data_hora DESC
       LIMIT ${pp} OFFSET ${offset}`,
      params
    );

    return res.json({
      total, pagina: pg, por_pagina: pp,
      registros: rows.map(r => filtrarRegistro(r, temDetalhes)),
    });
  } catch (err) {
    console.error('[Ponto] historico:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/ponto/hoje
async function hoje(req, res) {
  try {
    const temDetalhes = req.user.cargo_nivel <= 2 || req.user.permissoes.includes('registros.detalhes');
    const tz = await getCompanyTZ(req.user.company_id);
    const [startUTC, endUTC] = dayBoundsUTC(todayInTZ(tz), tz);
    const [rows] = await pool.query(
      `SELECT * FROM registros_ponto
       WHERE usuario_id = ? AND data_hora >= ? AND data_hora < ?
       ORDER BY data_hora ASC`,
      [req.user.id, startUTC, endUTC]
    );
    return res.json({ registros: rows.map(r => filtrarRegistro(r, temDetalhes)) });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/ponto/status
async function status(req, res) {
  try {
    // Considera apenas registros de hoje no fuso da empresa — entrada de ontem não conta
    const tz = await getCompanyTZ(req.user.company_id);
    const [startUTC, endUTC] = dayBoundsUTC(todayInTZ(tz), tz);
    const [rows] = await pool.query(
      `SELECT tipo, data_hora FROM registros_ponto
       WHERE usuario_id = ? AND data_hora >= ? AND data_hora < ?
       ORDER BY data_hora DESC LIMIT 1`,
      [req.user.id, startUTC, endUTC]
    );
    const ultimo  = rows.length ? rows[0] : null;
    const proximo = !ultimo || ultimo.tipo === 'saida' ? 'entrada' : 'saida';
    return res.json({ ultimo, proximo_registro: proximo, no_trabalho: !!(ultimo && ultimo.tipo === 'entrada') });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/ponto/email-config
// Retorna config EmailJS — lê env vars (oculto/automático) ou fallback no banco
async function emailConfig(req, res) {
  try {
    const cid        = req.user.company_id;
    const backendUrl = (process.env.BACKEND_URL || '').replace(/\/$/, '');

    const envPublicKey  = (process.env.EMAILJS_PUBLIC_KEY  || '').trim();
    const envServiceId  = (process.env.EMAILJS_SERVICE_ID  || '').trim();
    const envTemplateId = (process.env.EMAILJS_TEMPLATE_ID || '').trim();

    if (envPublicKey && envServiceId && envTemplateId) {
      // Configuração global via env vars — sempre ativo, sem precisar de UI
      let empresaNome = '';
      let empresaLogo = '';
      const fusoHorario = await getCompanyTZ(cid);
      if (cid) {
        const [empRows] = await pool.query('SELECT nome, logo FROM empresas WHERE id = ?', [cid]);
        const emp = empRows[0] || {};
        empresaNome = emp.nome || '';
        empresaLogo = emp.logo || '';
      }
      return res.json({
        habilitado: true,
        publicKey:  envPublicKey,
        serviceId:  envServiceId,
        templateId: envTemplateId,
        enviarEntrada: true,
        enviarSaida:   true,
        incluirFoto:        true,
        incluirGps:         true,
        incluirDispositivo: true,
        incluirProtocolo:   true,
        incluirLogo:        true,
        fromName:   'PontoControl',
        replyTo:    '',
        backendUrl,
        empresaNome,
        empresaLogo,
        fuso_horario: fusoHorario,
      });
    }

    // Fallback: lê do banco por empresa (configuração manual via DB)
    if (!cid) return res.json({ habilitado: false });

    const emailjsKeys = [
      'emailjs_public_key', 'emailjs_service_id',
      'emailjs_template_entrada_id', 'emailjs_template_saida_id',
      'emailjs_from_name', 'emailjs_reply_to',
      'comprovante_enviar_entrada', 'comprovante_enviar_saida',
      'comprovante_incluir_foto', 'comprovante_incluir_gps',
      'comprovante_incluir_dispositivo', 'comprovante_incluir_protocolo',
      'comprovante_incluir_logo',
    ];

    const [rows] = await pool.query(
      `SELECT chave, valor FROM configuracoes WHERE company_id = ? AND chave IN (?)`,
      [cid, emailjsKeys]
    );

    const cfg = {};
    rows.forEach(r => { cfg[r.chave] = r.valor; });

    const [empRows] = await pool.query('SELECT nome, logo FROM empresas WHERE id = ?', [cid]);
    const empresa = empRows[0] || {};

    const pk = cfg.emailjs_public_key || '';
    const si = cfg.emailjs_service_id || '';
    const ti = cfg.emailjs_template_entrada_id || cfg.emailjs_template_saida_id || '';

    return res.json({
      habilitado:         !!(pk && si && ti),
      publicKey:          pk,
      serviceId:          si,
      templateId:         ti,
      fromName:           cfg.emailjs_from_name || 'PontoControl',
      replyTo:            cfg.emailjs_reply_to  || '',
      enviarEntrada:      cfg.comprovante_enviar_entrada   === 'true',
      enviarSaida:        cfg.comprovante_enviar_saida     === 'true',
      incluirFoto:        cfg.comprovante_incluir_foto     !== 'false',
      incluirGps:         cfg.comprovante_incluir_gps      !== 'false',
      incluirDispositivo: cfg.comprovante_incluir_dispositivo !== 'false',
      incluirProtocolo:   cfg.comprovante_incluir_protocolo   !== 'false',
      incluirLogo:        cfg.comprovante_incluir_logo        !== 'false',
      backendUrl,
      empresaNome:        empresa.nome || '',
      empresaLogo:        empresa.logo || '',
    });
  } catch (err) {
    console.error('[Ponto] emailConfig:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

function gerarProtocolo(dataHora, id, tz) {
  const d = new Date(dataHora);
  const fmt = new Intl.DateTimeFormat('pt-BR', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' });
  const parts = fmt.formatToParts(d);
  const year  = parts.find(p => p.type === 'year').value;
  const month = parts.find(p => p.type === 'month').value;
  const day   = parts.find(p => p.type === 'day').value;
  return `PT-${year}${month}${day}-${String(id).padStart(6, '0')}`;
}

// POST /api/ponto/:id/comprovante
// Envia o comprovante por e-mail via EmailJS direto do servidor (usa a Private
// Key, configurada só no backend). Necessário para o app mobile: chamadas
// fora de um navegador são bloqueadas pelo "strict mode" do EmailJS, que só
// aceita a Public Key quando a origem é validável (como no navegador web).
async function enviarComprovante(req, res) {
  const registroId = parseInt(req.params.id);
  try {
    const [[registro]] = await pool.query(
      `SELECT r.*, u.nome AS usuario_nome, u.email AS usuario_email, u.id AS usuario_id,
              c.nome AS cargo_nome, u.company_id
       FROM registros_ponto r
       JOIN usuarios u ON u.id = r.usuario_id
       JOIN cargos c ON c.id = u.cargo_id
       WHERE r.id = ?`,
      [registroId]
    );
    if (!registro) return res.status(404).json({ erro: 'Registro não encontrado.' });
    if (req.user.company_id && req.user.company_id !== registro.company_id) {
      return res.status(403).json({ erro: 'Sem permissão.' });
    }

    const cid = registro.company_id;
    const envPublicKey  = (process.env.EMAILJS_PUBLIC_KEY  || '').trim();
    const envServiceId  = (process.env.EMAILJS_SERVICE_ID  || '').trim();
    const envTemplateId = (process.env.EMAILJS_TEMPLATE_ID || '').trim();
    const privateKey    = (process.env.EMAILJS_PRIVATE_KEY || '').trim();

    if (!envPublicKey || !envServiceId || !envTemplateId) {
      return res.json({ enviado: false, motivo: 'EmailJS não configurado.' });
    }

    const tz = await getCompanyTZ(cid);
    let empresaNome = '', empresaLogo = '';
    if (cid) {
      const [[emp]] = await pool.query('SELECT nome, logo FROM empresas WHERE id = ?', [cid]);
      if (emp) { empresaNome = emp.nome || ''; empresaLogo = emp.logo || ''; }
    }

    const backendUrl = (process.env.BACKEND_URL || '').replace(/\/$/, '');
    const tipo = registro.tipo;
    const d = new Date(registro.data_hora);
    const dataFmt = d.toLocaleDateString('pt-BR', { timeZone: tz, weekday: 'long', year: 'numeric', month: 'long', day: '2-digit' });
    const horaFmt = d.toLocaleTimeString('pt-BR', { timeZone: tz });
    const fotoUrl = registro.foto_registro ? backendUrl + registro.foto_registro : '';
    const logoUrl = empresaLogo ? backendUrl + empresaLogo : '';
    const protocolo = gerarProtocolo(registro.data_hora, registro.id, tz);

    const params = {
      nome_funcionario: registro.usuario_nome,
      cargo: registro.cargo_nome,
      empresa: empresaNome,
      horario_completo: horaFmt,
      data_envio: new Date().toLocaleString('pt-BR', { timeZone: tz }),
      foto_registro: fotoUrl,
      to_name: registro.usuario_nome,
      to_email: registro.usuario_email,
      funcionario_nome: registro.usuario_nome,
      funcionario_cargo: registro.cargo_nome,
      empresa_nome: empresaNome,
      empresa_logo: logoUrl,
      data: dataFmt, hora: horaFmt,
      horario: horaFmt,
      tipo_registro: tipo === 'entrada' ? 'ENTRADA' : 'SAÍDA',
      status_msg: tipo === 'entrada' ? 'ENTRADA REGISTRADA COM SUCESSO' : 'SAÍDA REGISTRADA COM SUCESSO',
      latitude: registro.latitude ? String(parseFloat(registro.latitude).toFixed(6)) : 'Não disponível',
      longitude: registro.longitude ? String(parseFloat(registro.longitude).toFixed(6)) : 'Não disponível',
      protocolo,
      foto_url: fotoUrl,
      navegador: registro.navegador || 'App Mobile',
      dispositivo: registro.dispositivo || 'Mobile',
      enviado_em: new Date().toLocaleString('pt-BR', { timeZone: tz }),
      reply_to: registro.usuario_email,
      from_name: 'PontoControl',
    };

    const resp = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id:  envServiceId,
        template_id: envTemplateId,
        user_id:     envPublicKey,
        ...(privateKey ? { accessToken: privateKey } : {}),
        template_params: params,
      }),
    });

    const sucesso = resp.ok;
    const erroMsg = sucesso ? null : await resp.text();

    // comprovantes_email.company_id é NOT NULL — super_admin (sem empresa)
    // não tem como ser registrado ali, mas o e-mail já foi enviado normalmente.
    if (cid) {
      await pool.query(
        `INSERT INTO comprovantes_email (registro_id, usuario_id, company_id, email_para, tipo, sucesso, erro_msg)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [registroId, registro.usuario_id, cid, registro.usuario_email, tipo, sucesso ? 1 : 0, erroMsg]
      );
    }

    if (!sucesso) console.error(`[Ponto] EmailJS comprovante falhou (registro ${registroId}):`, erroMsg);
    return res.json({ enviado: sucesso });
  } catch (err) {
    console.error('[Ponto] enviarComprovante:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/ponto/:id/log-comprovante
async function logComprovante(req, res) {
  const registroId = parseInt(req.params.id);
  const { sucesso, erroMsg, emailPara, reenviado = false } = req.body;

  if (!emailPara) {
    return res.status(400).json({ erro: 'emailPara é obrigatório.' });
  }

  try {
    // Verifica que o registro existe e pertence à empresa do usuário
    const [rows] = await pool.query(
      `SELECT rp.id, rp.usuario_id, rp.tipo, u.company_id
       FROM registros_ponto rp
       JOIN usuarios u ON u.id = rp.usuario_id
       WHERE rp.id = ?`,
      [registroId]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Registro não encontrado.' });

    const registro = rows[0];

    // Segurança: deve ser da mesma empresa (super_admin passa livre)
    if (req.user.company_id && req.user.company_id !== registro.company_id) {
      return res.status(403).json({ erro: 'Sem permissão.' });
    }

    await pool.query(
      `INSERT INTO comprovantes_email
         (registro_id, usuario_id, company_id, email_para, tipo, sucesso, erro_msg, reenviado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        registroId, registro.usuario_id, registro.company_id,
        emailPara, registro.tipo,
        sucesso ? 1 : 0,
        erroMsg || null,
        reenviado ? 1 : 0,
      ]
    );

    const acao = reenviado ? 'email.comprovante.reenvio' : 'email.comprovante';
    const desc = `Comprovante de ${registro.tipo} ${sucesso ? 'enviado' : 'falhou'} → ${emailPara}`;
    await LogAcesso.registrar({
      usuario_id: req.user.id,
      acao,
      descricao:  desc,
      ip:         getClientIp(req),
      user_agent: req.headers['user-agent'] || '',
    });

    return res.json({ mensagem: 'Log registrado.' });
  } catch (err) {
    console.error('[Ponto] logComprovante:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/ponto/comprovantes
async function listarComprovantes(req, res) {
  try {
    const cid = req.user.company_id;
    const { pagina = 1, por_pagina = 30 } = req.query;
    const pg     = Math.max(1, parseInt(pagina) || 1);
    const pp     = Math.min(100, parseInt(por_pagina) || 30);
    const offset = (pg - 1) * pp;

    const params = [];
    let where = 'WHERE 1=1';
    if (cid) { where += ' AND ce.company_id = ?'; params.push(cid); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM comprovantes_email ce ${where}`, params
    );

    const [rows] = await pool.query(
      `SELECT ce.*, u.nome AS usuario_nome, u.email AS usuario_email
       FROM comprovantes_email ce
       JOIN usuarios u ON u.id = ce.usuario_id
       ${where}
       ORDER BY ce.enviado_em DESC
       LIMIT ${pp} OFFSET ${offset}`,
      params
    );

    return res.json({ total, pagina: pg, por_pagina: pp, registros: rows });
  } catch (err) {
    console.error('[Ponto] listarComprovantes:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { registrar, historico, hoje, status, emailConfig, enviarComprovante, logComprovante, listarComprovantes };
