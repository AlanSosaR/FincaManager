import { supabase } from '../supabase.js';
import { restFetch } from '../auth.js';
import db from '../db.js';
import { syncTable } from '../sync.js';
import { renderDetalleMotor, initDetalleMotor } from './detalle_motor.js';
import { renderM3SearchBar, initM3FullScreenSearch } from '../components/m3_search.js';
import { isFuelMotor, computeFuelMotorStats, formatLiters, formatLitersLabel } from '../utils/motor_fuel_config.js';

let currentMotorsPage = 1;
let currentMotorsFilter = 'all';
let currentMotorsSearchQuery = '';
let totalFilteredCount = 0;
const PAGE_SIZE = 50;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function groupByMotorId(rows) {
  const map = new Map();
  for (const r of (rows || [])) {
    if (!r?.motor_id) continue;
    const list = map.get(r.motor_id);
    if (list) list.push(r);
    else map.set(r.motor_id, [r]);
  }
  return map;
}

function buildMotorUrgentChecker(mantByMotor, sesByMotor) {
  return (m) => {
    const eqMants = mantByMotor.get(m.id) || [];
    if (isFuelMotor(m)) {
      return computeFuelMotorStats(m, sesByMotor.get(m.id) || [], eqMants).hasUrgent;
    }
    const maxH = eqMants.length > 0 ? (m.max_horas || 100) : 80;
    return (m.horas || 0) >= maxH;
  };
}

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

  // Fetch maintenances, fuel loads, and motors to determine limits and live counters
  const [{ data: mantsData }, { data: allMotors }, { data: sesionesData }] = await Promise.all([
    supabase.from('motor_mantenimientos').select('*'),
    supabase.from('motores').select('id, nombre, icon, horas, max_horas, notas'),
    supabase.from('motor_sesiones').select('*')
  ]);
  const mantByMotor = groupByMotorId(mantsData);
  const sesByMotor = groupByMotorId(sesionesData);
  const getMotorMaxHours = (m) => ((mantByMotor.get(m.id)?.length || 0) > 0 ? (m.max_horas || 100) : 80);
  const isMotorUrgent = buildMotorUrgentChecker(mantByMotor, sesByMotor);

  const allCount = (allMotors || []).length;
  const urgentIds = (allMotors || []).filter(isMotorUrgent).map(m => m.id);
  const countAllEl = document.getElementById('motores-count-all');
  const countUrgentEl = document.getElementById('motores-count-urgent');
  if (countAllEl) countAllEl.textContent = `Todos · ${allCount}`;
  if (countUrgentEl) countUrgentEl.textContent = `Urgentes · ${urgentIds.length}`;

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
    : equipos.map(eq => renderMotorCard(eq, getMotorMaxHours(eq), sesByMotor.get(eq.id) || [], mantByMotor.get(eq.id) || [])).join('');

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

  if (navigator.onLine) {
    await Promise.all([
      syncTable('motores', true),
      syncTable('motor_mantenimientos', true),
      syncTable('motor_sesiones', true)
    ]).catch(() => {});
  }

  // Fetch summary stats
  const [
    { count: totalMachinery },
    { data: allMotors },
    { data: allMants },
    { data: allSesiones }
  ] = await Promise.all([
    supabase.from('motores').select('*', { count: 'exact', head: true }),
    supabase.from('motores').select('id, nombre, icon, horas, max_horas, notas'),
    supabase.from('motor_mantenimientos').select('*'),
    supabase.from('motor_sesiones').select('*')
  ]);

  const mantByMotor = groupByMotorId(allMants);
  const sesByMotor = groupByMotorId(allSesiones);
  const getMotorMaxHours = (m) => ((mantByMotor.get(m.id)?.length || 0) > 0 ? (m.max_horas || 100) : 80);
  const isMotorUrgent = buildMotorUrgentChecker(mantByMotor, sesByMotor);

  const urgentList  = (allMotors || []).filter(isMotorUrgent);
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
            <button class="ganado-split-ctrl-reg m3-search-split-btn" onclick="window.toggleMotorsSplitMenu(event)" title="Más opciones" aria-label="Más opciones">
              <span class="material-icons">more_vert</span>
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
        <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
          <button type="button" class="motores-card-filter press-effect" data-filter="all" style="padding: 8px 18px; border-radius: 9999px; font-size: 14px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; border: 1px solid ${currentMotorsFilter === 'all' ? '#2d3e2c' : '#d5e0d4'}; background: ${currentMotorsFilter === 'all' ? '#2d3e2c' : '#f2f6f2'}; color: ${currentMotorsFilter === 'all' ? '#ffffff' : '#2d3e2c'}; transition: all 0.15s ease;">
            <span id="motores-count-all">Todos · ${totalMachinery ?? (allMotors || []).length}</span>
          </button>
          <button type="button" class="motores-card-filter press-effect" data-filter="urgent" style="padding: 8px 18px; border-radius: 9999px; font-size: 14px; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 6px; border: 1px solid ${currentMotorsFilter === 'urgent' ? '#9a3412' : '#f5d0b5'}; background: ${currentMotorsFilter === 'urgent' ? '#9a3412' : '#fff1e6'}; color: ${currentMotorsFilter === 'urgent' ? '#ffffff' : '#8a3b08'}; transition: all 0.15s ease;">
            <span id="motores-count-urgent">Urgentes · ${urgentCount}</span>
          </button>
        </div>
      </section>

      <div>

        <div class="motores-grid" id="motors-list-container">
          ${equipos.length === 0
            ? `<div class="ganado-empty"><p>No se encontraron equipos.</p></div>`
            : equipos.map(eq => renderMotorCard(eq, getMotorMaxHours(eq), sesByMotor.get(eq.id) || [], mantByMotor.get(eq.id) || [])).join('')}
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
          top: 0;
          left: 0;
          right: 0;
          bottom: 0;
          background: #ffffff;
          border-radius: 0;
          padding: 0;
          z-index: 99991;
          transform: translateY(100%);
          transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1);
          box-shadow: 0 -8px 32px rgba(0, 0, 0, 0.16);
          height: 100dvh;
          max-height: 100dvh;
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
        <div style="flex-shrink: 0; background: #ffffff; padding: calc(10px + env(safe-area-inset-top, 0px)) 14px 10px; border-bottom: 1px solid #eef2ed;">
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
    if (!menu) return;
    const isActive = menu.classList.contains('active');
    const isMobile = window.innerWidth <= 1024 || window.matchMedia?.('(pointer: coarse)')?.matches;
    document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    if (isMobile && window.openMobileMenuBottomSheet) {
      const title = btn.closest('.motor-card-compact')?.dataset?.nombre || '';
      window.openMobileMenuBottomSheet(menu, { title });
      return;
    }
    if (!isActive) menu.classList.add('active');
  };

  window.confirmDeleteMotor = (id, name) => {
    window.Snackbar.confirm(`¿Eliminar equipo ${name}?`, async () => {
      try {
        const deleted = await restFetch(`/rest/v1/motores?id=eq.${encodeURIComponent(id)}`, {
          method: 'DELETE',
        });
        if (navigator.onLine && (!Array.isArray(deleted) || deleted.length === 0)) {
          throw new Error('No se pudo eliminar el equipo en Supabase (verifica permisos o sesión)');
        }
        await db.motores.delete(id).catch(() => {});
        const queued = await db._sync_queue.toArray().catch(() => []);
        const queueIds = queued.filter(q => String(q.record_id) === String(id)).map(q => q.id);
        if (queueIds.length) await db._sync_queue.bulkDelete(queueIds).catch(() => {});
        window.clearScreenCache?.('motores');
        window.clearScreenCache?.('detalle_motor');
        if (navigator.onLine) {
          await syncTable('motores', true).catch(() => {});
        }
        window.Snackbar.show('Motor eliminado');
        await window.refreshMotoresList?.();
      } catch (err) {
        console.error('Error eliminando motor:', err);
        window.Snackbar.show('Error: ' + (err?.message || err), { type: 'error' });
      }
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
  let searchMantByMotor = new Map();
  let searchSesByMotor = new Map();
  const getSearchMaxH = (m) => ((searchMantByMotor.get(m.id)?.length || 0) > 0 ? (m.max_horas || 100) : 80);

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
      const [eqRes, mRes, sRes] = await Promise.all([
        supabase.from('motores').select('*').order('created_at', { ascending: false }).range(0, 299),
        supabase.from('motor_mantenimientos').select('*'),
        supabase.from('motor_sesiones').select('*')
      ]);
      searchMantByMotor = groupByMotorId(mRes?.data);
      searchSesByMotor = groupByMotorId(sRes?.data);
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
    renderItem: (eq) => renderMotorCard(eq, getSearchMaxH(eq), searchSesByMotor.get(eq.id) || [], searchMantByMotor.get(eq.id) || []),
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

function renderMotorCard(eq, customMaxHours = null, eqSesiones = [], eqMants = []) {
  const hours     = Number((parseFloat(eq.horas) || 0).toFixed(1));
  const maxHours  = customMaxHours || eq.max_horas || 100;
  let isLimit = false;
  let isNear  = false;
  let barWidth = 0;
  let rightText = '';
  let metricIcon = 'water_drop';
  let metricLabel = 'Cambio de aceite';
  let limitNote = '';

  if (isFuelMotor(eq)) {
    const stats = computeFuelMotorStats(eq, eqSesiones, eqMants);
    const target = stats.mostUrgent || stats.items[0];
    if (target) {
      isLimit = target.isDue;
      isNear = target.isNear;
      barWidth = isLimit ? 100 : (target.pct > 0 ? Math.max(3, target.pct) : 0);
      const remTxt = formatLiters(target.remaining);
      rightText = isLimit ? 'Toca hacerlo' : `${remTxt === '1' ? 'Falta' : 'Faltan'} ${formatLitersLabel(target.remaining)}`;
      metricIcon = 'local_gas_station';
      metricLabel = `${target.nombre} · ${formatLitersLabel(stats.totalLiters)} usados`;
      limitNote = `Llegó a ${formatLitersLabel(target.cada_litros)} (${target.nombre.toLowerCase()})`;
    }
  } else {
    const pct       = Math.min(100, Math.round((hours / maxHours) * 100));
    const remaining = Math.max(0, Number((maxHours - hours).toFixed(1)));
    isLimit   = hours >= maxHours || pct >= 100;
    isNear    = !isLimit && pct >= 90;
    barWidth  = isLimit ? 100 : (hours > 0 ? Math.max(3, pct) : 0);
    rightText = isLimit ? 'Toca cambiarlo' : `Faltan ${remaining} h`;
    limitNote = `Llegó a las ${maxHours} h programadas`;
  }

  const needsAlert  = isLimit;
  const statusColor = isLimit ? '#c2410c' : (isNear ? '#a16207' : '#2d6a2e');
  const trackBg     = isLimit ? '#fde4d8' : (isNear ? '#f5ebd6' : '#e6ede6');
  const fillBg      = isLimit ? '#c2410c' : (isNear ? '#b7791f' : '#2d6a2e');

  const imgHtml = eq.image_url
    ? `<img src="${eq.image_url}" alt="${eq.nombre}" style="width: 100%; height: 100%; object-fit: cover;">`
    : `<div style="width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #f5f5f5; color: #ccc;"><span class="material-icons">settings</span></div>`;

  return `
    <div class="motor-card-compact" data-id="${eq.id}" data-nombre="${(eq.nombre || '').replace(/"/g, '&quot;')}" data-horas="${hours}" data-max-horas="${maxHours}" data-image-url="${(eq.image_url || '').replace(/"/g, '&quot;')}" onclick="window.handleMotorCardClick(event, this)" style="flex-direction: column; align-items: stretch; gap: 12px; ${isLimit ? 'border-color: #fdba74; background: #fffaf6;' : isNear ? 'border-color: #fde68a; background: #fffdf5;' : ''}">
      <div style="display: flex; align-items: center; gap: 14px; width: 100%;">
        <!-- Image with Status Indicator -->
        <div class="motor-compact-img">
          ${imgHtml}
          ${needsAlert ? `
          <div style="position: absolute; bottom: 2px; right: 2px; width: 18px; height: 18px; background: #ff4103; border-radius: 50%; display: flex; align-items: center; justify-content: center; border: 1.5px solid #ffffff;">
            <span class="material-icons" style="font-size: 12px; color: #ffffff;">warning</span>
          </div>` : ''}
        </div>
        <!-- Info Group -->
        <div class="motor-compact-info">
          <span class="motor-compact-label">S/N</span>
          <h3 class="motor-compact-title">${eq.nombre}</h3>
        </div>
        <!-- More Actions -->
        <div style="position: relative;">
          <button type="button" class="ganado-btn-more" onclick="event.stopPropagation(); window.toggleActionMenu(this)" style="border: none; background: transparent; color: #666; cursor: pointer; padding: 8px; border-radius: 50%;">
            <span class="material-icons">more_vert</span>
          </button>
          <div class="action-menu" style="right: 0; bottom: auto; top: 100%;">
            <button class="action-item" onclick="event.stopPropagation(); window.navigateTo('nuevo_motor', '${eq.id}')">
              <span class="material-icons">edit</span><span>Editar</span>
            </button>
            <button class="action-item delete" onclick="event.stopPropagation(); window.confirmDeleteMotor('${eq.id}', '${String(eq.nombre || '').replace(/'/g, "\\'")}')">
              <span class="material-icons">delete</span><span>Eliminar</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Métrica de mantenimiento -->
      <div style="width: 100%; padding-top: 10px; border-top: 1px solid ${isLimit ? 'rgba(253, 186, 116, 0.35)' : isNear ? 'rgba(253, 230, 138, 0.5)' : '#f0f3ef'};">
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px;">
          <span style="display: inline-flex; align-items: center; gap: 6px; font-size: 13.5px; font-weight: 600; color: #3c423c;">
            <span class="material-symbols-outlined" style="font-size: 18px; color: #525852;">${metricIcon}</span>
            <span>${metricLabel}</span>
          </span>
          <span style="font-size: 13.5px; font-weight: 700; color: ${statusColor};">${rightText}</span>
        </div>
        <div style="height: 6px; background: ${trackBg}; border-radius: 9999px; overflow: hidden;">
          <div style="width: ${barWidth}%; height: 100%; background: ${fillBg}; border-radius: 9999px; transition: width 0.35s ease-out;"></div>
        </div>
        ${isLimit ? `
        <div style="margin-top: 7px; font-size: 12px; font-weight: 600; color: #555b55;">
          ${limitNote}
        </div>` : ''}
      </div>
    </div>
  `;
}
