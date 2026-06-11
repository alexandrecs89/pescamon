// Modal de upgrade para Premium
import { useState } from 'react';
import { useT, useLang } from './i18n.jsx';
import { X, Crown, Check, Zap, Calendar, Bell, BookOpen } from 'lucide-react';
import { openStripeCheckout } from './usePremium.js';

const FEATURES = {
  pt: [
    { icon: Zap, text: 'Heatmap histórico (12 meses)' },
    { icon: Bell, text: 'Alertas ilimitados por espécie/trecho' },
    { icon: BookOpen, text: 'Conteúdo exclusivo na Pescademia' },
    { icon: Crown, text: 'Suporte prioritário' },
  ],
  es: [
    { icon: Zap, text: 'Heatmap histórico (12 meses)' },
    { icon: Bell, text: 'Alertas ilimitados por especie/tramo' },
    { icon: BookOpen, text: 'Contenido exclusivo en Pescademia' },
    { icon: Crown, text: 'Soporte prioritario' },
  ],
  en: [
    { icon: Zap, text: 'Historical heatmap (12 months)' },
    { icon: Bell, text: 'Unlimited alerts by species/stretch' },
    { icon: BookOpen, text: 'Exclusive Pescademia content' },
    { icon: Crown, text: 'Priority support' },
  ],
};

// Preços: BRL (R$), UYU ($) e USD ($)
const PRICES = {
  monthly: {
    pt: { brl: 'R$ 10,00/mês', uyu: '$ 80/mes', usd: 'US$ 2/month' },
    es: { brl: 'R$ 10,00/mes', uyu: '$ 80/mes', usd: 'US$ 2/month' },
    en: { brl: 'R$ 10.00/month', uyu: '$ 80/month', usd: 'US$ 2/month' },
  },
  yearly: {
    pt: { brl: 'R$ 50,00/ano', uyu: '$ 400/año', usd: 'US$ 10/year' },
    es: { brl: 'R$ 50,00/año', uyu: '$ 400/año', usd: 'US$ 10/year' },
    en: { brl: 'R$ 50.00/year', uyu: '$ 400/year', usd: 'US$ 10/year' },
  },
};

// Detectar país para moeda padrão
function detectCountry() {
  try {
    const saved = localStorage.getItem('pescamon_country');
    if (saved) return saved;
  } catch {}
  // Default baseado no timezone
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
  if (tz.includes('Montevideo') || tz.includes('Uruguay')) return 'UY';
  if (tz.includes('Sao_Paulo') || tz.includes('Buenos_Aires')) return 'BR';
  return 'US';
}

function getDefaultCurrency(country) {
  if (country === 'UY') return 'uyu';
  if (country === 'BR') return 'brl';
  return 'usd';
}

const SAVINGS = {
  pt: 'Economize 58%',
  es: 'Ahorra 58%',
  en: 'Save 58%',
};

const SAVINGS_DETAIL = {
  pt: 'R$ 120 por apenas R$ 50 no anual!',
  es: '¡R$ 120 por solo R$ 50 en el anual!',
  en: 'R$ 120 for only R$ 50 on yearly!',
};

