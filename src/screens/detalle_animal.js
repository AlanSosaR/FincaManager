import { supabase } from '../supabase.js';

export async function renderDetalleAnimal(animalId) {
  const { data: animal, error: animalError } = await supabase
    .from('ganado')
    .select('*')
    .eq('id', animalId)
    .single();

  if (animalError) {
    console.error('Error fetching animal:', animalError);
    return `<div class="screen-detalle-motor"><p>Error cargando animal: ${animalError.message}</p></div>`;
  }

  const { data: vacunas } = await supabase
    .from('animal_vacunas')
    .select('*')
    .eq('animal_id', animalId)
    .order('fecha', { ascending: false });

  const { data: pesajes } = await supabase
    .from('animal_pesajes')
    .select('*')
    .eq('animal_id', animalId)
    .order('fecha', { ascending: false });

  const defaultImg = animal.sexo === 'Macho' 
    ? 'https://images.unsplash.com/photo-1547407139-3c921a66005c?q=80&w=1000&auto=format&fit=crop' 
    : 'https://images.unsplash.com/photo-1570042225831-d98fa7577f1e?q=80&w=1000&auto=format&fit=crop';

  const photoUrl = animal.image_url || defaultImg;

  return `
    <div class="screen-detalle-motor screen-detalle-animal">
      <div class="grid-top-layout">
        
        <!-- Left: Main Bento Column -->
        <div class="col-left space-y-6">
          
          <!-- Main Info Card -->
          <div class="maint-card safe-mode p-8" style="min-height: 400px; justify-content: flex-end;">
            <div class="maint-card-image" style="background-image: url('${photoUrl}'); position: absolute; top: 0; left: 0; height: 100%; width: 100%; opacity: 0.9; filter: brightness(0.8);">
                <div class="badge-status-expressive absolute" style="top: 24px; left: 24px;">
                    <div class="dot-pulse"></div>
                    ${animal.sexo || 'Indefinido'}
                </div>
            </div>
            
            <div class="z-10">
              <h2 style="font-size: 48px; font-weight: 950; color: white; margin-bottom: 4px; line-height: 1;">${animal.nombre}</h2>
              <p style="font-size: 16px; font-weight: 700; color: rgba(255,255,255,0.8); margin-bottom: 24px;">${animal.raza || 'Raza no especificada'} • ID: ${animal.id.split('-').shift()}</p>
              
              <div class="flex gap-4">
                 <div style="background: rgba(255,255,255,0.2); backdrop-filter: blur(10px); padding: 12px 20px; border-radius: 20px;">
                    <span class="label-bold-caps" style="color: white; opacity: 0.7; display: block; margin-bottom: 4px;">Peso Actual</span>
                    <span style="font-size: 24px; font-weight: 900; color: white;">${animal.peso_actual || 0} <span style="font-size: 14px; opacity: 0.8;">KG</span></span>
                 </div>
                 <div style="background: rgba(255,255,255,0.2); backdrop-filter: blur(10px); padding: 12px 20px; border-radius: 20px;">
                    <span class="label-bold-caps" style="color: white; opacity: 0.7; display: block; margin-bottom: 4px;">Salud</span>
                    <span style="font-size: 24px; font-weight: 900; color: white;">Excelente</span>
                 </div>
              </div>
            </div>
          </div>

          <!-- Quick Actions Bento Grid -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div class="m3-result-bubble" style="margin: 0; cursor: pointer; border-style: solid; transition: transform 0.2s;" onclick="window.showAnimalAction('peso', '${animalId}')">
                <div class="m3-result-info">
                    <span class="m3-result-label">REGISTRAR NUEVO</span>
                    <span class="m3-result-value">Pesaje</span>
                </div>
                <div class="m3-calc-icon-container">
                    <span class="material-icons">monitor_weight</span>
                </div>
            </div>

            <div class="m3-result-bubble" style="margin: 0; cursor: pointer; border-style: solid; background: #e8f5e9; border-color: #c8e6c9; transition: transform 0.2s;" onclick="window.showAnimalAction('vacuna', '${animalId}')">
                <div class="m3-result-info">
                    <span class="m3-result-label" style="color: #2e7d32;">REGISTRAR NUEVA</span>
                    <span class="m3-result-value" style="color: #1b5e20;">Vacunación</span>
                </div>
                <div class="m3-calc-icon-container" style="color: #2e7d32;">
                    <span class="material-icons">vaccines</span>
                </div>
            </div>
          </div>

        </div>

        <!-- Right: Timeline Column -->
        <div class="col-right">
          <div class="timeline-panel-premium">
            <div class="timeline-title">
              <span class="material-icons">history</span>
              <h3>Historial de Eventos</h3>
            </div>

            <div class="timeline-items-container">
              ${[...(vacunas || []).map(v => ({ ...v, type: 'vacuna' })), ...(pesajes || []).map(p => ({ ...p, type: 'pesaje' }))]
                .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
                .map((event, idx) => `
                  <div class="timeline-item-premium ${idx === 0 ? 'is-recent' : ''}">
                    <div class="tl-dot-container">
                      <div class="tl-dot"></div>
                    </div>
                    <div class="tl-content">
                      <span class="tl-badge">${event.type === 'vacuna' ? 'VACUNACIÓN' : 'CONTROL DE PESO'}</span>
                      <h4 class="tl-item-title">${event.nombre || (event.type === 'pesaje' ? `${event.peso} KG` : 'Evento')}</h4>
                      <p class="tl-item-desc">Registrado por el sistema el ${new Date(event.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })}.</p>
                      <div class="tl-footer-pills">
                        <span class="tl-pill">${new Date(event.fecha).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                        ${event.type === 'pesaje' ? `<span class="tl-pill" style="background: #e3f2fd; color: #1565c0;">${event.cambio || 'Estable'}</span>` : ''}
                      </div>
                    </div>
                  </div>
                `).join('') || '<div class="empty-state-text">No hay eventos registrados aún.</div>'}
            </div>
          </div>
        </div>

      </div>
    </div>
  `;
}

