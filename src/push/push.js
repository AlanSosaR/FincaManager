import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { restFetch, getUser, getSessionUserId } from '../auth.js';
import db from '../db.js';

const DEFAULT_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyA0u2DcfghFR1-gEzJcRpSb778jBFHjcEE',
  authDomain: 'finca-manager-d5e3e.firebaseapp.com',
  projectId: 'finca-manager-d5e3e',
  storageBucket: 'finca-manager-d5e3e.firebasestorage.app',
  messagingSenderId: '1096670243449',
  appId: '1:1096670243449:web:a0a7c5c7b84f18dcde02a8',
  measurementId: 'G-Q9BC6RMWJC',
  vapidKey: 'BFxdWd3AwT0KdcWKstBN7YdCepa4hCGnwSfChePmAeqlLPKzNZGPRy6mlsjRzFRMeVFYyx3pdEMV7-T8AWhKmAs',
};

let _cachedConfig = null;
let _messaging = null;
let _fgInitialized = false;

async function loadFirebaseConfig() {
  if (_cachedConfig) return _cachedConfig;

  // 1. Intentar leer variables VITE_FIREBASE_* (local .env) o usar configuración pública por defecto
  const envCfg = {
    apiKey: import.meta.env?.VITE_FIREBASE_API_KEY || DEFAULT_FIREBASE_CONFIG.apiKey,
    authDomain: import.meta.env?.VITE_FIREBASE_AUTH_DOMAIN || DEFAULT_FIREBASE_CONFIG.authDomain,
    projectId: import.meta.env?.VITE_FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_CONFIG.projectId,
    storageBucket: import.meta.env?.VITE_FIREBASE_STORAGE_BUCKET || DEFAULT_FIREBASE_CONFIG.storageBucket,
    messagingSenderId: import.meta.env?.VITE_FIREBASE_MESSAGING_SENDER_ID || DEFAULT_FIREBASE_CONFIG.messagingSenderId,
    appId: import.meta.env?.VITE_FIREBASE_APP_ID || DEFAULT_FIREBASE_CONFIG.appId,
    measurementId: import.meta.env?.VITE_FIREBASE_MEASUREMENT_ID || DEFAULT_FIREBASE_CONFIG.measurementId,
    vapidKey: import.meta.env?.VITE_FIREBASE_VAPID_KEY || DEFAULT_FIREBASE_CONFIG.vapidKey,
  };
  if (envCfg.apiKey && envCfg.projectId && envCfg.vapidKey) {
    _cachedConfig = envCfg;
    return _cachedConfig;
  }

  // 2. En producción (Vercel), leer /api/firebase-config
  try {
    const res = await fetch('/api/firebase-config');
    if (res.ok) {
      const json = await res.json();
      if (json?.apiKey && json?.projectId) {
        _cachedConfig = { ...DEFAULT_FIREBASE_CONFIG, ...json };
        return _cachedConfig;
      }
    }
  } catch {}

  return null;
}

async function getMessagingInstance() {
  if (_messaging) return { messaging: _messaging, config: _cachedConfig };
  const supported = await isSupported().catch(() => false);
  if (!supported) return null;

  const config = await loadFirebaseConfig();
  if (!config?.apiKey || !config?.projectId || !config?.vapidKey) return null;

  const app = getApps().length ? getApps()[0] : initializeApp({
    apiKey: config.apiKey,
    authDomain: config.authDomain,
    projectId: config.projectId,
    storageBucket: config.storageBucket,
    messagingSenderId: config.messagingSenderId,
    appId: config.appId,
  });
  _messaging = getMessaging(app);
  window.firebaseApp = app;
  window.firebaseMessaging = _messaging;
  return { messaging: _messaging, config };
}

export async function registerPushToken(explicitUserId = null) {
  if (typeof Notification === 'undefined' || !('serviceWorker' in navigator)) {
    return { ok: false, reason: 'unsupported' };
  }

  const inst = await getMessagingInstance();
  if (!inst) {
    return { ok: false, reason: 'missing_config' };
  }

  const permission = Notification.permission === 'granted'
    ? 'granted'
    : await Notification.requestPermission();
  if (permission !== 'granted') {
    return { ok: false, reason: 'denied' };
  }

  const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
    scope: '/firebase-cloud-messaging-push-scope',
  });

  const token = await getToken(inst.messaging, {
    vapidKey: inst.config.vapidKey,
    serviceWorkerRegistration: swReg,
  });
  if (!token) {
    return { ok: false, reason: 'no_token' };
  }

  const user = explicitUserId ? { id: explicitUserId } : await getUser().catch(() => null);
  const userId = user?.id || getSessionUserId?.();
  if (!userId) {
    return { ok: false, reason: 'no_user' };
  }

  await restFetch('/rest/v1/push_tokens?on_conflict=user_id,platform', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
    body: JSON.stringify({
      user_id: userId,
      empresa_id: window._currentEmpresaId || null,
      token,
      platform: 'web',
      updated_at: new Date().toISOString(),
    }),
  });

  localStorage.setItem('push_token_registered', '1');
  return { ok: true, token };
}

