import { supabase } from '../supabase.js';
import { Chart, registerables } from 'chart.js';
import { showModal, closeModal } from '../modals.js';
import { showSnackbar } from '../snackbar.js';

function getLocalToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

Chart.register(...registerables);

window.confirmVaccine = (vaccineId) => {
    window.Snackbar.confirm('¿Confirmar que la vacuna fue aplicada?', async () => {
        try {
            const { error } = await supabase.from('animal_vacunas').update({ estado: 'Aplicada' }).eq('id', vaccineId);
            if (error) throw error;
            showSnackbar('Vacuna confirmada');
            if (currentAnimal) {
                initDetalleAnimal(currentAnimal.id);
            }
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    });
};

window.cancelVaccine = (vaccineId) => {
    window.Snackbar.confirm('¿Confirmar que la vacuna fue cancelada/no aplicada?', async () => {
        try {
            const { error } = await supabase.from('animal_vacunas').update({ estado: 'Cancelada' }).eq('id', vaccineId);
            if (error) throw error;
            showSnackbar('Vacuna cancelada');
            if (currentAnimal) {
                initDetalleAnimal(currentAnimal.id);
            }
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    });
};

window.confirmFumigacion = (fumigacionId) => {
    window.Snackbar.confirm('¿Confirmar que la fumigación fue aplicada?', async () => {
        try {
            const { error } = await supabase.from('animal_fumigaciones').update({ estado: 'Aplicada' }).eq('id', fumigacionId);
            if (error) throw error;
            showSnackbar('Fumigación confirmada');
            if (currentAnimal) {
                initDetalleAnimal(currentAnimal.id);
            }
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    });
};

window.cancelFumigacion = (fumigacionId) => {
    window.Snackbar.confirm('¿Confirmar que la fumigación fue cancelada/no aplicada?', async () => {
        try {
            const { error } = await supabase.from('animal_fumigaciones').update({ estado: 'Cancelada' }).eq('id', fumigacionId);
            if (error) throw error;
            showSnackbar('Fumigación cancelada');
            if (currentAnimal) {
                initDetalleAnimal(currentAnimal.id);
            }
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    });
};

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
let currentYearFumig = new Date().getFullYear();
let currentMonthFumig = new Date().getMonth();
let weightChart = null;

// Pagination state
const DA_PAGE_SIZE = 5;
let vaccinesPage = 1;
let weightsPage = 1;
let fumigPage = 1;

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
            lastWeight = parseFloat(currentAnimal.peso_actual) || 0;
            weightChange = 0;
            weightTrend = 'neutral';
        }

        const { data: fumigData } = await supabase
            .from('animal_fumigaciones')
            .select('*')
            .eq('animal_id', animalId)
            .order('fecha', { ascending: false });
        
        fumigaciones = fumigData || [];

        // Reset pagination when fresh data is loaded
        vaccinesPage = 1;
        weightsPage = 1;
        fumigPage = 1;

        renderFullContent(container, animalId);
    } catch (err) {
        console.error('Error loading animal data:', err);
        container.innerHTML = `
            <div class="error-state" style="padding: 40px; text-align: center;">
                <span class="material-icons" style="font-size: 48px; color: #ff4103; margin-bottom: 16px;">error</span>
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
            </div>
            <div class="da-hero-info">
                <div>
                    <div class="da-hero-subtitle">${currentAnimal.raza || 'Raza no especificada'}</div>
                    <h2 class="da-hero-title">${currentAnimal.nombre || 'Sin Nombre'}</h2>
                </div>
                
                <div class="da-badge-row">
                    ${currentAnimal.potreros?.nombre ? `
                    <div class="da-badge da-badge-surface">
                        <span class="material-icons">location_on</span>
                        Potrero: ${currentAnimal.potreros.nombre}
                    </div>` : ''}
                    <div class="da-badge da-badge-surface">
                        <span class="material-icons">cake</span>
                        Acuquisición: ${currentAnimal.fecha_adquisicion ? new Date(currentAnimal.fecha_adquisicion).toLocaleDateString() : 'N/A'}
                    </div>
                    <div class="da-badge da-badge-surface">
                        <span class="material-icons">${currentAnimal.sexo === 'Macho' ? 'male' : 'female'}</span>
                        ${currentAnimal.sexo || 'Sexo N/A'}
                    </div>
                </div>

            </div>
        </div>

        <div class="da-stat-grid">
            <div class="da-stat-card da-stat-tab active" data-tab="vacunas" style="cursor:pointer;" title="Ver Vacunas y Salud">
                <div class="da-stat-icon">
                    <span class="material-icons">vaccines</span>
                </div>
                <div>
                    <div class="da-stat-label">Total Vacunas</div>
                    <div class="da-stat-value">${vaccines.length}</div>
                    <div class="da-stat-sub">Aplicadas con éxito</div>
                </div>
            </div>

            <div class="da-stat-card da-stat-tab" data-tab="pesajes" style="cursor:pointer;" title="Ver Historial de Pesajes">
                <div class="da-stat-icon da-stat-icon-secondary">
                    <span class="material-icons">monitor_weight</span>
                </div>
                <div>
                    <div class="da-stat-label">${weights.length <= 1 ? 'Peso Inicial' : 'Último Pesaje'}</div>
                    <div class="da-stat-value">${lastWeight} <small class="da-stat-value-md">${currentAnimal.peso_unidad || 'kg'}</small></div>
                    <div class="da-stat-sub">
                        <span class="da-variation-pill ${weightTrend}">
                            <span class="material-icons">${weightTrend === 'positive' ? 'trending_up' : (weightTrend === 'negative' ? 'trending_down' : 'trending_flat')}</span>
                            ${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} ${currentAnimal.peso_unidad || 'kg'}
                        </span>
                    </div>
                </div>
            </div>

            <div class="da-stat-card da-stat-tab" data-tab="fumigacion" style="cursor:pointer;" title="Ver Fumigación y Químicos">
                <div class="da-stat-icon" style="background: #e1f5fe; color: #2c666e;">
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
                <div class="da-calendar-layout">
                    <div class="da-calendar-card">
                        <div class="da-calendar-header">
                            <div class="da-cal-nav">
                                <button class="da-cal-nav-btn" id="prev-month-fumig">
                                    <span class="material-icons">chevron_left</span>
                                </button>
                                <h3 id="current-month-display-fumig">Mes Año</h3>
                                <button class="da-cal-nav-btn" id="next-month-fumig">
                                    <span class="material-icons">chevron_right</span>
                                </button>
                            </div>

                        </div>
                        <div class="da-calendar-grid">
                            <div class="da-cal-day-name">Lun</div>
                            <div class="da-cal-day-name">Mar</div>
                            <div class="da-cal-day-name">Mié</div>
                            <div class="da-cal-day-name">Jue</div>
                            <div class="da-cal-day-name">Vie</div>
                            <div class="da-cal-day-name">Sáb</div>
                            <div class="da-cal-day-name">Dom</div>
                            <div class="da-cal-days-container" id="calendar-days-fumig"></div>
                        </div>
                        <div class="da-cal-legend">
                            <div class="da-cal-dot" style="background: #2c666e;"></div>
                            <span>Días con fumigación</span>
                        </div>
                    </div>

                    <div id="da-day-details-panel-fumig">
                        <div class="da-day-details">
                            <div style="text-align: center; color: #aaa; padding: 20px;">
                                <span class="material-icons" style="font-size: 40px; margin-bottom: 8px;">touch_app</span>
                                <p>Selecciona un día en el calendario para ver detalles</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div style="margin-top: 32px;">
                    <h4 style="font-size: 18px; font-weight: 800; margin-bottom: 16px;">Fumigaciones del Mes</h4>
                    <div class="da-table-card" id="da-fumigaciones-table">
                    </div>
                </div>
            </div>
        </div>
    `;

    setupEventListeners(animalId, container);
    renderCalendar();
    renderWeightsTable();
    renderCalendarFumig();
}

function setupEventListeners(animalId, container) {
    const contents = container.querySelectorAll('.da-tab-content');
    const statCards = container.querySelectorAll('.da-stat-tab');

    function switchTab(target) {
        contents.forEach(c => c.classList.remove('active'));
        statCards.forEach(c => c.classList.remove('active'));

        const card = Array.from(statCards).find(c => c.getAttribute('data-tab') === target);
        if (card) card.classList.add('active');

        const panel = document.getElementById(`da-tab-${target}`);
        if (panel) panel.classList.add('active');

        if (target === 'pesajes') initChart();
    }

    // Stat cards are the tab switchers
    statCards.forEach(card => {
        card.addEventListener('click', () => switchTab(card.getAttribute('data-tab')));
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

    // Calendar Nav Fumigacion
    document.getElementById('prev-month-fumig')?.addEventListener('click', () => { 
        currentMonthFumig--; 
        if(currentMonthFumig < 0) { currentMonthFumig = 11; currentYearFumig--; } 
        renderCalendarFumig(); 
    });
    document.getElementById('next-month-fumig')?.addEventListener('click', () => { 
        currentMonthFumig++; 
        if(currentMonthFumig > 11) { currentMonthFumig = 0; currentYearFumig++; } 
        renderCalendarFumig(); 
    });

    // Registration Actions
    document.getElementById('da-add-weight')?.addEventListener('click', () => showInlineWeightForm(animalId));
}



async function handleEditPhoto(animalId) {
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
            showSnackbar('Foto actualizada');
            closeModal();
            loadAllData(animalId, document.getElementById('da-container'));
        } catch (err) {
            alert('Error: ' + err.message);
        }
    };
}

async function handleAddVaccine(animalId, defaultDate = null) {
    const dateVal = defaultDate || getLocalToday();
    showModal('Registrar Vacuna', `
        <form id="form-add-vaccine" style="display: flex; flex-direction: column; gap: 16px;">
            <div class="m3-field">
                <input type="text" name="nombre" placeholder=" " required>
                <label>Nombre de la Vacuna</label>
            </div>
            <div class="m3-field">
                <input type="date" name="fecha" value="${dateVal}" placeholder=" " required>
                <label>Fecha de Aplicación</label>
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
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
            const selectedDate = formData.get('fecha');
            const today = getLocalToday();
            const estadoVal = selectedDate >= today ? 'Programada' : 'Aplicada';

            const { error } = await supabase.from('animal_vacunas').insert({
                animal_id: animalId,
                nombre: formData.get('nombre'),
                fecha: selectedDate,
                estado: estadoVal
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
    showModal('Registrar Pesaje', `
        <form id="form-add-weight" style="display: flex; flex-direction: column; gap: 16px;">
            <div class="m3-field">
                <input type="number" step="0.1" name="peso" placeholder=" " required>
                <label>Peso (${currentAnimal.peso_unidad || 'kg'})</label>
            </div>
            <div class="m3-field">
                <input type="date" name="fecha" value="${getLocalToday()}" placeholder=" " required>
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
            showSnackbar('Pesaje registrado');
            closeModal();
            loadAllData(animalId, document.getElementById('da-container'));
        } catch (err) { showSnackbar(err.message, 'error'); }
    };
}

async function handleAddFumigacion(animalId, defaultDate = null) {
    const dateVal = defaultDate || getLocalToday();
    showModal('Registrar Aplicación', `
        <form id="form-add-fumigacion" style="display: flex; flex-direction: column; gap: 16px;">
            <div class="m3-field">
                <input type="text" name="producto" placeholder=" " required>
                <label>Producto</label>
            </div>
            <div class="m3-field">
                <input type="date" name="fecha" value="${dateVal}" placeholder=" " required>
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
            const selectedDate = formData.get('fecha');
            const today = getLocalToday();
            const estadoVal = selectedDate >= today ? 'Programada' : 'Aplicada';

            const { error } = await supabase.from('animal_fumigaciones').insert({
                animal_id: animalId,
                producto: formData.get('producto'),
                fecha: selectedDate,
                dosis: formData.get('dosis'),
                observaciones: formData.get('observaciones'),
                estado: estadoVal
            });
            if (error) throw error;
            showSnackbar('Fumigación registrada');
            closeModal();
            loadAllData(animalId, document.getElementById('da-container'));
        } catch (err) { showSnackbar(err.message, 'error'); }
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
        const hasPending = dayVaccines.some(v => v.estado === 'Programada');
        
        const dayEl = document.createElement('div');
        dayEl.className = `da-cal-day ${isToday ? 'da-cal-today' : ''} ${hasEvent ? 'da-cal-has-event' : ''} ${hasPending ? 'da-cal-has-pending' : ''}`;
        let dotsHtml = '';
        if (hasEvent) {
            if (hasPending) {
                dotsHtml = '<div class="da-cal-pending-dot"></div>';
            } else {
                dotsHtml = '<div class="da-cal-event-dot"></div>';
            }
        }
        dayEl.innerHTML = `<span>${day}</span>${dotsHtml}`;
        dayEl.onclick = () => showDayDetails(day, dayVaccines);
        daysContainer.appendChild(dayEl);
    }
    renderVaccinesTable(monthVaccines, 1);
}

function showDayDetails(day, dayEvents) {
    const panel = document.getElementById('da-day-details-panel');
    if (!panel) return;
    const dateStr = `${day} de ${new Date(currentYear, currentMonth, 1).toLocaleDateString('es-ES', { month: 'long' })}, ${currentYear}`;
    
    const formattedDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isFuture = formattedDate > getLocalToday();
    
    const addBtnHtml = `
        <div style="margin-top: 16px; text-align: center;">
            <select class="da-mobile-tab-select" style="width: auto; min-width: 200px; padding: 10px 36px 10px 16px;" id="da-add-vaccine-specific-date">
                <option value="">Vacuna...</option>
                <option value="Programar">Programar Vacuna</option>
                ${isFuture ? '' : '<option value="Registrar">Registrar Vacuna</option>'}
            </select>
        </div>
    `;

    if (dayEvents.length === 0) {
        panel.innerHTML = `
            <div class="da-day-details">
                <h4>${dateStr}</h4>
                <div style="text-align: center; color: #aaa; padding: 20px;">
                    <p>No hay eventos registrados para este día.</p>
                </div>
                ${addBtnHtml}
            </div>
        `;
    } else {
        panel.innerHTML = `
            <div class="da-day-details">
                <h4>${dateStr}</h4>
                ${dayEvents.map(v => {
                    const currentEstado = v.estado || 'Aplicada';
                    const isPastOrToday = v.fecha <= getLocalToday();
                    let iconColor = '#6b8245';
                    let iconName = 'vaccines';
                    let subtitle = 'Vacunación aplicada';
                    let actionsHtml = '';

                    if (currentEstado === 'Programada') {
                        iconColor = '#f57c00';
                        iconName = 'schedule';
                        subtitle = 'Vacunación programada';
                        // Edit button always shown for scheduled
                        const applyRow = isPastOrToday ? `
                            <button class="btn-m3-tonal" style="padding: 4px 12px; font-size: 12px; height: auto; background: #e4fd97; color: #2d3e2c; flex: 1;" onclick="window.confirmVaccine('${v.id}')">
                                <span class="material-icons" style="font-size: 16px;">check</span> Aplicar
                            </button>
                            <button class="btn-m3-tonal" style="padding: 4px 12px; font-size: 12px; height: auto; background: #ffe2db; color: #ff4103; flex: 1;" onclick="window.cancelVaccine('${v.id}')">
                                <span class="material-icons" style="font-size: 16px;">close</span> Cancelar
                            </button>` : '';
                        actionsHtml = `
                            <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                                ${applyRow}
                                <button class="btn-m3-tonal" style="padding: 4px 12px; font-size: 12px; height: auto; background: #b9f2fb; color: #2c666e; flex: 1;" onclick="window.editVaccine('${v.id}')">
                                    <span class="material-icons" style="font-size: 16px;">edit</span> Editar
                                </button>
                            </div>
                        `;
                    } else if (currentEstado === 'Cancelada') {
                        iconColor = '#ff4103';
                        iconName = 'cancel';
                        subtitle = 'Vacunación cancelada';
                    }

                    return `
                    <div class="da-detail-item" style="display: block;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span class="material-icons" style="color: ${iconColor}">${iconName}</span>
                            <div>
                                <div style="font-weight: 700;">${v.nombre}</div>
                                <div style="font-size: 12px; color: #666;">
                                    ${currentEstado === 'Programada' ? '<span class="da-variation-pill pending" style="padding: 2px 6px; font-size: 10px; margin-right: 6px;">Programada</span>' : ''}
                                    ${currentEstado === 'Cancelada' ? '<span class="da-variation-pill negative" style="padding: 2px 6px; font-size: 10px; margin-right: 6px;">Cancelada</span>' : ''}
                                    ${subtitle}
                                </div>
                            </div>
                        </div>
                        ${v.dosis ? `<div style="margin-top: 4px; font-size: 12px; color: #555;">Dosis: ${v.dosis}</div>` : ''}
                        ${v.observaciones ? `<div style="margin-top: 4px; font-size: 12px; color: #555; font-style: italic;">Obs: ${v.observaciones}</div>` : ''}
                        ${actionsHtml}
                    </div>
                    `;
                }).join('')}
                ${addBtnHtml}
            </div>
        `;
    }


    const sel = document.getElementById('da-add-vaccine-specific-date');
    if (sel) {
        sel.onchange = () => {
            const tipo = sel.value;
            if (tipo && currentAnimal && currentAnimal.id) {
                showInlineVaccineForm(currentAnimal.id, formattedDate, dayEvents, tipo);
                sel.value = '';
            }
        };
    }
}

function showInlineVaccineForm(animalId, defaultDate, existingEvents = [], tipo = 'Programar') {
    const panel = document.getElementById('da-day-details-panel');
    if (!panel) return;

    const dateStr = new Date(defaultDate + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

    panel.innerHTML = `
        <div class="da-day-details" style="display:flex; flex-direction:column; gap:16px;">
            <h4>${dateStr}</h4>
            <form id="form-inline-vaccine" style="display: flex; flex-direction: column; gap: 14px;">
                <div class="m3-field">
                    <input type="text" name="nombre" id="inline-vaccine-nombre" placeholder=" " required autocomplete="off">
                    <label>Nombre de la Vacuna</label>
                </div>
                <div class="m3-field">
                    <input type="date" name="fecha" id="inline-vaccine-fecha" value="${defaultDate}" placeholder=" " required>
                    <label>Fecha</label>
                </div>
                <div class="m3-field">
                    <input type="text" name="dosis" id="inline-vaccine-dosis" placeholder=" " autocomplete="off">
                    <label>Dosis (opcional)</label>
                </div>
                <div class="m3-field">
                    <textarea name="observaciones" id="inline-vaccine-obs" placeholder=" " rows="2"></textarea>
                    <label>Observaciones (opcional)</label>
                </div>
                <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
                    <button type="button" class="btn-m3-text" id="cancel-inline-vaccine">Cancelar</button>
                    <button type="submit" class="btn-m3-fill">Guardar</button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('cancel-inline-vaccine').onclick = () => {
        showDayDetails(
            parseInt(defaultDate.split('-')[2]),
            existingEvents
        );
    };

    document.getElementById('form-inline-vaccine').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        try {
            const selectedDate = formData.get('fecha');
            if (tipo === 'Registrar' && selectedDate > getLocalToday()) {
                showSnackbar('No puedes registrar una vacuna en una fecha futura. Usa "Programar" en su lugar.', 'error');
                return;
            }
            const estadoVal = tipo === 'Registrar' ? 'Aplicada' : 'Programada';

            const payload = {
                animal_id: animalId,
                nombre: formData.get('nombre'),
                fecha: selectedDate,
                estado: estadoVal
            };
            const dosis = formData.get('dosis')?.trim();
            if (dosis) payload.dosis = dosis;
            const obs = formData.get('observaciones')?.trim();
            if (obs) payload.observaciones = obs;
            const { error } = await supabase.from('animal_vacunas').insert(payload);
            if (error) throw error;

            showSnackbar(tipo === 'Registrar' ? 'Vacuna registrada ✓' : 'Vacuna programada ✓');
            await loadAllData(animalId, document.getElementById('da-container'));
        } catch (err) {
            console.error(err);
            showSnackbar(err.message, 'error');
        }
    };
}


// ─── Inline Fumigacion Form ──────────────────────────────────────────────────
function showInlineFumigForm(animalId, defaultDate, existingEvents = [], tipo = 'Programar') {
    const panel = document.getElementById('da-day-details-panel-fumig');
    if (!panel) return;

    const dateStr = new Date(defaultDate + 'T12:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' });

    panel.innerHTML = `
        <div class="da-day-details" style="display:flex; flex-direction:column; gap:16px;">
            <h4>${dateStr}</h4>
            <form id="form-inline-fumig" style="display: flex; flex-direction: column; gap: 14px;">
                <div class="m3-field">
                    <input type="text" name="producto" id="inline-fumig-producto" placeholder=" " required autocomplete="off">
                    <label>Producto / Químico</label>
                </div>
                <div class="m3-field">
                    <input type="text" name="dosis" id="inline-fumig-dosis" placeholder=" " autocomplete="off">
                    <label>Dosis (opcional)</label>
                </div>
                <div class="m3-field">
                    <input type="date" name="fecha" id="inline-fumig-fecha" value="${defaultDate}" placeholder=" " required>
                    <label>Fecha</label>
                </div>
                <div class="m3-field">
                    <textarea name="observaciones" id="inline-fumig-obs" placeholder=" " rows="2"></textarea>
                    <label>Observaciones</label>
                </div>
                <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
                    <button type="button" class="btn-m3-text" id="cancel-inline-fumig">Cancelar</button>
                    <button type="submit" class="btn-m3-fill">Guardar</button>
                </div>
            </form>
        </div>
    `;

    document.getElementById('cancel-inline-fumig').onclick = () => {
        const day = parseInt(defaultDate.split('-')[2]);
        showDayDetailsFumig(day, existingEvents);
    };

    document.getElementById('form-inline-fumig').onsubmit = async (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        try {
            const selectedDate = formData.get('fecha');
            if (tipo === 'Registrar' && selectedDate > getLocalToday()) {
                showSnackbar('No puedes registrar una fumigación en una fecha futura. Usa "Programar" en su lugar.', 'error');
                return;
            }
            const estadoVal = tipo === 'Registrar' ? 'Aplicada' : 'Programada';

            const payload = {
                animal_id: animalId,
                producto: formData.get('producto'),
                fecha: selectedDate,
                estado: estadoVal
            };
            const dosis = formData.get('dosis')?.trim();
            if (dosis) payload.dosis = dosis;
            const obs = formData.get('observaciones')?.trim();
            if (obs) payload.observaciones = obs;

            const { error } = await supabase.from('animal_fumigaciones').insert(payload);
            if (error) throw error;

            showSnackbar(tipo === 'Registrar' ? 'Fumigación registrada ✓' : 'Fumigación programada ✓');
            await loadAllData(animalId, document.getElementById('da-container'));
        } catch (err) {
            console.error(err);
            showSnackbar(err.message, 'error');
        }
    };
}

