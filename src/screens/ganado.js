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
    <div class="screen-ganado" style="padding-bottom: 80px;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px;">
        <div>
          <h2 style="font-size: 30px; font-weight: 800; color: var(--on-surface);">Ganado</h2>
        </div>
      </div>

      <!-- Top Summary Cards (M3 Style) -->
      <section class="ganado-top-cards">
        <div class="ganado-card ganado-card-primary">
          <div class="ganado-card-header">
            <span class="material-icons" style="opacity: 0.8;">pets</span>
            <span class="ganado-card-label">Total Animales</span>
          </div>
          <div>
            <h3 class="ganado-card-value">${totalAnimales}</h3>
          </div>
        </div>

        <div class="ganado-card ganado-card-surface">
          <div class="ganado-card-header">
            <span class="material-icons">female</span>
            <span class="ganado-card-label">Hembras</span>
          </div>
          <div>
            <h3 class="ganado-card-value">${hembras}</h3>
            <div class="progress-track">
              <div class="progress-fill female" style="width: ${totalAnimales ? (hembras/totalAnimales)*100 : 0}%"></div>
            </div>
          </div>
        </div>

        <div class="ganado-card ganado-card-surface">
          <div class="ganado-card-header">
            <span class="material-icons">male</span>
            <span class="ganado-card-label">Machos</span>
          </div>
          <div>
            <h3 class="ganado-card-value">${machos}</h3>
            <div class="progress-track">
              <div class="progress-fill male" style="width: ${totalAnimales ? (machos/totalAnimales)*100 : 0}%"></div>
            </div>
          </div>
        </div>

        <div class="ganado-card ganado-card-tertiary">
          <div class="ganado-card-header">
            <span class="material-icons">scale</span>
            <span class="ganado-card-label" style="opacity: 0.6;">Pesaje Pendiente</span>
          </div>
          <div>
            <h3 class="ganado-card-value">14</h3>
            <p class="ganado-card-sub" style="text-decoration: underline;">Acción requerida</p>
          </div>
        </div>
      </section>

      <!-- Main Content Area: Asymmetric Layout -->
      <div class="ganado-asymmetric-grid">
        <!-- Animal List -->
        <div>
          <div class="ganado-list-header">
            <h4>Entradas Recientes</h4>
            <button>
              Ver Filtrados <span class="material-icons">filter_list</span>
            </button>
          </div>
          
          <div>
            ${animales.map(a => {
              const randomImageSeed = a.id || a.nombre;
              const imageUrl = a.image_url || `https://api.dicebear.com/7.x/shapes/svg?seed=${randomImageSeed}&backgroundColor=f1ede6`;
              const isFemale = a.sexo && a.sexo.toLowerCase() === 'hembra';
              // Simulate state randomly for mockup matching the design, but prefer "Al día"
              const isPending = Math.random() > 0.8;
              
              return `
                <div class="ganado-row" onclick="window.navigateTo('detalle_animal', '${a.id}')">
                  <div class="ganado-row-img-container">
                    <img src="${imageUrl}" alt="${a.nombre}">
                    <div class="ganado-row-badge ${isPending ? 'orange' : 'green'}">
                      <span class="material-icons">${isPending ? 'priority_high' : 'vaccines'}</span>
                    </div>
                  </div>
                  
                  <div class="ganado-row-content">
                    <div>
                      <p class="ganado-col-label">#${a.id.substring(0,3)} — ${a.nombre}</p>
                      <p class="ganado-col-value">${a.raza || (isFemale ? 'Vaca' : 'Toro')}</p>
                    </div>
                    <div>
                      <p class="ganado-col-label">Peso</p>
                      <p class="ganado-col-value">${a.peso_actual || '0'} kg</p>
                    </div>
                    <div class="ganado-row-status">
                      <p class="ganado-col-label">Estado</p>
                      <div class="ganado-pill ${isPending ? 'pending' : 'ok'}">
                        <span class="material-icons">${isPending ? 'scale' : 'vaccines'}</span>
                        <span>${isPending ? 'Pendiente' : 'Al día'}</span>
                      </div>
                    </div>
                    <div style="text-align: right;">
                      <button class="ganado-btn-more" onclick="event.stopPropagation(); window.navigateTo('detalle_animal', '${a.id}')">
                        <span class="material-icons">more_vert</span>
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}

            ${animales.length === 0 ? `
              <div style="text-align: center; padding: 60px 0; background: var(--surface-container-low); border-radius: 24px; border: 2px dashed rgba(130, 128, 121, 0.3);">
                <span class="material-icons" style="font-size: 48px; color: var(--outline); margin-bottom: 16px; opacity: 0.5;">pets</span>
                <p style="color: var(--on-surface-variant); font-weight: 500;">No hay animales registrados.</p>
              </div>
            ` : ''}
            
            <button class="ganado-load-more">
              Cargar más registros
            </button>
          </div>
        </div>

        <!-- Side Content -->
        <div>
        </div>
      </div>
      
      <!-- Floating Action Button -->
      <button class="fab-premium" onclick="window.navigateTo('nuevo_animal')">
        <span class="material-icons">add</span>
        <span class="label">Registrar animal</span>
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
