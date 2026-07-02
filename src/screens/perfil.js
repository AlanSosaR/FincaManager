import { logout, getUser, isAuthenticated, restFetch } from '../auth.js';
import db from '../db.js';
import { fullDownload } from '../sync.js';

export async function renderPerfil() {
  const user = await getUser();
  const nombre = user?.user_metadata?.nombre || user?.email || 'Usuario';
  const email = user?.email || '';
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

  return `
    <div class="m3-card-filled">
      <div style="text-align:center;">
        <div style="width:80px;height:80px;border-radius:50%;background:#2d3e2c;display:flex;align-items:center;justify-content:center;margin:0 auto 16px;">
          <span class="material-icons" style="font-size:40px;color:white;">account_circle</span>
        </div>
        <h1 class="m3-headline-small m3-font-bold" style="color:#2d3e2c;">${nombre}</h1>
        <p style="color:#666;font-size:14px;margin-top:4px;">${email}</p>
      </div>

      <div style="height:1px;background:var(--m3-outline-variant,#e0e0e0);margin:24px 0;"></div>

      <div>
        <h3 class="m3-title-medium m3-font-bold" style="color:#2d3e2c;margin-bottom:16px;">Empresa</h3>
        <div id="perfil-empresa-row" style="display:flex;align-items:center;gap:12px;padding:12px;background:var(--m3-surface-container-low);border-radius:12px;cursor:pointer;" onclick="window.editEmpresaNombre()">
          <span class="material-icons" style="color:#2d3e2c;">business</span>
          <div style="flex:1;">
            <div id="perfil-empresa-name" style="font-weight:700;color:#2d3e2c;">${empresaNombre}</div>
            <div style="font-size:12px;color:#888;">Empresa activa — clic para editar</div>
          </div>
          <span class="material-icons" style="color:#888;font-size:18px;">edit</span>
        </div>
      </div>

      <div style="height:1px;background:var(--m3-outline-variant,#e0e0e0);margin:24px 0;"></div>

      <div>
        <h3 class="m3-title-medium m3-font-bold" style="color:#2d3e2c;margin-bottom:16px;">Información del sistema</h3>
        <div style="display:grid;gap:12px;">
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--m3-outline-variant,#eee);">
            <span style="color:#666;">Aplicación</span>
            <span style="font-weight:600;color:#2d3e2c;">Finca Manager</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--m3-outline-variant,#eee);">
            <span style="color:#666;">Versión</span>
            <span style="font-weight:600;color:#2d3e2c;">1.0.0</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--m3-outline-variant,#eee);">
            <span style="color:#666;">Navegador</span>
            <span style="font-weight:600;color:#2d3e2c;">${navigator.userAgent.substring(0, 40)}...</span>
          </div>
          <div style="display:flex;justify-content:space-between;padding:8px 0;">
            <span style="color:#666;">Estado</span>
            <span style="font-weight:600;color:${navigator.onLine ? '#2d3e2c' : '#ff4103'};">${navigator.onLine ? 'En línea' : 'Sin conexión'}</span>
          </div>
        </div>
      </div>

      <div style="height:1px;background:var(--m3-outline-variant,#e0e0e0);margin:24px 0;"></div>

      <div style="display:grid;gap:12px;">
        <button id="btn-perfil-download" class="btn-m3-primary" style="width:100%;padding:14px;border-radius:40px;background:#2d3e2c;color:white;border:none;font-weight:700;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
          <span class="material-icons">cloud_download</span> Descargar datos
        </button>
        <button id="btn-perfil-clear-cache" class="btn-m3-tonal" style="width:100%;padding:14px;border-radius:40px;background:var(--m3-surface-container-highest);color:#2d3e2c;border:none;font-weight:600;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
          <span class="material-icons">cleaning_services</span> Limpiar caché
        </button>
        <button id="btn-perfil-logout" style="width:100%;padding:14px;border-radius:40px;background:transparent;color:#ff4103;border:1px solid #ff4103;font-weight:600;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
          <span class="material-icons">logout</span> Cerrar sesión
        </button>
      </div>
    </div>
  `;
}

window.editEmpresaNombre = function() {
  const nameEl = document.getElementById('perfil-empresa-name');
  const row = document.getElementById('perfil-empresa-row');
  if (!nameEl || !row) return;
  const currentName = nameEl.textContent;
  row.onclick = null;
  nameEl.innerHTML = `
    <div style="display:flex;gap:8px;align-items:center;">
      <input id="perfil-empresa-input" type="text" value="${currentName.replace(/"/g, '&quot;')}" style="flex:1;border:1px solid #2d3e2c;border-radius:8px;padding:8px 10px;font-size:14px;font-weight:700;font-family:'Work Sans',sans-serif;background:white;color:#2d3e2c;outline:none;">
      <button id="perfil-empresa-ok" style="background:#2d3e2c;color:white;border:none;border-radius:8px;min-width:40px;height:40px;cursor:pointer;display:flex;align-items:center;justify-content:center;">
        <span class="material-icons" style="font-size:20px;">check</span>
      </button>
    </div>
  `;
  const input = document.getElementById('perfil-empresa-input');
  const okBtn = document.getElementById('perfil-empresa-ok');
  if (!input) return;
  input.focus();
  input.select();
  okBtn?.addEventListener('click', (e) => { e.stopPropagation(); save(); });
  async function save() {
    const newName = input.value.trim();
    if (!newName || newName === currentName) { cancel(); return; }
    const empresaId = localStorage.getItem('current_empresa_id');
    if (!empresaId) { cancel(); return; }
    try {
      const result = await restFetch(`/rest/v1/empresas?id=eq.${encodeURIComponent(empresaId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ nombre: newName }),
      });
      await db.empresas?.put(result?.[0] || { id: empresaId, nombre: newName });
      nameEl.textContent = newName;
      nameEl.style.display = '';
      window.__empresaNombreChanged?.();
      window.Snackbar.show('Nombre de empresa actualizado');
    } catch (e) {
      window.Snackbar.show('Error al actualizar: ' + e.message, { type: 'error' });
    }
    row.onclick = window.editEmpresaNombre;
  }
  function cancel() {
    nameEl.textContent = currentName;
    nameEl.style.display = '';
    row.onclick = window.editEmpresaNombre;
  }
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); save(); }
    if (e.key === 'Escape') { e.preventDefault(); cancel(); }
  });
  input.addEventListener('blur', () => save());
};

export function initPerfil() {
  document.getElementById('btn-perfil-download')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-perfil-download');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Descargando...';
    try {
      await fullDownload();
    } catch (e) { console.error(e); }
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">cloud_download</span> Descargar datos';
  });

  document.getElementById('btn-perfil-clear-cache')?.addEventListener('click', () => {
    window.clearScreenCache?.();
    if (window.Snackbar) window.Snackbar.show('Caché limpiado');
  });

  document.getElementById('btn-perfil-logout')?.addEventListener('click', async () => {
    await logout();
    window.location.reload();
  });
}
