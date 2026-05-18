import { supabase } from '../supabase.js';
import { showModal } from '../modals.js';

export async function renderDetalleLote(id) {
  try {
    const [
      { data: lote, error: loteErr },
      { data: aplicaciones, error: appErr }
    ] = await Promise.all([
      supabase.from('lotes').select('*').eq('id', id).single(),
      supabase.from('lote_aplicaciones').select('*').eq('lote_id', id).order('fecha', { ascending: false })
    ]);

    if (loteErr) throw loteErr;

    const fertilizantes = (aplicaciones || []).filter(a => a.tipo === 'Fertilizante');
    const otrosApps = (aplicaciones || []).filter(a => a.tipo !== 'Fertilizante');

    return `
      <div class="m3-pt-6 m3-pb-24 m3-p-4 m3-max-w-4xl m3-mx-auto m3-font-work-sans">
        <!-- Header -->
        <section class="m3-mb-10">
          <div class="m3-flex m3-flex-col m3-gap-4">
            <div class="m3-flex m3-mobile-flex-col m3-items-start m3-justify-between m3-gap-4">
              <div class="m3-flex m3-items-center m3-gap-4 m3-flex-wrap">
                <h1 class="m3-display-small m3-font-extrabold m3-text-on-surface m3-tracking-tight m3-font-manrope">${lote.nombre}</h1>
              </div>
            </div>
            <div class="m3-flex m3-gap-6 m3-text-on-surface-variant m3-label-medium m3-font-bold m3-flex-wrap">
              <span class="m3-flex m3-items-center m3-gap-2 m3-bg-tertiary-container m3-text-on-tertiary-container m3-px-3 m3-py-1 m3-rounded-full"><img src="grano-de-cafe.png" alt="" style="width: 16px; height: 16px; object-fit: contain;"> Variedad ${lote.variedad || 'N/A'}</span>
              <span class="m3-flex m3-items-center m3-gap-2"><span class="material-symbols-outlined m3-text-primary" style="font-size: 18px;">potted_plant</span> ${(lote.num_plantas || 0).toLocaleString()} plantas</span>
              <span class="m3-flex m3-items-center m3-gap-2"><span class="material-symbols-outlined m3-text-primary" style="font-size: 18px;">square_foot</span> ${lote.area_ha || 0} Hectáreas</span>
            </div>
          </div>
        </section>

        <div class="m3-grid m3-grid-4 m3-gap-8">
          <!-- Main Column -->
          <div class="m3-col-span-3 m3-flex m3-flex-col m3-gap-8">

            <!-- Fertilización Section -->
            <div class="m3-card m3-p-8" style="border-radius: 32px;">
              <div class="m3-flex m3-items-center m3-justify-between m3-mb-6">
                <div class="m3-flex m3-items-center m3-gap-3">
                  <span class="material-symbols-outlined m3-text-secondary" style="font-size: 24px; font-variation-settings: 'FILL' 1;">science</span>
                  <h2 class="m3-headline-small m3-font-bold m3-text-on-surface">Fertilización</h2>
                </div>
                <button onclick="window.showAddAplicacionModal('${lote.id}')" class="m3-text-primary m3-label-medium m3-font-bold m3-flex m3-items-center m3-gap-1 m3-bg-none m3-border-none m3-cursor-pointer" style="text-decoration: underline;">
                  Histórico completo <span class="material-symbols-outlined" style="font-size: 14px;">open_in_new</span>
                </button>
              </div>
              <div class="m3-flex m3-flex-col m3-gap-4">
                ${fertilizantes.length > 0 ? fertilizantes.map(app => `
                  <div class="m3-flex m3-items-center m3-justify-between m3-p-4 m3-bg-surface-container m3-rounded-2xl">
                    <div class="m3-flex m3-items-center m3-gap-4">
                      <div class="m3-size-12 m3-rounded-xl m3-bg-secondary-container m3-flex m3-items-center m3-justify-center m3-text-on-secondary-container">
                        <span class="material-symbols-outlined">inventory_2</span>
                      </div>
                      <div>
                        <p class="m3-label-large m3-font-bold m3-text-on-surface">${app.producto}</p>
                        <p class="m3-label-small m3-text-on-surface-variant">Dosis: ${app.dosis}</p>
                      </div>
                    </div>
                    <div class="m3-text-right">
                      <span class="m3-text-primary m3-label-small m3-font-bold m3-px-2 m3-py-1 m3-rounded-full m3-uppercase" style="background: rgba(62,111,57,0.1); font-size: 10px;">Realizado</span>
                      <p class="m3-label-small m3-font-medium m3-mt-1 m3-text-on-surface-variant">${new Date(app.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                    </div>
                  </div>
                `).join('') : `
                  <div class="m3-flex m3-items-center m3-justify-between m3-p-4 m3-rounded-2xl" style="border: 2px dashed var(--m3-outline-variant); opacity: 0.8;">
                    <div class="m3-flex m3-items-center m3-gap-4">
                      <div class="m3-size-12 m3-rounded-xl m3-bg-surface-container-highest m3-flex m3-items-center m3-justify-center m3-text-on-surface-variant">
                        <span class="material-symbols-outlined">schedule</span>
                      </div>
                      <div>
                        <p class="m3-label-large m3-font-bold m3-text-on-surface-variant">Sin fertilizantes registrados</p>
                        <p class="m3-label-small m3-text-on-surface-variant">Agrega la primera aplicación</p>
                      </div>
                    </div>
                  </div>
                `}
              </div>
            </div>

            <!-- Otras Aplicaciones Section -->
            <div class="m3-card m3-p-8" style="border-radius: 32px;">
              <div class="m3-flex m3-items-center m3-justify-between m3-mb-6">
                <div class="m3-flex m3-items-center m3-gap-3">
                  <span class="material-symbols-outlined m3-text-tertiary" style="font-size: 24px; font-variation-settings: 'FILL' 1;">content_cut</span>
                  <h2 class="m3-headline-small m3-font-bold m3-text-on-surface">Podas y Limpieza</h2>
                </div>
              </div>
              <div class="dl-timeline">
                ${otrosApps.length > 0 ? otrosApps.map((app, i) => `
                  <div class="dl-timeline-item">
                    <div class="dl-timeline-dot ${i === 0 ? 'dl-timeline-dot-primary' : 'dl-timeline-dot-tertiary'}"></div>
                    <div class="dl-timeline-content">
                      <h4 class="m3-label-large m3-font-bold m3-text-on-surface">${app.producto}</h4>
                      <p class="m3-body-small m3-text-on-surface-variant m3-mt-1">${app.tipo} — ${app.dosis}</p>
                      <div class="m3-flex m3-items-center m3-gap-4 m3-mt-3">
                        <span class="m3-flex m3-items-center m3-gap-1 m3-label-small m3-font-bold ${i === 0 ? 'm3-text-primary' : 'm3-text-tertiary'}">
                          <span class="material-symbols-outlined" style="font-size: 12px;">${i === 0 ? 'event' : 'event_available'}</span>
                          ${i === 0 ? 'Completado: ' : 'Realizado: '} ${new Date(app.fecha).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                        </span>
                        ${app.operador ? `
                        <span class="m3-label-small m3-text-on-surface-variant m3-flex m3-items-center m3-gap-1">
                          <span class="material-symbols-outlined" style="font-size: 12px;">person</span>
                          ${app.operador}
                        </span>` : ''}
                      </div>
                    </div>
                  </div>
                `).join('') : `
                  <div class="m3-flex m3-items-center m3-gap-4 m3-p-4 m3-bg-surface-container m3-rounded-2xl">
                    <div class="m3-size-12 m3-rounded-xl m3-bg-surface-container-highest m3-flex m3-items-center m3-justify-center m3-text-on-surface-variant">
                      <span class="material-symbols-outlined">eco</span>
                    </div>
                    <div>
                      <p class="m3-label-large m3-font-bold m3-text-on-surface-variant">Sin actividades registradas</p>
                      <p class="m3-body-small m3-text-on-surface-variant">No hay aplicaciones de fungicidas, insecticidas u otros tratamientos.</p>
                    </div>
                  </div>
                `}
              </div>
            </div>
          </div>

          <!-- Sidebar Column -->
          <aside class="m3-flex m3-flex-col m3-gap-8">
            <!-- Personal Asignado -->
            <div class="m3-card m3-p-8" style="border-radius: 32px;">
              <h3 class="m3-title-large m3-font-bold m3-mb-4 m3-flex m3-items-center m3-gap-2">
                <span class="material-symbols-outlined m3-text-primary">groups</span>
                Personal Asignado
              </h3>
              <p class="m3-label-small m3-text-on-surface-variant m3-mb-6 m3-uppercase" style="letter-spacing: 0.5px; font-size: 10px;">Personas que se utilizaron para la limpia</p>
              <div class="m3-flex m3-flex-col m3-gap-6">
                <div class="m3-flex m3-items-center m3-justify-between dl-person-row">
                  <div class="m3-flex m3-items-center m3-gap-3">
                    <div class="m3-size-10 m3-rounded-full m3-bg-primary-container m3-text-on-primary-container m3-flex m3-items-center m3-justify-center m3-font-bold" style="font-size: 12px;">CR</div>
                    <div>
                      <p class="m3-label-medium m3-font-bold m3-text-on-surface dl-person-name">Carlos Ruiz</p>
                      <p class="m3-text-on-surface-variant" style="font-size: 10px; font-weight: 500;">Supervisor de Campo</p>
                    </div>
                  </div>
                  <span class="material-symbols-outlined m3-text-outline-variant dl-person-chat" style="font-size: 20px; cursor: pointer;">chat</span>
                </div>
                <div class="m3-flex m3-items-center m3-justify-between dl-person-row">
                  <div class="m3-flex m3-items-center m3-gap-3">
                    <div class="m3-size-10 m3-rounded-full m3-bg-secondary-container m3-text-on-secondary-container m3-flex m3-items-center m3-justify-center m3-font-bold" style="font-size: 12px;">AM</div>
                    <div>
                      <p class="m3-label-medium m3-font-bold m3-text-on-surface dl-person-name">Ana Mendez</p>
                      <p class="m3-text-on-surface-variant" style="font-size: 10px; font-weight: 500;">Especialista en Podas</p>
                    </div>
                  </div>
                  <span class="material-symbols-outlined m3-text-outline-variant dl-person-chat" style="font-size: 20px; cursor: pointer;">chat</span>
                </div>
                <div class="m3-flex m3-items-center m3-justify-between dl-person-row">
                  <div class="m3-flex m3-items-center m3-gap-3">
                    <div class="m3-size-10 m3-rounded-full m3-bg-surface-container-highest m3-text-on-surface-variant m3-flex m3-items-center m3-justify-center m3-font-bold" style="font-size: 12px;">JH</div>
                    <div>
                      <p class="m3-label-medium m3-font-bold m3-text-on-surface dl-person-name">Juan Herrera</p>
                      <p class="m3-text-on-surface-variant" style="font-size: 10px; font-weight: 500;">Operario de Limpieza</p>
                    </div>
                  </div>
                  <span class="material-symbols-outlined m3-text-outline-variant dl-person-chat" style="font-size: 20px; cursor: pointer;">chat</span>
                </div>
                <div class="m3-flex m3-items-center m3-justify-between dl-person-row">
                  <div class="m3-flex m3-items-center m3-gap-3">
                    <div class="m3-size-10 m3-rounded-full m3-bg-surface-container-highest m3-text-on-surface-variant m3-flex m3-items-center m3-justify-center m3-font-bold" style="font-size: 12px;">LM</div>
                    <div>
                      <p class="m3-label-medium m3-font-bold m3-text-on-surface dl-person-name">Luis Mora</p>
                      <p class="m3-text-on-surface-variant" style="font-size: 10px; font-weight: 500;">Operario de Limpieza</p>
                    </div>
                  </div>
                  <span class="material-symbols-outlined m3-text-outline-variant dl-person-chat" style="font-size: 20px; cursor: pointer;">chat</span>
                </div>
              </div>
              <button class="m3-w-full m3-mt-6 m3-py-3 m3-rounded-2xl m3-text-on-surface-variant m3-label-small m3-font-bold m3-bg-none m3-cursor-pointer" style="border: 2px dashed var(--m3-outline-variant); transition: background 0.2s;" onmouseover="this.style.background='var(--m3-surface-container)'" onmouseout="this.style.background='transparent'">
                + Asignar más personal
              </button>
            </div>

            <!-- Estado de Tareas -->
            <div class="m3-bg-primary m3-text-on-primary m3-p-8 m3-rounded-3xl" style="position: relative; overflow: hidden;">
              <div style="position: absolute; right: -16px; bottom: -16px; opacity: 0.1;">
                <span class="material-symbols-outlined" style="font-size: 120px;">agriculture</span>
              </div>
              <h3 class="m3-title-large m3-font-bold m3-mb-4" style="position: relative; z-index: 1;">Estado de Tareas</h3>
              <div class="m3-flex m3-flex-col m3-gap-4" style="position: relative; z-index: 1;">
                <div class="m3-flex m3-justify-between m3-label-medium">
                  <span style="opacity: 0.8;">Completadas este mes</span>
                  <span class="m3-font-bold" style="font-size: 18px;">${aplicaciones?.length || 0}</span>
                </div>
                <div class="m3-flex m3-justify-between m3-label-medium">
                  <span style="opacity: 0.8;">Pendientes</span>
                  <span class="m3-font-bold" style="font-size: 18px;">0</span>
                </div>
              </div>
              <button class="m3-w-full m3-mt-8 m3-bg-white m3-text-primary m3-py-3 m3-rounded-full m3-font-bold m3-label-medium m3-border-none m3-cursor-pointer" style="position: relative; z-index: 1; box-shadow: 0 4px 12px rgba(0,0,0,0.1); transition: all 0.2s;" onmouseover="this.style.boxShadow='0 8px 24px rgba(0,0,0,0.2)'" onmouseout="this.style.boxShadow='0 4px 12px rgba(0,0,0,0.1)'">
                Generar Reporte Lote
              </button>
            </div>
          </aside>
        </div>

        <div class="m3-fab-speeddial" id="fab-speeddial">
          <div class="m3-fab-actions" id="fab-actions">
            <button class="m3-fab-action" onclick="window.showActivityForm('${lote.id}', 'Análisis de Suelo')">
              <span class="m3-fab-action-label">Análisis de Suelo</span>
              <span class="m3-fab-action-icon"><span class="material-symbols-outlined">travel_explore</span></span>
            </button>
            <button class="m3-fab-action" onclick="window.showActivityForm('${lote.id}', 'Fertilizante')">
              <span class="m3-fab-action-label">Fertilizante</span>
              <span class="m3-fab-action-icon"><span class="material-symbols-outlined">science</span></span>
            </button>
            <button class="m3-fab-action" onclick="window.showActivityForm('${lote.id}', 'Limpieza')">
              <span class="m3-fab-action-label">Limpieza</span>
              <span class="m3-fab-action-icon"><span class="material-symbols-outlined">cleaning_services</span></span>
            </button>
            <button class="m3-fab-action" onclick="window.showActivityForm('${lote.id}', 'Manejo de Tejido')">
              <span class="m3-fab-action-label">Manejo de Tejido</span>
              <span class="m3-fab-action-icon"><span class="material-symbols-outlined">content_cut</span></span>
            </button>
          </div>
          <button class="m3-fab-circle" id="fab-main" onclick="window.toggleFabMenu()">
            <span class="material-symbols-outlined" id="fab-icon">add</span>
          </button>
        </div>
      </div>
    `;
  } catch (err) {
    console.error('Error in renderDetalleLote:', err);
    return `<div style="padding: 24px; color: red;">Error cargando detalle: ${err.message}</div>`;
  }
}

export function initDetalleLote(id) {
  window.showModal = showModal;
  const activityTypes = [
    { id: 'Fertilizante', icon: 'science', color: 'secondary', label: 'Fertilizante', desc: 'Nutrición y abono del suelo' },
    { id: 'Limpieza', icon: 'cleaning_services', color: 'primary', label: 'Limpieza', desc: 'Mantenimiento y limpieza general' },
    { id: 'Manejo de Tejido', icon: 'content_cut', color: 'tertiary', label: 'Manejo de Tejido', desc: 'Podas y formación de plantas' },
    { id: 'Análisis de Suelo', icon: 'travel_explore', color: 'secondary', label: 'Análisis de Suelo', desc: 'Estudio y muestreo del terreno' }
  ];

  window.toggleFabMenu = () => {
    const actions = document.getElementById('fab-actions');
    const fabIcon = document.getElementById('fab-icon');
    const overlay = document.getElementById('fab-overlay');
    const isOpen = actions.classList.contains('open');
    if (isOpen) {
      actions.classList.remove('open');
      fabIcon.textContent = 'add_task';
      if (overlay) overlay.remove();
    } else {
      const ov = document.createElement('div');
      ov.id = 'fab-overlay';
      ov.className = 'fab-overlay';
      ov.onclick = window.toggleFabMenu;
      document.body.appendChild(ov);
      actions.classList.add('open');
      fabIcon.textContent = 'close';
    }
  };

  window.showActivityForm = (loteId, tipo) => {
    window.toggleFabMenu();
    const selected = activityTypes.find(t => t.id === tipo);
    showModal(selected.label, `
      <form id="form-nueva-aplicacion">
        <input type="hidden" name="lote_id" value="${loteId}">
        <input type="hidden" name="tipo" value="${tipo}">
        <div class="m3-flex m3-flex-col m3-gap-4">
          <div class="m3-field">
            <label>Producto / Actividad</label>
            <input type="text" name="producto" placeholder="${tipo === 'Manejo de Tejido' ? 'Ej: Poda de formación' : tipo === 'Limpieza' ? 'Ej: Limpieza manual' : tipo === 'Análisis de Suelo' ? 'Ej: Muestreo de pH' : 'Nombre comercial'}" required>
          </div>
          <div class="m3-field">
            <label>Dosis / Detalle</label>
            <input type="text" name="dosis" placeholder="${tipo === 'Manejo de Tejido' || tipo === 'Limpieza' ? 'Ej: 2 horas / 50 plantas' : tipo === 'Análisis de Suelo' ? 'Ej: 5 muestras / ha' : 'Ej: 150g / planta'}" required>
          </div>
          <div class="m3-field">
            <label>Operador / Responsable</label>
            <input type="text" name="operador" placeholder="Nombre del trabajador">
          </div>
          <input type="hidden" name="fecha" value="${new Date().toISOString().split('T')[0]}">
          <div class="m3-flex m3-justify-end m3-gap-4 m3-pt-2">
            <button type="submit" class="m3-btn m3-btn-filled m3-shadow-md">Guardar</button>
          </div>
        </div>
      </form>
    `);

    const form = document.getElementById('form-nueva-aplicacion');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const formData = new FormData(form);
      const data = Object.fromEntries(formData.entries());

      try {
        const { error } = await supabase.from('lote_aplicaciones').insert([data]);
        if (error) throw error;
        
        document.getElementById('modal-container').classList.remove('active');
        if (window.Snackbar) window.Snackbar.show('Actividad registrada');
        window.clearScreenCache?.('detalle_lote');
        window.navigateTo('detalle_lote', loteId);
      } catch (err) {
        console.error(err);
        if (window.Snackbar) window.Snackbar.show('Error: ' + err.message, { type: 'error' });
      }
    });
  };
}
