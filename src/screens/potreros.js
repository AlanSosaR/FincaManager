import { supabase } from '../supabase.js';

export async function renderPotreros() {
  const { data: potreros, error } = await supabase
    .from('potreros')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching potreros:', error);
    return `<div class="screen-potreros"><p>Error cargando datos: ${error.message}</p></div>`;
  }

  const statusColors = {
    libre: { bg: '#e8f5e9', color: '#43a047', label: 'Libre' },
    ocupado: { bg: '#fce4ec', color: '#e53935', label: 'Ocupado' },
    recuperando: { bg: '#fff8e1', color: '#fb8c00', label: 'Recuperando' },
    'óptimo': { bg: '#e8f5e9', color: '#43a047', label: 'Óptimo' },
    'pastoreo': { bg: '#fce4ec', color: '#e53935', label: 'Pastoreo' }
  };

  return `
    <div class="screen-potreros">
      <div class="section-title">
        <h3>Control de Potreros</h3>
      </div>
      <p class="section-subtitle">Gestión de áreas de pastoreo, rotación y capacidad de carga.</p>

      <div class="card-grid">
        ${potreros.map(p => {
          const statusVal = p.status || 'libre';
          let label = statusVal.toUpperCase();
          let statusClass = 'ok';
          
          if (statusVal === 'ocupado' || statusVal === 'pastoreo') {
            statusClass = 'urgent';
            label = 'OCUPADO';
          } else if (statusVal === 'recuperando') {
            statusClass = 'warning';
            label = 'RECUPERANDO';
          }

          return `
            <div class="item-card potrero-card" data-id="${p.id}">
              <div class="item-card-header">
                <div class="item-card-icon">${p.icon || '🌿'}</div>
                <span class="item-status ${statusClass}">${label}</span>
              </div>
              
              <div class="item-card-content">
                <h4>${p.nombre}</h4>
                <p class="item-sn">Capacidad: ${p.capacidad || '--'}</p>
                
                <div class="item-stats-label">
                  <span>Carga animal</span>
                  <span style="color: var(--primary)">${p.animales_actuales} Cabezas</span>
                </div>
                <div class="progress-container">
                  <div class="progress-bar" style="width: 45%; background: var(--primary)"></div>
                </div>

                <div class="item-footer-info">
                  <span class="material-icons" style="font-size:16px;">history</span>
                  Última rotación: hace 4 días
                </div>
              </div>

              <div class="item-card-actions">
                <button class="btn-primary" onclick="window.navigateTo('detalle_potrero', '${p.id}')">Ver detalles</button>
                <button class="btn-outline" onclick="window.navigateTo('detalle_potrero', '${p.id}')">Rotar</button>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <button id="btn-add-potrero" class="fab">
        <span class="material-icons">add_location</span> Nuevo potrero
      </button>
    </div>
  `;
}
