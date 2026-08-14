import { supabase } from '../supabase.js';

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
        min-height: 360px;
        border-radius: 12px;
        overflow: hidden;
        border: 1px solid #e0e8e0;
        position: relative;
        background: #e8efe4;
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
        .mapa-chip { padding: 8px 12px; font-size: 12px; }
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
      <span id="mapa-layers-label">Satélite</span>
    </button>
  `;

  const map = L.map(container, {
    center: [14.5, -88.5],
    zoom: 9,
    maxZoom: 19,
    zoomControl: false,
    attributionControl: false
  });
  const layersBtnEl = document.getElementById('mapa-layers-btn');
  layersBtnEl.style.background = '#2d3e2c';
  layersBtnEl.style.color = '#ffffff';

  const streetLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap, CARTO',
    maxZoom: 19,
    maxNativeZoom: 18,
    subdomains: 'abcd'
  });

  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
    maxNativeZoom: 18
  }).addTo(map);

  const labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    opacity: 0.8
  }).addTo(map);

  const terrainLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
    maxNativeZoom: 18
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

  // Layer toggle (starts on satellite)
  let layerMode = 1;
  const btnLayers = document.getElementById('mapa-layers-btn');
  const layersLabel = document.getElementById('mapa-layers-label');
  btnLayers.addEventListener('click', () => {
    layerMode = (layerMode + 1) % 3;
    map.removeLayer(streetLayer);
    map.removeLayer(satelliteLayer);
    map.removeLayer(labelsLayer);
    map.removeLayer(terrainLayer);
    if (layerMode === 0) {
      map.addLayer(streetLayer);
      btnLayers.style.background = '#ffffff';
      btnLayers.style.color = '#2d3e2c';
      if (layersLabel) layersLabel.textContent = 'Calle';
    } else if (layerMode === 1) {
      map.addLayer(satelliteLayer);
      map.addLayer(labelsLayer);
      btnLayers.style.background = '#2d3e2c';
      btnLayers.style.color = '#ffffff';
      if (layersLabel) layersLabel.textContent = 'Satélite';
    } else {
      map.addLayer(terrainLayer);
      btnLayers.style.background = '#fff3e0';
      btnLayers.style.color = '#e65100';
      if (layersLabel) layersLabel.textContent = 'Relieve';
    }
  });

  // Draw all parcels
  const allBounds = [];
  withCoords.forEach(lote => {
    const { coordinates, color } = parseCoordenadasJson(lote.coordenadas_json);
    if (!coordinates || coordinates.length < 3) return;
    const latlngs = coordinates.map(c => [c.lat, c.lng]);

    const poly = L.polygon(latlngs, {
      color: color,
      fillColor: color,
      fillOpacity: 0.18,
      weight: 2,
      opacity: 0.9
    }).addTo(map);
    allBounds.push(poly.getBounds());

    poly.bindPopup(buildPopupHtml(lote, appsByLote[lote.id] || []));
  });

  const fitToParcels = () => {
    if (allBounds.length > 0) {
      const group = L.featureGroup(allBounds.map(b => L.rectangle(b)));
      map.fitBounds(group.getBounds().pad(0.1));
    }
  };

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
        <span class="mapa-pop-badge">${lote.variedad || 'Café'}</span>
      </div>
      <div class="mapa-pop-stats">
        <span><img src="area.png" alt="">${lote.area_ha ? parseFloat(lote.area_ha).toFixed(2) : '0.00'} ha</span>
        <span><img src="sprouts.png" alt="">${(lote.num_plantas || 0).toLocaleString()} plantas</span>
      </div>
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
