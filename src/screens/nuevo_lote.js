import { supabase } from '../supabase.js';

function parseCoordenadasJson(json) {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      // Old format: [{lat, lng}, ...]
      return { coordinates: parsed, color: '#2d3e2c' };
    }
    // New format: {color, coordinates: [{lat, lng}, ...]}
    return { coordinates: parsed.coordinates || [], color: parsed.color || '#2d3e2c' };
  } catch {
    return { coordinates: [], color: '#2d3e2c' };
  }
}

let mapInstance = null;
let drawnItems = null;
let drawControl = null;
let existingLotesLayer = null;
let selectedColor = '#2d3e2c';

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

export async function renderNuevoLote(id) {
  let lote = null;
  if (id) {
    const { data, error } = await supabase.from('lotes').select('*').eq('id', id).single();
    if (!error) lote = data;
  }

  // Store for map initialization
  window.__currentLoteData = lote;

  const isEdit = !!lote;
  const title = isEdit ? 'Editar Lote' : 'Nuevo Lote de Cafetal';
  const subtitle = isEdit ? 'Actualiza la información del cultivo' : 'Registro de cultivo';
  const btnLabel = isEdit ? 'Actualizar Lote' : 'Guardar Lote';

  const val = (field) => lote ? (lote[field] || '') : '';
  const selected = (field, value) => lote && lote[field] === value ? 'selected' : '';

  return `
    <div class="m3-form-screen">
      <div class="m3-form-card">
        <div style="margin-bottom: 32px; display: flex; align-items: center; gap: 20px;">
          <div class="da-stat-icon" style="background: rgba(107, 130, 69, 0.1); color: #6b8245; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <span class="material-icons" style="font-size: 32px;">landscape</span>
          </div>
          <div>
            <div class="da-hero-subtitle" style="margin:0;">${subtitle}</div>
            <h2 class="da-hero-title" style="margin:0; font-size: 24px;">${title}</h2>
          </div>
        </div>

        <form id="form-nuevo-lote">
          <input type="hidden" name="area_ha" id="area-ha-input" value="0">
          <div class="m3-grid-2col">
            <div class="m3-field ${val('nombre') ? 'has-value' : ''}">
              <input type="text" name="nombre" placeholder=" " value="${val('nombre')}" required>
              <label>Nombre del Lote</label>
              <p class="error-text" id="error-nombre">El nombre es obligatorio</p>
            </div>

            <div class="m3-field ${val('variedad') ? 'has-value' : ''}">
              <select name="variedad" required>
                <option value="" disabled ${!lote ? 'selected' : ''} hidden></option>
                <option value="Catuai" ${selected('variedad', 'Catuai')}>Catuai</option>
                <option value="Caturra" ${selected('variedad', 'Caturra')}>Caturra</option>
                <option value="Pacas" ${selected('variedad', 'Pacas')}>Pacas</option>
                <option value="IHCAFE 90" ${selected('variedad', 'IHCAFE 90')}>IHCAFE 90</option>
                <option value="Lempira" ${selected('variedad', 'Lempira')}>Lempira</option>
                <option value="Catimor" ${selected('variedad', 'Catimor')}>Catimor</option>
                <option value="Parainema" ${selected('variedad', 'Parainema')}>Parainema</option>
                <option value="Sarchimor" ${selected('variedad', 'Sarchimor')}>Sarchimor</option>
                <option value="Bourbon" ${selected('variedad', 'Bourbon')}>Bourbon</option>
                <option value="Geisha" ${selected('variedad', 'Geisha')}>Geisha</option>
                <option value="Typica" ${selected('variedad', 'Typica')}>Typica</option>
                <option value="Mundo Novo" ${selected('variedad', 'Mundo Novo')}>Mundo Novo</option>
                <option value="Villa Sarchi" ${selected('variedad', 'Villa Sarchi')}>Villa Sarchi</option>
                <option value="Pacamara" ${selected('variedad', 'Pacamara')}>Pacamara</option>
                <option value="Java" ${selected('variedad', 'Java')}>Java</option>
                <option value="Ruiru 11" ${selected('variedad', 'Ruiru 11')}>Ruiru 11</option>
                <option value="SL28" ${selected('variedad', 'SL28')}>SL28</option>
                <option value="Kent" ${selected('variedad', 'Kent')}>Kent</option>
                <option value="Arusha" ${selected('variedad', 'Arusha')}>Arusha</option>
                <option value="ANACAFE 14" ${selected('variedad', 'ANACAFE 14')}>ANACAFE 14</option>
                <option value="Maragogipe" ${selected('variedad', 'Maragogipe')}>Maragogipe</option>
              </select>
              <label>Variedad</label>
            </div>

            <div class="m3-field ${val('num_plantas') ? 'has-value' : ''}">
              <input type="number" name="num_plantas" placeholder=" " value="${val('num_plantas')}">
              <label>Número de Plantas</label>
            </div>

            <div class="m3-field ${val('tipo_suelo') ? 'has-value' : ''}">
              <select name="tipo_suelo" required>
                <option value="" disabled ${!lote ? 'selected' : ''} hidden></option>
                <option value="Arcilloso" ${selected('tipo_suelo', 'Arcilloso')}>Arcilloso</option>
                <option value="Arenoso" ${selected('tipo_suelo', 'Arenoso')}>Arenoso</option>
                <option value="Franco" ${selected('tipo_suelo', 'Franco')}>Franco</option>
                <option value="Franco Arcilloso" ${selected('tipo_suelo', 'Franco Arcilloso')}>Franco Arcilloso</option>
                <option value="Franco Arenoso" ${selected('tipo_suelo', 'Franco Arenoso')}>Franco Arenoso</option>
                <option value="Limoso" ${selected('tipo_suelo', 'Limoso')}>Limoso</option>
                <option value="Franco Limoso" ${selected('tipo_suelo', 'Franco Limoso')}>Franco Limoso</option>
                <option value="Arcilloso Limoso" ${selected('tipo_suelo', 'Arcilloso Limoso')}>Arcilloso Limoso</option>
                <option value="Volcánico" ${selected('tipo_suelo', 'Volcánico')}>Volcánico</option>
                <option value="Calcáreo" ${selected('tipo_suelo', 'Calcáreo')}>Calcáreo</option>
                <option value="Aluvial" ${selected('tipo_suelo', 'Aluvial')}>Aluvial</option>
                <option value="Pedregoso" ${selected('tipo_suelo', 'Pedregoso')}>Pedregoso</option>
                <option value="Orgánico (Humus)" ${selected('tipo_suelo', 'Orgánico (Humus)')}>Orgánico (Humus)</option>
              </select>
              <label>Tipo de Suelo</label>
            </div>
          </div>

          <div class="m3-field ${val('notas') ? 'has-value' : ''}">
            <textarea name="notas" placeholder=" " rows="3">${val('notas')}</textarea>
            <label>Notas Adicionales</label>
          </div>

          <!-- Map Section - Google Earth Style -->
          <div style="margin-top: 32px; margin-bottom: 24px;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px;">
              <span class="material-icons" style="color: var(--m3-primary); font-size: 24px;">public</span>
              <h3 style="font-family: 'Manrope', sans-serif; font-size: 18px; font-weight: 800; color: var(--m3-on-surface); margin: 0;">Delimitar Área del Lote</h3>
            </div>

            <p style="font-size: 13px; color: var(--m3-on-surface-variant); margin-bottom: 16px; line-height: 1.5;">
              Dibuja el perímetro de tu lote en el mapa. Usa la barra de búsqueda <span class="material-icons" style="font-size: 14px; vertical-align: middle;">search</span> para encontrar tu finca.
            </p>

            <div id="lote-map-container" style="width: 100%; height: 550px; border-radius: 24px; overflow: hidden; border: 2px solid var(--m3-outline-variant); position: relative; box-shadow: 0 8px 32px rgba(0,0,0,0.12);">
              <div id="lote-map" style="width: 100%; height: 100%;"></div>
              
              <!-- Scale bar -->
              <div id="map-scale-bar" style="position: absolute; bottom: 24px; left: 24px; z-index: 1000; background: rgba(0,0,0,0.6); color: white; padding: 4px 12px; border-radius: 8px; font-size: 12px; font-weight: 600; font-family: 'Work Sans', sans-serif;">
                <span id="scale-text">400 m</span>
              </div>
              
              <!-- Coordinates display -->
              <div id="map-coords" style="position: absolute; bottom: 24px; left: 50%; transform: translateX(-50%); z-index: 1000; background: rgba(0,0,0,0.7); color: white; padding: 6px 16px; border-radius: 20px; font-size: 11px; font-weight: 500; font-family: 'Work Sans', monospace; backdrop-filter: blur(8px);">
                <span id="coords-text">14°04'57.77"N 86°10'36.26"W</span>
              </div>

              <!-- Map overlay buttons - M3 Floating -->
              <div style="position: absolute; top: 16px; right: 16px; z-index: 1000; display: flex; flex-direction: column; gap: 8px;">
                <button type="button" id="btn-toggle-layers" class="m3-map-overlay-btn" style="width: 44px; height: 44px; border-radius: 14px; background: white; border: none; box-shadow: 0 2px 8px rgba(0,0,0,0.15); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" title="Cambiar capa">
                  <span class="material-icons" style="font-size: 22px; color: #444;">layers</span>
                </button>
                <button type="button" id="btn-locate" class="m3-map-overlay-btn" style="width: 44px; height: 44px; border-radius: 14px; background: white; border: none; box-shadow: 0 2px 8px rgba(0,0,0,0.15); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all 0.2s;" title="Mi ubicación">
                  <span class="material-icons" style="font-size: 22px; color: #444;">my_location</span>
                </button>
              </div>
            </div>
            
            <p style="font-size: 13px; color: var(--m3-on-surface-variant); margin-bottom: 16px; line-height: 1.5;">
              Usa las herramientas del mapa para dibujar el polígono que representa tu lote. El área se calculará automáticamente en hectáreas.
            </p>
            
            <!-- Color Picker and Area Badge -->
            <div id="color-picker-row" style="display: none; margin-top: 16px; padding: 12px 20px; background: white; border-radius: 16px; border: 1px solid var(--m3-outline-variant); align-items: center; gap: 16px; flex-wrap: wrap;">
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

            <div id="area-info-badge" style="display: none; margin-top: 12px; padding: 16px 24px; background: var(--m3-primary-container); border-radius: 16px; align-items: center; justify-content: space-between;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <span class="material-icons" style="color: var(--m3-on-primary-container); font-size: 28px;">check_circle</span>
                <div>
                  <p style="font-size: 12px; font-weight: 700; color: var(--m3-on-primary-container); text-transform: uppercase; letter-spacing: 0.5px; margin: 0;">Área Calculada</p>
                  <p id="area-calculated-text" style="font-size: 22px; font-weight: 800; color: var(--m3-on-primary-container); margin: 0; font-family: 'Manrope', sans-serif;">0.00 ha</p>
                </div>
              </div>
              <button type="button" id="btn-clear-drawing" class="btn-m3-text" style="padding: 8px 16px; font-size: 12px;">
                <span class="material-icons" style="font-size: 18px; margin-right: 4px;">delete_outline</span>
                Limpiar
              </button>
            </div>
          </div>

          <div class="m3-form-actions">
            <button type="button" onclick="window.navigateTo('dashboard')" class="btn-m3-text">
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
  `;
}

