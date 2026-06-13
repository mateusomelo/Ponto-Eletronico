const router = require('express').Router();
const ctrl   = require('../controllers/cargoController');
const { authenticate }  = require('../middlewares/auth');
const { authorize }     = require('../middlewares/permission');

router.use(authenticate);

router.get ('/permissoes',   ctrl.listarPermissoes);
router.get ('/',             ctrl.listar);
router.get ('/:id',          ctrl.obter);
router.post('/',             authorize('cargos.criar'),               ctrl.criar);
router.put ('/:id',          authorize('cargos.editar'),              ctrl.editar);
router.delete('/:id',        authorize('cargos.excluir'),             ctrl.excluir);

module.exports = router;
