import { restFetch, restInsert, getUser } from '../auth.js';
import { sendWhatsApp } from '../wa.js';
import { invalidateCache, syncTable } from '../sync.js';
import db from '../db.js';
import { showModal, closeModal } from '../modals.js';
import { uploadImage } from '../utils/image_uploader.js';
import {
  isFuelMotor,
  isLikelyFuelEquipment,
  parseMotorConfig,
  serializeMotorNotas,
  encodeFuelLoadTag,
  computeFuelMotorStats,
  resolveSharedFuelPrice,
  saveSharedFuelPrice,
  formatLiters,
  formatLitersLabel,
  formatCurrencyL,
} from '../utils/motor_fuel_config.js';
import {
  normalizeAreaName,
  toLocalIsoDate,
  buildFuelSentMap,
  fetchEmpresaGastosFresh,
  getWeekMondayIso,
} from '../utils/motor_fuel_cuentas.js';

function compressImage(file, maxWidth = 1000, quality = 0.75) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;
        if (width > height) {
          if (width > maxWidth) {
            height = Math.round((height * maxWidth) / width);
            width = maxWidth;
          }
        } else {
          if (height > maxWidth) {
            width = Math.round((width * maxWidth) / height);
            height = maxWidth;
          }
        }
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

let _ifcafeLoteId = null;
let _calYear = new Date().getFullYear();
let _calMonth = new Date().getMonth();
let _selectedDay = new Date().getDate();
let _ifcafeEvents = [];
let _ifcafeLotes = [];
let _allLotes = [];
let _personalList = [];
let _currentUser = null;
let _fuelMotoresList = [];
let _empresaGastosList = [];

const MESES_NOMBRE = {
  1: 'Enero', 2: 'Febrero', 3: 'Marzo', 4: 'Abril',
  5: 'Mayo', 6: 'Junio', 7: 'Julio', 8: 'Agosto',
  9: 'Septiembre', 10: 'Octubre', 11: 'Noviembre', 12: 'Diciembre'
};

const badgeStyle = {
  Realizada: 'background:#2d3e2c;color:#fff;',
  Aplicada: 'background:#2d3e2c;color:#fff;',
  Pendiente: 'background:#c9a227;color:#fff;',
  Programada: 'background:#c9a227;color:#fff;',
  Atrasada: 'background:#FF4103;color:#fff;'
};

const tipoIcons = {
  'Aplicación Foliar': '🍃',
  'Foliar': '🍃',
  'Fertilizante': '🌿',
  'Fertilización al Suelo': '🌿',
  'Control Fitosanitario': '🛡️',
  'Manejo de Tejido': '✂️',
  'Poda': '✂️',
  'Limpieza': '🧹',
  'Análisis de Suelo': '🧪',
  'Otro': '📌'
};

function getLocalToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function waNotifiedKey(appFecha, loteId) {
  return `wa_notified_app_${appFecha}_${loteId}`;
}

