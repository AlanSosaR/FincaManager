import { supabase } from '../supabase.js';

export async function renderDetalleHerramienta(toolId) {
  const { data: tool, error: toolError } = await supabase
    .from('herramientas')
    .select('*')
    .eq('id', toolId)
    .single();

  const { data: mantenimientos, error: mantError } = await supabase
    .from('herramienta_mantenimientos')
    .select('*')
    .eq('herramienta_id', toolId)
    .order('fecha', { ascending: false });

  if (toolError) {
    console.error('Error fetching tool:', toolError);
    return `<div class="screen-detalle"><p>Error cargando herramienta: ${toolError.message}</p></div>`;
  }

  const toolData = {
    id: tool.id,
    nombre: tool.nombre || 'Sin Nombre',
    ubicacion: tool.ubicacion || 'Bodega',
    icon: tool.icon || '🛠️',
    color: tool.color || '#fff',
    specs: [
      { label: 'ID', value: tool.id.split('-').shift() },
      { label: 'Ubicación', value: tool.ubicacion || 'N/A' },
    ],
  };


  return `
    <div class="screen-detalle">

      <!-- Hero Section -->
      <div class="detail-hero card" style="background: ${toolData.color};">
        <div class="detail-hero-header">
          <div class="detail-hero-icon">${toolData.icon}</div>
          <div>
            <h2>${toolData.nombre}</h2>
            <div class="detail-subtitle" style="display:flex; align-items:center; gap:4px;">
              <span class="material-icons" style="font-size:16px;">location_on</span>
              ${toolData.ubicacion}
            </div>
          </div>
        </div>

        <div class="detail-stats">
          ${toolData.specs.map(s => `
            <div class="detail-stat-item">
              <span class="detail-stat-label">${s.label}</span>
              <span class="detail-stat-value" style="font-size:16px;">${s.value}</span>
            </div>
          `).join('')}
        </div>
      </div>

      <div class="grid-2">
        <!-- Maintenance History Segment -->
        <div class="section">
          <div class="section-title">
            <h3>Historial de Mantenimiento</h3>
            <button class="btn-primary" style="padding: 6px 12px; font-size: 12px;">+ Registro</button>
          </div>
          <div class="activity-list" style="margin-top: 16px;">
            ${mantenimientos && mantenimientos.length > 0 ? mantenimientos.map(m => `
              <div class="activity-item card" style="padding:16px; margin-bottom:12px; display: flex; align-items: flex-start; gap: 16px; cursor: default;">
                <div style="background: ${m.color || '#4caf50'}15; color: ${m.color || '#4caf50'}; padding: 10px; border-radius: 12px; display: flex;">
                  <span class="material-icons">${m.icon || 'settings'}</span>
                </div>
                <div style="flex: 1;">
                   <h4 style="font-size: 15px; font-weight: 600; margin-bottom: 4px;">${m.evento}</h4>
                   <p style="font-size: 12px; color: #666; margin-bottom: 8px;">${m.descripcion || ''}</p>
                   <span class="history-date">${new Date(m.fecha).toLocaleDateString()}</span>
                </div>
              </div>
            `).join('') : '<p style="text-align:center; padding: 24px; color:#999">No hay registros de mantenimiento.</p>'}
          </div>
        </div>
      </div>
    </div>
  `;
}
