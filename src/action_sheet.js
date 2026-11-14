/**
 * Material 3 Expressive Action Bottom Sheet System for Mobile
 * Supports Peek Mode, Smooth Swipe-Up Expandable Details & Sub-Bottom Sheets
 * for registering and managing Animal Weight, Vaccines, and Fumigations
 */

import { supabase } from './supabase.js';
import { restFetch } from './auth.js';
import { sendWhatsApp } from './wa.js';
import { showSnackbar } from './snackbar.js';
import { syncTable } from './sync.js';
import db from './db.js';

let _currentSourceBtn = null;
let _isClosing = false;

function getLocalToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function notifyParentRefresh() {
  window.clearScreenCache?.('ganado');
  window.clearScreenCache?.('detalle_animal');
  if (typeof window.refreshGanadoList === 'function') {
    window.refreshGanadoList();
  }
}

export function isSubBottomSheetOpen() {
  const subSheet = document.getElementById('m3-sub-action-sheet');
  return Boolean(subSheet && subSheet.classList.contains('open'));
}

export function closeSubBottomSheet() {
  const scrim = document.getElementById('m3-sub-action-sheet-scrim');
  const sheet = document.getElementById('m3-sub-action-sheet');
  if (!sheet || !sheet.classList.contains('open')) return;

  sheet.classList.remove('open', 'expanded');
  sheet.style.transform = '';
  if (scrim) scrim.classList.remove('open');

  setTimeout(() => {
    if (!sheet.classList.contains('open')) {
      sheet.style.display = 'none';
      if (scrim) scrim.style.display = 'none';
    }
  }, 260);
}

export function openSubBottomSheet(contentHtml, onMount) {
  let scrim = document.getElementById('m3-sub-action-sheet-scrim');
  let sheet = document.getElementById('m3-sub-action-sheet');

  if (!scrim) {
    scrim = document.createElement('div');
    scrim.id = 'm3-sub-action-sheet-scrim';
    scrim.className = 'm3-sub-action-sheet-scrim';
    scrim.onclick = (e) => {
      e.stopPropagation();
      closeSubBottomSheet();
    };
    document.body.appendChild(scrim);
  }

  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'm3-sub-action-sheet';
    sheet.className = 'm3-sub-action-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    document.body.appendChild(sheet);
  }

  sheet.classList.remove('expanded');
  sheet.scrollTop = 0;

  sheet.innerHTML = `
    <button type="button" class="m3-action-sheet-close-btn" id="sub-sheet-close-btn" aria-label="Cerrar">
      <span class="material-icons">close</span>
    </button>
    <div class="m3-action-sheet-handle-box" id="sub-sheet-handle-box">
      <div class="m3-action-sheet-handle"></div>
    </div>
    <div class="m3-sub-sheet-body">
      ${contentHtml}
    </div>
  `;

  sheet.querySelector('#sub-sheet-close-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeSubBottomSheet();
  });

  sheet.querySelector('#sub-sheet-handle-box')?.addEventListener('click', (e) => {
    e.stopPropagation();
    sheet.classList.toggle('expanded');
  });

  setupSubSheetGestures(sheet);

  scrim.style.display = 'block';
  sheet.style.display = 'block';
  sheet.style.transform = '';

  requestAnimationFrame(() => {
    scrim.classList.add('open');
    sheet.classList.add('open');
  });

  if (typeof onMount === 'function') {
    onMount(sheet);
  }
}

function setupSubSheetGestures(sheet) {
  let startY = 0;
  let currentY = 0;
  let isDragging = false;

  sheet.onTouchStartSub && sheet.removeEventListener('touchstart', sheet.onTouchStartSub);
  sheet.onTouchMoveSub && sheet.removeEventListener('touchmove', sheet.onTouchMoveSub);
  sheet.onTouchEndSub && sheet.removeEventListener('touchend', sheet.onTouchEndSub);

  sheet.onTouchStartSub = (e) => {
    if (e.touches.length !== 1) return;
    const target = e.target;
    if (target.closest('button') || target.closest('input') || target.closest('textarea') || target.closest('select') || target.closest('label')) {
      isDragging = false;
      return;
    }
    if (sheet.scrollTop > 10 && !target.closest('.m3-action-sheet-handle-box')) return;
    startY = e.touches[0].clientY;
    currentY = startY;
    isDragging = true;
    sheet.style.transition = 'none';
  };

  sheet.onTouchMoveSub = (e) => {
    if (!isDragging || e.touches.length !== 1) return;
    currentY = e.touches[0].clientY;
    const deltaY = currentY - startY;
    if (deltaY > 0) {
      sheet.style.transform = `translateY(${deltaY}px)`;
    }
  };

  sheet.onTouchEndSub = () => {
    if (!isDragging) return;
    isDragging = false;
    sheet.style.transition = '';
    const deltaY = currentY - startY;

    if (deltaY < -30) {
      sheet.classList.add('expanded');
      sheet.style.transform = '';
    } else if (deltaY > 50) {
      if (sheet.classList.contains('expanded') && sheet.scrollTop <= 15) {
        sheet.classList.remove('expanded');
        sheet.style.transform = '';
      } else if (!sheet.classList.contains('expanded')) {
        closeSubBottomSheet();
      } else {
        sheet.style.transform = '';
      }
    } else {
      sheet.style.transform = '';
    }
  };

  sheet.addEventListener('touchstart', sheet.onTouchStartSub, { passive: true });
  sheet.addEventListener('touchmove', sheet.onTouchMoveSub, { passive: true });
  sheet.addEventListener('touchend', sheet.onTouchEndSub, { passive: true });
}

export function isActionBottomSheetOpen() {
  const sheet = document.getElementById('m3-action-sheet');
  return sheet && sheet.classList.contains('open');
}

export function closeActionBottomSheet() {
  closeSubBottomSheet();
  const scrim = document.getElementById('m3-action-sheet-scrim');
  const sheet = document.getElementById('m3-action-sheet');
  if (!sheet || !sheet.classList.contains('open')) return;

  _isClosing = true;
  _currentSourceBtn = null;
  sheet.classList.remove('open', 'expanded');
  sheet.style.transform = '';
  if (scrim) scrim.classList.remove('open');

  setTimeout(() => {
    if (!_currentSourceBtn) {
      if (sheet) sheet.style.display = 'none';
      if (scrim) scrim.style.display = 'none';
    }
    _isClosing = false;
  }, 280);
}

export async function openActionBottomSheet(btn, menu) {
  if (!btn || !menu) return;

  if (_currentSourceBtn === btn && isActionBottomSheetOpen()) {
    closeActionBottomSheet();
    return;
  }

  let scrim = document.getElementById('m3-action-sheet-scrim');
  let sheet = document.getElementById('m3-action-sheet');

  if (!scrim) {
    scrim = document.createElement('div');
    scrim.id = 'm3-action-sheet-scrim';
    scrim.className = 'm3-action-sheet-scrim';
    scrim.onclick = () => closeActionBottomSheet();
    document.body.appendChild(scrim);
  }

  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'm3-action-sheet';
    sheet.className = 'm3-action-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    document.body.appendChild(sheet);
  }

  _currentSourceBtn = btn;
  sheet.classList.remove('expanded');
  sheet.scrollTop = 0;

  const row = btn.closest('.ganado-row') || btn.closest('.action-menu-container') || btn.parentElement;
  let title = 'Opciones';
  let subtitle = '';
  let animalId = null;

  if (row) {
    animalId = row.dataset.animalId || null;
    const valEl = row.querySelector('.ganado-col-value');
    if (valEl) {
      title = valEl.textContent.trim() || 'Animal';
      subtitle = ''; // Removed race/sex under name per user request (duplicated in ficha)
    } else {
      const heading = row.querySelector('h3, h4, .title, .nombre, strong');
      if (heading) title = heading.textContent.trim();
      const sub = row.querySelector('p, .subtitle, .desc');
      if (sub && sub !== heading) subtitle = sub.textContent.replace(/•?\s*\d+\s*(?:kg|lb)?/ig, '').replace(/•\s*$/, '').trim();
    }
  }

  // Fallback extraction of animalId from buttons
  if (!animalId) {
    const match = menu.innerHTML.match(/navigateTo\('(?:nuevo_animal|detalle_animal)',\s*'([^']+)'\)/);
    if (match) animalId = match[1];
  }
  if (animalId) {
    subtitle = '';
  }

  const originalButtons = Array.from(menu.querySelectorAll('.action-item, button'));

  let itemsHtml = originalButtons.map((origBtn, idx) => {
    const iconEl = origBtn.querySelector('.material-icons, .material-symbols-outlined');
    const iconText = iconEl ? iconEl.textContent.trim() : '';
    let label = '';
    origBtn.childNodes.forEach(node => {
      if (node.nodeType === Node.TEXT_NODE) label += node.textContent;
      else if (node !== iconEl) label += node.textContent;
    });
    label = label.trim();
    if (!label) label = origBtn.textContent.trim();

    const isDelete = origBtn.classList.contains('delete') || /eliminar|borrar|delete/i.test(label);
    const deleteClass = isDelete ? 'delete' : '';

    return `
      <button type="button" class="m3-action-sheet-flat-item ${deleteClass}" data-action-idx="${idx}">
        ${iconText ? `<span class="material-icons">${iconText}</span>` : ''}
        <span>${escapeHtml(label)}</span>
      </button>
    `;
  }).join('');

  sheet.innerHTML = `
    <button type="button" class="m3-action-sheet-close-btn" id="sheet-close-btn" aria-label="Cerrar">
      <span class="material-icons">close</span>
    </button>
    <div class="m3-action-sheet-handle-box" id="sheet-handle-box">
      <div class="m3-action-sheet-handle"></div>
    </div>
    <div class="m3-action-sheet-header">
      <div class="m3-action-sheet-title">${escapeHtml(title)}</div>
      ${subtitle ? `<div class="m3-action-sheet-subtitle">${escapeHtml(subtitle)}</div>` : ''}
    </div>

    ${animalId ? `
      <!-- Ficha y detalles del animal -->
      <div class="sheet-detail-section" id="sheet-expanded-details" style="display: flex;">
        <div style="padding: 20px 16px; text-align: center; color: #666; font-size: 13px;">
          <span class="material-icons" style="animation: spin 1s linear infinite; font-size: 20px; display: inline-block; vertical-align: middle;">sync</span> Cargando ficha técnica...
        </div>
      </div>
    ` : `
      <!-- Lista plana para casos sin animal -->
      <div class="m3-action-sheet-flat-list">
        ${itemsHtml}
      </div>
    `}
  `;

  // Attach action button handlers
  const attachActionHandlers = (root) => {
    root.querySelectorAll('.m3-action-sheet-flat-item, .m3-action-sheet-item').forEach(itemBtn => {
      itemBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const idx = parseInt(itemBtn.dataset.actionIdx, 10);
        const targetOrigBtn = originalButtons[idx];
        closeActionBottomSheet();
        if (targetOrigBtn) {
          setTimeout(() => {
            targetOrigBtn.click();
          }, 50);
        }
      });
    });
  };

  attachActionHandlers(sheet);

  sheet.querySelector('#sheet-close-btn')?.addEventListener('click', (e) => {
    e.stopPropagation();
    closeActionBottomSheet();
  });

  // Toggle expand helper
  const setExpanded = (expand) => {
    const detailsContainer = document.getElementById('sheet-expanded-details');
    if (expand) {
      sheet.classList.add('expanded');
      if (detailsContainer) detailsContainer.style.display = 'flex';
    } else {
      sheet.classList.remove('expanded');
    }
  };

  const toggleExpand = (e) => {
    e?.stopPropagation();
    setExpanded(!sheet.classList.contains('expanded'));
  };

  document.getElementById('sheet-handle-box')?.addEventListener('click', toggleExpand);

  // Gesture handling
  setupSheetGestures(sheet, setExpanded);

  // Show in peek mode
  scrim.style.display = 'block';
  sheet.style.display = 'block';
  sheet.style.transform = '';

  requestAnimationFrame(() => {
    scrim.classList.add('open');
    sheet.classList.add('open');
  });

  // Pre-load detailed data in background if animalId exists
  if (animalId) {
    loadAnimalDetails(animalId, sheet, itemsHtml, originalButtons, attachActionHandlers);
  }
}

