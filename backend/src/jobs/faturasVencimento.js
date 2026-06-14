const { pool } = require('../database/connection');

// Avisa quando faltam 7, 3 ou 1 dia(s) para vencer
const DIAS_AVISO = [7, 3, 1];

async function verificarFaturasVencimento() {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_COLOQUE')) return;

  let stripe;
  try { stripe = require('stripe')(process.env.STRIPE_SECRET_KEY); }
  catch { return; }

  console.log('[Job:faturas] Verificando faturas próximas do vencimento...');

  try {
    const [empresas] = await pool.query(
      `SELECT id, nome, stripe_customer_id FROM empresas
       WHERE stripe_customer_id IS NOT NULL AND status != 'suspended'`
    );

    for (const empresa of empresas) {
      try {
        const invoices = await stripe.invoices.list({
          customer: empresa.stripe_customer_id,
          status: 'open',
          limit: 5,
        });

        for (const inv of invoices.data) {
          if (!inv.due_date) continue;

          const dueDate = new Date(inv.due_date * 1000);
          const hoje    = new Date();
          hoje.setHours(0, 0, 0, 0);
          const diasRestantes = Math.ceil((dueDate - hoje) / 86_400_000);

          if (!DIAS_AVISO.includes(diasRestantes)) continue;

          const valor     = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(inv.amount_due / 100);
          const dataVencStr = dueDate.toLocaleDateString('pt-BR');

          const titulo = diasRestantes === 1
            ? `Fatura vence hoje (${valor})`
            : `Fatura vence em ${diasRestantes} dias (${valor})`;

          const mensagem = `A fatura ${inv.number || inv.id.slice(-8)} de ${valor} vence em ${dataVencStr}. `
            + `Acesse Pagamentos para pagar via cartão ou boleto.`;

          // Usuários da empresa com permissão pagamentos.visualizar
          const [usuarios] = await pool.query(
            `SELECT u.id FROM usuarios u
             JOIN cargo_permissoes cp ON cp.cargo_id = u.cargo_id
             JOIN permissoes p        ON p.id = cp.permissao_id
             WHERE u.company_id = ? AND u.ativo = 1 AND p.nome = 'pagamentos.visualizar'`,
            [empresa.id]
          );

          for (const u of usuarios) {
            // Evita duplicar: uma notificação por título por usuário por dia
            const [[dup]] = await pool.query(
              `SELECT id FROM notificacoes
               WHERE usuario_id = ? AND tipo = 'fatura_vencimento'
                 AND titulo = ? AND DATE(created_at) = CURDATE() LIMIT 1`,
              [u.id, titulo]
            );
            if (dup) continue;

            await pool.query(
              `INSERT INTO notificacoes (usuario_id, tipo, titulo, mensagem) VALUES (?, 'fatura_vencimento', ?, ?)`,
              [u.id, titulo, mensagem]
            );
          }
        }
      } catch (err) {
        console.error(`[Job:faturas] Empresa ${empresa.id}: ${err.message}`);
      }
    }

    console.log('[Job:faturas] Concluído.');
  } catch (err) {
    console.error('[Job:faturas] Erro geral:', err.message);
  }
}

function iniciarJobFaturas() {
  // Primeira execução 30s após iniciar (aguarda DB estabilizar)
  setTimeout(verificarFaturasVencimento, 30_000);

  // Repete a cada 24 horas
  setInterval(verificarFaturasVencimento, 24 * 60 * 60 * 1000);
}

module.exports = { iniciarJobFaturas };
