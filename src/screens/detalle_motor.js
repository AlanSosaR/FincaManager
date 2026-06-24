import { supabase } from '../supabase.js';
import { showModal, closeModal } from '../modals.js';
import { showSnackbar } from '../snackbar.js';

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

  return `
      <!-- Main Detail Card (GitHub/Vercel Design) -->
      <div class="card" style="background: white; border-radius: 32px; padding: 32px; box-shadow: 0 4px 20px rgba(0,0,0,0.03); border: 1px solid rgba(0,0,0,0.05); margin-bottom: 32px; position: relative;">
        
        <!-- Header: Image + Title + Edit Icon -->
        <div class="motor-detail-header">
          <div class="motor-header-info">
            <div class="motor-header-image">
              ${motor.image_url 
                ? `<img src="${motor.image_url}" alt="${motor.nombre}">`
                : `<div class="motor-header-placeholder"><span class="material-icons">engine</span></div>`
              }
            </div>
            <div class="motor-header-text">
              <h2 class="motor-header-title">${motor.nombre || 'Sin Nombre'}</h2>
              <p class="motor-header-subtitle">
                ${motor.marca || 'Sin marca'} • ${motor.modelo || 'S/M'}
              </p>
            </div>
          </div>
          <button class="material-icons motor-edit-btn" onclick="window.navigateTo('nuevo_motor', '${motor.id}')">
            edit
          </button>
        </div>

        <!-- Stats Grid -->
        <div class="motor-stats-grid">
          <div>
            <span style="font-size: 12px; font-weight: 600; color: #888; display: block; margin-bottom: 8px;">Uso Acumulado</span>
            <div style="font-size: 20px; font-weight: 800; color: #1a1a1a;">${totalHoras.toFixed(1)}h</div>
          </div>
          <div>
            <span style="font-size: 12px; font-weight: 600; color: #888; display: block; margin-bottom: 8px;">Límite Servicio</span>
            <div style="font-size: 20px; font-weight: 800; color: #1a1a1a;">${maxHoras}h</div>
          </div>
          <div>
            <span style="font-size: 12px; font-weight: 600; color: #888; display: block; margin-bottom: 8px;">Próximo Cambio</span>
            <div style="font-size: 20px; font-weight: 800; color: #1a1a1a;">${horasRestantes.toFixed(1)}h</div>
          </div>
          <div>
            <span style="font-size: 12px; font-weight: 600; color: #888; display: block; margin-bottom: 8px;">Estado</span>
            <div style="margin-top: 4px;">
              <span style="background: ${requiresAlert ? '#ffe2db' : '#e4fd97'}; color: ${requiresAlert ? '#ff4103' : '#2d3e2c'}; padding: 6px 14px; border-radius: 12px; font-size: 12px; font-weight: 700; display: inline-block;">
                ${requiresAlert ? 'Atención' : 'Operativo'}
              </span>
            </div>
          </div>
        </div>

        <!-- Health Progress -->
        <div>
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
            <span style="font-size: 12px; font-weight: 700; color: #666;">Vida útil del aceite</span>
            <span style="font-size: 12px; font-weight: 800; color: ${requiresAlert ? '#ff4103' : '#2d3e2c'};">${pct}%</span>
          </div>
          <div style="height: 8px; background: #eee; border-radius: 4px; overflow: hidden; position: relative;">
            <div style="width: ${pct}%; height: 100%; background: ${requiresAlert ? '#ff4103' : '#2d3e2c'}; border-radius: 4px; transition: width 1s ease-out;"></div>
          </div>
        </div>

        <!-- Register Oil Button (only if alert) -->
        ${requiresAlert ? `
          <button class="btn-m3-fill" id="btn-alert-register-oil" style="margin-top: 24px; width: 100%; background: #ff4103; box-shadow: 0 4px 12px rgba(198, 40, 40, 0.2);">
            <span class="material-icons" style="font-size: 20px; margin-right: 8px; vertical-align: middle;">oil_barrel</span>
            Registrar Cambio de Aceite
          </button>
        ` : ''}
      </div>

      <div class="grid-2" style="margin-top: 24px;">
        
        <!-- Left Column: Operations -->
        <div class="section">
          
          <!-- Timer Card -->
          <div class="card" style="padding: 32px; margin-bottom: 24px; text-align: center; background: white; border: 1px solid rgba(0,0,0,0.05); box-shadow: 0 4px 20px rgba(0,0,0,0.03); border-radius: 32px;">
            <div style="display: flex; align-items: center; gap: 8px; justify-content: center; margin-bottom: 16px; color: #888;">
              <span class="material-icons" style="font-size: 18px;">timer</span>
              <span style="font-size: 12px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase;">Control de Sesión</span>
            </div>
            
            <div id="clock-display" style="font-size: 64px; font-weight: 900; color: var(--primary-container); font-family: 'JetBrains Mono', monospace; margin: 24px 0; letter-spacing: -2px;">00:00:00</div>
            
            <div style="display: flex; gap: 24px; justify-content: center; margin-top: 32px;">
              <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                <button id="btn-timer-start" class="btn-m3-fill" style="width: 72px; height: 72px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center; box-shadow: var(--m3-elevation-2);">
                  <span class="material-icons" style="font-size: 36px;">play_arrow</span>
                </button>
                <span style="font-size: 11px; font-weight: 700; color: var(--on-surface-variant);">INICIAR</span>
              </div>
              
              <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                <button id="btn-timer-pause" class="btn-m3-tonal" disabled style="width: 64px; height: 64px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center;">
                  <span class="material-icons" style="font-size: 28px;">pause</span>
                </button>
                <span style="font-size: 11px; font-weight: 700; color: var(--on-surface-variant);">PAUSAR</span>
              </div>
              
              <div style="display: flex; flex-direction: column; align-items: center; gap: 8px;">
                <button id="btn-timer-finish" class="btn-m3-tonal" disabled style="width: 64px; height: 64px; border-radius: 50%; padding: 0; display: flex; align-items: center; justify-content: center;">
                  <span class="material-icons" style="font-size: 28px;">stop</span>
                </button>
                <span style="font-size: 11px; font-weight: 700; color: var(--on-surface-variant);">FINALIZAR</span>
              </div>
            </div>
            
            <div id="ui-current-session-info" style="margin-top: 32px; padding: 12px; background: white; border-radius: 12px; display: inline-block; border: 1px solid rgba(0,0,0,0.05);">
               <span id="ui-current-session-label" style="font-size: 13px; font-weight: 600; color: #666;">Motor en reposo</span>
            </div>
          </div>

          <!-- Manual Entry Card -->
          <div class="card" style="padding: 24px;">
            <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px;">
              <div style="background: var(--secondary-container); color: var(--on-secondary-container); width: 40px; height: 40px; border-radius: 10px; display: flex; align-items: center; justify-content: center;">
                <span class="material-icons">edit_calendar</span>
              </div>
              <h3 style="margin: 0; font-size: 18px;">Registro Manual</h3>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 20px;">
              <div class="m3-field">
                <input type="text" id="input-manual-date" value="${today}" readonly placeholder=" ">
                <label>Fecha</label>
                <span class="material-icons" style="cursor: pointer;">calendar_today</span>
              </div>
              
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 16px;">
                <div class="m3-field">
                  <input type="text" id="input-manual-start" value="08:00 AM" readonly placeholder=" ">
                  <label>Inicio</label>
                  <span class="material-icons" style="cursor: pointer;">login</span>
                </div>
                <div class="m3-field">
                  <input type="text" id="input-manual-end" value="12:00 PM" readonly placeholder=" ">
                  <label>Fin</label>
                  <span class="material-icons" style="cursor: pointer;">logout</span>
                </div>
              </div>

              <div style="background: var(--surface-variant); padding: 16px; border-radius: 16px; display: flex; justify-content: space-between; align-items: center; border: 1px dashed #ccc;">
                <div style="display: flex; flex-direction: column;">
                  <span style="font-size: 11px; font-weight: 700; color: #666; text-transform: uppercase;">Duración Calculada</span>
                  <span id="calc-manual-result" style="font-size: 18px; font-weight: 900; color: var(--primary-container);">4h 00m</span>
                </div>
                <button id="btn-save-manual" class="btn-m3-fill" style="padding: 12px 24px;">Guardar</button>
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
            ${sesiones && sesiones.length > 0 ? sesiones.map(s => `
              <div class="activity-item" style="padding: 16px; border-bottom: 1px solid var(--m3-outline-variant);">
                <div class="activity-icon" style="background: var(--primary-container); color: var(--primary-container); border-radius: 12px; width: 44px; height: 44px;">
                  <span class="material-icons" style="font-size: 20px;">history</span>
                </div>
                <div class="activity-content" style="flex: 1;">
                  <h4 style="font-size: 14px; margin: 0; font-weight: 700;">
                    ${new Date(s.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </h4>
                  <p style="font-size: 12px; color: #666; margin: 4px 0;">
                    ${s.hora_inicio || ''} - ${s.hora_fin || ''} • Operador: ${s.operador || 'Admin'}
                  </p>
                  <span class="history-date" style="font-weight: 800; color: var(--primary-container);">
                    ${s.duracion_mins ? Math.floor(s.duracion_mins / 60) + 'h ' + (s.duracion_mins % 60) + 'm' : s.total_horas + 'h'} trabajadas
                  </span>
                </div>
                <div style="text-align: right;">
                   <span style="font-size: 10px; font-weight: 800; color: #aaa; text-transform: uppercase; display: block;">Total Motor</span>
                   <span style="font-size: 14px; font-weight: 900; color: #444;">${s.total_horas || 0}H</span>
                </div>
              </div>
            `).join('') : '<p style="text-align:center; padding: 40px; color:#999; background: var(--surface); border-radius: 20px; border: 1px dashed #ccc;">No hay sesiones registradas.</p>'}
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
            `).join('') : '<p style="text-align:center; padding: 40px; color:#999; background: var(--surface); border-radius: 20px; border: 1px dashed #ccc;">Sin mantenimientos registrados.</p>'}
          </div>

        </div>

      </div>
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
  if (!btnStart) return;

  const btnPause = document.getElementById('btn-timer-pause');
  const btnFinish = document.getElementById('btn-timer-finish');
  const uiLabel = document.getElementById('ui-current-session-label');

  // Load state
  const savedState = JSON.parse(localStorage.getItem(`motor_v2_timer_${motorId}`));
  if (savedState) {
    savedElapsed = savedState.savedElapsed || 0;
    isRunning = savedState.isRunning || false;
    lastStartTime = savedState.lastStartTime || 0;
    if (isRunning) resumeTimer();
    else {
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
    if (uiLabel) uiLabel.textContent = isRunning ? 'Motor en funcionamiento...' : (total > 0 ? 'Sesión en pausa' : 'Motor en reposo');
  }

  function updateButtons() {
    btnStart.disabled = isRunning;
    btnPause.disabled = !isRunning;
    btnFinish.disabled = (savedElapsed === 0 && !isRunning);
  }

  function saveLocalState() {
    localStorage.setItem(`motor_v2_timer_${motorId}`, JSON.stringify({ savedElapsed, isRunning, lastStartTime }));
  }

  function resumeTimer() {
    isRunning = true;
    updateButtons();
    timerInterval = setInterval(updateDisplay, 1000);
  }

  btnStart.onclick = () => {
    lastStartTime = Date.now();
    resumeTimer();
    saveLocalState();
  };

  btnPause.onclick = () => {
    clearInterval(timerInterval);
    savedElapsed += (Date.now() - lastStartTime);
    isRunning = false;
    updateButtons();
    saveLocalState();
    updateDisplay();
  };

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

    await saveSession(motorId, mins, null, format12(dInicio), format12(dFin));
    resetTimer();
  };

  function resetTimer() {
    clearInterval(timerInterval);
    localStorage.removeItem(`motor_v2_timer_${motorId}`);
    savedElapsed = 0;
    isRunning = false;
    window.navigateTo('detalle_motor', motorId);
  }

  // --- Manual Entry Logic ---
  const manualDate = document.getElementById('input-manual-date');
  const manualStart = document.getElementById('input-manual-start');
  const manualEnd = document.getElementById('input-manual-end');
  const calcResult = document.getElementById('calc-manual-result');
  const btnSaveManual = document.getElementById('btn-save-manual');

  function calculateManual() {
    const to24 = (t12) => {
      const [time, suffix] = t12.split(' ');
      let [h, m] = time.split(':').map(Number);
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

  // Integration with custom M3 pickers
  import('../pickers.js').then(({ m3Pickers }) => {
    [manualDate, manualStart, manualEnd].forEach(el => {
      if (!el) return;
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
      await saveSession(motorId, mins, manualDate.value, manualStart.value, manualEnd.value);
      window.navigateTo('detalle_motor', motorId);
    };
  }

  // Maintenance & Oil Change
  const btnOil = document.getElementById('btn-register-oil-change');
  const btnAlertOil = document.getElementById('btn-alert-register-oil');
  
  const handleOilChange = () => registerOilChange(motorId);
  if (btnOil) btnOil.onclick = handleOilChange;
  if (btnAlertOil) btnAlertOil.onclick = handleOilChange;

  // Delete maintenance
  document.querySelectorAll('.btn-delete-maintenance').forEach(btn => {
    btn.onclick = async () => {
      if (confirm('¿Deseas eliminar este registro de mantenimiento?')) {
        const id = btn.dataset.id;
        await supabase.from('motor_mantenimientos').delete().eq('id', id);
        window.navigateTo('detalle_motor', motorId);
      }
    };
  });
}

async function saveSession(motorId, mins, customDate = null, horaInicio = null, horaFin = null) {
  try {
    const { data: motor } = await supabase.from('motores').select('horas').eq('id', motorId).single();
    const newTotal = (parseFloat(motor.horas) || 0) + (mins / 60);
    const rounded = Math.round(newTotal * 10) / 10;

    await supabase.from('motor_sesiones').insert({
      motor_id: motorId,
      fecha: customDate ? new Date(customDate + 'T12:00:00').toISOString() : new Date().toISOString(),
      duracion_mins: mins,
      total_horas: rounded,
      operador: 'Admin',
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
    // Fallback if not found
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
