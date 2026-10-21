import { supabase } from '../supabase.js';
import { restFetch } from '../auth.js';

let _allGastos = [];
let _refs = { lotes: new Map(), ganado: new Map(), herramientas: new Map(), personal: new Map() };
let monthsOrder = [];
let currentMonthIdx = 0; // 0 = 'Historial Completo' (muestra todos los 6 registros por defecto)
let activeCategory = 'all'; // 'all' | 'personal' | 'veterinaria' | 'insumos' | 'maquinaria' | 'otro'
let currentGastosSearchQuery = '';

// ─── Helpers de Formato ───────────────────────────────────────────────────────
function formatMoney(n) {
  const v = Number(n) || 0;
  return v.toLocaleString('es-HN', { style: 'currency', currency: 'HNL' });
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

const MONTH_NAMES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function getMonthKeyFromDate(dateStr) {
  if (!dateStr) return '';
  const clean = String(dateStr).slice(0, 10);
  const d = new Date(clean + 'T12:00:00');
  if (isNaN(d.getTime())) return '';
  return `${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

// ─── Trigonometría para las cápsulas de la Dona ───────────────────────────────
const CX = 140;
const CY = 140;
const RADIUS = 104;

function polarToCartesian(cx, cy, r, angleInDegrees) {
  const rad = (angleInDegrees * Math.PI) / 180.0;
  return {
    x: cx + r * Math.cos(rad),
    y: cy + r * Math.sin(rad)
  };
}

function createArcPath(cx, cy, r, startAngle, endAngle) {
  const start = polarToCartesian(cx, cy, r, startAngle);
  const end = polarToCartesian(cx, cy, r, endAngle);
  const sweep = endAngle - startAngle;
  const largeArcFlag = sweep <= 180 ? '0' : '1';
  return {
    d: `M ${start.x.toFixed(2)} ${start.y.toFixed(2)} A ${r} ${r} 0 ${largeArcFlag} 1 ${end.x.toFixed(2)} ${end.y.toFixed(2)}`,
    startPt: start,
    endPt: end
  };
}

// ─── Metadatos de Categorías ──────────────────────────────────────────────────
const CATEGORY_META = {
  personal: {
    key: 'personal',
    name: 'Personal · Jornales',
    shortName: 'Personal',
    color: '#65a30d',
    bannerBg: '#4d7c0f',
    darkBg: '#213014',
    lightBg: '#f2fce2',
    border: '#65a30d',
    iconBg: 'rgba(0, 0, 0, 0.2)',
    iconName: 'badge',
    matches: (cat) => cat === 'Personal',
    svgBadgePath: `<path d="M-3.5 3.5 C-3.5 -2 0.5 -4.5 4.5 -4.5 C4.5 0.5 2 3.5 -3.5 3.5 Z M-3.5 3.5 L-1 1" fill="none" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>`
  },
  veterinaria: {
    key: 'veterinaria',
    name: 'Veterinaria · Sanidad',
    shortName: 'Veterinaria',
    color: '#8b5cf6',
    bannerBg: '#6d28d9',
    darkBg: '#231e38',
    lightBg: '#f5f3ff',
    border: '#8b5cf6',
    iconBg: 'rgba(0, 0, 0, 0.2)',
    iconName: 'pets',
    matches: (cat) => cat === 'Veterinaria',
    svgBadgePath: `<path d="M0 -4.2 V4.2 M-4.2 0 H4.2" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round"/>`
  },
  insumos: {
    key: 'insumos',
    name: 'Insumos · Abonos',
    shortName: 'Insumos',
    color: '#f59e0b',
    bannerBg: '#d97706',
    darkBg: '#33240d',
    lightBg: '#fffbeb',
    border: '#f59e0b',
    iconBg: 'rgba(0, 0, 0, 0.2)',
    iconName: 'science',
    matches: (cat) => cat === 'Insumos Agrícolas' || cat === 'Foliares/Abonos',
    svgBadgePath: `<circle cx="0" cy="0" r="2.6" fill="#ffffff"/>`
  },
  maquinaria: {
    key: 'maquinaria',
    name: 'Maquinaria · Equipos',
    shortName: 'Maquinaria',
    color: '#0284c7',
    bannerBg: '#0369a1',
    darkBg: '#0e2a38',
    lightBg: '#f0f9ff',
    border: '#0284c7',
    iconBg: 'rgba(0, 0, 0, 0.2)',
    iconName: 'precision_manufacturing',
    matches: (cat) => cat === 'Maquinaria',
    svgBadgePath: `<path d="M-3 -3 L3 3 M-3 3 L3 -3" stroke="#ffffff" stroke-width="1.8" stroke-linecap="round"/>`
  },
  otro: {
    key: 'otro',
    name: 'Otros Gastos',
    shortName: 'Otros',
    color: '#64748b',
    bannerBg: '#475569',
    darkBg: '#242c33',
    lightBg: '#f8fafc',
    border: '#64748b',
    iconBg: 'rgba(0, 0, 0, 0.2)',
    iconName: 'more_horiz',
    matches: (cat) => cat !== 'Personal' && cat !== 'Veterinaria' && cat !== 'Insumos Agrícolas' && cat !== 'Foliares/Abonos' && cat !== 'Maquinaria',
    svgBadgePath: `<circle cx="0" cy="0" r="2" fill="#ffffff"/>`
  }
};

function getCategoryKey(cat) {
  if (cat === 'Personal') return 'personal';
  if (cat === 'Veterinaria') return 'veterinaria';
  if (cat === 'Insumos Agrícolas' || cat === 'Foliares/Abonos') return 'insumos';
  if (cat === 'Maquinaria') return 'maquinaria';
  return 'otro';
}

