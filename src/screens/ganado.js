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

  // Count pending scale weigh-ins: animals with 0 pesajes or marked pendiente
  const pesajePendiente = animales.filter(a =>
    (a.total_pesajes !== undefined && a.total_pesajes === 0) ||
    (a.estado && a.estado.toLowerCase().includes('pesaje'))
  ).length;

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

        <!-- Pesaje Pendiente -->
        <div class="ganado-card ganado-card-tertiary ganado-card-filter" data-filter="pesaje" id="ganado-card-pesaje" title="Filtrar pesaje pendiente">
          <div class="ganado-card-header">
            <span class="material-icons" style="font-size:28px;">monitor_weight</span>
            <span class="ganado-card-label" style="opacity:0.75;">Pesaje Pendiente</span>
          </div>
          <div class="ganado-card-body">
            <h3 class="ganado-card-value">${pesajePendiente}</h3>
            <p class="ganado-card-sub ganado-card-action">Acción requerida</p>
          </div>
        </div>

      </section>

      <!-- List header -->
      <div class="ganado-list-header">
        <h4>Entradas Recientes</h4>
        <span class="ganado-count-label" id="ganado-count-label">${totalAnimales} animales</span>
      </div>

      <div class="ganado-list" id="ganado-animal-list">
        ${animales.map(a => renderAnimalRow(a)).join('')}

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

function renderAnimalRow(a) {
  const isFemale = a.sexo && a.sexo.toLowerCase() === 'hembra';

  // Determine status deterministically: if total_pesajes === 0 → pending
  const isPending = (a.total_pesajes !== undefined && a.total_pesajes === 0) ||
                    (a.estado && a.estado.toLowerCase().includes('pendiente'));

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
    <div class="ganado-row" data-sexo="${(a.sexo || '').toLowerCase()}" data-pending="${isPending ? '1' : '0'}" onclick="window.navigateTo('detalle_animal', '${a.id}')">
      <div class="ganado-row-img-container">
        <img src="${imageUrl}" alt="${a.nombre || 'Animal'}" onerror="this.src='https://api.dicebear.com/7.x/shapes/svg?seed=${seed}&backgroundColor=e8f5e9'">
        <div class="ganado-row-badge ${isPending ? 'orange' : 'green'}">
          <span class="material-icons">${isPending ? 'priority_high' : 'vaccines'}</span>
        </div>
      </div>

      <div class="ganado-row-content">
        <div class="ganado-col-group">
          <p class="ganado-col-label">${shortId} — ${(a.nombre || 'Sin nombre').toUpperCase()}</p>
          <p class="ganado-col-value">${breedPrefix}</p>
        </div>
        <div class="ganado-col-group">
          <p class="ganado-col-label">Peso</p>
          <p class="ganado-col-value">${a.peso_actual ?? '—'} ${a.peso_unidad || 'kg'}</p>
        </div>
        <div class="ganado-col-group ganado-row-status">
          <p class="ganado-col-label">Estado</p>
          <div class="ganado-pill ${isPending ? 'pending' : 'ok'}">
            <span class="material-icons">${isPending ? 'scale' : 'vaccines'}</span>
            <span>${isPending ? 'Pendiente' : 'Al día'}</span>
          </div>
        </div>
        <div class="ganado-col-group" style="text-align:right; min-width:40px;">
          <div class="action-menu-container">
            <button class="ganado-btn-more action-trigger" onclick="event.stopPropagation(); toggleActionMenu(this)">
              <span class="material-icons">more_vert</span>
            </button>
            <div class="action-menu">
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
      } else if (filter === 'pesaje') {
        show = row.dataset.pending === '1';
      }
      row.style.display = show ? '' : 'none';
      if (show) visible++;
    });

    if (countLabel) {
      const label = filter === 'all'    ? 'animales'
        : filter === 'hembra' ? 'hembras'
        : filter === 'macho'  ? 'machos'
        : 'pendientes';
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
