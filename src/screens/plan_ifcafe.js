import { restFetch } from '../auth.js';
import { getPlanIfcafe, getZonaLabel, calcularDosis, normalizarProducto, fraccionDesdeDosis } from '../utils/calculadora_dosis.js';
import { dibujarVasitoCompacto } from '../utils/vasito_medidor.js';
import { sendWhatsApp } from '../wa.js';

let _ifcafeMonth = null;
let _ifcafeLoteId = null;
let _ifcafeViewData = null;
let _ifcafeCurrentIdx = 0;

const MESES_NOMBRE = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
  5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
  9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const descripcionProposito = {
  0: 'Fertilización de fondo para arranque del ciclo productivo',
  1: 'Estimula la floración y el cuaje del fruto',
  2: 'Sostén de la carga para el desarrollo del grano',
  3: 'Previene clorosis y fortalece el follaje',
  4: 'Llenado y peso del grano antes de cosecha'
};

function getLocalToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function waNotifiedKey(appFecha, loteId) {
  return `wa_notified_app_${appFecha}_${loteId}`;
}

function getSelectedMes(planMonths) {
  const cur = new Date().getMonth() + 1;
  if (_ifcafeMonth === null) {
    return planMonths.includes(cur) ? cur : 'all';
  }
  return _ifcafeMonth;
}