function getGastoIconStyle(cat, isPorAprobar) {
  let icon = 'receipt_long';
  let isImg = false;
  let imgSrc = '';

  switch (cat) {
    case 'Personal':
      icon = 'badge';
      break;
    case 'Veterinaria':
      isImg = true;
      imgSrc = '/vaca.png';
      break;
    case 'Insumos Agrícolas':
      icon = 'inventory_2';
      break;
    case 'Foliares/Abonos':
      icon = 'eco';
      break;
    case 'Maquinaria':
      icon = 'precision_manufacturing';
      break;
    default:
      icon = 'receipt_long';
      break;
  }

  if (isPorAprobar) {
    return {
      icon: 'pending_actions',
      isImg: false,
      bg: '#f0f7e6',
      color: '#2d3e2c',
      border: '1.5px solid rgba(45, 62, 44, 0.28)',
      shadow: 'rgba(45, 62, 44, 0.15)'
    };
  }

  return {
    icon,
    isImg,
    imgSrc,
    bg: '#f0f7e6',
    color: '#2d3e2c',
    border: '1.5px solid rgba(45, 62, 44, 0.2)',
    shadow: 'rgba(45, 62, 44, 0.12)'
  };
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

    // Si el texto restante parece solo una fecha repetida, descartarlo
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

// ─── Fetch de referencias (Lotes, Ganado, Herramientas) ───────────────────────
async function fetchRefs() {
  const [lotesRes, ganadoRes, herramientasRes, personalData] = await Promise.all([
    supabase.from('lotes').select('id,nombre'),
    supabase.from('ganado').select('id,nombre'),
    supabase.from('herramientas').select('id,nombre'),
    restFetch('/rest/v1/personal?select=id,nombre').catch(async () => {
      const local = await supabase.from('personal').select('id,nombre').catch(() => ({ data: [] }));
      return local.data || [];
    })
  ]);
  const toMap = (arr) => new Map((arr || []).map(x => [x.id, x.nombre]));
  return {
    lotes: toMap(lotesRes.data),
    ganado: toMap(ganadoRes.data),
    herramientas: toMap(herramientasRes.data),
    personal: toMap(Array.isArray(personalData) ? personalData : [])
  };
}

function vinculoHtml(g, refs) {
  if (g.lote_id && refs.lotes.get(g.lote_id)) {
    return `<span style="display:inline-flex;align-items:center;gap:4px;"><span class="material-icons" style="font-size:14px;">eco</span> ${refs.lotes.get(g.lote_id)}</span>`;
  }
  if (g.animal_id && refs.ganado.get(g.animal_id)) {
    return `<span style="display:inline-flex;align-items:center;gap:4px;"><img src="/vaca.png" style="width:14px;height:14px;object-fit:contain;"> ${refs.ganado.get(g.animal_id)}</span>`;
  }
  if (g.herramienta_id && refs.herramientas.get(g.herramienta_id)) {
    return `<span style="display:inline-flex;align-items:center;gap:4px;"><span class="material-icons" style="font-size:14px;">construction</span> ${refs.herramientas.get(g.herramienta_id)}</span>`;
  }
  return '';
}

// ─── Renderizado de Fila de Gasto (Exacta a Finca Manager) ────────────────────
function renderGastoRow(g, refs) {
  const vinculo = vinculoHtml(g, refs);
  const isPorAprobar = (g.descripcion || '').includes('[Por Aprobar]');
  let displayDesc = (g.descripcion || 'Sin descripción')
    .replace('[Por Aprobar]', '')
    .replace(/\[ref:[^\]]+\]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  let subLabelExtra = '';
  let personName = '';
  if (g.categoria === 'Personal') {
    const parsed = parsePersonalGasto(displayDesc, g.fecha);
    if (parsed) {
      displayDesc = parsed.title;
      personName = parsed.nombre || '';
      if (parsed.extra) {
        subLabelExtra = ` · ${parsed.extra}`;
      }
    }

    // Si aún no tenemos el nombre de la persona, buscar en refs.personal por g.personal_id o por [ref:WORKER_ID...]
    if (!personName) {
      const rawDesc = String(g.descripcion || '');
      const refMatch = rawDesc.match(/\[ref:([a-f0-9-]+)/i);
      const workerId = g.personal_id || (refMatch ? refMatch[1] : null);
      if (workerId && refs.personal && refs.personal.has(workerId)) {
        personName = refs.personal.get(workerId);
      }
    }
  }

  const iconStyle = getGastoIconStyle(g.categoria, isPorAprobar);

  const aprobarBadge = isPorAprobar
    ? `<span style="display:inline-flex;align-items:center;gap:3px;background:rgba(230,81,0,0.12);color:#e65100;padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;margin-left:6px;vertical-align:middle;"><span class="material-symbols-outlined" style="font-size:12px;">schedule</span> Por Aprobar</span>`
    : '';

  const aprobarButton = isPorAprobar
    ? `<button type="button" class="ganado-btn-aprobar" onclick="event.stopPropagation(); window.aprobarGastoPersonal('${g.id}')" style="background:#2d3e2c;color:#ffffff;border:none;border-radius:10px;padding:4px 10px;font-size:11px;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;box-shadow:0 2px 6px rgba(45,62,44,0.3);transition:transform 0.15s;">
        <span class="material-symbols-outlined" style="font-size:14px;">check_circle</span> Aprobar
       </button>`
    : '';

  let mainTitle = personName || displayDesc;
  let periodSubHtml = '';

  if (personName) {
    periodSubHtml = `
      <p style="font-weight:700;font-size:13px;color:#2d3e2c;margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:inline-flex;align-items:center;gap:4px;">
        <span class="material-symbols-outlined" style="font-size:14px;color:#2d3e2c;">date_range</span>
        <span>${displayDesc}</span>
      </p>
    `;
  }

  const fechaStr = g.fecha
    ? new Date((g.fecha || '').slice(0, 10) + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  return `
    <div class="ganado-row" onclick="window.handleEditGasto('${g.id}')" style="display:flex;align-items:flex-start;padding:14px 16px;position:relative;">
      <div class="ganado-row-img-container" style="width:48px;height:48px;min-width:48px;border-radius:14px;background:${iconStyle.bg};border:${iconStyle.border};box-shadow:0 4px 12px ${iconStyle.shadow};display:flex;align-items:center;justify-content:center;overflow:hidden;flex-shrink:0;margin-top:2px;">
        ${iconStyle.isImg
          ? `<img src="${iconStyle.imgSrc}" alt="${g.categoria || 'Gasto'}" style="width:26px;height:26px;object-fit:contain;display:block;">`
          : `<span class="material-symbols-outlined" style="font-size:26px;color:${iconStyle.color};font-variation-settings:'FILL' 1, 'wght' 500;">
              ${iconStyle.icon}
            </span>`
        }
      </div>

      <div class="ganado-row-content" style="margin-left:12px;flex:1;min-width:0;display:flex;flex-direction:column;gap:3px;">
        <!-- Línea 1: Categoría a la izquierda, Precio y Menú de acción a la derecha -->
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;width:100%;">
          <p class="ganado-col-label" style="font-size:11px;letter-spacing:0.5px;font-weight:800;color:${iconStyle.color};margin:0;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
            ${(g.categoria || 'OTRO').toUpperCase()}${aprobarBadge}
          </p>

          <div class="ganado-row-actions-box" style="margin-left:auto;display:flex;align-items:center;gap:8px;position:relative;flex-shrink:0;">
            <p class="ganado-col-value" style="font-weight:800;color:#2d3e2c;white-space:nowrap;font-size:15px;margin:0;">${formatMoney(g.monto)}</p>
            ${aprobarButton}

            <button class="ganado-btn-more" onclick="event.stopPropagation(); window.toggleActionMenu(this)" style="margin:0;display:flex;align-items:center;justify-content:center;background:none;border:none;cursor:pointer;padding:4px;border-radius:50%;">
              <span class="material-symbols-outlined" style="font-size:20px;color:var(--m3-on-surface-variant,#555);">more_vert</span>
            </button>

            <div class="action-menu" style="background:#2d3e2c !important; z-index:9999; box-shadow:0 10px 30px rgba(0,0,0,0.45); border:1px solid rgba(255,255,255,0.15); border-radius:12px; right:0; top:100%;">
              <div class="action-item" onclick="event.stopPropagation(); window.handleEditGasto('${g.id}')">
                <span class="material-symbols-outlined">edit</span>
                <span>Editar</span>
              </div>
              <div class="action-item" onclick="event.stopPropagation(); window.shareGastoDirect('${g.id}')">
                <span class="material-symbols-outlined">share</span>
                <span>WhatsApp</span>
              </div>
              <div class="action-item delete" onclick="event.stopPropagation(); window.confirmDeleteGasto('${g.id}', '${String(g.descripcion || '').replace(/'/g, "\\'").substring(0, 30)}')">
                <span class="material-symbols-outlined">delete</span>
                <span>Eliminar</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Línea 2: Nombre de la persona o concepto principal -->
        <p class="ganado-col-value" style="font-weight:800;font-size:15px;color:var(--m3-on-surface,#1e1e1e);line-height:1.3;margin:2px 0 0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;width:100%;" title="${mainTitle}">
          ${mainTitle}
        </p>

        <!-- Línea 3: Semana si existe -->
        ${periodSubHtml}

        <!-- Línea 4: Fecha + desglose de días laborados + vínculo -->
        <p class="ganado-col-label" style="margin:2px 0 0;font-size:11px;color:var(--m3-on-surface-variant,#666);">
          ${fechaStr}${subLabelExtra}
          ${vinculo}
        </p>
      </div>
    </div>
  `;
}

// ─── Construir lista de meses ─────────────────────────────────────────────────
function buildMonthsOrder(allGastos) {
  const monthsSet = new Set();
  (allGastos || []).forEach(g => {
    const m = getMonthKeyFromDate(g.fecha);
    if (m) monthsSet.add(m);
  });

  const now = new Date();
  const currentMonthStr = `${MONTH_NAMES[now.getMonth()]} ${now.getFullYear()}`;
  monthsSet.add(currentMonthStr);

  const sorted = Array.from(monthsSet).sort((a, b) => {
    const [ma, ya] = a.split(' ');
    const [mb, yb] = b.split(' ');
    const valA = parseInt(ya, 10) * 100 + MONTH_NAMES.indexOf(ma);
    const valB = parseInt(yb, 10) * 100 + MONTH_NAMES.indexOf(mb);
    return valA - valB;
  });

  // 'Historial Completo' siempre en índice 0 para ver todos los registros juntos
  return ['Historial Completo', ...sorted];
}

function getFilteredRecords() {
  const monthName = monthsOrder[currentMonthIdx] || 'Historial Completo';

  let list = _allGastos;
  if (monthName !== 'Historial Completo') {
    list = list.filter(g => getMonthKeyFromDate(g.fecha) === monthName);
  }

  if (activeCategory !== 'all') {
    list = list.filter(g => getCategoryKey(g.categoria) === activeCategory);
  }

  if (currentGastosSearchQuery) {
    const q = currentGastosSearchQuery.toLowerCase();
    list = list.filter(g =>
      (g.descripcion || '').toLowerCase().includes(q) ||
      (g.categoria || '').toLowerCase().includes(q)
    );
  }

  return list;
}

// ─── Renderizado Reactivo de Dona Analítica y Lista ───────────────────────────
function renderDonutAndUI() {
  const monthName = monthsOrder[currentMonthIdx] || 'Historial Completo';
  const monthRecords = monthName === 'Historial Completo'
    ? _allGastos
    : _allGastos.filter(g => getMonthKeyFromDate(g.fecha) === monthName);

  const totals = { personal: 0, veterinaria: 0, insumos: 0, maquinaria: 0, otro: 0 };
  monthRecords.forEach(g => {
    const k = getCategoryKey(g.categoria);
    totals[k] = (totals[k] || 0) + (Number(g.monto) || 0);
  });

  const grandTotal = Object.values(totals).reduce((a, b) => a + b, 0);

  const pcts = {};
  for (const [k, v] of Object.entries(totals)) {
    pcts[k] = grandTotal > 0 ? Math.round((v / grandTotal) * 100) : 0;
  }

  // Actualizar Centro de la Dona
  const centerAmtEl = document.getElementById('center-total-amount');
  const centerMonthEl = document.getElementById('center-month-name');
  if (centerAmtEl) centerAmtEl.textContent = formatNumber(grandTotal);
  if (centerMonthEl) centerMonthEl.textContent = monthName;

  // Actualizar Banner Superior
  updateTopBanner(totals, pcts, grandTotal);

  // Actualizar Píldoras
  renderLegendPills(totals, pcts);

  // SVG de la Dona
  renderDonutSvg(totals, grandTotal);

  // Lista de Movimientos (Siempre muestra los registros correspondientes)
  const displayRecords = getFilteredRecords();
  const listContainer = document.getElementById('gastos-list-container');
  const countLabel = document.getElementById('gastos-count-label');

  if (countLabel) {
    const periodSum = displayRecords.reduce((s, g) => s + (Number(g.monto) || 0), 0);
    countLabel.textContent = `${displayRecords.length} ${displayRecords.length === 1 ? 'registro' : 'registros'} · ${formatMoney(periodSum)}`;
  }

  if (listContainer) {
    if (displayRecords.length === 0) {
      listContainer.innerHTML = `
        <div class="ganado-empty" style="grid-column: 1 / -1; padding: 36px 16px; text-align: center;">
          <span class="material-icons" style="font-size: 38px; color: #7e9384;">search_off</span>
          <p style="font-size: 14px; font-weight: 700; color: #2d3e2c; margin: 8px 0 4px;">No se encontraron registros</p>
          <p style="font-size: 12px; color: #666; margin: 0;">${currentGastosSearchQuery ? 'Prueba con otro término' : 'Prueba cambiando de mes o seleccionando "Historial Completo"'}</p>
        </div>
      `;
    } else {
      listContainer.innerHTML = displayRecords.map(g => renderGastoRow(g, _refs)).join('');
    }
  }
}

function updateTopBanner(totals, pcts, grandTotal) {
  const banner = document.getElementById('top-category-banner');
  const iconBox = document.getElementById('banner-icon-box');
  const iconEl = document.getElementById('banner-icon');
  const titleEl = document.getElementById('banner-title');
  const subEl = document.getElementById('banner-subtitle');
  const amtEl = document.getElementById('banner-amount');
  const closeBtn = document.getElementById('banner-close-btn');

  if (!banner || !titleEl || !amtEl) return;

  if (activeCategory === 'all') {
    banner.style.backgroundColor = '#16241b';
    banner.style.borderColor = '#273d2e';
    iconBox.style.backgroundColor = '#203327';
    iconBox.style.color = '#a3e635';
    iconEl.textContent = 'layers';
    titleEl.textContent = 'Total Consolidado';
    subEl.textContent = '100% del presupuesto acumulado';
    subEl.style.color = '#93a899';
    amtEl.textContent = formatNumber(grandTotal);
    if (closeBtn) closeBtn.style.display = 'none';
  } else {
    const meta = CATEGORY_META[activeCategory] || CATEGORY_META.otro;
    const catTotal = totals[activeCategory] || 0;
    const catPct = pcts[activeCategory] || 0;

    banner.style.backgroundColor = meta.darkBg;
    banner.style.borderColor = meta.border;
    iconBox.style.backgroundColor = meta.iconBg;
    iconBox.style.color = meta.color;
    iconEl.textContent = meta.iconName;
    titleEl.textContent = meta.name;
    subEl.textContent = `${catPct}% del presupuesto`;
    subEl.style.color = meta.color;
    amtEl.textContent = formatNumber(catTotal);
    if (closeBtn) closeBtn.style.display = 'flex';
  }
}

function renderLegendPills(totals, pcts) {
  const container = document.getElementById('gastos-legend-pills');
  if (!container) return;

  const keysToShow = ['personal', 'veterinaria', 'insumos'];
  if (totals.maquinaria > 0) keysToShow.push('maquinaria');

  container.innerHTML = keysToShow.map(catKey => {
    const meta = CATEGORY_META[catKey];
    const isAct = activeCategory === catKey;
    const borderStyle = isAct ? meta.color : '#1f3125';
    const bgStyle = isAct ? meta.darkBg : 'rgba(9, 17, 12, 0.7)';
    const pct = pcts[catKey] || 0;

    return `
      <button onclick="window.setGastosCategoryFilter('${catKey}')"
              class="gastos-pill-btn press-effect"
              style="border-color: ${borderStyle}; background-color: ${bgStyle};">
        <span class="gastos-pill-dot" style="background-color: ${meta.color};"></span>
        <span class="gastos-pill-text">${meta.shortName} (${pct}%)</span>
      </button>
    `;
  }).join('');
}

function renderDonutSvg(totals, grandTotal) {
  const layer = document.getElementById('donut-segments-layer');
  if (!layer) return;
  layer.innerHTML = '';

  const trackDotsAngles = [118, 130, 142];
  trackDotsAngles.forEach((ang, idx) => {
    const pt = polarToCartesian(CX, CY, RADIUS, ang);
    const dotRadius = idx === 1 ? 3.4 : 2.6;
    layer.innerHTML += `<circle cx="${pt.x.toFixed(2)}" cy="${pt.y.toFixed(2)}" r="${dotRadius}" fill="#b8ccb5" opacity="0.9"/>`;
  });

  const catsOrder = ['personal', 'veterinaria', 'insumos'];
  if (totals.maquinaria > 0) catsOrder.push('maquinaria');
  if (totals.otro > 0) catsOrder.push('otro');

  let cursorAngle = 165;
  const TOTAL_AVAILABLE_ARC = 285;

  catsOrder.forEach(catKey => {
    const meta = CATEGORY_META[catKey] || CATEGORY_META.otro;
    const val = totals[catKey] || 0;
    const ratio = grandTotal > 0 ? val / grandTotal : 0;
    const isSelected = activeCategory === 'all' || activeCategory === catKey;
    const opacity = isSelected ? '1' : '0.32';
    const strokeW = activeCategory === catKey ? 30 : 28;

    if (ratio <= 0.02) {
      const bubbleAngle = cursorAngle + 8;
      const pt = polarToCartesian(CX, CY, RADIUS, bubbleAngle);

      layer.innerHTML += `
        <g class="donut-capsule-group" style="opacity: ${opacity}; cursor: pointer;" onclick="window.setGastosCategoryFilter('${catKey}')">
          <circle cx="${pt.x.toFixed(2)}" cy="${pt.y.toFixed(2)}" r="18" fill="#ffffff"/>
          <circle cx="${pt.x.toFixed(2)}" cy="${pt.y.toFixed(2)}" r="14" fill="${meta.color}"/>
          <circle cx="${pt.x.toFixed(2)}" cy="${pt.y.toFixed(2)}" r="10.2" fill="${meta.iconBg}"/>
          <g transform="translate(${pt.x.toFixed(2)}, ${pt.y.toFixed(2)})">
            ${meta.svgBadgePath}
          </g>
        </g>
      `;
      cursorAngle += 27;
    } else {
      const rawSweep = Math.max(34, ratio * TOTAL_AVAILABLE_ARC);
      const startAng = cursorAngle;
      const endAng = cursorAngle + rawSweep - 16;

      const arcData = createArcPath(CX, CY, RADIUS, startAng, endAng);
      const badgePt = arcData.endPt;

      layer.innerHTML += `
        <g class="donut-capsule-group" style="opacity: ${opacity}; cursor: pointer;" filter="url(#glow-active)" onclick="window.setGastosCategoryFilter('${catKey}')">
          <path d="${arcData.d}" fill="none" stroke="#ffffff" stroke-width="${strokeW + 8}" stroke-linecap="round"/>
          <path d="${arcData.d}" fill="none" stroke="${meta.color}" stroke-width="${strokeW}" stroke-linecap="round"/>
          <g transform="translate(${badgePt.x.toFixed(2)}, ${badgePt.y.toFixed(2)})">
            <circle cx="0" cy="0" r="10.5" fill="${meta.iconBg}"/>
            ${meta.svgBadgePath}
          </g>
        </g>
      `;

      cursorAngle = endAng + 26;
    }
  });
}

// ─── Funciones Interactivas de Ventana ─────────────────────────────────────────
// ─── Bottom Sheet Edición de Gastos ─────────────────────────────────────────
window.handleEditGasto = function(id) {
  if (window.innerWidth <= 768) {
    window.openEditGastoSheet(id);
  } else {
    window.navigateTo('nuevo_gasto', id);
  }
};

window.setGastoSheetExpanded = function(expand) {
  const sheet = document.getElementById('gasto-edit-sheet');
  const scrim = document.getElementById('gasto-edit-scrim');
  const icon = document.getElementById('gasto-sheet-expand-icon');
  const cue = document.getElementById('gasto-sheet-drag-cue');
  if (!sheet) return;

  if (expand) {
    sheet.classList.add('expanded');
    if (scrim) scrim.classList.add('expanded');
    if (icon) icon.textContent = 'keyboard_arrow_down';
    if (cue) {
      cue.innerHTML = `<span>Desliza hacia abajo o toca para contraer</span><span class="material-symbols-outlined" style="font-size:14px;">expand_more</span>`;
    }
  } else {
    sheet.classList.remove('expanded');
    if (scrim) scrim.classList.remove('expanded');
    if (icon) icon.textContent = 'keyboard_arrow_up';
    if (cue) {
      cue.innerHTML = `<span>Desliza o toca para pantalla completa</span><span class="material-symbols-outlined" style="font-size:14px;">expand_less</span>`;
    }
  }
};

window.toggleGastoSheetExpand = function() {
  const sheet = document.getElementById('gasto-edit-sheet');
  if (!sheet) return;
  window.setGastoSheetExpanded(!sheet.classList.contains('expanded'));
};

window.closeEditGastoSheet = function() {
  const sheet = document.getElementById('gasto-edit-sheet');
  const scrim = document.getElementById('gasto-edit-scrim');
  if (sheet) sheet.classList.remove('open', 'expanded');
  if (scrim) scrim.classList.remove('open', 'expanded');
};

window.onGastoVinculoTipoChange = function() {
  const tipoSelect = document.getElementById('sheet-gasto-vinculo-tipo');
  const idContainer = document.getElementById('sheet-gasto-vinculo-id-container');
  const idSelect = document.getElementById('sheet-gasto-vinculo-id');
  const idLabel = document.getElementById('sheet-gasto-vinculo-id-label');
  if (!tipoSelect || !idContainer || !idSelect || !idLabel) return;

  const tipo = tipoSelect.value;
  if (!tipo) {
    idContainer.style.display = 'none';
    idSelect.innerHTML = '';
    return;
  }

  idContainer.style.display = 'flex';
  idLabel.textContent = tipo === 'lote' ? 'Lote Vinculado' : tipo === 'animal' ? 'Animal Vinculado' : 'Herramienta Vinculada';

  let items = [];
  if (tipo === 'lote') items = Array.from(_refs.lotes.entries());
  else if (tipo === 'animal') items = Array.from(_refs.ganado.entries());
  else if (tipo === 'herramienta') items = Array.from(_refs.herramientas.entries());

  if (items.length === 0) {
    idSelect.innerHTML = '<option value="">No hay registros disponibles</option>';
  } else {
    idSelect.innerHTML = '<option value="">— Seleccionar —</option>' + 
      items.map(([itemId, nombre]) => `<option value="${itemId}">${escapeHtml(nombre)}</option>`).join('');
  }
};

window.openEditGastoSheet = function(id) {
  const g = _allGastos.find(x => x.id === id);
  if (!g) {
    window.navigateTo('nuevo_gasto', id);
    return;
  }

  const sheet = document.getElementById('gasto-edit-sheet');
  const scrim = document.getElementById('gasto-edit-scrim');
  if (!sheet || !scrim) return;

  const CATEGORIAS = ['Veterinaria', 'Insumos Agrícolas', 'Foliares/Abonos', 'Maquinaria', 'Personal', 'Otro'];

  let vinculoTipo = '';
  let vinculoId = '';
  if (g.lote_id) { vinculoTipo = 'lote'; vinculoId = g.lote_id; }
  else if (g.animal_id) { vinculoTipo = 'animal'; vinculoId = g.animal_id; }
  else if (g.herramienta_id) { vinculoTipo = 'herramienta'; vinculoId = g.herramienta_id; }

  let vinculoItems = [];
  if (vinculoTipo === 'lote') vinculoItems = Array.from(_refs.lotes.entries());
  else if (vinculoTipo === 'animal') vinculoItems = Array.from(_refs.ganado.entries());
  else if (vinculoTipo === 'herramienta') vinculoItems = Array.from(_refs.herramientas.entries());

  sheet.innerHTML = `
    <div class="gasto-sheet-handle-box" onclick="window.toggleGastoSheetExpand()" style="width: 100%; display: flex; flex-direction: column; align-items: center; padding: 6px 0 10px; cursor: pointer; user-select: none;">
      <div style="width: 42px; height: 5px; background: #c2cec1; border-radius: 9999px;"></div>
      <div id="gasto-sheet-drag-cue" style="font-size: 10.5px; font-weight: 700; color: #5a7056; margin-top: 4px; display: flex; align-items: center; gap: 3px;">
        <span>Desliza o toca para pantalla completa</span>
        <span class="material-symbols-outlined" style="font-size: 14px;">expand_less</span>
      </div>
    </div>

    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px; border-bottom: 1px solid #eef3ed; padding-bottom: 12px;">
      <div>
        <h3 style="margin: 0; font-size: 18px; font-weight: 800; color: #1e3e2b;">Editar Gasto</h3>
        <span style="font-size: 11.5px; color: #5a7056; font-weight: 600;">Modifica los detalles del registro</span>
      </div>
      <div style="display: flex; align-items: center; gap: 6px;">
        <button type="button" id="gasto-sheet-expand-btn" onclick="window.toggleGastoSheetExpand()" style="width: 34px; height: 34px; border-radius: 50%; background: #f0f4ef; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #2d3e2c;" title="Pantalla completa">
          <span class="material-symbols-outlined" id="gasto-sheet-expand-icon" style="font-size: 20px;">keyboard_arrow_up</span>
        </button>
        <button type="button" onclick="window.closeEditGastoSheet()" style="width: 34px; height: 34px; border-radius: 50%; background: #f0f4ef; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; color: #2d3e2c;" title="Cerrar">
          <span class="material-icons" style="font-size: 18px;">close</span>
        </button>
      </div>
    </div>

    <form id="form-edit-gasto-sheet" onsubmit="event.preventDefault(); window.saveEditGasto('${g.id}');">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div class="gasto-sheet-field">
          <label class="gasto-sheet-label">Fecha</label>
          <input type="date" name="fecha" value="${(g.fecha || '').slice(0, 10)}" required class="gasto-sheet-input">
        </div>

        <div class="gasto-sheet-field">
          <label class="gasto-sheet-label">Monto (HNL)</label>
          <input type="number" step="0.01" min="0" name="monto" value="${g.monto != null ? Number(g.monto) : ''}" required class="gasto-sheet-input" style="font-weight: 700; color: #2d3e2c;">
        </div>
      </div>

      <div class="gasto-sheet-field">
        <label class="gasto-sheet-label">Categoría</label>
        <select name="categoria" required class="gasto-sheet-select">
          <option value="">Seleccionar categoría...</option>
          ${CATEGORIAS.map(c => `<option value="${c}" ${g.categoria === c ? 'selected' : ''}>${c}</option>`).join('')}
        </select>
      </div>

      <div class="gasto-sheet-field">
        <label class="gasto-sheet-label">Descripción</label>
        <input type="text" name="descripcion" value="${escapeHtml(g.descripcion || '')}" placeholder="Ej. Pago semana o compra de insumo" maxlength="120" class="gasto-sheet-input">
      </div>

      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 10px;">
        <div class="gasto-sheet-field">
          <label class="gasto-sheet-label">Vincular a (opcional)</label>
          <select name="vinculo_tipo" id="sheet-gasto-vinculo-tipo" onchange="window.onGastoVinculoTipoChange()" class="gasto-sheet-select">
            <option value="">— Sin vínculo —</option>
            <option value="lote" ${vinculoTipo === 'lote' ? 'selected' : ''}>Lote</option>
            <option value="animal" ${vinculoTipo === 'animal' ? 'selected' : ''}>Animal</option>
            <option value="herramienta" ${vinculoTipo === 'herramienta' ? 'selected' : ''}>Herramienta</option>
          </select>
        </div>

        <div class="gasto-sheet-field" id="sheet-gasto-vinculo-id-container" style="${vinculoTipo ? 'display: flex;' : 'display: none;'}">
          <label class="gasto-sheet-label" id="sheet-gasto-vinculo-id-label">
            ${vinculoTipo === 'lote' ? 'Lote Vinculado' : vinculoTipo === 'animal' ? 'Animal Vinculado' : 'Herramienta Vinculada'}
          </label>
          <select name="vinculo_id" id="sheet-gasto-vinculo-id" class="gasto-sheet-select">
            <option value="">— Seleccionar —</option>
            ${vinculoItems.map(([vId, vName]) => `<option value="${vId}" ${vinculoId === vId ? 'selected' : ''}>${escapeHtml(vName)}</option>`).join('')}
          </select>
        </div>
      </div>

      <div style="display: flex; gap: 10px; margin-top: 20px;">
        <button type="button" onclick="window.closeEditGastoSheet()" style="flex: 1; padding: 13px; border-radius: 12px; background: #f0f4ef; border: 1.5px solid #d4dfd2; color: #3b503e; font-weight: 700; font-size: 13.5px; cursor: pointer;">
          Cancelar
        </button>
        <button type="submit" id="btn-save-gasto-sheet" style="flex: 2; padding: 13px; border-radius: 12px; background: #2d3e2c; border: none; color: #ffffff; font-weight: 800; font-size: 13.5px; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; box-shadow: 0 4px 14px rgba(45, 62, 44, 0.25);">
          <span class="material-symbols-outlined" style="font-size: 18px;">save</span>
          <span>Guardar Cambios</span>
        </button>
      </div>
    </form>
  `;

  // Auto-expandir suavemente a pantalla completa al enfocar campos
  sheet.querySelectorAll('input, select').forEach(el => {
    el.addEventListener('focus', () => {
      window.setGastoSheetExpanded(true);
    });
  });

  // Asegurar que comience en transform 105% y suba suavemente con reflow
  sheet.classList.remove('open', 'expanded');
  sheet.scrollTop = 0;
  void sheet.offsetHeight;

  requestAnimationFrame(() => {
    scrim.classList.add('open');
    sheet.classList.add('open');
  });

  // Gestos táctiles nativos: Deslizar hacia arriba para pantalla completa o hacia abajo para contraer/cerrar
  let startY = 0;
  let startX = 0;
  sheet.ontouchstart = (e) => {
    if (e.touches.length !== 1) return;
    if (e.target.closest('input') || e.target.closest('select') || e.target.closest('button')) return;
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
  };
  sheet.ontouchend = (e) => {
    const diffY = e.changedTouches[0].clientY - startY;
    const diffX = Math.abs(e.changedTouches[0].clientX - startX);
    if (Math.abs(diffY) < 30 || Math.abs(diffY) < diffX * 1.2) return;

    // Deslizar hacia ARRIBA -> Pantalla completa suave
    if (diffY < -35) {
      window.setGastoSheetExpanded(true);
    }
    // Deslizar hacia ABAJO
    else if (diffY > 45) {
      if (sheet.classList.contains('expanded')) {
        if (sheet.scrollTop <= 10) {
          window.setGastoSheetExpanded(false);
        }
      } else {
        window.closeEditGastoSheet();
      }
    }
  };
};

window.saveEditGasto = async function(id) {
  const form = document.getElementById('form-edit-gasto-sheet');
  if (!form) return;

  const fecha = form.fecha.value;
  const categoria = form.categoria.value;
  const monto = parseFloat(form.monto.value);
  const descripcion = form.descripcion.value.trim();
  const vinculoTipo = form.vinculo_tipo.value;
  const vinculoId = vinculoTipo ? form.vinculo_id.value : '';

  if (!fecha) {
    window.Snackbar.show('La fecha es obligatoria', { type: 'error' });
    return;
  }
  if (!categoria) {
    window.Snackbar.show('Selecciona una categoría', { type: 'error' });
    return;
  }
  if (isNaN(monto) || monto <= 0) {
    window.Snackbar.show('El monto debe ser mayor a 0', { type: 'error' });
    return;
  }

  const payload = {
    fecha,
    categoria,
    descripcion: descripcion || null,
    monto,
    lote_id: vinculoTipo === 'lote' && vinculoId ? vinculoId : null,
    animal_id: vinculoTipo === 'animal' && vinculoId ? vinculoId : null,
    herramienta_id: vinculoTipo === 'herramienta' && vinculoId ? vinculoId : null
  };

  const btn = document.getElementById('btn-save-gasto-sheet');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="material-symbols-outlined animate-spin" style="font-size:18px;">sync</span> Guardando...`;
  }

  try {
    const { error } = await supabase.from('gastos').update(payload).eq('id', id);
    if (error) throw error;

    // Actualizar registro en memoria local para reactividad instantánea
    const idx = _allGastos.findIndex(x => x.id === id);
    if (idx !== -1) {
      _allGastos[idx] = { ..._allGastos[idx], ...payload };
    }

    window.closeEditGastoSheet();
    window.Snackbar.show('Gasto actualizado exitosamente');
    window.clearScreenCache?.('gastos');
    renderDonutAndUI();
  } catch (err) {
    console.error('Error al actualizar gasto:', err);
    window.Snackbar.show('Error: ' + err.message, { type: 'error' });
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span class="material-symbols-outlined" style="font-size:18px;">save</span> Guardar Cambios`;
    }
  }
};

window.changeGastosMonth = function(delta) {
  if (!monthsOrder.length) return;
  currentMonthIdx = (currentMonthIdx + delta + monthsOrder.length) % monthsOrder.length;
  renderDonutAndUI();
};

window.setGastosCategoryFilter = function(catKey) {
  if (activeCategory === catKey && catKey !== 'all') {
    activeCategory = 'all';
  } else {
    activeCategory = catKey;
  }
  renderDonutAndUI();
};

window.cycleGastosCategory = function() {
  const order = ['personal', 'veterinaria', 'insumos', 'all'];
  const next = order[(order.indexOf(activeCategory) + 1) % order.length];
  activeCategory = next;
  renderDonutAndUI();
};

window.toggleActionMenu = (btn) => {
  const menu = btn.nextElementSibling;
  const isActive = menu.classList.contains('active');
  document.querySelectorAll('.action-menu.active').forEach(m => {
    m.classList.remove('active');
    const r = m.closest('.ganado-row');
    if (r) {
      r.classList.remove('menu-open');
      r.style.zIndex = '';
    }
  });
  if (!isActive) {
    menu.classList.add('active');
    const row = btn.closest('.ganado-row');
    if (row) {
      row.classList.add('menu-open');
      row.style.zIndex = '500';
    }
  }
};

window.toggleGastosSplitMenu = (e) => {
  if (e) e.stopPropagation();
  const menu = document.getElementById('gastos-split-menu');
  if (menu) menu.classList.toggle('open');
};

window.shareGastoDirect = function(id) {
  const g = _allGastos.find(x => x.id === id);
  if (!g) return;
  const fechaStr = g.fecha ? new Date(g.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
  const text = `☕ *COMPROBANTE DE GASTO - CAFETAL*\n• *Concepto:* ${g.descripcion || 'Gasto'}\n• *Categoría:* ${g.categoria || 'Gasto'}\n• *Monto:* L ${formatNumber(g.monto)}\n• *Fecha:* ${fechaStr}\n• *Detalle:* ${g.notas || 'Liquidación conforme'}`;
  window.open(`https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`, '_blank');
};

window.confirmDeleteGasto = (id, desc) => {
  window.Snackbar.confirm(
    `¿Eliminar este gasto${desc ? ` (${desc})` : ''}?`,
    async () => {
      const { error } = await supabase.from('gastos').delete().eq('id', id);
      if (error) {
        window.Snackbar.show('Error al eliminar: ' + error.message, { type: 'error' });
      } else {
        window.Snackbar.show('Gasto eliminado correctamente');
        window.clearScreenCache?.('gastos');
        window.navigateTo('gastos');
      }
    },
    null,
    { confirmText: 'Eliminar', cancelText: 'No' }
  );
};

window.aprobarGastoPersonal = async (id) => {
  try {
    const { data: allGastos } = await supabase.from('gastos').select('*').eq('id', id);
    const gasto = Array.isArray(allGastos) ? allGastos[0] : allGastos;
    if (!gasto) return;

    const cleanDesc = (gasto.descripcion || '').replace('[Por Aprobar]', '').replace(/\s{2,}/g, ' ').trim();

    const { error } = await supabase.from('gastos').update({
      descripcion: cleanDesc
    }).eq('id', id);

    if (error) throw error;

    window.Snackbar?.show('✔ Gasto de personal aprobado exitosamente');
    window.clearScreenCache?.('gastos');
    window.navigateTo('gastos');
  } catch (err) {
    console.error('Error aprobando gasto:', err);
    window.Snackbar?.show('Error al aprobar gasto: ' + (err.message || 'Error desconocido'), { type: 'error' });
  }
};

// ─── Render Principal ─────────────────────────────────────────────────────────
export async function renderGastos() {
  const [{ data: all, error }, refs] = await Promise.all([
    supabase.from('gastos').select('*').order('fecha', { ascending: false }),
    fetchRefs()
  ]);

  if (error) {
    console.error('Error fetching gastos:', error);
    return `<div class="screen-gastos" style="padding: 24px; color: red;"><p>Error cargando datos: ${error.message}</p></div>`;
  }

  _allGastos = all || [];
  _refs = refs;
  monthsOrder = buildMonthsOrder(_allGastos);

  // Por defecto en 0 ('Historial Completo') para que TODOS los registros aparezcan de inmediato
  currentMonthIdx = 0;
  activeCategory = 'all';

  return `
    <style>
      /* Bottom Sheet para Editar Gasto en Móvil - Animación suave y pantalla completa */
      .gasto-sheet-scrim {
        position: fixed !important;
        inset: 0 !important;
        background: rgba(0, 0, 0, 0.45) !important;
        backdrop-filter: blur(3px);
        z-index: 99998 !important;
        opacity: 0;
        pointer-events: none;
        transition: opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1), background 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
      }
      .gasto-sheet-scrim.open {
        opacity: 1 !important;
        pointer-events: auto !important;
      }
      .gasto-sheet-scrim.expanded {
        background: rgba(0, 0, 0, 0.65) !important;
      }

      .gasto-m3-sheet {
        position: fixed !important;
        left: 0 !important;
        right: 0 !important;
        bottom: 0 !important;
        margin: 0 auto !important;
        width: 100% !important;
        max-width: 520px !important;
        z-index: 99999 !important;
        background: #ffffff !important;
        border-top-left-radius: 28px !important;
        border-top-right-radius: 28px !important;
        border-top: 1.5px solid rgba(45, 62, 44, 0.16) !important;
        box-shadow: 0 -12px 48px rgba(0, 0, 0, 0.28) !important;
        height: calc(100vh - 20px) !important;
        max-height: calc(100vh - 20px) !important;
        transform: translateY(105%) !important;
        transition: transform 0.45s cubic-bezier(0.16, 1, 0.3, 1), border-radius 0.3s ease !important;
        will-change: transform;
        padding: 6px 18px 32px !important;
        box-sizing: border-box !important;
        overflow-y: auto !important;
        -webkit-overflow-scrolling: touch;
        font-family: 'Plus Jakarta Sans', 'Work Sans', sans-serif !important;
        color: #1e3e2b !important;
        overscroll-behavior: contain;
      }
      .gasto-m3-sheet::-webkit-scrollbar {
        width: 4px;
      }
      .gasto-m3-sheet::-webkit-scrollbar-thumb {
        background: #c0ccc0;
        border-radius: 4px;
      }
      /* Modo Inicial: cubre parte cómoda de la pantalla con subida suave */
      .gasto-m3-sheet.open {
        transform: translateY(50%) !important;
      }
      /* Modo Pantalla Completa: sube hasta el tope suavemente */
      .gasto-m3-sheet.expanded {
        transform: translateY(0) !important;
        border-top-left-radius: 20px !important;
        border-top-right-radius: 20px !important;
        padding-bottom: 45px !important;
      }

      .gasto-sheet-field {
        display: flex;
        flex-direction: column;
        gap: 5px;
        margin-bottom: 14px;
      }
      .gasto-sheet-label {
        font-size: 11.5px;
        font-weight: 700;
        color: #4a5d48;
        text-transform: uppercase;
        letter-spacing: 0.4px;
      }
      .gasto-sheet-input, .gasto-sheet-select {
        width: 100%;
        padding: 11px 13px;
        border-radius: 12px;
        border: 1.5px solid #d0ded0;
        font-size: 14px;
        font-family: inherit;
        color: #1e3e2b;
        background: #fbfdfb;
        box-sizing: border-box;
        outline: none;
        transition: border-color 0.2s, box-shadow 0.2s;
      }
      .gasto-sheet-input:focus, .gasto-sheet-select:focus {
        border-color: #2d3e2c;
        background: #ffffff;
        box-shadow: 0 0 0 3px rgba(45, 62, 44, 0.12);
      }

      .ganado-row.menu-open { z-index: 500 !important; position: relative !important; }
      .ganado-row .action-menu { background: #2d3e2c !important; z-index: 9999 !important; box-shadow: 0 10px 30px rgba(0,0,0,0.4) !important; border: 1px solid rgba(255,255,255,0.15) !important; }
      .ganado-row .action-menu.active { opacity: 1 !important; visibility: visible !important; }
      .ganado-row .action-item { color: #ffffff !important; }
      .ganado-row .action-item:hover { background: #3a5240 !important; }
      .ganado-row .action-item.delete { color: #ffb4ab !important; }
      .ganado-row .action-item.delete:hover { background: rgba(186, 26, 26, 0.35) !important; }

      .screen-gastos .da-tabs-section {
        background: white;
        border-radius: 18px;
        padding: 20px 14px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.03);
        border: 1px solid rgba(0,0,0,0.02);
      }

      @media (max-width: 600px) {
        .screen-gastos .da-tabs-section {
          padding: 14px 8px !important;
        }
      }

      .press-effect {
        transition: transform 0.16s cubic-bezier(0.2, 0, 0, 1), opacity 0.16s ease;
      }
      .press-effect:active {
        transform: scale(0.96);
      }

      .donut-capsule-group {
        transition: opacity 0.28s cubic-bezier(0.2, 0, 0, 1), filter 0.28s ease, transform 0.28s cubic-bezier(0.2, 0, 0, 1);
        transform-origin: 140px 140px;
      }
      .donut-capsule-group:hover {
        transform: scale(1.02);
      }

      /* Tarjeta Principal de la Dona Analítica */
      .gastos-dona-card {
        background: #ffffff !important;
        border-radius: 28px;
        padding: 18px 16px;
        border: 1.5px solid rgba(45, 62, 44, 0.12) !important;
        box-shadow: 0 4px 20px rgba(0, 0, 0, 0.06) !important;
        display: flex;
        flex-direction: column;
        align-items: center;
        position: relative;
        box-sizing: border-box;
        width: 100%;
        margin-bottom: 16px;
      }

      /* Banner Superior de Categoría */
      .gastos-top-banner {
        width: 100%;
        padding: 11px 13px;
        border-radius: 20px;
        display: flex;
        align-items: center;
        justify-content: space-between;
        transition: all 0.28s ease;
        background: #2d3e2c !important;
        border: 1px solid rgba(45, 62, 44, 0.2) !important;
        cursor: pointer;
        box-sizing: border-box;
      }
      .banner-icon-box {
        width: 36px;
        height: 36px;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.16) !important;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #ffffff !important;
        flex-shrink: 0;
      }

      /* Contenedor SVG de la Dona */
      .gastos-donut-box {
        position: relative;
        width: 276px;
        height: 276px;
        margin: 4px auto;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      .gastos-donut-center {
        position: absolute;
        inset: 0;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        pointer-events: none;
        text-align: center;
        padding: 0 24px;
      }

      .gastos-month-btn {
        width: 26px;
        height: 26px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: #7e9384;
        background: transparent;
        border: none;
        cursor: pointer;
        transition: color 0.2s, background 0.2s;
      }
      .gastos-month-btn:hover {
        color: #ffffff;
        background: rgba(255,255,255,0.08);
      }

      /* Píldoras de Leyenda */
      .gastos-pills-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        width: 100%;
        padding-top: 6px;
        overflow-x: auto;
        scrollbar-width: none;
      }
      .gastos-pills-row::-webkit-scrollbar {
        display: none;
      }

      .gastos-pill-btn {
        flex: 1 1 0;
        min-width: 80px;
        padding: 7px 8px;
        border-radius: 9999px;
        border: 1.5px solid #dce5da !important;
        background: #f7faf6 !important;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 6px;
        cursor: pointer;
        transition: all 0.2s;
      }
      .gastos-pill-dot {
        width: 7px;
        height: 7px;
        border-radius: 50%;
        flex-shrink: 0;
      }
      .gastos-pill-text {
        font-size: 11px;
        font-weight: 700;
        color: #2d3e2c !important;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }
    </style>

    <div class="screen-gastos" style="padding-bottom: 100px;">
      <!-- Barra Superior de Búsqueda y Añadir Rápido -->
      <div class="motores-top-actions-container" style="display: flex; justify-content: flex-end; margin: 16px 0 8px;">
        <div class="ganado-split-ctrl ${currentGastosSearchQuery ? 'expanded' : ''}" id="gastos-search-wrapper">
          <button id="gastos-search-toggle" class="m3-icon-btn-tonal" style="margin: 0; box-shadow: none; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;" title="Buscar">
            <span class="material-icons" style="color: #ffffff;">search</span>
          </button>
          <input type="text" id="gastos-search-input" placeholder="Buscar gasto..." value="${currentGastosSearchQuery}" style="border: none; background: transparent; outline: none; font-size: 15px; width: ${currentGastosSearchQuery ? '180px' : '0px'}; transition: width 0.3s; opacity: ${currentGastosSearchQuery ? '1' : '0'}; padding: ${currentGastosSearchQuery ? '0 8px 0 0' : '0'}; color: #ffffff;">
          <button id="gastos-search-clear" style="background: none; border: none; cursor: pointer; display: ${currentGastosSearchQuery ? 'flex' : 'none'}; align-items: center; justify-content: center; padding: 0 16px 0 8px; color: #ffffff; height: 100%;" title="Limpiar búsqueda">
            <span class="material-icons" style="font-size: 20px;">close</span>
          </button>
          <span class="ganado-split-ctrl-sep"></span>
          <button class="ganado-split-ctrl-reg" onclick="window.toggleGastosSplitMenu(event)" title="Más opciones">
            <span class="material-icons">arrow_drop_down</span>
          </button>
          <div class="ganado-split-menu" id="gastos-split-menu">
            <button class="ganado-split-item" onclick="window.navigateTo('nuevo_gasto'); document.getElementById('gastos-split-menu').classList.remove('open');">
              <span class="material-icons">add</span><span>Registrar gasto</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Título de la Página -->
      <div class="herramientas-page-title">
        <h2>Gastos</h2>
      </div>

      <div class="da-tabs-section" style="margin-top: 10px;">
        <!-- 1. TARJETA PRINCIPAL: DONA ANALÍTICA -->
        <section class="gastos-dona-card" style="padding-top: 24px;">
          <!-- Dona SVG con Cápsulas Gruesas y Recorte Entrelazado -->
          <div class="gastos-donut-box">
            <svg id="donut-svg" class="overflow-visible" viewBox="0 0 280 280" style="width: 100%; height: 100%;">
              <defs>
                <filter id="glow-active" x="-25%" y="-25%" width="150%" height="150%">
                  <feDropShadow dx="0" dy="2" stdDeviation="5" flood-color="#000000" flood-opacity="0.15"/>
                </filter>
              </defs>

              <circle cx="140" cy="140" r="104" fill="none" stroke="#eef3ed" stroke-width="28" stroke-linecap="round"></circle>
              <g id="donut-segments-layer"></g>
            </svg>

            <!-- Centro de la Dona -->
            <div class="gastos-donut-center">
              <span style="font-size: 10px; font-family: monospace; font-weight: 800; text-transform: uppercase; letter-spacing: 0.22em; color: #556b5c; margin-bottom: 2px;">
                HNL
              </span>
              <span id="center-total-amount" style="font-size: 26px; font-weight: 800; color: #2d3e2c; letter-spacing: -0.6px; line-height: 1; margin: 2px 0;">
                0.00
              </span>
              <div style="pointer-events: auto; display: inline-flex; align-items: center; gap: 8px; margin-top: 8px; padding: 4px 10px; border-radius: 9999px; background: #f2f6f1; border: 1px solid #dce5da;">
                <button onclick="window.changeGastosMonth(-1)" class="gastos-month-btn press-effect" title="Período anterior">
                  <span class="material-icons" style="font-size: 16px;">chevron_left</span>
                </button>
                <span id="center-month-name" style="font-size: 11px; font-weight: 700; color: #2d3e2c; min-width: 96px; text-align: center; cursor: pointer;" onclick="window.changeGastosMonth(1)">
                  Historial Completo
                </span>
                <button onclick="window.changeGastosMonth(1)" class="gastos-month-btn press-effect" title="Período siguiente">
                  <span class="material-icons" style="font-size: 16px;">chevron_right</span>
                </button>
              </div>
            </div>
          </div>

          <div style="width: 100%; height: 1px; background: #e8efe7; margin: 10px 0 12px;"></div>

          <!-- Píldoras de Leyenda -->
          <div id="gastos-legend-pills" class="gastos-pills-row"></div>
        </section>

        <!-- 2. HISTORIAL DE GASTOS (Filas originales completas de Finca Manager) -->
        <div class="ganado-list-header">
          <div class="ganado-list-title-group">
            <h4>Historial</h4>
            <span class="ganado-count-label" id="gastos-count-label">${_allGastos.length} registros</span>
          </div>
        </div>

        <div class="ganado-list" id="gastos-list-container"></div>
      </div>

      <!-- Bottom Sheet para Editar Gasto en Móvil -->
      <div id="gasto-edit-scrim" class="gasto-sheet-scrim" onclick="window.closeEditGastoSheet()"></div>
      <div id="gasto-edit-sheet" class="gasto-m3-sheet"></div>
    </div>
  `;
}

// ─── Inicialización de Eventos ────────────────────────────────────────────────
export function initGastos() {
  renderDonutAndUI();

  // Búsqueda en vivo
  const searchToggle  = document.getElementById('gastos-search-toggle');
  const searchWrapper = document.getElementById('gastos-search-wrapper');
  const searchInput   = document.getElementById('gastos-search-input');
  const searchClear   = document.getElementById('gastos-search-clear');

  if (searchToggle && searchInput && searchWrapper && searchClear) {
    searchToggle.addEventListener('click', () => {
      if (!searchInput.style.width || searchInput.style.width === '0px') {
        searchInput.style.width = '180px';
        searchInput.style.opacity = '1';
        searchInput.style.padding = '0 8px 0 0';
        searchClear.style.display = 'flex';
        searchWrapper.classList.add('expanded');
        searchInput.focus();
      }
    });

    searchClear.addEventListener('click', () => {
      currentGastosSearchQuery = '';
      searchInput.value = '';
      searchInput.style.width = '0px';
      searchInput.style.opacity = '0';
      searchInput.style.padding = '0';
      searchClear.style.display = 'none';
      searchWrapper.classList.remove('expanded');
      renderDonutAndUI();
    });

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      currentGastosSearchQuery = e.target.value;
      searchTimeout = setTimeout(() => {
        renderDonutAndUI();
      }, 250);
    });
  }

  // Cerrar menú de tres puntos al hacer clic fuera
  const closeMenus = (e) => {
    if (!e.target.closest('.ganado-btn-more')) {
      document.querySelectorAll('.action-menu.active').forEach(m => {
        m.classList.remove('active');
        const r = m.closest('.ganado-row');
        if (r) {
          r.classList.remove('menu-open');
          r.style.zIndex = '';
        }
      });
    }
    const splitMenu = document.getElementById('gastos-split-menu');
    if (splitMenu && !e.target.closest('.ganado-split-ctrl')) {
      splitMenu.classList.remove('open');
    }
  };
  window.removeEventListener('click', closeMenus);
  window.addEventListener('click', closeMenus);
}
