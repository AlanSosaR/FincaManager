import { supabase } from '../supabase.js';
import { Chart, registerables } from 'chart.js';
import { showModal, closeModal } from '../modals.js';
import { showSnackbar } from '../snackbar.js';

Chart.register(...registerables);

// Local state for the screen
let currentAnimal = null;
let vaccines = [];
let weights = [];
let fumigaciones = [];
let lastWeight = 0;
let weightChange = 0;
let weightTrend = 'neutral';
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let weightChart = null;

export async function renderDetalleAnimal(animalId) {
    // Return a skeleton that will be populated by init
    return `
        <div id="da-container" class="da-screen">
            <div style="padding: 40px; text-align: center; color: #666;">
                <div class="spinner" style="margin: 0 auto 16px;"></div>
                Cargando información del animal...
            </div>
        </div>
    `;
}

export async function initDetalleAnimal(animalId) {
    const container = document.getElementById('da-container');
    if (!container) return;

    await loadAllData(animalId, container);
}

async function loadAllData(animalId, container) {
    try {
        const { data: animalData, error: animalError } = await supabase
            .from('ganado')
            .select('*, potreros(nombre)')
            .eq('id', animalId)
            .single();

        if (animalError) throw animalError;
        currentAnimal = animalData;

        const { data: vaccinesData } = await supabase
            .from('animal_vacunas')
            .select('*')
            .eq('animal_id', animalId)
            .order('fecha', { ascending: false });
        
        vaccines = vaccinesData || [];

        const { data: weightsData } = await supabase
            .from('animal_pesajes')
            .select('*')
            .eq('animal_id', animalId)
            .order('fecha', { ascending: true });

        weights = weightsData || [];
        if (weights.length >= 2) {
            const latest = weights[weights.length - 1];
            const previous = weights[weights.length - 2];
            lastWeight = parseFloat(latest.peso);
            const prevW = parseFloat(previous.peso);
            weightChange = lastWeight - prevW;
            weightTrend = weightChange > 0 ? 'positive' : (weightChange < 0 ? 'negative' : 'neutral');
        } else if (weights.length === 1) {
            lastWeight = parseFloat(weights[0].peso);
            weightChange = 0;
            weightTrend = 'neutral';
        } else {
            lastWeight = 0;
            weightChange = 0;
            weightTrend = 'neutral';
        }

        const { data: fumigData } = await supabase
            .from('animal_fumigaciones')
            .select('*')
            .eq('animal_id', animalId)
            .order('fecha', { ascending: false });
        
        fumigaciones = fumigData || [];

        renderFullContent(container, animalId);
    } catch (err) {
        console.error('Error loading animal data:', err);
        container.innerHTML = `
            <div class="error-state" style="padding: 40px; text-align: center;">
                <span class="material-icons" style="font-size: 48px; color: #c62828; margin-bottom: 16px;">error</span>
                <p>Error al cargar datos del animal</p>
                <button class="btn-m3-tonal" onclick="window.location.reload()" style="margin-top: 16px;">Reintentar</button>
            </div>
        `;
    }
}

