const bcrypt = require('bcrypt');
const { pool } = require('../database/connection');

// GET /api/superadmin/usuarios
async function listar(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT id, nome, email, ativo, ultimo_acesso, created_at
       FROM usuarios WHERE role = 'super_admin' ORDER BY created_at ASC`
    );
    return res.json(rows);
  } catch (err) {
    console.error('[SuperAdmin] listar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/superadmin/usuarios
async function criar(req, res) {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
  }
  if (senha.length < 8) {
    return res.status(400).json({ erro: 'A senha deve ter no mínimo 8 caracteres.' });
  }

  try {
    const [dup] = await pool.query(
      'SELECT id FROM usuarios WHERE email = ?', [email.toLowerCase().trim()]
    );
    if (dup.length) return res.status(409).json({ erro: 'E-mail já cadastrado.' });

    const hash = await bcrypt.hash(senha, parseInt(process.env.BCRYPT_ROUNDS || '12'));
    const cpf  = `000.000.000-${String(Date.now()).slice(-2)}`;

    const [result] = await pool.query(
      `INSERT INTO usuarios (nome, email, cpf, senha_hash, cargo_id, company_id, role, ativo)
       VALUES (?, ?, ?, ?, 1, NULL, 'super_admin', 1)`,
      [nome.trim(), email.toLowerCase().trim(), cpf, hash]
    );

    return res.status(201).json({
      id:    result.insertId,
      nome:  nome.trim(),
      email: email.toLowerCase().trim(),
    });
  } catch (err) {
    console.error('[SuperAdmin] criar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PUT /api/superadmin/usuarios/:id
async function atualizar(req, res) {
  const { id } = req.params;
  const { nome, email, senha } = req.body;

  if (!nome || !email) {
    return res.status(400).json({ erro: 'Nome e e-mail são obrigatórios.' });
  }
  if (senha && senha.length < 8) {
    return res.status(400).json({ erro: 'A nova senha deve ter no mínimo 8 caracteres.' });
  }

  try {
    const [rows] = await pool.query(
      "SELECT id FROM usuarios WHERE role = 'super_admin' AND id = ?", [id]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Super admin não encontrado.' });

    const [dup] = await pool.query(
      'SELECT id FROM usuarios WHERE email = ? AND id != ?',
      [email.toLowerCase().trim(), id]
    );
    if (dup.length) return res.status(409).json({ erro: 'E-mail já usado por outro usuário.' });

    if (senha) {
      const hash = await bcrypt.hash(senha, parseInt(process.env.BCRYPT_ROUNDS || '12'));
      await pool.query(
        'UPDATE usuarios SET nome = ?, email = ?, senha_hash = ? WHERE id = ?',
        [nome.trim(), email.toLowerCase().trim(), hash, id]
      );
    } else {
      await pool.query(
        'UPDATE usuarios SET nome = ?, email = ? WHERE id = ?',
        [nome.trim(), email.toLowerCase().trim(), id]
      );
    }

    return res.json({ mensagem: 'Super admin atualizado com sucesso.' });
  } catch (err) {
    console.error('[SuperAdmin] atualizar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// DELETE /api/superadmin/usuarios/:id
async function excluir(req, res) {
  const { id } = req.params;

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ erro: 'Você não pode excluir sua própria conta.' });
  }

  try {
    const [[{ total }]] = await pool.query(
      "SELECT COUNT(*) AS total FROM usuarios WHERE role = 'super_admin'"
    );
    if (total <= 1) {
      return res.status(400).json({ erro: 'Deve existir pelo menos um super admin.' });
    }

    const [rows] = await pool.query(
      "SELECT id FROM usuarios WHERE role = 'super_admin' AND id = ?", [id]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Super admin não encontrado.' });

    await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
    return res.json({ mensagem: 'Super admin excluído.' });
  } catch (err) {
    console.error('[SuperAdmin] excluir:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { listar, criar, atualizar, excluir };