async function loadAnimalDetails(animalId, sheet, itemsHtml, originalButtons, attachActionHandlers) {
  try {
    const [animalRes, vacRes, fumRes, pesRes] = await Promise.all([
      supabase.from('ganado').select('*').eq('id', animalId).maybeSingle(),
      supabase.from('animal_vacunas').select('*').eq('animal_id', animalId).order('fecha', { ascending: false }).limit(8),
      supabase.from('animal_fumigaciones').select('*').eq('animal_id', animalId).order('fecha', { ascending: false }).limit(8),
      supabase.from('animal_pesajes').select('*').eq('animal_id', animalId).order('fecha', { ascending: false }).limit(8)
    ]);

    const a = animalRes?.data;
    if (!a) return;

    let potreroName = '';
    if (a.potrero_id) {
      try {
        const pRes = await supabase.from('potreros').select('nombre').eq('id', a.potrero_id).maybeSingle();
        if (pRes?.data?.nombre) potreroName = pRes.data.nombre;
      } catch {}
    }

    const detailsContainer = sheet.querySelector('#sheet-expanded-details');
    if (!detailsContainer) return;

    const vacunas = (vacRes?.data || []).filter(v => v.estado !== 'Cancelada').slice(0, 5);
    const fumigaciones = (fumRes?.data || []).filter(f => f.estado !== 'Cancelada').slice(0, 5);
    const pesajes = [...(pesRes?.data || [])]
      .sort((p1, p2) => {
        const dDiff = (p2.fecha || '').localeCompare(p1.fecha || '');
        if (dDiff !== 0) return dDiff;
        return (p2.created_at || '').localeCompare(p1.created_at || '');
      })
      .slice(0, 5);

    const pesoUnidad = 'kg';
    const pesoActual = pesajes[0]?.peso ?? a.peso_actual ?? '0';

    let pesoTrendHtml = '';
    if (pesajes.length >= 1) {
      const latestPeso = parseFloat(pesajes[0]?.peso);
      const prevPeso = pesajes.length >= 2 ? parseFloat(pesajes[1]?.peso) : null;
      if (!isNaN(latestPeso) && prevPeso !== null && !isNaN(prevPeso)) {
        const change = latestPeso - prevPeso;
        let arrow = '→';
        let arrowClass = 'same';
        let changeText = '±0';
        if (change > 0) {
          arrow = '↑';
          arrowClass = 'up';
          changeText = `+${change.toFixed(1)}`;
        } else if (change < 0) {
          arrow = '↓';
          arrowClass = 'down';
          changeText = `${change.toFixed(1)}`;
        }
        pesoTrendHtml = `<span class="ganado-trend-body" style="margin-left: 10px; font-size: 14px; font-weight: 800;"><span class="ganado-trend-arrow ${arrowClass}">${arrow}</span> <span class="ganado-trend-change ${arrowClass}">${changeText} kg</span></span>`;
      }
    }

    const vacunasHtml = vacunas.length > 0 ? vacunas.map((v) => `
      <div class="sheet-peso-swipe-wrap" data-record-id="${escapeHtml(v.id)}" data-record-type="vacuna">
        <button type="button" class="sheet-peso-delete-bg" aria-label="Eliminar vacuna">
          <span class="material-icons">delete</span>
          <span>Eliminar</span>
        </button>
        <div class="sheet-tag-row sheet-peso-swipe-card" style="padding: 6px 10px;">
          <div style="min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <span style="font-weight: 700; color: #1e3e2b; font-size: 12px;">${escapeHtml(v.nombre)}</span>
            <span style="color: #666; font-size: 10px; margin-left: 3px;">(${formatFecha(v.fecha)})</span>
          </div>
          <span class="${v.estado === 'Aplicada' ? 'badge-ok' : 'badge-pending'}" style="font-size: 9.5px; padding: 2px 6px;">${escapeHtml(v.estado || 'Aplicada')}</span>
        </div>
      </div>
    `).join('') : '<p style="font-size: 11px; color: #888; margin: 0;">Sin vacunas registradas</p>';

    const fumigHtml = fumigaciones.length > 0 ? fumigaciones.map((f) => `
      <div class="sheet-peso-swipe-wrap" data-record-id="${escapeHtml(f.id)}" data-record-type="fumig">
        <button type="button" class="sheet-peso-delete-bg" aria-label="Eliminar fumigación">
          <span class="material-icons">delete</span>
          <span>Eliminar</span>
        </button>
        <div class="sheet-tag-row sheet-peso-swipe-card" style="padding: 6px 10px;">
          <div style="min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <span style="font-weight: 700; color: #1e3e2b; font-size: 12px;">${escapeHtml(f.producto)}</span>
            <span style="color: #666; font-size: 10px; margin-left: 3px;">(${formatFecha(f.fecha)})</span>
          </div>
          <span class="${f.estado === 'Aplicada' ? 'badge-ok' : 'badge-pending'}" style="font-size: 9.5px; padding: 2px 6px;">${escapeHtml(f.estado || 'Aplicada')}</span>
        </div>
      </div>
    `).join('') : '<p style="font-size: 11px; color: #888; margin: 0;">Sin fumigaciones registradas</p>';

    const pesajesHtml = pesajes.length > 0 ? pesajes.map((p) => `
      <div class="sheet-peso-swipe-wrap" data-record-id="${escapeHtml(p.id)}" data-record-type="peso">
        <button type="button" class="sheet-peso-delete-bg" aria-label="Eliminar pesaje">
          <span class="material-icons">delete</span>
          <span>Eliminar</span>
        </button>
        <div class="sheet-tag-row sheet-peso-swipe-card">
          <span style="font-weight: 800; color: #1e3e2b;">${escapeHtml(p.peso)} kg</span>
          <span style="color: #666; font-size: 11.5px;">${formatFecha(p.fecha)}</span>
        </div>
      </div>
    `).join('') : '<p style="font-size: 12.5px; color: #888; margin: 0;">Sin pesajes adicionales</p>';

    const edadStr = calcEdad(a.fecha_nacimiento);

    // Populating detailsContainer
    detailsContainer.innerHTML = `
      <!-- Ficha de Identificación -->
      <div class="sheet-detail-card" style="position: relative;">
        <div class="sheet-detail-card-header-row" style="margin-bottom: 10px;">
          <div class="sheet-detail-card-title" style="margin-bottom: 0;">
            <span class="material-icons" style="font-size: 18px; color: #2d3e2c;">badge</span>
            <span>Ficha de Identificación</span>
          </div>
          ${itemsHtml ? `
            <div class="sheet-ficha-menu-wrap">
              <button type="button" class="sheet-ficha-more-btn" id="sheet-ficha-more-btn" aria-label="Más opciones" title="Opciones">
                <span class="material-icons">more_vert</span>
              </button>
              <div class="sheet-ficha-dropdown" id="sheet-ficha-dropdown">
                ${itemsHtml}
              </div>
            </div>
          ` : ''}
        </div>
        <div class="sheet-detail-grid">
          <div class="sheet-detail-item">
            <span class="sheet-detail-label">Fecha de Registro</span>
            <span class="sheet-detail-value">${formatFecha(a.created_at)}</span>
          </div>
          <div class="sheet-detail-item">
            <span class="sheet-detail-label">Fecha Nacimiento</span>
            <span class="sheet-detail-value">${formatFecha(a.fecha_nacimiento)}${edadStr ? ` <small style="font-weight:500;color:#666;">(${edadStr})</small>` : ''}</span>
          </div>
          <div class="sheet-detail-item">
            <span class="sheet-detail-label">Sexo / Raza</span>
            <span class="sheet-detail-value">${escapeHtml(a.sexo || '-')} • ${escapeHtml(a.raza || 'Bovino')}</span>
          </div>
          ${!/macho|male|toro|torete/i.test(a.sexo || '') ? `
          <div class="sheet-detail-item">
            <span class="sheet-detail-label">Estado Reproductivo</span>
            <span class="sheet-detail-value">${escapeHtml(a.reproductivo || 'Normal')}</span>
          </div>
          ` : ''}
          ${potreroName ? `
            <div class="sheet-detail-item" style="grid-column: 1 / -1;">
              <span class="sheet-detail-label">Potrero Asignado</span>
              <span class="sheet-detail-value">📍 ${escapeHtml(potreroName)}</span>
            </div>
          ` : ''}
          ${a.observaciones ? `
            <div class="sheet-detail-item" style="grid-column: 1 / -1;">
              <span class="sheet-detail-label">Observaciones</span>
              <span class="sheet-detail-value" style="font-weight: 500; font-size: 12.5px; color: #444;">${escapeHtml(a.observaciones)}</span>
            </div>
          ` : ''}
        </div>
      </div>

      <!-- Control de Peso -->
      <div class="sheet-detail-card">
        <div class="sheet-detail-card-header-row">
          <div class="sheet-detail-card-title" style="margin-bottom: 0;">
            <span class="material-icons" style="font-size: 18px; color: #2d3e2c;">scale</span>
            <span>Control de Peso</span>
          </div>
          <button type="button" class="sheet-card-add-btn" data-open-sheet="add-peso">
            <span class="material-icons">add</span>
            <span>Registrar</span>
          </button>
        </div>
        <div style="margin: 8px 0 10px; display: flex; align-items: baseline; flex-wrap: wrap;">
          <span class="sheet-detail-label" style="color: #e65100; font-weight: 800;">Peso Actual:</span>
          <span style="font-size: 16px; font-weight: 900; color: #e65100; margin-left: 6px;">${escapeHtml(pesoActual)} ${escapeHtml(pesoUnidad)}</span>
          ${pesoTrendHtml}
        </div>
        <div class="sheet-tag-list">
          ${pesajesHtml}
        </div>
      </div>

      <!-- Vacunas -->
      <div class="sheet-detail-card" style="padding: 12px 14px;">
        <div class="sheet-detail-card-header-row" style="margin-bottom: 8px;">
          <div class="sheet-detail-card-title" style="font-size: 11.5px; margin-bottom: 0;">
            <span class="material-icons" style="font-size: 16px; color: #2d3e2c;">vaccines</span>
            <span>Vacunas (Aplicadas y Programadas)</span>
          </div>
          <button type="button" class="sheet-card-add-btn" data-open-sheet="add-vacuna">
            <span class="material-icons">add</span>
            <span>Registrar</span>
          </button>
        </div>
        <div class="sheet-tag-list" style="gap: 6px;">
          ${vacunasHtml}
        </div>
      </div>

      <!-- Fumigaciones -->
      <div class="sheet-detail-card" style="padding: 12px 14px;">
        <div class="sheet-detail-card-header-row" style="margin-bottom: 8px;">
          <div class="sheet-detail-card-title" style="font-size: 11.5px; margin-bottom: 0;">
            <span class="material-icons" style="font-size: 16px; color: #2d3e2c;">pest_control</span>
            <span>Fumigaciones / Baños</span>
          </div>
          <button type="button" class="sheet-card-add-btn" data-open-sheet="add-fumig">
            <span class="material-icons">add</span>
            <span>Registrar</span>
          </button>
        </div>
        <div class="sheet-tag-list" style="gap: 6px;">
          ${fumigHtml}
        </div>
      </div>
    `;

    // Re-attach action handlers for the action buttons inside Ficha 3-dot menu
    attachActionHandlers(detailsContainer);

    const fichaMoreBtn = detailsContainer.querySelector('#sheet-ficha-more-btn');
    const fichaDropdown = detailsContainer.querySelector('#sheet-ficha-dropdown');
    if (fichaMoreBtn && fichaDropdown) {
      fichaMoreBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        fichaDropdown.classList.toggle('open');
      });
      sheet.addEventListener('click', (e) => {
        if (!e.target.closest('.sheet-ficha-menu-wrap')) {
          fichaDropdown.classList.remove('open');
        }
      });
    }

    const reloadDetails = () => {
      loadAnimalDetails(animalId, sheet, itemsHtml, originalButtons, attachActionHandlers);
      notifyParentRefresh();
    };

    const confirmDeleteRecord = (recordId, recordType, resetCardFn) => {
      const configMap = {
        peso: {
          table: 'animal_pesajes',
          prompt: '¿Deseas eliminar este registro de pesaje?',
          success: 'Pesaje eliminado ✓',
          error: 'Error al eliminar pesaje'
        },
        vacuna: {
          table: 'animal_vacunas',
          prompt: '¿Deseas eliminar este registro de vacuna?',
          success: 'Vacuna eliminada ✓',
          error: 'Error al eliminar vacuna'
        },
        fumig: {
          table: 'animal_fumigaciones',
          prompt: '¿Deseas eliminar este registro de fumigación?',
          success: 'Fumigación eliminada ✓',
          error: 'Error al eliminar fumigación'
        }
      };
      const cfg = configMap[recordType] || configMap.peso;

      window.Snackbar.confirm(
        cfg.prompt,
        async () => {
          try {
            if (db[cfg.table]) {
              await db[cfg.table].delete(recordId).catch(() => {});
            }
            await restFetch(`/rest/v1/${cfg.table}?id=eq.${encodeURIComponent(recordId)}`, {
              method: 'DELETE'
            });
            syncTable(cfg.table);
            showSnackbar(cfg.success);
            reloadDetails();
          } catch (err) {
            showSnackbar(err.message || cfg.error, 'error');
            if (resetCardFn) resetCardFn();
          }
        },
        () => {
          if (resetCardFn) resetCardFn();
        }
      );
    };

    // Swipe-to-right to delete rows (weight, vaccine, fumigation)
    detailsContainer.querySelectorAll('.sheet-peso-swipe-wrap').forEach(wrapEl => {
      const recordId = wrapEl.dataset.recordId;
      const recordType = wrapEl.dataset.recordType || 'peso';
      const cardEl = wrapEl.querySelector('.sheet-peso-swipe-card');
      const delBtn = wrapEl.querySelector('.sheet-peso-delete-bg');
      if (!cardEl || !recordId) return;

      let startX = 0;
      let startY = 0;
      let currentX = 0;
      let baseOffset = 0;
      let dragging = false;
      let isHorizontal = null;

      const resetCard = () => {
        baseOffset = 0;
        cardEl.style.transition = 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)';
        cardEl.style.transform = 'translateX(0px)';
        wrapEl.classList.remove('swiped-open');
      };

      const snapOpen = () => {
        baseOffset = 104;
        cardEl.style.transition = 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)';
        cardEl.style.transform = 'translateX(104px)';
        wrapEl.classList.add('swiped-open');
      };

      delBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        confirmDeleteRecord(recordId, recordType, resetCard);
      });

      const onStart = (x, y) => {
        // Close any other open swipe rows
        detailsContainer.querySelectorAll('.sheet-peso-swipe-wrap.swiped-open').forEach(other => {
          if (other !== wrapEl) {
            const otherCard = other.querySelector('.sheet-peso-swipe-card');
            if (otherCard) {
              otherCard.style.transition = 'transform 0.22s cubic-bezier(0.2, 0, 0, 1)';
              otherCard.style.transform = 'translateX(0px)';
            }
            other.classList.remove('swiped-open');
          }
        });
        startX = x;
        startY = y;
        currentX = x;
        baseOffset = wrapEl.classList.contains('swiped-open') ? 104 : 0;
        dragging = true;
        isHorizontal = null;
        cardEl.style.transition = 'none';
      };

      const onMove = (x, y, ev) => {
        if (!dragging) return;
        const dx = x - startX;
        const dy = y - startY;

        if (isHorizontal === null && (Math.abs(dx) > 6 || Math.abs(dy) > 6)) {
          isHorizontal = Math.abs(dx) > Math.abs(dy);
        }
        if (isHorizontal === false) {
          dragging = false;
          return;
        }
        if (isHorizontal && ev?.cancelable) {
          ev.preventDefault();
        }

        currentX = x;
        const nextOffset = Math.max(0, Math.min(180, baseOffset + dx));
        cardEl.style.transform = `translateX(${nextOffset}px)`;
      };

      const onEnd = () => {
        if (!dragging) return;
        dragging = false;
        const totalX = Math.max(0, baseOffset + (currentX - startX));

        if (totalX >= 145) {
          snapOpen();
          confirmDeleteRecord(recordId, recordType, resetCard);
        } else if (totalX >= 45) {
          snapOpen();
        } else {
          resetCard();
        }
      };

      cardEl.addEventListener('touchstart', (e) => {
        if (e.touches.length !== 1) return;
        onStart(e.touches[0].clientX, e.touches[0].clientY);
      }, { passive: true });

      cardEl.addEventListener('touchmove', (e) => {
        if (e.touches.length !== 1) return;
        onMove(e.touches[0].clientX, e.touches[0].clientY, e);
      }, { passive: false });

      cardEl.addEventListener('touchend', onEnd, { passive: true });

      cardEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        onStart(e.clientX, e.clientY);
        const onMouseMove = (me) => onMove(me.clientX, me.clientY, me);
        const onMouseUp = () => {
          window.removeEventListener('mousemove', onMouseMove);
          window.removeEventListener('mouseup', onMouseUp);
          onEnd();
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
      });

      cardEl.addEventListener('click', () => {
        if (wrapEl.classList.contains('swiped-open') && Math.abs(currentX - startX) < 5) {
          resetCard();
        }
      });
    });

    // Bind "+ Registrar" buttons
    detailsContainer.querySelectorAll('[data-open-sheet]').forEach(btnEl => {
      btnEl.addEventListener('click', (e) => {
        e.stopPropagation();
        const action = btnEl.dataset.openSheet;
        if (action === 'add-peso') openPesoFormSheet(a, pesoActual, pesoUnidad, reloadDetails);
        else if (action === 'add-vacuna') openVacunaFormSheet(a, pesoActual, reloadDetails);
        else if (action === 'add-fumig') openFumigFormSheet(a, pesoActual, reloadDetails);
      });
    });

  } catch (err) {
    console.warn('Error loading animal details for bottom sheet:', err);
  }
}

