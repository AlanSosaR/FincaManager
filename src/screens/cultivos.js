import { supabase } from '../supabase.js';
import { getPaginationFooterHtml } from '../pagination.js';

let currentCultivosPage = 1;
let totalCultivosCount = 0;
let currentCultivosSearchQuery = '';
let currentCultivoEstado = '';
const PAGE_SIZE = 8;

const ESTADOS = ['En crecimiento', 'En floración', 'Madurando', 'Cosechado'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function estadoColor(estado) {
  switch (estado) {
    case 'En floración': return 'background:#e3f2fd;color:#1565c0;';
    case 'Madurando': return 'background:#fff3e0;color:#ef6c00;';
    case 'Cosechado': return 'background:#c8e6c9;color:#2e7d32;';
    default: return 'background:#f0f7e6;color:#2d3e2c;';
  }
}

function buildCultivosQuery() {
  let query = supabase.from('cultivos').select('*', { count: 'exact' });
  if (currentCultivoEstado) {
    query = query.eq('estado_cosecha', currentCultivoEstado);
  }
  if (currentCultivosSearchQuery) {
    query = query.ilike('tipo', `%${currentCultivosSearchQuery}%`);
  }
  return query;
}

function paginationFooterHtml() {
  const totalPages = Math.ceil(totalCultivosCount / PAGE_SIZE) || 1;
  return getPaginationFooterHtml({
    currentPage: currentCultivosPage,
    totalPages,
    prevId: 'cultivos-prev-btn',
    nextId: 'cultivos-next-btn',
    changeFn: 'changeCultivosPage'
  });
}

async function fetchLotes() {
  const { data } = await supabase.from('lotes').select('id,nombre');
  return new Map((data || []).map(x => [x.id, x.nombre]));
}

function fmtFecha(fechaStr) {
  if (!fechaStr) return '—';
  const d = new Date(fechaStr + 'T12:00:00');
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ─── Paginación ───────────────────────────────────────────────────────────────

window.changeCultivosPage = async function(page) {
  currentCultivosPage = page;
  const from = (page - 1) * PAGE_SIZE;
  const to   = page * PAGE_SIZE - 1;

  const listContainer    = document.getElementById('cultivos-list-container');
  const footerContainer  = document.getElementById('cultivos-pagination-wrapper');
  if (!listContainer) return;

  listContainer.innerHTML = `
    <div style="padding: 32px; text-align: center; color: #888; grid-column: 1 / -1;">
      <span class="material-icons rotating" style="font-size: 28px; color: var(--primary-container);">autorenew</span>
    </div>`;

  const [{ data: cultivos, count, error }, loteMap] = await Promise.all([
    buildCultivosQuery().order('fecha_siembra', { ascending: false }).range(from, to),
    fetchLotes()
  ]);

  if (error || !cultivos) {
    listContainer.innerHTML = `<div class="ganado-empty" style="grid-column: 1 / -1;"><p>Error cargando datos.</p></div>`;
    return;
  }

  totalCultivosCount = count || 0;
  listContainer.innerHTML = cultivos.length === 0
    ? `<div class="ganado-empty" style="grid-column: 1 / -1;"><span class="material-icons">search_off</span><p>${currentCultivosSearchQuery ? 'No se encontraron cultivos.' : 'No hay cultivos registrados.'}</p></div>`
    : cultivos.map(c => renderCultivoRow(c, loteMap)).join('');

  const countLabel = document.getElementById('cultivos-count-label');
  if (countLabel) countLabel.textContent = `${totalCultivosCount} registros`;

  if (footerContainer) footerContainer.innerHTML = paginationFooterHtml();
};

// ─── Main render ──────────────────────────────────────────────────────────────

export async function renderCultivos() {
  currentCultivosPage = 1;

  const [{ data: stats }, { data: cultivos, count, error }, loteMap] = await Promise.all([
    supabase.from('cultivos').select('estado_cosecha,area_ha'),
    buildCultivosQuery().order('fecha_siembra', { ascending: false }).range(0, PAGE_SIZE - 1),
    fetchLotes()
  ]);

  if (error) {
    console.error('Error fetching cultivos:', error);
    return `<div class="screen-herramientas"><p>Error cargando datos: ${error.message}</p></div>`;
  }

  const all = stats || [];
  const activos    = all.filter(c => c.estado_cosecha !== 'Cosechado').length;
  const cosechados = all.filter(c => c.estado_cosecha === 'Cosechado').length;
  const areaTotal  = all.reduce((s, c) => s + (parseFloat(c.area_ha) || 0), 0);

  totalCultivosCount = count || 0;

  return `
    <div class="screen-herramientas" style="padding-bottom: 100px;">

      <!-- Search -->
      <div class="motores-top-actions-container" style="display: flex; justify-content: flex-end; margin-bottom: 8px;">
        <div class="search-wrapper" id="cultivos-search-wrapper" style="display: flex; align-items: center; background: ${currentCultivosSearchQuery ? '#2d3e2c' : 'transparent'}; border-radius: 12px; transition: all 0.3s; height: 48px;">
          <button id="cultivos-search-toggle" class="m3-icon-btn-tonal" style="margin: 0; box-shadow: none; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: ${currentCultivosSearchQuery ? 'transparent' : ''};" title="Buscar">
            <span class="material-icons" style="color: ${currentCultivosSearchQuery ? '#ffffff' : 'var(--primary-container)'};">search</span>
          </button>
          <input type="text" id="cultivos-search-input" placeholder="Buscar por tipo..." value="${currentCultivosSearchQuery}" style="border: none; background: transparent; outline: none; font-size: 15px; width: ${currentCultivosSearchQuery ? '180px' : '0px'}; transition: width 0.3s; opacity: ${currentCultivosSearchQuery ? '1' : '0'}; padding: ${currentCultivosSearchQuery ? '0 8px 0 0' : '0'}; color: ${currentCultivosSearchQuery ? '#ffffff' : '#333'};">
          <button id="cultivos-search-clear" style="background: none; border: none; cursor: pointer; display: ${currentCultivosSearchQuery ? 'flex' : 'none'}; align-items: center; justify-content: center; padding: 0 16px 0 8px; color: ${currentCultivosSearchQuery ? '#ffffff' : '#666'}; height: 100%;" title="Limpiar búsqueda">
            <span class="material-icons" style="font-size: 20px;">close</span>
          </button>
        </div>
      </div>

      <!-- Page Title -->
      <div class="herramientas-page-title">
        <h2>Cultivos</h2>
      </div>

      <div class="da-tabs-section">
        <!-- Summary Cards -->
        <section class="herramientas-top-cards">
          <div class="herramientas-card herramientas-card-primary">
            <div class="herramientas-card-header">
              <span class="material-icons">agriculture</span>
              <span class="herramientas-card-label">Cultivos activos</span>
            </div>
            <div class="herramientas-card-body">
              <h3 class="herramientas-card-value">${activos}</h3>
            </div>
          </div>

          <div class="herramientas-card herramientas-card-surface">
            <div class="herramientas-card-header">
              <span class="material-icons">terrain</span>
              <span class="herramientas-card-label">Área total (ha)</span>
            </div>
            <div class="herramientas-card-body">
              <h3 class="herramientas-card-value">${areaTotal.toFixed(2)}</h3>
            </div>
          </div>

          ${cosechados > 0 ? `
          <div class="herramientas-card herramientas-card-tertiary">
            <div class="herramientas-card-header">
              <span class="material-icons">check_circle</span>
              <span class="herramientas-card-label">Cosechados</span>
            </div>
            <div class="herramientas-card-body">
              <h3 class="herramientas-card-value">${cosechados}</h3>
            </div>
          </div>` : ''}
        </section>

        <!-- List Header -->
        <div class="ganado-list-header">
          <div class="ganado-list-title-group">
            <h4>Historial</h4>
            <span class="ganado-count-label" id="cultivos-count-label">${totalCultivosCount} registros</span>
          </div>
          <select id="cultivos-estado-select" class="ganado-filter-btn" style="padding:8px 12px;background:var(--surface,#fff);"
            onchange="window.changeCultivoEstado(this.value)">
            <option value="">Todos los estados</option>
            ${ESTADOS.map(e => `<option value="${e}" ${currentCultivoEstado === e ? 'selected' : ''}>${e}</option>`).join('')}
          </select>
        </div>

        <!-- Cultivos List -->
        <div class="ganado-list" id="cultivos-list-container">
          ${cultivos.length === 0
            ? `<div class="ganado-empty" style="grid-column: 1 / -1;">
                 <span class="material-icons">${currentCultivosSearchQuery ? 'search_off' : 'agriculture'}</span>
                 <p>${currentCultivosSearchQuery ? 'No se encontraron cultivos.' : 'No hay cultivos registrados.'}</p>
               </div>`
            : cultivos.map(c => renderCultivoRow(c, loteMap)).join('')}
        </div>

        <!-- Pagination Footer -->
        <div id="cultivos-pagination-wrapper">
          ${paginationFooterHtml()}
        </div>
      </div>

      <!-- FAB -->
      <button class="fab-premium" onclick="window.navigateTo('nuevo_cultivo')">
        <span class="material-icons">add</span>
        <span class="label">Nuevo cultivo</span>
      </button>
    </div>
  `;
}

window.changeCultivoEstado = function(value) {
  currentCultivoEstado = value;
  window.clearScreenCache?.('cultivos');
  window.navigateTo('cultivos');
};

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initCultivos() {
  window.toggleActionMenu = (btn) => {
    const menu = btn.nextElementSibling;
    const isActive = menu.classList.contains('active');
    document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    if (!isActive) menu.classList.add('active');
  };

  // Search logic
  const searchToggle  = document.getElementById('cultivos-search-toggle');
  const searchWrapper = document.getElementById('cultivos-search-wrapper');
  const searchInput   = document.getElementById('cultivos-search-input');
  const searchClear   = document.getElementById('cultivos-search-clear');

  if (searchToggle && searchInput && searchWrapper && searchClear) {
    searchToggle.addEventListener('click', () => {
      if (!searchInput.style.width || searchInput.style.width === '0px') {
        searchWrapper.style.background = '#2d3e2c';
        searchToggle.style.background = 'transparent';
        searchToggle.querySelector('.material-icons').style.color = '#ffffff';
        searchInput.style.width = '180px';
        searchInput.style.opacity = '1';
        searchInput.style.padding = '0 8px 0 0';
        searchInput.style.color = '#ffffff';
        searchClear.style.color = '#ffffff';
        searchClear.style.display = 'flex';
        searchInput.focus();
      }
    });

    searchClear.addEventListener('click', () => {
      currentCultivosSearchQuery = '';
      searchInput.value = '';
      searchWrapper.style.background = 'transparent';
      searchToggle.style.background = '';
      searchToggle.querySelector('.material-icons').style.color = '';
      searchInput.style.width = '0px';
      searchInput.style.opacity = '0';
      searchInput.style.padding = '0';
      searchInput.style.color = '';
      searchClear.style.color = '';
      searchClear.style.display = 'none';
      window.changeCultivosPage(1);
    });

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      currentCultivosSearchQuery = e.target.value;
      searchTimeout = setTimeout(() => {
        window.changeCultivosPage(1);
      }, 500);
    });
  }

  window.confirmDeleteCultivo = (id, tipo) => {
    window.Snackbar.confirm(
      `¿Eliminar este cultivo${tipo ? ` (${tipo})` : ''}?`,
      async () => {
        const { error } = await supabase.from('cultivos').delete().eq('id', id);
        if (error) {
          window.Snackbar.show('Error al eliminar: ' + error.message, { type: 'error' });
        } else {
          window.Snackbar.show('Cultivo eliminado correctamente');
          window.navigateTo('cultivos');
        }
      },
      null,
      { confirmText: 'Eliminar', cancelText: 'No' }
    );
  };

  const closeMenus = (e) => {
    if (!e.target.closest('.ganado-btn-more')) {
      document.querySelectorAll('.action-menu').forEach(m => m.classList.remove('active'));
    }
  };
  window.removeEventListener('click', closeMenus);
  window.addEventListener('click', closeMenus);
}

