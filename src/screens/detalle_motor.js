import { supabase } from '../supabase.js';
import { showModal, closeModal } from '../modals.js';
import { showSnackbar } from '../snackbar.js';
import { getUser, restFetch, loadEmpresaId } from '../auth.js';
import db from '../db.js';
import { syncTable } from '../sync.js';
import { checkPushAlerts, notifyMotorOilChanged } from '../push/push.js';
import { sendWhatsApp } from '../wa.js';
import {
  isFuelMotor,
  computeFuelMotorStats,
  resolveSharedFuelPrice,
  saveSharedFuelPrice,
  formatLiters,
  formatLitersLabel,
  formatCurrencyL,
  encodeFuelLoadTag,
  serializeMotorNotas,
  isLikelyFuelEquipment
} from '../utils/motor_fuel_config.js';
import {
  buildFuelSentMap,
  sendFuelLoadsToCuentas,
  fetchEmpresaGastosFresh,
  fetchAreaCatalogs,
  normalizeAreaName
} from '../utils/motor_fuel_cuentas.js';

function escapeFuelHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getLocalTodayIso() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function formatFuelShortDate(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const todayStr = getLocalTodayIso();
  const dLocal = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  if (dLocal === todayStr) return 'Hoy';
  return d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace(/\.$/, '');
}

function extractFuelThumbLabel(motor) {
  const nombre = String(motor?.nombre || '').trim();
  const codeMatch = nombre.match(/([A-Za-z]{1,4}[-\s]?\d{2,4}[A-Za-z0-9]*)$/);
  if (codeMatch) return codeMatch[1].trim();
  const words = nombre.split(/\s+/).filter(Boolean);
  if (words.length >= 2) return words.slice(-2).join(' ');
  return nombre.slice(0, 10) || 'Equipo';
}

function renderFuelDetalleMotor(motor, stats) {
  const thumbInner = motor.image_url
    ? `<img src="${escapeFuelHtml(motor.image_url)}" alt="${escapeFuelHtml(motor.nombre || 'Equipo')}" style="width: 100%; height: 100%; object-fit: cover;">`
    : `<div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 6px; gap: 3px;">
         <span style="font-size: 13.5px; font-weight: 800; color: #192b18; line-height: 1.15;">${escapeFuelHtml(extractFuelThumbLabel(motor))}</span>
       </div>`;

  const mantsHtml = stats.items.map((item) => {
    const barW = item.isDue ? 100 : (item.pct > 0 ? Math.max(4, item.pct) : 0);
    const remTxt = formatLiters(item.remaining);
    const remPrefix = remTxt === '1' ? 'Falta' : 'Faltan';
    if (item.needsAction) {
      const rightTxt = item.isDue ? '¡Toca hacerlo!' : `${remPrefix} ${formatLitersLabel(item.remaining)}`;
      return `
        <div class="fuel-mant-card is-alert" style="background: #fff9f5; border: 1.5px solid #e8a472; border-radius: 18px; padding: 14px; margin-bottom: 10px;">
          <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px;">
            <span style="font-size: 15.5px; font-weight: 800; color: #192b18;">${escapeFuelHtml(item.nombre)}</span>
            <span style="font-size: 13.5px; font-weight: 800; color: #c2410c; white-space: nowrap;">${rightTxt}</span>
          </div>
          <div style="font-size: 12.5px; color: #5c685a; margin-top: 2px;">
            ${item.desc ? `${escapeFuelHtml(item.desc)} · ` : ''}cada ${formatLitersLabel(item.cada_litros)}
          </div>
          <div style="height: 6px; background: #f6dfd0; border-radius: 9999px; overflow: hidden; margin-top: 10px;">
            <div style="width: ${barW}%; height: 100%; background: #c2410c; border-radius: 9999px; transition: width 0.3s ease;"></div>
          </div>
          ${item.isDue ? `
            <button type="button" class="fuel-mant-done-btn press-effect" data-fuel-mant-done="${escapeFuelHtml(item.key)}" style="margin-top: 12px; width: 100%; height: 42px; border-radius: 9999px; border: 1.5px solid #e0915c; background: #ffffff; color: #c2410c; font-size: 14px; font-weight: 800; font-family: inherit; cursor: pointer;">
              Marcar como hecho
            </button>
          ` : ''}
        </div>
      `;
    }

    return `
      <div class="fuel-mant-card fuel-mant-normal-card" style="background: #f3f5f1; border: 1px solid #e3e8df; border-radius: 18px; padding: 14px; margin-bottom: 10px;">
        <div style="display: flex; justify-content: space-between; align-items: baseline; gap: 10px;">
          <span style="font-size: 15.5px; font-weight: 800; color: #192b18;">${escapeFuelHtml(item.nombre)}</span>
          <span style="font-size: 13.5px; font-weight: 800; color: #1e2d1e; white-space: nowrap;">${remPrefix} ${formatLitersLabel(item.remaining)}</span>
        </div>
        <div style="font-size: 12.5px; color: #5c685a; margin-top: 2px;">
          ${item.desc ? `${escapeFuelHtml(item.desc)} · ` : ''}cada ${formatLitersLabel(item.cada_litros)}
        </div>
        <div style="height: 6px; background: #dce4da; border-radius: 9999px; overflow: hidden; margin-top: 10px;">
          <div style="width: ${barW}%; height: 100%; background: #2e7d32; border-radius: 9999px; transition: width 0.3s ease;"></div>
        </div>
      </div>
    `;
  }).join('');

  const curPeriod = (window._fuelPeriodState && window._fuelPeriodState.period) || 'week';
  const periodTabsHtml = [
    ['day', 'Día'],
    ['week', 'Semana'],
    ['month', 'Mes'],
    ['all', 'Todo'],
  ].map(([key, label]) => {
    const active = curPeriod === key;
    return `
      <button type="button" class="fuel-period-tab" data-period="${key}" style="flex:1 0 auto; min-width:72px; height:34px; padding:0 14px; border-radius:9999px; border:1px solid ${active ? '#2d3e2c' : '#d8e1d5'}; font-size:12.5px; font-weight:700; font-family:inherit; white-space:nowrap; cursor:pointer; transition:all 0.15s ease; background:${active ? '#2d3e2c' : '#ffffff'}; color:${active ? '#ffffff' : '#3c4a3b'};">
        ${label}
      </button>
    `;
  }).join('');

  return `
    <div class="screen-detalle-motor screen-detalle-fuel" style="padding: 14px 16px 0; max-width: 560px; margin: 0 auto; font-family: 'Plus Jakarta Sans', 'Work Sans', sans-serif; box-sizing: border-box;">
      <style>#fuel-period-tabs::-webkit-scrollbar { display: none; }</style>
      <h2 class="motor-header-title" style="margin: 0 0 14px; font-size: 20px; font-weight: 800; color: #192b18;">${escapeFuelHtml(motor.nombre || 'Equipo')}</h2>

      <!-- Tarjeta unificada: resumen + filtros + gráfica -->
      <div style="background: #f2f5f0; border: 1px solid #e1e8de; border-radius: 22px; padding: 14px; margin-bottom: 18px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <div style="width: 68px; height: 68px; border-radius: 16px; background: #ffffff; border: 1px solid #e3e8df; overflow: hidden; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
            ${thumbInner}
          </div>
          <div style="flex: 1; min-width: 0;">
            <div style="display: flex; align-items: center; gap: 5px; font-size: 11.5px; color: #5b6859; font-weight: 700; line-height: 1.2;">
              <span class="material-symbols-outlined" style="font-size: 15px; color: #2d3e2c; flex-shrink: 0;">local_gas_station</span>
              <span id="fuel-hero-title">Gasolina usada</span>
            </div>
            <div id="fuel-hero-liters" style="font-size: 21px; font-weight: 800; color: #182917; margin-top: 2px; line-height: 1.15; white-space: nowrap;">${formatLitersLabel(stats.totalLiters)}</div>
            <div id="fuel-hero-meta" style="font-size: 12px; font-weight: 800; margin-top: 3px; line-height: 1.2; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;"></div>
          </div>
          <button type="button" id="btn-edit-fuel-price" class="press-effect" style="text-align: right; flex-shrink: 0; background: #ffffff; border: 1px solid #d9e2d6; border-radius: 14px; padding: 8px 10px; cursor: pointer; font-family: inherit;">
            <div style="display: inline-flex; align-items: center; justify-content: flex-end; gap: 4px; font-size: 11px; color: #5b6859; font-weight: 700;">
              <span>Precio por litro</span>
              <span class="material-symbols-outlined" style="font-size: 13px; color: #2d3e2c;">edit</span>
            </div>
            <div style="font-size: 13.5px; font-weight: 800; color: #182917; margin-top: 3px; white-space: nowrap;">${stats.config.precioPorLitro > 0 ? escapeFuelHtml(formatCurrencyL(stats.config.precioPorLitro)) : 'Definir'}</div>
          </button>
        </div>

        <div id="fuel-period-tabs" style="display: flex; align-items: center; gap: 6px; overflow-x: auto; -webkit-overflow-scrolling: touch; scrollbar-width: none; margin-top: 12px; padding: 2px 0;">
          ${periodTabsHtml}
        </div>

        <div id="fuel-period-nav" style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: 10px;">
          <button type="button" id="fuel-period-prev" aria-label="Período anterior" style="width: 30px; height: 30px; border-radius: 50%; border: 1px solid #dce5da; background: #ffffff; color: #2d3e2c; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <span class="material-symbols-outlined" style="font-size: 18px;">chevron_left</span>
          </button>
          <span id="fuel-period-label" style="font-size: 13px; font-weight: 800; color: #192b18; text-align: center;"></span>
          <button type="button" id="fuel-period-next" aria-label="Período siguiente" style="width: 30px; height: 30px; border-radius: 50%; border: 1px solid #dce5da; background: #ffffff; color: #2d3e2c; display: flex; align-items: center; justify-content: center; cursor: pointer;">
            <span class="material-symbols-outlined" style="font-size: 18px;">chevron_right</span>
          </button>
        </div>

        <div id="fuel-period-bars" style="margin-top: 10px; background: #ffffff; border: 1px solid #e3e8df; border-radius: 14px; padding: 8px 10px;"></div>
      </div>

      <!-- Mantenimiento -->
      <div style="font-size: 11px; font-weight: 800; color: #5a6658; letter-spacing: 0.7px; text-transform: uppercase; margin: 0 0 10px;">
        MANTENIMIENTO
      </div>
      <div style="padding-bottom: 24px;">
        ${mantsHtml}
      </div>

      <!-- Bottom sticky CTA -->
      <div style="position: sticky; bottom: 0; background: linear-gradient(to top, #ffffff 78%, rgba(255,255,255,0)); padding: 14px 0 calc(18px + env(safe-area-inset-bottom, 0px)); margin-top: 8px; z-index: 20;">
        <div id="fuel-cta-grid" style="display: grid; grid-template-columns: 1fr; gap: 10px;">
          <button type="button" id="btn-send-fuel-cuentas" class="press-effect" style="display: none; min-height: 50px; padding: 6px 12px; border-radius: 9999px; border: 1.5px solid #2d3e2c; background: #ffffff; color: #2d3e2c; font-family: inherit; flex-direction: column; align-items: center; justify-content: center; gap: 1px; cursor: pointer; box-sizing: border-box;">
            <span id="btn-send-fuel-cuentas-title" style="font-size: 12.5px; font-weight: 800; line-height: 1.15; white-space: nowrap;">Enviar a Cuentas</span>
            <span id="btn-send-fuel-cuentas-amt" style="font-size: 12px; font-weight: 800; color: #2e7d32; line-height: 1.15; white-space: nowrap;">L 0.00</span>
          </button>
          <button type="button" id="btn-open-fuel-load-sheet" class="press-effect" style="min-height: 50px; padding: 0 14px; border-radius: 9999px; border: none; background: #2d3e2c; color: #ffffff; font-size: 14px; font-weight: 800; font-family: inherit; display: flex; align-items: center; justify-content: center; gap: 7px; cursor: pointer; box-shadow: 0 4px 14px rgba(45,62,44,0.28); white-space: nowrap;">
            <span class="material-symbols-outlined" style="font-size: 19px;">local_gas_station</span>
            <span>Cargar gasolina</span>
          </button>
        </div>
      </div>
    </div>
  `;
}

async function getCurrentUserName() {
  try {
    const user = await getUser();
    if (!user) return 'Alan Rodezno';
    if (user.user_metadata?.nombre) return user.user_metadata.nombre;
    if (user.user_metadata?.name) return user.user_metadata.name;
    if (user.user_metadata?.full_name) return user.user_metadata.full_name;
    try {
      const dbUser = await restFetch(`/rest/v1/usuarios?id=eq.${encodeURIComponent(user.id)}&select=nombre`);
      if (dbUser?.[0]?.nombre) return dbUser[0].nombre;
    } catch {}
    if (user.email) {
      if (user.email.includes('rodezno')) return 'Alan Rodezno';
      return user.email.split('@')[0];
    }
    return 'Alan Rodezno';
  } catch {
    return 'Alan Rodezno';
  }
}