// ─── Sub-Bottom Sheets: Control de Peso ──────────────────────────────────────

function openPesoFormSheet(animal, pesoActual, pesoUnidad, onReload) {
  const today = getLocalToday();
  const html = `
    <div class="m3-sub-sheet-header">
      <div class="m3-sub-sheet-icon">
        <span class="material-icons">scale</span>
      </div>
      <div style="flex: 1; min-width: 0;">
        <h4 class="m3-sub-sheet-title">Registrar Peso</h4>
        <p class="m3-sub-sheet-subtitle">${escapeHtml(animal.nombre || 'Animal')} • <span style="color: #e65100; font-weight: 800;">Peso actual: ${escapeHtml(pesoActual)} kg</span></p>
      </div>
    </div>
    <form id="sub-sheet-form-peso" class="m3-sub-sheet-form">
      <div class="m3-field" style="margin-bottom: 0;">
        <input type="number" step="0.1" name="peso_lb" id="sub-peso-val" placeholder=" " required autocomplete="off">
        <label>Peso (lb)</label>
      </div>
      <div id="sub-peso-kg-preview" style="display: none; align-items: center; gap: 6px; font-size: 12.5px; font-weight: 700; color: #2d3e2c; background: #eef5ee; border: 1px solid #d5e4d4; padding: 7px 12px; border-radius: 10px; margin-top: -6px;">
        <span class="material-icons" style="font-size: 16px; color: #2d3e2c;">swap_horiz</span>
        <span id="sub-peso-kg-text">Equivale a: 0 kg</span>
      </div>
      <div class="m3-field">
        <input type="date" name="fecha" id="sub-peso-fecha" value="${today}" placeholder=" " required>
        <label>Fecha de Pesaje</label>
      </div>
      <div class="m3-sub-sheet-actions">
        <button type="button" class="btn-m3-tonal" id="sub-peso-cancel">Cancelar</button>
        <button type="submit" class="btn-m3-fill" id="sub-peso-submit">
          <span class="material-icons" style="font-size: 18px;">check</span>
          <span>Guardar Peso</span>
        </button>
      </div>
    </form>
  `;

  openSubBottomSheet(html, (subSheet) => {
    const pesoInput = subSheet.querySelector('#sub-peso-val');
    const previewBox = subSheet.querySelector('#sub-peso-kg-preview');
    const previewText = subSheet.querySelector('#sub-peso-kg-text');

    pesoInput?.addEventListener('input', () => {
      const lb = parseFloat(pesoInput.value);
      if (!isNaN(lb) && lb > 0) {
        const kg = Math.round((lb / 2.20462) * 10) / 10;
        if (previewBox) previewBox.style.display = 'flex';
        if (previewText) previewText.textContent = `Se guardará como: ${kg} kg`;
      } else {
        if (previewBox) previewBox.style.display = 'none';
      }
    });

    setTimeout(() => pesoInput?.focus(), 120);
    subSheet.querySelector('#sub-peso-cancel')?.addEventListener('click', closeSubBottomSheet);
    subSheet.querySelector('#sub-sheet-form-peso')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const submitBtn = subSheet.querySelector('#sub-peso-submit');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const pesoLb = parseFloat(formData.get('peso_lb'));
        const fechaPeso = formData.get('fecha');
        if (isNaN(pesoLb) || pesoLb <= 0) {
          showSnackbar('Ingresa un peso válido en libras', 'error');
          if (submitBtn) submitBtn.disabled = false;
          return;
        }

        const pesoKg = Math.round((pesoLb / 2.20462) * 10) / 10;

        const { error } = await supabase.from('animal_pesajes').insert({
          animal_id: animal.id,
          empresa_id: window._currentEmpresaId,
          peso: pesoKg,
          fecha: fechaPeso
        });
        if (error) throw new Error(error);

        sendWhatsApp(
          '⚖️ Peso Registrado\nAnimal: ' + (animal.nombre || 'Animal') +
          '\nPeso: ' + pesoKg + ' kg (' + pesoLb + ' lb)' +
          '\nFecha: ' + fechaPeso +
          '\nFinca: ' + (window._empresaNombre || '')
        );

        showSnackbar(`Pesaje registrado: ${pesoKg} kg ✓`);
        closeSubBottomSheet();
        if (onReload) onReload();
      } catch (err) {
        showSnackbar(err.message || 'Error al registrar pesaje', 'error');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  });
}