export async function initForegroundPush(onReceive) {
  if (_fgInitialized) return;
  const inst = await getMessagingInstance();
  if (!inst) return;
  _fgInitialized = true;

  onMessage(inst.messaging, async (payload) => {
    const title = payload?.notification?.title || payload?.data?.title || 'Finca Manager';
    const body = payload?.notification?.body || payload?.data?.body || '';
    const url = payload?.data?.url || '/#dashboard';
    const tag = payload?.data?.ref_id || payload?.data?.type || 'finca-notif';

    window.dispatchEvent(new CustomEvent('push:foreground', { detail: { title, body, url, payload } }));

    if (typeof onReceive === 'function') {
      onReceive({ title, body, url, payload });
    } else {
      window.Snackbar?.show(`${title}: ${body}`);
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker?.getRegistration('/firebase-cloud-messaging-push-scope');
        if (reg?.showNotification) {
          await reg.showNotification(title, {
            body,
            icon: '/pwa-512x512.svg',
            badge: '/pwa-512x512.svg',
            vibrate: [200, 100, 200],
            requireInteraction: true,
            tag,
            data: { url },
          });
        }
      } catch {}
    }
  });
}

function getLocalToday() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function checkPushAlerts() {
  if (!navigator.onLine || !window._currentEmpresaId) return;
  const empresaId = window._currentEmpresaId;
  const today = getLocalToday();

  // 1. Motores: Cambio de aceite requerido (horas >= max_horas o >= 80)
  try {
    const oilKey = `push_motor_oil_sent_${empresaId}_${today}`;
    const oilSent = new Set(JSON.parse(localStorage.getItem(oilKey) || '[]'));

    const [motores, mants] = await Promise.all([
      restFetch(`/rest/v1/motores?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,nombre,horas,max_horas`).catch(() => []),
      restFetch(`/rest/v1/motor_mantenimientos?empresa_id=eq.${encodeURIComponent(empresaId)}&select=motor_id`).catch(() => []),
    ]);
    const mantSet = new Set((mants || []).map(x => x.motor_id));

    for (const m of (motores || [])) {
      const limit = mantSet.has(m.id) ? (Number(m.max_horas) || 100) : 80;
      const horas = Number(m.horas) || 0;
      if (horas >= limit && !oilSent.has(m.id)) {
        await restFetch('/rest/v1/notifications', {
          method: 'POST',
          body: JSON.stringify({
            empresa_id: empresaId,
            type: 'motor_aceite',
            title: '🛢️ Cambio de aceite requerido',
            body: `${m.nombre || 'Equipo'} alcanzó ${horas} h (límite ${limit} h). Toca cambio de aceite.`,
            url: `/#detalle_motor/${m.id}`,
            ref_id: String(m.id),
          }),
        }).catch(() => {});
        oilSent.add(m.id);
      }
    }
    localStorage.setItem(oilKey, JSON.stringify([...oilSent]));
  } catch (err) {
    console.warn('checkPushAlerts motores error:', err);
  }

  // 2. Ganado: Partos próximos de ternero (<= 7 días)
  try {
    const partoKey = `push_parto_sent_${empresaId}_${today}`;
    const partoSent = new Set(JSON.parse(localStorage.getItem(partoKey) || '[]'));

    const preneces = await restFetch(
      `/rest/v1/animal_preñez?empresa_id=eq.${encodeURIComponent(empresaId)}&estado=eq.Preñada&select=id,animal_id,fecha_probable_parto`
    ).catch(() => []);

    const hoy = new Date(`${today}T12:00:00`);
    const en7dias = new Date(hoy);
    en7dias.setDate(en7dias.getDate() + 7);

    for (const preg of (preneces || [])) {
      if (!preg.fecha_probable_parto || partoSent.has(preg.animal_id)) continue;
      const parto = new Date(`${preg.fecha_probable_parto}T12:00:00`);
      if (parto < hoy || parto > en7dias) continue;

      let animalName = 'Vaca preñada';
      try {
        const localAnimal = await db.ganado.get(preg.animal_id);
        if (localAnimal?.nombre) animalName = localAnimal.nombre;
      } catch {}

      const dias = Math.round((parto - hoy) / 86400000);
      const cuando = dias === 0 ? '¡HOY!' : dias === 1 ? 'mañana' : `en ${dias} días`;

      await restFetch('/rest/v1/notifications', {
        method: 'POST',
        body: JSON.stringify({
          empresa_id: empresaId,
          type: 'ganado_parto',
          title: '🐄 Parto próximo de ternero',
          body: `${animalName} está próxima a dar a luz (${cuando} · ${preg.fecha_probable_parto}).`,
          url: '/#ganado',
          ref_id: String(preg.animal_id),
        }),
      }).catch(() => {});
      partoSent.add(preg.animal_id);
    }
    localStorage.setItem(partoKey, JSON.stringify([...partoSent]));
  } catch (err) {
    console.warn('checkPushAlerts ganado error:', err);
  }
}

export async function getPushStatus() {
  if (typeof Notification === 'undefined') return 'unsupported';
  const cfg = await loadFirebaseConfig();
  if (!cfg?.apiKey) return 'unconfigured';
  if (Notification.permission === 'denied') return 'denied';
  if (Notification.permission === 'granted' && localStorage.getItem('push_token_registered') === '1') {
    return 'enabled';
  }
  return 'prompt';
}

export async function sendTestPush() {
  const userId = getSessionUserId() || (await getUser())?.id;
  const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id');
  if (!userId) return { ok: false, reason: 'no_user' };

  await restFetch('/rest/v1/notifications', {
    method: 'POST',
    body: JSON.stringify({
      user_id: userId,
      empresa_id: empresaId || null,
      type: 'motor_aceite',
      title: '🔔 Prueba de Finca Manager',
      body: 'Las notificaciones push están funcionando correctamente en este dispositivo.',
      url: '/#configuracion',
      ref_id: `test-${Date.now()}`,
    }),
  });
  return { ok: true };
}

window.registerPushToken = registerPushToken;
window.initForegroundPush = initForegroundPush;
window.checkPushAlerts = checkPushAlerts;
window.sendTestPush = sendTestPush;
