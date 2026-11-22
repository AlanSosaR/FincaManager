import { supabase } from '../supabase.js';
import { restFetch, restInsert } from '../auth.js';
import { showModal, closeModal } from '../modals.js';
import { renderM3SearchBar, initM3FullScreenSearch } from '../components/m3_search.js';
import { mergeCategories, openNewCategoryBottomSheet } from '../utils/custom_categories.js';

let _allGastos = [];
let _refs = { lotes: new Map(), lotesMeta: new Map(), ganado: new Map(), herramientas: new Map(), personal: new Map(), personalMeta: new Map() };
let _pendingSummary = { totalAmount: 0, items: [] };
let activePeriod = 'todo'; // 'todo' | 'dia' | 'semana' | 'mes'
let activeGroupMode = 'categoria'; // 'categoria' | 'lote'
let selectedDateIso = ''; // YYYY-MM-DD
let showMonthCalendar = false;
let activeLoteId = 'all'; // 'all' | lote_id
let currentGastosSearchQuery = '';
let expandedCats = new Set(); // e.g. 'egr:Cafetal'
let showAllCats = new Set();  // categories where "Ver los N movimientos" was clicked

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const SHORT_MONTHS_CAP = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const DAYS_CAP = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const DAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// ─── Helpers de Formato ───────────────────────────────────────────────────────
function formatMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-HN', { style: 'currency', currency: 'HNL' });
}

function formatShortL(n) {
  const v = Math.round((Number(n) || 0) * 100) / 100;
  const isInt = Math.abs(v - Math.round(v)) < 0.005;
  return 'L ' + v.toLocaleString('en-US', {
    minimumFractionDigits: isInt ? 0 : 2,
    maximumFractionDigits: isInt ? 0 : 2
  });
}

