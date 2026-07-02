import { supabase } from '../supabase.js';

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
const DAYS = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
const DAYS_FULL = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];

function fmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export async function renderDetallePersonal(personalId, returnScreen, returnId) {
  const [persona, asistencia] = await Promise.all([
    supabase.from('personal').select('*').eq('id', personalId).single().then(r => r.data),
    supabase.from('personal_asistencia').select('*').eq('personal_id', personalId).order('fecha', { ascending: false }).then(r => r.data || [])
  ]);

  if (!persona) return '<div class="m3-p-4" style="color:red;">Personal no encontrado</div>';

  const asisMap = {};
  asistencia.forEach(a => { asisMap[a.fecha] = a.estado; });

  const today = new Date();
  const month = today.getMonth();
  const year = today.getFullYear();

  return `
    <div class="m3-pt-6 m3-pb-24 m3-p-4 m3-max-w-4xl m3-mx-auto m3-font-work-sans">

      <div class="m3-card m3-p-8" style="border-radius: 12px; margin-bottom: 24px;">
        <div style="display: flex; align-items: center; gap: 16px;">
          <div style="width: 72px; height: 72px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 28px; background: ${getColor(persona.nombre)}; color: white; flex-shrink: 0;">${persona.iniciales}</div>
          <div style="flex: 1;">
            <h1 class="m3-display-small m3-font-extrabold m3-text-on-surface m3-tracking-tight m3-font-manrope" style="font-size: 28px;">${persona.nombre}</h1>
            <p class="m3-label-large m3-text-on-surface-variant m3-font-medium">${persona.rol || 'Sin rol'}</p>
          </div>
        </div>
        <div id="cal-summary" style="margin-top: 16px; padding-top: 16px; border-top: 1px solid var(--m3-outline-variant);">
          ${renderSummary(asistencia, persona.pago_diario)}
        </div>
      </div>

      <div class="m3-card m3-p-8" style="border-radius: 12px;">
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
          ${renderMonthView(month, year, asisMap)}
        </div>

      </div>
    </div>
  `;
}

function renderMonthView(month, year, asisMap) {
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
    const isToday = dateStr === todayStr;
    let cls = 'cal-day';
    if (isToday) cls += ' cal-day-today';
    if (estado === 'trabajo') cls += ' cal-day-work';
    else if (estado === 'descanso') cls += ' cal-day-rest';

    const diaSem = new Date(year, month, d).getDay();
    if (diaSem === 0) cls += ' cal-day-sun';

    html += `<div class="${cls}" onclick="window.__calToggleDay('${dateStr}')" title="${DAYS_FULL[diaSem]}, ${d} de ${MONTHS[month]}">
      <span class="cal-day-num">${d}</span>
      ${estado ? `<span class="cal-day-label">${estado === 'trabajo' ? '✔' : '✘'}</span>` : ''}
    </div>`;
  }

  html += '</div>';
  return html;
}

function renderWeekView(weekStart, asisMap) {
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
  DAYS.forEach(d => { html += `<div class="cal-weekday">${d}</div>`; });
  html += '</div><div class="cal-grid">';

  weekDays.forEach(d => {
    const dateStr = fmtDate(d);
    const estado = asisMap[dateStr];
    const isToday = dateStr === todayStr;
    let cls = 'cal-day';
    if (isToday) cls += ' cal-day-today';
    if (estado === 'trabajo') cls += ' cal-day-work';
    else if (estado === 'descanso') cls += ' cal-day-rest';
    if (d.getDay() === 0) cls += ' cal-day-sun';

    html += `<div class="${cls}" onclick="window.__calToggleDay('${dateStr}')" title="${DAYS_FULL[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}">
      <span class="cal-day-num">${d.getDate()}</span>
      ${estado ? `<span class="cal-day-label">${estado === 'trabajo' ? '✔' : '✘'}</span>` : ''}
    </div>`;
  });

  html += '</div>';
  return html;
}

function renderDayView(date, asisMap) {
  const dateStr = fmtDate(date);
  const estado = asisMap[dateStr];
  const today = new Date();
  const todayStr = fmtDate(today);
  const isToday = dateStr === todayStr;

  let cls = 'cal-day';
  if (isToday) cls += ' cal-day-today';
  if (estado === 'trabajo') cls += ' cal-day-work';
  else if (estado === 'descanso') cls += ' cal-day-rest';

  return `
    <div style="text-align:center;padding:24px 0;">
      <div style="font-size:14px;font-weight:600;color:var(--m3-on-surface-variant);margin-bottom:8px;">${DAYS_FULL[date.getDay()]}</div>
      <div style="font-size:48px;font-weight:800;color:var(--m3-on-surface);margin-bottom:4px;">${date.getDate()}</div>
      <div style="font-size:16px;font-weight:600;color:var(--m3-on-surface-variant);margin-bottom:20px;">${MONTHS[date.getMonth()]} ${date.getFullYear()}</div>
      <div style="display:flex;justify-content:center;gap:16px;">
        <button class="cal-view-btn ${estado === 'trabajo' ? 'active' : ''}" onclick="window.__calSetDayEstado('trabajo')" style="padding:8px 24px;">✔ Trabajó</button>
        <button class="cal-view-btn ${estado === 'descanso' ? 'active' : ''}" onclick="window.__calSetDayEstado('descanso')" style="padding:8px 24px;">✘ Descanso</button>
      </div>
      <div style="margin-top:16px;">
        <span class="m3-label-medium m3-font-bold" style="color:${estado === 'trabajo' ? 'var(--m3-primary)' : estado === 'descanso' ? 'var(--m3-error)' : 'var(--m3-on-surface-variant)'}">
          ${estado === 'trabajo' ? '✔ Trabajó este día' : estado === 'descanso' ? '✘ Descansó este día' : 'Sin registrar'}
        </span>
      </div>
    </div>
  `;
}

