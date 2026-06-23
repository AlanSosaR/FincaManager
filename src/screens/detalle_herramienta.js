import { supabase } from '../supabase.js';
import { showModal, closeModal } from '../modals.js';
import { showSnackbar } from '../snackbar.js';

export async function renderDetalleHerramienta(toolId) {
  const { data: tool, error: toolError } = await supabase
    .from('herramientas')
    .select('*')
    .eq('id', toolId)
    .single();

  const { data: mantenimientos, error: mantError } = await supabase
    .from('herramienta_mantenimientos')
    .select('*')
    .eq('herramienta_id', toolId)
    .order('fecha', { ascending: false });

  if (toolError) {
    console.error('Error fetching tool:', toolError);
    return `<div class="screen-detalle"><p>Error cargando herramienta: ${toolError.message}</p></div>`;
  }

  const toolData = {
    id: tool.id,
    nombre: tool.nombre || 'Sin Nombre',
    ubicacion: tool.ubicacion || 'Bodega',
    icon: tool.icon || '🛠️',
    color: tool.color || '#fff',
    categoria: tool.categoria || 'General',
    estado: tool.estado || 'Disponible',
  };


  return `
    <div class="screen-detalle">

      <!-- Hero Section -->
      <div class="detail-hero card" style="background: linear-gradient(135deg, ${toolData.color}20 0%, ${toolData.color}40 100%); border-left: 6px solid ${toolData.color};">
        <div class="detail-hero-header" style="justify-content: space-between; width: 100%;">
          <div style="display: flex; align-items: center; gap: 16px;">
            <div class="detail-hero-icon" style="background: ${toolData.color}; color: white; width: 64px; height: 64px; border-radius: 16px; display: flex; align-items: center; justify-content: center; font-size: 32px;">
              ${toolData.icon}
            </div>
            <div>
              <h2 style="margin: 0;">${toolData.nombre}</h2>
              <p class="detail-subtitle" style="margin: 4px 0 0 0; opacity: 0.8; display: flex; align-items: center; gap: 4px;">
                <span class="material-icons" style="font-size: 16px;">location_on</span>
                ${toolData.ubicacion}
              </p>
            </div>
          </div>
          <button class="btn-m3-text" onclick="window.navigateTo('nueva_herramienta', '${tool.id}')" style="min-width: 48px; border-radius: 50%; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;">
            <span class="material-symbols-outlined">edit</span>
          </button>
        </div>

        <div class="detail-stats" style="margin-top: 24px; display: grid; grid-template-columns: repeat(auto-fit, minmax(100px, 1fr)); gap: 16px;">
          <div class="detail-stat-item">
            <span class="detail-stat-label">Categoría</span>
            <span class="detail-stat-value" style="font-size: 16px; font-weight: 600;">${toolData.categoria}</span>
          </div>
          <div class="detail-stat-item">
            <span class="detail-stat-label">Estado</span>
            <span class="tag" style="background: ${toolData.estado === 'Disponible' ? '#e4fd97' : '#fff3e0'}; color: ${toolData.estado === 'Disponible' ? '#2d3e2c' : '#ef6c00'}; font-size: 12px; margin-top: 4px; display: inline-block;">
              ${toolData.estado}
            </span>
          </div>
          <div class="detail-stat-item">
            <span class="detail-stat-label">ID</span>
            <span class="detail-stat-value" style="font-size: 16px; font-weight: 600;">${toolData.id.split('-').shift()}</span>
          </div>
        </div>
      </div>

      <div class="grid-2" style="margin-top: 24px;">
        <!-- Maintenance History Segment -->
        <div class="section">
          <div class="section-title" style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <h3 style="margin: 0;">Historial de Mantenimiento</h3>
            <button class="btn-primary" id="btn-add-tool-maintenance" style="padding: 6px 12px; font-size: 12px;">+ Registro</button>
          </div>
          <div class="activity-list">
            ${mantenimientos && mantenimientos.length > 0 ? mantenimientos.map(m => `
              <div class="activity-item card" style="padding: 12px; margin-bottom: 12px; display: flex; align-items: center; gap: 12px; cursor: default;">
                <div class="activity-icon" style="background: ${m.color || '#4caf50'}15; color: ${m.color || '#4caf50'}; width: 40px; height: 40px; border-radius: 12px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                  <span class="material-icons" style="font-size: 20px;">${m.icon || 'settings'}</span>
                </div>
                <div class="activity-content" style="flex: 1;">
                   <h4 style="font-size: 14px; font-weight: 600; margin: 0;">${m.evento}</h4>
                   <p style="font-size: 12px; color: #666; margin: 2px 0;">${m.descripcion || ''}</p>
                   <span class="history-date" style="font-size: 10px; color: #aaa;">${new Date(m.fecha).toLocaleDateString()}</span>
                </div>
                <div class="activity-actions" style="display: flex; gap: 4px;">
                  <button class="btn-m3-text btn-edit-mant" data-id="${m.id}" style="padding: 4px; min-width: 32px; height: 32px; border-radius: 50%;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
                  </button>
                  <button class="btn-m3-text btn-delete-mant" data-id="${m.id}" style="padding: 4px; min-width: 32px; height: 32px; border-radius: 50%; color: #ff4103;">
                    <span class="material-symbols-outlined" style="font-size: 18px;">delete</span>
                  </button>
                </div>
              </div>
            `).join('') : '<p style="text-align:center; padding: 24px; color:#999">No hay registros de mantenimiento.</p>'}
          </div>
        </div>
      </div>
    </div>
  `;
}

