import { supabase } from '../supabase.js';
import { showModal, closeModal } from '../modals.js';
import { showSnackbar } from '../snackbar.js';
import { formatLitersLabel, formatCurrencyL } from '../utils/motor_fuel_config.js';
import { fetchAreaFuelUsage, sendFuelLoadsToCuentas } from '../utils/motor_fuel_cuentas.js';

function escapePotreroHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatPotreroShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace(/\.$/, '');
}

let currentPotreroId = null;

export async function renderDetallePotrero(potreroId, opts = {}) {
  const embeddedInSheet = Boolean(opts?.embeddedInSheet);
  currentPotreroId = potreroId;
  const { data: potrero, error: potreroError } = await supabase
    .from('potreros')
    .select('*')
    .eq('id', potreroId)
    .single();

  const { data: animales, error: animalesError } = await supabase
    .from('ganado')
    .select('*')
    .eq('potrero_id', potreroId);

  let latestPesos = {};
  if (animales && animales.length > 0) {
    const animalIds = animales.map(a => a.id);
    const { data: pesajes } = await supabase
      .from('animal_pesajes')
      .select('animal_id, peso')
      .in('animal_id', animalIds)
      .order('fecha', { ascending: false });
    const seen = new Set();
    for (const p of pesajes || []) {
      if (!seen.has(p.animal_id)) {
        seen.add(p.animal_id);
        latestPesos[p.animal_id] = p.peso;
      }
    }
  }

  const { data: bitacora, error: bitacoraError } = await supabase
    .from('potrero_eventos')
    .select('*')
    .eq('potrero_id', potreroId)
    .order('fecha', { ascending: false });

  if (potreroError) {
    console.error('Error fetching potrero:', potreroError);
    return `<div class="screen-detalle"><p>Error cargando potrero: ${potreroError.message}</p></div>`;
  }

  const areaFuel = await fetchAreaFuelUsage({
    areaType: 'potrero',
    areaId: potrero.id,
    areaName: potrero.nombre || '',
  }).catch(() => null);
  window._currentPotreroAreaFuel = {
    potreroId: potrero.id,
    potreroNombre: potrero.nombre || 'Potrero',
    areaFuel,
  };

  const potreroData = {
    nombre: potrero.nombre || 'Potrero Sin Nombre',
    area: (potrero.area || '--') + ' ' + (potrero.area_unidad || 'ha'),
    pasto: potrero.pasto || 'Natural',
    carga: (animales ? animales.length : 0) + ' cabezas',
    cycle: potrero.ciclo_recuperacion ? `${potrero.ciclo_recuperacion} días de rotación` : 'No configurado',
    icon: potrero.icon || '🌿',
  };


  return `
    <div class="screen-detalle ${embeddedInSheet ? 'potrero-sheet-detalle' : ''}" id="potrero-detail-container">

      ${embeddedInSheet ? `
        <div style="display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-bottom:12px;">
          <div style="background:#f6f8f5;border:1px solid #e4ece3;border-radius:14px;padding:10px 10px;">
            <div style="font-size:10.5px;font-weight:700;color:#5a6b58;text-transform:uppercase;letter-spacing:0.3px;">Área Total</div>
            <div style="font-size:14px;font-weight:800;color:#1e3e2b;margin-top:3px;">${potreroData.area}</div>
          </div>
          <div style="background:#f6f8f5;border:1px solid #e4ece3;border-radius:14px;padding:10px 10px;">
            <div style="font-size:10.5px;font-weight:700;color:#5a6b58;text-transform:uppercase;letter-spacing:0.3px;">Pasto</div>
            <div style="font-size:14px;font-weight:800;color:#1e3e2b;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${potreroData.pasto}</div>
          </div>
          <div style="background:#f6f8f5;border:1px solid #e4ece3;border-radius:14px;padding:10px 10px;">
            <div style="font-size:10.5px;font-weight:700;color:#5a6b58;text-transform:uppercase;letter-spacing:0.3px;">Carga</div>
            <div style="font-size:14px;font-weight:800;color:#1e3e2b;margin-top:3px;">${potreroData.carga}</div>
          </div>
        </div>
        <div class="alert-banner" style="margin-top:0;margin-bottom:16px;border-radius:14px;padding:10px 12px;">
          <span class="material-icons" style="font-size:19px;">schedule</span>
          <div>
            <p style="margin:0;font-size:12.5px;"><strong>Ciclo de Recuperación:</strong> ${potreroData.cycle}</p>
          </div>
        </div>
      ` : `
      <!-- Hero Section -->
      <div class="detail-hero card">
        <div class="detail-hero-header" style="justify-content: space-between; width: 100%;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div class="detail-hero-icon">${potreroData.icon}</div>
            <div>
              <h2>${potreroData.nombre}</h2>
              <p class="detail-subtitle">${potreroData.pasto}</p>
            </div>
          </div>
          <button class="btn-m3-text" onclick="window.navigateTo('nuevo_potrero', '${potrero.id}')" style="min-width: 48px; border-radius: 50%; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">
            <span class="material-symbols-outlined">edit</span>
          </button>
        </div>

        <div class="detail-stats">
          <div class="detail-stat-item">
            <span class="detail-stat-label">Área Total</span>
            <span class="detail-stat-value">${potreroData.area}</span>
          </div>
          <div class="detail-stat-item">
            <span class="detail-stat-label">Tipo de Pasto</span>
            <span class="detail-stat-value">${potreroData.pasto}</span>
          </div>
          <div class="detail-stat-item">
            <span class="detail-stat-label">Carga Actual</span>
            <span class="detail-stat-value">${potreroData.carga}</span>
          </div>
        </div>

        <div class="alert-banner" style="margin-top: 16px; margin-bottom: 0;">
          <span class="material-icons">schedule</span>
          <div>
            <p><strong>Ciclo de Recuperación:</strong> ${potreroData.cycle}</p>
          </div>
        </div>
      </div>
      `}

      <div class="${embeddedInSheet ? '' : 'grid-2'}" style="${embeddedInSheet ? 'display:flex;flex-direction:column;gap:16px;' : ''}">
        <!-- Animal Segment -->
        <div class="section">
          <div class="section-title">
            <h3>Animales en el Lote</h3>
            <span class="tag" style="background:#2d3e2c; color:#ffffff">${animales ? animales.length : 0} Activos</span>
          </div>
          <div class="animal-list" style="margin-top: 12px; gap: 8px;">
            ${animales && animales.length > 0 ? animales.map(a => `
              <div class="animal-card card btn-navigate-animal" data-id="${a.id}" style="padding: 12px 16px; margin-bottom: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                <div class="animal-info">
                  <h4 style="font-size: 14px;">${a.nombre || a.raza} <span class="animal-tag-chip">${a.id.split('-').shift()}</span></h4>
                  <p style="font-size: 12px; margin-bottom: 0;">${latestPesos[a.id] || 0}kg • <span style="color: #4caf50; font-weight: 600;">Saludable</span></p>
                </div>
                <span class="material-icons" style="color:#ccc">chevron_right</span>
              </div>
            `).join('') : '<p style="text-align:center; padding: 20px; color:#999">No hay animales en este potrero.</p>'}
          </div>
        </div>

        <!-- Uso de Equipos y Gasolina -->
        ${areaFuel && areaFuel.loads.length > 0 ? `
        <div class="section">
          <div class="section-title">
            <h3>Uso de Equipos y Gasolina</h3>
            <span class="tag" style="background:#eef5ec; color:#1b6e1b; font-weight:800;">${formatLitersLabel(areaFuel.totalLiters)}${areaFuel.totalCost > 0 ? ` · ${escapePotreroHtml(formatCurrencyL(areaFuel.totalCost))}` : ''}</span>
          </div>
          <div style="display:flex; flex-direction:column; gap:8px; margin-top:10px;">
            ${areaFuel.loads.map((fl) => `
              <div style="background:#fafcf9; border:1px solid #e4ece3; border-radius:14px; padding:10px 12px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0; flex:1;">
                  <div style="font-size:13.5px; font-weight:800; color:#192b18; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapePotreroHtml(fl._motorIcon)} ${escapePotreroHtml(fl._motorNombre)}</div>
                  <div style="font-size:12px; color:#5a6b58; margin-top:2px;">⛽ ${formatLitersLabel(fl._liters)} de gasolina · ${escapePotreroHtml(formatPotreroShortDate(fl.fecha || fl.created_at) || 'Reciente')}</div>
                </div>
                <div style="text-align:right; flex-shrink:0;">
                  <div style="font-size:13.5px; font-weight:800; color:${fl._cost > 0 ? '#192b18' : '#7c877a'};">${fl._cost > 0 ? escapePotreroHtml(formatCurrencyL(fl._cost)) : 'Sin precio'}</div>
                  ${fl._cost > 0 ? (
                    fl._isSent && !fl._needsUpdate
                      ? `<div style="font-size:10.5px; font-weight:700; color:#1b6e1b; margin-top:2px;">✓ En Cuentas</div>`
                      : `<div style="font-size:10.5px; font-weight:700; color:#b34200; margin-top:2px;">Pendiente</div>`
                  ) : ''}
                </div>
              </div>
            `).join('')}
          </div>
          ${areaFuel.pendingLoads.length > 0 ? `
            <button type="button" id="btn-potrero-send-fuel-cuentas" class="press-effect" style="margin-top:10px; width:100%; height:42px; border-radius:999px; border:none; background:#2d3e2c; color:#ffffff; font-size:13.5px; font-weight:800; font-family:inherit; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
              <span class="material-symbols-outlined" style="font-size:17px;">send</span>
              <span>Enviar a Cuentas · ${escapePotreroHtml(formatCurrencyL(areaFuel.pendingAmount))}</span>
            </button>
          ` : ''}
        </div>
        ` : ''}

        <!-- Log Segment -->
        <div class="section">
          <div class="section-title">
            <h3>Bitácora de Eventos</h3>
            ${embeddedInSheet ? '' : `<button class="btn-primary" id="btn-add-potrero-note" style="padding: 6px 12px; font-size: 12px;">+ Nota</button>`}
          </div>
          <div class="activity-list" style="margin-top: 12px;">
            ${bitacora && bitacora.length > 0 ? bitacora.map(b => `
              <div class="activity-item" style="padding: 12px; gap: 12px; border-bottom: 1px solid #f0f0f0;">
                <div class="activity-icon" style="background: rgba(46,125,50,0.1); color: var(--primary-container); width: 36px; height: 36px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  <span class="material-icons" style="font-size: 18px;">${b.icon || 'history'}</span>
                </div>
                <div class="activity-content" style="flex: 1;">
                  <h4 style="font-size: 13px; margin: 0;">${b.evento}</h4>
                  <p style="font-size: 11px; margin: 2px 0; color: #666;">${b.descripcion || ''}</p>
                  <span class="history-date" style="font-size: 10px; color: #aaa;">${new Date(b.fecha).toLocaleDateString()}</span>
                </div>
                <div class="activity-actions" style="display: flex; gap: 4px;">
                  <button class="btn-m3-text btn-edit-note" data-id="${b.id}" style="padding: 4px; min-width: 32px; height: 32px; border-radius: 50%;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
                  </button>
                  <button class="btn-m3-text btn-delete-note" data-id="${b.id}" style="padding: 4px; min-width: 32px; height: 32px; border-radius: 50%; color: #ff4103;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                  </button>
                </div>
              </div>
            `).join('') : '<p style="text-align:center; padding: 20px; color:#999">No hay eventos registrados.</p>'}
          </div>
        </div>
      </div>

      ${embeddedInSheet ? '' : `
      <!-- Curator Suggestion -->
      <div class="tip-card" style="margin-top: 24px;">
        <span class="material-icons" style="color: #fbc02d;">lightbulb</span>
        <div>
          <p><strong>Sugerencia del Curador:</strong> Basado en la humedad del suelo actual (78%) y el crecimiento del Kikuyo, se recomienda un periodo de descanso adicional de 3 días para maximizar el rebrote proteico.</p>
        </div>
      </div>
      `}
    </div>
  `;
}

