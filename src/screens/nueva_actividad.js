import { supabase } from '../supabase.js';

const methodOptionsByType = {
  'Fertilizante': ['Al voleo', 'Foliar', 'Fertirriego', 'Enterrado'],
  'Manejo de Tejido': ['Poda manual', 'Poda mecánica', 'Deschante', 'Deshoje'],
  'Limpieza': ['Manual', 'Mecánica', 'Química'],
  'Análisis de Suelo': ['Muestreo compuesto', 'Muestreo simple', 'Análisis foliar']
};

const placeholdersByType = {
  'Fertilizante': { producto: 'Nombre comercial', dosis: 'Ej: 150g / planta' },
  'Manejo de Tejido': { producto: 'Ej: Poda de formación', dosis: 'Ej: 2 horas / 50 plantas' },
  'Limpieza': { producto: 'Ej: Limpieza manual', dosis: 'Ej: 2 horas / 50 plantas' },
  'Análisis de Suelo': { producto: 'Ej: Muestreo de pH', dosis: 'Ej: 5 muestras / ha' }
};

export async function renderNuevaActividad(loteId, tipo) {
  const today = new Date().toISOString().split('T')[0];
  const ph = placeholdersByType[tipo] || { producto: '', dosis: '' };
  const methods = methodOptionsByType[tipo] || [''];

  return `
    <div style="padding: 24px; max-width: 900px; margin: 0 auto;">
      <div class="m3-card m3-p-8" style="border-radius: 32px;">
        <div class="m3-mb-6">
          <h3 class="m3-headline-small m3-font-bold m3-text-on-surface m3-font-manrope">Registro de Aplicación: ${tipo}</h3>
          <p class="m3-text-on-surface-variant m3-body-medium m3-mt-1">Complete los detalles técnicos para el seguimiento de ${tipo.toLowerCase()}.</p>
        </div>
        <form id="form-nueva-aplicacion">
          <input type="hidden" name="lote_id" value="${loteId}">
          <input type="hidden" name="tipo" value="${tipo}">
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 20px 32px;">
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 14px; font-weight: 600; padding-left: 4px;">Nombre del Producto</label>
              <input type="text" name="producto" placeholder="${ph.producto}" required style="width: 100%; background: var(--m3-surface-container-highest); border: none; border-radius: 9999px; padding: 12px 20px; font-size: 14px; font-family: 'Work Sans', sans-serif; color: var(--m3-on-surface); outline: none; box-sizing: border-box;" onfocus="this.style.outline='2px solid var(--m3-primary)'" onblur="this.style.outline='none'">
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 14px; font-weight: 600; padding-left: 4px;">Dosis</label>
              <input type="text" name="dosis" placeholder="${ph.dosis}" required style="width: 100%; background: var(--m3-surface-container-highest); border: none; border-radius: 9999px; padding: 12px 20px; font-size: 14px; font-family: 'Work Sans', sans-serif; color: var(--m3-on-surface); outline: none; box-sizing: border-box;" onfocus="this.style.outline='2px solid var(--m3-primary)'" onblur="this.style.outline='none'">
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 14px; font-weight: 600; padding-left: 4px;">Fecha de Aplicación</label>
              <input type="date" name="fecha" value="${today}" style="width: 100%; background: var(--m3-surface-container-highest); border: none; border-radius: 9999px; padding: 12px 20px; font-size: 14px; font-family: 'Work Sans', sans-serif; color: var(--m3-on-surface); outline: none; box-sizing: border-box; color-scheme: light;" onfocus="this.style.outline='2px solid var(--m3-primary)'" onblur="this.style.outline='none'">
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              <label style="font-size: 14px; font-weight: 600; padding-left: 4px;">Método de Aplicación</label>
              <select name="metodo" style="width: 100%; background: var(--m3-surface-container-highest); border: none; border-radius: 9999px; padding: 12px 20px; font-size: 14px; font-family: 'Work Sans', sans-serif; color: var(--m3-on-surface); outline: none; box-sizing: border-box; appearance: none; cursor: pointer;" onfocus="this.style.outline='2px solid var(--m3-primary)'" onblur="this.style.outline='none'">
                ${methods.map(m => `<option>${m}</option>`).join('')}
              </select>
            </div>
          </div>
          <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 14px; font-weight: 600; padding-left: 4px;">Operador / Responsable</label>
            <input type="text" name="operador" placeholder="Nombre del trabajador" style="width: 100%; background: var(--m3-surface-container-highest); border: none; border-radius: 9999px; padding: 12px 20px; font-size: 14px; font-family: 'Work Sans', sans-serif; color: var(--m3-on-surface); outline: none; box-sizing: border-box;" onfocus="this.style.outline='2px solid var(--m3-primary)'" onblur="this.style.outline='none'">
          </div>
          <div style="margin-top: 20px; display: flex; flex-direction: column; gap: 6px;">
            <label style="font-size: 14px; font-weight: 600; padding-left: 4px;">Observaciones</label>
            <textarea name="observaciones" placeholder="Describa el estado del cultivo o cualquier novedad durante la aplicación..." rows="3" style="width: 100%; background: var(--m3-surface-container-highest); border: none; border-radius: 16px; padding: 14px 20px; font-size: 14px; font-family: 'Work Sans', sans-serif; color: var(--m3-on-surface); outline: none; box-sizing: border-box; resize: vertical;" onfocus="this.style.outline='2px solid var(--m3-primary)'" onblur="this.style.outline='none'"></textarea>
          </div>
          <div style="margin-top: 24px; display: flex; justify-content: flex-end; gap: 12px;">
            <button type="button" onclick="window.navigateTo('detalle_lote', '${loteId}')" style="padding: 10px 24px; border-radius: 9999px; background: transparent; border: none; color: var(--m3-primary); font-weight: 600; font-size: 14px; cursor: pointer; font-family: 'Work Sans', sans-serif;">Cancelar</button>
            <button type="submit" style="padding: 12px 40px; border-radius: 9999px; background: var(--m3-primary); border: none; color: var(--m3-on-primary); font-weight: 700; font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(62,111,57,0.3); font-family: 'Work Sans', sans-serif;">
              <span class="material-symbols-outlined" style="font-size: 20px;">save</span> Guardar Actividad
            </button>
          </div>
        </form>
      </div>
    </div>
  `;
}

export function initNuevaActividad(loteId, tipo) {
  const form = document.getElementById('form-nueva-aplicacion');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    try {
      const { error } = await supabase.from('lote_aplicaciones').insert([data]);
      if (error) throw error;

      window.Snackbar.show('Actividad registrada');
      window.clearScreenCache?.('detalle_lote');
      window.navigateTo('detalle_lote', loteId);
    } catch (err) {
      console.error(err);
      window.Snackbar.show('Error: ' + err.message, { type: 'error' });
    }
  });
}