function openPesoDetailSheet(animal, pesaje, pesoUnidad, onReload) {
  const html = `
    <div class="m3-sub-sheet-header">
      <div class="m3-sub-sheet-icon">
        <span class="material-icons">scale</span>
      </div>
      <div>
        <h4 class="m3-sub-sheet-title">Detalle de Pesaje</h4>
        <p class="m3-sub-sheet-subtitle">${escapeHtml(animal.nombre || 'Animal')} • ${formatFecha(pesaje.fecha)}</p>
      </div>
    </div>
    <form id="sub-sheet-edit-peso" class="m3-sub-sheet-form">
      <div class="m3-field">
        <input type="number" step="0.1" name="peso" value="${escapeHtml(pesaje.peso)}" placeholder=" " required autocomplete="off">
        <label>Peso (${escapeHtml(pesoUnidad)})</label>
      </div>
      <div class="m3-field">
        <input type="date" name="fecha" value="${escapeHtml(pesaje.fecha)}" placeholder=" " required>
        <label>Fecha de Pesaje</label>
      </div>
      <div class="m3-sub-sheet-actions-split">
        <button type="button" class="btn-m3-tonal sub-sheet-btn-delete" id="sub-peso-delete">
          <span class="material-icons" style="font-size: 18px;">delete_outline</span>
          <span>Eliminar</span>
        </button>
        <button type="submit" class="btn-m3-fill" id="sub-peso-save" style="flex: 1; justify-content: center;">
          <span class="material-icons" style="font-size: 18px;">save</span>
          <span>Guardar cambios</span>
        </button>
      </div>
    </form>
  `;

  openSubBottomSheet(html, (subSheet) => {
    subSheet.querySelector('#sub-peso-delete')?.addEventListener('click', () => {
      window.Snackbar.confirm('¿Deseas eliminar este registro de pesaje?', async () => {
        try {
          if (db.animal_pesajes) {
            await db.animal_pesajes.delete(pesaje.id).catch(() => {});
          }
          await restFetch(`/rest/v1/animal_pesajes?id=eq.${encodeURIComponent(pesaje.id)}`, {
            method: 'DELETE'
          });
          showSnackbar('Pesaje eliminado ✓');
          closeSubBottomSheet();
          if (onReload) onReload();
        } catch (err) {
          showSnackbar(err.message || 'Error al eliminar pesaje', 'error');
        }
      });
    });

    subSheet.querySelector('#sub-sheet-edit-peso')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const saveBtn = subSheet.querySelector('#sub-peso-save');
      if (saveBtn) saveBtn.disabled = true;

      try {
        const pesoVal = parseFloat(formData.get('peso'));
        const fechaPeso = formData.get('fecha');
        if (isNaN(pesoVal) || pesoVal <= 0) {
          showSnackbar('Ingresa un peso válido', 'error');
          if (saveBtn) saveBtn.disabled = false;
          return;
        }

        await restFetch(`/rest/v1/animal_pesajes?id=eq.${encodeURIComponent(pesaje.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ peso: pesoVal, fecha: fechaPeso })
        });
        if (db.animal_pesajes) {
          await db.animal_pesajes.put({ ...pesaje, peso: pesoVal, fecha: fechaPeso }).catch(() => {});
        }
        syncTable('animal_pesajes');
        showSnackbar('Pesaje actualizado ✓');
        closeSubBottomSheet();
        if (onReload) onReload();
      } catch (err) {
        showSnackbar(err.message || 'Error al actualizar pesaje', 'error');
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  });
}

// ─── Catálogo de Vacunas y Productos con Dosis por Peso ──────────────────────

function getCatalogStorageKey(type) {
  const empId = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || 'default';
  return `finca_catalogo_${type}_${empId}`;
}

function getDosisCatalog(type) {
  try {
    const raw = localStorage.getItem(getCatalogStorageKey(type));
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveToDosisCatalog(type, nombre, kgPorMl) {
  const cleanName = (nombre || '').trim();
  const numKg = parseFloat(kgPorMl);
  if (!cleanName || isNaN(numKg) || numKg <= 0) return getDosisCatalog(type);
  const list = getDosisCatalog(type);
  const existingIdx = list.findIndex(item => item.nombre.toLowerCase() === cleanName.toLowerCase());
  if (existingIdx >= 0) {
    list[existingIdx] = { nombre: cleanName, kgPorMl: numKg };
  } else {
    list.unshift({ nombre: cleanName, kgPorMl: numKg });
  }
  try {
    localStorage.setItem(getCatalogStorageKey(type), JSON.stringify(list));
  } catch {}
  return list;
}

// ─── Sub-Bottom Sheets: Vacunas ──────────────────────────────────────────────

function openVacunaFormSheet(animal, pesoActual, onReload) {
  const today = getLocalToday();
  const catalog = getDosisCatalog('vacunas');

  const buildSelectOptions = (list, selectedName = '') => {
    const opts = list.map(item => {
      const isSel = item.nombre.toLowerCase() === (selectedName || '').toLowerCase() ? 'selected' : '';
      return `<option value="${escapeHtml(item.nombre)}" data-kg="${escapeHtml(item.kgPorMl)}" ${isSel}>${escapeHtml(item.nombre)} (1 ml cada ${escapeHtml(item.kgPorMl)} kg)</option>`;
    }).join('');
    return `<option value="">-- Seleccionar vacuna guardada --</option>${opts}`;
  };

  const html = `
    <div class="m3-sub-sheet-header">
      <div class="m3-sub-sheet-icon">
        <span class="material-icons">vaccines</span>
      </div>
      <div style="flex: 1; min-width: 0;">
        <h4 class="m3-sub-sheet-title" id="sub-vacuna-title">Registrar Vacuna</h4>
        <p class="m3-sub-sheet-subtitle">${escapeHtml(animal.nombre || 'Animal')} • <span style="color: #e65100; font-weight: 800;">Peso actual: ${escapeHtml(pesoActual)} kg</span></p>
      </div>
    </div>
    <form id="sub-sheet-form-vacuna" class="m3-sub-sheet-form">
      <div style="display: flex; gap: 8px; align-items: stretch;">
        <div class="m3-field" style="flex: 1; margin-bottom: 0;">
          <select id="sub-vacuna-catalog-select" style="width: 100%; height: 54px; border-radius: 12px; border: 1.5px solid rgba(45,62,44,0.28); padding: 18px 14px 6px; font-size: 14px; font-weight: 700; color: #1e3e2b; background: #fff; outline: none; font-family: inherit;">
            ${buildSelectOptions(catalog)}
          </select>
          <label style="top: 10px; font-size: 10.5px; font-weight: 800; color: #2d3e2c; text-transform: uppercase;">Nombre de la Vacuna / Tratamiento</label>
        </div>
        <button type="button" id="sub-vacuna-toggle-new" class="btn-m3-tonal" style="height: 54px; padding: 0 14px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px; font-weight: 800; font-size: 12.5px; background: #eef5ee; color: #2d3e2c; border: 1.5px solid #c8dcc6; white-space: nowrap; flex-shrink: 0;">
          <span class="material-icons" style="font-size: 18px;">add</span>
          <span>Nueva</span>
        </button>
      </div>

      <div id="sub-vacuna-new-box" style="display: ${catalog.length === 0 ? 'flex' : 'none'}; flex-direction: column; gap: 10px; background: #f4f8f3; border: 1.5px solid #cde0cb; border-radius: 16px; padding: 14px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 12px; font-weight: 800; color: #2d3e2c; text-transform: uppercase; letter-spacing: 0.4px; display: inline-flex; align-items: center; gap: 5px;">
            <span class="material-icons" style="font-size: 16px;">playlist_add</span>
            Crear nueva vacuna con su dosis
          </span>
        </div>
        <div class="m3-field" style="margin-bottom: 0; background: #fff; border-radius: 12px;">
          <input type="text" id="sub-vacuna-new-nombre" placeholder=" " autocomplete="off">
          <label>Nombre de la nueva vacuna</label>
        </div>
        <div class="m3-field" style="margin-bottom: 0; background: #fff; border-radius: 12px;">
          <input type="number" step="any" id="sub-vacuna-new-kg" placeholder=" " autocomplete="off">
          <label>Peso en kg por cada 1 ml (ej. 50)</label>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" id="sub-vacuna-cancel-new" class="btn-m3-tonal" style="padding: 8px 14px; font-size: 12.5px; border-radius: 10px;">Cerrar</button>
          <button type="button" id="sub-vacuna-save-new" class="btn-m3-fill" style="padding: 8px 16px; font-size: 12.5px; border-radius: 10px; display: inline-flex; align-items: center; gap: 5px;">
            <span class="material-icons" style="font-size: 16px;">save</span>
            <span>Guardar y Seleccionar</span>
          </button>
        </div>
      </div>

      <input type="hidden" name="nombre" id="sub-vacuna-nombre" value="">

      <div class="m3-field">
        <input type="date" name="fecha" id="sub-vacuna-fecha" value="${today}" placeholder=" " required>
        <label>Fecha de Aplicación</label>
      </div>
      <div class="m3-field">
        <input type="number" step="any" id="sub-vacuna-dosis-base" placeholder=" " autocomplete="off">
        <label>Dosis por peso (1 ml cada X kg)</label>
      </div>
      <div class="m3-field">
        <input type="text" name="dosis" id="sub-vacuna-dosis" placeholder=" " autocomplete="off" style="color: #e65100; font-weight: 800;">
        <label>Dosis a aplicar al animal</label>
      </div>
      <div class="m3-field">
        <textarea name="observaciones" id="sub-vacuna-obs" placeholder=" " rows="2"></textarea>
        <label>Observaciones (opcional)</label>
      </div>
      <div class="m3-sub-sheet-actions">
        <button type="button" class="btn-m3-tonal" id="sub-vacuna-cancel">Cancelar</button>
        <button type="submit" class="btn-m3-fill" id="sub-vacuna-submit">
          <span class="material-icons" style="font-size: 18px;">check</span>
          <span id="sub-vacuna-submit-label">Guardar Vacuna</span>
        </button>
      </div>
    </form>
  `;

  openSubBottomSheet(html, (subSheet) => {
    const fechaInput = subSheet.querySelector('#sub-vacuna-fecha');
    const titleEl = subSheet.querySelector('#sub-vacuna-title');
    const submitLabelEl = subSheet.querySelector('#sub-vacuna-submit-label');
    const catalogSelect = subSheet.querySelector('#sub-vacuna-catalog-select');
    const hiddenNombreInput = subSheet.querySelector('#sub-vacuna-nombre');
    const toggleNewBtn = subSheet.querySelector('#sub-vacuna-toggle-new');
    const newBox = subSheet.querySelector('#sub-vacuna-new-box');
    const newNombreInput = subSheet.querySelector('#sub-vacuna-new-nombre');
    const newKgInput = subSheet.querySelector('#sub-vacuna-new-kg');
    const cancelNewBtn = subSheet.querySelector('#sub-vacuna-cancel-new');
    const saveNewBtn = subSheet.querySelector('#sub-vacuna-save-new');
    const dosisBaseInput = subSheet.querySelector('#sub-vacuna-dosis-base');
    const dosisAplicarInput = subSheet.querySelector('#sub-vacuna-dosis');
    const pesoNum = parseFloat(pesoActual) || 0;

    const recalcularDosis = () => {
      const divisor = parseFloat(dosisBaseInput?.value);
      if (!isNaN(divisor) && divisor > 0 && pesoNum > 0) {
        const resultado = Number((pesoNum / divisor).toFixed(2));
        if (dosisAplicarInput) dosisAplicarInput.value = `${resultado} ml`;
      } else if (!dosisBaseInput?.value && dosisAplicarInput) {
        dosisAplicarInput.value = '';
      }
    };

    dosisBaseInput?.addEventListener('input', recalcularDosis);

    catalogSelect?.addEventListener('change', () => {
      const selOpt = catalogSelect.options[catalogSelect.selectedIndex];
      const val = catalogSelect.value || '';
      if (hiddenNombreInput) hiddenNombreInput.value = val;
      const kg = selOpt?.getAttribute('data-kg');
      if (kg && dosisBaseInput) {
        dosisBaseInput.value = kg;
        recalcularDosis();
      }
    });

    toggleNewBtn?.addEventListener('click', () => {
      if (!newBox) return;
      const isHidden = newBox.style.display === 'none';
      newBox.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) setTimeout(() => newNombreInput?.focus(), 60);
    });

    cancelNewBtn?.addEventListener('click', () => {
      if (newBox) newBox.style.display = 'none';
    });

    saveNewBtn?.addEventListener('click', () => {
      const newName = (newNombreInput?.value || '').trim();
      const newKg = parseFloat(newKgInput?.value);
      if (!newName) {
        showSnackbar('Escribe el nombre de la vacuna', 'error');
        newNombreInput?.focus();
        return;
      }
      if (isNaN(newKg) || newKg <= 0) {
        showSnackbar('Escribe los kg de peso por cada 1 ml (ej. 50)', 'error');
        newKgInput?.focus();
        return;
      }
      const updatedList = saveToDosisCatalog('vacunas', newName, newKg);
      if (catalogSelect) {
        catalogSelect.innerHTML = buildSelectOptions(updatedList, newName);
      }
      if (hiddenNombreInput) hiddenNombreInput.value = newName;
      if (dosisBaseInput) {
        dosisBaseInput.value = String(newKg);
        recalcularDosis();
      }
      if (newNombreInput) newNombreInput.value = '';
      if (newKgInput) newKgInput.value = '';
      if (newBox) newBox.style.display = 'none';
      showSnackbar(`Vacuna "${newName}" guardada y cargada ✓`);
    });

    const updateModeLabel = () => {
      const val = fechaInput?.value || today;
      const isFuture = val > today;
      if (titleEl) titleEl.textContent = isFuture ? 'Programar Vacuna' : 'Registrar Vacuna';
      if (submitLabelEl) submitLabelEl.textContent = isFuture ? 'Programar Vacuna' : 'Guardar Vacuna';
    };
    fechaInput?.addEventListener('change', updateModeLabel);

    subSheet.querySelector('#sub-vacuna-cancel')?.addEventListener('click', closeSubBottomSheet);
    subSheet.querySelector('#sub-sheet-form-vacuna')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const submitBtn = subSheet.querySelector('#sub-vacuna-submit');

      let nombre = (formData.get('nombre') || catalogSelect?.value || newNombreInput?.value || '').trim();
      if (!nombre) {
        showSnackbar('Selecciona o crea una vacuna primero', 'error');
        return;
      }
      if (submitBtn) submitBtn.disabled = true;

      const baseKgVal = parseFloat(dosisBaseInput?.value || newKgInput?.value);
      if (!isNaN(baseKgVal) && baseKgVal > 0) {
        saveToDosisCatalog('vacunas', nombre, baseKgVal);
      }

      try {
        const selectedDate = formData.get('fecha');
        const dosis = (formData.get('dosis') || '').trim();
        const obs = (formData.get('observaciones') || '').trim();
        const isTodayOrPast = selectedDate <= getLocalToday();
        const estadoVal = isTodayOrPast ? 'Aplicada' : 'Programada';

        const payload = {
          animal_id: animal.id,
          empresa_id: window._currentEmpresaId,
          nombre,
          fecha: selectedDate,
          estado: estadoVal
        };
        if (dosis) payload.dosis = dosis;
        if (obs) payload.observaciones = obs;

        const { error } = await supabase.from('animal_vacunas').insert(payload);
        if (error) throw new Error(error);

        if (isTodayOrPast) {
          sendWhatsApp(
            '✅ Vacuna Aplicada\nAnimal: ' + (animal.nombre || 'Animal') +
            '\nVacuna: ' + nombre +
            '\nDosis: ' + (dosis || 'N/A') +
            '\nObservación: ' + (obs || 'N/A') +
            '\nFecha: ' + selectedDate +
            '\nFinca: ' + (window._empresaNombre || '')
          );
        }

        showSnackbar(isTodayOrPast ? 'Vacuna registrada ✓' : 'Vacuna programada ✓');
        closeSubBottomSheet();
        if (onReload) onReload();
      } catch (err) {
        showSnackbar(err.message || 'Error al guardar vacuna', 'error');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  });
}

function openVacunaDetailSheet(animal, vacuna, onReload) {
  const isProgramada = vacuna.estado === 'Programada';
  const html = `
    <div class="m3-sub-sheet-header">
      <div class="m3-sub-sheet-icon">
        <span class="material-icons">vaccines</span>
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <h4 class="m3-sub-sheet-title">Detalle de Vacuna</h4>
          <span class="${isProgramada ? 'badge-pending' : 'badge-ok'}" style="font-size: 10.5px; padding: 3px 9px; border-radius: 999px; font-weight: 800;">
            ${escapeHtml(vacuna.estado || 'Aplicada')}
          </span>
        </div>
        <p class="m3-sub-sheet-subtitle">${escapeHtml(animal.nombre || 'Animal')} • ${formatFecha(vacuna.fecha)}</p>
      </div>
    </div>

    ${isProgramada ? `
      <button type="button" class="m3-sub-sheet-apply-banner" id="sub-vacuna-confirm-apply">
        <span class="material-icons">check_circle</span>
        <span>Confirmar vacuna como Aplicada</span>
      </button>
    ` : ''}

    <form id="sub-sheet-edit-vacuna" class="m3-sub-sheet-form">
      <div class="m3-field">
        <input type="text" name="nombre" value="${escapeHtml(vacuna.nombre || '')}" placeholder=" " required autocomplete="off">
        <label>Nombre de la Vacuna</label>
      </div>
      <div class="m3-field">
        <input type="date" name="fecha" value="${escapeHtml(vacuna.fecha || '')}" placeholder=" " required>
        <label>Fecha</label>
      </div>
      <div class="m3-field">
        <input type="text" name="dosis" value="${escapeHtml(vacuna.dosis || '')}" placeholder=" " autocomplete="off">
        <label>Dosis (opcional)</label>
      </div>
      <div class="m3-field">
        <textarea name="observaciones" placeholder=" " rows="2">${escapeHtml(vacuna.observaciones || '')}</textarea>
        <label>Observaciones (opcional)</label>
      </div>
      <div class="m3-sub-sheet-actions-split">
        <button type="button" class="btn-m3-tonal sub-sheet-btn-delete" id="sub-vacuna-delete">
          <span class="material-icons" style="font-size: 18px;">delete_outline</span>
          <span>Eliminar</span>
        </button>
        <button type="submit" class="btn-m3-fill" id="sub-vacuna-save" style="flex: 1; justify-content: center;">
          <span class="material-icons" style="font-size: 18px;">save</span>
          <span>Guardar cambios</span>
        </button>
      </div>
    </form>
  `;

  openSubBottomSheet(html, (subSheet) => {
    subSheet.querySelector('#sub-vacuna-confirm-apply')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await restFetch(`/rest/v1/animal_vacunas?id=eq.${encodeURIComponent(vacuna.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ estado: 'Aplicada' })
        });
        if (db.animal_vacunas) {
          await db.animal_vacunas.put({ ...vacuna, estado: 'Aplicada' }).catch(() => {});
        }
        syncTable('animal_vacunas');

        sendWhatsApp(
          `✅ Vacuna Aplicada\nAnimal: ${animal.nombre || 'Animal'}\nVacuna: ${vacuna.nombre}\nDosis: ${vacuna.dosis || 'N/A'}\nObservación: ${vacuna.observaciones || 'N/A'}\nFecha: ${vacuna.fecha}\nFinca: ${window._empresaNombre || ''}`
        );

        showSnackbar('Vacuna confirmada como Aplicada ✓');
        closeSubBottomSheet();
        if (onReload) onReload();
      } catch (err) {
        showSnackbar(err.message || 'Error al confirmar vacuna', 'error');
        btn.disabled = false;
      }
    });

    subSheet.querySelector('#sub-vacuna-delete')?.addEventListener('click', () => {
      window.Snackbar.confirm('¿Eliminar este registro de vacuna?', async () => {
        try {
          if (db.animal_vacunas) {
            await db.animal_vacunas.delete(vacuna.id).catch(() => {});
          }
          await restFetch(`/rest/v1/animal_vacunas?id=eq.${encodeURIComponent(vacuna.id)}`, {
            method: 'DELETE'
          });
          syncTable('animal_vacunas');
          showSnackbar('Vacuna eliminada ✓');
          closeSubBottomSheet();
          if (onReload) onReload();
        } catch (err) {
          showSnackbar(err.message || 'Error al eliminar vacuna', 'error');
        }
      });
    });

    subSheet.querySelector('#sub-sheet-edit-vacuna')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const saveBtn = subSheet.querySelector('#sub-vacuna-save');
      if (saveBtn) saveBtn.disabled = true;

      try {
        const nombre = (formData.get('nombre') || '').trim();
        const fecha = formData.get('fecha');
        const dosis = (formData.get('dosis') || '').trim() || null;
        const observaciones = (formData.get('observaciones') || '').trim() || null;

        const updates = { nombre, fecha, dosis, observaciones };
        await restFetch(`/rest/v1/animal_vacunas?id=eq.${encodeURIComponent(vacuna.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(updates)
        });
        if (db.animal_vacunas) {
          await db.animal_vacunas.put({ ...vacuna, ...updates }).catch(() => {});
        }
        syncTable('animal_vacunas');
        showSnackbar('Vacuna actualizada ✓');
        closeSubBottomSheet();
        if (onReload) onReload();
      } catch (err) {
        showSnackbar(err.message || 'Error al actualizar vacuna', 'error');
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  });
}

// ─── Sub-Bottom Sheets: Fumigaciones / Baños ─────────────────────────────────

function openFumigFormSheet(animal, pesoActual, onReload) {
  const today = getLocalToday();
  const catalog = getDosisCatalog('fumigaciones');

  const buildSelectOptions = (list, selectedName = '') => {
    const opts = list.map(item => {
      const isSel = item.nombre.toLowerCase() === (selectedName || '').toLowerCase() ? 'selected' : '';
      return `<option value="${escapeHtml(item.nombre)}" data-kg="${escapeHtml(item.kgPorMl)}" ${isSel}>${escapeHtml(item.nombre)} (1 ml cada ${escapeHtml(item.kgPorMl)} kg)</option>`;
    }).join('');
    return `<option value="">-- Seleccionar producto guardado --</option>${opts}`;
  };

  const html = `
    <div class="m3-sub-sheet-header">
      <div class="m3-sub-sheet-icon">
        <span class="material-icons">pest_control</span>
      </div>
      <div style="flex: 1; min-width: 0;">
        <h4 class="m3-sub-sheet-title" id="sub-fumig-title">Registrar Fumigación / Baño</h4>
        <p class="m3-sub-sheet-subtitle">${escapeHtml(animal.nombre || 'Animal')} • <span style="color: #e65100; font-weight: 800;">Peso actual: ${escapeHtml(pesoActual)} kg</span></p>
      </div>
    </div>
    <form id="sub-sheet-form-fumig" class="m3-sub-sheet-form">
      <div style="display: flex; gap: 8px; align-items: stretch;">
        <div class="m3-field" style="flex: 1; margin-bottom: 0;">
          <select id="sub-fumig-catalog-select" style="width: 100%; height: 54px; border-radius: 12px; border: 1.5px solid rgba(45,62,44,0.28); padding: 18px 14px 6px; font-size: 14px; font-weight: 700; color: #1e3e2b; background: #fff; outline: none; font-family: inherit;">
            ${buildSelectOptions(catalog)}
          </select>
          <label style="top: 10px; font-size: 10.5px; font-weight: 800; color: #2d3e2c; text-transform: uppercase;">Producto / Químico</label>
        </div>
        <button type="button" id="sub-fumig-toggle-new" class="btn-m3-tonal" style="height: 54px; padding: 0 14px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px; font-weight: 800; font-size: 12.5px; background: #eef5ee; color: #2d3e2c; border: 1.5px solid #c8dcc6; white-space: nowrap; flex-shrink: 0;">
          <span class="material-icons" style="font-size: 18px;">add</span>
          <span>Nuevo</span>
        </button>
      </div>

      <div id="sub-fumig-new-box" style="display: ${catalog.length === 0 ? 'flex' : 'none'}; flex-direction: column; gap: 10px; background: #f4f8f3; border: 1.5px solid #cde0cb; border-radius: 16px; padding: 14px;">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <span style="font-size: 12px; font-weight: 800; color: #2d3e2c; text-transform: uppercase; letter-spacing: 0.4px; display: inline-flex; align-items: center; gap: 5px;">
            <span class="material-icons" style="font-size: 16px;">playlist_add</span>
            Crear nuevo producto con su dosis
          </span>
        </div>
        <div class="m3-field" style="margin-bottom: 0; background: #fff; border-radius: 12px;">
          <input type="text" id="sub-fumig-new-nombre" placeholder=" " autocomplete="off">
          <label>Nombre del nuevo producto</label>
        </div>
        <div class="m3-field" style="margin-bottom: 0; background: #fff; border-radius: 12px;">
          <input type="number" step="any" id="sub-fumig-new-kg" placeholder=" " autocomplete="off">
          <label>Peso en kg por cada 1 ml (ej. 50)</label>
        </div>
        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button type="button" id="sub-fumig-cancel-new" class="btn-m3-tonal" style="padding: 8px 14px; font-size: 12.5px; border-radius: 10px;">Cerrar</button>
          <button type="button" id="sub-fumig-save-new" class="btn-m3-fill" style="padding: 8px 16px; font-size: 12.5px; border-radius: 10px; display: inline-flex; align-items: center; gap: 5px;">
            <span class="material-icons" style="font-size: 16px;">save</span>
            <span>Guardar y Seleccionar</span>
          </button>
        </div>
      </div>

      <input type="hidden" name="producto" id="sub-fumig-producto" value="">

      <div class="m3-field">
        <input type="date" name="fecha" id="sub-fumig-fecha" value="${today}" placeholder=" " required>
        <label>Fecha</label>
      </div>
      <div class="m3-field">
        <input type="number" step="any" id="sub-fumig-dosis-base" placeholder=" " autocomplete="off">
        <label>Dosis por peso (1 ml cada X kg)</label>
      </div>
      <div class="m3-field">
        <input type="text" name="dosis" id="sub-fumig-dosis" placeholder=" " autocomplete="off" style="color: #e65100; font-weight: 800;">
        <label>Dosis a aplicar al animal</label>
      </div>
      <div class="m3-field">
        <textarea name="observaciones" id="sub-fumig-obs" placeholder=" " rows="2"></textarea>
        <label>Observaciones (opcional)</label>
      </div>
      <div class="m3-sub-sheet-actions">
        <button type="button" class="btn-m3-tonal" id="sub-fumig-cancel">Cancelar</button>
        <button type="submit" class="btn-m3-fill" id="sub-fumig-submit">
          <span class="material-icons" style="font-size: 18px;">check</span>
          <span id="sub-fumig-submit-label">Guardar Fumigación</span>
        </button>
      </div>
    </form>
  `;

  openSubBottomSheet(html, (subSheet) => {
    const fechaInput = subSheet.querySelector('#sub-fumig-fecha');
    const titleEl = subSheet.querySelector('#sub-fumig-title');
    const submitLabelEl = subSheet.querySelector('#sub-fumig-submit-label');
    const catalogSelect = subSheet.querySelector('#sub-fumig-catalog-select');
    const hiddenProductoInput = subSheet.querySelector('#sub-fumig-producto');
    const toggleNewBtn = subSheet.querySelector('#sub-fumig-toggle-new');
    const newBox = subSheet.querySelector('#sub-fumig-new-box');
    const newNombreInput = subSheet.querySelector('#sub-fumig-new-nombre');
    const newKgInput = subSheet.querySelector('#sub-fumig-new-kg');
    const cancelNewBtn = subSheet.querySelector('#sub-fumig-cancel-new');
    const saveNewBtn = subSheet.querySelector('#sub-fumig-save-new');
    const dosisBaseInput = subSheet.querySelector('#sub-fumig-dosis-base');
    const dosisAplicarInput = subSheet.querySelector('#sub-fumig-dosis');
    const pesoNum = parseFloat(pesoActual) || 0;

    const recalcularDosis = () => {
      const divisor = parseFloat(dosisBaseInput?.value);
      if (!isNaN(divisor) && divisor > 0 && pesoNum > 0) {
        const resultado = Number((pesoNum / divisor).toFixed(2));
        if (dosisAplicarInput) dosisAplicarInput.value = `${resultado} ml`;
      } else if (!dosisBaseInput?.value && dosisAplicarInput) {
        dosisAplicarInput.value = '';
      }
    };

    dosisBaseInput?.addEventListener('input', recalcularDosis);

    catalogSelect?.addEventListener('change', () => {
      const selOpt = catalogSelect.options[catalogSelect.selectedIndex];
      const val = catalogSelect.value || '';
      if (hiddenProductoInput) hiddenProductoInput.value = val;
      const kg = selOpt?.getAttribute('data-kg');
      if (kg && dosisBaseInput) {
        dosisBaseInput.value = kg;
        recalcularDosis();
      }
    });

    toggleNewBtn?.addEventListener('click', () => {
      if (!newBox) return;
      const isHidden = newBox.style.display === 'none';
      newBox.style.display = isHidden ? 'flex' : 'none';
      if (isHidden) setTimeout(() => newNombreInput?.focus(), 60);
    });

    cancelNewBtn?.addEventListener('click', () => {
      if (newBox) newBox.style.display = 'none';
    });

    saveNewBtn?.addEventListener('click', () => {
      const newName = (newNombreInput?.value || '').trim();
      const newKg = parseFloat(newKgInput?.value);
      if (!newName) {
        showSnackbar('Escribe el nombre del producto', 'error');
        newNombreInput?.focus();
        return;
      }
      if (isNaN(newKg) || newKg <= 0) {
        showSnackbar('Escribe los kg de peso por cada 1 ml (ej. 50)', 'error');
        newKgInput?.focus();
        return;
      }
      const updatedList = saveToDosisCatalog('fumigaciones', newName, newKg);
      if (catalogSelect) {
        catalogSelect.innerHTML = buildSelectOptions(updatedList, newName);
      }
      if (hiddenProductoInput) hiddenProductoInput.value = newName;
      if (dosisBaseInput) {
        dosisBaseInput.value = String(newKg);
        recalcularDosis();
      }
      if (newNombreInput) newNombreInput.value = '';
      if (newKgInput) newKgInput.value = '';
      if (newBox) newBox.style.display = 'none';
      showSnackbar(`Producto "${newName}" guardado y cargado ✓`);
    });

    const updateModeLabel = () => {
      const val = fechaInput?.value || today;
      const isFuture = val > today;
      if (titleEl) titleEl.textContent = isFuture ? 'Programar Fumigación / Baño' : 'Registrar Fumigación / Baño';
      if (submitLabelEl) submitLabelEl.textContent = isFuture ? 'Programar Fumigación' : 'Guardar Fumigación';
    };
    fechaInput?.addEventListener('change', updateModeLabel);

    subSheet.querySelector('#sub-fumig-cancel')?.addEventListener('click', closeSubBottomSheet);
    subSheet.querySelector('#sub-sheet-form-fumig')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const submitBtn = subSheet.querySelector('#sub-fumig-submit');

      let producto = (formData.get('producto') || catalogSelect?.value || newNombreInput?.value || '').trim();
      if (!producto) {
        showSnackbar('Selecciona o crea un producto primero', 'error');
        return;
      }
      if (submitBtn) submitBtn.disabled = true;

      const baseKgVal = parseFloat(dosisBaseInput?.value || newKgInput?.value);
      if (!isNaN(baseKgVal) && baseKgVal > 0) {
        saveToDosisCatalog('fumigaciones', producto, baseKgVal);
      }

      try {
        const selectedDate = formData.get('fecha');
        const dosis = (formData.get('dosis') || '').trim();
        const obs = (formData.get('observaciones') || '').trim();
        const isTodayOrPast = selectedDate <= getLocalToday();
        const estadoVal = isTodayOrPast ? 'Aplicada' : 'Programada';

        const payload = {
          animal_id: animal.id,
          empresa_id: window._currentEmpresaId,
          producto,
          fecha: selectedDate,
          estado: estadoVal
        };
        if (dosis) payload.dosis = dosis;
        if (obs) payload.observaciones = obs;

        const { error } = await supabase.from('animal_fumigaciones').insert(payload);
        if (error) throw new Error(error);

        if (isTodayOrPast) {
          sendWhatsApp(
            '✅ Fumigación Aplicada\nAnimal: ' + (animal.nombre || 'Animal') +
            '\nProducto: ' + producto +
            '\nDosis: ' + (dosis || 'N/A') +
            '\nObservación: ' + (obs || 'N/A') +
            '\nFecha: ' + selectedDate +
            '\nFinca: ' + (window._empresaNombre || '')
          );
        }

        showSnackbar(isTodayOrPast ? 'Fumigación registrada ✓' : 'Fumigación programada ✓');
        closeSubBottomSheet();
        if (onReload) onReload();
      } catch (err) {
        showSnackbar(err.message || 'Error al guardar fumigación', 'error');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  });
}

function openFumigDetailSheet(animal, fumig, onReload) {
  const isProgramada = fumig.estado === 'Programada';
  const html = `
    <div class="m3-sub-sheet-header">
      <div class="m3-sub-sheet-icon">
        <span class="material-icons">pest_control</span>
      </div>
      <div style="flex: 1; min-width: 0;">
        <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
          <h4 class="m3-sub-sheet-title">Detalle de Fumigación</h4>
          <span class="${isProgramada ? 'badge-pending' : 'badge-ok'}" style="font-size: 10.5px; padding: 3px 9px; border-radius: 999px; font-weight: 800;">
            ${escapeHtml(fumig.estado || 'Aplicada')}
          </span>
        </div>
        <p class="m3-sub-sheet-subtitle">${escapeHtml(animal.nombre || 'Animal')} • ${formatFecha(fumig.fecha)}</p>
      </div>
    </div>

    ${isProgramada ? `
      <button type="button" class="m3-sub-sheet-apply-banner" id="sub-fumig-confirm-apply">
        <span class="material-icons">check_circle</span>
        <span>Confirmar fumigación como Aplicada</span>
      </button>
    ` : ''}

    <form id="sub-sheet-edit-fumig" class="m3-sub-sheet-form">
      <div class="m3-field">
        <input type="text" name="producto" value="${escapeHtml(fumig.producto || '')}" placeholder=" " required autocomplete="off">
        <label>Producto / Químico</label>
      </div>
      <div class="m3-field">
        <input type="date" name="fecha" value="${escapeHtml(fumig.fecha || '')}" placeholder=" " required>
        <label>Fecha</label>
      </div>
      <div class="m3-field">
        <input type="text" name="dosis" value="${escapeHtml(fumig.dosis || '')}" placeholder=" " autocomplete="off">
        <label>Dosis (opcional)</label>
      </div>
      <div class="m3-field">
        <textarea name="observaciones" placeholder=" " rows="2">${escapeHtml(fumig.observaciones || '')}</textarea>
        <label>Observaciones (opcional)</label>
      </div>
      <div class="m3-sub-sheet-actions-split">
        <button type="button" class="btn-m3-tonal sub-sheet-btn-delete" id="sub-fumig-delete">
          <span class="material-icons" style="font-size: 18px;">delete_outline</span>
          <span>Eliminar</span>
        </button>
        <button type="submit" class="btn-m3-fill" id="sub-fumig-save" style="flex: 1; justify-content: center;">
          <span class="material-icons" style="font-size: 18px;">save</span>
          <span>Guardar cambios</span>
        </button>
      </div>
    </form>
  `;

  openSubBottomSheet(html, (subSheet) => {
    subSheet.querySelector('#sub-fumig-confirm-apply')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try {
        await restFetch(`/rest/v1/animal_fumigaciones?id=eq.${encodeURIComponent(fumig.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ estado: 'Aplicada' })
        });
        if (db.animal_fumigaciones) {
          await db.animal_fumigaciones.put({ ...fumig, estado: 'Aplicada' }).catch(() => {});
        }
        syncTable('animal_fumigaciones');

        sendWhatsApp(
          '✅ Fumigación Aplicada\nAnimal: ' + (animal.nombre || 'Animal') +
          '\nProducto: ' + fumig.producto +
          '\nDosis: ' + (fumig.dosis || 'N/A') +
          '\nObservación: ' + (fumig.observaciones || 'N/A') +
          '\nFecha: ' + fumig.fecha +
          '\nFinca: ' + (window._empresaNombre || '')
        );

        showSnackbar('Fumigación confirmada como Aplicada ✓');
        closeSubBottomSheet();
        if (onReload) onReload();
      } catch (err) {
        showSnackbar(err.message || 'Error al confirmar fumigación', 'error');
        btn.disabled = false;
      }
    });

    subSheet.querySelector('#sub-fumig-delete')?.addEventListener('click', () => {
      window.Snackbar.confirm('¿Eliminar este registro de fumigación?', async () => {
        try {
          if (db.animal_fumigaciones) {
            await db.animal_fumigaciones.delete(fumig.id).catch(() => {});
          }
          await restFetch(`/rest/v1/animal_fumigaciones?id=eq.${encodeURIComponent(fumig.id)}`, {
            method: 'DELETE'
          });
          syncTable('animal_fumigaciones');
          showSnackbar('Fumigación eliminada ✓');
          closeSubBottomSheet();
          if (onReload) onReload();
        } catch (err) {
          showSnackbar(err.message || 'Error al eliminar fumigación', 'error');
        }
      });
    });

    subSheet.querySelector('#sub-sheet-edit-fumig')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const saveBtn = subSheet.querySelector('#sub-fumig-save');
      if (saveBtn) saveBtn.disabled = true;

      try {
        const producto = (formData.get('producto') || '').trim();
        const fecha = formData.get('fecha');
        const dosis = (formData.get('dosis') || '').trim() || null;
        const observaciones = (formData.get('observaciones') || '').trim() || null;

        const updates = { producto, fecha, dosis, observaciones };
        await restFetch(`/rest/v1/animal_fumigaciones?id=eq.${encodeURIComponent(fumig.id)}`, {
          method: 'PATCH',
          body: JSON.stringify(updates)
        });
        if (db.animal_fumigaciones) {
          await db.animal_fumigaciones.put({ ...fumig, ...updates }).catch(() => {});
        }
        syncTable('animal_fumigaciones');
        showSnackbar('Fumigación actualizada ✓');
        closeSubBottomSheet();
        if (onReload) onReload();
      } catch (err) {
        showSnackbar(err.message || 'Error al actualizar fumigación', 'error');
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  });
}

