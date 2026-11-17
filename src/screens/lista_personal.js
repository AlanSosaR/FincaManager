import { restFetch } from '../auth.js';
import { renderM3SearchBar, initM3FullScreenSearch } from '../components/m3_search.js';

let currentPersonalSearchQuery = '';
let allPersonalData = [];

function filterPersonal() {
  if (!currentPersonalSearchQuery) return allPersonalData;
  const q = currentPersonalSearchQuery.toLowerCase();
  return allPersonalData.filter(p =>
    (p.nombre || '').toLowerCase().includes(q) ||
    (p.rol || '').toLowerCase().includes(q)
  );
}

function personalRowsHtml(list) {
  if (!list.length) {
    return `<div class="m3-flex m3-flex-col m3-items-center m3-justify-center" style="padding: 64px 24px; background: var(--m3-surface-container-low); border-radius: 12px; text-align: center;">
              <div style="width: 80px; height: 80px; border-radius: 12px; background: rgba(69,87,67,0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                <span class="material-symbols-outlined" style="font-size: 40px; color: #6b8245;">groups</span>
              </div>
              <p class="m3-title-medium m3-font-bold m3-text-on-surface" style="margin-bottom: 4px;">${currentPersonalSearchQuery ? 'No se encontraron trabajadores' : 'No hay personal registrado'}</p>
              <p class="m3-body-medium m3-text-on-surface-variant" style="margin-bottom: 24px; max-width: 280px;">${currentPersonalSearchQuery ? 'Prueba con otro nombre o rol' : 'Agrega tu primer trabajador para comenzar a gestionar tu equipo'}</p>
            </div>`;
  }
  return list.map(p => `
      <div class="lp-card" onclick="window.openPersonalCard('${p.id}')">
        <div class="m3-flex m3-items-center" style="gap: 16px;">
          <div class="lp-avatar" style="background: ${getColor(p.nombre)}; color: white;">${p.iniciales || getInitiales(p.nombre)}</div>
          <div>
            <p class="m3-label-large m3-font-bold m3-text-on-surface">${p.nombre}</p>
            <div class="m3-flex m3-items-center m3-mt-1" style="gap: 6px; flex-wrap: wrap;">
              ${p.rol ? `<span class="m3-label-small m3-text-on-surface-variant">${p.rol}</span>` : ''}
              ${p.rol && p.pago_diario ? `<span class="m3-label-small m3-text-on-surface-variant">·</span>` : ''}
              ${p.pago_diario ? `<span class="m3-label-small m3-font-bold m3-text-primary">L${Number(p.pago_diario).toLocaleString('es-HN')}/día</span>` : ''}
            </div>
          </div>
        </div>
        <div class="lp-card-right">
          <button class="lp-btn-more" onclick="event.stopPropagation(); window.toggleActionMenu(this)" aria-label="Más opciones">
            <span class="material-icons">more_vert</span>
          </button>
          <div class="action-menu">
            <button class="action-item" onclick="event.stopPropagation(); window.navigateTo('nuevo_personal', '${p.id}', 'personal')">
              <span class="material-icons">edit</span><span>Editar</span>
            </button>
            <button class="action-item delete" onclick="event.stopPropagation(); window.confirmDeletePersonal('${p.id}', '${p.nombre.replace(/'/g, "\\'")}')">
              <span class="material-icons">delete</span><span>Eliminar</span>
            </button>
          </div>
        </div>
      </div>
  `).join('');
}