async function loadExistingLotes() {
  try {
    const { data, error } = await supabase
      .from('lotes')
      .select('*');
    
    if (error || !data) return [];
    
    // Exclude the lote being edited so it doesn't show as dashed overlay
    const editingId = window.__currentLoteData?.id;
    
    return data.filter(l => l.coordenadas_json != null && l.id !== editingId)
               .map(l => ({ id: l.id, nombre: l.nombre, coordenadas_json: l.coordenadas_json, area_ha: l.area_ha }));
  } catch (err) {
    console.error('Error loading lotes:', err);
    return [];
  }
}

function initMap() {
  const mapEl = document.getElementById('lote-map');
  if (!mapEl || mapInstance) return;

  // Default to Honduras coffee region center
  mapInstance = L.map('lote-map', {
    center: [14.5, -88.5],
    zoom: 9,
    maxZoom: 18,
    zoomControl: false,
    attributionControl: false
  });

  // ── Google Maps style street map (default) ──
  const streetLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap, CARTO',
    maxZoom: 19,
    maxNativeZoom: 18,
    subdomains: 'abcd'
  }).addTo(mapInstance);

  // ── Satellite imagery (Esri World Imagery) ──
  const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
    maxNativeZoom: 18
  });

  // Labels overlay for satellite
  const labelsLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    opacity: 0.8
  });

  // ── Improved Terrain (Esri World Topo, maxZoom 19) ──
  const terrainLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Topo_Map/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19,
    maxNativeZoom: 18
  });

  // Store layers for toggling
  mapInstance._layersConfig = {
    street: streetLayer,
    satellite: satelliteLayer,
    labels: labelsLayer,
    terrain: terrainLayer
  };

  // Track which base layer is active (0=street, 1=satellite, 2=terrain)
  let layerMode = 0;

  // ── Tile error handler: show warning when tiles fail ──
  mapInstance.on('tileerror', function(e) {
    console.warn('Tile failed to load:', e.tile.src);
  });

  // ── Custom M3 Zoom Controls (top-right, Google Maps style) ──
  L.Control.CustomZoom = L.Control.extend({
    onAdd: function() {
      const div = L.DomUtil.create('div', 'm3-map-zoom');
      div.innerHTML = `
        <button class="m3-zoom-btn" id="m3-zoom-in" title="Acercar">
          <span class="material-icons">add</span>
        </button>
        <div class="m3-zoom-divider"></div>
        <button class="m3-zoom-btn" id="m3-zoom-out" title="Alejar">
          <span class="material-icons">remove</span>
        </button>
      `;
      L.DomEvent.disableClickPropagation(div);
      return div;
    }
  });
  new L.Control.CustomZoom({ position: 'topright' }).addTo(mapInstance);

  // Wire zoom buttons
  setTimeout(() => {
    document.getElementById('m3-zoom-in')?.addEventListener('click', () => mapInstance.zoomIn());
    document.getElementById('m3-zoom-out')?.addEventListener('click', () => mapInstance.zoomOut());
  }, 200);

  // Search control - Material 3 Expressive
  const geocoder = L.Control.geocoder({
    defaultMarkGeocode: true,
    position: 'topleft',
    placeholder: 'Buscar lugar, ciudad o coordenadas...',
    errorMessage: 'No se encontró el lugar',
    suggestTimeout: 250,
    queryMinLength: 2,
    geocoder: L.Control.Geocoder.nominatim({
      serviceUrl: 'https://nominatim.openstreetmap.org/',
      params: {
        countrycodes: 'hn',
        limit: 8
      }
    })
  }).addTo(mapInstance);

  // Customize the geocoder icon to use Material Icons and Spanish
  setTimeout(() => {
    const iconEl = document.querySelector('.leaflet-control-geocoder-icon');
    if (iconEl) {
      iconEl.innerHTML = '<span class="material-icons" style="font-size:22px;color:#444;line-height:48px;">search</span>';
      iconEl.title = 'Buscar lugar';
    }
    const geocoderInput = document.querySelector('.leaflet-control-geocoder-form input');
    if (geocoderInput) {
      geocoderInput.addEventListener('keydown', function(e) {
        if (e.key === 'Enter') {
          const value = this.value.trim();
          const coordMatch = value.match(/^(-?\d+\.?\d*)[,\s]+(-?\d+\.?\d*)$/);
          if (coordMatch) {
            const lat = parseFloat(coordMatch[1]);
            const lng = parseFloat(coordMatch[2]);
            if (lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) {
              mapInstance.setView([lat, lng], 15);
              L.marker([lat, lng]).addTo(mapInstance)
                .bindPopup(`Coordenadas: ${lat.toFixed(6)}, ${lng.toFixed(6)}`)
                .openPopup();
              e.preventDefault();
              return;
            }
          }
        }
      });
      geocoderInput.addEventListener('focus', function() {
        document.querySelector('.leaflet-control-geocoder')?.classList.add('leaflet-control-geocoder-expanded');
      });
      geocoderInput.addEventListener('blur', function() {
        if (!this.value) {
          document.querySelector('.leaflet-control-geocoder')?.classList.remove('leaflet-control-geocoder-expanded');
        }
      });
    }
  }, 500);

  geocoder.on('markgeocode', function(e) {
    const bbox = e.geocode.bbox;
    const poly = L.polygon([
      bbox.getSouthEast(), bbox.getNorthEast(),
      bbox.getNorthWest(), bbox.getSouthWest()
    ]).addTo(mapInstance);
    mapInstance.fitBounds(poly.getBounds());
    setTimeout(() => mapInstance.removeLayer(poly), 3000);
  });

  // Attribution in Google Earth style
  L.control.attribution({
    position: 'bottomleft',
    prefix: false
  }).addTo(mapInstance);

  // FeatureGroup for drawn items
  drawnItems = new L.FeatureGroup();
  mapInstance.addLayer(drawnItems);

  // Existing lotes layer
  existingLotesLayer = new L.FeatureGroup();
  mapInstance.addLayer(existingLotesLayer);

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
    // Remove existing glow if any
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

    // Add a glow border - a second polygon underneath with thicker stroke
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
    }

  }

  function initColorPicker() {
    const btns = document.querySelectorAll('.poly-color-btn');
    btns.forEach(btn => {
      btn.addEventListener('click', () => {
        const color = btn.dataset.color;
        selectedColor = color;
        // Update visual selection
        btns.forEach(b => b.style.boxShadow = 'none');
        btn.style.boxShadow = `0 0 0 2px white, 0 0 0 4px ${color}`;
        // Apply to drawn polygon if exists
        if (drawnItems && drawnItems.getLayers().length > 0) {
          const layer = drawnItems.getLayers()[0];
          applyColorToPolygon(layer, color);
        }
      });
    });
  }

  // Draw control - Material 3 Expressive
  drawControl = new L.Control.Draw({
    position: 'topleft',
    draw: {
      polygon: {
        allowIntersection: false,
        showArea: true,
        shapeOptions: {
          color: '#ffffff',
          fillColor: selectedColor,
          fillOpacity: 0.5,
          weight: 2
        },
        drawError: {
          color: '#b23d21',
          message: '<strong>Error:</strong> No se permiten intersecciones'
        },
        icon: new L.DivIcon({
          iconSize: new L.Point(8, 8),
          className: 'leaflet-div-icon leaflet-editing-icon'
        })
      },
      polyline: false,
      rectangle: false,
      circle: false,
      marker: false,
      circlemarker: false
    },
    edit: {
      featureGroup: drawnItems,
      remove: true,
      selectedPathOptions: {
        color: '#ffffff',
        fillColor: selectedColor,
        fillOpacity: 0.5,
        weight: 2,
        dashArray: ''
      }
    }
  });
  mapInstance.addControl(drawControl);

  // ── Walking / GPS Recording Control ──
  createWalkControl();

  // ── Toolbar toggle: click button again to close actions pill ──
  let toolActive = false;
  mapInstance.on('draw:drawstart draw:editstart', () => { toolActive = true; });
  mapInstance.on('draw:drawstop draw:editstop', () => { toolActive = false; });

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
    // Show color picker
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
    // Clean up any orphaned glow polygons
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

  // Load existing lotes (excludes current editing lote)
  loadExistingLotes().then(lotes => {
    // Always clear first to avoid duplicates
    existingLotesLayer.clearLayers();
    
    lotes.forEach(lote => {
      if (lote.coordenadas_json) {
        const { coordinates } = parseCoordenadasJson(lote.coordenadas_json);
        const latlngs = coordinates.map(c => [c.lat, c.lng]);
        
        // Main polygon (fill only)
        L.polygon(latlngs, {
          color: '#2d3e2c',
          fillColor: '#2d3e2c',
          fillOpacity: 0.08,
          weight: 0
        }).addTo(existingLotesLayer);
        
        // Dashed border overlay for distinction
        const borderPoly = L.polygon(latlngs, {
          color: '#2d3e2c',
          fillColor: 'transparent',
          fillOpacity: 0,
          weight: 3,
          dashArray: '8, 6',
          lineCap: 'round',
          lineJoin: 'round',
          opacity: 0.8
        }).addTo(existingLotesLayer);
        
        borderPoly.bindPopup(`
          <div style="font-family: 'Work Sans', sans-serif; padding: 8px;">
            <h4 style="margin: 0 0 4px 0; color: #2d3e2c; font-size: 14px;">${lote.nombre}</h4>
            <p style="margin: 0; font-size: 12px; color: #666;">${lote.area_ha} hectáreas</p>
          </div>
        `);
      }
    });
  });

  // Clear button
  const clearBtn = document.getElementById('btn-clear-drawing');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      // Remove glow polygons
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

  // Locate button
  const locateBtn = document.getElementById('btn-locate');
  if (locateBtn) {
    let userMarker = null;
    mapInstance.on('locationfound', function(e) {
      if (userMarker) mapInstance.removeLayer(userMarker);
      userMarker = L.circleMarker(e.latlng, {
        radius: 10,
        color: '#fff',
        fillColor: '#4285f4',
        fillOpacity: 1,
        weight: 3
      }).addTo(mapInstance).bindPopup('Tu ubicación actual');

      mapInstance.setView(e.latlng, 17, { animate: true });
    });
    mapInstance.on('locationerror', function(e) {
      if (window.Snackbar) {
        const msg = e.code === 1
          ? 'Permiso de ubicación denegado — actívalo en la configuración del navegador'
          : 'No se pudo obtener tu ubicación: ' + e.message;
        window.Snackbar.show(msg, { type: 'error', duration: 5000 });
      }
    });
    locateBtn.addEventListener('click', () => {
      if (window.Snackbar) {
        window.Snackbar.show('Buscando ubicación...', { type: 'info', duration: 2000 });
      }
      mapInstance.locate({ 
        setView: false,
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000
      });
    });
  }

  // Layers toggle - switch street / satellite / terrain
  const btnLayers = document.getElementById('btn-toggle-layers');
  const layersLabel = document.getElementById('layers-label');
  if (btnLayers) {
    btnLayers.addEventListener('click', () => {
      layerMode = (layerMode + 1) % 3;
      mapInstance.removeLayer(streetLayer);
      mapInstance.removeLayer(satelliteLayer);
      mapInstance.removeLayer(labelsLayer);
      mapInstance.removeLayer(terrainLayer);
      if (layerMode === 0) {
        mapInstance.addLayer(streetLayer);
        btnLayers.style.background = '';
        btnLayers.style.color = '';
        if (layersLabel) layersLabel.textContent = 'Satélite';
      } else if (layerMode === 1) {
        mapInstance.addLayer(satelliteLayer);
        mapInstance.addLayer(labelsLayer);
        btnLayers.style.background = '#e4fd97';
        btnLayers.style.color = '#2d3e2c';
        if (layersLabel) layersLabel.textContent = 'Relieve';
      } else {
        mapInstance.addLayer(terrainLayer);
        btnLayers.style.background = '#fff3e0';
        btnLayers.style.color = '#e65100';
        if (layersLabel) layersLabel.textContent = 'Satélite';
      }
    });
  }

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
  
  // Approximate scale based on zoom level
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

  const areaInput = document.getElementById('area-ha-input');
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
}

