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
import { renderPotreros, initPotreros } from './screens/potreros.js';
import { renderDetalleMotor } from './screens/detalle_motor.js';
import { renderDetallePotrero, initDetallePotrero } from './screens/detalle_potrero.js';
import { renderDetalleAnimal, initDetalleAnimal } from './screens/detalle_animal.js';
import { renderDetalleHerramienta } from './screens/detalle_herramienta.js';
import { renderNuevoMotor, initNuevoMotor } from './screens/nuevo_motor.js';
import { renderNuevoAnimal, initNuevoAnimal } from './screens/nuevo_animal.js';
import { renderNuevoPotrero, initNuevoPotrero } from './screens/nuevo_potrero.js';
import { renderNuevoLote, setupNuevoLoteListeners } from './screens/nuevo_lote.js';
import { renderDetalleLote, initDetalleLote } from './screens/detalle_lote.js';
import { renderNuevaActividad, initNuevaActividad } from './screens/nueva_actividad.js';
import { renderNuevoPersonal, initNuevoPersonal } from './screens/nuevo_personal.js';
import { renderDetallePersonal, initDetallePersonal } from './screens/detalle_personal.js';
import { renderListaPersonal, initListaPersonal } from './screens/lista_personal.js';
import { showModal } from './modals.js';

const screens = {
    dashboard: { title: 'Dashboard Cafetal', render: renderDashboard },
    motores: { title: 'Lista de Motores', render: renderMotores },
    herramientas: { title: 'Inventario de Herramientas', render: renderHerramientas },
    ganado: { title: 'Gestión de Ganado', render: renderGanado },
    potreros: { title: 'Control de Potreros', render: renderPotreros },
    personal: { title: 'Personal', render: renderListaPersonal },
    detalle_motor: { title: 'Detalle de Motor', backTo: 'motores', render: renderDetalleMotor },
    detalle_potrero: { title: 'Detalle de Potrero', backTo: 'potreros', render: renderDetallePotrero },
    detalle_animal: { title: 'Detalle de Animal', backTo: 'ganado', render: renderDetalleAnimal },
    detalle_herramienta: { title: 'Detalle de Tool', backTo: 'herramientas', render: renderDetalleHerramienta },
    nuevo_motor: { title: 'Agregar Nuevo Equipo', backTo: 'motores', render: renderNuevoMotor },
    nuevo_animal: { title: 'Registrar Animal', backTo: 'ganado', render: renderNuevoAnimal },
    nuevo_potrero: { title: 'Nuevo Potrero', backTo: 'potreros', render: renderNuevoPotrero },
    nuevo_lote:    { title: 'Nuevo Lote de Cafetal', backTo: 'dashboard', render: (id) => renderNuevoLote(id) },
    detalle_lote:  { title: 'Detalle de Lote', backTo: 'dashboard', render: renderDetalleLote },
    nueva_actividad: { 
        title: 'Nueva Actividad', 
        backTo: (...args) => args[0] ? ['detalle_lote', args[0]] : 'dashboard', 
        render: renderNuevaActividad 
    },
    nuevo_personal: { title: 'Nuevo Personal', render: renderNuevoPersonal },
    detalle_personal: { title: 'Detalle de Personal', backTo: 'personal', render: renderDetallePersonal }
};

console.log('[DEBUG] Registered screens:', Object.keys(screens));

// Global navigate function for use inside screen HTML
window.navigateTo = function(screenId, ...args) {
    console.log('[DEBUG] window.navigateTo called with:', screenId, args);
    const event = new CustomEvent('navigate', { detail: { screenId, args } });
    document.dispatchEvent(event);
};

