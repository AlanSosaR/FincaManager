import { supabase } from '../supabase.js';
import { renderPlanIfcafe, initPlanIfcafe } from './plan_ifcafe.js';

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
          border: 1.5px solid #d4dfd2;
          background: #ffffff;
          color: #2d3e2c;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.15s ease;
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
              <span style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: var(--m3-primary); letter-spacing: 0.5px;">Lote de Café</span>
              <h1 class="m3-display-small m3-font-extrabold m3-text-on-surface m3-tracking-tight m3-font-manrope" style="margin: 2px 0 0;">${lote.nombre}</h1>
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
            <div style="padding: 22px 24px; display: flex; flex-direction: column; justify-content: space-between; gap: 16px;">
              <div class="ganado-tally-top" style="align-items: baseline; margin: 0;">
                <span class="ganado-tally-label" style="color: #fff; opacity: 1;">Variedad&nbsp;<span class="dl-variedad-name">${lote.variedad || 'Café'}</span></span>
                <span class="ganado-tally-count">
                  <span class="ganado-card-value">${(lote.num_plantas || 0).toLocaleString()}</span>
                  <span class="ganado-tally-unit">plantas</span>
                </span>
              </div>

              <div style="display: flex; gap: 8px; flex-wrap: wrap; align-items: stretch;">
                <!-- 1. Selector de Línea de Tiempo y Fotos por Tipo de Actividad Global -->
                <div class="ganado-tag-stat" style="background: rgba(255,255,255,0.96); border-radius: 12px; padding: 6px 12px; box-shadow: 0 2px 6px rgba(0,0,0,0.06); display: flex; align-items: center; gap: 8px; flex: 1; min-width: 220px; max-width: 320px;">
                  <span class="ganado-tag-swatch w" style="flex-shrink: 0; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center; background: #eef4ec; border-radius: 8px;">
                    <span class="material-symbols-outlined" style="font-size: 20px; color: #2d3e2c;">photo_library</span>
                  </span>
                  <div style="flex: 1; overflow: hidden; display: flex; flex-direction: column;">
                    <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; color: #5a7056; letter-spacing: 0.4px;">Línea de Tiempo & Fotos</span>
                    <select id="dl-select-actividad-foto" onchange="window.onSelectActividadEvolucion(this.value)" style="border: none; background: transparent; font-family: 'Work Sans', sans-serif; font-size: 12.5px; font-weight: 700; color: #1a1a1a; cursor: pointer; outline: none; padding: 2px 0; width: 100%; text-overflow: ellipsis; white-space: nowrap;">
                      <option value="cal">📅 Calendario de Labores</option>
                      ${Object.entries(tiposMap).map(([tName, tData]) => `
                        <option value="gallery:${tName}">
                          ${getTipoIcon(tName)} ${tName} (${tData.photoCount} fotos)
                        </option>
                      `).join('')}
                    </select>
                  </div>
                </div>

                ${lote.edad_categoria ? `
                  <div class="ganado-tag-stat" style="background: rgba(255,255,255,0.94); border-radius: 12px; padding: 6px 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.06);">
                    <span class="ganado-tag-swatch w"><span style="font-size:16px;">🌱</span></span>
                    <span class="ganado-tag-info">
                      <span class="ganado-tag-n" style="font-size: 13px; font-weight:800;">${lote.edad_categoria}</span>
                      <span class="ganado-tag-l">Edad / Etapa</span>
                    </span>
                  </div>
                ` : ''}

                ${lote.maderables_variedades ? `
                  <div class="ganado-tag-stat" style="background: rgba(255,255,255,0.94); border-radius: 12px; padding: 6px 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.06);">
                    <span class="ganado-tag-swatch w"><span style="font-size:16px;">🌲</span></span>
                    <span class="ganado-tag-info">
                      <span class="ganado-tag-n" style="font-size: 12.5px; font-weight:800;">${lote.maderables_variedades}</span>
                      <span class="ganado-tag-l">Maderables</span>
                    </span>
                  </div>
                ` : ''}

                ${lote.musaceas_tipo ? `
                  <div class="ganado-tag-stat" style="background: rgba(255,255,255,0.94); border-radius: 12px; padding: 6px 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.06);">
                    <span class="ganado-tag-swatch w"><span style="font-size:16px;">🍌</span></span>
                    <span class="ganado-tag-info">
                      <span class="ganado-tag-n" style="font-size: 12.5px; font-weight:800;">${lote.musaceas_tipo}</span>
                      <span class="ganado-tag-l">Plátanos / Mínimos</span>
                    </span>
                  </div>
                ` : ''}
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
            <div class="m3-flex m3-items-center m3-justify-between m3-mb-4" style="border-bottom: 1.5px solid #eef2ee; padding-bottom: 12px; flex-wrap: wrap; gap: 8px;">
              <div class="m3-flex m3-items-center m3-gap-3">
                <span style="font-size: 24px;">🌿</span>
                <div>
                  <h2 class="m3-title-large m3-font-bold m3-text-on-surface" style="margin: 0; font-size: 18px;">Manejo del Cafetal</h2>
                  <p style="margin: 2px 0 0; font-size: 12px; color: var(--m3-on-surface-variant);">Calendario de labores, abonadas, foliares y podas de este lote</p>
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
      const sortedPhotos = [...allPhotosApps].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));

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

      const selectEl = document.getElementById('dl-select-actividad-foto');
      if (selectEl && targetTipo) selectEl.value = 'gallery:' + targetTipo;

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
          <button type="button" onclick="window.onSelectActividadEvolucion('cal'); if(document.getElementById('dl-select-actividad-foto')) document.getElementById('dl-select-actividad-foto').value='cal';" class="plan-btn-ghost" style="font-size: 12.5px; padding: 7px 14px;">
            <span class="material-symbols-outlined" style="font-size: 17px;">calendar_month</span>
            <span>Volver al Calendario</span>
          </button>
        </div>

        <!-- Filter Chips by Tipo de Actividad -->
        <div style="display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 24px;">
          ${Object.entries(typesSet).map(([tName, count]) => `
            <button type="button" onclick="window.onSelectActividadEvolucion('gallery:${tName}')" class="dl-filter-chip ${targetTipo === tName ? 'active' : ''}">
              <span>${getTipoIcon(tName)}</span>
              <span>${tName} (${count})</span>
            </button>
          `).join('')}
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
