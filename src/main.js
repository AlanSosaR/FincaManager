import './style.css';
import './components.css';
import './pickers.css';
import './detalle_motor.css';
import './snackbar.js';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

import { initSync, setSyncStatusCallback, isOnline, fullDownload, processSyncQueue } from './sync.js';
import db from './db.js';
import { isAuthenticated, loadEmpresaId, getUser, restFetch, getUserEmpresas, switchEmpresa } from './auth.js';

const syncIcon = document.getElementById('sync-icon');
const syncBadge = document.getElementById('sync-badge');
const notifDropdown = document.getElementById('notif-dropdown');
let notifs = [];
let notifOpen = false;

function addNotif(id, icon, title, desc, action) {
  notifs = notifs.filter(n => n.id !== id);
  notifs.unshift({ id, icon, title, desc, action, read: false });
  updateNotifUI();
}

function removeNotif(id) {
  notifs = notifs.filter(n => n.id !== id);
  updateNotifUI();
}

function updateNotifUI() {
  const unread = notifs.filter(n => !n.read).length;
  syncBadge.style.display = unread ? 'flex' : 'none';
  syncBadge.textContent = unread > 9 ? '9+' : unread;
  if (!notifOpen) return;
  if (!notifs.length) {
    notifDropdown.innerHTML = '<div style="padding:32px;text-align:center;color:#999;font-size:13px;">Sin notificaciones</div>';
    return;
  }
  notifDropdown.innerHTML = notifs.map(n => `
    <div style="display:flex;gap:12px;padding:12px 16px;cursor:pointer;transition:background .15s;align-items:flex-start;${n.read ? 'opacity:.6;' : ''}"
         onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='transparent'"
         onclick="(${n.action ? 'window.__notifAction(\'' + n.id + '\')' : ''})">
      <span class="material-icons" style="font-size:22px;color:var(--m3-primary,#2d3e2c);margin-top:2px;">${n.icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:14px;color:#2d3e2c;">${n.title}</div>
        <div style="font-size:13px;color:#2d3e2c;margin-top:2px;">${n.desc}</div>
        ${n.action ? `<button style="margin-top:8px;background:var(--m3-primary,#2d3e2c);color:#ffffff;border:none;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;">${n.action.label}</button>` : ''}
      </div>
    </div>
  `).join('');
}

window.__notifAction = (id) => {
  const n = notifs.find(x => x.id === id);
  if (n && n.action) n.action.handler();
};

function toggleNotif() {
  notifOpen = !notifOpen;
  notifDropdown.style.display = notifOpen ? 'block' : 'none';
  if (notifOpen) {
    notifs.forEach(n => n.read = true);
    updateNotifUI();
  }
}

document.addEventListener('click', (e) => {
  if (!e.target.closest('#sync-status-area')) {
    notifOpen = false;
    notifDropdown.style.display = 'none';
  }
});

function updateSyncUI(state) {
  if (!syncIcon || !syncBadge) return;
  if (state === 'syncing') {
    syncIcon.textContent = 'sync';
    syncIcon.classList.add('animate-spin');
  } else if (state === 'done') {
    syncIcon.textContent = 'notifications';
    syncIcon.classList.remove('animate-spin');
  } else if (state === 'offline') {
    syncIcon.textContent = 'cloud_off';
    syncIcon.classList.remove('animate-spin');
  } else {
    syncIcon.textContent = 'notifications';
    syncIcon.classList.remove('animate-spin');
  }
}

const container = document.getElementById('screen-container');
let syncStarted = false;