export function initDetalleAnimal(animalId) {
    console.log('Initializing Detalle Animal for:', animalId);

    window.showAnimalAction = async (type, id) => {
        const title = type === 'peso' ? 'Registrar Pesaje' : 'Registrar Vacuna';
        const label = type === 'peso' ? 'Peso (KG)' : 'Nombre de la Vacuna';
        const inputType = type === 'peso' ? 'number' : 'text';

        const result = await window.showModal({
            title: title,
            content: `
                <div class="m3-field">
                    <label>${label}</label>
                    <div class="m3-input-container">
                        <input type="${inputType}" id="action-value" step="0.1" placeholder="Ej: ${type === 'peso' ? '450.5' : 'Aftosa'}">
                    </div>
                </div>
                <div class="m3-field" style="margin-top: 16px;">
                    <label>Fecha</label>
                    <div class="m3-input-container">
                        <input type="date" id="action-date" value="${new Date().toISOString().split('T')[0]}">
                    </div>
                </div>
            `,
            confirmText: 'Guardar Registro'
        });

        if (result) {
            const value = document.getElementById('action-value').value;
            const date = document.getElementById('action-date').value;

            if (!value) return;

            try {
                window.Snackbar.show('Guardando...', { type: 'info' });
                if (type === 'peso') {
                    // Get last weight to calculate change
                    const { data: lastPesajes } = await supabase
                        .from('animal_pesajes')
                        .select('peso')
                        .eq('animal_id', id)
                        .order('fecha', { ascending: false })
                        .limit(1);
                    
                    const lastWeight = lastPesajes && lastPesajes[0] ? lastPesajes[0].peso : 0;
                    const change = lastWeight > 0 ? (parseFloat(value) - lastWeight).toFixed(1) : 'Inicial';
                    const cambioStr = lastWeight > 0 ? (change > 0 ? `+${change} kg` : `${change} kg`) : 'Inicial';

                    await supabase.from('animal_pesajes').insert([{
                        animal_id: id,
                        peso: parseFloat(value),
                        fecha: date,
                        evento: 'Control Rutinario',
                        cambio: cambioStr,
                        tendencia: change >= 0 ? 'trending_up' : 'trending_down'
                    }]);

                    // Update main table
                    await supabase.from('ganado').update({ peso_actual: parseFloat(value) }).eq('id', id);
                } else {
                    await supabase.from('animal_vacunas').insert([{
                        animal_id: id,
                        nombre: value,
                        fecha: date,
                        icon: 'vaccines',
                        color: '#2e7d32'
                    }]);
                }

                window.Snackbar.show('Registro guardado exitosamente');
                window.navigateTo('detalle_animal', id); // Reload
            } catch (err) {
                console.error(err);
                window.Snackbar.show('Error al guardar: ' + err.message, { type: 'error' });
            }
        }
    };
}
