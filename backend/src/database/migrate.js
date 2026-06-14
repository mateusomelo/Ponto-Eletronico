const path = require('path');
const fs   = require('fs');
const bcrypt = require('bcrypt');
const { pool } = require('./connection');

// ── Executa cada statement do SQL separadamente ──────────────
async function executarSchema(conn, sql) {
  // Remove comentários de linha e divide por ";"
  const statements = sql
    .replace(/--[^\n]*/g, '')   // remove comentários --
    .split(';')
    .map(s => s.trim())
    .filter(s => s.length > 0);

  for (const stmt of statements) {
    await conn.query(stmt);
  }
}

// ── Seed: cargos padrão ──────────────────────────────────────
async function seedCargos(conn) {
  const cargos = [
    [1, 'Administrador', 'Acesso total ao sistema',  1],
    [2, 'Supervisor',    'Gerencia equipes e relatórios', 2],
    [3, 'Funcionário',   'Registro de ponto e consulta própria', 3],
  ];
  for (const [id, nome, descricao, nivel] of cargos) {
    await conn.query(
      `INSERT IGNORE INTO cargos (id, nome, descricao, nivel) VALUES (?, ?, ?, ?)`,
      [id, nome, descricao, nivel]
    );
  }
  console.log('[Migration] Cargos padrão verificados.');
}

// ── Seed: permissões padrão ──────────────────────────────────
async function seedPermissoes(conn) {
  const permissoes = [
    // Ponto
    ['ponto.registrar',       'Registrar entrada e saída de ponto'],
    ['ponto.visualizar',      'Visualizar histórico de ponto de funcionários'],
    // Usuários
    ['usuarios.visualizar',   'Visualizar lista de usuários'],
    ['usuarios.criar',        'Criar novos usuários'],
    ['usuarios.editar',       'Editar dados e redefinir senha de usuários'],
    ['usuarios.excluir',      'Excluir usuários'],
    ['usuarios.gerenciar',    'Criar, editar e excluir usuários'],
    // Relatórios
    ['relatorios.visualizar', 'Visualizar e gerar relatórios'],
    ['relatorios.exportar',   'Exportar relatórios em PDF e Excel'],
    // Cargos
    ['cargos.criar',          'Criar novos cargos'],
    ['cargos.editar',         'Editar cargos existentes'],
    ['cargos.excluir',        'Excluir cargos'],
    ['permissoes.gerenciar',  'Gerenciar permissões de cargos'],
    // Sistema
    ['sistema.configurar',    'Acessar e alterar configurações do sistema'],
    ['logs.visualizar',       'Visualizar logs de acesso'],
    // Fechamento
    ['fechamento.criar',      'Criar e gerenciar fechamentos de folha'],
    ['fechamento.visualizar', 'Visualizar fechamentos de folha'],
    // Registros
    ['registros.detalhes',    'Ver detalhes sensíveis dos registros (IP, GPS, foto)'],
  ];
  for (const [nome, descricao] of permissoes) {
    await conn.query(
      `INSERT IGNORE INTO permissoes (nome, descricao) VALUES (?, ?)`,
      [nome, descricao]
    );
  }

  // Admin (cargo_id=1): todas as permissões
  await conn.query(`
    INSERT IGNORE INTO cargo_permissoes (cargo_id, permissao_id)
      SELECT 1, id FROM permissoes
  `);

  // Supervisor (cargo_id=2): permissões operacionais
  const permsSuper = [
    'ponto.registrar',
    'ponto.visualizar',
    'usuarios.visualizar',
    'usuarios.criar',
    'usuarios.editar',
    'relatorios.visualizar',
    'relatorios.exportar',
    'fechamento.criar',
    'fechamento.visualizar',
    'registros.detalhes',
  ];
  for (const nome of permsSuper) {
    await conn.query(`
      INSERT IGNORE INTO cargo_permissoes (cargo_id, permissao_id)
        SELECT 2, id FROM permissoes WHERE nome = ?
    `, [nome]);
  }

  // Funcionário (cargo_id=3): apenas registrar ponto
  await conn.query(`
    INSERT IGNORE INTO cargo_permissoes (cargo_id, permissao_id)
      SELECT 3, id FROM permissoes WHERE nome = 'ponto.registrar'
  `);

  console.log('[Migration] Permissões padrão verificadas.');
}

