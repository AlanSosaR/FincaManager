import { supabase } from '../supabase.js';

export async function renderDetalleMotor(motorId) {
  if (!motorId) return '<div class="screen-detalle-motor"><p>No se especificó un ID de motor.</p></div>';

  const { data: motor, error: mErr } = await supabase
    .from('motores')
    .select('*')
    .eq('id', motorId)
    .single();

  if (mErr) return `<div class="screen-detalle-motor"><p>Error cargando motor: ${mErr.message}</p></div>`;

  const { data: sesiones } = await supabase
    .from('motor_sesiones')
    .select('*')
    .eq('motor_id', motorId)
    .order('fecha', { ascending: false });

  const { data: mants } = await supabase
    .from('motor_mantenimientos')
    .select('*')
    .eq('motor_id', motorId)
    .order('fecha', { ascending: false });

  const totalHoras = motor.horas || 0;
  const maxHoras = motor.max_horas || 100;
  const horasRestantes = Math.max(0, maxHoras - totalHoras);
  const pct = Math.min(100, Math.round((totalHoras / maxHoras) * 100));
  const today = new Date().toISOString().split('T')[0];
  const requiresAlert = horasRestantes <= 0;

  return `
    <div class="screen-detalle-motor" data-motor-id="${motorId}">

      <!-- Bento Header: Alert & Timer -->
      <div class="grid-top-layout">
        
        <!-- Combined Card: Status + Manual Input -->
        <div class="maint-card safe-mode" id="main-maint-card" style="background: white; border: 1px solid #eee; padding: 40px; display: flex; flex-direction: column; gap: 40px; border-radius: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.03); flex: 1;">
          
          <!-- Top part: Oil change status -->
          <div style="flex: 1;">
            ${requiresAlert ? `
              <div style="background: #ba1a1a; padding: 32px; display: flex; flex-direction: column; justify-content: center; align-items: center; text-align: center; border-radius: 24px; box-shadow: 0 8px 30px rgba(186,26,26,0.2);">
                <span class="material-icons" style="font-size: 48px; color: white; margin-bottom: 16px;">error_outline</span>
                <h2 style="font-size: 24px; font-weight: 900; color: white; line-height: 1.1; margin-bottom: 8px; letter-spacing: -0.5px;">¡CAMBIO DE ACEITE REQUERIDO!</h2>
                <p style="font-size: 13px; color: #ffdad6; font-weight: 500; margin-bottom: 24px;">Has acumulado ${totalHoras.toFixed(1)}h de uso, superando el límite de ${maxHoras}h.</p>
                
                <button id="btn-alert-register-oil" style="background: white; color: #ba1a1a; padding: 14px 28px; border-radius: 100px; font-weight: 900; font-size: 14px; border: none; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px;" onmouseover="this.style.transform='translateY(-2px)';" onmouseout="this.style.transform='translateY(0)';">
                    <span class="material-icons" style="font-size: 18px;">add</span> Registrar mantenimiento
                </button>
              </div>
            ` : `
              <span style="font-size: 10px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 2px;">PRÓXIMO CAMBIO DE ACEITE</span>
              <div class="maint-next-header">
                <span class="maint-big-text" id="ui-hours-left">${horasRestantes.toFixed(0)}h</span>
                <span class="maint-big-label">RESTANTES</span>
              </div>

              <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <span style="font-size: 10px; font-weight: 800; color: #888; text-transform: uppercase; letter-spacing: 1.5px;">USO ACUMULADO</span>
                <span id="ui-acc-hours" style="font-size: 12px; font-weight: 800; color: #333;">${totalHoras.toFixed(1)}h <span style="color: #aaa;">/ ${maxHoras}h</span></span>
              </div>
              <div class="maint-progress-track" style="height: 12px; background: #e6e4df; border-radius: 12px;">
                <div id="ui-maint-bar" class="maint-progress-fill" style="width: ${pct}%; background: #386a3e; border-radius: 12px; transition: width 1.5s cubic-bezier(0.4, 0, 0.2, 1);"></div>
              </div>
            `}
          </div>

          <!-- Divider -->
          <hr style="border: none; border-top: 1px solid #f0f0f0;">

          <!-- Manual Hours Section -->
          <div class="manual-hours-card" style="padding: 0; box-shadow: none; background: transparent; border-radius: 0;">
            <div class="m3-title-row" style="margin-bottom: 24px;">
              <span class="material-icons" style="color: #a17721;">history_toggle_off</span>
              <h3 style="font-size: 18px; font-weight: 800; color: #444;">Agregar horas manuales</h3>
            </div>
            
            <div class="grid grid-cols-1 gap-4">
              <div class="m3-field">
                <label style="font-size: 10px;">FECHA</label>
                <div class="m3-input-container">
                  <span class="material-icons" style="font-size: 20px;">calendar_today</span>
                  <input type="date" id="input-manual-date" value="${today}" style="cursor: pointer;">
                </div>
              </div>
              
              <div class="manual-inputs-row">
                <div class="m3-field flex-col flex-1" style="flex: 1;">
                  <label style="font-size: 10px;">HORA INICIO</label>
                  <div class="m3-input-container">
                    <span class="material-icons" style="font-size: 18px;">login</span>
                    <input type="time" id="input-manual-start" value="00:00" style="cursor: pointer;">
                  </div>
                </div>
                <div class="m3-field flex-col flex-1" style="flex: 1;">
                  <label style="font-size: 10px;">HORA FIN</label>
                  <div class="m3-input-container">
                    <span class="material-icons" style="font-size: 18px;">logout</span>
                    <input type="time" id="input-manual-end" value="00:00" style="cursor: pointer;">
                  </div>
                </div>
              </div>
            </div>

            <div class="manual-save-row">
              <div style="background: #fdf9f3; border-radius: 100px; padding: 16px 24px; flex: 1.5; display: flex; justify-content: center; align-items: center; gap: 8px;">
                  <span style="font-size: 11px; font-weight: 800; color: #888; letter-spacing: 1px;">HORAS TRABAJADAS</span>
                  <span id="calc-manual-result" style="font-size: 14px; font-weight: 900; color: #a17721;">= 0h 00m</span>
              </div>
              <button id="btn-save-manual" style="background: #386a3e; color: white; border: none; padding: 16px 32px; border-radius: 100px; font-weight: 800; font-size: 14px; cursor: pointer; flex: 1; transition: all 0.2s;" onmouseover="this.style.transform='translateY(-2px)';" onmouseout="this.style.transform='translateY(0)';">
                  Guardar
              </button>
            </div>
          </div>

          <div style="text-align: center; margin-top: 16px;">
            <span style="font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 2px; color: #bbb; display: flex; align-items: center; justify-content: center; gap: 6px;">
              <span class="material-icons" style="font-size: 14px;">info</span>
              ${mants && mants[0] ? 'ÚLTIMO MANTENIMIENTO: ' + new Date(mants[0].fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase() : 'SIN MANTENIMIENTOS REGISTRADOS RECIENTEMENTE'}
            </span>
          </div>
        </div>

        <!-- Operation Card (Timer) -->
        <div class="operation-card" id="timer-card" style="background: #fdfaf6; padding: 0; position: relative;">
          <!-- Header image area -->
          <div style="position: relative; height: 260px; width: 100%;">
            <!-- Ensure tracking tractor background image -->
            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background-image: url('tractor_bg.png'); background-size: cover; background-position: center;"></div>
            <!-- Fade gradient -->
            <div style="position: absolute; top: 0; left: 0; right: 0; bottom: 0; background: linear-gradient(to bottom, transparent 0%, #dcf0d5 100%);"></div>
            
            <!-- Operacion lista badge -->
            <div style="position: absolute; top: 24px; left: 24px; background: rgba(255,255,255,0.85); backdrop-filter: blur(8px); padding: 6px 16px; border-radius: 100px; display: flex; align-items: center; gap: 8px;">
              <div style="width: 8px; height: 8px; background: #386a3e; border-radius: 50%;"></div>
              <span style="font-size: 10px; font-weight: 900; letter-spacing: 1px; color: #444;">OPERACIÓN LISTA</span>
            </div>

            <!-- Big Clock -->
            <div style="position: absolute; bottom: 30px; left: 0; right: 0; text-align: center;">
              <span id="clock-display" style="font-size: 52px; font-weight: 900; color: #386a3e; font-family: 'JetBrains Mono', monospace; text-shadow: 0 4px 20px rgba(255,255,255,0.8); background: rgba(255,255,255,0.6); padding: 0 16px; border-radius: 16px; backdrop-filter: blur(4px);">00:00:00</span>
            </div>
          </div>

          <div style="padding: 32px; display: flex; flex-direction: column; align-items: center; flex: 1;">
            <!-- Sesion actual component -->
            <div style="background: #e9f5e6; border: 1px solid #d4ebd0; border-radius: 20px; padding: 16px 24px; width: 100%; display: flex; align-items: center; justify-content: space-between; margin-bottom: 40px;">
              <div style="display: flex; align-items: center; gap: 12px;">
                <div style="width: 32px; height: 32px; background: #386a3e; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: white;">
                  <span class="material-icons" style="font-size: 16px;">timer</span>
                </div>
                <div style="display: flex; flex-direction: column;">
                  <span style="font-size: 10px; font-weight: 800; color: #666; letter-spacing: 1px;">SESIÓN ACTUAL</span>
                  <span id="ui-current-session-hours" style="font-size: 16px; font-weight: 900; color: #333;">0.0 Horas</span>
                </div>
              </div>
              <span class="material-icons" style="color: #386a3e;">trending_up</span>
            </div>

            <!-- Circular Controls -->
            <div style="display: flex; gap: 24px; justify-content: center; margin-bottom: 40px;">
              <div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
                <button id="btn-timer-start" style="width: 72px; height: 72px; border-radius: 50%; background: #386a3e; color: white; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; box-shadow: 0 8px 24px rgba(56, 106, 62, 0.3); transition: all 0.2s;" onmouseover="if(!this.disabled) this.style.transform='scale(1.05)';" onmouseout="this.style.transform='scale(1)';">
                  <span class="material-icons" style="font-size: 32px;">play_arrow</span>
                </button>
                <span style="font-size: 10px; font-weight: 800; color: #666; letter-spacing: 1px;">INICIAR</span>
              </div>

              <div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
                <button id="btn-timer-pause" style="width: 64px; height: 64px; border-radius: 50%; background: #fdfaf6; color: #555; border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; cursor: pointer; margin-top: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); transition: all 0.2s;" disabled onmouseover="if(!this.disabled) this.style.background='#f0ebdf';" onmouseout="this.style.background='#fdfaf6';">
                  <span class="material-icons" style="font-size: 28px;">pause</span>
                </button>
                <span style="font-size: 10px; font-weight: 800; color: #666; letter-spacing: 1px;">PAUSAR</span>
              </div>

              <div style="display: flex; flex-direction: column; align-items: center; gap: 12px;">
                <button id="btn-timer-finish" style="width: 64px; height: 64px; border-radius: 50%; background: #fdfaf6; color: #555; border: 1px solid #ddd; display: flex; align-items: center; justify-content: center; cursor: pointer; margin-top: 4px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); transition: all 0.2s;" disabled onmouseover="if(!this.disabled) this.style.background='#f0ebdf';" onmouseout="this.style.background='#fdfaf6';">
                  <span class="material-icons" style="font-size: 28px;">stop</span>
                </button>
                <span style="font-size: 10px; font-weight: 800; color: #666; letter-spacing: 1px;">FINALIZAR</span>
              </div>
            </div>

            <!-- View Sessions Link -->
            <button style="margin-top: auto; background: none; border: none; font-size: 11px; font-weight: 800; color: #aaa; letter-spacing: 1.5px; display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <span class="material-icons" style="font-size: 16px;">history</span> VER SESIONES DEL DÍA
            </button>
          </div>
        </div>
      </div>

      <div class="grid-top-layout" style="margin-top: 24px;">
        
        <!-- Left: Session List -->
        <div class="col-left">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 12px;">
              <h3 style="font-size: 18px; font-weight: 800; color: #444;">Historial de sesiones</h3>
            </div>
          </div>
          <div id="session-history-container" class="session-list-minimal" style="border: 1px solid #eee; border-radius: 32px; display: flex; flex-direction: column; overflow-y: auto; margin-bottom: 16px; flex: 1; max-height: 500px;">
            ${sesiones && sesiones.length > 0 ? `
              ${sesiones.map(s => {
                const date = new Date(s.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                return `
                <div class="session-row-minimal" style="display: flex; gap: 12px; align-items: center; padding: 16px 24px;">
                  <div class="flex items-center gap-4" style="flex: 1;">
                    <div class="session-icon-box" style="border-radius: 50%; width: 44px; height: 44px; color: #777; background: #fdfaf6; display: flex; justify-content: center; align-items: center; flex-shrink: 0;">
                      <span class="material-icons" style="font-size: 20px;">history</span>
                    </div>
                    <div>
                      <p style="font-size: 14px; font-weight: 700; color: #444; margin: 0;">${date}</p>
                      <p style="font-size: 11px; color: #888; font-weight: 500; margin: 0;">Operador: ${s.operador || 'Admin'}</p>
                    </div>
                  </div>
                  <div style="text-align: right;">
                    <p style="font-size: 16px; font-weight: 800; color: #386a3e; margin: 0;">${s.duracion_mins ? Math.floor(s.duracion_mins / 60) + 'h ' + (s.duracion_mins % 60) + 'm' : s.total_horas + 'h'}</p>
                    <p style="font-size: 9px; font-weight: 800; color: #999; letter-spacing: 0.5px; margin-top: 2px;">TOTAL: ${s.total_horas || 0}H</p>
                  </div>
                </div>
                `;
              }).join('')}
            ` : `
              <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px; flex: 1;">
                <div style="width: 56px; height: 56px; background: #fdf9f3; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 24px;">
                   <span class="material-icons" style="color: #d7cdba; font-size: 24px;">history</span>
                </div>
                <h4 style="font-size: 15px; font-weight: 800; color: #555; margin-bottom: 8px;">Aún no hay sesiones registradas</h4>
                <p style="font-size: 13px; color: #999; font-weight: 500; line-height: 1.5; max-width: 250px;">Las horas de operación aparecerán aquí una vez que finalices tu primera sesión o agregues horas manualmente.</p>
              </div>
            `}
          </div>

        </div>

        <!-- Right: Oil Change Timeline -->
        <div class="col-right">
          <div style="background: white; border-radius: 24px; height: 100%; display: flex; flex-direction: column; padding: 24px; box-shadow: 0 4px 20px rgba(0,0,0,0.02); border: 1px solid #f0f0f0;">
            
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
                 <span class="material-icons" style="color: #386a3e; font-size: 20px;">receipt_long</span>
                 <h3 style="font-size: 16px; font-weight: 800; color: #444; margin: 0;">Cambios de aceite</h3>
            </div>
            
            <div class="maint-list-container" style="flex: 1; overflow-y: auto; padding-right: 8px; display: flex; flex-direction: column; gap: 12px;">
              ${mants && mants.length > 0 ? `
              <!-- Select All Item -->
              <label style="display: flex; align-items: center; gap: 16px; padding: 16px 24px; background: #faf9f6; border-radius: 16px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f4f2ec'" onmouseout="this.style.background='#faf9f6'">
                <input type="checkbox" id="cb-select-all-mantenimientos" style="accent-color: #386a3e; width: 18px; height: 18px; cursor: pointer; flex-shrink: 0;">
                <div style="display: flex; flex-direction: column;">
                  <span style="font-size: 13px; font-weight: 800; color: #555;">Seleccionar todos los archivos</span>
                  <span style="font-size: 10px; font-weight: 700; color: #aaa; text-transform: uppercase; margin-top: 2px;">${mants.length} ARCHIVOS DISPONIBLES</span>
                </div>
              </label>
              
              ` + mants.map((m, index) => {
                  const d = new Date(m.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                  // Simulate file size for aesthetics as in the mock
                  const mb = ((index % 3) + 1.2).toFixed(1);
                  return `
                  <!-- Maintenance Item -->
                  <label class="maint-export-item" style="display: flex; align-items: center; gap: 16px; padding: 16px 24px; background: #faf9f6; border-radius: 16px; cursor: pointer; transition: background 0.2s;" onmouseover="this.style.background='#f4f2ec'" onmouseout="this.style.background='#faf9f6'">
                    
                    <input type="checkbox" class="maint-export-cb" data-mantenimiento-id="${m.id}" data-fecha="${m.fecha}" style="accent-color: #386a3e; width: 18px; height: 18px; cursor: pointer; flex-shrink: 0;">
                    
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: #eef3ef; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                      <span class="material-icons" style="color: #386a3e; font-size: 20px;">picture_as_pdf</span>
                    </div>

                    <div style="display: flex; flex-direction: column; flex: 1;">
                      <span style="font-size: 13px; font-weight: 800; color: #444; margin-bottom: 2px;">${m.titulo || m.tipo || 'Mantenimiento Preventivo'} - ${d}.pdf</span>
                      <span style="font-size: 10px; font-weight: 700; color: #aaa; text-transform: uppercase; margin-top: 2px;">${mb} MB • REGISTRO TÉCNICO</span>
                    </div>

                  </label>
                  `;
                }).join('')
              : `
                <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; padding: 40px; height: 100%;">
                  <div style="width: 56px; height: 56px; background: #fdf9f3; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-bottom: 24px;">
                     <span class="material-icons" style="color: #d7cdba; font-size: 24px;">receipt_long</span>
                  </div>
                  <h4 style="font-size: 15px; font-weight: 800; color: #555; margin-bottom: 8px;">Sin archivos disponibles</h4>
                  <p style="font-size: 13px; color: #999; font-weight: 500; line-height: 1.5; max-width: 250px; margin-bottom: 32px;">No se han registrado cambios de aceite para este motor todavía.</p>
                  
                  ${requiresAlert ? '' : `
                  <button id="btn-empty-register-oil" style="background: #fdfaf6; color: #555; padding: 12px 24px; border-radius: 100px; font-weight: 800; font-size: 12px; border: 1px solid #ddd; display: flex; align-items: center; gap: 8px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#f0ebdf';" onmouseout="this.style.background='#fdfaf6';">
                    <span class="material-icons" style="font-size: 16px;">add</span> Registrar mantenimiento
                  </button>
                  `}
                </div>
              `}
            </div>

            <!-- Bottom Button -->
            ${mants && mants.length > 0 ? `
            <div style="margin-top: 24px; position: relative;">
               <div id="download-floating-menu" style="display: none; position: absolute; left: 0; right: 0; bottom: 120%; background: white; border: 1px solid #eee; border-radius: 12px; box-shadow: 0 10px 25px rgba(0,0,0,0.1); flex-direction: column; z-index: 100; overflow: hidden;">
                  <button id="btn-download-pdf" style="background: white; color: #444; padding: 12px 16px; border: none; border-bottom: 1px solid #eee; font-weight: 700; font-size: 13px; text-align: left; display: flex; align-items: center; gap: 8px; cursor: pointer; width: 100%; transition: background 0.1s;" onmouseover="this.style.background='#fdfaf6'" onmouseout="this.style.background='white'">
                    <span class="material-icons" style="color: #ba1a1a; font-size: 18px;">picture_as_pdf</span> Exportar PDF
                  </button>
                  <button id="btn-download-excel" style="background: white; color: #444; padding: 12px 16px; border: none; font-weight: 700; font-size: 13px; text-align: left; display: flex; align-items: center; gap: 8px; cursor: pointer; width: 100%; transition: background 0.1s;" onmouseover="this.style.background='#fdfaf6'" onmouseout="this.style.background='white'">
                    <span class="material-icons" style="color: #107c41; font-size: 18px;">table_view</span> Exportar Excel
                  </button>
                </div>
                <button id="btn-toggle-download-menu" style="width: 100%; background: #386a3e; color: white; padding: 16px 24px; border-radius: 100px; font-weight: 800; font-size: 14px; border: none; display: flex; align-items: center; justify-content: center; gap: 8px; cursor: pointer; transition: all 0.2s;" onmouseover="this.style.background='#2c5331';" onmouseout="this.style.background='#386a3e';">
                  <span class="material-icons" style="font-size: 18px;">download</span> Descargar seleccionados
                </button>
            </div>
            ` : ''}

          </div>
        </div>
      </div>
    </div>
  `;
}

// Interactive Logic
export function initDetalleMotor(motorId) {
  let timerInterval = null;
  let isRunning = false;
  let lastStartTime = 0;
  let savedElapsed = 0; // ms

  const clockDisplay = document.getElementById('clock-display');
  const btnStart = document.getElementById('btn-timer-start');
  if (!btnStart) return; 

  const btnPause = document.getElementById('btn-timer-pause');
  const btnReset = document.getElementById('btn-timer-reset');
  const btnFinish = document.getElementById('btn-timer-finish');
  const btnRegisterOil = document.getElementById('btn-register-oil-change');

  const manualStart = document.getElementById('input-manual-start');
  const manualEnd = document.getElementById('input-manual-end');
  const manualDate = document.getElementById('input-manual-date');
  const calcResult = document.getElementById('calc-manual-result');
  const btnManualSave = document.getElementById('btn-save-manual');
  const btnEmptyRegisterOil = document.getElementById('btn-empty-register-oil');
  const btnAlertRegisterOil = document.getElementById('btn-alert-register-oil');

  if (btnRegisterOil) {
    btnRegisterOil.onclick = () => registerOilChange(motorId);
  }
  if (btnEmptyRegisterOil) {
    btnEmptyRegisterOil.onclick = () => registerOilChange(motorId);
  }
  if (btnAlertRegisterOil) {
    btnAlertRegisterOil.onclick = () => registerOilChange(motorId);
  }

  // Integration with custom M3 pickers
  import('../pickers.js').then(({ m3Pickers }) => {
    if (manualDate) {
      manualDate.parentElement.onclick = () => {
        m3Pickers.showDatePicker(manualDate.value, (val) => {
          manualDate.value = val;
          calculateManual();
        });
      };
    }

    if (manualStart) {
      manualStart.parentElement.onclick = () => {
        m3Pickers.showTimePicker(manualStart.value, (val) => {
          manualStart.value = val;
          calculateManual();
        });
      };
    }

    if (manualEnd) {
      manualEnd.parentElement.onclick = () => {
        m3Pickers.showTimePicker(manualEnd.value, (val) => {
          manualEnd.value = val;
          calculateManual();
        });
      };
    }
  });

  // Load state from localStorage
  const savedState = JSON.parse(localStorage.getItem(`motor_v2_timer_${motorId}`));
  if (savedState) {
    savedElapsed = savedState.savedElapsed || 0;
    isRunning = savedState.isRunning || false;
    lastStartTime = savedState.lastStartTime || 0;
    
    if (isRunning) {
      resumeTimer();
    } else {
      updateDisplay();
      updateButtons();
    }
  }

  function updateDisplay() {
    let total = savedElapsed;
    if (isRunning) {
      total += (Date.now() - lastStartTime);
    }
    if (clockDisplay) clockDisplay.textContent = formatToDigital(total);
  }

  function formatToDigital(ms) {
    const totalSecs = Math.floor(ms / 1000);
    const h = Math.floor(totalSecs / 3600);
    const m = Math.floor((totalSecs % 3600) / 60);
    const s = totalSecs % 60;
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  function updateButtons() {
    if (btnStart) btnStart.disabled = isRunning;
    if (btnPause) btnPause.disabled = !isRunning;
    if (btnFinish) btnFinish.disabled = (savedElapsed === 0 && !isRunning);
  }

  function saveState() {
    localStorage.setItem(`motor_v2_timer_${motorId}`, JSON.stringify({
      savedElapsed,
      isRunning,
      lastStartTime
    }));
  }

  function resumeTimer() {
    isRunning = true;
    updateButtons();
    timerInterval = setInterval(() => {
      updateDisplay();
    }, 1000);
  }

  btnStart.onclick = () => {
    lastStartTime = Date.now();
    resumeTimer();
    saveState();
  };

  btnPause.onclick = () => {
    clearInterval(timerInterval);
    savedElapsed += (Date.now() - lastStartTime);
    isRunning = false;
    updateButtons();
    saveState();
  };

  if (btnReset) {
    btnReset.onclick = () => {
      clearInterval(timerInterval);
      isRunning = false;
      savedElapsed = 0;
      lastStartTime = 0;
      updateDisplay();
      updateButtons();
      saveState();
    };
  }

  btnFinish.onclick = async () => {
    let finalElapsed = savedElapsed;
    if (isRunning) {
      finalElapsed += (Date.now() - lastStartTime);
    }
    
    // Calcular hora_inicio y hora_fin
    const dInicio = new Date(Date.now() - finalElapsed);
    const dFin = new Date();
    const strInicio = `${dInicio.getHours().toString().padStart(2, '0')}:${dInicio.getMinutes().toString().padStart(2, '0')}`;
    const strFin = `${dFin.getHours().toString().padStart(2, '0')}:${dFin.getMinutes().toString().padStart(2, '0')}`;

    const elapsedMins = Math.round(finalElapsed / (1000 * 60));
    
    if (elapsedMins < 1) {
      window.Snackbar.confirm(
        'La sesión es muy corta (< 1 min). ¿Deseas guardarla de todas formas?',
        async () => {
          await saveSession(motorId, elapsedMins, null, strInicio, strFin);
          clearTimer();
        }
      );
    } else {
      await saveSession(motorId, elapsedMins, null, strInicio, strFin);
      clearTimer();
    }
  };

  async function clearTimer() {
    clearInterval(timerInterval);
    localStorage.removeItem(`motor_v2_timer_${motorId}`);
    await reloadDetalleSinParpadeo(motorId);
  }

  // --- Manual Logic ---
  function calculateManual() {
    if (!manualStart || !manualEnd) return;
    const start = manualStart.value; // HH:MM
    const end = manualEnd.value;
    if (!start || !end) return;

    const [h1, m1] = start.split(':').map(Number);
    const [h2, m2] = end.split(':').map(Number);
    
    let totalMins = (h2 * 60 + m2) - (h1 * 60 + m1);
    if (totalMins < 0) totalMins += 1440; // Next day fallback

    const h = Math.floor(totalMins / 60);
    const m = totalMins % 60;
    if (calcResult) calcResult.textContent = `${h}h ${m}m`;
    return totalMins;
  }

  if (manualStart) manualStart.oninput = calculateManual;
  if (manualEnd) manualEnd.oninput = calculateManual;
  calculateManual(); // Initial calc

  if (btnManualSave) {
    btnManualSave.onclick = async () => {
      const mins = calculateManual();
      const date = manualDate.value;
      const start = manualStart ? manualStart.value : null;
      const end = manualEnd ? manualEnd.value : null;
      
      if (mins <= 0) {
        window.Snackbar.show('La duración debe ser mayor a 0.', { type: 'error' });
        return;
      }

      btnManualSave.disabled = true;
      await saveSession(motorId, mins, date, start, end);
      btnManualSave.disabled = false;
    };
  }



  async function registerOilChange(id) {
    window.Snackbar.confirm('¿Confirmas que has realizado el cambio de aceite? Esto reseteará el contador de horas a 0.', async () => {
      try {
        // 0. Fetch current total hours before resetting
        const { data: motor } = await supabase.from('motores').select('horas').eq('id', id).single();
        const currentHours = parseFloat(motor.horas) || 0;

        // 0.5 Fetch all current sessions to archive them
        const { data: currentSessions } = await supabase.from('motor_sesiones').select('*').eq('motor_id', id).order('fecha', { ascending: false });

        // 1. Reset motor hours in DB
        const { error: resetErr } = await supabase.from('motores').update({ horas: 0 }).eq('id', id);
        if (resetErr) throw resetErr;

        // 2. Log maintenance and archive sessions
        const { error: logErr } = await supabase.from('motor_mantenimientos').insert({
          motor_id: id,
          titulo: 'Cambio de Aceite',
          descripcion: 'Mantenimiento preventivo. Contador reestablecido a 0.',
          fecha: new Date().toISOString(),
          total_horas: currentHours,
          historial_sesiones: currentSessions || []
        });
        if (logErr) throw logErr;

        // 3. Purge old sessions since they are now compressed into the maintenance record.
        const { error: purgeErr } = await supabase.from('motor_sesiones').delete().eq('motor_id', id);
        if (purgeErr) console.warn('No se pudieron purgar las sesiones antiguas', purgeErr);

        window.Snackbar.show('Mantenimiento registrado con éxito.', { type: 'success' });
        await reloadDetalleSinParpadeo(id);

      } catch (err) {
        console.error(err);
        window.Snackbar.show('Error al resetear: ' + err.message, { type: 'error' });
      }
    });
  }

  // Initialize export logic
  const selectAllCb = document.getElementById('cb-select-all-mantenimientos');
  if (selectAllCb) {
    selectAllCb.addEventListener('change', (e) => {
      const isChecked = e.target.checked;
      const cbs = document.querySelectorAll('.maint-export-cb');
      cbs.forEach(cb => cb.checked = isChecked);
    });
  }

  const btnToggleMenu = document.getElementById('btn-toggle-download-menu');
  const dMenu = document.getElementById('download-floating-menu');
  
  if (btnToggleMenu && dMenu) {
    btnToggleMenu.onclick = (e) => {
      e.stopPropagation();
      dMenu.style.display = dMenu.style.display === 'flex' ? 'none' : 'flex';
    };
    document.addEventListener('click', () => {
      if (dMenu.style.display === 'flex') {
        dMenu.style.display = 'none';
      }
    });
    dMenu.onclick = (e) => e.stopPropagation();
  }

  const btnExcel = document.getElementById('btn-download-excel');
  if (btnExcel) btnExcel.onclick = () => { if(dMenu) dMenu.style.display = 'none'; downloadSelectedSessions('excel'); };

  const btnPdf = document.getElementById('btn-download-pdf');
  if (btnPdf) btnPdf.onclick = () => { if(dMenu) dMenu.style.display = 'none'; downloadSelectedSessions('pdf'); };

  async function downloadSelectedSessions(format) {
    const checkboxes = document.querySelectorAll('.maint-export-cb:checked');
    if (checkboxes.length === 0) {
      window.Snackbar.show('Selecciona al menos un cambio de aceite para descargar su historial', { type: 'error' });
      return;
    }

    const selectedIds = Array.from(checkboxes).map(cb => cb.dataset.mantenimientoId);
    
    window.Snackbar.show('Obteniendo historial...', { type: 'info' });

    // Fetch the sessions associated with these maintenance records
    const { data: mants, error } = await supabase
        .from('motor_mantenimientos')
        .select('id, titulo, fecha, historial_sesiones')
        .in('id', selectedIds)
        .order('fecha', { ascending: false });

    if (error) {
        window.Snackbar.show('Error al obtener el historial', { type: 'error' });
        return;
    }

    // Flatten all historical sessions into one list
    let data = [];
    mants.forEach(m => {
        const sesiones = m.historial_sesiones || [];
        sesiones.forEach(s => {
            data.push({
                fecha_mantenimiento: m.fecha,
                fecha: s.fecha,
                operador: s.operador || 'Admin',
                duracion: s.duracion_mins || 0,
                total: s.total_horas || 0,
                hora_inicio: s.hora_inicio || '---',
                hora_fin: s.hora_fin || '---'
            });
        });
    });

    if (data.length === 0) {
        window.Snackbar.show('No hay sesiones registradas en los cambios de aceite seleccionados.', { type: 'error' });
        return;
    }

    if (format === 'excel') {
      let csv = 'Día de Trabajo,Operador,Hora Inicio,Hora Fin,Duracion,Total Horas\\n';
      data.forEach(row => {
        const durStr = `${Math.floor(row.duracion / 60)}h ${row.duracion % 60}m`;
        csv += `${new Date(row.fecha).toLocaleDateString()},"${row.operador.replace(/"/g, '""')}",${row.hora_inicio},${row.hora_fin},${durStr},${row.total}H\\n`;
      });
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'sesiones_motor.csv';
      a.click();
      URL.revokeObjectURL(url);
    } else if (format === 'pdf') {
      window.Snackbar.show('Generando PDF...', { type: 'info' });
      const script = document.createElement('script');
      script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
      script.onload = () => {
        const autoTableScript = document.createElement('script');
        autoTableScript.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.31/jspdf.plugin.autotable.min.js";
        autoTableScript.onload = () => {
          const { jsPDF } = window.jspdf;
          const doc = new jsPDF();
          
          // Extraer fechas únicas de cambio de aceite para el encabezado
          const fechasUnicas = [...new Set(data.map(r => new Date(r.fecha_mantenimiento).toLocaleDateString()))].join(', ');
          
          doc.text(`Historial de Operaciones - Cambio del: ${fechasUnicas}`, 14, 15);
          doc.autoTable({
            startY: 20,
            head: [['Día de Trabajo', 'Operador', 'Inicio', 'Fin', 'Duración', 'Total Horas']],
            body: data.map(r => {
                const durStr = `${Math.floor(r.duracion / 60)}h ${r.duracion % 60}m`;
                return [new Date(r.fecha).toLocaleDateString(), r.operador, r.hora_inicio, r.hora_fin, durStr, r.total + 'H'];
            })
          });
          doc.save("sesiones_motor.pdf");
          window.Snackbar.show('PDF Descargado', { type: 'success' });
        };
        document.head.appendChild(autoTableScript);
      };
      document.head.appendChild(script);
    }
  }
}

async function saveSession(motorId, mins, customDate = null, horaInicio = null, horaFin = null) {
   try {
    // 1. Get current motor hours
    const { data: motor } = await supabase.from('motores').select('horas, max_horas').eq('id', motorId).single();
    const currentHours = parseFloat(motor.horas) || 0;
    const newTotal = currentHours + (mins / 60);
    const maxH = motor.max_horas || 100;

    // 2. Insert session
    const { error: sErr } = await supabase.from('motor_sesiones').insert({
      motor_id: motorId,
      fecha: customDate ? new Date(customDate + 'T12:00:00').toISOString() : new Date().toISOString(),
      duracion_mins: mins,
      total_horas: Math.round(newTotal * 10) / 10,
      operador: 'Admin',
      hora_inicio: horaInicio,
      hora_fin: horaFin
    });

    if (sErr) throw sErr;

    // 3. Update motor total hours
    const newRoundedTotal = Math.round(newTotal * 10) / 10;
    const { error: mErr } = await supabase.from('motores').update({ 
      horas: newRoundedTotal 
    }).eq('id', motorId);

    if (mErr) throw mErr;

    // 4. Smooth UI Update or Reload if limit reached
    window.Snackbar.show('Horas trabajadas agregadas', { type: 'success' });
    
    if (newRoundedTotal >= maxH) {
      // Si superamos o llegamos al limite, re-renderizamos sin parpadeo para mostrar el panel rojo de alerta
      await reloadDetalleSinParpadeo(motorId);
      return;
    }

    // Update labels
    const uiHoursLeft = document.getElementById('ui-hours-left');
    const uiAccHours = document.getElementById('ui-acc-hours');
    const uiMaintBar = document.getElementById('ui-maint-bar');
    const uiTotalHoursSimple = document.getElementById('motor-total-hours');
    const uiProgressBarSimple = document.getElementById('motor-progress-bar');

    if (uiHoursLeft) uiHoursLeft.textContent = `${Math.max(0, maxH - newRoundedTotal).toFixed(1)}h`;
    if (uiAccHours) uiAccHours.innerHTML = `<b>${newRoundedTotal.toFixed(1)}h</b> <span style="color:#aaa; font-weight:400; letter-spacing:0;">/ ${maxH.toFixed(1)}h</span>`;
    
    const newPct = Math.min(100, Math.round((newRoundedTotal / maxH) * 100));
    if (uiMaintBar) uiMaintBar.style.width = `${newPct}%`;
    if (uiProgressBarSimple) uiProgressBarSimple.style.width = `${newPct}%`;
    if (uiTotalHoursSimple) uiTotalHoursSimple.innerHTML = `<b>${newRoundedTotal.toFixed(1)}h</b> / ${maxH.toFixed(1)}h`;

    // Optionally Refresh Session List (Simplified: just add a placeholder or re-render list)
    // For now, full redirect was the previous behavior. I'll just show the success.
    // The user might want to see the new record in the list, so I'll trigger a small re-render of the list only.
    refreshSessionList(motorId);

  } catch (err) {
    console.error(err);
    window.Snackbar.show('Error al guardar: ' + err.message, { type: 'error' });
  }
}

async function refreshSessionList(motorId) {
  const container = document.getElementById('session-history-container');
  if (!container) return;

  const { data: sesiones } = await supabase
    .from('motor_sesiones')
    .select('*')
    .eq('motor_id', motorId)
    .order('fecha', { ascending: false });

  if (sesiones) {
    container.innerHTML = sesiones.map(s => {
      const d = new Date(s.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
      return `
      <div class="session-row-minimal">
        <div class="flex items-center gap-4">
          <div class="session-icon-box" style="border-radius: 50%; width: 44px; height: 44px; color: #777; background: #fdfaf6; display: flex; justify-content: center; align-items: center; flex-shrink: 0;">
            <span class="material-icons" style="font-size: 20px;">history</span>
          </div>
          <div>
            <p style="font-size: 14px; font-weight: 700; color: #444; margin: 0;">${d}</p>
            <p style="font-size: 11px; color: #888; font-weight: 500; margin: 0;">Operador: ${s.operador || 'Admin'}</p>
          </div>
        </div>
        <div style="text-align: right;">
          <p style="font-size: 16px; font-weight: 800; color: #386a3e; margin: 0;">${s.duracion_mins ? Math.floor(s.duracion_mins / 60) + 'h ' + (s.duracion_mins % 60) + 'm' : s.total_horas + 'h'}</p>
          <p style="font-size: 9px; font-weight: 800; color: #999; letter-spacing: 0.5px; margin-top: 2px;">TOTAL: ${s.total_horas || 0}H</p>
        </div>
      </div>
      `;
    }).join('');
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
    // Fallback if not found
    window.navigateTo('detalle_motor', motorId);
  }
}
