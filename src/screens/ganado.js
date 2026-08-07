import { supabase } from '../supabase.js';
import { restFetch } from '../auth.js';
import { getPaginationFooterHtml } from '../pagination.js';
let currentGanadoPage = 1;
const PAGE_SIZE = 8;
let currentFilter = 'all';
let currentSearchQuery = '';
let totalGanadoCount = 0;

function getLocalToday() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

async function fetchLatestPesajes(animalIds) {
  if (!animalIds.length) return new Map();
  const ids = animalIds.map(id => encodeURIComponent(id)).join(',');
  const data = await restFetch(`/rest/v1/animal_pesajes?animal_id=in.(${ids})&order=fecha.desc&select=animal_id,peso,fecha`).catch(() => []);
  const map = new Map();
  for (const row of data || []) {
    if (!map.has(row.animal_id)) {
      map.set(row.animal_id, { latest: row, previous: null });
    } else if (map.get(row.animal_id).previous === null) {
      map.get(row.animal_id).previous = row;
    }
  }
  return map;
}

export async function renderGanado(page = 1, filter = 'all') {
  currentGanadoPage = page;
  currentFilter = filter || 'all';
  const from = (page - 1) * PAGE_SIZE;
  const to = page * PAGE_SIZE - 1;

  // We fetch counts for the summary cards using fast head:true queries
  const [
    { count: totalAnimales },
    { count: hembrasCount },
    { count: machosCount },
    { count: vendidosCount },
    { count: vacunasCount },
    { count: pesajesCount },
    fumigaciones,
    { count: preñadasCount }
  ] = await Promise.all([
    supabase.from('ganado').select('*', { count: 'exact', head: true }).neq('estado', 'Vendido'),
    supabase.from('ganado').select('*', { count: 'exact', head: true }).ilike('sexo', 'hembra'),
    supabase.from('ganado').select('*', { count: 'exact', head: true }).ilike('sexo', 'macho'),
    supabase.from('ganado').select('*', { count: 'exact', head: true }).eq('estado', 'Vendido'),
    supabase.from('animal_vacunas').select('*', { count: 'exact', head: true }).eq('estado', 'Programada'),
    supabase.from('animal_pesajes').select('*', { count: 'exact', head: true }).eq('estado', 'Programada'),
    supabase.from('animal_fumigaciones').select('fecha,producto,estado').range(0, 4999),
    supabase.from('ganado').select('*', { count: 'exact', head: true }).eq('reproductivo', 'Preñada')
  ]);

  const fumigGroups = new Map();
  const fumigPendGroups = new Map();
  for (const f of (fumigaciones.data || [])) {
    const key = `${f.fecha || ''}\u0000${f.producto || ''}`;
    fumigGroups.set(key, true);
    if (f.estado === 'Programada') fumigPendGroups.set(key, true);
  }
  const vecesFumigadas = fumigGroups.size;
  const fumigPendGroupCount = fumigPendGroups.size;

  let activeFilterIds = [];
  if (currentFilter === 'vacunas') {
    const { data } = await supabase.from('animal_vacunas').select('animal_id').eq('estado', 'Programada');
    activeFilterIds = (data || []).map(v => v.animal_id);
  } else if (currentFilter === 'pesajes') {
    const { data } = await supabase.from('animal_pesajes').select('animal_id').eq('estado', 'Programada');
    activeFilterIds = (data || []).map(p => p.animal_id);
  } else if (currentFilter === 'fumigaciones') {
    const { data } = await supabase.from('animal_fumigaciones').select('animal_id').eq('estado', 'Programada');
    activeFilterIds = (data || []).map(f => f.animal_id);
  }

  // Build the main query based on filter
  let query = supabase.from('ganado').select('*', { count: 'exact' });

  if (currentFilter === 'all') {
    query = query.neq('estado', 'Vendido');
  } else if (currentFilter === 'hembra') {
    query = query.ilike('sexo', 'hembra');
  } else if (currentFilter === 'macho') {
    query = query.ilike('sexo', 'macho');
  } else if (currentFilter === 'vacunas' || currentFilter === 'pesajes' || currentFilter === 'fumigaciones') {
    query = query.in('id', activeFilterIds.length ? activeFilterIds : ['00000000-0000-0000-0000-000000000000']);
  } else if (currentFilter === 'preñadas') {
    query = query.eq('reproductivo', 'Preñada');
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

  const visibleAnimalIds = (animales || []).map(a => a.id);
  const [visVacunas, visPesajes, visFumigaciones] = await Promise.all([
    visibleAnimalIds.length ? supabase.from('animal_vacunas').select('animal_id').eq('estado', 'Programada').in('animal_id', visibleAnimalIds) : Promise.resolve({ data: [] }),
    visibleAnimalIds.length ? supabase.from('animal_pesajes').select('animal_id').eq('estado', 'Programada').in('animal_id', visibleAnimalIds) : Promise.resolve({ data: [] }),
    visibleAnimalIds.length ? supabase.from('animal_fumigaciones').select('animal_id').eq('estado', 'Programada').in('animal_id', visibleAnimalIds) : Promise.resolve({ data: [] })
  ]);

  const setVacunas = new Set((visVacunas.data || []).map(v => v.animal_id));
  const setPesajes = new Set((visPesajes.data || []).map(p => p.animal_id));
  const setFumigaciones = new Set((visFumigaciones.data || []).map(f => f.animal_id));

  const pesajesMap = await fetchLatestPesajes(visibleAnimalIds);

  // Stats for cards
  const hembrasRatio = totalAnimales ? Math.round((hembrasCount / totalAnimales) * 100) : 0;
  const machosRatio  = totalAnimales ? Math.round((machosCount  / totalAnimales) * 100) : 0;

  return `
    <div class="screen-ganado" style="padding-bottom: 120px;">
      <div class="ganado-top-actions-container" style="display: flex; justify-content: flex-end; margin-bottom: 8px;">
        <div class="search-wrapper" id="ganado-search-wrapper" style="display: flex; align-items: center; background: ${currentSearchQuery ? '#2d3e2c' : 'transparent'}; border-radius: 12px; transition: all 0.3s; height: 48px;">
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

          ${vacunasCount > 0 ? `
          <div class="ganado-card ganado-card-surface ganado-card-filter ${currentFilter === 'vacunas' ? 'active' : ''}" data-filter="vacunas" style="border-left: 4px solid #f57c00;">
            <div class="ganado-card-header">
              <span class="material-icons" style="font-size:28px; color: #f57c00;">vaccines</span>
              <span class="ganado-card-label" style="color: #f57c00;">Vacunas Pdtes.</span>
            </div>
            <div class="ganado-card-body"><h3 class="ganado-card-value">${vacunasCount}</h3></div>
          </div>
          ` : ''}

          ${pesajesCount > 0 ? `
          <div class="ganado-card ganado-card-surface ganado-card-filter ${currentFilter === 'pesajes' ? 'active' : ''}" data-filter="pesajes" style="border-left: 4px solid #e65100;">
            <div class="ganado-card-header">
              <span class="material-icons" style="font-size:28px; color: #e65100;">monitor_weight</span>
              <span class="ganado-card-label" style="color: #e65100;">Pesajes Pdtes.</span>
            </div>
            <div class="ganado-card-body"><h3 class="ganado-card-value">${pesajesCount}</h3></div>
          </div>
          ` : ''}

          <div class="ganado-card ganado-card-surface ganado-card-filter ganado-card-fumig ${currentFilter === 'fumigaciones' ? 'active' : ''}" data-filter="fumigaciones" id="ganado-fumig-card" style="border-left: 4px solid #2c666e; cursor: pointer;">
            <div class="ganado-card-header">
              <span class="material-icons" style="font-size:28px; color: #2c666e;">bug_report</span>
              <span class="ganado-card-label" style="color: #2c666e;">Fumigación</span>
            </div>
            <div class="ganado-card-body">
              <h3 class="ganado-card-value" id="fumig-veces-value">${vecesFumigadas}</h3>
              <span class="ganado-card-hint" style="display:flex; align-items:center; gap:6px; color:#2c666e; font-size:12px; font-weight:500; margin-top:4px; flex-wrap:wrap;">
                <span id="fumig-pend-chip" class="fumig-count-chip" style="background:#fff3e0; color:#e65100; border-radius:999px; padding:2px 8px; font-weight:700; display:inline-flex; align-items:center; gap:3px;">
                  <span class="material-icons" style="font-size:13px;">schedule</span> ${fumigPendGroupCount} pend.
                </span>
                <span class="ganado-card-title" style="font-size:11px; color:#777;">veces fumigadas</span>
                <span class="material-icons" style="font-size:15px;">expand_more</span>
              </span>
            </div>
          </div>

          ${preñadasCount > 0 ? `
          <div class="ganado-card ganado-card-surface ganado-card-filter ${currentFilter === 'preñadas' ? 'active' : ''}" data-filter="preñadas" style="border-left: 4px solid #b26a00;">
            <div class="ganado-card-header">
              <img src="/cow.png" alt="Preñadas" style="width:26px; height:26px; object-fit:contain;">
              <span class="ganado-card-label" style="color: #b26a00;">Preñadas</span>
            </div>
            <div class="ganado-card-body"><h3 class="ganado-card-value">${preñadasCount}</h3></div>
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

        <div class="ganado-fumig-panel" id="ganado-fumig-panel" style="display: none; margin-top: 20px;">
          <div style="background: var(--surface-container-low, #fff); border-radius: 16px; padding: 20px; border: 1px solid rgba(44,102,110,0.25); box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
              <span class="material-icons" style="font-size:22px; color:#2c666e;">bug_report</span>
              <h4 style="margin:0; color:var(--on-surface,#222); font-size:17px; flex:1;">Fumigación masiva</h4>
              <button type="button" id="ganado-fumig-close" class="m3-icon-btn" title="Cerrar" style="background:none; border:none; cursor:pointer; color:#666; display:flex; align-items:center; justify-content:center; padding:4px;">
                <span class="material-icons" style="font-size:22px;">close</span>
              </button>
            </div>
            <p style="margin:0 0 16px; font-size:13px; color:#666; line-height:1.5;">
              Aplica la fumigación a <strong id="ganado-fumig-target-count">${totalAnimales}</strong> animales activos con la misma fecha.
            </p>
            <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:flex-end;">
              <div class="m3-field" style="min-width:180px; flex:1 1 200px;">
                <input type="date" id="ganado-fumig-fecha" value="${getLocalToday()}" placeholder=" " required>
                <label>Fecha</label>
              </div>
              <div class="m3-field" style="flex:1 1 220px;">
                <input type="text" id="ganado-fumig-producto" placeholder=" " required>
                <label>Producto</label>
              </div>
            </div>
            <div style="display:flex; gap:10px; margin-top:18px; justify-content:flex-end;">
              <button type="button" class="btn-m3-tonal" id="ganado-fumig-cancel">Cancelar</button>
              <button type="button" class="btn-m3-fill" id="ganado-fumig-apply" style="background:#2c666e; color:#fff;">Aplicar a todos</button>
            </div>
          </div>

          <div style="margin-top:20px;">
            <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
              <span class="material-icons" style="font-size:18px; color:#2c666e;">list_alt</span>
              <h4 style="margin:0; color:var(--on-surface,#222); font-size:15px; flex:1;">Registros de fumigación</h4>
              <button type="button" id="ganado-fumig-refresh" class="m3-icon-btn" title="Actualizar" style="background:none; border:none; cursor:pointer; color:#2c666e; display:flex; align-items:center; justify-content:center; padding:4px;">
                <span class="material-icons" style="font-size:20px;">refresh</span>
              </button>
            </div>
            <div id="ganado-fumig-records" style="max-height: 320px; overflow-y: auto;">
              <p style="color:#999; font-size:13px; text-align:center; padding:12px 0;">Cargando...</p>
            </div>
          </div>
        </div>

        <div class="ganado-list-header" style="margin-top: 32px;">
          <h4>${currentFilter === 'all' ? 'Inventario Ganadero' : 'Resultados del Filtro'}</h4>
          <span class="ganado-count-label" id="ganado-count-label">${totalGanadoCount} ${currentFilter === 'all' ? 'animales registrados' : 'animales encontrados'}</span>
        </div>

        <div class="ganado-list" id="ganado-list-container">
          ${animales.map(a => renderAnimalRow(a, setVacunas, setPesajes, setFumigaciones, pesajesMap)).join('')}
          ${animales.length === 0 ? '<div class="ganado-empty"><p>No se encontraron animales.</p></div>' : ''}
        </div>

        <div id="ganado-pagination-wrapper">
          ${paginationFooterHtml()}
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

function paginationFooterHtml() {
  const totalPages = Math.ceil(totalGanadoCount / PAGE_SIZE) || 1;
  return getPaginationFooterHtml({
    currentPage: currentGanadoPage,
    totalPages,
    prevId: 'ganado-prev-btn',
    nextId: 'ganado-next-btn',
    changeFn: 'changeGanadoPage'
  });
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

  let activeFilterIds = [];
  if (currentFilter === 'vacunas') {
    const { data } = await supabase.from('animal_vacunas').select('animal_id').eq('estado', 'Programada');
    activeFilterIds = (data || []).map(v => v.animal_id);
  } else if (currentFilter === 'pesajes') {
    const { data } = await supabase.from('animal_pesajes').select('animal_id').eq('estado', 'Programada');
    activeFilterIds = (data || []).map(p => p.animal_id);
  } else if (currentFilter === 'fumigaciones') {
    const { data } = await supabase.from('animal_fumigaciones').select('animal_id').eq('estado', 'Programada');
    activeFilterIds = (data || []).map(f => f.animal_id);
  }

  let query = supabase.from('ganado').select('*', { count: 'exact' });
  if (currentFilter === 'all') query = query.neq('estado', 'Vendido');
  else if (currentFilter === 'hembra') query = query.ilike('sexo', 'hembra');
  else if (currentFilter === 'macho') query = query.ilike('sexo', 'macho');
  else if (currentFilter === 'vacunas' || currentFilter === 'pesajes' || currentFilter === 'fumigaciones') {
    query = query.in('id', activeFilterIds.length ? activeFilterIds : ['00000000-0000-0000-0000-000000000000']);
  }
  else if (currentFilter === 'preñadas') query = query.eq('reproductivo', 'Preñada');
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

  const visibleAnimalIds = (animales || []).map(a => a.id);
  const [visVacunas, visPesajes, visFumigaciones] = await Promise.all([
    visibleAnimalIds.length ? supabase.from('animal_vacunas').select('animal_id').eq('estado', 'Programada').in('animal_id', visibleAnimalIds) : Promise.resolve({ data: [] }),
    visibleAnimalIds.length ? supabase.from('animal_pesajes').select('animal_id').eq('estado', 'Programada').in('animal_id', visibleAnimalIds) : Promise.resolve({ data: [] }),
    visibleAnimalIds.length ? supabase.from('animal_fumigaciones').select('animal_id').eq('estado', 'Programada').in('animal_id', visibleAnimalIds) : Promise.resolve({ data: [] })
  ]);

  const setVacunas = new Set((visVacunas.data || []).map(v => v.animal_id));
  const setPesajes = new Set((visPesajes.data || []).map(p => p.animal_id));
  const setFumigaciones = new Set((visFumigaciones.data || []).map(f => f.animal_id));

  const pesajesMap = await fetchLatestPesajes(visibleAnimalIds);

  listContainer.innerHTML = animales.length === 0
    ? '<div class="ganado-empty"><p>No se encontraron animales.</p></div>'
    : animales.map(a => renderAnimalRow(a, setVacunas, setPesajes, setFumigaciones, pesajesMap)).join('');

  if (footerContainer) footerContainer.innerHTML = paginationFooterHtml();
}


function renderAnimalRow(a, setVacunas, setPesajes, setFumigaciones, pesajesMap = new Map()) {
  const isSold = a.estado === 'Vendido';
  const isPreñada = a.sexo === 'Hembra' && a.reproductivo === 'Preñada';
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

  // Pesaje trend info
  const pesajeData = pesajesMap.get(a.id);
  let daysHtml = '';
  let trendHtml = '';
  if (pesajeData && pesajeData.latest) {
    const latestPeso = parseFloat(pesajeData.latest.peso);
    const prevPeso = pesajeData.previous ? parseFloat(pesajeData.previous.peso) : null;
    const lastDate = new Date(pesajeData.latest.fecha + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((today - lastDate) / (1000 * 60 * 60 * 24));

    let daysText = '';
    if (diffDays === 0) daysText = 'hoy';
    else if (diffDays === 1) daysText = 'ayer';
    else daysText = `hace ${diffDays} días`;

    daysHtml = `<p class="ganado-days-line">${daysText}</p>`;

    if (!isNaN(latestPeso)) {
      let arrow = '→';
      let arrowClass = 'same';
      let changeText = '±0';
      if (prevPeso !== null && !isNaN(prevPeso)) {
        const change = latestPeso - prevPeso;
        if (change > 0) {
          arrow = '↑';
          arrowClass = 'up';
          changeText = `+${change.toFixed(1)}`;
        } else if (change < 0) {
          arrow = '↓';
          arrowClass = 'down';
          changeText = `${change.toFixed(1)}`;
        }
      }
      trendHtml = `<span class="ganado-trend-body"><span class="ganado-trend-arrow ${arrowClass}">${arrow}</span> <span class="ganado-trend-change ${arrowClass}">${changeText} kg</span></span>`;
    }
  }

  const pesoActual = pesajeData?.latest?.peso ?? a.peso_actual ?? 0;
  const trendInfo = trendHtml ? `<div class="ganado-trend-info">${trendHtml}</div>` : '';

  return `
    <div class="ganado-row ${isSold ? 'ganado-row-sold' : ''}" onclick="window.navigateTo('detalle_animal', '${a.id}')">
      <div class="ganado-row-img-container">
        <img src="${imageUrl}">
        ${pendingIcon ? `<div class="ganado-row-badge ${badgeClass}"><span class="material-icons">${pendingIcon}</span></div>` : ''}
      </div>
      <div class="ganado-row-content">
        <div class="ganado-col-group">
          <p class="ganado-col-label"><span class="material-icons ganado-sex-icon ${a.sexo === 'Macho' ? 'macho' : 'hembra'}">${a.sexo === 'Macho' ? 'male' : 'female'}</span> ${(a.raza || 'BOVINO').toUpperCase()}</p>
          <p class="ganado-col-value">${a.nombre || 'Sin nombre'}</p>
          ${daysHtml}
          ${isSold ? '<p class="ganado-col-sold-tag">Vendido</p>' : ''}
          ${isPreñada ? '<p class="ganado-col-prenada-tag"><img src="/cow.png" style="width:14px; height:14px; object-fit:contain;"> Preñada</p>' : ''}
        </div>
        <div style="margin-left: auto; display: flex; align-items: center; gap: 16px; position: relative;">
          <div style="display: flex; flex-direction: column; align-items: flex-end;">
            <div class="ganado-col-weight">
              <span class="ganado-col-weight-value">${pesoActual}</span>
              <span class="ganado-col-weight-unit">${a.peso_unidad || 'kg'}</span>
            </div>
            ${trendInfo}
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
      if (card.id === 'ganado-fumig-card') {
        const panel = document.getElementById('ganado-fumig-panel');
        if (panel) {
          const isOpen = panel.style.display === 'block';
          panel.style.display = isOpen ? 'none' : 'block';
          if (!isOpen) {
            if (fumigFecha && !fumigFecha.value) fumigFecha.value = getLocalToday();
            if (typeof loadFumigRecords === 'function') loadFumigRecords();
          }
        }
        return;
      }
      const filter = card.dataset.filter;
      window.navigateTo('ganado', 1, filter);
    });
  });

  // Fumigación masiva panel
  const fumigPanel = document.getElementById('ganado-fumig-panel');
  const fumigFecha = document.getElementById('ganado-fumig-fecha');
  const fumigProducto = document.getElementById('ganado-fumig-producto');
  const targetCount = document.getElementById('ganado-fumig-target-count');
  const applyBtn = document.getElementById('ganado-fumig-apply');
  const cancelBtn = document.getElementById('ganado-fumig-cancel');
  const closeBtn = document.getElementById('ganado-fumig-close');

  const closeFumigPanel = () => {
    if (fumigPanel) fumigPanel.style.display = 'none';
  };
  const openFumigPanel = () => {
    if (fumigPanel) fumigPanel.style.display = 'block';
    if (fumigFecha && !fumigFecha.value) fumigFecha.value = getLocalToday();
  };

  const loadFumigRecords = async () => {
    const recordsBox = document.getElementById('ganado-fumig-records');
    if (!recordsBox) return;
    try {
      recordsBox.innerHTML = '<p style="color:#999; font-size:13px; text-align:center; padding:12px 0;">Cargando...</p>';
      const { data: recs, error } = await supabase.from('animal_fumigaciones')
        .select('producto,fecha,estado,animal_id').order('fecha', { ascending: false }).range(0, 499);
      if (error) throw error;
      const list = recs || [];
      if (!list.length) {
        recordsBox.innerHTML = '<p style="color:#999; font-size:13px; text-align:center; padding:12px 0;">Sin registros de fumigación.</p>';
        return;
      }
      const groups = [];
      const groupMap = new Map();
      for (const r of list) {
        const key = `${r.producto || ''}\u0000${r.fecha || ''}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, { producto: r.producto || '', fecha: r.fecha || '', count: 0, estado: r.estado });
          groups.push(groupMap.get(key));
        }
        groupMap.get(key).count++;
      }

      recordsBox.innerHTML = groups.map(g => {
        const isAplicada = g.estado === 'Aplicada';
        const badgeColor = isAplicada ? '#2c666e' : '#e65100';
        const badgeBg = isAplicada ? '#e0f2f1' : '#fff3e0';
        const prodAttr = encodeURIComponent(g.producto);
        const fechaAttr = encodeURIComponent(g.fecha);
        return `
          <div class="ganado-fumig-row" style="display:flex; align-items:center; gap:10px; padding:10px 8px; border-bottom:1px solid rgba(0,0,0,0.06); flex-wrap:wrap;">
            <span class="material-icons" style="font-size:20px; color:${badgeColor};">${isAplicada ? 'check_circle' : 'schedule'}</span>
            <div style="flex:1; min-width:140px;">
              <div style="font-size:14px; font-weight:600; color:var(--on-surface,#222);">${g.producto || '—'}</div>
              <div style="font-size:12px; color:#777;">${g.fecha || '—'} · <strong>${g.count}</strong> ${g.count === 1 ? 'animal' : 'animales'}</div>
            </div>
            <span style="background:${badgeBg}; color:${badgeColor}; border-radius:999px; padding:2px 8px; font-size:11px; font-weight:700;">${g.estado || '—'}</span>
            <div style="display:flex; gap:4px;">
              <button class="fumig-edit-btn" data-producto="${prodAttr}" data-fecha="${fechaAttr}" title="Editar" style="background:none; border:none; cursor:pointer; color:#2c666e; display:flex; align-items:center; padding:4px;">
                <span class="material-icons" style="font-size:18px;">edit</span>
              </button>
              <button class="fumig-del-btn" data-producto="${prodAttr}" data-fecha="${fechaAttr}" title="Eliminar" style="background:none; border:none; cursor:pointer; color:#d32f2f; display:flex; align-items:center; padding:4px;">
                <span class="material-icons" style="font-size:18px;">delete</span>
              </button>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      recordsBox.innerHTML = `<p style="color:#c62828; font-size:13px; text-align:center; padding:12px 0;">Error: ${err.message || err}</p>`;
    }
  };

  const renderFumigEditForm = (producto, fecha, rowEl) => {
    rowEl.innerHTML = `
      <div class="m3-field" style="min-width:140px; flex:1 1 160px;">
        <input type="text" id="fumig-edit-producto" value="${(producto || '').replace(/"/g, '&quot;')}" placeholder=" " required>
        <label>Producto</label>
      </div>
      <div class="m3-field" style="min-width:150px; flex:1 1 160px;">
        <input type="date" id="fumig-edit-fecha" value="${fecha || ''}" placeholder=" " required>
        <label>Fecha</label>
      </div>
      <div style="display:flex; gap:6px;">
        <button type="button" class="fumig-save-btn btn-m3-fill" style="background:#2c666e; color:#fff; padding:8px 14px; font-size:13px;">Guardar</button>
        <button type="button" class="fumig-cancel-btn btn-m3-text" style="padding:8px 12px; font-size:13px;">Cancelar</button>
      </div>`;
    rowEl.style.width = '100%';
    rowEl.style.flexWrap = 'wrap';
    const saveBtn = rowEl.querySelector('.fumig-save-btn');
    const cancelBtnEdit = rowEl.querySelector('.fumig-cancel-btn');
    const doSave = async () => {
      const prod = document.getElementById('fumig-edit-producto').value.trim();
      const fechaEdit = document.getElementById('fumig-edit-fecha').value;
      if (!prod) { window.Snackbar.show('Indicá el producto', { type: 'error' }); return; }
      if (!fechaEdit) { window.Snackbar.show('Indicá la fecha', { type: 'error' }); return; }
      const estado = fechaEdit <= getLocalToday() ? 'Aplicada' : 'Programada';
      let base = `/rest/v1/animal_fumigaciones?producto=eq.${encodeURIComponent(producto)}&fecha=eq.${encodeURIComponent(fecha)}`;
      if (window._currentEmpresaId) base += `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`;
      try {
        await restFetch(base, {
          method: 'PATCH',
          body: JSON.stringify({ producto: prod, fecha: fechaEdit, estado })
        });
        window.Snackbar.show('Fumigación actualizada ✓');
        await refreshFumigAll();
      } catch (err) {
        window.Snackbar.show('Error: ' + (err.message || err), { type: 'error' });
      }
    };
    saveBtn.onclick = () => doSave();
      if (cancelBtnEdit) cancelBtnEdit.onclick = () => loadFumigRecords();
  };

  const refreshFumigAll = async () => {
    await Promise.all([
      loadFumigRecords(),
      (async () => {
        const { data } = await supabase.from('animal_fumigaciones').select('fecha,producto,estado').range(0, 4999);
        const fumigGroups = new Map();
        const fumigPendGroups = new Map();
        for (const f of (data || [])) {
          const key = `${f.fecha || ''}\u0000${f.producto || ''}`;
          fumigGroups.set(key, true);
          if (f.estado === 'Programada') fumigPendGroups.set(key, true);
        }
        const vecesValue = document.getElementById('fumig-veces-value');
        if (vecesValue) vecesValue.textContent = String(fumigGroups.size);
        const pendingChip = document.getElementById('fumig-pend-chip');
        if (pendingChip) pendingChip.innerHTML = `<span class="material-icons" style="font-size:13px;">schedule</span> ${fumigPendGroups.size} pend.`;
      })()
    ]);
  };

  const recordsBox = document.getElementById('ganado-fumig-records');
  if (recordsBox) {
    recordsBox.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.fumig-edit-btn');
      const delBtn = e.target.closest('.fumig-del-btn');
      if (editBtn && !editBtn.disabled) {
        editBtn.disabled = true;
        renderFumigEditForm(decodeURIComponent(editBtn.dataset.producto), decodeURIComponent(editBtn.dataset.fecha), editBtn.closest('.ganado-fumig-row'));
      } else if (delBtn) {
        const producto = decodeURIComponent(delBtn.dataset.producto);
        const fecha = decodeURIComponent(delBtn.dataset.fecha);
        window.Snackbar.confirm(`¿Eliminar la fumigación "${producto}" (${fecha})?`, async () => {
          try {
            let base = `/rest/v1/animal_fumigaciones?producto=eq.${encodeURIComponent(producto)}&fecha=eq.${encodeURIComponent(fecha)}`;
            if (window._currentEmpresaId) base += `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`;
            await restFetch(base, { method: 'DELETE' });
            window.Snackbar.show('Fumigación eliminada');
            await refreshFumigAll();
          } catch (err) {
            window.Snackbar.show('Error: ' + (err.message || err), { type: 'error' });
          }
        }, { confirmLabel: 'Eliminar', cancelLabel: 'Cancelar' });
      }
    });
  }

  const refreshBtn = document.getElementById('ganado-fumig-refresh');
  if (refreshBtn) refreshBtn.onclick = () => loadFumigRecords();

  if (applyBtn) applyBtn.onclick = async () => {
    const fecha = fumigFecha ? fumigFecha.value : '';
    const producto = fumigProducto ? fumigProducto.value.trim() : '';
    if (!fecha) { window.Snackbar.show('Indicá la fecha de fumigación', { type: 'error' }); return; }
    if (!producto) { window.Snackbar.show('Indicá el producto a fumigar', { type: 'error' }); return; }
    const estado = fecha <= getLocalToday() ? 'Aplicada' : 'Programada';
    window.Snackbar.confirm(`¿Aplicar la fumigación "${producto}" (${estado}) a todos los animales activos?`, async () => {
      try {
        const { data: animals } = await supabase.from('ganado').select('id').neq('estado', 'Vendido');
        const ids = (animals || []).map(a => a.id);
        if (!ids.length) { window.Snackbar.show('No hay animales activos', { type: 'error' }); return; }
        const rows = ids.map(id => ({ animal_id: id, producto, fecha, estado }));
        const chunkSize = 100;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const { error } = await supabase.from('animal_fumigaciones').insert(rows.slice(i, i + chunkSize));
          if (error) throw error;
        }
        window.Snackbar.show(`Fumigación ${estado.toLowerCase()} para ${rows.length} animales ✓`);
        if (fumigFecha) fumigFecha.value = getLocalToday();
        if (fumigProducto) fumigProducto.value = '';
        await refreshFumigAll();
      } catch (err) {
        window.Snackbar.show('Error: ' + (err.message || err), { type: 'error' });
      }
    });
  };
  if (cancelBtn) cancelBtn.onclick = closeFumigPanel;
  if (closeBtn) closeBtn.onclick = closeFumigPanel;

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