function setupSheetGestures(sheet, setExpanded) {
  let startY = 0;
  let startX = 0;
  let currentY = 0;
  let isTracking = false;

  sheet.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const target = e.target;
    if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('textarea') || target.closest('select')) {
      isTracking = false;
      return;
    }
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    currentY = startY;
    isTracking = true;
  }, { passive: true });

  sheet.addEventListener('touchmove', (e) => {
    if (!isTracking || e.touches.length !== 1) return;
    currentY = e.touches[0].clientY;
  }, { passive: true });

  sheet.addEventListener('touchend', (e) => {
    if (!isTracking) return;
    isTracking = false;

    const deltaY = currentY - startY;
    const deltaX = Math.abs((e.changedTouches[0]?.clientX || startX) - startX);

    // Predominantly vertical movement
    if (Math.abs(deltaY) < 25 || Math.abs(deltaY) < deltaX * 1.1) {
      return;
    }

    // Swipe UP -> Expand smoothly to show full details
    if (deltaY < -30) {
      setExpanded(true);
    }
    // Swipe DOWN -> Collapse or Close
    else if (deltaY > 35) {
      if (sheet.classList.contains('expanded')) {
        // If scrolled down inside details, let normal scroll happen
        if (sheet.scrollTop > 15) return;
        setExpanded(false);
      } else {
        // In peek mode, swipe down closes
        closeActionBottomSheet();
      }
    }
  }, { passive: true });
}

