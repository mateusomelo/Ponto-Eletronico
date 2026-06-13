const router = require('express').Router();
const ctrl   = require('../controllers/authController');
const { authenticate } = require('../middlewares/auth');
const { loginLimiter } = require('../middlewares/rateLimiter');
const { avatarUpload }  = require('../middlewares/upload');

router.post('/login',           loginLimiter, ctrl.login);
router.post('/logout',          authenticate, ctrl.logout);
router.get ('/me',              authenticate, ctrl.me);
router.post('/alterar-senha',   authenticate, ctrl.alterarSenha);
router.post('/solicitar-reset', ctrl.solicitarReset);
router.post('/redefinir-senha', ctrl.redefinirSenha);

// Qualquer usuário autenticado pode atualizar a própria foto
router.post('/me/foto', authenticate, (req, res, next) => {
  avatarUpload.single('foto')(req, res, err => {
    if (err) return res.status(400).json({ erro: err.message || 'Erro no upload.' });
    next();
  });
}, ctrl.uploadMinhaFoto);

module.exports = router;
