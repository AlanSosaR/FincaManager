import db from './db.js';
import { restFetch, loadWhatsAppConfig } from './auth.js';
import { getDosisPorEdad, getPlanIfcafe, obtenerOrdenDia, normalizarProducto } from './utils/calculadora_dosis.js';
import { isAlertEnabled } from './push/push_prefs.js';

const EVOLUTION_API = '/api/wa-proxy';
const NOTIFIED_KEY = 'wa_notified_vaccines';
const SENT_TODAY_KEY = 'wa_sent_today';
const NOTIFIED_FUMIG_KEY = 'wa_notified_fumigaciones';
const SENT_FUMIG_TODAY_KEY = 'wa_sent_fumig_today';

function getInstanceName() {
  const savedInstance = localStorage.getItem('wa_instance_name') || window._activeWaInstance;
  if (savedInstance) return savedInstance;
  const empresaId = window._currentEmpresaId || 'default';
  return `finca_mgr_${empresaId.substring(0, 8)}`;
}

function getNotifiedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveNotifiedSet(set) {
  localStorage.setItem(NOTIFIED_KEY, JSON.stringify([...set]));
}

export function markNotified(vaccineId) {
  const set = getNotifiedSet();
  set.add(vaccineId);
  saveNotifiedSet(set);
}

async function waFetch(path, options = {}) {
  const url = `${EVOLUTION_API}/${path}`;
  const res = await fetch(url, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...options.headers },
  });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Evolution API ${res.status}: ${text.slice(0, 200)}`);
  }
  return res;
}

export async function createInstance(number, instanceNameOverride) {
  const name = instanceNameOverride || getInstanceName();
  const body = { instanceName: name, integration: 'WHATSAPP-BAILEYS', qrcode: !number };
  if (number) body.number = number;
  const res = await waFetch(`instance/create`, {
    method: 'POST',
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function logoutInstance() {
  const name = getInstanceName();
  try {
    await waFetch(`instance/logout/${name}`, { method: 'DELETE' });
  } catch {}
}

export async function deleteInstance() {
  const name = getInstanceName();
  await logoutInstance();
  localStorage.removeItem('wa_instance_name');
  window._activeWaInstance = null;
  try {
    const res = await waFetch(`instance/delete/${name}`, { method: 'DELETE' });
    return res.json();
  } catch (e) {
    if (e.message?.includes('404') || e.message?.includes('instance does not exist')) {
      return { deleted: true };
    }
    throw e;
  }
}

export async function getQR(phoneNumber) {
  const name = getInstanceName();
  const query = phoneNumber ? `?number=${encodeURIComponent(phoneNumber)}` : '';
  const res = await waFetch(`instance/connect/${name}${query}`);
  return res.json();
}

function extractPairingCode(payload) {
  const raw = payload?.qrcode?.pairingCode || payload?.pairingCode;
  if (typeof raw === 'string' && raw.trim()) return raw.trim();
  const code = payload?.code;
  if (typeof code === 'string' && code.trim() && code.trim().length <= 16) return code.trim();
  return null;
}

export async function connectPairing(phoneNumber) {
  const empresaId = window._currentEmpresaId || 'default';
  await deleteInstance().catch(() => {});
  await new Promise(r => setTimeout(r, 700));

  let activeName = getInstanceName();
  let created = null;
  try {
    created = await createInstance(phoneNumber, activeName);
  } catch (err) {
    if (err.message?.includes('403') || err.message?.toLowerCase().includes('already in use')) {
      activeName = `finca_mgr_${empresaId.substring(0, 8)}_${Date.now().toString(36).slice(-4)}`;
      window._activeWaInstance = activeName;
      localStorage.setItem('wa_instance_name', activeName);
      created = await createInstance(phoneNumber, activeName);
    } else {
      throw err;
    }
  }

  let pairingCode = extractPairingCode(created);
  if (pairingCode) return { pairingCode };

  let connectData = await getQR(phoneNumber).catch(() => null);
  pairingCode = extractPairingCode(connectData);
  if (!pairingCode) {
    await new Promise(r => setTimeout(r, 1500));
    connectData = await getQR(phoneNumber);
    pairingCode = extractPairingCode(connectData);
  }
  return {
    pairingCode,
    code: connectData?.code || null,
  };
}

export async function checkConnection() {
  const name = getInstanceName();
  try {
    const res = await waFetch(`instance/connectionState/${name}`);
    const data = await res.json();
    if (data?.instance?.state === 'open') return true;
  } catch {}

  // Fallback: Si el nombre de instancia difiere por origen/ID de empresa, buscar si hay una instancia de finca_mgr activa en el servidor
  try {
    const res = await waFetch('instance/fetchInstances');
    const instances = await res.json();
    const openInstance = (instances || []).find(i => i.connectionStatus === 'open' && i.name?.startsWith('finca_mgr_'));
    if (openInstance) {
      window._activeWaInstance = openInstance.name;
      localStorage.setItem('wa_instance_name', openInstance.name);
      return true;
    }
  } catch {}

  return false;
}

export async function listGroups() {
  const name = getInstanceName();
  try {
    const res = await waFetch(`group/fetchAllGroups/${name}?getParticipants=false`);
    const groups = await res.json();
    if (Array.isArray(groups) && groups.length > 0) {
      return groups.map(g => ({
        remoteJid: g.id || g.remoteJid,
        name: g.subject || g.name || g.pushName || g.id,
      }));
    }
  } catch (e) {
    console.warn('fetchAllGroups error, trying fallback:', e);
  }

  try {
    const res = await waFetch(`chat/findChats/${name}`, {
      method: 'POST',
      body: '{}',
    });
    const allChats = await res.json();
    return (allChats || [])
      .filter(c => (c.remoteJid || c.id)?.endsWith('@g.us'))
      .map(c => ({
        remoteJid: c.remoteJid || c.id,
        name: c.subject || c.pushName || c.name || c.remoteJid || c.id,
      }));
  } catch (e) {
    console.error('listGroups fallback error:', e);
    return [];
  }
}

export async function joinGroup(inviteCode) {
  const name = getInstanceName();
  const res = await waFetch(`group/join/${name}`, {
    method: 'POST',
    body: JSON.stringify({ inviteCode }),
  });
  const data = await res.json();
  if (data?.id) {
    localStorage.setItem('whatsapp_group_jid', data.id);
  }
  return data;
}

export async function sendWhatsApp(mensaje) {
  let groupJid = localStorage.getItem('whatsapp_group_jid') || window._empresaWhatsAppConfig?.whatsapp_group_jid;
  if (!groupJid) {
    const empresaId = getActiveEmpresaId();
    if (empresaId) {
      await loadWhatsAppConfig(empresaId).catch(() => {});
      groupJid = localStorage.getItem('whatsapp_group_jid') || window._empresaWhatsAppConfig?.whatsapp_group_jid;
    }
  }
  if (!groupJid) return false;
  const payload = JSON.stringify({ number: groupJid, text: mensaje });
  try {
    await waFetch(`message/sendText/${getInstanceName()}`, {
      method: 'POST',
      body: payload,
    });
    return true;
  } catch (e) {
    try {
      const ok = await checkConnection();
      if (ok) {
        await waFetch(`message/sendText/${getInstanceName()}`, {
          method: 'POST',
          body: payload,
        });
        return true;
      }
    } catch {}
    console.warn('WhatsApp send failed:', e);
    return false;
  }
}

function getLocalToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function checkPendingVaccines() {
  if (!isAlertEnabled('ganado', 'vacunas')) return;
  const today = getLocalToday();
  const sentKey = `${SENT_TODAY_KEY}_${today}`;
  const alreadySent = new Set(JSON.parse(localStorage.getItem(sentKey) || '[]'));
  try {
    const vaccines = await restFetch(`/rest/v1/animal_vacunas?fecha=eq.${today}&select=*`);

    const pending = vaccines.filter(v => v.estado === 'Programada');
    if (!pending.length) return;

    const notified = getNotifiedSet();

    for (const vac of pending) {
      if (notified.has(vac.id)) continue;
      if (alreadySent.has(vac.id)) continue;

      let animalName = `Animal #${vac.animal_id?.substring(0, 6) || '?'}`;
      try {
        const animal = await db.ganado.get(vac.animal_id);
        if (animal?.nombre) animalName = animal.nombre;
      } catch {}

      const serverVac = await restFetch(`/rest/v1/animal_vacunas?id=eq.${vac.id}&select=estado`);
        if (!serverVac || serverVac.length === 0 || serverVac[0].estado !== 'Programada') {
          notified.add(vac.id);
          alreadySent.add(vac.id);
          continue;
        }

      await sendWhatsApp(
        `🔔 RECORDATORIO - Vacuna para Hoy\nAnimal: ${animalName}\nVacuna: ${vac.nombre}\nDosis: ${vac.dosis || 'N/A'}\nObservación: ${vac.observaciones || 'N/A'}\nFecha: ${vac.fecha}`
      );

      notified.add(vac.id);
      alreadySent.add(vac.id);
    }

    saveNotifiedSet(notified);
    localStorage.setItem(sentKey, JSON.stringify([...alreadySent]));
  } catch (e) {
    console.warn('checkPendingVaccines error:', e);
  }
}

