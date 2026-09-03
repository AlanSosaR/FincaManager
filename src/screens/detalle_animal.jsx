import { restFetch, restInsert } from '../auth.js';
import { Chart, registerables } from 'chart.js';
import { showModal, closeModal } from '../modals.js';
import { showSnackbar } from '../snackbar.js';
import { sendWhatsApp } from '../wa.js';
import { syncTable } from '../sync.js';
import db from '../db.js';

function getLocalToday() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr, days) {
    const d = new Date(dateStr + 'T12:00:00');
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

Chart.register(...registerables);

/** Generic inline confirmation modal — no dependency on Snackbar.confirm */

window.confirmVaccine = (vaccineId) => {
    window.Snackbar.confirm('¿Confirmar que la vacuna fue aplicada?', async () => {
        try {
            await restFetch(`/rest/v1/animal_vacunas?id=eq.${vaccineId}`, {
                method: 'PATCH',
                body: JSON.stringify({ estado: 'Aplicada' }),
            });
            showSnackbar('Vacuna confirmada');

            // Notificar por WhatsApp
            try {
                const vac = vaccines.find(v => v.id === vaccineId);
                const animal = currentAnimal;
                if (vac && animal) {
                    sendWhatsApp(
                        `✅ Vacuna Aplicada\nAnimal: ${animal.nombre}\nVacuna: ${vac.nombre}\nDosis: ${vac.dosis || 'N/A'}\nObservación: ${vac.observaciones || 'N/A'}\nFecha: ${vac.fecha}`
                    );
                    const today = new Date().toISOString().split('T')[0];
                    const noted = JSON.parse(localStorage.getItem('wa_notified_vaccines') || '[]');
                    localStorage.setItem('wa_notified_vaccines', JSON.stringify([...new Set([...noted, vac.id])]));
                    const sentKey = `wa_sent_today_${today}`;
                    const sent = JSON.parse(localStorage.getItem(sentKey) || '[]');
                    localStorage.setItem(sentKey, JSON.stringify([...new Set([...sent, vac.id])]));
                }
            } catch (waErr) {
                console.warn('WhatsApp notification failed:', waErr);
            }
            syncTable('animal_vacunas');

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
            await restFetch(`/rest/v1/animal_vacunas?id=eq.${vaccineId}`, {
                method: 'PATCH',
                body: JSON.stringify({ estado: 'Cancelada' }),
            });
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
            await restFetch(`/rest/v1/animal_fumigaciones?id=eq.${fumigacionId}`, {
                method: 'PATCH',
                body: JSON.stringify({ estado: 'Aplicada' }),
            });
            showSnackbar('Fumigación confirmada');

            const fum = fumigaciones.find(f => f.id === fumigacionId);
            if (fum && currentAnimal) {
                sendWhatsApp(
                    '✅ Fumigación Aplicada\nAnimal: ' + currentAnimal.nombre +
                    '\nProducto: ' + fum.producto +
                    '\nDosis: ' + (fum.dosis || 'N/A') +
                    '\nObservación: ' + (fum.observaciones || 'N/A') +
                    '\nFecha: ' + fum.fecha +
                    '\nFinca: ' + (window._empresaNombre || '')
                );
                const today = new Date().toISOString().split('T')[0];
                const noted = JSON.parse(localStorage.getItem('wa_notified_fumigaciones') || '[]');
                localStorage.setItem('wa_notified_fumigaciones', JSON.stringify([...new Set([...noted, fum.id])]));
                const sentKey = 'wa_sent_fumig_today_' + today;
                const sent = JSON.parse(localStorage.getItem(sentKey) || '[]');
                localStorage.setItem(sentKey, JSON.stringify([...new Set([...sent, fum.id])]));
            }

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
            await restFetch(`/rest/v1/animal_fumigaciones?id=eq.${fumigacionId}`, {
                method: 'PATCH',
                body: JSON.stringify({ estado: 'Cancelada' }),
            });
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
let pregnancies = [];
let lastWeight = 0;
let weightChange = 0;
let weightTrend = 'neutral';
let currentYear = new Date().getFullYear();
let currentMonth = new Date().getMonth();
let selectedDayVaccines = new Date().getDate();
let currentYearFumig = new Date().getFullYear();
let currentMonthFumig = new Date().getMonth();
let selectedDayFumig = new Date().getDate();
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

export async function initDetalleAnimal(animalId, flag) {
    const container = document.getElementById('da-container');
    if (!container) return;

    await loadAllData(animalId, container, flag);
}

async function loadAllData(animalId, container, flag, targetTab) {
    try {
        let animalData = null;
        let vaccinesData = [];
        let weightsData = [];
        let fumigData = [];
        let ventaData = [];
        let pregnanciesData = [];

        // 1. Fast local read from IndexedDB for instant 0ms load
        try {
            animalData = await db.ganado.get(animalId);
            if (animalData) {
                const [potreroObj, vArr, wArr, fArr, veArr, pArr] = await Promise.all([
                    animalData.potrero_id && db.potreros ? db.potreros.get(animalData.potrero_id).catch(() => null) : null,
                    db.animal_vacunas ? db.animal_vacunas.where('animal_id').equals(animalId).toArray().catch(() => []) : [],
                    db.animal_pesajes ? db.animal_pesajes.where('animal_id').equals(animalId).toArray().catch(() => []) : [],
                    db.animal_fumigaciones ? db.animal_fumigaciones.where('animal_id').equals(animalId).toArray().catch(() => []) : [],
                    db.animal_ventas ? db.animal_ventas.where('animal_id').equals(animalId).toArray().catch(() => []) : [],
                    db.animal_preñez ? db.animal_preñez.where('animal_id').equals(animalId).toArray().catch(() => []) : []
                ]);

                if (potreroObj) {
                    animalData.potreros = potreroObj;
                }

                if (animalData.madre_id) {
                    const madre = await db.ganado.get(animalData.madre_id).catch(() => null);
                    if (madre) animalData.madre = madre;
                }

                vaccinesData = vArr || [];
                weightsData = wArr || [];
                fumigData = fArr || [];
                ventaData = veArr || [];
                pregnanciesData = pArr || [];

                weightsData.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
                vaccinesData.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                fumigData.sort((a, b) => new Date(b.fecha) - new Date(a.fecha));
                ventaData.sort((a, b) => new Date(b.fecha_venta) - new Date(a.fecha_venta));
                pregnanciesData.sort((a, b) => new Date(b.fecha_monta) - new Date(a.fecha_monta));

                if (ventaData.length > 0) {
                    const v = ventaData[0];
                    animalData.precio_venta = v.precio_venta;
                    animalData.fecha_venta  = v.fecha_venta;
                    animalData.comprador    = v.comprador;
                    animalData.peso_venta   = v.peso_venta;
                }

                currentAnimal = animalData;
                vaccines = vaccinesData;
                weights = weightsData;
                fumigaciones = fumigData;
                pregnancies = pregnanciesData;

                calculateWeightStats(weightsData);

                // Render INSTANTLY
                renderFullContent(container, animalId, flag, targetTab);
            }
        } catch (dbErr) {
            console.warn('IndexedDB read error in detalle_animal:', dbErr);
        }

        // 2. Background REST refresh — runs truly async so it never blocks the first render
        if (navigator.onLine) {
            const snapshotUpdatedAt = animalData?.updated_at;
            setTimeout(async () => {
                // Abort if the user already navigated away
                if (!document.getElementById('da-container')) return;
                try {
                    const [animalArr, vRest, wRest, fRest, veRest, pRest] = await Promise.all([
                        restFetch(`/rest/v1/ganado?id=eq.${animalId}&select=*,potreros(nombre)&limit=1`).catch(() => null),
                        restFetch(`/rest/v1/animal_vacunas?animal_id=eq.${animalId}&order=fecha.desc`).catch(() => null),
                        restFetch(`/rest/v1/animal_pesajes?animal_id=eq.${animalId}&order=fecha.asc`).catch(() => null),
                        restFetch(`/rest/v1/animal_fumigaciones?animal_id=eq.${animalId}&order=fecha.desc`).catch(() => null),
                        restFetch(`/rest/v1/animal_ventas?animal_id=eq.${animalId}&order=fecha_venta.desc&limit=1`).catch(() => null),
                        restFetch(`/rest/v1/animal_preñez?animal_id=eq.${animalId}&order=fecha_monta.desc`).catch(() => null),
                    ]);

                    const freshAnimal = Array.isArray(animalArr) ? animalArr[0] : animalArr;
                    if (!freshAnimal) return;

                    // Skip re-render if nothing changed (same updated_at from server)
                    const serverUpdatedAt = freshAnimal.updated_at;
                    const freshVaccineCount = Array.isArray(vRest) ? vRest.length : vaccinesData.length;
                    const freshWeightCount  = Array.isArray(wRest) ? wRest.length : weightsData.length;
                    const freshFumigCount   = Array.isArray(fRest) ? fRest.length : fumigData.length;
                    const freshPregCount    = Array.isArray(pRest) ? pRest.length : pregnanciesData.length;
                    const dataUnchanged = serverUpdatedAt === snapshotUpdatedAt
                        && freshVaccineCount === vaccinesData.length
                        && freshWeightCount  === weightsData.length
                        && freshFumigCount   === fumigData.length
                        && freshPregCount    === pregnanciesData.length;

                    if (dataUnchanged) return; // Nothing changed — avoid flicker

                    // Abort again if user navigated away while fetching
                    if (!document.getElementById('da-container')) return;

                    currentAnimal = freshAnimal;
                    vaccines = Array.isArray(vRest) ? vRest : vaccinesData;
                    weights  = Array.isArray(wRest) ? wRest : weightsData;
                    fumigaciones = Array.isArray(fRest) ? fRest : fumigData;
                    const freshVenta = Array.isArray(veRest) ? veRest : ventaData;
                    pregnancies = Array.isArray(pRest) ? pRest.sort((a, b) => new Date(b.fecha_monta) - new Date(a.fecha_monta)) : pregnanciesData;

                    if (currentAnimal.madre_id) {
                        const madre = await db.ganado.get(currentAnimal.madre_id).catch(() => null);
                        if (madre) currentAnimal.madre = madre;
                    }

                    calculateWeightStats(weights);
                    if (freshVenta && freshVenta.length > 0) {
                        const v = freshVenta[0];
                        currentAnimal.precio_venta = v.precio_venta;
                        currentAnimal.fecha_venta  = v.fecha_venta;
                        currentAnimal.comprador    = v.comprador;
                        currentAnimal.peso_venta   = v.peso_venta;
                    }

                    const containerEl = document.getElementById('da-container');
                    if (containerEl) renderFullContent(containerEl, animalId, flag, window._daCurrentTab || targetTab);
                } catch (e) {
                    // Silent — IndexedDB data already shown
                }
            }, 0);
        } else if (!animalData) {
            throw new Error('Animal no encontrado en almacenamiento local');
        }
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

function calculateWeightStats(wList) {
    if (wList.length >= 2) {
        const latest = wList[wList.length - 1];
        const previous = wList[wList.length - 2];
        lastWeight = parseFloat(latest.peso);
        const prevW = parseFloat(previous.peso);
        weightChange = lastWeight - prevW;
        weightTrend = weightChange > 0 ? 'positive' : (weightChange < 0 ? 'negative' : 'neutral');
    } else if (wList.length === 1) {
        lastWeight = parseFloat(wList[0].peso);
        weightChange = 0;
        weightTrend = 'neutral';
    } else {
        lastWeight = 0;
        weightChange = 0;
        weightTrend = 'neutral';
    }
}


function renderFullContent(container, animalId, flag, targetTab) {
    const isSold = currentAnimal.estado === 'Vendido';
    const sellMode = flag === 'vender';
    const activePreg = pregnancies.find(p => p.estado === 'Preñada');
    let reproBadge = '';
    if (currentAnimal.sexo === 'Hembra') {
        if (activePreg && currentAnimal.reproductivo === 'Preñada') {
            reproBadge = `<div class="da-badge" style="border:1px solid #f0d9a8;background:#fff4e0;color:#b26a00;">
                <span class="da-badge-chip amber"><img src="/cow.png"></span>
                Preñada — Parto: ${new Date(activePreg.fecha_probable_parto + 'T00:00:00').toLocaleDateString()}
            </div>`;
        } else if (currentAnimal.reproductivo === 'Lactando') {
            reproBadge = `<div class="da-badge" style="border:1px solid #d4e8b0;background:#f0f7e6;color:#2d3e2c;">
                <span class="da-badge-chip green"><span class="material-icons">child_care</span></span>
                Lactando
            </div>`;
        }
    }
    const fmtFechaEdad = (fechaStr) => {
        if (!fechaStr) return '';
        const f = new Date(fechaStr);
        const dias = Math.floor((Date.now() - f.getTime()) / 86400000);
        const diasTxt = dias >= 0 ? ` <span class="da-dias-edad">(${dias} día${dias === 1 ? '' : 's'})</span>` : '';
        return f.toLocaleDateString() + diasTxt;
    };
    let edadDiasSimple = '';
    if (currentAnimal.fecha_adquisicion) {
        const f = new Date(currentAnimal.fecha_adquisicion);
        const dias = Math.floor((Date.now() - f.getTime()) / 86400000);
        if (dias >= 0) {
            edadDiasSimple = `${dias} días`;
        }
    }
    const pendVacCount = vaccines.filter(v => v.estado === 'Programada').length;
    const pendFumCount = fumigaciones.filter(f => f.estado === 'Programada').length;
    const totalPendCount = pendVacCount + pendFumCount;

    const todayStr = getLocalToday();
    const atrasadasVac = vaccines.filter(v => v.estado === 'Programada' && v.fecha < todayStr);
    const atrasadasFum = fumigaciones.filter(f => f.estado === 'Programada' && f.fecha < todayStr);
    const todasAtrasadas = [
        ...atrasadasVac.map(v => ({ ...v, tipo: 'vacuna', tipoLabel: 'Vacuna' })),
        ...atrasadasFum.map(f => ({ ...f, tipo: 'fumigacion', tipoLabel: 'Fumigación', nombre: f.producto }))
    ].sort((a, b) => a.fecha.localeCompare(b.fecha));

    // Pestaña inicial y fechas por defecto
    let defaultTab = targetTab || window._daCurrentTab || 'vacunas';
    window._daCurrentTab = defaultTab;
    const now = new Date();
    currentYear = now.getFullYear();
    currentMonth = now.getMonth();
    selectedDayVaccines = now.getDate();

    currentYearFumig = now.getFullYear();
    currentMonthFumig = now.getMonth();
    selectedDayFumig = now.getDate();

    container.innerHTML = `

        <div class="da-hero da-hero-revamped">
            <div class="da-hero-top-header">
                <div class="da-hero-title-row">
                    <h2 class="da-hero-title">${currentAnimal.nombre || 'Sin Nombre'}</h2>
                    <div class="da-combo-pill">
                        ${currentAnimal.raza ? `<span class="da-combo-raza">${currentAnimal.raza}</span>` : ''}
                        ${currentAnimal.raza && currentAnimal.sexo ? `<span class="da-combo-divider">•</span>` : ''}
                        ${currentAnimal.sexo ? `
                        <span class="da-combo-sex ${currentAnimal.sexo === 'Macho' ? 'blue' : 'pink'}">
                            <span class="ganado-sex-icon-img"></span>
                            <span>${currentAnimal.sexo}</span>
                        </span>` : ''}
                    </div>
                </div>

                <div class="da-header-subrow">
                    ${currentAnimal.origen !== 'Comprado'
                        ? (currentAnimal.fecha_adquisicion ? `
                    <div class="da-header-birth-text">
                        <img src="/cria.png" class="da-header-birth-icon">
                        <span>Nacimiento: <strong>${fmtFechaEdad(currentAnimal.fecha_adquisicion)}</strong></span>
                    </div>` : '')
                        : (currentAnimal.fecha_adquisicion ? `
                    <div class="da-header-birth-text">
                        <span class="material-icons da-header-birth-icon" style="font-size:16px;">cake</span>
                        <span>Adquisición: <strong>${fmtFechaEdad(currentAnimal.fecha_adquisicion)}</strong></span>
                    </div>` : '')}

                    ${currentAnimal.potreros?.nombre || currentAnimal.madre || reproBadge || currentAnimal.origen === 'Comprado' ? `
                    <div class="da-badge-row da-header-badges">
                        ${currentAnimal.potreros?.nombre ? `
                        <div class="da-badge da-badge-surface">
                            <span class="da-badge-chip green"><span class="material-icons">location_on</span></span>
                            Potrero: ${currentAnimal.potreros.nombre}
                        </div>` : ''}
                        ${currentAnimal.madre ? `
                        <div class="da-badge da-badge-surface">
                            <span class="da-badge-chip sky"><img src="/cria.png"></span>
                            Hija/o de: ${currentAnimal.madre.nombre}
                        </div>` : ''}
                        ${reproBadge}
                        ${currentAnimal.origen === 'Comprado' ? `
                        <div class="da-badge da-badge-surface">
                            <span class="da-badge-chip red"><span class="material-icons">shopping_cart</span></span>
                            Comprado${currentAnimal.precio_compra ? ` (HNL ${currentAnimal.precio_compra})` : ''}
                        </div>` : ''}
                    </div>` : ''}
                </div>
            </div>

            <div class="da-hero-body-grid">
                <div class="da-hero-img-card">
                    <img src="${currentAnimal.image_url || 'https://images.unsplash.com/photo-1546445317-29f4545e9d53?q=80&w=800'}" alt="${currentAnimal.nombre}">
                    <div class="da-hero-overlay"></div>
                    <div class="da-mob-top-badge">
                        ${isSold ? `
                        <span class="da-hero-status-pill sold">● Vendido</span>` : (currentAnimal.origen === 'Comprado' && currentAnimal.precio_compra ? `
                        <span class="da-hero-status-pill comprado">HNL ${currentAnimal.precio_compra}</span>` : '')}
                    </div>
                    <div class="da-hero-img-info">
                        <div class="da-hero-img-sub">${[currentAnimal.raza, currentAnimal.sexo, edadDiasSimple].filter(Boolean).join(' · ')}</div>
                        <div class="da-hero-img-title">${currentAnimal.nombre || 'Sin Nombre'}</div>
                    </div>
                </div>

                <div class="da-hero-details-col">
                    <div class="da-stat-grid da-stat-grid-inline">
                        <div class="da-stat-card da-stat-tab ${defaultTab === 'vacunas' ? 'active' : ''}" data-tab="vacunas" style="cursor:pointer;" title="Ver Vacunas y Salud">
                            <div class="da-stat-icon">
                                <span class="material-symbols-outlined" style="color:#3B6D11;">vaccines</span>
                            </div>
                            <div>
                                <div class="da-stat-label">Vacunas</div>
                                <div class="da-stat-value">${vaccines.filter(v => (v.estado || 'Aplicada') === 'Aplicada').length}</div>
                                <div class="da-stat-sub">
                                    ${vaccines.filter(v => (v.estado || 'Aplicada') === 'Aplicada').length} realizadas
                                </div>
                            </div>
                        </div>

                        <div class="da-stat-card da-stat-tab ${defaultTab === 'fumigacion' ? 'active' : ''}" data-tab="fumigacion" style="cursor:pointer;" title="Ver Fumigación y Químicos">
                            <div class="da-stat-icon" style="color: #185FA5;">
                                <span class="material-symbols-outlined" style="color: #185FA5;">shield</span>
                            </div>
                            <div>
                                <div class="da-stat-label">Fumig.</div>
                                <div class="da-stat-value">${fumigaciones.filter(f => (f.estado || 'Aplicada') === 'Aplicada').length}</div>
                                <div class="da-stat-sub">
                                    ${fumigaciones.filter(f => (f.estado || 'Aplicada') === 'Aplicada').length} realizadas
                                </div>
                            </div>
                        </div>

                        ${totalPendCount > 0 ? `
                        <div class="da-stat-card da-stat-tab da-stat-pending-pill ${defaultTab === 'pendientes' ? 'active' : ''}" data-tab="pendientes" style="cursor:pointer; background: #fff4e0; border-color: #ffe0b2;" title="${totalPendCount} pendiente(s). Clic para ver todas">
                            <div class="da-stat-icon">
                                <span class="material-symbols-outlined" style="color:#854F0B;">schedule</span>
                            </div>
                            <div>
                                <div class="da-stat-label" style="color:#854F0B;">Pendiente</div>
                                <div class="da-stat-value" style="color:#854F0B;">${totalPendCount}</div>
                            </div>
                        </div>` : ''}

                        <div class="da-stat-card da-stat-tab ${defaultTab === 'pesajes' ? 'active' : ''}" data-tab="pesajes" style="cursor:pointer;" title="Ver Historial de Pesajes">
                            <div class="da-stat-icon da-stat-icon-secondary">
                                <span class="material-symbols-outlined">scale</span>
                            </div>
                            <div>
                                <div class="da-stat-label">Peso</div>
                                <div class="da-stat-value">${lastWeight}${currentAnimal.peso_unidad || 'kg'}</div>
                                <div class="da-stat-sub">
                                    <span class="da-variation-pill ${weightTrend}">
                                        <span class="material-icons">${weightTrend === 'positive' ? 'trending_up' : (weightTrend === 'negative' ? 'trending_down' : 'trending_flat')}</span>
                                        ${weightChange > 0 ? '+' : ''}${weightChange.toFixed(1)} ${currentAnimal.peso_unidad || 'kg'}
                                    </span>
                                </div>
                            </div>
                        </div>

                        ${currentAnimal.sexo === 'Hembra' ? `
                        <div class="da-stat-card da-stat-tab ${defaultTab === 'repro' ? 'active' : ''}" data-tab="repro" style="cursor:pointer;" title="Ver Reproducción">
                            <div class="da-stat-icon" style="color: #b26a00;">
                                <img src="/cow.png" style="width:20px; height:20px; object-fit:contain;">
                            </div>
                            <div>
                                <div class="da-stat-label">Repro</div>
                                <div class="da-stat-value">${currentAnimal.reproductivo || 'Vacía'}</div>
                                <div class="da-stat-sub">${activePreg ? `Parto: ${new Date(activePreg.fecha_probable_parto + 'T00:00:00').toLocaleDateString()}` : pregnancies.length + (pregnancies.length === 1 ? ' gestación' : ' gestaciones')}</div>
                            </div>
                        </div>` : ''}
                    </div>

                    ${isSold ? `
                    <div class="m3-card-filled" style="margin-top:14px;">
                <div class="da-sell-card sold">
                    <div class="da-sell-header">
                        <span class="material-icons">payments</span>
                        <span class="da-sell-title">Información de Venta</span>
                    </div>
                    <div class="da-sell-details" id="da-sell-details">
                        <div class="da-sell-row"><span>Precio venta</span><strong>${currentAnimal.precio_venta ? `HNL ${currentAnimal.precio_venta}` : '—'}</strong></div>
                        <div class="da-sell-row"><span>Fecha</span><strong>${currentAnimal.fecha_venta ? new Date(currentAnimal.fecha_venta).toLocaleDateString() : '—'}</strong></div>
                        ${currentAnimal.comprador ? `<div class="da-sell-row"><span>Comprador</span><strong>${currentAnimal.comprador}</strong></div>` : ''}
                        ${currentAnimal.peso_venta ? `<div class="da-sell-row"><span>Peso venta</span><strong>${currentAnimal.peso_venta} kg</strong></div>` : ''}
                        ${currentAnimal.origen === 'Comprado' && currentAnimal.precio_compra ? `<div class="da-sell-row"><span>Precio compra</span><strong>HNL ${currentAnimal.precio_compra}</strong></div>` : ''}
                        ${currentAnimal.origen ? `<div class="da-sell-row"><span>Origen</span><strong>${currentAnimal.origen}</strong></div>` : ''}
                    </div>
                <button class="btn-m3-text" style="margin-top:12px;width:100%;" onclick="window.editSale('${currentAnimal.id}')">
                    <span class="material-icons" style="font-size:18px;">edit</span> Editar precio de venta
                </button>
                </div>
                </div>` : (sellMode ? `
                <div class="m3-card-filled">
                <div class="da-sell-form open" id="da-sell-form">
                    <form id="form-sell-animal" class="da-sell-form-inner">
                        <div class="da-sell-grid-fields">
                            <div class="m3-field">
                                <input type="number" step="0.01" id="sell-precio" placeholder=" " required>
                                <label>Precio de venta (HNL)</label>
                            </div>
                            <div class="m3-field">
                                <input type="date" id="sell-fecha" value="${new Date().toISOString().split('T')[0]}" placeholder=" ">
                                <label>Fecha</label>
                            </div>
                            <div class="m3-field">
                                <input type="text" id="sell-comprador" placeholder=" ">
                                <label>Comprador (opcional)</label>
                            </div>
                            <div class="m3-field">
                                <input type="number" step="0.1" id="sell-peso" value="0" placeholder=" ">
                                <label>Peso (kg)</label>
                            </div>
                        </div>
                        <div class="da-sell-actions">
                            <button type="button" class="btn-m3-text" onclick="document.getElementById('da-sell-form').classList.remove('open'); document.getElementById('da-sell-toggle').style.display='';">Cancelar</button>
                            <button type="submit" class="btn-m3-primary" id="btn-sell-confirm" style="gap:6px;">
                                <span class="material-icons">payments</span> Confirmar venta
                            </button>
                        </div>
                    </form>
                </div>
                </div>` : '')}
                </div>
            </div>

            <div class="da-tabs-unified-divider"></div>

            <div class="da-tabs-content-area">
                <div class="da-tab-content ${defaultTab === 'vacunas' ? 'active' : ''}" id="da-tab-vacunas">
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
                            <div class="da-cal-mob-bar">
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <button type="button" class="da-cal-mob-arrow" onclick="window.navCalPrev(false)" title="Semana o mes anterior">
                                        <span class="material-icons">chevron_left</span>
                                    </button>
                                    <span class="da-cal-mob-date" id="da-cal-mob-date">Fecha</span>
                                    <button type="button" class="da-cal-mob-arrow" onclick="window.navCalNext(false)" title="Semana o mes siguiente">
                                        <span class="material-icons">chevron_right</span>
                                    </button>
                                </div>
                                <button type="button" class="da-cal-mob-toggle" id="da-cal-toggle-btn" onclick="window.toggleCalendarView('vacunas')">
                                    <span class="material-icons" id="da-cal-toggle-icon" style="font-size:14px;">calendar_month</span>
                                    <span id="da-cal-toggle-text">Ver mes</span>
                                </button>
                            </div>
                        </div>
                        <div class="da-cal-week-strip" id="calendar-week-days"></div>
                        <div class="da-calendar-grid" id="calendar-month-grid">
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
                            <div><span class="plan-legend-dot" style="background:#2d3e2c;"></span><span>Aplicada</span></div>
                            <div><span class="plan-legend-dot" style="background:#c9a227;"></span><span>Programada</span></div>
                            <div><span class="plan-legend-dot" style="background:#FF4103;"></span><span>Atrasada</span></div>
                        </div>
                    </div>

                    <div id="da-day-details-panel">
                        <div class="da-day-details">
                            <div style="text-align:center; color:#888; padding:24px 16px;">
                                <span class="material-icons" style="font-size:44px; color:#2d3e2c; opacity:0.6; margin-bottom:8px;">calendar_month</span>
                                <p style="font-size:14px; font-weight:700; color:#333; margin:0 0 6px;">Toca cualquier día en el calendario</p>
                                <p style="font-size:12px; color:#777; margin:0;">Para ver o registrar vacunas del animal</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="da-month-table-section" style="margin-top: 20px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 8px;">
                        <h4 style="margin: 0; font-size: 15px; font-weight: 800; color: #1a1a1a; display: flex; align-items: center; gap: 6px;">
                            <span class="material-icons" style="font-size: 18px; color: #2d3e2c;">history</span>
                            <span>Historial de Vacunas</span>
                        </h4>
                        <button type="button" class="btn-m3-tonal" id="toggle-vaccines-month-btn" style="padding: 6px 14px; font-size: 12px; border-radius: 9999px; background: #f0f4f0; color: #2d3e2c; border: 1px solid #d8e2d8; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                            <span class="material-icons" id="toggle-vaccines-icon" style="font-size: 16px;">visibility</span>
                            <span id="toggle-vaccines-text">Ver historial</span>
                        </button>
                    </div>
                    <div id="da-vaccines-table" style="display: none; background: transparent; border: none; padding: 0; box-shadow: none;">
                    </div>
                </div>
            </div>

            <div class="da-tab-content ${defaultTab === 'pesajes' ? 'active' : ''}" id="da-tab-pesajes">
                <div class="da-chart-card">
                    <div class="da-chart-header" style="display: flex; align-items: center; justify-content: space-between; gap: 8px;">
                        <div>
                            <h3 style="margin: 0; font-size: 17px; font-weight: 800; color: #1a1a1a;">Evolución de Peso</h3>
                        </div>
                        ${!isSold ? `<button class="btn-m3-tonal" style="padding: 8px 16px; border-radius: 9999px; font-weight: 700; font-size: 13px; display: inline-flex; align-items: center; gap: 5px;" id="da-add-weight">
                            <span class="material-icons" style="font-size: 18px;">add</span> Registrar
                        </button>` : ''}
                    </div>
                    <div class="da-chart-area">
                        <canvas id="weightChart"></canvas>
                    </div>
                </div>
                <div class="da-month-table-section" style="margin-top: 20px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 8px;">
                        <h4 style="margin: 0; font-size: 15px; font-weight: 800; color: #1a1a1a; display: flex; align-items: center; gap: 6px;">
                            <span class="material-icons" style="font-size: 18px; color: #2d3e2c;">history</span>
                            <span>Historial de Pesajes</span>
                        </h4>
                        <button type="button" class="btn-m3-tonal" id="toggle-weights-btn" style="padding: 6px 14px; font-size: 12px; border-radius: 9999px; background: #f0f4f0; color: #2d3e2c; border: 1px solid #d8e2d8; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                            <span class="material-icons" id="toggle-weights-icon" style="font-size: 16px;">${window._daWeightsOpen ? 'visibility_off' : 'visibility'}</span>
                            <span id="toggle-weights-text">${window._daWeightsOpen ? 'Ocultar' : 'Ver historial'}</span>
                        </button>
                    </div>
                    <div id="da-weights-table" style="display: ${window._daWeightsOpen ? 'block' : 'none'}; background: transparent; border: none; padding: 0; box-shadow: none;">
                    </div>
                </div>
            </div>

            <div class="da-tab-content ${defaultTab === 'fumigacion' ? 'active' : ''}" id="da-tab-fumigacion">
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
                            <div class="da-cal-mob-bar">
                                <div style="display:flex; align-items:center; gap:6px;">
                                    <button type="button" class="da-cal-mob-arrow" onclick="window.navCalPrev(true)" title="Semana o mes anterior">
                                        <span class="material-icons">chevron_left</span>
                                    </button>
                                    <span class="da-cal-mob-date" id="da-cal-mob-date-fumig">Fecha</span>
                                    <button type="button" class="da-cal-mob-arrow" onclick="window.navCalNext(true)" title="Semana o mes siguiente">
                                        <span class="material-icons">chevron_right</span>
                                    </button>
                                </div>
                                <button type="button" class="da-cal-mob-toggle" id="da-cal-toggle-btn-fumig" onclick="window.toggleCalendarView('fumig')">
                                    <span class="material-icons" id="da-cal-toggle-icon-fumig" style="font-size:14px;">calendar_month</span>
                                    <span id="da-cal-toggle-text-fumig">Ver mes</span>
                                </button>
                            </div>
                        </div>
                        <div class="da-cal-week-strip" id="calendar-week-days-fumig"></div>
                        <div class="da-calendar-grid" id="calendar-month-grid-fumig">
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
                            <div><span class="plan-legend-dot" style="background:#2d3e2c;"></span><span>Aplicada</span></div>
                            <div><span class="plan-legend-dot" style="background:#c9a227;"></span><span>Programada</span></div>
                            <div><span class="plan-legend-dot" style="background:#FF4103;"></span><span>Atrasada</span></div>
                        </div>
                    </div>

                    <div id="da-day-details-panel-fumig">
                        <div class="da-day-details">
                            <div style="text-align:center; color:#888; padding:24px 16px;">
                                <span class="material-icons" style="font-size:44px; color:#2d3e2c; opacity:0.6; margin-bottom:8px;">calendar_month</span>
                                <p style="font-size:14px; font-weight:700; color:#333; margin:0 0 6px;">Toca cualquier día en el calendario</p>
                                <p style="font-size:12px; color:#777; margin:0;">Para ver o registrar fumigaciones y baños del animal</p>
                            </div>
                        </div>
                    </div>
                </div>
                
                <div class="da-month-table-section" style="margin-top: 20px;">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 10px; gap: 8px;">
                        <h4 style="margin: 0; font-size: 15px; font-weight: 800; color: #1a1a1a; display: flex; align-items: center; gap: 6px;">
                            <span class="material-icons" style="font-size: 18px; color: #2d3e2c;">history</span>
                            <span>Historial de Fumigaciones</span>
                        </h4>
                        <button type="button" class="btn-m3-tonal" id="toggle-fumig-month-btn" style="padding: 6px 14px; font-size: 12px; border-radius: 9999px; background: #f0f4f0; color: #2d3e2c; border: 1px solid #d8e2d8; font-weight: 700; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;">
                            <span class="material-icons" id="toggle-fumig-icon" style="font-size: 16px;">visibility</span>
                            <span id="toggle-fumig-text">Ver historial</span>
                        </button>
                    </div>
                    <div id="da-fumigaciones-table" style="display: none; background: transparent; border: none; padding: 0; box-shadow: none;">
                    </div>
                </div>
            </div>

            ${currentAnimal.sexo === 'Hembra' ? `
            <div class="da-tab-content ${defaultTab === 'repro' ? 'active' : ''}" id="da-tab-repro">
                <div class="da-repro-header-card">
                    <div class="da-repro-header-info">
                        <div class="da-repro-header-badge">
                            <img src="/cow.png" style="width:24px; height:24px; object-fit:contain;">
                        </div>
                        <div>
                            <h4 class="da-repro-title">Historial de Reproducción</h4>
                            <p class="da-repro-subtitle">Gestaciones, partos y crías de este animal.</p>
                        </div>
                    </div>
                    <div class="da-repro-header-actions">
                        ${!isSold ? `
                        ${!activePreg ? `
                        <button type="button" class="m3-btn-expressive-primary" id="da-add-pregnancy">
                            <span class="material-symbols-outlined">add_circle</span>
                            <span>Registrar preñez</span>
                        </button>` : `
                        <button type="button" class="m3-btn-expressive-primary" id="da-register-parto">
                            <span class="material-symbols-outlined">child_care</span>
                            <span>Registrar parto</span>
                        </button>
                        <button type="button" class="m3-btn-expressive-tonal" id="da-register-abort" style="background:#ffe2db; color:#cf222e; border:1px solid #ffd1d1;">
                            <span class="material-symbols-outlined">cancel</span>
                            <span>Aborto</span>
                        </button>`}` : ''}
                    </div>
                </div>

                ${activePreg ? `
                <div class="da-repro-active-banner">
                    <div class="da-repro-active-header">
                        <span style="background:#fff3e0; color:#b26a00; border:1.5px solid #ffe0b2; font-weight:800; font-size:12px; padding:4px 12px; border-radius:9999px; display:inline-flex; align-items:center; gap:6px;">
                            <img src="/cow.png" style="width:16px; height:16px; object-fit:contain;">
                            <span>Gestación en Curso</span>
                        </span>
                        <span class="da-repro-countdown">
                            ${(() => {
                                const fParto = activePreg.fecha_probable_parto ? new Date(activePreg.fecha_probable_parto + 'T00:00:00') : null;
                                if (!fParto) return '';
                                const diffDias = Math.ceil((fParto - new Date()) / (1000 * 60 * 60 * 24));
                                return diffDias > 0 
                                    ? `<strong>${diffDias}</strong> días restantes para parto` 
                                    : (diffDias === 0 ? `<strong>¡Fecha de parto hoy!</strong>` : `Parto sobre fecha prevista (+${Math.abs(diffDias)}d)`);
                            })()}
                        </span>
                    </div>
                    <div class="da-repro-active-grid">
                        <div class="da-repro-active-item">
                            <span class="da-repro-item-label">Fecha de Monta</span>
                            <span class="da-repro-item-val">${activePreg.fecha_monta ? new Date(activePreg.fecha_monta + 'T00:00:00').toLocaleDateString() : '—'}</span>
                        </div>
                        <div class="da-repro-active-item">
                            <span class="da-repro-item-label">Parto Estimado</span>
                            <span class="da-repro-item-val highlight">${activePreg.fecha_probable_parto ? new Date(activePreg.fecha_probable_parto + 'T00:00:00').toLocaleDateString() : '—'}</span>
                        </div>
                        <div class="da-repro-active-item">
                            <span class="da-repro-item-label">Días Transcurridos</span>
                            <span class="da-repro-item-val">${activePreg.fecha_monta ? Math.max(0, Math.floor((new Date() - new Date(activePreg.fecha_monta + 'T00:00:00')) / 86400000)) + ' días' : '—'}</span>
                        </div>
                    </div>
                </div>` : ''}

                <div id="da-pregnancy-inline"></div>
                <div id="da-pregnancies-table">
                    ${renderPregnanciesHtml()}
                </div>
            </div>` : ''}
            </div>
        </div>
    `;
 
    setupEventListeners(animalId, container, sellMode);
    renderCalendar();
    renderWeightsTable();
    renderCalendarFumig();
    if (defaultTab === 'pesajes') {
        setTimeout(() => initChart(), 50);
    } else if (defaultTab === 'pendientes') {
        setTimeout(() => { if (typeof window.showAllPendingInline === 'function') window.showAllPendingInline(true); }, 50);
    }
}

function setupEventListeners(animalId, container, sellMode) {
    const contents = container.querySelectorAll('.da-tab-content');
    const statCards = container.querySelectorAll('.da-stat-tab');

    // Auto-expand sell form and scroll
    if (sellMode) {
        const sellForm = document.getElementById('da-sell-form');
        const sellToggle = document.getElementById('da-sell-toggle');
        if (sellForm) {
            sellForm.classList.add('open');
            if (sellToggle) sellToggle.style.display = 'none';
            setTimeout(() => {
                const section = document.getElementById('da-sell-form');
                if (section) section.scrollIntoView({ behavior: 'smooth', block: 'center' });
                document.getElementById('sell-precio')?.focus();
            }, 300);
        }
    }

    // Sell form submit
    const sellFormEl = document.getElementById('form-sell-animal');
    if (sellFormEl) {
        sellFormEl.addEventListener('submit', async (e) => {
            e.preventDefault();
            const precio = document.getElementById('sell-precio').value;
            if (!precio) { document.getElementById('sell-precio').focus(); return; }
            const btn = document.getElementById('btn-sell-confirm');
            btn.disabled = true;
            btn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Guardando...';
            try {
                await restInsert('/rest/v1/animal_ventas', {
                    animal_id: animalId,
                    empresa_id: window._currentEmpresaId,
                    precio_venta: parseFloat(precio),
                    fecha_venta: document.getElementById('sell-fecha').value,
                    comprador: document.getElementById('sell-comprador').value || null,
                    peso_venta: document.getElementById('sell-peso').value ? parseFloat(document.getElementById('sell-peso').value) : null,
                });
                await restFetch('/rest/v1/ganado?id=eq.' + animalId, {
                    method: 'PATCH',
                    body: JSON.stringify({ estado: 'Vendido' }),
                });
                showSnackbar('Venta registrada');

                if (currentAnimal) {
                    sendWhatsApp(
                        '💰 Animal Vendido\nAnimal: ' + currentAnimal.nombre +
                        '\nPrecio: $' + parseFloat(precio) +
                        '\nFecha: ' + document.getElementById('sell-fecha').value +
                        '\nComprador: ' + (document.getElementById('sell-comprador').value || 'N/A') +
                        '\nFinca: ' + (window._empresaNombre || '')
                    );
                }

                currentAnimal.estado = 'Vendido';
                currentAnimal.precio_venta = parseFloat(precio);
                currentAnimal.fecha_venta = document.getElementById('sell-fecha').value;
                currentAnimal.comprador = document.getElementById('sell-comprador').value || null;
                currentAnimal.peso_venta = document.getElementById('sell-peso').value ? parseFloat(document.getElementById('sell-peso').value) : null;

                const sellForm = document.getElementById('da-sell-form');
                if (sellForm) {
                    const parent = sellForm.parentElement;
                    const card = document.createElement('div');
                    card.className = 'da-sell-card sold';
                    card.innerHTML = '<div class="da-sell-header">' +
                        '<span class="material-icons">payments</span>' +
                        '<span class="da-sell-title">Vendido</span>' +
                    '</div>' +
                    '<div class="da-sell-details">' +
                        '<div class="da-sell-row"><span>Precio</span><strong>HNL ' + currentAnimal.precio_venta + '</strong></div>' +
                        '<div class="da-sell-row"><span>Fecha</span><strong>' + new Date(currentAnimal.fecha_venta).toLocaleDateString() + '</strong></div>' +
                        (currentAnimal.comprador ? '<div class="da-sell-row"><span>Comprador</span><strong>' + currentAnimal.comprador + '</strong></div>' : '') +
                        (currentAnimal.peso_venta ? '<div class="da-sell-row"><span>Peso venta</span><strong>' + currentAnimal.peso_venta + ' kg</strong></div>' : '') +
                    '</div>' +
                    '<button class="btn-m3-text" style="margin-top:12px;width:100%;" onclick="window.returnToInventory(\'' + currentAnimal.id + '\')">' +
                        '<span class="material-icons" style="font-size:18px;">undo</span> Regresar al inventario' +
                    '</button>';
                    parent.replaceChild(card, sellForm);
                }

                const toggleBadge = document.getElementById('da-sell-toggle');
                if (toggleBadge) {
                    const soldBadge = document.createElement('div');
                    soldBadge.className = 'da-badge';
                    soldBadge.style.cssText = 'border:1px solid #d4e8b0;background:#f0f7e6;color:#2d3e2c;';
                    soldBadge.innerHTML = '<span class="material-icons">payments</span>' +
                        '<strong>Vendido</strong>' +
                        '<span style="color:#555;">— HNL ' + currentAnimal.precio_venta + '</span>';
                    toggleBadge.parentNode.replaceChild(soldBadge, toggleBadge);
                }
            } catch (err) {
                showSnackbar(err.message, 'error');
                btn.disabled = false;
                btn.innerHTML = '<span class="material-icons">payments</span> Confirmar venta';
            }
        });
    }

    window.editSale = (id) => {
        const card = document.querySelector('#da-container .da-sell-card.sold');
        if (!card) return;
        const v = currentAnimal;
        card.innerHTML = `
            <div class="da-sell-header">
                <span class="material-icons">payments</span>
                <span class="da-sell-title">Editar Venta</span>
            </div>
            <form id="form-edit-sale" class="da-sell-form-inner" style="display: flex; flex-direction: column; gap: 16px; margin-top: 16px;">
                <div class="m3-field">
                    <input type="number" step="0.01" name="precio" id="edit-sale-precio" value="${v.precio_venta ?? ''}" placeholder=" " required>
                    <label>Precio de venta (HNL)</label>
                </div>
                <div class="m3-field">
                    <input type="date" name="fecha" id="edit-sale-fecha" value="${v.fecha_venta || ''}" placeholder=" ">
                    <label>Fecha de venta</label>
                </div>
                <div class="m3-field">
                    <input type="text" name="comprador" id="edit-sale-comprador" value="${v.comprador ?? ''}" placeholder=" ">
                    <label>Comprador</label>
                </div>
                <div class="m3-field">
                    <input type="number" step="0.1" name="peso" id="edit-sale-peso" value="${v.peso_venta ?? ''}" placeholder=" ">
                    <label>Peso de venta (kg)</label>
                </div>
                <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
                    <button type="button" class="btn-m3-text" id="cancel-edit-sale">Cancelar</button>
                    <button type="submit" class="btn-m3-primary">Guardar</button>
                </div>
            </form>
        `;

        document.getElementById('cancel-edit-sale').addEventListener('click', () => {
            window.location.reload();
        });

        document.getElementById('form-edit-sale').addEventListener('submit', async (e) => {
            e.preventDefault();
            const body = {
                precio_venta: parseFloat(document.getElementById('edit-sale-precio').value),
            };
            const fecha = document.getElementById('edit-sale-fecha').value;
            if (fecha) body.fecha_venta = fecha;
            const comprador = document.getElementById('edit-sale-comprador').value;
            body.comprador = comprador ? comprador : null;
            const peso = document.getElementById('edit-sale-peso').value;
            body.peso_venta = peso ? parseFloat(peso) : null;
            try {
                await restFetch('/rest/v1/animal_ventas?animal_id=eq.' + id, {
                    method: 'PATCH',
                    body: JSON.stringify(body),
                });
                showSnackbar('Venta actualizada');
                window.location.reload();
            } catch (err) {
                showSnackbar(err.message, 'error');
            }
        });
    };

    window.showAnimalFullImg = (url) => {
        if (!url) return;
        showModal(currentAnimal?.nombre || 'Foto del animal', `
            <div style="text-align:center; padding:10px 0;">
                <img src="${url}" style="max-width:100%; max-height:75vh; border-radius:16px; object-fit:contain; box-shadow:0 6px 24px rgba(0,0,0,0.25); display:block; margin:0 auto;">
            </div>
        `);
    };

    function switchTab(target) {
        window._daCurrentTab = target;
        contents.forEach(c => c.classList.remove('active'));
        statCards.forEach(c => c.classList.remove('active'));

        const card = Array.from(statCards).find(c => c.getAttribute('data-tab') === target);
        if (card) card.classList.add('active');

        const panel = document.getElementById(`da-tab-${target}`);
        if (panel) panel.classList.add('active');

        if (target === 'vacunas') {
            const now = new Date();
            currentYear = now.getFullYear();
            currentMonth = now.getMonth();
            selectedDayVaccines = now.getDate();
            renderCalendar();
            const dayVacc = vaccines.filter(v => {
                const [y, m, d] = v.fecha.split('-').map(Number);
                return (m - 1) === currentMonth && y === currentYear && d === selectedDayVaccines;
            });
            showDayDetails(selectedDayVaccines, dayVacc);
        } else if (target === 'fumigacion') {
            const now = new Date();
            currentYearFumig = now.getFullYear();
            currentMonthFumig = now.getMonth();
            selectedDayFumig = now.getDate();
            renderCalendarFumig();
            const dayFum = fumigaciones.filter(f => {
                const [y, m, d] = f.fecha.split('-').map(Number);
                return (m - 1) === currentMonthFumig && y === currentYearFumig && d === selectedDayFumig;
            });
            showDayDetailsFumig(selectedDayFumig, dayFum);
        } else if (target === 'pesajes') {
            setTimeout(() => initChart(), 50);
        } else if (target === 'pendientes') {
            if (typeof window.showAllPendingInline === 'function') {
                window.showAllPendingInline(true);
            }
        }
    }
    window._daSwitchTab = switchTab;

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

    // Reproduction Actions
    document.getElementById('da-add-pregnancy')?.addEventListener('click', () => handleAddPregnancy(animalId));
    document.getElementById('da-register-parto')?.addEventListener('click', () => handleRegistrarParto(animalId));
    document.getElementById('da-register-abort')?.addEventListener('click', () => handleAbortPregnancy(animalId));

    // Toggle month history tables
    const toggleVacBtn = document.getElementById('toggle-vaccines-month-btn');
    if (toggleVacBtn) {
        toggleVacBtn.onclick = () => {
            const tbl = document.getElementById('da-vaccines-table');
            const icon = document.getElementById('toggle-vaccines-icon');
            const txt = document.getElementById('toggle-vaccines-text');
            if (tbl && tbl.style.display === 'none') {
                tbl.style.display = 'block';
                if (icon) icon.textContent = 'visibility_off';
                if (txt) txt.textContent = 'Ocultar';
            } else if (tbl) {
                tbl.style.display = 'none';
                if (icon) icon.textContent = 'visibility';
                if (txt) txt.textContent = 'Ver historial';
            }
        };
    }

    const toggleFumBtn = document.getElementById('toggle-fumig-month-btn');
    if (toggleFumBtn) {
        toggleFumBtn.onclick = () => {
            const tbl = document.getElementById('da-fumigaciones-table');
            const icon = document.getElementById('toggle-fumig-icon');
            const txt = document.getElementById('toggle-fumig-text');
            if (tbl && tbl.style.display === 'none') {
                tbl.style.display = 'block';
                if (icon) icon.textContent = 'visibility_off';
                if (txt) txt.textContent = 'Ocultar';
            } else if (tbl) {
                tbl.style.display = 'none';
                if (icon) icon.textContent = 'visibility';
                if (txt) txt.textContent = 'Ver historial';
            }
        };
    }

    const toggleWeightsBtn = document.getElementById('toggle-weights-btn');
    if (toggleWeightsBtn) {
        toggleWeightsBtn.onclick = () => {
            const tbl = document.getElementById('da-weights-table');
            const icon = document.getElementById('toggle-weights-icon');
            const txt = document.getElementById('toggle-weights-text');
            if (tbl && tbl.style.display === 'none') {
                tbl.style.display = 'block';
                if (icon) icon.textContent = 'visibility_off';
                if (txt) txt.textContent = 'Ocultar';
            } else if (tbl) {
                tbl.style.display = 'none';
                if (icon) icon.textContent = 'visibility';
                if (txt) txt.textContent = 'Ver historial';
            }
        };
    }
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
            await restFetch('/rest/v1/ganado?id=eq.' + animalId, {
                method: 'PATCH',
                body: JSON.stringify({ image_url: url }),
            });
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
    
    document.getElementById('form-add-vaccine').onsubmit = function(e) {
        e.preventDefault();
        var form = e.target;
        var formData = new FormData(form);
        var selectedDate = formData.get('fecha');
        var obs = formData.get('observaciones')?.trim();

        var vacData = {
            animal_id: animalId,
            empresa_id: window._currentEmpresaId,
            nombre: formData.get('nombre'),
            fecha: selectedDate,
            dosis: formData.get('dosis'),
        };
        if (obs) vacData.observaciones = obs;

        var today = getLocalToday();
        var isTodayOrPast = selectedDate <= today;
        vacData.estado = isTodayOrPast ? 'Aplicada' : 'Programada';

        closeModal();
        restFetch('/rest/v1/animal_vacunas', {
            method: 'POST',
            body: JSON.stringify(vacData),
            headers: { 'Prefer': 'return=representation' }
        }).then(function(result) {
            var vac = Array.isArray(result) ? result[0] : result;
            var anim = currentAnimal;
            if (isTodayOrPast && anim && vac) {
                sendWhatsApp(
                    '✅ Vacuna Aplicada\nAnimal: ' + anim.nombre + '\nVacuna: ' + vac.nombre + '\nDosis: ' + (vac.dosis || 'N/A') + '\nObservación: ' + (vac.observaciones || 'N/A') + '\nFecha: ' + vac.fecha + '\nFinca: ' + (window._empresaNombre || '')
                );
            }
            showSnackbar(isTodayOrPast ? 'Vacuna aplicada' : 'Vacuna programada');
            loadAllData(animalId, document.getElementById('da-container'));
        }).catch(function(err) {
            showSnackbar(err.message, 'error');
        });
    };
}

window.handleAddVaccine = handleAddVaccine;

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
            const pesoVal = parseFloat(formData.get('peso'));
            const fechaPeso = formData.get('fecha');

            const tempId = 'w_' + Date.now();
            const newWeightObj = {
                id: tempId,
                animal_id: animalId,
                empresa_id: window._currentEmpresaId,
                peso: pesoVal,
                fecha: fechaPeso,
                created_at: new Date().toISOString()
            };

            // 1. Guardar de inmediato en IndexedDB
            if (db.animal_pesajes) {
                await db.animal_pesajes.put(newWeightObj).catch(() => {});
            }

            // 2. Actualizar estado en memoria al instante
            weights = weights.filter(w => w.id !== tempId);
            weights.push(newWeightObj);
            weights.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
            calculateWeightStats(weights);

            showSnackbar('Pesaje registrado ✓');
            closeModal();
            window._daCurrentTab = 'pesajes';
            window._daWeightsOpen = true;

            // 3. Renderizar pantalla al instante con el nuevo peso y gráfico
            const container = document.getElementById('da-container');
            if (container) {
                renderFullContent(container, animalId, null, 'pesajes');
                setTimeout(() => initChart(), 50);
            }

            // 4. Sincronizar con Supabase en segundo plano
            restInsert('/rest/v1/animal_pesajes', {
                animal_id: animalId,
                empresa_id: window._currentEmpresaId,
                peso: pesoVal,
                fecha: fechaPeso
            }).then(async (res) => {
                if (res?.id && db.animal_pesajes) {
                    await db.animal_pesajes.delete(tempId).catch(() => {});
                    newWeightObj.id = res.id;
                    await db.animal_pesajes.put(newWeightObj).catch(() => {});
                    const idx = weights.findIndex(w => w.id === tempId);
                    if (idx !== -1) weights[idx].id = res.id;
                }
            }).catch(err => console.warn('Sync pesaje error:', err));

            if (currentAnimal) {
                sendWhatsApp(
                    '⚖️ Peso Registrado\nAnimal: ' + currentAnimal.nombre +
                    '\nPeso: ' + pesoVal + ' ' + (currentAnimal.peso_unidad || 'kg') +
                    '\nFecha: ' + fechaPeso +
                    '\nFinca: ' + (window._empresaNombre || '')
                );
            }
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
            const isTodayOrPast = selectedDate <= today;
            const estadoVal = isTodayOrPast ? 'Aplicada' : 'Programada';

            const result = await restFetch('/rest/v1/animal_fumigaciones', {
                method: 'POST',
                body: JSON.stringify({
                    animal_id: animalId,
                    empresa_id: window._currentEmpresaId,
                    producto: formData.get('producto'),
                    fecha: selectedDate,
                    dosis: formData.get('dosis'),
                    observaciones: formData.get('observaciones'),
                    estado: estadoVal
                }),
                headers: { 'Prefer': 'return=representation' }
            });
            const fum = Array.isArray(result) ? result[0] : result;

            if (isTodayOrPast && currentAnimal && fum) {
                sendWhatsApp(
                    '✅ Fumigación Aplicada\nAnimal: ' + currentAnimal.nombre +
                    '\nProducto: ' + fum.producto +
                    '\nDosis: ' + (fum.dosis || 'N/A') +
                    '\nObservación: ' + (fum.observaciones || 'N/A') +
                    '\nFecha: ' + fum.fecha +
                    '\nFinca: ' + (window._empresaNombre || '')
                );
            }

            showSnackbar(isTodayOrPast ? 'Fumigación aplicada' : 'Fumigación programada');
            closeModal();
            loadAllData(animalId, document.getElementById('da-container'));
        } catch (err) { showSnackbar(err.message, 'error'); }
    };
}

function renderWeekDays(containerId, isFumig) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const y = isFumig ? currentYearFumig : currentYear;
    const m = isFumig ? currentMonthFumig : currentMonth;
    const selDay = isFumig ? selectedDayFumig : selectedDayVaccines;
    const eventsList = isFumig ? fumigaciones : vaccines;

    const baseDate = new Date(y, m, selDay || 1);
    const dayOfWeek = baseDate.getDay();
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(baseDate);
    monday.setDate(baseDate.getDate() + diffToMon);

    const mobDateEl = document.getElementById(isFumig ? 'da-cal-mob-date-fumig' : 'da-cal-mob-date');
    const monthEl = document.getElementById(isFumig ? 'calendar-month-grid-fumig' : 'calendar-month-grid');
    const isMonthOpen = monthEl && monthEl.classList.contains('open');

    if (mobDateEl) {
        if (isMonthOpen) {
            const mDate = new Date(y, m, 1);
            const mName = mDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            mobDateEl.textContent = mName.charAt(0).toUpperCase() + mName.slice(1);
        } else {
            const fullDate = new Date(y, m, selDay || 1);
            const dayName = fullDate.toLocaleDateString('es-ES', { weekday: 'short' });
            const dayCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);
            const monthName = fullDate.toLocaleDateString('es-ES', { month: 'short' });
            const monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1).replace('.', '');
            mobDateEl.textContent = `${dayCap}, ${selDay || 1} ${monthCap}`;
        }
    }

    const dayLetters = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
    let html = '';
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        const dayNum = d.getDate();
        const dMonth = d.getMonth();
        const dYear = d.getFullYear();
        const isSel = (dayNum === selDay && dMonth === m && dYear === y);

        const dayEvents = eventsList.filter(ev => {
            if ((ev.estado || 'Aplicada') === 'Cancelada') return false;
            const [ey, em, ed] = ev.fecha.split('-').map(Number);
            return ey === dYear && (em - 1) === dMonth && ed === dayNum;
        });
        const hasEv = dayEvents.length > 0;
        const todayStr = getLocalToday();
        const hasAtrasada = dayEvents.some(ev => ev.estado === 'Programada' && ev.fecha < todayStr);
        const hasPend = dayEvents.some(ev => ev.estado === 'Programada');

        let dotHtml = '';
        if (hasEv) {
            const dotColor = isSel ? '#ffffff' : (hasAtrasada ? '#ff4103' : (hasPend ? '#c9a227' : '#2d3e2c'));
            dotHtml = `<div class="da-cal-strip-dot" style="background:${dotColor};"></div>`;
        }

        html += `
            <div class="da-cal-strip-day ${isSel ? 'selected' : ''}" onclick="window.selectCalendarDay(${dYear}, ${dMonth}, ${dayNum}, ${isFumig})">
                <div class="da-cal-strip-name">${dayLetters[i]}</div>
                <div class="da-cal-strip-num">${dayNum}</div>
                ${dotHtml}
            </div>
        `;
    }
    container.innerHTML = html;
    if (monthEl && monthEl.classList.contains('open')) {
        container.style.display = 'none';
    } else {
        container.style.display = 'flex';
    }
}

