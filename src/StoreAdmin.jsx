import { useState, useEffect } from 'react';
import { Package, Plus, Trash2, Store, Fish, ChevronDown, Check, X } from 'lucide-react';
import { getMyStore, upsertFishingStore, getStoreProducts, upsertStoreProduct, deleteStoreProduct } from './supabase.js';
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
  });
  const [productForm, setProductForm] = useState({
    gear_type: 'rod', gear_key: 'rod', name: '', brand: '', model: '', species_ids: [], price_uyu: '', in_stock: true,
  });
  const [showProductForm, setShowProductForm] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
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
            lat: s.lat || '', lng: s.lng || '' });
          return getStoreProducts(s.id);
        }
        return [];
      })
      .then(p => setProducts(p))
      .catch(e => setMsg({ type: 'error', text: e.message }))
      .finally(() => setLoading(false));
  }, [isOpen, userId]);

  async function handleSaveStore(e) {
    e.preventDefault();
    if (!userId) { setMsg({ type: 'error', text: t('storeLoginToSave') }); return; }
    setSaving(true);
    try {
      const payload = {
        id: store?.id || generateId(),
        user_id: userId,
        ...storeForm,
        lat: storeForm.lat ? parseFloat(storeForm.lat) : null,
        lng: storeForm.lng ? parseFloat(storeForm.lng) : null,
      };
      const saved = await upsertFishingStore(payload);
      setStore(saved);
      setMsg({ type: 'ok', text: t('storeSavedOk') });
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
      const payload = {
        id: editingProduct?.id || generateId(),
        store_id: store.id,
        ...productForm,
        price_uyu: productForm.price_uyu ? parseFloat(productForm.price_uyu) : null,
      };
      await upsertStoreProduct(payload);
      const prods = await getStoreProducts(store.id);
      setProducts(prods);
      setShowProductForm(false);
      setEditingProduct(null);
      setProductForm({ gear_type: 'rod', gear_key: 'rod', name: '', brand: '', model: '', species_ids: [], price_uyu: '', in_stock: true });
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
      model: p.model || '', species_ids: p.species_ids || [], price_uyu: p.price_uyu || '', in_stock: p.in_stock });
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
              {[['store', t('storeTabStore')], ['products', `${t('storeTabProducts')} (${products.length})`]].map(([key, label]) => (
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
                  onClick={() => { setShowProductForm(true); setEditingProduct(null); setProductForm({ gear_type: 'rod', gear_key: 'rod', name: '', brand: '', model: '', species_ids: [], price_uyu: '', in_stock: true }); }}
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
                        <label style={labelStyle}>{t('storeLabelPrice')}</label>
                        <input style={inputStyle} type="number" step="0.01" min="0" value={productForm.price_uyu} onChange={e => setProductForm(f => ({ ...f, price_uyu: e.target.value }))} placeholder="Opcional" />
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingTop: 20 }}>
                        <input type="checkbox" id="in-stock" checked={productForm.in_stock} onChange={e => setProductForm(f => ({ ...f, in_stock: e.target.checked }))} style={{ accentColor: '#d97706' }} />
                        <label htmlFor="in-stock" style={{ fontSize: '0.82rem', color: '#cbd5e1', cursor: 'pointer' }}>{t('storeLabelInStock')}</label>
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
                          <div style={{ fontWeight: 600, fontSize: '0.82rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.name}</div>
                          <div style={{ fontSize: '0.7rem', color: '#64748b' }}>
                            {GEAR_TYPE_LABELS[p.gear_type]?.label}
                            {p.brand && ` · ${p.brand}`}
                            {p.price_uyu && ` · $${p.price_uyu} UYU`}
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
          </>
        )}
      </div>
    </div>
  );
}
