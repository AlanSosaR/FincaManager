import { supabase } from '../supabase.js';
import { restFetch } from '../auth.js';
import { sendWhatsApp } from '../wa.js';
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

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatPendingName(text, maxLen = 20) {
  if (!text) return '';
  const trimmed = String(text).trim();
  if (trimmed.length <= maxLen) return trimmed;
  return trimmed.slice(0, maxLen) + '...';
}

function formatTimingLabel(fechaStr) {
  if (!fechaStr) return { text: '', isLate: false, isFuture: false, isToday: false };
  const itemDate = new Date(fechaStr + 'T00:00:00');
  if (isNaN(itemDate.getTime())) return { text: '', isLate: false, isFuture: false, isToday: false };

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diffDays = Math.round((itemDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    const daysLate = Math.abs(diffDays);
    const text = daysLate === 1 ? '1 día de retraso' : `${daysLate} días de retraso`;
    return { text, isLate: true, isFuture: false, isToday: false };
  } else if (diffDays === 0) {
    return { text: 'Para hoy', isLate: false, isFuture: false, isToday: true };
  } else {
    const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
    const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    const diaSemana = dias[itemDate.getDay()];
    const diaMes = itemDate.getDate();
    const mes = meses[itemDate.getMonth()];
    const yearStr = itemDate.getFullYear() !== today.getFullYear() ? ` ${itemDate.getFullYear()}` : '';
    return { text: `${diaSemana}, ${diaMes} ${mes}${yearStr}`, isLate: false, isFuture: true, isToday: false };
  }
}

function formatAppliedDate(fechaStr) {
  if (!fechaStr) return '';
  const itemDate = new Date(fechaStr + 'T00:00:00');
  if (isNaN(itemDate.getTime())) return fechaStr;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const dias = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
  const meses = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
  const diaSemana = dias[itemDate.getDay()];
  const diaMes = itemDate.getDate();
  const mes = meses[itemDate.getMonth()];
  const yearStr = itemDate.getFullYear() !== today.getFullYear() ? ` ${itemDate.getFullYear()}` : '';

  const diffDays = Math.round((today.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays === 0) {
    return `Hoy (${diaSemana}, ${diaMes} ${mes})`;
  } else if (diffDays === 1) {
    return `Ayer (${diaSemana}, ${diaMes} ${mes})`;
  } else {
    return `${diaSemana}, ${diaMes} ${mes}${yearStr}`;
  }
}

function processPendingData(visVacunas, visPesajes, visFumigaciones) {
  const vacunasMap = new Map();
  const vacunasAppliedMap = new Map();
  for (const v of (visVacunas?.data || [])) {
    const item = {
      nombre: v.nombre ? v.nombre.trim() : 'Vacuna',
      fecha: v.fecha || null,
      estado: v.estado
    };
    if (v.estado === 'Programada') {
      if (!vacunasMap.has(v.animal_id)) vacunasMap.set(v.animal_id, []);
      vacunasMap.get(v.animal_id).push(item);
    } else if (v.estado === 'Aplicada') {
      if (!vacunasAppliedMap.has(v.animal_id)) vacunasAppliedMap.set(v.animal_id, []);
      vacunasAppliedMap.get(v.animal_id).push(item);
    }
  }

  const fumigacionesMap = new Map();
  const fumigacionesAppliedMap = new Map();
  for (const f of (visFumigaciones?.data || [])) {
    const item = {
      producto: f.producto ? f.producto.trim() : 'Fumigación',
      fecha: f.fecha || null,
      estado: f.estado
    };
    if (f.estado === 'Programada') {
      if (!fumigacionesMap.has(f.animal_id)) fumigacionesMap.set(f.animal_id, []);
      fumigacionesMap.get(f.animal_id).push(item);
    } else if (f.estado === 'Aplicada') {
      if (!fumigacionesAppliedMap.has(f.animal_id)) fumigacionesAppliedMap.set(f.animal_id, []);
      fumigacionesAppliedMap.get(f.animal_id).push(item);
    }
  }

  const pesajesPendingMap = new Map();
  for (const p of (visPesajes?.data || [])) {
    if (!pesajesPendingMap.has(p.animal_id)) pesajesPendingMap.set(p.animal_id, []);
    pesajesPendingMap.get(p.animal_id).push({
      fecha: p.fecha || null
    });
  }

  return { vacunasMap, vacunasAppliedMap, fumigacionesMap, fumigacionesAppliedMap, pesajesPendingMap };
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
    vacunas,
    pesajesAll,
    fumigaciones,
    { count: preñadasCount },
    activeAnimals
  ] = await Promise.all([
    supabase.from('ganado').select('*', { count: 'exact', head: true }).neq('estado', 'Vendido'),
    supabase.from('ganado').select('*', { count: 'exact', head: true }).ilike('sexo', 'hembra').neq('estado', 'Vendido'),
    supabase.from('ganado').select('*', { count: 'exact', head: true }).ilike('sexo', 'macho').neq('estado', 'Vendido'),
    supabase.from('ganado').select('*', { count: 'exact', head: true }).eq('estado', 'Vendido'),
    supabase.from('animal_vacunas').select('id,fecha,nombre,dosis,estado,animal_id').range(0, 4999),
    supabase.from('animal_pesajes').select('id,fecha,animal_id').range(0, 4999),
    supabase.from('animal_fumigaciones').select('id,fecha,producto,estado,animal_id').range(0, 4999),
    supabase.from('ganado').select('*', { count: 'exact', head: true }).eq('reproductivo', 'Preñada').neq('estado', 'Vendido'),
    supabase.from('ganado').select('id').neq('estado', 'Vendido')
  ]);

  const activeAnimalIds = new Set((activeAnimals?.data || []).map(a => a.id));

  // Purge any lingering vacuna/fumigación records from sold or deleted animals
  const deadVacIds = (vacunas.data || []).filter(v => !activeAnimalIds.has(v.animal_id)).map(v => v.id).filter(Boolean);
  const deadFumIds = (fumigaciones.data || []).filter(f => !activeAnimalIds.has(f.animal_id)).map(f => f.id).filter(Boolean);

  if (deadVacIds.length > 0) {
    const idsParam = deadVacIds.map(id => encodeURIComponent(id)).join(',');
    let vacUrl = `/rest/v1/animal_vacunas?id=in.(${idsParam})`;
    if (window._currentEmpresaId) vacUrl += `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`;
    restFetch(vacUrl, { method: 'DELETE' }).catch(() => []);
  }

  if (deadFumIds.length > 0) {
    const idsParam = deadFumIds.map(id => encodeURIComponent(id)).join(',');
    let fumUrl = `/rest/v1/animal_fumigaciones?id=in.(${idsParam})`;
    if (window._currentEmpresaId) fumUrl += `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`;
    restFetch(fumUrl, { method: 'DELETE' }).catch(() => []);
  }

  const fumigAppliedGroups = new Map();
  const fumigPendGroups = new Map();
  for (const f of (fumigaciones.data || [])) {
    if (!activeAnimalIds.has(f.animal_id)) continue;
    const key = `${f.fecha || ''}\u0000${f.producto || ''}`;
    if (f.estado === 'Aplicada') fumigAppliedGroups.set(key, true);
    if (f.estado === 'Programada') fumigPendGroups.set(key, true);
  }
  const vecesFumigadas = fumigAppliedGroups.size;
  const fumigPendGroupCount = fumigPendGroups.size;

  const vacAppliedGroups = new Map();
  const vacPendGroups = new Map();
  for (const v of (vacunas.data || [])) {
    if (!activeAnimalIds.has(v.animal_id)) continue;
    const key = `${v.fecha || ''}\u0000${v.nombre || ''}`;
    if (v.estado === 'Aplicada') vacAppliedGroups.set(key, true);
    if (v.estado === 'Programada') vacPendGroups.set(key, true);
  }
  const vecesVacunadas = vacAppliedGroups.size;
  const vacPendGroupCount = vacPendGroups.size;

  // Pesajes: tiempo transcurrido y atrasos
  const animalLatestPesajeMap = new Map();
  for (const p of (pesajesAll?.data || [])) {
    if (!activeAnimalIds.has(p.animal_id)) continue;
    const cur = animalLatestPesajeMap.get(p.animal_id);
    if (!cur || p.fecha > cur) {
      animalLatestPesajeMap.set(p.animal_id, p.fecha);
    }
  }
  const totalConPesaje = animalLatestPesajeMap.size;
  const hoyStr = getLocalToday();
  const todayTime = new Date(hoyStr + 'T00:00:00').getTime();

  let pesajesAtrasadosCount = 0;
  for (const animalId of activeAnimalIds) {
    const lastFecha = animalLatestPesajeMap.get(animalId);
    if (!lastFecha) {
      pesajesAtrasadosCount++;
    } else {
      const diff = Math.round((todayTime - new Date(lastFecha + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24));
      if (diff > 30) pesajesAtrasadosCount++;
    }
  }

  let activeFilterIds = [];
  if (currentFilter === 'vacunas') {
    const { data } = await supabase.from('animal_vacunas').select('animal_id');
    const ids = new Set((data || []).map(v => v.animal_id));
    activeFilterIds = Array.from(ids);
  } else if (currentFilter === 'fumigaciones') {
    const { data } = await supabase.from('animal_fumigaciones').select('animal_id');
    const ids = new Set((data || []).map(f => f.animal_id));
    activeFilterIds = Array.from(ids);
  } else if (currentFilter === 'pendientes') {
    const [vRes, fRes] = await Promise.all([
      supabase.from('animal_vacunas').select('animal_id').eq('estado', 'Programada'),
      supabase.from('animal_fumigaciones').select('animal_id').eq('estado', 'Programada')
    ]);
    const allIds = new Set([
      ...(vRes.data || []).map(x => x.animal_id),
      ...(fRes.data || []).map(x => x.animal_id)
    ]);
    for (const animalId of activeAnimalIds) {
      const lastFecha = animalLatestPesajeMap.get(animalId);
      if (!lastFecha) {
        allIds.add(animalId);
      } else {
        const diff = Math.round((todayTime - new Date(lastFecha + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24));
        if (diff > 30) allIds.add(animalId);
      }
    }
    activeFilterIds = Array.from(allIds);
  }

  // Build the main query based on filter
  let query = supabase.from('ganado').select('*', { count: 'exact' });

  if (currentFilter === 'all' || currentFilter === 'pesajes') {
    query = query.neq('estado', 'Vendido');
  } else if (currentFilter === 'hembra') {
    query = query.ilike('sexo', 'hembra').neq('estado', 'Vendido');
  } else if (currentFilter === 'macho') {
    query = query.ilike('sexo', 'macho').neq('estado', 'Vendido');
  } else if (currentFilter === 'vacunas' || currentFilter === 'fumigaciones' || currentFilter === 'pendientes') {
    query = query.in('id', activeFilterIds.length ? activeFilterIds : ['00000000-0000-0000-0000-000000000000']).neq('estado', 'Vendido');
  } else if (currentFilter === 'preñadas') {
    query = query.eq('reproductivo', 'Preñada').neq('estado', 'Vendido');
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
    visibleAnimalIds.length ? supabase.from('animal_vacunas').select('animal_id, nombre, fecha, estado').in('animal_id', visibleAnimalIds) : Promise.resolve({ data: [] }),
    visibleAnimalIds.length ? supabase.from('animal_pesajes').select('animal_id, fecha').eq('estado', 'Programada').in('animal_id', visibleAnimalIds) : Promise.resolve({ data: [] }),
    visibleAnimalIds.length ? supabase.from('animal_fumigaciones').select('animal_id, producto, fecha, estado').in('animal_id', visibleAnimalIds) : Promise.resolve({ data: [] })
  ]);

  const { vacunasMap, vacunasAppliedMap, fumigacionesMap, fumigacionesAppliedMap, pesajesPendingMap } = processPendingData(visVacunas, visPesajes, visFumigaciones);
  const pesajesMap = await fetchLatestPesajes(visibleAnimalIds);

  // Stats for cards
  const hembrasRatio = totalAnimales ? Math.round((hembrasCount / totalAnimales) * 100) : 0;
  const machosRatio  = totalAnimales ? Math.round((machosCount  / totalAnimales) * 100) : 0;
  const totalPendientesCount = (vacPendGroupCount || 0) + (pesajesAtrasadosCount || 0) + (fumigPendGroupCount || 0);

  return `
    <div class="screen-ganado" style="padding-bottom: 80px;">
      <div class="ganado-top-actions-container" style="display: flex; justify-content: flex-end; gap: 10px; margin: 16px 0 8px;">
        <div class="ganado-split-ctrl ${currentSearchQuery ? 'expanded' : ''}" id="ganado-search-wrapper">
          <button id="ganado-search-toggle" class="m3-icon-btn-tonal" style="margin: 0; box-shadow: none; width: 48px; height: 48px; display: flex; align-items: center; justify-content: center;" title="Buscar">
            <span class="material-icons" style="color: #ffffff;">search</span>
          </button>
          <input type="text" id="ganado-search-input" placeholder="Buscar animal..." value="${currentSearchQuery}" style="border: none; background: transparent; outline: none; font-size: 15px; width: ${currentSearchQuery ? '160px' : '0px'}; transition: width 0.3s; opacity: ${currentSearchQuery ? '1' : '0'}; padding: ${currentSearchQuery ? '0 8px 0 0' : '0'}; color: #ffffff;">
          <button id="ganado-search-clear" style="background: none; border: none; cursor: pointer; display: ${currentSearchQuery ? 'flex' : 'none'}; align-items: center; justify-content: center; padding: 0 16px 0 8px; color: #ffffff; height: 100%;" title="Limpiar búsqueda">
            <span class="material-icons" style="font-size: 20px;">close</span>
          </button>
          <span class="ganado-split-ctrl-sep"></span>
          <button class="ganado-split-ctrl-reg" onclick="window.toggleGanadoSplitMenu(event)" title="Más opciones">
            <span class="material-icons">arrow_drop_down</span>
          </button>
          <div class="ganado-split-menu" id="ganado-split-menu">
            <button class="ganado-split-item" onclick="window.navigateTo('nuevo_animal'); document.getElementById('ganado-split-menu').classList.remove('open');">
              <span class="material-icons">add</span><span>Registrar animal</span>
            </button>
          </div>
        </div>
      </div>
      <div class="ganado-page-title" style="margin-top: -10px; margin-bottom: 24px;">
        <h2>Ganado</h2>
      </div>

      <div class="da-tabs-section" style="margin-top: 16px;">
        <section class="ganado-top-cards">
          <div class="ganado-card ganado-card-primary ganado-tally ganado-card-filter ${currentFilter === 'all' ? 'active' : ''}" data-filter="all" style="background: var(--m3-primary, #2d3e2c); border-radius: 20px; padding: 24px 22px 20px; box-shadow: 0 6px 24px rgba(45,62,44,0.22); width: 100%; box-sizing: border-box;">
            <div class="ganado-tally-top" style="margin-bottom: 16px;">
              <span class="ganado-tally-label" style="color: rgba(255,255,255,0.92); font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; font-size: 13.5px;">Total Animales</span>
              <span class="ganado-tally-count">
                <span class="ganado-card-value" style="color: #ffffff !important; font-size: 38px; font-weight: 800;">${totalAnimales}</span>
              </span>
            </div>
            <div class="ganado-tally-divider" style="border-top: 1px solid rgba(255,255,255,0.18); margin-bottom: 16px;"></div>
            <div class="ganado-tally-row" style="display: flex; gap: 12px; flex-wrap: wrap;">
              <div class="ganado-tag-stat ganado-card-filter ${currentFilter === 'hembra' ? 'active' : ''}" data-filter="hembra" title="Ver hembras" style="background: rgba(255,255,255,0.95); border-radius: 14px; padding: 14px 18px; flex: 1; min-width: 130px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); display: flex; align-items: center; gap: 12px;">
                <span class="ganado-tag-swatch h"><span class="ganado-sex-icon-img"></span></span>
                <span class="ganado-tag-info">
                  <span class="ganado-tag-n" style="font-size: 19px; font-weight: 800; color: #2d3e2c;">${hembrasCount}</span>
                  <span class="ganado-tag-l" style="font-size: 12px; text-transform: uppercase; color: #666; font-weight: 700;">Hembras</span>
                </span>
              </div>
              <div class="ganado-tag-stat ganado-card-filter ${currentFilter === 'macho' ? 'active' : ''}" data-filter="macho" title="Ver machos" style="background: rgba(255,255,255,0.95); border-radius: 14px; padding: 14px 18px; flex: 1; min-width: 130px; box-shadow: 0 2px 8px rgba(0,0,0,0.06); display: flex; align-items: center; gap: 12px;">
                <span class="ganado-tag-swatch m"><span class="ganado-sex-icon-img"></span></span>
                <span class="ganado-tag-info">
                  <span class="ganado-tag-n" style="font-size: 19px; font-weight: 800; color: #2d3e2c;">${machosCount}</span>
                  <span class="ganado-tag-l" style="font-size: 12px; text-transform: uppercase; color: #666; font-weight: 700;">Machos</span>
                </span>
              </div>
            </div>
          </div>
        </section>

        <!-- Carrusel de tarjetas de estado (Estilo Detalle Animal) -->
        <div class="ganado-carousel-container">
          <div class="ganado-carousel-track" id="ganado-carousel-track">
            
            <!-- 1. Fumigación -->
            <div class="ganado-carousel-card ganado-card-filter ${currentFilter === 'fumigaciones' ? 'active' : ''} ${fumigPendGroupCount > 0 ? 'is-pending' : ''}" id="ganado-fumig-card" data-filter="fumigaciones" title="Fumigación aplicada (clic para panel masivo)">
              <div class="ganado-carousel-icon">
                <span class="material-symbols-outlined" style="color: #185FA5;">shield</span>
              </div>
              <div class="ganado-carousel-label">Fumig.</div>
              <div class="ganado-carousel-value">${vecesFumigadas}</div>
              ${fumigPendGroupCount > 0 ? `<div class="ganado-carousel-badge amber"><span class="material-icons" style="font-size:10px;">schedule</span>${fumigPendGroupCount} pdt.</div>` : '<div class="ganado-carousel-badge neutral">Aplicadas</div>'}
            </div>

            <!-- 2. Vacunas -->
            <div class="ganado-carousel-card ganado-card-filter ${currentFilter === 'vacunas' ? 'active' : ''} ${vacPendGroupCount > 0 ? 'is-pending' : ''}" id="ganado-vacuna-card" data-filter="vacunas" title="Vacunación aplicada (clic para panel masivo)">
              <div class="ganado-carousel-icon">
                <span class="material-symbols-outlined" style="color: #3B6D11;">vaccines</span>
              </div>
              <div class="ganado-carousel-label">Vacunas</div>
              <div class="ganado-carousel-value">${vecesVacunadas}</div>
              ${vacPendGroupCount > 0 ? `<div class="ganado-carousel-badge amber"><span class="material-icons" style="font-size:10px;">schedule</span>${vacPendGroupCount} pdt.</div>` : '<div class="ganado-carousel-badge neutral">Aplicadas</div>'}
            </div>

            <!-- 4. Pesajes -->
            <div class="ganado-carousel-card ganado-card-filter ${currentFilter === 'pesajes' ? 'active' : ''} ${pesajesAtrasadosCount > 0 ? 'is-pending' : ''}" id="ganado-pesaje-card" data-filter="pesajes" title="Control de pesajes y tiempo transcurrido">
              <div class="ganado-carousel-icon">
                <span class="material-symbols-outlined" style="color: #2d3e2c;">scale</span>
              </div>
              <div class="ganado-carousel-label">Pesajes</div>
              <div class="ganado-carousel-value">${totalConPesaje}</div>
              ${pesajesAtrasadosCount > 0 ? `<div class="ganado-carousel-badge amber"><span class="material-icons" style="font-size:10px;">schedule</span>${pesajesAtrasadosCount} pdt.</div>` : '<div class="ganado-carousel-badge neutral">Al día</div>'}
            </div>

            <!-- 5. Preñadas -->
            <div class="ganado-carousel-card ganado-card-filter ${currentFilter === 'preñadas' ? 'active' : ''}" data-filter="preñadas" title="Hembras preñadas">
              <div class="ganado-carousel-icon">
                <img src="/cow.png" style="width: 22px; height: 22px; object-fit: contain;">
              </div>
              <div class="ganado-carousel-label">Preñadas</div>
              <div class="ganado-carousel-value">${preñadasCount}</div>
              ${preñadasCount > 0 ? `<div class="ganado-carousel-badge green">Gestando</div>` : '<div class="ganado-carousel-badge neutral">0</div>'}
            </div>

            <!-- 6. Vendidos -->
            <div class="ganado-carousel-card ganado-card-filter ${currentFilter === 'vendido' ? 'active' : ''}" data-filter="vendido" title="Animales vendidos">
              <div class="ganado-carousel-icon">
                <span class="material-symbols-outlined" style="color: #555;">payments</span>
              </div>
              <div class="ganado-carousel-label">Vendidos</div>
              <div class="ganado-carousel-value">${vendidosCount}</div>
              <div class="ganado-carousel-badge neutral">Historial</div>
            </div>

          </div>
        </div>

        <!-- Contenedor Fumigación masiva con banner colapsable -->
        <div id="ganado-fumig-wrapper" style="display: ${currentFilter === 'fumigaciones' ? 'block' : 'none'}; margin-top: 16px;">
          <div class="ganado-fumig-banner" style="background: #ffffff; border: 1.5px solid rgba(44,102,110,0.22); border-radius: 16px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.04); flex-wrap: nowrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
              <span class="material-icons" style="font-size: 24px; color: #2c666e; flex-shrink: 0;">bug_report</span>
              <div style="min-width: 0;">
                <span style="font-size: 14px; font-weight: 700; color: #191c19; display: block; line-height: 1.2;">Fumigación masiva</span>
                <span style="display: block; font-size: 11.5px; color: #666; margin-top: 2px;">Aplicación grupal a ${totalAnimales} animales e historial</span>
              </div>
            </div>
            <button type="button" id="ganado-fumig-toggle-btn" class="btn-m3-tonal" style="flex-shrink: 0; margin: 0; padding: 6px 14px; font-size: 13px; font-weight: 700; border-radius: 999px; display: flex; align-items: center; gap: 4px; cursor: pointer; color: #2c666e; background: #e0f2f1; border: none;">
              <span id="ganado-fumig-toggle-icon" class="material-icons" style="font-size: 18px;">visibility</span>
              <span id="ganado-fumig-toggle-text">Ver</span>
            </button>
          </div>

          <div class="ganado-fumig-panel" id="ganado-fumig-panel" style="display: none; margin-top: 12px;">
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
                <button type="button" class="btn-m3-fill" id="ganado-fumig-apply" style="background:#2c666e; color:#fff;"><span id="ganado-fumig-apply-label">Aplicar</span></button>
              </div>
            </div>

            <div style="margin-top:20px;">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                <span class="material-icons" style="font-size:18px; color:#2c666e;">list_alt</span>
                <h4 style="margin:0; color:var(--on-surface,#222); font-size:15px; flex:1;">Registros de fumigación</h4>
                <button type="button" id="ganado-fumig-apply-all" title="Aplicar todas las programadas" style="display:none; background:#2c666e; color:#fff; border:none; border-radius:999px; padding:6px 12px; font-size:12px; font-weight:700; cursor:pointer; align-items:center; gap:4px;">
                  <span class="material-icons" style="font-size:15px;">check_circle</span> Aplicar todas
                </button>
                <button type="button" id="ganado-fumig-refresh" class="m3-icon-btn" title="Actualizar" style="background:none; border:none; cursor:pointer; color:#2c666e; display:flex; align-items:center; justify-content:center; padding:4px;">
                  <span class="material-icons" style="font-size:20px;">refresh</span>
                </button>
              </div>
              <div id="ganado-fumig-records" style="max-height: 320px; overflow-y: auto;">
                <p style="color:#999; font-size:13px; text-align:center; padding:12px 0;">Cargando...</p>
              </div>
            </div>
          </div>
        </div>

        <!-- Contenedor Vacunación masiva con banner colapsable -->
        <div id="ganado-vacuna-wrapper" style="display: ${currentFilter === 'vacunas' ? 'block' : 'none'}; margin-top: 16px;">
          <div class="ganado-vacuna-banner" style="background: #ffffff; border: 1.5px solid rgba(59,109,17,0.25); border-radius: 16px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; box-shadow: 0 2px 8px rgba(0,0,0,0.04); flex-wrap: nowrap; gap: 10px;">
            <div style="display: flex; align-items: center; gap: 10px; flex: 1; min-width: 0;">
              <span class="material-symbols-outlined" style="font-size: 24px; color: #3B6D11; flex-shrink: 0;">vaccines</span>
              <div style="min-width: 0;">
                <span style="font-size: 14px; font-weight: 700; color: #191c19; display: block; line-height: 1.2;">Vacunación y tratamientos masivos</span>
                <span style="display: block; font-size: 11.5px; color: #666; margin-top: 2px;">Aplicación grupal a ${totalAnimales} animales e historial</span>
              </div>
            </div>
            <button type="button" id="ganado-vacuna-toggle-btn" class="btn-m3-tonal" style="flex-shrink: 0; margin: 0; padding: 6px 14px; font-size: 13px; font-weight: 700; border-radius: 999px; display: flex; align-items: center; gap: 4px; cursor: pointer; color: #3B6D11; background: #e8f5e9; border: none;">
              <span id="ganado-vacuna-toggle-icon" class="material-icons" style="font-size: 18px;">visibility</span>
              <span id="ganado-vacuna-toggle-text">Ver</span>
            </button>
          </div>

          <div class="ganado-vacuna-panel" id="ganado-vacuna-panel" style="display: none; margin-top: 12px;">
            <div style="background: var(--surface-container-low, #fff); border-radius: 16px; padding: 20px; border: 1px solid rgba(59,109,17,0.25); box-shadow: 0 2px 12px rgba(0,0,0,0.06);">
              <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
                <span class="material-symbols-outlined" style="font-size:22px; color:#3B6D11;">vaccines</span>
                <h4 style="margin:0; color:var(--on-surface,#222); font-size:17px; flex:1;">Vacunación y tratamiento masivo</h4>
                <button type="button" id="ganado-vacuna-close" class="m3-icon-btn" title="Cerrar" style="background:none; border:none; cursor:pointer; color:#666; display:flex; align-items:center; justify-content:center; padding:4px;">
                  <span class="material-icons" style="font-size:22px;">close</span>
                </button>
              </div>
              <p style="margin:0 0 16px; font-size:13px; color:#666; line-height:1.5;">
                Aplica la vacuna o tratamiento a <strong id="ganado-vacuna-target-count">${totalAnimales}</strong> animales activos con la misma fecha.
              </p>
              <div style="display:flex; gap:14px; flex-wrap:wrap; align-items:flex-end;">
                <div class="m3-field" style="min-width:160px; flex:1 1 180px;">
                  <input type="date" id="ganado-vacuna-fecha" value="${getLocalToday()}" placeholder=" " required>
                  <label>Fecha</label>
                </div>
                <div class="m3-field" style="flex:1 1 200px;">
                  <input type="text" id="ganado-vacuna-nombre" placeholder=" " required>
                  <label>Vacuna / Tratamiento</label>
                </div>
                <div class="m3-field" style="min-width:110px; flex:1 1 130px;">
                  <input type="text" id="ganado-vacuna-dosis" placeholder=" ">
                  <label>Dosis (ej. 5 ml)</label>
                </div>
              </div>
              <div style="display:flex; gap:10px; margin-top:18px; justify-content:flex-end;">
                <button type="button" class="btn-m3-tonal" id="ganado-vacuna-cancel">Cancelar</button>
                <button type="button" class="btn-m3-fill" id="ganado-vacuna-apply" style="background:#3B6D11; color:#fff;"><span id="ganado-vacuna-apply-label">Aplicar</span></button>
              </div>
            </div>

            <div style="margin-top:20px;">
              <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px;">
                <span class="material-icons" style="font-size:18px; color:#3B6D11;">list_alt</span>
                <h4 style="margin:0; color:var(--on-surface,#222); font-size:15px; flex:1;">Registros de vacunación</h4>
                <button type="button" id="ganado-vacuna-apply-all" title="Aplicar todas las programadas" style="display:none; background:#3B6D11; color:#fff; border:none; border-radius:999px; padding:6px 12px; font-size:12px; font-weight:700; cursor:pointer; align-items:center; gap:4px;">
                  <span class="material-icons" style="font-size:15px;">check_circle</span> Aplicar todas
                </button>
                <button type="button" id="ganado-vacuna-refresh" class="m3-icon-btn" title="Actualizar" style="background:none; border:none; cursor:pointer; color:#3B6D11; display:flex; align-items:center; justify-content:center; padding:4px;">
                  <span class="material-icons" style="font-size:20px;">refresh</span>
                </button>
              </div>
              <div id="ganado-vacuna-records" style="max-height: 320px; overflow-y: auto;">
                <p style="color:#999; font-size:13px; text-align:center; padding:12px 0;">Cargando...</p>
              </div>
            </div>
          </div>
        </div>

        <div class="ganado-list-header" style="margin-top: 32px;">
          <h4 id="ganado-list-title">${currentFilter === 'all' ? 'Inventario Ganadero' : currentFilter === 'pesajes' ? 'Control de Pesajes' : 'Resultados del Filtro'}</h4>
          <span class="ganado-count-label" id="ganado-count-label">${currentFilter !== 'all' ? (currentFilter === 'pesajes' ? `${totalGanadoCount} animales en seguimiento` : `${totalGanadoCount} animales encontrados`) : ''}</span>
        </div>

        <div class="ganado-list" id="ganado-list-container">
          ${animales.map(a => renderAnimalRow(a, vacunasMap, vacunasAppliedMap, fumigacionesMap, fumigacionesAppliedMap, pesajesPendingMap, pesajesMap)).join('')}
          ${animales.length === 0 ? '<div class="ganado-empty"><p>No se encontraron animales.</p></div>' : ''}
        </div>

        <div id="ganado-pagination-wrapper">
          ${paginationFooterHtml()}
        </div>
      </div>
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
    const { data } = await supabase.from('animal_vacunas').select('animal_id');
    const ids = new Set((data || []).map(v => v.animal_id));
    activeFilterIds = Array.from(ids);
  } else if (currentFilter === 'fumigaciones') {
    const { data } = await supabase.from('animal_fumigaciones').select('animal_id');
    const ids = new Set((data || []).map(f => f.animal_id));
    activeFilterIds = Array.from(ids);
  } else if (currentFilter === 'pendientes') {
    const [vRes, fRes, activeRes, pesRes] = await Promise.all([
      supabase.from('animal_vacunas').select('animal_id').eq('estado', 'Programada'),
      supabase.from('animal_fumigaciones').select('animal_id').eq('estado', 'Programada'),
      supabase.from('ganado').select('id').neq('estado', 'Vendido'),
      supabase.from('animal_pesajes').select('id,fecha,animal_id').range(0, 4999)
    ]);
    const allIds = new Set([
      ...(vRes.data || []).map(x => x.animal_id),
      ...(fRes.data || []).map(x => x.animal_id)
    ]);
    const actIds = new Set((activeRes?.data || []).map(a => a.id));
    const latestPMap = new Map();
    for (const p of (pesRes?.data || [])) {
      if (!actIds.has(p.animal_id)) continue;
      const cur = latestPMap.get(p.animal_id);
      if (!cur || p.fecha > cur) latestPMap.set(p.animal_id, p.fecha);
    }
    const todayT = new Date(getLocalToday() + 'T00:00:00').getTime();
    for (const aid of actIds) {
      const lf = latestPMap.get(aid);
      if (!lf) {
        allIds.add(aid);
      } else {
        const diff = Math.round((todayT - new Date(lf + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24));
        if (diff > 30) allIds.add(aid);
      }
    }
    activeFilterIds = Array.from(allIds);
  }

  let query = supabase.from('ganado').select('*', { count: 'exact' });
  if (currentFilter === 'all' || currentFilter === 'pesajes') query = query.neq('estado', 'Vendido');
  else if (currentFilter === 'hembra') query = query.ilike('sexo', 'hembra').neq('estado', 'Vendido');
  else if (currentFilter === 'macho') query = query.ilike('sexo', 'macho').neq('estado', 'Vendido');
  else if (currentFilter === 'vacunas' || currentFilter === 'fumigaciones' || currentFilter === 'pendientes') {
    query = query.in('id', activeFilterIds.length ? activeFilterIds : ['00000000-0000-0000-0000-000000000000']).neq('estado', 'Vendido');
  }
  else if (currentFilter === 'preñadas') query = query.eq('reproductivo', 'Preñada').neq('estado', 'Vendido');
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
  const countEl = document.getElementById('ganado-count-label');
  if (countEl) {
    countEl.textContent = currentFilter !== 'all' ? (currentFilter === 'pesajes' ? `${totalGanadoCount} animales en seguimiento` : `${totalGanadoCount} animales encontrados`) : '';
  }
  const titleEl = document.getElementById('ganado-list-title');
  if (titleEl) {
    titleEl.textContent = currentFilter === 'all' ? 'Inventario Ganadero' : currentFilter === 'pesajes' ? 'Control de Pesajes' : 'Resultados del Filtro';
  }

  const visibleAnimalIds = (animales || []).map(a => a.id);
  const [visVacunas, visPesajes, visFumigaciones] = await Promise.all([
    visibleAnimalIds.length ? supabase.from('animal_vacunas').select('animal_id, nombre, fecha, estado').in('animal_id', visibleAnimalIds) : Promise.resolve({ data: [] }),
    visibleAnimalIds.length ? supabase.from('animal_pesajes').select('animal_id, fecha').eq('estado', 'Programada').in('animal_id', visibleAnimalIds) : Promise.resolve({ data: [] }),
    visibleAnimalIds.length ? supabase.from('animal_fumigaciones').select('animal_id, producto, fecha, estado').in('animal_id', visibleAnimalIds) : Promise.resolve({ data: [] })
  ]);

  const { vacunasMap, vacunasAppliedMap, fumigacionesMap, fumigacionesAppliedMap, pesajesPendingMap } = processPendingData(visVacunas, visPesajes, visFumigaciones);
  const pesajesMap = await fetchLatestPesajes(visibleAnimalIds);

  listContainer.innerHTML = animales.length === 0
    ? '<div class="ganado-empty"><p>No se encontraron animales.</p></div>'
    : animales.map(a => renderAnimalRow(a, vacunasMap, vacunasAppliedMap, fumigacionesMap, fumigacionesAppliedMap, pesajesPendingMap, pesajesMap)).join('');

  if (footerContainer) footerContainer.innerHTML = paginationFooterHtml();
  if (typeof updateCarouselCounts === 'function') updateCarouselCounts();
}


function formatTiempoEmpresa(fechaStr) {
  if (!fechaStr) return '';
  const d = new Date(fechaStr.includes('T') ? fechaStr : fechaStr + 'T00:00:00');
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
  if (diffDays < 0) return '';
  if (diffDays <= 1) return '1 día';
  if (diffDays < 30) return `${diffDays} días`;

  let anios = now.getFullYear() - d.getFullYear();
  let meses = now.getMonth() - d.getMonth();
  let dias = now.getDate() - d.getDate();

  if (dias < 0) {
    meses -= 1;
    const prevMonthDays = new Date(now.getFullYear(), now.getMonth(), 0).getDate();
    dias += prevMonthDays;
  }
  if (meses < 0) {
    anios -= 1;
    meses += 12;
  }

  if (anios <= 0) {
    const m = Math.max(1, meses);
    if (dias > 0) {
      return `${m} ${m === 1 ? 'mes' : 'meses'}, ${dias} d`;
    }
    return `${m} ${m === 1 ? 'mes' : 'meses'}`;
  }
  if (meses > 0 && dias > 0) {
    return `${anios} ${anios === 1 ? 'año' : 'años'}, ${meses} m, ${dias} d`;
  }
  if (meses > 0) {
    return `${anios} ${anios === 1 ? 'año' : 'años'}, ${meses} m`;
  }
  if (dias > 0) {
    return `${anios} ${anios === 1 ? 'año' : 'años'}, ${dias} d`;
  }
  return `${anios} ${anios === 1 ? 'año' : 'años'}`;
}

function renderAnimalRow(a, vacunasMap, vacunasAppliedMap, fumigacionesMap, fumigacionesAppliedMap, pesajesPendingMap, pesajesMap = new Map()) {
  const isSold = a.estado === 'Vendido';
  const isPreñada = a.sexo === 'Hembra' && a.reproductivo === 'Preñada';
  const isPendingFilter = ['pendientes', 'vacunas', 'fumigaciones', 'pesajes'].includes(currentFilter);
  const vacsPending = (!isSold && vacunasMap?.get(a.id)) ? vacunasMap.get(a.id) : [];
  const vacsApplied = (!isSold && vacunasAppliedMap?.get(a.id)) ? vacunasAppliedMap.get(a.id) : [];
  const fumigsPending = (!isSold && fumigacionesMap?.get(a.id)) ? fumigacionesMap.get(a.id) : [];
  const fumigsApplied = (!isSold && fumigacionesAppliedMap?.get(a.id)) ? fumigacionesAppliedMap.get(a.id) : [];
  const pesajesPending = (!isSold && pesajesPendingMap?.get(a.id)) ? pesajesPendingMap.get(a.id) : [];
  const pendingVacuna = vacsPending.length > 0;
  const pendingFumigacion = fumigsPending.length > 0;
  const pendingPesaje = pesajesPending.length > 0;
  const isAmbas = pendingVacuna && pendingFumigacion;

  const seed = encodeURIComponent(a.id || a.nombre || 'animal');
  const imageUrl = a.image_url || `https://api.dicebear.com/7.x/adventurer-neutral/svg?seed=${seed}&backgroundColor=f0ebe3&radius=16`;

  // Edad del animal (calculada desde su fecha de ingreso o nacimiento)
  const fechaEdad = a.fecha_adquisicion || a.created_at;
  const tiempoEstancia = formatTiempoEmpresa(fechaEdad);
  const daysHtml = tiempoEstancia ? `<p class="ganado-days-line" title="Edad del animal"><span style="font-weight:600; opacity:0.85;">Edad:</span> ${tiempoEstancia}</p>` : '';

  // Pesaje trend and elapsed time info
  const pesajeData = pesajesMap.get(a.id);
  let trendHtml = '';
  let diffDays = null;

  if (pesajeData && pesajeData.latest) {
    const latestPeso = parseFloat(pesajeData.latest.peso);
    const prevPeso = pesajeData.previous ? parseFloat(pesajeData.previous.peso) : null;
    const lastDate = new Date(pesajeData.latest.fecha + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    diffDays = Math.round((today - lastDate) / (1000 * 60 * 60 * 24));

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

  // Pending text tags (strictly isolated to the active filter)
  const showAllPending = currentFilter === 'pendientes';
  const showVacunas = currentFilter === 'vacunas' || showAllPending;
  const showFumigaciones = currentFilter === 'fumigaciones' || showAllPending;
  const showPesajes = currentFilter === 'pesajes' || showAllPending;

  let pendingTagsHtml = '';
  if (!isSold && isPendingFilter) {
    const tags = [];

    if (showAllPending && isAmbas) {
      tags.push(`
        <span class="ganado-pending-tag tag-ambas">
          <span class="material-icons" style="font-size:12px; margin-right:4px;">schedule</span>Ambas pendientes
        </span>
      `);
    }

    if (showVacunas) {
      if (pendingVacuna) {
        for (const item of vacsPending) {
          const timing = formatTimingLabel(item.fecha);
          const timingClass = timing.isLate ? 'late' : timing.isToday ? 'today' : 'future';
          const timingHtml = timing.text
            ? `<span class="ganado-pending-timing ${timingClass}"><span class="material-icons">schedule</span>${escapeHtml(timing.text)}</span>`
            : '';
          const vName = formatPendingName(item.nombre, 24);
          const labelPrefix = currentFilter === 'vacunas' ? 'Pendiente:' : 'Vacuna pendiente:';
          tags.push(`
            <span class="ganado-pending-tag tag-vacuna" title="Inyección / Vacuna: ${escapeHtml(item.nombre || '')} · ${escapeHtml(timing.text || '')}">
              <span>${labelPrefix} ${escapeHtml(vName)}</span> ${timingHtml}
            </span>
          `);
        }
      }
      if (currentFilter === 'vacunas' && vacsApplied.length > 0) {
        for (const item of vacsApplied) {
          const vName = formatPendingName(item.nombre, 24);
          const fechaLabel = formatAppliedDate(item.fecha);
          const timingHtml = fechaLabel
            ? `<span class="ganado-pending-timing" style="background:#dcfce7; color:#166534; border:1px solid #86efac;"><span class="material-icons">schedule</span>${escapeHtml(fechaLabel)}</span>`
            : '';
          tags.push(`
            <span class="ganado-pending-tag tag-vacuna" style="background:#f0fdf4; color:#166534; border:1px solid #bbf7d0;" title="Vacuna aplicada: ${escapeHtml(item.nombre || '')} · ${escapeHtml(fechaLabel || item.fecha || '')}">
              <span style="display:inline-flex; align-items:center; gap:4px;"><span class="material-icons" style="font-size:12px; vertical-align:middle;">check_circle</span>Aplicado: ${escapeHtml(vName)}</span> ${timingHtml}
            </span>
          `);
        }
      }
    }

    if (showFumigaciones) {
      if (pendingFumigacion) {
        for (const item of fumigsPending) {
          const timing = formatTimingLabel(item.fecha);
          const timingClass = timing.isLate ? 'late' : timing.isToday ? 'today' : 'future';
          const timingHtml = timing.text
            ? `<span class="ganado-pending-timing ${timingClass}"><span class="material-icons">schedule</span>${escapeHtml(timing.text)}</span>`
            : '';
          const fName = formatPendingName(item.producto, 24);
          const labelPrefix = currentFilter === 'fumigaciones' ? 'Pendiente:' : 'Fumigación pendiente:';
          tags.push(`
            <span class="ganado-pending-tag tag-fumig" title="Fumigación: ${escapeHtml(item.producto || '')} · ${escapeHtml(timing.text || '')}">
              <span>${labelPrefix} ${escapeHtml(fName)}</span> ${timingHtml}
            </span>
          `);
        }
      }
      if (currentFilter === 'fumigaciones' && fumigsApplied.length > 0) {
        for (const item of fumigsApplied) {
          const fName = formatPendingName(item.producto, 24);
          const fechaLabel = formatAppliedDate(item.fecha);
          const timingHtml = fechaLabel
            ? `<span class="ganado-pending-timing" style="background:#e0f2fe; color:#0369a1; border:1px solid #bae6fd;"><span class="material-icons">schedule</span>${escapeHtml(fechaLabel)}</span>`
            : '';
          tags.push(`
            <span class="ganado-pending-tag tag-fumig" style="background:#f0fdf4; color:#166534; border:1px solid #bbf7d0;" title="Fumigación aplicada: ${escapeHtml(item.producto || '')} · ${escapeHtml(fechaLabel || item.fecha || '')}">
              <span style="display:inline-flex; align-items:center; gap:4px;"><span class="material-icons" style="font-size:12px; vertical-align:middle;">check_circle</span>Aplicado: ${escapeHtml(fName)}</span> ${timingHtml}
            </span>
          `);
        }
      }
    }

    if (showPesajes) {
      if (pesajeData && pesajeData.latest) {
        const isAtrasado = diffDays !== null && diffDays > 30;
        const tagBg = isAtrasado ? '#fff8e6' : '#f0fdf4';
        const tagColor = isAtrasado ? '#b45309' : '#166534';
        const tagBorder = isAtrasado ? '#fed7aa' : '#bbf7d0';
        const icon = isAtrasado ? 'schedule' : 'scale';
        const dateLabel = formatAppliedDate(pesajeData.latest.fecha);
        let timeDesc = '';
        if (diffDays === 0) timeDesc = 'Pesado hoy';
        else if (diffDays === 1) timeDesc = 'Pesado ayer';
        else timeDesc = `Último pesaje hace ${diffDays} días`;

        const pesoDesc = pesajeData.latest.peso ? ` · ${pesajeData.latest.peso} ${a.peso_unidad || 'kg'}` : '';

        tags.push(`
          <span class="ganado-pending-tag tag-pesaje" style="background:${tagBg}; color:${tagColor}; border:1px solid ${tagBorder};" title="${timeDesc}${pesoDesc}">
            <span class="material-icons" style="font-size:13px; margin-right:4px; vertical-align:middle;">${icon}</span>${timeDesc}${pesoDesc}${isAtrasado ? ' · Requiere nuevo pesaje' : ''}
          </span>
        `);
      } else {
        // En cero: sin pesajes registrados
        tags.push(`
          <span class="ganado-pending-tag tag-pesaje-requerido" style="background:#fff3e0; color:#b45309; border:1px solid #fed7aa;" title="Sin pesajes registrados">
            <span class="material-icons" style="font-size:13px; margin-right:4px; vertical-align:middle;">warning</span>Debes realizar un pesaje de este animal
          </span>
        `);
      }
    }

    if (tags.length) {
      pendingTagsHtml = `<div class="ganado-pending-tags">${tags.join('')}</div>`;
    }
  }

  return `
    <div class="ganado-row ${isSold ? 'ganado-row-sold' : ''}" onclick="window.navigateTo('detalle_animal', '${a.id}')">
      <div class="ganado-row-img-container">
        <img src="${imageUrl}">
        ${isSold ? '<div class="ganado-row-badge sold"><span class="material-icons">payments</span></div>' : ''}
      </div>
      <div class="ganado-row-content">
        <div class="ganado-row-main-info">
          <div class="ganado-col-group">
            <p class="ganado-col-label"><span class="material-icons ganado-sex-icon ${a.sexo === 'Macho' ? 'macho' : 'hembra'}">${a.sexo === 'Macho' ? 'male' : 'female'}</span> ${(a.raza || 'BOVINO').toUpperCase()}</p>
            <p class="ganado-col-value">${a.nombre || 'Sin nombre'}</p>
            ${daysHtml}
            ${isSold ? '<p class="ganado-col-sold-tag">Vendido</p>' : ''}
            ${isPreñada ? '<p class="ganado-col-prenada-tag"><img src="/cow.png" style="width:14px; height:14px; object-fit:contain;"> Preñada</p>' : ''}
          </div>
          <div class="ganado-row-actions-box">
            <div class="ganado-row-weight-block">
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
        ${pendingTagsHtml}
      </div>
    </div>
  `;
}

export function initGanado() {

  // Split control (search + arrow) menu
  window.toggleGanadoSplitMenu = (e) => {
    if (e) e.stopPropagation();
    const menu = document.getElementById('ganado-split-menu');
    if (menu) menu.classList.toggle('open');
  };

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('ganado-split-menu');
    if (menu && !e.target.closest('.ganado-split-ctrl')) menu.classList.remove('open');
  });

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

  const updateCarouselCounts = async () => {
    try {
      const [vacRes, fumRes, activeRes, pesRes] = await Promise.all([
        supabase.from('animal_vacunas').select('id,fecha,nombre,estado,animal_id').range(0, 4999),
        supabase.from('animal_fumigaciones').select('id,fecha,producto,estado,animal_id').range(0, 4999),
        supabase.from('ganado').select('id').neq('estado', 'Vendido'),
        supabase.from('animal_pesajes').select('id,fecha,animal_id').range(0, 4999)
      ]);

      const activeAnimalIds = new Set((activeRes?.data || []).map(a => a.id));

      const deadVacIds = (vacRes?.data || []).filter(v => !activeAnimalIds.has(v.animal_id)).map(v => v.id).filter(Boolean);
      const deadFumIds = (fumRes?.data || []).filter(f => !activeAnimalIds.has(f.animal_id)).map(f => f.id).filter(Boolean);

      if (deadVacIds.length > 0) {
        const idsParam = deadVacIds.map(id => encodeURIComponent(id)).join(',');
        let vacUrl = `/rest/v1/animal_vacunas?id=in.(${idsParam})`;
        if (window._currentEmpresaId) vacUrl += `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`;
        restFetch(vacUrl, { method: 'DELETE' }).catch(() => []);
      }

      if (deadFumIds.length > 0) {
        const idsParam = deadFumIds.map(id => encodeURIComponent(id)).join(',');
        let fumUrl = `/rest/v1/animal_fumigaciones?id=in.(${idsParam})`;
        if (window._currentEmpresaId) fumUrl += `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`;
        restFetch(fumUrl, { method: 'DELETE' }).catch(() => []);
      }

      const vacAppliedGroups = new Map();
      const vacPendGroups = new Map();
      for (const v of (vacRes?.data || [])) {
        if (!activeAnimalIds.has(v.animal_id)) continue;
        const key = `${v.fecha || ''}\u0000${v.nombre || ''}`;
        if (v.estado === 'Aplicada') vacAppliedGroups.set(key, true);
        if (v.estado === 'Programada') vacPendGroups.set(key, true);
      }

      const fumigAppliedGroups = new Map();
      const fumigPendGroups = new Map();
      for (const f of (fumRes?.data || [])) {
        if (!activeAnimalIds.has(f.animal_id)) continue;
        const key = `${f.fecha || ''}\u0000${f.producto || ''}`;
        if (f.estado === 'Aplicada') fumigAppliedGroups.set(key, true);
        if (f.estado === 'Programada') fumigPendGroups.set(key, true);
      }

      const animalLatestPesajeMap = new Map();
      for (const p of (pesRes?.data || [])) {
        if (!activeAnimalIds.has(p.animal_id)) continue;
        const cur = animalLatestPesajeMap.get(p.animal_id);
        if (!cur || p.fecha > cur) {
          animalLatestPesajeMap.set(p.animal_id, p.fecha);
        }
      }
      const totalConPesaje = animalLatestPesajeMap.size;
      const hoyStr = getLocalToday();
      const todayTime = new Date(hoyStr + 'T00:00:00').getTime();

      let pesajesAtrasadosCount = 0;
      for (const animalId of activeAnimalIds) {
        const lastFecha = animalLatestPesajeMap.get(animalId);
        if (!lastFecha) {
          pesajesAtrasadosCount++;
        } else {
          const diff = Math.round((todayTime - new Date(lastFecha + 'T00:00:00').getTime()) / (1000 * 60 * 60 * 24));
          if (diff > 30) pesajesAtrasadosCount++;
        }
      }

      const vacCardVal = document.querySelector('#ganado-vacuna-card .ganado-carousel-value');
      if (vacCardVal) vacCardVal.textContent = String(vacAppliedGroups.size);
      const vacCardBadge = document.querySelector('#ganado-vacuna-card .ganado-carousel-badge');
      if (vacCardBadge) {
        if (vacPendGroups.size > 0) {
          vacCardBadge.className = 'ganado-carousel-badge amber';
          vacCardBadge.innerHTML = `<span class="material-icons" style="font-size:10px;">schedule</span>${vacPendGroups.size} pdt.`;
        } else {
          vacCardBadge.className = 'ganado-carousel-badge neutral';
          vacCardBadge.textContent = 'Aplicadas';
        }
      }

      const fumCardVal = document.querySelector('#ganado-fumig-card .ganado-carousel-value');
      if (fumCardVal) fumCardVal.textContent = String(fumigAppliedGroups.size);
      const fumCardBadge = document.querySelector('#ganado-fumig-card .ganado-carousel-badge');
      if (fumCardBadge) {
        if (fumigPendGroups.size > 0) {
          fumCardBadge.className = 'ganado-carousel-badge amber';
          fumCardBadge.innerHTML = `<span class="material-icons" style="font-size:10px;">schedule</span>${fumigPendGroups.size} pdt.`;
        } else {
          fumCardBadge.className = 'ganado-carousel-badge neutral';
          fumCardBadge.textContent = 'Aplicadas';
        }
      }

      const pesCardVal = document.querySelector('#ganado-pesaje-card .ganado-carousel-value');
      if (pesCardVal) pesCardVal.textContent = String(totalConPesaje);
      const pesCardBadge = document.querySelector('#ganado-pesaje-card .ganado-carousel-badge');
      if (pesCardBadge) {
        if (pesajesAtrasadosCount > 0) {
          pesCardBadge.className = 'ganado-carousel-badge amber';
          pesCardBadge.innerHTML = `<span class="material-icons" style="font-size:10px;">schedule</span>${pesajesAtrasadosCount} pdt.`;
        } else {
          pesCardBadge.className = 'ganado-carousel-badge neutral';
          pesCardBadge.textContent = 'Al día';
        }
      }
    } catch (e) {
      console.warn('Error en updateCarouselCounts:', e);
    }
  };
  updateCarouselCounts();

  // Filter cards logic - In-place without refresh or carousel scroll reset
  document.querySelectorAll('.ganado-card-filter').forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      const filter = card.dataset.filter;
      if (!filter) return;

      const nextFilter = (currentFilter === filter && filter !== 'all') ? 'all' : filter;
      currentFilter = nextFilter;

      // Update active cards in place
      document.querySelectorAll('.ganado-card-filter').forEach(c => {
        if (c.dataset.filter === currentFilter) {
          c.classList.add('active');
        } else {
          c.classList.remove('active');
        }
      });

      // Handle fumigación banner & panel visibility without reload
      const fumigWrapper = document.getElementById('ganado-fumig-wrapper');
      if (fumigWrapper) {
        fumigWrapper.style.display = currentFilter === 'fumigaciones' ? 'block' : 'none';
        if (currentFilter !== 'fumigaciones' && typeof closeFumigPanel === 'function') {
          closeFumigPanel();
        }
      }

      // Handle vacunación banner & panel visibility without reload
      const vacunaWrapper = document.getElementById('ganado-vacuna-wrapper');
      if (vacunaWrapper) {
        vacunaWrapper.style.display = currentFilter === 'vacunas' ? 'block' : 'none';
        if (currentFilter !== 'vacunas' && typeof closeVacunaPanel === 'function') {
          closeVacunaPanel();
        }
      }

      // Update list header title
      const titleEl = document.getElementById('ganado-list-title');
      if (titleEl) {
        titleEl.textContent = currentFilter === 'all' ? 'Inventario Ganadero' : currentFilter === 'pesajes' ? 'Control de Pesajes' : 'Resultados del Filtro';
      }

      // Refresh list in-place (no scroll reset, no page reload)
      window.changeGanadoPage(1);
      updateCarouselCounts();
    });
  });

  // Fumigación masiva banner & panel
  const fumigWrapper = document.getElementById('ganado-fumig-wrapper');
  const fumigToggleBtn = document.getElementById('ganado-fumig-toggle-btn');
  const fumigToggleText = document.getElementById('ganado-fumig-toggle-text');
  const fumigToggleIcon = document.getElementById('ganado-fumig-toggle-icon');
  const fumigPanel = document.getElementById('ganado-fumig-panel');
  const fumigFecha = document.getElementById('ganado-fumig-fecha');
  const fumigProducto = document.getElementById('ganado-fumig-producto');
  const targetCount = document.getElementById('ganado-fumig-target-count');
  const applyBtn = document.getElementById('ganado-fumig-apply');
  const cancelBtn = document.getElementById('ganado-fumig-cancel');
  const closeBtn = document.getElementById('ganado-fumig-close');

  if (fumigToggleBtn && fumigPanel) {
    fumigToggleBtn.addEventListener('click', () => {
      const isOpen = fumigPanel.style.display === 'block';
      fumigPanel.style.display = isOpen ? 'none' : 'block';
      if (fumigToggleText) fumigToggleText.textContent = isOpen ? 'Ver' : 'Ocultar';
      if (fumigToggleIcon) fumigToggleIcon.textContent = isOpen ? 'visibility' : 'visibility_off';
      if (!isOpen) {
        if (fumigFecha && !fumigFecha.value) fumigFecha.value = getLocalToday();
        if (typeof loadFumigRecords === 'function') loadFumigRecords();
      }
    });
  }

  const closeFumigPanel = () => {
    if (fumigPanel) fumigPanel.style.display = 'none';
    if (fumigToggleText) fumigToggleText.textContent = 'Ver';
    if (fumigToggleIcon) fumigToggleIcon.textContent = 'visibility';
  };
  const openFumigPanel = () => {
    if (fumigPanel) fumigPanel.style.display = 'block';
    if (fumigFecha && !fumigFecha.value) fumigFecha.value = getLocalToday();
    updateFumigApplyLabel();
  };

  const updateFumigApplyLabel = () => {
    if (!fumigFecha || !applyBtn) return;
    const fecha = fumigFecha.value || getLocalToday();
    const labelEl = document.getElementById('ganado-fumig-apply-label');
    if (labelEl) labelEl.textContent = fecha <= getLocalToday() ? 'Aplicar' : 'Programar';
  };
  if (fumigFecha) fumigFecha.addEventListener('change', updateFumigApplyLabel);
  updateFumigApplyLabel();

  const loadFumigRecords = async () => {
    const recordsBox = document.getElementById('ganado-fumig-records');
    if (!recordsBox) return;
    let groups = [];
    try {
      recordsBox.innerHTML = '<p style="color:#999; font-size:13px; text-align:center; padding:12px 0;">Cargando...</p>';
      const [{ data: recs, error }, { data: activeAnimals }] = await Promise.all([
        supabase.from('animal_fumigaciones').select('producto,fecha,estado,animal_id').order('fecha', { ascending: false }).range(0, 499),
        supabase.from('ganado').select('id').neq('estado', 'Vendido')
      ]);
      if (error) throw error;
      const activeAnimalIds = new Set((activeAnimals || []).map(a => a.id));
      const list = (recs || []).filter(r => activeAnimalIds.has(r.animal_id));
      if (!list.length) {
        recordsBox.innerHTML = '<p style="color:#999; font-size:13px; text-align:center; padding:12px 0;">Sin registros de fumigación.</p>';
        return;
      }
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
        const hoy = getLocalToday();
        const esHoy = g.fecha === hoy;
        const esPasada = g.fecha < hoy;
        let badgeColor, badgeBg, rowBg, rowBorder, estadoLabel;
        if (isAplicada) {
          badgeColor = '#2c666e'; badgeBg = '#e0f2f1'; rowBg = '#f4faf9'; rowBorder = '#2c666e'; estadoLabel = 'Aplicada';
        } else if (esHoy) {
          badgeColor = '#2e7d32'; badgeBg = '#e8f5e9'; rowBg = '#eafaf0'; rowBorder = '#2e7d32'; estadoLabel = 'Aplicar hoy';
        } else if (esPasada) {
          badgeColor = '#d32f2f'; badgeBg = '#ffebee'; rowBg = '#fff5f5'; rowBorder = '#d32f2f'; estadoLabel = 'Atrasada';
        } else {
          badgeColor = '#e65100'; badgeBg = '#fff3e0'; rowBg = '#fffaf3'; rowBorder = '#e65100'; estadoLabel = 'Programada';
        }
        const prodAttr = encodeURIComponent(g.producto);
        const fechaAttr = encodeURIComponent(g.fecha);
        const applyBtn = !isAplicada ? `
              <button class="fumig-apply-btn" data-producto="${prodAttr}" data-fecha="${fechaAttr}" title="Aplicar" style="background:none; border:none; cursor:pointer; color:#2c666e; display:flex; align-items:center; padding:4px;">
                <span class="material-icons" style="font-size:18px;">check_circle</span>
              </button>` : '';
        return `
          <div class="ganado-fumig-row" style="display:flex; align-items:center; gap:10px; padding:10px 8px; border-bottom:1px solid rgba(0,0,0,0.06); flex-wrap:wrap; background:${rowBg}; border-left:4px solid ${rowBorder}; border-radius:6px; margin:4px 0;">
            <span class="material-icons" style="font-size:20px; color:${badgeColor};">${isAplicada ? 'check_circle' : 'schedule'}</span>
            <div style="flex:1; min-width:140px;">
              <div style="font-size:14px; font-weight:600; color:var(--on-surface,#222);">${g.producto || '—'}</div>
              <div style="font-size:12px; color:#777;">${g.fecha || '—'} · <strong>${g.count}</strong> ${g.count === 1 ? 'animal' : 'animales'}</div>
            </div>
            <span style="background:${badgeBg}; color:${badgeColor}; border-radius:999px; padding:2px 8px; font-size:11px; font-weight:700;">${estadoLabel}</span>
            <div style="display:flex; gap:4px;">
              ${applyBtn}
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
    const applyAllBtn = document.getElementById('ganado-fumig-apply-all');
    if (applyAllBtn) {
      const pendingCount = (groups || []).filter(g => g.estado !== 'Aplicada').length;
      applyAllBtn.style.display = pendingCount > 0 ? 'inline-flex' : 'none';
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
        const [fumRes, activeRes] = await Promise.all([
          supabase.from('animal_fumigaciones').select('id,fecha,producto,estado,animal_id').range(0, 4999),
          supabase.from('ganado').select('id').neq('estado', 'Vendido')
        ]);
        const activeAnimalIds = new Set((activeRes?.data || []).map(a => a.id));
        const deadFumIds = (fumRes?.data || []).filter(f => !activeAnimalIds.has(f.animal_id)).map(f => f.id).filter(Boolean);
        if (deadFumIds.length > 0) {
          const idsParam = deadFumIds.map(id => encodeURIComponent(id)).join(',');
          let fumUrl = `/rest/v1/animal_fumigaciones?id=in.(${idsParam})`;
          if (window._currentEmpresaId) fumUrl += `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`;
          restFetch(fumUrl, { method: 'DELETE' }).catch(() => []);
        }
        const fumigAppliedGroups = new Map();
        const fumigPendGroups = new Map();
        for (const f of (fumRes?.data || [])) {
          if (!activeAnimalIds.has(f.animal_id)) continue;
          const key = `${f.fecha || ''}\u0000${f.producto || ''}`;
          if (f.estado === 'Aplicada') fumigAppliedGroups.set(key, true);
          if (f.estado === 'Programada') fumigPendGroups.set(key, true);
        }
        const cardVal = document.querySelector('#ganado-fumig-card .ganado-carousel-value');
        if (cardVal) cardVal.textContent = String(fumigAppliedGroups.size);
        const cardBadge = document.querySelector('#ganado-fumig-card .ganado-carousel-badge');
        if (cardBadge) {
          if (fumigPendGroups.size > 0) {
            cardBadge.className = 'ganado-carousel-badge amber';
            cardBadge.innerHTML = `<span class="material-icons" style="font-size:10px;">schedule</span>${fumigPendGroups.size} pdt.`;
          } else {
            cardBadge.className = 'ganado-carousel-badge neutral';
            cardBadge.textContent = 'Aplicadas';
          }
        }
        document.querySelectorAll('.fumig-veces-value').forEach(el => el.textContent = String(fumigAppliedGroups.size));
        document.querySelectorAll('.fumig-pend-chip').forEach(el => el.innerHTML = `<span class="material-icons" style="font-size:13px;">schedule</span> ${fumigPendGroups.size} pendientes`);
      })()
    ]);
  };

  const recordsBox = document.getElementById('ganado-fumig-records');
  if (recordsBox) {
    recordsBox.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.fumig-edit-btn');
      const delBtn = e.target.closest('.fumig-del-btn');
      const applyBtnRow = e.target.closest('.fumig-apply-btn');
      if (applyBtnRow) {
        const producto = decodeURIComponent(applyBtnRow.dataset.producto);
        const fecha = decodeURIComponent(applyBtnRow.dataset.fecha);
        const hoy = getLocalToday();
        if (fecha > hoy) {
          const fechaDia = fecha ? new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' }) : '';
          window.Snackbar.show(`No se puede aplicar aún: está programada para una fecha futura (${fechaDia}, ${fecha})`, { type: 'error' });
          return;
        }
        const fechaDiaNombre = fecha ? new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' }) : '';
        window.Snackbar.confirm(`¿Aplicar la fumigación "${producto}" (día ${fechaDiaNombre}) a todos los animales?`, async () => {
          try {
            let base = `/rest/v1/animal_fumigaciones?producto=eq.${encodeURIComponent(producto)}&fecha=eq.${encodeURIComponent(fecha)}&estado=eq.Programada`;
            if (window._currentEmpresaId) base += `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`;
            await restFetch(base, { method: 'PATCH', body: JSON.stringify({ estado: 'Aplicada' }) });
            window.Snackbar.show('Fumigación aplicada ✓');
            sendWhatsApp(`✅ Fumigación Aplicada\nProducto: ${producto}\nFecha: ${fecha} (día ${fechaDiaNombre})\nFinca: ${window._empresaNombre || ''}`);
            await refreshFumigAll();
          } catch (err) {
            window.Snackbar.show('Error: ' + (err.message || err), { type: 'error' });
          }
        }, { confirmLabel: 'Aplicar', cancelLabel: 'Cancelar' });
      } else if (editBtn && !editBtn.disabled) {
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

  const applyAllBtn = document.getElementById('ganado-fumig-apply-all');
  if (applyAllBtn) applyAllBtn.onclick = () => {
    const hoy = getLocalToday();
    window.Snackbar.confirm('¿Aplicar todas las fumigaciones pendientes (hoy y atrasadas)?', async () => {
      try {
        let base = `/rest/v1/animal_fumigaciones?estado=eq.Programada&fecha=lte.${hoy}`;
        if (window._currentEmpresaId) base += `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`;
        await restFetch(base, { method: 'PATCH', body: JSON.stringify({ estado: 'Aplicada' }) });
        window.Snackbar.show('Fumigaciones aplicadas ✓');
        sendWhatsApp(`✅ Fumigaciones aplicadas\nFecha: ${hoy}\nFinca: ${window._empresaNombre || ''}`);
        await refreshFumigAll();
      } catch (err) {
        window.Snackbar.show('Error: ' + (err.message || err), { type: 'error' });
      }
    }, { confirmLabel: 'Aplicar', cancelLabel: 'Cancelar' });
  };

  if (applyBtn) applyBtn.onclick = async () => {
    const fecha = fumigFecha ? fumigFecha.value : '';
    const producto = fumigProducto ? fumigProducto.value.trim() : '';
    if (!fecha) { window.Snackbar.show('Indicá la fecha de fumigación', { type: 'error' }); return; }
    if (!producto) { window.Snackbar.show('Indicá el producto a fumigar', { type: 'error' }); return; }
    const estado = fecha <= getLocalToday() ? 'Aplicada' : 'Programada';
    const diaNombre = fecha ? new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' }) : '';
    const estadoDesc = estado === 'Programada' ? `Programada para el día ${diaNombre}` : 'Aplicada para hoy';
    window.Snackbar.confirm(`¿Aplicar la fumigación "${producto}" (${estadoDesc}) a todos los animales activos?`, async () => {
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
        sendWhatsApp(
          estado === 'Programada'
            ? `🗓 Fumigación PROGRAMADA\nProducto: ${producto}\nDía: ${diaNombre} (${fecha})\nAnimales: ${rows.length}\nFinca: ${window._empresaNombre || ''}`
            : `✅ Fumigación Aplicada\nProducto: ${producto}\nFecha: ${fecha}\nAnimales: ${rows.length}\nFinca: ${window._empresaNombre || ''}`
        );
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

  // Vacunación masiva banner & panel
  const vacunaWrapper = document.getElementById('ganado-vacuna-wrapper');
  const vacunaToggleBtn = document.getElementById('ganado-vacuna-toggle-btn');
  const vacunaToggleText = document.getElementById('ganado-vacuna-toggle-text');
  const vacunaToggleIcon = document.getElementById('ganado-vacuna-toggle-icon');
  const vacunaPanel = document.getElementById('ganado-vacuna-panel');
  const vacunaFecha = document.getElementById('ganado-vacuna-fecha');
  const vacunaNombre = document.getElementById('ganado-vacuna-nombre');
  const vacunaDosis = document.getElementById('ganado-vacuna-dosis');
  const vacunaApplyBtn = document.getElementById('ganado-vacuna-apply');
  const vacunaCancelBtn = document.getElementById('ganado-vacuna-cancel');
  const vacunaCloseBtn = document.getElementById('ganado-vacuna-close');

  const closeVacunaPanel = () => {
    if (vacunaPanel) vacunaPanel.style.display = 'none';
    if (vacunaToggleText) vacunaToggleText.textContent = 'Ver';
    if (vacunaToggleIcon) vacunaToggleIcon.textContent = 'visibility';
  };

  const openVacunaPanel = () => {
    if (vacunaPanel) vacunaPanel.style.display = 'block';
    if (vacunaFecha && !vacunaFecha.value) vacunaFecha.value = getLocalToday();
    updateVacunaApplyLabel();
  };

  if (vacunaToggleBtn && vacunaPanel) {
    vacunaToggleBtn.addEventListener('click', () => {
      const isOpen = vacunaPanel.style.display === 'block';
      vacunaPanel.style.display = isOpen ? 'none' : 'block';
      if (vacunaToggleText) vacunaToggleText.textContent = isOpen ? 'Ver' : 'Ocultar';
      if (vacunaToggleIcon) vacunaToggleIcon.textContent = isOpen ? 'visibility' : 'visibility_off';
      if (!isOpen) {
        if (vacunaFecha && !vacunaFecha.value) vacunaFecha.value = getLocalToday();
        if (typeof loadVacunaRecords === 'function') loadVacunaRecords();
      }
    });
  }

  const updateVacunaApplyLabel = () => {
    if (!vacunaFecha || !vacunaApplyBtn) return;
    const fecha = vacunaFecha.value || getLocalToday();
    const labelEl = document.getElementById('ganado-vacuna-apply-label');
    if (labelEl) labelEl.textContent = fecha <= getLocalToday() ? 'Aplicar' : 'Programar';
  };
  if (vacunaFecha) vacunaFecha.addEventListener('change', updateVacunaApplyLabel);
  updateVacunaApplyLabel();

  const loadVacunaRecords = async () => {
    const recordsBox = document.getElementById('ganado-vacuna-records');
    if (!recordsBox) return;
    let groups = [];
    try {
      recordsBox.innerHTML = '<p style="color:#999; font-size:13px; text-align:center; padding:12px 0;">Cargando...</p>';
      const [{ data: recs, error }, { data: activeAnimals }] = await Promise.all([
        supabase.from('animal_vacunas').select('nombre,fecha,dosis,estado,animal_id').order('fecha', { ascending: false }).range(0, 499),
        supabase.from('ganado').select('id').neq('estado', 'Vendido')
      ]);
      if (error) throw error;
      const activeAnimalIds = new Set((activeAnimals || []).map(a => a.id));
      const list = (recs || []).filter(r => activeAnimalIds.has(r.animal_id));
      if (!list.length) {
        recordsBox.innerHTML = '<p style="color:#999; font-size:13px; text-align:center; padding:12px 0;">Sin registros de vacunación.</p>';
        return;
      }
      const groupMap = new Map();
      for (const r of list) {
        const key = `${r.nombre || ''}\u0000${r.fecha || ''}`;
        if (!groupMap.has(key)) {
          groupMap.set(key, { nombre: r.nombre || '', fecha: r.fecha || '', dosis: r.dosis || '', count: 0, estado: r.estado });
          groups.push(groupMap.get(key));
        }
        groupMap.get(key).count++;
      }

      recordsBox.innerHTML = groups.map(g => {
        const isAplicada = g.estado === 'Aplicada';
        const hoy = getLocalToday();
        const esHoy = g.fecha === hoy;
        const esPasada = g.fecha < hoy;
        let badgeColor, badgeBg, rowBg, rowBorder, estadoLabel;
        if (isAplicada) {
          badgeColor = '#2e7d32'; badgeBg = '#e8f5e9'; rowBg = '#f4faf5'; rowBorder = '#2e7d32'; estadoLabel = 'Aplicada';
        } else if (esHoy) {
          badgeColor = '#1b5e20'; badgeBg = '#c8e6c9'; rowBg = '#eafaf0'; rowBorder = '#1b5e20'; estadoLabel = 'Aplicar hoy';
        } else if (esPasada) {
          badgeColor = '#d32f2f'; badgeBg = '#ffebee'; rowBg = '#fff5f5'; rowBorder = '#d32f2f'; estadoLabel = 'Atrasada';
        } else {
          badgeColor = '#e65100'; badgeBg = '#fff3e0'; rowBg = '#fffaf3'; rowBorder = '#e65100'; estadoLabel = 'Programada';
        }
        const nomAttr = encodeURIComponent(g.nombre);
        const fechaAttr = encodeURIComponent(g.fecha);
        const dosisAttr = encodeURIComponent(g.dosis || '');
        const applyBtn = !isAplicada ? `
              <button class="vacuna-apply-btn" data-nombre="${nomAttr}" data-fecha="${fechaAttr}" title="Aplicar" style="background:none; border:none; cursor:pointer; color:#2e7d32; display:flex; align-items:center; padding:4px;">
                <span class="material-icons" style="font-size:18px;">check_circle</span>
              </button>` : '';
        return `
          <div class="ganado-vacuna-row" style="display:flex; align-items:center; gap:10px; padding:10px 8px; border-bottom:1px solid rgba(0,0,0,0.06); flex-wrap:wrap; background:${rowBg}; border-left:4px solid ${rowBorder}; border-radius:6px; margin:4px 0;">
            <span class="material-icons" style="font-size:20px; color:${badgeColor};">${isAplicada ? 'check_circle' : 'schedule'}</span>
            <div style="flex:1; min-width:140px;">
              <div style="font-size:14px; font-weight:600; color:var(--on-surface,#222);">
                ${g.nombre || '—'} ${g.dosis ? `<span style="font-size:12px; font-weight:400; color:#666;">(${g.dosis})</span>` : ''}
              </div>
              <div style="font-size:12px; color:#777;">${g.fecha || '—'} · <strong>${g.count}</strong> ${g.count === 1 ? 'animal' : 'animales'}</div>
            </div>
            <span style="background:${badgeBg}; color:${badgeColor}; border-radius:999px; padding:2px 8px; font-size:11px; font-weight:700;">${estadoLabel}</span>
            <div style="display:flex; gap:4px;">
              ${applyBtn}
              <button class="vacuna-edit-btn" data-nombre="${nomAttr}" data-fecha="${fechaAttr}" data-dosis="${dosisAttr}" title="Editar" style="background:none; border:none; cursor:pointer; color:#2e7d32; display:flex; align-items:center; padding:4px;">
                <span class="material-icons" style="font-size:18px;">edit</span>
              </button>
              <button class="vacuna-del-btn" data-nombre="${nomAttr}" data-fecha="${fechaAttr}" title="Eliminar" style="background:none; border:none; cursor:pointer; color:#d32f2f; display:flex; align-items:center; padding:4px;">
                <span class="material-icons" style="font-size:18px;">delete</span>
              </button>
            </div>
          </div>`;
      }).join('');
    } catch (err) {
      recordsBox.innerHTML = `<p style="color:#c62828; font-size:13px; text-align:center; padding:12px 0;">Error: ${err.message || err}</p>`;
    }
    const applyAllBtn = document.getElementById('ganado-vacuna-apply-all');
    if (applyAllBtn) {
      const pendingCount = (groups || []).filter(g => g.estado !== 'Aplicada').length;
      applyAllBtn.style.display = pendingCount > 0 ? 'inline-flex' : 'none';
    }
  };

  const renderVacunaEditForm = (nombre, fecha, dosis, rowEl) => {
    rowEl.innerHTML = `
      <div class="m3-field" style="min-width:140px; flex:1 1 160px;">
        <input type="text" id="vacuna-edit-nombre" value="${(nombre || '').replace(/"/g, '&quot;')}" placeholder=" " required>
        <label>Vacuna / Tratamiento</label>
      </div>
      <div class="m3-field" style="min-width:150px; flex:1 1 160px;">
        <input type="date" id="vacuna-edit-fecha" value="${fecha || ''}" placeholder=" " required>
        <label>Fecha</label>
      </div>
      <div class="m3-field" style="min-width:110px; flex:1 1 130px;">
        <input type="text" id="vacuna-edit-dosis" value="${(dosis || '').replace(/"/g, '&quot;')}" placeholder=" ">
        <label>Dosis</label>
      </div>
      <div style="display:flex; gap:6px;">
        <button type="button" class="vacuna-save-btn btn-m3-fill" style="background:#2e7d32; color:#fff; padding:8px 14px; font-size:13px;">Guardar</button>
        <button type="button" class="vacuna-cancel-btn btn-m3-text" style="padding:8px 12px; font-size:13px;">Cancelar</button>
      </div>`;
    rowEl.style.width = '100%';
    rowEl.style.flexWrap = 'wrap';
    const saveBtn = rowEl.querySelector('.vacuna-save-btn');
    const cancelBtnEdit = rowEl.querySelector('.vacuna-cancel-btn');
    const doSave = async () => {
      const nom = document.getElementById('vacuna-edit-nombre').value.trim();
      const fechaEdit = document.getElementById('vacuna-edit-fecha').value;
      const dosisEdit = document.getElementById('vacuna-edit-dosis').value.trim();
      if (!nom) { window.Snackbar.show('Indicá el nombre de la vacuna', { type: 'error' }); return; }
      if (!fechaEdit) { window.Snackbar.show('Indicá la fecha', { type: 'error' }); return; }
      const estado = fechaEdit <= getLocalToday() ? 'Aplicada' : 'Programada';
      let base = `/rest/v1/animal_vacunas?nombre=eq.${encodeURIComponent(nombre)}&fecha=eq.${encodeURIComponent(fecha)}`;
      if (window._currentEmpresaId) base += `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`;
      try {
        await restFetch(base, {
          method: 'PATCH',
          body: JSON.stringify({ nombre: nom, fecha: fechaEdit, dosis: dosisEdit || null, estado })
        });
        window.Snackbar.show('Vacunación actualizada ✓');
        await refreshVacunaAll();
      } catch (err) {
        window.Snackbar.show('Error: ' + (err.message || err), { type: 'error' });
      }
    };
    saveBtn.onclick = () => doSave();
    if (cancelBtnEdit) cancelBtnEdit.onclick = () => loadVacunaRecords();
  };

  const refreshVacunaAll = async () => {
    await Promise.all([
      loadVacunaRecords(),
      (async () => {
        const [vacRes, activeRes] = await Promise.all([
          supabase.from('animal_vacunas').select('id,fecha,nombre,estado,animal_id').range(0, 4999),
          supabase.from('ganado').select('id').neq('estado', 'Vendido')
        ]);
        const activeAnimalIds = new Set((activeRes?.data || []).map(a => a.id));
        const deadVacIds = (vacRes?.data || []).filter(v => !activeAnimalIds.has(v.animal_id)).map(v => v.id).filter(Boolean);
        if (deadVacIds.length > 0) {
          const idsParam = deadVacIds.map(id => encodeURIComponent(id)).join(',');
          let vacUrl = `/rest/v1/animal_vacunas?id=in.(${idsParam})`;
          if (window._currentEmpresaId) vacUrl += `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`;
          restFetch(vacUrl, { method: 'DELETE' }).catch(() => []);
        }
        const vacAppliedGroups = new Map();
        const vacPendGroups = new Map();
        for (const v of (vacRes?.data || [])) {
          if (!activeAnimalIds.has(v.animal_id)) continue;
          const key = `${v.fecha || ''}\u0000${v.nombre || ''}`;
          if (v.estado === 'Aplicada') vacAppliedGroups.set(key, true);
          if (v.estado === 'Programada') vacPendGroups.set(key, true);
        }
        const cardVal = document.querySelector('#ganado-vacuna-card .ganado-carousel-value');
        if (cardVal) cardVal.textContent = String(vacAppliedGroups.size);
        const cardBadge = document.querySelector('#ganado-vacuna-card .ganado-carousel-badge');
        if (cardBadge) {
          if (vacPendGroups.size > 0) {
            cardBadge.className = 'ganado-carousel-badge amber';
            cardBadge.innerHTML = `<span class="material-icons" style="font-size:10px;">schedule</span>${vacPendGroups.size} pdt.`;
          } else {
            cardBadge.className = 'ganado-carousel-badge neutral';
            cardBadge.textContent = 'Aplicadas';
          }
        }
      })(),
      window.changeGanadoPage(currentGanadoPage)
    ]);
  };

  const recordsBoxVacuna = document.getElementById('ganado-vacuna-records');
  if (recordsBoxVacuna) {
    recordsBoxVacuna.addEventListener('click', (e) => {
      const editBtn = e.target.closest('.vacuna-edit-btn');
      const delBtn = e.target.closest('.vacuna-del-btn');
      const applyBtnRow = e.target.closest('.vacuna-apply-btn');
      if (applyBtnRow) {
        const nombre = decodeURIComponent(applyBtnRow.dataset.nombre);
        const fecha = decodeURIComponent(applyBtnRow.dataset.fecha);
        const hoy = getLocalToday();
        if (fecha > hoy) {
          const fechaDia = fecha ? new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' }) : '';
          window.Snackbar.show(`No se puede aplicar aún: está programada para una fecha futura (${fechaDia}, ${fecha})`, { type: 'error' });
          return;
        }
        const fechaDiaNombre = fecha ? new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' }) : '';
        window.Snackbar.confirm(`¿Aplicar la vacuna "${nombre}" (día ${fechaDiaNombre}) a todos los animales?`, async () => {
          try {
            let base = `/rest/v1/animal_vacunas?nombre=eq.${encodeURIComponent(nombre)}&fecha=eq.${encodeURIComponent(fecha)}&estado=eq.Programada`;
            if (window._currentEmpresaId) base += `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`;
            await restFetch(base, { method: 'PATCH', body: JSON.stringify({ estado: 'Aplicada' }) });
            window.Snackbar.show('Vacunación aplicada ✓');
            sendWhatsApp(`✅ Vacunación Aplicada\nTratamiento: ${nombre}\nFecha: ${fecha} (día ${fechaDiaNombre})\nFinca: ${window._empresaNombre || ''}`);
            await refreshVacunaAll();
          } catch (err) {
            window.Snackbar.show('Error: ' + (err.message || err), { type: 'error' });
          }
        }, { confirmLabel: 'Aplicar', cancelLabel: 'Cancelar' });
      } else if (editBtn && !editBtn.disabled) {
        editBtn.disabled = true;
        renderVacunaEditForm(
          decodeURIComponent(editBtn.dataset.nombre),
          decodeURIComponent(editBtn.dataset.fecha),
          decodeURIComponent(editBtn.dataset.dosis || ''),
          editBtn.closest('.ganado-vacuna-row')
        );
      } else if (delBtn) {
        const nombre = decodeURIComponent(delBtn.dataset.nombre);
        const fecha = decodeURIComponent(delBtn.dataset.fecha);
        window.Snackbar.confirm(`¿Eliminar la vacunación "${nombre}" (${fecha})?`, async () => {
          try {
            let base = `/rest/v1/animal_vacunas?nombre=eq.${encodeURIComponent(nombre)}&fecha=eq.${encodeURIComponent(fecha)}`;
            if (window._currentEmpresaId) base += `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`;
            await restFetch(base, { method: 'DELETE' });
            window.Snackbar.show('Vacunación eliminada');
            await refreshVacunaAll();
          } catch (err) {
            window.Snackbar.show('Error: ' + (err.message || err), { type: 'error' });
          }
        }, { confirmLabel: 'Eliminar', cancelLabel: 'Cancelar' });
      }
    });
  }

  const vacunaRefreshBtn = document.getElementById('ganado-vacuna-refresh');
  if (vacunaRefreshBtn) vacunaRefreshBtn.onclick = () => loadVacunaRecords();

  const vacunaApplyAllBtn = document.getElementById('ganado-vacuna-apply-all');
  if (vacunaApplyAllBtn) vacunaApplyAllBtn.onclick = () => {
    const hoy = getLocalToday();
    window.Snackbar.confirm('¿Aplicar todas las vacunas pendientes (hoy y atrasadas)?', async () => {
      try {
        let base = `/rest/v1/animal_vacunas?estado=eq.Programada&fecha=lte.${hoy}`;
        if (window._currentEmpresaId) base += `&empresa_id=eq.${encodeURIComponent(window._currentEmpresaId)}`;
        await restFetch(base, { method: 'PATCH', body: JSON.stringify({ estado: 'Aplicada' }) });
        window.Snackbar.show('Vacunas aplicadas ✓');
        sendWhatsApp(`✅ Vacunas aplicadas\nFecha: ${hoy}\nFinca: ${window._empresaNombre || ''}`);
        await refreshVacunaAll();
      } catch (err) {
        window.Snackbar.show('Error: ' + (err.message || err), { type: 'error' });
      }
    }, { confirmLabel: 'Aplicar', cancelLabel: 'Cancelar' });
  };

  if (vacunaApplyBtn) vacunaApplyBtn.onclick = async () => {
    const fecha = vacunaFecha ? vacunaFecha.value : '';
    const nombre = vacunaNombre ? vacunaNombre.value.trim() : '';
    const dosis = vacunaDosis ? vacunaDosis.value.trim() : '';
    if (!fecha) { window.Snackbar.show('Indicá la fecha de vacunación', { type: 'error' }); return; }
    if (!nombre) { window.Snackbar.show('Indicá el nombre de la vacuna o tratamiento', { type: 'error' }); return; }
    const estado = fecha <= getLocalToday() ? 'Aplicada' : 'Programada';
    const diaNombre = fecha ? new Date(fecha + 'T00:00:00').toLocaleDateString('es-ES', { weekday: 'long' }) : '';
    const estadoDesc = estado === 'Programada' ? `Programada para el día ${diaNombre}` : 'Aplicada para hoy';
    window.Snackbar.confirm(`¿Aplicar la vacuna "${nombre}" (${estadoDesc}) a todos los animales activos?`, async () => {
      try {
        const { data: animals } = await supabase.from('ganado').select('id').neq('estado', 'Vendido');
        const ids = (animals || []).map(a => a.id);
        if (!ids.length) { window.Snackbar.show('No hay animales activos', { type: 'error' }); return; }
        const rows = ids.map(id => ({ animal_id: id, nombre, fecha, dosis: dosis || null, estado }));
        const chunkSize = 100;
        for (let i = 0; i < rows.length; i += chunkSize) {
          const { error } = await supabase.from('animal_vacunas').insert(rows.slice(i, i + chunkSize));
          if (error) throw error;
        }
        window.Snackbar.show(`Vacunación ${estado.toLowerCase()} para ${rows.length} animales ✓`);
        sendWhatsApp(
          estado === 'Programada'
            ? `🗓 Vacunación PROGRAMADA\nTratamiento: ${nombre}${dosis ? ` (${dosis})` : ''}\nDía: ${diaNombre} (${fecha})\nAnimales: ${rows.length}\nFinca: ${window._empresaNombre || ''}`
            : `✅ Vacunación Aplicada\nTratamiento: ${nombre}${dosis ? ` (${dosis})` : ''}\nFecha: ${fecha}\nAnimales: ${rows.length}\nFinca: ${window._empresaNombre || ''}`
        );
        if (vacunaFecha) vacunaFecha.value = getLocalToday();
        if (vacunaNombre) vacunaNombre.value = '';
        if (vacunaDosis) vacunaDosis.value = '';
        await refreshVacunaAll();
      } catch (err) {
        window.Snackbar.show('Error: ' + (err.message || err), { type: 'error' });
      }
    });
  };
  if (vacunaCancelBtn) vacunaCancelBtn.onclick = closeVacunaPanel;
  if (vacunaCloseBtn) vacunaCloseBtn.onclick = closeVacunaPanel;

  // Search logic
  const searchToggle = document.getElementById('ganado-search-toggle');
  const searchWrapper = document.getElementById('ganado-search-wrapper');
  const searchInput = document.getElementById('ganado-search-input');
  const searchClear = document.getElementById('ganado-search-clear');

  if (searchToggle && searchInput && searchWrapper && searchClear) {
    searchToggle.addEventListener('click', () => {
      if (!searchWrapper.classList.contains('expanded') || !searchInput.style.width || searchInput.style.width === '0px') {
        searchInput.style.width = '160px';
        searchInput.style.opacity = '1';
        searchInput.style.padding = '0 8px 0 0';
        searchClear.style.display = 'flex';
        searchWrapper.classList.add('expanded');
        searchInput.focus();
      } else {
        searchInput.focus();
      }
    });

    searchClear.addEventListener('click', () => {
      currentSearchQuery = '';
      searchInput.value = '';
      searchInput.style.width = '0px';
      searchInput.style.opacity = '0';
      searchInput.style.padding = '0';
      searchClear.style.display = 'none';
      searchWrapper.classList.remove('expanded');
      window.changeGanadoPage(1);
    });

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      const val = e.target.value;
      searchClear.style.display = val ? 'flex' : 'none';
      clearTimeout(searchTimeout);
      currentSearchQuery = val;
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