function getInitials(name) {
  if (!name) return 'AR';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export async function renderDetalleMotor(motorId) {
  if (!motorId) return '<div class="screen-detalle"><p>No se especificó un ID de motor.</p></div>';

  let motor = null;
  let mErr = null;
  let sesiones = [];
  let mants = [];

  if (navigator.onLine) {
    try {
      const [mRows, sRows, mtRows] = await Promise.all([
        restFetch(`/rest/v1/motores?id=eq.${encodeURIComponent(motorId)}&select=*`),
        restFetch(`/rest/v1/motor_sesiones?motor_id=eq.${encodeURIComponent(motorId)}&select=*&order=fecha.desc`),
        restFetch(`/rest/v1/motor_mantenimientos?motor_id=eq.${encodeURIComponent(motorId)}&select=*&order=fecha.desc`),
      ]);
      motor = Array.isArray(mRows) ? mRows[0] : mRows;
      sesiones = Array.isArray(sRows) ? sRows : [];
      mants = Array.isArray(mtRows) ? mtRows : [];
      if (motor?.id) db.motores.put(motor).catch(() => {});
      if (sesiones.length) db.motor_sesiones.bulkPut(sesiones).catch(() => {});
      if (mants.length) db.motor_mantenimientos.bulkPut(mants).catch(() => {});
    } catch (err) {
      console.warn('restFetch detalle_motor fallback:', err);
    }
  }

  if (!motor) {
    const resM = await supabase
      .from('motores')
      .select('*')
      .eq('id', motorId)
      .single();
    motor = resM.data;
    mErr = resM.error;
    if (mErr || !motor) return `<div class="screen-detalle"><p>Error cargando motor: ${mErr?.message || 'No encontrado'}</p></div>`;

    const [{ data: sData }, { data: mtData }] = await Promise.all([
      supabase
        .from('motor_sesiones')
        .select('*')
        .eq('motor_id', motorId)
        .order('fecha', { ascending: false }),
      supabase
        .from('motor_mantenimientos')
        .select('*')
        .eq('motor_id', motorId)
        .order('fecha', { ascending: false }),
    ]);
    sesiones = sData || [];
    mants = mtData || [];
  }

  // 1. Resolver operadores legados
  if (sesiones && sesiones.length > 0) {
    sesiones.forEach(s => {
      if (!s.operador || s.operador === 'Admin') {
        s.operador = 'rodezno137@gmail.com';
      }
    });
  }

  // 2. Mapear emails a nombres reales
  const operadorEmailsSet = new Set((sesiones || []).map(s => s.operador).filter(o => o && o.includes('@')));
  const operadorNombreMap = {};
  if (operadorEmailsSet.size > 0) {
    try {
      const emailsArr = Array.from(operadorEmailsSet);
      const emailFilter = emailsArr.map(e => `email.eq.${encodeURIComponent(e)}`).join(',');
      const dbUsers = await restFetch(`/rest/v1/usuarios?or=(${emailFilter})&select=email,nombre`);
      (dbUsers || []).forEach(u => {
        if (u.email) operadorNombreMap[u.email] = u.nombre || u.email.split('@')[0];
      });
    } catch {}
  }

  const currentUserName = await getCurrentUserName();

  // Guardar datos en window para Bottom Sheet
  window._currentMotorData = motor;
  window._currentMotorSesiones = sesiones || [];
  window._currentMotorMants = mants || [];
  window._currentOperadorNombreMap = operadorNombreMap || {};
  window._currentUserName = currentUserName || 'Operador';

  if (isFuelMotor(motor)) {
    const cachedMotores = await db.motores.toArray().catch(() => []);
    const sameEmpFuel = cachedMotores.filter(m => m && isFuelMotor(m) && (!motor.empresa_id || !m.empresa_id || String(m.empresa_id) === String(motor.empresa_id)));
    const fallbackPrice = resolveSharedFuelPrice(motor, sameEmpFuel, motor.empresa_id);
    if (fallbackPrice > 0) saveSharedFuelPrice(motor.empresa_id, fallbackPrice);
    const fuelStats = computeFuelMotorStats(motor, sesiones || [], mants || [], fallbackPrice);
    const gastosRows = await fetchEmpresaGastosFresh().catch(() => []);
    window._currentFuelSentMap = buildFuelSentMap(gastosRows);
    window._currentFuelStats = fuelStats;
    window._currentMotorHasPrevMant = (mants || []).length > 0;
    return renderFuelDetalleMotor(motor, fuelStats);
  }

  const totalHoras = motor.horas || 0;
  const hasPrevMant = (mants || []).length > 0;
  const maxHoras = hasPrevMant ? (motor.max_horas || 100) : 80;
  const horasRestantes = Math.max(0, maxHoras - totalHoras);
  const pct = totalHoras > 0 ? Math.min(100, Math.max(1, Math.round((totalHoras / maxHoras) * 100))) : 0;
  const requiresAlert = horasRestantes <= 0;
  const today = new Date().toISOString().split('T')[0];
  const operatorInitials = getInitials(currentUserName);

  window._currentMotorHasPrevMant = hasPrevMant;

  // Calcular marca y modelo limpios (si no tiene o son valores por defecto, se omite)
  const rawMarca = (motor.marca || '').trim();
  const rawModelo = (motor.modelo || '').trim();
  const hasMarca = rawMarca && rawMarca.toLowerCase() !== 'sin marca';
  const hasModelo = rawModelo && rawModelo.toLowerCase() !== 's/m';
  const subtitleParts = [];
  if (hasMarca) subtitleParts.push(rawMarca);
  if (hasModelo) subtitleParts.push(rawModelo);

  const subtitleHtml = subtitleParts.length > 0 ? `
    <p class="motor-header-subtitle" style="font-size: 13px; font-weight: 600; color: #5a7056; margin: 4px 0 0; text-align: left;">
      ${subtitleParts.join(' • ')}
    </p>
  ` : '';

  return `
    <div class="screen-detalle-motor">
      <style>
        .screen-detalle-motor {
          width: 100%;
          box-sizing: border-box;
        }
        .motor-sticky-summary {
          position: -webkit-sticky;
          position: sticky;
          top: 12px;
          z-index: 40;
        }
        @media (max-width: 1024px) {
          .motor-sticky-summary {
            top: 64px;
          }
        }
        .screen-detalle-motor .section-title {
          display: flex !important;
          align-items: center !important;
          justify-content: space-between !important;
          margin: 20px 0 12px !important;
          width: 100% !important;
          box-sizing: border-box !important;
        }
        .screen-detalle-motor .section-title h3 {
          font-size: 17.5px !important;
          font-weight: 800 !important;
          color: #1e3e2b !important;
          margin: 0 !important;
          line-height: 1.25 !important;
          letter-spacing: -0.2px !important;
          white-space: nowrap !important;
        }
        .screen-detalle-motor .section-title .tag {
          font-size: 11px !important;
          font-weight: 700 !important;
          padding: 4px 10px !important;
          border-radius: 9999px !important;
          white-space: nowrap !important;
          flex-shrink: 0 !important;
        }
        .screen-detalle-motor .card {
          padding: 16px 14px !important;
          border-radius: 18px !important;
          margin-bottom: 14px !important;
          box-sizing: border-box !important;
          width: 100% !important;
        }
        @media (min-width: 601px) {
          .screen-detalle-motor .card {
            padding: 24px 20px !important;
            border-radius: 20px !important;
            margin-bottom: 20px !important;
          }
        }
        @media (max-width: 768px) {
          .screen-detalle-motor {
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .screen-detalle-motor .card {
            padding: 16px 14px !important;
            border-radius: 18px !important;
            margin-bottom: 14px !important;
            box-sizing: border-box !important;
            width: 100% !important;
          }
          .screen-detalle-motor .grid-2 {
            gap: 14px !important;
            margin-top: 14px !important;
          }
        }
        .motor-session-card {
          background: #ffffff;
          border-radius: 16px;
          border: 1.5px solid #dce5da;
          padding: 14px 14px 12px;
          margin-bottom: 12px;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.02);
          cursor: pointer;
          transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
          user-select: none;
          box-sizing: border-box;
          width: 100%;
        }
        .motor-session-card:hover {
          border-color: #2d3e2c;
          box-shadow: 0 6px 18px rgba(45, 62, 44, 0.09);
          transform: translateY(-2px);
        }
        .motor-session-card:active {
          transform: scale(0.99);
        }

        /* Bottom Sheet Material 3 Expressive */
        .motor-sheet-scrim {
          position: fixed !important;
          inset: 0 !important;
          background: rgba(0, 0, 0, 0.45) !important;
          backdrop-filter: blur(3px);
          z-index: 99998 !important;
          opacity: 0;
          pointer-events: none;
          transition: opacity 0.3s cubic-bezier(0.16, 1, 0.3, 1) !important;
        }
        .motor-sheet-scrim.open {
          opacity: 1 !important;
          pointer-events: auto !important;
        }

        .motor-session-sheet {
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
          transform: translateY(105%) !important;
          transition: transform 0.4s cubic-bezier(0.16, 1, 0.3, 1) !important;
          will-change: transform;
          padding: 8px 18px 24px !important;
          box-sizing: border-box !important;
          max-height: 88vh !important;
          overflow-y: auto !important;
          scrollbar-width: none !important;
          -webkit-overflow-scrolling: touch;
          font-family: inherit !important;
          color: #1e3e2b !important;
        }
        .motor-session-sheet::-webkit-scrollbar {
          display: none !important;
        }
        .motor-session-sheet.open {
          transform: translateY(0) !important;
        }
        .motor-session-sheet.expanded {
          top: 0 !important;
          height: 100dvh !important;
          max-height: 100dvh !important;
          border-top-left-radius: 0 !important;
          border-top-right-radius: 0 !important;
        }
        .motor-manual-sticky-footer {
          position: sticky;
          bottom: -24px;
          z-index: 15;
          background: #ffffff;
          border-top: 1px solid #e4ede3;
          margin: 8px -18px -24px -18px;
          padding: 12px 18px calc(18px + env(safe-area-inset-bottom, 12px)) 18px;
          box-shadow: 0 -6px 18px rgba(30, 62, 43, 0.06);
        }

        .motor-sheet-handle-box {
          width: 100%;
          display: flex;
          justify-content: center;
          padding: 6px 0 10px;
          cursor: pointer;
        }
        .motor-sheet-handle {
          width: 38px;
          height: 4px;
          border-radius: 9999px;
          background: #cbd5cb;
        }

        .motor-float-close {
          width: 32px;
          height: 32px;
          border-radius: 50%;
          border: none;
          background: #f0f4f0;
          color: #445544;
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.2s ease;
        }
        .motor-float-close:hover {
          background: #e0eae0;
          color: #1e3e2b;
        }
        .m3-segment-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 10px 14px;
          border-radius: 9999px;
          border: none;
          background: transparent;
          color: #4a5d48;
          font-family: inherit;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.22s ease;
        }
        .m3-segment-btn.active {
          background: #2d3e2c !important;
          color: #ffffff !important;
          box-shadow: 0 3px 10px rgba(45, 62, 44, 0.22);
        }
        .m3-segment-btn:not(.active):hover {
          background: rgba(45, 62, 44, 0.06);
          color: #1e3e2b;
        }
        @keyframes pulse-dot {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(46, 125, 50, 0.7); }
          70% { transform: scale(1.1); box-shadow: 0 0 0 6px rgba(46, 125, 50, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(46, 125, 50, 0); }
        }
                /* Carrusel de Píldoras de Estadísticas en Móvil */
        .motor-stats-carousel {
          display: flex;
          align-items: center;
          gap: 10px;
          overflow-x: auto;
          scrollbar-width: none;
          -webkit-overflow-scrolling: touch;
          scroll-snap-type: x proximity;
          padding: 8px 2px 12px;
          margin: 16px 0 10px;
        }
        .motor-stats-carousel::-webkit-scrollbar {
          display: none;
        }
        .motor-stat-pill {
          display: inline-flex;
          align-items: center;
          gap: 10px;
          padding: 7px 16px 7px 10px;
          border-radius: 9999px;
          background: #f7faf7;
          border: 1.5px solid #dce5da;
          box-shadow: 0 2px 6px rgba(0, 0, 0, 0.03);
          flex-shrink: 0;
          scroll-snap-align: start;
          user-select: none;
          transition: transform 0.15s ease, background 0.15s ease;
        }
        .motor-stat-pill:active {
          transform: scale(0.97);
        }
        .motor-stat-pill.alert {
          background: #fff5f5;
          border-color: #ffcdd2;
        }
        .motor-stat-pill.ok {
          background: #f4fbf4;
          border-color: #d2e7d2;
        }
        .motor-stat-pill-icon {
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background: #ffffff;
          color: #2d3e2c;
          display: flex;
          align-items: center;
          justify-content: center;
          border: 1px solid #dce5da;
          flex-shrink: 0;
        }
        .motor-stat-pill-info {
          display: flex;
          flex-direction: column;
        }
        .motor-stat-pill-val {
          font-size: 15px;
          font-weight: 800;
          color: #1e3e2b;
          line-height: 1.15;
          letter-spacing: -0.2px;
          white-space: nowrap;
        }
        .motor-stat-pill-lbl {
          font-size: 10px;
          font-weight: 700;
          color: #5a7056;
          text-transform: uppercase;
          letter-spacing: 0.4px;
          white-space: nowrap;
          margin-top: 1px;
        }

        .dot-running {
          animation: pulse-dot 1.5s infinite;
          background: #2e7d32 !important;
        }
      </style>

      <!-- Main Detail Card (GitHub/Vercel Design) -->
      <div class="card motor-sticky-summary" style="background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid rgba(0,0,0,0.06);">
        
        <!-- Header: Imagen a la izquierda y Nombre a la derecha en un solo bloque -->
        <div class="motor-detail-header" style="display: flex; align-items: center; gap: 12px; width: 100%; position: relative;">
          
          <!-- Foto / Icono a la izquierda -->
          <div class="motor-header-image" style="width: 100px; height: 100px; min-width: 100px; border-radius: 20px; background: #eef3ed; border: 1.5px solid #dce5da; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; box-shadow: 0 3px 10px rgba(45, 62, 44, 0.10);">
            ${motor.image_url 
              ? `<img src="${motor.image_url}" alt="${motor.nombre}" style="width: 100%; height: 100%; object-fit: cover;">`
              : `<span class="material-symbols-outlined" style="font-size: 44px; color: #2d3e2c;">precision_manufacturing</span>`
            }
          </div>

          <!-- Nombre y detalles a la derecha en un solo bloque -->
          <div class="motor-header-text" style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;">
            <h2 class="motor-header-title" style="font-size: 17.5px; font-weight: 800; color: #1e3e2b; margin: 0; line-height: 1.25; word-break: break-word; letter-spacing: -0.3px; text-align: left;">
              ${motor.nombre || 'Sin Nombre'}
            </h2>
            ${subtitleHtml}
          </div>

          <!-- Píldora Límite de Servicio a la derecha -->
          <div class="motor-stat-pill" id="motor-pill-limit" style="flex-shrink: 0; padding: 6px 12px 6px 6px; ${requiresAlert ? 'background: #fff4ed; border-color: #fdba74;' : ''}">
            <div class="motor-stat-pill-icon" id="motor-pill-limit-icon" style="width: 30px; height: 30px; ${requiresAlert ? 'background: #ffedd5; color: #ea580c; border-color: #fdba74;' : ''}">
              <span class="material-symbols-outlined" style="font-size: 16px;">speed</span>
            </div>
            <div class="motor-stat-pill-info">
              <span class="motor-stat-pill-val" id="motor-pill-limit-val" style="font-size: 13.5px; ${requiresAlert ? 'color: #c2410c;' : ''}">${maxHoras}h</span>
              <span class="motor-stat-pill-lbl" id="motor-pill-limit-lbl" style="font-size: 8.5px; ${requiresAlert ? 'color: #ea580c;' : ''}">Límite Servicio</span>
            </div>
          </div>

        </div>

        <!-- Carrusel de Píldoras de Estadísticas (Material 3 Expressive) -->
        <!-- Health Progress (integrando Uso Acumulado y Próximo Cambio) -->
        <div style="margin-top: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 11.5px; font-weight: 700; color: #666;">Vida útil del aceite</span>
            <span id="motor-oil-pct-label" style="font-size: 12px; font-weight: 800; color: ${requiresAlert ? '#ff4103' : '#2d3e2c'};">${pct}%</span>
          </div>
          <div style="height: 8px; background: #eee; border-radius: 12px; overflow: hidden; position: relative; display: flex;">
            <div id="motor-oil-bar-current" style="width: ${pct}%; min-width: ${totalHoras > 0 ? '6px' : '0px'}; height: 100%; background: ${requiresAlert ? '#ff4103' : '#2d3e2c'}; transition: width 1s ease-out;"></div>
            <div id="motor-oil-bar-preview" style="width: 0%; height: 100%; background: #f97316; transition: width 0.35s ease-out;"></div>
          </div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 7px; font-size: 11.5px; font-weight: 700; color: #5a7056; gap: 8px;">
            <span style="display: inline-flex; align-items: center; gap: 4px;">
              <span class="material-symbols-outlined" style="font-size: 14px;">schedule</span>
              <span>Uso acumulado: <strong id="motor-oil-uso-val" style="color: #1e3e2b;">${totalHoras.toFixed(1)}h</strong></span>
            </span>
            <span style="display: inline-flex; align-items: center; gap: 4px;">
              <span class="material-symbols-outlined" style="font-size: 14px; color: ${requiresAlert ? '#ba1a1a' : '#5a7056'};">oil_barrel</span>
              <span>Próximo cambio: <strong id="motor-oil-restante-val" style="color: ${requiresAlert ? '#ba1a1a' : '#1e3e2b'};">${horasRestantes.toFixed(1)}h</strong></span>
            </span>
          </div>
        </div>

        <!-- Register Oil Button (only if alert) -->
        ${requiresAlert ? `
          <button class="btn-m3-fill" id="btn-alert-register-oil" style="margin-top: 20px; width: 100%; background: #ff4103; box-shadow: 0 4px 12px rgba(198, 40, 40, 0.2);">
            <span class="material-icons" style="font-size: 20px; margin-right: 8px; vertical-align: middle;">oil_barrel</span>
            Registrar Cambio de Aceite
          </button>
        ` : ''}
      </div>

      <div class="grid-2" style="margin-top: 20px;">
        
        <!-- Left Column: Operations (Unified Single Card with Segmented Button) -->
        <div class="section">
          
          <div class="card" style="background: white; border: 1.5px solid rgba(45, 62, 44, 0.12); box-shadow: 0 4px 24px rgba(0,0,0,0.04); padding: 14px;">
            
            <!-- Segmented Button Material 3 Expressive (Abre Bottom Sheet) -->
            <div class="m3-segmented-button-container" style="display: flex; background: #eef3ed; border-radius: 9999px; padding: 4px; gap: 4px; border: 1.5px solid #dce5da;">
              <button type="button" id="seg-btn-live" class="m3-segment-btn" onclick="window.openMotorActionSheet('live')" style="${horasRestantes <= 0 ? 'opacity: 0.45; cursor: not-allowed;' : ''}">
                <span class="material-symbols-outlined" style="font-size: 18px;">${horasRestantes <= 0 ? 'lock' : 'timer'}</span>
                <span>Cronómetro en Vivo</span>
              </button>
              <button type="button" id="seg-btn-manual" class="m3-segment-btn" onclick="window.openMotorActionSheet('manual')" style="${horasRestantes <= 0 ? 'opacity: 0.45; cursor: not-allowed;' : ''}">
                <span class="material-symbols-outlined" style="font-size: 18px;">${horasRestantes <= 0 ? 'lock' : 'edit_calendar'}</span>
                <span>Registro Manual</span>
              </button>
            </div>
            ${horasRestantes <= 0 ? `
            <p style="margin: 8px 0 0; font-size: 11.5px; font-weight: 700; color: #c2410c; text-align: center; display: flex; align-items: center; justify-content: center; gap: 4px;">
              <span class="material-symbols-outlined" style="font-size: 15px;">lock</span>
              <span>Horas completadas. Registra el cambio de aceite para continuar.</span>
            </p>
            ` : ''}

          </div>

        </div>


        <!-- Right Column: History -->
        <div class="section">
          
          <div class="section-title" id="motor-operacion-title">
             <h3>Historial de Operación</h3>
             <div style="display: flex; align-items: center; gap: 8px;">
               <span class="tag" style="background: var(--secondary-container); color: var(--on-secondary-container);">${sesiones ? sesiones.length : 0} Sesiones</span>
               <button type="button" id="btn-toggle-operacion-history" class="press-effect" title="Mostrar / Ocultar historial" style="width: 34px; height: 34px; border-radius: 50%; border: 1.5px solid #dce5da; background: #eef3ed; color: #2d3e2c; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                 <span class="material-symbols-outlined" id="icon-toggle-operacion-history" style="font-size: 19px;">visibility_off</span>
               </button>
             </div>
          </div>
          
          <div id="motor-operacion-history-list" class="activity-list" style="margin-bottom: 32px; display: none;">
            ${sesiones && sesiones.length > 0 ? sesiones.map((s, idx) => {
              const rawOp = s.operador || '';
              const opName = rawOp.includes('@') ? (operadorNombreMap[rawOp] || rawOp.split('@')[0]) : (rawOp || currentUserName || 'Alan Rodezno');
              const opInitials = getInitials(opName);
              
              const d = s.fecha ? new Date(s.fecha) : new Date();
              const fechaFormateada = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
              
              const durMins = s.duracion_mins || (s.total_horas ? Math.round(s.total_horas * 60) : 0);
              const durH = Math.floor(durMins / 60);
              const durM = durMins % 60;
              const duracionTexto = durH > 0 ? (durM > 0 ? `${durH}h ${durM}m` : `${durH}h`) : `${durM}m`;
              
              const horasSumadas = Math.round((durMins / 60) * 10) / 10;
              const horoFinal = parseFloat(s.total_horas) || horasSumadas;
              const horoInicial = Math.max(0, Math.round((horoFinal - horasSumadas) * 10) / 10);
              
              // Determinar modo
              const isLive = s.modo === 'live' || (durMins <= 180 && idx % 2 !== 0);

              return `
              <div class="motor-session-card press-effect" data-session-idx="${idx}" title="Toca para ver ficha técnica de la sesión">
                <!-- Top Row: Modo Badge + Fecha -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <div style="display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 9999px; background: ${isLive ? '#eef7ee' : '#f0f3ef'}; color: ${isLive ? '#2e7d32' : '#455a43'}; font-size: 11px; font-weight: 700;">
                    <span class="material-symbols-outlined" style="font-size: 14px;">${isLive ? 'timer' : 'edit_calendar'}</span>
                    <span>${isLive ? 'Cronómetro en Vivo' : 'Registro Manual'}</span>
                  </div>
                  <span style="font-size: 12px; font-weight: 700; color: #5a7056;">
                    ${fechaFormateada}
                  </span>
                </div>

                <!-- Middle Row: Rango Horario & Progresión Horómetro -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                  <div>
                    <div style="font-size: 12px; font-weight: 600; color: #666; margin-bottom: 2px;">
                      ${s.hora_inicio && s.hora_fin ? `${s.hora_inicio} - ${s.hora_fin}` : 'Registro directo por horas'}
                    </div>
                    <div style="font-size: 15px; font-weight: 800; color: #1e3e2b;">
                      ${duracionTexto} trabajadas
                    </div>
                  </div>
                  
                  <div style="text-align: right;">
                    <span style="font-size: 9.5px; font-weight: 800; color: #889988; text-transform: uppercase; letter-spacing: 0.5px; display: block;">Horómetro</span>
                    <div style="display: inline-flex; align-items: center; gap: 4px; font-size: 13.5px; font-weight: 800; color: #2d3e2c; background: #eef3ed; padding: 2px 7px; border-radius: 8px; margin-top: 2px;">
                      <span>${horoInicial.toFixed(1)}h</span>
                      <span class="material-symbols-outlined" style="font-size: 13px; color: #5a7056;">arrow_forward</span>
                      <span style="color: #1e3e2b; font-weight: 900;">${horoFinal.toFixed(1)}H</span>
                    </div>
                  </div>
                </div>

                <!-- Bottom Row: Operador Verificado Autovinculado + "Ver ficha >" -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px dashed #e2e8e0;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <div style="width: 22px; height: 22px; border-radius: 50%; background: #2d3e2c; color: white; display: flex; align-items: center; justify-content: center; font-size: 9.5px; font-weight: 800;">
                      ${opInitials}
                    </div>
                    <span style="font-size: 12px; font-weight: 700; color: #1e3e2b;">${opName}</span>
                    <span class="material-symbols-outlined" style="font-size: 14px; color: #2d3e2c; font-variation-settings: 'FILL' 1;" title="Autovinculado">verified</span>
                  </div>

                  <div style="display: flex; align-items: center; gap: 2px; font-size: 11.5px; font-weight: 700; color: #2d3e2c;">
                    <span>Ver ficha</span>
                    <span class="material-symbols-outlined" style="font-size: 15px;">chevron_right</span>
                  </div>
                </div>
              </div>
            `;}).join('') : '<p style="text-align:center; padding: 40px; color:#999; background: var(--surface); border-radius: 12px; border: 1px dashed #ccc;">No hay sesiones registradas.</p>'}
          </div>

          <div class="section-title">
             <h3>Mantenimientos</h3>
             <div style="display: flex; align-items: center; gap: 8px;">
               <span class="tag" style="background: var(--secondary-container); color: var(--on-secondary-container);">${mants ? mants.length : 0} Registros</span>
               <button type="button" id="btn-toggle-mants-history" class="press-effect" title="Mostrar / Ocultar mantenimientos" style="width: 34px; height: 34px; border-radius: 50%; border: 1.5px solid #dce5da; background: #eef3ed; color: #2d3e2c; display: flex; align-items: center; justify-content: center; cursor: pointer;">
                 <span class="material-symbols-outlined" id="icon-toggle-mants-history" style="font-size: 19px;">visibility_off</span>
               </button>
             </div>
          </div>
          
          <div id="motor-mants-history-list" class="activity-list" style="display: none;">
            ${mants && mants.length > 0 ? mants.map(m => {
              const histSesiones = Array.isArray(m.historial_sesiones) ? m.historial_sesiones : [];
              const dMant = m.fecha ? new Date(m.fecha) : new Date();
              const fechaMantFormateada = dMant.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
              return `
              <div class="motor-session-card press-effect" onclick="window.openMotorMantDetailSheet('${m.id}')" title="Toca para ver el historial de horas y operarios" style="cursor: pointer;">
                <!-- Top Row: Tipo Badge + Fecha -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
                  <div style="display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 9999px; background: #eef3ed; color: #2d3e2c; font-size: 11px; font-weight: 700;">
                    <span class="material-symbols-outlined" style="font-size: 14px; color: #ff4103;">oil_barrel</span>
                    <span>${m.titulo || 'Cambio de Aceite'}</span>
                  </div>
                  <span style="font-size: 12px; font-weight: 700; color: #5a7056;">
                    ${fechaMantFormateada}
                  </span>
                </div>

                <!-- Middle Row: Descripción & Sesiones + Uso acumulado -->
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px;">
                  <div>
                    <div style="font-size: 12px; font-weight: 600; color: #666; margin-bottom: 2px;">
                      ${m.descripcion || 'Mantenimiento preventivo.'}
                    </div>
                    <div style="font-size: 15px; font-weight: 800; color: #1e3e2b;">
                      ${histSesiones.length} ${histSesiones.length === 1 ? 'sesión registrada' : 'sesiones registradas'}
                    </div>
                  </div>

                  <div style="text-align: right;">
                    <span style="font-size: 9.5px; font-weight: 800; color: #889988; text-transform: uppercase; letter-spacing: 0.5px; display: block;">Uso acumulado</span>
                    <div style="display: inline-flex; align-items: center; gap: 4px; font-size: 13.5px; font-weight: 900; color: #1e3e2b; background: #eef3ed; padding: 2px 9px; border-radius: 8px; margin-top: 2px;">
                      <span>${m.total_horas || 0}h</span>
                    </div>
                  </div>
                </div>

                <!-- Bottom Row: Eliminar + "Ver historial >" -->
                <div style="display: flex; justify-content: space-between; align-items: center; padding-top: 8px; border-top: 1px dashed #e2e8e0;">
                  <button type="button" class="btn-m3-text btn-delete-maintenance" data-id="${m.id}" onclick="event.stopPropagation();" title="Eliminar mantenimiento" style="color: var(--error); padding: 2px 8px 2px 4px; height: 28px; min-width: 0; border-radius: 9999px; display: inline-flex; align-items: center; gap: 4px; font-size: 11.5px; font-weight: 700;">
                    <span class="material-symbols-outlined" style="font-size: 16px;">delete</span>
                    <span>Eliminar</span>
                  </button>

                  <div style="display: flex; align-items: center; gap: 2px; font-size: 11.5px; font-weight: 700; color: #2d3e2c;">
                    <span>Ver historial</span>
                    <span class="material-symbols-outlined" style="font-size: 15px;">chevron_right</span>
                  </div>
                </div>
              </div>
            `;
            }).join('') : '<p style="text-align:center; padding: 40px; color:#999; background: var(--surface); border-radius: 12px; border: 1px dashed #ccc;">Sin mantenimientos registrados.</p>'}
          </div>

        </div>

      </div>

      <!-- Bottom Sheet Scrim & Container para Ficha Técnica de Operación -->
      <div id="motor-sheet-scrim" class="motor-sheet-scrim"></div>
      <div id="motor-session-sheet" class="motor-session-sheet"></div>

      <!-- Bottom Sheet Scrim & Container para Cronómetro / Registro Manual -->
      <div id="motor-action-scrim" class="motor-sheet-scrim"></div>
      <div id="motor-action-sheet" class="motor-session-sheet">
        <div id="motor-action-sheet-handle" class="motor-sheet-handle-box">
          <div class="motor-sheet-handle"></div>
        </div>
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px;">
          <h3 id="motor-action-sheet-title" style="margin: 0; font-size: 18px; font-weight: 800; color: #1e3e2b;">Cronómetro en Vivo</h3>
          <button type="button" id="motor-action-sheet-close" class="motor-float-close" title="Cerrar">
            <span class="material-symbols-outlined" style="font-size: 20px;">close</span>
          </button>
        </div>
            <!-- Panel 1: Cronómetro en Vivo -->
            <div id="panel-session-live" style="display: block; text-align: center;">
              
              <!-- Vida útil del aceite & Límite Servicio (en vivo en Cronómetro) -->
              <div style="background: #ffffff; border: 1px solid #dce5da; padding: 12px 14px; border-radius: 14px; display: flex; flex-direction: column; gap: 10px; margin-bottom: 16px; text-align: left;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
                  <div id="live-pill-limit" class="motor-stat-pill" style="transition: background 0.25s, border-color 0.25s;">
                    <div id="live-pill-limit-icon" class="motor-stat-pill-icon" style="transition: background 0.25s, color 0.25s, border-color 0.25s;"><span class="material-symbols-outlined">speed</span></div>
                    <div class="motor-stat-pill-text">
                      <span id="live-pill-limit-val" class="motor-stat-pill-val">${maxHoras}h</span>
                      <span id="live-pill-limit-lbl" class="motor-stat-pill-lbl">Límite Servicio</span>
                    </div>
                  </div>
                  <span id="live-oil-pct-label" style="font-size: 13px; font-weight: 800; color: ${requiresAlert ? '#ff4103' : '#2d3e2c'};">${pct}%</span>
                </div>
                <div>
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                    <span style="font-size: 11.5px; font-weight: 700; color: #666;">Vida útil del aceite</span>
                    <span id="live-oil-hours-label" style="font-size: 11px; font-weight: 600; color: #5a7056;">${totalHoras.toFixed(1)}h / ${maxHoras}h</span>
                  </div>
                  <div style="height: 8px; background: #eee; border-radius: 12px; overflow: hidden; position: relative; display: flex;">
                    <div id="live-oil-bar-current" style="width: ${pct}%; height: 100%; background: ${requiresAlert ? '#ff4103' : '#2d3e2c'}; transition: width 0.35s ease-out;"></div>
                    <div id="live-oil-bar-preview" style="width: 0%; height: 100%; background: #f97316; transition: width 0.35s ease-out;"></div>
                  </div>
                </div>
              </div>

              <!-- Status Pill -->
              <div id="ui-current-session-info" style="display: inline-flex; align-items: center; gap: 6px; padding: 5px 14px; background: #f0f4ef; border-radius: 9999px; border: 1px solid #dce5da; margin-bottom: 8px;">
                <span id="ui-status-dot" style="width: 8px; height: 8px; border-radius: 50%; background: #888; transition: all 0.3s;"></span>
                <span id="ui-current-session-label" style="font-size: 12px; font-weight: 700; color: #4a5d48;">Motor en reposo</span>
              </div>

              <!-- Big Monospace Clock -->
              <div id="clock-display" style="font-size: 56px; font-weight: 900; color: #1e3e2b; font-family: 'JetBrains Mono', monospace; margin: 12px 0 24px; letter-spacing: -2px; line-height: 1;">
                00:00:00
              </div>

              <!-- Controls: Initial Pill or Active Dual Buttons -->
              <div style="display: flex; justify-content: center; width: 100%;">
                
                <!-- Initial: Big Pill Button -->
                <div id="timer-initial-controls" style="display: flex; justify-content: center; width: 100%;">
                  <button id="btn-timer-start" class="press-effect" style="width: 100%; max-width: 320px; padding: 14px 22px; border-radius: 9999px; background: #2d3e2c; color: #ffffff; border: none; font-size: 14.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 10px; cursor: pointer; box-shadow: 0 4px 16px rgba(45, 62, 44, 0.28); transition: transform 0.15s, box-shadow 0.15s;">
                    <span class="material-symbols-outlined" style="font-size: 22px;">play_arrow</span>
                    <span>Iniciar Sesión de Motor</span>
                  </button>
                </div>

                <!-- Active: Pausar / Reanudar & Finalizar -->
                <div id="timer-active-controls" style="display: none; gap: 10px; justify-content: center; width: 100%;">
                  <button id="btn-timer-pause" class="press-effect" style="flex: 1; max-width: 155px; padding: 13px 16px; border-radius: 9999px; background: #eef3ed; color: #2d3e2c; border: 1.5px solid #c8d7c8; font-size: 13.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: all 0.2s;">
                    <span class="material-symbols-outlined" id="btn-timer-pause-icon" style="font-size: 20px;">pause</span>
                    <span id="btn-timer-pause-text">Pausar</span>
                  </button>
                  <button id="btn-timer-finish" class="press-effect" style="flex: 1; max-width: 155px; padding: 13px 16px; border-radius: 9999px; background: #ba1a1a; color: #ffffff; border: none; font-size: 13.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; box-shadow: 0 4px 14px rgba(186, 26, 26, 0.25); transition: all 0.2s;">
                    <span class="material-symbols-outlined" style="font-size: 20px;">stop</span>
                    <span>Finalizar</span>
                  </button>
                </div>
              </div>

              <!-- Operador Autovinculado (Live mode) -->
              <div class="motor-operator-autobound" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: #f4f7f4; border: 1px solid #dce5da; border-radius: 14px; margin-top: 24px; text-align: left; box-sizing: border-box; width: 100%;">
                <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                  <div style="width: 36px; height: 36px; border-radius: 50%; background: #2d3e2c; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; letter-spacing: 0.5px; flex-shrink: 0;">
                    ${operatorInitials}
                  </div>
                  <div style="display: flex; flex-direction: column; min-width: 0;">
                    <span style="font-size: 10px; font-weight: 700; color: #5a7056; text-transform: uppercase; letter-spacing: 0.5px;">Operador Responsable</span>
                    <span style="font-size: 13.5px; font-weight: 800; color: #1e3e2b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${currentUserName}</span>
                  </div>
                </div>
                <div style="display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 9999px; background: rgba(45, 62, 44, 0.08); color: #2d3e2c; font-size: 11px; font-weight: 700; flex-shrink: 0;">
                  <span class="material-symbols-outlined" style="font-size: 15px; font-variation-settings: 'FILL' 1;">verified</span>
                  <span>Autovinculado</span>
                </div>
              </div>

            </div>

            <!-- Panel 2: Registro Manual Limpio -->
            <div id="panel-session-manual" style="display: none;">
              
              <div style="display: flex; flex-direction: column; gap: 16px;">
                
                <!-- Vida útil del aceite & Límite Servicio (en vivo en Registro Manual) -->
                <div style="background: #ffffff; border: 1px solid #dce5da; padding: 12px 14px; border-radius: 14px; display: flex; flex-direction: column; gap: 10px;">
                  <div style="display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap;">
                    <div id="manual-pill-limit" class="motor-stat-pill" style="transition: background 0.25s, border-color 0.25s;">
                      <div id="manual-pill-limit-icon" class="motor-stat-pill-icon" style="transition: background 0.25s, color 0.25s, border-color 0.25s;"><span class="material-symbols-outlined">speed</span></div>
                      <div class="motor-stat-pill-text">
                        <span id="manual-pill-limit-val" class="motor-stat-pill-val">${maxHoras}h</span>
                        <span id="manual-pill-limit-lbl" class="motor-stat-pill-lbl">Límite Servicio</span>
                      </div>
                    </div>
                    <span id="manual-oil-pct-label" style="font-size: 13px; font-weight: 800; color: ${requiresAlert ? '#ff4103' : '#2d3e2c'};">${pct}%</span>
                  </div>
                  <div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 5px;">
                      <span style="font-size: 11.5px; font-weight: 700; color: #666;">Vida útil del aceite</span>
                      <span style="font-size: 11px; font-weight: 600; color: #5a7056;">${totalHoras.toFixed(1)}h / ${maxHoras}h</span>
                    </div>
                    <div style="height: 8px; background: #eee; border-radius: 12px; overflow: hidden; position: relative; display: flex;">
                      <div id="manual-oil-bar-current" style="width: ${pct}%; height: 100%; background: ${requiresAlert ? '#ff4103' : '#2d3e2c'}; transition: width 0.35s ease-out;"></div>
                      <div id="manual-oil-bar-preview" style="width: 0%; height: 100%; background: #f97316; transition: width 0.35s ease-out;"></div>
                    </div>
                  </div>
                </div>

                <!-- Fecha -->
                <div class="m3-field">
                  <input type="text" id="input-manual-date" value="${today}" readonly placeholder=" " style="cursor: pointer;">
                  <label>Fecha de Operación</label>
                  <span class="material-icons" style="cursor: pointer;">calendar_today</span>
                </div>

                <!-- Modo de Registro Manual: Por horario vs Por horas -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 6px; background: #eef3ed; padding: 4px; border-radius: 12px; border: 1px solid #dce5da;">
                  <button type="button" id="btn-manual-mode-time" class="press-effect" style="padding: 8px 10px; border-radius: 9px; border: none; background: #2d3e2c; color: #ffffff; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">
                    <span class="material-symbols-outlined" style="font-size: 15px;">schedule</span>
                    <span>Por horario</span>
                  </button>
                  <button type="button" id="btn-manual-mode-hours" class="press-effect" style="padding: 8px 10px; border-radius: 9px; border: none; background: transparent; color: #455a43; font-size: 12px; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 5px;">
                    <span class="material-symbols-outlined" style="font-size: 15px;">add_circle</span>
                    <span>Por horas</span>
                  </button>
                </div>

                <!-- Hora Inicio & Fin -->
                <div id="manual-time-inputs" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
                  <div class="m3-field">
                    <input type="text" id="input-manual-start" value="08:00 AM" readonly placeholder=" " style="cursor: pointer;">
                    <label>Hora Inicio</label>
                    <span class="material-icons" style="cursor: pointer;">login</span>
                  </div>
                  <div class="m3-field">
                    <input type="text" id="input-manual-end" value="12:00 PM" readonly placeholder=" " style="cursor: pointer;">
                    <label>Hora Fin</label>
                    <span class="material-icons" style="cursor: pointer;">logout</span>
                  </div>
                </div>

                <!-- Cantidad Directa de Horas -->
                <div id="manual-hours-inputs" style="display: none; flex-direction: column; gap: 10px;">
                  <div class="m3-field">
                    <input type="number" id="input-manual-hours" min="0.1" step="0.1" value="1" placeholder=" ">
                    <label>Cantidad de Horas</label>
                    <span class="material-icons">hourglass_top</span>
                  </div>
                  ${horasRestantes > 0 ? `
                  <div style="display: flex; flex-wrap: wrap; gap: 6px;">
                    <button type="button" id="btn-fill-remaining-hours" data-hours="${horasRestantes.toFixed(1)}" class="press-effect" style="padding: 8px 14px; border-radius: 9999px; border: 1.5px solid #2d3e2c; background: #eef3ed; color: #1e3e2b; font-size: 12px; font-weight: 800; cursor: pointer; display: inline-flex; align-items: center; gap: 5px;">
                      <span class="material-symbols-outlined" style="font-size: 15px;">bolt</span>
                      <span>Completar el servicio (${horasRestantes.toFixed(1)}h)</span>
                    </button>
                  </div>
                  ` : ''}
                </div>

                <!-- Duración Calculada -->
                <div style="background: #f4f8f4; border: 1.5px solid #d8e5d7; padding: 14px 16px; border-radius: 14px; display: flex; justify-content: space-between; align-items: center; gap: 12px;">
                  <div style="display: flex; flex-direction: column; min-width: 0;">
                    <span style="font-size: 10.5px; font-weight: 700; color: #5a7056; text-transform: uppercase; letter-spacing: 0.5px;">Duración Calculada</span>
                    <span id="calc-manual-result" style="font-size: 20px; font-weight: 900; color: #1e3e2b; font-family: 'JetBrains Mono', monospace; margin-top: 2px;">4h 00m</span>
                    <span id="calc-manual-projection" style="font-size: 11.5px; font-weight: 700; color: #5a7056; margin-top: 3px;">${totalHoras.toFixed(1)}h registradas + 4.0h = ${(Math.round((totalHoras + 4) * 10) / 10).toFixed(1)}h / ${maxHoras}h (${Math.min(100, Math.round(((totalHoras + 4) / maxHoras) * 100))}%)</span>
                  </div>
                  <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(45, 62, 44, 0.08); color: #2d3e2c; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <span class="material-symbols-outlined" style="font-size: 20px;">hourglass_bottom</span>
                  </div>
                </div>

                <!-- Operador Autovinculado (Manual mode) -->
                <div class="motor-operator-autobound" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; background: #f4f7f4; border: 1px solid #dce5da; border-radius: 14px; box-sizing: border-box; width: 100%;">
                  <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
                    <div style="width: 36px; height: 36px; border-radius: 50%; background: #2d3e2c; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 13px; font-weight: 800; letter-spacing: 0.5px; flex-shrink: 0;">
                      ${operatorInitials}
                    </div>
                    <div style="display: flex; flex-direction: column; min-width: 0;">
                      <span style="font-size: 10px; font-weight: 700; color: #5a7056; text-transform: uppercase; letter-spacing: 0.5px;">Operador Responsable</span>
                      <span style="font-size: 13.5px; font-weight: 800; color: #1e3e2b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${currentUserName}</span>
                    </div>
                  </div>
                  <div style="display: flex; align-items: center; gap: 4px; padding: 4px 10px; border-radius: 9999px; background: rgba(45, 62, 44, 0.08); color: #2d3e2c; font-size: 11px; font-weight: 700; flex-shrink: 0;">
                    <span class="material-symbols-outlined" style="font-size: 15px; font-variation-settings: 'FILL' 1;">verified</span>
                    <span>Autovinculado</span>
                  </div>
                </div>

                <!-- Botón Guardar Sesión -->
                <div class="motor-manual-sticky-footer">
                  <button id="btn-save-manual" class="btn-m3-fill press-effect" style="width: 100%; padding: 14px; border-radius: 9999px; background: #2d3e2c; color: #ffffff; border: none; font-size: 14.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; box-shadow: 0 4px 14px rgba(45, 62, 44, 0.25);">
                    <span class="material-symbols-outlined" style="font-size: 20px;">save</span>
                    <span>Guardar Sesión</span>
                  </button>
                </div>

              </div>

            </div>
      </div>
    </div>
  `;
}

export function initDetalleMotor(motorId) {
  // If rendered inside mobile bottom sheet, place summary + action bar in fixed top area
  const sheetBody = document.getElementById('motor-list-sheet-body');
  const fixedTop = document.getElementById('motor-sheet-fixed-top');
  const fuelRoot = document.querySelector('.screen-detalle-fuel');
  if (fuelRoot) {
    if (sheetBody) sheetBody.style.padding = '0';
    if (fixedTop) fixedTop.innerHTML = '';
    const headerTitle = fuelRoot.querySelector('.motor-header-title');
    if (sheetBody && headerTitle) headerTitle.style.display = 'none';
    document.querySelectorAll('[data-motor-portal="1"]').forEach(el => el.remove());
    initFuelDetalleMotor(motorId);
    return;
  }

  if (sheetBody) {
    sheetBody.style.padding = '0';
    sheetBody.querySelectorAll('.motor-sticky-summary, .section > .card').forEach(cardEl => {
      cardEl.style.border = 'none';
      cardEl.style.borderRadius = '0';
      cardEl.style.boxShadow = 'none';
      cardEl.style.background = '#ffffff';
      cardEl.style.margin = '0';
      cardEl.style.width = '100%';
      cardEl.style.boxSizing = 'border-box';
    });
    const stickyEl = sheetBody.querySelector('.motor-sticky-summary');
    const actionSection = sheetBody.querySelector('.screen-detalle-motor .grid-2 > .section:first-child');
    const opTitle = sheetBody.querySelector('#motor-operacion-title');
    if (fixedTop && stickyEl) {
      fixedTop.innerHTML = '';
      stickyEl.style.position = 'static';
      stickyEl.style.padding = '4px 14px 10px';
      stickyEl.style.borderBottom = 'none';
      const headerTitle = stickyEl.querySelector('.motor-header-title');
      if (headerTitle) headerTitle.style.display = 'none';
      fixedTop.appendChild(stickyEl);
      if (actionSection) {
        actionSection.style.padding = '0 14px 10px';
        actionSection.style.borderBottom = opTitle ? 'none' : '1px solid #eef2ed';
        const actionCard = actionSection.querySelector('.card');
        if (actionCard) actionCard.style.padding = '0';
        fixedTop.appendChild(actionSection);
      }
      if (opTitle) {
        opTitle.style.setProperty('margin', '4px 0 0', 'important');
        opTitle.style.setProperty('padding', '0 14px 10px', 'important');
        opTitle.style.borderBottom = '1px solid #eef2ed';
        fixedTop.appendChild(opTitle);
      }
    }
    const gridEl = sheetBody.querySelector('.screen-detalle-motor .grid-2');
    if (gridEl) {
      gridEl.style.padding = '12px 14px 24px';
      gridEl.style.marginTop = '0';
      gridEl.style.boxSizing = 'border-box';
    }
  }

  // Portal bottom sheets to document.body so position:fixed is always relative to viewport
  document.querySelectorAll('[data-motor-portal="1"]').forEach(el => el.remove());
  ['motor-sheet-scrim', 'motor-session-sheet', 'motor-action-scrim', 'motor-action-sheet'].forEach(id => {
    const el = document.getElementById(id);
    if (el && el.parentElement !== document.body) {
      el.setAttribute('data-motor-portal', '1');
      document.body.appendChild(el);
    }
  });

  [
    ['btn-toggle-operacion-history', 'icon-toggle-operacion-history', 'motor-operacion-history-list'],
    ['btn-toggle-mants-history', 'icon-toggle-mants-history', 'motor-mants-history-list']
  ].forEach(([btnId, iconId, listId]) => {
    const btn = document.getElementById(btnId);
    const icon = document.getElementById(iconId);
    const list = document.getElementById(listId);
    if (btn && list) {
      btn.onclick = () => {
        const isHidden = list.style.display === 'none';
        list.style.display = isHidden ? 'block' : 'none';
        if (icon) icon.textContent = isHidden ? 'visibility' : 'visibility_off';
      };
    }
  });

  if (window._motorTimerInterval) {
    clearInterval(window._motorTimerInterval);
    window._motorTimerInterval = null;
  }
  let isRunning = false;
  let lastStartTime = 0;
  let savedElapsed = 0;

  const clockDisplay = document.getElementById('clock-display');
  const btnStart = document.getElementById('btn-timer-start');
  const btnPause = document.getElementById('btn-timer-pause');
  const btnFinish = document.getElementById('btn-timer-finish');
  const uiLabel = document.getElementById('ui-current-session-label');
  const uiDot = document.getElementById('ui-status-dot');

  // Segment Switcher & Action Bottom Sheet
  window.switchMotorSessionMode = function(mode) {
    const btnLive = document.getElementById('seg-btn-live');
    const btnManual = document.getElementById('seg-btn-manual');
    const panelLive = document.getElementById('panel-session-live');
    const panelManual = document.getElementById('panel-session-manual');
    const sheetTitle = document.getElementById('motor-action-sheet-title');
    if (!btnLive || !btnManual || !panelLive || !panelManual) return;

    if (mode === 'live') {
      btnLive.classList.add('active');
      btnManual.classList.remove('active');
      panelLive.style.display = 'block';
      panelManual.style.display = 'none';
      if (sheetTitle) sheetTitle.textContent = 'Cronómetro en Vivo';
      if (typeof window._updateLivePreview === 'function') {
        window._updateLivePreview();
      } else if (typeof window._resetOilBarPreview === 'function') {
        window._resetOilBarPreview();
      }
    } else {
      btnManual.classList.add('active');
      btnLive.classList.remove('active');
      panelLive.style.display = 'none';
      panelManual.style.display = 'block';
      if (sheetTitle) sheetTitle.textContent = 'Registro Manual';
      if (typeof window._updateManualPreview === 'function') window._updateManualPreview();
    }
  };

  function isMotorServiceCompleted() {
    const baseHoras = parseFloat(window._currentMotorData?.horas) || 0;
    const maxHoras = window._currentMotorHasPrevMant ? (window._currentMotorData?.max_horas || 100) : 80;
    return baseHoras >= maxHoras;
  }

  window.openMotorActionSheet = function(mode) {
    if (isMotorServiceCompleted()) {
      showSnackbar('Horas completadas. Registra el cambio de aceite para continuar.', 'warning');
      return;
    }
    window.switchMotorSessionMode(mode);
    const scrim = document.getElementById('motor-action-scrim');
    const sheet = document.getElementById('motor-action-sheet');
    if (!scrim || !sheet) return;
    sheet.classList.remove('expanded');
    sheet.scrollTop = 0;
    setupMotorSheetExpand(sheet, window.closeMotorActionSheet, document.getElementById('motor-action-sheet-handle'));
    requestAnimationFrame(() => {
      scrim.classList.add('open');
      sheet.classList.add('open');
    });
  };

  window.closeMotorActionSheet = function() {
    const scrim = document.getElementById('motor-action-scrim');
    const sheet = document.getElementById('motor-action-sheet');
    if (scrim) scrim.classList.remove('open');
    if (sheet) sheet.classList.remove('open', 'expanded');
    document.getElementById('seg-btn-live')?.classList.remove('active');
    document.getElementById('seg-btn-manual')?.classList.remove('active');
    if (isRunning || savedElapsed > 0) {
      window._updateLivePreview?.();
    } else {
      window._resetOilBarPreview?.();
    }
  };

  document.getElementById('motor-action-scrim')?.addEventListener('click', window.closeMotorActionSheet);
  document.getElementById('motor-action-sheet-close')?.addEventListener('click', window.closeMotorActionSheet);

  // Cargar estado guardado del cronómetro
  const savedState = JSON.parse(localStorage.getItem(`motor_v2_timer_${motorId}`));
  if (savedState) {
    savedElapsed = savedState.savedElapsed || 0;
    isRunning = savedState.isRunning || false;
    lastStartTime = savedState.lastStartTime || 0;
    if (isRunning) {
      resumeTimer();
      window.switchMotorSessionMode('live');
    } else {
      updateDisplay();
      updateButtons();
    }
  }

  function formatTime(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function updateDisplay() {
    let total = savedElapsed;
    if (isRunning) total += (Date.now() - lastStartTime);
    if (clockDisplay) clockDisplay.textContent = formatTime(total);
    if (uiLabel) {
      if (isRunning) {
        uiLabel.textContent = 'Motor en funcionamiento...';
        uiLabel.style.color = '#1b5e20';
        if (uiDot) {
          uiDot.className = 'dot-running';
        }
      } else if (total > 0) {
        uiLabel.textContent = 'Sesión en pausa';
        uiLabel.style.color = '#e65100';
        if (uiDot) {
          uiDot.className = '';
          uiDot.style.background = '#f57f17';
        }
      } else {
        uiLabel.textContent = 'Motor en reposo';
        uiLabel.style.color = '#4a5d48';
        if (uiDot) {
          uiDot.className = '';
          uiDot.style.background = '#888888';
        }
      }
    }
    const actionSheet = document.getElementById('motor-action-sheet');
    const panelManual = document.getElementById('panel-session-manual');
    const isManualOpen = actionSheet?.classList.contains('open') && panelManual?.style.display !== 'none';
    if (!isManualOpen && (isRunning || total > 0)) {
      updateOilBarPreview(total / 3600000, total);
    }
  }

  window._updateLivePreview = () => {
    let total = savedElapsed;
    if (isRunning) total += (Date.now() - lastStartTime);
    updateOilBarPreview(total / 3600000, total);
  };

  function updateButtons() {
    const initialCtrl = document.getElementById('timer-initial-controls');
    const activeCtrl = document.getElementById('timer-active-controls');
    const pauseIcon = document.getElementById('btn-timer-pause-icon');
    const pauseText = document.getElementById('btn-timer-pause-text');

    if (!isRunning && savedElapsed === 0) {
      // Motor en reposo: Botón grande tipo píldora
      if (initialCtrl) initialCtrl.style.display = 'flex';
      if (activeCtrl) activeCtrl.style.display = 'none';
    } else {
      // Motor en marcha o en pausa: Controles dobles (Pausar/Reanudar y Finalizar)
      if (initialCtrl) initialCtrl.style.display = 'none';
      if (activeCtrl) activeCtrl.style.display = 'flex';

      if (isRunning) {
        if (pauseIcon) pauseIcon.textContent = 'pause';
        if (pauseText) pauseText.textContent = 'Pausar';
      } else {
        if (pauseIcon) pauseIcon.textContent = 'play_arrow';
        if (pauseText) pauseText.textContent = 'Reanudar';
      }
    }
  }

  function saveLocalState() {
    localStorage.setItem(`motor_v2_timer_${motorId}`, JSON.stringify({ savedElapsed, isRunning, lastStartTime }));
  }

  function resumeTimer() {
    if (window._motorTimerInterval) clearInterval(window._motorTimerInterval);
    isRunning = true;
    updateButtons();
    window._motorTimerInterval = setInterval(updateDisplay, 1000);
  }

  if (btnStart) {
    btnStart.onclick = () => {
      if (isMotorServiceCompleted()) {
        showSnackbar('Horas completadas. Registra el cambio de aceite para continuar.', 'warning');
        return;
      }
      lastStartTime = Date.now();
      resumeTimer();
      saveLocalState();
      updateDisplay();
    };
  }

  if (btnPause) {
    btnPause.onclick = () => {
      if (isRunning) {
        if (window._motorTimerInterval) {
          clearInterval(window._motorTimerInterval);
          window._motorTimerInterval = null;
        }
        savedElapsed += (Date.now() - lastStartTime);
        isRunning = false;
      } else {
        lastStartTime = Date.now();
        resumeTimer();
      }
      updateButtons();
      saveLocalState();
      updateDisplay();
    };
  }

  if (btnFinish) {
    btnFinish.onclick = async () => {
      let finalElapsed = savedElapsed;
      if (isRunning) finalElapsed += (Date.now() - lastStartTime);

      // Detener inmediatamente el contador en todos lados
      if (window._motorTimerInterval) {
        clearInterval(window._motorTimerInterval);
        window._motorTimerInterval = null;
      }
      isRunning = false;
      savedElapsed = 0;
      localStorage.removeItem(`motor_v2_timer_${motorId}`);
      updateDisplay();
      updateButtons();
      updateOilBarPreview(0);

      const mins = Math.round(finalElapsed / (1000 * 60));
      if (mins < 1) {
        showSnackbar('La sesión es muy corta para registrar.', 'warning');
        await resetTimer();
        return;
      }

      btnFinish.disabled = true;
      try {
        const dInicio = new Date(Date.now() - finalElapsed);
        const dFin = new Date();
        const format12 = (d) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

        const currentUserName = await getCurrentUserName();
        await saveSession(motorId, mins, null, format12(dInicio), format12(dFin), currentUserName);
      } finally {
        btnFinish.disabled = false;
      }
      await resetTimer();
    };
  }

  async function resetTimer() {
    if (window._motorTimerInterval) {
      clearInterval(window._motorTimerInterval);
      window._motorTimerInterval = null;
    }
    localStorage.removeItem(`motor_v2_timer_${motorId}`);
    savedElapsed = 0;
    isRunning = false;
    updateDisplay();
    updateButtons();
    updateOilBarPreview(0);
    window.closeMotorActionSheet?.();
    await reloadDetalleSinParpadeo(motorId);
  }

  // --- Registro Manual ---
  const manualDate = document.getElementById('input-manual-date');
  const manualStart = document.getElementById('input-manual-start');
  const manualEnd = document.getElementById('input-manual-end');
  const manualHours = document.getElementById('input-manual-hours');
  const manualTimeInputs = document.getElementById('manual-time-inputs');
  const manualHoursInputs = document.getElementById('manual-hours-inputs');
  const btnModeTime = document.getElementById('btn-manual-mode-time');
  const btnModeHours = document.getElementById('btn-manual-mode-hours');
  const btnFillRemaining = document.getElementById('btn-fill-remaining-hours');
  const calcResult = document.getElementById('calc-manual-result');
  const calcProjection = document.getElementById('calc-manual-projection');
  const oilPctLabel = document.getElementById('motor-oil-pct-label');
  const oilBarPreview = document.getElementById('motor-oil-bar-preview');
  const btnSaveManual = document.getElementById('btn-save-manual');
  let manualMode = 'time';

  function updateOilBarPreview(addedHoras, liveElapsedMs = null) {
    const baseHoras = parseFloat(window._currentMotorData?.horas) || 0;
    const maxHoras = window._currentMotorHasPrevMant ? (window._currentMotorData?.max_horas || 100) : 80;
    const basePct = baseHoras > 0 ? Math.min(100, Math.max(1, Math.round((baseHoras / maxHoras) * 100))) : 0;
    const projPct = (baseHoras + addedHoras) > 0 ? Math.min(100, Math.max(1, Math.round(((baseHoras + addedHoras) / maxHoras) * 100))) : 0;
    const deltaPct = Math.max(0, projPct - basePct);
    const basePctExact = Math.min(100, (baseHoras / maxHoras) * 100);
    const projPctExact = Math.min(100, ((baseHoras + addedHoras) / maxHoras) * 100);
    const deltaPctExact = Math.max(0, projPctExact - basePctExact);
    const completesService = projPct >= 95;

    ['motor', 'manual', 'live'].forEach((prefix) => {
      const barPreview = document.getElementById(`${prefix}-oil-bar-preview`);
      const pctLabel = document.getElementById(`${prefix}-oil-pct-label`);
      const hoursLabel = document.getElementById(`${prefix}-oil-hours-label`);
      if (barPreview) {
        barPreview.style.width = addedHoras > 0 ? `${deltaPctExact.toFixed(3)}%` : '0%';
        barPreview.style.minWidth = addedHoras > 0 ? '4px' : '0px';
      }
      if (pctLabel) {
        if (addedHoras > 0 && deltaPct > 0) {
          pctLabel.innerHTML = `${basePct}% <span style="color: #ea580c;">→ ${projPct}%</span>`;
        } else {
          pctLabel.textContent = `${basePct}%`;
        }
      }
      if (hoursLabel) {
        if (addedHoras > 0) {
          hoursLabel.innerHTML = `${baseHoras.toFixed(1)}h <span style="color: #ea580c;">+ ${addedHoras.toFixed(2)}h</span> / ${maxHoras}h`;
        } else {
          hoursLabel.textContent = `${baseHoras.toFixed(1)}h / ${maxHoras}h`;
        }
      }

      const limitPill = document.getElementById(`${prefix}-pill-limit`);
      const limitIcon = document.getElementById(`${prefix}-pill-limit-icon`);
      const limitVal = document.getElementById(`${prefix}-pill-limit-val`);
      const limitLbl = document.getElementById(`${prefix}-pill-limit-lbl`);
      if (limitPill) {
        limitPill.style.background = completesService ? '#fff4ed' : '';
        limitPill.style.borderColor = completesService ? '#fdba74' : '';
      }
      if (limitIcon) {
        limitIcon.style.background = completesService ? '#ffedd5' : '';
        limitIcon.style.color = completesService ? '#ea580c' : '';
        limitIcon.style.borderColor = completesService ? '#fdba74' : '';
      }
      if (limitVal) limitVal.style.color = completesService ? '#c2410c' : '';
      if (limitLbl) limitLbl.style.color = completesService ? '#ea580c' : '';
    });

    const usoVal = document.getElementById('motor-oil-uso-val');
    if (usoVal) {
      if (liveElapsedMs && liveElapsedMs > 0) {
        usoVal.innerHTML = `${baseHoras.toFixed(1)}h <span style="color: #ea580c;">(+${formatTime(liveElapsedMs)})</span>`;
      } else if (addedHoras > 0) {
        usoVal.innerHTML = `${baseHoras.toFixed(1)}h <span style="color: #ea580c;">+${addedHoras.toFixed(1)}h</span>`;
      } else {
        usoVal.textContent = `${baseHoras.toFixed(1)}h`;
      }
    }
  }

  window._resetOilBarPreview = () => updateOilBarPreview(0);

  function calculateManual() {
    if (!calcResult) return 0;
    let mins = 0;
    if (manualMode === 'hours') {
      const hrs = parseFloat(manualHours?.value || '0');
      mins = Number.isFinite(hrs) && hrs > 0 ? Math.round(hrs * 60) : 0;
    } else if (manualStart && manualEnd) {
      const to24 = (t12) => {
        const parts = (t12 || '').trim().split(' ');
        if (!parts[0]) return 0;
        let [h, m] = parts[0].split(':').map(Number);
        h = h || 0;
        m = m || 0;
        const suffix = parts[1] || 'AM';
        if (suffix === 'PM' && h !== 12) h += 12;
        if (suffix === 'AM' && h === 12) h = 0;
        return h * 60 + m;
      };
      const startMins = to24(manualStart.value);
      const endMins = to24(manualEnd.value);
      let diff = endMins - startMins;
      if (diff < 0) diff += 1440;
      mins = diff;
    }
    calcResult.textContent = `${Math.floor(mins / 60)}h ${(mins % 60).toString().padStart(2, '0')}m`;

    const baseHoras = parseFloat(window._currentMotorData?.horas) || 0;
    const maxHoras = window._currentMotorHasPrevMant ? (window._currentMotorData?.max_horas || 100) : 80;
    const addedHoras = mins / 60;
    const totalProj = Math.round((baseHoras + addedHoras) * 10) / 10;
    const projPct = Math.min(100, Math.round((totalProj / maxHoras) * 100));
    if (calcProjection) {
      calcProjection.textContent = `${baseHoras.toFixed(1)}h registradas + ${addedHoras.toFixed(1)}h = ${totalProj.toFixed(1)}h / ${maxHoras}h (${projPct}%)`;
    }
    const panelManual = document.getElementById('panel-session-manual');
    if (panelManual && panelManual.style.display !== 'none') {
      updateOilBarPreview(addedHoras);
    }
    return mins;
  }

  window._updateManualPreview = calculateManual;

  function setManualMode(mode) {
    manualMode = mode;
    const isHours = mode === 'hours';
    if (manualTimeInputs) manualTimeInputs.style.display = isHours ? 'none' : 'grid';
    if (manualHoursInputs) manualHoursInputs.style.display = isHours ? 'flex' : 'none';
    if (btnModeTime) {
      btnModeTime.style.background = isHours ? 'transparent' : '#2d3e2c';
      btnModeTime.style.color = isHours ? '#455a43' : '#ffffff';
    }
    if (btnModeHours) {
      btnModeHours.style.background = isHours ? '#2d3e2c' : 'transparent';
      btnModeHours.style.color = isHours ? '#ffffff' : '#455a43';
    }
    calculateManual();
  }

  if (btnModeTime) btnModeTime.onclick = () => setManualMode('time');
  if (btnModeHours) btnModeHours.onclick = () => setManualMode('hours');
  if (manualHours) manualHours.oninput = () => calculateManual();

  if (btnFillRemaining) {
    btnFillRemaining.onclick = () => {
      if (!manualHours) return;
      manualHours.value = btnFillRemaining.dataset.hours || '1';
      calculateManual();
    };
  }

  // Integración con M3 Pickers
  import('../pickers.js').then(({ m3Pickers }) => {
    [manualDate, manualStart, manualEnd].forEach(el => {
      if (!el || !el.parentElement) return;
      el.parentElement.onclick = () => {
        if (el.id === 'input-manual-date') {
          m3Pickers.showDatePicker(el.value, (val) => { el.value = val; calculateManual(); });
        } else {
          m3Pickers.showTimePicker(el.value, (val) => { el.value = val; calculateManual(); });
        }
      };
    });
  });

  if (btnSaveManual) {
    btnSaveManual.onclick = async () => {
      if (isMotorServiceCompleted()) {
        showSnackbar('Horas completadas. Registra el cambio de aceite para continuar.', 'warning');
        return;
      }
      const mins = calculateManual();
      if (mins <= 0) {
        showSnackbar('Ingresa una duración válida mayor a 0', 'error');
        return;
      }
      btnSaveManual.disabled = true;
      btnSaveManual.innerHTML = `<span class="material-symbols-outlined animate-spin" style="font-size:18px;">sync</span> Guardando...`;
      const currentUserName = await getCurrentUserName();
      const hInicio = manualMode === 'hours' ? null : manualStart.value;
      const hFin = manualMode === 'hours' ? null : manualEnd.value;
      await saveSession(motorId, mins, manualDate.value, hInicio, hFin, currentUserName);
      await reloadDetalleSinParpadeo(motorId);
    };
  }

  // Mantenimiento y Cambio de Aceite
  const btnOil = document.getElementById('btn-register-oil-change');
  const btnAlertOil = document.getElementById('btn-alert-register-oil');
  
  const handleOilChange = () => registerOilChange(motorId);
  if (btnOil) btnOil.onclick = handleOilChange;
  if (btnAlertOil) btnAlertOil.onclick = handleOilChange;

  // Eliminar mantenimiento
  document.querySelectorAll('.btn-delete-maintenance').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('¿Deseas eliminar este registro de mantenimiento?')) {
        const id = btn.dataset.id;
        await supabase.from('motor_mantenimientos').delete().eq('id', id);
        await reloadDetalleSinParpadeo(motorId);
      }
    };
  });

  // Listener para abrir Bottom Sheet de Ficha Técnica de Operación
  const sheet = document.getElementById('motor-session-sheet');
  const scrim = document.getElementById('motor-sheet-scrim');

  document.querySelectorAll('.motor-session-card[data-session-idx]').forEach(card => {
    card.onclick = () => {
      const idx = parseInt(card.dataset.sessionIdx, 10);
      const session = window._currentMotorSesiones?.[idx];
      const motor = window._currentMotorData;
      const opMap = window._currentOperadorNombreMap || {};
      if (session && motor && sheet && scrim) {
        showMotorSessionDetailSheet(session, motor, sheet, scrim, opMap);
      }
    };
  });
}

