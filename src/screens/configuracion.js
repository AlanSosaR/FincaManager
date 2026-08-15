import { logout, getUser, saveWhatsAppConfig, loadWhatsAppConfig, restFetch, loadPuntoReferencia, savePuntoReferencia } from '../auth.js';
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

  const puntoRef = await loadPuntoReferencia(empresaId);
  const refSet = !!puntoRef;
  const refNombre = refSet && puntoRef.nombre ? puntoRef.nombre : '';

  return `
    <style>
    </style>
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
        <h3 class="m3-title-medium m3-font-bold" style="color:#2d3e2c;margin-bottom:4px;">Punto de referencia de la finca</h3>
        <p style="font-size:13px;color:#666;margin:0 0 12px;">Ubicación central de tu finca. Todos los mapas cargan centrados aquí.</p>

        <div id="ref-map" style="border-radius:12px;overflow:hidden;border:1px solid var(--m3-outline-variant,#e0e0e0);height:280px;margin-bottom:12px;position:relative;"></div>

        <input id="ref-nombre" type="text" placeholder="Nombre del lugar (ej. Finca El Paraíso)" value="${refNombre}" style="width:100%;padding:12px 14px;border-radius:12px;border:1px solid var(--m3-outline-variant,#e0e0e0);font-size:14px;font-family:'Work Sans',sans-serif;margin-bottom:10px;box-sizing:border-box;" autocomplete="off">

        <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px;">
          <button id="btn-ref-locate" class="btn-m3-tonal" style="padding:12px;border-radius:12px;background:var(--m3-surface-container-highest);color:#2d3e2c;border:none;font-weight:600;font-size:13px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
            <span class="material-icons" style="font-size:18px;">my_location</span> Mi ubicación
          </button>
          <button id="btn-ref-clear" class="btn-m3-tonal" style="padding:12px;border-radius:12px;background:var(--m3-surface-container-highest);color:#2d3e2c;border:none;font-weight:600;font-size:13px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;${refSet ? '' : 'opacity:0.5;pointer-events:none;'};">
            <span class="material-icons" style="font-size:18px;">delete_outline</span> Quitar
          </button>
        </div>

        <button id="btn-ref-save" class="btn-m3-primary" style="width:100%;padding:14px;border-radius:12px;background:#2d3e2c;color:white;border:none;font-weight:700;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
          <span class="material-icons">place</span> Guardar punto de referencia
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

  initPuntoReferencia();

  document.getElementById('btn-config-download')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-config-download');
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> <span id="config-dl-progress">Descargando... 0%</span>';
    const started = await fullDownload((pct) => {
      const label = document.getElementById('config-dl-progress');
      if (label) label.textContent = pct >= 100 ? 'Descarga completada' : `Descargando... ${pct}%`;
    });
    if (!started) {
      window.Snackbar?.show('Ya hay una sincronización en curso', { type: 'warning' });
    }
    btn.disabled = false;
    btn.innerHTML = started
      ? '<span class="material-icons">check_circle</span> Descarga completada'
      : '<span class="material-icons">cloud_download</span> Descargar datos';
  });

  document.getElementById('btn-config-clear-cache')?.addEventListener('click', () => {
    window.clearScreenCache?.();
    if (window.Snackbar) window.Snackbar.show('Caché limpiado');
  });
}

function initPuntoReferencia() {
  const mapEl = document.getElementById('ref-map');
  if (!mapEl) return;

  const btnSave = document.getElementById('btn-ref-save');
  const btnLocate = document.getElementById('btn-ref-locate');
  const btnClear = document.getElementById('btn-ref-clear');
  const inputNombre = document.getElementById('ref-nombre');

  const initial = window._empresaPuntoRef || null;
  const startLat = initial ? initial.lat : 14.5;
  const startLng = initial ? initial.lng : -88.5;

  let refPoint = initial ? { nombre: initial.nombre || '', lat: initial.lat, lng: initial.lng } : null;

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const map = L.map(mapEl, {
    center: [startLat, startLng],
    zoom: initial ? 15 : 8,
    zoomControl: false,
    attributionControl: false
  });
  L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);
  L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 19
  }).addTo(map);
  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_only_labels/{z}/{x}/{y}{r}.png', {
    subdomains: 'abcd',
    maxZoom: 19,
    opacity: 0.8
  }).addTo(map);
  L.control.zoom({ position: 'topright' }).addTo(map);

  // ── Buscador de lugares: coordenadas → plus code → Nominatim → geocode.xyz ──
  function extractPlusCode(query) {
    const match = query.match(/([23456789CFGHJMPQRVWXcfghjmpqrvwx]+\+[23456789CFGHJMPQRVWXcfghjmpqrvwx]+)/);
    return match ? { code: match[1].toUpperCase(), raw: match[1] } : null;
  }

  function geocodeLocality(locality) {
    const parts = locality.split(',').map(p => p.trim()).filter(Boolean);
    const candidates = [locality];
    for (let i = 1; i < parts.length; i++) {
      candidates.push(parts.slice(i).join(', '));
    }
    return new Promise((resolve) => {
      const tryGeocode = (idx) => {
        if (idx >= candidates.length) {
          geocodeXYZ(locality).then(fb => resolve(fb && fb.length ? fb[0].center : null));
          return;
        }
        const q = candidates[idx];
        L.Control.Geocoder.nominatim({
          serviceUrl: 'https://nominatim.openstreetmap.org/',
          params: { countrycodes: 'hn', limit: 1 }
        }).geocode(q, (results) => {
          if (results && results.length && results[0].center) {
            resolve(results[0].center);
          } else {
            tryGeocode(idx + 1);
          }
        });
      };
      tryGeocode(0);
    });
  }

  async function plusCodeResult(query) {
    if (typeof OpenLocationCode === 'undefined') return null;
    const pc = extractPlusCode(query);
    if (!pc) return null;
    try {
      let full;
      if (OpenLocationCode.isShort(pc.code)) {
        const locality = query.replace(pc.raw, '').replace(/^[\s,.\-]+|[\s,.\-]+$/g, '').trim();
        let ref = null;
        if (locality) ref = await geocodeLocality(locality);
        if (!ref) {
          const c = map.getCenter();
          ref = c;
        }
        full = OpenLocationCode.recoverNearest(pc.code, ref.lat, ref.lng);
      } else {
        full = pc.code;
      }
      if (!OpenLocationCode.isFull(full)) return null;
      const d = OpenLocationCode.decode(full);
      const center = L.latLng(d.latitudeCenter, d.longitudeCenter);
      const bbox = L.latLngBounds(
        L.latLng(d.latitudeLo, d.longitudeLo),
        L.latLng(d.latitudeHi, d.longitudeHi)
      );
      return { name: 'Plus Code: ' + pc.code, center: center, bbox: bbox };
    } catch (e) {
      return null;
    }
  }

  // Fallback geocoder (geocode.xyz) - encuentra lugares que OSM/Nominatim no tiene
  // NOTA: sin API key hace throttle (~1 req/seg). Cola global + detección de "Throttled!".
  const geoCache = new Map();
  let geoQueue = Promise.resolve();
  function geocodeXYZ(query) {
    if (geoCache.has(query)) return Promise.resolve(geoCache.get(query));
    const run = () => fetch('https://geocode.xyz/' + encodeURIComponent(query) + '?json=1')
      .then(r => r.json())
      .then(data => {
        if (data && data.error) return [];
        const throttled = JSON.stringify(data).includes('Throttled');
        if (throttled) return null;
        const lat = parseFloat(data?.latt);
        const lng = parseFloat(data?.longt);
        let results = [];
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          const std = data.standard || {};
          const name = [std.city, std.prov, std.countryname].filter(Boolean).join(', ') || query;
          const center = L.latLng(lat, lng);
          results = [{ name, center, bbox: center.toBounds(20000) }];
        }
        return results;
      })
      .catch(() => null);
    // No cacheamos null (throttle) para permitir reintento
    geoQueue = geoQueue.then(() => new Promise(r => setTimeout(r, 1200))).then(run);
    return geoQueue.then(res => {
      if (res) geoCache.set(query, res);
      return res || [];
    });
  }

  const nominatim = L.Control.Geocoder.nominatim({
    serviceUrl: 'https://nominatim.openstreetmap.org/',
    params: { countrycodes: 'hn', limit: 8 }
  });
  const searchGeocoder = L.Control.Geocoder.latLng({ next: nominatim });

  function searchFor(query, cb, ctx, allowFallback) {
    const q = query.trim().toLowerCase();
    const center = L.Control.Geocoder.parseLatLng(query);
    if (center) {
      cb.call(ctx, [{ name: query, center: center, bbox: center.toBounds(10000) }]);
      return;
    }
    if (extractPlusCode(query)) {
      plusCodeResult(query).then(res => {
        if (res) {
          cb.call(ctx, [res]);
        } else {
          runNominatim(query, cb, ctx, allowFallback);
        }
      });
      return;
    }
    runNominatim(query, cb, ctx, allowFallback);
  }

  function runNominatim(query, cb, ctx, allowFallback) {
    nominatim.geocode(query, (results) => {
      if (results && results.length) {
        cb.call(ctx, results);
      } else if (allowFallback) {
        geocodeXYZ(query).then(fb => cb.call(ctx, fb && fb.length ? fb : []));
      } else {
        cb.call(ctx, []);
      }
    }, ctx);
  }

  searchGeocoder.geocode = function(query, cb, ctx) { searchFor(query, cb, ctx, true); };
  searchGeocoder.suggest = function(query, cb, ctx) { searchFor(query, cb, ctx, false); };

  const geocoderCtrl = L.Control.geocoder({
    defaultMarkGeocode: false,
    collapsed: false,
    position: 'topleft',
    placeholder: 'Buscar lugar, aldea, finca, coordenadas o plus code...',
    errorMessage: 'No se encontró el lugar. Probá con un plus code de Google Maps (ej. 3RPC+5C)',
    suggestTimeout: 250,
    queryMinLength: 2,
    geocoder: searchGeocoder
  }).addTo(map);

  geocoderCtrl.on('markgeocode', (e) => {
    const gc = e.geocode;
    const center = gc.center;
    const bbox = gc.bbox;
    if (bbox) map.fitBounds(bbox, { padding: [40, 40], maxZoom: 16 });
    else map.setView(center, 16);
    setMarker(center.lat, center.lng, gc.name || '');
    if (btnClear) {
      btnClear.style.opacity = '1';
      btnClear.style.pointerEvents = 'auto';
    }
  });

  let marker = null;
  if (initial) {
    marker = L.marker([startLat, startLng], { draggable: true }).addTo(map);
    updateLabel(initial.nombre || '');
  }

  function setMarker(lat, lng, nombre) {
    if (marker) map.removeLayer(marker);
    const nombreFinal = (typeof nombre === 'string' && nombre.trim()) ? nombre : refPoint?.nombre || '';
    const icon = L.divIcon({
      className: 'ref-label-icon',
      html: '<span class="material-icons" style="font-size:38px;color:#e53935;text-shadow:0 0 3px #fff,0 0 6px #fff;">place</span><span class="ref-label-text">' + escapeHtml(nombreFinal) + '</span>',
      iconSize: null,
      iconAnchor: [19, 38]
    });
    marker = L.marker([lat, lng], { draggable: true, icon }).addTo(map);
    marker.on('dragend', () => {
      const p = marker.getLatLng();
      const nm = (inputNombre?.value || '').trim() || refPoint?.nombre || '';
      refPoint = { nombre: nm, lat: p.lat, lng: p.lng };
      updateLabel(nm);
    });
    refPoint = { nombre: nombreFinal, lat, lng };
    if (inputNombre && nombre && !inputNombre.value.trim()) {
      inputNombre.value = nombre;
    }
    if (btnClear) {
      btnClear.style.opacity = '1';
      btnClear.style.pointerEvents = 'auto';
    }
    updateLabel(nombreFinal);
  }

  function updateLabel(nombre) {
    if (!marker) return;
    marker.setIcon(L.divIcon({
      className: 'ref-label-icon',
      html: '<span class="material-icons" style="font-size:38px;color:#e53935;text-shadow:0 0 3px #fff,0 0 6px #fff;">place</span><span class="ref-label-text">' + escapeHtml(nombre || '') + '</span>',
      iconSize: null,
      iconAnchor: [19, 38]
    }));
  }

  // Click on map moves the marker
  map.on('click', (e) => setMarker(e.latlng.lat, e.latlng.lng));

  btnLocate?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      window.Snackbar?.show('Tu navegador no soporta geolocalización', 'error');
      return;
    }
    btnLocate.disabled = true;
    btnLocate.innerHTML = '<span class="material-icons animate-spin" style="font-size:18px;">sync</span> Ubicando...';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        btnLocate.disabled = false;
        btnLocate.innerHTML = '<span class="material-icons" style="font-size:18px;">my_location</span> Mi ubicación';
        map.setView([pos.coords.latitude, pos.coords.longitude], 16);
        setMarker(pos.coords.latitude, pos.coords.longitude, 'Mi ubicación');
        if (window.Snackbar) window.Snackbar.show('Ubicación obtenida. Podés ajustarla arrastrando el marcador.');
      },
      (err) => {
        btnLocate.disabled = false;
        btnLocate.innerHTML = '<span class="material-icons" style="font-size:18px;">my_location</span> Mi ubicación';
        window.Snackbar?.show('No se pudo obtener tu ubicación: ' + (err.message || err.code), 'error');
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  });

  btnClear?.addEventListener('click', () => {
    const empresaId = window._currentEmpresaId;
    if (!empresaId) return;
    const doClear = async () => {
      try {
        await restFetch(`/rest/v1/empresa_config?empresa_id=eq.${encodeURIComponent(empresaId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ punto_ref_nombre: null, punto_ref_lat: null, punto_ref_lng: null, updated_at: new Date().toISOString() }),
        });
        window._empresaPuntoRef = null;
        refPoint = null;
        if (marker) { map.removeLayer(marker); marker = null; }
        btnClear.style.opacity = '0.5';
        btnClear.style.pointerEvents = 'none';
        map.setView([14.5, -88.5], 8);
        window.Snackbar?.show('Punto de referencia eliminado');
        window.clearScreenCache?.('configuracion');
      } catch (e) {
        window.Snackbar?.show('Error al quitar el punto: ' + e.message, 'error');
      }
    };
    if (window.Snackbar?.confirm) {
      window.Snackbar.confirm('¿Quitar el punto de referencia de la finca?', doClear);
    } else {
      doClear();
    }
  });

  btnSave?.addEventListener('click', async () => {
    const empresaId = window._currentEmpresaId;
    if (!refPoint) {
      window.Snackbar?.show('Buscá el lugar en el mapa o usá "Mi ubicación" para marcar el punto', 'error');
      return;
    }
    if (!empresaId) {
      window.Snackbar?.show('Seleccioná una empresa primero', 'error');
      return;
    }
    btnSave.disabled = true;
    btnSave.innerHTML = '<span class="material-icons animate-spin">sync</span> Guardando...';
    try {
      const nombre = (inputNombre?.value || '').trim() || refPoint.nombre || '';
      await savePuntoReferencia(empresaId, { nombre, lat: refPoint.lat, lng: refPoint.lng });
      window.Snackbar?.show('Punto de referencia guardado');
      window.clearScreenCache?.('configuracion');
    } catch (e) {
      window.Snackbar?.show('Error al guardar: ' + e.message, 'error');
    }
    btnSave.disabled = false;
    btnSave.innerHTML = '<span class="material-icons">place</span> Guardar punto de referencia';
  });

  setTimeout(() => map.invalidateSize(), 250);
  setTimeout(() => map.invalidateSize(), 600);
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
