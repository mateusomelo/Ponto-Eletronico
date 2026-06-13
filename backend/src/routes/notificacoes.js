const router = require('express').Router();
const ctrl   = require('../controllers/notificacaoController');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);

router.get ('/',            ctrl.listar);
router.get ('/nao-lidas',  ctrl.naoLidas);
router.patch('/ler-todas', ctrl.marcarTodasLidas);
router.patch('/:id/ler',   ctrl.marcarLida);

module.exports = router;
