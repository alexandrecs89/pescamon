const DB_NAME = 'pescamon';
const DB_VERSION = 1;
const STORE_NAME = 'occurrences';
const FALLBACK_KEY = 'pescamon-occurrences';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        store.createIndex('speciesId', 'speciesId', { unique: false });
        store.createIndex('date', 'date', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function withStore(mode, callback) {
  return openDatabase().then((db) => {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, mode);
      const store = transaction.objectStore(STORE_NAME);
      const result = callback(store);

      transaction.oncomplete = () => resolve(result);
      transaction.onerror = () => reject(transaction.error);
    });
  });
}

export async function loadAllOccurrences() {
  try {
    const db = await openDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.getAll();

      request.onsuccess = () => {
        const results = request.result || [];

        if (results.length === 0) {
          const fallback = readLocalStorageFallback();

          if (fallback.length > 0) {
            migrateFromLocalStorage(fallback).then(() => resolve(fallback));
            return;
          }
        }

        resolve(results);
      };

      request.onerror = () => {
        resolve(readLocalStorageFallback());
      };
    });
  } catch {
    return readLocalStorageFallback();
  }
}

export async function addOccurrence(occurrence) {
  try {
    await withStore('readwrite', (store) => store.add(occurrence));
  } catch {
    // silent fallback
  }

  syncToLocalStorage(occurrence, 'add');
}

export async function removeOccurrence(id) {
  try {
    await withStore('readwrite', (store) => store.delete(id));
  } catch {
    // silent fallback
  }

  syncToLocalStorage(id, 'remove');
}

function readLocalStorageFallback() {
  try {
    return JSON.parse(localStorage.getItem(FALLBACK_KEY)) || [];
  } catch {
    return [];
  }
}

function syncToLocalStorage(data, action) {
  try {
    const current = readLocalStorageFallback();

    if (action === 'add') {
      current.push(data);
    } else if (action === 'remove') {
      const index = current.findIndex((o) => o.id === data);

      if (index !== -1) {
        current.splice(index, 1);
      }
    }

    localStorage.setItem(FALLBACK_KEY, JSON.stringify(current));
  } catch {
    // silent
  }
}

export function exportOccurrencesJSON(occurrences) {
  const data = {
    version: 1,
    exportedAt: new Date().toISOString(),
    count: occurrences.length,
    occurrences
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pescamon-ocorrencias-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportOccurrencesCSV(occurrences) {
  const headers = ['data', 'especie', 'latitude', 'longitude', 'peso_kg', 'isca', 'notas'];
  const rows = occurrences.map((o) => [
    new Date(o.date).toLocaleString('pt-BR'),
    o.speciesName || o.speciesId,
    o.location?.[0] ?? '',
    o.location?.[1] ?? '',
    o.weightKg || '',
    o.baitUsed || '',
    (o.notes || '').replace(/"/g, '""'),
  ].map((v) => `"${v}"`).join(','));

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pescamon-capturas-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportOccurrencesGPX(occurrences) {
  const waypoints = occurrences.map((o) => {
    const lat = o.location?.[0] ?? 0;
    const lon = o.location?.[1] ?? 0;
    const name = `${o.speciesName || o.speciesId}${o.weightKg ? ` (${o.weightKg}kg)` : ''}`;
    const time = new Date(o.date).toISOString();
    const desc = [o.baitUsed && `Isca: ${o.baitUsed}`, o.notes].filter(Boolean).join(' | ');
    return `  <wpt lat="${lat}" lon="${lon}">
    <ele>0</ele>
    <time>${time}</time>
    <name><![CDATA[${name}]]></name>
    <desc><![CDATA[${desc}]]></desc>
    <sym>Fishing Hot Spot Facility</sym>
  </wpt>`;
  }).join('\n');

  const gpx = `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="Pescamon" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>Pescamon — Capturas</name>
    <time>${new Date().toISOString()}</time>
  </metadata>
${waypoints}
</gpx>`;

  const blob = new Blob([gpx], { type: 'application/gpx+xml' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pescamon-capturas-${new Date().toISOString().slice(0, 10)}.gpx`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function exportSessionsCSV(sessions) {
  const headers = ['data_inicio', 'data_fim', 'duracao_min', 'local', 'capturas', 'peso_total_kg', 'maior_peixe_kg', 'especie_maior', 'notas'];
  const rows = sessions.map((s) => {
    const start = new Date(s.started_at);
    const end = s.ended_at ? new Date(s.ended_at) : null;
    const durMin = end ? Math.round((end - start) / 60000) : '';
    return [
      start.toLocaleString('pt-BR'),
      end ? end.toLocaleString('pt-BR') : '',
      durMin,
      s.location_name || '',
      s.total_catches || 0,
      s.total_weight_kg || '',
      s.biggest_fish_kg || '',
      s.biggest_fish_species || '',
      (s.notes || '').replace(/"/g, '""'),
    ].map((v) => `"${v}"`).join(',');
  });

  const csv = [headers.join(','), ...rows].join('\n');
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pescamon-sessoes-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function importOccurrencesJSON(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const parsed = JSON.parse(event.target.result);
        const entries = parsed.occurrences || parsed;

        if (!Array.isArray(entries)) {
          reject(new Error('Formato inválido'));
          return;
        }

        const valid = entries.filter((o) => o.id && o.speciesId && o.location && Array.isArray(o.location));

        for (const entry of valid) {
          await addOccurrence(entry);
        }

        resolve(valid);
      } catch (error) {
        reject(error);
      }
    };

    reader.onerror = () => reject(reader.error);
    reader.readAsText(file);
  });
}

const REMOTE_SYNC_URL = null;

export async function syncToRemote(occurrences) {
  if (!REMOTE_SYNC_URL) return { synced: false, reason: 'no-remote-url' };

  try {
    const response = await fetch(REMOTE_SYNC_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ occurrences, deviceId: getDeviceId(), timestamp: Date.now() })
    });

    if (!response.ok) throw new Error(`Sync failed: ${response.status}`);

    return { synced: true };
  } catch (error) {
    return { synced: false, reason: error.message };
  }
}

export async function pullFromRemote() {
  if (!REMOTE_SYNC_URL) return { pulled: false, reason: 'no-remote-url' };

  try {
    const response = await fetch(`${REMOTE_SYNC_URL}?deviceId=${getDeviceId()}`);

    if (!response.ok) throw new Error(`Pull failed: ${response.status}`);

    const data = await response.json();
    return { pulled: true, occurrences: data.occurrences || [] };
  } catch (error) {
    return { pulled: false, reason: error.message };
  }
}

function getDeviceId() {
  let id = localStorage.getItem('pescamon-device-id');

  if (!id) {
    id = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    localStorage.setItem('pescamon-device-id', id);
  }

  return id;
}

async function migrateFromLocalStorage(entries) {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);

    for (const entry of entries) {
      store.put(entry);
    }

    return new Promise((resolve) => {
      transaction.oncomplete = resolve;
      transaction.onerror = resolve;
    });
  } catch {
    // silent
  }
}
