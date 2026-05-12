import { supabase } from '../supabase.js';

export async function renderDashboard() {
  const { count: potrerosCount } = await supabase.from('potreros').select('*', { count: 'exact', head: true });
  const { count: ganadoCount } = await supabase.from('ganado').select('*', { count: 'exact', head: true });
  const { data: motores, error: motoresError } = await supabase.from('motores').select('*');
  const { count: herramientasCount } = await supabase.from('herramientas').select('*', { count: 'exact', head: true });

  const motoresUrgentes = (motores || []).filter(eq => (eq.horas || 0) >= (eq.max_horas || 100));
  const motoresCount = (motores || []).length;

  if (motoresUrgentes.length > 0) {
    setTimeout(() => {
      window.Snackbar.confirm(
        `<strong>Mantenimiento pendiente:</strong> ${motoresUrgentes.length} motores requieren cambio de aceite.`,
        () => window.navigateTo('detalle_motor', motoresUrgentes[0].id),
        null,
        { confirmText: 'REVISAR', type: 'error', persist: true }
      );
    }, 800);
  }

  return `
    <div class="screen-dashboard" style="padding-bottom: 60px;">
      <!-- Hero Section -->
      <div class="dashboard-hero">
        <div class="hero-content">
          <h1>🌿 Finca Manager</h1>
          <p>Bienvenido al centro de control operativo. Aquí tienes un resumen ejecutivo de los activos y la productividad de la finca.</p>
          <div style="margin-top: 24px; display: flex; gap: 12px;">
             <span class="badge badge-green" style="background: rgba(255,255,255,0.2); color: white;">🌸 Operación Normal</span>
             <span class="badge badge-green" style="background: rgba(255,255,255,0.2); color: white;">📅 ${new Date().toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </div>
        </div>
      </div>

      <!-- Main Summary -->
      <section class="dashboard-summary">
        <div class="dashboard-summary-card">
          <div class="dashboard-card-icon" style="background: #e8f5e9; color: #2e7d32;">
            <span class="material-icons">pets</span>
          </div>
          <p class="dashboard-card-label">GANADO TOTAL</p>
          <h3 class="dashboard-card-value">${ganadoCount || 0}</h3>
        </div>

        <div class="dashboard-summary-card">
          <div class="dashboard-card-icon" style="background: #fff3e0; color: #ef6c00;">
            <span class="material-icons">settings</span>
          </div>
          <p class="dashboard-card-label">MAQUINARIA</p>
          <h3 class="dashboard-card-value">${motoresCount || 0}</h3>
        </div>

        <div class="dashboard-summary-card">
          <div class="dashboard-card-icon" style="background: #e3f2fd; color: #1565c0;">
            <span class="material-icons">landscape</span>
          </div>
          <p class="dashboard-card-label">POTREROS</p>
          <h3 class="dashboard-card-value">${potrerosCount || 0}</h3>
        </div>

        <div class="dashboard-summary-card">
          <div class="dashboard-card-icon" style="background: #f3e5f5; color: #7b1fa2;">
            <span class="material-icons">construction</span>
          </div>
          <p class="dashboard-card-label">HERRAMIENTAS</p>
          <h3 class="dashboard-card-value">${herramientasCount || 0}</h3>
        </div>
      </section>

      <!-- Quick Actions -->
      <h3 style="font-size: 20px; font-weight: 800; margin-bottom: 20px; color: var(--on-surface);">Acciones Rápidas</h3>
      <div class="dashboard-quick-actions">
        <div class="quick-action-card" onclick="window.navigateTo('nuevo_animal')">
          <div class="quick-action-icon">
            <span class="material-icons">add_circle</span>
          </div>
          <div class="quick-action-info">
            <h4>Registrar Animal</h4>
            <p>Añadir entrada de ganado</p>
          </div>
        </div>

        <div class="quick-action-card" onclick="window.navigateTo('nuevo_motor')">
          <div class="quick-action-icon">
            <span class="material-icons">settings_applications</span>
          </div>
          <div class="quick-action-info">
            <h4>Nuevo Motor</h4>
            <p>Registrar maquinaria</p>
          </div>
        </div>

        <div class="quick-action-card" onclick="window.navigateTo('potreros')">
          <div class="quick-action-icon">
            <span class="material-icons">map</span>
          </div>
          <div class="quick-action-info">
            <h4>Mapa Potreros</h4>
            <p>Gestionar pasturas</p>
          </div>
        </div>

        <div class="quick-action-card" onclick="window.navigateTo('herramientas')">
          <div class="quick-action-icon">
            <span class="material-icons">inventory_2</span>
          </div>
          <div class="quick-action-info">
            <h4>Inventario</h4>
            <p>Control de herramientas</p>
          </div>
        </div>
      </div>

      <!-- System Status Banner -->
      <div class="alert-banner" style="background: #f5f5f5; color: #444; border-radius: 24px; box-shadow: none; border: 1px solid #eee;">
        <span class="material-icons" style="color: #2e7d32;">cloud_done</span>
        <p><strong>Base de Datos:</strong> Sincronización con Supabase activa y estable.</p>
        <button class="btn-banner" style="background: #2e7d32;">VER LOGS</button>
      </div>
    </div>
  `;
}