function buildIfcafeInfoHtml(pc, data, idx) {
  const { item, matchFecha, realizada } = pc;
  const total = data.plan.length;
  const icono = item.tipo === 'Suelo' ? 'humidity_high' : 'spa';
  const metodoLabel = item.tipo === 'Suelo' ? 'Al suelo' : 'Foliar';
  const atrasada = matchFecha < getLocalToday();
  const estadoLabel = realizada ? 'Realizada' : (atrasada ? 'Atrasada' : 'Pendiente');
  const badgeBg = realizada ? '#c8e6c9' : (atrasada ? '#ffcdd2' : '#ffd54f');
  const purpose = descripcionProposito[data.plan.indexOf(item)] || '';

  let fraccion = data.dosisCalc.porAplicacion.fraccion;
  let dosisLabel = data.dosisCalc.porAplicacion.vasitoLabel;
  if (realizada?.dosis) {
    const f = fraccionDesdeDosis(realizada.dosis);
    if (f) { fraccion = f; dosisLabel = realizada.dosis; }
  } else if (item.dosis?.fraccion) {
    fraccion = item.dosis.fraccion;
    dosisLabel = item.dosis.vasitoLabel || dosisLabel;
  }

  const notifBtn = !realizada ? `
    <button onclick="event.preventDefault();enviarNotifAhora('${data.lote.id}','${data.lote.nombre.replace(/'/g, "\\'")}','${matchFecha}','${item.producto.replace(/'/g, "\\'")}','${dosisLabel.replace(/'/g, "\\'")}','${item.tipo}','${item.mesLabel}','')" style="background:#f0f7e6;color:#2d3e2c;border:1.5px solid #2d3e2c;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:'Work Sans',sans-serif;">
      📤 Enviar notificación
    </button>` : '';
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
      <span style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.65);text-transform:uppercase;letter-spacing:.5px;">Aplicación ${(idx ?? 0) + 1} de ${total}</span>
      <span style="font-size:11px;font-weight:700;color:#2d3e2c;background:${badgeBg};padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.3px;">${estadoLabel}</span>
    </div>
    <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
      <div style="display:flex;align-items:center;gap:10px;min-width:0;">
        <span class="material-symbols-outlined" style="font-size:22px;color:white;">${icono}</span>
        <div style="min-width:0;">
          <p style="font-size:14px;font-weight:700;color:white;margin:0;">${item.producto}</p>
          <p style="font-size:12px;color:rgba(255,255,255,0.75);margin:4px 0 0;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span>${item.mesLabel} · ${metodoLabel}</span>
            <span style="display:inline-flex;align-items:center;gap:4px;">${dibujarVasitoCompacto(fraccion)} <span>${dosisLabel}</span></span>
            ${realizada ? `<span>· Aplicada: ${realizada.fecha || ''}</span>` : ''}
          </p>
        </div>
      </div>
      ${notifBtn}
    </div>
    <p style="font-size:12px;color:rgba(255,255,255,0.85);margin:10px 0 0;line-height:1.4;">🎯 ${purpose}</p>
  `;
}

function buildIfcafeSegments(activeIdx) {
  const data = _ifcafeViewData;
  if (!data) return '';
  return data.planConEstado.map((p, idx) => {
    const active = idx === activeIdx;
    return `<div onclick="selectIfcafeApp(${idx})" title="${p.item.mesLabel} — ${p.item.producto}" style="flex:1;height:12px;border-radius:6px;cursor:pointer;background:${p.realizada ? '#c8e6c9' : 'rgba(255,255,255,0.22)'};${active ? 'box-shadow:0 0 0 2px #ffffff;' : ''}"></div>`;
  }).join('');
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

    // Vista individual de lote (#plan_ifcafe/{loteId}): plan en una sola vista
    if (_ifcafeLoteId) {
      const lote = lotes.find(l => l.id === _ifcafeLoteId);
      if (!lote || !lote.edad_categoria) {
        return `<div class="app-screen m3-pt-6 m3-pb-24 m3-p-4 m3-font-work-sans" style="max-width:900px;margin:0 auto;">
          <div style="background:white;border-radius:20px;padding:48px 24px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.04);">
            <span class="material-symbols-outlined" style="font-size:48px;color:#ccc;">eco</span>
            <p style="font-size:16px;font-weight:600;color:#666;margin:12px 0 0;">Este lote no tiene plan IFCAFE</p>
          </div>
        </div>`;
      }
      return renderLotePlanIfcafe(lote, aplicaciones.filter(a => a.lote_id === _ifcafeLoteId));
    }

    let lotesConPlan = lotes.filter(l => l.edad_categoria);

    const planMonthsSet = new Set();
    lotesConPlan.forEach(l => {
      const p = getPlanIfcafe(parseInt(l.altura_msnm) || 0);
      p.forEach(item => planMonthsSet.add(item.mes));
    });
    const planMonths = [...planMonthsSet].sort((a, b) => a - b);

    const selectedMes = getSelectedMes(planMonths);

    const gradientPorEstado = (realizada, matchFecha) => {
      if (realizada) return 'linear-gradient(135deg, #e8f5e9, #c8e6c9)';
      if (matchFecha < getLocalToday()) return 'linear-gradient(135deg, #ffebee, #ffcdd2)';
      return 'linear-gradient(135deg, #fff8e1, #ffecb3)';
    };

    const cards = lotesConPlan.map(lote => {
      const altura = parseInt(lote.altura_msnm) || 0;
      const numPlantas = parseInt(lote.num_plantas) || 0;
      const dosisCalc = calcularDosis(lote.edad_categoria, numPlantas);
      const plan = getPlanIfcafe(altura);
      const zonaLabel = getZonaLabel(altura);

      const realizadasCount = plan.filter(item => {
        const matchFecha = new Date(2026, item.mes - 1, 15).toISOString().split('T')[0];
        return (aplicaciones || []).some(a =>
          a.lote_id === lote.id &&
          a.producto && normalizarProducto(a.producto) === normalizarProducto(item.producto) &&
          a.fecha && a.fecha.startsWith(matchFecha.substring(0, 7)) &&
          a.estado === 'Aplicada'
        );
      }).length;

      const planItemsFiltered = selectedMes === 'all'
        ? plan
        : plan.filter(item => item.mes === selectedMes);

      const planCards = planItemsFiltered.map((item, idx) => {
        const origIdx = plan.indexOf(item);
        const matchFecha = new Date(2026, item.mes - 1, 15).toISOString().split('T')[0];
        const realizada = (aplicaciones || []).find(a => {
          if (a.lote_id !== lote.id) return false;
          const aFecha = a.fecha ? a.fecha.substring(0, 7) : '';
          const pFecha = matchFecha.substring(0, 7);
          return a.producto && normalizarProducto(a.producto) === normalizarProducto(item.producto) && aFecha === pFecha && a.estado === 'Aplicada';
        });
        const estadoLabel = realizada ? 'Realizada' : (matchFecha < getLocalToday() ? 'Atrasada' : 'Pendiente');
        const badgeBg = realizada ? '#2d3e2c' : (matchFecha < getLocalToday() ? '#c62828' : '#f57c00');
        const icono = item.tipo === 'Suelo' ? 'humidity_high' : 'spa';
        const purpose = descripcionProposito[origIdx] || '';
        const cardId = `ifcafe-card-${lote.id}-${origIdx}`;
        const expandId = `ifcafe-expand-${lote.id}-${origIdx}`;
        const waSent = localStorage.getItem(waNotifiedKey(matchFecha, lote.id));
        const appReal = (aplicaciones || []).find(a => a.lote_id === lote.id && a.fecha && a.fecha.startsWith(matchFecha.substring(0, 7)) && a.producto && normalizarProducto(a.producto) === normalizarProducto(item.producto));

        return `
          <div id="${cardId}" style="background:white;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1.5px solid #e0e0e0;overflow:hidden;transition:all .2s;cursor:pointer;" onclick="toggleIfcafeCard('${expandId}')">
            <div style="background:${gradientPorEstado(realizada, matchFecha)};padding:20px 20px 16px;border-bottom:1px solid rgba(0,0,0,0.04);">
              <div style="display:flex;align-items:center;justify-content:space-between;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <span class="material-symbols-outlined" style="font-size:28px;color:#2d3e2c;">${icono}</span>
                  <div>
                    <span style="font-size:16px;font-weight:700;color:#1a1a1a;letter-spacing:-.3px;">${item.mesLabel}</span>
                    <span style="font-size:12px;font-weight:600;color:#5a5a5a;margin-left:6px;text-transform:uppercase;">${item.tipo}</span>
                  </div>
                </div>
                <span style="font-size:11px;font-weight:700;color:white;background:${badgeBg};padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:.3px;">${estadoLabel}</span>
              </div>
            </div>
            <div style="padding:16px 20px 12px;">
              <p style="font-size:15px;font-weight:600;color:#2d3e2c;margin:0 0 4px;">${item.producto}</p>
              <p style="font-size:13px;color:#666;margin:0 0 6px;line-height:1.4;font-style:italic;">${item.recomendacion}</p>
              <p style="font-size:13px;color:#3a6b3a;margin:0;line-height:1.3;">🎯 ${purpose}</p>
              <div style="margin-top:8px;display:flex;align-items:center;gap:6px;">
                <span class="material-symbols-outlined" style="font-size:14px;color:#888;">calendar_month</span>
                <span style="font-size:12px;color:#888;">${matchFecha}</span>
                ${selectedMes === 'all' ? '<span style="font-size:11px;color:#aaa;margin-left:auto;">▼ tocar para detalles</span>' : ''}
              </div>
            </div>
            <div id="${expandId}" style="display:none;border-top:1px solid #e0e0e0;padding:16px 20px 20px;background:#fafafa;">
              <div style="display:flex;flex-direction:column;gap:10px;">
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="material-symbols-outlined" style="font-size:18px;color:${appReal?.estado === 'Aplicada' ? '#2d3e2c' : '#888'};">${appReal?.estado === 'Aplicada' ? 'check_circle' : 'radio_button_unchecked'}</span>
                  <span style="font-size:13px;font-weight:600;color:#333;">Estado:</span>
                  <span style="font-size:13px;color:${appReal?.estado === 'Aplicada' ? '#2d3e2c' : '#888'};">${appReal?.estado || 'No registrada'}</span>
                </div>
                <div style="display:flex;align-items:center;gap:8px;">
                  <span class="material-symbols-outlined" style="font-size:18px;color:${waSent ? '#2d3e2c' : '#888'};">${waSent ? 'notifications_active' : 'notifications_off'}</span>
                  <span style="font-size:13px;font-weight:600;color:#333;">Notificación:</span>
                  <span style="font-size:13px;color:${waSent ? '#2d3e2c' : '#888'};">${waSent || 'No enviada'}</span>
                </div>
                <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:4px;">
                  ${!realizada ? `
                  <button onclick="event.stopPropagation();marcarAplicada('${lote.id}','${matchFecha}','${item.producto.replace(/'/g, "\\'")}','${item.tipo}','${dosisCalc.porAplicacion.vasitoLabel}','${item.mesLabel}','${expandId}')" style="background:#2d3e2c;color:white;border:none;padding:8px 16px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:'Work Sans',sans-serif;">
                    ✅ Marcar como aplicada
                  </button>
                  ` : ''}
                  <button onclick="event.stopPropagation();enviarNotifAhora('${lote.id}','${lote.nombre.replace(/'/g, "\\'")}','${matchFecha}','${item.producto.replace(/'/g, "\\'")}','${dosisCalc.porAplicacion.vasitoLabel}','${item.tipo}','${item.mesLabel}','${expandId}')" style="background:#f0f7e6;color:#2d3e2c;border:1.5px solid #2d3e2c;padding:8px 16px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:'Work Sans',sans-serif;">
                    📤 Enviar notificación
                  </button>
                </div>
              </div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="background:white;border-radius:20px;box-shadow:0 4px 24px rgba(0,0,0,0.06);border:2px solid #e8ede8;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#f0f7e6,#e8f5e9);padding:20px 24px 16px;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;">
              <div style="display:flex;align-items:center;gap:12px;">
                <span class="material-symbols-outlined" style="font-size:28px;color:#2d3e2c;">eco</span>
                <h2 style="font-size:20px;font-weight:800;color:#1a1a1a;margin:0;letter-spacing:-.5px;">${lote.nombre}</h2>
              </div>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:11px;font-weight:700;color:white;background:${realizadasCount === 5 ? '#2d3e2c' : realizadasCount > 0 ? '#f57c00' : '#888'};padding:4px 12px;border-radius:20px;">${realizadasCount}/5 realizadas</span>
                <a href="#" onclick="event.preventDefault();window.navigateTo('detalle_lote','${lote.id}')" style="font-size:12px;font-weight:600;color:#2d3e2c;text-decoration:none;display:flex;align-items:center;gap:4px;padding:6px 14px;background:white;border-radius:20px;box-shadow:0 1px 4px rgba(0,0,0,0.08);">
                  Ver lote
                  <span class="material-symbols-outlined" style="font-size:14px;">arrow_forward</span>
                </a>
              </div>
            </div>
            <div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:12px;">
              <div style="display:flex;align-items:center;gap:6px;background:white;padding:5px 12px;border-radius:20px;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
                <span style="font-size:11px;font-weight:700;color:#5a5a5a;text-transform:uppercase;">Edad</span>
                <span style="font-size:12px;font-weight:600;color:#2d3e2c;">${dosisCalc.label}</span>
              </div>
              <div style="display:flex;align-items:center;gap:6px;background:white;padding:5px 12px;border-radius:20px;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
                <span style="font-size:11px;font-weight:700;color:#5a5a5a;text-transform:uppercase;">Dosis</span>
                <span style="font-size:12px;font-weight:600;color:#2d3e2c;">${dosisCalc.porAplicacion.vasitoLabel}</span>
                ${dibujarVasitoCompacto(dosisCalc.porAplicacion.fraccion)}
              </div>
              <div style="display:flex;align-items:center;gap:6px;background:white;padding:5px 12px;border-radius:20px;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
                <span style="font-size:11px;font-weight:700;color:#5a5a5a;text-transform:uppercase;">Zona</span>
                <span style="font-size:12px;font-weight:600;color:#2d3e2c;">${zonaLabel}</span>
              </div>
              ${numPlantas > 0 ? `
              <div style="display:flex;align-items:center;gap:6px;background:white;padding:5px 12px;border-radius:20px;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
                <span style="font-size:11px;font-weight:700;color:#5a5a5a;text-transform:uppercase;">Sacos</span>
                <span style="font-size:12px;font-weight:600;color:#2d3e2c;">${dosisCalc.sacosNecesarios} x apl.</span>
              </div>` : ''}
            </div>
          </div>
          <div style="padding:20px 24px 24px;">
            ${planCards ? `<div class="${selectedMes === 'all' ? 'plan-grid' : ''}">${planCards}</div>` : ''}
          </div>
        </div>
      `;
    });

    const selectOptions = `
      <option value="all">Todas las aplicaciones</option>
      ${planMonths.map(m => `
        <option value="${m}" ${selectedMes === m ? 'selected' : ''}>
          ${MESES_NOMBRE[m] || m}
        </option>
      `).join('')}
    `;

    return `
      <div class="app-screen m3-pt-6 m3-pb-24 m3-p-4 m3-font-work-sans" style="max-width:900px;margin:0 auto;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:24px;gap:16px;flex-wrap:wrap;">
          <div>
            <h1 style="font-size:26px;font-weight:800;color:#1a1a1a;margin:0;letter-spacing:-.5px;display:flex;align-items:center;gap:8px;">
              <span>📋</span> Plan IFCAFE 2026${lotesConPlan.length === 1 && filterLoteId && filterLoteId !== 'null' ? ` — ${lotesConPlan[0].nombre}` : ''}
            </h1>
            <p style="font-size:13px;color:#666;margin:4px 0 0;">Plan de fertilización para café según IHCAFE</p>
          </div>
          <div style="min-width:200px;">
            <label for="ifcafe-month-select" style="font-size:12px;font-weight:600;color:#555;display:block;margin-bottom:4px;">Filtrar por mes</label>
            <select id="ifcafe-month-select" style="width:100%;padding:12px 36px 12px 16px;border:2px solid #d0d8d0;border-radius:12px;font-size:14px;font-weight:600;color:#2d3e2c;background:#f5f8f5;font-family:'Work Sans',sans-serif;appearance:none;-webkit-appearance:none;cursor:pointer;background-image:url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='%232d3e2c'%3E%3Cpath d='M7 10l5 5 5-5z'/%3E%3C/svg%3E\");background-repeat:no-repeat;background-position:right 12px center;background-size:16px;">
              ${selectOptions}
            </select>
          </div>
        </div>

        ${lotesConPlan.length === 0 ? `
        <div style="background:white;border-radius:20px;padding:60px 24px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.04);">
          <span class="material-symbols-outlined" style="font-size:56px;color:#ccc;">eco</span>
          <p style="font-size:18px;font-weight:600;color:#666;margin:16px 0 4px;">No hay lotes con plan IFCAFE</p>
          <p style="font-size:14px;color:#999;">Crea un lote con edad y altura para generar su plan de fertilización</p>
        </div>
        ` : `
        <div style="display:flex;flex-direction:column;gap:24px;">
          ${cards.join('\n')}
        </div>
        `}

        <div style="margin-top:24px;display:flex;justify-content:center;gap:12px;flex-wrap:wrap;">
          ${planMonths.map(m => `
            <span style="font-size:12px;color:#555;background:white;padding:6px 14px;border-radius:20px;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
              ${MESES_NOMBRE[m] || m}
            </span>
          `).join('')}
        </div>
      </div>
      <style>
        .plan-grid { display:grid;grid-template-columns:1fr;gap:16px; }
        @media (min-width:640px) { .plan-grid { grid-template-columns:repeat(2,1fr); } }
        @media (min-width:1024px) { .plan-grid { grid-template-columns:repeat(3,1fr); } }
      </style>
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
  const hoy = getLocalToday();

  const planConEstado = plan.map((item) => {
    const matchFecha = new Date(2026, item.mes - 1, 15).toISOString().split('T')[0];
    const mesPlan = matchFecha.substring(0, 7);
    const realizada = (aplicacionesLote || []).find(a =>
      a.estado === 'Aplicada' &&
      a.producto && normalizarProducto(a.producto) === normalizarProducto(item.producto) &&
      a.fecha && a.fecha.substring(0, 7) === mesPlan
    ) || null;
    return { item, matchFecha, realizada };
  });

  const realizadas = planConEstado.filter(p => p.realizada);
  const ultimaRealizada = realizadas.length ? realizadas[realizadas.length - 1] : null;
  const siguientes = planConEstado.filter(p => !p.realizada);
  const realizadasCount = realizadas.length;

  _ifcafeViewData = { plan, planConEstado, lote, dosisCalc };

  const progressLabel = realizadasCount >= plan.length
    ? '¡Plan completado! 5 de 5 aplicaciones realizadas 🎉'
    : `Aplicación ${plan.indexOf(siguientes[0].item) + 1} de ${plan.length} — ${siguientes[0].item.producto} en ${siguientes[0].item.mesLabel}`;

  const defaultPc = siguientes[0] || realizadas[realizadas.length - 1] || planConEstado[0] || null;
  const defaultIdx = defaultPc ? plan.indexOf(defaultPc.item) : 0;
  _ifcafeCurrentIdx = defaultIdx;
  const mainInfoHtml = defaultPc ? buildIfcafeInfoHtml(defaultPc, { plan, dosisCalc, lote }, defaultIdx) : '';
  const segmentos = buildIfcafeSegments(defaultIdx);

  const chip = (label, value, extra = '') => `
    <div style="display:flex;align-items:center;gap:6px;background:white;padding:5px 12px;border-radius:20px;box-shadow:0 1px 4px rgba(0,0,0,0.04);">
      <span style="font-size:11px;font-weight:700;color:#5a5a5a;text-transform:uppercase;">${label}</span>
      <span style="font-size:12px;font-weight:600;color:#2d3e2c;">${value}</span>
      ${extra}
    </div>`;

  const headerBadgeBg = realizadasCount === plan.length ? '#c8e6c9' : (realizadasCount > 0 ? '#ffd54f' : 'rgba(255,255,255,0.18)');
  const headerBadgeText = realizadasCount === plan.length ? '#2d3e2c' : 'white';

  const aplicadaSection = ultimaRealizada ? `
    <div style="margin-top:24px;">
      <h3 style="font-size:15px;font-weight:700;color:#1a1a1a;margin:0 0 10px;display:flex;align-items:center;gap:6px;">
        <span class="material-symbols-outlined" style="font-size:18px;color:#2d3e2c;">check_circle</span>
        Aplicada
      </h3>
      <div style="background:white;border-radius:16px;box-shadow:0 2px 8px rgba(0,0,0,0.06);border:1.5px solid #c8e6c9;overflow:hidden;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 20px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;">
            <span class="material-symbols-outlined" style="font-size:22px;color:#2d3e2c;">humidity_high</span>
            <div style="min-width:0;">
              <p style="font-size:14px;font-weight:700;color:#2d3e2c;margin:0;">${ultimaRealizada.item.producto}</p>
              <p style="font-size:12px;color:#666;margin:2px 0 0;">${ultimaRealizada.item.mesLabel} · ${ultimaRealizada.item.tipo === 'Suelo' ? 'Al suelo' : 'Foliar'} · ${ultimaRealizada.realizada.fecha || ''}</p>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <button onclick="event.preventDefault();enviarNotifAhora('${lote.id}','${lote.nombre.replace(/'/g, "\\'")}','${ultimaRealizada.matchFecha}','${ultimaRealizada.item.producto.replace(/'/g, "\\'")}','${dosisCalc.porAplicacion.vasitoLabel}','${ultimaRealizada.item.tipo}','${ultimaRealizada.item.mesLabel}','')" style="background:#f0f7e6;color:#2d3e2c;border:1.5px solid #2d3e2c;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:'Work Sans',sans-serif;">
              📤 Enviar notificación
            </button>
            <span style="font-size:11px;font-weight:700;color:#2d3e2c;background:#e8f5e9;padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:.3px;">Realizada</span>
          </div>
        </div>
      </div>
    </div>
  ` : '';

  const siguientesCards = siguientes.map((p, idx) => {
    const idxPlan = plan.indexOf(p.item);
    const icono = p.item.tipo === 'Suelo' ? 'humidity_high' : 'spa';
    const atrasada = p.matchFecha < hoy;
    const estadoLabel = atrasada ? 'Atrasada' : 'Pendiente';
    const badgeBg = atrasada ? '#c62828' : '#f57c00';
    const purpose = descripcionProposito[idxPlan] || '';
    const metodoLabel = p.item.tipo === 'Suelo' ? 'Al suelo' : 'Foliar';
    const notifBtn = idx === 0 ? `
      <button onclick="event.preventDefault();enviarNotifAhora('${lote.id}','${lote.nombre.replace(/'/g, "\\'")}','${p.matchFecha}','${p.item.producto.replace(/'/g, "\\'")}','${dosisCalc.porAplicacion.vasitoLabel}','${p.item.tipo}','${p.item.mesLabel}','')" style="background:#f0f7e6;color:#2d3e2c;border:1.5px solid #2d3e2c;padding:8px 14px;border-radius:10px;font-size:12px;font-weight:600;cursor:pointer;display:flex;align-items:center;gap:4px;font-family:'Work Sans',sans-serif;">
        📤 Enviar notificación
      </button>` : '';
    return `
      <div style="background:white;border-radius:14px;box-shadow:0 2px 8px rgba(0,0,0,0.05);border:1.5px solid ${atrasada ? '#ffcdd2' : '#e0e0e0'};padding:14px 16px;">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:10px;min-width:0;flex:1;">
            <span class="material-symbols-outlined" style="font-size:20px;color:#2d3e2c;">${icono}</span>
            <div style="min-width:0;">
              <p style="font-size:14px;font-weight:700;color:#1a1a1a;margin:0;">${p.item.producto}</p>
              <p style="font-size:12px;color:#666;margin:2px 0 0;">${p.item.mesLabel} · ${metodoLabel} · Dosis ${dosisCalc.porAplicacion.vasitoLabel}</p>
              <p style="font-size:12px;color:#3a6b3a;margin:4px 0 0;line-height:1.3;">🎯 ${purpose}</p>
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:8px;">
            ${notifBtn}
            <span style="font-size:11px;font-weight:700;color:white;background:${badgeBg};padding:4px 12px;border-radius:20px;text-transform:uppercase;letter-spacing:.3px;">${estadoLabel}</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  const siguientesSection = `
    <div style="margin-top:24px;">
      <h3 style="font-size:15px;font-weight:700;color:#1a1a1a;margin:0 0 10px;display:flex;align-items:center;gap:6px;">
        <span class="material-symbols-outlined" style="font-size:18px;color:#2d3e2c;">spa</span>
        Siguientes en el plan
      </h3>
      ${siguientes.length ? `<div style="display:flex;flex-direction:column;gap:10px;">${siguientesCards}</div>` : `
      <div style="background:#e8f5e9;border-radius:14px;padding:16px 20px;text-align:center;">
        <p style="font-size:14px;font-weight:600;color:#2d3e2c;margin:0;">🎉 ¡El plan IFCAFE 2026 está completo!</p>
      </div>`}
    </div>
  `;

  return `
    <div class="app-screen m3-pt-6 m3-pb-24 m3-p-4 m3-font-work-sans" style="max-width:900px;margin:0 auto;">
      <h1 style="font-size:24px;font-weight:800;color:#1a1a1a;margin:0 0 4px;letter-spacing:-.5px;display:flex;align-items:center;gap:8px;">
        <span>📋</span> Plan IFCAFE 2026
      </h1>
      <p style="font-size:13px;color:#666;margin:0 0 20px;">Plan de fertilización para café según IHCAFE</p>

      <div style="background:linear-gradient(135deg,#2d3e2c,#4a7a48);border-radius:20px;padding:24px;box-shadow:0 4px 24px rgba(45,62,44,0.25);">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap;">
          <div style="display:flex;align-items:center;gap:12px;">
            <span class="material-symbols-outlined" style="font-size:30px;color:white;">eco</span>
            <div>
              <h2 style="font-size:20px;font-weight:800;color:white;margin:0;letter-spacing:-.4px;">${lote.nombre}</h2>
              <p style="font-size:12px;color:rgba(255,255,255,0.75);margin:2px 0 0;">${dosisCalc.label}</p>
            </div>
          </div>
          <span style="font-size:11px;font-weight:700;color:${headerBadgeText};background:${headerBadgeBg};padding:5px 14px;border-radius:20px;letter-spacing:.3px;">${realizadasCount}/5 realizadas</span>
        </div>
        <div id="ifcafe-segments" style="display:flex;gap:6px;margin-top:20px;">
          ${segmentos}
        </div>
        <p style="font-size:13px;font-weight:600;color:rgba(255,255,255,0.9);margin:8px 0 0;">${progressLabel}</p>
        <div style="display:flex;align-items:stretch;gap:8px;margin-top:16px;">
          <button onclick="event.preventDefault();prevIfcafeApp()" aria-label="Anterior" style="flex:0 0 auto;width:42px;border:none;border-radius:12px;background:rgba(255,255,255,0.15);color:white;font-size:22px;cursor:pointer;font-family:'Work Sans',sans-serif;">‹</button>
          <div id="ifcafe-main-info" style="flex:1;min-width:0;background:rgba(255,255,255,0.08);border:1px solid rgba(255,255,255,0.18);border-radius:14px;padding:14px 16px;">
            ${mainInfoHtml}
          </div>
          <button onclick="event.preventDefault();nextIfcafeApp()" aria-label="Siguiente" style="flex:0 0 auto;width:42px;border:none;border-radius:12px;background:rgba(255,255,255,0.15);color:white;font-size:22px;cursor:pointer;font-family:'Work Sans',sans-serif;">›</button>
        </div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px;">
          ${chip('Edad', dosisCalc.label)}
          ${chip('Dosis', dosisCalc.porAplicacion.vasitoLabel, dibujarVasitoCompacto(dosisCalc.porAplicacion.fraccion))}
          ${chip('Zona', `Zona ${zonaLabel.split(' — ')[0]}`)}
          ${numPlantas > 0 ? chip('Sacos', `${dosisCalc.sacosNecesarios} x apl.`) : ''}
        </div>
        <div style="margin-top:18px;">
          <a href="#" onclick="event.preventDefault();window.navigateTo('detalle_lote','${lote.id}')" style="display:inline-flex;align-items:center;gap:6px;font-size:13px;font-weight:600;color:#2d3e2c;background:white;padding:8px 18px;border-radius:20px;text-decoration:none;box-shadow:0 2px 8px rgba(0,0,0,0.15);">
            Ver lote
            <span class="material-symbols-outlined" style="font-size:15px;">arrow_forward</span>
          </a>
        </div>
      </div>

      ${aplicadaSection}
      ${siguientesSection}
    </div>
    <style>
      #ifcafe-main-info { transition: box-shadow .2s; }
      .ifcafe-main-flash { animation: ifcafeMainFlash .8s ease; }
      @keyframes ifcafeMainFlash {
        0% { box-shadow: 0 0 0 3px rgba(255,255,255,0.7); }
        100% { box-shadow: 0 0 0 0 rgba(255,255,255,0); }
      }
    </style>
  `;
}

export function initPlanIfcafe() {
  window.toggleIfcafeCard = function(expandId) {
    const el = document.getElementById(expandId);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  window.selectIfcafeApp = function(idx) {
    const data = _ifcafeViewData;
    const pc = data?.planConEstado?.find(p => data.plan.indexOf(p.item) === idx);
    const el = document.getElementById('ifcafe-main-info');
    if (!pc || !el) return;
    _ifcafeCurrentIdx = idx;
    el.innerHTML = buildIfcafeInfoHtml(pc, data, idx);
    el.classList.remove('ifcafe-main-flash');
    void el.offsetWidth;
    el.classList.add('ifcafe-main-flash');
    const segEl = document.getElementById('ifcafe-segments');
    if (segEl) segEl.innerHTML = buildIfcafeSegments(idx);
  };

  function moveIfcafeApp(dir) {
    const data = _ifcafeViewData;
    if (!data || data.plan.length === 0) return;
    const next = Math.min(Math.max((_ifcafeCurrentIdx ?? 0) + dir, 0), data.plan.length - 1);
    if (next !== _ifcafeCurrentIdx) window.selectIfcafeApp(next);
  }

  window.prevIfcafeApp = () => moveIfcafeApp(-1);
  window.nextIfcafeApp = () => moveIfcafeApp(1);

  window.marcarAplicada = async function(loteId, fecha, producto, tipo, dosis, mesLabel, expandId) {
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

      window.Snackbar?.show('✅ Aplicación marcada como realizada');
      const expandEl = document.getElementById(expandId);
      if (expandEl) expandEl.style.display = 'none';
      window.clearScreenCache?.('plan_ifcafe');
      window.navigateTo('plan_ifcafe', loteId);
    } catch (err) {
      window.Snackbar?.show('Error: ' + err.message, { type: 'error' });
    }
  };

  window.enviarNotifAhora = async function(loteId, loteNombre, fecha, producto, dosisLabel, tipo, mesLabel, expandId) {
    try {
      const msg = `📋 Recordatorio IFCAFE 2026\n\nLote: ${loteNombre}\nMes: ${mesLabel}\nTipo: ${tipo}\nProducto: ${producto}\nDosis: ${dosisLabel}\nFecha: ${fecha}`;
      await sendWhatsApp(msg);
      localStorage.setItem(waNotifiedKey(fecha, loteId), new Date().toLocaleString());
      window.Snackbar?.show('📤 Notificación enviada por WhatsApp');
      if (expandId) {
        const expandEl = document.getElementById(expandId);
        if (expandEl) expandEl.style.display = 'none';
      } else {
        window.clearScreenCache?.('plan_ifcafe');
        window.navigateTo('plan_ifcafe', loteId);
      }
    } catch (err) {
      window.Snackbar?.show('Error al enviar: ' + err.message, { type: 'error' });
    }
  };

  const select = document.getElementById('ifcafe-month-select');
  if (select) {
    select.addEventListener('change', function() {
      _ifcafeMonth = this.value === 'all' ? 'all' : parseInt(this.value, 10);
      window.clearScreenCache?.('plan_ifcafe');
      window.navigateTo('plan_ifcafe', ...(_ifcafeLoteId ? [_ifcafeLoteId] : []));
    });
  }
}
