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

  dismissAll() {
    this.container.querySelectorAll('.m3-snackbar').forEach(el => {
      el.classList.remove('visible');
      el.remove();
    });
    this.active = false;
    this.queue = [];
  }

  async processQueue() {
    if (this.active || this.queue.length === 0) return;
    this.active = true;

    const current = this.queue.shift();
    const snackbar = document.createElement('div');
    snackbar.className = `m3-snackbar ${current.type || 'info'} ${current.confirm || current.actions ? 'expressive' : ''}`;
    
    if (current.theme === 'white') {
      snackbar.style.background = '#ffffff';
      snackbar.style.color = '#1a2e1a';
      snackbar.style.border = '1px solid rgba(45,62,44,0.18)';
      snackbar.style.boxShadow = '0 8px 24px rgba(0,0,0,0.18)';
    }

    snackbar.innerHTML = `
      <div class="m3-snackbar-content">
        <span class="m3-snackbar-text">${current.message}</span>
        <div class="m3-snackbar-actions" style="flex-wrap:wrap; gap:8px;">
          ${current.actions ? `
            ${current.actions.map((act, i) => `
              <button class="m3-snackbar-btn ${act.type || ''}" data-action-idx="${i}" style="${act.style || ''}">${act.text}</button>
            `).join('')}
          ` : current.confirm ? `
            ${current.cancelText !== false ? `<button class="m3-snackbar-btn cancel">${current.cancelText || 'Cancelar'}</button>` : ''}
            <button class="m3-snackbar-btn confirm">${current.confirmText || 'Confirmar'}</button>
          ` : `
            <button class="m3-snackbar-btn close">${current.actionText || 'Cerrar'}</button>
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

      if (current.actions) {
        snackbar.querySelectorAll('[data-action-idx]').forEach(btn => {
          btn.onclick = async () => {
            const idx = Number(btn.getAttribute('data-action-idx'));
            const act = current.actions[idx];
            if (act && act.onClick) {
              await act.onClick();
            }
            close();
          };
        });
      } else if (current.confirm) {
        const cancelBtn = snackbar.querySelector('.cancel');
        if (cancelBtn) {
          cancelBtn.onclick = () => {
            if (current.onCancel) current.onCancel();
            close();
          };
        }
        snackbar.querySelector('.confirm').onclick = () => {
          if (current.onConfirm) current.onConfirm();
          close();
        };
      } else {
        const closeBtn = snackbar.querySelector('.close');
        if (closeBtn) {
          closeBtn.onclick = () => {
            if (current.onAction) current.onAction();
            close();
          };
        }
        
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
