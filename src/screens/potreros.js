import { supabase } from '../supabase.js';

export async function renderPotreros() {
  const { data: potreros, error } = await supabase
    .from('potreros')
    .select('*')
    .order('nombre', { ascending: true });

  if (error) {
    console.error('Error fetching potreros:', error);
    return `<div class="screen-potreros"><p>Error cargando datos: ${error.message}</p></div>`;
  }

  // Calculate summary stats
  const totalPotreros = potreros.length;
  const occupiedCount = potreros.filter(p => p.status === 'ocupado' || p.status === 'pastoreo').length;
  const restingCount = potreros.filter(p => p.status === 'recuperando' || p.status === 'descanso').length;
  
  const totalCapacity = potreros.reduce((sum, p) => sum + (parseInt(p.capacidad) || 0), 0);
  const currentTotalAnimals = potreros.reduce((sum, p) => sum + (parseInt(p.animales_actuales) || 0), 0);
  const globalOccupancy = totalCapacity ? Math.round((currentTotalAnimals / totalCapacity) * 100) : 0;

  return `
    <div class="screen-potreros" style="padding-bottom: 100px;">
      
      <!-- Page Title -->
      <div class="potreros-page-title">
        <h2>Control de Potreros</h2>
        <div class="ganado-top-actions">
          <button class="ganado-icon-btn" title="Mapa">
            <span class="material-icons">map</span>
          </button>
          <button class="ganado-icon-btn" title="Configuración">
            <span class="material-icons">settings</span>
          </button>
        </div>
      </div>

      <!-- Summary Cards -->
      <section class="potreros-top-cards">
        <div class="potreros-card potreros-card-primary">
          <div class="herramientas-card-header">
            <span class="material-icons">grass</span>
            <span class="herramientas-card-label">Carga Total</span>
          </div>
          <div class="herramientas-card-body">
            <h3 class="herramientas-card-value">${currentTotalAnimals}</h3>
            <p class="ganado-card-sub">${globalOccupancy}% de capacidad total</p>
          </div>
        </div>

        <div class="potreros-card potreros-card-surface">
          <div class="herramientas-card-header">
            <span class="material-icons">event_repeat</span>
            <span class="herramientas-card-label">En Descanso</span>
          </div>
          <div class="herramientas-card-body">
            <h3 class="herramientas-card-value">${restingCount}</h3>
            <p class="ganado-card-sub">Áreas recuperándose</p>
          </div>
        </div>

        <div class="potreros-card potreros-card-tertiary">
          <div class="herramientas-card-header">
            <span class="material-icons">priority_high</span>
            <span class="herramientas-card-label">Ocupados</span>
          </div>
          <div class="herramientas-card-body">
            <h3 class="herramientas-card-value">${occupiedCount}</h3>
            <p class="ganado-card-sub">En pastoreo activo</p>
          </div>
        </div>
      </section>

      <!-- List Header -->
      <div class="ganado-list-header">
        <h4>Estado de Áreas</h4>
        <button class="ganado-filter-btn">
          Plan de Rotación <span class="material-icons" style="font-size:16px;">autorenew</span>
        </button>
      </div>

      <!-- Potreros List -->
      <div class="potreros-list">
        ${potreros.map(p => renderPotreroRow(p)).join('')}
        
        ${potreros.length === 0 ? `
          <div class="ganado-empty">
            <span class="material-icons">landscape</span>
            <p>No hay potreros registrados.</p>
          </div>
        ` : ''}
      </div>

      <!-- FAB -->
      <button class="fab-premium" onclick="window.navigateTo('nuevo_potrero')">
        <span class="material-icons">add_location</span>
        <span class="label">Nuevo potrero</span>
      </button>
    </div>
  `;
}

