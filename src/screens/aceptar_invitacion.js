import { validateInvitation, acceptInvitation, isAuthenticated, getUser, getUserEmpresas, restFetch } from '../auth.js';

let _empresaNombre = '';
let _empresaId = '';
let _token = '';

// Función global para aceptar la invitación directamente cuando el usuario ya está autenticado
window.handleAceptarInvitacionDirect = async function(token) {
  const btn = document.getElementById('btn-aceptar-invitacion');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin" style="vertical-align:middle;margin-right:8px;">sync</span>Procesando...';
  }
  try {
    const user = await getUser();
    if (!user) throw new Error('No se pudo obtener tu sesión de usuario.');

    // Verificar si ya es miembro de la empresa antes de intentar insertar
    const empresas = await getUserEmpresas();
    const yaMiembro = (empresas || []).some(emp => emp.id === _empresaId);
    if (yaMiembro) {
      window.Snackbar.show('Ya eres miembro de esta empresa');
      setTimeout(() => {
        window.location.hash = '#dashboard';
        window.location.reload();
      }, 1200);
      return;
    }

    await acceptInvitation(token, user.id);
    window.Snackbar.show('Invitación aceptada con éxito');
    setTimeout(() => {
      // Recargar la aplicación para que se aplique la nueva empresa activa
      window.location.hash = '#dashboard';
      window.location.reload();
    }, 1200);
  } catch (e) {
    window.Snackbar.show(`Error al aceptar invitación: ${e.message}`);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = 'Aceptar invitación';
    }
  }
};

export async function renderAceptarInvitacion(token) {
  _token = token;
  
  // Consumir y limpiar bandera de email
  sessionStorage.removeItem('finca_from_invite_email');

  const info = await validateInvitation(token);
  if (!info) {
    return `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;padding:32px;text-align:center;">
        <span class="material-icons" style="font-size:56px;color:#ff4103;margin-bottom:16px;">link_off</span>
        <h2 class="m3-headline-small m3-font-bold" style="color:#2d3e2c;">Invitación no válida</h2>
        <p style="color:#666;margin-top:8px;">Esta invitación ha expirado o no existe.</p>
        <button onclick="window.navigateTo('login')" style="margin-top:24px;padding:12px 24px;border-radius:12px;background:#2d3e2c;color:white;border:none;font-weight:700;cursor:pointer;">Ir a inicio</button>
      </div>
    `;
  }

  _empresaNombre = info.empresaNombre;
  _empresaId = info.empresaId;

  const user = isAuthenticated() ? await getUser() : null;
  
  // Verificar si tiene un registro completo en la tabla 'usuarios'
  let hasUserRecord = false;
  if (user) {
    try {
      const res = await restFetch(`/rest/v1/usuarios?id=eq.${encodeURIComponent(user.id)}`);
      hasUserRecord = res && res.length > 0;
    } catch (e) {
      console.warn('Error checking user record:', e);
    }
  }

  // Solo se permite la aceptación directa si el usuario tiene sesión activa AND existe su registro de usuario
  const isDirectAcceptAllowed = !!user && hasUserRecord;

  // Botón principal
  const buttonHtml = isDirectAcceptAllowed
    ? `<button id="btn-aceptar-invitacion" onclick="window.handleAceptarInvitacionDirect('${token}')" style="display:block;width:100%;padding:14px;border-radius:12px;background:#2d3e2c;color:white;border:none;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:12px;font-family:'Work Sans',sans-serif;">
         Aceptar invitación
       </button>`
    : `<button onclick="window.navigateTo('register','${token}')" style="display:block;width:100%;padding:14px;border-radius:12px;background:#2d3e2c;color:white;border:none;font-weight:700;font-size:15px;cursor:pointer;margin-bottom:12px;font-family:'Work Sans',sans-serif;">
         Aceptar
       </button>`;

  // Enlace o información secundaria
  const secondaryHtml = !!user
    ? `<div style="color:#666;font-size:13px;margin-top:16px;text-align:center;font-family:'Work Sans',sans-serif;">
         Conectado como <strong style="color:#2d3e2c;">${user.email}</strong>
       </div>`
    : `<button onclick="window.navigateTo('login','${token}')" style="display:block;width:100%;padding:14px;border-radius:12px;background:transparent;border:1px solid #ccc;color:#2d3e2c;font-weight:600;font-size:15px;cursor:pointer;font-family:'Work Sans',sans-serif;">
         Ya tengo cuenta — Iniciar sesión
       </button>`;

  return `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:80vh;padding:32px;">
      <div class="m3-card" style="width:100%;max-width:420px;padding:40px;text-align:center;">
        <span class="material-icons" style="font-size:56px;color:#2d3e2c;margin-bottom:16px;">mail</span>
        <h2 class="m3-headline-small m3-font-bold" style="color:#2d3e2c;margin-bottom:8px;">Has sido invitado</h2>
        <p style="color:#666;font-size:14px;margin-bottom:24px;line-height:1.5;">
          Fuiste invitado a colaborar en <strong style="color:#2d3e2c;">${info.empresaNombre}</strong> como <strong style="color:#2d3e2c;text-transform:capitalize;">${info.rol}</strong>.
        </p>
        ${buttonHtml}
        ${secondaryHtml}
      </div>
    </div>
  `;
}

