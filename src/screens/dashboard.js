import { supabase } from '../supabase.js';

export async function renderDashboard() {
  const { count: potrerosCount } = await supabase.from('potreros').select('*', { count: 'exact', head: true });
  const { count: ganadoCount } = await supabase.from('ganado').select('*', { count: 'exact', head: true });
  const { data: motores, error: motoresError } = await supabase.from('motores').select('*');

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
    <div class="screen-dashboard">
      <div class="screen-hero">
        <div class="hero-content">
          <h2>🌿 Gestión de la Finca</h2>
          <p>Bienvenido al centro de control. Aquí tienes un resumen del estado actual de tus activos y ganado.</p>
          <span class="badge badge-green">🌸 Operación Normal</span>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stat-card">
          <span class="material-icons stat-icon">landscape</span>
          <div>
            <p class="stat-label">Potreros</p>
            <h3 class="stat-value">${potrerosCount || 0}</h3>
          </div>
        </div>
        <div class="stat-card">
          <span class="material-icons stat-icon">pets</span>
          <div>
            <p class="stat-label">Ganado Total</p>
            <h3 class="stat-value">${ganadoCount || 0}</h3>
          </div>
        </div>
        <div class="stat-card">
          <span class="material-icons stat-icon">settings</span>
          <div>
            <p class="stat-label">Maquinaria</p>
            <h3 class="stat-value">${motoresCount || 0}</h3>
          </div>
        </div>
      </div>


      <div class="info-banner" style="margin-top: 32px;">
        <span class="material-icons">info</span>
        <p>Utiliza el menú lateral para gestionar los diferentes activos de la finca (ganado, maquinaria, potreros y herramientas).</p>
      </div>

      <div class="tip-card" style="margin-top: 24px;">
        <span class="material-icons">lightbulb</span>
        <div>
          <p><strong>Actualización:</strong> Se ha integrado exitosamente la base de datos Supabase para todos los módulos.</p>
        </div>
      </div>
    </div>
  `;
}
