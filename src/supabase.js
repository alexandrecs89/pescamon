import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://kjgqtvmoujrlhmxlehwz.supabase.co';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_C9aIEuA-L3QL_uvf8hmdrA_QEvxDkJa';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export async function signInWithMagicLink(email) {
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin }
  });
  if (error) throw error;
}

export async function signUpWithEmail(email, password, name) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { full_name: name } }
  });
  if (error) throw error;
  // Supabase retorna user com identities[] vazio quando o email já existe e está confirmado
  if (data?.user && data.user.identities && data.user.identities.length === 0) {
    throw new Error('already registered');
  }
  return data;
}

export async function signInWithEmail(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signInWithProvider(provider) {
  const { error } = await supabase.auth.signInWithOAuth({
    provider,
    options: { redirectTo: window.location.origin }
  });
  if (error) throw error;
}

export async function updateUserProfile(updates) {
  const { error } = await supabase.auth.updateUser({ data: updates });
  if (error) throw error;
}

export async function uploadAvatar(file) {
  const { data: { user }, error: userErr } = await supabase.auth.getUser();
  if (userErr || !user) throw new Error('Usuário não autenticado');
  const ext = file.name.split('.').pop().toLowerCase();
  const path = `avatars/${user.id}.${ext}`;
  const { error: upErr } = await supabase.storage
    .from('user-avatars')
    .upload(path, file, { upsert: true, contentType: file.type });
  if (upErr) throw upErr;
  const { data } = supabase.storage.from('user-avatars').getPublicUrl(path);
  const avatarUrl = data.publicUrl + '?t=' + Date.now();
  await updateUserProfile({ avatar_url: avatarUrl });
  return avatarUrl;
}

export async function resetPassword(email) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/?reset=1`
  });
  if (error) throw error;
}

export async function fetchMonthlyRanking() {
  const now = new Date();
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const { data, error } = await supabase
    .from('occurrences')
    .select('device_id, species_name, created_at')
    .gte('created_at', firstDay);

  if (error) throw error;
  if (!data || data.length === 0) return [];

  const byDevice = {};
  for (const row of data) {
    const id = row.device_id || 'anon';
    if (!byDevice[id]) byDevice[id] = { deviceId: id, count: 0, species: new Set() };
    byDevice[id].count++;
    if (row.species_name) byDevice[id].species.add(row.species_name);
  }

  return Object.values(byDevice)
    .map((d) => ({ ...d, species: d.species.size }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
}

export async function recordBaitUse(speciesId, baitName, cellId = null) {
  const { error } = await supabase.from('bait_history').insert({
    species_id: speciesId,
    bait_name: baitName.trim(),
    cell_id: cellId || null,
    device_id: getDeviceId(),
    recorded_at: new Date().toISOString()
  });
  if (error) throw error;
}

export async function fetchHotBaits(speciesId, cellId = null) {
  // Agrega no servidor via RPC — evita transferir todos os registros para o client
  const { data, error } = await supabase.rpc('get_hot_baits', {
    p_species_id: speciesId,
    p_cell_id: cellId || null,
    p_limit: 3
  });

  if (!error && data && data.length > 0) {
    const total = data.reduce((s, r) => s + Number(r.cnt), 0);
    return data.map(r => ({
      name: r.bait_name,
      count: Number(r.cnt),
      pct: Math.round((Number(r.cnt) / total) * 100),
      source: 'remote'
    }));
  }

  // Fallback: agregação local se a RPC ainda não existir no projeto Supabase
  let query = supabase
    .from('bait_history')
    .select('bait_name')
    .eq('species_id', speciesId);
  if (cellId) query = query.eq('cell_id', cellId);
  const { data: rows, error: rowErr } = await query;
  if (rowErr || !rows || rows.length === 0) return [];

  const counts = {};
  for (const row of rows) {
    const key = row.bait_name.trim().toLowerCase();
    counts[key] = (counts[key] || 0) + 1;
  }
  const total = rows.length;
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / total) * 100), source: 'remote' }));
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();

  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

export function onAuthChange(callback) {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    callback(session);
  });

  return data.subscription;
}

function getCurrentUserId() {
  try {
    const raw = localStorage.getItem(`sb-${SUPABASE_URL.split('//')[1].split('.')[0]}-auth-token`);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed?.user?.id || null;
    }
  } catch { /* fallback */ }
  return null;
}

async function getCurrentUserIdAsync() {
  const { data } = await supabase.auth.getUser();
  return data?.user?.id || null;
}

export async function fetchRemoteOccurrences() {
  const { data, error } = await supabase
    .from('occurrences')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;

  return (data || []).map(rowToOccurrence);
}

export async function fetchMyOccurrences() {
  const userId = await getCurrentUserIdAsync();
  const deviceId = getDeviceId();

  let query = supabase
    .from('occurrences')
    .select('*')
    .order('created_at', { ascending: false });

  if (userId) {
    query = query.or(`user_id.eq.${userId},device_id.eq.${deviceId}`);
  } else {
    query = query.eq('device_id', deviceId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data || []).map(rowToOccurrence);
}

export async function migrateAnonymousOccurrences() {
  const userId = await getCurrentUserIdAsync();
  if (!userId) return 0;
  const deviceId = getDeviceId();

  const { data, error } = await supabase
    .from('occurrences')
    .update({ user_id: userId })
    .eq('device_id', deviceId)
    .is('user_id', null)
    .select('id');

  if (error) throw error;
  return (data || []).length;
}

export async function pushOccurrence(occurrence) {
  const { error } = await supabase
    .from('occurrences')
    .upsert(occurrenceToRow(occurrence), { onConflict: 'id' });

  if (error) throw error;
}

export async function deleteRemoteOccurrence(id) {
  const { error } = await supabase
    .from('occurrences')
    .delete()
    .eq('id', String(id));

  if (error) throw error;
}

export async function pushAllOccurrences(occurrences) {
  if (occurrences.length === 0) return;

  const rows = occurrences.map(occurrenceToRow);

  const { error } = await supabase
    .from('occurrences')
    .upsert(rows, { onConflict: 'id' });

  if (error) throw error;
}

function occurrenceToRow(o) {
  const row = {
    id: String(o.id),
    species_id: o.speciesId,
    species_name: o.speciesName,
    lat: o.location[0],
    lng: o.location[1],
    notes: o.notes || '',
    created_at: o.date || new Date().toISOString(),
    device_id: getDeviceId()
  };

  const userId = getCurrentUserId();
  if (userId) row.user_id = userId;

  return row;
}

function rowToOccurrence(row) {
  return {
    id: Number(row.id) || row.id,
    speciesId: row.species_id,
    speciesName: row.species_name,
    location: [row.lat, row.lng],
    date: row.created_at,
    notes: row.notes || '',
    deviceId: row.device_id,
    userId: row.user_id || null
  };
}

export function subscribeToOccurrences(onInsert, onDelete) {
  const deviceId = getDeviceId();

  // Nome de canal ÚNICO por inscrição. Com nome fixo, o StrictMode/HMR (que monta o
  // efeito duas vezes) reaproveitava o canal já inscrito e chamava `.on()` depois do
  // `.subscribe()` → "cannot add postgres_changes callbacks after subscribe()". Um
  // nome único garante um canal novo a cada chamada; o cleanup remove o seu.
  const channel = supabase
    .channel(`occurrences-realtime-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'occurrences' }, (payload) => {
      if (payload.new?.device_id === deviceId) return;
      onInsert(rowToOccurrence(payload.new));
    })
    .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'occurrences' }, (payload) => {
      if (payload.old?.device_id === deviceId) return;
      const id = payload.old?.id;
      if (id) onDelete(Number(id) || id);
    })
    .subscribe();

  return () => { supabase.removeChannel(channel); };
}

