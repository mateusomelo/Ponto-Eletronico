const bcrypt  = require('bcrypt');
const jwt     = require('jsonwebtoken');
const crypto  = require('crypto');
const path    = require('path');
const fs      = require('fs');
const { pool }      = require('../database/connection');
const LogAcesso     = require('../models/LogAcesso');
const { getClientIp } = require('../utils/ip');

function gerarToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, cargo_id: user.cargo_id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
  );
}

// POST /api/auth/login
async function login(req, res) {
  const { email, senha, lembrar } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ erro: 'E-mail e senha são obrigatórios.' });
  }

  try {
    const [rows] = await pool.query(
      `SELECT u.*, c.nome AS cargo_nome, c.nivel AS cargo_nivel
       FROM usuarios u
       JOIN cargos c ON c.id = u.cargo_id
       WHERE u.email = ?`,
      [email.toLowerCase().trim()]
    );

    // Verificar status da empresa (antes de validar senha para retornar erro claro)
    if (rows.length && rows[0].role !== 'super_admin' && rows[0].company_id) {
      const [empRows] = await pool.query('SELECT status FROM empresas WHERE id = ?', [rows[0].company_id]);
      const emp = empRows[0];
      if (!emp || emp.status === 'suspended') {
        return res.status(403).json({
          erro: 'Acesso suspenso. Contate o suporte da plataforma.',
          code: 'COMPANY_SUSPENDED',
        });
      }
    }

    const ip = getClientIp(req);
    const ua = req.headers['user-agent'] || '';

    if (!rows.length) {
      await LogAcesso.registrar({ acao: 'login.falhou', descricao: `Tentativa com e-mail: ${email}`, ip, user_agent: ua });
      return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }

    const user = rows[0];

    if (user.bloqueado) {
      return res.status(403).json({ erro: 'Conta bloqueada. Contate o administrador.' });
    }
    if (!user.ativo) {
      return res.status(403).json({ erro: 'Conta desativada.' });
    }

    const senhaValida = await bcrypt.compare(senha, user.senha_hash);
    if (!senhaValida) {
      await LogAcesso.registrar({ usuario_id: user.id, acao: 'login.falhou', descricao: 'Senha incorreta', ip, user_agent: ua });
      return res.status(401).json({ erro: 'Credenciais inválidas.' });
    }

    await pool.query('UPDATE usuarios SET ultimo_acesso = NOW() WHERE id = ?', [user.id]);

    const expiresIn = lembrar ? '7d' : (process.env.JWT_EXPIRES_IN || '8h');
    const token = jwt.sign(
      { id: user.id, email: user.email, cargo_id: user.cargo_id },
      process.env.JWT_SECRET,
      { expiresIn }
    );

    await LogAcesso.registrar({ usuario_id: user.id, acao: 'login.sucesso', descricao: `Login realizado`, ip, user_agent: ua });

    return res.json({
      token,
      usuario: {
        id:           user.id,
        nome:         user.nome,
        email:        user.email,
        foto:         user.foto || null,
        cargo_id:     user.cargo_id,
        cargo_nome:   user.cargo_nome,
        cargo_nivel:  user.cargo_nivel,
        role:         user.role,
        company_id:   user.company_id,
      },
    });
  } catch (err) {
    console.error('[Auth] login:', err);
    return res.status(500).json({ erro: 'Erro interno no servidor.' });
  }
}

// POST /api/auth/logout
async function logout(req, res) {
  if (req.user) {
    await LogAcesso.registrar({
      usuario_id: req.user.id,
      acao:       'logout',
      descricao:  'Logout realizado',
      ip:         getClientIp(req),
      user_agent: req.headers['user-agent'],
    });
  }
  return res.json({ mensagem: 'Logout realizado com sucesso.' });
}

