const Stripe = require('stripe');
const { pool } = require('../database/connection');

function getStripe() {
  if (!process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY.startsWith('sk_test_COLOQUE')) {
    throw new Error('STRIPE_SECRET_KEY não configurada no .env');
  }
  return Stripe(process.env.STRIPE_SECRET_KEY);
}

function getPriceId(plano) {
  const map = {
    basico:        process.env.STRIPE_PRICE_BASICO,
    profissional:  process.env.STRIPE_PRICE_PROFISSIONAL,
    enterprise:    process.env.STRIPE_PRICE_ENTERPRISE,
  };
  return map[plano] || map['basico'];
}

function getPlanoFromPriceId(priceId) {
  if (!priceId) return null;
  if (priceId === process.env.STRIPE_PRICE_BASICO)       return 'basico';
  if (priceId === process.env.STRIPE_PRICE_PROFISSIONAL) return 'profissional';
  if (priceId === process.env.STRIPE_PRICE_ENTERPRISE)   return 'enterprise';
  return null;
}

function stripeStatusToInterno(stripeStatus) {
  if (stripeStatus === 'active' || stripeStatus === 'trialing') return 'active';
  if (stripeStatus === 'past_due' || stripeStatus === 'unpaid') return 'past_due';
  return 'suspended';
}

// POST /api/stripe/empresas/:id/assinar  (super_admin)
// Cria uma Checkout Session no Stripe e retorna a URL de redirecionamento
async function assinar(req, res) {
  const { id } = req.params;
  try {
    const stripe = getStripe();

    const [rows] = await pool.query('SELECT * FROM empresas WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    const empresa = rows[0];

    const priceId = getPriceId(empresa.plano);
    if (!priceId || priceId.startsWith('price_COLOQUE')) {
      return res.status(422).json({ erro: `Price ID para o plano "${empresa.plano}" não configurado no .env.` });
    }

    // Criar ou reutilizar customer Stripe
    // Se o customer salvo é de modo teste e estamos em live (ou vice-versa), recria
    let customerId = empresa.stripe_customer_id;
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (custErr) {
        // Customer não existe neste modo (teste→live ou live→teste) — recria
        if (custErr.code === 'resource_missing') {
          customerId = null;
          await pool.query(
            'UPDATE empresas SET stripe_customer_id = NULL, stripe_subscription_id = NULL WHERE id = ?',
            [id]
          );
        } else {
          throw custErr;
        }
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        name:     empresa.nome,
        email:    empresa.email || undefined,
        metadata: { empresa_id: String(id) },
      });
      customerId = customer.id;
      await pool.query('UPDATE empresas SET stripe_customer_id = ? WHERE id = ?', [customerId, id]);
    }

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer:          customerId,
      line_items:        [{ price: priceId, quantity: 1 }],
      mode:              'subscription',
      success_url:       `${baseUrl}/admin.html?checkout=success&empresa_id=${id}`,
      cancel_url:        `${baseUrl}/admin.html?checkout=cancel`,
      metadata:          { empresa_id: String(id) },
      subscription_data: { metadata: { empresa_id: String(id) } },
    });

    return res.json({ checkout_url: session.url });
  } catch (err) {
    console.error('[Stripe] assinar:', err.message);
    return res.status(500).json({ erro: err.message });
  }
}

