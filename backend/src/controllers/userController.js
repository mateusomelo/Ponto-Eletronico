const bcrypt    = require('bcrypt');
const path      = require('path');
const fs        = require('fs');
const { pool }        = require('../database/connection');
const LogAcesso       = require('../models/LogAcesso');
const { getClientIp } = require('../utils/ip');

// GET /api/usuarios
async function listar(req, res) {
  try {
    const { busca, cargo_id, ativo, pagina = 1, por_pagina = 20 } = req.query;
    const offset = (parseInt(pagina) - 1) * parseInt(por_pagina);
    const cid    = req.user.company_id;
    const params = [];
    let where = 'WHERE 1=1';

    if (cid)    { where += ' AND u.company_id = ?'; params.push(cid); }
    if (busca) {
      where += ' AND (u.nome LIKE ? OR u.email LIKE ? OR u.cpf LIKE ?)';
      params.push(`%${busca}%`, `%${busca}%`, `%${busca}%`);
    }
    if (cargo_id) { where += ' AND u.cargo_id = ?'; params.push(cargo_id); }
    if (ativo !== undefined && ativo !== '') { where += ' AND u.ativo = ?'; params.push(ativo); }

    const [[{ total }]] = await pool.query(
      `SELECT COUNT(*) AS total FROM usuarios u ${where}`, params
    );

    const [rows] = await pool.query(
      `SELECT u.id, u.nome, u.email, u.cpf, u.telefone, u.foto,
              u.salario_mensal, u.carga_horaria_semanal,
              u.cargo_id, u.ativo, u.bloqueado, u.ultimo_acesso, u.created_at,
              c.nome AS cargo_nome, c.nivel AS cargo_nivel
       FROM usuarios u JOIN cargos c ON c.id = u.cargo_id
       ${where}
       ORDER BY u.nome ASC
       LIMIT ${parseInt(por_pagina)} OFFSET ${parseInt(offset)}`,
      params
    );

    return res.json({ total, pagina: parseInt(pagina), por_pagina: parseInt(por_pagina), usuarios: rows });
  } catch (err) {
    console.error('[Users] listar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// GET /api/usuarios/:id
async function obter(req, res) {
  try {
    const cid = req.user.company_id;
    const extraWhere = cid ? ' AND u.company_id = ?' : '';
    const extraParam = cid ? [req.params.id, cid] : [req.params.id];
    const [rows] = await pool.query(
      `SELECT u.id, u.nome, u.email, u.cpf, u.telefone, u.foto,
              u.salario_mensal, u.carga_horaria_semanal,
              u.cargo_id, u.ativo, u.bloqueado, u.ultimo_acesso, u.created_at, u.updated_at,
              c.nome AS cargo_nome, c.nivel AS cargo_nivel
       FROM usuarios u JOIN cargos c ON c.id = u.cargo_id
       WHERE u.id = ?${extraWhere}`,
      extraParam
    );
    if (!rows.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    return res.json(rows[0]);
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/usuarios
async function criar(req, res) {
  const { nome, email, cpf, telefone, cargo_id, senha, salario_mensal, carga_horaria_semanal } = req.body;

  if (!nome || !email || !cpf || !cargo_id || !senha) {
    return res.status(400).json({ erro: 'Campos obrigatórios: nome, email, cpf, cargo_id, senha.' });
  }
  if (senha.length < 8) {
    return res.status(400).json({ erro: 'Senha deve ter no mínimo 8 caracteres.' });
  }

  try {
    const [dup] = await pool.query(
      'SELECT id FROM usuarios WHERE email = ? OR cpf = ?',
      [email.toLowerCase().trim(), cpf]
    );
    if (dup.length) return res.status(409).json({ erro: 'E-mail ou CPF já cadastrado.' });

    const [cargo] = await pool.query('SELECT nivel FROM cargos WHERE id = ?', [cargo_id]);
    if (!cargo.length) return res.status(400).json({ erro: 'Cargo inválido.' });
    if (cargo[0].nivel === 1 && req.user.cargo_nivel > 1) {
      return res.status(403).json({ erro: 'Sem permissão para criar administradores.' });
    }

    const hash = await bcrypt.hash(senha, parseInt(process.env.BCRYPT_ROUNDS || '12'));
    const novoCid = req.user.company_id || null;

    const [result] = await pool.query(
      `INSERT INTO usuarios (nome, email, cpf, telefone, senha_hash, cargo_id, salario_mensal, carga_horaria_semanal, company_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        nome.trim(), email.toLowerCase().trim(), cpf, telefone || null, hash, cargo_id,
        salario_mensal ? parseFloat(salario_mensal) : null,
        carga_horaria_semanal ? parseFloat(carga_horaria_semanal) : 40,
        novoCid,
      ]
    );

    await LogAcesso.registrar({
      usuario_id:   req.user.id,
      acao:         'usuario.criado',
      descricao:    `Usuário criado: ${email}`,
      ip:           getClientIp(req),
      dados_depois: { id: result.insertId, nome, email, cargo_id },
    });

    return res.status(201).json({ mensagem: 'Usuário criado com sucesso.', id: result.insertId });
  } catch (err) {
    console.error('[Users] criar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// PUT /api/usuarios/:id
async function editar(req, res) {
  const { nome, email, cpf, telefone, cargo_id, ativo, salario_mensal, carga_horaria_semanal } = req.body;
  const id  = req.params.id;
  const cid = req.user.company_id;
  const cidFilter = cid ? ' AND company_id = ?' : '';
  const cidParam  = cid ? [id, cid] : [id];

  try {
    const [atual] = await pool.query(
      `SELECT id, nome, email, cpf, cargo_id, ativo FROM usuarios WHERE id = ?${cidFilter}`, cidParam
    );
    if (!atual.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    const sets   = [];
    const params = [];

    if (nome !== undefined && nome !== null) { sets.push('nome = ?'); params.push(nome.trim()); }
    if (email !== undefined && email !== null) { sets.push('email = ?'); params.push(email.toLowerCase().trim()); }
    if (cpf !== undefined && cpf !== null) { sets.push('cpf = ?'); params.push(cpf.trim()); }
    if (telefone !== undefined) { sets.push('telefone = ?'); params.push(telefone || null); }

    if (cargo_id !== undefined && cargo_id !== null) {
      const [cargo] = await pool.query('SELECT nivel FROM cargos WHERE id = ?', [cargo_id]);
      if (!cargo.length) return res.status(400).json({ erro: 'Cargo inválido.' });
      if (cargo[0].nivel === 1 && req.user.cargo_nivel > 1) {
        return res.status(403).json({ erro: 'Sem permissão para atribuir cargo de administrador.' });
      }
      sets.push('cargo_id = ?');
      params.push(cargo_id);
    }

    if (ativo !== undefined && ativo !== null) { sets.push('ativo = ?'); params.push(ativo ? 1 : 0); }

    if (salario_mensal !== undefined) {
      sets.push('salario_mensal = ?');
      params.push(salario_mensal !== null && salario_mensal !== '' ? parseFloat(salario_mensal) : null);
    }
    if (carga_horaria_semanal !== undefined && carga_horaria_semanal !== null && carga_horaria_semanal !== '') {
      sets.push('carga_horaria_semanal = ?');
      params.push(parseFloat(carga_horaria_semanal));
    }

    if (!sets.length) return res.status(400).json({ erro: 'Nenhum campo para atualizar.' });

    params.push(id);
    await pool.query(`UPDATE usuarios SET ${sets.join(', ')} WHERE id = ?`, params);

    await LogAcesso.registrar({
      usuario_id:   req.user.id,
      acao:         'usuario.editado',
      descricao:    `Usuário editado: id=${id}`,
      ip:           getClientIp(req),
      dados_antes:  atual[0],
      dados_depois: req.body,
    });

    return res.json({ mensagem: 'Usuário atualizado.' });
  } catch (err) {
    console.error('[Users] editar:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/usuarios/:id/foto
async function uploadFoto(req, res) {
  if (!req.file) return res.status(400).json({ erro: 'Nenhuma imagem enviada.' });

  const id = req.params.id;
  const fotoUrl = `/uploads/avatars/${req.file.filename}`;

  try {
    const [old] = await pool.query('SELECT foto FROM usuarios WHERE id = ?', [id]);
    if (!old.length) {
      fs.unlink(req.file.path, () => {});
      return res.status(404).json({ erro: 'Usuário não encontrado.' });
    }

    if (old[0].foto) {
      const oldPath = path.join(__dirname, '../../../', old[0].foto);
      fs.unlink(oldPath, () => {});
    }

    await pool.query('UPDATE usuarios SET foto = ? WHERE id = ?', [fotoUrl, id]);

    await LogAcesso.registrar({
      usuario_id: req.user.id,
      acao:       'usuario.foto_atualizada',
      descricao:  `Foto atualizada: id=${id}`,
      ip:         getClientIp(req),
    });

    return res.json({ mensagem: 'Foto atualizada.', foto: fotoUrl });
  } catch (err) {
    fs.unlink(req.file.path, () => {});
    console.error('[Users] uploadFoto:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// DELETE /api/usuarios/:id
async function excluir(req, res) {
  const id  = req.params.id;
  const cid = req.user.company_id;
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ erro: 'Não é possível excluir o próprio usuário.' });
  }
  try {
    const cidFilter = cid ? ' AND company_id = ?' : '';
    const cidParam  = cid ? [id, cid] : [id];
    const [rows] = await pool.query(`SELECT id, nome, email, foto FROM usuarios WHERE id = ?${cidFilter}`, cidParam);
    if (!rows.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });

    if (rows[0].foto) {
      const oldPath = path.join(__dirname, '../../../', rows[0].foto);
      fs.unlink(oldPath, () => {});
    }

    // Remove dependências para respeitar as foreign keys antes de excluir o usuário
    await pool.query('DELETE FROM notificacoes   WHERE usuario_id = ?', [id]);
    await pool.query('DELETE FROM registros_ponto WHERE usuario_id = ?', [id]);
    await pool.query('UPDATE fechamentos_folha SET usuario_id = NULL WHERE usuario_id = ?', [id]);
    await pool.query('DELETE FROM usuarios WHERE id = ?', [id]);

    await LogAcesso.registrar({
      usuario_id:  req.user.id,
      acao:        'usuario.excluido',
      descricao:   `Usuário excluído: ${rows[0].email}`,
      ip:          getClientIp(req),
      dados_antes: rows[0],
    });

    return res.json({ mensagem: 'Usuário excluído.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/usuarios/:id/bloquear
async function bloquear(req, res) {
  const id  = req.params.id;
  const cid = req.user.company_id;
  if (parseInt(id) === req.user.id) {
    return res.status(400).json({ erro: 'Não é possível bloquear o próprio usuário.' });
  }
  try {
    const cidFilter = cid ? ' AND company_id = ?' : '';
    const cidParam  = cid ? [id, cid] : [id];
    const [chk] = await pool.query(`SELECT id FROM usuarios WHERE id = ?${cidFilter}`, cidParam);
    if (!chk.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    await pool.query('UPDATE usuarios SET bloqueado = NOT bloqueado WHERE id = ?', [id]);
    const [rows] = await pool.query('SELECT bloqueado FROM usuarios WHERE id = ?', [id]);
    const estado = rows[0].bloqueado ? 'bloqueado' : 'desbloqueado';
    await LogAcesso.registrar({ usuario_id: req.user.id, acao: `usuario.${estado}`, descricao: `id=${id}`, ip: getClientIp(req) });
    return res.json({ mensagem: `Usuário ${estado}.`, bloqueado: rows[0].bloqueado });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

// POST /api/usuarios/:id/resetar-senha
async function resetarSenha(req, res) {
  const id  = req.params.id;
  const cid = req.user.company_id;
  const { nova_senha } = req.body;
  if (!nova_senha || nova_senha.length < 8) {
    return res.status(400).json({ erro: 'Nova senha deve ter no mínimo 8 caracteres.' });
  }
  try {
    const cidFilter = cid ? ' AND company_id = ?' : '';
    const cidParam  = cid ? [id, cid] : [id];
    const [chk] = await pool.query(`SELECT id FROM usuarios WHERE id = ?${cidFilter}`, cidParam);
    if (!chk.length) return res.status(404).json({ erro: 'Usuário não encontrado.' });
    const hash = await bcrypt.hash(nova_senha, parseInt(process.env.BCRYPT_ROUNDS || '12'));
    await pool.query('UPDATE usuarios SET senha_hash = ? WHERE id = ?', [hash, id]);
    await LogAcesso.registrar({ usuario_id: req.user.id, acao: 'senha.resetada', descricao: `Senha resetada para id=${id}`, ip: getClientIp(req) });
    return res.json({ mensagem: 'Senha resetada com sucesso.' });
  } catch (err) {
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { listar, obter, criar, editar, uploadFoto, excluir, bloquear, resetarSenha };
