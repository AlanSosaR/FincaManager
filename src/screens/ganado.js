import { supabase } from '../supabase.js';

export async function renderGanado() {
  const { data: animales, error } = await supabase
    .from('ganado')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('Error fetching ganado:', error);
    return `<div class="screen-ganado"><p>Error cargando datos: ${error.message}</p></div>`;
  }

  const totalAnimales = animales.length;
  const hembras = animales.filter(a => a.sexo && a.sexo.toLowerCase() === 'hembra').length;
  const machos  = animales.filter(a => a.sexo && a.sexo.toLowerCase() === 'macho').length;

  const todayStr = new Date().toISOString().split('T')[0];

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

  // "+X este mes" — count animals added in the current calendar month
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const thisMonth = animales.filter(a => a.created_at && a.created_at >= startOfMonth).length;
  const deltaText = thisMonth > 0 ? `+${thisMonth} este mes` : null;

  const hembrasRatio = totalAnimales ? Math.round((hembras / totalAnimales) * 100) : 0;
  const machosRatio  = totalAnimales ? Math.round((machos  / totalAnimales) * 100) : 0;

  return `
    <div class="screen-ganado" style="padding-bottom: 100px;">

      <!-- Page Title -->
      <div class="ganado-page-title">
        <h2>Ganado</h2>
        <div class="ganado-top-actions">
          <button class="ganado-icon-btn" title="Buscar">
            <span class="material-icons">search</span>
          </button>
          <button class="ganado-icon-btn" title="Notificaciones">
            <span class="material-icons">notifications_none</span>
          </button>
        </div>
      </div>

      <!-- Top Summary Cards — also act as filters -->
      <section class="ganado-top-cards">

        <!-- Total Animales — resets to all -->
        <div class="ganado-card ganado-card-primary ganado-card-filter active" data-filter="all" id="ganado-card-all" title="Ver todos">
          <div class="ganado-card-header">
            <span class="material-icons" style="font-size:28px; opacity:0.85;">pets</span>
            <span class="ganado-card-label">Total Animales</span>
          </div>
          <div class="ganado-card-body">
            <h3 class="ganado-card-value">${totalAnimales}</h3>
            ${deltaText ? `<p class="ganado-card-sub">${deltaText}</p>` : ''}
          </div>
        </div>

        <!-- Hembras -->
        <div class="ganado-card ganado-card-surface ganado-card-filter" data-filter="hembra" id="ganado-card-hembra" title="Filtrar hembras">
          <div class="ganado-card-header">
            <span class="material-icons" style="font-size:28px;">female</span>
            <span class="ganado-card-label">Hembras</span>
          </div>
          <div class="ganado-card-body">
            <h3 class="ganado-card-value">${hembras}</h3>
            <div class="progress-track">
              <div class="progress-fill female" style="width:${hembrasRatio}%"></div>
            </div>
          </div>
        </div>

        <!-- Machos -->
        <div class="ganado-card ganado-card-surface ganado-card-filter" data-filter="macho" id="ganado-card-macho" title="Filtrar machos">
          <div class="ganado-card-header">
            <span class="material-icons" style="font-size:28px;">male</span>
            <span class="ganado-card-label">Machos</span>
          </div>
          <div class="ganado-card-body">
            <h3 class="ganado-card-value">${machos}</h3>
            <div class="progress-track">
              <div class="progress-fill male" style="width:${machosRatio}%"></div>
            </div>
          </div>
        </div>
        <!-- Dynamic Task Cards -->
        ${setVacunas.size > 0 ? `
        <div class="ganado-card ganado-card-surface ganado-card-filter" data-filter="vacunas" id="ganado-card-vacunas" title="Filtrar vacunas pendientes" style="border-left: 4px solid #f57c00;">
          <div class="ganado-card-header">
            <span class="material-icons" style="font-size:28px; color: #f57c00;">vaccines</span>
            <span class="ganado-card-label" style="color: #f57c00; font-weight: bold;">Vacunas Pdtes.</span>
          </div>
          <div class="ganado-card-body">
            <h3 class="ganado-card-value">${setVacunas.size}</h3>
          </div>
        </div>
        ` : ''}

        ${setPesajes.size > 0 ? `
        <div class="ganado-card ganado-card-surface ganado-card-filter" data-filter="pesajes" id="ganado-card-pesajes" title="Filtrar pesajes pendientes" style="border-left: 4px solid #e65100;">
          <div class="ganado-card-header">
            <span class="material-icons" style="font-size:28px; color: #e65100;">monitor_weight</span>
            <span class="ganado-card-label" style="color: #e65100; font-weight: bold;">Pesajes Pdtes.</span>
          </div>
          <div class="ganado-card-body">
            <h3 class="ganado-card-value">${setPesajes.size}</h3>
          </div>
        </div>
        ` : ''}

        ${setFumigaciones.size > 0 ? `
        <div class="ganado-card ganado-card-surface ganado-card-filter" data-filter="fumigaciones" id="ganado-card-fumigaciones" title="Filtrar fumigaciones pendientes" style="border-left: 4px solid #01579b;">
          <div class="ganado-card-header">
            <span class="material-icons" style="font-size:28px; color: #01579b;">bug_report</span>
            <span class="ganado-card-label" style="color: #01579b; font-weight: bold;">Fumigación Pdtes.</span>
          </div>
          <div class="ganado-card-body">
            <h3 class="ganado-card-value">${setFumigaciones.size}</h3>
          </div>
        </div>
        ` : ''}
      </section>

      <!-- List header -->
      <div class="ganado-list-header">
        <h4>Entradas Recientes</h4>
        <span class="ganado-count-label" id="ganado-count-label">${totalAnimales} animales</span>
      </div>

      <div class="ganado-list" id="ganado-animal-list">
        ${animales.map(a => renderAnimalRow(a, setVacunas, setPesajes, setFumigaciones)).join('')}

        ${animales.length === 0 ? `
          <div class="ganado-empty">
            <span class="material-icons">pets</span>
            <p>No hay animales registrados.</p>
          </div>
        ` : ''}

        <button class="ganado-load-more">Cargar más registros</button>
      </div>

      <!-- Floating Action Button -->
      <button class="fab-premium" onclick="window.navigateTo('nuevo_animal')">
        <span class="material-icons">add</span>
        <span class="label">Registrar animal</span>
      </button>
    </div>
  `;
}

