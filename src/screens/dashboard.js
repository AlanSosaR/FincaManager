import { supabase } from '../supabase.js';

export async function renderDashboard() {
  console.log('Rendering Dashboard...');
  try {
    const [
      { data: lotes, error: lotesErr },
      { data: aplicaciones, error: appErr }
    ] = await Promise.all([
      supabase.from('lotes').select('*').order('created_at', { ascending: false }),
      supabase.from('lote_aplicaciones').select('*, lotes(nombre)').order('fecha', { ascending: false }).limit(5)
    ]);

    if (lotesErr) throw lotesErr;

    const totalPlantas = lotes?.reduce((sum, l) => sum + (l.num_plantas || 0), 0) || 0;

    return `
      <div class="m3-pt-6 m3-pb-24 m3-p-4 m3-font-work-sans">
        <!-- Header & Summary Card -->
        <section class="m3-mb-10">
          <div class="m3-flex m3-mobile-flex-col m3-items-end m3-justify-between m3-gap-6">
            <div>
              <h1 class="m3-display-medium m3-font-extrabold m3-text-on-surface m3-tracking-tight m3-mt-1 m3-font-manrope">Gestión del Cafetal</h1>
            </div>
            <div class="m3-relative m3-max-w-md m3-w-full">
              <div class="m3-card m3-shadow-sm m3-flex m3-items-center m3-gap-4">
                <div class="m3-bg-primary-container m3-size-16 m3-rounded-2xl m3-flex m3-items-center m3-justify-center m3-text-primary">
                  <span class="material-symbols-outlined" style="font-size: 30px; font-variation-settings: 'FILL' 1;">eco</span>
                </div>
                <div>
                  <p class="m3-label-small m3-text-on-surface-variant m3-font-medium">Estado General</p>
                  <h3 class="m3-title-large m3-font-bold m3-text-on-surface">Cosecha Activa</h3>
                  <div class="m3-flex m3-items-center m3-gap-2 m3-mt-1">
                    <span class="m3-size-2 m3-rounded-full m3-bg-primary" style="width: 8px; height: 8px;"></span>
                    <span class="m3-label-small m3-text-primary m3-font-bold">Salud Promedio - 92%</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        <div class="m3-grid m3-grid-4 m3-gap-8">
          <!-- Left Column: Lotes Grid -->
          <div class="m3-col-span-3 m3-flex m3-flex-col m3-gap-8">
            <div>
              <div class="m3-flex m3-items-center m3-justify-between m3-mb-6">
                <h2 class="m3-headline-small m3-font-bold m3-text-on-surface">Lotes & Microlotes</h2>
                <span class="m3-bg-primary-container m3-text-on-primary-container m3-label-small m3-font-bold m3-rounded-full m3-p-1" style="padding: 4px 12px;">Total: ${totalPlantas.toLocaleString()} plantas</span>
              </div>
              
              <div class="m3-grid m3-grid-2 m3-gap-6">
                ${lotes && lotes.length > 0 ? lotes.map((lote, index) => {
                  const seed = encodeURIComponent(lote.id);
                  const statusColor = lote.salud_porcentaje > 80 ? 'bg-primary' : (lote.salud_porcentaje > 50 ? 'bg-secondary' : 'bg-error');
                  const badgeColors = ['tertiary', 'secondary', 'primary'];
                  const theme = badgeColors[index % badgeColors.length];
                  
                  const healthIcon = lote.salud_porcentaje > 80 ? 'sentiment_satisfied' : lote.salud_porcentaje > 50 ? 'sentiment_neutral' : 'sentiment_dissatisfied';
                   return `
                    <div class="m3-exp-card m3-exp-card-${theme}" 
                         onclick="window.navigateTo('detalle_lote', '${lote.id}')">
                      <div class="m3-exp-card-body">
                        <div class="m3-exp-card-top">
                          <div class="m3-exp-badge m3-exp-badge-${theme}">
                            <img src="grano-de-cafe.png" alt="" style="width: 16px; height: 16px; object-fit: contain;">
                            <span>${lote.variedad || 'Variedad'}</span>
                          </div>
                          <div class="m3-exp-card-actions">
                            <div class="m3-exp-health-chip">
                              <span class="material-symbols-outlined">${healthIcon}</span>
                              <span>${lote.salud_porcentaje || 0}%</span>
                            </div>
                            <div class="m3-action-menu-container">
                              <button class="m3-exp-btn-more" onclick="event.stopPropagation(); window.toggleActionMenu(this)">
                                <span class="material-symbols-outlined">more_vert</span>
                              </button>
                              <div class="action-menu">
                                <div class="action-item" onclick="event.stopPropagation(); window.navigateTo('nuevo_lote', '${lote.id}')">
                                  <span class="material-icons">edit</span><span>Editar</span>
                                </div>
                                <div class="action-item delete" onclick="event.stopPropagation(); window.confirmDeleteLote('${lote.id}', '${lote.nombre}')">
                                  <span class="material-icons">delete</span><span>Eliminar</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                        <h3 class="m3-exp-card-title">${lote.nombre}</h3>
                        <div class="m3-exp-card-details">
                          <div class="m3-exp-detail-item">
                            <span class="material-symbols-outlined">potted_plant</span>
                            <span class="m3-exp-detail-label">Plantas</span>
                            <span class="m3-exp-detail-value">${(lote.num_plantas || 0).toLocaleString()}</span>
                          </div>
                          <div class="m3-exp-detail-divider"></div>
                          <div class="m3-exp-detail-item">
                            <span class="material-symbols-outlined">square_foot</span>
                            <span class="m3-exp-detail-label">Área</span>
                            <span class="m3-exp-detail-value">${lote.area_ha || 0} ha</span>
                          </div>
                        </div>
                        <div class="m3-exp-health-bar">
                          <div class="m3-exp-health-track">
                            <div class="m3-exp-health-fill m3-exp-health-${statusColor.replace('bg-', '')}" style="width: ${lote.salud_porcentaje || 0}%"></div>
                          </div>
                        </div>
                      </div>
                    </div>
                  `;
                }).join('') : `
                  <div class="m3-col-span-3 m3-p-8 m3-bg-surface-container-low m3-rounded-3xl m3-border-dashed" style="text-align: center; border: 2px dashed rgba(130, 128, 121, 0.2); padding-top: 48px; padding-bottom: 48px;">
                    <span class="material-symbols-outlined m3-mb-2" style="font-size: 48px; opacity: 0.2;">potted_plant</span>
                    <p class="m3-text-on-surface-variant m3-label-large">No hay lotes registrados aún.</p>
                    <button onclick="window.navigateTo('nuevo_lote')" class="m3-mt-4 m3-text-primary m3-font-bold m3-bg-none m3-border-none cursor-pointer" style="text-decoration: underline;">Agregar primer lote</button>
                  </div>
                `}
              </div>

              ${lotes && lotes.length > 0 ? `
              <div class="m3-mt-4 m3-p-4 m3-bg-surface-container-low m3-rounded-2xl m3-flex m3-items-center m3-justify-between">
                <div class="m3-flex m3-items-center m3-gap-6">
                  <div class="m3-flex m3-items-center m3-gap-2">
                    <span class="material-symbols-outlined m3-text-primary" style="font-size: 20px;">potted_plant</span>
                    <span class="m3-label-medium m3-text-on-surface-variant">Total plantas:</span>
                    <span class="m3-title-medium m3-font-bold m3-text-on-surface">${totalPlantas.toLocaleString()}</span>
                  </div>
                  <div class="m3-flex m3-items-center m3-gap-2">
                    <span class="material-symbols-outlined m3-text-primary" style="font-size: 20px;">square_foot</span>
                    <span class="m3-label-medium m3-text-on-surface-variant">Área total:</span>
                    <span class="m3-title-medium m3-font-bold m3-text-on-surface">${lotes.reduce((sum, l) => sum + (parseFloat(l.area_ha) || 0), 0).toFixed(1)} ha</span>
                  </div>
                  <div class="m3-flex m3-items-center m3-gap-2">
                    <span class="material-symbols-outlined m3-text-primary" style="font-size: 20px;">inventory_2</span>
                    <span class="m3-label-medium m3-text-on-surface-variant">Lotes:</span>
                    <span class="m3-title-medium m3-font-bold m3-text-on-surface">${lotes.length}</span>
                  </div>
                </div>
              </div>
              ` : ''}
            </div>

            <!-- Aplicaciones Recientes Section -->
            <div>
              <h2 class="m3-headline-small m3-font-bold m3-text-on-surface m3-mb-6">Aplicaciones Recientes</h2>
              <div class="m3-card m3-p-0 m3-overflow-hidden">
                <div style="overflow-x: auto;">
                  <table class="m3-table">
                    <thead>
                      <tr>
                        <th>Tipo & Producto</th>
                        <th>Dosis</th>
                        <th>Lote / Fecha</th>
                        <th style="text-align: right;">Operador</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${aplicaciones && aplicaciones.length > 0 ? aplicaciones.map(app => {
                        const isFertilizante = app.tipo === 'Fertilizante';
                        const theme = isFertilizante ? 'secondary' : 'tertiary';
                        const icon = isFertilizante ? 'science' : 'pest_control';
                        return `
                        <tr onclick="window.navigateTo('detalle_lote', '${app.lote_id}')">
                          <td>
                            <div class="m3-flex m3-items-center m3-gap-3">
                              <div class="m3-bg-${theme}-container m3-p-2 m3-rounded-2xl m3-text-${theme}">
                                <span class="material-symbols-outlined" style="font-size: 14px;">${icon}</span>
                              </div>
                              <div>
                                <p class="m3-label-large m3-font-bold m3-text-on-surface">${app.producto}</p>
                                <p class="m3-label-small m3-text-on-surface-variant">${app.tipo}</p>
                              </div>
                            </div>
                          </td>
                          <td class="m3-label-medium">${app.dosis}</td>
                          <td>
                            <p class="m3-label-large m3-font-bold m3-text-on-surface">${app.lotes?.nombre || 'Desconocido'}</p>
                            <p class="m3-label-small m3-text-on-surface-variant">${new Date(app.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}</p>
                          </td>
                          <td style="text-align: right;">
                            <div class="m3-flex m3-items-center m3-justify-end m3-gap-2">
                              <span class="m3-label-small m3-font-bold m3-text-on-surface">${app.operador || 'Anon'}</span>
                              <div class="m3-size-8 m3-rounded-full m3-bg-primary m3-text-on-primary m3-flex m3-items-center m3-justify-center m3-label-small" style="background-color: var(--m3-${theme}); color: var(--m3-on-${theme}); font-weight: bold;">
                                ${(app.operador || 'A').charAt(0).toUpperCase()}
                              </div>
                            </div>
                          </td>
                        </tr>
                      `}).join('') : `
                        <tr>
                          <td colspan="4" class="m3-p-8 m3-text-on-surface-variant" style="text-align: center; font-style: italic;">No hay aplicaciones recientes</td>
                        </tr>
                      `}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column: Stats & Insights -->
          <aside class="m3-flex m3-flex-col m3-gap-8">
            <div class="m3-card m3-bg-primary-container" style="background-color: rgba(185, 241, 173, 0.2);">
              <h3 class="m3-title-medium m3-font-bold m3-text-primary m3-mb-4 m3-flex m3-items-center m3-gap-2">
                <span class="material-symbols-outlined">analytics</span> Resumen
              </h3>
              <div class="m3-flex m3-flex-col m3-gap-4">
                <div class="m3-flex m3-justify-between m3-items-center">
                  <span class="m3-label-medium m3-text-on-surface-variant">Lotes Activos</span>
                  <span class="m3-font-bold m3-text-on-surface">${lotes?.length || 0}</span>
                </div>
                <div class="m3-flex m3-justify-between m3-items-center">
                  <span class="m3-label-medium m3-text-on-surface-variant">Área Total</span>
                  <span class="m3-font-bold m3-text-on-surface">${lotes?.reduce((sum, l) => sum + (parseFloat(l.area_ha) || 0), 0).toFixed(1)} ha</span>
                </div>
              </div>
            </div>
          </aside>
        </div>
        
        <button onclick="window.navigateTo('nuevo_lote')" class="m3-fab">
          <span class="material-symbols-outlined">add_location</span>
          <span>Agregar Lote</span>
        </button>
      </div>
    `;
  } catch (err) {
    console.error('Error in renderDashboard:', err);
    return `<div style="padding: 24px; color: red;">Error cargando dashboard: ${err.message}</div>`;
  }
}

window.toggleActionMenu = (btn) => {
  const menu = btn.nextElementSibling;
  if (!menu) return;
  const isActive = menu.classList.contains('active');
  document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
  if (!isActive) menu.classList.add('active');
};

window.confirmDeleteLote = (id, name) => {
  window.Snackbar.confirm(`¿Eliminar el lote "${name}"?`, async () => {
    const { error } = await supabase.from('lotes').delete().eq('id', id);
    if (error) window.Snackbar.show('Error: ' + error.message, { type: 'error' });
    else { window.Snackbar.show('Lote eliminado'); window.clearScreenCache?.('dashboard'); window.navigateTo('dashboard'); }
  });
};

