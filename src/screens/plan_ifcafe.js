import { restFetch, restInsert, getUser } from '../auth.js';
import { getPlanIfcafe, getZonaLabel, calcularDosis, normalizarProducto } from '../utils/calculadora_dosis.js';
import { sendWhatsApp } from '../wa.js';
import { invalidateCache } from '../sync.js';
import { showModal, closeModal } from '../modals.js';
import { uploadImage } from '../utils/image_uploader.js';

function compressImage(file, maxWidth = 1000, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

let _ifcafeLoteId = null;
let _calYear = new Date().getFullYear();
let _calMonth = new Date().getMonth();
let _selectedDay = new Date().getDate();
let _ifcafeEvents = [];
let _ifcafeLotes = [];
let _allLotes = [];
let _personalList = [];
let _currentUser = null;

const MESES_NOMBRE = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
  5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
  9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const descripcionProposito = {
  0: 'Fertilizar el suelo para el arranque del ciclo productivo',
  1: 'Estimular la floración y el cuaje del fruto',
  2: 'Sostener la carga para el desarrollo del grano',
  3: 'Mantener las hojas sanas y verdes',
  4: 'Llenado y peso del grano antes de cosecha'
};

const badgeStyle = {
  Realizada: 'background:#2d3e2c;color:#fff;',
  Aplicada: 'background:#2d3e2c;color:#fff;',
  Pendiente: 'background:#c9a227;color:#fff;',
  Programada: 'background:#c9a227;color:#fff;',
  Atrasada: 'background:#FF4103;color:#fff;'
};

const tipoIcons = {
  'Aplicación Foliar': '🍃',
  'Foliar': '🍃',
  'Fertilizante': '🌿',
  'Fertilización al Suelo': '🌿',
  'Control Fitosanitario': '🛡️',
  'Manejo de Tejido': '✂️',
  'Poda': '✂️',
  'Limpieza': '🧹',
  'Análisis de Suelo': '🧪',
  'Otro': '📌'
};

function getLocalToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function waNotifiedKey(appFecha, loteId) {
  return `wa_notified_app_${appFecha}_${loteId}`;
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function getIconForTipo(tipo) {
  if (!tipo) return '🌱';
  for (const key of Object.keys(tipoIcons)) {
    if (tipo.toLowerCase().includes(key.toLowerCase())) {
      return tipoIcons[key];
    }
  }
  return '🌱';
}

function eventCardHtml(ev) {
  const todayStr = getLocalToday();
  const isRealizada = ev.estado === 'Realizada' || ev.estado === 'Aplicada';
  const isAtrasada = ev.estado === 'Atrasada';
  const badgeLabel = isRealizada ? 'Realizada' : isAtrasada ? 'Atrasada' : 'Programada';
  const icon = getIconForTipo(ev.tipo);

  // Calcular días transcurridos desde la aplicación
  let diasTranscurridosTexto = '';
  if (isRealizada && ev.fecha) {
    const pFecha = ev.fecha.split('-');
    const fActividad = new Date(parseInt(pFecha[0]), parseInt(pFecha[1]) - 1, parseInt(pFecha[2]) || 1);
    const pToday = todayStr.split('-');
    const fHoy = new Date(parseInt(pToday[0]), parseInt(pToday[1]) - 1, parseInt(pToday[2]) || 1);
    
    const diffTime = fHoy.getTime() - fActividad.getTime();
    const diffDays = Math.round(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays === 0) {
      diasTranscurridosTexto = 'Hoy (hace 0 días)';
    } else if (diffDays === 1) {
      diasTranscurridosTexto = 'Ayer (hace 1 día)';
    } else if (diffDays > 1) {
      diasTranscurridosTexto = `Hace ${diffDays} días (${fActividad.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })})`;
    } else if (diffDays < 0) {
      diasTranscurridosTexto = `Registrada para hoy`;
    }
  }

  // Solo permitir marcar como realizada si NO está realizada y ya llegó o pasó la fecha (fecha <= hoy)
  const canMarkRealizada = !isRealizada && ev.fecha <= todayStr;

  const acciones = [];
  if (canMarkRealizada) {
    acciones.push(`
      <button class="plan-btn-primary" onclick="window.marcarAplicadaDirecta('${ev.id || ''}','${ev.loteId}','${ev.fecha}','${esc(ev.producto)}','${esc(ev.tipo)}','${esc(ev.dosis)}')">
        <span class="material-symbols-outlined" style="font-size:16px;">check_circle</span> Marcar como realizada
      </button>
    `);
  }

  acciones.push(`
    <button class="plan-btn-ghost" onclick="window.enviarNotifWhatsApp('${ev.loteId}','${esc(ev.loteNombre)}','${ev.fecha}','${esc(ev.producto)}','${esc(ev.dosis)}','${esc(ev.tipo)}')">
      <span class="material-symbols-outlined" style="font-size:16px;">share</span> WhatsApp
    </button>
  `);

  if (ev.isDb && ev.id) {
    acciones.push(`
      <button class="plan-btn-ghost" onclick="window.editarAplicacionDirecta('${ev.id}')" title="Editar actividad" style="color: var(--m3-primary); border-color: #c0d4be; padding: 6px 12px;">
        <span class="material-symbols-outlined" style="font-size:16px;">edit</span>
        <span>Editar</span>
      </button>
    `);
    acciones.push(`
      <button class="plan-btn-danger" onclick="window.eliminarAplicacionDirecta('${ev.id}')" title="Eliminar actividad">
        <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
      </button>
    `);
  }

  const tipoLower = (ev.tipo || '').toLowerCase();
  const isDosisType = tipoLower.includes('foliar') || tipoLower.includes('fertiliz') || tipoLower.includes('abono') || (tipoLower.includes('suelo') && !tipoLower.includes('análisis') && !tipoLower.includes('analisis')) || tipoLower.includes('fitosanit') || tipoLower.includes('fungic') || tipoLower.includes('insectic');
  const showDosis = ev.dosis && ev.dosis.trim() && ev.dosis !== 'N/A' && isDosisType;

  const listaOperadores = ev.operador
    ? String(ev.operador).split(',').map(s => s.trim()).filter(Boolean)
    : [];

  const cleanObs = (ev.observaciones || '')
    .replace(/👤?\s*Responsables:\s*[^\n]+(\n+|$)/gi, '')
    .trim();

  return `
    <div class="plan-ev" style="border:1.5px solid ${isRealizada ? '#c8e6c9' : isAtrasada ? '#ffcdd2' : '#ffe9a8'};">
      <div class="plan-ev-head">
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-size:18px;">${icon}</span>
          <div>
            <p class="plan-ev-producto">${ev.producto || 'Actividad del cafetal'}</p>
            ${ev.showLote ? `<div class="plan-ev-lote"><span class="material-symbols-outlined" style="font-size:13px;">eco</span> ${ev.loteNombre}</div>` : ''}
          </div>
        </div>
        <span class="plan-ev-badge" style="${badgeStyle[badgeLabel]}">${badgeLabel}</span>
      </div>

      <div class="plan-ev-meta">
        <div><strong>Tipo:</strong> ${ev.tipo || 'General'}${ev.metodo ? ` · ${ev.metodo}` : ''}</div>
        ${showDosis ? `<div><strong>Dosis:</strong> ${ev.dosis}</div>` : ''}

        ${listaOperadores.length > 0 ? `
          <div style="grid-column: 1 / -1; margin-top: 6px;">
            <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #526350; letter-spacing: 0.5px; margin-bottom: 5px; display: flex; align-items: center; gap: 4px;">
              <span class="material-symbols-outlined" style="font-size: 14px; color: #2d3e2c;">badge</span>
              <span>Responsable${listaOperadores.length > 1 ? 's' : ''}:</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 5px;">
              ${listaOperadores.map(op => `
                <div style="display: flex; align-items: center; gap: 8px; background: #f2f7f1; border: 1px solid #d4dfd2; border-radius: 8px; padding: 5px 10px; font-size: 12.5px; font-weight: 700; color: #1b5e20;">
                  <span class="material-symbols-outlined" style="font-size: 15px; color: #2d3e2c;">person</span>
                  <span>${esc(op)}</span>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${isRealizada && diasTranscurridosTexto ? `
          <div style="grid-column: 1 / -1; margin-top: 6px; color: #1b5e20; font-weight: 700; background: #f1f8f0; padding: 6px 10px; border-radius: 8px; border: 1px solid #d0e7ce; display: flex; align-items: center; gap: 6px; font-size: 12px;">
            <span class="material-symbols-outlined" style="font-size: 16px; color:#2d3e2c;">history</span>
            <span>Tiempo transcurrido: <strong>${diasTranscurridosTexto}</strong></span>
          </div>
        ` : ''}
      </div>

      ${cleanObs ? `<div class="plan-ev-purpose" style="margin-top:6px; color:#444; background:#f9faf9; padding:6px 10px; border-radius:8px; font-size:12px;"><strong>💬 Obs:</strong> ${esc(cleanObs)}</div>` : ''}
      ${ev.purpose && !cleanObs ? `<div class="plan-ev-purpose">🎯 ${ev.purpose}</div>` : ''}

      ${ev.foto_url ? `
        <div style="margin-top:10px; position:relative; overflow:hidden; border-radius:12px; border:1px solid #d4dfd2; background:#f4f7f4;">
          <img src="${ev.foto_url}" alt="Foto de la planta" onclick="window.verFotoPlantaModal('${ev.foto_url}', '${esc(ev.producto || ev.tipo)} (${ev.fecha})')" style="width:100%; max-height:160px; object-fit:cover; display:block; cursor:pointer; transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
          <div style="position:absolute; bottom:6px; right:8px; background:rgba(0,0,0,0.65); backdrop-filter:blur(4px); color:#fff; font-size:10.5px; font-weight:700; padding:3px 8px; border-radius:6px; pointer-events:none; display:flex; align-items:center; gap:4px;">
            <span class="material-symbols-outlined" style="font-size:13px;">photo_camera</span> Foto de planta
          </div>
        </div>
      ` : ''}

      <div class="plan-ev-actions">${acciones.join('')}</div>
    </div>`;
}

function calendarShellHtml(activeLote = null, isEmbedded = false, showLotesResumen = false) {
  const cardStyle = isEmbedded
    ? 'width: 100%; box-sizing: border-box; padding: 0; background: transparent; border: none; box-shadow: none;'
    : 'background: var(--m3-surface-container-lowest, #ffffff); border: 1.5px solid var(--m3-outline-variant, #c7cec3); border-radius: 20px; padding: 18px 16px; box-shadow: 0 4px 16px rgba(45, 62, 44, 0.06); width: 100%; box-sizing: border-box; margin-bottom: 20px;';

  return `
    <div class="cafetal-unified-card" style="${cardStyle}">
      
      ${!isEmbedded ? `
      <!-- Selector de Lotes (Integrado dentro de la tarjeta) -->
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--m3-secondary-container, #daeed5); color: var(--m3-on-secondary-container, #101f10); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <span class="material-symbols-outlined" style="font-size: 20px;">filter_alt</span>
          </div>
          <div>
            <span style="display: block; font-size: 10.5px; font-weight: 800; color: var(--m3-secondary, #526350); text-transform: uppercase; letter-spacing: 0.6px; line-height: 1.1;">
              Filtrar Cafetal
            </span>
            <label for="ifcafe-lote-select" style="font-size: 13.5px; font-weight: 700; color: var(--m3-primary, #2d3e2c); line-height: 1.2;">
              Lote a gestionar
            </label>
          </div>
        </div>
        
        <div style="flex: 1; min-width: 220px;">
          <div style="position: relative; display: flex; align-items: center;">
            <select id="ifcafe-lote-select" style="width: 100%; height: 44px; font-weight: 600; font-size: 13.5px; border-radius: 12px; border: 1.5px solid var(--m3-primary, #2d3e2c); background: #fdfdfc; color: #1a1c19; padding: 0 38px 0 14px; cursor: pointer; outline: none; -webkit-appearance: none; appearance: none;" onchange="if(this.value){window.navigateTo('plan_ifcafe', this.value)}else{window.navigateTo('plan_ifcafe')}">
              <option value="" ${!activeLote ? 'selected' : ''}>🌾 Todos los Lotes (${_allLotes.length} disponibles)</option>
              ${_allLotes.map(l => `
                <option value="${l.id}" ${activeLote?.id === l.id ? 'selected' : ''}>
                  ☕ ${l.nombre} (${(l.num_plantas || 0).toLocaleString()} plantas${l.variedad ? ' · ' + l.variedad : ''})
                </option>
              `).join('')}
            </select>
            <span class="material-symbols-outlined" style="position: absolute; right: 12px; pointer-events: none; color: var(--m3-primary, #2d3e2c); font-size: 22px;">
              expand_more
            </span>
          </div>
        </div>
      </div>

      <!-- Separador entre Selector y Calendario -->
      <div style="border-top: 1.5px solid #edf1ec; margin: 14px 0 16px 0;"></div>
      ` : ''}

      <div class="da-calendar-layout">
        <div class="da-calendar-card">
          <div class="da-calendar-header">
            <div class="da-cal-nav">
              <button type="button" class="da-cal-nav-btn" onclick="window.changePlanCalMonth(-1)" aria-label="Mes anterior"><span class="material-icons">chevron_left</span></button>
              <h3 id="plan-cal-month-display"></h3>
              <button type="button" class="da-cal-nav-btn" onclick="window.changePlanCalMonth(1)" aria-label="Mes siguiente"><span class="material-icons">chevron_right</span></button>
            </div>
            <div class="da-cal-mob-bar">
              <div style="display:flex; align-items:center; gap:6px;">
                <button type="button" class="da-cal-mob-arrow" onclick="window.navPlanCalPrev()" title="Semana o mes anterior">
                  <span class="material-icons">chevron_left</span>
                </button>
                <span class="da-cal-mob-date" id="plan-cal-mob-date">Fecha</span>
                <button type="button" class="da-cal-mob-arrow" onclick="window.navPlanCalNext()" title="Semana o mes siguiente">
                  <span class="material-icons">chevron_right</span>
                </button>
              </div>
              <button type="button" class="da-cal-mob-toggle" id="plan-cal-toggle-btn" onclick="window.togglePlanCalendarView()">
                <span class="material-icons" id="plan-cal-toggle-icon" style="font-size:14px;">calendar_month</span>
                <span id="plan-cal-toggle-text">Ver mes</span>
              </button>
            </div>
          </div>
          <div class="da-cal-week-strip" id="plan-cal-week-strip" style="width: 100%; box-sizing: border-box;"></div>
          <div class="da-calendar-grid" id="plan-cal-month-grid" style="width: 100%; box-sizing: border-box;">
            <div class="da-cal-day-name">Lun</div><div class="da-cal-day-name">Mar</div><div class="da-cal-day-name">Mié</div><div class="da-cal-day-name">Jue</div><div class="da-cal-day-name">Vie</div><div class="da-cal-day-name">Sáb</div><div class="da-cal-day-name">Dom</div>
            <div class="da-cal-days-container" id="plan-cal-days"></div>
          </div>
          <div class="da-cal-legend" style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #e8ede8;">
            <div><span class="plan-legend-dot" style="background:#2d3e2c;"></span><span>Realizada</span></div>
            <div><span class="plan-legend-dot" style="background:#c9a227;"></span><span>Programada</span></div>
            <div><span class="plan-legend-dot" style="background:#FF4103;"></span><span>Atrasada</span></div>
          </div>
        </div>

        <div id="plan-day-details-panel">
          <div class="da-day-details" id="plan-day-details" style="width: 100%; box-sizing: border-box;">
            <div class="cafetal-day-details-inner" style="text-align:center;color:#888;padding:24px 16px;">
              <span class="material-symbols-outlined" style="font-size:44px;color:#2d3e2c;opacity:0.6;margin-bottom:8px;">calendar_month</span>
              <p style="font-size:14px;font-weight:700;color:#333;margin:0 0 6px;">Toca cualquier día en el calendario</p>
              <p style="font-size:12px;color:#777;margin:0;">Para ver las labores programadas o registrar una nueva actividad (foliar, abono, podas, etc.)</p>
            </div>
          </div>
        </div>
      </div>

      ${showLotesResumen ? `
        <div style="border-top: 1.5px solid #edf1ec; margin: 20px 0 14px 0;"></div>
        <div style="width: 100%; box-sizing: border-box;">
          <div onclick="window.toggleResumenLotes()" style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0; cursor: pointer; user-select: none;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="material-symbols-outlined" style="font-size: 20px; color: #2d3e2c;">eco</span>
              <h3 style="font-size: 14.5px; font-weight: 800; color: #1a1a1a; margin: 0;">
                Resumen por Lote
              </h3>
              <span style="font-size: 11px; font-weight: 700; color: #666; background: #f0f4ef; padding: 2px 8px; border-radius: 10px;">
                ${_ifcafeLotes.length} lotes
              </span>
            </div>
            
            <button type="button" id="btn-toggle-resumen-lotes" style="background: #f0f5ee; border: 1px solid #c7d8c5; color: #2d3e2c; font-size: 11.5px; font-weight: 700; padding: 5px 12px; border-radius: 9999px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; pointer-events: none;">
              <span id="txt-toggle-resumen-lotes">Ver lotes</span>
              <span class="material-symbols-outlined" id="ico-toggle-resumen-lotes" style="font-size: 16px; transition: transform 0.2s;">expand_more</span>
            </button>
          </div>
          
          <div id="content-resumen-lotes" style="display: none; flex-direction: column; margin-top: 8px; border-top: 1px dashed #e8ede8; padding-top: 4px;">
            ${_ifcafeLotes.map((l, idx) => `
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 10px 0; ${idx !== _ifcafeLotes.length - 1 ? 'border-bottom: 1px solid #f2f5f1;' : ''}">
                <div style="min-width: 140px;">
                  <span style="font-size: 13.5px; font-weight: 700; color: #1a1a1a; display: block;">${l.nombre}</span>
                  <span style="font-size: 11.5px; color: #777;">${l.variedad} · ${(l.numPlantas || 0).toLocaleString()} plantas</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <span style="font-size: 11.5px; font-weight: 700; color: #2d3e2c; background: #e8f5e9; padding: 4px 10px; border-radius: 20px;">
                    ${l.realizadas} labores realizadas
                  </span>
                  <a href="#" onclick="event.preventDefault();window.navigateTo('plan_ifcafe','${l.id}')" style="font-size: 11.5px; font-weight: 600; color: #2d3e2c; text-decoration: none; display: flex; align-items: center; gap: 4px; padding: 5px 10px; background: #f0f7e6; border-radius: 20px; transition: background 0.15s;">
                    Filtrar <span class="material-symbols-outlined" style="font-size: 13px;">filter_alt</span>
                  </a>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>`;
}

function renderPlanWeekStrip() {
  const container = document.getElementById('plan-cal-week-strip');
  if (!container) return;

  const monthEl = document.getElementById('plan-cal-month-grid');
  const mobDateEl = document.getElementById('plan-cal-mob-date');
  const isMonthOpen = monthEl && monthEl.classList.contains('open');

  if (mobDateEl) {
    if (isMonthOpen) {
      const mDate = new Date(_calYear, _calMonth, 1);
      const mName = mDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      mobDateEl.textContent = mName.charAt(0).toUpperCase() + mName.slice(1);
    } else {
      const fullDate = new Date(_calYear, _calMonth, _selectedDay || 1);
      const dayName = fullDate.toLocaleDateString('es-ES', { weekday: 'short' });
      const dayCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      const monthName = fullDate.toLocaleDateString('es-ES', { month: 'short' });
      const monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1).replace('.', '');
      mobDateEl.textContent = `${dayCap}, ${_selectedDay || 1} ${monthCap}`;
    }
  }

  // Lunes de la semana que contiene a _selectedDay
  const targetDate = new Date(_calYear, _calMonth, _selectedDay || 1);
  const dayOfWeek = targetDate.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(targetDate);
  monday.setDate(targetDate.getDate() + diffToMonday);

  const dayLetters = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  let html = '';
  const todayStr = getLocalToday();

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dayNum = d.getDate();
    const dMonth = d.getMonth();
    const dYear = d.getFullYear();
    const isSel = (dayNum === _selectedDay && dMonth === _calMonth && dYear === _calYear);

    const dayEvents = _ifcafeEvents.filter(ev => {
      if (!ev.matchFecha) return false;
      return ev.matchFecha.getFullYear() === dYear &&
             ev.matchFecha.getMonth() === dMonth &&
             ev.matchFecha.getDate() === dayNum;
    });

    const hasEv = dayEvents.length > 0;
    const hasAtrasada = dayEvents.some(ev => ev.estado === 'Atrasada' || (ev.estado === 'Programada' && ev.fecha < todayStr));
    const hasPend = dayEvents.some(ev => ev.estado === 'Pendiente' || ev.estado === 'Programada');

    let dotHtml = '';
    if (hasEv) {
      const dotColor = isSel ? '#ffffff' : (hasAtrasada ? '#ff4103' : (hasPend ? '#c9a227' : '#2d3e2c'));
      dotHtml = `<div class="da-cal-strip-dot" style="background:${dotColor};"></div>`;
    }

    html += `
      <div class="da-cal-strip-day ${isSel ? 'selected' : ''}" onclick="window.selectPlanCalendarDay(${dYear}, ${dMonth}, ${dayNum})">
        <div class="da-cal-strip-name">${dayLetters[i]}</div>
        <div class="da-cal-strip-num">${dayNum}</div>
        ${dotHtml}
      </div>
    `;
  }

  container.innerHTML = html;
  if (monthEl && monthEl.classList.contains('open')) {
    container.classList.add('open-month-hidden');
    container.style.setProperty('display', 'none', 'important');
  } else {
    container.classList.remove('open-month-hidden');
    if (window.innerWidth <= 768) {
      container.style.setProperty('display', 'flex', 'important');
    } else {
      container.style.removeProperty('display');
    }
  }
}

function renderPlanCal() {
  const container = document.getElementById('plan-cal-days');
  if (!container) return;
  const display = document.getElementById('plan-cal-month-display');
  if (display) {
    display.textContent = new Date(_calYear, _calMonth, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  }
  container.innerHTML = '';

  const firstDay = new Date(_calYear, _calMonth, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const lastDay = new Date(_calYear, _calMonth + 1, 0).getDate();

  for (let i = 0; i < offset; i++) {
    const e = document.createElement('div');
    e.className = 'da-cal-day da-cal-empty';
    container.appendChild(e);
  }

  const monthEvents = _ifcafeEvents.filter(ev => {
    if (!ev.matchFecha) return false;
    return ev.matchFecha.getFullYear() === _calYear && ev.matchFecha.getMonth() === _calMonth;
  });

  const todayStr = getLocalToday();
  const isTodayYear = Number(todayStr.slice(0, 4));
  const isTodayMonth = Number(todayStr.slice(5, 7)) - 1;
  const isTodayDay = Number(todayStr.slice(8, 10));

  for (let day = 1; day <= lastDay; day++) {
    const dayEvents = monthEvents.filter(ev => ev.matchFecha.getDate() === day);
    const isToday = day === isTodayDay && _calMonth === isTodayMonth && _calYear === isTodayYear;
    const isSelected = day === _selectedDay;
    let cls = 'da-cal-day';
    let extra = '';

    if (dayEvents.length > 0) {
      const worst = dayEvents.some(e => e.estado === 'Atrasada') ? 'da-cal-day-pending-highlight'
        : dayEvents.some(e => e.estado === 'Pendiente' || e.estado === 'Programada') ? 'da-cal-day-highlight'
        : 'da-cal-day-done';
      cls += ` da-cal-has-event ${worst}`;
      if (dayEvents.length > 1) extra = `<span class="plan-cal-count">${dayEvents.length}</span>`;
    }

    if (isToday) cls += ' da-cal-today';
    if (isSelected) cls += ' da-cal-selected-day';

    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = `<span>${day}</span>${extra}`;
    el.onclick = () => {
      _selectedDay = day;
      renderPlanCal();
      showPlanDayDetails(day, dayEvents);
    };
    container.appendChild(el);
  }

  renderPlanWeekStrip();

  // If a day was selected, show its details
  if (_selectedDay && _selectedDay <= lastDay) {
    const currentDayEvents = monthEvents.filter(ev => ev.matchFecha.getDate() === _selectedDay);
    showPlanDayDetails(_selectedDay, currentDayEvents);
  }
}

function showPlanDayDetails(day, dayEvents) {
  const panel = document.getElementById('plan-day-details');
  if (!panel) return;

  const dateStr = `${_calYear}-${String(_calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  const dateFormatted = new Date(_calYear, _calMonth, day).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const todayStr = getLocalToday();
  const isPast = dateStr < todayStr;
  const isToday = dateStr === todayStr;

  const cardsHtml = (dayEvents && dayEvents.length > 0)
    ? dayEvents.map(eventCardHtml).join('')
    : `
      <div style="text-align:center; color:#888; padding:20px 12px; background:#f9fbf9; border-radius:12px; border:1px dashed #d0ded0; margin-bottom:16px;">
        <span class="material-symbols-outlined" style="font-size:32px; color:#888; margin-bottom:4px;">event_available</span>
        <p style="font-size:13px; font-weight:600; color:#555; margin:0;">Sin actividades ${isPast ? 'registradas' : 'programadas'}</p>
        <p style="font-size:11px; color:#888; margin:4px 0 0;">${isPast ? 'Fecha pasada' : 'Usa el botón de abajo para agregar una labor'}</p>
      </div>
    `;

  let actionButtonHtml = '';
  if (isPast) {
    actionButtonHtml = `
      <button type="button" class="plan-btn-add-inline" onclick="window.showInlineActividadForm('${dateStr}')" style="background:#eef7ee; border:1.5px solid #2d3e2c; color:#2d3e2c;">
        <span class="material-symbols-outlined" style="font-size:18px; color:#2d3e2c;">post_add</span>
        <span>Registrar Actividad Realizada en esta fecha</span>
      </button>
    `;
  } else if (isToday) {
    actionButtonHtml = `
      <button type="button" class="plan-btn-add-inline" onclick="window.showInlineActividadForm('${dateStr}')">
        <span class="material-symbols-outlined" style="font-size:18px;">add_circle</span>
        <span>Registrar Actividad Realizada Hoy</span>
      </button>
    `;
  } else {
    actionButtonHtml = `
      <button type="button" class="plan-btn-add-inline" onclick="window.showInlineActividadForm('${dateStr}')">
        <span class="material-symbols-outlined" style="font-size:18px;">calendar_add_on</span>
        <span>Programar Actividad Futura</span>
      </button>
    `;
  }

  panel.innerHTML = `
    <div class="cafetal-day-details-inner">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:8px; border-bottom:1.5px solid #eef2ee; padding-bottom:10px;">
        <div>
          <span style="font-size:11px; font-weight:700; text-transform:uppercase; color:#2d3e2c; letter-spacing:0.5px;">Actividades del día</span>
          <h4 style="margin:2px 0 0; font-size:16px; font-weight:800; color:#1a1a1a; text-transform:capitalize;">${dateFormatted}</h4>
        </div>
      </div>

      <div style="margin-bottom:16px;">
        ${cardsHtml}
      </div>

      ${actionButtonHtml}
    </div>
  `;
}

function showInlineActividadForm(defaultDate, editAppId = null) {
  let editApp = null;
  if (editAppId) {
    editApp = _ifcafeEvents.find(e => e.id === editAppId) || null;
  }

  const actDate = editApp ? (editApp.fecha || defaultDate) : defaultDate;
  const todayStr = getLocalToday();
  const isPast = actDate < todayStr;
  const isToday = actDate === todayStr;

  // Calcular nombre del día
  const dParts = actDate.split('-');
  const dateObj = new Date(parseInt(dParts[0]), parseInt(dParts[1]) - 1, parseInt(dParts[2]));
  const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
  
  const tomorrowObj = new Date();
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = `${tomorrowObj.getFullYear()}-${String(tomorrowObj.getMonth() + 1).padStart(2, '0')}-${String(tomorrowObj.getDate()).padStart(2, '0')}`;
  const isTomorrow = actDate === tomorrowStr;

  let estadoTextoDisplay = '';
  let estadoValor = 'Programada';
  let formTitle = 'Programar Labor Futura';

  if (editApp) {
    formTitle = '✏️ Editar Actividad del Cafetal';
    estadoValor = editApp.estado || (isPast || isToday ? 'Aplicada' : 'Programada');
  } else if (isPast) {
    estadoTextoDisplay = `✅ Aplicada / Realizada (Registro histórico del ${dateObj.getDate()} de ${MESES_NOMBRE[dateObj.getMonth() + 1]})`;
    estadoValor = 'Aplicada';
    formTitle = 'Registrar Labor Realizada en Fecha Pasada';
  } else if (isToday) {
    estadoTextoDisplay = `✅ Aplicada / Realizada hoy ${dayName}`;
    estadoValor = 'Aplicada';
    formTitle = 'Registrar Labor de Hoy';
  } else if (isTomorrow) {
    estadoTextoDisplay = `📅 Programada para realizarse mañana ${dayName}`;
    estadoValor = 'Programada';
    formTitle = 'Programar Labor para Mañana';
  } else {
    estadoTextoDisplay = `📅 Programada para realizarse el día ${dayName} (${dateObj.getDate()} de ${MESES_NOMBRE[dateObj.getMonth() + 1]})`;
    estadoValor = 'Programada';
    formTitle = 'Programar Labor Futura';
  }

  const panel = document.getElementById('plan-day-details');
  if (!panel) return;

  const dateFormatted = new Date(actDate + 'T12:00:00').toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const targetLoteId = editApp ? (editApp.lote_id || editApp.loteId) : (_ifcafeLoteId || (_allLotes.length > 0 ? _allLotes[0].id : ''));
  const currentTipo = editApp ? (editApp.tipo || 'Aplicación Foliar') : 'Aplicación Foliar';
  const currentProducto = editApp ? (editApp.producto || '') : '';
  const currentDosis = editApp ? (editApp.dosis || '') : '';
  const currentOperador = editApp ? (editApp.operador || '') : '';
  let cleanObs = editApp ? (editApp.observaciones || '') : '';
  let resolvedOperador = currentOperador;
  if (!resolvedOperador && cleanObs.includes('Responsables:')) {
    const m = cleanObs.match(/Responsables:\s*([^\n]+)/);
    if (m) resolvedOperador = m[1].trim();
  }
  if (cleanObs.includes('Responsables:')) {
    cleanObs = cleanObs.replace(/👤?\s*Responsables:\s*[^\n]+\n*/g, '').trim();
  }
  const currentFoto = editApp ? (editApp.foto_url || editApp.notas || '') : '';

  panel.innerHTML = `
    <div class="cafetal-day-details-inner" style="animation: slideUp 0.2s ease-out;">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; border-bottom:1.5px solid #eef2ee; padding-bottom:8px;">
        <div>
          <span style="font-size:11px; font-weight:800; text-transform:uppercase; color:#2d3e2c; letter-spacing:0.5px;" id="inline-plan-form-title">${formTitle}</span>
          <h4 style="margin:2px 0 0; font-size:15px; font-weight:800; color:#1a1a1a; text-transform:capitalize;" id="inline-plan-date-heading">${dateFormatted}</h4>
        </div>
        <button type="button" onclick="window.cancelInlineActividad('${actDate}')" style="background:none; border:none; color:#777; cursor:pointer; padding:4px;">
          <span class="material-symbols-outlined" style="font-size:20px;">close</span>
        </button>
      </div>

      <form id="form-plan-inline-actividad" style="display:flex; flex-direction:column; gap:12px;">
        ${editAppId ? `<input type="hidden" name="id" value="${editAppId}">` : ''}

        <!-- 1. Fecha de la Actividad (Editable para registrar en fecha pasada o futura) -->
        <div class="m3-field">
          <input type="date" name="fecha" id="inline-plan-fecha" value="${actDate}" required style="font-size:13px; font-weight:600; color-scheme: light;">
          <label>Fecha de la Actividad</label>
        </div>

        <!-- 2. Lote -->
        <div class="m3-field">
          <select name="lote_id" id="inline-plan-lote" required style="font-size:13px; font-weight:600;">
            ${_allLotes.map(l => `<option value="${l.id}" ${l.id === targetLoteId ? 'selected' : ''}>${l.nombre} (${l.variedad || 'Café'} - ${l.num_plantas || 0} plantas)</option>`).join('')}
          </select>
          <label>Lote de Café</label>
        </div>

        <!-- 3. Tipo de Labor -->
        <div class="m3-field">
          <select name="tipo" id="inline-plan-tipo" required style="font-size:13px; font-weight:600;">
            <option value="Aplicación Foliar" ${currentTipo === 'Aplicación Foliar' ? 'selected' : ''}>🍃 Aplicación Foliar (Nutrición / Estimulante)</option>
            <option value="Fertilización al Suelo" ${currentTipo === 'Fertilización al Suelo' ? 'selected' : ''}>🌿 Fertilización al Suelo (NPK / Abono)</option>
            <option value="Control Fitosanitario" ${currentTipo === 'Control Fitosanitario' ? 'selected' : ''}>🛡️ Control Fitosanitario (Fungicida / Insecticida)</option>
            <option value="Manejo de Tejido" ${currentTipo === 'Manejo de Tejido' ? 'selected' : ''}>✂️ Manejo de Tejido (Poda / Descope)</option>
            <option value="Limpieza" ${currentTipo === 'Limpieza' ? 'selected' : ''}>🧹 Limpieza / Chapea</option>
            <option value="Análisis de Suelo" ${currentTipo === 'Análisis de Suelo' ? 'selected' : ''}>🧪 Análisis de Suelo</option>
            <option value="Otro" ${currentTipo === 'Otro' ? 'selected' : ''}>📌 Otra labor</option>
          </select>
          <label>Tipo de Actividad</label>
        </div>

        <!-- 4. Producto / Tratamiento -->
        <div class="m3-field" id="field-plan-producto">
          <input type="text" name="producto" id="inline-plan-producto" value="${esc(currentProducto)}" placeholder=" " required style="font-size:13px;">
          <label id="label-plan-producto">Producto o Fórmula recomendada</label>
        </div>

        <!-- 5. Dosis (visible solo en Foliar, Suelo y Fitosanitario) -->
        <div class="m3-field" id="field-plan-dosis">
          <input type="text" name="dosis" id="inline-plan-dosis" value="${esc(currentDosis)}" placeholder=" " style="font-size:13px;">
          <label>Dosis (ej: 120g/planta, 50cc/bomba 20L)</label>
        </div>

        <!-- 6. Responsables / Aplicadores (Buscador Inteligente) -->
        <div style="background: #f8faf8; border: 1.5px solid #d4ded3; border-radius: 14px; padding: 14px; position: relative;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <label style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #2d3e2c; letter-spacing: 0.5px;">
              👥 Responsables / Aplicadores
            </label>
            <span style="font-size: 11px; color: #666;">Buscar en personal</span>
          </div>

          <!-- Buscador con dropdown interactivo -->
          <div style="position: relative;">
            <div style="position: relative; display: flex; align-items: center;">
              <span class="material-symbols-outlined" style="position: absolute; left: 12px; font-size: 20px; color: #5a7357; pointer-events: none;">search</span>
              <input type="text" id="inline-plan-operador-custom-input" placeholder="Buscar responsable (ej: David, Erick)..." autocomplete="off" style="width: 100%; box-sizing: border-box; border: 1.5px solid #c2d8c0; border-radius: 12px; padding: 11px 14px 11px 38px; font-size: 13.5px; outline: none; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.03);">
            </div>

            <!-- Lista desplegable flotante de resultados -->
            <div id="inline-plan-operador-dropdown" style="display: none; position: absolute; top: calc(100% + 4px); left: 0; right: 0; background: #ffffff; border: 1.5px solid #2d3e2c; border-radius: 12px; box-shadow: 0 8px 24px rgba(0,0,0,0.16); z-index: 1050; max-height: 220px; overflow-y: auto;"></div>
          </div>

          <!-- Contenedor de responsables seleccionados (uno sobre otro) -->
          <div id="inline-plan-selected-chips-wrap" style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px; min-height: 24px;"></div>
          <input type="hidden" name="operador" id="inline-plan-operador-hidden" value="${esc(resolvedOperador)}">
        </div>

        <!-- 7. Observaciones y Recomendaciones del Técnico -->
        <div class="m3-field">
          <textarea name="observaciones" id="inline-plan-obs" rows="2" placeholder=" " style="font-size:13px;">${esc(cleanObs)}</textarea>
          <label>Observaciones / Recomendación Técnica</label>
        </div>

        <!-- 8. Foto de la Planta (Cámara o Galería) -->
        <div id="inline-plan-foto-section" style="background: #fbfdfa; border: 1.5px dashed #c0d4be; border-radius: 14px; padding: 14px; text-align: center; margin: 12px 0 16px 0;">
          <!-- Input específico para Cámara (móvil abre directo cámara) -->
          <input type="file" id="inline-plan-foto-camera-input" accept="image/*" capture="environment" style="display: none;">
          <!-- Input específico para Galería / Archivos -->
          <input type="file" id="inline-plan-foto-gallery-input" accept="image/*" style="display: none;">
          <input type="hidden" name="foto_url" id="inline-plan-foto-data" value="${currentFoto || ''}">
          
          <div id="inline-plan-foto-prompt" style="display: ${currentFoto ? 'none' : 'flex'}; flex-direction: column; align-items: center; justify-content: center; gap: 6px; width: 100%;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #eaf2e8; display: flex; align-items: center; justify-content: center; color: #2d3e2c;">
              <span class="material-symbols-outlined" style="font-size: 22px; color: #2d3e2c;">photo_camera</span>
            </div>
            <div style="font-weight: 800; font-size: 13px; color: #1a1a1a;">Foto de la Planta (Evidencia o avance)</div>
            <div style="font-size: 11.5px; color: #666; margin-bottom: 8px;">Selecciona si deseas tomar la foto con la cámara o elegirla de la galería</div>

            <!-- 2 Botones independientes Cámara vs Galería -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; max-width: 320px; margin: 0 auto;">
              <button type="button" id="inline-plan-btn-trigger-camera" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 10px 8px; background: #2d3e2c; color: #ffffff; border: none; border-radius: 12px; cursor: pointer; box-shadow: 0 2px 6px rgba(45,62,44,0.2);">
                <span class="material-symbols-outlined" style="font-size: 22px; color: #ffffff;">photo_camera</span>
                <span style="font-size: 12px; font-weight: 800; color: #ffffff;">Tomar Foto</span>
                <span style="font-size: 10px; color: #d4e2d2;">Cámara</span>
              </button>

              <button type="button" id="inline-plan-btn-trigger-gallery" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 10px 8px; background: #ffffff; color: #2d3e2c; border: 1.5px solid #c2d8c0; border-radius: 12px; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.05);">
                <span class="material-symbols-outlined" style="font-size: 22px; color: #2d3e2c;">photo_library</span>
                <span style="font-size: 12px; font-weight: 800; color: #2d3e2c;">Ver Galería</span>
                <span style="font-size: 10px; color: #666;">De tu teléfono</span>
              </button>
            </div>
          </div>

          <div id="inline-plan-foto-preview-box" style="${currentFoto ? 'display:block;' : 'display:none;'} position: relative; width: 100%;">
            <img id="inline-plan-foto-img" src="${currentFoto || ''}" alt="Foto de la planta" style="width: 100%; max-height: 200px; object-fit: cover; border-radius: 12px; box-shadow: 0 3px 10px rgba(0,0,0,0.1);">
            <div style="margin-top: 10px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
              <button type="button" id="inline-plan-btn-retake-camera" style="padding: 6px 12px; font-size: 11.5px; font-weight: 700; border-radius: 9999px; background: #2d3e2c; color: #fff; border: none; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                <span class="material-symbols-outlined" style="font-size: 15px; color: #fff;">photo_camera</span>
                <span>Tomar otra</span>
              </button>
              <button type="button" id="inline-plan-btn-retake-gallery" style="padding: 6px 12px; font-size: 11.5px; font-weight: 700; border-radius: 9999px; background: #eaf2e8; color: #2d3e2c; border: 1px solid #c2d8c0; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                <span class="material-symbols-outlined" style="font-size: 15px; color: #2d3e2c;">photo_library</span>
                <span>Elegir otra</span>
              </button>
              <button type="button" id="inline-plan-btn-quitar-foto" style="padding: 6px 12px; font-size: 11.5px; font-weight: 700; border-radius: 9999px; background: #fff; color: #ba1a1a; border: 1px solid #ffdad6; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                <span class="material-symbols-outlined" style="font-size: 15px; color: #ba1a1a;">delete</span>
                <span>Quitar</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 9. Estado de la labor -->
        <div class="m3-field" style="margin-bottom: 8px;">
          <select name="estado" id="inline-plan-estado" style="font-size:13px; font-weight:700;">
            <option value="Aplicada" ${estadoValor === 'Aplicada' ? 'selected' : ''}>✅ Aplicada / Realizada (Histórico o realizada)</option>
            <option value="Programada" ${estadoValor === 'Programada' ? 'selected' : ''}>📅 Programada / Pendiente</option>
          </select>
          <label>Estado de la labor</label>
        </div>

        <!-- Botones de Acción M3 Expressive -->
        <div style="display:flex; gap:14px; justify-content:flex-end; align-items:center; margin-top:16px; padding-top:16px; border-top:1px solid #eef2ee;">
          <button type="button" class="plan-btn-ghost" onclick="window.cancelInlineActividad('${actDate}')">
            <span>Cancelar</span>
          </button>
          <button type="submit" id="inline-plan-btn-submit" class="plan-btn-primary">
            <span class="material-symbols-outlined" id="inline-plan-submit-icon" style="font-size:18px;">${editApp ? 'save' : (isToday || isPast) ? 'check_circle' : 'save'}</span>
            <span id="inline-plan-submit-text">${editApp ? 'Guardar Cambios' : isPast ? 'Registrar Actividad Realizada' : isToday ? 'Registrar Actividad' : 'Programar Actividad'}</span>
          </button>
        </div>
      </form>
    </div>
  `;

  const selectTipo = document.getElementById('inline-plan-tipo');
  const inputProducto = document.getElementById('inline-plan-producto');
  const inputDosis = document.getElementById('inline-plan-dosis');
  const fieldDosis = document.getElementById('field-plan-dosis');
  const labelProducto = document.getElementById('label-plan-producto');

  // Multi-operator management
  let selectedOperadores = resolvedOperador ? resolvedOperador.split(',').map(s => s.trim()).filter(Boolean) : [];

  const hiddenOperador = document.getElementById('inline-plan-operador-hidden');
  const selectedChipsWrap = document.getElementById('inline-plan-selected-chips-wrap');
  const customOperadorInput = document.getElementById('inline-plan-operador-custom-input');
  const dropdownMenu = document.getElementById('inline-plan-operador-dropdown');

  const updateOperadoresUI = () => {
    if (hiddenOperador) {
      hiddenOperador.value = selectedOperadores.join(', ');
    }

    if (selectedChipsWrap) {
      if (selectedOperadores.length === 0) {
        selectedChipsWrap.innerHTML = `
          <span style="font-size: 11.5px; color: #888; font-style: italic; display: flex; align-items: center; gap: 4px;">
            <span class="material-symbols-outlined" style="font-size: 15px;">info</span>
            Ningún responsable seleccionado aún (opcional)
          </span>
        `;
      } else {
        selectedChipsWrap.innerHTML = selectedOperadores.map((name, idx) => `
          <div style="display: flex; align-items: center; justify-content: space-between; background: #eaf2e8; color: #1b5e20; border: 1.5px solid #b8d4b4; padding: 6px 12px; border-radius: 10px; font-size: 12.5px; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="material-symbols-outlined" style="font-size: 16px; color: #1b5e20;">person</span>
              <span>${esc(name)}</span>
            </div>
            <button type="button" data-index="${idx}" class="btn-remove-selected-op" style="background: none; border: none; padding: 0; color: #1b5e20; cursor: pointer; display: flex; align-items: center; border-radius: 50%;" title="Quitar">
              <span class="material-symbols-outlined" style="font-size: 18px;">cancel</span>
            </button>
          </div>
        `).join('');

        selectedChipsWrap.querySelectorAll('.btn-remove-selected-op').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            selectedOperadores.splice(index, 1);
            updateOperadoresUI();
          });
        });
      }
    }
  };

  const highlightMatch = (text, query) => {
    if (!query) return esc(text);
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return esc(text).replace(new RegExp(`(${escapedQuery})`, 'gi'), '<strong style="color:#1b5e20; text-decoration: underline;">$1</strong>');
  };

  const addOperatorToSelection = (rawName) => {
    const val = (rawName || '').trim();
    if (!val) return;

    // Buscar si coincide parcial o totalmente con el personal registrado para traer SIEMPRE el nombre completo
    const exactMatch = _personalList.find(p => p.nombre.trim().toLowerCase() === val.toLowerCase());
    const partialMatch = !exactMatch ? _personalList.find(p => p.nombre.trim().toLowerCase().includes(val.toLowerCase())) : null;
    
    // Nombre completo oficial si está en la empresa, o el texto introducido
    const finalName = exactMatch ? exactMatch.nombre : (partialMatch ? partialMatch.nombre : val);

    if (!selectedOperadores.some(n => n.toLowerCase() === finalName.toLowerCase())) {
      selectedOperadores.push(finalName);
      updateOperadoresUI();
    }
    if (customOperadorInput) {
      customOperadorInput.value = '';
    }
    if (dropdownMenu) {
      dropdownMenu.style.display = 'none';
      dropdownMenu.innerHTML = '';
    }
  };

  const renderDropdown = (text) => {
    if (!dropdownMenu) return;
    const term = (text || '').trim().toLowerCase();

    if (!term) {
      dropdownMenu.style.display = 'none';
      dropdownMenu.innerHTML = '';
      return;
    }

    // Filtrar personal registrado en la empresa que coincida en nombre o rol
    const matches = _personalList.filter(p => {
      const name = (p.nombre || '').toLowerCase();
      const rol = (p.rol || '').toLowerCase();
      const alreadySelected = selectedOperadores.some(sel => sel.toLowerCase() === (p.nombre || '').toLowerCase());
      return (name.includes(term) || rol.includes(term)) && !alreadySelected;
    });

    if (matches.length === 0) {
      dropdownMenu.innerHTML = `
        <div style="padding: 10px 14px; font-size: 12px; color: #666; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span>No registrado en personal de la empresa</span>
          <button type="button" id="btn-add-external-op" style="background: #eaf2e8; border: 1px solid #c2d8c0; border-radius: 8px; padding: 4px 10px; font-size: 11.5px; font-weight: 700; color: #2d3e2c; cursor: pointer; white-space: nowrap;">
            + Agregar "${esc(text.trim())}"
          </button>
        </div>
      `;
      const btnExt = dropdownMenu.querySelector('#btn-add-external-op');
      if (btnExt) {
        btnExt.addEventListener('click', (e) => {
          e.stopPropagation();
          addOperatorToSelection(text.trim());
        });
      }
      dropdownMenu.style.display = 'block';
      return;
    }

    dropdownMenu.innerHTML = `
      <div style="padding: 6px 12px; font-size: 10.5px; font-weight: 800; color: #5a7357; text-transform: uppercase; letter-spacing: 0.5px; background: #f8faf8; border-bottom: 1px solid #eef2ee; display: flex; justify-content: space-between;">
        <span>Personal de la Finca (${matches.length})</span>
        <span style="font-weight: 600; text-transform: none; color: #888;">Toca para seleccionar</span>
      </div>
      <div style="display: flex; flex-direction: column;">
        ${matches.map(p => `
          <div class="op-dropdown-row" data-fullname="${esc(p.nombre)}" style="padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; border-bottom: 1px solid #f0f4f0; background: #ffffff;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: #2d3e2c; color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                ${esc((p.nombre || 'U').charAt(0).toUpperCase())}
              </div>
              <div>
                <div style="font-size: 13px; font-weight: 700; color: #1a1a1a;">
                  ${highlightMatch(p.nombre, term)}
                </div>
                ${p.rol ? `<div style="font-size: 11px; color: #666;">${esc(p.rol)}</div>` : ''}
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 4px; color: #2d3e2c; font-size: 11.5px; font-weight: 700;">
              <span class="material-symbols-outlined" style="font-size: 18px; color: #2d3e2c;">add_circle</span>
              <span class="hide-on-mobile">Seleccionar</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    dropdownMenu.querySelectorAll('.op-dropdown-row').forEach(row => {
      row.addEventListener('mouseover', () => { row.style.background = '#f0f6ef'; });
      row.addEventListener('mouseout', () => { row.style.background = '#ffffff'; });
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        const fullName = row.dataset.fullname;
        addOperatorToSelection(fullName);
      });
    });

    dropdownMenu.style.display = 'block';
  };

  if (customOperadorInput) {
    // Al escribir, mostrar inmediatamente las sugerencias en tiempo real
    customOperadorInput.addEventListener('input', () => {
      renderDropdown(customOperadorInput.value);
    });

    customOperadorInput.addEventListener('focus', () => {
      if (customOperadorInput.value.trim()) {
        renderDropdown(customOperadorInput.value);
      }
    });

    customOperadorInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addOperatorToSelection(customOperadorInput.value);
      } else if (e.key === 'Escape') {
        if (dropdownMenu) dropdownMenu.style.display = 'none';
      }
    });
  }

  // Cerrar el dropdown al hacer clic fuera
  const closeDropdownHandler = (e) => {
    if (dropdownMenu && !dropdownMenu.contains(e.target) && e.target !== customOperadorInput) {
      dropdownMenu.style.display = 'none';
    }
  };
  document.addEventListener('click', closeDropdownHandler);

  updateOperadoresUI();

  // Date change and auto-state listener
  const inputFecha = document.getElementById('inline-plan-fecha');
  const selectEstado = document.getElementById('inline-plan-estado');
  const submitText = document.getElementById('inline-plan-submit-text');
  const submitIcon = document.getElementById('inline-plan-submit-icon');
  const headingDate = document.getElementById('inline-plan-date-heading');
  const headingTitle = document.getElementById('inline-plan-form-title');

  if (inputFecha) {
    inputFecha.addEventListener('change', () => {
      const newDate = inputFecha.value;
      if (!newDate) return;
      const isPastNow = newDate < todayStr;
      const isTodayNow = newDate === todayStr;

      const newDateFormatted = new Date(newDate + 'T12:00:00').toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
      if (headingDate) headingDate.textContent = newDateFormatted;

      if (!editApp && selectEstado) {
        if (isPastNow || isTodayNow) {
          selectEstado.value = 'Aplicada';
          if (headingTitle) headingTitle.textContent = isPastNow ? 'Registrar Labor Realizada en Fecha Pasada' : 'Registrar Labor de Hoy';
          if (submitText) submitText.textContent = isPastNow ? 'Registrar Actividad Realizada' : 'Registrar Actividad';
          if (submitIcon) submitIcon.textContent = 'check_circle';
        } else {
          selectEstado.value = 'Programada';
          if (headingTitle) headingTitle.textContent = 'Programar Labor Futura';
          if (submitText) submitText.textContent = 'Programar Actividad Futura';
          if (submitIcon) submitIcon.textContent = 'calendar_add_on';
        }
      }
    });
  }

  // Photo handlers (Cámara y Galería independientes)
  const cameraInput = document.getElementById('inline-plan-foto-camera-input');
  const galleryInput = document.getElementById('inline-plan-foto-gallery-input');
  const fotoData = document.getElementById('inline-plan-foto-data');
  const fotoPrompt = document.getElementById('inline-plan-foto-prompt');
  const fotoPreviewBox = document.getElementById('inline-plan-foto-preview-box');
  const fotoImg = document.getElementById('inline-plan-foto-img');
  const btnTriggerCamera = document.getElementById('inline-plan-btn-trigger-camera');
  const btnTriggerGallery = document.getElementById('inline-plan-btn-trigger-gallery');
  const btnRetakeCamera = document.getElementById('inline-plan-btn-retake-camera');
  const btnRetakeGallery = document.getElementById('inline-plan-btn-retake-gallery');
  const btnQuitarFoto = document.getElementById('inline-plan-btn-quitar-foto');

  if (btnTriggerCamera && cameraInput) {
    btnTriggerCamera.addEventListener('click', () => cameraInput.click());
  }
  if (btnTriggerGallery && galleryInput) {
    btnTriggerGallery.addEventListener('click', () => galleryInput.click());
  }
  if (btnRetakeCamera && cameraInput) {
    btnRetakeCamera.addEventListener('click', () => cameraInput.click());
  }
  if (btnRetakeGallery && galleryInput) {
    btnRetakeGallery.addEventListener('click', () => galleryInput.click());
  }

  const handleFotoFile = async (file) => {
    if (!file) return;
    try {
      window.Snackbar?.show('Optimizando fotografía...');
      const localPreview = await compressImage(file, 1000, 0.75);
      if (fotoImg) fotoImg.src = localPreview;
      if (fotoPreviewBox) fotoPreviewBox.style.display = 'block';
      if (fotoPrompt) fotoPrompt.style.display = 'none';

      const hostedUrl = await uploadImage(file);
      if (fotoData) fotoData.value = hostedUrl || localPreview;
    } catch (err) {
      console.error('Error procesando imagen:', err);
      window.Snackbar?.show('Error al procesar la foto: ' + err.message, { type: 'error' });
    }
  };

  if (cameraInput) {
    cameraInput.addEventListener('change', (e) => handleFotoFile(e.target.files?.[0]));
  }
  if (galleryInput) {
    galleryInput.addEventListener('change', (e) => handleFotoFile(e.target.files?.[0]));
  }

  if (btnQuitarFoto) {
    btnQuitarFoto.addEventListener('click', () => {
      if (fotoData) fotoData.value = '';
      if (fotoImg) fotoImg.src = '';
      if (cameraInput) cameraInput.value = '';
      if (galleryInput) galleryInput.value = '';
      if (fotoPreviewBox) fotoPreviewBox.style.display = 'none';
      if (fotoPrompt) fotoPrompt.style.display = 'flex';
    });
  }

  // Handle dynamic visibility and placeholders by tipo
  const updateTipoFields = () => {
    const t = selectTipo.value;
    if (t === 'Manejo de Tejido') {
      if (fieldDosis) fieldDosis.style.display = 'none';
      if (inputDosis) { inputDosis.required = false; }
      if (labelProducto) labelProducto.textContent = 'Tipo de Poda o Manejo';
      inputProducto.placeholder = 'Ej: Poda de formación, Descope, Deschuponado...';
    } else if (t === 'Limpieza') {
      if (fieldDosis) fieldDosis.style.display = 'none';
      if (inputDosis) { inputDosis.required = false; }
      if (labelProducto) labelProducto.textContent = 'Tipo de Limpieza';
      inputProducto.placeholder = 'Ej: Chapea manual con machete, Desyerbe...';
    } else if (t === 'Análisis de Suelo') {
      if (fieldDosis) fieldDosis.style.display = 'none';
      if (inputDosis) { inputDosis.required = false; }
      if (labelProducto) labelProducto.textContent = 'Tipo de Análisis / Muestreo';
      inputProducto.placeholder = 'Ej: Muestreo compuesto de suelo, pH...';
    } else if (t === 'Control Fitosanitario') {
      if (fieldDosis) fieldDosis.style.display = 'block';
      if (inputDosis) inputDosis.required = true;
      if (labelProducto) labelProducto.textContent = 'Fungicida o Insecticida';
      inputProducto.placeholder = 'Ej: Opera (Fungicida Roya), Brocap...';
      inputDosis.placeholder = 'Ej: 40 cc / bomba 20L';
    } else if (t === 'Fertilización al Suelo') {
      if (fieldDosis) fieldDosis.style.display = 'block';
      if (inputDosis) inputDosis.required = true;
      if (labelProducto) labelProducto.textContent = 'Fertilizante / Fórmula';
      inputProducto.placeholder = 'Ej: 18-46-0, Urea, Caldolomita...';
      inputDosis.placeholder = 'Ej: 120 g / planta, 4 sacos...';
    } else if (t === 'Aplicación Foliar') {
      if (fieldDosis) fieldDosis.style.display = 'block';
      if (inputDosis) inputDosis.required = true;
      if (labelProducto) labelProducto.textContent = 'Nutrición Foliar / Producto';
      inputProducto.placeholder = 'Ej: Zinc-Boro + Aminoácidos';
      inputDosis.placeholder = 'Ej: 50 cc / bomba 20L';
    } else {
      if (fieldDosis) fieldDosis.style.display = 'none';
      if (inputDosis) { inputDosis.required = false; }
      if (labelProducto) labelProducto.textContent = 'Nombre de la Labor';
      inputProducto.placeholder = 'Ej: Nombre de la labor o insumo';
    }
  };

  selectTipo.addEventListener('change', updateTipoFields);
  updateTipoFields();

  // Submit handler
  const form = document.getElementById('form-plan-inline-actividad');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    await window.guardarActividadPlanInline(data);
  });
}

function emptyStateHtml(title, sub) {
  return `<div class="app-screen m3-pt-6 m3-pb-24 m3-p-4 m3-font-work-sans" style="max-width:900px;margin:0 auto;">
    <div style="background:white;border-radius:20px;padding:48px 24px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.04);">
      <span class="material-symbols-outlined" style="font-size:48px;color:#ccc;">eco</span>
      <p style="font-size:16px;font-weight:600;color:#666;margin:12px 0 0;">${title}</p>
      ${sub ? `<p style="font-size:13px;color:#999;margin:6px 0 0;">${sub}</p>` : ''}
    </div>
  </div>`;
}

function planStyles() {
  return `
  <style>
    .da-cal-day-done { background: #c8e6c9; color: #1b5e20; font-weight: 800; }
    .da-cal-day-done:hover { background: #a9d8ab; }
    .da-cal-day.da-cal-day-highlight { color: #6b4f00; background: #ffe9a8; font-weight: 800; }
    .da-cal-day.da-cal-day-pending-highlight { color: #fff; background: #FF4103; font-weight: 800; }
    .da-cal-day.da-cal-selected-day { border: 2.5px solid #2d3e2c !important; transform: scale(1.04); z-index: 2; }
    .plan-cal-count { position: absolute; top: 4px; right: 6px; font-size: 10px; font-weight: 800; background: rgba(0,0,0,0.35); color: #fff; border-radius: 8px; padding: 0 5px; line-height: 1.6; }
    .plan-legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    
    .plan-ev { background: #ffffff; border-radius: 16px; padding: 14px 16px; margin-bottom: 12px; transition: all 0.2s cubic-bezier(0.2, 0, 0, 1); box-shadow: 0 1px 4px rgba(0,0,0,0.03); }
    .plan-ev:hover { transform: translateY(-2px); box-shadow: 0 4px 14px rgba(0,0,0,0.08); }
    .plan-ev-lote { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: #2d3e2c; margin-top: 2px; }
    .plan-ev-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
    .plan-ev-producto { font-size: 14.5px; font-weight: 800; color: #1a1a1a; margin: 0; }
    .plan-ev-badge { font-size: 10.5px; font-weight: 800; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: .4px; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .plan-ev-meta { font-size: 12px; color: #555; margin: 8px 0 0; display: flex; flex-direction: column; gap: 3px; }
    .plan-ev-purpose { font-size: 12px; color: #3a6b3a; margin: 8px 0 0; line-height: 1.4; background:#f4f9f3; padding:8px 12px; border-radius:10px; border-left:3px solid #3a6b3a; }

    /* Lote Selector Chips */
    .plan-lote-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 9999px;
      border: 1.5px solid #d4dfd2;
      background: #ffffff;
      color: #2d3e2c;
      font-family: 'Work Sans', sans-serif;
      font-size: 12.5px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
      box-shadow: 0 1px 4px rgba(0,0,0,0.03);
    }
    .plan-lote-chip:hover {
      background: #eef5eb;
      border-color: #2d3e2c;
      transform: translateY(-1px);
    }
    .plan-lote-chip.active {
      background: #2d3e2c !important;
      color: #ffffff !important;
      border-color: #2d3e2c !important;
      box-shadow: 0 3px 10px rgba(45,62,44,0.28);
    }
    
    /* Material 3 Expressive Actions */
    .plan-ev-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    
    /* M3 Expressive Buttons */
    .plan-btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: #2d3e2c;
      color: #ffffff;
      border: none;
      border-radius: 9999px;
      padding: 10px 20px;
      font-family: 'Work Sans', sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.2px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(45, 62, 44, 0.25);
      transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
    }
    .plan-btn-primary:hover {
      background: #1f2c1e;
      transform: translateY(-1.5px);
      box-shadow: 0 5px 14px rgba(45, 62, 44, 0.35);
    }
    .plan-btn-primary:active {
      transform: scale(0.97);
    }

    .plan-btn-ghost {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: #f0f4ef;
      color: #2d3e2c;
      border: 1px solid #d0ddd0;
      border-radius: 9999px;
      padding: 10px 18px;
      font-family: 'Work Sans', sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.1px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
    }
    .plan-btn-ghost:hover {
      background: #e3ece2;
      border-color: #b5c7b4;
      transform: translateY(-1.5px);
    }
    .plan-btn-ghost:active {
      transform: scale(0.97);
    }

    .plan-btn-danger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #ffe2db;
      color: #c62828;
      border: none;
      border-radius: 9999px;
      padding: 8px 12px;
      font-family: 'Work Sans', sans-serif;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
    }
    .plan-btn-danger:hover {
      background: #ffcdd2;
      color: #b71c1c;
      transform: translateY(-1px);
    }
    .plan-btn-danger:active {
      transform: scale(0.97);
    }

    .plan-btn-add-inline {
      width: 100%;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex-direction: row !important;
      gap: 10px !important;
      background: linear-gradient(135deg, #2d3e2c 0%, #3d563b 100%);
      color: #ffffff !important;
      border: none;
      border-radius: 9999px;
      padding: 14px 24px;
      font-family: 'Work Sans', sans-serif;
      font-size: 14.5px;
      font-weight: 700;
      letter-spacing: 0.2px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(45, 62, 44, 0.28);
      transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
      box-sizing: border-box;
      text-align: center;
    }
    .plan-btn-add-inline > * {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
      line-height: 1.2;
    }
    .plan-btn-add-inline .material-symbols-outlined,
    .plan-btn-add-inline .material-icons {
      font-size: 22px !important;
      flex-shrink: 0;
    }
    .plan-btn-add-inline:hover {
      background: linear-gradient(135deg, #233122 0%, #324731 100%);
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(45, 62, 44, 0.38);
    }
    .plan-btn-add-inline:active {
      transform: scale(0.98);
    }

    /* Tarjeta blanca unificada para el Cafetal */
    .cafetal-unified-card {
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      background: var(--m3-surface-container-lowest, #ffffff);
      border: 1.5px solid var(--m3-outline-variant, #c7cec3);
      border-radius: 20px;
      padding: 18px 16px;
      box-shadow: 0 4px 16px rgba(45, 62, 44, 0.06);
      margin-bottom: 20px;
    }
    .cafetal-unified-card .da-cal-week-strip {
      width: 100% !important;
      box-sizing: border-box !important;
      gap: 6px !important;
      margin-bottom: 4px !important;
    }
    .cafetal-unified-card .da-cal-strip-day {
      flex: 1 1 0 !important;
      min-width: 0 !important;
      box-sizing: border-box !important;
    }
    .cafetal-unified-card .da-calendar-grid {
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .cafetal-unified-card .da-cal-mob-bar {
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .da-calendar-card:has(.da-calendar-grid.open) .da-cal-week-strip,
    .da-cal-week-strip.open-month-hidden {
      display: none !important;
    }
    #plan-day-details-panel {
      width: 100%;
      box-sizing: border-box;
    }
    #plan-day-details-panel .da-day-details {
      margin-top: 0;
      border-radius: 20px;
      border: 1px solid rgba(0, 0, 0, 0.07);
      background: #ffffff;
      padding: 16px 14px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
    }
    .cafetal-day-details-inner {
      width: 100% !important;
      box-sizing: border-box !important;
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
    }
    .cafetal-selector-card {
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }
    .cafetal-day-details-inner .plan-ev {
      margin-bottom: 10px;
    }

    @media (max-width: 600px) {
      .cafetal-unified-card {
        padding: 14px 12px !important;
        border-radius: 18px !important;
      }
      .cafetal-selector-card {
        padding: 12px 14px !important;
        border-radius: 18px !important;
      }
    }
  </style>`;
}

export async function renderPlanIfcafe(filterLoteId, options = {}) {
  _ifcafeLoteId = (filterLoteId && filterLoteId !== 'null') ? filterLoteId : null;
  let empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id');

  if (!empresaId) {
    try {
      const user = await getUser();
      if (user?.id) {
        const data = await restFetch(`/rest/v1/usuario_empresas?usuario_id=eq.${encodeURIComponent(user.id)}&select=empresa_id`);
        if (data && data.length > 0) {
          empresaId = data[0].empresa_id;
          localStorage.setItem('current_empresa_id', empresaId);
        }
      }
    } catch (e) {
      console.warn('empresa recovery in plan_ifcafe failed:', e);
    }
  }

  if (!empresaId) {
    return `<div class="m3-p-8 m3-text-center"><p class="m3-label-medium m3-text-on-surface-variant">No se encontró la empresa. Ve al Dashboard primero.</p></div>`;
  }

  try {
    const [lotesData, appsData, personalData, userData] = await Promise.all([
      restFetch(`/rest/v1/lotes?empresa_id=eq.${empresaId}&select=*&order=nombre.asc`),
      restFetch(`/rest/v1/lote_aplicaciones?empresa_id=eq.${empresaId}&select=*&order=fecha.asc`),
      restFetch(`/rest/v1/personal?empresa_id=eq.${empresaId}&select=*&order=nombre.asc`),
      getUser()
    ]);

    _allLotes = Array.isArray(lotesData) ? lotesData : [];
    _personalList = Array.isArray(personalData) ? personalData : [];
    _currentUser = userData;

    let aplicaciones = Array.isArray(appsData) ? appsData : [];

    if (_allLotes.length === 0) {
      return emptyStateHtml('No hay lotes registrados', 'Crea tu primer lote de café para planificar y registrar labores');
    }

    let targetLotes = _ifcafeLoteId
      ? _allLotes.filter(l => l.id === _ifcafeLoteId)
      : _allLotes;

    if (_ifcafeLoteId && targetLotes.length === 0) {
      return emptyStateHtml('Lote no encontrado');
    }

    _ifcafeEvents = [];
    _ifcafeLotes = [];

    const todayStr = getLocalToday();

    // 1. Agregar aplicaciones reales de la base de datos
    aplicaciones.forEach(app => {
      if (_ifcafeLoteId && app.lote_id !== _ifcafeLoteId) return;
      const lote = _allLotes.find(l => l.id === app.lote_id);
      if (!lote) return;

      const appFecha = app.fecha || todayStr;
      const parts = appFecha.split('-');
      const matchFecha = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]) || 1);

      let estadoCalculado = app.estado || 'Aplicada';
      if (estadoCalculado === 'Programada' && appFecha < todayStr) {
        estadoCalculado = 'Atrasada';
      }

      const plantPhoto = (app.notas && (app.notas.startsWith('data:image') || app.notas.startsWith('http'))) ? app.notas : (app.foto_url || app.image_url || null);

      _ifcafeEvents.push({
        id: app.id,
        isDb: true,
        isGuide: false,
        loteId: lote.id,
        loteNombre: lote.nombre,
        showLote: !_ifcafeLoteId,
        fecha: appFecha,
        matchFecha,
        tipo: app.tipo || 'Fertilización',
        metodo: app.metodo || '',
        producto: app.producto || 'Actividad registrada',
        dosis: app.dosis || '',
        operador: (() => {
          let op = app.operador || '';
          if (!op && app.observaciones && app.observaciones.includes('Responsables:')) {
            const m = app.observaciones.match(/Responsables:\s*([^\n]+)/);
            if (m) op = m[1].trim();
          }
          return op;
        })(),
        observaciones: (app.observaciones || '')
          .replace(/👤?\s*Responsables:\s*[^\n]+(\n+|$)/gi, '')
          .trim(),
        foto_url: plantPhoto,
        estado: estadoCalculado,
        purpose: ''
      });
    });

    // 2. Agregar sugerencias técnicas IHCAFE para los meses que no tengan aún aplicación registrada
    targetLotes.forEach(lote => {
      const altura = parseInt(lote.altura_msnm) || 0;
      const numPlantas = parseInt(lote.num_plantas) || 0;
      let realizadas = 0;
      let totalPlan = 0;

      if (lote.edad_categoria) {
        const dosisCalc = calcularDosis(lote.edad_categoria, numPlantas);
        const plan = getPlanIfcafe(altura);
        totalPlan = plan.length;

        plan.forEach((item, idx) => {
          const mesStr = String(item.mes).padStart(2, '0');
          const mfs = `${_calYear}-${mesStr}-15`;
          const matchFecha = new Date(_calYear, item.mes - 1, 15);

          // Verificar si ya existe una aplicación en DB para ese mes y lote
          const appExistente = aplicaciones.find(a =>
            a.lote_id === lote.id &&
            a.fecha && a.fecha.substring(0, 7) === `${_calYear}-${mesStr}` &&
            (a.tipo === 'Fertilizante' || a.tipo === 'Fertilización al Suelo' || normalizarProducto(a.producto) === normalizarProducto(item.producto))
          );

          if (appExistente) {
            if (appExistente.estado === 'Aplicada') realizadas++;
          } else {
            // Sugerencia como guía
            const estadoGuia = mfs < todayStr ? 'Atrasada' : 'Pendiente';
            _ifcafeEvents.push({
              id: null,
              isDb: false,
              isGuide: true,
              loteId: lote.id,
              loteNombre: lote.nombre,
              showLote: !_ifcafeLoteId,
              fecha: mfs,
              matchFecha,
              tipo: item.tipo === 'Suelo' ? 'Fertilización al Suelo' : 'Aplicación Foliar',
              metodo: item.tipo === 'Suelo' ? 'Al suelo' : 'Foliar',
              producto: item.producto,
              dosis: dosisCalc.porAplicacion.vasitoLabel,
              operador: '',
              observaciones: 'Pauta recomendada por IHCAFE según altitud y edad',
              estado: estadoGuia,
              purpose: descripcionProposito[idx] || ''
            });
          }
        });
      }

      const appsLoteCount = aplicaciones.filter(a => a.lote_id === lote.id && a.estado === 'Aplicada').length;
      _ifcafeLotes.push({
        id: lote.id,
        nombre: lote.nombre,
        variedad: lote.variedad || 'Café',
        numPlantas,
        realizadas: appsLoteCount,
        total: totalPlan || appsLoteCount
      });
    });

    const activeLote = _ifcafeLoteId ? targetLotes[0] : null;

    if (options.embedded) {
      return `
        <div class="m3-font-work-sans" style="width:100%;">
          ${calendarShellHtml(activeLote, true, false)}
        </div>
        ${planStyles()}
      `;
    }

    return `
      <div class="app-screen m3-font-work-sans" style="width:100%;margin:0;padding:4px 0 80px 0;">
        
        <!-- Header -->
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <div>
            <h1 style="font-size:24px;font-weight:800;color:#1a1a1a;margin:0;letter-spacing:-.5px;display:flex;align-items:center;gap:8px;">
              <span>🌿</span> ${activeLote ? `Agenda: ${activeLote.nombre}` : 'Manejo del Cafetal'}
            </h1>
            <p style="font-size:13px;color:#666;margin:4px 0 0;">Agenda de abonadas, foliares, podas y labores de campo</p>
          </div>
          ${activeLote ? `
            <a href="#" onclick="event.preventDefault();window.navigateTo('plan_ifcafe')" style="display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:#2d3e2c; background:#f0f7e6; padding:6px 14px; border-radius:20px; text-decoration:none;">
              <span class="material-symbols-outlined" style="font-size:16px;">apps</span> Ver todos los lotes
            </a>
          ` : ''}
        </div>

        ${activeLote ? `
          <div style="background:linear-gradient(135deg,#2d3e2c,#4a7a48);border-radius:16px;padding:16px 20px;color:white;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;box-shadow:0 4px 20px rgba(45,62,44,0.22);">
            <div style="display:flex;align-items:center;gap:12px;">
              <span class="material-symbols-outlined" style="font-size:28px;">eco</span>
              <div>
                <div style="font-size:18px;font-weight:800;letter-spacing:-.3px;">${activeLote.nombre}</div>
                <div style="font-size:12px;opacity:.9;">Variedad: ${activeLote.variedad || 'Café'} · ${(activeLote.num_plantas || 0).toLocaleString()} plantas</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${activeLote.edad_categoria ? `<span style="font-size:11px;font-weight:700;background:rgba(255,255,255,0.16);padding:5px 12px;border-radius:20px;">${activeLote.edad_categoria}</span>` : ''}
              ${activeLote.altura_msnm ? `<span style="font-size:11px;font-weight:700;background:rgba(255,255,255,0.16);padding:5px 12px;border-radius:20px;">${activeLote.altura_msnm} msnm</span>` : ''}
              <a href="#" onclick="event.preventDefault();window.navigateTo('detalle_lote','${activeLote.id}')" style="font-size:11px;font-weight:700;color:#fff;background:rgba(255,255,255,0.25);padding:5px 12px;border-radius:20px;text-decoration:none;display:inline-flex;align-items:center;gap:4px;">
                Ver Lote <span class="material-symbols-outlined" style="font-size:13px;">arrow_forward</span>
              </a>
            </div>
          </div>
        ` : ''}

        <!-- Single Unified Card (Filter + Calendar + Day Activities + Resumen por Lote) -->
        ${calendarShellHtml(activeLote, false, !activeLote && _ifcafeLotes.length > 0)}

      </div>
      ${planStyles()}
    `;
  } catch (err) {
    console.error('Error en plan_ifcafe:', err);
    return `<div class="m3-p-4 m3-text-center"><p class="m3-label-medium m3-text-error">Error: ${err.message}</p></div>`;
  }
}

export function initPlanIfcafe() {
  const reloadCurrentView = (loteIdTarget) => {
    window.clearScreenCache?.('plan_ifcafe');
    window.clearScreenCache?.('detalle_lote');
    if (window.location.hash.startsWith('#detalle_lote')) {
      const lid = loteIdTarget || _ifcafeLoteId;
      window.navigateTo('detalle_lote', lid);
    } else {
      window.navigateTo('plan_ifcafe', ...(loteIdTarget || _ifcafeLoteId ? [loteIdTarget || _ifcafeLoteId] : []));
    }
  };

  window.changePlanCalMonth = function(dir) {
    _calMonth += dir;
    if (_calMonth < 0) {
      _calMonth = 11;
      _calYear--;
    } else if (_calMonth > 11) {
      _calMonth = 0;
      _calYear++;
    }
    renderPlanCal();
  };

  window.togglePlanCalendarView = function() {
    const weekEl = document.getElementById('plan-cal-week-strip');
    const monthEl = document.getElementById('plan-cal-month-grid');
    const textEl = document.getElementById('plan-cal-toggle-text');
    const iconEl = document.getElementById('plan-cal-toggle-icon');
    const mobDateEl = document.getElementById('plan-cal-mob-date');
    if (!monthEl || !weekEl) return;

    const isMonthVisible = monthEl.classList.contains('open');
    if (isMonthVisible) {
      monthEl.classList.remove('open');
      monthEl.style.setProperty('display', 'none', 'important');
      weekEl.classList.remove('open-month-hidden');
      weekEl.style.setProperty('display', 'flex', 'important');
      if (textEl) textEl.textContent = 'Ver mes';
      if (iconEl) iconEl.textContent = 'calendar_month';
      if (mobDateEl) {
        const fullDate = new Date(_calYear, _calMonth, _selectedDay || 1);
        const dayName = fullDate.toLocaleDateString('es-ES', { weekday: 'short' });
        const dayCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        const monthName = fullDate.toLocaleDateString('es-ES', { month: 'short' });
        const monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1).replace('.', '');
        mobDateEl.textContent = `${dayCap}, ${_selectedDay || 1} ${monthCap}`;
      }
    } else {
      monthEl.classList.add('open');
      monthEl.style.setProperty('display', 'grid', 'important');
      weekEl.classList.add('open-month-hidden');
      weekEl.style.setProperty('display', 'none', 'important');
      if (textEl) textEl.textContent = 'Ver semana';
      if (iconEl) iconEl.textContent = 'view_week';
      if (mobDateEl) {
        const mDate = new Date(_calYear, _calMonth, 1);
        const mName = mDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        mobDateEl.textContent = mName.charAt(0).toUpperCase() + mName.slice(1);
      }
    }
  };

  window.navPlanCalPrev = function() {
    const monthEl = document.getElementById('plan-cal-month-grid');
    const isMonthView = monthEl && (monthEl.classList.contains('open') || window.innerWidth > 768);
    if (isMonthView) {
      _calMonth--;
      if (_calMonth < 0) { _calMonth = 11; _calYear--; }
    } else {
      const cur = new Date(_calYear, _calMonth, _selectedDay || 1);
      cur.setDate(cur.getDate() - 7);
      _calYear = cur.getFullYear();
      _calMonth = cur.getMonth();
      _selectedDay = cur.getDate();
    }
    renderPlanCal();
  };

  window.navPlanCalNext = function() {
    const monthEl = document.getElementById('plan-cal-month-grid');
    const isMonthView = monthEl && (monthEl.classList.contains('open') || window.innerWidth > 768);
    if (isMonthView) {
      _calMonth++;
      if (_calMonth > 11) { _calMonth = 0; _calYear++; }
    } else {
      const cur = new Date(_calYear, _calMonth, _selectedDay || 1);
      cur.setDate(cur.getDate() + 7);
      _calYear = cur.getFullYear();
      _calMonth = cur.getMonth();
      _selectedDay = cur.getDate();
    }
    renderPlanCal();
  };

  window.selectPlanCalendarDay = function(y, m, d) {
    _calYear = y;
    _calMonth = m;
    _selectedDay = d;
    renderPlanCal();
  };

  window.toggleResumenLotes = function() {
    const content = document.getElementById('content-resumen-lotes');
    const txt = document.getElementById('txt-toggle-resumen-lotes');
    const ico = document.getElementById('ico-toggle-resumen-lotes');
    if (!content) return;

    const isHidden = content.style.display === 'none' || !content.style.display;
    if (isHidden) {
      content.style.display = 'flex';
      if (txt) txt.textContent = 'Ocultar';
      if (ico) {
        ico.textContent = 'expand_less';
        ico.style.transform = 'rotate(180deg)';
      }
    } else {
      content.style.display = 'none';
      if (txt) txt.textContent = 'Ver lotes';
      if (ico) {
        ico.textContent = 'expand_more';
        ico.style.transform = 'rotate(0deg)';
      }
    }
  };

  window.showInlineActividadForm = function(defaultDate) {
    showInlineActividadForm(defaultDate);
  };

  window.cancelInlineActividad = function(defaultDate) {
    const day = parseInt(defaultDate.split('-')[2]);
    const monthEvents = _ifcafeEvents.filter(ev => {
      if (!ev.matchFecha) return false;
      return ev.matchFecha.getFullYear() === _calYear && ev.matchFecha.getMonth() === _calMonth;
    });
    const dayEvents = monthEvents.filter(ev => ev.matchFecha.getDate() === day);
    showPlanDayDetails(day, dayEvents);
  };

  window.guardarActividadPlanInline = async function(data) {
    try {
      const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id');
      if (!empresaId) throw new Error('No se detectó empresa activa');

      const obsFinal = (data.observaciones || '').trim()
        .replace(/👤?\s*Responsables:\s*[^\n]+(\n+|$)/gi, '')
        .trim();
      const operadores = (data.operador || '').trim();

      const payload = {
        lote_id: data.lote_id,
        fecha: data.fecha,
        tipo: data.tipo || 'Fertilización al Suelo',
        metodo: data.metodo || (data.tipo === 'Aplicación Foliar' ? 'Foliar' : 'Al suelo'),
        producto: data.producto || 'Actividad programada',
        dosis: data.dosis || '',
        operador: operadores || null,
        estado: data.estado || 'Programada',
        observaciones: obsFinal,
        foto_url: data.foto_url || null
      };

      if (data.id) {
        await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${data.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
        window.Snackbar?.show('✅ Actividad actualizada exitosamente');
      } else {
        payload.empresa_id = empresaId;
        const result = await restInsert('/rest/v1/lote_aplicaciones', payload);
        if (!result) throw new Error('No se pudo guardar la actividad');
        window.Snackbar?.show('✅ Actividad guardada correctamente');
      }

      invalidateCache('lote_aplicaciones');
      reloadCurrentView(data.lote_id);
    } catch (err) {
      console.error(err);
      window.Snackbar?.show('Error al guardar: ' + err.message, { type: 'error' });
    }
  };

  window.marcarAplicadaDirecta = function(appId, loteId, fecha, producto, tipo, dosis) {
    const todayStr = getLocalToday();
    const tituloModal = `Finalizar: ${producto || tipo || 'Labor'}`;

    showModal(tituloModal, `
      <form id="form-finalizar-labor-modal" style="font-family:'Work Sans',sans-serif;">
        <div style="background:#f4f7f4; padding:12px 14px; border-radius:12px; border:1px solid #d4dfd2; margin-bottom:14px;">
          <div style="font-size:15px; font-weight:800; color:#2d3e2c;">${producto || tipo || 'Labor'}</div>
          <div style="font-size:12.5px; color:#555; margin-top:2px;">
            ${tipo || 'Labor agrícola'}${dosis ? ` · Dosis: ${dosis}` : ''} · Fecha: ${todayStr}
          </div>
        </div>

        <!-- Foto de la Planta (Evidencia al Finalizar) -->
        <div style="background: #fbfdfa; border: 1.5px dashed #c0d4be; border-radius: 14px; padding: 14px; text-align: center; margin: 14px 0 20px 0;">
          <input type="file" id="modal-finalizar-foto-input" accept="image/*" style="display: none;">
          <input type="hidden" id="modal-finalizar-foto-data" value="">
          
          <div id="modal-finalizar-foto-preview-box" style="display: none; position: relative; margin-bottom: 12px;">
            <img id="modal-finalizar-foto-img" src="" alt="Foto de la planta" style="width: 100%; max-height: 180px; object-fit: cover; border-radius: 10px; border: 1px solid #d4dfd2;">
            <button type="button" id="modal-finalizar-btn-quitar-foto" style="position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.65); color: #fff; border: none; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
              <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
            </button>
          </div>

          <button type="button" id="modal-finalizar-btn-take-photo" class="plan-btn-ghost" style="width: 100%; height: 42px; font-size: 13px; border-style: dashed; justify-content: center;">
            <span class="material-symbols-outlined" style="font-size: 20px; color: #2d3e2c;">photo_camera</span>
            <span id="modal-finalizar-foto-btn-label">📸 Tomar foto de la planta (Evidencia)</span>
          </button>
          <p style="font-size: 11.5px; color: #666; margin: 6px 0 0;">Opcional: Captura el avance o estado de la planta tras la labor</p>
        </div>

        <div style="display:flex; gap:12px; justify-content:flex-end; align-items:center; margin-top:20px; padding-top:14px; border-top:1px solid #eef2ee;">
          <button type="button" class="plan-btn-ghost" onclick="window.closeModal?.()">
            <span>Cancelar</span>
          </button>
          <button type="submit" class="plan-btn-primary">
            <span class="material-symbols-outlined" style="font-size:18px;">check_circle</span>
            <span>Confirmar y Finalizar</span>
          </button>
        </div>
      </form>
    `);

    // Setup modal photo listeners
    const modalFotoInput = document.getElementById('modal-finalizar-foto-input');
    const modalFotoData = document.getElementById('modal-finalizar-foto-data');
    const modalFotoPreviewBox = document.getElementById('modal-finalizar-foto-preview-box');
    const modalFotoImg = document.getElementById('modal-finalizar-foto-img');
    const modalBtnTakePhoto = document.getElementById('modal-finalizar-btn-take-photo');
    const modalBtnQuitarFoto = document.getElementById('modal-finalizar-btn-quitar-foto');
    const modalFotoBtnLabel = document.getElementById('modal-finalizar-foto-btn-label');

    if (modalBtnTakePhoto && modalFotoInput) {
      modalBtnTakePhoto.addEventListener('click', () => modalFotoInput.click());
    }

    if (modalFotoInput) {
      modalFotoInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          if (modalFotoBtnLabel) modalFotoBtnLabel.textContent = 'Subiendo foto...';
          const localPreview = await compressImage(file, 1000, 0.75);
          modalFotoImg.src = localPreview;
          modalFotoPreviewBox.style.display = 'block';

          const hostedUrl = await uploadImage(file);
          modalFotoData.value = hostedUrl || localPreview;
          if (modalFotoBtnLabel) modalFotoBtnLabel.textContent = 'Cambiar foto de la planta';
        } catch (err) {
          console.error('Error procesando foto:', err);
          window.Snackbar?.show('Error al procesar la foto', { type: 'error' });
        }
      });
    }

    if (modalBtnQuitarFoto) {
      modalBtnQuitarFoto.addEventListener('click', () => {
        modalFotoData.value = '';
        modalFotoImg.src = '';
        if (modalFotoInput) modalFotoInput.value = '';
        modalFotoPreviewBox.style.display = 'none';
        if (modalFotoBtnLabel) modalFotoBtnLabel.textContent = '📸 Tomar foto de la planta (Evidencia)';
      });
    }

    const modalForm = document.getElementById('form-finalizar-labor-modal');
    if (modalForm) {
      modalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id');
          const metodo = (tipo && tipo.includes('Foliar')) ? 'Foliar' : 'Al suelo';
          const fotoUrl = modalFotoData?.value || null;

          if (appId && appId !== 'null' && appId !== 'undefined' && appId !== '') {
            const updatePayload = { estado: 'Aplicada', fecha: todayStr };
            if (fotoUrl) {
              updatePayload.foto_url = fotoUrl;
            }
            await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${appId}`, {
              method: 'PATCH',
              body: JSON.stringify(updatePayload)
            });
          } else {
            await restInsert('/rest/v1/lote_aplicaciones', {
              lote_id: loteId,
              fecha: todayStr,
              producto: producto || 'Fertilizante',
              tipo: tipo || 'Fertilización al Suelo',
              dosis: dosis || '',
              metodo,
              estado: 'Aplicada',
              foto_url: fotoUrl,
              empresa_id: empresaId
            });
          }

          closeModal();
          invalidateCache('lote_aplicaciones');
          window.Snackbar?.show('✅ Labor finalizada y registrada');
          reloadCurrentView(loteId);
        } catch (err) {
          console.error(err);
          window.Snackbar?.show('Error: ' + err.message, { type: 'error' });
        }
      });
    }
  };

  window.editarAplicacionDirecta = function(appId) {
    if (!appId) return;
    const app = _ifcafeEvents.find(e => e.id === appId);
    const fecha = app?.fecha || getLocalToday();
    showInlineActividadForm(fecha, appId);
  };

  window.eliminarAplicacionDirecta = async function(appId) {
    if (!appId) return;
    window.Snackbar?.confirm('¿Deseas eliminar este registro de actividad?', async () => {
      try {
        await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${appId}`, {
          method: 'DELETE'
        });
        invalidateCache('lote_aplicaciones');
        window.Snackbar?.show('Actividad eliminada');
        reloadCurrentView();
      } catch (err) {
        window.Snackbar?.show('Error al eliminar: ' + err.message, { type: 'error' });
      }
    });
  };

  window.enviarNotifWhatsApp = async function(loteId, loteNombre, fecha, producto, dosis, tipo) {
    try {
      const msg = `🌿 *Finca Manager — Labor en Cafetal*\n\n📍 *Lote:* ${loteNombre || 'Mi cafetal'}\n📅 *Fecha:* ${fecha}\n🏷️ *Tipo:* ${tipo || 'Labor agrícola'}\n🧪 *Producto:* ${producto || '—'}\n⚖️ *Dosis:* ${dosis || '—'}`;
      await sendWhatsApp(msg);
      localStorage.setItem(waNotifiedKey(fecha, loteId), new Date().toLocaleString());
      window.Snackbar?.show('📤 Notificación enviada por WhatsApp');
    } catch (err) {
      window.Snackbar?.show('Error al enviar: ' + err.message, { type: 'error' });
    }
  };

  window.verFotoPlantaModal = function(url, titulo) {
    if (!url) return;
    showModal(titulo || 'Foto de la Planta', `
      <div style="text-align:center; padding: 4px;">
        <img src="${url}" alt="Foto de la planta" style="width: 100%; max-height: 70vh; object-fit: contain; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.15);">
        <p style="font-size: 12px; color: #666; margin-top: 12px; font-weight: 600;">Progreso y estado foliar del lote</p>
      </div>
    `);
  };

  renderPlanCal();
}
