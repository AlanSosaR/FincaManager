import { supabase } from '../supabase.js';

let currentToolsPage = 1;
let totalToolsCount = 0;
const PAGE_SIZE = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPaginationFooterHtml() {
  const totalPages = Math.ceil(totalToolsCount / PAGE_SIZE) || 1;
  
  let pagesHtml = '';
  for (let i = 1; i <= totalPages; i++) {
    pagesHtml += `
      <button class="da-page-btn ${i === currentToolsPage ? 'active' : ''}" onclick="window.changeToolsPage(${i})">
        ${i}
      </button>
    `;
  }

  return `
    <div class="da-pagination-premium">
      <button class="da-pagination-circle-btn" id="tools-prev-btn" ${currentToolsPage <= 1 ? 'disabled' : ''} 
              onclick="if(currentToolsPage > 1) window.changeToolsPage(currentToolsPage - 1)">
        <span class="material-icons">chevron_left</span>
      </button>
      
      <div class="da-pagination-pages">
        ${pagesHtml}
      </div>

      <button class="da-pagination-circle-btn" id="tools-next-btn" ${currentToolsPage >= totalPages ? 'disabled' : ''}
              onclick="if(currentToolsPage < ${totalPages}) window.changeToolsPage(currentToolsPage + 1)">
        <span class="material-icons">chevron_right</span>
      </button>
    </div>
  `;
}

window.changeToolsPage = async function(page) {
  currentToolsPage = page;
  const from = (page - 1) * PAGE_SIZE;
  const to   = page * PAGE_SIZE - 1;

  const listContainer    = document.getElementById('tools-list-container');
  const footerContainer  = document.getElementById('tools-pagination-wrapper');
  if (!listContainer) return;

  listContainer.innerHTML = `
    <div style="padding: 32px; text-align: center; color: #888; grid-column: 1 / -1;">
      <span class="material-icons rotating" style="font-size: 28px; color: var(--primary-container);">autorenew</span>
    </div>`;

  const { data: tools, error } = await supabase
    .from('herramientas')
    .select('*')
    .order('nombre', { ascending: true })
    .range(from, to);

  if (error || !tools) {
    listContainer.innerHTML = `<div class="ganado-empty" style="grid-column: 1 / -1;"><p>Error cargando datos.</p></div>`;
    return;
  }

  listContainer.innerHTML = tools.length === 0
    ? `<div class="ganado-empty" style="grid-column: 1 / -1;"><span class="material-icons">construction</span><p>No hay herramientas en esta página.</p></div>`
    : tools.map(t => renderToolRow(t)).join('');

  if (footerContainer) footerContainer.innerHTML = getPaginationFooterHtml();
};

async function changeToolsPage(page) {
  currentToolsPage = page;
  const from = (page - 1) * PAGE_SIZE;
  const to   = page * PAGE_SIZE - 1;

  const listContainer    = document.getElementById('tools-list-container');
  const footerContainer  = document.getElementById('tools-pagination-wrapper');
  if (!listContainer) return;

  listContainer.innerHTML = `
    <div style="padding: 32px; text-align: center; color: #888;">
      <span class="material-icons rotating" style="font-size: 28px; color: var(--primary-container);">autorenew</span>
    </div>`;

  const { data: tools, error } = await supabase
    .from('herramientas')
    .select('*')
    .order('nombre', { ascending: true })
    .range(from, to);

  if (error || !tools) {
    listContainer.innerHTML = `<div class="ganado-empty"><p>Error cargando datos.</p></div>`;
    return;
  }

  listContainer.innerHTML = tools.length === 0
    ? `<div class="ganado-empty"><span class="material-icons">construction</span><p>No hay herramientas en esta página.</p></div>`
    : tools.map(t => renderToolRow(t)).join('');

  if (footerContainer) footerContainer.innerHTML = getPaginationFooterHtml();
}

// ─── Main render ──────────────────────────────────────────────────────────────

