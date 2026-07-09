import db from './db.js';
import { restFetch } from './auth.js';

const EVOLUTION_API = '/api/wa-proxy';
const NOTIFIED_KEY = 'wa_notified_vaccines';
const SENT_TODAY_KEY = 'wa_sent_today';

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

export async function checkPendingVaccines() {
  const today = new Date().toISOString().split('T')[0];
  const sentKey = `${SENT_TODAY_KEY}_${today}`;
  const alreadySent = new Set(JSON.parse(localStorage.getItem(sentKey) || '[]'));
  try {
    const vaccines = await restFetch(`animal_vacunas?fecha=eq.${today}&select=*`);

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

      const serverVac = await restFetch(`animal_vacunas?id=eq.${vac.id}&select=estado`);
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