function showDownloadBanner(msg, progress) {
  if (!container) return;
  if (msg === null) {
    container.innerHTML = `
      <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;padding:32px;text-align:center;">
        <span class="material-icons" style="font-size:56px;color:var(--m3-primary,#2d3e2c);margin-bottom:16px;">check_circle</span>
        <h2 style="font-size:24px;font-weight:800;font-family:'Manrope',sans-serif;color:#2d3e2c;margin-bottom:8px;">Todo listo</h2>
        <p style="color:#666;font-size:14px;max-width:360px;line-height:1.5;">Los datos se descargaron correctamente. Ya puedes usar la app sin conexión.</p>
      </div>
    `;
    return;
  }
  const bar = Math.round(progress || 0);
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;padding:32px;text-align:center;">
      <span class="material-icons animate-spin" style="font-size:48px;color:var(--m3-primary,#2d3e2c);margin-bottom:24px;">sync</span>
      <h2 style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;color:#1a1a1a;margin-bottom:8px;">${msg}</h2>
      <p style="color:#666;font-size:14px;max-width:320px;margin-bottom:24px;">Esto puede tomar unos segundos dependiendo de tu conexion.</p>
      <div style="width:100%;max-width:320px;height:8px;background:#e0e0e0;border-radius:4px;overflow:hidden;">
        <div style="width:${bar}%;height:100%;background:#2d3e2c;border-radius:4px;transition:width 0.3s ease;"></div>
      </div>
      <p style="color:#888;font-size:13px;margin-top:8px;">${bar}%</p>
    </div>
  `;
}

setSyncStatusCallback((msg, progress) => {
  if (msg && !syncStarted) {
    syncStarted = true;
    updateSyncUI('syncing');
    addNotif('download', 'sync', 'Descargando datos...', msg === 'Descargando datos...' ? 'Descargando datos para usar la app sin internet...' : msg);
    showDownloadBanner(msg, progress);
  } else if (msg && syncStarted) {
    showDownloadBanner(msg, progress);
  } else if (msg === null && syncStarted) {
    syncStarted = false;
    updateSyncUI('done');
    removeNotif('download');
    addNotif('download_ok', 'check_circle', 'Datos descargados', 'Ya puedes usar la app sin conexion.');
    localStorage.setItem('finca_sync_complete', 'true');
    window.clearScreenCache?.();
    showDownloadBanner(null, 100);
    setTimeout(() => window.navigateTo?.('dashboard'), 1500);
  }
});

function showInitialPrompt() {
  if (!container) return;
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;padding:32px;text-align:center;">
      <span class="material-icons" style="font-size:56px;color:var(--m3-primary,#2d3e2c);margin-bottom:16px;">cloud_download</span>
      <h2 style="font-size:24px;font-weight:800;font-family:'Manrope',sans-serif;color:#2d3e2c;margin-bottom:8px;">Descargar datos en local</h2>
      <p style="color:#2d3e2c;font-size:14px;max-width:360px;margin-bottom:24px;line-height:1.5;">
        Para usar la app sin necesidad de internet, descarga tus datos existentes en el dispositivo.
      </p>
      <button id="btn-start-download" style="background:var(--m3-primary,#2d3e2c);color:#ffffff;border:none;padding:14px 32px;border-radius:40px;font-size:16px;font-weight:700;cursor:pointer;box-shadow:0 4px 16px rgba(0,71,65,0.3);transition:transform .2s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
        <span class="material-icons" style="vertical-align:middle;margin-right:8px;">cloud_download</span>
        Descargar ahora
      </button>
    </div>
  `;
  document.getElementById('btn-start-download')?.addEventListener('click', () => {
    fullDownload();
    toggleNotif();
  });
}

