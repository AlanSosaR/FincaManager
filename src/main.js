import './style.css';
import './components.css';
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
    detalle_motor: { title: 'Detalle de Motor', render: renderDetalleMotor },
    detalle_potrero: { title: 'Detalle de Potrero', render: renderDetallePotrero },
    detalle_animal: { title: 'Detalle de Animal', render: renderDetalleAnimal },
    detalle_herramienta: { title: 'Detalle de Herramienta', render: renderDetalleHerramienta }
};

// Global navigate function for use inside screen HTML
window.navigateTo = function(screenId) {
    const event = new CustomEvent('navigate', { detail: { screenId } });
    document.dispatchEvent(event);
};

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('screen-container');
    const titleElement = document.getElementById('current-screen-title');

    async function navigate(screenId, ...args) {
        const screen = screens[screenId] || screens.dashboard;
        titleElement.textContent = screen.title;
        container.innerHTML = '<div style="padding: 24px;">Cargando...</div>';
        
        try {
            const html = await screen.render(...args);
            container.innerHTML = html;
        } catch (error) {
            console.error(error);
            container.innerHTML = `<div style="padding: 24px; color: red;">Error: ${error.message}</div>`;
        }
        window.location.hash = screenId;
    }

    // Listen to global navigate events (from screen HTML buttons)
    document.addEventListener('navigate', (e) => {
        navigate(e.detail.screenId);
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        const matching = document.querySelector(`[data-screen="${e.detail.screenId}"]`);
        if (matching) matching.classList.add('active');
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
    const initialScreen = window.location.hash.replace('#', '') || 'dashboard';
    navigate(initialScreen);

    // Sidebar Toggle
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    
    menuToggle.addEventListener('click', () => {
        sidebar.classList.toggle('open');
    });

    // Handle Nav Clicks
    document.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', (e) => {
            const screenId = link.getAttribute('data-screen');
            if (screenId) {
                e.preventDefault();
                navigate(screenId);
                
                // Active class
                document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
                link.classList.add('active');

                // Close sidebar on mobile
                if (window.innerWidth <= 1024) {
                    sidebar.classList.remove('open');
                }
            }
        });
    });
});
