/**
 * Material 3 Docked Date Picker (Global Enhancer)
 * Convierte automáticamente todos los <input type="date"> en Material 3 Docked Date Pickers
 * manteniendo 100% de compatibilidad con FormData, input.value y eventos change/input.
 */

const MONTHS_SHORT_M3 = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
const MONTHS_FULL_M3 = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

function getTodayIsoLocal() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

function isoToDisplay(iso) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}/.test(String(iso))) return '';
  const p = String(iso).slice(0, 10).split('-');
  return `${p[2]}/${p[1]}/${p[0]}`;
}

function displayToIso(str) {
  const m = String(str || '').trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const dd = parseInt(m[1], 10);
  const mm = parseInt(m[2], 10);
  const yyyy = parseInt(m[3], 10);
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31 || yyyy < 1900 || yyyy > 2100) return null;
  const dt = new Date(yyyy, mm - 1, dd);
  if (dt.getFullYear() !== yyyy || dt.getMonth() !== mm - 1 || dt.getDate() !== dd) return null;
  return `${yyyy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

function injectM3DatePickerStyles() {
  if (document.getElementById('m3-docked-dp-styles')) return;
  const style = document.createElement('style');
  style.id = 'm3-docked-dp-styles';
  style.textContent = `
    .m3-dp-native-hidden {
      position: absolute !important;
      width: 1px !important;
      height: 1px !important;
      opacity: 0 !important;
      pointer-events: none !important;
      margin: 0 !important;
      padding: 0 !important;
      border: 0 !important;
      overflow: hidden !important;
    }
    .m3-dp-toggle-btn {
      position: absolute;
      right: 8px;
      top: 50%;
      transform: translateY(-50%);
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: none;
      background: #eef3ed;
      color: #2d3e2c;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      z-index: 3;
      transition: background 0.15s ease;
    }
    .m3-dp-toggle-btn:hover {
      background: #dfe9dd;
    }
    .m3-dp-panel {
      display: none;
      margin-top: 6px;
      margin-bottom: 10px;
      background: #f4f7f3;
      border: 1px solid #d5e2d2;
      border-radius: 20px;
      padding: 14px;
      box-shadow: 0 10px 26px rgba(24, 40, 22, 0.12);
      font-family: 'Plus Jakarta Sans', 'Work Sans', sans-serif;
      box-sizing: border-box;
      width: 100%;
    }
    .m3-dp-panel.open {
      display: block;
    }
    .m3-dp-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 4px;
      margin-bottom: 10px;
    }
    .m3-dp-nav-group {
      display: inline-flex;
      align-items: center;
      gap: 2px;
    }
    .m3-dp-icon-btn {
      width: 30px;
      height: 30px;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: #2d3e2c;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      cursor: pointer;
    }
    .m3-dp-icon-btn:hover {
      background: #e4ede2;
    }
    .m3-dp-select-btn {
      height: 30px;
      padding: 0 8px;
      border-radius: 999px;
      border: none;
      background: transparent;
      color: #1e3e2b;
      font-size: 13.5px;
      font-weight: 800;
      display: inline-flex;
      align-items: center;
      gap: 2px;
      cursor: pointer;
      font-family: inherit;
    }
    .m3-dp-select-btn:hover {
      background: #e4ede2;
    }
    .m3-dp-weekdays {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      text-align: center;
      margin-bottom: 4px;
    }
    .m3-dp-weekdays span {
      font-size: 11.5px;
      font-weight: 700;
      color: #5a6b58;
      padding: 4px 0;
    }
    .m3-dp-days {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 2px;
      text-align: center;
    }
    .m3-dp-day-btn {
      width: 36px;
      height: 36px;
      margin: 0 auto;
      border-radius: 50%;
      border: none;
      background: transparent;
      color: #111827;
      font-size: 13px;
      font-weight: 600;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      font-family: inherit;
      transition: background 0.14s ease;
    }
    .m3-dp-day-btn:hover {
      background: #e4ede2;
    }
    .m3-dp-day-btn.is-today {
      border: 1.5px solid #2d3e2c;
      color: #2d3e2c;
      font-weight: 800;
    }
    .m3-dp-day-btn.is-selected {
      background: #2d3e2c !important;
      color: #ffffff !important;
      border: none !important;
      font-weight: 800;
    }
    .m3-dp-grid-picker {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 6px;
      max-height: 210px;
      overflow-y: auto;
      padding: 4px 0;
    }
    .m3-dp-grid-item {
      height: 36px;
      border-radius: 999px;
      border: 1px solid #d5e2d2;
      background: #ffffff;
      color: #1e3e2b;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      font-family: inherit;
    }
    .m3-dp-grid-item.active {
      background: #2d3e2c;
      color: #ffffff;
      border-color: #2d3e2c;
    }
  `;
  document.head.appendChild(style);
}

const openPanels = new Set();

function closeAllPanels(except = null) {
  openPanels.forEach(p => {
    if (p !== except) {
      p.classList.remove('open');
      openPanels.delete(p);
    }
  });
}

function enhanceDateInput(nativeInput) {
  if (!nativeInput || nativeInput.dataset.m3DpEnhanced === '1' || nativeInput.dataset.m3DpSkip === '1') return;
  if (nativeInput.type !== 'date') return;

  nativeInput.dataset.m3DpEnhanced = '1';
  const parent = nativeInput.parentElement;
  if (!parent) return;

  const isM3Field = parent.classList.contains('m3-field');
  const hostEl = isM3Field ? parent : (() => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative; width:100%;';
    parent.insertBefore(wrap, nativeInput);
    wrap.appendChild(nativeInput);
    return wrap;
  })();

  if (getComputedStyle(hostEl).position === 'static') {
    hostEl.style.position = 'relative';
  }

  // Ocultar input nativo manteniendo compatibilidad con FormData / .value / eventos
  nativeInput.classList.add('m3-dp-native-hidden');
  nativeInput.tabIndex = -1;

  // Input de texto visible DD/MM/AAAA
  const textInput = document.createElement('input');
  textInput.type = 'text';
  textInput.className = 'm3-dp-text-input';
  textInput.placeholder = isM3Field ? ' ' : 'DD/MM/AAAA';
  textInput.maxLength = 10;
  textInput.inputMode = 'numeric';
  textInput.autocomplete = 'off';
  textInput.value = isoToDisplay(nativeInput.value);
  if (!isM3Field) {
    textInput.style.cssText = 'width:100%; height:44px; border-radius:12px; border:1.5px solid #8a9b88; background:#ffffff; padding:0 48px 0 14px; font-size:14px; font-weight:600; color:#111827; font-family:inherit; box-sizing:border-box; outline:none;';
  } else {
    textInput.style.paddingRight = '48px';
    textInput.style.fontWeight = '600';
  }

  // Botón de calendario
  const toggleBtn = document.createElement('button');
  toggleBtn.type = 'button';
  toggleBtn.className = 'm3-dp-toggle-btn';
  toggleBtn.setAttribute('aria-label', 'Abrir calendario');
  toggleBtn.innerHTML = '<span class="material-symbols-outlined" style="font-size:19px;">calendar_today</span>';

  // Insertar justo después del input nativo (antes del <label> en .m3-field)
  nativeInput.insertAdjacentElement('afterend', textInput);
  textInput.insertAdjacentElement('afterend', toggleBtn);

  // Panel del Docked Date Picker
  const panel = document.createElement('div');
  panel.className = 'm3-dp-panel';
  hostEl.insertAdjacentElement('afterend', panel);

  const todayIso = getTodayIsoLocal();
  let selectedIso = nativeInput.value || '';
  const initBase = selectedIso || todayIso;
  const initParts = initBase.split('-').map(Number);
  let viewYear = initParts[0] || new Date().getFullYear();
  let viewMonth = (initParts[1] || 1) - 1;
  let pickerMode = 'days'; // 'days' | 'months' | 'years'

  // Interceptar nativeInput.value = '...' programático
  const nativeDescriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');
  if (nativeDescriptor && nativeDescriptor.get && nativeDescriptor.set) {
    Object.defineProperty(nativeInput, 'value', {
      configurable: true,
      get() {
        return nativeDescriptor.get.call(this);
      },
      set(val) {
        nativeDescriptor.set.call(this, val);
        selectedIso = String(val || '').slice(0, 10);
        textInput.value = isoToDisplay(selectedIso);
        if (/^\d{4}-\d{2}-\d{2}$/.test(selectedIso)) {
          const p = selectedIso.split('-').map(Number);
          viewYear = p[0];
          viewMonth = p[1] - 1;
        }
      }
    });
  }

  const setDateValue = (iso, dispatch = true) => {
    selectedIso = iso;
    nativeDescriptor.set.call(nativeInput, iso);
    textInput.value = isoToDisplay(iso);
    if (dispatch) {
      nativeInput.dispatchEvent(new Event('input', { bubbles: true }));
      nativeInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };

  const renderPanel = () => {
    const headerHtml = `
      <div class="m3-dp-header">
        <div class="m3-dp-nav-group">
          <button type="button" class="m3-dp-icon-btn" data-act="prev-m" aria-label="Mes anterior">
            <span class="material-symbols-outlined" style="font-size:19px;">chevron_left</span>
          </button>
          <button type="button" class="m3-dp-select-btn" data-act="toggle-months">
            <span>${MONTHS_SHORT_M3[viewMonth]}</span>
            <span class="material-symbols-outlined" style="font-size:17px;">arrow_drop_down</span>
          </button>
          <button type="button" class="m3-dp-icon-btn" data-act="next-m" aria-label="Mes siguiente">
            <span class="material-symbols-outlined" style="font-size:19px;">chevron_right</span>
          </button>
        </div>
        <div class="m3-dp-nav-group">
          <button type="button" class="m3-dp-icon-btn" data-act="prev-y" aria-label="Año anterior">
            <span class="material-symbols-outlined" style="font-size:19px;">chevron_left</span>
          </button>
          <button type="button" class="m3-dp-select-btn" data-act="toggle-years">
            <span>${viewYear}</span>
            <span class="material-symbols-outlined" style="font-size:17px;">arrow_drop_down</span>
          </button>
          <button type="button" class="m3-dp-icon-btn" data-act="next-y" aria-label="Año siguiente">
            <span class="material-symbols-outlined" style="font-size:19px;">chevron_right</span>
          </button>
        </div>
      </div>
    `;

    let bodyHtml = '';
    if (pickerMode === 'months') {
      bodyHtml = `
        <div class="m3-dp-grid-picker">
          ${MONTHS_FULL_M3.map((mName, idx) => `
            <button type="button" class="m3-dp-grid-item ${idx === viewMonth ? 'active' : ''}" data-pick-m="${idx}">${mName.slice(0, 3)}</button>
          `).join('')}
        </div>
      `;
    } else if (pickerMode === 'years') {
      const curY = new Date().getFullYear();
      const years = [];
      for (let y = curY + 5; y >= curY - 30; y--) years.push(y);
      bodyHtml = `
        <div class="m3-dp-grid-picker">
          ${years.map(y => `
            <button type="button" class="m3-dp-grid-item ${y === viewYear ? 'active' : ''}" data-pick-y="${y}">${y}</button>
          `).join('')}
        </div>
      `;
    } else {
      const firstDay = new Date(viewYear, viewMonth, 1).getDay();
      const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
      const cells = [];
      for (let i = 0; i < firstDay; i++) cells.push({ empty: true });
      for (let d = 1; d <= daysInMonth; d++) {
        const iso = `${viewYear}-${String(viewMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        cells.push({ day: d, iso });
      }
      bodyHtml = `
        <div class="m3-dp-weekdays">
          ${['D', 'L', 'M', 'X', 'J', 'V', 'S'].map(w => `<span>${w}</span>`).join('')}
        </div>
        <div class="m3-dp-days">
          ${cells.map(c => {
            if (c.empty) return '<span></span>';
            const cls = [
              'm3-dp-day-btn',
              c.iso === todayIso ? 'is-today' : '',
              c.iso === selectedIso ? 'is-selected' : ''
            ].filter(Boolean).join(' ');
            return `<button type="button" class="${cls}" data-pick-iso="${c.iso}">${c.day}</button>`;
          }).join('')}
        </div>
      `;
    }

    panel.innerHTML = headerHtml + bodyHtml;

    panel.querySelector('[data-act="prev-m"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      viewMonth--;
      if (viewMonth < 0) { viewMonth = 11; viewYear--; }
      pickerMode = 'days';
      renderPanel();
    });
    panel.querySelector('[data-act="next-m"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      viewMonth++;
      if (viewMonth > 11) { viewMonth = 0; viewYear++; }
      pickerMode = 'days';
      renderPanel();
    });
    panel.querySelector('[data-act="prev-y"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      viewYear--;
      pickerMode = 'days';
      renderPanel();
    });
    panel.querySelector('[data-act="next-y"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      viewYear++;
      pickerMode = 'days';
      renderPanel();
    });
    panel.querySelector('[data-act="toggle-months"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      pickerMode = pickerMode === 'months' ? 'days' : 'months';
      renderPanel();
    });
    panel.querySelector('[data-act="toggle-years"]')?.addEventListener('click', (e) => {
      e.stopPropagation();
      pickerMode = pickerMode === 'years' ? 'days' : 'years';
      renderPanel();
    });
    panel.querySelectorAll('[data-pick-m]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        viewMonth = Number(btn.dataset.pickM);
        pickerMode = 'days';
        renderPanel();
      });
    });
    panel.querySelectorAll('[data-pick-y]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        viewYear = Number(btn.dataset.pickY);
        pickerMode = 'days';
        renderPanel();
      });
    });
    panel.querySelectorAll('[data-pick-iso]').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        setDateValue(btn.dataset.pickIso, true);
        panel.classList.remove('open');
        openPanels.delete(panel);
      });
    });
  };

  const openPanel = () => {
    closeAllPanels(panel);
    const curVal = nativeInput.value || todayIso;
    if (/^\d{4}-\d{2}-\d{2}/.test(curVal)) {
      selectedIso = curVal.slice(0, 10);
      const p = selectedIso.split('-').map(Number);
      viewYear = p[0];
      viewMonth = p[1] - 1;
    }
    pickerMode = 'days';
    renderPanel();
    panel.classList.add('open');
    openPanels.add(panel);
    requestAnimationFrame(() => {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  };

  toggleBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (panel.classList.contains('open')) {
      panel.classList.remove('open');
      openPanels.delete(panel);
    } else {
      openPanel();
    }
  });

  textInput.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!panel.classList.contains('open')) openPanel();
  });

  textInput.addEventListener('input', () => {
    let digits = textInput.value.replace(/\D/g, '').slice(0, 8);
    if (digits.length >= 5) {
      textInput.value = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
    } else if (digits.length >= 3) {
      textInput.value = `${digits.slice(0, 2)}/${digits.slice(2)}`;
    }
    const iso = displayToIso(textInput.value);
    if (iso) {
      setDateValue(iso, true);
      const p = iso.split('-').map(Number);
      viewYear = p[0];
      viewMonth = p[1] - 1;
      if (panel.classList.contains('open')) renderPanel();
    }
  });
}

function scanNode(root) {
  if (!root || root.nodeType !== 1) return;
  if (root.matches?.('input[type="date"]')) {
    enhanceDateInput(root);
  }
  root.querySelectorAll?.('input[type="date"]').forEach(enhanceDateInput);
}

let _initialized = false;

export function initGlobalM3DatePickers() {
  if (_initialized) return;
  _initialized = true;
  injectM3DatePickerStyles();

  scanNode(document.body);

  const observer = new MutationObserver((mutations) => {
    for (const m of mutations) {
      for (const node of m.addedNodes) {
        if (node.nodeType === 1) scanNode(node);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.m3-dp-panel') && !e.target.closest('.m3-dp-toggle-btn') && !e.target.closest('.m3-dp-text-input')) {
      closeAllPanels();
    }
  });
}
