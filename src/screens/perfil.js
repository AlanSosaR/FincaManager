import { getUser, restFetch, updateProfile, verifyPassword, updatePassword } from '../auth.js';
import db from '../db.js';

export async function renderPerfil() {
  const user = await getUser();
  const nombre = user?.user_metadata?.nombre || user?.email || 'Usuario';
  const email = user?.email || '';
  const createdAt = user?.created_at || user?.user_metadata?.created_at || '';
  const fechaRegistro = createdAt ? new Date(createdAt).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }) : '';

  const empresaId = localStorage.getItem('current_empresa_id');
  let empresaNombre = 'Mi Finca';
  if (empresaId) {
    try {
      const emp = await db.empresas?.get(empresaId);
      if (emp) empresaNombre = emp.nombre;
      else {
        const data = await restFetch(`/rest/v1/empresas?id=eq.${empresaId}&select=nombre`);
        if (data?.[0]?.nombre) empresaNombre = data[0].nombre;
      }
    } catch {}
  }

  let userRole = '';
  if (empresaId && user?.id) {
    try {
      const ue = await restFetch(`/rest/v1/usuario_empresas?empresa_id=eq.${empresaId}&usuario_id=eq.${user.id}&select=rol`);
      if (ue?.[0]?.rol) userRole = ue[0].rol;
    } catch {}
  }

  return `
    <div class="m3-card-filled" style="margin-bottom:80px;">
      <div id="perfil-header-click" style="text-align:center;cursor:pointer;">
        <div style="width:80px;height:80px;border-radius:50%;background:#2d3e2c;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
          <span class="material-icons" style="font-size:40px;color:white;">account_circle</span>
        </div>
        <h1 id="perfil-header-name" class="m3-headline-small m3-font-bold" style="color:#2d3e2c;">${nombre}</h1>
        <p id="perfil-header-email" style="color:#666;font-size:14px;margin-top:4px;">${email}</p>
        <div style="margin-top:4px;color:#888;">
          <span id="perfil-arrow" class="material-icons" style="font-size:20px;transition:transform 0.2s;">expand_more</span>
        </div>
      </div>

      <div id="perfil-form-section" style="display:none;margin-top:24px;border-top:1px solid var(--m3-outline-variant,#e0e0e0);padding-top:24px;">
        <h3 class="m3-title-medium m3-font-bold" style="color:#2d3e2c;margin-bottom:16px;">Actualizar información</h3>

        <div style="margin-bottom:16px;">
          <label style="font-size:13px;font-weight:600;color:#555;display:block;margin-bottom:4px;">Nombre</label>
          <input id="pf-nombre" type="text" value="${nombre.replace(/"/g, '&quot;')}" style="width:100%;border:1px solid var(--m3-outline-variant,#e0e0e0);border-radius:12px;padding:10px 12px;font-size:14px;font-family:'Work Sans',sans-serif;background:white;color:#2d3e2c;outline:none;box-sizing:border-box;">
        </div>

        <div style="margin-bottom:16px;">
          <label style="font-size:13px;font-weight:600;color:#555;display:block;margin-bottom:4px;">Email</label>
          <input id="pf-email" type="email" value="${email.replace(/"/g, '&quot;')}" style="width:100%;border:1px solid var(--m3-outline-variant,#e0e0e0);border-radius:12px;padding:10px 12px;font-size:14px;font-family:'Work Sans',sans-serif;background:white;color:#2d3e2c;outline:none;box-sizing:border-box;">
        </div>

        ${fechaRegistro ? `<div style="margin-bottom:16px;font-size:13px;color:#888;"><span style="font-weight:600;color:#555;">Miembro desde:</span> ${fechaRegistro}</div>` : ''}

        <div style="margin-top:8px;border:1px solid var(--m3-outline-variant,#e0e0e0);border-radius:12px;overflow:hidden;">
          <div id="pf-password-toggle" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;cursor:pointer;user-select:none;">
            <span style="font-weight:600;color:#2d3e2c;font-size:14px;">Contraseña</span>
            <span id="pf-password-arrow" class="material-icons" style="color:#888;font-size:20px;transition:transform 0.2s;">expand_more</span>
          </div>
          <div id="pf-password-section" style="display:none;padding:0 16px 16px;border-top:1px solid var(--m3-outline-variant,#e0e0e0);padding-top:16px;">
            <div style="margin-bottom:12px;">
              <label style="font-size:13px;font-weight:600;color:#555;display:block;margin-bottom:4px;">Contraseña actual</label>
              <div style="position:relative;">
                <input id="pf-password-current" type="password" placeholder="Ingresa tu contraseña actual" style="width:100%;border:1px solid var(--m3-outline-variant,#e0e0e0);border-radius:12px;padding:10px 56px 10px 12px;font-size:14px;font-family:'Work Sans',sans-serif;background:white;color:#2d3e2c;outline:none;box-sizing:border-box;">
                <span id="pf-eye-current" class="material-icons pw-eye" style="position:absolute;right:36px;top:50%;transform:translateY(-50%);font-size:20px;cursor:pointer;color:#888;z-index:1;">visibility_off</span>
                <span id="pf-pw-status" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:18px;z-index:1;"></span>
              </div>
              <div id="pf-pw-msg" style="font-size:12px;margin-top:4px;"></div>
            </div>
            <div style="margin-bottom:12px;">
              <label style="font-size:13px;font-weight:600;color:#555;display:block;margin-bottom:4px;">Nueva contraseña</label>
              <div style="position:relative;">
                <input id="pf-password-new" type="password" placeholder="Nueva contraseña" style="width:100%;border:1px solid var(--m3-outline-variant,#e0e0e0);border-radius:12px;padding:10px 36px 10px 12px;font-size:14px;font-family:'Work Sans',sans-serif;background:white;color:#2d3e2c;outline:none;box-sizing:border-box;">
                <span id="pf-eye-new" class="material-icons pw-eye" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:20px;cursor:pointer;color:#888;z-index:1;">visibility_off</span>
              </div>
            </div>
            <div style="margin-bottom:4px;">
              <label style="font-size:13px;font-weight:600;color:#555;display:block;margin-bottom:4px;">Confirmar contraseña</label>
              <div style="position:relative;">
                <input id="pf-password-confirm" type="password" placeholder="Repite la nueva contraseña" style="width:100%;border:1px solid var(--m3-outline-variant,#e0e0e0);border-radius:12px;padding:10px 36px 10px 12px;font-size:14px;font-family:'Work Sans',sans-serif;background:white;color:#2d3e2c;outline:none;box-sizing:border-box;">
                <span id="pf-eye-confirm" class="material-icons pw-eye" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:20px;cursor:pointer;color:#888;z-index:1;">visibility_off</span>
              </div>
            </div>
          </div>
        </div>

        <button id="pf-save-btn" style="width:100%;margin-top:20px;padding:12px;background:#2d3e2c;color:white;border:none;border-radius:12px;font-size:15px;font-weight:700;font-family:'Work Sans',sans-serif;cursor:pointer;">Guardar cambios</button>
      </div>

      <div style="height:1px;background:var(--m3-outline-variant,#e0e0e0);margin:24px 0;"></div>

      <div>
        <h3 class="m3-title-medium m3-font-bold" style="color:#2d3e2c;margin-bottom:16px;">Empresa</h3>
        ${userRole === 'propietario' ? `
        <div id="perfil-empresa-row" style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--m3-surface-container-low);border-radius:12px;cursor:pointer;" onclick="window.editEmpresaNombre()">
          <span class="material-icons" style="color:#2d3e2c;">business</span>
          <div style="flex:1;">
            <div id="perfil-empresa-name" style="font-weight:700;color:#2d3e2c;">${empresaNombre}</div>
            <div style="font-size:12px;color:#888;">Empresa activa — clic para editar</div>
          </div>
          <span class="material-icons" style="color:#888;font-size:18px;">edit</span>
        </div>
        ` : `
        <div style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--m3-surface-container-low);border-radius:12px;">
          <span class="material-icons" style="color:#2d3e2c;">business</span>
          <div style="flex:1;">
            <div id="perfil-empresa-name" style="font-weight:700;color:#2d3e2c;">${empresaNombre}</div>
            <div style="font-size:12px;color:#888;">Empresa activa</div>
          </div>
        </div>
        `}
      </div>

    </div>
  `;
}

