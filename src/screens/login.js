import { login, restFetch } from '../auth.js';

export async function renderLogin(showForm) {
  const showFormDirect = showForm === 'form';
  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;padding:16px;">
      <div id="login-info-card" class="login-info-card" style="${showFormDirect ? 'display:none;' : ''}">
        <div class="login-decorative-blob"></div>

          <div class="login-info-content">
            <div class="login-icon-box">
              <img src="/pwa-512x512.svg" alt="Finca Manager" class="login-logo">
            </div>
            <h1 class="m3-display-medium" style="color:var(--m3-on-surface);margin-bottom:16px;">Finca Manager</h1>
            <p class="m3-body-large" style="color:var(--m3-on-surface-variant);margin-bottom:24px;max-width:28rem;">
              Gestiona tu finca agrícola de forma colaborativa, incluso sin conexión. Centraliza tus datos y toma decisiones informadas desde cualquier lugar.
            </p>
            <button id="btn-start-app" class="login-empezar-btn desktop-btn">
              Empezar ahora
            </button>
          </div>

        <div class="login-features-grid">
          <div class="login-feature-card">
            <img src="/planta-de-cafe.png" alt="Cafetal" class="login-feature-icon-img">
            <span class="login-feature-title">Cafetal</span>
            <p class="login-feature-desc">Gestión de lotes, variedades y seguimiento de cosecha.</p>
          </div>
          <div class="login-feature-card">
            <img src="/vaca.png" alt="Ganado" class="login-feature-icon-img">
            <span class="login-feature-title">Ganado</span>
            <p class="login-feature-desc">Control individual, trazabilidad y estado de salud.</p>
          </div>
          <div class="login-feature-card">
            <span class="material-symbols-outlined">groups</span>
            <span class="login-feature-title">Personal</span>
            <p class="login-feature-desc">Administración de jornadas, pagos y tareas específicas.</p>
          </div>
          <div class="login-feature-card">
            <span class="material-symbols-outlined">settings_suggest</span>
            <span class="login-feature-title">Motores</span>
            <p class="login-feature-desc">Mantenimiento preventivo y control de horas de uso.</p>
          </div>
          <div class="login-feature-card">
            <span class="material-symbols-outlined">landscape</span>
            <span class="login-feature-title">Potreros</span>
            <p class="login-feature-desc">Optimización de pastoreo y rotación inteligente.</p>
          </div>
          <div class="login-feature-card highlighted">
            <span class="material-symbols-outlined">wifi_off</span>
            <span class="login-feature-title">Sin Conexión</span>
            <p class="login-feature-desc">Sincronización automática de datos al recuperar la señal.</p>
          </div>
        </div>

        <button class="login-empezar-btn mobile-btn">
          Empezar ahora
        </button>
      </div>

      <div id="login-form-card" class="m3-card-filled" style="width:100%;max-width:480px;margin:0;${showFormDirect ? '' : 'display:none;'}">
        <div style="text-align:center;margin-bottom:32px;">
          <img src="/pwa-512x512.svg" alt="Finca Manager" style="width:48px;height:48px;margin-bottom:12px;">
          <h1 class="m3-headline-small m3-font-bold" style="color:#2d3e2c;">Finca Manager</h1>
          <p class="m3-body-medium" style="color:#666;margin-top:8px;">Inicia sesión para acceder a tu finca</p>
        </div>
        <form id="login-form">
          <div class="m3-field" style="margin-bottom:20px;">
            <input type="email" id="login-email" placeholder=" " required>
            <label>Correo electrónico</label>
          </div>
          <div class="m3-field" style="margin-bottom:32px;">
            <input type="password" id="login-password" placeholder=" " required style="padding-right:48px;">
            <label>Contraseña</label>
            <span class="material-icons" id="pw-icon" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);cursor:pointer;z-index:2;color:#888;">visibility_off</span>
          </div>
          <div id="login-error" style="color:#ff4103;font-size:13px;margin-bottom:16px;display:none;"></div>
          <button type="submit" class="btn-m3-primary" style="width:100%;padding:14px;font-size:16px;font-weight:700;border-radius:12px;background:#2d3e2c;color:white;border:none;cursor:pointer;font-family:'Work Sans',sans-serif;">
            <span class="material-icons" style="vertical-align:middle;margin-right:8px;">login</span> Entrar
          </button>
        </form>
        <div style="text-align:center;margin-top:24px;">
          <span style="color:#666;font-size:14px;">¿No tienes cuenta? </span>
          <a href="#" onclick="window.navigateTo('register'); return false;" style="color:#2d3e2c;font-weight:700;font-size:14px;">Regístrate</a>
        </div>
        <div style="text-align:center;margin-top:16px;">
          <button id="btn-back-info" style="background:transparent;border:none;cursor:pointer;color:#888;font-size:13px;padding:8px 16px;border-radius:12px;">Volver al inicio</button>
        </div>
      </div>
    </div>
  `;
}

export function initLogin() {
  const startBtns = document.querySelectorAll('.login-empezar-btn');
  const backBtn = document.getElementById('btn-back-info');
  const infoCard = document.getElementById('login-info-card');
  const formCard = document.getElementById('login-form-card');
  startBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      infoCard.style.display = 'none';
      formCard.style.display = '';
    });
  });
  if (backBtn && infoCard && formCard) {
    backBtn.addEventListener('click', () => {
      formCard.style.display = 'none';
      infoCard.style.display = '';
    });
  }

  const form = document.getElementById('login-form');
  const errorEl = document.getElementById('login-error');
  if (!form) return;

  const pwIcon = document.getElementById('pw-icon');
  const pwInput = document.getElementById('login-password');
  if (pwIcon && pwInput) {
    pwIcon.addEventListener('click', () => {
      const isPassword = pwInput.type === 'password';
      pwInput.type = isPassword ? 'text' : 'password';
      pwIcon.textContent = isPassword ? 'visibility' : 'visibility_off';
    });
  }
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
        const empresaId = localStorage.getItem('current_empresa_id');
        let empresaNombre = '';
        if (empresaId) {
          try {
            const data = await restFetch(`/rest/v1/empresas?id=eq.${empresaId}&select=nombre`);
            if (data?.[0]?.nombre) empresaNombre = data[0].nombre;
          } catch {}
        }
        const msg = empresaNombre ? `Has iniciado sesión en ${empresaNombre}` : 'Has iniciado sesión';
        window.Snackbar.show(msg);
        setTimeout(() => window.navigateTo('dashboard'), 1200);
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons" style="vertical-align:middle;margin-right:8px;">login</span> Entrar';
    }
  });
}
