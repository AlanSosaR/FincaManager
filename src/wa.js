import db from './db.js';
import { restFetch } from './auth.js';
import { getDosisPorEdad, getPlanIfcafe, getZonaLabel, obtenerOrdenDia } from './utils/calculadora_dosis.js';

const EVOLUTION_API = '/api/wa-proxy';
const NOTIFIED_KEY = 'wa_notified_vaccines';
const SENT_TODAY_KEY = 'wa_sent_today';
const NOTIFIED_FUMIG_KEY = 'wa_notified_fumigaciones';
const SENT_FUMIG_TODAY_KEY = 'wa_sent_fumig_today';

function getInstanceName() {
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

export async function createInstance() {
  const name = getInstanceName();
  const res = await waFetch(`instance/create`, {
    method: 'POST',
    body: JSON.stringify({ instanceName: name, integration: 'WHATSAPP-BAILEYS', qrcode: true }),
  });
  return res.json();
}

export async function deleteInstance() {
  const name = getInstanceName();
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

export async function getQR() {
  const name = getInstanceName();
  const res = await waFetch(`instance/connect/${name}`);
  return res.json();
}

export async function checkConnection() {
  const name = getInstanceName();
  try {
    const res = await waFetch(`instance/connectionState/${name}`);
    const data = await res.json();
    return data?.instance?.state === 'open';
  } catch {
    return false;
  }
}

export async function listGroups() {
  const name = getInstanceName();
  const res = await waFetch(`chat/findChats/${name}`, {
    method: 'POST',
    body: '{}',
  });
  const allChats = await res.json();
  return (allChats || []).filter(c => c.remoteJid?.endsWith('@g.us'));
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
  const groupJid = localStorage.getItem('whatsapp_group_jid');
  if (!groupJid) return;
  const name = getInstanceName();
  try {
    await waFetch(`message/sendText/${name}`, {
      method: 'POST',
      body: JSON.stringify({ number: groupJid, text: mensaje }),
    });
  } catch (e) {
    console.warn('WhatsApp send failed:', e);
  }
}

function getLocalToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function checkPendingVaccines() {
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
  const today = getLocalToday();
  const sentKey = `${SENT_LOTE_TODAY_KEY}_${today}`;
  const alreadySent = new Set(JSON.parse(localStorage.getItem(sentKey) || '[]'));
  try {
    const apps = await restFetch(`/rest/v1/lote_aplicaciones?fecha=eq.${today}&select=*`);
    const pending = apps.filter(a => a.estado === 'Programada');
    if (!pending.length) return;

    const notified = getLoteNotifiedSet();

    for (const app of pending) {
      if (notified.has(app.id)) continue;
      if (alreadySent.has(app.id)) continue;

      let loteNombre = `Lote #${app.lote_id?.substring(0, 6) || '?'}`;
      let numPlantas = 0;
      let edadCat = null;
      let operarios = [];
      try {
        const lote = await db.lotes.get(app.lote_id);
        if (lote?.nombre) loteNombre = lote.nombre;
        if (lote?.num_plantas) numPlantas = lote.num_plantas;
        if (lote?.edad_categoria) edadCat = lote.edad_categoria;
      } catch {}

      try {
        const personalList = await db.lote_personal.where('lote_id').equals(app.lote_id).toArray();
        for (const p of personalList) {
          const person = await db.personal.get(p.personal_id);
          if (person?.nombre) operarios.push(person.nombre);
        }
      } catch {}

      const serverApp = await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${app.id}&select=estado`);
      if (!serverApp || serverApp.length === 0 || serverApp[0].estado !== 'Programada') {
        notified.add(app.id);
        alreadySent.add(app.id);
        continue;
      }

      const dosisCalc = getDosisPorEdad(edadCat);
      const orden = obtenerOrdenDia(loteNombre, app.producto, dosisCalc, operarios);

      await sendWhatsApp(
        `🌱 AVISO DE ABONADA - ${loteNombre}\n\n` +
        `Producto: ${app.producto}\n` +
        `🥤 Dosis: ${app.dosis || (dosisCalc?.porAplicacion?.vasitoLabel || 'N/A')} por planta\n` +
        `📦 Total: ${numPlantas} plantas\n` +
        (operarios.length > 0 ? `👷 Personal: ${operarios.join(', ')}\n\n` : '\n') +
        `📋 Orden del día:\n"${orden}"\n\n` +
        `⚠️ NO aplicar si la tierra está seca.\n` +
        `Esperá al menos 3 días de lluvia fuerte.`
      );

      notified.add(app.id);
      alreadySent.add(app.id);
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
        `📊 Recordatorio IFCAFE\n\nLote: ${lote.nombre}\n⚠️ No tiene análisis de suelo en los últimos 11 meses.\nFebrero/Marzo es el momento ideal para tomar las muestras.\n\nFinca: ${window._empresaNombre || ''}`
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
  const today = getLocalToday();
  const sentKey = 'wa_salud_sent_' + today;
  const alreadySent = new Set(JSON.parse(localStorage.getItem(sentKey) || '[]'));
  try {
    const lotes = await db.lotes.toArray();
    for (const lote of lotes) {
      if (!lote.edad_categoria) continue;

      const planApps = await restFetch(`/rest/v1/lote_aplicaciones?lote_id=eq.${lote.id}&estado=eq.Programada&fecha=lt.${today}&select=id,fecha`);
      const atrasadas = Array.isArray(planApps) ? planApps : [];
      if (atrasadas.length === 0) continue;

      const penalizacion = atrasadas.length * 5;
      const saludActual = lote.salud_porcentaje || 100;
      const nuevaSalud = Math.max(0, saludActual - penalizacion);

      if (nuevaSalud < saludActual) {
        await restFetch(`/rest/v1/lotes?id=eq.${lote.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ salud_porcentaje: nuevaSalud }),
        });

        if (alreadySent.has(lote.id)) continue;

        await sendWhatsApp(
          `⚠️ Salud del lote ${lote.nombre} reducida\n\n` +
          `Motivo: ${atrasadas.length} aplicación(es) del Plan IFCAFE sin realizar\n` +
          `Salud anterior: ${saludActual}%\n` +
          `Salud actual: ${nuevaSalud}%\n\n` +
          `Finca: ${window._empresaNombre || ''}`
        );

        alreadySent.add(lote.id);
      }
    }

    localStorage.setItem(sentKey, JSON.stringify([...alreadySent]));
  } catch (e) {
    console.warn('actualizarSaludPorPlan error:', e);
  }
}
