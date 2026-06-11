/**
 * src/fishid.js
 *
 * Pipeline de identificação de espécies de peixe por foto.
 *
 * Fluxo por ordem de prioridade:
 *   1. Modelo local TensorFlow.js (MobileNet fine-tuned)  — offline-capable
 *   2. iNaturalist Vision API (gratuita, sem chave)        — online
 *   3. Base interna de capturas verificadas               — online (Supabase)
 *
 * Lógica de confiança:
 *   - Se qualquer etapa retornar score >= CONFIDENCE_HIGH (0.92), resultado aceito.
 *   - Combinação de etapas: score final = média ponderada dos scores de cada fonte.
 *   - Se score combinado < CONFIDENCE_LOW (0.60), retorna "baixa confiabilidade".
 *
 * Auto-incremento:
 *   - Cada captura confirmada (usuário aceita sugestão ou corrige) é salva como
 *     amostra de treino em IndexedDB para refinamento futuro do modelo local.
 */

// ─── Constantes ──────────────────────────────────────────────────────────────

export const CONFIDENCE_HIGH = 0.92;   // Aceita resultado automaticamente
export const CONFIDENCE_MED  = 0.70;   // Aceita com aviso "provável"
export const CONFIDENCE_LOW  = 0.45;   // Alerta de baixa confiabilidade

const INAT_API = 'https://api.inaturalist.org/v1/computervision/score_image';
const INAT_TAXON_TIMEOUT = 8000; // ms

// ─── Mapeamento iNaturalist taxon_id → id interno Pescamon ───────────────────
// Adicionar mais à medida que capturas forem identificadas.
const INAT_TAXON_MAP = {
  // Salminus brasiliensis (Dorado)
  51703:  'dorado',
  // Hoplias malabaricus (Tararira)
  56285:  'tararira',
  // Megaleporinus obtusidens (Boga)
  51702:  'boga',
  // Pimelodus maculatus (Bagre amarillo)
  124234: 'bagre_amarillo',
  // Odontesthes bonariensis (Pejerrey)
  56288:  'pejerrey',
  // Prochilodus lineatus (Sábalo)
  74537:  'sabalo',
  // Luciopimelodus pati (Patí)
  124235: 'pati',
  // Pseudoplatystoma corruscans (Surubí)
  124236: 'surubi',
  // Hypostomus commersoni (Vieja del agua)
  51706:  'vieja_del_agua',
  // Cyprinus carpio (Carpa)
  48148:  'carpa',
  // Micropogonias furnieri (Corvina)
  79961:  'corvina',
  // Pogonias cromis (Corvina negra)
  79960:  'corvina_negra',
  // Mugil liza (Lisa)
  51708:  'lisa',
  // Austrolebias spp. (Pez anual)
  56286:  'pez_anual',
  // Gymnotus omarorum (Morena)
  56287:  'morena',
  // Rhamdia quelen (Bagre negro)
  124237: 'bagre_negro',
  // Oligosarcus jenynsii (Dientudo)
  56289:  'dientudo',
  // Brycon orbignyanus (Pira-pitá)
  51705:  'pira_pita',
  // Piaractus mesopotamicus (Pacú)
  51704:  'pacu',
  // Zungaro jahu (Manguruyú)
  124238: 'manguruyu',
  // Astyanax spp. (Mojarra)
  56290:  'mojarra',
  // Geophagus brasiliensis (Castañeta)
  56291:  'castaneta',
  // Australoheros scitulus (Chanchita)
  56292:  'chanchita',
  // Serrasalmus spp. (Palometa)
  79962:  'palometa',
};

