import { restFetch } from '../auth.js';

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
      <div class="lp-card" onclick="window.navigateTo('detalle_personal', '${p.id}', 'personal')">
        <div class="m3-flex m3-items-center" style="gap: 16px;">
          <div class="lp-avatar" style="background: ${getColor(p.nombre)}; color: white;">${p.iniciales || getInitiales(p.nombre)}</div>
          <div>
            <p class="m3-label-large m3-font-bold m3-text-on-surface">${p.nombre}</p>
            <div class="m3-flex m3-items-center m3-gap-3 m3-mt-1">
              ${p.rol ? `<span class="m3-label-small m3-text-on-surface-variant">${p.rol}</span>` : ''}
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
        <div style="display: flex; justify-content: flex-end; margin: 16px 0 8px;">
          <div class="ganado-split-ctrl" id="personal-search-wrapper">
            <button id="personal-search-toggle" class="m3-icon-btn-tonal" style="margin: 0; box-shadow: none; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;" title="Buscar">
              <span class="material-icons" style="color: #ffffff;">search</span>
            </button>
            <input type="text" id="personal-search-input" placeholder="Buscar por nombre..." value="${currentPersonalSearchQuery}" style="border: none; background: transparent; outline: none; font-size: 15px; width: ${currentPersonalSearchQuery ? '160px' : '0px'}; transition: width 0.3s; opacity: ${currentPersonalSearchQuery ? '1' : '0'}; padding: ${currentPersonalSearchQuery ? '0 8px 0 0' : '0'}; color: #ffffff;">
            <button id="personal-search-clear" style="background: none; border: none; cursor: pointer; display: ${currentPersonalSearchQuery ? 'flex' : 'none'}; align-items: center; justify-content: center; padding: 0 16px 0 8px; color: #ffffff; height: 100%;" title="Limpiar búsqueda">
              <span class="material-icons" style="font-size: 20px;">close</span>
            </button>
            <span class="ganado-split-ctrl-sep"></span>
            <button class="ganado-split-ctrl-reg" onclick="window.togglePersonalSplitMenu(event)" title="Más opciones">
              <span class="material-icons">arrow_drop_down</span>
            </button>
            <div class="ganado-split-menu" id="personal-split-menu">
              <button class="ganado-split-item" onclick="window.navigateTo('nuevo_personal', '', 'personal'); document.getElementById('personal-split-menu').classList.remove('open');">
                <span class="material-icons">add</span><span>Nuevo personal</span>
              </button>
            </div>
          </div>
        </div>
        <section class="m3-mb-6">
          <div class="m3-flex m3-items-center m3-justify-between m3-gap-4 m3-flex-wrap">
            <div>
              <h1 class="m3-display-medium m3-font-extrabold m3-text-on-surface m3-tracking-tight m3-font-manrope">Personal</h1>
              <p class="m3-label-medium m3-text-on-surface-variant" id="personal-count-label">${personal.length} trabajadores registrados</p>
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
  window.toggleActionMenu = (btn) => {
    const menu = btn.nextElementSibling;
    if (!menu) return;
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
    if (countLabel) countLabel.textContent = `${list.length} trabajadores registrados`;
  };

  // Search logic
  const searchToggle  = document.getElementById('personal-search-toggle');
  const searchWrapper = document.getElementById('personal-search-wrapper');
  const searchInput   = document.getElementById('personal-search-input');
  const searchClear   = document.getElementById('personal-search-clear');

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
      currentPersonalSearchQuery = '';
      searchInput.value = '';
      searchInput.style.width = '0px';
      searchInput.style.opacity = '0';
      searchInput.style.padding = '0';
      searchClear.style.display = 'none';
      refreshPersonalList();
    });

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      currentPersonalSearchQuery = e.target.value;
      searchTimeout = setTimeout(() => {
        refreshPersonalList();
      }, 500);
    });
  }

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