function esc(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

function getIconForTipo(tipo) {
  if (!tipo) return '🌱';
  for (const key of Object.keys(tipoIcons)) {
    if (tipo.toLowerCase().includes(key.toLowerCase())) {
      return tipoIcons[key];
    }
  }
  return '🌱';
}

function resolvePersonalByName(rawName) {
  const nk = normalizeAreaName(rawName);
  if (!nk) return null;
  const exact = (_personalList || []).find(p => normalizeAreaName(p?.nombre) === nk);
  if (exact) return exact;
  return (_personalList || []).find((p) => {
    const pk = normalizeAreaName(p?.nombre);
    return pk && (pk.includes(nk) || nk.includes(pk));
  }) || null;
}

function computeActivityPendingCuentasAmount(ev) {
  if (!ev || !ev.fecha) return 0;
  const todayStr = getLocalToday();
  if (!ev.isFuelUsage && (ev.estado === 'Cancelada' || (ev.estado !== 'Aplicada' && ev.estado !== 'Realizada' && ev.fecha > todayStr))) {
    return 0;
  }

  const sentFuelByLoadId = buildFuelSentMap(_empresaGastosList || []);
  const personalGastos = (_empresaGastosList || []).filter(g => String(g.categoria || '').toLowerCase() === 'personal');

  let pendingFuel = 0;
  for (const fl of (Array.isArray(ev.linkedFuelLoads) ? ev.linkedFuelLoads : [])) {
    const cost = Math.max(0, Math.round((Number(fl?.cost) || 0) * 100) / 100);
    if (!(cost > 0)) continue;
    const sentGasto = fl.id ? sentFuelByLoadId.get(String(fl.id)) : null;
    if (!sentGasto || Math.abs((Number(sentGasto.monto) || 0) - cost) >= 0.01) {
      pendingFuel += cost;
    }
  }

  let pendingLabor = 0;
  const seenWorkerIds = new Set();
  const weekTag = getWeekMondayIso(ev.fecha);
  String(ev.operador || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .forEach((rawName) => {
      const pObj = resolvePersonalByName(rawName);
      if (!pObj?.id) return;
      const pId = String(pObj.id);
      if (seenWorkerIds.has(pId)) return;
      seenWorkerIds.add(pId);
      const pagoDiario = Math.max(0, Math.round((Number(pObj.pago_diario) || 0) * 100) / 100);
      if (!(pagoDiario > 0)) return;
      const dayRefTag = `[ref:${pId}_dia_${ev.fecha}]`;
      const weekRefTag = `[ref:${pId}_sem_${weekTag}]`;
      const hasWeekGasto = personalGastos.some(g => String(g.descripcion || '').includes(weekRefTag));
      if (hasWeekGasto) return;
      const sentDayGasto = personalGastos.find(g => String(g.descripcion || '').includes(dayRefTag)) || null;
      if (!sentDayGasto || Math.abs((Number(sentDayGasto.monto) || 0) - pagoDiario) >= 0.01) {
        pendingLabor += pagoDiario;
      }
    });

  return Math.round((pendingFuel + pendingLabor) * 100) / 100;
}

function notifyExpandedActivityFooter() {
  const detailsPanel = document.getElementById('plan-day-details');
  if (!detailsPanel) {
    window._onPlanExpandedActivityChange?.(null);
    return;
  }
  const openCard = Array.from(detailsPanel.querySelectorAll('.plan-ev')).find(
    card => card.querySelector('.plan-ev-details')?.style.display === 'block'
  );
  if (!openCard) {
    window._onPlanExpandedActivityChange?.(null);
    return;
  }
  const evId = openCard.dataset.planEvId || '';
  const ev = _ifcafeEvents.find(e => String(e.id) === String(evId));
  const pendingAmount = computeActivityPendingCuentasAmount(ev);
  window._onPlanExpandedActivityChange?.(pendingAmount > 0 ? { evId: ev?.id || evId, pendingAmount } : null);
}

function eventCardHtml(ev) {
  const escSafe = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const todayStr = getLocalToday();
  const linkedLoads = Array.isArray(ev.linkedFuelLoads) ? ev.linkedFuelLoads : [];
  const totalFuelLiters = Math.round(linkedLoads.reduce((s, fl) => s + (Number(fl.liters) || 0), 0) * 10) / 10;
  const totalFuelCost = Math.round(linkedLoads.reduce((s, fl) => s + (Number(fl.cost) || 0), 0) * 100) / 100;
  const anyMotoguadana = linkedLoads.some(fl => fl.motorIcon === '✂️' || /motoguad|guadañ|chapea|desbroz|orillad/i.test(fl.motorNombre || ''));

  const opSeen = new Set();
  const listaOperadores = [];
  String(ev.operador || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)
    .forEach((op) => {
      const k = normalizeAreaName(op);
      if (!k || opSeen.has(k)) return;
      opSeen.add(k);
      listaOperadores.push(op);
    });

  const colaboradoresConPrecio = listaOperadores.map(op => ({
    nombre: op,
    pagoDiario: Math.max(0, Math.round((Number(resolvePersonalByName(op)?.pago_diario) || 0) * 100) / 100),
  }));
  const totalLaborCost = Math.round(colaboradoresConPrecio.reduce((s, c) => s + c.pagoDiario, 0) * 100) / 100;
  const laborHeaderSubHtml = colaboradoresConPrecio.length > 0 && totalLaborCost > 0
    ? `<div style="font-size:12px; color:#4a5d48; font-weight:700; margin-top:2px;">👥 ${colaboradoresConPrecio.length} ${colaboradoresConPrecio.length === 1 ? 'colaborador' : 'colaboradores'} · <span style="color:#1b6e1b; font-weight:800;">${escSafe(formatCurrencyL(totalLaborCost))}</span></div>`
    : '';

  let diasTranscurridosTexto = '';
  const showElapsedTime = ev.isFuelUsage || ev.estado === 'Realizada' || ev.estado === 'Aplicada';
  if (showElapsedTime && ev.fecha) {
    const pFecha = ev.fecha.split('-');
    const fActividad = new Date(parseInt(pFecha[0], 10), parseInt(pFecha[1], 10) - 1, parseInt(pFecha[2], 10) || 1);
    const pToday = todayStr.split('-');
    const fHoy = new Date(parseInt(pToday[0], 10), parseInt(pToday[1], 10) - 1, parseInt(pToday[2], 10) || 1);
    const diffDays = Math.round((fHoy.getTime() - fActividad.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) diasTranscurridosTexto = 'Hoy (hace 0 días)';
    else if (diffDays === 1) diasTranscurridosTexto = 'Ayer (hace 1 día)';
    else if (diffDays > 1) diasTranscurridosTexto = `Hace ${diffDays} días (${fActividad.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })})`;
    else if (diffDays < 0) diasTranscurridosTexto = 'Registrada para hoy';
  }

  const machinesDetailsHtml = linkedLoads.length > 0 ? `
    <div style="grid-column: 1 / -1; margin-top: 8px;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #526350; letter-spacing: 0.5px; margin-bottom: 5px; display: flex; align-items: center; gap: 4px;">
        <span>${anyMotoguadana ? '✂️' : '⚙️'}</span>
        <span>${anyMotoguadana ? 'Motoguadañas usadas:' : 'Equipos usados:'}</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 5px; background: #f8faf7; border: 1px solid #e3ece1; border-radius: 10px; padding: 8px 10px;">
        ${linkedLoads.map((fl) => {
          const cTxt = fl.cost > 0 ? ` · <span style="color:#1b6e1b; font-weight:800;">${escSafe(formatCurrencyL(fl.cost))}</span>` : '';
          return `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12.5px;">
              <span style="font-weight:700; color:#192b18; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escSafe(fl.motorIcon || '✂️')} ${escSafe(fl.motorNombre)}</span>
              <span style="font-weight:700; color:#4a5d48; white-space:nowrap; flex-shrink:0;">${formatLitersLabel(fl.liters)} de gasolina${cTxt}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  ` : '';

  const colaboradoresDetailsHtml = colaboradoresConPrecio.length > 0 ? `
    <div style="grid-column: 1 / -1; margin-top: 6px;">
      <div style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #526350; letter-spacing: 0.5px; margin-bottom: 5px; display: flex; align-items: center; gap: 4px;">
        <span class="material-symbols-outlined" style="font-size: 14px; color: #2d3e2c;">badge</span>
        <span>Colaborador${colaboradoresConPrecio.length > 1 ? 'es' : ''}:</span>
      </div>
      <div style="display: flex; flex-direction: column; gap: 5px; background: #f8faf7; border: 1px solid #e3ece1; border-radius: 10px; padding: 8px 10px;">
        ${colaboradoresConPrecio.map(c => `
          <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 12.5px;">
            <span style="display: flex; align-items: center; gap: 6px; font-weight: 700; color: #1b6e1b; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
              <span class="material-symbols-outlined" style="font-size: 15px; color: #1b6e1b; flex-shrink: 0;">person</span>
              <span style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${escSafe(c.nombre)}</span>
            </span>
            <span style="font-weight: 800; color: ${c.pagoDiario > 0 ? '#1b6e1b' : '#7c877a'}; white-space: nowrap; flex-shrink: 0;">
              ${c.pagoDiario > 0 ? escSafe(formatCurrencyL(c.pagoDiario)) : 'Sin tarifa'}
            </span>
          </div>
        `).join('')}
      </div>
    </div>
  ` : '';

  const wrapPlanEvSwipe = (innerHtml, { appId = '', fuelGroupId = '', canEdit = false } = {}) => {
    if (!appId && !fuelGroupId) return innerHtml;
    return `
      <div class="plan-ev-swipe-wrap" ${appId ? `data-app-id="${escSafe(appId)}"` : ''} ${fuelGroupId ? `data-fuel-group-id="${escSafe(fuelGroupId)}"` : ''} data-can-edit="${canEdit ? '1' : '0'}" style="position:relative; overflow:hidden; border-radius:14px; margin-bottom:8px;">
        <div class="plan-ev-swipe-bg" style="position:absolute; inset:0; display:flex; align-items:center; justify-content:space-between; pointer-events:none; background:transparent; border-radius:14px;">
          <div class="plan-ev-swipe-del" style="color:#ffffff; display:flex; align-items:center; gap:6px; padding:0 18px; font-size:13px; font-weight:700; opacity:0;">
            <span class="material-symbols-outlined" style="font-size:19px;">delete</span>
            <span>Eliminar</span>
          </div>
          ${canEdit ? `
            <div class="plan-ev-swipe-edit" style="color:#ffffff; display:flex; align-items:center; gap:6px; padding:0 18px; font-size:13px; font-weight:700; opacity:0;">
              <span>Actualizar</span>
              <span class="material-symbols-outlined" style="font-size:19px;">edit</span>
            </div>
          ` : '<div></div>'}
        </div>
        <div class="plan-ev-swipe-fg" style="position:relative; z-index:2; background:#ffffff; touch-action:pan-y; user-select:none; -webkit-user-select:none; transition:transform .18s ease;">
          ${innerHtml}
        </div>
      </div>
    `;
  };

  if (ev.isFuelUsage) {
    const fuelDisplayLiters = linkedLoads.length > 0 ? totalFuelLiters : (Number(ev.liters) || 0);
    const fuelDisplayCost = linkedLoads.length > 0 ? totalFuelCost : (Number(ev.cost) || 0);
    const costBadge = fuelDisplayCost > 0
      ? ` · <span style="color:#1b6e1b; font-weight:800;">${escSafe(formatCurrencyL(fuelDisplayCost))}</span>`
      : '';
    const subParts = [];
    if (linkedLoads.length > 0) subParts.push(`${linkedLoads.length} ${linkedLoads.length === 1 ? 'equipo' : 'equipos'}`);
    subParts.push(`⛽ ${formatLitersLabel(fuelDisplayLiters)} de gasolina${costBadge}`);

    return wrapPlanEvSwipe(`
      <div class="plan-ev" data-plan-ev-id="${escSafe(ev.id || '')}" onclick="window._togglePlanEvCard?.(this, event)" style="margin-bottom:0; cursor:pointer; border:1.5px solid #c8e6c9; background:#ffffff;">
        <div class="plan-ev-head" style="align-items:center;">
          <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
            <span style="font-size:18px; flex-shrink:0;">${escSafe(ev.motorIcon || (anyMotoguadana ? '✂️' : '⛽'))}</span>
            <div style="min-width:0;">
              <p class="plan-ev-producto" style="margin:0;">${escSafe(ev.producto || (anyMotoguadana ? 'Motoguadañas' : 'Uso de equipos'))}</p>
              <div style="font-size:12px; color:#4a5d48; font-weight:700; margin-top:2px;">${subParts.join(' · ')}</div>
              ${laborHeaderSubHtml}
              ${ev.showLote ? `<div class="plan-ev-lote"><span class="material-symbols-outlined" style="font-size:13px;">eco</span> ${escSafe(ev.loteNombre)}</div>` : ''}
            </div>
          </div>
          <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
            <span class="material-symbols-outlined plan-ev-chevron" style="font-size:20px; color:#4a5d48; transition:transform 0.2s;">expand_more</span>
          </div>
        </div>

        <div class="plan-ev-details" style="display:none; margin-top:10px;">
          <div class="plan-ev-meta">
            <div><strong>Tipo:</strong> Uso de equipos en lote</div>
            ${machinesDetailsHtml}
            ${colaboradoresDetailsHtml}
            ${diasTranscurridosTexto ? `
              <div style="grid-column: 1 / -1; margin-top: 6px; color: #1b5e20; font-weight: 700; background: #f1f8f0; padding: 6px 10px; border-radius: 8px; border: 1px solid #d0e7ce; display: flex; align-items: center; gap: 6px; font-size: 12px;">
                <span class="material-symbols-outlined" style="font-size: 16px; color:#2d3e2c;">history</span>
                <span>Tiempo transcurrido: <strong>${diasTranscurridosTexto}</strong></span>
              </div>
            ` : ''}
          </div>
        </div>
      </div>
    `, { fuelGroupId: ev.id, canEdit: false });
  }

  const isRealizada = ev.estado === 'Realizada' || ev.estado === 'Aplicada';
  const isAtrasada = ev.estado === 'Atrasada';
  const badgeLabel = isRealizada ? 'Realizada' : isAtrasada ? 'Atrasada' : 'Programada';
  const icon = getIconForTipo(ev.tipo);
  const canMarkRealizada = !isRealizada && ev.fecha <= todayStr;

  const acciones = [];
  if (canMarkRealizada) {
    acciones.push(`
      <button class="plan-btn-primary" onclick="window.marcarAplicadaDirecta('${ev.id || ''}','${ev.loteId}','${ev.fecha}','${esc(ev.producto)}','${esc(ev.tipo)}','${esc(ev.dosis)}')">
        <span class="material-symbols-outlined" style="font-size:16px;">check_circle</span> Marcar como realizada
      </button>
    `);
  }

  const tipoLower = (ev.tipo || '').toLowerCase();
  const isLimpieza = tipoLower.includes('limpieza');
  const isDosisType = tipoLower.includes('foliar') || tipoLower.includes('fertiliz') || tipoLower.includes('abono') || (tipoLower.includes('suelo') && !tipoLower.includes('análisis') && !tipoLower.includes('analisis')) || tipoLower.includes('fitosanit') || tipoLower.includes('fungic') || tipoLower.includes('insectic');
  const showDosis = ev.dosis && ev.dosis.trim() && ev.dosis !== 'N/A' && isDosisType;

  const cleanObs = (ev.observaciones || '')
    .replace(/👤?\s*Responsables:\s*[^\n]+(\n+|$)/gi, '')
    .trim();

  const headerTitle = isLimpieza ? 'Limpieza' : (ev.producto || 'Actividad del cafetal');
  let headerSubHtml = '';
  if (isLimpieza) {
    const parts = [];
    if (ev.producto) parts.push(escSafe(ev.producto));
    if (linkedLoads.length > 0) {
      parts.push(`⛽ ${formatLitersLabel(totalFuelLiters)} de gasolina${totalFuelCost > 0 ? ` · <span style="color:#1b6e1b; font-weight:800;">${escSafe(formatCurrencyL(totalFuelCost))}</span>` : ''}`);
    }
    if (parts.length > 0) {
      headerSubHtml = `<div style="font-size:12px; color:#4a5d48; font-weight:700; margin-top:2px;">${parts.join(' · ')}</div>`;
    }
  } else if (showDosis) {
    headerSubHtml = `<div style="font-size:12px; color:#4a5d48; font-weight:700; margin-top:2px;">Dosis: ${escSafe(ev.dosis)}</div>`;
  }

  const tipoDetailText = isLimpieza
    ? `Limpieza${ev.producto ? ` · ${escSafe(ev.producto)}` : ''}`
    : `${escSafe(ev.tipo || 'General')}${ev.metodo ? ` · ${escSafe(ev.metodo)}` : ''}`;

  return wrapPlanEvSwipe(`
    <div class="plan-ev" data-plan-ev-id="${escSafe(ev.id || '')}" onclick="window._togglePlanEvCard?.(this, event)" style="margin-bottom:0; cursor:pointer; border:1.5px solid ${isRealizada ? '#c8e6c9' : isAtrasada ? '#ffcdd2' : '#ffe9a8'};">
      <div class="plan-ev-head" style="align-items:center;">
        <div style="display:flex; align-items:center; gap:8px; min-width:0; flex:1;">
          <span style="font-size:18px; flex-shrink:0;">${icon}</span>
          <div style="min-width:0;">
            <p class="plan-ev-producto" style="margin:0;">${escSafe(headerTitle)}</p>
            ${headerSubHtml}
            ${laborHeaderSubHtml}
            ${ev.showLote ? `<div class="plan-ev-lote"><span class="material-symbols-outlined" style="font-size:13px;">eco</span> ${escSafe(ev.loteNombre)}</div>` : ''}
          </div>
        </div>
        <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
          ${isRealizada ? '' : `<span class="plan-ev-badge" style="${badgeStyle[badgeLabel]}">${badgeLabel}</span>`}
          <span class="material-symbols-outlined plan-ev-chevron" style="font-size:20px; color:#4a5d48; transition:transform 0.2s;">expand_more</span>
        </div>
      </div>

      <div class="plan-ev-details" style="display:none; margin-top:10px;">
        <div class="plan-ev-meta">
          <div><strong>Tipo:</strong> ${tipoDetailText}</div>
          ${machinesDetailsHtml}
          ${colaboradoresDetailsHtml}
          ${isRealizada && diasTranscurridosTexto ? `
            <div style="grid-column: 1 / -1; margin-top: 6px; color: #1b5e20; font-weight: 700; background: #f1f8f0; padding: 6px 10px; border-radius: 8px; border: 1px solid #d0e7ce; display: flex; align-items: center; gap: 6px; font-size: 12px;">
              <span class="material-symbols-outlined" style="font-size: 16px; color:#2d3e2c;">history</span>
              <span>Tiempo transcurrido: <strong>${diasTranscurridosTexto}</strong></span>
            </div>
          ` : ''}
        </div>

        ${cleanObs ? `<div class="plan-ev-purpose" style="margin-top:6px; color:#444; background:#f9faf9; padding:6px 10px; border-radius:8px; font-size:12px;"><strong>💬 Obs:</strong> ${escSafe(cleanObs)}</div>` : ''}

        ${ev.foto_url ? `
          <div style="margin-top:10px; position:relative; overflow:hidden; border-radius:12px; border:1px solid #d4dfd2; background:#f4f7f4;">
            <img src="${ev.foto_url}" alt="Foto de la planta" onclick="window.verFotoPlantaModal('${ev.foto_url}', '${esc(ev.producto || ev.tipo)} (${ev.fecha})')" style="width:100%; max-height:160px; object-fit:cover; display:block; cursor:pointer; transition:transform 0.2s;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'">
            <div style="position:absolute; bottom:6px; right:8px; background:rgba(0,0,0,0.65); backdrop-filter:blur(4px); color:#fff; font-size:10.5px; font-weight:700; padding:3px 8px; border-radius:6px; pointer-events:none; display:flex; align-items:center; gap:4px;">
              <span class="material-symbols-outlined" style="font-size:13px;">photo_camera</span> Foto de planta
            </div>
          </div>
        ` : ''}

        ${acciones.length > 0 ? `<div class="plan-ev-actions">${acciones.join('')}</div>` : ''}
      </div>
    </div>`, { appId: (ev.isDb && ev.id) ? ev.id : '', canEdit: Boolean(ev.isDb && ev.id) });
}

function calendarShellHtml(activeLote = null, isEmbedded = false, showLotesResumen = false) {
  const cardStyle = isEmbedded
    ? 'width: 100%; box-sizing: border-box; padding: 0; background: transparent; border: none; box-shadow: none;'
    : 'background: var(--m3-surface-container-lowest, #ffffff); border: 1.5px solid var(--m3-outline-variant, #c7cec3); border-radius: 20px; padding: 18px 16px; box-shadow: 0 4px 16px rgba(45, 62, 44, 0.06); width: 100%; box-sizing: border-box; margin-bottom: 20px;';

  return `
    <div class="cafetal-unified-card" style="${cardStyle}">
      
      ${!isEmbedded ? `
      <!-- Selector de Lotes (Integrado dentro de la tarjeta) -->
      <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 12px; margin-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 36px; height: 36px; border-radius: 10px; background: var(--m3-secondary-container, #daeed5); color: var(--m3-on-secondary-container, #101f10); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            <span class="material-symbols-outlined" style="font-size: 20px;">filter_alt</span>
          </div>
          <div>
            <span style="display: block; font-size: 10.5px; font-weight: 800; color: var(--m3-secondary, #526350); text-transform: uppercase; letter-spacing: 0.6px; line-height: 1.1;">
              Filtrar Cafetal
            </span>
            <label for="ifcafe-lote-select" style="font-size: 13.5px; font-weight: 700; color: var(--m3-primary, #2d3e2c); line-height: 1.2;">
              Lote a gestionar
            </label>
          </div>
        </div>
        
        <div style="flex: 1; min-width: 220px;">
          <div style="position: relative; display: flex; align-items: center;">
            <select id="ifcafe-lote-select" style="width: 100%; height: 44px; font-weight: 600; font-size: 13.5px; border-radius: 12px; border: 1.5px solid var(--m3-primary, #2d3e2c); background: #fdfdfc; color: #1a1c19; padding: 0 38px 0 14px; cursor: pointer; outline: none; -webkit-appearance: none; appearance: none;" onchange="if(this.value){window.navigateTo('plan_ifcafe', this.value)}else{window.navigateTo('plan_ifcafe')}">
              <option value="" ${!activeLote ? 'selected' : ''}>🌾 Todos los Lotes (${_allLotes.length} disponibles)</option>
              ${_allLotes.map(l => `
                <option value="${l.id}" ${activeLote?.id === l.id ? 'selected' : ''}>
                  ☕ ${l.nombre} (${(l.num_plantas || 0).toLocaleString()} plantas${l.variedad ? ' · ' + l.variedad : ''})
                </option>
              `).join('')}
            </select>
            <span class="material-symbols-outlined" style="position: absolute; right: 12px; pointer-events: none; color: var(--m3-primary, #2d3e2c); font-size: 22px;">
              expand_more
            </span>
          </div>
        </div>
      </div>

      <!-- Separador entre Selector y Calendario -->
      <div style="border-top: 1.5px solid #edf1ec; margin: 14px 0 16px 0;"></div>
      ` : ''}

      <div class="da-calendar-layout">
        <div class="da-calendar-card">
          <div class="da-calendar-header">
            <div class="da-cal-nav">
              <button type="button" class="da-cal-nav-btn" onclick="window.changePlanCalMonth(-1)" aria-label="Mes anterior"><span class="material-icons">chevron_left</span></button>
              <h3 id="plan-cal-month-display"></h3>
              <button type="button" class="da-cal-nav-btn" onclick="window.changePlanCalMonth(1)" aria-label="Mes siguiente"><span class="material-icons">chevron_right</span></button>
            </div>
            <div class="da-cal-mob-bar">
              <div style="display:flex; align-items:center; gap:6px;">
                <button type="button" class="da-cal-mob-arrow" onclick="window.navPlanCalPrev()" title="Semana o mes anterior">
                  <span class="material-icons">chevron_left</span>
                </button>
                <span class="da-cal-mob-date" id="plan-cal-mob-date">Fecha</span>
                <button type="button" class="da-cal-mob-arrow" onclick="window.navPlanCalNext()" title="Semana o mes siguiente">
                  <span class="material-icons">chevron_right</span>
                </button>
              </div>
              <button type="button" class="da-cal-mob-toggle" id="plan-cal-toggle-btn" onclick="window.togglePlanCalendarView()">
                <span class="material-icons" id="plan-cal-toggle-icon" style="font-size:14px;">calendar_month</span>
                <span id="plan-cal-toggle-text">Ver mes</span>
              </button>
            </div>
          </div>
          <div class="da-cal-week-strip" id="plan-cal-week-strip" style="width: 100%; box-sizing: border-box;"></div>
          <div class="da-calendar-grid" id="plan-cal-month-grid" style="width: 100%; box-sizing: border-box;">
            <div class="da-cal-day-name">Lun</div><div class="da-cal-day-name">Mar</div><div class="da-cal-day-name">Mié</div><div class="da-cal-day-name">Jue</div><div class="da-cal-day-name">Vie</div><div class="da-cal-day-name">Sáb</div><div class="da-cal-day-name">Dom</div>
            <div class="da-cal-days-container" id="plan-cal-days"></div>
          </div>
          <div class="da-cal-legend" style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed #e8ede8;">
            <div><span class="plan-legend-dot" style="background:#2d3e2c;"></span><span>Realizada</span></div>
            <div><span class="plan-legend-dot" style="background:#c9a227;"></span><span>Programada</span></div>
            <div><span class="plan-legend-dot" style="background:#FF4103;"></span><span>Atrasada</span></div>
          </div>
        </div>

        <div id="plan-day-details-panel">
          <div class="da-day-details" id="plan-day-details" style="width: 100%; box-sizing: border-box;">
            <div class="cafetal-day-details-inner" style="text-align:center;color:#888;padding:24px 16px;">
              <span class="material-symbols-outlined" style="font-size:44px;color:#2d3e2c;opacity:0.6;margin-bottom:8px;">calendar_month</span>
              <p style="font-size:14px;font-weight:700;color:#333;margin:0 0 6px;">Toca cualquier día en el calendario</p>
              <p style="font-size:12px;color:#777;margin:0;">Para ver las labores programadas o registrar una nueva actividad (foliar, abono, podas, etc.)</p>
            </div>
          </div>
        </div>
      </div>

      ${showLotesResumen ? `
        <div style="border-top: 1.5px solid #edf1ec; margin: 20px 0 14px 0;"></div>
        <div style="width: 100%; box-sizing: border-box;">
          <div onclick="window.toggleResumenLotes()" style="display: flex; align-items: center; justify-content: space-between; padding: 4px 0; cursor: pointer; user-select: none;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="material-symbols-outlined" style="font-size: 20px; color: #2d3e2c;">eco</span>
              <h3 style="font-size: 14.5px; font-weight: 800; color: #1a1a1a; margin: 0;">
                Resumen por Lote
              </h3>
              <span style="font-size: 11px; font-weight: 700; color: #666; background: #f0f4ef; padding: 2px 8px; border-radius: 10px;">
                ${_ifcafeLotes.length} lotes
              </span>
            </div>
            
            <button type="button" id="btn-toggle-resumen-lotes" style="background: #f0f5ee; border: 1px solid #c7d8c5; color: #2d3e2c; font-size: 11.5px; font-weight: 700; padding: 5px 12px; border-radius: 9999px; display: inline-flex; align-items: center; gap: 4px; cursor: pointer; pointer-events: none;">
              <span id="txt-toggle-resumen-lotes">Ver lotes</span>
              <span class="material-symbols-outlined" id="ico-toggle-resumen-lotes" style="font-size: 16px; transition: transform 0.2s;">expand_more</span>
            </button>
          </div>
          
          <div id="content-resumen-lotes" style="display: none; flex-direction: column; margin-top: 8px; border-top: 1px dashed #e8ede8; padding-top: 4px;">
            ${_ifcafeLotes.map((l, idx) => `
              <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; padding: 10px 0; ${idx !== _ifcafeLotes.length - 1 ? 'border-bottom: 1px solid #f2f5f1;' : ''}">
                <div style="min-width: 140px;">
                  <span style="font-size: 13.5px; font-weight: 700; color: #1a1a1a; display: block;">${l.nombre}</span>
                  <span style="font-size: 11.5px; color: #777;">${l.variedad} · ${(l.numPlantas || 0).toLocaleString()} plantas</span>
                </div>
                <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
                  <span style="font-size: 11.5px; font-weight: 700; color: #2d3e2c; background: #e8f5e9; padding: 4px 10px; border-radius: 20px;">
                    ${l.realizadas} labores realizadas
                  </span>
                  <a href="#" onclick="event.preventDefault();window.navigateTo('plan_ifcafe','${l.id}')" style="font-size: 11.5px; font-weight: 600; color: #2d3e2c; text-decoration: none; display: flex; align-items: center; gap: 4px; padding: 5px 10px; background: #f0f7e6; border-radius: 20px; transition: background 0.15s;">
                    Filtrar <span class="material-symbols-outlined" style="font-size: 13px;">filter_alt</span>
                  </a>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </div>`;
}

function renderPlanWeekStrip() {
  const container = document.getElementById('plan-cal-week-strip');
  if (!container) return;

  const monthEl = document.getElementById('plan-cal-month-grid');
  const mobDateEl = document.getElementById('plan-cal-mob-date');
  const isMonthOpen = monthEl && monthEl.classList.contains('open');

  if (mobDateEl) {
    if (isMonthOpen) {
      const mDate = new Date(_calYear, _calMonth, 1);
      const mName = mDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
      mobDateEl.textContent = mName.charAt(0).toUpperCase() + mName.slice(1);
    } else {
      const fullDate = new Date(_calYear, _calMonth, _selectedDay || 1);
      const dayName = fullDate.toLocaleDateString('es-ES', { weekday: 'short' });
      const dayCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);
      const monthName = fullDate.toLocaleDateString('es-ES', { month: 'short' });
      const monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1).replace('.', '');
      mobDateEl.textContent = `${dayCap}, ${_selectedDay || 1} ${monthCap}`;
    }
  }

  // Lunes de la semana que contiene a _selectedDay
  const targetDate = new Date(_calYear, _calMonth, _selectedDay || 1);
  const dayOfWeek = targetDate.getDay();
  const diffToMonday = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const monday = new Date(targetDate);
  monday.setDate(targetDate.getDate() + diffToMonday);

  const dayLetters = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  let html = '';
  const todayStr = getLocalToday();

  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dayNum = d.getDate();
    const dMonth = d.getMonth();
    const dYear = d.getFullYear();
    const isSel = (dayNum === _selectedDay && dMonth === _calMonth && dYear === _calYear);

    const dayEvents = _ifcafeEvents.filter(ev => {
      if (!ev.matchFecha) return false;
      return ev.matchFecha.getFullYear() === dYear &&
             ev.matchFecha.getMonth() === dMonth &&
             ev.matchFecha.getDate() === dayNum;
    });

    const hasEv = dayEvents.length > 0;
    const hasAtrasada = dayEvents.some(ev => ev.estado === 'Atrasada' || (ev.estado === 'Programada' && ev.fecha < todayStr));
    const hasPend = dayEvents.some(ev => ev.estado === 'Pendiente' || ev.estado === 'Programada');

    let dotHtml = '';
    if (hasEv) {
      const dotColor = isSel ? '#ffffff' : (hasAtrasada ? '#ff4103' : (hasPend ? '#c9a227' : '#2d3e2c'));
      dotHtml = `<div class="da-cal-strip-dot" style="background:${dotColor};"></div>`;
    }

    const dStr = `${dYear}-${String(dMonth + 1).padStart(2, '0')}-${String(dayNum).padStart(2, '0')}`;
    const isToday = dStr === todayStr;

    html += `
      <div class="da-cal-strip-day ${isSel ? 'selected' : ''} ${isToday ? 'today' : ''}" onclick="window.selectPlanCalendarDay(${dYear}, ${dMonth}, ${dayNum})">
        <div class="da-cal-strip-name">${dayLetters[i]}</div>
        <div class="da-cal-strip-num" ${isToday ? 'style="color:#ff6b00 !important;font-weight:800;"' : ''}>${dayNum}</div>
        ${dotHtml}
      </div>
    `;
  }

  container.innerHTML = html;
  if (monthEl && monthEl.classList.contains('open')) {
    container.classList.add('open-month-hidden');
    container.style.setProperty('display', 'none', 'important');
  } else {
    container.classList.remove('open-month-hidden');
    if (window.innerWidth <= 768) {
      container.style.setProperty('display', 'flex', 'important');
    } else {
      container.style.removeProperty('display');
    }
  }
}

function renderPlanCal() {
  const container = document.getElementById('plan-cal-days');
  if (!container) return;
  const display = document.getElementById('plan-cal-month-display');
  if (display) {
    display.textContent = new Date(_calYear, _calMonth, 1).toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
  }
  container.innerHTML = '';

  const firstDay = new Date(_calYear, _calMonth, 1).getDay();
  const offset = firstDay === 0 ? 6 : firstDay - 1;
  const lastDay = new Date(_calYear, _calMonth + 1, 0).getDate();

  for (let i = 0; i < offset; i++) {
    const e = document.createElement('div');
    e.className = 'da-cal-day da-cal-empty';
    container.appendChild(e);
  }

  const monthEvents = _ifcafeEvents.filter(ev => {
    if (!ev.matchFecha) return false;
    return ev.matchFecha.getFullYear() === _calYear && ev.matchFecha.getMonth() === _calMonth;
  });

  const todayStr = getLocalToday();
  const isTodayYear = Number(todayStr.slice(0, 4));
  const isTodayMonth = Number(todayStr.slice(5, 7)) - 1;
  const isTodayDay = Number(todayStr.slice(8, 10));

  for (let day = 1; day <= lastDay; day++) {
    const dayEvents = monthEvents.filter(ev => ev.matchFecha.getDate() === day);
    const isToday = day === isTodayDay && _calMonth === isTodayMonth && _calYear === isTodayYear;
    const isSelected = day === _selectedDay;
    let cls = 'da-cal-day';
    let extra = '';

    if (dayEvents.length > 0) {
      const worst = dayEvents.some(e => e.estado === 'Atrasada') ? 'da-cal-day-pending-highlight'
        : dayEvents.some(e => e.estado === 'Pendiente' || e.estado === 'Programada') ? 'da-cal-day-highlight'
        : 'da-cal-day-done';
      cls += ` da-cal-has-event ${worst}`;
      if (dayEvents.length > 1) extra = `<span class="plan-cal-count">${dayEvents.length}</span>`;
    }

    if (isToday) cls += ' da-cal-today';
    if (isSelected) cls += ' da-cal-selected-day';

    const el = document.createElement('div');
    el.className = cls;
    el.innerHTML = `<span>${day}</span>${extra}`;
    el.onclick = () => {
      _selectedDay = day;
      renderPlanCal();
      showPlanDayDetails(day, dayEvents);
    };
    container.appendChild(el);
  }

  renderPlanWeekStrip();

  // If a day was selected, show its details
  if (_selectedDay && _selectedDay <= lastDay) {
    const currentDayEvents = monthEvents.filter(ev => ev.matchFecha.getDate() === _selectedDay);
    showPlanDayDetails(_selectedDay, currentDayEvents);
  }
}

function showPlanDayDetails(day, dayEvents) {
  const panel = document.getElementById('plan-day-details');
  if (!panel) return;

  const dateStr = `${_calYear}-${String(_calMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  window._planSelectedDateStr = dateStr;
  window._onPlanDateChangeForFooter?.(dateStr);
  const dateFormatted = new Date(_calYear, _calMonth, day).toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const todayStr = getLocalToday();
  const isPast = dateStr < todayStr;
  const isToday = dateStr === todayStr;

  const cardsHtml = (dayEvents && dayEvents.length > 0)
    ? dayEvents.map(eventCardHtml).join('')
    : `
      <div style="text-align:center; color:#888; padding:20px 12px; background:#f9fbf9; border-radius:12px; border:1px dashed #d0ded0; margin-bottom:16px;">
        <span class="material-symbols-outlined" style="font-size:32px; color:#888; margin-bottom:4px;">event_available</span>
        <p style="font-size:13px; font-weight:600; color:#555; margin:0;">Sin actividades ${isPast ? 'registradas' : 'programadas'}</p>
        <p style="font-size:11px; color:#888; margin:4px 0 0;">${isPast ? 'Fecha pasada' : 'Usa el botón de abajo para agregar una labor'}</p>
      </div>
    `;

  let actionButtonHtml = '';
  if (isPast) {
    actionButtonHtml = `
      <button type="button" class="plan-btn-add-inline" onclick="window.showInlineActividadForm('${dateStr}')" style="background:#eef7ee; border:1.5px solid #2d3e2c; color:#2d3e2c;">
        <span class="material-symbols-outlined" style="font-size:18px; color:#2d3e2c;">post_add</span>
        <span>Registrar Actividad Realizada en esta fecha</span>
      </button>
    `;
  } else if (isToday) {
    actionButtonHtml = `
      <button type="button" class="plan-btn-add-inline" onclick="window.showInlineActividadForm('${dateStr}')">
        <span class="material-symbols-outlined" style="font-size:18px;">add_circle</span>
        <span>Registrar Actividad Realizada Hoy</span>
      </button>
    `;
  } else {
    actionButtonHtml = `
      <button type="button" class="plan-btn-add-inline" onclick="window.showInlineActividadForm('${dateStr}')">
        <span class="material-symbols-outlined" style="font-size:18px;">calendar_add_on</span>
        <span>Programar Actividad Futura</span>
      </button>
    `;
  }

  panel.innerHTML = `
    <div class="cafetal-day-details-inner">
      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px; flex-wrap:wrap; gap:8px; border-bottom:1.5px solid #eef2ee; padding-bottom:8px;">
        <div>
          <span style="font-size:11px; font-weight:700; text-transform:uppercase; color:#2d3e2c; letter-spacing:0.5px;">${(isPast || isToday) ? 'Actividades del día realizadas' : 'Actividades del día programadas'}</span>
        </div>
      </div>

      <div style="margin-bottom:16px;">
        ${cardsHtml}
      </div>

      ${actionButtonHtml}
    </div>
  `;
  bindPlanEvSwipes(panel);
  window._onPlanExpandedActivityChange?.(null);
}

function bindPlanEvSwipes(container) {
  if (!container) return;
  container.querySelectorAll('.plan-ev-swipe-wrap').forEach((wrap) => {
    const fg = wrap.querySelector('.plan-ev-swipe-fg');
    const swipeBg = wrap.querySelector('.plan-ev-swipe-bg');
    const delBg = wrap.querySelector('.plan-ev-swipe-del');
    const editBg = wrap.querySelector('.plan-ev-swipe-edit');
    if (!fg) return;

    const appId = wrap.dataset.appId || '';
    const fuelGroupId = wrap.dataset.fuelGroupId || '';
    const canEdit = wrap.dataset.canEdit === '1';

    let startX = 0;
    let startY = 0;
    let dx = 0;
    let dragging = false;
    let lockedAxis = null;
    let swipedRecently = false;

    const onStart = (x, y, target) => {
      if (target && target.closest('button, a, input, textarea, select')) return;
      startX = x;
      startY = y;
      dx = 0;
      dragging = true;
      lockedAxis = null;
      swipedRecently = false;
      fg.style.transition = 'none';
    };

    const onMove = (x, y, ev) => {
      if (!dragging) return;
      const mx = x - startX;
      const my = y - startY;
      if (!lockedAxis) {
        if (Math.abs(mx) > 8 && Math.abs(mx) > Math.abs(my)) {
          lockedAxis = 'x';
        } else if (Math.abs(my) > 8) {
          lockedAxis = 'y';
          dragging = false;
          return;
        } else {
          return;
        }
      }
      if (Math.abs(mx) > 6) {
        swipedRecently = true;
        wrap.dataset.swiped = '1';
      }
      if (ev && ev.cancelable) ev.preventDefault();
      if (ev) ev.stopPropagation();
      const maxW = wrap.offsetWidth || 320;
      const minX = canEdit ? -maxW : 0;
      dx = Math.max(minX, Math.min(maxW, mx));
      fg.style.transform = `translateX(${dx}px)`;
      if (swipeBg) swipeBg.style.background = dx > 4 ? '#ba1a1a' : (dx < -4 ? '#2d3e2c' : 'transparent');
      if (delBg) delBg.style.opacity = dx > 10 ? '1' : '0';
      if (editBg) editBg.style.opacity = (canEdit && dx < -10) ? '1' : '0';
    };

    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      fg.style.transition = 'transform .2s ease';
      fg.style.transform = 'translateX(0)';
      if (swipeBg) swipeBg.style.background = 'transparent';
      if (delBg) delBg.style.opacity = '0';
      if (editBg) editBg.style.opacity = '0';

      if (dx >= 55) {
        if (appId) window.eliminarAplicacionDirecta?.(appId);
        else if (fuelGroupId) window.eliminarCargasFuelGrupoDirecta?.(fuelGroupId);
      } else if (canEdit && dx <= -55 && appId) {
        window.editarAplicacionDirecta?.(appId);
      }

      if (swipedRecently) {
        setTimeout(() => {
          delete wrap.dataset.swiped;
          swipedRecently = false;
        }, 140);
      }
      dx = 0;
    };

    wrap.addEventListener('click', (e) => {
      if (swipedRecently) {
        e.stopPropagation();
        e.preventDefault();
      }
    }, true);

    wrap.addEventListener('touchstart', (e) => {
      e.stopPropagation();
      const t = e.touches[0];
      if (t) onStart(t.clientX, t.clientY, e.target);
    }, { passive: true });
    wrap.addEventListener('touchmove', (e) => {
      const t = e.touches[0];
      if (t) onMove(t.clientX, t.clientY, e);
    }, { passive: false });
    wrap.addEventListener('touchend', onEnd, { passive: true });
    wrap.addEventListener('touchcancel', onEnd, { passive: true });

    wrap.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      onStart(e.clientX, e.clientY, e.target);
      if (!dragging) return;
      const moveH = (me) => onMove(me.clientX, me.clientY, me);
      const upH = () => {
        window.removeEventListener('mousemove', moveH);
        window.removeEventListener('mouseup', upH);
        onEnd();
      };
      window.addEventListener('mousemove', moveH);
      window.addEventListener('mouseup', upH);
    });
  });
}

function showInlineActividadForm(defaultDate, editAppId = null) {
  let editApp = null;
  if (editAppId) {
    editApp = _ifcafeEvents.find(e => e.id === editAppId) || null;
  }

  const actDate = editApp ? (editApp.fecha || defaultDate) : defaultDate;
  const todayStr = getLocalToday();
  const isPast = actDate < todayStr;
  const isToday = actDate === todayStr;

  // Calcular nombre del día
  const dParts = actDate.split('-');
  const dateObj = new Date(parseInt(dParts[0]), parseInt(dParts[1]) - 1, parseInt(dParts[2]));
  const dayName = dateObj.toLocaleDateString('es-ES', { weekday: 'long' });
  
  const tomorrowObj = new Date();
  tomorrowObj.setDate(tomorrowObj.getDate() + 1);
  const tomorrowStr = `${tomorrowObj.getFullYear()}-${String(tomorrowObj.getMonth() + 1).padStart(2, '0')}-${String(tomorrowObj.getDate()).padStart(2, '0')}`;
  const isTomorrow = actDate === tomorrowStr;

  let estadoTextoDisplay = '';
  let estadoValor = 'Programada';
  let formTitle = 'Programar Labor Futura';

  if (editApp) {
    formTitle = '✏️ Editar Actividad del Cafetal';
    estadoValor = editApp.estado || (isPast || isToday ? 'Aplicada' : 'Programada');
  } else if (isPast) {
    estadoTextoDisplay = `✅ Aplicada / Realizada (Registro histórico del ${dateObj.getDate()} de ${MESES_NOMBRE[dateObj.getMonth() + 1]})`;
    estadoValor = 'Aplicada';
    formTitle = 'Registrar Labor Realizada en Fecha Pasada';
  } else if (isToday) {
    estadoTextoDisplay = `✅ Aplicada / Realizada hoy ${dayName}`;
    estadoValor = 'Aplicada';
    formTitle = 'Registrar Labor de Hoy';
  } else if (isTomorrow) {
    estadoTextoDisplay = `📅 Programada para realizarse mañana ${dayName}`;
    estadoValor = 'Programada';
    formTitle = 'Programar Labor para Mañana';
  } else {
    estadoTextoDisplay = `📅 Programada para realizarse el día ${dayName} (${dateObj.getDate()} de ${MESES_NOMBRE[dateObj.getMonth() + 1]})`;
    estadoValor = 'Programada';
    formTitle = 'Programar Labor Futura';
  }

  const useSheetModal = Boolean(document.getElementById('lote-bottom-sheet')?.classList.contains('open'));
  const panel = document.getElementById('plan-day-details');
  if (!panel && !useSheetModal) return;

  const dateFormatted = new Date(actDate + 'T12:00:00').toLocaleDateString('es-ES', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
  });

  const targetLoteId = editApp ? (editApp.lote_id || editApp.loteId) : (_ifcafeLoteId || (_allLotes.length > 0 ? _allLotes[0].id : ''));
  const currentTipo = editApp ? (editApp.tipo || 'Aplicación Foliar') : 'Aplicación Foliar';
  const currentProducto = editApp ? (editApp.producto || '') : '';
  const currentDosis = editApp ? (editApp.dosis || '') : '';
  const currentOperador = editApp ? (editApp.operador || '') : '';
  let cleanObs = editApp ? (editApp.observaciones || '') : '';
  let resolvedOperador = currentOperador;
  if (!resolvedOperador && cleanObs.includes('Responsables:')) {
    const m = cleanObs.match(/Responsables:\s*([^\n]+)/);
    if (m) resolvedOperador = m[1].trim();
  }
  if (cleanObs.includes('Responsables:')) {
    cleanObs = cleanObs.replace(/👤?\s*Responsables:\s*[^\n]+\n*/g, '').trim();
  }
  const currentFoto = editApp ? (editApp.foto_url || editApp.notas || '') : '';

  const formBodyHtml = `
    <div class="cafetal-day-details-inner" style="animation: slideUp 0.2s ease-out;">
      ${useSheetModal ? `
        <div style="font-size:13px; font-weight:700; color:#4a5d48; margin:-10px 0 14px; text-transform:capitalize;" id="inline-plan-date-heading">${dateFormatted}</div>
      ` : `
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px; border-bottom:1.5px solid #eef2ee; padding-bottom:8px;">
          <div>
            <span style="font-size:11px; font-weight:800; text-transform:uppercase; color:#2d3e2c; letter-spacing:0.5px;" id="inline-plan-form-title">${formTitle}</span>
            <h4 style="margin:2px 0 0; font-size:15px; font-weight:800; color:#1a1a1a; text-transform:capitalize;" id="inline-plan-date-heading">${dateFormatted}</h4>
          </div>
          <button type="button" onclick="window.cancelInlineActividad('${actDate}')" style="background:none; border:none; color:#777; cursor:pointer; padding:4px;">
            <span class="material-symbols-outlined" style="font-size:20px;">close</span>
          </button>
        </div>
      `}

      <form id="form-plan-inline-actividad" style="display:flex; flex-direction:column; gap:12px;">
        ${editAppId ? `<input type="hidden" name="id" value="${editAppId}">` : ''}

        <!-- 1. Fecha de la Actividad (Editable para registrar en fecha pasada o futura) -->
        <div class="m3-field">
          <input type="date" name="fecha" id="inline-plan-fecha" value="${actDate}" required style="font-size:13px; font-weight:600; color-scheme: light;">
          <label>Fecha de la Actividad</label>
        </div>

        <!-- 2. Lote (oculto si ya estamos dentro de un lote específico) -->
        ${_ifcafeLoteId ? `
          <input type="hidden" name="lote_id" id="inline-plan-lote" value="${targetLoteId}">
        ` : `
          <div class="m3-field">
            <select name="lote_id" id="inline-plan-lote" required style="font-size:13px; font-weight:600;">
              ${_allLotes.map(l => `<option value="${l.id}" ${l.id === targetLoteId ? 'selected' : ''}>${l.nombre} (${l.variedad || 'Café'} - ${l.num_plantas || 0} plantas)</option>`).join('')}
            </select>
            <label>Lote de Café</label>
          </div>
        `}

        <!-- 3. Tipo de Labor (Custom M3 Dropdown estilo Vacuna/Tratamiento) -->
        ${(() => {
          const tipoItems = [
            { value: 'Aplicación Foliar', icon: '🍃', title: 'Aplicación Foliar', sub: 'Nutrición / Estimulante' },
            { value: 'Fertilización al Suelo', icon: '🌿', title: 'Fertilización al Suelo', sub: 'NPK / Abono' },
            { value: 'Control Fitosanitario', icon: '🛡️', title: 'Control Fitosanitario', sub: 'Fungicida / Insecticida' },
            { value: 'Manejo de Tejido', icon: '✂️', title: 'Manejo de Tejido', sub: 'Poda / Descope' },
            { value: 'Limpieza', icon: '🧹', title: 'Limpieza', sub: 'Chapea / Desyerbe' },
            { value: 'Análisis de Suelo', icon: '🧪', title: 'Análisis de Suelo', sub: 'Muestreo / pH' },
            { value: 'Otro', icon: '📌', title: 'Otra labor', sub: 'Labor personalizada' }
          ];
          const activeTipo = tipoItems.find(x => x.value === currentTipo) || tipoItems[0];
          return `
            <div style="position:relative;" id="inline-plan-tipo-wrap">
              <input type="hidden" name="tipo" id="inline-plan-tipo" value="${esc(activeTipo.value)}">
              <button type="button" id="inline-plan-tipo-trigger" style="width:100%; min-height:54px; padding:12px 16px; border-radius:14px; border:1px solid #757c73; background:#ffffff; display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer; text-align:left; position:relative; box-sizing:border-box;">
                <span style="position:absolute; top:-9px; left:12px; background:#ffffff; padding:0 5px; font-size:11.5px; font-weight:700; color:#4a5d48; letter-spacing:0.3px; text-transform:uppercase;">Tipo de Actividad</span>
                <span id="inline-plan-tipo-display" style="font-size:14px; font-weight:600; color:#192b1b; display:flex; align-items:center; gap:8px;">
                  <span>${activeTipo.icon}</span><span>${esc(activeTipo.title)}</span>
                </span>
                <span class="material-icons" id="inline-plan-tipo-arrow" style="font-size:20px; color:#2d3e2c; transition:transform 0.15s;">arrow_drop_down</span>
              </button>
              <div id="inline-plan-tipo-menu" style="display:none; position:absolute; top:calc(100% + 6px); left:0; right:0; background:#f5f9f3; border:1px solid #d5e2d2; border-radius:20px; box-shadow:0 12px 32px rgba(0,0,0,0.14); z-index:100025; padding:8px 0; max-height:290px; overflow-y:auto;">
                ${tipoItems.map(item => `
                  <div class="inline-plan-tipo-opt" data-value="${esc(item.value)}" data-icon="${item.icon}" data-title="${esc(item.title)}" style="padding:10px 18px; cursor:pointer; background:${item.value === activeTipo.value ? '#e6efe3' : 'transparent'}; transition:background 0.12s;">
                    <div style="font-size:15px; font-weight:600; color:#192b1b; display:flex; align-items:center; gap:8px;">
                      <span>${item.icon}</span><span>${esc(item.title)}</span>
                    </div>
                    <div style="font-size:12.5px; color:#4a5d48; margin-top:2px; padding-left:26px;">${esc(item.sub)}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          `;
        })()}

        <!-- 4. Producto / Tratamiento -->
        <div class="m3-field" id="field-plan-producto">
          <input type="text" name="producto" id="inline-plan-producto" value="${esc(currentProducto)}" placeholder=" " required style="font-size:13px;">
          <label id="label-plan-producto">Producto o Fórmula recomendada</label>
        </div>

        <!-- 4b. Tipo de Limpieza (Dropdown M3 multi-select) + Motoguadañas / Equipos usados -->
        <div id="inline-plan-limpieza-section" style="display:none; flex-direction:column; gap:12px;">
          <div style="position:relative;" id="inline-plan-limpieza-wrap">
            <button type="button" id="inline-plan-limpieza-trigger" style="width:100%; min-height:54px; padding:12px 16px; border-radius:14px; border:1px solid #757c73; background:#ffffff; display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer; text-align:left; position:relative; box-sizing:border-box;">
              <span style="position:absolute; top:-9px; left:12px; background:#ffffff; padding:0 5px; font-size:11.5px; font-weight:700; color:#4a5d48; letter-spacing:0.3px; text-transform:uppercase;">Tipo de Limpieza</span>
              <span id="inline-plan-limpieza-display" style="font-size:14px; font-weight:600; color:#192b1b; display:flex; align-items:center; flex-wrap:wrap; gap:6px;">
                <span style="color:#6b7280; font-weight:500;">Seleccionar tipo de limpieza...</span>
              </span>
              <span class="material-icons" id="inline-plan-limpieza-arrow" style="font-size:20px; color:#2d3e2c; transition:transform 0.15s; flex-shrink:0;">arrow_drop_down</span>
            </button>
            <div id="inline-plan-limpieza-menu" style="display:none; position:absolute; top:calc(100% + 6px); left:0; right:0; background:#f5f9f3; border:1px solid #d5e2d2; border-radius:20px; box-shadow:0 12px 32px rgba(0,0,0,0.14); z-index:100025; padding:8px 0 0; max-height:320px; overflow-y:auto;">
              <div id="inline-plan-limpieza-opts"></div>
              <div style="position:sticky; bottom:0; background:#f5f9f3; border-top:1px solid #dce6da; padding:8px 14px; display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <span style="font-size:11.5px; font-weight:600; color:#5a6b58;">Puedes elegir varias</span>
                <button type="button" id="inline-plan-limpieza-done" style="border:none; background:#2d3e2c; color:#ffffff; font-family:inherit; font-size:12px; font-weight:800; padding:6px 14px; border-radius:999px; cursor:pointer;">Listo</button>
              </div>
            </div>
          </div>
          <div id="inline-plan-limpieza-otro-wrap" style="display:none;">
            <div class="m3-field" style="margin-bottom:0;">
              <input type="text" id="inline-plan-limpieza-otro" value="" placeholder=" " style="font-size:13px;">
              <label for="inline-plan-limpieza-otro">Especificar otro tipo de limpieza</label>
            </div>
          </div>
          <div id="inline-plan-motoguadanas-box" style="display:none; background:#f8faf8; border:1.5px solid #d4ded3; border-radius:14px; padding:14px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-bottom:10px;">
              <span style="font-size:11px; font-weight:800; text-transform:uppercase; color:#2d3e2c; letter-spacing:0.5px;">✂️ Motoguadañas / Equipos usados</span>
              <span id="inline-plan-fuel-area-pill" style="font-size:11px; font-weight:700; color:#2d3e2c; background:#eaf2e8; border:1px solid #c2d8c0; border-radius:999px; padding:3px 9px; white-space:nowrap;"></span>
            </div>
            <div id="inline-plan-fuel-existing-box" style="display:none; margin-bottom:10px;"></div>
            <div id="inline-plan-motoguadanas-list" style="display:flex; flex-direction:column; gap:10px;"></div>
            <div id="inline-plan-fuel-summary" style="display:none; margin-top:10px;"></div>
          </div>
        </div>

        <!-- 5. Dosis (visible solo en Foliar, Suelo y Fitosanitario) -->
        <div class="m3-field" id="field-plan-dosis">
          <input type="text" name="dosis" id="inline-plan-dosis" value="${esc(currentDosis)}" placeholder=" " style="font-size:13px;">
          <label>Dosis (ej: 120g/planta, 50cc/bomba 20L)</label>
        </div>

        <!-- 6. Responsables / Aplicadores (Buscador Inteligente) -->
        <div style="background: #f8faf8; border: 1.5px solid #d4ded3; border-radius: 14px; padding: 14px; position: relative;">
          <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
            <label style="font-size: 11px; font-weight: 800; text-transform: uppercase; color: #2d3e2c; letter-spacing: 0.5px;">
              👥 Responsables / Aplicadores
            </label>
            <span style="font-size: 11px; color: #666;">Buscar en personal</span>
          </div>

          <!-- Trigger para abrir Bottom Sheet de Responsables -->
          <div style="position: relative;">
            <button type="button" id="inline-plan-operador-custom-input" style="width: 100%; box-sizing: border-box; border: 1.5px solid #c2d8c0; border-radius: 12px; padding: 11px 14px 11px 38px; font-size: 13.5px; outline: none; background: #ffffff; box-shadow: 0 1px 3px rgba(0,0,0,0.03); text-align: left; color: #6b7280; cursor: pointer; position: relative; display: flex; align-items: center; justify-content: space-between;">
              <span class="material-symbols-outlined" style="position: absolute; left: 12px; font-size: 20px; color: #5a7357; pointer-events: none;">search</span>
              <span>Buscar responsable (ej: David, Erick)...</span>
              <span class="material-symbols-outlined" style="font-size: 19px; color: #5a7357;">expand_more</span>
            </button>
            <div id="inline-plan-operador-dropdown" style="display: none;"></div>
          </div>

          <!-- Contenedor de responsables seleccionados (uno sobre otro) -->
          <div id="inline-plan-selected-chips-wrap" style="display: flex; flex-direction: column; gap: 6px; margin-top: 10px; min-height: 24px;"></div>
          <input type="hidden" name="operador" id="inline-plan-operador-hidden" value="${esc(resolvedOperador)}">
        </div>

        <!-- 7. Observaciones y Recomendaciones del Técnico -->
        <div class="m3-field">
          <textarea name="observaciones" id="inline-plan-obs" rows="2" placeholder=" " style="font-size:13px;">${esc(cleanObs)}</textarea>
          <label>Observaciones / Recomendación Técnica</label>
        </div>

        <!-- 8. Foto de la Planta (Cámara o Galería) -->
        <div id="inline-plan-foto-section" style="background: #fbfdfa; border: 1.5px dashed #c0d4be; border-radius: 14px; padding: 14px; text-align: center; margin: 12px 0 16px 0;">
          <!-- Input específico para Cámara (móvil abre directo cámara) -->
          <input type="file" id="inline-plan-foto-camera-input" accept="image/*" capture="environment" style="display: none;">
          <!-- Input específico para Galería / Archivos -->
          <input type="file" id="inline-plan-foto-gallery-input" accept="image/*" style="display: none;">
          <input type="hidden" name="foto_url" id="inline-plan-foto-data" value="${currentFoto || ''}">
          
          <div id="inline-plan-foto-prompt" style="display: ${currentFoto ? 'none' : 'flex'}; flex-direction: column; align-items: center; justify-content: center; gap: 6px; width: 100%;">
            <div style="width: 40px; height: 40px; border-radius: 50%; background: #eaf2e8; display: flex; align-items: center; justify-content: center; color: #2d3e2c;">
              <span class="material-symbols-outlined" style="font-size: 22px; color: #2d3e2c;">photo_camera</span>
            </div>
            <div style="font-weight: 800; font-size: 13px; color: #1a1a1a;">Foto de la Planta (Evidencia o avance)</div>
            <div style="font-size: 11.5px; color: #666; margin-bottom: 8px;">Selecciona si deseas tomar la foto con la cámara o elegirla de la galería</div>

            <!-- 2 Botones independientes Cámara vs Galería -->
            <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px; width: 100%; max-width: 320px; margin: 0 auto;">
              <button type="button" id="inline-plan-btn-trigger-camera" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 10px 8px; background: #2d3e2c; color: #ffffff; border: none; border-radius: 12px; cursor: pointer; box-shadow: 0 2px 6px rgba(45,62,44,0.2);">
                <span class="material-symbols-outlined" style="font-size: 22px; color: #ffffff;">photo_camera</span>
                <span style="font-size: 12px; font-weight: 800; color: #ffffff;">Tomar Foto</span>
                <span style="font-size: 10px; color: #d4e2d2;">Cámara</span>
              </button>

              <button type="button" id="inline-plan-btn-trigger-gallery" style="display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; padding: 10px 8px; background: #ffffff; color: #2d3e2c; border: 1.5px solid #c2d8c0; border-radius: 12px; cursor: pointer; box-shadow: 0 1px 4px rgba(0,0,0,0.05);">
                <span class="material-symbols-outlined" style="font-size: 22px; color: #2d3e2c;">photo_library</span>
                <span style="font-size: 12px; font-weight: 800; color: #2d3e2c;">Ver Galería</span>
                <span style="font-size: 10px; color: #666;">De tu teléfono</span>
              </button>
            </div>
          </div>

          <div id="inline-plan-foto-preview-box" style="${currentFoto ? 'display:block;' : 'display:none;'} position: relative; width: 100%;">
            <img id="inline-plan-foto-img" src="${currentFoto || ''}" alt="Foto de la planta" style="width: 100%; max-height: 200px; object-fit: cover; border-radius: 12px; box-shadow: 0 3px 10px rgba(0,0,0,0.1);">
            <div style="margin-top: 10px; display: flex; gap: 8px; justify-content: center; flex-wrap: wrap;">
              <button type="button" id="inline-plan-btn-retake-camera" style="padding: 6px 12px; font-size: 11.5px; font-weight: 700; border-radius: 9999px; background: #2d3e2c; color: #fff; border: none; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                <span class="material-symbols-outlined" style="font-size: 15px; color: #fff;">photo_camera</span>
                <span>Tomar otra</span>
              </button>
              <button type="button" id="inline-plan-btn-retake-gallery" style="padding: 6px 12px; font-size: 11.5px; font-weight: 700; border-radius: 9999px; background: #eaf2e8; color: #2d3e2c; border: 1px solid #c2d8c0; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                <span class="material-symbols-outlined" style="font-size: 15px; color: #2d3e2c;">photo_library</span>
                <span>Elegir otra</span>
              </button>
              <button type="button" id="inline-plan-btn-quitar-foto" style="padding: 6px 12px; font-size: 11.5px; font-weight: 700; border-radius: 9999px; background: #fff; color: #ba1a1a; border: 1px solid #ffdad6; display: inline-flex; align-items: center; gap: 4px; cursor: pointer;">
                <span class="material-symbols-outlined" style="font-size: 15px; color: #ba1a1a;">delete</span>
                <span>Quitar</span>
              </button>
            </div>
          </div>
        </div>

        <!-- 9. Estado de la labor (automático según fecha: <= hoy Aplicada, futura Programada) -->
        <input type="hidden" name="estado" id="inline-plan-estado" value="${estadoValor}">

        <!-- Botones de Acción M3 Expressive -->
        <div id="inline-plan-footer-actions" style="${useSheetModal ? 'position:sticky; bottom:-20px; z-index:20; background:rgba(255,255,255,0.97); backdrop-filter:blur(8px); display:flex; gap:10px; justify-content:space-between; align-items:center; margin:14px -18px -20px; padding:12px 18px calc(14px + env(safe-area-inset-bottom, 0px)); border-top:1px solid #eef2ee; box-shadow:0 -4px 16px rgba(0,0,0,0.06);' : 'display:flex; gap:14px; justify-content:flex-end; align-items:center; margin-top:16px; padding-top:16px; border-top:1px solid #eef2ee;'}">
          <button type="button" class="plan-btn-ghost" onclick="window.cancelInlineActividad('${actDate}')" style="${useSheetModal ? 'flex:0 0 auto; height:44px; padding:0 18px;' : ''}">
            <span>Cancelar</span>
          </button>
          <button type="submit" id="inline-plan-btn-submit" class="plan-btn-primary" style="${useSheetModal ? 'flex:1; height:44px;' : ''}">
            <span class="material-symbols-outlined" id="inline-plan-submit-icon" style="font-size:18px;">${editApp ? 'save' : (isToday || isPast) ? 'check_circle' : 'save'}</span>
            <span id="inline-plan-submit-text">${editApp ? 'Guardar Cambios' : isPast ? 'Registrar Actividad Realizada' : isToday ? 'Registrar Actividad' : 'Programar Actividad'}</span>
          </button>
        </div>
      </form>
    </div>
  `;

  if (useSheetModal) {
    showModal(formTitle, formBodyHtml);
  } else {
    panel.innerHTML = formBodyHtml;
  }

  const selectTipo = document.getElementById('inline-plan-tipo');
  const tipoTrigger = document.getElementById('inline-plan-tipo-trigger');
  const tipoMenu = document.getElementById('inline-plan-tipo-menu');
  const tipoArrow = document.getElementById('inline-plan-tipo-arrow');
  const tipoDisplay = document.getElementById('inline-plan-tipo-display');
  const limpiezaTrigger = document.getElementById('inline-plan-limpieza-trigger');
  const limpiezaDisplay = document.getElementById('inline-plan-limpieza-display');
  const limpiezaMenu = document.getElementById('inline-plan-limpieza-menu');
  const limpiezaArrow = document.getElementById('inline-plan-limpieza-arrow');
  const limpiezaOptsEl = document.getElementById('inline-plan-limpieza-opts');
  const limpiezaDoneBtn = document.getElementById('inline-plan-limpieza-done');

  if (tipoTrigger && tipoMenu) {
    tipoTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = tipoMenu.style.display === 'block';
      if (limpiezaMenu) limpiezaMenu.style.display = 'none';
      if (limpiezaArrow) limpiezaArrow.style.transform = 'rotate(0deg)';
      tipoMenu.style.display = isOpen ? 'none' : 'block';
      if (tipoArrow) tipoArrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    });
    tipoMenu.querySelectorAll('.inline-plan-tipo-opt').forEach(opt => {
      opt.addEventListener('click', (e) => {
        e.stopPropagation();
        const val = opt.dataset.value;
        if (selectTipo) selectTipo.value = val;
        if (tipoDisplay) tipoDisplay.innerHTML = `<span>${opt.dataset.icon}</span><span>${opt.dataset.title}</span>`;
        tipoMenu.querySelectorAll('.inline-plan-tipo-opt').forEach(o => { o.style.background = o === opt ? '#e6efe3' : 'transparent'; });
        tipoMenu.style.display = 'none';
        if (tipoArrow) tipoArrow.style.transform = 'rotate(0deg)';
        selectTipo?.dispatchEvent(new Event('change'));
      });
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#inline-plan-tipo-wrap')) {
        tipoMenu.style.display = 'none';
        if (tipoArrow) tipoArrow.style.transform = 'rotate(0deg)';
      }
    });
  }
  const inputProducto = document.getElementById('inline-plan-producto');
  const inputDosis = document.getElementById('inline-plan-dosis');
  const fieldDosis = document.getElementById('field-plan-dosis');
  const labelProducto = document.getElementById('label-plan-producto');
  const fieldProducto = document.getElementById('field-plan-producto');
  const limpiezaSection = document.getElementById('inline-plan-limpieza-section');
  const limpiezaOtroWrap = document.getElementById('inline-plan-limpieza-otro-wrap');
  const limpiezaOtroInput = document.getElementById('inline-plan-limpieza-otro');
  const motoguadanasBox = document.getElementById('inline-plan-motoguadanas-box');
  const fuelAreaPill = document.getElementById('inline-plan-fuel-area-pill');
  const fuelExistingBox = document.getElementById('inline-plan-fuel-existing-box');
  const motoguadanasListEl = document.getElementById('inline-plan-motoguadanas-list');
  const fuelSummaryEl = document.getElementById('inline-plan-fuel-summary');
  const inputLoteEl = document.getElementById('inline-plan-lote');

  const escHtml = (s) => String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  const LIMPIEZA_OPTIONS = [
    { key: 'Machete', icon: '🔪', label: 'Machete', sub: 'Chapea manual con machete' },
    { key: 'Motoguadaña', icon: '✂️', label: 'Motoguadaña', sub: 'Chapea mecánica con equipo' },
    { key: 'Desyerbe manual', icon: '🌿', label: 'Desyerbe manual', sub: 'Limpia a mano / azadón' },
    { key: 'Herbicida', icon: '🧪', label: 'Herbicida', sub: 'Control químico de malezas' },
    { key: 'Otro', icon: '✏️', label: 'Otro', sub: 'Especificar otro tipo de limpieza' },
  ];

  const selectedLimpiezaTypes = new Set();
  const selectedFuelUsageMap = new Map();

  if (editApp && currentTipo === 'Limpieza' && currentProducto) {
    const parts = currentProducto.split(/\s*[,+]\s*/).map(s => s.trim()).filter(Boolean);
    const otherParts = [];
    parts.forEach((p) => {
      const low = p.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      if (low === 'machete' || low.includes('machete')) {
        selectedLimpiezaTypes.add('Machete');
      } else if (low === 'motoguadana' || low.includes('motoguad') || low.includes('guadan')) {
        selectedLimpiezaTypes.add('Motoguadaña');
      } else if (low === 'desyerbe manual' || low.includes('desyerb')) {
        selectedLimpiezaTypes.add('Desyerbe manual');
      } else if (low === 'herbicida' || low.includes('herbicid')) {
        selectedLimpiezaTypes.add('Herbicida');
      } else {
        otherParts.push(p);
      }
    });
    if (otherParts.length > 0) {
      selectedLimpiezaTypes.add('Otro');
      if (limpiezaOtroInput) {
        limpiezaOtroInput.value = otherParts.join(', ');
        limpiezaOtroInput.closest('.m3-field')?.classList.add('has-value');
      }
    }
  }

  const getSelectedLoteObj = () => {
    const lid = document.getElementById('inline-plan-lote')?.value || targetLoteId;
    return _allLotes.find(l => String(l.id) === String(lid)) || { id: lid, nombre: '' };
  };

  const getActiveDateStr = () => document.getElementById('inline-plan-fecha')?.value || actDate;

  const syncLimpiezaProductoValue = () => {
    if (!selectTipo || selectTipo.value !== 'Limpieza' || !inputProducto) return;
    const ordered = [];
    LIMPIEZA_OPTIONS.forEach((opt) => {
      if (!selectedLimpiezaTypes.has(opt.key)) return;
      if (opt.key === 'Otro') {
        const custom = (limpiezaOtroInput?.value || '').trim();
        ordered.push(custom || 'Otro');
      } else {
        ordered.push(opt.key);
      }
    });
    inputProducto.value = ordered.join(', ');
  };

  const updateFuelSummaryUI = () => {
    if (!fuelSummaryEl) return;
    const activeDate = getActiveDateStr();
    if (!selectTipo || selectTipo.value !== 'Limpieza' || !selectedLimpiezaTypes.has('Motoguadaña') || activeDate > todayStr) {
      fuelSummaryEl.style.display = 'none';
      fuelSummaryEl.innerHTML = '';
      return;
    }
    const activeEntries = Array.from(selectedFuelUsageMap.values()).filter(e => e.liters > 0);
    if (activeEntries.length === 0) {
      fuelSummaryEl.style.display = 'none';
      fuelSummaryEl.innerHTML = '';
      return;
    }
    const totalLiters = Math.round(activeEntries.reduce((s, e) => s + e.liters, 0) * 10) / 10;
    const totalCost = Math.round(activeEntries.reduce((s, e) => s + (e.liters * (Number(e.unitPrice) || 0)), 0) * 100) / 100;
    fuelSummaryEl.style.display = 'block';
    fuelSummaryEl.innerHTML = `
      <div style="background:#eef5ec; border:1px solid #c5dcc0; border-radius:12px; padding:10px 12px;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; flex-wrap:wrap;">
          <span style="font-size:12.5px; font-weight:800; color:#192b18;">⛽ ${activeEntries.length} ${activeEntries.length === 1 ? 'equipo' : 'equipos'} · ${formatLitersLabel(totalLiters)} de gasolina</span>
          ${totalCost > 0 ? `<span style="font-size:13.5px; font-weight:800; color:#1b6e1b;">${escHtml(formatCurrencyL(totalCost))}</span>` : ''}
        </div>
        <div style="font-size:11px; font-weight:600; color:#4a5d48; margin-top:3px;">Se registrará en cada equipo y en Balance de cuentas</div>
      </div>
    `;
  };

  const syncSingleMotorCardUI = (motorId) => {
    if (!motoguadanasListEl) return;
    const idKey = String(motorId);
    const entry = selectedFuelUsageMap.get(idKey);
    if (!entry) return;
    const litersTxt = formatLiters(entry.liters);
    const cost = entry.liters > 0 && entry.unitPrice > 0
      ? Math.round(entry.liters * entry.unitPrice * 100) / 100
      : 0;
    motoguadanasListEl.querySelectorAll('[data-fuel-card-liters]').forEach((el) => {
      if (el.dataset.fuelCardLiters === idKey) el.textContent = litersTxt;
    });
    motoguadanasListEl.querySelectorAll('[data-fuel-card-unit]').forEach((el) => {
      if (el.dataset.fuelCardUnit === idKey) el.textContent = litersTxt === '1' ? 'litro' : 'litros';
    });
    motoguadanasListEl.querySelectorAll('[data-fuel-card-cost]').forEach((el) => {
      if (el.dataset.fuelCardCost === idKey) {
        el.textContent = cost > 0 ? formatCurrencyL(cost) : 'L 0.00';
        el.style.color = cost > 0 ? '#1b6e1b' : '#5a6b58';
      }
    });
    motoguadanasListEl.querySelectorAll('[data-fuel-card-badge]').forEach((el) => {
      if (el.dataset.fuelCardBadge === idKey) {
        el.textContent = `${formatLitersLabel(entry.liters)}${cost > 0 ? ` · ${formatCurrencyL(cost)}` : ''}`;
      }
    });
    updateFuelSummaryUI();
  };

  const renderMotoguadanasBox = () => {
    if (!motoguadanasBox) return;
    const showBox = selectTipo?.value === 'Limpieza' && selectedLimpiezaTypes.has('Motoguadaña');
    if (!showBox) {
      motoguadanasBox.style.display = 'none';
      return;
    }
    motoguadanasBox.style.display = 'block';

    const loteObj = getSelectedLoteObj();
    const activeDate = getActiveDateStr();
    if (fuelAreaPill) {
      fuelAreaPill.textContent = `📍 ${loteObj?.nombre || 'Lote seleccionado'}`;
    }

    if (fuelExistingBox) {
      const existingFuel = editApp
        ? _ifcafeEvents
            .filter(ev => String(ev.loteId) === String(loteObj?.id) && ev.fecha === activeDate && Array.isArray(ev.linkedFuelLoads))
            .flatMap(ev => ev.linkedFuelLoads)
        : [];
      if (existingFuel.length > 0) {
        fuelExistingBox.style.display = 'block';
        fuelExistingBox.innerHTML = `
          <div style="background:#f3f7f2; border:1px solid #d5e2d2; border-radius:10px; padding:8px 10px; font-size:11.5px; color:#2d3e2c;">
            <div style="font-weight:800; margin-bottom:3px;">Cargas ya registradas este día:</div>
            ${existingFuel.map(fl => `
              <div>${escHtml(fl.motorIcon || '✂️')} <b>${escHtml(fl.motorNombre || 'Equipo')}</b>: ${formatLitersLabel(fl.liters)} de gasolina${fl.cost > 0 ? ` · ${escHtml(formatCurrencyL(fl.cost))}` : ''}</div>
            `).join('')}
          </div>
        `;
      } else {
        fuelExistingBox.style.display = 'none';
        fuelExistingBox.innerHTML = '';
      }
    }

    if (!motoguadanasListEl) return;
    if (activeDate > todayStr) {
      motoguadanasListEl.innerHTML = `
        <div style="font-size:12px; color:#5a6b58; background:#ffffff; border:1px solid #d4ded3; border-radius:12px; padding:10px 12px;">
          📅 Labor programada a futuro: la carga de gasolina se registra al realizar la actividad.
        </div>
      `;
      updateFuelSummaryUI();
      return;
    }

    if (_fuelMotoresList.length === 0) {
      motoguadanasListEl.innerHTML = `
        <div style="font-size:12px; color:#5a6b58; background:#ffffff; border:1px dashed #c2d8c0; border-radius:12px; padding:12px; text-align:center;">
          No hay motoguadañas registradas en Equipos.
        </div>
      `;
      updateFuelSummaryUI();
      return;
    }

    motoguadanasListEl.innerHTML = _fuelMotoresList.map((m) => {
      const idKey = String(m.id);
      const isSel = selectedFuelUsageMap.has(idKey);
      const entry = isSel ? selectedFuelUsageMap.get(idKey) : null;
      const entryCost = entry && entry.liters > 0 && entry.unitPrice > 0
        ? Math.round(entry.liters * entry.unitPrice * 100) / 100
        : 0;
      const badgeText = isSel
        ? `${formatLitersLabel(entry.liters)}${entryCost > 0 ? ` · ${formatCurrencyL(entryCost)}` : ''}`
        : 'Tocar para usar';

      return `
        <div style="background:#ffffff; border:1.5px solid ${isSel ? '#2d3e2c' : '#d5e2d2'}; border-radius:14px; overflow:hidden; box-shadow:${isSel ? '0 3px 10px rgba(45,62,44,0.1)' : 'none'};">
          <button type="button" data-fuel-motor-toggle="${escHtml(idKey)}" style="width:100%; background:${isSel ? '#f4f8f3' : '#ffffff'}; border:none; padding:11px 12px; display:flex; align-items:center; justify-content:space-between; gap:8px; cursor:pointer; font-family:inherit; text-align:left;">
            <div style="display:flex; align-items:center; gap:9px; min-width:0; flex:1;">
              <span style="width:20px; height:20px; border-radius:50%; border:1.5px solid ${isSel ? '#2d3e2c' : '#9eb09b'}; background:${isSel ? '#2d3e2c' : '#ffffff'}; color:#ffffff; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">
                ${isSel ? '<span class="material-symbols-outlined" style="font-size:14px;">check</span>' : ''}
              </span>
              <span style="font-size:16px; flex-shrink:0;">${escHtml(m.icon || '✂️')}</span>
              <span style="font-size:13.5px; font-weight:800; color:#192b18; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escHtml(m.nombre || 'Equipo')}</span>
            </div>
            <span data-fuel-card-badge="${escHtml(idKey)}" style="font-size:11.5px; font-weight:700; color:${isSel ? '#1b6e1b' : '#5a6b58'}; background:${isSel ? '#e6efe3' : '#f4f7f3'}; border-radius:999px; padding:3px 9px; white-space:nowrap; flex-shrink:0;">${escHtml(badgeText)}</span>
          </button>
          ${isSel ? `
            <div style="padding:12px; border-top:1px solid #e6ece4; display:flex; flex-direction:column; gap:10px;">
              <div style="display:flex; align-items:center; justify-content:center; gap:18px; padding:2px 0;">
                <button type="button" data-fuel-card-minus="${escHtml(idKey)}" aria-label="Disminuir litros" style="width:40px; height:40px; border-radius:50%; border:1.5px solid #cbd5c9; background:#ffffff; color:#192b18; font-size:21px; font-weight:700; display:flex; align-items:center; justify-content:center; cursor:pointer;">&minus;</button>
                <div style="display:flex; align-items:baseline; gap:5px; min-width:84px; justify-content:center;">
                  <span data-fuel-card-liters="${escHtml(idKey)}" style="font-size:28px; font-weight:800; color:#192b18; line-height:1;">${formatLiters(entry.liters)}</span>
                  <span data-fuel-card-unit="${escHtml(idKey)}" style="font-size:14px; font-weight:700; color:#4f5d4e;">${formatLiters(entry.liters) === '1' ? 'litro' : 'litros'}</span>
                </div>
                <button type="button" data-fuel-card-plus="${escHtml(idKey)}" aria-label="Aumentar litros" style="width:40px; height:40px; border-radius:50%; border:none; background:#2d3e2c; color:#ffffff; font-size:21px; font-weight:700; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 2px 8px rgba(45,62,44,0.22);">+</button>
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px; align-items:stretch;">
                <div class="m3-field ${entry.unitPrice > 0 ? 'has-value' : ''}" style="margin-bottom:0;">
                  <input type="number" min="0" step="0.01" inputmode="decimal" placeholder=" " data-fuel-card-price="${escHtml(idKey)}" value="${entry.unitPrice > 0 ? entry.unitPrice : ''}" style="font-size:13px;">
                  <label>Precio / litro (L)</label>
                </div>
                <div style="background:#f5f9f3; border:1px solid #d5e2d2; border-radius:12px; padding:8px 10px; display:flex; flex-direction:column; justify-content:center;">
                  <span style="font-size:10.5px; font-weight:700; color:#5a6b58; text-transform:uppercase;">Gasto del equipo</span>
                  <span data-fuel-card-cost="${escHtml(idKey)}" style="font-size:14px; font-weight:800; color:${entryCost > 0 ? '#1b6e1b' : '#5a6b58'}; margin-top:2px;">${entryCost > 0 ? escHtml(formatCurrencyL(entryCost)) : 'L 0.00'}</span>
                </div>
              </div>
              <div style="font-size:11.5px; font-weight:600; color:#5a6b58;">
                📍 ${escHtml(loteObj?.nombre || 'Lote actual')} · 📅 ${escHtml(activeDate)}
              </div>
            </div>
          ` : ''}
        </div>
      `;
    }).join('');

    motoguadanasListEl.querySelectorAll('[data-fuel-motor-toggle]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mid = btn.dataset.fuelMotorToggle;
        const motor = _fuelMotoresList.find(m => String(m.id) === String(mid));
        if (!motor) return;
        if (selectedFuelUsageMap.has(String(mid))) {
          selectedFuelUsageMap.delete(String(mid));
        } else {
          selectedFuelUsageMap.set(String(mid), {
            motor,
            cfg: motor._cfg,
            liters: 0,
            unitPrice: Number(motor._resolvedPrice) || Number(motor._cfg?.precioPorLitro) || resolveSharedFuelPrice(motor, _fuelMotoresList) || 0,
          });
        }
        renderMotoguadanasBox();
      });
    });

    motoguadanasListEl.querySelectorAll('[data-fuel-card-minus]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mid = btn.dataset.fuelCardMinus;
        const entry = selectedFuelUsageMap.get(String(mid));
        if (!entry) return;
        entry.liters = Math.max(0, Math.round((entry.liters - 0.5) * 10) / 10);
        syncSingleMotorCardUI(mid);
      });
    });

    motoguadanasListEl.querySelectorAll('[data-fuel-card-plus]').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const mid = btn.dataset.fuelCardPlus;
        const entry = selectedFuelUsageMap.get(String(mid));
        if (!entry) return;
        entry.liters = Math.round((entry.liters + 0.5) * 10) / 10;
        syncSingleMotorCardUI(mid);
      });
    });

    motoguadanasListEl.querySelectorAll('[data-fuel-card-price]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const mid = inp.dataset.fuelCardPrice;
        const entry = selectedFuelUsageMap.get(String(mid));
        if (!entry) return;
        entry.unitPrice = Math.max(0, parseFloat(inp.value) || 0);
        inp.closest('.m3-field')?.classList.toggle('has-value', !!inp.value);
        syncSingleMotorCardUI(mid);
      });
    });

    updateFuelSummaryUI();
  };

  const renderLimpiezaChips = () => {
    if (limpiezaDisplay) {
      const selectedList = LIMPIEZA_OPTIONS.filter(opt => selectedLimpiezaTypes.has(opt.key));
      if (selectedList.length === 0) {
        limpiezaDisplay.innerHTML = `<span style="color:#6b7280; font-weight:500;">Seleccionar tipo de limpieza...</span>`;
      } else {
        limpiezaDisplay.innerHTML = selectedList
          .map(opt => `<span style="display:inline-flex; align-items:center; gap:5px;"><span>${opt.icon}</span><span>${escHtml(opt.label)}</span></span>`)
          .join('<span style="color:#6b7280;">,</span> ');
      }
    }

    if (limpiezaOptsEl) {
      limpiezaOptsEl.innerHTML = LIMPIEZA_OPTIONS.map((opt) => {
        const active = selectedLimpiezaTypes.has(opt.key);
        return `
          <div class="inline-plan-limpieza-opt" data-limpieza-key="${escHtml(opt.key)}" style="padding:10px 18px; cursor:pointer; background:${active ? '#e6efe3' : 'transparent'}; display:flex; align-items:center; justify-content:space-between; gap:10px; transition:background 0.12s;">
            <div style="min-width:0; flex:1;">
              <div style="font-size:15px; font-weight:600; color:#192b1b; display:flex; align-items:center; gap:8px;">
                <span>${opt.icon}</span><span>${escHtml(opt.label)}</span>
              </div>
              <div style="font-size:12.5px; color:#4a5d48; margin-top:2px; padding-left:26px;">${escHtml(opt.sub)}</div>
            </div>
            <span style="width:20px; height:20px; border-radius:50%; border:1.5px solid ${active ? '#2d3e2c' : '#9eb09b'}; background:${active ? '#2d3e2c' : '#ffffff'}; color:#ffffff; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">
              ${active ? '<span class="material-symbols-outlined" style="font-size:14px;">check</span>' : ''}
            </span>
          </div>
        `;
      }).join('');

      limpiezaOptsEl.querySelectorAll('.inline-plan-limpieza-opt').forEach((optEl) => {
        optEl.addEventListener('click', (e) => {
          e.stopPropagation();
          const key = optEl.dataset.limpiezaKey;
          if (!key) return;
          if (selectedLimpiezaTypes.has(key)) {
            selectedLimpiezaTypes.delete(key);
          } else {
            selectedLimpiezaTypes.add(key);
            if (
              key === 'Motoguadaña' &&
              _fuelMotoresList.length === 1 &&
              selectedFuelUsageMap.size === 0 &&
              !editApp &&
              getActiveDateStr() <= todayStr
            ) {
              const onlyMotor = _fuelMotoresList[0];
              selectedFuelUsageMap.set(String(onlyMotor.id), {
                motor: onlyMotor,
                cfg: onlyMotor._cfg,
                liters: 0,
                unitPrice: Number(onlyMotor._resolvedPrice) || Number(onlyMotor._cfg?.precioPorLitro) || resolveSharedFuelPrice(onlyMotor, _fuelMotoresList) || 0,
              });
            }
          }
          renderLimpiezaChips();
        });
      });
    }

    if (limpiezaOtroWrap) {
      limpiezaOtroWrap.style.display = selectedLimpiezaTypes.has('Otro') ? 'block' : 'none';
    }
    syncLimpiezaProductoValue();
    renderMotoguadanasBox();
  };

  if (limpiezaTrigger && limpiezaMenu) {
    limpiezaTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = limpiezaMenu.style.display === 'block';
      if (tipoMenu) tipoMenu.style.display = 'none';
      if (tipoArrow) tipoArrow.style.transform = 'rotate(0deg)';
      limpiezaMenu.style.display = isOpen ? 'none' : 'block';
      if (limpiezaArrow) limpiezaArrow.style.transform = isOpen ? 'rotate(0deg)' : 'rotate(180deg)';
    });
    limpiezaDoneBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      limpiezaMenu.style.display = 'none';
      if (limpiezaArrow) limpiezaArrow.style.transform = 'rotate(0deg)';
    });
    document.addEventListener('click', (e) => {
      if (!e.target.closest('#inline-plan-limpieza-wrap')) {
        limpiezaMenu.style.display = 'none';
        if (limpiezaArrow) limpiezaArrow.style.transform = 'rotate(0deg)';
      }
    });
  }

  limpiezaOtroInput?.addEventListener('input', () => {
    limpiezaOtroInput.closest('.m3-field')?.classList.toggle('has-value', !!limpiezaOtroInput.value);
    syncLimpiezaProductoValue();
  });

  if (inputLoteEl && inputLoteEl.tagName === 'SELECT') {
    inputLoteEl.addEventListener('change', () => {
      if (selectTipo?.value === 'Limpieza' && selectedLimpiezaTypes.has('Motoguadaña')) {
        renderMotoguadanasBox();
      }
    });
  }

  // Multi-operator management
  let selectedOperadores = resolvedOperador ? resolvedOperador.split(',').map(s => s.trim()).filter(Boolean) : [];

  const hiddenOperador = document.getElementById('inline-plan-operador-hidden');
  const selectedChipsWrap = document.getElementById('inline-plan-selected-chips-wrap');
  const customOperadorInput = document.getElementById('inline-plan-operador-custom-input');
  const dropdownMenu = document.getElementById('inline-plan-operador-dropdown');

  const updateOperadoresUI = () => {
    if (hiddenOperador) {
      hiddenOperador.value = selectedOperadores.join(', ');
    }

    if (selectedChipsWrap) {
      if (selectedOperadores.length === 0) {
        selectedChipsWrap.innerHTML = `
          <span style="font-size: 11.5px; color: #888; font-style: italic; display: flex; align-items: center; gap: 4px;">
            <span class="material-symbols-outlined" style="font-size: 15px;">info</span>
            Ningún responsable seleccionado aún (opcional)
          </span>
        `;
      } else {
        selectedChipsWrap.innerHTML = selectedOperadores.map((name, idx) => `
          <div style="display: flex; align-items: center; justify-content: space-between; background: #eaf2e8; color: #1b5e20; border: 1.5px solid #b8d4b4; padding: 6px 12px; border-radius: 10px; font-size: 12.5px; font-weight: 700; box-shadow: 0 1px 3px rgba(0,0,0,0.04);">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span class="material-symbols-outlined" style="font-size: 16px; color: #1b5e20;">person</span>
              <span>${esc(name)}</span>
            </div>
            <button type="button" data-index="${idx}" class="btn-remove-selected-op" style="background: none; border: none; padding: 0; color: #1b5e20; cursor: pointer; display: flex; align-items: center; border-radius: 50%;" title="Quitar">
              <span class="material-symbols-outlined" style="font-size: 18px;">cancel</span>
            </button>
          </div>
        `).join('');

        selectedChipsWrap.querySelectorAll('.btn-remove-selected-op').forEach(btn => {
          btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const index = parseInt(btn.dataset.index);
            selectedOperadores.splice(index, 1);
            updateOperadoresUI();
          });
        });
      }
    }
  };

  const highlightMatch = (text, query) => {
    if (!query) return esc(text);
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return esc(text).replace(new RegExp(`(${escapedQuery})`, 'gi'), '<strong style="color:#1b5e20; text-decoration: underline;">$1</strong>');
  };

  const addOperatorToSelection = (rawName) => {
    const val = (rawName || '').trim();
    if (!val) return;

    // Buscar si coincide parcial o totalmente con el personal registrado para traer SIEMPRE el nombre completo
    const exactMatch = _personalList.find(p => p.nombre.trim().toLowerCase() === val.toLowerCase());
    const partialMatch = !exactMatch ? _personalList.find(p => p.nombre.trim().toLowerCase().includes(val.toLowerCase())) : null;
    
    // Nombre completo oficial si está en la empresa, o el texto introducido
    const finalName = exactMatch ? exactMatch.nombre : (partialMatch ? partialMatch.nombre : val);

    if (!selectedOperadores.some(n => n.toLowerCase() === finalName.toLowerCase())) {
      selectedOperadores.push(finalName);
      updateOperadoresUI();
    }
    if (customOperadorInput) {
      customOperadorInput.value = '';
    }
    if (dropdownMenu) {
      dropdownMenu.style.display = 'none';
      dropdownMenu.innerHTML = '';
    }
  };

  const renderDropdown = (text) => {
    if (!dropdownMenu) return;
    const term = (text || '').trim().toLowerCase();

    if (!term) {
      dropdownMenu.style.display = 'none';
      dropdownMenu.innerHTML = '';
      return;
    }

    // Filtrar personal registrado en la empresa que coincida en nombre o rol
    const matches = _personalList.filter(p => {
      const name = (p.nombre || '').toLowerCase();
      const rol = (p.rol || '').toLowerCase();
      const alreadySelected = selectedOperadores.some(sel => sel.toLowerCase() === (p.nombre || '').toLowerCase());
      return (name.includes(term) || rol.includes(term)) && !alreadySelected;
    });

    if (matches.length === 0) {
      dropdownMenu.innerHTML = `
        <div style="padding: 10px 14px; font-size: 12px; color: #666; display: flex; align-items: center; justify-content: space-between; gap: 8px;">
          <span>No registrado en personal de la empresa</span>
          <button type="button" id="btn-add-external-op" style="background: #eaf2e8; border: 1px solid #c2d8c0; border-radius: 8px; padding: 4px 10px; font-size: 11.5px; font-weight: 700; color: #2d3e2c; cursor: pointer; white-space: nowrap;">
            + Agregar "${esc(text.trim())}"
          </button>
        </div>
      `;
      const btnExt = dropdownMenu.querySelector('#btn-add-external-op');
      if (btnExt) {
        btnExt.addEventListener('click', (e) => {
          e.stopPropagation();
          addOperatorToSelection(text.trim());
        });
      }
      dropdownMenu.style.display = 'block';
      return;
    }

    dropdownMenu.innerHTML = `
      <div style="padding: 6px 12px; font-size: 10.5px; font-weight: 800; color: #5a7357; text-transform: uppercase; letter-spacing: 0.5px; background: #f8faf8; border-bottom: 1px solid #eef2ee; display: flex; justify-content: space-between;">
        <span>Personal de la Finca (${matches.length})</span>
        <span style="font-weight: 600; text-transform: none; color: #888;">Toca para seleccionar</span>
      </div>
      <div style="display: flex; flex-direction: column;">
        ${matches.map(p => `
          <div class="op-dropdown-row" data-fullname="${esc(p.nombre)}" style="padding: 10px 14px; display: flex; align-items: center; justify-content: space-between; cursor: pointer; border-bottom: 1px solid #f0f4f0; background: #ffffff;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <div style="width: 32px; height: 32px; border-radius: 50%; background: #2d3e2c; color: #fff; font-size: 12px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                ${esc((p.nombre || 'U').charAt(0).toUpperCase())}
              </div>
              <div>
                <div style="font-size: 13px; font-weight: 700; color: #1a1a1a;">
                  ${highlightMatch(p.nombre, term)}
                </div>
                ${p.rol ? `<div style="font-size: 11px; color: #666;">${esc(p.rol)}</div>` : ''}
              </div>
            </div>
            <div style="display: flex; align-items: center; gap: 4px; color: #2d3e2c; font-size: 11.5px; font-weight: 700;">
              <span class="material-symbols-outlined" style="font-size: 18px; color: #2d3e2c;">add_circle</span>
              <span class="hide-on-mobile">Seleccionar</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;

    dropdownMenu.querySelectorAll('.op-dropdown-row').forEach(row => {
      row.addEventListener('mouseover', () => { row.style.background = '#f0f6ef'; });
      row.addEventListener('mouseout', () => { row.style.background = '#ffffff'; });
      row.addEventListener('click', (e) => {
        e.stopPropagation();
        const fullName = row.dataset.fullname;
        addOperatorToSelection(fullName);
      });
    });

    dropdownMenu.style.display = 'block';
  };

  const openResponsablesBottomSheet = () => {
    document.getElementById('plan-responsables-sheet-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'plan-responsables-sheet-overlay';
    overlay.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.5); backdrop-filter:blur(3px); z-index:100030; display:flex; align-items:flex-end; justify-content:center;';
    overlay.innerHTML = `
      <div id="plan-responsables-sheet" style="width:100%; max-width:520px; max-height:86dvh; background:#ffffff; border-radius:26px 26px 0 0; display:flex; flex-direction:column; overflow:hidden; box-shadow:0 -10px 36px rgba(0,0,0,0.28); animation:slideUp 0.22s ease-out;">
        <div style="padding:10px 18px 12px; border-bottom:1px solid #eef2ee; flex-shrink:0;">
          <div style="width:38px; height:4px; border-radius:999px; background:#d0dad0; margin:0 auto 10px;"></div>
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px;">
            <h3 style="margin:0; font-size:17px; font-weight:800; color:#1e3e2b; font-family:'Work Sans',sans-serif;">Seleccionar Responsables</h3>
            <button type="button" id="plan-resp-sheet-close" style="width:34px; height:34px; border-radius:50%; background:#eff4ed; border:none; color:#1e3e2b; display:flex; align-items:center; justify-content:center; cursor:pointer;">
              <span class="material-symbols-outlined" style="font-size:19px;">close</span>
            </button>
          </div>
          <div style="position:relative; display:flex; align-items:center;">
            <span class="material-symbols-outlined" style="position:absolute; left:12px; font-size:20px; color:#5a7357; pointer-events:none;">search</span>
            <input type="text" id="plan-resp-sheet-search" placeholder="Buscar en personal o escribir nombre..." autocomplete="off" style="width:100%; box-sizing:border-box; border:1.5px solid #c2d8c0; border-radius:12px; padding:11px 14px 11px 38px; font-size:14px; outline:none; background:#f8faf8; color:#1a1a1a;">
          </div>
        </div>
        <div id="plan-resp-sheet-list" style="flex:1 1 0%; min-height:180px; overflow-y:auto; padding:6px 0;"></div>
        <div style="padding:12px 18px calc(14px + env(safe-area-inset-bottom, 0px)); border-top:1px solid #eef2ee; background:#ffffff; flex-shrink:0;">
          <button type="button" id="plan-resp-sheet-done" style="width:100%; height:44px; border-radius:999px; border:none; background:#2d3e2c; color:#ffffff; font-family:'Work Sans',sans-serif; font-size:14px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
            <span class="material-symbols-outlined" style="font-size:18px;">check</span>
            <span id="plan-resp-sheet-done-label">Listo</span>
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const searchInput = document.getElementById('plan-resp-sheet-search');
    const listEl = document.getElementById('plan-resp-sheet-list');
    const doneLabel = document.getElementById('plan-resp-sheet-done-label');

    const closeSheet = () => overlay.remove();
    document.getElementById('plan-resp-sheet-close')?.addEventListener('click', closeSheet);
    document.getElementById('plan-resp-sheet-done')?.addEventListener('click', closeSheet);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeSheet();
    });

    const renderList = (queryText = '') => {
      const term = queryText.trim().toLowerCase();
      if (doneLabel) {
        doneLabel.textContent = selectedOperadores.length > 0 ? `Listo (${selectedOperadores.length})` : 'Listo';
      }

      const matches = _personalList.filter(p => {
        if (!term) return true;
        return (p.nombre || '').toLowerCase().includes(term) || (p.rol || '').toLowerCase().includes(term);
      });

      const exactExists = term && _personalList.some(p => (p.nombre || '').toLowerCase() === term);
      const alreadyCustom = term && selectedOperadores.some(s => s.toLowerCase() === term);

      let html = '';
      if (term && !exactExists && !alreadyCustom) {
        html += `
          <div id="plan-resp-add-custom" style="padding:12px 18px; display:flex; align-items:center; justify-content:space-between; gap:10px; border-bottom:1px solid #eef2ee; background:#f4f9f3; cursor:pointer;">
            <span style="font-size:13.5px; font-weight:700; color:#2d3e2c;">Agregar "${esc(queryText.trim())}"</span>
            <span class="material-symbols-outlined" style="font-size:20px; color:#2d3e2c;">add_circle</span>
          </div>
        `;
      }

      if (matches.length === 0 && !term) {
        html += `<div style="padding:28px 18px; text-align:center; color:#777; font-size:13px;">No hay personal registrado. Escribe un nombre arriba para agregarlo.</div>`;
      } else if (matches.length === 0 && exactExists) {
        html += `<div style="padding:20px 18px; text-align:center; color:#777; font-size:13px;">Sin resultados adicionales</div>`;
      } else {
        html += matches.map(p => {
          const isSelected = selectedOperadores.some(s => s.toLowerCase() === (p.nombre || '').toLowerCase());
          return `
            <div class="plan-resp-sheet-row" data-fullname="${esc(p.nombre)}" style="padding:12px 18px; display:flex; align-items:center; justify-content:space-between; gap:12px; cursor:pointer; border-bottom:1px solid #f2f5f2; background:${isSelected ? '#eef6ec' : '#ffffff'};">
              <div style="display:flex; align-items:center; gap:12px; min-width:0;">
                <div style="width:36px; height:36px; border-radius:50%; background:${isSelected ? '#2d3e2c' : '#e4ece2'}; color:${isSelected ? '#ffffff' : '#2d3e2c'}; font-size:13px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                  ${esc((p.nombre || 'U').charAt(0).toUpperCase())}
                </div>
                <div style="min-width:0;">
                  <div style="font-size:14px; font-weight:700; color:#1a1a1a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${highlightMatch(p.nombre, term)}</div>
                  ${p.rol ? `<div style="font-size:12px; color:#5a6b58;">${esc(p.rol)}</div>` : ''}
                </div>
              </div>
              <span class="material-symbols-outlined" style="font-size:22px; color:${isSelected ? '#2d3e2c' : '#9aa598'}; flex-shrink:0;">
                ${isSelected ? 'check_circle' : 'radio_button_unchecked'}
              </span>
            </div>
          `;
        }).join('');
      }

      listEl.innerHTML = html;

      document.getElementById('plan-resp-add-custom')?.addEventListener('click', () => {
        const val = searchInput.value.trim();
        if (!val) return;
        selectedOperadores.push(val);
        updateOperadoresUI();
        searchInput.value = '';
        renderList('');
      });

      listEl.querySelectorAll('.plan-resp-sheet-row').forEach(row => {
        row.addEventListener('click', () => {
          const name = row.dataset.fullname;
          const idx = selectedOperadores.findIndex(s => s.toLowerCase() === name.toLowerCase());
          if (idx >= 0) {
            selectedOperadores.splice(idx, 1);
          } else {
            selectedOperadores.push(name);
          }
          updateOperadoresUI();
          renderList(searchInput.value);
        });
      });
    };

    renderList('');
    searchInput?.addEventListener('input', () => renderList(searchInput.value));
    setTimeout(() => searchInput?.focus(), 120);
  };

  if (customOperadorInput) {
    customOperadorInput.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openResponsablesBottomSheet();
    });
  }

  updateOperadoresUI();

  // Date change and auto-state listener
  const inputFecha = document.getElementById('inline-plan-fecha');
  const selectEstado = document.getElementById('inline-plan-estado');
  const submitText = document.getElementById('inline-plan-submit-text');
  const submitIcon = document.getElementById('inline-plan-submit-icon');
  const headingDate = document.getElementById('inline-plan-date-heading');
  const headingTitle = document.getElementById('inline-plan-form-title');

  if (inputFecha) {
    inputFecha.addEventListener('change', () => {
      const newDate = inputFecha.value;
      if (!newDate) return;
      const isPastNow = newDate < todayStr;
      const isTodayNow = newDate === todayStr;

      const newDateFormatted = new Date(newDate + 'T12:00:00').toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
      });
      if (headingDate) headingDate.textContent = newDateFormatted;

      if (!editApp && selectEstado) {
        if (isPastNow || isTodayNow) {
          selectEstado.value = 'Aplicada';
          if (headingTitle) headingTitle.textContent = isPastNow ? 'Registrar Labor Realizada en Fecha Pasada' : 'Registrar Labor de Hoy';
          if (submitText) submitText.textContent = isPastNow ? 'Registrar Actividad Realizada' : 'Registrar Actividad';
          if (submitIcon) submitIcon.textContent = 'check_circle';
        } else {
          selectEstado.value = 'Programada';
          if (headingTitle) headingTitle.textContent = 'Programar Labor Futura';
          if (submitText) submitText.textContent = 'Programar Actividad Futura';
          if (submitIcon) submitIcon.textContent = 'calendar_add_on';
        }
      }
      if (selectTipo?.value === 'Limpieza' && selectedLimpiezaTypes.has('Motoguadaña')) {
        renderMotoguadanasBox();
      }
    });
  }

  // Photo handlers (Cámara y Galería independientes)
  const cameraInput = document.getElementById('inline-plan-foto-camera-input');
  const galleryInput = document.getElementById('inline-plan-foto-gallery-input');
  const fotoData = document.getElementById('inline-plan-foto-data');
  const fotoPrompt = document.getElementById('inline-plan-foto-prompt');
  const fotoPreviewBox = document.getElementById('inline-plan-foto-preview-box');
  const fotoImg = document.getElementById('inline-plan-foto-img');
  const btnTriggerCamera = document.getElementById('inline-plan-btn-trigger-camera');
  const btnTriggerGallery = document.getElementById('inline-plan-btn-trigger-gallery');
  const btnRetakeCamera = document.getElementById('inline-plan-btn-retake-camera');
  const btnRetakeGallery = document.getElementById('inline-plan-btn-retake-gallery');
  const btnQuitarFoto = document.getElementById('inline-plan-btn-quitar-foto');

  if (btnTriggerCamera && cameraInput) {
    btnTriggerCamera.addEventListener('click', () => cameraInput.click());
  }
  if (btnTriggerGallery && galleryInput) {
    btnTriggerGallery.addEventListener('click', () => galleryInput.click());
  }
  if (btnRetakeCamera && cameraInput) {
    btnRetakeCamera.addEventListener('click', () => cameraInput.click());
  }
  if (btnRetakeGallery && galleryInput) {
    btnRetakeGallery.addEventListener('click', () => galleryInput.click());
  }

  const handleFotoFile = async (file) => {
    if (!file) return;
    try {
      window.Snackbar?.show('Optimizando fotografía...');
      const localPreview = await compressImage(file, 1000, 0.75);
      if (fotoImg) fotoImg.src = localPreview;
      if (fotoPreviewBox) fotoPreviewBox.style.display = 'block';
      if (fotoPrompt) fotoPrompt.style.display = 'none';

      const hostedUrl = await uploadImage(file);
      if (fotoData) fotoData.value = hostedUrl || localPreview;
    } catch (err) {
      console.error('Error procesando imagen:', err);
      window.Snackbar?.show('Error al procesar la foto: ' + err.message, { type: 'error' });
    }
  };

  if (cameraInput) {
    cameraInput.addEventListener('change', (e) => handleFotoFile(e.target.files?.[0]));
  }
  if (galleryInput) {
    galleryInput.addEventListener('change', (e) => handleFotoFile(e.target.files?.[0]));
  }

  if (btnQuitarFoto) {
    btnQuitarFoto.addEventListener('click', () => {
      if (fotoData) fotoData.value = '';
      if (fotoImg) fotoImg.src = '';
      if (cameraInput) cameraInput.value = '';
      if (galleryInput) galleryInput.value = '';
      if (fotoPreviewBox) fotoPreviewBox.style.display = 'none';
      if (fotoPrompt) fotoPrompt.style.display = 'flex';
    });
  }

  // Handle dynamic visibility and placeholders by tipo
  const updateTipoFields = () => {
    const t = selectTipo.value;
    if (t === 'Limpieza') {
      if (fieldProducto) fieldProducto.style.display = 'none';
      if (inputProducto) inputProducto.required = false;
      if (fieldDosis) fieldDosis.style.display = 'none';
      if (inputDosis) inputDosis.required = false;
      if (limpiezaSection) limpiezaSection.style.display = 'flex';
      renderLimpiezaChips();
      syncLimpiezaProductoValue();
      return;
    }

    if (fieldProducto) fieldProducto.style.display = 'block';
    if (inputProducto) inputProducto.required = true;
    if (limpiezaSection) limpiezaSection.style.display = 'none';
    if (limpiezaMenu) limpiezaMenu.style.display = 'none';
    if (limpiezaArrow) limpiezaArrow.style.transform = 'rotate(0deg)';

    if (t === 'Manejo de Tejido') {
      if (fieldDosis) fieldDosis.style.display = 'none';
      if (inputDosis) { inputDosis.required = false; }
      if (labelProducto) labelProducto.textContent = 'Tipo de Poda o Manejo';
      inputProducto.placeholder = 'Ej: Poda de formación, Descope, Deschuponado...';
    } else if (t === 'Análisis de Suelo') {
      if (fieldDosis) fieldDosis.style.display = 'none';
      if (inputDosis) { inputDosis.required = false; }
      if (labelProducto) labelProducto.textContent = 'Tipo de Análisis / Muestreo';
      inputProducto.placeholder = 'Ej: Muestreo compuesto de suelo, pH...';
    } else if (t === 'Control Fitosanitario') {
      if (fieldDosis) fieldDosis.style.display = 'block';
      if (inputDosis) inputDosis.required = true;
      if (labelProducto) labelProducto.textContent = 'Fungicida o Insecticida';
      inputProducto.placeholder = 'Ej: Opera (Fungicida Roya), Brocap...';
      inputDosis.placeholder = 'Ej: 40 cc / bomba 20L';
    } else if (t === 'Fertilización al Suelo') {
      if (fieldDosis) fieldDosis.style.display = 'block';
      if (inputDosis) inputDosis.required = true;
      if (labelProducto) labelProducto.textContent = 'Fertilizante / Fórmula';
      inputProducto.placeholder = 'Ej: 18-46-0, Urea, Caldolomita...';
      inputDosis.placeholder = 'Ej: 120 g / planta, 4 sacos...';
    } else if (t === 'Aplicación Foliar') {
      if (fieldDosis) fieldDosis.style.display = 'block';
      if (inputDosis) inputDosis.required = true;
      if (labelProducto) labelProducto.textContent = 'Nutrición Foliar / Producto';
      inputProducto.placeholder = 'Ej: Zinc-Boro + Aminoácidos';
      inputDosis.placeholder = 'Ej: 50 cc / bomba 20L';
    } else {
      if (fieldDosis) fieldDosis.style.display = 'none';
      if (inputDosis) { inputDosis.required = false; }
      if (labelProducto) labelProducto.textContent = 'Nombre de la Labor';
      inputProducto.placeholder = 'Ej: Nombre de la labor o insumo';
    }
  };

  selectTipo.addEventListener('change', updateTipoFields);
  updateTipoFields();

  // Submit handler
  const form = document.getElementById('form-plan-inline-actividad');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    let fuelLoadsToCreate = [];
    if (selectTipo.value === 'Limpieza') {
      syncLimpiezaProductoValue();
      if (!inputProducto.value.trim()) {
        window.Snackbar?.show('Selecciona al menos un tipo de limpieza', { type: 'error' });
        return;
      }
      if (selectedLimpiezaTypes.has('Motoguadaña') && getActiveDateStr() <= todayStr) {
        if (!editApp && _fuelMotoresList.length > 0 && selectedFuelUsageMap.size === 0) {
          window.Snackbar?.show('Selecciona al menos una motoguadaña usada', { type: 'error' });
          return;
        }
        for (const entry of selectedFuelUsageMap.values()) {
          if (!editApp && !(entry.liters > 0)) {
            window.Snackbar?.show(`Indica los litros de gasolina usados en ${entry.motor.nombre}`, { type: 'error' });
            return;
          }
          if (entry.liters > 0) {
            fuelLoadsToCreate.push({
              motor: entry.motor,
              cfg: entry.cfg,
              liters: entry.liters,
              unitPrice: Math.max(0, Math.round((Number(entry.unitPrice) || 0) * 100) / 100),
            });
          }
        }
      }
    }

    const submitBtn = document.getElementById('inline-plan-btn-submit');
    if (submitBtn?.disabled) return;
    if (submitBtn) submitBtn.disabled = true;
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    data._fuelLoads = fuelLoadsToCreate;
    try {
      await window.guardarActividadPlanInline(data);
    } finally {
      if (submitBtn && document.body.contains(submitBtn)) {
        submitBtn.disabled = false;
      }
    }
  });
}

