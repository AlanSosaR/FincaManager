import { supabase } from '../supabase.js';
import { renderPlanIfcafe, initPlanIfcafe } from './plan_ifcafe.js';

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function renderDetalleLote(id) {
  try {
    const [
      { data: lote, error: loteErr },
      { data: aplicaciones = [] },
      planCalendarHtml
    ] = await Promise.all([
      supabase.from('lotes').select('*').eq('id', id).single(),
      supabase.from('lote_aplicaciones').select('*').eq('lote_id', id).order('fecha', { ascending: false }),
      renderPlanIfcafe(id, { embedded: true })
    ]);

    if (loteErr) throw loteErr;

    const hasMap = Boolean(lote.coordenadas_json);
    const appsWithPhotos = (aplicaciones || []).filter(a => a.notas && (a.notas.startsWith('data:image') || a.notas.startsWith('http')));

    // Store in window for instant interactive switching
    window._dlCurrentApps = aplicaciones || [];
    window._dlCurrentLote = lote;

    // Calculate photos count by activity type
    const tiposMap = {};
    (aplicaciones || []).forEach(a => {
      const t = a.tipo || 'Labor de campo';
      if (!tiposMap[t]) {
        tiposMap[t] = { count: 0, photoCount: 0 };
      }
      tiposMap[t].count++;
      if (a.notas && (a.notas.startsWith('data:image') || a.notas.startsWith('http'))) {
        tiposMap[t].photoCount++;
      }
    });

    const getTipoIcon = (tipo) => {
      if (tipo.includes('Foliar')) return '🍃';
      if (tipo.includes('Suelo') || tipo.includes('Fertiliz')) return '🌿';
      if (tipo.includes('Fitosanitario') || tipo.includes('Control')) return '🛡️';
      if (tipo.includes('Tejido') || tipo.includes('Poda')) return '✂️';
      if (tipo.includes('Limpieza')) return '🧹';
      if (tipo.includes('Análisis')) return '🧪';
      return '📌';
    };

    const formatEdadLabel = (edad) => {
      if (!edad) return '';
      if (edad === '1_anio') return '1 año · Café Tiernito';
      if (edad === '2_anios') return '2 años · Creciendo';
      if (edad === '3_mas') return '3+ años · En Producción';
      if (edad === 'carga_alta') return 'Carga Muy Alta';
      return edad;
    };

    let tieneMaderables = Boolean(lote.tiene_maderables || (lote.maderables_variedades && lote.maderables_variedades.trim()));
    let maderablesVariedades = lote.maderables_variedades || '';
    let tieneMusaceas = Boolean(lote.tiene_musaceas || (lote.musaceas_tipo && lote.musaceas_tipo.trim()));
    let musaceasTipo = lote.musaceas_tipo || '';

    if (lote.coordenadas_json) {
      try {
        const parsedCoords = JSON.parse(lote.coordenadas_json);
        if (parsedCoords && typeof parsedCoords === 'object' && !Array.isArray(parsedCoords)) {
          if (parsedCoords.maderables_variedades && !maderablesVariedades) {
            maderablesVariedades = parsedCoords.maderables_variedades;
            tieneMaderables = true;
          }
          if (parsedCoords.musaceas_tipo && !musaceasTipo) {
            musaceasTipo = parsedCoords.musaceas_tipo;
            tieneMusaceas = true;
          }
        }
      } catch {}
    }

    const parseAgroItems = (str) => {
      if (!str) return [];
      return str.split(',').map(item => {
        const trimmed = item.trim();
        if (!trimmed) return null;
        const match = trimmed.match(/^(.+?)(?:\s*\((\d+)\))?$/);
        if (match) {
          return { name: match[1].trim(), qty: match[2] ? parseInt(match[2], 10) : null };
        }
        return { name: trimmed, qty: null };
      }).filter(Boolean);
    };

    const maderablesList = parseAgroItems(maderablesVariedades);
    const musaceasList = parseAgroItems(musaceasTipo);

    let totalMaderablesCount = 0;
    if (maderablesVariedades) {
      const mMatches = maderablesVariedades.match(/\((\d+)\)/g);
      if (mMatches) {
        mMatches.forEach(m => {
          const n = parseInt(m.replace(/[()]/g, ''), 10);
          if (!isNaN(n)) totalMaderablesCount += n;
        });
      }
    }

    let totalMusaceasCount = 0;
    if (musaceasTipo) {
      const musMatches = musaceasTipo.match(/\((\d+)\)/g);
      if (musMatches) {
        musMatches.forEach(m => {
          const n = parseInt(m.replace(/[()]/g, ''), 10);
          if (!isNaN(n)) totalMusaceasCount += n;
        });
      }
    }

    return `
      <style>
        .dl-screen-pad { padding: 0 0 100px 0 !important; width: 100%; margin: 0; }
        .dl-variedad-name {
          font-size: 14px;
          font-weight: 700;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .dl-chips-carousel {
          display: flex;
          gap: 8px;
          overflow-x: auto;
          padding: 2px 2px 4px 2px;
          scrollbar-width: thin;
          scrollbar-color: rgba(255,255,255,0.3) transparent;
          -webkit-overflow-scrolling: touch;
          align-items: stretch;
          flex: 1;
          min-width: 0;
        }
        .dl-chips-carousel::-webkit-scrollbar {
          height: 4px;
        }
        .dl-chips-carousel::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.35);
          border-radius: 4px;
        }
        .dl-chips-carousel .ganado-tag-stat {
          flex-shrink: 0;
          white-space: nowrap;
        }
        .dl-fused-card {
          display: grid;
          grid-template-columns: ${hasMap ? '1.25fr 1fr' : '1fr'};
          border-radius: 20px;
          overflow: hidden;
          background: var(--m3-primary, #2d3e2c);
          box-shadow: 0 4px 20px rgba(45,62,44,0.22);
          min-height: 185px;
        }
        .dl-fused-card .ganado-card-value {
          color: #ffffff !important;
          font-weight: 800 !important;
        }
        .dl-fused-card .ganado-tally-unit {
          color: rgba(255, 255, 255, 0.88) !important;
          font-weight: 600 !important;
        }
        .dl-fused-card .ganado-tally-label {
          color: #ffffff !important;
          opacity: 1 !important;
        }
        .dl-fused-map-col {
          position: relative;
          width: 100%;
          height: 100%;
          min-height: 180px;
          border-left: 1.5px solid rgba(255,255,255,0.15);
          overflow: hidden;
        }
        .dl-filter-chip {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          padding: 6px 14px;
          border-radius: 9999px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          border: 1.5px solid #c0d4be;
          background: #ffffff;
          color: #2d3e2c;
          transition: all 0.15s ease;
          user-select: none;
        }
        .dl-filter-chip:hover {
          background: #eef5eb;
          border-color: #2d3e2c;
        }
        .dl-filter-chip.active {
          background: #2d3e2c !important;
          color: #ffffff !important;
          border-color: #2d3e2c !important;
          box-shadow: 0 2px 8px rgba(45,62,44,0.25);
        }
        .dl-evolution-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 16px;
        }
        .dl-evo-card {
          background: #ffffff;
          border: 1.5px solid #dce6db;
          border-radius: 18px;
          overflow: hidden;
          box-shadow: 0 4px 16px rgba(0,0,0,0.05);
          display: flex;
          flex-direction: column;
          transition: transform 0.2s ease, box-shadow 0.2s ease;
        }
        .dl-evo-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 8px 24px rgba(45,62,44,0.12);
        }
        @media (max-width: 1100px) {
          .dl-evolution-grid {
            grid-template-columns: repeat(2, 1fr) !important;
          }
        }
        @media (max-width: 680px) {
          .dl-evolution-grid {
            grid-template-columns: 1fr !important;
          }
        }
        @media (max-width: 720px) {
          .dl-fused-card {
            grid-template-columns: 1fr !important;
          }
          .dl-fused-map-col {
            height: 220px !important;
            min-height: 220px !important;
            border-left: none !important;
            border-top: 1.5px solid rgba(255,255,255,0.15) !important;
            border-radius: 0 0 20px 20px !important;
          }
          #dl-map-container {
            height: 220px !important;
            min-height: 220px !important;
          }
        }
        #dl-map-container,
        #dl-map-container .leaflet-container {
          touch-action: pan-y !important;
        }
      </style>
      <div class="m3-pt-6 m3-pb-24 m3-p-4 m3-font-work-sans dl-screen-pad">
        <!-- Header -->
        <section class="m3-mb-6">
          <div class="m3-flex m3-items-center m3-justify-between m3-gap-4 m3-flex-wrap">
            <div>
              <div style="display: flex; align-items: center; gap: 12px; flex-wrap: wrap;">
                <h1 class="m3-display-small m3-font-extrabold m3-text-on-surface m3-tracking-tight m3-font-manrope" style="margin: 0; line-height: 1.1;">
                  ${lote.nombre}
                </h1>
                ${lote.edad_categoria ? `
                  <span style="font-size: 12px; font-weight: 700; background: #eaf2e8; color: #2d3e2c; border: 1px solid #c8d4c6; padding: 4px 12px; border-radius: 20px; display: inline-flex; align-items: center; gap: 5px;">
                    🌱 ${formatEdadLabel(lote.edad_categoria)}
                  </span>
                ` : ''}
              </div>
            </div>
            <div class="m3-flex m3-items-center m3-gap-2" style="flex-wrap: wrap;">
              <button onclick="window.navigateTo('nuevo_lote', '${lote.id}')" class="plan-btn-ghost" style="padding: 8px 14px; font-size: 12.5px;" title="Editar Lote">
                <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
                <span>Editar</span>
              </button>
              <button onclick="window.confirmDeleteLoteFromDetalle('${lote.id}', '${lote.nombre}')" class="plan-btn-danger" style="padding: 8px 12px; font-size: 12.5px;" title="Eliminar Lote">
                <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
                <span>Eliminar</span>
              </button>
            </div>
          </div>
        </section>

        <!-- Summary Banner + Map Fused Card -->
        <div class="m3-mb-6">
          <div class="dl-fused-card">
            <!-- Left Stats Column -->
            <div style="padding: 22px 24px; display: flex; flex-direction: column; justify-content: space-between; gap: 16px; min-width: 0; overflow: hidden;">
              <div class="ganado-tally-top" style="display: flex; align-items: baseline; justify-content: flex-start; gap: 18px; margin: 0; flex-wrap: wrap;">
                <span class="ganado-tally-label" style="color: rgba(255,255,255,0.92); font-size: 13.5px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.6px; margin: 0;">
                  Variedad&nbsp;<span class="dl-variedad-name" style="color: #ffffff; font-size: 16px; font-weight: 800; text-transform: none;">${lote.variedad || 'Café'}</span>
                </span>
                <span class="ganado-tally-count" style="display: inline-flex; align-items: baseline; gap: 8px; margin: 0;">
                  <span class="ganado-card-value" style="font-size: 34px; font-weight: 800; color: #ffffff; line-height: 1;">${(lote.num_plantas || 0).toLocaleString()}</span>
                  <span class="ganado-tally-unit" style="font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.85);">plantas de café</span>
                </span>
              </div>

              <!-- Carrusel Horizontal de Ancho Completo para Árboles y Cultivos -->
              <div style="width: 100%; min-width: 0; overflow: hidden;">
                <div class="dl-chips-carousel">
                  <!-- Píldoras individuales por cada variedad de Árbol Maderable / Sombra -->
                  ${maderablesList.length > 0 ? maderablesList.map(m => `
                    <div onclick="window.navigateTo('nuevo_lote', '${lote.id}')" class="ganado-tag-stat" style="background: rgba(255,255,255,0.96); border-radius: 12px; padding: 6px 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.06); display: flex; align-items: center; gap: 8px; cursor: pointer; flex-shrink: 0;" title="Toca para editar ${m.name}">
                      <span class="ganado-tag-swatch w" style="flex-shrink: 0; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; background: #eef4ec; border-radius: 8px;">
                        <span style="font-size: 18px;">🌲</span>
                      </span>
                      <div style="overflow: hidden; display: flex; flex-direction: column;">
                        <span class="ganado-tag-n" style="font-size: 13px; font-weight: 800; color: #1a1a1a; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">
                          ${m.qty !== null ? `${m.qty.toLocaleString()} ${m.name}` : m.name}
                        </span>
                        <span class="ganado-tag-l" style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: #5a7056; letter-spacing: 0.3px;">
                          ${m.qty !== null ? 'Árboles de Sombra' : 'Árbol Maderable'}
                        </span>
                      </div>
                    </div>
                  `).join('') : `
                    <div onclick="window.navigateTo('nuevo_lote', '${lote.id}')" class="ganado-tag-stat" style="background: rgba(255,255,255,0.96); border-radius: 12px; padding: 6px 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.06); display: flex; align-items: center; gap: 8px; cursor: pointer; flex-shrink: 0;" title="Toca para registrar árboles de sombra">
                      <span class="ganado-tag-swatch w" style="flex-shrink: 0; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; background: #eef4ec; border-radius: 8px;">
                        <span style="font-size: 18px;">🌲</span>
                      </span>
                      <div style="overflow: hidden; display: flex; flex-direction: column;">
                        <span class="ganado-tag-n" style="font-size: 12.5px; font-weight: 700; color: #6b7280; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">
                          Sin árboles registrados
                        </span>
                        <span class="ganado-tag-l" style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: #5a7056;">
                          Árboles Maderables / Sombra
                        </span>
                      </div>
                    </div>
                  `}

                  <!-- Píldoras individuales por cada tipo de Musácea / Plátano -->
                  ${musaceasList.map(m => `
                    <div onclick="window.navigateTo('nuevo_lote', '${lote.id}')" class="ganado-tag-stat" style="background: rgba(255,255,255,0.96); border-radius: 12px; padding: 6px 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.06); display: flex; align-items: center; gap: 8px; cursor: pointer; flex-shrink: 0;" title="Toca para editar ${m.name}">
                      <span class="ganado-tag-swatch w" style="flex-shrink: 0; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; background: #fff8e1; border-radius: 8px;">
                        <span style="font-size: 18px;">🍌</span>
                      </span>
                      <div style="overflow: hidden; display: flex; flex-direction: column;">
                        <span class="ganado-tag-n" style="font-size: 13px; font-weight: 800; color: #1a1a1a; text-overflow: ellipsis; white-space: nowrap; overflow: hidden;">
                          ${m.qty !== null ? `${m.qty.toLocaleString()} ${m.name}` : m.name}
                        </span>
                        <span class="ganado-tag-l" style="font-size: 9.5px; font-weight: 700; text-transform: uppercase; color: #7a6000; letter-spacing: 0.3px;">
                          ${m.qty !== null ? 'Matas de Musácea' : 'Cultivo Asociado'}
                        </span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>
            </div>

            <!-- Right Fused Map Column -->
            ${hasMap ? `
              <div class="dl-fused-map-col">
                <div id="dl-map-container" data-coords='${lote.coordenadas_json || ''}' style="width: 100%; height: 100%; min-height: 180px; border-radius: 0;"></div>
                <div style="position: absolute; bottom: 8px; right: 10px; background: rgba(0,0,0,0.65); backdrop-filter: blur(4px); color: #fff; padding: 3px 8px; border-radius: 6px; font-size: 10.5px; font-weight: 700; z-index: 400; pointer-events: none; display: flex; align-items: center; gap: 4px;">
                  <span class="material-symbols-outlined" style="font-size: 13px;">location_on</span> ${lote.area_ha || 0} Ha
                </div>
              </div>
            ` : ''}
          </div>
        </div>

        <!-- Manejo del Cafetal / Galería de Evolución -->
        <div id="lote-calendario-section" class="m3-card m3-p-6" style="border-radius: 16px; background: #ffffff; box-shadow: 0 2px 12px rgba(0,0,0,0.04);">
          
          <!-- Vista 1: Calendario Interactivo -->
          <div id="dl-calendar-wrap">
            <div class="m3-flex m3-items-center m3-justify-between m3-mb-4" style="border-bottom: 1.5px solid #eef2ee; padding-bottom: 12px; flex-wrap: wrap; gap: 12px;">
              <div class="m3-flex m3-items-center m3-gap-3">
                <span style="font-size: 24px;">🌿</span>
                <div>
                  <h2 class="m3-title-large m3-font-bold m3-text-on-surface" style="margin: 0; font-size: 18px;">Manejo del Cafetal</h2>
                  <p style="margin: 2px 0 0; font-size: 12px; color: var(--m3-on-surface-variant);">Calendario de labores, abonadas, foliares y podas de este lote</p>
                </div>
              </div>

              <div class="m3-flex m3-items-center m3-gap-2">
                <!-- Split Button for Timeline & Photos -->
                <div class="m3-split-button-container" style="position: relative; display: inline-flex; align-items: stretch; border-radius: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.08);">
                  <button type="button" onclick="window.onSelectActividadEvolucion('gallery:all')" class="m3-split-btn-main" style="background: #2d3e2c; color: #ffffff; border: none; padding: 7px 14px; font-size: 12.5px; font-weight: 700; border-top-left-radius: 20px; border-bottom-left-radius: 20px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background 0.15s ease;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">photo_library</span>
                    <span>Línea de Tiempo & Fotos</span>
                  </button>
                  <div style="width: 1px; background: rgba(255,255,255,0.25);"></div>
                  <button type="button" onclick="window.toggleDlTimelineDropdown(event)" class="m3-split-btn-toggle" style="background: #2d3e2c; color: #ffffff; border: none; padding: 7px 10px; border-top-right-radius: 20px; border-bottom-right-radius: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s ease;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">arrow_drop_down</span>
                  </button>

                  <!-- Dropdown Menu -->
                  <div id="dl-timeline-menu" style="display: none; position: absolute; top: calc(100% + 6px); right: 0; min-width: 250px; background: #ffffff; border: 1px solid #e0e6de; border-radius: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.14); z-index: 1000; overflow: hidden; padding: 6px 0;">
                    <div style="padding: 6px 14px 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px;">
                      Vistas y Evolución
                    </div>
                    <div onclick="window.onSelectActividadEvolucion('cal'); window.closeDlTimelineDropdown();" class="dl-menu-item" style="padding: 8px 14px; display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; color: #2d3e2c; cursor: pointer;">
                      <span style="font-size: 16px;">📅</span>
                      <span>Calendario de Labores</span>
                    </div>
                    <div style="height: 1px; background: #edf2ec; margin: 4px 0;"></div>
                    <div style="padding: 4px 14px 2px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px;">
                      Fotos por Actividad
                    </div>
                    ${Object.entries(tiposMap).length > 0 ? Object.entries(tiposMap).map(([tName, tData]) => `
                      <div onclick="window.onSelectActividadEvolucion('gallery:${escapeHtml(tName)}'); window.closeDlTimelineDropdown();" class="dl-menu-item" style="padding: 8px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12.5px; font-weight: 600; color: #1a1a1a; cursor: pointer;">
                        <span style="display: flex; align-items: center; gap: 8px;">
                          <span style="font-size: 15px;">${getTipoIcon(tName)}</span>
                          <span>${escapeHtml(tName)}</span>
                        </span>
                        <span style="font-size: 11px; font-weight: 800; color: #2d3e2c; background: #eef4ec; padding: 2px 7px; border-radius: 10px;">
                          ${tData.photoCount} ${tData.photoCount === 1 ? 'foto' : 'fotos'}
                        </span>
                      </div>
                    `).join('') : `
                      <div style="padding: 8px 14px; font-size: 12px; color: #777; font-style: italic;">
                        Sin fotos registradas aún
                      </div>
                    `}
                  </div>
                </div>
              </div>
            </div>
            ${planCalendarHtml}
          </div>

          <!-- Vista 2: Visor de Fotos y Evolución de Aplicaciones -->
          <div id="dl-evolucion-wrap" style="display: none;"></div>

        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error in renderDetalleLote:', err);
    return `<div style="padding: 24px; color: red;">Error cargando detalle: ${err.message}</div>`;
  }
}