// GET /api/auth/me
async function me(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.nome, u.email, u.cpf, u.telefone, u.foto, u.cargo_id, u.ativo, u.ultimo_acesso,
              u.role, u.company_id,
              c.nome AS cargo_nome, c.nivel AS cargo_nivel
       FROM usuarios u JOIN cargos c ON c.id = u.cargo_id
       WHERE u.id = ?`,
      [req.user.id]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    const u = rows[0];

    const [perms] = await pool.query(
      `SELECT p.nome FROM permissoes p
       JOIN cargo_permissoes cp ON cp.permissao_id = p.id
       WHERE cp.cargo_id = ?`,
      [u.cargo_id]
    );

    // Busca status da empresa se aplicável
    let company_status = null;
    let company_nome   = null;
    if (u.role !== 'super_admin' && u.company_id) {
      const [empR] = await pool.query('SELECT nome, status FROM empresas WHERE id = ?', [u.company_id]);
      if (empR[0]) { company_status = empR[0].status; company_nome = empR[0].nome; }
    }

    return res.json({
      ...u,
      permissoes:     perms.map(p => p.nome),
      company_status: company_status,
      company_nome:   company_nome,
    });
  } catch (err) {
    console.error('[Auth] me:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/auth/alterar-senha
async function alterarSenha(req, res) {
  const { senha_atual, nova_senha } = req.body;

  if (!senha_atual || !nova_senha) {
    return res.status(400).json({ erro: 'Todos os campos são obrigatórios.' });
  }
  if (nova_senha.length < 8) {
    return res.status(400).json({ erro: 'A nova senha deve ter no mínimo 8 caracteres.' });
  }

  try {
    const [rows] = await pool.query('SELECT senha_hash FROM usuarios WHERE id = ?', [req.user.id]);
    if (!rows.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    const valida = await bcrypt.compare(senha_atual, rows[0].senha_hash);
    if (!valida) return res.status(401).json({ erro: 'Senha atual incorreta.' });

    const hash = await bcrypt.hash(nova_senha, parseInt(process.env.BCRYPT_ROUNDS || '12'));
    await pool.query('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [hash, req.user.id]);

    await LogAcesso.registrar({
      usuario_id: req.user.id,
      acao:       'senha.alterada',
      descricao:  'Senha alterada pelo próprio usuário',
      ip:         getClientIp(req),
    });

    return res.json({ mensagem: 'Senha alterada com sucesso.' });
  } catch (err) {
    console.error('[Auth] alterarSenha:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/auth/solicitar-reset
async function solicitarReset(req, res) {
  const { email } = req.body;
  if (!email) return res.status(400).json({ erro: 'E-mail obrigatório.' });

  try {
    const [rows] = await pool.query('SELECT id, nome FROM usuarios WHERE email = ? AND ativo = 1', [email.toLowerCase().trim()]);

    // Resposta genérica por segurança
    if (!rows.length) {
      return res.json({ mensagem: 'Se o e-mail existir, você receberá as instruções.' });
    }

    const token = crypto.randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 2 * 60 * 60 * 1000); // 2h

    await pool.query(
      'UPDATE usuarios SET reset_token = ?, reset_expires = ? WHERE id = ?',
      [token, expires, rows[0].id]
    );

    await LogAcesso.registrar({ usuario_id: rows[0].id, acao: 'senha.reset_solicitado', ip: getClientIp(req) });

    // Em produção enviar email com o token
    console.log(`[Auth] Reset token para ${email}: ${token}`);

    return res.json({ mensagem: 'Se o e-mail existir, você receberá as instruções.' });
  } catch (err) {
    console.error('[Auth] solicitarReset:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/auth/redefinir-senha
async function redefinirSenha(req, res) {
  const { token, nova_senha } = req.body;

  if (!token || !nova_senha) return res.status(400).json({ erro: 'Token e nova senha obrigatórios.' });
  if (nova_senha.length < 8) return res.status(400).json({ erro: 'Senha deve ter no mínimo 8 caracteres.' });

  try {
    const [rows] = await pool.query(
      'SELECT id FROM usuarios WHERE reset_token = ? AND reset_expires > NOW()',
      [token]
    );

    if (!rows.length) return res.status(400).json({ erro: 'Token inválido ou expirado.' });

    const hash = await bcrypt.hash(nova_senha, parseInt(process.env.BCRYPT_ROUNDS || '12'));
    await pool.query(
      'UPDATE usuarios SET senha_hash = ?, reset_token = NULL, reset_expires = NULL WHERE id = ?',
      [hash, rows[0].id]
    );

    await LogAcesso.registrar({ usuario_id: rows[0].id, acao: 'senha.redefinida', ip: getClientIp(req) });

    return res.json({ mensagem: 'Senha redefinida com sucesso.' });
  } catch (err) {
    console.error('[Auth] redefinirSenha:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/auth/me/foto
async function uploadMinhaFoto(req, res) {
  if (!req.file) return res.status(400).json({ erro: 'Nenhuma imagem enviada.' });

  const id = req.user.id;
  const fotoUrl = `/uploads/avatars/${req.file.filename}`;

  try {
    const [rows] = await pool.query('SELECT foto FROM usuarios WHERE id = ?', [id]);
    if (rows.length && rows[0].foto) {
      const oldPath = path.join(__dirname, '../../../', rows[0].foto);
      fs.unlink(oldPath, () => {});
    }

    await pool.query('UPDATE usuarios SET foto = ? WHERE id = ?', [fotoUrl, id]);

    await LogAcesso.registrar({
      usuario_id: id,
      acao:       'usuario.foto_atualizada',
      descricao:  'Usuário atualizou a própria foto',
      ip:         getClientIp(req),
    });

    return res.json({ mensagem: 'Foto atualizada com sucesso.', foto: fotoUrl });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error('[Auth] uploadMinhaFoto:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { login, logout, me, alterarSenha, solicitarReset, redefinirSenha, uploadMinhaFoto };