export function initDetallePotrero(potreroId) {
  window.openAddPotreroNoteModal = (id = potreroId) => showAddPotreroNoteModal(id);

  document.getElementById('btn-potrero-send-fuel-cuentas')?.addEventListener('click', () => {
    const info = window._currentPotreroAreaFuel;
    const areaFuel = info?.areaFuel;
    if (!areaFuel?.pendingLoads?.length) return;
    const totalLit = Math.round(areaFuel.pendingLoads.reduce((s, x) => s + x._liters, 0) * 10) / 10;
    window.Snackbar?.confirm(
      `¿Enviar a Cuentas el consumo de gasolina en <b>${escapePotreroHtml(info.potreroNombre)}</b> (<b>${escapePotreroHtml(formatCurrencyL(areaFuel.pendingAmount))}</b> · ${formatLitersLabel(totalLit)} de gasolina)?`,
      async () => {
        const btn = document.getElementById('btn-potrero-send-fuel-cuentas');
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
        try {
          await sendFuelLoadsToCuentas({
            loads: areaFuel.pendingLoads,
            sentByLoadId: areaFuel.sentByLoadId,
          });
          showSnackbar('✓ Gasto de gasolina enviado a Cuentas');
          reloadPotreroTarget(potreroId);
        } catch (err) {
          showSnackbar('Error enviando a Cuentas: ' + (err?.message || err), 'error');
          if (btn && document.body.contains(btn)) btn.disabled = false;
        }
      },
      () => {},
      { confirmText: 'Enviar a Cuentas', cancelText: 'Cancelar' }
    );
  });

  const btnAddNote = document.getElementById('btn-add-potrero-note');
  if (btnAddNote) {
    btnAddNote.addEventListener('click', () => {
      showAddPotreroNoteModal(potreroId);
    });
  }

  // Animal card navigation
  const animalCards = document.querySelectorAll('.btn-navigate-animal');
  animalCards.forEach(card => {
    card.addEventListener('click', () => {
      const animalId = card.getAttribute('data-id');
      if (typeof window.__openNotifTarget === 'function') {
        window.__openNotifTarget('/#detalle_animal/' + animalId);
      } else {
        window.navigateTo('detalle_animal', animalId);
      }
    });
  });

  // Edit bitacora note
  const btnEditNotes = document.querySelectorAll('.btn-edit-note');
  btnEditNotes.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const noteId = btn.getAttribute('data-id');
      showEditPotreroNoteModal(noteId, potreroId);
    });
  });

  // Delete bitacora note
  const btnDeleteNotes = document.querySelectorAll('.btn-delete-note');
  btnDeleteNotes.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const noteId = btn.getAttribute('data-id');
      confirmDeletePotreroNote(noteId, potreroId);
    });
  });
}

