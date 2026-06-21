const router = require('express').Router();
const ctrl   = require('../controllers/fechamentoController');
const { authenticate }  = require('../middlewares/auth');
const { authorize }     = require('../middlewares/permission');
const { requirePlan }   = require('../middlewares/planGuard');

router.use(authenticate);
router.use(requirePlan('profissional', 'enterprise'));

// Listagem e detalhes (acesso controlado no controller)
router.get ('/',                     ctrl.listar);
router.get ('/usuarios-disponiveis', authorize('fechamento.criar'), ctrl.usuariosDisponiveis);
router.get ('/assinaturas/historico', ctrl.historicoAssinaturas);
router.get ('/:id',                  ctrl.detalhe);
router.get ('/:id/pdf',              ctrl.exportarPDF);
router.get ('/:id/excel',            ctrl.exportarExcel);

// Gestão (apenas RH/Admin com fechamento.criar)
router.post('/',                     authorize('fechamento.criar'), ctrl.criar);
router.patch('/:id/enviar',          authorize('fechamento.criar'), ctrl.enviar);
router.patch('/:id/fechar',          authorize('fechamento.criar'), ctrl.fechar);
router.patch('/:id/reabrir',         authorize('fechamento.criar'), ctrl.reabrir);
router.delete('/:id',                authorize('fechamento.criar'), ctrl.excluir);

// Assinatura e rejeição (próprio funcionário — sem permissão especial)
router.patch('/:id/assinar',         ctrl.assinar);
router.patch('/:id/rejeitar',        ctrl.rejeitar);

module.exports = router;
