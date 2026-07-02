import { logout, getUser } from '../auth.js';
import db from '../db.js';
import { fullDownload } from '../sync.js';

export async function renderConfiguracion() {
  return `
    <div class="m3-card-filled" style="margin-bottom:80px;">
      <h2 class="m3-headline-small m3-font-bold" style="color:#2d3e2c;margin-bottom:24px;">Configuración</h2>

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
        <button id="btn-config-download" class="btn-m3-primary" style="width:100%;padding:14px;border-radius:12px;background:#2d3e2c;color:white;border:none;font-weight:700;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
          <span class="material-icons">cloud_download</span> Descargar datos
        </button>
        <button id="btn-config-clear-cache" class="btn-m3-tonal" style="width:100%;padding:14px;border-radius:12px;background:var(--m3-surface-container-highest);color:#2d3e2c;border:none;font-weight:600;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
          <span class="material-icons">cleaning_services</span> Limpiar caché
        </button>
      </div>
    </div>
  `;
}

export function initConfiguracion() {
  document.getElementById('btn-config-download')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-config-download');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Descargando...';
    try {
      await fullDownload();
    } catch (e) { console.error(e); }
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">cloud_download</span> Descargar datos';
  });

  document.getElementById('btn-config-clear-cache')?.addEventListener('click', () => {
    window.clearScreenCache?.();
    if (window.Snackbar) window.Snackbar.show('Caché limpiado');
  });
}
