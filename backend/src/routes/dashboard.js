const router = require('express').Router();
const ctrl   = require('../controllers/dashboardController');
const { authenticate } = require('../middlewares/auth');

router.use(authenticate);
router.get('/', ctrl.resumo);

module.exports = router;
