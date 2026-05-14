import { supabase } from '../supabase.js';

export async function renderNuevoMotor(id) {
  const isEdit = !!id;
  return `
    <div class="m3-form-screen">
      <div class="m3-form-card">
        <div style="margin-bottom: 32px; display: flex; align-items: center; gap: 20px;">
          <div class="da-stat-icon" style="background: rgba(56, 106, 62, 0.1); color: #386a3e; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <span class="material-icons" style="font-size: 32px;">settings</span>
          </div>
          <div>
            <div class="da-hero-subtitle" style="margin:0;">${isEdit ? 'Actualizando registro' : 'Nuevo equipo'}</div>
            <h2 class="da-hero-title" style="margin:0; font-size: 24px;">${isEdit ? 'Editar Equipo' : 'Registro de Motor'}</h2>
          </div>
        </div>

        <form id="form-nuevo-motor">
          <div class="m3-grid">
            <!-- Left Side: Photo -->
            <div class="m3-asymmetric-section">
              <div class="m3-photo-placeholder" id="photo-dropzone">
                <input type="file" id="motor-photo" accept="image/*" style="display: none">
                <div id="photo-preview" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; transition: all 0.3s;">
                  <span class="material-icons">photo_camera</span>
                  <div style="text-align: center;">
                    <p style="font-weight: 800; color: #2c2c2c; margin: 0;">${isEdit ? 'Cambiar Foto' : 'Subir Foto'}</p>
                    <p style="font-size: 11px; color: #888; margin-top: 4px;">JPG o PNG</p>
                  </div>
                </div>
              </div>

              <div class="m3-pro-tip">
                <span class="material-icons icon">lightbulb</span>
                <div>
                  <h4>CONSEJO</h4>
                  <p>Registrar las horas iniciales garantiza alertas de mantenimiento precisas.</p>
                </div>
              </div>
            </div>

            <!-- Right Side: Fields -->
            <div>
              <div class="m3-grid-2col">
                <div class="m3-field">
                  <input type="text" name="nombre" placeholder=" " required>
                  <label>Nombre del equipo</label>
                  <p class="error-text" id="error-nombre">El nombre es obligatorio</p>
                </div>

                <div class="m3-field">
                  <select name="icon" required>
                    <option value="" disabled selected hidden></option>
                    <option value="⚙️">Motor Estacionario</option>
                    <option value="⚡">Generador Eléctrico</option>
                    <option value="✂️">Motoguadaña</option>
                    <option value="💨">Pulverizadora</option>
                    <option value="🪚">Motosierra</option>
                    <option value="🚜">Tractor</option>
                    <option value="🚜">Cosechadora</option>
                    <option value="⚙️">Motobomba</option>
                  </select>
                  <label>Tipo de equipo</label>
                </div>

                <div class="m3-field">
                  <input type="date" name="fecha_adquisicion" placeholder=" ">
                  <label>Fecha de adquisición</label>
                </div>

                <div class="m3-field">
                  <input type="number" name="max_horas" value="250" placeholder=" " required>
                  <label>Límite de horas</label>
                </div>
              </div>

              <div class="m3-field">
                <textarea name="notas" placeholder=" " rows="3"></textarea>
                <label>Notas / Observaciones</label>
              </div>

              <div class="da-form-actions" style="border-top: none; margin-top: 24px; padding-top: 0;">
                <button type="button" class="da-action-btn primary" id="btn-save-motor">
                  <span class="material-icons">${isEdit ? 'update' : 'save'}</span>
                  <span>${isEdit ? 'Actualizar' : 'Guardar'}</span>
                </button>
                <button type="button" class="da-action-btn secondary" onclick="window.navigateTo('motores')">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        </form>
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
