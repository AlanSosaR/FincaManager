import { logout, getUser } from '../auth.js';
import db from '../db.js';
import { fullDownload } from '../sync.js';
import { createInstance, deleteInstance, getQR, checkConnection, listGroups, sendWhatsApp } from '../wa.js';

export async function renderConfiguracion() {
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
        <button id="btn-wa-connect" class="btn-m3-primary" style="width:100%;padding:14px;border-radius:12px;background:#2d3e2c;color:white;border:none;font-weight:700;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
          <span class="material-icons">qr_code_scanner</span> Conectar WhatsApp
        </button>
        <button id="btn-wa-test" style="display:none;width:100%;margin-top:8px;padding:14px;border-radius:12px;background:var(--m3-surface-container-highest);color:#2d3e2c;border:none;font-weight:600;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;align-items:center;justify-content:center;gap:8px;">
          <span class="material-icons">send</span> Enviar mensaje de prueba
        </button>
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
let isWaConnected = false;

async function connectOrRecreate() {
  try {
    await createInstance();
  } catch (e) {
    console.log('Error al crear instancia, intentando recrear...', e);
    try {
      await deleteInstance();
    } catch (deleteErr) {
      console.warn('Error al borrar instancia (ignorando):', deleteErr);
    }
    // Esperar 1.5 segundos para que Evolution API procese la eliminación
    await new Promise(r => setTimeout(r, 1500));
    await createInstance();
  }
  return getQR();
}

async function handleWaButtonClick() {
  const btn = document.getElementById('btn-wa-connect');
  if (!btn) return;
  btn.disabled = true;

  if (isWaConnected) {
    btn.innerHTML = '<span class="material-icons animate-spin">sync</span> Desconectando...';
    try {
      await deleteInstance();
      localStorage.removeItem('wa_connected');
      localStorage.removeItem('wa_test_sent');
      if (window.Snackbar) window.Snackbar.show('WhatsApp desconectado ✓');
      document.getElementById('wa-qr-area').style.display = 'none';
      if (waPollInterval) {
        clearInterval(waPollInterval);
        waPollInterval = null;
      }
      await updateWhatsAppStatus();
    } catch (e) {
      if (e.message?.includes('not exist') || e.message?.includes('404')) {
        localStorage.removeItem('wa_connected');
        if (window.Snackbar) window.Snackbar.show('Ya está desconectado ✓');
        document.getElementById('wa-qr-area').style.display = 'none';
        if (waPollInterval) {
          clearInterval(waPollInterval);
          waPollInterval = null;
        }
        await updateWhatsAppStatus();
      } else {
        if (window.Snackbar) window.Snackbar.show('Error al desconectar: ' + (e.message || e), 'error');
      }
    }
  } else {
    btn.innerHTML = '<span class="material-icons animate-spin">sync</span> Conectando...';
    try {
      const qrData = await connectOrRecreate();
      console.log('QR response:', qrData);
      const qrArea = document.getElementById('wa-qr-area');
      const qrContainer = document.getElementById('wa-qr-container');

      const qrBase64 = qrData?.base64 || qrData?.qrcode?.base64;
      const qrCode = qrData?.code || qrData?.qrcode?.code;
      if (qrBase64) {
        qrArea.style.display = 'block';
        qrContainer.innerHTML = `<img src="${qrBase64}" alt="WhatsApp QR" style="width:256px;height:256px;image-rendering:pixelated;">`;
        startWaPolling();
      } else if (qrCode) {
        qrArea.style.display = 'block';
        qrContainer.innerHTML = `<div style="font-size:24px;font-weight:700;color:#2d3e2c;padding:48px;word-break:break-all;">${qrCode}</div>
          <p style="font-size:13px;color:#666;">Usa este código de emparejamiento en WhatsApp > Dispositivos vinculados</p>`;
        startWaPolling();
      } else {
        console.error('QR data inesperada:', JSON.stringify(qrData));
        if (window.Snackbar) window.Snackbar.show('Error al obtener QR. Revisa la consola (F12).', 'error');
      }
    } catch (e) {
      console.error('Error completo:', e);
      if (window.Snackbar) window.Snackbar.show('Error: ' + (e.message || e), 'error');
    }
  }

  btn.disabled = false;
  await updateWhatsAppStatus();
}

export function initConfiguracion() {
  updateWhatsAppStatus();

  document.getElementById('btn-wa-connect')?.addEventListener('click', handleWaButtonClick);

  document.getElementById('btn-wa-test')?.addEventListener('click', async () => {
    const testBtn = document.getElementById('btn-wa-test');
    testBtn.disabled = true;
    testBtn.innerHTML = '<span class="material-icons animate-spin">sync</span> Enviando...';
    await sendWhatsApp('🔔 Mensaje de prueba desde Finca Manager — Conexión WhatsApp funcionando correctamente ✓');
    testBtn.disabled = false;
    testBtn.innerHTML = '<span class="material-icons">send</span> Enviar mensaje de prueba';
    if (window.Snackbar) window.Snackbar.show('Mensaje de prueba enviado ✓');
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
  const btn = document.getElementById('btn-wa-connect');
  let connected = false;
  try {
    connected = await checkConnection();
  } catch {}
  if (!connected && localStorage.getItem('wa_connected') === 'true') {
    connected = true;
  }
  isWaConnected = connected;
  if (connected) {
    localStorage.setItem('wa_connected', 'true');
    el.innerHTML = '<span style="color:#2d3e2c;font-weight:600;">✓ Conectado</span>';
    if (btn) {
      btn.innerHTML = '<span class="material-icons">link_off</span> Desconectar WhatsApp';
      btn.style.background = '#ff4103';
    }
    const testBtn = document.getElementById('btn-wa-test');
    if (testBtn) testBtn.style.display = 'flex';
  } else {
    el.innerHTML = '<span style="color:#ff4103;">✗ Desconectado</span>';
    if (btn) {
      btn.innerHTML = '<span class="material-icons">qr_code_scanner</span> Conectar WhatsApp';
      btn.style.background = '#2d3e2c';
    }
    const testBtn = document.getElementById('btn-wa-test');
    if (testBtn) testBtn.style.display = 'none';
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
      localStorage.setItem('wa_connected', 'true');
      autoSelectGroup();
      if (window.Snackbar) window.Snackbar.show('WhatsApp conectado ✓');
      updateWhatsAppStatus();
    }
  }, 3000);
}

async function autoSelectGroup() {
  try {
    const groups = await listGroups();
    if (!groups || groups.length === 0) return;
    const savedJid = localStorage.getItem('whatsapp_group_jid');
    const match = savedJid ? groups.find(g => g.remoteJid === savedJid) : null;
    const target = match || groups[0];
    localStorage.setItem('whatsapp_group_jid', target.remoteJid);
    console.log('Grupo auto-seleccionado:', target.pushName || target.remoteJid);
  } catch (e) {
    console.warn('autoSelectGroup error:', e);
  }
}
