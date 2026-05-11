import { supabase } from '../supabase.js';

export async function renderNuevoMotor() {
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

          <div class="m3-pro-tip" style="display: none;">
             <span class="material-symbols-outlined icon">lightbulb</span>
             <div>
                <h4>Consejo Pro</h4>
                <p>Registrar las horas iniciales con precisión garantiza alertas de mantenimiento.</p>
             </div>
          </div>
        </div>

        <!-- Form Details -->
        <div class="m3-form-card">
          <h3>Detalles Técnicos</h3>
          
          <form id="form-nuevo-motor">
            <div class="grid-2">
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

            <div class="grid-2">
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
                <span class="material-symbols-outlined">save</span>
                Guardar equipo
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

export function initNuevoMotor() {
  const btnSave = document.getElementById('btn-save-motor');
  const form = document.getElementById('form-nuevo-motor');
  const photoInput = document.getElementById('motor-photo');
  const dropzone = document.getElementById('photo-dropzone');
  const preview = document.getElementById('photo-preview');

  let selectedFile = null;

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
    const data = Object.fromEntries(formData.entries());
    
    // Validation
    let hasError = false;
    if (!data.nombre) {
      document.getElementById('error-nombre').style.display = 'block';
      document.querySelector('input[name="nombre"]').parentElement.classList.add('error');
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

      const { error } = await supabase.from('motores').insert([{
        ...data,
        horas: parseInt(data.horas) || 0,
        max_horas: parseInt(data.max_horas) || 250,
        image_url
      }]);

      if (error) throw error;

      window.Snackbar.show('Equipo guardado exitosamente');
      window.navigateTo('motores');
    } catch (err) {
      console.error(err);
      window.Snackbar.show('Error: ' + err.message, { type: 'error' });
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = '<span class="material-symbols-outlined">save</span> Guardar equipo';
    }
  });
}
