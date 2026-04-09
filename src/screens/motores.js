import { supabase } from '../supabase.js';

export async function renderMotores() {
  const { data: equipos, error } = await supabase
    .from('motores')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching motores:', error);
    return `<div class="screen-motores"><p>Error cargando datos: ${error.message}</p></div>`;
  }

  return `
    <div class="screen-motores">
      <div class="alert-banner">
        <span class="material-icons">warning_amber</span>
        <p><strong>2 equipos requieren cambio de aceite.</strong> Realice el mantenimiento preventivo para evitar daños mayores.</p>
      </div>

      <div class="section-title">
        <h3>Motores &amp; Equipos</h3>
        <button class="btn-primary" id="btn-add-motor">+ Agregar</button>
      </div>
      <p class="section-subtitle">Monitoreo de maquinaria y ciclos de mantenimiento.</p>

      <div class="motor-list">
        ${equipos.map(eq => {
          const hours = eq.horas || 0;
          const maxHours = eq.max_horas || 100;
          const pct = Math.min(100, Math.round((hours / maxHours) * 100));
          
          let status = 'ok';
          if (pct >= 90) status = 'critical';
          else if (pct >= 75) status = 'warning';

          const barColor = status === 'critical' ? '#d32f2f' : status === 'warning' ? '#fb8c00' : '#43a047';
          return `
            <div class="motor-card card" data-id="${eq.id}" style="cursor:pointer">
              <div class="motor-header">
                <div class="motor-icon">${eq.icon || '⚙️'}</div>
                <div class="motor-info">
                  <h4>${eq.nombre}</h4>
                  <p class="motor-sn">SN: ${eq.sn || 'N/A'}</p>
                </div>
                <span class="material-icons">chevron_right</span>
              </div>
              <div class="hours-bar">
                <div class="hours-track">
                  <div class="hours-fill" style="width: ${pct}%; background: ${barColor}"></div>
                </div>
                <span class="hours-label" style="color: ${barColor}">${hours}h / ${maxHours}h</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="material-icons stat-icon" style="color:#1e88e5">local_gas_station</span>
          <div>
            <p class="stat-label">Combustible este mes</p>
            <h3 class="stat-value">+12%</h3>
          </div>
        </div>
        <div class="stat-card">
          <span class="material-icons stat-icon" style="color:#43a047">schedule</span>
          <div>
            <p class="stat-label">Horas Motor Total</p>
            <h3 class="stat-value">1,240h</h3>
          </div>
        </div>
      </div>

      <div class="tip-card">
        <span class="material-icons">emoji_objects</span>
        <p><em>"El mantenimiento regular extiende la vida útil de su motor hasta en un 40%."</em></p>
      </div>
    </div>
  `;
}
