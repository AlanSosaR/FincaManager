import { supabase } from '../supabase.js';

export async function renderHerramientas() {
  const { data: tools, error } = await supabase
    .from('herramientas')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching herramientas:', error);
    return `<div class="screen-herramientas"><p>Error cargando datos: ${error.message}</p></div>`;
  }

  const categoryColors = {
    'Corte': '#43a047',
    'Eléctrica': '#fb8c00',
    'Labranza': '#8e24aa',
    'Mano': '#1e88e5',
    'Otro': '#666',
  };

  return `
    <div class="screen-herramientas">
      <div class="screen-toolbar">
        <div class="search-box">
          <span class="material-icons">search</span>
          <input type="text" placeholder="Buscar herramienta...">
        </div>
        <button class="btn-primary" id="btn-add-tool">
          <span class="material-icons">add</span> Agregar
        </button>
      </div>

      <div class="stats-grid" style="margin-bottom:24px">
        <div class="stat-card">
          <span class="material-icons stat-icon">construction</span>
          <div><p class="stat-label">Total</p><h3 class="stat-value">6</h3></div>
        </div>
        <div class="stat-card">
          <span class="material-icons stat-icon" style="color:#43a047">check_circle</span>
          <div><p class="stat-label">Disponibles</p><h3 class="stat-value">5</h3></div>
        </div>
        <div class="stat-card">
          <span class="material-icons stat-icon" style="color:#fb8c00">warning</span>
          <div><p class="stat-label">En Mantenimiento</p><h3 class="stat-value">1</h3></div>
        </div>
      </div>

      <div class="tool-list">
        ${tools.map(tool => {
          const category = 'Otro';
          return `
          <div class="tool-card card" data-id="${tool.id}" style="background: ${tool.color || '#fff'}; cursor: pointer;">
            <div class="tool-main">
              <div class="tool-emoji">${tool.icon || '🛠️'}</div>
              <div class="tool-info">
                <h4>${tool.nombre}</h4>
                <div class="tool-meta">
                  <span class="tag" style="background: ${categoryColors[category]}20; color: ${categoryColors[category]}">
                    <span class="material-icons" style="font-size:14px">category</span>
                    ${category}
                  </span>
                  <span class="tool-location">
                    <span class="material-icons" style="font-size:14px">location_on</span>
                    ${tool.ubicacion || 'Bodega'}
                  </span>
                </div>
              </div>
            </div>
            <span class="material-icons tool-arrow">chevron_right</span>
          </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
}