function renderPotreroRow(p) {
  const statusVal = p.status || 'libre';
  let statusLabel = statusVal.toUpperCase();
  let statusClass = 'libre';
  let statusIcon = 'check_circle';
  
  if (statusVal === 'ocupado' || statusVal === 'pastoreo') {
    statusClass = 'ocupado';
    statusLabel = 'OCUPADO';
    statusIcon = 'pets';
  } else if (statusVal === 'recuperando' || statusVal === 'descanso') {
    statusClass = 'recuperando';
    statusLabel = 'EN DESCANSO';
    statusIcon = 'eco';
  }

  const capacity = parseInt(p.capacidad) || 1;
  const current = parseInt(p.animales_actuales) || 0;
  const occupancyPercent = Math.min(Math.round((current / capacity) * 100), 100);
  
  // Color based on occupancy
  let progressColor = 'var(--primary)';
  if (occupancyPercent > 80) progressColor = 'var(--tertiary)';
  else if (occupancyPercent > 50) progressColor = 'var(--secondary)';

  return `
    <div class="potreros-row" onclick="window.navigateTo('detalle_potrero', '${p.id}')">
      <div class="potreros-row-header">
        <div class="potreros-row-info">
          <h4>${p.nombre}</h4>
          <div class="potreros-pill ${statusClass}">
            <span class="material-icons" style="font-size:12px;">${statusIcon}</span>
            <span>${statusLabel}</span>
          </div>
        </div>
        <div class="ganado-col-group" style="text-align:right;">
          <p class="ganado-col-label">Capacidad</p>
          <p class="ganado-col-value">${current} / ${capacity} Cabezas</p>
        </div>
      </div>
      
      <div class="potreros-progress-container">
        <div class="potreros-progress-label">
          <span>Ocupación</span>
          <span>${occupancyPercent}%</span>
        </div>
        <div class="progress-track" style="margin-top:0;">
          <div class="progress-fill" style="width: ${occupancyPercent}%; background: ${progressColor};"></div>
        </div>
      </div>

      <div class="ganado-row-content" style="grid-template-columns: 1fr 1fr 1fr auto; padding-top: 8px; border-top: 1px solid rgba(0,0,0,0.03);">
        <div class="ganado-col-group">
          <p class="ganado-col-label">Área</p>
          <p class="ganado-col-value">${p.area || '—'} ${p.area_unidad || 'ha'}</p>
        </div>
        <div class="ganado-col-group">
          <p class="ganado-col-label">Último Riego</p>
          <p class="ganado-col-value">${p.ultimo_riego ? new Date(p.ultimo_riego).toLocaleDateString() : '—'}</p>
        </div>
        <div class="ganado-col-group">
          <p class="ganado-col-label">Tipo de Pasto</p>
          <p class="ganado-col-value">${p.pasto || 'Natural'}</p>
        </div>
        <div class="ganado-col-group" style="text-align:right; position: relative;">
          <button class="ganado-btn-more" onclick="event.stopPropagation(); toggleActionMenu('${p.id}')">
            <span class="material-icons">more_vert</span>
          </button>
          
          <div class="action-menu" id="menu-${p.id}">
            <div class="action-item" onclick="event.stopPropagation(); window.navigateTo('nuevo_potrero', '${p.id}')">
              <span class="material-icons">edit</span>
              <span>Editar</span>
            </div>
            <div class="action-item delete" onclick="event.stopPropagation(); confirmDeletePotrero('${p.id}', '${p.nombre}')">
              <span class="material-icons">delete</span>
              <span>Eliminar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function initPotreros() {
  // Toggle action menu
  window.toggleActionMenu = (id) => {
    const menus = document.querySelectorAll('.action-menu');
    menus.forEach(m => {
      if (m.id === `menu-${id}`) {
        m.classList.toggle('active');
      } else {
        m.classList.remove('active');
      }
    });
  };

  // Delete action
  window.confirmDeletePotrero = (id, name) => {
    window.Snackbar.confirm(
      `¿Eliminar potrero ${name}?`,
      async () => {
        const { error } = await supabase.from('potreros').delete().eq('id', id);
        if (error) {
          window.Snackbar.show('Error al eliminar: ' + error.message, { type: 'error' });
        } else {
          window.Snackbar.show('Potrero eliminado correctamente');
          window.navigateTo('potreros');
        }
      },
      null,
      { confirmText: 'Eliminar', cancelText: 'No' }
    );
  };

  // Close menus when clicking outside
  window.addEventListener('click', (e) => {
    if (!e.target.closest('.ganado-btn-more')) {
      document.querySelectorAll('.action-menu').forEach(m => m.classList.remove('active'));
    }
  }, { once: true });
}
