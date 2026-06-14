const { pool } = require('../database/connection');

// GET /api/empresas
async function listar(req, res) {
  try {
    const [rows] = await pool.query(`
      SELECT e.*,
             COUNT(DISTINCT u.id) AS total_usuarios,
             COUNT(DISTINCT rp.id) AS total_registros
      FROM empresas e
      LEFT JOIN usuarios u  ON u.company_id = e.id AND u.role != 'super_admin'
      LEFT JOIN registros_ponto rp ON rp.usuario_id = u.id
      GROUP BY e.id
      ORDER BY e.criado_em DESC
    `);
    return res.json(rows);
  } catch (err) {
    console.error('[Empresa] listar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/empresas/:id
async function obter(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM empresas WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/empresas
async function criar(req, res) {
  const { nome, cnpj, email, telefone, plano } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório.' });
  try {
    const [result] = await pool.query(
      'INSERT INTO empresas (nome, cnpj, email, telefone, plano) VALUES (?, ?, ?, ?, ?)',
      [nome, cnpj || null, email || null, telefone || null, plano || 'basico']
    );
    const [rows] = await pool.query('SELECT * FROM empresas WHERE id = ?', [result.insertId]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Empresa] criar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PUT /api/empresas/:id
async function editar(req, res) {
  const { nome, cnpj, email, telefone, plano } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório.' });
  try {
    const [check] = await pool.query('SELECT id FROM empresas WHERE id = ?', [req.params.id]);
    if (!check.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });

    await pool.query(
      'UPDATE empresas SET nome=?, cnpj=?, email=?, telefone=?, plano=? WHERE id=?',
      [nome, cnpj || null, email || null, telefone || null, plano || 'basico', req.params.id]
    );
    const [rows] = await pool.query('SELECT * FROM empresas WHERE id = ?', [req.params.id]);
    return res.json(rows[0]);
  } catch (err) {
    console.error('[Empresa] editar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PATCH /api/empresas/:id/status
async function alterarStatus(req, res) {
  const { status } = req.body;
  if (!['active', 'past_due', 'suspended'].includes(status)) {
    return res.status(400).json({ erro: 'Status inválido. Use: active, past_due ou suspended.' });
  }
  try {
    const [check] = await pool.query('SELECT id, nome FROM empresas WHERE id = ?', [req.params.id]);
    if (!check.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });

    await pool.query('UPDATE empresas SET status = ? WHERE id = ?', [status, req.params.id]);
    return res.json({ mensagem: `Status da empresa "${check[0].nome}" alterado para "${status}".` });
  } catch (err) {
    console.error('[Empresa] alterarStatus:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// DELETE /api/empresas/:id
async function excluir(req, res) {
  const id = req.params.id;
  if (parseInt(id) === 1) {
    return res.status(400).json({ erro: 'Não é possível excluir a empresa padrão.' });
  }
  try {
    const [check] = await pool.query('SELECT id FROM empresas WHERE id = ?', [id]);
    if (!check.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });

    // Remove dados da empresa em cascata
    const [users] = await pool.query('SELECT id FROM usuarios WHERE company_id = ?', [id]);
    for (const u of users) {
      await pool.query('DELETE FROM notificacoes    WHERE usuario_id = ?', [u.id]);
      await pool.query('DELETE FROM registros_ponto WHERE usuario_id = ?', [u.id]);
      await pool.query('UPDATE fechamentos_folha SET usuario_id = NULL WHERE usuario_id = ?', [u.id]);
    }
    await pool.query('DELETE FROM usuarios  WHERE company_id = ?', [id]);
    await pool.query('DELETE FROM empresas  WHERE id = ?', [id]);

    return res.json({ mensagem: 'Empresa e todos os seus dados foram excluídos.' });
  } catch (err) {
    console.error('[Empresa] excluir:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { listar, obter, criar, editar, alterarStatus, excluir };