window.toggleCalendarView = (type) => {
    const isFumig = type === 'fumig';
    const weekEl = document.getElementById(isFumig ? 'calendar-week-days-fumig' : 'calendar-week-days');
    const monthEl = document.getElementById(isFumig ? 'calendar-month-grid-fumig' : 'calendar-month-grid');
    const textEl = document.getElementById(isFumig ? 'da-cal-toggle-text-fumig' : 'da-cal-toggle-text');
    const iconEl = document.getElementById(isFumig ? 'da-cal-toggle-icon-fumig' : 'da-cal-toggle-icon');
    const mobDateEl = document.getElementById(isFumig ? 'da-cal-mob-date-fumig' : 'da-cal-mob-date');
    if (!monthEl || !weekEl) return;

    const y = isFumig ? currentYearFumig : currentYear;
    const m = isFumig ? currentMonthFumig : currentMonth;
    const selDay = isFumig ? selectedDayFumig : selectedDayVaccines;

    const isMonthVisible = monthEl.classList.contains('open');
    if (isMonthVisible) {
        monthEl.classList.remove('open');
        weekEl.style.display = 'flex';
        if (textEl) textEl.textContent = 'Ver mes';
        if (iconEl) iconEl.textContent = 'calendar_month';
        if (mobDateEl) {
            const fullDate = new Date(y, m, selDay || 1);
            const dayName = fullDate.toLocaleDateString('es-ES', { weekday: 'short' });
            const dayCap = dayName.charAt(0).toUpperCase() + dayName.slice(1);
            const monthName = fullDate.toLocaleDateString('es-ES', { month: 'short' });
            const monthCap = monthName.charAt(0).toUpperCase() + monthName.slice(1).replace('.', '');
            mobDateEl.textContent = `${dayCap}, ${selDay || 1} ${monthCap}`;
        }
    } else {
        monthEl.classList.add('open');
        weekEl.style.display = 'none';
        if (textEl) textEl.textContent = 'Ver semana';
        if (iconEl) iconEl.textContent = 'view_week';
        if (mobDateEl) {
            const mDate = new Date(y, m, 1);
            const mName = mDate.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });
            mobDateEl.textContent = mName.charAt(0).toUpperCase() + mName.slice(1);
        }
    }
};

