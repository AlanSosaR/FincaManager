import { supabase } from '../supabase.js';

const methodOptionsByType = {
  'Fertilizante': ['Al voleo', 'Foliar', 'Fertirriego', 'Enterrado'],
  'Manejo de Tejido': ['Poda manual', 'Poda mecánica', 'Deschante', 'Deshoje'],
  'Limpieza': ['Manual', 'Química'],
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

  const { data: personal } = await supabase.from('personal').select('*').order('nombre', { ascending: true });

  return `
    <div class="m3-form-screen">
      <div class="m3-form-card">
        <div style="margin-bottom: 32px; display: flex; align-items: center; gap: 20px;">
          <div class="da-stat-icon" style="background: rgba(62, 111, 57, 0.1); color: var(--m3-primary); width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <span class="material-symbols-outlined" style="font-size: 32px; color: var(--m3-primary);">history_edu</span>
          </div>
          <div>
            <div class="da-hero-subtitle" style="margin: 0; font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--m3-on-surface-variant); letter-spacing: 0.5px;">Registro de Actividad</div>
            <h2 class="da-hero-title" style="margin: 0; font-size: 24px; font-family: 'Manrope', sans-serif; color: var(--m3-on-surface); font-weight: 800;">${tipo}</h2>
          </div>
        </div>

        <form id="form-nueva-aplicacion">
          <input type="hidden" name="lote_id" value="${loteId}">
          <input type="hidden" name="tipo" value="${tipo}">
          
          <div class="m3-grid-2col">
            <!-- 1. Método de Aplicación (Moved First) -->
            <div class="m3-field" id="field-metodo">
              <select name="metodo" required>
                ${methods.map((m, idx) => `<option value="${m}" ${idx === 0 ? 'selected' : ''}>${m}</option>`).join('')}
              </select>
              <label>Método de Aplicación</label>
            </div>

            <!-- 2. Fecha de Aplicación -->
            <div class="m3-field">
              <input type="date" name="fecha" value="${today}" placeholder=" " required style="color-scheme: light;">
              <label>Fecha de Aplicación</label>
            </div>

            <!-- 3. Nombre del Producto -->
            <div class="m3-field" id="field-producto">
              <input type="text" name="producto" placeholder="${ph.producto}">
              <label>Nombre del Producto</label>
            </div>

            <!-- 4. Dosis -->
            <div class="m3-field" id="field-dosis">
              <input type="text" name="dosis" placeholder="${ph.dosis}">
              <label>Dosis</label>
            </div>

            <!-- 5. Tipo de equipo usado (Conditional for Limpieza - Manual) -->
            <div class="m3-field" id="field-equipo" style="display: none;">
              <select name="equipo_usado">
                <option value="Machete" selected>Machete</option>
                <option value="Motoguadaña">Motoguadaña</option>
                <option value="Ambos">Ambos (Machete y Motoguadaña)</option>
              </select>
              <label>Tipo de equipo usado</label>
            </div>
          </div>

          <!-- 6. Operador / Responsable (Multiple Operators) -->
          <div class="m3-field" style="margin-top: 12px; position: relative; display: flex; align-items: center;">
            <input type="text" id="operador-input" list="operadores-sugeridos" placeholder=" " style="padding-right: 60px;">
            <label>Operador / Responsable</label>
            <datalist id="operadores-sugeridos">
              ${(personal || []).map(p => `<option value="${p.nombre}"></option>`).join('')}
            </datalist>
            <button type="button" id="btn-add-operador" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: var(--m3-primary); border: none; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; cursor: pointer; transition: all 0.2s; z-index: 2;">
              <span class="material-symbols-outlined" style="font-size: 20px;">add</span>
            </button>
          </div>
          <!-- Container for dynamic operator chips -->
          <div id="operadores-chips-container" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: -12px; margin-bottom: 24px; min-height: 24px;"></div>
          <!-- Hidden field to hold comma-separated string for Supabase -->
          <input type="hidden" name="operador" id="operador-hidden-input">

          <!-- 7. Observaciones -->
          <div class="m3-field">
            <textarea name="observaciones" placeholder="Describa el estado del cultivo o cualquier novedad durante la aplicación..." rows="3"></textarea>
            <label>Observaciones / Detalles técnicos</label>
          </div>

          <div class="da-form-actions" style="border-top: none; margin-top: 24px; padding-top: 0; display: flex; justify-content: flex-end; gap: 12px;">
            <button type="button" class="da-action-btn secondary" onclick="window.navigateTo('detalle_lote', '${loteId}')" style="padding: 12px 24px; border-radius: 9999px; background: transparent; border: 1px solid var(--m3-outline); color: var(--m3-primary); font-weight: 600; font-size: 14px; cursor: pointer; font-family: 'Work Sans', sans-serif;">
              Cancelar
            </button>
            <button type="submit" class="da-action-btn primary" style="padding: 12px 32px; border-radius: 9999px; background: var(--m3-primary); border: none; color: var(--m3-on-primary); font-weight: 700; font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(62,111,57,0.3); font-family: 'Work Sans', sans-serif;">
              <span class="material-symbols-outlined" style="font-size: 20px;">save</span>
              <span>Guardar Actividad</span>
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

  // 1. DYNAMIC CONDITIONAL FIELDS FOR LIMPIEZA
  const selectMetodo = form.querySelector('select[name="metodo"]');
  const fieldProducto = document.getElementById('field-producto');
  const fieldDosis = document.getElementById('field-dosis');
  const fieldEquipo = document.getElementById('field-equipo');

  const updateFieldsVisibility = () => {
    if (tipo === 'Limpieza') {
      const metodo = selectMetodo.value;
      if (metodo === 'Manual') {
        // Hide Producto and Dosis
        if (fieldProducto) {
          fieldProducto.style.display = 'none';
          fieldProducto.querySelector('input').required = false;
        }
        if (fieldDosis) {
          fieldDosis.style.display = 'none';
          fieldDosis.querySelector('input').required = false;
        }
        // Show Tipo de equipo usado
        if (fieldEquipo) {
          fieldEquipo.style.display = 'block';
          fieldEquipo.querySelector('select').required = true;
        }
      } else {
        // Química or others
        if (fieldProducto) {
          fieldProducto.style.display = 'block';
          fieldProducto.querySelector('input').required = true;
        }
        if (fieldDosis) {
          fieldDosis.style.display = 'block';
          fieldDosis.querySelector('input').required = true;
        }
        if (fieldEquipo) {
          fieldEquipo.style.display = 'none';
          fieldEquipo.querySelector('select').required = false;
        }
      }
    } else {
      // For non-Limpieza, hide equipo and ensure product/dosis are shown and required
      if (fieldEquipo) {
        fieldEquipo.style.display = 'none';
        fieldEquipo.querySelector('select').required = false;
      }
      if (fieldProducto) {
        fieldProducto.style.display = 'block';
        fieldProducto.querySelector('input').required = true;
      }
      if (fieldDosis) {
        fieldDosis.style.display = 'block';
        fieldDosis.querySelector('input').required = true;
      }
    }
  };

  if (selectMetodo) {
    selectMetodo.addEventListener('change', updateFieldsVisibility);
    // Trigger initial run
    updateFieldsVisibility();
  }

  // 2. MULTIPLE OPERATORS UX LOGIC
  const listOperadores = [];
  const inputOperador = document.getElementById('operador-input');
  const btnAddOperador = document.getElementById('btn-add-operador');
  const chipsContainer = document.getElementById('operadores-chips-container');
  const hiddenOperador = document.getElementById('operador-hidden-input');

  const updateChips = () => {
    chipsContainer.innerHTML = listOperadores.map(name => `
      <div class="m3-chip" style="background: rgba(62, 111, 57, 0.08); border: 1px solid var(--m3-primary); border-radius: 8px; padding: 6px 12px; display: flex; align-items: center; gap: 6px; font-family: 'Work Sans', sans-serif; font-size: 13px; font-weight: 600; color: var(--m3-primary); cursor: pointer; transition: all 0.2s;" data-name="${name}">
        <span>${name}</span>
        <span class="material-symbols-outlined" style="font-size: 16px; color: var(--m3-primary);">close</span>
      </div>
    `).join('');

    // Attach click events to remove them
    chipsContainer.querySelectorAll('.m3-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        const name = chip.getAttribute('data-name');
        const idx = listOperadores.indexOf(name);
        if (idx > -1) {
          listOperadores.splice(idx, 1);
          updateChips();
        }
      });
    });

    // Update the hidden input
    hiddenOperador.value = listOperadores.join(', ');
  };

  const addOperador = () => {
    const val = inputOperador.value.trim();
    if (val && !listOperadores.includes(val)) {
      listOperadores.push(val);
      updateChips();
      inputOperador.value = '';
      inputOperador.focus();
    }
  };

  if (btnAddOperador && inputOperador) {
    btnAddOperador.addEventListener('click', addOperador);
    inputOperador.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        addOperador();
      }
    });
  }

  // 3. SUBMIT LOGIC
  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    // If there is still a typed name in the operator input, add it
    if (inputOperador && inputOperador.value.trim()) {
      const val = inputOperador.value.trim();
      if (!listOperadores.includes(val)) {
        listOperadores.push(val);
        updateChips();
      }
      inputOperador.value = '';
    }

    if (listOperadores.length === 0) {
      window.Snackbar.show('Por favor agregue al menos un operador', { type: 'warning' });
      return;
    }

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    // Clean up or map manual cleaning equipment to product
    if (tipo === 'Limpieza' && data.metodo === 'Manual') {
      data.producto = `Limpieza Manual (${data.equipo_usado})`;
      data.dosis = 'N/A'; // Manual cleaning
      delete data.equipo_usado; // Clean database submit object
    }

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
