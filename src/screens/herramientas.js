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
      <div class="section-title">
        <h3>Herramientas & Equipos</h3>
      </div>
      <p class="section-subtitle">Inventario de herramientas de mano, eléctricas y de labranza.</p>

      <div class="card-grid">
        ${tools.map(tool => {
          const status = tool.estado || 'Disponible';
          let statusClass = 'ok';
          if (status === 'Baja') statusClass = 'urgent';
          else if (status === 'Reparación') statusClass = 'warning';

          return `
            <div class="item-card tool-card" data-id="${tool.id}">
              <div class="item-card-header">
                <div class="item-card-icon">${tool.icon || '🛠️'}</div>
                <span class="item-status ${statusClass}">${status}</span>
              </div>
              
              <div class="item-card-content">
                <h4>${tool.nombre}</h4>
                <p class="item-sn">Ubicación: ${tool.ubicacion || 'Bodega Principal'}</p>
                
                <div class="item-footer-info">
                  <span class="material-icons" style="font-size:16px;">category</span>
                  Categoría: ${tool.categoria || 'Otro'}
                </div>
              </div>

              <div class="item-card-actions">
                <button class="btn-primary" onclick="window.navigateTo('detalle_herramienta', '${tool.id}')">Ver ficha</button>
                <button class="btn-outline" onclick="window.navigateTo('detalle_herramienta', '${tool.id}')">Mantenimiento</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <button id="btn-add-tool" class="fab">
        <span class="material-icons">add</span> Nueva herramienta
      </button>
    </div>
  `;
}
