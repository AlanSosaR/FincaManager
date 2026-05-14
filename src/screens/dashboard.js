import { supabase } from '../supabase.js';

export async function renderDashboard() {
  console.log('Rendering Dashboard...');
  try {
    const { count: potrerosCount } = await supabase.from('potreros').select('*', { count: 'exact', head: true });
    const { count: ganadoCount } = await supabase.from('ganado').select('*', { count: 'exact', head: true });
    const { data: motores, error: motoresError } = await supabase.from('motores').select('*');
    const { count: herramientasCount } = await supabase.from('herramientas').select('*', { count: 'exact', head: true });

    const motoresUrgentes = (motores || []).filter(eq => (eq.horas || 0) >= (eq.max_horas || 100));
    const motoresCount = (motores || []).length;

    if (motoresUrgentes.length > 0) {
      setTimeout(() => {
        if (window.Snackbar && window.Snackbar.confirm) {
          window.Snackbar.confirm(
            `<strong>Mantenimiento pendiente:</strong> ${motoresUrgentes.length} motores requieren cambio de aceite.`,
            () => window.navigateTo('detalle_motor', motoresUrgentes[0].id),
            null,
            { confirmText: 'REVISAR', type: 'error', persist: true }
          );
        }
      }, 800);
    }

    return `
      <div class="screen-dashboard" style="padding: 24px; padding-bottom: 80px;">
        <div class="screen-hero" style="background: linear-gradient(135deg, #2e7d32, #60ad5e); border-radius: 24px; padding: 32px; color: white; margin-bottom: 32px;">
          <h1 style="font-size: 28px; font-weight: 800; margin-bottom: 8px;">🌿 Finca Manager</h1>
          <p style="opacity: 0.9;">Resumen ejecutivo de operaciones.</p>
        </div>

        <div class="stats-grid" style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 16px; margin-bottom: 32px;">
          <div class="stat-card" style="background: white; padding: 20px; border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
             <p style="font-size: 12px; color: #666;">GANADO</p>
             <h3 style="font-size: 24px; font-weight: 700;">${ganadoCount || 0}</h3>
          </div>
          <div class="stat-card" style="background: white; padding: 20px; border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05);">
             <p style="font-size: 12px; color: #666;">MOTORES</p>
             <h3 style="font-size: 24px; font-weight: 700;">${motoresCount || 0}</h3>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 16px;">
          <button onclick="window.navigateTo('ganado')" style="padding: 16px; border-radius: 16px; border: none; background: #e8f5e9; color: #2e7d32; font-weight: 700; cursor: pointer;">Ir a Ganado</button>
          <button onclick="window.navigateTo('motores')" style="padding: 16px; border-radius: 16px; border: none; background: #fff3e0; color: #ef6c00; font-weight: 700; cursor: pointer;">Ir a Motores</button>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error in renderDashboard:', err);
    return `<div style="padding: 24px; color: red;">Error cargando dashboard: ${err.message}</div>`;
  }
}