function setupMotorSheetExpand(sheet, onClose, handleEl) {
  if (!sheet) return;
  if (handleEl) {
    handleEl.onclick = (e) => {
      e.stopPropagation();
      sheet.classList.toggle('expanded');
    };
  }

  if (sheet._motorScrollHandler) sheet.removeEventListener('scroll', sheet._motorScrollHandler);
  if (sheet._motorTouchStart) sheet.removeEventListener('touchstart', sheet._motorTouchStart);
  if (sheet._motorTouchMove) sheet.removeEventListener('touchmove', sheet._motorTouchMove);
  if (sheet._motorTouchEnd) sheet.removeEventListener('touchend', sheet._motorTouchEnd);

  sheet._motorScrollHandler = () => {
    if (sheet.scrollTop > 10 && !sheet.classList.contains('expanded')) {
      sheet.classList.add('expanded');
    }
  };
  sheet.addEventListener('scroll', sheet._motorScrollHandler, { passive: true });

  let startY = 0;
  let startX = 0;
  let currentY = 0;
  let isTracking = false;

  sheet._motorTouchStart = (e) => {
    if (e.touches.length !== 1) return;
    const target = e.target;
    if (target.closest('button') || target.closest('a') || target.closest('input') || target.closest('textarea') || target.closest('select')) {
      isTracking = false;
      return;
    }
    startY = e.touches[0].clientY;
    startX = e.touches[0].clientX;
    currentY = startY;
    isTracking = true;
  };

  sheet._motorTouchMove = (e) => {
    if (!isTracking || e.touches.length !== 1) return;
    currentY = e.touches[0].clientY;
  };

  sheet._motorTouchEnd = (e) => {
    if (!isTracking) return;
    isTracking = false;
    const deltaY = currentY - startY;
    const deltaX = Math.abs((e.changedTouches[0]?.clientX || startX) - startX);
    if (Math.abs(deltaY) < 25 || Math.abs(deltaY) < deltaX * 1.1) return;

    if (deltaY < -30) {
      sheet.classList.add('expanded');
    } else if (deltaY > 35) {
      if (sheet.classList.contains('expanded')) {
        if (sheet.scrollTop > 15) return;
        sheet.classList.remove('expanded');
      } else if (typeof onClose === 'function') {
        onClose();
      }
    }
  };

  sheet.addEventListener('touchstart', sheet._motorTouchStart, { passive: true });
  sheet.addEventListener('touchmove', sheet._motorTouchMove, { passive: true });
  sheet.addEventListener('touchend', sheet._motorTouchEnd, { passive: true });
}

