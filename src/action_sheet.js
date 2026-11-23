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

export function openSubBottomSheet(contentHtml, onMount, { expanded = false } = {}) {
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

  sheet.classList.toggle('expanded', Boolean(expanded));
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
      <!-- Footer fijo del sheet -->
      <div class="sheet-quick-register-box" id="sheet-quick-register-footer">
        <p class="sheet-quick-register-title">Registrar o programar</p>
        <div class="sheet-quick-register-row">
          <button type="button" class="sheet-quick-register-pill" data-open-sheet="add-peso">+ Peso</button>
          <button type="button" class="sheet-quick-register-pill" data-open-sheet="add-vacuna">+ Vacuna</button>
          <button type="button" class="sheet-quick-register-pill" data-open-sheet="add-fumig">+ Fumigación</button>
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

  const detailsContainerEl = sheet.querySelector('#sheet-expanded-details');
  if (detailsContainerEl) {
    detailsContainerEl.addEventListener('scroll', () => {
      if (detailsContainerEl.scrollTop > 10 && !sheet.classList.contains('expanded')) {
        setExpanded(true);
      }
    }, { passive: true });
  }

  // Gesture handling
  setupSheetGestures(sheet, setExpanded);

  // Open full height for animal detail sheet
  if (animalId) setExpanded(true);
  scrim.style.display = 'block';
  sheet.style.display = animalId ? 'flex' : 'block';
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

async function loadAnimalDetails(animalId, sheet, itemsHtml, originalButtons, attachActionHandlers, options = {}) {
  try {
    const [animalRes, vacRes, fumRes, pesRes, pregRes] = await Promise.all([
      supabase.from('ganado').select('*').eq('id', animalId).maybeSingle(),
      supabase.from('animal_vacunas').select('*').eq('animal_id', animalId).order('fecha', { ascending: false }).limit(8),
      supabase.from('animal_fumigaciones').select('*').eq('animal_id', animalId).order('fecha', { ascending: false }).limit(8),
      supabase.from('animal_pesajes').select('*').eq('animal_id', animalId).order('fecha', { ascending: false }).range(0, 999),
      supabase.from('animal_preñez').select('*').eq('animal_id', animalId).order('fecha_monta', { ascending: false }).limit(8)
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
    const pregnancies = [...(pregRes?.data || [])].sort((p1, p2) => (p2.fecha_monta || '').localeCompare(p1.fecha_monta || ''));
    const activePreg = pregnancies.find(p => p.estado === 'Preñada');
    const isFemale = !/macho|male|toro|torete/i.test(a.sexo || '');
    const pesajesAsc = [...(pesRes?.data || [])]
      .sort((p1, p2) => {
        const dDiff = (p1.fecha || '').localeCompare(p2.fecha || '');
        if (dDiff !== 0) return dDiff;
        return (p1.created_at || '').localeCompare(p2.created_at || '');
      });
    const pesajes = [...pesajesAsc].reverse();

    const pesoUnidad = 'kg';
    const formatKgNum = (val) => {
      const n = Math.round((parseFloat(val) || 0) * 10) / 10;
      return Number.isInteger(n) ? String(n) : n.toFixed(1);
    };
    const formatShortPesoDate = (ymd) => {
      if (!ymd) return '';
      const [, m, d] = ymd.split('-');
      const months = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
      return `${parseInt(d, 10)} ${months[(parseInt(m, 10) || 1) - 1] || ''}`;
    };
    const daysBetween = (fromYmd, toYmd) => {
      if (!fromYmd || !toYmd) return 0;
      const d1 = new Date(fromYmd + 'T00:00:00');
      const d2 = new Date(toYmd + 'T00:00:00');
      return Math.max(0, Math.round((d2 - d1) / 86400000));
    };

    const pesoStats = pesajesAsc.map((p, idx) => {
      const kg = Math.round((parseFloat(p.peso) || 0) * 10) / 10;
      if (idx === 0) {
        return {
          ...p,
          idx,
          kg,
          isFirst: true,
          trend: 'first',
          delta: null,
          days: null,
          rate: null,
          prev: null
        };
      }
      const prev = pesajesAsc[idx - 1];
      const prevKg = Math.round((parseFloat(prev.peso) || 0) * 10) / 10;
      const delta = Math.round((kg - prevKg) * 10) / 10;
      const days = daysBetween(prev.fecha, p.fecha);
      const rate = days > 0 ? (delta / days).toFixed(2) : null;
      const trend = delta > 0 ? 'up' : (delta < 0 ? 'down' : 'same');
      return {
        ...p,
        idx,
        kg,
        isFirst: false,
        trend,
        delta,
        days,
        rate,
        prev: { ...prev, kg: prevKg }
      };
    });

    const pesoActual = pesoStats.length > 0 ? formatKgNum(pesoStats[pesoStats.length - 1].kg) : formatKgNum(a.peso_actual ?? 0);

    const vacunasHtml = vacunas.length > 0 ? vacunas.map((v) => `
      <div class="sheet-peso-swipe-wrap" data-record-id="${escapeHtml(v.id)}" data-record-type="vacuna">
        <button type="button" class="sheet-peso-delete-bg" aria-label="Eliminar vacuna">
          <span class="material-icons">delete</span>
          <span>Eliminar</span>
        </button>
        <div class="sheet-tag-row sheet-peso-swipe-card" style="padding: 6px 10px;">
          <div style="min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
            <span style="font-weight: 700; color: #1e3e2b; font-size: 12px;">${escapeHtml(v.nombre)}</span>
            ${v.dosis ? `<span style="color: #2d3e2c; font-size: 10.5px; font-weight: 600; margin-left: 4px;">· ${escapeHtml(v.dosis)}</span>` : ''}
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

    const formatEdadAnimal = (fechaStr) => {
      if (!fechaStr) return '';
      const d = new Date(fechaStr.includes('T') ? fechaStr : fechaStr + 'T00:00:00');
      if (isNaN(d.getTime())) return '';
      const now = new Date();
      now.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((now - d) / 86400000);
      if (diffDays < 0) return '';
      if (diffDays <= 1) return '1 día';
      if (diffDays < 30) return `${diffDays} días`;

      let anios = now.getFullYear() - d.getFullYear();
      let meses = now.getMonth() - d.getMonth();
      let dias = now.getDate() - d.getDate();
      if (dias < 0) {
        meses -= 1;
        dias += new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      }
      if (meses < 0) {
        anios -= 1;
        meses += 12;
      }
      if (anios <= 0) {
        const m = Math.max(1, meses);
        return dias > 0 ? `${m} ${m === 1 ? 'mes' : 'meses'}, ${dias} d` : `${m} ${m === 1 ? 'mes' : 'meses'}`;
      }
      if (meses > 0 && dias > 0) return `${anios} ${anios === 1 ? 'año' : 'años'}, ${meses} m, ${dias} d`;
      if (meses > 0) return `${anios} ${anios === 1 ? 'año' : 'años'}, ${meses} m`;
      if (dias > 0) return `${anios} ${anios === 1 ? 'año' : 'años'}, ${dias} d`;
      return `${anios} ${anios === 1 ? 'año' : 'años'}`;
    };
    const edadDisplay = formatEdadAnimal(a.fecha_nacimiento || a.fecha_adquisicion || a.created_at) || calcEdad(a.fecha_nacimiento);

    // Pending (Programada) vacunas & fumigaciones
    const todayStr = getLocalToday();
    const pendingItems = [
      ...(vacRes?.data || []).filter(v => v.estado === 'Programada').map(v => ({
        id: v.id,
        type: 'vacuna',
        tipoLabel: 'Vacuna',
        titulo: v.nombre || 'Vacuna',
        fecha: v.fecha || '',
        dosis: v.dosis || '',
        raw: v
      })),
      ...(fumRes?.data || []).filter(f => f.estado === 'Programada').map(f => ({
        id: f.id,
        type: 'fumig',
        tipoLabel: 'Fumigación',
        titulo: f.producto || 'Fumigación',
        fecha: f.fecha || '',
        dosis: f.dosis || '',
        raw: f
      }))
    ].sort((x, y) => (x.fecha || '').localeCompare(y.fecha || ''));

    const pendingSectionHtml = pendingItems.length > 0 ? `
      <div class="sheet-pending-section">
        <div class="sheet-pending-header">
          <span class="material-icons">schedule</span>
          <span>PENDIENTE · ${pendingItems.length}</span>
        </div>
        ${pendingItems.map(item => {
          let badgeText = 'PROGRAMADA';
          let badgeClass = 'is-future';
          if (item.fecha && item.fecha < todayStr) {
            const d1 = new Date(item.fecha + 'T00:00:00');
            const d2 = new Date(todayStr + 'T00:00:00');
            const diffDays = Math.max(1, Math.round((d2 - d1) / 86400000));
            badgeText = `ATRASADA · ${diffDays} DÍA${diffDays === 1 ? '' : 'S'}`;
            badgeClass = 'is-late';
          } else if (item.fecha && item.fecha === todayStr) {
            badgeText = 'PARA HOY';
            badgeClass = 'is-today';
          } else if (item.fecha && item.fecha > todayStr) {
            const d1 = new Date(todayStr + 'T00:00:00');
            const d2 = new Date(item.fecha + 'T00:00:00');
            const diffDays = Math.max(1, Math.round((d2 - d1) / 86400000));
            badgeText = `EN ${diffDays} DÍA${diffDays === 1 ? '' : 'S'}`;
            badgeClass = 'is-future';
          }
          return `
            <div class="sheet-pending-card ${badgeClass}" data-pending-id="${escapeHtml(item.id)}" data-pending-type="${item.type}">
              <div class="sheet-pending-top">
                <span class="sheet-pending-kind">${escapeHtml(item.tipoLabel)}</span>
                <span class="sheet-pending-badge ${badgeClass}">${escapeHtml(badgeText)}</span>
              </div>
              <div class="sheet-pending-title">${escapeHtml(item.titulo)}</div>
              <div class="sheet-pending-meta">${formatFecha(item.fecha)}${item.dosis ? ` · Dosis ${escapeHtml(item.dosis)}` : ''}</div>
              <div class="sheet-pending-actions">
                <button type="button" class="sheet-pending-btn sheet-pending-btn--apply" data-pending-action="apply">✓ Aplicar</button>
                <button type="button" class="sheet-pending-btn sheet-pending-btn--edit" data-pending-action="edit">Editar</button>
                <button type="button" class="sheet-pending-btn sheet-pending-btn--cancel" data-pending-action="cancel">Cancelar</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    ` : '';

    const latestPesoStat = pesoStats.length > 0 ? pesoStats[pesoStats.length - 1] : null;
    const pesoDateStr = latestPesoStat?.fecha ? formatFecha(latestPesoStat.fecha) : '';

    let pesoCollapsedSubHtml = '<div class="sheet-collapsible-sub">Sin pesajes registrados</div>';
    if (pesoStats.length === 1) {
      pesoCollapsedSubHtml = '<div class="sheet-collapsible-sub">Primer pesaje · aún sin comparación</div>';
    } else if (pesoStats.length >= 2 && latestPesoStat) {
      const prevStat = latestPesoStat.prev;
      const dVal = latestPesoStat.delta;
      let pillText = '→ Se mantiene igual';
      if (dVal > 0) pillText = `↑ Subió ${formatKgNum(dVal)} kg`;
      else if (dVal < 0) pillText = `↓ Bajó ${formatKgNum(Math.abs(dVal))} kg`;
      const daysLabel = `${latestPesoStat.days} ${latestPesoStat.days === 1 ? 'día' : 'días'}`;
      pesoCollapsedSubHtml = `
        <div class="sheet-peso-collapsed-status">
          <span class="sheet-peso-status-pill is-${latestPesoStat.trend}">${escapeHtml(pillText)}</span>
          <span class="sheet-peso-collapsed-vs">en ${escapeHtml(daysLabel)}</span>
        </div>
      `;
    }

    let selectedPesoIdx = pesoStats.length > 0 ? pesoStats.length - 1 : -1;
    if (options.selectPesoId && pesoStats.length > 0) {
      const foundIdx = pesoStats.findIndex(s => String(s.id) === String(options.selectPesoId));
      if (foundIdx >= 0) selectedPesoIdx = foundIdx;
    }

    const buildPesoExpandedBodyHtml = () => {
      if (pesoStats.length === 0) {
        return '<p style="font-size: 12.5px; color: var(--m3-on-surface-variant, #666); margin: 0;">Sin pesajes registrados</p>';
      }
      const minKg = Math.min(...pesoStats.map(s => s.kg));
      const maxKg = Math.max(...pesoStats.map(s => s.kg));

      const barsHtml = pesoStats.map((s, idx) => {
        const barH = maxKg === minKg
          ? 70
          : Math.round(34 + ((s.kg - minKg) / (maxKg - minKg)) * 86);
        const topLabel = s.isFirst
          ? '1.º'
          : (s.delta > 0 ? `↑ +${formatKgNum(s.delta)}` : (s.delta < 0 ? `↓ −${formatKgNum(Math.abs(s.delta))}` : '→ 0'));
        const ariaChange = s.isFirst
          ? 'primer pesaje'
          : (s.delta > 0 ? `subió ${formatKgNum(s.delta)} kg` : (s.delta < 0 ? `bajó ${formatKgNum(Math.abs(s.delta))} kg` : 'se mantuvo igual'));
        const isSel = idx === selectedPesoIdx;
        return `
          <button type="button"
                  class="sheet-peso-bar-btn is-${s.trend} ${isSel ? 'is-selected' : ''}"
                  data-peso-idx="${idx}"
                  aria-pressed="${isSel ? 'true' : 'false'}"
                  aria-label="${escapeHtml(`${formatFecha(s.fecha)}, ${formatKgNum(s.kg)} kg, ${ariaChange}`)}">
            <span class="sheet-peso-bar-delta is-${s.trend}">${escapeHtml(topLabel)}</span>
            <span class="sheet-peso-bar-val">${escapeHtml(formatKgNum(s.kg))}</span>
            <span class="sheet-peso-bar-col is-${s.trend}" style="height: ${barH}px;"></span>
            <span class="sheet-peso-bar-date">${escapeHtml(formatShortPesoDate(s.fecha))}</span>
          </button>
        `;
      }).join('');

      let summaryRowsHtml = '';
      if (pesoStats.length >= 2) {
        const first = pesoStats[0];
        const last = pesoStats[pesoStats.length - 1];
        const totalDelta = Math.round((last.kg - first.kg) * 10) / 10;
        const totalDays = daysBetween(first.fecha, last.fecha);
        const avgDailyText = (totalDelta !== 0 && totalDays > 0)
          ? `${(totalDelta / totalDays).toFixed(2)} kg/día`
          : 'Sin cambio';

        summaryRowsHtml = `
          <div class="sheet-peso-summary-rows">
            <div class="sheet-peso-summary-row">
              <div class="sheet-peso-summary-title">Ganancia diaria promedio</div>
              <div class="sheet-peso-summary-val">${escapeHtml(avgDailyText)}</div>
            </div>
          </div>
        `;
      }

      const listHtml = [...pesoStats].reverse().map((s) => {
        const icon = s.isFirst ? '1.º' : (s.trend === 'up' ? '↑' : (s.trend === 'down' ? '↓' : '→'));
        const phrase = s.isFirst
          ? 'Primer pesaje registrado'
          : (s.trend === 'up'
            ? `Subió ${formatKgNum(s.delta)} kg desde el ${formatFecha(s.prev.fecha)} · ${s.days} ${s.days === 1 ? 'día' : 'días'}`
            : (s.trend === 'down'
              ? `Bajó ${formatKgNum(Math.abs(s.delta))} kg desde el ${formatFecha(s.prev.fecha)} · ${s.days} ${s.days === 1 ? 'día' : 'días'}`
              : `Se mantuvo igual desde el ${formatFecha(s.prev.fecha)} · ${s.days} ${s.days === 1 ? 'día' : 'días'}`));
        return `
          <div class="sheet-peso-history-item">
            <div class="sheet-peso-history-circle is-${s.trend}" aria-hidden="true">${icon}</div>
            <div class="sheet-peso-history-copy">
              <div class="sheet-peso-history-kg">${escapeHtml(formatKgNum(s.kg))} kg</div>
              <div class="sheet-peso-history-date">${escapeHtml(formatFecha(s.fecha))}</div>
              <div class="sheet-peso-history-phrase is-${s.trend}">${escapeHtml(phrase)}</div>
            </div>
            <button type="button" class="sheet-peso-edit-btn" data-edit-peso-id="${escapeHtml(s.id)}" aria-label="Editar pesaje del ${escapeHtml(formatFecha(s.fecha))}">
              <span class="material-icons">edit</span>
            </button>
          </div>
        `;
      }).join('');

      return `
        <div class="sheet-peso-chart-scroll">
          <div class="sheet-peso-bars">${barsHtml}</div>
        </div>
        ${summaryRowsHtml}
        <div class="sheet-peso-history-list">${listHtml}</div>
      `;
    };

    const isPesoInitiallyOpen = Boolean(options.expandPeso);

    const buildTreatmentSummary = (items) => {
      const applied = items.filter(x => (x.estado || 'Aplicada') === 'Aplicada');
      const pending = items.filter(x => x.estado === 'Programada');
      const parts = [];
      if (applied.length > 0) {
        parts.push(`Última: ${formatFecha(applied[0].fecha)} · Aplicada`);
      }
      if (pending.length > 0) {
        parts.push(`${pending.length} pendiente${pending.length === 1 ? '' : 's'}`);
      }
      return parts.length > 0 ? parts.join(' · ') : 'Sin registros';
    };

    const vacunasSummary = buildTreatmentSummary(vacunas);
    const fumigSummary = buildTreatmentSummary(fumigaciones);
    const animalSeed = encodeURIComponent(a.nombre || a.id || 'animal');
    const animalImgUrl = a.image_url || `https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=${animalSeed}&backgroundColor=f0ebe3&radius=16`;

    // Populating detailsContainer
    const titleEl = sheet.querySelector('.m3-action-sheet-title');
    if (titleEl) {
      const sexoText = escapeHtml(a.sexo || '-');
      const razaText = escapeHtml(a.raza || 'Bovino');
      titleEl.innerHTML = `
        <span>${escapeHtml(a.nombre || 'Animal')}</span>
        <span class="sheet-title-meta-pill">${sexoText} • <span class="is-raza">${razaText}</span></span>
      `;
    }

    detailsContainer.innerHTML = `
      <!-- Ficha de Identificación -->
      <div class="sheet-detail-card" style="position: relative;">
        <div class="sheet-detail-card-header-row" style="margin-bottom: 10px;">
          <div class="sheet-detail-card-title" style="margin-bottom: 0;">
            <span class="material-icons" style="font-size: 18px; color: #2d3e2c;">badge</span>
            <span>Ficha de Identificación</span>
          </div>
        </div>
        <div class="sheet-ficha-content">
          <img class="sheet-ficha-photo" src="${escapeHtml(animalImgUrl)}" alt="${escapeHtml(a.nombre || 'Animal')}">
          <div class="sheet-detail-grid" style="flex: 1; min-width: 0;">
          <div class="sheet-detail-item">
            <span class="sheet-detail-label">Fecha de Registro</span>
            <span class="sheet-detail-value">${formatFecha(a.created_at)}</span>
          </div>
          <div class="sheet-detail-item">
            <span class="sheet-detail-label">Edad</span>
            <span class="sheet-detail-value">${edadDisplay ? `${escapeHtml(edadDisplay)}${a.fecha_nacimiento ? ` <small style="font-weight:500;color:#666;">(${formatFecha(a.fecha_nacimiento)})</small>` : ''}` : 'No registrada'}</span>
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
      </div>

      ${pendingSectionHtml}

      ${isFemale ? (() => {
        const addDaysLocal = (dateStr, days) => {
          const d = new Date((dateStr || getLocalToday()) + 'T12:00:00');
          d.setDate(d.getDate() + days);
          return d.toISOString().split('T')[0];
        };
        const formatMonthsDays = (fromYmd, toYmd) => {
          if (!fromYmd || !toYmd || toYmd <= fromYmd) return '0 días';
          const [y1, m1, d1] = fromYmd.split('-').map(Number);
          const [y2, m2, d2] = toYmd.split('-').map(Number);
          let months = (y2 - y1) * 12 + (m2 - m1);
          let days = d2 - d1;
          if (days < 0) {
            months -= 1;
            const prevMonthLastDay = new Date(y2, m2 - 1, 0).getDate();
            days += prevMonthLastDay;
          }
          const parts = [];
          if (months > 0) parts.push(`${months} ${months === 1 ? 'mes' : 'meses'}`);
          if (days > 0 || parts.length === 0) parts.push(`${days} ${days === 1 ? 'día' : 'días'}`);
          return parts.join(' y ');
        };

        const pastPregnancies = activePreg
          ? pregnancies.filter(p => p.id !== activePreg.id)
          : pregnancies;

        const prenezListHtml = pastPregnancies.slice(0, 5).map(p => {
          const estado = p.estado || 'Preñada';
          const badgeClass = estado === 'Parida' ? 'badge-ok' : (estado === 'Preñada' ? 'badge-pending' : '');
          const badgeStyle = estado === 'Abortada' ? 'background:#ffebee;color:#c62828;' : '';
          const fMontaStr = formatFecha(p.fecha_monta);
          const fPartoStr = p.estado === 'Parida' && p.fecha_parto
            ? `Parto: ${formatFecha(p.fecha_parto)}${p.num_crias ? ` (${p.num_crias} cría${p.num_crias > 1 ? 's' : ''})` : ''}`
            : `Est. parto: ${formatFecha(p.fecha_probable_parto || addDaysLocal(p.fecha_monta, 283))}`;
          return `
            <div class="sheet-peso-swipe-wrap" data-record-id="${escapeHtml(p.id)}" data-record-type="prenez">
              <button type="button" class="sheet-peso-delete-bg" aria-label="Eliminar preñez">
                <span class="material-icons">delete</span>
                <span>Eliminar</span>
              </button>
              <div class="sheet-tag-row sheet-peso-swipe-card" style="padding: 7px 10px;">
                <div style="min-width: 0; flex: 1;">
                  <div style="font-weight: 800; color: #1e3e2b; font-size: 12px;">Monta: ${escapeHtml(fMontaStr)}</div>
                  <div style="color: #666; font-size: 10.5px; margin-top: 1px;">${escapeHtml(fPartoStr)}</div>
                </div>
                <span class="${badgeClass}" style="font-size: 9.5px; padding: 2px 7px; border-radius: 999px; font-weight: 800; ${badgeStyle}">${escapeHtml(estado)}</span>
              </div>
            </div>
          `;
        }).join('');

        let activeBannerHtml = '';
        if (activePreg) {
          const todayLocal = getLocalToday();
          const fPartoProb = activePreg.fecha_probable_parto || addDaysLocal(activePreg.fecha_monta, 283);
          const diffRest = Math.ceil((new Date(fPartoProb + 'T00:00:00') - new Date(todayLocal + 'T00:00:00')) / 86400000);
          const diasTrans = activePreg.fecha_monta
            ? Math.max(0, Math.floor((new Date(todayLocal + 'T00:00:00') - new Date(activePreg.fecha_monta + 'T00:00:00')) / 86400000))
            : 0;
          const pct = Math.max(0, Math.min(100, Math.round((diasTrans / 283) * 100)));
          const mesActual = Math.min(9, Math.max(1, Math.floor(diasTrans / 30.44) + 1));
          const elapsedStr = activePreg.fecha_monta ? formatMonthsDays(activePreg.fecha_monta, todayLocal) : `${diasTrans} días`;
          const remainingStr = diffRest > 0
            ? formatMonthsDays(todayLocal, fPartoProb)
            : (diffRest === 0 ? '¡Parto hoy!' : `Atrasado ${Math.abs(diffRest)} días`);

          activeBannerHtml = `
            <div class="sheet-gestation-card sheet-collapsible-card" data-collapsible="gestacion">
              <div class="sheet-collapsible-trigger sheet-gestation-trigger" role="button" tabindex="0" aria-expanded="false">
                <div class="sheet-gestation-top">
                  <span class="sheet-gestation-pill">Gestación en curso</span>
                  <div class="sheet-gestation-top-right">
                    <span class="sheet-gestation-pct">${pct} %</span>
                    <button type="button" class="sheet-gestation-edit-icon" data-open-sheet="edit-prenez" title="Editar preñez" aria-label="Editar preñez">
                      <span class="material-icons">edit</span>
                    </button>
                    <span class="material-icons sheet-collapsible-chevron">chevron_right</span>
                  </div>
                </div>
                <div class="sheet-gestation-month-row">
                  <span class="sheet-gestation-month">Mes ${mesActual}</span>
                  <span class="sheet-gestation-of">de 9</span>
                </div>
                <div class="sheet-gestation-sub">Monta ${escapeHtml(formatFecha(activePreg.fecha_monta))} · ${escapeHtml(elapsedStr)}</div>
                <div class="sheet-gestation-progress">
                  <div class="sheet-gestation-progress-fill" style="width: ${pct}%;"></div>
                </div>
              </div>
              <div class="sheet-collapsible-body sheet-gestation-body">
                <div class="sheet-gestation-info-box">
                  <div>
                    <span class="sheet-gestation-info-label">PARTO ESTIMADO</span>
                    <span class="sheet-gestation-info-val is-accent">${escapeHtml(formatFecha(fPartoProb))}</span>
                  </div>
                  <div>
                    <span class="sheet-gestation-info-label">FALTAN</span>
                    <span class="sheet-gestation-info-val">${escapeHtml(remainingStr)}</span>
                  </div>
                </div>
                <div class="sheet-gestation-actions">
                  <button type="button" class="sheet-gestation-btn sheet-gestation-btn--primary" data-open-sheet="parto-prenez">Registrar parto</button>
                  <button type="button" class="sheet-gestation-btn sheet-gestation-btn--abort" data-open-sheet="abort-prenez">Aborto</button>
                </div>
              </div>
            </div>
          `;
        }

        if (activePreg && pastPregnancies.length === 0) {
          return activeBannerHtml;
        }

        return `
          <!-- Preñez / Reproducción (Hembras) -->
          ${activeBannerHtml}
          <div class="sheet-detail-card">
            <div class="sheet-detail-card-header-row" style="margin-bottom: 10px;">
              <div class="sheet-detail-card-title" style="margin-bottom: 0;">
                <img src="/cow.png" style="width: 18px; height: 18px; object-fit: contain;">
                <span>${activePreg ? 'Historial de Preñez' : 'Preñez y Reproducción'}</span>
              </div>
              ${!activePreg ? `
                <button type="button" class="sheet-card-add-btn" data-open-sheet="add-prenez">
                  <span class="material-icons">add</span>
                  <span>Registrar preñez</span>
                </button>
              ` : ''}
            </div>
            <div class="sheet-tag-list" style="gap: 6px;">
              ${prenezListHtml || '<p style="font-size: 11.5px; color: #888; margin: 0;">Sin registros de preñez</p>'}
            </div>
          </div>
        `;
      })() : ''}

      <!-- Control de Peso -->
      <div class="sheet-detail-card sheet-collapsible-card sheet-peso-card ${isPesoInitiallyOpen ? 'is-open' : ''}" data-collapsible="peso">
        <button type="button" class="sheet-collapsible-trigger" aria-expanded="${isPesoInitiallyOpen ? 'true' : 'false'}">
          <div class="sheet-collapsible-summary">
            <div class="sheet-collapsible-eyebrow">PESO ACTUAL</div>
            <div class="sheet-collapsible-weight-row">
              <span class="sheet-collapsible-weight-val">${escapeHtml(pesoActual)} ${escapeHtml(pesoUnidad)}</span>
              ${pesoDateStr ? `<span class="sheet-collapsible-weight-date">· ${escapeHtml(pesoDateStr)}</span>` : ''}
            </div>
            ${pesoCollapsedSubHtml}
          </div>
          <span class="material-icons sheet-collapsible-chevron">chevron_right</span>
        </button>
        <div class="sheet-collapsible-body">
          ${buildPesoExpandedBodyHtml()}
        </div>
      </div>

      <!-- Vacunas -->
      <div class="sheet-detail-card sheet-collapsible-card" data-collapsible="vacunas">
        <button type="button" class="sheet-collapsible-trigger" aria-expanded="false">
          <div class="sheet-collapsible-summary">
            <div class="sheet-collapsible-title">Vacunas</div>
            <div class="sheet-collapsible-sub">${escapeHtml(vacunasSummary)}</div>
          </div>
          <span class="material-icons sheet-collapsible-chevron">chevron_right</span>
        </button>
        <div class="sheet-collapsible-body">
          <div class="sheet-tag-list" style="gap: 6px;">
            ${vacunasHtml}
          </div>
        </div>
      </div>

      <!-- Fumigaciones -->
      <div class="sheet-detail-card sheet-collapsible-card" data-collapsible="fumig">
        <button type="button" class="sheet-collapsible-trigger" aria-expanded="false">
          <div class="sheet-collapsible-summary">
            <div class="sheet-collapsible-title">Fumigaciones / baños</div>
            <div class="sheet-collapsible-sub">${escapeHtml(fumigSummary)}</div>
          </div>
          <span class="material-icons sheet-collapsible-chevron">chevron_right</span>
        </button>
        <div class="sheet-collapsible-body">
          <div class="sheet-tag-list" style="gap: 6px;">
            ${fumigHtml}
          </div>
        </div>
      </div>
    `;

    detailsContainer.querySelectorAll('.sheet-collapsible-trigger').forEach((trigger) => {
      trigger.addEventListener('click', (e) => {
        if (e.target.closest('.sheet-gestation-edit-icon')) return;
        const card = trigger.closest('.sheet-collapsible-card');
        if (!card) return;
        const isOpen = card.classList.toggle('is-open');
        trigger.setAttribute('aria-expanded', String(isOpen));
        if (isOpen && card.dataset.collapsible === 'peso') {
          const selBar = card.querySelector('.sheet-peso-bar-btn.is-selected');
          selBar?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        }
      });
    });

    if (isPesoInitiallyOpen) {
      const selBar = detailsContainer.querySelector('.sheet-peso-card .sheet-peso-bar-btn.is-selected');
      requestAnimationFrame(() => selBar?.scrollIntoView({ behavior: 'auto', block: 'nearest', inline: 'end' }));
    }

    const reloadDetails = (reloadOpts = {}) => {
      loadAnimalDetails(animalId, sheet, itemsHtml, originalButtons, attachActionHandlers, reloadOpts);
      notifyParentRefresh();
    };

    detailsContainer.querySelectorAll('.sheet-peso-bar-btn').forEach((barBtn) => {
      barBtn.addEventListener('click', () => {
        const idx = parseInt(barBtn.dataset.pesoIdx, 10);
        if (isNaN(idx) || !pesoStats[idx]) return;
        selectedPesoIdx = idx;
        detailsContainer.querySelectorAll('.sheet-peso-bar-btn').forEach((b) => {
          const active = parseInt(b.dataset.pesoIdx, 10) === idx;
          b.classList.toggle('is-selected', active);
          b.setAttribute('aria-pressed', active ? 'true' : 'false');
        });
      });
    });

    detailsContainer.querySelectorAll('.sheet-peso-edit-btn').forEach((editBtn) => {
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        const pesoId = editBtn.dataset.editPesoId;
        const pObj = pesajes.find(p => String(p.id) === String(pesoId));
        if (pObj) {
          openPesoDetailSheet(a, pObj, pesoUnidad, pesoStats.length, reloadDetails);
        }
      });
    });

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
        },
        prenez: {
          table: 'animal_preñez',
          prompt: '¿Deseas eliminar este registro de preñez?',
          success: 'Registro de preñez eliminado ✓',
          error: 'Error al eliminar registro de preñez'
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
            if (recordType === 'prenez') {
              const remainingActive = pregnancies.find(p => p.id !== recordId && p.estado === 'Preñada');
              if (!remainingActive && activePreg?.id === recordId) {
                await restFetch(`/rest/v1/ganado?id=eq.${encodeURIComponent(animalId)}`, {
                  method: 'PATCH',
                  body: JSON.stringify({ reproductivo: 'Vacía' })
                }).catch(() => {});
              }
            }
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

    // Bind Pending card actions (Aplicar / Editar / Cancelar)
    detailsContainer.querySelectorAll('.sheet-pending-card [data-pending-action]').forEach(btnEl => {
      btnEl.addEventListener('click', async (e) => {
        e.stopPropagation();
        const card = btnEl.closest('.sheet-pending-card');
        const pId = card?.dataset.pendingId;
        const pType = card?.dataset.pendingType;
        const action = btnEl.dataset.pendingAction;
        const pItem = pendingItems.find(x => String(x.id) === String(pId) && x.type === pType);
        if (!pItem) return;

        const table = pType === 'vacuna' ? 'animal_vacunas' : 'animal_fumigaciones';

        if (action === 'apply') {
          btnEl.disabled = true;
          try {
            const payload = { estado: 'Aplicada' };
            await restFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(pId)}`, {
              method: 'PATCH',
              body: JSON.stringify(payload)
            });
            if (db[table]) {
              const existing = await db[table].get(pId).catch(() => null);
              if (existing) await db[table].put({ ...existing, ...payload }).catch(() => {});
            }
            syncTable(table);
            if (pType === 'vacuna') {
              sendWhatsApp(
                '✅ Vacuna Aplicada\nAnimal: ' + (a.nombre || 'Animal') +
                '\nVacuna: ' + pItem.titulo +
                '\nDosis: ' + (pItem.dosis || 'N/A') +
                '\nFecha: ' + (pItem.fecha || getLocalToday()) +
                '\nFinca: ' + (window._empresaNombre || '')
              );
            } else {
              sendWhatsApp(
                '✅ Fumigación Aplicada\nAnimal: ' + (a.nombre || 'Animal') +
                '\nProducto: ' + pItem.titulo +
                '\nDosis: ' + (pItem.dosis || 'N/A') +
                '\nFecha: ' + (pItem.fecha || getLocalToday()) +
                '\nFinca: ' + (window._empresaNombre || '')
              );
            }
            showSnackbar(`${pItem.tipoLabel} marcada como Aplicada ✓`);
            reloadDetails();
          } catch (err) {
            showSnackbar(err.message || 'Error al aplicar', 'error');
            btnEl.disabled = false;
          }
        } else if (action === 'edit') {
          if (pType === 'vacuna') {
            openVacunaDetailSheet(a, pItem.raw, reloadDetails);
          } else {
            openFumigDetailSheet(a, pItem.raw, reloadDetails);
          }
        } else if (action === 'cancel') {
          window.Snackbar.confirm(`¿Cancelar "${pItem.titulo}" programada?`, async () => {
            try {
              const payload = { estado: 'Cancelada' };
              await restFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(pId)}`, {
                method: 'PATCH',
                body: JSON.stringify(payload)
              });
              if (db[table]) {
                const existing = await db[table].get(pId).catch(() => null);
                if (existing) await db[table].put({ ...existing, ...payload }).catch(() => {});
              }
              syncTable(table);
              showSnackbar(`${pItem.tipoLabel} cancelada ✓`);
              reloadDetails();
            } catch (err) {
              showSnackbar(err.message || 'Error al cancelar', 'error');
            }
          });
        }
      });
    });

    // Bind "+ Registrar" footer pills and Preñez buttons (use onclick to avoid duplicate handlers on reload)
    sheet.querySelectorAll('[data-open-sheet]').forEach(btnEl => {
      btnEl.onclick = (e) => {
        e.stopPropagation();
        const action = btnEl.dataset.openSheet;
        if (action === 'add-peso') openPesoFormSheet(a, pesoActual, pesoUnidad, reloadDetails);
        else if (action === 'add-vacuna') openVacunaFormSheet(a, pesoActual, reloadDetails);
        else if (action === 'add-fumig') openFumigFormSheet(a, pesoActual, reloadDetails);
        else if (action === 'add-prenez') openPrenezFormSheet(a, pesoActual, reloadDetails);
        else if (action === 'edit-prenez' && activePreg) openEditPrenezFormSheet(a, activePreg, pregnancies, pesoActual, reloadDetails);
        else if (action === 'parto-prenez' && activePreg) openPartoFormSheet(a, activePreg, pesoActual, reloadDetails);
        else if (action === 'abort-prenez' && activePreg) handleAbortPrenezInSheet(a, activePreg, reloadDetails);
      };
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

        const { data: insertedData, error } = await supabase.from('animal_pesajes').insert({
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
        const insertedId = insertedData?.id || (Array.isArray(insertedData) ? insertedData[0]?.id : null);
        if (onReload) onReload({ expandPeso: true, selectPesoId: insertedId });
      } catch (err) {
        showSnackbar(err.message || 'Error al registrar pesaje', 'error');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  });
}

function openPesoDetailSheet(animal, pesaje, pesoUnidad, totalPesajes, onReload) {
  const today = getLocalToday();
  const isLastPesaje = totalPesajes <= 1;
  const html = `
    <div class="m3-sub-sheet-header">
      <div class="m3-sub-sheet-icon">
        <span class="material-icons">scale</span>
      </div>
      <div>
        <h4 class="m3-sub-sheet-title">Editar Pesaje</h4>
        <p class="m3-sub-sheet-subtitle">${escapeHtml(animal.nombre || 'Animal')} • ${formatFecha(pesaje.fecha)}</p>
      </div>
    </div>
    <form id="sub-sheet-edit-peso" class="m3-sub-sheet-form">
      <div class="m3-field">
        <input type="number" step="0.1" min="0.1" name="peso" value="${escapeHtml(pesaje.peso)}" placeholder=" " required autocomplete="off">
        <label>Peso (${escapeHtml(pesoUnidad)})</label>
      </div>
      ${renderWeekDatePickerHtml('sub-peso-edit-fecha', pesaje.fecha || today)}
      <div class="m3-sub-sheet-actions-split">
        <button type="button" class="btn-m3-tonal sub-sheet-btn-delete" id="sub-peso-delete" ${isLastPesaje ? 'aria-disabled="true" title="No puedes eliminar el último pesaje"' : ''}>
          <span class="material-icons" style="font-size: 18px;">delete_outline</span>
          <span>Eliminar este registro</span>
        </button>
        <button type="submit" class="btn-m3-fill" id="sub-peso-save" style="flex: 1; justify-content: center;">
          <span class="material-icons" style="font-size: 18px;">save</span>
          <span>Guardar cambios</span>
        </button>
      </div>
    </form>
  `;

  openSubBottomSheet(html, (subSheet) => {
    attachWeekDatePicker(subSheet, 'sub-peso-edit-fecha', today, null, { mode: 'peso' });

    subSheet.querySelector('#sub-peso-delete')?.addEventListener('click', () => {
      if (isLastPesaje) {
        showSnackbar('No puedes eliminar el último pesaje que queda', 'error');
        return;
      }
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
          if (onReload) onReload({ expandPeso: true });
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
        const pesoVal = Math.round((parseFloat(formData.get('peso')) || 0) * 10) / 10;
        const fechaPeso = formData.get('fecha');
        if (isNaN(pesoVal) || pesoVal <= 0) {
          showSnackbar('Ingresa un peso válido mayor a 0 kg', 'error');
          if (saveBtn) saveBtn.disabled = false;
          return;
        }
        if (!fechaPeso || fechaPeso > today) {
          showSnackbar('La fecha de pesaje debe ser hoy o anterior', 'error');
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
        if (onReload) onReload({ expandPeso: true, selectPesoId: pesaje.id });
      } catch (err) {
        showSnackbar(err.message || 'Error al actualizar pesaje', 'error');
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  });
}

// ─── Catálogo de Vacunas y Productos con Dosis por Peso (Supabase DB + Cache) ─

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

async function persistCatalogItemToSupabase(type, cleanName, numKgPorMl, dosisMl = 0, rawKg = 0) {
  try {
    const empId = window._currentEmpresaId || localStorage.getItem('current_empresa_id');
    if (!empId) return;
    const isVac = type === 'vacunas';
    const table = isVac ? 'animal_vacunas' : 'animal_fumigaciones';
    const nameField = isVac ? 'nombre' : 'producto';
    const hasKg = numKgPorMl > 0;
    const effectiveRawKg = rawKg > 0 ? rawKg : numKgPorMl;
    const effectiveMl = dosisMl > 0 ? dosisMl : 1;
    const dosisVal = hasKg ? String(numKgPorMl) : (dosisMl > 0 ? `${dosisMl} ml` : '');
    const obsText = hasKg ? `${effectiveMl} ml cada ${effectiveRawKg} kg` : (dosisMl > 0 ? `${dosisMl} ml` : '');

    // Check if a Catalogo row already exists in Supabase for this name
    let queryUrl = `/rest/v1/${table}?estado=eq.Catalogo&${nameField}=ilike.${encodeURIComponent(cleanName)}&empresa_id=eq.${encodeURIComponent(empId)}&select=id`;
    const existing = await restFetch(queryUrl).catch(() => []);

    if (Array.isArray(existing) && existing.length > 0 && existing[0]?.id) {
      await restFetch(`/rest/v1/${table}?id=eq.${encodeURIComponent(existing[0].id)}`, {
        method: 'PATCH',
        body: JSON.stringify({
          [nameField]: cleanName,
          dosis: dosisVal,
          observaciones: obsText
        })
      });
    } else {
      await supabase.from(table).insert({
        animal_id: null,
        empresa_id: empId,
        [nameField]: cleanName,
        dosis: dosisVal,
        observaciones: obsText,
        fecha: getLocalToday(),
        estado: 'Catalogo'
      });
    }
  } catch (err) {
    console.warn('Error guardando catálogo en Supabase:', err);
  }
}

async function syncDosisCatalogFromSupabase(type) {
  const localList = getDosisCatalog(type);
  try {
    const empId = window._currentEmpresaId || localStorage.getItem('current_empresa_id');
    if (!empId) return localList;
    const isVac = type === 'vacunas';
    const table = isVac ? 'animal_vacunas' : 'animal_fumigaciones';
    const nameField = isVac ? 'nombre' : 'producto';

    const rows = await restFetch(
      `/rest/v1/${table}?empresa_id=eq.${encodeURIComponent(empId)}&estado=eq.Catalogo&order=created_at.desc&select=id,${nameField},dosis,observaciones`
    ).catch(() => []);

    const dbMap = new Map();
    for (const r of (rows || [])) {
      const n = (r[nameField] || '').trim();
      if (!n || dbMap.has(n.toLowerCase())) continue;
      const obsMatch = (r.observaciones || '').match(/(\d+(?:\.\d+)?)\s*ml\s*cada\s*(\d+(?:\.\d+)?)\s*kg/i);
      const mlOnlyMatch = String(r.dosis || '').match(/^(\d+(?:\.\d+)?)\s*ml$/i);
      if (obsMatch) {
        const dosisMl = parseFloat(obsMatch[1]);
        const rawKg = parseFloat(obsMatch[2]);
        const kgPorMl = parseFloat(r.dosis) || Number((rawKg / dosisMl).toFixed(4));
        dbMap.set(n.toLowerCase(), { nombre: n, kgPorMl, dosisMl, kg: rawKg });
      } else if (mlOnlyMatch) {
        const dosisMl = parseFloat(mlOnlyMatch[1]);
        if (!isNaN(dosisMl) && dosisMl > 0) {
          dbMap.set(n.toLowerCase(), { nombre: n, kgPorMl: 0, dosisMl, kg: 0 });
        }
      } else {
        const kg = parseFloat(r.dosis);
        if (!isNaN(kg) && kg > 0) {
          dbMap.set(n.toLowerCase(), { nombre: n, kgPorMl: kg, dosisMl: 1, kg });
        } else {
          dbMap.set(n.toLowerCase(), { nombre: n, kgPorMl: 0, dosisMl: 0, kg: 0 });
        }
      }
    }

    // Automatically push any local items not yet in Supabase DB so nothing is lost
    for (const loc of localList) {
      const n = (loc.nombre || '').trim();
      const kg = parseFloat(loc.kgPorMl) || 0;
      const dMl = parseFloat(loc.dosisMl) || 0;
      if (n && !dbMap.has(n.toLowerCase())) {
        const rKg = parseFloat(loc.kg) || kg;
        dbMap.set(n.toLowerCase(), { nombre: n, kgPorMl: kg, dosisMl: dMl, kg: rKg });
        persistCatalogItemToSupabase(type, n, kg, dMl, rKg);
      }
    }

    const merged = Array.from(dbMap.values());
    try {
      localStorage.setItem(getCatalogStorageKey(type), JSON.stringify(merged));
    } catch {}
    return merged;
  } catch {
    return localList;
  }
}

function saveToDosisCatalog(type, nombre, kgPorMl, dosisMl = 0, rawKg = 0) {
  const cleanName = (nombre || '').trim();
  const numKg = parseFloat(kgPorMl) || 0;
  const numMl = parseFloat(dosisMl) || 0;
  const numRawKg = parseFloat(rawKg) || 0;
  if (!cleanName) return getDosisCatalog(type);
  const list = getDosisCatalog(type);
  const entry = { nombre: cleanName, kgPorMl: numKg, dosisMl: numMl, kg: numRawKg };
  const existingIdx = list.findIndex(item => item.nombre.toLowerCase() === cleanName.toLowerCase());
  if (existingIdx >= 0) {
    list[existingIdx] = entry;
  } else {
    list.unshift(entry);
  }
  try {
    localStorage.setItem(getCatalogStorageKey(type), JSON.stringify(list));
  } catch {}
  persistCatalogItemToSupabase(type, cleanName, numKg, entry.dosisMl, numRawKg);
  return list;
}

function deleteFromDosisCatalog(type, nombre) {
  const cleanName = (nombre || '').trim();
  if (!cleanName) return getDosisCatalog(type);
  const list = getDosisCatalog(type).filter(
    item => (item.nombre || '').trim().toLowerCase() !== cleanName.toLowerCase()
  );
  try {
    localStorage.setItem(getCatalogStorageKey(type), JSON.stringify(list));
  } catch {}
  try {
    const empId = window._currentEmpresaId || localStorage.getItem('current_empresa_id');
    if (empId) {
      const isVac = type === 'vacunas';
      const table = isVac ? 'animal_vacunas' : 'animal_fumigaciones';
      const nameField = isVac ? 'nombre' : 'producto';
      restFetch(
        `/rest/v1/${table}?estado=eq.Catalogo&${nameField}=ilike.${encodeURIComponent(cleanName)}&empresa_id=eq.${encodeURIComponent(empId)}`,
        { method: 'DELETE' }
      ).catch(() => {});
    }
  } catch {}
  return list;
}

function openCatalogNewBottomSheet(type, onSaved) {
  const isVac = type === 'vacunas';
  const title = isVac ? 'Nueva Vacuna' : 'Nuevo Producto';
  const nameLabel = isVac ? 'Nombre de la nueva vacuna' : 'Nombre del nuevo producto';
  const submitLabel = isVac ? 'Guardar nueva vacuna' : 'Guardar nuevo producto';

  document.getElementById('m3-catalog-new-scrim')?.remove();
  document.getElementById('m3-catalog-new-sheet')?.remove();

  const scrim = document.createElement('div');
  scrim.id = 'm3-catalog-new-scrim';
  scrim.className = 'm3-sub-action-sheet-scrim';
  scrim.style.zIndex = '10010';

  const sheet = document.createElement('div');
  sheet.id = 'm3-catalog-new-sheet';
  sheet.className = 'm3-sub-action-sheet';
  sheet.style.zIndex = '10011';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  sheet.innerHTML = `
    <button type="button" class="m3-action-sheet-close-btn" id="catalog-new-close" aria-label="Cerrar">
      <span class="material-icons">close</span>
    </button>
    <div class="m3-action-sheet-handle-box">
      <div class="m3-action-sheet-handle"></div>
    </div>
    <div class="m3-sub-sheet-header">
      <div class="m3-sub-sheet-icon">
        <span class="material-icons">${isVac ? 'vaccines' : 'pest_control'}</span>
      </div>
      <div style="flex: 1; min-width: 0;">
        <h4 class="m3-sub-sheet-title">${title}</h4>
        <p class="m3-sub-sheet-subtitle">Elige cómo calcular o guardar su dosis</p>
      </div>
    </div>
    <div class="m3-segmented-tabs" role="tablist">
      <button type="button" class="m3-seg-tab is-active" data-cat-tab="peso" role="tab" aria-selected="true">Por peso (1 ml / kg)</button>
      <button type="button" class="m3-seg-tab" data-cat-tab="fija" role="tab" aria-selected="false">Dosis fija (ml)</button>
    </div>
    <form id="catalog-new-form" class="m3-sub-sheet-form" novalidate>
      <div class="m3-field-group">
        <div class="m3-field" id="catalog-new-nombre-field">
          <input type="text" id="catalog-new-nombre" placeholder=" " autocomplete="off">
          <label>${nameLabel}</label>
        </div>
        <div class="m3-field-error" id="catalog-new-nombre-error" role="alert"></div>
      </div>
      <div class="m3-field-group" id="catalog-new-kg-group">
        <div class="m3-field" id="catalog-new-kg-field">
          <input type="number" step="any" min="0.01" id="catalog-new-kg" placeholder=" " autocomplete="off">
          <label>Peso en kg por cada 1 ml (ej. 50)</label>
        </div>
        <div class="m3-field-error" id="catalog-new-kg-error" role="alert"></div>
      </div>
      <div class="m3-field-group" id="catalog-new-ml-group" style="display: none;">
        <div class="m3-field" id="catalog-new-ml-field">
          <input type="number" step="any" min="0.01" id="catalog-new-ml" placeholder=" " autocomplete="off">
          <label>Dosis (ml) (opcional)</label>
        </div>
        <div class="m3-field-error" id="catalog-new-ml-error" role="alert"></div>
      </div>
      <div class="m3-sub-sheet-actions">
        <button type="button" class="btn-m3-tonal" id="catalog-new-cancel">Cancelar</button>
        <button type="submit" class="btn-m3-fill">
          <span class="material-icons" style="font-size: 18px;">save</span>
          <span>${submitLabel}</span>
        </button>
      </div>
    </form>
  `;

  document.body.appendChild(scrim);
  document.body.appendChild(sheet);

  const closeCatSheet = () => {
    sheet.classList.remove('open');
    scrim.classList.remove('open');
    setTimeout(() => {
      scrim.remove();
      sheet.remove();
    }, 260);
  };

  scrim.onclick = closeCatSheet;
  sheet.querySelector('#catalog-new-close')?.addEventListener('click', closeCatSheet);
  sheet.querySelector('#catalog-new-cancel')?.addEventListener('click', closeCatSheet);

  let activeTab = 'peso';
  const nameInput = sheet.querySelector('#catalog-new-nombre');
  const nameField = sheet.querySelector('#catalog-new-nombre-field');
  const nameError = sheet.querySelector('#catalog-new-nombre-error');
  const kgGroup = sheet.querySelector('#catalog-new-kg-group');
  const kgInput = sheet.querySelector('#catalog-new-kg');
  const kgField = sheet.querySelector('#catalog-new-kg-field');
  const kgError = sheet.querySelector('#catalog-new-kg-error');
  const mlGroup = sheet.querySelector('#catalog-new-ml-group');
  const mlInput = sheet.querySelector('#catalog-new-ml');
  const mlField = sheet.querySelector('#catalog-new-ml-field');
  const mlError = sheet.querySelector('#catalog-new-ml-error');

  const setFieldError = (fieldEl, errorEl, msg) => {
    if (fieldEl) fieldEl.classList.toggle('is-error', Boolean(msg));
    if (errorEl) errorEl.textContent = msg || '';
  };

  sheet.querySelectorAll('.m3-seg-tab').forEach((tabBtn) => {
    tabBtn.addEventListener('click', () => {
      const next = tabBtn.dataset.catTab;
      if (!next || next === activeTab) return;
      activeTab = next;
      sheet.querySelectorAll('.m3-seg-tab').forEach((b) => {
        const isOn = b.dataset.catTab === activeTab;
        b.classList.toggle('is-active', isOn);
        b.setAttribute('aria-selected', String(isOn));
      });
      if (kgGroup) kgGroup.style.display = activeTab === 'peso' ? '' : 'none';
      if (mlGroup) mlGroup.style.display = activeTab === 'fija' ? '' : 'none';
      setFieldError(kgField, kgError, '');
      setFieldError(mlField, mlError, '');
    });
  });

  nameInput?.addEventListener('input', () => setFieldError(nameField, nameError, ''));
  kgInput?.addEventListener('input', () => setFieldError(kgField, kgError, ''));
  mlInput?.addEventListener('input', () => setFieldError(mlField, mlError, ''));

  sheet.querySelector('#catalog-new-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    const newName = (nameInput?.value || '').trim();
    let hasError = false;
    let firstInvalidInput = null;

    if (!newName) {
      setFieldError(nameField, nameError, isVac ? 'Escribe el nombre de la vacuna' : 'Escribe el nombre del producto');
      hasError = true;
      firstInvalidInput = firstInvalidInput || nameInput;
    } else {
      setFieldError(nameField, nameError, '');
    }

    if (activeTab === 'peso') {
      const rawKgStr = (kgInput?.value || '').trim();
      const newKg = parseFloat(rawKgStr);
      if (!rawKgStr || isNaN(newKg) || newKg <= 0) {
        setFieldError(kgField, kgError, 'Escribe los kg por 1 ml (ej. 50)');
        hasError = true;
        firstInvalidInput = firstInvalidInput || kgInput;
      } else {
        setFieldError(kgField, kgError, '');
      }

      if (hasError) {
        firstInvalidInput?.focus();
        return;
      }

      const updatedList = saveToDosisCatalog(type, newName, newKg, 1, newKg);
      closeCatSheet();
      showSnackbar(`${isVac ? 'Vacuna' : 'Producto'} "${newName}" guardado ✓`);
      if (typeof onSaved === 'function') {
        onSaved(updatedList, { nombre: newName, kgPorMl: newKg, dosisMl: 1, kg: newKg });
      }
      return;
    }

    // Vista 2: Dosis fija (Nombre + ml opcional)
    const rawMl = (mlInput?.value || '').trim();
    let dosisMl = 0;
    if (rawMl !== '') {
      const parsedMl = parseFloat(rawMl);
      if (isNaN(parsedMl) || parsedMl <= 0) {
        setFieldError(mlField, mlError, 'La dosis debe ser mayor a 0');
        hasError = true;
        firstInvalidInput = firstInvalidInput || mlInput;
      } else {
        dosisMl = parsedMl;
        setFieldError(mlField, mlError, '');
      }
    } else {
      setFieldError(mlField, mlError, '');
    }

    if (hasError) {
      firstInvalidInput?.focus();
      return;
    }

    const updatedList = saveToDosisCatalog(type, newName, 0, dosisMl, 0);
    closeCatSheet();
    showSnackbar(`${isVac ? 'Vacuna' : 'Producto'} "${newName}" guardado ✓`);
    if (typeof onSaved === 'function') {
      onSaved(updatedList, { nombre: newName, kgPorMl: 0, dosisMl, kg: 0 });
    }
  });

  scrim.style.display = 'block';
  sheet.style.display = 'block';
  requestAnimationFrame(() => {
    scrim.classList.add('open');
    sheet.classList.add('open');
    setTimeout(() => sheet.querySelector('#catalog-new-nombre')?.focus(), 180);
  });
}

function renderWeekDatePickerHtml(inputId, initialDate) {
  return `
    <div class="sheet-date-picker" data-picker-for="${inputId}">
      <input type="hidden" name="fecha" id="${inputId}" value="${escapeHtml(initialDate)}" required>
      <div class="sheet-date-picker-label">Fecha</div>
      <div class="sheet-date-picker-box">
        <div class="sheet-date-picker-nav">
          <button type="button" class="sheet-dp-nav-btn" data-dp-action="prev" aria-label="Anterior">‹</button>
          <div class="sheet-dp-current-label"></div>
          <button type="button" class="sheet-dp-nav-btn" data-dp-action="next" aria-label="Siguiente">›</button>
          <button type="button" class="sheet-dp-pill-btn" data-dp-action="toggle-mode">Ver mes</button>
        </div>
        <div class="sheet-dp-grid"></div>
      </div>
      <div class="sheet-date-picker-hint"></div>
    </div>
  `;
}

function attachWeekDatePicker(container, inputId, todayStr, onDateChange, opts = {}) {
  const root = container.querySelector(`.sheet-date-picker[data-picker-for="${inputId}"]`);
  const hiddenInput = container.querySelector(`#${inputId}`);
  if (!root || !hiddenInput) return;

  const labelEl = root.querySelector('.sheet-dp-current-label');
  const gridEl = root.querySelector('.sheet-dp-grid');
  const hintEl = root.querySelector('.sheet-date-picker-hint');
  const modeBtn = root.querySelector('[data-dp-action="toggle-mode"]');

  const DAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  const MON_SHORT = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const MON_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

  const parseYmd = (ymd) => {
    const [y, m, d] = (ymd || todayStr).split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1, 12, 0, 0);
  };
  const toYmd = (dt) => {
    const y = dt.getFullYear();
    const m = String(dt.getMonth() + 1).padStart(2, '0');
    const d = String(dt.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  };
  const addDays = (dt, days) => {
    const copy = new Date(dt);
    copy.setDate(copy.getDate() + days);
    return copy;
  };

  let selectedDate = hiddenInput.value || todayStr;
  let anchorDate = selectedDate;
  let viewMode = 'week';

  const render = () => {
    const selDt = parseYmd(selectedDate);
    const anchDt = parseYmd(anchorDate);

    if (hintEl) {
      const isFuture = selectedDate > todayStr;
      if (opts.mode === 'peso') {
        hintEl.innerHTML = isFuture
          ? '<span class="is-programada">Solo se permiten fechas de hoy o anteriores</span>'
          : `Pesaje del <span class="is-aplicada">${escapeHtml(formatFecha(selectedDate))}</span>`;
      } else {
        hintEl.innerHTML = isFuture
          ? `Se guardará como <span class="is-programada">Programada</span> para ${escapeHtml(formatFecha(selectedDate))}`
          : `Se guardará como <span class="is-aplicada">Aplicada</span> · ${escapeHtml(formatFecha(selectedDate))}`;
      }
    }

    if (modeBtn) {
      modeBtn.textContent = viewMode === 'week' ? 'Ver mes' : 'Ver semana';
    }

    if (viewMode === 'week') {
      if (labelEl) {
        labelEl.textContent = `${DAY_SHORT[selDt.getDay()]}, ${selDt.getDate()} ${MON_SHORT[selDt.getMonth()]}`;
      }
      // Monday-start week around anchorDate
      const dow = anchDt.getDay();
      const diffToMon = dow === 0 ? -6 : 1 - dow;
      const monday = addDays(anchDt, diffToMon);
      gridEl.className = 'sheet-dp-grid is-week';
      let daysHtml = '';
      for (let i = 0; i < 7; i++) {
        const d = addDays(monday, i);
        const ymd = toYmd(d);
        const isToday = ymd === todayStr;
        const isSelected = ymd === selectedDate;
        daysHtml += `
          <button type="button" class="sheet-dp-day ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}" data-dp-date="${ymd}">
            <span class="sheet-dp-day-name">${DAY_SHORT[d.getDay()]}</span>
            <span class="sheet-dp-day-num">${d.getDate()}</span>
          </button>
        `;
      }
      gridEl.innerHTML = daysHtml;
    } else {
      const year = anchDt.getFullYear();
      const month = anchDt.getMonth();
      if (labelEl) {
        labelEl.textContent = `${MON_FULL[month]} ${year}`;
      }
      const firstOfMonth = new Date(year, month, 1, 12, 0, 0);
      const firstDow = firstOfMonth.getDay();
      const leadDays = firstDow === 0 ? 6 : firstDow - 1;
      const gridStart = addDays(firstOfMonth, -leadDays);

      gridEl.className = 'sheet-dp-grid is-month';
      let html = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
        .map(w => `<div class="sheet-dp-weekday">${w}</div>`).join('');

      for (let i = 0; i < 42; i++) {
        const d = addDays(gridStart, i);
        const ymd = toYmd(d);
        const isOtherMonth = d.getMonth() !== month;
        const isToday = ymd === todayStr;
        const isSelected = ymd === selectedDate;
        html += `
          <button type="button" class="sheet-dp-day is-compact ${isOtherMonth ? 'is-muted' : ''} ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''}" data-dp-date="${ymd}">
            <span class="sheet-dp-day-num">${d.getDate()}</span>
          </button>
        `;
      }
      gridEl.innerHTML = html;
    }
  };

  const selectDate = (ymd) => {
    selectedDate = ymd;
    anchorDate = ymd;
    hiddenInput.value = ymd;
    hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    if (typeof onDateChange === 'function') onDateChange(ymd);
    render();
  };

  root.addEventListener('click', (e) => {
    const dayBtn = e.target.closest('[data-dp-date]');
    if (dayBtn) {
      selectDate(dayBtn.dataset.dpDate);
      return;
    }
    const actionBtn = e.target.closest('[data-dp-action]');
    if (!actionBtn) return;
    const action = actionBtn.dataset.dpAction;
    if (action === 'prev') {
      const dt = parseYmd(anchorDate);
      if (viewMode === 'week') anchorDate = toYmd(addDays(dt, -7));
      else anchorDate = toYmd(new Date(dt.getFullYear(), dt.getMonth() - 1, 1, 12, 0, 0));
      render();
    } else if (action === 'next') {
      const dt = parseYmd(anchorDate);
      if (viewMode === 'week') anchorDate = toYmd(addDays(dt, 7));
      else anchorDate = toYmd(new Date(dt.getFullYear(), dt.getMonth() + 1, 1, 12, 0, 0));
      render();
    } else if (action === 'today') {
      selectDate(todayStr);
    } else if (action === 'toggle-mode') {
      viewMode = viewMode === 'week' ? 'month' : 'week';
      anchorDate = selectedDate;
      render();
    }
  });

  render();
  if (typeof onDateChange === 'function') onDateChange(selectedDate);
}

// ─── Material 3 Filtering Autocomplete Dropdown ──────────────────────────────

function renderM3AutocompleteField({ id, label }) {
  return `
    <div class="m3-ac-wrap" id="${id}-wrap">
      <div class="m3-field">
        <input type="text" id="${id}-input" class="m3-ac-input" placeholder=" " autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list">
        <label>${escapeHtml(label)}</label>
        <button type="button" id="${id}-toggle" class="m3-ac-toggle" aria-label="Mostrar opciones">
          <span class="material-icons">arrow_drop_down</span>
        </button>
      </div>
      <div class="m3-ac-menu" id="${id}-menu" role="listbox"></div>
    </div>
  `;
}

function initM3Autocomplete(root, id, initialItems = [], { onSelect, onInput, onDelete } = {}) {
  const wrap = root.querySelector(`#${id}-wrap`);
  const input = root.querySelector(`#${id}-input`);
  const toggleBtn = root.querySelector(`#${id}-toggle`);
  const menu = root.querySelector(`#${id}-menu`);
  if (!wrap || !input || !toggleBtn || !menu) {
    return { updateItems: () => {} };
  }

  let items = Array.isArray(initialItems) ? initialItems : [];
  let selectedName = '';

  const renderMenu = (filterText = '') => {
    const q = (filterText || '').trim().toLowerCase();
    const filtered = q
      ? items.filter(it => (it.nombre || '').toLowerCase().includes(q) || String(it.kgPorMl || '').includes(q))
      : items;

    if (filtered.length === 0) {
      menu.innerHTML = `<div class="m3-ac-empty">${items.length === 0 ? 'Sin opciones guardadas aún' : 'Sin coincidencias'}</div>`;
      return;
    }

    menu.innerHTML = filtered.map((it, idx) => {
      const isSel = selectedName && (it.nombre || '').toLowerCase() === selectedName.toLowerCase();
      return `
        <div class="m3-ac-swipe-row" data-ac-row="${idx}">
          ${typeof onDelete === 'function' ? `
            <div class="m3-ac-swipe-bg" aria-hidden="true">
              <span class="material-icons" style="font-size: 18px;">delete_outline</span>
              <span>Eliminar</span>
            </div>
          ` : ''}
          <button type="button" class="m3-ac-option ${isSel ? 'is-selected' : ''}" data-ac-idx="${idx}" role="option" aria-selected="${isSel ? 'true' : 'false'}">
            ${isSel ? '<span class="material-icons m3-ac-option-check">check</span>' : '<span class="m3-ac-option-check" aria-hidden="true"></span>'}
            <span class="m3-ac-option-text">
              <span class="m3-ac-option-name">${escapeHtml(it.nombre)}</span>
              ${it.kgPorMl > 0 ? `<span class="m3-ac-option-sub">${it.dosisMl && it.kg ? `${escapeHtml(it.dosisMl)} ml cada ${escapeHtml(it.kg)} kg` : `1 ml cada ${escapeHtml(it.kgPorMl)} kg`}</span>` : (it.dosisMl > 0 ? `<span class="m3-ac-option-sub">${escapeHtml(it.dosisMl)} ml</span>` : '')}
            </span>
          </button>
        </div>
      `;
    }).join('');

    menu.querySelectorAll('.m3-ac-swipe-row').forEach((row, idx) => {
      const btn = row.querySelector('.m3-ac-option');
      const bg = row.querySelector('.m3-ac-swipe-bg');
      const chosen = filtered[idx];
      if (!btn || !chosen) return;

      let startX = 0;
      let startY = 0;
      let currentDx = 0;
      let isDragging = false;
      let didSwipe = false;

      if (typeof onDelete === 'function') {
        btn.addEventListener('pointerdown', (e) => {
          if (e.button && e.button !== 0) return;
          startX = e.clientX;
          startY = e.clientY;
          currentDx = 0;
          isDragging = false;
          didSwipe = false;
        });

        btn.addEventListener('pointermove', (e) => {
          if (startX === 0 && startY === 0) return;
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;

          if (!isDragging) {
            if (dx > 8 && Math.abs(dx) > Math.abs(dy) * 1.15) {
              isDragging = true;
              didSwipe = true;
              btn.style.transition = 'none';
              try { btn.setPointerCapture(e.pointerId); } catch {}
            } else if (Math.abs(dy) > 10) {
              startX = 0;
              startY = 0;
              return;
            }
          }

          if (isDragging) {
            currentDx = Math.max(0, Math.min(dx, row.offsetWidth || 260));
            btn.style.transform = `translateX(${currentDx}px)`;
            if (bg) bg.style.opacity = String(Math.min(1, currentDx / 70));
          }
        });

        const endSwipe = () => {
          if (!isDragging) {
            startX = 0;
            startY = 0;
            return;
          }
          isDragging = false;
          startX = 0;
          startY = 0;
          const threshold = Math.min(95, (row.offsetWidth || 240) * 0.32);
          btn.style.transition = 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)';

          if (currentDx >= threshold) {
            btn.style.transform = 'translateX(105%)';
            row.style.maxHeight = `${row.offsetHeight}px`;
            row.style.transition = 'max-height 0.2s ease, opacity 0.2s ease';
            requestAnimationFrame(() => {
              row.style.maxHeight = '0px';
              row.style.opacity = '0';
            });
            setTimeout(() => {
              const targetName = (chosen.nombre || '').toLowerCase();
              items = items.filter(it => (it.nombre || '').toLowerCase() !== targetName);
              if (selectedName.toLowerCase() === targetName) {
                selectedName = '';
                input.value = '';
                if (typeof onInput === 'function') onInput('');
              }
              const nextItems = onDelete(chosen);
              if (Array.isArray(nextItems)) items = nextItems;
              renderMenu(input.value);
            }, 200);
          } else {
            btn.style.transform = 'translateX(0)';
            if (bg) bg.style.opacity = '0';
            setTimeout(() => { didSwipe = false; }, 60);
          }
        };

        btn.addEventListener('pointerup', endSwipe);
        btn.addEventListener('pointercancel', endSwipe);
      }

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (didSwipe) {
          didSwipe = false;
          return;
        }
        selectedName = chosen.nombre || '';
        input.value = selectedName;
        closeMenu();
        if (typeof onSelect === 'function') onSelect(chosen);
      });
    });
  };

  const openMenu = (showAll = false) => {
    renderMenu(showAll ? '' : input.value);
    wrap.classList.add('is-open');
    input.setAttribute('aria-expanded', 'true');
  };

  const closeMenu = () => {
    wrap.classList.remove('is-open');
    input.setAttribute('aria-expanded', 'false');
  };

  input.addEventListener('focus', () => openMenu(true));
  input.addEventListener('click', (e) => {
    e.stopPropagation();
    openMenu(true);
  });
  input.addEventListener('input', () => {
    selectedName = input.value;
    if (typeof onInput === 'function') onInput(input.value);
    openMenu(false);
  });

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (wrap.classList.contains('is-open')) closeMenu();
    else {
      openMenu(true);
      input.focus();
    }
  });

  const onOutsideClick = (e) => {
    if (!wrap.contains(e.target)) closeMenu();
  };
  root.addEventListener('click', onOutsideClick);

  renderMenu('');

  return {
    updateItems: (newItems, selectName = null) => {
      items = Array.isArray(newItems) ? newItems : [];
      if (selectName !== null) {
        selectedName = selectName;
        input.value = selectName;
      }
      renderMenu(wrap.classList.contains('is-open') ? input.value : '');
    }
  };
}

// ─── Sub-Bottom Sheets: Vacunas ──────────────────────────────────────────────

function openVacunaFormSheet(animal, pesoActual, onReload) {
  const today = getLocalToday();
  const catalog = getDosisCatalog('vacunas');

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
        ${renderM3AutocompleteField({ id: 'sub-vacuna-ac', label: 'Vacuna / Tratamiento' })}
        <button type="button" id="sub-vacuna-toggle-new" class="btn-m3-tonal" style="height: 54px; padding: 0 14px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px; font-weight: 800; font-size: 12.5px; background: #eef5ee; color: #2d3e2c; border: 1.5px solid #c8dcc6; white-space: nowrap; flex-shrink: 0;">
          <span class="material-icons" style="font-size: 18px;">add</span>
          <span>Nueva</span>
        </button>
      </div>

      <input type="hidden" name="nombre" id="sub-vacuna-nombre" value="">

      ${renderWeekDatePickerHtml('sub-vacuna-fecha', today)}
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
          <span id="sub-vacuna-submit-label">Aplicar vacuna</span>
        </button>
      </div>
    </form>
  `;

  openSubBottomSheet(html, (subSheet) => {
    const fechaInput = subSheet.querySelector('#sub-vacuna-fecha');
    const titleEl = subSheet.querySelector('#sub-vacuna-title');
    const submitLabelEl = subSheet.querySelector('#sub-vacuna-submit-label');
    const hiddenNombreInput = subSheet.querySelector('#sub-vacuna-nombre');
    const toggleNewBtn = subSheet.querySelector('#sub-vacuna-toggle-new');
    const dosisBaseInput = subSheet.querySelector('#sub-vacuna-dosis-base');
    const dosisBaseField = dosisBaseInput?.closest('.m3-field');
    const dosisAplicarInput = subSheet.querySelector('#sub-vacuna-dosis');
    const pesoNum = parseFloat(pesoActual) || 0;

    const syncDosisBaseVisibility = () => {
      if (!dosisBaseField) return;
      const hasBase = Boolean(dosisBaseInput?.value?.trim());
      const hasApplied = Boolean(dosisAplicarInput?.value?.trim());
      dosisBaseField.style.display = (!hasBase && hasApplied) ? 'none' : '';
    };

    const recalcularDosis = () => {
      const divisor = parseFloat(dosisBaseInput?.value);
      if (!isNaN(divisor) && divisor > 0 && pesoNum > 0) {
        const resultado = Number((pesoNum / divisor).toFixed(2));
        if (dosisAplicarInput) dosisAplicarInput.value = `${resultado} ml`;
      } else if (!dosisBaseInput?.value && dosisAplicarInput) {
        dosisAplicarInput.value = '';
      }
      syncDosisBaseVisibility();
    };

    dosisBaseInput?.addEventListener('input', recalcularDosis);
    dosisAplicarInput?.addEventListener('input', syncDosisBaseVisibility);

    const applyCatalogSelection = (item) => {
      if (hiddenNombreInput) hiddenNombreInput.value = item.nombre || '';
      if (item.kgPorMl > 0 && dosisBaseInput) {
        dosisBaseInput.value = item.kgPorMl;
        recalcularDosis();
      } else if (item.dosisMl > 0) {
        if (dosisBaseInput) dosisBaseInput.value = '';
        if (dosisAplicarInput) dosisAplicarInput.value = `${item.dosisMl} ml`;
        syncDosisBaseVisibility();
      } else {
        if (dosisBaseInput) dosisBaseInput.value = '';
        if (dosisAplicarInput) dosisAplicarInput.value = '';
        syncDosisBaseVisibility();
      }
    };

    const vacAc = initM3Autocomplete(subSheet, 'sub-vacuna-ac', catalog, {
      onSelect: applyCatalogSelection,
      onInput: (val) => {
        if (hiddenNombreInput) hiddenNombreInput.value = val;
      },
      onDelete: (item) => {
        const updated = deleteFromDosisCatalog('vacunas', item.nombre);
        if (hiddenNombreInput && hiddenNombreInput.value.toLowerCase() === (item.nombre || '').toLowerCase()) {
          hiddenNombreInput.value = '';
        }
        showSnackbar(`Vacuna "${item.nombre}" eliminada ✓`);
        return updated;
      }
    });

    syncDosisCatalogFromSupabase('vacunas').then((dbList) => {
      if (Array.isArray(dbList)) {
        vacAc.updateItems(dbList);
      }
    });

    toggleNewBtn?.addEventListener('click', () => {
      openCatalogNewBottomSheet('vacunas', (updatedList, savedItem) => {
        vacAc.updateItems(updatedList, savedItem.nombre);
        applyCatalogSelection(savedItem);
      });
    });

    const updateModeLabel = () => {
      const val = fechaInput?.value || today;
      const isFuture = val > today;
      if (titleEl) titleEl.textContent = isFuture ? 'Programar Vacuna' : 'Registrar Vacuna';
      if (submitLabelEl) submitLabelEl.textContent = isFuture ? 'Programar' : 'Aplicar vacuna';
    };
    attachWeekDatePicker(subSheet, 'sub-vacuna-fecha', today, updateModeLabel);

    subSheet.querySelector('#sub-vacuna-cancel')?.addEventListener('click', closeSubBottomSheet);
    subSheet.querySelector('#sub-sheet-form-vacuna')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const submitBtn = subSheet.querySelector('#sub-vacuna-submit');

      let nombre = (formData.get('nombre') || subSheet.querySelector('#sub-vacuna-ac-input')?.value || '').trim();
      if (!nombre) {
        showSnackbar('Selecciona o crea una vacuna primero', 'error');
        return;
      }
      if (submitBtn) submitBtn.disabled = true;

      const baseKgVal = parseFloat(dosisBaseInput?.value);
      if (!isNaN(baseKgVal) && baseKgVal > 0) {
        const existingCat = getDosisCatalog('vacunas').find(
          it => (it.nombre || '').trim().toLowerCase() === nombre.toLowerCase()
        );
        if (!existingCat || Math.abs((existingCat.kgPorMl || 0) - baseKgVal) > 0.001) {
          saveToDosisCatalog('vacunas', nombre, baseKgVal, 1, baseKgVal);
        }
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
  }, { expanded: true });
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
        ${renderM3AutocompleteField({ id: 'sub-fumig-ac', label: 'Producto / Químico' })}
        <button type="button" id="sub-fumig-toggle-new" class="btn-m3-tonal" style="height: 54px; padding: 0 14px; border-radius: 12px; display: inline-flex; align-items: center; gap: 4px; font-weight: 800; font-size: 12.5px; background: #eef5ee; color: #2d3e2c; border: 1.5px solid #c8dcc6; white-space: nowrap; flex-shrink: 0;">
          <span class="material-icons" style="font-size: 18px;">add</span>
          <span>Nuevo</span>
        </button>
      </div>

      <input type="hidden" name="producto" id="sub-fumig-producto" value="">

      ${renderWeekDatePickerHtml('sub-fumig-fecha', today)}
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
          <span id="sub-fumig-submit-label">Registrar aplicada</span>
        </button>
      </div>
    </form>
  `;

  openSubBottomSheet(html, (subSheet) => {
    const fechaInput = subSheet.querySelector('#sub-fumig-fecha');
    const titleEl = subSheet.querySelector('#sub-fumig-title');
    const submitLabelEl = subSheet.querySelector('#sub-fumig-submit-label');
    const hiddenProductoInput = subSheet.querySelector('#sub-fumig-producto');
    const toggleNewBtn = subSheet.querySelector('#sub-fumig-toggle-new');
    const dosisBaseInput = subSheet.querySelector('#sub-fumig-dosis-base');
    const dosisBaseField = dosisBaseInput?.closest('.m3-field');
    const dosisAplicarInput = subSheet.querySelector('#sub-fumig-dosis');
    const pesoNum = parseFloat(pesoActual) || 0;

    const syncDosisBaseVisibility = () => {
      if (!dosisBaseField) return;
      const hasBase = Boolean(dosisBaseInput?.value?.trim());
      const hasApplied = Boolean(dosisAplicarInput?.value?.trim());
      dosisBaseField.style.display = (!hasBase && hasApplied) ? 'none' : '';
    };

    const recalcularDosis = () => {
      const divisor = parseFloat(dosisBaseInput?.value);
      if (!isNaN(divisor) && divisor > 0 && pesoNum > 0) {
        const resultado = Number((pesoNum / divisor).toFixed(2));
        if (dosisAplicarInput) dosisAplicarInput.value = `${resultado} ml`;
      } else if (!dosisBaseInput?.value && dosisAplicarInput) {
        dosisAplicarInput.value = '';
      }
      syncDosisBaseVisibility();
    };

    dosisBaseInput?.addEventListener('input', recalcularDosis);
    dosisAplicarInput?.addEventListener('input', syncDosisBaseVisibility);

    const applyCatalogSelection = (item) => {
      if (hiddenProductoInput) hiddenProductoInput.value = item.nombre || '';
      if (item.kgPorMl > 0 && dosisBaseInput) {
        dosisBaseInput.value = item.kgPorMl;
        recalcularDosis();
      } else if (item.dosisMl > 0) {
        if (dosisBaseInput) dosisBaseInput.value = '';
        if (dosisAplicarInput) dosisAplicarInput.value = `${item.dosisMl} ml`;
        syncDosisBaseVisibility();
      } else {
        if (dosisBaseInput) dosisBaseInput.value = '';
        if (dosisAplicarInput) dosisAplicarInput.value = '';
        syncDosisBaseVisibility();
      }
    };

    const fumigAc = initM3Autocomplete(subSheet, 'sub-fumig-ac', catalog, {
      onSelect: applyCatalogSelection,
      onInput: (val) => {
        if (hiddenProductoInput) hiddenProductoInput.value = val;
      },
      onDelete: (item) => {
        const updated = deleteFromDosisCatalog('fumigaciones', item.nombre);
        if (hiddenProductoInput && hiddenProductoInput.value.toLowerCase() === (item.nombre || '').toLowerCase()) {
          hiddenProductoInput.value = '';
        }
        showSnackbar(`Producto "${item.nombre}" eliminado ✓`);
        return updated;
      }
    });

    syncDosisCatalogFromSupabase('fumigaciones').then((dbList) => {
      if (Array.isArray(dbList)) {
        fumigAc.updateItems(dbList);
      }
    });

    toggleNewBtn?.addEventListener('click', () => {
      openCatalogNewBottomSheet('fumigaciones', (updatedList, savedItem) => {
        fumigAc.updateItems(updatedList, savedItem.nombre);
        applyCatalogSelection(savedItem);
      });
    });

    const updateModeLabel = () => {
      const val = fechaInput?.value || today;
      const isFuture = val > today;
      if (titleEl) titleEl.textContent = isFuture ? 'Programar Fumigación / Baño' : 'Registrar Fumigación / Baño';
      if (submitLabelEl) submitLabelEl.textContent = isFuture ? 'Programar' : 'Registrar aplicada';
    };
    attachWeekDatePicker(subSheet, 'sub-fumig-fecha', today, updateModeLabel);

    subSheet.querySelector('#sub-fumig-cancel')?.addEventListener('click', closeSubBottomSheet);
    subSheet.querySelector('#sub-sheet-form-fumig')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(e.target);
      const submitBtn = subSheet.querySelector('#sub-fumig-submit');

      let producto = (formData.get('producto') || subSheet.querySelector('#sub-fumig-ac-input')?.value || '').trim();
      if (!producto) {
        showSnackbar('Selecciona o crea un producto primero', 'error');
        return;
      }
      if (submitBtn) submitBtn.disabled = true;

      const baseKgVal = parseFloat(dosisBaseInput?.value);
      if (!isNaN(baseKgVal) && baseKgVal > 0) {
        const existingCat = getDosisCatalog('fumigaciones').find(
          it => (it.nombre || '').trim().toLowerCase() === producto.toLowerCase()
        );
        if (!existingCat || Math.abs((existingCat.kgPorMl || 0) - baseKgVal) > 0.001) {
          saveToDosisCatalog('fumigaciones', producto, baseKgVal, 1, baseKgVal);
        }
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
  }, { expanded: true });
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

  sheet.onTouchStartMain && sheet.removeEventListener('touchstart', sheet.onTouchStartMain);
  sheet.onTouchMoveMain && sheet.removeEventListener('touchmove', sheet.onTouchMoveMain);
  sheet.onTouchEndMain && sheet.removeEventListener('touchend', sheet.onTouchEndMain);

  sheet.onTouchStartMain = (e) => {
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
  };

  sheet.onTouchMoveMain = (e) => {
    if (!isTracking || e.touches.length !== 1) return;
    currentY = e.touches[0].clientY;
  };

  sheet.onTouchEndMain = (e) => {
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
        const detailsEl = sheet.querySelector('#sheet-expanded-details');
        const scTop = detailsEl ? detailsEl.scrollTop : sheet.scrollTop;
        if (scTop > 15) return;
        setExpanded(false);
      } else {
        // In peek mode, swipe down closes
        closeActionBottomSheet();
      }
    }
  };

  sheet.addEventListener('touchstart', sheet.onTouchStartMain, { passive: true });
  sheet.addEventListener('touchmove', sheet.onTouchMoveMain, { passive: true });
  sheet.addEventListener('touchend', sheet.onTouchEndMain, { passive: true });
}

