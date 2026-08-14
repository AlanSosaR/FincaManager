import { getAccessToken } from './auth.js';
import db from './db.js';

let syncInProgress = false;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://udhuizkqnmkhljmezzkd.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkaHVpemtxbm1raGxqbWV6emtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTM2MTYsImV4cCI6MjA5MTIyOTYxNn0.W9bJ1S8A45RUGaulhdVG6UohGmGNxGMjLBsc0Q7voPE';

const SUPABASE_TABLES = [
  'motores', 'motor_sesiones', 'motor_mantenimientos',
  'potreros', 'ganado', 'herramientas', 'potrero_eventos',
  'animal_pesajes', 'animal_vacunas', 'animal_fumigaciones', 'animal_ventas',
  'animal_preñez',
  'herramienta_mantenimientos', 'lotes', 'lote_aplicaciones',
  'lote_personal', 'personal', 'personal_asistencia',
  'gastos', 'cultivos',
  'usuarios', 'empresas', 'usuario_empresas', 'invitaciones',
];

const BUSINESS_TABLES = new Set([
  'motores', 'motor_sesiones', 'motor_mantenimientos',
  'potreros', 'ganado', 'herramientas', 'potrero_eventos',
  'animal_pesajes', 'animal_vacunas', 'animal_fumigaciones', 'animal_ventas',
  'animal_preñez',
  'herramienta_mantenimientos', 'lotes', 'lote_aplicaciones',
  'lote_personal', 'personal', 'personal_asistencia',
  'gastos', 'cultivos',
]);

export async function supabaseFetch(path, options = {}) {
  const apikey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkaHVpemtxbm1raGxqbWV6emtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTM2MTYsImV4cCI6MjA5MTIyOTYxNn0.W9bJ1S8A45RUGaulhdVG6UohGmGNxGMjLBsc0Q7voPE';
  const session = getAccessToken();
  const headers = {
    'apikey': apikey,
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (!headers['Prefer']) headers['Prefer'] = 'return=representation';
  if (session) {
    headers['Authorization'] = `Bearer ${session}`;
  }
  const res = await fetch(`${SUPABASE_URL}${path}`, { method: options.method || 'GET', body: options.body, headers });
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`Supabase API ${res.status} en ${path}: ${body.slice(0, 200)}`);
  }
  return res;
}

async function updateSyncMeta(key, value) {
  await db._sync_meta.put({ key, value, updated_at: new Date().toISOString() });
}

async function getSyncMeta(key) {
  const row = await db._sync_meta.where('key').equals(key).first();
  return row ? row.value : null;
}

export function isOnline() {
  return navigator.onLine;
}

// Borra la caché local de una tabla para que la siguiente lectura
// vaya a REST y traiga datos frescos (se usa tras writes por REST crudo).
export async function invalidateCache(tableName) {
  try {
    const table = db.table(tableName);
    await table.clear();
  } catch (e) {
    console.warn(`invalidateCache error en ${tableName}:`, e);
  }
}

export async function fullDownload(onProgress) {
  if (syncInProgress) return false;
  syncInProgress = true;
  try {
    onProgress?.(0);
    const pendingIds = new Map();
    const pending = await db._sync_queue.toArray();
    for (const item of pending) {
      if (item.action === 'insert') {
        if (!pendingIds.has(item.table)) pendingIds.set(item.table, new Set());
        pendingIds.get(item.table).add(item.record_id);
      }
    }

    const total = SUPABASE_TABLES.length;
    let done = 0;
    for (const tableName of SUPABASE_TABLES) {
      try {
        let allData = [];
        let from = 0;
        const limit = 1000;
        const empresaFilter = BUSINESS_TABLES.has(tableName) && window._currentEmpresaId
          ? `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`
          : '';
        while (true) {
          const res = await supabaseFetch(
            `/rest/v1/${tableName}?select=*&order=created_at.asc&limit=${limit}&offset=${from}${empresaFilter}`
          );
          const data = await res.json();
          if (!data.length) break;
          allData = allData.concat(data);
          from += limit;
          if (data.length < limit) break;
        }
        const dexieTable = db.table(tableName);

        const localRecords = await dexieTable.toArray();
        const localIds = new Set(localRecords.map(r => r.id));
        const serverIds = new Set(allData.map(r => r.id));
        const protectIds = pendingIds.get(tableName);

        const toDelete = [...localIds].filter(id => !serverIds.has(id) && (!protectIds || !protectIds.has(id)));
        if (toDelete.length) {
          await dexieTable.bulkDelete(toDelete);
        }

        if (allData.length) {
          await dexieTable.bulkPut(allData);
        }
      } catch (tableErr) {
        console.warn(`fullDownload: error en tabla ${tableName}, continuando...`, tableErr);
      } finally {
        done += 1;
        onProgress?.(Math.round((done / total) * 100));
      }
    }
    await updateSyncMeta('last_full_sync', new Date().toISOString());
    onProgress?.(100);
    return true;
  } catch (err) {
    console.error('fullDownload error:', err);
    return false;
  } finally {
    syncInProgress = false;
  }
}

