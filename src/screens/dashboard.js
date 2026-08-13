import { supabase } from '../supabase.js';
import { getPaginationFooterHtml } from '../pagination.js';

const LOTES_PAGE_SIZE = 4;
let currentLotesPage = 1;
let allLotes = [];
let currentLotesSearchQuery = '';
let filteredLotesCount = 0;

function filterLotes() {
  if (!currentLotesSearchQuery) return allLotes;
  const q = currentLotesSearchQuery.toLowerCase();
  return allLotes.filter(l =>
    (l.nombre || '').toLowerCase().includes(q) ||
    (l.variedad || '').toLowerCase().includes(q)
  );
}

function paginationFooterHtml() {
  const totalPages = Math.ceil(filteredLotesCount / LOTES_PAGE_SIZE) || 1;
  return getPaginationFooterHtml({
    currentPage: currentLotesPage,
    totalPages,
    prevId: 'lotes-prev-btn',
    nextId: 'lotes-next-btn',
    changeFn: 'changeLotesPage'
  });
}

window.changeLotesPage = function(page) {
  currentLotesPage = page;
  window.clearScreenCache?.('dashboard');
  window.navigateTo('dashboard', page);
};

export async function renderDashboard(page) {
  currentLotesPage = page || 1;
  console.log('Rendering Dashboard...');
  try {
    const [
      { data: lotes, error: lotesErr },
      { data: aplicaciones, error: appErr }
    ] = await Promise.all([
      supabase.from('lotes').select('*').order('created_at', { ascending: false }),
      supabase.from('lote_aplicaciones').select('*, lotes(nombre)').neq('estado', 'Programada').order('fecha', { ascending: false }).range(0, 9)
    ]);

    if (lotesErr) throw lotesErr;

    // Custom sort order for application types
    const appOrder = {
      'Limpieza': 1,
      'Fertilizante': 2,
      'Manejo de Tejido': 3,
      'Análisis de Suelo': 4
    };

    if (aplicaciones) {
      aplicaciones.sort((a, b) => {
        const rankA = appOrder[a.tipo] || 99;
        const rankB = appOrder[b.tipo] || 99;
        return rankA - rankB;
      });
    }

    allLotes = lotes || [];
    const filteredLotes = filterLotes();
    filteredLotesCount = filteredLotes.length;
    const totalPlantas = allLotes.reduce((sum, l) => sum + (l.num_plantas || 0), 0) || 0;
    const totalArea = allLotes.reduce((sum, l) => sum + (parseFloat(l.area_ha) || 0), 0);
    const from = (currentLotesPage - 1) * LOTES_PAGE_SIZE;
    const to = from + LOTES_PAGE_SIZE;
    const pageLotes = filteredLotes.slice(from, to);
    return `
      <style>
        @media (min-width: 769px) {
          .db-lotes-grid { grid-template-columns: repeat(2, 1fr) !important; }
        }
        .db-stats-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
        .db-stat-card {
          background: var(--m3-surface-container-low);
          border-radius: 14px;
          padding: 14px 16px;
          display: flex;
          align-items: center;
          gap: 12px;
          transition: transform 0.18s ease, box-shadow 0.18s ease;
        }
        .db-stat-card:hover { transform: translateY(-2px); box-shadow: 0 6px 18px rgba(0,0,0,0.08); }
        .db-stat-icon {
          width: 44px;
          height: 44px;
          border-radius: 12px;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .db-stat-text { display: flex; flex-direction: column; min-width: 0; }
        .db-stat-label { text-transform: uppercase; letter-spacing: 0.5px; }
        @media (max-width: 1024px) {
          .db-page { padding: 0 !important; max-width: 100vw !important; overflow-x: hidden !important; overflow-y: auto !important; }
        }
        @media (max-width: 768px) {
          .db-page .m3-grid-4.m3-gap-8 { gap: 8px !important; min-width: 0 !important; }
          .db-page .m3-grid-4.m3-gap-8 > * { min-width: 0 !important; }
          .db-title { font-size: 22px !important; }
          .db-stats-grid { grid-template-columns: 1fr !important; gap: 8px !important; }
          .db-stat-card { padding: 12px 14px !important; }
          .db-table-wrap { overflow-x: auto !important; }
          .db-table-wrap table { min-width: 480px !important; }
          .db-table-wrap th, .db-table-wrap td { padding: 8px !important; font-size: 12px !important; }
          .db-section-header { flex-direction: column !important; align-items: flex-start !important; gap: 8px !important; }
          .db-lotes-grid { grid-template-columns: 1fr !important; }
          }
        .db-table-wrap { scrollbar-width: none !important; -ms-overflow-style: none !important; }
        .db-table-wrap::-webkit-scrollbar { display: none !important; }
        .db-table-wrap table tbody tr:last-child td { border-bottom: none !important; }
      </style>
      <div class="m3-pt-6 m3-pb-24 m3-p-4 m3-font-work-sans db-page">
        <!-- Search + Register split control -->
        <div style="display:flex;justify-content:flex-end;margin:16px 0 8px;">
          <div class="ganado-split-ctrl" id="lotes-search-wrapper">
            <button id="lotes-search-toggle" class="m3-icon-btn-tonal" style="margin:0;box-shadow:none;width:48px;height:48px;display:flex;align-items:center;justify-content:center;" title="Buscar">
              <span class="material-icons" style="color:#ffffff;">search</span>
            </button>
            <input type="text" id="lotes-search-input" placeholder="Buscar lote..." value="${currentLotesSearchQuery}" style="border:none;background:transparent;outline:none;font-size:15px;width:${currentLotesSearchQuery?'160px':'0px'};transition:width 0.3s;opacity:${currentLotesSearchQuery?'1':'0'};padding:${currentLotesSearchQuery?'0 8px 0 0':'0'};color:#ffffff;">
            <button id="lotes-search-clear" style="background:none;border:none;cursor:pointer;display:${currentLotesSearchQuery?'flex':'none'};align-items:center;justify-content:center;padding:0 16px 0 8px;color:#ffffff;height:100%;" title="Limpiar búsqueda">
              <span class="material-icons" style="font-size:20px;">close</span>
            </button>
            <span class="ganado-split-ctrl-sep"></span>
            <button class="ganado-split-ctrl-reg" onclick="window.toggleLotesSplitMenu(event)" title="Más opciones">
              <span class="material-icons">arrow_drop_down</span>
            </button>
            <div class="ganado-split-menu" id="lotes-split-menu">
              <button class="ganado-split-item" onclick="window.navigateTo('nuevo_lote'); document.getElementById('lotes-split-menu').classList.remove('open');">
                <span class="material-icons">add</span><span>Agregar lote</span>
              </button>
            </div>
          </div>
        </div>
        <section class="m3-mb-6">
          <div>
            <h1 class="m3-display-medium m3-font-extrabold m3-text-on-surface m3-tracking-tight m3-mt-1 m3-font-manrope db-title">Gestión del Cafetal</h1>
          </div>
        </section>

        ${allLotes.length > 0 ? `
        <div class="m3-mb-6 cafetal-hero">
          <div class="ganado-card ganado-card-primary ganado-tally">
            <div class="ganado-tally-top">
              <span class="ganado-tally-label">Total Plantas</span>
              <span class="ganado-tally-count">
                <span class="ganado-card-value">${totalPlantas.toLocaleString()}</span>
                <span class="ganado-tally-unit">plantas</span>
              </span>
            </div>
            <div class="ganado-tally-divider"></div>
            <div class="ganado-tally-row">
              <div class="ganado-tag-stat">
                <span class="ganado-tag-swatch w"><img src="area.png" alt="" style="width: 30px; height: 30px; object-fit: contain;"></span>
                <span class="ganado-tag-info">
                  <span class="ganado-tag-n">${totalArea.toFixed(1)}</span>
                  <span class="ganado-tag-l">Hectáreas</span>
                </span>
              </div>
              <div class="ganado-tag-stat">
                <span class="ganado-tag-swatch w"><img src="mapa.png" alt="" style="width: 22px; height: 22px; object-fit: contain;"></span>
                <span class="ganado-tag-info">
                  <span class="ganado-tag-n">${allLotes.length}</span>
                  <span class="ganado-tag-l">Lotes</span>
                </span>
              </div>
              <a href="#" onclick="event.preventDefault(); window.navigateTo('plan_ifcafe')" class="ganado-tag-stat cafetal-ifcafe-btn" title="Abrir Plan de Fertilización 2026">
                <span class="ganado-tag-swatch w"><span style="font-size:20px;line-height:1;">📋</span></span>
                <span class="ganado-tag-info">
                  <span class="ganado-tag-n" style="font-size:14px;">Plan IFCAFE</span>
                  <span class="ganado-tag-l">2026</span>
                </span>
                <span class="material-icons ganado-tag-expand">chevron_right</span>
              </a>
            </div>
          </div>
        </div>
        ` : ''}

        <div class="m3-grid m3-grid-4 m3-gap-8">
          <div class="m3-flex m3-flex-col m3-gap-8" style="grid-column: 1 / -1;">
            <div>
              <div class="m3-flex m3-items-center m3-justify-between m3-mb-6 db-section-header">
                <h2 class="m3-headline-small m3-font-bold m3-text-on-surface">Lotes & Microlotes</h2>
              </div>
              
              <div class="m3-grid m3-grid-2 m3-gap-6 db-lotes-grid">
                ${pageLotes.length > 0 ? pageLotes.map((lote, index) => {
                  const seed = encodeURIComponent(lote.id);
                  const badgeColors = ['tertiary', 'secondary', 'primary'];
                  const theme = badgeColors[index % badgeColors.length];
                  
                   return `
                    <div class="m3-exp-card m3-exp-card-${theme} db-card" 
                         onclick="window.navigateTo('detalle_lote', '${lote.id}')">
                      <div class="m3-exp-card-body">
                        <div class="m3-exp-card-top">
                          <div class="m3-exp-badge m3-exp-badge-${theme}">
                            <img src="grano-de-cafe.png" alt="" style="width: 16px; height: 16px; object-fit: contain;">
                            <span>${lote.variedad || 'Variedad'}</span>
                          </div>
                          <div class="m3-exp-card-actions">
                            <div class="m3-action-menu-container">
                              <button class="m3-exp-btn-more" onclick="event.stopPropagation(); window.toggleActionMenu(this)">
                                <span class="material-symbols-outlined">more_vert</span>
                              </button>
                              <div class="action-menu">
                                <div class="action-item" onclick="event.stopPropagation(); window.navigateTo('nuevo_lote', '${lote.id}')">
                                  <span class="material-icons">edit</span><span>Editar</span>
                                </div>
                                <div class="action-item delete" onclick="event.stopPropagation(); window.confirmDeleteLote('${lote.id}', '${lote.nombre}')">
                                  <span class="material-icons">delete</span><span>Eliminar</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <h3 class="m3-exp-card-title">${lote.nombre}</h3>
                        <div class="m3-exp-card-details">
                          <div class="m3-exp-detail-item">
                            <img src="sprouts.png" alt="" style="width: 18px; height: 18px; object-fit: contain;">
                            <span class="m3-exp-detail-label">Plantas</span>
                            <span class="m3-exp-detail-value">${(lote.num_plantas || 0).toLocaleString()}</span>
                          </div>
                          <div class="m3-exp-detail-divider"></div>
                          <div class="m3-exp-detail-item">
                            <img src="area.png" alt="" style="width: 18px; height: 18px; object-fit: contain;">
                            <span class="m3-exp-detail-label">Área</span>
                            <span class="m3-exp-detail-value">${lote.area_ha ? parseFloat(lote.area_ha).toFixed(2) : '0.00'} hectareas</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('') : `
                  <div class="m3-flex m3-flex-col m3-items-center m3-justify-center" style="padding: 64px 24px; background: var(--m3-surface-container-low); border-radius: 12px; text-align: center; grid-column: 1 / -1;">
                    <div style="width: 80px; height: 80px; border-radius: 12px; background: rgba(69,87,67,0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                      <img src="sprouts.png" alt="" style="width: 40px; height: 40px; object-fit: contain; opacity: 0.6;">
                    </div>
                    <p class="m3-title-medium m3-font-bold m3-text-on-surface" style="margin-bottom: 4px;">No hay lotes registrados</p>
                    <p class="m3-body-medium m3-text-on-surface-variant" style="margin-bottom: 24px; max-width: 280px;">Crea tu primer lote para comenzar a gestionar tu cafetal</p>
                  </div>
                `}
              </div>

              ${allLotes.length > 0 ? `
              <div style="margin-top: 24px;" id="lotes-pagination-wrapper">
                ${paginationFooterHtml()}
              </div>
              ` : ''}
            </div>

            <!-- Aplicaciones Recientes Section -->
            <div>
              <h2 class="m3-headline-small m3-font-bold m3-text-on-surface m3-mb-6">Aplicaciones Recientes</h2>
              <div class="m3-card m3-overflow-hidden" style="padding: 0; border: none; border-radius: 12px;">
                <div style="padding: 20px 24px; background: #2d3e2c; border-radius: 12px 12px 0 0; display: flex; align-items: center; gap: 16px; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: var(--m3-on-primary);">
                  <span style="flex: 2;">Tipo & Producto</span>
                  <span style="flex: 1;">Dosis</span>
                  <span style="flex: 1.5;">Lote / Fecha</span>
                  <span style="flex: 1; text-align: right;">Operador</span>
                </div>
                <div class="db-table-wrap" style="overflow-x: auto;">
                  <table class="m3-table">
                    <tbody>
                        ${aplicaciones && aplicaciones.length > 0 ? aplicaciones.map(app => {
                         const isFertilizante = app.tipo === 'Fertilizante';
                         const theme = isFertilizante ? 'secondary' : 'tertiary';
                         const iconHtml = isFertilizante ? '<img src="fertilizante.png" alt="" style="width: 14px; height: 14px; object-fit: contain;">' : '<span class="material-symbols-outlined" style="font-size: 14px;">pest_control</span>';
                         return `
                        <tr onclick="window.navigateTo('detalle_lote', '${app.lote_id}')">
                          <td>
                            <div class="m3-flex m3-items-center m3-gap-3">
                              <div class="m3-bg-${theme}-container m3-p-2 m3-rounded-2xl m3-text-${theme}">
                                ${iconHtml}
                              </div>
                              <div>
                                <p class="m3-label-large m3-font-bold m3-text-on-surface">${app.producto}</p>
                                <p class="m3-label-small m3-text-on-surface-variant">${app.tipo}</p>
                              </div>
                            </div>
                          </td>
                          <td class="m3-label-medium">${app.dosis}</td>
                          <td>
                            <p class="m3-label-large m3-font-bold m3-text-on-surface">${app.lotes?.nombre || 'Desconocido'}</p>
                            <p class="m3-label-small m3-text-on-surface-variant">${new Date(app.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</p>
                          </td>
                          <td style="text-align: right;">
                            <div class="m3-flex m3-items-center m3-justify-end m3-gap-2">
                              <span class="m3-label-small m3-font-bold m3-text-on-surface">${app.operador || 'Anon'}</span>
                              <div class="m3-size-8 m3-rounded-full m3-bg-primary m3-text-on-primary m3-flex m3-items-center m3-justify-center m3-label-small" style="background-color: var(--m3-${theme}); color: var(--m3-on-${theme}); font-weight: bold;">
                                ${(app.operador || 'A').charAt(0).toUpperCase()}
                              </div>
                            </div>
                          </td>
                        </tr>
                      `}).join('') : `
                        <tr>
                          <td colspan="4" style="text-align: center; padding: 48px 24px;">
                            <div style="width: 64px; height: 64px; border-radius: 12px; background: rgba(69,87,67,0.1); display: flex; align-items: center; justify-content: center; margin: 0 auto 16px;">
                              <span class="material-symbols-outlined" style="font-size: 32px; color: #6b8245;">eco</span>
                            </div>
                            <p class="m3-label-large m3-font-bold m3-text-on-surface" style="margin-bottom: 4px;">Sin aplicaciones recientes</p>
                            <p class="m3-body-small m3-text-on-surface-variant" style="max-width: 260px; margin: 0 auto;">Las aplicaciones de fertilizantes, podas y tratamientos aparecerán aquí</p>
                          </td>
                        </tr>
                      `}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error in renderDashboard:', err);
    return `<div style="padding: 24px; color: red;">Error cargando dashboard: ${err.message}</div>`;
  }
}

