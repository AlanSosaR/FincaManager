import { supabase } from '../supabase.js';
import { restFetch, restInsert, loadPuntoReferencia } from '../auth.js';
import { invalidateCache } from '../sync.js';
import { initM3FullScreenSearch, escapeSearchHtml } from '../components/m3_search.js';

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function parseCoordenadasJson(json) {
  try {
    if (!json) return { coordinates: [], color: '#2d3e2c' };
    let parsed = json;
    while (typeof parsed === 'string') {
      try {
        const next = JSON.parse(parsed);
        if (next == null) break;
        parsed = next;
      } catch {
        break;
      }
    }
    if (Array.isArray(parsed)) {
      return { coordinates: parsed, color: '#2d3e2c' };
    }
    if (parsed && typeof parsed === 'object') {
      const coords = Array.isArray(parsed.coordinates) ? parsed.coordinates : [];
      return { coordinates: coords, color: parsed.color || '#2d3e2c', ...parsed };
    }
    return { coordinates: [], color: '#2d3e2c' };
  } catch {
    return { coordinates: [], color: '#2d3e2c' };
  }
}

let mapInstance = null;
let drawnItems = null;
let drawControl = null;
let existingPotrerosLayer = null;
let selectedColor = '#2d3e2c';
let refMarker = null;
let miniPreviewMap = null;
let miniPreviewPoly = null;
let coordinatesCleared = false;

// Walking / GPS recording state
let walkState = 'idle';        // 'idle' | 'searching' | 'recording' | 'paused'
let watchId = null;
let walkPoints = [];
let gpsMarker = null;
let walkPolygon = null;
let walkPathLine = null;
let pointCountSinceLastArea = 0;
let hasShownDistanceHint = false;
let walkLastAccuracy = null;
let walkPanel = null;
let walkControl = null;
let lastGpsPosition = null;

export async function renderNuevoPotrero(id) {
  let potrero = null;
  if (id) {
    const arr = await restFetch(`potreros?id=eq.${id}&select=*`);
    potrero = arr?.[0] || null;
  }

  // Store for map initialization
  window.__currentPotreroData = potrero;

  const isEdit = !!potrero;
  const title = isEdit ? 'Editar Potrero' : 'Nuevo Potrero';
  const subtitle = isEdit ? 'Actualiza la información del terreno' : 'Registro de potrero';
  const btnLabel = isEdit ? 'Guardar Cambios' : 'Crear Potrero';

  const val = (field) => potrero ? (potrero[field] ?? '') : '';
  const selected = (field, value) => potrero && potrero[field] === value ? 'selected' : '';

  return `
    <div class="m3-form-screen">
      <div class="m3-form-card">
        <div style="margin-bottom: 32px; display: flex; align-items: center; gap: 20px;" class="nuevo-potrero-card-header">
          <div class="da-stat-icon" style="background: rgba(107, 130, 69, 0.1); color: #6b8245; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <span class="material-icons" style="font-size: 32px;">landscape</span>
          </div>
          <div>
            <div class="da-hero-subtitle" style="margin:0;">${subtitle}</div>
            <h2 class="da-hero-title" style="margin:0; font-size: 24px;">${title}</h2>
          </div>
        </div>

        <form id="form-nuevo-potrero">
          <input type="hidden" name="area" id="area-input" value="${val('area')}">
          <div class="m3-grid-2col">
            <div class="m3-field ${val('nombre') ? 'has-value' : ''}">
              <input type="text" name="nombre" placeholder=" " value="${val('nombre')}" required>
              <label>Nombre del Potrero</label>
              <p class="error-text" id="error-nombre">El nombre es obligatorio</p>
            </div>

            <div class="m3-field ${val('pasto') ? 'has-value' : ''}" id="pasto-field">
              <select name="pasto" id="pasto-select" required onchange="window._togglePastoCustom()">
                <option value="Estrella" data-icon="⭐" data-sub="Pasto rastrero de alta cobertura" ${selected('pasto', 'Estrella')}>Estrella</option>
                <option value="Brachiaria" data-icon="🌿" data-sub="Forraje resistente de alto rendimiento" ${selected('pasto', 'Brachiaria')}>Brachiaria</option>
                <option value="Pangola" data-icon="🌾" data-sub="Pasto suave para corte o pastoreo" ${selected('pasto', 'Pangola')}>Pangola</option>
                <option value="Guinea" data-icon="🌱" data-sub="Macolla alta ideal para engorde" ${selected('pasto', 'Guinea')}>Guinea</option>
                <option value="Cratylia" data-icon="🍃" data-sub="Leguminosa forrajera rica en proteína" ${selected('pasto', 'Cratylia')}>Cratylia</option>
                <option value="Natural" data-icon="🏞️" data-sub="Pasto nativo / grama de potrero" ${selected('pasto', 'Natural')}>Natural / Sabana</option>
                ${(potrero?.pasto && !['Estrella', 'Brachiaria', 'Pangola', 'Guinea', 'Cratylia', 'Natural', 'Otro'].includes(potrero.pasto))
                  ? `<option data-custom-pasto="1" value="${escapeHtml(potrero.pasto)}" data-icon="🌱" data-sub="Variedad personalizada" selected>${escapeHtml(potrero.pasto)}</option>`
                  : ''}
                <option value="Otro" data-icon="✏️" data-sub="Escribir otra variedad de pasto" ${selected('pasto', 'Otro')}>Otro (escribir)</option>
              </select>
              <input type="hidden" name="pasto_custom" id="pasto-input" value="">
              <label>Tipo de Semilla (Pasto)</label>
            </div>

            <div class="m3-field">
              <select name="status">
                <option value="libre" data-icon="✅" data-sub="Listo para ingresar ganado" ${selected('status', 'libre')}>Libre</option>
                <option value="ocupado" data-icon="🐄" data-sub="Con hato en pastoreo actual" ${selected('status', 'ocupado')}>Ocupado</option>
                <option value="recuperando" data-icon="🌱" data-sub="En ciclo de rebrote y descanso" ${selected('status', 'recuperando')}>Recuperando / Descanso</option>
              </select>
              <label>Estado</label>
            </div>

            <div class="m3-field ${val('ciclo_recuperacion') ? 'has-value' : ''}">
              <input type="number" name="ciclo_recuperacion" placeholder=" " value="${val('ciclo_recuperacion') || 30}">
              <label>Ciclo de Rotación (Días)</label>
            </div>
          </div>

          <div class="m3-field ${val('notas') ? 'has-value' : ''}">
            <textarea name="notas" placeholder=" " rows="3">${val('notas')}</textarea>
            <label>Notas Adicionales</label>
          </div>

          <!-- Map Section - Opens Full Bottom Sheet (Google Earth style, igual a Cafetal) -->
          <div style="margin-top: 28px; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 12px;">
              <span class="material-icons" style="color: var(--m3-primary); font-size: 24px;">public</span>
              <h3 style="font-family: 'Work Sans', sans-serif; font-size: 18px; font-weight: 800; color: var(--m3-on-surface); margin: 0;">Delimitar Área del Potrero</h3>
            </div>

            <button type="button" id="btn-open-map-sheet" style="width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 16px 18px; border-radius: 16px; border: 1.5px solid var(--m3-outline-variant); background: #f6f8f5; cursor: pointer; text-align: left; transition: all 0.2s;">
              <div style="display: flex; align-items: center; gap: 14px; min-width: 0;">
                <div style="width: 44px; height: 44px; border-radius: 12px; background: #2d3e2c; color: white; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  <span class="material-icons" style="font-size: 22px;">add_location_alt</span>
                </div>
                <div style="min-width: 0;">
                  <div style="font-family: 'Work Sans', sans-serif; font-size: 15px; font-weight: 700; color: var(--m3-on-surface);">Abrir mapa satelital</div>
                  <div id="map-open-status" style="font-size: 12.5px; color: var(--m3-on-surface-variant); margin-top: 2px;">Toca para marcar los puntos del potrero</div>
                </div>
              </div>
              <span class="material-icons" style="color: var(--m3-primary); font-size: 24px; flex-shrink: 0;">open_in_full</span>
            </button>

            <!-- Live Satellite Mini Preview of Delimited Polygon -->
            <div id="lote-map-preview-wrap" style="display: none; margin-top: 12px; height: 185px; width: 100%; border-radius: 16px; overflow: hidden; border: 1.5px solid var(--m3-outline-variant); position: relative; cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,0.08);">
              <div id="lote-mini-preview-map" style="width: 100%; height: 100%; pointer-events: none;"></div>
              <div style="position: absolute; bottom: 10px; right: 10px; z-index: 500; background: rgba(20,22,20,0.82); color: #ffffff; padding: 6px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; font-family: 'Work Sans', sans-serif; display: flex; align-items: center; gap: 5px; backdrop-filter: blur(6px);">
                <span class="material-icons" style="font-size: 15px;">edit</span>
                Editar mapa
              </div>
            </div>

            <!-- Fullscreen Google Earth Style Map + Medir Potrero Bottom Sheet -->
            <div id="lote-map-sheet" style="position: fixed; inset: 0; z-index: 100015; background: #141614; display: flex; flex-direction: column; visibility: hidden; opacity: 0; pointer-events: none; transition: opacity 0.22s ease;">
              <div style="height: 100dvh; width: 100%; background: #141614; overflow: hidden; display: flex; flex-direction: column;">

                <div id="lote-map-container" style="flex: 1 1 0%; min-height: 0; width: 100%; position: relative; overflow: hidden;">
                  <div id="lote-map" style="width: 100%; height: 100%;"></div>
                  <input type="hidden" id="potrero-map-search-input" value="">
                  <button type="button" id="potrero-map-search-clear" style="display: none;"></button>

                  <!-- Google Earth Center Crosshair + Distance Pill -->
                  <div id="earth-crosshair" style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); z-index: 1002; pointer-events: none; display: flex; flex-direction: column; align-items: center;">
                    <div id="earth-measure-pill" style="margin-bottom: 10px; background: #f3d26b; color: #1f1b10; padding: 4px 10px; border-radius: 8px; font-size: 12.5px; font-weight: 800; font-family: 'Work Sans', sans-serif; box-shadow: 0 2px 8px rgba(0,0,0,0.45); white-space: nowrap;">
                      Ubica el 1er punto
                    </div>
                    <div style="width: 26px; height: 26px; border-radius: 50%; border: 2px solid #ffffff; box-shadow: 0 0 0 1.5px rgba(0,0,0,0.65), inset 0 0 0 1.5px rgba(0,0,0,0.45); display: flex; align-items: center; justify-content: center;">
                      <div style="width: 4px; height: 4px; border-radius: 50%; background: #ffffff; box-shadow: 0 0 2px rgba(0,0,0,0.8);"></div>
                    </div>
                  </div>

                  <!-- Scale bar -->
                  <div id="map-scale-bar" style="position: absolute; bottom: 14px; left: 14px; z-index: 1000; background: rgba(0,0,0,0.6); color: white; padding: 4px 10px; border-radius: 10px; font-size: 11px; font-weight: 600; font-family: 'Work Sans', sans-serif;">
                    <span id="scale-text">400 m</span>
                  </div>

                  <!-- Live Drawing HUD -->
                  <div id="draw-live-hud" style="display: none; position: absolute; bottom: 48px; left: 50%; transform: translateX(-50%); z-index: 1001; background: rgba(110, 68, 0, 0.94); color: #fff8e1; border: 1px solid rgba(251, 188, 4, 0.55); padding: 6px 14px; border-radius: 12px; font-size: 12px; font-weight: 600; font-family: 'Work Sans', sans-serif; box-shadow: 0 4px 12px rgba(0,0,0,0.35); white-space: nowrap; pointer-events: none;">
                    Agregar primer punto
                  </div>

                  <!-- Coordinates display -->
                  <div id="map-coords" style="position: absolute; bottom: 14px; right: 14px; z-index: 1000; background: rgba(0,0,0,0.65); color: white; padding: 4px 10px; border-radius: 10px; font-size: 10.5px; font-weight: 500; font-family: 'Work Sans', monospace; backdrop-filter: blur(8px);">
                    <span id="coords-text">14°04'57.77"N 86°10'36.26"W</span>
                  </div>

                  <!-- Map overlay search button - Top Right -->
                  <div style="position: absolute; top: 16px; right: 16px; z-index: 1000;">
                    <button type="button" id="potrero-map-search-toggle" class="m3-map-overlay-btn" style="width: 44px; height: 44px; border-radius: 12px; background: #141614; color: #ffffff; border: 1px solid rgba(255,255,255,0.18); box-shadow: 0 4px 14px rgba(0,0,0,0.45); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" title="Buscar lugar, potrero o coordenadas">
                      <span class="material-icons" style="font-size: 22px; color: #ffffff;">search</span>
                    </button>
                  </div>

                  <!-- Map overlay action buttons - Bottom Right Stack -->
                  <div id="map-bottom-actions" style="position: absolute; bottom: 50px; right: 16px; z-index: 1000; display: flex; flex-direction: column; gap: 8px;">
                    <button type="button" id="btn-walk-toggle" class="m3-map-overlay-btn m3-walk-btn" style="width: 44px; height: 44px; border-radius: 12px; background: #141614; color: #ffffff; border: 1px solid rgba(255,255,255,0.18); box-shadow: 0 4px 14px rgba(0,0,0,0.45); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" title="Registrar caminando">
                      <span class="material-icons" style="font-size: 22px; color: #ffffff;">directions_walk</span>
                    </button>
                    <button type="button" id="btn-toggle-layers" class="m3-map-overlay-btn" style="width: 44px; height: 44px; border-radius: 12px; background: #141614; color: #ffffff; border: 1px solid rgba(255,255,255,0.18); box-shadow: 0 4px 14px rgba(0,0,0,0.45); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" title="Cambiar capa">
                      <span class="material-icons" style="font-size: 22px; color: #ffffff;">layers</span>
                    </button>
                    <button type="button" id="btn-locate" class="m3-map-overlay-btn" style="width: 44px; height: 44px; border-radius: 12px; background: #141614; color: #ffffff; border: 1px solid rgba(255,255,255,0.18); box-shadow: 0 4px 14px rgba(0,0,0,0.45); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" title="Mi ubicación">
                      <span class="material-icons" style="font-size: 22px; color: #ffffff;">my_location</span>
                    </button>
                  </div>
                </div>

                <!-- Google Earth Style Bottom Sheet: Medir Potrero -->
                <div id="earth-measure-bar" style="flex-shrink: 0; background: #141614; color: #f1f3f4; padding: 8px 16px calc(16px + env(safe-area-inset-bottom)); border-radius: 24px 24px 0 0; margin-top: -18px; position: relative; z-index: 1005; box-shadow: 0 -8px 28px rgba(0,0,0,0.45); display: flex; flex-direction: column; gap: 12px; transition: all 0.22s ease;">
                  <div id="earth-sheet-handle" style="width: 40px; height: 4px; border-radius: 999px; background: rgba(255,255,255,0.35); margin: 2px auto 0; cursor: pointer;"></div>
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                    <div style="display: flex; align-items: center; gap: 10px;">
                      <button type="button" id="btn-close-map-sheet" style="width: 36px; height: 36px; border-radius: 50%; border: none; background: rgba(255,255,255,0.08); color: #f1f3f4; display: flex; align-items: center; justify-content: center; cursor: pointer;" title="Cerrar mapa">
                        <span class="material-icons" style="font-size: 20px;">arrow_back</span>
                      </button>
                      <div>
                        <div style="font-family: 'Work Sans', sans-serif; font-size: 16px; font-weight: 700; color: #ffffff;">Medir Potrero</div>
                        <div id="earth-bar-stats" style="font-size: 12px; color: #c4c7c5;">0 puntos</div>
                      </div>
                    </div>
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <button type="button" id="btn-earth-undo" disabled style="width: 38px; height: 38px; border-radius: 50%; border: none; background: rgba(255,255,255,0.08); color: #f1f3f4; display: flex; align-items: center; justify-content: center; cursor: pointer; opacity: 0.4;" title="Deshacer último punto">
                        <span class="material-icons" style="font-size: 20px;">undo</span>
                      </button>
                      <button type="button" id="btn-earth-clear" style="width: 38px; height: 38px; border-radius: 50%; border: none; background: rgba(255,255,255,0.08); color: #f1f3f4; display: flex; align-items: center; justify-content: center; cursor: pointer;" title="Limpiar puntos">
                        <span class="material-icons" style="font-size: 20px;">delete_outline</span>
                      </button>
                    </div>
                  </div>
                  <div id="earth-closed-metrics" style="display: none; flex-direction: column; gap: 10px; padding: 10px 4px 4px; border-top: 1px solid rgba(255,255,255,0.1);">
                    <div>
                      <div style="font-size: 13px; color: #c4c7c5; font-weight: 500;">Área</div>
                      <div id="earth-metric-area" style="font-size: 16px; font-weight: 700; color: #ffffff; margin-top: 2px;">0.00 ha</div>
                    </div>
                    <div>
                      <div style="font-size: 13px; color: #c4c7c5; font-weight: 500;">Perímetro</div>
                      <div id="earth-metric-perim" style="font-size: 16px; font-weight: 700; color: #ffffff; margin-top: 2px;">0.00 m</div>
                    </div>
                  </div>
                  <div style="display: flex; align-items: center; gap: 10px;">
                    <button type="button" id="btn-earth-add-point" style="flex: 1; height: 44px; border-radius: 999px; border: none; background: #c2e7ff; color: #001d35; font-family: 'Work Sans', sans-serif; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer;">
                      <span class="material-icons" style="font-size: 20px;">add</span>
                      Agregar punto
                    </button>
                    <button type="button" id="btn-earth-done" style="height: 44px; padding: 0 20px; border-radius: 999px; border: 1px solid rgba(255,255,255,0.28); background: transparent; color: #e3e3e3; font-family: 'Work Sans', sans-serif; font-size: 14px; font-weight: 700; display: flex; align-items: center; justify-content: center; gap: 6px; cursor: pointer;">
                      <span class="material-icons" style="font-size: 18px;">check</span>
                      Listo
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Color Picker and Area Badge -->
            <div id="color-picker-row" style="display: none; margin-top: 16px; padding: 12px 20px; background: white; border-radius: 12px; border: 1px solid var(--m3-outline-variant); align-items: center; gap: 16px; flex-wrap: wrap;">
              <span style="font-size: 13px; font-weight: 700; color: var(--m3-on-surface); font-family: 'Work Sans', sans-serif; display: flex; align-items: center; gap: 6px;">
                <span class="material-icons" style="font-size: 18px;">palette</span> Color:
              </span>
              <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                <button type="button" class="poly-color-btn" data-color="#2d3e2c" data-label="Verde" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #2d3e2c; background: #2d3e2c; cursor: pointer; transition: all 0.2s; box-shadow: 0 0 0 2px white, 0 0 0 4px #2d3e2c;" title="Verde"></button>
                <button type="button" class="poly-color-btn" data-color="#1976d2" data-label="Azul" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #1976d2; background: #1976d2; cursor: pointer; transition: all 0.2s;" title="Azul"></button>
                <button type="button" class="poly-color-btn" data-color="#f57c00" data-label="Naranja" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #f57c00; background: #f57c00; cursor: pointer; transition: all 0.2s;" title="Naranja"></button>
                <button type="button" class="poly-color-btn" data-color="#ff4103" data-label="Rojo" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #ff4103; background: #ff4103; cursor: pointer; transition: all 0.2s;" title="Rojo"></button>
                <button type="button" class="poly-color-btn" data-color="#7b1fa2" data-label="Púrpura" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #7b1fa2; background: #7b1fa2; cursor: pointer; transition: all 0.2s;" title="Púrpura"></button>
                <button type="button" class="poly-color-btn" data-color="#00796b" data-label="Teal" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #00796b; background: #00796b; cursor: pointer; transition: all 0.2s;" title="Teal"></button>
                <button type="button" class="poly-color-btn" data-color="#c2185b" data-label="Rosa" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #c2185b; background: #c2185b; cursor: pointer; transition: all 0.2s;" title="Rosa"></button>
                <button type="button" class="poly-color-btn" data-color="#303f9f" data-label="Índigo" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #303f9f; background: #303f9f; cursor: pointer; transition: all 0.2s;" title="Índigo"></button>
                <button type="button" class="poly-color-btn" data-color="#ff8f00" data-label="Ámbar" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #ff8f00; background: #ff8f00; cursor: pointer; transition: all 0.2s;" title="Ámbar"></button>
                <button type="button" class="poly-color-btn" data-color="#4e342e" data-label="Café" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #4e342e; background: #4e342e; cursor: pointer; transition: all 0.2s;" title="Café"></button>
              </div>
            </div>

            <div id="area-info-badge" style="display: none; margin-top: 12px; padding: 16px 24px; background: #ffffff; border-radius: 12px; align-items: center; justify-content: space-between; border: 1px solid rgba(0,0,0,0.08); box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span class="material-icons" style="color: #2d3e2c; font-size: 28px;">check_circle</span>
                <div>
                  <p style="font-size: 12px; font-weight: 700; color: #2d3e2c; text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">Área Calculada</p>
                  <p id="area-calculated-text" style="font-size: 22px; font-weight: 800; color: #2d3e2c; margin: 0; font-family: 'Work Sans', sans-serif;">0.00 ha</p>
                </div>
              </div>
              <button type="button" id="btn-clear-drawing" class="btn-m3-text" style="padding: 8px 16px; font-size: 12px;">
                <span class="material-icons" style="font-size: 18px; margin-right: 4px;">delete_outline</span>
                Limpiar
              </button>
            </div>
          </div>

          <div class="m3-form-actions">
            <button type="button" onclick="window.navigateTo('potreros')" class="btn-m3-text">
              Cancelar
            </button>
            <button type="submit" class="btn-m3-primary">
              <span class="material-icons">save</span>
              ${btnLabel}
            </button>
          </div>
        </form>
      </div>
    </div>
    <style>
      .mapa-pop {
        font-family: 'Work Sans', sans-serif;
        width: 260px;
      }
      .mapa-pop-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      .mapa-pop-title {
        margin: 0;
        color: #2d3e2c;
        font-size: 15px;
        font-weight: 800;
      }
      .mapa-pop-badge {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        padding: 3px 10px;
        border-radius: 20px;
        background: #2d3e2c;
        color: #fff;
        font-size: 11px;
        font-weight: 700;
        white-space: nowrap;
      }
      .mapa-pop-stats {
        display: flex;
        gap: 14px;
        font-size: 12px;
        color: #666;
        margin-bottom: 8px;
      }
      .mapa-pop-stats span {
        display: inline-flex;
        align-items: center;
        gap: 4px;
      }
      .mapa-pop-sec {
        background: #f4f6f2;
        border-radius: 10px;
        padding: 8px 10px;
        margin-bottom: 8px;
      }
      .mapa-pop-sec-t {
        display: block;
        font-size: 11px;
        font-weight: 700;
        color: #7a8a76;
        text-transform: uppercase;
        letter-spacing: 0.3px;
        margin-bottom: 4px;
      }
      .mapa-pop-row {
        display: flex;
        align-items: center;
        gap: 7px;
        font-size: 12px;
        color: #333;
        padding: 2px 0;
      }
      .mapa-pop-row b {
        font-weight: 700;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mapa-pop-empty {
        font-size: 12px;
        color: #999;
        font-style: italic;
      }
      .mapa-pop-btn {
        display: block;
        width: 100%;
        margin-top: 4px;
        padding: 9px 12px;
        border: none;
        border-radius: 10px;
        background: #2d3e2c;
        color: #fff;
        font-weight: 700;
        font-size: 12px;
        cursor: pointer;
        font-family: 'Work Sans', sans-serif;
      }
      .mapa-pop-btn:hover {
        background: #3d5240;
      }
    </style>
  `;
}

