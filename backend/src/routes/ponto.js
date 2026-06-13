const router = require('express').Router();
const ctrl   = require('../controllers/pontoController');
const { authenticate }   = require('../middlewares/auth');
const { authorize }      = require('../middlewares/permission');
const { pontoLimiter }   = require('../middlewares/rateLimiter');
const { registroUpload } = require('../middlewares/upload');

router.use(authenticate);

// Multer wrapper — converte erro de upload em 400 legível
function uploadFoto(req, res, next) {
  registroUpload.single('foto')(req, res, err => {
    if (err) return res.status(400).json({ erro: err.message || 'Foto inválida.' });
    next();
  });
}

router.post('/registrar', pontoLimiter, authorize('ponto.registrar'), uploadFoto, ctrl.registrar);
router.get ('/historico',              authorize('ponto.visualizar'), ctrl.historico);
router.get ('/hoje',                   authorize('ponto.registrar'),  ctrl.hoje);
router.get ('/status',                 authorize('ponto.registrar'),  ctrl.status);

module.exports = router;