export async function checkPendingFumigaciones() {
  if (!isAlertEnabled('ganado', 'fumigaciones')) return;
  const today = getLocalToday();
  const sentKey = `${SENT_FUMIG_TODAY_KEY}_${today}`;
  const alreadySent = new Set(JSON.parse(localStorage.getItem(sentKey) || '[]'));
  try {
    const fumigaciones = await restFetch(`/rest/v1/animal_fumigaciones?fecha=eq.${today}&select=*`);
    const pending = fumigaciones.filter(f => f.estado === 'Programada');
    if (!pending.length) return;

    const notified = getFumigNotifiedSet();

    for (const fum of pending) {
      if (notified.has(fum.id)) continue;
      if (alreadySent.has(fum.id)) continue;

      let animalName = `Animal #${fum.animal_id?.substring(0, 6) || '?'}`;
      try {
        const animal = await db.ganado.get(fum.animal_id);
        if (animal?.nombre) animalName = animal.nombre;
      } catch {}

      const serverFum = await restFetch(`/rest/v1/animal_fumigaciones?id=eq.${fum.id}&select=estado`);
      if (!serverFum || serverFum.length === 0 || serverFum[0].estado !== 'Programada') {
        notified.add(fum.id);
        alreadySent.add(fum.id);
        continue;
      }

      await sendWhatsApp(
        `🔔 RECORDATORIO - Fumigación para Hoy\nAnimal: ${animalName}\nProducto: ${fum.producto}\nDosis: ${fum.dosis || 'N/A'}\nObservación: ${fum.observaciones || 'N/A'}\nFecha: ${fum.fecha}`
      );

      notified.add(fum.id);
      alreadySent.add(fum.id);
    }

    saveFumigNotifiedSet(notified);
    localStorage.setItem(sentKey, JSON.stringify([...alreadySent]));
  } catch (e) {
    console.warn('checkPendingFumigaciones error:', e);
  }
}

function getFumigNotifiedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIFIED_FUMIG_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveFumigNotifiedSet(set) {
  localStorage.setItem(NOTIFIED_FUMIG_KEY, JSON.stringify([...set]));
}

export async function checkOverdueVaccines() {
  if (!isAlertEnabled('ganado', 'vacunas')) return;
  const today = getLocalToday();
  const sentKey = 'wa_overdue_sent_today_' + today;
  const alreadySent = new Set(JSON.parse(localStorage.getItem(sentKey) || '[]'));
  try {
    const pastDate = new Date();
    pastDate.setDate(pastDate.getDate() - 1);
    const yesterday = `${pastDate.getFullYear()}-${String(pastDate.getMonth() + 1).padStart(2, '0')}-${String(pastDate.getDate()).padStart(2, '0')}`;

    const vaccines = await restFetch(`/rest/v1/animal_vacunas?fecha=lte.${yesterday}&estado=eq.Programada&select=*`);
    if (!vaccines || vaccines.length === 0) return;

    for (const vac of vaccines) {
      if (alreadySent.has(vac.id)) continue;

      let animalName = `Animal #${vac.animal_id?.substring(0, 6) || '?'}`;
      try {
        const animal = await db.ganado.get(vac.animal_id);
        if (animal?.nombre) animalName = animal.nombre;
      } catch {}

      await sendWhatsApp(
        `⚠️ Vacuna ATRASADA\nAnimal: ${animalName}\nVacuna: ${vac.nombre}\nDosis: ${vac.dosis || 'N/A'}\nFecha programada: ${vac.fecha}\nFinca: ${window._empresaNombre || ''}`
      );

      alreadySent.add(vac.id);
    }

    localStorage.setItem(sentKey, JSON.stringify([...alreadySent]));
  } catch (e) {
    console.warn('checkOverdueVaccines error:', e);
  }
}