// ─── Row renderer ─────────────────────────────────────────────────────────────

function renderCultivoRow(c, loteMap) {
  const loteName = c.lote_id ? loteMap.get(c.lote_id) : null;
  return `
    <div class="ganado-row" onclick="window.navigateTo('nuevo_cultivo', '${c.id}')">
      <div class="ganado-row-img-container" style="background: var(--surface-container-high); display: flex; align-items: center; justify-content: center; font-size: 24px; overflow: hidden;">
        <span class="material-icons" style="font-size:26px;color:#2d3e2c;">agriculture</span>
      </div>

      <div class="ganado-row-content">
        <div class="ganado-col-group" style="flex:1;min-width:0;">
          <p class="ganado-col-label">${(c.tipo || 'OTRO').toUpperCase()}</p>
          <p class="ganado-col-value" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">
            ${c.notas || 'Sin notas'}
          </p>
          <p class="ganado-col-label" style="margin-top:4px;">
            ${fmtFecha(c.fecha_siembra)} ${loteName ? `<span style="display:inline-flex;align-items:center;gap:4px;"><span class="material-icons" style="font-size:14px;">eco</span> ${loteName}</span>` : ''}
          </p>
        </div>

        <div class="ganado-col-group" style="text-align:right; position: relative; margin-left: auto; align-items:flex-end;">
          <p class="ganado-col-value" style="font-weight:800;color:#2d3e2c;white-space:nowrap;">${(parseFloat(c.area_ha) || 0).toFixed(2)} ha</p>
          <p style="display:inline-flex;align-items:center;gap:3px;font-size:10px;font-weight:800;text-transform:uppercase;letter-spacing:0.8px;padding:2px 8px;border-radius:10px;margin-top:4px;${estadoColor(c.estado_cosecha)}">${c.estado_cosecha || 'En crecimiento'}</p>
          <button class="ganado-btn-more" onclick="event.stopPropagation(); window.toggleActionMenu(this)">
            <span class="material-icons">more_vert</span>
          </button>

          <div class="action-menu">
            <div class="action-item" onclick="event.stopPropagation(); window.navigateTo('nuevo_cultivo', '${c.id}')">
              <span class="material-icons">edit</span>
              <span>Editar</span>
            </div>
            <div class="action-item delete" onclick="event.stopPropagation(); window.confirmDeleteCultivo('${c.id}', '${String(c.tipo || '').replace(/'/g, "\\'")}')">
              <span class="material-icons">delete</span>
              <span>Eliminar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
