function getStorageKey() {
  const empId = window._currentEmpresaId || 'default';
  return `cuentas_custom_cats_${empId}`;
}

export function loadCustomCategories() {
  try {
    const raw = localStorage.getItem(getStorageKey());
    if (!raw) return { egreso: [], ingreso: [] };
    const parsed = JSON.parse(raw);
    return {
      egreso: Array.isArray(parsed?.egreso) ? parsed.egreso : [],
      ingreso: Array.isArray(parsed?.ingreso) ? parsed.ingreso : []
    };
  } catch {
    return { egreso: [], ingreso: [] };
  }
}

export function saveCustomCategory(tipo, name) {
  const clean = String(name || '').trim();
  if (!clean) return null;
  const normalized = tipo === 'ingreso'
    ? (clean.toLowerCase().startsWith('ingreso · ') ? clean : `Ingreso · ${clean}`)
    : clean;
  const store = loadCustomCategories();
  const list = tipo === 'ingreso' ? store.ingreso : store.egreso;
  if (!list.some(c => c.toLowerCase() === normalized.toLowerCase())) {
    list.push(normalized);
    try {
      localStorage.setItem(getStorageKey(), JSON.stringify(store));
    } catch {}
  }
  return normalized;
}

export function mergeCategories(baseList, tipo) {
  const custom = loadCustomCategories();
  const extras = tipo === 'ingreso' ? custom.ingreso : custom.egreso;
  const otrosLabel = tipo === 'ingreso' ? 'Ingreso · Otros' : 'Otros';
  const withoutOtros = baseList.filter(c => c !== otrosLabel);
  const merged = [...withoutOtros];
  extras.forEach(c => {
    if (!merged.some(m => m.toLowerCase() === c.toLowerCase()) && c !== otrosLabel) {
      merged.push(c);
    }
  });
  merged.push(otrosLabel);
  return merged;
}

export function openNewCategoryBottomSheet({ tipo = 'egreso', onCreated, onUseOtros } = {}) {
  const existingScrim = document.getElementById('custom-cat-sheet-scrim');
  const existingSheet = document.getElementById('custom-cat-sheet');
  if (existingScrim) existingScrim.remove();
  if (existingSheet) existingSheet.remove();

  const isIng = tipo === 'ingreso';
  const titleText = isIng ? 'Nuevo producto de ingreso' : 'Nueva categoría';
  const placeholderText = isIng ? 'Ej. Miel, Madera, Cacao...' : 'Ej. Transporte, Energía, Riego...';

  const scrim = document.createElement('div');
  scrim.id = 'custom-cat-sheet-scrim';
  scrim.style.cssText = 'position:fixed; inset:0; background:rgba(0,0,0,0.45); backdrop-filter:blur(2px); z-index:100010; opacity:0; transition:opacity .22s ease;';

  const sheet = document.createElement('div');
  sheet.id = 'custom-cat-sheet';
  sheet.setAttribute('role', 'dialog');
  sheet.setAttribute('aria-modal', 'true');
  sheet.style.cssText = 'position:fixed; left:0; right:0; bottom:0; margin:0 auto; width:100%; max-width:520px; background:#ffffff; border-top-left-radius:26px; border-top-right-radius:26px; z-index:100011; padding:10px 20px 24px; box-sizing:border-box; box-shadow:0 -12px 36px rgba(0,0,0,0.22); transform:translateY(100%); transition:transform .26s cubic-bezier(0.16, 1, 0.3, 1); font-family:"Plus Jakarta Sans","Work Sans",sans-serif;';

  sheet.innerHTML = `
    <div style="width:40px; height:4px; border-radius:999px; background:#c4cfc2; margin:0 auto 12px;"></div>
    <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:14px;">
      <div>
        <div style="font-size:17px; font-weight:800; color:#1e3e2b;">${titleText}</div>
        <div style="font-size:12px; color:#5a6b58; margin-top:2px;">Se agregará a tu lista de categorías</div>
      </div>
      <button type="button" id="cc-close-btn" class="btn-close" aria-label="Cerrar">
        <span class="material-icons">close</span>
      </button>
    </div>

    <div class="m3-field" style="margin-bottom:6px;">
      <input type="text" id="cc-name-input" placeholder=" " maxlength="40" autocomplete="off" style="font-size:14.5px; font-weight:600; background:#ffffff;">
      <label for="cc-name-input" style="background:#ffffff;">${isIng ? 'Nombre del producto' : 'Nombre de la categoría'}</label>
    </div>
    <div style="font-size:11.5px; color:#5a6b58; padding-left:14px; margin-bottom:4px;">${placeholderText}</div>
    <div id="cc-err" style="display:none; font-size:12px; font-weight:600; color:#ba1a1a; padding-left:14px; margin-bottom:8px;"></div>

    <div style="display:grid; grid-template-columns:1fr 1.4fr; gap:10px; margin-top:16px;">
      <button type="button" id="cc-use-otros-btn" style="height:44px; border-radius:999px; border:1px solid #d5e2d2; background:#ffffff; color:#2d3e2c; font-size:13.5px; font-weight:700; cursor:pointer;">
        Usar "Otros"
      </button>
      <button type="button" id="cc-save-btn" style="height:44px; border-radius:999px; border:none; background:#2d3e2c; color:#ffffff; font-size:13.5px; font-weight:700; cursor:pointer;">
        Crear y usar
      </button>
    </div>
  `;

  document.body.appendChild(scrim);
  document.body.appendChild(sheet);

  const close = () => {
    scrim.style.opacity = '0';
    sheet.style.transform = 'translateY(100%)';
    setTimeout(() => {
      scrim.remove();
      sheet.remove();
    }, 240);
  };

  requestAnimationFrame(() => {
    scrim.style.opacity = '1';
    sheet.style.transform = 'translateY(0)';
    setTimeout(() => document.getElementById('cc-name-input')?.focus(), 140);
  });

  scrim.addEventListener('click', close);
  sheet.querySelector('#cc-close-btn')?.addEventListener('click', close);

  sheet.querySelector('#cc-use-otros-btn')?.addEventListener('click', () => {
    close();
    if (typeof onUseOtros === 'function') onUseOtros();
  });

  const handleCreate = () => {
    const input = document.getElementById('cc-name-input');
    const errEl = document.getElementById('cc-err');
    const val = (input?.value || '').trim();
    if (!val) {
      if (errEl) {
        errEl.textContent = 'Escribe un nombre para crear la categoría';
        errEl.style.display = 'block';
      }
      input?.focus();
      return;
    }
    const created = saveCustomCategory(tipo, val);
    close();
    if (created && typeof onCreated === 'function') {
      onCreated(created);
    }
  };

  sheet.querySelector('#cc-save-btn')?.addEventListener('click', handleCreate);
  sheet.querySelector('#cc-name-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      handleCreate();
    }
  });
}
