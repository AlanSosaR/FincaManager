import { supabase } from '../supabase.js';
import { getPaginationFooterHtml } from '../pagination.js';

let currentPotrerosPage = 1;
let totalPotrerosCount = 0;
let potreroCounts = {};
let currentPotrerosSearchQuery = '';
const PAGE_SIZE = 5;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildPotrerosQuery() {
  let query = supabase.from('potreros').select('*', { count: 'exact' });
  if (currentPotrerosSearchQuery) {
    query = query.ilike('nombre', `%${currentPotrerosSearchQuery}%`);
  }
  return query;
}

function paginationFooterHtml() {
  const totalPages = Math.ceil(totalPotrerosCount / PAGE_SIZE) || 1;
  return getPaginationFooterHtml({
    currentPage: currentPotrerosPage,
    totalPages,
    prevId: 'potreros-prev-btn',
    nextId: 'potreros-next-btn',
    changeFn: 'changePotrerosPage'
  });
}

window.changePotrerosPage = async function(page) {
  currentPotrerosPage = page;
  const from = (page - 1) * PAGE_SIZE;
  const to = page * PAGE_SIZE - 1;

  const listContainer = document.getElementById('potreros-list-container');
  const footerContainer = document.getElementById('potreros-pagination-wrapper');
  if (!listContainer) return;

  listContainer.innerHTML = `
    <div style="padding: 32px; text-align: center; color: #888; grid-column: 1 / -1;">
      <span class="material-icons rotating" style="font-size: 28px; color: var(--primary-container);">autorenew</span>
    </div>`;

  const { data: potreros, count, error } = await buildPotrerosQuery()
    .order('nombre', { ascending: true })
    .range(from, to);

  if (error || !potreros) {
    listContainer.innerHTML = `<div class="ganado-empty" style="grid-column: 1 / -1;"><p>Error cargando datos.</p></div>`;
    return;
  }

  totalPotrerosCount = count || 0;
  listContainer.innerHTML = potreros.length === 0
    ? `<div class="ganado-empty" style="grid-column: 1 / -1;"><span class="material-icons">landscape</span><p>No hay potreros en esta página.</p></div>`
    : potreros.map(p => renderPotreroRow(p)).join('');

  if (footerContainer) footerContainer.innerHTML = paginationFooterHtml();
};

async function changePotrerosPage(page) {
  currentPotrerosPage = page;
  const from = (page - 1) * PAGE_SIZE;
  const to = page * PAGE_SIZE - 1;

  const listContainer = document.getElementById('potreros-list-container');
  const footerContainer = document.getElementById('potreros-pagination-wrapper');
  if (!listContainer) return;

  listContainer.innerHTML = `
    <div style="padding: 32px; text-align: center; color: #888;">
      <span class="material-icons rotating" style="font-size: 28px; color: var(--primary-container);">autorenew</span>
    </div>`;

  const { data: potreros, count, error } = await buildPotrerosQuery()
    .order('nombre', { ascending: true })
    .range(from, to);

  if (error || !potreros) {
    listContainer.innerHTML = `<div class="ganado-empty"><p>Error cargando datos.</p></div>`;
    return;
  }

  totalPotrerosCount = count || 0;
  listContainer.innerHTML = potreros.length === 0
    ? `<div class="ganado-empty"><span class="material-icons">landscape</span><p>No hay potreros en esta página.</p></div>`
    : potreros.map(p => renderPotreroRow(p)).join('');

  if (footerContainer) footerContainer.innerHTML = paginationFooterHtml();
}

// ─── Main render ──────────────────────────────────────────────────────────────

