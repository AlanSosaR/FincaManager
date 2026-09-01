import { supabase } from '../supabase.js';
import { loadPuntoReferencia } from '../auth.js';

let currentPotrerosSearchQuery = '';
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

// ─── Main render ──────────────────────────────────────────────────────────────

export async function renderPotreros() {
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
      .mapa-summary {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
        position: relative;
        z-index: 1100;
        padding-bottom: 8px;
      }
      .mapa-chip {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 10px 16px;
        background: var(--m3-surface-container-low);
        border-radius: 12px;
        font-family: 'Work Sans', sans-serif;
        font-size: 13px;
        font-weight: 600;
        color: #2d3e2c;
      }
      .mapa-chip img {
        width: 18px;
        height: 18px;
        object-fit: contain;
      }
      .mapa-chip strong {
        font-size: 16px;
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
        box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      }
      .mapa-empty {
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        gap: 12px;
        height: 100%;
        color: #888;
        text-align: center;
        font-family: 'Work Sans', sans-serif;
      }
      .mapa-reg-btn {
        position: absolute;
        bottom: 16px;
        right: 16px;
        z-index: 1000;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 12px 18px;
        border: none;
        border-radius: 999px;
        background: #2d3e2c;
        color: #fff;
        font-family: 'Work Sans', sans-serif;
        font-size: 13px;
        font-weight: 700;
        cursor: pointer;
        box-shadow: 0 4px 14px rgba(0,0,0,0.25);
      }
      .mapa-detail-panel {
        position: absolute;
        left: 12px;
        right: 12px;
        bottom: 12px;
        z-index: 1100;
        background: #ffffff;
        border-radius: 14px;
        box-shadow: 0 6px 24px rgba(0,0,0,0.25);
        padding: 14px 16px;
        font-family: 'Work Sans', sans-serif;
        border: 1px solid #e0e8e0;
        max-height: 46%;
        overflow-y: auto;
      }
      .mapa-detail-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 8px;
        margin-bottom: 8px;
      }
      .mapa-detail-title {
        margin: 0;
        color: #2d3e2c;
        font-size: 17px;
        font-weight: 800;
        display: flex;
        align-items: center;
        gap: 8px;
      }
      .mapa-detail-close {
        background: none;
        border: none;
        cursor: pointer;
        color: #777;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 4px;
        border-radius: 50%;
      }
      .mapa-detail-close:hover {
        background: #f2f4f0;
      }
      .mapa-reg-btn:hover {
        background: #3d5240;
      }
      #potreros-search-input::placeholder {
        color: rgba(255,255,255,0.65);
      }
      .mapa-pop {
        font-family: 'Work Sans', sans-serif;
        width: 300px;
      }
      .leaflet-popup-content-wrapper {
        border-radius: 16px;
        box-shadow: 0 10px 34px rgba(0,0,0,0.35);
        border: 1px solid #dce6da;
      }
      .leaflet-popup-content {
        margin: 14px 16px;
      }
      .leaflet-popup-tip {
        box-shadow: 0 4px 14px rgba(0,0,0,0.15);
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
      .mapa-pop-stats img {
        width: 15px;
        height: 15px;
        object-fit: contain;
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
      .mapa-pop-date {
        color: #888;
        font-size: 11px;
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
      @media (max-width: 600px) {
        .mapa-chip { padding: 8px 12px; font-size: 12px; }
        .mapa-page { padding-bottom: 24px; }
        .leaflet-control-geocoder.leaflet-control-geocoder-expanded {
          width: calc(100vw - 80px) !important;
        }
      }
      .leaflet-top.leaflet-right {
        top: 64px;
      }
      .potrero-label {
        position: absolute;
        left: 50%;
        top: 50%;
        transform: translate(-50%, -50%);
        color: #ffffff;
        font-size: 11px;
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
        gap: 4px;
        text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      }
      #mapa-container path.leaflet-interactive {
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.55));
        transition: stroke-width 0.15s ease, fill-opacity 0.15s ease;
        cursor: pointer;
      }
      .potrero-float-card {
        position: absolute;
        z-index: 1400;
        max-width: 320px;
        width: 320px;
        background: #ffffff;
        border-radius: 16px;
        box-shadow: 0 12px 40px rgba(0,0,0,0.35);
        border: 1px solid #e0e8e0;
        padding: 14px 16px;
        left: 50%;
        transform: translateX(-50%);
        font-family: 'Work Sans', sans-serif;
      }
      .potrero-float-tip {
        position: absolute;
        bottom: -10px;
        left: 50%;
        transform: translateX(-50%);
        width: 0;
        height: 0;
        border-left: 10px solid transparent;
        border-right: 10px solid transparent;
        border-top: 10px solid #ffffff;
        filter: drop-shadow(0 2px 2px rgba(0,0,0,0.15));
      }
      .potrero-float-close {
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
        margin-right: 4px;
      }
      .potrero-float-close:hover {
        background: #f2f4f0;
      }
    </style>
    <div class="screen-potreros" style="padding-bottom: 80px;">
      <div class="ganado-top-actions-container" style="display:flex;justify-content:flex-end;gap:10px;margin:16px 0 8px;">
        <div class="ganado-split-ctrl ${currentPotrerosSearchQuery ? 'expanded' : ''}" id="potreros-search-wrapper">
          <button id="potreros-search-toggle" class="m3-icon-btn-tonal" style="margin:0;box-shadow:none;width:48px;height:48px;display:flex;align-items:center;justify-content:center;" title="Buscar potrero">
            <span class="material-icons" style="color:#ffffff;">search</span>
          </button>
          <input type="text" id="potreros-search-input" placeholder="Buscar potrero..." value="${currentPotrerosSearchQuery}" style="border:none;background:transparent;outline:none;font-size:15px;width:${currentPotrerosSearchQuery ? '180px' : '0px'};transition:width 0.3s;opacity:${currentPotrerosSearchQuery ? '1' : '0'};padding:${currentPotrerosSearchQuery ? '0 8px 0 0' : '0'};color:#ffffff;">
          <button id="potreros-search-clear" style="background:none;border:none;cursor:pointer;display:${currentPotrerosSearchQuery ? 'flex' : 'none'};align-items:center;justify-content:center;padding:0 16px 0 8px;color:#ffffff;height:100%;" title="Limpiar búsqueda">
            <span class="material-icons" style="font-size:20px;">close</span>
          </button>
          <span class="ganado-split-ctrl-sep"></span>
          <button class="ganado-split-ctrl-reg" onclick="window.togglePotrerosSplitMenu(event)" title="Más opciones">
            <span class="material-icons">arrow_drop_down</span>
          </button>
          <div class="ganado-split-menu" id="potreros-split-menu">
            <button class="ganado-split-item" onclick="window.navigateTo('nuevo_potrero'); document.getElementById('potreros-split-menu').classList.remove('open');">
              <span class="material-icons">add</span><span>Registrar potrero</span>
            </button>
          </div>
        </div>
      </div>
      <div class="ganado-page-title" style="margin-top: -10px; margin-bottom: 24px;">
        <h2>Potreros <span id="mapa-title-count" style="font-weight:500;font-size:22px;color:var(--on-surface-variant);"></span></h2>
      </div>

      <div class="da-tabs-section" style="margin-top: 10px;">
        <div style="position: relative;">
          <div class="ganado-tag-stat" style="background: #fdfdfd; border-radius: 16px; padding: 13px 18px; box-shadow: 0 2px 10px rgba(0,0,0,0.05); border: 1.5px solid rgba(45,62,44,0.12); margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between; width: 100%; box-sizing: border-box; cursor: default;">
            <div style="display: flex; align-items: center; gap: 14px;">
              <span class="ganado-tag-swatch" style="background: rgba(45,62,44,0.08); border-radius: 12px; width: 44px; height: 44px; display: flex; align-items: center; justify-content: center;"><img src="mapa.png" alt="" style="width: 24px; height: 24px; object-fit: contain;"></span>
              <div style="display: flex; flex-direction: column;">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <span style="font-size: 16px; font-weight: 800; color: #2d3e2c;">Mapa de Potreros</span>
                  <span id="mapa-ha-text" style="font-size: 12px; font-weight: 700; color: #2d3e2c; background: #eef4ec; border: 1px solid #d4dfd2; padding: 2px 10px; border-radius: 99px;">0 Hectáreas</span>
                </div>
                <span style="font-size: 11.5px; color: #666; font-weight: 600; display: flex; align-items: center; gap: 4px; margin-top: 2px;">
                  <span class="material-icons" style="font-size: 14px; color: #2d3e2c;">touch_app</span> Toca un potrero para ver su detalle
                </span>
              </div>
            </div>
          </div>

          <div id="mapa-container">
            <div class="mapa-empty" id="mapa-loading">
              <div class="spinner"></div>
              <p>Cargando mapa de potreros...</p>
            </div>
          </div>
          <div id="potrero-float-card" class="potrero-float-card" style="display:none;"></div>
        </div>
      </div>
    </div>
  `;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export async function initPotreros() {
  const container = document.getElementById('mapa-container');
  if (!container) return;

  let potreros = [];
  let eventos = [];
  try {
    const [potrerosRes, eventosRes] = await Promise.all([
      supabase.from('potreros').select('*').order('nombre', { ascending: true }),
      supabase.from('potrero_eventos').select('*').order('fecha', { ascending: false })
    ]);
    if (potrerosRes.error) throw potrerosRes.error;
    if (eventosRes.error) throw eventosRes.error;
    potreros = potrerosRes.data || [];
    eventos = eventosRes.data || [];
  } catch (e) {
    container.innerHTML = '<div class="mapa-empty"><span class="material-icons" style="font-size:40px;">cloud_off</span><p>Error cargando los potreros: ' + e.message + '</p></div>';
    return;
  }

  const eventosByPotrero = {};
  (eventos || []).forEach(ev => {
    if (!eventosByPotrero[ev.potrero_id]) eventosByPotrero[ev.potrero_id] = [];
    eventosByPotrero[ev.potrero_id].push(ev);
  });

  const withCoords = potreros.filter(p => p.coordenadas_json || p.coordenadas);
  const totalHa = potreros.reduce((s, p) => s + (parseFloat(p.area) || 0), 0);
  document.getElementById('mapa-title-count').textContent = `(${potreros.length})`;
  document.getElementById('mapa-ha-text').textContent = `${totalHa.toFixed(2)} Hectáreas`;

  container.innerHTML = '';

  const map = L.map(container, {
    center: [14.08572, -86.17865],
    zoom: 15,
    maxZoom: 22,
    zoomControl: false,
    attributionControl: false
  });

  const btnLayers = document.createElement('button');
  btnLayers.id = 'mapa-layers-btn';
  btnLayers.className = 'mapa-layers-btn';
  btnLayers.title = 'Cambiar mapa base';
  btnLayers.style.background = '#1b5e20';
  btnLayers.style.color = '#ffffff';
  btnLayers.innerHTML = `
    <span class="material-icons" style="font-size:16px;">layers</span>
    <span id="mapa-layers-label">Esri Sat.</span>
  `;
  container.appendChild(btnLayers);

  // Si hay potreros con polígono, se ajusta la vista a ellos; si no, centra en el punto de referencia de la finca
  setTimeout(async () => {
    const ref = await loadPuntoReferencia(window._currentEmpresaId).catch(() => null);
    if (ref) {
      if (refMarker) map.removeLayer(refMarker);
      refMarker = L.marker([ref.lat, ref.lng], {
        icon: L.divIcon({
          className: 'ref-label-icon',
          html: '<span class="material-icons" style="font-size:38px;color:#e53935;text-shadow:0 0 3px #fff,0 0 6px #fff;">place</span><span class="ref-label-text">' + escapeHtml(ref.nombre || '') + '</span>',
          iconSize: null,
          iconAnchor: [19, 38]
        }),
        interactive: false
      }).addTo(map);
    }
    if (allBounds.length > 0) {
      const group = L.featureGroup(allBounds.map(b => L.rectangle(b)));
      map.fitBounds(group.getBounds().pad(0.1));
    } else if (ref) {
      map.setView([ref.lat, ref.lng], 15);
    }
    setTimeout(() => map.invalidateSize(), 200);
  }, 50);

  // ── Capas satelitales especializadas para fincas (Default: Esri Satélite) ──
  const esriSatLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 22,
    maxNativeZoom: 18
  }).addTo(map);

  const googleSatLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    attribution: 'Imagery &copy; Google',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    maxZoom: 22,
    maxNativeZoom: 20
  });

  const labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 22,
    maxNativeZoom: 19,
    opacity: 0.8
  }).addTo(map);

  // Fallback si Esri satélite falla
  let esriFailed = false;
  esriSatLayer.on('tileerror', function() {
    if (esriFailed) return;
    esriFailed = true;
    if (map.hasLayer(esriSatLayer)) {
      map.removeLayer(esriSatLayer);
      map.addLayer(googleSatLayer);
      window.Snackbar?.show('Cambiado a Google Satélite automáticamente', 'info');
    }
  });

  // Zoom controls
  L.Control.CustomZoom = L.Control.extend({
    onAdd: function() {
      const div = L.DomUtil.create('div', 'm3-map-zoom');
      div.innerHTML = `
        <button class="m3-zoom-btn" id="mapa-zoom-in" title="Acercar">
          <span class="material-icons">add</span>
        </button>
        <div class="m3-zoom-divider"></div>
        <button class="m3-zoom-btn" id="mapa-zoom-out" title="Alejar">
          <span class="material-icons">remove</span>
        </button>
      `;
      L.DomEvent.disableClickPropagation(div);
      return div;
    }
  });
  new L.Control.CustomZoom({ position: 'topright' }).addTo(map);
  setTimeout(() => {
    document.getElementById('mapa-zoom-in')?.addEventListener('click', () => map.zoomIn());
    document.getElementById('mapa-zoom-out')?.addEventListener('click', () => map.zoomOut());
  }, 200);

  // Layer toggle: 0 = Esri Satélite (Claridad), 1 = Google Satélite (Híbrido), 2 = Satélite Limpio
  let layerMode = 0;
  const layersLabel = document.getElementById('mapa-layers-label');
  btnLayers.addEventListener('click', () => {
    layerMode = (layerMode + 1) % 3;
    map.removeLayer(esriSatLayer);
    map.removeLayer(googleSatLayer);
    map.removeLayer(labelsLayer);
    if (layerMode === 0) {
      map.addLayer(esriSatLayer);
      map.addLayer(labelsLayer);
      btnLayers.style.background = '#1b5e20';
      btnLayers.style.color = '#ffffff';
      if (layersLabel) layersLabel.textContent = 'Esri Sat.';
      window.Snackbar?.show('Capa: Esri Satélite (Claridad agrícola)', { duration: 1500 });
    } else if (layerMode === 1) {
      map.addLayer(googleSatLayer);
      map.addLayer(labelsLayer);
      btnLayers.style.background = '#2d3e2c';
      btnLayers.style.color = '#ffffff';
      if (layersLabel) layersLabel.textContent = 'Google Sat.';
      window.Snackbar?.show('Capa: Google Satélite', { duration: 1500 });
    } else {
      map.addLayer(esriSatLayer);
      btnLayers.style.background = '#37474f';
      btnLayers.style.color = '#ffffff';
      if (layersLabel) layersLabel.textContent = 'Sat. Limpio';
      window.Snackbar?.show('Capa: Satélite Limpio (Sin textos)', { duration: 1500 });
    }
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
          const c = map.getCenter();
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

  const geocoder = L.Control.geocoder({
    defaultMarkGeocode: false,
    collapsed: true,
    expand: 'click',
    position: 'topleft',
    placeholder: 'Buscar lugar, ciudad, coordenadas o plus code...',
    errorMessage: 'No se encontró el lugar. Intenta con un plus code de Google Maps (ej. 3RPC+5C)',
    suggestTimeout: 250,
    queryMinLength: 2,
    geocoder: searchGeocoder
  }).addTo(map);

  setTimeout(() => {
    const iconEl = document.querySelector('.leaflet-control-geocoder-icon');
    if (iconEl) {
      iconEl.innerHTML = '<span class="material-icons" style="font-size:22px;color:#444;line-height:48px;">search</span>';
      iconEl.title = 'Buscar lugar';
    }
  }, 500);

  let tempMarker = null;
  geocoder.on('markgeocode', function(e) {
    const gc = e.geocode;
    const bbox = gc.bbox;
    if (bbox) map.fitBounds(bbox, { padding: [40, 40] });

    if (gc._savedPoint) {
      return;
    }

    if (tempMarker) map.removeLayer(tempMarker);
    const icon = L.divIcon({
      className: 'mapa-saved-icon',
      html: '<span class="material-icons" style="font-size:20px;color:#ffffff;line-height:36px;">place</span>',
      iconSize: [36, 36],
      iconAnchor: [18, 36]
    });
    tempMarker = L.marker(gc.center, { icon }).addTo(map);

    const defaultName = gc.name || ('Punto ' + (gc.center ? gc.center.lat.toFixed(5) + ', ' + gc.center.lng.toFixed(5) : ''));
    tempMarker.on('click', () => {
      showSaveBar(defaultName, (nombre) => {
        saveSavedPoint({ name: nombre, lat: gc.center.lat, lng: gc.center.lng });
        addSavedMarker({ name: nombre, lat: gc.center.lat, lng: gc.center.lng });
        if (tempMarker) { map.removeLayer(tempMarker); tempMarker = null; }
      });
    });
  });

  function showSaveBar(currentName, onSave, onDelete) {
    let saveBar = document.getElementById('temp-save-bar');
    if (!saveBar) {
      saveBar = document.createElement('div');
      saveBar.id = 'temp-save-bar';
      saveBar.className = 'temp-save-bar';
      saveBar.innerHTML = `
        <input type="text" id="temp-marker-name" placeholder="Nombre del punto">
        <button id="temp-del-btn" style="display:none;padding:8px 14px;border:none;border-radius:10px;background:#c62828;color:#fff;font-weight:700;font-size:12px;cursor:pointer;font-family:'Work Sans',sans-serif;white-space:nowrap;">Eliminar</button>
        <button id="temp-save-btn">Guardar</button>
      `;
      container.appendChild(saveBar);
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

  // Draw all parcels
  const allBounds = [];
  const polyByPotrero = {};
  let selectedPotreroId = null;

  function selectPotrero(id) {
    selectedPotreroId = id;
    Object.values(polyByPotrero).forEach(({ poly, potrero }) => {
      const selected = potrero.id === id;
      if (selected) {
        if (!map.hasLayer(poly)) map.addLayer(poly);
        poly.setStyle({ fillOpacity: 0.48, weight: 5, opacity: 1 });
      } else if (map.hasLayer(poly)) {
        map.removeLayer(poly);
      }
    });
    const sel = polyByPotrero[id];
    if (sel) {
      map.fitBounds(sel.poly.getBounds().pad(0.08));
      showPotreroFloatCard(sel.potrero, eventosByPotrero[id] || []);
    }
  }

  function clearPotreroSelection() {
    selectedPotreroId = null;
    hidePotreroFloatCard();
    map.closePopup();
    Object.values(polyByPotrero).forEach(({ poly, potrero }) => {
      const { color } = parseCoordenadasJson(potrero.coordenadas_json);
      const potreroColor = color || '#2e7d32';
      if (!map.hasLayer(poly)) map.addLayer(poly);
      poly.setStyle({ fillOpacity: 0.30, weight: 3.5, opacity: 1, color: potreroColor, fillColor: potreroColor });
    });
    fitToParcels();
  }

  function showPotreroFloatCard(potrero, eventos) {
    const card = document.getElementById('potrero-float-card');
    const containerEl = document.getElementById('mapa-container');
    if (!card || !containerEl) return;
    card.innerHTML = `
      <div class="potrero-float-tip"></div>
      ${buildPopupHtml(potrero, eventos)}
    `;
    card.style.display = 'block';
    const pageEl = card.closest('.mapa-page') || document.body;
    const pageRect = pageEl.getBoundingClientRect();
    const cardHeight = card.offsetHeight;
    card.style.top = Math.max(0, (pageRect.height - cardHeight) / 2) + 'px';
    document.getElementById('potrero-float-close')?.addEventListener('click', clearPotreroSelection);
  }

  function hidePotreroFloatCard() {
    const card = document.getElementById('potrero-float-card');
    if (card) card.style.display = 'none';
  }

  withCoords.forEach(potrero => {
    const { coordinates, color } = parseCoordenadasJson(potrero.coordenadas_json || potrero.coordenadas);
    if (!coordinates || coordinates.length < 3) return;
    const latlngs = coordinates.map(c => [c.lat, c.lng]);
    const potreroColor = color || '#2e7d32';

    const poly = L.polygon(latlngs, {
      color: potreroColor,
      fillColor: potreroColor,
      fillOpacity: 0.30,
      weight: 3.5,
      opacity: 1,
      lineJoin: 'round',
      lineCap: 'round'
    }).addTo(map);
    allBounds.push(poly.getBounds());
    polyByPotrero[potrero.id] = { poly, potrero };

    poly.on('mouseover', () => {
      if (selectedPotreroId !== potrero.id) {
        poly.setStyle({ weight: 5, fillOpacity: 0.45 });
      }
    });

    poly.on('mouseout', () => {
      if (selectedPotreroId !== potrero.id) {
        poly.setStyle({ weight: 3.5, fillOpacity: 0.30 });
      }
    });

    poly.on('click', (e) => {
      selectPotrero(potrero.id);
      L.DomEvent.stopPropagation(e);
    });

    const c = poly.getBounds().getCenter();
    L.marker([c.lat, c.lng], {
      icon: L.divIcon({
        className: 'potrero-label-wrap',
        html: `<div class="potrero-label" style="background:${escapeHtml(potreroColor)};">
          <span class="material-icons" style="font-size:13px;color:#ffffff;">grass</span>
          <span>${escapeHtml(potrero.nombre || 'Potrero')}</span>
        </div>`,
        iconSize: [0, 0],
        iconAnchor: [0, 0]
      }),
      interactive: false
    }).addTo(map);
  });

  const fitToParcels = () => {
    if (allBounds.length > 0) {
      const group = L.featureGroup(allBounds.map(b => L.rectangle(b)));
      map.fitBounds(group.getBounds().pad(0.1));
    }
  };

  fitToParcels();

  map.on('click', () => clearPotreroSelection());

  // ── Split control: búsqueda por nombre + registro ──
  window.togglePotrerosSplitMenu = (e) => {
    e?.stopPropagation();
    const menu = document.getElementById('potreros-split-menu');
    if (menu) menu.classList.toggle('open');
  };
  document.addEventListener('click', (e) => {
    const menu = document.getElementById('potreros-split-menu');
    if (menu && !e.target.closest('.ganado-split-ctrl')) menu.classList.remove('open');
  });

  const searchToggle  = document.getElementById('potreros-search-toggle');
  const searchWrapper = document.getElementById('potreros-search-wrapper');
  const searchInput   = document.getElementById('potreros-search-input');
  const searchClear   = document.getElementById('potreros-search-clear');

  if (searchToggle && searchInput && searchWrapper && searchClear) {
    searchToggle.addEventListener('click', () => {
      if (!searchInput.style.width || searchInput.style.width === '0px') {
        searchInput.style.width = '180px';
        searchInput.style.opacity = '1';
        searchInput.style.padding = '0 8px 0 0';
        searchClear.style.display = 'flex';
        searchWrapper.classList.add('expanded');
        searchInput.focus();
      } else {
        searchInput.style.width = '0px';
        searchInput.style.opacity = '0';
        searchInput.style.padding = '0';
        searchClear.style.display = 'none';
        searchWrapper.classList.remove('expanded');
        searchInput.value = '';
        applyPotreroSearch('');
      }
    });

    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      applyPotreroSearch('');
      searchInput.style.width = '0px';
      searchInput.style.opacity = '0';
      searchInput.style.padding = '0';
      searchClear.style.display = 'none';
      searchWrapper.classList.remove('expanded');
      fitToParcels();
    });

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        currentPotrerosSearchQuery = e.target.value.trim();
        applyPotreroSearch(currentPotrerosSearchQuery);
      }, 250);
    });
  }

  function applyPotreroSearch(q) {
    const ql = q.toLowerCase();
    let bounds = [];
    Object.values(polyByPotrero).forEach(({ poly, potrero }) => {
      const hit = !ql || (potrero.nombre || '').toLowerCase().includes(ql);
      if (hit) {
        if (!map.hasLayer(poly)) map.addLayer(poly);
        bounds.push(poly.getBounds());
      } else if (map.hasLayer(poly)) {
        map.removeLayer(poly);
      }
    });
    if (bounds.length > 0) {
      const group = L.featureGroup(bounds.map(b => L.rectangle(b)));
      map.fitBounds(group.getBounds().pad(0.1));
    }
  }

  // ── Puntos guardados (persistentes por empresa) ──
  const puntosKey = 'finca_puntos_guardados_' + (window._currentEmpresaId || 'default');

  function loadSavedPoints() {
    try {
      return JSON.parse(localStorage.getItem(puntosKey)) || [];
    } catch {
      return [];
    }
  }

  function saveSavedPoint(p) {
    const pts = loadSavedPoints();
    pts.push(p);
    localStorage.setItem(puntosKey, JSON.stringify(pts));
  }

  function removeSavedPoint(lat, lng) {
    const pts = loadSavedPoints();
    const idx = pts.findIndex(x => x.lat === lat && x.lng === lng);
    if (idx >= 0) pts.splice(idx, 1);
    localStorage.setItem(puntosKey, JSON.stringify(pts));
  }

  function renameSavedPoint(lat, lng, name) {
    const pts = loadSavedPoints();
    const p = pts.find(x => x.lat === lat && x.lng === lng);
    if (p) {
      p.name = name;
      localStorage.setItem(puntosKey, JSON.stringify(pts));
    }
  }

  const savedPointsGroup = L.featureGroup().addTo(map);

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

  setTimeout(() => { map.invalidateSize(); fitToParcels(); }, 250);
  setTimeout(() => { map.invalidateSize(); fitToParcels(); }, 600);
}

function fmtFecha(fecha) {
  if (!fecha) return '';
  const d = new Date(fecha);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-HN', { day: '2-digit', month: 'short', year: 'numeric' });
}

function statusLabel(status) {
  return {
    libre: 'Libre',
    ocupado: 'Ocupado',
    pastoreo: 'Ocupado',
    recuperando: 'En descanso',
    descanso: 'En descanso'
  }[status] || 'Libre';
}

function buildPopupHtml(potrero, eventos) {
  const ultimosEventos = (eventos || []).slice(0, 3);
  const eventosHtml = ultimosEventos.length > 0
    ? ultimosEventos.map(ev => `
        <div class="mapa-pop-row">
          <span class="material-icons" style="font-size:14px;color:#7a8a76;flex-shrink:0;">${ev.icon || 'history'}</span>
          <b>${ev.evento || 'Evento'}</b>
          <span class="mapa-pop-date">${fmtFecha(ev.fecha)}</span>
        </div>`).join('')
    : '<div class="mapa-pop-empty">Sin eventos registrados</div>';

  return `
    <div class="mapa-pop">
      <div class="mapa-pop-head">
        <button class="potrero-float-close" id="potrero-float-close" title="Cerrar">
          <span class="material-icons" style="font-size:20px;">close</span>
        </button>
        <span class="mapa-pop-title">${potrero.nombre || 'Potrero'}</span>
        <span class="mapa-pop-badge">${statusLabel(potrero.status)}</span>
      </div>
      <div class="mapa-pop-stats">
        <span><img src="area.png" alt="">${potrero.area ? parseFloat(potrero.area).toFixed(2) : '0.00'} ha</span>
      </div>
      <div class="mapa-pop-sec">
        <span class="mapa-pop-sec-t">Semilla / Tipo de Pasto</span>
        <div class="mapa-pop-row"><b>${potrero.pasto || 'Natural'}</b></div>
      </div>
      <div class="mapa-pop-sec">
        <span class="mapa-pop-sec-t">Últimos Eventos</span>
        ${eventosHtml}
      </div>
      <button class="mapa-pop-btn" onclick="window.navigateTo('detalle_potrero','${potrero.id}')">Ver detalle completo</button>
    </div>
  `;
}