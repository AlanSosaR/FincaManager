import { supabase } from '../supabase.js';
import { getPaginationFooterHtml } from '../pagination.js';

let currentGastosPage = 1;
let totalGastosCount = 0;
let currentGastosSearchQuery = '';
let currentGastosPeriod = 'todos'; // 'mes' | 'mesAnterior' | 'todos'
const PAGE_SIZE = 8;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-HN', { style: 'currency', currency: 'HNL' });
}

function getPeriodRange(period) {
  const now = new Date();
  if (period === 'dia') {
    const y = now.getFullYear();
    const m = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const from = `${y}-${m}-${d}`;
    const nextDay = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const to = `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, '0')}-${String(nextDay.getDate()).padStart(2, '0')}`;
    return { from, to };
  }
  if (period === 'semana') {
    const ws = new Date(now);
    const day = ws.getDay();
    // Monday as start of week:
    ws.setDate(ws.getDate() - day + (day === 0 ? -6 : 1));
    ws.setHours(0, 0, 0, 0);
    const from = `${ws.getFullYear()}-${String(ws.getMonth() + 1).padStart(2, '0')}-${String(ws.getDate()).padStart(2, '0')}`;
    const nextMon = new Date(ws);
    nextMon.setDate(nextMon.getDate() + 7);
    const to = `${nextMon.getFullYear()}-${String(nextMon.getMonth() + 1).padStart(2, '0')}-${String(nextMon.getDate()).padStart(2, '0')}`;
    return { from, to };
  }
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

const PERIOD_LABEL = {
  dia: 'Hoy',
  semana: 'Esta semana',
  mes: 'Este mes',
  mesAnterior: 'Mes anterior',
  todos: 'Todo'
};

function inPeriod(fechaStr, r) {
  if (!fechaStr) return false;
  const f = String(fechaStr).slice(0, 10);
  if (r.from && f < r.from) return false;
  if (r.to && f >= r.to) return false;
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
  if (countLabel) {
    const periodSum = filtered.reduce((s, g) => s + (Number(g.monto) || 0), 0);
    countLabel.textContent = `${totalGastosCount} registros${currentGastosPeriod !== 'todos' ? ` · ${formatMoney(periodSum)} (${PERIOD_LABEL[currentGastosPeriod]})` : ''}`;
  }

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

  // Actualizar registros de personal con fechas futuras o formato antiguo
  (all || []).forEach(g => {
    if (g.categoria === 'Personal') {
      let needsDbUpdate = false;
      let newFecha = g.fecha;
      let newDesc = g.descripcion || '';

      if (String(g.fecha || '').startsWith('2026-09-30')) {
        newFecha = '2026-09-19';
        g.fecha = newFecha;
        needsDbUpdate = true;
      }

      if (/planilla\s+semanal/i.test(newDesc) || (/semana/i.test(newDesc) && !/^semana\s+\d+\s*-\s*\d+/i.test(newDesc))) {
        const isPorAprobar = newDesc.includes('[Por Aprobar]');
        const refMatch = newDesc.match(/\[ref:[^\]]+\]/);
        const refTag = refMatch ? ` ${refMatch[0]}` : '';
        const parsed = parsePersonalGasto(newDesc, newFecha);
        if (parsed) {
          newDesc = `${isPorAprobar ? '[Por Aprobar] ' : ''}${parsed.title}${parsed.extra ? ' ' + parsed.extra : ''}${refTag}`.trim();
          g.descripcion = newDesc;
          needsDbUpdate = true;
        }
      }

      if (needsDbUpdate) {
        supabase.from('gastos').update({ fecha: newFecha, descripcion: newDesc }).eq('id', g.id).catch(() => {});
      }
    }
  });

  const r = getPeriodRange(currentGastosPeriod);
  const { periodRows, filtered } = computeGastos(all || [], r);
  const totalPeriod = periodRows.reduce((s, g) => s + (Number(g.monto) || 0), 0);

  // Global total (acumulado histórico de todos los gastos)
  const totalGlobal = (all || []).reduce((s, g) => s + (Number(g.monto) || 0), 0);

  // Totales para Este mes y Mes anterior
  const rMes = getPeriodRange('mes');
  const rowsMes = (all || []).filter(g => inPeriod(g.fecha, rMes));
  const totalMes = rowsMes.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const countMes = rowsMes.length;

  const rMesAnt = getPeriodRange('mesAnterior');
  const rowsMesAnt = (all || []).filter(g => inPeriod(g.fecha, rMesAnt));
  const totalMesAnt = rowsMesAnt.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const countMesAnt = rowsMesAnt.length;

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
      <div class="gastos-category-chip" style="${categoriaColor(cat)}">
        ${cat} · ${formatMoney(total)}
      </div>`).join('') || '<span style="font-size:12px;color:#999;white-space:nowrap;flex-shrink:0;">Sin gastos en el período</span>';

  return `
    <style>
      .ganado-row.menu-open { z-index: 500 !important; position: relative !important; }
      .ganado-row .action-menu { background: #2d3e2c !important; z-index: 9999 !important; box-shadow: 0 10px 30px rgba(0,0,0,0.4) !important; border: 1px solid rgba(255,255,255,0.15) !important; }
      .ganado-row .action-menu.active { opacity: 1 !important; visibility: visible !important; }
      .ganado-row .action-item { color: #ffffff !important; }
      .ganado-row .action-item:hover { background: #3a5240 !important; }
      .ganado-row .action-item.delete { color: #ffb4ab !important; }
      .ganado-row .action-item.delete:hover { background: rgba(186, 26, 26, 0.35) !important; }

      /* Carrusel horizontal de categorías de gastos */
      .gastos-categories-carousel {
        display: flex !important;
        flex-wrap: nowrap !important;
        overflow-x: auto !important;
        -webkit-overflow-scrolling: touch !important;
        gap: 8px !important;
        margin-bottom: 16px !important;
        padding-bottom: 4px !important;
        padding-top: 2px !important;
        scrollbar-width: none !important;
        -ms-overflow-style: none !important;
      }
      .gastos-categories-carousel::-webkit-scrollbar {
        display: none !important;
      }
      .gastos-category-chip {
        display: inline-flex !important;
        align-items: center !important;
        gap: 6px !important;
        padding: 6px 14px !important;
        border-radius: 20px !important;
        font-size: 12px !important;
        font-weight: 700 !important;
        font-family: 'Work Sans', sans-serif !important;
        white-space: nowrap !important;
        flex-shrink: 0 !important;
        user-select: none !important;
      }

      /* Adaptación responsiva de tarjeta hero de Gastos para móviles (Pixel, etc.) */
      .gastos-hero-card {
        box-sizing: border-box !important;
        max-width: 100% !important;
        overflow: hidden !important;
      }
      .gastos-tally-top {
        display: flex !important;
        align-items: baseline !important;
        justify-content: space-between !important;
        flex-wrap: wrap !important;
        gap: 8px 12px !important;
      }
      .gastos-tally-top .ganado-card-value {
        font-size: clamp(24px, 6vw, 34px) !important;
        line-height: 1.1 !important;
        font-weight: 900 !important;
      }
      .gastos-tally-grid {
        display: grid !important;
        grid-template-columns: repeat(2, minmax(0, 1fr)) !important;
        gap: 10px !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }
      .gastos-stat-card {
        flex: 1 1 0 !important;
        min-width: 0 !important;
        width: 100% !important;
        box-sizing: border-box !important;
        padding: 10px 12px !important;
        gap: 10px !important;
        background: var(--m3-surface-container-low, #ffffff) !important;
        border-radius: 14px !important;
        display: flex !important;
        align-items: center !important;
        cursor: pointer !important;
      }
      .gastos-swatch {
        width: 38px !important;
        height: 38px !important;
        min-width: 38px !important;
        border-radius: 10px !important;
        display: flex !important;
        align-items: center !important;
        justify-content: center !important;
        flex-shrink: 0 !important;
      }
      .gastos-swatch .material-symbols-outlined {
        font-size: 20px !important;
      }
      .gastos-tag-amount {
        font-size: clamp(13px, 3.5vw, 16px) !important;
        font-weight: 800 !important;
        color: var(--m3-on-surface, #1e1e1e) !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        display: block !important;
        line-height: 1.2 !important;
      }
      .gastos-tag-label {
        font-size: clamp(9px, 2.3vw, 11px) !important;
        font-weight: 700 !important;
        text-transform: uppercase !important;
        letter-spacing: 0.4px !important;
        color: var(--m3-on-surface-variant, #555555) !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        display: block !important;
        margin-top: 2px !important;
      }

      .screen-gastos .da-tabs-section {
        background: white;
        border-radius: 18px;
        padding: 20px 12px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.03);
        border: 1px solid rgba(0,0,0,0.02);
      }

      @media (max-width: 600px) {
        .screen-gastos .da-tabs-section {
          padding: 12px 6px !important;
        }
        .gastos-hero-card {
          padding: 18px 12px 14px !important;
          border-radius: 18px !important;
        }
        .gastos-tally-grid {
          gap: 8px !important;
        }
        .gastos-stat-card {
          padding: 8px 10px !important;
          gap: 8px !important;
        }
        .gastos-swatch {
          width: 32px !important;
          height: 32px !important;
          min-width: 32px !important;
        }
        .gastos-swatch .material-symbols-outlined {
          font-size: 18px !important;
        }
      }

      @media (max-width: 330px) {
        .gastos-tally-grid {
          grid-template-columns: 1fr !important;
        }
      }
    </style>
    <div class="screen-gastos" style="padding-bottom: 100px;">

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

      <div class="da-tabs-section" style="margin-top: 10px;">
        <!-- Hero Summary Card (Dark Green Banner) -->
        <div class="cafetal-hero gastos-hero" style="margin-bottom: 14px; width: 100%;">
          <div class="ganado-card ganado-card-primary ganado-tally gastos-hero-card" style="background: var(--m3-primary, #2d3e2c); border-radius: 20px; padding: 22px 18px 18px; box-shadow: 0 6px 24px rgba(45,62,44,0.22); width: 100%; box-sizing: border-box;">
            <div class="ganado-tally-top gastos-tally-top">
              <span class="ganado-tally-label">TOTAL GLOBAL</span>
              <span class="ganado-tally-count gastos-money">
                <span class="ganado-card-value">${formatMoney(totalGlobal)}</span>
                <span class="ganado-tally-unit">acumulado</span>
              </span>
            </div>
            <div class="ganado-tally-divider"></div>
            <div class="ganado-tally-row gastos-tally-grid">
              <div class="ganado-tag-stat gastos-stat-card ${currentGastosPeriod === 'mes' ? 'active' : ''}" onclick="window.changeGastosPeriod('mes')" title="Filtrar por este mes">
                <span class="ganado-tag-swatch o gastos-swatch" style="background:rgba(45,62,44,0.12);color:#2d3e2c;">
                  <span class="material-symbols-outlined">calendar_month</span>
                </span>
                <span class="ganado-tag-info" style="min-width:0;flex:1;">
                  <span class="ganado-tag-n gastos-tag-amount">${formatMoney(totalMes)}</span>
                  <span class="ganado-tag-l gastos-tag-label">Este mes (${countMes} ${countMes === 1 ? 'reg.' : 'regs.'})</span>
                </span>
              </div>
              <div class="ganado-tag-stat gastos-stat-card ${currentGastosPeriod === 'mesAnterior' ? 'active' : ''}" onclick="window.changeGastosPeriod('mesAnterior')" title="Filtrar por mes anterior">
                <span class="ganado-tag-swatch m gastos-swatch" style="background:#d9e5f1;color:#3e6fa6;">
                  <span class="material-symbols-outlined">history</span>
                </span>
                <span class="ganado-tag-info" style="min-width:0;flex:1;">
                  <span class="ganado-tag-n gastos-tag-amount">${formatMoney(totalMesAnt)}</span>
                  <span class="ganado-tag-l gastos-tag-label">Mes anterior (${countMesAnt} ${countMesAnt === 1 ? 'reg.' : 'regs.'})</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        <div class="gastos-categories-carousel">
          ${categoryChips}
        </div>

        <!-- List Header -->
        <div class="ganado-list-header">
          <div class="ganado-list-title-group">
            <h4>Historial</h4>
            <span class="ganado-count-label" id="gastos-count-label">${totalGastosCount} registros${currentGastosPeriod !== 'todos' ? ` · ${formatMoney(totalPeriod)} (${PERIOD_LABEL[currentGastosPeriod]})` : ''}</span>
          </div>
          <select id="gastos-period-select" class="ganado-filter-btn" style="padding:8px 12px;background:var(--surface,#fff);border-radius:10px;font-weight:600;"
            onchange="window.changeGastosPeriod(this.value)">
            <option value="dia" ${currentGastosPeriod === 'dia' ? 'selected' : ''}>Hoy (Día)</option>
            <option value="semana" ${currentGastosPeriod === 'semana' ? 'selected' : ''}>Esta semana</option>
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
    document.querySelectorAll('.action-menu.active').forEach(m => {
      m.classList.remove('active');
      const r = m.closest('.ganado-row');
      if (r) {
        r.classList.remove('menu-open');
        r.style.zIndex = '';
      }
    });
    if (!isActive) {
      menu.classList.add('active');
      const row = btn.closest('.ganado-row');
      if (row) {
        row.classList.add('menu-open');
        row.style.zIndex = '500';
      }
    }
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

  window.aprobarGastoPersonal = async (id) => {
    try {
      const { data: allGastos } = await supabase.from('gastos').select('*').eq('id', id);
      const gasto = Array.isArray(allGastos) ? allGastos[0] : allGastos;
      if (!gasto) return;

      const cleanDesc = (gasto.descripcion || '').replace('[Por Aprobar]', '').replace(/\s{2,}/g, ' ').trim();

      const { error } = await supabase.from('gastos').update({
        descripcion: cleanDesc
      }).eq('id', id);

      if (error) throw error;

      window.Snackbar?.show('✔ Gasto de personal aprobado exitosamente');
      window.clearScreenCache?.('gastos');
      window.navigateTo('gastos');
    } catch (err) {
      console.error('Error aprobando gasto:', err);
      window.Snackbar?.show('Error al aprobar gasto: ' + (err.message || 'Error desconocido'), { type: 'error' });
    }
  };

  const closeMenus = (e) => {
    if (!e.target.closest('.ganado-btn-more')) {
      document.querySelectorAll('.action-menu.active').forEach(m => {
        m.classList.remove('active');
        const r = m.closest('.ganado-row');
        if (r) {
          r.classList.remove('menu-open');
          r.style.zIndex = '';
        }
      });
    }
  };
  window.removeEventListener('click', closeMenus);
  window.addEventListener('click', closeMenus);
}

function getGastoIconStyle(cat, isPorAprobar) {
  let icon = 'receipt_long';
  let isImg = false;
  let imgSrc = '';

  switch (cat) {
    case 'Personal':
      icon = 'badge';
      break;
    case 'Veterinaria':
      isImg = true;
      imgSrc = '/vaca.png';
      break;
    case 'Insumos Agrícolas':
      icon = 'inventory_2';
      break;
    case 'Foliares/Abonos':
      icon = 'eco';
      break;
    case 'Maquinaria':
      icon = 'precision_manufacturing';
      break;
    default:
      icon = 'receipt_long';
      break;
  }

  if (isPorAprobar) {
    return {
      icon: 'pending_actions',
      isImg: false,
      bg: '#f0f7e6',
      color: '#2d3e2c',
      border: '1.5px solid rgba(45, 62, 44, 0.28)',
      shadow: 'rgba(45, 62, 44, 0.15)'
    };
  }

  return {
    icon,
    isImg,
    imgSrc,
    bg: '#f0f7e6',
    color: '#2d3e2c',
    border: '1.5px solid rgba(45, 62, 44, 0.2)',
    shadow: 'rgba(45, 62, 44, 0.12)'
  };
}

export function parsePersonalGasto(desc, fechaStr) {
  let clean = (desc || '').replace(/\[Por Aprobar\]/g, '').replace(/\[ref:[^\]]+\]/g, '').replace(/\s{2,}/g, ' ').trim();
  const fDate = fechaStr ? new Date(fechaStr + 'T12:00:00') : new Date();
  const year = isNaN(fDate.getFullYear()) ? new Date().getFullYear() : fDate.getFullYear();
  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

  if (/planilla\s+semanal/i.test(clean) || /semana/i.test(clean)) {
    let nombre = '';
    const nameMatch = clean.match(/(?:Planilla\s+Semanal:\s*)([^—:(\[]+)/i);
    if (nameMatch) {
      nombre = nameMatch[1].trim();
    } else {
      const colonMatch = clean.match(/:\s*([^—:(\[]+)/);
      if (colonMatch) {
        nombre = colonMatch[1].trim();
      } else {
        const dashMatch = clean.match(/[—–]\s*([^—:(\[]+)/);
        if (dashMatch) nombre = dashMatch[1].trim();
      }
    }

    // Discard any parsed "nombre" that is actually a date, month, or numeric fragment
    if (/^\d+\s*(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(nombre) ||
        /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(nombre) ||
        /^\d+$/.test(nombre)) {
      nombre = '';
    }

    const splitSemMatch = clean.match(/semana\s+(?:del\s+)?(\d+)(?:\s+de)?\s+([A-Za-z]+)\s*(?:al|-)\s*(\d+)(?:\s+de)?\s+([A-Za-z]+)(?:\s+(\d{4}))?/i);
    const semMatch = clean.match(/semana\s+(?:del\s+)?(\d+)\s*(?:al|-)\s*(\d+)(?:\s+de)?\s+([A-Za-z]+)(?:\s+(\d{4}))?/i);
    let semanaStr = '';
    if (splitSemMatch) {
      const d1 = splitSemMatch[1];
      const m1 = splitSemMatch[2];
      const d2 = splitSemMatch[3];
      const m2 = splitSemMatch[4];
      const yr = splitSemMatch[5] || year;
      const capM1 = m1.charAt(0).toUpperCase() + m1.slice(1).toLowerCase();
      const capM2 = m2.charAt(0).toUpperCase() + m2.slice(1).toLowerCase();
      semanaStr = `Semana ${d1} ${capM1} - ${d2} ${capM2} ${yr}`;
    } else if (semMatch) {
      const d1 = semMatch[1];
      const d2 = semMatch[2];
      const mes = semMatch[3];
      const yr = semMatch[4] || year;
      const capMes = mes.charAt(0).toUpperCase() + mes.slice(1).toLowerCase();
      semanaStr = `Semana ${d1} - ${d2} ${capMes} ${yr}`;
    } else {
      const d = new Date(fDate);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const ws = new Date(d.setDate(diff));
      const we = new Date(ws);
      we.setDate(ws.getDate() + 6);
      const mesLbl = MONTHS[ws.getMonth()];
      semanaStr = `Semana ${ws.getDate()} - ${we.getDate()} ${mesLbl} ${ws.getFullYear()}`;
    }

    const extraMatch = clean.match(/(\(\d+\s+días?[^)]*\))/i);
    const extra = extraMatch ? extraMatch[1] : '';

    return {
      title: semanaStr,
      nombre: nombre,
      extra: extra,
      semana: semanaStr
    };
  }

  if (/planilla\s+mensual/i.test(clean) || /mes/i.test(clean)) {
    let nombre = '';
    const nameMatch = clean.match(/(?:Planilla\s+Mensual:\s*)([^—:(\[]+)/i);
    if (nameMatch) {
      nombre = nameMatch[1].trim();
    } else {
      const alt = clean.match(/:\s*([^—:(\[]+)/);
      if (alt) nombre = alt[1].trim();
    }

    if (/^\d+\s*(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(nombre) ||
        /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(nombre) ||
        /^\d+$/.test(nombre)) {
      nombre = '';
    }

    const mesMatch = clean.match(/(?:Mes(?:\s+de)?\s+)?([A-Za-z]+)(?:\s+(\d{4}))?/i);
    let mesStr = '';
    if (mesMatch && MONTHS.some(m => m.toLowerCase() === mesMatch[1].toLowerCase())) {
      const mName = mesMatch[1].charAt(0).toUpperCase() + mesMatch[1].slice(1).toLowerCase();
      const mYear = mesMatch[2] || year;
      mesStr = `Mes de ${mName} ${mYear}`;
    } else {
      mesStr = `Mes de ${MONTHS[fDate.getMonth()]} ${year}`;
    }
    const extraMatch = clean.match(/(\(\d+\s+días?[^)]*\))/i);
    const extra = extraMatch ? extraMatch[1] : '';
    return {
      title: mesStr,
      nombre: nombre,
      extra: extra
    };
  }

  return null;
}

// ─── Row renderer ─────────────────────────────────────────────────────────────

function renderGastoRow(g, refs) {
  const vinculo = vinculoHtml(g, refs);
  const isPorAprobar = (g.descripcion || '').includes('[Por Aprobar]');
  let displayDesc = (g.descripcion || 'Sin descripción')
    .replace('[Por Aprobar]', '')
    .replace(/\[ref:[^\]]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  let subLabelExtra = '';
  let personName = '';
  if (g.categoria === 'Personal') {
    const parsed = parsePersonalGasto(displayDesc, g.fecha);
    if (parsed) {
      displayDesc = parsed.title;
      personName = parsed.nombre || '';
      if (parsed.extra) {
        subLabelExtra = ` · ${parsed.extra}`;
      }
    }
  }

  const iconStyle = getGastoIconStyle(g.categoria, isPorAprobar);

  const aprobarBadge = isPorAprobar
    ? `<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(230,81,0,0.12);color:#e65100;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;margin-left:6px;vertical-align:middle;"><span class="material-symbols-outlined" style="font-size:12px;">schedule</span> Por Aprobar</span>`
    : '';

  const aprobarButton = isPorAprobar
    ? `<button type="button" class="ganado-btn-aprobar" onclick="event.stopPropagation(); window.aprobarGastoPersonal('${g.id}')" style="background:#2d3e2c;color:#ffffff;border:none;border-radius:10px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;box-shadow:0 2px 6px rgba(45,62,44,0.3);transition:transform 0.15s;">
        <span class="material-symbols-outlined" style="font-size:14px;">check_circle</span> Aprobar
       </button>`
    : '';

  let mainTitle = displayDesc;
  let periodSubHtml = '';

  if (personName) {
    mainTitle = personName;
    periodSubHtml = `
      <p style="font-weight:700;font-size:13px;color:#2d3e2c;margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-flex;align-items:center;gap:4px;">
        <span class="material-symbols-outlined" style="font-size:14px;color:#2d3e2c;">date_range</span>
        <span>${displayDesc}</span>
      </p>
    `;
  }

  return `
    <div class="ganado-row" onclick="window.navigateTo('nuevo_gasto', '${g.id}')" style="display:flex;align-items:flex-start;padding:14px 16px;position:relative;">
      <div class="ganado-row-img-container" style="width:48px;height:48px;min-width:48px;border-radius:14px;background:${iconStyle.bg};border:${iconStyle.border};box-shadow:0 4px 12px ${iconStyle.shadow};display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;margin-top:2px;">
        ${iconStyle.isImg
          ? `<img src="${iconStyle.imgSrc}" alt="${g.categoria || 'Gasto'}" style="width:26px;height:26px;object-fit:contain;display:block;">`
          : `<span class="material-symbols-outlined" style="font-size:26px;color:${iconStyle.color};font-variation-settings:'FILL' 1, 'wght' 500;">
              ${iconStyle.icon}
            </span>`
        }
      </div>

      <div class="ganado-row-content" style="margin-left:12px;flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;">
        <!-- Línea 1: Categoría a la izquierda, Precio y Menú de acción a la derecha -->
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;">
          <p class="ganado-col-label" style="font-size:11px;letter-spacing:0.5px;font-weight:800;color:${iconStyle.color};margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${(g.categoria || 'OTRO').toUpperCase()}${aprobarBadge}
          </p>

          <div class="ganado-row-actions-box" style="margin-left:auto;display:flex;align-items:center;gap:8px;position:relative;flex-shrink:0;">
            <p class="ganado-col-value" style="font-weight:800;color:#2d3e2c;white-space:nowrap;font-size:15px;margin:0;">${formatMoney(g.monto)}</p>
            ${aprobarButton}

            <button class="ganado-btn-more" onclick="event.stopPropagation(); window.toggleActionMenu(this)" style="margin:0;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;padding:4px;border-radius:50%;">
              <span class="material-symbols-outlined" style="font-size:20px;color:var(--m3-on-surface-variant,#555);">more_vert</span>
            </button>

            <div class="action-menu" style="background:#2d3e2c !important; z-index:9999; box-shadow:0 10px 30px rgba(0,0,0,0.45); border:1px solid rgba(255,255,255,0.15); border-radius:12px; right:0; top:100%;">
              <div class="action-item" onclick="event.stopPropagation(); window.navigateTo('nuevo_gasto', '${g.id}')">
                <span class="material-symbols-outlined">edit</span>
                <span>Editar</span>
              </div>
              <div class="action-item delete" onclick="event.stopPropagation(); window.confirmDeleteGasto('${g.id}', '${String(g.descripcion || '').replace(/'/g, "\\'").substring(0, 30)}')">
                <span class="material-symbols-outlined">delete</span>
                <span>Eliminar</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Línea 2: Primero el nombre de la persona -->
        <p class="ganado-col-value" style="font-weight:800;font-size:15px;color:var(--m3-on-surface,#1e1e1e);line-height:1.3;margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;" title="${mainTitle}">
          ${mainTitle}
        </p>

        <!-- Línea 3: Luego la semana -->
        ${periodSubHtml}

        <!-- Línea 4: Fecha + desglose de días laborados + vínculo -->
        <p class="ganado-col-label" style="margin:2px 0 0;font-size:11px;color:var(--m3-on-surface-variant,#666);">
          ${new Date(g.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}${subLabelExtra}
          ${vinculo}
        </p>
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
