import { supabase } from '../supabase.js';
import { renderPlanIfcafe, initPlanIfcafe } from './plan_ifcafe.js';
import { showModal, closeModal } from '../modals.js';
import { uploadImage, compressImage } from '../utils/image_uploader.js';
import { restInsert, restFetch, getUser } from '../auth.js';
import { invalidateCache } from '../sync.js';
import db from '../db.js';

function getLocalToday() {
  const d = new Date();
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getAppPhoto(a) {
  return a?.foto_url || a?.notas || '';
}

function isPhotoValid(src) {
  return Boolean(src && (src.startsWith('data:image') || src.startsWith('http')));
}

export async function renderDetalleLote(id) {
  try {
    const [
      { data: lote, error: loteErr },
      { data: aplicaciones = [] },
      planCalendarHtml,
      currentUser
    ] = await Promise.all([
      supabase.from('lotes').select('*').eq('id', id).single(),
      supabase.from('lote_aplicaciones').select('*').eq('lote_id', id).order('fecha', { ascending: false }),
      renderPlanIfcafe(id, { embedded: true }),
      getUser().catch(() => null)
    ]);

    if (loteErr) throw loteErr;

    const loggedInUserName = currentUser?.user_metadata?.nombre || (currentUser?.email ? currentUser.email.split('@')[0] : 'Usuario');
    window._dlCurrentUserName = loggedInUserName;

    const hasMap = Boolean(lote.coordenadas_json);
    const appsWithPhotos = (aplicaciones || []).filter(a => isPhotoValid(getAppPhoto(a)));

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
      if (isPhotoValid(getAppPhoto(a))) {
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
          scrollbar-width: none;
          -ms-overflow-style: none;
          -webkit-overflow-scrolling: touch;
          align-items: stretch;
          flex: 1;
          min-width: 0;
        }
        .dl-chips-carousel::-webkit-scrollbar {
          display: none;
          width: 0;
          height: 0;
        }
        .dl-chips-carousel .ganado-tag-stat {
          flex-shrink: 0;
          white-space: nowrap;
        }
        .dl-fused-card {
          display: grid;
          grid-template-columns: ${hasMap ? '1.25fr 1fr' : '1fr'};
          border-radius: 0;
          overflow: hidden;
          background: var(--m3-primary, #2d3e2c);
          box-shadow: none;
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
            border-radius: 0 !important;
          }
          #dl-map-container {
            height: 220px !important;
            min-height: 220px !important;
          }
        }
        @media (max-width: 768px) {
          .dl-header-cafetal {
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
          }
          .dl-header-title-box {
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
          }
          .dl-header-btn-wrap {
            width: 100% !important;
            justify-content: center !important;
            margin-top: 4px !important;
          }
          .dl-evo-header {
            flex-direction: column !important;
            align-items: center !important;
            text-align: center !important;
          }
          .dl-evo-header-btns {
            width: 100% !important;
            justify-content: center !important;
          }
        }
        #dl-map-container,
        #dl-map-container .leaflet-container {
          touch-action: pan-y !important;
        }
      </style>
      <div class="m3-pt-6 m3-pb-24 m3-p-4 m3-font-work-sans dl-screen-pad">
        <!-- Header -->
        <section class="m3-mb-4" style="padding: 0 4px;">
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap; flex: 1; min-width: 0;">
              <h1 class="m3-display-small m3-font-extrabold m3-text-on-surface m3-tracking-tight m3-font-manrope" style="margin: 0; line-height: 1.1; font-size: 22px;">
                ${lote.nombre}
              </h1>
              ${lote.edad_categoria ? `
                <span style="font-size: 11.5px; font-weight: 700; background: #eaf2e8; color: #2d3e2c; border: 1px solid #c8d4c6; padding: 3px 10px; border-radius: 20px; display: inline-flex; align-items: center; gap: 4px; white-space: nowrap;">
                  🌱 ${formatEdadLabel(lote.edad_categoria)}
                </span>
              ` : ''}
            </div>

            <!-- Botón de Configuración (Editar / Eliminar) -->
            <div style="position: relative; flex-shrink: 0;">
              <button type="button" onclick="window.toggleLoteConfigDropdown(event)" style="width: 40px; height: 40px; border-radius: 12px; background: #ffffff; border: 1.5px solid var(--m3-outline-variant, #c7cec3); color: var(--m3-primary, #2d3e2c); display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 2px 6px rgba(0,0,0,0.04); transition: all 0.15s ease;" title="Opciones del Lote" aria-label="Opciones del Lote">
                <span class="material-symbols-outlined" style="font-size: 21px;">settings</span>
              </button>

              <!-- Dropdown Menu de Configuración -->
              <div id="dl-config-dropdown" style="display: none; position: absolute; top: calc(100% + 6px); right: 0; min-width: 170px; background: #ffffff; border: 1.5px solid var(--m3-outline-variant, #c7cec3); border-radius: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.12); z-index: 1000; overflow: hidden; padding: 6px 0;">
                <div onclick="window.navigateTo('nuevo_lote', '${lote.id}'); window.closeLoteConfigDropdown();" style="padding: 10px 14px; display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; color: #1a1a1a; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#f0f5ee'" onmouseout="this.style.background='transparent'">
                  <span class="material-symbols-outlined" style="font-size: 18px; color: #2d3e2c;">edit</span>
                  <span>Editar Lote</span>
                </div>
                <div style="height: 1px; background: #edf1ec; margin: 4px 0;"></div>
                <div onclick="window.confirmDeleteLoteFromDetalle('${lote.id}', '${lote.nombre}'); window.closeLoteConfigDropdown();" style="padding: 10px 14px; display: flex; align-items: center; gap: 10px; font-size: 13px; font-weight: 700; color: #ba1a1a; cursor: pointer; transition: background 0.15s;" onmouseover="this.style.background='#ffedea'" onmouseout="this.style.background='transparent'">
                  <span class="material-symbols-outlined" style="font-size: 18px; color: #ba1a1a;">delete</span>
                  <span>Eliminar Lote</span>
                </div>
              </div>
            </div>
          </div>
        </section>

        <!-- Tarjeta Unificada Completa del Lote (Hero/Mapa + Manejo del Cafetal en UNA SOLA TARJETA) -->
        <div class="dl-unified-main-card" style="border-radius: 20px; border: 1.5px solid var(--m3-outline-variant, #c7cec3); background: var(--m3-surface-container-lowest, #ffffff); box-shadow: 0 4px 16px rgba(45, 62, 44, 0.06); overflow: hidden; width: 100%; box-sizing: border-box; margin-bottom: 24px;">

          <!-- Top: Info del Lote, Variedad, Plantas, Árboles y Mapa Satelital -->
          <div class="dl-fused-card" style="border-radius: 0; border: none; box-shadow: none;">
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

          <!-- Bottom: Manejo del Cafetal / Galería de Evolución (Dentro de la Misma Tarjeta) -->
          <div id="lote-calendario-section" style="border-radius: 0; border: none; box-shadow: none; padding: 20px 18px; width: 100%; box-sizing: border-box; background: #ffffff;">
          
          <!-- Vista 1: Calendario Interactivo -->
          <div id="dl-calendar-wrap">
            <div class="m3-flex m3-items-center m3-justify-between m3-mb-4 dl-header-cafetal" style="border-bottom: 1.5px solid #eef2ee; padding-bottom: 12px; flex-wrap: wrap; gap: 12px;">
              <div class="m3-flex m3-items-center m3-gap-3 dl-header-title-box">
                <span style="font-size: 24px;">🌿</span>
                <div>
                  <h2 class="m3-title-large m3-font-bold m3-text-on-surface" style="margin: 0; font-size: 18px;">Manejo del Cafetal</h2>
                  <p style="margin: 2px 0 0; font-size: 12px; color: var(--m3-on-surface-variant);">Calendario de labores, abonadas, foliares y podas de este lote</p>
                </div>
              </div>

              <div class="m3-flex m3-items-center m3-gap-2 dl-header-btn-wrap">
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

  window.toggleLoteConfigDropdown = (e) => {
    if (e) {
      e.stopPropagation();
      e.preventDefault();
    }
    const menu = document.getElementById('dl-config-dropdown');
    if (menu) {
      const isVisible = menu.style.display === 'block';
      window.closeLoteConfigDropdown();
      if (!isVisible) {
        menu.style.display = 'block';
      }
    }
  };

  window.closeLoteConfigDropdown = () => {
    const menu = document.getElementById('dl-config-dropdown');
    if (menu) menu.style.display = 'none';
  };

  document.removeEventListener('click', window.closeDlTimelineDropdown);
  document.addEventListener('click', window.closeDlTimelineDropdown);
  document.removeEventListener('click', window.closeLoteConfigDropdown);
  document.addEventListener('click', window.closeLoteConfigDropdown);

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
      
      const allPhotosApps = apps.filter(a => isPhotoValid(getAppPhoto(a)));
      // Sort chronologically (oldest to newest for timeline evolution)
      const sortedPhotos = [...allPhotosApps].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

      // Collect available types with photos
      const typesSet = {};
      allPhotosApps.forEach(a => {
        const t = a.tipo || 'Labor de campo';
        typesSet[t] = (typesSet[t] || 0) + 1;
      });

      const isAll = filterTipo === 'all' || !filterTipo;
      const targetTipo = isAll ? 'all' : filterTipo;
      const filteredPhotosApps = isAll
        ? sortedPhotos
        : sortedPhotos.filter(a => (a.tipo || 'Labor de campo') === targetTipo);

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
        <div class="dl-evo-header" style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 16px; border-bottom: 1.5px solid #eef2ee; padding-bottom: 12px;">
          <div>
            <h2 style="margin: 0; font-size: 18px; font-weight: 800; color: #2d3e2c; display: flex; align-items: center; gap: 8px;">
              <span>📸</span> Línea de Tiempo: ${targetTipo === 'all' ? 'Todas las Fotos' : escapeHtml(targetTipo)}
            </h2>
            <p style="margin: 3px 0 0; font-size: 12.5px; color: #666;">
              Mostrando la evolución y fotos registradas ${targetTipo === 'all' ? 'del lote' : `de <b>${escapeHtml(targetTipo)}</b>`} (${filteredPhotosApps.length} ${filteredPhotosApps.length === 1 ? 'foto' : 'fotos'})
            </p>
          </div>

          <div class="dl-evo-header-btns" style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
            <!-- Botón Subir Foto Directa -->
            <button type="button" id="dl-btn-subir-foto-top" onclick="window.abrirModalSubirFotoEvolucion('${targetTipo === 'all' ? '' : escapeHtml(targetTipo)}')" class="plan-btn-primary" style="background: #2d3e2c; color: #ffffff; border-radius: 9999px; padding: 7px 16px; font-size: 12.5px; font-weight: 700; display: inline-flex; align-items: center; gap: 6px; cursor: pointer; border: none; box-shadow: 0 2px 8px rgba(45,62,44,0.25); transition: all 0.15s ease;">
              <span class="material-symbols-outlined" style="font-size: 18px;">add_a_photo</span>
              <span>Subir Foto</span>
            </button>

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
                <div onclick="window.onSelectActividadEvolucion('gallery:all'); window.closeDlTimelineDropdown();" class="dl-menu-item" style="padding: 8px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 12.5px; font-weight: 700; color: #1a1a1a; cursor: pointer;">
                  <span style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 15px;">📸</span>
                    <span>Todas las Fotos</span>
                  </span>
                  <span style="font-size: 11px; font-weight: 800; color: #2d3e2c; background: #eef4ec; padding: 2px 7px; border-radius: 10px;">
                    ${allPhotosApps.length}
                  </span>
                </div>
                <div style="height: 1px; background: #edf2ec; margin: 4px 0;"></div>
                <div style="padding: 4px 14px 2px; font-size: 10px; font-weight: 800; text-transform: uppercase; color: #6b7280; letter-spacing: 0.5px;">
                  Fotos por Categoría
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

        <!-- Contenedor Integrado del Formulario de Fotografía (Material 3 Expressive) -->
        <div id="dl-foto-evo-inline-card" style="display: none; margin-bottom: 24px;"></div>

        ${filteredPhotosApps.length > 0 ? `
          <div class="dl-evolution-grid">
            ${filteredPhotosApps.map((a, idx) => {
              const prev = idx > 0 ? filteredPhotosApps[idx - 1] : null;
              const daysPassed = prev ? calcDaysBetween(prev.fecha, a.fecha) : null;
              const photoUrl = getAppPhoto(a);
              const registeredByName = (a.operador && a.operador !== 'Monitoreo' && a.operador !== 'Sin especificar')
                ? a.operador
                : (window._dlCurrentUserName || 'Usuario');

              return `
                <div class="dl-evo-card">
                  <!-- Photo Container with Badges -->
                  <div style="position: relative; height: 230px; background: #1a1a1a; cursor: pointer;" onclick="window.verFotoPlantaModal('${photoUrl}', '${escapeHtml(a.producto || a.tipo || 'Foto')} - ${a.fecha}')">
                    <img src="${photoUrl}" alt="${escapeHtml(a.producto || 'Foto')}" style="width: 100%; height: 100%; object-fit: cover; display: block;">
                    
                    <div style="position: absolute; top: 10px; left: 10px; background: rgba(0,0,0,0.72); backdrop-filter: blur(4px); color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 800;">
                      📅 ${a.fecha}
                    </div>

                    <div style="position: absolute; top: 10px; right: 10px; background: rgba(45,62,44,0.9); backdrop-filter: blur(4px); color: #fff; padding: 4px 10px; border-radius: 20px; font-size: 11.5px; font-weight: 800;">
                      Foto ${idx + 1}
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
                          ${getTipoIcon(a.tipo)} ${escapeHtml(a.tipo || 'Labor de campo')}
                        </span>
                      </div>

                      <h3 style="margin: 0; font-size: 16px; font-weight: 800; color: #1a1a1a;">
                        ${escapeHtml(a.producto || 'Fotografía de evolución')}
                      </h3>

                      ${(a.dosis || (a.metodo && a.metodo !== 'Fotografía / Monitoreo')) ? `
                        <div style="display: flex; flex-direction: column; gap: 4px; margin-top: 10px; font-size: 12.5px; color: #555;">
                          ${a.dosis ? `<div>⚖️ <b>Dosis:</b> ${escapeHtml(a.dosis)}</div>` : ''}
                          ${a.metodo && a.metodo !== 'Fotografía / Monitoreo' ? `<div>💧 <b>Método:</b> ${escapeHtml(a.metodo)}</div>` : ''}
                        </div>
                      ` : ''}

                      ${a.observaciones ? `
                        <div style="margin-top: 10px; padding: 10px 12px; background: #ffffff; border: 1.5px solid #e0e6df; border-radius: 12px; font-size: 12.5px; color: #333; line-height: 1.45;">
                          <div style="font-weight: 800; color: #2d3e2c; font-size: 11px; margin-bottom: 3px; text-transform: uppercase; letter-spacing: 0.3px;">Motivo / Qué ocurrió:</div>
                          ${escapeHtml(a.observaciones)}
                        </div>
                      ` : ''}
                    </div>

                    <div style="margin-top: 14px; padding-top: 10px; border-top: 1px solid #eef2ee; font-size: 11.5px; color: #888; display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px;">
                      <div style="display: flex; align-items: center; gap: 6px; color: #2d3e2c; font-weight: 700; font-size: 11.5px; background: #f0f6ef; padding: 4px 10px; border-radius: 8px; border: 1px solid #d4dfd2;">
                        <span class="material-symbols-outlined" style="font-size: 16px; color: #1b5e20;">person</span>
                        <span>Registrado por: <strong style="color: #1b5e20;">${escapeHtml(registeredByName)}</strong></span>
                      </div>
                      <div style="display: flex; align-items: center; gap: 8px;">
                        <button type="button" onclick="window.confirmEliminarFotoEvolucion('${a.id}', '${escapeHtml(a.producto || a.tipo || 'Foto')}', '${targetTipo}')" style="background: none; border: none; color: #ba1a1a; font-weight: 700; cursor: pointer; font-size: 11.5px; padding: 3px 6px;">
                          🗑️ Eliminar
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        ` : `
          <div id="dl-foto-evo-empty-state" style="text-align: center; padding: 44px 20px; background: #f9fbf9; border-radius: 18px; border: 1.5px dashed #c0d4be;">
            <div style="width: 56px; height: 56px; border-radius: 50%; background: #eaf2e8; display: inline-flex; align-items: center; justify-content: center; margin-bottom: 12px; color: #2d3e2c;">
              <span class="material-symbols-outlined" style="font-size: 32px;">photo_camera</span>
            </div>
            <h4 style="margin: 0 0 6px; font-size: 16px; font-weight: 800; color: #2d3e2c;">
              ${targetTipo !== 'all' && targetTipo ? `Sin fotografías en "${escapeHtml(targetTipo)}"` : 'Sin fotografías registradas en este lote'}
            </h4>
            <p style="margin: 0 auto 16px; font-size: 13px; color: #666; max-width: 420px; line-height: 1.45;">
              Puedes subir fotos directamente para registrar la evolución de las plantas, floración, brotes, síntomas o cualquier novedad ocurrida en este lote, con una breve descripción.
            </p>
            <button type="button" onclick="window.abrirModalSubirFotoEvolucion('${targetTipo === 'all' ? '' : escapeHtml(targetTipo)}')" style="background: #2d3e2c; color: #ffffff; border: none; border-radius: 9999px; padding: 10px 22px; font-size: 13px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 8px; box-shadow: 0 2px 8px rgba(45,62,44,0.25); transition: all 0.15s;">
              <span class="material-symbols-outlined" style="font-size: 20px;">add_a_photo</span>
              <span>Subir Fotografía</span>
            </button>
          </div>
        `}
      `;
      return;
    }
  };

  // Direct Photo Upload Form & Handlers (Adapted to Material 3 Expressive)
  window.abrirModalSubirFotoEvolucion = (defaultTipo = '') => {
    const evoWrap = document.getElementById('dl-evolucion-wrap');
    if (!evoWrap || evoWrap.style.display === 'none') {
      window.onSelectActividadEvolucion(defaultTipo ? `gallery:${defaultTipo}` : 'gallery:all');
    }

    const emptyState = document.getElementById('dl-foto-evo-empty-state');
    if (emptyState) emptyState.style.display = 'none';

    const topBtn = document.getElementById('dl-btn-subir-foto-top');
    if (topBtn) topBtn.style.display = 'none';

    const todayStr = getLocalToday();
    const resolvedTipo = defaultTipo || (window._dlLastSelectedTipo && window._dlLastSelectedTipo !== 'all' ? window._dlLastSelectedTipo : 'Monitoreo / Inspección');

    const formInnerHtml = `
      <div class="da-inline-form-card" style="border: 1.5px solid #d4ded3; border-radius: 20px; padding: 22px; background: #ffffff; box-shadow: 0 4px 20px rgba(45,62,44,0.06); animation: fadeIn 0.2s ease;">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px; padding-bottom: 12px; border-bottom: 1px solid #eef2ee;">
          <div style="display: flex; align-items: center; gap: 12px;">
            <div style="width: 40px; height: 40px; border-radius: 12px; background: #eaf2e8; display: flex; align-items: center; justify-content: center; color: #2d3e2c;">
              <span class="material-symbols-outlined" style="font-size: 24px;">add_a_photo</span>
            </div>
            <div>
              <h3 style="margin: 0; font-size: 17px; font-weight: 800; color: #2d3e2c;">Subir Foto de Evolución</h3>
              <p style="margin: 2px 0 0; font-size: 12px; color: #666;">Registra el avance visual de las plantas, novedades o síntomas</p>
            </div>
          </div>
          <button type="button" onclick="window.cerrarFormularioFotoEvolucion()" style="background: none; border: none; color: #666; cursor: pointer; padding: 6px; display: flex; align-items: center; justify-content: center; border-radius: 50%;" title="Cerrar">
            <span class="material-symbols-outlined" style="font-size: 22px;">close</span>
          </button>
        </div>

        <form id="form-subir-foto-evo" class="m3-form" onsubmit="event.preventDefault(); window.guardarFotoEvolucion('${defaultTipo || 'all'}');">
          <input type="hidden" id="evo-foto-data" value="">

          <!-- Selector / Dropzone de Fotografía Material 3 con Cámara y Galería independientes -->
          <div id="evo-foto-dropzone" style="background: #f7faf6; border: 2px dashed #b8cbb6; border-radius: 18px; padding: 22px 16px; margin-bottom: 22px; text-align: center;">
            <!-- Input específico para Cámara (fuerza cámara nativa en móvil) -->
            <input type="file" id="evo-foto-camera-input" accept="image/*" capture="environment" style="display: none;" onchange="window.handleEvoFotoChange(this)">
            <!-- Input específico para Galería / Archivos -->
            <input type="file" id="evo-foto-gallery-input" accept="image/*" style="display: none;" onchange="window.handleEvoFotoChange(this)">
            
            <div id="evo-foto-prompt" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; width: 100%;">
              <div style="width: 48px; height: 48px; border-radius: 50%; background: #eaf2e8; display: flex; align-items: center; justify-content: center; color: #2d3e2c; margin-bottom: 2px;">
                <span class="material-symbols-outlined" style="font-size: 26px; color: #2d3e2c;">photo_camera</span>
              </div>
              <div style="font-weight: 800; font-size: 15px; color: #1a1a1a;">¿Cómo deseas subir la fotografía?</div>
              <div style="font-size: 12px; color: #666; margin-bottom: 12px;">Selecciona una opción para capturar o adjuntar la imagen</div>

              <!-- 2 Tarjetas claras y bien diferenciadas -->
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; width: 100%; max-width: 380px; margin: 0 auto;">
                <!-- Opción 1: Cámara -->
                <button type="button" onclick="document.getElementById('evo-foto-camera-input').click();" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 16px 10px; background: #2d3e2c; color: #ffffff; border: none; border-radius: 14px; cursor: pointer; box-shadow: 0 2px 8px rgba(45,62,44,0.25); transition: transform 0.15s ease;">
                  <span class="material-symbols-outlined" style="font-size: 26px; color: #ffffff;">photo_camera</span>
                  <span style="font-size: 13px; font-weight: 800; color: #ffffff; line-height: 1.2;">Tomar Foto</span>
                  <span style="font-size: 11px; color: #d4e2d2; font-weight: 500;">Abrir cámara</span>
                </button>

                <!-- Opción 2: Galería -->
                <button type="button" onclick="document.getElementById('evo-foto-gallery-input').click();" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; padding: 16px 10px; background: #ffffff; color: #2d3e2c; border: 1.5px solid #c2d8c0; border-radius: 14px; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.06); transition: transform 0.15s ease;">
                  <span class="material-symbols-outlined" style="font-size: 26px; color: #2d3e2c;">photo_library</span>
                  <span style="font-size: 13px; font-weight: 800; color: #2d3e2c; line-height: 1.2;">Ver Galería</span>
                  <span style="font-size: 11px; color: #666; font-weight: 500;">De tu teléfono</span>
                </button>
              </div>
            </div>

            <div id="evo-foto-preview-wrap" style="display: none; position: relative; width: 100%;">
              <img id="evo-foto-preview-img" src="" alt="Vista previa" style="width: 100%; max-height: 250px; object-fit: cover; border-radius: 14px; box-shadow: 0 4px 14px rgba(0,0,0,0.12);">
              <div style="margin-top: 12px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
                <button type="button" onclick="document.getElementById('evo-foto-camera-input').click();" style="padding: 7px 14px; font-size: 12px; font-weight: 700; border-radius: 9999px; background: #2d3e2c; color: #fff; border: none; display: inline-flex; align-items: center; gap: 5px; cursor: pointer;">
                  <span class="material-symbols-outlined" style="font-size: 16px; color: #fff;">photo_camera</span>
                  <span style="color: #fff;">Tomar otra</span>
                </button>
                <button type="button" onclick="document.getElementById('evo-foto-gallery-input').click();" style="padding: 7px 14px; font-size: 12px; font-weight: 700; border-radius: 9999px; background: #eaf2e8; color: #2d3e2c; border: 1px solid #c2d8c0; display: inline-flex; align-items: center; gap: 5px; cursor: pointer;">
                  <span class="material-symbols-outlined" style="font-size: 16px; color: #2d3e2c;">photo_library</span>
                  <span style="color: #2d3e2c;">Elegir otra</span>
                </button>
                <button type="button" onclick="window.limpiarEvoFoto();" style="padding: 7px 12px; font-size: 12px; font-weight: 700; border-radius: 9999px; background: #fce8e6; color: #ba1a1a; border: 1px solid #f5c2be; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                  <span class="material-symbols-outlined" style="font-size: 16px; color: #ba1a1a;">delete</span>
                  <span style="color: #ba1a1a;">Quitar</span>
                </button>
              </div>
            </div>
          </div>

          <!-- Campos M3 Expressive: Fecha y Categoría -->
          <div class="m3-grid-2col">
            <div class="m3-field has-value">
              <input type="date" id="evo-fecha" value="${todayStr}" placeholder=" " required>
              <label>Fecha</label>
            </div>
            <div class="m3-field has-value">
              <select id="evo-tipo" required>
                <option value="Monitoreo / Inspección" ${resolvedTipo === 'Monitoreo / Inspección' ? 'selected' : ''}>🔍 Monitoreo / Inspección</option>
                <option value="Floración y Cuaje" ${resolvedTipo === 'Floración y Cuaje' ? 'selected' : ''}>🌸 Floración y Cuaje</option>
                <option value="Crecimiento y Follaje" ${resolvedTipo === 'Crecimiento y Follaje' ? 'selected' : ''}>🍃 Crecimiento y Follaje</option>
                <option value="Maduración y Cosecha" ${resolvedTipo === 'Maduración y Cosecha' ? 'selected' : ''}>🍒 Maduración y Cosecha</option>
                <option value="Plaga o Enfermedad" ${resolvedTipo === 'Plaga o Enfermedad' ? 'selected' : ''}>🐛 Plaga o Enfermedad</option>
                <option value="Deficiencia Nutricional" ${resolvedTipo === 'Deficiencia Nutricional' ? 'selected' : ''}>🍂 Deficiencia Nutricional</option>
                <option value="Poda o Tejido" ${resolvedTipo === 'Poda o Tejido' ? 'selected' : ''}>✂️ Poda o Tejido</option>
                <option value="Labor de campo" ${resolvedTipo === 'Labor de campo' ? 'selected' : ''}>🌱 Labor de campo</option>
                <option value="Otro acontecimiento">📌 Otro acontecimiento</option>
              </select>
              <label>Categoría</label>
            </div>
          </div>

          <!-- Título / Novedad (Floating label) -->
          <div class="m3-field">
            <input type="text" id="evo-titulo" placeholder=" " required>
            <label>Título / Novedad (¿Qué muestra la foto?)</label>
          </div>

          <!-- ¿Por qué se tomó la foto? / ¿Qué ha ocurrido? (Floating label) -->
          <div class="m3-field" style="margin-bottom: 8px;">
            <textarea id="evo-observaciones" placeholder=" " rows="3"></textarea>
            <label>¿Por qué se tomó la foto? / ¿Qué ha ocurrido?</label>
          </div>

          <!-- Botones de Acción adaptados a M3 Expressive -->
          <div style="display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 18px; padding-top: 14px; border-top: 1px solid #eef2ee;">
            <button type="button" onclick="window.cerrarFormularioFotoEvolucion()" class="plan-btn-ghost">
              <span>Cancelar</span>
            </button>
            <button type="submit" id="btn-submit-evo-foto" class="plan-btn-primary">
              <span class="material-symbols-outlined" style="font-size: 18px;">cloud_upload</span>
              <span>Guardar Fotografía</span>
            </button>
          </div>
        </form>
      </div>
    `;

    const targetInline = document.getElementById('dl-foto-evo-inline-card');
    if (targetInline) {
      targetInline.innerHTML = formInnerHtml;
      targetInline.style.display = 'block';
      targetInline.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      const tit = document.getElementById('evo-titulo');
      if (tit) tit.focus();
    } else {
      showModal('📸 Subir Foto de Evolución', formInnerHtml);
    }
  };

  window.cerrarFormularioFotoEvolucion = () => {
    const targetInline = document.getElementById('dl-foto-evo-inline-card');
    if (targetInline) {
      targetInline.innerHTML = '';
      targetInline.style.display = 'none';
    }
    const emptyState = document.getElementById('dl-foto-evo-empty-state');
    if (emptyState) emptyState.style.display = 'block';

    const topBtn = document.getElementById('dl-btn-subir-foto-top');
    if (topBtn) topBtn.style.display = 'inline-flex';

    closeModal();
  };

  window.handleEvoFotoChange = async (input) => {
    const file = input?.files?.[0];
    if (!file) return;
    try {
      window.Snackbar?.show('Optimizando fotografía...');
      const compressedDataUrl = await compressImage(file, 1200, 0.75);
      const dataInput = document.getElementById('evo-foto-data');
      const promptEl = document.getElementById('evo-foto-prompt');
      const previewWrap = document.getElementById('evo-foto-preview-wrap');
      const previewImg = document.getElementById('evo-foto-preview-img');

      if (dataInput) dataInput.value = compressedDataUrl;
      if (previewImg) previewImg.src = compressedDataUrl;
      if (promptEl) promptEl.style.display = 'none';
      if (previewWrap) previewWrap.style.display = 'block';
    } catch (err) {
      console.error(err);
      window.Snackbar?.show('Error al procesar foto: ' + err.message, { type: 'error' });
    }
  };

  window.limpiarEvoFoto = () => {
    const camInput = document.getElementById('evo-foto-camera-input');
    const galInput = document.getElementById('evo-foto-gallery-input');
    const dataInput = document.getElementById('evo-foto-data');
    const promptEl = document.getElementById('evo-foto-prompt');
    const previewWrap = document.getElementById('evo-foto-preview-wrap');
    const previewImg = document.getElementById('evo-foto-preview-img');

    if (camInput) camInput.value = '';
    if (galInput) galInput.value = '';
    if (dataInput) dataInput.value = '';
    if (previewImg) previewImg.src = '';
    if (previewWrap) previewWrap.style.display = 'none';
    if (promptEl) promptEl.style.display = 'flex';
  };

  window.guardarFotoEvolucion = async (currentFilterTipo) => {
    const btnSubmit = document.getElementById('btn-submit-evo-foto');
    const dataInput = document.getElementById('evo-foto-data');
    const fechaInput = document.getElementById('evo-fecha');
    const tipoInput = document.getElementById('evo-tipo');
    const tituloInput = document.getElementById('evo-titulo');
    const obsInput = document.getElementById('evo-observaciones');

    const photoData = dataInput?.value?.trim();
    if (!photoData) {
      window.Snackbar?.show('Por favor toma o selecciona una fotografía', { type: 'error' });
      return;
    }

    const fecha = fechaInput?.value || getLocalToday();
    const tipo = tipoInput?.value || 'Monitoreo / Inspección';
    const titulo = tituloInput?.value?.trim() || 'Registro fotográfico';
    const obs = obsInput?.value?.trim() || '';

    if (!titulo) {
      window.Snackbar?.show('Por favor ingresa un título o motivo breve', { type: 'error' });
      return;
    }

    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<span class="material-symbols-outlined" style="font-size:18px;">progress_activity</span> Guardando...';
    }

    try {
      const loteId = window._dlCurrentLote?.id;
      if (!loteId) throw new Error('No se detectó el lote activo');

      let finalPhotoUrl = photoData;
      try {
        const uploadedUrl = await uploadImage(photoData);
        if (uploadedUrl) finalPhotoUrl = uploadedUrl;
      } catch (uploadErr) {
        console.warn('ImgBB upload fallback:', uploadErr);
      }

      const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || window._dlCurrentLote?.empresa_id;

      const currentUser = await getUser().catch(() => null);
      const userName = currentUser?.user_metadata?.nombre || (currentUser?.email ? currentUser.email.split('@')[0] : (window._dlCurrentUserName || 'Usuario'));

      const payload = {
        lote_id: loteId,
        fecha: fecha,
        tipo: tipo,
        metodo: 'Fotografía / Monitoreo',
        producto: titulo,
        dosis: '',
        operador: userName,
        estado: 'Aplicada',
        observaciones: obs,
        foto_url: finalPhotoUrl,
        empresa_id: empresaId
      };

      const result = await restInsert('/rest/v1/lote_aplicaciones', payload);
      if (!result) throw new Error('No se pudo guardar la fotografía en el servidor');

      const newId = result.id || crypto.randomUUID();
      const newRecord = {
        id: newId,
        ...payload,
        operador: userName,
        notas: finalPhotoUrl,
        created_at: new Date().toISOString()
      };

      // Guardar también en Dexie local para disponibilidad inmediata y offline
      try {
        await db.lote_aplicaciones.put(newRecord);
      } catch (dexieErr) {
        console.warn('Dexie put error:', dexieErr);
      }

      invalidateCache('lote_aplicaciones');

      window.Snackbar?.show('✅ Fotografía guardada exitosamente');
      window.cerrarFormularioFotoEvolucion?.();

      if (!window._dlCurrentApps) window._dlCurrentApps = [];
      window._dlCurrentApps.unshift(newRecord);

      window.clearScreenCache?.('detalle_lote');
      window.clearScreenCache?.('plan_ifcafe');

      const viewToOpen = currentFilterTipo && currentFilterTipo !== 'all' ? `gallery:${currentFilterTipo}` : 'gallery:all';
      window.onSelectActividadEvolucion(viewToOpen);
    } catch (err) {
      console.error('Error al guardar foto:', err);
      window.Snackbar?.show('Error al guardar: ' + err.message, { type: 'error' });
      if (btnSubmit) {
        btnSubmit.disabled = false;
        btnSubmit.innerHTML = '<span class="material-symbols-outlined" style="font-size: 18px;">cloud_upload</span> Guardar Fotografía';
      }
    }
  };

  window.confirmEliminarFotoEvolucion = (id, nombre, currentFilter) => {
    window.Snackbar?.confirm(`¿Eliminar la fotografía "${nombre}"?`, async () => {
      try {
        await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${id}`, { method: 'DELETE' });
        try {
          await db.lote_aplicaciones.delete(id);
        } catch (dexieErr) {}
        invalidateCache('lote_aplicaciones');

        window.Snackbar?.show('Fotografía eliminada');
        window._dlCurrentApps = (window._dlCurrentApps || []).filter(a => a.id !== id);
        window.clearScreenCache?.('detalle_lote');
        window.clearScreenCache?.('plan_ifcafe');
        window.onSelectActividadEvolucion('gallery:' + (currentFilter || 'all'));
      } catch (err) {
        window.Snackbar?.show('Error: ' + err.message, { type: 'error' });
      }
    });
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
