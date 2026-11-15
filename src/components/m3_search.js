/**
 * Reusable Material 3 Full-Screen Contained Search View
 * Matches the Ganado search bar & overlay design across all modules.
 */

export function escapeSearchHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function renderM3SearchBar({
  wrapperId,
  toggleId,
  inputId,
  clearId,
  placeholder = 'Buscar...',
  value = '',
  extraHtml = ''
}) {
  const safeVal = escapeSearchHtml(value);
  return `
    <div class="ganado-split-ctrl expanded m3-search-bar" id="${wrapperId}">
      <button type="button" id="${toggleId}" class="m3-search-icon-btn" title="Buscar" aria-label="Buscar">
        <span class="material-icons">search</span>
      </button>
      <input type="text" id="${inputId}" class="m3-search-input" placeholder="${escapeSearchHtml(placeholder)}" value="${safeVal}" autocomplete="off" readonly>
      <button type="button" id="${clearId}" class="m3-search-icon-btn" style="display: ${value ? 'inline-flex' : 'none'};" title="Limpiar búsqueda" aria-label="Limpiar búsqueda">
        <span class="material-icons">close</span>
      </button>
      ${extraHtml}
    </div>
  `;
}

export function initM3FullScreenSearch({
  moduleKey,
  toggleId,
  inputId,
  clearId,
  placeholder = 'Buscar...',
  ariaLabel = 'Búsqueda enfocada',
  suggestedTitle = 'Sugeridos',
  emptyLabel = 'resultados',
  listClass = 'ganado-list m3-search-inventory-list',
  getQuery,
  setQuery,
  onApplySearch,
  loadItems,
  getQuickChips,
  onFilterChip,
  filterItems,
  renderItem,
  itemSelector,
  getItemTitle,
  onItemClick,
  maxSuggested = 6,
  maxResults = 15
}) {
  const searchToggle = document.getElementById(toggleId);
  const searchInput = document.getElementById(inputId);
  const searchClear = document.getElementById(clearId);
  if (!searchToggle || !searchInput || !searchClear) return null;

  // Clean up any stale overlays from previous screens
  document.querySelectorAll('body > .m3-fs-search-overlay').forEach(el => {
    if (el.id !== 'ganado-fullscreen-search') el.remove();
  });

  const overlayId = `${moduleKey}-fullscreen-search`;
  const existingFs = document.getElementById(overlayId);
  if (existingFs) existingFs.remove();

  let isSearchFocused = false;
  let cachedItems = null;

  const currentVal = (getQuery?.() || '').trim();
  const fsOverlay = document.createElement('div');
  fsOverlay.id = overlayId;
  fsOverlay.className = 'm3-fs-search-overlay';
  fsOverlay.setAttribute('role', 'dialog');
  fsOverlay.setAttribute('aria-modal', 'true');
  fsOverlay.setAttribute('aria-label', ariaLabel);
  fsOverlay.innerHTML = `
    <div class="m3-fs-search-shell">
      <div class="m3-fs-search-header">
        <div class="m3-fs-search-pill">
          <button type="button" id="${moduleKey}-fs-back-btn" class="m3-search-icon-btn" title="Salir de búsqueda" aria-label="Salir de búsqueda">
            <span class="material-icons">arrow_back</span>
          </button>
          <input type="text" id="${moduleKey}-fs-query-field" class="m3-fs-search-input" placeholder="${escapeSearchHtml(placeholder)}" value="${escapeSearchHtml(currentVal)}" autocomplete="off">
          <button type="button" id="${moduleKey}-fs-clear-btn" class="m3-search-icon-btn" style="display: ${currentVal ? 'inline-flex' : 'none'};" title="Limpiar texto" aria-label="Limpiar texto">
            <span class="material-icons">close</span>
          </button>
        </div>
      </div>
      <div class="m3-fs-search-body" id="${moduleKey}-focused-search-content" role="listbox" aria-label="Sugerencias y resultados de búsqueda"></div>
    </div>
  `;
  document.body.appendChild(fsOverlay);

  const fsBackBtn = document.getElementById(`${moduleKey}-fs-back-btn`);
  const fsInput = document.getElementById(`${moduleKey}-fs-query-field`);
  const fsClearBtn = document.getElementById(`${moduleKey}-fs-clear-btn`);
  const focusedContent = document.getElementById(`${moduleKey}-focused-search-content`);

  const getRecentSearchesKey = () => {
    const empId = window._currentEmpresaId || localStorage.getItem('current_empresa_id') || 'default';
    return `finca_${moduleKey}_recent_searches_${empId}`;
  };

  const getRecentSearches = () => {
    try {
      const raw = localStorage.getItem(getRecentSearchesKey());
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.slice(0, 5) : [];
    } catch {
      return [];
    }
  };

  const saveRecentSearch = (term) => {
    const clean = (term || '').trim();
    if (!clean) return;
    const list = getRecentSearches().filter(item => item.toLowerCase() !== clean.toLowerCase());
    list.unshift(clean);
    try {
      localStorage.setItem(getRecentSearchesKey(), JSON.stringify(list.slice(0, 6)));
    } catch {}
  };

  const removeRecentSearch = (term) => {
    const list = getRecentSearches().filter(item => item.toLowerCase() !== (term || '').toLowerCase());
    try {
      localStorage.setItem(getRecentSearchesKey(), JSON.stringify(list));
    } catch {}
  };

  const ensureLoaded = async (forceRefresh = false) => {
    if (cachedItems && !forceRefresh) return;
    try {
      cachedItems = (await loadItems(forceRefresh)) || [];
    } catch {
      cachedItems = [];
    }
  };

  const renderFocusedContent = async (queryText, forceRefresh = false) => {
    await ensureLoaded(forceRefresh);
    const items = cachedItems || [];
    const q = (queryText || '').trim();
    const qLower = q.toLowerCase();

    if (!q) {
      const recents = getRecentSearches();
      const chipsList = (getQuickChips ? getQuickChips(items) : []) || [];
      const suggested = items.slice(0, maxSuggested);

      const chipsHtml = chipsList.length > 0 ? `
        <div class="m3-fs-contained-section">
          <div class="m3-search-section-header">
            <span>Sugerencias rápidas</span>
          </div>
          <div class="m3-search-chips-row">
            ${chipsList.map(c => `
              <button type="button" class="m3-search-suggestion-chip" data-chip-type="${c.type || 'query'}" data-chip-val="${escapeSearchHtml(c.value)}">
                <span class="material-icons">${c.icon || 'search'}</span>
                <span>${escapeSearchHtml(c.label)}</span>
              </button>
            `).join('')}
          </div>
        </div>
      ` : '';

      const recentsHtml = recents.length > 0 ? `
        <div class="m3-fs-contained-section">
          <div class="m3-search-section-header">
            <span>Búsquedas recientes</span>
          </div>
          <div class="m3-contained-list">
            ${recents.map(r => `
              <div class="m3-search-item m3-contained-item" data-search-term="${escapeSearchHtml(r)}" role="option" tabindex="0">
                <span class="material-icons m3-search-item-leading">history</span>
                <div class="m3-search-item-body">
                  <span class="m3-search-item-title">${escapeSearchHtml(r)}</span>
                </div>
                <button type="button" class="m3-search-item-action" data-remove-recent="${escapeSearchHtml(r)}" title="Quitar de recientes" aria-label="Quitar de recientes">
                  <span class="material-icons">close</span>
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      ` : '';

      const suggestedHtml = suggested.length > 0 ? `
        <div class="m3-fs-contained-section">
          <div class="m3-search-section-header">
            <span>${escapeSearchHtml(suggestedTitle)}</span>
          </div>
          <div class="${listClass}">
            ${suggested.map(item => renderItem(item)).join('')}
          </div>
        </div>
      ` : '';

      focusedContent.innerHTML = chipsHtml + recentsHtml + suggestedHtml;
    } else {
      const matches = (filterItems ? filterItems(items, qLower) : items).slice(0, maxResults);
      focusedContent.innerHTML = matches.length > 0 ? `
        <div class="m3-fs-contained-section">
          <div class="m3-search-section-header">
            <span>Resultados (${matches.length})</span>
          </div>
          <div class="${listClass}">
            ${matches.map(item => renderItem(item)).join('')}
          </div>
        </div>
      ` : `
        <div class="m3-fs-contained-section">
          <div class="m3-contained-list">
            <div class="m3-search-empty m3-contained-item">
              <span class="material-icons">search_off</span>
              <p style="margin: 0;">No se encontraron ${escapeSearchHtml(emptyLabel)} para «${escapeSearchHtml(q)}»</p>
            </div>
          </div>
        </div>
      `;
    }
  };

  const syncSearchInputs = (val) => {
    const cleanVal = val || '';
    searchInput.value = cleanVal;
    fsInput.value = cleanVal;
    searchClear.style.display = cleanVal ? 'inline-flex' : 'none';
    fsClearBtn.style.display = cleanVal ? 'inline-flex' : 'none';
  };

  const openFocusedSearch = () => {
    if (isSearchFocused) {
      renderFocusedContent(fsInput.value);
      return;
    }
    isSearchFocused = true;
    syncSearchInputs(getQuery?.() || '');
    fsOverlay.classList.add('open');
    document.body.style.overflow = 'hidden';
    renderFocusedContent(fsInput.value);
    setTimeout(() => {
      fsInput.focus();
      const len = fsInput.value.length;
      try { fsInput.setSelectionRange(len, len); } catch {}
    }, 30);
  };

  const closeFocusedSearch = () => {
    if (!isSearchFocused) return;
    isSearchFocused = false;
    fsOverlay.classList.remove('open');
    document.body.style.overflow = '';
    fsInput.blur();
  };

  const applySearchQuery = (val, shouldCloseView = false) => {
    const cleanVal = val || '';
    setQuery?.(cleanVal);
    syncSearchInputs(cleanVal);
    if (cleanVal.trim()) saveRecentSearch(cleanVal.trim());
    onApplySearch?.(cleanVal);
    if (shouldCloseView) {
      closeFocusedSearch();
    } else {
      renderFocusedContent(cleanVal);
    }
  };

  searchInput.addEventListener('click', (e) => {
    e.stopPropagation();
    openFocusedSearch();
  });
  searchInput.addEventListener('focus', () => {
    openFocusedSearch();
  });
  searchToggle.addEventListener('click', (e) => {
    e.stopPropagation();
    openFocusedSearch();
  });
  searchClear.addEventListener('click', (e) => {
    e.stopPropagation();
    applySearchQuery('', false);
  });

  fsBackBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    closeFocusedSearch();
  });

  fsClearBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setQuery?.('');
    syncSearchInputs('');
    onApplySearch?.('');
    renderFocusedContent('');
    fsInput.focus();
  });

  let searchTimeout;
  fsInput.addEventListener('input', (e) => {
    const val = e.target.value;
    syncSearchInputs(val);
    renderFocusedContent(val);
    clearTimeout(searchTimeout);
    setQuery?.(val);
    searchTimeout = setTimeout(() => {
      onApplySearch?.(val);
    }, 280);
  });

  fsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      applySearchQuery(fsInput.value, true);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeFocusedSearch();
    }
  });

  focusedContent.addEventListener('click', (e) => {
    e.stopPropagation();

    const removeBtn = e.target.closest('[data-remove-recent]');
    if (removeBtn) {
      removeRecentSearch(removeBtn.dataset.removeRecent);
      renderFocusedContent(fsInput.value);
      return;
    }

    const chipBtn = e.target.closest('[data-chip-type]');
    if (chipBtn) {
      const cType = chipBtn.dataset.chipType;
      const cVal = chipBtn.dataset.chipVal || '';
      if (cType === 'filter' && onFilterChip) {
        onFilterChip(cVal);
        closeFocusedSearch();
      } else {
        applySearchQuery(cVal, true);
      }
      return;
    }

    const recentRow = e.target.closest('[data-search-term]');
    if (recentRow) {
      applySearchQuery(recentRow.dataset.searchTerm, true);
      return;
    }

    if (itemSelector) {
      const itemEl = e.target.closest(itemSelector);
      if (itemEl && !e.target.closest('.ganado-btn-more') && !e.target.closest('.action-menu') && !e.target.closest('.btn-member-menu') && !e.target.closest('.member-menu-dropdown')) {
        const title = getItemTitle ? getItemTitle(itemEl) : '';
        if (title) saveRecentSearch(title);
        closeFocusedSearch();
        if (onItemClick) onItemClick(itemEl);
      }
    }
  });

  // Auto-clean overlay when navigating away
  const onNavCleanup = () => {
    if (isSearchFocused) closeFocusedSearch();
    fsOverlay.remove();
    window.removeEventListener('navigate', onNavCleanup);
  };
  window.addEventListener('navigate', onNavCleanup);

  return {
    refresh: () => {
      cachedItems = null;
      if (isSearchFocused) renderFocusedContent(fsInput.value, true);
    },
    close: closeFocusedSearch
  };
}