// Helper for M3 Floating Labels
window.refreshM3Fields = function() {
  document.querySelectorAll('.m3-field input, .m3-field select, .m3-field textarea').forEach(el => {
    const parent = el.closest('.m3-field');
    if (!parent) return;
    
    // For selects, check valid/value
    if (el.tagName === 'SELECT') {
      if (el.value && el.value !== '') {
        parent.classList.add('has-value');
      } else {
        parent.classList.remove('has-value');
      }
    } else {
      // For inputs/textareas, check if they have content
      if (el.value && el.value.trim() !== '') {
        parent.classList.add('has-value');
      } else {
        parent.classList.remove('has-value');
      }
    }
  });
};

document.addEventListener('DOMContentLoaded', () => {
    const container = document.getElementById('screen-container');
    const titleElement = document.getElementById('current-screen-title');

    // ── View cache for instant navigation ──────────────────────────────────
    const viewCache = new Map();
    // These screens should never be cached (forms / detail pages with dynamic data)
    const NO_CACHE = new Set(['ganado','nuevo_motor','nuevo_animal','nuevo_potrero',
                               'detalle_motor','detalle_animal','detalle_potrero',
                               'detalle_herramienta','nuevo_lote','detalle_lote',
                               'nueva_actividad','nuevo_personal','detalle_personal','personal']);

    window.clearScreenCache = (screenId) => {
      for (const key of viewCache.keys()) {
        if (key === screenId || key.startsWith(screenId + '/')) {
          viewCache.delete(key);
        }
      }
    };

    function cacheKey(screenId, args) {
        return screenId + (args.length ? '/' + args.join('/') : '');
    }

    async function renderAndInit(screenId, args, html) {
        // Cleanup before rendering new screen
        if (window.__screenCleanup) {
            try { window.__screenCleanup(); } catch(e) { console.warn('Cleanup error:', e); }
            window.__screenCleanup = null;
        }
        container.innerHTML = html;
        // Highlight active link
        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        
        // Use backTo if available to highlight the parent category in the menu
        const screenCfg = screens[screenId];
        const highlightId = (screenCfg && screenCfg.backTo) ? screenCfg.backTo : screenId;
        
        const activeLink = document.querySelector(`.nav-link[data-screen="${highlightId}"]`);
        if (activeLink) activeLink.classList.add('active');
        // Init screen
        if (screenId === 'detalle_motor') {
            const { initDetalleMotor } = await import('./screens/detalle_motor.js');
            initDetalleMotor(...args);
        }
        if (screenId === 'nuevo_motor')  initNuevoMotor(...args);
        if (screenId === 'motores')      initMotores();
        if (screenId === 'herramientas') initHerramientas();
        if (screenId === 'ganado')       initGanado();
        if (screenId === 'personal')     initListaPersonal();
        if (screenId === 'nuevo_animal') initNuevoAnimal(...args);
        if (screenId === 'detalle_animal') initDetalleAnimal(...args);
        if (screenId === 'nuevo_potrero')  initNuevoPotrero(...args);
        if (screenId === 'potreros')     initPotreros();
        if (screenId === 'detalle_potrero') initDetallePotrero(...args);
        if (screenId === 'detalle_herramienta') {
            const { initDetalleHerramienta } = await import('./screens/detalle_herramienta.js');
            initDetalleHerramienta(...args);
        }
        if (screenId === 'nuevo_lote') setupNuevoLoteListeners();
        if (screenId === 'detalle_lote') initDetalleLote(...args);
        if (screenId === 'nueva_actividad') initNuevaActividad(...args);
        if (screenId === 'nuevo_personal') initNuevoPersonal(...args);
        if (screenId === 'detalle_personal') initDetallePersonal(...args);
    }

    const DETAIL_SCREENS = new Set(['detalle_motor','detalle_animal','detalle_potrero','detalle_herramienta','detalle_lote','detalle_personal']);
    const FORM_SCREENS = new Set(['nuevo_motor','nuevo_animal','nuevo_potrero','nuevo_lote','nueva_actividad']);

    async function navigate(screenId, ...args) {
        // Guard: screens that require an ID but got none → redirect to parent
        if (DETAIL_SCREENS.has(screenId) && (!args || args.length === 0 || !args[0])) {
            const screenCfg = screens[screenId];
            if (screenCfg && screenCfg.backTo) {
                const backTarget = typeof screenCfg.backTo === 'function' ? screenCfg.backTo(...args) : screenCfg.backTo;
                return navigate(...(Array.isArray(backTarget) ? backTarget : [backTarget]));
            }
            return navigate('dashboard');
        }
        if (FORM_SCREENS.has(screenId) && args.length > 0 && !args[0]) {
            const screenCfg = screens[screenId];
            if (screenCfg && screenCfg.backTo) {
                const backTarget = typeof screenCfg.backTo === 'function' ? screenCfg.backTo(...args) : screenCfg.backTo;
                return navigate(...(Array.isArray(backTarget) ? backTarget : [backTarget]));
            }
            return navigate('dashboard');
        }

        console.log('[DEBUG] Navigating to:', screenId, args);
        const screen = screens[screenId] || screens.dashboard;
        
        if (screen.backTo) {
            const backTarget = typeof screen.backTo === 'function' ? screen.backTo(...args) : screen.backTo;
            const onClick = Array.isArray(backTarget) 
                ? backTarget.map(s => `'${s}'`).join(', ')
                : `'${backTarget}'`;
            titleElement.innerHTML = `
                <div style="display: flex; align-items: center; gap: 8px;">
                    <button onclick="window.navigateTo(${onClick})" style="background: transparent; border: none; display: flex; align-items: center; justify-content: center; cursor: pointer; padding: 4px; border-radius: 50%; color: #333; margin-left: -8px; transition: background 0.2s;" onmouseover="this.style.background='rgba(0,0,0,0.05)'" onmouseout="this.style.background='transparent'" aria-label="Atrás">
                        <span class="material-icons">arrow_back</span>
                    </button>
                    <span>${screen.title}</span>
                </div>
            `;
        } else {
            titleElement.textContent = screen.title;
        }

        const key = cacheKey(screenId, args);
        const useCache = !NO_CACHE.has(screenId);

        if (useCache && viewCache.has(key)) {
            // ── Instant: serve from cache immediately ──
            await renderAndInit(screenId, args, viewCache.get(key));
            // Then silently refresh cache in background
            screen.render(...args).then(freshHtml => {
                viewCache.set(key, freshHtml);
            }).catch(() => {});
        } else {
            // ── First visit: fetch, show, then cache ──
            try {
                const html = await screen.render(...args);
                if (useCache) viewCache.set(key, html);
                await renderAndInit(screenId, args, html);
            } catch (error) {
                console.error(error);
                container.innerHTML = `<div style="padding: 24px; color: red;">Error: ${error.message}</div>`;
            }
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
    const initialScreen = hashParams[0] || 'dashboard';
    const initArgs = hashParams.slice(1);
    navigate(initialScreen, ...initArgs);

    // Sidebar Toggle
    const menuToggle = document.getElementById('menu-toggle');
    const sidebarClose = document.getElementById('sidebar-close');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebar-overlay');
    const sidebarCollapse = document.getElementById('sidebar-collapse');
    
    // Initialize collapsed state from local storage
    if (localStorage.getItem('sidebar-collapsed') === 'true') {
        sidebar.classList.add('collapsed');
    }

    function toggleSidebar() {
        const isOpen = sidebar.classList.toggle('open');
        if (overlay) overlay.classList.toggle('active', isOpen);
    }

    function closeSidebar() {
        sidebar.classList.remove('open');
        if (overlay) overlay.classList.remove('active');
    }

    if (sidebarCollapse) {
        sidebarCollapse.addEventListener('click', () => {
            const isCollapsed = sidebar.classList.toggle('collapsed');
            localStorage.setItem('sidebar-collapsed', isCollapsed);
        });
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