async function loadExistingPotreros() {
  try {
    const potrerosRes = await supabase.from('potreros').select('*');
    if (potrerosRes.error || !potrerosRes.data) return [];

    const editingId = window.__currentPotreroData?.id;

    return potrerosRes.data
      .filter(p => p.coordenadas_json != null && p.id !== editingId);
  } catch (err) {
    console.error('Error loading potreros:', err);
    return [];
  }
}

function buildExistingPotreroPopupHtml(potrero) {
  const statusLabel = {
    libre: 'Libre',
    ocupado: 'Ocupado',
    pastoreo: 'Ocupado',
    recuperando: 'En descanso',
    descanso: 'En descanso'
  }[potrero.status] || 'Libre';

  return `
    <div class="mapa-pop">
      <div class="mapa-pop-head">
        <span class="mapa-pop-title">${potrero.nombre || 'Potrero'}</span>
        <span class="mapa-pop-badge">${potrero.pasto || 'Natural'}</span>
      </div>
      <div class="mapa-pop-stats">
        <span><img src="area.png" alt="">${potrero.area ? parseFloat(potrero.area).toFixed(2) : '0.00'} ha</span>
        <span><img src="vaca.png" alt="">${potrero.capacidad || 0} cabezas</span>
      </div>
      <div class="mapa-pop-sec">
        <span class="mapa-pop-sec-t">Semilla / Pasto</span>
        <div class="mapa-pop-row"><b>${potrero.pasto || 'Natural'}</b></div>
        <div class="mapa-pop-row"><b style="color:#666;font-weight:500;">${statusLabel}</b></div>
      </div>
      <button class="mapa-pop-btn" onclick="window.navigateTo('detalle_potrero','${potrero.id}')">Ver detalle completo</button>
    </div>
  `;
}