function showMotorSessionDetailSheet(s, motor, sheet, scrim, opMap = {}) {
  const rawOp = s.operador || '';
  const opName = rawOp.includes('@') ? (opMap[rawOp] || rawOp.split('@')[0]) : (rawOp || 'Alan Rodezno');
  const opInitials = getInitials(opName);

  const d = s.fecha ? new Date(s.fecha) : new Date();
  const fechaFormateada = d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  const fechaLarga = d.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fechaCode = d.toISOString().split('T')[0].replace(/-/g, '');
  const idShort = s.id ? s.id.slice(0, 4).toUpperCase() : '0001';
  const opCode = `#OP-${fechaCode.slice(0, 4)}-${fechaCode.slice(4, 6)}${fechaCode.slice(6, 8)}-${idShort}`;

  const durMins = s.duracion_mins || (s.total_horas ? Math.round(s.total_horas * 60) : 0);
  const durH = Math.floor(durMins / 60);
  const durM = durMins % 60;
  const duracionTexto = durH > 0 ? (durM > 0 ? `${durH}h ${durM}m` : `${durH}h`) : `${durM}m`;

  const horasSumadas = Math.round((durMins / 60) * 10) / 10;
  const horoFinal = parseFloat(s.total_horas) || horasSumadas;
  const horoInicial = Math.max(0, Math.round((horoFinal - horasSumadas) * 10) / 10);

  const maxHoras = window._currentMotorHasPrevMant ? (motor.max_horas || 100) : 80;
  const impactPct = maxHoras > 0 ? Math.min(100, Math.round((horasSumadas / maxHoras) * 100)) : 0;
  const horoFinalPct = maxHoras > 0 ? Math.min(100, Math.round((horoFinal / maxHoras) * 100)) : 0;

  const isLive = s.modo === 'live' || (durMins <= 180 && durMins % 60 !== 0);

  sheet.innerHTML = `
    <div class="motor-sheet-handle-box" id="motor-sheet-handle-box" title="Desliza o toca para cerrar">
      <div class="motor-sheet-handle"></div>
    </div>

    <!-- Header Ficha Técnica -->
    <div style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 16px;">
      <div>
        <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px; flex-wrap: wrap;">
          <span style="font-size: 11px; font-weight: 800; color: #2d3e2c; background: #eef3ed; border: 1px solid #dce5da; padding: 2px 8px; border-radius: 6px; font-family: monospace;">
            ${opCode}
          </span>
          <span style="display: inline-flex; align-items: center; gap: 4px; padding: 3px 9px; border-radius: 9999px; background: ${isLive ? '#eef7ee' : '#f0f3ef'}; color: ${isLive ? '#2e7d32' : '#455a43'}; font-size: 11px; font-weight: 700;">
            <span class="material-symbols-outlined" style="font-size: 14px;">${isLive ? 'timer' : 'edit_calendar'}</span>
            ${isLive ? 'Cronómetro en Vivo' : 'Registro Manual'}
          </span>
        </div>
        <h3 style="margin: 0; font-size: 19px; font-weight: 800; color: #1e3e2b;">Ficha Técnica de Operación</h3>
        <p style="margin: 2px 0 0; font-size: 12.5px; color: #5a7056; font-weight: 600; text-transform: capitalize;">
          ${motor.nombre || 'Motor'} • ${fechaLarga}
        </p>
      </div>
      <button id="motor-sheet-close" class="motor-float-close" title="Cerrar">
        <span class="material-symbols-outlined" style="font-size: 20px;">close</span>
      </button>
    </div>

    <!-- Comparativa Gráfica de Horas -->
    <div style="background: #f4f8f4; border: 1.5px solid #d8e5d7; border-radius: 18px; padding: 16px; margin-bottom: 14px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
        <span style="font-size: 11px; font-weight: 800; color: #5a7056; text-transform: uppercase; letter-spacing: 0.5px;">Comparativa Gráfica de Horas</span>
        <span style="font-size: 12.5px; font-weight: 800; color: #2d3e2c;">${duracionTexto} trabajadas</span>
      </div>

      <div style="display: flex; align-items: center; justify-content: space-between; gap: 6px;">
        <!-- Horómetro Inicial -->
        <div style="flex: 1; background: #ffffff; border: 1.5px solid #dce5da; border-radius: 14px; padding: 12px 8px; text-align: center;">
          <span style="font-size: 9.5px; font-weight: 800; color: #73796e; text-transform: uppercase; display: block; margin-bottom: 3px;">Inicial</span>
          <span style="font-size: 17px; font-weight: 900; color: #444; font-family: 'JetBrains Mono', monospace;">${horoInicial.toFixed(1)}h</span>
        </div>

        <!-- + -->
        <div style="width: 26px; height: 26px; border-radius: 50%; background: #eef3ed; color: #2d3e2c; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 16px; flex-shrink: 0;">
          +
        </div>

        <!-- Horas Sumadas -->
        <div style="flex: 1.15; background: #2d3e2c; color: #ffffff; border-radius: 14px; padding: 12px 8px; text-align: center; box-shadow: 0 4px 14px rgba(45, 62, 44, 0.28);">
          <span style="font-size: 9.5px; font-weight: 800; color: #c8dfc8; text-transform: uppercase; display: block; margin-bottom: 3px;">Sumadas</span>
          <span style="font-size: 18.5px; font-weight: 900; color: #ffffff; font-family: 'JetBrains Mono', monospace;">+${horasSumadas.toFixed(1)}h</span>
        </div>

        <!-- = -->
        <div style="width: 26px; height: 26px; border-radius: 50%; background: #eef3ed; color: #2d3e2c; display: flex; align-items: center; justify-content: center; font-weight: 900; font-size: 15px; flex-shrink: 0;">
          =
        </div>

        <!-- Total Motor Final -->
        <div style="flex: 1; background: #ffffff; border: 2px solid #2d3e2c; border-radius: 14px; padding: 12px 8px; text-align: center;">
          <span style="font-size: 9.5px; font-weight: 800; color: #2d3e2c; text-transform: uppercase; display: block; margin-bottom: 3px;">Total Motor</span>
          <span style="font-size: 17px; font-weight: 900; color: #1e3e2b; font-family: 'JetBrains Mono', monospace;">${horoFinal.toFixed(1)}h</span>
        </div>
      </div>
    </div>

    <!-- Impacto en el Ciclo de Servicio (Aceite) -->
    <div style="background: #ffffff; border: 1.5px solid #e0e8df; border-radius: 18px; padding: 16px; margin-bottom: 14px; box-shadow: 0 2px 8px rgba(0,0,0,0.02);">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
        <div style="display: flex; align-items: center; gap: 6px;">
          <span class="material-symbols-outlined" style="font-size: 19px; color: #ff5722;">oil_barrel</span>
          <span style="font-size: 12.5px; font-weight: 800; color: #1e3e2b;">Impacto en Ciclo de Servicio (Aceite)</span>
        </div>
        <span style="font-size: 12px; font-weight: 800; color: #ff5722; background: #fff0eb; padding: 3px 9px; border-radius: 9999px;">
          +${impactPct}% consumido
        </span>
      </div>

      <div style="height: 10px; background: #eef1ed; border-radius: 9999px; overflow: hidden; position: relative; margin: 10px 0 6px;">
        <div style="width: ${horoFinalPct}%; height: 100%; background: #2d3e2c; border-radius: 9999px; transition: width 0.6s ease-out;"></div>
      </div>
      <div style="display: flex; justify-content: space-between; font-size: 11px; color: #5a7056; font-weight: 600;">
        <span>Esta labor sumó ${horasSumadas.toFixed(1)}h al ciclo de ${maxHoras}h</span>
        <span>${Math.max(0, maxHoras - horoFinal).toFixed(1)}h restantes</span>
      </div>
    </div>

    <!-- Detalles del Registro / Auditoría -->
    <div style="background: #f8faf8; border: 1.5px solid #dce5da; border-radius: 16px; padding: 14px; margin-bottom: 18px;">
      <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px;">
        
        <div>
          <span style="font-size: 10px; font-weight: 700; color: #6c7e6b; text-transform: uppercase;">Operador Responsable</span>
          <div style="display: flex; align-items: center; gap: 6px; margin-top: 5px;">
            <div style="width: 24px; height: 24px; border-radius: 50%; background: #2d3e2c; color: white; display: flex; align-items: center; justify-content: center; font-size: 10px; font-weight: 800; flex-shrink: 0;">
              ${opInitials}
            </div>
            <span style="font-size: 13px; font-weight: 800; color: #1e3e2b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${opName}</span>
            <span class="material-symbols-outlined" style="font-size: 15px; color: #2d3e2c; font-variation-settings: 'FILL' 1;" title="Autovinculado">verified</span>
          </div>
        </div>

        <div>
          <span style="font-size: 10px; font-weight: 700; color: #6c7e6b; text-transform: uppercase;">Horario de Ejecución</span>
          <div style="font-size: 13px; font-weight: 800; color: #1e3e2b; margin-top: 5px;">
            ${s.hora_inicio && s.hora_fin ? `${s.hora_inicio} a ${s.hora_fin}` : 'Registro directo por horas'}
          </div>
        </div>

        <div>
          <span style="font-size: 10px; font-weight: 700; color: #6c7e6b; text-transform: uppercase;">Fecha</span>
          <div style="font-size: 13px; font-weight: 800; color: #1e3e2b; margin-top: 5px;">
            ${fechaFormateada}
          </div>
        </div>

        <div>
          <span style="font-size: 10px; font-weight: 700; color: #6c7e6b; text-transform: uppercase;">Duración Registrada</span>
          <div style="font-size: 13px; font-weight: 800; color: #2d3e2c; margin-top: 5px;">
            ${duracionTexto} (${durMins} min)
          </div>
        </div>

      </div>
    </div>

    <!-- Botón Entendido / Cerrar -->
    <button id="motor-sheet-btn-close" style="width: 100%; padding: 14px; border-radius: 9999px; background: #2d3e2c; color: #ffffff; border: none; font-size: 14.5px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; box-shadow: 0 4px 14px rgba(45, 62, 44, 0.25);">
      <span class="material-symbols-outlined" style="font-size: 20px;">check</span>
      <span>Entendido</span>
    </button>
  `;

  const close = () => {
    sheet.classList.remove('open', 'expanded');
    scrim.classList.remove('open');
    setTimeout(() => { sheet.innerHTML = ''; }, 350);
  };

  sheet.classList.remove('expanded');
  sheet.scrollTop = 0;
  setupMotorSheetExpand(sheet, close, document.getElementById('motor-sheet-handle-box'));

  document.getElementById('motor-sheet-close')?.addEventListener('click', close);
  document.getElementById('motor-sheet-btn-close')?.addEventListener('click', close);
  scrim.onclick = close;

  requestAnimationFrame(() => {
    scrim.classList.add('open');
    sheet.classList.add('open');
  });
}

