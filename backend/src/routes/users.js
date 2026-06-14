const router = require('express').Router();
const ctrl   = require('../controllers/userController');
const { authenticate }       = require('../middlewares/auth');
const { authorize }          = require('../middlewares/permission');
const { avatarUpload }       = require('../middlewares/upload');
const { checkEmployeeLimit } = require('../middlewares/planGuard');

router.use(authenticate);

router.get ('/',              authorize('usuarios.visualizar'), ctrl.listar);
router.get ('/:id',           authorize('usuarios.visualizar'), ctrl.obter);
router.post('/',              authorize('usuarios.criar'), checkEmployeeLimit, ctrl.criar);
router.put ('/:id',           authorize('usuarios.editar'),     ctrl.editar);
router.delete('/:id',         authorize('usuarios.excluir'),    ctrl.excluir);
router.post('/:id/bloquear',  authorize('usuarios.editar'),     ctrl.bloquear);
router.post('/:id/resetar-senha', authorize('usuarios.editar'), ctrl.resetarSenha);
router.post('/:id/foto', authorize('usuarios.editar'), (req, res, next) => {
  avatarUpload.single('foto')(req, res, err => {
    if (err) return res.status(400).json({ erro: err.message || 'Erro no upload.' });
    next();
  });
}, ctrl.uploadFoto);

module.exports = router;