async function initApp() {
  if (!isAuthenticated()) {
    document.addEventListener('DOMContentLoaded', () => {
      window.navigateTo?.('login');
    }, { once: true });
    return;
  }

  loadEmpresaId();

  if (!window._currentEmpresaId) {
    try {
      const user = await getUser();
      if (user?.id) {
        const data = await restFetch(`/rest/v1/usuario_empresas?usuario_id=eq.${encodeURIComponent(user.id)}&select=empresa_id`);
        if (data && data.length > 0) {
          localStorage.setItem('current_empresa_id', data[0].empresa_id);
          loadEmpresaId();
        }
      }
    } catch (e) {
      console.warn('empresa recovery failed:', e);
    }
  }

  await updateSidebarEmpresaName();
  await initEmpresaSelector();

  if (isOnline()) {
    const syncComplete = localStorage.getItem('finca_sync_complete');
    if (!syncComplete) {
      addNotif('download', 'cloud_download', 'Descargar datos en local', 'Tus datos estan en la nube. Descargalos para usar la app sin internet.', {
        label: 'Descargar ahora',
        handler: () => { fullDownload(); toggleNotif(); }
      });
      showInitialPrompt();
    } else {
      initSync();
    }
    initOnlineSync();
  } else {
    addNotif('offline', 'cloud_off', 'Sin conexion', 'No hay internet. Los datos locales estan disponibles.');
    updateSyncUI('offline');
  }
}
initApp();

// ─── Empresa selector & sidebar name ─────────────────────────────────────────

let _empresaList = [];

async function updateSidebarEmpresaName() {
  const el = document.getElementById('sidebar-empresa-name');
  if (!el) return;
  const empresaId = window._currentEmpresaId;
  if (!empresaId) { el.textContent = ''; return; }
  try {
    const emp = await db.empresas?.get(empresaId);
    if (emp?.nombre) { el.textContent = emp.nombre; return; }
  } catch {}
  const found = _empresaList.find(e => e.id === empresaId);
  if (found) { el.textContent = found.nombre; return; }
  try {
    const data = await restFetch(`/rest/v1/empresas?id=eq.${encodeURIComponent(empresaId)}&select=nombre`);
    if (data?.[0]?.nombre) { el.textContent = data[0].nombre; return; }
  } catch {}
  el.textContent = '';
}

window.__empresaNombreChanged = function() {
  updateSidebarEmpresaName();
};

async function initEmpresaSelector() {
  const selector = document.getElementById('empresa-selector');
  const nameEl = document.getElementById('empresa-selector-name');
  if (!selector || !nameEl) return;

  try {
    const empresas = await getUserEmpresas();
    _empresaList = empresas;

    if (empresas.length <= 1) {
      selector.style.display = 'none';
      return;
    }

    const current = empresas.find(e => e.id === window._currentEmpresaId);
    nameEl.textContent = current?.nombre || 'Seleccionar empresa';
    selector.style.display = 'inline-flex';
    await updateSidebarEmpresaName();
  } catch (e) {
    console.warn('initEmpresaSelector error:', e);
    selector.style.display = 'none';
  }
}

window.openEmpresaSwitcher = function() {
  if (!_empresaList.length) return;
  const overlay = document.getElementById('modal-container');
  const body = document.getElementById('modal-body');
  overlay.style.display = 'flex';
  body.innerHTML = `
    <div class="m3-card" style="padding:24px;max-width:360px;width:100%;">
      <h3 class="m3-title-medium m3-font-bold" style="color:#2d3e2c;margin-bottom:16px;">Seleccionar empresa</h3>
      <div style="display:flex;flex-direction:column;gap:8px;">
        ${_empresaList.map(e => `
          <button class="empresa-switch-btn" data-id="${e.id}" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px 16px;border-radius:16px;background:${e.id === window._currentEmpresaId ? '#2d3e2c' : 'var(--m3-surface-container-low)'};color:${e.id === window._currentEmpresaId ? '#fff' : '#2d3e2c'};border:none;font-weight:600;font-size:14px;cursor:pointer;text-align:left;transition:background .15s;font-family:'Work Sans',sans-serif;"
            onmouseover="this.style.background='${e.id === window._currentEmpresaId ? '#3a5240' : '#e8e6dd'}'" onmouseout="this.style.background='${e.id === window._currentEmpresaId ? '#2d3e2c' : 'var(--m3-surface-container-low)'}'">
            <span class="material-icons" style="font-size:20px;">${e.id === window._currentEmpresaId ? 'check_circle' : 'business'}</span>
            <span style="flex:1;">${e.nombre}</span>
            <span style="font-size:11px;opacity:.7;text-transform:capitalize;">${e.rol}</span>
          </button>
        `).join('')}
      </div>
      <button onclick="document.getElementById('modal-container').style.display='none'" style="display:block;width:100%;margin-top:16px;padding:12px;border-radius:12px;background:transparent;border:none;color:#888;font-size:13px;cursor:pointer;">Cancelar</button>
    </div>
  `;
  overlay.onclick = (e) => { if (e.target === overlay) overlay.style.display = 'none'; };

  body.querySelectorAll('.empresa-switch-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      if (id === window._currentEmpresaId) {
        overlay.style.display = 'none';
        return;
      }
      overlay.style.display = 'none';
      const nameEl = document.getElementById('empresa-selector-name');
      if (nameEl) nameEl.textContent = btn.querySelector('span:last-child')?.textContent || '...';
      document.getElementById('sidebar-empresa-name').textContent = _empresaList.find(e => e.id === id)?.nombre || '';
      await switchEmpresa(id);
    });
  });
};