function renderFullContent(container, animalId) {
    container.innerHTML = `

        <div class="da-hero">
            <div class="da-hero-img-wrap">
                <img src="${currentAnimal.image_url || 'https://images.unsplash.com/photo-1546445317-29f4545e9d53?q=80&w=800'}" alt="${currentAnimal.nombre}">
                <div class="da-hero-img-overlay">
                    <button class="da-img-edit-btn" id="da-edit-photo">
                        <span class="material-icons">photo_camera</span>
                        Cambiar Foto
                    </button>
                </div>
            </div>
            <div class="da-hero-info">
                <div>
                    <div class="da-hero-subtitle">${currentAnimal.raza || 'Raza no especificada'}</div>
                    <h2 class="da-hero-title">${currentAnimal.nombre || 'Sin Nombre'}</h2>
                </div>
                
                <div class="da-badge-row">
                    <div class="da-badge da-badge-surface">
                        <span class="material-icons">location_on</span>
                        Potrero: ${currentAnimal.potreros?.nombre || 'Sin asignar'}
                    </div>
                    <div class="da-badge da-badge-surface">
                        <span class="material-icons">cake</span>
                        Acuquisición: ${currentAnimal.fecha_adquisicion ? new Date(currentAnimal.fecha_adquisicion).toLocaleDateString() : 'N/A'}
                    </div>
                    <div class="da-badge da-badge-surface">
                        <span class="material-icons">${currentAnimal.sexo === 'Macho' ? 'male' : 'female'}</span>
                        ${currentAnimal.sexo || 'Sexo N/A'}
                    </div>
                </div>

                <div class="da-hero-actions">
                    <button class="da-action-btn da-action-edit" id="da-edit-animal">
                        <span class="material-icons">edit</span>
                        Editar Datos
                    </button>
                    <button class="da-action-btn da-action-delete" id="da-delete-animal">
                        <span class="material-icons">delete</span>
                        Eliminar
                    </button>
                </div>
            </div>
        </div>

        <div class="da-stat-grid">
            <div class="da-stat-card">
                <div class="da-stat-icon">
                    <span class="material-icons">vaccines</span>
                </div>
                <div>
                    <div class="da-stat-label">Total Vacunas</div>
                    <div class="da-stat-value">${vaccines.length}</div>
                    <div class="da-stat-sub">Aplicadas con éxito</div>
                </div>
            </div>

            <div class="da-stat-card">
                <div class="da-stat-icon da-stat-icon-secondary">
                    <span class="material-icons">monitor_weight</span>
                </div>
                <div>
                    <div class="da-stat-label">Último Pesaje</div>
                    <div class="da-stat-value">${lastWeight} <small class="da-stat-value-md">${currentAnimal.peso_unidad || 'kg'}</small></div>
                    <div class="da-stat-sub">
                        <span class="da-variation-pill ${weightTrend}">
                            <span class="material-icons">${weightTrend === 'positive' ? 'trending_up' : (weightTrend === 'negative' ? 'trending_down' : 'trending_flat')}</span>
                            ${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} ${currentAnimal.peso_unidad || 'kg'}
                        </span>
                    </div>
                </div>
            </div>

            <div class="da-stat-card">
                <div class="da-stat-icon" style="background: #e1f5fe; color: #0288d1;">
                    <span class="material-icons">bug_report</span>
                </div>
                <div>
                    <div class="da-stat-label">Fumigaciones</div>
                    <div class="da-stat-value">${fumigaciones.length}</div>
                    <div class="da-stat-sub">Tratamientos químicos</div>
                </div>
            </div>
        </div>

        <div class="da-tabs-section">
            <div class="da-tab-bar">
                <button class="da-tab active" data-tab="vacunas">Vacunas y Salud</button>
                <button class="da-tab" data-tab="pesajes">Historial de Pesajes</button>
                <button class="da-tab" data-tab="fumigacion">Fumigación y Químicos</button>
            </div>

            <div class="da-tab-content active" id="da-tab-vacunas">
                <div class="da-calendar-layout">
                    <div class="da-calendar-card">
                        <div class="da-calendar-header">
                            <div class="da-cal-nav">
                                <button class="da-cal-nav-btn" id="prev-month">
                                    <span class="material-icons">chevron_left</span>
                                </button>
                                <h3 id="current-month-display">Mes Año</h3>
                                <button class="da-cal-nav-btn" id="next-month">
                                    <span class="material-icons">chevron_right</span>
                                </button>
                            </div>
                            <button class="btn-m3-tonal" style="padding: 10px 20px;" id="da-add-vaccine">
                                <span class="material-icons">add</span> Registrar Vacuna
                            </button>
                        </div>
                        <div class="da-calendar-grid">
                            <div class="da-cal-day-name">Lun</div>
                            <div class="da-cal-day-name">Mar</div>
                            <div class="da-cal-day-name">Mié</div>
                            <div class="da-cal-day-name">Jue</div>
                            <div class="da-cal-day-name">Vie</div>
                            <div class="da-cal-day-name">Sáb</div>
                            <div class="da-cal-day-name">Dom</div>
                            <div class="da-cal-days-container" id="calendar-days"></div>
                        </div>
                        <div class="da-cal-legend">
                            <div class="da-cal-dot"></div>
                            <span>Días con vacunación</span>
                        </div>
                    </div>

                    <div id="da-day-details-panel">
                        <div class="da-day-details">
                            <div style="text-align: center; color: #aaa; padding: 20px;">
                                <span class="material-icons" style="font-size: 40px; margin-bottom: 8px;">touch_app</span>
                                <p>Selecciona un día en el calendario para ver detalles</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 32px;">
                    <h4 style="font-size: 18px; font-weight: 800; margin-bottom: 16px;">Vacunas del Mes</h4>
                    <div class="da-table-card" id="da-vaccines-table">
                    </div>
                </div>
            </div>

            <div class="da-tab-content" id="da-tab-pesajes">
                <div class="da-chart-card">
                    <div class="da-chart-header">
                        <h3>Evolución de Peso</h3>
                        <button class="btn-m3-tonal" style="padding: 10px 20px;" id="da-add-weight">
                            <span class="material-icons">add</span> Registrar Pesaje
                        </button>
                    </div>
                    <div class="da-chart-area">
                        <canvas id="weightChart"></canvas>
                        <div class="da-chart-watermark">Finca Manager AI</div>
                    </div>
                </div>
                <div class="da-table-card" id="da-weights-table">
                </div>
            </div>

            <div class="da-tab-content" id="da-tab-fumigacion">
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px;">
                    <h4 style="font-size: 18px; font-weight: 800;">Historial de Fumigación</h4>
                    <button class="btn-m3-fill" style="padding: 12px 24px;" id="da-add-fumigacion">
                        <span class="material-icons">add</span> Registrar Aplicación
                    </button>
                </div>
                <div class="da-table-card" id="da-fumigaciones-table">
                </div>
            </div>
        </div>
    `;

    setupEventListeners(animalId, container);
    renderCalendar();
    renderWeightsTable();
    renderFumigacionesTable();
}

