const { pool } = require('../database/connection');

// GET /api/notificacoes
async function listar(req, res) {
  try {
    const { lida, pagina = 1, por_pagina = 30 } = req.query;
    const pg     = Math.max(1, parseInt(pagina)     || 1);
    const pp     = Math.min(50, parseInt(por_pagina) || 30);
    const offset = (pg - 1) * pp;

    const params = [req.user.id];
    let where = 'WHERE usuario_id = ?';
    if (lida === '0') where += ' AND lida = 0';
    if (lida === '1') where += ' AND lida = 1';

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM notificacoes ${where}`, params
    );

    const [rows] = await pool.query(
      `SELECT * FROM notificacoes ${where}
       ORDER BY created_at DESC LIMIT ${pp} OFFSET ${offset}`,
      params
    );

    return res.json({ total, pagina: pg, por_pagina: pp, notificacoes: rows });
  } catch (err) {
    console.error('[Notificacoes] listar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/notificacoes/nao-lidas
async function naoLidas(req, res) {
  try {
    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM notificacoes WHERE usuario_id = ? AND lida = 0',
      [req.user.id]
    );
    return res.json({ total });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PATCH /api/notificacoes/:id/ler
async function marcarLida(req, res) {
  try {
    await pool.query(
      'UPDATE notificacoes SET lida = 1 WHERE id = ? AND usuario_id = ?',
      [req.params.id, req.user.id]
    );
    return res.json({ mensagem: 'Notificação lida.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PATCH /api/notificacoes/ler-todas
async function marcarTodasLidas(req, res) {
  try {
    await pool.query(
      'UPDATE notificacoes SET lida = 1 WHERE usuario_id = ?',
      [req.user.id]
    );
    return res.json({ mensagem: 'Todas marcadas como lidas.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { listar, naoLidas, marcarLida, marcarTodasLidas };