export async function processSyncQueue() {
  if (syncInProgress) return;
  if (!isOnline()) return;
  syncInProgress = true;
  try {
    const queue = await db._sync_queue.orderBy('id').toArray();
    if (!queue.length) return;

    for (const item of queue) {
      try {
        const path = `/rest/v1/${item.table}?id=eq.${encodeURIComponent(item.record_id)}`;
        if (item.action === 'delete') {
          await supabaseFetch(path, { method: 'DELETE' });
          await db.table(item.table).delete(item.record_id);
        } else if (item.action === 'insert') {
          const body = { ...item.data };
          const res = await supabaseFetch(`/rest/v1/${item.table}`, {
            method: 'POST',
            body: JSON.stringify(body),
          });
          const serverRecords = await res.json();
          const serverRecord = Array.isArray(serverRecords) ? serverRecords[0] : serverRecords;
          await db.table(item.table).put(serverRecord);
        } else if (item.action === 'update') {
          const body = { ...item.data };
          delete body.id;
          delete body.created_at;
          delete body.updated_at;
          const res = await supabaseFetch(path, {
            method: 'PATCH',
            body: JSON.stringify(body),
          });
          const serverRecords = await res.json();
          const serverRecord = Array.isArray(serverRecords) ? serverRecords[0] : serverRecords;
          await db.table(item.table).put({ ...item.data, ...serverRecord });
        }
        await db._sync_queue.delete(item.id);
      } catch (err) {
        console.warn(`sync queue item ${item.id} failed:`, err);
        if (err.message?.includes('Supabase API 4')) {
          await db._sync_queue.delete(item.id);
        }
      }
    }

  } catch (err) {
    console.error('processSyncQueue error:', err);
  } finally {
    syncInProgress = false;
  }
}

const activeSyncPromises = new Map();
const lastSyncTime = new Map();

export async function syncTable(tableName, force = false) {
  if (!isOnline()) return;
  if (!SUPABASE_TABLES.includes(tableName)) return;

  const now = Date.now();
  const lastTime = lastSyncTime.get(tableName) || 0;
  if (!force && now - lastTime < 15000) {
    return;
  }

  if (activeSyncPromises.has(tableName)) {
    return activeSyncPromises.get(tableName);
  }

  const promise = (async () => {
    try {
      const empresaFilter = BUSINESS_TABLES.has(tableName) && window._currentEmpresaId
        ? `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`
        : '';
      let allData = [];
      let from = 0;
      const limit = 1000;
      while (true) {
        const res = await supabaseFetch(
          `/rest/v1/${tableName}?select=*&order=created_at.asc&limit=${limit}&offset=${from}${empresaFilter}`
        );
        const data = await res.json();
        if (!data.length) break;
        allData = allData.concat(data);
        from += limit;
        if (data.length < limit) break;
      }
      const dexieTable = db.table(tableName);
      const localRecords = await dexieTable.toArray();
      const localIds = new Set(localRecords.map(r => r.id));
      const serverIds = new Set(allData.map(r => r.id));
      const toDelete = [...localIds].filter(id => !serverIds.has(id));
      if (toDelete.length) {
        await dexieTable.bulkDelete(toDelete);
      }
      if (allData.length) {
        await dexieTable.bulkPut(allData);
      }
      lastSyncTime.set(tableName, Date.now());
    } catch (err) {
      console.warn(`syncTable: error en ${tableName}`, err);
    } finally {
      activeSyncPromises.delete(tableName);
    }
  })();

  activeSyncPromises.set(tableName, promise);
  return promise;
}

export async function incrementalSync(force = false) {
  if (!isOnline()) return;
  const tables = [...BUSINESS_TABLES];
  const BATCH_SIZE = 3;
  for (let i = 0; i < tables.length; i += BATCH_SIZE) {
    const batch = tables.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(t => syncTable(t, force)));
  }
}
