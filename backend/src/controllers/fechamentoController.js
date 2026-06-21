const { pool }        = require('../database/connection');
const LogAcesso       = require('../models/LogAcesso');
const PDFDocument     = require('pdfkit');
const xl              = require('excel4node');
const fs              = require('fs');
const path            = require('path');
const { v4: uuidv4 }  = require('uuid');
const { getClientIp }   = require('../utils/ip');
const { enviarPush }    = require('../services/pushService');
const { UPLOADS_ROOT }  = require('../middlewares/upload');
const { enviarFechamentoAssinadoEmail } = require('../services/emailService');

// Salva a assinatura desenhada (PNG em base64, ex: "data:image/png;base64,...")
// em disco e devolve a URL pública (mesmo padrão de foto_registro/avatars).
function salvarAssinaturaImagem(dataUrl) {
  const match = /^data:image\/png;base64,(.+)$/.exec(dataUrl || '');
  if (!match) return null;
  const dir = path.join(UPLOADS_ROOT, 'assinaturas');
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  const filename = `${uuidv4()}.png`;
  fs.writeFileSync(path.join(dir, filename), Buffer.from(match[1], 'base64'));
  return `/uploads/assinaturas/${filename}`;
}

async function buscarAssinaturas(fechamentoId) {
  const [rows] = await pool.query(
    `SELECT tipo, usuario_id, nome_assinante, cargo_assinante, assinatura_url, assinado_em
     FROM fechamento_assinaturas WHERE fechamento_id = ?`,
    [fechamentoId]
  );
  return rows;
}

// ── Timezone helper (mysql2 com timezone:'-03:00' retorna Dates em UTC) ──
function toBRT(dt) {
  return new Date(dt.getTime ? dt.getTime() - 3 * 3600000 : new Date(dt).getTime() - 3 * 3600000);
}

// ── Cálculo de horas do período ───────────────────────────
function calcularResumo(registros, competencia) {
  const [ano, mes] = competencia.split('-').map(Number);
  const hoje       = toBRT(new Date()); // now in BRT

  const fimMes = new Date(Date.UTC(ano, mes, 0, 3)); // last day end-of-day BRT = 03:00 UTC next day
  const limite  = hoje < fimMes ? hoje : fimMes;

  // Agrupa por dia (BRT)
  const porDia = {};
  for (const r of registros) {
    const brt = toBRT(new Date(r.data_hora));
    const dia = `${brt.getUTCFullYear()}-${String(brt.getUTCMonth()+1).padStart(2,'0')}-${String(brt.getUTCDate()).padStart(2,'0')}`;
    if (!porDia[dia]) porDia[dia] = [];
    porDia[dia].push({ tipo: r.tipo, brt });
  }

  // Dias úteis (Seg-Sex) até limite
  let diasUteis = 0;
  const iter = new Date(Date.UTC(ano, mes - 1, 1, 3)); // 1º dia BRT (meia-noite BRT = 03:00 UTC)
  while (iter <= limite) {
    const dow = new Date(iter.getTime() - 3 * 3600000).getUTCDay(); // BRT weekday
    if (dow >= 1 && dow <= 5) diasUteis++;
    iter.setUTCDate(iter.getUTCDate() + 1);
  }

  const MINUTOS_DIA   = 8 * 60;
  const minutosPrevistos = diasUteis * MINUTOS_DIA;
  let   minutosTrabalhos = 0;
  let   atrasos          = 0;

  for (const regs of Object.values(porDia)) {
    regs.sort((a, b) => a.brt - b.brt);

    // Soma pares entrada/saída
    let i = 0;
    while (i < regs.length - 1) {
      if (regs[i].tipo === 'entrada' && regs[i+1].tipo === 'saida') {
        minutosTrabalhos += Math.floor((regs[i+1].brt - regs[i].brt) / 60000);
        i += 2;
      } else { i++; }
    }

    // Atraso: primeira entrada após 08:15 BRT
    const pE = regs.find(r => r.tipo === 'entrada');
    if (pE) {
      const h = pE.brt.getUTCHours();
      const m = pE.brt.getUTCMinutes();
      if (h > 8 || (h === 8 && m > 15)) atrasos++;
    }
  }

  // Faltas: dias úteis sem registro
  let faltas = 0;
  const iter2 = new Date(Date.UTC(ano, mes - 1, 1, 3));
  while (iter2 <= limite) {
    const brtDay = new Date(iter2.getTime() - 3 * 3600000);
    const dow = brtDay.getUTCDay();
    if (dow >= 1 && dow <= 5) {
      const key = `${brtDay.getUTCFullYear()}-${String(brtDay.getUTCMonth()+1).padStart(2,'0')}-${String(brtDay.getUTCDate()).padStart(2,'0')}`;
      if (!porDia[key]) faltas++;
    }
    iter2.setUTCDate(iter2.getUTCDate() + 1);
  }

  const minutosExtra = Math.max(0, minutosTrabalhos - minutosPrevistos);
  const bancoMinutos = minutosTrabalhos - minutosPrevistos;

  function fmtMin(m) {
    const neg = m < 0, abs = Math.abs(m);
    return `${neg ? '-' : ''}${Math.floor(abs/60)}h${String(abs%60).padStart(2,'0')}`;
  }

  return {
    minutosTrabalhos, minutosPrevistos, minutosExtra, bancoMinutos,
    atrasos, faltas, diasUteis,
    horasTrabalhadas: fmtMin(minutosTrabalhos),
    horasPrevistas:   fmtMin(minutosPrevistos),
    horasExtra:       fmtMin(minutosExtra),
    bancoHoras:       fmtMin(bancoMinutos),
  };
}

