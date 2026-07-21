const router = require('express').Router();
const { authenticate }                    = require('../middlewares/auth');
const { requireSuperAdmin, authorize }    = require('../middlewares/permission');
const ctrl = require('../controllers/stripeController');

// ── Rotas company_admin ──────────────────────────────────────
// Ver própria assinatura (requer pagamentos.visualizar)
router.get('/minha-assinatura', authenticate, authorize('pagamentos.visualizar'), ctrl.minhaAssinatura);

// Alerta leve de fatura pendente — qualquer usuario autenticado da empresa pode ver
// (usado pelo banner global do layout para refresh dinamico)
router.get('/alerta-fatura', authenticate, ctrl.alertaFatura);

// Assinar um plano pela própria empresa — precisa funcionar mesmo com a
// empresa suspensa (é exatamente o caso de uso: trial venceu, ela precisa
// poder pagar). Liberado da trava de "empresa suspensa" no middleware
// authenticate (ver auth.js: ROTAS_LIBERADAS_SUSPENSA).
router.post('/minha-empresa/assinar', authenticate, authorize('pagamentos.visualizar'), ctrl.assinarPropria);

// ── Rotas exclusivas do super_admin ──────────────────────────
router.get('/empresas/:id/info',      authenticate, requireSuperAdmin, ctrl.infoAssinatura);
router.post('/empresas/:id/assinar',  authenticate, requireSuperAdmin, ctrl.assinar);
router.post('/empresas/:id/cancelar', authenticate, requireSuperAdmin, ctrl.cancelar);

module.exports = router;
