const router = require('express').Router();
const ctrl   = require('../controllers/escalaController');
const { authenticate } = require('../middlewares/auth');
const { authorize }    = require('../middlewares/permission');

router.use(authenticate);

// GET: Qualquer usuário autenticado pode listar suas escalas
router.get   ('/',    ctrl.listar);
// POST, PUT, DELETE: Apenas admins/RH
router.post  ('/',    authorize('sistema.configurar'), ctrl.criar);
router.put   ('/:id', authorize('sistema.configurar'), ctrl.editar);
router.delete('/:id', authorize('sistema.configurar'), ctrl.excluir);

module.exports = router;

