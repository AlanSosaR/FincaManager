import { supabase } from '../supabase.js';

let currentMotorsPage = 1;
let currentMotorsFilter = 'all';
let currentMotorsSearchQuery = '';
let totalFilteredCount = 0;
const PAGE_SIZE = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPaginationFooterHtml() {
  const totalPages = Math.ceil(totalFilteredCount / PAGE_SIZE) || 1;
  
  let pagesHtml = '';
  // Show all pages if few, or we could limit them. For now all 1-N.
  for (let i = 1; i <= totalPages; i++) {
    pagesHtml += `
      <button class="da-page-btn ${i === currentMotorsPage ? 'active' : ''}" onclick="window.changeMotorsPage(${i})">
        ${i}
      </button>
    `;
  }

  return `
    <div class="da-pagination-premium">
      <button class="da-pagination-circle-btn" id="motors-prev-btn" ${currentMotorsPage <= 1 ? 'disabled' : ''} 
              onclick="if(currentMotorsPage > 1) window.changeMotorsPage(currentMotorsPage - 1)">
        <span class="material-icons">chevron_left</span>
      </button>
      
      <div class="da-pagination-pages">
        ${pagesHtml}
      </div>

      <button class="da-pagination-circle-btn" id="motors-next-btn" ${currentMotorsPage >= totalPages ? 'disabled' : ''}
              onclick="if(currentMotorsPage < ${totalPages}) window.changeMotorsPage(currentMotorsPage + 1)">
        <span class="material-icons">chevron_right</span>
      </button>
    </div>
  `;
}

window.changeMotorsPage = async function(page) {
  currentMotorsPage = page;
  const from = (page - 1) * PAGE_SIZE;
  const to   = page * PAGE_SIZE - 1;

  const listContainer   = document.getElementById('motors-list-container');
  const footerContainer = document.getElementById('motors-pagination-wrapper');
  if (!listContainer) return;

  listContainer.innerHTML = `
    <div style="padding: 32px; text-align: center; color: #888; grid-column: 1 / -1;">
      <span class="material-icons rotating" style="font-size: 28px; color: var(--primary);">autorenew</span>
    </div>`;

  // Re-fetch urgent IDs if needed
  let urgentIds = [];
  if (currentMotorsFilter === 'urgent') {
    const { data } = await supabase.from('motores').select('id, horas, max_horas');
    urgentIds = (data || []).filter(m => (m.horas || 0) >= (m.max_horas || 100)).map(m => m.id);
  }

  const { data: equipos, count, error } = await buildQuery(urgentIds)
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error || !equipos) {
    listContainer.innerHTML = `<div class="ganado-empty" style="grid-column: 1 / -1;"><p>Error cargando datos.</p></div>`;
    return;
  }

  totalFilteredCount = count || 0;
  listContainer.innerHTML = equipos.length === 0
    ? `<div class="ganado-empty" style="grid-column: 1 / -1;"><p>No se encontraron equipos.</p></div>`
    : equipos.map(eq => renderMotorCard(eq)).join('');

  if (footerContainer) footerContainer.innerHTML = getPaginationFooterHtml();
};

const changeMotorsPage = window.changeMotorsPage;

function buildQuery(urgentIds) {
  let query = supabase.from('motores').select('*', { count: 'exact' });
  if (currentMotorsFilter === 'urgent') {
    query = query.in('id', urgentIds.length ? urgentIds : ['00000000-0000-0000-0000-000000000000']);
  } else if (currentMotorsFilter === 'active') {
    query = query.gt('horas', 0);
  }

  if (currentMotorsSearchQuery) {
    query = query.ilike('nombre', `%${currentMotorsSearchQuery}%`);
  }
  return query;
}

// ─── Main render ──────────────────────────────────────────────────────────────

