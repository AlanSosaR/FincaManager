import { logout, getUser } from '../auth.js';
import db from '../db.js';
import { fullDownload } from '../sync.js';
import { createInstance, getQR, checkConnection, joinGroup } from '../wa.js';

export async function renderConfiguracion() {
  const groupJid = localStorage.getItem('whatsapp_group_jid') || '';

  return `
    <div class="m3-card-filled" style="margin-bottom:80px;">
      <h2 class="m3-headline-small m3-font-bold" style="color:#2d3e2c;margin-bottom:24px;">Configuración</h2>

      <div style="height:1px;background:var(--m3-outline-variant,#e0e0e0);margin:24px 0;"></div>

      <div>
        <h3 class="m3-title-medium m3-font-bold" style="color:#2d3e2c;margin-bottom:16px;">WhatsApp</h3>
        <div id="wa-status" style="margin-bottom:12px;font-size:14px;color:#666;">
          <span id="wa-status-text">Verificando conexión...</span>
        </div>
        <div id="wa-qr-area" style="display:none;text-align:center;margin-bottom:16px;">
          <div id="wa-qr-container" style="background:white;padding:16px;border-radius:12px;display:inline-block;box-shadow:0 2px 8px rgba(0,0,0,.1);"></div>
          <p style="font-size:13px;color:#666;margin-top:8px;">Escanea este código QR con WhatsApp</p>
        </div>
        <div style="display:grid;gap:8px;">
          <button id="btn-wa-connect" class="btn-m3-primary" style="width:100%;padding:14px;border-radius:12px;background:#2d3e2c;color:white;border:none;font-weight:700;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
            <span class="material-icons">qr_code_scanner</span> Conectar WhatsApp
          </button>
          <button id="btn-wa-join-group" class="btn-m3-tonal" style="width:100%;padding:14px;border-radius:12px;background:var(--m3-surface-container-highest);color:#2d3e2c;border:none;font-weight:600;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
            <span class="material-icons">group_add</span> Unirse al grupo
          </button>
        </div>
        <div style="margin-top:12px;">
          <label style="font-size:13px;color:#666;display:block;margin-bottom:4px;">ID del Grupo de WhatsApp</label>
          <input type="text" id="wa-group-jid" value="${groupJid}" placeholder="Ej: 50399999999-123456@g.us" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--m3-outline-variant,#e0e0e0);font-size:14px;font-family:'Work Sans',sans-serif;">
          <p style="font-size:12px;color:#999;margin-top:4px;">Se llena automáticamente al unirse al grupo</p>
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

let waPollInterval = null;

export function initConfiguracion() {
  updateWhatsAppStatus();

  document.getElementById('btn-wa-connect')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-wa-connect');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons animate-spin">sync</span> Conectando...';

    try {
      const instanceResult = await createInstance();
      console.log('Instance create response:', instanceResult);

      const qrData = await getQR();
      console.log('QR response:', qrData);
      const qrArea = document.getElementById('wa-qr-area');
      const qrContainer = document.getElementById('wa-qr-container');

      if (qrData?.qrcode?.base64) {
        qrArea.style.display = 'block';
        qrContainer.innerHTML = `<img src="${qrData.qrcode.base64}" alt="WhatsApp QR" style="width:256px;height:256px;image-rendering:pixelated;">`;
        startWaPolling();
      } else if (qrData?.qrcode?.code) {
        qrArea.style.display = 'block';
        qrContainer.innerHTML = `<div style="font-size:24px;font-weight:700;color:#2d3e2c;padding:32px;">${qrData.qrcode.code}</div>
          <p style="font-size:13px;color:#666;">O usa este código de emparejamiento en WhatsApp</p>`;
        startWaPolling();
      } else {
        console.error('QR data inesperada:', JSON.stringify(qrData));
        if (window.Snackbar) window.Snackbar.show('Error al obtener QR: ' + JSON.stringify(qrData), 'error');
      }
    } catch (e) {
      console.error('Error completo:', e);
      if (window.Snackbar) window.Snackbar.show('Error: ' + (e.message || e), 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">qr_code_scanner</span> Conectar WhatsApp';
  });

  document.getElementById('btn-wa-join-group')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-wa-join-group');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons animate-spin">sync</span> Uniendo...';

    try {
      const result = await joinGroup('JET2ESGPwDBCFWTFdDWLIe');
      if (result?.id) {
        document.getElementById('wa-group-jid').value = result.id;
        if (window.Snackbar) window.Snackbar.show('Unido al grupo correctamente ✓');
      } else {
        const jid = localStorage.getItem('whatsapp_group_jid');
        if (jid) {
          document.getElementById('wa-group-jid').value = jid;
          if (window.Snackbar) window.Snackbar.show('Grupo configurado ✓');
        } else {
          if (window.Snackbar) window.Snackbar.show('No se pudo unir al grupo. Verifica que WhatsApp esté conectado.', 'error');
        }
      }
    } catch (e) {
      console.error(e);
      if (window.Snackbar) window.Snackbar.show('Error al unirse al grupo', 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">group_add</span> Unirse al grupo';
  });

  document.getElementById('wa-group-jid')?.addEventListener('change', (e) => {
    localStorage.setItem('whatsapp_group_jid', e.target.value.trim());
  });

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

async function updateWhatsAppStatus() {
  const el = document.getElementById('wa-status-text');
  if (!el) return;
  try {
    const connected = await checkConnection();
    el.innerHTML = connected
      ? '<span style="color:#2d3e2c;font-weight:600;">✓ Conectado</span>'
      : '<span style="color:#ff4103;">✗ Desconectado</span>';
  } catch {
    el.textContent = 'No disponible';
  }
}

function startWaPolling() {
  if (waPollInterval) clearInterval(waPollInterval);
  waPollInterval = setInterval(async () => {
    const connected = await checkConnection();
    if (connected) {
      clearInterval(waPollInterval);
      waPollInterval = null;
      document.getElementById('wa-qr-area').style.display = 'none';
      if (window.Snackbar) window.Snackbar.show('WhatsApp conectado ✓');
      updateWhatsAppStatus();
    }
  }, 3000);
}