export function initDashboard() {
  // Split control (search + arrow) menu
  window.toggleLotesSplitMenu = (e) => {
    if (e) e.stopPropagation();
    const menu = document.getElementById('lotes-split-menu');
    if (menu) menu.classList.toggle('open');
  };

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('lotes-split-menu');
    if (menu && !e.target.closest('.ganado-split-ctrl')) menu.classList.remove('open');
  });

  // Search logic
  const searchToggle  = document.getElementById('lotes-search-toggle');
  const searchWrapper = document.getElementById('lotes-search-wrapper');
  const searchInput   = document.getElementById('lotes-search-input');
  const searchClear   = document.getElementById('lotes-search-clear');

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
      currentLotesSearchQuery = '';
      searchInput.value = '';
      searchInput.style.width = '0px';
      searchInput.style.opacity = '0';
      searchInput.style.padding = '0';
      searchClear.style.display = 'none';
      window.changeLotesPage(1);
    });

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      currentLotesSearchQuery = e.target.value;
      searchTimeout = setTimeout(() => {
        window.changeLotesPage(1);
      }, 500);
    });
  }
}

window.toggleActionMenu = (btn) => {
  const menu = btn.nextElementSibling;
  if (!menu) return;
  const isActive = menu.classList.contains('active');
  document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
  if (!isActive) menu.classList.add('active');
};

window.confirmDeleteLote = (id, name) => {
  window.Snackbar.confirm(`¿Eliminar el lote "${name}"?`, async () => {
    const { error } = await supabase.from('lotes').delete().eq('id', id);
    if (error) window.Snackbar.show('Error: ' + error.message, { type: 'error' });
    else { window.Snackbar.show('Lote eliminado'); window.clearScreenCache?.('dashboard'); window.navigateTo('dashboard'); }
  });
};