function initMap() {
  const mapEl = document.getElementById('lote-map');
  if (!mapEl || mapInstance) return;

  // Default to Honduras coffee region center
  mapInstance = L.map('lote-map', {
    center: [14.5, -88.5],
    zoom: 9,
    maxZoom: 22,
    zoomControl: false,
    attributionControl: false
  });

  // Centro inicial y marcador del punto de referencia de la finca (si existe)
  loadPuntoReferencia(window._currentEmpresaId).then(ref => {
    if (ref && mapInstance) {
      const nombre = escapeHtml(ref.nombre || 'Finca');
      if (refMarker && mapInstance.hasLayer(refMarker)) {
        mapInstance.removeLayer(refMarker);
      }
      refMarker = L.marker([ref.lat, ref.lng], {
        icon: L.divIcon({
          className: 'ref-label-icon',
          html: `<div style="display:flex; flex-direction:column; align-items:center; cursor:pointer;">
                   <span class="material-icons" style="font-size:36px; color:#e53935; text-shadow:0 0 3px #fff, 0 0 6px #fff; line-height:1;">place</span>
                   <span style="font-family:'Work Sans',sans-serif; font-size:11px; font-weight:800; color:#ffffff; background:#e53935; padding:2px 8px; border-radius:10px; box-shadow:0 2px 6px rgba(0,0,0,0.3); white-space:nowrap; margin-top:-4px;">📍 ${nombre}</span>
                 </div>`,
          iconSize: [120, 52],
          iconAnchor: [60, 36]
        }),
        interactive: true,
        zIndexOffset: 1000
      }).addTo(mapInstance);

      refMarker.bindPopup(`
        <div style="font-family:'Work Sans',sans-serif; padding:4px;">
          <div style="font-weight:800; font-size:13px; color:#e53935;">📍 Punto de Referencia de la Finca</div>
          <div style="font-size:12px; color:#333; margin-top:2px;"><b>${nombre}</b></div>
          <div style="font-size:11px; color:#777; margin-top:2px;">${ref.lat.toFixed(6)}, ${ref.lng.toFixed(6)}</div>
        </div>
      `);

      if (!window.__currentPotreroData?.coordenadas_json) {
        mapInstance.setView([ref.lat, ref.lng], 15);
      }
    }
  }).catch(() => {});

  // ── Capas satelitales especializadas para fincas (Default: Google Earth) ──
  const esriSatLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 22,
    maxNativeZoom: 17
  });

  const googleSatLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    attribution: 'Imagery &copy; Google',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    maxZoom: 22,
    maxNativeZoom: 20
  }).addTo(mapInstance);

  const googleHybridLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    attribution: 'Imagery &copy; Google',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    maxZoom: 22,
    maxNativeZoom: 20
  });

  // Store layers for toggling
  mapInstance._layersConfig = {
    esriSat: esriSatLayer,
    googleSat: googleSatLayer,
    googleHybrid: googleHybridLayer
  };

  // Track which base layer is active (0=Google Earth, 1=Google Híbrido, 2=Esri Sat.)
  let layerMode = 0;

  // ── Tile error handler: show warning when tiles fail ──
  mapInstance.on('tileerror', function(e) {
    console.warn('Tile failed to load:', e.tile.src);
  });

  // Search control - Material 3 Expressive (places + coordinates + plus codes)
  function extractPlusCode(query) {
    const match = query.match(/([23456789CFGHJMPQRVWXcfghjmpqrvwx]+\+[23456789CFGHJMPQRVWXcfghjmpqrvwx]+)/);
    return match ? { code: match[1].toUpperCase(), raw: match[1] } : null;
  }

  function geocodeLocality(locality) {
    const parts = locality.split(',').map(p => p.trim()).filter(Boolean);
    const candidates = [locality];
    for (let i = 1; i < parts.length; i++) {
      candidates.push(parts.slice(i).join(', '));
    }
    return new Promise((resolve) => {
      const tryGeocode = (idx) => {
        if (idx >= candidates.length) {
          geocodeXYZ(locality).then(fb => resolve(fb && fb.length ? fb[0].center : null));
          return;
        }
        const q = candidates[idx];
        L.Control.Geocoder.nominatim({
          serviceUrl: 'https://nominatim.openstreetmap.org/',
          params: { countrycodes: 'hn', limit: 1 }
        }).geocode(q, (results) => {
          if (results && results.length && results[0].center) {
            resolve(results[0].center);
          } else {
            tryGeocode(idx + 1);
          }
        });
      };
      tryGeocode(0);
    });
  }

  async function plusCodeResult(query) {
    if (typeof OpenLocationCode === 'undefined') return null;
    const pc = extractPlusCode(query);
    if (!pc) return null;
    try {
      let full;
      if (OpenLocationCode.isShort(pc.code)) {
        const locality = query.replace(pc.raw, '').replace(/^[\s,.\-]+|[\s,.\-]+$/g, '').trim();
        let ref = null;
        if (locality) ref = await geocodeLocality(locality);
        if (!ref) {
          const c = mapInstance.getCenter();
          ref = c;
        }
        full = OpenLocationCode.recoverNearest(pc.code, ref.lat, ref.lng);
      } else {
        full = pc.code;
      }
      if (!OpenLocationCode.isFull(full)) return null;
      const d = OpenLocationCode.decode(full);
      const center = L.latLng(d.latitudeCenter, d.longitudeCenter);
      const bbox = L.latLngBounds(
        L.latLng(d.latitudeLo, d.longitudeLo),
        L.latLng(d.latitudeHi, d.longitudeHi)
      );
      return { name: 'Plus Code: ' + pc.code, center: center, bbox: bbox };
    } catch (e) {
      return null;
    }
  }

  // Fallback geocoder (geocode.xyz) - finds places OSM/Nominatim doesn't have
  const geoCache = new Map();
  function geocodeXYZ(query) {
    if (geoCache.has(query)) return Promise.resolve(geoCache.get(query));
    return fetch('https://geocode.xyz/' + encodeURIComponent(query) + '?json=1')
      .then(r => r.json())
      .then(data => {
        const lat = parseFloat(data?.latt);
        const lng = parseFloat(data?.longt);
        let results = [];
        if (data && !data.error && Number.isFinite(lat) && Number.isFinite(lng)) {
          const std = data.standard || {};
          const name = [std.city, std.prov, std.countryname].filter(Boolean).join(', ') || query;
          const center = L.latLng(lat, lng);
          results = [{ name, center, bbox: center.toBounds(20000) }];
        }
        geoCache.set(query, results);
        return results;
      })
      .catch(() => {
        geoCache.set(query, []);
        return [];
      });
  }

  const searchGeocoder = L.Control.Geocoder.latLng({
    next: L.Control.Geocoder.nominatim({
      serviceUrl: 'https://nominatim.openstreetmap.org/',
      params: {
        countrycodes: 'hn',
        limit: 8
      }
    })
  });

  function searchFor(query, cb, ctx, allowFallback) {
    const q = query.trim().toLowerCase();
    const local = loadSavedPoints()
      .filter(p => p.name && p.name.toLowerCase().includes(q))
      .map(p => ({
        name: p.name,
        center: L.latLng(p.lat, p.lng),
        bbox: L.latLng(p.lat, p.lng).toBounds(500),
        _savedPoint: p
      }));
    if (local.length) {
      cb.call(ctx, local);
      return;
    }
    const center = L.Control.Geocoder.parseLatLng(query);
    if (center) {
      cb.call(ctx, [{ name: query, center: center, bbox: center.toBounds(10000) }]);
      return;
    }
    if (extractPlusCode(query)) {
      plusCodeResult(query).then(res => {
        if (res) {
          cb.call(ctx, [res]);
        } else {
          runNominatim(query, cb, ctx, allowFallback);
        }
      });
      return;
    }
    runNominatim(query, cb, ctx, allowFallback);
  }

  function runNominatim(query, cb, ctx, allowFallback) {
    searchGeocoder.options.next.geocode(query, (results) => {
      if (results && results.length) {
        cb.call(ctx, results);
      } else if (allowFallback) {
        geocodeXYZ(query).then(fb => cb.call(ctx, fb && fb.length ? fb : []));
      } else {
        cb.call(ctx, []);
      }
    }, ctx);
  }

  searchGeocoder.geocode = function(query, cb, ctx) { searchFor(query, cb, ctx, true); };
  searchGeocoder.suggest = function(query, cb, ctx) { searchFor(query, cb, ctx, false); };

  let tempMarker = null;
  let currentMapSearchQuery = '';

  function focusSearchResult(gc) {
    if (!gc) return;
    if (gc.bbox) {
      const poly = L.polygon([
        gc.bbox.getSouthEast(), gc.bbox.getNorthEast(),
        gc.bbox.getNorthWest(), gc.bbox.getSouthWest()
      ]).addTo(mapInstance);
      mapInstance.fitBounds(poly.getBounds());
      setTimeout(() => mapInstance.removeLayer(poly), 3000);
    } else if (gc.center) {
      mapInstance.setView(gc.center, Math.max(mapInstance.getZoom(), 17));
    }

    if (!gc.center) return;
    if (tempMarker) mapInstance.removeLayer(tempMarker);
    const icon = L.divIcon({
      className: 'mapa-saved-icon',
      html: '<span class="material-icons" style="font-size:20px;color:#ffffff;line-height:36px;">place</span>',
      iconSize: [36, 36],
      iconAnchor: [18, 36]
    });
    tempMarker = L.marker(gc.center, { icon }).addTo(mapInstance);

    if (gc._savedPoint) return;

    const defaultName = gc.name || ('Punto ' + (gc.center ? gc.center.lat.toFixed(5) + ', ' + gc.center.lng.toFixed(5) : ''));
    tempMarker.on('click', () => {
      showSaveBar(defaultName, (nombre) => {
        const pts = loadSavedPoints();
        pts.push({ name: nombre, lat: gc.center.lat, lng: gc.center.lng });
        localStorage.setItem(puntosKey, JSON.stringify(pts));
        addSavedMarker({ name: nombre, lat: gc.center.lat, lng: gc.center.lng });
        if (tempMarker) { mapInstance.removeLayer(tempMarker); tempMarker = null; }
      });
    });
  }

  initM3FullScreenSearch({
    moduleKey: 'potrero_map',
    toggleId: 'potrero-map-search-toggle',
    inputId: 'potrero-map-search-input',
    clearId: 'potrero-map-search-clear',
    placeholder: 'Buscar lugar, potrero o coordenadas...',
    ariaLabel: 'Búsqueda de lugar o potrero en mapa',
    suggestedTitle: 'Lugares y potreros sugeridos',
    emptyLabel: 'lugares',
    getQuery: () => currentMapSearchQuery,
    setQuery: (v) => { currentMapSearchQuery = (v || '').trim(); },
    onApplySearch: (v) => {
      const q = (v || '').trim();
      if (!q) return;
      searchGeocoder.geocode(q, (results) => {
        if (results && results.length > 0) {
          focusSearchResult(results[0]);
        } else {
          window.Snackbar?.show('No se encontró el lugar. Intenta con coordenadas o Plus Code (ej. 3RPC+5C)', { duration: 3000 });
        }
      });
    },
    loadItems: async () => {
      const items = [];
      if (refMarker) {
        const ll = refMarker.getLatLng();
        items.push({ id: 'ref-finca', kind: 'Finca', name: 'Punto de referencia de la finca', lat: ll.lat, lng: ll.lng, icon: 'home_pin' });
      }
      loadSavedPoints().forEach((p, idx) => {
        items.push({ id: `saved-${idx}`, kind: 'Guardado', name: p.name, lat: p.lat, lng: p.lng, icon: 'bookmark' });
      });
      if (existingPotrerosLayer) {
        existingPotrerosLayer.eachLayer(l => {
          if (l.getBounds) {
            const c = l.getBounds().getCenter();
            const tt = l.getTooltip()?.getContent?.() || '';
            const cleanName = String(tt).replace(/<[^>]+>/g, '').replace('🌿 Potrero:', '').trim();
            if (cleanName) {
              items.push({ id: `pot-${items.length}`, kind: 'Potrero', name: cleanName, lat: c.lat, lng: c.lng, icon: 'landscape' });
            }
          }
        });
      }
      return items;
    },
    getQuickChips: () => [
      { label: 'Mi finca', type: 'query', value: 'finca', icon: 'home_pin' },
      { label: 'Guardados', type: 'query', value: 'guardado', icon: 'bookmark' },
      { label: 'Potreros', type: 'query', value: 'potrero', icon: 'landscape' }
    ],
    filterItems: (items, qLower) => items.filter(it =>
      (it.name || '').toLowerCase().includes(qLower) ||
      (it.kind || '').toLowerCase().includes(qLower)
    ),
    renderItem: (it) => `
      <div class="m3-search-item m3-contained-item" data-lat="${it.lat}" data-lng="${it.lng}" role="option" tabindex="0" style="cursor: pointer;">
        <span class="material-icons m3-search-item-leading">${it.icon || 'place'}</span>
        <div class="m3-search-item-body">
          <div style="font-size: 11px; font-weight: 700; color: var(--m3-primary); text-transform: uppercase;">${escapeSearchHtml(it.kind)}</div>
          <span class="m3-search-item-title">${escapeSearchHtml(it.name)}</span>
        </div>
      </div>
    `,
    itemSelector: '.m3-search-item[data-lat]',
    getItemTitle: (el) => el.querySelector('.m3-search-item-title')?.textContent?.trim() || '',
    onItemClick: (el) => {
      const lat = parseFloat(el.dataset.lat);
      const lng = parseFloat(el.dataset.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        mapInstance.setView([lat, lng], 18);
      }
    }
  });
  const mapFsOverlay = document.getElementById('potrero_map-fullscreen-search');
  if (mapFsOverlay) mapFsOverlay.style.zIndex = '100018';

  function showSaveBar(currentName, onSave, onDelete) {
    let saveBar = document.getElementById('temp-save-bar');
    const mapWrap = document.getElementById('lote-map-container');
    if (!saveBar) {
      saveBar = document.createElement('div');
      saveBar.id = 'temp-save-bar';
      saveBar.className = 'temp-save-bar';
      saveBar.innerHTML = `
        <input type="text" id="temp-marker-name" placeholder="Nombre del punto">
        <button id="temp-del-btn" style="display:none;padding:8px 14px;border:none;border-radius:10px;background:#c62828;color:#fff;font-weight:700;font-size:12px;cursor:pointer;font-family:'Work Sans',sans-serif;white-space:nowrap;">Eliminar</button>
        <button id="temp-save-btn">Guardar</button>
      `;
      if (mapWrap) mapWrap.appendChild(saveBar);
      saveBar.querySelector('#temp-save-btn').addEventListener('click', () => {
        const input = saveBar.querySelector('#temp-marker-name');
        const nombre = (input && input.value.trim()) || 'Punto';
        if (typeof saveBar._onSave === 'function') saveBar._onSave(nombre);
        saveBar.style.display = 'none';
      });
      saveBar.querySelector('#temp-del-btn').addEventListener('click', () => {
        if (typeof saveBar._onDelete === 'function') saveBar._onDelete();
        saveBar.style.display = 'none';
      });
    }
    const input = saveBar.querySelector('#temp-marker-name');
    input.value = currentName;
    saveBar._onSave = onSave;
    saveBar._onDelete = onDelete || null;
    const delBtn = saveBar.querySelector('#temp-del-btn');
    delBtn.style.display = onDelete ? 'inline-block' : 'none';
    saveBar.style.display = 'flex';
    input.focus();
    input.select();
  }

  // Attribution in Google Earth style
  L.control.attribution({
    position: 'bottomleft',
    prefix: false
  }).addTo(mapInstance).addAttribution('Geocoding &copy; Geocode.XYZ');

  // FeatureGroup for drawn items
  drawnItems = new L.FeatureGroup();
  mapInstance.addLayer(drawnItems);

  // Existing potreros layer
  existingPotrerosLayer = new L.FeatureGroup();
  mapInstance.addLayer(existingPotrerosLayer);

  // ── Puntos guardados (persistentes por empresa) ──
  const puntosKey = 'finca_puntos_guardados_' + (window._currentEmpresaId || 'default');

  function loadSavedPoints() {
    try {
      return JSON.parse(localStorage.getItem(puntosKey)) || [];
    } catch {
      return [];
    }
  }

  function renameSavedPoint(lat, lng, name) {
    const pts = loadSavedPoints();
    const p = pts.find(x => x.lat === lat && x.lng === lng);
    if (p) {
      p.name = name;
      localStorage.setItem(puntosKey, JSON.stringify(pts));
    }
  }

  function removeSavedPoint(lat, lng) {
    const pts = loadSavedPoints();
    const idx = pts.findIndex(x => x.lat === lat && x.lng === lng);
    if (idx >= 0) pts.splice(idx, 1);
    localStorage.setItem(puntosKey, JSON.stringify(pts));
  }

  const savedPointsGroup = L.featureGroup().addTo(mapInstance);

  function savedMarkerIcon(p) {
    return L.divIcon({
      className: 'mapa-saved-icon-wrap',
      html: `
        <div class="mapa-saved-icon">
          <span class="material-icons" style="font-size:20px;color:#ffffff;line-height:36px;">place</span>
        </div>
        <div class="mapa-saved-label">${p.name || 'Punto'}</div>
      `,
      iconSize: [190, 44],
      iconAnchor: [18, 44]
    });
  }

  function addSavedMarker(p) {
    const m = L.marker([p.lat, p.lng], { icon: savedMarkerIcon(p) }).addTo(savedPointsGroup);
    m.on('click', () => {
      showSaveBar(p.name || 'Punto', (nombre) => {
        renameSavedPoint(p.lat, p.lng, nombre);
        p.name = nombre;
        m.setIcon(savedMarkerIcon(p));
      }, () => {
        removeSavedPoint(p.lat, p.lng);
        savedPointsGroup.removeLayer(m);
      });
    });
  }

  loadSavedPoints().forEach(p => addSavedMarker(p));

  // ── Spanish localization for Leaflet.draw ──
  if (L.drawLocal) {
    L.drawLocal.draw.toolbar.buttons.polygon = 'Dibujar polígono';
    L.drawLocal.draw.toolbar.undo.title = 'Deshacer último punto';
    L.drawLocal.draw.toolbar.undo.text = 'Deshacer';
    L.drawLocal.draw.toolbar.actions.text = 'Cancelar';
    L.drawLocal.draw.toolbar.actions.title = 'Cancelar dibujo';
    L.drawLocal.draw.toolbar.finish.text = 'Finalizar';
    L.drawLocal.draw.toolbar.finish.title = 'Finalizar dibujo';
    L.drawLocal.draw.handlers.polygon.tooltip.start = 'Haz clic para empezar a dibujar';
    L.drawLocal.draw.handlers.polygon.tooltip.cont = 'Haz clic para continuar dibujando';
    L.drawLocal.draw.handlers.polygon.tooltip.end = 'Haz clic en el primer punto para cerrar';
    L.drawLocal.edit.toolbar.actions.save.text = 'Guardar cambios';
    L.drawLocal.edit.toolbar.actions.save.title = 'Guardar cambios';
    L.drawLocal.edit.toolbar.actions.cancel.text = 'Cancelar';
    L.drawLocal.edit.toolbar.actions.cancel.title = 'Cancelar edición';
    L.drawLocal.edit.toolbar.actions.clearAll.text = 'Eliminar todo';
    L.drawLocal.edit.toolbar.actions.clearAll.title = 'Eliminar todas las capas';
    L.drawLocal.edit.toolbar.buttons.edit = 'Editar capas';
    L.drawLocal.edit.toolbar.buttons.editDisabled = 'Sin capas para editar';
    L.drawLocal.edit.toolbar.buttons.remove = 'Eliminar capas';
    L.drawLocal.edit.toolbar.buttons.removeDisabled = 'Sin capas para eliminar';
    L.drawLocal.edit.handlers.edit.tooltip.text = 'Arrastra los puntos para editar';
    L.drawLocal.edit.handlers.remove.tooltip.text = 'Haz clic en una capa para eliminar';
  }

  // ── Color Picker Logic ──
  selectedColor = '#2d3e2c';

  function applyColorToPolygon(layer, color) {
    const existingGlow = layer._glowPolygon;
    if (existingGlow && mapInstance.hasLayer(existingGlow)) {
      mapInstance.removeLayer(existingGlow);
    }

    layer.setStyle({
      color: '#ffffff',
      fillColor: color,
      fillOpacity: 0.5,
      weight: 2
    });

    const latlngs = layer.getLatLngs();
    if (latlngs && latlngs[0] && latlngs[0].length > 2) {
      const glow = L.polygon(latlngs, {
        color: color,
        fillColor: color,
        fillOpacity: 0.5,
        weight: 6,
        opacity: 0.7
      });
      glow._isGlow = true;
      layer._glowPolygon = glow;
      mapInstance.addLayer(glow);
      updateMiniPreviewMap(latlngs[0], color);
    }
  }

  function initColorPicker() {
    const btns = document.querySelectorAll('.poly-color-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        selectedColor = color;
        btns.forEach(b => b.style.boxShadow = 'none');
        btn.style.boxShadow = `0 0 0 2px white, 0 0 0 4px ${color}`;
        if (drawnItems && drawnItems.getLayers().length > 0) {
          const layer = drawnItems.getLayers()[0];
          applyColorToPolygon(layer, color);
        }
      });
    });
  }

  // Draw control removed in favor of Google Earth style bottom measure bar
  drawControl = null;

  // ── Walking / GPS Recording Control ──
  createWalkControl();

  // ── Toolbar toggle & Google Earth style live drawing HUD ──
  let toolActive = false;
  mapInstance.on('draw:drawstart', () => {
    toolActive = true;
    const hud = document.getElementById('draw-live-hud');
    if (hud) {
      hud.textContent = 'Agregar primer punto';
      hud.style.display = 'block';
    }
  });
  mapInstance.on('draw:editstart', () => { toolActive = true; });
  mapInstance.on('draw:drawstop draw:editstop', () => {
    toolActive = false;
    const hud = document.getElementById('draw-live-hud');
    if (hud) hud.style.display = 'none';
  });

  setTimeout(() => {
    document.querySelectorAll('.leaflet-draw-toolbar a').forEach(btn => {
      btn.addEventListener('click', function(e) {
        if (!toolActive) return;
        e.stopImmediatePropagation();
        e.preventDefault();

        const drawTb = drawControl?._toolbars?.draw;
        const editTb = drawControl?._toolbars?.edit;

        if (drawTb?._activeHandler) {
          drawTb._activeHandler.disable();
          drawTb._deactivate();
        } else if (editTb?._activeHandler) {
          editTb._activeHandler.disable();
          editTb._deactivate();
        }

        const actions = document.querySelector('.leaflet-draw-actions');
        if (actions) actions.style.display = 'none';

        toolActive = false;
      }, true);
    });
  }, 500);

  // Remove ghost shape when editing starts (Leaflet.draw creates _originalShape)
  mapInstance.on('draw:editstart', function() {
    setTimeout(() => {
      const overlayPane = document.querySelector('.leaflet-overlay-pane');
      if (overlayPane) {
        const paths = overlayPane.querySelectorAll('path[stroke-dasharray]');
        paths.forEach(p => { p.style.display = 'none'; });
      }
    }, 50);
  });

  // On polygon created
  mapInstance.on(L.Draw.Event.CREATED, function (e) {
    const layer = e.layer;
    drawnItems.clearLayers();
    drawnItems.addLayer(layer);
    applyColorToPolygon(layer, selectedColor);
    calculateArea(layer);
    const row = document.getElementById('color-picker-row');
    if (row) row.style.display = 'flex';
    initColorPicker();
  });

  // On polygon edited
  mapInstance.on(L.Draw.Event.EDITED, function (e) {
    const layers = e.layers;
    layers.eachLayer(function (layer) {
      calculateArea(layer);
    });
  });

  // On polygon deleted
  mapInstance.on(L.Draw.Event.DELETED, function (e) {
    if (drawnItems.getLayers().length === 0) {
      clearAreaDisplay();
      const row = document.getElementById('color-picker-row');
      if (row) row.style.display = 'none';
    }
    mapInstance.eachLayer(l => {
      if (l._isGlow && !drawnItems.hasLayer(l)) {
        mapInstance.removeLayer(l);
      }
    });
  });

  // Mouse move - update coordinates display
  mapInstance.on('mousemove', function(e) {
    const lat = e.latlng.lat;
    const lng = e.latlng.lng;
    const coordsText = document.getElementById('coords-text');
    if (coordsText) {
      coordsText.textContent = `${lat.toFixed(6)}°N ${Math.abs(lng).toFixed(6)}°W`;
    }
  });

  // Update scale bar
  mapInstance.on('zoomend', function() {
    updateScaleBar();
  });

  // Load existing potreros (excludes current editing potrero)
  loadExistingPotreros().then(potreros => {
    existingPotrerosLayer.clearLayers();

    potreros.forEach(potrero => {
      if (potrero.coordenadas_json) {
        const { coordinates, color } = parseCoordenadasJson(potrero.coordenadas_json);
        if (!coordinates || coordinates.length < 3) return;
        const latlngs = coordinates.map(c => [c.lat, c.lng]);
        const potreroColor = color || '#2d3e2c';

        const poly = L.polygon(latlngs, {
          color: potreroColor,
          fillColor: potreroColor,
          fillOpacity: 0.22,
          weight: 2.5,
          opacity: 0.9,
          dashArray: '6, 6',
          lineJoin: 'round',
          lineCap: 'round'
        }).addTo(existingPotrerosLayer);

        poly.bindTooltip(`🌿 Potrero: <b>${escapeHtml(potrero.nombre || 'Potrero')}</b> (${parseFloat(potrero.area || 0).toFixed(2)} ha)`, {
          permanent: false,
          sticky: true,
          className: 'lote-ref-tooltip'
        });

        poly.bindPopup(buildExistingPotreroPopupHtml(potrero));
      }
    });

    if (!window.__currentPotreroData?.coordenadas_json && existingPotrerosLayer.getLayers().length > 0 && !refMarker) {
      try {
        mapInstance.fitBounds(existingPotrerosLayer.getBounds().pad(0.2));
      } catch {}
    }
  });

  // Clear button
  const clearBtn = document.getElementById('btn-clear-drawing');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      coordinatesCleared = true;
      if (drawnItems) {
        drawnItems.eachLayer(l => {
          if (l._glowPolygon && mapInstance.hasLayer(l._glowPolygon)) {
            mapInstance.removeLayer(l._glowPolygon);
          }
        });
      }
      drawnItems.clearLayers();
      clearAreaDisplay();
      const row = document.getElementById('color-picker-row');
      if (row) row.style.display = 'none';
    });
  }

  // Prevent map drag/click through overlay buttons
  const bottomActions = document.getElementById('map-bottom-actions');
  if (bottomActions && window.L?.DomEvent) {
    L.DomEvent.disableClickPropagation(bottomActions);
  }
  const searchToggle = document.getElementById('potrero-map-search-toggle');
  if (searchToggle && window.L?.DomEvent) {
    L.DomEvent.disableClickPropagation(searchToggle);
  }

  // Locate button
  const locateBtn = document.getElementById('btn-locate');
  if (locateBtn) {
    let userMarker = null;
    locateBtn.addEventListener('click', () => {
      if (!navigator.geolocation) {
        window.Snackbar?.show('Tu navegador no soporta geolocalización', 'error');
        return;
      }
      locateBtn.disabled = true;
      window.Snackbar?.show('Buscando ubicación...', { type: 'info', duration: 2000 });
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          locateBtn.disabled = false;
          const latlng = [pos.coords.latitude, pos.coords.longitude];
          if (userMarker) mapInstance.removeLayer(userMarker);
          userMarker = L.circleMarker(latlng, {
            radius: 10,
            color: '#fff',
            fillColor: '#4285f4',
            fillOpacity: 1,
            weight: 3
          }).addTo(mapInstance).bindPopup('Tu ubicación actual');
          mapInstance.setView(latlng, 17, { animate: true });
        },
        (err) => {
          locateBtn.disabled = false;
          const msg = err.code === 1
            ? 'Permiso de ubicación denegado — actívalo en la configuración del navegador'
            : 'No se pudo obtener tu ubicación: ' + (err.message || err.code);
          window.Snackbar?.show(msg, { type: 'error', duration: 5000 });
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 30000 }
      );
    });
  }

  // Layers toggle: 0 = Google Earth, 1 = Google Híbrido, 2 = Esri Sat.
  const btnLayers = document.getElementById('btn-toggle-layers');
  if (btnLayers) {
    btnLayers.title = 'Capa: Google Earth';
    btnLayers.addEventListener('click', () => {
      layerMode = (layerMode + 1) % 3;
      mapInstance.removeLayer(googleSatLayer);
      mapInstance.removeLayer(googleHybridLayer);
      mapInstance.removeLayer(esriSatLayer);
      btnLayers.style.background = '#141614';
      btnLayers.style.color = '#ffffff';
      if (layerMode === 0) {
        mapInstance.addLayer(googleSatLayer);
        btnLayers.title = 'Capa: Google Earth';
        window.Snackbar?.show('Capa: Google Earth', { duration: 1500 });
      } else if (layerMode === 1) {
        mapInstance.addLayer(googleHybridLayer);
        btnLayers.title = 'Capa: Google Híbrido';
        window.Snackbar?.show('Capa: Google Híbrido', { duration: 1500 });
      } else {
        mapInstance.addLayer(esriSatLayer);
        btnLayers.title = 'Capa: Esri Satélite';
        window.Snackbar?.show('Capa: Esri Satélite', { duration: 1500 });
      }
      if (existingPotrerosLayer) existingPotrerosLayer.bringToFront();
      if (drawnItems) drawnItems.bringToFront();
    });
  }

  initEarthMeasureMode({ applyColorToPolygon, initColorPicker });
  updateScaleBar();

  // Try to restore walking session from localStorage
  setTimeout(() => {
    maybeRestoreWalkingSession();
  }, 500);
}

