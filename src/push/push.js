import { initializeApp, getApps } from 'firebase/app';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { restFetch, getUser, getSessionUserId } from '../auth.js';
import db from '../db.js';
import { checkMotoresAceite, checkPartosProximos } from '../wa.js';
import { isFuelMotor } from '../utils/motor_fuel_config.js';
import {
  PUSH_MODULES_SCHEMA,
  getPushAlertPrefs,
  savePushAlertPrefs,
  loadPushAlertPrefsFromUser,
  isAlertEnabled,
  getPushPrefsSummaryText,
} from './push_prefs.js';

export {
  PUSH_MODULES_SCHEMA,
  getPushAlertPrefs,
  savePushAlertPrefs,
  loadPushAlertPrefsFromUser,
  isAlertEnabled,
  getPushPrefsSummaryText,
};

let _prefsSyncedEmpresaId = '';

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

export async function registerPushToken(explicitUserId = null, opts = {}) {
  if (!opts?.userInitiated && localStorage.getItem('push_notifications_enabled') === '0') {
    return { ok: false, reason: 'disabled_by_user' };
  }

  localStorage.setItem('push_token_registered', '1');
  localStorage.setItem('push_notifications_enabled', '1');

  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    await Notification.requestPermission().catch(() => 'default');
  }

  try {
    if (
      typeof Notification !== 'undefined' &&
      Notification.permission === 'granted' &&
      'serviceWorker' in navigator
    ) {
      const inst = await getMessagingInstance().catch(() => null);
      if (inst) {
        const swReg = await navigator.serviceWorker.register('/firebase-messaging-sw.js', {
          scope: '/firebase-cloud-messaging-push-scope',
          updateViaCache: 'none',
        });
        swReg.update().catch(() => {});

        const token = await getToken(inst.messaging, {
          vapidKey: inst.config.vapidKey,
          serviceWorkerRegistration: swReg,
        }).catch(() => '');

        if (token) {
          const user = explicitUserId ? { id: explicitUserId } : await getUser().catch(() => null);
          const userId = user?.id || getSessionUserId?.();
          if (userId) {
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
            }).catch(() => {});
          }
          return { ok: true, token, mode: 'fcm' };
        }
      }
    }
  } catch (err) {
    console.warn('FCM push registration fallback a modo local:', err?.message || err);
  }

  return { ok: true, mode: 'local' };
}

const _recentlyDeliveredTags = new Map();

function markTagDelivered(tag) {
  if (!tag) return;
  _recentlyDeliveredTags.set(String(tag), Date.now());
  if (_recentlyDeliveredTags.size > 50) {
    const cutoff = Date.now() - 30000;
    for (const [k, ts] of _recentlyDeliveredTags.entries()) {
      if (ts < cutoff) _recentlyDeliveredTags.delete(k);
    }
  }
}

function wasRecentlyDelivered(tag) {
  if (!tag) return false;
  const ts = _recentlyDeliveredTags.get(String(tag));
  return Boolean(ts && (Date.now() - ts) < 20000);
}