// ── Registros do fechamento (com controle de acesso) ──────
async function buscarRegistrosFechamento(f, req) {
  const temDetalhes = req.user.cargo_nivel <= 2 || req.user.permissoes.includes('registros.detalhes');
  const params = [f.competencia];
  let where = `WHERE DATE_FORMAT(r.data_hora, '%Y-%m') = ?`;

  // Sempre filtra pelo usuário do fechamento (ou pelo próprio se funcionário)
  const uidFiltro = f.usuario_id || (req.user.cargo_nivel >= 3 ? req.user.id : null);
  if (uidFiltro) { where += ' AND r.usuario_id = ?'; params.push(uidFiltro); }

  const [rows] = await pool.query(
    `SELECT r.id, r.tipo, r.data_hora, r.ip, r.ip_publico,
            r.latitude, r.longitude, r.precisao,
            r.foto_registro, r.endereco_aprox,
            r.dispositivo, r.so, r.navegador, r.observacao,
            u.nome AS usuario_nome, u.email AS usuario_email,
            c.nome AS cargo_nome
     FROM registros_ponto r
     JOIN usuarios u ON u.id = r.usuario_id
     LEFT JOIN cargos c ON c.id = u.cargo_id
     ${where}
     ORDER BY r.data_hora ASC`,
    params
  );

  // IP nunca é exposto, nem para quem tem permissão de detalhes — fica só
  // no banco para auditoria técnica interna.
  const semIp = rows.map(({ ip, ip_publico, ...pub }) => pub);
  if (temDetalhes) return semIp;
  return semIp.map(({ latitude, longitude, precisao, ...pub }) => pub);
}

// ── Notificação helper ────────────────────────────────────
async function notificar(usuario_id, tipo, titulo, mensagem, fechamento_id = null) {
  await pool.query(
    `INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem, fechamento_id)
     VALUES (?, ?, ?, ?, ?)`,
    [usuario_id, tipo, titulo, mensagem, fechamento_id]
  );
  enviarPush(usuario_id, titulo, mensagem).catch(() => {});
}

async function notificarGestores(tipo, titulo, mensagem, fechamento_id, excluir_id = null, company_id = null) {
  const cidFilter = company_id ? ' AND u.company_id = ?' : '';
  const params = company_id ? [company_id] : [];
  const [gestores] = await pool.query(
    `SELECT u.id FROM usuarios u JOIN cargos c ON c.id = u.cargo_id
     WHERE c.nivel <= 2 AND u.ativo = 1${cidFilter}`,
    params
  );
  for (const g of gestores) {
    if (g.id !== excluir_id) await notificar(g.id, tipo, titulo, mensagem, fechamento_id);
  }
}

// ── Cabeçalho comum dos queries de fechamento ─────────────
const SELECT_FECHAMENTO = `
  SELECT f.*,
    u.nome   AS criado_por_nome,
    fu.nome  AS usuario_nome, fu.email AS usuario_email,
    fu.cpf   AS usuario_cpf, fu.telefone AS usuario_telefone,
    c.nome   AS cargo_nome,
    ep.nome  AS enviado_por_nome,
    fdp.nome AS fechado_definitivo_por_nome
  FROM fechamentos_folha f
  LEFT JOIN usuarios u   ON u.id   = f.criado_por
  LEFT JOIN usuarios fu  ON fu.id  = f.usuario_id
  LEFT JOIN cargos c     ON c.id   = fu.cargo_id
  LEFT JOIN usuarios ep  ON ep.id  = f.enviado_por
  LEFT JOIN usuarios fdp ON fdp.id = f.fechado_definitivo_por`;

// assinado_ip fica só no banco para auditoria técnica interna — nunca é
// exposto via API.
function semIpFechamento(f) {
  if (!f) return f;
  const { assinado_ip, ...resto } = f;
  return resto;
}

// ══════════════════════════════════════════════════════════
// ENDPOINTS
// ══════════════════════════════════════════════════════════

