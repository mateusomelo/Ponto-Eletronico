-- ============================================================
-- PONTO ELETRONICO CORPORATIVO - Schema MySQL
-- ============================================================

CREATE DATABASE IF NOT EXISTS ponto_eletronico
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ponto_eletronico;

-- --------------------------------------------------------
-- PERMISSOES
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS permissoes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome        VARCHAR(60) NOT NULL UNIQUE,
  descricao   VARCHAR(200),
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO permissoes (nome, descricao) VALUES
  ('usuarios.criar',       'Criar novos usuários'),
  ('usuarios.editar',      'Editar dados de usuários'),
  ('usuarios.excluir',     'Excluir usuários'),
  ('usuarios.visualizar',  'Listar e visualizar usuários'),
  ('cargos.criar',         'Criar novos cargos'),
  ('cargos.editar',        'Editar cargos existentes'),
  ('cargos.excluir',       'Excluir cargos'),
  ('permissoes.gerenciar', 'Gerenciar permissões de cargos'),
  ('relatorios.visualizar','Visualizar relatórios'),
  ('relatorios.exportar',  'Exportar relatórios em PDF/Excel'),
  ('ponto.registrar',      'Registrar entrada e saída'),
  ('ponto.visualizar',     'Visualizar registros de ponto'),
  ('sistema.configurar',   'Acessar configurações do sistema');

-- --------------------------------------------------------
-- CARGOS
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS cargos (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome        VARCHAR(80) NOT NULL UNIQUE,
  descricao   VARCHAR(200),
  nivel       TINYINT UNSIGNED NOT NULL DEFAULT 3 COMMENT '1=Admin 2=Supervisor 3=Funcionario',
  ativo       TINYINT(1) NOT NULL DEFAULT 1,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO cargos (nome, descricao, nivel) VALUES
  ('Administrador', 'Controle total do sistema', 1),
  ('Supervisor',    'Supervisão de equipe e relatórios', 2),
  ('Funcionário',   'Registro de ponto e consulta própria', 3);

-- --------------------------------------------------------
-- CARGO_PERMISSOES
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS cargo_permissoes (
  cargo_id      INT UNSIGNED NOT NULL,
  permissao_id  INT UNSIGNED NOT NULL,
  PRIMARY KEY (cargo_id, permissao_id),
  FOREIGN KEY (cargo_id)     REFERENCES cargos(id)     ON DELETE CASCADE,
  FOREIGN KEY (permissao_id) REFERENCES permissoes(id) ON DELETE CASCADE
) ENGINE=InnoDB;

-- Admin: todas as permissões
INSERT INTO cargo_permissoes (cargo_id, permissao_id)
  SELECT 1, id FROM permissoes;

-- Supervisor
INSERT INTO cargo_permissoes (cargo_id, permissao_id)
  SELECT 2, id FROM permissoes
  WHERE nome IN ('usuarios.visualizar','relatorios.visualizar','relatorios.exportar','ponto.registrar','ponto.visualizar');

-- Funcionário
INSERT INTO cargo_permissoes (cargo_id, permissao_id)
  SELECT 3, id FROM permissoes
  WHERE nome IN ('ponto.registrar','ponto.visualizar','relatorios.visualizar','relatorios.exportar');

-- --------------------------------------------------------
-- USUARIOS
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS usuarios (
  id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nome            VARCHAR(120) NOT NULL,
  email           VARCHAR(120) NOT NULL UNIQUE,
  cpf             VARCHAR(14)  NOT NULL UNIQUE,
  telefone        VARCHAR(20),
  senha_hash      VARCHAR(255) NOT NULL,
  cargo_id        INT UNSIGNED NOT NULL,
  ativo           TINYINT(1) NOT NULL DEFAULT 1,
  bloqueado       TINYINT(1) NOT NULL DEFAULT 0,
  reset_token     VARCHAR(255),
  reset_expires   DATETIME,
  ultimo_acesso   DATETIME,
  created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (cargo_id) REFERENCES cargos(id)
) ENGINE=InnoDB;

-- Admin padrão: admin@empresa.com / Admin@123
INSERT INTO usuarios (nome, email, cpf, telefone, senha_hash, cargo_id)
VALUES (
  'Administrador',
  'admin@empresa.com',
  '000.000.000-00',
  '(00) 00000-0000',
  '$2b$12$fMBKlSJ49i3t58pzIiRowOBDEyh/aLV/tJouJdsg/cYFIG10ZIfp6',
  1
);

-- --------------------------------------------------------
-- REGISTROS_PONTO
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS registros_ponto (
  id            BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id    INT UNSIGNED NOT NULL,
  tipo          ENUM('entrada','saida') NOT NULL,
  data_hora     DATETIME NOT NULL,
  ip            VARCHAR(45),
  latitude      DECIMAL(10,8),
  longitude     DECIMAL(11,8),
  dispositivo   VARCHAR(255),
  navegador     VARCHAR(255),
  user_agent    TEXT,
  observacao    VARCHAR(500),
  created_at    TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE CASCADE,
  INDEX idx_usuario_data (usuario_id, data_hora),
  INDEX idx_data_hora    (data_hora)
) ENGINE=InnoDB;

-- --------------------------------------------------------
-- LOGS_ACESSO
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS logs_acesso (
  id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id  INT UNSIGNED,
  acao        VARCHAR(80) NOT NULL,
  descricao   TEXT,
  ip          VARCHAR(45),
  user_agent  TEXT,
  dados_antes JSON,
  dados_depois JSON,
  created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (usuario_id) REFERENCES usuarios(id) ON DELETE SET NULL,
  INDEX idx_usuario   (usuario_id),
  INDEX idx_acao      (acao),
  INDEX idx_created   (created_at)
) ENGINE=InnoDB;

-- --------------------------------------------------------
-- CONFIGURACOES
-- --------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracoes (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  chave       VARCHAR(80) NOT NULL UNIQUE,
  valor       TEXT,
  descricao   VARCHAR(200),
  updated_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

INSERT INTO configuracoes (chave, valor, descricao) VALUES
  ('empresa_nome',         'Empresa S.A.',            'Nome da empresa'),
  ('empresa_cnpj',         '00.000.000/0001-00',       'CNPJ da empresa'),
  ('jornada_horas_dia',    '8',                        'Horas de trabalho por dia'),
  ('intervalo_minutos',    '60',                       'Duração do intervalo em minutos'),
  ('fuso_horario',         'America/Sao_Paulo',        'Fuso horário do sistema'),
  ('geolocalizacao',       '1',                        'Exigir geolocalização no registro'),
  ('max_tentativas_login', '5',                        'Máximo de tentativas de login'),
  ('session_expira_horas', '8',                        'Expiração da sessão em horas');
