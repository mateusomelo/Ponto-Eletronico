const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const { pool } = require('../database/connection');

// GET /api/superadmin/
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

// POST /api/superadmin/
async function criar(req, res) {
  const { nome, email, senha } = req.body;
  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
  }
  if (senha.length < 8) {
    return res.status(400).json({ erro: 'A senha deve ter no mínimo 8 caracteres.' });
  }

  try {
    const [dup] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email.toLowerCase().trim()]);
    if (dup.length) return res.status(409).json({ erro: 'E-mail já cadastrado.' });

    const hash = await bcrypt.hash(senha, parseInt(process.env.BCRYPT_ROUNDS || '12'));
    const cpf  = `000.000.000-${String(Date.now()).slice(-2)}`;

    const [result] = await pool.query(
      `INSERT INTO usuarios (nome, email, cpf, senha_hash, cargo_id, company_id, role, ativo)
       VALUES (?, ?, ?, ?, 1, NULL, 'super_admin', 1)`,
      [nome.trim(), email.toLowerCase().trim(), cpf, hash]
    );

    return res.status(201).json({ id: result.insertId, nome: nome.trim(), email: email.toLowerCase().trim() });
  } catch (err) {
    console.error('[SuperAdmin] criar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PUT /api/superadmin/:id
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
    const [rows] = await pool.query("SELECT id FROM usuarios WHERE role = 'super_admin' AND id = ?", [id]);
    if (!rows.length) return res.status(404).json({ erro: 'Super admin não encontrado.' });

    const [dup] = await pool.query('SELECT id FROM usuarios WHERE email = ? AND id != ?', [email.toLowerCase().trim(), id]);
    if (dup.length) return res.status(409).json({ erro: 'E-mail já usado por outro usuário.' });

    if (senha) {
      const hash = await bcrypt.hash(senha, parseInt(process.env.BCRYPT_ROUNDS || '12'));
      await pool.query('UPDATE usuarios SET nome = ?, email = ?, senha_hash = ? WHERE id = ?',
        [nome.trim(), email.toLowerCase().trim(), hash, id]);
    } else {
      await pool.query('UPDATE usuarios SET nome = ?, email = ? WHERE id = ?',
        [nome.trim(), email.toLowerCase().trim(), id]);
    }

    return res.json({ mensagem: 'Super admin atualizado com sucesso.' });
  } catch (err) {
    console.error('[SuperAdmin] atualizar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// DELETE /api/superadmin/:id
async function excluir(req, res) {
  const { id } = req.params;

  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ erro: 'Você não pode excluir sua própria conta.' });
  }

  try {
    const [[{ total }]] = await pool.query("SELECT COUNT(*) AS total FROM usuarios WHERE role = 'super_admin'");
    if (total <= 1) {
      return res.status(400).json({ erro: 'Deve existir pelo menos um super admin.' });
    }

    const [rows] = await pool.query("SELECT id FROM usuarios WHERE role = 'super_admin' AND id = ?", [id]);
    if (!rows.length) return res.status(404).json({ erro: 'Super admin não encontrado.' });

    await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);
    return res.json({ mensagem: 'Super admin excluído.' });
  } catch (err) {
    console.error('[SuperAdmin] excluir:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/superadmin/impersonar/:empresaId
// Gera um token JWT temporário (2h) para o admin principal da empresa
async function impersonar(req, res) {
  const empresaId = req.params.empresaId;
  try {
    const [empRows] = await pool.query('SELECT id, nome, status FROM empresas WHERE id = ?', [empresaId]);
    if (!empRows.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });

    // Busca o admin de menor nível da empresa
    const [adminRows] = await pool.query(
      `SELECT u.id, u.email, u.cargo_id, c.nivel AS cargo_nivel
       FROM usuarios u
       JOIN cargos c ON c.id = u.cargo_id
       WHERE u.company_id = ? AND u.ativo = 1 AND u.role != 'super_admin'
       ORDER BY c.nivel ASC
       LIMIT 1`,
      [empresaId]
    );

    if (!adminRows.length) {
      return res.status(404).json({ erro: 'Nenhum usuário ativo encontrado nesta empresa.' });
    }

    const target = adminRows[0];
    const token  = jwt.sign(
      { id: target.id, email: target.email, cargo_id: target.cargo_id, _impersonado_por: req.user.id },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    console.log(`[SuperAdmin] ${req.user.email} impersonando empresa ${empresaId} como usuário ${target.id}`);

    return res.json({
      token,
      empresa: empRows[0].nome,
      usuario_id: target.id,
      expires_in: '2h',
    });
  } catch (err) {
    console.error('[SuperAdmin] impersonar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/superadmin/metricas
async function metricas(req, res) {
  try {
    // Estatísticas gerais
    const [[stats]] = await pool.query(`
      SELECT
        COUNT(*) AS total_empresas,
        SUM(status = 'active')   AS ativas,
        SUM(status = 'trial')    AS em_teste,
        SUM(status = 'past_due') AS inadimplentes,
        SUM(status = 'suspended') AS suspensas,
        SUM(plano = 'basico')        AS plano_basico,
        SUM(plano = 'profissional')  AS plano_profissional,
        SUM(plano = 'enterprise')    AS plano_enterprise
      FROM empresas
    `);

    const [[usuarios]] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(ativo = 1) AS ativos
      FROM usuarios WHERE role != 'super_admin'
    `);

    const [[pontos]] = await pool.query(`
      SELECT COUNT(*) AS hoje
      FROM registros_ponto
      WHERE DATE(created_at) = CURDATE()
    `);

    // Preços configuráveis via env (em BRL, não centavos)
    const precos = {
      basico:       parseFloat(process.env.PLAN_PRICE_BASICO       || '0'),
      profissional: parseFloat(process.env.PLAN_PRICE_PROFISSIONAL  || '0'),
      enterprise:   parseFloat(process.env.PLAN_PRICE_ENTERPRISE    || '0'),
    };

    // MRR = soma das assinaturas ativas por plano × preço
    const mrr =
      (stats.plano_basico       || 0) * precos.basico +
      (stats.plano_profissional || 0) * precos.profissional +
      (stats.plano_enterprise   || 0) * precos.enterprise;

    // Próximos vencimentos (empresas com status past_due)
    const [vencimentos] = await pool.query(`
      SELECT id, nome, inadimplente_desde, tolerancia_dias,
             DATEDIFF(NOW(), inadimplente_desde) AS dias_inadimplente
      FROM empresas
      WHERE status = 'past_due' AND inadimplente_desde IS NOT NULL
      ORDER BY inadimplente_desde ASC
      LIMIT 10
    `);

    // Últimas alterações de plano
    const [ultimasAlteracoes] = await pool.query(`
      SELECT ph.*, e.nome AS empresa_nome, u.nome AS alterado_por_nome
      FROM plano_historico ph
      JOIN empresas e ON e.id = ph.empresa_id
      LEFT JOIN usuarios u ON u.id = ph.alterado_por
      ORDER BY ph.created_at DESC
      LIMIT 10
    `);

    return res.json({
      empresas: {
        total:       stats.total_empresas || 0,
        ativas:      stats.ativas         || 0,
        em_teste:    stats.em_teste        || 0,
        inadimplentes: stats.inadimplentes || 0,
        suspensas:   stats.suspensas       || 0,
        por_plano: {
          basico:       stats.plano_basico        || 0,
          profissional: stats.plano_profissional  || 0,
          enterprise:   stats.plano_enterprise    || 0,
        },
      },
      usuarios: {
        total: usuarios.total || 0,
        ativos: usuarios.ativos || 0,
      },
      pontos_hoje: pontos.hoje || 0,
      financeiro: {
        mrr,
        arr: mrr * 12,
        precos,
      },
      inadimplentes: vencimentos,
      ultimas_alteracoes_plano: ultimasAlteracoes,
    });
  } catch (err) {
    console.error('[SuperAdmin] metricas:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { listar, criar, atualizar, excluir, impersonar, metricas };