export function initPerfil() {
  const header = document.getElementById('perfil-header-click');
  const formSection = document.getElementById('perfil-form-section');

  header?.addEventListener('click', () => {
    if (!formSection) return;
    const isOpen = formSection.style.display !== 'none';
    formSection.style.display = isOpen ? 'none' : 'block';
    const arrow = document.getElementById('perfil-arrow');
    if (arrow) arrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    const headerName = document.getElementById('perfil-header-name');
    const headerEmail = document.getElementById('perfil-header-email');
    if (headerName) headerName.style.display = isOpen ? '' : 'none';
    if (headerEmail) headerEmail.style.display = isOpen ? '' : 'none';
  });

  const pwToggle = document.getElementById('pf-password-toggle');
  const pwSection = document.getElementById('pf-password-section');
  const pwArrow = document.getElementById('pf-password-arrow');

  pwToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!pwSection || !pwArrow) return;
    const isOpen = pwSection.style.display !== 'none';
    pwSection.style.display = isOpen ? 'none' : 'block';
    pwArrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
  });

  document.querySelectorAll('.pw-eye').forEach(el => {
    el.addEventListener('click', () => {
      const input = el.parentElement.querySelector('input');
      if (!input) return;
      const isPassword = input.type === 'password';
      input.type = isPassword ? 'text' : 'password';
      el.textContent = isPassword ? 'visibility' : 'visibility_off';
    });
  });

  const pwCurrent = document.getElementById('pf-password-current');
  const pwStatus = document.getElementById('pf-pw-status');
  const pwMsg = document.getElementById('pf-pw-msg');

  let pwTimer = null;
  pwCurrent?.addEventListener('input', () => {
    clearTimeout(pwTimer);
    const val = pwCurrent.value;
    if (!val) {
      pwStatus.textContent = '';
      pwMsg.textContent = '';
      return;
    }
    pwStatus.textContent = '⏳';
    pwStatus.style.color = '#888';
    pwTimer = setTimeout(async () => {
      try {
        const ok = await verifyPassword(val);
        if (ok) {
          pwStatus.textContent = '✅';
          pwStatus.style.color = '#2e7d32';
          pwMsg.textContent = 'Contraseña correcta';
          pwMsg.style.color = '#2e7d32';
        } else {
          pwStatus.textContent = '❌';
          pwStatus.style.color = '#c62828';
          pwMsg.textContent = 'Contraseña incorrecta';
          pwMsg.style.color = '#c62828';
        }
      } catch {
        pwStatus.textContent = '❌';
        pwStatus.style.color = '#c62828';
        pwMsg.textContent = 'Error al verificar';
        pwMsg.style.color = '#c62828';
      }
    }, 500);
  });

  const saveBtn = document.getElementById('pf-save-btn');
  saveBtn?.addEventListener('click', async () => {
    const nombreInput = document.getElementById('pf-nombre');
    const emailInput = document.getElementById('pf-email');
    const pwSectionEl = document.getElementById('pf-password-section');
    const pwNew = document.getElementById('pf-password-new');
    const pwConfirm = document.getElementById('pf-password-confirm');

    const nuevoNombre = nombreInput?.value?.trim() || '';
    const nuevoEmail = emailInput?.value?.trim() || '';

    const passwordOpen = pwSectionEl && pwSectionEl.style.display !== 'none';
    const pwNewVal = pwNew?.value?.trim() || '';
    const pwConfirmVal = pwConfirm?.value?.trim() || '';

    if (passwordOpen && (pwNewVal || pwConfirmVal)) {
      if (!pwNewVal || !pwConfirmVal) {
        window.Snackbar?.show('Completa ambos campos de contraseña', { type: 'error' });
        return;
      }
      if (pwNewVal.length < 6) {
        window.Snackbar?.show('La contraseña debe tener al menos 6 caracteres', { type: 'error' });
        return;
      }
      if (pwNewVal !== pwConfirmVal) {
        window.Snackbar?.show('Las contraseñas no coinciden', { type: 'error' });
        return;
      }
    }

    try {
      await updateProfile({ nombre: nuevoNombre, email: nuevoEmail });

      if (passwordOpen && pwNewVal) {
        await updatePassword(pwNewVal);
      }

      window.Snackbar?.show('Perfil actualizado correctamente');

      if (formSection) formSection.style.display = 'none';
      if (pwSection) { pwSection.style.display = 'none'; }
      if (pwArrow) pwArrow.style.transform = 'rotate(0deg)';

      const headerName = document.querySelector('#perfil-header-click h1');
      if (headerName) headerName.textContent = nuevoNombre;
      const headerEmail = document.querySelector('#perfil-header-click p');
      if (headerEmail) headerEmail.textContent = nuevoEmail;

      if (pwCurrent) pwCurrent.value = '';
      if (pwNew) pwNew.value = '';
      if (pwConfirm) pwConfirm.value = '';
      if (pwStatus) pwStatus.textContent = '';
      if (pwMsg) pwMsg.textContent = '';

    } catch (e) {
      const msg = e.message || '';
      if (msg.includes('different from the old password')) {
        window.Snackbar?.show('La nueva contraseña debe ser diferente a la actual', { type: 'error' });
      } else {
        window.Snackbar?.show('Error: ' + msg, { type: 'error' });
      }
    }
  });

  window.editEmpresaNombre = async function() {
    const currentName = document.getElementById('perfil-empresa-name')?.textContent || 'Mi Finca';
    const newName = prompt('Nuevo nombre de la empresa:', currentName);
    if (!newName || newName.trim() === currentName || newName.trim() === '') return;
    try {
      const empresaId = localStorage.getItem('current_empresa_id');
      await restFetch(`/rest/v1/empresas?id=eq.${empresaId}`, {
        method: 'PATCH',
        body: JSON.stringify({ nombre: newName.trim() })
      });
      document.getElementById('perfil-empresa-name').textContent = newName.trim();
      window.__empresaNombreChanged?.();
      window.Snackbar?.show('Nombre de empresa actualizado');
    } catch (e) {
      window.Snackbar?.show('Error: ' + (e.message || ''), { type: 'error' });
    }
  };
}
