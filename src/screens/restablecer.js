import { updatePassword } from '../auth.js';

export function renderRestablecer() {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;padding:16px;">
      <div class="m3-card-filled" style="width:100%;max-width:480px;margin:0;">
        <div style="text-align:center;margin-bottom:32px;">
          <span class="material-icons" style="font-size:48px;color:#2d3e2c;margin-bottom:12px;">lock_reset</span>
          <h1 class="m3-headline-small m3-font-bold" style="color:#2d3e2c;">Restablecer Contraseña</h1>
          <p class="m3-body-medium" style="color:#666;margin-top:8px;">Escribe tu nueva contraseña</p>
        </div>
        <form id="restablecer-form">
          <div style="margin-bottom:20px;">
            <label style="font-size:13px;font-weight:600;color:#555;display:block;margin-bottom:4px;">Nueva contraseña</label>
            <div style="position:relative;">
              <input id="rest-password" type="password" placeholder="Mínimo 6 caracteres" style="width:100%;border:1px solid var(--m3-outline-variant,#e0e0e0);border-radius:12px;padding:10px 40px 10px 12px;font-size:14px;font-family:'Work Sans',sans-serif;background:white;color:#2d3e2c;outline:none;box-sizing:border-box;">
              <span id="rest-eye-pw" class="material-icons" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:20px;cursor:pointer;color:#888;">visibility_off</span>
            </div>
          </div>
          <div style="margin-bottom:4px;">
            <label style="font-size:13px;font-weight:600;color:#555;display:block;margin-bottom:4px;">Confirmar contraseña</label>
            <div style="position:relative;">
              <input id="rest-password-confirm" type="password" placeholder="Repite la contraseña" style="width:100%;border:1px solid var(--m3-outline-variant,#e0e0e0);border-radius:12px;padding:10px 40px 10px 12px;font-size:14px;font-family:'Work Sans',sans-serif;background:white;color:#2d3e2c;outline:none;box-sizing:border-box;">
              <span id="rest-eye-confirm" class="material-icons" style="position:absolute;right:10px;top:50%;transform:translateY(-50%);font-size:20px;cursor:pointer;color:#888;">visibility_off</span>
            </div>
          </div>
          <div id="restablecer-error" style="color:#ff4103;font-size:13px;margin-bottom:16px;margin-top:16px;display:none;"></div>
          <button type="submit" class="btn-m3-primary" style="width:100%;margin-top:20px;padding:14px;font-size:16px;font-weight:700;border-radius:12px;background:#2d3e2c;color:white;border:none;cursor:pointer;font-family:'Work Sans',sans-serif;">
            Guardar contraseña
          </button>
        </form>
      </div>
    </div>
  `;
}

export function initRestablecer() {
  const form = document.getElementById('restablecer-form');
  const errorEl = document.getElementById('restablecer-error');
  const pwInput = document.getElementById('rest-password');
  const pwConfirm = document.getElementById('rest-password-confirm');
  const eyePw = document.getElementById('rest-eye-pw');
  const eyeConfirm = document.getElementById('rest-eye-confirm');

  if (eyePw && pwInput) {
    eyePw.addEventListener('click', () => {
      const isPassword = pwInput.type === 'password';
      pwInput.type = isPassword ? 'text' : 'password';
      eyePw.textContent = isPassword ? 'visibility' : 'visibility_off';
    });
  }

  if (eyeConfirm && pwConfirm) {
    eyeConfirm.addEventListener('click', () => {
      const isPassword = pwConfirm.type === 'password';
      pwConfirm.type = isPassword ? 'text' : 'password';
      eyeConfirm.textContent = isPassword ? 'visibility' : 'visibility_off';
    });
  }

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const password = pwInput?.value?.trim() || '';
    const confirm = pwConfirm?.value?.trim() || '';

    errorEl.style.display = 'none';

    if (!password || !confirm) {
      errorEl.textContent = 'Completa ambos campos';
      errorEl.style.display = 'block';
      return;
    }
    if (password.length < 6) {
      errorEl.textContent = 'La contraseña debe tener al menos 6 caracteres';
      errorEl.style.display = 'block';
      return;
    }
    if (password !== confirm) {
      errorEl.textContent = 'Las contraseñas no coinciden';
      errorEl.style.display = 'block';
      return;
    }

    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = 'Guardando...';

    try {
      await updatePassword(password);
      window.Snackbar?.show('Contraseña actualizada correctamente. Inicia sesión con tu nueva contraseña.');
      window.navigateTo('login');
    } catch (err) {
      errorEl.textContent = err.message || 'Error al actualizar la contraseña';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = 'Guardar contraseña';
    }
  });
}
