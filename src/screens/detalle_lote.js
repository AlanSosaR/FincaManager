import { supabase } from '../supabase.js';
import { renderPlanIfcafe, initPlanIfcafe } from './plan_ifcafe.js';

export async function renderDetalleLote(id) {
  try {
    const [
      { data: lote, error: loteErr },
      planCalendarHtml
    ] = await Promise.all([
      supabase.from('lotes').select('*').eq('id', id).single(),
      renderPlanIfcafe(id, { embedded: true })
    ]);

    if (loteErr) throw loteErr;

    const hasMap = Boolean(lote.coordenadas_json);

    return `
      <style>
        .dl-screen-pad { padding: 0 0 100px 0 !important; max-width: 960px; margin: 0 auto; }
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

              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <div class="ganado-tag-stat" style="background: rgba(255,255,255,0.94); border-radius: 12px; padding: 6px 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.06);">
                  <span class="ganado-tag-swatch w"><img src="area.png" alt="" style="width: 22px; height: 22px; object-fit: contain;"></span>
                  <span class="ganado-tag-info">
                    <span class="ganado-tag-n" style="font-size: 14px;">${lote.area_ha || 0}</span>
                    <span class="ganado-tag-l">Hectáreas</span>
                  </span>
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

        <!-- Manejo del Cafetal (Calendario Interactivo) -->
        <div id="lote-calendario-section" class="m3-card m3-p-6" style="border-radius: 16px; background: #ffffff; box-shadow: 0 2px 12px rgba(0,0,0,0.04);">
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
      </div>
    `;
  } catch (err) {
    console.error('Error in renderDetalleLote:', err);
    return `<div style="padding: 24px; color: red;">Error cargando detalle: ${err.message}</div>`;
  }
}

export function initDetalleLote(id) {
  initPlanIfcafe();

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
