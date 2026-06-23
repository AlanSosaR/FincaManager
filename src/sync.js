import db from './db.js';

let syncInProgress = false;
let onSyncStatusChange = null;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://udhuizkqnmkhljmezzkd.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkaHVpemtxbm1raGxqbWV6emtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTM2MTYsImV4cCI6MjA5MTIyOTYxNn0.W9bJ1S8A45RUGaulhdVG6UohGmGNxGMjLBsc0Q7voPE';

const SUPABASE_TABLES = [
  'motores', 'motor_sesiones', 'motor_mantenimientos',
  'potreros', 'ganado', 'herramientas', 'potrero_eventos',
  'animal_pesajes', 'animal_vacunas', 'animal_fumigaciones',
  'herramienta_mantenimientos', 'lotes', 'lote_aplicaciones',
  'lote_personal', 'personal', 'personal_asistencia',
];

async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers,
    },
    ...options,
  });
  if (!res.ok) throw new Error(`Supabase API ${res.status}: ${res.statusText}`);
  return res;
}

export function setSyncStatusCallback(fn) {
  onSyncStatusChange = fn;
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

export async function fullDownload() {
  if (syncInProgress) return;
  syncInProgress = true;
  try {
    onSyncStatusChange?.('Descargando datos...');
    for (const tableName of SUPABASE_TABLES) {
      onSyncStatusChange?.(`Descargando ${tableName}...`);
      let allData = [];
      let from = 0;
      const limit = 1000;
      while (true) {
        const res = await supabaseFetch(
          `/rest/v1/${tableName}?select=*&order=created_at.asc&limit=${limit}&offset=${from}`
        );
        const data = await res.json();
        if (!data.length) break;
        allData = allData.concat(data);
        from += limit;
        if (data.length < limit) break;
      }
      const dexieTable = db.table(tableName);
      await dexieTable.clear();
      if (allData.length) {
        await dexieTable.bulkPut(allData);
      }
    }
    await updateSyncMeta('last_full_sync', new Date().toISOString());
    localStorage.setItem('finca_sync_complete', 'true');
    onSyncStatusChange?.(null);
  } catch (err) {
    console.error('fullDownload error:', err);
    onSyncStatusChange?.('Error de conexión');
    setTimeout(() => onSyncStatusChange?.(null), 3000);
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

    onSyncStatusChange?.(`Sincronizando ${queue.length} cambios...`);

    for (const item of queue) {
      try {
        const path = `/rest/v1/${item.table}?id=eq.${encodeURIComponent(item.record_id)}`;
        if (item.action === 'delete') {
          await supabaseFetch(path, { method: 'DELETE' });
        } else if (item.action === 'insert') {
          const body = { ...item.data };
          await supabaseFetch(`/rest/v1/${item.table}`, {
            method: 'POST',
            body: JSON.stringify(body),
          });
        } else if (item.action === 'update') {
          const body = { ...item.data };
          delete body.id;
          delete body.created_at;
          await supabaseFetch(path, {
            method: 'PATCH',
            body: JSON.stringify(body),
          });
        }
        await db._sync_queue.delete(item.id);
      } catch (err) {
        console.warn(`sync queue item ${item.id} failed:`, err);
      }
    }

    onSyncStatusChange?.(null);
  } catch (err) {
    console.error('processSyncQueue error:', err);
    onSyncStatusChange?.(null);
  } finally {
    syncInProgress = false;
  }
}

export async function initSync() {
  const syncComplete = localStorage.getItem('finca_sync_complete');
  const isFirstRun = !syncComplete;

  if (isFirstRun && isOnline()) {
    await fullDownload();
  }

  window.addEventListener('online', async () => {
    await processSyncQueue();
    if (!syncInProgress) {
      const lastSync = await getSyncMeta('last_full_sync');
      if (lastSync) {
        await fullDownload();
      }
    }
  });

  window.__syncPending = () => {
    if (isOnline()) {
      setTimeout(processSyncQueue, 500);
    }
  };

  if (isOnline() && !isFirstRun) {
    setTimeout(processSyncQueue, 1000);
  }
}
