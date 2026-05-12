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

  const totalAnimales = animales.length;
  const hembras = animales.filter(a => a.sexo && a.sexo.toLowerCase() === 'hembra').length;
  const machos = animales.filter(a => a.sexo && a.sexo.toLowerCase() === 'macho').length;

  return `
    <div class="screen-ganado">
      <div class="section-title">
        <h3>Mi Ganado</h3>
      </div>
      <p class="section-subtitle">Gestión de inventario bovino y trazabilidad.</p>

      <!-- Summary Stats -->
      <div class="stats-grid">
        <div class="stat-card">
          <span class="material-icons stat-icon">pets</span>
          <div>
            <p class="stat-label">Total Animales</p>
            <h4 class="stat-value">${totalAnimales}</h4>
          </div>
        </div>
        <div class="stat-card">
          <span class="material-icons stat-icon" style="color: #e91e63; background: #fce4ec;">female</span>
          <div>
            <p class="stat-label">Hembras</p>
            <h4 class="stat-value">${hembras}</h4>
          </div>
        </div>
        <div class="stat-card">
          <span class="material-icons stat-icon" style="color: #2196f3; background: #e3f2fd;">male</span>
          <div>
            <p class="stat-label">Machos</p>
            <h4 class="stat-value">${machos}</h4>
          </div>
        </div>
      </div>

      <div class="card-grid">
        ${animales.map(a => {
          const randomImageSeed = a.id || a.nombre;
          const imageUrl = a.image_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${randomImageSeed}&backgroundColor=f1ede6`;
          
          return `
            <div class="motor-card-premium" data-id="${a.id}">
              <!-- Top Content -->
              <div class="m3-premium-top">
                <div class="m3-premium-img-box">
                  <img src="${imageUrl}" alt="${a.nombre}">
                </div>
                <div class="m3-premium-title-group">
                  <h4 class="m3-premium-title">${a.nombre}</h4>
                  <p style="font-size: 13px; color: #888; margin-top: 4px;">${a.raza || 'Sin raza'}</p>
                </div>
              </div>

              <!-- Body Section -->
              <div class="m3-premium-body">
                <div class="m3-premium-stat-row">
                   <span class="m3-premium-stat-label">SEXO</span>
                   <span class="m3-premium-stat-value">${a.sexo || 'N/A'}</span>
                </div>
                <div class="m3-premium-stat-row">
                   <span class="m3-premium-stat-label">PESO ACTUAL</span>
                   <span class="m3-premium-stat-value"><b>${a.peso_actual || '0'}</b> KG</span>
                </div>
                
                <div class="m3-premium-meta" style="margin-top: 16px;">
                   <span class="material-icons">calendar_today</span>
                   <span>Reg: ${a.fecha_adquisicion ? new Date(a.fecha_adquisicion).toLocaleDateString() : 'No reg.'}</span>
                </div>
              </div>

              <!-- Footer Actions -->
              <div class="m3-premium-actions">
                <button class="btn-m3-fill" onclick="window.navigateTo('detalle_animal', '${a.id}')">
                   Ver Ficha
                </button>
                <button class="btn-m3-tonal" onclick="window.navigateTo('detalle_animal', '${a.id}')">
                   Eventos
                </button>
              </div>
            </div>
          `;
        }).join('')}

        ${animales.length === 0 ? `
          <div style="grid-column: 1/-1; text-align: center; padding: 60px 0; background: #fdfaf6; border-radius: 40px; border: 2px dashed #eee;">
            <span class="material-icons" style="font-size: 48px; color: #ccc; margin-bottom: 16px;">pets</span>
            <p style="color: #888; font-weight: 600;">No hay animales registrados aún.</p>
          </div>
        ` : ''}
      </div>

      <button id="btn-add-animal" class="fab">
        <span class="material-icons">add</span> Registrar animal
      </button>
    </div>
  `;
}

export function initGanado() {
  const btnAdd = document.getElementById('btn-add-animal');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      window.navigateTo('nuevo_animal');
    });
  }
}
