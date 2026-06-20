const { pool } = require('../database/connection');

async function registrarToken(usuario_id, token, plataforma) {
  await pool.query(
    `INSERT INTO device_tokens (usuario_id, token, plataforma)
     VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE usuario_id = ?, plataforma = ?`,
    [usuario_id, token, plataforma || null, usuario_id, plataforma || null]
  );
}

// Envia push via Expo Push API para todos os dispositivos do usuário.
// Fire-and-forget: nunca lança erro, apenas loga (não deve quebrar fluxos existentes).
async function enviarPush(usuario_id, titulo, mensagem) {
  try {
    const [tokens] = await pool.query('SELECT token FROM device_tokens WHERE usuario_id = ?', [usuario_id]);
    if (!tokens.length) return;

    const messages = tokens.map(t => ({
      to: t.token,
      title: titulo,
      body: mensagem,
      sound: 'default',
    }));

    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(messages),
    });
  } catch (err) {
    console.warn('[Push] Falha ao enviar:', err.message);
  }
}

module.exports = { registrarToken, enviarPush };