export async function renderHerramientas() {
  currentToolsPage = 1;

  const [
    { count: totalCount },
    { data: allStats }
  ] = await Promise.all([
    supabase.from('herramientas').select('*', { count: 'exact', head: true }),
    supabase.from('herramientas').select('estado')
  ]);

  totalToolsCount = totalCount || 0;

  const { data: tools, error } = await supabase
    .from('herramientas')
    .select('*')
    .order('nombre', { ascending: true })
    .range(0, PAGE_SIZE - 1);

  if (error) {
    console.error('Error fetching herramientas:', error);
    return `<div class="screen-herramientas"><p>Error cargando datos: ${error.message}</p></div>`;
  }

  const totalTools = allStats ? allStats.length : 0;
  const inRepair   = allStats ? allStats.filter(t => t.estado === 'Reparación').length : 0;
  const available  = allStats ? allStats.filter(t => t.estado === 'Disponible' || !t.estado).length : 0;

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

      <div class="da-tabs-section">
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
          <div class="ganado-list-title-group">
            <h4>Inventario</h4>
            <span class="ganado-count-label" id="tools-count-label">${totalToolsCount} registros</span>
          </div>
          <button class="ganado-filter-btn">
            Exportar <span class="material-icons" style="font-size:16px;">download</span>
          </button>
        </div>

        <!-- Tools List -->
        <div class="ganado-list" id="tools-list-container">
          ${tools.length === 0
            ? `<div class="ganado-empty" style="grid-column: 1 / -1;">
                 <span class="material-icons">construction</span>
                 <p>No hay herramientas registradas.</p>
               </div>`
            : tools.map(t => renderToolRow(t)).join('')}
        </div>

        <!-- Pagination Footer -->
        <div id="tools-pagination-wrapper">
          ${getPaginationFooterHtml()}
        </div>
      </div>

      <!-- FAB -->
      <button class="fab-premium" onclick="window.navigateTo('nueva_herramienta')">
        <span class="material-icons">add</span>
        <span class="label">Nueva herramienta</span>
      </button>
    </div>
  `;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initHerramientas() {
  window.toggleActionMenu = (btn) => {
    const menu = btn.nextElementSibling;
    const isActive = menu.classList.contains('active');
    document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    if (!isActive) menu.classList.add('active');
  };

  window.confirmDeleteHerramienta = (id, name) => {
    window.Snackbar.confirm(
      `¿Eliminar ${name}?`,
      async () => {
        const { error } = await supabase.from('herramientas').delete().eq('id', id);
        if (error) {
          window.Snackbar.show('Error al eliminar: ' + error.message, { type: 'error' });
        } else {
          window.Snackbar.show('Herramienta eliminada correctamente');
          window.navigateTo('herramientas');
        }
      },
      null,
      { confirmText: 'Eliminar', cancelText: 'No' }
    );
  };

  window.addEventListener('click', (e) => {
    if (!e.target.closest('.ganado-btn-more')) {
      document.querySelectorAll('.action-menu').forEach(m => m.classList.remove('active'));
    }
  }, { once: true });
}

// ─── Row renderer ─────────────────────────────────────────────────────────────

function renderToolRow(tool) {
  const status = tool.estado || 'Disponible';
  let statusClass = 'ok';
  let statusIcon  = 'check_circle';

  if (status === 'Baja') {
    statusClass = 'pending';
    statusIcon  = 'cancel';
  } else if (status === 'Reparación') {
    statusClass = 'pending';
    statusIcon  = 'build';
  }

  const icon = tool.icon || '🛠️';

  return `
    <div class="ganado-row" onclick="window.navigateTo('detalle_herramienta', '${tool.id}')">
      <div class="ganado-row-img-container" style="background: var(--surface-container-high); display: flex; align-items: center; justify-content: center; font-size: 24px;">
        ${icon}
        ${statusClass !== 'ok' ? `
        <div class="ganado-row-badge orange">
          <span class="material-icons" style="font-size:12px;">${statusIcon}</span>
        </div>` : ''}
      </div>

      <div class="ganado-row-content">
        <div class="ganado-col-group">
          <p class="ganado-col-label">${(tool.categoria || 'EQUIPO').toUpperCase()}</p>
          <p class="ganado-col-value">${tool.nombre}</p>
        </div>

        <div class="ganado-col-group">
          <p class="ganado-col-label">Ubicación</p>
          <p class="ganado-col-value">${tool.ubicacion || 'Bodega'}</p>
        </div>

        <div class="ganado-col-group" style="text-align:right; position: relative; margin-left: auto;">
          <button class="ganado-btn-more" onclick="event.stopPropagation(); window.toggleActionMenu(this)">
            <span class="material-icons">more_vert</span>
          </button>

          <div class="action-menu">
            <div class="action-item" onclick="event.stopPropagation(); window.navigateTo('nueva_herramienta', '${tool.id}')">
              <span class="material-icons">edit</span>
              <span>Editar</span>
            </div>
            <div class="action-item delete" onclick="event.stopPropagation(); window.confirmDeleteHerramienta('${tool.id}', '${tool.nombre}')">
              <span class="material-icons">delete</span>
              <span>Eliminar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
