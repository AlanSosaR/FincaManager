import './style.css';
import './components.css';
import './pickers.css';
import './detalle_motor.css';
import './snackbar.js';
import { registerSW } from 'virtual:pwa-register';

registerSW({ immediate: true });

import { initSync, setSyncStatusCallback, isOnline, fullDownload } from './sync.js';

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
      <span class="material-icons" style="font-size:22px;color:var(--m3-primary,#2e7d32);margin-top:2px;">${n.icon}</span>
      <div style="flex:1;min-width:0;">
        <div style="font-weight:700;font-size:14px;color:#1a1a1a;">${n.title}</div>
        <div style="font-size:13px;color:#666;margin-top:2px;">${n.desc}</div>
        ${n.action ? `<button style="margin-top:8px;background:var(--m3-primary,#2e7d32);color:#fff;border:none;padding:6px 16px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;">${n.action.label}</button>` : ''}
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

function showDownloadBanner(msg) {
  if (!container) return;
  container.innerHTML = `
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:60vh;padding:32px;text-align:center;">
      <span class="material-icons animate-spin" style="font-size:48px;color:var(--m3-primary,#2e7d32);margin-bottom:24px;">sync</span>
      <h2 style="font-size:22px;font-weight:700;font-family:'Manrope',sans-serif;color:#1a1a1a;margin-bottom:8px;">${msg}</h2>
      <p style="color:#666;font-size:14px;max-width:320px;">Esto puede tomar unos segundos dependiendo de tu conexion.</p>
    </div>
  `;
}

setSyncStatusCallback((msg) => {
  if (msg && !syncStarted) {
    syncStarted = true;
    updateSyncUI('syncing');
    addNotif('download', 'sync', 'Descargando datos...', msg === 'Descargando datos...' ? 'Descargando datos para usar la app sin internet...' : msg);
    showDownloadBanner(msg);
  } else if (msg === null && syncStarted) {
    syncStarted = false;
    updateSyncUI('done');
    removeNotif('download');
    addNotif('download_ok', 'check_circle', 'Datos descargados', 'Ya puedes usar la app sin conexion.');
    localStorage.setItem('finca_sync_complete', 'true');
    const hashParams = window.location.hash.replace('#', '').split('/');
    const screen = hashParams[0] || 'dashboard';
    const args = hashParams.slice(1).filter(Boolean);
    window.navigateTo(screen, ...args);
  }
});

if (isOnline()) {
  const syncComplete = localStorage.getItem('finca_sync_complete');
  if (!syncComplete) {
    addNotif('download', 'cloud_download', 'Descargar datos en local', 'Tus datos estan en la nube. Descargalos para usar la app sin internet.', {
      label: 'Descargar ahora',
      handler: () => { fullDownload(); toggleNotif(); }
    });
  } else {
    initSync();
  }
} else {
  addNotif('offline', 'cloud_off', 'Sin conexion', 'No hay internet. Los datos locales estan disponibles.');
  updateSyncUI('offline');
}

syncIcon?.addEventListener('click', toggleNotif);

import { renderDashboard } from './screens/dashboard.js';
import { renderMotores, initMotores } from './screens/motores.js';
import { renderHerramientas, initHerramientas } from './screens/herramientas.js';
import { renderGanado, initGanado } from './screens/ganado.js';
import { renderPotreros, initPotreros } from './screens/potreros.js';
import { renderDetalleMotor } from './screens/detalle_motor.js';
import { renderDetallePotrero, initDetallePotrero } from './screens/detalle_potrero.js';
import { renderDetalleAnimal, initDetalleAnimal } from './screens/detalle_animal.js';
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
import { showModal } from './modals.js';
