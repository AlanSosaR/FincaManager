import { supabase } from '../supabase.js';
import { showModal } from '../modals.js';
import { getDosisPorEdad, getPlanIfcafe, getZonaLabel, calcularDosis, obtenerOrdenDia } from '../utils/calculadora_dosis.js';
import { dibujarVasito } from '../utils/vasito_medidor.js';

function getInitiales(nombre) {
  return nombre.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function getLocalToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getAvatarColor(seed) {
  const colors = ['var(--m3-primary)', 'var(--m3-tertiary)', '#7b4f9e', '#c75b39', '#2d3e2c', '#2c666e', '#6a1b9a'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export async function renderDetalleLote(id) {
  try {
    const [
      { data: lote, error: loteErr },
      { data: aplicaciones, error: appErr },
      { data: asignaciones, error: asigErr },
      { data: todoPersonal, error: personalErr }
    ] = await Promise.all([
      supabase.from('lotes').select('*').eq('id', id).single(),
      supabase.from('lote_aplicaciones').select('*').eq('lote_id', id).order('fecha', { ascending: false }),
      supabase.from('lote_personal').select('id, personal:personal_id(*)').eq('lote_id', id),
      supabase.from('personal').select('*').order('nombre', { ascending: true })
    ]);

    if (loteErr) throw loteErr;

    const fertilizantes = (aplicaciones || []).filter(a => a.tipo === 'Fertilizante');
    const otrosApps = (aplicaciones || []).filter(a => a.tipo !== 'Fertilizante');
    const asignados = (asignaciones || []).map(a => a.personal);
    const asignadosIds = new Set(asignados.map(p => p.id));
    const disponibles = (todoPersonal || []).filter(p => !asignadosIds.has(p.id));

    return `
      <style>
        @media (max-width: 768px) {
          .dl-map-grid-cell { grid-column: 1 !important; grid-row: auto !important; }
          .dl-main-col { grid-column: 1 !important; grid-row: auto !important; }
        }
      </style>
      <div class="m3-pt-6 m3-pb-24 m3-p-4 m3-max-w-4xl m3-mx-auto m3-font-work-sans">
        <!-- Header -->
        <section class="m3-mb-6">
          <div class="m3-flex" style="gap: 24px; flex-wrap: wrap;">
            <div class="m3-flex m3-flex-col m3-gap-4" style="flex: 1; min-width: 280px;">
              <div class="m3-flex m3-mobile-flex-col m3-items-start m3-justify-between m3-gap-4">
                <div class="m3-flex m3-items-center m3-gap-4 m3-flex-wrap">
                  <h1 class="m3-display-small m3-font-extrabold m3-text-on-surface m3-tracking-tight m3-font-manrope">${lote.nombre}</h1>
                </div>
              </div>
              <div class="m3-flex m3-gap-6 m3-text-on-surface-variant m3-label-medium m3-font-bold m3-flex-wrap">
                <span class="m3-flex m3-items-center m3-gap-2 m3-bg-tertiary-container m3-text-on-tertiary-container m3-px-3 m3-py-1 m3-rounded-full"><img src="grano-de-cafe.png" alt="" style="width: 16px; height: 16px; object-fit: contain;"> Variedad ${lote.variedad || 'N/A'}</span>
                <span class="m3-flex m3-items-center m3-gap-2"><img src="sprouts.png" alt="" style="width: 18px; height: 18px; object-fit: contain;"> ${(lote.num_plantas || 0).toLocaleString()} plantas</span>
              </div>
            </div>
          </div>
        </section>

        <div class="m3-grid m3-grid-4 m3-gap-8" style="grid-template-columns: 3fr 2fr;">
          <!-- Map + Personal -->
          <div class="dl-map-grid-cell" style="grid-column: 2; grid-row: 1; ${lote.coordenadas_json ? '' : 'display: none;'}" id="dl-map-grid-wrapper">
            <div class="m3-flex m3-items-center m3-gap-2 m3-text-on-surface-variant m3-label-medium m3-font-bold m3-mb-3" style="padding-left: 4px;">
              <img src="area.png" alt="" style="width: 18px; height: 18px; object-fit: contain;"> ${lote.area_ha || 0} Hectáreas
            </div>
            <div id="dl-map-container" data-coords='${lote.coordenadas_json || ''}' class="m3-card m3-p-8" style="border-radius: 12px; height: 180px; overflow: hidden;"></div>
            <!-- Personal Asignado -->
            <div class="m3-card m3-p-6" style="border-radius: 12px; margin-top: 24px; overflow: hidden;">
              <h3 class="m3-title-large m3-font-bold m3-mb-6 m3-flex m3-items-center m3-gap-2" style="white-space: nowrap;">
                <span class="material-symbols-outlined m3-text-primary">groups</span>
                Personal Asignado
                <span class="m3-label-medium m3-text-on-surface-variant" style="font-weight: 400; margin-left: 2px;">(${asignados.length})</span>
              </h3>

              <div class="m3-flex m3-flex-col" style="gap: 14px;" id="personal-list">
                ${asignados.length > 0 ? asignados.map(p => `
                <div class="m3-flex m3-items-center m3-justify-between" style="cursor: pointer; padding: 14px 18px; background: var(--m3-surface-container-low); border-radius: 12px; transition: background 0.2s;" onclick="window.navigateTo('detalle_personal', '${p.id}', 'detalle_lote', '${id}')" onmouseover="this.style.background='var(--m3-surface-container-highest)'" onmouseout="this.style.background='var(--m3-surface-container-low)'">
                  <div class="m3-flex m3-items-center" style="gap: 14px;">
                    <div class="m3-rounded-full m3-flex m3-items-center m3-justify-center m3-font-bold" style="font-size: 14px; width: 42px; height: 42px; background: ${getAvatarColor(p.nombre)}; color: white; flex-shrink: 0;">${p.iniciales || getInitiales(p.nombre)}</div>
                    <div>
                      <p class="m3-label-medium m3-font-bold m3-text-on-surface">${p.nombre}</p>
                      <p class="m3-label-small m3-text-on-surface-variant" style="margin-top: 2px;">${p.rol || ''}</p>
                    </div>
                  </div>
                  <div class="m3-flex m3-items-center" style="gap: 6px;">
                    <span class="material-symbols-outlined m3-text-outline-variant" style="font-size: 20px; cursor: pointer; padding: 6px; border-radius: 50%;" onclick="event.stopPropagation(); window.removePersonalFromLote('${id}', '${p.id}')" onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='transparent'">remove_circle_outline</span>
                    <span class="material-symbols-outlined m3-text-outline-variant" style="font-size: 20px;">chevron_right</span>
                  </div>
                </div>
                `).join('') : `
                <div class="m3-p-8 m3-text-center m3-text-on-surface-variant m3-label-medium" style="background: var(--m3-surface-container-low); border-radius: 12px;">
                  <span class="material-symbols-outlined" style="font-size: 32px; display: block; margin-bottom: 8px; opacity: 0.35;">group_off</span>
                  Sin personal asignado
                </div>
                `}
              </div>

              <!-- Assign personnel -->
              <div style="margin-top: 32px;">
                <div class="m3-field" style="margin-bottom: 12px;">
                  <select id="select-asignar-personal" style="width: 100%; box-sizing: border-box; padding: 14px 20px; border-radius: 12px; border: 1.5px solid var(--m3-outline); background: var(--m3-surface-container-low); font-family: 'Work Sans', sans-serif; font-size: 14px; font-weight: 600; color: var(--m3-on-surface); cursor: pointer; outline: none; appearance: none;">
                    <option value="" disabled selected>Seleccionar persona</option>
                    ${disponibles.map(p => `
                      <option value="${p.id}">${p.nombre}${p.rol ? ' — ' + p.rol : ''}</option>
                    `).join('')}
                  </select>
                </div>
                <button onclick="window.assignPersonalToLote('${id}')" class="m3-flex m3-items-center m3-gap-2" style="width: 100%; justify-content: center; box-sizing: border-box; padding: 14px 32px; border-radius: 12px; border: none; background: #2d3e2c; color: white; font-weight: 700; font-size: 14px; cursor: pointer; font-family: 'Work Sans', sans-serif; box-shadow: 0 4px 12px rgba(45,62,44,0.4);">
                  <span class="material-symbols-outlined" style="font-size: 20px;">add</span>
                  Agregar
                </button>
              </div>
            </div>
          </div>
          <!-- Main Column -->
          <div class="m3-flex m3-flex-col m3-gap-8 dl-main-col" style="margin-top: 8px; grid-column: 1;">

            <!-- Plan IFCAFE 2026 -->
            ${(() => {
              const edadCat = lote.edad_categoria;
              const altura = parseInt(lote.altura_msnm) || 0;
              const numPlantas = parseInt(lote.num_plantas) || 0;
              if (!edadCat) return '';
              const dosisCalc = calcularDosis(edadCat, numPlantas);
              const plan = getPlanIfcafe(altura);
              const zonaLabel = getZonaLabel(altura);
              const aplicacionesProgramadas = (aplicaciones || []).filter(a => a.estado === 'Programada');

              const planRows = plan.map(item => {
                const matchFecha = new Date(2026, item.mes - 1, 15).toISOString().split('T')[0];
                const realizada = aplicacionesProgramadas.find(a => {
                  const aFecha = a.fecha ? a.fecha.substring(0, 7) : '';
                  const pFecha = matchFecha.substring(0, 7);
                  return a.producto && a.producto.includes(item.producto.substring(0, 8)) && aFecha === pFecha;
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
                  <h2 class="m3-headline-small m3-font-bold m3-text-on-surface" style="margin:0;">Plan IFCAFE 2026</h2>
                </div>
              </div>

              <div class="m3-flex m3-gap-6 m3-flex-wrap m3-mb-4">
                <div class="m3-flex m3-items-center m3-gap-2">
                  <span class="m3-label-medium m3-font-bold">Edad:</span>
                  <span class="m3-label-medium">${dosisCalc.label}</span>
                </div>
                <div class="m3-flex m3-items-center m3-gap-2">
                  <span class="m3-label-medium m3-font-bold">🥤 Dosis:</span>
                  <span class="m3-label-medium">${dosisCalc.porAplicacion.vasitoLabel}</span>
                </div>
                <div class="m3-flex m3-items-center m3-gap-2">
                  <span class="m3-label-medium m3-font-bold">📍 Zona:</span>
                  <span class="m3-label-medium">${zonaLabel}</span>
                </div>
              </div>

              <div class="m3-flex m3-items-center m3-gap-6 m3-flex-wrap m3-mb-4" style="justify-content: center;">
                ${dibujarVasito(dosisCalc.porAplicacion.fraccion, dosisCalc.porAplicacion.vasitoLabel, dosisCalc.porAplicacion.onzas, dosisCalc.porAplicacion.gramos)}
                <div style="font-size: 13px; color: #555; max-width: 300px; line-height: 1.5; padding: 12px; background: #f0f7e6; border-radius: 12px;">
                  <strong>🧑‍🌾 Orden del día:</strong><br>
                  "${obtenerOrdenDia(lote.nombre, plan[0]?.producto || 'fertilizante', dosisCalc, [])}"
                </div>
              </div>

              <div class="m3-flex m3-flex-col m3-gap-3" style="margin-top: 12px;">
                ${planRows}
              </div>

              ${numPlantas > 0 ? `
              <div style="margin-top: 12px; padding: 12px; background: #f5f5f5; border-radius: 12px;">
                <p class="m3-label-small m3-text-on-surface-variant">
                  📦 <strong>${dosisCalc.sacosNecesarios}</strong> saco(s) por aplicación para <strong>${numPlantas.toLocaleString()}</strong> plantas
                  (${dosisCalc.totalKgPorAplicacion} kg / ${dosisCalc.totalOnzasPorAplicacion} oz por aplicación)
                </p>
              </div>` : ''}
            </div>
            <div style="height: 24px;"></div>
            `;
            })()}

            <!-- Fertilización Section -->
            <div class="m3-card m3-p-8" style="border-radius: 12px;">
              <div class="m3-flex m3-items-center m3-justify-between m3-mb-6">
                <div class="m3-flex m3-items-center m3-gap-4">
                  <img src="fertilizante.png" alt="" style="width: 24px; height: 24px; object-fit: contain;">
                  <h2 class="m3-headline-small m3-font-bold m3-text-on-surface">Fertilización</h2>
                </div>
                <button onclick="window.showAddAplicacionModal('${lote.id}')" class="m3-text-primary m3-label-medium m3-font-bold m3-flex m3-items-center m3-gap-1 m3-bg-none m3-border-none m3-cursor-pointer" style="text-decoration: underline;">
                  Histórico completo <span class="material-symbols-outlined" style="font-size: 14px;">open_in_new</span>
                </button>
              </div>
              <div class="m3-flex m3-flex-col m3-gap-4">
                ${fertilizantes.length > 0 ? fertilizantes.map(app => `
                  <div class="m3-flex m3-items-center m3-justify-between m3-p-4 m3-bg-surface-container m3-rounded-2xl">
                    <div class="m3-flex m3-items-center m3-gap-4">
                      <div class="m3-size-12 m3-rounded-xl m3-bg-secondary-container m3-flex m3-items-center m3-justify-center m3-text-on-secondary-container">
                        <img src="npk.png" alt="" style="width: 24px; height: 24px; object-fit: contain;">
                      </div>
                      <div>
                        <p class="m3-label-large m3-font-bold m3-text-on-surface">${app.producto}</p>
                        <p class="m3-label-small m3-text-on-surface-variant">Dosis: ${app.dosis}</p>
                      </div>
                    </div>
                    <div class="m3-text-right">
                      <span class="m3-text-primary m3-label-small m3-font-bold m3-px-2 m3-py-1 m3-rounded-full m3-uppercase" style="background: rgba(69,87,67,0.1); font-size: 10px;">Realizado</span>
                      <p class="m3-label-small m3-font-medium m3-mt-1 m3-text-on-surface-variant">${new Date(app.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                `).join('') : `
                  <div class="m3-flex m3-items-center m3-justify-between m3-p-4 m3-rounded-2xl" style="border: 2px dashed var(--m3-outline-variant); opacity: 0.8;">
                    <div class="m3-flex m3-items-center m3-gap-4">
                      <div class="m3-size-12 m3-rounded-xl m3-bg-surface-container-highest m3-flex m3-items-center m3-justify-center m3-text-on-surface-variant">
                        <span class="material-symbols-outlined">schedule</span>
                      </div>
                      <div>
                        <p class="m3-label-large m3-font-bold m3-text-on-surface-variant">Sin fertilizantes registrados</p>
                        <p class="m3-label-small m3-text-on-surface-variant">Agrega la primera aplicación</p>
                      </div>
                    </div>
                  </div>
                `}
              </div>
            </div>

            <!-- Otras Aplicaciones Section -->
            <div class="m3-card m3-p-8" style="border-radius: 12px;">
              <div class="m3-flex m3-items-center m3-justify-between m3-mb-6">
                <div class="m3-flex m3-items-center m3-gap-4">
                  <img src="tijeras-de-podar.png" alt="" style="width: 24px; height: 24px; object-fit: contain;">
                  <h2 class="m3-headline-small m3-font-bold m3-text-on-surface">Podas y Limpieza</h2>
                </div>
              </div>
              <div class="dl-timeline">
                ${otrosApps.length > 0 ? otrosApps.map((app, i) => `
                  <div class="dl-timeline-item">
                    <div class="dl-timeline-dot ${i === 0 ? 'dl-timeline-dot-primary' : 'dl-timeline-dot-tertiary'}"></div>
                    <div class="dl-timeline-content">
                      <h4 class="m3-label-large m3-font-bold m3-text-on-surface">${app.producto}</h4>
                      <p class="m3-body-small m3-text-on-surface-variant m3-mt-1">${app.tipo} — ${app.dosis}</p>
                      <div class="m3-flex m3-items-center m3-gap-4 m3-mt-3">
                        <span class="m3-flex m3-items-center m3-gap-1 m3-label-small m3-font-bold ${i === 0 ? 'm3-text-primary' : 'm3-text-tertiary'}">
                          <span class="material-symbols-outlined" style="font-size: 12px;">${i === 0 ? 'event' : 'event_available'}</span>
                          ${i === 0 ? 'Completado: ' : 'Realizado: '} ${new Date(app.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        </span>
                        ${app.operador ? `
                        <span class="m3-label-small m3-text-on-surface-variant m3-flex m3-items-center m3-gap-1">
                          <span class="material-symbols-outlined" style="font-size: 12px;">person</span>
                          ${app.operador}
                        </span>` : ''}
                      </div>
                    </div>
                  </div>
                `).join('') : `
                  <div class="m3-flex m3-items-center m3-gap-4 m3-p-4 m3-bg-surface-container m3-rounded-2xl">
                    <div class="m3-size-12 m3-rounded-xl m3-bg-surface-container-highest m3-flex m3-items-center m3-justify-center m3-text-on-surface-variant">
                      <span class="material-symbols-outlined">eco</span>
                    </div>
                    <div>
                      <p class="m3-label-large m3-font-bold m3-text-on-surface-variant">Sin actividades registradas</p>
                      <p class="m3-body-small m3-text-on-surface-variant">No hay aplicaciones de fungicidas, insecticidas u otros tratamientos.</p>
                    </div>
                  </div>
                `}
              </div>
            </div>
          </div>
        </div>

        <div class="m3-fab-speeddial" id="fab-speeddial">
          <div class="m3-fab-actions" id="fab-actions">
            <button class="m3-fab-action" onclick="window.showActivityForm('${lote.id}', 'Limpieza')">
              <span class="m3-fab-action-label">Limpieza</span>
              <span class="m3-fab-action-icon"><img src="sale-de.png" alt="" style="width: 44px; height: 44px; object-fit: contain;"></span>
            </button>
            <button class="m3-fab-action" onclick="window.showActivityForm('${lote.id}', 'Fertilizante')">
              <span class="m3-fab-action-label">Fertilizante</span>
              <span class="m3-fab-action-icon"><img src="fertilizante.png" alt="" style="width: 44px; height: 44px; object-fit: contain;"></span>
            </button>
            <button class="m3-fab-action" onclick="window.showActivityForm('${lote.id}', 'Manejo de Tejido')">
              <span class="m3-fab-action-label">Manejo de Tejido</span>
              <span class="m3-fab-action-icon"><img src="tijeras-de-podar.png" alt="" style="width: 44px; height: 44px; object-fit: contain;"></span>
            </button>
            <button class="m3-fab-action" onclick="window.showActivityForm('${lote.id}', 'Análisis de Suelo')">
              <span class="m3-fab-action-label">Análisis de Suelo</span>
              <span class="m3-fab-action-icon"><img src="analisis-de-suelo.png" alt="" style="width: 44px; height: 44px; object-fit: contain;"></span>
            </button>
          </div>
          <button class="m3-fab-circle" id="fab-main" onclick="window.toggleFabMenu()">
            <span class="material-symbols-outlined" id="fab-icon">add</span>
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error in renderDetalleLote:', err);
    return `<div style="padding: 24px; color: red;">Error cargando detalle: ${err.message}</div>`;
  }
}