async function saveSession(motorId, mins, customDate = null, horaInicio = null, horaFin = null, operador = null) {
  try {
    const { data: motor } = await supabase.from('motores').select('horas, max_horas').eq('id', motorId).single();
    const prevHoras = parseFloat(motor?.horas) || 0;
    const newTotal = prevHoras + (mins / 60);
    const rounded = Math.round(newTotal * 10) / 10;
    const limit = window._currentMotorHasPrevMant ? (Number(motor?.max_horas) || 100) : 80;
    const finalOperador = (operador && operador.trim()) ? operador.trim() : await getCurrentUserName();

    if (rounded >= limit && prevHoras < limit) {
      localStorage.removeItem(`push_motor_ts_${motorId}`);
      localStorage.removeItem(`wa_motor_aceite_ts_${motorId}`);
      await restFetch(`/rest/v1/notifications?type=eq.motor_aceite&ref_id=eq.${encodeURIComponent(motorId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ read: true, ref_id: `${motorId}_done` }),
      }).catch(() => {});
    }

    await supabase.from('motor_sesiones').insert({
      motor_id: motorId,
      fecha: customDate ? new Date(customDate + 'T12:00:00').toISOString() : new Date().toISOString(),
      duracion_mins: mins,
      total_horas: rounded,
      operador: finalOperador,
      hora_inicio: horaInicio,
      hora_fin: horaFin
    });

    await supabase.from('motores').update({ horas: rounded }).eq('id', motorId);
    showSnackbar('Sesión registrada con éxito');

    if (rounded >= limit) {
      checkPushAlerts({ forceMotorId: motorId }).catch(() => {});
    }
  } catch (err) {
    console.error(err);
    showSnackbar('Error al guardar: ' + err.message, 'error');
  }
}

async function reloadDetalleSinParpadeo(motorId) {
  window.clearScreenCache?.('motores');
  window.refreshMotoresList?.();
  const currentScreen = document.querySelector('.screen-detalle-motor');
  if (currentScreen && currentScreen.parentElement) {
    const parent = currentScreen.parentElement;
    const html = await renderDetalleMotor(motorId);
    parent.innerHTML = html;
    initDetalleMotor(motorId);
  } else {
    window.navigateTo('detalle_motor', motorId);
  }
}

async function openFuelLoadBottomSheet(motorId) {
  const motor = window._currentMotorData;
  const stats = window._currentFuelStats;
  if (!motor || !stats) return;

  document.getElementById('fuel-load-sheet-overlay')?.remove();

  const seenLocations = new Set();
  const loteNames = [];
  const potreroNames = [];
  try {
    const [lotesRes, potrerosRes] = await Promise.all([
      supabase.from('lotes').select('id, nombre'),
      supabase.from('potreros').select('id, nombre'),
    ]);
    for (const x of (lotesRes?.data || [])) {
      const name = String(x?.nombre || '').trim();
      if (name && !seenLocations.has(name.toLowerCase())) {
        seenLocations.add(name.toLowerCase());
        loteNames.push(name);
      }
    }
    for (const x of (potrerosRes?.data || [])) {
      const name = String(x?.nombre || '').trim();
      if (name && !seenLocations.has(name.toLowerCase())) {
        seenLocations.add(name.toLowerCase());
        potreroNames.push(name);
      }
    }
  } catch {}

  let liters = 0;
  const todayIso = getLocalTodayIso();

  const overlay = document.createElement('div');
  overlay.id = 'fuel-load-sheet-overlay';
  overlay.setAttribute('data-motor-portal', '1');
  overlay.style.cssText = 'position:fixed; inset:0; z-index:100025; background:rgba(0,0,0,0.45); backdrop-filter:blur(2px); display:flex; align-items:flex-end; justify-content:center; opacity:0; transition:opacity 0.22s ease;';

  const locationOptionsHtml = [
    ...loteNames.map(name => `<option value="${escapeFuelHtml(name)}" data-icon="🌱" data-sub="Lote de cafetal">${escapeFuelHtml(name)}</option>`),
    ...potreroNames.map(name => `<option value="${escapeFuelHtml(name)}" data-icon="🌿" data-sub="Potrero">${escapeFuelHtml(name)}</option>`),
  ].join('');

  overlay.innerHTML = `
    <div id="fuel-load-sheet" style="width:100%; max-width:540px; height:100dvh; max-height:100dvh; background:#ffffff; display:flex; flex-direction:column; overflow:hidden; transform:translateY(100%); transition:transform 0.28s cubic-bezier(0.16, 1, 0.3, 1); font-family:'Plus Jakarta Sans', 'Work Sans', sans-serif; box-sizing:border-box;">
      <div style="flex-shrink:0; padding:calc(12px + env(safe-area-inset-top, 0px)) 18px 12px; border-bottom:1px solid #eef2ec; display:flex; align-items:center; justify-content:space-between; gap:12px;">
        <div style="min-width:0;">
          <h3 style="margin:0; font-size:18px; font-weight:800; color:#192b18;">Cargar gasolina</h3>
          <p style="margin:2px 0 0; font-size:12.5px; font-weight:600; color:#5a6658; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeFuelHtml(motor.nombre || 'Equipo')}</p>
        </div>
        <button type="button" id="fuel-load-sheet-close" aria-label="Cerrar" style="width:36px; height:36px; border-radius:50%; border:none; background:#f2f5f0; color:#192b18; display:flex; align-items:center; justify-content:center; cursor:pointer; flex-shrink:0;">
          <span class="material-symbols-outlined" style="font-size:20px;">close</span>
        </button>
      </div>

      <div style="flex:1 1 auto; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:18px 18px 24px; box-sizing:border-box;">
        <!-- Stepper -->
        <div style="display:flex; align-items:center; justify-content:center; gap:24px; margin:6px 0 24px;">
          <button type="button" id="fuel-step-minus" aria-label="Disminuir litros" style="width:46px; height:46px; border-radius:50%; border:1.5px solid #cbd5c9; background:#ffffff; color:#192b18; font-size:24px; font-weight:700; display:flex; align-items:center; justify-content:center; cursor:pointer;">&minus;</button>
          <div style="display:flex; align-items:baseline; gap:5px; min-width:86px; justify-content:center;">
            <span id="fuel-liters-display" style="font-size:38px; font-weight:800; color:#192b18; line-height:1;">0</span>
            <span id="fuel-liters-unit" style="font-size:18px; font-weight:700; color:#4f5d4e;">litros</span>
          </div>
          <button type="button" id="fuel-step-plus" aria-label="Aumentar litros" style="width:46px; height:46px; border-radius:50%; border:none; background:#2d3e2c; color:#ffffff; font-size:24px; font-weight:700; display:flex; align-items:center; justify-content:center; cursor:pointer; box-shadow:0 3px 10px rgba(45,62,44,0.22);">+</button>
        </div>

        <!-- Dónde se usó -->
        <div class="m3-field has-value" style="margin-bottom:16px;">
          <select id="fuel-load-location">
            <option value="" data-icon="📍" data-sub="Dejar sin ubicación específica">Sin especificar</option>
            ${locationOptionsHtml}
          </select>
          <label for="fuel-load-location">¿Dónde se usó? (opcional)</label>
        </div>

        <!-- Fecha -->
        <div style="margin-bottom:14px;">
          <div class="m3-field has-value" style="margin-bottom:0;">
            <input type="date" id="fuel-load-date" value="${todayIso}" placeholder=" ">
            <label for="fuel-load-date">Fecha</label>
          </div>
        </div>

        <!-- Precio por litro -->
        <div style="margin-bottom:8px;">
          <div class="m3-field ${stats.config.precioPorLitro > 0 ? 'has-value' : ''}" style="margin-bottom:0;">
            <input type="number" id="fuel-load-price" min="0" step="0.01" value="${stats.config.precioPorLitro > 0 ? stats.config.precioPorLitro : ''}" placeholder=" ">
            <label for="fuel-load-price">Precio por litro (L) · opcional</label>
          </div>
          <div id="fuel-load-cost-preview" style="display:none; font-size:12.5px; font-weight:700; color:#2e7d32; margin-top:6px; padding-left:4px;"></div>
        </div>

        <!-- Aviso Al guardar -->
        <div id="fuel-load-warning" style="display:none; background:#fff4ed; border:1px solid #fdba74; border-radius:14px; padding:12px 14px; margin-top:14px;"></div>
      </div>

      <div style="flex-shrink:0; background:#ffffff; border-top:1px solid #eef2ec; padding:12px 18px calc(18px + env(safe-area-inset-bottom, 0px));">
        <button type="button" id="btn-save-fuel-load" class="press-effect" style="width:100%; height:50px; border-radius:9999px; border:none; background:#2d3e2c; color:#ffffff; font-size:15px; font-weight:800; font-family:inherit; cursor:pointer; box-shadow:0 4px 14px rgba(45,62,44,0.28);">
          Guardar carga
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const sheet = overlay.querySelector('#fuel-load-sheet');
  const litersDisplay = overlay.querySelector('#fuel-liters-display');
  const litersUnit = overlay.querySelector('#fuel-liters-unit');
  const priceInput = overlay.querySelector('#fuel-load-price');
  const costPreview = overlay.querySelector('#fuel-load-cost-preview');
  const warningBox = overlay.querySelector('#fuel-load-warning');
  const saveBtn = overlay.querySelector('#btn-save-fuel-load');

  const closeSheet = () => {
    overlay.style.opacity = '0';
    if (sheet) sheet.style.transform = 'translateY(100%)';
    setTimeout(() => overlay.remove(), 260);
  };

  const syncLitersUI = () => {
    const litersTxt = formatLiters(liters);
    if (litersDisplay) litersDisplay.textContent = litersTxt;
    if (litersUnit) litersUnit.textContent = litersTxt === '1' ? 'litro' : 'litros';
    const unitPrice = parseFloat(priceInput?.value || '0') || 0;
    if (costPreview) {
      if (liters > 0 && unitPrice > 0) {
        costPreview.textContent = `Costo de esta carga: ${formatCurrencyL(liters * unitPrice)}`;
        costPreview.style.display = 'block';
      } else {
        costPreview.style.display = 'none';
      }
    }
    if (warningBox) {
      const triggered = liters > 0 ? stats.items.filter(it => (it.usedSince + liters) >= it.cada_litros) : [];
      if (triggered.length > 0) {
        const msgs = triggered.map(it =>
          `${escapeFuelHtml(it.nombre)} llega a su límite: toca ${escapeFuelHtml(it.desc ? it.desc.toLowerCase() : 'realizar mantenimiento')}.`
        );
        warningBox.innerHTML = `
          <div style="font-size:13px; font-weight:800; color:#c2410c;">Al guardar</div>
          <div style="font-size:12.5px; font-weight:600; color:#7c2d12; margin-top:2px; line-height:1.4;">${msgs.join('<br>')}</div>
        `;
        warningBox.style.display = 'block';
      } else {
        warningBox.style.display = 'none';
      }
    }
  };

  syncLitersUI();
  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    if (sheet) sheet.style.transform = 'translateY(0)';
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSheet();
  });
  overlay.querySelector('#fuel-load-sheet-close')?.addEventListener('click', closeSheet);

  priceInput?.addEventListener('input', () => {
    priceInput.closest('.m3-field')?.classList.toggle('has-value', !!priceInput.value);
    syncLitersUI();
  });

  overlay.querySelector('#fuel-step-minus')?.addEventListener('click', () => {
    liters = Math.max(0, Math.round((liters - 0.5) * 10) / 10);
    syncLitersUI();
  });
  overlay.querySelector('#fuel-step-plus')?.addEventListener('click', () => {
    liters = Math.round((liters + 0.5) * 10) / 10;
    syncLitersUI();
  });

  saveBtn?.addEventListener('click', async () => {
    if (!saveBtn) return;
    if (!(liters > 0)) {
      showSnackbar('Indica los litros de gasolina a cargar', 'error');
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Guardando...';
    try {
      const empresaId = motor.empresa_id || window._currentEmpresaId || loadEmpresaId() || localStorage.getItem('current_empresa_id');
      if (!empresaId) throw new Error('No se encontró la finca activa');
      const operador = window._currentUserName || await getCurrentUserName();
      const selectedLocation = (overlay.querySelector('#fuel-load-location')?.value || '').trim();
      const unitPrice = Math.max(0, Math.round((parseFloat(priceInput?.value || '0') || 0) * 100) / 100);
      const dateVal = overlay.querySelector('#fuel-load-date')?.value || todayIso;
      const parsedDate = dateVal === todayIso ? null : new Date(`${dateVal}T12:00:00`);
      const fechaIso = (parsedDate && !Number.isNaN(parsedDate.getTime()))
        ? parsedDate.toISOString()
        : new Date().toISOString();
      const duracionMins = Math.max(1, Math.round(liters * (stats.config?.horasPorLitro || 2) * 60));

      const created = await restFetch('/rest/v1/motor_sesiones', {
        method: 'POST',
        body: JSON.stringify({
          motor_id: motorId,
          empresa_id: empresaId,
          fecha: fechaIso,
          duracion_mins: duracionMins,
          total_horas: liters,
          operador,
          hora_inicio: encodeFuelLoadTag(unitPrice),
          hora_fin: selectedLocation || null,
        }),
      });
      const savedRow = Array.isArray(created) ? created[0] : created;
      if (navigator.onLine && !savedRow?.id) {
        throw new Error('Supabase no confirmó el guardado de la carga');
      }
      if (savedRow?.id) await db.motor_sesiones.put(savedRow).catch(() => {});

      if (unitPrice > 0) saveSharedFuelPrice(empresaId, unitPrice);
      if (unitPrice > 0 && Math.abs(unitPrice - (stats.config?.precioPorLitro || 0)) > 0.001) {
        const cfg = stats.config;
        const updatedNotas = serializeMotorNotas(cfg.cleanNotas, {
          modo: cfg.modo,
          horasPorLitro: cfg.horasPorLitro,
          precioPorLitro: unitPrice,
          mantenimientos: cfg.mantenimientos,
          forceTag: isLikelyFuelEquipment(motor.icon, motor.nombre),
        });
        const updMotor = await restFetch(`/rest/v1/motores?id=eq.${encodeURIComponent(motorId)}`, {
          method: 'PATCH',
          body: JSON.stringify({ notas: updatedNotas }),
        }).catch(() => null);
        const savedMotor = Array.isArray(updMotor) ? updMotor[0] : updMotor;
        if (savedMotor?.id) await db.motores.put(savedMotor).catch(() => {});
        if (navigator.onLine) await syncTable('motores', true).catch(() => {});
      }

      if (navigator.onLine) await syncTable('motor_sesiones', true).catch(() => {});

      closeSheet();
      showSnackbar('Carga de gasolina guardada');
      await reloadDetalleSinParpadeo(motorId);
    } catch (err) {
      console.error('Error guardando carga gasolina:', err);
      showSnackbar('Error al guardar: ' + (err?.message || err), 'error');
    } finally {
      if (document.body.contains(saveBtn)) {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Guardar carga';
      }
    }
  });
}

function openFuelPriceBottomSheet(motorId) {
  const motor = window._currentMotorData;
  const stats = window._currentFuelStats;
  if (!motor || !stats) return;

  document.getElementById('fuel-price-sheet-overlay')?.remove();

  const curPrice = stats.config?.precioPorLitro > 0 ? String(stats.config.precioPorLitro) : '';

  const overlay = document.createElement('div');
  overlay.id = 'fuel-price-sheet-overlay';
  overlay.setAttribute('data-motor-portal', '1');
  overlay.style.cssText = 'position:fixed; inset:0; z-index:100026; background:rgba(15,25,16,0.48); backdrop-filter:blur(2px); display:flex; align-items:flex-end; justify-content:center; opacity:0; transition:opacity 0.2s ease;';

  overlay.innerHTML = `
    <div id="fuel-price-sheet" style="width:100%; max-width:520px; background:#ffffff; border-radius:28px 28px 0 0; padding:12px 20px calc(22px + env(safe-area-inset-bottom, 0px)); box-shadow:0 -10px 32px rgba(0,0,0,0.18); transform:translateY(100%); transition:transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1); font-family:'Plus Jakarta Sans', 'Work Sans', sans-serif;">
      <div style="width:36px; height:4px; border-radius:99px; background:#c5cdc2; margin:0 auto 14px;"></div>
      <div style="display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:4px;">
        <div style="font-size:18px; font-weight:800; color:#192b18;">Precio de la gasolina</div>
        <button type="button" id="fuel-price-sheet-close" aria-label="Cerrar" style="width:36px; height:36px; border-radius:50%; border:none; background:#f2f5f0; color:#192b18; font-size:20px; line-height:1; cursor:pointer; display:flex; align-items:center; justify-content:center;">&times;</button>
      </div>
      <div style="font-size:12.5px; color:#5a6658; font-weight:600; margin-bottom:14px;">${escapeFuelHtml(motor.nombre || 'Equipo')}</div>

      <div class="m3-field ${curPrice ? 'has-value' : ''}" id="fuel-price-field" style="margin:0 0 8px;">
        <input type="number" id="fuel-price-sheet-input" min="0" step="0.01" value="${escapeFuelHtml(curPrice)}" placeholder=" ">
        <label for="fuel-price-sheet-input">Precio por litro (L)</label>
      </div>
      <div style="font-size:12px; color:#657263; line-height:1.4;">Se usará para calcular el gasto consumido por día, semana, mes y total.</div>

      <div style="display:flex; justify-content:flex-end; align-items:center; gap:10px; margin-top:20px;">
        <button type="button" id="fuel-price-sheet-cancel" style="height:44px; padding:0 18px; border-radius:99px; border:none; background:transparent; color:#2d3e2c; font-weight:700; font-size:14px; font-family:inherit; cursor:pointer;">Cancelar</button>
        <button type="button" id="fuel-price-sheet-save" style="height:44px; padding:0 22px; border-radius:99px; border:none; background:#2d3e2c; color:#ffffff; font-weight:800; font-size:14px; font-family:inherit; cursor:pointer; box-shadow:0 2px 6px rgba(45,62,44,0.25);">Guardar precio</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  const sheet = overlay.querySelector('#fuel-price-sheet');
  const priceField = overlay.querySelector('#fuel-price-field');
  const priceInp = overlay.querySelector('#fuel-price-sheet-input');
  const savePriceBtn = overlay.querySelector('#fuel-price-sheet-save');

  const closePriceSheet = () => {
    overlay.style.opacity = '0';
    if (sheet) sheet.style.transform = 'translateY(100%)';
    setTimeout(() => overlay.remove(), 220);
  };

  requestAnimationFrame(() => {
    overlay.style.opacity = '1';
    if (sheet) sheet.style.transform = 'translateY(0)';
  });

  priceInp?.addEventListener('input', () => {
    priceField?.classList.toggle('has-value', !!priceInp.value);
  });

  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closePriceSheet();
  });
  overlay.querySelector('#fuel-price-sheet-close')?.addEventListener('click', closePriceSheet);
  overlay.querySelector('#fuel-price-sheet-cancel')?.addEventListener('click', closePriceSheet);

  const handleSavePrice = async () => {
    const rawStr = (priceInp?.value || '').trim();
    const parsed = rawStr === '' ? 0 : parseFloat(rawStr);
    if (Number.isNaN(parsed) || parsed < 0) {
      showSnackbar('Ingresa un precio válido', 'error');
      priceInp?.focus();
      return;
    }
    const newPrice = Math.round(parsed * 100) / 100;
    if (savePriceBtn) {
      savePriceBtn.disabled = true;
      savePriceBtn.textContent = 'Guardando...';
    }
    try {
      const cfg = stats.config;
      const updatedNotas = serializeMotorNotas(cfg.cleanNotas, {
        modo: cfg.modo,
        horasPorLitro: cfg.horasPorLitro,
        precioPorLitro: newPrice,
        mantenimientos: cfg.mantenimientos,
        forceTag: isLikelyFuelEquipment(motor.icon, motor.nombre),
      });
      const updated = await restFetch(`/rest/v1/motores?id=eq.${encodeURIComponent(motorId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ notas: updatedNotas }),
      });
      const savedRow = Array.isArray(updated) ? updated[0] : updated;
      if (savedRow?.id) await db.motores.put(savedRow).catch(() => {});
      if (newPrice > 0) saveSharedFuelPrice(motor.empresa_id || window._currentEmpresaId || loadEmpresaId() || localStorage.getItem('current_empresa_id'), newPrice);
      if (navigator.onLine) await syncTable('motores', true).catch(() => {});
      window.clearScreenCache?.('motores');
      window.clearScreenCache?.('detalle_motor');
      closePriceSheet();
      showSnackbar(newPrice > 0 ? 'Precio por litro guardado' : 'Precio eliminado');
      await reloadDetalleSinParpadeo(motorId);
    } catch (err) {
      console.error('Error guardando precio gasolina:', err);
      showSnackbar('Error al guardar: ' + (err?.message || err), 'error');
      if (savePriceBtn && document.body.contains(savePriceBtn)) {
        savePriceBtn.disabled = false;
        savePriceBtn.textContent = 'Guardar precio';
      }
    }
  };

  priceInp?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleSavePrice();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closePriceSheet();
    }
  });
  savePriceBtn?.addEventListener('click', handleSavePrice);

  setTimeout(() => priceInp?.focus(), 90);
}