// ─── Inline Weight Form ──────────────────────────────────────────────────────
function showInlineWeightForm(animalId) {
    // Show form above the weights table
    const tableCard = document.getElementById('da-weights-table');
    if (!tableCard) return;

    // Insert a temporary inline form before the table card
    let formContainer = document.getElementById('da-inline-weight-form');
    if (formContainer) formContainer.remove();

    formContainer = document.createElement('div');
    formContainer.id = 'da-inline-weight-form';
    formContainer.className = 'da-day-details';
    formContainer.style.cssText = 'margin-bottom: 16px; padding: 20px; display:flex; flex-direction:column; gap:14px;';
    formContainer.innerHTML = `
        <h4 style="font-size:16px; font-weight:700; color:var(--primary-container);">Nuevo Pesaje</h4>
        <form id="form-inline-weight" style="display: flex; flex-direction: column; gap: 14px;">
            <div class="m3-field">
                <input type="number" step="0.1" name="peso" id="inline-weight-peso" placeholder=" " required>
                <label>Peso (${currentAnimal?.peso_unidad || 'kg'})</label>
            </div>
            <div class="m3-field">
                <input type="date" name="fecha" id="inline-weight-fecha" value="${getLocalToday()}" placeholder=" " required>
                <label>Fecha</label>
            </div>
            <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
                <button type="button" class="btn-m3-text" id="cancel-inline-weight">Cancelar</button>
                <button type="submit" class="btn-m3-fill">Guardar Pesaje</button>
            </div>
        </form>
    `;

    tableCard.parentNode.insertBefore(formContainer, tableCard);

    document.getElementById('cancel-inline-weight').onclick = () => {
        formContainer.remove();
    };

    document.getElementById('form-inline-weight').onsubmit = async (e) => {
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
            showSnackbar('Pesaje registrado ✓');
            await loadAllData(animalId, document.getElementById('da-container'));
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    };
}

