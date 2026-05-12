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

  const totalMachinery = equipos.length;
  const urgentMaintenance = equipos.filter(eq => (eq.horas || 0) >= (eq.max_horas || 100)).length;
  const activeEquipment = equipos.filter(eq => eq.horas > 0).length; // Simple logic for "active"

  if (urgentMaintenance > 0) {
    const firstUrgent = equipos.find(eq => (eq.horas || 0) >= (eq.max_horas || 100));
    setTimeout(() => {
      window.Snackbar.confirm(
        `<strong>${urgentMaintenance} equipos</strong> requieren cambio de aceite inmediato.`,
        () => window.navigateTo('detalle_motor', firstUrgent.id),
        null,
        { confirmText: 'REVISAR', type: 'error', persist: true }
      );
    }, 500);
  }

  return `
    <div class="screen-motores" style="padding-bottom: 100px;">
      <!-- Page Title -->
      <div class="motores-page-title">
        <h2>Motores & Equipos</h2>
        <div class="ganado-top-actions">
          <button class="ganado-icon-btn" title="Buscar">
            <span class="material-icons">search</span>
          </button>
          <button class="ganado-icon-btn" title="Filtrar">
            <span class="material-icons">filter_list</span>
          </button>
        </div>
      </div>

      <!-- Top Summary Cards -->
      <section class="motores-top-cards">
        <div class="motores-card motores-card-primary">
          <div class="motores-card-header">
            <span class="material-icons">settings</span>
            <span class="motores-card-label">Total Maquinaria</span>
          </div>
          <div class="motores-card-body">
            <h3 class="motores-card-value">${totalMachinery}</h3>
            <p class="ganado-card-sub">Equipos registrados</p>
          </div>
        </div>

        <div class="motores-card motores-card-tertiary">
          <div class="motores-card-header">
            <span class="material-icons">build</span>
            <span class="motores-card-label">Mantenimiento Urgente</span>
          </div>
          <div class="motores-card-body">
            <h3 class="motores-card-value">${urgentMaintenance}</h3>
            <p class="ganado-card-sub">Cambio de aceite req.</p>
          </div>
        </div>

        <div class="motores-card motores-card-surface">
          <div class="motores-card-header">
            <span class="material-icons">bolt</span>
            <span class="motores-card-label">Equipos en Uso</span>
          </div>
          <div class="motores-card-body">
            <h3 class="motores-card-value">${activeEquipment}</h3>
            <div class="progress-track">
              <div class="progress-fill female" style="width: ${totalMachinery ? (activeEquipment/totalMachinery)*100 : 0}%"></div>
            </div>
          </div>
        </div>
      </section>

      <!-- List Header -->
      <div class="motores-list-header">
        <h4>Maquinaria Registrada</h4>
        <button class="ganado-filter-btn">
          Ver todos <span class="material-icons" style="font-size:16px;">arrow_forward</span>
        </button>
      </div>

      <!-- List View -->
      <div class="motores-list">
        ${equipos.map(eq => renderMotorRow(eq)).join('')}

        ${equipos.length === 0 ? `
          <div class="ganado-empty">
            <span class="material-icons">precision_manufacturing</span>
            <p>No hay motores registrados.</p>
          </div>
        ` : ''}
      </div>

      <!-- Premium FAB -->
      <button class="fab-premium" onclick="window.navigateTo('nuevo_motor')">
        <span class="material-icons">add</span>
        <span class="label">Agregar motor</span>
      </button>
    </div>
  `;
}

export function initMotores() {
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
  window.confirmDeleteMotor = (id, name) => {
    window.Snackbar.confirm(
      `¿Eliminar equipo ${name}?`,
      async () => {
        const { error } = await supabase.from('motores').delete().eq('id', id);
        if (error) {
          window.Snackbar.show('Error al eliminar: ' + error.message, { type: 'error' });
        } else {
          window.Snackbar.show('Motor eliminado correctamente');
          // Refresh the list using the router
          window.navigateTo('motores');
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

function renderMotorRow(eq) {
  const hours = eq.horas || 0;
  const maxHours = eq.max_horas || 100;
  const pct = Math.min(100, Math.round((hours / maxHours) * 100));
  
  let statusClass = 'ok';
  let statusLabel = 'Al día';
  let badgeIcon = 'check_circle';

  if (pct >= 95) {
    statusClass = 'pending';
    statusLabel = 'Urgente';
    badgeIcon = 'warning';
  } else if (pct >= 75) {
    statusClass = 'pending';
    statusLabel = 'Próximo';
    badgeIcon = 'schedule';
  }

  const icon = eq.icon || 'settings';
  const imgHtml = eq.image_url 
    ? `<img src="${eq.image_url}" alt="${eq.nombre}" onerror="this.src='https://api.dicebear.com/7.x/shapes/svg?seed=${eq.id}&backgroundColor=f0f4f0'">`
    : `<div class="motores-row-icon"><span class="material-icons">${icon}</span></div>`;

  return `
    <div class="motores-row" onclick="window.navigateTo('detalle_motor', '${eq.id}')">
      <div class="ganado-row-img-container">
        ${eq.image_url ? imgHtml : `<div class="motores-row-icon" style="width:100%; height:100%; border-radius:16px;"><span class="material-icons">${icon}</span></div>`}
        <div class="ganado-row-badge ${statusClass === 'ok' ? 'green' : 'orange'}">
          <span class="material-icons" style="font-size:12px;">${badgeIcon}</span>
        </div>
      </div>

      <div class="motores-row-content">
        <div class="ganado-col-group">
          <p class="ganado-col-label">${(eq.serial || 'S/N').toUpperCase()}</p>
          <p class="ganado-col-value">${eq.nombre}</p>
        </div>
        <div class="ganado-col-group">
          <p class="ganado-col-label">Uso Actual</p>
          <p class="ganado-col-value">${hours} / ${maxHours}h</p>
        </div>
        <div class="ganado-col-group ganado-row-status">
          <p class="ganado-col-label">Mantenimiento</p>
          <div class="ganado-pill ${statusClass}">
            <span class="material-icons">${badgeIcon}</span>
            <span>${statusLabel}</span>
          </div>
        </div>
        <div class="ganado-col-group" style="text-align:right; position: relative;">
          <button class="ganado-btn-more" onclick="event.stopPropagation(); toggleActionMenu('${eq.id}')">
            <span class="material-icons">more_vert</span>
          </button>
          
          <div class="action-menu" id="menu-${eq.id}">
            <div class="action-item" onclick="event.stopPropagation(); window.navigateTo('nuevo_motor', '${eq.id}')">
              <span class="material-icons">edit</span>
              <span>Editar</span>
            </div>
            <div class="action-item delete" onclick="event.stopPropagation(); confirmDeleteMotor('${eq.id}', '${eq.nombre}')">
              <span class="material-icons">delete</span>
              <span>Eliminar</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}