syncIcon?.addEventListener('click', toggleNotif);

// ─── Sync infrastructure (registered immediately, always) ────────────────────

window.__syncPending = () => {
  if (navigator.onLine) {
    setTimeout(processSyncQueue, 500);
  }
};

syncIcon?.addEventListener('click', toggleNotif);

function initOnlineSync() {
  window.addEventListener('online', () => {
    if (!isAuthenticated()) return;
    updateSyncUI('syncing');
    setTimeout(async () => {
      try {
        await processSyncQueue();
        await fullDownload();
        window.clearScreenCache?.();
      } catch (e) {
        console.warn('online sync error:', e);
      }
      updateSyncUI('done');
    }, 500);
  });

  let queueCheckInterval;
  async function updateQueueBadge() {
    try {
      const count = await db._sync_queue.count();
      if (count > 0) {
        syncBadge.style.display = 'flex';
        syncBadge.textContent = count > 9 ? '9+' : count;
        syncIcon.textContent = 'sync';
      }
    } catch (e) { /* ignore */ }
  }
  if (isOnline()) {
    updateQueueBadge();
    queueCheckInterval = setInterval(updateQueueBadge, 10000);
    setInterval(async () => {
      if (navigator.onLine) {
        try {
          await fullDownload();
          window.clearScreenCache?.();
        } catch (e) { /* silent */ }
      }
    }, 300000);
  }
}

// ─── Screen imports ──────────────────────────────────────────────────────────

import { renderDashboard } from './screens/dashboard.js';
import { renderMotores, initMotores } from './screens/motores.js';
import { renderHerramientas, initHerramientas } from './screens/herramientas.js';
import { renderGanado, initGanado } from './screens/ganado.js';
import { renderPotreros, initPotreros } from './screens/potreros.js';
import { renderDetalleMotor } from './screens/detalle_motor.js';
import { renderDetallePotrero, initDetallePotrero } from './screens/detalle_potrero.js';
import { renderDetalleAnimal, initDetalleAnimal } from './screens/detalle_animal.jsx';
import { renderDetalleHerramienta } from './screens/detalle_herramienta.js';
import { renderNuevoMotor, initNuevoMotor } from './screens/nuevo_motor.js';
import { renderNuevoAnimal, initNuevoAnimal } from './screens/nuevo_animal.js';
import { renderNuevoPotrero, initNuevoPotrero } from './screens/nuevo_potrero.js';
import { renderNuevoLote, setupNuevoLoteListeners } from './screens/nuevo_lote.js';
import { renderDetalleLote, initDetalleLote } from './screens/detalle_lote.js';
import { renderNuevaActividad, initNuevaActividad } from './screens/nueva_actividad.js';
import { renderNuevoPersonal, initNuevoPersonal } from './screens/nuevo_personal.js';
import { renderDetallePersonal, initDetallePersonal } from './screens/detalle_personal.js';
import { renderListaPersonal, initListaPersonal } from './screens/lista_personal.js';
import { renderLogin, initLogin } from './screens/login.js';
import { renderRegister, initRegister } from './screens/register.js';
import { renderPerfil, initPerfil } from './screens/perfil.js';
import { renderConfiguracion, initConfiguracion } from './screens/configuracion.js';
import { renderAceptarInvitacion } from './screens/aceptar_invitacion.js';
import { showModal } from './modals.js';