function formatNumber(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function getTodayLocalStr() {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatShortDate(dateStr) {
  if (!dateStr) return '';
  const clean = String(dateStr).slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return clean;
  const d = parseInt(parts[2], 10);
  const mIdx = parseInt(parts[1], 10) - 1;
  if (isNaN(d) || mIdx < 0 || mIdx > 11) return clean;
  return `${d} ${SHORT_MONTHS[mIdx]}`;
}

function getCurrentWeekBounds() {
  const now = new Date();
  const day = now.getDay(); // 0=Dom..6=Sab
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() + diffToMon);
  const sun = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6);
  const toIso = (dt) => `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  return { start: toIso(mon), end: toIso(sun) };
}

function isIngresoMov(m) {
  const cat = String(m?.categoria || '').toLowerCase();
  const tipo = String(m?.tipo || '').toLowerCase();
  return tipo === 'ingreso' || cat.includes('ingreso') || cat.includes('venta');
}

const CAFETAL_CATS = new Set([
  'cafetal', 'chapias', 'abonadas', 'foliares', 'foliares/abonos',
  'insumos', 'insumos agrícolas', 'insumos agricolas',
  'terreno y plantado', 'vivero', 'cosecha'
]);

function getDisplayGroupName(cat) {
  const raw = String(cat || '').trim();
  if (!raw) return 'Otros';
  const low = raw.toLowerCase();
  if (CAFETAL_CATS.has(low)) return 'Cafetal';
  if (low === 'personal' || low === 'mano de obra') return 'Personal';
  if (low === 'veterinaria') return 'Veterinaria';
  if (low === 'maquinaria') return 'Maquinaria';
  if (low === 'otro' || low === 'otros') return 'Otros';
  return raw;
}

// ─── Parser de Personal (Exportado para detalle_personal.js) ──────────────────
export function parsePersonalGasto(desc, fechaStr) {
  let clean = (desc || '').replace(/\[Por Aprobar\]/g, '').replace(/\[ref:[^\]]+\]/g, '').replace(/\s{2,}/g, ' ').trim();
  const fDate = fechaStr ? new Date(fechaStr + 'T12:00:00') : new Date();
  const year = isNaN(fDate.getFullYear()) ? new Date().getFullYear() : fDate.getFullYear();

  if (/planilla\s+semanal/i.test(clean) || /semana/i.test(clean)) {
    const splitSemMatch = clean.match(/semana\s+(?:del\s+)?(\d+)(?:\s+de)?\s+([A-Za-z]+)\s*(?:al|-)\s*(\d+)(?:\s+de)?\s+([A-Za-z]+)(?:\s+(\d{4}))?/i);
    const semMatch = clean.match(/semana\s+(?:del\s+)?(\d+)\s*(?:al|-)\s*(\d+)(?:\s+de)?\s+([A-Za-z]+)(?:\s+(\d{4}))?/i);

    let semanaStr = '';
    let matchedText = '';
    if (splitSemMatch) {
      const d1 = splitSemMatch[1], m1 = splitSemMatch[2], d2 = splitSemMatch[3], m2 = splitSemMatch[4], yr = splitSemMatch[5] || year;
      const capM1 = m1.charAt(0).toUpperCase() + m1.slice(1).toLowerCase();
      const capM2 = m2.charAt(0).toUpperCase() + m2.slice(1).toLowerCase();
      semanaStr = `Semana ${d1} ${capM1} - ${d2} ${capM2} ${yr}`;
      matchedText = splitSemMatch[0];
    } else if (semMatch) {
      const d1 = semMatch[1], d2 = semMatch[2], mes = semMatch[3], yr = semMatch[4] || year;
      const capMes = mes.charAt(0).toUpperCase() + mes.slice(1).toLowerCase();
      semanaStr = `Semana ${d1} - ${d2} ${capMes} ${yr}`;
      matchedText = semMatch[0];
    } else {
      const d = new Date(fDate);
      const day = d.getDay();
      const diff = d.getDate() - day + (day === 0 ? -6 : 1);
      const ws = new Date(d.setDate(diff));
      const we = new Date(ws);
      we.setDate(ws.getDate() + 6);
      const mesLbl = MONTH_NAMES[ws.getMonth()];
      semanaStr = `Semana ${ws.getDate()} - ${we.getDate()} ${mesLbl} ${ws.getFullYear()}`;
    }

    const extraMatch = clean.match(/(\(\d+\s+días?[^)]*\))/i);
    const extra = extraMatch ? extraMatch[1] : '';

    let leftover = clean;
    if (matchedText) leftover = leftover.replace(matchedText, '');
    if (extra) leftover = leftover.replace(extra, '');
    leftover = leftover.replace(/^Planilla\s+Semanal\s*[:—–-]?/i, '');
    leftover = leftover.replace(/^[—–\-:\s]+/, '').replace(/[—–\-:\s]+$/, '').trim();

    if (/^\d+\s*(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(leftover) ||
        /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(leftover) ||
        /^\d+$/.test(leftover)) {
      leftover = '';
    }

    return {
      title: semanaStr,
      nombre: leftover,
      extra: extra,
      semana: semanaStr
    };
  }

  if (/planilla\s+mensual/i.test(clean) || /mes/i.test(clean)) {
    const mesMatch = clean.match(/(?:Mes(?:\s+de)?\s+)?([A-Za-z]+)(?:\s+(\d{4}))?/i);
    let mesStr = '';
    let matchedText = '';
    if (mesMatch && MONTH_NAMES.some(m => m.toLowerCase() === mesMatch[1].toLowerCase())) {
      const mName = mesMatch[1].charAt(0).toUpperCase() + mesMatch[1].slice(1).toLowerCase();
      const mYear = mesMatch[2] || year;
      mesStr = `Mes de ${mName} ${mYear}`;
      matchedText = mesMatch[0];
    } else {
      mesStr = `Mes de ${MONTH_NAMES[fDate.getMonth()]} ${year}`;
    }

    const extraMatch = clean.match(/(\(\d+\s+días?[^)]*\))/i);
    const extra = extraMatch ? extraMatch[1] : '';

    let leftover = clean;
    if (matchedText) leftover = leftover.replace(matchedText, '');
    if (extra) leftover = leftover.replace(extra, '');
    leftover = leftover.replace(/^Planilla\s+Mensual\s*[:—–-]?/i, '');
    leftover = leftover.replace(/^[—–\-:\s]+/, '').replace(/[—–\-:\s]+$/, '').trim();

    if (/^\d+\s*(?:de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(leftover) ||
        /^(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)/i.test(leftover) ||
        /^\d+$/.test(leftover)) {
      leftover = '';
    }

    return {
      title: mesStr,
      nombre: leftover,
      extra: extra
    };
  }

  return null;
}

// ─── Fetch de referencias ─────────────────────────────────────────────────────
function extractLoteColor(coordJson) {
  try {
    if (!coordJson) return '#2d3e2c';
    const parsed = typeof coordJson === 'string' ? JSON.parse(coordJson) : coordJson;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed) && parsed.color) {
      return parsed.color;
    }
  } catch {}
  return '#2d3e2c';
}

async function fetchRefs() {
  const empId = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
  const empFilter = empId ? `empresa_id=eq.${encodeURIComponent(empId)}&` : '';
  const [lotesData, ganadoRes, herramientasRes, personalData] = await Promise.all([
    restFetch(`/rest/v1/lotes?${empFilter}select=id,nombre,num_plantas,coordenadas_json`).catch(async () => {
      const local = await supabase.from('lotes').select('id,nombre,num_plantas,coordenadas_json').catch(() => ({ data: [] }));
      return local.data || [];
    }),
    supabase.from('ganado').select('id,nombre'),
    supabase.from('herramientas').select('id,nombre'),
    restFetch(`/rest/v1/personal?${empFilter}select=id,nombre,pago_diario`).catch(async () => {
      const local = await supabase.from('personal').select('id,nombre,pago_diario').catch(() => ({ data: [] }));
      return local.data || [];
    })
  ]);
  const toMap = (arr) => new Map((Array.isArray(arr) ? arr : []).map(x => [String(x.id), x.nombre]));
  const lotesArr = Array.isArray(lotesData) ? lotesData : [];
  const lotesMap = new Map();
  const lotesMeta = new Map();
  lotesArr.forEach(x => {
    const id = String(x.id);
    const nombre = String(x.nombre || '').replace(/\bcafe\b/gi, 'Café');
    lotesMap.set(id, nombre);
    lotesMeta.set(id, {
      id,
      nombre,
      num_plantas: Number(x.num_plantas) || 0,
      color: extractLoteColor(x.coordenadas_json)
    });
  });
  const personalArr = Array.isArray(personalData) ? personalData : [];
  const personalMeta = new Map(personalArr.map(p => [String(p.id), { id: String(p.id), nombre: p.nombre || '', pago_diario: Number(p.pago_diario) || 0 }]));
  return {
    lotes: lotesMap,
    lotesMeta,
    ganado: toMap(ganadoRes.data),
    herramientas: toMap(herramientasRes.data),
    personal: toMap(personalArr),
    personalMeta
  };
}

// ─── Detectar pendientes por enviar a Cuentas (Cosecha y Personal) ───────────
async function computePendingForCuentas(allGastos, refs) {
  const items = [];
  const empId = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
  const empFilter = empId ? `empresa_id=eq.${encodeURIComponent(empId)}&` : '';
  const weekInfo = getWeekBoundsFromIso(getTodayLocalStr());
  const wsIsoCur = weekInfo.start;
  const weIsoCur = weekInfo.end;

  // Mapa de pagos de cosecha ya enviados: refTag -> monto
  const paidCosechaMap = new Map();
  (allGastos || []).forEach(g => {
    const matches = String(g.descripcion || '').match(/\[ref:cosecha_[^\]]+\]/g);
    if (matches) {
      matches.forEach(tag => paidCosechaMap.set(tag, (paidCosechaMap.get(tag) || 0) + (Number(g.monto) || 0)));
    }
  });

  const [appsRes, asisRes] = await Promise.all([
    supabase.from('lote_aplicaciones').select('*').catch(() => ({ data: [] })),
    restFetch(`/rest/v1/personal_asistencia?${empFilter}fecha=gte.${wsIsoCur}&fecha=lte.${weIsoCur}&select=personal_id,fecha,estado`).catch(() => [])
  ]);

  const appsList = Array.isArray(appsRes?.data) ? appsRes.data : [];

  // 1. Pendientes de Cosecha agrupados por (lote_id, semana)
  const cosechaGroups = new Map(); // `${loteId}__${wsIso}` -> Map(workerKey -> pay)
  appsList.forEach(app => {
    const obs = String(app.observaciones || '');
    if (!obs.startsWith('[COSECHA_JSON]')) return;
    const f = String(app.fecha || '').slice(0, 10);
    if (!f || !app.lote_id) return;
    try {
      const parsed = JSON.parse(obs.slice('[COSECHA_JSON]'.length));
      const price = Number(parsed.precio_lata) || 40;
      const regs = Array.isArray(parsed.registros) ? parsed.registros : [];
      const wBounds = getWeekBoundsFromIso(f);
      const gk = `${String(app.lote_id)}__${wBounds.start}`;
      if (!cosechaGroups.has(gk)) {
        cosechaGroups.set(gk, { loteId: String(app.lote_id), wsIso: wBounds.start, weIso: wBounds.end, workers: new Map() });
      }
      const grp = cosechaGroups.get(gk);
      regs.forEach(r => {
        const l = Number(r.latas) || 0;
        if (l <= 0) return;
        const wk = String(r.personal_id || r.nombre);
        grp.workers.set(wk, (grp.workers.get(wk) || 0) + Math.round(l * price));
      });
    } catch {}
  });

  cosechaGroups.forEach(grp => {
    let pendingAmount = 0;
    let isUpdate = false;
    grp.workers.forEach((pay, wk) => {
      const refTag = `[ref:cosecha_${grp.loteId}_${wk}_${grp.wsIso}]`;
      if (!paidCosechaMap.has(refTag)) {
        pendingAmount += pay;
      } else {
        const paid = Math.round(paidCosechaMap.get(refTag) || 0);
        if (paid !== Math.round(pay)) {
          pendingAmount += Math.abs(Math.round(pay) - paid);
          isUpdate = true;
        }
      }
    });
    if (pendingAmount > 0) {
      const meta = refs.lotesMeta?.get(grp.loteId);
      const sDt = isoToDate(grp.wsIso);
      const eDt = isoToDate(grp.weIso);
      const semLbl = `${sDt.getDate()}–${eDt.getDate()} ${SHORT_MONTHS[eDt.getMonth()]}`;
      items.push({
        module: 'cosecha',
        loteId: grp.loteId,
        title: meta?.nombre || refs.lotes?.get(grp.loteId) || 'Lote de café',
        subtitle: `Cosecha · Semana ${semLbl}${isUpdate ? ' · Por actualizar' : ''}`,
        amount: pendingAmount,
        color: meta?.color || '#2d3e2c',
        actionLabel: 'Ir a Cosecha'
      });
    }
  });

  // 2. Pendientes de Personal de la semana actual
  const asisList = Array.isArray(asisRes) ? asisRes : [];
  const personalGastos = (allGastos || []).filter(g => String(g.categoria || '').toLowerCase() === 'personal');
  const isTrabajoState = (est) => {
    const s = String(est || '').toLowerCase();
    return s.includes('asist') || s.includes('trabaj') || s === 'presente' || s === 'si' || s === 'sí';
  };
  let personalPendingTotal = 0;
  let personalPendingCount = 0;
  (refs.personalMeta || new Map()).forEach((pMeta, pId) => {
    if (!pMeta.pago_diario || pMeta.pago_diario <= 0) return;
    const workedDates = new Set(
      asisList
        .filter(a => String(a.personal_id) === pId && isTrabajoState(a.estado))
        .map(a => String(a.fecha || '').slice(0, 10))
        .filter(Boolean)
    );
    const pNomLow = String(pMeta.nombre || '').toLowerCase().trim();
    appsList.forEach(app => {
      const f = String(app.fecha || '').slice(0, 10);
      if (!f || f < wsIsoCur || f > weIsoCur) return;
      if (String(app.observaciones || '').startsWith('[COSECHA_JSON]')) return;
      const pids = Array.isArray(app.personal_ids) ? app.personal_ids.map(String) : [];
      const opMatch = pNomLow && String(app.operador || '').toLowerCase().includes(pNomLow);
      if (pids.includes(pId) || opMatch) workedDates.add(f);
    });
    const weekGross = workedDates.size * pMeta.pago_diario;
    if (weekGross <= 0) return;
    const refPrefix = `[ref:${pId}_sem_${wsIsoCur}]`;
    const paid = personalGastos
      .filter(g => String(g.descripcion || '').includes(refPrefix))
      .reduce((s, g) => s + (Number(g.monto) || 0), 0);
    const pending = Math.max(0, weekGross - paid);
    if (pending > 0) {
      personalPendingTotal += pending;
      personalPendingCount++;
    }
  });
  if (personalPendingTotal > 0) {
    items.push({
      module: 'personal',
      title: 'Personal · Jornales de la semana',
      subtitle: `${personalPendingCount} ${personalPendingCount === 1 ? 'colaborador pendiente' : 'colaboradores pendientes'}`,
      amount: personalPendingTotal,
      color: '#2d3e2c',
      actionLabel: 'Ir a Personal'
    });
  }

  const totalAmount = items.reduce((s, it) => s + (Number(it.amount) || 0), 0);
  return { totalAmount, items };
}

function openPendingReviewSheet() {
  const items = _pendingSummary?.items || [];
  if (!items.length) return;
  showModal('Pendiente de enviar a Cuentas', `
    <div style="display:flex; flex-direction:column; gap:10px; padding-bottom:10px;">
      <div style="font-size:13px; color:#5a6b58; line-height:1.4;">
        Tienes registros en otros módulos que todavía no se han enviado o actualizado en Cuentas. Toca uno para ir a revisarlo:
      </div>
      ${items.map((it, idx) => `
        <button type="button" class="cuentas-pending-item-btn" data-idx="${idx}" style="width:100%; text-align:left; background:#fafcf9; border:1px solid #dfe8dd; border-radius:16px; padding:12px 14px; display:flex; align-items:center; justify-content:space-between; gap:12px; cursor:pointer; font-family:inherit;">
          <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
            ${it.module === 'personal'
              ? `<span class="material-symbols-outlined" style="font-size:20px; color:#2d3e2c; flex-shrink:0;">groups</span>`
              : `<span style="width:12px; height:12px; border-radius:50%; background:${escapeHtml(it.color)}; flex-shrink:0;"></span>`}
            <div style="min-width:0; flex:1;">
              <div style="font-size:14px; font-weight:800; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(it.title)}</div>
              <div style="font-size:12px; color:#5a6b58; margin-top:2px;">${escapeHtml(it.subtitle)}</div>
            </div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div style="font-size:14.5px; font-weight:800; color:#b34200;">${formatShortL(it.amount)}</div>
            <div style="font-size:11.5px; font-weight:700; color:#2d3e2c; margin-top:2px;">${escapeHtml(it.actionLabel)} ›</div>
          </div>
        </button>
      `).join('')}
    </div>
  `);

  document.querySelectorAll('.cuentas-pending-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const it = items[Number(btn.dataset.idx)];
      if (!it) return;
      closeModal();
      if (it.module === 'cosecha' && it.loteId) {
        window._pendingOpenLote = { loteId: it.loteId, tab: 'cosecha' };
        window.navigateTo('dashboard');
      } else if (it.module === 'personal') {
        window.navigateTo('personal');
      }
    });
  });
}

// ─── Helpers de presentación de cada movimiento ───────────────────────────────
function formatMovDisplay(g, refs) {
  const rawDesc = String(g.descripcion || '');
  const isPorAprobar = rawDesc.includes('[Por Aprobar]');
  let cleanDesc = rawDesc
    .replace(/\[Por Aprobar\]/g, '')
    .replace(/\[ref:[^\]]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  let title = cleanDesc || 'Sin descripción';
  let subParts = [];
  let extraLine = '';
  const shortDate = formatShortDate(g.fecha);
  const loteNombre = g.lote_id ? (refs.lotes.get(String(g.lote_id)) || '') : '';

  // Detectar formato de Cosecha: "Cosecha Semana 16 – 22 Noviembre 2026 · Nombre (2 latas)"
  const cosechaMatch = cleanDesc.match(/^Cosecha\s+(Semana\s+[^·]+?)\s*·\s*([^(]+?)(?:\s*\(([^)]+)\))?$/i);
  if (cosechaMatch) {
    const semTxt = cosechaMatch[1].trim();
    const colName = cosechaMatch[2].trim();
    const latasTxt = (cosechaMatch[3] || '').trim();
    title = colName || title;
    if (semTxt) subParts.push(semTxt);
    const latasCafe = latasTxt
      ? (/de\s+caf[eé]/i.test(latasTxt) ? latasTxt : `${latasTxt} de café`)
      : '';
    const extraParts = [];
    if (latasCafe) extraParts.push(latasCafe);
    if (loteNombre) extraParts.push(`Lote ${loteNombre}`);
    extraLine = extraParts.join(' · ');
  } else if (String(g.categoria || '').toLowerCase() === 'personal') {
    const parsed = parsePersonalGasto(cleanDesc, g.fecha);
    let personName = parsed?.nombre || '';
    if (!personName) {
      const refMatch = rawDesc.match(/\[ref:([a-f0-9-]+)/i);
      const workerId = g.personal_id || (refMatch ? refMatch[1] : null);
      if (workerId && refs.personal?.has(String(workerId))) {
        personName = refs.personal.get(String(workerId));
      }
    }
    if (personName) {
      title = personName;
      if (parsed?.title) {
        const compactSem = parsed.title.replace(/^Semana\s+(\d+)\s*-\s*(\d+).*$/i, 'Semana $1–$2');
        subParts.push(compactSem);
      }
    }
    if (shortDate) subParts.push(shortDate);
  } else {
    if (shortDate) subParts.push(shortDate);
    const grp = getDisplayGroupName(g.categoria);
    const rawCat = String(g.categoria || '').replace(/^Ingreso · /i, '').trim();
    if (grp === 'Cafetal' && rawCat && rawCat.toLowerCase() !== 'cafetal') {
      subParts.push(rawCat);
    }
  }

  if (!cosechaMatch) {
    if (loteNombre) {
      subParts.push(loteNombre);
    } else if (g.animal_id && refs.ganado.get(String(g.animal_id))) {
      subParts.push(refs.ganado.get(String(g.animal_id)));
    } else if (g.herramienta_id && refs.herramientas.get(String(g.herramienta_id))) {
      subParts.push(refs.herramientas.get(String(g.herramienta_id)));
    }
  }

  return {
    title,
    subtitle: subParts.join(' · '),
    extraLine,
    isPorAprobar
  };
}

function dateToIso(dt) {
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

function isoToDate(iso) {
  const [y, m, d] = String(iso || getTodayLocalStr()).slice(0, 10).split('-').map(Number);
  return new Date(y || new Date().getFullYear(), (m || 1) - 1, d || 1);
}

function getWeekBoundsFromIso(iso) {
  const base = isoToDate(iso);
  const day = base.getDay(); // 0=Dom..6=Sab
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(base.getFullYear(), base.getMonth(), base.getDate() + diffToMon);
  const days = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
    days.push({ dt, iso: dateToIso(dt) });
  }
  return { start: days[0].iso, end: days[6].iso, days };
}

function shiftIsoDays(iso, delta) {
  const dt = isoToDate(iso);
  dt.setDate(dt.getDate() + delta);
  return dateToIso(dt);
}

function shiftIsoMonths(iso, delta) {
  const dt = isoToDate(iso);
  const targetDay = dt.getDate();
  const shifted = new Date(dt.getFullYear(), dt.getMonth() + delta, 1);
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(targetDay, lastDay));
  return dateToIso(shifted);
}

// ─── Filtrado reactivo en JS ──────────────────────────────────────────────────
function filterByLoteAndSearch(baseList) {
  let list = [...baseList];
  if (activeLoteId !== 'all') {
    const targetId = String(activeLoteId).trim();
    const targetLoteName = String(_refs.lotes.get(targetId) || '').trim().toLowerCase();
    list = list.filter(g => {
      const gLoteId = String(g.lote_id || '').trim();
      if (gLoteId && gLoteId === targetId) return true;
      if (gLoteId && targetLoteName) {
        const gLoteName = String(_refs.lotes.get(gLoteId) || '').trim().toLowerCase();
        if (gLoteName && gLoteName === targetLoteName) return true;
      }
      const desc = String(g.descripcion || '');
      if (desc.includes(`[ref:cosecha_${targetId}_`)) return true;
      if (targetLoteName && desc.toLowerCase().includes(targetLoteName)) return true;
      return false;
    });
  }

  if (currentGastosSearchQuery) {
    const q = currentGastosSearchQuery.toLowerCase();
    list = list.filter(g => {
      const cat = String(g.categoria || '').toLowerCase();
      const grp = getDisplayGroupName(g.categoria).toLowerCase();
      const desc = String(g.descripcion || '').toLowerCase();
      const lName = String(_refs.lotes.get(String(g.lote_id || '')) || '').toLowerCase();
      const aName = String(_refs.ganado.get(String(g.animal_id || '')) || '').toLowerCase();
      const pName = String(_refs.personal.get(String(g.personal_id || '')) || '').toLowerCase();
      return cat.includes(q) || grp.includes(q) || desc.includes(q) || lName.includes(q) || aName.includes(q) || pName.includes(q);
    });
  }
  return list;
}

function getFilteredMovements() {
  if (!selectedDateIso) selectedDateIso = getTodayLocalStr();
  let list = filterByLoteAndSearch(_allGastos);

  if (activePeriod === 'dia') {
    list = list.filter(g => String(g.fecha || '').slice(0, 10) === selectedDateIso);
  } else if (activePeriod === 'semana') {
    const { start, end } = getWeekBoundsFromIso(selectedDateIso);
    list = list.filter(g => {
      const f = String(g.fecha || '').slice(0, 10);
      return f && f >= start && f <= end;
    });
  } else if (activePeriod === 'mes') {
    const ym = selectedDateIso.slice(0, 7);
    list = list.filter(g => String(g.fecha || '').slice(0, 7) === ym);
  }

  list.sort((a, b) => String(b.fecha || '').localeCompare(String(a.fecha || '')));
  return list;
}

// ─── Renderizado Reactivo de Cuentas ──────────────────────────────────────────
function renderCuentasUI() {
  if (!selectedDateIso) selectedDateIso = getTodayLocalStr();
  const periodRow = document.getElementById('cuentas-period-pills');
  const dateNavWrap = document.getElementById('cuentas-date-nav-wrap');
  const lotesRow = document.getElementById('cuentas-lote-pills');
  const kpiWrap = document.getElementById('cuentas-kpi-row');
  const sectionsWrap = document.getElementById('cuentas-sections-wrap');
  if (!kpiWrap || !sectionsWrap) return;

  // 1. Pills de período: Todo | Día | Semana | Mes
  if (periodRow) {
    const prevPeriodScroll = periodRow.scrollLeft;
    const periods = [
      { key: 'todo', label: 'Todo' },
      { key: 'dia', label: 'Día' },
      { key: 'semana', label: 'Semana' },
      { key: 'mes', label: 'Mes' }
    ];
    periodRow.innerHTML = periods.map(p => `
      <button type="button" class="cuentas-pill ${activePeriod === p.key ? 'active' : ''}" data-period="${p.key}">
        ${p.label}
      </button>
    `).join('');
    periodRow.scrollLeft = prevPeriodScroll;
    periodRow.querySelectorAll('button[data-period]').forEach(btn => {
      btn.addEventListener('click', () => {
        activePeriod = btn.dataset.period;
        renderCuentasUI();
        requestAnimationFrame(() => {
          document.querySelector('#cuentas-period-pills button.active')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        });
      });
    });
  }

  // 1b. Navegador específico según Día / Semana / Mes (oculto en Todo)
  if (dateNavWrap) {
    if (activePeriod === 'todo') {
      dateNavWrap.innerHTML = '';
    } else {
      const todayIso = getTodayLocalStr();
      const movDatesSet = new Set(
        filterByLoteAndSearch(_allGastos)
          .map(g => String(g.fecha || '').slice(0, 10))
          .filter(Boolean)
      );
      const selDt = isoToDate(selectedDateIso);
      const weekInfo = getWeekBoundsFromIso(selectedDateIso);

      if (activePeriod === 'dia') {
        const isToday = selectedDateIso === todayIso;
        const dayName = DAYS_FULL[selDt.getDay()];
        const dayNum = selDt.getDate();
        const monthYear = `${MONTH_NAMES[selDt.getMonth()]} ${selDt.getFullYear()}`;
        dateNavWrap.innerHTML = `
          <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; padding:10px 6px 14px;">
            <button type="button" id="cuentas-nav-prev" aria-label="Día anterior" style="width:38px; height:38px; border-radius:50%; border:1px solid #d5e2d2; background:#f2f6f1; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
              <span class="material-symbols-outlined" style="font-size:21px;">chevron_left</span>
            </button>
            <div style="text-align:center; flex:1;">
              <div style="font-size:15px; font-weight:700; color:#2d3e2c;">${escapeHtml(dayName)}</div>
              <div style="font-size:44px; font-weight:800; line-height:1.08; margin:2px 0; color:${isToday ? '#f97316' : '#111827'};">${dayNum}</div>
              <div style="font-size:14.5px; font-weight:700; color:#2d3e2c;">${escapeHtml(monthYear)}</div>
            </div>
            <button type="button" id="cuentas-nav-next" aria-label="Día siguiente" style="width:38px; height:38px; border-radius:50%; border:1px solid #d5e2d2; background:#f2f6f1; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
              <span class="material-symbols-outlined" style="font-size:21px;">chevron_right</span>
            </button>
          </div>
        `;
        document.getElementById('cuentas-nav-prev')?.addEventListener('click', () => {
          selectedDateIso = shiftIsoDays(selectedDateIso, -1);
          renderCuentasUI();
        });
        document.getElementById('cuentas-nav-next')?.addEventListener('click', () => {
          selectedDateIso = shiftIsoDays(selectedDateIso, 1);
          renderCuentasUI();
        });
      } else if (activePeriod === 'semana') {
        const sDt = weekInfo.days[0].dt;
        const eDt = weekInfo.days[6].dt;
        const weekTitle = sDt.getMonth() === eDt.getMonth()
          ? `${sDt.getDate()} – ${eDt.getDate()} ${SHORT_MONTHS_CAP[sDt.getMonth()]} ${sDt.getFullYear()}`
          : `${sDt.getDate()} ${SHORT_MONTHS_CAP[sDt.getMonth()]} – ${eDt.getDate()} ${SHORT_MONTHS_CAP[eDt.getMonth()]} ${eDt.getFullYear()}`;
        dateNavWrap.innerHTML = `
          <div style="margin:2px 0 12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px;">
              <button type="button" id="cuentas-nav-prev" aria-label="Semana anterior" style="width:34px; height:34px; border-radius:50%; border:1px solid #d5e2d2; background:#f2f6f1; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:19px;">chevron_left</span>
              </button>
              <span style="font-size:14.5px; font-weight:800; color:#111827;">${escapeHtml(weekTitle)}</span>
              <button type="button" id="cuentas-nav-next" aria-label="Semana siguiente" style="width:34px; height:34px; border-radius:50%; border:1px solid #d5e2d2; background:#f2f6f1; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:19px;">chevron_right</span>
              </button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:6px;">
              ${weekInfo.days.map(({ dt, iso }) => {
                const isToday = iso === todayIso;
                const hasMov = movDatesSet.has(iso);
                return `
                  <button type="button" class="cuentas-day-card" data-iso="${iso}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:8px 2px; min-height:58px; border-radius:16px; border:1px solid #e6ece4; background:#fafcf9; color:#111827; cursor:pointer; font-family:inherit;">
                    <span style="font-size:11px; font-weight:600; opacity:0.65;">${DAYS_CAP[dt.getDay()]}</span>
                    <span style="font-size:15px; font-weight:800; margin-top:2px; color:${isToday ? '#f97316' : '#111827'};">${dt.getDate()}</span>
                    <span style="width:5px; height:5px; border-radius:50%; margin-top:3px; background:${hasMov ? '#2d3e2c' : 'transparent'};"></span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;
        document.getElementById('cuentas-nav-prev')?.addEventListener('click', () => {
          selectedDateIso = shiftIsoDays(selectedDateIso, -7);
          renderCuentasUI();
        });
        document.getElementById('cuentas-nav-next')?.addEventListener('click', () => {
          selectedDateIso = shiftIsoDays(selectedDateIso, 7);
          renderCuentasUI();
        });
        dateNavWrap.querySelectorAll('.cuentas-day-card').forEach(btn => {
          btn.addEventListener('click', () => {
            selectedDateIso = btn.dataset.iso;
            activePeriod = 'dia';
            renderCuentasUI();
          });
        });
      } else if (activePeriod === 'mes') {
        const y = selDt.getFullYear();
        const m = selDt.getMonth();
        const firstDay = new Date(y, m, 1);
        const startOffset = (firstDay.getDay() + 6) % 7;
        const daysInMonth = new Date(y, m + 1, 0).getDate();
        const cells = [];
        for (let i = 0; i < startOffset; i++) cells.push({ empty: true });
        for (let d = 1; d <= daysInMonth; d++) {
          const iso = dateToIso(new Date(y, m, d));
          cells.push({ day: d, iso, isToday: iso === todayIso, hasMov: movDatesSet.has(iso) });
        }
        dateNavWrap.innerHTML = `
          <div style="background:#f8faf7; border:1px solid #e3ebe1; border-radius:18px; padding:12px; margin:2px 0 12px;">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
              <button type="button" id="cuentas-nav-prev" aria-label="Mes anterior" style="width:32px; height:32px; border-radius:50%; border:1px solid #d5e2d2; background:#ffffff; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:19px;">chevron_left</span>
              </button>
              <span style="font-size:14.5px; font-weight:800; color:#1e3e2b;">${MONTH_NAMES[m]} ${y}</span>
              <button type="button" id="cuentas-nav-next" aria-label="Mes siguiente" style="width:32px; height:32px; border-radius:50%; border:1px solid #d5e2d2; background:#ffffff; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer;">
                <span class="material-symbols-outlined" style="font-size:19px;">chevron_right</span>
              </button>
            </div>
            <div style="display:grid; grid-template-columns:repeat(7,1fr); text-align:center; margin-bottom:4px;">
              ${['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(w => `<span style="font-size:11px; font-weight:700; color:#647462; padding:3px 0;">${w}</span>`).join('')}
            </div>
            <div style="display:grid; grid-template-columns:repeat(7,1fr); gap:3px; text-align:center;">
              ${cells.map(c => {
                if (c.empty) return `<span></span>`;
                return `
                  <button type="button" class="cuentas-cal-day" data-iso="${c.iso}" style="height:36px; border-radius:12px; border:none; background:transparent; color:${c.isToday ? '#f97316' : '#111827'}; font-size:13px; font-weight:${c.isToday || c.hasMov ? '800' : '600'}; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px;">
                    <span>${c.day}</span>
                    ${c.hasMov ? `<span style="width:4px; height:4px; border-radius:50%; background:#2d3e2c;"></span>` : `<span style="height:4px;"></span>`}
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;
        document.getElementById('cuentas-nav-prev')?.addEventListener('click', () => {
          selectedDateIso = shiftIsoMonths(selectedDateIso, -1);
          renderCuentasUI();
        });
        document.getElementById('cuentas-nav-next')?.addEventListener('click', () => {
          selectedDateIso = shiftIsoMonths(selectedDateIso, 1);
          renderCuentasUI();
        });
        dateNavWrap.querySelectorAll('.cuentas-cal-day').forEach(btn => {
          btn.addEventListener('click', () => {
            selectedDateIso = btn.dataset.iso;
            activePeriod = 'dia';
            renderCuentasUI();
          });
        });
      }
    }
  }

  // 2. Pills de lotes (deduplicados por nombre)
  if (lotesRow) {
    const prevScrollLeft = lotesRow.scrollLeft;
    const seenNames = new Set();
    const lotesEntries = [];
    for (const [id, nombre] of _refs.lotes.entries()) {
      const k = String(nombre || '').trim().toLowerCase();
      if (!k || seenNames.has(k)) continue;
      seenNames.add(k);
      lotesEntries.push([id, nombre]);
    }
    const pills = [
      { id: 'all', label: 'Todos los lotes' },
      ...lotesEntries.map(([id, nombre]) => ({ id, label: nombre }))
    ];
    lotesRow.innerHTML = pills.map(p => `
      <button type="button" class="cuentas-pill ${String(activeLoteId) === String(p.id) ? 'active' : ''}" data-lote-id="${escapeHtml(p.id)}">
        ${escapeHtml(p.label)}
      </button>
    `).join('');
    lotesRow.scrollLeft = prevScrollLeft;
    lotesRow.querySelectorAll('button[data-lote-id]').forEach(btn => {
      btn.addEventListener('click', () => {
        const clickedId = btn.dataset.loteId;
        activeLoteId = clickedId;
        renderCuentasUI();
        requestAnimationFrame(() => {
          const newActive = document.querySelector(`#cuentas-lote-pills button.active`);
          newActive?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        });
      });
    });
  }

  // 3. Cálculos
  const filtered = getFilteredMovements();
  const egresosList = filtered.filter(m => !isIngresoMov(m));
  const ingresosList = filtered.filter(m => isIngresoMov(m));

  const totalEgresos = egresosList.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const totalIngresos = ingresosList.reduce((s, g) => s + (Number(g.monto) || 0), 0);
  const balance = totalIngresos - totalEgresos;

  const balanceStr = balance < 0
    ? `– ${formatShortL(Math.abs(balance))}`
    : (balance > 0 ? `+ ${formatShortL(balance)}` : formatShortL(0));
  const balanceColor = balance > 0 ? '#1b6e1b' : '#111827';

  // Calcular total de plantas en el alcance actual (todos los lotes o lote seleccionado)
  let scopePlantas = 0;
  if (activeLoteId === 'all') {
    const seenLoteNames = new Set();
    (_refs.lotesMeta || new Map()).forEach(m => {
      const k = String(m.nombre || '').trim().toLowerCase();
      if (k && !seenLoteNames.has(k)) {
        seenLoteNames.add(k);
        scopePlantas += (Number(m.num_plantas) || 0);
      }
    });
  } else {
    const m = _refs.lotesMeta?.get(String(activeLoteId));
    scopePlantas = Number(m?.num_plantas) || 0;
  }
  const costoPorPlanta = scopePlantas > 0 && totalEgresos > 0 ? (totalEgresos / scopePlantas) : 0;
  const egrSub = scopePlantas > 0 ? `L ${costoPorPlanta.toFixed(2)} por planta` : `${egresosList.length} ${egresosList.length === 1 ? 'egreso' : 'egresos'}`;
  const ingSub = totalIngresos <= 0 ? 'Aún sin ventas' : `${ingresosList.length} ${ingresosList.length === 1 ? 'ingreso' : 'ingresos'}`;
  const balSub = balance < 0 ? 'Inversión por recuperar' : (balance > 0 ? 'Ganancia neta' : 'En equilibrio');

  kpiWrap.innerHTML = `
    <div class="cuentas-kpi-card">
      <div class="cuentas-kpi-label">Egresos</div>
      <div class="cuentas-kpi-val" style="color:#b34200;">${formatShortL(totalEgresos)}</div>
      <div class="cuentas-kpi-sub">${escapeHtml(egrSub)}</div>
    </div>
    <div class="cuentas-kpi-card">
      <div class="cuentas-kpi-label">Ingresos</div>
      <div class="cuentas-kpi-val" style="color:#1b6e1b;">${formatShortL(totalIngresos)}</div>
      <div class="cuentas-kpi-sub">${escapeHtml(ingSub)}</div>
    </div>
    <div class="cuentas-kpi-card">
      <div class="cuentas-kpi-label">Balance</div>
      <div class="cuentas-kpi-val" style="color:${balanceColor};">${balanceStr}</div>
      <div class="cuentas-kpi-sub">${escapeHtml(balSub)}</div>
    </div>
  `;

  // 3b. Banner de Pendiente de enviar a Cuentas
  const pendingWrap = document.getElementById('cuentas-pending-banner');
  if (pendingWrap) {
    const pItems = _pendingSummary?.items || [];
    if (pItems.length > 0 && _pendingSummary.totalAmount > 0) {
      const cosAmt = pItems.filter(x => x.module === 'cosecha').reduce((s, x) => s + x.amount, 0);
      const perAmt = pItems.filter(x => x.module === 'personal').reduce((s, x) => s + x.amount, 0);
      const subParts = [];
      if (cosAmt > 0) subParts.push(`${formatShortL(cosAmt)} de cosecha de la semana`);
      if (perAmt > 0) subParts.push(`${formatShortL(perAmt)} de personal`);
      pendingWrap.innerHTML = `
        <button type="button" id="cuentas-pending-review-btn" style="width:100%; text-align:left; background:#fff3e8; border:1px solid #f5d6bc; border-radius:16px; padding:12px 15px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; gap:12px; cursor:pointer; font-family:inherit;">
          <div style="min-width:0; flex:1;">
            <div style="font-size:14px; font-weight:800; color:#7a3405; line-height:1.25;">Pendiente de enviar a Cuentas</div>
            <div style="font-size:12.5px; font-weight:500; color:#8c4717; margin-top:2px; line-height:1.3;">${escapeHtml(subParts.join(' · '))}</div>
          </div>
          <span style="font-size:14px; font-weight:800; color:#7a3405; white-space:nowrap; flex-shrink:0;">Revisar ›</span>
        </button>
      `;
      document.getElementById('cuentas-pending-review-btn')?.addEventListener('click', openPendingReviewSheet);
    } else {
      pendingWrap.innerHTML = '';
    }
  }

  // 3c. Encabezado + Segmentado Por categoría | Por lote
  const groupToggleWrap = document.getElementById('cuentas-group-toggle');
  if (groupToggleWrap) {
    groupToggleWrap.innerHTML = egresosList.length > 0 ? `
      <div class="cuentas-section-title" style="color:#4a5d48;">EN QUÉ SE VA EL DINERO · TOCA PARA VER</div>
      <div style="background:#eff4ed; border-radius:16px; padding:4px; display:grid; grid-template-columns:1fr 1fr; gap:4px; margin-bottom:14px;">
        <button type="button" data-gmode="categoria" style="height:38px; border-radius:12px; border:none; background:${activeGroupMode === 'categoria' ? '#2d3e2c' : 'transparent'}; color:${activeGroupMode === 'categoria' ? '#ffffff' : '#1e2a1e'}; font-size:13.5px; font-weight:700; cursor:pointer; font-family:inherit; transition:all 0.16s ease;">
          Por categoría
        </button>
        <button type="button" data-gmode="lote" style="height:38px; border-radius:12px; border:none; background:${activeGroupMode === 'lote' ? '#2d3e2c' : 'transparent'}; color:${activeGroupMode === 'lote' ? '#ffffff' : '#1e2a1e'}; font-size:13.5px; font-weight:700; cursor:pointer; font-family:inherit; transition:all 0.16s ease;">
          Por lote
        </button>
      </div>
    ` : '';
    groupToggleWrap.querySelectorAll('button[data-gmode]').forEach(btn => {
      btn.addEventListener('click', () => {
        activeGroupMode = btn.dataset.gmode;
        renderCuentasUI();
      });
    });
  }

  // 4. Agrupar Egresos (Por categoría o Por lote)
  let egrEntries = [];
  if (activeGroupMode === 'lote') {
    const loteGroupMap = new Map();
    egresosList.forEach(g => {
      const lid = String(g.lote_id || '').trim();
      const meta = lid ? _refs.lotesMeta?.get(lid) : null;
      const key = meta ? `lote:${meta.nombre.toLowerCase()}` : 'sin_lote';
      if (!loteGroupMap.has(key)) {
        loteGroupMap.set(key, {
          name: meta ? meta.nombre : 'Finca general',
          total: 0,
          items: [],
          subCats: new Set(),
          dotColor: meta ? (meta.color || '#2d3e2c') : '#8f9890',
          numPlantas: meta ? (Number(meta.num_plantas) || 0) : 0,
          isGeneral: !meta
        });
      }
      const bucket = loteGroupMap.get(key);
      bucket.total += (Number(g.monto) || 0);
      bucket.items.push(g);
    });
    egrEntries = Array.from(loteGroupMap.values()).sort((a, b) => {
      if (a.isGeneral !== b.isGeneral) return a.isGeneral ? 1 : -1;
      return b.total - a.total;
    });
  } else {
    const egrMap = new Map();
    egresosList.forEach(g => {
      const grpName = getDisplayGroupName(g.categoria);
      if (!egrMap.has(grpName)) {
        egrMap.set(grpName, { name: grpName, total: 0, items: [], subCats: new Set() });
      }
      const bucket = egrMap.get(grpName);
      bucket.total += (Number(g.monto) || 0);
      bucket.items.push(g);
      const rawCat = String(g.categoria || '').trim();
      if (rawCat && rawCat.toLowerCase() !== grpName.toLowerCase()) {
        bucket.subCats.add(rawCat);
      }
    });
    egrEntries = Array.from(egrMap.values()).sort((a, b) => b.total - a.total);
  }
  const maxEgr = egrEntries.length ? Math.max(...egrEntries.map(x => x.total), 1) : 1;

  // 5. Agrupar Ingresos
  const ingMap = new Map();
  ingresosList.forEach(g => {
    const catName = String(g.categoria || 'Otros').replace(/^Ingreso · /i, '').trim() || 'Otros';
    if (!ingMap.has(catName)) {
      ingMap.set(catName, { name: catName, total: 0, items: [], subCats: new Set() });
    }
    const bucket = ingMap.get(catName);
    bucket.total += (Number(g.monto) || 0);
    bucket.items.push(g);
  });
  const ingEntries = Array.from(ingMap.values()).sort((a, b) => b.total - a.total);
  const maxIng = ingEntries.length ? Math.max(...ingEntries.map(x => x.total), 1) : 1;

  const renderSection = (title, entries, sectionTotal, maxVal, isIngreso) => {
    if (!entries.length) return '';
    const prefix = isIngreso ? 'ing' : 'egr';
    const accentColor = isIngreso ? '#1b6e1b' : '#b34200';
    const barColor = isIngreso ? '#1b6e1b' : '#c84b11';
    const trackColor = isIngreso ? '#e5eee4' : '#e6ece4';

    const cardsHtml = entries.map(cat => {
      const catKey = `${prefix}:${cat.name}`;
      const isOpen = expandedCats.has(catKey);
      const isShowAll = showAllCats.has(catKey);
      const pctOfTotal = sectionTotal > 0 ? Math.round((cat.total / sectionTotal) * 100) : 0;
      const barPct = Math.max(5, Math.round((cat.total / maxVal) * 100));

      let subtitleText = '';
      if (!isIngreso && activeGroupMode === 'lote') {
        if (cat.isGeneral) {
          subtitleText = `Sin lote · ${pctOfTotal}%`;
        } else {
          const perPlant = cat.numPlantas > 0 ? ` · L ${(cat.total / cat.numPlantas).toFixed(2)} por planta` : '';
          subtitleText = `${pctOfTotal}%${perPlant}`;
        }
      } else {
        let subtitlePrefix = `${cat.items.length} ${cat.items.length === 1 ? 'movimiento' : 'movimientos'}`;
        if (!isIngreso && cat.name === 'Cafetal' && cat.subCats.size > 0) {
          const subArr = Array.from(cat.subCats).slice(0, 2);
          const formattedSubs = subArr.map((s, i) => i === 0 ? s : s.toLowerCase()).join(', ');
          subtitlePrefix = `${formattedSubs}${cat.subCats.size > 2 ? '...' : ''}`;
        }
        subtitleText = `${subtitlePrefix} · ${pctOfTotal}%`;
      }

      const visibleItems = isShowAll ? cat.items : cat.items.slice(0, 3);
      const remaining = cat.items.length - visibleItems.length;

      const itemsHtml = visibleItems.map((g, idx) => {
        const disp = formatMovDisplay(g, _refs);
        const sign = isIngreso ? '+' : '–';
        return `
          <div class="cuentas-mov-swipe-wrap" data-mov-id="${escapeHtml(g.id)}" style="${idx < visibleItems.length - 1 ? 'border-bottom:1px solid #f0f4ef;' : ''}">
            <div class="cuentas-swipe-bg">
              <div class="cuentas-swipe-del-bg">
                <span class="material-symbols-outlined" style="font-size:18px;">delete</span>
                <span>Eliminar</span>
              </div>
              <div class="cuentas-swipe-edit-bg">
                <span>Editar</span>
                <span class="material-symbols-outlined" style="font-size:18px;">edit</span>
              </div>
            </div>
            <div class="cuentas-mov-row" data-mov-id="${escapeHtml(g.id)}">
              <div class="cuentas-mov-info">
                <div class="cuentas-mov-title">
                  ${escapeHtml(disp.title)}
                  ${disp.isPorAprobar ? `<span class="cuentas-aprobar-pill">Por Aprobar</span>` : ''}
                </div>
                ${disp.subtitle ? `<div class="cuentas-mov-sub">${escapeHtml(disp.subtitle)}</div>` : ''}
                ${disp.extraLine ? `<div style="font-size:12px; font-weight:700; color:#2d3e2c; margin-top:2px;">${escapeHtml(disp.extraLine)}</div>` : ''}
                ${disp.isPorAprobar ? `
                  <button type="button" class="cuentas-aprobar-btn" onclick="event.stopPropagation(); window.aprobarGastoPersonal('${escapeHtml(g.id)}')">
                    <span class="material-symbols-outlined" style="font-size:14px;">check_circle</span> Aprobar
                  </button>
                ` : ''}
              </div>
              <div class="cuentas-mov-amt" style="color:${accentColor};">${sign} ${formatShortL(g.monto)}</div>
            </div>
          </div>
        `;
      }).join('');

      const toggleMoreHtml = cat.items.length > 3 ? `
        <button type="button" class="cuentas-ver-mas-btn" data-show-all-key="${escapeHtml(catKey)}">
          ${isShowAll ? 'Mostrar menos ‹' : `Ver los ${cat.items.length} movimientos ›`}
        </button>
      ` : '';

      return `
        <div class="cuentas-cat-card ${isOpen ? 'is-open' : ''}" data-cat-key="${escapeHtml(catKey)}">
          <div class="cuentas-cat-header">
            <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
              ${cat.dotColor ? `<span style="width:12px; height:12px; border-radius:50%; background:${escapeHtml(cat.dotColor)}; flex-shrink:0;"></span>` : ''}
              <div style="min-width:0; flex:1;">
                <div class="cuentas-cat-name">${escapeHtml(cat.name)}</div>
                <div class="cuentas-cat-sub">${escapeHtml(subtitleText)}</div>
              </div>
            </div>
            <div style="display:flex; align-items:center; gap:6px; flex-shrink:0;">
              <span class="cuentas-cat-amt" style="color:${accentColor};">${formatShortL(cat.total)}</span>
              <span class="material-symbols-outlined cuentas-cat-chev" style="transform:${isOpen ? 'rotate(180deg)' : 'rotate(0deg)'};">keyboard_arrow_down</span>
            </div>
          </div>
          <div class="cuentas-bar-track" style="background:${trackColor};">
            <div class="cuentas-bar-fill" style="width:${barPct}%; background:${barColor};"></div>
          </div>
          <div class="cuentas-cat-body" style="display:${isOpen ? 'block' : 'none'};">
            ${itemsHtml}
            ${toggleMoreHtml}
          </div>
        </div>
      `;
    }).join('');

    return `
      <div class="cuentas-section">
        ${title ? `<div class="cuentas-section-title" style="color:${isIngreso ? '#1b6e1b' : '#4a5d48'};">${title}</div>` : ''}
        ${cardsHtml}
      </div>
    `;
  };

  if (filtered.length === 0) {
    sectionsWrap.innerHTML = `
      <div class="cuentas-empty">
        <span class="material-symbols-outlined" style="font-size:40px; color:#7e9384;">account_balance_wallet</span>
        <div style="font-size:15px; font-weight:700; color:#1e3e2b; margin-top:8px;">Sin movimientos</div>
        <div style="font-size:12.5px; color:#5a6b58; margin-top:4px;">
          ${currentGastosSearchQuery
            ? 'No hay resultados para tu búsqueda.'
            : 'No hay registros en este período o lote. Usa "+ Movimiento" para agregar uno.'}
        </div>
      </div>
    `;
  } else {
    sectionsWrap.innerHTML =
      renderSection('', egrEntries, totalEgresos, maxEgr, false) +
      renderSection('DE DÓNDE VIENE EL DINERO · TOCA PARA VER', ingEntries, totalIngresos, maxIng, true);
  }

  // Wire accordion headers
  sectionsWrap.querySelectorAll('.cuentas-cat-card').forEach(card => {
    const header = card.querySelector('.cuentas-cat-header');
    const bar = card.querySelector('.cuentas-bar-track');
    const catKey = card.dataset.catKey;
    const toggle = () => {
      if (expandedCats.has(catKey)) expandedCats.delete(catKey);
      else expandedCats.add(catKey);
      renderCuentasUI();
    };
    if (header) header.addEventListener('click', toggle);
    if (bar) bar.addEventListener('click', toggle);
  });

  // Wire "Ver los N movimientos"
  sectionsWrap.querySelectorAll('.cuentas-ver-mas-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const k = btn.dataset.showAllKey;
      if (showAllCats.has(k)) showAllCats.delete(k);
      else showAllCats.add(k);
      renderCuentasUI();
    });
  });

  // Wire tap & swipe on movement rows
  const movById = new Map(_allGastos.map(m => [String(m.id), m]));
  sectionsWrap.querySelectorAll('.cuentas-mov-swipe-wrap').forEach(wrap => {
    const row = wrap.querySelector('.cuentas-mov-row');
    const swipeBg = wrap.querySelector('.cuentas-swipe-bg');
    const delBg = wrap.querySelector('.cuentas-swipe-del-bg');
    const editBg = wrap.querySelector('.cuentas-swipe-edit-bg');
    const movObj = movById.get(String(wrap.dataset.movId || ''));
    if (!row || !movObj) return;

    let startX = 0, startY = 0, dx = 0, dragging = false, lockedAxis = null, didSwipe = false;

    const onStart = (x, y) => {
      startX = x; startY = y; dx = 0; dragging = true; lockedAxis = null; didSwipe = false;
      row.style.transition = 'none';
    };
    const onMove = (x, y, ev) => {
      if (!dragging) return;
      const diffX = x - startX;
      const diffY = y - startY;
      if (!lockedAxis && (Math.abs(diffX) > 8 || Math.abs(diffY) > 8)) {
        lockedAxis = Math.abs(diffX) > Math.abs(diffY) ? 'x' : 'y';
      }
      if (lockedAxis !== 'x') return;
      if (ev && ev.cancelable) ev.preventDefault();
      didSwipe = true;
      dx = Math.max(-120, Math.min(120, diffX));
      row.style.transform = `translateX(${dx}px)`;
      if (dx > 6) {
        swipeBg.style.background = '#c62828';
        delBg.style.opacity = String(Math.min(1, dx / 60));
        editBg.style.opacity = '0';
      } else if (dx < -6) {
        swipeBg.style.background = '#2d3e2c';
        editBg.style.opacity = String(Math.min(1, Math.abs(dx) / 60));
        delBg.style.opacity = '0';
      }
    };
    const onEnd = () => {
      if (!dragging) return;
      dragging = false;
      row.style.transition = 'transform .2s ease';
      row.style.transform = 'translateX(0)';
      setTimeout(() => {
        swipeBg.style.background = 'transparent';
        delBg.style.opacity = '0';
        editBg.style.opacity = '0';
      }, 180);

      if (dx > 70) {
        window.confirmDeleteGasto(movObj.id, String(movObj.descripcion || '').substring(0, 30));
      } else if (dx < -70) {
        openMovimientoModal(movObj);
      }
    };

    row.addEventListener('touchstart', (e) => {
      if (e.target.closest('button')) return;
      onStart(e.touches[0].clientX, e.touches[0].clientY);
    }, { passive: true });
    row.addEventListener('touchmove', (e) => {
      onMove(e.touches[0].clientX, e.touches[0].clientY, e);
    }, { passive: false });
    row.addEventListener('touchend', onEnd);
    row.addEventListener('touchcancel', onEnd);

    row.addEventListener('click', (e) => {
      if (e.target.closest('button') || didSwipe) return;
      openMovimientoModal(movObj);
    });
  });
}

