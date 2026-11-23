import { restFetch, restInsert } from '../auth.js';
import { supabase } from '../supabase.js';
import db from '../db.js';
import { parsePersonalGasto } from './gastos.js';
import { showModal, closeModal } from '../modals.js';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DAYS_FULL = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function isTrabajo(e) {
  if (!e) return false;
  const s = String(e).toLowerCase().trim();
  return s === 'trabajo' || s === 'presente' || s === 'asistio' || s === 'asistió' || s === 'si' || s === 'sí' || s === 'p' || s === 't' || s === '1' || s === 'activo';
}

function isDescanso(e) {
  if (!e) return false;
  const s = String(e).toLowerCase().trim();
  return s === 'descanso' || s === 'ausente' || s === 'falto' || s === 'faltó' || s === 'no' || s === 'a' || s === 'd' || s === '0' || s === 'inactivo';
}

function dpEscapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function dpNormText(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

function dpStripTags(s) {
  return String(s || '')
    .replace(/\[ref:[^\]]+\]/gi, '')
    .replace(/\[pid:[^\]]+\]/gi, '')
    .replace(/\[Por Aprobar\]/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function getCustomWorkKey(empresaId, personalId) {
  return `dp_custom_work_${empresaId || 'default'}_${personalId}`;
}

function getCustomWorkMap(empresaId, personalId) {
  try {
    const raw = localStorage.getItem(getCustomWorkKey(empresaId, personalId));
    const parsed = raw ? JSON.parse(raw) : {};
    return (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) ? parsed : {};
  } catch (_) {
    return {};
  }
}

function saveCustomWorkItem(empresaId, personalId, dateStr, desc) {
  const map = getCustomWorkMap(empresaId, personalId);
  const arr = Array.isArray(map[dateStr]) ? map[dateStr] : [];
  arr.push({ tipo: 'Otra labor', producto: String(desc || '').trim(), lote_nombre: '', source: 'otro' });
  map[dateStr] = arr;
  try { localStorage.setItem(getCustomWorkKey(empresaId, personalId), JSON.stringify(map)); } catch (_) {}
}

function clearCustomWorkDate(empresaId, personalId, dateStr) {
  const map = getCustomWorkMap(empresaId, personalId);
  if (map[dateStr]) {
    delete map[dateStr];
    try { localStorage.setItem(getCustomWorkKey(empresaId, personalId), JSON.stringify(map)); } catch (_) {}
  }
}

const ESTADO_PAIRS = [
  { work: 'trabajo', rest: 'descanso' },
  { work: 'Presente', rest: 'Ausente' },
  { work: 'presente', rest: 'ausente' },
  { work: 'Trabajo', rest: 'Descanso' },
  { work: 'Asistió', rest: 'Faltó' },
  { work: 'asistio', rest: 'falto' },
  { work: 'asistió', rest: 'faltó' },
  { work: 'PRESENTE', rest: 'AUSENTE' },
  { work: 'TRABAJO', rest: 'DESCANSO' },
];

let preferredPairIndex = parseInt(localStorage.getItem('asistencia_pair_idx') || '0', 10);
if (isNaN(preferredPairIndex) || preferredPairIndex < 0 || preferredPairIndex >= ESTADO_PAIRS.length) {
  preferredPairIndex = 0;
}

async function persistAsistencia(personalId, empresaId, dateStr, wantWork) {
  const existentes = await restFetch(`/rest/v1/personal_asistencia?personal_id=eq.${encodeURIComponent(personalId)}&fecha=eq.${dateStr}&select=*`).catch(() => []);
  const existente = (Array.isArray(existentes) ? existentes[0] : existentes) || null;

  const order = [preferredPairIndex, ...ESTADO_PAIRS.map((_, i) => i).filter(i => i !== preferredPairIndex)];
  let lastErr = null;

  for (const idx of order) {
    const pair = ESTADO_PAIRS[idx];
    const targetEstado = wantWork ? pair.work : pair.rest;

    try {
      if (existente) {
        await restFetch(`/rest/v1/personal_asistencia?id=eq.${existente.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ estado: targetEstado }),
        });
      } else {
        await restInsert('/rest/v1/personal_asistencia', {
          personal_id: personalId,
          empresa_id: empresaId,
          fecha: dateStr,
          estado: targetEstado,
        });
      }
      preferredPairIndex = idx;
      localStorage.setItem('asistencia_pair_idx', String(idx));
      return targetEstado;
    } catch (err) {
      lastErr = err;
      const msg = err?.message || String(err);
      if (msg.includes('personal_asistencia_estado_check')) {
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}

/** Build actividadesMap: { [fecha]: [{tipo, producto, lote_nombre, source}] } for a personal */
async function fetchActividadesMap(personalId, empresaId, personaNombre) {
  try {
    const eid = empresaId || window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
    if (!eid) return {};

    const todayStr = fmtDate(new Date());
    const normNombre = dpNormText(personaNombre);

    const [apps, potEventos, potreros] = await Promise.all([
      restFetch(
        `/rest/v1/lote_aplicaciones?empresa_id=eq.${eid}&select=id,fecha,tipo,producto,personal_ids,operador,lote_id,estado,observaciones`
      ).catch(async () => {
        return await restFetch(
          `/rest/v1/lote_aplicaciones?empresa_id=eq.${eid}&select=id,fecha,tipo,producto,operador,lote_id,estado,observaciones`
        ).catch(() => []);
      }),
      restFetch(`/rest/v1/potrero_eventos?empresa_id=eq.${eid}&select=id,potrero_id,fecha,evento,descripcion,icon`).catch(() => []),
      restFetch(`/rest/v1/potreros?empresa_id=eq.${eid}&select=id,nombre`).catch(() => [])
    ]);

    const loteIds = [...new Set((apps || []).map(a => a.lote_id).filter(Boolean))];
    let loteMap = {};
    if (loteIds.length) {
      const lotes = await restFetch(`/rest/v1/lotes?id=in.(${loteIds.join(',')})&select=id,nombre`).catch(() => []);
      (lotes || []).forEach(l => { loteMap[l.id] = l.nombre; });
    }

    const potreroMap = {};
    (potreros || []).forEach(pt => {
      if (pt?.id) potreroMap[pt.id] = pt.nombre || '';
    });

    const matchesNameList = (rawOp, rawObs = '') => {
      if (!normNombre) return false;
      let str = String(rawOp || '').trim();
      if (!str && rawObs) {
        const m = String(rawObs).match(/Responsables:\s*([^\n]+)/i);
        if (m) str = m[1].trim();
      }
      if (!str) return false;
      const ops = str.split(',').map(s => dpNormText(s)).filter(s => s && !s.includes('@'));
      return ops.some(op => op === normNombre || (op.length >= 4 && normNombre.includes(op)) || (normNombre.length >= 4 && op.includes(normNombre)));
    };

    const map = {};

    (apps || []).forEach(a => {
      if (String(a.observaciones || '').startsWith('[COSECHA_JSON]')) return;
      const fecha = (a.fecha || '').slice(0, 10);
      if (!fecha) return;
      const est = String(a.estado || '');
      const ok = est === 'Aplicada' || est === 'Realizada' || (fecha <= todayStr && est !== 'Cancelada');
      if (!ok) return;

      let pids = [];
      if (Array.isArray(a.personal_ids)) {
        pids = a.personal_ids.map(String);
      } else if (typeof a.personal_ids === 'string') {
        try {
          const parsed = JSON.parse(a.personal_ids);
          if (Array.isArray(parsed)) pids = parsed.map(String);
        } catch (e) {}
      }
      const hasId = pids.includes(String(personalId));
      const hasNombre = matchesNameList(a.operador, a.observaciones);
      if (!hasId && !hasNombre) return;

      if (!map[fecha]) map[fecha] = [];
      map[fecha].push({ tipo: a.tipo, producto: a.producto, lote_nombre: loteMap[a.lote_id] || '', source: 'cafetal' });
    });

    (potEventos || []).forEach(ev => {
      const fecha = (ev.fecha || '').slice(0, 10);
      if (!fecha || fecha > todayStr) return;
      const descRaw = String(ev.descripcion || '');
      const hasPid = descRaw.includes(`[pid:${personalId}]`);
      const respMatch = descRaw.match(/Responsable:\s*([^·\n]+)/i);
      const hasResp = respMatch ? matchesNameList(respMatch[1], '') : false;
      if (!hasPid && !hasResp) return;
      const cleanDetail = dpStripTags(descRaw.replace(/Responsable:\s*[^·\n]+/gi, '')).replace(/^[·\-\s]+|[·\-\s]+$/g, '');
      if (!map[fecha]) map[fecha] = [];
      map[fecha].push({
        tipo: ev.evento || 'Labor en potrero',
        producto: cleanDetail,
        lote_nombre: potreroMap[ev.potrero_id] || '',
        source: 'potrero'
      });
    });

    const customMap = getCustomWorkMap(eid, personalId);
    Object.entries(customMap).forEach(([f, list]) => {
      if (!f || !Array.isArray(list) || !list.length) return;
      if (!map[f]) map[f] = [];
      list.forEach(it => {
        map[f].push({
          tipo: it.tipo || 'Otra labor',
          producto: it.producto || '',
          lote_nombre: it.lote_nombre || '',
          source: it.source || 'otro'
        });
      });
    });

    return map;
  } catch(e) {
    console.warn('fetchActividadesMap error:', e);
    return {};
  }
}

async function fetchGastosPersonal() {
  try {
    const eid = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
    const path = eid
      ? `/rest/v1/gastos?categoria=in.(Personal,Cosecha)&empresa_id=eq.${eid}&order=fecha.desc&select=*`
      : `/rest/v1/gastos?categoria=in.(Personal,Cosecha)&order=fecha.desc&select=*`;
    const res = await restFetch(path).catch(() => null);
    if (Array.isArray(res)) return res;
    const local = await supabase.from('gastos').select('*').catch(() => ({ data: [] }));
    return (local?.data || []).filter(g => ['personal', 'cosecha'].includes(String(g?.categoria || '').toLowerCase()));
  } catch (e) {
    console.warn('fetchGastosPersonal error:', e);
    return [];
  }
}

function extractWorkerPaidMovs(allGastos, personalId, personaNombre) {
  const pidStr = String(personalId || '').trim();
  const normNombre = dpNormText(personaNombre);
  const out = [];
  for (const g of (allGastos || [])) {
    if (!g) continue;
    const desc = String(g.descripcion || '');
    if (desc.includes('[Por Aprobar]')) continue;
    const catLow = String(g.categoria || '').toLowerCase();
    if (catLow === 'personal') {
      const hasAnyRef = /\[ref:[^\]]+\]/.test(desc);
      let matches = false;
      if (hasAnyRef) {
        matches = Boolean(pidStr && desc.includes(`[ref:${pidStr}_`));
      } else if (normNombre) {
        matches = dpNormText(desc).includes(normNombre);
      }
      if (!matches) continue;
      const refMatch = desc.match(/\[ref:[^\]_]+_(dia|sem|mes)_([0-9_-]+)\]/i);
      out.push({
        ...g,
        _kind: 'personal',
        _refKind: refMatch ? refMatch[1].toLowerCase() : '',
        _refDate: refMatch ? refMatch[2] : ''
      });
    } else if (catLow === 'cosecha') {
      const m = desc.match(/\[ref:cosecha_[^_]+_(.+)_(\d{4}-\d{2}-\d{2})\]/);
      if (!m) continue;
      const workerKey = String(m[1] || '').trim();
      const matchesId = Boolean(pidStr && workerKey === pidStr);
      const matchesName = Boolean(normNombre && dpNormText(workerKey) === normNombre);
      if (!matchesId && !matchesName) continue;
      out.push({
        ...g,
        _kind: 'cosecha',
        _wsIso: m[2]
      });
    }
  }
  out.sort((a, b) => String(b.fecha || '').slice(0, 10).localeCompare(String(a.fecha || '').slice(0, 10)));
  return out;
}

export async function renderDetallePersonal(personalId, returnScreen, returnId, { initialView = 'month' } = {}) {
  const initView = (initialView === 'day' || initialView === 'week' || initialView === 'all') ? initialView : 'month';
  const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
  const [personaArr, asistencia, gastosPersonal] = await Promise.all([
    restFetch(`/rest/v1/personal?id=eq.${encodeURIComponent(personalId)}&select=*`).catch(() => []),
    restFetch(`/rest/v1/personal_asistencia?personal_id=eq.${encodeURIComponent(personalId)}&order=fecha.desc&select=*`).catch(() => []),
    fetchGastosPersonal()
  ]);
  const persona = (Array.isArray(personaArr) ? personaArr[0] : personaArr) || null;

  if (!persona) return '<div class="m3-p-4" style="color:red;">Personal no encontrado</div>';

  const actividadesMap = await fetchActividadesMap(personalId, empresaId, persona.nombre);
  window._currentActividadesMap = actividadesMap;

  const asisList = Array.isArray(asistencia) ? asistencia : [];
  const asisMap = {};
  asisList.forEach(a => {
    const f = (a.fecha || '').slice(0, 10);
    if (f) asisMap[f] = a.estado;
  });

  const today = new Date();
  const month = today.getMonth();
  const year = today.getFullYear();
  const initialSummaryHtml = renderSummary(asisList, persona.pago_diario, month, year, today, actividadesMap, initView, persona, gastosPersonal);
  const initialFooterAction = window._currentDpSummary?.footerAction || null;
  const initialDesktopFooterHtml = renderDesktopFooterAction(initialFooterAction);
  const initialTitle = initView === 'all'
    ? 'Histórico de pagos'
    : initView === 'day'
      ? `${DAYS_FULL[today.getDay()]}, ${today.getDate()} de ${MONTHS[month]} ${year}`
      : `${MONTHS[month]} ${year}`;
  const initialCalHtml = initView === 'all'
    ? renderAllPaymentsView(window._currentDpSummary?.allPaidMovs || [], window._currentDpSummary?.totalDaysAll || 0, persona?.nombre || '')
    : initView === 'day'
      ? renderDayView(today, asisMap, actividadesMap)
      : renderMonthView(month, year, asisMap, actividadesMap);
  const todayStrInit = fmtDate(today);
  const initialFooterHtml = renderDayActionsBar(asisMap[todayStrInit], false, (actividadesMap[todayStrInit] || []).length > 0, initialFooterAction);
  window._dpPreloaded = { personalId, persona, asisData: asisList, gastosPersonal, actividadesMap };

  return `
    <style>
      .dp-screen-pad { padding: 0 0 100px 0 !important; width: 100%; margin: 0; box-sizing: border-box; }
      .dp-cal-views { overflow-x: auto; scrollbar-width: none; -ms-overflow-style: none; }
      .dp-cal-views::-webkit-scrollbar { display: none; }
      .dp-cal-views .cal-view-btn { white-space: nowrap; flex-shrink: 0; }
    </style>
    <div class="m3-pt-6 m3-pb-24 m3-p-4 m3-font-work-sans dp-screen-pad">
      <!-- embed personalId for init -->
      <input type="hidden" id="dp-personal-id" value="${personalId}">
      <input type="hidden" id="dp-empresa-id" value="${empresaId}">
      <input type="hidden" id="dp-pago-diario" value="${persona?.pago_diario || 0}">
      <input type="hidden" id="dp-persona-nombre" value="${dpEscapeHtml(persona?.nombre || '')}">

      <div class="m3-card m3-p-8" style="border-radius: 20px; border: 1.5px solid var(--m3-outline-variant, #c7cec3); background: var(--m3-surface-container-lowest, #ffffff); box-shadow: 0 4px 16px rgba(45, 62, 44, 0.06); margin-bottom: 24px; width: 100%; box-sizing: border-box;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <div style="width: 72px; height: 72px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 28px; background: ${getColor(persona.nombre)}; color: white; flex-shrink: 0;">${persona.iniciales || ((persona.nombre || '').trim().split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase() || '?')}</div>
          <div style="flex: 1;">
            <h1 class="m3-display-small m3-font-extrabold m3-text-on-surface m3-tracking-tight m3-font-manrope" style="font-size: 28px;">${dpEscapeHtml(persona.nombre || 'Sin nombre')}</h1>
            <p id="dp-header-subtitle" class="m3-label-large m3-text-on-surface-variant m3-font-medium">${(() => { const s = window._currentDpSummary; return s ? `${s.periodDaysText} · Pago por día: L${Number(s.diario || 0).toLocaleString('es-HN')}` : `Pago por día: L${Number(persona.pago_diario || 0).toLocaleString('es-HN')}`; })()}</p>
          </div>
        </div>
        <div id="cal-summary" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--m3-outline-variant);">
          ${initialSummaryHtml}
        </div>
      </div>

      <div class="m3-card m3-p-8" style="border-radius: 20px; border: 1.5px solid var(--m3-outline-variant, #c7cec3); background: var(--m3-surface-container-lowest, #ffffff); box-shadow: 0 4px 16px rgba(45, 62, 44, 0.06); width: 100%; box-sizing: border-box;">
        <div class="dp-cal-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px; flex-wrap: wrap; gap: 10px;">
          <div class="dp-cal-nav-row" style="display: none; align-items: center; gap: 8px; flex: 1; min-width: 0;">
            <button type="button" class="cal-nav-btn dp-cal-arrow" onclick="window.__calNavigate(-1)" aria-label="Anterior"><span class="material-icons" style="font-size:20px;">chevron_left</span></button>
            <h2 class="m3-title-large m3-font-bold dp-cal-title" id="cal-title">${initialTitle}</h2>
            <button type="button" class="cal-nav-btn dp-cal-arrow" onclick="window.__calNavigate(1)" aria-label="Siguiente"><span class="material-icons" style="font-size:20px;">chevron_right</span></button>
          </div>
          <div class="dp-cal-views" style="display: flex; gap: 6px;">
            <button class="cal-view-btn ${initView === 'all' ? 'active' : ''}" data-view="all" onclick="window.__calSetView('all')">Todo</button>
            <button class="cal-view-btn ${initView === 'day' ? 'active' : ''}" data-view="day" onclick="window.__calSetView('day')">Día</button>
            <button class="cal-view-btn ${initView === 'week' ? 'active' : ''}" data-view="week" onclick="window.__calSetView('week')">Semana</button>
            <button class="cal-view-btn ${initView === 'month' ? 'active' : ''}" data-view="month" onclick="window.__calSetView('month')">Mes</button>
          </div>
        </div>

        <div id="cal-container">
          ${initialCalHtml}
        </div>
        <div id="dp-desktop-footer-bar" style="margin-top: 16px;">${initialDesktopFooterHtml}</div>
        <div id="dp-mobile-footer-bar" style="display:none;">${initialFooterHtml}</div>
        <!-- Floating snackbar-style tooltip for calendar days -->
        <div id="cal-tip" style="display:none;position:fixed;z-index:9999;background:#ffffff;color:#1a2e1a;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.12);padding:10px 14px;max-width:280px;pointer-events:none;border:1px solid rgba(45,62,44,0.12);transition:opacity 0.15s;">
          <div id="cal-tip-content" style="font-size:13px;font-weight:500;line-height:1.5;"></div>
        </div>

      </div>
    </div>
  `;
}

function dpActIcon(source) {
  if (source === 'potrero') return '🐄';
  if (source === 'otro') return '📋';
  return '🌱';
}

function dpActLocationLabel(a) {
  if (!a?.lote_nombre) return '';
  return a.source === 'potrero' ? `Potrero: ${dpEscapeHtml(a.lote_nombre)}` : `Lote: ${dpEscapeHtml(a.lote_nombre)}`;
}

function renderMonthView(month, year, asisMap, actividadesMap = {}) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const today = new Date();
  const todayStr = fmtDate(today);

  let html = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:12px; padding:0 4px;">
      <button type="button" onclick="window.__calNavigate(-1)" aria-label="Mes anterior" style="width:34px; height:34px; border-radius:50%; border:1px solid #d5e2d2; background:#f2f6f1; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
        <span class="material-symbols-outlined" style="font-size:19px;">chevron_left</span>
      </button>
      <span style="font-size:14.5px; font-weight:800; color:#1e3e2b; text-align:center;">${MONTHS[month]} ${year}</span>
      <button type="button" onclick="window.__calNavigate(1)" aria-label="Mes siguiente" style="width:34px; height:34px; border-radius:50%; border:1px solid #d5e2d2; background:#f2f6f1; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
        <span class="material-symbols-outlined" style="font-size:19px;">chevron_right</span>
      </button>
    </div>
    <div class="cal-weekdays">`;
  DAYS.forEach(d => { html += `<div class="cal-weekday">${d}</div>`; });
  html += '</div><div class="cal-grid">';

  for (let i = 0; i < startPad; i++) {
    html += '<div class="cal-day cal-day-empty"></div>';
  }

  for (let d = 1; d <= totalDays; d++) {
    const dateStr = `${year}-${String(month+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
    const estado = asisMap[dateStr];
    const actividades = actividadesMap[dateStr] || [];
    const hasActividad = actividades.length > 0;
    const effectiveWork = isTrabajo(estado) || hasActividad;
    const effectiveRest = !hasActividad && isDescanso(estado);
    const isToday = dateStr === todayStr;
    let cls = 'cal-day';
    if (isToday) cls += ' cal-day-today';
    if (effectiveWork) cls += ' cal-day-work';
    else if (effectiveRest) cls += ' cal-day-rest';
    if (hasActividad) cls += ' cal-day-actividad';

    const diaSem = new Date(year, month, d).getDay();
    if (diaSem === 0) cls += ' cal-day-sun';

    const tipHtml = hasActividad
      ? actividades.map(a => `${dpActIcon(a.source)} ${dpEscapeHtml(a.tipo)}${a.producto ? ': <b>'+dpEscapeHtml(a.producto)+'</b>' : ''}${a.lote_nombre ? '<br><span style="font-size:11px;opacity:0.6;">'+dpActLocationLabel(a)+'</span>' : ''}`).join('<hr style="border:none;border-top:1px solid rgba(45,62,44,0.12);margin:6px 0;">')
      : '';
    const safeHtml = tipHtml.replace(/"/g, '&quot;');
    const dayBadge = hasActividad ? dpActIcon(actividades[0]?.source) : '';

    html += `<div class="${cls}" onclick="window.__calToggleDay('${dateStr}')" ${tipHtml ? `onmouseenter="window.__calShowTip(event)" onmouseleave="window.__calHideTip()" data-tip="${safeHtml}"` : ''}>
      <span class="cal-day-num">${d}</span>
      <div class="cal-day-badges">
        ${(effectiveWork || effectiveRest) ? `<span class="cal-day-label cal-badge-asistencia">${effectiveWork ? '✔' : '✘'}</span>` : ''}
        ${hasActividad ? `<span class="cal-day-label cal-badge-actividad">${dayBadge}</span>` : ''}
      </div>
    </div>`;
  }

  html += '</div>';
  return html;
}

function renderWeekView(weekStart, asisMap, actividadesMap = {}) {
  const today = new Date();
  const todayStr = fmtDate(today);
  const weekDays = [];

  for (let i = 0; i < 7; i++) {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    weekDays.push(d);
  }

  const mStartShort = MONTHS[weekDays[0].getMonth()].slice(0, 3).toLowerCase();
  const mEndShort = MONTHS[weekDays[6].getMonth()].slice(0, 3).toLowerCase();
  const weekRangeTitle = weekDays[0].getMonth() === weekDays[6].getMonth()
    ? `${weekDays[0].getDate()} – ${weekDays[6].getDate()} ${mStartShort} ${weekDays[0].getFullYear()}`
    : `${weekDays[0].getDate()} ${mStartShort} – ${weekDays[6].getDate()} ${mEndShort} ${weekDays[0].getFullYear()}`;

  let html = `
    <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:12px; padding:0 4px;">
      <button type="button" onclick="window.__calNavigate(-1)" aria-label="Semana anterior" style="width:34px; height:34px; border-radius:50%; border:1px solid #d5e2d2; background:#f2f6f1; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
        <span class="material-symbols-outlined" style="font-size:19px;">chevron_left</span>
      </button>
      <span style="font-size:14px; font-weight:800; color:#111827; text-align:center;">${weekRangeTitle}</span>
      <button type="button" onclick="window.__calNavigate(1)" aria-label="Semana siguiente" style="width:34px; height:34px; border-radius:50%; border:1px solid #d5e2d2; background:#f2f6f1; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
        <span class="material-symbols-outlined" style="font-size:19px;">chevron_right</span>
      </button>
    </div>
  `;
  html += '<div class="cal-weekdays">';
  const DAYS_WEEK_HEADER = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  DAYS_WEEK_HEADER.forEach(d => { html += `<div class="cal-weekday">${d}</div>`; });
  html += '</div><div class="cal-grid">';

  weekDays.forEach(d => {
    const dateStr = fmtDate(d);
    const estado = asisMap[dateStr];
    const actividades = actividadesMap[dateStr] || [];
    const hasActividad = actividades.length > 0;
    const effectiveWork = isTrabajo(estado) || hasActividad;
    const effectiveRest = !hasActividad && isDescanso(estado);
    const isToday = dateStr === todayStr;
    let cls = 'cal-day';
    if (isToday) cls += ' cal-day-today';
    if (effectiveWork) cls += ' cal-day-work';
    else if (effectiveRest) cls += ' cal-day-rest';
    if (hasActividad) cls += ' cal-day-actividad';
    if (d.getDay() === 0) cls += ' cal-day-sun';

    const tipHtml = hasActividad
      ? actividades.map(a => `${dpActIcon(a.source)} ${dpEscapeHtml(a.tipo)}${a.producto ? ': <b>'+dpEscapeHtml(a.producto)+'</b>' : ''}${a.lote_nombre ? '<br><span style="font-size:11px;opacity:0.8;">'+dpActLocationLabel(a)+'</span>' : ''}`).join('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.12);margin:6px 0;">')
      : '';
    const safeHtml = tipHtml.replace(/"/g, '&quot;');
    const dayBadge = hasActividad ? dpActIcon(actividades[0]?.source) : '';

    html += `<div class="${cls}" onclick="window.__calToggleDay('${dateStr}')" ${tipHtml ? `onmouseenter="window.__calShowTip(event)" onmouseleave="window.__calHideTip()" data-tip="${safeHtml}"` : ''}>
      <span class="cal-day-num">${d.getDate()}</span>
      <div class="cal-day-badges">
        ${(effectiveWork || effectiveRest) ? `<span class="cal-day-label cal-badge-asistencia">${effectiveWork ? '✔' : '✘'}</span>` : ''}
        ${hasActividad ? `<span class="cal-day-label cal-badge-actividad">${dayBadge}</span>` : ''}
      </div>
    </div>`;
  });

  html += '</div>';
  return html;
}

function buildFooterCuentasButtonHtml(footerAction, compact = false) {
  if (!footerAction) return '';
  if (compact) {
    if (footerAction.isUpdate) {
      return `
        <button type="button" class="dp-footer-cuentas-btn" onclick="${footerAction.onclick}" style="width:100%; min-height:46px; padding:5px 10px; border-radius:999px; border:1.5px solid #b34200; background:#fff4ed; color:#b34200; font-family:'Work Sans',sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; line-height:1.15; cursor:pointer; box-sizing:border-box;">
          <span style="font-size:12px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">${dpEscapeHtml(footerAction.label)}</span>
          <span style="display:inline-flex; align-items:baseline; gap:4px; font-size:11.5px; font-weight:800; white-space:nowrap;">
            <span style="text-decoration:line-through; color:#6b7280; font-weight:700; font-size:11px;">${dpEscapeHtml(footerAction.prevAmountText)}</span>
            <span>→</span>
            <span>${dpEscapeHtml(footerAction.amountText)}</span>
          </span>
        </button>
      `;
    }
    if (footerAction.isDelete) {
      return `
        <button type="button" class="dp-footer-cuentas-btn" onclick="${footerAction.onclick}" style="width:100%; min-height:46px; padding:5px 10px; border-radius:999px; border:1.5px solid #ba1a1a; background:#fee2e2; color:#ba1a1a; font-family:'Work Sans',sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; line-height:1.15; cursor:pointer; box-sizing:border-box;">
          <span style="font-size:12px; font-weight:800; white-space:nowrap;">Eliminar en Cuentas</span>
          <span style="font-size:11.5px; font-weight:800; white-space:nowrap;">${dpEscapeHtml(footerAction.amountText)} · 0 días</span>
        </button>
      `;
    }
    return `
      <button type="button" class="dp-footer-cuentas-btn" onclick="${footerAction.onclick}" style="width:100%; min-height:46px; padding:5px 10px; border-radius:999px; border:1.5px solid #2d3e2c; background:#eff4ed; color:#2d3e2c; font-family:'Work Sans',sans-serif; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; line-height:1.15; cursor:pointer; box-sizing:border-box;">
        <span style="font-size:12px; font-weight:800; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; max-width:100%;">Enviar a Cuentas</span>
        <span style="font-size:12px; font-weight:800; color:#b34200; white-space:nowrap;">${dpEscapeHtml(footerAction.amountText)}</span>
      </button>
    `;
  }
  if (footerAction.isUpdate) {
    return `
      <button type="button" class="dp-footer-cuentas-btn" onclick="${footerAction.onclick}" style="width:100%; min-height:42px; padding:6px 14px; border-radius:999px; border:1.5px solid #b34200; background:#fff4ed; color:#b34200; font-family:'Work Sans',sans-serif; font-size:12.5px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; box-sizing:border-box;">
        <span class="material-symbols-outlined" style="font-size:17px;">update</span>
        <span>${dpEscapeHtml(footerAction.label)}</span>
        <span style="display:inline-flex; align-items:baseline; gap:4px;">
          <span style="text-decoration:line-through; color:#6b7280; font-weight:700; font-size:11.5px;">${dpEscapeHtml(footerAction.prevAmountText)}</span>
          <span>→</span>
          <span>${dpEscapeHtml(footerAction.amountText)}</span>
        </span>
      </button>
    `;
  }
  if (footerAction.isDelete) {
    return `
      <button type="button" class="dp-footer-cuentas-btn" onclick="${footerAction.onclick}" style="width:100%; min-height:42px; padding:6px 14px; border-radius:999px; border:1.5px solid #ba1a1a; background:#fee2e2; color:#ba1a1a; font-family:'Work Sans',sans-serif; font-size:12.5px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; box-sizing:border-box;">
        <span class="material-symbols-outlined" style="font-size:17px;">delete</span>
        <span>${dpEscapeHtml(footerAction.label)} (${dpEscapeHtml(footerAction.amountText)})</span>
      </button>
    `;
  }
  return `
    <button type="button" class="dp-footer-cuentas-btn" onclick="${footerAction.onclick}" style="width:100%; min-height:42px; padding:6px 14px; border-radius:999px; border:1.5px solid #2d3e2c; background:#eff4ed; color:#2d3e2c; font-family:'Work Sans',sans-serif; font-size:12.5px; font-weight:800; display:flex; align-items:center; justify-content:center; gap:8px; cursor:pointer; box-sizing:border-box;">
      <span class="material-symbols-outlined" style="font-size:17px;">payments</span>
      <span>${dpEscapeHtml(footerAction.label)} · ${dpEscapeHtml(footerAction.amountText)}</span>
    </button>
  `;
}

function renderDesktopFooterAction(footerAction) {
  if (!footerAction) return '';
  return `<div style="display:flex; justify-content:center;">${buildFooterCuentasButtonHtml(footerAction, false)}</div>`;
}

function renderDayActionsBar(estado, isFuture = false, hasActividad = false, footerAction = null) {
  const isWork = isTrabajo(estado) || Boolean(hasActividad);
  const isRest = !hasActividad && isDescanso(estado);

  if (!footerAction) {
    if (isFuture) {
      return `
        <div class="dp-day-actions-bar" style="display:flex;justify-content:center;gap:12px;box-sizing:border-box;">
          <button class="cal-view-btn" disabled style="padding:10px 24px;opacity:0.45;cursor:not-allowed;pointer-events:none;">✘ Descanso</button>
          <button class="cal-view-btn" disabled style="padding:10px 24px;background:#2d3e2c;color:#ffffff;border-color:#2d3e2c;opacity:0.45;cursor:not-allowed;pointer-events:none;">✔ Trabajó</button>
        </div>
      `;
    }
    const restStyle = hasActividad
      ? 'padding:10px 24px;opacity:0.45;'
      : isRest
        ? 'padding:10px 24px;background:#dc2626;color:#ffffff;border-color:#dc2626;box-shadow:0 3px 10px rgba(220,38,38,0.25);'
        : 'padding:10px 24px;';
    const workStyle = isWork
      ? 'padding:10px 24px;background:#16a34a;color:#ffffff;border-color:#16a34a;box-shadow:0 3px 10px rgba(22,163,74,0.28);'
      : isRest
        ? 'padding:10px 24px;background:#ffffff;color:#2d3e2c;border-color:#d5e0d4;'
        : 'padding:10px 24px;background:#2d3e2c;color:#ffffff;border-color:#2d3e2c;';

    return `
      <div class="dp-day-actions-bar" style="display:flex;justify-content:center;gap:12px;box-sizing:border-box;">
        <button class="cal-view-btn ${isRest ? 'active' : ''}" onclick="window.__calSetDayEstado('descanso')" style="${restStyle}">${isRest ? '✘ Descansó' : '✘ Descanso'}</button>
        <button class="cal-view-btn ${isWork ? 'active' : ''}" onclick="window.__dpOpenWorkSheet()" style="${workStyle}">${isWork ? '✔ Trabajado' : '✔ Trabajó'}</button>
      </div>
    `;
  }

  const workBtnLabel = isWork ? '✔ Trabajado' : '✔ Trabajó';
  const swipeWorkBg = isWork
    ? 'background:#16a34a;color:#ffffff;border-color:#16a34a;box-shadow:0 3px 10px rgba(22,163,74,0.28);'
    : isRest
      ? 'background:#ffffff;color:#2d3e2c;border-color:#d5e0d4;'
      : 'background:#2d3e2c;color:#ffffff;border-color:#2d3e2c;';

  const rightSlotHtml = isFuture
    ? `<button type="button" class="cal-view-btn" disabled style="width:100%;min-height:46px;padding:10px 12px;background:#2d3e2c;color:#ffffff;border-color:#2d3e2c;opacity:0.45;cursor:not-allowed;pointer-events:none;box-sizing:border-box;">✔ Trabajó</button>`
    : `
      <div class="dp-work-swipe-wrap" style="position:relative;overflow:hidden;border-radius:999px;min-height:46px;width:100%;box-sizing:border-box;">
        <div class="dp-work-swipe-bg" style="position:absolute;inset:0;border-radius:999px;background:#dc2626;color:#ffffff;display:flex;align-items:center;justify-content:flex-start;padding-left:14px;font-family:'Work Sans',sans-serif;font-size:13px;font-weight:800;pointer-events:none;opacity:0;transition:opacity .12s ease;white-space:nowrap;">✘ Descanso</div>
        <button type="button" class="cal-view-btn dp-work-swipe-btn ${isWork ? 'active' : ''}" style="${swipeWorkBg}position:relative;z-index:2;width:100%;height:100%;min-height:46px;margin:0;padding:10px 12px;display:flex;align-items:center;justify-content:center;gap:4px;touch-action:pan-y;user-select:none;-webkit-user-select:none;will-change:transform;transition:transform .18s cubic-bezier(0.22,1,0.36,1);box-sizing:border-box;">
          <span>${workBtnLabel}</span>
          <span aria-hidden="true" style="opacity:0.6;font-size:15px;line-height:1;">›</span>
        </button>
      </div>
    `;

  return `
    <div class="dp-day-actions-bar dp-footer-has-cuentas" style="display:grid;grid-template-columns:minmax(0,1.15fr) minmax(0,1fr);gap:10px;width:100%;align-items:stretch;box-sizing:border-box;">
      ${buildFooterCuentasButtonHtml(footerAction, true)}
      ${rightSlotHtml}
    </div>
  `;
}

function renderAllPaymentsView(allPaidMovs = [], totalDaysAll = 0, personaNombre = '') {
  const movs = Array.isArray(allPaidMovs) ? allPaidMovs : [];
  const fmtNiceDate = (isoStr) => {
    const parts = String(isoStr || '').slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || isNaN(parts[0])) return isoStr || 'Sin fecha';
    const d = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    return `${d.getDate()} ${MONTHS[d.getMonth()].slice(0, 3).toLowerCase()} ${d.getFullYear()}`;
  };
  const fmtWeekFromWsIso = (wsIso) => {
    const parts = String(wsIso || '').slice(0, 10).split('-').map(Number);
    if (parts.length !== 3 || isNaN(parts[0])) return '';
    const ws = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    const we = new Date(ws);
    we.setDate(ws.getDate() + 6);
    const mStart = MONTHS[ws.getMonth()];
    const mEnd = MONTHS[we.getMonth()];
    return ws.getMonth() === we.getMonth()
      ? `Semana ${ws.getDate()} - ${we.getDate()} ${mStart} ${ws.getFullYear()}`
      : `Semana ${ws.getDate()} ${mStart} - ${we.getDate()} ${mEnd} ${we.getFullYear()}`;
  };
  const stripWorkerName = (text) => {
    let out = String(text || '');
    const trimmedName = String(personaNombre || '').trim();
    if (trimmedName) {
      const escaped = trimmedName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      out = out.replace(new RegExp(escaped, 'gi'), '');
    }
    return out
      .replace(/\s*[·:\-–]\s*(?=$|[·:\-–])/g, '')
      .replace(/^[·:\-–\s]+|[·:\-–\s]+$/g, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
  };

  return `
    <div style="padding: 8px 0 4px;">
      <div style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; margin-bottom:14px;">
        <div style="background:#f5f7f3; border-radius:14px; padding:10px 12px;">
          <div style="font-size:11px; color:#5a6b58; font-weight:600;">Días trabajados</div>
          <div style="font-size:18px; font-weight:800; color:#111827; margin-top:2px;">${totalDaysAll}</div>
        </div>
        <div style="background:#f5f7f3; border-radius:14px; padding:10px 12px;">
          <div style="font-size:11px; color:#5a6b58; font-weight:600;">Pagos en Cuentas</div>
          <div style="font-size:18px; font-weight:800; color:#1b6e1b; margin-top:2px;">${movs.length}</div>
        </div>
      </div>

      ${movs.length > 0 ? `
        <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.6px; color:#4a5d48; margin-bottom:8px;">
          Historial de pagos · ${movs.length} ${movs.length === 1 ? 'movimiento' : 'movimientos'}
        </div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${movs.map(m => {
            const isCosecha = m._kind === 'cosecha';
            const cleanDesc = dpStripTags(m.descripcion);
            const weekMatch = cleanDesc.match(/(Semana\s+\d+[^·:()\n]+?)(?=\s*[·:()]|$)/i);

            let periodTitle = '';
            if (weekMatch) {
              periodTitle = weekMatch[1].trim();
            } else if (isCosecha) {
              periodTitle = fmtWeekFromWsIso(m._wsIso) || 'Cosecha';
            } else if (m._refKind === 'sem' && m._refDate) {
              periodTitle = fmtWeekFromWsIso(m._refDate) || 'Planilla Semanal';
            } else if (m._refKind === 'dia' || /jornal\s+diario/i.test(cleanDesc)) {
              periodTitle = fmtNiceDate(m._refDate || m.fecha);
            } else if (m._refKind === 'mes' && m._refDate) {
              const [yPart, mPart] = String(m._refDate).split('_').map(Number);
              periodTitle = (yPart && mPart && MONTHS[mPart - 1])
                ? `${MONTHS[mPart - 1]} ${yPart}`
                : 'Planilla Mensual';
            } else {
              const parens = [...cleanDesc.matchAll(/\(([^)]+)\)/g)].map(x => x[1].trim());
              const periodParen = parens.find(t => !/\b(latas?|d[ií]as?)\b/i.test(t));
              if (periodParen) {
                periodTitle = periodParen;
              } else {
                const noMetrics = cleanDesc
                  .replace(/\(\s*\d+(?:[.,]\d+)?\s*(?:latas?|d[ií]as?[^)]*)\s*\)/gi, '')
                  .replace(/^(?:Planilla\s+(?:Semanal|Mensual)|Jornal\s+Diario)\s*[:·-]?\s*/i, '');
                periodTitle = stripWorkerName(noMetrics) || 'Pago de jornal';
              }
            }

            let detailLine = '';
            if (isCosecha) {
              const latasMatch = cleanDesc.match(/(\d+(?:[.,]\d+)?)\s*latas?/i);
              if (latasMatch) {
                const rawNum = latasMatch[1];
                const numVal = Number(rawNum.replace(',', '.'));
                detailLine = `${rawNum} ${numVal === 1 ? 'lata de café' : 'latas de café'}`;
              }
            } else {
              const diasMatch = cleanDesc.match(/(\d+)\s*d[ií]as?/i);
              if (diasMatch) {
                const nDias = Number(diasMatch[1]);
                detailLine = `${diasMatch[1]} ${nDias === 1 ? 'día trabajado' : 'días trabajados'}`;
              } else if (m._refKind === 'dia' || /jornal\s+diario/i.test(cleanDesc)) {
                detailLine = '1 día trabajado';
              }
            }

            const badgeStyle = isCosecha
              ? 'background:#fef3c7; color:#92400e;'
              : 'background:#e2f2e0; color:#1b6e1b;';
            const badgeText = isCosecha ? 'Cosecha' : 'Personal';
            return `
              <div style="background:#f5f7f3; border-radius:14px; padding:11px 13px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0; flex:1;">
                  <div style="font-size:13px; font-weight:700; color:#111827; line-height:1.3;">${dpEscapeHtml(periodTitle)}</div>
                  ${detailLine ? `<div style="font-size:12px; font-weight:700; color:${isCosecha ? '#92400e' : '#2d3e2c'}; margin-top:2px;">${dpEscapeHtml(detailLine)}</div>` : ''}
                  <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap; margin-top:4px;">
                    <span style="font-size:11.5px; color:#5a6b58;">${dpEscapeHtml(fmtNiceDate(m.fecha))}</span>
                    <span style="font-size:10px; font-weight:800; padding:1px 7px; border-radius:999px; ${badgeStyle}">${badgeText}</span>
                  </div>
                </div>
                <div style="font-size:14.5px; font-weight:800; color:#1b6e1b; white-space:nowrap; flex-shrink:0;">
                  L ${Math.round(Number(m.monto) || 0).toLocaleString('es-HN')}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      ` : `
        <div style="padding:28px 16px; text-align:center; background:#f5f7f3; border-radius:16px; color:#5a6b58; font-size:13px;">
          Aún no se han registrado pagos en Cuentas para este colaborador.
        </div>
      `}
    </div>
  `;
}

function renderDayView(date, asisMap, actividadesMap = {}) {
  const dateStr = fmtDate(date);
  const estado = asisMap[dateStr];
  const actividades = actividadesMap[dateStr] || [];
  const hasActividad = actividades.length > 0;
  const hasCafe = actividades.some(a => !a.source || a.source === 'cafetal');
  const hasPot = actividades.some(a => a.source === 'potrero');
  const hasOtro = actividades.some(a => a.source === 'otro');
  const today = new Date();
  const todayStr = fmtDate(today);
  const isToday = dateStr === todayStr;

  const actHeaderLabel = (hasCafe && !hasPot && !hasOtro)
    ? '🌱 Actividades en cafetal'
    : (hasPot && !hasCafe && !hasOtro)
      ? '🐄 Actividades en potreros'
      : '📋 Actividades del día';

  const statusPillLabel = (hasCafe && hasPot)
    ? 'Trabajó este día (Cafetal y potrero)'
    : (hasCafe && !hasPot && !hasOtro)
      ? 'Trabajó este día (Actividad en cafetal)'
      : (hasPot && !hasCafe && !hasOtro)
        ? 'Trabajó este día (Actividad en potrero)'
        : 'Trabajó este día (Actividad registrada)';

  const actividadesHtml = hasActividad ? `
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--m3-outline-variant);text-align:left;">
      <p style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--m3-on-surface-variant);letter-spacing:0.5px;margin-bottom:10px;">${actHeaderLabel}</p>
      ${actividades.map(a => `
        <div style="background:rgba(45,62,44,0.06);border-left:3px solid #2d3e2c;border-radius:8px;padding:10px 14px;margin-bottom:8px;">
          <p style="font-size:13px;font-weight:700;color:var(--m3-on-surface);margin:0 0 2px;">${dpActIcon(a.source)} ${dpEscapeHtml(a.tipo)}${a.producto ? ': ' + dpEscapeHtml(a.producto) : ''}</p>
          ${a.lote_nombre ? `<p style="font-size:12px;color:var(--m3-on-surface-variant);margin:0;">${dpActLocationLabel(a)}</p>` : ''}
        </div>
      `).join('')}
    </div>
  ` : '';

  const isFuture = dateStr > todayStr;

  let controlsHtml = '';
  if (hasActividad) {
    controlsHtml = `
      <div style="margin-top:8px;display:flex;justify-content:center;">
        <div style="display:inline-flex;align-items:center;gap:8px;background:rgba(45,62,44,0.08);border:1.5px solid var(--m3-primary);border-radius:9999px;padding:8px 20px;color:var(--m3-primary);font-weight:700;font-size:13.5px;">
          <span class="material-symbols-outlined" style="font-size:18px;">task_alt</span>
          <span>${statusPillLabel}</span>
        </div>
      </div>
    `;
  } else if (isFuture) {
    controlsHtml = `
      <div style="margin-top:14px;display:flex;justify-content:center;">
        <span class="m3-label-medium m3-font-medium" style="color:var(--m3-on-surface-variant);display:inline-flex;align-items:center;gap:6px;background:rgba(0,0,0,0.04);padding:8px 18px;border-radius:20px;font-size:13px;">
          <span class="material-symbols-outlined" style="font-size:18px;">event_upcoming</span>
          Fecha futura — aún no transcurrida
        </span>
      </div>
    `;
  } else {
    controlsHtml = renderDayActionsBar(estado, false, false, null);
  }

  return `
    <div style="text-align:center; padding:10px 0 20px;">
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:4px 4px 16px;">
        <button type="button" onclick="window.__calNavigate(-1)" aria-label="Día anterior" style="width:38px; height:38px; border-radius:50%; border:1px solid #d5e2d2; background:#f2f6f1; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
          <span class="material-symbols-outlined" style="font-size:21px;">chevron_left</span>
        </button>
        <div style="text-align:center; flex:1;">
          <div style="font-size:14.5px; font-weight:700; color:#2d3e2c;">${DAYS_FULL[date.getDay()]}</div>
          <div style="font-size:48px; font-weight:800; line-height:1.08; margin:2px 0; color:${isToday ? '#ff7a2f' : 'var(--m3-on-surface)'};">${date.getDate()}</div>
          <div style="font-size:15px; font-weight:700; color:#2d3e2c;">${MONTHS[date.getMonth()]} ${date.getFullYear()}</div>
        </div>
        <button type="button" onclick="window.__calNavigate(1)" aria-label="Día siguiente" style="width:38px; height:38px; border-radius:50%; border:1px solid #d5e2d2; background:#f2f6f1; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
          <span class="material-symbols-outlined" style="font-size:21px;">chevron_right</span>
        </button>
      </div>
      ${controlsHtml}
      ${actividadesHtml}
    </div>
  `;
}

function renderSummary(asistencia, pagoDiario, month, year, weekDate, actividadesMap = {}, currentView = 'month', persona = {}, gastosPersonal = []) {
  const diario = Number(pagoDiario || 0);
  const trabajados = (asistencia || []).filter(a => isTrabajo(a.estado));

  const targetDate = weekDate ? new Date(weekDate) : new Date();
  const targetMonth = month ?? targetDate.getMonth();
  const targetYear = year ?? targetDate.getFullYear();

  // Week bounds (Monday to Sunday 23:59:59)
  const weekStart = new Date(targetDate);
  const dayOfWeek = weekStart.getDay();
  weekStart.setDate(weekStart.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
  weekStart.setHours(0, 0, 0, 0);

  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);

  // Merge: asistencia 'trabajo' + activity dates (union, no double count)
  const trabajadosFechas = new Set(
    trabajados.map(a => (a.fecha || '').slice(0, 10)).filter(Boolean)
  );
  const actividadesFechas = Object.keys(actividadesMap || {}).map(f => f.slice(0, 10)).filter(Boolean);
  const todasFechas = new Set([...trabajadosFechas, ...actividadesFechas]);
  const totalDaysAll = todasFechas.size;

  const weekDates = [...todasFechas].filter(fechaStr => {
    const parts = fechaStr.split('-').map(Number);
    if (parts.length < 3 || isNaN(parts[0])) return false;
    const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
    return d >= weekStart && d <= weekEnd;
  });

  const monthDates = [...todasFechas].filter(fechaStr => {
    const parts = fechaStr.split('-').map(Number);
    if (parts.length < 3 || isNaN(parts[0])) return false;
    return (parts[1] - 1) === targetMonth && parts[0] === targetYear;
  });

  const daysThisWeek = weekDates.length;
  const weekTotal = daysThisWeek * diario;
  const daysThisMonth = monthDates.length;
  const monthTotal = daysThisMonth * diario;

  const targetDateStr = fmtDate(targetDate);
  const isDayWorked = todasFechas.has(targetDateStr);
  const dayTotal = isDayWorked ? diario : 0;

  let periodTitle = '';
  let periodDaysText = '';
  let periodTotal = 0;
  let periodSubtext = '';
  let periodKey = '';

  if (currentView === 'all') {
    periodTitle = 'Histórico completo';
    periodDaysText = `${totalDaysAll} ${totalDaysAll === 1 ? 'día' : 'días'}`;
    periodTotal = totalDaysAll * diario;
    periodSubtext = `${totalDaysAll} ${totalDaysAll === 1 ? 'día laborado registrado' : 'días laborados registrados'}`;
    periodKey = 'all';
  } else if (currentView === 'week') {
    const startM = MONTHS[weekStart.getMonth()];
    const endM = MONTHS[weekEnd.getMonth()];
    periodTitle = weekStart.getMonth() === weekEnd.getMonth()
      ? `Semana ${weekStart.getDate()} - ${weekEnd.getDate()} ${startM} ${weekStart.getFullYear()}`
      : `Semana ${weekStart.getDate()} ${startM} - ${weekEnd.getDate()} ${endM} ${weekStart.getFullYear()}`;
    periodDaysText = `${daysThisWeek} ${daysThisWeek === 1 ? 'día' : 'días'}`;
    periodTotal = weekTotal;
    periodSubtext = `${daysThisWeek} ${daysThisWeek === 1 ? 'día trabajado en la semana' : 'días trabajados en la semana'}`;
    periodKey = `sem_${fmtDate(weekStart)}`;
  } else if (currentView === 'day') {
    periodTitle = `${DAYS_FULL[targetDate.getDay()]}, ${targetDate.getDate()} de ${MONTHS[targetDate.getMonth()]}`;
    periodDaysText = isDayWorked ? '1 día (Trabajó)' : '0 días (Sin labor)';
    periodTotal = dayTotal;
    periodSubtext = isDayWorked ? '1 jornada laborada este día' : 'Descanso o sin registro';
    periodKey = `dia_${targetDateStr}`;
  } else {
    periodTitle = `${MONTHS[targetMonth]} ${targetYear}`;
    periodDaysText = `${daysThisMonth} ${daysThisMonth === 1 ? 'día' : 'días'}`;
    periodTotal = monthTotal;
    periodSubtext = `${daysThisMonth} ${daysThisMonth === 1 ? 'día laborado en el mes' : 'días laborados en el mes'}`;
    periodKey = `mes_${targetYear}_${targetMonth + 1}`;
  }

  let descPrefix = 'Planilla Mensual';
  if (currentView === 'week' || currentView === 'all') {
    descPrefix = 'Planilla Semanal';
  } else if (currentView === 'day') {
    descPrefix = 'Jornal Diario';
  } else {
    descPrefix = 'Planilla Mensual';
  }
  const gastoFecha = fmtDate(new Date());

  function matchesWeekText(desc, sDay, eDay, sM, eM) {
    if (!desc) return false;
    const s = desc.toLowerCase();
    if (!s.includes('semana') && !s.includes('planilla')) return false;
    const hasStart = new RegExp(`\\b${sDay}\\b`).test(s);
    const hasEnd = new RegExp(`\\b${eDay}\\b`).test(s);
    if (!hasStart || !hasEnd) return false;
    return s.includes(sM) || s.includes(eM);
  }

  const personalId = persona?.id || '';
  const refTag = personalId ? `[ref:${personalId}_${periodKey}]` : '';
  const pNombre = (persona?.nombre || '').toLowerCase().trim();

  const onlyPersonalGastos = (gastosPersonal || []).filter(g => String(g?.categoria || '').toLowerCase() === 'personal');
  const candidateGastos = onlyPersonalGastos.filter(g => {
    if (!g.descripcion) return false;
    const hasAnyRef = /\[ref:[^\]]+\]/.test(g.descripcion);
    if (hasAnyRef) {
      return Boolean(personalId && (
        (refTag && g.descripcion.includes(refTag)) ||
        g.descripcion.includes(`[ref:${personalId}_`)
      ));
    }
    const desc = g.descripcion.toLowerCase();
    if (pNombre && desc.includes(pNombre)) return true;
    return false;
  });

  const allPaidMovs = extractWorkerPaidMovs(gastosPersonal, personalId, persona?.nombre);

  let matchedGasto = null;
  let duplicateGastoIds = [];
  let weekDayPaidTotal = 0;
  let isMonthHandledByWeeks = false;
  let monthGastosTotal = 0;
  let monthWeeklyCount = 0;

  function findWeekMatches(wsDate, weDate, titleHint = '') {
    const startDay = wsDate.getDate();
    const endDay = weDate.getDate();
    const startM = MONTHS[wsDate.getMonth()].toLowerCase();
    const endM = MONTHS[weDate.getMonth()].toLowerCase();
    const wStartStr = fmtDate(wsDate);
    return candidateGastos.filter(g => {
      const desc = String(g.descripcion || '');
      if (refTag && titleHint && desc.includes(refTag)) return true;
      if (personalId && desc.includes(`[ref:${personalId}_sem_${wStartStr}]`)) return true;
      if (titleHint && desc.includes(titleHint)) return true;
      if (matchesWeekText(desc, startDay, endDay, startM, endM)) return true;
      const parsed = parsePersonalGasto(desc, g.fecha);
      if (parsed?.semana && matchesWeekText(parsed.semana, startDay, endDay, startM, endM)) return true;
      return false;
    });
  }

  function sumDayPaidInRange(wsStr, weStr) {
    if (!personalId) return 0;
    return candidateGastos
      .filter(g => {
        const desc = String(g.descripcion || '');
        if (desc.includes('[Por Aprobar]')) return false;
        if (desc.includes(`[ref:${personalId}_dia_`)) {
          const dm = desc.match(/\[ref:[^\]_]+_dia_(\d{4}-\d{2}-\d{2})\]/);
          const dIso = dm ? dm[1] : String(g.fecha || '').slice(0, 10);
          return Boolean(dIso && dIso >= wsStr && dIso <= weStr);
        }
        const hasAnyRef = /\[ref:[^\]]+\]/.test(desc);
        if (hasAnyRef) return false;
        const low = desc.toLowerCase();
        const looksWeeklyOrMonthly = low.includes('semana') || low.includes('_sem_') || low.includes('mensual') || low.includes('_mes_') || (low.includes('planilla') && !low.includes('diario'));
        if (looksWeeklyOrMonthly) return false;
        const dIso = String(g.fecha || '').slice(0, 10);
        return Boolean(dIso && dIso >= wsStr && dIso <= weStr);
      })
      .reduce((s, g) => s + (Number(g.monto) || 0), 0);
  }

  if (currentView === 'week') {
    const wStartStr = fmtDate(weekStart);
    const wEndStr = fmtDate(weekEnd);
    const weekMatches = findWeekMatches(weekStart, weekEnd, periodTitle);

    matchedGasto = weekMatches[0] || null;
    duplicateGastoIds = weekMatches.slice(1).map(g => g.id);
    weekDayPaidTotal = !matchedGasto ? sumDayPaidInRange(wStartStr, wEndStr) : 0;
  } else if (currentView === 'month') {
    const mName = MONTHS[targetMonth].toLowerCase();
    const ymStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;

    const monthGastos = candidateGastos.filter(g => {
      const f = (g.fecha || '').slice(0, 7);
      if (f === ymStr) return true;
      const desc = (g.descripcion || '').toLowerCase();
      if (desc.includes(mName) && desc.includes(String(targetYear))) return true;
      return false;
    });

    monthGastosTotal = monthGastos.reduce((sum, g) => sum + (Number(g.monto) || 0), 0);
    const weeklyGastos = monthGastos.filter(g => {
      const desc = (g.descripcion || '').toLowerCase();
      return desc.includes('semana') || desc.includes('sem_');
    });
    monthWeeklyCount = weeklyGastos.length;

    if (monthWeeklyCount > 0 || (monthGastosTotal >= periodTotal && periodTotal > 0)) {
      isMonthHandledByWeeks = true;
    }

    if (!isMonthHandledByWeeks) {
      matchedGasto = candidateGastos.find(g =>
        (refTag && g.descripcion.includes(refTag)) ||
        (personalId && g.descripcion.includes(`[ref:${personalId}_mes_${targetYear}_${targetMonth + 1}]`)) ||
        (g.descripcion.includes(periodTitle) && !g.descripcion.includes('semana'))
      );
    }
  } else if (currentView === 'day') {
    matchedGasto = candidateGastos.find(g =>
      (refTag && g.descripcion.includes(refTag)) ||
      (personalId && g.descripcion.includes(`[ref:${personalId}_dia_${targetDateStr}]`)) ||
      (g.fecha === targetDateStr && (g.descripcion.includes(periodTitle) || g.descripcion.includes('Jornal Diario')))
    );
  }

  const weekRefTag = personalId ? `[ref:${personalId}_sem_${fmtDate(weekStart)}]` : '';
  const weekPaidGasto = (currentView === 'day' && weekRefTag)
    ? onlyPersonalGastos.find(g => (g.descripcion || '').includes(weekRefTag) && !(g.descripcion || '').includes('[Por Aprobar]'))
    : null;
  const dayCoveredByWeek = Boolean(weekPaidGasto && (Number(weekPaidGasto.monto) || 0) >= weekTotal && weekTotal > 0);
  const isWeekCoveredByDays = currentView === 'week' && !matchedGasto && weekDayPaidTotal > 0;
  const isMatchedNonDraft = Boolean(matchedGasto && !(matchedGasto.descripcion || '').includes('[Por Aprobar]'));

  // Current week pending check when viewing 'Todo'
  let curWeekPending = 0;
  let curWeekGross = 0;
  let curWeekMatched = null;
  if (currentView === 'all' && diario > 0) {
    const curNow = new Date();
    const curWs = new Date(curNow);
    curWs.setDate(curWs.getDate() - curWs.getDay() + (curWs.getDay() === 0 ? -6 : 1));
    curWs.setHours(0, 0, 0, 0);
    const curWe = new Date(curWs);
    curWe.setDate(curWs.getDate() + 6);
    const curWsStr = fmtDate(curWs);
    const curWeStr = fmtDate(curWe);
    const curDays = [...todasFechas].filter(f => f >= curWsStr && f <= curWeStr).length;
    curWeekGross = curDays * diario;
    const curWeekMatches = findWeekMatches(curWs, curWe);
    curWeekMatched = curWeekMatches[0] || null;
    const curDayPaid = !curWeekMatched ? sumDayPaidInRange(curWsStr, curWeStr) : 0;
    if (curWeekMatched && !(curWeekMatched.descripcion || '').includes('[Por Aprobar]')) {
      curWeekPending = Math.max(0, curWeekGross - (Number(curWeekMatched.monto) || 0));
    } else if (curWeekMatched) {
      curWeekPending = curWeekGross;
    } else {
      curWeekPending = Math.max(0, curWeekGross - curDayPaid);
    }
  }

  let pendienteMostrar = 0;
  if (currentView === 'all') {
    pendienteMostrar = curWeekPending;
  } else if (dayCoveredByWeek) {
    pendienteMostrar = 0;
  } else if (isWeekCoveredByDays) {
    pendienteMostrar = Math.max(0, periodTotal - weekDayPaidTotal);
  } else if (isMatchedNonDraft) {
    pendienteMostrar = Math.max(0, periodTotal - (Number(matchedGasto.monto) || 0));
  } else if (currentView === 'month' && isMonthHandledByWeeks) {
    pendienteMostrar = Math.max(0, periodTotal - monthGastosTotal);
  } else {
    pendienteMostrar = periodTotal;
  }

  // Compute Total pagado en el período (Personal + Cosecha)
  let paidPersonal = 0;
  let paidCosecha = 0;
  if (currentView === 'all') {
    for (const m of allPaidMovs) {
      const amt = Number(m.monto) || 0;
      if (m._kind === 'cosecha') paidCosecha += amt;
      else paidPersonal += amt;
    }
  } else if (currentView === 'month') {
    const ymStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;
    const mNameLow = MONTHS[targetMonth].toLowerCase();
    for (const m of allPaidMovs) {
      const amt = Number(m.monto) || 0;
      const gYm = String(m.fecha || '').slice(0, 7);
      if (m._kind === 'cosecha') {
        const wsYm = String(m._wsIso || '').slice(0, 7);
        if (wsYm === ymStr || gYm === ymStr) paidCosecha += amt;
      } else {
        let inMonth = false;
        if (m._refKind === 'dia' || m._refKind === 'sem') {
          inMonth = String(m._refDate || '').slice(0, 7) === ymStr || gYm === ymStr;
        } else if (m._refKind === 'mes') {
          inMonth = m._refDate === `${targetYear}_${targetMonth + 1}` || gYm === ymStr;
        } else {
          const dLow = String(m.descripcion || '').toLowerCase();
          inMonth = gYm === ymStr || (dLow.includes(mNameLow) && dLow.includes(String(targetYear)));
        }
        if (inMonth) paidPersonal += amt;
      }
    }
  } else if (currentView === 'week') {
    const wStartStr = fmtDate(weekStart);
    paidPersonal = isMatchedNonDraft
      ? (Number(matchedGasto.monto) || 0)
      : (!matchedGasto ? weekDayPaidTotal : 0);
    for (const m of allPaidMovs) {
      if (m._kind === 'cosecha' && m._wsIso === wStartStr) {
        paidCosecha += Number(m.monto) || 0;
      }
    }
  } else {
    // Day view
    if (isMatchedNonDraft) {
      paidPersonal = Number(matchedGasto.monto) || 0;
    } else if (dayCoveredByWeek && isDayWorked) {
      paidPersonal = Math.min(diario, Number(weekPaidGasto.monto) || 0);
    }
    for (const m of allPaidMovs) {
      if (m._kind === 'cosecha' && String(m.fecha || '').slice(0, 10) === targetDateStr) {
        paidCosecha += Number(m.monto) || 0;
      }
    }
  }
  paidPersonal = Math.round(paidPersonal);
  paidCosecha = Math.round(paidCosecha);
  const paidInPeriod = Math.round(paidPersonal + paidCosecha);

  // Compute Footer Action (Enviar / Actualizar / Eliminar en Cuentas)
  const dupAttr = JSON.stringify(duplicateGastoIds).replace(/"/g, '&quot;');
  let footerAction = null;
  if (currentView === 'all') {
    if (curWeekPending > 0) {
      if (curWeekMatched && (curWeekMatched.descripcion || '').includes('[Por Aprobar]')) {
        footerAction = {
          label: 'Enviar semana a Cuentas',
          amountText: `L ${curWeekGross.toLocaleString('es-HN')}`,
          onclick: `window.__enviarPeriodoAGastos(true, '${curWeekMatched.id}', ${curWeekGross}, [], 'week')`
        };
      } else if (curWeekMatched) {
        const prevAmt = Math.round(Number(curWeekMatched.monto) || 0);
        footerAction = {
          label: 'Actualizar en Cuentas',
          isUpdate: true,
          prevAmountText: `L ${prevAmt.toLocaleString('es-HN')}`,
          amountText: `L ${curWeekGross.toLocaleString('es-HN')}`,
          onclick: `window.__enviarPeriodoAGastos(true, '${curWeekMatched.id}', ${curWeekGross}, [], 'week')`
        };
      } else {
        footerAction = {
          label: 'Enviar semana a Cuentas',
          amountText: `L ${curWeekPending.toLocaleString('es-HN')}`,
          onclick: `window.__enviarPeriodoAGastos(false, null, ${curWeekPending}, [], 'week')`
        };
      }
    }
  } else {
    const btnLabel = currentView === 'week' ? 'Enviar semana a Cuentas' : currentView === 'month' ? 'Enviar mes a Cuentas' : 'Enviar día a Cuentas';
    if (!dayCoveredByWeek) {
      if (isWeekCoveredByDays) {
        if (pendienteMostrar > 0) {
          footerAction = {
            label: 'Enviar restante a Cuentas',
            amountText: `L ${pendienteMostrar.toLocaleString('es-HN')}`,
            onclick: `window.__enviarPeriodoAGastos(false, null, ${pendienteMostrar}, ${dupAttr})`
          };
        }
      } else if (matchedGasto) {
        const isDraftPorAprobar = (matchedGasto.descripcion || '').includes('[Por Aprobar]');
        const registradoMonto = Number(matchedGasto.monto) || 0;
        if (isDraftPorAprobar && periodTotal > 0) {
          footerAction = {
            label: btnLabel,
            amountText: `L ${periodTotal.toLocaleString('es-HN')}`,
            onclick: `window.__enviarPeriodoAGastos(true, '${matchedGasto.id}', ${periodTotal}, ${dupAttr})`
          };
        } else if (periodTotal > registradoMonto) {
          footerAction = {
            label: 'Actualizar en Cuentas',
            isUpdate: true,
            prevAmountText: `L ${Math.round(registradoMonto).toLocaleString('es-HN')}`,
            amountText: `L ${periodTotal.toLocaleString('es-HN')}`,
            onclick: `window.__enviarPeriodoAGastos(true, '${matchedGasto.id}', ${periodTotal}, ${dupAttr})`
          };
        } else if (periodTotal < registradoMonto && periodTotal > 0) {
          footerAction = {
            label: 'Actualizar en Cuentas',
            isUpdate: true,
            prevAmountText: `L ${Math.round(registradoMonto).toLocaleString('es-HN')}`,
            amountText: `L ${periodTotal.toLocaleString('es-HN')}`,
            onclick: `window.__enviarPeriodoAGastos(true, '${matchedGasto.id}', ${periodTotal}, ${dupAttr})`
          };
        } else if (periodTotal === 0 && registradoMonto > 0) {
          footerAction = {
            label: 'Eliminar en Cuentas (0 días)',
            isDelete: true,
            amountText: `L ${Math.round(registradoMonto).toLocaleString('es-HN')}`,
            onclick: `window.__enviarPeriodoAGastos(true, '${matchedGasto.id}', 0, ${dupAttr})`
          };
        }
      } else if (!(currentView === 'month' && isMonthHandledByWeeks) && periodTotal > 0) {
        footerAction = {
          label: btnLabel,
          amountText: `L ${periodTotal.toLocaleString('es-HN')}`,
          onclick: `window.__enviarPeriodoAGastos(false, null, ${periodTotal}, ${dupAttr})`
        };
      }
    }
  }

  window._currentDpSummary = {
    periodTotal,
    periodDaysText,
    periodTitle,
    periodKey,
    gastoFecha,
    descPrefix,
    diario,
    personaNombre: persona?.nombre || '',
    footerAction,
    allPaidMovs,
    totalDaysAll,
    paidInPeriod,
    pendienteMostrar
  };

  const cardLabel = currentView === 'all'
    ? 'Total pagado · Histórico'
    : currentView === 'day'
      ? 'Total pagado · Día'
      : currentView === 'week'
        ? 'Total pagado · Semana'
        : 'Total pagado · Mes';

  let bottomLineHtml = '';
  if (paidPersonal > 0 && paidCosecha > 0) {
    bottomLineHtml = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
        <span style="font-size:12px; color:#5a6b58; font-weight:600;">Jornales: L${paidPersonal.toLocaleString('es-HN')} · Cosecha: L${paidCosecha.toLocaleString('es-HN')}</span>
        <button type="button" onclick="window.closeSubBottomSheet?.(); window.navigateTo('gastos')" style="background:none; border:none; font-size:12px; font-weight:800; color:#2d3e2c; cursor:pointer; text-decoration:underline; padding:0; white-space:nowrap;">Ver en Cuentas →</button>
      </div>
    `;
  } else if (paidInPeriod > 0) {
    const srcLbl = paidPersonal > 0 ? 'Personal' : 'Cosecha';
    bottomLineHtml = `
      <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
        <span style="font-size:12px; color:#5a6b58; font-weight:600;">${srcLbl} · Registrado en Cuentas</span>
        <button type="button" onclick="window.closeSubBottomSheet?.(); window.navigateTo('gastos')" style="background:none; border:none; font-size:12px; font-weight:800; color:#2d3e2c; cursor:pointer; text-decoration:underline; padding:0; white-space:nowrap;">Ver en Cuentas →</button>
      </div>
    `;
  } else if (pendienteMostrar > 0) {
    bottomLineHtml = `<span style="font-size:12px; color:#8a4b24; font-weight:600;">Pendiente de enviar a Cuentas (${periodDaysText})</span>`;
  } else {
    bottomLineHtml = `<span style="font-size:12px; color:#5a6b58; font-weight:500;">Sin pagos registrados en este período</span>`;
  }

  return `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px;">
      <div class="m3-p-4 m3-bg-surface-container m3-rounded-2xl dp-summary-days-card" style="display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <p class="m3-label-small m3-text-on-surface-variant">${periodTitle}</p>
          <p class="m3-title-large m3-font-bold m3-text-primary" style="margin: 4px 0 0 0;">${periodDaysText}</p>
        </div>
        <div style="margin-top: 12px; padding-top: 6px; border-top: 1px solid rgba(0,0,0,0.07);">
          <p class="m3-label-small m3-text-on-surface-variant" style="margin: 0; font-size: 12px;">
            Pago por día: <b style="color: var(--m3-on-surface);">L${diario.toLocaleString('es-HN')}</b>
          </p>
        </div>
      </div>

      <div class="m3-p-4 m3-bg-surface-container m3-rounded-2xl" style="display: flex; flex-direction: column; justify-content: space-between;">
        <div>
          <p class="m3-label-small m3-text-on-surface-variant" style="margin: 0;">${cardLabel}</p>
          <p class="m3-title-large m3-font-bold" style="margin: 4px 0 0 0; color: ${paidInPeriod > 0 ? '#1b6e1b' : '#111827'};">L${paidInPeriod.toLocaleString('es-HN')}</p>
        </div>
        <div style="margin-top: 12px; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.07);">
          ${bottomLineHtml}
        </div>
      </div>
    </div>
  `;
}

export function initDetallePersonal(personalId, returnScreen, returnId, { initialView = 'month' } = {}) {
  const _personalId = personalId;
  const pre = window._dpPreloaded && String(window._dpPreloaded.personalId) === String(personalId)
    ? window._dpPreloaded
    : null;
  window._dpPreloaded = null;

  let _currentActividadesMap = pre?.actividadesMap || window._currentActividadesMap || {};
  let _persona = pre?.persona || null;
  let _gastosPersonal = pre?.gastosPersonal || [];
  let _asisData = pre?.asisData || [];

  let currentView = (initialView === 'day' || initialView === 'week' || initialView === 'all') ? initialView : 'month';
  let calDate = new Date();
  calDate.setHours(0, 0, 0, 0);

  function getViewTitle() {
    if (currentView === 'all') {
      return 'Histórico de pagos';
    }
    if (currentView === 'month') {
      return `${MONTHS[calDate.getMonth()]} ${calDate.getFullYear()}`;
    }
    if (currentView === 'week') {
      const ws = getWeekStart(calDate);
      const we = new Date(ws);
      we.setDate(ws.getDate() + 6);
      const mLbl = ws.getMonth() === we.getMonth()
        ? MONTHS[ws.getMonth()]
        : `${MONTHS[ws.getMonth()]} - ${MONTHS[we.getMonth()]}`;
      return `Semana ${ws.getDate()} - ${we.getDate()} ${mLbl} ${ws.getFullYear()}`;
    }
    return `${DAYS_FULL[calDate.getDay()]}, ${calDate.getDate()} de ${MONTHS[calDate.getMonth()]} ${calDate.getFullYear()}`;
  }

  function getWeekStart(d) {
    const ws = new Date(d);
    ws.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1));
    ws.setHours(0, 0, 0, 0);
    return ws;
  }

  function bindDpWorkFooterSwipe() {
    const wraps = document.querySelectorAll('#dp-mobile-footer-bar .dp-work-swipe-wrap');
    wraps.forEach(wrap => {
      if (wrap.dataset.swipeBound === '1') return;
      wrap.dataset.swipeBound = '1';
      const btn = wrap.querySelector('.dp-work-swipe-btn');
      const bg = wrap.querySelector('.dp-work-swipe-bg');
      if (!btn || !bg) return;

      let startX = 0;
      let startY = 0;
      let dragging = false;
      let isSwiping = false;
      let justSwiped = false;
      let lastDx = 0;

      const resetVisual = () => {
        btn.style.transition = 'transform .18s cubic-bezier(0.22,1,0.36,1)';
        btn.style.transform = 'translateX(0)';
        bg.style.opacity = '0';
      };

      const startDrag = (x, y) => {
        startX = x;
        startY = y;
        dragging = true;
        isSwiping = false;
        lastDx = 0;
        btn.style.transition = 'none';
      };

      const moveDrag = (x, y) => {
        if (!dragging) return;
        const dx = x - startX;
        const dy = y - startY;
        if (!isSwiping) {
          if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) {
            dragging = false;
            return;
          }
          if (dx > 8 && dx > Math.abs(dy) * 1.1) {
            isSwiping = true;
          }
        }
        if (isSwiping) {
          const maxPull = Math.max(96, wrap.offsetWidth * 0.72);
          lastDx = Math.max(0, Math.min(maxPull, dx));
          btn.style.transform = `translateX(${lastDx}px)`;
          bg.style.opacity = String(Math.min(1, lastDx / 42));
        }
      };

      const endDrag = async () => {
        if (!dragging) return;
        dragging = false;
        const threshold = Math.max(48, wrap.offsetWidth * 0.34);
        if (isSwiping && lastDx >= threshold) {
          justSwiped = true;
          setTimeout(() => { justSwiped = false; }, 120);
          btn.style.transition = 'transform .14s ease-out';
          btn.style.transform = `translateX(${wrap.offsetWidth || 160}px)`;
          bg.style.opacity = '1';
          await new Promise(r => setTimeout(r, 130));
          await window.__calSetDayEstado?.('descanso');
          if (btn.isConnected) resetVisual();
        } else if (isSwiping) {
          justSwiped = true;
          setTimeout(() => { justSwiped = false; }, 80);
          resetVisual();
        }
        isSwiping = false;
        lastDx = 0;
      };

      btn.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        e.stopPropagation();
        startDrag(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      btn.addEventListener('touchmove', (e) => {
        if (!dragging || e.touches.length !== 1) return;
        moveDrag(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });
      btn.addEventListener('touchend', () => { endDrag(); }, { passive: true });
      btn.addEventListener('touchcancel', () => { dragging = false; isSwiping = false; lastDx = 0; resetVisual(); }, { passive: true });

      btn.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        e.stopPropagation();
        startDrag(e.clientX, e.clientY);
        const onMouseMove = (ev) => moveDrag(ev.clientX, ev.clientY);
        const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          endDrag();
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      btn.addEventListener('click', (e) => {
        if (justSwiped) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        window.__dpOpenWorkSheet?.();
      });
    });
  }
  bindDpWorkFooterSwipe();

  async function refreshCalendar(fromMemory = false) {
    let persona = _persona || {};
    let asisData = Array.isArray(_asisData) ? _asisData : [];
    let gastosPersonal = _gastosPersonal || [];
    let actividadesMap = _currentActividadesMap || {};

    if (!fromMemory || !_persona) {
      const [personaArr, asistencia, fetchedGastos] = await Promise.all([
        restFetch(`/rest/v1/personal?id=eq.${encodeURIComponent(_personalId)}&select=*`).catch(() => []),
        restFetch(`/rest/v1/personal_asistencia?personal_id=eq.${encodeURIComponent(_personalId)}&order=fecha.desc&select=*`).catch(() => []),
        fetchGastosPersonal()
      ]);
      persona = (Array.isArray(personaArr) ? personaArr[0] : personaArr) || {};
      _persona = persona;
      gastosPersonal = fetchedGastos || [];
      _gastosPersonal = gastosPersonal;

      actividadesMap = await fetchActividadesMap(
        _personalId,
        window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '',
        persona.nombre
      );
      _currentActividadesMap = actividadesMap || {};
      window._currentActividadesMap = _currentActividadesMap;

      asisData = Array.isArray(asistencia) ? asistencia : [];
      _asisData = asisData;
    }

    const asisMap = {};
    asisData.forEach(a => {
      const f = (a.fecha || '').slice(0, 10);
      if (f) asisMap[f] = a.estado;
    });

    const summary = document.getElementById('cal-summary');
    if (summary) {
      summary.innerHTML = renderSummary(asisData, persona?.pago_diario, calDate.getMonth(), calDate.getFullYear(), calDate, actividadesMap, currentView, persona, _gastosPersonal);
      const subEl = document.getElementById('dp-header-subtitle');
      if (subEl && window._currentDpSummary) {
        subEl.textContent = `${window._currentDpSummary.periodDaysText} · Pago por día: L${Number(window._currentDpSummary.diario || 0).toLocaleString('es-HN')}`;
      }
    }

    const calContainer = document.getElementById('cal-container');
    if (calContainer) {
      if (currentView === 'all') {
        calContainer.innerHTML = renderAllPaymentsView(window._currentDpSummary?.allPaidMovs || [], window._currentDpSummary?.totalDaysAll || 0, persona?.nombre || '');
      } else if (currentView === 'month') {
        calContainer.innerHTML = renderMonthView(calDate.getMonth(), calDate.getFullYear(), asisMap, actividadesMap);
      } else if (currentView === 'week') {
        calContainer.innerHTML = renderWeekView(getWeekStart(calDate), asisMap, actividadesMap);
      } else {
        calContainer.innerHTML = renderDayView(calDate, asisMap, actividadesMap);
      }
    }

    const navRow = document.querySelector('.dp-cal-nav-row');
    if (navRow) {
      navRow.style.visibility = currentView === 'all' ? 'hidden' : 'visible';
    }

    const title = document.getElementById('cal-title');
    if (title) title.textContent = getViewTitle();

    const footerAct = window._currentDpSummary?.footerAction || null;
    const mobileFooter = document.getElementById('dp-mobile-footer-bar');
    if (mobileFooter) {
      const selStr = fmtDate(calDate);
      const isSelFuture = selStr > fmtDate(new Date());
      mobileFooter.innerHTML = renderDayActionsBar(asisMap[selStr], isSelFuture, (actividadesMap[selStr] || []).length > 0, footerAct);
      bindDpWorkFooterSwipe();
    }

    const desktopFooter = document.getElementById('dp-desktop-footer-bar');
    if (desktopFooter) {
      desktopFooter.innerHTML = renderDesktopFooterAction(footerAct);
    }
  }

  window.__calNavigate = (dir) => {
    if (currentView === 'all') return;
    if (currentView === 'month') {
      calDate.setMonth(calDate.getMonth() + dir);
    } else if (currentView === 'week') {
      calDate.setDate(calDate.getDate() + dir * 7);
    } else {
      calDate.setDate(calDate.getDate() + dir);
    }
    refreshCalendar(true);
  };

  window.__calSetView = (view) => {
    currentView = view;
    document.querySelectorAll('.cal-view-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    requestAnimationFrame(() => {
      const activeBtn = document.querySelector(`.dp-cal-views .cal-view-btn[data-view="${view}"]`);
      try { activeBtn?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' }); } catch (_) {}
    });
    refreshCalendar(true);
  };

  const swipeEl = document.getElementById('cal-container');
  if (swipeEl && !swipeEl.dataset.swipeBound) {
    swipeEl.dataset.swipeBound = '1';
    swipeEl.style.touchAction = 'pan-y';
    if (swipeEl.parentElement) swipeEl.parentElement.style.overflowX = 'hidden';
    let sx = 0;
    let sy = 0;
    let tracking = false;
    let isHoriz = false;
    swipeEl.addEventListener('touchstart', (e) => {
      if (e.touches.length !== 1 || currentView === 'all') return;
      sx = e.touches[0].clientX;
      sy = e.touches[0].clientY;
      tracking = true;
      isHoriz = false;
      swipeEl.style.transition = 'none';
    }, { passive: true });
    swipeEl.addEventListener('touchmove', (e) => {
      if (!tracking || e.touches.length !== 1) return;
      const dx = e.touches[0].clientX - sx;
      const dy = e.touches[0].clientY - sy;
      if (!isHoriz && Math.abs(dx) > 10 && Math.abs(dx) > Math.abs(dy) * 1.1) {
        isHoriz = true;
      }
      if (isHoriz) {
        const clamped = Math.max(-90, Math.min(90, dx * 0.55));
        swipeEl.style.transform = `translateX(${clamped}px)`;
        swipeEl.style.opacity = String(Math.max(0.45, 1 - Math.abs(clamped) / 160));
      }
    }, { passive: true });
    const endSwipe = (e) => {
      if (!tracking) return;
      tracking = false;
      const touch = e.changedTouches?.[0];
      const dx = touch ? touch.clientX - sx : 0;
      const dy = touch ? touch.clientY - sy : 0;
      if (isHoriz && Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) {
        const dir = dx < 0 ? 1 : -1;
        swipeEl.style.transition = 'transform 110ms ease-in, opacity 110ms ease-in';
        swipeEl.style.transform = `translateX(${dir > 0 ? '-42px' : '42px'})`;
        swipeEl.style.opacity = '0';
        setTimeout(() => {
          window.__calNavigate?.(dir);
          swipeEl.style.transition = 'none';
          swipeEl.style.transform = `translateX(${dir > 0 ? '42px' : '-42px'})`;
          swipeEl.style.opacity = '0';
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              swipeEl.style.transition = 'transform 220ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease-out';
              swipeEl.style.transform = 'translateX(0)';
              swipeEl.style.opacity = '1';
            });
          });
        }, 110);
      } else {
        swipeEl.style.transition = 'transform 180ms cubic-bezier(0.22, 1, 0.36, 1), opacity 180ms ease-out';
        swipeEl.style.transform = 'translateX(0)';
        swipeEl.style.opacity = '1';
      }
    };
    swipeEl.addEventListener('touchend', endSwipe, { passive: true });
    swipeEl.addEventListener('touchcancel', endSwipe, { passive: true });
  }

  window.__dpOpenWorkSheet = async () => {
    try {
      const dateStr = fmtDate(calDate);
      const todayStr = fmtDate(new Date());
      if (dateStr > todayStr) {
        window.Snackbar?.show('No se puede registrar asistencia en fechas futuras', { type: 'warning' });
        return;
      }

      const eid = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || _persona?.empresa_id || '';
      const [lotesRes, potrerosRes] = await Promise.all([
        restFetch(eid ? `/rest/v1/lotes?empresa_id=eq.${encodeURIComponent(eid)}&select=id,nombre&order=nombre.asc` : '/rest/v1/lotes?select=id,nombre&order=nombre.asc').catch(() => []),
        restFetch(eid ? `/rest/v1/potreros?empresa_id=eq.${encodeURIComponent(eid)}&select=id,nombre&order=nombre.asc` : '/rest/v1/potreros?select=id,nombre&order=nombre.asc').catch(() => [])
      ]);
      const lotesList = Array.isArray(lotesRes) ? lotesRes : [];
      const potrerosList = Array.isArray(potrerosRes) ? potrerosRes : [];

      const [yNum, mNum, dNum] = dateStr.split('-').map(Number);
      const dObj = new Date(yNum, (mNum || 1) - 1, dNum || 1);
      const fechaBonita = `${DAYS_FULL[dObj.getDay()]} ${dNum} de ${MONTHS[(mNum || 1) - 1]}`;
      const personaNombre = _persona?.nombre || document.getElementById('dp-persona-nombre')?.value || 'Colaborador';
      const hasExisting = (_asisData || []).some(a => (a.fecha || '').slice(0, 10) === dateStr && isTrabajo(a.estado)) || ((_currentActividadesMap[dateStr] || []).length > 0);

      let selectedArea = 'cafe';
      const CAFE_TIPOS = ['Limpieza', 'Fertilización al Suelo', 'Aplicación Foliar', 'Manejo de Tejido', 'Resiembra', 'Otra labor en cafetal'];
      const POT_TIPOS = ['Chapia / Limpieza', 'Mantenimiento de Cerca', 'Fumigación / Maleza', 'Abono / Siembra de Pasto', 'Riego', 'Revisión / Rotación', 'Otra labor en potrero'];

      showModal(hasExisting ? 'Agregar actividad del día' : 'Registrar jornada de trabajo', `
        <div style="display:flex; flex-direction:column; gap:14px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; background:#f2f5f0; padding:8px 12px; border-radius:12px;">
            <span style="font-size:12.5px; font-weight:700; color:#2d3e2c;">${dpEscapeHtml(personaNombre)}</span>
            <span style="font-size:11.5px; font-weight:600; color:#5a6b58;">${dpEscapeHtml(fechaBonita)}</span>
          </div>

          <div>
            <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; color:#5a6b58; margin-bottom:6px;">Área de trabajo</div>
            <div style="display:grid; grid-template-columns:repeat(3, 1fr); gap:8px;">
              <button type="button" class="dp-wk-area-btn" data-area="cafe" style="height:38px; border-radius:999px; border:1.5px solid #2d3e2c; background:#2d3e2c; color:#ffffff; font-family:'Work Sans',sans-serif; font-size:12.5px; font-weight:700; cursor:pointer;">🌱 Café</button>
              <button type="button" class="dp-wk-area-btn" data-area="potrero" style="height:38px; border-radius:999px; border:1px solid #d5e2d2; background:#ffffff; color:#2d3e2c; font-family:'Work Sans',sans-serif; font-size:12.5px; font-weight:700; cursor:pointer;">🐄 Potreros</button>
              <button type="button" class="dp-wk-area-btn" data-area="otro" style="height:38px; border-radius:999px; border:1px solid #d5e2d2; background:#ffffff; color:#2d3e2c; font-family:'Work Sans',sans-serif; font-size:12.5px; font-weight:700; cursor:pointer;">📋 Otra labor</button>
            </div>
          </div>

          <div id="dp-wk-cafe-panel" style="display:flex; flex-direction:column; gap:12px;">
            <div class="m3-field has-value" style="margin-bottom:0;">
              <select id="dp-wk-lote" style="background:#ffffff;">
                ${lotesList.length ? lotesList.map(l => `<option value="${dpEscapeHtml(l.id)}">${dpEscapeHtml(l.nombre)}</option>`).join('') : '<option value="">Sin lotes registrados</option>'}
              </select>
              <label for="dp-wk-lote" style="background:#ffffff;">Lote de café</label>
            </div>
            <div class="m3-field has-value" style="margin-bottom:0;">
              <select id="dp-wk-cafe-tipo" style="background:#ffffff;">
                ${CAFE_TIPOS.map(t => `<option value="${dpEscapeHtml(t)}">${dpEscapeHtml(t)}</option>`).join('')}
              </select>
              <label for="dp-wk-cafe-tipo" style="background:#ffffff;">Actividad realizada</label>
            </div>
            <div id="dp-wk-limpieza-chips" style="display:flex; flex-wrap:wrap; gap:6px;">
              <button type="button" class="dp-wk-chip" data-val="Machete" style="padding:5px 12px; border-radius:999px; border:1px solid #d5e2d2; background:#f4f7f3; color:#2d3e2c; font-size:12px; font-weight:700; cursor:pointer;">Machete</button>
              <button type="button" class="dp-wk-chip" data-val="Motoguadaña" style="padding:5px 12px; border-radius:999px; border:1px solid #d5e2d2; background:#f4f7f3; color:#2d3e2c; font-size:12px; font-weight:700; cursor:pointer;">Motoguadaña</button>
              <button type="button" class="dp-wk-chip" data-val="Desyerbe" style="padding:5px 12px; border-radius:999px; border:1px solid #d5e2d2; background:#f4f7f3; color:#2d3e2c; font-size:12px; font-weight:700; cursor:pointer;">Desyerbe</button>
            </div>
            <div class="m3-field" id="dp-wk-cafe-op-wrap" style="margin-bottom:0;">
              <input type="text" id="dp-wk-cafe-op" placeholder=" " style="background:#ffffff;">
              <label for="dp-wk-cafe-op" style="background:#ffffff;">Operación / detalle (ej. Machete, Abono)</label>
            </div>
          </div>

          <div id="dp-wk-pot-panel" style="display:none; flex-direction:column; gap:12px;">
            <div class="m3-field has-value" style="margin-bottom:0;">
              <select id="dp-wk-potrero" style="background:#ffffff;">
                ${potrerosList.length ? potrerosList.map(pt => `<option value="${dpEscapeHtml(pt.id)}">${dpEscapeHtml(pt.nombre)}</option>`).join('') : '<option value="">Sin potreros registrados</option>'}
              </select>
              <label for="dp-wk-potrero" style="background:#ffffff;">Potrero</label>
            </div>
            <div class="m3-field has-value" style="margin-bottom:0;">
              <select id="dp-wk-pot-tipo" style="background:#ffffff;">
                ${POT_TIPOS.map(t => `<option value="${dpEscapeHtml(t)}">${dpEscapeHtml(t)}</option>`).join('')}
              </select>
              <label for="dp-wk-pot-tipo" style="background:#ffffff;">Actividad realizada</label>
            </div>
            <div class="m3-field" id="dp-wk-pot-desc-wrap" style="margin-bottom:0;">
              <input type="text" id="dp-wk-pot-desc" placeholder=" " style="background:#ffffff;">
              <label for="dp-wk-pot-desc" style="background:#ffffff;">Detalle u operación realizada (opcional)</label>
            </div>
          </div>

          <div id="dp-wk-otro-panel" style="display:none; flex-direction:column; gap:12px;">
            <div class="m3-field" id="dp-wk-otro-desc-wrap" style="margin-bottom:0;">
              <input type="text" id="dp-wk-otro-desc" placeholder=" " style="background:#ffffff;">
              <label for="dp-wk-otro-desc" style="background:#ffffff;">¿Qué actividad realizó?</label>
            </div>
          </div>

          <div id="dp-wk-err" style="display:none; font-size:12px; font-weight:600; color:#ba1a1a; padding-left:4px;"></div>

          <div style="display:grid; grid-template-columns:1fr 1.5fr; gap:10px; margin-top:2px;">
            <button type="button" id="dp-wk-cancel" style="height:44px; border-radius:999px; border:1px solid #d5e2d2; background:#ffffff; color:#2d3e2c; font-size:14px; font-weight:700; cursor:pointer;">Cancelar</button>
            <button type="button" id="dp-wk-save" style="height:44px; border-radius:999px; border:none; background:#2d3e2c; color:#ffffff; font-size:14px; font-weight:700; cursor:pointer;">Guardar jornada</button>
          </div>

          ${!hasExisting ? `
            <button type="button" id="dp-wk-only-asis" style="background:none; border:none; padding:4px; font-size:12px; font-weight:700; color:#5a6b58; text-decoration:underline; cursor:pointer; text-align:center;">
              Solo marcar asistencia sin registrar actividad
            </button>
          ` : ''}
        </div>
      `);

      document.getElementById('modal-container')?.classList.add('modal-sheet-expanded');

      const cafePanel = document.getElementById('dp-wk-cafe-panel');
      const potPanel = document.getElementById('dp-wk-pot-panel');
      const otroPanel = document.getElementById('dp-wk-otro-panel');
      const errEl = document.getElementById('dp-wk-err');
      const cafeTipoSel = document.getElementById('dp-wk-cafe-tipo');
      const chipsRow = document.getElementById('dp-wk-limpieza-chips');
      const cafeOpInp = document.getElementById('dp-wk-cafe-op');

      const syncInputHasVal = (inp) => {
        const wrap = inp?.closest('.m3-field');
        if (wrap) wrap.classList.toggle('has-value', Boolean(String(inp.value || '').trim()));
      };
      ['dp-wk-cafe-op', 'dp-wk-pot-desc', 'dp-wk-otro-desc'].forEach(id => {
        const el = document.getElementById(id);
        el?.addEventListener('input', () => syncInputHasVal(el));
      });

      document.querySelectorAll('.dp-wk-area-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedArea = btn.dataset.area || 'cafe';
          document.querySelectorAll('.dp-wk-area-btn').forEach(b => {
            const act = b.dataset.area === selectedArea;
            b.style.background = act ? '#2d3e2c' : '#ffffff';
            b.style.borderColor = act ? '#2d3e2c' : '#d5e2d2';
            b.style.color = act ? '#ffffff' : '#2d3e2c';
          });
          if (cafePanel) cafePanel.style.display = selectedArea === 'cafe' ? 'flex' : 'none';
          if (potPanel) potPanel.style.display = selectedArea === 'potrero' ? 'flex' : 'none';
          if (otroPanel) otroPanel.style.display = selectedArea === 'otro' ? 'flex' : 'none';
          if (errEl) errEl.style.display = 'none';
        });
      });

      cafeTipoSel?.addEventListener('change', () => {
        if (chipsRow) chipsRow.style.display = cafeTipoSel.value === 'Limpieza' ? 'flex' : 'none';
      });

      document.querySelectorAll('.dp-wk-chip').forEach(chip => {
        chip.addEventListener('click', () => {
          if (cafeOpInp) {
            cafeOpInp.value = chip.dataset.val || '';
            syncInputHasVal(cafeOpInp);
          }
          document.querySelectorAll('.dp-wk-chip').forEach(c => {
            const act = c === chip;
            c.style.background = act ? '#2d3e2c' : '#f4f7f3';
            c.style.borderColor = act ? '#2d3e2c' : '#d5e2d2';
            c.style.color = act ? '#ffffff' : '#2d3e2c';
          });
        });
      });

      document.getElementById('dp-wk-cancel')?.addEventListener('click', () => closeModal());

      document.getElementById('dp-wk-only-asis')?.addEventListener('click', async () => {
        try {
          await persistAsistencia(_personalId, eid, dateStr, true);
          window.clearScreenCache?.('personal');
          window.clearScreenCache?.('gastos');
          closeModal();
          window.Snackbar?.show(`✔ ${dNum} de ${MONTHS[(mNum || 1) - 1]}: Marcado como Trabajó`);
          await refreshCalendar();
        } catch (err) {
          window.Snackbar?.show('Error guardando asistencia: ' + (err.message || err), { type: 'error' });
        }
      });

      document.getElementById('dp-wk-save')?.addEventListener('click', async () => {
        const saveBtn = document.getElementById('dp-wk-save');
        if (errEl) errEl.style.display = 'none';

        const loteId = document.getElementById('dp-wk-lote')?.value || '';
        const cafeTipo = document.getElementById('dp-wk-cafe-tipo')?.value || 'Limpieza';
        const cafeOp = String(document.getElementById('dp-wk-cafe-op')?.value || '').trim();
        const potId = document.getElementById('dp-wk-potrero')?.value || '';
        const potTipo = document.getElementById('dp-wk-pot-tipo')?.value || 'Chapia / Limpieza';
        const potDesc = String(document.getElementById('dp-wk-pot-desc')?.value || '').trim();
        const otroDesc = String(document.getElementById('dp-wk-otro-desc')?.value || '').trim();

        if (selectedArea === 'cafe' && !loteId) {
          if (errEl) { errEl.textContent = 'Selecciona un lote de café.'; errEl.style.display = 'block'; }
          return;
        }
        if (selectedArea === 'potrero' && !potId) {
          if (errEl) { errEl.textContent = 'Selecciona un potrero.'; errEl.style.display = 'block'; }
          return;
        }
        if (selectedArea === 'otro' && !otroDesc) {
          if (errEl) { errEl.textContent = 'Describe la actividad que realizó.'; errEl.style.display = 'block'; }
          document.getElementById('dp-wk-otro-desc')?.focus();
          return;
        }

        if (saveBtn) {
          saveBtn.disabled = true;
          saveBtn.textContent = 'Guardando...';
        }
        try {
          await persistAsistencia(_personalId, eid, dateStr, true);

          if (selectedArea === 'cafe') {
            const metodo = cafeTipo === 'Aplicación Foliar' ? 'Foliar' : 'Manual';
            const producto = cafeOp || (cafeTipo === 'Limpieza' ? 'Chapia' : cafeTipo);
            const payload = {
              lote_id: loteId,
              fecha: dateStr,
              tipo: cafeTipo,
              metodo,
              producto,
              dosis: '',
              operador: personaNombre,
              personal_ids: JSON.stringify([String(_personalId)]),
              estado: 'Aplicada',
              observaciones: ''
            };
            if (eid) payload.empresa_id = eid;
            let insRes = null;
            try {
              insRes = await restInsert('/rest/v1/lote_aplicaciones', payload);
            } catch (insErr) {
              if (String(insErr?.message || insErr).includes('personal_ids')) {
                const fallbackPayload = { ...payload };
                delete fallbackPayload.personal_ids;
                insRes = await restInsert('/rest/v1/lote_aplicaciones', fallbackPayload);
              } else {
                throw insErr;
              }
            }
            try {
              await db.table('lote_aplicaciones').put({ id: insRes?.id || crypto.randomUUID(), ...payload, created_at: new Date().toISOString() });
            } catch (_) {}
            window.clearScreenCache?.('detalle_lote');
            window.clearScreenCache?.('plan_ifcafe');
            window.clearScreenCache?.('dashboard');
          } else if (selectedArea === 'potrero') {
            const lowT = potTipo.toLowerCase();
            const potIcon = lowT.includes('cerca')
              ? 'fence'
              : (lowT.includes('fumig') || lowT.includes('maleza'))
                ? 'bug_report'
                : lowT.includes('riego')
                  ? 'water_drop'
                  : (lowT.includes('abono') || lowT.includes('siembra'))
                    ? 'grass'
                    : 'history';
            const potPayload = {
              potrero_id: potId,
              fecha: dateStr,
              evento: potTipo,
              descripcion: `${potDesc ? potDesc + ' · ' : ''}Responsable: ${personaNombre} [pid:${_personalId}]`,
              icon: potIcon
            };
            if (eid) potPayload.empresa_id = eid;
            const insPot = await restInsert('/rest/v1/potrero_eventos', potPayload);
            try {
              await db.table('potrero_eventos').put({ id: insPot?.id || crypto.randomUUID(), ...potPayload, created_at: new Date().toISOString() });
            } catch (_) {}
            window.clearScreenCache?.('potreros');
            window.clearScreenCache?.('detalle_potrero');
          } else {
            saveCustomWorkItem(eid, _personalId, dateStr, otroDesc);
          }

          window.clearScreenCache?.('personal');
          window.clearScreenCache?.('gastos');
          closeModal();
          window.Snackbar?.show(`✔ Jornada registrada para ${fechaBonita}`);
          await refreshCalendar();
        } catch (err) {
          console.error('Error saving work sheet:', err);
          if (errEl) {
            errEl.textContent = 'Error guardando: ' + (err.message || err);
            errEl.style.display = 'block';
          }
          if (saveBtn) {
            saveBtn.disabled = false;
            saveBtn.textContent = 'Guardar jornada';
          }
        }
      });
    } catch (err) {
      window.Snackbar?.show('Error abriendo registro: ' + (err.message || err), { type: 'error' });
    }
  };

  window.__calToggleDay = async (dateStr) => {
    try {
      const todayStr = fmtDate(new Date());
      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      calDate = dateObj;

      if (document.getElementById('lp-sheet-dp-body')) {
        await refreshCalendar();
        const selectedEl = document.querySelector(`#lp-sheet-dp-body [onclick*="'${dateStr}'"]`);
        if (selectedEl) selectedEl.style.outline = '2px solid #2d3e2c';
        return;
      }

      if (dateStr > todayStr) {
        window.Snackbar?.show('No se puede registrar asistencia en fechas futuras', { type: 'warning' });
        return;
      }
      if (_currentActividadesMap[dateStr]?.length > 0) {
        window.Snackbar?.show('Este día ya cuenta como trabajado por actividad registrada');
        return;
      }

      const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
      const existentes = await restFetch(`/rest/v1/personal_asistencia?personal_id=eq.${encodeURIComponent(_personalId)}&fecha=eq.${dateStr}&select=*`).catch(() => []);
      const existente = (Array.isArray(existentes) ? existentes[0] : existentes) || null;

      const diaNombre = DAYS_FULL[dateObj.getDay()];
      const fechaBonita = `${diaNombre} ${d} de ${MONTHS[m - 1]}`;

      const handleSet = async (wantWork) => {
        try {
          const finalEstado = await persistAsistencia(_personalId, empresaId, dateStr, wantWork);
          if (!wantWork) clearCustomWorkDate(empresaId, _personalId, dateStr);
          window.clearScreenCache?.('personal');
          window.Snackbar?.show(
            isTrabajo(finalEstado)
              ? `✔ ${d} de ${MONTHS[m - 1]}: Marcado como Trabajó`
              : `✘ ${d} de ${MONTHS[m - 1]}: Marcado como Descanso`
          );
          await refreshCalendar();
        } catch (err) {
          console.error('Error saving asistencia:', err);
          const msg = err?.message || 'Error desconocido';
          window.Snackbar?.show('Error al registrar asistencia: ' + msg, { type: 'error' });
        }
      };

      const handleDelete = async () => {
        try {
          if (existente?.id) {
            await restFetch(`/rest/v1/personal_asistencia?id=eq.${existente.id}`, { method: 'DELETE' });
            clearCustomWorkDate(empresaId, _personalId, dateStr);
            window.clearScreenCache?.('personal');
            window.Snackbar?.show(`Registro de asistencia eliminado para el ${d} de ${MONTHS[m - 1]}`);
            await refreshCalendar();
          }
        } catch (err) {
          console.error('Error deleting asistencia:', err);
          window.Snackbar?.show('Error al eliminar: ' + (err.message || 'Error desconocido'), { type: 'error' });
        }
      };

      const actions = [
        {
          text: '✔ Trabajó',
          style: 'background: #2d3e2c; color: #ffffff; border-radius: 9999px; padding: 8px 16px; font-weight: 700; border: none; cursor: pointer;',
          onClick: () => window.__dpOpenWorkSheet()
        },
        {
          text: '✘ Descanso',
          style: 'background: rgba(186, 26, 26, 0.1); color: #ba1a1a; border: 1.5px solid #ba1a1a; border-radius: 9999px; padding: 7px 16px; font-weight: 700; cursor: pointer;',
          onClick: () => handleSet(false)
        }
      ];

      if (existente) {
        actions.push({
          text: '🗑 Quitar',
          style: 'background: transparent; color: var(--m3-on-surface-variant); border: 1px solid var(--m3-outline-variant); border-radius: 9999px; padding: 7px 12px; font-weight: 600; cursor: pointer;',
          onClick: () => handleDelete()
        });
      }

      actions.push({
        text: 'Cancelar',
        style: 'background: transparent; color: #888; border: none; padding: 7px 12px; cursor: pointer;',
        onClick: () => {}
      });

      const estadoActual = existente 
        ? (isTrabajo(existente.estado) ? '<span style="color:#2d3e2c;font-weight:700;">(Actualmente: Trabajó)</span>' : '<span style="color:#ba1a1a;font-weight:700;">(Actualmente: Descanso)</span>')
        : '<span style="color:#777;">(Sin registrar)</span>';

      window.Snackbar?.dismissAll();
      window.Snackbar?.confirm(
        `<div><div style="font-weight:800;font-size:15px;color:#2d3e2c;margin-bottom:2px;">${fechaBonita}</div><div style="font-size:13px;color:#444;">¿El trabajador laboró este día? ${estadoActual}</div></div>`,
        null,
        null,
        {
          actions,
          theme: 'white',
          persist: true
        }
      );
    } catch (err) {
      console.error('Error toggling day:', err);
      const msg = err?.message || 'Error desconocido';
      window.Snackbar?.show('Error: ' + msg, { type: 'error' });
    }
  };

  window.__calSetDayEstado = async (estado) => {
    try {
      const dateStr = fmtDate(calDate);
      const todayStr = fmtDate(new Date());
      if (dateStr > todayStr) {
        if (!document.getElementById('lp-sheet-dp-body')) {
          window.Snackbar?.show('No se puede registrar asistencia en fechas futuras', { type: 'warning' });
        }
        return;
      }

      const wantWork = isTrabajo(estado);
      const dayActs = _currentActividadesMap[dateStr] || [];
      const hasLinkedAreaAct = dayActs.some(a => !a.source || a.source === 'cafetal' || a.source === 'potrero');
      if (!wantWork && hasLinkedAreaAct) {
        window.Snackbar?.show('Este día ya cuenta como trabajado por actividad registrada en cafetal o potrero');
        return;
      }
      if (wantWork) {
        await window.__dpOpenWorkSheet();
        return;
      }

      const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
      const [y, m, d] = dateStr.split('-').map(Number);

      const finalEstado = await persistAsistencia(_personalId, empresaId, dateStr, false);
      clearCustomWorkDate(empresaId, _personalId, dateStr);
      window.clearScreenCache?.('personal');

      window.Snackbar?.show(
        isTrabajo(finalEstado)
          ? `✔ ${d} de ${MONTHS[m - 1]}: Marcado como Trabajó`
          : `✘ ${d} de ${MONTHS[m - 1]}: Marcado como Descanso`
      );

      await refreshCalendar();
    } catch (err) {
      console.error('Error setting day estado:', err);
      const msg = err?.message || 'Error desconocido';
      if (msg.includes('personal_asistencia_estado_check')) {
        window.Snackbar?.show('Restricción en BD activa. Ejecuta en Supabase: ALTER TABLE personal_asistencia DROP CONSTRAINT IF EXISTS personal_asistencia_estado_check;', { type: 'error', duration: 7000 });
      } else {
        window.Snackbar?.show('Error al registrar asistencia: ' + msg, { type: 'error' });
      }
    }
  };

  window.__enviarPeriodoAGastos = async (isUpdate = false, existingGastoId = null, forcedTotal = null, duplicateIds = [], overrideView = null) => {
    try {
      const effectiveView = overrideView || currentView;
      const isOverride = Boolean(overrideView && overrideView !== currentView);
      const summaryInfo = window._currentDpSummary || {};
      let diario = Number(_persona?.pago_diario || document.getElementById('dp-pago-diario')?.value || summaryInfo.diario || 0);
      let personaNombre = _persona?.nombre || document.getElementById('dp-persona-nombre')?.value || summaryInfo.personaNombre || '';

      if (diario <= 0 || !personaNombre) {
        const pArr = await restFetch(`/rest/v1/personal?id=eq.${encodeURIComponent(_personalId)}&select=*`).catch(() => []);
        const pObj = (Array.isArray(pArr) ? pArr[0] : pArr) || {};
        if (pObj.pago_diario) diario = Number(pObj.pago_diario);
        if (pObj.nombre) personaNombre = pObj.nombre;
        _persona = pObj;
      }

      if (diario <= 0) {
        window.Snackbar?.show('Este trabajador no tiene configurado un pago por día', { type: 'warning' });
        return;
      }

      let periodTotal = (forcedTotal != null)
        ? Number(forcedTotal)
        : (summaryInfo.periodTotal || 0);

      let periodTitle = isOverride ? '' : (summaryInfo.periodTitle || '');
      let periodDaysText = summaryInfo.periodDaysText || '';
      let periodKey = isOverride ? '' : (summaryInfo.periodKey || '');
      let gastoFecha = isOverride ? '' : (summaryInfo.gastoFecha || '');
      let descPrefix = isOverride ? '' : (summaryInfo.descPrefix || '');

      if (forcedTotal != null && diario > 0) {
        const calcDays = Math.round(periodTotal / diario);
        periodDaysText = `${calcDays} ${calcDays === 1 ? 'día' : 'días'}`;
      }

      if (isOverride || periodTotal <= 0 || !periodTitle || !gastoFecha) {
        if (!_asisData || _asisData.length === 0) {
          const asisRes = await restFetch(`/rest/v1/personal_asistencia?personal_id=eq.${encodeURIComponent(_personalId)}&order=fecha.desc&select=*`).catch(() => []);
          _asisData = Array.isArray(asisRes) ? asisRes : [];
        }

        if (!_currentActividadesMap || Object.keys(_currentActividadesMap).length === 0) {
          _currentActividadesMap = window._currentActividadesMap || await fetchActividadesMap(
            _personalId,
            window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '',
            personaNombre
          );
        }

        // Compute current period values
        const trabajados = (_asisData || []).filter(a => isTrabajo(a.estado));
        const targetDate = isOverride ? new Date() : (calDate || new Date());
        const targetMonth = targetDate.getMonth();
        const targetYear = targetDate.getFullYear();

        const weekStart = getWeekStart(targetDate);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const trabajadosFechas = new Set(
          trabajados.map(a => (a.fecha || '').slice(0, 10)).filter(Boolean)
        );
        const actividadesFechas = Object.keys(_currentActividadesMap || {}).map(f => f.slice(0, 10)).filter(Boolean);
        const todasFechas = new Set([...trabajadosFechas, ...actividadesFechas]);

        if (effectiveView === 'week') {
          const weekDates = [...todasFechas].filter(fechaStr => {
            const parts = fechaStr.split('-').map(Number);
            if (parts.length < 3 || isNaN(parts[0])) return false;
            const d = new Date(parts[0], parts[1] - 1, parts[2], 12, 0, 0);
            return d >= weekStart && d <= weekEnd;
          });
          const startM = MONTHS[weekStart.getMonth()];
          const endM = MONTHS[weekEnd.getMonth()];
          periodTitle = weekStart.getMonth() === weekEnd.getMonth()
            ? `Semana ${weekStart.getDate()} - ${weekEnd.getDate()} ${startM} ${weekStart.getFullYear()}`
            : `Semana ${weekStart.getDate()} ${startM} - ${weekEnd.getDate()} ${endM} ${weekStart.getFullYear()}`;
          if (forcedTotal == null) {
            periodDaysText = `${weekDates.length} ${weekDates.length === 1 ? 'día' : 'días'}`;
            periodTotal = weekDates.length * diario;
          }
          periodKey = `sem_${fmtDate(weekStart)}`;
          const todayObj = new Date();
          const todayStr = fmtDate(todayObj);
          const saturday = new Date(weekStart);
          saturday.setDate(saturday.getDate() + 5);
          const satStr = fmtDate(saturday);
          gastoFecha = (satStr > todayStr && fmtDate(weekStart) <= todayStr) ? todayStr : satStr;
          descPrefix = 'Planilla Semanal';
        } else if (effectiveView === 'day') {
          const targetDateStr = fmtDate(targetDate);
          const isDayWorked = todasFechas.has(targetDateStr);
          periodTitle = `${DAYS_FULL[targetDate.getDay()]}, ${targetDate.getDate()} de ${MONTHS[targetDate.getMonth()]}`;
          if (forcedTotal == null) {
            periodDaysText = isDayWorked ? '1 día' : '0 días';
            periodTotal = isDayWorked ? diario : 0;
          }
          periodKey = `dia_${targetDateStr}`;
          gastoFecha = targetDateStr;
          descPrefix = 'Jornal Diario';
        } else {
          const monthDates = [...todasFechas].filter(fechaStr => {
            const parts = fechaStr.split('-').map(Number);
            if (parts.length < 3 || isNaN(parts[0])) return false;
            return (parts[1] - 1) === targetMonth && parts[0] === targetYear;
          });
          periodTitle = `${MONTHS[targetMonth]} ${targetYear}`;
          if (forcedTotal == null) {
            periodDaysText = `${monthDates.length} ${monthDates.length === 1 ? 'día' : 'días'}`;
            periodTotal = monthDates.length * diario;
          }
          periodKey = `mes_${targetYear}_${targetMonth + 1}`;
          const todayObj = new Date();
          const todayStr = fmtDate(todayObj);
          const endOfMonth = fmtDate(new Date(targetYear, targetMonth + 1, 0));
          gastoFecha = (endOfMonth > todayStr && (targetYear === todayObj.getFullYear() && targetMonth === todayObj.getMonth()))
            ? todayStr
            : endOfMonth;
          descPrefix = 'Planilla Mensual';
        }
      }

      if (forcedTotal != null) {
        periodTotal = Number(forcedTotal);
      }

      if (periodTotal <= 0 && !isUpdate) {
        window.Snackbar?.show('No hay días laborados en este período para registrar gastos', { type: 'warning' });
        return;
      }

      if (!personaNombre) {
        personaNombre = _persona?.nombre || 'Personal';
      }
      const cleanDesc = effectiveView === 'week'
        ? `${periodTitle}: ${personaNombre} (${periodDaysText} a L${diario.toLocaleString('es-HN')}/día)`
        : effectiveView === 'month'
        ? `Mes de ${periodTitle}: ${personaNombre} (${periodDaysText} a L${diario.toLocaleString('es-HN')}/día)`
        : `${descPrefix}: ${personaNombre} — ${periodTitle} (${periodDaysText} a L${diario.toLocaleString('es-HN')}/día)`;
      const fullDesc = `${cleanDesc} [ref:${_personalId}_${periodKey}]`;

      const executeSave = async () => {
        try {
          window.Snackbar?.show('⏳ Guardando en Gastos...', { duration: 1500 });
          const eid = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';

          if (isUpdate && existingGastoId) {
            if (periodTotal <= 0) {
              await restFetch(`/rest/v1/gastos?id=eq.${encodeURIComponent(existingGastoId)}`, { method: 'DELETE' });
              try { await db.table('gastos').delete(existingGastoId); } catch(e) {}
            } else {
              const updateBody = {
                monto: periodTotal,
                descripcion: fullDesc,
                fecha: gastoFecha,
              };
              await restFetch(`/rest/v1/gastos?id=eq.${encodeURIComponent(existingGastoId)}`, {
                method: 'PATCH',
                body: JSON.stringify(updateBody)
              });
              try { await db.table('gastos').update(existingGastoId, updateBody); } catch(e) {}
            }
          } else {
            const insertBody = {
              empresa_id: eid,
              fecha: gastoFecha,
              categoria: 'Personal',
              descripcion: fullDesc,
              monto: periodTotal,
            };
            const insertRes = await restInsert('/rest/v1/gastos', insertBody);
            try {
              const newId = insertRes?.id || crypto.randomUUID();
              await db.table('gastos').put({ id: newId, ...insertBody, created_at: new Date().toISOString() });
            } catch(e) {}
          }

          // Clean up any duplicate records for this same week/period
          if (Array.isArray(duplicateIds) && duplicateIds.length > 0) {
            for (const dupId of duplicateIds) {
              if (dupId && dupId !== existingGastoId) {
                try {
                  await restFetch(`/rest/v1/gastos?id=eq.${encodeURIComponent(dupId)}`, { method: 'DELETE' });
                } catch(e) {}
                try {
                  await db.table('gastos').delete(dupId);
                } catch(e) {}
              }
            }
          }

          window.clearScreenCache?.('gastos');
          window.clearScreenCache?.('personal');
          await refreshCalendar();

          window.Snackbar?.dismissAll();
          window.Snackbar?.show(
            periodTotal <= 0
              ? '✔ Registro de gasto eliminado en Gastos'
              : `✔ ${isUpdate ? 'Actualizado' : 'Enviado'} a Cuentas: L${periodTotal.toLocaleString('es-HN')}`,
            {
              theme: 'white',
              actions: [
                {
                  text: 'Ver en Gastos →',
                  style: 'background: #2d3e2c; color: #ffffff; border-radius: 9999px; padding: 7px 16px; font-weight: 700; border: none; cursor: pointer;',
                  onClick: () => { window.closeSubBottomSheet?.(); window.navigateTo('gastos'); }
                },
                {
                  text: 'Cerrar',
                  style: 'background: transparent; color: #777; border: none; padding: 7px 12px; cursor: pointer;',
                  onClick: () => {}
                }
              ]
            }
          );
        } catch (saveErr) {
          console.error('Error guardando en gastos:', saveErr);
          window.Snackbar?.show('Error al guardar en gastos: ' + (saveErr.message || 'Error desconocido'), { type: 'error' });
        }
      };

      if (isUpdate && periodTotal <= 0) {
        window.Snackbar?.dismissAll();
        window.Snackbar?.confirm(
          `¿Eliminar el registro en Gastos para <b>${personaNombre}</b> (${periodTitle}) porque tiene 0 días laborados?`,
          executeSave,
          () => {},
          { confirmText: '✔ Sí, Eliminar', cancelText: 'Cancelar' }
        );
        return;
      }

      await executeSave();
    } catch (err) {
      console.error('Error in __enviarPeriodoAGastos:', err);
      window.Snackbar?.show('Error: ' + (err.message || 'Error desconocido'), { type: 'error' });
    }
  };

  // Floating snackbar-style tooltip
  window.__calShowTip = (e) => {
    const html = e.currentTarget.dataset.tip;
    if (!html) return;
    const tip = document.getElementById('cal-tip');
    const tipContent = document.getElementById('cal-tip-content');
    if (!tip || !tipContent) return;
    tipContent.innerHTML = html;
    tip.style.display = 'block';
    // Position above the hovered cell
    const rect = e.currentTarget.getBoundingClientRect();
    tip.style.visibility = 'hidden';
    requestAnimationFrame(() => {
      const tipH = tip.offsetHeight;
      const tipW = tip.offsetWidth;
      let top = rect.top - tipH - 8;
      if (top < 8) top = rect.bottom + 8;
      let left = rect.left + rect.width / 2 - tipW / 2;
      if (left < 8) left = 8;
      if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8;
      tip.style.top = top + 'px';
      tip.style.left = left + 'px';
      tip.style.visibility = 'visible';
    });
  };
  window.__calHideTip = () => {
    const tip = document.getElementById('cal-tip');
    if (tip) tip.style.display = 'none';
  };
}

function getColor(seed) {
  const colors = ['var(--m3-primary)', 'var(--m3-tertiary)', '#7b4f9e', '#c75b39', '#2d3e2c', '#2c666e', '#6a1b9a'];
  if (!seed) return colors[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
