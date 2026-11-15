import { supabase } from '../supabase.js';
import { renderDetalleMotor, initDetalleMotor } from './detalle_motor.js';
import { renderM3SearchBar, initM3FullScreenSearch } from '../components/m3_search.js';

let currentMotorsPage = 1;
let currentMotorsFilter = 'all';
let currentMotorsSearchQuery = '';
let totalFilteredCount = 0;
const PAGE_SIZE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function paginationFooterHtml() {
  return '';
}

window.changeMotorsPage = async function(page, { silent = false } = {}) {
  currentMotorsPage = page;
  const from = (page - 1) * PAGE_SIZE;
  const to   = page * PAGE_SIZE - 1;

  const listContainer   = document.getElementById('motors-list-container');
  const footerContainer = document.getElementById('motors-pagination-wrapper');
  if (!listContainer) return;

  if (!silent) {
    listContainer.innerHTML = `
      <div style="padding: 32px; text-align: center; color: #888; grid-column: 1 / -1;">
        <span class="material-icons rotating" style="font-size: 28px; color: var(--primary-container);">autorenew</span>
      </div>`;
  }

  // Fetch maintenances to determine first-change 80h limit vs regular limit
  const { data: mantsData } = await supabase.from('motor_mantenimientos').select('motor_id');
  const mantMotorIds = new Set((mantsData || []).map(x => x.motor_id).filter(Boolean));
  const getMotorMaxHours = (m) => (mantMotorIds.has(m.id) ? (m.max_horas || 100) : 80);

  // Re-fetch urgent IDs if needed
  let urgentIds = [];
  if (currentMotorsFilter === 'urgent') {
    const { data } = await supabase.from('motores').select('id, horas, max_horas');
    urgentIds = (data || []).filter(m => (m.horas || 0) >= getMotorMaxHours(m)).map(m => m.id);
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
    : equipos.map(eq => renderMotorCard(eq, getMotorMaxHours(eq))).join('');

  if (footerContainer) footerContainer.innerHTML = paginationFooterHtml();
};

const changeMotorsPage = window.changeMotorsPage;
window.refreshMotoresList = () => window.changeMotorsPage(currentMotorsPage, { silent: true });

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
    { data: allMotors },
    { data: allMants }
  ] = await Promise.all([
    supabase.from('motores').select('*', { count: 'exact', head: true }),
    supabase.from('motores').select('id, horas, max_horas'),
    supabase.from('motor_mantenimientos').select('motor_id')
  ]);

  const mantMotorIds = new Set((allMants || []).map(x => x.motor_id).filter(Boolean));
  const getMotorMaxHours = (m) => (mantMotorIds.has(m.id) ? (m.max_horas || 100) : 80);

  const urgentList  = (allMotors || []).filter(m => (m.horas || 0) >= getMotorMaxHours(m));
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
        ${renderM3SearchBar({
          wrapperId: 'motors-search-wrapper',
          toggleId: 'motors-search-toggle',
          inputId: 'motors-search-input',
          clearId: 'motors-search-clear',
          placeholder: 'Buscar equipo...',
          value: currentMotorsSearchQuery,
          extraHtml: `
            <span class="ganado-split-ctrl-sep"></span>
            <button class="ganado-split-ctrl-reg" onclick="window.toggleMotorsSplitMenu(event)" title="Más opciones">
              <span class="material-icons">arrow_drop_down</span>
            </button>
            <div class="ganado-split-menu" id="motors-split-menu">
              <button class="ganado-split-item" onclick="window.navigateTo('nuevo_motor'); document.getElementById('motors-split-menu').classList.remove('open');">
                <span class="material-icons">add</span><span>Registrar equipo</span>
              </button>
            </div>
          `
        })}
      </div>

      <section style="position: sticky; top: 0; z-index: 20; background: #ffffff; padding: 10px 0 12px; margin: 0 0 12px;">
        <div class="m3-flex m3-items-center m3-justify-between m3-gap-4">
          <h1 class="m3-font-extrabold m3-text-on-surface m3-tracking-tight m3-font-manrope" style="font-size: 24px; line-height: 1.2; margin: 0;">Motores &amp; Equipos</h1>
          <span class="m3-font-extrabold m3-font-manrope" style="font-size: 24px; line-height: 1.2; font-variant-numeric: tabular-nums; color: var(--primary, #2d3e2c);">${totalFilteredCount}</span>
        </div>
      </section>

      <div>

        <div class="motores-grid" id="motors-list-container">
          ${equipos.length === 0
            ? `<div class="ganado-empty"><p>No se encontraron equipos.</p></div>`
            : equipos.map(eq => renderMotorCard(eq, getMotorMaxHours(eq))).join('')}
        </div>
      </div>

      <!-- Bottom Sheet Móvil para Equipo -->
      <style>
        .motor-list-scrim {
          position: fixed;
          inset: 0;
          background: rgba(0, 0, 0, 0.45);
          backdrop-filter: blur(3px);
          z-index: 99990;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.25s cubic-bezier(0.16, 1, 0.3, 1);
        }
        .motor-list-scrim.open {
          opacity: 1;
          pointer-events: auto;
        }
        .motor-list-sheet {
          position: fixed;
          left: 0;
          right: 0;
          bottom: 0;
          background: #ffffff;
          border-radius: 26px 26px 0 0;
          padding: 0;
          z-index: 99991;
          transform: translateY(100%);
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.16);
          height: 92vh;
          max-height: 92vh;
          display: flex;
          flex-direction: column;
          overflow: hidden;
          box-sizing: border-box;
        }
        #motor-list-sheet-body {
          flex: 1;
          overflow-y: auto;
          scrollbar-width: none;
          -ms-overflow-style: none;
          padding: 0;
          box-sizing: border-box;
        }
        #motor-list-sheet-body::-webkit-scrollbar {
          display: none;
        }
        .motor-list-sheet.open {
          transform: translateY(0);
        }
        .motor-list-sheet .motor-sticky-summary,
        .motor-list-sheet .section > .card {
          background: #ffffff !important;
          border: none !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          margin: 0 !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
        .motor-list-sheet .motor-sticky-summary {
          position: sticky !important;
          top: 0 !important;
          z-index: 40 !important;
          padding: 8px 14px 14px !important;
          border-bottom: 1px solid #eef2ed !important;
        }
        .motor-list-sheet .section > .card {
          padding: 6px 0 4px !important;
        }
        .motor-list-sheet .screen-detalle-motor .grid-2 {
          gap: 12px !important;
          padding: 12px 14px 24px !important;
          margin-top: 0 !important;
          box-sizing: border-box !important;
        }
      </style>
      <div id="motor-list-scrim" class="motor-list-scrim"></div>
      <div id="motor-list-sheet" class="motor-list-sheet">
        <div style="flex-shrink: 0; background: #ffffff; padding: 10px 14px 10px; border-bottom: 1px solid #eef2ed;">
          <div style="width: 36px; height: 4px; background: #d0d7cf; border-radius: 9999px; margin: 0 auto 10px;"></div>
          <div style="display: flex; align-items: center; justify-content: space-between;">
            <span id="motor-list-sheet-title" style="font-size: 16px; font-weight: 800; color: #1e3e2b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding-right: 8px;">Detalle de Motor</span>
            <button type="button" id="motor-list-sheet-close" style="width: 34px; height: 34px; border-radius: 50%; border: 1px solid #dce5da; background: #ffffff; color: #2d3e2c; display: flex; align-items: center; justify-content: center; cursor: pointer;">
              <span class="material-symbols-outlined" style="font-size: 20px;">close</span>
            </button>
          </div>
        </div>
        <div id="motor-sheet-fixed-top" style="flex-shrink: 0; background: #ffffff;"></div>
        <div id="motor-list-sheet-body"></div>
      </div>
    </div>
  `;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

export function initMotores() {
  window.closeMotorListSheet = () => {
    window.closeMotorActionSheet?.();
    document.querySelectorAll('[data-motor-portal="1"]').forEach(el => el.remove());
    document.getElementById('motor-list-scrim')?.classList.remove('open');
    document.getElementById('motor-list-sheet')?.classList.remove('open');
    if (typeof loadMotorsList === 'function') {
      loadMotorsList(currentMotorsPage);
    }
  };

  document.getElementById('motor-list-scrim')?.addEventListener('click', window.closeMotorListSheet);
  document.getElementById('motor-list-sheet-close')?.addEventListener('click', window.closeMotorListSheet);

  window.handleMotorCardClick = async (event, cardEl) => {
    const id = cardEl?.dataset?.id;
    if (!id) return;
    if (window.innerWidth > 1024) {
      window.navigateTo('detalle_motor', id);
      return;
    }

    const sheet = document.getElementById('motor-list-sheet');
    const fixedTop = document.getElementById('motor-sheet-fixed-top');
    const sheetBody = document.getElementById('motor-list-sheet-body');
    const scrim = document.getElementById('motor-list-scrim');
    if (!sheet || !sheetBody || !scrim) {
      window.navigateTo('detalle_motor', id);
      return;
    }

    const sheetTitle = document.getElementById('motor-list-sheet-title');
    if (sheetTitle) sheetTitle.textContent = cardEl.dataset.nombre || 'Detalle de Motor';
    if (fixedTop) fixedTop.innerHTML = '';
    sheetBody.innerHTML = `
      <div style="padding: 48px 16px; text-align: center; color: #5a7056;">
        <span class="material-icons rotating" style="font-size: 32px; color: #2d3e2c;">autorenew</span>
        <p style="margin-top: 10px; font-size: 13px; font-weight: 700;">Cargando detalle del equipo...</p>
      </div>
    `;

    requestAnimationFrame(() => {
      scrim.classList.add('open');
      sheet.classList.add('open');
    });

    try {
      const html = await renderDetalleMotor(id);
      sheetBody.innerHTML = html;
      initDetalleMotor(id);
    } catch (err) {
      console.error(err);
      sheetBody.innerHTML = `<p style="text-align:center; padding: 32px; color:#ba1a1a;">Error cargando equipo.</p>`;
    }
  };

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

  // Material 3 Full-Screen Search
  let searchMantIds = new Set();
  const getSearchMaxH = (m) => (searchMantIds.has(m.id) ? (m.max_horas || 100) : 80);

  initM3FullScreenSearch({
    moduleKey: 'motores',
    toggleId: 'motors-search-toggle',
    inputId: 'motors-search-input',
    clearId: 'motors-search-clear',
    placeholder: 'Buscar equipo...',
    ariaLabel: 'Búsqueda de motores y equipos',
    suggestedTitle: 'Equipos sugeridos',
    emptyLabel: 'equipos',
    listClass: 'motores-grid m3-search-inventory-list',
    getQuery: () => currentMotorsSearchQuery,
    setQuery: (v) => { currentMotorsSearchQuery = v; },
    onApplySearch: () => window.changeMotorsPage(1),
    loadItems: async () => {
      const [eqRes, mRes] = await Promise.all([
        supabase.from('motores').select('*').order('created_at', { ascending: false }).range(0, 299),
        supabase.from('motor_mantenimientos').select('motor_id')
      ]);
      searchMantIds = new Set((mRes?.data || []).map(x => x.motor_id).filter(Boolean));
      return eqRes?.data || [];
    },
    getQuickChips: (items) => {
      const brands = Array.from(new Set(items.map(m => (m.marca || '').trim()).filter(b => b && b.toLowerCase() !== 'sin marca'))).slice(0, 4);
      return [
        { label: 'Límite alcanzado', type: 'filter', value: 'urgent', icon: 'warning' },
        { label: 'Todos', type: 'filter', value: 'all', icon: 'precision_manufacturing' },
        ...brands.map(b => ({ label: b, type: 'query', value: b, icon: 'sell' }))
      ];
    },
    onFilterChip: (val) => {
      currentMotorsFilter = val === 'urgent' ? 'urgent' : 'all';
      window.changeMotorsPage(1);
    },
    filterItems: (items, qLower) => items.filter(m =>
      (m.nombre || '').toLowerCase().includes(qLower) ||
      (m.marca || '').toLowerCase().includes(qLower) ||
      (m.modelo || '').toLowerCase().includes(qLower) ||
      (m.tipo || '').toLowerCase().includes(qLower)
    ),
    renderItem: (eq) => renderMotorCard(eq, getSearchMaxH(eq)),
    itemSelector: '.motor-card-compact[data-id]',
    getItemTitle: (el) => el.dataset.nombre || ''
  });

  const closeMenus = (e) => {
    if (!e.target.closest('.ganado-btn-more')) {
      document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    }
  };
  window.removeEventListener('click', closeMenus);
  window.addEventListener('click', closeMenus);
}

// ─── Row renderer ─────────────────────────────────────────────────────────────

function renderMotorCard(eq, customMaxHours = null) {
  const hours    = Number((parseFloat(eq.horas) || 0).toFixed(1));
  const maxHours = customMaxHours || eq.max_horas || 100;
  const pct      = Math.min(100, Math.round((hours / maxHours) * 100));
  const needsOil = pct >= 95;

  const imgHtml = eq.image_url
    ? `<img src="${eq.image_url}" alt="${eq.nombre}" style="width: 100%; height: 100%; object-fit: cover;">`
    : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #f5f5f5; color: #ccc;"><span class="material-icons">settings</span></div>`;

  return `
    <div class="motor-card-compact" data-id="${eq.id}" data-nombre="${(eq.nombre || '').replace(/"/g, '&quot;')}" data-horas="${hours}" data-max-horas="${maxHours}" data-image-url="${(eq.image_url || '').replace(/"/g, '&quot;')}" onclick="window.handleMotorCardClick(event, this)" style="${needsOil ? 'border-color: #fdba74; background: #fffaf6;' : ''}">
      
      <!-- Image with Status Indicator -->
      <div class="motor-compact-img">
        ${imgHtml}
        ${needsOil ? `
        <div style="position: absolute; bottom: 2px; right: 2px; width: 18px; height: 18px; background: #ff4103; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1.5px solid #ffffff;">
          <span class="material-icons" style="font-size: 12px; color: #ffffff;">warning</span>
        </div>` : ''}
      </div>
      <!-- Info Group -->
      <div class="motor-compact-info">
        <span class="motor-compact-label">S/N</span>
        <h3 class="motor-compact-title">${eq.nombre}</h3>
        ${needsOil ? `
        <span style="display: inline-flex; align-items: center; gap: 4px; margin-top: 4px; padding: 2px 8px; border-radius: 9999px; background: #ffedd5; color: #c2410c; font-size: 10.5px; font-weight: 800;">
          <span class="material-symbols-outlined" style="font-size: 13px;">oil_barrel</span>
          <span>Cambio de aceite</span>
        </span>` : ''}
      </div>
      <!-- Usage Stat -->
      <div class="motor-compact-usage">
        <div class="motor-compact-usage-val" style="${needsOil ? 'color: #ff4103;' : ''}">${hours}/${maxHours}h</div>
        <span style="display: block; font-size: 10.5px; font-weight: 800; margin-top: 2px; color: ${needsOil ? '#ea580c' : '#2e7d32'};">${needsOil ? 'Límite alcanzado' : 'Operativo'}</span>
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