// ── Seed: configurações padrão ───────────────────────────────
async function seedConfiguracoes(conn) {
  const configs = [
    ['empresa_nome',          'Empresa S.A.',  'string',  'Nome da empresa exibido nos relatórios'],
    ['empresa_cnpj',          '',              'string',  'CNPJ da empresa'],
    ['horario_entrada',       '08:00',         'string',  'Horário padrão de entrada'],
    ['horario_saida',         '17:00',         'string',  'Horário padrão de saída'],
    ['tolerancia_minutos',    '15',            'number',  'Tolerância em minutos para atraso'],
    ['gps_obrigatorio',       'true',          'boolean', 'Exigir GPS no registro de ponto'],
    ['foto_obrigatoria_mobile','true',         'boolean', 'Exigir foto em dispositivos móveis'],
    ['max_raio_metros',       '500',           'number',  'Raio máximo em metros para registro'],
  ];
  for (const [chave, valor, tipo, descricao] of configs) {
    await conn.query(
      `INSERT IGNORE INTO configuracoes (chave, valor, tipo, descricao) VALUES (?, ?, ?, ?)`,
      [chave, valor, tipo, descricao]
    );
  }
  console.log('[Migration] Configurações padrão verificadas.');
}

// ── Seed: usuário admin padrão ───────────────────────────────
async function seedAdmin(conn) {
  const [rows] = await conn.query(
    `SELECT id FROM usuarios WHERE email = 'admin@empresa.com' LIMIT 1`
  );
  if (rows.length) return; // já existe

  const senhaHash = await bcrypt.hash('Admin@123', 12);
  await conn.query(
    `INSERT INTO usuarios (nome, email, cpf, senha_hash, cargo_id)
     VALUES ('Administrador', 'admin@empresa.com', '000.000.000-00', ?, 1)`,
    [senhaHash]
  );
  console.log('[Migration] Usuário admin criado: admin@empresa.com / Admin@123');
  console.log('[Migration] ⚠️  Altere a senha do admin após o primeiro login!');
}

