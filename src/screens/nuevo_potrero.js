import { supabase } from '../supabase.js';

export async function renderNuevoPotrero(id) {
  const isEdit = !!id;
  return `
    <div class="m3-form-screen">
      <div class="m3-grid">
        <!-- Decoration / Illustration Section -->
        <div class="m3-asymmetric-section">
          <div class="m3-photo-placeholder" id="photo-dropzone">
            <input type="file" id="potrero-photo" accept="image/*" style="display: none">
            <div id="photo-preview" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <span class="material-symbols-outlined">landscape</span>
              <p style="font-weight: 800">Foto del Potrero</p>
              <p style="font-size: 11px; text-align: center; color: var(--m3-on-surface-variant); margin-top: 10px; line-height: 1.4">
                Captura la vista general del terreno.
              </p>
            </div>
          </div>

          <div class="m3-pro-tip">
             <span class="material-symbols-outlined icon">info</span>
             <div>
                <h4>Gestión de Pasturas</h4>
                <p>Configurar el ciclo de recuperación ayuda a predecir cuándo el pasto estará listo para el ganado.</p>
             </div>
          </div>
        </div>

        <!-- Form Details -->
        <div class="m3-form-card">
          <div class="m3-card-header">
            <span class="material-symbols-outlined header-icon" style="background: var(--m3-tertiary-container); color: var(--m3-on-tertiary-container)">grid_view</span>
            <h3>${isEdit ? 'Editar Potrero' : 'Nuevo Potrero'}</h3>
          </div>
          
          <form id="form-nuevo-potrero">
            <div class="m3-input-group">
              <label>Nombre del Potrero</label>
              <div class="m3-input-wrapper">
                <input type="text" name="nombre" placeholder="Ej: La Loma, Potrero Sur...">
              </div>
              <p class="error-text" id="error-nombre">El nombre es obligatorio</p>
            </div>

            <div class="m3-grid-2col">
              <div class="m3-input-group">
                <label>Área Total</label>
                <div class="m3-input-wrapper">
                  <input type="number" step="0.01" name="area" placeholder="0.00">
                  <select name="area_unidad" class="m3-unit-select" style="width: auto; font-weight: 800; color: var(--m3-outline); background: transparent; border: none; cursor: pointer;">
                    <option value="ha">Hectáreas (ha)</option>
                    <option value="m2">Metros² (m²)</option>
                    <option value="mz">Manzanas (mz)</option>
                  </select>
                </div>
              </div>

              <div class="m3-input-group">
                <label>Tipo de Pasto</label>
                <div class="m3-input-wrapper">
                  <select name="pasto">
                    <option value="Estrella">Estrella</option>
                    <option value="Brachiaria">Brachiaria</option>
                    <option value="Pangola">Pangola</option>
                    <option value="Guinea">Guinea</option>
                    <option value="Cratylia">Cratylia</option>
                    <option value="Natural">Natural / Sabana</option>
                    <option value="Otro">Otro (Especificar en ubicación)</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="m3-input-group">
              <label>Ubicación / Referencia</label>
              <div class="m3-input-wrapper">
                <span class="material-symbols-outlined" style="margin-left: 12px; color: var(--m3-outline)">location_on</span>
                <input type="text" name="ubicacion" placeholder="Coordenadas o descripción de límites">
              </div>
            </div>

            <div class="m3-grid-2col">
              <div class="m3-input-group">
                <label>Ciclo de Recuperación (Días)</label>
                <div class="m3-input-wrapper">
                  <span class="material-symbols-outlined" style="margin-left: 12px; color: var(--m3-outline)">update</span>
                  <input type="number" name="ciclo_recuperacion" value="30" placeholder="30">
                </div>
              </div>

              <div class="m3-input-group">
                <label>Último Riego</label>
                <div class="m3-input-wrapper">
                  <input type="date" name="ultimo_riego">
                </div>
              </div>
            </div>

            <!-- Internal Actions -->
            <div class="m3-form-actions">
              <button type="button" class="btn-m3-text" onclick="window.navigateTo('potreros')">Cancelar</button>
              <button type="button" class="btn-m3-primary" id="btn-save-potrero">
                <span class="material-symbols-outlined">${isEdit ? 'save' : 'add'}</span>
                <span id="save-label">${isEdit ? 'Guardar Cambios' : 'Crear Potrero'}</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

export function initNuevoPotrero(id) {
  const btnSave = document.getElementById('btn-save-potrero');
  const saveLabel = document.getElementById('save-label');
  const form = document.getElementById('form-nuevo-potrero');
  const photoInput = document.getElementById('potrero-photo');
  const dropzone = document.getElementById('photo-dropzone');
  const preview = document.getElementById('photo-preview');
  const screenTitle = document.querySelector('.m3-form-card h3');

  let selectedFile = null;
  let existingImageUrl = null;

  // If editing, load data
  if (id) {
    if (screenTitle) screenTitle.textContent = 'Editar Potrero';
    if (saveLabel) saveLabel.textContent = 'Guardar Cambios';

    supabase.from('potreros').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) {
        window.Snackbar.show('Error al cargar datos: ' + error.message, { type: 'error' });
        return;
      }
      if (data) {
        form.nombre.value = data.nombre || '';
        form.area.value = data.area || '';
        form.pasto.value = data.pasto || 'Natural';
        form.ubicacion.value = data.ubicacion || '';
        form.ciclo_recuperacion.value = data.ciclo_recuperacion || 30;
        
        if (data.ultimo_riego) {
          form.ultimo_riego.value = data.ultimo_riego.split('T')[0];
        }
        
        existingImageUrl = data.image_url;

        if (data.image_url) {
          preview.innerHTML = `<img src="${data.image_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 28px;">`;
        }
      }
    });
  }

  // Photo Selection
  if (dropzone && photoInput) {
    dropzone.onclick = () => photoInput.click();
    photoInput.onchange = (e) => {
      const file = e.target.files[0];
      if (file) {
        const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
        if (!validTypes.includes(file.type)) {
          window.Snackbar.show('Formato no válido.', { type: 'error' });
          return;
        }

        selectedFile = file;
        const reader = new FileReader();
        reader.onload = (re) => {
          preview.innerHTML = `<img src="${re.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 28px;">`;
        };
        reader.readAsDataURL(file);
      }
    };
  }

  if (!btnSave || !form) return;

  btnSave.addEventListener('click', async () => {
    // Reset errors
    document.querySelectorAll('.error-text').forEach(e => e.style.display = 'none');
    document.querySelectorAll('.m3-input-wrapper').forEach(e => e.classList.remove('error'));

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Validation
    let hasError = false;
    if (!data.nombre) {
      document.getElementById('error-nombre').style.display = 'block';
      form.nombre.parentElement.classList.add('error');
      hasError = true;
    }

    if (hasError) return;

    btnSave.disabled = true;
    btnSave.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Guardando...';

    try {
      let image_url = null;
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `potreros/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('potreros')
          .upload(filePath, selectedFile);

        if (!uploadError) {
          const { data: urlData } = supabase.storage
            .from('potreros')
            .getPublicUrl(filePath);
          image_url = urlData.publicUrl;
        }
      }

      const potreroData = {
        nombre: data.nombre,
        area: parseFloat(data.area) || 0,
        pasto: data.pasto,
        ubicacion: data.ubicacion,
        ciclo_recuperacion: parseInt(data.ciclo_recuperacion) || 30,
        ultimo_riego: data.ultimo_riego || null,
        image_url: image_url || existingImageUrl
      };

      let result;
      if (id) {
        result = await supabase.from('potreros').update(potreroData).eq('id', id);
      } else {
        result = await supabase.from('potreros').insert([potreroData]);
      }

      if (result.error) throw result.error;

      window.Snackbar.show(id ? 'Potrero actualizado' : 'Potrero creado con éxito');
      if (id) {
        window.navigateTo('detalle_potrero', id);
      } else {
        window.navigateTo('potreros');
      }
    } catch (err) {
      console.error(err);
      window.Snackbar.show('Error: ' + err.message, { type: 'error' });
    } finally {
      btnSave.disabled = false;
      const finalIcon = id ? 'save' : 'add';
      const finalLabel = id ? 'Guardar Cambios' : 'Crear Potrero';
      btnSave.innerHTML = `<span class="material-symbols-outlined">${finalIcon}</span> ${finalLabel}`;
    }
  });
}
