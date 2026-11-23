/**
 * Material 3 Exposed Dropdown Menu (Global Enhancer)
 * Convierte automáticamente los <select> dentro de .m3-field en selectores
 * desplegables Material 3 estilo "Registrar Labor de Hoy", manteniendo 100%
 * de compatibilidad con FormData, select.value, eventos change/input y <option> dinámicos.
 */

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function injectM3SelectStyles() {
  if (document.getElementById('m3-select-picker-styles')) return;
  const style = document.createElement('style');
  style.id = 'm3-select-picker-styles';
  style.textContent = `
    .m3-sel-native-hidden {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      min-height: 0 !important;
      opacity: 0 !important;
      pointer-events: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      overflow: hidden !important;
    }
    .m3-field.m3-sel-has-trigger {
      position: relative;
    }
    .m3-field.m3-sel-has-trigger > label {
      transform: translateY(-27px) scale(0.75) !important;
      color: #4a5d48 !important;
      font-weight: 800 !important;
      background: #ffffff !important;
      padding: 0 5px !important;
      z-index: 2 !important;
      pointer-events: none !important;
    }
    .m3-field.m3-sel-has-trigger:has(.m3-sel-trigger.is-open) > label {
      color: #2d3e2c !important;
    }
    .m3-sel-trigger {
      width: 100%;
      min-height: 56px;
      padding: 14px 16px;
      border-radius: 14px;
      border: 1px solid #757c73;
      background: #ffffff;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
      cursor: pointer;
      text-align: left;
      position: relative;
      box-sizing: border-box;
      font-family: 'Work Sans', sans-serif;
      font-size: 14.5px;
      font-weight: 600;
      color: #192b1b;
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }
    .m3-sel-trigger:focus-visible {
      outline: none;
      border: 2px solid #2d3e2c;
      padding: 13px 15px;
    }
    .m3-sel-trigger.is-open {
      border: 2px solid #2d3e2c;
      padding: 13px 15px;
    }
    .m3-sel-trigger:disabled {
      opacity: 0.55;
      cursor: not-allowed;
    }
    .m3-sel-display {
      display: flex;
      align-items: center;
      gap: 8px;
      min-width: 0;
      flex: 1;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .m3-sel-arrow {
      font-size: 20px !important;
      color: #2d3e2c;
      transition: transform 0.15s ease;
      flex-shrink: 0;
    }
    .m3-sel-trigger.is-open .m3-sel-arrow {
      transform: rotate(180deg);
    }
    .m3-sel-menu {
      display: none;
      width: 100%;
      margin-top: 6px;
      background: #f5f9f3;
      border: 1px solid #d5e2d2;
      border-radius: 20px;
      box-shadow: 0 12px 32px rgba(0, 0, 0, 0.14);
      padding: 8px 0;
      max-height: 290px;
      overflow-y: auto;
      -webkit-overflow-scrolling: touch;
      box-sizing: border-box;
      z-index: 30;
    }
    .m3-sel-menu.open {
      display: block;
    }
    .m3-sel-opt {
      padding: 10px 18px;
      cursor: pointer;
      transition: background 0.12s ease;
      background: transparent;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .m3-sel-opt:hover {
      background: rgba(45, 62, 44, 0.06);
    }
    .m3-sel-opt.is-selected {
      background: #e6efe3;
    }
    .m3-sel-opt-main {
      min-width: 0;
      flex: 1;
    }
    .m3-sel-opt-title {
      font-size: 15px;
      font-weight: 600;
      color: #192b1b;
      display: flex;
      align-items: center;
      gap: 8px;
      line-height: 1.3;
    }
    .m3-sel-opt-sub {
      font-size: 12.5px;
      color: #4a5d48;
      margin-top: 2px;
      line-height: 1.3;
    }
    .m3-sel-opt-sub.has-icon {
      padding-left: 26px;
    }
  `;
  document.head.appendChild(style);
}

const openMenus = new Set();