function parseFuelLocalIso(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

function formatFuelLocalIso(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function shiftFuelIsoDays(iso, delta) {
  const d = parseFuelLocalIso(iso);
  d.setDate(d.getDate() + delta);
  return formatFuelLocalIso(d);
}

function shiftFuelIsoMonths(iso, delta) {
  const d = parseFuelLocalIso(iso);
  const targetDay = d.getDate();
  const shifted = new Date(d.getFullYear(), d.getMonth() + delta, 1);
  const lastDay = new Date(shifted.getFullYear(), shifted.getMonth() + 1, 0).getDate();
  shifted.setDate(Math.min(targetDay, lastDay));
  return formatFuelLocalIso(shifted);
}

function getFuelMondayDate(iso) {
  const base = parseFuelLocalIso(iso);
  const jsDay = base.getDay();
  const diffToMon = jsDay === 0 ? -6 : 1 - jsDay;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate() + diffToMon);
}

function getFuelMonthWeeks(year, month) {
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weeks = [];
  let d = 1;
  let idx = 1;
  while (d <= daysInMonth) {
    const startDt = new Date(year, month, d);
    const jsDay = startDt.getDay();
    const diffToSun = jsDay === 0 ? 0 : 7 - jsDay;
    const dMax = Math.min(daysInMonth, d + diffToSun);
    weeks.push({
      idx,
      label: `Sem ${idx}`,
      rangeText: d === dMax ? String(d) : `${d}–${dMax}`,
      dMin: d,
      dMax,
      anchorIso: formatFuelLocalIso(new Date(year, month, d)),
    });
    d = dMax + 1;
    idx += 1;
  }
  return weeks;
}

function canFuelNavigateNext(period, dateIso) {
  const todayIso = getLocalTodayIso();
  if (period === 'day' || period === 'week') {
    const curMon = formatFuelLocalIso(getFuelMondayDate(dateIso));
    const todayMon = formatFuelLocalIso(getFuelMondayDate(todayIso));
    return curMon < todayMon;
  }
  if (period === 'month') {
    const c = parseFuelLocalIso(dateIso);
    const t = parseFuelLocalIso(todayIso);
    return (c.getFullYear() * 12 + c.getMonth()) < (t.getFullYear() * 12 + t.getMonth());
  }
  return false;
}

function getFuelPeriodRange(period, dateIso) {
  const target = parseFuelLocalIso(dateIso);
  const fmtDM = (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' }).replace(/\.$/, '');
  const fmtDMY = (d) => d.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }).replace(/\.$/, '');

  if (period === 'day') {
    const start = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 0, 0, 0, 0);
    const end = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 23, 59, 59, 999);
    const wd = start.toLocaleDateString('es-ES', { weekday: 'short' }).replace(/\.$/, '');
    const mn = start.toLocaleDateString('es-ES', { month: 'short' }).replace(/\.$/, '');
    const label = `${wd.charAt(0).toUpperCase() + wd.slice(1)}, ${start.getDate()} ${mn.charAt(0).toUpperCase() + mn.slice(1)}`;
    return { start, end, label };
  }

  if (period === 'week') {
    const start = getFuelMondayDate(dateIso);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
    const label = start.getFullYear() === end.getFullYear()
      ? `${fmtDM(start)} – ${fmtDM(end)}`
      : `${fmtDMY(start)} – ${fmtDMY(end)}`;
    return { start, end, label };
  }

  if (period === 'month') {
    const start = new Date(target.getFullYear(), target.getMonth(), 1, 0, 0, 0, 0);
    const end = new Date(target.getFullYear(), target.getMonth() + 1, 0, 23, 59, 59, 999);
    const rawM = start.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    const label = rawM.charAt(0).toUpperCase() + rawM.slice(1);
    return { start, end, label };
  }

  return { start: null, end: null, label: 'Todo el historial' };
}

