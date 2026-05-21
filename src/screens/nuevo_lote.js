import { supabase } from '../supabase.js';

function parseCoordenadasJson(json) {
  try {
    const parsed = JSON.parse(json);
    if (Array.isArray(parsed)) {
      // Old format: [{lat, lng}, ...]
      return { coordinates: parsed, color: '#3e6f39' };
    }
    // New format: {color, coordinates: [{lat, lng}, ...]}
    return { coordinates: parsed.coordinates || [], color: parsed.color || '#3e6f39' };
  } catch {
    return { coordinates: [], color: '#3e6f39' };
  }
}

let mapInstance = null;
let drawnItems = null;
let drawControl = null;
let existingLotesLayer = null;
let selectedColor = '#3e6f39';

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
          <div class="da-stat-icon" style="background: rgba(56, 106, 62, 0.1); color: #386a3e; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
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
                <button type="button" class="poly-color-btn" data-color="#3e6f39" data-label="Verde" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #3e6f39; background: #3e6f39; cursor: pointer; transition: all 0.2s; box-shadow: 0 0 0 2px white, 0 0 0 4px #3e6f39;" title="Verde"></button>
                <button type="button" class="poly-color-btn" data-color="#1976d2" data-label="Azul" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #1976d2; background: #1976d2; cursor: pointer; transition: all 0.2s;" title="Azul"></button>
                <button type="button" class="poly-color-btn" data-color="#f57c00" data-label="Naranja" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #f57c00; background: #f57c00; cursor: pointer; transition: all 0.2s;" title="Naranja"></button>
                <button type="button" class="poly-color-btn" data-color="#c62828" data-label="Rojo" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #c62828; background: #c62828; cursor: pointer; transition: all 0.2s;" title="Rojo"></button>
                <button type="button" class="poly-color-btn" data-color="#7b1fa2" data-label="Púrpura" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #7b1fa2; background: #7b1fa2; cursor: pointer; transition: all 0.2s;" title="Púrpura"></button>
                <button type="button" class="poly-color-btn" data-color="#00796b" data-label="Teal" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #00796b; background: #00796b; cursor: pointer; transition: all 0.2s;" title="Teal"></button>
                <button type="button" class="poly-color-btn" data-color="#c2185b" data-label="Rosa" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #c2185b; background: #c2185b; cursor: pointer; transition: all 0.2s;" title="Rosa"></button>
                <button type="button" class="poly-color-btn" data-color="#303f9f" data-label="Índigo" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #303f9f; background: #303f9f; cursor: pointer; transition: all 0.2s;" title="Índigo"></button>
                <button type="button" class="poly-color-btn" data-color="#ff8f00" data-label="Ámbar" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #ff8f00; background: #ff8f00; cursor: pointer; transition: all 0.2s;" title="Ámbar"></button>
                <button type="button" class="poly-color-btn" data-color="#4e342e" data-label="Café" style="width: 32px; height: 32px; border-radius: 50%; border: 3px solid #4e342e; background: #4e342e; cursor: pointer; transition: all 0.2s;" title="Café"></button>
              </div>
            </div>

            <div id="area-info-badge" style="display: none; margin-top: 12px; padding: 16px 24px; background: var(--m3-primary-container); border-radius: 16px; display: flex; align-items: center; justify-content: space-between;">
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
  selectedColor = '#3e6f39';

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

    // Update area badge color
    const badge = document.getElementById('area-info-badge');
    if (badge) {
      badge.style.background = color + '20';
      badge.style.borderLeft = `4px solid ${color}`;
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
          color: '#3e6f39',
          fillColor: '#3e6f39',
          fillOpacity: 0.08,
          weight: 0
        }).addTo(existingLotesLayer);
        
        // Dashed border overlay for distinction
        const borderPoly = L.polygon(latlngs, {
          color: '#3e6f39',
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
            <h4 style="margin: 0 0 4px 0; color: #3e6f39; font-size: 14px;">${lote.nombre}</h4>
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
    locateBtn.addEventListener('click', () => {
      mapInstance.locate({ 
        setView: true, 
        maxZoom: 16,
        strings: { title: 'Tu ubicación actual' }
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
        btnLayers.style.background = '#e8f5e9';
        btnLayers.style.color = '#2e7d32';
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
    badge.style.background = selectedColor + '18';
    badge.style.borderLeft = `4px solid ${selectedColor}`;
    text.textContent = areaHectares.toFixed(2) + ' ha';
    text.style.color = selectedColor;
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
          const badge = document.getElementById('area-info-badge');
          if (badge) { badge.style.background = color + '18'; badge.style.borderLeft = `4px solid ${color}`; }
          const text = document.getElementById('area-calculated-text');
          if (text) text.style.color = color;
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
                color: '#3e6f39',
                fillColor: '#3e6f39',
                fillOpacity: 0.08,
                weight: 0
              }).addTo(existingLotesLayer);
              
              const borderPoly = L.polygon(latlngs, {
                color: '#3e6f39',
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
                  <h4 style="margin: 0 0 4px 0; color: #3e6f39; font-size: 14px;">${lote.nombre}</h4>
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
