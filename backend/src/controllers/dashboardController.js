const { pool } = require('../database/connection');

// GET /api/dashboard
async function resumo(req, res) {
  try {
    // ── Dashboard do Funcionário ──────────────────────────────
    if (req.user.cargo_nivel >= 3) {
      return await resumoFuncionario(req, res);
    }

    // ── Dashboard Admin / Supervisor ─────────────────────────
    const cid = req.user.company_id;
    const uWhere = cid ? 'WHERE ativo=1 AND company_id=?' : 'WHERE ativo=1';
    const uParam = cid ? [cid] : [];
    const uActiveWhere = cid ? 'WHERE ativo=1 AND bloqueado=0 AND company_id=?' : 'WHERE ativo=1 AND bloqueado=0';

    // Subquery de registros da empresa (via JOIN usuarios)
    const rJoin   = 'JOIN usuarios u ON u.id = r.usuario_id';
    const rCidW   = cid ? ' AND u.company_id=?' : '';
    const rCidP   = cid ? [cid] : [];

    const [[totUsuarios]]  = await pool.query(`SELECT COUNT(*) AS v FROM usuarios ${uWhere}`, uParam);
    const [[totAtivos]]    = await pool.query(`SELECT COUNT(*) AS v FROM usuarios ${uActiveWhere}`, uParam);
    const [[regHoje]]      = await pool.query(
      `SELECT COUNT(*) AS v FROM registros_ponto r ${rJoin} WHERE DATE(r.data_hora)=CURDATE()${rCidW}`, rCidP
    );
    const [[regSemana]]    = await pool.query(
      `SELECT COUNT(*) AS v FROM registros_ponto r ${rJoin} WHERE r.data_hora >= DATE_SUB(NOW(), INTERVAL 7 DAY)${rCidW}`, rCidP
    );
    const [[regMes]]       = await pool.query(
      `SELECT COUNT(*) AS v FROM registros_ponto r ${rJoin} WHERE MONTH(r.data_hora)=MONTH(NOW()) AND YEAR(r.data_hora)=YEAR(NOW())${rCidW}`, rCidP
    );

    const uAccWhere = cid ? 'AND u.ultimo_acesso IS NOT NULL AND u.company_id=?' : 'AND u.ultimo_acesso IS NOT NULL';
    const uAccParam = cid ? [cid] : [];
    const [ultimosAcessos] = await pool.query(
      `SELECT u.id, u.nome, u.email, c.nome AS cargo, u.ultimo_acesso
       FROM usuarios u JOIN cargos c ON c.id=u.cargo_id
       WHERE 1=1 ${uAccWhere}
       ORDER BY u.ultimo_acesso DESC LIMIT 5`,
      uAccParam
    );

    const [ultimosPontos] = await pool.query(
      `SELECT r.id, r.tipo, r.data_hora, r.ip, u.nome AS usuario_nome
       FROM registros_ponto r JOIN usuarios u ON u.id=r.usuario_id
       WHERE 1=1${rCidW}
       ORDER BY r.data_hora DESC LIMIT 10`,
      rCidP
    );

    const [presencaDiaria] = await pool.query(
      `SELECT DATE(r.data_hora) AS dia, COUNT(DISTINCT r.usuario_id) AS total
       FROM registros_ponto r ${rJoin}
       WHERE r.data_hora >= DATE_SUB(NOW(), INTERVAL 7 DAY) AND r.tipo='entrada'${rCidW}
       GROUP BY DATE(r.data_hora)
       ORDER BY dia ASC`,
      rCidP
    );

    const [porHora] = await pool.query(
      `SELECT HOUR(r.data_hora) AS hora, COUNT(*) AS total
       FROM registros_ponto r ${rJoin}
       WHERE DATE(r.data_hora) = CURDATE()${rCidW}
       GROUP BY HOUR(r.data_hora)
       ORDER BY hora ASC`,
      rCidP
    );

    const [[presentesAgora]] = await pool.query(
      `SELECT COUNT(DISTINCT usuario_id) AS v
       FROM (
         SELECT r.usuario_id, r.tipo,
                ROW_NUMBER() OVER (PARTITION BY r.usuario_id ORDER BY r.data_hora DESC) AS rn
         FROM registros_ponto r ${rJoin}
         WHERE DATE(r.data_hora) = CURDATE()${rCidW}
       ) t
       WHERE rn=1 AND tipo='entrada'`,
      rCidP
    );

    return res.json({
      tipo:               'admin',
      total_usuarios:     totUsuarios.v,
      usuarios_ativos:    totAtivos.v,
      presentes_agora:    presentesAgora.v,
      registros_hoje:     regHoje.v,
      registros_semana:   regSemana.v,
      registros_mes:      regMes.v,
      ultimos_acessos:    ultimosAcessos,
      ultimos_pontos:     ultimosPontos,
      presenca_diaria:    presencaDiaria,
      registros_por_hora: porHora,
    });
  } catch (err) {
    console.error('[Dashboard]', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

async function resumoFuncionario(req, res) {
  const uid = req.user.id;

  const [[regHoje]]   = await pool.query(
    'SELECT COUNT(*) AS v FROM registros_ponto WHERE usuario_id=? AND DATE(data_hora)=CURDATE()', [uid]
  );
  const [[regSemana]] = await pool.query(
    'SELECT COUNT(*) AS v FROM registros_ponto WHERE usuario_id=? AND data_hora >= DATE_SUB(NOW(), INTERVAL 7 DAY)', [uid]
  );
  const [[regMes]]    = await pool.query(
    'SELECT COUNT(*) AS v FROM registros_ponto WHERE usuario_id=? AND MONTH(data_hora)=MONTH(NOW()) AND YEAR(data_hora)=YEAR(NOW())', [uid]
  );
  const [[diasMes]]   = await pool.query(
    'SELECT COUNT(DISTINCT DATE(data_hora)) AS v FROM registros_ponto WHERE usuario_id=? AND MONTH(data_hora)=MONTH(NOW()) AND YEAR(data_hora)=YEAR(NOW())', [uid]
  );

  // Status atual (último registro)
  const [ultimoReg] = await pool.query(
    'SELECT tipo, data_hora FROM registros_ponto WHERE usuario_id=? ORDER BY data_hora DESC LIMIT 1', [uid]
  );

  // Últimos 10 registros
  const [ultimosPontos] = await pool.query(
    `SELECT r.id, r.tipo, r.data_hora, r.ip, r.dispositivo, r.navegador
     FROM registros_ponto r
     WHERE r.usuario_id = ?
     ORDER BY r.data_hora DESC LIMIT 10`,
    [uid]
  );

  // Presença diária nos últimos 7 dias (própria)
  const [presencaDiaria] = await pool.query(
    `SELECT DATE(data_hora) AS dia, COUNT(*) AS total
     FROM registros_ponto
     WHERE usuario_id=? AND data_hora >= DATE_SUB(NOW(), INTERVAL 7 DAY)
     GROUP BY DATE(data_hora)
     ORDER BY dia ASC`,
    [uid]
  );

  const ultimo = ultimoReg.length ? ultimoReg[0] : null;

  return res.json({
    tipo:             'funcionario',
    registros_hoje:   regHoje.v,
    registros_semana: regSemana.v,
    registros_mes:    regMes.v,
    dias_mes:         diasMes.v,
    no_trabalho:      ultimo && ultimo.tipo === 'entrada',
    ultimo_registro:  ultimo,
    ultimos_pontos:   ultimosPontos,
    presenca_diaria:  presencaDiaria,
  });
}

module.exports = { resumo };