function renderVaccinesTable(allVaccines, page) {
    const table = document.getElementById('da-vaccines-table');
    if (!table) return;

    vaccinesPage = page || vaccinesPage;
    const total = allVaccines.length;
    const totalPages = Math.ceil(total / DA_PAGE_SIZE);
    const from = (vaccinesPage - 1) * DA_PAGE_SIZE;
    const paged = allVaccines.slice(from, from + DA_PAGE_SIZE);

    if (total === 0) {
        table.innerHTML = `<div class="da-empty-state">No hay vacunas registradas en este periodo</div>`;
        return;
    }

    const today = getLocalToday();

    const rowsHtml = paged.map(v => {
        const isPastOrToday = v.fecha <= today;
        const currentEstado = v.estado || 'Aplicada';
        let estadoHtml = '';
        
        if (currentEstado === 'Programada') {
            const applyBtn = isPastOrToday ? `
                <button title="Aplicar" class="btn-m3-tonal" style="padding: 4px 8px; font-size: 12px; height: auto; background: #e4fd97; color: #2d3e2c;" onclick="window.confirmVaccine('${v.id}')">
                    <span class="material-icons" style="font-size: 16px;">check</span>
                </button>
                <button title="Cancelar" class="btn-m3-tonal" style="padding: 4px 8px; font-size: 12px; height: auto; background: #ffe2db; color: #ff4103;" onclick="window.cancelVaccine('${v.id}')">
                    <span class="material-icons" style="font-size: 16px;">close</span>
                </button>` : `
                <span class="da-variation-pill pending" style="margin-right: 4px;">
                    <span class="material-icons">schedule</span>
                    Programada
                </span>`;
            estadoHtml = `
                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                    ${applyBtn}
                    <button title="Editar" class="btn-m3-tonal" style="padding: 4px 8px; font-size: 12px; height: auto; background: #b9f2fb; color: #2c666e;" onclick="window.editVaccine('${v.id}')">
                        <span class="material-icons" style="font-size: 16px;">edit</span>
                    </button>
                </div>
            `;
        } else if (currentEstado === 'Cancelada') {
            estadoHtml = `
                <span class="da-variation-pill negative">
                    <span class="material-icons">cancel</span>
                    Cancelada
                </span>
            `;
        } else {
            estadoHtml = `
                <span class="da-variation-pill positive">
                    <span class="material-icons">check_circle</span>
                    Aplicada
                </span>
            `;
        }

        return `
            <div class="da-table-row">
                <div class="da-table-cell da-cell-bold" data-label="Vacuna">${v.nombre}</div>
                <div class="da-table-cell" data-label="Fecha">${new Date(v.fecha).toLocaleDateString()}</div>
                <div class="da-table-cell" data-label="Estado">
                    ${estadoHtml}
                </div>
            </div>
        `;
    }).join('');

    const paginationHtml = totalPages > 1 ? `
        <div class="da-pagination">
            <span class="da-pagination-info">
                Mostrando <strong>${from + 1}–${Math.min(from + DA_PAGE_SIZE, total)}</strong> de <strong>${total}</strong>
            </span>
            <div class="da-pagination-controls">
                <button class="da-pagination-btn" id="vac-prev-btn" ${vaccinesPage <= 1 ? 'disabled' : ''} title="Anterior">
                    <span class="material-icons">chevron_left</span>
                </button>
                <span style="font-size:14px; font-weight:600; color: var(--on-surface);">${vaccinesPage} / ${totalPages}</span>
                <button class="da-pagination-btn" id="vac-next-btn" ${vaccinesPage >= totalPages ? 'disabled' : ''} title="Siguiente">
                    <span class="material-icons">chevron_right</span>
                </button>
            </div>
        </div>
    ` : '';

    table.innerHTML = `
        <div class="da-table-header">
            <div>Vacuna</div>
            <div>Fecha</div>
            <div>Estado</div>
        </div>
        ${rowsHtml}
        ${paginationHtml}
    `;

    // Bind pagination buttons
    const prevBtn = document.getElementById('vac-prev-btn');
    const nextBtn = document.getElementById('vac-next-btn');
    if (prevBtn) prevBtn.onclick = () => { if (vaccinesPage > 1) renderVaccinesTable(allVaccines, vaccinesPage - 1); };
    if (nextBtn) nextBtn.onclick = () => { if (vaccinesPage < totalPages) renderVaccinesTable(allVaccines, vaccinesPage + 1); };
}