function clearAreaDisplay() {
  const areaInput = document.getElementById('area-ha-input');
  if (areaInput) {
    areaInput.value = '';
    areaInput.setAttribute('readonly', '');
  }

  const badge = document.getElementById('area-info-badge');
  if (badge) badge.style.display = 'none';

  const hint = document.getElementById('area-hint');
  if (hint) hint.style.display = 'block';
}

// ── Walking / GPS Recording ────────────────────────────────────

function createWalkControl() {
  const WalkControl = L.Control.extend({
    onAdd: function() {
      const div = L.DomUtil.create('div', 'm3-walk-control');
      div.innerHTML = `<button type="button" id="btn-walk-toggle" class="m3-walk-btn" title="Registrar caminando">
        <span class="material-icons">directions_walk</span>
      </button>`;
      L.DomEvent.disableClickPropagation(div);
      return div;
    }
  });
  walkControl = new WalkControl({ position: 'topleft' });
  mapInstance.addControl(walkControl);

  setTimeout(() => {
    const btn = document.getElementById('btn-walk-toggle');
    if (!btn) return;
    btn.addEventListener('click', () => {
      if (walkState === 'idle') {
        startWalking();
      } else if (walkState === 'searching' || walkState === 'recording' || walkState === 'paused') {
        discardWalking();
      }
    });
  }, 300);
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
      <span id="walk-area-text" style="font-size:20px;font-weight:800;font-family:Manrope,sans-serif;color:var(--m3-on-surface);">0.00 ha</span>
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

  // Wire buttons
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

  // Hide area badge while walking
  clearAreaDisplay();

  // Update toggle button
  const toggleBtn = document.getElementById('btn-walk-toggle');
  if (toggleBtn) {
    toggleBtn.classList.add('active');
    toggleBtn.title = 'Descartar grabación';
  }

  // Block draw controls
  disableDrawControl();

  showWalkPanel('searching');

  // Create GPS marker
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

  // Create tracking polygon
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

  // Create path line
  if (!walkPathLine) {
    walkPathLine = L.polyline([], {
      color: selectedColor,
      weight: 3,
      opacity: 0.8,
      dashArray: '6, 4'
    });
    mapInstance.addLayer(walkPathLine);
  }

  // Start watching position
  watchId = navigator.geolocation.watchPosition(
    onWalkPositionSuccess,
    onWalkPositionError,
    { enableHighAccuracy: true, timeout: 8000, maximumAge: 5000 }
  );

  // Fallback: if no fix within 25s, retry without enableHighAccuracy
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

    // Accept first fix up to 100m (covers WiFi positioning; GPS is typically <10m)
    if (accuracy <= 100) {
      // Clear fallback timeout
      if (window._walkSearchTimeout) {
        clearTimeout(window._walkSearchTimeout);
        window._walkSearchTimeout = null;
      }

      walkState = 'recording';
      walkPoints = [{ lat: latitude, lng: longitude }];
      walkLastAccuracy = Math.round(accuracy);

      // Update marker
      gpsMarker.setLatLng([latitude, longitude]);
      if (!mapInstance.hasLayer(gpsMarker)) mapInstance.addLayer(gpsMarker);

      // Initialize polygon with first point (closed)
      walkPolygon.setLatLngs([[latitude, longitude], [latitude, longitude]]);

      // Initialize path
      walkPathLine.setLatLngs([[latitude, longitude]]);

      updateWalkPanelUI('recording');
      saveWalkingSession();
    }
    return;
  }

  if (walkState === 'recording') {
    // Ignore low accuracy
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
      // Still update marker position for smooth feel
      gpsMarker.setLatLng([latitude, longitude]);
      return;
    }

    // Valid new point
    addWalkPoint(latitude, longitude);
  }
}

