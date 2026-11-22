import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { restFetch, getUser, getSessionUserId } from '../auth.js';
import db from '../db.js';
import { checkMotoresAceite, checkPartosProximos } from '../wa.js';

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
    updateViaCache: 'none',
  });
  swReg.update().catch(() => {});

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
    const notifId = payload?.data?.notif_id || '';

    window.dispatchEvent(new CustomEvent('push:foreground', { detail: { notifId, title, body, url, payload } }));

    if (typeof onReceive === 'function') {
      onReceive({ notifId, title, body, url, payload });
    } else {
      window.Snackbar?.show(`${title}: ${body}`);
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const reg = await navigator.serviceWorker?.getRegistration('/firebase-cloud-messaging-push-scope');
        if (reg?.showNotification) {
          await reg.showNotification(title, {
            body,
            icon: '/notif-blank.png',
            vibrate: [200, 100, 200],
            requireInteraction: true,
            renotify: true,
            tag,
            actions: [{ action: 'open', title: 'Ver' }],
            data: { url, notifId },
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

  // 1. Motores: Cambio de aceite requerido cada 5 horas hasta registrar cambio
  try {
    const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
    const now = Date.now();

    const [motores, mants] = await Promise.all([
      restFetch(`/rest/v1/motores?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,nombre,horas,max_horas`).catch(() => []),
      restFetch(`/rest/v1/motor_mantenimientos?empresa_id=eq.${encodeURIComponent(empresaId)}&select=motor_id`).catch(() => []),
    ]);
    const mantSet = new Set((mants || []).map(x => x.motor_id));

    for (const m of (motores || [])) {
      const limit = mantSet.has(m.id) ? (Number(m.max_horas) || 100) : 80;
      const horas = Number(m.horas) || 0;
      const tsKey = `push_motor_ts_${m.id}`;

      if (horas < limit) {
        localStorage.removeItem(tsKey);
        continue;
      }

      const lastSent = Number(localStorage.getItem(tsKey) || 0);
      if (now - lastSent >= FIVE_HOURS_MS) {
        // Verificar en Supabase si ya se envió en las últimas 5h (por cron o por otro dispositivo)
        const cutoff = new Date(now - FIVE_HOURS_MS).toISOString();
        const recent = await restFetch(
          `/rest/v1/notifications?empresa_id=eq.${encodeURIComponent(empresaId)}&type=eq.motor_aceite&ref_id=eq.${encodeURIComponent(m.id)}&created_at=gte.${encodeURIComponent(cutoff)}&select=id&limit=1`
        ).catch(() => []);

        if (Array.isArray(recent) && recent.length > 0) {
          localStorage.setItem(tsKey, String(now));
          continue;
        }

        await restFetch('/rest/v1/notifications', {
          method: 'POST',
          body: JSON.stringify({
            empresa_id: empresaId,
            type: 'motor_aceite',
            title: '🛢️ Cambio de aceite requerido',
            body: `${m.nombre || 'Equipo'} alcanzó ${horas} h (límite ${limit} h). Toca Ver para registrar el cambio.`,
            url: `/#detalle_motor/${m.id}`,
            ref_id: String(m.id),
          }),
        }).catch(() => {});
        localStorage.setItem(tsKey, String(now));
      }
    }
  } catch (err) {
    console.warn('checkPushAlerts motores error:', err);
  }

  // 2. Ganado: Mes 9 (16-30 días: aviso inicial) y mitad del mes 9 (<= 15 días: cada 2 días)
  try {
    const TWO_DAYS_MS = 48 * 60 * 60 * 1000;
    const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const preneces = await restFetch(
      `/rest/v1/animal_preñez?empresa_id=eq.${encodeURIComponent(empresaId)}&estado=eq.Preñada&select=id,animal_id,fecha_probable_parto,fecha_parto`
    ).catch(() => []);

    const hoy = new Date(`${today}T12:00:00`);

    for (const preg of (preneces || [])) {
      if (!preg.fecha_probable_parto || preg.fecha_parto) continue;
      const parto = new Date(`${preg.fecha_probable_parto}T12:00:00`);
      const dias = Math.round((parto - hoy) / 86400000);
      if (dias > 30) continue;

      const tsKey = `push_parto_ts_${preg.animal_id}`;
      const intervalMs = dias <= 15 ? TWO_DAYS_MS : FIFTEEN_DAYS_MS;
      const lastSent = Number(localStorage.getItem(tsKey) || 0);
      if (now - lastSent < intervalMs) continue;

      const cutoff = new Date(now - intervalMs).toISOString();
      const recent = await restFetch(
        `/rest/v1/notifications?empresa_id=eq.${encodeURIComponent(empresaId)}&type=eq.ganado_parto&ref_id=eq.${encodeURIComponent(preg.animal_id)}&created_at=gte.${encodeURIComponent(cutoff)}&select=id&limit=1`
      ).catch(() => []);

      if (Array.isArray(recent) && recent.length > 0) {
        localStorage.setItem(tsKey, String(now));
        continue;
      }

      let animalName = 'Vaca preñada';
      try {
        const localAnimal = await db.ganado.get(preg.animal_id);
        if (localAnimal?.nombre) animalName = localAnimal.nombre;
      } catch {}

      let title;
      let body;
      if (dias <= 15) {
        const cuando = dias < 0
          ? `fecha probable pasó hace ${Math.abs(dias)} día(s)`
          : dias === 0 ? '¡HOY!' : dias === 1 ? 'mañana' : `en ${dias} días`;
        title = dias <= 2 ? '🐄 ¡Parto inminente!' : '🐄 Parto próximo · Revisar vaca';
        body = `${animalName} está en la recta final (${cuando} · ${preg.fecha_probable_parto}). Mantener vigilancia.`;
      } else {
        title = '🐄 Vaca en mes 9 de gestación';
        body = `${animalName} entró al mes 9 (faltan ${dias} días · ${preg.fecha_probable_parto}). Ir preparando cuidados de parto.`;
      }

      await restFetch('/rest/v1/notifications', {
        method: 'POST',
        body: JSON.stringify({
          empresa_id: empresaId,
          type: 'ganado_parto',
          title,
          body,
          url: `/#detalle_animal/${preg.animal_id}`,
          ref_id: String(preg.animal_id),
        }),
      }).catch(() => {});
      localStorage.setItem(tsKey, String(now));
    }
  } catch (err) {
    console.warn('checkPushAlerts ganado error:', err);
  }

  // 3. Replicar alertas activas de motores (cambio de aceite) y ganado (vacas por dar a luz) por WhatsApp
  await checkMotoresAceite().catch(() => {});
  await checkPartosProximos().catch(() => {});
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
