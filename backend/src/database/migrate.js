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

// ── Seed: empresa padrão (tenant inicial) ───────────────────
async function seedEmpresaPadrao(conn) {
  await conn.query(`
    INSERT IGNORE INTO empresas (id, nome, status, plano)
    VALUES (1, 'Empresa Padrão', 'active', 'basico')
  `);

  // Garante que todos os usuários existentes pertencem à empresa 1
  await conn.query(`
    UPDATE usuarios SET company_id = 1 WHERE company_id IS NULL AND role != 'super_admin'
  `);

  // Promove company_admin baseado no cargo_nivel (somente quem ainda está como 'employee')
  await conn.query(`
    UPDATE usuarios u
    JOIN cargos c ON c.id = u.cargo_id
    SET u.role = 'company_admin'
    WHERE u.role = 'employee' AND c.nivel <= 2
  `);

  console.log('[Migration] Empresa padrão e roles verificados.');
}

// ── Seed: super admin da plataforma ─────────────────────────
async function seedSuperAdmin(conn) {
  const [rows] = await conn.query(
    "SELECT id FROM usuarios WHERE role = 'super_admin' LIMIT 1"
  );
  if (rows.length) return;

  const bcrypt = require('bcrypt');
  const hash   = await bcrypt.hash('SuperAdmin@123', 12);
  await conn.query(
    `INSERT INTO usuarios (nome, email, cpf, senha_hash, cargo_id, company_id, role, ativo)
     VALUES ('Super Admin', 'super@sistema.com', '000.000.000-01', ?, 1, NULL, 'super_admin', 1)`,
    [hash]
  );
  console.log('[Migration] Super Admin criado → super@sistema.com / SuperAdmin@123');
  console.log('[Migration] ⚠️  Altere a senha do super admin imediatamente!');
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
  // Garante company_id nos cargos padrão (após Fase 2 adicionar a coluna)
  await conn.query(`UPDATE cargos SET company_id = 1 WHERE company_id IS NULL AND id IN (1,2,3)`);
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
    // Pagamentos
    ['pagamentos.visualizar', 'Visualizar informações de assinatura e faturas da empresa'],
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

  // Backfill: garante pagamentos.visualizar para todos os cargos nivel <= 2
  // (cobre empresas criadas antes dessa permissão existir)
  const [[payPerm]] = await conn.query(
    "SELECT id FROM permissoes WHERE nome = 'pagamentos.visualizar' LIMIT 1"
  );
  if (payPerm) {
    await conn.query(`
      INSERT IGNORE INTO cargo_permissoes (cargo_id, permissao_id)
      SELECT c.id, ? FROM cargos c WHERE c.nivel <= 2
    `, [payPerm.id]);
  }

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

  // Funcionário (cargo_id=3): registrar e visualizar próprio histórico
  const permsFuncionario = ['ponto.registrar', 'ponto.visualizar'];
  for (const nome of permsFuncionario) {
    await conn.query(`
      INSERT IGNORE INTO cargo_permissoes (cargo_id, permissao_id)
        SELECT 3, id FROM permissoes WHERE nome = ?
    `, [nome]);
  }

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
    ['fuso_horario',          'America/Sao_Paulo', 'string', 'Fuso horário do sistema (ex: America/Sao_Paulo)'],
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
    await conn.query(
      `INSERT IGNORE INTO configuracoes (chave, valor, tipo, descricao, company_id) VALUES (?, ?, ?, ?, 1)`,
      [chave, valor, tipo, descricao]
    );
  }
  // Remove configs com company_id=NULL que já têm equivalente para company_id=1
  await conn.query(`
    DELETE c1 FROM configuracoes c1
    INNER JOIN configuracoes c2 ON c1.chave = c2.chave AND c2.company_id = 1
    WHERE c1.company_id IS NULL
  `);
  // Migra eventuais configs antigas sem company_id
  await conn.query(`UPDATE configuracoes SET company_id = 1 WHERE company_id IS NULL`);
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
  // ── empresas (tabela SaaS multi-tenant) ──────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS empresas (
      id        INT UNSIGNED NOT NULL AUTO_INCREMENT,
      nome      VARCHAR(200) NOT NULL,
      cnpj      VARCHAR(20)  NULL,
      email     VARCHAR(150) NULL,
      telefone  VARCHAR(30)  NULL,
      status    ENUM('active','past_due','suspended') NOT NULL DEFAULT 'active',
      plano     VARCHAR(50)  NOT NULL DEFAULT 'basico',
      criado_em DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── usuarios: colunas SaaS ────────────────────────────────
  const [uCols] = await conn.query('SHOW COLUMNS FROM usuarios');
  const uNames  = uCols.map(c => c.Field);
  const uAlter  = [];
  if (!uNames.includes('company_id')) uAlter.push('ADD COLUMN company_id INT UNSIGNED NULL AFTER id');
  if (!uNames.includes('role'))       uAlter.push("ADD COLUMN role ENUM('super_admin','company_admin','employee') NOT NULL DEFAULT 'employee' AFTER company_id");
  if (uAlter.length) {
    await conn.query(`ALTER TABLE usuarios ${uAlter.join(', ')}`);
    console.log('[Migration] usuarios: colunas SaaS adicionadas →', uAlter.length);
  }
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

  // Remove ip_local: captura via WebRTC se mostrou inviável (bloqueada pelo Chrome desde 2020)
  if (rNames.includes('ip_local')) {
    await conn.query('ALTER TABLE registros_ponto DROP COLUMN ip_local');
    console.log('[Migration] registros_ponto: coluna ip_local removida (feature descontinuada)');
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

  // ── Fase 2: company_id em cargos e configuracoes ──────────
  const [crgCols] = await conn.query('SHOW COLUMNS FROM cargos');
  const crgNames  = crgCols.map(c => c.Field);
  if (!crgNames.includes('company_id')) {
    await conn.query('ALTER TABLE cargos ADD COLUMN company_id INT UNSIGNED NULL AFTER id');
    await conn.query('UPDATE cargos SET company_id = 1 WHERE company_id IS NULL');
    console.log('[Migration] cargos: company_id adicionado');
  }

  if (!cNames.includes('company_id')) {
    await conn.query('ALTER TABLE configuracoes ADD COLUMN company_id INT UNSIGNED NULL AFTER id');
    await conn.query('UPDATE configuracoes SET company_id = 1 WHERE company_id IS NULL');
    console.log('[Migration] configuracoes: company_id adicionado');
  }

  // ── Fase 4: campos Stripe na tabela empresas ─────────────
  const [empCols] = await conn.query('SHOW COLUMNS FROM empresas');
  const empNames  = empCols.map(c => c.Field);
  const empAlter  = [];
  if (!empNames.includes('stripe_customer_id'))     empAlter.push('ADD COLUMN stripe_customer_id     VARCHAR(100) NULL');
  if (!empNames.includes('stripe_subscription_id')) empAlter.push('ADD COLUMN stripe_subscription_id VARCHAR(100) NULL');
  if (!empNames.includes('stripe_status'))          empAlter.push("ADD COLUMN stripe_status          VARCHAR(50)  NULL COMMENT 'status direto do Stripe'");
  if (empAlter.length) {
    await conn.query(`ALTER TABLE empresas ${empAlter.join(', ')}`);
    console.log('[Migration] empresas: campos Stripe adicionados');
  }

  // ── Fase 5: campos SaaS avançados na tabela empresas ─────
  const [empCols2] = await conn.query('SHOW COLUMNS FROM empresas');
  const empNames2  = empCols2.map(c => c.Field);
  const empAlter2  = [];
  if (!empNames2.includes('nome_fantasia'))     empAlter2.push('ADD COLUMN nome_fantasia    VARCHAR(200) NULL AFTER nome');
  if (!empNames2.includes('razao_social'))      empAlter2.push('ADD COLUMN razao_social     VARCHAR(200) NULL AFTER nome_fantasia');
  if (!empNames2.includes('documento'))         empAlter2.push('ADD COLUMN documento        VARCHAR(30)  NULL COMMENT "CPF ou CNPJ"');
  if (!empNames2.includes('tipo_documento'))    empAlter2.push("ADD COLUMN tipo_documento   ENUM('cpf','cnpj') NULL DEFAULT 'cnpj'");
  if (!empNames2.includes('logo'))              empAlter2.push('ADD COLUMN logo             VARCHAR(500) NULL');
  if (!empNames2.includes('trial_ends_at'))     empAlter2.push('ADD COLUMN trial_ends_at    DATETIME     NULL');
  if (!empNames2.includes('plano_expires_at'))  empAlter2.push('ADD COLUMN plano_expires_at DATETIME     NULL COMMENT "quando o plano atual vence"');
  if (!empNames2.includes('tolerancia_dias'))   empAlter2.push('ADD COLUMN tolerancia_dias  TINYINT UNSIGNED NOT NULL DEFAULT 3 COMMENT "dias de tolerância após vencimento"');
  if (!empNames2.includes('inadimplente_desde'))empAlter2.push('ADD COLUMN inadimplente_desde DATETIME NULL COMMENT "quando entrou em past_due"');
  if (empAlter2.length) {
    await conn.query(`ALTER TABLE empresas ${empAlter2.join(', ')}`);
    console.log('[Migration] empresas: campos SaaS avançados adicionados →', empAlter2.length);
  }

  // Adiciona 'trial' ao ENUM status da empresas se não existir
  const [empStatusCol] = await conn.query("SHOW COLUMNS FROM empresas WHERE Field = 'status'");
  if (empStatusCol.length && !empStatusCol[0].Type.includes('trial')) {
    await conn.query(`
      ALTER TABLE empresas
        MODIFY COLUMN status ENUM('trial','active','past_due','suspended') NOT NULL DEFAULT 'trial'
    `);
    console.log('[Migration] empresas: status ENUM expandido com trial');
  }

  // Preenche plano_expires_at para empresas existentes que ainda não têm
  await conn.query(`
    UPDATE empresas 
    SET plano_expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY)
    WHERE plano_expires_at IS NULL AND status != 'suspended'
  `);
  console.log('[Migration] empresas: plano_expires_at preenchido com valor padrão');

  // ── Fase 5b: tabela plano_historico ──────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS plano_historico (
      id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
      empresa_id   INT UNSIGNED NOT NULL,
      plano_antes  VARCHAR(50)  NOT NULL,
      plano_depois VARCHAR(50)  NOT NULL,
      alterado_por INT UNSIGNED NULL COMMENT 'usuario_id do super admin',
      motivo       TEXT         NULL,
      created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_ph_empresa (empresa_id),
      INDEX idx_ph_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[Migration] plano_historico: tabela verificada.');

  // ── Comprovantes de e-mail (tabela de log de envios EmailJS) ─────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS comprovantes_email (
      id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
      registro_id  INT UNSIGNED NOT NULL,
      usuario_id   INT UNSIGNED NOT NULL,
      company_id   INT UNSIGNED NOT NULL,
      email_para   VARCHAR(150) NOT NULL,
      tipo         ENUM('entrada','saida') NOT NULL,
      sucesso      TINYINT(1) NOT NULL DEFAULT 0,
      erro_msg     TEXT NULL,
      enviado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      reenviado    TINYINT(1) NOT NULL DEFAULT 0,
      PRIMARY KEY (id),
      INDEX idx_ce_registro  (registro_id),
      INDEX idx_ce_usuario   (usuario_id),
      INDEX idx_ce_company   (company_id),
      INDEX idx_ce_enviado   (enviado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[Migration] comprovantes_email: tabela verificada.');

  // ── Push notifications: tokens de dispositivo (app mobile) ──────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS device_tokens (
      id          INT UNSIGNED NOT NULL AUTO_INCREMENT,
      usuario_id  INT UNSIGNED NOT NULL,
      token       VARCHAR(255) NOT NULL,
      plataforma  VARCHAR(20)  NULL,
      criado_em   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      UNIQUE KEY uq_device_token (token),
      INDEX idx_dt_usuario (usuario_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[Migration] device_tokens: tabela verificada.');

  // ── Versões do app mobile (seção Downloads) ──────────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS app_versoes (
      id           INT UNSIGNED NOT NULL AUTO_INCREMENT,
      plataforma   ENUM('android','ios') NOT NULL DEFAULT 'android',
      versao       VARCHAR(30)  NOT NULL,
      changelog    TEXT NULL,
      apk_url      VARCHAR(500) NOT NULL,
      publicado_por INT UNSIGNED NULL,
      criado_em    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (id),
      INDEX idx_av_plataforma (plataforma),
      INDEX idx_av_criado (criado_em)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[Migration] app_versoes: tabela verificada.');

  // ── Assinaturas digitais do fechamento de folha ──────────────────────────
  await conn.query(`
    CREATE TABLE IF NOT EXISTS fechamento_assinaturas (
      id              INT UNSIGNED NOT NULL AUTO_INCREMENT,
      fechamento_id   INT UNSIGNED NOT NULL,
      tipo            ENUM('colaborador','responsavel') NOT NULL,
      usuario_id      INT UNSIGNED NOT NULL,
      nome_assinante  VARCHAR(150) NOT NULL,
      cargo_assinante VARCHAR(100) NULL,
      assinatura_url  VARCHAR(500) NOT NULL,
      assinado_em     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      assinado_ip     VARCHAR(45) NULL,
      PRIMARY KEY (id),
      INDEX idx_fa_fechamento (fechamento_id),
      INDEX idx_fa_usuario    (usuario_id),
      UNIQUE KEY uq_fechamento_tipo (fechamento_id, tipo)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  console.log('[Migration] fechamento_assinaturas: tabela verificada.');

  // ── Configs EmailJS — garante existência para todas as empresas ───────────
  const emailjsConfigs = [
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

  // Busca todas as empresas existentes
  const [todasEmpresas] = await conn.query('SELECT id FROM empresas');
  for (const emp of todasEmpresas) {
    for (const [chave, valor, tipo, descricao] of emailjsConfigs) {
      await conn.query(
        `INSERT IGNORE INTO configuracoes (chave, valor, tipo, descricao, company_id) VALUES (?, ?, ?, ?, ?)`,
        [chave, valor, tipo, descricao, emp.id]
      );
    }
  }
  console.log('[Migration] configs EmailJS: verificadas para todas as empresas.');

  // ── Fase 3: UNIQUE constraints compostos (nome+company_id, chave+company_id) ──
  // Tenta remover índices antigos (single-column) — ignora se já não existirem
  try { await conn.query('ALTER TABLE cargos DROP INDEX uq_cargo_nome'); } catch {}
  try { await conn.query('ALTER TABLE cargos DROP INDEX nome'); } catch {}
  try { await conn.query('ALTER TABLE configuracoes DROP INDEX uq_config_chave'); } catch {}
  try { await conn.query('ALTER TABLE configuracoes DROP INDEX chave'); } catch {}

  // Adiciona índices compostos se ainda não existirem
  const [crgIdx2] = await conn.query('SHOW INDEX FROM cargos');
  if (!crgIdx2.some(i => i.Key_name === 'uq_cargo_nome_company')) {
    await conn.query('ALTER TABLE cargos ADD UNIQUE KEY uq_cargo_nome_company (nome, company_id)');
    console.log('[Migration] cargos: UNIQUE(nome, company_id) criado');
  }

  const [cfgIdx2] = await conn.query('SHOW INDEX FROM configuracoes');
  if (!cfgIdx2.some(i => i.Key_name === 'uq_config_chave_company')) {
    await conn.query('ALTER TABLE configuracoes ADD UNIQUE KEY uq_config_chave_company (chave, company_id)');
    console.log('[Migration] configuracoes: UNIQUE(chave, company_id) criado');
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
      await seedEmpresaPadrao(conn);
      await seedSuperAdmin(conn);
    } else {
      // ── Deploy subsequente: aplica migrações incrementais ────
      console.log('[Migration] Schema existente — aplicando migrações incrementais...');
      await runIncrementalMigrations(conn);

      // Garante que permissões, configurações e dados SaaS existam
      await seedPermissoes(conn);
      await seedConfiguracoes(conn);
      await seedEmpresaPadrao(conn);
      await seedSuperAdmin(conn);
    }

    // ── Garante pagamentos.visualizar para todos cargos nivel <= 2 (idempotente) ──
    await conn.query(
      "INSERT IGNORE INTO permissoes (nome, descricao) VALUES ('pagamentos.visualizar', 'Visualizar informações de assinatura e faturas da empresa')"
    );
    const [[_payPerm]] = await conn.query(
      "SELECT id FROM permissoes WHERE nome = 'pagamentos.visualizar' LIMIT 1"
    );
    if (_payPerm) {
      await conn.query(
        "INSERT IGNORE INTO cargo_permissoes (cargo_id, permissao_id) SELECT c.id, ? FROM cargos c WHERE c.nivel <= 2",
        [_payPerm.id]
      );
      console.log('[Migration] pagamentos.visualizar garantida para cargos nivel <= 2.');
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

