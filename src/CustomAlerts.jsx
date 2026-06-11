import React, { useState, useEffect, useCallback } from 'react';
import { Bell, Plus, X, Crown, AlertTriangle, Fish, MapPin, Percent, Trash2 } from 'lucide-react';
import { useT, useLang } from './i18n.jsx';
import { usePremium, requirePremium } from './usePremium.js';
import { supabase } from './supabase.js';

const MAX_FREE_ALERTS = 2;

export default function CustomAlerts({ 
  authSession, 
  speciesList, 
  watercourseList,
  occurrences,
  showPaywall 
}) {
  const t = useT();
  const { lang } = useLang();
  const { isPremium, plan, loading: loadingPremium } = usePremium(authSession?.user?.id);
  const [alerts, setAlerts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAddForm, setShowAddForm] = useState(false);
  const [saving, setSaving] = useState(false);
  
  // Form states
  const [selectedSpecies, setSelectedSpecies] = useState('');
  const [selectedStretch, setSelectedStretch] = useState('');
  const [threshold, setThreshold] = useState(70);
  const [alertType, setAlertType] = useState('probability'); // 'probability' | 'occurrence'

  const userId = authSession?.user?.id;

  // Fetch user's custom alerts
  const loadAlerts = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }
    
    try {
      const { data, error } = await supabase
        .from('custom_alerts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });
        
      if (error) throw error;
      setAlerts(data || []);
    } catch (e) {
      console.warn('Error loading custom alerts:', e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    loadAlerts();
  }, [loadAlerts]);

  const canCreateAlert = () => {
    if (isPremium) return true;
    return alerts.length < MAX_FREE_ALERTS;
  };

  const handleAddAlert = async () => {
    // Guard: check premium
    if (!canCreateAlert()) {
      if (showPaywall) {
        showPaywall('alerts');
      } else {
        alert(lang === 'en' 
          ? `Free plan: max ${MAX_FREE_ALERTS} alerts. Upgrade to Premium for unlimited alerts.`
          : lang === 'es'
          ? `Plan gratuito: máximo ${MAX_FREE_ALERTS} alertas. Actualice a Premium para alertas ilimitadas.`
          : `Plano gratuito: máximo ${MAX_FREE_ALERTS} alertas. Assine Premium para alertas ilimitados.`
        );
      }
      return;
    }

    if (!selectedSpecies || !selectedStretch) {
      alert(t('fillAllFields'));
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('custom_alerts')
        .insert({
          user_id: userId,
          species_id: selectedSpecies,
          stretch_id: selectedStretch,
          threshold: threshold,
          alert_type: alertType,
          is_active: true
        });

      if (error) throw error;
      
      // Reset form
      setSelectedSpecies('');
      setSelectedStretch('');
      setThreshold(70);
      setShowAddForm(false);
      
      // Reload alerts
      await loadAlerts();
    } catch (e) {
      console.error('Error saving alert:', e);
      alert('Erro ao salvar alerta');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAlert = async (alertId) => {
    try {
      const { error } = await supabase
        .from('custom_alerts')
        .delete()
        .eq('id', alertId)
        .eq('user_id', userId);

      if (error) throw error;
      await loadAlerts();
    } catch (e) {
      console.error('Error deleting alert:', e);
    }
  };

  const getSpeciesName = (speciesId) => {
    const sp = speciesList?.find(s => s.id === speciesId);
    if (!sp) return speciesId;
    return lang === 'pt' ? sp.namePt : lang === 'es' ? sp.nameEs : sp.nameEn;
  };

  const getStretchName = (stretchId) => {
    const stretch = watercourseList?.find(w => w.id === stretchId);
    return stretch?.name || stretchId;
  };

  // Calculate if alert should trigger based on current conditions
  const getAlertStatus = (alert) => {
    const relevantOccurrences = occurrences?.filter(
      o => o.speciesId === alert.species_id && o.segmentId?.includes(alert.stretch_id)
    ) || [];
    
    if (relevantOccurrences.length === 0) return { active: false, count: 0 };
    
    // Simple probability estimation based on recent occurrences
    const recentCount = relevantOccurrences.filter(
      o => new Date(o.date) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    ).length;
    
    const probability = Math.min(95, recentCount * 15); // Rough estimate
    
    return {
      active: probability >= alert.threshold,
      count: relevantOccurrences.length,
      probability
    };
  };

  if (loading || loadingPremium) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
        {t('loading')}
      </div>
    );
  }

  const alertLimitReached = !isPremium && alerts.length >= MAX_FREE_ALERTS;

  return (
    <div className="custom-alerts" style={{ 
      background: 'var(--bg-card)', 
      borderRadius: '12px', 
      border: '1px solid var(--border-faint)',
      overflow: 'hidden'
    }}>
      {/* Header */}
      <div style={{ 
        padding: '1rem', 
        borderBottom: '1px solid var(--border-faint)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Bell size={18} color="#eab308" />
          <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            {lang === 'en' ? 'Custom Alerts' : lang === 'es' ? 'Alertas Personalizadas' : 'Alertas Personalizados'}
          </span>
          {!isPremium && (
            <span style={{ 
              fontSize: '0.7rem', 
              color: alertLimitReached ? '#ef4444' : '#64748b',
              background: alertLimitReached ? 'rgba(239,68,68,0.1)' : 'transparent',
              padding: '2px 6px',
              borderRadius: '4px'
            }}>
              {alerts.length}/{MAX_FREE_ALERTS}
              {!isPremium && <Crown size={10} style={{ marginLeft: '4px', color: '#f59e0b' }} />}
            </span>
          )}
        </div>
        
        <button
          onClick={() => {
            if (!canCreateAlert()) {
              showPaywall?.('alerts');
              return;
            }
            setShowAddForm(!showAddForm);
          }}
          disabled={alertLimitReached}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            padding: '6px 12px',
            borderRadius: '6px',
            border: 'none',
            background: alertLimitReached ? 'var(--bg-card2)' : 'var(--accent)',
            color: alertLimitReached ? 'var(--text-muted)' : 'white',
            fontSize: '0.8rem',
            cursor: alertLimitReached ? 'not-allowed' : 'pointer',
            opacity: alertLimitReached ? 0.6 : 1
          }}
        >
          <Plus size={14} />
          {lang === 'en' ? 'New' : lang === 'es' ? 'Nuevo' : 'Novo'}
        </button>
      </div>

      {/* Alert limit warning for free users */}
      {alertLimitReached && (
        <div style={{
          padding: '10px 12px',
          background: 'rgba(245,158,11,0.1)',
          borderLeft: '3px solid #f59e0b',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontSize: '0.8rem',
          color: '#fbbf24'
        }}>
          <Crown size={14} />
          {lang === 'en' 
            ? `Free plan: max ${MAX_FREE_ALERTS} alerts. Upgrade to Premium for unlimited.`
            : lang === 'es'
            ? `Plan gratuito: máximo ${MAX_FREE_ALERTS} alertas. Actualice a Premium.`
            : `Plano gratuito: máximo ${MAX_FREE_ALERTS} alertas. Assine Premium.`}
        </div>
      )}

      {/* Add Alert Form */}
      {showAddForm && (
        <div style={{ padding: '1rem', borderBottom: '1px solid var(--border-faint)' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            
            {/* Species selector */}
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                <Fish size={12} style={{ marginRight: '4px', display: 'inline' }} />
                {lang === 'en' ? 'Species' : lang === 'es' ? 'Especie' : 'Espécie'}
              </label>
              <select
                value={selectedSpecies}
                onChange={(e) => setSelectedSpecies(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-faint)',
                  background: '#1e293b',
                  color: '#e2e8f0',
                  fontSize: '0.85rem'
                }}
              >
                <option value="">{t('select')}</option>
                {speciesList?.map(sp => (
                  <option key={sp.id} value={sp.id}>
                    {lang === 'pt' ? sp.namePt : lang === 'es' ? sp.nameEs : sp.nameEn}
                  </option>
                ))}
              </select>
            </div>

            {/* Stretch selector */}
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                <MapPin size={12} style={{ marginRight: '4px', display: 'inline' }} />
                {lang === 'en' ? 'River stretch' : lang === 'es' ? 'Tramo de río' : 'Trecho de rio'}
              </label>
              <select
                value={selectedStretch}
                onChange={(e) => setSelectedStretch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px 10px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-faint)',
                  background: '#1e293b',
                  color: '#e2e8f0',
                  fontSize: '0.85rem'
                }}
              >
                <option value="">{t('select')}</option>
                {watercourseList?.map(wc => (
                  <option key={wc.id} value={wc.id}>{wc.name}</option>
                ))}
              </select>
            </div>

            {/* Threshold slider */}
            <div>
              <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px', display: 'block' }}>
                <Percent size={12} style={{ marginRight: '4px', display: 'inline' }} />
                {lang === 'en' ? 'Alert when probability above' : lang === 'es' ? 'Alertar cuando probabilidad supere' : 'Alertar quando probabilidade superar'}
                : <strong>{threshold}%</strong>
              </label>
              <input
                type="range"
                min="30"
                max="95"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
                style={{ width: '100%' }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.7rem', color: 'var(--text-muted)', marginTop: '4px' }}>
                <span>30%</span>
                <span>95%</span>
              </div>
            </div>

            {/* Action buttons */}
            <div style={{ display: 'flex', gap: '8px', marginTop: '8px' }}>
              <button
                onClick={handleAddAlert}
                disabled={saving || !selectedSpecies || !selectedStretch}
                style={{
                  flex: 1,
                  padding: '8px',
                  borderRadius: '6px',
                  border: 'none',
                  background: 'var(--accent)',
                  color: 'white',
                  fontSize: '0.85rem',
                  cursor: 'pointer',
                  opacity: saving || !selectedSpecies || !selectedStretch ? 0.6 : 1
                }}
              >
                {saving ? t('saving') : t('save')}
              </button>
              <button
                onClick={() => setShowAddForm(false)}
                style={{
                  padding: '8px 12px',
                  borderRadius: '6px',
                  border: '1px solid var(--border-faint)',
                  background: 'transparent',
                  color: 'var(--text-muted)',
                  fontSize: '0.85rem',
                  cursor: 'pointer'
                }}
              >
                <X size={16} />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Alerts list */}
      <div style={{ maxHeight: '300px', overflowY: 'auto' }}>
        {alerts.length === 0 ? (
          <div style={{ padding: '2rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <Bell size={32} style={{ opacity: 0.3, marginBottom: '8px' }} />
            <p style={{ fontSize: '0.85rem' }}>
              {lang === 'en' 
                ? 'No custom alerts yet. Create your first alert to get notified about fishing opportunities.'
                : lang === 'es'
                ? 'Sin alertas personalizadas aún. Cree su primera alerta para recibir notificaciones.'
                : 'Nenhum alerta personalizado ainda. Crie seu primeiro alerta para receber notificações.'}
            </p>
          </div>
        ) : (
          alerts.map(alert => {
            const status = getAlertStatus(alert);
            return (
              <div
                key={alert.id}
                style={{
                  padding: '12px',
                  borderBottom: '1px solid var(--border-faint)',
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: '10px',
                  background: status.active ? 'rgba(34,197,94,0.05)' : 'transparent'
                }}
              >
                <div style={{
                  width: '32px',
                  height: '32px',
                  borderRadius: '50%',
                  background: status.active ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.05)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}>
                  <Bell size={14} color={status.active ? '#22c55e' : '#64748b'} />
                </div>
                
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '2px' }}>
                    {getSpeciesName(alert.species_id)}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '4px' }}>
                    {getStretchName(alert.stretch_id)}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.7rem' }}>
                    <span style={{ 
                      padding: '2px 6px', 
                      borderRadius: '4px',
                      background: 'rgba(255,255,255,0.05)',
                      color: 'var(--text-muted)'
                    }}>
                      ≥ {alert.threshold}%
                    </span>
                    {status.active && (
                      <span style={{ 
                        padding: '2px 6px', 
                        borderRadius: '4px',
                        background: 'rgba(34,197,94,0.15)',
                        color: '#22c55e',
                        fontWeight: 600
                      }}>
                        <AlertTriangle size={10} style={{ marginRight: '2px' }} />
                        {lang === 'en' ? 'Active!' : lang === 'es' ? '¡Activo!' : 'Ativo!'}
                      </span>
                    )}
                  </div>
                </div>
                
                <button
                  onClick={() => handleDeleteAlert(alert.id)}
                  style={{
                    padding: '4px',
                    borderRadius: '4px',
                    border: 'none',
                    background: 'transparent',
                    color: '#64748b',
                    cursor: 'pointer',
                    opacity: 0.7
                  }}
                  title={t('delete')}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
