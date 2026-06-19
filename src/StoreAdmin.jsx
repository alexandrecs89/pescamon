import { useState, useEffect } from 'react';
import { Package, Plus, Trash2, Store, Fish, ChevronDown, Check, X, Star, BarChart3 } from 'lucide-react';
import { getMyStore, upsertFishingStore, getStoreProducts, upsertStoreProduct, deleteStoreProduct, getMerchantConnections, getStoreOrders, getMarketplaceFunnel } from './supabase.js';
import { useT } from './i18n.jsx';

const GEAR_TYPE_LABELS = {
  rod:    { label: 'Vara',     icon: '🎣' },
  reel:   { label: 'Molinete', icon: '⚙️' },
  line:   { label: 'Linha',    icon: '〰️' },
  hook:   { label: 'Anzol',    icon: '🪝' },
  leader: { label: 'Líder',    icon: '🔗' },
  bait:   { label: 'Isca',     icon: '🐛' },
  other:  { label: 'Outros',   icon: '📦' },
};

// Marketplace: tipo do produto (independente do gear_type físico)
const PRODUCT_TYPES = ['rig', 'isca', 'vara', 'molinete', 'linha', 'acessorio'];
const CURRENCIES = ['UYU', 'ARS', 'BRL'];
const HOME_COUNTRIES = [
  { id: 'UY', label: '🇺🇾 Uruguai' },
  { id: 'AR', label: '🇦🇷 Argentina' },
  { id: 'BR', label: '🇧🇷 Brasil' },
];

const EMPTY_PRODUCT = {
  gear_type: 'rod', gear_key: 'rod', name: '', brand: '', model: '', species_ids: [],
  price: '', currency: 'UYU', product_type: 'acessorio', featured: false, active: true, in_stock: true,
};

