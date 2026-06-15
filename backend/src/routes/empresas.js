const router = require('express').Router();
const { authenticate }      = require('../middlewares/auth');
const { requireSuperAdmin } = require('../middlewares/permission');
const { logoUpload }        = require('../middlewares/upload');
const ctrl = require('../controllers/empresaController');

router.use(authenticate);
router.use(requireSuperAdmin);

router.get ('/',                         ctrl.listar);
router.get ('/:id',                      ctrl.obter);
router.post('/',                         ctrl.criar);
router.put ('/:id',                      ctrl.editar);
router.patch('/:id/status',              ctrl.alterarStatus);
router.delete('/:id',                    ctrl.excluir);

// Logo da empresa
router.post('/:id/logo', logoUpload.single('logo'), ctrl.uploadLogo);

// Histórico de plano
router.get('/:id/historico-plano',       ctrl.historicoPLano);

// Gestão de usuários por empresa
router.get ('/:id/usuarios',             ctrl.listarUsuarios);
router.post('/:id/usuarios',             ctrl.criarUsuario);
router.delete('/:id/usuarios/:uid',      ctrl.excluirUsuario);

module.exports = router;
