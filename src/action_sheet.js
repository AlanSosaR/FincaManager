/**
 * Material 3 Expressive Action Bottom Sheet System for Mobile
 * Supports Peek Mode & Smooth Swipe-Up Expandable Details
 */

import { supabase } from './supabase.js';

let _currentSourceBtn = null;
let _isClosing = false;

export function isActionBottomSheetOpen() {
  const sheet = document.getElementById('m3-action-sheet');
  return sheet && sheet.classList.contains('open');
}

export function closeActionBottomSheet() {
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
      supabase.from('animal_vacunas').select('*').eq('animal_id', animalId).order('fecha', { ascending: false }).limit(4),
      supabase.from('animal_fumigaciones').select('*').eq('animal_id', animalId).order('fecha', { ascending: false }).limit(4),
      supabase.from('animal_pesajes').select('*').eq('animal_id', animalId).order('fecha', { ascending: false }).limit(4)
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

    const vacunas = vacRes?.data || [];
    const fumigaciones = fumRes?.data || [];
    const pesajes = pesRes?.data || [];

    const vacunasHtml = vacunas.length > 0 ? vacunas.map(v => `
      <div class="sheet-tag-row" style="padding: 6px 10px;">
        <div style="min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <span style="font-weight: 700; color: #1e3e2b; font-size: 12px;">${escapeHtml(v.nombre)}</span>
          <span style="color: #666; font-size: 10px; margin-left: 3px;">(${formatFecha(v.fecha)})</span>
        </div>
        <span class="${v.estado === 'Aplicada' ? 'badge-ok' : 'badge-pending'}" style="font-size: 9.5px; padding: 2px 6px;">${escapeHtml(v.estado || 'Aplicada')}</span>
      </div>
    `).join('') : '<p style="font-size: 11px; color: #888; margin: 0;">Sin vacunas registradas</p>';

    const fumigHtml = fumigaciones.length > 0 ? fumigaciones.map(f => `
      <div class="sheet-tag-row" style="padding: 6px 10px;">
        <div style="min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          <span style="font-weight: 700; color: #1e3e2b; font-size: 12px;">${escapeHtml(f.producto)}</span>
          <span style="color: #666; font-size: 10px; margin-left: 3px;">(${formatFecha(f.fecha)})</span>
        </div>
        <span class="${f.estado === 'Aplicada' ? 'badge-ok' : 'badge-pending'}" style="font-size: 9.5px; padding: 2px 6px;">${escapeHtml(f.estado || 'Aplicada')}</span>
      </div>
    `).join('') : '<p style="font-size: 11px; color: #888; margin: 0;">Sin fumigaciones registradas</p>';

    const pesajesHtml = pesajes.length > 0 ? pesajes.map(p => `
      <div class="sheet-tag-row">
        <span style="font-weight: 800; color: #1e3e2b;">${p.peso} ${escapeHtml(p.peso_unidad || a.peso_unidad || 'kg')}</span>
        <span style="color: #666; font-size: 11.5px;">${formatFecha(p.fecha)}</span>
      </div>
    `).join('') : '<p style="font-size: 12.5px; color: #888; margin: 0;">Sin pesajes adicionales</p>';

    const edadStr = calcEdad(a.fecha_nacimiento);

    // Populating detailsContainer
    detailsContainer.innerHTML = `
      <!-- Ficha de Identificación -->
      <div class="sheet-detail-card">
        <div class="sheet-detail-card-title">
          <span class="material-icons" style="font-size: 18px; color: #2d3e2c;">badge</span>
          <span>Ficha de Identificación</span>
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

      <!-- Bloque de acciones (Editar, Registrar venta, Eliminar) en formato plano DESPUÉS DE LA FICHA -->
      <div class="m3-action-sheet-flat-list" style="margin: 4px 0 8px; padding: 6px 0; border-top: 1px solid rgba(45,62,44,0.1); border-bottom: 1px solid rgba(45,62,44,0.1);">
        ${itemsHtml || ''}
      </div>

      <!-- Control de Peso -->
      <div class="sheet-detail-card">
        <div class="sheet-detail-card-title">
          <span class="material-icons" style="font-size: 18px; color: #2d3e2c;">scale</span>
          <span>Control de Peso</span>
        </div>
        <div style="margin-bottom: 8px;">
          <span class="sheet-detail-label">Peso Actual:</span>
          <span style="font-size: 16px; font-weight: 900; color: #2d3e2c; margin-left: 6px;">${a.peso_actual || '0'} ${escapeHtml(a.peso_unidad || 'kg')}</span>
        </div>
        <div class="sheet-tag-list">
          ${pesajesHtml}
        </div>
      </div>

      <!-- Vacunas -->
      <div class="sheet-detail-card" style="padding: 10px 14px;">
        <div class="sheet-detail-card-title" style="font-size: 11.5px; margin-bottom: 8px;">
          <span class="material-icons" style="font-size: 16px; color: #2d3e2c;">vaccines</span>
          <span>Vacunas (Aplicadas y Programadas)</span>
        </div>
        <div class="sheet-tag-list" style="gap: 5px;">
          ${vacunasHtml}
        </div>
      </div>

      <!-- Fumigaciones -->
      <div class="sheet-detail-card" style="padding: 10px 14px;">
        <div class="sheet-detail-card-title" style="font-size: 11.5px; margin-bottom: 8px;">
          <span class="material-icons" style="font-size: 16px; color: #2d3e2c;">pest_control</span>
          <span>Fumigaciones / Baños</span>
        </div>
        <div class="sheet-tag-list" style="gap: 5px;">
          ${fumigHtml}
        </div>
      </div>
    `;

    // Re-attach action handlers for the flat action buttons placed after the ficha
    attachActionHandlers(detailsContainer);
  } catch (err) {
    console.warn('Error loading animal details for bottom sheet:', err);
  }
}

function setupSheetGestures(sheet, setExpanded) {
  let startY = 0;
  let startX = 0;
  let currentY = 0;
  let isTracking = false;

  sheet.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    const target = e.target;
    if (target.closest('button') || target.closest('a') || target.closest('input')) {
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
  if (e.key === 'Escape' && isActionBottomSheetOpen()) {
    closeActionBottomSheet();
  }
});

window.addEventListener('hashchange', () => {
  if (isActionBottomSheetOpen()) {
    closeActionBottomSheet();
  }
});

window.openActionBottomSheet = openActionBottomSheet;
window.closeActionBottomSheet = closeActionBottomSheet;
window.isActionBottomSheetOpen = isActionBottomSheetOpen;
