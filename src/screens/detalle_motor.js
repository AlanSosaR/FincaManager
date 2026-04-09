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

  const pct = Math.min(100, Math.round(((motor.horas || 0) / (motor.max_horas || 100)) * 100));

  return `
    <div class="screen-detalle-motor">

      <!-- Simple Header -->
      <button class="btn-back" onclick="document.querySelector('[data-screen=motores]').click()">
        <span class="material-icons">arrow_back</span> Detalle: ${motor.nombre}
      </button>

      <!-- Top Row -->
      <div class="grid-top">
        
        <!-- Hero Stats Card -->
        <div class="hero-stats-card">
          <div>
            <div class="hero-stats-header">
              <span class="hero-stats-title">USO DEL MOTOR</span>
              <span class="pill-active"><span class="material-icons" style="font-size:16px;">timer</span> SN: ${motor.sn || 'N/A'}</span>
            </div>
            <div class="hours-display">
              <span class="hours-big">${motor.horas || 0}h</span>
              <span class="hours-limit">/ ${motor.max_horas || 100}h límite</span>
            </div>
            <div class="progress-track">
              <div class="progress-fill" style="width: ${pct}%;"></div>
            </div>
          </div>
          <div class="hero-buttons">
            <button class="btn-danger">
              <span class="material-icons">stop_circle</span> Detener sesión
            </button>
            <button class="btn-white">
              <span class="material-icons">local_gas_station</span> Registrar cambio de aceite
            </button>
          </div>
        </div>

        <!-- Hero Image Card -->
        <div class="hero-image-card">
          <div class="image-container">
            <div class="image-overlay"></div>
            <div class="image-text">
              <h3>Estado General</h3>
              <p><span class="dot-green"></span> En Operación • Óptimo</p>
            </div>
          </div>
          <div class="image-card-content">
            <div class="maint-row">
              <span class="maint-label">Último Mantenimiento</span>
              <span class="maint-value">12 Oct 2023</span>
            </div>
            <div class="maint-row">
              <span class="maint-label">Próximo Cambio</span>
              <span class="maint-value brown">20h restantes</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Row -->
      <div class="grid-cols">
        
        <!-- Left Column -->
        <div class="col-left">
          
          <!-- Manual Hours Card -->
          <div class="manual-hours-card">
            <h3 class="manual-hours-title">
              <span class="material-icons">history_toggle_off</span> Agregar horas manuales
            </h3>
            <div class="input-labels">
              <span>Fecha</span>
              <span>Duración</span>
            </div>
            <div class="input-row">
              <div class="input-field">
                <span class="material-icons" style="color:#aaa;">calendar_today</span>
                <input type="text" value="24/10/2023" readonly>
              </div>
              <div class="input-field">
                <span class="material-icons" style="color:#aaa;">schedule</span>
                <input type="text" placeholder="HH:MM">
              </div>
            </div>
            <div class="result-box">
              <span class="result-label">Resultado calculado</span>
              <span class="result-value">= 3h 20m</span>
            </div>
            <button class="btn-full">Guardar Registro</button>
          </div>

          <!-- Sessions Section -->
          <div class="session-header-row">
            <h3>Historial de sesiones</h3>
            <a href="#" class="link-all">Ver todo <span class="material-icons" style="font-size:16px;">open_in_new</span></a>
          </div>

          <div class="session-list">
            ${sesiones && sesiones.length > 0 ? sesiones.map(s => {
              const d = new Date(s.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
              return `
              <div class="session-card">
                <div class="session-left">
                  <div class="session-icon" style="background: #e0e0e0;">
                    <span class="material-icons">restore</span>
                  </div>
                  <div class="session-details">
                    <p class="date">${d}</p>
                    <p class="op">Operador: ${s.operador || 'Desconocido'}</p>
                  </div>
                </div>
                <div class="session-right">
                  <p class="time">${s.duracion_mins ? Math.floor(s.duracion_mins / 60) + 'h ' + (s.duracion_mins % 60) + 'm' : '--'}</p>
                  <p class="total">TOTAL: ${s.total_horas || 0}H</p>
                </div>
              </div>
              `;
            }).join('') : '<p style="color:#666; font-size:14px; padding:12px;">No hay sesiones registradas.</p>'}
          </div>

        </div>

        <!-- Right Column -->
        <div class="col-right">
          
          <div class="timeline-panel">
            <h3 class="timeline-title">
              <span class="material-icons">oil_barrel</span> Cambios de aceite
            </h3>

            <div class="timeline-list">
              ${mants && mants.length > 0 ? mants.map((m, index) => {
                 const isRecent = index === 0;
                 const d = new Date(m.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
                 return `
                 <div class="timeline-item" style="border-left-color: ${isRecent ? '#eee' : 'transparent'};">
                   <div class="tl-dot ${isRecent ? 'recent' : ''}"></div>
                   ${isRecent ? '<span class="tl-badge">RECIENTE</span>' : ''}
                   <h4 class="tl-title" style="color: ${isRecent ? 'inherit' : '#666'};">${m.titulo}</h4>
                   <p style="${isRecent ? '' : 'color: #aaa;'}">${m.descripcion || ''}</p>
                   <div class="tl-footer">
                     <span class="tl-pill" style="${isRecent ? '' : 'opacity:0.6;'}">${d}</span>
                   </div>
                 </div>
                 `;
              }).join('') : '<p style="color:#aaa; font-size:14px; padding: 12px 0;">No hay mantenimientos registrados.</p>'}
            </div>

            <button class="btn-outline">
              <span class="material-icons">download</span> Descargar historial completo (PDF)
            </button>
          </div>

        </div>
      </div>
    </div>
  `;
}