function emptyStateHtml(title, sub) {
  return `<div class="app-screen m3-pt-6 m3-pb-24 m3-p-4 m3-font-work-sans" style="max-width:900px;margin:0 auto;">
    <div style="background:white;border-radius:20px;padding:48px 24px;text-align:center;box-shadow:0 2px 12px rgba(0,0,0,0.04);">
      <span class="material-symbols-outlined" style="font-size:48px;color:#ccc;">eco</span>
      <p style="font-size:16px;font-weight:600;color:#666;margin:12px 0 0;">${title}</p>
      ${sub ? `<p style="font-size:13px;color:#999;margin:6px 0 0;">${sub}</p>` : ''}
    </div>
  </div>`;
}

function planStyles() {
  return `
  <style>
    .da-cal-day-done { background: #c8e6c9; color: #1b5e20; font-weight: 800; }
    .da-cal-day-done:hover { background: #a9d8ab; }
    .da-cal-day.da-cal-day-highlight { color: #6b4f00; background: #ffe9a8; font-weight: 800; }
    .da-cal-day.da-cal-day-pending-highlight { color: #fff; background: #FF4103; font-weight: 800; }
    .da-cal-day.da-cal-selected-day { border: 2.5px solid #2d3e2c !important; transform: scale(1.04); z-index: 2; }
    .plan-cal-count { position: absolute; top: 4px; right: 6px; font-size: 10px; font-weight: 800; background: rgba(0,0,0,0.35); color: #fff; border-radius: 8px; padding: 0 5px; line-height: 1.6; }
    .plan-legend-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    
    .plan-ev { background: #ffffff; border-radius: 16px; padding: 14px 16px; margin-bottom: 12px; transition: all 0.2s cubic-bezier(0.2, 0, 0, 1); box-shadow: 0 1px 4px rgba(0,0,0,0.03); }
    .plan-ev:hover { transform: translateY(-2px); box-shadow: 0 4px 14px rgba(0,0,0,0.08); }
    .plan-ev-lote { display: flex; align-items: center; gap: 4px; font-size: 12px; font-weight: 700; color: #2d3e2c; margin-top: 2px; }
    .plan-ev-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 8px; }
    .plan-ev-producto { font-size: 14.5px; font-weight: 800; color: #1a1a1a; margin: 0; }
    .plan-ev-badge { font-size: 10.5px; font-weight: 800; padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: .4px; flex-shrink: 0; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .plan-ev-meta { font-size: 12px; color: #555; margin: 8px 0 0; display: flex; flex-direction: column; gap: 3px; }
    .plan-ev-purpose { font-size: 12px; color: #3a6b3a; margin: 8px 0 0; line-height: 1.4; background:#f4f9f3; padding:8px 12px; border-radius:10px; border-left:3px solid #3a6b3a; }

    /* Lote Selector Chips */
    .plan-lote-chip {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 8px 16px;
      border-radius: 9999px;
      border: 1.5px solid #d4dfd2;
      background: #ffffff;
      color: #2d3e2c;
      font-family: 'Work Sans', sans-serif;
      font-size: 12.5px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.15s ease;
      box-shadow: 0 1px 4px rgba(0,0,0,0.03);
    }
    .plan-lote-chip:hover {
      background: #eef5eb;
      border-color: #2d3e2c;
      transform: translateY(-1px);
    }
    .plan-lote-chip.active {
      background: #2d3e2c !important;
      color: #ffffff !important;
      border-color: #2d3e2c !important;
      box-shadow: 0 3px 10px rgba(45,62,44,0.28);
    }
    
    /* Material 3 Expressive Actions */
    .plan-ev-actions { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    
    /* M3 Expressive Buttons */
    .plan-btn-primary {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 8px;
      background: #2d3e2c;
      color: #ffffff;
      border: none;
      border-radius: 9999px;
      padding: 10px 20px;
      font-family: 'Work Sans', sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.2px;
      cursor: pointer;
      box-shadow: 0 2px 8px rgba(45, 62, 44, 0.25);
      transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
    }
    .plan-btn-primary:hover {
      background: #1f2c1e;
      transform: translateY(-1.5px);
      box-shadow: 0 5px 14px rgba(45, 62, 44, 0.35);
    }
    .plan-btn-primary:active {
      transform: scale(0.97);
    }

    .plan-btn-ghost {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 6px;
      background: #f0f4ef;
      color: #2d3e2c;
      border: 1px solid #d0ddd0;
      border-radius: 9999px;
      padding: 10px 18px;
      font-family: 'Work Sans', sans-serif;
      font-size: 13px;
      font-weight: 700;
      letter-spacing: 0.1px;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
    }
    .plan-btn-ghost:hover {
      background: #e3ece2;
      border-color: #b5c7b4;
      transform: translateY(-1.5px);
    }
    .plan-btn-ghost:active {
      transform: scale(0.97);
    }

    .plan-btn-danger {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      background: #ffe2db;
      color: #c62828;
      border: none;
      border-radius: 9999px;
      padding: 8px 12px;
      font-family: 'Work Sans', sans-serif;
      font-size: 12px;
      font-weight: 700;
      cursor: pointer;
      transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
    }
    .plan-btn-danger:hover {
      background: #ffcdd2;
      color: #b71c1c;
      transform: translateY(-1px);
    }
    .plan-btn-danger:active {
      transform: scale(0.97);
    }

    .plan-btn-add-inline {
      width: 100%;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      flex-direction: row !important;
      gap: 10px !important;
      background: linear-gradient(135deg, #2d3e2c 0%, #3d563b 100%);
      color: #ffffff !important;
      border: none;
      border-radius: 9999px;
      padding: 14px 24px;
      font-family: 'Work Sans', sans-serif;
      font-size: 14.5px;
      font-weight: 700;
      letter-spacing: 0.2px;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(45, 62, 44, 0.28);
      transition: all 0.2s cubic-bezier(0.2, 0, 0, 1);
      box-sizing: border-box;
      text-align: center;
    }
    .plan-btn-add-inline > * {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      vertical-align: middle;
      line-height: 1.2;
    }
    .plan-btn-add-inline .material-symbols-outlined,
    .plan-btn-add-inline .material-icons {
      font-size: 22px !important;
      flex-shrink: 0;
    }
    .plan-btn-add-inline:hover {
      background: linear-gradient(135deg, #233122 0%, #324731 100%);
      transform: translateY(-2px);
      box-shadow: 0 6px 18px rgba(45, 62, 44, 0.38);
    }
    .plan-btn-add-inline:active {
      transform: scale(0.98);
    }

    /* Tarjeta blanca unificada para el Cafetal */
    .cafetal-unified-card {
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
      background: var(--m3-surface-container-lowest, #ffffff);
      border: 1.5px solid var(--m3-outline-variant, #c7cec3);
      border-radius: 20px;
      padding: 18px 16px;
      box-shadow: 0 4px 16px rgba(45, 62, 44, 0.06);
      margin-bottom: 20px;
    }
    .cafetal-unified-card .da-cal-week-strip {
      width: 100% !important;
      box-sizing: border-box !important;
      gap: 6px !important;
      margin-bottom: 4px !important;
    }
    .cafetal-unified-card .da-cal-strip-day {
      flex: 1 1 0 !important;
      min-width: 0 !important;
      box-sizing: border-box !important;
    }
    .cafetal-unified-card .da-calendar-grid {
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .cafetal-unified-card .da-cal-mob-bar {
      width: 100% !important;
      box-sizing: border-box !important;
    }
    .da-calendar-card:has(.da-calendar-grid.open) .da-cal-week-strip,
    .da-cal-week-strip.open-month-hidden {
      display: none !important;
    }
    #plan-day-details-panel {
      width: 100%;
      box-sizing: border-box;
    }
    #plan-day-details-panel .da-day-details {
      margin-top: 0;
      border-radius: 20px;
      border: 1px solid rgba(0, 0, 0, 0.07);
      background: #ffffff;
      padding: 16px 14px;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.03);
    }
    .cafetal-day-details-inner {
      width: 100% !important;
      box-sizing: border-box !important;
      background: transparent !important;
      border: none !important;
      box-shadow: none !important;
      padding: 0 !important;
    }
    .cafetal-selector-card {
      width: 100% !important;
      max-width: 100% !important;
      box-sizing: border-box !important;
    }
    .cafetal-day-details-inner .plan-ev {
      margin-bottom: 10px;
    }

    @media (max-width: 600px) {
      .cafetal-unified-card {
        padding: 14px 12px !important;
        border-radius: 18px !important;
      }
      .cafetal-selector-card {
        padding: 12px 14px !important;
        border-radius: 18px !important;
      }
    }
  </style>`;
}

