import { supabase } from '../supabase.js';

export async function renderDetallePotrero(potreroId) {
  const { data: potrero, error: potreroError } = await supabase
    .from('potreros')
    .select('*')
    .eq('id', potreroId)
    .single();

  const { data: animales, error: animalesError } = await supabase
    .from('ganado')
    .select('*')
    .eq('potrero_id', potreroId);

  const { data: bitacora, error: bitacoraError } = await supabase
    .from('potrero_eventos')
    .select('*')
    .eq('potrero_id', potreroId)
    .order('fecha', { ascending: false });

  if (potreroError) {
    console.error('Error fetching potrero:', potreroError);
    return `<div class="screen-detalle"><p>Error cargando potrero: ${potreroError.message}</p></div>`;
  }

  const potreroData = {
    nombre: potrero.nombre || 'Potrero Sin Nombre',
    area: potrero.capacidad || '--',
    pasto: 'Kikuyo', // Placeholder if not in schema yet
    ultimoRiego: 'Hace 2d', // Placeholder
    carga: (animales ? animales.length : 0) + ' cabezas',
    ubicacion: 'Norte • Lote 14',
    cycle: '12 días para próximo pastoreo',
    icon: potrero.icon || '🌿',
  };


  return `
    <div class="screen-detalle">

      <!-- Hero Section -->
      <div class="detail-hero card">
        <div class="detail-hero-header">
          <div class="detail-hero-icon">${potreroData.icon}</div>
          <div>
            <h2>${potreroData.nombre}</h2>
            <p class="detail-subtitle">${potreroData.ubicacion}</p>
          </div>
        </div>

        <div class="detail-stats">
          <div class="detail-stat-item">
            <span class="detail-stat-label">Área Total</span>
            <span class="detail-stat-value">${potreroData.area}</span>
          </div>
          <div class="detail-stat-item">
            <span class="detail-stat-label">Tipo de Pasto</span>
            <span class="detail-stat-value">${potreroData.pasto}</span>
          </div>
          <div class="detail-stat-item">
            <span class="detail-stat-label">Carga Actual</span>
            <span class="detail-stat-value">${potreroData.carga}</span>
          </div>
          <div class="detail-stat-item">
            <span class="detail-stat-label">Último Riego</span>
            <span class="detail-stat-value">${potreroData.ultimoRiego}</span>
          </div>
        </div>

        <div class="alert-banner" style="margin-top: 16px; margin-bottom: 0;">
          <span class="material-icons">schedule</span>
          <div>
            <p><strong>Ciclo de Recuperación:</strong> ${potreroData.cycle}</p>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <!-- Animal Segment -->
        <div class="section">
          <div class="section-title">
            <h3>Animales en el Lote</h3>
            <span class="tag" style="background:#e8f5e9; color:#43a047">${animales ? animales.length : 0} Activos</span>
          </div>
          <div class="animal-list" style="margin-top: 12px; gap: 8px;">
            ${animales && animales.length > 0 ? animales.map(a => `
              <div class="animal-card card" data-id="${a.id}" style="padding: 12px 16px; margin-bottom: 8px; cursor: pointer;">
                <div class="animal-info">
                  <h4 style="font-size: 14px;">${a.nombre || a.raza} <span class="animal-tag-chip">${a.id.split('-').shift()}</span></h4>
                  <p style="font-size: 12px; margin-bottom: 0;">${a.peso_actual || 0}kg • <span style="color: #4caf50; font-weight: 600;">Saludable</span></p>
                </div>
                <span class="material-icons" style="color:#eee">chevron_right</span>
              </div>
            `).join('') : '<p style="text-align:center; padding: 24px; color:#999">No hay animales en este potrero.</p>'}
          </div>
        </div>

        <!-- Log Segment -->
        <div class="section">
          <div class="section-title">
            <h3>Bitácora de Eventos</h3>
            <button class="btn-primary" style="padding: 6px 12px; font-size: 12px;">+ Nota</button>
          </div>
          <div class="activity-list" style="margin-top: 12px;">
            ${bitacora && bitacora.length > 0 ? bitacora.map(b => `
              <div class="activity-item" style="padding: 12px; gap: 12px;">
                <div class="activity-icon" style="background: rgba(46,125,50,0.1); color: var(--primary); width: 36px; height: 36px;">
                  <span class="material-icons" style="font-size: 18px;">${b.icon || 'history'}</span>
                </div>
                <div class="activity-content">
                  <h4 style="font-size: 13px;">${b.evento}</h4>
                  <p style="font-size: 11px; margin-bottom: 2px;">${b.descripcion || ''}</p>
                  <span class="history-date">${new Date(b.fecha).toLocaleDateString()}</span>
                </div>
              </div>
            `).join('') : '<p style="text-align:center; padding: 24px; color:#999">No hay eventos registrados.</p>'}
          </div>
        </div>
      </div>

      <!-- Curator Suggestion -->
      <div class="tip-card">
        <span class="material-icons">lightbulb</span>
        <div>
          <p><strong>Sugerencia del Curador:</strong> Basado en la humedad del suelo actual (78%) y el crecimiento del Kikuyo, se recomienda un periodo de descanso adicional de 3 días para maximizar el rebrote proteico.</p>
        </div>
      </div>
    </div>
  `;
}
