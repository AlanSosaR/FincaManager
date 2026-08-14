import { supabase } from '../supabase.js';
import { getPaginationFooterHtml } from '../pagination.js';

let currentGastosPage = 1;
let totalGastosCount = 0;
let currentGastosSearchQuery = '';
let currentGastosPeriod = 'mes'; // 'mes' | 'mesAnterior' | 'todos'
const PAGE_SIZE = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-HN', { style: 'currency', currency: 'HNL' });
}

function getPeriodRange(period) {
  const now = new Date();
  if (period === 'mes') {
    const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const next = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const to = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}-01`;
    return { from, to };
  }
  if (period === 'mesAnterior') {
    const firstPrev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const from = `${firstPrev.getFullYear()}-${String(firstPrev.getMonth() + 1).padStart(2, '0')}-01`;
    const to = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    return { from, to };
  }
  return { from: null, to: null };
}

const PERIOD_LABEL = { mes: 'Este mes', mesAnterior: 'Mes anterior', todos: 'Todo' };

function inPeriod(fechaStr, r) {
  if (!fechaStr) return false;
  if (r.from && String(fechaStr) < r.from) return false;
  if (r.to && String(fechaStr) >= r.to) return false;
  return true;
}

function computeGastos(all, r) {
  const periodRows = (all || []).filter(g => inPeriod(g.fecha, r));
  let filtered = periodRows;
  if (currentGastosSearchQuery) {
    const q = currentGastosSearchQuery.toLowerCase();
    filtered = filtered.filter(g => (g.descripcion || '').toLowerCase().includes(q));
  }
  filtered.sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)));
  return { periodRows, filtered };
}

function paginationFooterHtml() {
  const totalPages = Math.ceil(totalGastosCount / PAGE_SIZE) || 1;
  return getPaginationFooterHtml({
    currentPage: currentGastosPage,
    totalPages,
    prevId: 'gastos-prev-btn',
    nextId: 'gastos-next-btn',
    changeFn: 'changeGastosPage'
  });
}

function categoriaColor(cat) {
  switch (cat) {
    case 'Veterinaria': return 'background:#fff3e0;color:#ef6c00;';
    case 'Insumos Agrícolas': return 'background:#e3f2fd;color:#1565c0;';
    case 'Foliares/Abonos': return 'background:#f0f7e6;color:#2d3e2c;';
    case 'Maquinaria': return 'background:#ede7f6;color:#5e35b1;';
    case 'Personal': return 'background:#ffe0b2;color:#e65100;';
    default: return 'background:#eceff1;color:#455a64;';
  }
}

// ─── Paginación ───────────────────────────────────────────────────────────────

window.changeGastosPage = async function(page) {
  currentGastosPage = page;
  const from = (page - 1) * PAGE_SIZE;
  const to   = page * PAGE_SIZE - 1;

  const listContainer    = document.getElementById('gastos-list-container');
  const footerContainer  = document.getElementById('gastos-pagination-wrapper');
  if (!listContainer) return;

  listContainer.innerHTML = `
    <div style="padding: 32px; text-align: center; color: #888; grid-column: 1 / -1;">
      <span class="material-icons rotating" style="font-size: 28px; color: var(--primary-container);">autorenew</span>
    </div>`;

  const [{ data: all, error }, refs] = await Promise.all([
    supabase.from('gastos').select('*'),
    fetchRefs()
  ]);

  if (error || !all) {
    listContainer.innerHTML = `<div class="ganado-empty" style="grid-column: 1 / -1;"><p>Error cargando datos.</p></div>`;
    return;
  }

  const r = getPeriodRange(currentGastosPeriod);
  const { filtered } = computeGastos(all, r);
  const gastos = filtered.slice(from, to + 1);

  totalGastosCount = filtered.length;
  listContainer.innerHTML = gastos.length === 0
    ? `<div class="ganado-empty" style="grid-column: 1 / -1;"><span class="material-icons">search_off</span><p>${currentGastosSearchQuery ? 'No se encontraron gastos.' : 'No hay gastos registrados.'}</p></div>`
    : gastos.map(g => renderGastoRow(g, refs)).join('');

  const countLabel = document.getElementById('gastos-count-label');
  if (countLabel) countLabel.textContent = `${totalGastosCount} registros`;

  if (footerContainer) footerContainer.innerHTML = paginationFooterHtml();
};

async function fetchRefs() {
  const [lotesRes, ganadoRes, herramientasRes] = await Promise.all([
    supabase.from('lotes').select('id,nombre'),
    supabase.from('ganado').select('id,nombre'),
    supabase.from('herramientas').select('id,nombre')
  ]);
  const toMap = (arr) => new Map((arr || []).map(x => [x.id, x.nombre]));
  return {
    lotes: toMap(lotesRes.data),
    ganado: toMap(ganadoRes.data),
    herramientas: toMap(herramientasRes.data)
  };
}

// ─── Main render ──────────────────────────────────────────────────────────────

export async function renderGastos() {
  currentGastosPage = 1;

  const [{ data: all, error }, refs] = await Promise.all([
    supabase.from('gastos').select('*'),
    fetchRefs()
  ]);

  if (error) {
    console.error('Error fetching gastos:', error);
    return `<div class="screen-herramientas"><p>Error cargando datos: ${error.message}</p></div>`;
  }

  const r = getPeriodRange(currentGastosPeriod);
  const { periodRows, filtered } = computeGastos(all || [], r);
  const totalPeriod = periodRows.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const byCategory = {};
  periodRows.forEach(g => {
    const cat = g.categoria || 'Otro';
    byCategory[cat] = (byCategory[cat] || 0) + (Number(g.monto) || 0);
  });

  totalGastosCount = filtered.length;
  const gastos = filtered.slice(0, PAGE_SIZE);

  const categoryChips = Object.entries(byCategory)
    .sort((a, b) => b[1] - a[1])
    .map(([cat, total]) => `
      <div style="display:inline-flex;align-items:center;gap:6px;padding:6px 12px;border-radius:20px;${categoriaColor(cat)};font-size:12px;font-weight:700;font-family:'Work Sans',sans-serif;">
        ${cat} · ${formatMoney(total)}
      </div>`).join('') || '<span style="font-size:12px;color:#999;">Sin gastos en el período</span>';

  return `
    <div class="screen-herramientas" style="padding-bottom: 100px;">

      <!-- Search -->
      <div class="motores-top-actions-container" style="display: flex; justify-content: flex-end; margin: 16px 0 8px;">
        <div class="ganado-split-ctrl ${currentGastosSearchQuery ? 'expanded' : ''}" id="gastos-search-wrapper">
          <button id="gastos-search-toggle" class="m3-icon-btn-tonal" style="margin: 0; box-shadow: none; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;" title="Buscar">
            <span class="material-icons" style="color: #ffffff;">search</span>
          </button>
          <input type="text" id="gastos-search-input" placeholder="Buscar gasto..." value="${currentGastosSearchQuery}" style="border: none; background: transparent; outline: none; font-size: 15px; width: ${currentGastosSearchQuery ? '180px' : '0px'}; transition: width 0.3s; opacity: ${currentGastosSearchQuery ? '1' : '0'}; padding: ${currentGastosSearchQuery ? '0 8px 0 0' : '0'}; color: #ffffff;">
          <button id="gastos-search-clear" style="background: none; border: none; cursor: pointer; display: ${currentGastosSearchQuery ? 'flex' : 'none'}; align-items: center; justify-content: center; padding: 0 16px 0 8px; color: #ffffff; height: 100%;" title="Limpiar búsqueda">
            <span class="material-icons" style="font-size: 20px;">close</span>
          </button>
          <span class="ganado-split-ctrl-sep"></span>
          <button class="ganado-split-ctrl-reg" onclick="window.toggleGastosSplitMenu(event)" title="Más opciones">
            <span class="material-icons">arrow_drop_down</span>
          </button>
          <div class="ganado-split-menu" id="gastos-split-menu">
            <button class="ganado-split-item" onclick="window.navigateTo('nuevo_gasto'); document.getElementById('gastos-split-menu').classList.remove('open');">
              <span class="material-icons">add</span><span>Registrar gasto</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Page Title -->
      <div class="herramientas-page-title">
        <h2>Gastos</h2>
      </div>

      <div class="da-tabs-section">
        <!-- Summary Cards -->
        <section class="herramientas-top-cards">
          <div class="herramientas-card herramientas-card-primary ganado-tally">
            <div class="ganado-tally-top">
              <span class="ganado-tally-label">${PERIOD_LABEL[currentGastosPeriod]}</span>
              <span class="ganado-tally-count gastos-money">
                <span class="ganado-card-value">${formatMoney(totalPeriod)}</span>
                <span class="ganado-tally-unit">total</span>
              </span>
            </div>
            <div class="ganado-tally-divider"></div>
            <div class="ganado-tally-row">
              <div class="ganado-tag-stat">
                <span class="ganado-tag-swatch m"><span class="material-icons">receipt_long</span></span>
                <span class="ganado-tag-info">
                  <span class="ganado-tag-n">${periodRows.length}</span>
                  <span class="ganado-tag-l">Registros</span>
                </span>
              </div>
              <div class="ganado-tag-stat">
                <span class="ganado-tag-swatch g"><span class="material-icons">category</span></span>
                <span class="ganado-tag-info">
                  <span class="ganado-tag-n">${Object.keys(byCategory).length}</span>
                  <span class="ganado-tag-l">Categorías</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:16px;">
          ${categoryChips}
        </div>

        <!-- List Header -->
        <div class="ganado-list-header">
          <div class="ganado-list-title-group">
            <h4>Historial</h4>
            <span class="ganado-count-label" id="gastos-count-label">${totalGastosCount} registros</span>
          </div>
          <select id="gastos-period-select" class="ganado-filter-btn" style="padding:8px 12px;background:var(--surface,#fff);"
            onchange="window.changeGastosPeriod(this.value)">
            <option value="mes" ${currentGastosPeriod === 'mes' ? 'selected' : ''}>Este mes</option>
            <option value="mesAnterior" ${currentGastosPeriod === 'mesAnterior' ? 'selected' : ''}>Mes anterior</option>
            <option value="todos" ${currentGastosPeriod === 'todos' ? 'selected' : ''}>Todo</option>
          </select>
        </div>

        <!-- Gastos List -->
        <div class="ganado-list" id="gastos-list-container">
          ${gastos.length === 0
            ? `<div class="ganado-empty" style="grid-column: 1 / -1;">
                 <span class="material-icons">${currentGastosSearchQuery ? 'search_off' : 'receipt_long'}</span>
                 <p>${currentGastosSearchQuery ? 'No se encontraron gastos.' : 'No hay gastos registrados.'}</p>
               </div>`
            : gastos.map(g => renderGastoRow(g, refs)).join('')}
        </div>

        <!-- Pagination Footer -->
        <div id="gastos-pagination-wrapper">
          ${paginationFooterHtml()}
        </div>
      </div>
    </div>
  `;
}

window.changeGastosPeriod = function(value) {
  currentGastosPeriod = value;
  window.clearScreenCache?.('gastos');
  window.navigateTo('gastos');
};

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initGastos() {
  window.toggleActionMenu = (btn) => {
    const menu = btn.nextElementSibling;
    const isActive = menu.classList.contains('active');
    document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    if (!isActive) menu.classList.add('active');
  };

  // Split control (search + arrow) menu
  window.toggleGastosSplitMenu = (e) => {
    if (e) e.stopPropagation();
    const menu = document.getElementById('gastos-split-menu');
    if (menu) menu.classList.toggle('open');
  };

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('gastos-split-menu');
    if (menu && !e.target.closest('.ganado-split-ctrl')) menu.classList.remove('open');
  });

  // Search logic
  const searchToggle  = document.getElementById('gastos-search-toggle');
  const searchWrapper = document.getElementById('gastos-search-wrapper');
  const searchInput   = document.getElementById('gastos-search-input');
  const searchClear   = document.getElementById('gastos-search-clear');

  if (searchToggle && searchInput && searchWrapper && searchClear) {
    searchToggle.addEventListener('click', () => {
      if (!searchInput.style.width || searchInput.style.width === '0px') {
        searchInput.style.width = '180px';
        searchInput.style.opacity = '1';
        searchInput.style.padding = '0 8px 0 0';
        searchClear.style.display = 'flex';
        searchWrapper.classList.add('expanded');
        searchInput.focus();
      }
    });

    searchClear.addEventListener('click', () => {
      currentGastosSearchQuery = '';
      searchInput.value = '';
      searchInput.style.width = '0px';
      searchInput.style.opacity = '0';
      searchInput.style.padding = '0';
      searchClear.style.display = 'none';
      searchWrapper.classList.remove('expanded');
      window.changeGastosPage(1);
    });

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      currentGastosSearchQuery = e.target.value;
      searchTimeout = setTimeout(() => {
        window.changeGastosPage(1);
      }, 500);
    });
  }

  window.confirmDeleteGasto = (id, desc) => {
    window.Snackbar.confirm(
      `¿Eliminar este gasto${desc ? ` (${desc})` : ''}?`,
      async () => {
        const { error } = await supabase.from('gastos').delete().eq('id', id);
        if (error) {
          window.Snackbar.show('Error al eliminar: ' + error.message, { type: 'error' });
        } else {
          window.Snackbar.show('Gasto eliminado correctamente');
          window.navigateTo('gastos');
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

function renderGastoRow(g, refs) {
  const vinculo = vinculoHtml(g, refs);
  return `
    <div class="ganado-row" onclick="window.navigateTo('nuevo_gasto', '${g.id}')">
      <div class="ganado-row-img-container" style="background: var(--surface-container-high); display: flex; align-items: center; justify-content: center; font-size: 24px; overflow: hidden;">
        <span class="material-icons" style="font-size:26px;color:#2d3e2c;">receipt_long</span>
      </div>

      <div class="ganado-row-content">
        <div class="ganado-col-group" style="flex:1;min-width:0;">
          <p class="ganado-col-label">${(g.categoria || 'OTRO').toUpperCase()}</p>
          <p class="ganado-col-value" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:220px;">${g.descripcion || 'Sin descripción'}</p>
          <p class="ganado-col-label" style="margin-top:4px;">
            ${new Date(g.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}
            ${vinculo}
          </p>
        </div>

        <div class="ganado-col-group" style="text-align:right; position: relative; margin-left: auto; align-items:flex-end;">
          <p class="ganado-col-value" style="font-weight:800;color:#2d3e2c;white-space:nowrap;">${formatMoney(g.monto)}</p>
          <button class="ganado-btn-more" onclick="event.stopPropagation(); window.toggleActionMenu(this)">
            <span class="material-icons">more_vert</span>
          </button>

          <div class="action-menu">
            <div class="action-item" onclick="event.stopPropagation(); window.navigateTo('nuevo_gasto', '${g.id}')">
              <span class="material-icons">edit</span>
              <span>Editar</span>
            </div>
            <div class="action-item delete" onclick="event.stopPropagation(); window.confirmDeleteGasto('${g.id}', '${String(g.descripcion || '').replace(/'/g, "\\'").substring(0, 30)}')">
              <span class="material-icons">delete</span>
              <span>Eliminar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

function vinculoHtml(g, refs) {
  if (g.lote_id && refs.lotes.get(g.lote_id)) {
    return `<span style="display:inline-flex;align-items:center;gap:4px;"><span class="material-icons" style="font-size:14px;">eco</span> ${refs.lotes.get(g.lote_id)}</span>`;
  }
  if (g.animal_id && refs.ganado.get(g.animal_id)) {
    return `<span style="display:inline-flex;align-items:center;gap:4px;"><img src="/vaca.png" style="width:14px;height:14px;object-fit:contain;"> ${refs.ganado.get(g.animal_id)}</span>`;
  }
  if (g.herramienta_id && refs.herramientas.get(g.herramienta_id)) {
    return `<span style="display:inline-flex;align-items:center;gap:4px;"><span class="material-icons" style="font-size:14px;">construction</span> ${refs.herramientas.get(g.herramienta_id)}</span>`;
  }
  return '';
}
