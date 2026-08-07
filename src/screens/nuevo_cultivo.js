import { supabase } from '../supabase.js';

const TIPOS = ['Maíz', 'Fríjol', 'Cacao', 'Yuca', 'Plátano', 'Otro'];
const ESTADOS = ['En crecimiento', 'En floración', 'Madurando', 'Cosechado'];

export async function renderNuevoCultivo(id) {
  const isEdit = !!id;
  return `
    <div class="da-screen">
      <div class="da-tabs-section" style="display: flex; flex-direction: column; gap: 40px;">
        <div class="da-hero-info">
          <div>
            <div class="da-hero-subtitle">${isEdit ? 'Actualizando cultivo' : 'Nuevo cultivo'}</div>
            <h2 class="da-hero-title">${isEdit ? 'Editar Cultivo' : 'Registrar Cultivo'}</h2>
          </div>

          <div class="da-badge-row">
            <div class="da-badge da-badge-surface">
              <span class="material-icons" style="color: #2d7d46;">agriculture</span>
              Registra cualquier cultivo de la finca. El café se gestiona en la sección Cafetal.
            </div>
          </div>
        </div>

        <div style="border-top: 1px solid #f0f0f0; padding-top: 32px;">
          <h3 style="font-size: 20px; font-weight: 800; color: #2c2c2c; margin-bottom: 24px;">Detalles del cultivo</h3>

          <form id="form-nuevo-cultivo">
            <div class="m3-grid-2col" style="margin-bottom: 20px;">
              <div class="m3-field">
                <select name="tipo" required>
                  <option value="">Seleccionar...</option>
                  ${TIPOS.map(t => `<option value="${t}">${t}</option>`).join('')}
                </select>
                <label>Tipo de cultivo</label>
                <p class="error-text" id="error-tipo">Selecciona un tipo de cultivo</p>
              </div>

              <div class="m3-field">
                <select name="lote_id" id="cultivo-lote-select">
                  <option value="">— Sin lote —</option>
                </select>
                <label>Lote (opcional)</label>
              </div>
            </div>

            <div class="m3-grid-2col" style="margin-bottom: 20px;">
              <div class="m3-field">
                <input type="date" name="fecha_siembra">
                <label>Fecha de siembra</label>
              </div>

              <div class="m3-field">
                <input type="number" name="area_ha" placeholder=" " min="0" step="0.01">
                <label>Área (hectáreas)</label>
              </div>
            </div>

            <div class="m3-field" style="margin-bottom: 20px;">
              <select name="estado_cosecha">
                ${ESTADOS.map(e => `<option value="${e}">${e}</option>`).join('')}
              </select>
              <label>Estado de la cosecha</label>
            </div>

            <div class="m3-field" style="margin-bottom: 24px;">
              <textarea name="notas" placeholder=" " rows="2" maxlength="200"></textarea>
              <label>Notas (opcional)</label>
            </div>

            <div class="da-form-actions">
              <button type="button" class="da-action-btn primary" id="btn-save-cultivo">
                <span class="material-icons">${isEdit ? 'update' : 'save'}</span>
                <span>${isEdit ? 'Actualizar cultivo' : 'Guardar cultivo'}</span>
              </button>
              <button type="button" class="da-action-btn secondary" onclick="window.navigateTo('cultivos')">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

async function loadLotes(select, selectedId) {
  select.innerHTML = '<option value="">Cargando...</option>';
  const { data, error } = await supabase.from('lotes').select('id,nombre').order('nombre', { ascending: true });
  if (error) {
    select.innerHTML = '<option value="">— Sin lote —</option>';
    return;
  }
  const opts = (data || []).map(x => `<option value="${x.id}" ${selectedId === x.id ? 'selected' : ''}>${x.nombre}</option>`).join('');
  select.innerHTML = `<option value="">— Sin lote —</option>${opts}`;
}

export async function initNuevoCultivo(id) {
  const isEdit = !!id;
  const btnSave = document.getElementById('btn-save-cultivo');
  const form = document.getElementById('form-nuevo-cultivo');
  if (!btnSave || !form) return;

  const loteSelect = document.getElementById('cultivo-lote-select');

  if (isEdit) {
    try {
      const { data, error } = await supabase.from('cultivos').select('*').eq('id', id).single();
      if (error) throw error;

      form.tipo.value = data.tipo || '';
      form.fecha_siembra.value = data.fecha_siembra || '';
      form.area_ha.value = data.area_ha != null ? parseFloat(data.area_ha) : '';
      form.estado_cosecha.value = data.estado_cosecha || 'En crecimiento';
      form.notas.value = data.notas || '';

      await loadLotes(loteSelect, data.lote_id || '');
    } catch (err) {
      console.error('Error al cargar cultivo:', err);
      window.Snackbar.show('Error al cargar datos del cultivo', { type: 'error' });
    }
  } else {
    await loadLotes(loteSelect, '');
  }

  btnSave.addEventListener('click', async () => {
    document.querySelectorAll('.error-text').forEach(e => e.style.display = 'none');
    document.querySelectorAll('.m3-field').forEach(e => e.classList.remove('error'));

    const tipo = form.tipo.value;
    const fechaSiembra = form.fecha_siembra.value || null;
    const areaHa = form.area_ha.value === '' ? 0 : (parseFloat(form.area_ha.value) || 0);
    const loteId = form.lote_id.value || null;

    if (!tipo) {
      document.getElementById('error-tipo').style.display = 'block';
      form.tipo.closest('.m3-field').classList.add('error');
      return;
    }

    const payload = {
      tipo,
      lote_id: loteId,
      fecha_siembra: fechaSiembra,
      area_ha: areaHa,
      estado_cosecha: form.estado_cosecha.value,
      notas: form.notas.value.trim() || null,
    };

    btnSave.disabled = true;
    btnSave.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> ${isEdit ? 'Actualizando...' : 'Guardando...'}`;

    try {
      if (isEdit) {
        const { error } = await supabase.from('cultivos').update(payload).eq('id', id);
        if (error) throw error;
        window.Snackbar.show('Cultivo actualizado exitosamente');
      } else {
        const { error } = await supabase.from('cultivos').insert([payload]);
        if (error) throw error;
        window.Snackbar.show('Cultivo guardado exitosamente');
      }

      window.clearScreenCache?.('cultivos');
      window.navigateTo('cultivos');
    } catch (err) {
      console.error(err);
      window.Snackbar.show('Error: ' + err.message, { type: 'error' });
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = `<span class="material-symbols-outlined">${isEdit ? 'update' : 'save'}</span> ${isEdit ? 'Actualizar cultivo' : 'Guardar cultivo'}`;
    }
  });
}
