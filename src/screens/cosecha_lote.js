import { restFetch, restInsert } from '../auth.js';
import { showModal, closeModal } from '../modals.js';

const DAYS_SHORT = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB'];
const DAYS_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const MONTHS_FULL = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function fmtIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getMonday(dateObj) {
  const d = new Date(dateObj);
  const dow = d.getDay();
  d.setDate(d.getDate() - dow + (dow === 0 ? -6 : 1));
  d.setHours(0, 0, 0, 0);
  return d;
}

export function formatLatas(val, emptyDash = false) {
  const n = Math.round((Number(val) || 0) * 4) / 4;
  if (n <= 0) return emptyDash ? '–' : '0';
  const whole = Math.floor(n);
  const frac = Math.round((n - whole) * 4);
  const fracStr = frac === 1 ? '¼' : frac === 2 ? '½' : frac === 3 ? '¾' : '';
  if (whole === 0) return fracStr || '0';
  return fracStr ? `${whole} ${fracStr}` : String(whole);
}

function getInitials(nombre) {
  if (!nombre) return '??';
  return nombre.trim().split(/\s+/).map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function getAvatarColor(seed) {
  const colors = ['#2d3e2c', '#2c666e', '#7b4f9e', '#6a1b9a', '#c75b39', '#3b5998', '#455743'];
  if (!seed) return colors[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

function parseCosechaObs(obs) {
  const s = String(obs || '');
  if (!s.startsWith('[COSECHA_JSON]')) return null;
  try {
    return JSON.parse(s.slice('[COSECHA_JSON]'.length));
  } catch (_) {
    return null;
  }
}

export function createCosechaController(lote, containerId = 'dl-cosecha-wrap') {
  const empresaId = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || lote?.empresa_id || '';
  const priceKey = `cosecha_precio_lata_${empresaId || 'default'}`;
  const hiddenKey = `cosecha_hidden_collectors_${empresaId || 'default'}_${lote?.id || 'lote'}`;

  const loadHiddenMap = () => {
    try { return JSON.parse(localStorage.getItem(hiddenKey) || '{}') || {}; } catch (_) { return {}; }
  };
  const saveHiddenMap = (mapObj) => {
    try { localStorage.setItem(hiddenKey, JSON.stringify(mapObj)); } catch (_) {}
  };
  const isHiddenForWeek = (pId, wsIso) => {
    const hMap = loadHiddenMap();
    const fromIso = hMap[String(pId)];
    return Boolean(fromIso && wsIso >= fromIso);
  };

  let currentWeekStart = getMonday(new Date());
  let selectedDateStr = fmtIso(new Date());
  let precioLata = parseFloat(localStorage.getItem(priceKey) || '40') || 40;
  let allPersonal = [];
  let weekRecordsByDate = new Map(); // iso -> { rowId, precio_lata, registros: [{ personal_id, nombre, latas }] }
  let collectorSummaries = [];
  let weekPaidMap = new Map(); // refTag -> { id, monto, descripcion }

  const getWeekDates = () => {
    const arr = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentWeekStart);
      d.setDate(currentWeekStart.getDate() + i);
      arr.push(d);
    }
    return arr;
  };

  const getWeekRangeLabel = () => {
    const days = getWeekDates();
    const s = days[0];
    const e = days[6];
    if (s.getMonth() === e.getMonth()) {
      return `${s.getDate()} – ${e.getDate()} ${MONTHS_SHORT[s.getMonth()]} ${s.getFullYear()}`;
    }
    return `${s.getDate()} ${MONTHS_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTHS_SHORT[e.getMonth()]} ${e.getFullYear()}`;
  };

  const getWeekTitleFull = () => {
    const days = getWeekDates();
    const s = days[0];
    const e = days[6];
    if (s.getMonth() === e.getMonth()) {
      return `Semana ${s.getDate()} - ${e.getDate()} ${MONTHS_FULL[s.getMonth()]} ${s.getFullYear()}`;
    }
    return `Semana ${s.getDate()} ${MONTHS_FULL[s.getMonth()]} - ${e.getDate()} ${MONTHS_FULL[e.getMonth()]} ${e.getFullYear()}`;
  };

  const loadAndRender = async () => {
    const wrap = document.getElementById(containerId);
    if (!wrap) return;
    wrap.innerHTML = `<div style="padding:24px; text-align:center; color:#556b53; font-size:13px; font-weight:600;">Cargando cosecha...</div>`;

    try {
      const days = getWeekDates();
      const wsIso = fmtIso(days[0]);
      const weIso = fmtIso(days[6]);
      const eid = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || lote?.empresa_id || '';

      const [personalRes, appsRes, gastosRes] = await Promise.all([
        restFetch('/rest/v1/personal?order=nombre.asc&select=*').catch(() => []),
        restFetch(`/rest/v1/lote_aplicaciones?lote_id=eq.${encodeURIComponent(lote.id)}&fecha=gte.${wsIso}&fecha=lte.${weIso}&select=*`).catch(() => []),
        restFetch(`/rest/v1/gastos?lote_id=eq.${encodeURIComponent(lote.id)}&categoria=eq.Cosecha&select=id,descripcion,monto`).catch(() => [])
      ]);

      allPersonal = Array.isArray(personalRes) ? personalRes : [];
      const apps = Array.isArray(appsRes) ? appsRes : [];
      const gastos = Array.isArray(gastosRes) ? gastosRes : [];

      weekPaidMap = new Map();
      gastos.forEach(g => {
        const m = String(g.descripcion || '').match(/\[ref:cosecha_[^\]]+\]/g);
        if (m) {
          m.forEach(tag => {
            weekPaidMap.set(tag, {
              id: g.id,
              monto: Number(g.monto) || 0,
              descripcion: g.descripcion || ''
            });
          });
        }
      });

      weekRecordsByDate = new Map();
      apps.forEach(app => {
        const parsed = parseCosechaObs(app.observaciones);
        if (!parsed) return;
        const f = String(app.fecha || '').slice(0, 10);
        if (!f) return;
        if (parsed.precio_lata && !localStorage.getItem(priceKey)) {
          precioLata = Number(parsed.precio_lata) || precioLata;
        }
        weekRecordsByDate.set(f, {
          rowId: app.id,
          precio_lata: Number(parsed.precio_lata) || precioLata,
          registros: Array.isArray(parsed.registros) ? parsed.registros : []
        });
      });

      // Aggregate per day and per collector
      const dayTotals = new Map();
      const colMap = new Map();
      let weekTotalLatas = 0;
      let weekTotalPay = 0;

      days.forEach(d => {
        const iso = fmtIso(d);
        const rec = weekRecordsByDate.get(iso);
        let dLatas = 0;
        if (rec) {
          const pPrice = rec.precio_lata || precioLata;
          rec.registros.forEach(r => {
            const l = Number(r.latas) || 0;
            if (l <= 0) return;
            dLatas += l;
            weekTotalLatas += l;
            const pay = Math.round(l * pPrice);
            weekTotalPay += pay;

            const key = String(r.personal_id || r.nombre);
            if (!colMap.has(key)) {
              colMap.set(key, {
                personal_id: r.personal_id,
                nombre: r.nombre || 'Colaborador',
                latas: 0,
                pay: 0,
                days: []
              });
            }
            const entry = colMap.get(key);
            entry.latas += l;
            entry.pay += pay;
            entry.days.push({ iso, dateObj: d, latas: l, pay, precio: pPrice });
          });
        }
        dayTotals.set(iso, dLatas);
      });

      // Asegurar que todo el personal activo para esta semana aparezca en la lista
      // (quienes fueron ocultados desde wsIso o antes solo salen si ya tienen latas registradas esa semana)
      allPersonal.forEach(p => {
        const key = String(p.id);
        if (!colMap.has(key) && !isHiddenForWeek(key, wsIso)) {
          colMap.set(key, {
            personal_id: p.id,
            nombre: p.nombre || 'Colaborador',
            latas: 0,
            pay: 0,
            days: []
          });
        }
      });

      collectorSummaries = Array.from(colMap.values()).sort((a, b) => {
        if (b.latas !== a.latas) return b.latas - a.latas;
        return String(a.nombre || '').localeCompare(String(b.nombre || ''));
      });

      const todayIso = fmtIso(new Date());
      if (selectedDateStr < wsIso || selectedDateStr > weIso) {
        selectedDateStr = (todayIso >= wsIso && todayIso <= weIso) ? todayIso : wsIso;
      }

      const hasAnyWeekPay = collectorSummaries.some(c => c.pay > 0);
      const hasAnyPaidInWeek = collectorSummaries.some(col => {
        const refTag = `[ref:cosecha_${lote.id}_${col.personal_id || col.nombre}_${wsIso}]`;
        return weekPaidMap.has(refTag);
      });
      const newWeekCols = collectorSummaries.filter(col => {
        const refTag = `[ref:cosecha_${lote.id}_${col.personal_id || col.nombre}_${wsIso}]`;
        return col.pay > 0 && !weekPaidMap.has(refTag);
      });
      const changedWeekCols = collectorSummaries.filter(col => {
        const refTag = `[ref:cosecha_${lote.id}_${col.personal_id || col.nombre}_${wsIso}]`;
        const paid = weekPaidMap.get(refTag);
        return Boolean(paid && Math.round(paid.monto) !== Math.round(col.pay));
      });
      const allWeekSent = hasAnyWeekPay && newWeekCols.length === 0 && changedWeekCols.length === 0;
      const weekNeedsUpdate = hasAnyPaidInWeek && (changedWeekCols.length > 0 || newWeekCols.length > 0);
      const weekPaidTotal = collectorSummaries.reduce((sum, col) => {
        const refTag = `[ref:cosecha_${lote.id}_${col.personal_id || col.nombre}_${wsIso}]`;
        const paid = weekPaidMap.get(refTag);
        return sum + (paid ? Math.round(paid.monto) : 0);
      }, 0);

      const syncCosechaFooterLabel = () => {
        const regBtn = document.getElementById('lote-footer-cos-register');
        if (regBtn) {
          if (selectedDateStr === todayIso) {
            regBtn.textContent = '+ Registrar hoy';
          } else {
            const sp = selectedDateStr.split('-').map(Number);
            regBtn.textContent = `+ Registrar ${sp[2]} ${MONTHS_SHORT[(sp[1] || 1) - 1] || ''}`;
          }
        }
        const gastosBtn = document.getElementById('lote-footer-cos-gastos');
        if (gastosBtn) {
          if (allWeekSent) {
            gastosBtn.disabled = true;
            gastosBtn.textContent = '✓ Enviado a Cuentas';
            gastosBtn.style.background = '#eff4ed';
            gastosBtn.style.borderColor = '#c7d6c3';
            gastosBtn.style.color = '#1b6e1b';
            gastosBtn.style.cursor = 'not-allowed';
          } else if (weekNeedsUpdate) {
            gastosBtn.disabled = false;
            gastosBtn.textContent = 'Actualizar en Cuentas';
            gastosBtn.style.background = '#fff4ed';
            gastosBtn.style.borderColor = '#b34200';
            gastosBtn.style.color = '#b34200';
            gastosBtn.style.cursor = 'pointer';
          } else {
            gastosBtn.disabled = false;
            gastosBtn.textContent = 'Enviar a Cuentas';
            gastosBtn.style.background = '#ffffff';
            gastosBtn.style.borderColor = '#2d3e2c';
            gastosBtn.style.color = '#2d3e2c';
            gastosBtn.style.cursor = 'pointer';
          }
        }
      };
      syncCosechaFooterLabel();

      const selDayRec = weekRecordsByDate.get(selectedDateStr);
      const selDayPrice = selDayRec?.precio_lata || precioLata;
      const selDayLatasMap = new Map();
      (selDayRec?.registros || []).forEach(r => {
        selDayLatasMap.set(String(r.personal_id || r.nombre), Number(r.latas) || 0);
      });
      const selParts = selectedDateStr.split('-').map(Number);
      const selDateObj = new Date(selParts[0], (selParts[1] || 1) - 1, selParts[2] || 1);
      const selDayLabel = `${DAYS_SHORT[selDateObj.getDay()]} ${selDateObj.getDate()} ${MONTHS_SHORT[selDateObj.getMonth()]}`;

      collectorSummaries.sort((a, b) => {
        const la = selDayLatasMap.get(String(a.personal_id || a.nombre)) || 0;
        const lb = selDayLatasMap.get(String(b.personal_id || b.nombre)) || 0;
        if (lb !== la) return lb - la;
        return String(a.nombre || '').localeCompare(String(b.nombre || ''));
      });

      wrap.innerHTML = `
        <!-- Navegación semanal -->
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:10px; padding:0 4px;">
          <button type="button" id="cos-prev-week" aria-label="Semana anterior" style="width:34px; height:34px; border-radius:50%; border:1px solid #d5e2d2; background:#f4f7f3; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer;">
            <span class="material-symbols-outlined" style="font-size:19px;">chevron_left</span>
          </button>
          <span style="font-size:14px; font-weight:800; color:#111827;">${escapeHtml(getWeekRangeLabel())}</span>
          <button type="button" id="cos-next-week" aria-label="Semana siguiente" style="width:34px; height:34px; border-radius:50%; border:1px solid #d5e2d2; background:#f4f7f3; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer;">
            <span class="material-symbols-outlined" style="font-size:19px;">chevron_right</span>
          </button>
        </div>

        <!-- Franja de 7 días -->
        <div style="display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:5px; margin-bottom:8px;">
          ${days.map(d => {
            const iso = fmtIso(d);
            const isSel = iso === selectedDateStr;
            const isToday = iso === todayIso;
            const latas = dayTotals.get(iso) || 0;
            const dayNumColor = isToday ? '#f97316' : (isSel ? '#ffffff' : '#111827');
            return `
              <button type="button" class="cos-day-pill" data-iso="${iso}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:8px 2px; border-radius:14px; border:none; background:${isSel ? '#2d3e2c' : '#f4f7f3'}; color:${isSel ? '#ffffff' : '#111827'}; cursor:pointer; font-family:'Work Sans',sans-serif;">
                <span style="font-size:10px; font-weight:700; opacity:${isSel ? '0.85' : '0.6'};">${DAYS_SHORT[d.getDay()]}</span>
                <span style="font-size:14px; font-weight:800; margin:2px 0; color:${dayNumColor};">${d.getDate()}</span>
                <span style="font-size:10.5px; font-weight:700; color:${isSel ? '#e5f3e4' : (latas > 0 ? '#1b6e1b' : '#8a9988')}; white-space:nowrap;">${formatLatas(latas, true)}</span>
              </button>
            `;
          }).join('')}
        </div>

        <!-- Tarjeta Resumen Semanal -->
        <div style="background:#f2f5f0; border-radius:16px; padding:12px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:16px;">
          <div>
            <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
              <span style="font-size:11.5px; color:#5a6b58; font-weight:600;">Total de la semana</span>
              ${allWeekSent
                ? `<span style="display:inline-flex; align-items:center; gap:2px; background:#e2f2e0; color:#1b6e1b; font-size:10px; font-weight:800; padding:2px 7px; border-radius:999px;">✓ Pagado</span>`
                : (weekNeedsUpdate
                  ? `<span style="display:inline-flex; align-items:center; gap:2px; background:#ffede1; color:#b34200; font-size:10px; font-weight:800; padding:2px 7px; border-radius:999px;">↻ Por actualizar</span>`
                  : '')}
            </div>
            <div style="font-size:20px; font-weight:800; color:#111827; margin-top:2px;">${formatLatas(weekTotalLatas)} latas</div>
          </div>
          <div style="text-align:right;">
            <button type="button" id="cos-edit-price-btn" style="background:none; border:none; padding:0; font-size:11.5px; color:#5a6b58; font-weight:600; cursor:pointer; display:inline-flex; align-items:center; gap:3px;">
              <span>L${precioLata.toLocaleString('es-HN')} por lata · ${weekNeedsUpdate ? 'Actualizar' : 'A pagar'}</span>
            </button>
            ${weekNeedsUpdate ? `
              <div style="display:flex; align-items:baseline; justify-content:flex-end; gap:6px; margin-top:2px; flex-wrap:wrap;">
                <span style="font-size:13px; font-weight:700; color:#6b7280; text-decoration:line-through;">L ${weekPaidTotal.toLocaleString('es-HN')}</span>
                <span style="font-size:13px; font-weight:700; color:#5a6b58;">→</span>
                <span style="font-size:20px; font-weight:800; color:#b34200;">L ${weekTotalPay.toLocaleString('es-HN')}</span>
              </div>
            ` : `
              <div style="font-size:20px; font-weight:800; color:#b34200; margin-top:2px;">L ${weekTotalPay.toLocaleString('es-HN')}</div>
            `}
          </div>
        </div>

        <!-- Por Recolector -->
        <div>
          <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.6px; color:#4a5d48; margin-bottom:8px;">
            Por recolector · Toca para ver
          </div>
          ${collectorSummaries.length > 0 ? collectorSummaries.map((col, idx) => {
            const refTag = `[ref:cosecha_${lote.id}_${col.personal_id || col.nombre}_${wsIso}]`;
            const paidInfo = weekPaidMap.get(refTag);
            const isSentSynced = Boolean(paidInfo && Math.round(paidInfo.monto) === Math.round(col.pay));
            const isSentChanged = Boolean(paidInfo && Math.round(paidInfo.monto) !== Math.round(col.pay));
            const statusHtml = isSentSynced
              ? ' · <span style="color:#1b6e1b;font-weight:700;">✔ Pagado</span>'
              : (isSentChanged ? ' · <span style="color:#b34200;font-weight:700;">↻ Por actualizar</span>' : '');
            const dayLatas = selDayLatasMap.get(String(col.personal_id || col.nombre)) || 0;
            const dayPay = Math.round(dayLatas * selDayPrice);
            return `
              <div class="cos-col-swipe-wrap" data-idx="${idx}" data-pid="${escapeHtml(String(col.personal_id || col.nombre))}" style="position:relative; overflow:hidden; border-radius:16px; margin-bottom:8px;">
                <div class="cos-col-swipe-bg" style="position:absolute; inset:0; background:transparent; display:flex; align-items:center; padding:0 18px; pointer-events:none;">
                  <div class="cos-col-swipe-del" style="color:#ffffff; display:flex; align-items:center; gap:6px; font-size:12.5px; font-weight:700; opacity:0;">
                    <span class="material-symbols-outlined" style="font-size:18px;">person_remove</span>
                    <span>Quitar de lista</span>
                  </div>
                </div>
                <div class="cos-col-card" data-idx="${idx}" style="position:relative; z-index:2; background:#f5f7f3; border-radius:16px; padding:11px 14px; cursor:pointer; touch-action:pan-y; user-select:none; -webkit-user-select:none; transition:transform .18s ease;">
                  <div style="display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <div style="display:flex; align-items:center; gap:12px; min-width:0; flex:1;">
                      <div style="width:40px; height:40px; border-radius:50%; background:${getAvatarColor(col.nombre)}; color:#ffffff; font-size:14px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                        ${escapeHtml(getInitials(col.nombre))}
                      </div>
                      <div style="min-width:0; flex:1;">
                        <div style="font-size:13.5px; font-weight:700; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(col.nombre)}</div>
                        <div style="font-size:12px; color:#5a6b58; margin-top:1px;">
                          ${formatLatas(dayLatas)} latas · ${escapeHtml(selDayLabel)}${statusHtml}
                        </div>
                      </div>
                    </div>
                    <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                      <span style="font-size:14.5px; font-weight:800; color:${dayPay > 0 ? '#b34200' : '#6b7280'};">L ${dayPay.toLocaleString('es-HN')}</span>
                      <span class="material-symbols-outlined" style="font-size:18px; color:#5a6b58;">chevron_right</span>
                    </div>
                  </div>
                </div>
              </div>
            `;
          }).join('') : `
            <div style="padding:24px 12px; text-align:center; color:#6b7280; font-size:13px; background:#f5f7f3; border-radius:14px;">
              No hay colaboradores activos en esta semana.
            </div>
          `}
          <button type="button" id="cos-main-add-worker-btn" style="width:100%; height:42px; margin-top:4px; border-radius:999px; border:1.5px dashed #b5c7b2; background:#ffffff; color:#2d3e2c; font-family:'Work Sans',sans-serif; font-size:13px; font-weight:700; cursor:pointer;">
            + Agregar recolector
          </button>
        </div>
      `;

      document.getElementById('cos-prev-week')?.addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        loadAndRender();
      });
      document.getElementById('cos-next-week')?.addEventListener('click', () => {
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        loadAndRender();
      });

      document.getElementById('cos-edit-price-btn')?.addEventListener('click', () => {
        showModal('Precio por lata', `
          <div style="display:flex; flex-direction:column; gap:14px;">
            <div style="font-size:13px; color:#5a6b58;">Define cuánto se paga por cada lata cortada en este lote.</div>
            <div class="m3-field" style="margin-bottom:0;">
              <input type="number" id="cos-price-sheet-inp" value="${precioLata}" step="1" min="1" inputmode="decimal" placeholder=" " style="font-size:16px; font-weight:800; color:#b34200; background:#ffffff;">
              <label for="cos-price-sheet-inp" style="background:#ffffff;">Precio por lata (L)</label>
            </div>
            <div id="cos-price-sheet-err" style="display:none; font-size:11.5px; font-weight:600; color:#ba1a1a; padding-left:12px;"></div>
            <div style="display:grid; grid-template-columns:1fr 1.5fr; gap:10px; margin-top:4px;">
              <button type="button" id="cos-price-sheet-cancel" style="height:44px; border-radius:999px; border:1px solid #d5e2d2; background:#ffffff; color:#2d3e2c; font-size:14px; font-weight:700; cursor:pointer;">Cancelar</button>
              <button type="button" id="cos-price-sheet-save" style="height:44px; border-radius:999px; border:none; background:#2d3e2c; color:#ffffff; font-size:14px; font-weight:700; cursor:pointer;">Guardar precio</button>
            </div>
          </div>
        `);
        const inp = document.getElementById('cos-price-sheet-inp');
        const errEl = document.getElementById('cos-price-sheet-err');
        document.getElementById('cos-price-sheet-cancel')?.addEventListener('click', () => closeModal());
        document.getElementById('cos-price-sheet-save')?.addEventListener('click', () => {
          const num = parseFloat(inp?.value || '');
          if (isNaN(num) || num <= 0) {
            if (errEl) {
              errEl.textContent = 'Ingresa un precio mayor a 0';
              errEl.style.display = 'block';
            }
            inp?.focus();
            return;
          }
          precioLata = num;
          localStorage.setItem(priceKey, String(num));
          closeModal();
          loadAndRender();
        });
      });

      wrap.querySelectorAll('.cos-day-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          selectedDateStr = btn.dataset.iso;
          loadAndRender();
        });
      });

      wrap.querySelectorAll('.cos-col-swipe-wrap').forEach(sw => {
        const card = sw.querySelector('.cos-col-card');
        const bg = sw.querySelector('.cos-col-swipe-bg');
        const delLbl = sw.querySelector('.cos-col-swipe-del');
        const idx = parseInt(sw.dataset.idx, 10);
        const col = collectorSummaries[idx];
        if (!card || !col) return;

        let startX = 0, startY = 0, dx = 0, dragging = false, locked = null, moved = false;

        const onStart = (x, y) => {
          startX = x; startY = y; dx = 0; dragging = true; locked = null; moved = false;
          card.style.transition = 'none';
        };
        const onMove = (x, y, ev) => {
          if (!dragging) return;
          const mx = x - startX;
          const my = y - startY;
          if (!locked) {
            if (mx > 10 && Math.abs(mx) > Math.abs(my)) locked = 'x';
            else if (Math.abs(my) > 10 || mx < -10) { locked = 'y'; dragging = false; return; }
            else return;
          }
          if (ev && ev.cancelable) ev.preventDefault();
          if (ev) ev.stopPropagation();
          moved = true;
          const maxW = sw.offsetWidth || 320;
          dx = Math.max(0, Math.min(maxW, mx));
          card.style.transform = `translateX(${dx}px)`;
          if (bg) bg.style.background = dx > 6 ? '#ba1a1a' : 'transparent';
          if (delLbl) delLbl.style.opacity = dx > 16 ? '1' : '0';
        };
        const onEnd = () => {
          if (!dragging) return;
          dragging = false;
          card.style.transition = 'transform .2s ease';
          card.style.transform = 'translateX(0)';
          if (bg) bg.style.background = 'transparent';
          if (delLbl) delLbl.style.opacity = '0';

          if (dx >= 60) {
            if (col.latas > 0) {
              window.Snackbar?.show(`${col.nombre} ya tiene latas esta semana. Quítalas primero o ocúltalo la próxima semana.`);
              dx = 0;
              return;
            }
            window.Snackbar?.confirm(
              `¿Quitar a <b>${escapeHtml(col.nombre)}</b> de esta semana y las futuras? Sus semanas anteriores no se borrarán.`,
              () => {
                const hMap = loadHiddenMap();
                hMap[String(col.personal_id || col.nombre)] = wsIso;
                saveHiddenMap(hMap);
                window.Snackbar?.show(`${col.nombre} quitado de la lista`);
                loadAndRender();
              },
              () => {},
              { confirmText: 'Quitar', cancelText: 'Cancelar' }
            );
          }
          dx = 0;
        };

        sw.addEventListener('touchstart', (e) => {
          e.stopPropagation();
          const t = e.touches[0];
          if (t) onStart(t.clientX, t.clientY);
        }, { passive: true });
        sw.addEventListener('touchmove', (e) => {
          const t = e.touches[0];
          if (t) onMove(t.clientX, t.clientY, e);
        }, { passive: false });
        sw.addEventListener('touchend', onEnd, { passive: true });
        sw.addEventListener('touchcancel', onEnd, { passive: true });

        sw.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          onStart(e.clientX, e.clientY);
          const moveH = (me) => onMove(me.clientX, me.clientY, me);
          const upH = () => {
            window.removeEventListener('mousemove', moveH);
            window.removeEventListener('mouseup', upH);
            onEnd();
          };
          window.addEventListener('mousemove', moveH);
          window.addEventListener('mouseup', upH);
        });

        card.addEventListener('click', () => {
          if (moved) { moved = false; return; }
          openCollectorDetailModal(col);
        });
      });

      document.getElementById('cos-main-add-worker-btn')?.addEventListener('click', () => {
        openAddCollectorSheet(wsIso);
      });
    } catch (err) {
      wrap.innerHTML = `<div style="padding:20px; text-align:center; color:#ba1a1a; font-size:13px;">Error cargando cosecha: ${escapeHtml(err.message)}</div>`;
    }
  };

  const openAddCollectorSheet = (wsIso) => {
    const hMap = loadHiddenMap();
    const hiddenWorkers = allPersonal.filter(p => {
      const fromIso = hMap[String(p.id)];
      return Boolean(fromIso && wsIso >= fromIso);
    });

    showModal('Agregar recolector', `
      <div style="display:flex; flex-direction:column; gap:16px;">
        ${hiddenWorkers.length > 0 ? `
          <div>
            <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; color:#5a6b58; margin-bottom:8px;">
              Reactivar colaborador anterior
            </div>
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${hiddenWorkers.map(p => `
                <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; background:#f5f7f3; border-radius:14px; padding:10px 12px;">
                  <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
                    <div style="width:36px; height:36px; border-radius:50%; background:${getAvatarColor(p.nombre)}; color:#ffffff; font-size:12.5px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                      ${escapeHtml(getInitials(p.nombre))}
                    </div>
                    <span style="font-size:13.5px; font-weight:700; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(p.nombre)}</span>
                  </div>
                  <button type="button" class="cos-reactivate-btn" data-pid="${escapeHtml(String(p.id))}" data-name="${escapeHtml(p.nombre)}" style="height:32px; padding:0 12px; border-radius:999px; border:none; background:#1b6e1b; color:#ffffff; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap;">
                    + Reactivar
                  </button>
                </div>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div>
          <div style="font-size:11px; font-weight:800; text-transform:uppercase; letter-spacing:0.5px; color:#5a6b58; margin-bottom:8px;">
            Registrar nuevo recolector
          </div>
          <div class="m3-field" style="margin-bottom:0;">
            <input type="text" id="cos-new-worker-name" placeholder=" " style="font-size:14px; font-weight:600; background:#ffffff;">
            <label for="cos-new-worker-name" style="background:#ffffff;">Nombre completo</label>
          </div>
          <div id="cos-new-worker-err" style="display:none; font-size:11.5px; font-weight:600; color:#ba1a1a; margin-top:4px; padding-left:12px;"></div>
          <div style="display:grid; grid-template-columns:1fr 1.5fr; gap:10px; margin-top:12px;">
            <button type="button" id="cos-add-sheet-cancel" style="height:44px; border-radius:999px; border:1px solid #d5e2d2; background:#ffffff; color:#2d3e2c; font-size:14px; font-weight:700; cursor:pointer;">Cancelar</button>
            <button type="button" id="cos-add-sheet-save" style="height:44px; border-radius:999px; border:none; background:#2d3e2c; color:#ffffff; font-size:14px; font-weight:700; cursor:pointer;">Agregar</button>
          </div>
        </div>
      </div>
    `);

    document.querySelectorAll('.cos-reactivate-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const pid = btn.dataset.pid;
        const name = btn.dataset.name;
        const mapObj = loadHiddenMap();
        delete mapObj[String(pid)];
        saveHiddenMap(mapObj);
        closeModal();
        window.Snackbar?.show(`✔ ${name} reactivado en la lista`);
        loadAndRender();
      });
    });

    document.getElementById('cos-add-sheet-cancel')?.addEventListener('click', () => closeModal());
    document.getElementById('cos-add-sheet-save')?.addEventListener('click', async () => {
      const inp = document.getElementById('cos-new-worker-name');
      const errEl = document.getElementById('cos-new-worker-err');
      const saveBtn = document.getElementById('cos-add-sheet-save');
      const nombre = String(inp?.value || '').trim();
      if (!nombre) {
        if (errEl) {
          errEl.textContent = 'Ingresa el nombre del recolector';
          errEl.style.display = 'block';
        }
        inp?.focus();
        return;
      }
      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';
      }
      try {
        const eid = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || lote?.empresa_id || '';
        await restInsert('/rest/v1/personal', {
          empresa_id: eid,
          nombre,
          iniciales: getInitials(nombre),
          rol: 'Recolector',
          pago_diario: 0
        });
        window.clearScreenCache?.('personal');
        closeModal();
        window.Snackbar?.show(`✔ ${nombre} agregado al equipo`);
        await loadAndRender();
      } catch (err) {
        window.Snackbar?.show('Error agregando recolector: ' + (err.message || err), { type: 'error' });
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Agregar';
        }
      }
    });
  };

  const openCollectorDetailModal = (colObj) => {
    const colKey = String(colObj.personal_id || colObj.nombre);
    const days = getWeekDates();
    const wsIso = fmtIso(days[0]);
    const col = collectorSummaries.find(c => String(c.personal_id || c.nombre) === colKey) || colObj;
    const refTag = `[ref:cosecha_${lote.id}_${colKey}_${wsIso}]`;
    const paidInfo = weekPaidMap.get(refTag) || null;

    const initialDayMap = new Map();
    const editDayMap = new Map();
    days.forEach(d => {
      const iso = fmtIso(d);
      const found = (col.days || []).find(dy => dy.iso === iso);
      const val = Number(found?.latas) || 0;
      initialDayMap.set(iso, val);
      editDayMap.set(iso, val);
    });

    let editingDayIso = null;
    let isDirty = false;

    const persistEditedDays = async () => {
      const eid = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || lote?.empresa_id || '';
      for (const d of days) {
        const iso = fmtIso(d);
        const newVal = editDayMap.get(iso) || 0;
        const prevVal = initialDayMap.get(iso) || 0;
        if (Math.abs(newVal - prevVal) < 0.001) continue;

        const existing = weekRecordsByDate.get(iso);
        const prevRegs = existing?.registros ? [...existing.registros] : [];
        const idx = prevRegs.findIndex(r =>
          String(r.personal_id || r.nombre) === colKey ||
          String(r.nombre || '').trim().toLowerCase() === String(col.nombre || '').trim().toLowerCase()
        );
        if (newVal > 0) {
          const entry = { personal_id: col.personal_id || colKey, nombre: col.nombre, latas: newVal };
          if (idx !== -1) prevRegs[idx] = { ...prevRegs[idx], ...entry };
          else prevRegs.push(entry);
        } else if (idx !== -1) {
          prevRegs.splice(idx, 1);
        }

        const dayTotal = prevRegs.reduce((s, r) => s + (Number(r.latas) || 0), 0);
        const dayPrice = existing?.precio_lata || precioLata;
        const aplPayload = {
          empresa_id: eid,
          lote_id: lote.id,
          fecha: iso,
          tipo: 'Cosecha',
          metodo: 'Corte manual',
          producto: 'Corte de café',
          dosis: `${formatLatas(dayTotal)} latas`,
          operador: prevRegs.map(r => r.nombre).join(', '),
          personal_ids: prevRegs.map(r => r.personal_id).filter(id => id && !String(id).startsWith('extra_')),
          estado: 'Aplicada',
          observaciones: '[COSECHA_JSON]' + JSON.stringify({ precio_lata: dayPrice, registros: prevRegs })
        };
        if (existing?.rowId) {
          await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${encodeURIComponent(existing.rowId)}`, {
            method: 'PATCH',
            body: JSON.stringify(aplPayload)
          });
        } else if (prevRegs.length > 0) {
          await restInsert('/rest/v1/lote_aplicaciones', aplPayload);
        }
      }
    };

    const renderModal = () => {
      const totalLatas = days.reduce((s, d) => s + (editDayMap.get(fmtIso(d)) || 0), 0);
      const totalPay = days.reduce((s, d) => {
        const iso = fmtIso(d);
        const l = editDayMap.get(iso) || 0;
        const p = weekRecordsByDate.get(iso)?.precio_lata || precioLata;
        return s + Math.round(l * p);
      }, 0);
      const maxDayLatas = Math.max(1, ...days.map(d => editDayMap.get(fmtIso(d)) || 0));
      const paidMonto = paidInfo ? Math.round(paidInfo.monto) : null;
      const needsUpdate = Boolean(paidInfo && (paidMonto !== Math.round(totalPay) || isDirty));

      showModal('', `
        <div style="display:flex; flex-direction:column; gap:12px;">
          <!-- Navegación semanal -->
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:0 8px;">
            <button type="button" id="cos-col-prev-w" aria-label="Semana anterior" style="width:36px; height:36px; border-radius:50%; border:none; background:#eff4ed; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer;">
              <span class="material-symbols-outlined" style="font-size:20px;">chevron_left</span>
            </button>
            <span style="font-size:14px; font-weight:800; color:#111827;">${escapeHtml(getWeekRangeLabel())}</span>
            <button type="button" id="cos-col-next-w" aria-label="Semana siguiente" style="width:36px; height:36px; border-radius:50%; border:none; background:#eff4ed; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer;">
              <span class="material-symbols-outlined" style="font-size:20px;">chevron_right</span>
            </button>
          </div>

          <!-- Tarjeta Resumen del Recolector -->
          <div style="background:#f3f5f1; border-radius:16px; padding:12px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
            <div>
              <div style="font-size:11.5px; color:#5a6b58; font-weight:600;">Recolectó en la semana</div>
              <div style="font-size:20px; font-weight:800; color:#111827; margin-top:2px;">${formatLatas(totalLatas)} ${totalLatas === 1 ? 'lata' : 'latas'}</div>
            </div>
            <div style="text-align:right;">
              <div style="font-size:11.5px; color:#5a6b58; font-weight:600;">${formatLatas(totalLatas)} × L${precioLata.toLocaleString('es-HN')} · ${paidInfo ? (needsUpdate ? `En Cuentas: L ${paidMonto.toLocaleString('es-HN')}` : 'En Cuentas') : 'Por pagar'}</div>
              <div style="font-size:20px; font-weight:800; color:${totalPay > 0 ? '#b34200' : '#1b6e1b'}; margin-top:2px;">L ${totalPay.toLocaleString('es-HN')}</div>
            </div>
          </div>

          <div style="font-size:10.5px; font-weight:700; text-transform:uppercase; letter-spacing:0.5px; color:#5a6b58;">
            Toca cualquier día para editar las latas
          </div>

          <!-- Desglose diario con barras y edición inline -->
          <div style="display:flex; flex-direction:column;">
            ${days.map((d, i) => {
              const iso = fmtIso(d);
              const l = editDayMap.get(iso) || 0;
              const pct = l > 0 ? Math.max(8, Math.round((l / maxDayLatas) * 100)) : 0;
              const isEd = editingDayIso === iso;
              const whole = Math.floor(l);
              const frac = Math.round((l - whole) * 4) / 4;
              return `
                <div style="${i < 6 ? 'border-bottom:1px solid #f0f3ef;' : ''} padding:9px 2px;">
                  <div class="cos-col-day-row" data-iso="${iso}" style="display:flex; align-items:center; gap:12px; cursor:pointer; user-select:none;">
                    <span style="font-size:12px; font-weight:700; color:#4a5d48; width:52px; flex-shrink:0;">${DAYS_SHORT[d.getDay()]} ${d.getDate()}</span>
                    <div style="flex:1; height:7px; background:#e7ece5; border-radius:999px; overflow:hidden;">
                      ${pct > 0 ? `<div style="width:${pct}%; height:100%; background:#2e7d32; border-radius:999px;"></div>` : ''}
                    </div>
                    <span style="font-size:13px; font-weight:800; color:${l > 0 ? '#111827' : '#9ca3af'}; width:70px; text-align:right; flex-shrink:0; white-space:nowrap;">${l > 0 ? `${formatLatas(l)} ${l === 1 ? 'lata' : 'latas'}` : '–'}</span>
                  </div>
                  ${isEd ? `
                    <div style="margin-top:9px; background:#f4f7f3; border:1px solid #d5e2d2; border-radius:14px; padding:10px 12px;">
                      <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                        <span style="font-size:11.5px; font-weight:700; color:#4a5d48;">Latas completas</span>
                        <div style="display:flex; align-items:center; gap:12px;">
                          <button type="button" class="cos-col-dec" data-iso="${iso}" style="width:34px; height:34px; border-radius:50%; border:1.5px solid #b5c7b2; background:#ffffff; color:#2d3e2c; font-size:19px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center;">−</button>
                          <span style="font-size:19px; font-weight:800; color:#111827; min-width:24px; text-align:center;">${whole}</span>
                          <button type="button" class="cos-col-inc" data-iso="${iso}" style="width:34px; height:34px; border-radius:50%; border:none; background:#2d3e2c; color:#ffffff; font-size:19px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center;">+</button>
                        </div>
                      </div>
                      <div style="display:grid; grid-template-columns:repeat(4,1fr); gap:6px;">
                        ${[{ v: 0, l: '0' }, { v: 0.25, l: '¼' }, { v: 0.5, l: '½' }, { v: 0.75, l: '¾' }].map(f => {
                          const act = Math.abs(frac - f.v) < 0.01;
                          return `<button type="button" class="cos-col-frac" data-iso="${iso}" data-frac="${f.v}" style="height:32px; border-radius:999px; border:1px solid ${act ? '#2d3e2c' : '#d5e2d2'}; background:${act ? '#2d3e2c' : '#ffffff'}; color:${act ? '#ffffff' : '#111827'}; font-size:13px; font-weight:700; cursor:pointer;">${f.l}</button>`;
                        }).join('')}
                      </div>
                    </div>
                  ` : ''}
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `);

      const modalHeader = document.querySelector('#modal-body .modal-header');
      if (modalHeader) {
        modalHeader.style.marginBottom = '10px';
        modalHeader.style.paddingBottom = '6px';
        const h3 = modalHeader.querySelector('h3');
        if (h3) {
          h3.style.margin = '0';
          h3.style.flex = '1';
          h3.style.minWidth = '0';
          h3.innerHTML = `
            <div style="display:flex; align-items:center; gap:12px; min-width:0;">
              <div style="width:42px; height:42px; border-radius:50%; background:${getAvatarColor(col.nombre)}; color:#ffffff; font-size:14.5px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                ${escapeHtml(getInitials(col.nombre))}
              </div>
              <div style="min-width:0; flex:1;">
                <div style="font-size:16px; font-weight:800; color:#111827; line-height:1.2; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(col.nombre)}</div>
                <div style="font-size:12px; font-weight:500; color:#5a6b58; margin-top:2px;">Cosecha · ${escapeHtml(String(lote.nombre || '').replace(/\bcafe\b/gi, 'Café'))}</div>
              </div>
            </div>
          `;
        }
      }

      const modalBodyEl = document.getElementById('modal-body');
      if (modalBodyEl) {
        const footerDiv = document.createElement('div');
        footerDiv.style.cssText = 'flex-shrink:0; background:#ffffff; padding:12px 0 4px; border-top:1px solid #eef2ee;';
        if (paidInfo && needsUpdate) {
          footerDiv.innerHTML = `
            <button type="button" id="cos-col-update-btn" style="width:100%; height:44px; border-radius:999px; border:none; background:#b34200; color:#ffffff; font-size:13.5px; font-weight:700; cursor:pointer;">
              Actualizar en Cuentas (L ${paidMonto.toLocaleString('es-HN')} → L ${totalPay.toLocaleString('es-HN')})
            </button>
          `;
        } else if (paidInfo) {
          footerDiv.innerHTML = `
            <button type="button" disabled style="width:100%; height:44px; border-radius:999px; border:1px solid #d5e2d2; background:#eff4ed; color:#1b6e1b; font-size:14px; font-weight:700;">
              ✔ Ya enviado a Cuentas · L ${totalPay.toLocaleString('es-HN')}
            </button>
          `;
        } else if (isDirty) {
          footerDiv.innerHTML = `
            <div style="display:grid; grid-template-columns:1fr 1.35fr; gap:8px;">
              <button type="button" id="cos-col-save-only-btn" style="height:44px; border-radius:999px; border:1.5px solid #2d3e2c; background:#ffffff; color:#2d3e2c; font-size:13.5px; font-weight:700; cursor:pointer;">
                Guardar latas
              </button>
              <button type="button" id="cos-col-send-btn" ${totalPay <= 0 ? 'disabled' : ''} style="height:44px; border-radius:999px; border:none; background:${totalPay > 0 ? '#2d3e2c' : '#c5cec3'}; color:#ffffff; font-size:13.5px; font-weight:700; cursor:${totalPay > 0 ? 'pointer' : 'default'};">
                Enviar · L ${totalPay.toLocaleString('es-HN')}
              </button>
            </div>
          `;
        } else {
          footerDiv.innerHTML = `
            <button type="button" id="cos-col-send-btn" ${totalPay <= 0 ? 'disabled' : ''} style="width:100%; height:44px; border-radius:999px; border:none; background:${totalPay > 0 ? '#2d3e2c' : '#c5cec3'}; color:#ffffff; font-size:14px; font-weight:700; cursor:${totalPay > 0 ? 'pointer' : 'default'};">
              Enviar a Cuentas · L ${totalPay.toLocaleString('es-HN')}
            </button>
          `;
        }
        modalBodyEl.appendChild(footerDiv);
      }
      document.getElementById('modal-container')?.classList.add('modal-sheet-expanded');

      let savingOnExit = false;
      const saveAndClose = async () => {
        if (savingOnExit) return;
        if (isDirty) {
          savingOnExit = true;
          isDirty = false;
          try {
            await persistEditedDays();
            closeModal();
            window.Snackbar?.show(`✔ Latas actualizadas para ${col.nombre}`);
            await loadAndRender();
          } catch (err) {
            window.Snackbar?.show('Error guardando latas: ' + (err.message || err), { type: 'error' });
            closeModal();
          } finally {
            savingOnExit = false;
          }
          return;
        }
        closeModal();
      };

      const closeBtnEl = document.getElementById('close-modal');
      if (closeBtnEl) {
        const freshClose = closeBtnEl.cloneNode(true);
        closeBtnEl.replaceWith(freshClose);
        freshClose.addEventListener('click', (e) => {
          e.stopPropagation();
          saveAndClose();
        });
      }
      const modalOverlayEl = document.getElementById('modal-container');
      if (modalOverlayEl) {
        modalOverlayEl.onclick = (e) => {
          if (e.target === modalOverlayEl) saveAndClose();
        };
      }

      document.getElementById('cos-col-prev-w')?.addEventListener('click', async () => {
        if (isDirty) {
          isDirty = false;
          await persistEditedDays().catch(() => {});
        }
        currentWeekStart.setDate(currentWeekStart.getDate() - 7);
        await loadAndRender();
        openCollectorDetailModal(colObj);
      });
      document.getElementById('cos-col-next-w')?.addEventListener('click', async () => {
        if (isDirty) {
          isDirty = false;
          await persistEditedDays().catch(() => {});
        }
        currentWeekStart.setDate(currentWeekStart.getDate() + 7);
        await loadAndRender();
        openCollectorDetailModal(colObj);
      });

      document.querySelectorAll('.cos-col-day-row').forEach(r => {
        r.addEventListener('click', () => {
          const iso = r.dataset.iso;
          editingDayIso = editingDayIso === iso ? null : iso;
          renderModal();
        });
      });
      document.querySelectorAll('.cos-col-dec').forEach(b => {
        b.addEventListener('click', () => {
          const iso = b.dataset.iso;
          const cur = editDayMap.get(iso) || 0;
          const whole = Math.floor(cur);
          editDayMap.set(iso, Math.max(0, whole - 1) + (cur - whole));
          isDirty = true;
          renderModal();
        });
      });
      document.querySelectorAll('.cos-col-inc').forEach(b => {
        b.addEventListener('click', () => {
          const iso = b.dataset.iso;
          const cur = editDayMap.get(iso) || 0;
          const whole = Math.floor(cur);
          editDayMap.set(iso, (whole + 1) + (cur - whole));
          isDirty = true;
          renderModal();
        });
      });
      document.querySelectorAll('.cos-col-frac').forEach(b => {
        b.addEventListener('click', () => {
          const iso = b.dataset.iso;
          const f = parseFloat(b.dataset.frac || '0') || 0;
          const cur = editDayMap.get(iso) || 0;
          editDayMap.set(iso, Math.floor(cur) + f);
          isDirty = true;
          renderModal();
        });
      });

      document.getElementById('cos-col-save-only-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('cos-col-save-only-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Guardando...'; }
        try {
          await persistEditedDays();
          closeModal();
          window.Snackbar?.show(`✔ Latas actualizadas para ${col.nombre}`);
          await loadAndRender();
        } catch (err) {
          window.Snackbar?.show('Error guardando latas: ' + (err.message || err), { type: 'error' });
          if (btn) { btn.disabled = false; btn.textContent = 'Guardar latas'; }
        }
      });

      document.getElementById('cos-col-update-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('cos-col-update-btn');
        if (btn) { btn.disabled = true; btn.textContent = 'Actualizando...'; }
        try {
          if (isDirty) await persistEditedDays();
          const weekTitle = getWeekTitleFull();
          const newDesc = `Cosecha ${weekTitle} · ${col.nombre} (${formatLatas(totalLatas)} ${totalLatas === 1 ? 'lata' : 'latas'}) ${refTag}`;
          if (totalPay > 0) {
            await restFetch(`/rest/v1/gastos?id=eq.${encodeURIComponent(paidInfo.id)}`, {
              method: 'PATCH',
              body: JSON.stringify({ monto: totalPay, descripcion: newDesc })
            });
            weekPaidMap.set(refTag, { id: paidInfo.id, monto: totalPay, descripcion: newDesc });
          } else {
            await restFetch(`/rest/v1/gastos?id=eq.${encodeURIComponent(paidInfo.id)}`, {
              method: 'DELETE'
            });
            weekPaidMap.delete(refTag);
          }
          window.clearScreenCache?.('gastos');
          closeModal();
          window.Snackbar?.show(`✔ Actualizado en Cuentas: ${col.nombre} (L ${paidMonto.toLocaleString('es-HN')} → L ${totalPay.toLocaleString('es-HN')})`);
          await loadAndRender();
        } catch (err) {
          window.Snackbar?.show('Error actualizando en Cuentas: ' + (err.message || err), { type: 'error' });
          if (btn) { btn.disabled = false; btn.textContent = `Actualizar en Cuentas (L ${paidMonto.toLocaleString('es-HN')} → L ${totalPay.toLocaleString('es-HN')})`; }
        }
      });

      document.getElementById('cos-col-send-btn')?.addEventListener('click', async () => {
        const btn = document.getElementById('cos-col-send-btn');
        if (totalPay <= 0) return;
        if (btn) { btn.disabled = true; btn.textContent = 'Enviando...'; }
        try {
          if (isDirty) await persistEditedDays();
          const eid = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || lote?.empresa_id || '';
          const weekTitle = getWeekTitleFull();
          const todayIso = fmtIso(new Date());
          const desc = `Cosecha ${weekTitle} · ${col.nombre} (${formatLatas(totalLatas)} ${totalLatas === 1 ? 'lata' : 'latas'}) ${refTag}`;
          const res = await restInsert('/rest/v1/gastos', {
            empresa_id: eid,
            lote_id: lote.id,
            fecha: todayIso,
            categoria: 'Cosecha',
            descripcion: desc,
            monto: totalPay
          });
          weekPaidMap.set(refTag, { id: res?.id || '', monto: totalPay, descripcion: desc });
          window.clearScreenCache?.('gastos');
          closeModal();
          window.Snackbar?.show(`✔ Enviado a Cuentas: ${col.nombre} (L ${totalPay.toLocaleString('es-HN')})`);
          await loadAndRender();
        } catch (err) {
          window.Snackbar?.show('Error enviando a Cuentas: ' + (err.message || err), { type: 'error' });
          if (btn) { btn.disabled = false; btn.textContent = `Enviar a Cuentas · L ${totalPay.toLocaleString('es-HN')}`; }
        }
      });
    };

    renderModal();
  };

  const openRegisterDayModal = (dateIso = selectedDateStr || fmtIso(new Date())) => {
    let activeIso = dateIso;
    const parts = activeIso.split('-').map(Number);
    const dObj = new Date(parts[0], (parts[1] || 1) - 1, parts[2] || 1);
    const niceDate = `${DAYS_FULL[dObj.getDay()]} ${dObj.getDate()} ${MONTHS_SHORT[dObj.getMonth()]}`;
    const existing = weekRecordsByDate.get(activeIso);
    const dayPrice = existing?.precio_lata || precioLata;
    const existingMap = new Map();
    const extraExisting = [];
    const personalIds = new Set(allPersonal.map(p => String(p.id)));
    (existing?.registros || []).forEach(r => {
      const k = String(r.personal_id || r.nombre);
      existingMap.set(k, Number(r.latas) || 0);
      if (!personalIds.has(k) && r.nombre) {
        extraExisting.push({ id: k, nombre: r.nombre, latas: Number(r.latas) || 0 });
      }
    });

    const dayWeekIso = fmtIso(getMonday(dObj));
    const workers = [
      ...allPersonal
        .filter(p => !isHiddenForWeek(String(p.id), dayWeekIso) || (existingMap.get(String(p.id)) || 0) > 0)
        .map(p => {
          const val = Math.round((existingMap.get(String(p.id)) || 0) * 4) / 4;
          const whole = Math.floor(val);
          const frac = Math.round((val - whole) * 4);
          return { id: String(p.id), nombre: p.nombre, whole, frac };
        }),
      ...extraExisting.map(ex => {
        const val = Math.round((ex.latas || 0) * 4) / 4;
        const whole = Math.floor(val);
        const frac = Math.round((val - whole) * 4);
        return { id: ex.id, nombre: ex.nombre, whole, frac };
      })
    ];

    let activeIdx = 0;
    let isDirty = false;

    const shortFirstTwo = (fullName) => {
      const partsN = String(fullName || '').trim().split(/\s+/);
      return partsN.slice(0, 2).join(' ');
    };

    const getWorkerLatas = (w) => w.whole + (w.frac * 0.25);

    showModal('Cosecha · Registrar latas de café', `
      <div id="cos-reg-root" style="display:flex; flex-direction:column; gap:10px;">
        <!-- Bloque superior fijo: fecha + encabezado + tarjeta del recolector activo -->
        <div id="cos-reg-sticky-top" style="position:sticky; top:0; z-index:4; background:#ffffff; padding-bottom:8px; display:flex; flex-direction:column; gap:10px;">
          <!-- Navegación de fecha -->
          <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; padding:0 4px;">
            <button type="button" id="cos-reg-prev-day" aria-label="Día anterior" style="width:36px; height:36px; border-radius:50%; border:none; background:#eff4ed; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer;">
              <span class="material-symbols-outlined" style="font-size:20px;">chevron_left</span>
            </button>
            <span style="font-size:15px; font-weight:800; color:#111827;">${escapeHtml(niceDate)}</span>
            <button type="button" id="cos-reg-next-day" aria-label="Día siguiente" style="width:36px; height:36px; border-radius:50%; border:none; background:#eff4ed; color:#2d3e2c; display:flex; align-items:center; justify-content:center; cursor:pointer;">
              <span class="material-symbols-outlined" style="font-size:20px;">chevron_right</span>
            </button>
          </div>

          <!-- Encabezado lista + Total del día -->
          <div style="display:flex; align-items:center; justify-content:space-between; padding:0 2px;">
            <span style="font-size:11px; font-weight:800; letter-spacing:0.5px; color:#5a6b58; text-transform:uppercase;">Latas de cada recolector</span>
            <span id="cos-reg-day-total" style="font-size:13.5px; font-weight:800; color:#111827;"></span>
          </div>

          <!-- Tarjeta fija del recolector activo -->
          <div id="cos-active-card-slot"></div>
        </div>

        <!-- Lista desplazable del resto de recolectores -->
        <div id="cos-workers-list" style="display:flex; flex-direction:column; gap:9px;"></div>
      </div>
    `);

    const modalBodyEl = document.getElementById('modal-body');
    if (modalBodyEl) {
      const footerDiv = document.createElement('div');
      footerDiv.style.cssText = 'flex-shrink:0; background:#ffffff; padding:10px 0 4px; border-top:1px solid #eef2ee; display:flex; flex-direction:column; gap:8px;';
      footerDiv.innerHTML = `
        <div id="cos-unsaved-warn" style="display:none; font-size:12px; font-weight:700; color:#ba1a1a; text-align:center;">
          Guarda los cambios antes de cambiar de día
        </div>
        <div style="display:grid; grid-template-columns:1fr 1.8fr; gap:10px;">
          <button type="button" id="cos-modal-cancel" style="height:44px; border-radius:999px; border:1px solid #d5e2d2; background:#ffffff; color:#2d3e2c; font-size:14px; font-weight:700; cursor:pointer;">Cancelar</button>
          <button type="button" id="cos-modal-save" style="height:44px; border-radius:999px; border:none; background:#2d3e2c; color:#ffffff; font-size:14px; font-weight:700; cursor:pointer; transition:background .2s;">Guardar el día</button>
        </div>
      `;
      modalBodyEl.appendChild(footerDiv);
    }
    document.getElementById('modal-container')?.classList.add('modal-sheet-expanded');

    const renderWorkersAccordion = () => {
      const activeSlot = document.getElementById('cos-active-card-slot');
      const listEl = document.getElementById('cos-workers-list');
      const totalEl = document.getElementById('cos-reg-day-total');
      if (!listEl || !activeSlot) return;

      const sumDay = workers.reduce((s, w) => s + getWorkerLatas(w), 0);
      const isToday = activeIso === fmtIso(new Date());
      if (totalEl) totalEl.textContent = `${isToday ? 'Hoy' : 'Total'}: ${formatLatas(sumDay)}`;

      if (!workers.length) {
        activeSlot.innerHTML = '';
        listEl.innerHTML = `<div style="padding:20px; text-align:center; color:#6b7280; font-size:13px;">No hay colaboradores registrados. Usa <b>+ Agregar recolector</b>.</div>`;
        return;
      }

      const w = workers[activeIdx] || workers[0];
      const latasVal = getWorkerLatas(w);
      const prevDisabled = activeIdx === 0;
      const nextWorker = workers[activeIdx + 1] || null;
      const fracOptions = [
        { f: 0, label: '0' },
        { f: 1, label: '¼' },
        { f: 2, label: '½' },
        { f: 3, label: '¾' }
      ];

      activeSlot.innerHTML = `
        <div style="background:#e9f0e7; border:1.5px solid #2d3e2c; border-radius:18px; padding:14px;">
          <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:12px;">
            <div style="display:flex; align-items:center; gap:10px; min-width:0; flex:1;">
              <div style="width:38px; height:38px; border-radius:50%; background:${getAvatarColor(w.nombre)}; color:#ffffff; font-size:13px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                ${escapeHtml(getInitials(w.nombre))}
              </div>
              <div style="min-width:0; flex:1;">
                <div style="font-size:13.5px; font-weight:800; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(w.nombre)}</div>
                <div style="font-size:11.5px; color:#5a6b58;">Recolector ${activeIdx + 1} de ${workers.length}</div>
              </div>
            </div>
            <div style="font-size:16px; font-weight:800; color:#111827; white-space:nowrap;">${formatLatas(latasVal)} latas</div>
          </div>

          <div style="font-size:11.5px; font-weight:600; color:#5a6b58; margin-bottom:6px;">Latas completas</div>
          <div style="display:flex; align-items:center; justify-content:center; gap:20px; margin-bottom:12px;">
            <button type="button" id="cos-whole-minus" style="width:42px; height:42px; border-radius:50%; border:1.5px solid #9db09a; background:#ffffff; color:#2d3e2c; font-size:22px; font-weight:700; display:flex; align-items:center; justify-content:center; cursor:pointer;">−</button>
            <span style="font-size:26px; font-weight:800; color:#111827; min-width:44px; text-align:center;">${w.whole}</span>
            <button type="button" id="cos-whole-plus" style="width:42px; height:42px; border-radius:50%; border:none; background:#2d3e2c; color:#ffffff; font-size:22px; font-weight:700; display:flex; align-items:center; justify-content:center; cursor:pointer;">+</button>
          </div>

          <div style="font-size:11.5px; font-weight:600; color:#5a6b58; margin-bottom:6px;">Fracción</div>
          <div style="display:grid; grid-template-columns:repeat(4, 1fr); gap:8px; margin-bottom:12px;">
            ${fracOptions.map(opt => {
              const act = w.frac === opt.f;
              return `<button type="button" class="cos-frac-pill" data-frac="${opt.f}" style="height:36px; border-radius:999px; border:1px solid ${act ? '#2d3e2c' : '#c9d8c6'}; background:${act ? '#2d3e2c' : '#ffffff'}; color:${act ? '#ffffff' : '#111827'}; font-size:14px; font-weight:800; cursor:pointer;">${opt.label}</button>`;
            }).join('')}
          </div>

          <div style="display:flex; align-items:center; gap:8px; padding-top:10px; border-top:1px solid #d5e2d2;">
            <button type="button" id="cos-nav-prev" ${prevDisabled ? 'disabled' : ''} style="height:36px; padding:0 14px; border-radius:999px; border:1px solid #b5c7b2; background:#ffffff; color:${prevDisabled ? '#9ca3af' : '#2d3e2c'}; font-size:12.5px; font-weight:700; cursor:${prevDisabled ? 'default' : 'pointer'}; white-space:nowrap;">
              ‹ Anterior
            </button>
            <button type="button" id="cos-nav-next" style="flex:1; height:36px; padding:0 14px; border-radius:999px; border:none; background:#2d3e2c; color:#ffffff; font-size:12.5px; font-weight:700; cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
              ${nextWorker ? `Siguiente: ${escapeHtml(shortFirstTwo(nextWorker.nombre))} ›` : 'Listo ✓'}
            </button>
          </div>
        </div>
      `;

      listEl.innerHTML = workers.map((item, idx) => {
        if (idx === activeIdx) return '';
        const itemLatas = getWorkerLatas(item);
        return `
          <div class="cos-acc-collapsed" data-idx="${idx}" style="background:#f3f5f1; border-radius:16px; padding:11px 14px; display:flex; align-items:center; justify-content:space-between; gap:10px; cursor:pointer;">
            <div style="display:flex; align-items:center; gap:11px; min-width:0; flex:1;">
              <div style="width:36px; height:36px; border-radius:50%; background:${getAvatarColor(item.nombre)}; color:#ffffff; font-size:12.5px; font-weight:800; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
                ${escapeHtml(getInitials(item.nombre))}
              </div>
              <span style="font-size:13.5px; font-weight:700; color:#111827; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeHtml(item.nombre)}</span>
            </div>
            <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
              <span style="font-size:13.5px; font-weight:800; color:#111827;">${formatLatas(itemLatas)} latas</span>
              <span class="material-symbols-outlined" style="font-size:18px; color:#5a6b58;">keyboard_arrow_down</span>
            </div>
          </div>
        `;
      }).join('');

      listEl.querySelectorAll('.cos-acc-collapsed').forEach(el => {
        el.addEventListener('click', () => {
          activeIdx = parseInt(el.dataset.idx, 10) || 0;
          renderWorkersAccordion();
        });
      });

      document.getElementById('cos-whole-minus')?.addEventListener('click', () => {
        if (workers[activeIdx].whole > 0) {
          workers[activeIdx].whole--;
          isDirty = true;
          renderWorkersAccordion();
        }
      });
      document.getElementById('cos-whole-plus')?.addEventListener('click', () => {
        workers[activeIdx].whole++;
        isDirty = true;
        renderWorkersAccordion();
      });
      activeSlot.querySelectorAll('.cos-frac-pill').forEach(btn => {
        btn.addEventListener('click', () => {
          workers[activeIdx].frac = parseInt(btn.dataset.frac, 10) || 0;
          isDirty = true;
          renderWorkersAccordion();
        });
      });
      document.getElementById('cos-nav-prev')?.addEventListener('click', () => {
        if (activeIdx > 0) {
          activeIdx--;
          renderWorkersAccordion();
        }
      });
      document.getElementById('cos-nav-next')?.addEventListener('click', () => {
        if (activeIdx < workers.length - 1) {
          activeIdx++;
          renderWorkersAccordion();
        } else {
          document.getElementById('cos-modal-save')?.focus();
        }
      });
    };

    renderWorkersAccordion();

    const shiftModalDay = (delta) => {
      if (isDirty) {
        const saveBtn = document.getElementById('cos-modal-save');
        const warnEl = document.getElementById('cos-unsaved-warn');
        if (saveBtn) {
          saveBtn.style.background = '#ba1a1a';
          saveBtn.style.boxShadow = '0 0 0 3px rgba(186, 26, 26, 0.25)';
        }
        if (warnEl) warnEl.style.display = 'block';
        return;
      }
      const nextD = new Date(dObj);
      nextD.setDate(nextD.getDate() + delta);
      const nextIso = fmtIso(nextD);
      selectedDateStr = nextIso;
      const nextMon = getMonday(nextD);
      if (fmtIso(nextMon) !== fmtIso(currentWeekStart)) {
        currentWeekStart = nextMon;
        closeModal();
        loadAndRender().then(() => openRegisterDayModal(nextIso));
      } else {
        openRegisterDayModal(nextIso);
      }
    };

    document.getElementById('cos-reg-prev-day')?.addEventListener('click', () => shiftModalDay(-1));
    document.getElementById('cos-reg-next-day')?.addEventListener('click', () => shiftModalDay(1));

    document.getElementById('cos-modal-cancel')?.addEventListener('click', () => closeModal());
    document.getElementById('cos-modal-save')?.addEventListener('click', async () => {
      const saveBtn = document.getElementById('cos-modal-save');
      const registros = workers
        .map(w => ({ personal_id: w.id, nombre: w.nombre, latas: getWorkerLatas(w) }))
        .filter(r => r.latas > 0);

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Guardando...';
      }

      try {
        const eid = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || lote?.empresa_id || '';
        const totalLatas = registros.reduce((s, r) => s + r.latas, 0);
        if (registros.length === 0) {
          if (existing?.rowId) {
            await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${encodeURIComponent(existing.rowId)}`, { method: 'DELETE' });
          }
        } else {
          const payload = {
            lote_id: lote.id,
            empresa_id: eid,
            fecha: activeIso,
            tipo: 'Cosecha',
            metodo: 'Corte manual',
            producto: 'Corte de café',
            dosis: `${formatLatas(totalLatas)} latas`,
            operador: registros.map(r => r.nombre).join(', '),
            personal_ids: registros.map(r => r.personal_id).filter(id => id && !String(id).startsWith('extra_')),
            estado: 'Aplicada',
            observaciones: '[COSECHA_JSON]' + JSON.stringify({ precio_lata: dayPrice, registros })
          };
          if (existing?.rowId) {
            await restFetch(`/rest/v1/lote_aplicaciones?id=eq.${encodeURIComponent(existing.rowId)}`, {
              method: 'PATCH',
              body: JSON.stringify(payload)
            });
          } else {
            await restInsert('/rest/v1/lote_aplicaciones', payload);
          }
        }
        closeModal();
        window.Snackbar?.show('✔ Día guardado correctamente');
        await loadAndRender();
      } catch (err) {
        window.Snackbar?.show('Error guardando latas: ' + (err.message || err), { type: 'error' });
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Guardar el día';
        }
      }
    });
  };

  let isSendingWeek = false;
  const sendWeekToGastos = () => {
    if (isSendingWeek) return;
    const days = getWeekDates();
    const wsIso = fmtIso(days[0]);
    const newCols = [];
    const changedCols = [];
    collectorSummaries.forEach(col => {
      const refTag = `[ref:cosecha_${lote.id}_${col.personal_id || col.nombre}_${wsIso}]`;
      const paid = weekPaidMap.get(refTag);
      if (!paid && col.pay > 0) {
        newCols.push({ col, refTag });
      } else if (paid && Math.round(paid.monto) !== Math.round(col.pay)) {
        changedCols.push({ col, refTag, paid });
      }
    });

    if (!newCols.length && !changedCols.length) {
      window.Snackbar?.show('Todos los cortes de esta semana ya están al día en Cuentas');
      return;
    }

    const isUpdateFlow = changedCols.length > 0;
    const prevSum = changedCols.reduce((s, x) => s + Math.round(x.paid.monto), 0);
    const newSum = changedCols.reduce((s, x) => s + Math.round(x.col.pay), 0) + newCols.reduce((s, x) => s + Math.round(x.col.pay), 0);
    const totalCount = newCols.length + changedCols.length;
    const confirmMsg = isUpdateFlow
      ? `¿Actualizar en Cuentas <b>${totalCount}</b> ${totalCount === 1 ? 'pago de cosecha' : 'pagos de cosecha'} (<b>L ${prevSum.toLocaleString('es-HN')} → L ${newSum.toLocaleString('es-HN')}</b>)?`
      : `¿Enviar a Cuentas <b>${newCols.length}</b> ${newCols.length === 1 ? 'pago de cosecha' : 'pagos de cosecha'} (<b>L ${newSum.toLocaleString('es-HN')}</b>)?`;

    window.Snackbar?.confirm(
      confirmMsg,
      async () => {
        if (isSendingWeek) return;
        isSendingWeek = true;
        try {
          const eid = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || lote?.empresa_id || '';
          const weekTitle = getWeekTitleFull();
          const todayIso = fmtIso(new Date());

          for (const { col, refTag } of newCols) {
            const desc = `Cosecha ${weekTitle} · ${col.nombre} (${formatLatas(col.latas)} ${col.latas === 1 ? 'lata' : 'latas'}) ${refTag}`;
            const res = await restInsert('/rest/v1/gastos', {
              empresa_id: eid,
              lote_id: lote.id,
              fecha: todayIso,
              categoria: 'Cosecha',
              descripcion: desc,
              monto: col.pay
            });
            weekPaidMap.set(refTag, { id: res?.id || '', monto: col.pay, descripcion: desc });
          }

          for (const { col, refTag, paid } of changedCols) {
            const desc = `Cosecha ${weekTitle} · ${col.nombre} (${formatLatas(col.latas)} ${col.latas === 1 ? 'lata' : 'latas'}) ${refTag}`;
            if (col.pay > 0) {
              await restFetch(`/rest/v1/gastos?id=eq.${encodeURIComponent(paid.id)}`, {
                method: 'PATCH',
                body: JSON.stringify({ monto: col.pay, descripcion: desc })
              });
              weekPaidMap.set(refTag, { id: paid.id, monto: col.pay, descripcion: desc });
            } else {
              await restFetch(`/rest/v1/gastos?id=eq.${encodeURIComponent(paid.id)}`, {
                method: 'DELETE'
              });
              weekPaidMap.delete(refTag);
            }
          }

          const gastosBtn = document.getElementById('lote-footer-cos-gastos');
          if (gastosBtn) {
            gastosBtn.disabled = true;
            gastosBtn.textContent = '✓ Enviado a Cuentas';
            gastosBtn.style.background = '#eff4ed';
            gastosBtn.style.borderColor = '#c7d6c3';
            gastosBtn.style.color = '#1b6e1b';
            gastosBtn.style.cursor = 'not-allowed';
          }
          window.clearScreenCache?.('gastos');
          window.Snackbar?.show(
            isUpdateFlow
              ? `✔ Actualizado en Cuentas (L ${prevSum.toLocaleString('es-HN')} → L ${newSum.toLocaleString('es-HN')})`
              : `✔ Enviado a Cuentas: ${newCols.length === 1 ? '1 pago de cosecha' : `${newCols.length} pagos de cosecha`}`
          );
          await loadAndRender();
        } catch (err) {
          window.Snackbar?.show('Error sincronizando con Cuentas: ' + (err.message || err), { type: 'error' });
        } finally {
          isSendingWeek = false;
        }
      },
      () => {},
      { confirmText: isUpdateFlow ? 'Actualizar en Cuentas' : 'Enviar a Cuentas', cancelText: 'Cancelar' }
    );
  };

  return {
    loadAndRender,
    openRegisterToday: () => {
      openRegisterDayModal(selectedDateStr || fmtIso(new Date()));
    },
    sendWeekToGastos
  };
}
