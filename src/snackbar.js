/**
 * Material 3 Expressive Snackbar System
 */
class SnackbarSystem {
  constructor() {
    this.container = document.getElementById('snackbar-container');
    this.queue = [];
    this.active = false;
  }

  show(message, options = {}) {
    this.queue.push({ message, ...options });
    this.processQueue();
  }

  confirm(message, onConfirm, onCancel, options = {}) {
    this.queue.push({
      message,
      confirm: true,
      onConfirm,
      onCancel,
      ...options
    });
    this.processQueue();
  }

  async processQueue() {
    if (this.active || this.queue.length === 0) return;
    this.active = true;

    const current = this.queue.shift();
    const snackbar = document.createElement('div');
    snackbar.className = `m3-snackbar ${current.type || 'info'} ${current.confirm ? 'expressive' : ''}`;
    
    snackbar.innerHTML = `
      <div class="m3-snackbar-content">
        <span class="m3-snackbar-text">${current.message}</span>
        <div class="m3-snackbar-actions">
          ${current.confirm ? `
            <button class="m3-snackbar-btn cancel">${current.cancelText || 'Cancelar'}</button>
            <button class="m3-snackbar-btn confirm">${current.confirmText || 'Confirmar'}</button>
          ` : `
            <button class="m3-snackbar-btn close">Cerrar</button>
          `}
        </div>
      </div>
    `;

    this.container.appendChild(snackbar);

    // Trigger entrance animation
    requestAnimationFrame(() => snackbar.classList.add('visible'));

    return new Promise((resolve) => {
      const close = () => {
        snackbar.classList.remove('visible');
        setTimeout(() => {
          snackbar.remove();
          this.active = false;
          this.processQueue();
          resolve();
        }, 300);
      };

      if (current.confirm) {
        snackbar.querySelector('.cancel').onclick = () => {
          if (current.onCancel) current.onCancel();
          close();
        };
        snackbar.querySelector('.confirm').onclick = () => {
          if (current.onConfirm) current.onConfirm();
          close();
        };
      } else {
        const closeBtn = snackbar.querySelector('.close');
        closeBtn.onclick = close;
        
        // Auto close after 5s if not confirm
        if (!current.persist) {
          setTimeout(close, current.duration || 5000);
        }
      }
    });
  }
}

// Initializing global system
window.Snackbar = new SnackbarSystem();

// Shorthand for easier replacement of alerts
window.alert = (msg) => window.Snackbar.show(msg);

/**
 * Exported shorthand for modules
 */
export function showSnackbar(message, type = 'info') {
  window.Snackbar.show(message, { type });
}