function initFuelDetalleMotor(motorId) {
  if (!window._fuelPeriodState || window._fuelPeriodState.motorId !== motorId || !window._fuelPeriodState.dateIso) {
    window._fuelPeriodState = {
      motorId,
      period: window._fuelPeriodState?.period || 'week',
      dateIso: getLocalTodayIso(),
      subDayIso: null,
    };
  } else if (window._fuelPeriodState.subDayIso === undefined) {
    window._fuelPeriodState.subDayIso = null;
  }

  const areaCatalogsPromise = fetchAreaCatalogs().catch(() => ({ lotes: [], potreros: [] }));

  const bindLoadDeletes = () => {
    document.querySelectorAll('[data-fuel-load-delete]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const loadId = btn.dataset.fuelLoadDelete;
        if (!loadId) return;
        const linkedGasto = window._currentFuelSentMap?.get(String(loadId)) || null;
        const confirmMsg = linkedGasto
          ? '¿Eliminar esta carga de gasolina y su gasto registrado en Cuentas?'
          : '¿Eliminar esta carga de gasolina?';
        window.Snackbar.confirm(confirmMsg, async () => {
          try {
            const deleted = await restFetch(`/rest/v1/motor_sesiones?id=eq.${encodeURIComponent(loadId)}`, {
              method: 'DELETE',
            });
            if (navigator.onLine && (!Array.isArray(deleted) || deleted.length === 0)) {
              throw new Error('No se pudo eliminar la carga en Supabase');
            }
            await db.motor_sesiones.delete(loadId).catch(() => {});
            if (linkedGasto?.id) {
              await restFetch(`/rest/v1/gastos?id=eq.${encodeURIComponent(linkedGasto.id)}`, {
                method: 'DELETE',
              }).catch(() => {});
              await db.gastos.delete(linkedGasto.id).catch(() => {});
              if (navigator.onLine) await syncTable('gastos', true).catch(() => {});
              window.clearScreenCache?.('gastos');
            }
            if (navigator.onLine) await syncTable('motor_sesiones', true).catch(() => {});
            showSnackbar('Carga eliminada');
            await reloadDetalleSinParpadeo(motorId);
          } catch (err) {
            console.error('Error eliminando carga:', err);
            showSnackbar('Error: ' + (err?.message || err), 'error');
          }
        });
      });
    });
  };

  const bindLoadNavigations = () => {
    document.querySelectorAll('[data-fuel-row-nav="cuentas"], [data-fuel-row-nav="pending"]').forEach((el) => {
      el.addEventListener('click', async () => {
        const navType = el.dataset.fuelRowNav;
        if (navType === 'cuentas') {
          window.closeSubBottomSheet?.();
          window.navigateTo('gastos');
          return;
        }
        if (navType === 'pending') {
          const rawLoc = el.dataset.fuelLoc || '';
          const normLoc = normalizeAreaName(rawLoc);
          if (!normLoc || normLoc === 'sin especificar') {
            showSnackbar('Esta carga no está asociada a un lote o potrero registrado');
            return;
          }
          const { lotes = [], potreros = [] } = await areaCatalogsPromise;
          const matchLote =
            lotes.find(l => normalizeAreaName(l.nombre) === normLoc) ||
            lotes.find(l => {
              const n = normalizeAreaName(l.nombre);
              return n && (n.includes(normLoc) || normLoc.includes(n));
            });
          if (matchLote) {
            window._pendingOpenLote = { loteId: matchLote.id, tab: 'balance' };
            window.closeSubBottomSheet?.();
            window.navigateTo('dashboard');
            return;
          }
          const matchPotrero =
            potreros.find(pt => normalizeAreaName(pt.nombre) === normLoc) ||
            potreros.find(pt => {
              const n = normalizeAreaName(pt.nombre);
              return n && (n.includes(normLoc) || normLoc.includes(n));
            });
          if (matchPotrero) {
            window._pendingOpenPotreroId = matchPotrero.id;
            window.closeSubBottomSheet?.();
            window.navigateTo('potreros');
            return;
          }
          showSnackbar('Esta carga no está asociada a un lote o potrero registrado');
        }
      });
    });
  };

  const renderFuelPeriodView = (shouldCenterTab = false) => {
    const stats = window._currentFuelStats;
    if (!stats) return;
    const todayIso = getLocalTodayIso();
    const period = window._fuelPeriodState?.period || 'week';
    const dateIso = window._fuelPeriodState?.dateIso || todayIso;
    const range = getFuelPeriodRange(period, dateIso);

    const tabsWrap = document.getElementById('fuel-period-tabs');
    const prevScroll = tabsWrap ? tabsWrap.scrollLeft : 0;
    let activeTab = null;
    document.querySelectorAll('.fuel-period-tab').forEach((tab) => {
      const active = tab.dataset.period === period;
      tab.style.background = active ? '#2d3e2c' : '#ffffff';
      tab.style.color = active ? '#ffffff' : '#3c4a3b';
      tab.style.borderColor = active ? '#2d3e2c' : '#d8e1d5';
      if (active) activeTab = tab;
    });
    if (tabsWrap) tabsWrap.scrollLeft = prevScroll;
    if (shouldCenterTab && activeTab) {
      requestAnimationFrame(() => {
        activeTab.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
      });
    }

    const navEl = document.getElementById('fuel-period-nav');
    const labelEl = document.getElementById('fuel-period-label');
    const nextBtn = document.getElementById('fuel-period-next');
    if (navEl) navEl.style.display = period === 'all' ? 'none' : 'flex';
    if (labelEl) labelEl.textContent = range.label;
    if (nextBtn) {
      const canNext = canFuelNavigateNext(period, dateIso);
      nextBtn.disabled = !canNext;
      nextBtn.style.opacity = canNext ? '1' : '0.35';
      nextBtn.style.cursor = canNext ? 'pointer' : 'default';
    }

    const litersByIso = new Map();
    for (const l of stats.fuelLoads) {
      const d = new Date(l.fecha || l.created_at || 0);
      if (Number.isNaN(d.getTime())) continue;
      const k = formatFuelLocalIso(d);
      litersByIso.set(k, Math.round(((litersByIso.get(k) || 0) + l._liters) * 10) / 10);
    }

    const periodLoads = period === 'all'
      ? stats.fuelLoads
      : stats.fuelLoads.filter((l) => {
          const d = new Date(l.fecha || l.created_at || 0);
          return !Number.isNaN(d.getTime()) && d >= range.start && d <= range.end;
        });

    const rawSubDay = (period === 'month' || period === 'week') ? (window._fuelPeriodState?.subDayIso || null) : null;
    const activeSubDay = (rawSubDay && range.start && range.end && rawSubDay >= formatFuelLocalIso(range.start) && rawSubDay <= formatFuelLocalIso(range.end))
      ? rawSubDay
      : null;

    const filteredLoads = activeSubDay
      ? periodLoads.filter((l) => {
          const d = new Date(l.fecha || l.created_at || 0);
          return !Number.isNaN(d.getTime()) && formatFuelLocalIso(d) === activeSubDay;
        })
      : periodLoads;

    const periodLiters = Math.round(filteredLoads.reduce((a, b) => a + b._liters, 0) * 10) / 10;
    const periodCost = Math.round(filteredLoads.reduce((a, b) => a + b._cost, 0) * 100) / 100;

    window._currentPeriodFilteredLoads = filteredLoads;
    const sentMap = window._currentFuelSentMap || new Map();
    const pricedLoads = filteredLoads.filter(l => l._cost > 0);
    const pendingLoads = pricedLoads.filter((l) => {
      const existing = sentMap.get(String(l.id));
      return !existing || Math.abs((Number(existing.monto) || 0) - l._cost) >= 0.01;
    });
    const hasUpdates = pendingLoads.some(l => sentMap.has(String(l.id)));
    const pendingAmount = Math.round(pendingLoads.reduce((s, l) => s + l._cost, 0) * 100) / 100;

    const ctaGrid = document.getElementById('fuel-cta-grid');
    const sendBtn = document.getElementById('btn-send-fuel-cuentas');
    const sendTitle = document.getElementById('btn-send-fuel-cuentas-title');
    const sendAmt = document.getElementById('btn-send-fuel-cuentas-amt');
    if (sendBtn && sendTitle && sendAmt) {
      if (pendingLoads.length > 0) {
        if (ctaGrid) ctaGrid.style.gridTemplateColumns = '1fr 1fr';
        sendBtn.style.display = 'flex';
        sendBtn.disabled = false;
        sendBtn.style.opacity = '1';
        sendBtn.style.cursor = 'pointer';
        sendBtn.style.background = '#ffffff';
        sendBtn.style.borderColor = '#2d3e2c';
        sendBtn.style.color = '#2d3e2c';
        sendTitle.textContent = hasUpdates ? 'Actualizar Cuentas' : 'Enviar a Cuentas';
        sendAmt.textContent = formatCurrencyL(pendingAmount);
        sendAmt.style.color = '#2e7d32';
      } else {
        sendBtn.style.display = 'none';
        if (ctaGrid) ctaGrid.style.gridTemplateColumns = '1fr';
      }
    }

    const heroTitleEl = document.getElementById('fuel-hero-title');
    const heroLitersEl = document.getElementById('fuel-hero-liters');
    const heroMetaEl = document.getElementById('fuel-hero-meta');
    if (heroTitleEl) {
      heroTitleEl.textContent = activeSubDay
        ? `Gasolina usada · ${getFuelPeriodRange('day', activeSubDay).label}`
        : (period === 'all' ? 'Gasolina usada en total' : 'Gasolina usada');
    }
    if (heroLitersEl) {
      heroLitersEl.textContent = formatLitersLabel(periodLiters);
    }
    if (heroMetaEl) {
      const loadsTxt = `${filteredLoads.length} ${filteredLoads.length === 1 ? 'carga' : 'cargas'}`;
      if (periodCost > 0) {
        heroMetaEl.innerHTML = `<span style="color:#2e7d32;">${escapeFuelHtml(formatCurrencyL(periodCost))}</span><span style="color:#657263; font-weight:600;"> · ${loadsTxt}</span>`;
      } else if (filteredLoads.length > 0) {
        heroMetaEl.innerHTML = `<span style="color:#657263; font-weight:600;">${loadsTxt}</span>`;
      } else {
        heroMetaEl.innerHTML = `<span style="color:#657263; font-weight:600;">Sin cargas</span>`;
      }
    }

    const renderDayLoadsHtml = (loadsList, emptyMsg) => {
      if (!loadsList.length) {
        return `<div style="text-align:center; font-size:12px; font-weight:600; color:#6d786c; padding:10px 0 4px;">${emptyMsg}</div>`;
      }
      const maxL = Math.max(...loadsList.map(l => l._liters), 0.1);
      return `
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${loadsList.map((load) => {
            const loc = String(load.hora_fin || '').trim() || 'Sin especificar';
            const wPct = Math.max(8, Math.round((load._liters / maxL) * 100));
            const sentRow = sentMap.get(String(load.id));
            const isSent = Boolean(sentRow);
            const isChanged = isSent && Math.abs((Number(sentRow.monto) || 0) - load._cost) >= 0.01;
            const isInCuentas = load._cost > 0 && isSent && !isChanged;
            const isPendingState = load._cost > 0 && !isInCuentas;
            const rowNavType = isInCuentas ? 'cuentas' : (isPendingState ? 'pending' : '');
            const statusBadge = load._cost > 0
              ? (isInCuentas
                  ? `<button type="button" data-fuel-go-cuentas="1" style="border:none; cursor:pointer; font-family:inherit; padding:2px 8px; border-radius:999px; background:#eef5ec; color:#1b6e1b; font-size:10px; font-weight:700; display:inline-flex; align-items:center; gap:2px; white-space:nowrap;"><span>✓ En Cuentas</span><span aria-hidden="true" style="font-size:11px; opacity:0.8;">›</span></button>`
                  : `<button type="button" data-fuel-go-pending-loc="${escapeFuelHtml(loc)}" style="border:none; cursor:pointer; font-family:inherit; padding:2px 8px; border-radius:999px; background:#fff4ed; color:#b34200; font-size:10px; font-weight:700; display:inline-flex; align-items:center; gap:2px; white-space:nowrap;"><span>${isChanged ? 'Por actualizar' : 'Pendiente'}</span><span aria-hidden="true" style="font-size:11px; opacity:0.8;">›</span></button>`)
              : '';
            return `
              <div>
                <div style="display:flex; justify-content:space-between; align-items:center; gap:6px; margin-bottom:4px;">
                  <div ${rowNavType ? `data-fuel-row-nav="${rowNavType}" data-fuel-loc="${escapeFuelHtml(loc)}"` : ''} style="min-width:0; flex:1; display:flex; align-items:center; gap:6px; flex-wrap:wrap; ${rowNavType ? 'cursor:pointer;' : ''}">
                    <span style="font-size:12.5px; font-weight:700; color:#192b18; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${escapeFuelHtml(loc)}</span>
                    ${statusBadge}
                  </div>
                  <div style="display:flex; align-items:center; gap:4px; flex-shrink:0;">
                    <span style="font-size:12px; font-weight:800; color:#192b18; white-space:nowrap;">${formatLitersLabel(load._liters)}${load._cost > 0 ? ` · ${escapeFuelHtml(formatCurrencyL(load._cost))}` : ''}</span>
                    <button type="button" data-fuel-load-delete="${escapeFuelHtml(load.id)}" aria-label="Eliminar carga" title="Eliminar carga" style="width:26px; height:26px; border-radius:50%; border:none; background:transparent; color:#7a8578; cursor:pointer; display:inline-flex; align-items:center; justify-content:center; flex-shrink:0;">
                      <span class="material-symbols-outlined" style="font-size:16px;">delete</span>
                    </button>
                  </div>
                </div>
                <div style="height:5px; background:#e6ece4; border-radius:9999px; overflow:hidden;">
                  <div style="width:${wPct}%; height:100%; background:#2d3e2c; border-radius:9999px;"></div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    };

    const barsEl = document.getElementById('fuel-period-bars');
    if (barsEl) {
      const weekDayShort = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
      if (period === 'day') {
        const monDt = getFuelMondayDate(dateIso);
        const stripHtml = `
          <div style="display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:4px;">
            ${weekDayShort.map((dName, idx) => {
              const dt = new Date(monDt.getFullYear(), monDt.getMonth(), monDt.getDate() + idx);
              const dIso = formatFuelLocalIso(dt);
              const isSel = dIso === dateIso;
              const isToday = dIso === todayIso;
              const hasLit = (litersByIso.get(dIso) || 0) > 0;
              return `
                <button type="button" data-fuel-select-day="${dIso}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:7px 2px; min-height:54px; border-radius:14px; border:1px solid ${isSel ? '#2d3e2c' : '#e6ece4'}; background:${isSel ? '#2d3e2c' : '#fafcf9'}; color:${isSel ? '#ffffff' : '#192b18'}; cursor:pointer; font-family:inherit; transition:all 0.15s ease;">
                  <span style="font-size:10.5px; font-weight:700; opacity:${isSel ? '0.9' : '0.68'};">${dName}</span>
                  <span style="font-size:14.5px; font-weight:800; margin-top:2px; color:${isToday ? '#ff6b00' : (isSel ? '#ffffff' : '#192b18')};">${dt.getDate()}</span>
                  <span style="width:5px; height:5px; border-radius:50%; margin-top:3px; background:${hasLit ? (isSel ? '#ffffff' : '#2e7d32') : 'transparent'};"></span>
                </button>
              `;
            }).join('')}
          </div>
        `;

        const dayBodyHtml = renderDayLoadsHtml(filteredLoads, 'Sin actividad registrada este día.');
        barsEl.innerHTML = `${stripHtml}<div style="border-top:1px solid #eef2ec; margin-top:10px; padding-top:10px;">${dayBodyHtml}</div>`;
      } else if (period === 'week' && range.start) {
        const buckets = weekDayShort.map((lbl, idx) => {
          const dayD = new Date(range.start.getFullYear(), range.start.getMonth(), range.start.getDate() + idx);
          const dayIso = formatFuelLocalIso(dayD);
          const dayLit = Math.round(
            periodLoads
              .filter((l) => {
                const d = new Date(l.fecha || l.created_at || 0);
                return !Number.isNaN(d.getTime()) && formatFuelLocalIso(d) === dayIso;
              })
              .reduce((a, b) => a + b._liters, 0) * 10
          ) / 10;
          return { lbl, dayNum: dayD.getDate(), dayIso, isToday: dayIso === todayIso, liters: dayLit };
        });
        const maxL = Math.max(...buckets.map(b => b.liters), 0.1);
        const dayStripHtml = `
          <div style="display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:4px;">
            ${buckets.map(b => {
              const hasLit = b.liters > 0;
              const isSel = b.dayIso === activeSubDay;
              return `
                <button type="button" data-fuel-toggle-subday="${b.dayIso}" style="display:flex; flex-direction:column; align-items:center; justify-content:center; padding:7px 2px; min-height:52px; border-radius:14px; border:1px solid ${isSel ? '#2d3e2c' : (hasLit ? '#c5dcc0' : '#e6ece4')}; background:${isSel ? '#2d3e2c' : (hasLit ? '#eff5ec' : '#fafcf9')}; color:${isSel ? '#ffffff' : '#192b18'}; cursor:pointer; font-family:inherit; transition:all 0.15s ease;">
                  <span style="font-size:10.5px; font-weight:700; opacity:${isSel ? '0.9' : '0.68'};">${b.lbl}</span>
                  <span style="font-size:14px; font-weight:800; margin-top:2px; color:${b.isToday ? '#ff6b00' : (isSel ? '#ffffff' : '#192b18')};">${b.dayNum}</span>
                  <span style="width:5px; height:5px; border-radius:50%; margin-top:3px; background:${hasLit ? (isSel ? '#ffffff' : '#2e7d32') : 'transparent'};"></span>
                </button>
              `;
            }).join('')}
          </div>
        `;
        const weekBarsHtml = `
          <div style="border-top:1px solid #eef2ec; margin-top:10px; padding-top:8px;">
            <div style="display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:4px; align-items:end; min-height:68px;">
              ${buckets.map(b => {
                const barH = b.liters > 0 ? Math.max(10, Math.round((b.liters / maxL) * 46)) : 4;
                const dimmed = activeSubDay && b.dayIso !== activeSubDay;
                return `
                  <button type="button" data-fuel-toggle-subday="${b.dayIso}" style="display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; border:none; background:transparent; padding:0; cursor:pointer; font-family:inherit; opacity:${dimmed ? '0.4' : '1'}; transition:opacity 0.15s ease;">
                    <span style="font-size:10px; font-weight:800; color:${b.liters > 0 ? '#2d3e2c' : 'transparent'}; margin-bottom:3px; white-space:nowrap;">${b.liters > 0 ? `${formatLiters(b.liters)} lt` : '0'}</span>
                    <div style="width:100%; max-width:26px; height:${barH}px; border-radius:6px; background:${b.liters > 0 ? '#2d3e2c' : '#e4ebe2'}; transition:height 0.25s ease;"></div>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;
        const subDayPanelHtml = activeSubDay ? `
          <div style="border-top:1px solid #eef2ec; margin-top:10px; padding-top:8px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; background:#eff5ec; border:1px solid #cfe0cc; border-radius:10px; padding:6px 10px;">
              <span style="font-size:11.5px; font-weight:700; color:#2d3e2c;">Filtrando: ${escapeFuelHtml(getFuelPeriodRange('day', activeSubDay).label)}</span>
              <button type="button" data-fuel-clear-subday="1" style="border:none; background:#ffffff; color:#2d3e2c; border-radius:999px; padding:3px 9px; font-size:11px; font-weight:800; cursor:pointer; font-family:inherit;">Ver semana ✕</button>
            </div>
            <div style="margin-top:8px;">
              ${renderDayLoadsHtml(filteredLoads, 'Sin actividad registrada este día.')}
            </div>
          </div>
        ` : '';
        barsEl.innerHTML = dayStripHtml + weekBarsHtml + subDayPanelHtml;
      } else if (period === 'month' && range.start && range.end) {
        const y = range.start.getFullYear();
        const m = range.start.getMonth();
        const daysInMonth = range.end.getDate();
        const firstDayJs = new Date(y, m, 1).getDay();
        const startOffset = (firstDayJs + 6) % 7;

        const cells = [];
        for (let i = 0; i < startOffset; i++) cells.push({ empty: true });
        for (let day = 1; day <= daysInMonth; day++) {
          const iso = formatFuelLocalIso(new Date(y, m, day));
          cells.push({
            day,
            iso,
            isToday: iso === todayIso,
            liters: litersByIso.get(iso) || 0,
          });
        }

        const monthCalHtml = `
          <div>
            <div style="display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); text-align:center; margin-bottom:4px;">
              ${weekDayShort.map(w => `<span style="font-size:10.5px; font-weight:700; color:#647462; padding:2px 0;">${w}</span>`).join('')}
            </div>
            <div style="display:grid; grid-template-columns:repeat(7, minmax(0, 1fr)); gap:3px; text-align:center;">
              ${cells.map(c => {
                if (c.empty) return `<span></span>`;
                const hasLit = c.liters > 0;
                const isSel = c.iso === activeSubDay;
                return `
                  <button type="button" data-fuel-toggle-subday="${c.iso}" style="height:34px; border-radius:10px; border:1px solid ${isSel ? '#2d3e2c' : (hasLit ? '#c5dcc0' : 'transparent')}; background:${isSel ? '#2d3e2c' : (hasLit ? '#e8f3e6' : 'transparent')}; color:${c.isToday ? '#ff6b00' : (isSel ? '#ffffff' : '#192b18')}; font-size:12.5px; font-weight:${c.isToday || hasLit || isSel ? '800' : '600'}; cursor:pointer; display:flex; flex-direction:column; align-items:center; justify-content:center; gap:1px; padding:0; font-family:inherit;">
                    <span>${c.day}</span>
                    <span style="width:4px; height:4px; border-radius:50%; background:${hasLit ? (isSel ? '#ffffff' : '#2e7d32') : 'transparent'};"></span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;

        const subDayPanelHtml = activeSubDay ? `
          <div style="margin-top:8px;">
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; background:#eff5ec; border:1px solid #cfe0cc; border-radius:10px; padding:6px 10px;">
              <span style="font-size:11.5px; font-weight:700; color:#2d3e2c;">Filtrando: ${escapeFuelHtml(getFuelPeriodRange('day', activeSubDay).label)}</span>
              <button type="button" data-fuel-clear-subday="1" style="border:none; background:#ffffff; color:#2d3e2c; border-radius:999px; padding:3px 9px; font-size:11px; font-weight:800; cursor:pointer; font-family:inherit;">Ver todo el mes ✕</button>
            </div>
            <div style="margin-top:8px;">
              ${renderDayLoadsHtml(filteredLoads, 'Sin actividad registrada este día.')}
            </div>
          </div>
        ` : '';

        const weeks = getFuelMonthWeeks(y, m);
        const weekBuckets = weeks.map((w) => {
          const lit = Math.round(
            periodLoads
              .filter((l) => {
                const dayNum = new Date(l.fecha || l.created_at || 0).getDate();
                return dayNum >= w.dMin && dayNum <= w.dMax;
              })
              .reduce((a, b) => a + b._liters, 0) * 10
          ) / 10;
          return { ...w, liters: lit };
        });
        const maxL = Math.max(...weekBuckets.map(b => b.liters), 0.1);
        const weekBarsHtml = `
          <div style="border-top:1px solid #edf2ec; margin-top:10px; padding-top:10px;">
            <div style="font-size:10.5px; font-weight:700; color:#5a6658; margin-bottom:6px;">Toca una semana para ver su detalle</div>
            <div style="display:grid; grid-template-columns:repeat(${weekBuckets.length}, minmax(0, 1fr)); gap:4px; align-items:end; min-height:84px;">
              ${weekBuckets.map(b => {
                const barH = b.liters > 0 ? Math.max(8, Math.round((b.liters / maxL) * 40)) : 4;
                return `
                  <button type="button" data-fuel-jump-week="${b.anchorIso}" style="display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; border:none; background:transparent; padding:2px 0 0; cursor:pointer; font-family:inherit;">
                    <span style="font-size:9.5px; font-weight:800; color:${b.liters > 0 ? '#2d3e2c' : 'transparent'}; margin-bottom:3px; white-space:nowrap;">${b.liters > 0 ? `${formatLiters(b.liters)} lt` : '0'}</span>
                    <div style="width:100%; max-width:28px; height:${barH}px; border-radius:6px; background:${b.liters > 0 ? '#2d3e2c' : '#e4ebe2'}; transition:height 0.25s ease;"></div>
                    <span style="font-size:10px; font-weight:800; color:#2d3e2c; margin-top:4px; white-space:nowrap;">${b.label}</span>
                    <span style="font-size:9.5px; font-weight:600; color:#6b7769; white-space:nowrap;">${b.rangeText}</span>
                  </button>
                `;
              }).join('')}
            </div>
          </div>
        `;

        barsEl.innerHTML = monthCalHtml + subDayPanelHtml + weekBarsHtml;
      } else {
        const monthMap = new Map();
        for (const l of periodLoads) {
          const d = new Date(l.fecha || l.created_at || 0);
          if (Number.isNaN(d.getTime())) continue;
          const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
          const lbl = d.toLocaleDateString('es-ES', { month: 'short' }).replace(/\.$/, '');
          const prev = monthMap.get(k) || { monthIso: `${k}-01`, lbl, liters: 0 };
          monthMap.set(k, { monthIso: `${k}-01`, lbl, liters: Math.round((prev.liters + l._liters) * 10) / 10 });
        }
        const buckets = Array.from(monthMap.entries())
          .sort((a, b) => a[0].localeCompare(b[0]))
          .slice(-6)
          .map(([, val]) => val);
        if (buckets.length === 0) {
          barsEl.innerHTML = `<div style="text-align:center; font-size:12px; font-weight:600; color:#6d786c; padding:6px 0;">Sin cargas registradas todavía.</div>`;
        } else {
          const maxL = Math.max(...buckets.map(b => b.liters), 0.1);
          barsEl.innerHTML = `
            <div style="display:grid; grid-template-columns:repeat(${buckets.length}, 1fr); gap:8px; align-items:end; min-height:92px; padding-top:14px; padding-bottom:4px;">
              ${buckets.map(b => {
                const barH = Math.max(8, Math.round((b.liters / maxL) * 48));
                return `
                  <button type="button" data-fuel-jump-month="${b.monthIso}" style="display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; border:none; background:transparent; padding:0; cursor:pointer; font-family:inherit;">
                    <span style="font-size:10.5px; font-weight:800; color:#2d3e2c; margin-bottom:3px; white-space:nowrap;">${formatLiters(b.liters)} lt</span>
                    <div style="width:100%; max-width:34px; height:${barH}px; border-radius:7px; background:#2d3e2c; transition:height 0.25s ease;"></div>
                    <span style="font-size:11px; font-weight:700; color:#5a6658; margin-top:5px; text-transform:capitalize;">${escapeFuelHtml(b.lbl)}</span>
                  </button>
                `;
              }).join('')}
            </div>
          `;
        }
      }

      barsEl.querySelectorAll('[data-fuel-select-day]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const picked = btn.dataset.fuelSelectDay;
          if (!picked) return;
          window._fuelPeriodState = { motorId, period: 'day', dateIso: picked, subDayIso: null };
          renderFuelPeriodView(true);
        });
      });

      barsEl.querySelectorAll('[data-fuel-toggle-subday]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const picked = btn.dataset.fuelToggleSubday;
          if (!picked) return;
          const curSub = window._fuelPeriodState?.subDayIso || null;
          window._fuelPeriodState = {
            motorId,
            period,
            dateIso,
            subDayIso: curSub === picked ? null : picked,
          };
          renderFuelPeriodView(false);
        });
      });

      barsEl.querySelectorAll('[data-fuel-clear-subday]').forEach((btn) => {
        btn.addEventListener('click', () => {
          window._fuelPeriodState = {
            motorId,
            period,
            dateIso,
            subDayIso: null,
          };
          renderFuelPeriodView(false);
        });
      });

      barsEl.querySelectorAll('[data-fuel-jump-week]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const anchor = btn.dataset.fuelJumpWeek;
          if (!anchor) return;
          window._fuelPeriodState = { motorId, period: 'week', dateIso: anchor, subDayIso: null };
          renderFuelPeriodView(true);
        });
      });

      barsEl.querySelectorAll('[data-fuel-jump-month]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const mIso = btn.dataset.fuelJumpMonth;
          if (!mIso) return;
          window._fuelPeriodState = { motorId, period: 'month', dateIso: mIso, subDayIso: null };
          renderFuelPeriodView(true);
        });
      });

      bindLoadDeletes();
      bindLoadNavigations();
    }
  };

  document.querySelectorAll('.fuel-period-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      const p = tab.dataset.period || 'week';
      const sameTab = window._fuelPeriodState?.period === p;
      window._fuelPeriodState = {
        motorId,
        period: p,
        dateIso: sameTab ? getLocalTodayIso() : (window._fuelPeriodState?.dateIso || getLocalTodayIso()),
        subDayIso: null,
      };
      renderFuelPeriodView(true);
    });
  });

  document.getElementById('fuel-period-prev')?.addEventListener('click', () => {
    const curP = window._fuelPeriodState?.period || 'week';
    if (curP === 'all') return;
    const curIso = window._fuelPeriodState?.dateIso || getLocalTodayIso();
    window._fuelPeriodState.dateIso = curP === 'month'
      ? shiftFuelIsoMonths(curIso, -1)
      : shiftFuelIsoDays(curIso, -7);
    window._fuelPeriodState.subDayIso = null;
    renderFuelPeriodView();
  });

  document.getElementById('fuel-period-next')?.addEventListener('click', () => {
    const curP = window._fuelPeriodState?.period || 'week';
    const curIso = window._fuelPeriodState?.dateIso || getLocalTodayIso();
    if (!canFuelNavigateNext(curP, curIso)) return;
    window._fuelPeriodState.dateIso = curP === 'month'
      ? shiftFuelIsoMonths(curIso, 1)
      : shiftFuelIsoDays(curIso, 7);
    window._fuelPeriodState.subDayIso = null;
    renderFuelPeriodView();
  });

  renderFuelPeriodView(false);

  const markMantDone = async (key, triggerBtn = null) => {
    const motor = window._currentMotorData;
    const stats = window._currentFuelStats;
    const item = stats?.items?.find(i => i.key === key);
    if (!motor || !item || !item.isDue) return;

    if (triggerBtn) {
      triggerBtn.disabled = true;
      triggerBtn.textContent = 'Guardando...';
    }
    try {
      const empresaId = motor.empresa_id || window._currentEmpresaId || loadEmpresaId() || localStorage.getItem('current_empresa_id');
      if (!empresaId) throw new Error('No se encontró la finca activa');

      const created = await restFetch('/rest/v1/motor_mantenimientos', {
        method: 'POST',
        body: JSON.stringify({
          motor_id: motorId,
          empresa_id: empresaId,
          titulo: item.nombre,
          descripcion: item.desc || `Cada ${formatLitersLabel(item.cada_litros)}`,
          fecha: new Date().toISOString(),
          icon: 'local_gas_station',
          color: `gas_mant:${item.key}`,
          total_horas: stats.totalLiters || 0,
          historial_sesiones: {
            tipo: 'gasolina',
            mant_key: item.key,
            litros_al_momento: stats.totalLiters || 0,
            intervalo_litros: item.cada_litros,
          },
        }),
      });
      const savedRow = Array.isArray(created) ? created[0] : created;
      if (navigator.onLine && !savedRow?.id) {
        throw new Error('Supabase no confirmó el registro del mantenimiento');
      }
      if (savedRow?.id) await db.motor_mantenimientos.put(savedRow).catch(() => {});
      if (navigator.onLine) await syncTable('motor_mantenimientos', true).catch(() => {});

      showSnackbar(`${item.nombre} registrado`);
      await reloadDetalleSinParpadeo(motorId);
    } catch (err) {
      console.error('Error registrando mantenimiento gasolina:', err);
      showSnackbar('Error al registrar: ' + (err?.message || err), 'error');
      if (triggerBtn && document.body.contains(triggerBtn)) {
        triggerBtn.disabled = false;
        triggerBtn.textContent = 'Marcar como hecho';
      }
    }
  };

  document.querySelectorAll('[data-fuel-mant-done]').forEach((btn) => {
    btn.addEventListener('click', () => {
      markMantDone(btn.dataset.fuelMantDone, btn);
    });
  });

  document.getElementById('btn-edit-fuel-price')?.addEventListener('click', () => {
    openFuelPriceBottomSheet(motorId);
  });

  document.getElementById('btn-open-fuel-load-sheet')?.addEventListener('click', () => {
    openFuelLoadBottomSheet(motorId);
  });

  document.getElementById('btn-send-fuel-cuentas')?.addEventListener('click', () => {
    const motor = window._currentMotorData;
    const filteredLoads = window._currentPeriodFilteredLoads || [];
    const sentMap = window._currentFuelSentMap || new Map();
    if (!motor || filteredLoads.length === 0) return;

    const pricedLoads = filteredLoads.filter(l => l._cost > 0);
    if (pricedLoads.length === 0) {
      showSnackbar('Define el precio por litro para enviar a Cuentas', 'error');
      openFuelPriceBottomSheet(motorId);
      return;
    }

    const pendingLoads = pricedLoads.filter((l) => {
      const existing = sentMap.get(String(l.id));
      return !existing || Math.abs((Number(existing.monto) || 0) - l._cost) >= 0.01;
    });
    if (pendingLoads.length === 0) {
      showSnackbar('Estas cargas ya están registradas en Cuentas');
      return;
    }

    const pendingAmount = Math.round(pendingLoads.reduce((s, l) => s + l._cost, 0) * 100) / 100;
    const pendingLiters = Math.round(pendingLoads.reduce((s, l) => s + l._liters, 0) * 10) / 10;
    const sectors = Array.from(new Set(pendingLoads.map(l => String(l.hora_fin || '').trim()).filter(Boolean)));
    const sectorsText = sectors.length > 0 ? `<br><small style="color:#5a6658;">Sector: ${escapeFuelHtml(sectors.join(', '))}</small>` : '';
    const hasUpdates = pendingLoads.some(l => sentMap.has(String(l.id)));

    window.Snackbar.confirm(
      `${hasUpdates ? '¿Actualizar' : '¿Enviar'} a Cuentas <b>${formatCurrencyL(pendingAmount)}</b> (${formatLitersLabel(pendingLiters)})?${sectorsText}`,
      async () => {
        const sendBtn = document.getElementById('btn-send-fuel-cuentas');
        const sendTitle = document.getElementById('btn-send-fuel-cuentas-title');
        if (sendBtn) sendBtn.disabled = true;
        if (sendTitle) sendTitle.textContent = 'Enviando...';
        try {
          const res = await sendFuelLoadsToCuentas({
            loads: pendingLoads,
            motor,
            sentByLoadId: sentMap,
          });
          showSnackbar(
            res.updatedCount > 0 && res.createdCount === 0
              ? `✓ Actualizado en Cuentas (${formatCurrencyL(res.totalSentAmount)})`
              : `✓ Enviado a Cuentas (${formatCurrencyL(res.totalSentAmount)})`
          );
          await reloadDetalleSinParpadeo(motorId);
        } catch (err) {
          console.error('Error enviando gasolina a Cuentas:', err);
          showSnackbar('Error enviando a Cuentas: ' + (err?.message || err), 'error');
          if (sendBtn && document.body.contains(sendBtn)) sendBtn.disabled = false;
          if (sendTitle && document.body.contains(sendTitle)) sendTitle.textContent = 'Enviar a Cuentas';
        }
      },
      null,
      { confirmText: hasUpdates ? 'Actualizar en Cuentas' : 'Enviar a Cuentas', cancelText: 'Cancelar' }
    );
  });
}

