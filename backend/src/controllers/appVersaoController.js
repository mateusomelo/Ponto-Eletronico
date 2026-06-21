const { pool } = require('../database/connection');

// GET /api/app-versoes — qualquer usuário autenticado (empresas e super admin)
async function listar(req, res) {
  try {
    const { plataforma } = req.query;
    const where  = plataforma ? 'WHERE plataforma = ?' : '';
    const params = plataforma ? [plataforma] : [];
    const [rows] = await pool.query(
      `SELECT av.*, u.nome AS publicado_por_nome
       FROM app_versoes av
       LEFT JOIN usuarios u ON u.id = av.publicado_por
       ${where}
       ORDER BY av.criado_em DESC`,
      params
    );
    return res.json({ versoes: rows });
  } catch (err) {
    console.error('[AppVersao] listar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/app-versoes/atual?plataforma=android
async function atual(req, res) {
  try {
    const plataforma = req.query.plataforma || 'android';
    const [[row]] = await pool.query(
      `SELECT av.*, u.nome AS publicado_por_nome
       FROM app_versoes av
       LEFT JOIN usuarios u ON u.id = av.publicado_por
       WHERE av.plataforma = ?
       ORDER BY av.criado_em DESC LIMIT 1`,
      [plataforma]
    );
    return res.json(row || null);
  } catch (err) {
    console.error('[AppVersao] atual:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/app-versoes — somente super_admin
async function criar(req, res) {
  const { plataforma = 'android', versao, changelog, apk_url } = req.body;
  if (!versao || !apk_url) {
    return res.status(400).json({ erro: 'Campos obrigatórios: versao, apk_url.' });
  }
  try {
    const [result] = await pool.query(
      `INSERT INTO app_versoes (plataforma, versao, changelog, apk_url, publicado_por)
       VALUES (?, ?, ?, ?, ?)`,
      [plataforma, versao, changelog || null, apk_url, req.user.id]
    );
    return res.status(201).json({ mensagem: 'Versão publicada.', id: result.insertId });
  } catch (err) {
    console.error('[AppVersao] criar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// DELETE /api/app-versoes/:id — somente super_admin
async function excluir(req, res) {
  try {
    await pool.query('DELETE FROM app_versoes WHERE id = ?', [req.params.id]);
    return res.json({ mensagem: 'Versão removida.' });
  } catch (err) {
    console.error('[AppVersao] excluir:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { listar, atual, criar, excluir };
