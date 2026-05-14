import { supabase } from '../supabase.js';
let currentGanadoPage = 1;
const PAGE_SIZE = 5;
let currentFilter = 'all';
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
    { data: vacunasPendientes },
    { data: pesajesPendientes },
    { data: fumigacionesPendientes }
  ] = await Promise.all([
    supabase.from('ganado').select('*', { count: 'exact', head: true }),
    supabase.from('ganado').select('*', { count: 'exact', head: true }).ilike('sexo', 'hembra'),
    supabase.from('ganado').select('*', { count: 'exact', head: true }).ilike('sexo', 'macho'),
    supabase.from('animal_vacunas').select('animal_id').eq('estado', 'Programada'),
    supabase.from('animal_pesajes').select('animal_id').eq('estado', 'Programada'),
    supabase.from('animal_fumigaciones').select('animal_id').eq('estado', 'Programada')
  ]);

  const setVacunas = new Set((vacunasPendientes || []).map(v => v.animal_id));
  const setPesajes = new Set((pesajesPendientes || []).map(p => p.animal_id));
  const setFumigaciones = new Set((fumigacionesPendientes || []).map(f => f.animal_id));

  // Build the main query based on filter
  let query = supabase.from('ganado').select('*', { count: 'exact' });

  if (currentFilter === 'hembra') {
    query = query.ilike('sexo', 'hembra');
  } else if (currentFilter === 'macho') {
    query = query.ilike('sexo', 'macho');
  } else if (currentFilter === 'vacunas') {
    query = query.in('id', Array.from(setVacunas));
  } else if (currentFilter === 'pesajes') {
    query = query.in('id', Array.from(setPesajes));
  } else if (currentFilter === 'fumigaciones') {
    query = query.in('id', Array.from(setFumigaciones));
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
    <div class="screen-ganado" style="padding-bottom: 100px;">
      <div class="ganado-page-title">
        <h2>Ganado</h2>
        <div class="ganado-top-actions">
          <button class="ganado-icon-btn" title="Buscar">
            <span class="material-icons">search</span>
          </button>
        </div>
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
          <div class="ganado-card ganado-card-surface ganado-card-filter ${currentFilter === 'fumigaciones' ? 'active' : ''}" data-filter="fumigaciones" style="border-left: 4px solid #0288d1;">
            <div class="ganado-card-header">
              <span class="material-icons" style="font-size:28px; color: #0288d1;">bug_report</span>
              <span class="ganado-card-label" style="color: #0288d1;">Fumigaciones Pdtes.</span>
            </div>
            <div class="ganado-card-body"><h3 class="ganado-card-value">${setFumigaciones.size}</h3></div>
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
      <span class="material-icons rotating" style="font-size: 28px; color: var(--primary);">autorenew</span>
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
  if (currentFilter === 'hembra') query = query.ilike('sexo', 'hembra');
  else if (currentFilter === 'macho') query = query.ilike('sexo', 'macho');
  else if (currentFilter === 'vacunas') query = query.in('id', Array.from(setVacunas));
  else if (currentFilter === 'pesajes') query = query.in('id', Array.from(setPesajes));
  else if (currentFilter === 'fumigaciones') query = query.in('id', Array.from(setFumigaciones));

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
  const pendingVacuna = setVacunas.has(a.id);
  const pendingPesaje = setPesajes.has(a.id);
  const pendingFumigacion = setFumigaciones.has(a.id);
  
  let pendingIcon = 'check_circle';
  let badgeClass = 'green';
  if (pendingVacuna) { pendingIcon = 'vaccines'; badgeClass = 'orange'; }
  else if (pendingFumigacion) { pendingIcon = 'bug_report'; badgeClass = 'orange'; }
  else if (pendingPesaje) { pendingIcon = 'monitor_weight'; badgeClass = 'orange'; }

  const seed = encodeURIComponent(a.id || a.nombre || 'animal');
  const imageUrl = a.image_url || `https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=${seed}&backgroundColor=f0ebe3&radius=16`;
  const shortId = a.id && a.id.startsWith('#') ? a.id : `#${String(a.id).substring(0, 3).toUpperCase()}`;

  return `
    <div class="ganado-row" onclick="window.navigateTo('detalle_animal', '${a.id}')">
      <div class="ganado-row-img-container">
        <img src="${imageUrl}">
        <div class="ganado-row-badge ${badgeClass}"><span class="material-icons">${pendingIcon}</span></div>
      </div>
      <div class="ganado-row-content">
        <div class="ganado-col-group">
          <p class="ganado-col-label">${(a.raza || 'BOVINO').toUpperCase()}</p>
          <p class="ganado-col-value">${a.nombre || 'Sin nombre'}</p>
        </div>
        <div style="margin-left: auto;">
          <button class="ganado-btn-more" onclick="event.stopPropagation(); window.toggleActionMenu(this)">
            <span class="material-icons">more_vert</span>
          </button>
          <div class="action-menu">
            <button class="action-item" onclick="event.stopPropagation(); window.navigateTo('nuevo_animal', '${a.id}')">
              <span class="material-icons">edit</span><span>Editar</span>
            </button>
            <button class="action-item delete" onclick="event.stopPropagation(); window.confirmDeleteAnimal('${a.id}', '${a.nombre}')">
              <span class="material-icons">delete</span><span>Eliminar</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function initGanado() {

  // Action menus logic
  window.toggleActionMenu = (btn) => {
    const menu = btn.nextElementSibling;
    const isActive = menu.classList.contains('active');
    document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    if (!isActive) menu.classList.add('active');
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


  // Close menus when clicking outside
  const closeMenus = (e) => {
    if (!e.target.closest('.ganado-btn-more')) {
      document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    }
  };
  window.removeEventListener('click', closeMenus);
  window.addEventListener('click', closeMenus);
}
