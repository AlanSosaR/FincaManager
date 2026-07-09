import { restFetch } from '../auth.js';
import { getPlanIfcafe, getZonaLabel, calcularDosis } from '../utils/calculadora_dosis.js';
import { dibujarVasitoCompacto } from '../utils/vasito_medidor.js';

function getLocalToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

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

      const iconoPorTipo = {
        'Suelo': 'humidity_high',
        'Foliar': 'spa'
      };

      const gradientPorEstado = (realizada, matchFecha) => {
        if (realizada) return 'linear-gradient(135deg, #e8f5e9, #c8e6c9)';
        if (matchFecha < getLocalToday()) return 'linear-gradient(135deg, #ffebee, #ffcdd2)';
        return 'linear-gradient(135deg, #fff8e1, #ffecb3)';
      };

      const planCards = plan.map(item => {
        const matchFecha = new Date(2026, item.mes - 1, 15).toISOString().split('T')[0];
        const realizada = (aplicaciones || []).find(a => {
          if (a.lote_id !== lote.id) return false;
          const aFecha = a.fecha ? a.fecha.substring(0, 7) : '';
          const pFecha = matchFecha.substring(0, 7);
          return a.producto && a.producto.includes(item.producto.substring(0, 8)) && aFecha === pFecha && a.estado === 'Aplicada';
        });
        const estadoLabel = realizada ? 'Realizada' : (matchFecha < getLocalToday() ? 'Atrasada' : 'Pendiente');
        const borderColor = realizada ? '#2d3e2c' : (matchFecha < getLocalToday() ? '#c62828' : '#f57c00');
        const badgeBg = realizada ? '#2d3e2c' : (matchFecha < getLocalToday() ? '#c62828' : '#f57c00');
        const icono = iconoPorTipo[item.tipo] || 'eco';

        return `
          <div style="background: white; border-radius: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); border: 1.5px solid #e0e0e0; overflow: hidden; transition: transform 0.2s, box-shadow 0.2s;">
            <div style="background: ${gradientPorEstado(realizada, matchFecha)}; padding: 20px 20px 16px; border-bottom: 1px solid rgba(0,0,0,0.04);">
              <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px;">
                <div style="display: flex; align-items: center; gap: 10px;">
                  <span class="material-symbols-outlined" style="font-size: 28px; color: #2d3e2c;">${icono}</span>
                  <div>
                    <span style="font-size: 16px; font-weight: 700; color: #1a1a1a; letter-spacing: -0.3px;">${item.mesLabel}</span>
                    <span style="font-size: 12px; font-weight: 600; color: #5a5a5a; margin-left: 6px; text-transform: uppercase;">${item.tipo}</span>
                  </div>
                </div>
                <span style="font-size: 11px; font-weight: 700; color: white; background: ${badgeBg}; padding: 4px 12px; border-radius: 20px; text-transform: uppercase; letter-spacing: 0.3px;">${estadoLabel}</span>
              </div>
            </div>
            <div style="padding: 16px 20px 20px;">
              <p style="font-size: 15px; font-weight: 600; color: #2d3e2c; margin: 0 0 6px;">${item.producto}</p>
              <p style="font-size: 13px; color: #666; margin: 0; line-height: 1.4; font-style: italic;">${item.recomendacion}</p>
              <div style="margin-top: 10px; display: flex; align-items: center; gap: 6px;">
                <span class="material-symbols-outlined" style="font-size: 14px; color: #888;">calendar_month</span>
                <span style="font-size: 12px; color: #888;">${matchFecha}</span>
              </div>
            </div>
          </div>
        `;
      }).join('');

      return `
        <div style="background: white; border-radius: 20px; box-shadow: 0 4px 24px rgba(0,0,0,0.06); border: 2px solid #e8ede8; overflow: hidden;">
          <div style="background: linear-gradient(135deg, #f0f7e6, #e8f5e9); padding: 24px 24px 20px;">
            <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span class="material-symbols-outlined" style="font-size: 32px; color: #2d3e2c;">eco</span>
                <h2 style="font-size: 22px; font-weight: 800; color: #1a1a1a; margin: 0; letter-spacing: -0.5px;">${lote.nombre}</h2>
              </div>
              <a href="#" onclick="event.preventDefault(); window.navigateTo('detalle_lote', '${lote.id}')" style="font-size: 13px; font-weight: 600; color: #2d3e2c; text-decoration: none; display: flex; align-items: center; gap: 4px; padding: 6px 14px; background: white; border-radius: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.08);">
                Ver lote
                <span class="material-symbols-outlined" style="font-size: 16px;">arrow_forward</span>
              </a>
            </div>
            <div style="display: flex; gap: 16px; flex-wrap: wrap; margin-top: 16px;">
              <div style="display: flex; align-items: center; gap: 6px; background: white; padding: 6px 14px; border-radius: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.04);">
                <span style="font-size: 12px; font-weight: 700; color: #5a5a5a; text-transform: uppercase;">Edad</span>
                <span style="font-size: 13px; font-weight: 600; color: #2d3e2c;">${dosisCalc.label}</span>
              </div>
              <div style="display: flex; align-items: center; gap: 6px; background: white; padding: 6px 14px; border-radius: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.04);">
                <span style="font-size: 12px; font-weight: 700; color: #5a5a5a; text-transform: uppercase;">Dosis</span>
                <span style="font-size: 13px; font-weight: 600; color: #2d3e2c;">${dosisCalc.porAplicacion.vasitoLabel}</span>
                ${dibujarVasitoCompacto(dosisCalc.porAplicacion.fraccion)}
              </div>
              <div style="display: flex; align-items: center; gap: 6px; background: white; padding: 6px 14px; border-radius: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.04);">
                <span style="font-size: 12px; font-weight: 700; color: #5a5a5a; text-transform: uppercase;">Zona</span>
                <span style="font-size: 13px; font-weight: 600; color: #2d3e2c;">${zonaLabel}</span>
              </div>
              ${numPlantas > 0 ? `
              <div style="display: flex; align-items: center; gap: 6px; background: white; padding: 6px 14px; border-radius: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.04);">
                <span style="font-size: 12px; font-weight: 700; color: #5a5a5a; text-transform: uppercase;">Sacos</span>
                <span style="font-size: 13px; font-weight: 600; color: #2d3e2c;">${dosisCalc.sacosNecesarios} x apl.</span>
              </div>` : ''}
            </div>
          </div>
          <div style="padding: 24px;">
            <div class="plan-grid">
              ${planCards}
            </div>
          </div>
        </div>
      `;
    });

    return `
      <div class="app-screen m3-pt-6 m3-pb-24 m3-p-4 m3-font-work-sans" style="max-width: 900px; margin: 0 auto;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; flex-wrap: wrap; gap: 12px;">
          <div>
            <h1 style="font-size: 28px; font-weight: 800; color: #1a1a1a; margin: 0; letter-spacing: -0.5px; display: flex; align-items: center; gap: 8px;">
              <span>📋</span> Plan IFCAFE 2026
            </h1>
            <p style="font-size: 14px; color: #666; margin: 4px 0 0;">Plan de fertilización para café según IHCAFE</p>
          </div>
          <button onclick="window.navigateTo('dashboard')" style="background: #f0f7e6; border: none; padding: 10px 20px; border-radius: 12px; color: #2d3e2c; font-weight: 600; font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 6px; font-family: 'Work Sans', sans-serif;">
            <span class="material-symbols-outlined" style="font-size: 18px;">arrow_back</span>
            Volver
          </button>
        </div>

        ${lotesConPlan.length === 0 ? `
        <div style="background: white; border-radius: 20px; padding: 60px 24px; text-align: center; box-shadow: 0 2px 12px rgba(0,0,0,0.04);">
          <span class="material-symbols-outlined" style="font-size: 56px; color: #ccc;">eco</span>
          <p style="font-size: 18px; font-weight: 600; color: #666; margin: 16px 0 4px;">No hay lotes con plan IFCAFE</p>
          <p style="font-size: 14px; color: #999;">Crea un lote con edad y altura para generar su plan de fertilización</p>
        </div>
        ` : `
        <div style="display: flex; flex-direction: column; gap: 32px;">
          ${cards.join('\n')}
        </div>
        `}
      </div>
      <style>
        .plan-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 16px;
        }
        @media (min-width: 640px) {
          .plan-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
        @media (min-width: 1024px) {
          .plan-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }
      </style>
    `;
  } catch (err) {
    console.error('Error en plan_ifcafe:', err);
    return `<div class="m3-p-4 m3-text-center"><p class="m3-label-medium m3-text-error">Error: ${err.message}</p></div>`;
  }
}

export function initPlanIfcafe() {
}