function setupEventListeners(animalId, container) {
    // Tab switching
    const tabs = container.querySelectorAll('.da-tab');
    const contents = container.querySelectorAll('.da-tab-content');
    tabs.forEach(tab => {
        tab.addEventListener('click', () => {
            tabs.forEach(t => t.classList.remove('active'));
            contents.forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            const target = tab.getAttribute('data-tab');
            document.getElementById(`da-tab-${target}`).classList.add('active');
            
            if (target === 'pesajes') {
                initChart();
            }
        });
    });

    // Calendar Nav
    document.getElementById('prev-month')?.addEventListener('click', () => { 
        currentMonth--; 
        if(currentMonth < 0) { currentMonth = 11; currentYear--; } 
        renderCalendar(); 
    });
    document.getElementById('next-month')?.addEventListener('click', () => { 
        currentMonth++; 
        if(currentMonth > 11) { currentMonth = 0; currentYear++; } 
        renderCalendar(); 
    });

    // CRUD Actions
    document.getElementById('da-edit-animal')?.addEventListener('click', () => window.navigateTo('nuevo_animal', animalId));
    document.getElementById('da-delete-animal')?.addEventListener('click', () => handleDeleteAnimal(animalId));
    document.getElementById('da-edit-photo')?.addEventListener('click', () => handleEditPhoto(animalId));

    // Registration Actions
    document.getElementById('da-add-vaccine')?.addEventListener('click', () => handleAddVaccine(animalId));
    document.getElementById('da-add-weight')?.addEventListener('click', () => handleAddWeight(animalId));
    document.getElementById('da-add-fumigacion')?.addEventListener('click', () => handleAddFumigacion(animalId));
}



async function handleDeleteAnimal(animalId) {
    if (!confirm('¿Estás seguro de que deseas eliminar este animal? Esta acción no se puede deshacer.')) return;
    
    try {
        const { error } = await supabase.from('ganado').delete().eq('id', animalId);
        if (error) throw error;
        
        const { showSnackbar } = await import('../snackbar.js');
        showSnackbar('Animal eliminado del inventario');
        window.location.hash = '#ganado';
    } catch (err) {
        alert('Error al eliminar: ' + err.message);
    }
}