export async function renderMotores(page = 1, filter = 'all') {
  currentMotorsPage = page || 1;
  currentMotorsFilter = filter || 'all';

  // Fetch summary stats
  const [
    { count: totalMachinery },
    { data: allMotors }
  ] = await Promise.all([
    supabase.from('motores').select('*', { count: 'exact', head: true }),
    supabase.from('motores').select('id, horas, max_horas')
  ]);

  const urgentList  = (allMotors || []).filter(m => (m.horas || 0) >= (m.max_horas || 100));
  const urgentIds   = urgentList.map(m => m.id);
  const urgentCount = urgentList.length;
  const activeCount = (allMotors || []).filter(m => (m.horas || 0) > 0).length;

  // Fetch initial page
  const from = (currentMotorsPage - 1) * PAGE_SIZE;
  const to   = currentMotorsPage * PAGE_SIZE - 1;

  const { data: equipos, count: filteredCount, error: fetchErr } = await buildQuery(urgentIds)
    .order('created_at', { ascending: false })
    .range(from, to);

  totalFilteredCount = filteredCount || 0;

  if (fetchErr) {
    console.error('Error fetching motores:', fetchErr);
    return `<div class="screen-motores"><p>Error cargando datos: ${fetchErr.message}</p></div>`;
  }

  if (urgentCount > 0 && currentMotorsFilter !== 'urgent') {
    setTimeout(() => {
      window.Snackbar.show(`${urgentCount} equipos requieren mantenimiento urgente`, { type: 'warning' });
    }, 1000);
  }

  return `
    <div class="screen-motores" style="padding-bottom: 120px;">
      <div class="motores-page-title">
        <h2>Motores &amp; Equipos</h2>
        <div class="ganado-top-actions">
          <div class="search-container ${currentMotorsSearchQuery ? 'active' : ''}" id="motors-search-container" style="display: flex; align-items: center; background: #f5f5f5; border-radius: 20px; padding: 4px 12px; transition: all 0.3s;">
            <span class="material-icons" style="font-size: 20px; color: #888;">search</span>
            <input type="text" id="motors-search-input" placeholder="Buscar equipo..." value="${currentMotorsSearchQuery}" style="border: none; background: none; padding: 8px; outline: none; font-size: 14px; width: ${currentMotorsSearchQuery ? '180px' : '0px'}; transition: width 0.3s; opacity: ${currentMotorsSearchQuery ? '1' : '0'};">
          </div>
          <button class="ganado-icon-btn" id="motors-search-toggle" title="Buscar">
            <span class="material-icons">${currentMotorsSearchQuery ? 'close' : 'search'}</span>
          </button>
        </div>
      </div>

      <div class="da-tabs-section">
        <!-- Summary / Filter Cards -->
        <section class="motores-top-cards">
          <div class="motores-card motores-card-primary motores-card-filter ${currentMotorsFilter === 'all' ? 'active' : ''}" data-filter="all">
            <div class="motores-card-header">
              <span class="material-icons">settings</span>
              <span class="motores-card-label">Total Maquinaria</span>
            </div>
            <div class="motores-card-body">
              <h3 class="motores-card-value">${totalMachinery}</h3>
              <p class="ganado-card-sub">Registrados</p>
            </div>
          </div>

          ${urgentCount > 0 ? `
          <div class="motores-card motores-card-tertiary motores-card-filter ${currentMotorsFilter === 'urgent' ? 'active' : ''}" data-filter="urgent">
            <div class="motores-card-header">
              <span class="material-icons">build</span>
              <span class="motores-card-label">Urgente</span>
            </div>
            <div class="motores-card-body">
              <h3 class="motores-card-value">${urgentCount}</h3>
              <p class="ganado-card-sub">Req. Aceite</p>
            </div>
          </div>
          ` : ''}

          <div class="motores-card motores-card-surface motores-card-filter ${currentMotorsFilter === 'active' ? 'active' : ''}" data-filter="active">
            <div class="motores-card-header">
              <span class="material-icons">bolt</span>
              <span class="motores-card-label">En Uso</span>
            </div>
            <div class="motores-card-body">
              <h3 class="motores-card-value">${activeCount}</h3>
              <div class="progress-track">
                <div class="progress-fill" style="width: ${totalMachinery ? (activeCount / totalMachinery) * 100 : 0}%; background: var(--primary);"></div>
              </div>
            </div>
          </div>
        </section>

        <!-- List -->
        <div class="motores-list-header" style="margin-top: 32px; margin-bottom: 16px;">
          <h4>${currentMotorsFilter === 'all' ? 'Maquinaria Registrada' : 'Resultados del Filtro'}</h4>
          <span class="ganado-count-label">${totalFilteredCount} equipos</span>
        </div>

        <div class="motores-grid" id="motors-list-container">
          ${equipos.length === 0
            ? `<div class="ganado-empty"><p>No se encontraron equipos.</p></div>`
            : equipos.map(eq => renderMotorCard(eq)).join('')}
        </div>

        <!-- Pagination Footer -->
        <div id="motors-pagination-wrapper">
          ${getPaginationFooterHtml()}
        </div>
      </div>

      <button class="fab-premium" onclick="window.navigateTo('nuevo_motor')">
        <span class="material-icons">add</span>
        <span class="label">Agregar motor</span>
      </button>
    </div>
  `;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initMotores() {
  window.toggleActionMenu = (btn) => {
    const menu = btn.nextElementSibling;
    const isActive = menu.classList.contains('active');
    document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    if (!isActive) menu.classList.add('active');
  };

  window.confirmDeleteMotor = (id, name) => {
    window.Snackbar.confirm(`¿Eliminar equipo ${name}?`, async () => {
      const { error } = await supabase.from('motores').delete().eq('id', id);
      if (error) window.Snackbar.show('Error: ' + error.message, { type: 'error' });
      else { window.Snackbar.show('Motor eliminado'); window.navigateTo('motores'); }
    });
  };

  // Filter cards re-render the full screen with the selected filter
  document.querySelectorAll('.motores-card-filter').forEach(card => {
    card.addEventListener('click', () => {
      const filter = card.dataset.filter;
      window.navigateTo('motores', 1, filter);
    });
  });

  // Search logic
  const searchToggle = document.getElementById('motors-search-toggle');
  const searchContainer = document.getElementById('motors-search-container');
  const searchInput = document.getElementById('motors-search-input');

  if (searchToggle && searchInput) {
    searchToggle.addEventListener('click', () => {
      if (searchContainer.classList.contains('active')) {
        currentMotorsSearchQuery = '';
        searchInput.value = '';
        searchContainer.classList.remove('active');
        searchInput.style.width = '0px';
        searchInput.style.opacity = '0';
        searchToggle.querySelector('.material-icons').textContent = 'search';
        window.changeMotorsPage(1);
      } else {
        searchContainer.classList.add('active');
        searchInput.style.width = '180px';
        searchInput.style.opacity = '1';
        searchInput.focus();
        searchToggle.querySelector('.material-icons').textContent = 'close';
      }
    });

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      currentMotorsSearchQuery = e.target.value;
      searchTimeout = setTimeout(() => {
        window.changeMotorsPage(1);
      }, 500);
    });
  }

  const closeMenus = (e) => {
    if (!e.target.closest('.ganado-btn-more')) {
      document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    }
  };
  window.removeEventListener('click', closeMenus);
  window.addEventListener('click', closeMenus);
}

