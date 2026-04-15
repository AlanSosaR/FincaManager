import { supabase } from '../supabase.js';

export async function renderGanado() {
  const { data: animales, error } = await supabase
    .from('ganado')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching ganado:', error);
    return `<div class="screen-ganado"><p>Error cargando datos: ${error.message}</p></div>`;
  }

  return `
    <div class="screen-ganado">
      <div class="section-title">
        <h3>Inventario de Hato</h3>
      </div>
      <p class="section-subtitle">Gestión integral de ganado, pesaje y plan sanitario.</p>

      <div class="card-grid">
        ${animales.map(a => {
          const statusVacunas = a.total_vacunas > 0 ? 'AL DÍA' : 'PENDIENTE';
          let statusClass = statusVacunas === 'AL DÍA' ? 'ok' : 'warning';

          return `
            <div class="item-card animal-card" data-id="${a.id}">
              <div class="item-card-header">
                <div class="item-card-icon">${a.icon || '🐮'}</div>
                <span class="item-status ${statusClass}">${statusVacunas}</span>
              </div>
              
              <div class="item-card-content">
                <h4>${a.nombre}</h4>
                <p class="item-sn">ID: ${a.id.substring(0,8)}... • ${a.raza}</p>
                
                <div class="item-stats-label">
                  <span>Peso actual</span>
                  <span style="color: var(--primary)">${a.peso_actual || 0} kg</span>
                </div>
                <div class="progress-container">
                  <div class="progress-bar" style="width: 70%; background: var(--primary)"></div>
                </div>

                <div class="item-footer-info">
                  <span class="material-icons" style="font-size:16px;">transgender</span>
                  Sexo: ${a.sexo || 'N/A'}
                </div>
              </div>

              <div class="item-card-actions">
                <button class="btn-primary" onclick="window.navigateTo('detalle_animal', '${a.id}')">Ver ficha</button>
                <button class="btn-outline" onclick="window.navigateTo('detalle_animal', '${a.id}')">Pesar</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <button id="btn-add-animal" class="fab">
        <span class="material-icons">add</span> Registrar animal
      </button>
    </div>
  `;
}