const screens = {
    dashboard: { title: 'Dashboard Cafetal', render: renderDashboard },
    motores: { title: 'Lista de Motores', render: renderMotores },
    herramientas: { title: 'Inventario de Herramientas', render: renderHerramientas },
    ganado: { title: 'Gestion de Ganado', render: renderGanado },
    potreros: { title: 'Control de Potreros', render: renderPotreros },
    personal: { title: 'Personal', render: renderListaPersonal },
    detalle_motor: { title: 'Detalle de Motor', backTo: 'motores', render: renderDetalleMotor },
    detalle_potrero: { title: 'Detalle de Potrero', backTo: 'potreros', render: renderDetallePotrero },
    detalle_animal: { title: 'Detalle de Animal', backTo: 'ganado', render: renderDetalleAnimal },
    detalle_herramienta: { title: 'Detalle de Tool', backTo: 'herramientas', render: renderDetalleHerramienta },
    nuevo_motor: { title: 'Agregar Nuevo Equipo', backTo: 'motores', render: renderNuevoMotor },
    nuevo_animal: { title: 'Registrar Animal', backTo: 'ganado', render: renderNuevoAnimal },
    nuevo_potrero: { title: 'Nuevo Potrero', backTo: 'potreros', render: renderNuevoPotrero },
    nuevo_lote:    { title: 'Nuevo Lote de Cafetal', backTo: 'dashboard', render: (id) => renderNuevoLote(id) },
    detalle_lote:  { title: 'Detalle de Lote', backTo: 'dashboard', render: renderDetalleLote },
    nueva_actividad: { 
        title: 'Nueva Actividad', 
        backTo: (...args) => args[0] ? ['detalle_lote', args[0]] : 'dashboard',
        highlight: 'dashboard',
        render: renderNuevaActividad 
    },
    nuevo_personal: { title: 'Nuevo Personal', backTo: 'personal', highlight: 'personal', render: renderNuevoPersonal },
    detalle_personal: { title: 'Detalle de Personal', backTo: 'personal', render: renderDetallePersonal },
    login: { title: 'Iniciar Sesión', render: renderLogin, noAuth: true },
    register: { title: 'Crear Cuenta', render: renderRegister, noAuth: true },
    perfil: { title: 'Mi Perfil', render: renderPerfil },
    configuracion: { title: 'Configuración', render: renderConfiguracion },
    aceptar_invitacion: { title: 'Invitación', render: renderAceptarInvitacion, noAuth: true },
};

window.navigateTo = function(screenId, ...args) {
    const event = new CustomEvent('navigate', { detail: { screenId, args } });
    document.dispatchEvent(event);
};