// Nome científico e popular por id interno (subset para lookup reverso)
export const FISH_META = {
  dorado:        { pt: 'Dourado',        es: 'Dorado',        en: 'Golden dorado',    sci: 'Salminus brasiliensis' },
  tararira:      { pt: 'Tararira',       es: 'Tararira',      en: 'Trahira',          sci: 'Hoplias malabaricus' },
  boga:          { pt: 'Boga',           es: 'Boga',          en: 'Boga',             sci: 'Megaleporinus obtusidens' },
  bagre_amarillo:{ pt: 'Bagre amarelo',  es: 'Bagre amarillo',en: 'Spotted pimelod',  sci: 'Pimelodus maculatus' },
  pejerrey:      { pt: 'Peixe-rei',      es: 'Pejerrey',      en: 'Silverside',       sci: 'Odontesthes spp.' },
  sabalo:        { pt: 'Sável',          es: 'Sábalo',        en: 'Prochilod',        sci: 'Prochilodus lineatus' },
  pati:          { pt: 'Patí',           es: 'Patí',          en: 'Pati catfish',     sci: 'Luciopimelodus pati' },
  surubi:        { pt: 'Surubim',        es: 'Surubí',        en: 'Spotted sorubim',  sci: 'Pseudoplatystoma corruscans' },
  vieja_del_agua:{ pt: 'Cascudo',        es: 'Vieja del agua',en: 'Armored catfish',  sci: 'Hypostomus commersoni' },
  carpa:         { pt: 'Carpa',          es: 'Carpa',         en: 'Common carp',      sci: 'Cyprinus carpio' },
  corvina:       { pt: 'Corvina',        es: 'Corvina',       en: 'Weakfish',         sci: 'Micropogonias furnieri' },
  corvina_negra: { pt: 'Corvina-preta',  es: 'Corvina negra', en: 'Black drum',       sci: 'Pogonias cromis' },
  lisa:          { pt: 'Tainha',         es: 'Lisa',          en: 'Mullet',           sci: 'Mugil liza' },
  pez_anual:     { pt: 'Peixe anual',    es: 'Pez anual',     en: 'Annual killifish', sci: 'Austrolebias spp.' },
  morena:        { pt: 'Moreia criolla', es: 'Morena',        en: 'Banded knifefish', sci: 'Gymnotus omarorum' },
  bagre_negro:   { pt: 'Bagre sapo',     es: 'Bagre negro',   en: 'Neotropical catfish',sci:'Rhamdia quelen' },
  dientudo:      { pt: 'Dientudo',       es: 'Dientudo',      en: 'Jaw characin',     sci: 'Oligosarcus jenynsii' },
  pira_pita:     { pt: 'Pirapitinga',    es: 'Pira-pitá',     en: 'Brycon',           sci: 'Brycon orbignyanus' },
  pacu:          { pt: 'Pacu',           es: 'Pacú',          en: 'Pacu',             sci: 'Piaractus mesopotamicus' },
  manguruyu:     { pt: 'Manguruyú',      es: 'Manguruyú',     en: 'Jau catfish',      sci: 'Zungaro jahu' },
  mojarra:       { pt: 'Lambari',        es: 'Mojarra',       en: 'Characin',         sci: 'Astyanax spp.' },
  castaneta:     { pt: 'Cará',           es: 'Castañeta',     en: 'Pearl cichlid',    sci: 'Geophagus brasiliensis' },
  chanchita:     { pt: 'Chanchita',      es: 'Chanchita',     en: 'Chanchita cichlid',sci: 'Australoheros scitulus' },
  palometa:      { pt: 'Palometa',       es: 'Palometa',      en: 'Piranha',          sci: 'Serrasalmus spp.' },
};

// ─── Módulo TensorFlow.js ─────────────────────────────────────────────────────

let _tfModel = null;
let _tfLabels = null;
let _tfLoading = false;

/**
 * Carrega o modelo TF.js (MobileNetV2 quantizado) de /models/fishid/
 * O modelo é carregado de forma lazy na primeira chamada.
 */
async function loadTFModel() {
  if (_tfModel) return { model: _tfModel, labels: _tfLabels };
  if (_tfLoading) {
    // Aguarda carregamento em andamento
    await new Promise(resolve => {
      const check = setInterval(() => { if (!_tfLoading) { clearInterval(check); resolve(); } }, 100);
    });
    return { model: _tfModel, labels: _tfLabels };
  }

  _tfLoading = true;
  try {
    // Verifica se TF.js está disponível (carregado via CDN no index.html ou importado)
    if (typeof window === 'undefined' || !window.tf) {
      _tfLoading = false;
      return null;
    }
    const tf = window.tf;

    // Tenta carregar modelo local pré-treinado
    const modelRes = await fetch('/models/fishid/model.json');
    if (!modelRes.ok) { _tfLoading = false; return null; }

    _tfModel = await tf.loadLayersModel('/models/fishid/model.json');

    const labelsRes = await fetch('/models/fishid/labels.json');
    _tfLabels = labelsRes.ok ? await labelsRes.json() : null;

    _tfLoading = false;
    return { model: _tfModel, labels: _tfLabels };
  } catch {
    _tfLoading = false;
    return null;
  }
}

