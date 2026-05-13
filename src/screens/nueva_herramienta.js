import { supabase } from '../supabase.js';

export async function renderNuevaHerramienta(id) {
  const isEdit = !!id;
  return `
    <div class="m3-form-screen">
      <div class="m3-grid">
        <!-- Photo and Tips -->
        <div class="m3-asymmetric-section">
          <div class="m3-photo-placeholder" id="photo-dropzone">
            <input type="file" id="tool-photo" accept="image/*" style="display: none">
            <div id="photo-preview" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <span class="material-symbols-outlined">photo_camera</span>
              <p style="font-weight: 800">Subir foto de la herramienta</p>
              <p style="font-size: 11px; text-align: center; color: var(--m3-on-surface-variant); margin-top: 10px; line-height: 1.4">
                Formatos JPG, PNG hasta 10MB.
              </p>
            </div>
          </div>

          <div class="m3-pro-tip">
             <span class="material-symbols-outlined icon">lightbulb</span>
             <div>
                <h4>Consejo Pro</h4>
                <p>Mantener el inventario actualizado ayuda a prevenir pérdidas y planificar compras.</p>
             </div>
          </div>
        </div>

        <!-- Form Details -->
        <div class="m3-form-card">
          <h3>${isEdit ? 'Editar Herramienta' : 'Detalles de la Herramienta'}</h3>
          
          <form id="form-nueva-herramienta">
            <div class="m3-grid-2col">
              <div class="m3-input-group">
                <label>Nombre de la herramienta</label>
                <div class="m3-input-wrapper">
                  <input type="text" name="nombre" placeholder="Ej. Motosierra Stihl MS 170">
                </div>
                <p class="error-text" id="error-nombre">El nombre es obligatorio</p>
              </div>

              <div class="m3-input-group">
                <label>Categoría</label>
                <div class="m3-input-wrapper">
                  <select name="categoria">
                    <option value="Manual">Herramienta Manual</option>
                    <option value="Eléctrica">Eléctrica</option>
                    <option value="Combustión">Combustión</option>
                    <option value="Medición">Medición</option>
                    <option value="Protección">Protección</option>
                    <option value="Otro">Otro</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="m3-grid-2col">
              <div class="m3-input-group">
                <label>Ubicación</label>
                <div class="m3-input-wrapper">
                  <input type="text" name="ubicacion" placeholder="Ej. Bodega Principal">
                </div>
              </div>

              <div class="m3-input-group">
                <label>Estado</label>
                <div class="m3-input-wrapper">
                  <select name="estado">
                    <option value="Disponible">Disponible</option>
                    <option value="Reparación">En Reparación</option>
                    <option value="Baja">Dada de Baja</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="m3-input-group">
              <label>Icono / Emoji</label>
              <div class="m3-input-wrapper">
                <input type="text" name="icon" placeholder="Ej. 🛠️" value="🛠️">
              </div>
            </div>

            <!-- Internal Actions -->
            <div class="m3-form-actions">
              <button type="button" class="btn-m3-text" onclick="window.navigateTo('herramientas')">Cancelar</button>
              <button type="button" class="btn-m3-primary" id="btn-save-tool">
                <span class="material-symbols-outlined">${isEdit ? 'update' : 'save'}</span>
                ${isEdit ? 'Actualizar herramienta' : 'Guardar herramienta'}
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
        preview.innerHTML = `<img src="${data.image_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 28px;">`;
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
        preview.innerHTML = `<img src="${re.target.result}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 28px;">`;
      };
      reader.readAsDataURL(file);
    }
  };

  if (!btnSave || !form) return;

  btnSave.addEventListener('click', async () => {
    // Reset errors
    document.querySelectorAll('.error-text').forEach(e => e.style.display = 'none');
    document.querySelectorAll('.m3-input-wrapper').forEach(e => e.classList.remove('error'));

    const formData = new FormData(form);
    const formDataObj = Object.fromEntries(formData.entries());
    
    // Validation
    let hasError = false;
    if (!formDataObj.nombre) {
      document.getElementById('error-nombre').style.display = 'block';
      document.querySelector('input[name="nombre"]').parentElement.classList.add('error');
      hasError = true;
    }

    if (hasError) return;

    btnSave.disabled = true;
    btnSave.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> ${isEdit ? 'Actualizando...' : 'Guardando...'}`;

    try {
      let image_url = currentImageUrl;
      if (selectedFile) {
        const fileExt = selectedFile.name.split('.').pop();
        const fileName = `${Math.random()}.${fileExt}`;
        const filePath = `herramientas/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('equipos')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('equipos')
          .getPublicUrl(filePath);
        
        image_url = urlData.publicUrl;
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
