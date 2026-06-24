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

  let personal = [];
  try {
    const { data } = await supabase.from('personal').select('*').order('nombre', { ascending: true });
    personal = data || [];
  } catch (error) {
    console.warn('Error fetching personal for nueva_actividad:', error);
    personal = [];
  }

  return `
    <div class="m3-form-screen">
      <div class="m3-form-card">
    <div style="margin-bottom: 32px; display: flex; align-items: center; gap: 20px;">
      <div class="da-stat-icon" style="background: rgba(69, 87, 67, 0.1); color: var(--m3-primary); width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
        ${tipo === 'Fertilizante' ? '<img src="npk.png" alt="" style="width: 40px; height: 40px; object-fit: contain;">' :
          tipo === 'Manejo de Tejido' ? '<img src="tijeras-de-podar.png" alt="" style="width: 40px; height: 40px; object-fit: contain;">' :
          tipo === 'Limpieza' ? '<img src="sale-de.png" alt="" style="width: 40px; height: 40px; object-fit: contain;">' :
          tipo === 'Análisis de Suelo' ? '<img src="analisis-de-suelo.png" alt="" style="width: 40px; height: 40px; object-fit: contain;">' :
          '<span class="material-symbols-outlined" style="font-size: 32px; color: var(--m3-primary);">history_edu</span>'}
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
            <!-- 1. Método de Aplicación -->
            <div class="m3-field" id="field-metodo">
              <select name="metodo" required>
                ${methods.map((m, idx) => `<option value="${m}" ${idx === 0 ? 'selected' : ''}>${m}</option>`).join('')}
              </select>
              <label>Método de Aplicación</label>
            </div>

            <!-- 2. Fecha de Aplicación -->
            <div class="m3-field" id="field-fecha">
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
            <button type="button" id="btn-add-operador" style="position: absolute; right: 8px; top: 50%; transform: translateY(-50%); background: #2d3e2c; border: none; width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white; cursor: pointer; transition: all 0.2s; z-index: 2;">
              <span class="material-symbols-outlined" style="font-size: 20px;">add</span>
            </button>
          </div>
          <!-- Container for dynamic operator chips -->
          <div id="operadores-chips-container" style="display: flex; flex-wrap: wrap; gap: 8px; margin-top: -12px; margin-bottom: 24px; min-height: 24px;"></div>
          <!-- Hidden field to hold comma-separated string for Supabase -->
          <input type="hidden" name="operador" id="operador-hidden-input">

          <!-- 7. Observaciones -->
          <div class="m3-field" id="field-observaciones">
            <textarea name="observaciones" placeholder="Describa el estado del cultivo o cualquier novedad durante la aplicación..." rows="3"></textarea>
            <label>Observaciones / Detalles técnicos</label>
          </div>

          <!-- 8. Análisis de Suelo (only shown for this tipo) -->
          <div id="field-analisis-suelo" style="display:none;">
            <hr style="margin: 20px 0 16px; border: none; border-top: 1px solid var(--m3-outline-variant);">

            <h3 style="font-size:16px;font-weight:700;margin:0 0 12px;color:var(--m3-on-surface);">1. Datos Generales</h3>
            <div class="m3-grid-2col">
              <div class="m3-field">
                <input type="text" name="edad_cafetal" placeholder=" ">
                <label>Edad del Cafetal (años)</label>
              </div>
              <div class="m3-field">
                <select name="variedad">
                  <option value="">Seleccionar...</option>
                  <option value="Lempira">Lempira</option>
                  <option value="IHCAFE-90">IHCAFE-90</option>
                  <option value="Obata">Obata</option>
                  <option value="Catimor">Catimor</option>
                  <option value="Catuai">Catuai</option>
                  <option value="Caturra">Caturra</option>
                  <option value="Borbón">Borbón</option>
                  <option value="Típica">Típica</option>
                  <option value="Otra">Otra</option>
                </select>
                <label>Variedad</label>
              </div>
              <div class="m3-field">
                <input type="number" name="altitud" placeholder=" ">
                <label>Altitud (msnm)</label>
              </div>
              <div class="m3-field">
                <select name="sombra">
                  <option value="">Seleccionar...</option>
                  <option value="Plena exposición">Plena exposición</option>
                  <option value="Sombra (Leguminosa)">Sombra (Leguminosa)</option>
                  <option value="Sombra (Musácea)">Sombra (Musácea)</option>
                  <option value="Sombra (Frutal)">Sombra (Frutal)</option>
                  <option value="Sombra (Otra)">Sombra (Otra)</option>
                </select>
                <label>Sombra</label>
              </div>
            </div>

            <h3 style="font-size:16px;font-weight:700;margin:16px 0 12px;color:var(--m3-on-surface);">2. Parámetros Físicos</h3>
            <div class="m3-grid-2col">
              <div class="m3-field">
                <select name="textura">
                  <option value="">Seleccionar...</option>
                  <option value="Arenosa">Arenosa</option>
                  <option value="Franca">Franca (ideal)</option>
                  <option value="Arcillosa">Arcillosa</option>
                </select>
                <label>Textura</label>
              </div>
              <div class="m3-field">
                <input type="number" name="profundidad_efectiva" placeholder=" ">
                <label>Profundidad Efectiva (cm)</label>
              </div>
              <div class="m3-field">
                <select name="pendiente">
                  <option value="">Seleccionar...</option>
                  <option value="Plana">Plana</option>
                  <option value="Media">Media</option>
                  <option value="Fuerte">Fuerte</option>
                </select>
                <label>Pendiente</label>
              </div>
              <div class="m3-field">
                <select name="drenaje">
                  <option value="">Seleccionar...</option>
                  <option value="Bueno">Bueno</option>
                  <option value="Regular">Regular</option>
                  <option value="Malo">Malo</option>
                </select>
                <label>Drenaje</label>
              </div>
            </div>

            <h3 style="font-size:16px;font-weight:700;margin:16px 0 12px;color:var(--m3-on-surface);">3. Parámetros Químicos</h3>
            <div class="m3-grid-2col">
              <div class="m3-field">
                <input type="number" name="ph" step="0.1" placeholder=" ">
                <label>pH (ideal café: 5.0 – 6.0)</label>
              </div>
              <div class="m3-field">
                <input type="number" name="materia_organica" step="0.1" placeholder=" ">
                <label>Materia Orgánica (%)</label>
              </div>
              <div class="m3-field">
                <input type="number" name="cic" step="0.1" placeholder=" ">
                <label>CIC (cmol+/kg)</label>
              </div>
              <div class="m3-field">
                <input type="number" name="aluminio" step="0.01" placeholder=" ">
                <label>Aluminio Interc. (meq/100g)</label>
              </div>
            </div>

            <h3 style="font-size:16px;font-weight:700;margin:16px 0 12px;color:var(--m3-on-surface);">4. Niveles de Nutrientes</h3>
            <div class="m3-grid-2col">
              <div class="m3-field">
                <select name="n_nivel">
                  <option value="">Seleccionar...</option>
                  <option value="Bajo">Bajo</option>
                  <option value="Medio">Medio</option>
                  <option value="Alto">Alto</option>
                </select>
                <label>Nitrógeno (N)</label>
              </div>
              <div class="m3-field">
                <select name="p_nivel">
                  <option value="">Seleccionar...</option>
                  <option value="Bajo">Bajo</option>
                  <option value="Medio">Medio</option>
                  <option value="Alto">Alto</option>
                </select>
                <label>Fósforo (P)</label>
              </div>
              <div class="m3-field">
                <select name="k_nivel">
                  <option value="">Seleccionar...</option>
                  <option value="Bajo">Bajo</option>
                  <option value="Medio">Medio</option>
                  <option value="Alto">Alto</option>
                </select>
                <label>Potasio (K)</label>
              </div>
              <div class="m3-field">
                <select name="ca_nivel">
                  <option value="">Seleccionar...</option>
                  <option value="Bajo">Bajo</option>
                  <option value="Medio">Medio</option>
                  <option value="Alto">Alto</option>
                </select>
                <label>Calcio (Ca)</label>
              </div>
              <div class="m3-field">
                <select name="mg_nivel">
                  <option value="">Seleccionar...</option>
                  <option value="Bajo">Bajo</option>
                  <option value="Medio">Medio</option>
                  <option value="Alto">Alto</option>
                </select>
                <label>Magnesio (Mg)</label>
              </div>
              <div class="m3-field">
                <select name="micro_nivel">
                  <option value="">Seleccionar...</option>
                  <option value="Bajo">Bajo</option>
                  <option value="Medio">Medio</option>
                  <option value="Alto">Alto</option>
                </select>
                <label>Micronutrientes (Zn, B, Cu)</label>
              </div>
            </div>

            <h3 style="font-size:16px;font-weight:700;margin:16px 0 12px;color:var(--m3-on-surface);">5. Recomendaciones Técnicas</h3>
            <div class="m3-grid-2col">
              <div class="m3-field">
                <input type="text" name="encalado" placeholder="Ej: 2 qq/mz">
                <label>Encalado (Cal Agrícola) qq/mz</label>
              </div>
              <div class="m3-field">
                <input type="text" name="fertilizante_recomendado" placeholder="Ej: 18-46-00">
                <label>Fertilizante (Fórmula)</label>
              </div>
              <div class="m3-field" style="grid-column: 1 / -1;">
                <input type="text" name="epocas_aplicacion" placeholder="Ej: Pre-floración, Post-cosecha">
                <label>Épocas de Aplicación</label>
              </div>
            </div>
          </div>

          <div class="da-form-actions" style="border-top: none; margin-top: 24px; padding-top: 0; display: flex; justify-content: flex-end; gap: 12px;">
            <button type="button" class="da-action-btn secondary" onclick="window.navigateTo('detalle_lote', '${loteId}')" style="padding: 12px 24px; border-radius: 9999px; background: transparent; border: 1px solid var(--m3-outline); color: var(--m3-primary); font-weight: 600; font-size: 14px; cursor: pointer; font-family: 'Work Sans', sans-serif;">
              Cancelar
            </button>
            <button type="submit" class="da-action-btn primary" style="padding: 12px 32px; border-radius: 9999px; background: #2d3e2c; border: none; color: white; font-weight: 700; font-size: 14px; cursor: pointer; display: flex; align-items: center; gap: 8px; box-shadow: 0 4px 12px rgba(45,62,44,0.4); font-family: 'Work Sans', sans-serif;">
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

  // 1. DYNAMIC CONDITIONAL FIELDS
  const selectMetodo = form.querySelector('select[name="metodo"]');
  const fieldProducto = document.getElementById('field-producto');
  const fieldDosis = document.getElementById('field-dosis');
  const fieldEquipo = document.getElementById('field-equipo');
  const fieldAnalisis = document.getElementById('field-analisis-suelo');

  const updateFieldsVisibility = () => {
    if (tipo === 'Limpieza') {
      if (fieldAnalisis) fieldAnalisis.style.display = 'none';
      const metodo = selectMetodo.value;
      if (metodo === 'Manual') {
        if (fieldProducto) {
          fieldProducto.style.display = 'none';
          fieldProducto.querySelector('input').required = false;
        }
        if (fieldDosis) {
          fieldDosis.style.display = 'none';
          fieldDosis.querySelector('input').required = false;
        }
        if (fieldEquipo) {
          fieldEquipo.style.display = 'block';
          fieldEquipo.querySelector('select').required = true;
        }
      } else {
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
    } else if (tipo === 'Manejo de Tejido') {
      if (fieldAnalisis) fieldAnalisis.style.display = 'none';
      if (fieldProducto) {
        fieldProducto.style.display = 'none';
        fieldProducto.querySelector('input').required = false;
      }
      if (fieldDosis) {
        fieldDosis.style.display = 'none';
        fieldDosis.querySelector('input').required = false;
      }
      if (fieldEquipo) {
        fieldEquipo.style.display = 'none';
        fieldEquipo.querySelector('select').required = false;
      }
    } else if (tipo === 'Análisis de Suelo') {
      if (fieldProducto) {
        fieldProducto.style.display = 'none';
        fieldProducto.querySelector('input').required = false;
      }
      if (fieldDosis) {
        fieldDosis.style.display = 'none';
        fieldDosis.querySelector('input').required = false;
      }
      if (fieldEquipo) {
        fieldEquipo.style.display = 'none';
        fieldEquipo.querySelector('select').required = false;
      }
      if (fieldAnalisis) {
        fieldAnalisis.style.display = 'block';
      }
    } else {
      if (fieldAnalisis) fieldAnalisis.style.display = 'none';
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
    updateFieldsVisibility();
  }

  // Move observaciones to end and change date label for soil analysis
  if (tipo === 'Análisis de Suelo') {
    const obs = document.getElementById('field-observaciones');
    const analisis = document.getElementById('field-analisis-suelo');
    if (obs && analisis) analisis.after(obs);
    const fechaLabel = document.querySelector('#field-fecha label');
    if (fechaLabel) fechaLabel.textContent = 'Fecha de Muestreo';
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
      const equipoUsado = data.equipo_usado || '';
      data.producto = `Limpieza Manual (${equipoUsado})`;
      data.dosis = 'N/A';
      delete data.equipo_usado;
    } else {
      delete data.equipo_usado;
    }

    // Collect structured soil analysis data into observaciones
    if (tipo === 'Análisis de Suelo') {
      const soilFields = ['edad_cafetal','variedad','altitud','sombra','textura','profundidad_efectiva','pendiente','drenaje','ph','materia_organica','cic','aluminio','n_nivel','p_nivel','k_nivel','ca_nivel','mg_nivel','micro_nivel','encalado','fertilizante_recomendado','epocas_aplicacion'];
      const soilData = {};
      soilFields.forEach(k => { soilData[k] = data[k] || ''; delete data[k]; });
      data.producto = 'Análisis de Suelo';
      data.dosis = 'Completo';
      data.observaciones = data.observaciones
        ? data.observaciones + '\n\n--- DATOS DE LABORATORIO ---\n' + JSON.stringify(soilData, null, 2)
        : JSON.stringify(soilData, null, 2);
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