export async function checkUpcomingVaccines() {
  if (!isAlertEnabled('ganado', 'vacunas')) return;
  const today = getLocalToday();
  const sentKey = 'wa_upcoming_sent_' + today;
  const alreadySent = new Set(JSON.parse(localStorage.getItem(sentKey) || '[]'));
  try {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

    const vaccines = await restFetch(`/rest/v1/animal_vacunas?fecha=eq.${tomorrowStr}&estado=eq.Programada&select=*`);
    if (!vaccines || vaccines.length === 0) return;

    for (const vac of vaccines) {
      if (alreadySent.has(vac.id)) continue;

      let animalName = `Animal #${vac.animal_id?.substring(0, 6) || '?'}`;
      try {
        const animal = await db.ganado.get(vac.animal_id);
        if (animal?.nombre) animalName = animal.nombre;
      } catch {}

      await sendWhatsApp(
        `📅 RECORDATORIO - Vacuna para MAÑANA\nAnimal: ${animalName}\nVacuna: ${vac.nombre}\nDosis: ${vac.dosis || 'N/A'}\nObservación: ${vac.observaciones || 'N/A'}\nFecha: ${tomorrowStr}\nFinca: ${window._empresaNombre || ''}`
      );

      alreadySent.add(vac.id);
    }

    localStorage.setItem(sentKey, JSON.stringify([...alreadySent]));
  } catch (e) {
    console.warn('checkUpcomingVaccines error:', e);
  }
}

const NOTIFIED_LOTE_KEY = 'wa_notified_lote_apps';
const SENT_LOTE_TODAY_KEY = 'wa_sent_lote_today';