function renderWeightsTable(page) {
    const table = document.getElementById('da-weights-table');
    if (!table) return;

    weightsPage = page || weightsPage;
    const sortedWeights = [...weights].reverse();
    const total = sortedWeights.length;
    const totalPages = Math.ceil(total / DA_PAGE_SIZE);
    const from = (weightsPage - 1) * DA_PAGE_SIZE;
    const paged = sortedWeights.slice(from, from + DA_PAGE_SIZE);

    if (total === 0) {
        table.innerHTML = `<div class="da-empty-state">Sin registros de pesaje</div>`;
        return;
    }

    const rowsHtml = paged.map((w, i) => {
        const globalIdx = from + i;
        const next = sortedWeights[globalIdx + 1];
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
    }).join('');

    const paginationHtml = totalPages > 1 ? `
        <div class="da-pagination">
            <span class="da-pagination-info">
                Mostrando <strong>${from + 1}–${Math.min(from + DA_PAGE_SIZE, total)}</strong> de <strong>${total}</strong>
            </span>
            <div class="da-pagination-controls">
                <button class="da-pagination-btn" id="wt-prev-btn" ${weightsPage <= 1 ? 'disabled' : ''} title="Anterior">
                    <span class="material-icons">chevron_left</span>
                </button>
                <span style="font-size:14px; font-weight:600; color: var(--on-surface);">${weightsPage} / ${totalPages}</span>
                <button class="da-pagination-btn" id="wt-next-btn" ${weightsPage >= totalPages ? 'disabled' : ''} title="Siguiente">
                    <span class="material-icons">chevron_right</span>
                </button>
            </div>
        </div>
    ` : '';

    table.innerHTML = `
        <div class="da-table-header">
            <div>Fecha</div>
            <div>Peso</div>
            <div>Variación</div>
        </div>
        ${rowsHtml}
        ${paginationHtml}
    `;

    // Bind pagination buttons
    const prevBtn = document.getElementById('wt-prev-btn');
    const nextBtn = document.getElementById('wt-next-btn');
    if (prevBtn) prevBtn.onclick = () => { if (weightsPage > 1) renderWeightsTable(weightsPage - 1); };
    if (nextBtn) nextBtn.onclick = () => { if (weightsPage < totalPages) renderWeightsTable(weightsPage + 1); };
}