async function handleEditPhoto(animalId) {
    const { showModal, closeModal } = await import('../modals.js');
    showModal('Cambiar Foto', `
        <div style="padding: 16px; text-align: center;">
            <p style="margin-bottom: 16px;">Ingresa la URL de la nueva imagen:</p>
            <div class="m3-field">
                <input type="url" id="new-photo-url" placeholder="https://..." value="${currentAnimal.image_url || ''}" style="width: 100%;">
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 24px;">
                <button type="button" class="btn-m3-tonal" id="cancel-photo">Cancelar</button>
                <button type="button" class="btn-m3-fill" id="save-photo">Actualizar Foto</button>
            </div>
        </div>
    `);

    document.getElementById('cancel-photo').onclick = closeModal;
    document.getElementById('save-photo').onclick = async () => {
        const url = document.getElementById('new-photo-url').value;
        try {
            const { error } = await supabase.from('ganado').update({ image_url: url }).eq('id', animalId);
            if (error) throw error;
            const { showSnackbar } = await import('../snackbar.js');
            showSnackbar('Foto actualizada');
            closeModal();
            loadAllData(animalId, document.getElementById('da-container'));
        } catch (err) {
            alert('Error: ' + err.message);
        }
    };
}

async function handleAddVaccine(animalId) {
    const { showModal, closeModal } = await import('../modals.js');
    const { showSnackbar } = await import('../snackbar.js');
    showModal('Registrar Vacuna', `
        <form id="form-add-vaccine" style="display: flex; flex-direction: column; gap: 16px;">
            <div class="m3-field">
                <input type="text" name="nombre" placeholder=" " required>
                <label>Nombre de la Vacuna</label>
            </div>
            <div class="m3-field">
                <input type="date" name="fecha" value="${new Date().toISOString().split('T')[0]}" placeholder=" " required>
                <label>Fecha de Aplicación</label>
            </div>
            <div style="display: flex; justify-content: flex-end; gap: 12px; margin-top: 8px;">
                <button type="button" class="btn-m3-text" id="cancel-vaccine">Cancelar</button>
                <button type="submit" class="btn-m3-fill">Registrar</button>
            </div>
        </form>
    `);

    document.getElementById('cancel-vaccine').onclick = closeModal;
    
    document.getElementById('form-add-vaccine').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        
        try {
            const { error } = await supabase.from('animal_vacunas').insert({
                animal_id: animalId,
                nombre: formData.get('nombre'),
                fecha: formData.get('fecha')
            });

            if (error) throw error;

            showSnackbar('Vacunación registrada');
            closeModal();
            await loadAllData(animalId, document.getElementById('da-container'));
        } catch (err) { 
            console.error(err);
            showSnackbar(err.message, 'error');
        }
    };
}

async function handleAddWeight(animalId) {
    const { showModal, closeModal } = await import('../modals.js');
    showModal('Registrar Pesaje', `
        <form id="form-add-weight" style="display: flex; flex-direction: column; gap: 16px;">
            <div class="m3-field">
                <input type="number" step="0.1" name="peso" placeholder=" " required>
                <label>Peso (${currentAnimal.peso_unidad || 'kg'})</label>
            </div>
            <div class="m3-field">
                <input type="date" name="fecha" value="${new Date().toISOString().split('T')[0]}" placeholder=" " required>
                <label>Fecha</label>
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
                <button type="button" class="btn-m3-tonal" id="cancel-weight">Cancelar</button>
                <button type="submit" class="btn-m3-fill">Guardar</button>
            </div>
        </form>
    `);
    
    document.getElementById('cancel-weight').onclick = closeModal;
    document.getElementById('form-add-weight').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        try {
            const pesoVal = formData.get('peso');
            const { error } = await supabase.from('animal_pesajes').insert({
                animal_id: animalId,
                peso: pesoVal,
                fecha: formData.get('fecha')
            });
            if (error) throw error;
            await supabase.from('ganado').update({ peso_actual: pesoVal }).eq('id', animalId);
            const { showSnackbar } = await import('../snackbar.js');
            showSnackbar('Pesaje registrado');
            closeModal();
            loadAllData(animalId, document.getElementById('da-container'));
        } catch (err) { alert(err.message); }
    };
}