window.navCalPrev = (isFumig) => {
    const monthEl = document.getElementById(isFumig ? 'calendar-month-grid-fumig' : 'calendar-month-grid');
    const isMonthView = monthEl && monthEl.classList.contains('open');

    if (isMonthView) {
        if (isFumig) {
            currentMonthFumig--;
            if (currentMonthFumig < 0) { currentMonthFumig = 11; currentYearFumig--; }
            renderCalendarFumig();
        } else {
            currentMonth--;
            if (currentMonth < 0) { currentMonth = 11; currentYear--; }
            renderCalendar();
        }
    } else {
        if (isFumig) {
            const cur = new Date(currentYearFumig, currentMonthFumig, selectedDayFumig || 1);
            cur.setDate(cur.getDate() - 7);
            currentYearFumig = cur.getFullYear();
            currentMonthFumig = cur.getMonth();
            selectedDayFumig = cur.getDate();
            renderCalendarFumig();
        } else {
            const cur = new Date(currentYear, currentMonth, selectedDayVaccines || 1);
            cur.setDate(cur.getDate() - 7);
            currentYear = cur.getFullYear();
            currentMonth = cur.getMonth();
            selectedDayVaccines = cur.getDate();
            renderCalendar();
        }
    }
};

window.navCalNext = (isFumig) => {
    const monthEl = document.getElementById(isFumig ? 'calendar-month-grid-fumig' : 'calendar-month-grid');
    const isMonthView = monthEl && monthEl.classList.contains('open');

    if (isMonthView) {
        if (isFumig) {
            currentMonthFumig++;
            if (currentMonthFumig > 11) { currentMonthFumig = 0; currentYearFumig++; }
            renderCalendarFumig();
        } else {
            currentMonth++;
            if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            renderCalendar();
        }
    } else {
        if (isFumig) {
            const cur = new Date(currentYearFumig, currentMonthFumig, selectedDayFumig || 1);
            cur.setDate(cur.getDate() + 7);
            currentYearFumig = cur.getFullYear();
            currentMonthFumig = cur.getMonth();
            selectedDayFumig = cur.getDate();
            renderCalendarFumig();
        } else {
            const cur = new Date(currentYear, currentMonth, selectedDayVaccines || 1);
            cur.setDate(cur.getDate() + 7);
            currentYear = cur.getFullYear();
            currentMonth = cur.getMonth();
            selectedDayVaccines = cur.getDate();
            renderCalendar();
        }
    }
};