export async function savePlannedTrip(plan) {
  const userId = await getCurrentUserIdAsync();
  const deviceId = getDeviceId();
  console.log('[savePlannedTrip] userId:', userId, 'deviceId:', deviceId);
  const row = {
    id: String(plan.id || Date.now()),
    device_id: deviceId,
    user_id: userId || null,
    trip_type: plan.tripType,
    species_ids: plan.speciesIds,
    species_names: plan.speciesNames,
    location_id: plan.locationId || null,
    location_name: plan.locationName || '',
    start_date: plan.startDate || null,
    end_date: plan.endDate || null,
    start_time: plan.startTime || null,
    end_time: plan.endTime || null,
    party_size: plan.partySize || 1,
    gear: plan.gear || '',
    notes: plan.notes || '',
    created_at: plan.createdAt || new Date().toISOString(),
  };
  console.log('[savePlannedTrip] row:', row);
  const { data, error } = await supabase
    .from('planned_trips')
    .upsert(row, { onConflict: 'id' })
    .select();
  console.log('[savePlannedTrip] result:', { data, error });
  if (error) throw error;
}

export async function fetchPlannedTrips() {
  const userId = await getCurrentUserIdAsync();
  const deviceId = getDeviceId();
  console.log('[fetchPlannedTrips] userId:', userId, 'deviceId:', deviceId);

  let query = supabase
    .from('planned_trips')
    .select('*')
    .order('start_date', { ascending: true });

  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.eq('device_id', deviceId);
  }

  const { data, error } = await query;
  console.log('[fetchPlannedTrips] result:', { data, error });
  if (error) { console.error('fetchPlannedTrips error:', error); throw error; }
  return (data || []).map(rowToPlannedTrip);
}

