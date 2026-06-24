import { supabase } from '../supabase.js';

export async function renderNuevoAnimal(id) {
  const isEdit = !!id;
  return `
    <div class="m3-form-screen">
      <div class="m3-form-card">
        <div style="margin-bottom: 32px; display: flex; align-items: center; gap: 20px;">
          <div class="da-stat-icon" style="background: rgba(107, 130, 69, 0.1); color: #6b8245; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <img src="/vaca.png" alt="Ganado" style="width: 32px; height: 32px; filter: grayscale(1) opacity(0.85);">
          </div>
          <div>
            <div class="da-hero-subtitle" style="margin:0;">${isEdit ? 'Actualizando registro' : 'Nuevo registro de inventario'}</div>
            <h2 class="da-hero-title" style="margin:0; font-size: 24px;">${isEdit ? 'Editar Información' : 'Registrar Animal'}</h2>
          </div>
        </div>

        <form id="form-nuevo-animal">
          <div class="m3-grid">
            <!-- Left Side: Photo -->
            <div class="m3-asymmetric-section">
              <div class="m3-photo-placeholder" id="photo-dropzone">
                <input type="file" id="animal-photo" accept="image/*" style="display: none">
                <div id="photo-preview" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; transition: all 0.3s;">
                  <span class="material-icons">photo_camera</span>
                  <div style="text-align: center;">
                    <p style="font-weight: 800; color: #2c2c2c; margin: 0;">${isEdit ? 'Cambiar Foto' : 'Subir Foto'}</p>
                    <p style="font-size: 11px; color: #888; margin-top: 4px;">JPG o PNG</p>
                  </div>
                </div>
              </div>

              <div class="m3-pro-tip">
                <span class="material-icons icon">info</span>
                <div>
                  <h4>INFO</h4>
                  <p>Completa los campos para mantener tu inventario actualizado.</p>
                </div>
              </div>
            </div>

            <!-- Right Side: Fields -->
            <div>
              <div class="m3-grid-2col">
                <div class="m3-field">
                  <input type="text" name="nombre" placeholder=" " required>
                  <label>Nombre del Animal</label>
                  <p class="error-text" id="error-nombre">Este campo es obligatorio</p>
                </div>

                <div class="m3-field">
                  <select name="raza" required>
                    <option value="" disabled selected hidden></option>
                    <optgroup label="Ganado de Carne">
                      <option value="Brahman">Brahman</option>
                      <option value="Nelore">Nelore</option>
                      <option value="Brangus">Brangus</option>
                      <option value="Angus">Angus</option>
                    </optgroup>
                    <optgroup label="Ganado de Leche">
                      <option value="Holstein">Holstein</option>
                      <option value="Jersey">Jersey</option>
                      <option value="Gyr">Gyr</option>
                    </optgroup>
                    <optgroup label="Otros">
                      <option value="Cruce">Cruce / F1</option>
                      <option value="Otro">Otro</option>
                    </optgroup>
                  </select>
                  <label>Raza</label>
                </div>

                <div class="m3-field">
                  <select name="sexo" required>
                    <option value="" disabled selected hidden></option>
                    <option value="Hembra">Hembra (Vaca/Novilla)</option>
                    <option value="Macho">Macho (Toro/Novillo)</option>
                  </select>
                  <label>Sexo</label>
                </div>

                <div class="m3-field m3-field-combined">
                  <input type="number" step="0.1" name="peso_actual" placeholder=" ">
                  <label>Peso Inicial</label>
                  <div class="field-suffix">
                    <select name="peso_unidad">
                      <option value="kg">kg</option>
                      <option value="lb">lb</option>
                    </select>
                    <span class="material-icons">expand_more</span>
                  </div>
                </div>

                <div class="m3-field">
                  <input type="date" name="fecha_adquisicion" placeholder=" ">
                  <label>Fecha de Ingreso</label>
                </div>
              </div>

              <div class="m3-field" style="margin-top:16px;">
                <select name="origen" id="origen-select">
                  <option value="Criollo">Criollo (nacido en la finca)</option>
                  <option value="Comprado">Comprado (adquirido de fuera)</option>
                </select>
                <label>Origen</label>
              </div>
              <div class="m3-field" id="precio-compra-field" style="display:none;">
                <input type="number" step="0.01" name="precio_compra" placeholder=" ">
                <label>Precio de compra ($)</label>
              </div>
              
              <div class="da-form-actions" style="border-top: none; margin-top: 24px; padding-top: 0;">
                <button type="button" class="da-action-btn primary" id="btn-save-animal">
                  <span class="material-icons">${isEdit ? 'save' : 'add_circle'}</span>
                  <span id="save-label">${isEdit ? 'Guardar' : 'Registrar'}</span>
                </button>
                <button type="button" class="da-action-btn secondary" onclick="window.navigateTo('${isEdit ? 'detalle_animal' : 'ganado'}'${isEdit ? `, '${id}'` : ''})">
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

export function initNuevoAnimal(id) {
  const btnSave = document.getElementById('btn-save-animal');
  const saveLabel = document.getElementById('save-label');
  const form = document.getElementById('form-nuevo-animal');
  const photoInput = document.getElementById('animal-photo');
  const dropzone = document.getElementById('photo-dropzone');
  const preview = document.getElementById('photo-preview');
  const screenTitle = document.querySelector('.m3-form-card h3');

  let selectedFile = null;
  let existingImageUrl = null;

  // If editing, load data
  if (id) {
    supabase.from('ganado').select('*').eq('id', id).single().then(async ({ data, error }) => {
      if (error) {
        window.Snackbar.show('Error al cargar datos: ' + error.message, { type: 'error' });
        return;
      }
      if (data) {
        form.nombre.value = data.nombre || '';
        form.raza.value = data.raza || '';
        form.sexo.value = data.sexo || '';
        form.peso_actual.value = data.peso_actual || '';
        form.fecha_adquisicion.value = data.fecha_adquisicion || '';
        form.origen.value = data.origen || 'Criollo';
        form.precio_compra.value = data.precio_compra || '';
        if (data.origen === 'Comprado' && precioCompraField) precioCompraField.style.display = 'block';

        const { data: pesajes } = await supabase.from('animal_pesajes').select('peso').eq('animal_id', id).order('fecha', { ascending: false });
        if (pesajes && pesajes.length > 0) {
          form.peso_actual.value = pesajes[0].peso;
        }

        existingImageUrl = data.image_url;

        if (data.image_url) {
          preview.innerHTML = `<img src="${data.image_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 32px;">`;
          dropzone.style.borderStyle = 'solid';
          dropzone.style.borderColor = 'transparent';
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
        // Validation: Format
        const validTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
        if (!validTypes.includes(file.type)) {
          window.Snackbar.show('Formato no válido. Use JPG, PNG o WebP.', { type: 'error' });
          photoInput.value = '';
          return;
        }

        // Validation: Size (10MB)
        if (file.size > 10 * 1024 * 1024) {
          window.Snackbar.show('La imagen es demasiado grande (Máx 10MB).', { type: 'error' });
          photoInput.value = '';
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

  // Origen toggle
  const origenSelect = document.getElementById('origen-select');
  const precioCompraField = document.getElementById('precio-compra-field');
  if (origenSelect && precioCompraField) {
    origenSelect.addEventListener('change', () => {
      precioCompraField.style.display = origenSelect.value === 'Comprado' ? 'block' : 'none';
    });
  }

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
      document.querySelector('input[name="nombre"]').parentElement.classList.add('error');
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

      // Clean empty dates so Supabase doesn't error out on empty strings
      const fechaFinal = (data.fecha_adquisicion && data.fecha_adquisicion.trim() !== '') 
        ? data.fecha_adquisicion 
        : null;

      const animalData = {
        nombre: data.nombre,
        raza: data.raza,
        sexo: data.sexo,
        peso_actual: parseFloat(data.peso_actual) || 0,
        peso_unidad: data.peso_unidad || 'kg',
        fecha_adquisicion: fechaFinal,
        origen: data.origen || 'Criollo',
        precio_compra: data.origen === 'Comprado' ? (parseFloat(data.precio_compra) || null) : null,
        image_url: image_url || existingImageUrl
      };

      let result;
      if (id) {
        result = await supabase.from('ganado').update(animalData).eq('id', id);
      } else {
        result = await supabase.from('ganado').insert([animalData]);
      }

      if (result.error) throw result.error;

      window.Snackbar.show(id ? 'Cambios guardados exitosamente' : 'Animal registrado exitosamente');
      if (id) {
        window.navigateTo('detalle_animal', id);
      } else {
        window.navigateTo('ganado');
      }
    } catch (err) {
      console.error(err);
      window.Snackbar.show('Error: ' + err.message, { type: 'error' });
    } finally {
      btnSave.disabled = false;
      const finalIcon = id ? 'save' : 'add';
      const finalLabel = id ? 'Guardar Cambios' : 'Registrar animal';
      btnSave.innerHTML = `<span class="material-symbols-outlined">${finalIcon}</span> ${finalLabel}`;
    }
  });
}