window.selectCalendarDay = (y, m, d, isFumig) => {
    if (isFumig) {
        currentYearFumig = y;
        currentMonthFumig = m;
        selectedDayFumig = d;
        renderCalendarFumig();
    } else {
        currentYear = y;
        currentMonth = m;
        selectedDayVaccines = d;
        renderCalendar();
    }
};

window.goToVaccineDate = (fechaStr) => {
    if (!fechaStr) return;
    const [y, m, d] = fechaStr.split('-').map(Number);
    currentYear = y;
    currentMonth = m - 1;
    selectedDayVaccines = d;

    // Activar pestaña de vacunas
    document.querySelectorAll('.da-stat-tab').forEach(c => c.classList.remove('active'));
    const vacTab = document.querySelector('.da-stat-tab[data-tab="vacunas"]');
    if (vacTab) vacTab.classList.add('active');
    document.querySelectorAll('.da-tabs-content-area .da-tab-content').forEach(c => c.classList.remove('active'));
    const vacContent = document.getElementById('da-tab-vacunas');
    if (vacContent) vacContent.classList.add('active');

    renderCalendar();
    setTimeout(() => {
        const panel = document.getElementById('da-day-details-panel');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
};

window.goToFumigDate = (fechaStr) => {
    if (!fechaStr) return;
    const [y, m, d] = fechaStr.split('-').map(Number);
    currentYearFumig = y;
    currentMonthFumig = m - 1;
    selectedDayFumig = d;

    // Activar pestaña de fumigación
    document.querySelectorAll('.da-stat-tab').forEach(c => c.classList.remove('active'));
    const fumTab = document.querySelector('.da-stat-tab[data-tab="fumigacion"]');
    if (fumTab) fumTab.classList.add('active');
    document.querySelectorAll('.da-tabs-content-area .da-tab-content').forEach(c => c.classList.remove('active'));
    const fumContent = document.getElementById('da-tab-fumigacion');
    if (fumContent) fumContent.classList.add('active');

    renderCalendarFumig();
    setTimeout(() => {
        const panel = document.getElementById('da-day-details-panel-fumig');
        if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
};

window.showAllPendingInline = (keepActiveCard = false) => {
    window._daCurrentTab = 'pendientes';
    if (!keepActiveCard) {
        document.querySelectorAll('.da-stat-tab').forEach(c => c.classList.remove('active'));
        const pendCard = document.querySelector('.da-stat-pending-pill');
        if (pendCard) pendCard.classList.add('active');
    }
    document.querySelectorAll('.da-tabs-content-area .da-tab-content').forEach(c => c.classList.remove('active'));
    const vacContent = document.getElementById('da-tab-vacunas');
    if (vacContent) vacContent.classList.add('active');

    const panel = document.getElementById('da-day-details-panel');
    if (!panel) return;

    const today = getLocalToday();
    const pendVac = vaccines.filter(v => v.estado === 'Programada').map(v => ({
        ...v,
        tipo: 'vacuna',
        tipoLabel: 'Vacunación',
        icon: '💉',
        productoNombre: v.nombre
    }));
    const pendFum = fumigaciones.filter(f => f.estado === 'Programada').map(f => ({
        ...f,
        tipo: 'fumigacion',
        tipoLabel: 'Fumigación',
        icon: '🛡️',
        productoNombre: f.producto
    }));
    const allPending = [...pendVac, ...pendFum].sort((a, b) => a.fecha.localeCompare(b.fecha));
    const isSold = currentAnimal?.estado === 'Vendido';

    const cardsHtml = allPending.length === 0
        ? `
            <div style="text-align:center; color:#888; padding:24px 12px; background:#f9fbf9; border-radius:14px; border:1px dashed #d0ded0; margin-bottom:14px;">
                <span class="material-icons" style="font-size:36px; color:#2d3e2c; opacity:0.6; margin-bottom:6px;">event_available</span>
                <p style="font-size:13.5px; font-weight:700; color:#444; margin:0;">¡Todo al día!</p>
                <p style="font-size:11.5px; color:#777; margin:4px 0 0;">No hay actividades pendientes para este animal.</p>
            </div>
        `
        : allPending.map(item => {
            const isAtrasada = item.fecha < today;
            let daysAtrasada = 0;
            if (isAtrasada) {
                const d1 = new Date(item.fecha + 'T00:00:00');
                const d2 = new Date(today + 'T00:00:00');
                daysAtrasada = Math.max(1, Math.floor((d2 - d1) / 86400000));
            }
            const dateStr = new Date(item.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

            let badgeBg = '#c9a227';
            let badgeText = 'Programada';
            if (isAtrasada) {
                badgeBg = '#d9480f';
                badgeText = `Atrasada (${daysAtrasada} día${daysAtrasada === 1 ? '' : 's'})`;
            }

            let actionsHtml = '';
            if (!isSold) {
                const applyHandler = item.tipo === 'vacuna' ? `window.confirmVaccine('${item.id}')` : `window.confirmFumigacion('${item.id}')`;
                const editHandler = item.tipo === 'vacuna' ? `window.editVaccine('${item.id}')` : `window.editFumigacion('${item.id}')`;
                const cancelHandler = item.tipo === 'vacuna' ? `window.cancelVaccine('${item.id}')` : `window.cancelFumigacion('${item.id}')`;
                actionsHtml = `
                    <div class="plan-ev-actions" style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
                        <button class="plan-btn-primary" style="padding:6px 14px; font-size:12px;" onclick="${applyHandler}">
                            <span class="material-icons" style="font-size:16px;">check</span> Aplicar
                        </button>
                        <button class="plan-btn-ghost" style="padding:6px 14px; font-size:12px;" onclick="${editHandler}">
                            <span class="material-icons" style="font-size:16px;">edit</span> Editar
                        </button>
                        <button class="plan-btn-danger" style="padding:6px 12px; font-size:12px;" onclick="${cancelHandler}" title="Cancelar">
                            <span class="material-icons" style="font-size:16px;">close</span> Cancelar
                        </button>
                    </div>
                `;
            }

            return `
                <div class="plan-ev" style="border:1.5px solid ${isAtrasada ? '#ff9800' : '#ffe9a8'}; margin-bottom:12px; border-radius:18px; width:100%; box-sizing:border-box;">
                    <div class="plan-ev-head" style="display:flex; align-items:center; justify-content:space-between; gap:6px; width:100%; margin-bottom:6px;">
                        <span style="font-size:11.5px; font-weight:700; color:#666; display:inline-flex; align-items:center; gap:5px;">
                            <span style="font-size:16px;">${item.icon}</span> ${item.tipoLabel}
                        </span>
                        <span class="plan-ev-badge" style="background:${badgeBg}; color:#fff; font-size:10.5px; font-weight:800; padding:4px 10px; border-radius:9999px; text-transform:uppercase; white-space:nowrap; flex-shrink:0;">${badgeText}</span>
                    </div>

                    <div style="margin-bottom:4px;">
                        <p class="plan-ev-producto" style="font-size:16px; font-weight:800; margin:0; color:#1a1a1a; line-height:1.3;">${item.productoNombre}</p>
                    </div>

                    <div class="plan-ev-meta" style="font-size:12.5px; color:#444; margin:10px 0 4px; display:flex; flex-direction:column; gap:6px; width:100%;">
                        <div style="display:flex; align-items:center; gap:6px; font-size:12.5px;">
                            <span class="material-icons" style="font-size:16px; color:#2d3e2c;">calendar_today</span>
                            <span><strong>Fecha:</strong> ${dateStr}</span>
                        </div>
                        <div style="display:flex; align-items:center; gap:6px; font-size:12.5px;">
                            <span class="material-icons" style="font-size:16px; color:#2d3e2c;">medication</span>
                            <span><strong>Dosis:</strong> ${item.dosis ? item.dosis : '<span style="color:#888;">No especificada</span>'}</span>
                        </div>
                        <div style="display:flex; align-items:flex-start; gap:6px; font-size:12px; background:#f7f9f7; padding:8px 12px; border-radius:10px; border:1px solid #e2ece1; color:#333;">
                            <span class="material-icons" style="font-size:16px; color:#2d3e2c; margin-top:1px; flex-shrink:0;">notes</span>
                            <span style="line-height:1.35;"><strong>Observaciones:</strong> ${item.observaciones ? item.observaciones : '<span style="color:#888;">Sin observaciones</span>'}</span>
                        </div>
                    </div>

                    ${actionsHtml}
                </div>
            `;
        }).join('');

    panel.innerHTML = `
        <div class="da-day-details">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:8px; border-bottom:1.5px solid #eef2ee; padding-bottom:10px;">
                <div>
                    <span style="font-size:11px; font-weight:800; text-transform:uppercase; color:#b76e00; letter-spacing:0.5px; display:inline-flex; align-items:center; gap:4px;">
                        <span class="material-icons" style="font-size:15px; color:#b76e00;">schedule</span> Actividades Pendientes
                    </span>
                    <h4 style="margin:2px 0 0; font-size:16px; font-weight:800; color:#1a1a1a;">${allPending.length} actividad${allPending.length === 1 ? '' : 'es'} por realizar</h4>
                </div>
            </div>

            <div style="margin-bottom:12px;">
                ${cardsHtml}
            </div>
        </div>
    `;

    setTimeout(() => {
        panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 80);
};

window.goToFirstPending = () => {
    window.showAllPendingInline();
};

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
        const isSelected = day === selectedDayVaccines;
        const dayVaccines = monthVaccines.filter(v => {
            const [, , d] = v.fecha.split('-').map(Number);
            return d === day;
        });
        const hasEvent = dayVaccines.length > 0;
        const todayStr = getLocalToday();
        const hasAtrasada = dayVaccines.some(v => v.estado === 'Programada' && v.fecha < todayStr);
        const hasPending = dayVaccines.some(v => v.estado === 'Programada');
        
        let cls = 'da-cal-day';
        if (isToday) cls += ' da-cal-today';
        if (isSelected) cls += ' da-cal-selected-day';
        if (hasEvent) {
            cls += ' da-cal-has-event';
            if (hasAtrasada) {
                cls += ' da-cal-has-pending da-cal-day-pending-highlight';
            } else if (hasPending) {
                cls += ' da-cal-has-pending da-cal-day-pending-highlight';
            } else {
                cls += ' da-cal-day-done';
            }
        }
        
        const dayEl = document.createElement('div');
        dayEl.className = cls;
        let dotsHtml = '';
        if (hasEvent) {
            if (hasAtrasada) {
                dotsHtml = '<div class="da-cal-pending-dot" style="background:#ff4103;"></div>';
            } else if (hasPending) {
                dotsHtml = '<div class="da-cal-pending-dot"></div>';
            } else {
                dotsHtml = '<div class="da-cal-event-dot"></div>';
            }
            if (dayVaccines.length > 1) {
                dotsHtml += `<span class="plan-cal-count">${dayVaccines.length}</span>`;
            }
        }
        dayEl.innerHTML = `<span>${day}</span>${dotsHtml}`;
        dayEl.onclick = () => {
            selectedDayVaccines = day;
            renderCalendar();
            showDayDetails(day, dayVaccines);
        };
        daysContainer.appendChild(dayEl);
    }

    if (selectedDayVaccines && selectedDayVaccines <= lastDay) {
        const currentDayVaccines = monthVaccines.filter(v => {
            const [, , d] = v.fecha.split('-').map(Number);
            return d === selectedDayVaccines;
        });
        showDayDetails(selectedDayVaccines, currentDayVaccines);
    }
    const sortedVaccines = [...vaccines].sort((a, b) => b.fecha.localeCompare(a.fecha));
    renderVaccinesTable(sortedVaccines, 1);
    renderWeekDays('calendar-week-days', false);
}

function showDayDetails(day, dayEvents) {
    const panel = document.getElementById('da-day-details-panel');
    if (!panel) return;
    
    const formattedDate = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dateFormatted = new Date(currentYear, currentMonth, day).toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    
    const todayStr = getLocalToday();
    const isPast = formattedDate < todayStr;
    const isToday = formattedDate === todayStr;
    const isSold = currentAnimal?.estado === 'Vendido';

    let actionButtonHtml = '';
    if (!isSold) {
        if (isPast) {
            actionButtonHtml = `
                <button type="button" class="plan-btn-add-inline" onclick="window.triggerInlineVaccine('${formattedDate}', 'Registrar')" style="background:#eef7ee; border:1.5px solid #2d3e2c; color:#2d3e2c; margin-top:12px;">
                    <span class="material-symbols-outlined" style="font-size:20px; color:#2d3e2c; vertical-align:middle;">post_add</span>
                    <span>Registrar Vacuna Realizada en esta fecha</span>
                </button>
            `;
        } else if (isToday) {
            actionButtonHtml = `
                <button type="button" class="plan-btn-add-inline" onclick="window.triggerInlineVaccine('${formattedDate}', 'Registrar')" style="margin-top:12px;">
                    <span class="material-symbols-outlined" style="font-size:20px; vertical-align:middle;">add_circle</span>
                    <span>Registrar Vacuna Realizada Hoy</span>
                </button>
            `;
        } else {
            actionButtonHtml = `
                <button type="button" class="plan-btn-add-inline" onclick="window.triggerInlineVaccine('${formattedDate}', 'Programar')" style="margin-top:12px;">
                    <span class="material-symbols-outlined" style="font-size:20px; vertical-align:middle;">calendar_add_on</span>
                    <span>Programar Vacuna Futura</span>
                </button>
            `;
        }
    }

    const overdueVaccines = vaccines.filter(v => v.estado === 'Programada' && v.fecha < todayStr);
    let overdueBannerHtml = '';
    if (overdueVaccines.length > 0 && !overdueVaccines.some(ov => ov.fecha === formattedDate)) {
        overdueBannerHtml = overdueVaccines.map(ov => {
            const d1 = new Date(ov.fecha + 'T00:00:00');
            const d2 = new Date(todayStr + 'T00:00:00');
            const dDiff = Math.max(1, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
            const ovDateStr = new Date(ov.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
            return `
                <div style="background:#fff3e0; border:1.5px solid #ffb74d; border-radius:14px; padding:12px 14px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <div style="display:flex; align-items:flex-start; gap:10px;">
                        <span class="material-icons" style="color:#d9480f; font-size:22px; margin-top:2px;">error_outline</span>
                        <div>
                            <div style="font-size:13px; font-weight:800; color:#d9480f;">Vacuna atrasada (hace ${dDiff} día${dDiff === 1 ? '' : 's'})</div>
                            <div style="font-size:12px; color:#444; margin-top:2px;"><strong>${ov.nombre}</strong> estaba programada para el <strong>${ovDateStr}</strong></div>
                        </div>
                    </div>
                    <button type="button" class="btn-m3-tonal" onclick="window.goToVaccineDate('${ov.fecha}')" style="padding:6px 14px; font-size:12px; border-radius:9999px; background:#ffe0b2; color:#bf360c; border:none; font-weight:700; cursor:pointer; white-space:nowrap;">
                        Ir a fecha
                    </button>
                </div>
            `;
        }).join('');
    }

    const dayVacc = vaccines.filter(v => v.fecha === formattedDate && (v.estado || 'Aplicada') !== 'Cancelada').map(v => ({
        ...v, tipo: 'vacuna', tipoLabel: 'Vacunación', icon: '💉', productoNombre: v.nombre
    }));

    const cardsHtml = (dayVacc && dayVacc.length > 0)
        ? dayVacc.map(v => {
            const currentEstado = v.estado || 'Aplicada';
            const isPastOrToday = v.fecha <= todayStr;
            const isRealizada = currentEstado === 'Aplicada';
            const isCancelada = currentEstado === 'Cancelada';
            const isProgramada = currentEstado === 'Programada';

            const isAtrasada = isProgramada && v.fecha < todayStr;
            let daysAtrasada = 0;
            if (isAtrasada) {
                const d1 = new Date(v.fecha + 'T00:00:00');
                const d2 = new Date(todayStr + 'T00:00:00');
                daysAtrasada = Math.max(1, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
            }

            let badgeBg = '#2d3e2c';
            let badgeText = 'Aplicada';
            if (isAtrasada) {
                badgeBg = '#d9480f';
                badgeText = `Atrasada (${daysAtrasada} día${daysAtrasada === 1 ? '' : 's'})`;
            } else if (isProgramada) {
                badgeBg = '#c9a227';
                badgeText = 'Programada';
            } else if (isCancelada) {
                badgeBg = '#ff4103';
                badgeText = 'Cancelada';
            }

            let actionsHtml = '';
            if (isProgramada && !isSold) {
                const applyHandler = v.tipo === 'vacuna' ? `window.confirmVaccine('${v.id}')` : `window.confirmFumigacion('${v.id}')`;
                const editHandler = v.tipo === 'vacuna' ? `window.editVaccine('${v.id}')` : `window.editFumigacion('${v.id}')`;
                const cancelHandler = v.tipo === 'vacuna' ? `window.cancelVaccine('${v.id}')` : `window.cancelFumigacion('${v.id}')`;
                actionsHtml = `
                    <div class="plan-ev-actions" style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
                        <button class="plan-btn-primary" style="padding:6px 14px; font-size:12px;" onclick="${applyHandler}">
                            <span class="material-icons" style="font-size:16px;">check</span> Aplicar
                        </button>
                        <button class="plan-btn-ghost" style="padding:6px 14px; font-size:12px;" onclick="${editHandler}">
                            <span class="material-icons" style="font-size:16px;">edit</span> Editar
                        </button>
                        <button class="plan-btn-danger" style="padding:6px 12px; font-size:12px;" onclick="${cancelHandler}" title="Cancelar">
                            <span class="material-icons" style="font-size:16px;">close</span> Cancelar
                        </button>
                    </div>
                `;
            } else if (!isSold) {
                const editHandler = v.tipo === 'vacuna' ? `window.editVaccine('${v.id}')` : `window.editFumigacion('${v.id}')`;
                actionsHtml = `
                    <div class="plan-ev-actions" style="display:flex; gap:8px; margin-top:10px; justify-content:flex-end;">
                        <button class="plan-btn-ghost" style="padding:4px 10px; font-size:11.5px;" onclick="${editHandler}">
                            <span class="material-icons" style="font-size:15px;">edit</span> Editar
                        </button>
                    </div>
                `;
            }

            return `
                <div class="plan-ev" style="border:1.5px solid ${isRealizada ? '#c8e6c9' : isAtrasada ? '#ff9800' : isProgramada ? '#ffe9a8' : '#ffcdd2'}; margin-bottom:12px; border-radius:18px; width:100%; box-sizing:border-box;">
                    <div class="plan-ev-head" style="display:flex; align-items:center; justify-content:space-between; gap:6px; width:100%; margin-bottom:6px;">
                        <span style="font-size:11.5px; font-weight:700; color:#666; display:inline-flex; align-items:center; gap:5px;">
                            <span style="font-size:16px;">${v.icon || '💉'}</span> ${v.tipoLabel || 'Vacunación'}
                        </span>
                        <span class="plan-ev-badge" style="background:${badgeBg}; color:#fff; font-size:10.5px; font-weight:800; padding:4px 10px; border-radius:9999px; text-transform:uppercase; white-space:nowrap; flex-shrink:0;">${badgeText}</span>
                    </div>

                    <div style="margin-bottom:4px;">
                        <p class="plan-ev-producto" style="font-size:16px; font-weight:800; margin:0; color:#1a1a1a; line-height:1.3;">${v.productoNombre || v.nombre}</p>
                    </div>

                    <div class="plan-ev-meta" style="font-size:12.5px; color:#444; margin:10px 0 4px; display:flex; flex-direction:column; gap:6px; width:100%;">
                        <div style="display:flex; align-items:center; gap:6px; font-size:12.5px;">
                            <span class="material-icons" style="font-size:16px; color:#2d3e2c;">medication</span>
                            <span><strong>Dosis:</strong> ${v.dosis ? v.dosis : '<span style="color:#888;">No especificada</span>'}</span>
                        </div>
                        <div style="display:flex; align-items:flex-start; gap:6px; font-size:12px; background:#f7f9f7; padding:8px 12px; border-radius:10px; border:1px solid #e2ece1; color:#333;">
                            <span class="material-icons" style="font-size:16px; color:#2d3e2c; margin-top:1px; flex-shrink:0;">notes</span>
                            <span style="line-height:1.35;"><strong>Observaciones:</strong> ${v.observaciones ? v.observaciones : '<span style="color:#888;">Sin observaciones</span>'}</span>
                        </div>
                    </div>

                    ${actionsHtml}
                </div>
            `;
        }).join('')
        : `
            <div style="text-align:center; color:#888; padding:24px 12px; background:#f9fbf9; border-radius:14px; border:1px dashed #d0ded0; margin-bottom:14px;">
                <span class="material-icons" style="font-size:36px; color:#2d3e2c; opacity:0.6; margin-bottom:6px;">event_available</span>
                <p style="font-size:13.5px; font-weight:700; color:#444; margin:0;">Sin actividades ${isPast ? 'registradas' : 'programadas'}</p>
                <p style="font-size:11.5px; color:#777; margin:4px 0 0;">${isPast ? 'Fecha pasada' : 'Usa el botón de abajo para agregar una vacuna'}</p>
            </div>
        `;

    const hasAtrasadaDay = dayEvents && dayEvents.some(v => v.estado === 'Programada' && v.fecha < todayStr);

    panel.innerHTML = `
        <div class="da-day-details">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:8px; border-bottom:1.5px solid #eef2ee; padding-bottom:10px;">
                <div>
                    <span style="font-size:11px; font-weight:800; text-transform:uppercase; color:${hasAtrasadaDay ? '#d9480f' : '#2d3e2c'}; letter-spacing:0.5px; display:inline-flex; align-items:center; gap:4px;">
                        ${hasAtrasadaDay ? '<span class="material-icons" style="font-size:15px; color:#d9480f;">warning</span> Actividades atrasadas del día' : 'Actividades del día'}
                    </span>
                    <h4 style="margin:2px 0 0; font-size:16px; font-weight:800; color:#1a1a1a; text-transform:capitalize;">${dateFormatted}</h4>
                </div>
            </div>

            <div style="margin-bottom:12px;">
                ${cardsHtml}
            </div>

            ${actionButtonHtml}
        </div>
    `;
}

window.triggerInlineVaccine = (formattedDate, tipo) => {
    if (currentAnimal && currentAnimal.id) {
        const parts = formattedDate.split('-').map(Number);
        const dayVaccines = vaccines.filter(v => {
            const [y, m, d] = v.fecha.split('-').map(Number);
            return y === parts[0] && (m - 1) === (parts[1] - 1) && d === parts[2];
        });
        showInlineVaccineForm(currentAnimal.id, formattedDate, dayVaccines, tipo);
    }
};

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

    document.getElementById('form-inline-vaccine').onsubmit = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const selectedDate = formData.get('fecha');
        if (tipo === 'Registrar' && selectedDate > getLocalToday()) {
            showSnackbar('No puedes registrar una vacuna en una fecha futura. Usa "Programar" en su lugar.', 'error');
            return;
        }
        const estadoVal = tipo === 'Registrar' ? 'Aplicada' : 'Programada';

        const payload = {
            animal_id: animalId,
            empresa_id: window._currentEmpresaId,
            nombre: formData.get('nombre'),
            fecha: selectedDate,
            estado: estadoVal
        };
        const dosis = formData.get('dosis')?.trim();
        if (dosis) payload.dosis = dosis;
        const obs = formData.get('observaciones')?.trim();
        if (obs) payload.observaciones = obs;

        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const dateStr = new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', dateOptions);
        const confirmMsg = `¿Deseas ${tipo === 'Registrar' ? 'registrar' : 'programar'} esta vacuna para el ${dateStr}?`;

        window.Snackbar.confirm(confirmMsg, async () => {
            try {
                await restInsert('/rest/v1/animal_vacunas', payload);

                showSnackbar(tipo === 'Registrar' ? 'Vacuna registrada ✓' : 'Vacuna programada ✓');

                if (tipo === 'Registrar' && currentAnimal) {
                    sendWhatsApp(
                        '✅ Vacuna Aplicada\nAnimal: ' + currentAnimal.nombre +
                        '\nVacuna: ' + payload.nombre +
                        '\nDosis: ' + (payload.dosis || 'N/A') +
                        '\nObservación: ' + (payload.observaciones || 'N/A') +
                        '\nFecha: ' + payload.fecha +
                        '\nFinca: ' + (window._empresaNombre || '')
                    );
                }

                await loadAllData(animalId, document.getElementById('da-container'));
            } catch (err) {
                console.error(err);
                showSnackbar(err.message, 'error');
            }
        }, { confirmLabel: 'Aceptar', cancelLabel: 'Cancelar' });
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

    document.getElementById('form-inline-fumig').onsubmit = (e) => {
        e.preventDefault();
        const formData = new FormData(e.target);
        const selectedDate = formData.get('fecha');
        if (tipo === 'Registrar' && selectedDate > getLocalToday()) {
            showSnackbar('No puedes registrar una fumigación en una fecha futura. Usa "Programar" en su lugar.', 'error');
            return;
        }
        const estadoVal = tipo === 'Registrar' ? 'Aplicada' : 'Programada';

        const payload = {
            animal_id: animalId,
            empresa_id: window._currentEmpresaId,
            producto: formData.get('producto'),
            fecha: selectedDate,
            estado: estadoVal
        };
        const dosis = formData.get('dosis')?.trim();
        if (dosis) payload.dosis = dosis;
        const obs = formData.get('observaciones')?.trim();
        if (obs) payload.observaciones = obs;

        const dateOptions = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
        const dateStr = new Date(selectedDate + 'T12:00:00').toLocaleDateString('es-ES', dateOptions);
        const confirmMsg = `¿Deseas ${tipo === 'Registrar' ? 'registrar' : 'programar'} esta fumigación para el ${dateStr}?`;

        window.Snackbar.confirm(confirmMsg, async () => {
            try {
                await restInsert('/rest/v1/animal_fumigaciones', payload);

                showSnackbar(tipo === 'Registrar' ? 'Fumigación registrada ✓' : 'Fumigación programada ✓');

                if (tipo === 'Registrar' && currentAnimal) {
                    sendWhatsApp(
                        '✅ Fumigación Aplicada\nAnimal: ' + currentAnimal.nombre +
                        '\nProducto: ' + payload.producto +
                        '\nDosis: ' + (payload.dosis || 'N/A') +
                        '\nObservación: ' + (payload.observaciones || 'N/A') +
                        '\nFecha: ' + payload.fecha +
                        '\nFinca: ' + (window._empresaNombre || '')
                    );
                }

                await loadAllData(animalId, document.getElementById('da-container'));
            } catch (err) {
                console.error(err);
                showSnackbar(err.message, 'error');
            }
        }, { confirmLabel: 'Aceptar', cancelLabel: 'Cancelar' });
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
    formContainer.style.cssText = 'margin-bottom: 16px; padding: 18px 20px; border-radius: 20px; border: 1.5px solid #2d3e2c; background: #fbfdfb; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 4px 16px rgba(45,62,44,0.08);';
    formContainer.innerHTML = `
        <h4 style="font-size:16px; font-weight:800; color:#1a1a1a; margin:0 0 4px; display:flex; align-items:center; gap:6px;">
            <span class="material-symbols-outlined" style="font-size:20px; color:#2d3e2c;">scale</span>
            <span>Registrar Nuevo Peso</span>
        </h4>
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
                <button type="submit" class="btn-m3-fill">Registrar</button>
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
        const submitBtn = e.target.querySelector('button[type="submit"]');
        if (submitBtn) submitBtn.disabled = true;

        try {
            const pesoVal = parseFloat(formData.get('peso'));
            const fechaPeso = formData.get('fecha');

            const tempId = 'w_' + Date.now();
            const newWeightObj = {
                id: tempId,
                animal_id: animalId,
                empresa_id: window._currentEmpresaId,
                peso: pesoVal,
                fecha: fechaPeso,
                created_at: new Date().toISOString()
            };

            // 1. Guardar de inmediato en IndexedDB
            if (db.animal_pesajes) {
                await db.animal_pesajes.put(newWeightObj).catch(() => {});
            }

            // 2. Actualizar estado en memoria al instante
            weights = weights.filter(w => w.id !== tempId);
            weights.push(newWeightObj);
            weights.sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
            calculateWeightStats(weights);

            window._daCurrentTab = 'pesajes';
            window._daWeightsOpen = true;

            // 3. Renderizar pantalla al instante con el nuevo peso y gráfico
            const container = document.getElementById('da-container');
            if (container) {
                renderFullContent(container, animalId, null, 'pesajes');
                setTimeout(() => initChart(), 50);
            }
            showSnackbar('Pesaje registrado ✓');

            // 4. Sincronizar con Supabase en segundo plano
            restInsert('/rest/v1/animal_pesajes', {
                animal_id: animalId,
                empresa_id: window._currentEmpresaId,
                peso: pesoVal,
                fecha: fechaPeso
            }).then(async (res) => {
                if (res?.id && db.animal_pesajes) {
                    await db.animal_pesajes.delete(tempId).catch(() => {});
                    newWeightObj.id = res.id;
                    await db.animal_pesajes.put(newWeightObj).catch(() => {});
                    const idx = weights.findIndex(w => w.id === tempId);
                    if (idx !== -1) weights[idx].id = res.id;
                }
            }).catch(err => console.warn('Sync pesaje error:', err));

            if (currentAnimal) {
                sendWhatsApp(
                    '⚖️ Peso Registrado\nAnimal: ' + currentAnimal.nombre +
                    '\nPeso: ' + pesoVal + ' ' + (currentAnimal.peso_unidad || 'kg') +
                    '\nFecha: ' + fechaPeso +
                    '\nFinca: ' + (window._empresaNombre || '')
                );
            }
        } catch (err) {
            showSnackbar(err.message, 'error');
            if (submitBtn) submitBtn.disabled = false;
        }
    };
}

// ─── Inline Fumigacion Form (duplicate for calendar)

function renderVaccinesTable(allVaccines, page) {
    const table = document.getElementById('da-vaccines-table');
    if (!table) return;

    allVaccines = (allVaccines || []).filter(v => (v.estado || 'Aplicada') !== 'Cancelada');

    vaccinesPage = page || vaccinesPage;
    const total = allVaccines.length;
    const totalPages = Math.ceil(total / DA_PAGE_SIZE);
    const from = (vaccinesPage - 1) * DA_PAGE_SIZE;
    const paged = allVaccines.slice(from, from + DA_PAGE_SIZE);

    if (total === 0) {
        table.innerHTML = `
            <div class="da-empty-state" style="padding: 24px; text-align: center; color: #888;">
                <span class="material-icons" style="font-size: 40px; color: #2d3e2c; opacity: 0.5; margin-bottom: 8px;">vaccines</span>
                <p style="margin: 0; font-weight: 600;">No hay vacunas registradas en este periodo.</p>
            </div>
        `;
        return;
    }

    const today = getLocalToday();
    const isSold = currentAnimal?.estado === 'Vendido';

    const cardsHtml = paged.map(v => {
        const isProgramada = v.estado === 'Programada';
        const isCancelada = v.estado === 'Cancelada';
        const isAtrasada = isProgramada && v.fecha < today;
        const isPastOrToday = v.fecha <= today;

        let badgeBg = '#e8f5e9';
        let badgeColor = '#2e7d32';
        let badgeBorder = '#c8e6c9';
        let badgeIcon = 'check_circle';
        let badgeText = 'Aplicada';

        if (isAtrasada) {
            const d1 = new Date(v.fecha + 'T00:00:00');
            const d2 = new Date(today + 'T00:00:00');
            const daysDiff = Math.max(1, Math.floor((d2 - d1) / 86400000));
            badgeBg = '#fff8f0';
            badgeColor = '#b76e00';
            badgeBorder = '#ffe2b8';
            badgeIcon = 'warning';
            badgeText = `Atrasada (${daysDiff}d)`;
        } else if (isProgramada) {
            badgeBg = '#f5f7f5';
            badgeColor = '#555';
            badgeBorder = '#e0e5df';
            badgeIcon = 'schedule';
            badgeText = 'Programada';
        } else if (isCancelada) {
            badgeBg = '#fdf2f2';
            badgeColor = '#b91c1c';
            badgeBorder = '#fecaca';
            badgeIcon = 'cancel';
            badgeText = 'Cancelada';
        }

        const dateStr = new Date(v.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

        return `
            <div style="background: #ffffff; border: 1px solid #e0e6df; border-radius: 16px; padding: 16px; margin-bottom: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.04); transition: all 0.2s ease;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
                    <span style="font-size: 12px; font-weight: 700; color: #666; display: inline-flex; align-items: center; gap: 5px;">
                        <span style="font-size: 16px;">💉</span> Vacunación
                    </span>
                    <span style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; font-size: 10.5px; font-weight: 800; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase; display: inline-flex; align-items: center; gap: 4px; letter-spacing: 0.3px;">
                        <span class="material-icons" style="font-size: 13px;">${badgeIcon}</span>
                        ${badgeText}
                    </span>
                </div>

                <div style="font-size: 15.5px; font-weight: 800; color: #1a1a1a; margin-bottom: 10px; line-height: 1.3;">
                    ${v.nombre}
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px; margin: 8px 0 10px;">
                    <div style="display: inline-flex; align-items: center; gap: 6px; background: #f8faf8; border: 1px solid #edf2ed; padding: 5px 12px; border-radius: 8px; font-size: 12.5px; color: #333; width: fit-content;">
                        <span class="material-icons" style="font-size: 15px; color: #2d3e2c;">calendar_today</span>
                        <span>${dateStr}</span>
                    </div>
                    <div style="display: inline-flex; align-items: center; gap: 6px; background: #f8faf8; border: 1px solid #edf2ed; padding: 5px 12px; border-radius: 8px; font-size: 12.5px; color: #333; width: fit-content;">
                        <span class="material-icons" style="font-size: 15px; color: #2d3e2c;">medication</span>
                        <span><strong>Dosis:</strong> ${v.dosis ? v.dosis : '<span style="color:#888;">No especificada</span>'}</span>
                    </div>
                </div>

                <div style="background: #fbfdfb; border: 1px solid #eef2ee; border-radius: 10px; padding: 8px 12px; font-size: 12px; color: #333; display: flex; align-items: flex-start; gap: 6px;">
                    <span class="material-icons" style="font-size: 15px; color: #2d3e2c; margin-top: 1px; flex-shrink: 0;">notes</span>
                    <span style="line-height: 1.35;"><strong>Observaciones:</strong> ${v.observaciones ? v.observaciones : '<span style="color:#888;">Sin observaciones</span>'}</span>
                </div>
            </div>
        `;
    }).join('');

    const paginationHtml = totalPages > 1 ? `
        <div class="da-pagination" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; margin-top: 12px; background: #f8faf8; border-radius: 14px;">
            <span style="font-size: 12px; color: #666;">
                Mostrando <strong>${from + 1}–${Math.min(from + DA_PAGE_SIZE, total)}</strong> de <strong>${total}</strong>
            </span>
            <div style="display: flex; gap: 8px; align-items: center;">
                <button class="da-pagination-btn" id="vac-prev-btn" ${vaccinesPage <= 1 ? 'disabled' : ''} style="width: 36px; height: 36px; border-radius: 10px; border: 1px solid #ddd; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Anterior">
                    <span class="material-icons" style="font-size: 18px;">chevron_left</span>
                </button>
                <span style="font-size: 13px; font-weight: 700; color: #2d3e2c;">${vaccinesPage} / ${totalPages}</span>
                <button class="da-pagination-btn" id="vac-next-btn" ${vaccinesPage >= totalPages ? 'disabled' : ''} style="width: 36px; height: 36px; border-radius: 10px; border: 1px solid #ddd; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Siguiente">
                    <span class="material-icons" style="font-size: 18px;">chevron_right</span>
                </button>
            </div>
        </div>
    ` : '';

    table.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
            ${cardsHtml}
            ${paginationHtml}
        </div>
    `;

    const prevBtn = document.getElementById('vac-prev-btn');
    const nextBtn = document.getElementById('vac-next-btn');
    if (prevBtn) prevBtn.onclick = () => { if (vaccinesPage > 1) renderVaccinesTable(allVaccines, vaccinesPage - 1); };
    if (nextBtn) nextBtn.onclick = () => { if (vaccinesPage < totalPages) renderVaccinesTable(allVaccines, vaccinesPage + 1); };
    if (nextBtn) nextBtn.onclick = () => { if (vaccinesPage < totalPages) renderVaccinesTable(allVaccines, vaccinesPage + 1); };
}

window.deleteWeight = (weightId) => {
    window.Snackbar.confirm('¿Deseas eliminar este registro de pesaje?', async () => {
        try {
            // 1. Eliminar de IndexedDB
            if (db.animal_pesajes) {
                await db.animal_pesajes.delete(weightId).catch(() => {});
            }

            // 2. Eliminar de memoria y recalcular estadísticas
            weights = weights.filter(w => w.id !== weightId);
            calculateWeightStats(weights);

            window._daCurrentTab = 'pesajes';
            window._daWeightsOpen = true;

            // 3. Renderizar pantalla al instante con el nuevo estado
            const container = document.getElementById('da-container');
            if (container) {
                renderFullContent(container, currentAnimal.id, null, 'pesajes');
                setTimeout(() => initChart(), 50);
            }
            showSnackbar('Pesaje eliminado ✓');

            // 4. Sincronizar borrado con Supabase en segundo plano
            restFetch('/rest/v1/animal_pesajes?id=eq.' + weightId, { method: 'DELETE' }).catch(err => console.warn('Delete weight error:', err));
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    }, { confirmLabel: 'Eliminar', cancelLabel: 'Cancelar' });
};

function renderWeightsTable(page) {
    const table = document.getElementById('da-weights-table');
    if (!table) return;

    weightsPage = page || weightsPage;
    const sortedWeights = [...weights].reverse();
    const total = sortedWeights.length;
    const totalPages = Math.ceil(total / DA_PAGE_SIZE);
    const from = (weightsPage - 1) * DA_PAGE_SIZE;
    const paged = sortedWeights.slice(from, from + DA_PAGE_SIZE);
    const unit = currentAnimal?.peso_unidad || 'kg';
    const isSold = currentAnimal?.estado === 'Vendido';

    if (total === 0) {
        table.innerHTML = `
            <div style="background:#ffffff; border:1.5px dashed #cfd8dc; border-radius:20px; padding:32px 18px; text-align:center; color:#777; margin-top:12px;">
                <span class="material-symbols-outlined" style="font-size:42px; color:#2d3e2c; opacity:0.4; margin-bottom:8px;">scale</span>
                <p style="font-size:15px; font-weight:700; color:#222; margin:0;">Sin registros de pesaje</p>
                <p style="font-size:12.5px; color:#666; margin:4px 0 0;">Toca "+ Registrar" arriba para ingresar el primer peso.</p>
            </div>
        `;
        return;
    }

    const cardsHtml = paged.map((w, i) => {
        const globalIdx = from + i;
        const next = sortedWeights[globalIdx + 1];
        let diff = next ? parseFloat(w.peso) - parseFloat(next.peso) : 0;
        const trend = diff > 0 ? 'positive' : (diff < 0 ? 'negative' : 'neutral');

        const dateObj = new Date(w.fecha + 'T12:00:00');
        const dateFormatted = dateObj.toLocaleDateString('es-ES', {
            weekday: 'short', day: 'numeric', month: 'short', year: 'numeric'
        });

        // Ganancia media diaria si hay registro previo
        let gmdHtml = '';
        if (next) {
            const d1 = new Date(w.fecha + 'T00:00:00');
            const d2 = new Date(next.fecha + 'T00:00:00');
            const daysBetween = Math.max(1, Math.round((d1 - d2) / 86400000));
            if (daysBetween > 0 && diff !== 0) {
                const gPerDay = Math.round((diff / daysBetween) * 1000);
                const isPositive = gPerDay > 0;
                gmdHtml = `
                    <div style="display:inline-flex; align-items:center; gap:5px; font-size:11.5px; color:${isPositive ? '#1b5e20' : '#b71c1c'}; background:${isPositive ? '#edf7ed' : '#fdf2f2'}; border:1px solid ${isPositive ? '#c8e6c9' : '#fecaca'}; padding:4px 10px; border-radius:10px; font-weight:700;">
                        <span class="material-icons" style="font-size:14px;">speed</span>
                        <span>${isPositive ? '+' : ''}${gPerDay} g/día · ${daysBetween}d</span>
                    </div>
                `;
            } else if (daysBetween > 0) {
                gmdHtml = `
                    <div style="display:inline-flex; align-items:center; gap:5px; font-size:11.5px; color:#555; background:#f5f7f5; border:1px solid #e0e5df; padding:4px 10px; border-radius:10px; font-weight:700;">
                        <span class="material-icons" style="font-size:14px;">schedule</span>
                        <span>Mismo peso · ${daysBetween}d</span>
                    </div>
                `;
            }
        } else {
            gmdHtml = `
                <div style="display:inline-flex; align-items:center; gap:5px; font-size:11.5px; color:#2d3e2c; background:#eef4ec; border:1px solid #d4e2d4; padding:4px 10px; border-radius:10px; font-weight:700;">
                    <span class="material-icons" style="font-size:14px;">flag</span>
                    <span>Pesaje inicial</span>
                </div>
            `;
        }

        let badgeBg = '#f5f7f5';
        let badgeColor = '#555';
        let badgeBorder = '#e0e5df';
        let badgeIcon = 'remove';
        let badgeText = `0.0 ${unit}`;

        if (trend === 'positive') {
            badgeBg = '#e8f5e9';
            badgeColor = '#1e7e34';
            badgeBorder = '#c3e6cb';
            badgeIcon = 'trending_up';
            badgeText = `+${diff.toFixed(1)} ${unit}`;
        } else if (trend === 'negative') {
            badgeBg = '#fff0f0';
            badgeColor = '#cf222e';
            badgeBorder = '#ffd1d1';
            badgeIcon = 'trending_down';
            badgeText = `${diff.toFixed(1)} ${unit}`;
        }

        let deleteBtnHtml = '';
        if (!isSold) {
            deleteBtnHtml = `
                <button type="button" class="btn-m3-tonal" onclick="window.deleteWeight('${w.id}')" style="width:32px; height:32px; border-radius:50%; padding:0; display:inline-flex; align-items:center; justify-content:center; background:#fff4f2; color:#c92a2a; border:1px solid #ffc9c9; cursor:pointer; margin-left:auto; flex-shrink:0;" title="Eliminar este pesaje">
                    <span class="material-icons" style="font-size:16px;">delete_outline</span>
                </button>
            `;
        }

        return `
            <div style="background:#ffffff; border:1.5px solid #e2e8e0; border-radius:20px; padding:16px 18px; margin-bottom:12px; box-shadow:0 2px 8px rgba(0,0,0,0.03);">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
                    <div style="display:inline-flex; align-items:center; gap:6px; color:#2d3e2c; font-weight:700; font-size:13px; text-transform:capitalize;">
                        <span class="material-icons" style="font-size:16px; color:#2d3e2c; opacity:0.85;">calendar_today</span>
                        <span>${dateFormatted}</span>
                    </div>
                    <span style="background:${badgeBg}; color:${badgeColor}; border:1px solid ${badgeBorder}; font-size:11px; font-weight:800; padding:3px 10px; border-radius:9999px; display:inline-flex; align-items:center; gap:4px; white-space:nowrap;">
                        <span class="material-icons" style="font-size:14px;">${badgeIcon}</span> ${badgeText}
                    </span>
                </div>

                <div style="display:flex; align-items:baseline; gap:5px; margin:2px 0 10px;">
                    <span style="font-size:28px; font-weight:900; color:#1a1a1a; letter-spacing:-0.5px; line-height:1;">${w.peso}</span>
                    <span style="font-size:15px; font-weight:800; color:#666; text-transform:uppercase;">${unit}</span>
                </div>

                <div style="display:flex; align-items:center; gap:8px; justify-content:space-between; border-top:1px solid #f2f5f2; padding-top:10px; margin-top:4px;">
                    ${gmdHtml}
                    ${deleteBtnHtml}
                </div>
            </div>
        `;
    }).join('');

    const paginationHtml = totalPages > 1 ? `
        <div class="da-pagination" style="display:flex; align-items:center; justify-content:space-between; margin-top:14px; padding:8px 4px;">
            <span class="da-pagination-info" style="font-size:12.5px; color:#666;">
                Mostrando <strong>${from + 1}–${Math.min(from + DA_PAGE_SIZE, total)}</strong> de <strong>${total}</strong>
            </span>
            <div class="da-pagination-controls" style="display:flex; align-items:center; gap:8px;">
                <button class="da-pagination-btn" id="wt-prev-btn" ${weightsPage <= 1 ? 'disabled' : ''} title="Anterior" style="width:32px; height:32px; border-radius:50%; border:1px solid #d0ded0; background:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer;">
                    <span class="material-icons" style="font-size:18px;">chevron_left</span>
                </button>
                <span style="font-size:13px; font-weight:700; color:#1a1a1a;">${weightsPage} / ${totalPages}</span>
                <button class="da-pagination-btn" id="wt-next-btn" ${weightsPage >= totalPages ? 'disabled' : ''} title="Siguiente" style="width:32px; height:32px; border-radius:50%; border:1px solid #d0ded0; background:#fff; display:flex; align-items:center; justify-content:center; cursor:pointer;">
                    <span class="material-icons" style="font-size:18px;">chevron_right</span>
                </button>
            </div>
        </div>
    ` : '';

    table.innerHTML = `
        <div style="display:flex; flex-direction:column; gap:2px;">
            ${cardsHtml}
            ${paginationHtml}
        </div>
    `;

    const prevBtn = document.getElementById('wt-prev-btn');
    const nextBtn = document.getElementById('wt-next-btn');
    if (prevBtn) prevBtn.onclick = () => { if (weightsPage > 1) renderWeightsTable(weightsPage - 1); };
    if (nextBtn) nextBtn.onclick = () => { if (weightsPage < totalPages) renderWeightsTable(weightsPage + 1); };
}

function renderFumigacionesTable(allFumigaciones, page) {
    const table = document.getElementById('da-fumigaciones-table');
    if (!table) return;

    allFumigaciones = (allFumigaciones || []).filter(f => (f.estado || 'Aplicada') !== 'Cancelada');

    fumigPage = page || fumigPage;
    const total = allFumigaciones.length;
    const totalPages = Math.ceil(total / DA_PAGE_SIZE);
    const from = (fumigPage - 1) * DA_PAGE_SIZE;
    const paged = (allFumigaciones || []).slice(from, from + DA_PAGE_SIZE);

    if (total === 0) {
        table.innerHTML = `
            <div class="da-empty-state" style="padding: 24px; text-align: center; color: #888;">
                <span class="material-icons" style="font-size: 40px; color: #2d3e2c; opacity: 0.5; margin-bottom: 8px;">pest_control</span>
                <p style="margin: 0; font-weight: 600;">No hay registros de fumigación en este periodo.</p>
            </div>
        `;
        return;
    }

    const today = getLocalToday();
    const isSold = currentAnimal?.estado === 'Vendido';

    const cardsHtml = paged.map(f => {
        const isProgramada = f.estado === 'Programada';
        const isCancelada = f.estado === 'Cancelada';
        const isAtrasada = isProgramada && f.fecha < today;
        const isPastOrToday = f.fecha <= today;

        let badgeBg = '#e8f5e9';
        let badgeColor = '#2e7d32';
        let badgeBorder = '#c8e6c9';
        let badgeIcon = 'check_circle';
        let badgeText = 'Aplicada';

        if (isAtrasada) {
            const d1 = new Date(f.fecha + 'T00:00:00');
            const d2 = new Date(today + 'T00:00:00');
            const daysDiff = Math.max(1, Math.floor((d2 - d1) / 86400000));
            badgeBg = '#fff8f0';
            badgeColor = '#b76e00';
            badgeBorder = '#ffe2b8';
            badgeIcon = 'warning';
            badgeText = `Atrasada (${daysDiff}d)`;
        } else if (isProgramada) {
            badgeBg = '#f5f7f5';
            badgeColor = '#555';
            badgeBorder = '#e0e5df';
            badgeIcon = 'schedule';
            badgeText = 'Programada';
        } else if (isCancelada) {
            badgeBg = '#fdf2f2';
            badgeColor = '#b91c1c';
            badgeBorder = '#fecaca';
            badgeIcon = 'cancel';
            badgeText = 'Cancelada';
        }

        const dateStr = new Date(f.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });

        return `
            <div style="background: #ffffff; border: 1px solid #e0e6df; border-radius: 16px; padding: 16px; margin-bottom: 14px; box-shadow: 0 2px 6px rgba(0,0,0,0.04); transition: all 0.2s ease;">
                <div style="display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px;">
                    <span style="font-size: 12px; font-weight: 700; color: #666; display: inline-flex; align-items: center; gap: 5px;">
                        <span style="font-size: 16px;">🛡️</span> Fumigación
                    </span>
                    <span style="background: ${badgeBg}; color: ${badgeColor}; border: 1px solid ${badgeBorder}; font-size: 10.5px; font-weight: 800; padding: 3px 10px; border-radius: 9999px; text-transform: uppercase; display: inline-flex; align-items: center; gap: 4px; letter-spacing: 0.3px;">
                        <span class="material-icons" style="font-size: 13px;">${badgeIcon}</span>
                        ${badgeText}
                    </span>
                </div>

                <div style="font-size: 15.5px; font-weight: 800; color: #1a1a1a; margin-bottom: 10px; line-height: 1.3;">
                    ${f.producto}
                </div>

                <div style="display: flex; flex-direction: column; gap: 6px; margin: 8px 0 10px;">
                    <div style="display: inline-flex; align-items: center; gap: 6px; background: #f8faf8; border: 1px solid #edf2ed; padding: 5px 12px; border-radius: 8px; font-size: 12.5px; color: #333; width: fit-content;">
                        <span class="material-icons" style="font-size: 15px; color: #2d3e2c;">calendar_today</span>
                        <span>${dateStr}</span>
                    </div>
                    <div style="display: inline-flex; align-items: center; gap: 6px; background: #f8faf8; border: 1px solid #edf2ed; padding: 5px 12px; border-radius: 8px; font-size: 12.5px; color: #333; width: fit-content;">
                        <span class="material-icons" style="font-size: 15px; color: #2d3e2c;">medication</span>
                        <span><strong>Dosis:</strong> ${f.dosis ? f.dosis : '<span style="color:#888;">No especificada</span>'}</span>
                    </div>
                </div>

                <div style="background: #fbfdfb; border: 1px solid #eef2ee; border-radius: 10px; padding: 8px 12px; font-size: 12px; color: #333; display: flex; align-items: flex-start; gap: 6px;">
                    <span class="material-icons" style="font-size: 15px; color: #2d3e2c; margin-top: 1px; flex-shrink: 0;">notes</span>
                    <span style="line-height: 1.35;"><strong>Observaciones:</strong> ${f.observaciones ? f.observaciones : '<span style="color:#888;">Sin observaciones</span>'}</span>
                </div>
            </div>
        `;
    }).join('');

    const paginationHtml = totalPages > 1 ? `
        <div class="da-pagination" style="display: flex; align-items: center; justify-content: space-between; padding: 12px 16px; margin-top: 12px; background: #f8faf8; border-radius: 14px;">
            <span style="font-size: 12px; color: #666;">
                Mostrando <strong>${from + 1}–${Math.min(from + DA_PAGE_SIZE, total)}</strong> de <strong>${total}</strong>
            </span>
            <div style="display: flex; gap: 8px; align-items: center;">
                <button class="da-pagination-btn" id="fum-prev-btn" ${fumigPage <= 1 ? 'disabled' : ''} style="width: 36px; height: 36px; border-radius: 10px; border: 1px solid #ddd; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Anterior">
                    <span class="material-icons" style="font-size: 18px;">chevron_left</span>
                </button>
                <span style="font-size: 13px; font-weight: 700; color: #2d3e2c;">${fumigPage} / ${totalPages}</span>
                <button class="da-pagination-btn" id="fum-next-btn" ${fumigPage >= totalPages ? 'disabled' : ''} style="width: 36px; height: 36px; border-radius: 10px; border: 1px solid #ddd; background: #fff; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Siguiente">
                    <span class="material-icons" style="font-size: 18px;">chevron_right</span>
                </button>
            </div>
        </div>
    ` : '';

    table.innerHTML = `
        <div style="display: flex; flex-direction: column; gap: 4px;">
            ${cardsHtml}
            ${paginationHtml}
        </div>
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
        if ((f.estado || 'Aplicada') === 'Cancelada') return false;
        const [y, m, d] = f.fecha.split('-').map(Number);
        return (m - 1) === currentMonthFumig && y === currentYearFumig;
    });

    for (let day = 1; day <= lastDay; day++) {
        const isToday = day === new Date().getDate() && currentMonthFumig === new Date().getMonth() && currentYearFumig === new Date().getFullYear();
        const isSelected = day === selectedDayFumig;
        const dayFumigaciones = monthFumigaciones.filter(f => {
            const [, , d] = f.fecha.split('-').map(Number);
            return d === day;
        });
        const hasEvent = dayFumigaciones.length > 0;
        const todayStr = getLocalToday();
        const hasAtrasada = dayFumigaciones.some(f => f.estado === 'Programada' && f.fecha < todayStr);
        const hasPending = dayFumigaciones.some(f => f.estado === 'Programada');
        
        let cls = 'da-cal-day';
        if (isToday) cls += ' da-cal-today';
        if (isSelected) cls += ' da-cal-selected-day';
        if (hasEvent) {
            cls += ' da-cal-has-event';
            if (hasAtrasada) {
                cls += ' da-cal-has-pending da-cal-day-pending-highlight';
            } else if (hasPending) {
                cls += ' da-cal-has-pending da-cal-day-pending-highlight';
            } else {
                cls += ' da-cal-day-done';
            }
        }
        
        const dayEl = document.createElement('div');
        dayEl.className = cls;
        let dotsHtml = '';
        if (hasEvent) {
            if (hasAtrasada) {
                dotsHtml = '<div class="da-cal-pending-dot" style="background:#ff4103;"></div>';
            } else if (hasPending) {
                dotsHtml = '<div class="da-cal-pending-dot"></div>';
            } else {
                dotsHtml = '<div class="da-cal-event-dot" style="background: #2c666e;"></div>';
            }
            if (dayFumigaciones.length > 1) {
                dotsHtml += `<span class="plan-cal-count">${dayFumigaciones.length}</span>`;
            }
        }
        dayEl.innerHTML = `<span>${day}</span>${dotsHtml}`;
        dayEl.onclick = () => {
            selectedDayFumig = day;
            renderCalendarFumig();
            showDayDetailsFumig(day, dayFumigaciones);
        };
        daysContainer.appendChild(dayEl);
    }

    if (selectedDayFumig && selectedDayFumig <= lastDay) {
        const currentDayFumig = monthFumigaciones.filter(f => {
            const [, , d] = f.fecha.split('-').map(Number);
            return d === selectedDayFumig;
        });
        showDayDetailsFumig(selectedDayFumig, currentDayFumig);
    }
    const sortedFumig = [...fumigaciones].sort((a, b) => b.fecha.localeCompare(a.fecha));
    renderFumigacionesTable(sortedFumig, 1);
    renderWeekDays('calendar-week-days-fumig', true);
}

function showDayDetailsFumig(day, dayEvents) {
    const panel = document.getElementById('da-day-details-panel-fumig');
    if (!panel) return;
    
    const formattedDate = `${currentYearFumig}-${String(currentMonthFumig + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const dateFormatted = new Date(currentYearFumig, currentMonthFumig, day).toLocaleDateString('es-ES', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric'
    });
    
    const todayStr = getLocalToday();
    const isPast = formattedDate < todayStr;
    const isToday = formattedDate === todayStr;
    const isSold = currentAnimal?.estado === 'Vendido';

    let actionButtonHtml = '';
    if (!isSold) {
        if (isPast) {
            actionButtonHtml = `
                <button type="button" class="plan-btn-add-inline" onclick="window.triggerInlineFumig('${formattedDate}', 'Registrar')" style="background:#eef7ee; border:1.5px solid #2d3e2c; color:#2d3e2c; margin-top:12px;">
                    <span class="material-symbols-outlined" style="font-size:20px; color:#2d3e2c; vertical-align:middle;">post_add</span>
                    <span>Registrar Fumigación en esta fecha</span>
                </button>
            `;
        } else if (isToday) {
            actionButtonHtml = `
                <button type="button" class="plan-btn-add-inline" onclick="window.triggerInlineFumig('${formattedDate}', 'Registrar')" style="margin-top:12px;">
                    <span class="material-symbols-outlined" style="font-size:20px; vertical-align:middle;">add_circle</span>
                    <span>Registrar Fumigación Hoy</span>
                </button>
            `;
        } else {
            actionButtonHtml = `
                <button type="button" class="plan-btn-add-inline" onclick="window.triggerInlineFumig('${formattedDate}', 'Programar')" style="margin-top:12px;">
                    <span class="material-symbols-outlined" style="font-size:20px; vertical-align:middle;">calendar_add_on</span>
                    <span>Programar Fumigación Futura</span>
                </button>
            `;
        }
    }

    const overdueFumigaciones = fumigaciones.filter(f => f.estado === 'Programada' && f.fecha < todayStr);
    let overdueBannerHtml = '';
    if (overdueFumigaciones.length > 0 && !overdueFumigaciones.some(of => of.fecha === formattedDate)) {
        overdueBannerHtml = overdueFumigaciones.map(of => {
            const d1 = new Date(of.fecha + 'T00:00:00');
            const d2 = new Date(todayStr + 'T00:00:00');
            const dDiff = Math.max(1, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
            const ofDateStr = new Date(of.fecha + 'T12:00:00').toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'short' });
            return `
                <div style="background:#fff3e0; border:1.5px solid #ffb74d; border-radius:14px; padding:12px 14px; margin-bottom:14px; display:flex; align-items:center; justify-content:space-between; gap:10px;">
                    <div style="display:flex; align-items:flex-start; gap:10px;">
                        <span class="material-icons" style="color:#d9480f; font-size:22px; margin-top:2px;">error_outline</span>
                        <div>
                            <div style="font-size:13px; font-weight:800; color:#d9480f;">Fumigación atrasada (hace ${dDiff} día${dDiff === 1 ? '' : 's'})</div>
                            <div style="font-size:12px; color:#444; margin-top:2px;"><strong>${of.producto}</strong> estaba programada para el <strong>${ofDateStr}</strong></div>
                        </div>
                    </div>
                    <button type="button" class="btn-m3-tonal" onclick="window.goToFumigDate('${of.fecha}')" style="padding:6px 14px; font-size:12px; border-radius:9999px; background:#ffe0b2; color:#bf360c; border:none; font-weight:700; cursor:pointer; white-space:nowrap;">
                        Ir a fecha
                    </button>
                </div>
            `;
        }).join('');
    }

    const dayFum = fumigaciones.filter(f => f.fecha === formattedDate && (f.estado || 'Aplicada') !== 'Cancelada').map(f => ({
        ...f, tipo: 'fumigacion', tipoLabel: 'Fumigación', icon: '🛡️', productoNombre: f.producto
    }));

    const cardsHtml = (dayFum && dayFum.length > 0)
        ? dayFum.map(f => {
            const currentEstado = f.estado || 'Aplicada';
            const isPastOrToday = f.fecha <= todayStr;
            const isRealizada = currentEstado === 'Aplicada';
            const isCancelada = currentEstado === 'Cancelada';
            const isProgramada = currentEstado === 'Programada';

            const isAtrasada = isProgramada && f.fecha < todayStr;
            let daysAtrasada = 0;
            if (isAtrasada) {
                const d1 = new Date(f.fecha + 'T00:00:00');
                const d2 = new Date(todayStr + 'T00:00:00');
                daysAtrasada = Math.max(1, Math.floor((d2 - d1) / (1000 * 60 * 60 * 24)));
            }

            let badgeBg = '#2d3e2c';
            let badgeText = 'Aplicada';
            if (isAtrasada) {
                badgeBg = '#d9480f';
                badgeText = `Atrasada (${daysAtrasada} día${daysAtrasada === 1 ? '' : 's'})`;
            } else if (isProgramada) {
                badgeBg = '#c9a227';
                badgeText = 'Programada';
            } else if (isCancelada) {
                badgeBg = '#ff4103';
                badgeText = 'Cancelada';
            }

            let actionsHtml = '';
            if (isProgramada && !isSold) {
                const applyHandler = f.tipo === 'vacuna' ? `window.confirmVaccine('${f.id}')` : `window.confirmFumigacion('${f.id}')`;
                const editHandler = f.tipo === 'vacuna' ? `window.editVaccine('${f.id}')` : `window.editFumigacion('${f.id}')`;
                const cancelHandler = f.tipo === 'vacuna' ? `window.cancelVaccine('${f.id}')` : `window.cancelFumigacion('${f.id}')`;
                const applyRowF = isPastOrToday ? `
                    <button class="plan-btn-primary" style="padding:6px 14px; font-size:12px;" onclick="${applyHandler}">
                        <span class="material-icons" style="font-size:16px;">check</span> Aplicar
                    </button>
                    <button class="plan-btn-danger" style="padding:6px 12px; font-size:12px;" onclick="${cancelHandler}" title="Cancelar">
                        <span class="material-icons" style="font-size:16px;">close</span> Cancelar
                    </button>` : '';
                actionsHtml = `
                    <div class="plan-ev-actions" style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
                        ${applyRowF}
                        <button class="plan-btn-ghost" style="padding:6px 14px; font-size:12px;" onclick="${editHandler}">
                            <span class="material-icons" style="font-size:16px;">edit</span> Editar
                        </button>
                    </div>
                `;
            } else if (!isSold) {
                const editHandler = f.tipo === 'vacuna' ? `window.editVaccine('${f.id}')` : `window.editFumigacion('${f.id}')`;
                actionsHtml = `
                    <div class="plan-ev-actions" style="display:flex; gap:8px; margin-top:10px; justify-content:flex-end;">
                        <button class="plan-btn-ghost" style="padding:4px 10px; font-size:11.5px;" onclick="${editHandler}">
                            <span class="material-icons" style="font-size:15px;">edit</span> Editar
                        </button>
                    </div>
                `;
            }

            return `
                <div class="plan-ev" style="border:1.5px solid ${isRealizada ? '#c8e6c9' : isAtrasada ? '#ff9800' : isProgramada ? '#ffe9a8' : '#ffcdd2'}; margin-bottom:12px; border-radius:18px; width:100%; box-sizing:border-box;">
                    <div class="plan-ev-head" style="display:flex; align-items:center; justify-content:space-between; gap:6px; width:100%; margin-bottom:6px;">
                        <span style="font-size:11.5px; font-weight:700; color:#666; display:inline-flex; align-items:center; gap:5px;">
                            <span style="font-size:16px;">${f.icon || '🛡️'}</span> ${f.tipoLabel || 'Fumigación'}
                        </span>
                        <span class="plan-ev-badge" style="background:${badgeBg}; color:#fff; font-size:10.5px; font-weight:800; padding:4px 10px; border-radius:9999px; text-transform:uppercase; white-space:nowrap; flex-shrink:0;">${badgeText}</span>
                    </div>

                    <div style="margin-bottom:4px;">
                        <p class="plan-ev-producto" style="font-size:16px; font-weight:800; margin:0; color:#1a1a1a; line-height:1.3;">${f.productoNombre || f.producto}</p>
                    </div>

                    <div class="plan-ev-meta" style="font-size:12.5px; color:#444; margin:10px 0 4px; display:flex; flex-direction:column; gap:6px; width:100%;">
                        <div style="display:flex; align-items:center; gap:6px; font-size:12.5px;">
                            <span class="material-icons" style="font-size:16px; color:#2d3e2c;">medication</span>
                            <span><strong>Dosis:</strong> ${f.dosis ? f.dosis : '<span style="color:#888;">No especificada</span>'}</span>
                        </div>
                        <div style="display:flex; align-items:flex-start; gap:6px; font-size:12px; background:#f7f9f7; padding:8px 12px; border-radius:10px; border:1px solid #e2ece1; color:#333;">
                            <span class="material-icons" style="font-size:16px; color:#2d3e2c; margin-top:1px; flex-shrink:0;">notes</span>
                            <span style="line-height:1.35;"><strong>Observaciones:</strong> ${f.observaciones ? f.observaciones : '<span style="color:#888;">Sin observaciones</span>'}</span>
                        </div>
                    </div>

                    ${actionsHtml}
                </div>
            `;
        }).join('')
        : `
            <div style="text-align:center; color:#888; padding:24px 12px; background:#f9fbf9; border-radius:14px; border:1px dashed #d0ded0; margin-bottom:14px;">
                <span class="material-icons" style="font-size:36px; color:#2d3e2c; opacity:0.6; margin-bottom:6px;">event_available</span>
                <p style="font-size:13.5px; font-weight:700; color:#444; margin:0;">Sin actividades ${isPast ? 'registradas' : 'programadas'}</p>
                <p style="font-size:11.5px; color:#777; margin:4px 0 0;">${isPast ? 'Fecha pasada' : 'Usa el botón de abajo para agregar una fumigación'}</p>
            </div>
        `;

    const hasAtrasadaDay = dayEvents && dayEvents.some(f => f.estado === 'Programada' && f.fecha < todayStr);

    panel.innerHTML = `
        <div class="da-day-details">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:8px; border-bottom:1.5px solid #eef2ee; padding-bottom:10px;">
                <div>
                    <span style="font-size:11px; font-weight:800; text-transform:uppercase; color:${hasAtrasadaDay ? '#d9480f' : '#2d3e2c'}; letter-spacing:0.5px; display:inline-flex; align-items:center; gap:4px;">
                        ${hasAtrasadaDay ? '<span class="material-icons" style="font-size:15px; color:#d9480f;">warning</span> Actividades atrasadas del día' : 'Actividades del día'}
                    </span>
                    <h4 style="margin:2px 0 0; font-size:16px; font-weight:800; color:#1a1a1a; text-transform:capitalize;">${dateFormatted}</h4>
                </div>
            </div>

            <div style="margin-bottom:12px;">
                ${cardsHtml}
            </div>

            ${actionButtonHtml}
        </div>
    `;
}

window.triggerInlineFumig = (formattedDate, tipo) => {
    if (currentAnimal && currentAnimal.id) {
        const parts = formattedDate.split('-').map(Number);
        const dayFumig = fumigaciones.filter(f => {
            const [y, m, d] = f.fecha.split('-').map(Number);
            return y === parts[0] && (m - 1) === (parts[1] - 1) && d === parts[2];
        });
        showInlineFumigForm(currentAnimal.id, formattedDate, dayFumig, tipo);
    }
};

window.goToVaccineDate = (dateStr) => {
    if (!dateStr) return;
    const [y, m, d] = dateStr.split('-').map(Number);
    currentYear = y;
    currentMonth = m - 1;
    selectedDayVaccines = d;
    
    // Switch tab to vacunas
    const container = document.getElementById('da-container');
    if (container) {
        const contents = container.querySelectorAll('.da-tab-content');
        const statCards = container.querySelectorAll('.da-stat-tab');
        contents.forEach(c => c.classList.remove('active'));
        statCards.forEach(c => c.classList.remove('active'));
        const card = Array.from(statCards).find(c => c.getAttribute('data-tab') === 'vacunas');
        if (card) card.classList.add('active');
        const panel = document.getElementById('da-tab-vacunas');
        if (panel) panel.classList.add('active');
    }

    renderCalendar();
    const dayVacc = vaccines.filter(v => v.fecha === dateStr);
    showDayDetails(d, dayVacc);
};

window.goToFumigDate = (dateStr) => {
    if (!dateStr) return;
    const [y, m, d] = dateStr.split('-').map(Number);
    currentYearFumig = y;
    currentMonthFumig = m - 1;
    selectedDayFumig = d;
    
    // Switch tab to fumigacion
    const container = document.getElementById('da-container');
    if (container) {
        const contents = container.querySelectorAll('.da-tab-content');
        const statCards = container.querySelectorAll('.da-stat-tab');
        contents.forEach(c => c.classList.remove('active'));
        statCards.forEach(c => c.classList.remove('active'));
        const card = Array.from(statCards).find(c => c.getAttribute('data-tab') === 'fumigacion');
        if (card) card.classList.add('active');
        const panel = document.getElementById('da-tab-fumigacion');
        if (panel) panel.classList.add('active');
    }

    renderCalendarFumig();
    const dayFumig = fumigaciones.filter(f => f.fecha === dateStr);
    showDayDetailsFumig(d, dayFumig);
};

function initChart() {
    const ctx = document.getElementById('weightChart');
    if (!ctx) return;

    if (weightChart) {
        try {
            weightChart.destroy();
        } catch (e) {}
        weightChart = null;
    }

    if (!weights || weights.length === 0) return;

    const sorted = [...weights].sort((a, b) => new Date(a.fecha) - new Date(b.fecha));
    const labels = sorted.map(w => {
        if (!w.fecha) return '';
        const parts = w.fecha.split('-');
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`;
        }
        return new Date(w.fecha).toLocaleDateString();
    });
    const data = sorted.map(w => parseFloat(w.peso));

    weightChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                label: 'Peso (' + (currentAnimal?.peso_unidad || 'kg') + ')',
                data: data,
                borderColor: '#2d3e2c',
                backgroundColor: 'rgba(45, 62, 44, 0.08)',
                borderWidth: 2.5,
                tension: 0.35,
                fill: true,
                pointBackgroundColor: '#2d3e2c',
                pointBorderColor: '#ffffff',
                pointBorderWidth: 2,
                pointRadius: 5,
                pointHoverRadius: 7
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
                    grid: { color: 'rgba(0,0,0,0.06)' }
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
                    await restFetch('/rest/v1/animal_vacunas?id=eq.' + vaccineId, { method: 'DELETE' });
                    vaccines = vaccines.filter(x => x.id !== vaccineId);
                    if (db.animal_vacunas) {
                        await db.animal_vacunas.delete(vaccineId).catch(() => {});
                    }
                    syncTable('animal_vacunas');
                    showSnackbar('Vacuna eliminada');
                    renderCalendar();
                    const dayVac = vaccines.filter(x => x.fecha === v.fecha);
                    showDayDetails(selectedDayVaccines, dayVac);
                    if (currentAnimal) {
                        initDetalleAnimal(currentAnimal.id);
                    }
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
        
        try {
            const payload = {
                nombre: fd.get('nombre'),
                fecha: newFecha,
                dosis: fd.get('dosis') || null,
                observaciones: fd.get('observaciones') || null,
                estado: v.estado || 'Programada'
            };
            
            await restFetch('/rest/v1/animal_vacunas?id=eq.' + vaccineId, {
                method: 'PATCH',
                body: JSON.stringify(payload),
            });

            const idx = vaccines.findIndex(x => x.id === vaccineId);
            if (idx !== -1) {
                vaccines[idx] = { ...vaccines[idx], ...payload };
            }
            if (db.animal_vacunas) {
                const existing = await db.animal_vacunas.get(vaccineId).catch(() => null);
                if (existing) {
                    await db.animal_vacunas.put({ ...existing, ...payload }).catch(() => {});
                }
            }
            syncTable('animal_vacunas');
            showSnackbar('Vacuna actualizada ✓');

            const [y, m, d] = newFecha.split('-').map(Number);
            currentYear = y;
            currentMonth = m - 1;
            selectedDayVaccines = d;
            renderCalendar();
            const dayVac = vaccines.filter(x => x.fecha === newFecha);
            showDayDetails(d, dayVac);

            if (currentAnimal) {
                initDetalleAnimal(currentAnimal.id);
            }
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
                    await restFetch('/rest/v1/animal_fumigaciones?id=eq.' + fumigacionId, { method: 'DELETE' });
                    fumigaciones = fumigaciones.filter(x => x.id !== fumigacionId);
                    if (db.animal_fumigaciones) {
                        await db.animal_fumigaciones.delete(fumigacionId).catch(() => {});
                    }
                    syncTable('animal_fumigaciones');
                    showSnackbar('Fumigación eliminada');
                    renderCalendarFumig();
                    const dayFum = fumigaciones.filter(x => x.fecha === f.fecha);
                    showDayDetailsFumig(selectedDayFumig, dayFum);
                    if (currentAnimal) {
                        initDetalleAnimal(currentAnimal.id);
                    }
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

        try {
            const payload = {
                producto: fd.get('producto'),
                fecha: newFecha,
                dosis: fd.get('dosis') || null,
                observaciones: fd.get('observaciones') || null,
                estado: f.estado || 'Programada'
            };

            await restFetch('/rest/v1/animal_fumigaciones?id=eq.' + fumigacionId, {
                method: 'PATCH',
                body: JSON.stringify(payload),
            });

            const idx = fumigaciones.findIndex(x => x.id === fumigacionId);
            if (idx !== -1) {
                fumigaciones[idx] = { ...fumigaciones[idx], ...payload };
            }
            if (db.animal_fumigaciones) {
                const existing = await db.animal_fumigaciones.get(fumigacionId).catch(() => null);
                if (existing) {
                    await db.animal_fumigaciones.put({ ...existing, ...payload }).catch(() => {});
                }
            }
            syncTable('animal_fumigaciones');
            showSnackbar('Fumigación actualizada ✓');

            const [y, m, d] = newFecha.split('-').map(Number);
            currentYearFumig = y;
            currentMonthFumig = m - 1;
            selectedDayFumig = d;
            renderCalendarFumig();
            const dayFum = fumigaciones.filter(x => x.fecha === newFecha);
            showDayDetailsFumig(d, dayFum);

            if (currentAnimal) {
                initDetalleAnimal(currentAnimal.id);
            }
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    };
}
window.editFumigacion = (id) => handleEditFumigacion(id);

// ─── Reproducción ────────────────────────────────────────────────────────────

function renderPregnanciesHtml() {
    const isSold = currentAnimal?.estado === 'Vendido';
    const activePreg = pregnancies.find(p => p.estado === 'Preñada');

    if (!pregnancies || pregnancies.length === 0) {
        return `
            <div class="da-repro-empty-card">
                <div class="da-repro-empty-icon">
                    <img src="/cow.png" style="width:36px; height:36px; object-fit:contain; opacity:0.85;">
                </div>
                <h4 class="da-repro-empty-title">Sin historial reproductivo</h4>
                <p class="da-repro-empty-desc">Aún no se han registrado montas ni preñeces para esta hembra. Registra el inicio de gestación para hacer seguimiento de fechas y crías.</p>
                ${!isSold && !activePreg ? `
                <button type="button" class="m3-btn-expressive-primary" onclick="handleAddPregnancy('${currentAnimal.id}')" style="margin-top:16px;">
                    <span class="material-symbols-outlined">add_circle</span>
                    <span>Registrar primera preñez</span>
                </button>` : ''}
            </div>
        `;
    }

    return `
        <div class="da-repro-list">
            ${pregnancies.map(p => {
                const fechaMonta = p.fecha_monta ? new Date(p.fecha_monta + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
                const fechaParto = p.fecha_parto 
                    ? new Date(p.fecha_parto + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) 
                    : (p.fecha_probable_parto ? new Date(p.fecha_probable_parto + 'T00:00:00').toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' }) + ' (Est.)' : '—');
                
                let estadoBadge = '';
                if (p.estado === 'Preñada') {
                    estadoBadge = `
                        <span style="background:#fff3e0; color:#b26a00; border:1.5px solid #ffe0b2; padding:4px 12px; border-radius:9999px; font-size:12px; font-weight:800; display:inline-flex; align-items:center; gap:5px;">
                            <img src="/cow.png" style="width:15px; height:15px; object-fit:contain;"> Preñada
                        </span>`;
                } else if (p.estado === 'Parida') {
                    estadoBadge = `
                        <span style="background:#e8f5e9; color:#2e7d32; border:1.5px solid #c8e6c9; padding:4px 12px; border-radius:9999px; font-size:12px; font-weight:800; display:inline-flex; align-items:center; gap:5px;">
                            <span class="material-symbols-outlined" style="font-size:16px;">check_circle</span> Parida
                        </span>`;
                } else {
                    estadoBadge = `
                        <span style="background:#ffebee; color:#c62828; border:1.5px solid #ffcdd2; padding:4px 12px; border-radius:9999px; font-size:12px; font-weight:800; display:inline-flex; align-items:center; gap:5px;">
                            <span class="material-symbols-outlined" style="font-size:16px;">cancel</span> Aborto
                        </span>`;
                }

                return `
                    <div class="da-repro-card">
                        <div class="da-repro-card-top">
                            ${estadoBadge}
                            <div class="da-repro-card-date">
                                <span class="material-symbols-outlined" style="font-size:16px; color:#2d3e2c;">calendar_today</span>
                                <span>Monta: <strong>${fechaMonta}</strong></span>
                            </div>
                        </div>

                        <div class="da-repro-card-body">
                            <div class="da-repro-metric">
                                <span class="da-repro-metric-label">Parto ${p.estado === 'Preñada' ? 'Estimado' : 'Efectivo'}</span>
                                <span class="da-repro-metric-value">${fechaParto}</span>
                            </div>
                            <div class="da-repro-metric">
                                <span class="da-repro-metric-label">Crías Nacidas</span>
                                <span class="da-repro-metric-value">${p.num_crias ? `${p.num_crias} cría${p.num_crias > 1 ? 's' : ''}` : (p.estado === 'Preñada' ? 'En espera' : '—')}</span>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
    `;
}

function handleAddPregnancy(animalId) {
    const container = document.getElementById('da-pregnancy-inline');
    const addBtn = document.getElementById('da-add-pregnancy');
    if (!container) return;
    if (addBtn) addBtn.style.display = 'none';

    const today = getLocalToday();
    container.innerHTML = `
        <div class="da-inline-form-card" style="border:1.5px solid #d4ded3; border-radius:20px; padding:20px; margin-bottom:18px; background:#ffffff; box-shadow:0 4px 16px rgba(0,0,0,0.05);">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
                <div style="width:36px; height:36px; border-radius:10px; background:#f0f6ef; display:flex; align-items:center; justify-content:center;">
                    <img src="/cow.png" style="width:20px; height:20px; object-fit:contain;">
                </div>
                <h4 style="margin:0; font-size:16px; font-weight:800; color:#1a1a1a;">Registrar Preñez</h4>
            </div>
            <form id="form-add-pregnancy" style="display:flex; flex-direction:column; gap:16px;">
                <div class="m3-field">
                    <input type="date" name="fecha_monta" id="pregnancy-fecha-monta" value="${today}" placeholder=" " required>
                    <label>Fecha de Monta</label>
                </div>
                <div style="background:#f9fbf9; border:1.5px solid #e2ece1; border-radius:14px; padding:12px 16px; color:#2d3e2c; font-size:13.5px; display:flex; align-items:center; gap:8px;">
                    <span class="material-symbols-outlined" style="font-size:20px; color:#2d3e2c; flex-shrink:0;">event_available</span>
                    <span>Fecha estimada de parto: <strong id="pregnancy-fecha-probable" style="color:#1b5e20;">${addDays(today, 283)}</strong> <span style="color:#666; font-size:12px;">(283 días)</span></span>
                </div>
                <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap; margin-top:4px;">
                    <button type="button" class="m3-btn-expressive-tonal" id="cancel-inline-pregnancy" style="background:#f0f4ef; color:#2d3e2c; border:1px solid #d0ddd0;">Cancelar</button>
                    <button type="submit" class="m3-btn-expressive-primary">Guardar preñez</button>
                </div>
            </form>
        </div>
    `;

    const fechaMontaInput = document.getElementById('pregnancy-fecha-monta');
    const fechaProbableEl = document.getElementById('pregnancy-fecha-probable');
    if (fechaMontaInput && fechaProbableEl) {
        fechaMontaInput.addEventListener('change', () => {
            fechaProbableEl.textContent = addDays(fechaMontaInput.value || today, 283);
        });
    }

    document.getElementById('cancel-inline-pregnancy').onclick = () => {
        container.innerHTML = '';
        if (addBtn) addBtn.style.display = '';
    };

    document.getElementById('form-add-pregnancy').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const fechaMonta = fd.get('fecha_monta');
        const btn = document.querySelector('#form-add-pregnancy button[type="submit"]');
        btn.disabled = true;
        btn.innerHTML = '<span class="material-symbols-outlined animate-spin">sync</span> Guardando...';
        try {
            await restInsert('/rest/v1/animal_preñez', {
                animal_id: animalId,
                empresa_id: window._currentEmpresaId,
                fecha_monta: fechaMonta,
                fecha_probable_parto: addDays(fechaMonta, 283),
                estado: 'Preñada'
            });
            await restFetch('/rest/v1/ganado?id=eq.' + animalId, {
                method: 'PATCH',
                body: JSON.stringify({ reproductivo: 'Preñada' }),
            });
            showSnackbar('Preñez registrada');

            if (currentAnimal) {
                sendWhatsApp(
                    '🐮 Preñez Registrada\nAnimal: ' + currentAnimal.nombre +
                    '\nFecha de monta: ' + fechaMonta +
                    '\nParto estimado: ' + addDays(fechaMonta, 283) +
                    '\nFinca: ' + (window._empresaNombre || '')
                );
            }
            await loadAllData(animalId, document.getElementById('da-container'));
        } catch (err) {
            btn.disabled = false;
            btn.innerHTML = 'Guardar';
            showSnackbar(err.message, 'error');
        }
    };
}
window.handleAddPregnancy = handleAddPregnancy;

function renderPartoCriaFields(count) {
    let html = '';
    for (let i = 1; i <= count; i++) {
        html += `
            <div style="border:1px solid #eee;border-radius:12px;padding:14px;margin-bottom:12px;background:rgba(0,0,0,0.02);">
                <p style="margin:0 0 10px;font-weight:800;font-size:14px;color:#6b8245;">Cría ${i}</p>
                <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
                    <div class="m3-field">
                        <input type="text" name="cria_nombre_${i}" placeholder=" " autocomplete="off">
                        <label>Nombre</label>
                    </div>
                    <div class="m3-field">
                        <select name="cria_sexo_${i}">
                            <option value="Hembra">Hembra</option>
                            <option value="Macho">Macho</option>
                        </select>
                        <label>Sexo</label>
                    </div>
                </div>
                <div class="m3-field" style="margin-top:12px;">
                    <input type="number" step="0.1" name="cria_peso_${i}" placeholder=" ">
                    <label>Peso al nacer (${currentAnimal.peso_unidad || 'kg'})</label>
                </div>
            </div>`;
    }
    return html;
}

async function handleRegistrarParto(animalId) {
    const today = getLocalToday();
    showModal('Registrar Parto', `
        <form id="form-register-parto" style="display: flex; flex-direction: column; gap: 16px;">
            <div class="m3-field">
                <input type="date" name="fecha_parto" value="${today}" placeholder=" " required>
                <label>Fecha de Parto</label>
            </div>
            <div class="m3-field">
                <select name="num_crias" id="parto-num-crias" required>
                    <option value="1">1 cría</option>
                    <option value="2">2 crías (gemelos)</option>
                </select>
                <label>Número de crías</label>
            </div>
            <div id="parto-crias-fields">
                ${renderPartoCriaFields(1)}
            </div>
            <div style="display: flex; gap: 12px; justify-content: flex-end; margin-top: 8px;">
                <button type="button" class="btn-m3-tonal" id="cancel-parto">Cancelar</button>
                <button type="submit" class="btn-m3-fill">Guardar</button>
            </div>
        </form>
    `);

    document.getElementById('cancel-parto').onclick = closeModal;
    document.getElementById('parto-num-crias').addEventListener('change', (e) => {
        const container = document.getElementById('parto-crias-fields');
        if (container) container.innerHTML = renderPartoCriaFields(parseInt(e.target.value, 10) || 1);
    });

    document.getElementById('form-register-parto').onsubmit = async (e) => {
        e.preventDefault();
        const fd = new FormData(e.target);
        const fechaParto = fd.get('fecha_parto');
        const numCrias = parseInt(fd.get('num_crias'), 10) || 1;
        const btn = document.querySelector('#form-register-parto button[type="submit"]');
        btn.disabled = true;

        try {
            const preg = pregnancies.find(p => p.estado === 'Preñada');
            if (preg) {
                await restFetch('/rest/v1/animal_preñez?id=eq.' + preg.id, {
                    method: 'PATCH',
                    body: JSON.stringify({ estado: 'Parida', fecha_parto: fechaParto, num_crias: numCrias }),
                });
            }
            await restFetch('/rest/v1/ganado?id=eq.' + animalId, {
                method: 'PATCH',
                body: JSON.stringify({ reproductivo: 'Lactando' }),
            });

            const criasMessages = [];
            for (let i = 1; i <= numCrias; i++) {
                const nombre = (fd.get('cria_nombre_' + i) || '').trim();
                const sexo = fd.get('cria_sexo_' + i) || 'Hembra';
                const peso = parseFloat(fd.get('cria_peso_' + i));

                const insertData = {
                    nombre: nombre || `Cría de ${currentAnimal.nombre || 'vaca'} ${i}`,
                    empresa_id: window._currentEmpresaId,
                    raza: currentAnimal.raza || null,
                    sexo: sexo,
                    origen: 'Criollo',
                    madre_id: animalId,
                    peso_unidad: currentAnimal.peso_unidad || 'kg',
                    fecha_adquisicion: fechaParto,
                    reproductivo: 'Vacía',
                };
                const created = await restInsert('/rest/v1/ganado', insertData);
                const criaId = created && created.id;
                if (criaId && peso && peso > 0) {
                    await restInsert('/rest/v1/animal_pesajes', {
                        animal_id: criaId,
                        empresa_id: window._currentEmpresaId,
                        peso: String(peso),
                        fecha: fechaParto,
                        estado: 'Aplicada',
                    });
                }
                criasMessages.push((nombre || insertData.nombre) + ' (' + sexo + ')' + (peso ? ' — ' + peso + ' kg' : ''));
            }

            closeModal();
            showSnackbar('Parto registrado');

            if (currentAnimal) {
                sendWhatsApp(
                    '🐄 Parto Registrado\nMadre: ' + currentAnimal.nombre +
                    '\nFecha: ' + fechaParto +
                    '\nCrías: ' + numCrias + '\n' + criasMessages.join('\n') +
                    '\nFinca: ' + (window._empresaNombre || '')
                );
            }
            await loadAllData(animalId, document.getElementById('da-container'));
        } catch (err) {
            btn.disabled = false;
            showSnackbar(err.message, 'error');
        }
    };
}
window.handleRegistrarParto = handleRegistrarParto;

function handleAbortPregnancy(animalId) {
    const preg = pregnancies.find(p => p.estado === 'Preñada');
    if (!preg) return;
    window.Snackbar.confirm('¿Registrar aborto de esta gestación?', async () => {
        try {
            await restFetch('/rest/v1/animal_preñez?id=eq.' + preg.id, {
                method: 'PATCH',
                body: JSON.stringify({ estado: 'Abortada' }),
            });
            await restFetch('/rest/v1/ganado?id=eq.' + animalId, {
                method: 'PATCH',
                body: JSON.stringify({ reproductivo: 'Vacía' }),
            });
            showSnackbar('Aborto registrado');
            if (currentAnimal) {
                sendWhatsApp(
                    '⚠️ Aborto Registrado\nAnimal: ' + currentAnimal.nombre +
                    '\nFecha monta: ' + (preg.fecha_monta || 'N/A') +
                    '\nFinca: ' + (window._empresaNombre || '')
                );
            }
            await loadAllData(animalId, document.getElementById('da-container'));
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    }, { confirmLabel: 'Registrar', cancelLabel: 'Cancelar' });
}
window.handleAbortPregnancy = handleAbortPregnancy;
