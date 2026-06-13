const { pool } = require('./connection');

async function runMigrations() {
  try {
    // ── registros_ponto: colunas adicionadas após schema inicial ────
    const [rCols] = await pool.query('SHOW COLUMNS FROM registros_ponto');
    const rNames  = rCols.map(c => c.Field);

    const rAlter = [];
    if (!rNames.includes('ip_publico'))     rAlter.push('ADD COLUMN ip_publico     VARCHAR(45) NULL');
    if (!rNames.includes('precisao'))       rAlter.push('ADD COLUMN precisao       DECIMAL(8,2) NULL');
    if (!rNames.includes('foto_registro'))  rAlter.push('ADD COLUMN foto_registro  VARCHAR(500) NULL');
    if (!rNames.includes('so'))             rAlter.push('ADD COLUMN so             VARCHAR(80) NULL');
    if (!rNames.includes('endereco_aprox')) rAlter.push('ADD COLUMN endereco_aprox TEXT NULL');

    if (rAlter.length) {
      await pool.query(`ALTER TABLE registros_ponto ${rAlter.join(', ')}`);
      console.log('[Migration] registros_ponto: colunas adicionadas →', rAlter.length);
    }

    // ── fechamentos_folha: criar se não existir ──────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS fechamentos_folha (
        id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        usuario_id             INT UNSIGNED NULL,
        competencia            VARCHAR(7)   NOT NULL COMMENT 'YYYY-MM',
        data_inicio            DATE         NOT NULL,
        data_fim               DATE         NOT NULL,
        status                 ENUM('rascunho','enviado','assinado','rejeitado','fechado')
                               NOT NULL DEFAULT 'rascunho',
        criado_por             INT UNSIGNED NULL,
        observacao             TEXT NULL,
        enviado_em             DATETIME NULL,
        enviado_por            INT UNSIGNED NULL,
        assinado_em            DATETIME NULL,
        assinado_ip            VARCHAR(45) NULL,
        rejeitado_em           DATETIME NULL,
        motivo_rejeicao        TEXT NULL,
        fechado_definitivo_em  DATETIME NULL,
        fechado_definitivo_por INT UNSIGNED NULL,
        created_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at             TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_competencia (competencia),
        INDEX idx_usuario     (usuario_id),
        INDEX idx_status      (status)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // Se a tabela JÁ existia (schema antigo), garantir colunas novas
    const [fCols] = await pool.query('SHOW COLUMNS FROM fechamentos_folha');
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
      await pool.query(`ALTER TABLE fechamentos_folha ${fAlter.join(', ')}`);
      console.log('[Migration] fechamentos_folha: colunas adicionadas →', fAlter.length);
    }

    // Remover UNIQUE(competencia) do schema antigo — impede múltiplos fechamentos por mês
    const [fIdxs] = await pool.query('SHOW INDEX FROM fechamentos_folha');
    const uniqueComp = fIdxs.find(i => i.Key_name === 'competencia' && i.Non_unique === 0);
    if (uniqueComp) {
      await pool.query('ALTER TABLE fechamentos_folha DROP INDEX `competencia`');
      console.log('[Migration] fechamentos_folha: UNIQUE(competencia) removido');
    }
    // Adicionar índice composto (usuario_id, competencia) se ainda não existir
    const hasComposite = fIdxs.some(i => i.Key_name === 'idx_usuario_comp');
    if (!hasComposite) {
      await pool.query('ALTER TABLE fechamentos_folha ADD INDEX idx_usuario_comp (usuario_id, competencia)');
    }

    // Garantir ENUM correto (pode existir versão antiga com 'aberto')
    const statusCol = fCols.find(c => c.Field === 'status');
    if (statusCol && statusCol.Type.includes('aberto')) {
      await pool.query(`
        ALTER TABLE fechamentos_folha
          MODIFY COLUMN status ENUM('rascunho','aberto','enviado','assinado','rejeitado','fechado')
          NOT NULL DEFAULT 'rascunho'
      `);
      await pool.query(`UPDATE fechamentos_folha SET status = 'rascunho' WHERE status = 'aberto'`);
      await pool.query(`
        ALTER TABLE fechamentos_folha
          MODIFY COLUMN status ENUM('rascunho','enviado','assinado','rejeitado','fechado')
          NOT NULL DEFAULT 'rascunho'
      `);
      console.log('[Migration] fechamentos_folha: status ENUM migrado de aberto→rascunho');
    }

    // ── notificacoes ─────────────────────────────────────────────
    await pool.query(`
      CREATE TABLE IF NOT EXISTS notificacoes (
        id            INT AUTO_INCREMENT PRIMARY KEY,
        usuario_id    INT NOT NULL,
        tipo          VARCHAR(50) NOT NULL DEFAULT 'sistema',
        titulo        VARCHAR(200) NOT NULL,
        mensagem      TEXT,
        fechamento_id INT NULL,
        lida          TINYINT(1) NOT NULL DEFAULT 0,
        created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_usuario_lida (usuario_id, lida),
        INDEX idx_fechamento   (fechamento_id)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
    `);

    // ── Permissões do módulo de fechamento ───────────────────────
    const novasPerms = [
      ['fechamento.criar',      'Criar e gerenciar fechamentos de folha'],
      ['fechamento.visualizar', 'Visualizar fechamentos de folha'],
      ['registros.detalhes',    'Ver detalhes sensíveis dos registros (IP, GPS, foto)'],
    ];
    for (const [nome, descricao] of novasPerms) {
      await pool.query(
        `INSERT IGNORE INTO permissoes (nome, descricao) VALUES (?, ?)`,
        [nome, descricao]
      );
    }

    // Admin (cargo_id=1): todas as permissões automaticamente
    await pool.query(`
      INSERT IGNORE INTO cargo_permissoes (cargo_id, permissao_id)
        SELECT 1, id FROM permissoes
        WHERE nome IN ('fechamento.criar','fechamento.visualizar','registros.detalhes')
    `);

    // Supervisor (cargo_id=2): visualizar e criar fechamento + detalhes
    await pool.query(`
      INSERT IGNORE INTO cargo_permissoes (cargo_id, permissao_id)
        SELECT 2, id FROM permissoes
        WHERE nome IN ('fechamento.criar','fechamento.visualizar','registros.detalhes')
    `);

    console.log('[Migration] OK — todas as migrações aplicadas.');
  } catch (err) {
    console.error('[Migration] ERRO:', err.message);
    console.error(err);
  }
}

module.exports = { runMigrations };
