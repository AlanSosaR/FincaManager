import { supabase } from '../supabase.js';

export async function renderHerramientas() {
  const { data: tools, error } = await supabase
    .from('herramientas')
    .select('*')
    .order('nombre', { ascending: true });

  if (error) {
    console.error('Error fetching herramientas:', error);
    return `<div class="screen-herramientas"><p>Error cargando datos: ${error.message}</p></div>`;
  }

  // Calculate summary stats
  const totalTools = tools.length;
  const inRepair = tools.filter(t => t.estado === 'Reparación').length;
  const available = tools.filter(t => t.estado === 'Disponible' || !t.estado).length;

  return `
    <div class="screen-herramientas" style="padding-bottom: 100px;">
      
      <!-- Page Title -->
      <div class="herramientas-page-title">
        <h2>Herramientas</h2>
        <div class="ganado-top-actions">
          <button class="ganado-icon-btn" title="Buscar">
            <span class="material-icons">search</span>
          </button>
          <button class="ganado-icon-btn" title="Filtros">
            <span class="material-icons">tune</span>
          </button>
        </div>
      </div>

      <!-- Summary Cards -->
      <section class="herramientas-top-cards">
        <div class="herramientas-card herramientas-card-primary">
          <div class="herramientas-card-header">
            <span class="material-icons">construction</span>
            <span class="herramientas-card-label">Total Equipos</span>
          </div>
          <div class="herramientas-card-body">
            <h3 class="herramientas-card-value">${totalTools}</h3>
          </div>
        </div>

        <div class="herramientas-card herramientas-card-surface">
          <div class="herramientas-card-header">
            <span class="material-icons">check_circle</span>
            <span class="herramientas-card-label">Disponibles</span>
          </div>
          <div class="herramientas-card-body">
            <h3 class="herramientas-card-value">${available}</h3>
          </div>
        </div>

        <div class="herramientas-card herramientas-card-tertiary">
          <div class="herramientas-card-header">
            <span class="material-icons">build</span>
            <span class="herramientas-card-label">En Taller</span>
          </div>
          <div class="herramientas-card-body">
            <h3 class="herramientas-card-value">${inRepair}</h3>
          </div>
        </div>
      </section>

      <!-- List Header -->
      <div class="ganado-list-header">
        <h4>Inventario</h4>
        <button class="ganado-filter-btn">
          Exportar <span class="material-icons" style="font-size:16px;">download</span>
        </button>
      </div>

      <!-- Tools List -->
      <div class="herramientas-list">
        ${tools.map(tool => renderToolRow(tool)).join('')}
        
        ${tools.length === 0 ? `
          <div class="ganado-empty">
            <span class="material-icons">construction</span>
            <p>No hay herramientas registradas.</p>
          </div>
        ` : ''}
      </div>

      <!-- FAB -->
      <button class="fab-premium" onclick="window.navigateTo('nueva_herramienta')">
        <span class="material-icons">add</span>
        <span class="label">Nueva herramienta</span>
      </button>
    </div>
  `;
}

export function initHerramientas() {
  // Toggle action menu
  window.toggleActionMenu = (id) => {
    const menus = document.querySelectorAll('.action-menu');
    menus.forEach(m => {
      if (m.id === `menu-${id}`) {
        m.classList.toggle('active');
      } else {
        m.classList.remove('active');
      }
    });
  };

  // Delete action
  window.confirmDeleteHerramienta = (id, name) => {
    window.Snackbar.confirm(
      `¿Eliminar ${name}?`,
      async () => {
        const { error } = await supabase.from('herramientas').delete().eq('id', id);
        if (error) {
          window.Snackbar.show('Error al eliminar: ' + error.message, { type: 'error' });
        } else {
          window.Snackbar.show('Herramienta eliminada correctamente');
          // Refresh the list
          renderHerramientas().then(html => {
            document.getElementById('screen-container').innerHTML = html;
            initHerramientas();
          });
        }
      },
      null,
      { confirmText: 'Eliminar', cancelText: 'No' }
    );
  };

  // Close menus when clicking outside
  window.addEventListener('click', (e) => {
    if (!e.target.closest('.ganado-btn-more')) {
      document.querySelectorAll('.action-menu').forEach(m => m.classList.remove('active'));
    }
  }, { once: true });
}

function renderToolRow(tool) {
  const status = tool.estado || 'Disponible';
  let statusClass = 'ok';
  let statusIcon = 'check_circle';
  
  if (status === 'Baja') {
    statusClass = 'pending';
    statusIcon = 'cancel';
  } else if (status === 'Reparación') {
    statusClass = 'pending';
    statusIcon = 'build';
  }

  const icon = tool.icon || '🛠️';
  
  return `
    <div class="herramientas-row" onclick="window.navigateTo('detalle_herramienta', '${tool.id}')">
      <div class="herramientas-row-icon">
        ${icon}
      </div>
      
      <div class="herramientas-row-content">
        <div class="ganado-col-group">
          <p class="ganado-col-label">${tool.categoria || 'EQUIPO'}</p>
          <p class="ganado-col-value">${tool.nombre}</p>
        </div>
        
        <div class="ganado-col-group">
          <p class="ganado-col-label">Ubicación</p>
          <p class="ganado-col-value">${tool.ubicacion || 'Bodega'}</p>
        </div>

        <div class="ganado-col-group">
          <p class="ganado-col-label">Estado</p>
          <div class="ganado-pill ${statusClass}">
            <span class="material-icons">${statusIcon}</span>
            <span>${status}</span>
          </div>
        </div>

        <div class="ganado-col-group" style="text-align:right; position: relative;">
          <button class="ganado-btn-more" onclick="event.stopPropagation(); toggleActionMenu('${tool.id}')">
            <span class="material-icons">more_vert</span>
          </button>

          <div class="action-menu" id="menu-${tool.id}">
            <div class="action-item" onclick="event.stopPropagation(); window.navigateTo('nueva_herramienta', '${tool.id}')">
              <span class="material-icons">edit</span>
              <span>Editar</span>
            </div>
            <div class="action-item delete" onclick="event.stopPropagation(); confirmDeleteHerramienta('${tool.id}', '${tool.nombre}')">
              <span class="material-icons">delete</span>
              <span>Eliminar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
