import { supabase } from '../supabase.js';

export async function renderNuevoAnimal(id) {
  const isEdit = !!id;
  return `
    <div class="da-screen">
      <div class="da-hero">
        <div class="da-hero-img-wrap" id="photo-dropzone" style="cursor: pointer; border: 2px dashed rgba(56, 106, 62, 0.3); background: #f9fbf9;">
          <input type="file" id="animal-photo" accept="image/*" style="display: none">
          <div id="photo-preview" style="width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; transition: all 0.3s;">
             <div class="da-stat-icon" style="background: rgba(56, 106, 62, 0.1); color: #386a3e; width: 80px; height: 80px; border-radius: 50%;">
                <span class="material-icons" style="font-size: 40px;">photo_camera</span>
             </div>
             <div style="text-align: center;">
                <p style="font-weight: 800; color: #2c2c2c; margin: 0;">${isEdit ? 'Cambiar Fotografía' : 'Subir Fotografía'}</p>
                <p style="font-size: 12px; color: #888; margin-top: 4px;">Toca para seleccionar o arrastra aquí</p>
             </div>
          </div>
        </div>

        <div class="da-hero-info">
          <div>
            <div class="da-hero-subtitle">${isEdit ? 'Actualizando registro' : 'Nuevo registro de inventario'}</div>
            <h2 class="da-hero-title">${isEdit ? 'Editar Información' : 'Registrar Nuevo Animal'}</h2>
          </div>
          
          <div class="da-badge-row">
            <div class="da-badge da-badge-surface">
              <span class="material-icons">info</span>
              Completa los campos para mantener tu inventario actualizado.
            </div>
          </div>


        </div>
      </div>

      <div class="da-tabs-section">
        <div class="da-tab-bar">
          <button class="da-tab active">Información General</button>
        </div>

        <div class="da-tab-content active" style="padding-top: 8px;">
          <form id="form-nuevo-animal">
            <div class="m3-grid-2col">
              <div class="m3-field">
                <input type="text" name="nombre" placeholder=" " required>
                <label>Nombre / ID del Animal</label>
                <p class="error-text" id="error-nombre">Este campo es obligatorio</p>
              </div>

              <div class="m3-field">
                <select name="potrero_id" id="field-potrero">
                  <option value="" disabled selected hidden></option>
                </select>
                <label>Potrero Asignado</label>
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

              <div style="display: flex; gap: 12px;">
                <div class="m3-field" style="flex: 1;">
                  <input type="number" step="0.1" name="peso_actual" placeholder=" ">
                  <label>Peso Inicial</label>
                </div>
                <div class="m3-field" style="width: 100px;">
                  <select name="peso_unidad">
                    <option value="kg">kg</option>
                    <option value="lb">lb</option>
                  </select>
                  <label>Unidad</label>
                </div>
              </div>

              <div class="m3-field">
                <input type="date" name="fecha_adquisicion" placeholder=" ">
                <label>Fecha de Ingreso / Nacimiento</label>
              </div>
            </div>
            
            <div class="da-form-actions" style="display: flex; gap: 12px; margin-top: 32px; flex-direction: column;">
              <button type="button" class="da-action-btn da-action-edit" id="btn-save-animal" style="width: 100%; justify-content: center; padding: 16px;">
                <span class="material-icons">${isEdit ? 'save' : 'add_circle'}</span>
                <span id="save-label">${isEdit ? 'Guardar Cambios' : 'Registrar Animal'}</span>
              </button>
              <button type="button" class="da-action-btn da-action-delete" style="width: 100%; justify-content: center; padding: 16px; background: #f5f5f5; color: #666; border: 1px solid #e0e0e0;" onclick="window.navigateTo('${isEdit ? 'detalle_animal' : 'ganado'}'${isEdit ? `, '${id}'` : ''})">
                Cancelar
              </button>
            </div>
          </form>
        </div>
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

  // Load potreros for select
  supabase.from('potreros').select('id, nombre').then(({ data }) => {
    const select = document.getElementById('field-potrero');
    if (select && data) {
      data.forEach(p => {
        const opt = document.createElement('option');
        opt.value = p.id;
        opt.textContent = p.nombre;
        select.appendChild(opt);
      });
      
      // If editing, re-select current potrero after options are loaded
      if (id && currentAnimalPotreroId) {
        select.value = currentAnimalPotreroId;
      }
    }
  });

  let currentAnimalPotreroId = null;

  // If editing, load data
  if (id) {
    supabase.from('ganado').select('*').eq('id', id).single().then(({ data, error }) => {
      if (error) {
        window.Snackbar.show('Error al cargar datos: ' + error.message, { type: 'error' });
        return;
      }
      if (data) {
        form.nombre.value = data.nombre || '';
        form.raza.value = data.raza || '';
        form.sexo.value = data.sexo || '';
        form.peso_actual.value = data.peso_actual || '';
        form.peso_unidad.value = data.peso_unidad || 'kg';
        form.fecha_adquisicion.value = data.fecha_adquisicion || '';
        currentAnimalPotreroId = data.potrero_id;
        
        const potreroSelect = document.getElementById('field-potrero');
        if (potreroSelect) potreroSelect.value = data.potrero_id || '';

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
        potrero_id: data.potrero_id || null,
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
