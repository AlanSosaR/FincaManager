import { supabase } from '../supabase.js';

export async function renderDetalleAnimal(animalId) {
  const { data: animal, error: animalError } = await supabase
    .from('ganado')
    .select('*')
    .eq('id', animalId)
    .single();

  const { data: vacunas, error: vacunasError } = await supabase
    .from('animal_vacunas')
    .select('*')
    .eq('animal_id', animalId)
    .order('fecha', { ascending: false });

  const { data: pesajes, error: pesajesError } = await supabase
    .from('animal_pesajes')
    .select('*')
    .eq('animal_id', animalId)
    .order('fecha', { ascending: false });

  if (animalError) {
    console.error('Error fetching animal:', animalError);
    return `<div class="screen-detalle"><p>Error cargando animal: ${animalError.message}</p></div>`;
  }

  const animalData = {
    id: animal.id,
    nombre: animal.nombre || 'Sin Nombre',
    raza: animal.raza || 'N/A',
    pesoActual: (animal.peso_actual || 0) + ' kg',
    totalVacunas: animal.total_vacunas || 0,
    totalPesajes: animal.total_pesajes || 0,
    icon: animal.icon || '🐄',
  };


  return `
    <div class="screen-detalle">

      <!-- Hero Section -->
      <div class="detail-hero card">
        <div class="detail-hero-header">
          <div class="detail-hero-icon">${animalData.icon}</div>
          <div>
            <h2>${animalData.nombre}</h2>
            <p class="detail-subtitle">${animalData.raza} • ID: ${animalData.id.split('-').shift()}</p>
          </div>
        </div>

        <div class="detail-stats">
          <div class="detail-stat-item">
            <span class="detail-stat-label">Peso Actual</span>
            <span class="detail-stat-value">${animalData.pesoActual}</span>
          </div>
          <div class="detail-stat-item">
            <span class="detail-stat-label">Total Vacunas</span>
            <span class="detail-stat-value">${animalData.totalVacunas}</span>
          </div>
          <div class="detail-stat-item">
            <span class="detail-stat-label">Total Pesajes</span>
            <span class="detail-stat-value">${animalData.totalPesajes}</span>
          </div>
        </div>
      </div>

      <div class="grid-2">
        <!-- Weight Evolution Segment -->
        <div class="section">
          <div class="section-title">
            <h3>Evolución de Peso</h3>
          </div>
          <div class="chart-container">
            <span class="material-icons" style="font-size: 48px; margin-bottom: 8px;">insights</span>
            <span>Espacio para Gráfico de Tendencia</span>
          </div>
          <div class="history-list" style="margin-top: 16px;">
            ${pesajes && pesajes.length > 0 ? pesajes.map(p => `
              <div class="activity-item card" style="padding:12px 16px; margin-bottom:8px; display: flex; align-items: center; justify-content: space-between; gap: 12px; cursor: default;">
                <div style="flex: 1;">
                   <p style="font-size: 13px; font-weight: 600;">${p.evento}</p>
                   <span class="history-date">${new Date(p.fecha).toLocaleDateString()}</span>
                </div>
                <div style="text-align: right;">
                  <span style="font-weight: 700; font-size: 16px;">${p.peso}</span>
                  <div style="display: flex; align-items: center; justify-content: flex-end; color: ${p.color || '#666'}; font-size: 12px;">
                    <span class="material-icons" style="font-size: 14px;">${p.tendencia || 'horizontal_rule'}</span>
                    <span>${p.cambio || '0 kg'}</span>
                  </div>
                </div>
              </div>
            `).join('') : '<p style="text-align:center; padding: 24px; color:#999">No hay registros de pesaje.</p>'}
          </div>
        </div>

        <!-- Vaccination History Segment -->
        <div class="section">
          <div class="section-title">
            <h3>Historial Sanitário</h3>
            <button class="btn-primary" style="padding: 6px 12px; font-size: 12px;">+ Vacuna</button>
          </div>
          <div class="activity-list" style="margin-top: 16px;">
            ${vacunas && vacunas.length > 0 ? vacunas.map(v => `
              <div class="activity-item" style="padding: 12px; gap: 12px;">
                <div class="activity-icon" style="background: ${v.color || '#1e88e5'}20; color: ${v.color || '#1e88e5'};">
                  <span class="material-icons" style="font-size: 18px;">${v.icon || 'vaccines'}</span>
                </div>
                <div class="activity-content">
                  <h4 style="font-size: 14px; font-weight: 600;">${v.nombre}</h4>
                  <span class="history-date">${new Date(v.fecha).toLocaleDateString()}</span>
                </div>
              </div>
            `).join('') : '<p style="text-align:center; padding: 24px; color:#999">No hay registros sanitarios.</p>'}
          </div>
        </div>
      </div>
    </div>
  `;
}
