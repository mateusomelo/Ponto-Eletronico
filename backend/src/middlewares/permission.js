function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'super_admin') {
    return res.status(403).json({ erro: 'Acesso exclusivo do Super Admin.' });
  }
  next();
}

function authorize(...permissoesNecessarias) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ erro: 'Não autenticado.' });
    }

    // Super Admin tem acesso total ao sistema
    if (req.user.role === 'super_admin') {
      return next();
    }

    // Admins (nível 1) e supervisores/RH (nível 2) têm acesso irrestrito
    if (req.user.cargo_nivel <= 2) {
      return next();
    }

    const temPermissao = permissoesNecessarias.every(p =>
      req.user.permissoes.includes(p)
    );

    if (!temPermissao) {
      return res.status(403).json({
        erro: 'Acesso negado. Permissão insuficiente.',
        necessarias: permissoesNecessarias,
      });
    }

    next();
  };
}

function authorizeAny(...permissoesNecessarias) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ erro: 'Não autenticado.' });
    }

    const temAlguma = permissoesNecessarias.some(p =>
      req.user.permissoes.includes(p)
    );

    if (!temAlguma) {
      return res.status(403).json({ erro: 'Acesso negado.' });
    }

    next();
  };
}

function isAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ erro: 'Não autenticado.' });
  if (req.user.role === 'super_admin' || req.user.cargo_nivel <= 1) return next();
  return res.status(403).json({ erro: 'Acesso restrito a administradores.' });
}

module.exports = { authorize, authorizeAny, isAdmin, requireSuperAdmin };
