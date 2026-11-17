import { supabase } from '../supabase.js';
import { showModal, closeModal } from '../modals.js';
import { showSnackbar } from '../snackbar.js';
import { getUser, restFetch } from '../auth.js';

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

  const { data: motor, error: mErr } = await supabase
    .from('motores')
    .select('*')
    .eq('id', motorId)
    .single();

  if (mErr) return `<div class="screen-detalle"><p>Error cargando motor: ${mErr.message}</p></div>`;

  const { data: sesiones } = await supabase
    .from('motor_sesiones')
    .select('*')
    .eq('motor_id', motorId)
    .order('fecha', { ascending: false });

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

  const { data: mants } = await supabase
    .from('motor_mantenimientos')
    .select('*')
    .eq('motor_id', motorId)
    .order('fecha', { ascending: false });

  const totalHoras = motor.horas || 0;
  const hasPrevMant = (mants || []).length > 0;
  const maxHoras = hasPrevMant ? (motor.max_horas || 100) : 80;
  const horasRestantes = Math.max(0, maxHoras - totalHoras);
  const pct = totalHoras > 0 ? Math.min(100, Math.max(1, Math.round((totalHoras / maxHoras) * 100))) : 0;
  const requiresAlert = horasRestantes <= 0;
  const today = new Date().toISOString().split('T')[0];
  const currentUserName = await getCurrentUserName();
  const operatorInitials = getInitials(currentUserName);

  // Guardar datos en window para Bottom Sheet
  window._currentMotorData = motor;
  window._currentMotorHasPrevMant = hasPrevMant;
  window._currentMotorSesiones = sesiones || [];
  window._currentMotorMants = mants || [];
  window._currentOperadorNombreMap = operadorNombreMap || {};
  window._currentUserName = currentUserName || 'Operador';

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
    const { data: motor } = await supabase.from('motores').select('horas').eq('id', motorId).single();
    const newTotal = (parseFloat(motor.horas) || 0) + (mins / 60);
    const rounded = Math.round(newTotal * 10) / 10;
    const finalOperador = (operador && operador.trim()) ? operador.trim() : await getCurrentUserName();

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
    await reloadDetalleSinParpadeo(motorId);
  }
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
      const { data: motor } = await supabase.from('motores').select('horas').eq('id', motorId).single();
      const { data: sesiones } = await supabase.from('motor_sesiones').select('*').eq('motor_id', motorId);

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
      await supabase.from('motor_sesiones').delete().eq('motor_id', motorId);

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
