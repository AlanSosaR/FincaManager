import './style.css';
import './components.css';
import './pickers.css';
import './detalle_motor.css';
import './snackbar.js';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for PWA
registerSW({ immediate: true });

import { renderDashboard } from './screens/dashboard.js';
import { renderMotores, initMotores } from './screens/motores.js';
import { renderHerramientas, initHerramientas } from './screens/herramientas.js';
import { renderGanado, initGanado } from './screens/ganado.js';
import { renderPotreros } from './screens/potreros.js';
import { renderDetalleMotor } from './screens/detalle_motor.js';
import { renderDetallePotrero, initDetallePotrero } from './screens/detalle_potrero.js';
import { renderDetalleAnimal, initDetalleAnimal } from './screens/detalle_animal.js';
import { renderDetalleHerramienta } from './screens/detalle_herramienta.js';
import { renderNuevoMotor, initNuevoMotor } from './screens/nuevo_motor.js';
import { renderNuevoAnimal, initNuevoAnimal } from './screens/nuevo_animal.js';
import { renderNuevoPotrero, initNuevoPotrero } from './screens/nuevo_potrero.js';
import { showModal } from './modals.js';

const screens = {
    dashboard: { title: 'Dashboard Cafetal', render: renderDashboard },
    motores: { title: 'Lista de Motores', render: renderMotores },
    herramientas: { title: 'Inventario de Herramientas', render: renderHerramientas },
    ganado: { title: 'Gestión de Ganado', render: renderGanado },
    potreros: { title: 'Control de Potreros', render: renderPotreros },
    detalle_motor: { title: 'Detalle de Motor', backTo: 'motores', render: renderDetalleMotor },
    detalle_potrero: { title: 'Detalle de Potrero', backTo: 'potreros', render: renderDetallePotrero },
    detalle_animal: { title: 'Detalle de Animal', backTo: 'ganado', render: renderDetalleAnimal },
    detalle_herramienta: { title: 'Detalle de Tool', backTo: 'herramientas', render: renderDetalleHerramienta },
    nuevo_motor: { title: 'Agregar Nuevo Equipo', backTo: 'motores', render: renderNuevoMotor },
    nuevo_animal: { title: 'Registrar Animal', backTo: 'ganado', render: renderNuevoAnimal },
    nuevo_potrero: { title: 'Nuevo Potrero', backTo: 'potreros', render: renderNuevoPotrero }
};