// POST /api/stripe/minha-empresa/assinar  (company_admin — funciona mesmo com empresa suspensa)
// Igual a assinar(), mas escopado à própria empresa do usuário logado e
// permite escolher o plano no momento da assinatura (em vez de usar o
// plano já salvo na empresa).
async function assinarPropria(req, res) {
  const id = req.user.company_id;
  const { plano } = req.body;
  if (!id) return res.status(400).json({ erro: 'Usuário sem empresa vinculada.' });
  if (!['basico', 'profissional', 'enterprise'].includes(plano)) {
    return res.status(400).json({ erro: 'Plano inválido.' });
  }

  try {
    const stripe = getStripe();

    const [rows] = await pool.query('SELECT * FROM empresas WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    const empresa = rows[0];

    const priceId = getPriceId(plano);
    if (!priceId || priceId.startsWith('price_COLOQUE')) {
      return res.status(422).json({ erro: `Price ID para o plano "${plano}" não configurado no .env.` });
    }

    let customerId = empresa.stripe_customer_id;
    if (customerId) {
      try {
        await stripe.customers.retrieve(customerId);
      } catch (custErr) {
        if (custErr.code === 'resource_missing') {
          customerId = null;
          await pool.query(
            'UPDATE empresas SET stripe_customer_id = NULL, stripe_subscription_id = NULL WHERE id = ?',
            [id]
          );
        } else {
          throw custErr;
        }
      }
    }
    if (!customerId) {
      const customer = await stripe.customers.create({
        name:     empresa.nome,
        email:    empresa.email || undefined,
        metadata: { empresa_id: String(id) },
      });
      customerId = customer.id;
      await pool.query('UPDATE empresas SET stripe_customer_id = ? WHERE id = ?', [customerId, id]);
    }

    await pool.query('UPDATE empresas SET plano = ? WHERE id = ?', [plano, id]);

    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';

    const session = await stripe.checkout.sessions.create({
      customer:          customerId,
      line_items:        [{ price: priceId, quantity: 1 }],
      mode:              'subscription',
      success_url:       `${baseUrl}/login.html?checkout=success`,
      cancel_url:        `${baseUrl}/empresa-suspensa.html?checkout=cancel`,
      metadata:          { empresa_id: String(id) },
      subscription_data: { metadata: { empresa_id: String(id) } },
    });

    return res.json({ checkout_url: session.url });
  } catch (err) {
    console.error('[Stripe] assinarPropria:', err.message, err.stack);
    return res.status(500).json({ erro: err.message, _debugStack: err.stack });
  }
}

// POST /api/stripe/empresas/:id/cancelar  (super_admin)
async function cancelar(req, res) {
  const { id } = req.params;
  try {
    const stripe = getStripe();

    const [rows] = await pool.query('SELECT stripe_subscription_id FROM empresas WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });

    const subId = rows[0].stripe_subscription_id;
    if (!subId) return res.status(400).json({ erro: 'Empresa sem assinatura ativa.' });

    await stripe.subscriptions.cancel(subId);
    await pool.query(
      "UPDATE empresas SET stripe_subscription_id = NULL, stripe_status = 'canceled', status = 'suspended' WHERE id = ?",
      [id]
    );

    return res.json({ mensagem: 'Assinatura cancelada. Acesso suspenso.' });
  } catch (err) {
    console.error('[Stripe] cancelar:', err.message);
    return res.status(500).json({ erro: err.message });
  }
}

// GET /api/stripe/empresas/:id/info  (super_admin)
async function infoAssinatura(req, res) {
  const { id } = req.params;
  try {
    const [rows] = await pool.query(
      'SELECT stripe_customer_id, stripe_subscription_id, stripe_status, plano FROM empresas WHERE id = ?', [id]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    const emp = rows[0];

    if (!emp.stripe_subscription_id) {
      return res.json({ assinatura: null, stripe_status: null, plano: emp.plano });
    }

    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(emp.stripe_subscription_id);

    let portalUrl = null;
    try {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const session = await stripe.billingPortal.sessions.create({
        customer:   emp.stripe_customer_id,
        return_url: `${baseUrl}/admin.html`,
      });
      portalUrl = session.url;
    } catch {}

    return res.json({
      subscription_id:      sub.id,
      stripe_status:        sub.status,
      current_period_end:   sub.current_period_end,
      cancel_at_period_end: sub.cancel_at_period_end,
      plano:                emp.plano,
      portal_url:           portalUrl,
    });
  } catch (err) {
    console.error('[Stripe] info:', err.message);
    return res.status(500).json({ erro: err.message });
  }
}

// GET /api/stripe/minha-assinatura  (company_admin)
async function minhaAssinatura(req, res) {
  const company_id = req.user.company_id;
  if (!company_id) return res.status(403).json({ erro: 'Sem empresa associada.' });

  try {
    const [rows] = await pool.query(
      'SELECT stripe_customer_id, stripe_subscription_id, stripe_status, plano, nome, plano_expires_at FROM empresas WHERE id = ?',
      [company_id]
    );
    if (!rows.length) return res.status(404).json({ erro: 'Empresa não encontrada.' });
    const emp = rows[0];

    if (!emp.stripe_subscription_id) {
      return res.json({ empresa: emp.nome, plano: emp.plano, plano_expires_at: emp.plano_expires_at, assinatura: null, faturas: [], portal_url: null });
    }

    const stripe = getStripe();
    const sub = await stripe.subscriptions.retrieve(emp.stripe_subscription_id);
    const invoices = await stripe.invoices.list({ customer: emp.stripe_customer_id, limit: 12 });

    let portalUrl = null;
    try {
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const portalSession = await stripe.billingPortal.sessions.create({
        customer:   emp.stripe_customer_id,
        return_url: `${baseUrl}/pagamentos.html`,
      });
      portalUrl = portalSession.url;
    } catch (e) {
      console.warn('[Stripe] portal não configurado no Stripe dashboard:', e.message);
    }

    return res.json({
      empresa: emp.nome,
      plano:   emp.plano,
      plano_expires_at: emp.plano_expires_at,
      assinatura: {
        id:                   sub.id,
        status:               sub.status,
        current_period_start: sub.current_period_start,
        current_period_end:   sub.current_period_end,
        cancel_at_period_end: sub.cancel_at_period_end,
      },
      faturas: invoices.data.map(inv => ({
        id:                  inv.id,
        number:              inv.number,
        amount_due:          inv.amount_due,
        amount_paid:         inv.amount_paid,
        status:              inv.status,
        created:             inv.created,
        hosted_invoice_url:  inv.hosted_invoice_url,
        invoice_pdf:         inv.invoice_pdf,
      })),
      portal_url: portalUrl,
    });
  } catch (err) {
    console.error('[Stripe] minhaAssinatura:', err.message);
    return res.status(500).json({ erro: err.message });
  }
}

// GET /api/stripe/alerta-fatura  (company_admin) — retorna fatura em aberto sem expor dados sensíveis
async function alertaFatura(req, res) {
  const company_id = req.user.company_id;
  if (!company_id) return res.json({ fatura: null });

  try {
    const [rows] = await pool.query(
      'SELECT stripe_customer_id, stripe_status FROM empresas WHERE id = ?',
      [company_id]
    );
    if (!rows.length || !rows[0].stripe_customer_id) return res.json({ fatura: null });

    const emp = rows[0];
    if (emp.stripe_status === 'active' || emp.stripe_status === 'trialing') {
      return res.json({ fatura: null });
    }

    const stripe = getStripe();
    const invoices = await stripe.invoices.list({
      customer: emp.stripe_customer_id,
      status: 'open',
      limit: 1,
    });

    if (!invoices.data.length) return res.json({ fatura: null });

    const inv = invoices.data[0];
    return res.json({
      fatura: {
        id:                 inv.id,
        amount_due:         inv.amount_due,
        due_date:           inv.due_date,
        hosted_invoice_url: inv.hosted_invoice_url,
      }
    });
  } catch (err) {
    console.error('[Stripe] alertaFatura:', err.message);
    return res.json({ fatura: null });
  }
}

// POST /api/stripe/webhook  (público — Stripe assina o body)
async function webhook(req, res) {
  const sig    = req.headers['stripe-signature'];
  const secret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!secret || secret.startsWith('whsec_COLOQUE')) {
    return res.status(400).json({ erro: 'STRIPE_WEBHOOK_SECRET não configurado.' });
  }

  let event;
  try {
    const stripe = getStripe();
    event = stripe.webhooks.constructEvent(req.body, sig, secret);
  } catch (err) {
    console.error('[Stripe Webhook] Assinatura inválida:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  try {
    const obj = event.data.object;

    switch (event.type) {

      // Checkout concluído → ativar empresa
      case 'checkout.session.completed': {
        const customerId = obj.customer;
        const subId      = obj.subscription;
        if (customerId && subId) {
          await pool.query(
            "UPDATE empresas SET stripe_subscription_id = ?, stripe_status = 'active', status = 'active' WHERE stripe_customer_id = ?",
            [subId, customerId]
          );
          console.log(`[Stripe] checkout.session.completed → empresa ativa (customer=${customerId})`);
        }
        break;
      }

      // Pagamento confirmado → manter ativa
      case 'invoice.paid': {
        const subId = obj.subscription;
        if (subId) {
          await pool.query(
            "UPDATE empresas SET status = 'active', stripe_status = 'active' WHERE stripe_subscription_id = ?",
            [subId]
          );
          console.log(`[Stripe] invoice.paid → empresa ativa (sub=${subId})`);
        }
        break;
      }

      // Pagamento falhou → past_due
      case 'invoice.payment_failed': {
        const subId = obj.subscription;
        if (subId) {
          await pool.query(
            "UPDATE empresas SET status = 'past_due', stripe_status = 'past_due' WHERE stripe_subscription_id = ?",
            [subId]
          );
          console.log(`[Stripe] payment_failed → empresa past_due (sub=${subId})`);
        }
        break;
      }

      // Assinatura atualizada (renovação, upgrade, downgrade)
      case 'customer.subscription.updated': {
        const interno   = stripeStatusToInterno(obj.status);
        const priceId   = obj.items?.data?.[0]?.price?.id;
        const novoPlano = getPlanoFromPriceId(priceId);
        if (novoPlano) {
          await pool.query(
            'UPDATE empresas SET status = ?, stripe_status = ?, plano = ? WHERE stripe_subscription_id = ?',
            [interno, obj.status, novoPlano, obj.id]
          );
          console.log(`[Stripe] subscription.updated → ${obj.status}, plano=${novoPlano} (sub=${obj.id})`);
        } else {
          await pool.query(
            'UPDATE empresas SET status = ?, stripe_status = ? WHERE stripe_subscription_id = ?',
            [interno, obj.status, obj.id]
          );
          console.log(`[Stripe] subscription.updated → ${obj.status} (sub=${obj.id})`);
        }
        break;
      }

      // Assinatura cancelada → suspender
      case 'customer.subscription.deleted': {
        await pool.query(
          "UPDATE empresas SET status = 'suspended', stripe_status = 'canceled', stripe_subscription_id = NULL WHERE stripe_subscription_id = ?",
          [obj.id]
        );
        console.log(`[Stripe] subscription.deleted → empresa suspensa (sub=${obj.id})`);
        break;
      }

      default:
        break;
    }

    return res.json({ received: true });
  } catch (err) {
    console.error('[Stripe Webhook] Erro ao processar evento:', err);
    return res.status(500).json({ erro: 'Erro interno.' });
  }
}

module.exports = { assinar, assinarPropria, cancelar, infoAssinatura, minhaAssinatura, alertaFatura, webhook };
