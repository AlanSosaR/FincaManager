import { supabase } from '../supabase.js';
import { restFetch, loadEmpresaId } from '../auth.js';
import db from '../db.js';
import { syncTable } from '../sync.js';
import {
  isFuelMotor,
  computeFuelMotorStats,
  resolveSharedFuelPrice,
  saveSharedFuelPrice,
  formatLitersLabel,
} from './motor_fuel_config.js';

export function normalizeAreaName(name) {
  return String(name || '')
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

export function getFuelLoadRefTag(loadId) {
  return `[ref:gasolina_${String(loadId || '').trim()}]`;
}

export function getPotreroRefTag(potreroId) {
  return `[ref:potrero_${String(potreroId || '').trim()}]`;
}

export function extractFuelLoadIdFromGasto(gasto) {
  const m = String(gasto?.descripcion || '').match(/\[ref:gasolina_([^\]]+)\]/);
  return m ? m[1].trim() : null;
}

export function extractPotreroIdFromGasto(gasto) {
  const m = String(gasto?.descripcion || '').match(/\[ref:potrero_([^\]]+)\]/);
  return m ? m[1].trim() : null;
}

export function stripGastoInternalTags(desc) {
  return String(desc || '')
    .replace(/\[Por Aprobar\]/g, '')
    .replace(/\[ref:[^\]]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function buildFuelSentMap(gastosList = []) {
  const map = new Map();
  for (const g of (gastosList || [])) {
    const loadId = extractFuelLoadIdFromGasto(g);
    if (loadId && !map.has(loadId)) {
      map.set(loadId, g);
    }
  }
  return map;
}

export function toLocalIsoDate(isoOrDate) {
  if (!isoOrDate) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  const str = String(isoOrDate).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str;
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  }
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resolveEmpresaId() {
  return window._currentEmpresaId || loadEmpresaId() || localStorage.getItem('current_empresa_id') || '';
}

export async function fetchEmpresaGastosFresh() {
  const empId = resolveEmpresaId();
  if (navigator.onLine) {
    try {
      const empFilter = empId ? `empresa_id=eq.${encodeURIComponent(empId)}&` : '';
      const rows = await restFetch(`/rest/v1/gastos?${empFilter}select=*&order=fecha.desc`);
      if (Array.isArray(rows)) {
        if (rows.length) db.gastos.bulkPut(rows).catch(() => {});
        return rows;
      }
    } catch {}
  }
  const res = await supabase.from('gastos').select('*').order('fecha', { ascending: false }).catch(() => ({ data: [] }));
  return Array.isArray(res?.data) ? res.data : [];
}

export async function fetchAreaCatalogs() {
  const empId = resolveEmpresaId();
  const empFilter = empId ? `empresa_id=eq.${encodeURIComponent(empId)}&` : '';
  const fetchTable = async (table) => {
    if (navigator.onLine) {
      try {
        const rows = await restFetch(`/rest/v1/${table}?${empFilter}select=id,nombre`);
        if (Array.isArray(rows)) return rows;
      } catch {}
    }
    const res = await supabase.from(table).select('id, nombre').catch(() => ({ data: [] }));
    return Array.isArray(res?.data) ? res.data : [];
  };
  const [lotes, potreros] = await Promise.all([fetchTable('lotes'), fetchTable('potreros')]);
  return { lotes, potreros };
}

export async function fetchAreaFuelUsage({ areaType, areaId, areaName, existingGastos = null }) {
  const targetNorm = normalizeAreaName(areaName);
  const sentByLoadIdInit = Array.isArray(existingGastos) ? buildFuelSentMap(existingGastos) : null;
  if (!targetNorm) {
    return {
      loads: [],
      pricedLoads: [],
      unpricedLoads: [],
      pendingLoads: [],
      sentLoads: [],
      totalLiters: 0,
      totalCost: 0,
      pendingAmount: 0,
      sentByLoadId: sentByLoadIdInit || new Map(),
    };
  }

  const empId = resolveEmpresaId();
  const empFilter = empId ? `empresa_id=eq.${encodeURIComponent(empId)}&` : '';

  const fetchMotors = async () => {
    if (navigator.onLine) {
      try {
        const rows = await restFetch(`/rest/v1/motores?${empFilter}select=*`);
        if (Array.isArray(rows)) return rows;
      } catch {}
    }
    const res = await supabase.from('motores').select('*').catch(() => ({ data: [] }));
    return Array.isArray(res?.data) ? res.data : [];
  };

  const fetchSesiones = async () => {
    if (navigator.onLine) {
      try {
        const rows = await restFetch(`/rest/v1/motor_sesiones?${empFilter}select=*&order=fecha.desc`);
        if (Array.isArray(rows)) return rows;
      } catch {}
    }
    const res = await supabase.from('motor_sesiones').select('*').order('fecha', { ascending: false }).catch(() => ({ data: [] }));
    return Array.isArray(res?.data) ? res.data : [];
  };

  const [motores, sesiones, gastos] = await Promise.all([
    fetchMotors(),
    fetchSesiones(),
    Array.isArray(existingGastos) ? Promise.resolve(existingGastos) : fetchEmpresaGastosFresh(),
  ]);

  const sentByLoadId = buildFuelSentMap(gastos);
  const sesByMotor = new Map();
  for (const s of (sesiones || [])) {
    if (!s?.motor_id) continue;
    const list = sesByMotor.get(s.motor_id);
    if (list) list.push(s);
    else sesByMotor.set(s.motor_id, [s]);
  }

  const fuelMotors = (motores || []).filter(m => isFuelMotor(m));
  const sharedPrice = resolveSharedFuelPrice(null, fuelMotors, empId);
  if (sharedPrice > 0) saveSharedFuelPrice(empId, sharedPrice);

  const loads = [];
  for (const m of fuelMotors) {
    const fallbackPrice = resolveSharedFuelPrice(m, fuelMotors, empId);
    const stats = computeFuelMotorStats(m, sesByMotor.get(m.id) || [], [], fallbackPrice);
    for (const l of stats.fuelLoads) {
      if (normalizeAreaName(l.hora_fin) !== targetNorm) continue;
      const sentGasto = sentByLoadId.get(String(l.id)) || null;
      const isSent = Boolean(sentGasto);
      const needsUpdate = isSent && Math.abs((Number(sentGasto.monto) || 0) - l._cost) >= 0.01;
      const needsSync = l._cost > 0 && (!isSent || needsUpdate);
      loads.push({
        ...l,
        _motorId: m.id,
        _motorNombre: m.nombre || 'Equipo de gasolina',
        _motorIcon: m.icon || '✂️',
        _areaType: areaType,
        _areaId: areaId,
        _areaName: areaName,
        _sentGasto: sentGasto,
        _isSent: isSent,
        _needsUpdate: needsUpdate,
        _needsSync: needsSync,
      });
    }
  }

  loads.sort((a, b) => new Date(b.fecha || b.created_at || 0) - new Date(a.fecha || a.created_at || 0));

  const pricedLoads = loads.filter(l => l._cost > 0);
  const unpricedLoads = loads.filter(l => l._cost <= 0);
  const pendingLoads = loads.filter(l => l._needsSync);
  const sentLoads = loads.filter(l => l._isSent && !l._needsUpdate);
  const totalLiters = Math.round(loads.reduce((s, l) => s + l._liters, 0) * 10) / 10;
  const totalCost = Math.round(loads.reduce((s, l) => s + l._cost, 0) * 100) / 100;
  const pendingAmount = Math.round(pendingLoads.reduce((s, l) => s + l._cost, 0) * 100) / 100;

  return {
    loads,
    pricedLoads,
    unpricedLoads,
    pendingLoads,
    sentLoads,
    totalLiters,
    totalCost,
    pendingAmount,
    sentByLoadId,
  };
}

export async function sendFuelLoadsToCuentas({
  loads = [],
  motor = null,
  lotes = null,
  potreros = null,
  sentByLoadId = null,
} = {}) {
  const empId = resolveEmpresaId();
  if (!empId) {
    throw new Error('No se encontró la finca activa');
  }

  const catalogs = (lotes && potreros) ? { lotes, potreros } : await fetchAreaCatalogs();
  const resolvedSentMap = sentByLoadId
    ? new Map(sentByLoadId)
    : buildFuelSentMap(await fetchEmpresaGastosFresh());

  const loteByNormName = new Map();
  const loteById = new Map();
  for (const l of (catalogs.lotes || [])) {
    if (!l?.id) continue;
    loteById.set(String(l.id), l);
    const nk = normalizeAreaName(l.nombre);
    if (nk && !loteByNormName.has(nk)) loteByNormName.set(nk, l);
  }

  const potreroByNormName = new Map();
  const potreroById = new Map();
  for (const p of (catalogs.potreros || [])) {
    if (!p?.id) continue;
    potreroById.set(String(p.id), p);
    const nk = normalizeAreaName(p.nombre);
    if (nk && !potreroByNormName.has(nk)) potreroByNormName.set(nk, p);
  }

  let createdCount = 0;
  let updatedCount = 0;
  let totalSentAmount = 0;

  for (const load of (loads || [])) {
    if (!load?.id) continue;
    const liters = Math.max(0, parseFloat(load._liters ?? load.total_horas) || 0);
    const cost = Math.round((Number(load._cost) || 0) * 100) / 100;
    if (!(cost > 0)) continue;

    let matchedLote = null;
    if (load._areaType === 'lote' && load._areaId) {
      matchedLote = loteById.get(String(load._areaId)) || { id: load._areaId, nombre: load._areaName || '' };
    } else if (load.hora_fin) {
      matchedLote = loteByNormName.get(normalizeAreaName(load.hora_fin)) || null;
    }

    let matchedPotrero = null;
    if (!matchedLote) {
      if (load._areaType === 'potrero' && load._areaId) {
        matchedPotrero = potreroById.get(String(load._areaId)) || { id: load._areaId, nombre: load._areaName || '' };
      } else if (load.hora_fin) {
        matchedPotrero = potreroByNormName.get(normalizeAreaName(load.hora_fin)) || null;
      }
    }

    const loc = String(load.hora_fin || '').trim();
    const motorNombre = load._motorNombre || motor?.nombre || 'Equipo';
    const areaSuffix = !matchedLote && !matchedPotrero && loc ? ` · ${loc}` : '';
    const potreroTag = matchedPotrero ? ` ${getPotreroRefTag(matchedPotrero.id)}` : '';
    const refTag = getFuelLoadRefTag(load.id);
    const descripcion = `Gasolina · ${motorNombre} (${formatLitersLabel(liters)})${areaSuffix}${potreroTag} ${refTag}`;
    const fecha = toLocalIsoDate(load.fecha || load.created_at);
    const loteId = matchedLote ? matchedLote.id : null;

    const existing = resolvedSentMap.get(String(load.id));
    if (!existing) {
      const payload = {
        empresa_id: empId,
        fecha,
        categoria: 'Maquinaria',
        descripcion,
        monto: cost,
        lote_id: loteId,
      };
      let savedRow = null;
      try {
        const res = await restFetch('/rest/v1/gastos', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        savedRow = Array.isArray(res) ? res[0] : res;
      } catch (err) {
        const { data, error } = await supabase.from('gastos').insert([payload]);
        if (error) throw error || err;
        savedRow = Array.isArray(data) ? data[0] : data;
      }
      if (savedRow?.id) {
        await db.gastos.put(savedRow).catch(() => {});
        resolvedSentMap.set(String(load.id), savedRow);
      }
      createdCount += 1;
      totalSentAmount = Math.round((totalSentAmount + cost) * 100) / 100;
    } else {
      const prevMonto = Number(existing.monto) || 0;
      const prevLote = existing.lote_id ? String(existing.lote_id) : '';
      const nextLote = loteId ? String(loteId) : '';
      if (Math.abs(prevMonto - cost) >= 0.01 || prevLote !== nextLote || existing.descripcion !== descripcion) {
        const patch = {
          fecha,
          categoria: 'Maquinaria',
          descripcion,
          monto: cost,
          lote_id: loteId,
        };
        let savedRow = null;
        try {
          const res = await restFetch(`/rest/v1/gastos?id=eq.${encodeURIComponent(existing.id)}`, {
            method: 'PATCH',
            body: JSON.stringify(patch),
          });
          savedRow = Array.isArray(res) ? res[0] : res;
        } catch (err) {
          const { data, error } = await supabase.from('gastos').update(patch).eq('id', existing.id);
          if (error) throw error || err;
          savedRow = Array.isArray(data) ? data[0] : data;
        }
        const merged = savedRow?.id ? savedRow : { ...existing, ...patch };
        await db.gastos.put(merged).catch(() => {});
        resolvedSentMap.set(String(load.id), merged);
        updatedCount += 1;
        totalSentAmount = Math.round((totalSentAmount + cost) * 100) / 100;
      }
    }
  }

  if (navigator.onLine) {
    await syncTable('gastos', true).catch(() => {});
  }
  window.clearScreenCache?.('gastos');

  return {
    createdCount,
    updatedCount,
    totalSentAmount,
    sentByLoadId: resolvedSentMap,
  };
}

export function getWeekMondayIso(isoStr) {
  const m = String(isoStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0) : new Date();
  if (Number.isNaN(d.getTime())) return toLocalIsoDate();
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const WEEK_MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

function formatWeekRangeCompact(wsIso) {
  const m = String(wsIso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return '';
  const startDt = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  if (Number.isNaN(startDt.getTime())) return '';
  const endDt = new Date(startDt.getFullYear(), startDt.getMonth(), startDt.getDate() + 6, 12, 0, 0);
  const d1 = startDt.getDate();
  const m1 = WEEK_MONTHS_SHORT[startDt.getMonth()];
  const d2 = endDt.getDate();
  const m2 = WEEK_MONTHS_SHORT[endDt.getMonth()];
  return startDt.getMonth() === endDt.getMonth()
    ? `Semana ${d1} – ${d2} ${m1}`
    : `Semana ${d1} ${m1} – ${d2} ${m2}`;
}

export function getWeeklyExpenseGroupInfo(g) {
  if (!g) return null;
  const rawDesc = String(g.descripcion || '');
  const rawCatLow = String(g.categoria || '').trim().toLowerCase();

  const cosRefMatch = rawDesc.match(/\[ref:cosecha_[^\]]*_(\d{4}-\d{2}-\d{2})\]/);
  if (cosRefMatch) {
    const weekStartIso = cosRefMatch[1];
    return { isWeekly: true, kind: 'cosecha', weekStartIso, label: formatWeekRangeCompact(weekStartIso) };
  }

  const perSemMatch = rawDesc.match(/\[ref:[^\]]*_sem_(\d{4}-\d{2}-\d{2})\]/);
  if (perSemMatch) {
    const weekStartIso = perSemMatch[1];
    return { isWeekly: true, kind: 'personal', weekStartIso, label: formatWeekRangeCompact(weekStartIso) };
  }

  const cleanDesc = stripGastoInternalTags(rawDesc);
  if (rawCatLow === 'cosecha' || /^cosecha\s+semana\b/i.test(cleanDesc)) {
    const fechaIso = toLocalIsoDate(g.fecha || g.created_at);
    const weekStartIso = getWeekMondayIso(fechaIso);
    return { isWeekly: true, kind: 'cosecha', weekStartIso, label: formatWeekRangeCompact(weekStartIso) };
  }

  return null;
}

export async function fetchLotePendingLabor({ loteId, loteNombre = '', existingGastos = null } = {}) {
  const emptyRes = {
    items: [],
    pendingItems: [],
    unpricedItems: [],
    pendingAmount: 0,
    totalAmount: 0,
  };
  if (!loteId) return emptyRes;

  const empId = resolveEmpresaId();
  const empFilter = empId ? `empresa_id=eq.${encodeURIComponent(empId)}&` : '';

  const fetchLoteApps = async () => {
    if (navigator.onLine) {
      try {
        const rows = await restFetch(`/rest/v1/lote_aplicaciones?${empFilter}lote_id=eq.${encodeURIComponent(loteId)}&select=*`);
        if (Array.isArray(rows)) return rows;
      } catch {}
    }
    const res = await supabase.from('lote_aplicaciones').select('*').catch(() => ({ data: [] }));
    const list = Array.isArray(res?.data) ? res.data : [];
    return list.filter(a => String(a.lote_id) === String(loteId));
  };

  const fetchPersonal = async () => {
    if (navigator.onLine) {
      try {
        const rows = await restFetch(`/rest/v1/personal?${empFilter}select=id,nombre,pago_diario`);
        if (Array.isArray(rows)) return rows;
      } catch {}
    }
    const res = await supabase.from('personal').select('id, nombre, pago_diario').catch(() => ({ data: [] }));
    return Array.isArray(res?.data) ? res.data : [];
  };

  const [apps, personalRows, gastos] = await Promise.all([
    fetchLoteApps(),
    fetchPersonal(),
    Array.isArray(existingGastos) ? Promise.resolve(existingGastos) : fetchEmpresaGastosFresh(),
  ]);

  const personalById = new Map();
  const personalByNormName = new Map();
  for (const p of (personalRows || [])) {
    if (!p?.id) continue;
    personalById.set(String(p.id), p);
    const nk = normalizeAreaName(p.nombre);
    if (nk && !personalByNormName.has(nk)) personalByNormName.set(nk, p);
  }

  const todayIso = toLocalIsoDate();
  const personalDayMap = new Map();

  for (const app of (apps || [])) {
    if (!app) continue;
    if (String(app.observaciones || '').startsWith('[COSECHA_JSON]')) continue;
    const fecha = String(app.fecha || '').slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    const estado = String(app.estado || '');
    const isPerformed = estado === 'Aplicada' || estado === 'Realizada' || (fecha <= todayIso && estado !== 'Cancelada');
    if (!isPerformed) continue;

    const matchedWorkers = new Map();
    let rawPids = app.personal_ids;
    if (typeof rawPids === 'string') {
      try { rawPids = JSON.parse(rawPids); } catch { rawPids = []; }
    }
    if (Array.isArray(rawPids)) {
      for (const pid of rawPids) {
        const pObj = personalById.get(String(pid));
        if (pObj) matchedWorkers.set(String(pObj.id), pObj);
      }
    }
    let rawOpStr = String(app.operador || '').trim();
    if (!rawOpStr && app.observaciones && String(app.observaciones).includes('Responsables:')) {
      const m = String(app.observaciones).match(/Responsables:\s*([^\n]+)/);
      if (m) rawOpStr = m[1].trim();
    }
    const opNames = rawOpStr
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
    for (const rawName of opNames) {
      const nk = normalizeAreaName(rawName);
      if (!nk) continue;
      let pObj = personalByNormName.get(nk);
      if (!pObj) {
        for (const p of (personalRows || [])) {
          const pk = normalizeAreaName(p.nombre);
          if (pk && (pk === nk || pk.includes(nk) || nk.includes(pk))) {
            pObj = p;
            break;
          }
        }
      }
      if (pObj) matchedWorkers.set(String(pObj.id), pObj);
    }

    if (matchedWorkers.size === 0) continue;
    const laborLabel = String(app.producto || app.tipo || 'Labor en lote').trim() || 'Labor en lote';

    for (const [pId, pObj] of matchedWorkers.entries()) {
      const key = `${pId}__${fecha}`;
      if (!personalDayMap.has(key)) {
        personalDayMap.set(key, {
          personalId: pId,
          nombre: pObj.nombre || 'Colaborador',
          pagoDiario: Math.max(0, Math.round((Number(pObj.pago_diario) || 0) * 100) / 100),
          fecha,
          labores: new Set(),
        });
      }
      personalDayMap.get(key).labores.add(laborLabel);
    }
  }

  const personalGastos = (gastos || []).filter(g => String(g.categoria || '').toLowerCase() === 'personal');
  const items = [];
  for (const entry of personalDayMap.values()) {
    const dayRefTag = `[ref:${entry.personalId}_dia_${entry.fecha}]`;
    const weekRefTag = `[ref:${entry.personalId}_sem_${getWeekMondayIso(entry.fecha)}]`;
    const hasWeekGasto = personalGastos.some(g => String(g.descripcion || '').includes(weekRefTag));
    const sentDayGasto = personalGastos.find(g => String(g.descripcion || '').includes(dayRefTag)) || null;

    let isSent = false;
    let needsUpdate = false;
    let needsSync = false;

    if (hasWeekGasto) {
      isSent = true;
    } else if (sentDayGasto) {
      isSent = true;
      needsUpdate = Math.abs((Number(sentDayGasto.monto) || 0) - entry.pagoDiario) >= 0.01;
      needsSync = entry.pagoDiario > 0 && needsUpdate;
    } else {
      needsSync = entry.pagoDiario > 0;
    }

    items.push({
      personalId: entry.personalId,
      nombre: entry.nombre,
      pagoDiario: entry.pagoDiario,
      fecha: entry.fecha,
      labores: Array.from(entry.labores),
      dayRefTag,
      weekRefTag,
      _sentGasto: sentDayGasto,
      _coveredByWeek: hasWeekGasto,
      _isSent: isSent,
      _needsUpdate: needsUpdate,
      _needsSync: needsSync,
    });
  }

  items.sort((a, b) => b.fecha.localeCompare(a.fecha) || a.nombre.localeCompare(b.nombre, 'es'));

  const pendingItems = items.filter(it => it._needsSync);
  const unpricedItems = items.filter(it => it.pagoDiario <= 0);
  const pendingAmount = Math.round(pendingItems.reduce((s, it) => s + it.pagoDiario, 0) * 100) / 100;
  const totalAmount = Math.round(items.reduce((s, it) => s + it.pagoDiario, 0) * 100) / 100;

  return {
    items,
    pendingItems,
    unpricedItems,
    pendingAmount,
    totalAmount,
  };
}

export async function sendLoteLaborToCuentas({ items = [], loteId, loteNombre = '' } = {}) {
  const empId = resolveEmpresaId();
  if (!empId) {
    throw new Error('No se encontró la finca activa');
  }

  let createdCount = 0;
  let updatedCount = 0;
  let totalSentAmount = 0;

  for (const item of (items || [])) {
    if (!item?.personalId || !(item.pagoDiario > 0)) continue;
    const monto = Math.round(item.pagoDiario * 100) / 100;
    const laboresTxt = (Array.isArray(item.labores) ? item.labores : []).join(', ') || 'Labor en lote';
    const dayRefTag = item.dayRefTag || `[ref:${item.personalId}_dia_${item.fecha}]`;
    const descripcion = `Jornal Diario: ${item.nombre} (${laboresTxt} · L ${Math.round(monto).toLocaleString('es-HN')}/día) ${dayRefTag}`;

    if (item._sentGasto?.id) {
      const patch = {
        monto,
        descripcion,
        fecha: item.fecha,
        lote_id: loteId || item._sentGasto.lote_id || null,
      };
      let savedRow = null;
      try {
        const res = await restFetch(`/rest/v1/gastos?id=eq.${encodeURIComponent(item._sentGasto.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(patch),
        });
        savedRow = Array.isArray(res) ? res[0] : res;
      } catch (err) {
        const { data, error } = await supabase.from('gastos').update(patch).eq('id', item._sentGasto.id);
        if (error) throw error || err;
        savedRow = Array.isArray(data) ? data[0] : data;
      }
      const merged = savedRow?.id ? savedRow : { ...item._sentGasto, ...patch };
      await db.gastos.put(merged).catch(() => {});
      updatedCount += 1;
      totalSentAmount = Math.round((totalSentAmount + monto) * 100) / 100;
    } else {
      const payload = {
        empresa_id: empId,
        fecha: item.fecha,
        categoria: 'Personal',
        descripcion,
        monto,
        lote_id: loteId || null,
      };
      let savedRow = null;
      try {
        const res = await restFetch('/rest/v1/gastos', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        savedRow = Array.isArray(res) ? res[0] : res;
      } catch (err) {
        const { data, error } = await supabase.from('gastos').insert([payload]);
        if (error) throw error || err;
        savedRow = Array.isArray(data) ? data[0] : data;
      }
      if (savedRow?.id) {
        await db.gastos.put(savedRow).catch(() => {});
      }
      createdCount += 1;
      totalSentAmount = Math.round((totalSentAmount + monto) * 100) / 100;
    }
  }

  if (navigator.onLine) {
    await syncTable('gastos', true).catch(() => {});
  }
  window.clearScreenCache?.('gastos');
  window.clearScreenCache?.('personal');

  return {
    createdCount,
    updatedCount,
    totalSentAmount,
  };
}
