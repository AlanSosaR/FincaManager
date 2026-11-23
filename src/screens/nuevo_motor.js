import { supabase } from '../supabase.js';
import { restFetch, loadEmpresaId } from '../auth.js';
import db from '../db.js';
import { syncTable } from '../sync.js';
import { uploadImage } from '../utils/image_uploader.js';

export async function renderNuevoMotor(id) {
  const isEdit = !!id;
  return `
    <div class="m3-form-screen">
      <div class="m3-form-card">
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
                    <option value="⚙️" data-icon="⚙️">Motor Estacionario</option>
                    <option value="⚡" data-icon="⚡">Generador Eléctrico</option>
                    <option value="✂️" data-icon="✂️">Motoguadaña</option>
                    <option value="💨" data-icon="💨">Pulverizadora</option>
                    <option value="🪚" data-icon="🪚">Motosierra</option>
                    <option value="🚜" data-icon="🚜">Tractor</option>
                    <option value="🚜" data-icon="🚜">Cosechadora</option>
                    <option value="⚙️" data-icon="⚙️">Motobomba</option>
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
                <button type="button" class="da-action-btn secondary" onclick="${isEdit ? `window.navigateTo('detalle_motor', '${id}')` : `window.navigateTo('motores')`}">
                  Cancelar
                </button>
                <button type="button" class="da-action-btn primary" id="btn-save-motor">
                  <span class="material-icons">${isEdit ? 'update' : 'save'}</span>
                  <span>${isEdit ? 'Actualizar' : 'Guardar'}</span>
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
      form.icon.dispatchEvent(new Event('change', { bubbles: true }));
      form.fecha_adquisicion.value = data.fecha_adquisicion || '';
      form.fecha_adquisicion.dispatchEvent(new Event('change', { bubbles: true }));
      form.max_horas.value = data.max_horas || 250;
      form.notas.value = data.notas || '';
      
      if (data.image_url) {
        currentImageUrl = data.image_url;
        preview.innerHTML = `<img src="${data.image_url}" style="width: 100%; height: 100%; object-fit: cover; border-radius: 12px;">`;
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
    const nombre = (formDataObj.nombre || '').trim();

    // Validation
    let hasError = false;
    if (!nombre) {
      const errEl = document.getElementById('error-nombre');
      const nombreInput = form.querySelector('input[name="nombre"]');
      if (errEl) errEl.style.display = 'block';
      nombreInput?.closest('.m3-field')?.classList.add('error');
      nombreInput?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      nombreInput?.focus();
      window.Snackbar?.show('Ingresa el nombre del equipo', { type: 'error' });
      hasError = true;
    }

    if (hasError) return;

    btnSave.disabled = true;
    btnSave.innerHTML = `<span class="material-symbols-outlined animate-spin">sync</span> ${isEdit ? 'Actualizando...' : 'Guardando...'}`;

    try {
      let image_url = currentImageUrl;
      if (selectedFile) {
        image_url = await uploadImage(selectedFile);
      }

      const motorData = {
        nombre,
        icon: formDataObj.icon || '⚙️',
        fecha_adquisicion: formDataObj.fecha_adquisicion || null,
        max_horas: parseInt(formDataObj.max_horas, 10) || 250,
        notas: (formDataObj.notas || '').trim() || null,
        image_url: image_url || null,
      };

      if (isEdit) {
        const updated = await restFetch(`/rest/v1/motores?id=eq.${encodeURIComponent(id)}`, {
          method: 'PATCH',
          body: JSON.stringify(motorData),
        });
        const savedRow = Array.isArray(updated) ? updated[0] : updated;
        if (savedRow?.id) await db.motores.put(savedRow).catch(() => {});
        window.Snackbar.show('Equipo actualizado exitosamente');
      } else {
        const empresaId = window._currentEmpresaId || loadEmpresaId() || localStorage.getItem('current_empresa_id');
        if (!empresaId) {
          throw new Error('No se encontró la finca activa. Recarga la página e intenta de nuevo.');
        }
        const created = await restFetch('/rest/v1/motores', {
          method: 'POST',
          body: JSON.stringify({
            ...motorData,
            horas: 0,
            empresa_id: empresaId,
          }),
        });
        const savedRow = Array.isArray(created) ? created[0] : created;
        if (navigator.onLine && !savedRow?.id) {
          throw new Error('Supabase no confirmó la creación del equipo');
        }
        if (savedRow?.id) await db.motores.put(savedRow).catch(() => {});
        window.Snackbar.show('Equipo guardado exitosamente');
      }

      if (navigator.onLine) {
        await syncTable('motores', true).catch(() => {});
      }

      window.clearScreenCache?.('motores');
      window.clearScreenCache?.('detalle_motor');
      if (window.isMobileFormSheetOpen?.()) {
        window.closeMobileFormSheet?.();
        await window.refreshMotoresList?.();
        if (isEdit && document.getElementById('motor-list-sheet')?.classList.contains('open')) {
          window.handleMotorCardClick?.(null, { dataset: { id, nombre: motorData.nombre || 'Detalle de Motor' } });
        }
        return;
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
      btnSave.innerHTML = `<span class="material-icons">${isEdit ? 'update' : 'save'}</span><span>${isEdit ? 'Actualizar' : 'Guardar'}</span>`;
    }
  });
}
