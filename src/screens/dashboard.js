import { supabase } from '../supabase.js';
import { getPaginationFooterHtml } from '../pagination.js';
import { loadPuntoReferencia } from '../auth.js';

let allLotes = [];
let currentLotesSearchQuery = '';
let refMarker = null;

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

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

export async function renderDashboard() {
  console.log('Rendering Dashboard...');
  try {
    const [
      { data: lotes, error: lotesErr },
      { data: aplicaciones, error: appErr }
    ] = await Promise.all([
      supabase.from('lotes').select('*').order('created_at', { ascending: false }),
      supabase.from('lote_aplicaciones').select('*').order('fecha', { ascending: false })
    ]);

    if (lotesErr) throw lotesErr;

    const appsByLote = {};
    (aplicaciones || []).forEach(a => {
      if (!appsByLote[a.lote_id]) appsByLote[a.lote_id] = [];
      appsByLote[a.lote_id].push(a);
    });

    allLotes = lotes || [];
    const totalPlantas = allLotes.reduce((sum, l) => sum + (l.num_plantas || 0), 0) || 0;
    const totalHa = allLotes.reduce((sum, l) => sum + (parseFloat(l.area_ha) || 0), 0) || 0;

    return `
      <style>
        .mapa-page {
          height: 100%;
          display: flex;
          flex-direction: column;
          gap: 4px;
          min-height: 0;
          position: relative;
          padding-bottom: 0;
        }
        #mapa-container {
          width: 100%;
          height: 680px;
          min-height: 680px;
          border-radius: 18px;
          overflow: hidden;
          position: relative;
          background: #e8efe4;
          border: 1.5px solid #dce5da;
          box-shadow: 0 4px 20px rgba(0,0,0,0.06);
        }
        @media (max-width: 768px) {
          #mapa-container {
            height: 600px;
            min-height: 600px;
          }
        }
        .mapa-layers-btn {
          position: absolute;
          top: 12px;
          right: 12px;
          z-index: 1000;
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border-radius: 12px;
          border: 1px solid rgba(0,0,0,0.08);
          background: #ffffff;
          color: #2d3e2c;
          font-family: 'Work Sans', sans-serif;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        }
        .mapa-reg-btn {
          position: absolute;
          bottom: 18px;
          right: 18px;
          z-index: 1000;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          border: none;
          border-radius: 999px;
          background: #2d3e2c;
          color: #fff;
          font-family: 'Work Sans', sans-serif;
          font-size: 13.5px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 4px 16px rgba(0,0,0,0.3);
          transition: transform 0.15s, background 0.15s;
        }
        .mapa-reg-btn:hover {
          background: #3d5240;
          transform: scale(1.03);
        }
        .lote-label {
          position: absolute;
          left: 50%;
          top: 50%;
          transform: translate(-50%, -50%);
          color: #ffffff;
          font-size: 11.5px;
          font-weight: 800;
          letter-spacing: 0.3px;
          padding: 5px 12px 5px 8px;
          border-radius: 999px;
          box-shadow: 0 2px 8px rgba(0,0,0,0.35);
          white-space: nowrap;
          border: 2px solid #ffffff;
          pointer-events: none;
          z-index: 500;
          font-family: 'Work Sans', sans-serif;
          display: flex;
          align-items: center;
          gap: 5px;
          text-shadow: 0 1px 2px rgba(0,0,0,0.4);
        }
        @media (max-width: 600px) {
          .lote-label {
            font-size: 10.5px;
            padding: 3px 8px 3px 6px;
            border-width: 1.5px;
            gap: 3px;
          }
        }
        #mapa-container path.leaflet-interactive {
          filter: drop-shadow(0 2px 6px rgba(0,0,0,0.55));
          transition: stroke-width 0.15s ease, fill-opacity 0.15s ease;
          cursor: pointer;
        }
        .lote-custom-popup .leaflet-popup-content-wrapper {
          padding: 14px 16px;
          border-radius: 18px;
          box-shadow: 0 12px 36px rgba(0,0,0,0.32);
          border: 1.5px solid #dce5da;
          background: #ffffff;
        }
        .lote-custom-popup .leaflet-popup-content {
          margin: 0;
          line-height: normal;
        }
        .lote-custom-popup .leaflet-popup-tip {
          background: #ffffff;
          box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        }
        .lote-float-close {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          background: none;
          border: none;
          cursor: pointer;
          color: #777;
          padding: 4px;
          border-radius: 50%;
          flex-shrink: 0;
        }
        .lote-float-close:hover {
          background: #f2f4f0;
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
          font-size: 16px;
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
          gap: 12px;
          font-size: 12px;
          color: #555;
          margin-bottom: 10px;
          flex-wrap: wrap;
        }
        .mapa-pop-stats span {
          display: inline-flex;
          align-items: center;
          gap: 5px;
        }
        .mapa-pop-stats img {
          width: 16px !important;
          height: 16px !important;
          max-width: 16px !important;
          max-height: 16px !important;
          object-fit: contain !important;
          display: inline-block !important;
          flex-shrink: 0 !important;
        }
        .mapa-pop-sec {
          background: #f4f6f2;
          border-radius: 10px;
          padding: 8px 10px;
          margin-bottom: 10px;
        }
        .mapa-pop-sec-t {
          display: block;
          font-size: 11px;
          font-weight: 700;
          color: #5a7056;
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
        .mapa-pop-btn {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          width: 100%;
          margin-top: 4px;
          padding: 9px 12px;
          border: none;
          border-radius: 10px;
          background: #2d3e2c;
          color: #fff;
          font-weight: 700;
          font-size: 12.5px;
          cursor: pointer;
          font-family: 'Work Sans', sans-serif;
          transition: background 0.15s;
        }
        .mapa-pop-btn:hover {
          background: #3d5240;
        }
        .cafetal-hero .ganado-card-value {
          color: #ffffff !important;
          font-weight: 800 !important;
        }
        .cafetal-hero .ganado-tally-label {
          color: rgba(255,255,255,0.92) !important;
        }
        .mapa-pop-chips-carousel {
          display: flex;
          gap: 6px;
          overflow-x: auto;
          padding: 2px 0 6px;
          margin: 6px 0 10px;
          scrollbar-width: thin;
          -webkit-overflow-scrolling: touch;
        }
        .mapa-pop-chips-carousel::-webkit-scrollbar {
          height: 4px;
        }
        .mapa-pop-chips-carousel::-webkit-scrollbar-track {
          background: rgba(0,0,0,0.03);
          border-radius: 4px;
        }
        .mapa-pop-chips-carousel::-webkit-scrollbar-thumb {
          background: #c8d8c6;
          border-radius: 4px;
        }
        .screen-cafetal .da-tabs-section {
          background: white;
          border-radius: 18px;
          padding: 20px 12px;
          box-shadow: 0 10px 40px rgba(0,0,0,0.03);
          border: 1px solid rgba(0,0,0,0.02);
        }
        @media (max-width: 600px) {
          .screen-cafetal .da-tabs-section {
            padding: 12px 6px;
          }
        }
      </style>

      <div class="screen-cafetal" style="padding-bottom: 80px;">
        <!-- Top Search Bar + Quick Add aligned exactly like Ganado -->
        <div class="ganado-top-actions-container" style="display: flex; justify-content: flex-end; gap: 10px; margin: 16px 0 8px;">
          <div class="ganado-split-ctrl ${currentLotesSearchQuery ? 'expanded' : ''}" id="lotes-search-wrapper">
            <button id="lotes-search-toggle" class="m3-icon-btn-tonal" style="margin: 0; box-shadow: none; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;" title="Buscar lote">
              <span class="material-icons" style="color: #ffffff;">search</span>
            </button>
            <input type="text" id="lotes-search-input" placeholder="Buscar lote..." value="${currentLotesSearchQuery}" style="border: none; background: transparent; outline: none; font-size: 15px; width: ${currentLotesSearchQuery ? '160px' : '0px'}; transition: width 0.3s, flex-grow 0.3s ease; opacity: ${currentLotesSearchQuery ? '1' : '0'}; padding: ${currentLotesSearchQuery ? '0 8px 0 0' : '0'}; color: #ffffff;">
            <button id="lotes-search-clear" style="background: none; border: none; cursor: pointer; display: ${currentLotesSearchQuery ? 'flex' : 'none'}; align-items: center; justify-content: center; padding: 0 16px 0 8px; color: #ffffff; height: 100%;" title="Limpiar búsqueda">
              <span class="material-icons" style="font-size: 20px;">close</span>
            </button>
            <span class="ganado-split-ctrl-sep"></span>
            <button class="ganado-split-ctrl-reg" onclick="window.navigateTo('nuevo_lote')" title="Nuevo Lote">
              <span class="material-icons">add</span>
            </button>
          </div>
        </div>

        <div class="ganado-page-title" style="margin-top: -10px; margin-bottom: 24px;">
          <h2>Gestión del Cafetal</h2>
        </div>

        <div class="da-tabs-section" style="margin-top: 10px;">
          <!-- 1. Hero Summary Card (Dark Green Banner) -->
          ${allLotes.length > 0 ? `
          <div class="cafetal-hero" style="margin-bottom: 14px;">
            <div class="ganado-card ganado-card-primary ganado-tally" style="background: var(--m3-primary, #2d3e2c); border-radius: 20px; padding: 24px 22px 20px; box-shadow: 0 6px 24px rgba(45,62,44,0.22); width: 100%; box-sizing: border-box;">
              <div class="ganado-tally-top" style="margin-bottom: 16px;">
                <span class="ganado-tally-label" style="color: rgba(255,255,255,0.92); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-size: 13.5px;">Total Plantas</span>
                <span class="ganado-tally-count">
                  <span class="ganado-card-value" style="color: #ffffff !important; font-size: 38px; font-weight: 800;">${totalPlantas.toLocaleString()}</span>
                </span>
              </div>
              <div class="ganado-tally-divider" style="border-top: 1px solid rgba(255,255,255,0.18); margin-bottom: 16px;"></div>
              <div class="ganado-tally-row" style="display: flex; gap: 10px; align-items: center;">
                <div class="ganado-tag-stat" style="background: rgba(255,255,255,0.95); border-radius: 12px; padding: 8px 12px; flex: 0 0 auto; box-shadow: 0 2px 8px rgba(0,0,0,0.06); display: flex; align-items: center; gap: 8px;">
                  <span class="ganado-tag-swatch" style="background: #2d3e2c; color: #ffffff; border-radius: 8px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 900; flex-shrink: 0; box-shadow: 0 2px 5px rgba(45,62,44,0.22);">
                    ${allLotes.length}
                  </span>
                  <div style="display: flex; flex-direction: column; line-height: 1.15;">
                    <span style="font-size: 13px; font-weight: 800; color: #2d3e2c; white-space: nowrap;">Lotes</span>
                    <span style="font-size: 10.5px; font-weight: 700; color: #666; white-space: nowrap;">de Café</span>
                  </div>
                </div>
                <a href="#" onclick="event.preventDefault(); window.navigateTo('plan_ifcafe')" class="ganado-tag-stat" style="background: rgba(255,255,255,0.95); border-radius: 12px; padding: 10px 14px; flex: 1; min-width: 0; box-shadow: 0 2px 8px rgba(0,0,0,0.06); display: flex; align-items: center; justify-content: space-between; text-decoration: none; color: inherit; cursor: pointer; transition: transform 0.15s, box-shadow 0.15s;" title="Abrir Manejo y Calendario del Cafetal">
                  <div style="display: flex; align-items: center; gap: 10px; min-width: 0; overflow: hidden;">
                    <span class="ganado-tag-swatch" style="background: rgba(45,62,44,0.08); border-radius: 8px; width: 30px; height: 30px; display: flex; align-items: center; justify-content: center; font-size: 17px; flex-shrink: 0;">🌿</span>
                    <span class="ganado-tag-info" style="display: flex; flex-direction: column; min-width: 0;">
                      <span style="font-size: 14px; font-weight: 800; color: #2d3e2c; line-height: 1.15; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">Manejo Cafetal</span>
                      <span style="font-size: 10px; text-transform: uppercase; color: #666; font-weight: 700; letter-spacing: 0.2px; white-space: nowrap;">Registro / Plan</span>
                    </span>
                  </div>
                  <span class="material-icons" style="color: #2d3e2c; font-size: 19px; flex-shrink: 0; margin-left: 6px;">chevron_right</span>
                </a>
              </div>
            </div>
          </div>
          ` : ''}

          <!-- 2. Interactive ESRI Satellite Map of Lotes (Directly Below Banner) -->
          <div style="position: relative;">
            <div class="ganado-tag-stat" style="background: #fdfdfd; border-radius: 16px; padding: 13px 18px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border: 1.5px solid rgba(45,62,44,0.12); margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; width: 100%; box-sizing: border-box; cursor: default;">
              <div style="display: flex; align-items: center; gap: 14px;">
                <span class="ganado-tag-swatch" style="background: rgba(45,62,44,0.08); border-radius: 12px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;"><img src="mapa.png" alt="" style="width: 24px; height: 24px; object-fit: contain;"></span>
                <div style="display: flex; flex-direction: column;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 16px; font-weight: 800; color: #2d3e2c;">Lotes & Microlotes</span>
                    <span style="font-size: 12px; font-weight: 700; color: #2d3e2c; background: #eef4ec; border: 1px solid #d4dfd2; padding: 2px 10px; border-radius: 99px;">${totalHa.toFixed(2)} Hectáreas</span>
                  </div>
                  <span style="font-size: 11.5px; color: #666; font-weight: 600; display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                    <span class="material-icons" style="font-size: 14px; color: #2d3e2c;">touch_app</span> Toca una parcela en el mapa para ver su detalle
                  </span>
                </div>
              </div>
            </div>

            <div id="mapa-container">
              <div class="mapa-empty" id="mapa-loading">
                <div class="spinner"></div>
                <p>Cargando mapa del cafetal...</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error in renderDashboard:', err);
    return `<div style="padding: 24px; color: red;">Error cargando cafetal: ${err.message}</div>`;
  }
}

export async function initDashboard() {
  // Split control (search + arrow) menu
  window.toggleLotesSplitMenu = (e) => {
    if (e) e.stopPropagation();
    const menu = document.getElementById('lotes-split-menu');
    if (menu) menu.classList.toggle('open');
  };

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('lotes-split-menu');
    if (menu && !e.target.closest('.ganado-split-ctrl')) menu.classList.remove('open');
  });

  // Map Initialization
  const container = document.getElementById('mapa-container');
  if (!container) return;

  let lotes = [];
  let aplicaciones = [];
  try {
    const [lotesRes, appsRes] = await Promise.all([
      supabase.from('lotes').select('*').order('nombre', { ascending: true }),
      supabase.from('lote_aplicaciones').select('*').order('fecha', { ascending: false })
    ]);
    if (lotesRes.error) throw lotesRes.error;
    if (appsRes.error) throw appsRes.error;
    lotes = lotesRes.data || [];
    aplicaciones = appsRes.data || [];
  } catch (e) {
    container.innerHTML = '<div class="mapa-empty"><span class="material-icons" style="font-size:40px;">cloud_off</span><p>Error cargando los lotes: ' + e.message + '</p></div>';
    return;
  }

  const appsByLote = {};
  (aplicaciones || []).forEach(a => {
    if (!appsByLote[a.lote_id]) appsByLote[a.lote_id] = [];
    appsByLote[a.lote_id].push(a);
  });

  const withCoords = lotes.filter(l => l.coordenadas_json || l.coordenadas);

  container.innerHTML = `
    <div id="mapa-leaflet" style="width:100%;height:100%;"></div>
    <button class="mapa-layers-btn" id="mapa-layers-btn" title="Cambiar tipo de satélite">
      <span class="material-symbols-outlined" style="font-size:18px;">layers</span>
      <span id="mapa-layers-label">Esri Sat.</span>
    </button>
  `;

  // Leaflet map setup
  const map = L.map('mapa-leaflet', {
    zoomControl: false,
    attributionControl: false,
    maxZoom: 21,
    minZoom: 3,
    zoomSnap: 0.1
  }).setView([14.6349, -87.4526], 15);

  window._dbMapInstance = map;

  const esriSatLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 21,
    maxNativeZoom: 17
  }).addTo(map);

  const googleSatLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    attribution: 'Imagery &copy; Google',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    maxZoom: 21,
    maxNativeZoom: 18
  });

  const labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 21,
    maxNativeZoom: 17,
    opacity: 0.85
  }).addTo(map);

  // Zoom control
  L.control.zoom({ position: 'topright' }).addTo(map);

  // Layer switcher
  let layerMode = 0;
  const btnLayers = document.getElementById('mapa-layers-btn');
  const layersLabel = document.getElementById('mapa-layers-label');
  if (btnLayers) {
    btnLayers.addEventListener('click', () => {
      layerMode = (layerMode + 1) % 3;
      map.removeLayer(esriSatLayer);
      map.removeLayer(googleSatLayer);
      map.removeLayer(labelsLayer);
      if (layerMode === 0) {
        map.addLayer(esriSatLayer);
        map.addLayer(labelsLayer);
        if (layersLabel) layersLabel.textContent = 'Esri Sat.';
        window.Snackbar?.show('Capa: Esri Satélite', { duration: 1200 });
      } else if (layerMode === 1) {
        map.addLayer(googleSatLayer);
        map.addLayer(labelsLayer);
        if (layersLabel) layersLabel.textContent = 'Google Sat.';
        window.Snackbar?.show('Capa: Google Satélite', { duration: 1200 });
      } else {
        map.addLayer(esriSatLayer);
        if (layersLabel) layersLabel.textContent = 'Sat. Limpio';
        window.Snackbar?.show('Capa: Satélite Limpio', { duration: 1200 });
      }
    });
  }

  // Load Punto de Referencia
  loadPuntoReferencia().then(pt => {
    if (!pt) return;
    if (refMarker) map.removeLayer(refMarker);
    const redPin = L.divIcon({
      className: 'ref-pin-icon',
      html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:none;">
        <span class="material-icons" style="color:#e53935;font-size:32px;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.5));">location_on</span>
        <span style="background:rgba(0,0,0,0.7);color:#fff;font-size:10px;font-weight:700;padding:2px 6px;border-radius:4px;white-space:nowrap;margin-top:-6px;">${escapeHtml(pt.nombre || 'Finca')}</span>
      </div>`,
      iconSize: [32, 42],
      iconAnchor: [16, 38]
    });
    refMarker = L.marker([pt.lat, pt.lng], { icon: redPin, interactive: false }).addTo(map);
    if (!withCoords.length) {
      map.setView([pt.lat, pt.lng], 16);
    }
  });

  // Parcels and Selection Logic
  const allBounds = [];
  const polyByLote = {};
  let selectedLoteId = null;
  let activeLotePopup = null;

  function buildPopupCardHtml(lote, apps) {
    const dNow = new Date();
    const hoyStr = `${dNow.getFullYear()}-${String(dNow.getMonth() + 1).padStart(2, '0')}-${String(dNow.getDate()).padStart(2, '0')}`;
    const dHoy = new Date(hoyStr + 'T00:00:00');

    const formatFechaStr = (fStr) => {
      if (!fStr) return '';
      const d = new Date(fStr.length === 10 ? fStr + 'T00:00:00' : fStr);
      return isNaN(d.getTime()) ? fStr : d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
    };

    const calcDias = (fStr) => {
      if (!fStr) return 0;
      const d = new Date(fStr.length === 10 ? fStr + 'T00:00:00' : fStr);
      return Math.floor((dHoy - d) / (1000 * 60 * 60 * 24));
    };

    let maderablesVariedades = lote.maderables_variedades || '';
    let musaceasTipo = lote.musaceas_tipo || '';

    if (lote.coordenadas_json) {
      try {
        const parsedCoords = JSON.parse(lote.coordenadas_json);
        if (parsedCoords && typeof parsedCoords === 'object' && !Array.isArray(parsedCoords)) {
          if (parsedCoords.maderables_variedades && !maderablesVariedades) {
            maderablesVariedades = parsedCoords.maderables_variedades;
          }
          if (parsedCoords.musaceas_tipo && !musaceasTipo) {
            musaceasTipo = parsedCoords.musaceas_tipo;
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

    const formatEdadLabel = (edad) => {
      if (!edad) return '';
      if (edad === '1_anio') return '1 año · Café Tiernito';
      if (edad === '2_anios') return '2 años · Creciendo';
      if (edad === '3_mas') return '3+ años · En Producción';
      if (edad === 'carga_alta') return 'Carga Muy Alta';
      return edad;
    };

    // Ordenar todas las labores de la más reciente a la más antigua
    const sortedApps = [...(apps || [])].sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
    const recentApps = sortedApps.slice(0, 3);
    const extraCount = Math.max(0, sortedApps.length - 3);

    return `
      <div class="mapa-pop-head">
        <span class="mapa-pop-badge" style="display:inline-flex; align-items:center; gap:6px; background:#eef7ee; color:#1b5e20; border:1px solid #c8e6c9; font-weight:800; font-size:11.5px; padding:4px 10px; border-radius:12px;">
          ${escapeHtml(lote.variedad || 'Café')}${lote.edad_categoria ? ` · 🌱 ${escapeHtml(formatEdadLabel(lote.edad_categoria))}` : ''}
        </span>
        <button class="lote-float-close" id="lote-float-close" title="Cerrar">
          <span class="material-symbols-outlined" style="font-size:18px;">close</span>
        </button>
      </div>

      <h3 class="mapa-pop-title">${escapeHtml(lote.nombre)}</h3>

      <div class="mapa-pop-stats" style="margin-top:6px; flex-wrap:wrap; gap:8px;">
        <span><img src="sprouts.png" alt="" style="width:16px;height:16px;object-fit:contain;"> <b>${(lote.num_plantas || 0).toLocaleString()}</b> plantas de café</span>
        <span><img src="area.png" alt="" style="width:16px;height:16px;object-fit:contain;"> <b>${lote.area_ha ? parseFloat(lote.area_ha).toFixed(2) : '0.00'}</b> ha</span>
      </div>

      ${maderablesList.length > 0 || musaceasList.length > 0 ? `
        <div class="mapa-pop-chips-carousel">
          ${maderablesList.map(m => `
            <span style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; color:#1b5e20; background:#eef7ee; border:1px solid #c8e6c9; border-radius:8px; padding:3px 8px; flex-shrink:0; white-space:nowrap;">
              <span>🌲</span>
              <span>${m.qty !== null ? `<b>${m.qty.toLocaleString()}</b> ${escapeHtml(m.name)}` : escapeHtml(m.name)}</span>
            </span>
          `).join('')}
          ${musaceasList.map(m => `
            <span style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; color:#7a6000; background:#fff8e1; border:1px solid #ffe082; border-radius:8px; padding:3px 8px; flex-shrink:0; white-space:nowrap;">
              <span>🍌</span>
              <span>${m.qty !== null ? `<b>${m.qty.toLocaleString()}</b> ${escapeHtml(m.name)}` : escapeHtml(m.name)}</span>
            </span>
          `).join('')}
        </div>
      ` : ''}

      <!-- Actividades Más Recientes del Lote -->
      <div class="mapa-pop-sec" style="padding: 12px 14px; border-radius: 12px; margin-bottom: 10px; background: #fbfdfa; border: 1px solid #e2ebe0;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <span class="mapa-pop-sec-t" style="margin:0; font-size:11px; font-weight:800; text-transform:uppercase; color:#4a5d48; letter-spacing:0.3px;">Actividades Recientes</span>
          <span style="font-size:11px; font-weight:700; color:#555;">${sortedApps.length} en total</span>
        </div>

        ${recentApps.length > 0 ? recentApps.map(a => {
          const isAplicada = a.estado === 'Aplicada' || a.estado === 'Realizada';
          const isHoy = a.fecha === hoyStr;
          const isAtrasada = !isAplicada && a.fecha < hoyStr;
          const isParaHoy = !isAplicada && isHoy;
          const dias = calcDias(a.fecha);

          if (isAplicada && isHoy) {
            return `
              <div style="background:#eef7ee; border-left:4px solid #2e7d32; border-radius:8px; padding:9px 12px; margin-bottom:8px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                  <span style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:800; color:#1b5e20;">
                    <span class="material-symbols-outlined" style="font-size:17px; color:#2e7d32;">check_circle</span>
                    ${escapeHtml(a.producto || a.tipo)}
                  </span>
                  <span style="font-size:10.5px; font-weight:800; color:#1b5e20; background:rgba(46,125,50,0.15); padding:2px 7px; border-radius:6px; white-space:nowrap;">
                    🟢 Aplicada hoy
                  </span>
                </div>
              </div>
            `;
          } else if (isAplicada) {
            return `
              <div style="background:#f4f6f2; border-left:4px solid #2d3e2c; border-radius:8px; padding:9px 12px; margin-bottom:8px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                  <span style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; color:#2d3e2c;">
                    <span class="material-symbols-outlined" style="font-size:17px; color:#2d3e2c;">eco</span>
                    ${escapeHtml(a.producto || a.tipo)}
                  </span>
                  <span style="font-size:11px; color:#555; white-space:nowrap; font-weight:600;">
                    ${formatFechaStr(a.fecha)}
                  </span>
                </div>
                <div style="font-size:11px; color:#666; margin-top:3px; padding-left:23px;">
                  Aplicada ${dias === 1 ? 'ayer' : `hace ${dias} días`}
                </div>
              </div>
            `;
          } else if (isParaHoy) {
            return `
              <div style="background:#fffbe6; border-left:4px solid #f57f17; border-radius:8px; padding:9px 12px; margin-bottom:8px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                  <span style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:800; color:#e65100;">
                    <span class="material-symbols-outlined" style="font-size:17px; color:#f57f17;">today</span>
                    ${escapeHtml(a.producto || a.tipo)}
                  </span>
                  <span style="font-size:10.5px; font-weight:800; color:#e65100; background:rgba(245,127,23,0.15); padding:2px 7px; border-radius:6px; white-space:nowrap;">
                    📅 Para hoy
                  </span>
                </div>
                <div style="font-size:11px; color:#666; margin-top:3px; padding-left:23px;">
                  Programada para hoy
                </div>
              </div>
            `;
          } else if (isAtrasada) {
            return `
              <div style="background:#fff2f0; border-left:4px solid #d32f2f; border-radius:8px; padding:9px 12px; margin-bottom:8px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                  <span style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:800; color:#c62828;">
                    <span class="material-symbols-outlined" style="font-size:17px; color:#d32f2f;">warning</span>
                    ${escapeHtml(a.producto || a.tipo)}
                  </span>
                  <span style="font-size:10.5px; font-weight:800; color:#d32f2f; background:rgba(211,47,47,0.12); padding:2px 7px; border-radius:6px; white-space:nowrap;">
                    Atrasada
                  </span>
                </div>
                <div style="font-size:11px; color:#666; margin-top:3px; padding-left:23px;">
                  Venció el ${formatFechaStr(a.fecha)} (hace ${dias} días)
                </div>
              </div>
            `;
          } else {
            return `
              <div style="background:#f0f7ff; border-left:4px solid #1976d2; border-radius:8px; padding:9px 12px; margin-bottom:8px; box-shadow:0 1px 3px rgba(0,0,0,0.03);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:6px;">
                  <span style="display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; color:#0d47a1;">
                    <span class="material-symbols-outlined" style="font-size:17px; color:#1976d2;">event</span>
                    ${escapeHtml(a.producto || a.tipo)}
                  </span>
                  <span style="font-size:11px; font-weight:700; color:#1976d2; white-space:nowrap;">
                    ${formatFechaStr(a.fecha)}
                  </span>
                </div>
                <div style="font-size:11px; color:#666; margin-top:3px; padding-left:23px;">
                  Programada
                </div>
              </div>
            `;
          }
        }).join('') : `
          <div style="font-size:11.5px; color:#777; font-style:italic; padding:6px 0; text-align:center;">
            Sin labores registradas en este lote
          </div>
        `}

        ${extraCount > 0 ? `
          <div style="font-size:11px; color:#4a5d48; text-align:center; font-weight:700; padding:6px 0 2px;">
            +${extraCount} labores anteriores registradas
          </div>
        ` : ''}
      </div>

      <div style="margin-top:10px;">
        <button class="mapa-pop-btn" onclick="window.navigateTo('detalle_lote', '${lote.id}')">
          <span class="material-symbols-outlined" style="font-size:18px;">visibility</span>
          <span>Ver Detalle del Lote</span>
        </button>
      </div>
    `;
  }

  function showLotePopup(lote, apps, center) {
    if (activeLotePopup) {
      map.closePopup(activeLotePopup);
    }
    const html = `
      <div class="lote-leaflet-popup-content" style="min-width:280px; max-width:320px; font-family:'Work Sans', sans-serif;">
        ${buildPopupCardHtml(lote, apps)}
      </div>
    `;
    activeLotePopup = L.popup({
      closeButton: false,
      autoPan: true,
      autoPanPaddingTopLeft: [25, 30],
      autoPanPaddingBottomRight: [25, 30],
      offset: [0, -8],
      className: 'lote-custom-popup'
    })
    .setLatLng(center)
    .setContent(html)
    .openOn(map);

    setTimeout(() => {
      document.getElementById('lote-float-close')?.addEventListener('click', clearLoteSelection);
    }, 50);
  }

  function selectLote(id) {
    selectedLoteId = id;
    Object.values(polyByLote).forEach(({ poly, labelMarker, lote }) => {
      const selected = lote.id === id;
      if (selected) {
        if (!map.hasLayer(poly)) map.addLayer(poly);
        if (labelMarker && !map.hasLayer(labelMarker)) map.addLayer(labelMarker);
        poly.setStyle({ fillOpacity: 0.55, weight: 4.5, color: '#ffffff', opacity: 1 });
      } else {
        if (map.hasLayer(poly)) map.removeLayer(poly);
        if (labelMarker && map.hasLayer(labelMarker)) map.removeLayer(labelMarker);
      }
    });

    const sel = polyByLote[id];
    if (sel) {
      const center = sel.poly.getBounds().getCenter();
      map.panTo(center, { animate: true });
      showLotePopup(sel.lote, appsByLote[id] || [], center);
    }
  }

  function clearLoteSelection() {
    selectedLoteId = null;
    if (activeLotePopup) {
      map.closePopup(activeLotePopup);
      activeLotePopup = null;
    }
    Object.values(polyByLote).forEach(({ poly, labelMarker, lote }) => {
      const { color } = parseCoordenadasJson(lote.coordenadas_json);
      const loteColor = color || '#2d3e2c';
      if (!map.hasLayer(poly)) map.addLayer(poly);
      if (labelMarker && !map.hasLayer(labelMarker)) map.addLayer(labelMarker);
      poly.setStyle({ fillOpacity: 0.35, weight: 3, opacity: 1, color: '#ffffff', fillColor: loteColor });
    });
  }

  map.on('popupclose', () => {
    if (selectedLoteId) {
      clearLoteSelection();
    }
  });

  // Draw Lot Polygons
  withCoords.forEach(lote => {
    const { coordinates, color } = parseCoordenadasJson(lote.coordenadas_json || lote.coordenadas);
    if (!coordinates || coordinates.length < 3) return;
    const latlngs = coordinates.map(c => [c.lat, c.lng]);
    const loteColor = color || '#2d3e2c';

    const poly = L.polygon(latlngs, {
      color: '#ffffff',
      fillColor: loteColor,
      fillOpacity: 0.35,
      weight: 3,
      opacity: 1,
      lineJoin: 'round',
      lineCap: 'round'
    }).addTo(map);

    allBounds.push(poly.getBounds());

    const c = poly.getBounds().getCenter();
    const labelMarker = L.marker([c.lat, c.lng], {
      icon: L.divIcon({
        className: 'lote-label-wrap',
        html: `<div class="lote-label" style="background:${escapeHtml(loteColor)};">
          <span style="font-size:12px;">🌿</span>
          <span>${escapeHtml(lote.nombre || 'Lote')}</span>
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      }),
      interactive: false
    }).addTo(map);

    polyByLote[lote.id] = { poly, labelMarker, lote };

    poly.on('mouseover', () => {
      if (selectedLoteId !== lote.id) {
        poly.setStyle({ weight: 4.5, fillOpacity: 0.48 });
      }
    });

    poly.on('mouseout', () => {
      if (selectedLoteId !== lote.id) {
        poly.setStyle({ weight: 3, fillOpacity: 0.35 });
      }
    });

    poly.on('click', (e) => {
      selectLote(lote.id);
      L.DomEvent.stopPropagation(e);
    });
  });

  map.on('click', () => {
    clearLoteSelection();
  });

  const adjustMapView = () => {
    if (allBounds.length > 0) {
      const group = L.featureGroup(allBounds.map(b => L.rectangle(b)));
      const isMobile = window.innerWidth <= 768;
      if (isMobile) {
        // En móvil ajuste más holgado
        map.fitBounds(group.getBounds(), { padding: [30, 30] });
        const currentZoom = map.getZoom();
        map.setView(group.getBounds().getCenter(), Math.min(currentZoom + 0.15, 19));
      } else {
        map.fitBounds(group.getBounds().pad(0.12));
      }
    }
  };

  adjustMapView();
  setTimeout(() => {
    map.invalidateSize();
    adjustMapView();
  }, 120);

  // Search logic on map
  const searchToggle = document.getElementById('lotes-search-toggle');
  const searchWrapper = document.getElementById('lotes-search-wrapper');
  const searchInput = document.getElementById('lotes-search-input');
  const searchClear = document.getElementById('lotes-search-clear');

  if (searchToggle && searchInput && searchWrapper && searchClear) {
    searchToggle.addEventListener('click', () => {
      if (!searchWrapper.classList.contains('expanded') || !searchInput.style.width || searchInput.style.width === '0px') {
        searchInput.style.width = '160px';
        searchInput.style.opacity = '1';
        searchInput.style.padding = '0 8px 0 0';
        searchClear.style.display = 'flex';
        searchWrapper.classList.add('expanded');
        searchInput.focus();
      } else {
        searchInput.focus();
      }
    });

    searchClear.addEventListener('click', () => {
      currentLotesSearchQuery = '';
      searchInput.value = '';
      searchInput.style.width = '0px';
      searchInput.style.opacity = '0';
      searchInput.style.padding = '0';
      searchClear.style.display = 'none';
      searchWrapper.classList.remove('expanded');
      clearLoteSelection();
    });

    searchInput.addEventListener('input', (e) => {
      const q = (e.target.value || '').trim().toLowerCase();
      searchClear.style.display = q ? 'flex' : 'none';
      currentLotesSearchQuery = q;
      if (!q) {
        clearLoteSelection();
        return;
      }
      const match = lotes.find(l => (l.nombre || '').toLowerCase().includes(q) || (l.variedad || '').toLowerCase().includes(q));
      if (match && polyByLote[match.id]) {
        selectLote(match.id);
      }
    });
  }

  setTimeout(() => map.invalidateSize(), 300);
}

window.toggleActionMenu = (btn) => {
  const menu = btn.nextElementSibling;
  if (!menu) return;
  const isActive = menu.classList.contains('active');
  document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
  if (!isActive) menu.classList.add('active');
};

window.confirmDeleteLote = (id, name) => {
  window.Snackbar.confirm(`¿Eliminar el lote "${name}"?`, async () => {
    const { error } = await supabase.from('lotes').delete().eq('id', id);
    if (error) window.Snackbar.show('Error: ' + error.message, { type: 'error' });
    else { window.Snackbar.show('Lote eliminado'); window.clearScreenCache?.('dashboard'); window.navigateTo('dashboard'); }
  });
};