export function initDetalleLote(id) {
  initPlanIfcafe();

  const getTipoIcon = (tipo) => {
    if (!tipo) return '📌';
    if (tipo.includes('Foliar')) return '🍃';
    if (tipo.includes('Suelo') || tipo.includes('Fertiliz')) return '🌿';
    if (tipo.includes('Fitosanitario') || tipo.includes('Control')) return '🛡️';
    if (tipo.includes('Tejido') || tipo.includes('Poda')) return '✂️';
    if (tipo.includes('Limpieza')) return '🧹';
    if (tipo.includes('Análisis')) return '🧪';
    return '📌';
  };

  window.toggleDlTimelineDropdown = (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    let menu = null;
    if (e && e.currentTarget) {
      const container = e.currentTarget.closest('.m3-split-button-container');
      if (container) {
        menu = container.querySelector('#dl-timeline-menu, #dl-timeline-menu-evo');
      }
    }
    if (!menu) {
      const evoWrap = document.getElementById('dl-evolucion-wrap');
      if (evoWrap && evoWrap.style.display !== 'none') {
        menu = document.getElementById('dl-timeline-menu-evo');
      } else {
        menu = document.getElementById('dl-timeline-menu');
      }
    }
    if (menu) {
      const isVisible = menu.style.display === 'block';
      window.closeDlTimelineDropdown();
      if (!isVisible) {
        menu.style.display = 'block';
      }
    }
  };

  window.closeDlTimelineDropdown = () => {
    const menus = document.querySelectorAll('#dl-timeline-menu, #dl-timeline-menu-evo');
    menus.forEach(m => m.style.display = 'none');
  };

  document.removeEventListener('click', window.closeDlTimelineDropdown);
  document.addEventListener('click', window.closeDlTimelineDropdown);

  // Switcher between Calendar and Activity Photo Evolution
  window.onSelectActividadEvolucion = (val) => {
    const calWrap = document.getElementById('dl-calendar-wrap');
    const evoWrap = document.getElementById('dl-evolucion-wrap');
    if (!calWrap || !evoWrap) return;

    if (val === 'cal') {
      calWrap.style.display = 'block';
      evoWrap.style.display = 'none';
      return;
    }

    const apps = window._dlCurrentApps || [];

    if (val.startsWith('gallery')) {
      const filterTipo = val.includes(':') ? val.split(':')[1] : 'all';
      
      const allPhotosApps = apps.filter(a => a.notas && (a.notas.startsWith('data:image') || a.notas.startsWith('http')));
      // Sort chronologically (oldest to newest for timeline evolution)
      const sortedPhotos = [...allPhotosApps].sort((a, b) => new Date(a.fecha) - new Date(a.fecha));

      // Collect available types with photos
      const typesSet = {};
      allPhotosApps.forEach(a => {
        const t = a.tipo || 'Labor de campo';
        typesSet[t] = (typesSet[t] || 0) + 1;
      });

      const typesList = Object.keys(typesSet);
      let targetTipo = filterTipo;
      if (targetTipo === 'all' || !targetTipo) {
        targetTipo = typesList.length > 0 ? typesList[0] : '';
      }

      const filteredPhotosApps = sortedPhotos.filter(a => (a.tipo || 'Labor de campo') === targetTipo);

      calWrap.style.display = 'none';
      evoWrap.style.display = 'block';

      const calcDaysBetween = (f1, f2) => {
        if (!f1 || !f2) return null;
        const d1 = new Date(f1.length === 10 ? f1 + 'T00:00:00' : f1);
        const d2 = new Date(f2.length === 10 ? f2 + 'T00:00:00' : f2);
        const diff = Math.floor((d2 - d1) / (1000 * 60 * 60 * 24));
        return diff > 0 ? diff : null;
      };

      evoWrap.innerHTML = `
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; border-bottom: 1.5px solid #eef2ee; padding-bottom: 12px;">
          <div>
            <h2 style="margin: 0; font-size: 18px; font-weight: 800; color: #2d3e2c; display: flex; align-items: center; gap: 8px;">
              <span>📸</span> Línea de Tiempo: ${targetTipo || 'Evolución'}
            </h2>
            <p style="margin: 3px 0 0; font-size: 12.5px; color: #666;">
              Mostrando la evolución y fotos registradas de <b>${targetTipo}</b> (${filteredPhotosApps.length} fotos)
            </p>
          </div>

          <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <!-- Split button in Timeline View -->
            <div class="m3-split-button-container" style="position: relative; display: inline-flex; align-items: stretch; border-radius: 20px; box-shadow: 0 1px 4px rgba(0,0,0,0.08);">
              <button type="button" onclick="window.onSelectActividadEvolucion('cal')" class="m3-split-btn-main" style="background: #2d3e2c; color: #ffffff; border: none; padding: 7px 14px; font-size: 12.5px; font-weight: 700; border-top-left-radius: 20px; border-bottom-left-radius: 20px; cursor: pointer; display: flex; align-items: center; gap: 6px; transition: background 0.15s ease;">
                <span class="material-symbols-outlined" style="font-size: 17px;">calendar_month</span>
                <span>Volver al Calendario</span>
              </button>
              <div style="width: 1px; background: rgba(255,255,255,0.25);"></div>
              <button type="button" onclick="window.toggleDlTimelineDropdown(event)" class="m3-split-btn-toggle" style="background: #2d3e2c; color: #ffffff; border: none; padding: 7px 10px; border-top-right-radius: 20px; border-bottom-right-radius: 20px; cursor: pointer; display: flex; align-items: center; justify-content: center; transition: background 0.15s ease;">
                <span class="material-symbols-outlined" style="font-size: 18px;">arrow_drop_down</span>
              </button>

              <!-- Dropdown Menu inside Evolution View -->
              <div id="dl-timeline-menu-evo" style="display: none; position: absolute; top: calc(100% + 6px); right: 0; min-width: 250px; background: #ffffff; border: 1px solid #e0e6de; border-radius: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.14); z-index: 1000; overflow: hidden; padding: 6px 0;">
                <div style="padding: 6px 14px 4px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px;">
                  Vistas y Evolución
                </div>
                <div onclick="window.onSelectActividadEvolucion('cal'); window.closeDlTimelineDropdown();" class="dl-menu-item" style="padding: 8px 14px; display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; color: #2d3e2c; cursor: pointer;">
                  <span style="font-size: 16px;">📅</span>
                  <span>Calendario de Labores</span>
                </div>
                <div style="height: 1px; background: #edf2ec; margin: 4px 0;"></div>
                <div style="padding: 4px 14px 2px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px;">
                  Fotos por Actividad
                </div>
                ${Object.entries(typesSet).map(([tName, count]) => `
                  <div onclick="window.onSelectActividadEvolucion('gallery:${escapeHtml(tName)}'); window.closeDlTimelineDropdown();" class="dl-menu-item" style="padding: 8px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12.5px; font-weight: 600; color: #1a1a1a; cursor: pointer;">
                    <span style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-size: 15px;">${getTipoIcon(tName)}</span>
                      <span>${escapeHtml(tName)}</span>
                    </span>
                    <span style="font-size: 11px; font-weight: 800; color: #2d3e2c; background: #eef4ec; padding: 2px 7px; border-radius: 10px;">
                      ${count} ${count === 1 ? 'foto' : 'fotos'}
                    </span>
                  </div>
                `).join('')}
              </div>
            </div>
          </div>
        </div>

        ${filteredPhotosApps.length > 0 ? `
          <div class="dl-evolution-grid">
            ${filteredPhotosApps.map((a, idx) => {
              const prev = idx > 0 ? filteredPhotosApps[idx - 1] : null;
              const daysPassed = prev ? calcDaysBetween(prev.fecha, a.fecha) : null;

              return `
                <div class="dl-evo-card">
                  <!-- Photo Container with Badges -->
                  <div style="position: relative; height: 230px; background: #1a1a1a; cursor: pointer;" onclick="window.verFotoPlantaModal('${a.notas}', '${a.producto || a.tipo} - ${a.fecha}')">
                    <img src="${a.notas}" alt="${a.producto || 'Labor'}" style="width: 100%; height: 100%; object-fit: cover; display: block;">
                    
                    <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.72); backdrop-filter: blur(4px); color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 800;">
                      📅 ${a.fecha}
                    </div>

                    <div style="position: absolute; top: 10px; right: 10px; background: rgba(45,62,44,0.9); backdrop-filter: blur(4px); color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 800;">
                      Etapa ${idx + 1}
                    </div>

                    ${daysPassed ? `
                      <div style="position: absolute; bottom: 10px; left: 10px; background: rgba(0,0,0,0.72); backdrop-filter: blur(4px); color: #a9e8a6; padding: 3px 10px; border-radius: 20px; font-size: 11px; font-weight: 800; display: flex; align-items: center; gap: 4px;">
                        <span class="material-symbols-outlined" style="font-size: 13px;">schedule</span> +${daysPassed} días
                      </div>
                    ` : ''}

                    <div style="position: absolute; bottom: 10px; right: 10px; background: rgba(0,0,0,0.72); backdrop-filter: blur(4px); color: #fff; padding: 3px 9px; border-radius: 20px; font-size: 11px; font-weight: 700;">
                      🔍 Ampliar
                    </div>
                  </div>

                  <!-- Details Body -->
                  <div style="padding: 16px 18px; display: flex; flex-direction: column; justify-content: space-between; flex: 1; background: #fcfdfc;">
                    <div>
                      <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
                        <span style="font-size: 11px; font-weight: 800; padding: 2px 9px; border-radius: 12px; background: #eef7ee; color: #1b5e20;">
                          ${getTipoIcon(a.tipo)} ${a.tipo || 'Labor de campo'}
                        </span>
                      </div>

                      <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #1a1a1a;">
                        ${a.producto || 'Labor agrícola'}
                      </h3>

                      <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 10px; font-size: 12.5px; color: #555;">
                        ${a.dosis ? `<div>⚖️ <b>Dosis:</b> ${a.dosis}</div>` : ''}
                        ${a.metodo ? `<div>💧 <b>Método:</b> ${a.metodo}</div>` : ''}
                        ${a.operador ? `<div>👤 <b>Aplicador:</b> ${a.operador}</div>` : ''}
                      </div>

                      ${a.observaciones ? `
                        <div style="margin-top: 10px; padding: 8px 12px; background: #ffffff; border: 1px solid #e0e6df; border-radius: 10px; font-size: 12px; color: #444; line-height: 1.4;">
                          <span style="font-weight: 700; color: #2d3e2c;">Obs:</span> "${a.observaciones}"
                        </div>
                      ` : ''}
                    </div>

                    <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid #eef2ee; font-size: 11px; color: #888; display: flex; align-items: center; justify-content: space-between;">
                      <span>Registro verificado ✅</span>
                      <button type="button" onclick="window.onSelectActividadEvolucion('cal'); setTimeout(() => { window.showInlineActividadForm('${a.fecha}', '${a.id}'); }, 50);" class="plan-btn-ghost" style="padding: 3px 8px; font-size: 11px; border: none; color: #2d3e2c; font-weight: 700; cursor: pointer;">
                        ✏️ Editar
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div style="text-align: center; padding: 40px 20px; background: #f9fbf9; border-radius: 16px; border: 1.5px dashed #c0d4be;">
            <span class="material-symbols-outlined" style="font-size: 40px; color: #8a9e88;">photo_camera</span>
            <h4 style="margin: 10px 0 4px; font-size: 15px; color: #2d3e2c;">Sin fotografías registradas en esta categoría</h4>
            <p style="margin: 0; font-size: 12px; color: #666;">Al registrar labores en el calendario, adjunta fotos para ver aquí la línea de tiempo de evolución.</p>
          </div>
        `}
      `;
      return;
    }
  };

  // Initialize mini map with GPS polygon if exists
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
            keyboard: false,
            maxZoom: 21
          });
          const esriSatLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
            maxZoom: 21,
            maxNativeZoom: 17,
            attribution: 'Tiles &copy; Esri &mdash; Source: Esri'
          }).addTo(map);
          L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
            subdomains: 'abcd',
            maxZoom: 21,
            maxNativeZoom: 17,
            opacity: 0.85
          }).addTo(map);
          esriSatLayer.on('tileerror', (e) => {
            console.warn('[detalle_lote] ESRI tile failed:', e.tile.src);
          });
          const polygon = L.polygon(latlngs, {
            color: '#ffffff',
            fillColor: color || '#2d3e2c',
            fillOpacity: 0.35,
            weight: 2.5
          }).addTo(map);

          const fitMapToPolygon = () => {
            map.invalidateSize();
            map.fitBounds(polygon.getBounds().pad(0.12));
          };

          fitMapToPolygon();
          setTimeout(fitMapToPolygon, 200);
          setTimeout(fitMapToPolygon, 500);
          setTimeout(fitMapToPolygon, 1000);

          if (window.ResizeObserver) {
            const ro = new ResizeObserver(() => fitMapToPolygon());
            ro.observe(mapContainer);
          }
        }, 150);
      }
    } catch (e) {
      console.warn('Error loading map:', e);
    }
  }

  window.confirmDeleteLoteFromDetalle = (loteId, loteNombre) => {
    window.Snackbar?.confirm(`¿Eliminar el lote "${loteNombre}"?`, async () => {
      const { error } = await supabase.from('lotes').delete().eq('id', loteId);
      if (error) {
        window.Snackbar?.show('Error: ' + error.message, { type: 'error' });
      } else {
        window.Snackbar?.show('Lote eliminado exitosamente');
        window.clearScreenCache?.('dashboard');
        window.clearScreenCache?.('detalle_lote');
        window.navigateTo('dashboard');
      }
    });
  };
}
