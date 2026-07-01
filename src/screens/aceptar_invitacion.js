import { validateInvitation, acceptInvitation, signUp, isAuthenticated, getUser } from '../auth.js';

let _empresaNombre = '';
let _empresaId = '';
let _token = '';

export async function renderAceptarInvitacion(token) {
  _token = token;
  const info = await validateInvitation(token);
  if (!info) {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;padding:32px;text-align:center;">
        <span class="material-icons" style="font-size:56px;color:#ff4103;margin-bottom:16px;">link_off</span>
        <h2 class="m3-headline-small m3-font-bold" style="color:#2d3e2c;">Invitación no válida</h2>
        <p style="color:#666;margin-top:8px;">Esta invitación ha expirado o no existe.</p>
        <button onclick="window.navigateTo('login')" style="margin-top:24px;padding:12px 24px;border-radius:40px;background:#2d3e2c;color:white;border:none;font-weight:700;cursor:pointer;">Ir a inicio</button>
      </div>
    `;
  }

  _empresaNombre = info.empresaNombre;
  _empresaId = info.empresaId;

  if (isAuthenticated()) {
    const user = await getUser();
    if (user) {
      try {
        await acceptInvitation(token, user.id);
        window.location.reload();
      } catch (e) {
        return `<div style="padding:24px;color:red;">Error: ${e.message}</div>`;
      }
    }
  }

  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;padding:32px;">
      <div class="m3-card" style="width:100%;max-width:420px;padding:40px;text-align:center;">
        <span class="material-icons" style="font-size:56px;color:#2d3e2c;margin-bottom:16px;">mail</span>
        <h2 class="m3-headline-small m3-font-bold" style="color:#2d3e2c;margin-bottom:8px;">Has sido invitado</h2>
        <p style="color:#666;font-size:14px;margin-bottom:24px;line-height:1.5;">
          Fuiste invitado a colaborar en <strong style="color:#2d3e2c;">${info.empresaNombre}</strong> como <strong style="color:#2d3e2c;text-transform:capitalize;">${info.rol}</strong>.
        </p>
        <button onclick="window.navigateTo('register','${token}')" style="display:block;width:100%;padding:14px;border-radius:40px;background:#2d3e2c;color:white;border:none;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:12px;">
          Crear cuenta y aceptar
        </button>
        <button onclick="window.navigateTo('login','${token}')" style="display:block;width:100%;padding:14px;border-radius:40px;background:transparent;border:1px solid #ccc;color:#2d3e2c;font-weight:600;font-size:15px;cursor:pointer;">
          Ya tengo cuenta — Iniciar sesión
        </button>
      </div>
    </div>
  `;
}