// ─── Modal Detalle/Edición de Cosecha desde Cuentas ──────────────────────────
const DAYS_SHORT_COS = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const MONTHS_FULL_COS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function formatLatasCosecha(val, dashIfZero = false) {
  const num = Math.round((Number(val) || 0) * 4) / 4;
  if (num <= 0) return dashIfZero ? '–' : '0';
  const whole = Math.floor(num);
  const rem = Math.round((num - whole) * 4);
  const fracMap = { 1: '¼', 2: '½', 3: '¾' };
  const fracStr = fracMap[rem] || '';
  if (whole === 0) return fracStr;
  return fracStr ? `${whole} ${fracStr}` : String(whole);
}

function getInitialsCos(name) {
  const parts = String(name || '?').trim().split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0] || '?').slice(0, 2).toUpperCase();
}

function createCosechaInlineController(editMov, refMatch, containerId, onTotalChange) {
  const loteId = refMatch[1];
  const workerKey = refMatch[2];
  const wsIso = refMatch[3];
  const refTag = refMatch[0];

  const disp = formatMovDisplay(editMov, _refs);
  const workerName = _refs.personal.get(String(workerKey)) || disp.title || 'Recolector';
  const loteName = _refs.lotes.get(String(loteId)) || 'Lote';
  const empId = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || editMov.empresa_id || '';

  const [wy, wm, wd] = wsIso.split('-').map(Number);
  const weekDays = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(wy, (wm || 1) - 1, (wd || 1) + i);
    const iso = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
    weekDays.push({
      iso,
      dayLabel: `${DAYS_SHORT_COS[dt.getDay()]} ${dt.getDate()}`,
      dt
    });
  }
  const weIso = weekDays[6].iso;
  const sDt = weekDays[0].dt;
  const eDt = weekDays[6].dt;
  const weekRangeLabel = sDt.getMonth() === eDt.getMonth()
    ? `${sDt.getDate()} – ${eDt.getDate()} ${SHORT_MONTHS[sDt.getMonth()]} ${sDt.getFullYear()}`
    : `${sDt.getDate()} ${SHORT_MONTHS[sDt.getMonth()]} – ${eDt.getDate()} ${SHORT_MONTHS[eDt.getMonth()]} ${eDt.getFullYear()}`;
  const weekTitleFull = sDt.getMonth() === eDt.getMonth()
    ? `Semana ${sDt.getDate()} - ${eDt.getDate()} ${MONTHS_FULL_COS[sDt.getMonth()]} ${sDt.getFullYear()}`
    : `Semana ${sDt.getDate()} ${MONTHS_FULL_COS[sDt.getMonth()]} - ${eDt.getDate()} ${MONTHS_FULL_COS[eDt.getMonth()]} ${eDt.getFullYear()}`;

  const dayRowsMap = new Map();
  const workerDayLatas = new Map();
  let precioLata = Number(localStorage.getItem(`cosecha_precio_lata_${loteId}`)) || 40;
  let editingDayIso = null;
  let loaded = false;

  const renderInline = () => {
    const box = document.getElementById(containerId);
    if (!box) return;
    const totalLatas = Array.from(workerDayLatas.values()).reduce((s, v) => s + (Number(v) || 0), 0);
    const totalPay = Math.round(totalLatas * precioLata);
    const maxDay = Math.max(...Array.from(workerDayLatas.values()), 1);

    box.innerHTML = `
      <div style="border:1.5px solid #d5e2d2; border-radius:18px; padding:12px 14px; background:#fafcf9;">
        <!-- Encabezado operario + semana -->
        <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:10px; min-width:0;">
            <div style="width:36px; height:36px; border-radius:50%; background:#435340; color:#ffffff; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:800; flex-shrink:0;">
              ${escapeHtml(getInitialsCos(workerName))}
            </div>
            <div style="min-width:0;">
              <div style="font-size:14px; font-weight:800; color:#111827; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(workerName)}</div>
              <div style="font-size:11.5px; color:#5a6b58; margin-top:2px;">${escapeHtml(weekRangeLabel)} · ${escapeHtml(loteName)}</div>
            </div>
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div style="font-size:13.5px; font-weight:800; color:#1e3e2b;">${formatLatasCosecha(totalLatas)} ${totalLatas === 1 ? 'lata' : 'latas'}</div>
            <div style="font-size:11px; color:#5a6b58;">L${precioLata}/lata</div>
          </div>
        </div>

        <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#5a6b58; margin-bottom:4px;">
          Toca un día para editar las latas
        </div>

        <!-- 7 días -->
        <div style="display:flex; flex-direction:column;">
          ${weekDays.map((d, idx) => {
            const val = workerDayLatas.get(d.iso) || 0;
            const pct = val > 0 ? Math.max(8, Math.round((val / maxDay) * 100)) : 0;
            const isEditing = editingDayIso === d.iso;
            const whole = Math.floor(val);
            const frac = Math.round((val - whole) * 4) / 4;
            return `
              <div style="${idx < 6 ? 'border-bottom:1px solid #e9efe7;' : ''} padding:8px 0;">
                <div class="cos-inline-day-row" data-iso="${d.iso}" style="display:flex; align-items:center; gap:10px; cursor:pointer; user-select:none;">
                  <div style="width:50px; font-size:11.5px; font-weight:700; color:#4a5d48; flex-shrink:0;">${d.dayLabel}</div>
                  <div style="flex:1; height:6px; border-radius:999px; background:#e3e9e1; overflow:hidden;">
                    ${pct > 0 ? `<div style="width:${pct}%; height:100%; border-radius:999px; background:#2e7d1e;"></div>` : ''}
                  </div>
                  <div style="min-width:58px; text-align:right; font-size:12.5px; font-weight:800; color:${val > 0 ? '#111827' : '#8a9988'};">
                    ${val > 0 ? `${formatLatasCosecha(val)} ${val === 1 ? 'lata' : 'latas'}` : '–'}
                  </div>
                </div>
                ${isEditing ? `
                  <div style="margin-top:8px; background:#ffffff; border:1px solid #d5e2d2; border-radius:12px; padding:10px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                      <span style="font-size:11.5px; font-weight:700; color:#4a5d48;">Latas completas</span>
                      <div style="display:flex; align-items:center; gap:12px;">
                        <button type="button" class="cos-inl-dec" data-iso="${d.iso}" style="width:32px; height:32px; border-radius:50%; border:1.5px solid #b5c7b2; background:#ffffff; color:#2d3e2c; font-size:18px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center;">−</button>
                        <span style="font-size:18px; font-weight:800; color:#111827; min-width:24px; text-align:center;">${whole}</span>
                        <button type="button" class="cos-inl-inc" data-iso="${d.iso}" style="width:32px; height:32px; border-radius:50%; border:none; background:#2d3e2c; color:#ffffff; font-size:18px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center;">+</button>
                      </div>
                    </div>
                    <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px;">
                      ${[{ v: 0, l: '0' }, { v: 0.25, l: '¼' }, { v: 0.5, l: '½' }, { v: 0.75, l: '¾' }].map(f => {
                        const act = Math.abs(frac - f.v) < 0.01;
                        return `<button type="button" class="cos-inl-frac" data-iso="${d.iso}" data-frac="${f.v}" style="height:30px; border-radius:999px; border:1px solid ${act ? '#2d3e2c' : '#d5e2d2'}; background:${act ? '#2d3e2c' : '#ffffff'}; color:${act ? '#ffffff' : '#111827'}; font-size:12.5px; font-weight:700; cursor:pointer;">${f.l}</button>`;
                      }).join('')}
                    </div>
                  </div>
                ` : ''}
              </div>
            `;
          }).join('')}
        </div>
      </div>
    `;

    const notifyChange = () => {
      const tLatas = Array.from(workerDayLatas.values()).reduce((s, v) => s + (Number(v) || 0), 0);
      const tPay = Math.round(tLatas * precioLata);
      if (typeof onTotalChange === 'function') onTotalChange(tPay, tLatas);
    };

    box.querySelectorAll('.cos-inline-day-row').forEach(row => {
      row.addEventListener('click', () => {
        const iso = row.dataset.iso;
        editingDayIso = editingDayIso === iso ? null : iso;
        renderInline();
      });
    });
    box.querySelectorAll('.cos-inl-dec').forEach(btn => {
      btn.addEventListener('click', () => {
        const iso = btn.dataset.iso;
        const cur = workerDayLatas.get(iso) || 0;
        const whole = Math.floor(cur);
        workerDayLatas.set(iso, Math.max(0, whole - 1) + (cur - whole));
        notifyChange();
        renderInline();
      });
    });
    box.querySelectorAll('.cos-inl-inc').forEach(btn => {
      btn.addEventListener('click', () => {
        const iso = btn.dataset.iso;
        const cur = workerDayLatas.get(iso) || 0;
        const whole = Math.floor(cur);
        workerDayLatas.set(iso, (whole + 1) + (cur - whole));
        notifyChange();
        renderInline();
      });
    });
    box.querySelectorAll('.cos-inl-frac').forEach(btn => {
      btn.addEventListener('click', () => {
        const iso = btn.dataset.iso;
        const f = parseFloat(btn.dataset.frac || '0') || 0;
        const cur = workerDayLatas.get(iso) || 0;
        workerDayLatas.set(iso, Math.floor(cur) + f);
        notifyChange();
        renderInline();
      });
    });
  };

  const load = async () => {
    try {
      const { data: allRows } = await supabase.from('lote_aplicaciones').select('*').eq('lote_id', loteId);
      const rows = (Array.isArray(allRows) ? allRows : []).filter(r => {
        const f = String(r.fecha || '').slice(0, 10);
        return f && f >= wsIso && f <= weIso;
      });
      rows.forEach(r => {
        const obs = String(r.observaciones || '');
        if (!obs.startsWith('[COSECHA_JSON]')) return;
        try {
          const parsed = JSON.parse(obs.slice('[COSECHA_JSON]'.length));
          const iso = String(r.fecha || '').slice(0, 10);
          if (parsed.precio_lata) precioLata = Number(parsed.precio_lata) || precioLata;
          dayRowsMap.set(iso, {
            rowId: r.id,
            precio_lata: Number(parsed.precio_lata) || precioLata,
            registros: Array.isArray(parsed.registros) ? parsed.registros : []
          });
        } catch {}
      });
    } catch (err) {
      console.error('Error cargando cosecha inline:', err);
    }
    weekDays.forEach(d => {
      const rec = dayRowsMap.get(d.iso);
      const found = (rec?.registros || []).find(r =>
        String(r.personal_id || '') === String(workerKey) ||
        String(r.nombre || '').trim().toLowerCase() === String(workerName).trim().toLowerCase()
      );
      workerDayLatas.set(d.iso, Number(found?.latas) || 0);
    });
    loaded = true;
    renderInline();
  };

  const saveDaysAndBuildDesc = async () => {
    if (!loaded) return null;
    for (const d of weekDays) {
      const newVal = workerDayLatas.get(d.iso) || 0;
      const existing = dayRowsMap.get(d.iso);
      const prevRegs = existing?.registros ? [...existing.registros] : [];
      const idx = prevRegs.findIndex(r =>
        String(r.personal_id || '') === String(workerKey) ||
        String(r.nombre || '').trim().toLowerCase() === String(workerName).trim().toLowerCase()
      );
      const prevVal = idx !== -1 ? (Number(prevRegs[idx].latas) || 0) : 0;
      if (Math.abs(newVal - prevVal) < 0.001) continue;

      if (newVal > 0) {
        const entry = { personal_id: workerKey, nombre: workerName, latas: newVal };
        if (idx !== -1) prevRegs[idx] = { ...prevRegs[idx], ...entry };
        else prevRegs.push(entry);
      } else if (idx !== -1) {
        prevRegs.splice(idx, 1);
      }

      const dayTotal = prevRegs.reduce((s, r) => s + (Number(r.latas) || 0), 0);
      const dayPrice = existing?.precio_lata || precioLata;
      const aplPayload = {
        empresa_id: empId,
        lote_id: loteId,
        fecha: d.iso,
        tipo: 'Cosecha',
        metodo: 'Corte manual',
        producto: 'Corte de café',
        dosis: `${formatLatasCosecha(dayTotal)} latas`,
        operador: prevRegs.map(r => r.nombre).join(', '),
        personal_ids: prevRegs.map(r => r.personal_id).filter(id => id && !String(id).startsWith('extra_')),
        estado: 'Aplicada',
        observaciones: '[COSECHA_JSON]' + JSON.stringify({ precio_lata: dayPrice, registros: prevRegs })
      };
      if (existing?.rowId) {
        const { error: uErr } = await supabase.from('lote_aplicaciones').update(aplPayload).eq('id', existing.rowId);
        if (uErr) throw uErr;
      } else if (prevRegs.length > 0) {
        const { error: iErr } = await supabase.from('lote_aplicaciones').insert([aplPayload]);
        if (iErr) throw iErr;
      }
    }
    const newTotalLatas = Array.from(workerDayLatas.values()).reduce((s, v) => s + (Number(v) || 0), 0);
    return `Cosecha ${weekTitleFull} · ${workerName} (${formatLatasCosecha(newTotalLatas)} ${newTotalLatas === 1 ? 'lata' : 'latas'}) ${refTag}`;
  };

  return { load, saveDaysAndBuildDesc };
}