document.addEventListener('DOMContentLoaded', () => {
    const titleElement = document.getElementById('current-screen-title');

    const viewCache = new Map();
    const NO_CACHE = new Set(['ganado','nuevo_motor','nuevo_animal','nuevo_potrero',
                               'detalle_motor','detalle_animal','detalle_potrero',
                               'detalle_herramienta','nuevo_lote','detalle_lote',
                               'nueva_actividad','nuevo_personal','detalle_personal','personal']);

    window.clearScreenCache = (screenId) => {
      if (!screenId) { viewCache.clear(); return; }
      for (const key of viewCache.keys()) {
        if (key === screenId || key.startsWith(screenId + '/')) {
          viewCache.delete(key);
        }
      }
    };

    function cacheKey(screenId, args) {
        return screenId + (args.length ? '/' + args.join('/') : '');
    }

    async function renderAndInit(screenId, args, html) {
        if (window.__screenCleanup) {
            try { window.__screenCleanup(); } catch(e) { console.warn('Cleanup error:', e); }
            window.__screenCleanup = null;
        }
        container.innerHTML = html;
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        
        const screenCfg = screens[screenId];
        const highlightId = screenCfg?.highlight || (typeof screenCfg?.backTo === 'string' ? screenCfg.backTo : screenId);
        
        const activeLink = document.querySelector(`.nav-link[data-screen="${highlightId}"]`);
        if (activeLink) activeLink.classList.add('active');

        if (screenId === 'detalle_motor') {
            const { initDetalleMotor } = await import('./screens/detalle_motor.js');
            initDetalleMotor(...args);
        }
        if (screenId === 'nuevo_motor')  initNuevoMotor(...args);
        if (screenId === 'motores')      initMotores();
        if (screenId === 'herramientas') initHerramientas();
        if (screenId === 'ganado')       initGanado();
        if (screenId === 'personal')     initListaPersonal();
        if (screenId === 'nuevo_animal') initNuevoAnimal(...args);
        if (screenId === 'detalle_animal') initDetalleAnimal(...args);
        if (screenId === 'nuevo_potrero')  initNuevoPotrero(...args);
        if (screenId === 'potreros')     initPotreros();
        if (screenId === 'detalle_potrero') initDetallePotrero(...args);
        if (screenId === 'detalle_herramienta') {
            const { initDetalleHerramienta } = await import('./screens/detalle_herramienta.js');
            initDetalleHerramienta(...args);
        }
        if (screenId === 'nuevo_lote') setupNuevoLoteListeners();
        if (screenId === 'detalle_lote') initDetalleLote(...args);
        if (screenId === 'nueva_actividad') initNuevaActividad(...args);
        if (screenId === 'nuevo_personal') initNuevoPersonal(...args);
        if (screenId === 'detalle_personal') initDetallePersonal(...args);
        if (screenId === 'login')    initLogin();
        if (screenId === 'register') initRegister();
        if (screenId === 'perfil')   initPerfil();
        if (screenId === 'configuracion') initConfiguracion();
    }

    const DETAIL_SCREENS = new Set(['detalle_motor','detalle_animal','detalle_potrero','detalle_herramienta','detalle_lote','detalle_personal']);
    const FORM_SCREENS = new Set(['nuevo_motor','nuevo_animal','nuevo_potrero','nuevo_lote','nueva_actividad']);

    async function navigate(screenId, ...args) {
        if (DETAIL_SCREENS.has(screenId) && (!args || args.length === 0 || !args[0])) {
            const screenCfg = screens[screenId];
            if (screenCfg && screenCfg.backTo) {
                const backTarget = typeof screenCfg.backTo === 'function' ? screenCfg.backTo(...args) : screenCfg.backTo;
                return navigate(...(Array.isArray(backTarget) ? backTarget : [backTarget]));
            }
            return navigate('dashboard');
        }
        if (FORM_SCREENS.has(screenId) && args.length > 0 && !args[0]) {
            const screenCfg = screens[screenId];
            if (screenCfg && screenCfg.backTo) {
                const backTarget = typeof screenCfg.backTo === 'function' ? screenCfg.backTo(...args) : screenCfg.backTo;
                return navigate(...(Array.isArray(backTarget) ? backTarget : [backTarget]));
            }
            return navigate('dashboard');
        }

        const screen = screens[screenId] || screens.dashboard;

        if (screen.noAuth && isAuthenticated()) {
            if (screenId === 'register' && args.length > 0 && args[0]) {
                // Allow authenticated users with invite token
            } else {
                return navigate('dashboard');
            }
        }

        if (!screen.noAuth && !isAuthenticated()) {
            return navigate('login');
        }

        document.body.classList.toggle('screen-auth', !!screen.noAuth);

        if (screen.backTo) {
            const backTarget = typeof screen.backTo === 'function' ? screen.backTo(...args) : screen.backTo;
            const onClick = Array.isArray(backTarget) 
                ? backTarget.map(s => `'${s}'`).join(', ')
                : `'${backTarget}'`;
            const title = screenId === 'nuevo_animal' && args.length > 0 && args[0]
                ? 'Editar Animal'
                : screen.title;
            titleElement.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button onclick="window.navigateTo(${onClick})" style="background: transparent; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 4px; border-radius: 50%; color: #333; margin-left: -8px; transition: background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='transparent'" aria-label="Atras">
                        <span class="material-icons">arrow_back</span>
                    </button>
                    <span>${title}</span>
                </div>
            `;
        } else {
            titleElement.textContent = screen.title;
        }

        const key = cacheKey(screenId, args);
        const useCache = !NO_CACHE.has(screenId);

        if (useCache && viewCache.has(key)) {
            await renderAndInit(screenId, args, viewCache.get(key));
            screen.render(...args).then(freshHtml => {
                viewCache.set(key, freshHtml);
            }).catch(() => {});
        } else {
            try {
                const html = await screen.render(...args);
                if (useCache) viewCache.set(key, html);
                await renderAndInit(screenId, args, html);
            } catch (error) {
                console.error(error);
                container.innerHTML = `<div style="padding: 24px; color: red;">Error: ${error.message}</div>`;
            }
        }
        
        let newHash = screenId;
        if (args && args.length > 0) {
            newHash += '/' + args.map(a => encodeURIComponent(String(a))).join('/');
        }
        const href = window.location.href;
        const hashIdx = href.indexOf('#');
        const currentRawHash = hashIdx >= 0 ? href.slice(hashIdx + 1) : '';
        if (currentRawHash !== newHash) {
            window.location.hash = newHash;
        }
    }

    function getHashParts() {
        const href = window.location.href;
        const idx = href.indexOf('#');
        const raw = idx >= 0 ? href.slice(idx + 1) : '';
        const qIdx = raw.indexOf('?');
        if (qIdx >= 0) {
            const screenId = raw.slice(0, qIdx);
            const params = new URLSearchParams(raw.slice(qIdx));
            const token = params.get('token') || '';
            return [screenId, token];
        }
        return raw.split('/').map(decodeURIComponent);
    }

    window.addEventListener('hashchange', () => {
        const hashParams = getHashParts();
        const screenId = hashParams[0];
        const args = hashParams.slice(1);
        if (screenId && screens[screenId]) {
            navigate(screenId, ...args);
        }
    });

    document.addEventListener('navigate', (e) => {
        navigate(e.detail.screenId, ...(e.detail.args || []));
    });

    document.addEventListener('click', (e) => {
        const premiumCard = e.target.closest('.motor-card-premium[data-id]');
        if (premiumCard) {
            if (premiumCard.closest('.screen-motores')) {
                navigate('detalle_motor', premiumCard.dataset.id);
            } else if (premiumCard.closest('.screen-ganado')) {
                navigate('detalle_animal', premiumCard.dataset.id);
            }
        }

        const motorCard = e.target.closest('.motor-card[data-id]');
        if (motorCard) {
            navigate('detalle_motor', motorCard.dataset.id);
        }

        const potreroCard = e.target.closest('.potrero-card[data-id]');
        if (potreroCard) {
            navigate('detalle_potrero', potreroCard.dataset.id);
        }

        const animalCard = e.target.closest('.animal-card[data-id]');
        if (animalCard) {
            navigate('detalle_animal', animalCard.dataset.id);
        }

        const toolCard = e.target.closest('.tool-card[data-id]');
        if (toolCard) {
            navigate('detalle_herramienta', toolCard.dataset.id);
        }

        if (e.target.closest('#btn-add-motor')) {
            navigate('nuevo_motor');
        }
        if (e.target.closest('#btn-add-animal')) {
            navigate('nuevo_animal');
        }
    });

    const hashParams = getHashParts();
    const initialScreen = hashParams[0] || 'dashboard';
    const initArgs = hashParams.slice(1).filter(s => s !== '');
    navigate(initialScreen, ...initArgs);

    const menuToggle = document.getElementById('menu-toggle');
    const sidebarClose = document.getElementById('sidebar-close');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const sidebarCollapse = document.getElementById('sidebar-collapse');
    
    if (localStorage.getItem('sidebar-collapsed') === 'true') {
        sidebar.classList.add('collapsed');
    }

    function toggleSidebar() {
        const isOpen = sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('active', isOpen);
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
    }

    if (sidebarCollapse) {
        sidebarCollapse.addEventListener('click', () => {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            localStorage.setItem('sidebar-collapsed', isCollapsed);
        });
    }

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            toggleSidebar();
        });
    }

    if (sidebarClose) {
        sidebarClose.addEventListener('click', () => {
            closeSidebar();
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            closeSidebar();
        });
    }

    document.querySelectorAll('.nav-link').forEach(link => {
        let lastClick = 0;
        link.addEventListener('click', (e) => {
            const screenId = link.getAttribute('data-screen');
            const now = Date.now();
            
            if (now - lastClick < 350) {
                window.location.reload();
                return;
            }
            lastClick = now;

            if (screenId) {
                e.preventDefault();
                navigate(screenId);

                if (window.innerWidth <= 1024) {
                    closeSidebar();
                }
            }
        });
    });

    const mainContent = document.querySelector('.main-content');
    let touchStartY = 0;
    let pullThresholdReached = false;
    
    if (mainContent && !document.querySelector('.ptr-indicator')) {
        const indicator = document.createElement('div');
        indicator.className = 'ptr-indicator';
        indicator.innerHTML = '<div class="spinner"></div>';
        mainContent.appendChild(indicator);
    }

    if (mainContent) {
        const indicator = document.querySelector('.ptr-indicator');

        mainContent.addEventListener('touchstart', (e) => {
            if (mainContent.scrollTop <= 0) {
                touchStartY = e.touches[0].pageY;
                pullThresholdReached = false;
            } else {
                touchStartY = 0;
            }
        }, { passive: true });

        mainContent.addEventListener('touchmove', (e) => {
            if (touchStartY > 0) {
                const touchMoveY = e.touches[0].pageY;
                const delta = touchMoveY - touchStartY;
                if (delta > 280) {
                    pullThresholdReached = true;
                    if (indicator) indicator.classList.add('active');
                } else if (delta < 250) {
                    pullThresholdReached = false;
                    if (indicator) indicator.classList.remove('active');
                }
            }
        }, { passive: true });

        mainContent.addEventListener('touchend', () => {
            if (pullThresholdReached) {
                setTimeout(() => window.location.reload(), 200);
            } else {
              if (indicator) indicator.classList.remove('active');
            }
            touchStartY = 0;
            pullThresholdReached = false;
        });
    }

    let deferredPrompt;
    const installBtn = document.getElementById('pwa-install');

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        deferredPrompt = e;
        if (installBtn) {
            installBtn.style.display = 'flex';
        }
    });

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                installBtn.style.display = 'none';
            }
            deferredPrompt = null;
        });
    }

    window.addEventListener('appinstalled', () => {
        if (installBtn) installBtn.style.display = 'none';
    });

    window.addEventListener('unhandledrejection', (event) => {
        console.error('[ERROR] Promesa rechazada sin manejar:', event.reason);
    });
});
