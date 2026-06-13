const router    = require('express').Router();
const LogAcesso = require('../models/LogAcesso');
const { authenticate } = require('../middlewares/auth');
const { isAdmin }      = require('../middlewares/permission');

router.use(authenticate, isAdmin);

router.get('/', async (req, res) => {
  try {
    const resultado = await LogAcesso.listar({
      pagina:     parseInt(req.query.pagina)    || 1,
      por_pagina: parseInt(req.query.por_pagina) || 50,
      usuario_id: req.query.usuario_id || null,
      acao:       req.query.acao       || null,
      data_inicio: req.query.data_inicio || null,
      data_fim:    req.query.data_fim    || null,
    });
    return res.json(resultado);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

module.exports = router;
