const bcrypt = require('bcrypt');
const { pool } = require('../database/connection');

// ── Seed de cargos e configs padrão para uma empresa nova ───
async function seedEmpresaDefaults(empresaId, empresaNome, empresaCnpj) {
  // 1. Cargos padrão
  const cargos = [
    ['Administrador', 'Acesso total ao sistema', 1],
    ['Supervisor',    'Gerencia equipes e relatórios', 2],
    ['Funcionário',   'Registro de ponto e consulta própria', 3],
  ];
  const cargoIds = {};
  for (const [nome, descricao, nivel] of cargos) {
    const [r] = await pool.query(
      'INSERT INTO cargos (nome, descricao, nivel, company_id) VALUES (?, ?, ?, ?)',
      [nome, descricao, nivel, empresaId]
    );
    cargoIds[nivel] = r.insertId;
  }

  // 2. Permissões: busca os ids pelo nome (tabela global)
  const [perms] = await pool.query('SELECT id, nome FROM permissoes');
  const permMap = {};
  perms.forEach(p => { permMap[p.nome] = p.id; });

  const todasPerms = perms.map(p => p.id);
  const permsSuper = [
    'ponto.registrar','ponto.visualizar','usuarios.visualizar','usuarios.criar',
    'usuarios.editar','relatorios.visualizar','relatorios.exportar',
    'fechamento.criar','fechamento.visualizar','registros.detalhes',
    'pagamentos.visualizar',
  ].map(n => permMap[n]).filter(Boolean);
  const permsFuncionario = ['ponto.registrar','ponto.visualizar'].map(n => permMap[n]).filter(Boolean);

  const insertPerms = async (cargoId, permIds) => {
    for (const pid of permIds) {
      await pool.query(
        'INSERT IGNORE INTO cargo_permissoes (cargo_id, permissao_id) VALUES (?, ?)',
        [cargoId, pid]
      );
    }
  };
  await insertPerms(cargoIds[1], todasPerms);
  await insertPerms(cargoIds[2], permsSuper);
  await insertPerms(cargoIds[3], permsFuncionario);

  // 3. Configurações padrão
  const configs = [
    ['empresa_nome',           empresaNome,         'string',  'Nome da empresa exibido nos relatórios'],
    ['empresa_cnpj',           empresaCnpj || '',   'string',  'CNPJ da empresa'],
    ['horario_entrada',        '08:00',             'string',  'Horário padrão de entrada'],
    ['horario_saida',          '17:00',             'string',  'Horário padrão de saída'],
    ['tolerancia_minutos',     '15',                'number',  'Tolerância em minutos para atraso'],
    ['gps_obrigatorio',        'true',              'boolean', 'Exigir GPS no registro de ponto'],
    ['foto_obrigatoria_mobile','true',              'boolean', 'Exigir foto em dispositivos móveis'],
    ['max_raio_metros',        '500',               'number',  'Raio máximo em metros para registro'],
    ['fuso_horario',           'America/Sao_Paulo', 'string',  'Fuso horário do sistema'],
  ];
  for (const [chave, valor, tipo, descricao] of configs) {
    await pool.query(
      'INSERT INTO configuracoes (chave, valor, tipo, descricao, company_id) VALUES (?, ?, ?, ?, ?)',
      [chave, valor, tipo, descricao, empresaId]
    );
  }

  return cargoIds;
}

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
    const empresaId = result.insertId;

    // Seed cargos + configs padrão para a nova empresa
    await seedEmpresaDefaults(empresaId, nome, cnpj);

    const [rows] = await pool.query('SELECT * FROM empresas WHERE id = ?', [empresaId]);
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

    // Sincroniza empresa_nome e empresa_cnpj nas configs da empresa
    await pool.query(
      "UPDATE configuracoes SET valor=? WHERE chave='empresa_nome' AND company_id=?",
      [nome, req.params.id]
    );
    if (cnpj) {
      await pool.query(
        "UPDATE configuracoes SET valor=? WHERE chave='empresa_cnpj' AND company_id=?",
        [cnpj, req.params.id]
      );
    }

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

    // Cascata: remove dados dos usuários da empresa
    const [users] = await pool.query('SELECT id FROM usuarios WHERE company_id = ?', [id]);
    for (const u of users) {
      await pool.query('DELETE FROM notificacoes    WHERE usuario_id = ?', [u.id]);
      await pool.query('DELETE FROM registros_ponto WHERE usuario_id = ?', [u.id]);
      await pool.query('UPDATE fechamentos_folha SET usuario_id = NULL WHERE usuario_id = ?', [u.id]);
    }
    await pool.query('DELETE FROM usuarios      WHERE company_id = ?', [id]);

    // Remove cargos e configurações da empresa
    const [cargosEmp] = await pool.query('SELECT id FROM cargos WHERE company_id = ?', [id]);
    for (const c of cargosEmp) {
      await pool.query('DELETE FROM cargo_permissoes WHERE cargo_id = ?', [c.id]);
    }
    await pool.query('DELETE FROM cargos        WHERE company_id = ?', [id]);
    await pool.query('DELETE FROM configuracoes  WHERE company_id = ?', [id]);
    await pool.query('DELETE FROM empresas       WHERE id = ?', [id]);

    return res.json({ mensagem: 'Empresa e todos os seus dados foram excluídos.' });
  } catch (err) {
    console.error('[Empresa] excluir:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/empresas/:id/usuarios
async function listarUsuarios(req, res) {
  try {
    const id = req.params.id;
    const [check] = await pool.query('SELECT id, nome FROM empresas WHERE id = ?', [id]);
    if (!check.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });

    const [rows] = await pool.query(
      `SELECT u.id, u.nome, u.email, u.ativo, u.bloqueado, u.role, u.ultimo_acesso, u.created_at,
              c.nome AS cargo_nome, c.nivel AS cargo_nivel
       FROM usuarios u
       LEFT JOIN cargos c ON c.id = u.cargo_id
       WHERE u.company_id = ?
       ORDER BY c.nivel ASC, u.nome ASC`,
      [id]
    );
    return res.json({ empresa: check[0].nome, usuarios: rows });
  } catch (err) {
    console.error('[Empresa] listarUsuarios:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/empresas/:id/usuarios  — cria usuário admin para a empresa
async function criarUsuario(req, res) {
  const empresaId = req.params.id;
  const { nome, email, senha, role = 'company_admin' } = req.body;

  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: 'Nome, e-mail e senha são obrigatórios.' });
  }
  if (senha.length < 8) {
    return res.status(400).json({ erro: 'Senha deve ter no mínimo 8 caracteres.' });
  }

  try {
    const [emp] = await pool.query('SELECT id FROM empresas WHERE id = ?', [empresaId]);
    if (!emp.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });

    const [dup] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [email.toLowerCase().trim()]);
    if (dup.length) return res.status(409).json({ erro: 'E-mail já cadastrado.' });

    // Busca o cargo admin (nivel=1) da empresa
    const nivelCargo = role === 'company_admin' ? 1 : 3;
    const [cargos] = await pool.query(
      'SELECT id FROM cargos WHERE company_id = ? AND nivel = ? LIMIT 1',
      [empresaId, nivelCargo]
    );
    if (!cargos.length) {
      return res.status(422).json({ erro: 'Empresa sem cargos configurados. Verifique o setup.' });
    }

    const hash = await bcrypt.hash(senha, 12);
    const cpfPlaceholder = `000.000.000-${String(Date.now()).slice(-2)}`;

    const [result] = await pool.query(
      `INSERT INTO usuarios (nome, email, cpf, senha_hash, cargo_id, company_id, role, ativo)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      [nome.trim(), email.toLowerCase().trim(), cpfPlaceholder, hash, cargos[0].id, empresaId, role]
    );

    return res.status(201).json({
      mensagem: 'Usuário criado com sucesso.',
      id: result.insertId,
      email: email.toLowerCase().trim(),
    });
  } catch (err) {
    console.error('[Empresa] criarUsuario:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// DELETE /api/empresas/:id/usuarios/:uid
async function excluirUsuario(req, res) {
  const { id: empresaId, uid } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT id FROM usuarios WHERE id = ? AND company_id = ?', [uid, empresaId]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Usuário não encontrado nesta empresa.' });

    await pool.query('DELETE FROM notificacoes    WHERE usuario_id = ?', [uid]);
    await pool.query('DELETE FROM registros_ponto WHERE usuario_id = ?', [uid]);
    await pool.query('UPDATE fechamentos_folha SET usuario_id = NULL WHERE usuario_id = ?', [uid]);
    await pool.query('DELETE FROM usuarios WHERE id = ?', [uid]);

    return res.json({ mensagem: 'Usuário excluído.' });
  } catch (err) {
    console.error('[Empresa] excluirUsuario:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { listar, obter, criar, editar, alterarStatus, excluir, listarUsuarios, criarUsuario, excluirUsuario };