// Global navigate function for use inside screen HTML
window.navigateTo = function(screenId, ...args) {
    const event = new CustomEvent('navigate', { detail: { screenId, args } });
    document.dispatchEvent(event);
};

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('screen-container');
    const titleElement = document.getElementById('current-screen-title');

    async function navigate(screenId, ...args) {
        const screen = screens[screenId] || screens.motores;
        
        if (screen.backTo) {
            titleElement.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button onclick="window.navigateTo('${screen.backTo}')" style="background: transparent; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 4px; border-radius: 50%; color: #333; margin-left: -8px; transition: background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='transparent'" aria-label="Atrás">
                        <span class="material-icons">arrow_back</span>
                    </button>
                    <span>${screen.title}</span>
                </div>
            `;
        } else {
            titleElement.textContent = screen.title;
        }
        container.innerHTML = '<div style="padding: 24px;">Cargando...</div>';
        
        try {
            const html = await screen.render(...args);
            container.innerHTML = html;

            // Highlight active link in sidebar
            document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
            const activeLink = document.querySelector(`.nav-link[data-screen="${screenId}"]`);
            if (activeLink) activeLink.classList.add('active');

            // Initialize screen-specific logic
            if (screenId === 'detalle_motor') {
              const { initDetalleMotor } = await import('./screens/detalle_motor.js');
              initDetalleMotor(...args);
            }
            if (screenId === 'nuevo_motor') {
              initNuevoMotor(...args);
            }
            if (screenId === 'motores') {
              initMotores();
            }
            if (screenId === 'herramientas') {
              initHerramientas();
            }
            if (screenId === 'ganado') {
              initGanado();
            }
            if (screenId === 'nuevo_animal') {
              initNuevoAnimal(...args);
            }
            if (screenId === 'detalle_animal') {
              initDetalleAnimal(...args);
            }
            if (screenId === 'nuevo_potrero') {
              initNuevoPotrero(...args);
            }
            if (screenId === 'detalle_potrero') {
              initDetallePotrero(...args);
            }
        } catch (error) {
            console.error(error);
            container.innerHTML = `<div style="padding: 24px; color: red;">Error: ${error.message}</div>`;
        }
        
        // Build the new hash including any arguments
        let newHash = screenId;
        if (args && args.length > 0) {
            newHash += '/' + args.join('/');
        }
        if (window.location.hash !== '#' + newHash) {
            window.location.hash = newHash;
        }
    }

    // Handle browser back/forward buttons
    window.addEventListener('hashchange', () => {
        const hashParams = window.location.hash.replace('#', '').split('/');
        const screenId = hashParams[0];
        const args = hashParams.slice(1);
        if (screenId && screens[screenId]) {
            navigate(screenId, ...args);
        }
    });

    document.addEventListener('navigate', (e) => {
        navigate(e.detail.screenId, ...(e.detail.args || []));
    });

    // Wire motor card clicks to detalle_motor
    document.addEventListener('click', (e) => {
        const premiumCard = e.target.closest('.motor-card-premium[data-id]');
        if (premiumCard) {
            // Check if we are in the motors screen or ganado screen
            if (premiumCard.closest('.screen-motores')) {
                navigate('detalle_motor', premiumCard.dataset.id);
            } else if (premiumCard.closest('.screen-ganado')) {
                navigate('detalle_animal', premiumCard.dataset.id);
            }
        }

        const motorCard = e.target.closest('.motor-card[data-id]');
        if (motorCard) {
            navigate('detalle_motor', motorCard.dataset.id);
        }

        const potreroCard = e.target.closest('.potrero-card[data-id]');
        if (potreroCard) {
            navigate('detalle_potrero', potreroCard.dataset.id);
        }

        const animalCard = e.target.closest('.animal-card[data-id]');
        if (animalCard) {
            navigate('detalle_animal', animalCard.dataset.id);
        }

        const toolCard = e.target.closest('.tool-card[data-id]');
        if (toolCard) {
            navigate('detalle_herramienta', toolCard.dataset.id);
        }

        // Add Record Buttons
        if (e.target.closest('#btn-add-motor')) {
            navigate('nuevo_motor');
        }
        if (e.target.closest('#btn-add-animal')) {
            navigate('nuevo_animal');
        }
    });

    // Initial load based on hash
    const hashParams = window.location.hash.replace('#', '').split('/');
    const initialScreen = hashParams[0] || 'motores';
    const initArgs = hashParams.slice(1);
    navigate(initialScreen, ...initArgs);

    // Sidebar Toggle
    const menuToggle = document.getElementById('menu-toggle');
    const sidebarClose = document.getElementById('sidebar-close');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    
    function toggleSidebar() {
        const isOpen = sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('active', isOpen);
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
    }

    if (menuToggle) {
        menuToggle.addEventListener('click', () => {
            toggleSidebar();
        });
    }

    if (sidebarClose) {
        sidebarClose.addEventListener('click', () => {
            closeSidebar();
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            closeSidebar();
        });
    }

    // Handle Nav Clicks with double-tap to reload
    document.querySelectorAll('.nav-link').forEach(link => {
        let lastClick = 0;
        link.addEventListener('click', (e) => {
            const screenId = link.getAttribute('data-screen');
            const now = Date.now();
            
            // Check for double click/tap (within 350ms)
            if (now - lastClick < 350) {
                window.location.reload();
                return;
            }
            lastClick = now;

            if (screenId) {
                e.preventDefault();
                navigate(screenId);

                // Close sidebar on mobile
                if (window.innerWidth <= 1024) {
                    closeSidebar();
                }
            }
        });
    });

    // Pull-to-refresh logic for mobile (Improved visibility)
    const mainContent = document.querySelector('.main-content');
    let touchStartY = 0;
    let pullThresholdReached = false;
    
    // Create the visual indicator if it doesn't exist
    if (mainContent && !document.querySelector('.ptr-indicator')) {
        const indicator = document.createElement('div');
        indicator.className = 'ptr-indicator';
        indicator.innerHTML = '<div class="spinner"></div>';
        mainContent.appendChild(indicator);
    }

    if (mainContent) {
        const indicator = document.querySelector('.ptr-indicator');

        mainContent.addEventListener('touchstart', (e) => {
            if (mainContent.scrollTop <= 0) {
                touchStartY = e.touches[0].pageY;
                pullThresholdReached = false;
            } else {
                touchStartY = 0;
            }
        }, { passive: true });

        mainContent.addEventListener('touchmove', (e) => {
            if (touchStartY > 0) {
                const touchMoveY = e.touches[0].pageY;
                const delta = touchMoveY - touchStartY;
                
                if (delta > 100 && delta < 280) {
                  // Show partially? but we'll stick to a clean look
                }

                if (delta > 280) {
                    pullThresholdReached = true;
                    if (indicator) indicator.classList.add('active');
                } else if (delta < 250) {
                    pullThresholdReached = false;
                    if (indicator) indicator.classList.remove('active');
                }
            }
        }, { passive: true });

        mainContent.addEventListener('touchend', () => {
            if (pullThresholdReached) {
                setTimeout(() => window.location.reload(), 200);
            } else {
              if (indicator) indicator.classList.remove('active');
            }
            touchStartY = 0;
            pullThresholdReached = false;
        });
    }

    // PWA Install Logic
    let deferredPrompt;
    const installBtn = document.getElementById('pwa-install');

    if (!installBtn) {
        console.warn('[PWA] Botón #pwa-install no encontrado en el DOM.');
    }

    window.addEventListener('beforeinstallprompt', (e) => {
        console.log('[PWA] beforeinstallprompt disparado — la app es instalable.');
        // Evitar que Chrome muestre el banner automáticamente
        e.preventDefault();
        // Guardar el evento para usarlo después
        deferredPrompt = e;
        // Mostrar botón de instalación
        if (installBtn) {
            installBtn.style.display = 'flex';
            console.log('[PWA] Botón de instalación visible.');
        }
    });

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            console.log('[PWA] Click en botón de instalación.');
            if (!deferredPrompt) {
                console.warn('[PWA] deferredPrompt es null — el prompt ya fue usado o el evento no se disparó.');
                return;
            }
            // Mostrar el prompt de instalación
            deferredPrompt.prompt();
            // Esperar respuesta del usuario
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`[PWA] Respuesta del usuario: ${outcome}`);
            if (outcome === 'accepted') {
                console.log('[PWA] Usuario aceptó la instalación.');
                installBtn.style.display = 'none';
            } else {
                console.log('[PWA] Usuario rechazó la instalación.');
            }
            deferredPrompt = null;
        });
    }

    window.addEventListener('appinstalled', (evt) => {
        console.log('[PWA] Finca Manager fue instalado exitosamente.');
        if (installBtn) installBtn.style.display = 'none';
    });

    // Capturar errores globales y mostrarlos en consola
    window.addEventListener('unhandledrejection', (event) => {
        console.error('[ERROR] Promesa rechazada sin manejar:', event.reason);
    });
});
