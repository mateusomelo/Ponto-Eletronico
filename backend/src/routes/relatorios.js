const router = require('express').Router();
const ctrl   = require('../controllers/relatorioController');
const { authenticate }  = require('../middlewares/auth');
const { authorize }     = require('../middlewares/permission');
const { requirePlan }   = require('../middlewares/planGuard');

router.use(authenticate);

// Exportação pessoal (próprio histórico) — disponível em todos os planos
// O controller filtra automaticamente para o próprio usuário quando cargo_nivel >= 3
router.get('/pdf',   authorize('relatorios.exportar'), ctrl.exportarPDF);
router.get('/excel', authorize('relatorios.exportar'), ctrl.exportarExcel);

// Relatórios gerenciais (visão da equipe) — plano profissional ou enterprise
router.use(requirePlan('profissional', 'enterprise'));
router.use(authorize('relatorios.visualizar'));

router.get('/dados',          ctrl.dados);
router.get('/resumo-usuario', ctrl.resumoUsuario);
router.get('/folha-pagamento', ctrl.exportarFolhaPagamento);
router.get('/personalizado',   ctrl.exportarPersonalizado);

module.exports = router;
