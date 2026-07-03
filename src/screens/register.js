import { validateInvitation, signUp, getUser, acceptInvitation, isAuthenticated, loadEmpresaId, getAccessToken } from '../auth.js';

const SUPABASE_URL = 'https://udhuizkqnmkhljmezzkd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkaHVpemtxbm1raGxqbWV6emtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTM2MTYsImV4cCI6MjA5MTIyOTYxNn0.W9bJ1S8A45RUGaulhdVG6UohGmGNxGMjLBsc0Q7voPE';

let _pendingToken = null;
let _empresaNombre = '';

export async function renderRegister(invitationToken) {
  _pendingToken = invitationToken || null;
  _empresaNombre = '';

  if (_pendingToken) {
    const info = await validateInvitation(_pendingToken);
    if (info) {
      _empresaNombre = info.empresaNombre;
    }
  }

  const isInvite = !!_pendingToken;

  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;padding:16px;">
      <div class="m3-card-filled" style="width:100%;max-width:480px;margin:0;">
        <div style="text-align:center;margin-bottom:32px;">
          <img src="/pwa-512x512.svg" alt="Finca Manager" style="width:48px;height:48px;margin-bottom:12px;">
          <h1 class="m3-headline-small m3-font-bold" style="color:#2d3e2c;">Finca Manager</h1>
          <p class="m3-body-medium" style="color:#666;margin-top:8px;">${isInvite ? 'Has sido invitado a colaborar. Crea tu cuenta para acceder.' : 'Regístrate para gestionar tu finca'}</p>
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
            <input type="password" id="reg-password" placeholder=" " required minlength="6" style="padding-right:48px;">
            <label>Contraseña (mín. 6 caracteres)</label>
            <span class="material-icons" id="pw-icon-reg" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);cursor:pointer;z-index:2;color:#888;">visibility_off</span>
          </div>
          <div class="m3-field" style="margin-bottom:20px;">
            <input type="password" id="reg-confirm" placeholder=" " required style="padding-right:48px;">
            <label>Confirmar contraseña</label>
            <span class="material-icons" id="pw-icon-confirm" style="position:absolute;right:16px;top:50%;transform:translateY(-50%);cursor:pointer;z-index:2;color:#888;">visibility_off</span>
          </div>
          ${isInvite ? `
          <div class="m3-field" style="margin-bottom:32px;" id="reg-empresa-field">
            <input type="text" id="reg-empresa-nombre" placeholder=" " value="${_empresaNombre}" required disabled>
            <label>Empresa</label>
          </div>` : `
          <div class="m3-field" style="margin-bottom:32px;" id="reg-empresa-field">
            <input type="text" id="reg-empresa-nombre" placeholder=" " value="">
            <label>Nombre de tu finca / empresa</label>
          </div>`}
          <div id="register-error" style="color:#ff4103;font-size:13px;margin-bottom:16px;display:none;"></div>
          <button type="submit" class="btn-m3-primary" style="width:100%;padding:14px;font-size:16px;font-weight:700;border-radius:12px;background:#2d3e2c;color:white;border:none;cursor:pointer;font-family:'Work Sans',sans-serif;">
            <span class="material-icons" style="vertical-align:middle;margin-right:8px;">person_add</span> ${isInvite ? 'Aceptar invitación' : 'Crear cuenta'}
          </button>
        </form>
        <div style="text-align:center;margin-top:24px;">
          <span style="color:#666;font-size:14px;">¿Ya tienes cuenta? </span>
          <a href="#" onclick="window.navigateTo('login', 'form'); return false;" style="color:#2d3e2c;font-weight:700;font-size:14px;">Inicia sesión</a>
        </div>
        <div style="text-align:center;margin-top:16px;">
          <button id="btn-back-register-info" onclick="window.navigateTo('login');" style="background:transparent;border:none;cursor:pointer;color:#888;font-size:13px;padding:8px 16px;border-radius:12px;">Volver al inicio</button>
        </div>
      </div>
    </div>
  `;
}

export function initRegister() {
  const form = document.getElementById('register-form');
  const errorEl = document.getElementById('register-error');
  if (!form) return;

  const pwIconReg = document.getElementById('pw-icon-reg');
  const pwInputReg = document.getElementById('reg-password');
  if (pwIconReg && pwInputReg) {
    pwIconReg.addEventListener('click', () => {
      const isPassword = pwInputReg.type === 'password';
      pwInputReg.type = isPassword ? 'text' : 'password';
      pwIconReg.textContent = isPassword ? 'visibility' : 'visibility_off';
    });
  }

  const pwIconConfirm = document.getElementById('pw-icon-confirm');
  const pwInputConfirm = document.getElementById('reg-confirm');
  if (pwIconConfirm && pwInputConfirm) {
    pwIconConfirm.addEventListener('click', () => {
      const isPassword = pwInputConfirm.type === 'password';
      pwInputConfirm.type = isPassword ? 'text' : 'password';
      pwIconConfirm.textContent = isPassword ? 'visibility' : 'visibility_off';
    });
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
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin" style="vertical-align:middle;">sync</span> Procesando...';
    errorEl.style.display = 'none';

    try {
      if (_pendingToken && isAuthenticated()) {
        const user = await getUser();
        if (!user) throw new Error('No se pudo obtener tu sesión');

        await fetch(`${SUPABASE_URL}/rest/v1/usuarios`, {
          method: 'POST',
          headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${getAccessToken()}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: user.id, email, nombre }),
        }).catch(() => {});

        await acceptInvitation(_pendingToken, user.id);
        loadEmpresaId();
        _pendingToken = null;
        window.Snackbar.show('Cuenta creada con éxito');
        setTimeout(() => window.navigateTo('dashboard'), 1200);
      } else {
        const empresaNombre = document.getElementById('reg-empresa-nombre')?.value.trim() || 'Mi Finca';
        await signUp(email, password, nombre, _pendingToken, empresaNombre);
        _pendingToken = null;
        btn.disabled = false;
        btn.innerHTML = '<span class="material-icons" style="vertical-align:middle;margin-right:8px;">person_add</span> Crear cuenta';
        window.Snackbar.confirm(
          'Se ha enviado un mensaje a tu correo para activar tu cuenta. Revisa tu bandeja de entrada o spam.',
          () => window.navigateTo('login'),
          null,
          { confirmText: 'Aceptar', cancelText: false }
        );
      }
    } catch (err) {
      errorEl.textContent = err.message;
      errorEl.style.display = 'block';
      btn.disabled = false;
      btn.innerHTML = '<span class="material-icons" style="vertical-align:middle;margin-right:8px;">person_add</span> Crear cuenta';
    }
  });
}
