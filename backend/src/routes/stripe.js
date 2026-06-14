const router = require('express').Router();
const { authenticate }                    = require('../middlewares/auth');
const { requireSuperAdmin, authorize }    = require('../middlewares/permission');
const ctrl = require('../controllers/stripeController');

// ── Rotas company_admin ──────────────────────────────────────
// Ver própria assinatura (requer pagamentos.visualizar)
router.get('/minha-assinatura', authenticate, authorize('pagamentos.visualizar'), ctrl.minhaAssinatura);

// Alerta leve de fatura pendente — qualquer usuário autenticado da empresa pode ver
// (usado pelo banner global do layout para refresh dinâmico)
router.get('/alerta-fatura', authenticate, ctrl.alertaFatura);

// ── Rotas exclusivas do super_admin ──────────────────────────
router.get('/empresas/:id/info',      authenticate, requireSuperAdmin, ctrl.infoAssinatura);
router.post('/empresas/:id/assinar',  authenticate, requireSuperAdmin, ctrl.assinar);
router.post('/empresas/:id/cancelar', authenticate, requireSuperAdmin, ctrl.cancelar);

module.exports = router;