export async function renderPotreros() {
  currentPotrerosPage = 1;

  let countQuery = supabase.from('potreros').select('*', { count: 'exact', head: true });
  if (currentPotrerosSearchQuery) countQuery = countQuery.ilike('nombre', `%${currentPotrerosSearchQuery}%`);

  const [
    { count: totalCount },
    { data: allStats, error: statsError }
  ] = await Promise.all([
    countQuery,
    supabase.from('potreros').select('status, capacidad')
  ]);

  totalPotrerosCount = totalCount || 0;

  if (statsError) console.error('Error fetching potreros stats:', statsError);

  const { data: potreros, error } = await buildPotrerosQuery()
    .order('nombre', { ascending: true })
    .range(0, PAGE_SIZE - 1);

  if (error) {
    console.error('Error fetching potreros:', error);
    return `<div class="screen-potreros"><p>Error cargando datos: ${error.message}</p></div>`;
  }

  potreroCounts = {};
  const { data: ganadoData } = await supabase.from('ganado').select('potrero_id');
  for (const a of ganadoData || []) {
    if (a.potrero_id) potreroCounts[a.potrero_id] = (potreroCounts[a.potrero_id] || 0) + 1;
  }

  const occupiedCount = allStats ? allStats.filter(p => p.status === 'ocupado' || p.status === 'pastoreo').length : 0;
  const restingCount  = allStats ? allStats.filter(p => p.status === 'recuperando' || p.status === 'descanso').length : 0;
  const totalCapacity = allStats ? allStats.reduce((s, p) => s + (parseInt(p.capacidad) || 0), 0) : 0;
  const currentTotalAnimals = Object.values(potreroCounts).reduce((s, c) => s + c, 0);
  const globalOccupancy = totalCapacity ? Math.round((currentTotalAnimals / totalCapacity) * 100) : 0;

  return `
    <div class="screen-potreros" style="padding-bottom: 100px;">

      <!-- Search + Register split control -->
      <div class="motores-top-actions-container" style="display: flex; justify-content: flex-end; margin: 16px 0 8px;">
        <div class="ganado-split-ctrl" id="potreros-search-wrapper">
          <button id="potreros-search-toggle" class="m3-icon-btn-tonal" style="margin: 0; box-shadow: none; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;" title="Buscar">
            <span class="material-icons" style="color: #ffffff;">search</span>
          </button>
          <input type="text" id="potreros-search-input" placeholder="Buscar potrero..." value="${currentPotrerosSearchQuery}" style="border: none; background: transparent; outline: none; font-size: 15px; width: ${currentPotrerosSearchQuery ? '160px' : '0px'}; transition: width 0.3s; opacity: ${currentPotrerosSearchQuery ? '1' : '0'}; padding: ${currentPotrerosSearchQuery ? '0 8px 0 0' : '0'}; color: #ffffff;">
          <button id="potreros-search-clear" style="background: none; border: none; cursor: pointer; display: ${currentPotrerosSearchQuery ? 'flex' : 'none'}; align-items: center; justify-content: center; padding: 0 16px 0 8px; color: #ffffff; height: 100%;" title="Limpiar búsqueda">
            <span class="material-icons" style="font-size: 20px;">close</span>
          </button>
          <span class="ganado-split-ctrl-sep"></span>
          <button class="ganado-split-ctrl-reg" onclick="window.togglePotrerosSplitMenu(event)" title="Más opciones">
            <span class="material-icons">arrow_drop_down</span>
          </button>
          <div class="ganado-split-menu" id="potreros-split-menu">
            <button class="ganado-split-item" onclick="window.navigateTo('nuevo_potrero'); document.getElementById('potreros-split-menu').classList.remove('open');">
              <span class="material-icons">add</span><span>Registrar potrero</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Page Title -->
      <div class="potreros-page-title">
        <h2>Control de Potreros</h2>
        <div class="ganado-top-actions">
          <button class="ganado-icon-btn" title="Mapa">
            <span class="material-icons">map</span>
          </button>
          <button class="ganado-icon-btn" title="Configuración">
            <span class="material-icons">settings</span>
          </button>
        </div>
      </div>

      <div class="da-tabs-section">
        <!-- Summary Cards -->
        <section class="potreros-top-cards">
          <div class="potreros-card potreros-card-primary">
            <div class="herramientas-card-header">
              <span class="material-icons">grass</span>
              <span class="herramientas-card-label">Carga Total</span>
            </div>
            <div class="herramientas-card-body">
              <h3 class="herramientas-card-value">${currentTotalAnimals}</h3>
              <p class="ganado-card-sub">${globalOccupancy}% de capacidad total</p>
            </div>
          </div>

          <div class="potreros-card potreros-card-surface">
            <div class="herramientas-card-header">
              <span class="material-icons">event_repeat</span>
              <span class="herramientas-card-label">En Descanso</span>
            </div>
            <div class="herramientas-card-body">
              <h3 class="herramientas-card-value">${restingCount}</h3>
              <p class="ganado-card-sub">Áreas recuperándose</p>
            </div>
          </div>

          <div class="potreros-card potreros-card-tertiary">
            <div class="herramientas-card-header">
              <span class="material-icons">priority_high</span>
              <span class="herramientas-card-label">Ocupados</span>
            </div>
            <div class="herramientas-card-body">
              <h3 class="herramientas-card-value">${occupiedCount}</h3>
              <p class="ganado-card-sub">En pastoreo activo</p>
            </div>
          </div>
        </section>

        <!-- List Header -->
        <div class="ganado-list-header">
          <div class="ganado-list-title-group">
            <h4>Estado de Áreas</h4>
            <span class="ganado-count-label">${totalPotrerosCount} registros</span>
          </div>
          <button class="ganado-filter-btn">
            Plan de Rotación <span class="material-icons" style="font-size:16px;">autorenew</span>
          </button>
        </div>

        <!-- Potreros List -->
        <div class="ganado-list" id="potreros-list-container">
          ${potreros.length === 0
            ? `<div class="ganado-empty" style="grid-column: 1 / -1;">
                 <span class="material-icons">landscape</span>
                 <p>No hay potreros registrados.</p>
               </div>`
            : potreros.map(p => renderPotreroRow(p)).join('')}
        </div>

        <!-- Pagination Footer -->
        <div id="potreros-pagination-wrapper">
          ${paginationFooterHtml()}
        </div>
      </div>
    </div>
  `;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initPotreros() {
  window.toggleActionMenu = (btn) => {
    const menu = btn.nextElementSibling;
    const isActive = menu.classList.contains('active');
    document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    if (!isActive) menu.classList.add('active');
  };

  // Split control (search + arrow) menu
  window.togglePotrerosSplitMenu = (e) => {
    if (e) e.stopPropagation();
    const menu = document.getElementById('potreros-split-menu');
    if (menu) menu.classList.toggle('open');
  };

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('potreros-split-menu');
    if (menu && !e.target.closest('.ganado-split-ctrl')) menu.classList.remove('open');
  });

  // Search logic
  const searchToggle  = document.getElementById('potreros-search-toggle');
  const searchWrapper = document.getElementById('potreros-search-wrapper');
  const searchInput   = document.getElementById('potreros-search-input');
  const searchClear   = document.getElementById('potreros-search-clear');

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
      currentPotrerosSearchQuery = '';
      searchInput.value = '';
      searchInput.style.width = '0px';
      searchInput.style.opacity = '0';
      searchInput.style.padding = '0';
      searchClear.style.display = 'none';
      window.changePotrerosPage(1);
    });

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      currentPotrerosSearchQuery = e.target.value;
      searchTimeout = setTimeout(() => {
        window.changePotrerosPage(1);
      }, 500);
    });
  }

  window.confirmDeletePotrero = (id, name) => {
    window.Snackbar.confirm(
      `¿Eliminar potrero ${name}?`,
      async () => {
        const { error } = await supabase.from('potreros').delete().eq('id', id);
        if (error) {
          window.Snackbar.show('Error al eliminar: ' + error.message, { type: 'error' });
        } else {
          window.Snackbar.show('Potrero eliminado correctamente');
          window.navigateTo('potreros');
        }
      },
      null,
      { confirmText: 'Eliminar', cancelText: 'No' }
    );
  };

  const closeMenus = (e) => {
    if (!e.target.closest('.ganado-btn-more')) {
      document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    }
  };
  window.removeEventListener('click', closeMenus);
  window.addEventListener('click', closeMenus);
}

