// @public
// Edge Function: Webhook Stripe para processar eventos de pagamento
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

const APP_SUPABASE_URL = Deno.env.get('APP_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
const APP_SERVICE_ROLE_KEY = Deno.env.get('APP_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const WEBHOOK_SECRET = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

// Debug: log das variáveis (mascaradas)
console.log('Debug - APP_SUPABASE_URL:', APP_SUPABASE_URL ? 'OK' : 'MISSING');
console.log('Debug - APP_SERVICE_ROLE_KEY exists:', !!APP_SERVICE_ROLE_KEY);
console.log('Debug - APP_SERVICE_ROLE_KEY first 20 chars:', APP_SERVICE_ROLE_KEY?.substring(0, 20));

async function handleCheckoutCompleted(session: any) {
  const userId = session.metadata?.user_id;
  const planId = session.metadata?.plan_id;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  if (!userId || !planId) {
    console.error('Missing metadata in checkout session', session.id);
    return;
  }

  // Buscar ou criar assinatura do usuário
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  
  // Verificar se já existe assinatura para o usuário
  const existingRes = await fetch(
    `${APP_SUPABASE_URL}/rest/v1/user_subscriptions?select=id&user_id=eq.${userId}`,
    {
      headers: {
        'Authorization': `Bearer ${APP_SERVICE_ROLE_KEY}`,
        'apikey': APP_SERVICE_ROLE_KEY,
      },
    }
  );
  const existing = await existingRes.json();

  const subData = {
    user_id: userId,
    plan_id: planId,
    status: subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : subscription.status,
    stripe_customer_id: customerId,
    stripe_subscription_id: subscriptionId,
    current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
    current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
    trial_end: subscription.trial_end 
      ? new Date(subscription.trial_end * 1000).toISOString() 
      : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
  };

  if (existing && existing.length > 0) {
    // Atualizar
    await fetch(
      `${APP_SUPABASE_URL}/rest/v1/user_subscriptions?id=eq.${existing[0].id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${APP_SERVICE_ROLE_KEY}`,
          'apikey': APP_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(subData),
      }
    );
  } else {
    // Criar nova
    await fetch(
      `${APP_SUPABASE_URL}/rest/v1/user_subscriptions`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${APP_SERVICE_ROLE_KEY}`,
          'apikey': APP_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(subData),
      }
    );
  }

  // Criar invoice se houver
  if (session.payment_intent) {
    const paymentIntent = await stripe.paymentIntents.retrieve(session.payment_intent);
    if (paymentIntent.charges?.data?.[0]) {
      const charge = paymentIntent.charges.data[0];
      await fetch(
        `${APP_SUPABASE_URL}/rest/v1/invoices`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${APP_SERVICE_ROLE_KEY}`,
            'apikey': APP_SERVICE_ROLE_KEY,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal',
          },
          body: JSON.stringify({
            user_id: userId,
            amount_cents: paymentIntent.amount,
            currency: paymentIntent.currency,
            status: paymentIntent.status === 'succeeded' ? 'paid' : 'open',
            receipt_url: charge.receipt_url,
          }),
        }
      );
    }
  }
}

async function handleSubscriptionUpdated(subscription: any) {
  const userId = subscription.metadata?.user_id;
  if (!userId) {
    console.error('Missing metadata in subscription', subscription.id);
    return;
  }

  // Buscar assinatura do usuário
  const existingRes = await fetch(
    `${APP_SUPABASE_URL}/rest/v1/user_subscriptions?select=id&user_id=eq.${userId}`,
    {
      headers: {
        'Authorization': `Bearer ${APP_SERVICE_ROLE_KEY}`,
        'apikey': APP_SERVICE_ROLE_KEY,
      },
    }
  );
  const existing = await existingRes.json();

  if (existing && existing.length > 0) {
    const subData = {
      status: subscription.status === 'active' || subscription.status === 'trialing' ? 'active' : subscription.status,
      current_period_start: new Date(subscription.current_period_start * 1000).toISOString(),
      current_period_end: new Date(subscription.current_period_end * 1000).toISOString(),
      cancel_at_period_end: subscription.cancel_at_period_end,
    };

    await fetch(
      `${APP_SUPABASE_URL}/rest/v1/user_subscriptions?id=eq.${existing[0].id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${APP_SERVICE_ROLE_KEY}`,
          'apikey': APP_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify(subData),
      }
    );
  }
}

async function handleSubscriptionDeleted(subscription: any) {
  const userId = subscription.metadata?.user_id;
  if (!userId) return;

  // Buscar assinatura e marcar como cancelada
  const existingRes = await fetch(
    `${APP_SUPABASE_URL}/rest/v1/user_subscriptions?select=id&user_id=eq.${userId}`,
    {
      headers: {
        'Authorization': `Bearer ${APP_SERVICE_ROLE_KEY}`,
        'apikey': APP_SERVICE_ROLE_KEY,
      },
    }
  );
  const existing = await existingRes.json();

  if (existing && existing.length > 0) {
    await fetch(
      `${APP_SUPABASE_URL}/rest/v1/user_subscriptions?id=eq.${existing[0].id}`,
      {
        method: 'PATCH',
        headers: {
          'Authorization': `Bearer ${APP_SERVICE_ROLE_KEY}`,
          'apikey': APP_SERVICE_ROLE_KEY,
          'Content-Type': 'application/json',
          'Prefer': 'return=minimal',
        },
        body: JSON.stringify({ status: 'canceled' }),
      }
    );
  }
}

async function logEvent(event: any, processed: boolean, error?: string) {
  await fetch(
    `${APP_SUPABASE_URL}/rest/v1/stripe_events`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${APP_SERVICE_ROLE_KEY}`,
        'apikey': APP_SERVICE_ROLE_KEY,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({
        stripe_event_id: event.id,
        event_type: event.type,
        payload: event,
        processed,
        processed_at: processed ? new Date().toISOString() : null,
        error_message: error || null,
      }),
    }
  );
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, stripe-signature',
      },
    });
  }

  try {
    const signature = req.headers.get('stripe-signature');
    if (!signature) {
      return new Response('Missing signature', { status: 400 });
    }

    const body = await req.text();
    const event = await stripe.webhooks.constructEventAsync(body, signature, WEBHOOK_SECRET);

    console.log('Stripe webhook received:', event.type);

    switch (event.type) {
      case 'checkout.session.completed':
        await handleCheckoutCompleted(event.data.object);
        await logEvent(event, true);
        break;

      case 'invoice.paid':
        // Renovação pagament - atualizar período
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscription = await stripe.subscriptions.retrieve(invoice.subscription as string);
          await handleSubscriptionUpdated(subscription);
        }
        await logEvent(event, true);
        break;

      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object);
        await logEvent(event, true);
        break;

      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object);
        await logEvent(event, true);
        break;

      default:
        console.log('Unhandled event type:', event.type);
        await logEvent(event, false, 'Unhandled event type');
    }

    return new Response(JSON.stringify({ received: true }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err: any) {
    console.error('Webhook error:', err);
    await logEvent({ id: 'unknown', type: 'error' }, false, err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
});
