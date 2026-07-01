import { login } from '../auth.js';

export async function renderLogin() {
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;padding:32px;">
      <div class="m3-card" style="width:100%;max-width:400px;padding:40px;">
        <div style="text-align:center;margin-bottom:32px;">
          <span class="material-icons" style="font-size:48px;color:var(--m3-primary,#2d3e2c);margin-bottom:16px;">account_circle</span>
          <h1 class="m3-headline-small m3-font-bold" style="color:#2d3e2c;">Iniciar Sesión</h1>
          <p class="m3-body-medium" style="color:#666;margin-top:8px;">Accede a tu cuenta</p>
        </div>
        <form id="login-form">
          <div class="m3-field" style="margin-bottom:20px;">
            <input type="email" id="login-email" placeholder=" " required>
            <label>Correo electrónico</label>
          </div>
          <div class="m3-field" style="margin-bottom:32px;">
            <input type="password" id="login-password" placeholder=" " required>
            <label>Contraseña</label>
          </div>
          <div id="login-error" style="color:#ff4103;font-size:13px;margin-bottom:16px;display:none;"></div>
          <button type="submit" class="btn-m3-primary" style="width:100%;padding:14px;font-size:16px;font-weight:700;border-radius:40px;background:#2d3e2c;color:white;border:none;cursor:pointer;font-family:'Work Sans',sans-serif;">
            <span class="material-icons" style="vertical-align:middle;margin-right:8px;">login</span> Entrar
          </button>
        </form>
        <div style="text-align:center;margin-top:24px;">
          <span style="color:#666;font-size:14px;">¿No tienes cuenta? </span>
          <a href="#" onclick="window.navigateTo('register'); return false;" style="color:#2d3e2c;font-weight:700;font-size:14px;">Regístrate</a>
        </div>
      </div>
    </div>
  `;
}

export function initLogin() {
  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  if (!form) return;
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('login-email').value.trim();
    const password = document.getElementById('login-password').value;
    if (!email || !password) {
      errorEl.textContent = 'Completa todos los campos';
      errorEl.style.display = 'block';
      return;
    }
    const btn = form.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin" style="vertical-align:middle;">sync</span> Entrando...';
    errorEl.style.display = 'none';
    try {
      const result = await login(email, password);
      if (result?.session) {
        window.location.reload();
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons" style="vertical-align:middle;margin-right:8px;">login</span> Entrar';
    }
  });
}