// ── Migrações incrementais (schema já existente) ─────────────
async function runIncrementalMigrations(conn) {
  // registros_ponto: colunas adicionadas após schema inicial
  const [rCols] = await conn.query('SHOW COLUMNS FROM registros_ponto');
  const rNames  = rCols.map(c => c.Field);

  const rAlter = [];
  if (!rNames.includes('ip_publico'))     rAlter.push('ADD COLUMN ip_publico     VARCHAR(45) NULL');
  if (!rNames.includes('precisao'))       rAlter.push('ADD COLUMN precisao       DECIMAL(8,2) NULL');
  if (!rNames.includes('foto_registro'))  rAlter.push('ADD COLUMN foto_registro  VARCHAR(500) NULL');
  if (!rNames.includes('so'))             rAlter.push('ADD COLUMN so             VARCHAR(80) NULL');
  if (!rNames.includes('endereco_aprox')) rAlter.push('ADD COLUMN endereco_aprox TEXT NULL');

  if (rAlter.length) {
    await conn.query(`ALTER TABLE registros_ponto ${rAlter.join(', ')}`);
    console.log('[Migration] registros_ponto: colunas adicionadas →', rAlter.length);
  }

  // fechamentos_folha: colunas adicionadas após schema inicial
  const [fCols] = await conn.query('SHOW COLUMNS FROM fechamentos_folha');
  const fNames  = fCols.map(c => c.Field);

  const fAlter = [];
  if (!fNames.includes('usuario_id'))             fAlter.push('ADD COLUMN usuario_id             INT UNSIGNED NULL AFTER id');
  if (!fNames.includes('enviado_em'))             fAlter.push('ADD COLUMN enviado_em             DATETIME NULL');
  if (!fNames.includes('enviado_por'))            fAlter.push('ADD COLUMN enviado_por            INT UNSIGNED NULL');
  if (!fNames.includes('assinado_em'))            fAlter.push('ADD COLUMN assinado_em            DATETIME NULL');
  if (!fNames.includes('assinado_ip'))            fAlter.push('ADD COLUMN assinado_ip            VARCHAR(45) NULL');
  if (!fNames.includes('rejeitado_em'))           fAlter.push('ADD COLUMN rejeitado_em           DATETIME NULL');
  if (!fNames.includes('motivo_rejeicao'))        fAlter.push('ADD COLUMN motivo_rejeicao        TEXT NULL');
  if (!fNames.includes('fechado_definitivo_em'))  fAlter.push('ADD COLUMN fechado_definitivo_em  DATETIME NULL');
  if (!fNames.includes('fechado_definitivo_por')) fAlter.push('ADD COLUMN fechado_definitivo_por INT UNSIGNED NULL');

  if (fAlter.length) {
    await conn.query(`ALTER TABLE fechamentos_folha ${fAlter.join(', ')}`);
    console.log('[Migration] fechamentos_folha: colunas adicionadas →', fAlter.length);
  }

  // Remover UNIQUE(competencia) do schema antigo — impede múltiplos fechamentos por mês
  const [fIdxs] = await conn.query('SHOW INDEX FROM fechamentos_folha');
  const uniqueComp = fIdxs.find(i => i.Key_name === 'competencia' && i.Non_unique === 0);
  if (uniqueComp) {
    await conn.query('ALTER TABLE fechamentos_folha DROP INDEX `competencia`');
    console.log('[Migration] fechamentos_folha: UNIQUE(competencia) removido');
  }

  // Adicionar índice composto (usuario_id, competencia) se ainda não existir
  const hasComposite = fIdxs.some(i => i.Key_name === 'idx_usuario_comp' || i.Key_name === 'idx_ff_usuario_comp');
  if (!hasComposite) {
    await conn.query('ALTER TABLE fechamentos_folha ADD INDEX idx_usuario_comp (usuario_id, competencia)');
  }

  // Garantir ENUM correto (pode existir versão antiga com 'aberto')
  const statusCol = fCols.find(c => c.Field === 'status');
  if (statusCol && statusCol.Type.includes('aberto')) {
    await conn.query(`
      ALTER TABLE fechamentos_folha
        MODIFY COLUMN status ENUM('rascunho','aberto','enviado','assinado','rejeitado','fechado')
        NOT NULL DEFAULT 'rascunho'
    `);
    await conn.query(`UPDATE fechamentos_folha SET status = 'rascunho' WHERE status = 'aberto'`);
    await conn.query(`
      ALTER TABLE fechamentos_folha
        MODIFY COLUMN status ENUM('rascunho','enviado','assinado','rejeitado','fechado')
        NOT NULL DEFAULT 'rascunho'
    `);
    console.log('[Migration] fechamentos_folha: status ENUM migrado de aberto→rascunho');
  }

  // configuracoes: coluna tipo adicionada após schema inicial
  const [cCols] = await conn.query('SHOW COLUMNS FROM configuracoes');
  const cNames  = cCols.map(c => c.Field);
  if (!cNames.includes('tipo')) {
    await conn.query(`ALTER TABLE configuracoes ADD COLUMN tipo VARCHAR(30) NOT NULL DEFAULT 'string' AFTER valor`);
    console.log('[Migration] configuracoes: coluna tipo adicionada');
  }
  if (!cNames.includes('descricao')) {
    await conn.query(`ALTER TABLE configuracoes ADD COLUMN descricao TEXT NULL`);
    console.log('[Migration] configuracoes: coluna descricao adicionada');
  }
}

// ── Entry point ──────────────────────────────────────────────
async function runMigrations() {
  const conn = await pool.getConnection();
  try {
    // Verifica se o schema já foi criado checando a existência de uma tabela-âncora
    const [[{ tabelasExistem }]] = await conn.query(`
      SELECT COUNT(*) AS tabelasExistem
      FROM information_schema.tables
      WHERE table_schema = DATABASE()
        AND table_name = 'usuarios'
    `);

    if (!tabelasExistem) {
      // ── Primeiro deploy: cria o schema completo ──────────────
      console.log('[Migration] Banco vazio detectado — criando schema completo...');
      const schemaPath = path.join(__dirname, 'schema.sql');
      const schemaSql  = fs.readFileSync(schemaPath, 'utf8');
      await executarSchema(conn, schemaSql);
      console.log('[Migration] Schema criado com sucesso.');

      // Insere dados padrão
      await seedCargos(conn);
      await seedPermissoes(conn);
      await seedConfiguracoes(conn);
      await seedAdmin(conn);
    } else {
      // ── Deploy subsequente: aplica migrações incrementais ────
      console.log('[Migration] Schema existente — aplicando migrações incrementais...');
      await runIncrementalMigrations(conn);

      // Garante que permissões e configurações novas existam
      await seedPermissoes(conn);
      await seedConfiguracoes(conn);
    }

    console.log('[Migration] OK — todas as migrações aplicadas.');
  } catch (err) {
    console.error('[Migration] ERRO:', err.message);
    console.error(err);
    // Não encerra o processo — o servidor sobe mesmo assim para não travar o deploy
  } finally {
    conn.release();
  }
}

module.exports = { runMigrations };

