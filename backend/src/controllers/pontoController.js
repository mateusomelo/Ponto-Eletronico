const path      = require('path');
const fs        = require('fs');
const { pool }  = require('../database/connection');
const LogAcesso = require('../models/LogAcesso');

const { getClientIp } = require('../utils/ip');

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
  if (temDetalhes) return r;
  const { ip, ip_publico, latitude, longitude, precisao, foto_registro, user_agent, ...pub } = r;
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
    // Verificar se o período atual está fechado definitivamente para este funcionário
    const agora = new Date();
    const brt   = new Date(agora.getTime() - 3 * 3600000);
    const competenciaAtual = `${brt.getUTCFullYear()}-${String(brt.getUTCMonth()+1).padStart(2,'0')}`;
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

    const [result] = await pool.query(
      `INSERT INTO registros_ponto
         (usuario_id, tipo, data_hora, ip, ip_publico, latitude, longitude, precisao,
          foto_registro, dispositivo, so, navegador, user_agent)
       VALUES (?, ?, NOW(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id, tipo, ip, ip,
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
      ip,
      user_agent: ua,
    });

    const [reg] = await pool.query('SELECT * FROM registros_ponto WHERE id = ?', [id]);

    return res.status(201).json({
      mensagem:  `${tipo.charAt(0).toUpperCase() + tipo.slice(1)} registrada com sucesso.`,
      registro:  reg[0],
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
    const params = [];
    let where = 'WHERE 1=1';

    if (cid)         { where += ' AND u.company_id = ?'; params.push(cid); }
    if (uid)         { where += ' AND r.usuario_id = ?'; params.push(uid); }
    if (tipo)        { where += ' AND r.tipo = ?';       params.push(tipo); }
    if (data_inicio) { where += ' AND DATE(r.data_hora) >= ?'; params.push(data_inicio); }
    if (data_fim)    { where += ' AND DATE(r.data_hora) <= ?'; params.push(data_fim); }
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
    const [rows] = await pool.query(
      `SELECT * FROM registros_ponto
       WHERE usuario_id = ? AND DATE(data_hora) = CURDATE()
       ORDER BY data_hora ASC`,
      [req.user.id]
    );
    return res.json({ registros: rows.map(r => filtrarRegistro(r, temDetalhes)) });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/ponto/status
async function status(req, res) {
  try {
    // Considera apenas registros de hoje — entrada de ontem não conta como "trabalhando"
    const [rows] = await pool.query(
      `SELECT tipo, data_hora FROM registros_ponto
       WHERE usuario_id = ? AND DATE(data_hora) = CURDATE()
       ORDER BY data_hora DESC LIMIT 1`,
      [req.user.id]
    );
    const ultimo  = rows.length ? rows[0] : null;
    const proximo = !ultimo || ultimo.tipo === 'saida' ? 'entrada' : 'saida';
    return res.json({ ultimo, proximo_registro: proximo, no_trabalho: !!(ultimo && ultimo.tipo === 'entrada') });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/ponto/email-config
// Retorna as configs EmailJS da empresa (acessível a qualquer usuário autenticado)
async function emailConfig(req, res) {
  try {
    const cid = req.user.company_id;
    if (!cid) {
      // super_admin não tem empresa — retorna configuração vazia
      return res.json({ habilitado: false });
    }

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

    // Busca dados da empresa (nome e logo) para incluir no comprovante
    const [empRows] = await pool.query(
      'SELECT nome, logo FROM empresas WHERE id = ?', [cid]
    );
    const empresa = empRows[0] || {};

    const backendUrl = (process.env.BACKEND_URL || '').replace(/\/$/, '');

    return res.json({
      habilitado:         !!(cfg.emailjs_public_key && cfg.emailjs_service_id),
      publicKey:          cfg.emailjs_public_key          || '',
      serviceId:          cfg.emailjs_service_id          || '',
      templateEntradaId:  cfg.emailjs_template_entrada_id || '',
      templateSaidaId:    cfg.emailjs_template_saida_id   || '',
      fromName:           cfg.emailjs_from_name            || 'Ponto Eletrônico',
      replyTo:            cfg.emailjs_reply_to             || '',
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

module.exports = { registrar, historico, hoje, status, emailConfig, logComprovante, listarComprovantes };
