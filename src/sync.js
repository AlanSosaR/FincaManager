import { getAccessToken } from './auth.js';
import db from './db.js';

let syncInProgress = false;

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || 'https://udhuizkqnmkhljmezzkd.supabase.co';
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkaHVpemtxbm1raGxqbWV6emtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTM2MTYsImV4cCI6MjA5MTIyOTYxNn0.W9bJ1S8A45RUGaulhdVG6UohGmGNxGMjLBsc0Q7voPE';

const SUPABASE_TABLES = [
  'motores', 'motor_sesiones', 'motor_mantenimientos',
  'potreros', 'ganado', 'herramientas', 'potrero_eventos',
  'animal_pesajes', 'animal_vacunas', 'animal_fumigaciones', 'animal_ventas',
  'herramienta_mantenimientos', 'lotes', 'lote_aplicaciones',
  'lote_personal', 'personal', 'personal_asistencia',
  'usuarios', 'empresas', 'usuario_empresas', 'invitaciones',
];

const BUSINESS_TABLES = new Set([
  'motores', 'motor_sesiones', 'motor_mantenimientos',
  'potreros', 'ganado', 'herramientas', 'potrero_eventos',
  'animal_pesajes', 'animal_vacunas', 'animal_fumigaciones', 'animal_ventas',
  'herramienta_mantenimientos', 'lotes', 'lote_aplicaciones',
  'lote_personal', 'personal', 'personal_asistencia',
]);

export async function supabaseFetch(path, options = {}) {
  const res = await fetch(`${SUPABASE_URL}${path}`, {
    headers: {
      'apikey': SUPABASE_KEY,
      'Authorization': `Bearer ${getAccessToken() || SUPABASE_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=representation',
      ...options.headers,
    },
    ...options,
  });
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

export async function fullDownload() {
  if (syncInProgress) return;
  syncInProgress = true;
  try {
    const pendingIds = new Map();
    const pending = await db._sync_queue.toArray();
    for (const item of pending) {
      if (item.action === 'insert') {
        if (!pendingIds.has(item.table)) pendingIds.set(item.table, new Set());
        pendingIds.get(item.table).add(item.record_id);
      }
    }

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

        for (const localId of localIds) {
          if (!serverIds.has(localId) && (!protectIds || !protectIds.has(localId))) {
            await dexieTable.delete(localId);
          }
        }

        if (allData.length) {
          await dexieTable.bulkPut(allData);
        }
      } catch (tableErr) {
        console.warn(`fullDownload: error en tabla ${tableName}, continuando...`, tableErr);
      }
    }
    await updateSyncMeta('last_full_sync', new Date().toISOString());
  } catch (err) {
    console.error('fullDownload error:', err);
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

export async function syncTable(tableName) {
  if (!isOnline()) return;
  if (!SUPABASE_TABLES.includes(tableName)) return;
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
    for (const localId of localIds) {
      if (!serverIds.has(localId)) {
        await dexieTable.delete(localId);
      }
    }
    if (allData.length) {
      await dexieTable.bulkPut(allData);
    }
  } catch (err) {
    console.warn(`syncTable: error en ${tableName}`, err);
  }
}

export async function incrementalSync() {
  if (!isOnline()) return;
  const tables = [...BUSINESS_TABLES];
  await Promise.all(tables.map(t => syncTable(t)));
}
