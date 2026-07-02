import { supabase } from '../supabase.js';
import { showModal, closeModal } from '../modals.js';
import { showSnackbar } from '../snackbar.js';

let currentPotreroId = null;

export async function renderDetallePotrero(potreroId) {
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

  const { data: bitacora, error: bitacoraError } = await supabase
    .from('potrero_eventos')
    .select('*')
    .eq('potrero_id', potreroId)
    .order('fecha', { ascending: false });

  if (potreroError) {
    console.error('Error fetching potrero:', potreroError);
    return `<div class="screen-detalle"><p>Error cargando potrero: ${potreroError.message}</p></div>`;
  }

  const potreroData = {
    nombre: potrero.nombre || 'Potrero Sin Nombre',
    area: (potrero.area || '--') + ' ' + (potrero.area_unidad || 'ha'),
    pasto: potrero.pasto || 'Natural',
    ultimoRiego: potrero.ultimo_riego ? new Date(potrero.ultimo_riego).toLocaleDateString() : 'No registrado',
    carga: (animales ? animales.length : 0) + ' cabezas',
    ubicacion: potrero.ubicacion || 'Sin ubicación registrada',
    cycle: potrero.ciclo_recuperacion ? `${potrero.ciclo_recuperacion} días de ciclo` : 'No configurado',
    icon: potrero.icon || '🌿',
  };


  return `
    <div class="screen-detalle" id="potrero-detail-container">

      <!-- Hero Section -->
      <div class="detail-hero card">
        <div class="detail-hero-header" style="justify-content: space-between; width: 100%;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div class="detail-hero-icon">${potreroData.icon}</div>
            <div>
              <h2>${potreroData.nombre}</h2>
              <p class="detail-subtitle">${potreroData.ubicacion}</p>
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
          <div class="detail-stat-item">
            <span class="detail-stat-label">Último Riego</span>
            <span class="detail-stat-value">${potreroData.ultimoRiego}</span>
          </div>
        </div>

        <div class="alert-banner" style="margin-top: 16px; margin-bottom: 0;">
          <span class="material-icons">schedule</span>
          <div>
            <p><strong>Ciclo de Recuperación:</strong> ${potreroData.cycle}</p>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <!-- Animal Segment -->
        <div class="section">
          <div class="section-title">
            <h3>Animales en el Lote</h3>
            <span class="tag" style="background:#2d3e2c; color:#43a047">${animales ? animales.length : 0} Activos</span>
          </div>
          <div class="animal-list" style="margin-top: 12px; gap: 8px;">
            ${animales && animales.length > 0 ? animales.map(a => `
              <div class="animal-card card btn-navigate-animal" data-id="${a.id}" style="padding: 12px 16px; margin-bottom: 8px; cursor: pointer; display: flex; justify-content: space-between; align-items: center;">
                <div class="animal-info">
                  <h4 style="font-size: 14px;">${a.nombre || a.raza} <span class="animal-tag-chip">${a.id.split('-').shift()}</span></h4>
                  <p style="font-size: 12px; margin-bottom: 0;">${a.peso_actual || 0}kg • <span style="color: #4caf50; font-weight: 600;">Saludable</span></p>
                </div>
                <span class="material-icons" style="color:#ccc">chevron_right</span>
              </div>
            `).join('') : '<p style="text-align:center; padding: 24px; color:#999">No hay animales en este potrero.</p>'}
          </div>
        </div>

        <!-- Log Segment -->
        <div class="section">
          <div class="section-title">
            <h3>Bitácora de Eventos</h3>
            <button class="btn-primary" id="btn-add-potrero-note" style="padding: 6px 12px; font-size: 12px;">+ Nota</button>
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
            `).join('') : '<p style="text-align:center; padding: 24px; color:#999">No hay eventos registrados.</p>'}
          </div>
        </div>
      </div>

      <!-- Curator Suggestion -->
      <div class="tip-card" style="margin-top: 24px;">
        <span class="material-icons" style="color: #fbc02d;">lightbulb</span>
        <div>
          <p><strong>Sugerencia del Curador:</strong> Basado en la humedad del suelo actual (78%) y el crecimiento del Kikuyo, se recomienda un periodo de descanso adicional de 3 días para maximizar el rebrote proteico.</p>
        </div>
      </div>
    </div>
  `;
}

export function initDetallePotrero(potreroId) {
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
      window.navigateTo('detalle_animal', animalId);
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

function renderPotreroNoteFormModal(title, note = null, potreroId) {
  showModal(title, `
    <form id="form-potrero-note" style="display: flex; flex-direction: column; gap: 16px; padding: 8px;">
      <div class="m3-field">
        <input type="text" name="evento" placeholder=" " value="${note ? note.evento : ''}" required>
        <label>Título del Evento (ej. Riego, Fumigación)</label>
      </div>
      <div class="m3-field">
        <textarea name="descripcion" placeholder=" " style="min-height: 100px;">${note ? note.descripcion || '' : ''}</textarea>
        <label>Descripción / Observaciones</label>
      </div>
      <div class="m3-field">
        <input type="date" name="fecha" value="${note ? note.fecha : new Date().toISOString().split('T')[0]}" required>
        <label>Fecha</label>
      </div>
      <div class="m3-field">
        <select name="icon">
          <option value="history" ${note && note.icon === 'history' ? 'selected' : ''}>General</option>
          <option value="water_drop" ${note && note.icon === 'water_drop' ? 'selected' : ''}>Riego</option>
          <option value="grass" ${note && note.icon === 'grass' ? 'selected' : ''}>Abono / Siembra</option>
          <option value="bug_report" ${note && note.icon === 'bug_report' ? 'selected' : ''}>Fumigación</option>
          <option value="fence" ${note && note.icon === 'fence' ? 'selected' : ''}>Mantenimiento Cerca</option>
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
      window.navigateTo('detalle_potrero', potreroId);
    } catch (err) {
      console.error('Error saving note:', err);
      showSnackbar('Error al guardar la nota: ' + err.message, 'error');
    }
  };
}

async function confirmDeletePotreroNote(noteId, potreroId) {
  if (confirm('¿Estás seguro de que deseas eliminar esta nota?')) {
    try {
      const { error } = await supabase.from('potrero_eventos').delete().eq('id', noteId);
      if (error) throw error;
      showSnackbar('Nota eliminada');
      window.navigateTo('detalle_potrero', potreroId);
    } catch (err) {
      console.error('Error deleting note:', err);
      showSnackbar('Error al eliminar la nota', 'error');
    }
  }
}
