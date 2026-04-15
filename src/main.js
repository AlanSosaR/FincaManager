import './style.css';
import './components.css';
import './pickers.css';
import './detalle_motor.css';
import './snackbar.js';
import { registerSW } from 'virtual:pwa-register';

// Register Service Worker for PWA
registerSW({ immediate: true });

import { renderDashboard } from './screens/dashboard.js';
import { renderMotores } from './screens/motores.js';
import { renderHerramientas } from './screens/herramientas.js';
import { renderGanado } from './screens/ganado.js';
import { renderPotreros } from './screens/potreros.js';
import { renderDetalleMotor } from './screens/detalle_motor.js';
import { renderDetallePotrero } from './screens/detalle_potrero.js';
import { renderDetalleAnimal } from './screens/detalle_animal.js';
import { renderDetalleHerramienta } from './screens/detalle_herramienta.js';
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
    detalle_herramienta: { title: 'Detalle de Herramienta', backTo: 'herramientas', render: renderDetalleHerramienta }
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
            showModal('motor', () => navigate('motores'));
        }
        if (e.target.closest('#btn-add-animal')) {
            showModal('ganado', () => navigate('ganado'));
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

        });
    });

    // PWA Install Logic
    let deferredPrompt;
    const installBtn = document.getElementById('pwa-install');

    window.addEventListener('beforeinstallprompt', (e) => {
        // Prevent Chrome 67 and earlier from automatically showing the prompt
        e.preventDefault();
        // Stash the event so it can be triggered later.
        deferredPrompt = e;
        // Update UI notify the user they can install the PWA
        if (installBtn) installBtn.style.display = 'flex';
    });

    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) return;
            // Show the install prompt
            deferredPrompt.prompt();
            // Wait for the user to respond to the prompt
            const { outcome } = await deferredPrompt.userChoice;
            if (outcome === 'accepted') {
                console.log('User accepted the install prompt');
                installBtn.style.display = 'none';
            } else {
                console.log('User dismissed the install prompt');
            }
            deferredPrompt = null;
        });
    }

    window.addEventListener('appinstalled', (evt) => {
        console.log('Finca Manager was installed.');
        if (installBtn) installBtn.style.display = 'none';
    });
});
