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
  const maxHoras = motor.max_horas || 100;
  const horasRestantes = Math.max(0, maxHoras - totalHoras);
  const pct = Math.min(100, Math.round((totalHoras / maxHoras) * 100));
  const requiresAlert = horasRestantes <= 0;
  const today = new Date().toISOString().split('T')[0];
  const currentUserName = await getCurrentUserName();
  const operatorInitials = getInitials(currentUserName);

  // Guardar datos en window para Bottom Sheet
  window._currentMotorData = motor;
  window._currentMotorSesiones = sesiones || [];
  window._currentOperadorNombreMap = operadorNombreMap || {};

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
        .screen-detalle-motor {
          width: 100%;
          box-sizing: border-box;
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
      <div class="card" style="background: white; border-radius: 16px; box-shadow: 0 4px 20px rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.06); position: relative;">
        
        <!-- Header: Imagen a la izquierda y Nombre a la derecha en un solo bloque -->
        <div class="motor-detail-header" style="display: flex; align-items: center; gap: 12px; width: 100%; position: relative;">
          
          <!-- Foto / Icono a la izquierda -->
          <div class="motor-header-image" style="width: 56px; height: 56px; min-width: 56px; border-radius: 16px; background: #eef3ed; border: 1.5px solid #dce5da; display: flex; align-items: center; justify-content: center; overflow: hidden; flex-shrink: 0; box-shadow: 0 2px 8px rgba(45, 62, 44, 0.08);">
            ${motor.image_url 
              ? `<img src="${motor.image_url}" alt="${motor.nombre}" style="width: 100%; height: 100%; object-fit: cover;">`
              : `<span class="material-symbols-outlined" style="font-size: 30px; color: #2d3e2c;">precision_manufacturing</span>`
            }
          </div>

          <!-- Nombre y detalles a la derecha en un solo bloque -->
          <div class="motor-header-text" style="flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center;">
            <h2 class="motor-header-title" style="font-size: 17.5px; font-weight: 800; color: #1e3e2b; margin: 0; line-height: 1.25; word-break: break-word; letter-spacing: -0.3px; text-align: left;">
              ${motor.nombre || 'Sin Nombre'}
            </h2>
            ${subtitleHtml}
          </div>

          <!-- Botón Editar a la derecha -->
          <button onclick="window.navigateTo('nuevo_motor', '${motor.id}')" title="Editar Motor" style="width: 36px; height: 36px; min-width: 36px; border-radius: 50%; background: #f2f6f2; border: 1.5px solid #dce5da; color: #2d3e2c; cursor: pointer; display: flex; align-items: center; justify-content: center; flex-shrink: 0; transition: all 0.2s; box-shadow: 0 1px 4px rgba(0,0,0,0.04);">
            <span class="material-symbols-outlined" style="font-size: 18px;">edit</span>
          </button>

        </div>

        <!-- Carrusel de Píldoras de Estadísticas (Material 3 Expressive) -->
        <div class="motor-stats-carousel">
          
          <!-- Píldora 1: Uso Acumulado -->
          <div class="motor-stat-pill">
            <div class="motor-stat-pill-icon">
              <span class="material-symbols-outlined" style="font-size: 18px;">schedule</span>
            </div>
            <div class="motor-stat-pill-info">
              <span class="motor-stat-pill-val">${totalHoras.toFixed(1)}h</span>
              <span class="motor-stat-pill-lbl">Uso Acumulado</span>
            </div>
          </div>

          <!-- Píldora 2: Límite de Servicio -->
          <div class="motor-stat-pill">
            <div class="motor-stat-pill-icon">
              <span class="material-symbols-outlined" style="font-size: 18px;">speed</span>
            </div>
            <div class="motor-stat-pill-info">
              <span class="motor-stat-pill-val">${maxHoras}h</span>
              <span class="motor-stat-pill-lbl">Límite Servicio</span>
            </div>
          </div>

          <!-- Píldora 3: Próximo Cambio -->
          <div class="motor-stat-pill">
            <div class="motor-stat-pill-icon">
              <span class="material-symbols-outlined" style="font-size: 18px;">oil_barrel</span>
            </div>
            <div class="motor-stat-pill-info">
              <span class="motor-stat-pill-val" style="color: ${requiresAlert ? '#ba1a1a' : '#1e3e2b'};">${horasRestantes.toFixed(1)}h</span>
              <span class="motor-stat-pill-lbl">Próximo Cambio</span>
            </div>
          </div>

          <!-- Píldora 4: Estado -->
          <div class="motor-stat-pill ${requiresAlert ? 'alert' : 'ok'}">
            <div class="motor-stat-pill-icon" style="background: ${requiresAlert ? '#ffe2db' : '#eef7ee'}; color: ${requiresAlert ? '#ba1a1a' : '#2e7d32'}; border-color: ${requiresAlert ? '#ffcdd2' : '#c8dfc8'};">
              <span class="material-symbols-outlined" style="font-size: 18px;">${requiresAlert ? 'warning' : 'check_circle'}</span>
            </div>
            <div class="motor-stat-pill-info">
              <span class="motor-stat-pill-val" style="color: ${requiresAlert ? '#ba1a1a' : '#2e7d32'};">${requiresAlert ? 'Atención' : 'Operativo'}</span>
              <span class="motor-stat-pill-lbl">Estado Motor</span>
            </div>
          </div>

        </div>

        <!-- Health Progress -->
        <div style="margin-top: 14px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px;">
            <span style="font-size: 11.5px; font-weight: 700; color: #666;">Vida útil del aceite</span>
            <span style="font-size: 12px; font-weight: 800; color: ${requiresAlert ? '#ff4103' : '#2d3e2c'};">${pct}%</span>
          </div>
          <div style="height: 8px; background: #eee; border-radius: 12px; overflow: hidden; position: relative;">
            <div style="width: ${pct}%; height: 100%; background: ${requiresAlert ? '#ff4103' : '#2d3e2c'}; border-radius: 12px; transition: width 1s ease-out;"></div>
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
          
          <div class="card" style="background: white; border: 1.5px solid rgba(45, 62, 44, 0.12); box-shadow: 0 4px 24px rgba(0,0,0,0.04);">
            
            <!-- Segmented Button Material 3 Expressive -->
            <div class="m3-segmented-button-container" style="display: flex; background: #eef3ed; border-radius: 9999px; padding: 4px; gap: 4px; margin-bottom: 22px; border: 1.5px solid #dce5da;">
              <button type="button" id="seg-btn-live" class="m3-segment-btn active" onclick="window.switchMotorSessionMode('live')">
                <span class="material-symbols-outlined" style="font-size: 18px;">timer</span>
                <span>Cronómetro en Vivo</span>
              </button>
              <button type="button" id="seg-btn-manual" class="m3-segment-btn" onclick="window.switchMotorSessionMode('manual')">
                <span class="material-symbols-outlined" style="font-size: 18px;">edit_calendar</span>
                <span>Registro Manual</span>
              </button>
            </div>

            <!-- Panel 1: Cronómetro en Vivo -->
            <div id="panel-session-live" style="display: block; text-align: center;">
              
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
                
                <!-- Fecha -->
                <div class="m3-field">
                  <input type="text" id="input-manual-date" value="${today}" readonly placeholder=" " style="cursor: pointer;">
                  <label>Fecha de Operación</label>
                  <span class="material-icons" style="cursor: pointer;">calendar_today</span>
                </div>

                <!-- Hora Inicio & Fin -->
                <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px;">
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

                <!-- Duración Calculada -->
                <div style="background: #f4f8f4; border: 1.5px solid #d8e5d7; padding: 14px 16px; border-radius: 14px; display: flex; justify-content: space-between; align-items: center;">
                  <div style="display: flex; flex-direction: column;">
                    <span style="font-size: 10.5px; font-weight: 700; color: #5a7056; text-transform: uppercase; letter-spacing: 0.5px;">Duración Calculada</span>
                    <span id="calc-manual-result" style="font-size: 20px; font-weight: 900; color: #1e3e2b; font-family: 'JetBrains Mono', monospace; margin-top: 2px;">4h 00m</span>
                  </div>
                  <div style="width: 38px; height: 38px; border-radius: 10px; background: rgba(45, 62, 44, 0.08); color: #2d3e2c; display: flex; align-items: center; justify-content: center;">
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
                <button id="btn-save-manual" class="btn-m3-fill press-effect" style="width: 100%; margin-top: 6px; padding: 14px; border-radius: 9999px; background: #2d3e2c; color: #ffffff; border: none; font-size: 14.5px; font-weight: 800; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; box-shadow: 0 4px 14px rgba(45, 62, 44, 0.25);">
                  <span class="material-symbols-outlined" style="font-size: 20px;">save</span>
                  <span>Guardar Sesión</span>
                </button>

              </div>

            </div>

          </div>

        </div>

        <!-- Right Column: History -->
        <div class="section">
          
          <div class="section-title">
             <h3>Historial de Operación</h3>
             <span class="tag" style="background: var(--secondary-container); color: var(--on-secondary-container);">${sesiones ? sesiones.length : 0} Sesiones</span>
          </div>
          
          <div class="activity-list" style="margin-bottom: 32px;">
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
                      ${s.hora_inicio || '--:--'} - ${s.hora_fin || '--:--'}
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
             <button class="btn-m3-tonal" id="btn-register-oil-change" style="font-size: 12px; height: 32px; padding: 0 16px;">+ Nuevo</button>
          </div>
          
          <div class="activity-list">
            ${mants && mants.length > 0 ? mants.map(m => `
              <div class="activity-item card" style="padding: 16px; margin-bottom: 12px; border-left: 6px solid var(--primary); background: #fff;">
                <div class="activity-icon" style="background: var(--primary-container); color: var(--on-primary-container); border-radius: 12px; width: 44px; height: 44px;">
                  <span class="material-icons" style="font-size: 20px;">oil_barrel</span>
                </div>
                <div class="activity-content" style="flex: 1;">
                  <h4 style="font-size: 15px; margin: 0; font-weight: 800; color: var(--primary-container);">${m.titulo || 'Cambio de Aceite'}</h4>
                  <p style="font-size: 12px; color: #555; margin: 4px 0; line-height: 1.4;">${m.descripcion || 'Mantenimiento preventivo de rutina.'}</p>
                  <div style="display: flex; align-items: center; gap: 8px; margin-top: 8px;">
                    <span class="history-date" style="font-size: 11px; font-weight: 700; color: #888;">
                       ${new Date(m.fecha).toLocaleDateString()}
                    </span>
                    <span class="tag" style="font-size: 10px; background: #eee; padding: 2px 8px;">${m.total_horas}h de uso</span>
                  </div>
                </div>
                <div class="activity-actions">
                  <button class="btn-m3-text btn-delete-maintenance" data-id="${m.id}" style="color: var(--error); width: 36px; height: 36px; border-radius: 50%; min-width: 0;">
                    <span class="material-symbols-outlined" style="font-size: 20px;">delete</span>
                  </button>
                </div>
              </div>
            `).join('') : '<p style="text-align:center; padding: 40px; color:#999; background: var(--surface); border-radius: 12px; border: 1px dashed #ccc;">Sin mantenimientos registrados.</p>'}
          </div>

        </div>

      </div>

      <!-- Bottom Sheet Scrim & Container para Ficha Técnica de Operación -->
      <div id="motor-sheet-scrim" class="motor-sheet-scrim"></div>
      <div id="motor-session-sheet" class="motor-session-sheet"></div>
    </div>
  `;
}

export function initDetalleMotor(motorId) {
  let timerInterval = null;
  let isRunning = false;
  let lastStartTime = 0;
  let savedElapsed = 0;

  const clockDisplay = document.getElementById('clock-display');
  const btnStart = document.getElementById('btn-timer-start');
  const btnPause = document.getElementById('btn-timer-pause');
  const btnFinish = document.getElementById('btn-timer-finish');
  const uiLabel = document.getElementById('ui-current-session-label');
  const uiDot = document.getElementById('ui-status-dot');

  // Segment Switcher
  window.switchMotorSessionMode = function(mode) {
    const btnLive = document.getElementById('seg-btn-live');
    const btnManual = document.getElementById('seg-btn-manual');
    const panelLive = document.getElementById('panel-session-live');
    const panelManual = document.getElementById('panel-session-manual');
    if (!btnLive || !btnManual || !panelLive || !panelManual) return;

    if (mode === 'live') {
      btnLive.classList.add('active');
      btnManual.classList.remove('active');
      panelLive.style.display = 'block';
      panelManual.style.display = 'none';
    } else {
      btnManual.classList.add('active');
      btnLive.classList.remove('active');
      panelLive.style.display = 'none';
      panelManual.style.display = 'block';
    }
  };

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
  }

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
    isRunning = true;
    updateButtons();
    timerInterval = setInterval(updateDisplay, 1000);
  }

  if (btnStart) {
    btnStart.onclick = () => {
      lastStartTime = Date.now();
      resumeTimer();
      saveLocalState();
      updateDisplay();
    };
  }

  if (btnPause) {
    btnPause.onclick = () => {
      if (isRunning) {
        clearInterval(timerInterval);
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
      
      const mins = Math.round(finalElapsed / (1000 * 60));
      if (mins < 1) {
         showSnackbar('La sesión es muy corta para registrar.', 'warning');
         resetTimer();
         return;
      }

      const dInicio = new Date(Date.now() - finalElapsed);
      const dFin = new Date();
      const format12 = (d) => d.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

      const currentUserName = await getCurrentUserName();
      await saveSession(motorId, mins, null, format12(dInicio), format12(dFin), currentUserName);
      resetTimer();
    };
  }

  function resetTimer() {
    clearInterval(timerInterval);
    localStorage.removeItem(`motor_v2_timer_${motorId}`);
    savedElapsed = 0;
    isRunning = false;
    window.clearScreenCache?.('detalle_motor');
    window.navigateTo('detalle_motor', motorId);
  }

  // --- Registro Manual ---
  const manualDate = document.getElementById('input-manual-date');
  const manualStart = document.getElementById('input-manual-start');
  const manualEnd = document.getElementById('input-manual-end');
  const calcResult = document.getElementById('calc-manual-result');
  const btnSaveManual = document.getElementById('btn-save-manual');

  function calculateManual() {
    if (!manualStart || !manualEnd || !calcResult) return 0;
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
    calcResult.textContent = `${Math.floor(diff / 60)}h ${(diff % 60).toString().padStart(2, '0')}m`;
    return diff;
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
      const mins = calculateManual();
      btnSaveManual.disabled = true;
      btnSaveManual.innerHTML = `<span class="material-symbols-outlined animate-spin" style="font-size:18px;">sync</span> Guardando...`;
      const currentUserName = await getCurrentUserName();
      await saveSession(motorId, mins, manualDate.value, manualStart.value, manualEnd.value, currentUserName);
      window.clearScreenCache?.('detalle_motor');
      window.navigateTo('detalle_motor', motorId);
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
        window.clearScreenCache?.('detalle_motor');
        window.navigateTo('detalle_motor', motorId);
      }
    };
  });

  // Listener para abrir Bottom Sheet de Ficha Técnica de Operación
  const sheet = document.getElementById('motor-session-sheet');
  const scrim = document.getElementById('motor-sheet-scrim');

  document.querySelectorAll('.motor-session-card').forEach(card => {
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

  const maxHoras = motor.max_horas || 100;
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
            ${s.hora_inicio || '--:--'} a ${s.hora_fin || '--:--'}
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
    sheet.classList.remove('open');
    scrim.classList.remove('open');
    setTimeout(() => { sheet.innerHTML = ''; }, 350);
  };

  document.getElementById('motor-sheet-close')?.addEventListener('click', close);
  document.getElementById('motor-sheet-btn-close')?.addEventListener('click', close);
  document.getElementById('motor-sheet-handle-box')?.addEventListener('click', close);
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
  const currentScreen = document.querySelector('.screen-detalle-motor');
  if (currentScreen && currentScreen.parentElement) {
    const parent = currentScreen.parentElement;
    const html = await renderDetalleMotor(motorId);
    parent.innerHTML = html;
    initDetalleMotor(motorId);
  } else {
    window.clearScreenCache?.('detalle_motor');
    window.navigateTo('detalle_motor', motorId);
  }
}

function registerOilChange(motorId) {
  window.Snackbar.confirm(
    '¿Confirmas registrar un cambio de aceite? Esto guardará el historial y reiniciará el contador de horas a 0.',
    async () => {
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
        
        window.Snackbar.show('Cambio de aceite registrado');
        await reloadDetalleSinParpadeo(motorId);
      } catch (err) {
        console.error(err);
        window.Snackbar.show('Error: ' + err.message, { type: 'error' });
      }
    }
  );
}
