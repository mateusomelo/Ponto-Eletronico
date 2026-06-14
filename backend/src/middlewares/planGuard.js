const { pool } = require('../database/connection');

// Limites e funcionalidades por plano
const PLAN_LIMITS = {
  basico: {
    employee_limit: 10,
    relatorios:     false,
    fechamento:     false,
    export:         false,
    logs:           false,
    label:          'Básico',
  },
  profissional: {
    employee_limit: 50,
    relatorios:     true,
    fechamento:     true,
    export:         true,
    logs:           false,
    label:          'Profissional',
  },
  enterprise: {
    employee_limit: 999,
    relatorios:     true,
    fechamento:     true,
    export:         true,
    logs:           true,
    label:          'Enterprise',
  },
};

function getLimits(plano) {
  return PLAN_LIMITS[plano] || PLAN_LIMITS.basico;
}

// Middleware: permite acesso apenas se o plano da empresa estiver na lista
function requirePlan(...planos) {
  return async (req, res, next) => {
    if (!req.user) return res.status(401).json({ erro: 'Não autenticado.' });
    // Super admin não está vinculado a plano
    if (req.user.role === 'super_admin') return next();

    try {
      const [[emp]] = await pool.query(
        'SELECT plano FROM empresas WHERE id = ?',
        [req.user.company_id]
      );
      if (!emp) return res.status(403).json({ erro: 'Empresa não encontrada.' });

      if (!planos.includes(emp.plano)) {
        const limits = getLimits(emp.plano);
        return res.status(403).json({
          erro:              `Esta funcionalidade não está disponível no plano ${limits.label}.`,
          code:              'PLAN_INSUFFICIENT',
          plano_atual:       emp.plano,
          planos_necessarios: planos,
        });
      }
      next();
    } catch (err) {
      console.error('[planGuard] requirePlan:', err);
      return res.status(500).json({ erro: 'Erro interno.' });
    }
  };
}

// Middleware: bloqueia criação de usuário se o limite do plano foi atingido
async function checkEmployeeLimit(req, res, next) {
  if (!req.user) return res.status(401).json({ erro: 'Não autenticado.' });
  if (req.user.role === 'super_admin') return next();

  const company_id = req.user.company_id;
  if (!company_id) return next();

  try {
    const [[emp]] = await pool.query(
      'SELECT plano FROM empresas WHERE id = ?',
      [company_id]
    );
    if (!emp) return next();

    const limit = getLimits(emp.plano).employee_limit;

    const [[{ total }]] = await pool.query(
      'SELECT COUNT(*) AS total FROM usuarios WHERE company_id = ? AND ativo = 1',
      [company_id]
    );

    if (total >= limit) {
      return res.status(403).json({
        erro:   `Limite de ${limit} usuário(s) atingido para o plano ${getLimits(emp.plano).label}. Faça upgrade para adicionar mais usuários.`,
        code:   'EMPLOYEE_LIMIT_REACHED',
        limite: limit,
        atual:  total,
      });
    }
    next();
  } catch (err) {
    console.error('[planGuard] checkEmployeeLimit:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { requirePlan, checkEmployeeLimit, PLAN_LIMITS, getLimits };
