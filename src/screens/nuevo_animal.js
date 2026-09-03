import { supabase } from '../supabase.js';
import { restFetch } from '../auth.js';
import { sendWhatsApp } from '../wa.js';
import { uploadImage } from '../utils/image_uploader.js';

export async function renderNuevoAnimal(id) {
  const isEdit = !!id;

  let hembras = [];
  try {
    const { data } = await supabase
      .from('ganado')
      .select('id, nombre')
      .ilike('sexo', 'hembra')
      .neq('estado', 'Vendido')
      .order('nombre', { ascending: true });
    hembras = data || [];
  } catch { /* silencioso */ }

  const madreOptions = hembras.map(h =>
    `<option value="${h.id}">${h.nombre}</option>`
  ).join('');

  return `
    <div class="m3-form-screen">
      <div class="m3-form-card">
        <div style="margin-bottom: 32px; display: flex; align-items: center; gap: 20px;">
          <div class="da-stat-icon" style="background: rgba(107, 130, 69, 0.1); color: #6b8245; width: 64px; height: 64px; border-radius: 50%; display: flex; align-items: center; justify-content: center;">
            <img src="/vaca.png" alt="Ganado" style="width: 32px; height: 32px; filter: grayscale(1) opacity(0.85);">
          </div>
          <div>
            <div class="da-hero-subtitle" style="margin:0;">${isEdit ? 'Actualizando registro' : 'Nuevo registro de inventario'}</div>
            <h2 class="da-hero-title" style="margin:0; font-size: 24px;">${isEdit ? 'Editar Animal' : 'Registrar Animal'}</h2>
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

                <div class="m3-field" style="grid-column: 1 / -1;">
                  <input type="date" name="fecha_adquisicion" id="fecha-adquisicion-input" placeholder=" ">
                  <label style="white-space: nowrap;">Fecha de Ingreso o Nacimiento</label>
                </div>
              </div>

              <!-- Selector de edad Material 3 Expressive -->
              <div class="m3-age-card" style="background: #f4f7f3; border: 1px solid rgba(45, 62, 44, 0.14); border-radius: 18px; padding: 16px; margin-top: -2px; margin-bottom: 16px;">
                <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 14px;">
                  <span class="material-icons" style="font-size: 20px; color: #2d3e2c; background: rgba(45, 62, 44, 0.08); padding: 7px; border-radius: 12px;">hourglass_top</span>
                  <div>
                    <div style="font-size: 13px; font-weight: 700; color: #2d3e2c; line-height: 1.2;">¿No recuerdas la fecha exacta?</div>
                    <div style="font-size: 11.5px; color: #586857; margin-top: 2px;">Selecciona su edad actual y calcularemos su fecha:</div>
                  </div>
                </div>

                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div class="m3-field" style="margin-bottom: 0;">
                    <select id="edad-rapida-anios">
                      ${Array.from({length: 26}, (_, i) => `<option value="${i}">${i} ${i === 1 ? 'año' : 'años'}</option>`).join('')}
                    </select>
                    <label>Años</label>
                  </div>
                  <div class="m3-field" style="margin-bottom: 0;">
                    <select id="edad-rapida-meses">
                      ${Array.from({length: 12}, (_, i) => `<option value="${i}">${i} ${i === 1 ? 'mes' : 'meses'}</option>`).join('')}
                    </select>
                    <label>Meses</label>
                  </div>
                </div>

                <div id="edad-calculada-preview" style="font-size: 12.5px; color: #2d3e2c; font-weight: 700; margin-top: 12px; display: none; align-items: center; gap: 6px; background: rgba(45, 62, 44, 0.08); padding: 8px 12px; border-radius: 10px;"></div>
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
                <label>Precio de compra (HNL)</label>
              </div>

              <div class="m3-field" style="margin-top:16px;">
                <select name="madre_id" id="madre-select">
                  <option value="">Sin madre / Independiente</option>
                  ${madreOptions}
                </select>
                <label>Madre (para crías nacidas en la finca)</label>
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
        const fechaIngreso = data.fecha_adquisicion ? data.fecha_adquisicion.split('T')[0] : (data.created_at ? data.created_at.split('T')[0] : '');
        form.fecha_adquisicion.value = fechaIngreso;
        updateEdadPreview();

        form.origen.value = data.origen || 'Criollo';
        form.precio_compra.value = data.precio_compra || '';
        if (data.madre_id) form.madre_id.value = data.madre_id;
        if (data.origen === 'Comprado' && precioCompraField) precioCompraField.style.display = 'block';

        const { data: pesajes } = await supabase.from('animal_pesajes').select('peso').eq('animal_id', id).order('fecha', { ascending: false });
        if (pesajes && pesajes.length > 0) {
          form.peso_actual.value = pesajes[0].peso;
        }

        existingImageUrl = data.image_url;

        if (data.image_url) {
          updatePhotoDisplay(data.image_url);
        }
      }
    });
  }

  const selectAnios = document.getElementById('edad-rapida-anios');
  const selectMeses = document.getElementById('edad-rapida-meses');

  // Preview dinámico de edad y sincronización con fecha_adquisicion
  const updateEdadPreview = (syncInputs = true) => {
    const previewEl = document.getElementById('edad-calculada-preview');
    if (!previewEl) return;
    const fVal = form.fecha_adquisicion?.value;
    if (!fVal) {
      previewEl.style.display = 'none';
      previewEl.innerHTML = '';
      if (syncInputs) {
        if (selectAnios) selectAnios.value = '0';
        if (selectMeses) selectMeses.value = '0';
      }
      return;
    }
    const d = new Date(fVal + 'T00:00:00');
    if (isNaN(d.getTime())) {
      previewEl.style.display = 'none';
      previewEl.innerHTML = '';
      return;
    }
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const diff = Math.floor((now - d) / 86400000);
    if (diff < 0) {
      previewEl.style.display = 'flex';
      previewEl.innerHTML = '<span style="color:#b45309;">⚠️ Fecha en el futuro</span>';
      return;
    }
    let anios = now.getFullYear() - d.getFullYear();
    let meses = now.getMonth() - d.getMonth();
    let dias = now.getDate() - d.getDate();

    if (dias < 0) {
      meses -= 1;
      const prevMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
      dias += prevMonthDays;
    }
    if (meses < 0) {
      anios -= 1;
      meses += 12;
    }

    let texto = '';
    if (diff <= 1) texto = '1 día';
    else if (diff < 30) texto = `${diff} días`;
    else if (anios <= 0) {
      const m = Math.max(1, meses);
      if (dias > 0) {
        texto = `${m} ${m === 1 ? 'mes' : 'meses'}, ${dias} ${dias === 1 ? 'día' : 'días'}`;
      } else {
        texto = `${m} ${m === 1 ? 'mes' : 'meses'}`;
      }
    } else {
      let extra = '';
      if (meses > 0 && dias > 0) {
        extra = `, ${meses} ${meses === 1 ? 'mes' : 'meses'}, ${dias} d`;
      } else if (meses > 0) {
        extra = `, ${meses} ${meses === 1 ? 'mes' : 'meses'}`;
      } else if (dias > 0) {
        extra = `, ${dias} d`;
      }
      texto = `${anios} ${anios === 1 ? 'año' : 'años'}${extra}`;
    }
    previewEl.style.display = 'flex';
    previewEl.innerHTML = `<span class="material-icons" style="font-size:16px; color:#2d3e2c;">cake</span> Edad calculada: <strong style="margin-left:2px;">${texto}</strong>`;

    if (syncInputs) {
      if (selectAnios) selectAnios.value = String(Math.min(25, Math.max(0, anios)));
      if (selectMeses) selectMeses.value = String(Math.min(11, Math.max(0, meses)));
    }
  };

  const aplicarEdadDesdeAniosMeses = () => {
    const a = parseInt(selectAnios?.value, 10) || 0;
    const m = parseInt(selectMeses?.value, 10) || 0;
    if (a === 0 && m === 0) return;
    const now = new Date();
    // Restar años y meses desde hoy
    const calculatedDate = new Date(now.getFullYear() - a, now.getMonth() - m, now.getDate());
    const yyyy = calculatedDate.getFullYear();
    const mm = String(calculatedDate.getMonth() + 1).padStart(2, '0');
    const dd = String(calculatedDate.getDate()).padStart(2, '0');
    if (form.fecha_adquisicion) {
      form.fecha_adquisicion.value = `${yyyy}-${mm}-${dd}`;
      updateEdadPreview(false);
    }
  };

  if (selectAnios) {
    selectAnios.addEventListener('change', aplicarEdadDesdeAniosMeses);
  }
  if (selectMeses) {
    selectMeses.addEventListener('change', aplicarEdadDesdeAniosMeses);
  }

  if (form.fecha_adquisicion) {
    form.fecha_adquisicion.addEventListener('input', () => updateEdadPreview(true));
    form.fecha_adquisicion.addEventListener('change', () => updateEdadPreview(true));
  }

  const updatePhotoDisplay = (url) => {
    if (!url) return;
    preview.innerHTML = `
      <div style="position: relative; width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; background: #eef2ed; border-radius: 16px; overflow: hidden;">
        <img id="main-uploaded-img" src="${url}" style="width: 100%; height: 100%; object-fit: contain;">
      </div>
    `;
    dropzone.style.border = 'none';
  };

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
          updatePhotoDisplay(re.target.result);
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
        image_url = await uploadImage(selectedFile);
      }

      // Clean empty dates so Supabase doesn't error out on empty strings
      const fechaFinal = (data.fecha_adquisicion && data.fecha_adquisicion.trim() !== '') 
        ? data.fecha_adquisicion 
        : null;

      const animalData = {
        nombre: data.nombre,
        raza: data.raza,
        sexo: data.sexo,
        peso_unidad: data.peso_unidad || 'kg',
        fecha_adquisicion: fechaFinal,
        origen: data.origen || 'Criollo',
        precio_compra: data.origen === 'Comprado' ? (parseFloat(data.precio_compra) || null) : null,
        image_url: image_url || existingImageUrl
      };
      if (data.madre_id) animalData.madre_id = data.madre_id;

      let result;
      if (id) {
        result = await supabase.from('ganado').update(animalData).eq('id', id);
      } else {
        result = await supabase.from('ganado').insert([animalData]);
      }

      if (result.error) throw result.error;

      // Crear/actualizar pesaje en animal_pesajes
      const newId = result.data?.id || id;
      const pesoVal = data.peso_actual && parseFloat(data.peso_actual);
      if (newId && pesoVal > 0) {
        const hoy = new Date().toISOString().split('T')[0];
        if (id) {
          // Buscar último pesaje; si el peso cambió, crear uno nuevo
          const ultimo = await supabase.from('animal_pesajes').select('peso').eq('animal_id', id).order('fecha', { ascending: false });
          const ultimoPeso = Array.isArray(ultimo.data) ? ultimo.data[0]?.peso : ultimo.data?.peso;
          if (ultimoPeso !== String(pesoVal)) {
            await supabase.from('animal_pesajes').insert({
              animal_id: newId,
              peso: String(pesoVal),
              fecha: hoy,
              estado: 'Aplicada'
            });
          }
        } else {
          await supabase.from('animal_pesajes').insert({
            animal_id: newId,
            peso: String(pesoVal),
            fecha: hoy,
            estado: 'Aplicada'
          });
        }
      }

      window.Snackbar.show(id ? 'Cambios guardados exitosamente' : 'Animal registrado exitosamente');

      if (!id) {
        const animalName = data.nombre || 'Nuevo animal';
        const potreroName = data.potrero_id ? '' : '';
        sendWhatsApp(
          '🐄 Nuevo Animal Registrado\nNombre: ' + animalName +
          '\nIdentificación: ' + (data.caravana || data.arete || 'N/A') +
          '\nRaza: ' + (data.raza || 'N/A') +
          '\nCategoría: ' + (data.categoria || 'N/A') +
          '\nFinca: ' + (window._empresaNombre || '')
        );
      }

      if (id) {
        window.navigateTo('detalle_animal', newId || id);
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
