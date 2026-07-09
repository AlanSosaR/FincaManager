import { logout, getUser } from '../auth.js';
import db from '../db.js';
import { fullDownload } from '../sync.js';
import { createInstance, deleteInstance, getQR, checkConnection, listGroups, sendWhatsApp } from '../wa.js';

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
          <button id="btn-wa-list-groups" class="btn-m3-tonal" style="width:100%;padding:14px;border-radius:12px;background:var(--m3-surface-container-highest);color:#2d3e2c;border:none;font-weight:600;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
            <span class="material-icons">group</span> Buscar grupos
          </button>
        </div>
        <div id="wa-group-area" style="margin-top:12px;">
          <label style="font-size:13px;color:#666;display:block;margin-bottom:4px;">ID del Grupo de WhatsApp</label>
          <input type="text" id="wa-group-jid" value="${groupJid}" placeholder="Ej: 50399999999-123456@g.us" style="width:100%;padding:10px 12px;border-radius:8px;border:1px solid var(--m3-outline-variant,#e0e0e0);font-size:14px;font-family:'Work Sans',sans-serif;">
          <p style="font-size:12px;color:#999;margin-top:4px;">Click en "Buscar grupos" para seleccionar el grupo de WhatsApp</p>
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
      if (window.Snackbar) window.Snackbar.show('WhatsApp desconectado (instancia eliminada) ✓');
      document.getElementById('wa-qr-area').style.display = 'none';
      if (waPollInterval) {
        clearInterval(waPollInterval);
        waPollInterval = null;
      }
      await updateWhatsAppStatus();
    } catch (e) {
      if (e.message?.includes('not exist') || e.message?.includes('404')) {
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

  document.getElementById('btn-wa-list-groups')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-wa-list-groups');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-icons animate-spin">sync</span> Buscando...';

    try {
      const groups = await listGroups();
      if (!groups || groups.length === 0) {
        if (window.Snackbar) window.Snackbar.show('No se encontraron grupos. ¿WhatsApp está conectado?', 'error');
        return;
      }

      const overlay = document.getElementById('modal-container');
      const body = document.getElementById('modal-body');
      overlay.style.display = 'flex';
      body.innerHTML = `
        <div class="m3-card" style="padding:24px;max-width:400px;width:100%;">
          <h3 class="m3-title-medium m3-font-bold" style="color:#2d3e2c;margin-bottom:16px;">Seleccionar grupo</h3>
          <div style="display:flex;flex-direction:column;gap:8px;max-height:400px;overflow-y:auto;">
            ${groups.map(g => `
              <button class="wa-group-select-btn" data-jid="${g.remoteJid}" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;border-radius:12px;background:var(--m3-surface-container-low);color:#2d3e2c;border:none;font-weight:600;font-size:14px;cursor:pointer;text-align:left;font-family:'Work Sans',sans-serif;">
                <span class="material-icons" style="font-size:20px;">group</span>
                <span style="flex:1;">${g.pushName || g.remoteJid}</span>
              </button>
            `).join('')}
          </div>
          <button onclick="document.getElementById('modal-container').style.display='none'" style="display:block;width:100%;margin-top:16px;padding:12px;border-radius:12px;background:transparent;border:none;color:#888;font-size:13px;cursor:pointer;">Cancelar</button>
        </div>
      `;
      overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };

      body.querySelectorAll('.wa-group-select-btn').forEach(btn => {
        btn.addEventListener('click', () => {
          const jid = btn.dataset.jid;
          const name = btn.querySelector('span:last-child')?.textContent || jid;
          localStorage.setItem('whatsapp_group_jid', jid);
          document.getElementById('wa-group-jid').value = jid;
          overlay.style.display = 'none';
          if (window.Snackbar) window.Snackbar.show(`Grupo seleccionado: ${name} ✓`);
        });
      });
    } catch (e) {
      console.error(e);
      if (window.Snackbar) window.Snackbar.show('Error al buscar grupos: ' + (e.message || e), 'error');
    }

    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">group</span> Buscar grupos';
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
  const btn = document.getElementById('btn-wa-connect');
  const groupArea = document.getElementById('wa-group-area');
  const listBtn = document.getElementById('btn-wa-list-groups');
  try {
    const connected = await checkConnection();
    isWaConnected = connected;
    el.innerHTML = connected
      ? '<span style="color:#2d3e2c;font-weight:600;">✓ Conectado</span>'
      : '<span style="color:#ff4103;">✗ Desconectado</span>';
    if (btn) {
      if (connected) {
        btn.innerHTML = '<span class="material-icons">link_off</span> Desconectar WhatsApp';
        btn.style.background = '#ff4103';
      } else {
        btn.innerHTML = '<span class="material-icons">qr_code_scanner</span> Conectar WhatsApp';
        btn.style.background = '#2d3e2c';
      }
    }
    const hasGroup = !!localStorage.getItem('whatsapp_group_jid');
    if (groupArea) groupArea.style.display = (connected || hasGroup) ? '' : 'none';
    if (listBtn) listBtn.style.display = connected ? '' : 'none';
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