export async function renderPlanIfcafe(filterLoteId, options = {}) {
  _ifcafeLoteId = (filterLoteId && filterLoteId !== 'null') ? filterLoteId : null;
  let empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id');

  if (!empresaId) {
    try {
      const user = await getUser();
      if (user?.id) {
        const data = await restFetch(`/rest/v1/usuario_empresas?usuario_id=eq.${encodeURIComponent(user.id)}&select=empresa_id`);
        if (data && data.length > 0) {
          empresaId = data[0].empresa_id;
          localStorage.setItem('current_empresa_id', empresaId);
        }
      }
    } catch (e) {
      console.warn('empresa recovery in plan_ifcafe failed:', e);
    }
  }

  if (!empresaId) {
    return `<div class="m3-p-8 m3-text-center"><p class="m3-label-medium m3-text-on-surface-variant">No se encontró la empresa. Ve al Dashboard primero.</p></div>`;
  }

  try {
    const [lotesData, appsData, personalData, userData, motoresData, sesData, gastosData] = await Promise.all([
      restFetch(`/rest/v1/lotes?empresa_id=eq.${empresaId}&select=*&order=nombre.asc`),
      restFetch(`/rest/v1/lote_aplicaciones?empresa_id=eq.${empresaId}&select=*&order=fecha.asc`),
      restFetch(`/rest/v1/personal?empresa_id=eq.${empresaId}&select=*&order=nombre.asc`),
      getUser(),
      restFetch(`/rest/v1/motores?empresa_id=eq.${empresaId}&select=*`).catch(() => []),
      restFetch(`/rest/v1/motor_sesiones?empresa_id=eq.${empresaId}&select=*&order=fecha.desc`).catch(() => []),
      fetchEmpresaGastosFresh().catch(() => [])
    ]);

    _allLotes = Array.isArray(lotesData) ? lotesData : [];
    _personalList = Array.isArray(personalData) ? personalData : [];
    _empresaGastosList = Array.isArray(gastosData) ? gastosData : [];
    _currentUser = userData;
    const isMotoguadana = (m) => m?.icon === '✂️' || /motoguada|guadañ|chapea|desbroz|orillad/i.test(m?.nombre || '');
    const rawFuelMotores = (Array.isArray(motoresData) ? motoresData : []).filter(m => isFuelMotor(m));
    const sharedFuelPrice = resolveSharedFuelPrice(null, rawFuelMotores, empresaId);
    if (sharedFuelPrice > 0) saveSharedFuelPrice(empresaId, sharedFuelPrice);
    _fuelMotoresList = rawFuelMotores
      .map(m => ({
        ...m,
        _cfg: parseMotorConfig(m),
        _resolvedPrice: resolveSharedFuelPrice(m, rawFuelMotores, empresaId),
      }))
      .sort((a, b) => {
        const aM = isMotoguadana(a) ? 0 : 1;
        const bM = isMotoguadana(b) ? 0 : 1;
        if (aM !== bM) return aM - bM;
        return String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es');
      });

    let aplicaciones = (Array.isArray(appsData) ? appsData : []).filter(a => !String(a.observaciones || '').startsWith('[COSECHA_JSON]'));

    if (_allLotes.length === 0) {
      return emptyStateHtml('No hay lotes registrados', 'Crea tu primer lote de café para planificar y registrar labores');
    }

    let targetLotes = _ifcafeLoteId
      ? _allLotes.filter(l => l.id === _ifcafeLoteId)
      : _allLotes;

    if (_ifcafeLoteId && targetLotes.length === 0) {
      return emptyStateHtml('Lote no encontrado');
    }

    _ifcafeEvents = [];
    _ifcafeLotes = [];

    const todayStr = getLocalToday();

    // 1. Agregar aplicaciones reales de la base de datos
    aplicaciones.forEach(app => {
      if (_ifcafeLoteId && app.lote_id !== _ifcafeLoteId) return;
      const lote = _allLotes.find(l => l.id === app.lote_id);
      if (!lote) return;

      const appFecha = app.fecha || todayStr;
      const parts = appFecha.split('-');
      const matchFecha = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]) || 1);

      let estadoCalculado = app.estado || 'Aplicada';
      if (estadoCalculado === 'Programada' && appFecha < todayStr) {
        estadoCalculado = 'Atrasada';
      }

      const plantPhoto = (app.notas && (app.notas.startsWith('data:image') || app.notas.startsWith('http'))) ? app.notas : (app.foto_url || app.image_url || null);

      _ifcafeEvents.push({
        id: app.id,
        isDb: true,
        isGuide: false,
        loteId: lote.id,
        loteNombre: lote.nombre,
        showLote: !_ifcafeLoteId,
        fecha: appFecha,
        matchFecha,
        tipo: app.tipo || 'Fertilización',
        metodo: app.metodo || '',
        producto: app.producto || 'Actividad registrada',
        dosis: app.dosis || '',
        operador: (() => {
          let op = app.operador || '';
          if (!op && app.observaciones && app.observaciones.includes('Responsables:')) {
            const m = app.observaciones.match(/Responsables:\s*([^\n]+)/);
            if (m) op = m[1].trim();
          }
          return op;
        })(),
        observaciones: (app.observaciones || '')
          .replace(/👤?\s*Responsables:\s*[^\n]+(\n+|$)/gi, '')
          .trim(),
        foto_url: plantPhoto,
        estado: estadoCalculado,
        purpose: ''
      });
    });

    // 1b. Agrupar usos de equipos por gasolina por (lote, fecha) y vincular a Limpieza
    const targetLoteByNorm = new Map();
    targetLotes.forEach((l) => {
      const k = normalizeAreaName(l.nombre);
      if (k && !targetLoteByNorm.has(k)) targetLoteByNorm.set(k, l);
    });
    const sesByMotor = new Map();
    (Array.isArray(sesData) ? sesData : []).forEach((s) => {
      if (!s?.motor_id) return;
      const arr = sesByMotor.get(s.motor_id);
      if (arr) arr.push(s);
      else sesByMotor.set(s.motor_id, [s]);
    });
    const fuelGroups = new Map();
    rawFuelMotores.forEach((m) => {
      const fallbackPrice = resolveSharedFuelPrice(m, rawFuelMotores, empresaId);
      const stats = computeFuelMotorStats(m, sesByMotor.get(m.id) || [], [], fallbackPrice);
      stats.fuelLoads.forEach((load) => {
        const matchedLote = targetLoteByNorm.get(normalizeAreaName(load.hora_fin));
        if (!matchedLote) return;
        const loadFechaIso = toLocalIsoDate(load.fecha || load.created_at);
        const gk = `${matchedLote.id}__${loadFechaIso}`;
        if (!fuelGroups.has(gk)) {
          const parts = loadFechaIso.split('-');
          fuelGroups.set(gk, {
            lote: matchedLote,
            fecha: loadFechaIso,
            matchFecha: new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10) || 1),
            loads: [],
          });
        }
        fuelGroups.get(gk).loads.push({
          id: load.id,
          motorId: m.id,
          motorNombre: m.nombre || 'Equipo de gasolina',
          motorIcon: m.icon || '✂️',
          liters: load._liters,
          unitPrice: load._unitPrice,
          cost: load._cost,
          operador: load.operador || '',
        });
      });
    });

    for (const group of fuelGroups.values()) {
      const opSeenGroup = new Set();
      const groupOps = [];
      group.loads.forEach((fl) => {
        String(fl.operador || '').split(',').map(s => s.trim()).filter(Boolean).forEach((op) => {
          const k = normalizeAreaName(op);
          if (!k || opSeenGroup.has(k)) return;
          opSeenGroup.add(k);
          groupOps.push(op);
        });
      });

      const limpiezaMatches = _ifcafeEvents.filter(
        ev => ev.isDb && String(ev.loteId) === String(group.lote.id) && ev.fecha === group.fecha && String(ev.tipo || '').toLowerCase().includes('limpieza')
      );
      const targetEv =
        limpiezaMatches.find(ev => /motoguad|guadañ/i.test(ev.producto || '')) ||
        limpiezaMatches[0] ||
        null;

      if (targetEv) {
        targetEv.linkedFuelLoads = group.loads;
        if (!targetEv.operador && groupOps.length > 0) {
          targetEv.operador = groupOps.join(', ');
        }
      } else {
        const sumLiters = Math.round(group.loads.reduce((s, x) => s + (Number(x.liters) || 0), 0) * 10) / 10;
        const sumCost = Math.round(group.loads.reduce((s, x) => s + (Number(x.cost) || 0), 0) * 100) / 100;
        const anyGroupMoto = group.loads.some(fl => fl.motorIcon === '✂️' || /motoguad|guadañ|chapea|desbroz|orillad/i.test(fl.motorNombre || ''));
        const singleLoad = group.loads.length === 1 ? group.loads[0] : null;
        _ifcafeEvents.push({
          id: `fuel_group_${group.lote.id}_${group.fecha}`,
          isDb: false,
          isFuelUsage: true,
          isGuide: false,
          loteId: group.lote.id,
          loteNombre: group.lote.nombre,
          showLote: !_ifcafeLoteId,
          fecha: group.fecha,
          matchFecha: group.matchFecha,
          tipo: anyGroupMoto ? 'Motoguadañas' : 'Uso de equipos',
          producto: singleLoad
            ? singleLoad.motorNombre
            : (anyGroupMoto ? 'Motoguadañas' : 'Equipos usados'),
          motorIcon: anyGroupMoto ? '✂️' : (singleLoad?.motorIcon || '⚙️'),
          linkedFuelLoads: group.loads,
          liters: sumLiters,
          cost: sumCost,
          operador: groupOps.join(', '),
          estado: 'Aplicada',
        });
      }
    }

    // 2. Resumen de labores por lote
    targetLotes.forEach(lote => {
      const numPlantas = parseInt(lote.num_plantas) || 0;
      const appsLoteCount = aplicaciones.filter(a => a.lote_id === lote.id && a.estado === 'Aplicada').length;
      _ifcafeLotes.push({
        id: lote.id,
        nombre: lote.nombre,
        variedad: lote.variedad || 'Café',
        numPlantas,
        realizadas: appsLoteCount,
        total: appsLoteCount
      });
    });

    const activeLote = _ifcafeLoteId ? targetLotes[0] : null;

    if (options.embedded) {
      return `
        <div class="m3-font-work-sans" style="width:100%;">
          ${calendarShellHtml(activeLote, true, false)}
        </div>
        ${planStyles()}
      `;
    }

    return `
      <div class="app-screen m3-font-work-sans" style="width:100%;margin:0;padding:4px 0 80px 0;">
        
        <!-- Header -->
        <div style="display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
          <div>
            <h1 style="font-size:24px;font-weight:800;color:#1a1a1a;margin:0;letter-spacing:-.5px;display:flex;align-items:center;gap:8px;">
              <span>🌿</span> ${activeLote ? `Agenda: ${activeLote.nombre}` : 'Manejo del Cafetal'}
            </h1>
            <p style="font-size:13px;color:#666;margin:4px 0 0;">Agenda de abonadas, foliares, podas y labores de campo</p>
          </div>
          ${activeLote ? `
            <a href="#" onclick="event.preventDefault();window.navigateTo('plan_ifcafe')" style="display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:700; color:#2d3e2c; background:#f0f7e6; padding:6px 14px; border-radius:20px; text-decoration:none;">
              <span class="material-symbols-outlined" style="font-size:16px;">apps</span> Ver todos los lotes
            </a>
          ` : ''}
        </div>

        ${activeLote ? `
          <div style="background:linear-gradient(135deg,#2d3e2c,#4a7a48);border-radius:16px;padding:16px 20px;color:white;margin-bottom:18px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;box-shadow:0 4px 20px rgba(45,62,44,0.22);">
            <div style="display:flex;align-items:center;gap:12px;">
              <span class="material-symbols-outlined" style="font-size:28px;">eco</span>
              <div>
                <div style="font-size:18px;font-weight:800;letter-spacing:-.3px;">${activeLote.nombre}</div>
                <div style="font-size:12px;opacity:.9;">Variedad: ${activeLote.variedad || 'Café'} · ${(activeLote.num_plantas || 0).toLocaleString()} plantas</div>
              </div>
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;">
              ${activeLote.edad_categoria ? `<span style="font-size:11px;font-weight:700;background:rgba(255,255,255,0.16);padding:5px 12px;border-radius:20px;">${activeLote.edad_categoria}</span>` : ''}
              ${activeLote.altura_msnm ? `<span style="font-size:11px;font-weight:700;background:rgba(255,255,255,0.16);padding:5px 12px;border-radius:20px;">${activeLote.altura_msnm} msnm</span>` : ''}
              <a href="#" onclick="event.preventDefault();window.navigateTo('detalle_lote','${activeLote.id}')" style="font-size:11px;font-weight:700;color:#fff;background:rgba(255,255,255,0.25);padding:5px 12px;border-radius:20px;text-decoration:none;display:inline-flex;align-items:center;gap:4px;">
                Ver Lote <span class="material-symbols-outlined" style="font-size:13px;">arrow_forward</span>
              </a>
            </div>
          </div>
        ` : ''}

        <!-- Single Unified Card (Filter + Calendar + Day Activities + Resumen por Lote) -->
        ${calendarShellHtml(activeLote, false, !activeLote && _ifcafeLotes.length > 0)}

      </div>
      ${planStyles()}
    `;
  } catch (err) {
    console.error('Error en plan_ifcafe:', err);
    return `<div class="m3-p-4 m3-text-center"><p class="m3-label-medium m3-text-error">Error: ${err.message}</p></div>`;
  }
}