function renderAnimalRow(a, setVacunas, setPesajes, setFumigaciones) {
  const isFemale = a.sexo && a.sexo.toLowerCase() === 'hembra';

  const pendingVacuna = setVacunas.has(a.id);
  const pendingPesaje = setPesajes.has(a.id);
  const pendingFumigacion = setFumigaciones.has(a.id);
  const isPending = pendingVacuna || pendingPesaje || pendingFumigacion;

  let pendingIcon = 'check_circle';
  let badgeClass = 'green';
  if (pendingVacuna) {
    pendingIcon = 'vaccines';
    badgeClass = 'orange';
  } else if (pendingFumigacion) {
    pendingIcon = 'bug_report';
    badgeClass = 'orange';
  } else if (pendingPesaje) {
    pendingIcon = 'monitor_weight';
    badgeClass = 'orange';
  }

  // Use animal-themed dicebear avatar
  const seed = encodeURIComponent(a.id || a.nombre || 'animal');
  const imageUrl = a.image_url ||
    `https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=${seed}&backgroundColor=f0ebe3&radius=16`;

  // Short ID: first 3-4 chars if UUID-like, or use as-is if like #001
  const shortId = a.id && a.id.startsWith('#')
    ? a.id
    : `#${String(a.id).substring(0, 3).toUpperCase()}`;

  const razaLabel = a.raza || (isFemale ? 'Bovino Hembra' : 'Bovino Macho');
  const breedPrefix = razaLabel.toLowerCase().includes('jersey') ? 'Bovino Jersey'
    : razaLabel.toLowerCase().includes('holstein') ? 'Bovino Holstein'
    : razaLabel.toLowerCase().includes('angus')    ? 'Bovino Angus'
    : razaLabel.toLowerCase().includes('brahman')  ? 'Toro Brahman'
    : razaLabel;

  return `
    <div class="ganado-row" data-sexo="${(a.sexo || '').toLowerCase()}" data-vacunas="${pendingVacuna ? '1' : '0'}" data-pesajes="${pendingPesaje ? '1' : '0'}" data-fumigaciones="${pendingFumigacion ? '1' : '0'}" onclick="window.navigateTo('detalle_animal', '${a.id}')">
      <div class="ganado-row-img-container">
        <img src="${imageUrl}" alt="${a.nombre || 'Animal'}" onerror="this.src='https://api.dicebear.com/7.x/shapes/svg?seed=${seed}&backgroundColor=e8f5e9'">
        <div class="ganado-row-badge ${badgeClass}">
          <span class="material-icons">${pendingIcon}</span>
        </div>
      </div>

      <div class="ganado-row-content">
        <div class="ganado-col-group">
          <p class="ganado-col-label">${shortId} — ${breedPrefix.toUpperCase()}</p>
          <p class="ganado-col-value">${a.nombre || 'Sin nombre'}</p>
        </div>
        <div class="ganado-col-group" style="display: none;">
          <!-- Ocultamos la columna de peso en mobile si falta espacio, pero la dejamos por si la queremos -->
          <p class="ganado-col-label">Peso</p>
          <p class="ganado-col-value">${a.peso_actual ?? '—'} ${a.peso_unidad || 'kg'}</p>
        </div>
        <div class="ganado-col-group" style="margin-left: auto; display: flex; align-items: center; justify-content: flex-end; flex-shrink: 0;">
          <div class="action-menu-container">
            <button class="ganado-btn-more action-trigger" onclick="event.stopPropagation(); toggleActionMenu(this)" style="display: flex; align-items: center; justify-content: center; width: 40px; height: 40px; margin-right: -8px;">
              <span class="material-icons">more_vert</span>
            </button>
            <div class="action-menu" style="right: 0;">
              <button class="action-item" onclick="event.stopPropagation(); editAnimal('${a.id}')">
                <span class="material-icons">edit</span>
                <span>Editar</span>
              </button>
              <button class="action-item delete" onclick="event.stopPropagation(); confirmDeleteAnimal('${a.id}', '${a.nombre || 'este animal'}')">
                <span class="material-icons">delete</span>
                <span>Eliminar</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function initGanado() {
  // Toggle menu logic
  window.toggleActionMenu = (btn) => {
    document.querySelectorAll('.action-menu.active').forEach(m => {
      if (m !== btn.nextElementSibling) m.classList.remove('active');
    });
    const menu = btn.nextElementSibling;
    menu.classList.toggle('active');
  };

  // Close menus on click outside
  document.addEventListener('click', (e) => {
    if (!e.target.closest('.action-menu-container')) {
      document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    }
  });

  // Edit action
  window.editAnimal = (id) => {
    window.navigateTo('nuevo_animal', id);
  };

  // Delete action
  window.confirmDeleteAnimal = (id, name) => {
    window.Snackbar.confirm(
      `¿Eliminar a ${name}?`,
      async () => {
        const { error } = await supabase.from('ganado').delete().eq('id', id);
        if (error) {
          window.Snackbar.show('Error al eliminar: ' + error.message, { type: 'error' });
        } else {
          window.Snackbar.show('Animal eliminado correctamente');
          window.navigateTo('ganado');
        }
      },
      null,
      { confirmText: 'Eliminar', cancelText: 'No, esperar' }
    );
  };

  // ---- Card filter logic ----
  const cards      = document.querySelectorAll('.ganado-card-filter');
  const rows       = document.querySelectorAll('#ganado-animal-list .ganado-row');
  const countLabel = document.getElementById('ganado-count-label');

  function applyFilter(filter) {
    let visible = 0;
    rows.forEach(row => {
      let show = false;
      if (filter === 'all') {
        show = true;
      } else if (filter === 'hembra') {
        show = row.dataset.sexo === 'hembra';
      } else if (filter === 'macho') {
        show = row.dataset.sexo === 'macho';
      } else if (filter === 'vacunas') {
        show = row.dataset.vacunas === '1';
      } else if (filter === 'pesajes') {
        show = row.dataset.pesajes === '1';
      } else if (filter === 'fumigaciones') {
        show = row.dataset.fumigaciones === '1';
      }
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    if (countLabel) {
      let label = 'animales';
      if (filter === 'hembra') label = 'hembras';
      else if (filter === 'macho') label = 'machos';
      else if (filter === 'vacunas') label = 'con vacuna pdte.';
      else if (filter === 'pesajes') label = 'con pesaje pdte.';
      else if (filter === 'fumigaciones') label = 'con fumigación pdte.';

      countLabel.textContent = `${visible} ${label}`;
    }
  }

  cards.forEach(card => {
    card.style.cursor = 'pointer';
    card.addEventListener('click', () => {
      const filter = card.dataset.filter;
      const isAlreadyActive = card.classList.contains('active');

      // Deactivate all cards
      cards.forEach(c => c.classList.remove('active'));

      if (isAlreadyActive && filter !== 'all') {
        // Second click on same non-all card → reset to all
        document.getElementById('ganado-card-all')?.classList.add('active');
        applyFilter('all');
      } else {
        card.classList.add('active');
        applyFilter(filter);
      }
    });
  });

  const btnAdd = document.getElementById('btn-add-animal');
  if (btnAdd) {
    btnAdd.addEventListener('click', () => {
      window.navigateTo('nuevo_animal');
    });
  }
}
