import { restFetch } from '../auth.js';
import { getPlanIfcafe, getZonaLabel, calcularDosis } from '../utils/calculadora_dosis.js';
import { dibujarVasitoCompacto } from '../utils/vasito_medidor.js';
import { sendWhatsApp } from '../wa.js';

let _ifcafeMonth = null;

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

export async function renderPlanIfcafe(filterLoteId) {
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

    let lotesConPlan = lotes.filter(l => l.edad_categoria);

    if (filterLoteId && filterLoteId !== 'null') {
      lotesConPlan = lotesConPlan.filter(l => l.id === filterLoteId);
    }

    const planMonthsSet = new Set();
    lotesConPlan.forEach(l => {
      const p = getPlanIfcafe(parseInt(l.altura_msnm) || 0);
      p.forEach(item => planMonthsSet.add(item.mes));
    });
    const planMonths = [...planMonthsSet].sort((a, b) => a - b);

    let aplicaciones = [];
    try {
      aplicaciones = await restFetch(`/rest/v1/lote_aplicaciones?empresa_id=eq.${empresaId}&select=*`);
      if (!Array.isArray(aplicaciones)) aplicaciones = [];
    } catch (e) { console.warn('No se pudieron cargar aplicaciones:', e); }
    if (filterLoteId && filterLoteId !== 'null') {
      aplicaciones = aplicaciones.filter(a => a.lote_id === filterLoteId);
    }

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
          a.producto && a.producto.includes(item.producto.substring(0, 8)) &&
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
          return a.producto && a.producto.includes(item.producto.substring(0, 8)) && aFecha === pFecha && a.estado === 'Aplicada';
        });
        const estadoLabel = realizada ? 'Realizada' : (matchFecha < getLocalToday() ? 'Atrasada' : 'Pendiente');
        const badgeBg = realizada ? '#2d3e2c' : (matchFecha < getLocalToday() ? '#c62828' : '#f57c00');
        const icono = item.tipo === 'Suelo' ? 'humidity_high' : 'spa';
        const purpose = descripcionProposito[origIdx] || '';
        const cardId = `ifcafe-card-${lote.id}-${origIdx}`;
        const expandId = `ifcafe-expand-${lote.id}-${origIdx}`;
        const waSent = localStorage.getItem(waNotifiedKey(matchFecha, lote.id));
        const appReal = (aplicaciones || []).find(a => a.lote_id === lote.id && a.fecha && a.fecha.startsWith(matchFecha.substring(0, 7)) && a.producto && a.producto.includes(item.producto.substring(0, 8)));

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

export function initPlanIfcafe() {
  window.toggleIfcafeCard = function(expandId) {
    const el = document.getElementById(expandId);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  };

  window.marcarAplicada = async function(loteId, fecha, producto, tipo, dosis, mesLabel, expandId) {
    try {
      const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id');
      await restFetch('/rest/v1/lote_aplicaciones', {
        method: 'POST',
        body: JSON.stringify({
          lote_id: loteId, fecha, producto, tipo, dosis,
          metodo: tipo === 'Suelo' ? 'Al suelo' : 'Foliar',
          estado: 'Aplicada', operador: '', empresa_id: empresaId
        })
      });
      window.Snackbar?.show('✅ Aplicación marcada como realizada');
      const expandEl = document.getElementById(expandId);
      if (expandEl) expandEl.style.display = 'none';
      window.clearScreenCache?.('plan_ifcafe');
      window.navigateTo('plan_ifcafe');
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
      const expandEl = document.getElementById(expandId);
      if (expandEl) expandEl.style.display = 'none';
    } catch (err) {
      window.Snackbar?.show('Error al enviar: ' + err.message, { type: 'error' });
    }
  };

  const select = document.getElementById('ifcafe-month-select');
  if (select) {
    select.addEventListener('change', function() {
      _ifcafeMonth = this.value === 'all' ? 'all' : parseInt(this.value, 10);
      window.clearScreenCache?.('plan_ifcafe');
      window.navigateTo('plan_ifcafe');
    });
  }
}