function updateScaleBar() {
  if (!mapInstance) return;
  const zoom = mapInstance.getZoom();
  const scaleText = document.getElementById('scale-text');

  const scales = {
    10: '4 km',
    11: '2 km',
    12: '1 km',
    13: '500 m',
    14: '200 m',
    15: '100 m',
    16: '50 m',
    17: '20 m',
    18: '10 m',
    19: '5 m'
  };

  if (scaleText) {
    scaleText.textContent = scales[zoom] || '100 m';
  }
}

function calculateArea(layer) {
  if (typeof turf === 'undefined') return;

  const latlngs = layer.getLatLngs()[0];
  const coordinates = latlngs.map(ll => [ll.lng, ll.lat]);
  coordinates.push(coordinates[0]);

  const polygon = turf.polygon([coordinates]);
  const areaSqMeters = turf.area(polygon);
  const areaHectares = areaSqMeters / 10000;

  const areaInput = document.getElementById('area-input');
  if (areaInput) {
    areaInput.value = areaHectares.toFixed(2);
    areaInput.removeAttribute('readonly');
  }

  const badge = document.getElementById('area-info-badge');
  const text = document.getElementById('area-calculated-text');
  if (badge && text) {
    badge.style.display = 'flex';
    text.textContent = areaHectares.toFixed(2) + ' ha';
  }

  const hint = document.getElementById('area-hint');
  if (hint) hint.style.display = 'none';

  const mapStatus = document.getElementById('map-open-status');
  if (mapStatus) mapStatus.textContent = `${areaHectares.toFixed(2)} ha · Toca para editar en el mapa`;

  coordinatesCleared = false;
  updateMiniPreviewMap(latlngs, selectedColor);
}

