import { logout, getUser, saveWhatsAppConfig, loadWhatsAppConfig, restFetch } from '../auth.js';
import db from '../db.js';
import { fullDownload } from '../sync.js';
import { createInstance, deleteInstance, getQR, connectPairing, checkConnection, listGroups, sendWhatsApp } from '../wa.js';

let userRole = 'visor';
let currentUserId = null;

export async function renderConfiguracion() {
  const user = await getUser();
  currentUserId = user?.id;
  const empresaId = window._currentEmpresaId;
  const config = await loadWhatsAppConfig(empresaId);
  if (empresaId && currentUserId) {
    try {
      const ue = await restFetch(`/rest/v1/usuario_empresas?usuario_id=eq.${encodeURIComponent(currentUserId)}&empresa_id=eq.${encodeURIComponent(empresaId)}&select=rol`);
      if (ue && ue.length > 0) userRole = ue[0].rol;
    } catch {}
  }
  const isAdmin = userRole === 'propietario' || userRole === 'admin';

  let connectedByName = '';
  if (config?.whatsapp_connected_by && config.whatsapp_connected_by !== currentUserId) {
    try {
      const data = await restFetch(`/rest/v1/usuarios?id=eq.${encodeURIComponent(config.whatsapp_connected_by)}&select=nombre`).catch(() => null);
      if (data?.[0]?.nombre) connectedByName = data[0].nombre;
      else {
        const u = await db.usuarios?.get(config.whatsapp_connected_by);
        connectedByName = u?.nombre || '';
      }
    } catch {}
  }

  const isConnected = config?.whatsapp_status === 'connected';
  const connectedByMe = config?.whatsapp_connected_by === currentUserId;
  const storedGroupName = localStorage.getItem('whatsapp_group_name') || '';

  return `
    <div class="m3-card-filled" style="margin-bottom:80px;">
      <h2 class="m3-headline-small m3-font-bold" style="color:#2d3e2c;margin-bottom:24px;">Configuración</h2>

      <div style="height:1px;background:var(--m3-outline-variant,#e0e0e0);margin:24px 0;"></div>

      <div>
        <h3 class="m3-title-medium m3-font-bold" style="color:#2d3e2c;margin-bottom:16px;">WhatsApp</h3>

        <div id="wa-status" style="margin-bottom:12px;font-size:14px;color:#666;">
          <span id="wa-status-text">Verificando conexión...</span>
        </div>

        <div id="wa-shared-info" style="${isConnected && !connectedByMe ? 'display:block;' : 'display:none;'}margin-bottom:16px;padding:12px;background:#f0f8f0;border-radius:12px;font-size:13px;color:#2d3e2c;">
          <span class="material-icons" style="font-size:18px;vertical-align:middle;margin-right:4px;">group</span>
          WhatsApp conectado por <strong>${connectedByName || 'otro administrador'}</strong>
        </div>

        <div id="wa-disconnected-area" style="${isConnected ? 'display:none;' : 'display:block;'}">
          <div style="display:flex;gap:8px;margin-bottom:16px;">
            <button id="wa-tab-pairing" class="wa-tab-btn wa-tab-active" style="flex:1;padding:10px;border-radius:12px;border:2px solid #2d3e2c;background:#2d3e2c;color:white;font-weight:600;font-size:13px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;">
              <span class="material-icons" style="font-size:18px;">dialpad</span> Código
            </button>
            <button id="wa-tab-qr" class="wa-tab-btn" style="flex:1;padding:10px;border-radius:12px;border:2px solid var(--m3-outline-variant,#ddd);background:transparent;color:#2d3e2c;font-weight:600;font-size:13px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;">
              <span class="material-icons" style="font-size:18px;">qr_code_scanner</span> QR
            </button>
          </div>

          <div id="wa-pairing-area">
            <div style="margin-bottom:12px;">
              <label style="font-size:13px;color:#666;display:block;margin-bottom:4px;">Tu número de WhatsApp (con código de país)</label>
              <input type="tel" id="wa-phone-input" value="+505" placeholder="+505 8123 4567" style="width:100%;padding:12px;border:2px solid var(--m3-outline-variant,#ddd);border-radius:12px;font-size:16px;font-family:'Work Sans',sans-serif;box-sizing:border-box;">
            </div>
            <button id="btn-wa-connect" class="btn-m3-primary" style="width:100%;padding:14px;border-radius:12px;background:#2d3e2c;color:white;border:none;font-weight:700;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
              <span class="material-icons">link</span> Conectar WhatsApp
            </button>
          </div>

          <div id="wa-qr-area" style="display:none;text-align:center;">
            <p style="font-size:13px;color:#666;margin-bottom:12px;">Escaneá este código QR desde WhatsApp en otro dispositivo</p>
            <div id="wa-qr-container" style="background:white;padding:16px;border-radius:12px;display:inline-block;box-shadow:0 2px 8px rgba(0,0,0,.1);margin-bottom:12px;"></div>
            <button id="btn-wa-qr-connect" class="btn-m3-primary" style="width:100%;padding:14px;border-radius:12px;background:#2d3e2c;color:white;border:none;font-weight:700;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
              <span class="material-icons">qr_code_scanner</span> Generar QR
            </button>
          </div>
        </div>

        <div id="wa-pairing-code-area" style="display:none;text-align:center;margin-bottom:16px;">
          <p style="font-size:14px;color:#666;margin-bottom:12px;">Abrí WhatsApp en tu teléfono y andá a:</p>
          <div style="background:#f5f5f5;padding:12px;border-radius:12px;margin-bottom:12px;font-size:14px;line-height:1.6;color:#333;">
            <strong>Dispositivos vinculados</strong> → <strong>Vincular dispositivo</strong>
          </div>
          <p style="font-size:14px;color:#666;margin-bottom:8px;">Escribí este código:</p>
          <div id="wa-pairing-code-display" style="font-size:36px;font-weight:800;letter-spacing:6px;color:#2d3e2c;background:white;padding:20px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1);display:inline-block;font-family:monospace;margin-bottom:12px;"></div>
          <p style="font-size:13px;color:#666;">Esperando vinculación...</p>
          <button id="btn-wa-cancel-pairing" class="btn-m3-tonal" style="width:100%;padding:12px;border-radius:12px;background:var(--m3-surface-container-highest);color:#2d3e2c;border:none;font-weight:600;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px;">
            Cancelar
          </button>
        </div>

        <div id="wa-connected-area" style="${isConnected ? 'display:block;' : 'display:none;'}">
          <div id="wa-group-select-area" style="margin-bottom:12px;">
            ${config?.whatsapp_group_jid && storedGroupName ? `
            <div style="display:flex;align-items:center;gap:8px;padding:12px;background:#f0f8f0;border-radius:12px;">
              <span class="material-icons" style="color:#2d3e2c;font-size:20px;">check_circle</span>
              <div>
                <div style="font-size:13px;color:#666;">Grupo de notificaciones</div>
                <div style="font-size:15px;font-weight:600;color:#2d3e2c;">${storedGroupName}</div>
              </div>
            </div>
            ` : `
            <label style="font-size:13px;color:#666;display:block;margin-bottom:4px;">Grupo de WhatsApp para notificaciones</label>
            <button id="btn-wa-list-groups" class="btn-m3-tonal" style="width:100%;padding:12px;border-radius:12px;background:var(--m3-surface-container-highest);color:#2d3e2c;border:none;font-weight:600;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;margin-bottom:8px;">
              <span class="material-icons">group</span> Buscar grupos
            </button>
            <select id="wa-group-select" style="width:100%;padding:12px;border:2px solid var(--m3-outline-variant,#ddd);border-radius:12px;font-size:14px;font-family:'Work Sans',sans-serif;background:white;box-sizing:border-box;display:none;margin-bottom:8px;">
              <option value="">Seleccioná un grupo...</option>
            </select>
            <button id="btn-wa-accept-group" class="btn-m3-primary" style="width:100%;padding:12px;border-radius:12px;background:#2d3e2c;color:white;border:none;font-weight:700;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:none;align-items:center;justify-content:center;gap:8px;">
              <span class="material-icons">check</span> Aceptar
            </button>
            <div id="wa-selected-group" style="font-size:13px;color:#666;margin-top:4px;">⚠️ No hay grupo seleccionado</div>
            `}
          </div>
          ${(connectedByMe || userRole === 'propietario') ? `
          <button id="btn-wa-disconnect" class="btn-m3-tonal" style="width:100%;padding:12px;border-radius:12px;background:#fff0f0;color:#ff4103;border:1px solid #ff4103;font-weight:600;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
            <span class="material-icons">link_off</span> Desconectar WhatsApp
          </button>
          ` : ''}
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

async function ensureInstance() {
  try {
    await createInstance();
  } catch (e) {
    console.log('Error al crear instancia, intentando recrear...', e);
    try {
      await deleteInstance();
    } catch (deleteErr) {
      console.warn('Error al borrar instancia (ignorando):', deleteErr);
    }
    await new Promise(r => setTimeout(r, 1500));
    await createInstance();
  }
}

function switchWaTab(tab) {
  const pairingArea = document.getElementById('wa-pairing-area');
  const qrArea = document.getElementById('wa-qr-area');
  const tabPairing = document.getElementById('wa-tab-pairing');
  const tabQr = document.getElementById('wa-tab-qr');
  if (!pairingArea || !qrArea) return;

  if (tab === 'qr') {
    pairingArea.style.display = 'none';
    qrArea.style.display = 'block';
    tabPairing.style.background = 'transparent';
    tabPairing.style.color = '#2d3e2c';
    tabPairing.style.borderColor = 'var(--m3-outline-variant,#ddd)';
    tabQr.style.background = '#2d3e2c';
    tabQr.style.color = 'white';
    tabQr.style.borderColor = '#2d3e2c';
  } else {
    pairingArea.style.display = 'block';
    qrArea.style.display = 'none';
    tabQr.style.background = 'transparent';
    tabQr.style.color = '#2d3e2c';
    tabQr.style.borderColor = 'var(--m3-outline-variant,#ddd)';
    tabPairing.style.background = '#2d3e2c';
    tabPairing.style.color = 'white';
    tabPairing.style.borderColor = '#2d3e2c';
  }
}

async function handleConnectClick() {
  const btn = document.getElementById('btn-wa-connect');
  if (!btn) return;
  btn.disabled = true;

  const phoneInput = document.getElementById('wa-phone-input');
  let phone = phoneInput?.value?.trim() || '';
  phone = phone.replace(/[^0-9]/g, '');
  if (phone.length < 7) {
    if (window.Snackbar) window.Snackbar.show('Ingresá un número de teléfono válido (ej: +505 8123 4567)', 'error');
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">link</span> Conectar WhatsApp';
    return;
  }

  btn.innerHTML = '<span class="material-icons animate-spin">sync</span> Solicitando código...';

  try {
    const result = await connectPairing(phone);
    const pairingCode = result?.pairingCode || result?.code;

    if (pairingCode) {
      document.getElementById('wa-pairing-area').style.display = 'none';
      const codeArea = document.getElementById('wa-pairing-code-area');
      codeArea.style.display = 'block';
      document.getElementById('wa-pairing-code-display').textContent = pairingCode;
      startPairingPoll();
    } else {
      console.error('Pairing response inesperada:', JSON.stringify(result));
      if (window.Snackbar) window.Snackbar.show('Error al obtener código de emparejamiento. Revisá la consola (F12).', 'error');
    }
  } catch (e) {
    console.error('Error completo:', e);
    if (window.Snackbar) window.Snackbar.show('Error: ' + (e.message || e), 'error');
  }

  btn.disabled = false;
}

function startPairingPoll() {
  if (waPollInterval) clearInterval(waPollInterval);
  waPollInterval = setInterval(async () => {
    const connected = await checkConnection();
    if (connected) {
      clearInterval(waPollInterval);
      waPollInterval = null;
      document.getElementById('wa-pairing-code-area').style.display = 'none';
      await onConnected();
    }
  }, 3000);
}

function startQRPoll() {
  if (waPollInterval) clearInterval(waPollInterval);
  waPollInterval = setInterval(async () => {
    const connected = await checkConnection();
    if (connected) {
      clearInterval(waPollInterval);
      waPollInterval = null;
      document.getElementById('wa-qr-area').style.display = 'none';
      await onConnected();
    }
  }, 3000);
}

async function handleQRConnectClick() {
  const btn = document.getElementById('btn-wa-qr-connect');
  if (!btn) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons animate-spin">sync</span> Creando instancia...';

  try {
    await ensureInstance();

    btn.innerHTML = '<span class="material-icons animate-spin">sync</span> Obteniendo QR...';
    const qrData = await getQR();
    const qrContainer = document.getElementById('wa-qr-container');

    const qrBase64 = qrData?.base64 || qrData?.qrcode?.base64;
    const qrCode = qrData?.code || qrData?.qrcode?.code;
    if (qrBase64) {
      qrContainer.innerHTML = `<img src="${qrBase64}" alt="WhatsApp QR" style="width:256px;height:256px;image-rendering:pixelated;">`;
      btn.style.display = 'none';
      startQRPoll();
    } else if (qrCode) {
      qrContainer.innerHTML = `<div style="font-size:18px;font-weight:700;color:#2d3e2c;padding:24px;word-break:break-all;">${qrCode}</div>
        <p style="font-size:13px;color:#666;">Usá este código de emparejamiento en WhatsApp > Dispositivos vinculados</p>`;
      btn.style.display = 'none';
      startQRPoll();
    } else {
      console.error('QR data inesperada:', JSON.stringify(qrData));
      if (window.Snackbar) window.Snackbar.show('Error al obtener QR. Revisá la consola (F12).', 'error');
    }
  } catch (e) {
    console.error('Error completo:', e);
    if (window.Snackbar) window.Snackbar.show('Error: ' + (e.message || e), 'error');
  }

  btn.disabled = false;
}

async function onConnected() {
  isWaConnected = true;
  const empresaId = window._currentEmpresaId;
  if (empresaId && currentUserId) {
    await saveWhatsAppConfig(empresaId, {
      whatsapp_status: 'connected',
      whatsapp_connected_by: currentUserId,
      whatsapp_connected_at: new Date().toISOString(),
    });
  }
  localStorage.setItem('wa_connected', 'true');
  localStorage.setItem('wa_connected_by', currentUserId || '');
  await loadWhatsAppConfig(empresaId);
  sendWhatsApp('🔔 Mensaje de prueba desde Finca Manager — Conexión WhatsApp funcionando correctamente ✓');
  if (window.Snackbar) window.Snackbar.show('WhatsApp conectado ✓');
  updateUIAfterConnect();
}

async function handleDisconnectClick() {
  if (!window.Snackbar) return;
  try {
    await deleteInstance();
  } catch (e) {
    if (!e.message?.includes('not exist') && !e.message?.includes('404')) {
      console.warn('Error al borrar instancia:', e);
    }
  }
  isWaConnected = false;
  localStorage.removeItem('wa_connected');
  localStorage.removeItem('wa_connected_by');
  const empresaId = window._currentEmpresaId;
  if (empresaId) {
    await saveWhatsAppConfig(empresaId, {
      whatsapp_status: 'disconnected',
      whatsapp_connected_by: null,
      whatsapp_connected_at: null,
    });
    await loadWhatsAppConfig(empresaId);
  }
  if (window.Snackbar) window.Snackbar.show('WhatsApp desconectado ✓');
  updateUIAfterDisconnect();
}

function updateUIAfterConnect() {
  const config = window._empresaWhatsAppConfig;
  document.getElementById('wa-disconnected-area').style.display = 'none';
  document.getElementById('wa-pairing-code-area').style.display = 'none';
  document.getElementById('wa-shared-info').style.display = 'none';
  document.getElementById('wa-connected-area').style.display = 'block';
  const el = document.getElementById('wa-status-text');
  if (el) el.innerHTML = '<span style="color:#2d3e2c;font-weight:600;">✓ Conectado</span>';
  const groupName = localStorage.getItem('whatsapp_group_name');
  if (config?.whatsapp_group_jid && groupName) {
    const btn = document.getElementById('btn-wa-list-groups');
    const select = document.getElementById('wa-group-select');
    if (btn) btn.style.display = 'none';
    if (select) select.style.display = 'none';
  }
  const groupStatus = document.getElementById('wa-selected-group');
  if (groupStatus) {
    groupStatus.textContent = groupName ? `✓ Grupo: ${groupName}` : '⚠️ No hay grupo seleccionado';
  }
  const disconnectBtn = document.getElementById('btn-wa-disconnect');
  if (disconnectBtn) {
    const canDisconnect = config?.whatsapp_connected_by === currentUserId || userRole === 'propietario';
    disconnectBtn.style.display = canDisconnect ? 'flex' : 'none';
  }
}

function updateUIAfterDisconnect() {
  document.getElementById('wa-disconnected-area').style.display = 'block';
  document.getElementById('wa-pairing-code-area').style.display = 'none';
  document.getElementById('wa-qr-area').style.display = 'none';
  document.getElementById('wa-connected-area').style.display = 'none';
  document.getElementById('wa-shared-info').style.display = 'none';
  const el = document.getElementById('wa-status-text');
  if (el) el.innerHTML = '<span style="color:#ff4103;">✗ Desconectado</span>';
  switchWaTab('pairing');
}

async function handleListGroupsClick() {
  const btn = document.getElementById('btn-wa-list-groups');
  const select = document.getElementById('wa-group-select');
  if (!btn || !select) return;
  btn.disabled = true;
  btn.innerHTML = '<span class="material-icons animate-spin">sync</span> Buscando grupos...';
  try {
    const groups = await listGroups();
    select.innerHTML = '<option value="">Seleccioná un grupo...</option>';
    if (groups && groups.length > 0) {
      groups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g.remoteJid;
        opt.textContent = g.pushName || g.name || g.remoteJid;
        if (g.remoteJid === (window._empresaWhatsAppConfig?.whatsapp_group_jid || localStorage.getItem('whatsapp_group_jid'))) {
          opt.selected = true;
        }
        select.appendChild(opt);
      });
      select.style.display = 'block';
      document.getElementById('btn-wa-accept-group').style.display = 'flex';
      btn.style.display = 'none';
    } else {
      if (window.Snackbar) window.Snackbar.show('No se encontraron grupos. Asegurate de tener grupos en WhatsApp.', 'error');
    }
  } catch (e) {
    console.error('listGroups error:', e);
    if (window.Snackbar) window.Snackbar.show('Error al buscar grupos: ' + (e.message || e), 'error');
  }
  btn.disabled = false;
}

function handleGroupChange() {
  const select = document.getElementById('wa-group-select');
  const groupStatus = document.getElementById('wa-selected-group');
  if (!select || !groupStatus) return;
  const name = select.options[select.selectedIndex]?.textContent || '';
  groupStatus.textContent = name ? `✋ ${name}` : '⚠️ No hay grupo seleccionado';
}

async function handleAcceptGroupClick() {
  const select = document.getElementById('wa-group-select');
  if (!select || !select.value) {
    if (window.Snackbar) window.Snackbar.show('Seleccioná un grupo primero', 'error');
    return;
  }
  const jid = select.value;
  const groupName = select.options[select.selectedIndex]?.textContent || 'Grupo';
  localStorage.setItem('whatsapp_group_jid', jid);
  localStorage.setItem('whatsapp_group_name', groupName);
  const empresaId = window._currentEmpresaId;
  if (empresaId) {
    await saveWhatsAppConfig(empresaId, { whatsapp_group_jid: jid });
    await loadWhatsAppConfig(empresaId);
  }
  select.style.display = 'none';
  document.getElementById('btn-wa-accept-group').style.display = 'none';
  const groupStatus = document.getElementById('wa-selected-group');
  if (groupStatus) groupStatus.textContent = `✓ Grupo: ${groupName}`;
  if (window.Snackbar) window.Snackbar.show(`Grupo "${groupName}" guardado ✓`);
}

async function autoSelectGroup() {
  try {
    const groups = await listGroups();
    if (!groups || groups.length === 0) return;
    const savedJid = localStorage.getItem('whatsapp_group_jid') || window._empresaWhatsAppConfig?.whatsapp_group_jid;
    const match = savedJid ? groups.find(g => g.remoteJid === savedJid) : null;
    const target = match || groups[0];
    const groupName = target.pushName || target.name || target.remoteJid;
    localStorage.setItem('whatsapp_group_jid', target.remoteJid);
    localStorage.setItem('whatsapp_group_name', groupName);
    const empresaId = window._currentEmpresaId;
    if (empresaId) {
      await saveWhatsAppConfig(empresaId, { whatsapp_group_jid: target.remoteJid });
      await loadWhatsAppConfig(empresaId);
    }
    const groupStatus = document.getElementById('wa-selected-group');
    const btn = document.getElementById('btn-wa-list-groups');
    const select = document.getElementById('wa-group-select');
    if (btn) btn.style.display = 'none';
    if (select) select.style.display = 'none';
    if (groupStatus) groupStatus.textContent = `✓ Grupo: ${groupName}`;
  } catch (e) {
    console.warn('autoSelectGroup error:', e);
  }
}

export function initConfiguracion() {
  const empresaId = window._currentEmpresaId;

  (async () => {
    const user = await getUser();
    currentUserId = user?.id;
    if (empresaId && currentUserId) {
      const config = await loadWhatsAppConfig(empresaId);
      const configConnected = config?.whatsapp_status === 'connected';
      const serverConnected = await checkConnection().catch(() => false);
      isWaConnected = configConnected || serverConnected;
      if (config?.whatsapp_group_jid) {
        localStorage.setItem('whatsapp_group_jid', config.whatsapp_group_jid);
      }

      try {
        const ue = await restFetch(`/rest/v1/usuario_empresas?usuario_id=eq.${encodeURIComponent(currentUserId)}&empresa_id=eq.${encodeURIComponent(empresaId)}&select=rol`);
        if (ue && ue.length > 0) userRole = ue[0].rol;
      } catch {}
    }
    updateWhatsAppStatus();
  })();

  document.getElementById('wa-tab-pairing')?.addEventListener('click', () => switchWaTab('pairing'));
  document.getElementById('wa-tab-qr')?.addEventListener('click', () => switchWaTab('qr'));
  document.getElementById('btn-wa-connect')?.addEventListener('click', handleConnectClick);
  document.getElementById('btn-wa-qr-connect')?.addEventListener('click', handleQRConnectClick);
  document.getElementById('btn-wa-cancel-pairing')?.addEventListener('click', () => {
    if (waPollInterval) {
      clearInterval(waPollInterval);
      waPollInterval = null;
    }
    document.getElementById('wa-pairing-code-area').style.display = 'none';
    document.getElementById('wa-disconnected-area').style.display = 'block';
    switchWaTab('pairing');
  });
  document.getElementById('btn-wa-disconnect')?.addEventListener('click', handleDisconnectClick);
  document.getElementById('btn-wa-list-groups')?.addEventListener('click', handleListGroupsClick);
  document.getElementById('btn-wa-accept-group')?.addEventListener('click', handleAcceptGroupClick);
  document.getElementById('wa-group-select')?.addEventListener('change', handleGroupChange);

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
  const config = window._empresaWhatsAppConfig;
  let connected = false;
  try {
    connected = await checkConnection();
  } catch {}
  if (!connected) {
    connected = config?.whatsapp_status === 'connected' || localStorage.getItem('wa_connected') === 'true';
  }
  if (connected) {
    el.innerHTML = '<span style="color:#2d3e2c;font-weight:600;">✓ Conectado</span>';
    document.getElementById('wa-disconnected-area').style.display = 'none';
    document.getElementById('wa-pairing-code-area').style.display = 'none';
    if (config?.whatsapp_connected_by && config.whatsapp_connected_by !== currentUserId) {
      document.getElementById('wa-shared-info').style.display = 'block';
    }
    document.getElementById('wa-connected-area').style.display = 'block';
    const disconnectBtn = document.getElementById('btn-wa-disconnect');
    if (disconnectBtn) {
      const canDisconnect = config?.whatsapp_connected_by === currentUserId || userRole === 'propietario';
      disconnectBtn.style.display = canDisconnect ? 'flex' : 'none';
    }
  } else {
    el.innerHTML = '<span style="color:#ff4103;">✗ Desconectado</span>';
    document.getElementById('wa-disconnected-area').style.display = 'block';
    document.getElementById('wa-connected-area').style.display = 'none';
    document.getElementById('wa-shared-info').style.display = 'none';
    switchWaTab('pairing');
  }
}