async function handleAddFumigacion(animalId) {
    const { showModal, closeModal } = await import('../modals.js');
    showModal('Registrar Fumigación', `
        <form id="form-add-fumigacion" style="display: flex; flex-direction: column; gap: 16px;">
            <div class="m3-field">
                <input type="text" name="producto" placeholder=" " required>
                <label>Producto</label>
            </div>
            <div class="m3-field">
                <input type="date" name="fecha" value="${new Date().toISOString().split('T')[0]}" placeholder=" " required>
                <label>Fecha</label>
            </div>
            <div class="m3-field">
                <input type="text" name="dosis" placeholder=" ">
                <label>Dosis</label>
            </div>
            <div class="m3-field">
                <textarea name="observaciones" placeholder=" "></textarea>
                <label>Observaciones</label>
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
                <button type="button" class="btn-m3-tonal" id="cancel-fumigacion">Cancelar</button>
                <button type="submit" class="btn-m3-fill">Guardar</button>
            </div>
        </form>
    `);
    
    document.getElementById('cancel-fumigacion').onclick = closeModal;
    document.getElementById('form-add-fumigacion').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        try {
            const { error } = await supabase.from('animal_fumigaciones').insert({
                animal_id: animalId,
                producto: formData.get('producto'),
                fecha: formData.get('fecha'),
                dosis: formData.get('dosis'),
                observaciones: formData.get('observaciones')
            });
            if (error) throw error;
            const { showSnackbar } = await import('../snackbar.js');
            showSnackbar('Fumigación registrada');
            closeModal();
            loadAllData(animalId, document.getElementById('da-container'));
        } catch (err) { alert(err.message); }
    };
}

function renderCalendar() {
    const daysContainer = document.getElementById('calendar-days');
    const monthDisplay = document.getElementById('current-month-display');
    if (!daysContainer) return;

    const date = new Date(currentYear, currentMonth, 1);
    monthDisplay.textContent = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    daysContainer.innerHTML = '';
    
    const firstDay = new Date(currentYear, currentMonth, 1).getDay();
    const lastDay = new Date(currentYear, currentMonth + 1, 0).getDate();
    const offset = firstDay === 0 ? 6 : firstDay - 1;

    for (let i = 0; i < offset; i++) {
        daysContainer.innerHTML += `<div class="da-cal-day da-cal-empty"></div>`;
    }

    const monthVaccines = vaccines.filter(v => {
        const [y, m, d] = v.fecha.split('-').map(Number);
        return (m - 1) === currentMonth && y === currentYear;
    });

    for (let day = 1; day <= lastDay; day++) {
        const isToday = day === new Date().getDate() && currentMonth === new Date().getMonth() && currentYear === new Date().getFullYear();
        const dayVaccines = monthVaccines.filter(v => {
            const [, , d] = v.fecha.split('-').map(Number);
            return d === day;
        });
        const hasEvent = dayVaccines.length > 0;
        
        const dayEl = document.createElement('div');
        dayEl.className = `da-cal-day ${isToday ? 'da-cal-today' : ''} ${hasEvent ? 'da-cal-has-event' : ''}`;
        dayEl.innerHTML = `<span>${day}</span>${hasEvent ? '<div class="da-cal-event-dot"></div>' : ''}`;
        dayEl.onclick = () => showDayDetails(day, dayVaccines);
        daysContainer.appendChild(dayEl);
    }
    renderVaccinesTable(monthVaccines);
}

