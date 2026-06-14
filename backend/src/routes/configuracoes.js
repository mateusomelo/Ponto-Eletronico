const router = require('express').Router();
const { pool }  = require('../database/connection');
const { authenticate } = require('../middlewares/auth');
const { authorize }    = require('../middlewares/permission');

router.use(authenticate);

router.get('/', authorize('sistema.configurar'), async (req, res) => {
  try {
    const cid = req.user.company_id;
    const cidFilter = cid ? ' WHERE company_id = ?' : '';
    const cidParam  = cid ? [cid] : [];
    const [rows] = await pool.query(
      `SELECT chave, valor, descricao FROM configuracoes${cidFilter} ORDER BY chave`, cidParam
    );
    const cfg = {};
    rows.forEach(r => { cfg[r.chave] = { valor: r.valor, descricao: r.descricao }; });
    return res.json(cfg);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

router.put('/', authorize('sistema.configurar'), async (req, res) => {
  const updates = req.body;
  if (!updates || typeof updates !== 'object') {
    return res.status(400).json({ erro: 'Body inválido.' });
  }
  try {
    const cid = req.user.company_id;
    const cidFilter = cid ? ' AND company_id = ?' : '';
    for (const [chave, valor] of Object.entries(updates)) {
      const params = cid ? [String(valor), chave, cid] : [String(valor), chave];
      await pool.query(
        `UPDATE configuracoes SET valor = ? WHERE chave = ?${cidFilter}`, params
      );
    }
    return res.json({ mensagem: 'Configurações salvas.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
});

module.exports = router;