export async function deletePlannedTrip(tripId) {
  const userId = await getCurrentUserIdAsync();
  const deviceId = getDeviceId();
  let query = supabase.from('planned_trips').delete().eq('id', String(tripId));
  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.eq('device_id', deviceId);
  }
  const { error } = await query;
  if (error) throw error;
}

// ============================================================
// Pescarias Ativas e Registro de Capturas
// ============================================================

export async function createFishingSession(session) {
  const userId = getCurrentUserId();
  const deviceId = getDeviceId();
  
  const row = {
    user_id: userId,
    device_id: deviceId,
    title: session.title || null,
    status: 'active',
    watercourse_id: session.watercourseId,
    watercourse_name: session.watercourseName,
    watercourse_type: session.watercourseType,
    location_lat: session.lat,
    location_lon: session.lon,
    weather_temp_c: session.weather?.temp,
    weather_condition: session.weather?.condition,
    moon_phase: session.moonPhase,
    notes: session.notes || null,
  };
  
  const { data, error } = await supabase
    .from('fishing_sessions')
    .insert(row)
    .select()
    .single();
  
  if (error) throw error;
  return { id: data.id, ...session };
}

export async function getActiveFishingSession() {
  const userId = getCurrentUserId();
  const deviceId = getDeviceId();
  
  let query = supabase
    .from('fishing_sessions')
    .select('*')
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1);
  
  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.eq('device_id', deviceId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data?.[0] || null;
}

