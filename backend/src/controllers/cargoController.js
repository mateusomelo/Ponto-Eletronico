const { pool }        = require('../database/connection');
const LogAcesso       = require('../models/LogAcesso');
const { getClientIp } = require('../utils/ip');

const ip = getClientIp;

// GET /api/cargos
async function listar(req, res) {
  try {
    const [cargos] = await pool.query(
      `SELECT c.*, COUNT(u.id) AS total_usuarios
       FROM cargos c
       LEFT JOIN usuarios u ON u.cargo_id = c.id
       GROUP BY c.id ORDER BY c.nivel ASC, c.nome ASC`
    );

    for (const c of cargos) {
      const [perms] = await pool.query(
        `SELECT p.id, p.nome, p.descricao FROM permissoes p
         JOIN cargo_permissoes cp ON cp.permissao_id = p.id
         WHERE cp.cargo_id = ?`,
        [c.id]
      );
      c.permissoes = perms;
    }

    return res.json(cargos);
  } catch (err) {
    console.error('[Cargo] listar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/cargos/:id
async function obter(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM cargos WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ erro: 'Cargo não encontrado.' });

    const [perms] = await pool.query(
      `SELECT p.* FROM permissoes p
       JOIN cargo_permissoes cp ON cp.permissao_id = p.id
       WHERE cp.cargo_id = ?`,
      [req.params.id]
    );
    return res.json({ ...rows[0], permissoes: perms });
  } catch (err) {
    console.error('[Cargo] obter:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/cargos
async function criar(req, res) {
  const { nome, descricao, nivel, permissoes } = req.body;
  if (!nome || !nivel) return res.status(400).json({ erro: 'Nome e nível são obrigatórios.' });
  if (nivel < 1 || nivel > 3) return res.status(400).json({ erro: 'Nível inválido (1-3).' });

  try {
    const [result] = await pool.query(
      'INSERT INTO cargos (nome, descricao, nivel) VALUES (?, ?, ?)',
      [nome.trim(), descricao || null, nivel]
    );

    if (Array.isArray(permissoes) && permissoes.length) {
      const vals = permissoes.map(pid => [result.insertId, pid]);
      await pool.query('INSERT INTO cargo_permissoes (cargo_id, permissao_id) VALUES ?', [vals]);
    }

    await LogAcesso.registrar({ usuario_id: req.user.id, acao: 'cargo.criado', descricao: nome, ip: ip(req) });
    return res.status(201).json({ mensagem: 'Cargo criado.', id: result.insertId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ erro: 'Cargo já existe.' });
    console.error('[Cargo] criar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PUT /api/cargos/:id
async function editar(req, res) {
  const { nome, descricao, nivel, ativo, permissoes } = req.body;
  const id = req.params.id;

  try {
    const [atual] = await pool.query('SELECT * FROM cargos WHERE id = ?', [id]);
    if (!atual.length) return res.status(404).json({ erro: 'Cargo não encontrado.' });

    // Monta SET dinâmico
    const sets   = [];
    const params = [];

    if (nome      !== undefined && nome !== null)  { sets.push('nome = ?');      params.push(nome.trim()); }
    if (descricao !== undefined)                   { sets.push('descricao = ?'); params.push(descricao || null); }
    if (nivel     !== undefined && nivel !== null) { sets.push('nivel = ?');     params.push(nivel); }
    if (ativo     !== undefined && ativo !== null) { sets.push('ativo = ?');     params.push(ativo ? 1 : 0); }

    if (sets.length) {
      params.push(id);
      await pool.query(`UPDATE cargos SET ${sets.join(', ')} WHERE id = ?`, params);
    }

    // Atualiza permissões se enviadas
    if (Array.isArray(permissoes)) {
      await pool.query('DELETE FROM cargo_permissoes WHERE cargo_id = ?', [id]);
      if (permissoes.length) {
        const vals = permissoes.map(pid => [id, pid]);
        await pool.query('INSERT INTO cargo_permissoes (cargo_id, permissao_id) VALUES ?', [vals]);
      }
      await LogAcesso.registrar({
        usuario_id: req.user.id,
        acao:       'permissoes.alteradas',
        descricao:  `cargo id=${id}`,
        ip:         ip(req),
      });
    }

    await LogAcesso.registrar({ usuario_id: req.user.id, acao: 'cargo.editado', descricao: `id=${id}`, ip: ip(req) });
    return res.json({ mensagem: 'Cargo atualizado.' });
  } catch (err) {
    console.error('[Cargo] editar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// DELETE /api/cargos/:id
async function excluir(req, res) {
  const id = req.params.id;
  try {
    const [[{ n }]] = await pool.query('SELECT COUNT(*) AS n FROM usuarios WHERE cargo_id = ?', [id]);
    if (n > 0) return res.status(409).json({ erro: 'Cargo possui usuários vinculados.' });

    await pool.query('DELETE FROM cargos WHERE id = ?', [id]);
    await LogAcesso.registrar({ usuario_id: req.user.id, acao: 'cargo.excluido', descricao: `id=${id}`, ip: ip(req) });
    return res.json({ mensagem: 'Cargo excluído.' });
  } catch (err) {
    console.error('[Cargo] excluir:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/permissoes
async function listarPermissoes(req, res) {
  try {
    const [rows] = await pool.query('SELECT * FROM permissoes ORDER BY nome ASC');
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { listar, obter, criar, editar, excluir, listarPermissoes };
