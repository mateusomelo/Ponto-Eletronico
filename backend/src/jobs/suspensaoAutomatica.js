const { pool } = require('../database/connection');
const email = require('../services/emailService');

async function verificarSuspensaoAutomatica() {
  console.log('[Job:suspensao] Verificando empresas inadimplentes por tolerância...');

  try {
    // Empresas em past_due que ultrapassaram o período de tolerância
    const [empresas] = await pool.query(`
      SELECT id, nome, tolerancia_dias, inadimplente_desde, email AS empresa_email
      FROM empresas
      WHERE status = 'past_due'
        AND inadimplente_desde IS NOT NULL
        AND DATEDIFF(NOW(), inadimplente_desde) >= COALESCE(tolerancia_dias, 3)
    `);

    for (const empresa of empresas) {
      await pool.query("UPDATE empresas SET status = 'suspended' WHERE id = ?", [empresa.id]);

      // Busca admins da empresa para notificar
      const [admins] = await pool.query(`
        SELECT u.id, u.nome, u.email FROM usuarios u
        JOIN cargos c ON c.id = u.cargo_id
        WHERE u.company_id = ? AND u.ativo = 1 AND c.nivel <= 2
        LIMIT 20
      `, [empresa.id]);

      for (const admin of admins) {
        // Notificação in-app
        await pool.query(
          `INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem) VALUES (?, 'sistema', ?, ?)`,
          [
            admin.id,
            'Acesso suspenso por inadimplência',
            `O acesso foi suspenso após ${empresa.tolerancia_dias || 3} dias em atraso. Regularize o pagamento para reativar.`,
          ]
        );
        // E-mail
        await email.enviarEmpresaSuspensa(admin.email, admin.nome, empresa.nome);
      }

      console.log(`[Job:suspensao] Empresa ${empresa.id} (${empresa.nome}) suspensa automaticamente.`);
    }

    // Empresas em trial expirado → mudar para suspended (trial_ends_at < NOW)
    // Nota: Empresa com id=1 (empresa padrão) nunca é suspensa automaticamente
    const [triaisExpirados] = await pool.query(`
      SELECT id, nome FROM empresas
      WHERE id != 1 AND status = 'trial' AND trial_ends_at IS NOT NULL AND trial_ends_at < NOW()
    `);

    for (const empresa of triaisExpirados) {
      await pool.query("UPDATE empresas SET status = 'suspended' WHERE id = ?", [empresa.id]);

      const [admins] = await pool.query(`
        SELECT u.id, u.nome, u.email FROM usuarios u
        JOIN cargos c ON c.id = u.cargo_id
        WHERE u.company_id = ? AND u.ativo = 1 AND c.nivel <= 2 LIMIT 20
      `, [empresa.id]);

      for (const admin of admins) {
        await pool.query(
          `INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem) VALUES (?, 'sistema', ?, ?)`,
          [admin.id, 'Período de teste encerrado', `O período de teste gratuito da empresa ${empresa.nome} encerrou. Assine um plano para continuar.`]
        );
      }
      console.log(`[Job:suspensao] Trial expirado: empresa ${empresa.id} (${empresa.nome}) suspensa.`);
    }

    console.log('[Job:suspensao] Concluído.');
  } catch (err) {
    console.error('[Job:suspensao] Erro:', err.message);
  }
}

function iniciarJobSuspensao() {
  // Aguarda 45s após startup para não conflitar com outros jobs
  setTimeout(verificarSuspensaoAutomatica, 45_000);
  setInterval(verificarSuspensaoAutomatica, 24 * 60 * 60 * 1000);
}

module.exports = { iniciarJobSuspensao };