function getLoteNotifiedSet() {
  try { return new Set(JSON.parse(localStorage.getItem(NOTIFIED_LOTE_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveLoteNotifiedSet(set) {
  localStorage.setItem(NOTIFIED_LOTE_KEY, JSON.stringify([...set]));
}

export async function checkAplicacionesDelMes() {
  if (!isAlertEnabled('cafetal', 'calendario_manejo')) return;
  const today = getLocalToday();
  const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id');
  if (!empresaId) return;
  const sentKey = `${SENT_LOTE_TODAY_KEY}_${today}`;
  const alreadySent = new Set(JSON.parse(localStorage.getItem(sentKey) || '[]'));
  const notified = getLoteNotifiedSet();
  try {
    const lotes = await restFetch(`/rest/v1/lotes?empresa_id=eq.${empresaId}&select=*`);
    let aplicadas = await restFetch(`/rest/v1/lote_aplicaciones?empresa_id=eq.${empresaId}&estado=eq.Aplicada&select=lote_id,producto,fecha`);
    if (!Array.isArray(aplicadas)) aplicadas = [];

    for (const lote of (Array.isArray(lotes) ? lotes : [])) {
      if (!lote.edad_categoria) continue;
      const plan = getPlanIfcafe(parseInt(lote.altura_msnm) || 0);

      for (const item of plan) {
        const matchFecha = new Date(2026, item.mes - 1, 15).toISOString().split('T')[0];
        if (matchFecha !== today) continue;

        const productKey = normalizarProducto(item.producto);
        const yaHecha = aplicadas.some(a =>
          a.lote_id === lote.id &&
          a.producto && normalizarProducto(a.producto) === productKey &&
          a.fecha && a.fecha.startsWith(matchFecha.substring(0, 7))
        );
        if (yaHecha) continue;

        const dedupKey = `wa_notif_lote_${lote.id}_${item.mes}_${productKey}`;
        if (notified.has(dedupKey)) continue;
        if (alreadySent.has(dedupKey)) continue;

        let numPlantas = lote.num_plantas || 0;
        let edadCat = lote.edad_categoria;
        let operarios = [];
        try {
          const personalList = await db.lote_personal.where('lote_id').equals(lote.id).toArray();
          for (const p of personalList) {
            const person = await db.personal.get(p.personal_id);
            if (person?.nombre) operarios.push(person.nombre);
          }
        } catch {}

        const dosisCalc = getDosisPorEdad(edadCat);
        const orden = obtenerOrdenDia(lote.nombre || '', item.producto, dosisCalc, operarios);

        await sendWhatsApp(
          `🌱 AVISO DE ABONADA - ${lote.nombre}\n\n` +
          `Producto: ${item.producto}\n` +
          `🥤 Dosis: ${dosisCalc?.porAplicacion?.vasitoLabel || 'N/A'} por planta\n` +
          `📦 Total: ${numPlantas} plantas\n` +
          (operarios.length > 0 ? `👷 Personal: ${operarios.join(', ')}\n\n` : '\n') +
          `📋 Orden del día:\n"${orden}"\n\n` +
          `⚠️ NO aplicar si la tierra está seca.\n` +
          `Esperá al menos 3 días de lluvia fuerte.`
        );

        notified.add(dedupKey);
        alreadySent.add(dedupKey);
      }
    }

    saveLoteNotifiedSet(notified);
    localStorage.setItem(sentKey, JSON.stringify([...alreadySent]));
  } catch (e) {
    console.warn('checkAplicacionesDelMes error:', e);
  }
}

export async function checkAnalisisSueloPendiente() {
  const mesActual = new Date().getMonth() + 1;
  if (mesActual !== 2 && mesActual !== 3) return;

  const today = getLocalToday();
  const sentKey = 'wa_suelo_analisis_sent_' + today;
  const alreadySent = new Set(JSON.parse(localStorage.getItem(sentKey) || '[]'));
  try {
    const lotes = await db.lotes.toArray();
    for (const lote of lotes) {
      if (alreadySent.has(lote.id)) continue;

      const apps = await restFetch(`/rest/v1/lote_aplicaciones?lote_id=eq.${lote.id}&tipo=eq.An%C3%A1lisis%20de%20Suelo&order=fecha.desc&limit=1`);
      const ultimoAnalisis = Array.isArray(apps) ? apps[0] : null;
      if (ultimoAnalisis) {
        const fechaAnalisis = new Date(ultimoAnalisis.fecha + 'T12:00:00');
        const mesesDiff = (new Date() - fechaAnalisis) / (1000 * 60 * 60 * 24 * 30);
        if (mesesDiff < 11) continue;
      }

      await sendWhatsApp(
        `📊 Recordatorio de análisis de suelo\n\nLote: ${lote.nombre}\n⚠️ No tiene análisis de suelo en los últimos 11 meses.\nFebrero/Marzo es el momento ideal para tomar las muestras.\n\nFinca: ${window._empresaNombre || ''}`
      );

      alreadySent.add(lote.id);
    }

    localStorage.setItem(sentKey, JSON.stringify([...alreadySent]));
  } catch (e) {
    console.warn('checkAnalisisSueloPendiente error:', e);
  }
}

export async function checkEnmiendaCal() {
  const mesActual = new Date().getMonth() + 1;
  if (mesActual !== 3 && mesActual !== 4) return;

  const today = getLocalToday();
  const sentKey = 'wa_cal_sent_' + today;
  const alreadySent = new Set(JSON.parse(localStorage.getItem(sentKey) || '[]'));
  try {
    const apps = await restFetch(`/rest/v1/lote_aplicaciones?tipo=eq.An%C3%A1lisis%20de%20Suelo&order=fecha.desc&limit=50`);
    if (!apps || apps.length === 0) return;

    for (const app of apps) {
      if (alreadySent.has(app.lote_id)) continue;

      let ph = null;
      try {
        const obs = JSON.parse(app.observaciones || '{}');
        ph = parseFloat(obs.ph) || null;
      } catch {}

      if (ph !== null && ph < 5.5) {
        const enmiendas = await restFetch(`/rest/v1/lote_aplicaciones?lote_id=eq.${app.lote_id}&producto=ilike.*cal*&fecha=gte.${today.split('-')[0]}-01-01&limit=1`);
        const tieneCal = Array.isArray(enmiendas) && enmiendas.length > 0;
        if (tieneCal) continue;

        let loteNombre = `Lote #${app.lote_id?.substring(0, 6)}`;
        try {
          const lote = await db.lotes.get(app.lote_id);
          if (lote?.nombre) loteNombre = lote.nombre;
        } catch {}

        await sendWhatsApp(
          `⚠️ Alerta: Acidez en ${loteNombre}\n\npH detectado: ${ph} — muy ácido\n📍 Aplicar cal agrícola (carbonato de calcio)\n⏳ Respetar 60 días de reposo antes de la 1ra fertilización (Mayo o Junio según zona)\n\nFinca: ${window._empresaNombre || ''}`
        );

        alreadySent.add(app.lote_id);
      }
    }

    localStorage.setItem(sentKey, JSON.stringify([...alreadySent]));
  } catch (e) {
    console.warn('checkEnmiendaCal error:', e);
  }
}

export async function actualizarSaludPorPlan() {
  // Desactivado: ya no se penaliza la salud ni se envían alertas de salud del lote por WhatsApp
  return;
}

function getActiveEmpresaId() {
  return window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
}

export async function checkMotoresAceite(opts = {}) {
  const empresaId = getActiveEmpresaId();
  if (!empresaId || !navigator.onLine) return;
  if (!isAlertEnabled('motores', 'cambio_aceite', empresaId)) return;
  try {
    const FIVE_HOURS_MS = 5 * 60 * 60 * 1000;
    const now = Date.now();
    const forceMotorId = opts?.forceMotorId ? String(opts.forceMotorId) : '';
    const [motores, mants] = await Promise.all([
      restFetch(`/rest/v1/motores?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,nombre,horas,max_horas`).catch(() => []),
      restFetch(`/rest/v1/motor_mantenimientos?empresa_id=eq.${encodeURIComponent(empresaId)}&select=motor_id`).catch(() => []),
    ]);
    const mantSet = new Set((Array.isArray(mants) ? mants : []).map(x => x.motor_id));

    for (const m of (Array.isArray(motores) ? motores : [])) {
      const hasPrevMant = mantSet.has(m.id);
      const limit = hasPrevMant ? (Number(m.max_horas) || 100) : 80;
      const horas = Number(m.horas) || 0;
      const tsKey = `wa_motor_aceite_ts_${m.id}`;

      if (horas < limit) {
        localStorage.removeItem(tsKey);
        continue;
      }

      if (forceMotorId && String(m.id) === forceMotorId) {
        localStorage.removeItem(tsKey);
      }

      const lastSent = Number(localStorage.getItem(tsKey) || 0);
      if (lastSent && (now - lastSent) < FIVE_HOURS_MS) continue;

      const sent = await sendWhatsApp(
        `🛢️ *ALERTA DE MOTOR - Cambio de aceite requerido*\n` +
        `Equipo: ${m.nombre || 'Motor'}\n` +
        `Horas acumuladas: ${horas} h (límite ${limit} h${hasPrevMant ? '' : ' · 1er cambio'})\n` +
        `Finca: ${window._empresaNombre || ''}`
      );
      if (sent) {
        localStorage.setItem(tsKey, String(now));
      }
    }
  } catch (e) {
    console.warn('checkMotoresAceite error:', e);
  }
}

export async function checkPartosProximos(opts = {}) {
  const empresaId = getActiveEmpresaId();
  if (!empresaId || !navigator.onLine) return;
  if (!isAlertEnabled('ganado', 'partos', empresaId)) return;
  const today = getLocalToday();
  const TWO_DAYS_MS = 48 * 60 * 60 * 1000;
  const FIFTEEN_DAYS_MS = 15 * 24 * 60 * 60 * 1000;
  const now = Date.now();
  const forceAnimalId = opts?.forceAnimalId ? String(opts.forceAnimalId) : '';

  try {
    const [preñeces, animales] = await Promise.all([
      restFetch(`/rest/v1/animal_preñez?empresa_id=eq.${encodeURIComponent(empresaId)}&estado=eq.Preñada&select=id,animal_id,fecha_monta,fecha_probable_parto,fecha_parto`).catch(() => []),
      restFetch(`/rest/v1/ganado?empresa_id=eq.${encodeURIComponent(empresaId)}&select=id,nombre`).catch(() => []),
    ]);
    if (!Array.isArray(preñeces) || preñeces.length === 0) return;

    const ganadoMap = new Map((Array.isArray(animales) ? animales : []).map(a => [a.id, a.nombre]));
    const hoy = new Date(`${today}T12:00:00`);

    for (const preg of preñeces) {
      const tsKey = `wa_parto_ts_${preg.animal_id}`;
      if (!preg.fecha_probable_parto || preg.fecha_parto) {
        localStorage.removeItem(tsKey);
        continue;
      }

      const parto = new Date(`${preg.fecha_probable_parto}T12:00:00`);
      const dias = Math.round((parto - hoy) / 86400000);
      if (dias > 30 || dias < -30) continue;

      if (forceAnimalId && String(preg.animal_id) === forceAnimalId) {
        localStorage.removeItem(tsKey);
      }

      const minInterval = dias <= 15 ? TWO_DAYS_MS : FIFTEEN_DAYS_MS;
      const lastSent = Number(localStorage.getItem(tsKey) || 0);
      if (lastSent && (now - lastSent) < minInterval) continue;

      let animalName = ganadoMap.get(preg.animal_id) || '';
      if (!animalName) {
        try {
          const animal = await db.ganado.get(preg.animal_id);
          if (animal?.nombre) animalName = animal.nombre;
        } catch {}
      }
      if (!animalName) {
        animalName = `Animal #${String(preg.animal_id || '').substring(0, 6) || '?'}`;
      }

      let msg;
      if (dias <= 0) {
        const estadoTxt = dias < 0 ? `hace ${Math.abs(dias)} ${Math.abs(dias) === 1 ? 'día' : 'días'}` : '¡HOY!';
        msg = `🐄 *ALERTA DE PARTO - Parto inminente o vencido*\nVaca: ${animalName}\nFecha probable: ${preg.fecha_probable_parto} (${estadoTxt})\nMantener vigilancia continua.\nFinca: ${window._empresaNombre || ''}`;
      } else if (dias <= 15) {
        const cuando = dias === 1 ? 'mañana' : `en ${dias} días`;
        msg = `🐄 *ALERTA DE PARTO - Recta final (${cuando})*\nVaca: ${animalName}\nFecha probable: ${preg.fecha_probable_parto}\nRevisar ubre y signos de parto.\nFinca: ${window._empresaNombre || ''}`;
      } else {
        msg = `🐄 *AVISO DE GESTACIÓN - Mes 9 de gestación*\nVaca: ${animalName}\nFaltan aprox. ${dias} días para el parto (${preg.fecha_probable_parto}).\nIr preparando cuidados de parto.\nFinca: ${window._empresaNombre || ''}`;
      }

      const sent = await sendWhatsApp(msg);
      if (sent) {
        localStorage.setItem(tsKey, String(now));
      }
    }
  } catch (e) {
    console.warn('checkPartosProximos error:', e);
  }
}
