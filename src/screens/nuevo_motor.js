import { supabase } from '../supabase.js';
import { restFetch, loadEmpresaId } from '../auth.js';
import db from '../db.js';
import { syncTable } from '../sync.js';
import { uploadImage } from '../utils/image_uploader.js';
import {
  DEFAULT_FUEL_MAINTENANCES,
  isLikelyFuelEquipment,
  parseMotorConfig,
  serializeMotorNotas
} from '../utils/motor_fuel_config.js';

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export async function renderNuevoMotor(id) {
  const isEdit = !!id;
  return `
    <div class="m3-form-screen">
      <style>
        .motor-mode-wrap {
          margin: 4px 0 18px;
        }
        .motor-mode-label {
          display: block;
          font-size: 13px;
          font-weight: 700;
          color: #2d3e2c;
          margin-bottom: 8px;
        }
        .motor-mode-segment {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 6px;
          background: #f1f4ef;
          border: 1px solid #dde4da;
          border-radius: 14px;
          padding: 4px;
        }
        .motor-mode-btn {
          height: 42px;
          border-radius: 11px;
          border: none;
          background: transparent;
          color: #364535;
          font-size: 14px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          transition: background 0.16s ease, color 0.16s ease, box-shadow 0.16s ease;
        }
        .motor-mode-btn.active {
          background: #2d3e2c;
          color: #ffffff;
          box-shadow: 0 2px 6px rgba(45, 62, 44, 0.22);
        }
        .motor-mode-hint {
          margin: 7px 2px 0;
          font-size: 12px;
          line-height: 1.4;
          color: #657263;
        }
        .fuel-section-title {
          font-size: 13px;
          font-weight: 700;
          color: #2d3e2c;
          margin: 0 0 8px;
        }
        .fuel-mant-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          background: #f2f5f0;
          border: 1px solid #e2e8df;
          border-radius: 14px;
          padding: 10px 12px;
        }
        .fuel-mant-info {
          min-width: 0;
          flex: 1;
        }
        .fuel-mant-name {
          font-size: 14.5px;
          font-weight: 700;
          color: #192b18;
          line-height: 1.25;
        }
        .fuel-mant-sub {
          font-size: 12px;
          color: #657263;
          margin-top: 2px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .fuel-mant-right {
          display: flex;
          align-items: center;
          gap: 7px;
          flex-shrink: 0;
        }
        .fuel-inline-num {
          width: 64px;
          height: 38px;
          border-radius: 10px;
          border: 1px solid #d4ddd2;
          background: #ffffff;
          text-align: center;
          font-size: 15px;
          font-weight: 700;
          color: #192b18;
          font-family: inherit;
          outline: none;
          box-sizing: border-box;
        }
        .fuel-inline-num:focus {
          border-color: #2d3e2c;
        }
        .fuel-unit-lbl {
          font-size: 13.5px;
          font-weight: 700;
          color: #556353;
        }
        .fuel-mant-del-btn {
          width: 28px;
          height: 28px;
          border-radius: 50%;
          border: none;
          background: transparent;
          color: #7c877a;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          padding: 0;
        }
        .fuel-mant-del-btn:hover {
          background: #e3ebe1;
          color: #ba1a1a;
        }
        .fuel-add-dashed-btn {
          width: 100%;
          height: 44px;
          margin-top: 8px;
          border-radius: 9999px;
          border: 1.5px dashed #c8d2c6;
          background: transparent;
          color: #465445;
          font-size: 13.5px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
        }
        .fuel-add-dashed-btn:hover {
          background: #f5f8f4;
          border-color: #2d3e2c;
        }
        .fuel-equiv-card {
          display: flex;
          align-items: center;
          gap: 10px;
          flex-wrap: wrap;
          background: #f2f5f0;
          border: 1px solid #e2e8df;
          border-radius: 14px;
          padding: 10px 14px;
          font-size: 14px;
          font-weight: 600;
          color: #192b18;
        }
      </style>
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
              </div>

              <!-- Cómo se mide su uso -->
              <div class="motor-mode-wrap" id="motor-mode-switch">
                <span class="motor-mode-label">¿Cómo se mide su uso?</span>
                <div class="motor-mode-segment" role="group" aria-label="Modo de medición">
                  <button type="button" class="motor-mode-btn active" id="mode-btn-horas" data-modo="horas" aria-pressed="true">Por horas</button>
                  <button type="button" class="motor-mode-btn" id="mode-btn-gasolina" data-modo="gasolina" aria-pressed="false">Por gasolina</button>
                </div>
                <p class="motor-mode-hint">Generadores y motores, por horas. Motoguadañas y motosierras, por gasolina.</p>
              </div>

              <div class="m3-grid-2col">
                <div class="m3-field" id="motor-hours-section">
                  <input type="number" name="max_horas" value="250" placeholder=" ">
                  <label>Límite de horas</label>
                </div>

                <div class="m3-field">
                  <input type="date" name="fecha_adquisicion" placeholder=" ">
                  <label>Fecha de adquisición</label>
                </div>
              </div>

              <!-- Sección Por Gasolina -->
              <div id="motor-fuel-section" style="display: none; margin: 4px 0 18px;">
                <p class="fuel-section-title">Mantenimientos</p>
                <div id="fuel-mants-list" style="display: flex; flex-direction: column; gap: 8px;"></div>

                <button type="button" class="fuel-add-dashed-btn" id="btn-add-fuel-mant">
                  <span class="material-icons" style="font-size: 18px;">add</span>
                  <span>Agregar mantenimiento</span>
                </button>

                <div id="fuel-add-mant-box" style="display: none; margin-top: 10px; background: #f6f8f5; border: 1px solid #d5e0d4; border-radius: 16px; padding: 14px;">
                  <div class="m3-field" style="margin-bottom: 12px;">
                    <input type="text" id="new-mant-name" placeholder=" " autocomplete="off">
                    <label for="new-mant-name">Nombre del mantenimiento</label>
                  </div>
                  <div class="m3-grid-2col" style="gap: 10px;">
                    <div class="m3-field" style="margin-bottom: 0;">
                      <input type="text" id="new-mant-desc" placeholder=" " autocomplete="off">
                      <label for="new-mant-desc">Detalle opcional</label>
                    </div>
                    <div class="m3-field" style="margin-bottom: 0;">
                      <input type="number" id="new-mant-liters" value="15" min="0.5" step="0.5" placeholder=" ">
                      <label for="new-mant-liters">Cada (litros)</label>
                    </div>
                  </div>
                  <div style="display: flex; justify-content: flex-end; gap: 8px; margin-top: 12px;">
                    <button type="button" id="btn-cancel-add-mant" style="height: 36px; padding: 0 14px; border-radius: 9999px; border: none; background: transparent; color: #465445; font-weight: 700; font-size: 13px; cursor: pointer;">Cancelar</button>
                    <button type="button" id="btn-confirm-add-mant" style="height: 36px; padding: 0 16px; border-radius: 9999px; border: none; background: #2d3e2c; color: #ffffff; font-weight: 700; font-size: 13px; cursor: pointer;">Agregar</button>
                  </div>
                </div>

                <div style="margin-top: 16px;">
                  <p class="fuel-section-title">Equivalencia en horas (opcional)</p>
                  <div class="fuel-equiv-card">
                    <span>1 litro =</span>
                    <input type="number" id="fuel-horas-por-litro" class="fuel-inline-num" value="2" min="0.1" step="0.5" aria-label="Horas de trabajo por litro">
                    <span>horas de trabajo</span>
                  </div>
                </div>

                <div class="m3-field" style="margin-top: 14px; margin-bottom: 0;">
                  <input type="number" id="fuel-precio-litro" min="0" step="0.01" placeholder=" ">
                  <label for="fuel-precio-litro">Precio por litro de gasolina (L) · opcional</label>
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
  const hoursSection = document.getElementById('motor-hours-section');
  const fuelSection = document.getElementById('motor-fuel-section');
  const mantsListEl = document.getElementById('fuel-mants-list');
  const btnModeHoras = document.getElementById('mode-btn-horas');
  const btnModeGasolina = document.getElementById('mode-btn-gasolina');
  const horasPorLitroInput = document.getElementById('fuel-horas-por-litro');
  const precioLitroInput = document.getElementById('fuel-precio-litro');
  const btnAddMant = document.getElementById('btn-add-fuel-mant');
  const addMantBox = document.getElementById('fuel-add-mant-box');
  const btnCancelAddMant = document.getElementById('btn-cancel-add-mant');
  const btnConfirmAddMant = document.getElementById('btn-confirm-add-mant');

  let selectedFile = null;
  let currentImageUrl = null;
  let currentModo = 'horas';
  let fuelMants = DEFAULT_FUEL_MAINTENANCES.map(m => ({ ...m }));

  function setUsoMode(modo) {
    currentModo = modo === 'gasolina' ? 'gasolina' : 'horas';
    if (btnModeHoras) {
      const active = currentModo === 'horas';
      btnModeHoras.classList.toggle('active', active);
      btnModeHoras.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    if (btnModeGasolina) {
      const active = currentModo === 'gasolina';
      btnModeGasolina.classList.toggle('active', active);
      btnModeGasolina.setAttribute('aria-pressed', active ? 'true' : 'false');
    }
    if (hoursSection) hoursSection.style.display = currentModo === 'horas' ? '' : 'none';
    if (fuelSection) fuelSection.style.display = currentModo === 'gasolina' ? 'block' : 'none';
  }

  function renderFuelMantsList() {
    if (!mantsListEl) return;
    mantsListEl.innerHTML = fuelMants.map((m, idx) => `
      <div class="fuel-mant-row">
        <div class="fuel-mant-info">
          <div class="fuel-mant-name">${escapeHtml(m.nombre)}</div>
          <div class="fuel-mant-sub">${m.desc ? `cada · ${escapeHtml(m.desc)}` : 'cada'}</div>
        </div>
        <div class="fuel-mant-right">
          <input type="number" class="fuel-inline-num fuel-mant-liters-input" data-idx="${idx}" value="${escapeHtml(m.cada_litros)}" min="0.5" step="0.5" aria-label="Litros para ${escapeHtml(m.nombre)}">
          <span class="fuel-unit-lbl">litros</span>
          ${fuelMants.length > 1 ? `
            <button type="button" class="fuel-mant-del-btn" data-remove-idx="${idx}" title="Quitar mantenimiento" aria-label="Quitar ${escapeHtml(m.nombre)}">
              <span class="material-icons" style="font-size: 18px;">close</span>
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');

    mantsListEl.querySelectorAll('.fuel-mant-liters-input').forEach((inp) => {
      inp.addEventListener('input', () => {
        const idx = parseInt(inp.dataset.idx, 10);
        const val = parseFloat(inp.value);
        if (!Number.isNaN(idx) && fuelMants[idx] && val > 0) {
          fuelMants[idx].cada_litros = val;
        }
      });
    });

    mantsListEl.querySelectorAll('.fuel-mant-del-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = parseInt(btn.dataset.removeIdx, 10);
        if (!Number.isNaN(idx) && fuelMants.length > 1) {
          fuelMants.splice(idx, 1);
          renderFuelMantsList();
        }
      });
    });
  }

  btnModeHoras?.addEventListener('click', () => setUsoMode('horas'));
  btnModeGasolina?.addEventListener('click', () => setUsoMode('gasolina'));

  form?.icon?.addEventListener('change', () => {
    if (isEdit) return;
    const iconVal = form.icon.value;
    if (iconVal === '✂️' || iconVal === '🪚') {
      setUsoMode('gasolina');
    } else if (['⚙️', '⚡', '🚜'].includes(iconVal)) {
      setUsoMode('horas');
    }
  });

  btnAddMant?.addEventListener('click', () => {
    if (!addMantBox) return;
    const isHidden = addMantBox.style.display === 'none' || !addMantBox.style.display;
    addMantBox.style.display = isHidden ? 'block' : 'none';
    if (isHidden) {
      document.getElementById('new-mant-name')?.focus();
    }
  });

  btnCancelAddMant?.addEventListener('click', () => {
    if (addMantBox) addMantBox.style.display = 'none';
  });

  btnConfirmAddMant?.addEventListener('click', () => {
    const nameEl = document.getElementById('new-mant-name');
    const descEl = document.getElementById('new-mant-desc');
    const litersEl = document.getElementById('new-mant-liters');
    const nombre = (nameEl?.value || '').trim();
    const desc = (descEl?.value || '').trim();
    const litros = parseFloat(litersEl?.value || '0');
    if (!nombre) {
      window.Snackbar?.show('Escribe el nombre del mantenimiento', { type: 'error' });
      nameEl?.focus();
      return;
    }
    if (!(litros > 0)) {
      window.Snackbar?.show('Indica cada cuántos litros se realiza', { type: 'error' });
      litersEl?.focus();
      return;
    }
    const key = nombre.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || `mant_${Date.now()}`;
    fuelMants.push({ key, nombre, desc, cada_litros: litros });
    if (nameEl) nameEl.value = '';
    if (descEl) descEl.value = '';
    if (litersEl) litersEl.value = '15';
    if (addMantBox) addMantBox.style.display = 'none';
    renderFuelMantsList();
  });

  renderFuelMantsList();
  setUsoMode('horas');

  if (isEdit) {
    try {
      const { data, error } = await supabase.from('motores').select('*').eq('id', id).single();
      if (error) throw error;

      const cfg = parseMotorConfig(data);
      fuelMants = cfg.mantenimientos.map(m => ({ ...m }));
      if (horasPorLitroInput) horasPorLitroInput.value = String(cfg.horasPorLitro);
      if (precioLitroInput && cfg.precioPorLitro > 0) {
        precioLitroInput.value = String(cfg.precioPorLitro);
        precioLitroInput.closest('.m3-field')?.classList.add('has-value');
      }
      renderFuelMantsList();

      // Fill form
      form.nombre.value = data.nombre || '';
      form.icon.value = data.icon || '⚙️';
      form.icon.dispatchEvent(new Event('change', { bubbles: true }));
      form.fecha_adquisicion.value = data.fecha_adquisicion || '';
      form.fecha_adquisicion.dispatchEvent(new Event('change', { bubbles: true }));
      form.max_horas.value = data.max_horas || 250;
      form.notas.value = cfg.cleanNotas || '';

      setUsoMode(cfg.modo);

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

      const iconVal = formDataObj.icon || '⚙️';
      const horasPorLitroVal = parseFloat(horasPorLitroInput?.value) || 2;
      const precioLitroVal = parseFloat(precioLitroInput?.value || '0') || 0;
      const sanitizedMants = fuelMants.map((m, idx) => {
        const inp = mantsListEl?.querySelector(`.fuel-mant-liters-input[data-idx="${idx}"]`);
        const rawL = inp ? parseFloat(inp.value) : parseFloat(m.cada_litros);
        return {
          ...m,
          cada_litros: rawL > 0 ? rawL : 10,
        };
      });

      const serializedNotas = serializeMotorNotas(formDataObj.notas, {
        modo: currentModo,
        horasPorLitro: horasPorLitroVal,
        precioPorLitro: precioLitroVal,
        mantenimientos: sanitizedMants,
        forceTag: isLikelyFuelEquipment(iconVal, nombre),
      });

      const resolvedMaxHoras = currentModo === 'gasolina'
        ? Math.max(1, Math.round(sanitizedMants[0]?.cada_litros || 10))
        : (parseInt(formDataObj.max_horas, 10) || 250);

      const motorData = {
        nombre,
        icon: iconVal,
        fecha_adquisicion: formDataObj.fecha_adquisicion || null,
        max_horas: resolvedMaxHoras,
        notas: serializedNotas,
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