const ALL_SPECIES = [
  { id: 'tararira',  name: 'Traíra' },
  { id: 'dourado',   name: 'Dourado' },
  { id: 'boga',      name: 'Boga' },
  { id: 'bagre',     name: 'Bagre amarelo' },
  { id: 'pejerrey',  name: 'Peixe-rei' },
  { id: 'mojarra',   name: 'Mojarra' },
  { id: 'sabalito',  name: 'Sabalito' },
  { id: 'patí',      name: 'Patí' },
  { id: 'surubí',    name: 'Surubí' },
  { id: 'vieja_agua',name: 'Vieja del agua' },
  { id: 'palometa',  name: 'Palometa' },
  { id: 'armado',    name: 'Armado' },
  { id: 'corvina',   name: 'Corvina' },
  { id: 'carpa',     name: 'Carpa' },
];

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export default function StoreAdmin({ isOpen, onClose, authSession, userLocation }) {
  const t = useT();
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState('store');
  const [storeForm, setStoreForm] = useState({
    name: '', address: '', city: '', department: '', phone: '', whatsapp: '', website: '', description: '',
    lat: userLocation?.lat || '', lng: userLocation?.lon || '',
    slug: '', home_country: 'UY', default_commission_pct: 10, active: true, featured: false,
  });
  const [productForm, setProductForm] = useState(EMPTY_PRODUCT);
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [connections, setConnections] = useState([]);
  const [orders, setOrders] = useState([]);
  const [funnel, setFunnel] = useState({ views: 0, clicks: 0 });
  const [reportsLoading, setReportsLoading] = useState(false);
  const [msg, setMsg] = useState(null);

  const userId = authSession?.user?.id;

  useEffect(() => {
    if (!isOpen || !userId) { setLoading(false); return; }
    setLoading(true);
    getMyStore(userId)
      .then(s => {
        setStore(s);
        if (s) {
          setStoreForm({ name: s.name, address: s.address || '', city: s.city || '', department: s.department || '',
            phone: s.phone || '', whatsapp: s.whatsapp || '', website: s.website || '', description: s.description || '',
            lat: s.lat || '', lng: s.lng || '',
            slug: s.slug || '', home_country: s.home_country || 'UY',
            default_commission_pct: s.default_commission_pct ?? 10,
            active: s.active ?? true, featured: s.featured ?? false });
          getMerchantConnections(s.id).then(setConnections).catch(() => {});
          return getStoreProducts(s.id);
        }
        return [];
      })
      .then(p => setProducts(p))
      .catch(e => setMsg({ type: 'error', text: e.message }))
      .finally(() => setLoading(false));
  }, [isOpen, userId]);

  // Carrega relatórios sob demanda ao abrir a aba (e quando a loja muda)
  useEffect(() => {
    if (tab !== 'reports' || !store?.id) return;
    let cancelled = false;
    setReportsLoading(true);
    Promise.all([getStoreOrders(store.id), getMarketplaceFunnel(store.id)])
      .then(([ords, fun]) => { if (!cancelled) { setOrders(ords); setFunnel(fun); } })
      .catch(e => { if (!cancelled) setMsg({ type: 'error', text: e.message }); })
      .finally(() => { if (!cancelled) setReportsLoading(false); });
    return () => { cancelled = true; };
  }, [tab, store?.id]);

  async function handleSaveStore(e) {
    e.preventDefault();
    if (!userId) { setMsg({ type: 'error', text: t('storeLoginToSave') }); return; }
    setSaving(true);
    try {
      const payload = {
        id: store?.id || generateId(),
        user_id: userId,
        ...storeForm,
        slug: storeForm.slug?.trim() || null,
        default_commission_pct: storeForm.default_commission_pct === '' ? null : parseFloat(storeForm.default_commission_pct),
        lat: storeForm.lat ? parseFloat(storeForm.lat) : null,
        lng: storeForm.lng ? parseFloat(storeForm.lng) : null,
      };
      const saved = await upsertFishingStore(payload);
      setStore(saved);
      setMsg({ type: 'ok', text: t('storeSavedOk') });
      getMerchantConnections(saved.id).then(setConnections).catch(() => {});
      const prods = await getStoreProducts(saved.id);
      setProducts(prods);
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveProduct(e) {
    e.preventDefault();
    if (!store) { setMsg({ type: 'error', text: t('storeSaveStoreFirst') }); return; }
    setSaving(true);
    try {
      const priceNum = productForm.price !== '' ? parseFloat(productForm.price) : null;
      const payload = {
        id: editingProduct?.id || generateId(),
        store_id: store.id,
        ...productForm,
        price: priceNum,
        // compat: a vitrine atual ainda lê price_uyu — mantém em sincronia quando a moeda é UYU
        price_uyu: productForm.currency === 'UYU' ? priceNum : null,
      };
      await upsertStoreProduct(payload);
      const prods = await getStoreProducts(store.id);
      setProducts(prods);
      setShowProductForm(false);
      setEditingProduct(null);
      setProductForm(EMPTY_PRODUCT);
      setMsg({ type: 'ok', text: t('storeProductSaved') });
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteProduct(productId) {
    if (!window.confirm(t('storeConfirmDelete'))) return;
    try {
      await deleteStoreProduct(productId);
      setProducts(prev => prev.filter(p => p.id !== productId));
    } catch (err) {
      setMsg({ type: 'error', text: err.message });
    }
  }

  function openEditProduct(p) {
    setEditingProduct(p);
    setProductForm({ gear_type: p.gear_type, gear_key: p.gear_key, name: p.name, brand: p.brand || '',
      model: p.model || '', species_ids: p.species_ids || [],
      price: (p.price ?? p.price_uyu ?? '') === null ? '' : (p.price ?? p.price_uyu ?? ''),
      currency: p.currency || 'UYU', product_type: p.product_type || 'acessorio',
      featured: p.featured ?? false, active: p.active ?? true, in_stock: p.in_stock });
    setShowProductForm(true);
  }

  function toggleSpecies(id) {
    setProductForm(f => ({
      ...f,
      species_ids: f.species_ids.includes(id) ? f.species_ids.filter(s => s !== id) : [...f.species_ids, id],
    }));
  }

  if (!isOpen) return null;

  const inputStyle = { width: '100%', padding: '7px 10px', background: '#0f172a', border: '1px solid #334155', borderRadius: 6, color: '#f1f5f9', fontSize: '0.82rem' };
  const labelStyle = { fontSize: '0.72rem', color: '#94a3b8', marginBottom: 3, display: 'block' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }} onClick={onClose}>
      <div style={{ background: '#1e293b', borderRadius: 12, padding: 24, maxWidth: 620, width: '100%', maxHeight: '88vh', overflowY: 'auto', color: '#f1f5f9', boxShadow: '0 8px 40px rgba(0,0,0,0.5)' }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <div>
            <div style={{ fontSize: '0.7rem', color: '#64748b', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 3 }}>{t('storeDashboardTitle')}</div>
            <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{t('storeMyStore')}</h2>
          </div>
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '1.2rem' }}>✕</button>
        </div>

        {!userId && (
          <div style={{ padding: 16, background: '#0f172a', borderRadius: 8, color: '#f59e0b', fontSize: '0.82rem', textAlign: 'center' }}>
            ⚠️ {t('storeLoginRequired')}
          </div>
        )}

        {msg && (
          <div style={{ padding: '8px 12px', borderRadius: 6, marginBottom: 14, background: msg.type === 'ok' ? '#14532d' : '#450a0a', color: msg.type === 'ok' ? '#4ade80' : '#fca5a5', fontSize: '0.8rem', display: 'flex', justifyContent: 'space-between' }}>
            {msg.text}
            <button onClick={() => setMsg(null)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }}>✕</button>
          </div>
        )}

        {/* Tabs */}
        {userId && (
          <>
            <div style={{ display: 'flex', gap: 4, marginBottom: 18, borderBottom: '1px solid #334155', paddingBottom: 0 }}>
              {[['store', t('storeTabStore')], ['products', `${t('storeTabProducts')} (${products.length})`], ['reports', t('storeTabReports')]].map(([key, label]) => (
                <button key={key} onClick={() => setTab(key)} style={{ padding: '6px 16px', background: 'transparent', border: 'none', borderBottom: tab === key ? '2px solid #d97706' : '2px solid transparent', color: tab === key ? '#f59e0b' : '#64748b', cursor: 'pointer', fontWeight: tab === key ? 700 : 400, fontSize: '0.82rem' }}>{label}</button>
              ))}
            </div>

            {loading && <div style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>{t('storeLoading')}</div>}

            {/* Tab: Store */}
            {!loading && tab === 'store' && (
              <form onSubmit={handleSaveStore}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={labelStyle}>{t('storeLabelName')}</label>
                    <input required style={inputStyle} value={storeForm.name} onChange={e => setStoreForm(f => ({ ...f, name: e.target.value }))} placeholder={t('storePlaceholderName')} />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('storeLabelAddress')}</label>
                    <input style={inputStyle} value={storeForm.address} onChange={e => setStoreForm(f => ({ ...f, address: e.target.value }))} placeholder={t('storePlaceholderAddress')} />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('storeLabelCity')}</label>
                    <input style={inputStyle} value={storeForm.city} onChange={e => setStoreForm(f => ({ ...f, city: e.target.value }))} placeholder="Ex: Canelones" />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('storeLabelDept')}</label>
                    <input style={inputStyle} value={storeForm.department} onChange={e => setStoreForm(f => ({ ...f, department: e.target.value }))} placeholder="Ex: Canelones" />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('storeLabelPhone')}</label>
                    <input style={inputStyle} value={storeForm.phone} onChange={e => setStoreForm(f => ({ ...f, phone: e.target.value }))} placeholder="+598 2xxx xxxx" />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('storeLabelWhatsApp')}</label>
                    <input style={inputStyle} value={storeForm.whatsapp} onChange={e => setStoreForm(f => ({ ...f, whatsapp: e.target.value }))} placeholder="+598 9xx xxx xxx" />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('storeLabelWebsite')}</label>
                    <input style={inputStyle} value={storeForm.website} onChange={e => setStoreForm(f => ({ ...f, website: e.target.value }))} placeholder="https://" />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('storeLabelLat')}</label>
                    <input style={inputStyle} type="number" step="any" value={storeForm.lat} onChange={e => setStoreForm(f => ({ ...f, lat: e.target.value }))} placeholder="-34.xxx" />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('storeLabelLng')}</label>
                    <input style={inputStyle} type="number" step="any" value={storeForm.lng} onChange={e => setStoreForm(f => ({ ...f, lng: e.target.value }))} placeholder="-56.xxx" />
                  </div>
                  <div style={{ gridColumn: '1/-1' }}>
                    <label style={labelStyle}>{t('storeLabelDesc')}</label>
                    <textarea style={{ ...inputStyle, minHeight: 64, resize: 'vertical' }} value={storeForm.description} onChange={e => setStoreForm(f => ({ ...f, description: e.target.value }))} placeholder={t('storePlaceholderDesc')} />
                  </div>

                  {/* ── Marketplace ── */}
                  <div style={{ gridColumn: '1/-1', marginTop: 6, paddingTop: 12, borderTop: '1px solid #334155', fontSize: '0.72rem', color: '#f59e0b', textTransform: 'uppercase', letterSpacing: 1, fontWeight: 700 }}>
                    🛒 {t('storeMktStoreSection')}
                  </div>
                  <div>
                    <label style={labelStyle}>{t('storeLabelSlug')}</label>
                    <input style={inputStyle} value={storeForm.slug} onChange={e => setStoreForm(f => ({ ...f, slug: e.target.value }))} placeholder="taralinea" />
                  </div>
                  <div>
                    <label style={labelStyle}>{t('storeLabelCountry')}</label>
                    <select style={inputStyle} value={storeForm.home_country} onChange={e => setStoreForm(f => ({ ...f, home_country: e.target.value }))}>
                      {HOME_COUNTRIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label style={labelStyle}>{t('storeLabelCommission')}</label>
                    <input style={inputStyle} type="number" step="0.5" min="0" max="100" value={storeForm.default_commission_pct} onChange={e => setStoreForm(f => ({ ...f, default_commission_pct: e.target.value }))} placeholder="10" />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 20, flexWrap: 'wrap' }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={storeForm.active} onChange={e => setStoreForm(f => ({ ...f, active: e.target.checked }))} style={{ accentColor: '#22c55e' }} />
                      {t('storeLabelActive')}
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#cbd5e1', cursor: 'pointer' }}>
                      <input type="checkbox" checked={storeForm.featured} onChange={e => setStoreForm(f => ({ ...f, featured: e.target.checked }))} style={{ accentColor: '#f59e0b' }} />
                      ⭐ {t('storeLabelFeatured')}
                    </label>
                  </div>

                  {/* ── Pagamentos (Mercado Pago) ── */}
                  {store && (
                    <div style={{ gridColumn: '1/-1', marginTop: 6, padding: 12, background: '#0f172a', borderRadius: 8, border: '1px solid #334155' }}>
                      <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#cbd5e1', marginBottom: 8 }}>💳 {t('storePaymentsTitle')}</div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {HOME_COUNTRIES.map(c => {
                          const conn = connections.find(x => x.country === c.id);
                          const connected = conn?.oauth_status === 'connected';
                          return (
                            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                              <span style={{ fontSize: '0.8rem', color: '#cbd5e1' }}>{c.label}</span>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <span style={{ fontSize: '0.72rem', color: connected ? '#4ade80' : '#64748b' }}>
                                  {connected ? '🟢 ' + t('storePayConnected') : '⚪ ' + t('storePayPending')}
                                </span>
                                <button type="button" disabled title={t('storePaymentsSoon')}
                                  style={{ fontSize: '0.72rem', padding: '4px 10px', borderRadius: 6, border: '1px solid #334155', background: 'transparent', color: '#475569', cursor: 'not-allowed' }}>
                                  {t('storePayConnect')}
                                </button>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 8 }}>{t('storePaymentsSoon')}</div>
                    </div>
                  )}
                </div>
                <button type="submit" disabled={saving} style={{ marginTop: 16, padding: '9px 24px', background: saving ? '#334155' : '#d97706', border: 'none', borderRadius: 7, color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.85rem' }}>
                  {saving ? t('storeSaving') : store ? t('storeUpdate') : t('storeRegister')}
                </button>
              </form>
            )}

            {/* Tab: Products */}
            {!loading && tab === 'products' && (
              <div>
                {!store && (
                  <div style={{ color: '#f59e0b', fontSize: '0.8rem', padding: '10px 14px', background: '#0f172a', borderRadius: 7, marginBottom: 12 }}>
                    ⚠️ {t('storeSaveDataFirst')}
                  </div>
                )}

                <button
                  onClick={() => { setShowProductForm(true); setEditingProduct(null); setProductForm(EMPTY_PRODUCT); }}
                  disabled={!store}
                  style={{ marginBottom: 14, padding: '7px 16px', background: !store ? '#334155' : '#0f172a', border: '1px solid #334155', borderRadius: 7, color: !store ? '#475569' : '#f59e0b', cursor: !store ? 'not-allowed' : 'pointer', fontSize: '0.82rem', fontWeight: 600 }}
                >
                  <Plus size={13} style={{ verticalAlign: -2, marginRight: 4 }} />{t('storeAddProduct')}
                </button>

                {/* Product form */}
                {showProductForm && (
                  <form onSubmit={handleSaveProduct} style={{ background: '#0f172a', borderRadius: 8, padding: 16, marginBottom: 16, border: '1px solid #334155' }}>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: 12, color: '#f59e0b' }}>
                      {editingProduct ? t('storeEditProduct') : t('storeNewProduct')}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                      <div>
                        <label style={labelStyle}>{t('storeLabelGearType')}</label>
                        <select required style={inputStyle} value={productForm.gear_type} onChange={e => setProductForm(f => ({ ...f, gear_type: e.target.value, gear_key: e.target.value }))}>
                          {Object.entries(GEAR_TYPE_LABELS).map(([k, v]) => (
                            <option key={k} value={k}>{v.icon} {v.label}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label style={labelStyle}>{t('storeLabelProductName')}</label>
                        <input required style={inputStyle} value={productForm.name} onChange={e => setProductForm(f => ({ ...f, name: e.target.value }))} placeholder={t('storePlaceholderProductName')} />
                      </div>
                      <div>
                        <label style={labelStyle}>{t('storeLabelBrand')}</label>
                        <input style={inputStyle} value={productForm.brand} onChange={e => setProductForm(f => ({ ...f, brand: e.target.value }))} placeholder="Ex: Shimano" />
                      </div>
                      <div>
                        <label style={labelStyle}>{t('storeLabelModel')}</label>
                        <input style={inputStyle} value={productForm.model} onChange={e => setProductForm(f => ({ ...f, model: e.target.value }))} placeholder="Ex: Catana 2,10m Medium" />
                      </div>
                      <div>
                        <label style={labelStyle}>{t('storeLabelProductType')}</label>
                        <select style={inputStyle} value={productForm.product_type} onChange={e => setProductForm(f => ({ ...f, product_type: e.target.value }))}>
                          {PRODUCT_TYPES.map(pt => <option key={pt} value={pt}>{pt}</option>)}
                        </select>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 8 }}>
                        <div>
                          <label style={labelStyle}>{t('storeLabelMktPrice')}</label>
                          <input style={inputStyle} type="number" step="0.01" min="0" value={productForm.price} onChange={e => setProductForm(f => ({ ...f, price: e.target.value }))} placeholder="Opcional" />
                        </div>
                        <div>
                          <label style={labelStyle}>{t('storeLabelCurrency')}</label>
                          <select style={inputStyle} value={productForm.currency} onChange={e => setProductForm(f => ({ ...f, currency: e.target.value }))}>
                            {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
                          </select>
                        </div>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 14, paddingTop: 20, flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#cbd5e1', cursor: 'pointer' }}>
                          <input type="checkbox" checked={productForm.in_stock} onChange={e => setProductForm(f => ({ ...f, in_stock: e.target.checked }))} style={{ accentColor: '#d97706' }} />
                          {t('storeLabelInStock')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#cbd5e1', cursor: 'pointer' }}>
                          <input type="checkbox" checked={productForm.featured} onChange={e => setProductForm(f => ({ ...f, featured: e.target.checked }))} style={{ accentColor: '#f59e0b' }} />
                          ⭐ {t('storeLabelFeatured')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem', color: '#cbd5e1', cursor: 'pointer' }}>
                          <input type="checkbox" checked={productForm.active} onChange={e => setProductForm(f => ({ ...f, active: e.target.checked }))} style={{ accentColor: '#22c55e' }} />
                          {t('storeLabelActive')}
                        </label>
                      </div>
                      <div style={{ gridColumn: '1/-1' }}>
                        <label style={labelStyle}>{t('storeLabelSpecies')}</label>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                          {ALL_SPECIES.map(sp => {
                            const sel = productForm.species_ids.includes(sp.id);
                            return (
                              <button key={sp.id} type="button" onClick={() => toggleSpecies(sp.id)}
                                style={{ padding: '3px 9px', borderRadius: 12, border: `1px solid ${sel ? '#d97706' : '#334155'}`, background: sel ? '#d97706' : 'transparent', color: sel ? '#fff' : '#94a3b8', fontSize: '0.72rem', cursor: 'pointer' }}>
                                {sel && <Check size={9} style={{ marginRight: 3, verticalAlign: -1 }} />}{sp.name}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                      <button type="submit" disabled={saving} style={{ padding: '7px 20px', background: saving ? '#334155' : '#d97706', border: 'none', borderRadius: 6, color: '#fff', fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', fontSize: '0.82rem' }}>
                        {saving ? t('storeSaving') : t('storeSaveBtn')}
                      </button>
                      <button type="button" onClick={() => { setShowProductForm(false); setEditingProduct(null); }} style={{ padding: '7px 16px', background: 'transparent', border: '1px solid #334155', borderRadius: 6, color: '#94a3b8', cursor: 'pointer', fontSize: '0.82rem' }}>
                        {t('cancel')}
                      </button>
                    </div>
                  </form>
                )}

                {/* Products list */}
                {products.length === 0 ? (
                  <div style={{ color: '#475569', fontSize: '0.82rem', textAlign: 'center', padding: '20px 0' }}>{t('storeNoProducts')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {products.map(p => (
                      <div key={p.id} style={{ background: '#0f172a', borderRadius: 7, padding: '10px 12px', display: 'flex', alignItems: 'center', gap: 10, border: '1px solid #1e293b' }}>
                        <span style={{ fontSize: '1rem' }}>{GEAR_TYPE_LABELS[p.gear_type]?.icon || '📦'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', display: 'flex', alignItems: 'center', gap: 5 }}>
                            {p.featured && <Star size={12} fill="#f59e0b" color="#f59e0b" style={{ flexShrink: 0 }} />}
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</span>
                            {p.active === false && <span style={{ fontSize: '0.62rem', color: '#64748b', border: '1px solid #334155', borderRadius: 4, padding: '0 4px', flexShrink: 0 }}>off</span>}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            {GEAR_TYPE_LABELS[p.gear_type]?.label}
                            {p.brand && ` · ${p.brand}`}
                            {(p.price ?? p.price_uyu) != null && ` · $${p.price ?? p.price_uyu} ${p.currency || 'UYU'}`}
                            {!p.in_stock && <span style={{ color: '#ef4444', marginLeft: 4 }}>{t('storeNoStock')}</span>}
                          </div>
                        </div>
                        <button onClick={() => openEditProduct(p)} style={{ background: 'transparent', border: 'none', color: '#64748b', cursor: 'pointer', fontSize: '0.75rem', padding: '4px 6px' }}>✏️</button>
                        <button onClick={() => handleDeleteProduct(p.id)} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px 6px' }}>
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab: Reports */}
            {!loading && tab === 'reports' && (
              <div>
                {!store ? (
                  <div style={{ color: '#f59e0b', fontSize: '0.8rem', padding: '10px 14px', background: '#0f172a', borderRadius: 7 }}>
                    ⚠️ {t('storeSaveDataFirst')}
                  </div>
                ) : reportsLoading ? (
                  <div style={{ color: '#64748b', textAlign: 'center', padding: 20 }}>{t('storeLoading')}</div>
                ) : (() => {
                  const paid = orders.filter(o => o.status === 'paid');
                  const byCur = {};
                  for (const o of paid) {
                    const c = o.currency || 'UYU';
                    byCur[c] = byCur[c] || { revenue: 0, commission: 0 };
                    byCur[c].revenue += Number(o.total || 0);
                    byCur[c].commission += Number(o.commission_amount || 0);
                  }
                  const funnelSteps = [
                    { label: t('storeRepViews'), value: funnel.views, color: '#38bdf8' },
                    { label: t('storeRepClicks'), value: funnel.clicks, color: '#f59e0b' },
                    { label: t('storeRepOrders'), value: orders.length, color: '#a855f7' },
                    { label: t('storeRepPaid'), value: paid.length, color: '#22c55e' },
                  ];
                  const maxV = Math.max(1, ...funnelSteps.map(s => s.value));
                  return (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                      {/* Funil */}
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#cbd5e1', marginBottom: 8 }}>📊 {t('storeRepFunnel')}</div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                          {funnelSteps.map(s => (
                            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <span style={{ fontSize: '0.72rem', color: '#94a3b8', width: 120, flexShrink: 0 }}>{s.label}</span>
                              <div style={{ flex: 1, background: '#0f172a', borderRadius: 4, height: 18, overflow: 'hidden' }}>
                                <div style={{ width: `${Math.round((s.value / maxV) * 100)}%`, minWidth: s.value > 0 ? 2 : 0, height: '100%', background: s.color }} />
                              </div>
                              <span style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f1f5f9', width: 40, textAlign: 'right' }}>{s.value}</span>
                            </div>
                          ))}
                        </div>
                      </div>

                      {/* Comissão / receita */}
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#cbd5e1', marginBottom: 8 }}>💰 {t('storeRepCommission')}</div>
                        {Object.keys(byCur).length === 0 ? (
                          <div style={{ fontSize: '0.75rem', color: '#475569' }}>{t('storeRepNoOrders')}</div>
                        ) : (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                            {Object.entries(byCur).map(([cur, v]) => (
                              <div key={cur} style={{ background: '#0f172a', borderRadius: 8, padding: '10px 14px', border: '1px solid #334155', minWidth: 140 }}>
                                <div style={{ fontSize: '0.68rem', color: '#64748b' }}>{cur}</div>
                                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: '#22c55e' }}>${v.commission.toFixed(2)}</div>
                                <div style={{ fontSize: '0.68rem', color: '#64748b', marginTop: 2 }}>{t('storeRepRevenue')}: ${v.revenue.toFixed(2)}</div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Lista de pedidos */}
                      <div>
                        <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#cbd5e1', marginBottom: 8 }}>🧾 {t('storeRepOrders')} ({orders.length})</div>
                        {orders.length === 0 ? (
                          <div style={{ fontSize: '0.75rem', color: '#475569' }}>{t('storeRepNoOrders')}</div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                            {orders.map(o => {
                              const stColor = o.status === 'paid' ? '#22c55e' : o.status === 'pending' ? '#f59e0b' : '#ef4444';
                              return (
                                <div key={o.id} style={{ background: '#0f172a', borderRadius: 7, padding: '8px 12px', border: '1px solid #1e293b', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                                  <div style={{ minWidth: 0 }}>
                                    <div style={{ fontSize: '0.76rem', color: '#cbd5e1', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                      {(o.order_items || []).map(i => `${i.qty}× ${i.name}`).join(', ') || o.id.slice(0, 8)}
                                    </div>
                                    <div style={{ fontSize: '0.66rem', color: '#64748b' }}>{new Date(o.created_at).toLocaleDateString()}{o.country && ` · ${o.country}`}</div>
                                  </div>
                                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                                    <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#f1f5f9' }}>${Number(o.total || 0).toFixed(2)} {o.currency || 'UYU'}</div>
                                    <span style={{ fontSize: '0.64rem', color: stColor, border: `1px solid ${stColor}`, borderRadius: 4, padding: '0 5px' }}>{o.status}</span>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      <div style={{ fontSize: '0.66rem', color: '#475569', borderTop: '1px solid #1e293b', paddingTop: 8 }}>
                        ℹ️ {t('storeRepHint')}
                      </div>
                    </div>
                  );
                })()}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
