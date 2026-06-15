const router = require('express').Router();
const { authenticate }       = require('../middlewares/auth');
const { requireSuperAdmin }  = require('../middlewares/permission');
const ctrl = require('../controllers/superAdminController');

router.use(authenticate, requireSuperAdmin);

// CRUD de super admins
router.get   ('/',    ctrl.listar);
router.post  ('/',    ctrl.criar);
router.put   ('/:id', ctrl.atualizar);
router.delete('/:id', ctrl.excluir);

// Métricas financeiras e operacionais
router.get('/metricas', ctrl.metricas);

// Impersonação: acessa a empresa como seu admin principal
router.post('/impersonar/:empresaId', ctrl.impersonar);

module.exports = router;
