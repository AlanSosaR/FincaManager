import { supabase } from '../supabase.js';

export async function renderDashboard() {
  console.log('Rendering Dashboard...');
  try {
    const [
      { count: potrerosCount },
      { count: ganadoCount },
      { data: motores, error: motoresError },
      { count: herramientasCount },
      { data: vacunasData },
      { data: fumigacionesData }
    ] = await Promise.all([
      supabase.from('potreros').select('*', { count: 'exact', head: true }),
      supabase.from('ganado').select('*', { count: 'exact', head: true }),
      supabase.from('motores').select('*'),
      supabase.from('herramientas').select('*', { count: 'exact', head: true }),
      supabase.from('animal_vacunas').select('*, ganado(nombre)').eq('estado', 'Programada').order('fecha', { ascending: true }).limit(5),
      supabase.from('animal_fumigaciones').select('*, ganado(nombre)').eq('estado', 'Programada').order('fecha', { ascending: true }).limit(5)
    ]);

    const vacunasPendientes = (vacunasData || []).map(v => ({ ...v, tipo: 'Vacuna', animalNombre: v.ganado?.nombre || 'Animal' }));
    const fumigacionesPendientes = (fumigacionesData || []).map(f => ({ ...f, tipo: 'Fumigaci├│n', animalNombre: f.ganado?.nombre || 'Animal' }));
    const todasLasTareas = [...vacunasPendientes, ...fumigacionesPendientes].sort((a, b) => new Date(a.fecha) - new Date(b.fecha)).slice(0, 5);

    const vacunasPendientesCount = vacunasPendientes.length;
    const fumigacionesPendientesCount = fumigacionesPendientes.length;

    const motoresUrgentes = (motores || []).filter(eq => (eq.horas || 0) >= (eq.max_horas || 100));
    const motoresCount = (motores || []).length;

    if (motoresUrgentes.length > 0) {
      setTimeout(() => {
        if (window.Snackbar && window.Snackbar.confirm) {
          window.Snackbar.confirm(
            `<strong>Mantenimiento pendiente:</strong> ${motoresUrgentes.length} motores requieren cambio de aceite.`,
            () => window.navigateTo('detalle_motor', motoresUrgentes[0].id),
            null,
            { confirmText: 'REVISAR', type: 'error', persist: true }
          );
        }
      }, 800);
    }

    return `
      <div class="pt-6 pb-24 lg:pl-0 pr-6 min-h-screen font-['Work_Sans']">
        <!-- Header & Summary Card -->
        <section class="mb-10">
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-6">
        <div>
        <span class="text-primary font-bold tracking-widest text-xs uppercase">Dashboard de Cultivos</span>
        <h1 class="text-4xl md:text-5xl font-extrabold text-on-surface tracking-tight mt-1 font-['Manrope']">Gesti├│n del Cafetal</h1>
        </div>
        <div class="relative group max-w-md w-full">
        <div class="absolute inset-0 bg-primary opacity-5 rounded-3xl -rotate-1 scale-105 group-hover:rotate-0 transition-transform duration-300"></div>
        <div class="relative bg-surface-container-lowest p-6 rounded-3xl shadow-sm flex items-center gap-5">
        <div class="bg-primary-container w-16 h-16 rounded-2xl flex items-center justify-center text-primary">
        <span class="material-symbols-outlined text-3xl" style="font-variation-settings: &quot;FILL&quot; 1;">eco</span>
        </div>
        <div>
        <p class="text-sm text-on-surface-variant font-medium">Estado General</p>
        <h3 class="text-xl font-bold text-on-surface">Floraci├│n Activa</h3>
        <div class="flex items-center gap-2 mt-1">
        <span class="w-2 h-2 rounded-full bg-primary animate-pulse"></span>
        <span class="text-xs text-primary font-semibold">Salud ├ôptima - 94%</span>
        </div>
        </div>
        </div>
        </div>
        </div>
        </section>
        <div class="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <!-- Left Column: Lotes Grid -->
        <div class="lg:col-span-3 space-y-8">
        <div>
        <div class="flex items-center justify-between mb-6">
        <h2 class="text-2xl font-bold text-on-surface">Lotes &amp; Microlotes</h2><span class="ml-4 px-3 py-1 bg-primary-container text-on-primary-container text-xs font-bold rounded-full">Total: 24,850 plantas</span>
        <button class="text-primary font-semibold text-sm flex items-center gap-1 hover:underline">
                                    Ver todos los lotes <span class="material-symbols-outlined text-sm">arrow_forward</span>
        </button>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
        <!-- Card 1 -->
        <div class="bg-surface-container-lowest p-6 rounded-lg transition-all hover:bg-surface-bright group">
        <div class="flex justify-between items-start mb-4">
        <span class="bg-tertiary-container text-on-tertiary-container px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Premium Geisha</span>
        <button class="text-outline hover:text-primary transition-colors">
        <span class="material-symbols-outlined">more_vert</span>
        </button>
        </div>
        <h3 class="text-xl font-bold mb-1 group-hover:text-primary transition-colors">La Cumbre</h3>
        <div class="flex gap-4 text-xs text-on-surface-variant mb-6">
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-base">filter_vintage</span> Geisha</span>
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-base">potted_plant</span> 1,250 plantas</span>
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-base">square_foot</span> 2.5 ha</span>
        </div>
        <div class="space-y-2">
        <div class="flex justify-between text-xs font-semibold">
        <span class="">Salud &amp; Nutrici├│n</span>
        <span class="text-primary">88%</span>
        </div>
        <div class="w-full h-3 bg-surface-container-highest rounded-full overflow-hidden">
        <div class="h-full bg-primary rounded-full shadow-[inset_0px_0px_4px_rgba(255,255,255,0.4)]" style="width: 88%"></div>
        </div>
        </div>
        </div>
        <!-- Card 2 -->
        <div class="bg-surface-container-lowest p-6 rounded-lg transition-all hover:bg-surface-bright group">
        <div class="flex justify-between items-start mb-4">
        <span class="bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Alta Productividad</span>
        <button class="text-outline hover:text-primary transition-colors">
        <span class="material-symbols-outlined">more_vert</span>
        </button>
        </div>
        <h3 class="text-xl font-bold mb-1 group-hover:text-primary transition-colors">El Mirador</h3>
        <div class="flex gap-4 text-xs text-on-surface-variant mb-6">
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-base">filter_vintage</span> Caturra Rojo</span>
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-base">potted_plant</span> 3,400 plantas</span>
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-base">square_foot</span> 5.2 ha</span>
        </div>
        <div class="space-y-2">
        <div class="flex justify-between text-xs font-semibold">
        <span class="">Salud &amp; Nutrici├│n</span>
        <span class="text-primary">72%</span>
        </div>
        <div class="w-full h-3 bg-surface-container-highest rounded-full overflow-hidden">
        <div class="h-full bg-primary rounded-full shadow-[inset_0px_0px_4px_rgba(255,255,255,0.4)]" style="width: 72%"></div>
        </div>
        </div>
        </div>
        <!-- Card 3 -->
        <div class="bg-surface-container-lowest p-6 rounded-lg transition-all hover:bg-surface-bright group">
        <div class="flex justify-between items-start mb-4">
        <span class="bg-primary-container text-on-primary-container px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">Resistente</span>
        <button class="text-outline hover:text-primary transition-colors">
        <span class="material-symbols-outlined">more_vert</span>
        </button>
        </div>
        <h3 class="text-xl font-bold mb-1 group-hover:text-primary transition-colors">Valle Central</h3>
        <div class="flex gap-4 text-xs text-on-surface-variant mb-6">
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-base">filter_vintage</span> Castillo</span>
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-base">potted_plant</span> 2,100 plantas</span>
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-base">square_foot</span> 4.0 ha</span>
        </div>
        <div class="space-y-2">
        <div class="flex justify-between text-xs font-semibold">
        <span class="">Salud &amp; Nutrici├│n</span>
        <span class="text-primary">95%</span>
        </div>
        <div class="w-full h-3 bg-surface-container-highest rounded-full overflow-hidden">
        <div class="h-full bg-primary rounded-full shadow-[inset_0px_0px_4px_rgba(255,255,255,0.4)]" style="width: 95%"></div>
        </div>
        </div>
        </div>
        <!-- Card 4: Action Card -->
        
        </div>
        </div>
        <!-- Aplicaciones Recientes Section -->
        <div>
        <h2 class="text-2xl font-bold text-on-surface mb-6">Aplicaciones Recientes</h2>
        <div class="bg-surface-container-lowest rounded-lg overflow-hidden shadow-sm">
        <table class="w-full text-left border-collapse">
        <thead>
        <tr class="bg-surface-container-high text-on-surface-variant text-xs font-bold uppercase tracking-wider">
        <th class="px-6 py-4">Tipo &amp; Producto</th>
        <th class="px-6 py-4">Dosis</th>
        <th class="px-6 py-4">Lote / Fecha</th>
        <th class="px-6 py-4 text-right">Operador</th>
        </tr>
        </thead>
        <tbody class="divide-y divide-surface-container">
        <tr class="hover:bg-surface-container-low transition-colors">
        <td class="px-6 py-4">
        <div class="flex items-center gap-3">
        <div class="bg-secondary-container/30 text-secondary p-2 rounded-xl">
        <span class="material-symbols-outlined text-sm">science</span>
        </div>
        <div>
        <p class="font-bold text-sm">Fertilizante NPK</p>
        <p class="text-xs text-on-surface-variant">NutriPlant Max</p>
        </div>
        </div>
        </td>
        <td class="px-6 py-4 text-sm font-medium">150g / Planta</td>
        <td class="px-6 py-4">
        <p class="text-sm font-bold">La Cumbre</p>
        <p class="text-xs text-on-surface-variant">12 Oct 2023</p>
        </td>
        <td class="px-6 py-4 text-right">
        <div class="flex items-center justify-end gap-2">
        <span class="text-xs font-semibold">Carlos Ruiz</span>
        <div class="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">CR</div>
        </div>
        </td>
        </tr>
        <tr class="hover:bg-surface-container-low transition-colors">
        <td class="px-6 py-4">
        <div class="flex items-center gap-3">
        <div class="bg-tertiary-container/30 text-tertiary p-2 rounded-xl">
        <span class="material-symbols-outlined text-sm">pest_control</span>
        </div>
        <div>
        <p class="font-bold text-sm">Fungicida Org├ínico</p>
        <p class="text-xs text-on-surface-variant">BioShield XL</p>
        </div>
        </div>
        </td>
        <td class="px-6 py-4 text-sm font-medium">2L / Bomba</td>
        <td class="px-6 py-4">
        <p class="text-sm font-bold">El Mirador</p>
        <p class="text-xs text-on-surface-variant">09 Oct 2023</p>
        </td>
        <td class="px-6 py-4 text-right">
        <div class="flex items-center justify-end gap-2">
        <span class="text-xs font-semibold">Ana Mendez</span>
        <div class="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center text-[10px] font-bold text-primary">AM</div>
        </div>
        </td>
        </tr>
        </tbody>
        </table>
        </div>
        </div>
        </div>
        <!-- Right Column: Stats & Insights -->
        <aside class="lg:col-span-1 space-y-8">
        <!-- Total Plants Card -->
        
        <!-- Variety Distribution -->
        
        <!-- Inventory Status -->
        
        </aside>
        </div>
        
        <button class="fixed bottom-24 right-6 lg:bottom-10 lg:right-10 z-50 flex items-center gap-3 bg-[#3E6F39] text-[#ffffff] px-6 py-4 rounded-3xl shadow-xl hover:shadow-2xl hover:scale-105 active:scale-95 transition-all duration-300 group">
          <span class="material-symbols-outlined text-2xl" style="font-variation-settings: &quot;FILL&quot; 1;">add_location</span>
          <span class="font-['Manrope'] font-bold tracking-tight">Agregar Lote</span>
        </button>
      </div>
    `;
  } catch (err) {
    console.error('Error in renderDashboard:', err);
    return `<div style="padding: 24px; color: red;">Error cargando dashboard: ${err.message}</div>`;
  }
}