function showDayDetails(day, dayEvents) {
    const panel = document.getElementById('da-day-details-panel');
    if (!panel) return;
    const dateStr = `${day} de ${new Date(currentYear, currentMonth, 1).toLocaleDateString('es-ES', { month: 'long' })}, ${currentYear}`;
    
    if (dayEvents.length === 0) {
        panel.innerHTML = `
            <div class="da-day-details">
                <h4>${dateStr}</h4>
                <div style="text-align: center; color: #aaa; padding: 20px;">
                    <p>No hay eventos registrados para este día.</p>
                </div>
            </div>
        `;
        return;
    }

    panel.innerHTML = `
        <div class="da-day-details">
            <h4>${dateStr}</h4>
            ${dayEvents.map(v => `
                <div class="da-detail-item">
                    <span class="material-icons" style="color: #386a3e">vaccines</span>
                    <div>
                        <div style="font-weight: 700;">${v.nombre}</div>
                        <div style="font-size: 12px; color: #666;">Vacunación registrada</div>
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

function renderVaccinesTable(monthVaccines) {
    const table = document.getElementById('da-vaccines-table');
    if (!table) return;

    if (monthVaccines.length === 0) {
        table.innerHTML = `<div class="da-empty-state">No hay vacunas registradas en este periodo</div>`;
        return;
    }

    table.innerHTML = `
        <div class="da-table-header">
            <div>Vacuna</div>
            <div>Fecha</div>
            <div>Estado</div>
        </div>
        ${monthVaccines.map(v => `
            <div class="da-table-row">
                <div class="da-table-cell da-cell-bold" data-label="Vacuna">${v.nombre}</div>
                <div class="da-table-cell" data-label="Fecha">${new Date(v.fecha).toLocaleDateString()}</div>
                <div class="da-table-cell" data-label="Estado">
                    <span class="da-variation-pill positive">
                        <span class="material-icons">check_circle</span>
                        Aplicada
                    </span>
                </div>
            </div>
        `).join('')}
    `;
}

function renderWeightsTable() {
    const table = document.getElementById('da-weights-table');
    if (!table) return;

    if (weights.length === 0) {
        table.innerHTML = `<div class="da-empty-state">Sin registros de pesaje</div>`;
        return;
    }

    const sortedWeights = [...weights].reverse();
    table.innerHTML = `
        <div class="da-table-header">
            <div>Fecha</div>
            <div>Peso</div>
            <div>Variación</div>
        </div>
        ${sortedWeights.map((w, i) => {
            const next = sortedWeights[i + 1];
            let diff = next ? parseFloat(w.peso) - parseFloat(next.peso) : 0;
            const trend = diff > 0 ? 'positive' : (diff < 0 ? 'negative' : 'neutral');
            return `
                <div class="da-table-row">
                    <div class="da-table-cell" data-label="Fecha">${new Date(w.fecha).toLocaleDateString()}</div>
                    <div class="da-table-cell da-cell-bold" data-label="Peso">${w.peso} ${currentAnimal.peso_unidad || 'kg'}</div>
                    <div class="da-table-cell" data-label="Variación">
                        <span class="da-variation-pill ${trend}">
                            <span class="material-icons">${trend === 'positive' ? 'arrow_upward' : (trend === 'negative' ? 'arrow_downward' : 'horizontal_rule')}</span>
                            ${diff !== 0 ? Math.abs(diff).toFixed(1) : '0.0'}
                        </span>
                    </div>
                </div>
            `;
        }).join('')}
    `;
}

function renderFumigacionesTable() {
    const table = document.getElementById('da-fumigaciones-table');
    if (!table) return;

    if (fumigaciones.length === 0) {
        table.innerHTML = `
            <div class="da-empty-state">
                <span class="material-icons">bug_report</span>
                <p>No hay registros de fumigación o químicos.</p>
            </div>
        `;
        return;
    }

    table.innerHTML = `
        <div class="da-table-header">
            <div>Producto</div>
            <div>Fecha</div>
            <div>Dosis</div>
        </div>
        ${fumigaciones.map(f => `
            <div class="da-table-row">
                <div class="da-table-cell da-cell-bold" data-label="Producto">${f.producto}</div>
                <div class="da-table-cell" data-label="Fecha">${new Date(f.fecha).toLocaleDateString()}</div>
                <div class="da-table-cell" data-label="Dosis">${f.dosis || 'N/A'}</div>
            </div>
            ${f.observaciones ? `<div style="padding: 8px 24px 16px; font-size: 13px; color: #666; font-style: italic; background: #fafafa; border-bottom: 1px solid #eee;">Obs: ${f.observaciones}</div>` : ''}
        `).join('')}
    `;
}

function initChart() {
    const ctx = document.getElementById('weightChart');
    if (!ctx || weightChart) return;

    const labels = weights.map(w => new Date(w.fecha).toLocaleDateString());
    const data = weights.map(w => parseFloat(w.peso));

    weightChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Peso (' + (currentAnimal.peso_unidad || 'kg') + ')',
                data: data,
                borderColor: '#386a3e',
                backgroundColor: 'rgba(56, 106, 62, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#386a3e',
                pointRadius: 4
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: false,
                    grid: { color: 'rgba(0,0,0,0.05)' }
                },
                x: {
                    grid: { display: false }
                }
            }
        }
    });
}

