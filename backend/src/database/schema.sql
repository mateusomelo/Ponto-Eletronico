-- ============================================================
-- Ponto Eletronico — Schema completo
-- Executado automaticamente no primeiro deploy via migrate.js
-- ============================================================

SET NAMES utf8mb4;
SET time_zone = '-03:00';

-- ── cargos ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cargos (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome        VARCHAR(100) NOT NULL,
  descricao   TEXT NULL,
  nivel       TINYINT UNSIGNED NOT NULL DEFAULT 3
                COMMENT '1=Admin, 2=Supervisor, 3=Funcionário',
  ativo       TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_cargo_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── usuarios ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome                    VARCHAR(150) NOT NULL,
  email                   VARCHAR(150) NOT NULL,
  cpf                     VARCHAR(20)  NOT NULL,
  telefone                VARCHAR(30)  NULL,
  senha_hash              VARCHAR(255) NOT NULL,
  foto                    VARCHAR(500) NULL,
  cargo_id                INT UNSIGNED NOT NULL,
  ativo                   TINYINT(1) NOT NULL DEFAULT 1,
  bloqueado               TINYINT(1) NOT NULL DEFAULT 0,
  salario_mensal          DECIMAL(10,2) NULL,
  carga_horaria_semanal   DECIMAL(5,2)  NOT NULL DEFAULT 40.00,
  ultimo_acesso           DATETIME NULL,
  reset_token             VARCHAR(100) NULL,
  reset_expires           DATETIME NULL,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_usuario_email (email),
  UNIQUE KEY uq_usuario_cpf   (cpf),
  INDEX idx_usuario_cargo (cargo_id),
  CONSTRAINT fk_usuario_cargo FOREIGN KEY (cargo_id) REFERENCES cargos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── registros_ponto ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS registros_ponto (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id      INT UNSIGNED NOT NULL,
  tipo            ENUM('entrada','saida') NOT NULL,
  data_hora       DATETIME NOT NULL,
  ip              VARCHAR(45)  NULL,
  ip_publico      VARCHAR(45)  NULL,
  latitude        DECIMAL(10,7) NULL,
  longitude       DECIMAL(10,7) NULL,
  precisao        DECIMAL(8,2)  NULL,
  foto_registro   VARCHAR(500)  NULL,
  dispositivo     VARCHAR(50)   NULL,
  so              VARCHAR(80)   NULL,
  navegador       VARCHAR(80)   NULL,
  user_agent      TEXT NULL,
  endereco_aprox  TEXT NULL,
  observacao      TEXT NULL,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rp_usuario   (usuario_id),
  INDEX idx_rp_data_hora (data_hora),
  INDEX idx_rp_tipo      (tipo),
  CONSTRAINT fk_rp_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── logs_acesso ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS logs_acesso (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED NULL,
  acao          VARCHAR(100) NOT NULL,
  descricao     TEXT NULL,
  ip            VARCHAR(45)  NULL,
  user_agent    TEXT NULL,
  dados_antes   JSON NULL,
  dados_depois  JSON NULL,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_log_usuario   (usuario_id),
  INDEX idx_log_acao      (acao),
  INDEX idx_log_created   (created_at),
  CONSTRAINT fk_log_usuario FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── permissoes ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS permissoes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome        VARCHAR(100) NOT NULL,
  descricao   TEXT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_permissao_nome (nome)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── cargo_permissoes ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cargo_permissoes (
  cargo_id      INT UNSIGNED NOT NULL,
  permissao_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (cargo_id, permissao_id),
  CONSTRAINT fk_cp_cargo      FOREIGN KEY (cargo_id)     REFERENCES cargos     (id) ON DELETE CASCADE,
  CONSTRAINT fk_cp_permissao  FOREIGN KEY (permissao_id) REFERENCES permissoes  (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── configuracoes ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS configuracoes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  chave       VARCHAR(100) NOT NULL,
  valor       TEXT NULL,
  tipo        VARCHAR(30)  NOT NULL DEFAULT 'string'
                COMMENT 'string | number | boolean | json',
  descricao   TEXT NULL,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_config_chave (chave)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── fechamentos_folha ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fechamentos_folha (
  id                      INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id              INT UNSIGNED NULL,
  competencia             VARCHAR(7)   NOT NULL COMMENT 'YYYY-MM',
  data_inicio             DATE         NOT NULL,
  data_fim                DATE         NOT NULL,
  status                  ENUM('rascunho','enviado','assinado','rejeitado','fechado')
                          NOT NULL DEFAULT 'rascunho',
  criado_por              INT UNSIGNED NULL,
  observacao              TEXT NULL,
  enviado_em              DATETIME NULL,
  enviado_por             INT UNSIGNED NULL,
  assinado_em             DATETIME NULL,
  assinado_ip             VARCHAR(45)  NULL,
  rejeitado_em            DATETIME NULL,
  motivo_rejeicao         TEXT NULL,
  fechado_definitivo_em   DATETIME NULL,
  fechado_definitivo_por  INT UNSIGNED NULL,
  created_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at              TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_ff_competencia      (competencia),
  INDEX idx_ff_usuario          (usuario_id),
  INDEX idx_ff_status           (status),
  INDEX idx_ff_usuario_comp     (usuario_id, competencia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ── notificacoes ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notificacoes (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED NOT NULL,
  tipo          VARCHAR(50)  NOT NULL DEFAULT 'sistema',
  titulo        VARCHAR(200) NOT NULL,
  mensagem      TEXT NULL,
  fechamento_id INT UNSIGNED NULL,
  lida          TINYINT(1)   NOT NULL DEFAULT 0,
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_notif_usuario_lida (usuario_id, lida),
  INDEX idx_notif_fechamento   (fechamento_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