export async function getFishingSessions(limit = 20) {
  const userId = getCurrentUserId();
  const deviceId = getDeviceId();
  
  let query = supabase
    .from('fishing_sessions')
    .select('*, catches(count)')
    .order('started_at', { ascending: false })
    .limit(limit);
  
  if (userId) {
    query = query.eq('user_id', userId);
  } else {
    query = query.eq('device_id', deviceId);
  }
  
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function updateFishingSession(id, updates) {
  const row = {
    ...(updates.status && { status: updates.status }),
    ...(updates.endedAt && { ended_at: updates.endedAt }),
    ...(updates.totalCatches !== undefined && { total_catches: updates.totalCatches }),
    ...(updates.totalWeightKg && { total_weight_kg: updates.totalWeightKg }),
    ...(updates.biggestFishKg && { biggest_fish_kg: updates.biggestFishKg }),
    ...(updates.biggestFishSpecies && { biggest_fish_species: updates.biggestFishSpecies }),
    ...(updates.notes !== undefined && { notes: updates.notes }),
  };
  
  const { error } = await supabase
    .from('fishing_sessions')
    .update(row)
    .eq('id', id);
  
  if (error) throw error;
}

export async function deleteFishingSession(id) {
  const { error } = await supabase
    .from('fishing_sessions')
    .delete()
    .eq('id', id);
  if (error) throw error;
}

// Capturas
export async function addCatch(sessionId, catchData) {
  const row = {
    session_id: sessionId,
    species_id: catchData.speciesId,
    species_name: catchData.speciesName,
    weight_kg: catchData.weightKg || null,
    length_cm: catchData.lengthCm || null,
    catch_lat: catchData.lat || null,
    catch_lon: catchData.lon || null,
    caught_at: catchData.caughtAt || new Date().toISOString(),
    bait_type: catchData.baitType || null,
    lure_type: catchData.lureType || null,
    depth_m: catchData.depthM || null,
    photo_urls: catchData.photoUrls || [],
    notes: catchData.notes || null,
  };
  
  const { data, error } = await supabase
    .from('catches')
    .insert(row)
    .select()
    .single();
  
  if (error) throw error;
  return data;
}

export async function getCatchesBySession(sessionId) {
  const { data, error } = await supabase
    .from('catches')
    .select('*')
    .eq('session_id', sessionId)
    .order('caught_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function updateCatch(catchId, updates) {
  const row = {
    ...(updates.weightKg !== undefined && { weight_kg: updates.weightKg }),
    ...(updates.lengthCm !== undefined && { length_cm: updates.lengthCm }),
    ...(updates.photoUrls !== undefined && { photo_urls: updates.photoUrls }),
    ...(updates.notes !== undefined && { notes: updates.notes }),
  };
  
  const { error } = await supabase
    .from('catches')
    .update(row)
    .eq('id', catchId);
  
  if (error) throw error;
}

export async function deleteCatch(catchId) {
  const { error } = await supabase
    .from('catches')
    .delete()
    .eq('id', catchId);
  if (error) throw error;
}

// Upload de fotos
export async function uploadCatchPhoto(file, sessionId) {
  const fileExt = file.name.split('.').pop();
  const fileName = `${sessionId}/${Date.now()}.${fileExt}`;
  
  const { error } = await supabase.storage
    .from('catch-photos')
    .upload(fileName, file, {
      cacheControl: '3600',
      upsert: false,
    });
  
  if (error) throw error;
  
  const { data: urlData } = supabase.storage
    .from('catch-photos')
    .getPublicUrl(fileName);
  
  return urlData.publicUrl;
}

function rowToPlannedTrip(row) {
  return {
    id: row.id,
    tripType: row.trip_type,
    speciesIds: row.species_ids || [],
    speciesNames: row.species_names || [],
    locationId: row.location_id,
    locationName: row.location_name || '',
    startDate: row.start_date,
    endDate: row.end_date,
    startTime: row.start_time,
    endTime: row.end_time,
    partySize: row.party_size || 1,
    gear: row.gear || '',
    notes: row.notes || '',
    createdAt: row.created_at,
  };
}

export async function fetchValidations(occurrenceId) {
  const { data, error } = await supabase
    .from('capture_validations')
    .select('vote, device_id')
    .eq('occurrence_id', String(occurrenceId));
  if (error) throw error;
  return data || [];
}

export async function submitValidation(occurrenceId, vote) {
  const deviceId = getDeviceId();
  const { error } = await supabase
    .from('capture_validations')
    .upsert(
      { occurrence_id: String(occurrenceId), device_id: deviceId, vote },
      { onConflict: 'occurrence_id,device_id' }
    );
  if (error) throw error;
}

export async function removeValidation(occurrenceId) {
  const deviceId = getDeviceId();
  const { error } = await supabase
    .from('capture_validations')
    .delete()
    .eq('occurrence_id', String(occurrenceId))
    .eq('device_id', deviceId);
  if (error) throw error;
}

export function getDeviceId() {
  let id = localStorage.getItem('pescamon-device-id');

  if (!id) {
    id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('pescamon-device-id', id);
  }

  return id;
}

// ============================================================
// IoT Sensors - Sensores Físicos
// ============================================================

export async function getIoTSensors() {
  const { data, error } = await supabase
    .from('iot_sensors')
    .select('*')
    .order('updated_at', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

export async function getNearbySensors(lat, lon, radiusKm = 5) {
  // Busca sensores dentro de um raio (aproximação simples)
  const { data, error } = await supabase
    .from('iot_sensors')
    .select('*')
    .not('lat', 'is', null)
    .not('lng', 'is', null);
  
  if (error) throw error;
  
  // Filtra por distância
  return (data || []).filter(sensor => {
    const dist = haversineDistance(lat, lon, sensor.lat, sensor.lng);
    return dist <= radiusKm;
  }).sort((a, b) => {
    const distA = haversineDistance(lat, lon, a.lat, a.lng);
    const distB = haversineDistance(lat, lon, b.lat, b.lng);
    return distA - distB;
  });
}

export function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Raio da Terra em km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

export function calculateWeightedTemperature(sensors, targetLat, targetLon) {
  if (!sensors || sensors.length === 0) return null;
  
  // Calcula temperatura ponderada por inverso da distância
  let totalWeight = 0;
  let weightedTemp = 0;
  
  for (const sensor of sensors) {
    if (sensor.water_temp == null) continue;
    
    const dist = haversineDistance(targetLat, targetLon, sensor.lat, sensor.lng);
    const weight = 1 / (dist + 0.1); // +0.1 para evitar divisão por zero
    
    weightedTemp += sensor.water_temp * weight;
    totalWeight += weight;
  }
  
  return totalWeight > 0 ? weightedTemp / totalWeight : null;
}

export function getTemperatureScore(actualTemp, optimalTemp, tolerance = 3) {
  // Calcula score 0-1 baseado na proximidade da temperatura ideal
  const diff = Math.abs(actualTemp - optimalTemp);
  if (diff <= tolerance) return 1;
  if (diff <= tolerance * 2) return 0.7;
  if (diff <= tolerance * 3) return 0.4;
  return 0.1;
}


// ── Postos de pesca da comunidade ────────────────────────────────────────────

export async function getFishingSpots() {
  const { data, error } = await supabase
    .from('fishing_spots')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

export async function addFishingSpot(spot) {
  const deviceId = getDeviceId();
  const { data, error } = await supabase
    .from('fishing_spots')
    .insert([{ ...spot, device_id: deviceId, id: spot.id || `spot-${Date.now()}-${Math.random().toString(36).slice(2,7)}` }])
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function upvoteFishingSpot(spotId) {
  const { error } = await supabase.rpc('increment_spot_upvote', { spot_id: spotId });
  if (error) {
    // fallback: fetch + update manual se a RPC ainda não existe
    const { data: current } = await supabase.from('fishing_spots').select('upvotes').eq('id', spotId).single();
    await supabase.from('fishing_spots').update({ upvotes: (current?.upvotes || 0) + 1 }).eq('id', spotId);
  }
}

export async function deleteFishingSpot(spotId) {
  const deviceId = getDeviceId();
  const { error } = await supabase
    .from('fishing_spots')
    .delete()
    .eq('id', spotId)
    .eq('device_id', deviceId);
  if (error) throw error;
}

// ── Lojas de pesca parceiras ──────────────────────────────────────────────────
export async function getFishingStores() {
  const { data, error } = await supabase
    .from('fishing_stores')
    .select('*')
    .order('name');
  if (error) throw error;
  return data || [];
}

export async function getMyStore(userId) {
  const { data, error } = await supabase
    .from('fishing_stores')
    .select('*')
    .eq('user_id', userId)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data || null;
}

export async function upsertFishingStore(store) {
  const { data, error } = await supabase
    .from('fishing_stores')
    .upsert(store, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFishingStore(storeId) {
  const { error } = await supabase
    .from('fishing_stores')
    .delete()
    .eq('id', storeId);
  if (error) throw error;
}

// ── Produtos de lojas ─────────────────────────────────────────────────────────
export async function getStoreProducts(storeId) {
  const { data, error } = await supabase
    .from('store_products')
    .select('*')
    .eq('store_id', storeId)
    .order('gear_type');
  if (error) throw error;
  return data || [];
}

export async function getProductsForSpecies(speciesIds) {
  if (!speciesIds || speciesIds.length === 0) return [];
  const { data, error } = await supabase
    .from('store_products')
    .select('*, fishing_stores(id,name,city,lat,lng,phone,whatsapp,website)')
    .eq('in_stock', true)
    .overlaps('species_ids', speciesIds);
  if (error) throw error;
  return data || [];
}

export async function upsertStoreProduct(product) {
  const { data, error } = await supabase
    .from('store_products')
    .upsert(product, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteStoreProduct(productId) {
  const { error } = await supabase
    .from('store_products')
    .delete()
    .eq('id', productId);
  if (error) throw error;
}

// ── Marketplace: funil de eventos (view / click_buy) ─────────────────────────
// Best-effort: nunca lança erro para não atrapalhar a UI. Loga a intenção do
// pescador para os relatórios do dashboard (views → cliques → pedidos).
export async function logMarketplaceEvent(type, { productId = null, storeId = null, country = null } = {}) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from('marketplace_events').insert({
      type, product_id: productId, store_id: storeId, country,
      user_id: user?.id || null,
    });
  } catch { /* silencioso — funil é best-effort */ }
}

// ── Marketplace: relatórios do lojista (Fase 5) ──────────────────────────────
// Pedidos da loja (RLS: só o dono da loja lê). Inclui itens para detalhe.
export async function getStoreOrders(storeId, { limit = 100 } = {}) {
  if (!storeId) return [];
  const { data, error } = await supabase
    .from('orders')
    .select('*, order_items(id, name, qty, unit_price, currency)')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

// Funil da loja: contagem de eventos por tipo (view / click_buy).
export async function getMarketplaceFunnel(storeId) {
  if (!storeId) return { views: 0, clicks: 0 };
  const countFor = async (type) => {
    const { count, error } = await supabase
      .from('marketplace_events')
      .select('*', { count: 'exact', head: true })
      .eq('store_id', storeId)
      .eq('type', type);
    if (error) throw error;
    return count || 0;
  };
  const [views, clicks] = await Promise.all([countFor('view'), countFor('click_buy')]);
  return { views, clicks };
}

// ── Marketplace: status das contas de recebimento (Mercado Pago) ──────────────
// Lê a view merchant_connection_status, que expõe só o status da loja do próprio
// usuário (sem tokens). A conexão OAuth em si é feita na etapa de checkout (Fase 4).
export async function getMerchantConnections(storeId) {
  if (!storeId) return [];
  const { data, error } = await supabase
    .from('merchant_connection_status')
    .select('country, provider, oauth_status, connected_at')
    .eq('store_id', storeId);
  if (error) throw error;
  return data || [];
}