function renderFumigacionesTable(allFumigaciones, page) {
    const table = document.getElementById('da-fumigaciones-table');
    if (!table) return;

    fumigPage = page || fumigPage;
    const total = allFumigaciones ? allFumigaciones.length : 0;
    const totalPages = Math.ceil(total / DA_PAGE_SIZE);
    const from = (fumigPage - 1) * DA_PAGE_SIZE;
    const paged = (allFumigaciones || []).slice(from, from + DA_PAGE_SIZE);

    if (total === 0) {
        table.innerHTML = `
            <div class="da-empty-state">
                <span class="material-icons">bug_report</span>
                <p>No hay registros de fumigación o químicos en este periodo.</p>
            </div>
        `;
        return;
    }

    const today = getLocalToday();

    const rowsHtml = paged.map(f => {
        const isPastOrToday = f.fecha <= today;
        const currentEstado = f.estado || 'Aplicada';
        let estadoHtml = '';
        
        if (currentEstado === 'Programada') {
            const applyBtnF = isPastOrToday ? `
                <button title="Aplicar" class="btn-m3-tonal" style="padding: 4px 8px; font-size: 12px; height: auto; background: #e4fd97; color: #2d3e2c;" onclick="window.confirmFumigacion('${f.id}')">
                    <span class="material-icons" style="font-size: 16px;">check</span>
                </button>
                <button title="Cancelar" class="btn-m3-tonal" style="padding: 4px 8px; font-size: 12px; height: auto; background: #ffe2db; color: #ff4103;" onclick="window.cancelFumigacion('${f.id}')">
                    <span class="material-icons" style="font-size: 16px;">close</span>
                </button>` : `
                <span class="da-variation-pill pending" style="margin-right: 4px;">
                    <span class="material-icons">schedule</span>
                    Programada
                </span>`;
            estadoHtml = `
                <div style="display: flex; gap: 6px; align-items: center; flex-wrap: wrap;">
                    ${applyBtnF}
                    <button title="Editar" class="btn-m3-tonal" style="padding: 4px 8px; font-size: 12px; height: auto; background: #b9f2fb; color: #2c666e;" onclick="window.editFumigacion('${f.id}')">
                        <span class="material-icons" style="font-size: 16px;">edit</span>
                    </button>
                </div>
            `;
        } else if (currentEstado === 'Cancelada') {
            estadoHtml = `
                <span class="da-variation-pill negative">
                    <span class="material-icons">cancel</span>
                    Cancelada
                </span>
            `;
        } else {
            estadoHtml = `
                <span class="da-variation-pill positive">
                    <span class="material-icons">check_circle</span>
                    Aplicada
                </span>
            `;
        }

        return `
            <div class="da-table-row" style="grid-template-columns: 2fr 1fr 1fr 1fr;">
                <div class="da-table-cell da-cell-bold" data-label="Producto">${f.producto}</div>
                <div class="da-table-cell" data-label="Fecha">${new Date(f.fecha).toLocaleDateString()}</div>
                <div class="da-table-cell" data-label="Dosis">${f.dosis || 'N/A'}</div>
                <div class="da-table-cell" data-label="Estado">${estadoHtml}</div>
            </div>
            ${f.observaciones ? `<div style="padding: 8px 24px 16px; font-size: 13px; color: #666; font-style: italic; background: #fafafa; border-bottom: 1px solid #eee;">Obs: ${f.observaciones}</div>` : ''}
        `;
    }).join('');

    const paginationHtml = totalPages > 1 ? `
        <div class="da-pagination" style="grid-column: 1 / -1;">
            <span class="da-pagination-info">
                Mostrando <strong>${from + 1}–${Math.min(from + DA_PAGE_SIZE, total)}</strong> de <strong>${total}</strong>
            </span>
            <div class="da-pagination-controls">
                <button class="da-pagination-btn" id="fum-prev-btn" ${fumigPage <= 1 ? 'disabled' : ''} title="Anterior">
                    <span class="material-icons">chevron_left</span>
                </button>
                <span style="font-size:14px; font-weight:600; color: var(--on-surface);">${fumigPage} / ${totalPages}</span>
                <button class="da-pagination-btn" id="fum-next-btn" ${fumigPage >= totalPages ? 'disabled' : ''} title="Siguiente">
                    <span class="material-icons">chevron_right</span>
                </button>
            </div>
        </div>
    ` : '';

    table.innerHTML = `
        <div class="da-table-header" style="grid-template-columns: 2fr 1fr 1fr 1fr;">
            <div>Producto</div>
            <div>Fecha</div>
            <div>Dosis</div>
            <div>Estado</div>
        </div>
        ${rowsHtml}
        ${paginationHtml}
    `;

    // Bind pagination buttons
    const prevBtn = document.getElementById('fum-prev-btn');
    const nextBtn = document.getElementById('fum-next-btn');
    if (prevBtn) prevBtn.onclick = () => { if (fumigPage > 1) renderFumigacionesTable(allFumigaciones, fumigPage - 1); };
    if (nextBtn) nextBtn.onclick = () => { if (fumigPage < totalPages) renderFumigacionesTable(allFumigaciones, fumigPage + 1); };
}

