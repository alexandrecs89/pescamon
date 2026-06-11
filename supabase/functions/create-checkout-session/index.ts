// Edge Function: Criar sessão de checkout Stripe
import Stripe from 'npm:stripe@14.21.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
});

const APP_SUPABASE_URL = Deno.env.get('APP_SUPABASE_URL') || Deno.env.get('SUPABASE_URL')!;
const APP_SERVICE_ROLE_KEY = Deno.env.get('APP_SERVICE_ROLE_KEY') || Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface CheckoutRequest {
  plan: 'premium';
  billingCycle: 'monthly' | 'yearly';
  country: 'BR' | 'UY' | 'US';
  successUrl: string;
  cancelUrl: string;
}

Deno.serve(async (req) => {
  // CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verificar JWT do usuário
    const token = authHeader.replace('Bearer ', '');
    const userRes = await fetch(`${APP_SUPABASE_URL}/auth/v1/user`, {
      headers: { 'Authorization': `Bearer ${token}`, 'apikey': APP_SERVICE_ROLE_KEY },
    });
    
    if (!userRes.ok) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    
    const user = await userRes.json();
    const userId = user.id;
    const userEmail = user.email;

    const body: CheckoutRequest = await req.json();
    const { plan, billingCycle, successUrl, cancelUrl } = body;

    if (!plan || !billingCycle) {
      return new Response(JSON.stringify({ error: 'Missing plan or billingCycle' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Buscar plano no banco
    const planRes = await fetch(
      `${APP_SUPABASE_URL}/rest/v1/plans?select=*&name=eq.${plan}&is_active=eq.true`,
      {
        headers: {
          'Authorization': `Bearer ${APP_SERVICE_ROLE_KEY}`,
          'apikey': APP_SERVICE_ROLE_KEY,
        },
      }
    );
    const plans = await planRes.json();
    if (!plans || plans.length === 0) {
      return new Response(JSON.stringify({ error: 'Plan not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const planData = plans[0];
    // Selecionar price_id baseado no país do usuário
    const country = (body.country || 'BR').toUpperCase();
    let stripePriceId: string | null = null;
    
    if (country === 'UY') {
      stripePriceId = billingCycle === 'yearly' 
        ? planData.stripe_price_id_yearly_uy 
        : planData.stripe_price_id_monthly_uy;
    } else {
      // Default: Brasil (BR) ou outros países
      stripePriceId = billingCycle === 'yearly' 
        ? planData.stripe_price_id_yearly_br 
        : planData.stripe_price_id_monthly_br;
    }

    // Se não tiver stripe_price_id para o país, tenta o fallback genérico
    if (!stripePriceId) {
      stripePriceId = billingCycle === 'yearly' 
        ? planData.stripe_price_id_yearly 
        : planData.stripe_price_id_monthly;
    }

    if (!stripePriceId) {
      return new Response(JSON.stringify({ error: 'Plan not configured for payments' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Criar ou recuperar cliente Stripe
    let customerId: string;
    
    // Verificar se usuário já tem customer_id
    const subRes = await fetch(
      `${APP_SUPABASE_URL}/rest/v1/user_subscriptions?select=stripe_customer_id&user_id=eq.${userId}`,
      {
        headers: {
          'Authorization': `Bearer ${APP_SERVICE_ROLE_KEY}`,
          'apikey': APP_SERVICE_ROLE_KEY,
        },
      }
    );
    const subs = await subRes.json();
    
    if (subs && subs.length > 0 && subs[0].stripe_customer_id) {
      customerId = subs[0].stripe_customer_id;
    } else {
      // Criar novo cliente
      const customer = await stripe.customers.create({
        email: userEmail,
        metadata: { user_id: userId },
      });
      customerId = customer.id;
    }

    // Criar sessão de checkout
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      line_items: [
        {
          price: stripePriceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        user_id: userId,
        plan_id: planData.id,
        country: country,
      },
      subscription_data: {
        metadata: {
          user_id: userId,
          plan_id: planData.id,
          country: country,
        },
      },
    });

    return new Response(JSON.stringify({ sessionId: session.id, url: session.url }), {
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
    });
  }
});
