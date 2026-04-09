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
      <div class="stats-grid">
        <div class="stat-card" style="border-left: 4px solid #43a047">
          <span class="material-icons stat-icon" style="color:#43a047">check_circle</span>
          <div><p class="stat-label">Libres</p><h3 class="stat-value">3</h3></div>
        </div>
        <div class="stat-card" style="border-left: 4px solid #e53935">
          <span class="material-icons stat-icon" style="color:#e53935">groups</span>
          <div><p class="stat-label">Ocupados</p><h3 class="stat-value">1</h3></div>
        </div>
        <div class="stat-card" style="border-left: 4px solid #fb8c00">
          <span class="material-icons stat-icon" style="color:#fb8c00">autorenew</span>
          <div><p class="stat-label">Recuperando</p><h3 class="stat-value">2</h3></div>
        </div>
      </div>

      <div class="section-title">
        <h3>Mapa de Potreros</h3>
        <button class="btn-primary" id="btn-add-potrero">+ Agregar</button>
      </div>

      <div class="potrero-list">
        ${potreros.map(p => {
          const s = statusColors[p.status] || statusColors['libre'];
          return `
            <div class="potrero-card card" data-id="${p.id}" style="cursor: pointer;">
              <div class="potrero-header">
                <div class="potrero-icon" style="background: ${s.bg}; color: ${s.color}">
                  ${p.icon || '🌿'}
                </div>
                <div class="potrero-info">
                  <h4>${p.nombre}</h4>
                  <div class="potrero-meta">
                    <span><span class="material-icons" style="font-size:14px">square_foot</span> ${p.capacidad || '--'}</span>
                    <span><span class="material-icons" style="font-size:14px">groups</span> ${p.animales_actuales} Cabezas</span>
                  </div>
                </div>
                <span class="status-badge" style="background: ${s.bg}; color: ${s.color}">${s.label}</span>
              </div>
            </div>
          `;
        }).join('')}
      </div>

      <div class="add-card card" id="add-potrero-card" style="cursor:pointer; border: 2px dashed #ccc; text-align:center; padding:32px; color:#999">
        <span class="material-icons" style="font-size:48px">add_location</span>
        <h4 style="margin-top:8px">Agregar Potrero</h4>
        <p>Definir nuevas áreas de pastoreo</p>
      </div>
    </div>
  `;
}
