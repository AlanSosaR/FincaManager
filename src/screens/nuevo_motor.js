import { supabase } from '../supabase.js';

export async function renderNuevoMotor(id) {
  const isEdit = !!id;
  return `
    <div class="m3-form-screen">
      <div class="m3-grid">
        <!-- Photo and Tips -->
        <div class="m3-asymmetric-section">
          <div class="m3-photo-placeholder" id="photo-dropzone">
            <input type="file" id="motor-photo" accept="image/*" style="display: none">
            <div id="photo-preview" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <span class="material-symbols-outlined">photo_camera</span>
              <p style="font-weight: 800">Subir foto del equipo</p>
              <p style="font-size: 11px; text-align: center; color: var(--m3-on-surface-variant); margin-top: 10px; line-height: 1.4">
                Formatos JPG, PNG hasta 10MB.
              </p>
            </div>
          </div>

          <div class="m3-pro-tip">
             <span class="material-symbols-outlined icon">lightbulb</span>
             <div>
                <h4>Consejo Pro</h4>
                <p>Registrar las horas iniciales con precisión garantiza alertas de mantenimiento automáticas.</p>
             </div>
          </div>
        </div>

        <!-- Form Details -->
        <div class="m3-form-card">
          <h3>${isEdit ? 'Editar Equipo' : 'Detalles Técnicos'}</h3>
          
          <form id="form-nuevo-motor">
            <div class="m3-grid-2col">
              <div class="m3-input-group">
                <label>Nombre del equipo</label>
                <div class="m3-input-wrapper">
                  <input type="text" name="nombre" placeholder="Ej. Generador FUNO FN-12GS">
                </div>
                <p class="error-text" id="error-nombre">El nombre es obligatorio</p>
              </div>

              <div class="m3-input-group">
                <label>Tipo de equipo</label>
                <div class="m3-input-wrapper">
                  <select name="icon">
                    <option value="⚙️">Motor Estacionario</option>
                    <option value="⚡">Generador Eléctrico</option>
                    <option value="✂️">Motoguadaña</option>
                    <option value="💨">Pulverizadora</option>
                    <option value="🪚">Motosierra</option>
                    <option value="🚜">Tractor</option>
                    <option value="🚜">Cosechadora</option>
                    <option value="⚙️">Motobomba</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="m3-grid-2col">
              <div class="m3-input-group">
                <label>Fecha de adquisición</label>
                <div class="m3-input-wrapper">
                  <input type="date" name="fecha_adquisicion">
                </div>
              </div>

              <div class="m3-input-group">
                <label>Límite mantenimiento</label>
                <div class="m3-input-wrapper">
                  <input type="number" name="max_horas" value="250">
                  <span class="m3-unit">HRS</span>
                </div>
              </div>
            </div>

            <div class="m3-input-group">
              <label>Notas / Observaciones</label>
              <div class="m3-input-wrapper">
                <textarea name="notas" placeholder="Detalles adicionales..." rows="4"></textarea>
              </div>
            </div>

            <!-- Internal Actions -->
            <div class="m3-form-actions">
              <button type="button" class="btn-m3-text" onclick="window.navigateTo('motores')">Cancelar</button>
              <button type="button" class="btn-m3-primary" id="btn-save-motor">
                <span class="material-symbols-outlined">${isEdit ? 'update' : 'save'}</span>
                ${isEdit ? 'Actualizar equipo' : 'Guardar equipo'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

export async function initNuevoMotor(id) {
  const isEdit = !!id;
  const btnSave = document.getElementById('btn-save-motor');
  const form = document.getElementById('form-nuevo-motor');
  const photoInput = document.getElementById('motor-photo');
  const dropzone = document.getElementById('photo-dropzone');
  const preview = document.getElementById('photo-preview');

  let selectedFile = null;
  let currentImageUrl = null;

  if (isEdit) {
    try {
      const { data, error } = await supabase.from('motores').select('*').eq('id', id).single();
      if (error) throw error;

      // Fill form
      form.nombre.value = data.nombre || '';
      form.icon.value = data.icon || '⚙️';
      form.fecha_adquisicion.value = data.fecha_adquisicion || '';
      form.max_horas.value = data.max_horas || 250;
      form.notas.value = data.notas || '';
      
      if (data.image_url) {
        currentImageUrl = data.image_url;
        preview.innerHTML = `<img src="${data.image_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 28px;">`;
      }
    } catch (err) {
      console.error('Error al cargar equipo:', err);
      window.Snackbar.show('Error al cargar datos del equipo', { type: 'error' });
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
        const filePath = `motores/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('equipos')
          .upload(filePath, selectedFile);

        if (uploadError) throw uploadError;

        const { data: urlData } = supabase.storage
          .from('equipos')
          .getPublicUrl(filePath);
        
        image_url = urlData.publicUrl;
      }

      const motorData = {
        ...formDataObj,
        max_horas: parseInt(formDataObj.max_horas) || 250,
        image_url
      };

      if (isEdit) {
        const { error } = await supabase.from('motores').update(motorData).eq('id', id);
        if (error) throw error;
        window.Snackbar.show('Equipo actualizado exitosamente');
      } else {
        const { error } = await supabase.from('motores').insert([{
          ...motorData,
          horas: 0
        }]);
        if (error) throw error;
        window.Snackbar.show('Equipo guardado exitosamente');
      }

      if (isEdit) {
        window.navigateTo('detalle_motor', id);
      } else {
        window.navigateTo('motores');
      }
    } catch (err) {
      console.error(err);
      window.Snackbar.show('Error: ' + err.message, { type: 'error' });
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = `<span class="material-symbols-outlined">${isEdit ? 'update' : 'save'}</span> ${isEdit ? 'Actualizar equipo' : 'Guardar equipo'}`;
    }
  });
}
