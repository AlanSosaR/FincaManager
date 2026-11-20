/**
 * Material 3 Expressive Snackbar System
 */
class SnackbarSystem {
  constructor() {
    this.container = document.getElementById('snackbar-container');
    this.queue = [];
    this.active = false;
    this._lastMsg = '';
    this._lastMsgAt = 0;
  }

  show(message, options = {}) {
    const now = Date.now();
    const msgStr = String(message || '');
    if (msgStr && msgStr === this._lastMsg && (now - this._lastMsgAt) < 1800) {
      return;
    }
    if (this.queue.some(q => !q.confirm && String(q.message || '') === msgStr)) {
      return;
    }
    this._lastMsg = msgStr;
    this._lastMsgAt = now;
    if (this.active && !this._isConfirmActive) {
      this.dismissAll();
    }
    this.queue.push({ message, ...options });
    this.processQueue();
  }

  confirm(message, onConfirm, onCancel, options = {}) {
    this.dismissAll();
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
    if (this._autoTimer) {
      clearTimeout(this._autoTimer);
      this._autoTimer = null;
    }
    this.container.querySelectorAll('.m3-snackbar').forEach(el => {
      el.classList.remove('visible');
      el.remove();
    });
    this.active = false;
    this._isConfirmActive = false;
    this.queue = [];
  }

  async processQueue() {
    if (this.active || this.queue.length === 0) return;
    this.active = true;

    const current = this.queue.shift();
    this._isConfirmActive = Boolean(current.confirm);
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
        ${(current.actions || current.confirm || current.actionText) ? `
          <div class="m3-snackbar-actions" style="flex-wrap:wrap; gap:8px;">
            ${current.actions ? `
              ${current.actions.map((act, i) => `
                <button class="m3-snackbar-btn ${act.type || ''}" data-action-idx="${i}" style="${act.style || ''}">${act.text}</button>
              `).join('')}
            ` : current.confirm ? `
              ${current.cancelText !== false ? `<button class="m3-snackbar-btn cancel">${current.cancelText || 'Cancelar'}</button>` : ''}
              <button class="m3-snackbar-btn confirm">${current.confirmText || 'Confirmar'}</button>
            ` : `
              <button class="m3-snackbar-btn close">${current.actionText}</button>
            `}
          </div>
        ` : ''}
      </div>
    `;

    // Garantizar que nunca se apilen 2 snackbars visibles a la vez
    this.container.querySelectorAll('.m3-snackbar').forEach(el => el.remove());
    this.container.appendChild(snackbar);

    // Trigger entrance animation
    requestAnimationFrame(() => snackbar.classList.add('visible'));

    return new Promise((resolve) => {
      const close = () => {
        if (this._autoTimer) {
          clearTimeout(this._autoTimer);
          this._autoTimer = null;
        }
        snackbar.classList.remove('visible');
        setTimeout(() => {
          snackbar.remove();
          this.active = false;
          this._isConfirmActive = false;
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
        let handled = false;
        const cancelBtn = snackbar.querySelector('.cancel');
        const confirmBtn = snackbar.querySelector('.confirm');
        if (cancelBtn) {
          cancelBtn.onclick = () => {
            if (handled) return;
            handled = true;
            if (current.onCancel) current.onCancel();
            close();
          };
        }
        if (confirmBtn) {
          confirmBtn.onclick = () => {
            if (handled) return;
            handled = true;
            confirmBtn.disabled = true;
            if (current.onConfirm) current.onConfirm();
            close();
          };
        }
      } else {
        const closeBtn = snackbar.querySelector('.close');
        if (closeBtn) {
          closeBtn.onclick = () => {
            if (current.onAction) current.onAction();
            close();
          };
        }
        
        // Auto close after 2.6s for plain info toasts, 5s otherwise
        if (!current.persist) {
          const ms = current.duration || ((!current.actions && !current.actionText) ? 2600 : 5000);
          this._autoTimer = setTimeout(close, ms);
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
