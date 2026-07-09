import { restFetch } from '../auth.js';
import { getPlanIfcafe, getZonaLabel, calcularDosis } from '../utils/calculadora_dosis.js';
import { dibujarVasitoCompacto } from '../utils/vasito_medidor.js';

function getLocalToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function renderPlanIfcafe(filterLoteId) {
  try {
    const empresaId = window._currentEmpresaId;
    let lotes = await restFetch(`/rest/v1/lotes?empresa_id=eq.${empresaId}&select=*&order=nombre.asc`);
    if (!Array.isArray(lotes)) lotes = [];

    const lotesConPlan = lotes.filter(l => l.edad_categoria);

    let aplicaciones = [];
    try {
      aplicaciones = await restFetch(`/rest/v1/lote_aplicaciones?empresa_id=eq.${empresaId}&select=*`);
      if (!Array.isArray(aplicaciones)) aplicaciones = [];
    } catch (e) { console.warn('No se pudieron cargar aplicaciones:', e); }

    const cards = lotesConPlan.map(lote => {
      const altura = parseInt(lote.altura_msnm) || 0;
      const numPlantas = parseInt(lote.num_plantas) || 0;
      const dosisCalc = calcularDosis(lote.edad_categoria, numPlantas);
      const plan = getPlanIfcafe(altura);
      const zonaLabel = getZonaLabel(altura);

      const planRows = plan.map(item => {
        const matchFecha = new Date(2026, item.mes - 1, 15).toISOString().split('T')[0];
        const realizada = (aplicaciones || []).find(a => {
          if (a.lote_id !== lote.id) return false;
          const aFecha = a.fecha ? a.fecha.substring(0, 7) : '';
          const pFecha = matchFecha.substring(0, 7);
          return a.producto && a.producto.includes(item.producto.substring(0, 8)) && aFecha === pFecha && a.estado === 'Aplicada';
        });
        const estadoIcon = realizada ? '✅' : (matchFecha < getLocalToday() ? '❌' : '⏳');
        const estadoLabel = realizada ? 'Realizada' : (matchFecha < getLocalToday() ? 'Atrasada' : 'Pendiente');
        const estadoClass = realizada ? 'positive' : (matchFecha < getLocalToday() ? 'negative' : 'pending');
        return `
          <div class="m3-flex m3-items-center m3-justify-between m3-p-3 m3-bg-surface-container m3-rounded-xl" style="border-left: 4px solid ${realizada ? '#2d3e2c' : (matchFecha < getLocalToday() ? '#ff4103' : '#f57c00')};">
            <div class="m3-flex m3-items-center m3-gap-3">
              <span style="font-size: 20px;">${estadoIcon}</span>
              <div>
                <p class="m3-label-medium m3-font-bold m3-text-on-surface">${item.mesLabel} — ${item.tipo}</p>
                <p class="m3-label-small m3-text-on-surface-variant">${item.producto}</p>
                <p class="m3-label-small m3-text-on-surface-variant" style="font-style: italic;">${item.recomendacion}</p>
              </div>
            </div>
            <span class="m3-label-small m3-font-bold m3-px-3 m3-py-1 m3-rounded-full da-variation-pill ${estadoClass}">${estadoLabel}</span>
          </div>
        `;
      }).join('');

      return `
        <div class="m3-card m3-p-6" style="border-radius: 12px; border: 2px solid #2d3e2c;">
          <div class="m3-flex m3-items-center m3-justify-between m3-mb-4">
            <div class="m3-flex m3-items-center m3-gap-3">
              <span class="material-symbols-outlined m3-text-primary" style="font-size: 28px;">eco</span>
              <h2 class="m3-headline-small m3-font-bold m3-text-on-surface" style="margin:0;">${lote.nombre}</h2>
            </div>
            <a href="#" onclick="event.preventDefault(); window.navigateTo('detalle_lote', '${lote.id}')" style="font-size: 12px; color: #2d3e2c; text-decoration: underline;">
              Ver lote
            </a>
          </div>

          <div class="m3-flex m3-gap-4 m3-flex-wrap m3-mb-4">
            <div class="m3-flex m3-items-center m3-gap-2">
              <span class="m3-label-small m3-font-bold">Edad:</span>
              <span class="m3-label-small">${dosisCalc.label}</span>
            </div>
            <div class="m3-flex m3-items-center m3-gap-2">
              <span class="m3-label-small m3-font-bold">🥤 Dosis:</span>
              <span class="m3-label-small">${dosisCalc.porAplicacion.vasitoLabel}</span>
              ${dibujarVasitoCompacto(dosisCalc.porAplicacion.fraccion)}
            </div>
            <div class="m3-flex m3-items-center m3-gap-2">
              <span class="m3-label-small m3-font-bold">📍 Zona:</span>
              <span class="m3-label-small">${zonaLabel}</span>
            </div>
          </div>

          ${numPlantas > 0 ? `
          <div style="margin-bottom: 12px; padding: 8px 12px; background: #f5f5f5; border-radius: 8px;">
            <span class="m3-label-small m3-text-on-surface-variant">
              📦 <strong>${dosisCalc.sacosNecesarios}</strong> saco(s) x apl. (${dosisCalc.totalKgPorAplicacion} kg / <strong>${numPlantas.toLocaleString()}</strong> plantas)
            </span>
          </div>` : ''}

          <div class="m3-flex m3-flex-col m3-gap-3">
            ${planRows}
          </div>
        </div>
      `;
    });

    return `
      <div class="app-screen m3-pt-6 m3-pb-24 m3-p-4 m3-font-work-sans">
        <div class="m3-flex m3-items-center m3-justify-between m3-mb-6">
          <div>
            <h1 class="m3-display-medium m3-font-extrabold m3-text-on-surface m3-tracking-tight m3-font-manrope" style="margin:0;">📋 Plan IFCAFE 2026</h1>
            <p class="m3-label-medium m3-text-on-surface-variant m3-mt-1">Plan de fertilización para café según IHCAFE</p>
          </div>
          <button onclick="window.navigateTo('dashboard')" class="m3-bg-none m3-border-none m3-cursor-pointer m3-flex m3-items-center m3-gap-1 m3-label-medium m3-font-bold m3-text-primary" style="padding: 8px 16px; border-radius: 8px; background: #f0f7e6;">
            <span class="material-symbols-outlined" style="font-size: 18px;">arrow_back</span>
            Volver
          </button>
        </div>

        ${lotesConPlan.length === 0 ? `
        <div class="m3-card m3-p-8 m3-flex m3-flex-col m3-items-center m3-gap-4" style="border-radius: 12px;">
          <span class="material-symbols-outlined" style="font-size: 48px; color: #aaa;">eco</span>
          <p class="m3-label-large m3-text-on-surface-variant">No hay lotes con plan IFCAFE</p>
          <p class="m3-label-small m3-text-on-surface-variant">Crea un lote con edad y altura para generar su plan de fertilización</p>
        </div>
        ` : `
        <div class="m3-flex m3-flex-col m3-gap-6">
          ${cards.join('\n')}
        </div>
        `}
      </div>
    `;
  } catch (err) {
    console.error('Error en plan_ifcafe:', err);
    return `<div class="m3-p-4 m3-text-center"><p class="m3-label-medium m3-text-error">Error: ${err.message}</p></div>`;
  }
}

export function initPlanIfcafe() {
  // No initialization needed
}