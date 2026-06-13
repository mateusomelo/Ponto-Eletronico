const jwt    = require('jsonwebtoken');
const { pool } = require('../database/connection');

async function authenticate(req, res, next) {
  const header = req.headers['authorization'];
  const token  = header && header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ erro: 'Token de autenticação não fornecido.' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const [rows] = await pool.query(
      `SELECT u.id, u.nome, u.email, u.cargo_id, u.ativo, u.bloqueado,
              c.nome AS cargo_nome, c.nivel AS cargo_nivel
       FROM usuarios u
       JOIN cargos c ON c.id = u.cargo_id
       WHERE u.id = ?`,
      [decoded.id]
    );

    if (!rows.length) {
      return res.status(401).json({ erro: 'Usuário não encontrado.' });
    }

    const user = rows[0];

    if (!user.ativo) {
      return res.status(403).json({ erro: 'Conta desativada.' });
    }
    if (user.bloqueado) {
      return res.status(403).json({ erro: 'Conta bloqueada. Contate o administrador.' });
    }

    // Carregar permissões
    const [perms] = await pool.query(
      `SELECT p.nome FROM permissoes p
       JOIN cargo_permissoes cp ON cp.permissao_id = p.id
       WHERE cp.cargo_id = ?`,
      [user.cargo_id]
    );

    req.user = {
      id:          user.id,
      nome:        user.nome,
      email:       user.email,
      cargo_id:    user.cargo_id,
      cargo_nome:  user.cargo_nome,
      cargo_nivel: user.cargo_nivel,
      permissoes:  perms.map(p => p.nome),
    };

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ erro: 'Token expirado. Faça login novamente.' });
    }
    return res.status(401).json({ erro: 'Token inválido.' });
  }
}

module.exports = { authenticate };
