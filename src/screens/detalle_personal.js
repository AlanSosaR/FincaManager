import { restFetch, restInsert } from '../auth.js';
import { supabase } from '../supabase.js';
import db from '../db.js';
import { parsePersonalGasto } from './gastos.js';

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

/** Build actividadesMap: { [fecha]: [{tipo, producto, lote_nombre}] } for a personal */
async function fetchActividadesMap(personalId, empresaId, personaNombre) {
  try {
    const eid = empresaId || window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
    if (!eid) return {};

    // Fetch aplicaciones for this empresa (try with personal_ids and operador, fallback if column missing)
    let apps = await restFetch(
      `/rest/v1/lote_aplicaciones?empresa_id=eq.${eid}&select=id,fecha,tipo,producto,personal_ids,operador,lote_id`
    ).catch(async () => {
      return await restFetch(
        `/rest/v1/lote_aplicaciones?empresa_id=eq.${eid}&select=id,fecha,tipo,producto,operador,lote_id`
      ).catch(() => []);
    });

    const loteIds = [...new Set((apps || []).map(a => a.lote_id).filter(Boolean))];
    let loteMap = {};
    if (loteIds.length) {
      const lotes = await restFetch(`/rest/v1/lotes?id=in.(${loteIds.join(',')})&select=id,nombre`).catch(() => []);
      (lotes || []).forEach(l => { loteMap[l.id] = l.nombre; });
    }

    const map = {};
    const normNombre = (personaNombre || '').toLowerCase().trim();

    (apps || []).forEach(a => {
      let pids = [];
      if (Array.isArray(a.personal_ids)) {
        pids = a.personal_ids;
      } else if (typeof a.personal_ids === 'string') {
        try { pids = JSON.parse(a.personal_ids); } catch (e) {}
      }
      const hasId = Array.isArray(pids) && pids.includes(personalId);

      let hasNombre = false;
      if (normNombre && a.operador) {
        const ops = String(a.operador).split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        hasNombre = ops.some(op => op === normNombre || normNombre.includes(op) || op.includes(normNombre));
      }

      if (!hasId && !hasNombre) return;

      const fecha = (a.fecha || '').slice(0, 10);
      if (!fecha) return;

      if (!map[fecha]) map[fecha] = [];
      map[fecha].push({ tipo: a.tipo, producto: a.producto, lote_nombre: loteMap[a.lote_id] || '' });
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
      ? `/rest/v1/gastos?categoria=eq.Personal&empresa_id=eq.${eid}&order=fecha.desc&select=*`
      : `/rest/v1/gastos?categoria=eq.Personal&order=fecha.desc&select=*`;
    const res = await restFetch(path).catch(() => null);
    if (Array.isArray(res) && res.length > 0) return res;
    const local = await supabase.from('gastos').select('*').eq('categoria', 'Personal').catch(() => ({ data: [] }));
    return local?.data || [];
  } catch (e) {
    console.warn('fetchGastosPersonal error:', e);
    return [];
  }
}

export async function renderDetallePersonal(personalId, returnScreen, returnId) {
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

  return `
    <style>
      .dp-screen-pad { padding: 0 0 100px 0 !important; width: 100%; margin: 0; box-sizing: border-box; }
    </style>
    <div class="m3-pt-6 m3-pb-24 m3-p-4 m3-font-work-sans dp-screen-pad">
      <!-- embed personalId for init -->
      <input type="hidden" id="dp-personal-id" value="${personalId}">
      <input type="hidden" id="dp-empresa-id" value="${empresaId}">
      <input type="hidden" id="dp-pago-diario" value="${persona?.pago_diario || 0}">
      <input type="hidden" id="dp-persona-nombre" value="${persona?.nombre || ''}">

      <div class="m3-card m3-p-8" style="border-radius: 20px; border: 1.5px solid var(--m3-outline-variant, #c7cec3); background: var(--m3-surface-container-lowest, #ffffff); box-shadow: 0 4px 16px rgba(45, 62, 44, 0.06); margin-bottom: 24px; width: 100%; box-sizing: border-box;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <div style="width: 72px; height: 72px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 28px; background: ${getColor(persona.nombre)}; color: white; flex-shrink: 0;">${persona.iniciales || '?'}</div>
          <div style="flex: 1;">
            <h1 class="m3-display-small m3-font-extrabold m3-text-on-surface m3-tracking-tight m3-font-manrope" style="font-size: 28px;">${persona.nombre || 'Sin nombre'}</h1>
            <p class="m3-label-large m3-text-on-surface-variant m3-font-medium">${persona.rol || 'Sin rol'}</p>
          </div>
        </div>
        <div id="cal-summary" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--m3-outline-variant);">
          ${renderSummary(asisList, persona.pago_diario, month, year, today, actividadesMap, 'month', persona, gastosPersonal)}
        </div>
      </div>

      <div class="m3-card m3-p-8" style="border-radius: 20px; border: 1.5px solid var(--m3-outline-variant, #c7cec3); background: var(--m3-surface-container-lowest, #ffffff); box-shadow: 0 4px 16px rgba(45, 62, 44, 0.06); width: 100%; box-sizing: border-box;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; flex-wrap: wrap; gap: 8px;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <button class="cal-nav-btn" onclick="window.__calNavigate(-1)">‹</button>
            <h2 class="m3-title-large m3-font-bold" id="cal-title">${MONTHS[month]} ${year}</h2>
            <button class="cal-nav-btn" onclick="window.__calNavigate(1)">›</button>
          </div>
          <div style="display: flex; gap: 8px;">
            <button class="cal-view-btn active" data-view="month" onclick="window.__calSetView('month')">Mes</button>
            <button class="cal-view-btn" data-view="week" onclick="window.__calSetView('week')">Semana</button>
            <button class="cal-view-btn" data-view="day" onclick="window.__calSetView('day')">Día</button>
          </div>
        </div>

        <div id="cal-container">
          ${renderMonthView(month, year, asisMap, actividadesMap)}
        </div>
        <!-- Floating snackbar-style tooltip for calendar days -->
        <div id="cal-tip" style="display:none;position:fixed;z-index:9999;background:#ffffff;color:#1a2e1a;border-radius:12px;box-shadow:0 4px 16px rgba(0,0,0,0.12);padding:10px 14px;max-width:280px;pointer-events:none;border:1px solid rgba(45,62,44,0.12);transition:opacity 0.15s;">
          <div id="cal-tip-content" style="font-size:13px;font-weight:500;line-height:1.5;"></div>
        </div>

      </div>
    </div>
  `;
}

function renderMonthView(month, year, asisMap, actividadesMap = {}) {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPad = firstDay.getDay();
  const totalDays = lastDay.getDate();
  const today = new Date();
  const todayStr = fmtDate(today);

  let html = '<div class="cal-weekdays">';
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
    const isToday = dateStr === todayStr;
    let cls = 'cal-day';
    if (isToday) cls += ' cal-day-today';
    if (isTrabajo(estado)) cls += ' cal-day-work';
    else if (isDescanso(estado)) cls += ' cal-day-rest';
    if (hasActividad) cls += ' cal-day-actividad';

    const diaSem = new Date(year, month, d).getDay();
    if (diaSem === 0) cls += ' cal-day-sun';

    const tipHtml = hasActividad
      ? actividades.map(a => `🌱 ${a.tipo}${a.producto ? ': <b>'+a.producto+'</b>' : ''}${a.lote_nombre ? '<br><span style="font-size:11px;opacity:0.6;">Lote: '+a.lote_nombre+'</span>' : ''}`).join('<hr style="border:none;border-top:1px solid rgba(45,62,44,0.12);margin:6px 0;">')
      : '';
    const safeHtml = tipHtml.replace(/"/g, '&quot;');

    html += `<div class="${cls}" onclick="window.__calToggleDay('${dateStr}')" ${tipHtml ? `onmouseenter="window.__calShowTip(event)" onmouseleave="window.__calHideTip()" data-tip="${safeHtml}"` : ''}>
      <span class="cal-day-num">${d}</span>
      <div class="cal-day-badges">
        ${estado ? `<span class="cal-day-label cal-badge-asistencia">${isTrabajo(estado) ? '✔' : '✘'}</span>` : ''}
        ${hasActividad ? `<span class="cal-day-label cal-badge-actividad">🌱</span>` : ''}
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

  const monthLabel = weekDays[0].getMonth() === weekDays[6].getMonth()
    ? MONTHS[weekDays[0].getMonth()]
    : `${MONTHS[weekDays[0].getMonth()]} - ${MONTHS[weekDays[6].getMonth()]}`;

  let html = `<div style="text-align:center;margin-bottom:12px;"><span class="m3-label-medium m3-font-bold m3-text-on-surface-variant">Semana del ${weekDays[0].getDate()} al ${weekDays[6].getDate()} de ${monthLabel} ${weekDays[0].getFullYear()}</span></div>`;
  html += '<div class="cal-weekdays">';
  const DAYS_WEEK_HEADER = ['Lun','Mar','Mié','Jue','Vie','Sáb','Dom'];
  DAYS_WEEK_HEADER.forEach(d => { html += `<div class="cal-weekday">${d}</div>`; });
  html += '</div><div class="cal-grid">';

  weekDays.forEach(d => {
    const dateStr = fmtDate(d);
    const estado = asisMap[dateStr];
    const actividades = actividadesMap[dateStr] || [];
    const hasActividad = actividades.length > 0;
    const isToday = dateStr === todayStr;
    let cls = 'cal-day';
    if (isToday) cls += ' cal-day-today';
    if (isTrabajo(estado)) cls += ' cal-day-work';
    else if (isDescanso(estado)) cls += ' cal-day-rest';
    if (hasActividad) cls += ' cal-day-actividad';
    if (d.getDay() === 0) cls += ' cal-day-sun';

    const tipHtml = hasActividad
      ? actividades.map(a => `🌱 ${a.tipo}${a.producto ? ': <b>'+a.producto+'</b>' : ''}${a.lote_nombre ? '<br><span style="font-size:11px;opacity:0.8;">Lote: '+a.lote_nombre+'</span>' : ''}`).join('<hr style="border:none;border-top:1px solid rgba(255,255,255,0.12);margin:6px 0;">')
      : '';
    const safeHtml = tipHtml.replace(/"/g, '&quot;');

    html += `<div class="${cls}" onclick="window.__calToggleDay('${dateStr}')" ${tipHtml ? `onmouseenter="window.__calShowTip(event)" onmouseleave="window.__calHideTip()" data-tip="${safeHtml}"` : ''}>
      <span class="cal-day-num">${d.getDate()}</span>
      <div class="cal-day-badges">
        ${estado ? `<span class="cal-day-label cal-badge-asistencia">${isTrabajo(estado) ? '✔' : '✘'}</span>` : ''}
        ${hasActividad ? `<span class="cal-day-label cal-badge-actividad">🌱</span>` : ''}
      </div>
    </div>`;
  });

  html += '</div>';
  return html;
}

function renderDayView(date, asisMap, actividadesMap = {}) {
  const dateStr = fmtDate(date);
  const estado = asisMap[dateStr];
  const actividades = actividadesMap[dateStr] || [];
  const hasActividad = actividades.length > 0;
  const today = new Date();
  const todayStr = fmtDate(today);
  const isToday = dateStr === todayStr;

  let cls = 'cal-day';
  if (isToday) cls += ' cal-day-today';
  if (isTrabajo(estado) || hasActividad) cls += ' cal-day-work';
  else if (isDescanso(estado)) cls += ' cal-day-rest';
  if (hasActividad) cls += ' cal-day-actividad';

  const actividadesHtml = hasActividad ? `
    <div style="margin-top:24px;padding-top:16px;border-top:1px solid var(--m3-outline-variant);text-align:left;">
      <p style="font-size:12px;font-weight:700;text-transform:uppercase;color:var(--m3-on-surface-variant);letter-spacing:0.5px;margin-bottom:10px;">🌱 Actividades en cafetal</p>
      ${actividades.map(a => `
        <div style="background:rgba(45,62,44,0.06);border-left:3px solid #2d3e2c;border-radius:8px;padding:10px 14px;margin-bottom:8px;">
          <p style="font-size:13px;font-weight:700;color:var(--m3-on-surface);margin:0 0 2px;">${a.tipo}${a.producto ? ': ' + a.producto : ''}</p>
          ${a.lote_nombre ? `<p style="font-size:12px;color:var(--m3-on-surface-variant);margin:0;">Lote: ${a.lote_nombre}</p>` : ''}
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
          <span>Trabajó este día (Actividad en cafetal)</span>
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
    controlsHtml = `
      <div style="display:flex;justify-content:center;gap:16px;">
        <button class="cal-view-btn ${isTrabajo(estado) ? 'active' : ''}" onclick="window.__calSetDayEstado('trabajo')" style="padding:8px 24px;">✔ Trabajó</button>
        <button class="cal-view-btn ${isDescanso(estado) ? 'active' : ''}" onclick="window.__calSetDayEstado('descanso')" style="padding:8px 24px;">✘ Descanso</button>
      </div>
      <div style="margin-top:16px;">
        <span class="m3-label-medium m3-font-bold" style="color:${isTrabajo(estado) ? 'var(--m3-primary)' : isDescanso(estado) ? 'var(--m3-error)' : 'var(--m3-on-surface-variant)'}">
          ${isTrabajo(estado) ? '✔ Trabajó este día' : isDescanso(estado) ? '✘ Descansó este día' : 'Sin registrar'}
        </span>
      </div>
    `;
  }

  return `
    <div style="text-align:center;padding:24px 0;">
      <div style="font-size:14px;font-weight:600;color:var(--m3-on-surface-variant);margin-bottom:8px;">${DAYS_FULL[date.getDay()]}</div>
      <div style="font-size:48px;font-weight:800;color:var(--m3-on-surface);margin-bottom:4px;">${date.getDate()}</div>
      <div style="font-size:16px;font-weight:600;color:var(--m3-on-surface-variant);margin-bottom:20px;">${MONTHS[date.getMonth()]} ${date.getFullYear()}</div>
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

  // Merge: asistencia 'trabajo' + cafetal activity dates (union, no double count)
  const trabajadosFechas = new Set(
    trabajados.map(a => (a.fecha || '').slice(0, 10)).filter(Boolean)
  );
  const actividadesFechas = Object.keys(actividadesMap || {}).map(f => f.slice(0, 10)).filter(Boolean);
  const todasFechas = new Set([...trabajadosFechas, ...actividadesFechas]);

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

  if (currentView === 'week') {
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
    // Month
    periodTitle = `${MONTHS[targetMonth]} ${targetYear}`;
    periodDaysText = `${daysThisMonth} ${daysThisMonth === 1 ? 'día' : 'días'}`;
    periodTotal = monthTotal;
    periodSubtext = `${daysThisMonth} ${daysThisMonth === 1 ? 'día laborado en el mes' : 'días laborados en el mes'}`;
    periodKey = `mes_${targetYear}_${targetMonth + 1}`;
  }

  let descPrefix = 'Planilla Mensual';
  if (currentView === 'week') {
    descPrefix = 'Planilla Semanal';
  } else if (currentView === 'day') {
    descPrefix = 'Jornal Diario';
  } else {
    descPrefix = 'Planilla Mensual';
  }
  // Fecha exacta en que se envía el dato
  const gastoFecha = fmtDate(new Date());

  window._currentDpSummary = {
    periodTotal,
    periodDaysText,
    periodTitle,
    periodKey,
    gastoFecha,
    descPrefix,
    diario,
    personaNombre: persona?.nombre || ''
  };

  function matchesWeekText(desc, sDay, eDay, sM, eM) {
    if (!desc) return false;
    const s = desc.toLowerCase();
    if (!s.includes('semana') && !s.includes('planilla')) return false;
    const hasStart = new RegExp(`\\b${sDay}\\b`).test(s);
    const hasEnd = new RegExp(`\\b${eDay}\\b`).test(s);
    if (!hasStart || !hasEnd) return false;
    return s.includes(sM) || s.includes(eM);
  }

  // Deduplication and matching check with existing gastos
  const personalId = persona?.id || '';
  const refTag = personalId ? `[ref:${personalId}_${periodKey}]` : '';
  const pNombre = (persona?.nombre || '').toLowerCase().trim();
  const pNombreParts = pNombre.split(' ').filter(s => s.length >= 2);

  // Find candidate gastos for this worker
  const candidateGastos = (gastosPersonal || []).filter(g => {
    if (g.categoria !== 'Personal') return false;
    if (!g.descripcion) return false;
    const desc = g.descripcion.toLowerCase();
    if (refTag && g.descripcion.includes(refTag)) return true;
    if (personalId && g.descripcion.includes(personalId)) return true;
    if (pNombre && desc.includes(pNombre)) return true;
    if (pNombreParts.length >= 2 && pNombreParts.filter(p => desc.includes(p)).length >= 2) return true;
    if (pNombreParts[0] && pNombreParts[0].length >= 3 && desc.includes(pNombreParts[0])) return true;

    // Include if it matches this exact week and does not explicitly belong to another worker
    if (currentView === 'week') {
      const sDay = weekStart.getDate();
      const eDay = weekEnd.getDate();
      const sM = MONTHS[weekStart.getMonth()].toLowerCase();
      const eM = MONTHS[weekEnd.getMonth()].toLowerCase();
      if (matchesWeekText(g.descripcion, sDay, eDay, sM, eM)) {
        const hasOtherRef = g.descripcion.includes('[ref:') && !g.descripcion.includes(`[ref:${personalId}_`);
        if (!hasOtherRef) return true;
      }
    }
    return false;
  });

  let matchedGasto = null;
  let duplicateGastoIds = [];
  let isMonthHandledByWeeks = false;
  let monthGastosTotal = 0;
  let monthWeeklyCount = 0;

  if (currentView === 'week') {
    const startDay = weekStart.getDate();
    const endDay = weekEnd.getDate();
    const startM = MONTHS[weekStart.getMonth()].toLowerCase();
    const endM = MONTHS[weekEnd.getMonth()].toLowerCase();
    const wStartStr = fmtDate(weekStart);

    // Find all matching gastos for this week (primary + any duplicates to clean up)
    const weekMatches = candidateGastos.filter(g => {
      if (refTag && g.descripcion.includes(refTag)) return true;
      if (personalId && g.descripcion.includes(`[ref:${personalId}_sem_${wStartStr}]`)) return true;
      if (g.descripcion.includes(`_sem_${wStartStr}]`)) return true;
      if (g.descripcion.includes(periodTitle)) return true;
      if (matchesWeekText(g.descripcion, startDay, endDay, startM, endM)) return true;
      const parsed = parsePersonalGasto(g.descripcion, g.fecha);
      if (parsed?.semana && matchesWeekText(parsed.semana, startDay, endDay, startM, endM)) return true;
      return false;
    });

    matchedGasto = weekMatches[0] || null;
    duplicateGastoIds = weekMatches.slice(1).map(g => g.id);
  } else if (currentView === 'month') {
    const mName = MONTHS[targetMonth].toLowerCase();
    const ymStr = `${targetYear}-${String(targetMonth + 1).padStart(2, '0')}`;

    // All gastos for this worker in this month
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

    // If weekly expenses exist for this month OR monthGastosTotal covers the month total
    if (monthWeeklyCount > 0 || (monthGastosTotal >= periodTotal && periodTotal > 0)) {
      isMonthHandledByWeeks = true;
    }

    if (!isMonthHandledByWeeks) {
      matchedGasto = candidateGastos.find(g =>
        (refTag && g.descripcion.includes(refTag)) ||
        (personalId && g.descripcion.includes(`[ref:${personalId}_mes_${targetYear}_${targetMonth + 1}]`)) ||
        (g.descripcion.includes(`_mes_${targetYear}_${targetMonth + 1}]`)) ||
        (g.descripcion.includes(periodTitle) && !g.descripcion.includes('semana'))
      );
    }
  } else {
    // Day view
    const targetDateStr = fmtDate(calDate || new Date());
    matchedGasto = candidateGastos.find(g =>
      (refTag && g.descripcion.includes(refTag)) ||
      (personalId && g.descripcion.includes(`[ref:${personalId}_dia_${targetDateStr}]`)) ||
      (g.descripcion.includes(`_dia_${targetDateStr}]`)) ||
      (g.fecha === targetDateStr && (g.descripcion.includes(periodTitle) || g.descripcion.includes('Jornal Diario')))
    );
  }

  const dupAttr = JSON.stringify(duplicateGastoIds).replace(/"/g, '&quot;');
  let gastosActionHtml = '';
  if (currentView === 'month' && isMonthHandledByWeeks) {
    gastosActionHtml = `
      <div style="margin-top: 10px; background: rgba(45, 62, 44, 0.05); border: 1.5px solid rgba(45, 62, 44, 0.18); padding: 10px 14px; border-radius: 12px; display: flex; flex-direction: column; gap: 6px;">
        <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; color: #2d3e2c;">
            <span class="material-symbols-outlined" style="font-size: 16px; color: #2d3e2c;">check_circle</span>
            En Gastos: L${monthGastosTotal.toLocaleString('es-HN')} (${monthWeeklyCount} ${monthWeeklyCount === 1 ? 'semana' : 'semanas'}) · Mes: L${periodTotal.toLocaleString('es-HN')}
          </span>
          <button type="button" onclick="window.navigateTo('gastos')" style="background: none; border: none; font-size: 12px; font-weight: 800; color: #2d3e2c; cursor: pointer; text-decoration: underline; padding: 0;">
            Ver en Gastos →
          </button>
        </div>
        <p style="margin: 0; font-size: 11px; color: #555; line-height: 1.3;">
          💡 Las planillas se registran por semana para no duplicar datos. Cambia a la vista <b>Semana</b> para enviar o actualizar la semana correspondiente.
        </p>
        <button type="button" onclick="window.__calSetView('week')" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; background: #2d3e2c; color: #ffffff; border: none; border-radius: 8px; padding: 7px 12px; font-size: 12px; font-weight: 700; cursor: pointer; box-shadow: 0 2px 6px rgba(45,62,44,0.2);">
          <span class="material-symbols-outlined" style="font-size: 16px;">calendar_view_week</span>
          Ir a la vista Semana
        </button>
      </div>
    `;
  } else if (matchedGasto) {
    const isDraftPorAprobar = (matchedGasto.descripcion || '').includes('[Por Aprobar]');
    const registradoMonto = Number(matchedGasto.monto) || 0;

    if (isDraftPorAprobar) {
      const btnLabel = currentView === 'week' ? 'Enviar semana a Gastos' : currentView === 'month' ? 'Enviar mes a Gastos' : 'Enviar día a Gastos';
      gastosActionHtml = `
        <div style="margin-top: 10px;">
          <button type="button" onclick="window.__enviarPeriodoAGastos(true, '${matchedGasto.id}', ${periodTotal}, ${dupAttr})" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; background: #2d3e2c; color: #ffffff; border: none; border-radius: 12px; padding: 9px 14px; font-size: 13px; font-weight: 800; cursor: pointer; box-shadow: 0 2px 6px rgba(45,62,44,0.22); transition: transform 0.1s, background 0.2s;">
            <span class="material-symbols-outlined" style="font-size: 18px;">payments</span>
            ${btnLabel} (L${periodTotal.toLocaleString('es-HN')})
          </button>
        </div>
      `;
    } else if (registradoMonto === periodTotal && periodTotal > 0) {
      gastosActionHtml = `
        <div style="margin-top: 10px; display: flex; align-items: center; justify-content: space-between; gap: 8px; background: rgba(45, 62, 44, 0.08); padding: 8px 12px; border-radius: 12px; border: 1px solid rgba(45, 62, 44, 0.18);">
          <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 12px; font-weight: 800; color: #2d3e2c;">
            <span class="material-symbols-outlined" style="font-size: 16px; color: #2d3e2c;">check_circle</span>
            Registrado en Gastos (L${registradoMonto.toLocaleString('es-HN')} al día)
          </span>
          <button type="button" onclick="window.navigateTo('gastos')" style="background: none; border: none; font-size: 12px; font-weight: 800; color: #2d3e2c; cursor: pointer; text-decoration: underline; padding: 0;">
            Ver en Gastos →
          </button>
        </div>
      `;
    } else if (periodTotal > registradoMonto) {
      const aumento = periodTotal - registradoMonto;
      gastosActionHtml = `
        <div style="margin-top: 10px; background: rgba(45, 62, 44, 0.06); border: 1.5px solid rgba(45, 62, 44, 0.22); padding: 10px 12px; border-radius: 14px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
            <div>
              <div style="display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 800; color: #2d3e2c;">
                <span class="material-symbols-outlined" style="font-size: 16px; color: #2d3e2c;">info</span>
                <span>En Gastos: L${registradoMonto.toLocaleString('es-HN')}</span>
              </div>
              <p style="margin: 3px 0 0 21px; font-size: 11px; color: #444; line-height: 1.3;">
                Días modificados: nuevo monto <b>L${periodTotal.toLocaleString('es-HN')}</b> <span style="color:#1b5e20; font-weight:800;">(+L${aumento.toLocaleString('es-HN')} aumento)</span>
              </p>
            </div>
            <button type="button" onclick="window.navigateTo('gastos')" style="background: none; border: none; font-size: 11px; color: #2d3e2c; text-decoration: underline; cursor: pointer; font-weight: 700; white-space: nowrap; padding: 0;">Ver actual</button>
          </div>
          <button type="button" onclick="window.__enviarPeriodoAGastos(true, '${matchedGasto.id}', ${periodTotal}, ${dupAttr})" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; background: #2d3e2c; color: #ffffff; border: none; border-radius: 10px; padding: 8px 14px; font-size: 12px; font-weight: 800; cursor: pointer; box-shadow: 0 2px 8px rgba(45,62,44,0.25); transition: transform 0.1s;">
            <span class="material-symbols-outlined" style="font-size: 16px;">update</span>
            Actualizar en Gastos a L${periodTotal.toLocaleString('es-HN')} (+L${aumento.toLocaleString('es-HN')})
          </button>
        </div>
      `;
    } else if (periodTotal < registradoMonto && periodTotal > 0) {
      const reduccion = registradoMonto - periodTotal;
      gastosActionHtml = `
        <div style="margin-top: 10px; background: rgba(186, 26, 26, 0.06); border: 1.5px solid rgba(186, 26, 26, 0.2); padding: 10px 12px; border-radius: 14px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: flex-start; justify-content: space-between; gap: 8px;">
            <div>
              <div style="display: flex; align-items: center; gap: 5px; font-size: 12px; font-weight: 800; color: #8c1d18;">
                <span class="material-symbols-outlined" style="font-size: 16px; color: #8c1d18;">warning</span>
                <span>En Gastos: L${registradoMonto.toLocaleString('es-HN')}</span>
              </div>
              <p style="margin: 3px 0 0 21px; font-size: 11px; color: #555; line-height: 1.3;">
                Días reducidos: nuevo total <b>L${periodTotal.toLocaleString('es-HN')}</b> <span style="color:#b3261e; font-weight:800;">(-L${reduccion.toLocaleString('es-HN')})</span>
              </p>
            </div>
            <button type="button" onclick="window.navigateTo('gastos')" style="background: none; border: none; font-size: 11px; color: #2d3e2c; text-decoration: underline; cursor: pointer; font-weight: 700; white-space: nowrap; padding: 0;">Ver actual</button>
          </div>
          <button type="button" onclick="window.__enviarPeriodoAGastos(true, '${matchedGasto.id}', ${periodTotal}, ${dupAttr})" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; background: #2d3e2c; color: #ffffff; border: none; border-radius: 10px; padding: 8px 14px; font-size: 12px; font-weight: 800; cursor: pointer; box-shadow: 0 2px 8px rgba(45,62,44,0.25); transition: transform 0.1s;">
            <span class="material-symbols-outlined" style="font-size: 16px;">update</span>
            Actualizar en Gastos a L${periodTotal.toLocaleString('es-HN')} (-L${reduccion.toLocaleString('es-HN')})
          </button>
        </div>
      `;
    } else if (periodTotal === 0 && registradoMonto > 0) {
      gastosActionHtml = `
        <div style="margin-top: 10px; background: rgba(186, 26, 26, 0.06); border: 1.5px solid rgba(186, 26, 26, 0.2); padding: 10px 12px; border-radius: 14px; display: flex; flex-direction: column; gap: 8px;">
          <div style="display: flex; align-items: center; justify-content: space-between; font-size: 12px; font-weight: 800; color: #8c1d18;">
            <span>En Gastos: L${registradoMonto.toLocaleString('es-HN')} (0 días laborados)</span>
            <button type="button" onclick="window.navigateTo('gastos')" style="background: none; border: none; font-size: 11px; color: #2d3e2c; text-decoration: underline; cursor: pointer; font-weight: 700;">Ver</button>
          </div>
          <button type="button" onclick="window.__enviarPeriodoAGastos(true, '${matchedGasto.id}', 0, ${dupAttr})" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; background: #ba1a1a; color: #ffffff; border: none; border-radius: 10px; padding: 8px 14px; font-size: 12px; font-weight: 800; cursor: pointer;">
            <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
            Eliminar registro en Gastos (0 días)
          </button>
        </div>
      `;
    }
  } else if (periodTotal > 0) {
    const btnLabel = currentView === 'week' ? 'Enviar semana a Gastos' : currentView === 'month' ? 'Enviar mes a Gastos' : 'Enviar día a Gastos';
    gastosActionHtml = `
      <div style="margin-top: 10px;">
        <button type="button" onclick="window.__enviarPeriodoAGastos(false, null, ${periodTotal}, ${dupAttr})" style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 6px; background: #2d3e2c; color: #ffffff; border: none; border-radius: 12px; padding: 9px 14px; font-size: 13px; font-weight: 800; cursor: pointer; box-shadow: 0 2px 6px rgba(45,62,44,0.22); transition: transform 0.1s, background 0.2s;">
          <span class="material-symbols-outlined" style="font-size: 18px;">payments</span>
          ${btnLabel} (L${periodTotal.toLocaleString('es-HN')})
        </button>
      </div>
    `;
  }

  return `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 14px;">
      <div class="m3-p-4 m3-bg-surface-container m3-rounded-2xl" style="display: flex; flex-direction: column; justify-content: space-between;">
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
          <p class="m3-label-small m3-text-on-surface-variant">Total a pagar</p>
          <p class="m3-title-large m3-font-bold m3-text-tertiary" style="margin: 4px 0 0 0;">L${periodTotal.toLocaleString('es-HN')}</p>
        </div>
        <div style="margin-top: 12px; padding-top: 6px; border-top: 1px solid rgba(0,0,0,0.07);">
          <p class="m3-label-small m3-text-on-surface-variant" style="margin: 0; font-size: 12px;">
            ${periodSubtext}
          </p>
          ${gastosActionHtml}
        </div>
      </div>
    </div>
  `;
}

export function initDetallePersonal(personalId, returnScreen, returnId) {
  const _personalId = personalId;
  let _currentActividadesMap = window._currentActividadesMap || {};
  let _persona = null;
  let _gastosPersonal = [];
  let _asisData = [];

  let currentView = 'month';
  let calDate = new Date();
  calDate.setHours(0, 0, 0, 0);

  function getViewTitle() {
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

  async function refreshCalendar() {
    const [personaArr, asistencia, gastosPersonal] = await Promise.all([
      restFetch(`/rest/v1/personal?id=eq.${encodeURIComponent(_personalId)}&select=*`).catch(() => []),
      restFetch(`/rest/v1/personal_asistencia?personal_id=eq.${encodeURIComponent(_personalId)}&order=fecha.desc&select=*`).catch(() => []),
      fetchGastosPersonal()
    ]);
    const persona = (Array.isArray(personaArr) ? personaArr[0] : personaArr) || {};
    _persona = persona;
    _gastosPersonal = gastosPersonal || [];

    const actividadesMap = await fetchActividadesMap(
      _personalId,
      window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '',
      persona.nombre
    );
    _currentActividadesMap = actividadesMap || {};
    window._currentActividadesMap = _currentActividadesMap;

    const asisData = Array.isArray(asistencia) ? asistencia : [];
    _asisData = asisData;
    const asisMap = {};
    asisData.forEach(a => {
      const f = (a.fecha || '').slice(0, 10);
      if (f) asisMap[f] = a.estado;
    });

    const calContainer = document.getElementById('cal-container');
    if (calContainer) {
      if (currentView === 'month') {
        calContainer.innerHTML = renderMonthView(calDate.getMonth(), calDate.getFullYear(), asisMap, actividadesMap);
      } else if (currentView === 'week') {
        calContainer.innerHTML = renderWeekView(getWeekStart(calDate), asisMap, actividadesMap);
      } else {
        calContainer.innerHTML = renderDayView(calDate, asisMap, actividadesMap);
      }
    }

    const title = document.getElementById('cal-title');
    if (title) title.textContent = getViewTitle();

    const summary = document.getElementById('cal-summary');
    if (summary) {
      summary.innerHTML = renderSummary(asisData, persona?.pago_diario, calDate.getMonth(), calDate.getFullYear(), calDate, actividadesMap, currentView, persona, _gastosPersonal);
    }
  }

  window.__calNavigate = (dir) => {
    if (currentView === 'month') {
      calDate.setMonth(calDate.getMonth() + dir);
    } else if (currentView === 'week') {
      calDate.setDate(calDate.getDate() + dir * 7);
    } else {
      calDate.setDate(calDate.getDate() + dir);
    }
    refreshCalendar();
  };

  window.__calSetView = (view) => {
    currentView = view;
    document.querySelectorAll('.cal-view-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.view === view);
    });
    refreshCalendar();
  };

  window.__calToggleDay = async (dateStr) => {
    try {
      const todayStr = fmtDate(new Date());
      if (dateStr > todayStr) {
        window.Snackbar?.show('No se puede registrar asistencia en fechas futuras', { type: 'warning' });
        return;
      }
      if (_currentActividadesMap[dateStr]?.length > 0) {
        window.Snackbar?.show('Este día ya cuenta como trabajado por labor en cafetal');
        return;
      }

      const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
      const existentes = await restFetch(`/rest/v1/personal_asistencia?personal_id=eq.${encodeURIComponent(_personalId)}&fecha=eq.${dateStr}&select=*`).catch(() => []);
      const existente = (Array.isArray(existentes) ? existentes[0] : existentes) || null;

      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      calDate = dateObj;

      const diaNombre = DAYS_FULL[dateObj.getDay()];
      const fechaBonita = `${diaNombre} ${d} de ${MONTHS[m - 1]}`;

      const handleSet = async (wantWork) => {
        try {
          const finalEstado = await persistAsistencia(_personalId, empresaId, dateStr, wantWork);
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
          onClick: () => handleSet(true)
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
        window.Snackbar?.show('No se puede registrar asistencia en fechas futuras', { type: 'warning' });
        return;
      }
      if (_currentActividadesMap[dateStr]?.length > 0) {
        window.Snackbar?.show('Este día ya cuenta como trabajado por labor en cafetal');
        return;
      }

      const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
      const [y, m, d] = dateStr.split('-').map(Number);

      const wantWork = isTrabajo(estado);
      const finalEstado = await persistAsistencia(_personalId, empresaId, dateStr, wantWork);

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

  window.__enviarPeriodoAGastos = async (isUpdate = false, existingGastoId = null, forcedTotal = null, duplicateIds = []) => {
    try {
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

      let periodTitle = summaryInfo.periodTitle || '';
      let periodDaysText = summaryInfo.periodDaysText || '';
      let periodKey = summaryInfo.periodKey || '';
      let gastoFecha = summaryInfo.gastoFecha || '';
      let descPrefix = summaryInfo.descPrefix || '';

      if (forcedTotal != null && diario > 0) {
        const calcDays = Math.round(periodTotal / diario);
        periodDaysText = `${calcDays} ${calcDays === 1 ? 'día' : 'días'}`;
      }

      if (periodTotal <= 0 || !periodTitle || !gastoFecha) {
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
        const targetDate = calDate || new Date();
        const targetMonth = calDate.getMonth();
        const targetYear = calDate.getFullYear();

        const weekStart = getWeekStart(targetDate);
        const weekEnd = new Date(weekStart);
        weekEnd.setDate(weekStart.getDate() + 6);
        weekEnd.setHours(23, 59, 59, 999);

        const trabajadosFechas = new Set(
          trabajados.map(a => (a.fecha || '').slice(0, 10)).filter(Boolean)
        );
        const actividadesFechas = Object.keys(_currentActividadesMap || {}).map(f => f.slice(0, 10)).filter(Boolean);
        const todasFechas = new Set([...trabajadosFechas, ...actividadesFechas]);

        if (currentView === 'week') {
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
        } else if (currentView === 'day') {
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
      const cleanDesc = currentView === 'week'
        ? `${periodTitle}: ${personaNombre} (${periodDaysText} a L${diario.toLocaleString('es-HN')}/día)`
        : currentView === 'month'
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
          await refreshCalendar();

          window.Snackbar?.dismissAll();
          window.Snackbar?.show(
            periodTotal <= 0
              ? '✔ Registro de gasto eliminado en Gastos'
              : `✔ ${isUpdate ? 'Actualizado' : 'Enviado'} a Gastos: L${periodTotal.toLocaleString('es-HN')}`,
            {
              theme: 'white',
              actions: [
                {
                  text: 'Ver en Gastos →',
                  style: 'background: #2d3e2c; color: #ffffff; border-radius: 9999px; padding: 7px 16px; font-weight: 700; border: none; cursor: pointer;',
                  onClick: () => window.navigateTo('gastos')
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
