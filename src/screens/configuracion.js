import { logout, getUser, getSessionUserId, saveWhatsAppConfig, loadWhatsAppConfig, restFetch, loadPuntoReferencia, savePuntoReferencia } from '../auth.js';
import { supabase } from '../supabase.js';
import db from '../db.js';
import { fullDownload } from '../sync.js';
import { registerPushToken, getPushStatus, checkPushAlerts } from '../push/push.js';
import { createInstance, deleteInstance, getQR, connectPairing, checkConnection, listGroups, sendWhatsApp, checkMotoresAceite, checkPartosProximos } from '../wa.js';
import { initM3FullScreenSearch, escapeSearchHtml } from '../components/m3_search.js';

let userRole = 'visor';
let currentUserId = null;

function parseCoordsConfig(json) {
  try {
    if (!json) return [];
    let p = json;
    while (typeof p === 'string') {
      try {
        const n = JSON.parse(p);
        if (n == null) break;
        p = n;
      } catch { break; }
    }
    if (Array.isArray(p)) return p;
    if (p && typeof p === 'object' && Array.isArray(p.coordinates)) return p.coordinates;
    return [];
  } catch { return []; }
}

async function resolveEmpresaNombre(empresaId, fallback = '') {
  const targetId = empresaId || window._currentEmpresaId || localStorage.getItem('current_empresa_id');
  let nombre = '';
  if (targetId) {
    try {
      const emp = await db.empresas?.get(targetId);
      if (emp?.nombre) nombre = emp.nombre;
    } catch {}
    if (!nombre) {
      try {
        const empData = await restFetch(`/rest/v1/empresas?id=eq.${encodeURIComponent(targetId)}&select=nombre`);
        if (empData?.[0]?.nombre) nombre = empData[0].nombre;
      } catch {}
    }
  }
  if (!nombre) {
    nombre = document.getElementById('sidebar-empresa-name')?.textContent?.trim() || fallback || '';
  }
  if (nombre) window._empresaNombre = nombre;
  return nombre;
}

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

  const isConnectedLocally = localStorage.getItem('wa_connected') === 'true' || !!localStorage.getItem('wa_instance_name');
  const isConnected = config?.whatsapp_status === 'connected' || isConnectedLocally;
  const connectedByMe = config?.whatsapp_connected_by === currentUserId || isConnectedLocally;
  const storedGroupName = localStorage.getItem('whatsapp_group_name') || '';

  const puntoRef = await loadPuntoReferencia(empresaId);
  window._empresaPuntoRef = puntoRef;
  const refSet = !!puntoRef;
  const refNombre = refSet && puntoRef.nombre ? puntoRef.nombre : '';
  const empresaNombre = await resolveEmpresaNombre(empresaId, refNombre);
  const rawSavedWaPhone = localStorage.getItem('wa_pairing_phone') || '+504';
  const savedWaPhone = rawSavedWaPhone.replace(/[^0-9]/g, '') === '4473522349335' ? '+447352349335' : rawSavedWaPhone;
  if (savedWaPhone !== rawSavedWaPhone) localStorage.setItem('wa_pairing_phone', savedWaPhone);

  return `
    <style>
      .wa-sheet-scrim {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.42);
        backdrop-filter: blur(2px);
        z-index: 10040;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.25s cubic-bezier(0.2, 0, 0, 1);
      }
      .wa-sheet-scrim.open {
        opacity: 1;
        pointer-events: auto;
      }
      .wa-m3-sheet {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        margin: 0 auto;
        width: 100%;
        max-width: 520px;
        z-index: 10041;
        background: #ffffff;
        border-top-left-radius: 28px;
        border-top-right-radius: 28px;
        box-shadow: 0 -12px 44px rgba(0, 0, 0, 0.26);
        transform: translateY(105%);
        transition: transform 0.34s cubic-bezier(0.16, 1, 0.3, 1), height 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), max-height 0.25s cubic-bezier(0.2, 0.8, 0.2, 1);
        padding: 4px 20px calc(24px + env(safe-area-inset-bottom, 0px));
        box-sizing: border-box;
        max-height: 90dvh;
        display: flex;
        flex-direction: column;
        overflow-y: auto;
        font-family: 'Work Sans', sans-serif;
      }
      .wa-m3-sheet.open {
        transform: translateY(0);
      }
      .wa-m3-sheet.sheet-expanded {
        height: 92dvh;
        max-height: 92dvh;
      }
      .wa-sheet-handle-wrap {
        padding: 8px 0 12px;
        cursor: pointer;
        display: flex;
        justify-content: center;
        align-items: center;
        flex-shrink: 0;
        touch-action: none;
      }
      .wa-sheet-handle {
        width: 44px;
        height: 5px;
        border-radius: 999px;
        background: rgba(30, 62, 43, 0.28);
        transition: width 0.2s, background 0.2s;
      }
      .wa-m3-sheet.sheet-expanded .wa-sheet-handle {
        width: 56px;
        background: rgba(30, 62, 43, 0.48);
      }
      .m3-switch {
        position: relative;
        width: 52px;
        height: 32px;
        border-radius: 999px;
        border: 2px solid #74796e;
        background: #e2e3dd;
        padding: 0;
        cursor: pointer;
        flex-shrink: 0;
        display: inline-flex;
        align-items: center;
        transition: background 0.2s cubic-bezier(0.2, 0, 0, 1), border-color 0.2s cubic-bezier(0.2, 0, 0, 1);
      }
      .m3-switch-thumb {
        position: absolute;
        left: 6px;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: #74796e;
        display: flex;
        align-items: center;
        justify-content: center;
        transition: left 0.2s cubic-bezier(0.2, 0, 0, 1), width 0.2s, height 0.2s, background 0.2s;
      }
      .m3-switch-icon {
        font-size: 15px !important;
        font-weight: 800;
        color: #2d3e2c;
        opacity: 0;
        transform: scale(0.5);
        transition: opacity 0.15s, transform 0.15s;
      }
      .m3-switch.is-checked {
        background: #2d3e2c;
        border-color: #2d3e2c;
      }
      .m3-switch.is-checked .m3-switch-thumb {
        left: 24px;
        width: 24px;
        height: 24px;
        background: #ffffff;
        box-shadow: 0 1px 3px rgba(0,0,0,0.28);
      }
      .m3-switch.is-checked .m3-switch-icon {
        opacity: 1;
        transform: scale(1);
      }
      .m3-switch:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      .m3-field-dark input {
        color: #ffffff !important;
        border-color: rgba(255,255,255,0.34) !important;
        background: transparent !important;
        min-height: 50px !important;
        padding: 13px 16px !important;
      }
      .m3-field-dark input:focus {
        border: 2px solid #c2e7ff !important;
        padding: 12px 15px !important;
      }
      .m3-field-dark label {
        background: #141614 !important;
        color: #c4c7c5 !important;
        top: 15px !important;
      }
      .m3-field-dark input:focus ~ label,
      .m3-field-dark input:not(:placeholder-shown) ~ label,
      .m3-field-dark.has-value label {
        transform: translateY(-24px) scale(0.75) !important;
        color: #c2e7ff !important;
      }
      #ref-map-container {
        flex: 1 1 0% !important;
        height: auto !important;
        min-height: 0 !important;
      }
      #ref-map {
        width: 100% !important;
        height: 100% !important;
        min-height: 100% !important;
      }
      #wa-connected-body:has(#wa-group-ac-wrap.is-open) {
        padding-bottom: 240px;
      }
    </style>
    <div class="m3-card-filled" style="margin-bottom:80px;">
      <div>
        <h3 class="m3-title-medium m3-font-bold" style="color:#2d3e2c;margin-bottom:16px;">Información del sistema</h3>
        <div style="display:grid;gap:12px;">
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--m3-outline-variant,#eee);">
            <span style="color:#666;">Aplicación</span>
            <span style="font-weight:600;color:#2d3e2c;">Finca Manager</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--m3-outline-variant,#eee);">
            <span style="color:#666;">Finca</span>
            <span id="config-finca-nombre" style="font-weight:700;color:#2d3e2c;text-align:right;">${escapeSearchHtml(empresaNombre || 'Sin finca asignada')}</span>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;padding:8px 0;border-bottom:1px solid var(--m3-outline-variant,#eee);">
            <span style="color:#666;">Estado</span>
            <span style="font-weight:600;color:${navigator.onLine ? '#2d3e2c' : '#ff4103'};">${navigator.onLine ? 'En línea' : 'Sin conexión'}</span>
          </div>
          <button id="btn-open-share-sheet" type="button" style="width:100%;border:none;background:transparent;padding:8px 0;cursor:pointer;font-family:inherit;font-size:inherit;display:flex;justify-content:flex-start;align-items:center;gap:6px;text-align:left;">
            <span style="font-weight:600;color:#2d3e2c;display:inline-flex;align-items:center;gap:4px;">
              <span class="material-icons" style="font-size:18px;">share</span>
            </span>
            <span style="color:#666;">Compartir aplicación</span>
          </button>
        </div>
      </div>

      <!-- Bottom Sheet Compartir Aplicación -->
      <div id="share-app-sheet-scrim" class="wa-sheet-scrim"></div>
      <div id="share-app-sheet" class="wa-m3-sheet" aria-hidden="true">
        <div class="wa-sheet-handle-wrap" title="Toca para expandir">
          <div class="wa-sheet-handle"></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:18px;">
          <h3 style="margin:0;font-size:18px;font-weight:800;color:#1e3e2b;">Compartir aplicación</h3>
          <button id="btn-share-sheet-close" type="button" style="width:36px;height:36px;border-radius:50%;border:none;background:#f1f5f0;color:#2d3e2c;display:flex;align-items:center;justify-content:center;cursor:pointer;" aria-label="Cerrar">
            <span class="material-icons" style="font-size:20px;">close</span>
          </button>
        </div>
        <div style="display:grid;gap:10px;">
          <button id="btn-share-whatsapp" type="button" class="btn-m3-primary" style="width:100%;padding:13px;border-radius:12px;background:#25d366;color:white;border:none;font-weight:700;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;box-shadow:0 3px 12px rgba(37,211,102,0.25);">
            <span class="material-icons">share</span> Compartir por WhatsApp
          </button>
          <button id="btn-copy-link" type="button" class="btn-m3-tonal" style="width:100%;padding:13px;border-radius:12px;background:var(--m3-surface-container-highest);color:#2d3e2c;border:1px solid rgba(45,62,44,0.15);font-weight:600;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
            <span class="material-icons">content_copy</span> Copiar enlace de la app
          </button>
        </div>
      </div>

      <div style="height:1px;background:var(--m3-outline-variant,#e0e0e0);margin:24px 0;"></div>

      <div>
        <div id="wa-disconnected-area" style="display:block;">
          <button id="btn-wa-open-sheet" type="button" style="width:100%;padding:14px 16px;border-radius:16px;background:#ffffff;color:#2d3e2c;border:1px solid #e6ece4;font-weight:700;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:flex-start;gap:10px;text-align:left;transition:all 0.2s;">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true" style="flex-shrink:0;">
              <path d="M12.04 2C6.51 2 2.02 6.49 2.02 12.02c0 1.77.46 3.5 1.34 5.02L2 22l5.09-1.33a9.98 9.98 0 0 0 4.95 1.31h.01c5.52 0 10.01-4.49 10.01-10.02C22.06 6.49 17.57 2 12.04 2Zm5.82 14.21c-.25.7-1.44 1.33-1.99 1.41-.51.08-1.15.11-1.86-.12-.43-.14-.98-.32-1.69-.63-2.97-1.28-4.91-4.27-5.06-4.47-.15-.2-1.21-1.61-1.21-3.07 0-1.46.77-2.18 1.04-2.48.27-.3.59-.37.79-.37.2 0 .4 0 .57.01.18.01.43-.07.67.51.25.6.85 2.07.92 2.22.08.15.13.32.03.52-.1.2-.15.32-.3.5-.15.17-.31.39-.45.52-.15.15-.3.31-.13.61.17.3.77 1.27 1.65 2.05 1.14 1.01 2.09 1.33 2.39 1.48.3.15.47.12.65-.08.17-.2.75-.88.95-1.18.2-.3.4-.25.67-.15.27.1 1.73.82 2.03.97.3.15.5.22.57.35.08.12.08.72-.17 1.42Z" fill="#25D366"/>
            </svg>
            <div style="min-width:0;">
              <div id="wa-status-text" style="font-weight:700;font-size:14px;color:#2d3e2c;">${isConnected ? 'WhatsApp conectado' : 'Conectar a WhatsApp'}</div>
              <div id="wa-card-sub" style="display:${isConnected ? 'block' : 'none'};font-size:12px;font-weight:500;color:#5a6b58;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${storedGroupName ? `Grupo: ${escapeSearchHtml(storedGroupName)}` : 'Buscar grupos'}</div>
            </div>
          </button>
        </div>
      </div>

      <!-- Bottom Sheet WhatsApp -->
      <div id="wa-connect-sheet-scrim" class="wa-sheet-scrim"></div>
      <div id="wa-connect-sheet" class="wa-m3-sheet" aria-hidden="true">
        <div class="wa-sheet-handle-wrap" title="Toca para expandir">
          <div class="wa-sheet-handle"></div>
        </div>
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:16px;">
          <h3 id="wa-sheet-title" style="margin:0;font-size:18px;font-weight:800;color:#1e3e2b;">${isConnected ? 'WhatsApp conectado' : 'Conectar WhatsApp'}</h3>
          <button id="btn-wa-sheet-close" type="button" style="width:36px;height:36px;border-radius:50%;border:none;background:#f1f5f0;color:#2d3e2c;display:flex;align-items:center;justify-content:center;cursor:pointer;" aria-label="Cerrar">
            <span class="material-icons" style="font-size:20px;">close</span>
          </button>
        </div>

        <div id="wa-connect-flow" style="${isConnected ? 'display:none;' : 'display:block;'}">
          <div style="display:flex;gap:8px;margin-bottom:20px;">
            <button id="wa-tab-pairing" class="wa-tab-btn wa-tab-active" type="button" style="flex:1;padding:10px;border-radius:12px;border:2px solid #2d3e2c;background:#2d3e2c;color:white;font-weight:600;font-size:13px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;">
              <span class="material-icons" style="font-size:18px;">dialpad</span> Código
            </button>
            <button id="wa-tab-qr" class="wa-tab-btn" type="button" style="flex:1;padding:10px;border-radius:12px;border:2px solid var(--m3-outline-variant,#ddd);background:transparent;color:#2d3e2c;font-weight:600;font-size:13px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:6px;transition:all .15s;">
              <span class="material-icons" style="font-size:18px;">qr_code_scanner</span> QR
            </button>
          </div>

          <div id="wa-pairing-area">
            <div class="m3-field ${savedWaPhone ? 'has-value' : ''}" style="margin-bottom:16px;">
              <input type="tel" id="wa-phone-input" value="${escapeSearchHtml(savedWaPhone)}" placeholder=" " autocomplete="tel">
              <label for="wa-phone-input">Tu número de WhatsApp (con código de país)</label>
            </div>
            <button id="btn-wa-connect" type="button" class="btn-m3-primary" style="width:100%;padding:14px;border-radius:12px;background:#2d3e2c;color:white;border:none;font-weight:700;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
              <span class="material-icons">link</span> Conectar WhatsApp
            </button>
          </div>

          <div id="wa-qr-area" style="display:none;text-align:center;">
            <p style="font-size:13px;color:#666;margin-bottom:12px;">Escaneá este código QR desde WhatsApp en otro dispositivo</p>
            <div id="wa-qr-container" style="background:white;padding:16px;border-radius:12px;display:inline-block;box-shadow:0 2px 8px rgba(0,0,0,.1);margin-bottom:12px;"></div>
            <button id="btn-wa-qr-connect" type="button" class="btn-m3-primary" style="width:100%;padding:14px;border-radius:12px;background:#2d3e2c;color:white;border:none;font-weight:700;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
              <span class="material-icons">qr_code_scanner</span> Generar QR
            </button>
          </div>

          <div id="wa-pairing-code-area" style="display:none;text-align:center;margin-top:8px;">
            <div style="text-align:left;background:#f4f7f3;border:1px solid #d5e0d4;border-radius:14px;padding:12px 14px;margin-bottom:12px;font-size:12.5px;line-height:1.5;color:#2d3e2c;">
              <div>En WhatsApp toca <strong>⋮</strong> (arriba a la derecha) → <strong>Dispositivos vinculados</strong> → <strong>Vincular un dispositivo</strong> → <strong>Vincular con el número de teléfono</strong> y pega el código:</div>
              <div style="margin-top:6px;font-size:12px;color:#556b53;">El número ingresado debe coincidir exactamente con la cuenta de WhatsApp de ese teléfono.</div>
            </div>
            <p style="font-size:13.5px;color:#666;margin-bottom:4px;">Código ya copiado (toca para copiar de nuevo):</p>
            <div id="wa-pairing-phone-target" style="font-size:12.5px;font-weight:700;color:#2d3e2c;margin-bottom:8px;"></div>
            <div id="wa-pairing-code-display" title="Toca para copiar" style="font-size:30px;font-weight:800;letter-spacing:3px;color:#2d3e2c;background:white;padding:18px 20px;border-radius:12px;box-shadow:0 2px 8px rgba(0,0,0,.1);display:inline-block;font-family:monospace;margin-bottom:12px;cursor:pointer;user-select:all;"></div>
            <p style="font-size:13px;color:#666;">Esperando vinculación...</p>
            <button id="btn-wa-open-app" type="button" class="btn-m3-primary" style="width:100%;padding:13px;border-radius:12px;background:#25d366;color:white;border:none;font-weight:700;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px;box-shadow:0 3px 12px rgba(37,211,102,0.25);">
              <span class="material-icons" style="font-size:19px;">open_in_new</span> Copiar código y abrir WhatsApp
            </button>
            <button id="btn-wa-cancel-pairing" type="button" class="btn-m3-tonal" style="width:100%;padding:12px;border-radius:12px;background:var(--m3-surface-container-highest);color:#2d3e2c;border:none;font-weight:600;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;margin-top:8px;">
              Cancelar
            </button>
          </div>
        </div>

        <div id="wa-shared-info" style="${isConnected && !connectedByMe ? 'display:block;' : 'display:none;'}margin-bottom:14px;padding:12px;background:#f0f8f0;border-radius:12px;font-size:13px;color:#2d3e2c;">
          <span class="material-icons" style="font-size:18px;vertical-align:middle;margin-right:4px;">group</span>
          WhatsApp conectado por <strong>${connectedByName || 'otro administrador'}</strong>
        </div>

        <div id="wa-connected-area" style="${isConnected ? 'display:flex;' : 'display:none;'}flex:1 1 auto;flex-direction:column;min-height:0;">
          <div id="wa-connected-body" style="flex:1 1 auto;min-height:0;overflow-y:auto;-webkit-overflow-scrolling:touch;padding-top:10px;">
            <div id="wa-group-select-area" style="margin-bottom:14px;">
              <label style="font-size:13px;color:#5a6b58;display:block;margin-bottom:14px;">Grupo de WhatsApp para notificaciones</label>
              <div id="wa-selected-group" style="display:${storedGroupName ? 'none' : 'flex'};align-items:center;gap:8px;padding:12px;background:#f0f8f0;border-radius:12px;font-size:13.5px;font-weight:600;color:#2d3e2c;margin-bottom:16px;">
                ⚠️ No hay grupo seleccionado
              </div>
              <div class="m3-ac-wrap" id="wa-group-ac-wrap" style="margin-top:16px;margin-bottom:12px;">
                <div class="m3-field ${storedGroupName ? 'has-value' : ''}">
                  <input type="text" id="wa-group-ac-input" class="m3-ac-input" placeholder=" " value="${storedGroupName ? escapeSearchHtml(storedGroupName) : ''}" ${storedGroupName ? 'readonly' : ''} autocomplete="off" role="combobox" aria-expanded="false" aria-autocomplete="list">
                  <label for="wa-group-ac-input">Grupo de WhatsApp</label>
                  <button type="button" id="wa-group-ac-toggle" class="m3-ac-toggle" aria-label="Mostrar grupos" style="display:${storedGroupName ? 'none' : 'inline-flex'};">
                    <span class="material-icons">arrow_drop_down</span>
                  </button>
                </div>
                <div class="m3-ac-menu" id="wa-group-ac-menu" role="listbox"></div>
              </div>
            </div>
          </div>
          <div id="wa-connected-footer" style="margin-top:auto;flex-shrink:0;background:#ffffff;padding:12px 0 4px;border-top:1px solid #eef2ee;display:grid;grid-template-columns:${((connectedByMe || userRole === 'propietario') && !storedGroupName) ? '1fr 1.6fr' : '1fr'};gap:10px;align-items:center;">
            <button id="btn-wa-disconnect" type="button" style="display:${(connectedByMe || userRole === 'propietario') ? 'inline-flex' : 'none'};height:44px;border-radius:999px;border:1px solid #fecaca;background:#fef2f2;color:#b91c1c;font-size:14px;font-weight:700;cursor:pointer;font-family:'Work Sans',sans-serif;align-items:center;justify-content:center;gap:6px;">
              Desconectar
            </button>
            <button id="btn-wa-accept-group" type="button" style="display:${storedGroupName ? 'none' : 'inline-flex'};height:44px;border-radius:999px;border:none;background:#2d3e2c;color:#ffffff;font-size:14px;font-weight:700;cursor:pointer;font-family:'Work Sans',sans-serif;align-items:center;justify-content:center;gap:6px;">
              <span class="material-icons" style="font-size:18px;">group</span> Buscar grupos
            </button>
          </div>
        </div>
      </div>

      <div style="height:1px;background:var(--m3-outline-variant,#e0e0e0);margin:24px 0;"></div>

      <div>
        <h3 class="m3-title-medium m3-font-bold" style="color:#2d3e2c;margin-bottom:4px;">Punto de referencia de la finca</h3>
        <p style="font-size:13px;color:#666;margin:0 0 12px;">Ubicación central de tu finca. Todos los mapas cargan centrados aquí.</p>

        <button type="button" id="btn-open-ref-map-sheet" style="width:100%;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-radius:16px;border:1px solid #e6ece4;background:#ffffff;cursor:pointer;text-align:left;transition:all 0.2s;">
          <div style="display:flex;align-items:center;gap:14px;min-width:0;">
            <div style="width:44px;height:44px;border-radius:12px;background:#2d3e2c;color:white;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
              <span class="material-icons" style="font-size:22px;">add_location_alt</span>
            </div>
            <div style="min-width:0;">
              <div id="ref-map-open-title" style="font-family:'Work Sans',sans-serif;font-size:15px;font-weight:700;color:var(--m3-on-surface,#1e3e2b);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${refSet ? escapeSearchHtml(refNombre || 'Finca') : 'Abrir mapa satelital'}</div>
              <div id="ref-map-open-status" style="font-size:12.5px;color:var(--m3-on-surface-variant,#556b53);margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">
                ${refSet ? 'Toca para cambiar la ubicación' : 'Toca para marcar el punto de referencia de la finca'}
              </div>
            </div>
          </div>
          <span class="material-icons" style="color:var(--m3-primary,#2d3e2c);font-size:24px;flex-shrink:0;">open_in_full</span>
        </button>

        <!-- Fullscreen Google Earth Style Map + Bottom Sheet para Punto de Referencia -->
        <div id="ref-map-sheet" style="position:fixed;inset:0;z-index:10050;background:#141614;display:flex;flex-direction:column;visibility:hidden;opacity:0;pointer-events:none;transition:opacity 0.22s ease;">
          <div style="height:100dvh;width:100%;background:#141614;overflow:hidden;display:flex;flex-direction:column;">
            <div id="ref-map-container" style="flex:1 1 0%;min-height:0;width:100%;position:relative;overflow:hidden;">
              <div id="ref-map" style="width:100%;height:100%;"></div>
              <input type="hidden" id="ref-map-search-input" value="">
              <button type="button" id="ref-map-search-clear" style="display:none;"></button>

              <!-- Crosshair -->
              <div id="ref-earth-crosshair" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);z-index:1002;pointer-events:none;display:${refSet ? 'none' : 'flex'};flex-direction:column;align-items:center;">
                <div id="ref-earth-pill" style="margin-bottom:10px;background:#f3d26b;color:#1f1b10;padding:4px 10px;border-radius:8px;font-size:12.5px;font-weight:800;font-family:'Work Sans',sans-serif;box-shadow:0 2px 8px rgba(0,0,0,0.45);white-space:nowrap;">
                  Ubica el punto de referencia
                </div>
                <div style="width:26px;height:26px;border-radius:50%;border:2px solid #ffffff;box-shadow:0 0 0 1.5px rgba(0,0,0,0.65),inset 0 0 0 1.5px rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;">
                  <div style="width:4px;height:4px;border-radius:50%;background:#ffffff;box-shadow:0 0 2px rgba(0,0,0,0.8);"></div>
                </div>
              </div>

              <!-- Scale & Coords -->
              <div style="position:absolute;bottom:14px;left:14px;z-index:1000;background:rgba(0,0,0,0.6);color:white;padding:4px 10px;border-radius:10px;font-size:11px;font-weight:600;font-family:'Work Sans',sans-serif;">
                <span id="ref-scale-text">100 m</span>
              </div>
              <div style="position:absolute;bottom:14px;right:14px;z-index:1000;background:rgba(0,0,0,0.65);color:white;padding:4px 10px;border-radius:10px;font-size:10.5px;font-weight:500;font-family:'Work Sans',monospace;backdrop-filter:blur(8px);">
                <span id="ref-coords-text">14.085720°N 86.178650°W</span>
              </div>

              <!-- Top Right Search Button -->
              <div style="position:absolute;top:16px;right:16px;z-index:1000;">
                <button type="button" id="ref-map-search-toggle" class="m3-map-overlay-btn" style="width:44px;height:44px;border-radius:12px;background:#141614;color:#ffffff;border:1px solid rgba(255,255,255,0.18);box-shadow:0 4px 14px rgba(0,0,0,0.45);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;" title="Buscar lugar, lote o coordenadas">
                  <span class="material-icons" style="font-size:22px;color:#ffffff;">search</span>
                </button>
              </div>

              <!-- Bottom Right Action Stack -->
              <div id="ref-map-bottom-actions" style="position:absolute;bottom:50px;right:16px;z-index:1000;display:flex;flex-direction:column;gap:8px;">
                <button type="button" id="btn-ref-toggle-layers" class="m3-map-overlay-btn" style="width:44px;height:44px;border-radius:12px;background:#141614;color:#ffffff;border:1px solid rgba(255,255,255,0.18);box-shadow:0 4px 14px rgba(0,0,0,0.45);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;" title="Cambiar capa">
                  <span class="material-icons" style="font-size:22px;color:#ffffff;">layers</span>
                </button>
                <button type="button" id="btn-ref-locate" class="m3-map-overlay-btn" style="width:44px;height:44px;border-radius:12px;background:#141614;color:#ffffff;border:1px solid rgba(255,255,255,0.18);box-shadow:0 4px 14px rgba(0,0,0,0.45);cursor:pointer;display:flex;align-items:center;justify-content:center;transition:all 0.2s;" title="Mi ubicación">
                  <span class="material-icons" style="font-size:22px;color:#ffffff;">my_location</span>
                </button>
              </div>
            </div>

            <!-- Dark Bottom Sheet -->
            <div id="ref-earth-bar" style="flex-shrink:0;background:#141614;color:#f1f3f4;padding:8px 16px calc(16px + env(safe-area-inset-bottom));border-radius:24px 24px 0 0;margin-top:-18px;position:relative;z-index:1005;box-shadow:0 -8px 28px rgba(0,0,0,0.45);display:flex;flex-direction:column;gap:12px;">
              <div style="width:40px;height:4px;border-radius:999px;background:rgba(255,255,255,0.35);margin:2px auto 0;"></div>
              <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
                <div style="display:flex;align-items:center;gap:10px;">
                  <button type="button" id="btn-close-ref-map-sheet" style="width:36px;height:36px;border-radius:50%;border:none;background:rgba(255,255,255,0.08);color:#f1f3f4;display:flex;align-items:center;justify-content:center;cursor:pointer;" title="Cerrar mapa">
                    <span class="material-icons" style="font-size:20px;">arrow_back</span>
                  </button>
                  <div>
                    <div style="font-family:'Work Sans',sans-serif;font-size:16px;font-weight:700;color:#ffffff;">Punto de Referencia</div>
                    <div id="ref-earth-bar-stats" style="font-size:12px;color:#c4c7c5;">${refSet ? `${puntoRef.lat.toFixed(5)}, ${puntoRef.lng.toFixed(5)}` : 'Mueve el mapa y marca el punto'}</div>
                  </div>
                </div>
                <button type="button" id="btn-ref-clear" style="width:38px;height:38px;border-radius:50%;border:none;background:rgba(255,255,255,0.08);color:#f1f3f4;display:flex;align-items:center;justify-content:center;cursor:pointer;${refSet ? '' : 'opacity:0.4;pointer-events:none;'}" title="Quitar punto de referencia">
                  <span class="material-icons" style="font-size:20px;">delete_outline</span>
                </button>
              </div>

              <div class="m3-field m3-field-dark ${refNombre ? 'has-value' : ''}" style="margin-bottom:2px;">
                <input id="ref-nombre" type="text" placeholder=" " value="${refNombre}" autocomplete="off">
                <label for="ref-nombre">Nombre del lugar (ej. Finca la Rosa)</label>
              </div>

              <div style="display:flex;align-items:center;gap:10px;">
                <button type="button" id="btn-ref-add-point" style="flex:1;height:44px;border-radius:999px;border:none;background:#c2e7ff;color:#001d35;font-family:'Work Sans',sans-serif;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;">
                  <span class="material-icons" style="font-size:20px;">${refSet ? 'edit_location_alt' : 'add_location_alt'}</span>
                  ${refSet ? 'Cambiar punto de referencia' : 'Marcar punto'}
                </button>
                <button type="button" id="btn-ref-save" style="height:44px;padding:0 20px;border-radius:999px;border:1px solid rgba(255,255,255,0.28);background:transparent;color:#e3e3e3;font-family:'Work Sans',sans-serif;font-size:14px;font-weight:700;display:flex;align-items:center;justify-content:center;gap:6px;cursor:pointer;">
                  <span class="material-icons" style="font-size:18px;">check</span>
                  Listo
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div style="height:1px;background:var(--m3-outline-variant,#e0e0e0);margin:24px 0;"></div>

      <div style="display:grid;gap:12px;">
        <div id="config-offline-header" role="button" tabindex="0" style="padding:14px 16px;border-radius:16px;background:#ffffff;border:1px solid #e6ece4;cursor:pointer;user-select:none;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:4px;">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              <span class="material-icons" style="color:#2d3e2c;font-size:20px;">offline_pin</span>
              <span style="font-weight:700;font-size:14.5px;color:#111827;">Modo sin internet</span>
            </div>
            <div style="display:flex;align-items:center;gap:6px;flex-shrink:0;">
              <span id="config-offline-badge" style="font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;background:${localStorage.getItem('offline_data_downloaded_at') ? '#dcfce7' : '#fef3c7'};color:${localStorage.getItem('offline_data_downloaded_at') ? '#166534' : '#92400e'};">
                ${localStorage.getItem('offline_data_downloaded_at') ? '✓ Descargado' : (localStorage.getItem('offline_download_dismissed') === '1' ? 'Omitido' : 'Pendiente')}
              </span>
              <span class="material-symbols-outlined" id="config-offline-chev" style="font-size:20px;color:#5a6b58;">chevron_right</span>
            </div>
          </div>
          <p id="config-offline-desc" style="font-size:12.5px;color:#5a6b58;margin:0;line-height:1.4;">
            ${localStorage.getItem('offline_data_downloaded_at')
              ? `Última descarga: ${new Date(localStorage.getItem('offline_data_downloaded_at')).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}. Puedes actualizar todos los datos cuando quieras.`
              : 'Descarga todos los datos de la finca para que todos los módulos funcionen sin conexión a internet.'}
          </p>
        </div>

        <!-- Bottom Sheet Modo sin internet -->
        <div id="offline-data-sheet-scrim" class="wa-sheet-scrim"></div>
        <div id="offline-data-sheet" class="wa-m3-sheet" aria-hidden="true">
          <div class="wa-sheet-handle-wrap" title="Toca para expandir">
            <div class="wa-sheet-handle"></div>
          </div>
          <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin-bottom:10px;">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              <span class="material-icons" style="color:#2d3e2c;font-size:22px;">offline_pin</span>
              <h3 style="margin:0;font-size:18px;font-weight:800;color:#1e3e2b;">Modo sin internet</h3>
            </div>
            <button id="btn-offline-sheet-close" type="button" style="width:36px;height:36px;border-radius:50%;border:none;background:#f1f5f0;color:#2d3e2c;display:flex;align-items:center;justify-content:center;cursor:pointer;" aria-label="Cerrar">
              <span class="material-icons" style="font-size:20px;">close</span>
            </button>
          </div>
          <p id="config-offline-sheet-desc" style="font-size:13px;color:#5a6b58;margin:0 0 14px;line-height:1.45;">
            ${localStorage.getItem('offline_data_downloaded_at')
              ? `Última descarga: ${new Date(localStorage.getItem('offline_data_downloaded_at')).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}. Puedes actualizar todos los datos cuando quieras.`
              : 'Descarga todos los datos de la finca para que todos los módulos funcionen sin conexión a internet.'}
          </p>
          <div id="config-offline-modules" style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:16px;"></div>
          <div style="display:grid;gap:8px;">
            <button id="btn-config-download" class="btn-m3-primary" style="width:100%;padding:13px;border-radius:12px;background:#2d3e2c;color:white;border:none;font-weight:700;font-size:14px;cursor:pointer;font-family:'Work Sans',sans-serif;display:flex;align-items:center;justify-content:center;gap:8px;">
              <span class="material-icons">cloud_download</span> ${localStorage.getItem('offline_data_downloaded_at') ? 'Actualizar datos sin internet' : 'Descargar todos los datos'}
            </button>
            <button id="btn-config-delete-offline" type="button" style="display:${localStorage.getItem('offline_data_downloaded_at') ? 'flex' : 'none'};width:100%;padding:11px;border-radius:12px;background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;font-weight:700;font-size:13px;cursor:pointer;font-family:'Work Sans',sans-serif;align-items:center;justify-content:center;gap:6px;">
              <span class="material-icons" style="font-size:18px;">delete_outline</span> Borrar datos descargados
            </button>
          </div>
        </div>
        <div style="padding:14px 16px;border-radius:16px;background:#ffffff;border:1px solid #e6ece4;">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:4px;">
            <div style="display:flex;align-items:center;gap:8px;min-width:0;">
              <span class="material-icons" style="color:#2d3e2c;font-size:20px;">notifications_active</span>
              <span style="font-weight:700;font-size:14.5px;color:#111827;">Notificaciones Push</span>
            </div>
            <button type="button" id="switch-config-push" role="switch" aria-checked="false" aria-label="Activar notificaciones push" class="m3-switch">
              <span class="m3-switch-thumb">
                <span class="material-icons m3-switch-icon">check</span>
              </span>
            </button>
          </div>
          <p id="config-push-desc" style="font-size:12.5px;color:#5a6b58;margin:0;line-height:1.4;">
            Recibe alertas en tu celular cuando toque cambio de aceite en Motores o cuando un ternero esté próximo a nacer.
          </p>
          <p id="config-push-status-note" style="display:none;font-size:12px;font-weight:600;color:#b91c1c;margin:6px 0 0;"></p>
          <button id="btn-config-push-test" type="button" style="display:none;margin-top:10px;width:100%;padding:10px;border-radius:12px;background:#ffffff;color:#2d3e2c;border:1px solid #cbd8c9;font-weight:700;font-size:13px;cursor:pointer;font-family:'Work Sans',sans-serif;align-items:center;justify-content:center;gap:6px;">
            <span class="material-icons" style="font-size:17px;">send</span> Enviar notificación de prueba
          </button>
        </div>
      </div>
    </div>
  `;
}