/**
 * Classifica uma imagem usando o modelo TF.js local.
 * @param {HTMLImageElement|HTMLCanvasElement|ImageData} imageEl
 * @returns {Promise<{species: string, score: number, source: 'local_model'}[]>}
 */
async function classifyWithTF(imageEl) {
  const loaded = await loadTFModel();
  if (!loaded?.model || !loaded?.labels) return [];

  const tf = window.tf;
  try {
    const tensor = tf.browser.fromPixels(imageEl)
      .resizeNearestNeighbor([224, 224])
      .toFloat()
      .div(255.0)
      .expandDims(0);

    const predictions = await loaded.model.predict(tensor).data();
    tensor.dispose();

    return loaded.labels
      .map((label, i) => ({ species: label, score: predictions[i], source: 'local_model' }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  } catch {
    return [];
  }
}

// ─── iNaturalist Vision API ───────────────────────────────────────────────────

/**
 * Envia a imagem para a API de visão do iNaturalist e retorna sugestões.
 * @param {File|Blob} imageFile
 * @returns {Promise<{species: string, score: number, source: 'inat', taxonId: number, commonName: string}[]>}
 */
async function classifyWithINat(imageFile) {
  try {
    const formData = new FormData();
    formData.append('image', imageFile);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), INAT_API_TIMEOUT);

    const res = await fetch(INAT_API, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (!res.ok) return [];
    const data = await res.json();

    return (data.results || [])
      .filter(r => r.taxon?.iconic_taxon_name === 'Actinopterygii' || r.taxon?.ancestor_ids?.includes(47178))
      .map(r => {
        const taxonId = r.taxon?.id;
        const internalId = INAT_TAXON_MAP[taxonId] || null;
        return {
          species: internalId || r.taxon?.name || r.taxon?.preferred_common_name || 'unknown',
          score: r.combined_score ?? r.vision_score ?? 0,
          source: 'inat',
          taxonId,
          commonName: r.taxon?.preferred_common_name || r.taxon?.name,
          scientificName: r.taxon?.name,
          isMapped: !!internalId,
        };
      })
      .filter(r => r.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  } catch {
    return [];
  }
}

const INAT_API_TIMEOUT = INAT_TAXON_TIMEOUT;

// ─── Base interna (Supabase) ──────────────────────────────────────────────────

/**
 * Busca sugestões baseadas em capturas verificadas próximas ao local informado.
 * Usa a tabela `catches` com campo `species_id` e coordenadas.
 * @param {string} supabaseUrl
 * @param {string} supabaseKey
 * @param {{lat: number, lon: number}|null} location
 * @returns {Promise<{species: string, score: number, source: 'internal_db', count: number}[]>}
 */
async function classifyWithInternalDB(supabaseUrl, supabaseKey, location) {
  if (!supabaseUrl || !supabaseKey) return [];
  try {
    // Busca espécies mais capturadas nos últimos 6 meses, opcionalmente próximas ao local
    const sixMonthsAgo = new Date(Date.now() - 180 * 24 * 60 * 60 * 1000).toISOString();
    let url = `${supabaseUrl}/rest/v1/occurrences?select=species_id,lat,lon&created_at=gte.${sixMonthsAgo}&species_id=not.is.null&limit=500`;

    const res = await fetch(url, {
      headers: {
        apikey: supabaseKey,
        Authorization: `Bearer ${supabaseKey}`,
      },
    });
    if (!res.ok) return [];
    const rows = await res.json();

    // Filtra por proximidade se localização disponível (raio 50km)
    const filtered = location
      ? rows.filter(r => {
          if (!r.lat || !r.lon) return true;
          const d = haversineKm(location.lat, location.lon, r.lat, r.lon);
          return d <= 50;
        })
      : rows;

    // Agrupa por espécie e conta
    const counts = {};
    for (const r of filtered) {
      counts[r.species_id] = (counts[r.species_id] || 0) + 1;
    }

    const total = Object.values(counts).reduce((s, v) => s + v, 0) || 1;
    return Object.entries(counts)
      .map(([species, count]) => ({
        species,
        score: Math.min(count / total + 0.1, 0.85), // frequência relativa, cap 0.85
        source: 'internal_db',
        count,
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  } catch {
    return [];
  }
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// ─── Pipeline principal ───────────────────────────────────────────────────────

/**
 * Identifica espécie a partir de uma foto.
 *
 * @param {object} params
 * @param {File} params.imageFile                    Arquivo de imagem original (para iNaturalist)
 * @param {HTMLImageElement|HTMLCanvasElement} params.imageEl  Elemento de imagem (para TF.js)
 * @param {{lat: number, lon: number}|null} params.location   Localização opcional (para DB interna)
 * @param {boolean} params.isOnline                  Se false, pula etapas de API externa
 * @param {string} params.supabaseUrl                URL do Supabase
 * @param {string} params.supabaseKey                Anon key do Supabase
 * @param {function} params.onProgress               Callback(step: string) para progresso
 *
 * @returns {Promise<FishIDResult>}
 */
export async function identifyFish({
  imageFile,
  imageEl,
  location = null,
  isOnline = true,
  supabaseUrl = '',
  supabaseKey = '',
  onProgress = () => {},
}) {
  const allResults = [];

  // ── Etapa 1: Modelo local TF.js ────────────────────────────────────────────
  onProgress('local_model');
  const tfResults = imageEl ? await classifyWithTF(imageEl) : [];
  if (tfResults.length > 0) {
    allResults.push(...tfResults);
    const best = tfResults[0];
    if (best.score >= CONFIDENCE_HIGH) {
      return buildResult(allResults, 'local_model', best.score);
    }
  }

  // ── Etapas online ──────────────────────────────────────────────────────────
  if (!isOnline) {
    return buildResult(allResults, 'local_model', tfResults[0]?.score ?? 0);
  }

  // ── Etapa 2: iNaturalist Vision ─────────────────────────────────────────────
  onProgress('inat');
  const inatResults = imageFile ? await classifyWithINat(imageFile) : [];
  if (inatResults.length > 0) {
    allResults.push(...inatResults);
    const best = inatResults[0];
    if (best.score >= CONFIDENCE_HIGH) {
      return buildResult(allResults, 'inat', best.score);
    }
  }

  // ── Etapa 3: Base interna (Supabase) ─────────────────────────────────────────
  onProgress('internal_db');
  const dbResults = await classifyWithInternalDB(supabaseUrl, supabaseKey, location);
  if (dbResults.length > 0) {
    allResults.push(...dbResults);
  }

  // ── Combinação final ──────────────────────────────────────────────────────
  return buildResult(allResults, 'combined', null);
}

/**
 * Constrói o resultado final combinando todas as fontes.
 * Para cada espécie candidata, acumula scores ponderados por fonte.
 */
function buildResult(allResults, primarySource, forcedScore) {
  if (allResults.length === 0) {
    return {
      top: null,
      candidates: [],
      confidence: 0,
      confidenceLabel: 'sem_resultado',
      source: primarySource,
      isHighConfidence: false,
    };
  }

  // Pesos por fonte
  const SOURCE_WEIGHT = {
    local_model:  0.35,
    inat:         0.45,
    internal_db:  0.20,
  };

  // Agrupa por espécie e acumula score ponderado
  const speciesMap = {};
  for (const r of allResults) {
    const key = r.species;
    if (!speciesMap[key]) speciesMap[key] = { species: key, weightedScore: 0, sources: [] };
    const w = SOURCE_WEIGHT[r.source] ?? 0.2;
    speciesMap[key].weightedScore += r.score * w;
    speciesMap[key].sources.push(r.source);
    // Preserva dados extras do iNaturalist
    if (r.source === 'inat') {
      speciesMap[key].commonName = r.commonName;
      speciesMap[key].scientificName = r.scientificName;
      speciesMap[key].taxonId = r.taxonId;
      speciesMap[key].isMapped = r.isMapped;
    }
  }

  // Ordena candidatos por score ponderado
  const candidates = Object.values(speciesMap)
    .sort((a, b) => b.weightedScore - a.weightedScore)
    .map(c => ({
      ...c,
      meta: FISH_META[c.species] || null,
      score: Math.min(c.weightedScore, 1.0),
    }));

  const top = candidates[0];
  const finalScore = forcedScore ?? top.score;

  const confidenceLabel =
    finalScore >= CONFIDENCE_HIGH ? 'alta' :
    finalScore >= CONFIDENCE_MED  ? 'media' :
    finalScore >= CONFIDENCE_LOW  ? 'baixa' : 'muito_baixa';

  return {
    top,
    candidates: candidates.slice(0, 5),
    confidence: finalScore,
    confidenceLabel,
    source: primarySource,
    isHighConfidence: finalScore >= CONFIDENCE_HIGH,
    isMedConfidence: finalScore >= CONFIDENCE_MED && finalScore < CONFIDENCE_HIGH,
    isLowConfidence: finalScore < CONFIDENCE_MED,
  };
}

// ─── IndexedDB: amostras de treino ─────────────────────────────────────────────

const TRAIN_DB_NAME = 'pescamon-fishid-train';
const TRAIN_DB_VERSION = 1;
const TRAIN_STORE = 'samples';

function openTrainDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(TRAIN_DB_NAME, TRAIN_DB_VERSION);
    req.onupgradeneeded = e => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(TRAIN_STORE)) {
        const store = db.createObjectStore(TRAIN_STORE, { keyPath: 'id', autoIncrement: true });
        store.createIndex('species', 'species', { unique: false });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };
    req.onsuccess = e => resolve(e.target.result);
    req.onerror = e => reject(e.target.error);
  });
}

/**
 * Salva uma amostra de treino confirmada pelo usuário.
 * @param {string} species       Id interno da espécie (ex: 'dorado')
 * @param {string} imageDataUrl  Imagem em base64 (data:image/jpeg;base64,...)
 * @param {string} source        Fonte da confirmação: 'user_accept' | 'user_correct'
 */
export async function saveTrainingSample(species, imageDataUrl, source = 'user_accept') {
  try {
    const db = await openTrainDB();
    const tx = db.transaction(TRAIN_STORE, 'readwrite');
    tx.objectStore(TRAIN_STORE).add({
      species,
      imageDataUrl,
      source,
      createdAt: new Date().toISOString(),
    });
    await new Promise((res, rej) => { tx.oncomplete = res; tx.onerror = rej; });
    db.close();
  } catch {
    // Silencioso — não crítico
  }
}

/**
 * Retorna o número de amostras de treino salvas por espécie.
 * @returns {Promise<Record<string, number>>}
 */
export async function getTrainingSampleCounts() {
  try {
    const db = await openTrainDB();
    const tx = db.transaction(TRAIN_STORE, 'readonly');
    const store = tx.objectStore(TRAIN_STORE);
    const all = await new Promise((res, rej) => {
      const req = store.getAll();
      req.onsuccess = () => res(req.result);
      req.onerror = rej;
    });
    db.close();
    const counts = {};
    for (const s of all) counts[s.species] = (counts[s.species] || 0) + 1;
    return counts;
  } catch {
    return {};
  }
}

/**
 * Retorna todas as amostras de treino de uma espécie (para fine-tuning futuro).
 * @param {string} species
 * @returns {Promise<{species: string, imageDataUrl: string, createdAt: string}[]>}
 */
export async function getTrainingSamplesForSpecies(species) {
  try {
    const db = await openTrainDB();
    const tx = db.transaction(TRAIN_STORE, 'readonly');
    const index = tx.objectStore(TRAIN_STORE).index('species');
    const all = await new Promise((res, rej) => {
      const req = index.getAll(species);
      req.onsuccess = () => res(req.result);
      req.onerror = rej;
    });
    db.close();
    return all;
  } catch {
    return [];
  }
}
