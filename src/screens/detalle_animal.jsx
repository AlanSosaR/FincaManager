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

async function loadAllData(animalId, container, flag) {
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
                renderFullContent(container, animalId, flag);
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
                    if (containerEl) renderFullContent(containerEl, animalId, flag);
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


function renderFullContent(container, animalId, flag) {
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
                            Comprado${currentAnimal.precio_compra ? ` ($${currentAnimal.precio_compra})` : ''}
                        </div>` : ''}
                    </div>` : ''}
                </div>
            </div>

            <div class="da-hero-body-grid">
                <div class="da-hero-img-card">
                    <img src="${currentAnimal.image_url || 'https://images.unsplash.com/photo-1546445317-29f4545e9d53?q=80&w=800'}" alt="${currentAnimal.nombre}">
                    <span class="da-hero-status-pill ${isSold ? 'sold' : 'active'}">
                        ● ${isSold ? 'Vendido' : 'Activo'}
                    </span>
                </div>

                <div class="da-hero-details-col">
                    <div class="da-stat-grid da-stat-grid-inline">
                        <div class="da-stat-card da-stat-tab active" data-tab="vacunas" style="cursor:pointer;" title="Ver Vacunas y Salud">
                            <div class="da-stat-icon">
                                <span class="material-symbols-outlined">vaccines</span>
                            </div>
                            <div>
                                <div class="da-stat-label">Total Vacunas</div>
                                <div class="da-stat-value">${vaccines.filter(v => (v.estado || 'Aplicada') === 'Aplicada').length}</div>
                                <div class="da-stat-sub">
                                    ${(() => {
                                        const pendVac = vaccines.filter(v => v.estado === 'Programada');
                                        if (pendVac.length > 0) {
                                            return `<span class="da-variation-pill pending" title="${pendVac.length} programada${pendVac.length > 1 ? 's' : ''}. Clic para ver" onclick="event.stopPropagation(); window.goToVaccineDate('${pendVac[0].fecha}')" style="cursor:pointer;">
                                                <span class="material-icons" style="font-size:12px;">schedule</span> ${pendVac.length} prog.
                                            </span>`;
                                        }
                                        return 'Aplicadas con éxito';
                                    })()}
                                </div>
                            </div>
                        </div>

                        <div class="da-stat-card da-stat-tab" data-tab="pesajes" style="cursor:pointer;" title="Ver Historial de Pesajes">
                            <div class="da-stat-icon da-stat-icon-secondary">
                                <span class="material-symbols-outlined">scale</span>
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
                                <span class="material-symbols-outlined">shield</span>
                            </div>
                            <div>
                                <div class="da-stat-label">Fumigaciones</div>
                                <div class="da-stat-value"><span class="material-icons" style="font-size:13px; vertical-align:middle; color:#2c666e;">check_circle</span> ${fumigaciones.filter(f => (f.estado || 'Aplicada') === 'Aplicada').length}</div>
                                <div class="da-stat-sub">
                                    ${(() => {
                                        const aplicadas = fumigaciones.filter(f => (f.estado || 'Aplicada') === 'Aplicada').length;
                                        const pendFum = fumigaciones.filter(f => f.estado === 'Programada');
                                        const pend = pendFum.length;
                                        if (pend > 0) {
                                            const firstPendFecha = pendFum[0].fecha;
                                            return `<span class="da-variation-pill pending" title="${pend} programada${pend > 1 ? 's' : ''}. Clic para ver" onclick="event.stopPropagation(); window.goToFumigDate('${firstPendFecha}')" style="cursor:pointer;">
                                                <span class="material-icons" style="font-size:12px;">schedule</span> ${pend} prog.
                                            </span>`;
                                        }
                                        return `aplicada${aplicadas === 1 ? '' : 's'}`;
                                    })()}
                                </div>
                            </div>
                        </div>

                        ${currentAnimal.sexo === 'Hembra' ? `
                        <div class="da-stat-card da-stat-tab" data-tab="repro" style="cursor:pointer;" title="Ver Reproducción">
                            <div class="da-stat-icon" style="background: #fff4e0; color: #b26a00;">
                                <img src="/cow.png" style="width:24px; height:24px; object-fit:contain;">
                            </div>
                            <div>
                                <div class="da-stat-label">Reproducción</div>
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
                        <div class="da-sell-row"><span>Precio venta</span><strong>$${currentAnimal.precio_venta || '—'}</strong></div>
                        <div class="da-sell-row"><span>Fecha</span><strong>${currentAnimal.fecha_venta ? new Date(currentAnimal.fecha_venta).toLocaleDateString() : '—'}</strong></div>
                        ${currentAnimal.comprador ? `<div class="da-sell-row"><span>Comprador</span><strong>${currentAnimal.comprador}</strong></div>` : ''}
                        ${currentAnimal.peso_venta ? `<div class="da-sell-row"><span>Peso venta</span><strong>${currentAnimal.peso_venta} kg</strong></div>` : ''}
                        ${currentAnimal.origen === 'Comprado' && currentAnimal.precio_compra ? `<div class="da-sell-row"><span>Precio compra</span><strong>$${currentAnimal.precio_compra}</strong></div>` : ''}
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
                                <label>Precio de venta ($)</label>
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
                        ${!isSold ? `<button class="btn-m3-tonal" style="padding: 10px 20px;" id="da-add-weight">
                            <span class="material-icons">add</span> Registrar Pesaje
                        </button>` : ''}
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
                
                <div style="margin-top: 32px;">
                    <h4 style="font-size: 18px; font-weight: 800; margin-bottom: 16px;">Fumigaciones del Mes</h4>
                    <div class="da-table-card" id="da-fumigaciones-table">
                    </div>
                </div>
            </div>

            ${currentAnimal.sexo === 'Hembra' ? `
            <div class="da-tab-content" id="da-tab-repro">
                <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px; margin-bottom:16px;">
                    <div>
                        <h4 style="font-size:18px; font-weight:800; margin:0;">Historial de Reproducción</h4>
                        <p style="margin:4px 0 0; color:#777; font-size:14px;">Gestaciones, partos y crías de este animal.</p>
                    </div>
                    <div style="display:flex; gap:8px; flex-wrap:wrap;">
                        ${!isSold ? `
                        ${!activePreg ? `
                        <button class="btn-m3-fill" id="da-add-pregnancy">
                            <span class="material-icons">add</span> Registrar preñez
                        </button>` : `
                        <button class="btn-m3-primary" id="da-register-parto">
                            <span class="material-icons">child_care</span> Registrar parto
                        </button>
                        <button class="btn-m3-tonal" id="da-register-abort" style="background:#ffe2db; color:#ff4103;">
                            <span class="material-icons">block</span> Aborto
                        </button>`}` : ''}
                    </div>
                </div>
                <div id="da-pregnancy-inline"></div>
                <div class="da-table-card" id="da-pregnancies-table">
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
                        '<div class="da-sell-row"><span>Precio</span><strong>$' + currentAnimal.precio_venta + '</strong></div>' +
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
                        '<span style="color:#555;">— $' + currentAnimal.precio_venta + '</span>';
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
                    <label>Precio de venta ($)</label>
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

    // Reproduction Actions
    document.getElementById('da-add-pregnancy')?.addEventListener('click', () => handleAddPregnancy(animalId));
    document.getElementById('da-register-parto')?.addEventListener('click', () => handleRegistrarParto(animalId));
    document.getElementById('da-register-abort')?.addEventListener('click', () => handleAbortPregnancy(animalId));
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
            const pesoVal = formData.get('peso');
            const fechaPeso = formData.get('fecha');
            await restInsert('/rest/v1/animal_pesajes', {
                animal_id: animalId,
                peso: pesoVal,
                fecha: fechaPeso
            });

            if (currentAnimal) {
                sendWhatsApp(
                    '⚖️ Peso Registrado\nAnimal: ' + currentAnimal.nombre +
                    '\nPeso: ' + pesoVal + ' ' + (currentAnimal.peso_unidad || 'kg') +
                    '\nFecha: ' + fechaPeso +
                    '\nFinca: ' + (window._empresaNombre || '')
                );
            }

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
            const isTodayOrPast = selectedDate <= today;
            const estadoVal = isTodayOrPast ? 'Aplicada' : 'Programada';

            const result = await restFetch('/rest/v1/animal_fumigaciones', {
                method: 'POST',
                body: JSON.stringify({
                    animal_id: animalId,
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
        const hasPending = dayVaccines.some(v => v.estado === 'Programada');
        
        let cls = 'da-cal-day';
        if (isToday) cls += ' da-cal-today';
        if (isSelected) cls += ' da-cal-selected-day';
        if (hasEvent) {
            cls += ' da-cal-has-event';
            if (hasPending) {
                cls += ' da-cal-has-pending da-cal-day-pending-highlight';
            } else {
                cls += ' da-cal-day-done';
            }
        }
        
        const dayEl = document.createElement('div');
        dayEl.className = cls;
        let dotsHtml = '';
        if (hasEvent) {
            if (hasPending) {
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
    renderVaccinesTable(monthVaccines, 1);
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

    const cardsHtml = (dayEvents && dayEvents.length > 0)
        ? dayEvents.map(v => {
            const currentEstado = v.estado || 'Aplicada';
            const isPastOrToday = v.fecha <= todayStr;
            const isRealizada = currentEstado === 'Aplicada';
            const isCancelada = currentEstado === 'Cancelada';
            const isProgramada = currentEstado === 'Programada';

            let badgeBg = '#2d3e2c';
            let badgeText = 'Aplicada';
            if (isProgramada) {
                badgeBg = '#c9a227';
                badgeText = 'Programada';
            } else if (isCancelada) {
                badgeBg = '#ff4103';
                badgeText = 'Cancelada';
            }

            let actionsHtml = '';
            if (isProgramada && !isSold) {
                actionsHtml = `
                    <div class="plan-ev-actions" style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
                        <button class="plan-btn-primary" style="padding:6px 14px; font-size:12px;" onclick="window.confirmVaccine('${v.id}')">
                            <span class="material-icons" style="font-size:16px;">check</span> Aplicar
                        </button>
                        <button class="plan-btn-ghost" style="padding:6px 14px; font-size:12px;" onclick="window.editVaccine('${v.id}')">
                            <span class="material-icons" style="font-size:16px;">edit</span> Editar
                        </button>
                        <button class="plan-btn-danger" style="padding:6px 12px; font-size:12px;" onclick="window.cancelVaccine('${v.id}')" title="Cancelar">
                            <span class="material-icons" style="font-size:16px;">close</span> Cancelar
                        </button>
                    </div>
                `;
            } else if (!isSold) {
                actionsHtml = `
                    <div class="plan-ev-actions" style="display:flex; gap:8px; margin-top:10px; justify-content:flex-end;">
                        <button class="plan-btn-ghost" style="padding:4px 10px; font-size:11.5px;" onclick="window.editVaccine('${v.id}')">
                            <span class="material-icons" style="font-size:15px;">edit</span> Editar
                        </button>
                    </div>
                `;
            }

            return `
                <div class="plan-ev" style="border:1.5px solid ${isRealizada ? '#c8e6c9' : isProgramada ? '#ffe9a8' : '#ffcdd2'}; margin-bottom:12px;">
                    <div class="plan-ev-head" style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:20px;">💉</span>
                            <div>
                                <p class="plan-ev-producto" style="font-size:15px; font-weight:800; margin:0; color:#1a1a1a;">${v.nombre}</p>
                                <div style="font-size:11px; color:#666; margin-top:2px;">Vacunación en ganado</div>
                            </div>
                        </div>
                        <span class="plan-ev-badge" style="background:${badgeBg}; color:#fff; font-size:10.5px; font-weight:800; padding:4px 10px; border-radius:9999px; text-transform:uppercase;">${badgeText}</span>
                    </div>

                    <div class="plan-ev-meta" style="font-size:12px; color:#555; margin:8px 0 0; display:flex; flex-direction:column; gap:3px;">
                        ${v.dosis ? `<div><strong>Dosis:</strong> ${v.dosis}</div>` : ''}
                        ${v.observaciones ? `<div class="plan-ev-purpose" style="margin-top:6px; color:#444; background:#f9faf9; padding:6px 10px; border-radius:8px; font-size:12px;">💬 <strong>Obs:</strong> ${v.observaciones}</div>` : ''}
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

    panel.innerHTML = `
        <div class="da-day-details">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:8px; border-bottom:1.5px solid #eef2ee; padding-bottom:10px;">
                <div>
                    <span style="font-size:11px; font-weight:800; text-transform:uppercase; color:#2d3e2c; letter-spacing:0.5px;">Actividades del día</span>
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
            const fechaPeso = formData.get('fecha');
            await restInsert('/rest/v1/animal_pesajes', {
                animal_id: animalId,
                peso: pesoVal,
                fecha: fechaPeso
            });

            if (currentAnimal) {
                sendWhatsApp(
                    '⚖️ Peso Registrado\nAnimal: ' + currentAnimal.nombre +
                    '\nPeso: ' + pesoVal + ' ' + (currentAnimal.peso_unidad || 'kg') +
                    '\nFecha: ' + fechaPeso +
                    '\nFinca: ' + (window._empresaNombre || '')
                );
            }

            showSnackbar('Pesaje registrado ✓');
            await loadAllData(animalId, document.getElementById('da-container'));
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    };
}

// ─── Inline Fumigacion Form (duplicate for calendar)

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
    const isSold = currentAnimal?.estado === 'Vendido';

    const rowsHtml = paged.map(v => {
        const isPastOrToday = v.fecha <= today;
        const currentEstado = v.estado || 'Aplicada';
        let estadoHtml = '';
        
        if (currentEstado === 'Programada') {
            const applyBtn = isPastOrToday ? `
                <button title="Aplicar" class="btn-m3-tonal" style="padding: 4px 8px; font-size: 12px; height: auto; background: #2d3e2c; color: #ffffff;" onclick="window.confirmVaccine('${v.id}')">
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
                    ${isSold ? `<span class="da-variation-pill pending" style="margin-right: 4px;">
                        <span class="material-icons">schedule</span>
                        Programada
                    </span>` : applyBtn}
                    ${isSold ? '' : `<button title="Editar" class="btn-m3-tonal" style="padding: 4px 8px; font-size: 12px; height: auto; background: #b9f2fb; color: #2c666e;" onclick="window.editVaccine('${v.id}')">
                        <span class="material-icons" style="font-size: 16px;">edit</span>
                    </button>`}
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

    allFumigaciones = (allFumigaciones || []).filter(f => (f.estado || 'Aplicada') !== 'Cancelada');

    fumigPage = page || fumigPage;
    const total = allFumigaciones.length;
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
    const isSold = currentAnimal?.estado === 'Vendido';

    const rowsHtml = paged.map(f => {
        const isPastOrToday = f.fecha <= today;
        const currentEstado = f.estado || 'Aplicada';
        let estadoHtml = '';
        
        if (currentEstado === 'Programada') {
            const applyBtnF = isPastOrToday ? `
                <button title="Aplicar" class="btn-m3-tonal" style="padding: 4px 8px; font-size: 12px; height: auto; background: #2d3e2c; color: #ffffff;" onclick="window.confirmFumigacion('${f.id}')">
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
                    ${isSold ? `<span class="da-variation-pill pending" style="margin-right: 4px;">
                        <span class="material-icons">schedule</span>
                        Programada
                    </span>` : applyBtnF}
                    ${isSold ? '' : `<button title="Editar" class="btn-m3-tonal" style="padding: 4px 8px; font-size: 12px; height: auto; background: #b9f2fb; color: #2c666e;" onclick="window.editFumigacion('${f.id}')">
                        <span class="material-icons" style="font-size: 16px;">edit</span>
                    </button>`}
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
        const hasPending = dayFumigaciones.some(f => f.estado === 'Programada');
        
        let cls = 'da-cal-day';
        if (isToday) cls += ' da-cal-today';
        if (isSelected) cls += ' da-cal-selected-day';
        if (hasEvent) {
            cls += ' da-cal-has-event';
            if (hasPending) {
                cls += ' da-cal-has-pending da-cal-day-pending-highlight';
            } else {
                cls += ' da-cal-day-done';
            }
        }
        
        const dayEl = document.createElement('div');
        dayEl.className = cls;
        let dotsHtml = '';
        if (hasEvent) {
            if (hasPending) {
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
    renderFumigacionesTable(monthFumigaciones, 1);
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

    const cardsHtml = (dayEvents && dayEvents.length > 0)
        ? dayEvents.map(f => {
            const currentEstado = f.estado || 'Aplicada';
            const isPastOrToday = f.fecha <= todayStr;
            const isRealizada = currentEstado === 'Aplicada';
            const isCancelada = currentEstado === 'Cancelada';
            const isProgramada = currentEstado === 'Programada';

            let badgeBg = '#2d3e2c';
            let badgeText = 'Aplicada';
            if (isProgramada) {
                badgeBg = '#c9a227';
                badgeText = 'Programada';
            } else if (isCancelada) {
                badgeBg = '#ff4103';
                badgeText = 'Cancelada';
            }

            let actionsHtml = '';
            if (isProgramada && !isSold) {
                const applyRowF = isPastOrToday ? `
                    <button class="plan-btn-primary" style="padding:6px 14px; font-size:12px;" onclick="window.confirmFumigacion('${f.id}')">
                        <span class="material-icons" style="font-size:16px;">check</span> Aplicar
                    </button>
                    <button class="plan-btn-danger" style="padding:6px 12px; font-size:12px;" onclick="window.cancelFumigacion('${f.id}')" title="Cancelar">
                        <span class="material-icons" style="font-size:16px;">close</span> Cancelar
                    </button>` : '';
                actionsHtml = `
                    <div class="plan-ev-actions" style="display:flex; gap:8px; margin-top:12px; flex-wrap:wrap;">
                        ${applyRowF}
                        <button class="plan-btn-ghost" style="padding:6px 14px; font-size:12px;" onclick="window.editFumigacion('${f.id}')">
                            <span class="material-icons" style="font-size:16px;">edit</span> Editar
                        </button>
                    </div>
                `;
            } else if (!isSold) {
                actionsHtml = `
                    <div class="plan-ev-actions" style="display:flex; gap:8px; margin-top:10px; justify-content:flex-end;">
                        <button class="plan-btn-ghost" style="padding:4px 10px; font-size:11.5px;" onclick="window.editFumigacion('${f.id}')">
                            <span class="material-icons" style="font-size:15px;">edit</span> Editar
                        </button>
                    </div>
                `;
            }

            return `
                <div class="plan-ev" style="border:1.5px solid ${isRealizada ? '#c8e6c9' : isProgramada ? '#ffe9a8' : '#ffcdd2'}; margin-bottom:12px;">
                    <div class="plan-ev-head" style="display:flex; align-items:flex-start; justify-content:space-between; gap:8px;">
                        <div style="display:flex; align-items:center; gap:8px;">
                            <span style="font-size:20px;">🛡️</span>
                            <div>
                                <p class="plan-ev-producto" style="font-size:15px; font-weight:800; margin:0; color:#1a1a1a;">${f.producto}</p>
                                <div style="font-size:11px; color:#666; margin-top:2px;">Fumigación / Tratamiento</div>
                            </div>
                        </div>
                        <span class="plan-ev-badge" style="background:${badgeBg}; color:#fff; font-size:10.5px; font-weight:800; padding:4px 10px; border-radius:9999px; text-transform:uppercase;">${badgeText}</span>
                    </div>

                    <div class="plan-ev-meta" style="font-size:12px; color:#555; margin:8px 0 0; display:flex; flex-direction:column; gap:3px;">
                        ${f.dosis ? `<div><strong>Dosis:</strong> ${f.dosis}</div>` : ''}
                        ${f.observaciones ? `<div class="plan-ev-purpose" style="margin-top:6px; color:#444; background:#f9faf9; padding:6px 10px; border-radius:8px; font-size:12px;">💬 <strong>Obs:</strong> ${f.observaciones}</div>` : ''}
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

    panel.innerHTML = `
        <div class="da-day-details">
            <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px; flex-wrap:wrap; gap:8px; border-bottom:1.5px solid #eef2ee; padding-bottom:10px;">
                <div>
                    <span style="font-size:11px; font-weight:800; text-transform:uppercase; color:#2d3e2c; letter-spacing:0.5px;">Actividades del día</span>
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
                    await restFetch('/rest/v1/animal_vacunas?id=eq.' + vaccineId, { method: 'DELETE' });
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
            
            await restFetch('/rest/v1/animal_vacunas?id=eq.' + vaccineId, {
                method: 'PATCH',
                body: JSON.stringify(payload),
            });
            
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
                    await restFetch('/rest/v1/animal_fumigaciones?id=eq.' + fumigacionId, { method: 'DELETE' });
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

            await restFetch('/rest/v1/animal_fumigaciones?id=eq.' + fumigacionId, {
                method: 'PATCH',
                body: JSON.stringify(payload),
            });

            showSnackbar('Fumigación actualizada ✓');
            await loadAllData(currentAnimal.id, document.getElementById('da-container'));
        } catch (err) {
            showSnackbar(err.message, 'error');
        }
    };
}
window.editFumigacion = (id) => handleEditFumigacion(id);

// ─── Reproducción ────────────────────────────────────────────────────────────

function renderPregnanciesHtml() {
    if (!pregnancies || pregnancies.length === 0) {
        return `<div class="da-empty-state">No hay registros de reproducción</div>`;
    }

    const rows = pregnancies.map(p => {
        const fechaMonta = p.fecha_monta ? new Date(p.fecha_monta + 'T00:00:00').toLocaleDateString() : '—';
        const fechaParto = p.fecha_parto ? new Date(p.fecha_parto + 'T00:00:00').toLocaleDateString() : (p.fecha_probable_parto ? new Date(p.fecha_probable_parto + 'T00:00:00').toLocaleDateString() : '—');
        let estadoPill = '';
        if (p.estado === 'Preñada') {
            estadoPill = `<span class="da-variation-pill pending"><img src="/cow.png" style="width:16px; height:16px; object-fit:contain;"> Preñada</span>`;
        } else if (p.estado === 'Parida') {
            estadoPill = `<span class="da-variation-pill positive"><span class="material-icons">check_circle</span> Parida</span>`;
        } else {
            estadoPill = `<span class="da-variation-pill negative"><span class="material-icons">block</span> Abortada</span>`;
        }

        return `
            <div class="da-table-row">
                <div class="da-table-cell da-cell-bold" data-label="Estado">${estadoPill}</div>
                <div class="da-table-cell" data-label="Monta">${fechaMonta}</div>
                <div class="da-table-cell" data-label="Parto">${fechaParto}</div>
                <div class="da-table-cell" data-label="Crías">${p.num_crias || '—'}</div>
            </div>
        `;
    }).join('');

    return `
        <div class="da-table-header">
            <div>Estado</div>
            <div>Fecha Monta</div>
            <div>Fecha Parto</div>
            <div>Crías</div>
        </div>
        ${rows}
    `;
}

function handleAddPregnancy(animalId) {
    const container = document.getElementById('da-pregnancy-inline');
    const addBtn = document.getElementById('da-add-pregnancy');
    if (!container) return;
    if (addBtn) addBtn.style.display = 'none';

    const today = getLocalToday();
    container.innerHTML = `
        <div class="da-inline-form-card" style="border:1px dashed #b7d98a; border-radius:12px; padding:16px; margin-bottom:16px; background:rgba(107,130,69,0.05);">
            <h3 style="margin-top:0; margin-bottom:16px; font-size:1.05rem; color:#6b8245; display:flex; align-items:center; gap:8px;">
                <img src="/cow.png" style="width:22px; height:22px; object-fit:contain;"> Registrar Preñez
            </h3>
            <form id="form-add-pregnancy" style="display:flex; flex-direction:column; gap:16px;">
                <div class="m3-field">
                    <input type="date" name="fecha_monta" id="pregnancy-fecha-monta" value="${today}" placeholder=" " required>
                    <label>Fecha de Monta</label>
                </div>
                <div style="background:#f0f7e6;border:1px dashed #b7d98a;border-radius:12px;padding:12px 16px;color:#4a5d30;font-size:14px;">
                    <span class="material-icons" style="font-size:18px; vertical-align:-4px; margin-right:4px;">info</span>
                    Fecha probable de parto estimada: <strong id="pregnancy-fecha-probable">${addDays(today, 283)}</strong> (283 días)
                </div>
                <div style="display:flex; gap:10px; justify-content:flex-end; flex-wrap:wrap;">
                    <button type="button" class="btn-m3-text" id="cancel-inline-pregnancy">Cancelar</button>
                    <button type="submit" class="btn-m3-fill">Guardar</button>
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
