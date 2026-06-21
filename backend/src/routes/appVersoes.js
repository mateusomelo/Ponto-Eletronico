const router = require('express').Router();
const ctrl   = require('../controllers/appVersaoController');
const { authenticate }      = require('../middlewares/auth');
const { requireSuperAdmin } = require('../middlewares/permission');

router.use(authenticate);

router.get ('/',        ctrl.listar);
router.get ('/atual',   ctrl.atual);
router.post('/',        requireSuperAdmin, ctrl.criar);
router.delete('/:id',   requireSuperAdmin, ctrl.excluir);

module.exports = router;
