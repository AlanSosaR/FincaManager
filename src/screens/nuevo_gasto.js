import { supabase } from '../supabase.js';

const CATEGORIAS = ['Veterinaria', 'Insumos Agrícolas', 'Foliares/Abonos', 'Maquinaria', 'Personal', 'Otro'];
const VINCULO_TABLES = { lote: 'lotes', animal: 'ganado', herramienta: 'herramientas' };

function todayLocal() {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export async function renderNuevoGasto(id) {
  const isEdit = !!id;
  return `
    <div class="da-screen">
      <div class="da-tabs-section" style="display: flex; flex-direction: column; gap: 40px;">
        <div class="da-hero-info">
          <div>
            <div class="da-hero-subtitle">${isEdit ? 'Actualizando registro' : 'Nuevo gasto'}</div>
            <h2 class="da-hero-title">${isEdit ? 'Editar Gasto' : 'Registrar Gasto'}</h2>
          </div>

          <div class="da-badge-row">
            <div class="da-badge da-badge-surface">
              <span class="material-icons" style="color: #2d7d46;">savings</span>
              Registrar los gastos en un solo lugar ayuda a controlar los costos de la finca.
            </div>
          </div>
        </div>

        <div style="border-top: 1px solid #f0f0f0; padding-top: 32px;">
          <h3 style="font-size: 20px; font-weight: 800; color: #2c2c2c; margin-bottom: 24px;">Detalles del gasto</h3>

          <form id="form-nuevo-gasto">
            <div class="m3-grid-2col" style="margin-bottom: 20px;">
              <div class="m3-field">
                <input type="date" name="fecha" value="${isEdit ? '' : todayLocal()}" required>
                <label>Fecha</label>
                <p class="error-text" id="error-fecha">La fecha es obligatoria</p>
              </div>

              <div class="m3-field">
                <select name="categoria" required>
                  <option value="">Seleccionar...</option>
                  ${CATEGORIAS.map(c => `<option value="${c}">${c}</option>`).join('')}
                </select>
                <label>Categoría</label>
                <p class="error-text" id="error-categoria">Selecciona una categoría</p>
              </div>
            </div>

            <div class="m3-field" style="margin-bottom: 20px;">
              <input type="text" name="descripcion" placeholder=" " maxlength="120">
              <label>Descripción corta (Ej. Reparación de motosierra)</label>
            </div>

            <div class="m3-grid-2col" style="margin-bottom: 20px;">
              <div class="m3-field">
                <input type="number" name="monto" placeholder=" " min="0" step="0.01" required>
                <label>Monto (L)</label>
                <p class="error-text" id="error-monto">El monto debe ser mayor a 0</p>
              </div>

              <div class="m3-field">
                <select name="vinculo_tipo">
                  <option value="">— Sin vínculo —</option>
                  <option value="lote">Lote</option>
                  <option value="animal">Animal</option>
                  <option value="herramienta">Herramienta</option>
                </select>
                <label>Vincular a (opcional)</label>
              </div>
            </div>

            <div class="m3-field" id="gasto-vinculo-field" style="margin-bottom: 20px; display: none;">
              <select name="vinculo_id" id="gasto-vinculo-id">
                <option value="">Cargando...</option>
              </select>
              <label id="gasto-vinculo-label">Registro vinculado</label>
            </div>

            <div class="da-form-actions">
              <button type="button" class="da-action-btn primary" id="btn-save-gasto">
                <span class="material-icons">${isEdit ? 'update' : 'save'}</span>
                <span>${isEdit ? 'Actualizar gasto' : 'Guardar gasto'}</span>
              </button>
              <button type="button" class="da-action-btn secondary" onclick="window.navigateTo('gastos')">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

async function loadVinculos(tipo, select, field, label) {
  const table = VINCULO_TABLES[tipo];
  if (!table) {
    field.style.display = 'none';
    select.innerHTML = '';
    return;
  }
  field.style.display = 'block';
  label.textContent = tipo === 'lote' ? 'Lote vinculado' : tipo === 'animal' ? 'Animal vinculado' : 'Herramienta vinculada';
  select.innerHTML = '<option value="">Cargando...</option>';
  const { data, error } = await supabase.from(table).select('id,nombre').order('nombre', { ascending: true });
  if (error) {
    select.innerHTML = '';
    return;
  }
  select.innerHTML = (data || []).map(x => `<option value="${x.id}">${x.nombre}</option>`).join('');
}

export async function initNuevoGasto(id) {
  const isEdit = !!id;
  const btnSave = document.getElementById('btn-save-gasto');
  const form = document.getElementById('form-nuevo-gasto');
  if (!btnSave || !form) return;

  const vinculoField = document.getElementById('gasto-vinculo-field');
  const vinculoSelect = document.getElementById('gasto-vinculo-id');
  const vinculoLabel = document.getElementById('gasto-vinculo-label');

  form.vinculo_tipo.addEventListener('change', async (e) => {
    await loadVinculos(e.target.value, vinculoSelect, vinculoField, vinculoLabel);
  });

  if (isEdit) {
    try {
      const { data, error } = await supabase.from('gastos').select('*').eq('id', id).single();
      if (error) throw error;

      form.fecha.value = data.fecha || '';
      form.categoria.value = data.categoria || '';
      form.descripcion.value = data.descripcion || '';
      form.monto.value = data.monto != null ? Number(data.monto) : '';

      let tipo = '';
      if (data.lote_id) tipo = 'lote';
      else if (data.animal_id) tipo = 'animal';
      else if (data.herramienta_id) tipo = 'herramienta';

      if (tipo) {
        form.vinculo_tipo.value = tipo;
        await loadVinculos(tipo, vinculoSelect, vinculoField, vinculoLabel);
        vinculoSelect.value = data.lote_id || data.animal_id || data.herramienta_id || '';
      }
    } catch (err) {
      console.error('Error al cargar gasto:', err);
      window.Snackbar.show('Error al cargar datos del gasto', { type: 'error' });
    }
  }

  btnSave.addEventListener('click', async () => {
    document.querySelectorAll('.error-text').forEach(e => e.style.display = 'none');
    document.querySelectorAll('.m3-field').forEach(e => e.classList.remove('error'));

    const fecha = form.fecha.value;
    const categoria = form.categoria.value;
    const monto = parseFloat(form.monto.value);
    const descripcion = form.descripcion.value.trim();

    let hasError = false;
    const markError = (elId, field) => {
      const errEl = document.getElementById(elId);
      if (errEl) errEl.style.display = 'block';
      const input = form.querySelector(`[name="${field}"]`);
      if (input) input.closest('.m3-field').classList.add('error');
      hasError = true;
    };

    if (!fecha) markError('error-fecha', 'fecha');
    if (!categoria) markError('error-categoria', 'categoria');
    if (isNaN(monto) || monto <= 0) markError('error-monto', 'monto');

    if (hasError) return;

    const vinculoTipo = form.vinculo_tipo.value;
    const vinculoId = vinculoTipo ? form.vinculo_id.value : '';

    const payload = {
      fecha,
      categoria,
      descripcion: descripcion || null,
      monto,
      lote_id: vinculoTipo === 'lote' && vinculoId ? vinculoId : null,
      animal_id: vinculoTipo === 'animal' && vinculoId ? vinculoId : null,
      herramienta_id: vinculoTipo === 'herramienta' && vinculoId ? vinculoId : null,
    };

    btnSave.disabled = true;
    btnSave.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> ${isEdit ? 'Actualizando...' : 'Guardando...'}`;

    try {
      if (isEdit) {
        const { error } = await supabase.from('gastos').update(payload).eq('id', id);
        if (error) throw error;
        window.Snackbar.show('Gasto actualizado exitosamente');
      } else {
        const { error } = await supabase.from('gastos').insert([payload]);
        if (error) throw error;
        window.Snackbar.show('Gasto guardado exitosamente');
      }

      window.clearScreenCache?.('gastos');
      window.navigateTo('gastos');
    } catch (err) {
      console.error(err);
      window.Snackbar.show('Error: ' + err.message, { type: 'error' });
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = `<span class="material-symbols-outlined">${isEdit ? 'update' : 'save'}</span> ${isEdit ? 'Actualizar gasto' : 'Guardar gasto'}`;
    }
  });
}
