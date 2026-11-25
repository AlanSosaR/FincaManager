import { restFetch } from '../auth.js';
import db from '../db.js';
import { invalidateCache } from '../sync.js';

const REMOVED_PREFIX = 'dp_removed_work_days_v1_';
const CUSTOM_WORK_PREFIX = 'dp_custom_work_';

function removedKey(empresaId, personalId) {
  return `${REMOVED_PREFIX}${empresaId || 'default'}_${personalId}`;
}

function normFlagText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function getWeekBoundsIso(dateIso) {
  const parts = String(dateIso || '').slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) return { wsIso: '', weIso: '' };
  const s = new Date(parts[0], parts[1] - 1, parts[2]);
  const dow = (s.getDay() + 6) % 7;
  s.setDate(s.getDate() - dow);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  const fmt = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { wsIso: fmt(s), weIso: fmt(e) };
}

function parseIdsList(raw) {
  if (Array.isArray(raw)) return raw.map(String);
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch (_) {}
  }
  return [];
}

function formatWeekTitleShort(wsIso) {
  const p = String(wsIso || '').slice(0, 10).split('-').map(Number);
  if (p.length !== 3 || !p[0] || !p[1] || !p[2]) return '';
  const s = new Date(p[0], p[1] - 1, p[2]);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  const mS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  if (s.getFullYear() !== e.getFullYear()) {
    return `${s.getDate()} ${mS[s.getMonth()]} ${s.getFullYear()} – ${e.getDate()} ${mS[e.getMonth()]} ${e.getFullYear()}`;
  }
  if (s.getMonth() !== e.getMonth()) {
    return `${s.getDate()} ${mS[s.getMonth()]} – ${e.getDate()} ${mS[e.getMonth()]} ${e.getFullYear()}`;
  }
  return `${s.getDate()} – ${e.getDate()} ${mS[e.getMonth()]} ${e.getFullYear()}`;
}

export function getRemovedWorkDaysSet(empresaId, personalId) {
  if (!personalId) return new Set();
  try {
    const raw = localStorage.getItem(removedKey(empresaId, personalId));
    const parsed = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(parsed) ? parsed.map(x => String(x || '').slice(0, 10)).filter(Boolean) : []);
  } catch (_) {
    return new Set();
  }
}

export function isWorkDayRemoved(empresaId, personalId, dateStr) {
  const iso = String(dateStr || '').slice(0, 10);
  if (!iso || !personalId) return false;
  return getRemovedWorkDaysSet(empresaId, personalId).has(iso);
}

export function markWorkDayRemoved(empresaId, personalId, dateStr) {
  const iso = String(dateStr || '').slice(0, 10);
  if (!iso || !personalId) return;
  const set = getRemovedWorkDaysSet(empresaId, personalId);
  set.add(iso);
  try {
    localStorage.setItem(removedKey(empresaId, personalId), JSON.stringify([...set]));
  } catch (_) {}
}

export function unmarkWorkDayRemoved(empresaId, personalId, dateStr) {
  const iso = String(dateStr || '').slice(0, 10);
  if (!iso || !personalId) return;
  const set = getRemovedWorkDaysSet(empresaId, personalId);
  if (!set.has(iso)) return;
  set.delete(iso);
  try {
    if (set.size === 0) localStorage.removeItem(removedKey(empresaId, personalId));
    else localStorage.setItem(removedKey(empresaId, personalId), JSON.stringify([...set]));
  } catch (_) {}
}

export function clearCustomWorkDay(empresaId, personalId, dateStr) {
  const iso = String(dateStr || '').slice(0, 10);
  if (!iso || !personalId) return;
  const key = `${CUSTOM_WORK_PREFIX}${empresaId || 'default'}_${personalId}`;
  try {
    const raw = localStorage.getItem(key);
    const map = raw ? JSON.parse(raw) : null;
    if (map && typeof map === 'object' && !Array.isArray(map) && map[iso]) {
      delete map[iso];
      localStorage.setItem(key, JSON.stringify(map));
    }
  } catch (_) {}
}

export function dpFirstName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/).filter(Boolean);
  return parts[0] || '';
}