// ─── Modal Material 3: Nuevo / Editar Movimiento ──────────────────────────────
function openMovimientoModal(editMov = null) {
  const isEdit = Boolean(editMov && editMov.id);
  const cosechaRef = isEdit
    ? String(editMov.descripcion || '').match(/\[ref:cosecha_([^_]+)_(.+)_(\d{4}-\d{2}-\d{2})\]/)
    : null;
  const todayStr = getTodayLocalStr();
  const initialFecha = (editMov?.fecha && /^\d{4}-\d{2}-\d{2}/.test(String(editMov.fecha)))
    ? String(editMov.fecha).slice(0, 10)
    : todayStr;

  const egresoCats = [
    'Chapias', 'Abonadas', 'Foliares', 'Insumos', 'Cosecha',
    'Personal', 'Veterinaria', 'Maquinaria', 'Terreno y plantado', 'Vivero', 'Otros'
  ];
  const ingresoCats = [
    'Ingreso · Café', 'Ingreso · Plátano', 'Ingreso · Ganado',
    'Ingreso · Otro cultivo', 'Ingreso · Subsidio', 'Ingreso · Otros'
  ];

  const editIsIngreso = isEdit && isIngresoMov(editMov);
  let movTipo = editIsIngreso ? 'ingreso' : 'egreso';
  let selectedCat = isEdit && editMov?.categoria
    ? (editIsIngreso && !String(editMov.categoria).startsWith('Ingreso · ') ? `Ingreso · ${editMov.categoria}` : editMov.categoria)
    : egresoCats[0];

  const initialLoteId = isEdit
    ? (editMov.lote_id || '')
    : (activeLoteId !== 'all' ? activeLoteId : '');

  const rawEditDesc = isEdit ? String(editMov.descripcion || '') : '';
  const preservedTags = (rawEditDesc.match(/\[(?:ref:[^\]]+|Por Aprobar)\]/g) || []).join(' ');
  const visibleEditDesc = rawEditDesc
    .replace(/\[ref:[^\]]+\]/g, '')
    .replace(/\[Por Aprobar\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const lotesOptions = Array.from(_refs.lotes.entries())
    .map(([id, nombre]) => `<option value="${escapeHtml(id)}" ${String(initialLoteId) === String(id) ? 'selected' : ''}>${escapeHtml(nombre)}</option>`)
    .join('');

  showModal(isEdit ? 'Editar movimiento' : 'Nuevo movimiento', `
    <form id="form-cuentas-mov" novalidate style="display:flex; flex-direction:column; gap:14px; padding-bottom:24px;">
      <!-- Toggle Egreso / Ingreso -->
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px;">
        <button type="button" id="cm-btn-egreso" style="height:40px; border-radius:12px; border:1px solid #b34200; background:#b34200; color:#ffffff; font-size:13px; font-weight:700; cursor:pointer; transition:all .15s;">Egreso</button>
        <button type="button" id="cm-btn-ingreso" style="height:40px; border-radius:12px; border:1px solid #d5e2d2; background:#ffffff; color:#1f2937; font-size:13px; font-weight:700; cursor:pointer; transition:all .15s;">Ingreso</button>
      </div>

      <!-- Monto -->
      <div style="padding:2px 2px 4px;">
        <div style="font-size:12px; font-weight:600; color:#5a6b58; margin-bottom:2px;">Monto</div>
        <div style="display:flex; align-items:baseline; gap:6px; border-bottom:1.5px solid #e5ece4; padding-bottom:6px;">
          <span id="cm-monto-prefix" style="font-size:28px; font-weight:800; color:#b34200; line-height:1;">L</span>
          <input type="number" id="cm-monto-input" name="monto" step="0.01" min="0.01" inputmode="decimal" placeholder="0" value="${isEdit ? escapeHtml(String(editMov.monto || '')) : ''}" style="border:none; outline:none; background:transparent; font-size:30px; font-weight:800; color:#b34200; width:100%; line-height:1.1; padding:0;">
        </div>
        <div id="cm-monto-err" style="display:none; font-size:11.5px; font-weight:600; color:#ba1a1a; margin-top:4px;"></div>
      </div>

      <!-- Nombre del movimiento (o desglose semanal editable si es Cosecha) -->
      ${cosechaRef ? `
        <div>
          <div style="font-size:12px; font-weight:600; color:#5a6b58; margin-bottom:6px;">Detalle de cosecha (semana del operario)</div>
          <div id="cm-cosecha-inline-box">
            <div style="padding:16px; text-align:center; border:1.5px solid #d5e2d2; border-radius:18px; color:#5a6b58; font-size:13px; font-weight:600; background:#fafcf9;">
              Cargando semana de cosecha...
            </div>
          </div>
          <input type="hidden" id="cm-nombre-input" name="descripcion" value="${escapeHtml(visibleEditDesc)}">
          <div id="cm-nombre-err" style="display:none;"></div>
        </div>
      ` : `
        <div>
          <div class="m3-field" style="margin-bottom:0;">
            <input type="text" id="cm-nombre-input" name="descripcion" placeholder=" " value="${isEdit ? escapeHtml(visibleEditDesc) : ''}" style="font-size:14px; font-weight:600; background:#ffffff;">
            <label for="cm-nombre-input" style="background:#ffffff;">Nombre del movimiento</label>
          </div>
          <div id="cm-nombre-err" style="display:none; font-size:11.5px; font-weight:600; color:#ba1a1a; margin-top:4px; padding-left:14px;"></div>
        </div>
      `}

      <!-- Categoría -->
      <div>
        <div id="cm-cat-label" style="font-size:12px; font-weight:600; color:#5a6b58; margin-bottom:8px;">Categoría</div>
        <div id="cm-cat-pills" style="display:flex; gap:8px; overflow-x:auto; padding-bottom:6px; scrollbar-width:thin;"></div>
      </div>

      <!-- Lote (opcional) — Material 3 Expressive Dropdown -->
      <div style="position:relative;">
        <div id="cm-lote-trigger" tabindex="0" role="button" aria-expanded="false" style="position:relative; height:54px; border-radius:14px; border:1.5px solid #8a9b88; background:#ffffff; padding:0 14px; display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer; user-select:none; box-sizing:border-box;">
          <span style="position:absolute; top:-9px; left:12px; background:#ffffff; padding:0 6px; font-size:11px; font-weight:700; color:#3d4f3b; letter-spacing:0.5px; text-transform:uppercase;">Lote (opcional)</span>
          <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
            <span class="material-symbols-outlined" style="font-size:20px; color:#2e7d32; flex-shrink:0;">eco</span>
            <span id="cm-lote-display" style="font-size:14.5px; font-weight:700; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${escapeHtml(initialLoteId ? (_refs.lotes.get(String(initialLoteId)) || 'Sin lote') : 'Sin lote')}
            </span>
          </div>
          <span id="cm-lote-caret" class="material-symbols-outlined" style="font-size:20px; color:#2d3e2c; transition:transform 0.2s;">arrow_drop_down</span>
        </div>
        <input type="hidden" id="cm-lote-select" name="lote_id" value="${escapeHtml(String(initialLoteId || ''))}">
        <div id="cm-lote-menu" style="display:none; margin-top:6px; background:#f6faf4; border:1px solid #d5e2d2; border-radius:18px; overflow:hidden; box-shadow:0 8px 24px rgba(24,40,22,0.10); max-height:240px; overflow-y:auto;"></div>
      </div>

      <!-- Fecha — Material 3 Docked Date Picker global -->
      <div class="m3-field" style="margin-bottom:0;">
        <input type="date" id="cm-fecha-input" name="fecha" value="${initialFecha}">
        <label for="cm-fecha-input" style="background:#ffffff;">Fecha</label>
      </div>

    </form>
  `);

  const modalBodyEl = document.getElementById('modal-body');
  if (modalBodyEl) {
    const footerDiv = document.createElement('div');
    footerDiv.style.cssText = 'flex-shrink:0; background:#ffffff; padding:12px 0 4px; border-top:1px solid #eef2ee; display:grid; grid-template-columns:1fr 1.6fr; gap:10px;';
    footerDiv.innerHTML = `
      <button type="button" id="cm-cancel-btn" style="height:44px; border-radius:999px; border:1px solid #d5e2d2; background:#ffffff; color:#2d3e2c; font-size:14px; font-weight:700; cursor:pointer;">
        Cancelar
      </button>
      <button type="button" id="cm-submit-btn" style="height:44px; border-radius:999px; border:none; background:#2d3e2c; color:#ffffff; font-size:14px; font-weight:700; cursor:pointer;">
        ${isEdit ? 'Guardar cambios' : 'Guardar movimiento'}
      </button>
    `;
    modalBodyEl.appendChild(footerDiv);
  }
  document.getElementById('modal-container')?.classList.add('modal-sheet-expanded');

  const renderCatPills = () => {
    const wrap = document.getElementById('cm-cat-pills');
    const lbl = document.getElementById('cm-cat-label');
    if (!wrap) return;
    const accent = movTipo === 'ingreso' ? '#1b6e1b' : '#b34200';
    if (lbl) lbl.textContent = movTipo === 'ingreso' ? '¿De qué producto viene?' : 'Categoría';
    const baseList = movTipo === 'egreso' ? egresoCats : ingresoCats;
    const list = mergeCategories(baseList, movTipo);
    if (!list.includes(selectedCat)) selectedCat = list[0];
    const prevCatScroll = wrap.scrollLeft;
    wrap.innerHTML = list.map(cat => {
      const active = cat === selectedCat;
      const displayLabel = cat.replace(/^Ingreso · /i, '');
      return `<button type="button" data-cat="${escapeHtml(cat)}" class="${active ? 'is-active-cat' : ''}" style="flex:0 0 auto; height:34px; padding:0 14px; border-radius:999px; border:1px solid ${active ? accent : '#d5e2d2'}; background:${active ? accent : '#ffffff'}; color:${active ? '#ffffff' : '#1f2937'}; font-size:12.5px; font-weight:${active ? '700' : '600'}; cursor:pointer; white-space:nowrap;">${escapeHtml(displayLabel)}</button>`;
    }).join('');
    wrap.scrollLeft = prevCatScroll;
    wrap.querySelectorAll('button[data-cat]').forEach(btn => {
      btn.addEventListener('click', () => {
        const clicked = btn.dataset.cat;
        const isOtros = clicked === 'Otros' || clicked === 'Ingreso · Otros';
        if (isOtros) {
          openNewCategoryBottomSheet({
            tipo: movTipo,
            onCreated: (newCat) => {
              selectedCat = newCat;
              renderCatPills();
              requestAnimationFrame(() => {
                document.querySelector('#cm-cat-pills button.is-active-cat')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
              });
            },
            onUseOtros: () => {
              selectedCat = clicked;
              renderCatPills();
              requestAnimationFrame(() => {
                document.querySelector('#cm-cat-pills button.is-active-cat')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
              });
            }
          });
          return;
        }
        selectedCat = clicked;
        renderCatPills();
        requestAnimationFrame(() => {
          document.querySelector('#cm-cat-pills button.is-active-cat')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
        });
      });
    });
  };

  const applyTipoUI = () => {
    const btnEgr = document.getElementById('cm-btn-egreso');
    const btnIng = document.getElementById('cm-btn-ingreso');
    const prefix = document.getElementById('cm-monto-prefix');
    const input = document.getElementById('cm-monto-input');
    const isIng = movTipo === 'ingreso';
    const accent = isIng ? '#1b6e1b' : '#b34200';
    if (btnEgr) {
      btnEgr.style.background = !isIng ? '#b34200' : '#ffffff';
      btnEgr.style.color = !isIng ? '#ffffff' : '#1f2937';
      btnEgr.style.borderColor = !isIng ? '#b34200' : '#d5e2d2';
    }
    if (btnIng) {
      btnIng.style.background = isIng ? '#1b6e1b' : '#ffffff';
      btnIng.style.color = isIng ? '#ffffff' : '#1f2937';
      btnIng.style.borderColor = isIng ? '#1b6e1b' : '#d5e2d2';
    }
    if (prefix) prefix.style.color = accent;
    if (input) input.style.color = accent;
    renderCatPills();
  };

  document.getElementById('cm-btn-egreso')?.addEventListener('click', () => { movTipo = 'egreso'; applyTipoUI(); });
  document.getElementById('cm-btn-ingreso')?.addEventListener('click', () => { movTipo = 'ingreso'; applyTipoUI(); });
  document.getElementById('cm-cancel-btn')?.addEventListener('click', closeModal);

  if (isEdit) {
    document.getElementById('cm-share-btn')?.addEventListener('click', () => {
      window.shareGastoDirect(editMov.id);
    });
    document.getElementById('cm-delete-btn')?.addEventListener('click', () => {
      closeModal();
      window.confirmDeleteGasto(editMov.id, String(editMov.descripcion || '').substring(0, 30));
    });
  }

  applyTipoUI();
  requestAnimationFrame(() => {
    document.querySelector('#cm-cat-pills button.is-active-cat')?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  });

  // Dropdown Material 3 Expressive para Lote (opcional)
  (() => {
    const trigger = document.getElementById('cm-lote-trigger');
    const menu = document.getElementById('cm-lote-menu');
    const display = document.getElementById('cm-lote-display');
    const caret = document.getElementById('cm-lote-caret');
    const hidden = document.getElementById('cm-lote-select');
    if (!trigger || !menu || !hidden) return;

    // Deduplicar lotes por nombre normalizado (manteniendo el seleccionado si coincide)
    const seenNames = new Set();
    const uniqueLotes = [];
    for (const [id, nombre] of _refs.lotes.entries()) {
      const key = String(nombre || '').trim().toLowerCase();
      if (!key) continue;
      if (String(id) === String(hidden.value) || !seenNames.has(key)) {
        seenNames.add(key);
        uniqueLotes.push([String(id), nombre]);
      }
    }

    const items = [
      { id: '', label: 'Sin lote', sub: 'Movimiento general de la finca', icon: 'public' },
      ...uniqueLotes.map(([id, nombre]) => ({ id, label: nombre, sub: 'Lote de cafetal', icon: 'eco' }))
    ];

    const renderMenu = () => {
      const curVal = String(hidden.value || '');
      menu.innerHTML = items.map((it, idx) => {
        const isSel = String(it.id) === curVal;
        return `
          <button type="button" class="cm-lote-opt" data-val="${escapeHtml(it.id)}" data-label="${escapeHtml(it.label)}" style="width:100%; text-align:left; border:none; ${idx < items.length - 1 ? 'border-bottom:1px solid #e7efe5;' : ''} background:${isSel ? '#e4efe1' : 'transparent'}; padding:12px 16px; display:flex; align-items:center; gap:12px; cursor:pointer; font-family:inherit;">
            <span class="material-symbols-outlined" style="font-size:20px; color:${isSel ? '#1b6e1b' : '#4a6b48'}; flex-shrink:0;">${it.icon}</span>
            <div style="min-width:0; flex:1;">
              <div style="font-size:14px; font-weight:700; color:#111827; line-height:1.25;">${escapeHtml(it.label)}</div>
              <div style="font-size:12px; color:#5a6b58; margin-top:2px;">${escapeHtml(it.sub)}</div>
            </div>
            ${isSel ? `<span class="material-symbols-outlined" style="font-size:19px; color:#1b6e1b;">check</span>` : ''}
          </button>
        `;
      }).join('');
      menu.querySelectorAll('.cm-lote-opt').forEach(opt => {
        opt.addEventListener('click', () => {
          hidden.value = opt.dataset.val;
          if (display) display.textContent = opt.dataset.label;
          menu.style.display = 'none';
          trigger.setAttribute('aria-expanded', 'false');
          if (caret) caret.style.transform = 'rotate(0deg)';
          renderMenu();
        });
      });
    };

    renderMenu();
    trigger.addEventListener('click', () => {
      const open = menu.style.display === 'block';
      menu.style.display = open ? 'none' : 'block';
      trigger.setAttribute('aria-expanded', open ? 'false' : 'true');
      if (caret) caret.style.transform = open ? 'rotate(0deg)' : 'rotate(180deg)';
      if (!open) {
        requestAnimationFrame(() => menu.scrollIntoView({ behavior: 'smooth', block: 'nearest' }));
      }
    });
  })();

  let cosechaInlineCtrl = null;
  if (cosechaRef) {
    cosechaInlineCtrl = createCosechaInlineController(editMov, cosechaRef, 'cm-cosecha-inline-box', (newPay) => {
      const mInp = document.getElementById('cm-monto-input');
      if (mInp) mInp.value = String(newPay);
    });
    cosechaInlineCtrl.load();
  }

  document.getElementById('cm-submit-btn')?.addEventListener('click', async () => {
    const montoInput = document.getElementById('cm-monto-input');
    const nombreInput = document.getElementById('cm-nombre-input');
    const loteSelect = document.getElementById('cm-lote-select');
    const fechaInput = document.getElementById('cm-fecha-input');
    const montoErr = document.getElementById('cm-monto-err');
    const nombreErr = document.getElementById('cm-nombre-err');

    const monto = parseFloat(montoInput?.value || '');
    const descripcion = (nombreInput?.value || '').trim();
    const fecha = (fechaInput?.value || '').trim() || todayStr;
    const loteId = (loteSelect?.value || '').trim() || null;

    if (montoErr) montoErr.style.display = 'none';
    if (nombreErr) nombreErr.style.display = 'none';

    if (isNaN(monto) || monto <= 0) {
      if (montoErr) { montoErr.textContent = 'Ingresa un monto mayor a 0'; montoErr.style.display = 'block'; }
      montoInput?.focus();
      return;
    }
    if (!descripcion) {
      if (nombreErr) { nombreErr.textContent = 'Escribe un nombre para el movimiento'; nombreErr.style.display = 'block'; }
      nombreInput?.focus();
      return;
    }

    const submitBtn = document.getElementById('cm-submit-btn');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';
    }

    try {
      let finalDescripcion = (isEdit && preservedTags)
        ? `${descripcion} ${preservedTags}`.trim()
        : descripcion;

      if (cosechaInlineCtrl) {
        const updatedCosechaDesc = await cosechaInlineCtrl.saveDaysAndBuildDesc();
        if (updatedCosechaDesc) finalDescripcion = updatedCosechaDesc;
      }

      const payload = {
        fecha,
        categoria: selectedCat,
        descripcion: finalDescripcion,
        monto,
        lote_id: loteId
      };

      if (isEdit) {
        const { error } = await supabase.from('gastos').update(payload).eq('id', editMov.id);
        if (error) throw error;
        const idx = _allGastos.findIndex(x => String(x.id) === String(editMov.id));
        if (idx !== -1) _allGastos[idx] = { ..._allGastos[idx], ...payload };
        window.Snackbar?.show('Movimiento actualizado');
      } else {
        const { data, error } = await supabase.from('gastos').insert([payload]);
        if (error) throw error;
        const created = Array.isArray(data) ? data[0] : data;
        if (created) _allGastos.unshift(created);
        else {
          const { data: fresh } = await supabase.from('gastos').select('*').order('fecha', { ascending: false });
          if (fresh) _allGastos = fresh;
        }
        window.Snackbar?.show('Movimiento guardado');
      }
      closeModal();
      window.clearScreenCache?.('gastos');
      renderCuentasUI();
    } catch (err) {
      console.error('Error guardando movimiento:', err);
      window.Snackbar?.show('Error: ' + (err.message || 'No se pudo guardar'), { type: 'error' });
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = isEdit ? 'Guardar cambios' : 'Guardar movimiento';
      }
    }
  });
}

