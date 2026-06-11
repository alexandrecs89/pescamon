// Hook para verificar status Premium do usuário
import { useState, useEffect, useCallback } from 'react';
import { supabase } from './supabase.js';

export function usePremium(userId) {
  const [isPremium, setIsPremium] = useState(false);
  const [plan, setPlan] = useState(null);
  const [subscription, setSubscription] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const checkPremium = useCallback(async () => {
    if (!userId) {
      setIsPremium(false);
      setPlan(null);
      setSubscription(null);
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);

      // Buscar assinatura atual do usuário com detalhes do plano
      const { data, error: subError } = await supabase
        .from('user_subscriptions')
        .select(`
          *,
          plan:plan_id (*)
        `)
        .eq('user_id', userId)
        .single();

      if (subError && subError.code !== 'PGRST116') {
        // PGRST116 = no rows found
        throw subError;
      }

      if (data) {
        setSubscription(data);
        setPlan(data.plan);
        // Premium = status active E plano não é 'free'
        const premium = 
          data.status === 'active' && 
          data.plan?.name !== 'free' &&
          new Date(data.current_period_end) > new Date();
        setIsPremium(premium);
      } else {
        // Sem assinatura = Free
        setIsPremium(false);
        setPlan({ name: 'free', title_pt: 'Gratuito', title_es: 'Gratis', title_en: 'Free' });
        setSubscription(null);
      }
    } catch (err) {
      console.error('Error checking premium status:', err);
      setError(err.message);
      // Em caso de erro, assume Free para não bloquear usuário
      setIsPremium(false);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    checkPremium();
  }, [checkPremium]);

  // Retornar limites baseados no plano
  const limits = plan?.limits || {
    heatmap_months: 0,
    alerts_count: 0,
    historical_heatmap: false,
    premium_content: false,
  };

  // Helpers para verificar features específicas
  const canAccessHistoricalHeatmap = isPremium || limits.historical_heatmap;
  const canAccessPremiumContent = isPremium || limits.premium_content;
  const maxAlerts = limits.alerts_count || 0;

  return {
    isPremium,
    plan,
    subscription,
    loading,
    error,
    limits,
    canAccessHistoricalHeatmap,
    canAccessPremiumContent,
    maxAlerts,
    refresh: checkPremium,
  };
}

// Função auxiliar para detectar país do usuário
function detectCountry() {
  try {
    const saved = localStorage.getItem('pescamon_country');
    if (saved) return saved;
  } catch {}
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz.includes('Montevideo') || tz.includes('Uruguay')) return 'UY';
  if (tz.includes('Buenos_Aires') || tz.includes('Argentina')) return 'AR';
  if (tz.includes('Sao_Paulo') || tz.includes('Brazil')) return 'BR';
  return 'BR'; // Default Brasil
}

// Hook para criar sessão de checkout
export async function createCheckoutSession(plan, billingCycle, successUrl, cancelUrl) {
  const { data: { session } } = await supabase.auth.getSession();
  
  if (!session?.access_token) {
    throw new Error('Usuário não autenticado');
  }

  const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://kjgqtvmoujrlhmxlehwz.supabase.co';
  const country = detectCountry();
  
  const response = await fetch(
    `${SUPABASE_URL}/functions/v1/create-checkout-session`,
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        plan,
        billingCycle,
        country,
        successUrl,
        cancelUrl,
      }),
    }
  );

  const result = await response.json();
  
  if (!response.ok) {
    throw new Error(result.error || 'Erro ao criar sessão de checkout');
  }

  return result;
}

// Helper para abrir checkout Stripe
export async function openStripeCheckout(plan = 'premium', billingCycle = 'monthly') {
  const successUrl = `${window.location.origin}/dashboard?subscription=success`;
  const cancelUrl = `${window.location.origin}/dashboard?subscription=canceled`;
  
  const { url } = await createCheckoutSession(plan, billingCycle, successUrl, cancelUrl);
  
  if (url) {
    window.location.href = url;
  } else {
    throw new Error('URL de checkout não retornada');
  }
}

// Guard helper para verificar acesso premium e abrir paywall se necessário
// Retorna true se tem acesso, false se abriu paywall
export function requirePremium({
  isPremium,
  feature = 'default',
  showPaywall,
  customMessage = null,
}) {
  if (isPremium) return true;
  
  // Abre paywall com feature específica
  if (showPaywall) {
    showPaywall(feature);
  } else {
    // Fallback: alert simples
    const messages = {
      heatmap: 'Heatmap histórico disponível apenas no plano Premium.',
      alerts: 'Alertas ilimitados disponíveis apenas no plano Premium.',
      content: 'Conteúdo exclusivo para assinantes Premium.',
      default: 'Recurso disponível apenas no plano Premium.',
    };
    alert(customMessage || messages[feature] || messages.default);
  }
  return false;
}