function addWalkPoint(latitude, longitude) {
  walkPoints.push({ lat: latitude, lng: longitude });

  // Update polygon (closed: connect last point to first)
  const allLatLngs = walkPoints.map(p => [p.lat, p.lng]);
  allLatLngs.push(allLatLngs[0]);
  walkPolygon.setLatLngs(allLatLngs);

  // Update path line
  walkPathLine.setLatLngs(walkPoints.map(p => [p.lat, p.lng]));

  // Move GPS marker
  gpsMarker.setLatLng([latitude, longitude]);

  // Pan map to follow user
  mapInstance.panTo([latitude, longitude], { animate: true, duration: 0.3 });

  // Update area every 4 points
  pointCountSinceLastArea++;
  if (pointCountSinceLastArea % 4 === 0) {
    updateWalkPanelUI('recording');
  } else {
    // Just update points count and accuracy
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

  // Remove tracking layers from map
  if (walkPolygon && mapInstance.hasLayer(walkPolygon)) mapInstance.removeLayer(walkPolygon);
  if (walkPathLine && mapInstance.hasLayer(walkPathLine)) mapInstance.removeLayer(walkPathLine);
  if (gpsMarker && mapInstance.hasLayer(gpsMarker)) mapInstance.removeLayer(gpsMarker);

  // Simplify polygon with turf.simplify
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

  // Create final polygon (reverse to latlng)
  const finalLatLngs = simplifiedCoords.map(c => [c[1], c[0]]);

  // Remove last point if it's a duplicate of first (turf.simplify may have added closure)
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

  // Show color picker and highlight saved color
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
    // Only restore sessions less than 10 minutes old
    if (Date.now() - session.timestamp > 600000) {
      localStorage.removeItem('finca_walking_session');
      return;
    }

    walkPoints = session.points;
    if (session.color) selectedColor = session.color;

    // Rebuild GPS marker
    if (walkPoints.length > 0) {
      const lastPt = walkPoints[walkPoints.length - 1];
      gpsMarker = L.circleMarker([lastPt.lat, lastPt.lng], {
        radius: 8, color: '#fff', fillColor: '#4285f4', fillOpacity: 1, weight: 3
      });
      mapInstance.addLayer(gpsMarker);
    }

    // Rebuild tracking polygon
    const allLatLngs = walkPoints.map(p => [p.lat, p.lng]);
    allLatLngs.push(allLatLngs[0]);
    walkPolygon = L.polygon(allLatLngs, {
      color: '#ffffff', fillColor: selectedColor, fillOpacity: 0.4, weight: 2
    });
    mapInstance.addLayer(walkPolygon);

    // Rebuild path line
    walkPathLine = L.polyline(walkPoints.map(p => [p.lat, p.lng]), {
      color: selectedColor, weight: 3, opacity: 0.8, dashArray: '6, 4'
    });
    mapInstance.addLayer(walkPathLine);

    if (session.state === 'recording' || session.state === 'paused') {
      walkState = 'paused'; // Start paused so user can decide
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

export async function setupNuevoLoteListeners() {
  const form = document.getElementById('form-nuevo-lote');
  if (!form) return;

  // Capture the lote ID from multiple sources
  const hiddenInputId = form.querySelector('input[name="lote_id"]')?.value || null;
  const currentDataId = window.__currentLoteData?.id || null;
  const loteId = currentDataId || hiddenInputId;

  console.log('[nuevo_lote] Setup - loteId from input:', loteId);
  console.log('[nuevo_lote] Setup - window.__currentLoteData before refetch:', window.__currentLoteData);

  // Re-fetch lote data if window.__currentLoteData was cleared by previous cleanup
  let editingLote = window.__currentLoteData;
  if (loteId && (!editingLote || editingLote.id !== loteId)) {
    try {
      const { data, error } = await supabase.from('lotes').select('*').eq('id', loteId).single();
      if (!error && data) {
        window.__currentLoteData = data;
        editingLote = data;
        console.log('[nuevo_lote] Re-fetched lote data:', data);
      }
    } catch (err) {
      console.warn('[nuevo_lote] Error re-fetching lote:', err);
    }
  }

  console.log('[nuevo_lote] Setup - editingLote:', editingLote);

  // Register cleanup for when we navigate away
  window.__screenCleanup = () => {
    // Save walking session if active
    if (walkState !== 'idle') {
      saveWalkingSession();
    }
    if (watchId !== null) {
      navigator.geolocation.clearWatch(watchId);
      watchId = null;
    }
    // Remove walking layers if any
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
    if (mapInstance) {
      mapInstance.remove();
      mapInstance = null;
      drawnItems = null;
      drawControl = null;
      existingLotesLayer = null;
      walkControl = null;
    }
  };

  if (window.refreshM3Fields) window.refreshM3Fields();

  // Initialize map after DOM is ready
  setTimeout(() => {
    initMap();

    // Draw existing polygon if editing (after map is fully initialized)
    setTimeout(() => {
      if (editingLote && editingLote.coordenadas_json && drawnItems) {
        try {
          drawnItems.clearLayers(); // Clear any auto-loaded layers
          
          // Parse coordinates and get saved color
          const { coordinates, color: savedColor } = parseCoordenadasJson(editingLote.coordenadas_json);
          selectedColor = savedColor; // Use the saved color
          
          const latlngs = coordinates.map(c => L.latLng(c.lat, c.lng));
          const polygon = L.polygon(latlngs, {
            color: '#ffffff',
            fillColor: selectedColor,
            fillOpacity: 0.5,
            weight: 2
          });
          drawnItems.addLayer(polygon);
          
          // Add glow
          const glow = L.polygon(latlngs, {
            color: selectedColor, fillColor: selectedColor, fillOpacity: 0.5, weight: 6, opacity: 0.7
          });
          glow._isGlow = true;
          polygon._glowPolygon = glow;
          mapInstance.addLayer(glow);
          
          // Update color picker to show saved color
          document.querySelectorAll('.poly-color-btn').forEach(btn => {
            btn.style.boxShadow = 'none';
            if (btn.dataset.color === selectedColor) {
              btn.style.boxShadow = `0 0 0 2px white, 0 0 0 4px ${selectedColor}`;
            }
          });
          
          mapInstance.fitBounds(polygon.getBounds().pad(0.2));
          
          // Show area badge
          const badge = document.getElementById('area-info-badge');
          if (badge) badge.style.display = 'flex';
          const text = document.getElementById('area-calculated-text');
          if (text && editingLote.area_ha) text.textContent = parseFloat(editingLote.area_ha).toFixed(2) + ' ha';
          
          // Show color picker
          const row = document.getElementById('color-picker-row');
          if (row) row.style.display = 'flex';
        } catch (e) {
          console.warn('Error drawing existing polygon:', e);
        }
      }
    }, 300);

    // Initialize color picker buttons
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
          }
          const text = document.getElementById('area-calculated-text');
        }
      });
    });
  }, 100);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    delete data.lote_id;

    console.log('[nuevo_lote] Submit - loteId:', loteId);
    console.log('[nuevo_lote] Submit - data:', data);

    if (data.num_plantas) data.num_plantas = parseInt(data.num_plantas);
    if (data.area_ha) data.area_ha = parseFloat(data.area_ha);

    if (drawnItems && drawnItems.getLayers().length > 0) {
      const layer = drawnItems.getLayers()[0];
      const latlngs = layer.getLatLngs()[0];
      data.coordenadas_json = JSON.stringify({
        color: selectedColor,
        coordinates: latlngs.map(ll => ({ lat: ll.lat, lng: ll.lng }))
      });
    }

    try {
      let error;
      const submitLoteId = loteId || window.__currentLoteData?.id || null;
      if (submitLoteId) {
        console.log('[nuevo_lote] UPDATE - loteId:', submitLoteId);
        const res = await supabase.from('lotes').update(data).eq('id', submitLoteId);
        error = res.error;
      } else {
        console.log('[nuevo_lote] INSERT - creating new lote');
        const res = await supabase.from('lotes').insert([data]);
        error = res.error;
      }
      
      if (error) throw error;

      // Reload existing lotes layer to show updated data
      if (existingLotesLayer && mapInstance) {
        existingLotesLayer.clearLayers();
        loadExistingLotes().then(lotes => {
          lotes.forEach(lote => {
            if (lote.coordenadas_json) {
              const { coordinates } = parseCoordenadasJson(lote.coordenadas_json);
              const latlngs = coordinates.map(c => [c.lat, c.lng]);
              
              L.polygon(latlngs, {
                color: '#2d3e2c',
                fillColor: '#2d3e2c',
                fillOpacity: 0.08,
                weight: 0
              }).addTo(existingLotesLayer);
              
              const borderPoly = L.polygon(latlngs, {
                color: '#2d3e2c',
                fillColor: 'transparent',
                fillOpacity: 0,
                weight: 3,
                dashArray: '8, 6',
                lineCap: 'round',
                lineJoin: 'round',
                opacity: 0.8
              }).addTo(existingLotesLayer);
              
              borderPoly.bindPopup(`
                <div style="font-family: 'Work Sans', sans-serif; padding: 8px;">
                  <h4 style="margin: 0 0 4px 0; color: #2d3e2c; font-size: 14px;">${lote.nombre}</h4>
                  <p style="margin: 0; font-size: 12px; color: #666;">${lote.area_ha} hectáreas</p>
                </div>
              `);
            }
          });
        });
      }

      if (window.Snackbar) {
        window.Snackbar.show(loteId ? 'Lote actualizado exitosamente' : 'Lote creado exitosamente', { type: 'success' });
      }
      window.clearScreenCache?.('dashboard');
      window.navigateTo('dashboard');
    } catch (err) {
      console.error('Error saving lote:', err);
      if (window.Snackbar) {
        window.Snackbar.show('Error: ' + err.message, { type: 'error' });
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