// ─── Funciones Globales ───────────────────────────────────────────────────────
window.handleEditGasto = function(id) {
  const g = _allGastos.find(x => String(x.id) === String(id));
  if (g) openMovimientoModal(g);
  else window.navigateTo('nuevo_gasto', id);
};

window.openNuevoMovimientoCuentas = function() {
  openMovimientoModal(null);
};

window.shareGastoDirect = function(id) {
  const g = _allGastos.find(x => String(x.id) === String(id));
  if (!g) return;
  const fechaStr = g.fecha ? new Date(String(g.fecha).slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const tipoLbl = isIngresoMov(g) ? 'INGRESO' : 'EGRESO';
  const cleanConcepto = String(g.descripcion || 'Movimiento').replace(/\[ref:[^\]]+\]/g, '').replace(/\[Por Aprobar\]/g, '').replace(/\s{2,}/g, ' ').trim();
  const text = `☕ *COMPROBANTE DE ${tipoLbl} - FINCA MANAGER*\n• *Concepto:* ${cleanConcepto}\n• *Categoría:* ${g.categoria || 'General'}\n• *Monto:* L ${formatNumber(g.monto)}\n• *Fecha:* ${fechaStr}`;
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
};

window.confirmDeleteGasto = (id, desc) => {
  window.Snackbar.confirm(
    `¿Eliminar este movimiento${desc ? ` (${desc})` : ''}?`,
    async () => {
      const { error } = await supabase.from('gastos').delete().eq('id', id);
      if (error) {
        window.Snackbar.show('Error al eliminar: ' + error.message, { type: 'error' });
      } else {
        _allGastos = _allGastos.filter(x => String(x.id) !== String(id));
        window.Snackbar.show('Movimiento eliminado');
        window.clearScreenCache?.('gastos');
        renderCuentasUI();
      }
    },
    null,
    { confirmText: 'Eliminar', cancelText: 'No' }
  );
};