function getInitiales(nombre) {
  if (!nombre) return '??';
  return nombre.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function getColor(seed) {
  const colors = ['var(--m3-primary)', 'var(--m3-tertiary)', '#7b4f9e', '#c75b39', '#2d3e2c', '#2c666e', '#6a1b9a'];
  if (!seed) return colors[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export async function renderListaPersonal() {
  try {
    allPersonalData = await restFetch('/rest/v1/personal?order=nombre.asc&select=*') || [];
    const personal = filterPersonal();

    return `
      <style>
        .lp-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .lp-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          background: var(--m3-surface-container-low);
          border-radius: 12px;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s;
        }
        .lp-card:hover {
          background: var(--m3-surface-container-highest);
          transform: translateX(4px);
        }
        .lp-avatar {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 20px;
          flex-shrink: 0;
        }
        .lp-card-right {
          display: flex;
          align-items: center;
          gap: 4px;
          position: relative;
        }
        .lp-btn-more {
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--m3-outline-variant);
          transition: background 0.2s;
        }
        .lp-btn-more:hover {
          background: rgba(0,0,0,0.05);
        }
        .action-menu {
          position: absolute;
          top: 100%;
          right: 0;
          z-index: 100;
          background: var(--m3-surface-container-high, #fff);
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          padding: 6px;
          min-width: 160px;
          display: none;
          overflow: hidden;
        }
        .action-menu.active {
          display: block;
        }
        .action-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border: none;
          background: none;
          cursor: pointer;
          font-family: 'Work Sans', sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: var(--m3-on-surface);
          width: 100%;
          text-align: left;
          border-radius: 12px;
          transition: background 0.15s;
        }
        .action-item:hover {
          background: var(--m3-surface-container-highest, rgba(0,0,0,0.05));
        }
        .action-item.delete {
          color: var(--m3-error, #b3261e);
        }
        .action-item .material-icons {
          font-size: 20px;
        }
        @media (max-width: 768px) {
          .lp-card { padding: 14px 16px; }
        }
      </style>
      <div class="m3-pt-6 m3-pb-24 m3-p-4 m3-max-w-3xl m3-mx-auto m3-font-work-sans">
        <!-- Search + Register split control -->
        <div class="ganado-top-actions-container" style="display: flex; justify-content: flex-end; margin: 16px 0 8px;">
          ${renderM3SearchBar({
            wrapperId: 'personal-search-wrapper',
            toggleId: 'personal-search-toggle',
            inputId: 'personal-search-input',
            clearId: 'personal-search-clear',
            placeholder: 'Buscar por nombre...',
            value: currentPersonalSearchQuery,
            extraHtml: `
              <button class="ganado-split-ctrl-reg m3-search-split-btn" onclick="window.togglePersonalSplitMenu(event)" title="Más opciones" aria-label="Más opciones">
                <span class="material-icons">more_vert</span>
              </button>
              <div class="ganado-split-menu" id="personal-split-menu">
                <button class="ganado-split-item" onclick="window.navigateTo('nuevo_personal', '', 'personal'); document.getElementById('personal-split-menu').classList.remove('open');">
                  <span class="material-icons">add</span><span>Nuevo personal</span>
                </button>
              </div>
            `
          })}
        </div>
        <section class="m3-mb-6">
          <div class="m3-flex m3-items-center m3-justify-between m3-gap-4 m3-flex-wrap">
            <div>
              <p class="m3-label-medium m3-text-on-surface-variant" id="personal-count-label">${personal.length} colaborador${personal.length === 1 ? '' : 'es'} registrado${personal.length === 1 ? '' : 's'}</p>
            </div>
            <div style="width: 48px;"></div>
          </div>
        </section>

        <div class="lp-list">
          ${personalRowsHtml(personal)}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error in renderListaPersonal:', err);
    return `<div style="padding: 24px; color: red;">Error: ${err.message}</div>`;
  }
}

export function initListaPersonal() {
  const dpModPromise = import('./detalle_personal.js');

  window.openPersonalCard = async (id) => {
    const isMobile = window.innerWidth <= 768 || window.matchMedia?.('(pointer: coarse)')?.matches;
    if (!isMobile || typeof window.openSubBottomSheet !== 'function') {
      window.navigateTo('detalle_personal', id, 'personal');
      return;
    }

    const p = (allPersonalData || []).find(x => String(x.id) === String(id));
    if (!p) {
      window.navigateTo('detalle_personal', id, 'personal');
      return;
    }

    try {
      const { renderDetallePersonal, initDetallePersonal } = await dpModPromise;
      const dpHtml = await renderDetallePersonal(id, 'personal', null, { initialView: 'day' });

      const html = `
        <style>
          #m3-sub-action-sheet.open:has(#lp-sheet-dp-body) {
            transform: none !important;
            will-change: auto !important;
            padding-bottom: 88px !important;
          }
          #lp-sheet-dp-body .dp-screen-pad { padding: 0 0 24px 0 !important; }
          #lp-sheet-dp-body .m3-card {
            padding: 0 !important;
            margin-bottom: 18px !important;
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          #lp-sheet-dp-body .m3-card:last-child { margin-bottom: 0 !important; }
          #lp-sheet-dp-body .dp-summary-days-card { display: none !important; }
          #lp-sheet-dp-body .dp-summary-subtext { display: none !important; }
          #lp-sheet-dp-body h1 { font-size: clamp(18px, 5vw, 22px) !important; }
          #lp-sheet-dp-body .dp-cal-header { flex-direction: column; align-items: stretch !important; gap: 10px !important; }
          #lp-sheet-dp-body .dp-cal-nav-row { display: none !important; }
          #lp-sheet-dp-body .dp-cal-title {
            flex: 1;
            min-width: 0;
            text-align: center;
            font-size: clamp(13.5px, 3.8vw, 17px) !important;
            line-height: 1.25 !important;
            margin: 0 !important;
          }
          #lp-sheet-dp-body .dp-cal-arrow {
            width: 36px !important;
            height: 36px !important;
            min-width: 36px !important;
            border-radius: 50% !important;
            background: #f4f7f3 !important;
            border: 1px solid #d5e0d4 !important;
            color: #2d3e2c !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 0 !important;
            flex-shrink: 0;
          }
          #lp-sheet-dp-body .dp-cal-views { width: 100%; justify-content: flex-start; }
          #lp-sheet-dp-body #dp-mobile-footer-bar { display: block !important; }
          #lp-sheet-dp-body #cal-container .dp-day-actions-bar { display: none !important; }
          #lp-sheet-dp-body #dp-mobile-footer-bar .dp-day-actions-bar {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            background: #ffffff;
            padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
            margin: 0 !important;
            border-top: 1px solid #e5ebe4;
            box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
            z-index: 10005;
          }
          #lp-sheet-dp-body .dp-day-actions-bar .cal-view-btn {
            flex: 1;
            justify-content: center;
            padding: 12px 16px !important;
            font-size: 14px !important;
          }
        </style>
        <div id="lp-sheet-dp-body" style="padding-top: 4px;">
          ${dpHtml}
        </div>
      `;

      window.openSubBottomSheet(html, async () => {
        await initDetallePersonal(id, 'personal', null, { initialView: 'day' });
      }, { expanded: true });
    } catch (err) {
      window.Snackbar?.show('Error cargando asistencia: ' + (err.message || err), { type: 'error' });
    }
  };

  window.toggleActionMenu = (btn) => {
    const menu = btn.nextElementSibling;
    if (!menu) return;
    const isMobile = window.innerWidth <= 768 || window.matchMedia?.('(pointer: coarse)')?.matches;
    if (isMobile && window.openMobileMenuBottomSheet) {
      document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
      window.openMobileMenuBottomSheet(menu);
      return;
    }
    const isActive = menu.classList.contains('active');
    document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    if (!isActive) menu.classList.add('active');
  };

  // Split control (search + arrow) menu
  window.togglePersonalSplitMenu = (e) => {
    if (e) e.stopPropagation();
    const menu = document.getElementById('personal-split-menu');
    if (menu) menu.classList.toggle('open');
  };

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('personal-split-menu');
    if (menu && !e.target.closest('.ganado-split-ctrl')) menu.classList.remove('open');
  });

  const refreshPersonalList = () => {
    const list = filterPersonal();
    const listContainer = document.querySelector('.lp-list');
    const countLabel = document.getElementById('personal-count-label');
    if (listContainer) listContainer.innerHTML = personalRowsHtml(list);
    if (countLabel) countLabel.textContent = `${list.length} colaborador${list.length === 1 ? '' : 'es'} registrado${list.length === 1 ? '' : 's'}`;
  };

  // Material 3 Full-Screen Search
  initM3FullScreenSearch({
    moduleKey: 'personal',
    toggleId: 'personal-search-toggle',
    inputId: 'personal-search-input',
    clearId: 'personal-search-clear',
    placeholder: 'Buscar por nombre...',
    ariaLabel: 'Búsqueda de personal',
    suggestedTitle: 'Personal sugerido',
    emptyLabel: 'trabajadores',
    listClass: 'lp-list m3-search-inventory-list',
    getQuery: () => currentPersonalSearchQuery,
    setQuery: (v) => { currentPersonalSearchQuery = v; },
    onApplySearch: () => refreshPersonalList(),
    loadItems: async () => allPersonalData || [],
    getQuickChips: (items) => {
      const roles = Array.from(new Set(items.map(p => (p.rol || '').trim()).filter(Boolean))).slice(0, 5);
      return roles.map(r => ({ label: r, type: 'query', value: r, icon: 'badge' }));
    },
    filterItems: (items, qLower) => items.filter(p =>
      (p.nombre || '').toLowerCase().includes(qLower) ||
      (p.rol || '').toLowerCase().includes(qLower)
    ),
    renderItem: (p) => personalRowsHtml([p]),
    itemSelector: '.lp-card',
    getItemTitle: (el) => el.querySelector('.m3-label-large')?.textContent?.trim() || ''
  });

  window.confirmDeletePersonal = (id, name) => {
    window.Snackbar.confirm(`¿Eliminar a ${name}?`, async () => {
      try {
        await restFetch(`/rest/v1/personal?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
        window.Snackbar.show('Personal eliminado');
        window.clearScreenCache?.('personal');
        window.navigateTo('personal');
      } catch (err) {
        window.Snackbar.show('Error: ' + err.message, { type: 'error' });
      }
    });
  };

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.action-menu') && !e.target.closest('.lp-btn-more')) {
      document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    }
  });
}