export function initDetalleHerramienta(toolId) {
  const btnAddMant = document.getElementById('btn-add-tool-maintenance');
  if (btnAddMant) {
    btnAddMant.addEventListener('click', () => {
      showAddToolMaintenanceModal(toolId);
    });
  }

  // Edit maintenance record
  const btnEditMants = document.querySelectorAll('.btn-edit-mant');
  btnEditMants.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mantId = btn.getAttribute('data-id');
      showEditToolMaintenanceModal(mantId, toolId);
    });
  });

  // Delete maintenance record
  const btnDeleteMants = document.querySelectorAll('.btn-delete-mant');
  btnDeleteMants.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const mantId = btn.getAttribute('data-id');
      confirmDeleteToolMaintenance(mantId, toolId);
    });
  });
}

function showAddToolMaintenanceModal(toolId) {
  renderToolMaintenanceFormModal('Nuevo Registro de Mantenimiento', null, toolId);
}

async function showEditToolMaintenanceModal(mantId, toolId) {
  const { data: mant, error } = await supabase
    .from('herramienta_mantenimientos')
    .select('*')
    .eq('id', mantId)
    .single();

  if (error) {
    showSnackbar('Error al cargar el registro', 'error');
    return;
  }

  renderToolMaintenanceFormModal('Editar Registro de Mantenimiento', mant, toolId);
}

function renderToolMaintenanceFormModal(title, mant = null, toolId) {
  showModal(title, `
    <form id="form-tool-maintenance" style="display: flex; flex-direction: column; gap: 16px; padding: 8px;">
      <div class="m3-field">
        <input type="text" name="evento" placeholder=" " value="${mant ? mant.evento : ''}" required>
        <label>Título del Evento (ej. Afilado, Limpieza)</label>
      </div>
      <div class="m3-field">
        <textarea name="descripcion" placeholder=" " style="min-height: 100px;">${mant ? mant.descripcion || '' : ''}</textarea>
        <label>Descripción / Observaciones</label>
      </div>
      <div class="m3-field">
        <input type="date" name="fecha" value="${mant ? mant.fecha : new Date().toISOString().split('T')[0]}" required>
        <label>Fecha</label>
      </div>
      <div class="m3-field">
        <select name="icon">
          <option value="settings" ${mant && mant.icon === 'settings' ? 'selected' : ''}>General</option>
          <option value="build" ${mant && mant.icon === 'build' ? 'selected' : ''}>Reparación</option>
          <option value="cleaning_services" ${mant && mant.icon === 'cleaning_services' ? 'selected' : ''}>Limpieza</option>
          <option value="content_cut" ${mant && mant.icon === 'content_cut' ? 'selected' : ''}>Afilado</option>
          <option value="oil_barrel" ${mant && mant.icon === 'oil_barrel' ? 'selected' : ''}>Lubricación</option>
        </select>
        <label>Ícono</label>
      </div>
      <div class="m3-field">
        <input type="color" name="color" value="${mant ? mant.color : '#4caf50'}" style="height: 48px; padding: 4px;">
        <label>Color de Categoría</label>
      </div>
      <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
        <button type="button" class="btn-m3-tonal" id="btn-cancel-mant">Cancelar</button>
        <button type="submit" class="btn-m3-fill">Guardar</button>
      </div>
    </form>
  `);

  document.getElementById('btn-cancel-mant').onclick = closeModal;

  document.getElementById('form-tool-maintenance').onsubmit = async (e) => {
    e.preventDefault();
    const formData = new FormData(e.target);
    const data = {
      herramienta_id: toolId,
      evento: formData.get('evento'),
      descripcion: formData.get('descripcion'),
      fecha: formData.get('fecha'),
      icon: formData.get('icon'),
      color: formData.get('color')
    };

    try {
      let result;
      if (mant) {
        result = await supabase.from('herramienta_mantenimientos').update(data).eq('id', mant.id);
      } else {
        result = await supabase.from('herramienta_mantenimientos').insert(data);
      }

      if (result.error) throw result.error;

      showSnackbar(mant ? 'Registro actualizado' : 'Registro agregado');
      closeModal();
      window.navigateTo('detalle_herramienta', toolId);
    } catch (err) {
      console.error('Error saving maintenance record:', err);
      showSnackbar('Error al guardar: ' + err.message, 'error');
    }
  };
}

async function confirmDeleteToolMaintenance(mantId, toolId) {
  if (confirm('¿Estás seguro de que deseas eliminar este registro?')) {
    try {
      const { error } = await supabase.from('herramienta_mantenimientos').delete().eq('id', mantId);
      if (error) throw error;
      showSnackbar('Registro eliminado');
      window.navigateTo('detalle_herramienta', toolId);
    } catch (err) {
      console.error('Error deleting maintenance record:', err);
      showSnackbar('Error al eliminar el registro', 'error');
    }
  }
}