async function deliverInstantLocalPush({ notifId = '', title, body, url = '/#dashboard', refId = '', tag = '' }) {
  if (localStorage.getItem('push_notifications_enabled') === '0') return;
  if (!title || !body) return;
  const effectiveTag = String(tag || refId || notifId || 'finca-notif');
  if (wasRecentlyDelivered(effectiveTag)) return;
  markTagDelivered(effectiveTag);

  window.__addPushBellNotif?.({ notifId, title, body, url, refId: refId || tag });
  window.Snackbar?.show(`${title}: ${body}`);

  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    try {
      const reg = (await navigator.serviceWorker?.getRegistration('/firebase-cloud-messaging-push-scope').catch(() => null))
        || (await navigator.serviceWorker?.getRegistration().catch(() => null))
        || (await navigator.serviceWorker?.ready.catch(() => null));
      if (reg?.showNotification) {
        await reg.showNotification(title, {
          body,
          icon: '/notif-blank.png',
          vibrate: [200, 100, 200],
          requireInteraction: true,
          renotify: true,
          tag: effectiveTag,
          actions: [{ action: 'open', title: 'Ver' }],
          data: { url, notifId },
        });
      } else {
        new Notification(title, { body, icon: '/notif-blank.png', tag: effectiveTag });
      }
    } catch {
      try {
        new Notification(title, { body, icon: '/notif-blank.png', tag: effectiveTag });
      } catch {}
    }
  }
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

    if (wasRecentlyDelivered(tag)) return;
    markTagDelivered(tag);

    window.dispatchEvent(new CustomEvent('push:foreground', { detail: { notifId, title, body, url, payload } }));

    if (typeof onReceive === 'function') {
      onReceive({ notifId, title, body, url, payload, refId: payload?.data?.ref_id || '' });
    } else {
      window.Snackbar?.show(`${title}: ${body}`);
    }

    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      try {
        const reg = (await navigator.serviceWorker?.getRegistration('/firebase-cloud-messaging-push-scope'))
          || (await navigator.serviceWorker?.getRegistration());
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

function getWeekMondayIso(isoStr) {
  const d = new Date(`${isoStr}T12:00:00`);
  const dow = d.getDay();
  d.setDate(d.getDate() - dow + (dow === 0 ? -6 : 1));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function emitModuleAlert({ empresaId, type, title, body, url, refId, dedupMs = 24 * 60 * 60 * 1000, lsKey = '' }) {
  const now = Date.now();
  const storageKey = lsKey || `push_mod_ts_${type}_${refId}`;
  const lastSent = Number(localStorage.getItem(storageKey) || 0);
  if (lastSent && (now - lastSent) < dedupMs) return false;

  const cutoff = new Date(now - dedupMs).toISOString();
  const recent = await restFetch(
    `/rest/v1/notifications?empresa_id=eq.${encodeURIComponent(empresaId)}&type=eq.${encodeURIComponent(type)}&ref_id=eq.${encodeURIComponent(refId)}&read=eq.false&created_at=gte.${encodeURIComponent(cutoff)}&select=id,title,body,url,ref_id&order=created_at.desc&limit=1`
  ).catch(() => []);

  if (Array.isArray(recent) && recent.length > 0) {
    const r = recent[0];
    await deliverInstantLocalPush({
      notifId: r.id,
      title: r.title || title,
      body: r.body || body,
      url: r.url || url,
      refId: String(r.ref_id || refId),
      tag: String(refId),
    });
    localStorage.setItem(storageKey, String(now));
    return true;
  }

  const created = await restFetch('/rest/v1/notifications', {
    method: 'POST',
    body: JSON.stringify({
      empresa_id: empresaId,
      type,
      title,
      body,
      url,
      ref_id: String(refId),
    }),
  }).catch(() => []);
  const newId = Array.isArray(created) ? (created[0]?.id || '') : (created?.id || '');
  await deliverInstantLocalPush({
    notifId: newId,
    title,
    body,
    url,
    refId: String(refId),
    tag: String(refId),
  });
  localStorage.setItem(storageKey, String(now));
  return true;
}

export async function checkPushAlerts(opts = {}) {
  if (localStorage.getItem('push_notifications_enabled') === '0') return;
  const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id');
  if (!navigator.onLine || !empresaId) return;
  if (_prefsSyncedEmpresaId !== empresaId) {
    _prefsSyncedEmpresaId = empresaId;
    await loadPushAlertPrefsFromUser(empresaId).catch(() => {});
  }
  const today = getLocalToday();
  const forceMotorId = opts?.forceMotorId ? String(opts.forceMotorId) : '';
  const forceAnimalId = opts?.forceAnimalId ? String(opts.forceAnimalId) : '';

  // 1. Motores: Cambio de aceite requerido cada 5 horas hasta registrar cambio
  if (isAlertEnabled('motores', 'cambio_aceite', empresaId)) {
  try {
    const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
    const now = Date.now();

    const [motores, mants] = await Promise.all([
      restFetch(`/rest/v1/motores?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,nombre,icon,horas,max_horas,notas`).catch(() => []),
      restFetch(`/rest/v1/motor_mantenimientos?empresa_id=eq.${encodeURIComponent(empresaId)}&select=motor_id`).catch(() => []),
    ]);
    const mantSet = new Set((mants || []).map(x => x.motor_id));

    for (const m of (motores || [])) {
      const tsKey = `push_motor_ts_${m.id}`;
      if (isFuelMotor(m)) {
        localStorage.removeItem(tsKey);
        continue;
      }
      const limit = mantSet.has(m.id) ? (Number(m.max_horas) || 100) : 80;
      const horas = Number(m.horas) || 0;

      if (horas < limit) {
        localStorage.removeItem(tsKey);
        continue;
      }

      const isForced = Boolean(forceMotorId && String(m.id) === forceMotorId);
      if (isForced) {
        localStorage.removeItem(tsKey);
        localStorage.removeItem(`wa_motor_aceite_ts_${m.id}`);
      }

      const lastSent = Number(localStorage.getItem(tsKey) || 0);
      if (isForced || (now - lastSent >= FIVE_HOURS_MS)) {
        // Verificar en Supabase si ya existe una alerta NO leída de este ciclo en las últimas 5h
        const cutoff = new Date(now - FIVE_HOURS_MS).toISOString();
        const recent = await restFetch(
          `/rest/v1/notifications?empresa_id=eq.${encodeURIComponent(empresaId)}&type=eq.motor_aceite&ref_id=eq.${encodeURIComponent(m.id)}&read=eq.false&created_at=gte.${encodeURIComponent(cutoff)}&select=id,title,body,url,ref_id&order=created_at.desc&limit=1`
        ).catch(() => []);

        if (Array.isArray(recent) && recent.length > 0) {
          const r = recent[0];
          await deliverInstantLocalPush({
            notifId: r.id,
            title: r.title || '🛢️ Cambio de aceite requerido',
            body: r.body || `${m.nombre || 'Equipo'} alcanzó ${horas} h (límite ${limit} h).`,
            url: r.url || `/#detalle_motor/${m.id}`,
            refId: String(r.ref_id || m.id),
            tag: String(m.id),
          });
          localStorage.setItem(tsKey, String(now));
          continue;
        }

        const title = '🛢️ Cambio de aceite requerido';
        const body = `${m.nombre || 'Equipo'} alcanzó ${horas} h (límite ${limit} h). Toca Ver para registrar el cambio.`;
        const url = `/#detalle_motor/${m.id}`;
        const refId = String(m.id);

        const created = await restFetch('/rest/v1/notifications', {
          method: 'POST',
          body: JSON.stringify({
            empresa_id: empresaId,
            type: 'motor_aceite',
            title,
            body,
            url,
            ref_id: refId,
          }),
        }).catch(() => []);
        const newId = Array.isArray(created) ? (created[0]?.id || '') : (created?.id || '');
        await deliverInstantLocalPush({ notifId: newId, title, body, url, refId, tag: refId });
        localStorage.setItem(tsKey, String(now));
      }
    }
  } catch (err) {
    console.warn('checkPushAlerts motores error:', err);
  }
  }

  // 2. Ganado: Partos (Mes 9 / Recta final)
  if (isAlertEnabled('ganado', 'partos', empresaId)) {
  try {
    const TWO_DAYS_MS = 48 * 60 * 60 * 1000;
    const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
    const now = Date.now();

    const [preneces, animales] = await Promise.all([
      restFetch(`/rest/v1/animal_preñez?empresa_id=eq.${encodeURIComponent(empresaId)}&estado=eq.Preñada&select=id,animal_id,fecha_probable_parto,fecha_parto`).catch(() => []),
      restFetch(`/rest/v1/ganado?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,nombre`).catch(() => []),
    ]);
    const ganadoMap = new Map((Array.isArray(animales) ? animales : []).map(a => [a.id, a.nombre]));

    const hoy = new Date(`${today}T12:00:00`);

    for (const preg of (preneces || [])) {
      if (!preg.fecha_probable_parto || preg.fecha_parto) continue;
      const parto = new Date(`${preg.fecha_probable_parto}T12:00:00`);
      const dias = Math.round((parto - hoy) / 86400000);
      if (dias > 30) continue;

      const tsKey = `push_parto_ts_${preg.animal_id}`;
      const intervalMs = dias <= 15 ? TWO_DAYS_MS : FIFTEEN_DAYS_MS;
      const isForced = Boolean(forceAnimalId && String(preg.animal_id) === forceAnimalId);
      if (isForced) {
        localStorage.removeItem(tsKey);
        localStorage.removeItem(`wa_parto_ts_${preg.animal_id}`);
      }

      const lastSent = Number(localStorage.getItem(tsKey) || 0);
      if (!isForced && (now - lastSent < intervalMs)) continue;

      let animalName = ganadoMap.get(preg.animal_id) || '';
      if (!animalName) {
        try {
          const localAnimal = await db.ganado.get(preg.animal_id);
          if (localAnimal?.nombre) animalName = localAnimal.nombre;
        } catch {}
      }
      if (!animalName) animalName = 'Vaca preñada';

      const cutoff = new Date(now - intervalMs).toISOString();
      const recent = await restFetch(
        `/rest/v1/notifications?empresa_id=eq.${encodeURIComponent(empresaId)}&type=eq.ganado_parto&ref_id=eq.${encodeURIComponent(preg.animal_id)}&read=eq.false&created_at=gte.${encodeURIComponent(cutoff)}&select=id,title,body,url,ref_id&order=created_at.desc&limit=1`
      ).catch(() => []);

      if (Array.isArray(recent) && recent.length > 0) {
        const r = recent[0];
        await deliverInstantLocalPush({
          notifId: r.id,
          title: r.title,
          body: r.body,
          url: r.url || `/#detalle_animal/${preg.animal_id}`,
          refId: String(r.ref_id || preg.animal_id),
          tag: String(preg.animal_id),
        });
        localStorage.setItem(tsKey, String(now));
        continue;
      }

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
      const url = `/#detalle_animal/${preg.animal_id}`;
      const refId = String(preg.animal_id);

      const created = await restFetch('/rest/v1/notifications', {
        method: 'POST',
        body: JSON.stringify({
          empresa_id: empresaId,
          type: 'ganado_parto',
          title,
          body,
          url,
          ref_id: refId,
        }),
      }).catch(() => []);
      const newId = Array.isArray(created) ? (created[0]?.id || '') : (created?.id || '');
      await deliverInstantLocalPush({ notifId: newId, title, body, url, refId, tag: refId });
      localStorage.setItem(tsKey, String(now));
    }
  } catch (err) {
    console.warn('checkPushAlerts ganado error:', err);
  }
  }

  // 2b. Ganado: Vacunas y Fumigaciones
  const wantVacunas = isAlertEnabled('ganado', 'vacunas', empresaId);
  const wantFumig = isAlertEnabled('ganado', 'fumigaciones', empresaId);
  if (wantVacunas || wantFumig) {
    try {
      const [animales, vacs, fums] = await Promise.all([
        restFetch(`/rest/v1/ganado?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,nombre`).catch(() => []),
        wantVacunas ? restFetch(`/rest/v1/animal_vacunas?empresa_id=eq.${encodeURIComponent(empresaId)}&estado=eq.Programada&fecha=lte.${today}&select=id,animal_id,nombre,fecha`).catch(() => []) : [],
        wantFumig ? restFetch(`/rest/v1/animal_fumigaciones?empresa_id=eq.${encodeURIComponent(empresaId)}&estado=eq.Programada&fecha=lte.${today}&select=id,animal_id,producto,fecha`).catch(() => []) : [],
      ]);
      const gMap = new Map((Array.isArray(animales) ? animales : []).map(a => [a.id, a.nombre]));
      if (wantVacunas && Array.isArray(vacs) && vacs.length > 0) {
        for (const v of vacs.slice(0, 5)) {
          const animNom = gMap.get(v.animal_id) || 'Ganado';
          const isOver = v.fecha < today;
          await emitModuleAlert({
            empresaId,
            type: 'ganado_vacuna',
            title: isOver ? '💉 Vacuna atrasada' : '💉 Vacuna programada para hoy',
            body: `${animNom}: ${v.nombre || 'Vacuna'} (${v.fecha}).`,
            url: `/#detalle_animal/${v.animal_id}`,
            refId: `vac_${v.id}_${today}`,
          });
        }
      }
      if (wantFumig && Array.isArray(fums) && fums.length > 0) {
        for (const f of fums.slice(0, 5)) {
          const animNom = gMap.get(f.animal_id) || 'Ganado';
          await emitModuleAlert({
            empresaId,
            type: 'ganado_fumigacion',
            title: f.fecha < today ? '🧴 Fumigación atrasada' : '🧴 Fumigación para hoy',
            body: `${animNom}: ${f.producto || 'Fumigación'} (${f.fecha}).`,
            url: `/#detalle_animal/${f.animal_id}`,
            refId: `fum_${f.id}_${today}`,
          });
        }
      }
    } catch (e) {
      console.warn('checkPushAlerts ganado vac/fum error:', e);
    }
  }

  // 3. Cafetal (flujo nuevo) y Cuentas (flujo nuevo) y Personal
  const wantCafCal = isAlertEnabled('cafetal', 'calendario_manejo', empresaId);
  const wantCafCos = isAlertEnabled('cafetal', 'cosecha_latas', empresaId);
  const wantCafBal = isAlertEnabled('cafetal', 'balance_lote', empresaId);
  const wantCafFoto = isAlertEnabled('cafetal', 'linea_tiempo_fotos', empresaId);
  const wantCtasPend = isAlertEnabled('cuentas', 'pendientes_enviar', empresaId);
  const wantCtasApr = isAlertEnabled('cuentas', 'por_aprobar', empresaId);
  const wantCtasMov = isAlertEnabled('cuentas', 'nuevos_movimientos', empresaId);
  const wantPersonal = isAlertEnabled('personal', 'asistencia_jornales', empresaId);

  if (wantCafCal || wantCafCos || wantCafBal || wantCafFoto || wantCtasPend || wantCtasApr || wantCtasMov || wantPersonal) {
    try {
      const wsIso = getWeekMondayIso(today);
      const [lotes, apps, gastos, personalList, asisList] = await Promise.all([
        (wantCafCal || wantCafCos || wantCafBal || wantCafFoto || wantCtasPend)
          ? restFetch(`/rest/v1/lotes?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,nombre`).catch(() => []) : [],
        (wantCafCal || wantCafCos || wantCafFoto || wantCtasPend || wantPersonal)
          ? restFetch(`/rest/v1/lote_aplicaciones?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,lote_id,tipo,producto,fecha,estado,observaciones,foto_url,operador,created_at`).catch(() => []) : [],
        (wantCafCos || wantCafBal || wantCtasPend || wantCtasApr || wantCtasMov || wantPersonal)
          ? restFetch(`/rest/v1/gastos?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,lote_id,fecha,categoria,descripcion,monto,created_at`).catch(() => []) : [],
        (wantCtasPend || wantPersonal)
          ? restFetch(`/rest/v1/personal?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,nombre,pago_diario`).catch(() => []) : [],
        (wantCtasPend || wantPersonal)
          ? restFetch(`/rest/v1/personal_asistencia?empresa_id=eq.${encodeURIComponent(empresaId)}&fecha=gte.${wsIso}&select=personal_id,fecha,estado`).catch(() => []) : [],
      ]);

      const loteMap = new Map((Array.isArray(lotes) ? lotes : []).map(l => [String(l.id), String(l.nombre || 'Lote').replace(/\bcafe\b/gi, 'Café')]));
      const appsArr = Array.isArray(apps) ? apps : [];
      const gastosArr = Array.isArray(gastos) ? gastos : [];

      if (wantCafCal) {
        const pendManejo = appsArr.filter(a => {
          if (String(a.observaciones || '').startsWith('[COSECHA_JSON]')) return false;
          const est = String(a.estado || '');
          const f = String(a.fecha || '').slice(0, 10);
          return (est === 'Programada' || est === 'Pendiente') && f && f <= today;
        });
        for (const a of pendManejo.slice(0, 5)) {
          const isOver = String(a.fecha || '').slice(0, 10) < today;
          const lName = loteMap.get(String(a.lote_id)) || 'Lote de café';
          await emitModuleAlert({
            empresaId,
            type: 'cafetal_manejo',
            title: isOver ? `☕ Actividad atrasada · ${lName}` : `☕ Actividad para hoy · ${lName}`,
            body: `${a.producto || a.tipo || 'Labor de manejo'} (${String(a.fecha || '').slice(0, 10)}).`,
            url: `/#detalle_lote/${a.lote_id}/manejo`,
            refId: `caf_act_${a.id}_${today}`,
          });
        }
      }

      if (wantCafFoto) {
        const fotosHoy = appsArr.filter(a => {
          const src = String(a.foto_url || '');
          const cr = String(a.created_at || a.fecha || '').slice(0, 10);
          return (src.startsWith('http') || src.startsWith('data:image')) && cr === today;
        });
        for (const a of fotosHoy.slice(0, 3)) {
          const lName = loteMap.get(String(a.lote_id)) || 'Lote de café';
          await emitModuleAlert({
            empresaId,
            type: 'cafetal_foto',
            title: `📸 Nueva fotografía · ${lName}`,
            body: `Evidencia subida en Línea de Tiempo (${a.producto || a.tipo || 'Actividad'}).`,
            url: `/#detalle_lote/${a.lote_id}/timeline`,
            refId: `caf_foto_${a.id}`,
            dedupMs: 7 * 24 * 60 * 60 * 1000,
          });
        }
      }

      // Cosecha semanal pendiente de enviar a Cuentas (compartido Cafetal / Cuentas)
      if (wantCafCos || wantCtasPend) {
        const paidCosecha = new Map();
        gastosArr.forEach(g => {
          const matches = String(g.descripcion || '').match(/\[ref:cosecha_[^\]]+\]/g);
          if (matches) matches.forEach(t => paidCosecha.set(t, (paidCosecha.get(t) || 0) + (Number(g.monto) || 0)));
        });
        const cosechaPend = new Map();
        appsArr.forEach(app => {
          const obs = String(app.observaciones || '');
          if (!obs.startsWith('[COSECHA_JSON]') || !app.lote_id) return;
          const f = String(app.fecha || '').slice(0, 10);
          if (!f) return;
          try {
            const parsed = JSON.parse(obs.slice('[COSECHA_JSON]'.length));
            const price = Number(parsed.precio_lata) || 40;
            const regs = Array.isArray(parsed.registros) ? parsed.registros : [];
            const mon = getWeekMondayIso(f);
            const gk = `${app.lote_id}__${mon}`;
            if (!cosechaPend.has(gk)) cosechaPend.set(gk, { loteId: String(app.lote_id), wsIso: mon, workers: new Map() });
            const grp = cosechaPend.get(gk);
            regs.forEach(r => {
              const l = Number(r.latas) || 0;
              if (l <= 0) return;
              const wk = String(r.personal_id || r.nombre);
              grp.workers.set(wk, (grp.workers.get(wk) || 0) + Math.round(l * price));
            });
          } catch {}
        });
        const pendingByLote = new Map();
        for (const [, grp] of cosechaPend.entries()) {
          let pending = 0;
          grp.workers.forEach((pay, wk) => {
            const refTag = `[ref:cosecha_${grp.loteId}_${wk}_${grp.wsIso}]`;
            const paid = Math.round(paidCosecha.get(refTag) || 0);
            if (!paidCosecha.has(refTag)) pending += pay;
            else if (paid !== Math.round(pay)) pending += Math.abs(Math.round(pay) - paid);
          });
          if (pending > 0) {
            pendingByLote.set(grp.loteId, (pendingByLote.get(grp.loteId) || 0) + pending);
          }
        }
        for (const [loteId, pending] of pendingByLote.entries()) {
          const lName = loteMap.get(loteId) || 'Lote';
          await emitModuleAlert({
            empresaId,
            type: 'cafetal_cosecha',
            title: `🧺 Cosecha pendiente de enviar · ${lName}`,
            body: `Hay L ${pending.toLocaleString()} en latas registradas sin liquidar en Cuentas.`,
            url: `/#detalle_lote/${loteId}/cosecha`,
            refId: `cos_pend_${loteId}_${today}`,
          });
        }
      }

      if (wantCafBal || wantCtasApr) {
        const porAprobar = gastosArr.filter(g => String(g.descripcion || '').includes('[Por Aprobar]'));
        for (const g of porAprobar.slice(0, 4)) {
          const isLote = Boolean(g.lote_id);
          if ((isLote && !wantCafBal && !wantCtasApr) || (!isLote && !wantCtasApr)) continue;
          const lName = isLote ? (loteMap.get(String(g.lote_id)) || 'Lote') : 'Cuentas';
          await emitModuleAlert({
            empresaId,
            type: 'cuentas_aprobar',
            title: `⏳ Movimiento por aprobar · ${lName}`,
            body: `${String(g.descripcion || '').replace(/\[(?:ref:[^\]]+|Por Aprobar)\]/g, '').trim() || g.categoria || 'Movimiento'} (L ${Number(g.monto || 0).toLocaleString()}).`,
            url: isLote ? `/#detalle_lote/${g.lote_id}/balance` : '/#gastos',
            refId: `apr_${g.id}_${today}`,
          });
        }
      }

      if (wantCtasMov) {
        const hoyMovs = gastosArr.filter(g => String(g.created_at || g.fecha || '').slice(0, 10) === today);
        for (const g of hoyMovs.slice(0, 3)) {
          await emitModuleAlert({
            empresaId,
            type: 'cuentas_movimiento',
            title: `💵 Movimiento en Cuentas (${g.categoria || 'Registro'})`,
            body: `${String(g.descripcion || '').replace(/\[(?:ref:[^\]]+|Por Aprobar)\]/g, '').trim() || 'Registro'} — L ${Number(g.monto || 0).toLocaleString()}.`,
            url: '/#gastos',
            refId: `mov_${g.id}`,
            dedupMs: 7 * 24 * 60 * 60 * 1000,
          });
        }
      }

      if (wantCtasPend || wantPersonal) {
        const personalArr = Array.isArray(personalList) ? personalList : [];
        const asisArr = Array.isArray(asisList) ? asisList : [];
        const personalGastos = gastosArr.filter(g => String(g.categoria || '').toLowerCase() === 'personal');
        let pendTotal = 0;
        let pendWorkers = 0;
        for (const p of personalArr) {
          const pagoDia = Number(p.pago_diario) || 0;
          if (pagoDia <= 0) continue;
          const worked = new Set(
            asisArr
              .filter(a => String(a.personal_id) === String(p.id) && /asist|trabaj|presente|si|sí/i.test(String(a.estado || '')))
              .map(a => String(a.fecha || '').slice(0, 10))
          );
          if (worked.size === 0) continue;
          const gross = worked.size * pagoDia;
          const paid = personalGastos
            .filter(g => String(g.descripcion || '').includes(`[ref:${p.id}_sem_${wsIso}]`))
            .reduce((s, g) => s + (Number(g.monto) || 0), 0);
          if (gross - paid > 0) {
            pendTotal += (gross - paid);
            pendWorkers += 1;
          }
        }
        if (pendTotal > 0) {
          await emitModuleAlert({
            empresaId,
            type: 'personal_jornales',
            title: '👷 Jornales semanales pendientes',
            body: `${pendWorkers} colaborador(es) acumulan L ${Math.round(pendTotal).toLocaleString()} pendientes de enviar a Cuentas.`,
            url: '/#personal',
            refId: `pers_sem_${wsIso}_${today}`,
          });
        }
      }
    } catch (e) {
      console.warn('checkPushAlerts cafetal/cuentas/personal error:', e);
    }
  }

  // 4. Potreros (rotación / descanso cumplido)
  if (isAlertEnabled('potreros', 'rotacion', empresaId)) {
    try {
      const potreros = await restFetch(`/rest/v1/potreros?empresa_id=eq.${encodeURIComponent(empresaId)}&select=*`).catch(() => []);
      const nowMs = Date.now();
      for (const pot of (Array.isArray(potreros) ? potreros : [])) {
        const st = String(pot.status || '').toLowerCase();
        if (st !== 'recuperando' && st !== 'descanso' && st !== 'ocupado') continue;
        const ciclo = Number(pot.ciclo_recuperacion) || 30;
        const refDate = pot.updated_at || pot.created_at;
        if (!refDate) continue;
        const dias = Math.floor((nowMs - new Date(refDate).getTime()) / 86400000);
        if (dias >= ciclo) {
          await emitModuleAlert({
            empresaId,
            type: 'potrero_rotacion',
            title: `🌿 Rotación de potrero · ${pot.nombre || 'Potrero'}`,
            body: `Completó ${dias} días (ciclo de ${ciclo} días). Listo para revisar rotación.`,
            url: `/#detalle_potrero/${pot.id}`,
            refId: `pot_rot_${pot.id}_${today}`,
          });
        }
      }
    } catch (e) {
      console.warn('checkPushAlerts potreros error:', e);
    }
  }

  // 5. Herramientas (en reparación / mantenimiento)
  if (isAlertEnabled('herramientas', 'mantenimiento', empresaId)) {
    try {
      const tools = await restFetch(`/rest/v1/herramientas?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,nombre,estado`).catch(() => []);
      for (const t of (Array.isArray(tools) ? tools : [])) {
        if (t.estado === 'Reparación') {
          await emitModuleAlert({
            empresaId,
            type: 'herramienta_mant',
            title: `🛠️ Herramienta en reparación`,
            body: `${t.nombre || 'Herramienta'} requiere revisión o mantenimiento.`,
            url: `/#detalle_herramienta/${t.id}`,
            refId: `herr_${t.id}_${today}`,
          });
        }
      }
    } catch (e) {
      console.warn('checkPushAlerts herramientas error:', e);
    }
  }

  // 6. Cultivos (en maduración / próximos a cosecha)
  if (isAlertEnabled('cultivos', 'labores_cosecha', empresaId)) {
    try {
      const cultivos = await restFetch(`/rest/v1/cultivos?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,nombre,tipo,estado_cosecha`).catch(() => []);
      for (const c of (Array.isArray(cultivos) ? cultivos : [])) {
        if (c.estado_cosecha === 'Madurando') {
          await emitModuleAlert({
            empresaId,
            type: 'cultivo_cosecha',
            title: `🌾 Cultivo listo para cosecha`,
            body: `${c.nombre || c.tipo || 'Cultivo'} se encuentra en etapa de maduración.`,
            url: '/#cultivos',
            refId: `cult_${c.id}_${today}`,
          });
        }
      }
    } catch (e) {
      console.warn('checkPushAlerts cultivos error:', e);
    }
  }

  // 7. Replicar alertas activas de motores y ganado por WhatsApp (respetando preferencias)
  await Promise.all([
    checkMotoresAceite(opts).catch(() => {}),
    checkPartosProximos(opts).catch(() => {}),
  ]);
}

export async function getPushStatus() {
  if (
    localStorage.getItem('push_token_registered') === '1' &&
    localStorage.getItem('push_notifications_enabled') !== '0'
  ) {
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

export async function notifyMotorOilChanged({ motorId, nombre, horasPrevias, proximoLimite }) {
  const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id');
  if (!isAlertEnabled('motores', 'mantenimientos', empresaId)) return;
  const title = '✅ Cambio de aceite realizado';
  const body = `${nombre || 'Equipo'}: cambio registrado a las ${horasPrevias} h. Contador reiniciado a 0 h (próximo servicio a las ${proximoLimite} h).`;
  const url = `/#detalle_motor/${motorId}`;
  const refId = `oil_done_${motorId}_${Date.now()}`;

  let notifId = '';
  if (navigator.onLine && empresaId) {
    try {
      const created = await restFetch('/rest/v1/notifications', {
        method: 'POST',
        body: JSON.stringify({
          empresa_id: empresaId,
          type: 'motor_mantenimiento',
          title,
          body,
          url,
          ref_id: refId,
        }),
      });
      notifId = Array.isArray(created) ? (created[0]?.id || '') : (created?.id || '');
    } catch {}
  }

  await deliverInstantLocalPush({
    notifId,
    title,
    body,
    url,
    refId,
    tag: refId,
  });
}

window.registerPushToken = registerPushToken;
window.initForegroundPush = initForegroundPush;
window.checkPushAlerts = checkPushAlerts;
window.sendTestPush = sendTestPush;
window.notifyMotorOilChanged = notifyMotorOilChanged;
