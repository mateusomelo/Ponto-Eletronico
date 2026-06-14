const router = require('express').Router();
const { authenticate }       = require('../middlewares/auth');
const { requireSuperAdmin }  = require('../middlewares/permission');
const ctrl = require('../controllers/superAdminController');

router.use(authenticate, requireSuperAdmin);

router.get   ('/',    ctrl.listar);
router.post  ('/',    ctrl.criar);
router.put   ('/:id', ctrl.atualizar);
router.delete('/:id', ctrl.excluir);

module.exports = router;
