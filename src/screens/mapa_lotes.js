import { supabase } from '../supabase.js';
import { showNamePrompt } from '../modals.js';
import { loadPuntoReferencia } from '../auth.js';

let refMarker = null;

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function parseCoordenadasJson(json) {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      return { coordinates: parsed, color: '#2d3e2c' };
    }
    return { coordinates: parsed.coordinates || [], color: parsed.color || '#2d3e2c' };
  } catch {
    return { coordinates: [], color: '#2d3e2c' };
  }
}

export async function renderMapaLotes() {
  return `
    <style>
      .mapa-page {
        height: 100%;
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-height: 0;
      }
      .mapa-summary {
        display: flex;
        align-items: center;
        gap: 12px;
        flex-wrap: wrap;
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
        flex: 1;
        min-height: 0;
        min-height: 480px;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid #e0e8e0;
        position: relative;
        background: #e8efe4;
      }
      @media (max-width: 1024px) {
        #mapa-container {
          min-height: 580px;
          height: 580px;
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
      .mapa-pop-row img {
        width: 16px;
        height: 16px;
        object-fit: contain;
        flex-shrink: 0;
      }
      .mapa-pop-row b {
        font-weight: 700;
        flex: 1;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
      }
      .mapa-pop-row .mapa-pop-date {
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
        .mapa-page { padding-bottom: 72px; }
        .mapa-chip { padding: 8px 12px; font-size: 12px; }
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
      }
      #mapa-container path.leaflet-interactive {
        filter: drop-shadow(0 2px 6px rgba(0,0,0,0.55));
        transition: stroke-width 0.15s ease, fill-opacity 0.15s ease;
        cursor: pointer;
      }
    </style>
    <div class="mapa-page">
      <div class="mapa-summary" id="mapa-summary">
        <span class="mapa-chip"><img src="mapa.png" alt=""><strong id="mapa-n-lotes">0</strong> Lotes</span>
        <span class="mapa-chip"><img src="area.png" alt=""><strong id="mapa-n-ha">0.0</strong> Hectáreas</span>
        <span class="mapa-chip"><span class="material-icons" style="font-size:18px;color:#2d3e2c;">touch_app</span>Toca una parcela para ver su detalle</span>
      </div>
      <div id="mapa-container">
        <div class="mapa-empty" id="mapa-loading">
          <div class="spinner"></div>
          <p>Cargando mapa del cafetal...</p>
        </div>
      </div>
    </div>
  `;
}

