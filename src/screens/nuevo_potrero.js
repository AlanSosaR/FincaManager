import { supabase } from '../supabase.js';

export async function renderNuevoPotrero(id) {
  const isEdit = !!id;
  return `
    <div class="da-screen">
      <div class="da-tabs-section" style="display: flex; flex-direction: column; gap: 40px;">
        <div class="m3-grid">
          <!-- Photo and Tips -->
          <div class="da-hero-img-wrap" id="photo-dropzone" style="cursor: pointer; border: 2px dashed rgba(0, 71, 65, 0.3); background: #f0ede4;">
            <input type="file" id="potrero-photo" accept="image/*" style="display: none">
            <div id="photo-preview" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; transition: all 0.3s;">
               <div class="da-stat-icon" style="background: rgba(69, 87, 67, 0.1); color: #455743; width: 80px; height: 80px; border-radius: 50%;">
                  <span class="material-icons" style="font-size: 40px;">landscape</span>
               </div>
               <div style="text-align: center;">
                  <p style="font-weight: 800; color: #2c2c2c; margin: 0;">${isEdit ? 'Cambiar Fotografía' : 'Subir foto del potrero'}</p>
                  <p style="font-size: 12px; color: #888; margin-top: 4px;">Captura la vista general del terreno.</p>
               </div>
            </div>
          </div>

          <div class="da-hero-info">
            <div>
              <div class="da-hero-subtitle">${isEdit ? 'Actualizando terreno' : 'Nuevo potrero'}</div>
              <h2 class="da-hero-title">${isEdit ? 'Editar Potrero' : 'Registro de Potrero'}</h2>
            </div>
            
            <div class="da-badge-row">
              <div class="da-badge da-badge-surface">
                <span class="material-icons" style="color: #42a5f5;">info</span>
                Configurar el ciclo de recuperación ayuda a predecir cuándo el pasto estará listo.
              </div>
            </div>
          </div>
        </div>

        <div style="border-top: 1px solid #f0f0f0; padding-top: 32px;">
          <h3 style="font-size: 20px; font-weight: 800; color: #2c2c2c; margin-bottom: 24px;">Configuración del Terreno</h3>
          
          <form id="form-nuevo-potrero">
            <div class="m3-field" style="margin-bottom: 20px;">
              <input type="text" name="nombre" placeholder=" " required>
              <label>Nombre del Potrero (Ej: La Loma, Potrero Sur...)</label>
              <p class="error-text" id="error-nombre">El nombre es obligatorio</p>
            </div>

            <div class="m3-grid-2col" style="margin-bottom: 20px;">
              <div class="m3-field">
                <div style="display: flex; align-items: center; gap: 8px;">
                  <input type="number" step="0.01" name="area" placeholder=" " style="flex: 1;">
                  <select name="area_unidad" style="width: auto; border: none; background: #f0f0f0; border-radius: 8px; padding: 4px 8px; font-size: 12px; font-weight: 700; color: #455743;">
                    <option value="ha">ha</option>
                    <option value="m2">m²</option>
                    <option value="mz">mz</option>
                  </select>
                </div>
                <label>Área Total</label>
              </div>

              <div class="m3-field">
                <select name="pasto" required>
                  <option value="Estrella">Estrella</option>
                  <option value="Brachiaria">Brachiaria</option>
                  <option value="Pangola">Pangola</option>
                  <option value="Guinea">Guinea</option>
                  <option value="Cratylia">Cratylia</option>
                  <option value="Natural">Natural / Sabana</option>
                  <option value="Otro">Otro</option>
                </select>
                <label>Tipo de Pasto</label>
              </div>
            </div>

            <div class="m3-field" style="margin-bottom: 20px;">
              <input type="text" name="ubicacion" placeholder=" ">
              <label>Ubicación / Referencia (Coordenadas o descripción)</label>
            </div>

            <div class="m3-grid-2col" style="margin-bottom: 24px;">
              <div class="m3-field">
                <input type="number" name="ciclo_recuperacion" value="30" placeholder=" ">
                <label>Ciclo de Recuperación (Días)</label>
              </div>

              <div class="m3-field">
                <input type="date" name="ultimo_riego" placeholder=" ">
                <label>Último Riego</label>
              </div>
            </div>

            <div class="da-form-actions">
              <button type="button" class="da-action-btn primary" id="btn-save-potrero">
                <span class="material-icons">${isEdit ? 'save' : 'add'}</span>
                <span>${isEdit ? 'Guardar Cambios' : 'Crear Potrero'}</span>
              </button>
              <button type="button" class="da-action-btn secondary" onclick="window.navigateTo('potreros')">
                Cancelar
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
    document.querySelectorAll('.m3-field').forEach(e => e.classList.remove('error'));

    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    
    // Validation
    let hasError = false;
    if (!data.nombre) {
      document.getElementById('error-nombre').style.display = 'block';
      form.nombre.closest('.m3-field').classList.add('error');
      hasError = true;
    }

    if (hasError) return;

    btnSave.disabled = true;
    btnSave.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Guardando...';

    try {
      let image_url = null;
      if (selectedFile) {
        image_url = await new Promise(resolve => {
          const r = new FileReader();
          r.onload = e => resolve(e.target.result);
          r.readAsDataURL(selectedFile);
        });
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