function updateMiniPreviewMap(latlngs, color = selectedColor) {
  const wrap = document.getElementById('lote-map-preview-wrap');
  const el = document.getElementById('lote-mini-preview-map');
  if (!wrap || !el || !latlngs || latlngs.length < 3) return;

  wrap.style.display = 'block';
  if (!miniPreviewMap) {
    miniPreviewMap = L.map('lote-mini-preview-map', {
      zoomControl: false,
      attributionControl: false,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false
    });
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      maxZoom: 22,
      maxNativeZoom: 20
    }).addTo(miniPreviewMap);
  }

  if (miniPreviewPoly && miniPreviewMap.hasLayer(miniPreviewPoly)) {
    miniPreviewMap.removeLayer(miniPreviewPoly);
  }
  miniPreviewPoly = L.polygon(latlngs, {
    color: '#ffffff',
    weight: 2.5,
    fillColor: color || '#2d3e2c',
    fillOpacity: 0.45
  }).addTo(miniPreviewMap);

  setTimeout(() => {
    if (!miniPreviewMap || !miniPreviewPoly) return;
    miniPreviewMap.invalidateSize();
    try {
      miniPreviewMap.fitBounds(miniPreviewPoly.getBounds(), { padding: [22, 22], maxZoom: 18 });
    } catch (e) {}
  }, 80);
}

function clearAreaDisplay() {
  const areaInput = document.getElementById('area-input');
  if (areaInput) {
    areaInput.value = '';
    areaInput.setAttribute('readonly', '');
  }

  const badge = document.getElementById('area-info-badge');
  if (badge) badge.style.display = 'none';

  const hint = document.getElementById('area-hint');
  if (hint) hint.style.display = 'block';

  const mapStatus = document.getElementById('map-open-status');
  if (mapStatus) mapStatus.textContent = 'Toca para marcar los puntos del potrero';

  const wrap = document.getElementById('lote-map-preview-wrap');
  if (wrap) wrap.style.display = 'none';
}

function initEarthMeasureMode({ applyColorToPolygon, initColorPicker } = {}) {
  if (!mapInstance) return;
  let measurePoints = [];
  const measureGroup = L.layerGroup().addTo(mapInstance);
  const measureGuideLine = L.polyline([], {
    color: '#ffffff',
    weight: 1.5,
    opacity: 0.9,
    interactive: false
  }).addTo(mapInstance);

  const sheet = document.getElementById('lote-map-sheet');
  const btnOpen = document.getElementById('btn-open-map-sheet');
  const btnClose = document.getElementById('btn-close-map-sheet');
  const btnAdd = document.getElementById('btn-earth-add-point');
  const btnUndo = document.getElementById('btn-earth-undo');
  const btnClear = document.getElementById('btn-earth-clear');
  const btnDone = document.getElementById('btn-earth-done');
  const pill = document.getElementById('earth-measure-pill');
  const stats = document.getElementById('earth-bar-stats');

  let isNearStart = false;
  let firstPointHalo = null;
  let isPolygonClosed = false;

  function updateCrosshairPreview() {
    if (!mapInstance || isPolygonClosed) return;
    const center = mapInstance.getCenter();
    if (measurePoints.length === 0) {
      isNearStart = false;
      if (firstPointHalo && mapInstance.hasLayer(firstPointHalo)) mapInstance.removeLayer(firstPointHalo);
      if (pill) pill.textContent = 'Ubica el 1er punto';
      if (btnAdd) btnAdd.innerHTML = '<span class="material-icons" style="font-size: 20px;">add</span> Agregar punto';
      measureGuideLine.setLatLngs([]);
      return;
    }
    const last = measurePoints[measurePoints.length - 1];
    isNearStart = false;
    if (measurePoints.length >= 3) {
      const pCenter = mapInstance.latLngToContainerPoint(center);
      const pFirst = mapInstance.latLngToContainerPoint(measurePoints[0]);
      if (pCenter.distanceTo(pFirst) <= 26) {
        isNearStart = true;
      }
    }

    if (isNearStart) {
      if (pill) pill.textContent = 'Cerrar la forma';
      if (btnAdd) btnAdd.innerHTML = '<span class="material-icons" style="font-size: 20px;">polyline</span> Cerrar la forma';
      measureGuideLine.setLatLngs([last, measurePoints[0]]);
      if (!firstPointHalo) {
        firstPointHalo = L.circleMarker(measurePoints[0], {
          radius: 16,
          color: '#fbbc04',
          weight: 2,
          fillColor: '#fbbc04',
          fillOpacity: 0.35,
          interactive: false
        });
      } else {
        firstPointHalo.setLatLng(measurePoints[0]);
      }
      if (!mapInstance.hasLayer(firstPointHalo)) firstPointHalo.addTo(mapInstance);
    } else {
      if (firstPointHalo && mapInstance.hasLayer(firstPointHalo)) mapInstance.removeLayer(firstPointHalo);
      const dist = mapInstance.distance(last, center);
      if (pill) pill.textContent = `${dist.toFixed(2)} m`;
      if (btnAdd) btnAdd.innerHTML = '<span class="material-icons" style="font-size: 20px;">add</span> Agregar punto';
      measureGuideLine.setLatLngs([last, center]);
    }
  }

  function redrawMeasurePoints() {
    measureGroup.clearLayers();
    if (measurePoints.length >= 2) {
      L.polyline(measurePoints, {
        color: '#fbbc04',
        weight: 3.5,
        opacity: 1,
        interactive: false
      }).addTo(measureGroup);
    }
    measurePoints.forEach(pt => {
      L.circleMarker(pt, {
        radius: 7,
        color: '#fbbc04',
        weight: 3,
        fillColor: '#ffffff',
        fillOpacity: 1,
        interactive: false
      }).addTo(measureGroup);
    });
    if (stats) {
      if (measurePoints.length >= 3 && typeof turf !== 'undefined') {
        const coords = measurePoints.map(p => [p.lng, p.lat]);
        coords.push(coords[0]);
        const ha = turf.area(turf.polygon([coords])) / 10000;
        stats.textContent = `${measurePoints.length} pts · ${ha.toFixed(2)} ha`;
      } else {
        stats.textContent = `${measurePoints.length} ${measurePoints.length === 1 ? 'punto' : 'puntos'}`;
      }
    }
    if (btnUndo) {
      btnUndo.disabled = measurePoints.length === 0;
      btnUndo.style.opacity = measurePoints.length === 0 ? '0.4' : '1';
    }
    if (isBarExpanded && !isPolygonClosed) {
      updateMetricsDisplay(measurePoints);
    }
    updateCrosshairPreview();
  }

  const crosshair = document.getElementById('earth-crosshair');
  const closedPreviewGroup = L.layerGroup().addTo(mapInstance);
  const measureBar = document.getElementById('earth-measure-bar');
  const sheetHandle = document.getElementById('earth-sheet-handle');
  const metricsBox = document.getElementById('earth-closed-metrics');
  const metricArea = document.getElementById('earth-metric-area');
  const metricPerim = document.getElementById('earth-metric-perim');
  let isBarExpanded = false;

  function updateMetricsDisplay(latlngs) {
    if (!latlngs || latlngs.length < 2) {
      if (metricArea) metricArea.textContent = '0.00 ha · 0 m²';
      if (metricPerim) metricPerim.textContent = '0.00 m';
      return;
    }
    let perim = 0;
    const count = latlngs.length;
    for (let i = 0; i < count; i++) {
      if (!isPolygonClosed && i === count - 1) break;
      perim += mapInstance.distance(latlngs[i], latlngs[(i + 1) % count]);
    }
    if (metricPerim) metricPerim.textContent = `${perim.toFixed(2)} m`;
    if (count >= 3 && typeof turf !== 'undefined') {
      const coords = latlngs.map(p => [p.lng, p.lat]);
      coords.push(coords[0]);
      const areaM2 = turf.area(turf.polygon([coords]));
      const areaHa = areaM2 / 10000;
      if (metricArea) metricArea.textContent = `${areaHa.toFixed(2)} ha · ${Math.round(areaM2).toLocaleString()} m²`;
    } else if (metricArea) {
      metricArea.textContent = 'Marca al menos 3 puntos';
    }
  }

  function setBarExpanded(expanded) {
    isBarExpanded = expanded;
    if (metricsBox) metricsBox.style.display = expanded ? 'flex' : 'none';
    if (measureBar) {
      measureBar.style.paddingBottom = expanded
        ? 'calc(22px + env(safe-area-inset-bottom))'
        : 'calc(16px + env(safe-area-inset-bottom))';
    }
    if (expanded) {
      const pts = isPolygonClosed && drawnItems?.getLayers().length > 0
        ? (drawnItems.getLayers()[0].getLatLngs?.()[0] || [])
        : measurePoints;
      updateMetricsDisplay(pts);
    }
    setTimeout(() => mapInstance?.invalidateSize(), 120);
  }

  if (sheetHandle && measureBar) {
    let dragStartY = null;
    sheetHandle.addEventListener('click', () => {
      setBarExpanded(!isBarExpanded);
    });
    measureBar.addEventListener('touchstart', (e) => {
      if (e.target.closest('button')) return;
      dragStartY = e.touches[0].clientY;
    }, { passive: true });
    measureBar.addEventListener('touchend', (e) => {
      if (dragStartY === null) return;
      const dy = e.changedTouches[0].clientY - dragStartY;
      dragStartY = null;
      if (dy < -25) setBarExpanded(true);
      else if (dy > 25) setBarExpanded(false);
    }, { passive: true });
    measureBar.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'touch' || e.target.closest('button')) return;
      dragStartY = e.clientY;
    });
    measureBar.addEventListener('pointerup', (e) => {
      if (e.pointerType === 'touch' || dragStartY === null) return;
      const dy = e.clientY - dragStartY;
      dragStartY = null;
      if (dy < -20) setBarExpanded(true);
      else if (dy > 20) setBarExpanded(false);
    });
  }

  function setClosedMode(closed, latlngs = null) {
    isPolygonClosed = closed;
    if (crosshair) crosshair.style.display = closed ? 'none' : 'flex';
    closedPreviewGroup.clearLayers();
    if (closed && latlngs && latlngs.length >= 3) {
      L.polygon(latlngs, {
        color: '#fbbc04',
        weight: 3.5,
        opacity: 1,
        fillColor: '#fbbc04',
        fillOpacity: 0.14,
        interactive: false
      }).addTo(closedPreviewGroup);
      latlngs.forEach(pt => {
        L.circleMarker(pt, {
          radius: 7,
          color: '#fbbc04',
          weight: 3,
          fillColor: '#ffffff',
          fillOpacity: 1,
          interactive: false
        }).addTo(closedPreviewGroup);
      });
    }
    if (closed) {
      if (firstPointHalo && mapInstance.hasLayer(firstPointHalo)) mapInstance.removeLayer(firstPointHalo);
      if (btnAdd) btnAdd.innerHTML = '<span class="material-icons" style="font-size: 19px;">bookmark_add</span> Guardar en el proyecto';
      if (btnDone) btnDone.style.display = 'none';
      if (latlngs && latlngs.length >= 3) {
        updateMetricsDisplay(latlngs);
      }
      setBarExpanded(true);
      if (stats) {
        const areaText = document.getElementById('area-calculated-text')?.textContent || '';
        stats.textContent = areaText ? `Polígono cerrado · ${areaText}` : 'Polígono cerrado';
      }
    } else {
      setBarExpanded(false);
      if (btnDone) btnDone.style.display = 'flex';
      if (btnAdd) btnAdd.innerHTML = '<span class="material-icons" style="font-size: 20px;">add</span> Agregar punto';
    }
  }

  function openMapSheet() {
    if (!sheet) return;
    sheet.style.visibility = 'visible';
    sheet.style.pointerEvents = 'auto';
    sheet.style.opacity = '1';
    setTimeout(() => {
      mapInstance?.invalidateSize();
      if (drawnItems && drawnItems.getLayers().length > 0 && measurePoints.length === 0) {
        try {
          const layer = drawnItems.getLayers()[0];
          const latlngs = layer.getLatLngs?.()[0] || [];
          setClosedMode(true, latlngs);
          mapInstance.fitBounds(drawnItems.getBounds(), { padding: [40, 40], maxZoom: 18 });
        } catch (e) {}
      } else {
        setClosedMode(false);
      }
      updateCrosshairPreview();
    }, 120);
  }

  function closeMapSheet() {
    if (!sheet) return;
    sheet.style.opacity = '0';
    sheet.style.pointerEvents = 'none';
    setTimeout(() => {
      sheet.style.visibility = 'hidden';
    }, 220);
  }

  mapInstance.on('move', updateCrosshairPreview);

  btnOpen?.addEventListener('click', openMapSheet);
  document.getElementById('lote-map-preview-wrap')?.addEventListener('click', openMapSheet);
  btnClose?.addEventListener('click', closeMapSheet);
  sheet?.addEventListener('click', (e) => {
    if (e.target === sheet) closeMapSheet();
  });

  function commitMeasuredPolygon(closeAfter = false) {
    if (measurePoints.length < 3) return false;
    const ptsCopy = [...measurePoints];
    const poly = L.polygon(ptsCopy, {
      color: '#ffffff',
      fillColor: selectedColor,
      fillOpacity: 0.5,
      weight: 2.5
    });
    drawnItems.clearLayers();
    drawnItems.addLayer(poly);
    applyColorToPolygon?.(poly, selectedColor);
    calculateArea(poly);
    coordinatesCleared = false;
    const row = document.getElementById('color-picker-row');
    if (row) row.style.display = 'flex';
    initColorPicker?.();
    measurePoints = [];
    redrawMeasurePoints();
    if (closeAfter) {
      setClosedMode(false);
      closeMapSheet();
    } else {
      setClosedMode(true, ptsCopy);
    }
    return true;
  }

  btnAdd?.addEventListener('click', () => {
    if (!mapInstance) return;
    if (isPolygonClosed) {
      closeMapSheet();
      return;
    }
    if (isNearStart && measurePoints.length >= 3) {
      commitMeasuredPolygon(false);
      return;
    }
    if (measurePoints.length === 0 && drawnItems && drawnItems.getLayers().length > 0) {
      drawnItems.eachLayer(l => {
        if (l._glowPolygon && mapInstance.hasLayer(l._glowPolygon)) {
          mapInstance.removeLayer(l._glowPolygon);
        }
      });
      drawnItems.clearLayers();
    }
    measurePoints.push(mapInstance.getCenter());
    redrawMeasurePoints();
  });

  btnUndo?.addEventListener('click', () => {
    if (isPolygonClosed) {
      setClosedMode(false);
    }
    if (measurePoints.length === 0) return;
    measurePoints.pop();
    redrawMeasurePoints();
  });

  btnClear?.addEventListener('click', () => {
    coordinatesCleared = true;
    measurePoints = [];
    setClosedMode(false);
    if (drawnItems) {
      drawnItems.eachLayer(l => {
        if (l._glowPolygon && mapInstance.hasLayer(l._glowPolygon)) {
          mapInstance.removeLayer(l._glowPolygon);
        }
      });
      drawnItems.clearLayers();
    }
    clearAreaDisplay();
    const row = document.getElementById('color-picker-row');
    if (row) row.style.display = 'none';
    redrawMeasurePoints();
  });

  btnDone?.addEventListener('click', () => {
    if (measurePoints.length >= 3) {
      commitMeasuredPolygon(false);
    } else if (measurePoints.length > 0) {
      window.Snackbar?.show('Marca al menos 3 puntos para cerrar el potrero', { duration: 2500 });
    } else if (drawnItems && drawnItems.getLayers().length > 0) {
      closeMapSheet();
    } else {
      window.Snackbar?.show('Agrega al menos 3 puntos en el mapa', { duration: 2500 });
    }
  });

  redrawMeasurePoints();
}