export async function initMapaLotes() {
  const container = document.getElementById('mapa-container');
  if (!container) return;

  let lotes = [];
  let aplicaciones = [];
  try {
    const [lotesRes, appsRes] = await Promise.all([
      supabase.from('lotes').select('*').order('nombre', { ascending: true }),
      supabase.from('lote_aplicaciones').select('*').neq('estado', 'Programada').order('fecha', { ascending: false })
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

  const withCoords = lotes.filter(l => l.coordenadas_json);
  const totalHa = lotes.reduce((s, l) => s + (parseFloat(l.area_ha) || 0), 0);
  document.getElementById('mapa-n-lotes').textContent = lotes.length;
  document.getElementById('mapa-n-ha').textContent = totalHa.toFixed(1);

  container.innerHTML = `
    <button id="mapa-layers-btn" class="mapa-layers-btn" title="Cambiar mapa base">
      <span class="material-icons" style="font-size:16px;">layers</span>
      <span id="mapa-layers-label">Esri Sat.</span>
    </button>
  `;

  const map = L.map(container, {
    center: [14.5, -88.5],
    zoom: 9,
    maxZoom: 22,
    zoomControl: false,
    attributionControl: false
  });
  // Si hay lotes con polígono, se ajusta la vista a ellos; si no, centra en el punto de referencia de la finca
  setTimeout(async () => {
    const ref = await loadPuntoReferencia(window._currentEmpresaId).catch(() => null);
    if (ref) {
      const nombre = String(ref.nombre || '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
      if (refMarker) map.removeLayer(refMarker);
      refMarker = L.marker([ref.lat, ref.lng], {
        icon: L.divIcon({
          className: 'ref-label-icon',
          html: '<span class="material-icons" style="font-size:38px;color:#e53935;text-shadow:0 0 3px #fff,0 0 6px #fff;">place</span><span class="ref-label-text">' + nombre + '</span>',
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
  L.control.attribution({
    position: 'bottomleft',
    prefix: false
  }).addTo(map).addAttribution('Geocoding &copy; Geocode.XYZ');
  const layersBtnEl = document.getElementById('mapa-layers-btn');
  layersBtnEl.style.background = '#1b5e20';
  layersBtnEl.style.color = '#ffffff';

  // ── Capas satelitales especializadas para fincas (Default: Esri Satélite) ──
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
  const btnLayers = document.getElementById('mapa-layers-btn');
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
    const areaResults = lotes
      .filter(l => l.nombre && l.nombre.toLowerCase().includes(q))
      .map(l => {
        const { coordinates } = parseCoordenadasJson(l.coordenadas_json);
        const bounds = coordinates && coordinates.length >= 3
          ? L.latLngBounds(coordinates.map(c => [c.lat, c.lng]))
          : null;
        return {
          name: l.nombre,
          center: bounds ? bounds.getCenter() : null,
          bbox: bounds,
          _lote: l
        };
      });
    if (areaResults.length) {
      cb.call(ctx, areaResults);
      return;
    }
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

    if (gc._lote) {
      return;
    }

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
  withCoords.forEach(lote => {
    const { coordinates, color } = parseCoordenadasJson(lote.coordenadas_json);
    if (!coordinates || coordinates.length < 3) return;
    const latlngs = coordinates.map(c => [c.lat, c.lng]);

    const loteColor = color || '#2e7d32';
    const poly = L.polygon(latlngs, {
      color: loteColor,
      fillColor: loteColor,
      fillOpacity: 0.30,
      weight: 3.5,
      opacity: 1,
      lineJoin: 'round',
      lineCap: 'round'
    }).addTo(map);
    allBounds.push(poly.getBounds());

    poly.on('mouseover', () => {
      poly.setStyle({ weight: 5, fillOpacity: 0.45 });
    });
    poly.on('mouseout', () => {
      poly.setStyle({ weight: 3.5, fillOpacity: 0.30 });
    });

    poly.bindPopup(buildPopupHtml(lote, appsByLote[lote.id] || []));

    const c = poly.getBounds().getCenter();
    L.marker([c.lat, c.lng], {
      icon: L.divIcon({
        className: 'potrero-label-wrap',
        html: `<div class="potrero-label" style="background:${escapeHtml(loteColor)};">
          <span class="material-icons" style="font-size:13px;color:#ffffff;">grass</span>
          <span>${escapeHtml(lote.nombre || 'Lote')}</span>
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

  function findSavedPoint(lat, lng) {
    return loadSavedPoints().findIndex(x => x.lat === lat && x.lng === lng);
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
  const d = new Date(fecha);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function buildPopupHtml(lote, apps) {
  const fertilizantes = (apps || []).filter(a => a.tipo === 'Fertilizante').slice(0, 3);
  const limpiezas = (apps || []).filter(a => a.tipo === 'Limpieza').slice(0, 3);

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

  const abonoHtml = fertilizantes.length > 0
    ? fertilizantes.map(a => `
        <div class="mapa-pop-row">
          <img src="fertilizante.png" alt="">
          <b>${a.producto || 'Abono'}</b>
          <span class="mapa-pop-date">${fmtFecha(a.fecha)}</span>
        </div>`).join('')
    : '<div class="mapa-pop-empty">Sin abono aplicado aún</div>';

  const limpiezaHtml = limpiezas.length > 0
    ? limpiezas.map(a => `
        <div class="mapa-pop-row">
          <img src="sale-de.png" alt="">
          <b>${a.producto || 'Limpieza'}</b>
          <span class="mapa-pop-date">${fmtFecha(a.fecha)}</span>
        </div>`).join('')
    : '<div class="mapa-pop-empty">Sin limpieza registrada</div>';

  return `
    <div class="mapa-pop">
      <div class="mapa-pop-head">
        <span class="mapa-pop-title">${lote.nombre}</span>
        <span class="mapa-pop-badge" style="display:inline-flex; align-items:center; gap:6px; background:#eef7ee; color:#1b5e20; border:1px solid #c8e6c9; font-weight:800; font-size:11.5px; padding:4px 10px; border-radius:12px;">
          ${lote.variedad || 'Café'}${lote.edad_categoria ? ` · 🌱 ${formatEdadLabel(lote.edad_categoria)}` : ''}
        </span>
      </div>
      <div class="mapa-pop-stats" style="flex-wrap:wrap; gap:8px;">
        <span><img src="sprouts.png" alt=""><b>${(lote.num_plantas || 0).toLocaleString()}</b> plantas de café</span>
        <span><img src="area.png" alt=""><b>${lote.area_ha ? parseFloat(lote.area_ha).toFixed(2) : '0.00'}</b> ha</span>
      </div>

      ${maderablesList.length > 0 || musaceasList.length > 0 ? `
        <div class="mapa-pop-chips-carousel" style="display:flex; gap:6px; overflow-x:auto; padding: 2px 0 6px; margin: 6px 0 10px; scrollbar-width: thin; -webkit-overflow-scrolling: touch;">
          ${maderablesList.map(m => `
            <span style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; color:#1b5e20; background:#eef7ee; border:1px solid #c8e6c9; border-radius:8px; padding:3px 8px; flex-shrink:0; white-space:nowrap;">
              <span>🌲</span>
              <span>${m.qty !== null ? `<b>${m.qty.toLocaleString()}</b> ${m.name}` : m.name}</span>
            </span>
          `).join('')}
          ${musaceasList.map(m => `
            <span style="display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; color:#7a6000; background:#fff8e1; border:1px solid #ffe082; border-radius:8px; padding:3px 8px; flex-shrink:0; white-space:nowrap;">
              <span>🍌</span>
              <span>${m.qty !== null ? `<b>${m.qty.toLocaleString()}</b> ${m.name}` : m.name}</span>
            </span>
          `).join('')}
        </div>
      ` : ''}

      <div class="mapa-pop-sec">
        <span class="mapa-pop-sec-t">Abono / Fertilización</span>
        ${abonoHtml}
      </div>
      <div class="mapa-pop-sec">
        <span class="mapa-pop-sec-t">Limpieza</span>
        ${limpiezaHtml}
      </div>
      <button class="mapa-pop-btn" onclick="window.navigateTo('detalle_lote','${lote.id}')">Ver detalle completo</button>
    </div>
  `;
}