function showAddPotreroNoteModal(potreroId) {
  renderPotreroNoteFormModal('Nueva Nota de Potrero', null, potreroId);
}

async function showEditPotreroNoteModal(noteId, potreroId) {
  const { data: note, error } = await supabase
    .from('potrero_eventos')
    .select('*')
    .eq('id', noteId)
    .single();

  if (error) {
    showSnackbar('Error al cargar la nota', 'error');
    return;
  }

  renderPotreroNoteFormModal('Editar Nota de Potrero', note, potreroId);
}

function reloadPotreroTarget(potreroId) {
  const sheetOpen = document.getElementById('potrero-bottom-sheet')?.classList.contains('open');
  if (sheetOpen && typeof window._reloadPotreroSheetDetail === 'function') {
    window._reloadPotreroSheetDetail(potreroId);
  } else {
    window.navigateTo('detalle_potrero', potreroId);
  }
}

function renderPotreroNoteFormModal(title, note = null, potreroId) {
  showModal(title, `
    <form id="form-potrero-note" style="display: flex; flex-direction: column; gap: 16px; padding: 8px;">
      <div class="m3-field ${note?.evento ? 'has-value' : ''}">
        <input type="text" name="evento" placeholder=" " value="${note ? note.evento : ''}" required>
        <label>Título del Evento (ej. Riego, Fumigación)</label>
      </div>
      <div class="m3-field ${note?.descripcion ? 'has-value' : ''}">
        <textarea name="descripcion" placeholder=" " style="min-height: 100px;">${note ? note.descripcion || '' : ''}</textarea>
        <label>Descripción / Observaciones</label>
      </div>
      <div class="m3-field has-value">
        <input type="date" name="fecha" value="${note ? note.fecha : new Date().toISOString().split('T')[0]}" required>
        <label>Fecha</label>
      </div>
      <div class="m3-field has-value">
        <select name="icon">
          <option value="history" data-icon="📝" data-sub="Registro general o nota de campo" ${note && note.icon === 'history' ? 'selected' : ''}>General</option>
          <option value="water_drop" data-icon="💧" data-sub="Riego o humedad del potrero" ${note && note.icon === 'water_drop' ? 'selected' : ''}>Riego</option>
          <option value="grass" data-icon="🌿" data-sub="Fertilización, abono o resiembra" ${note && note.icon === 'grass' ? 'selected' : ''}>Abono / Siembra</option>
          <option value="bug_report" data-icon="🛡️" data-sub="Control de maleza o plagas" ${note && note.icon === 'bug_report' ? 'selected' : ''}>Fumigación</option>
          <option value="fence" data-icon="🪵" data-sub="Postes, alambre y división" ${note && note.icon === 'fence' ? 'selected' : ''}>Mantenimiento Cerca</option>
        </select>
        <label>Ícono</label>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
        <button type="button" class="btn-m3-tonal" id="btn-cancel-note">Cancelar</button>
        <button type="submit" class="btn-m3-fill">Guardar Nota</button>
      </div>
    </form>
  `);

  document.getElementById('btn-cancel-note').onclick = closeModal;

  document.getElementById('form-potrero-note').onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      potrero_id: potreroId,
      evento: formData.get('evento'),
      descripcion: formData.get('descripcion'),
      fecha: formData.get('fecha'),
      icon: formData.get('icon')
    };

    try {
      let result;
      if (note) {
        result = await supabase.from('potrero_eventos').update(data).eq('id', note.id);
      } else {
        result = await supabase.from('potrero_eventos').insert(data);
      }

      if (result.error) throw result.error;

      showSnackbar(note ? 'Nota actualizada' : 'Nota agregada');
      closeModal();
      reloadPotreroTarget(potreroId);
    } catch (err) {
      console.error('Error saving note:', err);
      showSnackbar('Error al guardar la nota: ' + err.message, 'error');
    }
  };
}

async function confirmDeletePotreroNote(noteId, potreroId) {
  const doDelete = async () => {
    try {
      const { error } = await supabase.from('potrero_eventos').delete().eq('id', noteId);
      if (error) throw error;
      showSnackbar('Nota eliminada');
      reloadPotreroTarget(potreroId);
    } catch (err) {
      console.error('Error deleting note:', err);
      showSnackbar('Error al eliminar la nota', 'error');
    }
  };

  if (window.Snackbar?.confirm) {
    window.Snackbar.confirm('¿Estás seguro de que deseas eliminar esta nota?', doDelete, null, {
      confirmText: 'Eliminar',
      cancelText: 'Cancelar'
    });
  } else {
    await doDelete();
  }
}