let waPollInterval = null;
let isWaConnected = false;
let isWaSheetOpen = false;
let waGroupsCache = [];
let waGroupsLoading = false;
let waGroupsLoaded = false;
let selectedWaGroup = { jid: '', name: '' };
let isShareSheetOpen = false;
let isOfflineSheetOpen = false;
let isRefMapOpen = false;
let closeRefMapSheetFn = null;

function copyTextSync(text) {
  if (!text) return false;
  let copied = false;
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    ta.setSelectionRange(0, text.length);
    copied = document.execCommand('copy');
    document.body.removeChild(ta);
  } catch {}
  try {
    navigator.clipboard?.writeText?.(text).catch(() => {});
  } catch {}
  return copied || Boolean(navigator.clipboard?.writeText);
}

async function copyTextToClipboard(text) {
  if (!text) return false;
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {}
  }
  return copyTextSync(text);
}

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
    try {
      await createInstance();
    } catch (retryErr) {
      if (retryErr.message?.includes('403') || retryErr.message?.toLowerCase().includes('already in use')) {
        return;
      }
      throw retryErr;
    }
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
  const rawPhoneVal = phoneInput?.value?.trim() || '';
  if (rawPhoneVal) localStorage.setItem('wa_pairing_phone', rawPhoneVal);
  let phone = rawPhoneVal.replace(/[^0-9]/g, '');
  if (phone.length < 7) {
    if (window.Snackbar) window.Snackbar.show('Ingresá un número de teléfono válido (ej: +504 9123 4567)', 'error');
    btn.disabled = false;
    btn.innerHTML = '<span class="material-icons">link</span> Conectar WhatsApp';
    return;
  }

  btn.innerHTML = '<span class="material-icons animate-spin">sync</span> Solicitando código...';

  try {
    const result = await connectPairing(phone);
    const pairingCode = result?.pairingCode || result?.code;

    if (pairingCode) {
      const rawCode = String(pairingCode).replace(/[^A-Za-z0-9]/g, '');
      const displayCode = rawCode.length === 8 ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}` : String(pairingCode);
      window._lastWaPairingCode = rawCode || String(pairingCode);
      document.getElementById('wa-pairing-area').style.display = 'none';
      const codeArea = document.getElementById('wa-pairing-code-area');
      codeArea.style.display = 'block';
      const targetEl = document.getElementById('wa-pairing-phone-target');
      if (targetEl) targetEl.textContent = `Código generado para: +${phone}`;
      document.getElementById('wa-pairing-code-display').textContent = displayCode;
      const copied = await copyTextToClipboard(window._lastWaPairingCode);
      if (copied) window.Snackbar?.show('Código copiado al portapapeles ✓');
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
  btn.innerHTML = '<span class="material-icons">link</span> Conectar WhatsApp';
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
  waGroupsCache = [];
  waGroupsLoading = false;
  waGroupsLoaded = false;
  selectedWaGroup = { jid: '', name: '' };
  localStorage.removeItem('wa_connected');
  localStorage.removeItem('wa_connected_by');
  localStorage.removeItem('whatsapp_group_jid');
  localStorage.removeItem('whatsapp_group_name');
  const empresaId = window._currentEmpresaId;
  if (empresaId) {
    await saveWhatsAppConfig(empresaId, {
      whatsapp_status: 'disconnected',
      whatsapp_connected_by: null,
      whatsapp_connected_at: null,
      whatsapp_group_jid: null,
    });
    await loadWhatsAppConfig(empresaId);
  }
  if (window.Snackbar) window.Snackbar.show('WhatsApp desconectado ✓');
  updateUIAfterDisconnect();
  closeWaSheet(false);
}

function toggleConfigSheet(isOpenFlagSetter, getWasOpen, scrimId, sheetId, overlayKey, open, fromPopState = false) {
  const scrim = document.getElementById(scrimId);
  const sheet = document.getElementById(sheetId);
  if (open) {
    isOpenFlagSetter(true);
    scrim?.classList.add('open');
    if (sheet) {
      sheet.classList.remove('sheet-expanded');
      sheet.classList.add('open');
      sheet.setAttribute('aria-hidden', 'false');
    }
    if (window.history.state?.configOverlay !== overlayKey) {
      window.history.pushState({ configOverlay: overlayKey }, '', '#configuracion');
    }
    return;
  }
  const wasOpen = getWasOpen();
  isOpenFlagSetter(false);
  scrim?.classList.remove('open');
  if (sheet) {
    sheet.classList.remove('open', 'sheet-expanded');
    sheet.setAttribute('aria-hidden', 'true');
  }
  if (wasOpen && !fromPopState && window.history.state?.configOverlay === overlayKey) {
    window.history.back();
  }
}

function escapeAcAttr(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function syncAcceptGroupButtonLabel() {
  const acceptBtn = document.getElementById('btn-wa-accept-group');
  if (!acceptBtn) return;
  if (selectedWaGroup.jid) {
    acceptBtn.innerHTML = '<span class="material-icons" style="font-size:18px;">check</span> Aceptar';
  } else {
    acceptBtn.innerHTML = '<span class="material-icons" style="font-size:18px;">group</span> Buscar grupos';
  }
}

function closeWaGroupMenu() {
  const wrap = document.getElementById('wa-group-ac-wrap');
  const input = document.getElementById('wa-group-ac-input');
  wrap?.classList.remove('is-open');
  input?.setAttribute('aria-expanded', 'false');
}

function renderWaGroupMenu(filterText = '') {
  const menu = document.getElementById('wa-group-ac-menu');
  if (!menu) return;
  if (waGroupsLoading) {
    menu.innerHTML = '<div class="m3-ac-empty">Buscando grupos...</div>';
    return;
  }
  const q = (filterText || '').trim().toLowerCase();
  const filtered = q
    ? waGroupsCache.filter(g => (g.name || g.remoteJid || '').toLowerCase().includes(q))
    : waGroupsCache;

  if (filtered.length === 0) {
    menu.innerHTML = `<div class="m3-ac-empty">${waGroupsCache.length === 0 ? 'No se encontraron grupos en WhatsApp' : 'Sin coincidencias'}</div>`;
    return;
  }

  menu.innerHTML = filtered.map((g) => {
    const label = g.name || g.remoteJid || 'Grupo';
    const isSel = selectedWaGroup.jid && selectedWaGroup.jid === g.remoteJid;
    return `
      <button type="button" class="m3-ac-option ${isSel ? 'is-selected' : ''}" data-jid="${escapeAcAttr(g.remoteJid)}" data-name="${escapeAcAttr(label)}" role="option" aria-selected="${isSel ? 'true' : 'false'}">
        ${isSel ? '<span class="material-icons m3-ac-option-check">check</span>' : '<span class="material-icons m3-ac-option-check" aria-hidden="true"></span>'}
        <span class="m3-ac-option-text">
          <span class="m3-ac-option-name">${escapeSearchHtml(label)}</span>
        </span>
      </button>
    `;
  }).join('');

  menu.querySelectorAll('.m3-ac-option').forEach((optBtn) => {
    optBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const jid = optBtn.dataset.jid || '';
      const name = optBtn.dataset.name || 'Grupo';
      selectedWaGroup = { jid, name };
      const input = document.getElementById('wa-group-ac-input');
      if (input) {
        input.value = name;
        input.closest('.m3-field')?.classList.add('has-value');
      }
      const groupStatus = document.getElementById('wa-selected-group');
      if (groupStatus) groupStatus.style.display = 'none';
      syncAcceptGroupButtonLabel();
      closeWaGroupMenu();
    });
  });
}

async function loadWaGroupsForAutocomplete(forceRefresh = false) {
  if (waGroupsLoading) return;
  const input = document.getElementById('wa-group-ac-input');
  if (waGroupsLoaded && !forceRefresh && waGroupsCache.length > 0) {
    renderWaGroupMenu(input?.value || '');
    return;
  }
  waGroupsLoading = true;
  renderWaGroupMenu('');
  try {
    const groups = await listGroups();
    waGroupsCache = Array.isArray(groups) ? groups : [];
    waGroupsLoaded = true;
  } catch (e) {
    console.error('listGroups error:', e);
    window.Snackbar?.show('Error al buscar grupos: ' + (e.message || e), 'error');
  } finally {
    waGroupsLoading = false;
    renderWaGroupMenu(input?.value || '');
  }
}

function openWaGroupMenu(showAll = false) {
  const wrap = document.getElementById('wa-group-ac-wrap');
  const input = document.getElementById('wa-group-ac-input');
  if (!wrap || !input || input.readOnly) return;
  if (!waGroupsLoaded) {
    loadWaGroupsForAutocomplete(false);
  }
  renderWaGroupMenu(showAll ? '' : input.value);
  wrap.classList.add('is-open');
  input.setAttribute('aria-expanded', 'true');
}

function syncWaSheetAndCardUI() {
  const groupName = localStorage.getItem('whatsapp_group_name') || '';
  const statusEl = document.getElementById('wa-status-text');
  const cardSub = document.getElementById('wa-card-sub');
  const sheetTitle = document.getElementById('wa-sheet-title');
  const connectFlow = document.getElementById('wa-connect-flow');
  const connArea = document.getElementById('wa-connected-area');
  const groupStatus = document.getElementById('wa-selected-group');
  const acWrap = document.getElementById('wa-group-ac-wrap');
  const acInput = document.getElementById('wa-group-ac-input');
  const acToggle = document.getElementById('wa-group-ac-toggle');
  const acceptBtn = document.getElementById('btn-wa-accept-group');
  const disconnectBtn = document.getElementById('btn-wa-disconnect');
  const footer = document.getElementById('wa-connected-footer');

  if (statusEl) statusEl.textContent = isWaConnected ? 'WhatsApp conectado' : 'Conectar a WhatsApp';
  if (cardSub) {
    cardSub.style.display = isWaConnected ? 'block' : 'none';
    cardSub.textContent = groupName ? `Grupo: ${groupName}` : 'Buscar grupos';
  }
  if (sheetTitle) sheetTitle.textContent = isWaConnected ? 'WhatsApp conectado' : 'Conectar WhatsApp';
  if (connectFlow) connectFlow.style.display = isWaConnected ? 'none' : 'block';
  if (connArea) connArea.style.display = isWaConnected ? 'flex' : 'none';
  if (groupStatus) {
    const showEmpty = !groupName && !selectedWaGroup.jid;
    groupStatus.style.display = showEmpty ? 'flex' : 'none';
    if (showEmpty) groupStatus.textContent = '⚠️ No hay grupo seleccionado';
  }
  if (acWrap) acWrap.style.display = 'block';
  if (acInput) {
    if (groupName) {
      acInput.value = groupName;
      acInput.readOnly = true;
      acInput.closest('.m3-field')?.classList.add('has-value');
      closeWaGroupMenu();
    } else {
      acInput.readOnly = false;
      if (!selectedWaGroup.jid) {
        acInput.value = '';
        acInput.closest('.m3-field')?.classList.remove('has-value');
      }
    }
  }
  if (acToggle) acToggle.style.display = groupName ? 'none' : 'inline-flex';
  if (acceptBtn) {
    acceptBtn.style.display = groupName ? 'none' : 'inline-flex';
    syncAcceptGroupButtonLabel();
  }
  if (footer) {
    const hasDisconnect = Boolean(disconnectBtn && disconnectBtn.style.display !== 'none');
    const hasAccept = Boolean(acceptBtn && acceptBtn.style.display !== 'none');
    footer.style.gridTemplateColumns = (hasDisconnect && hasAccept) ? '1fr 1.6fr' : '1fr';
  }
}

function openWaSheet() {
  const codeArea = document.getElementById('wa-pairing-code-area');
  if (codeArea) codeArea.style.display = 'none';
  switchWaTab('pairing');
  selectedWaGroup = { jid: '', name: '' };
  const acInput = document.getElementById('wa-group-ac-input');
  if (acInput) {
    acInput.value = '';
    acInput.closest('.m3-field')?.classList.remove('has-value');
  }
  closeWaGroupMenu();
  syncWaSheetAndCardUI();
  toggleConfigSheet(v => { isWaSheetOpen = v; }, () => isWaSheetOpen, 'wa-connect-sheet-scrim', 'wa-connect-sheet', 'wa-sheet', true);
  if (isWaConnected && !localStorage.getItem('whatsapp_group_name')) {
    loadWaGroupsForAutocomplete(false);
  }
}

function closeWaSheet(fromPopState = false) {
  if (waPollInterval) {
    clearInterval(waPollInterval);
    waPollInterval = null;
  }
  closeWaGroupMenu();
  toggleConfigSheet(v => { isWaSheetOpen = v; }, () => isWaSheetOpen, 'wa-connect-sheet-scrim', 'wa-connect-sheet', 'wa-sheet', false, fromPopState);
}

function openShareSheet() {
  toggleConfigSheet(v => { isShareSheetOpen = v; }, () => isShareSheetOpen, 'share-app-sheet-scrim', 'share-app-sheet', 'share-sheet', true);
}

function closeShareSheet(fromPopState = false) {
  toggleConfigSheet(v => { isShareSheetOpen = v; }, () => isShareSheetOpen, 'share-app-sheet-scrim', 'share-app-sheet', 'share-sheet', false, fromPopState);
}

function openOfflineSheet() {
  toggleConfigSheet(v => { isOfflineSheetOpen = v; }, () => isOfflineSheetOpen, 'offline-data-sheet-scrim', 'offline-data-sheet', 'offline-sheet', true);
}

function closeOfflineSheet(fromPopState = false) {
  toggleConfigSheet(v => { isOfflineSheetOpen = v; }, () => isOfflineSheetOpen, 'offline-data-sheet-scrim', 'offline-data-sheet', 'offline-sheet', false, fromPopState);
}

function updateUIAfterConnect() {
  const config = window._empresaWhatsAppConfig;
  closeWaSheet(false);
  const discArea = document.getElementById('wa-disconnected-area');
  if (discArea) discArea.style.display = 'block';
  const codeArea = document.getElementById('wa-pairing-code-area');
  if (codeArea) codeArea.style.display = 'none';
  const shared = document.getElementById('wa-shared-info');
  if (shared) shared.style.display = 'none';
  const disconnectBtn = document.getElementById('btn-wa-disconnect');
  if (disconnectBtn) {
    const canDisconnect = config?.whatsapp_connected_by === currentUserId || userRole === 'propietario';
    disconnectBtn.style.display = canDisconnect ? 'inline-flex' : 'none';
  }
  syncWaSheetAndCardUI();
}

function updateUIAfterDisconnect() {
  const discArea = document.getElementById('wa-disconnected-area');
  if (discArea) discArea.style.display = 'block';
  document.getElementById('wa-pairing-code-area').style.display = 'none';
  document.getElementById('wa-qr-area').style.display = 'none';
  document.getElementById('wa-shared-info').style.display = 'none';
  syncWaSheetAndCardUI();
  switchWaTab('pairing');
}

async function handleAcceptGroupClick() {
  if (!selectedWaGroup.jid) {
    document.getElementById('wa-connect-sheet')?.classList.add('sheet-expanded');
    openWaGroupMenu(true);
    await loadWaGroupsForAutocomplete(true);
    document.getElementById('wa-group-ac-input')?.focus();
    return;
  }
  const jid = selectedWaGroup.jid;
  const groupName = selectedWaGroup.name || 'Grupo';
  localStorage.setItem('whatsapp_group_jid', jid);
  localStorage.setItem('whatsapp_group_name', groupName);
  selectedWaGroup = { jid: '', name: '' };
  const empresaId = window._currentEmpresaId;
  if (empresaId) {
    await saveWhatsAppConfig(empresaId, { whatsapp_group_jid: jid });
    await loadWhatsAppConfig(empresaId);
  }
  syncWaSheetAndCardUI();
  closeWaSheet(false);
  if (window.Snackbar) window.Snackbar.show(`Grupo "${groupName}" guardado ✓`);
  checkMotoresAceite().catch(() => {});
  checkPartosProximos().catch(() => {});
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
    syncWaSheetAndCardUI();
  } catch (e) {
    console.warn('autoSelectGroup error:', e);
  }
}

export function initConfiguracion() {
  const empresaId = window._currentEmpresaId;

  (async () => {
    const fincaEl = document.getElementById('config-finca-nombre');
    if (fincaEl) {
      const fincaNombre = await resolveEmpresaNombre(empresaId);
      if (fincaNombre) fincaEl.textContent = fincaNombre;
    }
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

  isWaSheetOpen = false;
  isShareSheetOpen = false;
  isOfflineSheetOpen = false;
  isRefMapOpen = false;
  closeRefMapSheetFn = null;

  const copyPairingCode = async () => {
    const rawFromEl = document.getElementById('wa-pairing-code-display')?.textContent?.replace(/[^A-Za-z0-9]/g, '') || '';
    const code = window._lastWaPairingCode || rawFromEl;
    if (!code) return false;
    return copyTextToClipboard(code);
  };

  window.__closeConfigOverlayIfOpen = () => {
    const refSheet = document.getElementById('ref-map-sheet');
    const waSheet = document.getElementById('wa-connect-sheet');
    const shareSheet = document.getElementById('share-app-sheet');
    const offlineSheet = document.getElementById('offline-data-sheet');
    const refOpen = Boolean(refSheet && refSheet.isConnected && (isRefMapOpen || refSheet.style.visibility === 'visible'));
    if (refOpen) {
      if (typeof closeRefMapSheetFn === 'function') {
        closeRefMapSheetFn(true);
      } else {
        isRefMapOpen = false;
        refSheet.style.opacity = '0';
        refSheet.style.pointerEvents = 'none';
        refSheet.style.visibility = 'hidden';
      }
      return true;
    }
    const waOpen = Boolean(waSheet && waSheet.isConnected && (isWaSheetOpen || waSheet.classList.contains('open')));
    if (waOpen) {
      closeWaSheet(true);
      return true;
    }
    const shareOpen = Boolean(shareSheet && shareSheet.isConnected && (isShareSheetOpen || shareSheet.classList.contains('open')));
    if (shareOpen) {
      closeShareSheet(true);
      return true;
    }
    const offlineOpen = Boolean(offlineSheet && offlineSheet.isConnected && (isOfflineSheetOpen || offlineSheet.classList.contains('open')));
    if (offlineOpen) {
      closeOfflineSheet(true);
      return true;
    }
    isWaSheetOpen = false;
    isShareSheetOpen = false;
    isOfflineSheetOpen = false;
    isRefMapOpen = false;
    return false;
  };

  if (window._configPopStateHandler) {
    window.removeEventListener('popstate', window._configPopStateHandler);
  }
  window._configPopStateHandler = () => {
    if (window.__closeConfigOverlayIfOpen?.()) {
      if (window.location.hash !== '#configuracion') {
        window.history.pushState(null, '', '#configuracion');
      }
    }
  };
  window.addEventListener('popstate', window._configPopStateHandler);

  document.getElementById('btn-wa-open-sheet')?.addEventListener('click', openWaSheet);
  document.getElementById('btn-wa-sheet-close')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeWaSheet(false);
  });
  document.getElementById('wa-connect-sheet-scrim')?.addEventListener('click', () => closeWaSheet(false));
  document.getElementById('wa-pairing-code-display')?.addEventListener('click', async () => {
    const ok = await copyPairingCode();
    if (ok) window.Snackbar?.show('Código copiado ✓');
  });
  document.getElementById('btn-wa-open-app')?.addEventListener('click', () => {
    const rawFromEl = document.getElementById('wa-pairing-code-display')?.textContent?.replace(/[^A-Za-z0-9]/g, '') || '';
    const code = window._lastWaPairingCode || rawFromEl;
    if (code) copyTextSync(code);
    window.Snackbar?.show('Código copiado · Abrí Dispositivos vinculados en WhatsApp');
    const ua = navigator.userAgent || '';
    if (/Android/i.test(ua)) {
      window.location.href = 'intent://#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=com.whatsapp;end';
    } else if (/iPhone|iPad|iPod/i.test(ua)) {
      window.location.href = 'whatsapp://app';
    } else {
      window.location.href = 'whatsapp://';
    }
  });
  const waPhoneEl = document.getElementById('wa-phone-input');
  waPhoneEl?.addEventListener('input', () => {
    waPhoneEl.closest('.m3-field')?.classList.toggle('has-value', Boolean(waPhoneEl.value));
    if (waPhoneEl.value.trim()) localStorage.setItem('wa_pairing_phone', waPhoneEl.value.trim());
  });

  document.getElementById('wa-tab-pairing')?.addEventListener('click', () => switchWaTab('pairing'));
  document.getElementById('wa-tab-qr')?.addEventListener('click', () => switchWaTab('qr'));
  document.getElementById('btn-wa-connect')?.addEventListener('click', handleConnectClick);
  document.getElementById('btn-wa-qr-connect')?.addEventListener('click', handleQRConnectClick);
  document.getElementById('btn-wa-cancel-pairing')?.addEventListener('click', () => {
    if (waPollInterval) {
      clearInterval(waPollInterval);
      waPollInterval = null;
    }
    const codeArea = document.getElementById('wa-pairing-code-area');
    if (codeArea) codeArea.style.display = 'none';
    switchWaTab('pairing');
  });
  document.getElementById('btn-wa-disconnect')?.addEventListener('click', handleDisconnectClick);
  document.getElementById('btn-wa-accept-group')?.addEventListener('click', handleAcceptGroupClick);

  const waAcWrap = document.getElementById('wa-group-ac-wrap');
  const waAcInput = document.getElementById('wa-group-ac-input');
  const waAcToggle = document.getElementById('wa-group-ac-toggle');
  const waConnectSheet = document.getElementById('wa-connect-sheet');

  waAcInput?.addEventListener('focus', () => openWaGroupMenu(true));
  waAcInput?.addEventListener('click', (e) => {
    e.stopPropagation();
    openWaGroupMenu(true);
  });
  waAcInput?.addEventListener('input', () => {
    if (waAcInput.readOnly) return;
    waAcInput.closest('.m3-field')?.classList.toggle('has-value', Boolean(waAcInput.value));
    if (selectedWaGroup.jid && waAcInput.value.trim() !== selectedWaGroup.name) {
      selectedWaGroup = { jid: '', name: '' };
      syncAcceptGroupButtonLabel();
      const groupStatus = document.getElementById('wa-selected-group');
      if (groupStatus && !localStorage.getItem('whatsapp_group_name')) {
        groupStatus.style.display = 'flex';
        groupStatus.textContent = '⚠️ No hay grupo seleccionado';
      }
    }
    openWaGroupMenu(false);
  });
  waAcToggle?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (waAcInput?.readOnly) return;
    if (waAcWrap?.classList.contains('is-open')) {
      closeWaGroupMenu();
    } else {
      openWaGroupMenu(true);
      waAcInput?.focus();
    }
  });
  waConnectSheet?.addEventListener('click', (e) => {
    if (waAcWrap && !waAcWrap.contains(e.target) && !e.target.closest('#btn-wa-accept-group')) {
      closeWaGroupMenu();
    }
  });

  document.querySelectorAll('.wa-sheet-handle-wrap').forEach((handleEl) => {
    const parentSheet = handleEl.closest('.wa-m3-sheet');
    if (!parentSheet) return;
    let touchStartY = 0;
    handleEl.addEventListener('click', () => {
      parentSheet.classList.toggle('sheet-expanded');
    });
    handleEl.addEventListener('touchstart', (e) => {
      touchStartY = e.touches[0].clientY;
    }, { passive: true });
    handleEl.addEventListener('touchend', (e) => {
      const dy = e.changedTouches[0].clientY - touchStartY;
      if (dy < -30) {
        parentSheet.classList.add('sheet-expanded');
      } else if (dy > 30) {
        if (parentSheet.classList.contains('sheet-expanded')) {
          parentSheet.classList.remove('sheet-expanded');
        } else if (parentSheet.id === 'share-app-sheet') {
          closeShareSheet(false);
        } else if (parentSheet.id === 'wa-connect-sheet') {
          closeWaSheet(false);
        } else if (parentSheet.id === 'offline-data-sheet') {
          closeOfflineSheet(false);
        }
      }
    }, { passive: true });
  });

  initPuntoReferencia();

  document.getElementById('config-offline-header')?.addEventListener('click', openOfflineSheet);
  document.getElementById('btn-offline-sheet-close')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeOfflineSheet(false);
  });
  document.getElementById('offline-data-sheet-scrim')?.addEventListener('click', () => closeOfflineSheet(false));

  const refreshOfflineModulesUI = async () => {
    const modBox = document.getElementById('config-offline-modules');
    const delBtn = document.getElementById('btn-config-delete-offline');
    if (!modBox) return;
    const empId = window._currentEmpresaId;
    const countTable = async (name) => {
      try {
        const rows = await db.table(name).toArray();
        return empId ? rows.filter(r => !r.empresa_id || r.empresa_id === empId).length : rows.length;
      } catch { return 0; }
    };
    const [ganado, motores, herramientas, potreros, lotes, personal, gastos, cultivos] = await Promise.all([
      countTable('ganado'),
      countTable('motores'),
      countTable('herramientas'),
      countTable('potreros'),
      countTable('lotes'),
      countTable('personal'),
      countTable('gastos'),
      countTable('cultivos'),
    ]);
    let fotos = 0;
    try {
      if (typeof caches !== 'undefined') {
        const c = await caches.open('finca-images-offline-v1');
        fotos = (await c.keys()).length;
      }
    } catch {}

    const modules = [
      { label: 'Ganado', count: ganado, icon: 'pets' },
      { label: 'Motores', count: motores, icon: 'precision_manufacturing' },
      { label: 'Herramientas', count: herramientas, icon: 'handyman' },
      { label: 'Potreros', count: potreros, icon: 'fence' },
      { label: 'Cafetal', count: lotes, icon: 'park' },
      { label: 'Personal', count: personal, icon: 'group' },
      { label: 'Gastos', count: gastos, icon: 'payments' },
      { label: 'Cultivos', count: cultivos, icon: 'eco' },
      { label: 'Fotos', count: fotos, icon: 'photo_library' },
    ];
    const hasAny = !!localStorage.getItem('offline_data_downloaded_at') || modules.some(m => m.count > 0);
    if (!hasAny) {
      modBox.innerHTML = '';
      modBox.style.display = 'none';
      if (delBtn) delBtn.style.display = 'none';
      return;
    }
    modBox.style.display = 'flex';
    modBox.innerHTML = modules
      .filter(m => m.count > 0 || localStorage.getItem('offline_data_downloaded_at'))
      .map(m => `
        <span style="display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;background:#ffffff;border:1px solid #d5e0d4;font-size:11.5px;font-weight:700;color:#2d3e2c;">
          <span class="material-icons" style="font-size:13px;color:#4a6b48;">${m.icon}</span>
          <span>${m.label} (${m.count})</span>
        </span>
      `).join('');
    if (delBtn) delBtn.style.display = 'flex';
  };
  refreshOfflineModulesUI();

  const refreshPushUI = async () => {
    const sw = document.getElementById('switch-config-push');
    const noteEl = document.getElementById('config-push-status-note');
    const testBtn = document.getElementById('btn-config-push-test');
    if (!sw) return;
    const status = await getPushStatus();
    const isEnabled = status === 'enabled';
    sw.classList.toggle('is-checked', isEnabled);
    sw.setAttribute('aria-checked', isEnabled ? 'true' : 'false');
    sw.disabled = status === 'unsupported';
    if (testBtn) testBtn.style.display = isEnabled ? 'flex' : 'none';
    if (noteEl) {
      if (status === 'denied') {
        noteEl.textContent = 'Permiso bloqueado en la configuración del navegador.';
        noteEl.style.color = '#b91c1c';
        noteEl.style.display = 'block';
      } else if (status === 'unconfigured') {
        noteEl.textContent = 'Falta configurar Firebase Push en el servidor.';
        noteEl.style.color = '#92400e';
        noteEl.style.display = 'block';
      } else if (status === 'unsupported') {
        noteEl.textContent = 'Este navegador no soporta notificaciones push.';
        noteEl.style.color = '#4b5563';
        noteEl.style.display = 'block';
      } else {
        noteEl.style.display = 'none';
      }
    }
  };
  refreshPushUI();

  document.getElementById('switch-config-push')?.addEventListener('click', async () => {
    const sw = document.getElementById('switch-config-push');
    if (!sw || sw.disabled) return;
    const wasChecked = sw.classList.contains('is-checked');
    sw.disabled = true;
    try {
      if (wasChecked) {
        localStorage.removeItem('push_token_registered');
        const uid = currentUserId || getSessionUserId?.() || (await getUser().catch(() => null))?.id;
        if (uid) {
          await restFetch(`/rest/v1/push_tokens?user_id=eq.${encodeURIComponent(uid)}&platform=eq.web`, {
            method: 'DELETE',
          }).catch(() => {});
        }
        window.Snackbar?.show('Notificaciones push desactivadas');
      } else {
        const res = await registerPushToken();
        if (res.ok) {
          await checkPushAlerts();
          window.Snackbar?.show('Notificaciones push activadas ✓');
        } else if (res.reason === 'missing_config') {
          window.Snackbar?.show('Configura las variables FIREBASE_* en Vercel/.env primero', { type: 'warning' });
        } else if (res.reason === 'denied') {
          window.Snackbar?.show('Permiso de notificaciones bloqueado en el navegador', { type: 'error' });
        } else {
          window.Snackbar?.show('No se pudo activar push: ' + (res.reason || 'error'), { type: 'warning' });
        }
      }
    } finally {
      sw.disabled = false;
      await refreshPushUI();
    }
  });

  document.getElementById('btn-config-push-test')?.addEventListener('click', async () => {
    const testBtn = document.getElementById('btn-config-push-test');
    if (!testBtn) return;
    testBtn.disabled = true;
    try {
      const { sendTestPush } = await import('../push/push.js');
      const r = await sendTestPush();
      if (r.ok) {
        window.Snackbar?.show('Notificación de prueba enviada ✓');
      } else {
        window.Snackbar?.show('Inicia sesión primero para probar', { type: 'warning' });
      }
    } catch (err) {
      window.Snackbar?.show('Error enviando prueba: ' + (err.message || err), { type: 'error' });
    }
    testBtn.disabled = false;
  });

  document.getElementById('btn-config-download')?.addEventListener('click', async () => {
    const btn = document.getElementById('btn-config-download');
    if (!navigator.onLine) {
      window.Snackbar?.show('Necesitas conexión a internet para descargar los datos', { type: 'warning' });
      return;
    }
    btn.disabled = true;
    btn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> <span id="config-dl-progress">Descargando... 0%</span>';
    const started = await fullDownload((pct) => {
      const label = document.getElementById('config-dl-progress');
      if (label) label.textContent = pct >= 100 ? 'Descarga completada' : `Descargando... ${pct}%`;
    });
    if (!started) {
      window.Snackbar?.show('Ya hay una sincronización en curso', { type: 'warning' });
    } else {
      const badge = document.getElementById('config-offline-badge');
      const desc = document.getElementById('config-offline-desc');
      const sheetDesc = document.getElementById('config-offline-sheet-desc');
      if (badge) {
        badge.textContent = '✓ Descargado';
        badge.style.background = '#dcfce7';
        badge.style.color = '#166534';
      }
      const downloadedText = `Última descarga: ${new Date().toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })}. Puedes actualizar todos los datos cuando quieras.`;
      if (desc) desc.textContent = downloadedText;
      if (sheetDesc) sheetDesc.textContent = downloadedText;
      await refreshOfflineModulesUI();
      window.Snackbar?.show('Todos los datos descargados para uso sin internet ✓');
    }
    btn.disabled = false;
    btn.innerHTML = started
      ? '<span class="material-icons">check_circle</span> Actualizar datos sin internet'
      : '<span class="material-icons">cloud_download</span> Descargar todos los datos';
  });

  document.getElementById('btn-config-delete-offline')?.addEventListener('click', async () => {
    const pendingCount = await db._sync_queue.count().catch(() => 0);
    const msg = pendingCount > 0
      ? `Hay ${pendingCount} cambio(s) pendiente(s) de subir. ¿Borrar los datos descargados sin internet?`
      : '¿Borrar los datos y fotos descargados para uso sin internet? Tus datos en la nube no se borrarán.';
    window.Snackbar?.confirm(msg, async () => {
      const TABLES_TO_CLEAR = [
        'motores', 'motor_sesiones', 'motor_mantenimientos',
        'potreros', 'ganado', 'herramientas', 'potrero_eventos',
        'animal_pesajes', 'animal_vacunas', 'animal_fumigaciones', 'animal_ventas',
        'animal_preñez', 'herramienta_mantenimientos', 'lotes', 'lote_aplicaciones',
        'lote_personal', 'personal', 'personal_asistencia', 'gastos', 'cultivos',
      ];
      for (const t of TABLES_TO_CLEAR) {
        await db.table(t).clear().catch(() => {});
      }
      if (typeof caches !== 'undefined') {
        await caches.delete('finca-images-offline-v1').catch(() => {});
      }
      localStorage.removeItem('offline_data_downloaded_at');
      localStorage.removeItem('offline_download_dismissed');
      const badge = document.getElementById('config-offline-badge');
      const desc = document.getElementById('config-offline-desc');
      const sheetDesc = document.getElementById('config-offline-sheet-desc');
      const dlBtn = document.getElementById('btn-config-download');
      if (badge) {
        badge.textContent = 'Pendiente';
        badge.style.background = '#fef3c7';
        badge.style.color = '#92400e';
      }
      const emptyOfflineText = 'Descarga todos los datos de la finca para que todos los módulos funcionen sin conexión a internet.';
      if (desc) desc.textContent = emptyOfflineText;
      if (sheetDesc) sheetDesc.textContent = emptyOfflineText;
      if (dlBtn) {
        dlBtn.innerHTML = '<span class="material-icons">cloud_download</span> Descargar todos los datos';
      }
      await refreshOfflineModulesUI();
      window.Snackbar?.show('Datos sin internet borrados ✓');
    });
  });

  const APP_LOGIN_URL = 'https://finca-manager.vercel.app/#login';
  document.getElementById('btn-open-share-sheet')?.addEventListener('click', openShareSheet);
  document.getElementById('btn-share-sheet-close')?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeShareSheet(false);
  });
  document.getElementById('share-app-sheet-scrim')?.addEventListener('click', () => closeShareSheet(false));
  document.getElementById('btn-share-whatsapp')?.addEventListener('click', () => {
    const text = 'Accede a Finca Manager: ' + APP_LOGIN_URL;
    window.open('https://api.whatsapp.com/send?text=' + encodeURIComponent(text), '_blank');
    closeShareSheet(false);
  });
  document.getElementById('btn-copy-link')?.addEventListener('click', async () => {
    const ok = await copyTextToClipboard(APP_LOGIN_URL);
    if (ok) window.Snackbar?.show('Enlace copiado al portapapeles');
    closeShareSheet(false);
  });
}

async function initPuntoReferencia() {
  const mapEl = document.getElementById('ref-map');
  if (!mapEl) return;

  const sheet = document.getElementById('ref-map-sheet');
  const btnOpen = document.getElementById('btn-open-ref-map-sheet');
  const btnClose = document.getElementById('btn-close-ref-map-sheet');
  const openTitleEl = document.getElementById('ref-map-open-title');
  const openStatusEl = document.getElementById('ref-map-open-status');
  const barStatsEl = document.getElementById('ref-earth-bar-stats');
  const crosshairEl = document.getElementById('ref-earth-crosshair');
  const pillEl = document.getElementById('ref-earth-pill');
  const btnAddPoint = document.getElementById('btn-ref-add-point');
  const btnSave = document.getElementById('btn-ref-save');
  const btnLocate = document.getElementById('btn-ref-locate');
  const btnClear = document.getElementById('btn-ref-clear');
  const btnLayers = document.getElementById('btn-ref-toggle-layers');
  const inputNombre = document.getElementById('ref-nombre');

  const initial = (await loadPuntoReferencia().catch(() => null)) || window._empresaPuntoRef || null;
  const startLat = initial ? initial.lat : 14.08572;
  const startLng = initial ? initial.lng : -86.17865;

  let refPoint = initial ? { nombre: initial.nombre || '', lat: initial.lat, lng: initial.lng } : null;
  let marker = null;
  let isEditingPoint = !initial;

  function syncRefEditModeUI() {
    if (crosshairEl) {
      crosshairEl.style.display = isEditingPoint ? 'flex' : 'none';
    }
    if (pillEl) {
      pillEl.textContent = refPoint ? 'Mueve el mapa para mover el punto' : 'Ubica el punto de referencia';
    }
    if (btnAddPoint) {
      if (!isEditingPoint && refPoint) {
        btnAddPoint.innerHTML = '<span class="material-icons" style="font-size:20px;">edit_location_alt</span> Cambiar punto de referencia';
      } else {
        btnAddPoint.innerHTML = '<span class="material-icons" style="font-size:20px;">add_location_alt</span> Marcar punto';
      }
    }
  }
  syncRefEditModeUI();

  if (initial) {
    if (openTitleEl) openTitleEl.textContent = initial.nombre || 'Finca';
    if (openStatusEl) openStatusEl.textContent = 'Toca para cambiar la ubicación';
  } else {
    if (openTitleEl) openTitleEl.textContent = 'Abrir mapa satelital';
    if (openStatusEl) openStatusEl.textContent = 'Toca para marcar el punto de referencia de la finca';
  }

  if (inputNombre && initial?.nombre) {
    inputNombre.value = initial.nombre;
    inputNombre.closest('.m3-field')?.classList.add('has-value');
  }

  function escapeHtml(str) {
    return String(str || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  const map = L.map(mapEl, {
    center: [startLat, startLng],
    zoom: initial ? 16 : 15,
    maxZoom: 21,
    minZoom: 3,
    zoomControl: false,
    attributionControl: false
  });
  L.control.attribution({ position: 'bottomleft', prefix: false }).addTo(map);

  const esriSatLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
    attribution: 'Tiles &copy; Esri',
    maxZoom: 21,
    maxNativeZoom: 17
  });

  const googleSatLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    attribution: 'Imagery &copy; Google',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    maxZoom: 21,
    maxNativeZoom: 20
  }).addTo(map);

  const googleHybridLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    attribution: 'Imagery &copy; Google',
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    maxZoom: 21,
    maxNativeZoom: 20
  });

  const refPolygonsGroup = L.featureGroup().addTo(map);
  const loadedParcels = [];

  // Dibujar lotes y potreros existentes como contexto en el mapa satelital
  (async () => {
    try {
      const [lotesRes, potrerosRes] = await Promise.all([
        supabase.from('lotes').select('id,nombre,coordenadas_json,coordenadas'),
        supabase.from('potreros').select('id,nombre,coordenadas_json,coordenadas')
      ]);
      const addPolyList = (rows, kind, defaultColor) => {
        (rows || []).forEach(r => {
          const coords = parseCoordsConfig(r.coordenadas_json || r.coordenadas);
          if (!coords || coords.length < 3) return;
          const latlngs = coords.map(c => [c.lat, c.lng]);
          const poly = L.polygon(latlngs, {
            color: defaultColor,
            weight: 2,
            dashArray: '6 4',
            fillColor: defaultColor,
            fillOpacity: 0.16,
            interactive: false
          }).addTo(refPolygonsGroup);
          const c = poly.getBounds().getCenter();
          loadedParcels.push({
            id: `${kind}-${r.id}`,
            kind,
            name: r.nombre || kind,
            lat: c.lat,
            lng: c.lng,
            icon: kind === 'Lote' ? 'eco' : 'fence'
          });
        });
      };
      addPolyList(lotesRes.data, 'Lote', '#fbbc04');
      addPolyList(potrerosRes.data, 'Potrero', '#4fc3f7');
      if (!initial && refPolygonsGroup.getLayers().length > 0) {
        map.fitBounds(refPolygonsGroup.getBounds().pad(0.15), { maxZoom: 17 });
      }
    } catch {}
  })();

  const bottomActions = document.getElementById('ref-map-bottom-actions');
  if (bottomActions && window.L?.DomEvent) L.DomEvent.disableClickPropagation(bottomActions);
  const searchToggle = document.getElementById('ref-map-search-toggle');
  if (searchToggle && window.L?.DomEvent) L.DomEvent.disableClickPropagation(searchToggle);

  let layerMode = 0;
  if (btnLayers) {
    btnLayers.addEventListener('click', () => {
      layerMode = (layerMode + 1) % 3;
      map.removeLayer(googleSatLayer);
      map.removeLayer(googleHybridLayer);
      map.removeLayer(esriSatLayer);
      if (layerMode === 0) {
        map.addLayer(googleSatLayer);
        window.Snackbar?.show('Capa: Google Earth', { duration: 1500 });
      } else if (layerMode === 1) {
        map.addLayer(googleHybridLayer);
        window.Snackbar?.show('Capa: Google Híbrido', { duration: 1500 });
      } else {
        map.addLayer(esriSatLayer);
        window.Snackbar?.show('Capa: Esri Satélite', { duration: 1500 });
      }
      refPolygonsGroup.bringToFront();
    });
  }

  function updateCoordsAndScale() {
    const c = map.getCenter();
    const coordsText = document.getElementById('ref-coords-text');
    if (coordsText) {
      coordsText.textContent = `${c.lat.toFixed(6)}°N ${Math.abs(c.lng).toFixed(6)}°W`;
    }
    const z = Math.round(map.getZoom());
    const scales = { 10: '4 km', 11: '2 km', 12: '1 km', 13: '500 m', 14: '200 m', 15: '100 m', 16: '50 m', 17: '20 m', 18: '10 m', 19: '5 m', 20: '2 m' };
    const scaleText = document.getElementById('ref-scale-text');
    if (scaleText) scaleText.textContent = scales[z] || '100 m';
  }
  map.on('move', () => {
    updateCoordsAndScale();
    if (isEditingPoint && marker) {
      const c = map.getCenter();
      marker.setLatLng(c);
      const nm = (inputNombre?.value || '').trim() || refPoint?.nombre || '';
      refPoint = { nombre: nm, lat: c.lat, lng: c.lng };
      if (barStatsEl) barStatsEl.textContent = `${c.lat.toFixed(5)}, ${c.lng.toFixed(5)}`;
    }
  });
  map.on('zoomend', updateCoordsAndScale);

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
        if (!ref) ref = map.getCenter();
        full = OpenLocationCode.recoverNearest(pc.code, ref.lat, ref.lng);
      } else {
        full = pc.code;
      }
      if (!OpenLocationCode.isFull(full)) return null;
      const d = OpenLocationCode.decode(full);
      const center = L.latLng(d.latitudeCenter, d.longitudeCenter);
      const bbox = L.latLngBounds(L.latLng(d.latitudeLo, d.longitudeLo), L.latLng(d.latitudeHi, d.longitudeHi));
      return { name: 'Plus Code: ' + pc.code, center, bbox };
    } catch { return null; }
  }

  const geoCache = new Map();
  let geoQueue = Promise.resolve();
  function geocodeXYZ(query) {
    if (geoCache.has(query)) return Promise.resolve(geoCache.get(query));
    const run = () => fetch('https://geocode.xyz/' + encodeURIComponent(query) + '?json=1')
      .then(r => r.json())
      .then(data => {
        if (data && data.error) return [];
        if (JSON.stringify(data).includes('Throttled')) return null;
        const lat = parseFloat(data?.latt);
        const lng = parseFloat(data?.longt);
        if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
        const std = data.standard || {};
        const name = [std.city, std.prov, std.countryname].filter(Boolean).join(', ') || query;
        const center = L.latLng(lat, lng);
        return [{ name, center, bbox: center.toBounds(20000) }];
      })
      .catch(() => null);
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
    const center = L.Control.Geocoder.parseLatLng(query);
    if (center) {
      cb.call(ctx, [{ name: query, center, bbox: center.toBounds(10000) }]);
      return;
    }
    if (extractPlusCode(query)) {
      plusCodeResult(query).then(res => {
        if (res) cb.call(ctx, [res]);
        else runNominatim(query, cb, ctx, allowFallback);
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

  searchGeocoder.geocode = (q, cb, ctx) => searchFor(q, cb, ctx, true);
  searchGeocoder.suggest = (q, cb, ctx) => searchFor(q, cb, ctx, false);

  let currentRefSearchQuery = '';
  initM3FullScreenSearch({
    moduleKey: 'ref_map',
    toggleId: 'ref-map-search-toggle',
    inputId: 'ref-map-search-input',
    clearId: 'ref-map-search-clear',
    placeholder: 'Buscar lugar, aldea, finca, coordenadas o plus code...',
    ariaLabel: 'Buscar punto de referencia en mapa',
    suggestedTitle: 'Lotes y potreros de la finca',
    emptyLabel: 'lugares',
    getQuery: () => currentRefSearchQuery,
    setQuery: (v) => { currentRefSearchQuery = (v || '').trim(); },
    onApplySearch: (v) => {
      const q = (v || '').trim();
      if (!q) return;
      searchGeocoder.geocode(q, (results) => {
        if (results && results.length > 0) {
          const gc = results[0];
          if (gc.bbox) map.fitBounds(gc.bbox, { padding: [40, 40], maxZoom: 17 });
          else if (gc.center) map.setView(gc.center, 17);
          if (gc.center) setMarker(gc.center.lat, gc.center.lng, gc.name || '');
        } else {
          window.Snackbar?.show('No se encontró el lugar. Probá con coordenadas o Plus Code (ej. 3RPC+5C)', { duration: 3000 });
        }
      });
    },
    loadItems: async () => loadedParcels,
    getQuickChips: () => [
      { label: 'Lotes', type: 'query', value: 'lote', icon: 'eco' },
      { label: 'Potreros', type: 'query', value: 'potrero', icon: 'fence' }
    ],
    filterItems: (items, qLower) => items.filter(it =>
      (it.name || '').toLowerCase().includes(qLower) ||
      (it.kind || '').toLowerCase().includes(qLower)
    ),
    renderItem: (it) => `
      <div class="m3-search-item m3-contained-item" data-lat="${it.lat}" data-lng="${it.lng}" role="option" tabindex="0" style="cursor:pointer;">
        <span class="material-icons m3-search-item-leading">${it.icon || 'place'}</span>
        <div class="m3-search-item-body">
          <div style="font-size:11px;font-weight:700;color:var(--m3-primary);text-transform:uppercase;">${escapeSearchHtml(it.kind)}</div>
          <span class="m3-search-item-title">${escapeSearchHtml(it.name)}</span>
        </div>
      </div>
    `,
    itemSelector: '.m3-search-item[data-lat]',
    getItemTitle: (el) => el.querySelector('.m3-search-item-title')?.textContent?.trim() || '',
    onItemClick: (el) => {
      const lat = parseFloat(el.dataset.lat);
      const lng = parseFloat(el.dataset.lng);
      if (!isNaN(lat) && !isNaN(lng)) {
        map.setView([lat, lng], 17);
      }
    }
  });
  const ensureRefSearchTop = () => {
    const overlay = document.getElementById('ref_map-fullscreen-search');
    if (overlay) overlay.style.zIndex = '10100';
  };
  ensureRefSearchTop();
  searchToggle?.addEventListener('click', () => setTimeout(ensureRefSearchTop, 0));

  function makeRefIcon(nombre) {
    return L.divIcon({
      className: 'ref-pin-icon',
      html: `<div style="display:flex;flex-direction:column;align-items:center;pointer-events:auto;cursor:grab;transform:translate(-50%,-100%);">
        <div style="width:32px;height:32px;border-radius:50% 50% 50% 0;transform:rotate(-45deg);background:#d93025;border:2.5px solid #ffffff;box-shadow:0 4px 10px rgba(0,0,0,0.38);display:flex;align-items:center;justify-content:center;">
          <span class="material-symbols-outlined" style="transform:rotate(45deg);color:#ffffff;font-size:17px;">home</span>
        </div>
        <div style="width:8px;height:4px;border-radius:50%;background:rgba(0,0,0,0.35);margin-top:2px;"></div>
        <span style="margin-top:3px;background:rgba(255,255,255,0.96);color:#1e3e2b;border:1.5px solid #2d3e2c;font-size:11px;font-weight:800;padding:2px 9px;border-radius:999px;white-space:nowrap;box-shadow:0 3px 8px rgba(0,0,0,0.28);letter-spacing:0.1px;">${escapeHtml(nombre || 'Finca')}</span>
      </div>`,
      iconSize: [0, 0],
      iconAnchor: [0, 0]
    });
  }

  function updateLabel(nombre) {
    if (!marker) return;
    marker.setIcon(makeRefIcon(nombre));
  }

  function attachMarkerHandlers(m) {
    m.on('drag', () => {
      const p = m.getLatLng();
      if (barStatsEl) barStatsEl.textContent = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
    });
    m.on('dragend', () => {
      const p = m.getLatLng();
      const nm = (inputNombre?.value || '').trim() || refPoint?.nombre || '';
      refPoint = { nombre: nm, lat: p.lat, lng: p.lng };
      if (barStatsEl) barStatsEl.textContent = `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`;
      updateLabel(nm);
      isEditingPoint = false;
      syncRefEditModeUI();
    });
    m.on('click', (e) => {
      if (window.L?.DomEvent) L.DomEvent.stopPropagation(e);
      isEditingPoint = true;
      syncRefEditModeUI();
      map.setView(m.getLatLng(), map.getZoom(), { animate: false });
      window.Snackbar?.show('Mueve el mapa o arrastra el pin para reubicarlo', { duration: 1800 });
    });
  }

  function setMarker(lat, lng, nombre) {
    const typedNombre = (inputNombre?.value || '').trim();
    const nombreFinal = typedNombre || ((typeof nombre === 'string' && nombre.trim()) ? nombre.trim() : refPoint?.nombre || '');
    if (marker) map.removeLayer(marker);
    marker = L.marker([lat, lng], { draggable: true, icon: makeRefIcon(nombreFinal) }).addTo(map);
    attachMarkerHandlers(marker);
    refPoint = { nombre: nombreFinal, lat, lng };
    if (inputNombre && !inputNombre.value.trim() && nombreFinal) {
      inputNombre.value = nombreFinal;
      inputNombre.closest('.m3-field')?.classList.add('has-value');
    }
    if (btnClear) {
      btnClear.style.opacity = '1';
      btnClear.style.pointerEvents = 'auto';
    }
    if (barStatsEl) barStatsEl.textContent = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    isEditingPoint = false;
    syncRefEditModeUI();
  }

  if (initial) {
    marker = L.marker([startLat, startLng], { draggable: true, icon: makeRefIcon(initial.nombre || 'Finca') }).addTo(map);
    attachMarkerHandlers(marker);
  }

  inputNombre?.addEventListener('input', () => {
    inputNombre.closest('.m3-field')?.classList.toggle('has-value', Boolean(inputNombre.value));
    updateLabel(inputNombre.value.trim() || 'Finca');
  });

  // Tap en mapa (en modo edición) o botón "Cambiar punto de referencia" / "Marcar punto"
  map.on('click', (e) => {
    if (!isEditingPoint) return;
    setMarker(e.latlng.lat, e.latlng.lng);
    map.panTo(e.latlng);
  });
  btnAddPoint?.addEventListener('click', () => {
    if (!isEditingPoint && refPoint) {
      isEditingPoint = true;
      syncRefEditModeUI();
      window.Snackbar?.show('Mueve el mapa o arrastra el pin y toca Marcar punto', { duration: 2000 });
      return;
    }
    const c = map.getCenter();
    setMarker(c.lat, c.lng);
    window.Snackbar?.show('Punto ubicado en la mira', { duration: 1400 });
  });

  function openRefMapSheet() {
    if (!sheet) return;
    isRefMapOpen = true;
    isEditingPoint = !refPoint;
    syncRefEditModeUI();
    sheet.style.visibility = 'visible';
    sheet.style.pointerEvents = 'auto';
    sheet.style.opacity = '1';
    if (window.history.state?.configOverlay !== 'ref-map') {
      window.history.pushState({ configOverlay: 'ref-map' }, '', '#configuracion');
    }
    setTimeout(() => {
      map.invalidateSize();
      if (refPoint) {
        map.setView([refPoint.lat, refPoint.lng], 16);
      } else if (refPolygonsGroup.getLayers().length > 0) {
        map.fitBounds(refPolygonsGroup.getBounds().pad(0.15), { maxZoom: 17 });
      }
      updateCoordsAndScale();
    }, 120);
  }

  function closeRefMapSheet(fromPopState = false) {
    if (!sheet) return;
    const wasOpen = isRefMapOpen;
    if (!wasOpen && sheet.style.visibility === 'hidden') return;
    isRefMapOpen = false;
    sheet.style.opacity = '0';
    sheet.style.pointerEvents = 'none';
    setTimeout(() => {
      if (!isRefMapOpen) sheet.style.visibility = 'hidden';
    }, 220);
    if (wasOpen && !fromPopState && window.history.state?.configOverlay === 'ref-map') {
      window.history.back();
    }
  }
  closeRefMapSheetFn = closeRefMapSheet;

  btnOpen?.addEventListener('click', openRefMapSheet);
  btnClose?.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeRefMapSheet(false);
  });

  btnLocate?.addEventListener('click', () => {
    if (!navigator.geolocation) {
      window.Snackbar?.show('Tu navegador no soporta geolocalización', 'error');
      return;
    }
    btnLocate.disabled = true;
    window.Snackbar?.show('Buscando ubicación...', { duration: 1800 });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        btnLocate.disabled = false;
        map.setView([pos.coords.latitude, pos.coords.longitude], 17, { animate: true });
        setMarker(pos.coords.latitude, pos.coords.longitude, 'Mi ubicación');
      },
      (err) => {
        btnLocate.disabled = false;
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
        btnClear.style.opacity = '0.4';
        btnClear.style.pointerEvents = 'none';
        if (barStatsEl) barStatsEl.textContent = 'Mueve el mapa y marca el punto';
        isEditingPoint = true;
        syncRefEditModeUI();
        if (openTitleEl) openTitleEl.textContent = 'Abrir mapa satelital';
        if (openStatusEl) openStatusEl.textContent = 'Toca para marcar el punto de referencia de la finca';
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
    if (!empresaId) {
      window.Snackbar?.show('Seleccioná una empresa primero', 'error');
      return;
    }
    // Si estaba editando o aún no hay punto, usa el centro de la mira
    if (!refPoint || isEditingPoint) {
      const c = map.getCenter();
      setMarker(c.lat, c.lng);
    }
    btnSave.disabled = true;
    btnSave.innerHTML = '<span class="material-icons animate-spin" style="font-size:18px;">sync</span> Guardando';
    try {
      const nombre = (inputNombre?.value || '').trim() || refPoint.nombre || 'Finca';
      await savePuntoReferencia(empresaId, { nombre, lat: refPoint.lat, lng: refPoint.lng });
      refPoint.nombre = nombre;
      updateLabel(nombre);
      if (openTitleEl) openTitleEl.textContent = nombre;
      if (openStatusEl) openStatusEl.textContent = 'Toca para cambiar la ubicación';
      if (barStatsEl) barStatsEl.textContent = `${refPoint.lat.toFixed(5)}, ${refPoint.lng.toFixed(5)}`;
      window.Snackbar?.show('Punto de referencia guardado');
      window.clearScreenCache?.('configuracion');
      closeRefMapSheet(false);
    } catch (e) {
      window.Snackbar?.show('Error al guardar: ' + e.message, 'error');
    }
    btnSave.disabled = false;
    btnSave.innerHTML = '<span class="material-icons" style="font-size:18px;">check</span> Listo';
  });

  updateCoordsAndScale();
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
    isWaConnected = true;
    const flowVisible = document.getElementById('wa-connect-flow')?.style.display !== 'none';
    if (isWaSheetOpen && flowVisible) {
      closeWaSheet(false);
    }
    const discArea = document.getElementById('wa-disconnected-area');
    if (discArea) discArea.style.display = 'block';
    const pairArea = document.getElementById('wa-pairing-code-area');
    if (pairArea) pairArea.style.display = 'none';
    if (config?.whatsapp_connected_by && config.whatsapp_connected_by !== currentUserId) {
      const shared = document.getElementById('wa-shared-info');
      if (shared) shared.style.display = 'block';
    }
    const disconnectBtn = document.getElementById('btn-wa-disconnect');
    if (disconnectBtn) {
      const canDisconnect = config?.whatsapp_connected_by === currentUserId || userRole === 'propietario';
      disconnectBtn.style.display = canDisconnect ? 'inline-flex' : 'none';
    }
    let groupName = localStorage.getItem('whatsapp_group_name');
    const savedJid = localStorage.getItem('whatsapp_group_jid') || config?.whatsapp_group_jid;
    if (!groupName && savedJid) {
      try {
        const groups = await listGroups();
        const match = groups.find(g => (g.remoteJid || g.id) === savedJid);
        if (match) {
          groupName = match.name || match.subject || 'Grupo';
          localStorage.setItem('whatsapp_group_jid', match.remoteJid || match.id);
          localStorage.setItem('whatsapp_group_name', groupName);
        }
      } catch {}
    }
    syncWaSheetAndCardUI();
  } else {
    isWaConnected = false;
    const discArea = document.getElementById('wa-disconnected-area');
    if (discArea) discArea.style.display = 'block';
    const shared = document.getElementById('wa-shared-info');
    if (shared) shared.style.display = 'none';
    syncWaSheetAndCardUI();
    switchWaTab('pairing');
  }
}
