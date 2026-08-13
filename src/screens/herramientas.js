import { supabase } from '../supabase.js';
import { getPaginationFooterHtml } from '../pagination.js';

let currentToolsPage = 1;
let totalToolsCount = 0;
let currentToolsSearchQuery = '';
const PAGE_SIZE = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function paginationFooterHtml() {
  const totalPages = Math.ceil(totalToolsCount / PAGE_SIZE) || 1;
  return getPaginationFooterHtml({
    currentPage: currentToolsPage,
    totalPages,
    prevId: 'tools-prev-btn',
    nextId: 'tools-next-btn',
    changeFn: 'changeToolsPage'
  });
}

function buildToolsQuery() {
  let query = supabase.from('herramientas').select('*', { count: 'exact' });
  if (currentToolsSearchQuery) {
    query = query.or(`nombre.ilike.%${currentToolsSearchQuery}%,categoria.ilike.%${currentToolsSearchQuery}%`);
  }
  return query;
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

  const { data: tools, count, error } = await buildToolsQuery()
    .order('nombre', { ascending: true })
    .range(from, to);

  if (error || !tools) {
    listContainer.innerHTML = `<div class="ganado-empty" style="grid-column: 1 / -1;"><p>Error cargando datos.</p></div>`;
    return;
  }

  totalToolsCount = count || 0;
  listContainer.innerHTML = tools.length === 0
    ? `<div class="ganado-empty" style="grid-column: 1 / -1;"><span class="material-icons">search_off</span><p>${currentToolsSearchQuery ? 'No se encontraron herramientas.' : 'No hay herramientas en esta página.'}</p></div>`
    : tools.map(t => renderToolRow(t)).join('');

  const countLabel = document.getElementById('tools-count-label');
  if (countLabel) countLabel.textContent = `${totalToolsCount} registros`;

  if (footerContainer) footerContainer.innerHTML = paginationFooterHtml();
};

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

  const { data: tools, count: filteredCount, error } = await buildToolsQuery()
    .order('nombre', { ascending: true })
    .range(0, PAGE_SIZE - 1);

  totalToolsCount = currentToolsSearchQuery ? (filteredCount || 0) : (totalCount || 0);

  if (error) {
    console.error('Error fetching herramientas:', error);
    return `<div class="screen-herramientas"><p>Error cargando datos: ${error.message}</p></div>`;
  }

  const totalTools = allStats ? allStats.length : 0;
  const inRepair   = allStats ? allStats.filter(t => t.estado === 'Reparación').length : 0;
  const available  = allStats ? allStats.filter(t => t.estado === 'Disponible' || !t.estado).length : 0;

  return `
    <div class="screen-herramientas" style="padding-bottom: 100px;">

      <!-- Search -->
      <div class="motores-top-actions-container" style="display: flex; justify-content: flex-end; margin: 16px 0 8px;">
        <div class="ganado-split-ctrl" id="tools-search-wrapper">
          <button id="tools-search-toggle" class="m3-icon-btn-tonal" style="margin: 0; box-shadow: none; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;" title="Buscar">
            <span class="material-icons" style="color: #ffffff;">search</span>
          </button>
          <input type="text" id="tools-search-input" placeholder="Buscar herramienta..." value="${currentToolsSearchQuery}" style="border: none; background: transparent; outline: none; font-size: 15px; width: ${currentToolsSearchQuery ? '180px' : '0px'}; transition: width 0.3s; opacity: ${currentToolsSearchQuery ? '1' : '0'}; padding: ${currentToolsSearchQuery ? '0 8px 0 0' : '0'}; color: #ffffff;">
          <button id="tools-search-clear" style="background: none; border: none; cursor: pointer; display: ${currentToolsSearchQuery ? 'flex' : 'none'}; align-items: center; justify-content: center; padding: 0 16px 0 8px; color: #ffffff; height: 100%;" title="Limpiar búsqueda">
            <span class="material-icons" style="font-size: 20px;">close</span>
          </button>
          <span class="ganado-split-ctrl-sep"></span>
          <button class="ganado-split-ctrl-reg" onclick="window.toggleToolsSplitMenu(event)" title="Más opciones">
            <span class="material-icons">arrow_drop_down</span>
          </button>
          <div class="ganado-split-menu" id="tools-split-menu">
            <button class="ganado-split-item" onclick="window.navigateTo('nueva_herramienta'); document.getElementById('tools-split-menu').classList.remove('open');">
              <span class="material-icons">add</span><span>Registrar herramienta</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Page Title -->
      <div class="herramientas-page-title">
        <h2>Herramientas</h2>
      </div>

      <div class="da-tabs-section">
        <!-- Summary Cards -->
        <section class="herramientas-top-cards">
          <div class="herramientas-card herramientas-card-primary ganado-tally">
            <div class="ganado-tally-top">
              <span class="ganado-tally-label">Total Equipos</span>
              <span class="ganado-tally-count">
                <span class="ganado-card-value">${totalTools}</span>
                <span class="ganado-tally-unit">equipos</span>
              </span>
            </div>
            <div class="ganado-tally-divider"></div>
            <div class="ganado-tally-row">
              <div class="ganado-tag-stat">
                <span class="ganado-tag-swatch o"><span class="material-icons">check_circle</span></span>
                <span class="ganado-tag-info">
                  <span class="ganado-tag-n">${available}</span>
                  <span class="ganado-tag-l">Disponibles</span>
                </span>
              </div>
              ${inRepair > 0 ? `
              <div class="ganado-tag-stat">
                <span class="ganado-tag-swatch g"><span class="material-icons">build</span></span>
                <span class="ganado-tag-info">
                  <span class="ganado-tag-n">${inRepair}</span>
                  <span class="ganado-tag-l">En Taller</span>
                </span>
              </div>` : ''}
            </div>
          </div>
        </section>

        <!-- List Header -->
        <div class="ganado-list-header">
          <div class="ganado-list-title-group">
            <h4>Inventario</h4>
            <span class="ganado-count-label" id="tools-count-label">${totalToolsCount} registros</span>
          </div>
          <button class="ganado-filter-btn" id="btn-export-tools">
            Exportar <span class="material-icons" style="font-size:16px;">download</span>
          </button>
        </div>

        <!-- Tools List -->
        <div class="ganado-list" id="tools-list-container">
          ${tools.length === 0
            ? `<div class="ganado-empty" style="grid-column: 1 / -1;">
                 <span class="material-icons">${currentToolsSearchQuery ? 'search_off' : 'construction'}</span>
                 <p>${currentToolsSearchQuery ? 'No se encontraron herramientas.' : 'No hay herramientas registradas.'}</p>
               </div>`
            : tools.map(t => renderToolRow(t)).join('')}
        </div>

        <!-- Pagination Footer -->
        <div id="tools-pagination-wrapper">
          ${paginationFooterHtml()}
        </div>
      </div>
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

  const exportBtn = document.getElementById('btn-export-tools');
  if (exportBtn) {
    exportBtn.addEventListener('click', exportToolsToCsv);
  }

  // Split control (search + arrow) menu
  window.toggleToolsSplitMenu = (e) => {
    if (e) e.stopPropagation();
    const menu = document.getElementById('tools-split-menu');
    if (menu) menu.classList.toggle('open');
  };

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('tools-split-menu');
    if (menu && !e.target.closest('.ganado-split-ctrl')) menu.classList.remove('open');
  });

  // Search logic
  const searchToggle  = document.getElementById('tools-search-toggle');
  const searchWrapper = document.getElementById('tools-search-wrapper');
  const searchInput   = document.getElementById('tools-search-input');
  const searchClear   = document.getElementById('tools-search-clear');

  if (searchToggle && searchInput && searchWrapper && searchClear) {
    searchToggle.addEventListener('click', () => {
      if (!searchInput.style.width || searchInput.style.width === '0px') {
        searchInput.style.width = '180px';
        searchInput.style.opacity = '1';
        searchInput.style.padding = '0 8px 0 0';
        searchClear.style.display = 'flex';
        searchInput.focus();
      }
    });

    searchClear.addEventListener('click', () => {
      currentToolsSearchQuery = '';
      searchInput.value = '';
      searchInput.style.width = '0px';
      searchInput.style.opacity = '0';
      searchInput.style.padding = '0';
      searchClear.style.display = 'none';
      window.changeToolsPage(1);
    });

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      currentToolsSearchQuery = e.target.value;
      searchTimeout = setTimeout(() => {
        window.changeToolsPage(1);
      }, 500);
    });
  }

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

  const closeMenus = (e) => {
    if (!e.target.closest('.ganado-btn-more')) {
      document.querySelectorAll('.action-menu').forEach(m => m.classList.remove('active'));
    }
  };
  window.removeEventListener('click', closeMenus);
  window.addEventListener('click', closeMenus);
}

// ─── Row renderer ─────────────────────────────────────────────────────────────

async function exportToolsToCsv() {
  const btn = document.getElementById('btn-export-tools');
  const original = btn.innerHTML;
  btn.innerHTML = '<span class="material-symbols-outlined animate-spin" style="font-size:16px;">sync</span> Exportando...';
  btn.disabled = true;
  try {
    const { data: tools, error } = await supabase
      .from('herramientas')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) throw error;

    const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const estadoColor = (estado) => {
      if (estado === 'Reparación') return 'background:#fff3e0;color:#ef6c00;font-weight:700;';
      if (estado === 'Baja') return 'background:#ffe2db;color:#ff4103;font-weight:700;';
      return 'background:#f0f7e6;color:#2d3e2c;font-weight:700;';
    };

    const rows = (tools || []).map(t => {
      const estado = t.estado || 'Disponible';
      const fecha = t.created_at ? new Date(t.created_at).toLocaleDateString() : '';
      return `<tr>
        <td>${esc(t.nombre || '')}</td>
        <td>${esc(t.categoria || '')}</td>
        <td><span style="display:inline-block;padding:3px 10px;border-radius:10px;${estadoColor(estado)}">${esc(estado)}</span></td>
        <td>${esc(fecha)}</td>
      </tr>`;
    }).join('');

    const html = `
      <html xmlns:x="urn:schemas-microsoft-com:office:excel">
      <head>
        <meta charset="UTF-8">
        <!--[if gte mso 9]><xml>
          <x:ExcelWorkbook>
            <x:ExcelWorksheets><x:ExcelWorksheet>
              <x:Name>Herramientas</x:Name>
              <x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions>
            </x:ExcelWorksheet></x:ExcelWorksheets>
          </x:ExcelWorkbook>
        </xml><![endif]-->
        <style>
          table { border-collapse: collapse; font-family: 'Segoe UI', Arial, sans-serif; font-size: 12px; }
          th { background: #2d3e2c; color: #ffffff; font-weight: 700; padding: 10px 14px; border: 1px solid #2d3e2c; text-align: left; }
          td { padding: 8px 14px; border: 1px solid #dddddd; }
          tr:nth-child(even) td { background: #f6f4ec; }
          .title { font-family: 'Segoe UI', Arial, sans-serif; font-size: 18px; font-weight: 700; color: #2d3e2c; margin-bottom: 8px; }
        </style>
      </head>
      <body>
        <div class="title">Inventario de Herramientas</div>
        <table>
          <thead>
            <tr><th>Nombre</th><th>Categoría</th><th>Estado</th><th>Fecha de Registro</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </body>
      </html>`;

    const blob = new Blob([html], { type: 'application/vnd.ms-excel;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `herramientas_${date}.xls`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    window.Snackbar.show(`Exportadas ${(tools || []).length} herramientas`);
  } catch (err) {
    console.error('Error exportando herramientas:', err);
    window.Snackbar.show('Error al exportar: ' + err.message, { type: 'error' });
  } finally {
    btn.innerHTML = original;
    btn.disabled = false;
  }
}

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
  const thumbnail = tool.image_url
    ? `<img src="${tool.image_url}" alt="${tool.nombre || ''}" style="width: 100%; height: 100%; object-fit: cover;">`
    : icon;

  return `
    <div class="ganado-row" onclick="window.navigateTo('detalle_herramienta', '${tool.id}')">
      <div class="ganado-row-img-container" style="background: var(--surface-container-high); display: flex; align-items: center; justify-content: center; font-size: 24px; overflow: hidden;">
        ${thumbnail}
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