export function formatLatasShort(val) {
  const n = Math.round((Number(val) || 0) * 4) / 4;
  if (n <= 0) return '0';
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 4);
  const fracStr = frac === 1 ? '¼' : frac === 2 ? '½' : frac === 3 ? '¾' : '';
  if (whole === 0) return fracStr || '0';
  return fracStr ? `${whole} ${fracStr}` : String(whole);
}

/**
 * Elimina todo rastro laboral de un colaborador en una fecha concreta:
 * asistencia, cosecha ([COSECHA_JSON]), gasto semanal asociado si queda en 0
 * o desactualizado, actividades de cafetal/potrero y banderas locales.
 */
export async function removeWorkerDayCompletely({ personalId, personaNombre = '', empresaId = '', dateStr }) {
  const pidStr = String(personalId || '').trim();
  const iso = String(dateStr || '').slice(0, 10);
  if (!pidStr || !iso) return;

  const eid = empresaId || window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
  const normNombre = normFlagText(personaNombre);
  const empFilter = eid ? `empresa_id=eq.${encodeURIComponent(eid)}&` : '';

  const isSameNameToken = (token) => {
    const op = normFlagText(token);
    if (!op || !normNombre || op.includes('@')) return false;
    return op === normNombre || (op.length >= 4 && normNombre.includes(op)) || (normNombre.length >= 4 && op.includes(normNombre));
  };

  const patchLoteAppSafe = async (rowId, patchBody) => {
    try {
      await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${encodeURIComponent(rowId)}`, {
        method: 'PATCH',
        body: JSON.stringify(patchBody)
      });
      try { await db.table('lote_aplicaciones').update(rowId, patchBody); } catch (_) {}
    } catch (err) {
      if ('personal_ids' in patchBody && String(err?.message || err).includes('personal_ids')) {
        const fallback = { ...patchBody };
        delete fallback.personal_ids;
        await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${encodeURIComponent(rowId)}`, {
          method: 'PATCH',
          body: JSON.stringify(fallback)
        });
        try { await db.table('lote_aplicaciones').update(rowId, fallback); } catch (_) {}
      } else {
        throw err;
      }
    }
  };

  // 1. Borrar asistencia del día y flags locales
  await restFetch(`/rest/v1/personal_asistencia?personal_id=eq.${encodeURIComponent(pidStr)}&fecha=eq.${encodeURIComponent(iso)}`, { method: 'DELETE' }).catch(() => {});
  try {
    const localAsis = await db.table('personal_asistencia').where('personal_id').equals(pidStr).toArray();
    for (const row of localAsis) {
      if (String(row.fecha || '').slice(0, 10) === iso && row.id) {
        await db.table('personal_asistencia').delete(row.id);
      }
    }
  } catch (_) {}
  clearCustomWorkDay(eid, pidStr, iso);
  unmarkWorkDayRemoved(eid, pidStr, iso);

  // 2. Limpiar cosecha ([COSECHA_JSON]) y vínculos en actividades de lote_aplicaciones para la fecha
  const affectedCosechaLotes = new Set();
  const dayApps = await restFetch(`/rest/v1/lote_aplicaciones?${empFilter}fecha=eq.${encodeURIComponent(iso)}&select=*`).catch(() => []);

  for (const row of (Array.isArray(dayApps) ? dayApps : [])) {
    if (!row?.id) continue;
    const obsStr = String(row.observaciones || '');

    if (obsStr.startsWith('[COSECHA_JSON]')) {
      let parsed = null;
      try { parsed = JSON.parse(obsStr.slice('[COSECHA_JSON]'.length)); } catch (_) {}
      if (!parsed || !Array.isArray(parsed.registros)) continue;

      const matchesReg = (r) => {
        const rPid = String(r?.personal_id || '').trim();
        const rNom = normFlagText(r?.nombre || '');
        return (pidStr && rPid === pidStr) || (normNombre && rNom && rNom === normNombre);
      };

      if (!parsed.registros.some(matchesReg)) continue;
      if (row.lote_id) affectedCosechaLotes.add(String(row.lote_id));

      const remaining = parsed.registros.filter(r => !matchesReg(r) && (Number(r?.latas) || 0) > 0);
      if (remaining.length === 0) {
        await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${encodeURIComponent(row.id)}`, { method: 'DELETE' });
        try { await db.table('lote_aplicaciones').delete(row.id); } catch (_) {}
      } else {
        const totalLatas = remaining.reduce((s, r) => s + (Number(r.latas) || 0), 0);
        const nextPids = remaining.map(r => r.personal_id).filter(id => id && !String(id).startsWith('extra_'));
        const patchBody = {
          dosis: `${formatLatasShort(totalLatas)} latas`,
          operador: remaining.map(r => r.nombre).filter(Boolean).join(', '),
          personal_ids: Array.isArray(row.personal_ids) ? nextPids : JSON.stringify(nextPids.map(String)),
          observaciones: '[COSECHA_JSON]' + JSON.stringify({ ...parsed, registros: remaining })
        };
        await patchLoteAppSafe(row.id, patchBody);
      }
      continue;
    }

    // Actividades regulares de cafetal
    const curPids = parseIdsList(row.personal_ids);
    const pidMatched = curPids.includes(pidStr);
    const nextPids = curPids.filter(id => id !== pidStr);

    const opTokens = String(row.operador || '').split(',').map(s => s.trim()).filter(Boolean);
    const opMatched = opTokens.some(isSameNameToken);
    const nextOpTokens = opTokens.filter(t => !isSameNameToken(t));

    let obsMatched = false;
    const nextObsLines = [];
    for (const line of obsStr.split('\n')) {
      const m = line.match(/^(\s*(?:👤\s*)?Responsables:\s*)(.+)$/i);
      if (m) {
        const names = m[2].split(',').map(s => s.trim()).filter(Boolean);
        if (names.some(isSameNameToken)) {
          obsMatched = true;
          const kept = names.filter(n => !isSameNameToken(n));
          if (kept.length > 0) nextObsLines.push(`${m[1]}${kept.join(', ')}`);
          continue;
        }
      }
      nextObsLines.push(line);
    }

    if (pidMatched || opMatched || obsMatched) {
      const patchBody = {};
      if (pidMatched) {
        patchBody.personal_ids = Array.isArray(row.personal_ids) ? nextPids : JSON.stringify(nextPids);
      }
      if (opMatched) {
        patchBody.operador = nextOpTokens.length > 0 ? nextOpTokens.join(', ') : null;
      }
      if (obsMatched) {
        patchBody.observaciones = nextObsLines.join('\n').trim();
      }
      await patchLoteAppSafe(row.id, patchBody);
    }
  }

  // 3. Sincronizar / limpiar gasto semanal de Cosecha para cada lote afectado
  if (affectedCosechaLotes.size > 0) {
    const { wsIso, weIso } = getWeekBoundsIso(iso);
    if (wsIso && weIso) {
      const cosGastos = await restFetch(`/rest/v1/gastos?${empFilter}categoria=eq.Cosecha&select=*`).catch(() => []);
      const weekTitle = formatWeekTitleShort(wsIso);

      for (const loteId of affectedCosechaLotes) {
        const weekApps = await restFetch(
          `/rest/v1/lote_aplicaciones?${empFilter}lote_id=eq.${encodeURIComponent(loteId)}&fecha=gte.${wsIso}&fecha=lte.${weIso}&select=id,fecha,observaciones`
        ).catch(() => []);

        let remLatas = 0;
        let remMonto = 0;
        for (const wa of (Array.isArray(weekApps) ? weekApps : [])) {
          const wObs = String(wa?.observaciones || '');
          if (!wObs.startsWith('[COSECHA_JSON]')) continue;
          let wp = null;
          try { wp = JSON.parse(wObs.slice('[COSECHA_JSON]'.length)); } catch (_) {}
          if (!wp || !Array.isArray(wp.registros)) continue;
          const price = Number(wp.precio_lata) || 40;
          for (const r of wp.registros) {
            const rPid = String(r?.personal_id || '').trim();
            const rNom = normFlagText(r?.nombre || '');
            if ((pidStr && rPid === pidStr) || (normNombre && rNom && rNom === normNombre)) {
              const l = Number(r?.latas) || 0;
              if (l > 0) {
                remLatas += l;
                remMonto += l * price;
              }
            }
          }
        }
        remMonto = Math.round(remMonto);

        const matchingGastos = (Array.isArray(cosGastos) ? cosGastos : []).filter((g) => {
          const desc = String(g?.descripcion || '');
          const exactTag = `[ref:cosecha_${loteId}_${pidStr}_${wsIso}]`;
          if (desc.includes(exactTag)) return true;
          const m = desc.match(/\[ref:cosecha_([^_]*)_(.+)_(\d{4}-\d{2}-\d{2})\]/);
          if (!m) return false;
          const gLote = String(m[1] || '');
          const gWorker = String(m[2] || '').trim();
          const gWs = String(m[3] || '');
          const sameLote = !gLote || gLote === String(loteId);
          const sameWorker = gWorker === pidStr || (normNombre && normFlagText(gWorker) === normNombre);
          return sameLote && sameWorker && gWs === wsIso;
        });

        for (const g of matchingGastos) {
          if (!g?.id) continue;
          if (remMonto <= 0) {
            await restFetch(`/rest/v1/gastos?id=eq.${encodeURIComponent(g.id)}`, { method: 'DELETE' });
            try { await db.table('gastos').delete(g.id); } catch (_) {}
          } else if (Math.round(Number(g.monto) || 0) !== remMonto) {
            const desc = String(g.descripcion || '');
            const tagMatch = desc.match(/\[ref:cosecha_[^\]]+\]/);
            const refTag = tagMatch ? tagMatch[0] : `[ref:cosecha_${loteId}_${pidStr}_${wsIso}]`;
            const draftTag = desc.includes('[Por Aprobar]') ? ' [Por Aprobar]' : '';
            const latasTxt = formatLatasShort(remLatas);
            const unitTxt = remLatas === 1 ? 'lata' : 'latas';
            const updatedDesc = `Cosecha ${weekTitle} · ${personaNombre || 'Colaborador'} (${latasTxt} ${unitTxt}) ${refTag}${draftTag}`.trim();
            const patchBody = { monto: remMonto, descripcion: updatedDesc };
            await restFetch(`/rest/v1/gastos?id=eq.${encodeURIComponent(g.id)}`, {
              method: 'PATCH',
              body: JSON.stringify(patchBody)
            });
            try { await db.table('gastos').update(g.id, patchBody); } catch (_) {}
          }
        }
      }
    }
  }

  // 4. Desvincular de potrero_eventos en fecha = iso
  const dayPotEvents = await restFetch(`/rest/v1/potrero_eventos?${empFilter}fecha=eq.${encodeURIComponent(iso)}&select=id,descripcion`).catch(() => []);
  for (const ev of (Array.isArray(dayPotEvents) ? dayPotEvents : [])) {
    if (!ev?.id) continue;
    const rawDesc = String(ev.descripcion || '');
    const pidTag = `[pid:${pidStr}]`;
    const hasPid = rawDesc.includes(pidTag);
    const respMatch = rawDesc.match(/Responsable:\s*([^·\n]+)/i);
    const respNames = respMatch ? respMatch[1].split(',').map(s => s.trim()).filter(Boolean) : [];
    const hasRespName = respNames.some(isSameNameToken);
    if (!hasPid && !hasRespName) continue;

    let updatedDesc = rawDesc.replaceAll(pidTag, '');
    if (hasRespName) {
      const keptResp = respNames.filter(n => !isSameNameToken(n));
      if (keptResp.length > 0) {
        updatedDesc = updatedDesc.replace(/Responsable:\s*([^·\n]+)/i, `Responsable: ${keptResp.join(', ')}`);
      } else {
        updatedDesc = updatedDesc.replace(/\s*·?\s*Responsable:\s*[^·\n]+/i, '');
      }
    }
    updatedDesc = updatedDesc.replace(/^[·\s]+|[·\s]+$/g, '').replace(/\s{2,}/g, ' ').trim();

    await restFetch(`/rest/v1/potrero_eventos?id=eq.${encodeURIComponent(ev.id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ descripcion: updatedDesc })
    }).catch(() => {});
    try { await db.table('potrero_eventos').update(ev.id, { descripcion: updatedDesc }); } catch (_) {}
  }

  // 5. Invalidar cachés locales y vistas en memoria
  if (navigator.onLine) {
    await Promise.all([
      invalidateCache('personal_asistencia'),
      invalidateCache('lote_aplicaciones'),
      invalidateCache('potrero_eventos'),
      invalidateCache('gastos')
    ]);
  }
  ['personal', 'gastos', 'dashboard', 'detalle_lote', 'plan_ifcafe', 'potreros'].forEach(scr => {
    window.clearScreenCache?.(scr);
  });
}