// ── Walking / GPS Recording ────────────────────────────────────

function createWalkControl() {
  const btn = document.getElementById('btn-walk-toggle');
  if (!btn) return;
  if (window.L?.DomEvent) {
    L.DomEvent.disableClickPropagation(btn);
  }
  btn.addEventListener('click', () => {
    if (walkState === 'idle') {
      startWalking();
    } else if (walkState === 'searching' || walkState === 'recording' || walkState === 'paused') {
      discardWalking();
    }
  });
}

function createWalkPanel() {
  if (walkPanel) return;
  const badge = document.getElementById('area-info-badge');
  if (!badge || !badge.parentNode) return;

  const panel = document.createElement('div');
  panel.id = 'walk-panel';
  panel.style.display = 'none';
  panel.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;">
      <div style="display:flex;align-items:center;gap:10px;">
        <span class="walk-status-dot idle" id="walk-status-dot"></span>
        <span id="walk-status-text" style="font-weight:600;font-size:14px;color:var(--m3-on-surface);">Listo</span>
      </div>
      <span id="walk-area-text" style="font-size:20px;font-weight:800;font-family:'Work Sans',sans-serif;color:var(--m3-on-surface);">0.00 ha</span>
    </div>
    <div id="walk-actions-row" style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
      <button id="btn-walk-pause" class="m3-walk-action-btn" style="display:none;background:var(--m3-surface-highest);color:var(--m3-on-surface);">
        <span class="material-icons" style="font-size:16px;">pause</span> Pausar
      </button>
      <button id="btn-walk-resume" class="m3-walk-action-btn" style="display:none;background:var(--m3-primary);color:white;">
        <span class="material-icons" style="font-size:16px;">play_arrow</span> Reanudar
      </button>
      <button id="btn-walk-stop" class="m3-walk-action-btn" style="display:none;background:var(--m3-primary);color:white;">
        <span class="material-icons" style="font-size:16px;">stop</span> Detener
      </button>
      <button id="btn-walk-add-point" class="m3-walk-action-btn" style="display:none;background:var(--m3-primary);color:white;">
        <span class="material-icons" style="font-size:16px;">add_location</span> Punto
      </button>
      <button id="btn-walk-discard" class="m3-walk-action-btn" style="background:transparent;border:1px solid var(--m3-outline);color:var(--m3-on-surface-variant);">
        <span class="material-icons" style="font-size:16px;">delete</span> Descartar
      </button>
    </div>
    <div style="font-size:12px;color:var(--m3-on-surface-variant);margin-top:8px;">
      Puntos: <span id="walk-points-count">0</span>
      <span id="walk-accuracy-display" style="margin-left:16px;">Señal: ±<span id="walk-accuracy-value">--</span>m</span>
    </div>
  `;
  badge.parentNode.insertBefore(panel, badge);
  walkPanel = panel;

  setTimeout(() => {
    document.getElementById('btn-walk-pause')?.addEventListener('click', pauseWalking);
    document.getElementById('btn-walk-resume')?.addEventListener('click', resumeWalking);
    document.getElementById('btn-walk-stop')?.addEventListener('click', stopWalking);
    document.getElementById('btn-walk-add-point')?.addEventListener('click', addManualPoint);
    document.getElementById('btn-walk-discard')?.addEventListener('click', discardWalking);
  }, 100);
}

function showWalkPanel(state) {
  if (!walkPanel) createWalkPanel();
  walkPanel.style.display = 'block';
  updateWalkPanelUI(state);
}

function hideWalkPanel() {
  if (walkPanel) walkPanel.style.display = 'none';
}

function updateWalkPanelUI(state) {
  const s = state || walkState;
  const dot = document.getElementById('walk-status-dot');
  const text = document.getElementById('walk-status-text');
  const areaText = document.getElementById('walk-area-text');
  const pauseBtn = document.getElementById('btn-walk-pause');
  const resumeBtn = document.getElementById('btn-walk-resume');
  const stopBtn = document.getElementById('btn-walk-stop');
  const discardBtn = document.getElementById('btn-walk-discard');
  const pointsCount = document.getElementById('walk-points-count');
  const accuracyDisplay = document.getElementById('walk-accuracy-display');
  const accuracyValue = document.getElementById('walk-accuracy-value');

  if (dot) {
    dot.className = 'walk-status-dot ' + s;
  }
  if (text) {
    if (s === 'searching') text.textContent = 'Buscando señal GPS...';
    else if (s === 'recording') text.textContent = 'Grabando recorrido...';
    else if (s === 'paused') text.textContent = 'Grabación en pausa';
    else text.textContent = 'Listo';
  }
  if (pauseBtn) pauseBtn.style.display = s === 'recording' ? 'flex' : 'none';
  if (resumeBtn) resumeBtn.style.display = s === 'paused' ? 'flex' : 'none';
  const addPointBtn = document.getElementById('btn-walk-add-point');
  if (stopBtn) stopBtn.style.display = (s === 'recording' || s === 'paused') ? 'flex' : 'none';
  if (addPointBtn) addPointBtn.style.display = s === 'recording' ? 'flex' : 'none';
  if (discardBtn) discardBtn.style.display = s !== 'idle' ? 'flex' : 'none';
  if (pointsCount) pointsCount.textContent = walkPoints.length;
  if (accuracyValue) accuracyValue.textContent = walkLastAccuracy !== null ? walkLastAccuracy : '--';
  if (accuracyDisplay) accuracyDisplay.style.display = walkLastAccuracy !== null ? 'inline' : 'none';
  if (areaText && walkPoints.length >= 2) {
    const coords = walkPoints.map(p => [p.lng, p.lat]);
    coords.push(coords[0]);
    try {
      const poly = turf.polygon([coords]);
      const ha = turf.area(poly) / 10000;
      areaText.textContent = ha.toFixed(2) + ' ha';
    } catch (e) {
      // polygon not valid yet
    }
  }
}

function disableDrawControl() {
  if (drawControl && mapInstance) {
    mapInstance.removeControl(drawControl);
  }
}

function enableDrawControl() {
  if (drawControl && mapInstance) {
    mapInstance.addControl(drawControl);
  }
}

function startWalking() {
  if (walkState !== 'idle') return;

  walkState = 'searching';
  walkPoints = [];
  pointCountSinceLastArea = 0;
  walkLastAccuracy = null;

  clearAreaDisplay();

  const toggleBtn = document.getElementById('btn-walk-toggle');
  if (toggleBtn) {
    toggleBtn.classList.add('active');
    toggleBtn.title = 'Descartar grabación';
  }

  disableDrawControl();

  showWalkPanel('searching');

  if (!gpsMarker) {
    gpsMarker = L.circleMarker([0, 0], {
      radius: 8,
      color: '#fff',
      fillColor: '#4285f4',
      fillOpacity: 1,
      weight: 3,
      opacity: 1
    });
  }

  if (!walkPolygon) {
    walkPolygon = L.polygon([], {
      color: '#ffffff',
      fillColor: selectedColor,
      fillOpacity: 0.4,
      weight: 2,
      dashArray: null
    });
    mapInstance.addLayer(walkPolygon);
  }

  if (!walkPathLine) {
    walkPathLine = L.polyline([], {
      color: selectedColor,
      weight: 3,
      opacity: 0.8,
      dashArray: '6, 4'
    });
    mapInstance.addLayer(walkPathLine);
  }

  watchId = navigator.geolocation.watchPosition(
    onWalkPositionSuccess,
    onWalkPositionError,
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
  );

  window._walkSearchTimeout = setTimeout(() => {
    if (walkState === 'searching' && watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = navigator.geolocation.watchPosition(
        onWalkPositionSuccess,
        onWalkPositionError,
        { enableHighAccuracy: false, timeout: 10000, maximumAge: 10000 }
      );
      if (window.Snackbar) {
        window.Snackbar.show('Cambiando a modo de precisión estándar...', { type: 'info' });
      }
    }
  }, 25000);

  saveWalkingSession();
}

function onWalkPositionSuccess(pos) {
  const { latitude, longitude, accuracy } = pos.coords;

  if (walkState === 'searching') {
    walkLastAccuracy = Math.round(accuracy);
    updateWalkPanelUI('searching');

    if (accuracy <= 100) {
      if (window._walkSearchTimeout) {
        clearTimeout(window._walkSearchTimeout);
        window._walkSearchTimeout = null;
      }

      walkState = 'recording';
      walkPoints = [{ lat: latitude, lng: longitude }];
      walkLastAccuracy = Math.round(accuracy);

      gpsMarker.setLatLng([latitude, longitude]);
      if (!mapInstance.hasLayer(gpsMarker)) mapInstance.addLayer(gpsMarker);

      walkPolygon.setLatLngs([[latitude, longitude], [latitude, longitude]]);

      walkPathLine.setLatLngs([[latitude, longitude]]);

      updateWalkPanelUI('recording');
      saveWalkingSession();
    }
    return;
  }

  if (walkState === 'recording') {
    if (accuracy > 30) return;

    walkLastAccuracy = Math.round(accuracy);
    lastGpsPosition = { latitude, longitude };

    const lastPt = walkPoints[walkPoints.length - 1];
    const dist = turf.distance(
      turf.point([lastPt.lng, lastPt.lat]),
      turf.point([longitude, latitude]),
      { units: 'meters' }
    );

    if (dist < 5) {
      if (!hasShownDistanceHint) {
        hasShownDistanceHint = true;
        if (window.Snackbar) {
          window.Snackbar.show('Camina al menos 5m para registrar el siguiente punto', { type: 'info', duration: 3000 });
        }
      }
      gpsMarker.setLatLng([latitude, longitude]);
      return;
    }

    addWalkPoint(latitude, longitude);
  }
}

function addWalkPoint(latitude, longitude) {
  walkPoints.push({ lat: latitude, lng: longitude });

  const allLatLngs = walkPoints.map(p => [p.lat, p.lng]);
  allLatLngs.push(allLatLngs[0]);
  walkPolygon.setLatLngs(allLatLngs);

  walkPathLine.setLatLngs(walkPoints.map(p => [p.lat, p.lng]));

  gpsMarker.setLatLng([latitude, longitude]);

  mapInstance.panTo([latitude, longitude], { animate: true, duration: 0.3 });

  pointCountSinceLastArea++;
  if (pointCountSinceLastArea % 4 === 0) {
    updateWalkPanelUI('recording');
  } else {
    const pointsEl = document.getElementById('walk-points-count');
    if (pointsEl) pointsEl.textContent = walkPoints.length;
    const accEl = document.getElementById('walk-accuracy-value');
    if (accEl) accEl.textContent = walkLastAccuracy;
  }

  saveWalkingSession();
}

function addManualPoint() {
  if (walkState !== 'recording' || !lastGpsPosition) {
    if (window.Snackbar) {
      window.Snackbar.show('Espera a tener señal GPS', { type: 'warning', duration: 3000 });
    }
    return;
  }
  addWalkPoint(lastGpsPosition.latitude, lastGpsPosition.longitude);
  if (window.Snackbar) {
    window.Snackbar.show('Punto agregado manualmente', { type: 'success', duration: 2000 });
  }
}

function onWalkPositionError(err) {
  if (walkState === 'searching' || walkState === 'recording') {
    const prevState = walkState;
    pauseWalking(true);
    if (window.Snackbar) {
      const msg = err.code === 1
        ? 'Permiso de ubicación denegado — activa el GPS en tu dispositivo'
        : 'Señal GPS perdida — puedes reanudar manualmente';
      window.Snackbar.show(msg, { type: 'error', duration: 5000 });
    }
  }
}

function pauseWalking(silent) {
  if (walkState !== 'recording' && walkState !== 'searching') return;

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  walkState = 'paused';
  updateWalkPanelUI('paused');
  saveWalkingSession();
}

function resumeWalking() {
  if (walkState !== 'paused') return;

  walkState = walkPoints.length > 0 ? 'recording' : 'searching';

  watchId = navigator.geolocation.watchPosition(
    onWalkPositionSuccess,
    onWalkPositionError,
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
  );

  updateWalkPanelUI(walkState);
  saveWalkingSession();
}

function stopWalking() {
  if (walkState !== 'recording' && walkState !== 'paused') return;

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  if (walkPoints.length < 3) {
    if (window.Snackbar) {
      window.Snackbar.show('Se necesitan al menos 3 puntos para formar un polígono', { type: 'error' });
    }
    discardWalking();
    return;
  }

  if (walkPolygon && mapInstance.hasLayer(walkPolygon)) mapInstance.removeLayer(walkPolygon);
  if (walkPathLine && mapInstance.hasLayer(walkPathLine)) mapInstance.removeLayer(walkPathLine);
  if (gpsMarker && mapInstance.hasLayer(gpsMarker)) mapInstance.removeLayer(gpsMarker);

  const coords = walkPoints.map(p => [p.lng, p.lat]);
  coords.push(coords[0]);
  let simplifiedCoords = coords;
  try {
    if (typeof turf !== 'undefined' && coords.length > 6) {
      const simplified = turf.simplify(turf.polygon([coords]), {
        tolerance: 0.00005,
        highQuality: true
      });
      simplifiedCoords = simplified.geometry.coordinates[0];
    }
  } catch (e) {
    console.warn('Simplify failed, using original points:', e);
  }

  const finalLatLngs = simplifiedCoords.map(c => [c[1], c[0]]);

  if (finalLatLngs.length > 1) {
    const first = finalLatLngs[0];
    const last = finalLatLngs[finalLatLngs.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      finalLatLngs.pop();
    }
  }

  const poly = L.polygon(finalLatLngs, {
    color: '#ffffff',
    fillColor: selectedColor,
    fillOpacity: 0.5,
    weight: 2
  });

  drawnItems.clearLayers();
  drawnItems.addLayer(poly);
  applyColorToPolygon(poly, selectedColor);
  calculateArea(poly);

  const row = document.getElementById('color-picker-row');
  if (row) row.style.display = 'flex';
  document.querySelectorAll('.poly-color-btn').forEach(btn => {
    btn.style.boxShadow = 'none';
    if (btn.dataset.color === selectedColor) {
      btn.style.boxShadow = `0 0 0 2px white, 0 0 0 4px ${selectedColor}`;
    }
  });

  mapInstance.fitBounds(poly.getBounds().pad(0.2));

  cleanupWalkingState();
  enableDrawControl();

  if (window.Snackbar) {
    window.Snackbar.show('Polígono registrado — puedes ajustar los vértices manualmente', { type: 'success' });
  }
}

function discardWalking() {
  if (walkState === 'idle') return;

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }

  if (walkPolygon && mapInstance && mapInstance.hasLayer(walkPolygon)) {
    mapInstance.removeLayer(walkPolygon);
  }
  if (walkPathLine && mapInstance && mapInstance.hasLayer(walkPathLine)) {
    mapInstance.removeLayer(walkPathLine);
  }
  if (gpsMarker && mapInstance && mapInstance.hasLayer(gpsMarker)) {
    mapInstance.removeLayer(gpsMarker);
  }

  cleanupWalkingState();
  enableDrawControl();

  if (window.Snackbar) {
    window.Snackbar.show('Grabación descartada', { type: 'info' });
  }
}

function cleanupWalkingState() {
  walkState = 'idle';
  walkPoints = [];
  pointCountSinceLastArea = 0;
  walkLastAccuracy = null;

  hideWalkPanel();

  const toggleBtn = document.getElementById('btn-walk-toggle');
  if (toggleBtn) {
    toggleBtn.classList.remove('active');
    toggleBtn.title = 'Registrar caminando';
  }

  walkPolygon = null;
  walkPathLine = null;
  gpsMarker = null;

  localStorage.removeItem('finca_walking_session');
}

function saveWalkingSession() {
  try {
    localStorage.setItem('finca_walking_session', JSON.stringify({
      points: walkPoints,
      state: walkState,
      color: selectedColor,
      timestamp: Date.now()
    }));
  } catch (e) {
    // localStorage full or unavailable
  }
}

function maybeRestoreWalkingSession() {
  try {
    const saved = localStorage.getItem('finca_walking_session');
    if (!saved) return;
    const session = JSON.parse(saved);
    if (!session.points || session.points.length === 0) {
      localStorage.removeItem('finca_walking_session');
      return;
    }
    if (Date.now() - session.timestamp > 600000) {
      localStorage.removeItem('finca_walking_session');
      return;
    }

    walkPoints = session.points;
    if (session.color) selectedColor = session.color;

    if (walkPoints.length > 0) {
      const lastPt = walkPoints[walkPoints.length - 1];
      gpsMarker = L.circleMarker([lastPt.lat, lastPt.lng], {
        radius: 8, color: '#fff', fillColor: '#4285f4', fillOpacity: 1, weight: 3
      });
      mapInstance.addLayer(gpsMarker);
    }

    const allLatLngs = walkPoints.map(p => [p.lat, p.lng]);
    allLatLngs.push(allLatLngs[0]);
    walkPolygon = L.polygon(allLatLngs, {
      color: '#ffffff', fillColor: selectedColor, fillOpacity: 0.4, weight: 2
    });
    mapInstance.addLayer(walkPolygon);

    walkPathLine = L.polyline(walkPoints.map(p => [p.lat, p.lng]), {
      color: selectedColor, weight: 3, opacity: 0.8, dashArray: '6, 4'
    });
    mapInstance.addLayer(walkPathLine);

    if (session.state === 'recording' || session.state === 'paused') {
      walkState = 'paused';
      const toggleBtn = document.getElementById('btn-walk-toggle');
      if (toggleBtn) toggleBtn.classList.add('active');
      disableDrawControl();
      showWalkPanel('paused');
      if (window.Snackbar) {
        window.Snackbar.show('Sesión de grabación recuperada — reanuda o descarta', { type: 'info', duration: 5000 });
      }
    }
  } catch (e) {
    localStorage.removeItem('finca_walking_session');
  }
}

export async function initNuevoPotrero(id) {
  const form = document.getElementById('form-nuevo-potrero');
  if (!form) return;

  coordinatesCleared = false;
  const mapSheet = document.getElementById('lote-map-sheet');
  document.querySelectorAll('#lote-map-sheet').forEach(el => {
    if (el !== mapSheet) el.remove();
  });
  if (mapSheet && mapSheet.parentElement !== document.body) {
    document.body.appendChild(mapSheet);
  }

  const PASTO_LIST = ['Estrella', 'Brachiaria', 'Pangola', 'Guinea', 'Cratylia', 'Natural'];

  const applyCustomPastoOption = (select, customVal) => {
    if (!select || !customVal) return;
    let customOpt = select.querySelector('option[data-custom-pasto="1"]');
    if (!customOpt) {
      customOpt = document.createElement('option');
      customOpt.dataset.customPasto = '1';
      customOpt.dataset.icon = '🌱';
      customOpt.dataset.sub = 'Variedad personalizada';
      const otroOpt = select.querySelector('option[value="Otro"]');
      if (otroOpt) select.insertBefore(customOpt, otroOpt);
      else select.appendChild(customOpt);
    }
    customOpt.value = customVal;
    customOpt.textContent = customVal;
  };

  let lastValidPasto = (() => {
    const sel = document.getElementById('pasto-select');
    const cur = window.__currentPotreroData?.pasto;
    if (sel && cur && !PASTO_LIST.includes(cur) && cur !== 'Otro') {
      applyCustomPastoOption(sel, cur);
      sel.value = cur;
      return cur;
    }
    return (sel && sel.value && sel.value !== 'Otro') ? sel.value : 'Estrella';
  })();

  const openCustomPastoBottomSheet = (initialText = '') => {
    const select = document.getElementById('pasto-select');
    const input = document.getElementById('pasto-input');
    if (!select) return;

    document.getElementById('pasto-custom-sheet-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'pasto-custom-sheet-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; z-index:100030; background:rgba(15,25,16,0.48); backdrop-filter:blur(2px); display:flex; align-items:flex-end; justify-content:center; opacity:0; transition:opacity 0.2s ease;';

    overlay.innerHTML = `
      <div id="pasto-custom-sheet" style="width:100%; max-width:520px; background:#ffffff; border-radius:28px 28px 0 0; padding:12px 20px calc(22px + env(safe-area-inset-bottom, 0px)); box-shadow:0 -10px 32px rgba(0,0,0,0.18); transform:translateY(100%); transition:transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1); font-family:'Work Sans', sans-serif;">
        <div style="width:36px; height:4px; border-radius:99px; background:#c5cdc2; margin:0 auto 14px;"></div>
        <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:6px;">
          <div style="font-size:18px; font-weight:700; color:#1b2919;">Otra variedad de pasto</div>
          <button type="button" id="pasto-custom-sheet-close" aria-label="Cerrar" style="width:36px; height:36px; border-radius:50%; border:none; background:#f2f5f0; color:#1b2919; font-size:20px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center;">&times;</button>
        </div>
        <div style="font-size:13px; color:#5e6b5c; line-height:1.4;">Escribe el nombre de la semilla o variedad de pasto para este potrero.</div>
        <div class="m3-field ${initialText ? 'has-value' : ''}" id="pasto-custom-sheet-field" style="margin:16px 0 6px;">
          <input type="text" id="pasto-custom-sheet-input" placeholder=" " value="${escapeHtml(initialText)}" autocomplete="off">
          <label for="pasto-custom-sheet-input">Nombre de la semilla / pasto</label>
        </div>
        <div id="pasto-custom-sheet-err" style="display:none; font-size:12px; color:#b3261e; font-weight:600; margin-top:4px;">Escribe el nombre de la variedad para continuar.</div>
        <div style="display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-top:18px;">
          <button type="button" id="pasto-custom-sheet-cancel" style="height:44px; padding:0 18px; border-radius:99px; border:none; background:transparent; color:#2d3e2c; font-weight:700; font-size:14px; font-family:'Work Sans', sans-serif; cursor:pointer;">Cancelar</button>
          <button type="button" id="pasto-custom-sheet-save" style="height:44px; padding:0 22px; border-radius:99px; border:none; background:#2d3e2c; color:#ffffff; font-weight:700; font-size:14px; font-family:'Work Sans', sans-serif; cursor:pointer; box-shadow:0 2px 6px rgba(45,62,44,0.25);">Guardar variedad</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    const sheet = overlay.querySelector('#pasto-custom-sheet');
    const sheetField = overlay.querySelector('#pasto-custom-sheet-field');
    const sheetInput = overlay.querySelector('#pasto-custom-sheet-input');
    const errEl = overlay.querySelector('#pasto-custom-sheet-err');

    requestAnimationFrame(() => {
      overlay.style.opacity = '1';
      if (sheet) sheet.style.transform = 'translateY(0)';
    });

    const closeSheet = (restorePrevious) => {
      overlay.style.opacity = '0';
      if (sheet) sheet.style.transform = 'translateY(100%)';
      setTimeout(() => overlay.remove(), 220);
      if (restorePrevious) {
        const fallback = lastValidPasto && lastValidPasto !== 'Otro' ? lastValidPasto : 'Estrella';
        select.value = fallback;
        if (input) input.value = PASTO_LIST.includes(fallback) ? '' : fallback;
        select.dispatchEvent(new Event('change', { bubbles: true }));
      }
    };

    const handleSave = () => {
      const customVal = (sheetInput?.value || '').trim();
      if (!customVal) {
        if (errEl) errEl.style.display = 'block';
        sheetInput?.focus();
        return;
      }
      applyCustomPastoOption(select, customVal);
      lastValidPasto = customVal;
      select.value = customVal;
      if (input) input.value = PASTO_LIST.includes(customVal) ? '' : customVal;
      closeSheet(false);
      select.dispatchEvent(new Event('change', { bubbles: true }));
    };

    sheetInput?.addEventListener('input', () => {
      if (sheetField) sheetField.classList.toggle('has-value', !!sheetInput.value);
      if (errEl && sheetInput.value.trim()) errEl.style.display = 'none';
    });

    sheetInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        handleSave();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        closeSheet(true);
      }
    });

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSheet(true);
    });

    overlay.querySelector('#pasto-custom-sheet-close')?.addEventListener('click', () => closeSheet(true));
    overlay.querySelector('#pasto-custom-sheet-cancel')?.addEventListener('click', () => closeSheet(true));
    overlay.querySelector('#pasto-custom-sheet-save')?.addEventListener('click', handleSave);

    setTimeout(() => {
      sheetInput?.focus();
      if (sheetInput && initialText) sheetInput.select();
    }, 90);
  };

  window._togglePastoCustom = () => {
    const select = document.getElementById('pasto-select');
    const input = document.getElementById('pasto-input');
    if (!select) return;
    if (select.value === 'Otro') {
      const initial = (!PASTO_LIST.includes(lastValidPasto) && lastValidPasto !== 'Otro') ? lastValidPasto : '';
      openCustomPastoBottomSheet(initial);
    } else if (select.value) {
      lastValidPasto = select.value;
      if (input) input.value = PASTO_LIST.includes(select.value) ? '' : select.value;
    }
  };

  window._showPastoList = () => {
    const select = document.getElementById('pasto-select');
    const input = document.getElementById('pasto-input');
    if (!select) return;
    if (input) input.value = '';
    lastValidPasto = 'Estrella';
    select.value = 'Estrella';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  };
  window._togglePastoCustom();

  const hiddenInputId = form.querySelector('input[name="potrero_id"]')?.value || null;
  const currentDataId = window.__currentPotreroData?.id || null;
  const potreroId = currentDataId || hiddenInputId;

  let editingPotrero = window.__currentPotreroData;
  if (potreroId && (!editingPotrero || editingPotrero.id !== potreroId)) {
    try {
      const arr = await restFetch(`potreros?id=eq.${potreroId}&select=*`);
      const data = arr?.[0];
      if (data) {
        window.__currentPotreroData = data;
        editingPotrero = data;
      }
    } catch (err) {
      console.warn('[nuevo_potrero] Error re-fetching potrero:', err);
    }
  }

  window.__screenCleanup = () => {
    if (walkState !== 'idle') {
      saveWalkingSession();
    }
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    if (walkPolygon && mapInstance?.hasLayer(walkPolygon)) mapInstance.removeLayer(walkPolygon);
    if (walkPathLine && mapInstance?.hasLayer(walkPathLine)) mapInstance.removeLayer(walkPathLine);
    if (gpsMarker && mapInstance?.hasLayer(gpsMarker)) mapInstance.removeLayer(gpsMarker);

    if (drawnItems) {
      drawnItems.eachLayer(l => {
        if (l._glowPolygon && mapInstance?.hasLayer(l._glowPolygon)) {
          mapInstance.removeLayer(l._glowPolygon);
        }
      });
    }
    if (refMarker && mapInstance?.hasLayer(refMarker)) {
      mapInstance.removeLayer(refMarker);
      refMarker = null;
    }
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
      drawnItems = null;
      drawControl = null;
      existingPotrerosLayer = null;
      walkControl = null;
      refMarker = null;
    }
    if (miniPreviewMap) {
      miniPreviewMap.remove();
      miniPreviewMap = null;
      miniPreviewPoly = null;
    }
    document.getElementById('lote-map-sheet')?.remove();
    document.getElementById('potrero_map-fullscreen-search')?.remove();
    document.getElementById('pasto-custom-sheet-overlay')?.remove();
  };

  if (window.refreshM3Fields) window.refreshM3Fields();

  setTimeout(() => {
    initMap();

    setTimeout(() => {
      if (editingPotrero && editingPotrero.coordenadas_json && drawnItems) {
        try {
          drawnItems.clearLayers();

          const { coordinates, color: savedColor } = parseCoordenadasJson(editingPotrero.coordenadas_json);
          selectedColor = savedColor || '#2d3e2c';

          const latlngs = coordinates.map(c => L.latLng(c.lat, c.lng));
          if (latlngs.length >= 3) {
            const polygon = L.polygon(latlngs, {
              color: '#ffffff',
              fillColor: selectedColor,
              fillOpacity: 0.55,
              weight: 2.5
            });
            drawnItems.addLayer(polygon);

            const glow = L.polygon(latlngs, {
              color: selectedColor, fillColor: selectedColor, fillOpacity: 0.5, weight: 6, opacity: 0.7
            });
            glow._isGlow = true;
            polygon._glowPolygon = glow;
            mapInstance.addLayer(glow);

            document.querySelectorAll('.poly-color-btn').forEach(btn => {
              btn.style.boxShadow = 'none';
              if (btn.dataset.color === selectedColor) {
                btn.style.boxShadow = `0 0 0 2px white, 0 0 0 4px ${selectedColor}`;
              }
            });

            mapInstance.fitBounds(polygon.getBounds().pad(0.25));

            const badge = document.getElementById('area-info-badge');
            if (badge) badge.style.display = 'flex';
            const text = document.getElementById('area-calculated-text');
            const areaVal = editingPotrero.area ? parseFloat(editingPotrero.area).toFixed(2) : null;
            if (text && areaVal) text.textContent = areaVal + ' ha';

            const mapStatus = document.getElementById('map-open-status');
            if (mapStatus) {
              mapStatus.textContent = areaVal
                ? `${areaVal} ha · Toca para editar en el mapa`
                : 'Polígono guardado · Toca para editar en el mapa';
            }

            const row = document.getElementById('color-picker-row');
            if (row) row.style.display = 'flex';

            updateMiniPreviewMap(latlngs, selectedColor);
          }
        } catch (e) {
          console.warn('Error drawing existing polygon:', e);
        }
      }
    }, 300);

    document.querySelectorAll('.poly-color-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        selectedColor = color;
        document.querySelectorAll('.poly-color-btn').forEach(b => b.style.boxShadow = 'none');
        btn.style.boxShadow = `0 0 0 2px white, 0 0 0 4px ${color}`;
        if (drawnItems && drawnItems.getLayers().length > 0) {
          const layer = drawnItems.getLayers()[0];
          if (layer._glowPolygon && mapInstance.hasLayer(layer._glowPolygon)) {
            mapInstance.removeLayer(layer._glowPolygon);
          }
          layer.setStyle({ color: '#ffffff', fillColor: color, fillOpacity: 0.5, weight: 2 });
          const latlngs = layer.getLatLngs();
          if (latlngs && latlngs[0] && latlngs[0].length > 2) {
            const glow = L.polygon(latlngs, {
              color, fillColor: color, fillOpacity: 0.5, weight: 6, opacity: 0.7
            });
            glow._isGlow = true;
            layer._glowPolygon = glow;
            mapInstance.addLayer(glow);
            updateMiniPreviewMap(latlngs[0], color);
          }
        }
      });
    });
  }, 100);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    document.querySelectorAll('.error-text').forEach(el => el.style.display = 'none');
    document.querySelectorAll('.m3-field').forEach(el => el.classList.remove('error'));

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    delete data.potrero_id;

    let hasError = false;
    if (!data.nombre) {
      const err = document.getElementById('error-nombre');
      if (err) err.style.display = 'block';
      const field = form.querySelector('input[name="nombre"]')?.closest('.m3-field');
      if (field) field.classList.add('error');
      hasError = true;
    }
    if (hasError) return;

    if (data.ciclo_recuperacion) data.ciclo_recuperacion = parseInt(data.ciclo_recuperacion);
    if (data.area) data.area = parseFloat(data.area);

    const customPasto = (data.pasto_custom || '').trim();
    if (customPasto) data.pasto = customPasto;
    delete data.pasto_custom;

    if (drawnItems && drawnItems.getLayers().length > 0) {
      const layer = drawnItems.getLayers()[0];
      const latlngs = layer.getLatLngs()[0];
      data.coordenadas_json = JSON.stringify({
        color: selectedColor,
        coordinates: latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }))
      });
    } else if (coordinatesCleared) {
      data.coordenadas_json = null;
    } else if (window.__currentPotreroData?.coordenadas_json) {
      const prev = parseCoordenadasJson(window.__currentPotreroData.coordenadas_json);
      data.coordenadas_json = JSON.stringify({
        color: selectedColor,
        coordinates: prev.coordinates || []
      });
    }

    data.empresa_id = window._currentEmpresaId;

    const btnSave = form.querySelector('button[type="submit"]');
    if (btnSave) {
      btnSave.disabled = true;
      btnSave.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Guardando...';
    }

    try {
      let newPotreroId = null;
      const submitPotreroId = potreroId || window.__currentPotreroData?.id || null;
      if (submitPotreroId) {
        await restFetch(`potreros?id=eq.${submitPotreroId}`, {
          method: 'PATCH',
          body: JSON.stringify(data)
        });
        newPotreroId = submitPotreroId;
      } else {
        const inserted = await restInsert('potreros', data);
        newPotreroId = inserted?.id;
        if (!newPotreroId && data.nombre) {
          const busca = await restFetch(`potreros?nombre=eq.${encodeURIComponent(data.nombre)}&empresa_id=eq.${data.empresa_id}&select=id&order=created_at.desc&limit=1`);
          newPotreroId = busca?.[0]?.id;
        }
      }

      if (!newPotreroId) throw new Error('No se pudo crear/actualizar el potrero');

      if (window.Snackbar) {
        window.Snackbar.show(potreroId ? 'Potrero actualizado exitosamente' : 'Potrero creado exitosamente', { type: 'success' });
      }
      await invalidateCache('potreros');
      await invalidateCache('potrero_eventos');
      window.clearScreenCache?.('potreros');
      window.navigateTo('potreros');
    } catch (err) {
      console.error('Error saving potrero:', err);
      if (window.Snackbar) {
        window.Snackbar.show('Error: ' + err.message, { type: 'error' });
      }
    } finally {
      if (btnSave) {
        btnSave.disabled = false;
        const finalIcon = potreroId ? 'save' : 'add';
        const finalLabel = potreroId ? 'Guardar Cambios' : 'Crear Potrero';
        btnSave.innerHTML = `<span class="material-icons">${finalIcon}</span> ${finalLabel}`;
      }
    }
  });

  form.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', () => {
      const parent = el.closest('.m3-field');
      if (el.value.trim() !== '') {
        parent.classList.add('has-value');
      } else {
        parent.classList.remove('has-value');
      }
    });
  });
}
