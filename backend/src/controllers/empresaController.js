const bcrypt = require('bcrypt');
const jwt    = require('jsonwebtoken');
const path   = require('path');
const fs     = require('fs');
const { pool }       = require('../database/connection');
const emailService   = require('../services/emailService');

const UPLOADS_ROOT = process.env.UPLOADS_PATH
  ? path.resolve(process.env.UPLOADS_PATH)
  : path.join(__dirname, '../../../uploads');

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

  const todasPerms    = perms.map(p => p.id);
  const permsSuper    = [
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
    // EmailJS / Comprovantes
    ['emailjs_public_key',           '',      'string',  'Chave pública do EmailJS (Public Key)'],
    ['emailjs_service_id',           '',      'string',  'ID do serviço EmailJS (Service ID)'],
    ['emailjs_template_entrada_id',  '',      'string',  'ID do template de entrada no EmailJS'],
    ['emailjs_template_saida_id',    '',      'string',  'ID do template de saída no EmailJS'],
    ['emailjs_from_name',            'PontoControl', 'string', 'Nome do remetente no e-mail'],
    ['emailjs_reply_to',             '',      'string',  'E-mail de resposta (reply-to)'],
    ['comprovante_enviar_entrada',   'false', 'boolean', 'Enviar comprovante por e-mail após entrada'],
    ['comprovante_enviar_saida',     'false', 'boolean', 'Enviar comprovante por e-mail após saída'],
    ['comprovante_incluir_foto',     'true',  'boolean', 'Incluir foto no comprovante'],
    ['comprovante_incluir_gps',      'true',  'boolean', 'Incluir localização GPS no comprovante'],
    ['comprovante_incluir_dispositivo', 'true', 'boolean', 'Incluir informações do dispositivo'],
    ['comprovante_incluir_protocolo',   'true', 'boolean', 'Incluir protocolo único do registro'],
    ['comprovante_incluir_logo',        'true', 'boolean', 'Incluir logo da empresa no e-mail'],
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
             COUNT(DISTINCT u.id)  AS total_usuarios,
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
  const { nome, nome_fantasia, razao_social, documento, tipo_documento, cnpj, email, telefone, plano, trial_dias } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório.' });
  try {
    // Calcula data de término do trial (padrão 14 dias se trial_dias não informado)
    const dias = parseInt(trial_dias) || 0;
    let trialEndsAt = null;
    let initialStatus = 'active';
    if (dias > 0) {
      const d = new Date();
      d.setDate(d.getDate() + dias);
      trialEndsAt = d.toISOString().slice(0, 19).replace('T', ' ');
      initialStatus = 'trial';
    }

    const docFinal  = documento || cnpj || null;
    const tipoDoc   = tipo_documento || (docFinal && docFinal.replace(/\D/g,'').length <= 11 ? 'cpf' : 'cnpj');

    const [result] = await pool.query(
      `INSERT INTO empresas
         (nome, nome_fantasia, razao_social, documento, tipo_documento, cnpj, email, telefone, plano, status, trial_ends_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [nome, nome_fantasia||null, razao_social||null, docFinal, tipoDoc, cnpj||null,
       email||null, telefone||null, plano||'basico', initialStatus, trialEndsAt]
    );
    const empresaId = result.insertId;

    await seedEmpresaDefaults(empresaId, nome, cnpj || documento);

    // Registra plano inicial no histórico
    await pool.query(
      `INSERT INTO plano_historico (empresa_id, plano_antes, plano_depois, alterado_por, motivo)
       VALUES (?, 'nenhum', ?, ?, 'Empresa criada')`,
      [empresaId, plano || 'basico', req.user?.id || null]
    );

    const [rows] = await pool.query('SELECT * FROM empresas WHERE id = ?', [empresaId]);
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error('[Empresa] criar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PUT /api/empresas/:id
async function editar(req, res) {
  const { nome, nome_fantasia, razao_social, documento, tipo_documento, cnpj, email, telefone, plano, tolerancia_dias } = req.body;
  if (!nome) return res.status(400).json({ erro: 'Nome é obrigatório.' });
  const id = req.params.id;
  try {
    const [check] = await pool.query('SELECT id, plano FROM empresas WHERE id = ?', [id]);
    if (!check.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });

    const planoAtual = check[0].plano;
    const planoNovo  = plano || planoAtual;
    const docFinal   = documento || cnpj || null;
    const tipoDoc    = tipo_documento || (docFinal && docFinal.replace(/\D/g,'').length <= 11 ? 'cpf' : 'cnpj');
    const tolDias    = tolerancia_dias !== undefined ? parseInt(tolerancia_dias) : null;

    const updateQuery = tolDias !== null
      ? 'UPDATE empresas SET nome=?,nome_fantasia=?,razao_social=?,documento=?,tipo_documento=?,cnpj=?,email=?,telefone=?,plano=?,tolerancia_dias=? WHERE id=?'
      : 'UPDATE empresas SET nome=?,nome_fantasia=?,razao_social=?,documento=?,tipo_documento=?,cnpj=?,email=?,telefone=?,plano=? WHERE id=?';
    const updateParams = tolDias !== null
      ? [nome, nome_fantasia||null, razao_social||null, docFinal, tipoDoc, cnpj||null, email||null, telefone||null, planoNovo, tolDias, id]
      : [nome, nome_fantasia||null, razao_social||null, docFinal, tipoDoc, cnpj||null, email||null, telefone||null, planoNovo, id];

    await pool.query(updateQuery, updateParams);

    // Registra mudança de plano
    if (planoNovo !== planoAtual) {
      await pool.query(
        `INSERT INTO plano_historico (empresa_id, plano_antes, plano_depois, alterado_por, motivo)
         VALUES (?, ?, ?, ?, 'Alterado via painel admin')`,
        [id, planoAtual, planoNovo, req.user?.id || null]
      );
    }

    // Atualiza data de vencimento do plano para 30 dias a partir de hoje
    const planoExpires = new Date();
    planoExpires.setDate(planoExpires.getDate() + 30);
    const planoExpiresAt = planoExpires.toISOString().slice(0, 19).replace('T', ' ');
    await pool.query('UPDATE empresas SET plano_expires_at = ? WHERE id = ?', [planoExpiresAt, id]);

    // Sincroniza configurações
    await pool.query("UPDATE configuracoes SET valor=? WHERE chave='empresa_nome' AND company_id=?", [nome, id]);
    if (cnpj || documento) {
      await pool.query("UPDATE configuracoes SET valor=? WHERE chave='empresa_cnpj' AND company_id=?", [cnpj || documento, id]);
    }

    const [rows] = await pool.query('SELECT * FROM empresas WHERE id = ?', [id]);
    return res.json(rows[0]);
  } catch (err) {
    console.error('[Empresa] editar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PATCH /api/empresas/:id/status
async function alterarStatus(req, res) {
  const { status } = req.body;
  const validStatuses = ['trial', 'active', 'past_due', 'suspended'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ erro: `Status inválido. Use: ${validStatuses.join(', ')}.` });
  }
  const id = req.params.id;
  try {
    const [check] = await pool.query('SELECT id, nome, status AS status_atual FROM empresas WHERE id = ?', [id]);
    if (!check.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });

    const extra = {};
    if (status === 'past_due' && check[0].status_atual !== 'past_due') {
      // Marca quando entrou em inadimplência
      extra.inadimplente_desde = new Date().toISOString().slice(0, 19).replace('T', ' ');
    }
    if (status === 'active') {
      extra.inadimplente_desde = null;
    }

    if (Object.keys(extra).length > 0) {
      const sets = Object.keys(extra).map(k => `${k} = ?`).join(', ');
      await pool.query(`UPDATE empresas SET status = ?, ${sets} WHERE id = ?`,
        [status, ...Object.values(extra), id]);
    } else {
      await pool.query('UPDATE empresas SET status = ? WHERE id = ?', [status, id]);
    }

    return res.json({ mensagem: `Status da empresa "${check[0].nome}" alterado para "${status}".` });
  } catch (err) {
    console.error('[Empresa] alterarStatus:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/empresas/:id/logo
async function uploadLogo(req, res) {
  if (!req.file) return res.status(400).json({ erro: 'Nenhuma imagem enviada.' });
  const id     = req.params.id;
  const logoUrl = `/uploads/logos/${req.file.filename}`;

  try {
    // Remove logo antiga do disco
    const [rows] = await pool.query('SELECT logo FROM empresas WHERE id = ?', [id]);
    if (rows.length && rows[0].logo) {
      const oldPath = path.join(UPLOADS_ROOT, rows[0].logo.replace('/uploads/', ''));
      fs.unlink(oldPath, () => {});
    }

    await pool.query('UPDATE empresas SET logo = ? WHERE id = ?', [logoUrl, id]);
    return res.json({ mensagem: 'Logo atualizada.', logo: logoUrl });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error('[Empresa] uploadLogo:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/empresas/:id/historico-plano
async function historicoPLano(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT ph.*, u.nome AS alterado_por_nome
       FROM plano_historico ph
       LEFT JOIN usuarios u ON u.id = ph.alterado_por
       WHERE ph.empresa_id = ?
       ORDER BY ph.created_at DESC
       LIMIT 50`,
      [req.params.id]
    );
    return res.json(rows);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// DELETE /api/empresas/:id
async function excluir(req, res) {
  const id = req.params.id;
  try {
    const [check] = await pool.query('SELECT id FROM empresas WHERE id = ?', [id]);
    if (!check.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });

    const [[{ total }]] = await pool.query('SELECT COUNT(*) AS total FROM empresas');
    if (total <= 1) {
      return res.status(400).json({ erro: 'Deve existir pelo menos uma empresa cadastrada.' });
    }

    const [users] = await pool.query('SELECT id FROM usuarios WHERE company_id = ?', [id]);
    for (const u of users) {
      await pool.query('DELETE FROM notificacoes    WHERE usuario_id = ?', [u.id]);
      await pool.query('DELETE FROM registros_ponto WHERE usuario_id = ?', [u.id]);
      await pool.query('UPDATE fechamentos_folha SET usuario_id = NULL WHERE usuario_id = ?', [u.id]);
    }
    await pool.query('DELETE FROM usuarios      WHERE company_id = ?', [id]);

    const [cargosEmp] = await pool.query('SELECT id FROM cargos WHERE company_id = ?', [id]);
    for (const c of cargosEmp) {
      await pool.query('DELETE FROM cargo_permissoes WHERE cargo_id = ?', [c.id]);
    }
    await pool.query('DELETE FROM cargos          WHERE company_id = ?', [id]);
    await pool.query('DELETE FROM configuracoes    WHERE company_id = ?', [id]);
    await pool.query('DELETE FROM plano_historico  WHERE empresa_id = ?', [id]);
    await pool.query('DELETE FROM empresas         WHERE id = ?', [id]);

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

// POST /api/empresas/:id/usuarios
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

    const nivelCargo = role === 'company_admin' ? 1 : 3;
    const [cargos] = await pool.query(
      'SELECT id FROM cargos WHERE company_id = ? AND nivel = ? LIMIT 1',
      [empresaId, nivelCargo]
    );
    if (!cargos.length) {
      return res.status(422).json({ erro: 'Empresa sem cargos configurados.' });
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

// POST /api/auth/cadastrar  (público — self-service)
async function cadastrarEmpresa(req, res) {
  const { nome_empresa, nome_admin, email, senha, telefone, plano } = req.body;

  if (!nome_empresa || !nome_admin || !email || !senha) {
    return res.status(400).json({ erro: 'Nome da empresa, seu nome, e-mail e senha são obrigatórios.' });
  }
  if (senha.length < 8) {
    return res.status(400).json({ erro: 'A senha deve ter no mínimo 8 caracteres.' });
  }

  const emailNorm = email.toLowerCase().trim();

  try {
    // Verifica e-mail duplicado
    const [dup] = await pool.query('SELECT id FROM usuarios WHERE email = ?', [emailNorm]);
    if (dup.length) {
      return res.status(409).json({ erro: 'Este e-mail já está cadastrado. Faça login ou use outro e-mail.' });
    }

    // Cria empresa com trial de 7 dias
    const trialDias = 7;
    const trialDate = new Date();
    trialDate.setDate(trialDate.getDate() + trialDias);
    const trialEndsAt = trialDate.toISOString().slice(0, 19).replace('T', ' ');
    
    // Data de vencimento do plano: 7 dias + trial (total 14 dias)
    const planoExpires = new Date();
    planoExpires.setDate(planoExpires.getDate() + 14);
    const planoExpiresAt = planoExpires.toISOString().slice(0, 19).replace('T', ' ');
    
    const planoFinal  = ['basico', 'profissional', 'enterprise'].includes(plano) ? plano : 'basico';

    const [empResult] = await pool.query(
      `INSERT INTO empresas (nome, email, telefone, plano, status, trial_ends_at, plano_expires_at)
       VALUES (?, ?, ?, ?, 'trial', ?, ?)`,
      [nome_empresa.trim(), emailNorm, telefone || null, planoFinal, trialEndsAt, planoExpiresAt]
    );
    const empresaId = empResult.insertId;

    // Seed cargos padrão, permissões e configurações
    const cargoIds = await seedEmpresaDefaults(empresaId, nome_empresa.trim(), null);

    // Cria o primeiro usuário (admin da empresa)
    const hash    = await bcrypt.hash(senha, parseInt(process.env.BCRYPT_ROUNDS || '12'));
    const cpfFake = `AUTOCAD${empresaId}`; // placeholder único; pode ser atualizado no perfil

    const [userResult] = await pool.query(
      `INSERT INTO usuarios (nome, email, cpf, senha_hash, cargo_id, company_id, role, ativo)
       VALUES (?, ?, ?, ?, ?, ?, 'company_admin', 1)`,
      [nome_admin.trim(), emailNorm, cpfFake, hash, cargoIds[1], empresaId]
    );
    const userId = userResult.insertId;

    // Registra plano inicial no histórico
    await pool.query(
      `INSERT INTO plano_historico (empresa_id, plano_antes, plano_depois, alterado_por, motivo)
       VALUES (?, 'nenhum', ?, ?, 'Cadastro via self-service')`,
      [empresaId, planoFinal, userId]
    );

    // Gera JWT (auto-login)
    const token = jwt.sign(
      { id: userId, email: emailNorm, cargo_id: cargoIds[1] },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
    );

    // E-mail de boas-vindas (silencioso se SMTP não configurado)
    emailService.enviarBoasVindas(emailNorm, nome_admin.trim(), nome_empresa.trim(), trialDias)
      .catch(() => {});

    console.log(`[Empresa] Cadastro self-service: ${nome_empresa} (id=${empresaId}) — admin: ${emailNorm}`);

    return res.status(201).json({
      token,
      usuario: {
        id:          userId,
        nome:        nome_admin.trim(),
        email:       emailNorm,
        cargo_id:    cargoIds[1],
        cargo_nivel: 1,
        role:        'company_admin',
        company_id:  empresaId,
      },
      empresa: {
        id:           empresaId,
        nome:         nome_empresa.trim(),
        status:       'trial',
        trial_ends_at: trialEndsAt,
        plano:        planoFinal,
        trial_dias:   trialDias,
      },
    });
  } catch (err) {
    console.error('[Empresa] cadastrarEmpresa:', err);
    return res.status(500).json({ erro: 'Erro interno ao criar conta. Tente novamente.' });
  }
}

module.exports = {
  listar, obter, criar, editar, alterarStatus, uploadLogo, historicoPLano,
  excluir, listarUsuarios, criarUsuario, excluirUsuario, cadastrarEmpresa,
};
