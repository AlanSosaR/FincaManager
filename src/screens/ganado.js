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
      <div class="stats-grid">
        <div class="stat-card">
          <span class="material-icons stat-icon">pets</span>
          <div><p class="stat-label">Total Animales</p><h3 class="stat-value">342</h3></div>
        </div>
        <div class="stat-card">
          <span class="material-icons stat-icon" style="color:#e91e63">female</span>
          <div><p class="stat-label">Hembras</p><h3 class="stat-value">218</h3></div>
        </div>
        <div class="stat-card">
          <span class="material-icons stat-icon" style="color:#1e88e5">male</span>
          <div><p class="stat-label">Machos</p><h3 class="stat-value">124</h3></div>
        </div>
        <div class="stat-card">
          <span class="material-icons stat-icon" style="color:#fb8c00">scale</span>
          <div><p class="stat-label">Pesaje Pendiente</p><h3 class="stat-value">18</h3></div>
        </div>
      </div>

      <div class="section-title">
        <h3>Inventario de Hato</h3>
        <button class="btn-primary" id="btn-add-animal">+ Registrar</button>
      </div>
      <p class="section-subtitle">Listado actualizado hoy a las 06:00 AM</p>

      <div class="animal-list">
        ${animales.map(a => {
          const sexo = a.sexo || 'N/A';
          const statusVacunas = a.total_vacunas > 0 ? 'Al día' : 'Pendiente';
          return `
          <div class="animal-card card" data-id="${a.id}" style="cursor: pointer;">
            <div class="animal-tag">${a.id}</div>
            <div class="animal-avatar">${a.icon || '🐮'}</div>
            <div class="animal-info">
              <h4>${a.nombre}</h4>
              <p>${a.raza} • ${sexo}</p>
              <div class="animal-stats">
                <span><span class="material-icons" style="font-size:14px">scale</span> ${a.peso_actual || 0} kg</span>
                <span class="vacuna-badge ${statusVacunas === 'Al día' ? 'ok' : 'pending'}">
                  <span class="material-icons" style="font-size:14px">vaccines</span> ${statusVacunas}
                </span>
              </div>
            </div>
            <span class="material-icons" style="color:#ccc">chevron_right</span>
          </div>
          `;
        }).join('')}
      </div>

      <div class="info-banner">
        <span class="material-icons">info</span>
        <p>Mostrando 4 de 342 animales</p>
      </div>
    </div>
  `;
}