function formatFecha(fecha) {
  if (!fecha) return 'No registrada';
  const d = new Date(fecha.length === 10 ? fecha + 'T12:00:00' : fecha);
  if (isNaN(d.getTime())) return fecha;
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' });
}

function addDaysSheet(dateStr, days) {
  const d = new Date((dateStr || getLocalToday()) + 'T12:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

// ─── Sub-Bottom Sheets: Preñez / Reproducción ────────────────────────────────

function openPrenezFormSheet(animal, pesoActual, onReload) {
  const today = getLocalToday();
  const estParto = addDaysSheet(today, 283);
  const html = `
    <div class="m3-sub-sheet-header">
      <div class="m3-sub-sheet-icon">
        <img src="/cow.png" style="width: 22px; height: 22px; object-fit: contain;">
      </div>
      <div style="flex: 1; min-width: 0;">
        <h4 class="m3-sub-sheet-title">Registrar Preñez</h4>
        <p class="m3-sub-sheet-subtitle">${escapeHtml(animal.nombre || 'Animal')} • <span style="color: #e65100; font-weight: 800;">Peso actual: ${escapeHtml(pesoActual)} kg</span></p>
      </div>
    </div>
    <form id="sub-sheet-form-prenez" class="m3-sub-sheet-form">
      <div class="m3-field">
        <input type="number" id="sub-prenez-dias" min="0" max="300" value="0" placeholder=" " autocomplete="off">
        <label>Días de preñez (gestación actual)</label>
      </div>
      <div class="m3-field">
        <input type="date" name="fecha_monta" id="sub-prenez-fecha-monta" value="${today}" placeholder=" " required>
        <label>Fecha de Monta</label>
      </div>
      <div style="background: #fff8ee; border: 1.5px solid #ffe0b2; border-radius: 12px; padding: 10px 14px; font-size: 13px; color: #1e3e2b; display: flex; align-items: center; gap: 8px;">
        <span class="material-icons" style="font-size: 18px; color: #e65100;">event_available</span>
        <span>Parto estimado: <strong id="sub-prenez-parto-est" style="color: #e65100;">${formatFecha(estParto)}</strong> <span id="sub-prenez-restantes" style="color: #666; font-size: 11.5px;">(283 días restantes)</span></span>
      </div>
      <div class="m3-sub-sheet-actions">
        <button type="button" class="btn-m3-tonal" id="sub-prenez-cancel">Cancelar</button>
        <button type="submit" class="btn-m3-fill" id="sub-prenez-submit">
          <span class="material-icons" style="font-size: 18px;">check</span>
          <span>Guardar Preñez</span>
        </button>
      </div>
    </form>
  `;

  openSubBottomSheet(html, (subSheet) => {
    const diasInput = subSheet.querySelector('#sub-prenez-dias');
    const fechaMontaInput = subSheet.querySelector('#sub-prenez-fecha-monta');
    const partoEstEl = subSheet.querySelector('#sub-prenez-parto-est');
    const restantesEl = subSheet.querySelector('#sub-prenez-restantes');

    const updatePartoInfo = (fMonta) => {
      if (!fMonta) return;
      const fParto = addDaysSheet(fMonta, 283);
      if (partoEstEl) partoEstEl.textContent = formatFecha(fParto);
      const rest = Math.ceil((new Date(fParto + 'T12:00:00') - new Date(today + 'T12:00:00')) / 86400000);
      if (restantesEl) {
        restantesEl.textContent = rest > 0 ? `(${rest} días restantes)` : (rest === 0 ? '(¡Parto hoy!)' : `(Sobre fecha hace ${Math.abs(rest)}d)`);
      }
    };

    diasInput?.addEventListener('input', () => {
      const d = Math.max(0, parseInt(diasInput.value, 10) || 0);
      const fMonta = addDaysSheet(today, -d);
      if (fechaMontaInput) fechaMontaInput.value = fMonta;
      updatePartoInfo(fMonta);
    });

    fechaMontaInput?.addEventListener('change', () => {
      const fMonta = fechaMontaInput.value;
      if (!fMonta) return;
      const diff = Math.max(0, Math.floor((new Date(today + 'T12:00:00') - new Date(fMonta + 'T12:00:00')) / 86400000));
      if (diasInput) diasInput.value = isNaN(diff) ? 0 : diff;
      updatePartoInfo(fMonta);
    });

    subSheet.querySelector('#sub-prenez-cancel')?.addEventListener('click', closeSubBottomSheet);
    subSheet.querySelector('#sub-sheet-form-prenez')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = subSheet.querySelector('#sub-prenez-submit');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const fechaMonta = fechaMontaInput?.value || today;
        const fechaProbable = addDaysSheet(fechaMonta, 283);

        const { error } = await supabase.from('animal_preñez').insert({
          animal_id: animal.id,
          empresa_id: window._currentEmpresaId,
          fecha_monta: fechaMonta,
          fecha_probable_parto: fechaProbable,
          estado: 'Preñada'
        });
        if (error) throw new Error(error);

        await restFetch(`/rest/v1/ganado?id=eq.${encodeURIComponent(animal.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ reproductivo: 'Preñada' })
        }).catch(() => {});

        sendWhatsApp(
          `🐮 Preñez Registrada\nAnimal: ${animal.nombre || 'Animal'}\nFecha de monta: ${fechaMonta}\nParto estimado: ${fechaProbable}\nFinca: ${window._empresaNombre || ''}`
        );

        localStorage.removeItem(`push_parto_ts_${animal.id}`);
        localStorage.removeItem(`wa_parto_ts_${animal.id}`);
        window.checkPushAlerts?.({ forceAnimalId: animal.id }).catch(() => {});

        showSnackbar('Preñez registrada ✓');
        closeSubBottomSheet();
        if (onReload) onReload();
      } catch (err) {
        showSnackbar(err.message || 'Error al registrar preñez', 'error');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  });
}

function openEditPrenezFormSheet(animal, preg, allPregs, pesoActual, onReload) {
  const today = getLocalToday();
  const initDias = preg.fecha_monta
    ? Math.max(0, Math.floor((new Date(today + 'T12:00:00') - new Date(preg.fecha_monta + 'T12:00:00')) / 86400000))
    : 0;
  const initProbable = preg.fecha_probable_parto || addDaysSheet(preg.fecha_monta || today, 283);

  const html = `
    <div class="m3-sub-sheet-header">
      <div class="m3-sub-sheet-icon">
        <img src="/cow.png" style="width: 22px; height: 22px; object-fit: contain;">
      </div>
      <div style="flex: 1; min-width: 0;">
        <h4 class="m3-sub-sheet-title">Editar Preñez</h4>
        <p class="m3-sub-sheet-subtitle">${escapeHtml(animal.nombre || 'Animal')} • <span style="color: #e65100; font-weight: 800;">Peso actual: ${escapeHtml(pesoActual)} kg</span></p>
      </div>
    </div>
    <form id="sub-sheet-edit-prenez" class="m3-sub-sheet-form">
      <div class="m3-field">
        <input type="number" id="sub-edit-prenez-dias" min="0" max="300" value="${initDias}" placeholder=" " autocomplete="off">
        <label>Días de preñez (gestación)</label>
      </div>
      <div class="m3-field">
        <input type="date" name="fecha_monta" id="sub-edit-prenez-monta" value="${escapeHtml(preg.fecha_monta || today)}" placeholder=" " required>
        <label>Fecha de Monta</label>
      </div>
      <div style="background: #fff8ee; border: 1.5px solid #ffe0b2; border-radius: 12px; padding: 10px 14px; font-size: 13px; color: #1e3e2b; display: flex; align-items: center; gap: 8px;">
        <span class="material-icons" style="font-size: 18px; color: #e65100;">event_available</span>
        <span>Parto estimado: <strong id="sub-edit-prenez-parto-est" style="color: #e65100;">${formatFecha(initProbable)}</strong></span>
      </div>
      <div class="m3-sub-sheet-actions">
        <button type="button" class="btn-m3-tonal" id="sub-edit-prenez-cancel">Cancelar</button>
        <button type="submit" class="btn-m3-fill" id="sub-edit-prenez-save">
          <span class="material-icons" style="font-size: 18px;">save</span>
          <span>Guardar cambios</span>
        </button>
      </div>
    </form>
  `;

  openSubBottomSheet(html, (subSheet) => {
    const diasInput = subSheet.querySelector('#sub-edit-prenez-dias');
    const montaInput = subSheet.querySelector('#sub-edit-prenez-monta');
    const partoEstEl = subSheet.querySelector('#sub-edit-prenez-parto-est');

    const updateEst = (fMonta) => {
      if (!fMonta) return;
      const fParto = addDaysSheet(fMonta, 283);
      if (partoEstEl) partoEstEl.textContent = formatFecha(fParto);
    };

    diasInput?.addEventListener('input', () => {
      const d = Math.max(0, parseInt(diasInput.value, 10) || 0);
      const fMonta = addDaysSheet(today, -d);
      if (montaInput) montaInput.value = fMonta;
      updateEst(fMonta);
    });

    montaInput?.addEventListener('change', () => {
      const fMonta = montaInput.value;
      if (!fMonta) return;
      const diff = Math.max(0, Math.floor((new Date(today + 'T12:00:00') - new Date(fMonta + 'T12:00:00')) / 86400000));
      if (diasInput) diasInput.value = isNaN(diff) ? 0 : diff;
      updateEst(fMonta);
    });

    subSheet.querySelector('#sub-edit-prenez-cancel')?.addEventListener('click', closeSubBottomSheet);
    subSheet.querySelector('#sub-sheet-edit-prenez')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const saveBtn = subSheet.querySelector('#sub-edit-prenez-save');
      if (saveBtn) saveBtn.disabled = true;

      try {
        const fechaMonta = montaInput?.value || today;
        const fechaProbable = addDaysSheet(fechaMonta, 283);

        await restFetch(`/rest/v1/animal_preñez?id=eq.${encodeURIComponent(preg.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({
            fecha_monta: fechaMonta,
            fecha_probable_parto: fechaProbable
          })
        });
        await restFetch(`/rest/v1/notifications?type=eq.ganado_parto&ref_id=eq.${encodeURIComponent(animal.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ read: true, ref_id: `${animal.id}_done` })
        }).catch(() => {});
        localStorage.removeItem(`push_parto_ts_${animal.id}`);
        localStorage.removeItem(`wa_parto_ts_${animal.id}`);
        syncTable('animal_preñez');
        window.checkPushAlerts?.({ forceAnimalId: animal.id }).catch(() => {});
        showSnackbar('Preñez actualizada ✓');
        closeSubBottomSheet();
        if (onReload) onReload();
      } catch (err) {
        showSnackbar(err.message || 'Error al actualizar preñez', 'error');
        if (saveBtn) saveBtn.disabled = false;
      }
    });
  });
}

function openPartoFormSheet(animal, activePreg, pesoActual, onReload) {
  const today = getLocalToday();
  const html = `
    <div class="m3-sub-sheet-header">
      <div class="m3-sub-sheet-icon">
        <span class="material-icons">child_care</span>
      </div>
      <div style="flex: 1; min-width: 0;">
        <h4 class="m3-sub-sheet-title">Registrar Parto</h4>
        <p class="m3-sub-sheet-subtitle">${escapeHtml(animal.nombre || 'Animal')} • <span style="color: #e65100; font-weight: 800;">Peso actual: ${escapeHtml(pesoActual)} kg</span></p>
      </div>
    </div>
    <form id="sub-sheet-form-parto" class="m3-sub-sheet-form">
      <div class="m3-field">
        <input type="date" name="fecha_parto" value="${today}" placeholder=" " required>
        <label>Fecha de Parto</label>
      </div>
      <div class="m3-field">
        <input type="text" name="cria_nombre" placeholder=" " autocomplete="off">
        <label>Nombre de la cría (opcional)</label>
      </div>
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div class="m3-field" style="margin-bottom: 0;">
          <select name="cria_sexo" style="width: 100%; height: 54px; border-radius: 12px; border: 1.5px solid rgba(45,62,44,0.28); padding: 18px 12px 6px; font-size: 14px; font-weight: 700; color: #1e3e2b; background: #fff; outline: none; font-family: inherit;">
            <option value="Hembra">Hembra</option>
            <option value="Macho">Macho</option>
          </select>
          <label style="top: 10px; font-size: 10.5px; font-weight: 800; color: #2d3e2c; text-transform: uppercase;">Sexo de la cría</label>
        </div>
        <div class="m3-field" style="margin-bottom: 0;">
          <input type="number" step="0.1" name="cria_peso_lb" placeholder=" " autocomplete="off">
          <label>Peso al nacer (lb)</label>
        </div>
      </div>
      <div class="m3-sub-sheet-actions">
        <button type="button" class="btn-m3-tonal" id="sub-parto-cancel">Cancelar</button>
        <button type="submit" class="btn-m3-fill" id="sub-parto-submit">
          <span class="material-icons" style="font-size: 18px;">check</span>
          <span>Guardar Parto</span>
        </button>
      </div>
    </form>
  `;

  openSubBottomSheet(html, (subSheet) => {
    subSheet.querySelector('#sub-parto-cancel')?.addEventListener('click', closeSubBottomSheet);
    subSheet.querySelector('#sub-sheet-form-parto')?.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const submitBtn = subSheet.querySelector('#sub-parto-submit');
      if (submitBtn) submitBtn.disabled = true;

      try {
        const fechaParto = fd.get('fecha_parto') || today;
        const criaNombre = (fd.get('cria_nombre') || '').trim() || `Cría de ${animal.nombre || 'vaca'}`;
        const criaSexo = fd.get('cria_sexo') || 'Hembra';
        const pesoLb = parseFloat(fd.get('cria_peso_lb'));
        const pesoKg = !isNaN(pesoLb) && pesoLb > 0 ? Math.round((pesoLb / 2.20462) * 10) / 10 : null;

        await restFetch(`/rest/v1/animal_preñez?id=eq.${encodeURIComponent(activePreg.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ estado: 'Parida', fecha_parto: fechaParto, num_crias: 1 })
        });
        await restFetch(`/rest/v1/ganado?id=eq.${encodeURIComponent(animal.id)}`, {
          method: 'PATCH',
          body: JSON.stringify({ reproductivo: 'Lactando' })
        });

        const created = await restInsert('/rest/v1/ganado', {
          nombre: criaNombre,
          empresa_id: window._currentEmpresaId,
          raza: animal.raza || null,
          sexo: criaSexo,
          origen: 'Criollo',
          madre_id: animal.id,
          peso_unidad: 'kg',
          fecha_adquisicion: fechaParto,
          reproductivo: 'Vacía'
        });

        const criaId = created && created.id;
        if (criaId && pesoKg) {
          await restInsert('/rest/v1/animal_pesajes', {
            animal_id: criaId,
            empresa_id: window._currentEmpresaId,
            peso: String(pesoKg),
            fecha: fechaParto,
            estado: 'Aplicada'
          });
        }

        syncTable('animal_preñez');
        syncTable('ganado');
        localStorage.removeItem(`push_parto_ts_${animal.id}`);
        localStorage.removeItem(`wa_parto_ts_${animal.id}`);
        window.clearPushBellByRef?.(animal.id);

        sendWhatsApp(
          `🐄 Parto Registrado\nMadre: ${animal.nombre || 'Animal'}\nFecha: ${fechaParto}\nCría: ${criaNombre} (${criaSexo})${pesoKg ? ` — ${pesoKg} kg` : ''}\nFinca: ${window._empresaNombre || ''}`
        );

        showSnackbar('Parto y cría registrados ✓');
        closeSubBottomSheet();
        if (onReload) onReload();
      } catch (err) {
        showSnackbar(err.message || 'Error al registrar parto', 'error');
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  });
}

function handleAbortPrenezInSheet(animal, activePreg, onReload) {
  window.Snackbar.confirm('¿Registrar aborto de esta gestación?', async () => {
    try {
      await restFetch(`/rest/v1/animal_preñez?id=eq.${encodeURIComponent(activePreg.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ estado: 'Abortada' })
      });
      await restFetch(`/rest/v1/ganado?id=eq.${encodeURIComponent(animal.id)}`, {
        method: 'PATCH',
        body: JSON.stringify({ reproductivo: 'Vacía' })
      });
      syncTable('animal_preñez');
      syncTable('ganado');
      localStorage.removeItem(`push_parto_ts_${animal.id}`);
      localStorage.removeItem(`wa_parto_ts_${animal.id}`);
      window.clearPushBellByRef?.(animal.id);

      sendWhatsApp(
        `⚠️ Aborto Registrado\nAnimal: ${animal.nombre || 'Animal'}\nFecha monta: ${activePreg.fecha_monta || 'N/A'}\nFinca: ${window._empresaNombre || ''}`
      );

      showSnackbar('Aborto registrado ✓');
      if (onReload) onReload();
    } catch (err) {
      showSnackbar(err.message || 'Error al registrar aborto', 'error');
    }
  });
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
  document.getElementById('m3-menu-sheet')?.remove();
  document.getElementById('m3-menu-sheet-scrim')?.remove();
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

export function openMobileMenuBottomSheet(menuEl, { title = '' } = {}) {
  if (!menuEl) return;
  const buttons = Array.from(menuEl.querySelectorAll('button, .action-item'));
  if (buttons.length === 0) return;

  document.getElementById('m3-menu-sheet-scrim')?.remove();
  document.getElementById('m3-menu-sheet')?.remove();

  const scrim = document.createElement('div');
  scrim.id = 'm3-menu-sheet-scrim';
  scrim.className = 'm3-action-sheet-scrim';
  scrim.style.zIndex = '100020';

  const sheet = document.createElement('div');
  sheet.id = 'm3-menu-sheet';
  sheet.className = 'm3-menu-bottom-sheet';
  sheet.style.zIndex = '100021';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');

  const itemsHtml = buttons.map((origBtn, idx) => {
    const iconEl = origBtn.querySelector('.material-icons, .material-symbols-outlined');
    const iconText = iconEl?.textContent?.trim() || 'chevron_right';
    const iconCls = iconEl?.classList.contains('material-symbols-outlined') ? 'material-symbols-outlined' : 'material-icons';
    const clone = origBtn.cloneNode(true);
    clone.querySelectorAll('.material-icons, .material-symbols-outlined').forEach(el => el.remove());
    const label = clone.textContent.trim();
    const isDelete = origBtn.classList.contains('delete') || iconText.includes('delete');
    return `
      <button type="button" class="m3-menu-sheet-item ${isDelete ? 'is-delete' : ''}" data-menu-idx="${idx}">
        <span class="${iconCls} m3-menu-sheet-icon">${escapeHtml(iconText)}</span>
        <span class="m3-menu-sheet-label">${escapeHtml(label)}</span>
      </button>
    `;
  }).join('');

  sheet.innerHTML = `
    <div class="m3-menu-sheet-handle" aria-hidden="true"></div>
    ${title ? `<div class="m3-menu-sheet-title" style="padding: 4px 18px 10px; font-size: 14px; font-weight: 700; color: #4a5a49; border-bottom: 1px solid #e3eae2; margin-bottom: 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(title)}</div>` : ''}
    <div class="m3-menu-sheet-list">
      ${itemsHtml}
    </div>
  `;

  document.body.appendChild(scrim);
  document.body.appendChild(sheet);

  const closeMenuSheet = () => {
    sheet.classList.remove('open');
    scrim.classList.remove('open');
    setTimeout(() => {
      scrim.remove();
      sheet.remove();
    }, 220);
  };

  scrim.onclick = closeMenuSheet;

  sheet.querySelectorAll('.m3-menu-sheet-item').forEach((itemBtn) => {
    itemBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const idx = parseInt(itemBtn.dataset.menuIdx, 10);
      const targetBtn = buttons[idx];
      closeMenuSheet();
      if (targetBtn) {
        setTimeout(() => targetBtn.click(), 60);
      }
    });
  });

  scrim.style.display = 'block';
  sheet.style.display = 'block';
  requestAnimationFrame(() => {
    scrim.classList.add('open');
    sheet.classList.add('open');
  });
}

window.openMobileMenuBottomSheet = openMobileMenuBottomSheet;
