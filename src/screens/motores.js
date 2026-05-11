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

  const motoresUrgentes = equipos.filter(eq => (eq.horas || 0) >= (eq.max_horas || 100));
  
  if (motoresUrgentes.length > 0) {
    setTimeout(() => {
      window.Snackbar.confirm(
        `<strong>${motoresUrgentes.length} equipos</strong> requieren cambio de aceite inmediato.`,
        () => window.navigateTo('detalle_motor', motoresUrgentes[0].id),
        null,
        { confirmText: 'REVISAR', type: 'error', persist: true }
      );
    }, 500);
  }

  return `
    <div class="screen-motores">
      <div class="section-title">
        <h3>Motores & Equipos</h3>
      </div>
      <p class="section-subtitle">Monitoreo de maquinaria y ciclos de mantenimiento.</p>

      <div class="card-grid">
        ${equipos.map(eq => {
          const hours = eq.horas || 0;
          const maxHours = eq.max_horas || 100;
          const pct = Math.min(100, Math.round((hours / maxHours) * 100));
          
          let statusLabel = 'OK';
          let statusClass = 'ok';
          let barColor = '#4caf50';

          if (pct >= 95) {
            statusLabel = 'URGENTE';
            statusClass = 'urgent';
            barColor = '#ff7c52';
          } else if (pct >= 75) {
            statusLabel = 'PRÓXIMO CAMBIO';
            statusClass = 'warning';
            barColor = '#d97706';
          }

          return `
            <div class="motor-card-premium" data-id="${eq.id}">
              <!-- Status Badge: Only show if not OK -->
              ${statusClass !== 'ok' ? `
                <div class="m3-premium-badge ${statusClass}">
                   ${statusLabel}
                </div>
              ` : ''}

              <!-- Top Content: Image + Name -->
              <div class="m3-premium-top">
                <div class="m3-premium-img-box">
                  ${eq.image_url ? `<img src="${eq.image_url}" alt="${eq.nombre}">` : `<span class="material-icons">${eq.icon || 'settings'}</span>`}
                </div>
                <div class="m3-premium-title-group">
                  <h4 class="m3-premium-title">${eq.nombre}</h4>
                </div>
              </div>

              <!-- Progress Section -->
              <div class="m3-premium-body">
                <div class="m3-premium-stat-row">
                   <span class="m3-premium-stat-label">HORAS ACUMULADAS</span>
                   <span class="m3-premium-stat-value"><b>${hours}</b>/${maxHours}h</span>
                </div>
                <div class="m3-premium-progress">
                   <div class="m3-premium-progress-fill" style="width: ${pct}%; background: ${barColor}"></div>
                </div>
                
                <div class="m3-premium-meta">
                   <span class="material-icons">calendar_today</span>
                   <span>Último cambio: No reg.</span>
                </div>
              </div>

              <!-- Footer Actions -->
              <div class="m3-premium-actions">
                <button class="btn-m3-fill" onclick="window.navigateTo('detalle_motor', '${eq.id}')">
                   Iniciar sesión
                </button>
                <button class="btn-m3-tonal" onclick="window.navigateTo('detalle_motor', '${eq.id}')">
                   Historial
                </button>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <button id="btn-add-motor" class="fab">
        <span class="material-icons">add</span> Agregar equipo
      </button>
    </div>
  `;
}