window.aprobarGastoPersonal = async (id) => {
  try {
    const gasto = _allGastos.find(x => String(x.id) === String(id));
    if (!gasto) return;
    const cleanDesc = (gasto.descripcion || '').replace('[Por Aprobar]', '').replace(/\s{2,}/g, ' ').trim();
    const { error } = await supabase.from('gastos').update({ descripcion: cleanDesc }).eq('id', id);
    if (error) throw error;
    gasto.descripcion = cleanDesc;
    window.Snackbar?.show('Movimiento aprobado');
    window.clearScreenCache?.('gastos');
    renderCuentasUI();
  } catch (err) {
    console.error('Error aprobando gasto:', err);
    window.Snackbar?.show('Error al aprobar: ' + (err.message || 'Error desconocido'), { type: 'error' });
  }
};

// ─── Render Principal ─────────────────────────────────────────────────────────
export async function renderGastos() {
  const empId = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
  const gastosFetcher = async () => {
    try {
      const empFilter = empId ? `empresa_id=eq.${encodeURIComponent(empId)}&` : '';
      const rows = await restFetch(`/rest/v1/gastos?${empFilter}select=*&order=fecha.desc`);
      if (Array.isArray(rows)) return { data: rows, error: null };
    } catch {}
    return supabase.from('gastos').select('*').order('fecha', { ascending: false });
  };

  const [{ data: all, error }, refs] = await Promise.all([
    gastosFetcher(),
    fetchRefs()
  ]);

  if (error) {
    console.error('Error fetching cuentas:', error);
    return `<div class="screen-cuentas" style="padding: 24px; color: #ba1a1a;"><p>Error cargando cuentas: ${escapeHtml(error.message)}</p></div>`;
  }

  _allGastos = all || [];
  _refs = refs;
  _pendingSummary = await computePendingForCuentas(_allGastos, _refs).catch(() => ({ totalAmount: 0, items: [] }));

  return `
    <style>
      .screen-cuentas {
        padding: 4px 2px 110px;
        max-width: 720px;
        margin: 0 auto;
        font-family: 'Plus Jakarta Sans', 'Work Sans', sans-serif;
      }

      .cuentas-pills-row {
        display: flex;
        align-items: center;
        gap: 8px;
        margin-bottom: 10px;
        flex-wrap: nowrap;
        overflow-x: auto;
        -webkit-overflow-scrolling: touch;
        padding-bottom: 4px;
        scrollbar-width: thin;
        scrollbar-color: #9aa898 transparent;
      }
      .cuentas-pills-row::-webkit-scrollbar {
        height: 5px;
      }
      .cuentas-pills-row::-webkit-scrollbar-thumb {
        background: #9aa898;
        border-radius: 999px;
      }
      .cuentas-pills-row::-webkit-scrollbar-track {
        background: transparent;
      }

      .cuentas-pill {
        flex: 0 0 auto;
        height: 40px;
        padding: 0 18px;
        border-radius: 999px;
        border: 1.5px solid #dce5da;
        background: #ffffff;
        color: #1e2a1e;
        font-size: 13.5px;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
        white-space: nowrap;
        transition: background 0.16s ease, color 0.16s ease, border-color 0.16s ease, transform 0.12s ease;
      }
      .cuentas-pill:active {
        transform: scale(0.97);
      }
      .cuentas-pill.active {
        background: #2d3e2c;
        color: #ffffff;
        border-color: #2d3e2c;
      }

      .cuentas-kpi-grid {
        display: grid;
        grid-template-columns: repeat(3, minmax(0, 1fr));
        gap: 8px;
        margin: 8px 0 18px;
      }
      .cuentas-kpi-card {
        background: #ffffff;
        border: 1px solid #e6ece4;
        border-radius: 16px;
        padding: 12px 12px;
        min-width: 0;
      }
      .cuentas-kpi-label {
        font-size: 12px;
        font-weight: 600;
        color: #5a6b58;
        margin-bottom: 3px;
      }
      .cuentas-kpi-val {
        font-size: 16.5px;
        font-weight: 800;
        line-height: 1.2;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
      .cuentas-kpi-sub {
        font-size: 11px;
        font-weight: 500;
        color: #5a6b58;
        margin-top: 3px;
        line-height: 1.25;
      }

      .cuentas-section {
        margin-bottom: 18px;
      }
      .cuentas-section-title {
        font-size: 11.5px;
        font-weight: 800;
        text-transform: uppercase;
        letter-spacing: 0.6px;
        margin-bottom: 10px;
      }

      .cuentas-cat-card {
        background: #ffffff;
        border: 1px solid #e6ece4;
        border-radius: 18px;
        padding: 14px 16px;
        margin-bottom: 12px;
        transition: border-color 0.18s ease;
      }
      .cuentas-cat-header {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        margin-bottom: 10px;
        cursor: pointer;
        user-select: none;
      }
      .cuentas-cat-name {
        font-size: 15.5px;
        font-weight: 800;
        color: #111827;
        line-height: 1.25;
      }
      .cuentas-cat-sub {
        font-size: 12.5px;
        color: #5a6b58;
        margin-top: 2px;
        font-weight: 500;
      }
      .cuentas-cat-amt {
        font-size: 15.5px;
        font-weight: 800;
        white-space: nowrap;
      }
      .cuentas-cat-chev {
        font-size: 21px;
        color: #4a5d48;
        transition: transform 0.2s ease;
      }

      .cuentas-bar-track {
        width: 100%;
        height: 6px;
        border-radius: 999px;
        overflow: hidden;
        cursor: pointer;
      }
      .cuentas-bar-fill {
        height: 100%;
        border-radius: 999px;
        transition: width 0.28s ease;
      }

      .cuentas-cat-body {
        margin-top: 14px;
        padding-left: 14px;
        border-left: 2px solid #cdd9cb;
      }

      .cuentas-mov-swipe-wrap {
        position: relative;
        overflow: hidden;
        border-radius: 10px;
      }
      .cuentas-swipe-bg {
        position: absolute;
        inset: 0;
        display: flex;
        align-items: center;
        justify-content: space-between;
        pointer-events: none;
        background: transparent;
      }
      .cuentas-swipe-del-bg, .cuentas-swipe-edit-bg {
        color: #ffffff;
        display: flex;
        align-items: center;
        gap: 5px;
        padding: 0 14px;
        font-size: 12.5px;
        font-weight: 700;
        opacity: 0;
      }
      .cuentas-mov-row {
        position: relative;
        z-index: 2;
        background: #ffffff;
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 12px;
        padding: 11px 4px;
        cursor: pointer;
        touch-action: pan-y;
        user-select: none;
        -webkit-user-select: none;
      }
      .cuentas-mov-amt {
        font-size: 14.5px;
        font-weight: 800;
        text-align: right;
        flex-shrink: 0;
        white-space: nowrap;
      }
      .cuentas-mov-info {
        min-width: 0;
        flex: 1;
      }
      .cuentas-mov-title {
        font-size: 14px;
        font-weight: 700;
        color: #111827;
        line-height: 1.3;
      }
      .cuentas-mov-sub {
        font-size: 12px;
        color: #5a6b58;
        margin-top: 2px;
        line-height: 1.35;
      }
      .cuentas-aprobar-pill {
        display: inline-block;
        background: rgba(230, 81, 0, 0.12);
        color: #b34200;
        font-size: 10px;
        font-weight: 700;
        padding: 2px 7px;
        border-radius: 999px;
        margin-left: 6px;
        vertical-align: middle;
      }
      .cuentas-aprobar-btn {
        margin-top: 6px;
        background: #2d3e2c;
        color: #ffffff;
        border: none;
        border-radius: 999px;
        padding: 4px 11px;
        font-size: 11.5px;
        font-weight: 700;
        display: inline-flex;
        align-items: center;
        gap: 4px;
        cursor: pointer;
      }
      .cuentas-ver-mas-btn {
        background: none;
        border: none;
        padding: 10px 4px 2px;
        color: #1e3e2b;
        font-size: 13.5px;
        font-weight: 700;
        font-family: inherit;
        cursor: pointer;
        display: inline-flex;
        align-items: center;
      }
      .cuentas-empty {
        background: #ffffff;
        border: 1px solid #e6ece4;
        border-radius: 18px;
        padding: 36px 20px;
        text-align: center;
      }

      .cuentas-fab {
        position: fixed;
        right: 20px;
        bottom: 24px;
        z-index: 900;
        width: 56px;
        height: 56px;
        padding: 0;
        border-radius: 16px;
        border: 2px solid #2d3e2c;
        background: #ffffff;
        color: #b34200;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        cursor: pointer;
        box-shadow: 0 6px 18px rgba(45, 62, 44, 0.22);
        transition: transform 0.15s ease, box-shadow 0.15s ease;
      }
      .cuentas-fab .material-icons {
        font-size: 28px;
        color: #b34200;
      }
      .cuentas-fab:active {
        transform: scale(0.94);
      }
      @media (max-width: 400px) {
        .cuentas-kpi-val { font-size: 14.5px; }
        .cuentas-kpi-card { padding: 10px 9px; }
      }
    </style>

    <div class="screen-cuentas">
      <!-- Barra de búsqueda (en móvil se promueve al topbar) -->
      <div class="motores-top-actions-container" style="display: flex; justify-content: flex-end; margin: 6px 0 10px;">
        ${renderM3SearchBar({
          wrapperId: 'gastos-search-wrapper',
          toggleId: 'gastos-search-toggle',
          inputId: 'gastos-search-input',
          clearId: 'gastos-search-clear',
          placeholder: 'Buscar movimiento...',
          value: currentGastosSearchQuery
        })}
      </div>

      <!-- Filtros de período: Día | Semana | Mes | Todo -->
      <div id="cuentas-period-pills" class="cuentas-pills-row"></div>

      <!-- Navegador de Día / Semana / Mes -->
      <div id="cuentas-date-nav-wrap"></div>

      <!-- Filtros de lotes -->
      <div id="cuentas-lote-pills" class="cuentas-pills-row"></div>

      <!-- 3 Tarjetas KPI: Egresos | Ingresos | Balance -->
      <div id="cuentas-kpi-row" class="cuentas-kpi-grid"></div>

      <!-- Banner Pendiente de enviar a Cuentas -->
      <div id="cuentas-pending-banner"></div>

      <!-- Segmentado: Por categoría | Por lote -->
      <div id="cuentas-group-toggle"></div>

      <!-- Secciones de Categorías / Lotes (Acordeón) -->
      <div id="cuentas-sections-wrap"></div>

      <!-- FAB blanco con borde verde e ícono + naranja -->
      <button type="button" id="cuentas-fab-btn" class="cuentas-fab" onclick="window.openNuevoMovimientoCuentas()" aria-label="Nuevo movimiento" title="Nuevo movimiento">
        <span class="material-icons">add</span>
      </button>
    </div>
  `;
}