export default function PaywallModal({ isOpen, onClose, feature = 'heatmap' }) {
  const t = useT();
  const { lang } = useLang();
  const [billingCycle, setBillingCycle] = useState('monthly');
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState(() => getDefaultCurrency(detectCountry()));

  const features = FEATURES[lang] || FEATURES.pt;
  const currentLang = lang || 'pt';

  const handleUpgrade = async () => {
    try {
      setLoading(true);
      await openStripeCheckout('premium', billingCycle);
      // Redireciona para Stripe, não fecha modal
    } catch (err) {
      alert(err.message || 'Erro ao iniciar checkout');
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  const messages = {
    heatmap: {
      pt: 'Heatmap histórico disponível apenas no Premium',
      es: 'Heatmap histórico disponible solo en Premium',
      en: 'Historical heatmap available on Premium only',
    },
    alerts: {
      pt: 'Alertas personalizados ilimitados no Premium',
      es: 'Alertas personalizados ilimitados en Premium',
      en: 'Unlimited custom alerts on Premium',
    },
    content: {
      pt: 'Conteúdo exclusivo para assinantes Premium',
      es: 'Contenido exclusivo para suscriptores Premium',
      en: 'Exclusive content for Premium subscribers',
    },
    default: {
      pt: 'Desbloqueie recursos premium',
      es: 'Desbloquea funciones premium',
      en: 'Unlock premium features',
    },
  };

  const title = messages[feature]?.[currentLang] || messages.default[currentLang];

  return (
    <div
      className="modal-overlay"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(4px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '1rem',
      }}
    >
      <div
        className="paywall-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          background: 'var(--bg-card)',
          border: '1px solid var(--border-faint)',
          borderRadius: '16px',
          maxWidth: '480px',
          width: '100%',
          maxHeight: '90vh',
          overflow: 'auto',
          position: 'relative',
        }}
      >
        {/* Header */}
        <div
          style={{
            background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
            padding: '1.5rem',
            borderRadius: '16px 16px 0 0',
            textAlign: 'center',
            color: 'white',
          }}
        >
          <button
            onClick={onClose}
            style={{
              position: 'absolute',
              top: '12px',
              right: '12px',
              background: 'rgba(255,255,255,0.2)',
              border: 'none',
              borderRadius: '50%',
              width: '32px',
              height: '32px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'white',
            }}
          >
            <X size={18} />
          </button>
          
          <Crown size={48} style={{ marginBottom: '0.75rem' }} />
          <h2 style={{ fontSize: '1.5rem', fontWeight: 700, margin: 0 }}>
            Pescamon Premium
          </h2>
          <p style={{ margin: '0.5rem 0 0', opacity: 0.9 }}>
            {title}
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: '1.5rem' }}>
          {/* Features */}
          <div style={{ marginBottom: '1.5rem' }}>
            {features.map((feat, idx) => (
              <div
                key={idx}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 0',
                  borderBottom: idx < features.length - 1 ? '1px solid var(--border-faint)' : 'none',
                }}
              >
                <div
                  style={{
                    width: '28px',
                    height: '28px',
                    background: 'rgba(34,197,94,0.15)',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#22c55e',
                    flexShrink: 0,
                  }}
                >
                  <Check size={16} />
                </div>
                <feat.icon size={18} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                <span style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  {feat.text}
                </span>
              </div>
            ))}
          </div>

          {/* Billing Toggle */}
          <div
            style={{
              display: 'flex',
              background: 'var(--bg-card2)',
              borderRadius: '10px',
              padding: '4px',
              marginBottom: '1.25rem',
            }}
          >
            <button
              onClick={() => setBillingCycle('monthly')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: 'none',
                background: billingCycle === 'monthly' ? 'var(--bg-card)' : 'transparent',
                color: billingCycle === 'monthly' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: billingCycle === 'monthly' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
              }}
            >
              <div>{currentLang === 'en' ? 'Monthly' : currentLang === 'es' ? 'Mensual' : 'Mensal'}</div>
              <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                {PRICES.monthly[currentLang][currency]}
              </div>
            </button>
            <button
              onClick={() => setBillingCycle('yearly')}
              style={{
                flex: 1,
                padding: '10px',
                borderRadius: '8px',
                border: 'none',
                background: billingCycle === 'yearly' ? 'var(--bg-card)' : 'transparent',
                color: billingCycle === 'yearly' ? 'var(--text-primary)' : 'var(--text-muted)',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: billingCycle === 'yearly' ? '0 2px 4px rgba(0,0,0,0.1)' : 'none',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px' }}>
                {currentLang === 'en' ? 'Yearly' : currentLang === 'es' ? 'Anual' : 'Anual'}
                <span
                  style={{
                    background: '#22c55e',
                    color: 'white',
                    fontSize: '0.65rem',
                    padding: '2px 6px',
                    borderRadius: '4px',
                  }}
                >
                  {SAVINGS[currentLang]}
                </span>
              </div>
              <div style={{ fontSize: '0.75rem', opacity: 0.7 }}>
                {PRICES.yearly[currentLang][currency]}
              </div>
            </button>
          </div>

          {/* Currency Selector */}
          <div style={{ marginBottom: '1.25rem' }}>
            <label style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '6px', display: 'block' }}>
              {currentLang === 'en' ? 'Currency' : currentLang === 'es' ? 'Moneda' : 'Moeda'}
            </label>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-medium)',
                background: '#1e293b',
                color: '#e2e8f0',
                fontSize: '0.9rem',
                cursor: 'pointer',
              }}
            >
              <option value="brl">🇧🇷 Real (R$)</option>
              <option value="uyu">🇺🇾 Peso Uruguaio ($)</option>
              <option value="usd">🇺🇸 Dólar (US$)</option>
            </select>
          </div>

          {/* Destaque Economia */}
          {billingCycle === 'yearly' && (
            <div
              style={{
                background: 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.05) 100%)',
                border: '1px solid rgba(34,197,94,0.3)',
                borderRadius: '10px',
                padding: '12px 16px',
                marginBottom: '1.25rem',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '0.9rem', fontWeight: 700, color: '#22c55e', marginBottom: '4px' }}>
                🔥 {SAVINGS_DETAIL[currentLang]}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                {currentLang === 'en' ? 'Only ' : currentLang === 'es' ? 'Solo ' : 'Apenas '} 
                {currentLang === 'en' ? '$6.67/month' : currentLang === 'es' ? '$6.67/mes' : 'R$ 4,17/mês'} 
                {currentLang === 'en' ? ' with yearly plan' : currentLang === 'es' ? ' con plan anual' : ' no plano anual'}
              </div>
            </div>
          )}

          {/* CTA Button */}
          <button
            onClick={handleUpgrade}
            disabled={loading}
            style={{
              width: '100%',
              padding: '1rem',
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
              color: 'white',
              border: 'none',
              borderRadius: '10px',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              opacity: loading ? 0.7 : 1,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '8px',
            }}
          >
            {loading ? (
              <span>Redirecionando...</span>
            ) : (
              <>
                <Crown size={20} />
                {currentLang === 'en' ? 'Upgrade to Premium' : currentLang === 'es' ? 'Actualizar a Premium' : 'Fazer Upgrade Premium'}
              </>
            )}
          </button>

          <p
            style={{
              textAlign: 'center',
              fontSize: '0.75rem',
              color: 'var(--text-muted)',
              marginTop: '1rem',
            }}
          >
            Pagamento seguro via Stripe. Cancele quando quiser.
          </p>
        </div>
      </div>
    </div>
  );
}
