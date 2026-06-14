const router = require('express').Router();
const ctrl   = require('../controllers/relatorioController');
const { authenticate }  = require('../middlewares/auth');
const { authorize }     = require('../middlewares/permission');
const { requirePlan }   = require('../middlewares/planGuard');

router.use(authenticate);
router.use(requirePlan('profissional', 'enterprise'));
router.use(authorize('relatorios.visualizar'));

router.get('/dados',          ctrl.dados);
router.get('/resumo-usuario', ctrl.resumoUsuario);
// Export requer permissão adicional de exportar
router.get('/pdf',   authorize('relatorios.exportar'), ctrl.exportarPDF);
router.get('/excel', authorize('relatorios.exportar'), ctrl.exportarExcel);

module.exports = router;
