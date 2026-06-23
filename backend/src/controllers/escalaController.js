const { pool } = require('../database/connection');

// GET /api/escalas
async function listar(req, res) {
  try {
    const cid = req.user.company_id;
    const [rows] = await pool.query(
      'SELECT * FROM escalas WHERE company_id = ? ORDER BY nome', [cid]
    );
    return res.json({ escalas: rows });
  } catch (err) {
    console.error('[Escalas] listar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/escalas
async function criar(req, res) {
  const { nome, tipo, horario_entrada, horario_saida, dias_semana, data_referencia } = req.body;
  if (!nome || !tipo) return res.status(400).json({ erro: 'Nome e tipo são obrigatórios.' });
  if (!['fixo', '12x36'].includes(tipo)) return res.status(400).json({ erro: 'Tipo inválido.' });
  if (tipo === '12x36' && !data_referencia) {
    return res.status(400).json({ erro: 'Data de referência é obrigatória para escala 12x36.' });
  }
  if (tipo === 'fixo' && (!horario_entrada || !horario_saida)) {
    return res.status(400).json({ erro: 'Horário de entrada e saída são obrigatórios para escala fixa.' });
  }

  try {
    const cid = req.user.company_id;
    const [result] = await pool.query(
      `INSERT INTO escalas (company_id, nome, tipo, horario_entrada, horario_saida, dias_semana, data_referencia)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [cid, nome, tipo,
       tipo === 'fixo' ? horario_entrada : null,
       tipo === 'fixo' ? horario_saida   : null,
       tipo === 'fixo' ? (dias_semana || '1,2,3,4,5') : null,
       tipo === '12x36' ? data_referencia : null]
    );
    return res.status(201).json({ mensagem: 'Escala criada.', id: result.insertId });
  } catch (err) {
    console.error('[Escalas] criar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PUT /api/escalas/:id
async function editar(req, res) {
  const { id } = req.params;
  const { nome, tipo, horario_entrada, horario_saida, dias_semana, data_referencia, ativo } = req.body;
  try {
    const cid = req.user.company_id;
    const [[existe]] = await pool.query('SELECT id FROM escalas WHERE id = ? AND company_id = ?', [id, cid]);
    if (!existe) return res.status(404).json({ erro: 'Escala não encontrada.' });

    await pool.query(
      `UPDATE escalas SET nome = ?, tipo = ?, horario_entrada = ?, horario_saida = ?,
       dias_semana = ?, data_referencia = ?, ativo = ? WHERE id = ? AND company_id = ?`,
      [nome, tipo,
       tipo === 'fixo' ? horario_entrada : null,
       tipo === 'fixo' ? horario_saida   : null,
       tipo === 'fixo' ? (dias_semana || '1,2,3,4,5') : null,
       tipo === '12x36' ? data_referencia : null,
       ativo === false || ativo === 0 || ativo === '0' ? 0 : 1,
       id, cid]
    );
    return res.json({ mensagem: 'Escala atualizada.' });
  } catch (err) {
    console.error('[Escalas] editar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// DELETE /api/escalas/:id
async function excluir(req, res) {
  const { id } = req.params;
  try {
    const cid = req.user.company_id;
    await pool.query('UPDATE usuarios SET escala_id = NULL WHERE escala_id = ? AND company_id = ?', [id, cid]);
    await pool.query('DELETE FROM escalas WHERE id = ? AND company_id = ?', [id, cid]);
    return res.json({ mensagem: 'Escala excluída.' });
  } catch (err) {
    console.error('[Escalas] excluir:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { listar, criar, editar, excluir };