// ─── Inicialización de Eventos ────────────────────────────────────────────────
export function initGastos() {
  renderCuentasUI();

  initM3FullScreenSearch({
    moduleKey: 'gastos',
    toggleId: 'gastos-search-toggle',
    inputId: 'gastos-search-input',
    clearId: 'gastos-search-clear',
    placeholder: 'Buscar movimiento...',
    ariaLabel: 'Búsqueda en Cuentas',
    suggestedTitle: 'Movimientos recientes',
    emptyLabel: 'movimientos',
    getQuery: () => currentGastosSearchQuery,
    setQuery: (v) => { currentGastosSearchQuery = v; },
    onApplySearch: () => renderCuentasUI(),
    loadItems: async () => _allGastos || [],
    getQuickChips: () => [
      { label: 'Cafetal', type: 'query', value: 'Cafetal', icon: 'eco' },
      { label: 'Personal', type: 'query', value: 'Personal', icon: 'groups' },
      { label: 'Veterinaria', type: 'query', value: 'Veterinaria', icon: 'vaccines' },
      { label: 'Ingreso', type: 'query', value: 'Ingreso', icon: 'trending_up' }
    ],
    filterItems: (items, qLower) => items.filter(g => {
      const cat = String(g.categoria || '').toLowerCase();
      const grp = getDisplayGroupName(g.categoria).toLowerCase();
      const desc = String(g.descripcion || '').toLowerCase();
      const pName = String(_refs.personal.get(String(g.personal_id || '')) || '').toLowerCase();
      const lName = String(_refs.lotes.get(String(g.lote_id || '')) || '').toLowerCase();
      return cat.includes(qLower) || grp.includes(qLower) || desc.includes(qLower) || pName.includes(qLower) || lName.includes(qLower);
    }),
    renderItem: (g) => {
      const disp = formatMovDisplay(g, _refs);
      const isIng = isIngresoMov(g);
      return `
        <div class="ganado-row" onclick="window.handleEditGasto('${escapeHtml(g.id)}')" style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 14px;cursor:pointer;">
          <div style="min-width:0;flex:1;">
            <div style="font-size:14px;font-weight:700;color:#111827;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(disp.title)}</div>
            <div style="font-size:12px;color:#5a6b58;margin-top:2px;">${escapeHtml(getDisplayGroupName(g.categoria))}${disp.subtitle ? ' · ' + escapeHtml(disp.subtitle) : ''}</div>
          </div>
          <div style="font-size:14px;font-weight:800;color:${isIng ? '#1b6e1b' : '#b34200'};white-space:nowrap;">
            ${isIng ? '+' : '–'} ${formatShortL(g.monto)}
          </div>
        </div>
      `;
    },
    itemSelector: '.ganado-row',
    getItemTitle: (el) => el.querySelector('div > div')?.textContent?.trim() || ''
  });
}
