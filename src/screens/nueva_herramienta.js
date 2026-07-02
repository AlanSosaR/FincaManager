import { supabase } from '../supabase.js';

export async function renderNuevaHerramienta(id) {
  const isEdit = !!id;
  return `
    <div class="da-screen">
      <div class="da-tabs-section" style="display: flex; flex-direction: column; gap: 40px;">
        <div class="m3-grid">
          <!-- Photo and Tips -->
          <div class="da-hero-img-wrap" id="photo-dropzone" style="cursor: pointer; border: 2px dashed rgba(0, 71, 65, 0.3); background: #f0ede4;">
            <input type="file" id="tool-photo" accept="image/*" style="display: none">
            <div id="photo-preview" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; transition: all 0.3s;">
               <div class="da-stat-icon" style="background: rgba(107, 130, 69, 0.1); color: #6b8245; width: 80px; height: 80px; border-radius: 50%;">
                  <span class="material-icons" style="font-size: 40px;">photo_camera</span>
               </div>
               <div style="text-align: center;">
                  <p style="font-weight: 800; color: #2c2c2c; margin: 0;">${isEdit ? 'Cambiar Fotografía' : 'Subir foto de la herramienta'}</p>
                  <p style="font-size: 12px; color: #888; margin-top: 4px;">Formatos JPG, PNG hasta 10MB.</p>
               </div>
            </div>
          </div>

          <div class="da-hero-info">
            <div>
              <div class="da-hero-subtitle">${isEdit ? 'Actualizando inventario' : 'Nueva herramienta'}</div>
              <h2 class="da-hero-title">${isEdit ? 'Editar Herramienta' : 'Detalles de Herramienta'}</h2>
            </div>
            
            <div class="da-badge-row">
              <div class="da-badge da-badge-surface">
                <span class="material-icons" style="color: #fbc02d;">lightbulb</span>
                Mantener el inventario actualizado ayuda a prevenir pérdidas y planificar compras.
              </div>
            </div>
          </div>
        </div>

        <div style="border-top: 1px solid #f0f0f0; padding-top: 32px;">
          <h3 style="font-size: 20px; font-weight: 800; color: #2c2c2c; margin-bottom: 24px;">Especificaciones</h3>
          
          <form id="form-nueva-herramienta">
            <div class="m3-grid-2col" style="margin-bottom: 20px;">
              <div class="m3-field">
                <input type="text" name="nombre" placeholder=" " required>
                <label>Nombre de la herramienta (Ej. Motosierra MS 170)</label>
                <p class="error-text" id="error-nombre">El nombre es obligatorio</p>
              </div>

              <div class="m3-field">
                <select name="categoria" required>
                  <option value="Manual">Herramienta Manual</option>
                  <option value="Eléctrica">Eléctrica</option>
                  <option value="Combustión">Combustión</option>
                  <option value="Medición">Medición</option>
                  <option value="Protección">Protección</option>
                  <option value="Otro">Otro</option>
                </select>
                <label>Categoría</label>
              </div>
            </div>

            <div class="m3-grid-2col" style="margin-bottom: 20px;">
              <div class="m3-field">
                <input type="text" name="ubicacion" placeholder=" ">
                <label>Ubicación (Ej. Bodega Principal)</label>
              </div>

              <div class="m3-field">
                <select name="estado" required>
                  <option value="Disponible">Disponible</option>
                  <option value="Reparación">En Reparación</option>
                  <option value="Baja">Dada de Baja</option>
                </select>
                <label>Estado actual</label>
              </div>
            </div>

            <div class="m3-field" style="margin-bottom: 24px;">
              <input type="text" name="icon" placeholder=" " value="🛠️">
              <label>Icono / Emoji</label>
            </div>

            <div class="da-form-actions">
              <button type="button" class="da-action-btn primary" id="btn-save-tool">
                <span class="material-icons">${isEdit ? 'update' : 'save'}</span>
                <span>${isEdit ? 'Actualizar herramienta' : 'Guardar herramienta'}</span>
              </button>
              <button type="button" class="da-action-btn secondary" onclick="window.navigateTo('herramientas')">
                Cancelar
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

export async function initNuevaHerramienta(id) {
  const isEdit = !!id;
  const btnSave = document.getElementById('btn-save-tool');
  const form = document.getElementById('form-nueva-herramienta');
  const photoInput = document.getElementById('tool-photo');
  const dropzone = document.getElementById('photo-dropzone');
  const preview = document.getElementById('photo-preview');

  let selectedFile = null;
  let currentImageUrl = null;

  if (isEdit) {
    try {
      const { data, error } = await supabase.from('herramientas').select('*').eq('id', id).single();
      if (error) throw error;

      // Fill form
      form.nombre.value = data.nombre || '';
      form.categoria.value = data.categoria || 'Manual';
      form.ubicacion.value = data.ubicacion || '';
      form.estado.value = data.estado || 'Disponible';
      form.icon.value = data.icon || '🛠️';
      
      if (data.image_url) {
        currentImageUrl = data.image_url;
        preview.innerHTML = `<img src="${data.image_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">`;
      }
    } catch (err) {
      console.error('Error al cargar herramienta:', err);
      window.Snackbar.show('Error al cargar datos de la herramienta', { type: 'error' });
    }
  }

  // Photo Selection
  dropzone.onclick = () => photoInput.click();
  photoInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      selectedFile = file;
      const reader = new FileReader();
      reader.onload = (re) => {
        preview.innerHTML = `<img src="${re.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">`;
      };
      reader.readAsDataURL(file);
    }
  };

  if (!btnSave || !form) return;

  btnSave.addEventListener('click', async () => {
    // Reset errors
    document.querySelectorAll('.error-text').forEach(e => e.style.display = 'none');
    document.querySelectorAll('.m3-field').forEach(e => e.classList.remove('error'));

    const formData = new FormData(form);
    const formDataObj = Object.fromEntries(formData.entries());
    
    // Validation
    let hasError = false;
    if (!formDataObj.nombre) {
      document.getElementById('error-nombre').style.display = 'block';
      document.querySelector('input[name="nombre"]').closest('.m3-field').classList.add('error');
      hasError = true;
    }

    if (hasError) return;

    btnSave.disabled = true;
    btnSave.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> ${isEdit ? 'Actualizando...' : 'Guardando...'}`;

    try {
      let image_url = currentImageUrl;
      if (selectedFile) {
        image_url = await new Promise(resolve => {
          const r = new FileReader();
          r.onload = e => resolve(e.target.result);
          r.readAsDataURL(selectedFile);
        });
      }

      const toolData = {
        ...formDataObj,
        image_url
      };

      if (isEdit) {
        const { error } = await supabase.from('herramientas').update(toolData).eq('id', id);
        if (error) throw error;
        window.Snackbar.show('Herramienta actualizada exitosamente');
      } else {
        const { error } = await supabase.from('herramientas').insert([toolData]);
        if (error) throw error;
        window.Snackbar.show('Herramienta guardada exitosamente');
      }

      window.navigateTo('herramientas');
    } catch (err) {
      console.error(err);
      window.Snackbar.show('Error: ' + err.message, { type: 'error' });
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = `<span class="material-symbols-outlined">${isEdit ? 'update' : 'save'}</span> ${isEdit ? 'Actualizar herramienta' : 'Guardar herramienta'}`;
    }
  });
}