function registerOilChange(motorId) {
  document.getElementById('motor-oil-confirm-scrim')?.remove();
  document.getElementById('motor-oil-confirm-sheet')?.remove();

  const motorNombre = (window._currentMotorData?.nombre || 'este equipo')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  const scrim = document.createElement('div');
  scrim.id = 'motor-oil-confirm-scrim';
  scrim.className = 'motor-sheet-scrim';
  scrim.setAttribute('data-motor-portal', '1');
  scrim.style.zIndex = '100005';

  const sheet = document.createElement('div');
  sheet.id = 'motor-oil-confirm-sheet';
  sheet.className = 'motor-session-sheet';
  sheet.setAttribute('data-motor-portal', '1');
  sheet.style.zIndex = '100006';
  sheet.innerHTML = `
    <div style="width: 38px; height: 4px; background: #d0d7cf; border-radius: 9999px; margin: 4px auto 14px;"></div>
    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 14px;">
      <span style="font-size: 16.5px; font-weight: 800; color: #1e3e2b;">Confirmar Cambio de Aceite</span>
      <button type="button" id="btn-oil-sheet-close" style="width: 32px; height: 32px; border-radius: 50%; border: 1px solid #dce5da; background: #ffffff; color: #2d3e2c; display: flex; align-items: center; justify-content: center; cursor: pointer;">
        <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
      </button>
    </div>
    <div style="display: flex; align-items: flex-start; gap: 12px; padding: 14px; background: #fff4ed; border: 1px solid #fdba74; border-radius: 14px; margin-bottom: 18px;">
      <div style="width: 40px; height: 40px; border-radius: 12px; background: #ffedd5; color: #ea580c; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
        <span class="material-symbols-outlined" style="font-size: 22px;">oil_barrel</span>
      </div>
      <p style="margin: 0; font-size: 13.5px; font-weight: 600; color: #431407; line-height: 1.45;">
        ¿Confirmar un cambio de aceite para <strong>${motorNombre}</strong>? Esto guardará el historial y reiniciará el contador de horas a 0.
      </p>
    </div>
    <div style="display: flex; gap: 10px;">
      <button type="button" id="btn-oil-sheet-cancel" class="press-effect" style="flex: 1; padding: 13px 16px; border-radius: 9999px; border: 1.5px solid #dce5da; background: #eef3ed; color: #2d3e2c; font-size: 14px; font-weight: 800; cursor: pointer;">
        Cancelar
      </button>
      <button type="button" id="btn-oil-sheet-confirm" class="press-effect" style="flex: 1; padding: 13px 16px; border-radius: 9999px; border: none; background: #ff4103; color: #ffffff; font-size: 14px; font-weight: 800; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; box-shadow: 0 4px 12px rgba(255, 65, 3, 0.25);">
        <span>Confirmar</span>
      </button>
    </div>
  `;

  document.body.appendChild(scrim);
  document.body.appendChild(sheet);

  const closeOilSheet = () => {
    scrim.classList.remove('open');
    sheet.classList.remove('open');
    setTimeout(() => {
      scrim.remove();
      sheet.remove();
    }, 320);
  };

  requestAnimationFrame(() => {
    scrim.classList.add('open');
    sheet.classList.add('open');
  });

  scrim.onclick = closeOilSheet;
  sheet.querySelector('#btn-oil-sheet-close').onclick = closeOilSheet;
  sheet.querySelector('#btn-oil-sheet-cancel').onclick = closeOilSheet;

  const confirmBtn = sheet.querySelector('#btn-oil-sheet-confirm');
  confirmBtn.onclick = async () => {
    confirmBtn.disabled = true;
    confirmBtn.innerHTML = `<span class="material-symbols-outlined animate-spin" style="font-size: 18px;">sync</span><span>Guardando...</span>`;
    try {
      const { data: motor } = await supabase.from('motores').select('nombre, horas, max_horas').eq('id', motorId).single();
      const { data: sesiones } = await supabase.from('motor_sesiones').select('*').eq('motor_id', motorId);
      const horasPrevias = Math.round((parseFloat(motor?.horas) || 0) * 10) / 10;
      const proximoLimite = Number(motor?.max_horas) || Number(window._currentMotorData?.max_horas) || 100;
      const equipoNombre = motor?.nombre || window._currentMotorData?.nombre || 'Equipo';
      const operadorNombre = await getCurrentUserName().catch(() => '');

      await supabase.from('motor_mantenimientos').insert({
        motor_id: motorId,
        titulo: 'Cambio de Aceite',
        descripcion: 'Mantenimiento preventivo.',
        fecha: new Date().toISOString(),
        icon: 'oil_barrel',
        color: '#ff4103',
        total_horas: motor.horas || 0,
        historial_sesiones: sesiones || []
      });

      await supabase.from('motores').update({ horas: 0 }).eq('id', motorId);
      await restFetch(`/rest/v1/motores?id=eq.${encodeURIComponent(motorId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ horas: 0 })
      }).catch(() => {});
      await restFetch(`/rest/v1/notifications?type=eq.motor_aceite&ref_id=eq.${encodeURIComponent(motorId)}`, {
        method: 'PATCH',
        body: JSON.stringify({ read: true, ref_id: `${motorId}_done` })
      }).catch(() => {});
      await supabase.from('motor_sesiones').delete().eq('motor_id', motorId);
      localStorage.removeItem(`push_motor_ts_${motorId}`);
      localStorage.removeItem(`wa_motor_aceite_ts_${motorId}`);
      window.clearPushBellByRef?.(motorId);

      notifyMotorOilChanged({
        motorId,
        nombre: equipoNombre,
        horasPrevias,
        proximoLimite,
      }).catch(() => {});

      sendWhatsApp(
        `✅ *Cambio de aceite realizado*\n` +
        `Equipo: ${equipoNombre}\n` +
        `Horas registradas en el cambio: ${horasPrevias} h\n` +
        `Nuevo ciclo: 0 h / ${proximoLimite} h\n` +
        (operadorNombre ? `Registrado por: ${operadorNombre}\n` : '') +
        `Finca: ${window._empresaNombre || ''}`
      ).catch(() => {});

      closeOilSheet();
      window.Snackbar.show('Cambio de aceite registrado');
      await reloadDetalleSinParpadeo(motorId);
    } catch (err) {
      console.error(err);
      confirmBtn.disabled = false;
      confirmBtn.innerHTML = `<span>Confirmar</span>`;
      window.Snackbar.show('Error: ' + err.message, { type: 'error' });
    }
  };
}

window.openMotorMantDetailSheet = (mantId) => {
  const mants = window._currentMotorMants || [];
  const mant = mants.find(item => String(item.id) === String(mantId));
  if (!mant) return;

  const opMap = window._currentOperadorNombreMap || {};
  const fallbackUser = window._currentUserName || 'Operador';
  const motorNombre = window._currentMotorData?.nombre || 'Equipo';

  let scrim = document.getElementById('motor-mant-detail-scrim');
  let sheet = document.getElementById('motor-mant-detail-sheet');
  if (scrim) scrim.remove();
  if (sheet) sheet.remove();

  scrim = document.createElement('div');
  scrim.id = 'motor-mant-detail-scrim';
  scrim.className = 'motor-sheet-scrim';
  scrim.setAttribute('data-motor-portal', '1');
  scrim.style.zIndex = '100005';

  sheet = document.createElement('div');
  sheet.id = 'motor-mant-detail-sheet';
  sheet.className = 'motor-session-sheet';
  sheet.setAttribute('data-motor-portal', '1');
  sheet.style.zIndex = '100006';

  const closeMantSheet = () => {
    scrim.classList.remove('open');
    sheet.classList.remove('open');
    setTimeout(() => {
      scrim.remove();
      sheet.remove();
    }, 260);
  };

  const fechaMant = mant.fecha
    ? new Date(mant.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
    : 'Sin fecha';

  const rawSesiones = Array.isArray(mant.historial_sesiones) ? [...mant.historial_sesiones] : [];
  rawSesiones.sort((a, b) => new Date(b.fecha || b.created_at || 0) - new Date(a.fecha || a.created_at || 0));

  const sesionesHtml = rawSesiones.length > 0
    ? rawSesiones.map((s) => {
        const rawOp = s.operador || '';
        const opName = rawOp.includes('@')
          ? (opMap[rawOp] || rawOp.split('@')[0])
          : (rawOp || fallbackUser);
        const opInitials = getInitials(opName);

        const d = s.fecha ? new Date(s.fecha) : (s.created_at ? new Date(s.created_at) : null);
        const fechaFormateada = d && !isNaN(d.getTime())
          ? d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })
          : 'Fecha no registrada';

        const durMins = s.duracion_mins || (s.horas ? Math.round(parseFloat(s.horas) * 60) : (s.total_horas ? Math.round(parseFloat(s.total_horas) * 60) : 0));
        const durH = Math.floor(durMins / 60);
        const durM = durMins % 60;
        const duracionTexto = durH > 0 ? (durM > 0 ? `${durH}h ${durM}m` : `${durH}h`) : `${durM}m`;

        const horasRegistradas = s.horas != null
          ? (Math.round(parseFloat(s.horas) * 100) / 100)
          : (Math.round((durMins / 60) * 100) / 100);

        const horaInicio = s.hora_inicio ? String(s.hora_inicio).slice(0, 5) : '';
        const horaFin = s.hora_fin ? String(s.hora_fin).slice(0, 5) : '';
        const rangoHorario = horaInicio && horaFin ? `${horaInicio} – ${horaFin}` : (horaInicio || '');
        const isLive = s.modo === 'live';

        return `
          <div style="background: #f8fbf7; border: 1px solid #e1e9df; border-radius: 14px; padding: 12px 14px; margin-bottom: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px;">
              <div style="display: inline-flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 9999px; background: ${isLive ? '#eef7ee' : '#eef2ec'}; color: ${isLive ? '#2e7d32' : '#455a43'}; font-size: 11px; font-weight: 700;">
                <span class="material-symbols-outlined" style="font-size: 14px;">${isLive ? 'timer' : 'edit_calendar'}</span>
                <span>${isLive ? 'Cronómetro' : 'Manual'}</span>
              </div>
              <span style="font-size: 12px; font-weight: 700; color: #5a7056;">${fechaFormateada}</span>
            </div>

            <div style="display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-bottom: 8px;">
              <div style="display: flex; align-items: baseline; gap: 6px;">
                <span style="font-size: 18px; font-weight: 800; color: #192b18;">+${horasRegistradas}h</span>
                <span style="font-size: 12px; font-weight: 600; color: #5a7056;">(${duracionTexto})</span>
              </div>
              ${rangoHorario ? `
                <span style="font-size: 12px; font-weight: 600; color: #455a43; display: inline-flex; align-items: center; gap: 4px;">
                  <span class="material-symbols-outlined" style="font-size: 14px;">schedule</span>
                  ${rangoHorario}
                </span>
              ` : ''}
            </div>

            <div style="display: flex; align-items: center; gap: 8px; padding-top: 8px; border-top: 1px dashed #dce5da;">
              <div style="width: 26px; height: 26px; border-radius: 50%; background: #2d3e2c; color: #fff; font-size: 11px; font-weight: 800; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                ${opInitials}
              </div>
              <div style="font-size: 12.5px; font-weight: 700; color: #2d3e2c; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                ${opName}
              </div>
            </div>
          </div>
        `;
      }).join('')
    : `
      <div style="text-align: center; padding: 28px 16px; background: #f8fbf7; border-radius: 14px; border: 1px dashed #cdd9cb; color: #6a7b68;">
        <span class="material-symbols-outlined" style="font-size: 30px; opacity: 0.7; margin-bottom: 6px;">history</span>
        <p style="margin: 0; font-size: 13px; font-weight: 600;">No hay sesiones detalladas guardadas en este mantenimiento.</p>
      </div>
    `;

  sheet.innerHTML = `
    <div style="width: 38px; height: 4px; background: #d0d7ce; border-radius: 9999px; margin: 0 auto 14px;"></div>
    <div style="display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 14px;">
      <div style="display: flex; align-items: center; gap: 10px; min-width: 0;">
        <div style="width: 40px; height: 40px; border-radius: 12px; background: #eef3ed; color: #ff4103; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
          <span class="material-symbols-outlined" style="font-size: 22px;">oil_barrel</span>
        </div>
        <div style="min-width: 0;">
          <h3 style="margin: 0; font-size: 17px; font-weight: 800; color: #192b18; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${mant.titulo || 'Cambio de Aceite'}</h3>
          <p style="margin: 2px 0 0; font-size: 12px; font-weight: 600; color: #5a7056;">${motorNombre} · ${fechaMant}</p>
        </div>
      </div>
      <button type="button" id="btn-mant-detail-close" class="press-effect" style="width: 34px; height: 34px; border-radius: 50%; border: none; background: #f0f3ef; color: #444; display: flex; align-items: center; justify-content: center; cursor: pointer; flex-shrink: 0;">
        <span class="material-symbols-outlined" style="font-size: 20px;">close</span>
      </button>
    </div>

    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 14px;">
      <div style="background: #f3f7f2; border-radius: 12px; padding: 10px 12px;">
        <div style="font-size: 10px; font-weight: 700; color: #5a7056; text-transform: uppercase;">Total acumulado</div>
        <div style="font-size: 18px; font-weight: 800; color: #192b18; margin-top: 2px;">${mant.total_horas || 0}h</div>
      </div>
      <div style="background: #f3f7f2; border-radius: 12px; padding: 10px 12px;">
        <div style="font-size: 10px; font-weight: 700; color: #5a7056; text-transform: uppercase;">Sesiones registradas</div>
        <div style="font-size: 18px; font-weight: 800; color: #192b18; margin-top: 2px;">${rawSesiones.length}</div>
      </div>
    </div>

    <div style="font-size: 12px; font-weight: 800; color: #2d3e2c; text-transform: uppercase; letter-spacing: 0.4px; margin-bottom: 8px;">
      Historial de horas y operarios
    </div>
    <div style="max-height: 46vh; overflow-y: auto; padding-right: 2px;">
      ${sesionesHtml}
    </div>
  `;

  document.body.appendChild(scrim);
  document.body.appendChild(sheet);

  requestAnimationFrame(() => {
    scrim.classList.add('open');
    sheet.classList.add('open');
  });

  scrim.onclick = closeMantSheet;
  sheet.querySelector('#btn-mant-detail-close').onclick = closeMantSheet;
};
