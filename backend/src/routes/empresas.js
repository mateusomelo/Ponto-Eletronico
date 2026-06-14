const router = require('express').Router();
const { authenticate }      = require('../middlewares/auth');
const { requireSuperAdmin } = require('../middlewares/permission');
const ctrl = require('../controllers/empresaController');

router.use(authenticate);
router.use(requireSuperAdmin);

router.get('/',              ctrl.listar);
router.get('/:id',           ctrl.obter);
router.post('/',             ctrl.criar);
router.put('/:id',           ctrl.editar);
router.patch('/:id/status',  ctrl.alterarStatus);
router.delete('/:id',        ctrl.excluir);

module.exports = router;
