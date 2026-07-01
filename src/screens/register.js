import { signUp } from '../auth.js';

let _pendingToken = null;

export async function renderRegister(invitationToken) {
  _pendingToken = invitationToken || null;
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;padding:32px;">
      <div class="m3-card" style="width:100%;max-width:400px;padding:40px;">
        <div style="text-align:center;margin-bottom:32px;">
          <span class="material-icons" style="font-size:48px;color:var(--m3-primary,#2d3e2c);margin-bottom:16px;">person_add</span>
          <h1 class="m3-headline-small m3-font-bold" style="color:#2d3e2c;">Crear Cuenta</h1>
          <p class="m3-body-medium" style="color:#666;margin-top:8px;">${invitationToken ? 'Has sido invitado a colaborar. Crea tu cuenta para acceder.' : 'Regístrate para gestionar tu finca'}</p>
        </div>
        <form id="register-form">
          <div class="m3-field" style="margin-bottom:20px;">
            <input type="text" id="reg-nombre" placeholder=" " required>
            <label>Nombre completo</label>
          </div>
          <div class="m3-field" style="margin-bottom:20px;">
            <input type="email" id="reg-email" placeholder=" " required>
            <label>Correo electrónico</label>
          </div>
          <div class="m3-field" style="margin-bottom:20px;">
            <input type="password" id="reg-password" placeholder=" " required minlength="6">
            <label>Contraseña (mín. 6 caracteres)</label>
          </div>
          <div class="m3-field" style="margin-bottom:20px;">
            <input type="password" id="reg-confirm" placeholder=" " required>
            <label>Confirmar contraseña</label>
          </div>
          <div class="m3-field" style="margin-bottom:32px;" id="reg-empresa-field">
            <input type="text" id="reg-empresa-nombre" placeholder=" " value="Mi Finca" required>
            <label>Nombre de tu finca / empresa</label>
          </div>
          <div id="register-error" style="color:#ff4103;font-size:13px;margin-bottom:16px;display:none;"></div>
          <button type="submit" class="btn-m3-primary" style="width:100%;padding:14px;font-size:16px;font-weight:700;border-radius:40px;background:#2d3e2c;color:white;border:none;cursor:pointer;font-family:'Work Sans',sans-serif;">
            <span class="material-icons" style="vertical-align:middle;margin-right:8px;">person_add</span> Crear cuenta
          </button>
        </form>
        <div style="text-align:center;margin-top:24px;">
          <span style="color:#666;font-size:14px;">¿Ya tienes cuenta? </span>
          <a href="#" onclick="window.navigateTo('login'); return false;" style="color:#2d3e2c;font-weight:700;font-size:14px;">Inicia sesión</a>
        </div>
      </div>
    </div>
  `;
}

export function initRegister() {
  const form = document.getElementById('register-form');
  const errorEl = document.getElementById('register-error');
  const empresaField = document.getElementById('reg-empresa-field');
  if (!form) return;
  if (_pendingToken && empresaField) {
    empresaField.style.display = 'none';
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const nombre = document.getElementById('reg-nombre').value.trim();
    const email = document.getElementById('reg-email').value.trim();
    const password = document.getElementById('reg-password').value;
    const confirm = document.getElementById('reg-confirm').value;
    if (!nombre || !email || !password) {
      errorEl.textContent = 'Completa todos los campos';
      errorEl.style.display = 'block';
      return;
    }
    if (password !== confirm) {
      errorEl.textContent = 'Las contraseñas no coinciden';
      errorEl.style.display = 'block';
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres';
      errorEl.style.display = 'block';
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin" style="vertical-align:middle;">sync</span> Creando cuenta...';
    errorEl.style.display = 'none';
    const empresaNombre = document.getElementById('reg-empresa-nombre')?.value.trim() || 'Mi Finca';
    try {
      await signUp(email, password, nombre, _pendingToken, empresaNombre);
      _pendingToken = null;
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons" style="vertical-align:middle;margin-right:8px;">person_add</span> Crear cuenta';
      window.Snackbar.confirm(
        'Se ha enviado un mensaje a tu correo para activar tu cuenta. Revisa tu bandeja de entrada.',
        () => window.navigateTo('login'),
        null,
        { confirmText: 'Aceptar', cancelText: false }
      );
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons" style="vertical-align:middle;margin-right:8px;">person_add</span> Crear cuenta';
    }
  });
}
