const { pool } = require('../database/connection');

async function registrar({ usuario_id, acao, descricao, ip, user_agent, dados_antes, dados_depois }) {
  let company_id = null;
  if (usuario_id) {
    const [[u]] = await pool.query('SELECT company_id FROM usuarios WHERE id = ? LIMIT 1', [usuario_id]);
    company_id = u?.company_id || null;
  }

  await pool.query(
    `INSERT INTO logs_acesso (usuario_id, company_id, acao, descricao, ip, user_agent, dados_antes, dados_depois)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      usuario_id   || null,
      company_id,
      acao,
      descricao    || null,
      ip           || null,
      user_agent   || null,
      dados_antes  ? JSON.stringify(dados_antes)  : null,
      dados_depois ? JSON.stringify(dados_depois) : null,
    ]
  );
}

async function listar({ pagina = 1, por_pagina = 50, usuario_id, acao, data_inicio, data_fim, company_id } = {}) {
  const offset = (pagina - 1) * por_pagina;
  const params = [];
  let where = 'WHERE 1=1';

  if (company_id)  { where += ' AND l.company_id = ?'; params.push(company_id); }
  if (usuario_id)  { where += ' AND l.usuario_id = ?'; params.push(usuario_id); }
  if (acao)        { where += ' AND l.acao LIKE ?';    params.push(`%${acao}%`); }
  if (data_inicio) { where += ' AND l.created_at >= ?'; params.push(data_inicio); }
  if (data_fim)    { where += ' AND l.created_at <= ?'; params.push(data_fim + ' 23:59:59'); }

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM logs_acesso l LEFT JOIN usuarios u ON u.id = l.usuario_id ${where}`,
    params
  );

  const [rows] = await pool.query(
    `SELECT l.*, u.nome AS usuario_nome, u.email AS usuario_email
     FROM logs_acesso l
     LEFT JOIN usuarios u ON u.id = l.usuario_id
     ${where}
     ORDER BY l.created_at DESC
     LIMIT ${parseInt(por_pagina)} OFFSET ${parseInt(offset)}`,
    params
  );

  // IP fica armazenado no banco para auditoria técnica interna, mas nunca
  // é exposto via API — não é exibido para empresas/usuários.
  const registros = rows.map(({ ip, ...resto }) => resto);

  return { total, pagina, por_pagina, registros };
}

module.exports = { registrar, listar };
