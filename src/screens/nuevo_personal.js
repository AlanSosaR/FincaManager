import { supabase } from '../supabase.js';

export async function renderNuevoPersonal(personalId, returnScreen, returnId) {
  let persona = null;
  if (personalId) {
    const { data, error } = await supabase.from('personal').select('*').eq('id', personalId).single();
    if (!error) persona = data;
  }

  const isEdit = !!persona;
  const isFromLote = returnScreen === 'detalle_lote';
  const backAction = isFromLote
    ? `window.navigateTo('detalle_lote', '${returnId}')`
    : `window.navigateTo('personal')`;
  const title = isEdit ? 'Editar Trabajador' : 'Nuevo Trabajador';
  const subtitle = isEdit ? 'Actualiza los datos del trabajador' : 'Registro de Personal';
  const btnLabel = isEdit ? 'Actualizar Personal' : 'Guardar Personal';
  const val = (field) => persona ? (persona[field] || '') : '';

  return `
    <div class="m3-form-screen">
      <div class="m3-form-card">
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
          <button onclick="${backAction}" style="background: transparent; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 8px; border-radius: 50%; color: var(--m3-on-surface); transition: background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='transparent'" aria-label="Atrás">
            <span class="material-icons">arrow_back</span>
          </button>
          <div>
            <div class="da-hero-subtitle" style="font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--m3-on-surface-variant); letter-spacing: 0.5px;">${subtitle}</div>
            <h2 class="da-hero-title" style="margin: 0; font-size: 24px; font-family: 'Manrope', sans-serif; color: var(--m3-on-surface); font-weight: 800;">${title}</h2>
          </div>
        </div>

        <form id="form-nuevo-personal">
          ${personalId ? `<input type="hidden" name="personal_id" value="${personalId}">` : ''}
          <div class="m3-grid-2col">
            <div class="m3-field m3-col-span-2 ${val('nombre') ? 'has-value' : ''}">
              <input type="text" name="nombre" placeholder=" " value="${val('nombre')}" required>
              <label>Nombre Completo</label>
            </div>

            <div class="m3-field m3-col-span-2 ${val('rol') ? 'has-value' : ''}">
              <input type="text" name="rol" placeholder=" " value="${val('rol')}">
              <label>Rol / Cargo</label>
            </div>

            <div class="m3-field ${val('pago_diario') ? 'has-value' : ''}">
              <input type="number" name="pago_diario" placeholder=" " min="0" step="0.01" value="${val('pago_diario')}">
              <label>Pago por día (L)</label>
            </div>
          </div>

          <div class="da-form-actions" style="border-top: none; margin-top: 24px; padding-top: 0; display: flex; justify-content: flex-end; gap: 12px;">
            <button type="button" class="da-action-btn secondary" onclick="${backAction}" style="padding: 12px 24px; border-radius: 9999px; background: transparent; border: 1px solid var(--m3-outline); color: var(--m3-primary); font-weight: 600; font-size: 14px; cursor: pointer; font-family: 'Work Sans', sans-serif;">
              Cancelar
            </button>
            <button type="submit" class="da-action-btn primary" style="padding: 12px 32px; border-radius: 9999px; background: var(--m3-primary); border: none; color: var(--m3-on-primary); font-weight: 700; font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(62,111,57,0.3); font-family: 'Work Sans', sans-serif;">
              <span class="material-symbols-outlined" style="font-size: 20px;">save</span>
              <span>${btnLabel}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function initNuevoPersonal(personalId, returnScreen, returnId) {
  const form = document.getElementById('form-nuevo-personal');
  if (!form) return;

  if (window.refreshM3Fields) window.refreshM3Fields();

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    delete data.personal_id;
    data.iniciales = data.nombre.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
    if (data.pago_diario) data.pago_diario = parseFloat(data.pago_diario);

    try {
      let error;
      if (personalId) {
        ({ error } = await supabase.from('personal').update(data).eq('id', personalId));
      } else {
        ({ error } = await supabase.from('personal').insert([data]));
      }
      if (error) throw error;

      window.Snackbar.show(personalId ? 'Personal actualizado' : 'Personal registrado');

      const isFromLote = returnScreen === 'detalle_lote';
      if (isFromLote) {
        window.clearScreenCache?.('detalle_lote');
        window.navigateTo('detalle_lote', returnId);
      } else {
        window.clearScreenCache?.('personal');
        window.navigateTo('personal');
      }
    } catch (err) {
      console.error(err);
      window.Snackbar.show('Error: ' + err.message, { type: 'error' });
    }
  });

  form.querySelectorAll('input, textarea, select').forEach(el => {
    el.addEventListener('input', () => {
      const parent = el.closest('.m3-field');
      if (parent && el.value.trim() !== '') {
        parent.classList.add('has-value');
      } else if (parent) {
        parent.classList.remove('has-value');
      }
    });
  });
}
