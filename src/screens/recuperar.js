import { sendRecoveryEmail } from '../auth.js';

export function renderRecuperar() {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;padding:16px;">
      <div class="m3-card-filled" style="width:100%;max-width:480px;margin:0;">
        <div style="text-align:center;margin-bottom:32px;">
          <img src="/pwa-512x512.svg" alt="Finca Manager" style="width:48px;height:48px;margin-bottom:12px;">
          <h1 class="m3-headline-small m3-font-bold" style="color:#2d3e2c;">Recuperar Contraseña</h1>
          <p class="m3-body-medium" style="color:#666;margin-top:8px;">Ingresa tu correo y te enviaremos un enlace para restablecer tu contraseña</p>
        </div>
        <form id="recuperar-form">
          <div class="m3-field" style="margin-bottom:24px;">
            <input type="email" id="recuperar-email" placeholder=" " required>
            <label>Correo electrónico</label>
          </div>
          <div id="recuperar-error" style="color:#ff4103;font-size:13px;margin-bottom:16px;display:none;"></div>
          <button type="submit" class="btn-m3-primary" style="width:100%;padding:14px;font-size:16px;font-weight:700;border-radius:12px;background:#2d3e2c;color:white;border:none;cursor:pointer;font-family:'Work Sans',sans-serif;">
            Enviar enlace
          </button>
        </form>
        <div style="text-align:center;margin-top:24px;">
          <a href="#" onclick="window.navigateTo('login'); return false;" style="color:#2d3e2c;font-weight:600;font-size:14px;">Volver a iniciar sesión</a>
        </div>
      </div>
    </div>
  `;
}

export function initRecuperar() {
  const form = document.getElementById('recuperar-form');
  const errorEl = document.getElementById('recuperar-error');
  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('recuperar-email').value.trim();
    if (!email) {
      errorEl.textContent = 'Ingresa tu correo electrónico';
      errorEl.style.display = 'block';
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = 'Enviando...';
    errorEl.style.display = 'none';
    try {
      await sendRecoveryEmail(email);
      window.Snackbar?.show('Se enviará un enlace de cambio de contraseña a tu correo. El enlace tiene una duración limitada.');
      window.navigateTo('login');
    } catch (err) {
      errorEl.textContent = err.message || 'Error al enviar el correo';
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = 'Enviar enlace';
    }
  });
}