function renderCalendarFumig() {
    const daysContainer = document.getElementById('calendar-days-fumig');
    const monthDisplay = document.getElementById('current-month-display-fumig');
    if (!daysContainer) return;

    const date = new Date(currentYearFumig, currentMonthFumig, 1);
    monthDisplay.textContent = date.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
    daysContainer.innerHTML = '';
    
    const firstDay = new Date(currentYearFumig, currentMonthFumig, 1).getDay();
    const lastDay = new Date(currentYearFumig, currentMonthFumig + 1, 0).getDate();
    const offset = firstDay === 0 ? 6 : firstDay - 1;

    for (let i = 0; i < offset; i++) {
        daysContainer.innerHTML += `<div class="da-cal-day da-cal-empty"></div>`;
    }

    const monthFumigaciones = fumigaciones.filter(f => {
        const [y, m, d] = f.fecha.split('-').map(Number);
        return (m - 1) === currentMonthFumig && y === currentYearFumig;
    });

    for (let day = 1; day <= lastDay; day++) {
        const isToday = day === new Date().getDate() && currentMonthFumig === new Date().getMonth() && currentYearFumig === new Date().getFullYear();
        const dayFumigaciones = monthFumigaciones.filter(f => {
            const [, , d] = f.fecha.split('-').map(Number);
            return d === day;
        });
        const hasEvent = dayFumigaciones.length > 0;
        const hasPending = dayFumigaciones.some(f => f.estado === 'Programada');
        
        const dayEl = document.createElement('div');
        dayEl.className = `da-cal-day ${isToday ? 'da-cal-today' : ''} ${hasEvent ? 'da-cal-has-event' : ''} ${hasPending ? 'da-cal-has-pending' : ''}`;
        let dotsHtml = '';
        if (hasEvent) {
            if (hasPending) {
                dotsHtml = '<div class="da-cal-pending-dot"></div>';
            } else {
                dotsHtml = '<div class="da-cal-event-dot" style="background: #2c666e;"></div>';
            }
        }
        dayEl.innerHTML = `<span>${day}</span>${dotsHtml}`;
        dayEl.onclick = () => showDayDetailsFumig(day, dayFumigaciones);
        daysContainer.appendChild(dayEl);
    }
    renderFumigacionesTable(monthFumigaciones, 1);
}