export function initDetalleLote(id) {
  window.showModal = showModal;

  window.assignPersonalToLote = async (loteId) => {
    const select = document.getElementById('select-asignar-personal');
    const personalId = select?.value;
    if (!personalId) {
      window.Snackbar?.show('Selecciona una persona', { type: 'warning' });
      return;
    }
    const { error } = await supabase.from('lote_personal').insert([{ lote_id: loteId, personal_id: personalId }]);
    if (error) {
      window.Snackbar?.show('Error: ' + error.message, { type: 'error' });
    } else {
      window.Snackbar?.show('Personal asignado');
      window.clearScreenCache?.('detalle_lote');
      window.navigateTo('detalle_lote', loteId);
    }
  };

  window.removePersonalFromLote = async (loteId, personalId) => {
    window.Snackbar?.confirm('¿Quitar esta persona del lote?', async () => {
      const { error } = await supabase.from('lote_personal')
        .delete()
        .eq('lote_id', loteId)
        .eq('personal_id', personalId);
      if (error) {
        window.Snackbar?.show('Error: ' + error.message, { type: 'error' });
      } else {
        window.Snackbar?.show('Personal removido');
        window.clearScreenCache?.('detalle_lote');
        window.navigateTo('detalle_lote', loteId);
      }
    });
  };

  window.toggleFabMenu = () => {
    const actions = document.getElementById('fab-actions');
    const fabIcon = document.getElementById('fab-icon');
    const overlay = document.getElementById('fab-overlay');
    const isOpen = actions.classList.contains('open');
    if (isOpen) {
      actions.classList.remove('open');
      fabIcon.textContent = 'add_task';
      if (overlay) overlay.remove();
    } else {
      const ov = document.createElement('div');
      ov.id = 'fab-overlay';
      ov.className = 'fab-overlay';
      ov.onclick = window.toggleFabMenu;
      document.body.appendChild(ov);
      actions.classList.add('open');
      fabIcon.textContent = 'close';
    }
  };

  window.showActivityForm = (loteId, tipo) => {
    window.toggleFabMenu();
    window.navigateTo('nueva_actividad', loteId, tipo);
  };

  // Initialize mini map with GPS polygon
  const mapContainer = document.getElementById('dl-map-container');
  if (mapContainer && mapContainer.dataset.coords) {
    try {
      const parsed = JSON.parse(mapContainer.dataset.coords);
      let coords, color;
      if (Array.isArray(parsed)) {
        coords = parsed;
        color = '#2d3e2c';
      } else {
        coords = parsed.coordinates || [];
        color = parsed.color || '#2d3e2c';
      }
      if (coords && coords.length > 2) {
        const latlngs = coords.map(c => [c.lat, c.lng]);
        setTimeout(() => {
          const map = L.map(mapContainer, {
            zoomControl: false,
            attributionControl: false,
            dragging: false,
            scrollWheelZoom: false,
            doubleClickZoom: false,
            touchZoom: false,
            keyboard: false
          });
          const tileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 19,
            maxNativeZoom: 18,
            attribution: 'Tiles &copy; Esri'
          }).addTo(map);
          L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 19,
            opacity: 0.8
          }).addTo(map);
          tileLayer.on('tileerror', (e) => {
            console.warn('[detalle_lote] Tile failed:', e.tile.src);
          });
          const polygon = L.polygon(latlngs, {
            color: color,
            fillColor: color,
            fillOpacity: 0.2,
            weight: 2
          }).addTo(map);
          map.fitBounds(polygon.getBounds().pad(0.15));
          setTimeout(() => map.invalidateSize(), 300);
        }, 200);
      }
    } catch (e) {
      console.warn('Error loading map:', e);
    }
  }
}