function renderSummary(asistencia, pagoDiario, month, year, weekDate) {
  const diario = Number(pagoDiario || 0);
  const trabajados = (asistencia || []).filter(a => a.estado === 'trabajo');

  const targetMonth = month ?? new Date().getMonth();
  const targetYear = year ?? new Date().getFullYear();
  const weekRef = weekDate ? new Date(weekDate) : new Date();
  const weekStart = new Date(weekRef);
  weekStart.setDate(weekRef.getDate() - weekRef.getDay() + 1);
  weekStart.setHours(0,0,0,0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);

  const weekAsistencia = trabajados.filter(a => {
    const d = new Date(a.fecha + 'T00:00:00');
    return d >= weekStart && d <= weekEnd;
  });

  const monthAsistencia = trabajados.filter(a => {
    const d = new Date(a.fecha + 'T00:00:00');
    return d.getMonth() === targetMonth && d.getFullYear() === targetYear;
  });

  const daysThisWeek = weekAsistencia.length;
  const weekTotal = daysThisWeek * diario;
  const daysThisMonth = monthAsistencia.length;
  const monthTotal = daysThisMonth * diario;

  return `
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px;">
      <div class="m3-p-4 m3-bg-surface-container m3-rounded-2xl">
        <p class="m3-label-small m3-text-on-surface-variant">Esta semana</p>
        <p class="m3-title-large m3-font-bold m3-text-primary">${daysThisWeek} días</p>
        <p class="m3-label-medium m3-font-bold">L${weekTotal.toLocaleString('es-HN')}</p>
      </div>
      <div class="m3-p-4 m3-bg-surface-container m3-rounded-2xl">
        <p class="m3-label-small m3-text-on-surface-variant">${MONTHS[targetMonth]} ${targetYear}</p>
        <p class="m3-title-large m3-font-bold m3-text-primary">${daysThisMonth} días</p>
        <p class="m3-label-medium m3-font-bold">L${monthTotal.toLocaleString('es-HN')}</p>
      </div>
      <div class="m3-p-4 m3-bg-surface-container m3-rounded-2xl">
        <p class="m3-label-small m3-text-on-surface-variant">Pago por día</p>
        <p class="m3-title-large m3-font-bold m3-text-tertiary">L${diario.toLocaleString('es-HN')}</p>
      </div>
    </div>
  `;
}

export function initDetallePersonal(personalId, returnScreen, returnId) {
  const _personalId = personalId;

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
    const { data: asistencia } = await supabase
      .from('personal_asistencia')
      .select('*')
      .eq('personal_id', _personalId)
      .order('fecha', { ascending: false });

    const asisMap = {};
    (asistencia || []).forEach(a => { asisMap[a.fecha] = a.estado; });

    const { data: persona } = await supabase.from('personal').select('pago_diario').eq('id', _personalId).single();

    const calContainer = document.getElementById('cal-container');
    if (calContainer) {
      if (currentView === 'month') {
        calContainer.innerHTML = renderMonthView(calDate.getMonth(), calDate.getFullYear(), asisMap);
      } else if (currentView === 'week') {
        calContainer.innerHTML = renderWeekView(getWeekStart(calDate), asisMap);
      } else {
        calContainer.innerHTML = renderDayView(calDate, asisMap);
      }
    }

    const title = document.getElementById('cal-title');
    if (title) title.textContent = getViewTitle();

    const summary = document.getElementById('cal-summary');
    if (summary) {
      summary.innerHTML = renderSummary(asistencia || [], persona?.pago_diario, calDate.getMonth(), calDate.getFullYear(), calDate);
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
    const { data: existente } = await supabase
      .from('personal_asistencia')
      .select('*')
      .eq('personal_id', _personalId)
      .eq('fecha', dateStr)
      .maybeSingle();

    if (existente) {
      const newEstado = existente.estado === 'trabajo' ? 'descanso' : 'trabajo';
      await supabase.from('personal_asistencia').update({ estado: newEstado }).eq('id', existente.id);
    } else {
      await supabase.from('personal_asistencia').insert([{ personal_id: _personalId, fecha: dateStr, estado: 'trabajo' }]);
    }
    refreshCalendar();
  };

  window.__calSetDayEstado = async (estado) => {
    const dateStr = fmtDate(calDate);
    const { data: existente } = await supabase
      .from('personal_asistencia')
      .select('*')
      .eq('personal_id', _personalId)
      .eq('fecha', dateStr)
      .maybeSingle();

    if (existente) {
      await supabase.from('personal_asistencia').update({ estado }).eq('id', existente.id);
    } else {
      await supabase.from('personal_asistencia').insert([{ personal_id: _personalId, fecha: dateStr, estado }]);
    }
    refreshCalendar();
  };
}

function getColor(seed) {
  const colors = ['var(--m3-primary)', 'var(--m3-tertiary)', '#7b4f9e', '#c75b39', '#2d3e2c', '#2c666e', '#6a1b9a'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}
