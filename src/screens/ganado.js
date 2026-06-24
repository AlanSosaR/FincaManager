import { supabase } from '../supabase.js';
let currentGanadoPage = 1;
const PAGE_SIZE = 8;
let currentFilter = 'all';
let currentSearchQuery = '';
let totalGanadoCount = 0;

export async function renderGanado(page = 1, filter = 'all') {
  currentGanadoPage = page;
  currentFilter = filter || 'all';
  const from = (page - 1) * PAGE_SIZE;
  const to = page * PAGE_SIZE - 1;

  // We fetch counts for the summary cards
  const [
    { count: totalAnimales },
    { count: hembrasCount },
    { count: machosCount },
    { data: vendidos },
    { data: vacunasPendientes },
    { data: pesajesPendientes },
    { data: fumigacionesPendientes }
  ] = await Promise.all([
    supabase.from('ganado').select('*', { count: 'exact', head: true }).neq('estado', 'Vendido'),
    supabase.from('ganado').select('*', { count: 'exact', head: true }).ilike('sexo', 'hembra'),
    supabase.from('ganado').select('*', { count: 'exact', head: true }).ilike('sexo', 'macho'),
    supabase.from('ganado').select('id').eq('estado', 'Vendido'),
    supabase.from('animal_vacunas').select('animal_id').eq('estado', 'Programada'),
    supabase.from('animal_pesajes').select('animal_id').eq('estado', 'Programada'),
    supabase.from('animal_fumigaciones').select('animal_id').eq('estado', 'Programada')
  ]);
  const vendidosCount = (vendidos || []).length;

  const setVacunas = new Set((vacunasPendientes || []).map(v => v.animal_id));
  const setPesajes = new Set((pesajesPendientes || []).map(p => p.animal_id));
  const setFumigaciones = new Set((fumigacionesPendientes || []).map(f => f.animal_id));

  // Build the main query based on filter
  let query = supabase.from('ganado').select('*', { count: 'exact' });

  if (currentFilter === 'all') {
    query = query.neq('estado', 'Vendido');
  } else if (currentFilter === 'hembra') {
    query = query.ilike('sexo', 'hembra');
  } else if (currentFilter === 'macho') {
    query = query.ilike('sexo', 'macho');
  } else if (currentFilter === 'vacunas') {
    query = query.in('id', Array.from(setVacunas));
  } else if (currentFilter === 'pesajes') {
    query = query.in('id', Array.from(setPesajes));
  } else if (currentFilter === 'fumigaciones') {
    query = query.in('id', Array.from(setFumigaciones));
  } else if (currentFilter === 'vendido') {
    query = query.eq('estado', 'Vendido');
  }

  if (currentSearchQuery) {
    query = query.or(`nombre.ilike.%${currentSearchQuery}%,raza.ilike.%${currentSearchQuery}%`);
  }

  const { data: animales, count: filteredCount, error: fetchErr } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (fetchErr) {
    console.error('Error fetching ganado:', fetchErr);
    return `<div class="screen-ganado"><p>Error cargando datos: ${fetchErr.message}</p></div>`;
  }

  totalGanadoCount = filteredCount || 0;

  // Stats for cards
  const hembrasRatio = totalAnimales ? Math.round((hembrasCount / totalAnimales) * 100) : 0;
  const machosRatio  = totalAnimales ? Math.round((machosCount  / totalAnimales) * 100) : 0;

  return `
    <div class="screen-ganado" style="padding-bottom: 120px;">
      <div class="ganado-top-actions-container" style="display: flex; justify-content: flex-end; margin-bottom: 8px;">
        <div class="search-wrapper" id="ganado-search-wrapper" style="display: flex; align-items: center; background: ${currentSearchQuery ? '#2d3e2c' : 'transparent'}; border-radius: 40px; transition: all 0.3s; height: 48px;">
          <button id="ganado-search-toggle" class="m3-icon-btn-tonal" style="margin: 0; box-shadow: none; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center; background: ${currentSearchQuery ? 'transparent' : ''};" title="Buscar">
            <span class="material-icons" style="color: ${currentSearchQuery ? '#ffffff' : 'var(--primary-container)'};">search</span>
          </button>
          <input type="text" id="ganado-search-input" placeholder="Buscar animal..." value="${currentSearchQuery}" style="border: none; background: transparent; outline: none; font-size: 15px; width: ${currentSearchQuery ? '160px' : '0px'}; transition: width 0.3s; opacity: ${currentSearchQuery ? '1' : '0'}; padding: ${currentSearchQuery ? '0 8px 0 0' : '0'}; color: ${currentSearchQuery ? '#ffffff' : '#333'};">
          <button id="ganado-search-clear" style="background: none; border: none; cursor: pointer; display: ${currentSearchQuery ? 'flex' : 'none'}; align-items: center; justify-content: center; padding: 0 16px 0 8px; color: ${currentSearchQuery ? '#ffffff' : '#666'}; height: 100%;" title="Limpiar búsqueda">
            <span class="material-icons" style="font-size: 20px;">close</span>
          </button>
        </div>
      </div>
      <div class="ganado-page-title" style="margin-top: -10px; margin-bottom: 24px;">
        <h2>Ganado</h2>
      </div>

      <div class="da-tabs-section" style="margin-top: 16px;">
        <section class="ganado-top-cards">
          <div class="ganado-card ganado-card-primary ganado-card-filter ${currentFilter === 'all' ? 'active' : ''}" data-filter="all">
            <div class="ganado-card-header">
              <img src="/vaca.png" alt="Ganado" style="width: 28px; height: 28px; filter: grayscale(1) opacity(0.85);">
              <span class="ganado-card-label">Total Animales</span>
            </div>
            <div class="ganado-card-body">
              <h3 class="ganado-card-value">${totalAnimales}</h3>
            </div>
          </div>

          <div class="ganado-card ganado-card-surface ganado-card-filter ${currentFilter === 'hembra' ? 'active' : ''}" data-filter="hembra">
            <div class="ganado-card-header">
              <span class="material-icons" style="font-size:28px;">female</span>
              <span class="ganado-card-label">Hembras</span>
            </div>
            <div class="ganado-card-body">
              <h3 class="ganado-card-value">${hembrasCount}</h3>
              <div class="progress-track"><div class="progress-fill female" style="width:${hembrasRatio}%"></div></div>
            </div>
          </div>

          <div class="ganado-card ganado-card-surface ganado-card-filter ${currentFilter === 'macho' ? 'active' : ''}" data-filter="macho">
            <div class="ganado-card-header">
              <span class="material-icons" style="font-size:28px;">male</span>
              <span class="ganado-card-label">Machos</span>
            </div>
            <div class="ganado-card-body">
              <h3 class="ganado-card-value">${machosCount}</h3>
              <div class="progress-track"><div class="progress-fill male" style="width:${machosRatio}%"></div></div>
            </div>
          </div>

          ${setVacunas.size > 0 ? `
          <div class="ganado-card ganado-card-surface ganado-card-filter ${currentFilter === 'vacunas' ? 'active' : ''}" data-filter="vacunas" style="border-left: 4px solid #f57c00;">
            <div class="ganado-card-header">
              <span class="material-icons" style="font-size:28px; color: #f57c00;">vaccines</span>
              <span class="ganado-card-label" style="color: #f57c00;">Vacunas Pdtes.</span>
            </div>
            <div class="ganado-card-body"><h3 class="ganado-card-value">${setVacunas.size}</h3></div>
          </div>
          ` : ''}

          ${setPesajes.size > 0 ? `
          <div class="ganado-card ganado-card-surface ganado-card-filter ${currentFilter === 'pesajes' ? 'active' : ''}" data-filter="pesajes" style="border-left: 4px solid #e65100;">
            <div class="ganado-card-header">
              <span class="material-icons" style="font-size:28px; color: #e65100;">monitor_weight</span>
              <span class="ganado-card-label" style="color: #e65100;">Pesajes Pdtes.</span>
            </div>
            <div class="ganado-card-body"><h3 class="ganado-card-value">${setPesajes.size}</h3></div>
          </div>
          ` : ''}

          ${setFumigaciones.size > 0 ? `
          <div class="ganado-card ganado-card-surface ganado-card-filter ${currentFilter === 'fumigaciones' ? 'active' : ''}" data-filter="fumigaciones" style="border-left: 4px solid #2c666e;">
            <div class="ganado-card-header">
              <span class="material-icons" style="font-size:28px; color: #2c666e;">bug_report</span>
              <span class="ganado-card-label" style="color: #2c666e;">Fumigaciones Pdtes.</span>
            </div>
            <div class="ganado-card-body"><h3 class="ganado-card-value">${setFumigaciones.size}</h3></div>
          </div>
          ` : ''}

          ${vendidosCount > 0 ? `
          <div class="ganado-card ganado-card-surface ganado-card-filter ${currentFilter === 'vendido' ? 'active' : ''}" data-filter="vendido" style="border-left: 4px solid #d32f2f;">
            <div class="ganado-card-header">
              <span class="material-icons" style="font-size:28px; color: #d32f2f;">payments</span>
              <span class="ganado-card-label" style="color: #d32f2f;">Vendidos</span>
            </div>
            <div class="ganado-card-body"><h3 class="ganado-card-value">${vendidosCount}</h3></div>
          </div>
          ` : ''}
        </section>

        <div class="ganado-list-header" style="margin-top: 32px;">
          <h4>${currentFilter === 'all' ? 'Inventario Ganadero' : 'Resultados del Filtro'}</h4>
          <span class="ganado-count-label" id="ganado-count-label">${totalGanadoCount} ${currentFilter === 'all' ? 'animales registrados' : 'animales encontrados'}</span>
        </div>

        <div class="ganado-list" id="ganado-list-container">
          ${animales.map(a => renderAnimalRow(a, setVacunas, setPesajes, setFumigaciones)).join('')}
          ${animales.length === 0 ? '<div class="ganado-empty"><p>No se encontraron animales.</p></div>' : ''}
        </div>

        <div id="ganado-pagination-wrapper">
          ${getPaginationFooterHtml()}
        </div>
      </div>

      <button class="fab-premium" onclick="window.navigateTo('nuevo_animal')">
        <span class="material-icons">add</span>
        <span class="label">Registrar animal</span>
      </button>
    </div>
  `;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getPaginationFooterHtml() {
  const totalPages = Math.ceil(totalGanadoCount / PAGE_SIZE) || 1;
  
  let pagesHtml = '';
  // Show all pages for now since we expect few, or limit if many
  for (let i = 1; i <= totalPages; i++) {
    pagesHtml += `
      <button class="da-page-btn ${i === currentGanadoPage ? 'active' : ''}" onclick="window.changeGanadoPage(${i})">
        ${i}
      </button>
    `;
  }

  return `
    <div class="da-pagination-premium">
      <button class="da-pagination-circle-btn" id="ganado-prev-btn" ${currentGanadoPage <= 1 ? 'disabled' : ''} 
              onclick="if(currentGanadoPage > 1) window.changeGanadoPage(currentGanadoPage - 1)">
        <span class="material-icons">chevron_left</span>
      </button>
      
      <div class="da-pagination-pages">
        ${pagesHtml}
      </div>

      <button class="da-pagination-circle-btn" id="ganado-next-btn" ${currentGanadoPage >= totalPages ? 'disabled' : ''}
              onclick="if(currentGanadoPage < ${totalPages}) window.changeGanadoPage(currentGanadoPage + 1)">
        <span class="material-icons">chevron_right</span>
      </button>
    </div>
  `;
}

window.changeGanadoPage = async function(page) {
  currentGanadoPage = page;
  const from = (page - 1) * PAGE_SIZE;
  const to = page * PAGE_SIZE - 1;

  const listContainer = document.getElementById('ganado-list-container');
  const footerContainer = document.getElementById('ganado-pagination-wrapper');
  if (!listContainer) return;

  listContainer.innerHTML = `
    <div style="padding: 32px; text-align: center; color: #888;">
      <span class="material-icons rotating" style="font-size: 28px; color: var(--primary-container);">autorenew</span>
    </div>`;

  // We need to re-fetch the "pendientes" sets to render rows correctly
  const [
    { data: vacunasPendientes },
    { data: pesajesPendientes },
    { data: fumigacionesPendientes }
  ] = await Promise.all([
    supabase.from('animal_vacunas').select('animal_id').eq('estado', 'Programada'),
    supabase.from('animal_pesajes').select('animal_id').eq('estado', 'Programada'),
    supabase.from('animal_fumigaciones').select('animal_id').eq('estado', 'Programada')
  ]);

  const setVacunas = new Set((vacunasPendientes || []).map(v => v.animal_id));
  const setPesajes = new Set((pesajesPendientes || []).map(p => p.animal_id));
  const setFumigaciones = new Set((fumigacionesPendientes || []).map(f => f.animal_id));

  let query = supabase.from('ganado').select('*', { count: 'exact' });
  if (currentFilter === 'all') query = query.neq('estado', 'Vendido');
  else if (currentFilter === 'hembra') query = query.ilike('sexo', 'hembra');
  else if (currentFilter === 'macho') query = query.ilike('sexo', 'macho');
  else if (currentFilter === 'vacunas') query = query.in('id', Array.from(setVacunas));
  else if (currentFilter === 'pesajes') query = query.in('id', Array.from(setPesajes));
  else if (currentFilter === 'fumigaciones') query = query.in('id', Array.from(setFumigaciones));
  else if (currentFilter === 'vendido') query = query.eq('estado', 'Vendido');

  if (currentSearchQuery) {
    query = query.or(`nombre.ilike.%${currentSearchQuery}%,raza.ilike.%${currentSearchQuery}%`);
  }

  const { data: animales, count, error } = await query
    .order('created_at', { ascending: false })
    .range(from, to);

  if (error || !animales) {
    listContainer.innerHTML = `<div class="ganado-empty"><p>Error cargando datos.</p></div>`;
    return;
  }

  totalGanadoCount = count || 0;
  listContainer.innerHTML = animales.length === 0
    ? '<div class="ganado-empty"><p>No se encontraron animales.</p></div>'
    : animales.map(a => renderAnimalRow(a, setVacunas, setPesajes, setFumigaciones)).join('');

  if (footerContainer) footerContainer.innerHTML = getPaginationFooterHtml();
}


function renderAnimalRow(a, setVacunas, setPesajes, setFumigaciones) {
  const isSold = a.estado === 'Vendido';
  const pendingVacuna = setVacunas.has(a.id);
  const pendingPesaje = setPesajes.has(a.id);
  const pendingFumigacion = setFumigaciones.has(a.id);
  
  let pendingIcon = '';
  let badgeClass = '';
  if (isSold) { pendingIcon = 'payments'; badgeClass = 'sold'; }
  else if (pendingVacuna) { pendingIcon = 'vaccines'; badgeClass = 'orange'; }
  else if (pendingFumigacion) { pendingIcon = 'bug_report'; badgeClass = 'orange'; }
  else if (pendingPesaje) { pendingIcon = 'monitor_weight'; badgeClass = 'orange'; }

  const seed = encodeURIComponent(a.id || a.nombre || 'animal');
  const imageUrl = a.image_url || `https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=${seed}&backgroundColor=f0ebe3&radius=16`;
  const shortId = a.id && a.id.startsWith('#') ? a.id : `#${String(a.id).substring(0, 3).toUpperCase()}`;

  return `
    <div class="ganado-row ${isSold ? 'ganado-row-sold' : ''}" onclick="window.navigateTo('detalle_animal', '${a.id}')">
      <div class="ganado-row-img-container">
        <img src="${imageUrl}">
        ${pendingIcon ? `<div class="ganado-row-badge ${badgeClass}"><span class="material-icons">${pendingIcon}</span></div>` : ''}
      </div>
      <div class="ganado-row-content">
        <div class="ganado-col-group">
          <p class="ganado-col-label">${(a.raza || 'BOVINO').toUpperCase()}</p>
          <p class="ganado-col-value">${a.nombre || 'Sin nombre'}</p>
          ${isSold ? '<p class="ganado-col-sold-tag">Vendido</p>' : ''}
        </div>
        <div style="margin-left: auto; display: flex; align-items: center; gap: 16px; position: relative;">
          <div class="ganado-col-weight">
            <span class="ganado-col-weight-value">${a.peso_actual || 0}</span>
            <span class="ganado-col-weight-unit">${a.peso_unidad || 'kg'}</span>
          </div>
          ${!isSold ? `<button class="ganado-btn-more" onclick="event.stopPropagation(); window.toggleActionMenu(this)">
            <span class="material-icons">more_vert</span>
          </button>
          <div class="action-menu" style="background:#2d3e2c;">
            <button class="action-item" style="background:#2d3e2c;" onmouseover="this.style.background='#3a5240'" onmouseout="this.style.background='#2d3e2c'" onclick="event.stopPropagation(); window.navigateTo('nuevo_animal', '${a.id}')">
              <span class="material-icons">edit</span><span>Editar</span>
            </button>
            <button class="action-item" style="background:#2d3e2c;" onmouseover="this.style.background='#3a5240'" onmouseout="this.style.background='#2d3e2c'" onclick="event.stopPropagation(); window.navigateTo('detalle_animal', '${a.id}', 'vender')">
              <span class="material-icons">payments</span><span>Registrar venta</span>
            </button>
            <button class="action-item delete" style="background:#2d3e2c;" onmouseover="this.style.background='#f5b8a8'" onmouseout="this.style.background='#2d3e2c'" onclick="event.stopPropagation(); window.confirmDeleteAnimal('${a.id}', '${a.nombre}')">
              <span class="material-icons">delete</span><span>Eliminar</span>
            </button>
          </div>` : `
          <span class="ganado-sold-label">Vendido</span>`}
        </div>
      </div>
    </div>
  `;
}

export function initGanado() {

  // Action menus logic
  window.toggleActionMenu = (btn) => {
    const menu = btn.nextElementSibling;
    const row = btn.closest('.ganado-row');
    const isActive = menu.classList.contains('active');
    document.querySelectorAll('.action-menu.active').forEach(m => {
      m.classList.remove('active');
      const r = m.closest('.ganado-row');
      if (r) r.classList.remove('menu-open');
    });
    if (!isActive) {
      menu.classList.add('active');
      if (row) row.classList.add('menu-open');
    }
  };

  window.confirmDeleteAnimal = (id, name) => {
    window.Snackbar.confirm(`¿Eliminar a ${name}?`, async () => {
      const { error } = await supabase.from('ganado').delete().eq('id', id);
      if (error) window.Snackbar.show('Error: ' + error.message, { type: 'error' });
      else { window.Snackbar.show('Animal eliminado'); window.navigateTo('ganado'); }
    });
  };

  // Filter cards logic
  document.querySelectorAll('.ganado-card-filter').forEach(card => {
    card.addEventListener('click', () => {
      const filter = card.dataset.filter;
      window.navigateTo('ganado', 1, filter);
    });
  });

  // Search logic
  const searchToggle = document.getElementById('ganado-search-toggle');
  const searchWrapper = document.getElementById('ganado-search-wrapper');
  const searchInput = document.getElementById('ganado-search-input');
  const searchClear = document.getElementById('ganado-search-clear');

  if (searchToggle && searchInput && searchWrapper && searchClear) {
    searchToggle.addEventListener('click', () => {
      if (!searchInput.style.width || searchInput.style.width === '0px') {
        searchWrapper.style.background = '#2d3e2c';
        searchToggle.style.background = 'transparent';
        searchToggle.querySelector('.material-icons').style.color = '#ffffff';
        searchInput.style.width = '160px';
        searchInput.style.opacity = '1';
        searchInput.style.padding = '0 8px 0 0';
        searchInput.style.color = '#ffffff';
        searchClear.style.color = '#ffffff';
        searchClear.style.display = 'flex';
        searchInput.focus();
      }
    });

    searchClear.addEventListener('click', () => {
      currentSearchQuery = '';
      searchInput.value = '';
      searchWrapper.style.background = 'transparent';
      searchToggle.style.background = '';
      searchToggle.querySelector('.material-icons').style.color = '';
      searchInput.style.width = '0px';
      searchInput.style.opacity = '0';
      searchInput.style.padding = '0';
      searchInput.style.color = '';
      searchClear.style.color = '';
      searchClear.style.display = 'none';
      window.changeGanadoPage(1);
    });

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      currentSearchQuery = e.target.value;
      searchTimeout = setTimeout(() => {
        window.changeGanadoPage(1);
      }, 500);
    });
  }


  // Close menus when clicking outside
  const closeMenus = (e) => {
    if (!e.target.closest('.ganado-btn-more')) {
      document.querySelectorAll('.action-menu.active').forEach(m => {
        m.classList.remove('active');
        const r = m.closest('.ganado-row');
        if (r) r.classList.remove('menu-open');
      });
    }
  };
  window.removeEventListener('click', closeMenus);
  window.addEventListener('click', closeMenus);
}