export function initPlanIfcafe() {
  window._togglePlanEvCard = function(cardEl, event) {
    if (!cardEl || event?.target?.closest('button, a, img') || cardEl.closest('.plan-ev-swipe-wrap')?.dataset.swiped === '1') return;
    const d = cardEl.querySelector('.plan-ev-details');
    const c = cardEl.querySelector('.plan-ev-chevron');
    if (!d) return;
    const willOpen = d.style.display !== 'block';
    const panel = document.getElementById('plan-day-details');
    if (willOpen && panel) {
      panel.querySelectorAll('.plan-ev').forEach((other) => {
        if (other === cardEl) return;
        const od = other.querySelector('.plan-ev-details');
        const oc = other.querySelector('.plan-ev-chevron');
        if (od) od.style.display = 'none';
        if (oc) oc.style.transform = 'rotate(0deg)';
      });
    }
    d.style.display = willOpen ? 'block' : 'none';
    if (c) c.style.transform = willOpen ? 'rotate(180deg)' : 'rotate(0deg)';
    notifyExpandedActivityFooter();
  };

  window._syncPlanGastosFromBalance = (rows) => {
    if (Array.isArray(rows)) {
      _empresaGastosList = rows;
      notifyExpandedActivityFooter();
    }
  };

  window._syncExpandedPlanActivityFooter = () => notifyExpandedActivityFooter();

  const reloadCurrentView = (loteIdTarget) => {
    window.clearScreenCache?.('plan_ifcafe');
    window.clearScreenCache?.('detalle_lote');
    window.clearScreenCache?.('dashboard');
    window.clearScreenCache?.('personal');
    if (document.getElementById('lote-bottom-sheet')?.classList.contains('open') && typeof window._reloadLoteSheetDetail === 'function') {
      window._reloadLoteSheetDetail(loteIdTarget || _ifcafeLoteId);
      return;
    }
    if (window.location.hash.startsWith('#detalle_lote')) {
      const lid = loteIdTarget || _ifcafeLoteId;
      window.navigateTo('detalle_lote', lid);
    } else {
      window.navigateTo('plan_ifcafe', ...(loteIdTarget || _ifcafeLoteId ? [loteIdTarget || _ifcafeLoteId] : []));
    }
  };

  window.changePlanCalMonth = function(dir) {
    _calMonth += dir;
    if (_calMonth < 0) {
      _calMonth = 11;
      _calYear--;
    } else if (_calMonth > 11) {
      _calMonth = 0;
      _calYear++;
    }
    renderPlanCal();
  };

  window.togglePlanCalendarView = function() {
    const weekEl = document.getElementById('plan-cal-week-strip');
    const monthEl = document.getElementById('plan-cal-month-grid');
    const textEl = document.getElementById('plan-cal-toggle-text');
    const iconEl = document.getElementById('plan-cal-toggle-icon');
    const mobDateEl = document.getElementById('plan-cal-mob-date');
    if (!monthEl || !weekEl) return;

    const isMonthVisible = monthEl.classList.contains('open');
    if (isMonthVisible) {
      monthEl.classList.remove('open');
      monthEl.style.setProperty('display', 'none', 'important');
      weekEl.classList.remove('open-month-hidden');
      weekEl.style.setProperty('display', 'flex', 'important');
      if (textEl) textEl.textContent = 'Ver mes';
      if (iconEl) iconEl.textContent = 'calendar_month';
      if (mobDateEl) {
        const fullDate = new Date(_calYear, _calMonth, _selectedDay || 1);
        const dayName = fullDate.toLocaleDateString('es-ES', { weekday: 'short' });
        const dayCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);
        const monthName = fullDate.toLocaleDateString('es-ES', { month: 'short' });
        const monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1).replace('.', '');
        mobDateEl.textContent = `${dayCap}, ${_selectedDay || 1} ${monthCap}`;
      }
    } else {
      monthEl.classList.add('open');
      monthEl.style.setProperty('display', 'grid', 'important');
      weekEl.classList.add('open-month-hidden');
      weekEl.style.setProperty('display', 'none', 'important');
      if (textEl) textEl.textContent = 'Ver semana';
      if (iconEl) iconEl.textContent = 'view_week';
      if (mobDateEl) {
        const mDate = new Date(_calYear, _calMonth, 1);
        const mName = mDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
        mobDateEl.textContent = mName.charAt(0).toUpperCase() + mName.slice(1);
      }
    }
  };

  window.navPlanCalPrev = function() {
    const monthEl = document.getElementById('plan-cal-month-grid');
    const isMonthView = monthEl && (monthEl.classList.contains('open') || window.innerWidth > 768);
    if (isMonthView) {
      _calMonth--;
      if (_calMonth < 0) { _calMonth = 11; _calYear--; }
    } else {
      const cur = new Date(_calYear, _calMonth, _selectedDay || 1);
      cur.setDate(cur.getDate() - 7);
      _calYear = cur.getFullYear();
      _calMonth = cur.getMonth();
      _selectedDay = cur.getDate();
    }
    renderPlanCal();
  };

  window.navPlanCalNext = function() {
    const monthEl = document.getElementById('plan-cal-month-grid');
    const isMonthView = monthEl && (monthEl.classList.contains('open') || window.innerWidth > 768);
    if (isMonthView) {
      _calMonth++;
      if (_calMonth > 11) { _calMonth = 0; _calYear++; }
    } else {
      const cur = new Date(_calYear, _calMonth, _selectedDay || 1);
      cur.setDate(cur.getDate() + 7);
      _calYear = cur.getFullYear();
      _calMonth = cur.getMonth();
      _selectedDay = cur.getDate();
    }
    renderPlanCal();
  };

  window.selectPlanCalendarDay = function(y, m, d) {
    _calYear = y;
    _calMonth = m;
    _selectedDay = d;
    renderPlanCal();
  };

  window.toggleResumenLotes = function() {
    const content = document.getElementById('content-resumen-lotes');
    const txt = document.getElementById('txt-toggle-resumen-lotes');
    const ico = document.getElementById('ico-toggle-resumen-lotes');
    if (!content) return;

    const isHidden = content.style.display === 'none' || !content.style.display;
    if (isHidden) {
      content.style.display = 'flex';
      if (txt) txt.textContent = 'Ocultar';
      if (ico) {
        ico.textContent = 'expand_less';
        ico.style.transform = 'rotate(180deg)';
      }
    } else {
      content.style.display = 'none';
      if (txt) txt.textContent = 'Ver lotes';
      if (ico) {
        ico.textContent = 'expand_more';
        ico.style.transform = 'rotate(0deg)';
      }
    }
  };

  window.showInlineActividadForm = function(defaultDate) {
    showInlineActividadForm(defaultDate);
  };

  window.cancelInlineActividad = function(defaultDate) {
    if (document.getElementById('modal-container')?.classList.contains('active')) {
      closeModal();
      return;
    }
    const day = parseInt(defaultDate.split('-')[2]);
    const monthEvents = _ifcafeEvents.filter(ev => {
      if (!ev.matchFecha) return false;
      return ev.matchFecha.getFullYear() === _calYear && ev.matchFecha.getMonth() === _calMonth;
    });
    const dayEvents = monthEvents.filter(ev => ev.matchFecha.getDate() === day);
    showPlanDayDetails(day, dayEvents);
  };

  window.guardarActividadPlanInline = async function(data) {
    try {
      const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id');
      if (!empresaId) throw new Error('No se detectó empresa activa');

      const obsFinal = (data.observaciones || '').trim()
        .replace(/👤?\s*Responsables:\s*[^\n]+(\n+|$)/gi, '')
        .trim();
      const operadores = (data.operador || '').trim();

      const payload = {
        lote_id: data.lote_id,
        fecha: data.fecha,
        tipo: data.tipo || 'Fertilización al Suelo',
        metodo: data.metodo || (data.tipo === 'Aplicación Foliar' ? 'Foliar' : 'Al suelo'),
        producto: data.producto || 'Actividad programada',
        dosis: data.dosis || '',
        operador: operadores || null,
        estado: data.estado || 'Programada',
        observaciones: obsFinal,
        foto_url: data.foto_url || null
      };

      if (data.id) {
        await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${data.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload)
        });
      } else {
        payload.empresa_id = empresaId;
        const result = await restInsert('/rest/v1/lote_aplicaciones', payload);
        if (!result) throw new Error('No se pudo guardar la actividad');
      }

      const fuelLoads = Array.isArray(data._fuelLoads) ? data._fuelLoads : [];
      if (fuelLoads.length > 0) {
        const loteObj = _allLotes.find(l => String(l.id) === String(data.lote_id));
        const loteNombre = loteObj?.nombre || '';
        const todayIso = getLocalToday();
        const parsedFecha = (data.fecha && data.fecha !== todayIso) ? new Date(`${data.fecha}T12:00:00`) : null;
        const fechaIso = (parsedFecha && !Number.isNaN(parsedFecha.getTime()))
          ? parsedFecha.toISOString()
          : new Date().toISOString();
        const operadorFuel = operadores || _currentUser?.user_metadata?.full_name || _currentUser?.email || 'Operador';
        let anyPriceChanged = false;

        for (const item of fuelLoads) {
          const duracionMins = Math.max(1, Math.round(item.liters * (item.cfg?.horasPorLitro || 2) * 60));
          const created = await restFetch('/rest/v1/motor_sesiones', {
            method: 'POST',
            body: JSON.stringify({
              motor_id: item.motor.id,
              empresa_id: empresaId,
              fecha: fechaIso,
              duracion_mins: duracionMins,
              total_horas: item.liters,
              operador: operadorFuel,
              hora_inicio: encodeFuelLoadTag(item.unitPrice),
              hora_fin: loteNombre || null,
            }),
          });
          const savedRow = Array.isArray(created) ? created[0] : created;
          if (navigator.onLine && !savedRow?.id) {
            throw new Error('Supabase no confirmó la carga de gasolina');
          }
          if (savedRow?.id) await db.motor_sesiones.put(savedRow).catch(() => {});

          if (item.unitPrice > 0) saveSharedFuelPrice(empresaId, item.unitPrice);
          if (item.unitPrice > 0 && Math.abs(item.unitPrice - (item.cfg?.precioPorLitro || 0)) > 0.001) {
            anyPriceChanged = true;
            const cfg = item.cfg;
            const updatedNotas = serializeMotorNotas(cfg.cleanNotas, {
              modo: cfg.modo,
              horasPorLitro: cfg.horasPorLitro,
              precioPorLitro: item.unitPrice,
              mantenimientos: cfg.mantenimientos,
              forceTag: isLikelyFuelEquipment(item.motor.icon, item.motor.nombre),
            });
            const updMotor = await restFetch(`/rest/v1/motores?id=eq.${encodeURIComponent(item.motor.id)}`, {
              method: 'PATCH',
              body: JSON.stringify({ notas: updatedNotas }),
            }).catch(() => null);
            const savedMotor = Array.isArray(updMotor) ? updMotor[0] : updMotor;
            if (savedMotor?.id) await db.motores.put(savedMotor).catch(() => {});
          }
        }

        invalidateCache('motor_sesiones');
        invalidateCache('motores');
        if (navigator.onLine) await syncTable('motor_sesiones', true).catch(() => {});
        if (navigator.onLine && anyPriceChanged) await syncTable('motores', true).catch(() => {});
        window.clearScreenCache?.('motores');
        window.clearScreenCache?.('gastos');
        window.clearScreenCache?.('personal');
        const totalLitFuel = Math.round(fuelLoads.reduce((s, x) => s + x.liters, 0) * 10) / 10;
        window.Snackbar?.show(
          data.id
            ? `✅ Actividad actualizada y ${formatLitersLabel(totalLitFuel)} de gasolina registrados`
            : `✅ Actividad y ${formatLitersLabel(totalLitFuel)} de gasolina (${fuelLoads.length} ${fuelLoads.length === 1 ? 'equipo' : 'equipos'}) guardados`
        );
      } else {
        window.Snackbar?.show(data.id ? '✅ Actividad actualizada exitosamente' : '✅ Actividad guardada correctamente');
      }

      invalidateCache('lote_aplicaciones');
      closeModal();
      reloadCurrentView(data.lote_id);
    } catch (err) {
      console.error(err);
      window.Snackbar?.show('Error al guardar: ' + err.message, { type: 'error' });
    }
  };

  window.marcarAplicadaDirecta = function(appId, loteId, fecha, producto, tipo, dosis) {
    const todayStr = getLocalToday();
    const tituloModal = `Finalizar: ${producto || tipo || 'Labor'}`;

    showModal(tituloModal, `
      <form id="form-finalizar-labor-modal" style="font-family:'Work Sans',sans-serif;">
        <div style="background:#f4f7f4; padding:12px 14px; border-radius:12px; border:1px solid #d4dfd2; margin-bottom:14px;">
          <div style="font-size:15px; font-weight:800; color:#2d3e2c;">${producto || tipo || 'Labor'}</div>
          <div style="font-size:12.5px; color:#555; margin-top:2px;">
            ${tipo || 'Labor agrícola'}${dosis ? ` · Dosis: ${dosis}` : ''} · Fecha: ${todayStr}
          </div>
        </div>

        <!-- Foto de la Planta (Evidencia al Finalizar) -->
        <div style="background: #fbfdfa; border: 1.5px dashed #c0d4be; border-radius: 14px; padding: 14px; text-align: center; margin: 14px 0 20px 0;">
          <input type="file" id="modal-finalizar-foto-input" accept="image/*" style="display: none;">
          <input type="hidden" id="modal-finalizar-foto-data" value="">
          
          <div id="modal-finalizar-foto-preview-box" style="display: none; position: relative; margin-bottom: 12px;">
            <img id="modal-finalizar-foto-img" src="" alt="Foto de la planta" style="width: 100%; max-height: 180px; object-fit: cover; border-radius: 10px; border: 1px solid #d4dfd2;">
            <button type="button" id="modal-finalizar-btn-quitar-foto" style="position: absolute; top: 6px; right: 6px; background: rgba(0,0,0,0.65); color: #fff; border: none; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
              <span class="material-symbols-outlined" style="font-size: 16px;">close</span>
            </button>
          </div>

          <button type="button" id="modal-finalizar-btn-take-photo" class="plan-btn-ghost" style="width: 100%; height: 42px; font-size: 13px; border-style: dashed; justify-content: center;">
            <span class="material-symbols-outlined" style="font-size: 20px; color: #2d3e2c;">photo_camera</span>
            <span id="modal-finalizar-foto-btn-label">📸 Tomar foto de la planta (Evidencia)</span>
          </button>
          <p style="font-size: 11.5px; color: #666; margin: 6px 0 0;">Opcional: Captura el avance o estado de la planta tras la labor</p>
        </div>

        <div style="display:flex; gap:12px; justify-content:flex-end; align-items:center; margin-top:20px; padding-top:14px; border-top:1px solid #eef2ee;">
          <button type="button" class="plan-btn-ghost" onclick="window.closeModal?.()">
            <span>Cancelar</span>
          </button>
          <button type="submit" class="plan-btn-primary">
            <span class="material-symbols-outlined" style="font-size:18px;">check_circle</span>
            <span>Confirmar y Finalizar</span>
          </button>
        </div>
      </form>
    `);

    // Setup modal photo listeners
    const modalFotoInput = document.getElementById('modal-finalizar-foto-input');
    const modalFotoData = document.getElementById('modal-finalizar-foto-data');
    const modalFotoPreviewBox = document.getElementById('modal-finalizar-foto-preview-box');
    const modalFotoImg = document.getElementById('modal-finalizar-foto-img');
    const modalBtnTakePhoto = document.getElementById('modal-finalizar-btn-take-photo');
    const modalBtnQuitarFoto = document.getElementById('modal-finalizar-btn-quitar-foto');
    const modalFotoBtnLabel = document.getElementById('modal-finalizar-foto-btn-label');

    if (modalBtnTakePhoto && modalFotoInput) {
      modalBtnTakePhoto.addEventListener('click', () => modalFotoInput.click());
    }

    if (modalFotoInput) {
      modalFotoInput.addEventListener('change', async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
          if (modalFotoBtnLabel) modalFotoBtnLabel.textContent = 'Subiendo foto...';
          const localPreview = await compressImage(file, 1000, 0.75);
          modalFotoImg.src = localPreview;
          modalFotoPreviewBox.style.display = 'block';

          const hostedUrl = await uploadImage(file);
          modalFotoData.value = hostedUrl || localPreview;
          if (modalFotoBtnLabel) modalFotoBtnLabel.textContent = 'Cambiar foto de la planta';
        } catch (err) {
          console.error('Error procesando foto:', err);
          window.Snackbar?.show('Error al procesar la foto', { type: 'error' });
        }
      });
    }

    if (modalBtnQuitarFoto) {
      modalBtnQuitarFoto.addEventListener('click', () => {
        modalFotoData.value = '';
        modalFotoImg.src = '';
        if (modalFotoInput) modalFotoInput.value = '';
        modalFotoPreviewBox.style.display = 'none';
        if (modalFotoBtnLabel) modalFotoBtnLabel.textContent = '📸 Tomar foto de la planta (Evidencia)';
      });
    }

    const modalForm = document.getElementById('form-finalizar-labor-modal');
    if (modalForm) {
      modalForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        try {
          const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id');
          const metodo = (tipo && tipo.includes('Foliar')) ? 'Foliar' : 'Al suelo';
          const fotoUrl = modalFotoData?.value || null;

          if (appId && appId !== 'null' && appId !== 'undefined' && appId !== '') {
            const updatePayload = { estado: 'Aplicada', fecha: todayStr };
            if (fotoUrl) {
              updatePayload.foto_url = fotoUrl;
            }
            await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${appId}`, {
              method: 'PATCH',
              body: JSON.stringify(updatePayload)
            });
          } else {
            await restInsert('/rest/v1/lote_aplicaciones', {
              lote_id: loteId,
              fecha: todayStr,
              producto: producto || 'Fertilizante',
              tipo: tipo || 'Fertilización al Suelo',
              dosis: dosis || '',
              metodo,
              estado: 'Aplicada',
              foto_url: fotoUrl,
              empresa_id: empresaId
            });
          }

          closeModal();
          invalidateCache('lote_aplicaciones');
          window.Snackbar?.show('✅ Labor finalizada y registrada');
          reloadCurrentView(loteId);
        } catch (err) {
          console.error(err);
          window.Snackbar?.show('Error: ' + err.message, { type: 'error' });
        }
      });
    }
  };

  window.editarAplicacionDirecta = function(appId) {
    if (!appId) return;
    const app = _ifcafeEvents.find(e => e.id === appId);
    const fecha = app?.fecha || getLocalToday();
    showInlineActividadForm(fecha, appId);
  };

  window.eliminarAplicacionDirecta = async function(appId) {
    if (!appId) return;
    const ev = _ifcafeEvents.find(e => String(e.id) === String(appId));
    const linkedFuel = Array.isArray(ev?.linkedFuelLoads) ? ev.linkedFuelLoads.filter(fl => fl?.id) : [];
    const confirmMsg = linkedFuel.length > 0
      ? '¿Deseas eliminar esta actividad y sus cargas de gasolina asociadas?'
      : '¿Deseas eliminar este registro de actividad?';
    window.Snackbar?.confirm(confirmMsg, async () => {
      try {
        await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${encodeURIComponent(appId)}`, {
          method: 'DELETE'
        });
        await db.lote_aplicaciones.delete(appId).catch(() => {});
        for (const fl of linkedFuel) {
          await restFetch(`/rest/v1/motor_sesiones?id=eq.${encodeURIComponent(fl.id)}`, {
            method: 'DELETE'
          });
          await db.motor_sesiones.delete(fl.id).catch(() => {});
        }
        invalidateCache('lote_aplicaciones');
        if (linkedFuel.length > 0) {
          invalidateCache('motor_sesiones');
          window.clearScreenCache?.('motores');
          window.clearScreenCache?.('gastos');
        }
        window.clearScreenCache?.('personal');
        window.Snackbar?.show('Actividad eliminada');
        reloadCurrentView();
      } catch (err) {
        window.Snackbar?.show('Error al eliminar: ' + err.message, { type: 'error' });
      }
    });
  };

  window.eliminarCargasFuelGrupoDirecta = async function(groupId) {
    if (!groupId) return;
    const ev = _ifcafeEvents.find(e => String(e.id) === String(groupId));
    const linkedFuel = Array.isArray(ev?.linkedFuelLoads) ? ev.linkedFuelLoads.filter(fl => fl?.id) : [];
    if (linkedFuel.length === 0) return;
    const msg = linkedFuel.length === 1
      ? `¿Deseas eliminar el uso de "${linkedFuel[0].motorNombre || 'este equipo'}"?`
      : `¿Deseas eliminar las ${linkedFuel.length} cargas de gasolina registradas en este lote?`;
    window.Snackbar?.confirm(msg, async () => {
      try {
        for (const fl of linkedFuel) {
          await restFetch(`/rest/v1/motor_sesiones?id=eq.${encodeURIComponent(fl.id)}`, {
            method: 'DELETE'
          });
          await db.motor_sesiones.delete(fl.id).catch(() => {});
        }
        invalidateCache('motor_sesiones');
        window.clearScreenCache?.('motores');
        window.clearScreenCache?.('gastos');
        window.clearScreenCache?.('personal');
        window.clearScreenCache?.('personal');
        window.Snackbar?.show('Uso de equipos eliminado');
        reloadCurrentView();
      } catch (err) {
        window.Snackbar?.show('Error al eliminar: ' + err.message, { type: 'error' });
      }
    });
  };

  window.enviarNotifWhatsApp = async function(loteId, loteNombre, fecha, producto, dosis, tipo) {
    try {
      const msg = `🌿 *Finca Manager — Labor en Cafetal*\n\n📍 *Lote:* ${loteNombre || 'Mi cafetal'}\n📅 *Fecha:* ${fecha}\n🏷️ *Tipo:* ${tipo || 'Labor agrícola'}\n🧪 *Producto:* ${producto || '—'}\n⚖️ *Dosis:* ${dosis || '—'}`;
      await sendWhatsApp(msg);
      localStorage.setItem(waNotifiedKey(fecha, loteId), new Date().toLocaleString());
      window.Snackbar?.show('📤 Notificación enviada por WhatsApp');
    } catch (err) {
      window.Snackbar?.show('Error al enviar: ' + err.message, { type: 'error' });
    }
  };

  window.verFotoPlantaModal = function(url, titulo) {
    if (!url) return;
    showModal(titulo || 'Foto de la Planta', `
      <div style="text-align:center; padding: 4px;">
        <img src="${url}" alt="Foto de la planta" style="width: 100%; max-height: 70vh; object-fit: contain; border-radius: 12px; box-shadow: 0 4px 16px rgba(0,0,0,0.15);">
        <p style="font-size: 12px; color: #666; margin-top: 12px; font-weight: 600;">Progreso y estado foliar del lote</p>
      </div>
    `);
  };

  renderPlanCal();
}
