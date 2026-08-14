import { restFetch } from '../auth.js';
import { getPlanIfcafe, getZonaLabel, calcularDosis, normalizarProducto } from '../utils/calculadora_dosis.js';
import { sendWhatsApp } from '../wa.js';
import { invalidateCache } from '../sync.js';

let _ifcafeLoteId = null;
let _calYear = 2026;
let _calMonth = 0;
let _ifcafeEvents = [];
let _ifcafeLotes = [];

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
  Pendiente: 'background:#c9a227;color:#fff;',
  Atrasada: 'background:#FF4103;color:#fff;'
};

function getLocalToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function waNotifiedKey(appFecha, loteId) {
  return `wa_notified_app_${appFecha}_${loteId}`;
}

function matchFechaStr(item) {
  return `2026-${String(item.mes).padStart(2, '0')}-15`;
}

function matchFechaDate(item) {
  return new Date(2026, item.mes - 1, 15);
}

function esc(s) {
  return String(s).replace(/'/g, "\\'");
}

function estadoDeEvento(item, apps, loteId) {
  const mfs = matchFechaStr(item);
  const realizada = (apps || []).find(a =>
    a.lote_id === loteId &&
    a.estado === 'Aplicada' &&
    a.producto && normalizarProducto(a.producto) === normalizarProducto(item.producto) &&
    a.fecha && a.fecha.substring(0, 7) === mfs.substring(0, 7)
  ) || null;
  if (realizada) return { realizada, estado: 'Realizada' };
  if (mfs < getLocalToday()) return { realizada: null, estado: 'Atrasada' };
  return { realizada: null, estado: 'Pendiente' };
}

function setDefaultCalMonth() {
  _calYear = 2026;
  const months = _ifcafeEvents.map(e => e.matchFecha.getMonth());
  const cur = new Date().getMonth();
  _calMonth = months.includes(cur) ? cur : (months.length ? months[0] : 0);
}

function eventCardHtml(ev) {
  const fecha = matchFechaStr(ev.item);
  const metodo = ev.item.tipo === 'Suelo' ? 'Al suelo' : 'Foliar';
  const acciones = [];
  if (ev.estado !== 'Realizada') {
    acciones.push(`<button class="plan-btn-primary" onclick="window.marcarAplicada('${ev.loteId}','${fecha}','${esc(ev.item.producto)}','${ev.item.tipo}','${esc(ev.dosisLabel)}','${ev.item.mesLabel}')">✅ Marcar como aplicada</button>`);
  }
  acciones.push(`<button class="plan-btn-ghost" onclick="window.enviarNotifAhora('${ev.loteId}','${esc(ev.loteNombre)}','${fecha}','${esc(ev.item.producto)}','${esc(ev.dosisLabel)}','${ev.item.tipo}','${ev.item.mesLabel}')">📤 Enviar notificación</button>`);
  return `
    <div class="plan-ev" style="border:1.5px solid ${ev.estado === 'Realizada' ? '#c8e6c9' : ev.estado === 'Atrasada' ? '#ffcdd2' : '#ffe9a8'};">
      ${ev.showLote ? `<div class="plan-ev-lote"><span class="material-symbols-outlined" style="font-size:14px;">eco</span> ${ev.loteNombre}</div>` : ''}
      <div class="plan-ev-head">
        <p class="plan-ev-producto">${ev.item.producto}</p>
        <span class="plan-ev-badge" style="${badgeStyle[ev.estado]}">${ev.estado}</span>
      </div>
      <p class="plan-ev-meta">${ev.item.mesLabel} · ${metodo} · Dosis: ${ev.dosisLabel}</p>
      <p class="plan-ev-purpose">🎯 ${ev.purpose}</p>
      <div class="plan-ev-actions">${acciones.join('')}</div>
    </div>`;
}

function calendarShellHtml() {
  return `
    <div class="da-calendar-layout" style="align-items:start;">
      <div class="da-calendar-card">
        <div class="da-calendar-header">
          <div class="da-cal-nav">
            <button class="da-cal-nav-btn" onclick="window.changePlanCalMonth(-1)" aria-label="Mes anterior"><span class="material-icons">chevron_left</span></button>
            <h3 id="plan-cal-month-display"></h3>
            <button class="da-cal-nav-btn" onclick="window.changePlanCalMonth(1)" aria-label="Mes siguiente"><span class="material-icons">chevron_right</span></button>
          </div>
        </div>
        <div class="da-calendar-grid">
          <div class="da-cal-day-name">Lun</div><div class="da-cal-day-name">Mar</div><div class="da-cal-day-name">Mié</div><div class="da-cal-day-name">Jue</div><div class="da-cal-day-name">Vie</div><div class="da-cal-day-name">Sáb</div><div class="da-cal-day-name">Dom</div>
          <div class="da-cal-days-container" id="plan-cal-days"></div>
        </div>
        <div class="da-cal-legend">
          <div><span class="plan-legend-dot" style="background:#2d3e2c;"></span><span>Realizada</span></div>
          <div><span class="plan-legend-dot" style="background:#c9a227;"></span><span>Pendiente</span></div>
          <div><span class="plan-legend-dot" style="background:#FF4103;"></span><span>Atrasada</span></div>
        </div>
      </div>
      <div id="plan-day-details">
        <div class="da-day-details">
          <div style="text-align:center;color:#aaa;padding:20px;">
            <span class="material-icons" style="font-size:40px;margin-bottom:8px;">touch_app</span>
            <p>Selecciona un día en el calendario para ver las aplicaciones</p>
          </div>
        </div>
      </div>
    </div>`;
}

function renderPlanCal() {
  const container = document.getElementById('plan-cal-days');
  if (!container) return;
  const display = document.getElementById('plan-cal-month-display');
  if (display) display.textContent = new Date(_calYear, _calMonth, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  container.innerHTML = '';

  const firstDay = new Date(_calYear, _calMonth, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const lastDay = new Date(_calYear, _calMonth + 1, 0).getDate();

  for (let i = 0; i < offset; i++) {
    const e = document.createElement('div');
    e.className = 'da-cal-day da-cal-empty';
    container.appendChild(e);
  }

  const monthEvents = _ifcafeEvents.filter(ev => ev.matchFecha.getFullYear() === _calYear && ev.matchFecha.getMonth() === _calMonth);
  const todayStr = getLocalToday();
  const isTodayYear = Number(todayStr.slice(0, 4));
  const isTodayMonth = Number(todayStr.slice(5, 7)) - 1;
  const isTodayDay = Number(todayStr.slice(8, 10));

  for (let day = 1; day <= lastDay; day++) {
    const dayEvents = monthEvents.filter(ev => ev.matchFecha.getDate() === day);
    const isToday = day === isTodayDay && _calMonth === isTodayMonth && _calYear === isTodayYear;
    let cls = 'da-cal-day';
    let extra = '';
    if (dayEvents.length > 0) {
      const worst = dayEvents.some(e => e.estado === 'Atrasada') ? 'da-cal-day-pending-highlight'
        : dayEvents.some(e => e.estado === 'Pendiente') ? 'da-cal-day-highlight'
        : 'da-cal-day-done';
      cls += ` da-cal-has-event ${worst}`;
      if (dayEvents.length > 1) extra = `<span class="plan-cal-count">${dayEvents.length}</span>`;
    }
    if (isToday) cls += ' da-cal-today';
    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = `<span>${day}</span>${extra}`;
    el.onclick = () => showPlanDayDetails(day, dayEvents);
    container.appendChild(el);
  }
}

function showPlanDayDetails(day, dayEvents) {
  const panel = document.getElementById('plan-day-details');
  if (!panel) return;
  if (!dayEvents.length) {
    panel.innerHTML = `<div class="da-day-details"><div style="text-align:center;color:#aaa;padding:20px;"><span class="material-icons" style="font-size:40px;margin-bottom:8px;">touch_app</span><p>Sin aplicaciones este día</p></div></div>`;
    return;
  }
  panel.innerHTML = `<div class="da-day-details"><h4>Aplicaciones del ${day} de ${MESES_NOMBRE[_calMonth + 1]}</h4>${dayEvents.map(eventCardHtml).join('')}</div>`;
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
    .da-cal-day.da-cal-day-highlight { color: #6b4f00; }
    .da-cal-day.da-cal-day-pending-highlight { color: #fff; }
    .plan-cal-count { position: absolute; top: 4px; right: 6px; font-size: 10px; font-weight: 800; background: rgba(0,0,0,0.35); color: #fff; border-radius: 8px; padding: 0 5px; line-height: 1.6; }
    .plan-legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .plan-ev { background: #fdfdfd; border-radius: 12px; padding: 12px 14px; margin-bottom: 10px; }
    .plan-ev-lote { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: #2d3e2c; margin-bottom: 6px; }
    .plan-ev-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .plan-ev-producto { font-size: 14px; font-weight: 700; color: #1a1a1a; margin: 0; }
    .plan-ev-badge { font-size: 10px; font-weight: 800; padding: 3px 10px; border-radius: 20px; text-transform: uppercase; letter-spacing: .3px; flex-shrink: 0; }
    .plan-ev-meta { font-size: 12px; color: #666; margin: 4px 0 0; }
    .plan-ev-purpose { font-size: 12px; color: #3a6b3a; margin: 6px 0 0; line-height: 1.35; }
    .plan-ev-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
    .plan-ev-actions button { font-family: 'Work Sans', sans-serif; font-size: 12px; font-weight: 600; cursor: pointer; border-radius: 10px; padding: 8px 14px; display: flex; align-items: center; gap: 4px; }
    .plan-btn-primary { background: #2d3e2c; color: #fff; border: none; }
    .plan-btn-ghost { background: #f0f7e6; color: #2d3e2c; border: 1.5px solid #2d3e2c; }
  </style>`;
}

export async function renderPlanIfcafe(filterLoteId) {
  _ifcafeLoteId = (filterLoteId && filterLoteId !== 'null') ? filterLoteId : null;
  let empresaId = window._currentEmpresaId;
  if (!empresaId) {
    empresaId = localStorage.getItem('current_empresa_id');
  }
  if (!empresaId) {
    try {
      const user = await (await import('../auth.js')).getUser();
      if (user?.id) {
        const data = await (await import('../auth.js')).restFetch(`/rest/v1/usuario_empresas?usuario_id=eq.${encodeURIComponent(user.id)}&select=empresa_id`);
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
    let lotes = await restFetch(`/rest/v1/lotes?empresa_id=eq.${empresaId}&select=*&order=nombre.asc`);
    if (!Array.isArray(lotes)) lotes = [];

    let aplicaciones = [];
    try {
      aplicaciones = await restFetch(`/rest/v1/lote_aplicaciones?empresa_id=eq.${empresaId}&select=*`);
      if (!Array.isArray(aplicaciones)) aplicaciones = [];
    } catch (e) { console.warn('No se pudieron cargar aplicaciones:', e); }

    if (_ifcafeLoteId) {
      const lote = lotes.find(l => l.id === _ifcafeLoteId);
      if (!lote || !lote.edad_categoria) {
        return emptyStateHtml('Este lote no tiene plan de fertilización');
      }
      return renderLotePlanIfcafe(lote, aplicaciones.filter(a => a.lote_id === _ifcafeLoteId));
    }

    const lotesConPlan = lotes.filter(l => l.edad_categoria);
    if (lotesConPlan.length === 0) {
      return emptyStateHtml('No hay lotes con plan de fertilización', 'Crea un lote con edad y altura para generar su plan de abonadas');
    }

    _ifcafeEvents = [];
    _ifcafeLotes = [];
    lotesConPlan.forEach(lote => {
      const altura = parseInt(lote.altura_msnm) || 0;
      const numPlantas = parseInt(lote.num_plantas) || 0;
      const dosisCalc = calcularDosis(lote.edad_categoria, numPlantas);
      const plan = getPlanIfcafe(altura);
      let realizadas = 0;
      plan.forEach((item, idx) => {
        const { realizada, estado } = estadoDeEvento(item, aplicaciones, lote.id);
        if (estado === 'Realizada') realizadas++;
        _ifcafeEvents.push({
          loteId: lote.id, loteNombre: lote.nombre, showLote: true, lote, item, idx,
          matchFecha: matchFechaDate(item), realizada, estado,
          dosisLabel: dosisCalc.porAplicacion.vasitoLabel,
          purpose: descripcionProposito[idx] || ''
        });
      });
      _ifcafeLotes.push({ id: lote.id, nombre: lote.nombre, realizadas, total: plan.length });
    });

    setDefaultCalMonth();

    return `
      <div class="app-screen m3-pt-6 m3-pb-24 m3-p-4 m3-font-work-sans" style="max-width:960px;margin:0 auto;">
        <div style="margin-bottom:20px;">
          <h1 style="font-size:26px;font-weight:800;color:#1a1a1a;margin:0;letter-spacing:-.5px;display:flex;align-items:center;gap:8px;"><span>📋</span> Plan de Fertilización 2026</h1>
          <p style="font-size:13px;color:#666;margin:4px 0 0;">Guía de abonadas para tu cafetal</p>
        </div>

        ${calendarShellHtml()}

        <div style="margin-top:28px;">
          <h3 style="font-size:15px;font-weight:800;color:#1a1a1a;margin:0 0 10px;display:flex;align-items:center;gap:6px;"><span class="material-symbols-outlined" style="font-size:18px;color:#2d3e2c;">eco</span> Lotes</h3>
          <div style="display:flex;flex-direction:column;gap:8px;">
            ${_ifcafeLotes.map(l => `
              <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;background:white;border:1.5px solid #e8ede8;border-radius:14px;padding:12px 16px;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
                <span style="font-size:14px;font-weight:700;color:#1a1a1a;">${l.nombre}</span>
                <div style="display:flex;align-items:center;gap:10px;">
                  <span style="font-size:12px;font-weight:700;color:${l.realizadas === l.total ? '#2d3e2c' : l.realizadas > 0 ? '#b26a00' : '#888'};background:${l.realizadas === l.total ? '#e8f5e9' : l.realizadas > 0 ? '#fff3e0' : '#f5f5f5'};padding:4px 12px;border-radius:20px;">${l.realizadas}/${l.total} realizadas</span>
                  <a href="#" onclick="event.preventDefault();window.navigateTo('detalle_lote','${l.id}')" style="font-size:12px;font-weight:600;color:#2d3e2c;text-decoration:none;display:flex;align-items:center;gap:4px;padding:6px 12px;background:#f0f7e6;border-radius:20px;">Ver lote <span class="material-symbols-outlined" style="font-size:13px;">arrow_forward</span></a>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>
      ${planStyles()}
    `;
  } catch (err) {
    console.error('Error en plan_ifcafe:', err);
    return `<div class="m3-p-4 m3-text-center"><p class="m3-label-medium m3-text-error">Error: ${err.message}</p></div>`;
  }
}

export function renderLotePlanIfcafe(lote, aplicacionesLote) {
  const altura = parseInt(lote.altura_msnm) || 0;
  const numPlantas = parseInt(lote.num_plantas) || 0;
  const dosisCalc = calcularDosis(lote.edad_categoria, numPlantas);
  const plan = getPlanIfcafe(altura);
  const zonaLabel = getZonaLabel(altura);

  _ifcafeEvents = [];
  _ifcafeLotes = [];
  let realizadas = 0;
  plan.forEach((item, idx) => {
    const { realizada, estado } = estadoDeEvento(item, aplicacionesLote, lote.id);
    if (estado === 'Realizada') realizadas++;
    _ifcafeEvents.push({
      loteId: lote.id, loteNombre: lote.nombre, showLote: false, lote, item, idx,
      matchFecha: matchFechaDate(item), realizada, estado,
      dosisLabel: dosisCalc.porAplicacion.vasitoLabel,
      purpose: descripcionProposito[idx] || ''
    });
  });

  setDefaultCalMonth();

  return `
    <div class="app-screen m3-pt-6 m3-pb-24 m3-p-4 m3-font-work-sans" style="max-width:960px;margin:0 auto;">
      <h1 style="font-size:24px;font-weight:800;color:#1a1a1a;margin:0 0 4px;letter-spacing:-.5px;display:flex;align-items:center;gap:8px;"><span>📋</span> Plan de Fertilización 2026</h1>
      <p style="font-size:13px;color:#666;margin:0 0 16px;">Guía de abonadas para tu cafetal</p>

      <div style="background:linear-gradient(135deg,#2d3e2c,#4a7a48);border-radius:16px;padding:18px 20px;color:white;margin-bottom:16px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;box-shadow:0 4px 20px rgba(45,62,44,0.22);">
        <div style="display:flex;align-items:center;gap:12px;">
          <span class="material-symbols-outlined" style="font-size:28px;">eco</span>
          <div>
            <div style="font-size:18px;font-weight:800;letter-spacing:-.3px;">${lote.nombre}</div>
            <div style="font-size:12px;opacity:.85;">${dosisCalc.label}</div>
          </div>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <span style="font-size:11px;font-weight:700;background:rgba(255,255,255,0.16);padding:5px 12px;border-radius:20px;">Dosis: ${dosisCalc.porAplicacion.vasitoLabel}</span>
          <span style="font-size:11px;font-weight:700;background:rgba(255,255,255,0.16);padding:5px 12px;border-radius:20px;">Zona ${zonaLabel.split(' — ')[0]}</span>
          ${numPlantas > 0 ? `<span style="font-size:11px;font-weight:700;background:rgba(255,255,255,0.16);padding:5px 12px;border-radius:20px;">${dosisCalc.sacosNecesarios} sacos</span>` : ''}
        </div>
        <span style="font-size:12px;font-weight:800;background:${realizadas === plan.length ? '#c8e6c9' : 'rgba(255,255,255,0.16)'};color:${realizadas === plan.length ? '#2d3e2c' : '#fff'};padding:6px 14px;border-radius:20px;">${realizadas}/${plan.length} realizadas</span>
      </div>

      ${calendarShellHtml()}

      <div style="margin-top:16px;">
        <a href="#" onclick="event.preventDefault();window.navigateTo('detalle_lote','${lote.id}')" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#2d3e2c;background:#f0f7e6;padding:8px 16px;border-radius:20px;text-decoration:none;">Ver lote <span class="material-symbols-outlined" style="font-size:15px;">arrow_forward</span></a>
      </div>
    </div>
    ${planStyles()}
  `;
}

export function initPlanIfcafe() {
  window.changePlanCalMonth = function(dir) {
    const next = _calMonth + dir;
    if (next < 0 || next > 11) return;
    _calMonth = next;
    renderPlanCal();
  };

  window.marcarAplicada = async function(loteId, fecha, producto, tipo, dosis, mesLabel) {
    try {
      const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id');
      const metodo = tipo === 'Suelo' ? 'Al suelo' : 'Foliar';
      const productKey = normalizarProducto(producto);
      const mesPlan = fecha ? fecha.substring(0, 7) : '';

      const previas = await restFetch(`/rest/v1/lote_aplicaciones?lote_id=eq.${loteId}&estado=eq.Programada&select=id,producto,fecha,metodo,tipo`);
      const previa = Array.isArray(previas) ? previas.find(a =>
        a.producto && normalizarProducto(a.producto) === productKey &&
        a.fecha && a.fecha.substring(0, 7) === mesPlan
      ) : undefined;

      if (previa) {
        await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${previa.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ estado: 'Aplicada', tipo: 'Fertilizante', metodo })
        });
      } else {
        await restFetch('/rest/v1/lote_aplicaciones', {
          method: 'POST',
          body: JSON.stringify({
            lote_id: loteId, fecha, producto, tipo: 'Fertilizante', dosis,
            metodo, estado: 'Aplicada', operador: '', empresa_id: empresaId
          })
        });
      }

      invalidateCache('lote_aplicaciones');

      window.Snackbar?.show('✅ Aplicación marcada como realizada');
      window.clearScreenCache?.('plan_ifcafe');
      window.navigateTo('plan_ifcafe', ...(_ifcafeLoteId ? [_ifcafeLoteId] : []));
    } catch (err) {
      window.Snackbar?.show('Error: ' + err.message, { type: 'error' });
    }
  };

  window.enviarNotifAhora = async function(loteId, loteNombre, fecha, producto, dosisLabel, tipo, mesLabel) {
    try {
      const msg = `📋 Recordatorio de abonada\n\nLote: ${loteNombre || 'Mi finca'}\nMes: ${mesLabel}\nTipo: ${tipo}\nProducto: ${producto}\nDosis: ${dosisLabel}\nFecha: ${fecha}`;
      await sendWhatsApp(msg);
      localStorage.setItem(waNotifiedKey(fecha, loteId), new Date().toLocaleString());
      window.Snackbar?.show('📤 Notificación enviada por WhatsApp');
      window.clearScreenCache?.('plan_ifcafe');
      window.navigateTo('plan_ifcafe', ...(_ifcafeLoteId ? [_ifcafeLoteId] : []));
    } catch (err) {
      window.Snackbar?.show('Error al enviar: ' + err.message, { type: 'error' });
    }
  };

  renderPlanCal();
}