function showDayDetailsFumig(day, dayEvents) {
    const panel = document.getElementById('da-day-details-panel-fumig');
    if (!panel) return;
    const dateStr = `${day} de ${new Date(currentYearFumig, currentMonthFumig, 1).toLocaleDateString('es-ES', { month: 'long' })}, ${currentYearFumig}`;
    
    const formattedDate = `${currentYearFumig}-${String(currentMonthFumig + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const isFuture = formattedDate > getLocalToday();
    
    const addBtnHtml = `
        <div style="margin-top: 16px; text-align: center;">
            <select class="da-mobile-tab-select" style="width: auto; min-width: 200px; padding: 10px 36px 10px 16px;" id="da-add-fumigacion-specific-date">
                <option value="">Aplicación...</option>
                <option value="Programar">Programar Aplicación</option>
                ${isFuture ? '' : '<option value="Registrar">Registrar Aplicación</option>'}
            </select>
        </div>
    `;

    if (dayEvents.length === 0) {
        panel.innerHTML = `
            <div class="da-day-details">
                <h4>${dateStr}</h4>
                <div style="text-align: center; color: #aaa; padding: 20px;">
                    <p>No hay eventos registrados para este día.</p>
                </div>
                ${addBtnHtml}
            </div>
        `;
    } else {
        panel.innerHTML = `
            <div class="da-day-details">
                <h4>${dateStr}</h4>
                ${dayEvents.map(f => {
                    const currentEstado = f.estado || 'Aplicada';
                    const isPastOrToday = f.fecha <= getLocalToday();
                    let iconColor = '#2c666e';
                    let iconName = 'bug_report';
                    let subtitle = 'Fumigación aplicada';
                    let actionsHtml = '';

                    if (currentEstado === 'Programada') {
                        iconColor = '#f57c00';
                        iconName = 'schedule';
                        subtitle = 'Fumigación programada';
                        const applyRowF = isPastOrToday ? `
                            <button class="btn-m3-tonal" style="padding: 4px 12px; font-size: 12px; height: auto; background: #e4fd97; color: #2d3e2c; flex: 1;" onclick="window.confirmFumigacion('${f.id}')">
                                <span class="material-icons" style="font-size: 16px;">check</span> Aplicar
                            </button>
                            <button class="btn-m3-tonal" style="padding: 4px 12px; font-size: 12px; height: auto; background: #ffe2db; color: #ff4103; flex: 1;" onclick="window.cancelFumigacion('${f.id}')">
                                <span class="material-icons" style="font-size: 16px;">close</span> Cancelar
                            </button>` : '';
                        actionsHtml = `
                            <div style="display: flex; gap: 8px; margin-top: 8px; flex-wrap: wrap;">
                                ${applyRowF}
                                <button class="btn-m3-tonal" style="padding: 4px 12px; font-size: 12px; height: auto; background: #b9f2fb; color: #2c666e; flex: 1;" onclick="window.editFumigacion('${f.id}')">
                                    <span class="material-icons" style="font-size: 16px;">edit</span> Editar
                                </button>
                            </div>
                        `;
                    } else if (currentEstado === 'Cancelada') {
                        iconColor = '#ff4103';
                        iconName = 'cancel';
                        subtitle = 'Fumigación cancelada';
                    }

                    return `
                    <div class="da-detail-item" style="display: block;">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <span class="material-icons" style="color: ${iconColor}">${iconName}</span>
                            <div>
                                <div style="font-weight: 700;">${f.producto}</div>
                                <div style="font-size: 12px; color: #666;">
                                    ${currentEstado === 'Programada' ? '<span class="da-variation-pill pending" style="padding: 2px 6px; font-size: 10px; margin-right: 6px;">Programada</span>' : ''}
                                    ${currentEstado === 'Cancelada' ? '<span class="da-variation-pill negative" style="padding: 2px 6px; font-size: 10px; margin-right: 6px;">Cancelada</span>' : ''}
                                    ${subtitle}
                                </div>
                            </div>
                        </div>
                        ${f.dosis ? `<div style="margin-top: 4px; font-size: 12px; color: #555;">Dosis: ${f.dosis}</div>` : ''}
                        ${f.observaciones ? `<div style="margin-top: 4px; font-size: 12px; color: #555; font-style: italic;">Obs: ${f.observaciones}</div>` : ''}
                        ${actionsHtml}
                    </div>
                    `;
                }).join('')}
                ${addBtnHtml}
            </div>
        `;
    }

    const sel = document.getElementById('da-add-fumigacion-specific-date');
    if (sel) {
        sel.onchange = () => {
            const tipo = sel.value;
            if (tipo && currentAnimal && currentAnimal.id) {
                showInlineFumigForm(currentAnimal.id, formattedDate, dayEvents, tipo);
                sel.value = '';
            }
        };
    }
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
                borderColor: '#6b8245',
                backgroundColor: 'rgba(107, 130, 69, 0.1)',
                borderWidth: 3,
                tension: 0.4,
                fill: true,
                pointBackgroundColor: '#6b8245',
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

// ─── Edit Vaccine ────────────────────────────────────────────────────────────
async function handleEditVaccine(vaccineId) {
    const v = vaccines.find(x => x.id === vaccineId);
    if (!v) return;

    const container = document.getElementById('da-day-details-panel');
    if (!container) return;

    // Guardamos el contenido original para el botón Cancelar
    const originalContent = container.innerHTML;

    container.innerHTML = `
        <div class="da-inline-form-card" style="margin-top:0; border:1px dashed #ccc; padding:16px; border-radius:12px; background:rgba(0,0,0,0.02);">
            <h3 style="margin-top:0; margin-bottom:16px; font-size:1.1rem; color:#6b8245;">Editar Vacuna</h3>
            <form id="form-edit-vaccine" style="display: flex; flex-direction: column; gap: 16px;">
                <div class="m3-field">
                    <input type="text" name="nombre" value="${v.nombre || ''}" placeholder=" " required autocomplete="off">
                    <label>Nombre de la Vacuna</label>
                </div>
                <div class="m3-field">
                    <input type="date" name="fecha" value="${v.fecha || ''}" placeholder=" " required>
                    <label>Fecha Programada</label>
                </div>
                <div class="m3-field">
                    <input type="text" name="dosis" value="${v.dosis || ''}" placeholder=" " autocomplete="off">
                    <label>Dosis (opcional)</label>
                </div>
                <div class="m3-field">
                    <textarea name="observaciones" placeholder=" " rows="2">${v.observaciones || ''}</textarea>
                    <label>Observaciones (opcional)</label>
                </div>
                
                <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 8px; flex-wrap: wrap;">
                    <button type="button" class="btn-m3-tonal" id="delete-edit-vaccine" style="background:#ffe2db; color:#ff4103;">
                        <span class="material-icons" style="font-size:18px;">delete</span> Eliminar
                    </button>
                    <div style="display:flex; gap:12px;">
                        <button type="button" class="btn-m3-text" id="cancel-edit-vaccine">Cancelar</button>
                        <button type="submit" class="btn-m3-fill">Guardar</button>
                    </div>
                </div>
            </form>
        </div>
    `;

    document.getElementById('cancel-edit-vaccine').onclick = () => {
        container.innerHTML = originalContent;
        // Re-vincular eventos si es necesario o simplemente recargar
        renderDayDetails(v.fecha); 
    };

    document.getElementById('delete-edit-vaccine').onclick = () => {
        window.Snackbar.confirm(
            '¿Eliminar esta vacuna programada?',
            async () => {
                try {
                    const { error } = await supabase.from('animal_vacunas').delete().eq('id', vaccineId);
                    if (error) throw error;
                    showSnackbar('Vacuna eliminada');
                    await loadAllData(currentAnimal.id, document.getElementById('da-container'));
                } catch (err) {
                    showSnackbar(err.message, 'error');
                }
            },
            { confirmLabel: 'Eliminar', cancelLabel: 'Cancelar' }
        );
    };

    document.getElementById('form-edit-vaccine').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const newFecha = fd.get('fecha');
        const today = getLocalToday();
        const newEstado = newFecha >= today ? 'Programada' : 'Aplicada';
        
        try {
            const payload = {
                nombre: fd.get('nombre'),
                fecha: newFecha,
                dosis: fd.get('dosis') || null,
                observaciones: fd.get('observaciones') || null,
                estado: newEstado
            };
            
            const { error } = await supabase.from('animal_vacunas').update(payload).eq('id', vaccineId);
            if (error) throw error;
            
            showSnackbar('Vacuna actualizada ✓');
            await loadAllData(currentAnimal.id, document.getElementById('da-container'));
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    };
}
window.editVaccine = (id) => handleEditVaccine(id);

// ─── Edit Fumigacion ─────────────────────────────────────────────────────────
async function handleEditFumigacion(fumigacionId) {
    const f = fumigaciones.find(x => x.id === fumigacionId);
    if (!f) return;

    const container = document.getElementById('da-day-details-panel-fumig');
    if (!container) return;

    const originalContent = container.innerHTML;

    container.innerHTML = `
        <div class="da-inline-form-card" style="margin-top:0; border:1px dashed #ccc; padding:16px; border-radius:12px; background:rgba(0,0,0,0.02);">
            <h3 style="margin-top:0; margin-bottom:16px; font-size:1.1rem; color:#6b8245;">Editar Fumigación</h3>
            <form id="form-edit-fumigacion" style="display: flex; flex-direction: column; gap: 16px;">
                <div class="m3-field">
                    <input type="text" name="producto" value="${f.producto || ''}" placeholder=" " required autocomplete="off">
                    <label>Producto</label>
                </div>
                <div class="m3-field">
                    <input type="date" name="fecha" value="${f.fecha || ''}" placeholder=" " required>
                    <label>Fecha Programada</label>
                </div>
                <div class="m3-field">
                    <input type="text" name="dosis" value="${f.dosis || ''}" placeholder=" " autocomplete="off">
                    <label>Dosis (opcional)</label>
                </div>
                <div class="m3-field">
                    <textarea name="observaciones" placeholder=" " rows="2">${f.observaciones || ''}</textarea>
                    <label>Observaciones (opcional)</label>
                </div>

                <div style="display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 8px; flex-wrap: wrap;">
                    <button type="button" class="btn-m3-tonal" id="delete-edit-fumigacion" style="background:#ffe2db; color:#ff4103;">
                        <span class="material-icons" style="font-size:18px;">delete</span> Eliminar
                    </button>
                    <div style="display:flex; gap:12px;">
                        <button type="button" class="btn-m3-text" id="cancel-edit-fumigacion">Cancelar</button>
                        <button type="submit" class="btn-m3-fill">Guardar</button>
                    </div>
                </div>
            </form>
        </div>
    `;

    document.getElementById('cancel-edit-fumigacion').onclick = () => {
        container.innerHTML = originalContent;
        renderDayDetailsFumig(f.fecha);
    };

    document.getElementById('delete-edit-fumigacion').onclick = () => {
        window.Snackbar.confirm(
            '¿Eliminar esta fumigación?',
            async () => {
                try {
                    const { error } = await supabase.from('animal_fumigaciones').delete().eq('id', fumigacionId);
                    if (error) throw error;
                    showSnackbar('Fumigación eliminada');
                    await loadAllData(currentAnimal.id, document.getElementById('da-container'));
                } catch (err) {
                    showSnackbar(err.message, 'error');
                }
            },
            { confirmLabel: 'Eliminar', cancelLabel: 'Cancelar' }
        );
    };

    document.getElementById('form-edit-fumigacion').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const newFecha = fd.get('fecha');
        const today = getLocalToday();
        const newEstado = newFecha >= today ? 'Programada' : 'Aplicada';

        try {
            const payload = {
                producto: fd.get('producto'),
                fecha: newFecha,
                dosis: fd.get('dosis') || null,
                observaciones: fd.get('observaciones') || null,
                estado: newEstado
            };

            const { error } = await supabase.from('animal_fumigaciones').update(payload).eq('id', fumigacionId);
            if (error) throw error;

            showSnackbar('Fumigación actualizada ✓');
            await loadAllData(currentAnimal.id, document.getElementById('da-container'));
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    };
}
window.editFumigacion = (id) => handleEditFumigacion(id);