// ─── Row renderer ─────────────────────────────────────────────────────────────

function renderPotreroRow(p) {
  const statusVal = p.status || 'libre';
  let statusLabel = statusVal.toUpperCase();
  let statusClass = 'libre';
  let statusIcon = 'check_circle';

  if (statusVal === 'ocupado' || statusVal === 'pastoreo') {
    statusClass = 'ocupado';
    statusLabel = 'OCUPADO';
    statusIcon = '<img src="/vaca.png" style="width:12px; height:12px; filter: invert(1) brightness(100);">';
  } else if (statusVal === 'recuperando' || statusVal === 'descanso') {
    statusClass = 'recuperando';
    statusLabel = 'EN DESCANSO';
    statusIcon = '<span class="material-icons" style="font-size:12px;">eco</span>';
  }

  const capacity = parseInt(p.capacidad) || 1;
  const current  = potreroCounts[p.id] || 0;
  const occupancyPercent = Math.min(Math.round((current / capacity) * 100), 100);

  let progressColor = 'var(--primary)';
  if (occupancyPercent > 80) progressColor = 'var(--tertiary)';
  else if (occupancyPercent > 50) progressColor = 'var(--secondary)';

  return `
    <div class="ganado-row" onclick="window.navigateTo('detalle_potrero', '${p.id}')">
      <div class="ganado-row-img-container" style="background: var(--surface-container-high); display: flex; align-items: center; justify-content: center;">
        <span class="material-icons" style="color: var(--primary-container); font-size: 24px;">landscape</span>
        ${statusClass !== 'libre' ? `
        <div class="ganado-row-badge ${statusClass === 'ocupado' ? 'orange' : 'green'}">
          ${statusIcon}
        </div>` : ''}
      </div>

      <div class="ganado-row-content">
        <div class="ganado-col-group" style="min-width: 120px;">
          <p class="ganado-col-label">${statusLabel}</p>
          <p class="ganado-col-value">${p.nombre}</p>
        </div>

        <div class="ganado-col-group">
          <p class="ganado-col-label">Ocupación</p>
          <div style="display: flex; align-items: center; gap: 8px;">
            <p class="ganado-col-value">${current}/${capacity}</p>
            <div class="progress-track" style="width: 40px; height: 4px; margin: 0;">
              <div class="progress-fill" style="width: ${occupancyPercent}%; background: ${progressColor};"></div>
            </div>
          </div>
        </div>

        <div class="ganado-col-group">
          <p class="ganado-col-label">Área</p>
          <p class="ganado-col-value">${p.area || '—'} ${p.area_unidad || 'ha'}</p>
        </div>

        <div class="ganado-col-group" style="text-align:right; position: relative; margin-left: auto;">
          <button class="ganado-btn-more" onclick="event.stopPropagation(); window.toggleActionMenu(this)">
            <span class="material-icons">more_vert</span>
          </button>

          <div class="action-menu">
            <div class="action-item" onclick="event.stopPropagation(); window.navigateTo('nuevo_potrero', '${p.id}')">
              <span class="material-icons">edit</span>
              <span>Editar</span>
            </div>
            <div class="action-item delete" onclick="event.stopPropagation(); window.confirmDeletePotrero('${p.id}', '${p.nombre}')">
              <span class="material-icons">delete</span>
              <span>Eliminar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