// ─── Row renderer ─────────────────────────────────────────────────────────────

function renderMotorCard(eq) {
  const hours    = eq.horas || 0;
  const maxHours = eq.max_horas || 100;
  const pct      = Math.min(100, Math.round((hours / maxHours) * 100));

  const imgHtml = eq.image_url
    ? `<img src="${eq.image_url}" alt="${eq.nombre}" style="width: 100%; height: 100%; object-fit: cover;">`
    : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #f5f5f5; color: #ccc;"><span class="material-icons">settings</span></div>`;

  return `
    <div class="motor-card-compact" onclick="window.navigateTo('detalle_motor', '${eq.id}')">
      
      <!-- Image with Status Indicator -->
      <div class="motor-compact-img">
        ${imgHtml}
        <div style="position: absolute; bottom: 2px; right: 2px; width: 16px; height: 16px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
          <span class="material-icons" style="font-size: 14px; color: ${pct >= 95 ? '#c62828' : '#2e7d32'};">check_circle</span>
        </div>
      </div>
      <!-- Info Group -->
      <div class="motor-compact-info">
        <span class="motor-compact-label">S/N</span>
        <h3 class="motor-compact-title">${eq.nombre}</h3>
      </div>
      <!-- Usage Stat -->
      <div class="motor-compact-usage">
        <span class="motor-compact-label">USO</span>
        <div class="motor-compact-usage-val">${hours}/${maxHours}h</div>
      </div>
      <!-- More Actions -->
      <div style="position: relative;">
        <button onclick="event.stopPropagation(); window.toggleActionMenu(this)" style="border: none; background: transparent; color: #666; cursor: pointer; padding: 8px; border-radius: 50%;">
          <span class="material-icons">more_vert</span>
        </button>
        <div class="action-menu" style="right: 0; bottom: auto; top: 100%;">
          <button class="action-item" onclick="event.stopPropagation(); window.navigateTo('nuevo_motor', '${eq.id}')">
            <span class="material-icons">edit</span><span>Editar</span>
          </button>
          <button class="action-item delete" onclick="event.stopPropagation(); window.confirmDeleteMotor('${eq.id}', '${eq.nombre}')">
            <span class="material-icons">delete</span><span>Eliminar</span>
          </button>
        </div>
      </div>
    </div>
  `;
}