function formatFecha(fecha) {
  if (!fecha) return 'No registrada';
  const d = new Date(fecha.length === 10 ? fecha + 'T12:00:00' : fecha);
  if (isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function calcEdad(fechaNac) {
  if (!fechaNac) return '';
  const nac = new Date(fechaNac.length === 10 ? fechaNac + 'T12:00:00' : fechaNac);
  if (isNaN(nac.getTime())) return '';
  const now = new Date();
  const diffDays = Math.floor((now - nac) / (1000 * 60 * 60 * 24));
  if (diffDays < 30) return `${diffDays} días`;
  const months = Math.floor(diffDays / 30.4375);
  if (months < 12) return `${months} meses`;
  const years = Math.floor(months / 12);
  const remMonths = months % 12;
  return `${years} año${years > 1 ? 's' : ''}${remMonths > 0 ? ', ' + remMonths + ' m' : ''}`;
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    if (isSubBottomSheetOpen()) {
      closeSubBottomSheet();
    } else if (isActionBottomSheetOpen()) {
      closeActionBottomSheet();
    }
  }
});

window.addEventListener('hashchange', () => {
  if (isSubBottomSheetOpen()) {
    closeSubBottomSheet();
  }
  if (isActionBottomSheetOpen()) {
    closeActionBottomSheet();
  }
});

window.openActionBottomSheet = openActionBottomSheet;
window.closeActionBottomSheet = closeActionBottomSheet;
window.isActionBottomSheetOpen = isActionBottomSheetOpen;
window.openSubBottomSheet = openSubBottomSheet;
window.closeSubBottomSheet = closeSubBottomSheet;
