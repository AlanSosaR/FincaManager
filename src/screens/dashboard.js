import { supabase } from '../supabase.js';

export async function renderDashboard() {
  console.log('Rendering Dashboard...');
  try {
    const [
      { count: potrerosCount },
      { count: ganadoCount },
      { data: motores, error: motoresError },
      { count: herramientasCount },
      { data: vacunasData },
      { data: fumigacionesData }
    ] = await Promise.all([
      supabase.from('potreros').select('*', { count: 'exact', head: true }),
      supabase.from('ganado').select('*', { count: 'exact', head: true }),
      supabase.from('motores').select('*'),
      supabase.from('herramientas').select('*', { count: 'exact', head: true }),
      supabase.from('animal_vacunas').select('*, ganado(nombre)').eq('estado', 'Programada').order('fecha', { ascending: true }).limit(5),
      supabase.from('animal_fumigaciones').select('*, ganado(nombre)').eq('estado', 'Programada').order('fecha', { ascending: true }).limit(5)
    ]);

    const vacunasPendientes = (vacunasData || []).map(v => ({ ...v, tipo: 'Vacuna', animalNombre: v.ganado?.nombre || 'Animal' }));
    const fumigacionesPendientes = (fumigacionesData || []).map(f => ({ ...f, tipo: 'Fumigación', animalNombre: f.ganado?.nombre || 'Animal' }));
    const todasLasTareas = [...vacunasPendientes, ...fumigacionesPendientes].sort((a, b) => new Date(a.fecha) - new Date(b.fecha)).slice(0, 5);

    const vacunasPendientesCount = vacunasPendientes.length;
    const fumigacionesPendientesCount = fumigacionesPendientes.length;

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
          <div class="stat-card" onclick="window.navigateTo('ganado')" style="background: white; padding: 20px; border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); cursor: pointer;">
             <p style="font-size: 12px; color: #666; margin-bottom: 4px;">GANADO</p>
             <h3 style="font-size: 24px; font-weight: 700;">${ganadoCount || 0}</h3>
          </div>
          <div class="stat-card" onclick="window.navigateTo('motores')" style="background: white; padding: 20px; border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); cursor: pointer;">
             <p style="font-size: 12px; color: #666; margin-bottom: 4px;">MOTORES</p>
             <h3 style="font-size: 24px; font-weight: 700;">${motoresCount || 0}</h3>
          </div>
          
          ${vacunasPendientesCount > 0 ? `
          <div class="stat-card" onclick="window.navigateTo('ganado', 1, 'vacunas')" style="background: #fff3e0; padding: 20px; border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); cursor: pointer; border-left: 4px solid #f57c00;">
             <p style="font-size: 11px; color: #e65100; font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
               <span class="material-icons" style="font-size: 14px;">vaccines</span> VACUNAS PDTES.
             </p>
             <h3 style="font-size: 24px; font-weight: 800; color: #e65100;">${vacunasPendientesCount}</h3>
          </div>
          ` : ''}

          ${fumigacionesPendientesCount > 0 ? `
          <div class="stat-card" onclick="window.navigateTo('ganado', 1, 'fumigaciones')" style="background: #e1f5fe; padding: 20px; border-radius: 20px; box-shadow: 0 4px 12px rgba(0,0,0,0.05); cursor: pointer; border-left: 4px solid #0288d1;">
             <p style="font-size: 11px; color: #01579b; font-weight: 700; margin-bottom: 4px; display: flex; align-items: center; gap: 4px;">
               <span class="material-icons" style="font-size: 14px;">bug_report</span> FUMIGACIONES PDTES.
             </p>
             <h3 style="font-size: 24px; font-weight: 800; color: #01579b;">${fumigacionesPendientesCount}</h3>
          </div>
          ` : ''}
        </div>

        ${todasLasTareas.length > 0 ? `
        <div class="tasks-section" style="margin-bottom: 32px;">
          <h3 style="font-size: 18px; font-weight: 800; margin-bottom: 16px; display: flex; align-items: center; gap: 8px;">
            <span class="material-icons" style="color: var(--primary);">event_note</span>
            Próximas Tareas
          </h3>
          <div style="display: flex; flex-direction: column; gap: 12px;">
            ${todasLasTareas.map(t => `
              <div class="task-card" onclick="window.navigateTo('detalle_animal', '${t.animal_id}')" style="background: white; padding: 16px; border-radius: 16px; display: flex; align-items: center; gap: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.05); border-left: 4px solid ${t.tipo === 'Vacuna' ? '#f57c00' : '#0288d1'}; cursor: pointer;">
                <div style="background: ${t.tipo === 'Vacuna' ? '#fff3e0' : '#e1f5fe'}; color: ${t.tipo === 'Vacuna' ? '#f57c00' : '#0288d1'}; width: 44px; height: 44px; border-radius: 12px; display: flex; align-items: center; justify-content: center;">
                  <span class="material-icons">${t.tipo === 'Vacuna' ? 'vaccines' : 'bug_report'}</span>
                </div>
                <div style="flex: 1;">
                  <h4 style="margin: 0; font-size: 14px; font-weight: 800;">${t.animalNombre}</h4>
                  <p style="margin: 2px 0 0 0; font-size: 12px; color: #666;">${t.tipo}: ${t.nombre || t.producto || 'Pendiente'}</p>
                </div>
                <div style="text-align: right;">
                  <p style="margin: 0; font-size: 11px; font-weight: 800; color: #999;">${new Date(t.fecha).toLocaleDateString('es-ES', { day: '2-digit', month: 'short' })}</p>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
        ` : ''}

        <div style="display: flex; flex-direction: column; gap: 16px;">
          <button onclick="window.navigateTo('ganado')" style="padding: 16px; border-radius: 16px; border: none; background: #e8f5e9; color: #2e7d32; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
            <span class="material-icons">pets</span> Gestión de Ganado
          </button>
          <button onclick="window.navigateTo('motores')" style="padding: 16px; border-radius: 16px; border: none; background: #fff3e0; color: #ef6c00; font-weight: 700; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;">
            <span class="material-icons">settings_suggest</span> Mantenimiento de Motores
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error in renderDashboard:', err);
    return `<div style="padding: 24px; color: red;">Error cargando dashboard: ${err.message}</div>`;
  }
}
