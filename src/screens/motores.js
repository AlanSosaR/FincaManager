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
            <div class="item-card motor-card premium-card" data-id="${eq.id}">
              <div class="item-card-header">
                <div class="item-card-icon" style="background: ${barColor}22; color: ${barColor}">${eq.icon || 'settings'}</div>
                <span class="item-status ${statusClass}" style="background: ${barColor}22; color: ${barColor}; border: 1px solid ${barColor}44">
                  ${statusLabel}
                </span>
              </div>
              
              <div class="item-card-content">
                <div class="card-title-row">
                  <h4>${eq.nombre}</h4>
                  <span class="card-remaining-tag">${Math.max(0, maxHours - hours)}h finales</span>
                </div>
                <p class="item-sn">Serie: ${eq.sn || 'No reg.'}</p>
                
                <div class="item-progress-section">
                  <div class="progress-labels">
                    <span class="label">Uso acumulado</span>
                    <span class="value"><b>${hours}</b> / ${maxHours}h</span>
                  </div>
                  <div class="premium-progress-track">
                    <div class="premium-progress-fill" style="width: ${pct}%; background: ${barColor}"></div>
                  </div>
                </div>
              </div>

              <div class="item-card-footer">
                <button class="btn-card-primary" onclick="window.navigateTo('detalle_motor', '${eq.id}')">
                   <span class="material-icons">timer</span> Iniciar
                </button>
                <button class="btn-card-secondary" onclick="window.navigateTo('detalle_motor', '${eq.id}')">
                   Detalles
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