function closeAllMenus(except = null) {
  openMenus.forEach(entry => {
    if (entry.menu !== except) {
      entry.menu.classList.remove('open');
      entry.trigger.classList.remove('is-open');
      entry.trigger.setAttribute('aria-expanded', 'false');
      openMenus.delete(entry);
    }
  });
}

function enhanceSelect(selectEl) {
  if (!selectEl || selectEl.dataset.m3SelEnhanced === '1' || selectEl.dataset.nativeSelect === 'true') return;
  if (selectEl.multiple) return;

  const fieldEl = selectEl.parentElement;
  if (!fieldEl || !fieldEl.classList.contains('m3-field')) return;

  selectEl.dataset.m3SelEnhanced = '1';
  selectEl.classList.add('m3-sel-native-hidden');
  selectEl.tabIndex = -1;

  const triggerBtn = document.createElement('button');
  triggerBtn.type = 'button';
  triggerBtn.className = 'm3-sel-trigger';
  triggerBtn.setAttribute('aria-haspopup', 'listbox');
  triggerBtn.setAttribute('aria-expanded', 'false');
  triggerBtn.innerHTML = `
    <span class="m3-sel-display"></span>
    <span class="material-icons m3-sel-arrow">arrow_drop_down</span>
  `;

  const menuEl = document.createElement('div');
  menuEl.className = 'm3-sel-menu';
  menuEl.setAttribute('role', 'listbox');

  selectEl.insertAdjacentElement('afterend', triggerBtn);
  triggerBtn.insertAdjacentElement('afterend', menuEl);

  const displayEl = triggerBtn.querySelector('.m3-sel-display');
  const menuEntry = { menu: menuEl, trigger: triggerBtn };

  const nativeSelectDesc = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value');

  const getSelectedOption = () => {
    const idx = selectEl.selectedIndex;
    if (idx >= 0 && selectEl.options[idx]) return selectEl.options[idx];
    return selectEl.options[0] || null;
  };

  const renderOptions = () => {
    const opts = Array.from(selectEl.options || []);
    const activeOpt = getSelectedOption();
    menuEl.innerHTML = opts.map((opt, idx) => {
      if (opt.hidden && !opt.value) return '';
      const isSelected = activeOpt ? opt === activeOpt : idx === 0;
      const icon = opt.dataset?.icon || '';
      const sub = opt.dataset?.sub || '';
      const titleText = opt.textContent?.trim() || opt.value || '';
      const isDisabledOpt = Boolean(opt.disabled);
      return `
        <div class="m3-sel-opt ${isSelected ? 'is-selected' : ''}"
             role="option"
             aria-selected="${isSelected ? 'true' : 'false'}"
             data-opt-idx="${idx}"
             data-disabled="${isDisabledOpt ? '1' : '0'}"
             style="${isDisabledOpt ? 'opacity:0.45;cursor:not-allowed;' : ''}">
          <div class="m3-sel-opt-main">
            <div class="m3-sel-opt-title">
              ${icon ? `<span>${escapeHtml(icon)}</span>` : ''}
              <span>${escapeHtml(titleText)}</span>
            </div>
            ${sub ? `<div class="m3-sel-opt-sub ${icon ? 'has-icon' : ''}">${escapeHtml(sub)}</div>` : ''}
          </div>
          ${!sub && isSelected ? `<span class="material-icons" style="font-size:18px;color:#2d3e2c;flex-shrink:0;">check</span>` : ''}
        </div>
      `;
    }).join('');
  };

  const syncDisplay = () => {
    const activeOpt = getSelectedOption();
    const titleText = activeOpt?.textContent?.trim() || activeOpt?.value || '';
    if (!activeOpt || (!titleText && !activeOpt.value)) {
      displayEl.innerHTML = '<span style="color:#6b7280;font-weight:500;">Seleccionar...</span>';
      triggerBtn.disabled = Boolean(selectEl.disabled);
      return;
    }
    const icon = activeOpt.dataset?.icon || '';
    displayEl.innerHTML = `${icon ? `<span>${escapeHtml(icon)}</span>` : ''}<span style="overflow:hidden;text-overflow:ellipsis;">${escapeHtml(titleText)}</span>`;
    triggerBtn.disabled = Boolean(selectEl.disabled);
    if (menuEl.classList.contains('open')) {
      renderOptions();
    }
  };

  const syncVisibility = () => {
    const hiddenByInline = selectEl.style.display === 'none' || selectEl.hidden;
    if (hiddenByInline) {
      triggerBtn.style.display = 'none';
      menuEl.classList.remove('open');
      triggerBtn.classList.remove('is-open');
      triggerBtn.setAttribute('aria-expanded', 'false');
      openMenus.delete(menuEntry);
      fieldEl.classList.remove('m3-sel-has-trigger');
    } else {
      triggerBtn.style.display = 'flex';
      fieldEl.classList.add('m3-sel-has-trigger');
      syncDisplay();
    }
  };

  if (nativeSelectDesc && nativeSelectDesc.get && nativeSelectDesc.set) {
    Object.defineProperty(selectEl, 'value', {
      configurable: true,
      get() {
        return nativeSelectDesc.get.call(this);
      },
      set(val) {
        nativeSelectDesc.set.call(this, val);
        syncDisplay();
      },
    });
  }

  triggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (triggerBtn.disabled) return;
    const willOpen = !menuEl.classList.contains('open');
    closeAllMenus(willOpen ? menuEl : null);
    if (willOpen) {
      renderOptions();
      menuEl.classList.add('open');
      triggerBtn.classList.add('is-open');
      triggerBtn.setAttribute('aria-expanded', 'true');
      openMenus.add(menuEntry);
      requestAnimationFrame(() => {
        menuEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    } else {
      menuEl.classList.remove('open');
      triggerBtn.classList.remove('is-open');
      triggerBtn.setAttribute('aria-expanded', 'false');
      openMenus.delete(menuEntry);
    }
  });

  menuEl.addEventListener('click', (e) => {
    e.stopPropagation();
    const optEl = e.target.closest('.m3-sel-opt');
    if (!optEl || optEl.dataset.disabled === '1') return;
    const idx = parseInt(optEl.dataset.optIdx, 10);
    const chosen = selectEl.options[idx];
    if (!chosen) return;

    if (nativeSelectDesc && nativeSelectDesc.set) {
      nativeSelectDesc.set.call(selectEl, chosen.value);
    } else {
      selectEl.selectedIndex = idx;
    }
    syncDisplay();
    fieldEl.classList.toggle('has-value', Boolean(chosen.value));

    menuEl.classList.remove('open');
    triggerBtn.classList.remove('is-open');
    triggerBtn.setAttribute('aria-expanded', 'false');
    openMenus.delete(menuEntry);

    selectEl.dispatchEvent(new Event('input', { bubbles: true }));
    selectEl.dispatchEvent(new Event('change', { bubbles: true }));
    syncVisibility();
  });

  selectEl.addEventListener('change', () => {
    syncVisibility();
    syncDisplay();
  });
  selectEl.form?.addEventListener('reset', () => {
    requestAnimationFrame(() => {
      syncVisibility();
      syncDisplay();
    });
  });

  const selectObserver = new MutationObserver(() => {
    syncVisibility();
    syncDisplay();
  });
  selectObserver.observe(selectEl, {
    attributes: true,
    attributeFilter: ['style', 'disabled', 'hidden'],
    childList: true,
    subtree: true,
  });

  syncVisibility();
  syncDisplay();
}

function scanSelects(root) {
  if (!root || root.nodeType !== 1) return;
  if (root.matches?.('.m3-field > select')) {
    enhanceSelect(root);
  }
  root.querySelectorAll?.('.m3-field > select').forEach(enhanceSelect);
}

let _selectsInitialized = false;

export function initGlobalM3Selects() {
  if (_selectsInitialized) return;
  _selectsInitialized = true;
  injectM3SelectStyles();

  scanSelects(document.body);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) scanSelects(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.m3-sel-menu') && !e.target.closest('.m3-sel-trigger')) {
      closeAllMenus();
    }
  });
}
