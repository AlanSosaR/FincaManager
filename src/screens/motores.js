import { supabase } from '../supabase.js';
import { getPaginationFooterHtml } from '../pagination.js';

let currentMotorsPage = 1;
let currentMotorsFilter = 'all';
let currentMotorsSearchQuery = '';
let totalFilteredCount = 0;
const PAGE_SIZE = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function paginationFooterHtml() {
  const totalPages = Math.ceil(totalFilteredCount / PAGE_SIZE) || 1;
  return getPaginationFooterHtml({
    currentPage: currentMotorsPage,
    totalPages,
    prevId: 'motors-prev-btn',
    nextId: 'motors-next-btn',
    changeFn: 'changeMotorsPage'
  });
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
      <span class="material-icons rotating" style="font-size: 28px; color: var(--primary-container);">autorenew</span>
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

  if (footerContainer) footerContainer.innerHTML = paginationFooterHtml();
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
      <div class="motores-top-actions-container" style="display: flex; justify-content: flex-end; margin: 16px 0 8px;">
        <div class="ganado-split-ctrl" id="motors-search-wrapper">
          <button id="motors-search-toggle" class="m3-icon-btn-tonal" style="margin: 0; box-shadow: none; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;" title="Buscar">
            <span class="material-icons" style="color: #ffffff;">search</span>
          </button>
          <input type="text" id="motors-search-input" placeholder="Buscar equipo..." value="${currentMotorsSearchQuery}" style="border: none; background: transparent; outline: none; font-size: 15px; width: ${currentMotorsSearchQuery ? '160px' : '0px'}; transition: width 0.3s; opacity: ${currentMotorsSearchQuery ? '1' : '0'}; padding: ${currentMotorsSearchQuery ? '0 8px 0 0' : '0'}; color: #ffffff;">
          <button id="motors-search-clear" style="background: none; border: none; cursor: pointer; display: ${currentMotorsSearchQuery ? 'flex' : 'none'}; align-items: center; justify-content: center; padding: 0 16px 0 8px; color: #ffffff; height: 100%;" title="Limpiar búsqueda">
            <span class="material-icons" style="font-size: 20px;">close</span>
          </button>
          <span class="ganado-split-ctrl-sep"></span>
          <button class="ganado-split-ctrl-reg" onclick="window.toggleMotorsSplitMenu(event)" title="Más opciones">
            <span class="material-icons">arrow_drop_down</span>
          </button>
          <div class="ganado-split-menu" id="motors-split-menu">
            <button class="ganado-split-item" onclick="window.navigateTo('nuevo_motor'); document.getElementById('motors-split-menu').classList.remove('open');">
              <span class="material-icons">add</span><span>Registrar equipo</span>
            </button>
          </div>
        </div>
      </div>
      <div class="motores-page-title" style="margin-top: -10px; margin-bottom: 24px;">
        <h2>Motores &amp; Equipos</h2>
      </div>

      <div class="da-tabs-section">
        <!-- Summary / Filter Cards -->
        <section class="motores-top-cards">
          <div class="motores-card motores-card-primary motores-card-filter ${currentMotorsFilter === 'all' ? 'active' : ''}" data-filter="all">
            <div class="ganado-tally-top">
              <span class="ganado-tally-label">Total Maquinaria</span>
              <span class="ganado-tally-count">
                <span class="ganado-card-value">${totalMachinery}</span>
                <span class="ganado-tally-unit">equipos</span>
              </span>
            </div>
            <div class="ganado-tally-divider"></div>
            <div class="ganado-tally-row">
              ${urgentCount > 0 ? `
              <div class="ganado-tag-stat motores-card-filter ${currentMotorsFilter === 'urgent' ? 'active' : ''}" data-filter="urgent" title="Ver equipos que requieren aceite">
                <span class="ganado-tag-swatch g"><span class="material-icons">build</span></span>
                <span class="ganado-tag-info">
                  <span class="ganado-tag-n">${urgentCount}</span>
                  <span class="ganado-tag-l">Req. aceite</span>
                  <span class="ganado-fumig-chip"><span class="material-icons" style="font-size:13px;">schedule</span> ${urgentCount} pendientes</span>
                </span>
              </div>
              ` : ''}
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
          ${paginationFooterHtml()}
        </div>
      </div>
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

  // Split control (search + arrow) menu
  window.toggleMotorsSplitMenu = (e) => {
    if (e) e.stopPropagation();
    const menu = document.getElementById('motors-split-menu');
    if (menu) menu.classList.toggle('open');
  };

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('motors-split-menu');
    if (menu && !e.target.closest('.ganado-split-ctrl')) menu.classList.remove('open');
  });

  // Search logic
  const searchToggle = document.getElementById('motors-search-toggle');
  const searchWrapper = document.getElementById('motors-search-wrapper');
  const searchInput = document.getElementById('motors-search-input');
  const searchClear = document.getElementById('motors-search-clear');

  if (searchToggle && searchInput && searchWrapper && searchClear) {
    searchToggle.addEventListener('click', () => {
      if (!searchInput.style.width || searchInput.style.width === '0px') {
        searchInput.style.width = '160px';
        searchInput.style.opacity = '1';
        searchInput.style.padding = '0 8px 0 0';
        searchClear.style.display = 'flex';
        searchInput.focus();
      }
    });

    searchClear.addEventListener('click', () => {
      currentMotorsSearchQuery = '';
      searchInput.value = '';
      searchInput.style.width = '0px';
      searchInput.style.opacity = '0';
      searchInput.style.padding = '0';
      searchClear.style.display = 'none';
      window.changeMotorsPage(1);
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
        ${pct >= 95 ? `
        <div style="position: absolute; bottom: 2px; right: 2px; width: 16px; height: 16px; background: white; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
          <span class="material-icons" style="font-size: 14px; color: #ff4103;">warning</span>
        </div>` : ''}
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
