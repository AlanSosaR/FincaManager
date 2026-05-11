import { supabase } from '../supabase.js';

export async function renderNuevoAnimal() {
  return `
    <div class="m3-form-screen">
      <div class="m3-grid">
        <!-- Photo and Tips -->
        <div class="m3-asymmetric-section">
          <div class="m3-photo-placeholder" id="photo-dropzone">
            <input type="file" id="animal-photo" accept="image/*" style="display: none">
            <div id="photo-preview" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center;">
              <span class="material-symbols-outlined">photo_camera</span>
              <p style="font-weight: 800">Subir foto del animal</p>
              <p style="font-size: 11px; text-align: center; color: var(--m3-on-surface-variant); margin-top: 10px; line-height: 1.4">
                Formatos JPG, PNG hasta 10MB.
              </p>
            </div>
          </div>

          <div class="m3-pro-tip" style="display: none;">
             <span class="material-symbols-outlined icon">lightbulb</span>
             <div>
                <h4>Consejo Pro</h4>
                <p>Añadir una foto clara ayuda a identificar al animal más fácilmente en el futuro.</p>
             </div>
          </div>
        </div>

        <!-- Form Details -->
        <div class="m3-form-card">
          <h3>Detalles del Animal</h3>
          
          <form id="form-nuevo-animal">
            <div class="m3-input-group">
              <label>Nombre / ID Visible</label>
              <div class="m3-input-wrapper">
                <input type="text" name="nombre" placeholder="Ej: Esperanza o #001">
              </div>
              <p class="error-text" id="error-nombre">El nombre o ID es obligatorio</p>
            </div>

            <div class="grid-2">
              <div class="m3-input-group">
                <label>Raza</label>
                <div class="m3-input-wrapper">
                  <input type="text" name="raza" placeholder="Ej: Jersey">
                </div>
              </div>

              <div class="m3-input-group">
                <label>Sexo</label>
                <div class="m3-input-wrapper">
                  <select name="sexo">
                    <option value="Hembra">Hembra</option>
                    <option value="Macho">Macho</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="grid-2">
              <div class="m3-input-group">
                <label>Peso Inicial</label>
                <div class="m3-input-wrapper">
                  <input type="number" step="0.1" name="peso_actual" placeholder="0.0">
                  <span class="m3-unit">KG</span>
                </div>
              </div>

              <div class="m3-input-group">
                <label>Fecha Nacimiento / Adquisición</label>
                <div class="m3-input-wrapper">
                  <input type="date" name="fecha_adquisicion">
                </div>
              </div>
            </div>

            <!-- Internal Actions -->
            <div class="m3-form-actions">
              <button type="button" class="btn-m3-text" onclick="window.navigateTo('ganado')">Cancelar</button>
              <button type="button" class="btn-m3-primary" id="btn-save-animal">
                <span class="material-symbols-outlined">save</span>
                Registrar animal
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  `;
}

export function initNuevoAnimal() {
  const btnSave = document.getElementById('btn-save-animal');
  const form = document.getElementById('form-nuevo-animal');
  const photoInput = document.getElementById('animal-photo');
  const dropzone = document.getElementById('photo-dropzone');
  const preview = document.getElementById('photo-preview');

  let selectedFile = null;

  // Photo Selection
  if (dropzone && photoInput) {
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
        const filePath = `animales/${fileName}`;

        const { error: uploadError } = await supabase.storage
          .from('animales')
          .upload(filePath, selectedFile);

        // If bucket "animales" does not exist, this might fail. We log but continue.
        if (uploadError) {
            console.warn('No se pudo subir la foto (puede que el bucket "animales" no exista):', uploadError.message);
        } else {
            const { data: urlData } = supabase.storage
              .from('animales')
              .getPublicUrl(filePath);
            
            image_url = urlData.publicUrl;
        }
      }

      // Generate an ID if the user provided something that might not be unique, 
      // but let's use the provided name as part of the ID, or a random string.
      const uniqueId = `#${Math.random().toString(36).substr(2, 5).toUpperCase()}`;

      // Clean empty dates so Supabase doesn't error out on empty strings
      if (!data.fecha_adquisicion) {
          delete data.fecha_adquisicion;
      }

      const { error } = await supabase.from('ganado').insert([{
        id: uniqueId,
        nombre: data.nombre,
        raza: data.raza,
        sexo: data.sexo,
        peso_actual: parseFloat(data.peso_actual) || 0,
        fecha_adquisicion: data.fecha_adquisicion,
        icon: data.sexo === 'Macho' ? '🐂' : '🐄',
        image_url: image_url
      }]);

      if (error) throw error;

      window.Snackbar.show('Animal guardado exitosamente');
      window.navigateTo('ganado');
    } catch (err) {
      console.error(err);
      window.Snackbar.show('Error: ' + err.message, { type: 'error' });
    } finally {
      btnSave.disabled = false;
      btnSave.innerHTML = '<span class="material-symbols-outlined">save</span> Registrar animal';
    }
  });
}
