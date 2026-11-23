import { restFetch, restInsert } from '../auth.js';
import { renderM3SearchBar, initM3FullScreenSearch } from '../components/m3_search.js';

let currentPersonalSearchQuery = '';
let allPersonalData = [];
let _lpSummaryMap = new Map();
let _lpTodayStr = '';
let _lpWeekStartStr = '';
let _lpWeekEndStr = '';

const LP_DAYS_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];
const LP_MONTHS_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const LP_ESTADO_PAIRS = [
  { work: 'trabajo', rest: 'descanso' },
  { work: 'Presente', rest: 'Ausente' },
  { work: 'presente', rest: 'ausente' }
];

function lpFmtDate(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function lpIsTrabajo(e) {
  if (!e) return false;
  const s = String(e).toLowerCase().trim();
  return s === 'trabajo' || s === 'presente' || s === 'asistio' || s === 'asistió' || s === 'si' || s === 'sí' || s === 'p' || s === 't' || s === '1' || s === 'activo';
}

function lpIsDescanso(e) {
  if (!e) return false;
  const s = String(e).toLowerCase().trim();
  return s === 'descanso' || s === 'ausente' || s === 'falto' || s === 'faltó' || s === 'no' || s === 'a' || s === 'd' || s === '0' || s === 'inactivo';
}

async function lpPersistAsistencia(personalId, empresaId, dateStr, wantWork) {
  const existentes = await restFetch(`/rest/v1/personal_asistencia?personal_id=eq.${encodeURIComponent(personalId)}&fecha=eq.${dateStr}&select=*`).catch(() => []);
  const existente = (Array.isArray(existentes) ? existentes[0] : existentes) || null;
  let prefIdx = parseInt(localStorage.getItem('asistencia_pair_idx') || '0', 10);
  if (isNaN(prefIdx) || prefIdx < 0 || prefIdx >= LP_ESTADO_PAIRS.length) prefIdx = 0;
  const order = [prefIdx, ...LP_ESTADO_PAIRS.map((_, i) => i).filter(i => i !== prefIdx)];
  let lastErr = null;
  for (const idx of order) {
    const pair = LP_ESTADO_PAIRS[idx];
    const targetEstado = wantWork ? pair.work : pair.rest;
    try {
      if (existente) {
        await restFetch(`/rest/v1/personal_asistencia?id=eq.${existente.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ estado: targetEstado })
        });
      } else {
        await restInsert('/rest/v1/personal_asistencia', {
          personal_id: personalId,
          empresa_id: empresaId,
          fecha: dateStr,
          estado: targetEstado
        });
      }
      localStorage.setItem('asistencia_pair_idx', String(idx));
      return targetEstado;
    } catch (err) {
      lastErr = err;
      if (String(err?.message || err).includes('personal_asistencia_estado_check')) continue;
      throw err;
    }
  }
  throw lastErr || new Error('No se pudo guardar la asistencia');
}

function filterPersonal() {
  if (!currentPersonalSearchQuery) return allPersonalData;
  const q = currentPersonalSearchQuery.toLowerCase();
  return allPersonalData.filter(p =>
    (p.nombre || '').toLowerCase().includes(q) ||
    (p.rol || '').toLowerCase().includes(q)
  );
}

function personalStatusPillHtml(pId, estado) {
  if (lpIsTrabajo(estado)) {
    return `<button type="button" class="lp-status-pill lp-pill-work" onclick="event.stopPropagation(); window.togglePersonalTodayStatus('${pId}')" title="Toca para cambiar a Descanso">✓ Trabajó</button>`;
  }
  if (lpIsDescanso(estado)) {
    return `<button type="button" class="lp-status-pill lp-pill-rest" onclick="event.stopPropagation(); window.togglePersonalTodayStatus('${pId}')" title="Toca para cambiar a Trabajó">✕ Descanso</button>`;
  }
  const now = new Date();
  const hoyCorto = `${now.getDate()} ${LP_MONTHS_SHORT[now.getMonth()]}`;
  return `<button type="button" class="lp-status-pill lp-pill-none" onclick="event.stopPropagation(); window.togglePersonalTodayStatus('${pId}')" title="Toca para marcar como Trabajó hoy (${hoyCorto})">Marcar · ${hoyCorto}</button>`;
}

function personalRowsHtml(list) {
  if (!list.length) {
    return `<div class="m3-flex m3-flex-col m3-items-center m3-justify-center" style="padding: 64px 24px; background: var(--m3-surface-container-low); border-radius: 12px; text-align: center;">
              <div style="width: 80px; height: 80px; border-radius: 12px; background: rgba(69,87,67,0.1); display: flex; align-items: center; justify-content: center; margin-bottom: 20px;">
                <span class="material-symbols-outlined" style="font-size: 40px; color: #6b8245;">groups</span>
              </div>
              <p class="m3-title-medium m3-font-bold m3-text-on-surface" style="margin-bottom: 4px;">${currentPersonalSearchQuery ? 'No se encontraron trabajadores' : 'No hay personal registrado'}</p>
              <p class="m3-body-medium m3-text-on-surface-variant" style="margin-bottom: 24px; max-width: 280px;">${currentPersonalSearchQuery ? 'Prueba con otro nombre o rol' : 'Agrega tu primer trabajador para comenzar a gestionar tu equipo'}</p>
            </div>`;
  }
  return list.map(p => {
    const info = _lpSummaryMap.get(String(p.id)) || { days: 0, pending: 0, todayEstado: null };
    let subtitleHtml = '';
    if (info.pending > 0) {
      subtitleHtml = `${info.days} ${info.days === 1 ? 'día' : 'días'} · <span style="color:#b34200; font-weight:700;">L${info.pending.toLocaleString('es-HN')}</span> por pagar`;
    } else if (info.days > 0) {
      subtitleHtml = 'Al día · sin pagos pendientes';
    } else {
      subtitleHtml = [
        p.rol || '',
        p.pago_diario ? `L${Number(p.pago_diario).toLocaleString('es-HN')}/día` : ''
      ].filter(Boolean).join(' · ') || 'Sin actividad esta semana';
    }

    return `
      <div class="lp-card" onclick="window.openPersonalCard('${p.id}')">
        <div class="m3-flex m3-items-center" style="gap: 14px; min-width: 0; flex: 1;">
          <div class="lp-avatar" style="background: ${getColor(p.nombre)}; color: white;">${p.iniciales || getInitiales(p.nombre)}</div>
          <div style="min-width: 0; flex: 1;">
            <p class="m3-label-large m3-font-bold m3-text-on-surface" style="line-height: 1.25;">${p.nombre}</p>
            <p style="font-size: 12.5px; color: #5a6b58; margin-top: 3px; line-height: 1.3;">${subtitleHtml}</p>
          </div>
        </div>
        <div class="lp-card-right">
          ${personalStatusPillHtml(p.id, info.todayEstado)}
          <button class="lp-btn-more" onclick="event.stopPropagation(); window.toggleActionMenu(this)" aria-label="Más opciones">
            <span class="material-icons">more_vert</span>
          </button>
          <div class="action-menu">
            <button class="action-item" onclick="event.stopPropagation(); window.navigateTo('nuevo_personal', '${p.id}', 'personal')">
              <span class="material-icons">edit</span><span>Editar</span>
            </button>
            <button class="action-item delete" onclick="event.stopPropagation(); window.confirmDeletePersonal('${p.id}', '${p.nombre.replace(/'/g, "\\'")}')">
              <span class="material-icons">delete</span><span>Eliminar</span>
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function getInitiales(nombre) {
  if (!nombre) return '??';
  return nombre.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function getColor(seed) {
  const colors = ['var(--m3-primary)', 'var(--m3-tertiary)', '#7b4f9e', '#c75b39', '#2d3e2c', '#2c666e', '#6a1b9a'];
  if (!seed) return colors[0];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export async function renderListaPersonal() {
  try {
    const now = new Date();
    _lpTodayStr = lpFmtDate(now);
    const weekStart = new Date(now);
    const dow = weekStart.getDay();
    weekStart.setDate(weekStart.getDate() - dow + (dow === 0 ? -6 : 1));
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23, 59, 59, 999);
    _lpWeekStartStr = lpFmtDate(weekStart);
    _lpWeekEndStr = lpFmtDate(weekEnd);

    const eid = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
    const gastosPath = eid
      ? `/rest/v1/gastos?categoria=eq.Personal&empresa_id=eq.${eid}&select=*`
      : `/rest/v1/gastos?categoria=eq.Personal&select=*`;

    const [personalRes, asisRes, appsRes, gastosRes] = await Promise.all([
      restFetch('/rest/v1/personal?order=nombre.asc&select=*'),
      restFetch(`/rest/v1/personal_asistencia?fecha=gte.${_lpWeekStartStr}&fecha=lte.${_lpWeekEndStr}&select=*`).catch(() => []),
      restFetch(`/rest/v1/lote_aplicaciones?fecha=gte.${_lpWeekStartStr}&fecha=lte.${_lpWeekEndStr}&select=fecha,personal_ids,operador`).catch(() => []),
      restFetch(gastosPath).catch(() => [])
    ]);

    allPersonalData = personalRes || [];
    const asisList = Array.isArray(asisRes) ? asisRes : [];
    const appsList = Array.isArray(appsRes) ? appsRes : [];
    const gastosList = Array.isArray(gastosRes) ? gastosRes : [];

    _lpSummaryMap = new Map();
    let marcadosHoy = 0;
    let totalPorPagar = 0;
    let totalPagadoSemana = 0;
    let colabPorPagar = 0;

    allPersonalData.forEach(p => {
      const pId = String(p.id);
      const pAsis = asisList.filter(a => String(a.personal_id) === pId);
      const todayRec = pAsis.find(a => String(a.fecha || '').slice(0, 10) === _lpTodayStr);
      const todayEstado = todayRec ? todayRec.estado : null;
      if (lpIsTrabajo(todayEstado) || lpIsDescanso(todayEstado)) marcadosHoy++;

      const workedDates = new Set(
        pAsis.filter(a => lpIsTrabajo(a.estado)).map(a => String(a.fecha || '').slice(0, 10)).filter(Boolean)
      );
      const pNomLower = String(p.nombre || '').toLowerCase().trim();
      appsList.forEach(app => {
        const f = String(app.fecha || '').slice(0, 10);
        if (!f) return;
        const pids = Array.isArray(app.personal_ids) ? app.personal_ids.map(String) : [];
        const opMatch = pNomLower && String(app.operador || '').toLowerCase().includes(pNomLower);
        if (pids.includes(pId) || opMatch) workedDates.add(f);
      });

      const days = workedDates.size;
      const diario = Number(p.pago_diario) || 0;
      const weekGross = days * diario;
      const refPrefix = `[ref:${pId}_sem_${_lpWeekStartStr}]`;
      const paid = gastosList
        .filter(g => String(g.descripcion || '').includes(refPrefix))
        .reduce((s, g) => s + (Number(g.monto) || 0), 0);
      const pending = Math.max(0, weekGross - paid);

      if (paid > 0) totalPagadoSemana += paid;
      if (pending > 0) {
        totalPorPagar += pending;
        colabPorPagar++;
      }
      _lpSummaryMap.set(pId, { days, pending, todayEstado });
    });

    const personal = filterPersonal();
    const todayLabel = `Hoy · ${LP_DAYS_SHORT[now.getDay()]} ${now.getDate()} ${LP_MONTHS_SHORT[now.getMonth()]}`;

    return `
      <style>
        .lp-summary-grid {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 10px;
          margin-bottom: 14px;
        }
        .lp-summary-card {
          background: #ffffff;
          border: 1px solid #e6ece4;
          border-radius: 16px;
          padding: 12px 14px;
        }
        .lp-status-pill {
          height: 30px;
          padding: 0 12px;
          border-radius: 999px;
          font-family: 'Work Sans', sans-serif;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          white-space: nowrap;
          flex-shrink: 0;
          transition: transform .12s ease;
        }
        .lp-status-pill:active { transform: scale(0.95); }
        .lp-pill-work {
          border: none;
          background: #e5f3e4;
          color: #1b6e1b;
        }
        .lp-pill-rest {
          border: none;
          background: #e8eaed;
          color: #4b5563;
        }
        .lp-pill-none {
          border: 1px dashed #9ca3af;
          background: transparent;
          color: #4b5563;
        }
        .lp-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .lp-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          background: var(--m3-surface-container-low);
          border-radius: 12px;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s;
        }
        .lp-card:hover {
          background: var(--m3-surface-container-highest);
          transform: translateX(4px);
        }
        .lp-avatar {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 20px;
          flex-shrink: 0;
        }
        .lp-card-right {
          display: flex;
          align-items: center;
          gap: 4px;
          position: relative;
        }
        .lp-btn-more {
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: #111827;
          transition: background 0.2s;
        }
        .lp-btn-more:hover {
          background: rgba(0,0,0,0.05);
        }
        .action-menu {
          position: absolute;
          top: 100%;
          right: 0;
          z-index: 100;
          background: var(--m3-surface-container-high, #fff);
          border-radius: 12px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          padding: 6px;
          min-width: 160px;
          display: none;
          overflow: hidden;
        }
        .action-menu.active {
          display: block;
        }
        .action-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border: none;
          background: none;
          cursor: pointer;
          font-family: 'Work Sans', sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: var(--m3-on-surface);
          width: 100%;
          text-align: left;
          border-radius: 12px;
          transition: background 0.15s;
        }
        .action-item:hover {
          background: var(--m3-surface-container-highest, rgba(0,0,0,0.05));
        }
        .action-item.delete {
          color: var(--m3-error, #b3261e);
        }
        .action-item .material-icons {
          font-size: 20px;
        }
        @media (max-width: 768px) {
          .lp-card { padding: 14px 16px; }
        }
      </style>
      <div class="m3-pt-6 m3-pb-24 m3-p-4 m3-max-w-3xl m3-mx-auto m3-font-work-sans">
        <!-- Search + Register split control -->
        <div class="ganado-top-actions-container" style="display: flex; justify-content: flex-end; margin: 16px 0 8px;">
          ${renderM3SearchBar({
            wrapperId: 'personal-search-wrapper',
            toggleId: 'personal-search-toggle',
            inputId: 'personal-search-input',
            clearId: 'personal-search-clear',
            placeholder: 'Buscar por nombre...',
            value: currentPersonalSearchQuery,
            extraHtml: `
              <button class="ganado-split-ctrl-reg m3-search-split-btn" onclick="window.togglePersonalSplitMenu(event)" title="Más opciones" aria-label="Más opciones">
                <span class="material-icons">more_vert</span>
              </button>
              <div class="ganado-split-menu" id="personal-split-menu">
                <button class="ganado-split-item" onclick="window.navigateTo('nuevo_personal', '', 'personal'); document.getElementById('personal-split-menu').classList.remove('open');">
                  <span class="material-icons">add</span><span>Nuevo personal</span>
                </button>
              </div>
            `
          })}
        </div>
        <section class="lp-summary-grid" id="personal-summary-grid">
          <div class="lp-summary-card">
            <div style="font-size:12px; color:#5a6b58; font-weight:600;">${todayLabel}</div>
            <div id="lp-sum-marcados" style="font-size:21px; font-weight:800; color:#111827; margin-top:2px; line-height:1.15;">${marcadosHoy} de ${allPersonalData.length}</div>
            <div style="font-size:12px; color:#5a6b58; margin-top:2px;">marcados</div>
          </div>
          <div class="lp-summary-card" style="display:flex; flex-direction:column; justify-content:space-between;">
            <div>
              <div style="font-size:12px; color:#5a6b58; font-weight:600;">Por pagar esta semana</div>
              <div id="lp-sum-por-pagar" style="font-size:21px; font-weight:800; color:${totalPorPagar > 0 ? '#b34200' : '#1b6e1b'}; margin-top:2px; line-height:1.15;">L ${totalPorPagar.toLocaleString('es-HN')}</div>
              <div id="lp-sum-colabs" style="font-size:12px; color:#5a6b58; margin-top:2px;">
                ${totalPorPagar > 0
                  ? `${colabPorPagar} ${colabPorPagar === 1 ? 'colaborador' : 'colaboradores'}`
                  : (totalPagadoSemana > 0 ? `✔ Al día (L ${totalPagadoSemana.toLocaleString('es-HN')} en Gastos)` : 'Sin pagos pendientes')}
              </div>
            </div>
            ${totalPorPagar > 0 ? `
              <button type="button" id="lp-send-week-gastos-btn" onclick="window.enviarSemanaPersonalAGastos()" style="margin-top:8px; width:100%; height:32px; border-radius:999px; border:none; background:#2d3e2c; color:#ffffff; font-family:'Work Sans',sans-serif; font-size:11.5px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px;">
                <span class="material-symbols-outlined" style="font-size:15px;">payments</span>
                <span>Enviar a Cuentas</span>
              </button>
            ` : (totalPagadoSemana > 0 ? `
              <button type="button" onclick="window.navigateTo('gastos')" style="margin-top:8px; width:100%; height:30px; border-radius:999px; border:1px solid #d5e2d2; background:#eff4ed; color:#1b6e1b; font-family:'Work Sans',sans-serif; font-size:11.5px; font-weight:700; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:4px;">
                <span class="material-symbols-outlined" style="font-size:14px;">check_circle</span>
                <span>Ver en Gastos →</span>
              </button>
            ` : '')}
          </div>
        </section>

        <div class="lp-list">
          ${personalRowsHtml(personal)}
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error in renderListaPersonal:', err);
    return `<div style="padding: 24px; color: red;">Error: ${err.message}</div>`;
  }
}

export function initListaPersonal() {
  const dpModPromise = import('./detalle_personal.js');

  window.enviarSemanaPersonalAGastos = () => {
    const pendientes = (allPersonalData || []).filter(p => {
      const info = _lpSummaryMap.get(String(p.id));
      return info && info.pending > 0;
    });
    if (!pendientes.length) {
      window.Snackbar?.show('No hay pagos pendientes esta semana');
      return;
    }
    const totalSum = pendientes.reduce((s, p) => s + (_lpSummaryMap.get(String(p.id))?.pending || 0), 0);
    window.Snackbar?.confirm(
      `¿Enviar a Cuentas <b>${pendientes.length}</b> ${pendientes.length === 1 ? 'pago individual' : 'pagos individuales'} de esta semana (<b>L ${totalSum.toLocaleString('es-HN')}</b>)?`,
      async () => {
        const btn = document.getElementById('lp-send-week-gastos-btn');
        if (btn) {
          btn.disabled = true;
          btn.textContent = 'Enviando...';
        }
        try {
          const eid = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || '';
          const wsParts = _lpWeekStartStr.split('-').map(Number);
          const weParts = _lpWeekEndStr.split('-').map(Number);
          const monthsFull = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
          const startM = monthsFull[(wsParts[1] || 1) - 1] || '';
          const endM = monthsFull[(weParts[1] || 1) - 1] || '';
          const periodTitle = wsParts[1] === weParts[1]
            ? `Semana ${wsParts[2]} - ${weParts[2]} ${startM} ${wsParts[0]}`
            : `Semana ${wsParts[2]} ${startM} - ${weParts[2]} ${endM} ${wsParts[0]}`;

          for (const p of pendientes) {
            const info = _lpSummaryMap.get(String(p.id));
            const diario = Number(p.pago_diario) || 0;
            const daysText = `${info.days} ${info.days === 1 ? 'día' : 'días'}`;
            const fullDesc = `${periodTitle}: ${p.nombre} (${daysText} a L${diario.toLocaleString('es-HN')}/día) [ref:${p.id}_sem_${_lpWeekStartStr}]`;
            await restInsert('/rest/v1/gastos', {
              empresa_id: eid || p.empresa_id,
              fecha: _lpTodayStr,
              categoria: 'Personal',
              descripcion: fullDesc,
              monto: info.pending
            });
          }

          window.clearScreenCache?.('gastos');
          window.clearScreenCache?.('personal');
          const freshHtml = await renderListaPersonal();
          const container = document.getElementById('screen-container');
          if (container) {
            container.innerHTML = freshHtml;
            initListaPersonal();
          }
        } catch (err) {
          window.Snackbar?.show('Error enviando a Cuentas: ' + (err.message || err), { type: 'error' });
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = '<span class="material-symbols-outlined" style="font-size:15px;">payments</span><span>Enviar a Cuentas</span>';
          }
        }
      },
      () => {},
      { confirmText: 'Enviar a Cuentas', cancelText: 'Cancelar' }
    );
  };

  window.togglePersonalTodayStatus = async (pId) => {
    const p = (allPersonalData || []).find(x => String(x.id) === String(pId));
    if (!p) return;
    const info = _lpSummaryMap.get(String(pId)) || { days: 0, pending: 0, todayEstado: null };
    const wantWork = !lpIsTrabajo(info.todayEstado);
    const eid = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || p.empresa_id;
    try {
      await lpPersistAsistencia(p.id, eid, _lpTodayStr, wantWork);
      window.clearScreenCache?.('personal');
      const freshHtml = await renderListaPersonal();
      const container = document.getElementById('screen-container');
      if (container) {
        container.innerHTML = freshHtml;
        initListaPersonal();
      }
      window.Snackbar?.show(wantWork ? `✔ ${p.nombre}: Trabajó` : `✘ ${p.nombre}: Descanso`);
    } catch (err) {
      window.Snackbar?.show('Error guardando asistencia: ' + (err.message || err), { type: 'error' });
    }
  };

  window.openPersonalCard = async (id) => {
    const isMobile = window.innerWidth <= 1024 || window.matchMedia?.('(pointer: coarse)')?.matches;
    if (!isMobile || typeof window.openSubBottomSheet !== 'function') {
      window.navigateTo('detalle_personal', id, 'personal');
      return;
    }

    const p = (allPersonalData || []).find(x => String(x.id) === String(id));
    if (!p) {
      window.navigateTo('detalle_personal', id, 'personal');
      return;
    }

    try {
      const { renderDetallePersonal, initDetallePersonal } = await dpModPromise;
      const dpHtml = await renderDetallePersonal(id, 'personal', null, { initialView: 'day' });

      const html = `
        <style>
          #m3-sub-action-sheet.open:has(#lp-sheet-dp-body) {
            transform: none !important;
            will-change: auto !important;
            padding-bottom: 88px !important;
          }
          #lp-sheet-dp-body .dp-screen-pad { padding: 0 0 24px 0 !important; }
          #lp-sheet-dp-body .m3-card {
            padding: 0 !important;
            margin-bottom: 18px !important;
            border: none !important;
            background: transparent !important;
            box-shadow: none !important;
            border-radius: 0 !important;
          }
          #lp-sheet-dp-body .m3-card:last-child { margin-bottom: 0 !important; }
          #lp-sheet-dp-body .dp-summary-days-card { display: none !important; }
          #lp-sheet-dp-body .dp-summary-subtext { display: none !important; }
          #lp-sheet-dp-body h1 { font-size: clamp(18px, 5vw, 22px) !important; }
          #lp-sheet-dp-body .dp-cal-header { flex-direction: column; align-items: stretch !important; gap: 10px !important; }
          #lp-sheet-dp-body .dp-cal-nav-row { display: none !important; }
          #lp-sheet-dp-body .dp-cal-title {
            flex: 1;
            min-width: 0;
            text-align: center;
            font-size: clamp(13.5px, 3.8vw, 17px) !important;
            line-height: 1.25 !important;
            margin: 0 !important;
          }
          #lp-sheet-dp-body .dp-cal-arrow {
            width: 36px !important;
            height: 36px !important;
            min-width: 36px !important;
            border-radius: 50% !important;
            background: #f4f7f3 !important;
            border: 1px solid #d5e0d4 !important;
            color: #2d3e2c !important;
            display: inline-flex !important;
            align-items: center !important;
            justify-content: center !important;
            padding: 0 !important;
            flex-shrink: 0;
          }
          #lp-sheet-dp-body .dp-cal-views { width: 100%; justify-content: flex-start; }
          #lp-sheet-dp-body #dp-mobile-footer-bar { display: block !important; }
          #lp-sheet-dp-body #cal-container .dp-day-actions-bar { display: none !important; }
          #lp-sheet-dp-body #dp-mobile-footer-bar .dp-day-actions-bar {
            position: fixed;
            left: 0;
            right: 0;
            bottom: 0;
            background: #ffffff;
            padding: 12px 16px calc(12px + env(safe-area-inset-bottom));
            margin: 0 !important;
            border-top: 1px solid #e5ebe4;
            box-shadow: 0 -4px 16px rgba(0, 0, 0, 0.06);
            z-index: 10005;
          }
          #lp-sheet-dp-body .dp-day-actions-bar .cal-view-btn {
            flex: 1;
            justify-content: center;
            padding: 12px 16px !important;
            font-size: 14px !important;
          }
        </style>
        <div id="lp-sheet-dp-body" style="padding-top: 4px;">
          ${dpHtml}
        </div>
      `;

      window.openSubBottomSheet(html, async () => {
        await initDetallePersonal(id, 'personal', null, { initialView: 'day' });
      }, { expanded: true });
    } catch (err) {
      window.Snackbar?.show('Error cargando asistencia: ' + (err.message || err), { type: 'error' });
    }
  };

  window.toggleActionMenu = (btn) => {
    const menu = btn.nextElementSibling;
    if (!menu) return;
    const isMobile = window.innerWidth <= 1024 || window.matchMedia?.('(pointer: coarse)')?.matches;
    if (isMobile && window.openMobileMenuBottomSheet) {
      document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
      window.openMobileMenuBottomSheet(menu);
      return;
    }
    const isActive = menu.classList.contains('active');
    document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    if (!isActive) menu.classList.add('active');
  };

  // Split control (search + arrow) menu
  window.togglePersonalSplitMenu = (e) => {
    if (e) e.stopPropagation();
    const menu = document.getElementById('personal-split-menu');
    if (menu) menu.classList.toggle('open');
  };

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('personal-split-menu');
    if (menu && !e.target.closest('.ganado-split-ctrl')) menu.classList.remove('open');
  });

  const refreshPersonalList = () => {
    const list = filterPersonal();
    const listContainer = document.querySelector('.lp-list');
    const countLabel = document.getElementById('personal-count-label');
    if (listContainer) listContainer.innerHTML = personalRowsHtml(list);
    if (countLabel) countLabel.textContent = `${list.length} colaborador${list.length === 1 ? '' : 'es'} registrado${list.length === 1 ? '' : 's'}`;
  };

  // Material 3 Full-Screen Search
  initM3FullScreenSearch({
    moduleKey: 'personal',
    toggleId: 'personal-search-toggle',
    inputId: 'personal-search-input',
    clearId: 'personal-search-clear',
    placeholder: 'Buscar por nombre...',
    ariaLabel: 'Búsqueda de personal',
    suggestedTitle: 'Personal sugerido',
    emptyLabel: 'trabajadores',
    listClass: 'lp-list m3-search-inventory-list',
    getQuery: () => currentPersonalSearchQuery,
    setQuery: (v) => { currentPersonalSearchQuery = v; },
    onApplySearch: () => refreshPersonalList(),
    loadItems: async () => allPersonalData || [],
    getQuickChips: (items) => {
      const roles = Array.from(new Set(items.map(p => (p.rol || '').trim()).filter(Boolean))).slice(0, 5);
      return roles.map(r => ({ label: r, type: 'query', value: r, icon: 'badge' }));
    },
    filterItems: (items, qLower) => items.filter(p =>
      (p.nombre || '').toLowerCase().includes(qLower) ||
      (p.rol || '').toLowerCase().includes(qLower)
    ),
    renderItem: (p) => personalRowsHtml([p]),
    itemSelector: '.lp-card',
    getItemTitle: (el) => el.querySelector('.m3-label-large')?.textContent?.trim() || ''
  });

  window.confirmDeletePersonal = (id, name) => {
    window.Snackbar.confirm(`¿Eliminar a ${name}?`, async () => {
      try {
        await restFetch(`/rest/v1/personal?id=eq.${encodeURIComponent(id)}`, { method: 'DELETE' });
        window.Snackbar.show('Personal eliminado');
        window.clearScreenCache?.('personal');
        window.navigateTo('personal');
      } catch (err) {
        window.Snackbar.show('Error: ' + err.message, { type: 'error' });
      }
    });
  };

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.action-menu') && !e.target.closest('.lp-btn-more')) {
      document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    }
  });
}