// GET /api/fechamento
async function listar(req, res) {
  try {
    const { pagina = 1, por_pagina = 30, competencia, usuario_id, status } = req.query;
    const pg     = Math.max(1, parseInt(pagina)     || 1);
    const pp     = Math.min(100, parseInt(por_pagina) || 30);
    const offset = (pg - 1) * pp;

    const cid    = req.user.company_id;
    const params = [];
    let where = 'WHERE 1=1';

    if (cid) {
      where += ' AND (f.usuario_id IN (SELECT id FROM usuarios WHERE company_id = ?) OR f.usuario_id IS NULL)';
      params.push(cid);
    }

    if (req.user.cargo_nivel >= 3) {
      // Funcionário: apenas os próprios
      where += ' AND f.usuario_id = ?'; params.push(req.user.id);
    } else {
      if (usuario_id) { where += ' AND f.usuario_id = ?'; params.push(usuario_id); }
    }

    if (competencia) { where += ' AND f.competencia = ?'; params.push(competencia); }
    if (status)      { where += ' AND f.status = ?';      params.push(status); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM fechamentos_folha f ${where}`, params
    );

    const [rows] = await pool.query(
      `${SELECT_FECHAMENTO} ${where}
       ORDER BY f.competencia DESC, fu.nome ASC, f.id DESC
       LIMIT ${pp} OFFSET ${offset}`,
      params
    );

    return res.json({ total, pagina: pg, por_pagina: pp, fechamentos: rows.map(semIpFechamento) });
  } catch (err) {
    console.error('[Fechamento] listar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/fechamento/usuarios-disponiveis?competencia=YYYY-MM
async function usuariosDisponiveis(req, res) {
  try {
    const { competencia } = req.query;
    if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
      return res.status(400).json({ erro: 'Competência inválida.' });
    }
    const cid = req.user.company_id;
    const cidFilter = cid ? ' AND u.company_id = ?' : '';
    const params = cid ? [competencia, cid] : [competencia];
    const [rows] = await pool.query(
      `SELECT u.id, u.nome, u.email, c.nome AS cargo_nome,
              (SELECT COUNT(*) FROM fechamentos_folha f
               WHERE f.usuario_id = u.id AND f.competencia = ?) AS ja_tem_fechamento
       FROM usuarios u
       LEFT JOIN cargos c ON c.id = u.cargo_id
       WHERE u.ativo = 1${cidFilter}
       ORDER BY u.nome ASC`,
      params
    );
    return res.json({ usuarios: rows });
  } catch (err) {
    console.error('[Fechamento] usuariosDisponiveis:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/fechamento/:id
async function detalhe(req, res) {
  try {
    const { id } = req.params;
    const [[f]] = await pool.query(`${SELECT_FECHAMENTO} WHERE f.id = ?`, [id]);
    if (!f) return res.status(404).json({ erro: 'Fechamento não encontrado.' });

    if (req.user.cargo_nivel >= 3 && f.usuario_id !== req.user.id) {
      return res.status(403).json({ erro: 'Acesso negado.' });
    }

    const registros   = await buscarRegistrosFechamento(f, req);
    const resumo       = calcularResumo(registros, f.competencia);
    const assinaturas  = await buscarAssinaturas(f.id);

    return res.json({ fechamento: semIpFechamento(f), registros, resumo, assinaturas });
  } catch (err) {
    console.error('[Fechamento] detalhe:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/fechamento/assinaturas/historico — quem assinou, quando, pendências
async function historicoAssinaturas(req, res) {
  try {
    const cid = req.user.company_id;
    const params = [];
    let where = 'WHERE 1=1';
    if (cid) { where += ' AND fu.company_id = ?'; params.push(cid); }
    if (req.user.cargo_nivel >= 3) { where += ' AND f.usuario_id = ?'; params.push(req.user.id); }

    const [rows] = await pool.query(
      `SELECT f.id AS fechamento_id, f.competencia, f.status,
              fu.nome AS usuario_nome,
              fa_col.nome_assinante  AS colaborador_nome,  fa_col.assinado_em  AS colaborador_assinado_em,
              fa_resp.nome_assinante AS responsavel_nome, fa_resp.assinado_em AS responsavel_assinado_em
       FROM fechamentos_folha f
       JOIN usuarios fu ON fu.id = f.usuario_id
       LEFT JOIN fechamento_assinaturas fa_col  ON fa_col.fechamento_id  = f.id AND fa_col.tipo  = 'colaborador'
       LEFT JOIN fechamento_assinaturas fa_resp ON fa_resp.fechamento_id = f.id AND fa_resp.tipo = 'responsavel'
       ${where} AND f.status NOT IN ('rascunho')
       ORDER BY f.competencia DESC, fu.nome ASC
       LIMIT 200`,
      params
    );

    const historico = rows.map(r => ({
      ...r,
      pendencia: r.status === 'enviado' && !r.colaborador_nome ? 'colaborador'
        : r.status === 'assinado' && !r.responsavel_nome ? 'responsavel'
        : null,
    }));

    return res.json({ historico });
  } catch (err) {
    console.error('[Fechamento] historicoAssinaturas:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/fechamento — cria um fechamento por funcionário selecionado
async function criar(req, res) {
  const { competencia, observacao, usuario_ids } = req.body;

  if (!competencia || !/^\d{4}-\d{2}$/.test(competencia)) {
    return res.status(400).json({ erro: 'Competência inválida. Use YYYY-MM.' });
  }
  if (!Array.isArray(usuario_ids) || usuario_ids.length === 0) {
    return res.status(400).json({ erro: 'Selecione pelo menos um funcionário.' });
  }

  const [ano, mes]  = competencia.split('-').map(Number);
  const dataInicio  = `${competencia}-01`;
  const ultimoDia   = new Date(ano, mes, 0).getDate();
  const dataFim     = `${competencia}-${String(ultimoDia).padStart(2, '0')}`;

  try {
    let criados = 0, duplicados = 0;

    for (const uid of usuario_ids) {
      const [[exist]] = await pool.query(
        'SELECT id FROM fechamentos_folha WHERE usuario_id = ? AND competencia = ?',
        [uid, competencia]
      );
      if (exist) { duplicados++; continue; }

      await pool.query(
        `INSERT INTO fechamentos_folha
           (usuario_id, competencia, data_inicio, data_fim, status, criado_por, observacao)
         VALUES (?, ?, ?, ?, 'rascunho', ?, ?)`,
        [uid, competencia, dataInicio, dataFim, req.user.id, observacao || null]
      );
      criados++;
    }

    await LogAcesso.registrar({
      usuario_id: req.user.id,
      acao: 'fechamento.criado',
      descricao: `Fechamento ${competencia} criado para ${criados} funcionário(s)`,
      ip: getClientIp(req),
      user_agent: req.headers['user-agent'] || '',
    });

    return res.status(201).json({
      mensagem: `${criados} fechamento(s) criado(s).${duplicados ? ` ${duplicados} ignorado(s) (já existia).` : ''}`,
      criados, duplicados,
    });
  } catch (err) {
    console.error('[Fechamento] criar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PATCH /api/fechamento/:id/enviar — envia para assinatura do funcionário
async function enviar(req, res) {
  try {
    const { id } = req.params;
    const [[f]] = await pool.query('SELECT * FROM fechamentos_folha WHERE id = ?', [id]);
    if (!f) return res.status(404).json({ erro: 'Fechamento não encontrado.' });
    if (!['rascunho', 'rejeitado'].includes(f.status)) {
      return res.status(409).json({ erro: `Não é possível enviar com status "${f.status}".` });
    }
    if (!f.usuario_id) {
      return res.status(400).json({ erro: 'Fechamento sem funcionário vinculado.' });
    }

    await pool.query(
      `UPDATE fechamentos_folha
       SET status = 'enviado', enviado_em = NOW(), enviado_por = ?,
           rejeitado_em = NULL, motivo_rejeicao = NULL
       WHERE id = ?`,
      [req.user.id, id]
    );

    const [ano, mes] = f.competencia.split('-');
    const nomeMes = new Date(ano, mes - 1).toLocaleString('pt-BR', { month: 'long' });
    const label   = `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}/${ano}`;

    await notificar(
      f.usuario_id, 'relatorio_recebido',
      `Relatório de ${label} disponível para conferência`,
      'Seu relatório de ponto foi enviado. Acesse "Meus Relatórios" para revisar e assinar.',
      f.id
    );

    await LogAcesso.registrar({
      usuario_id: req.user.id,
      acao: 'fechamento.enviado',
      descricao: `Fechamento ID ${id} enviado para assinatura`,
      ip: getClientIp(req), user_agent: req.headers['user-agent'] || '',
    });

    return res.json({ mensagem: 'Relatório enviado ao funcionário.' });
  } catch (err) {
    console.error('[Fechamento] enviar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PATCH /api/fechamento/:id/assinar — funcionário ou admin/RH assina
async function assinar(req, res) {
  try {
    const { id } = req.params;
    const { assinatura_imagem } = req.body;
    const assinaturaUrl = salvarAssinaturaImagem(assinatura_imagem);
    if (!assinaturaUrl) {
      return res.status(400).json({ erro: 'Assinatura desenhada é obrigatória (PNG em base64).' });
    }

    const [[f]] = await pool.query('SELECT * FROM fechamentos_folha WHERE id = ?', [id]);
    if (!f) return res.status(404).json({ erro: 'Fechamento não encontrado.' });
    if (req.user.cargo_nivel >= 3 && f.usuario_id !== req.user.id) {
      return res.status(403).json({ erro: 'Você só pode assinar seus próprios relatórios.' });
    }
    if (f.status !== 'enviado') {
      return res.status(409).json({ erro: 'Somente relatórios enviados podem ser assinados.' });
    }

    const ip = getClientIp(req);
    const tipo = (f.usuario_id === req.user.id) ? 'colaborador' : 'responsavel';
    const [[signer]] = await pool.query(
      `SELECT u.nome, c.nome AS cargo_nome FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id WHERE u.id = ?`,
      [req.user.id]
    );

    await pool.query(
      `INSERT INTO fechamento_assinaturas (fechamento_id, tipo, usuario_id, nome_assinante, cargo_assinante, assinatura_url, assinado_ip)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), nome_assinante = VALUES(nome_assinante),
         cargo_assinante = VALUES(cargo_assinante), assinatura_url = VALUES(assinatura_url),
         assinado_em = NOW(), assinado_ip = VALUES(assinado_ip)`,
      [id, tipo, req.user.id, signer?.nome || '', signer?.cargo_nome || null, assinaturaUrl, ip]
    );

    await pool.query(
      `UPDATE fechamentos_folha SET status = 'assinado', assinado_em = NOW(), assinado_ip = ? WHERE id = ?`,
      [ip, id]
    );

    const [ano, mes] = f.competencia.split('-');
    const nomeMes = new Date(ano, mes - 1).toLocaleString('pt-BR', { month: 'long' });
    const label   = `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}/${ano}`;
    const [[func]] = await pool.query('SELECT nome FROM usuarios WHERE id = ?', [req.user.id]);

    await notificarGestores(
      'relatorio_assinado',
      `${func?.nome || 'Funcionário'} assinou o relatório de ${label}`,
      'O relatório está pronto para fechamento definitivo.',
      f.id, req.user.id, req.user.company_id
    );

    await LogAcesso.registrar({
      usuario_id: req.user.id,
      acao: 'fechamento.assinado',
      descricao: `Fechamento ID ${id} assinado pelo funcionário (IP: ${ip})`,
      ip, user_agent: req.headers['user-agent'] || '',
    });

    return res.json({ mensagem: 'Relatório assinado com sucesso.' });
  } catch (err) {
    console.error('[Fechamento] assinar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PATCH /api/fechamento/:id/rejeitar — funcionário ou admin/RH rejeita
async function rejeitar(req, res) {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    if (!motivo?.trim()) return res.status(400).json({ erro: 'Informe o motivo da rejeição.' });

    const [[f]] = await pool.query('SELECT * FROM fechamentos_folha WHERE id = ?', [id]);
    if (!f) return res.status(404).json({ erro: 'Fechamento não encontrado.' });
    if (req.user.cargo_nivel >= 3 && f.usuario_id !== req.user.id) {
      return res.status(403).json({ erro: 'Você só pode rejeitar seus próprios relatórios.' });
    }
    if (f.status !== 'enviado') {
      return res.status(409).json({ erro: 'Somente relatórios enviados podem ser rejeitados.' });
    }

    await pool.query(
      `UPDATE fechamentos_folha SET status = 'rejeitado', rejeitado_em = NOW(), motivo_rejeicao = ? WHERE id = ?`,
      [motivo.trim(), id]
    );

    const [ano, mes] = f.competencia.split('-');
    const nomeMes = new Date(ano, mes - 1).toLocaleString('pt-BR', { month: 'long' });
    const label   = `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}/${ano}`;
    const [[func]] = await pool.query('SELECT nome FROM usuarios WHERE id = ?', [req.user.id]);

    await notificarGestores(
      'relatorio_rejeitado',
      `${func?.nome || 'Funcionário'} rejeitou o relatório de ${label}`,
      `Motivo: ${motivo.trim()}`,
      f.id, req.user.id, req.user.company_id
    );

    await LogAcesso.registrar({
      usuario_id: req.user.id,
      acao: 'fechamento.rejeitado',
      descricao: `Fechamento ID ${id} rejeitado: ${motivo.trim()}`,
      ip: getClientIp(req), user_agent: req.headers['user-agent'] || '',
    });

    return res.json({ mensagem: 'Relatório rejeitado. O RH foi notificado.' });
  } catch (err) {
    console.error('[Fechamento] rejeitar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PATCH /api/fechamento/:id/fechar — fechamento definitivo (assinatura do responsável)
async function fechar(req, res) {
  try {
    const { id } = req.params;
    const { assinatura_imagem } = req.body;
    const assinaturaUrl = salvarAssinaturaImagem(assinatura_imagem);
    if (!assinaturaUrl) {
      return res.status(400).json({ erro: 'Assinatura desenhada do responsável é obrigatória (PNG em base64).' });
    }

    const [[f]] = await pool.query(`${SELECT_FECHAMENTO} WHERE f.id = ?`, [id]);
    if (!f) return res.status(404).json({ erro: 'Fechamento não encontrado.' });
    if (f.status !== 'assinado') {
      return res.status(409).json({ erro: 'O relatório precisa ser assinado pelo funcionário antes do fechamento definitivo.' });
    }

    const ip = getClientIp(req);
    const [[signer]] = await pool.query(
      `SELECT u.nome, c.nome AS cargo_nome FROM usuarios u LEFT JOIN cargos c ON c.id = u.cargo_id WHERE u.id = ?`,
      [req.user.id]
    );

    await pool.query(
      `INSERT INTO fechamento_assinaturas (fechamento_id, tipo, usuario_id, nome_assinante, cargo_assinante, assinatura_url, assinado_ip)
       VALUES (?, 'responsavel', ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE usuario_id = VALUES(usuario_id), nome_assinante = VALUES(nome_assinante),
         cargo_assinante = VALUES(cargo_assinante), assinatura_url = VALUES(assinatura_url),
         assinado_em = NOW(), assinado_ip = VALUES(assinado_ip)`,
      [id, req.user.id, signer?.nome || '', signer?.cargo_nome || null, assinaturaUrl, ip]
    );

    await pool.query(
      `UPDATE fechamentos_folha
       SET status = 'fechado', fechado_definitivo_em = NOW(), fechado_definitivo_por = ?
       WHERE id = ?`,
      [req.user.id, id]
    );

    // Notifica o funcionário
    const [ano, mes] = f.competencia.split('-');
    const nomeMes = new Date(ano, mes - 1).toLocaleString('pt-BR', { month: 'long' });
    const label   = `${nomeMes.charAt(0).toUpperCase() + nomeMes.slice(1)}/${ano}`;
    await notificar(
      f.usuario_id, 'sistema',
      `Relatório de ${label} finalizado`,
      'Seu relatório de ponto foi fechado definitivamente pelo RH.',
      f.id
    );

    await LogAcesso.registrar({
      usuario_id: req.user.id,
      acao: 'fechamento.fechado_definitivo',
      descricao: `Fechamento ID ${id} encerrado definitivamente`,
      ip, user_agent: req.headers['user-agent'] || '',
    });

    // Envio automático do PDF assinado por e-mail ao colaborador.
    if (f.usuario_email) {
      try {
        const pdfBuffer = await gerarPDFBuffer(f, req, req.user.company_id);
        const enviado = await enviarFechamentoAssinadoEmail(f.usuario_email, f.usuario_nome || '', label, pdfBuffer);
        await LogAcesso.registrar({
          usuario_id: f.usuario_id,
          acao: 'fechamento.email_enviado',
          descricao: `Cópia do fechamento ID ${id} ${enviado ? 'enviada' : 'falhou ao enviar'} para ${f.usuario_email}`,
        });
      } catch (emailErr) {
        console.error('[Fechamento] envio automatico de e-mail falhou:', emailErr.message);
      }
    }

    return res.json({ mensagem: 'Folha fechada definitivamente. O colaborador recebeu uma cópia assinada por e-mail.' });
  } catch (err) {
    console.error('[Fechamento] fechar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PATCH /api/fechamento/:id/reabrir — volta para rascunho (sem ser fechado definitivo)
async function reabrir(req, res) {
  try {
    const { id } = req.params;
    const [[f]] = await pool.query('SELECT * FROM fechamentos_folha WHERE id = ?', [id]);
    if (!f) return res.status(404).json({ erro: 'Fechamento não encontrado.' });
    if (f.status === 'rascunho') return res.status(409).json({ erro: 'Já está em rascunho.' });
    if (f.status === 'fechado' && req.user.cargo_nivel > 1) {
      return res.status(403).json({ erro: 'Apenas administradores podem reabrir um fechamento definitivo.' });
    }

    await pool.query(
      `UPDATE fechamentos_folha
       SET status = 'rascunho', enviado_em = NULL, enviado_por = NULL,
           assinado_em = NULL, assinado_ip = NULL, rejeitado_em = NULL, motivo_rejeicao = NULL,
           fechado_definitivo_em = NULL, fechado_definitivo_por = NULL
       WHERE id = ?`,
      [id]
    );

    await LogAcesso.registrar({
      usuario_id: req.user.id,
      acao: 'fechamento.reaberto',
      descricao: `Fechamento ID ${id} revertido para rascunho`,
      ip: getClientIp(req), user_agent: req.headers['user-agent'] || '',
    });

    return res.json({ mensagem: 'Fechamento voltou para rascunho.' });
  } catch (err) {
    console.error('[Fechamento] reabrir:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// DELETE /api/fechamento/:id
async function excluir(req, res) {
  try {
    const { id } = req.params;
    const [[f]] = await pool.query('SELECT * FROM fechamentos_folha WHERE id = ?', [id]);
    if (!f) return res.status(404).json({ erro: 'Fechamento não encontrado.' });
    if (f.status !== 'rascunho') {
      return res.status(409).json({ erro: 'Somente rascunhos podem ser excluídos.' });
    }

    await pool.query('DELETE FROM notificacoes WHERE fechamento_id = ?', [id]);
    await pool.query('DELETE FROM fechamentos_folha WHERE id = ?', [id]);

    await LogAcesso.registrar({
      usuario_id: req.user.id,
      acao: 'fechamento.excluido',
      descricao: `Fechamento ID ${id} excluído`,
      ip: getClientIp(req), user_agent: req.headers['user-agent'] || '',
    });

    return res.json({ mensagem: 'Fechamento excluído.' });
  } catch (err) {
    console.error('[Fechamento] excluir:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// ── Exportações ───────────────────────────────────────────
const STATUS_LABEL = {
  rascunho: 'Rascunho', enviado: 'Enviado para Assinatura',
  assinado: 'Assinado', rejeitado: 'Rejeitado', fechado: 'Fechado',
};

// GET /api/fechamento/:id/pdf
// Monta o conteúdo do PDF do fechamento no `doc` passado (não chama doc.end()).
// Usado tanto pelo download direto (exportarPDF) quanto pelo e-mail automático.
async function montarPDFFechamento(doc, f, registros, resumo, req, assinaturas, empresa) {
  const mes = new Date(f.competencia + '-01').toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

  // Logo + nome da empresa
  if (empresa?.logo) {
    try {
      const logoPath = path.join(UPLOADS_ROOT, empresa.logo.replace(/^\/uploads\//, ''));
      if (fs.existsSync(logoPath)) doc.image(logoPath, 50, 40, { fit: [60, 60] });
    } catch { /* logo opcional — segue sem ela */ }
  }
  doc.fontSize(14).fillColor('#1e3a5f').text(empresa?.nome || '', 120, 45, { width: 600 });
  doc.fontSize(16).fillColor('#1e3a5f').text('Relatório de Ponto — Fechamento de Folha', 120, 64, { width: 600 });
  doc.y = 110;

  doc.fontSize(11).fillColor('#333').text(`Funcionário: ${f.usuario_nome || '-'}`, { align: 'center' });
  const infoLinha = [
    f.usuario_cpf       ? `CPF: ${f.usuario_cpf}`         : null,
    f.cargo_nome        ? `Cargo: ${f.cargo_nome}`         : null,
    f.usuario_email     ? `E-mail: ${f.usuario_email}`     : null,
    f.usuario_telefone  ? `Tel.: ${f.usuario_telefone}`    : null,
  ].filter(Boolean).join('   |   ');
  if (infoLinha) doc.fontSize(9).fillColor('#444').text(infoLinha, { align: 'center' });
  doc.fontSize(10).fillColor('#333').text(`Competência: ${mes}`, { align: 'center' });
  doc.fontSize(9).fillColor('#555')
     .text(`Status: ${STATUS_LABEL[f.status] || f.status}  |  Gerado em: ${new Date().toLocaleString('pt-BR')}`, { align: 'center' });
  doc.moveDown(0.5);
  doc.moveTo(50, doc.y).lineTo(790, doc.y).strokeColor('#1e3a5f').lineWidth(1).stroke();
  doc.moveDown(0.5);

  // Resumo de horas
  doc.fontSize(10).fillColor('#333').text(
    `Trabalhadas: ${resumo.horasTrabalhadas}  |  Previstas: ${resumo.horasPrevistas}  |  Extras: ${resumo.horasExtra}  |  Banco: ${resumo.bancoHoras}  |  Faltas: ${resumo.faltas}  |  Atrasos: ${resumo.atrasos}`,
    { align: 'center' }
  );
  doc.moveDown(0.5);

  if (f.motivo_rejeicao) {
    doc.fontSize(9).fillColor('#991b1b').text(`✗ Rejeitado: ${f.motivo_rejeicao}`, { align: 'center' });
    doc.moveDown(0.5);
  }

  // Tabela
  const cols  = [50, 175, 270, 360, 440, 540];
  const heads = ['Data/Hora', 'Tipo', 'Dispositivo', 'Navegador', 'GPS', 'Endereço'];
  doc.rect(50, doc.y, 740, 16).fill('#1e3a5f');
  const hy = doc.y - 14;
  heads.forEach((h, i) => {
    doc.fontSize(8).fillColor('#fff').text(h, cols[i], hy, { width: (cols[i+1] || 790) - cols[i] - 4 });
  });
  doc.moveDown(0.4);

  const temDet = req.user.cargo_nivel <= 2 || req.user.permissoes.includes('registros.detalhes');
  registros.forEach((r, idx) => {
    if (doc.y > 540) { doc.addPage({ layout: 'landscape' }); doc.moveDown(0.4); }
    const rowY = doc.y;
    doc.rect(50, rowY, 740, 14).fill(idx % 2 === 0 ? '#f0f4ff' : '#fff');
    const vals = [
      new Date(r.data_hora).toLocaleString('pt-BR'),
      r.tipo,
      r.dispositivo   || '-',
      r.navegador     || '-',
      temDet && r.latitude ? `${Number(r.latitude).toFixed(4)}` : '-',
      r.endereco_aprox ? r.endereco_aprox.substring(0, 60) : '-',
    ];
    vals.forEach((v, i) => {
      doc.fontSize(7.5).fillColor('#333').text(String(v), cols[i], rowY + 2, {
        width: (cols[i+1] || 790) - cols[i] - 4, ellipsis: true, lineBreak: false,
      });
    });
    doc.y = rowY + 14;
  });

  doc.moveDown(0.8);
  doc.fontSize(8).fillColor('#888').text(`Total: ${registros.length} registros`, { align: 'right' });

  // ── Assinaturas ───────────────────────────────────────────
  const colaborador = assinaturas.find(a => a.tipo === 'colaborador');
  const responsavel = assinaturas.find(a => a.tipo === 'responsavel');

  if (colaborador || responsavel) {
    if (doc.y > 430) { doc.addPage({ layout: 'landscape' }); doc.moveDown(0.4); }
    doc.moveDown(1.2);
    doc.fontSize(11).fillColor('#1e3a5f').text('Assinaturas', 50, doc.y);
    doc.moveDown(0.4);
    const baseY = doc.y;

    [{ a: colaborador, label: 'Colaborador', x: 50 }, { a: responsavel, label: 'Responsável', x: 420 }].forEach(({ a, label, x }) => {
      doc.fontSize(9).fillColor('#475569').text(label, x, baseY);
      if (a) {
        try {
          const imgPath = path.join(UPLOADS_ROOT, a.assinatura_url.replace(/^\/uploads\//, ''));
          if (fs.existsSync(imgPath)) doc.image(imgPath, x, baseY + 14, { fit: [280, 70] });
        } catch { /* segue sem a imagem se falhar */ }
        doc.fontSize(8).fillColor('#333').text(
          `${a.nome_assinante}${a.cargo_assinante ? ' — ' + a.cargo_assinante : ''}`, x, baseY + 88, { width: 280 }
        );
        doc.fontSize(7.5).fillColor('#64748b').text(
          `Assinado em ${new Date(a.assinado_em).toLocaleString('pt-BR')}`, x, baseY + 100, { width: 280 }
        );
      } else {
        doc.fontSize(8).fillColor('#94a3b8').text('Pendente', x, baseY + 14);
      }
    });
  }
}

// GET /api/fechamento/:id/pdf
async function exportarPDF(req, res) {
  try {
    const { id } = req.params;
    const [[f]] = await pool.query(
      `${SELECT_FECHAMENTO} WHERE f.id = ?`, [id]
    );
    if (!f) return res.status(404).json({ erro: 'Fechamento não encontrado.' });
    if (req.user.cargo_nivel >= 3 && f.usuario_id !== req.user.id) {
      return res.status(403).json({ erro: 'Acesso negado.' });
    }

    const registros    = await buscarRegistrosFechamento(f, req);
    const resumo        = calcularResumo(registros, f.competencia);
    const assinaturas   = await buscarAssinaturas(f.id);
    const cid = req.user.company_id;
    const [[empresa]] = cid ? await pool.query('SELECT nome, logo FROM empresas WHERE id = ?', [cid]) : [[null]];

    const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition',
      `attachment; filename="fechamento-${f.competencia}-${(f.usuario_nome || 'geral').replace(/\s+/g, '_')}.pdf"`);
    doc.pipe(res);
    await montarPDFFechamento(doc, f, registros, resumo, req, assinaturas, empresa);
    doc.end();
  } catch (err) {
    console.error('[Fechamento] exportarPDF:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// Gera o PDF do fechamento em memória (Buffer) — usado para anexar no e-mail
// automático após a assinatura final, sem precisar de uma requisição HTTP.
async function gerarPDFBuffer(f, req, companyId) {
  const registros  = await buscarRegistrosFechamento(f, req);
  const resumo      = calcularResumo(registros, f.competencia);
  const assinaturas = await buscarAssinaturas(f.id);
  const [[empresa]] = companyId
    ? await pool.query('SELECT nome, logo FROM empresas WHERE id = ?', [companyId])
    : [[null]];

  const doc = new PDFDocument({ margin: 50, size: 'A4', layout: 'landscape' });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const fim = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));
  await montarPDFFechamento(doc, f, registros, resumo, req, assinaturas, empresa);
  doc.end();
  return fim;
}

// GET /api/fechamento/:id/excel
async function exportarExcel(req, res) {
  try {
    const { id } = req.params;
    const [[f]] = await pool.query(`${SELECT_FECHAMENTO} WHERE f.id = ?`, [id]);
    if (!f) return res.status(404).json({ erro: 'Fechamento não encontrado.' });
    if (req.user.cargo_nivel >= 3 && f.usuario_id !== req.user.id) {
      return res.status(403).json({ erro: 'Acesso negado.' });
    }

    const registros = await buscarRegistrosFechamento(f, req);
    const resumo    = calcularResumo(registros, f.competencia);

    const wb   = new xl.Workbook();
    const ws   = wb.addWorksheet(`Folha ${f.competencia}`);
    const bold = wb.createStyle({ font: { bold: true, color: '#FFFFFF' }, fill: { type: 'pattern', patternType: 'solid', fgColor: '#1e3a5f' } });
    const hd   = wb.createStyle({ font: { bold: true } });
    const alt  = wb.createStyle({ fill: { type: 'pattern', patternType: 'solid', fgColor: '#EEF2FF' } });

    // Info
    const info = [
      ['Funcionário',  f.usuario_nome      || '-'],
      ['CPF',          f.usuario_cpf       || '-'],
      ['E-mail',       f.usuario_email     || '-'],
      ['Telefone',     f.usuario_telefone  || '-'],
      ['Cargo',        f.cargo_nome        || '-'],
      ['Competência',  f.competencia],
      ['Status',       STATUS_LABEL[f.status] || f.status],
      ['Trabalhadas',  resumo.horasTrabalhadas],
      ['Previstas',    resumo.horasPrevistas],
      ['Extras',       resumo.horasExtra],
      ['Banco',        resumo.bancoHoras],
      ['Faltas',       `${resumo.faltas} dia(s)`],
      ['Atrasos',      `${resumo.atrasos}`],
    ];
    info.forEach(([k, v], i) => {
      ws.cell(i + 1, 1).string(k).style(hd);
      ws.cell(i + 1, 2).string(String(v));
    });

    // Tabela de registros
    const headers = ['Data', 'Hora', 'Tipo', 'Dispositivo', 'Navegador', 'GPS Lat', 'GPS Lng', 'Endereço'];
    headers.forEach((h, i) => ws.cell(12, i + 1).string(h).style(bold));

    registros.forEach((r, idx) => {
      const row = idx + 13;
      const dt  = new Date(r.data_hora);
      const stl = idx % 2 === 1 ? alt : {};
      ws.cell(row, 1).string(dt.toLocaleDateString('pt-BR')).style(stl);
      ws.cell(row, 2).string(dt.toLocaleTimeString('pt-BR')).style(stl);
      ws.cell(row, 3).string(r.tipo).style(stl);
      ws.cell(row, 4).string(r.dispositivo   || '').style(stl);
      ws.cell(row, 5).string(r.navegador     || '').style(stl);
      ws.cell(row, 6).string(r.latitude  ? String(r.latitude)  : '').style(stl);
      ws.cell(row, 7).string(r.longitude ? String(r.longitude) : '').style(stl);
      ws.cell(row, 8).string(r.endereco_aprox || '').style(stl);
    });

    [100, 80, 80, 110, 130, 90, 90, 220].forEach((w, i) => ws.column(i + 1).setWidth(w / 7));

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="fechamento-${f.competencia}.xlsx"`);
    wb.write('fechamento.xlsx', res);
  } catch (err) {
    console.error('[Fechamento] exportarExcel:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = {
  listar, usuariosDisponiveis, detalhe,
  criar, enviar, assinar, rejeitar, fechar, reabrir, excluir,
  exportarPDF, exportarExcel, historicoAssinaturas,
};
