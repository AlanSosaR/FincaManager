import { supabase } from '../supabase.js';

export async function renderGanado() {
  const { data: animales, error } = await supabase
    .from('ganado')
    .select('*')
    .order('created_at', { ascending: true });

  if (error) {
    console.error('Error fetching ganado:', error);
    return `<div class="screen-ganado"><p>Error cargando datos: ${error.message}</p></div>`;
  }

  const totalAnimales = animales.length;
  const hembras = animales.filter(a => a.sexo && a.sexo.toLowerCase() === 'hembra').length;
  const machos = animales.filter(a => a.sexo && a.sexo.toLowerCase() === 'macho').length;
  const pesajePendiente = animales.filter(a => !a.peso_actual || a.peso_actual == 0).length;

  const hembrasPercent = totalAnimales > 0 ? (hembras / totalAnimales) * 100 : 0;
  const machosPercent = totalAnimales > 0 ? (machos / totalAnimales) * 100 : 0;

  return `
    <div class="px-2 lg:px-6 pt-4 pb-24 lg:pb-12 bg-surface font-body text-on-surface min-h-full">
      <!-- Top Summary Cards (M3 Style) -->
      <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-12">
        <div class="p-8 bg-primary-container rounded-xl flex flex-col justify-between h-48 border-none">
          <div class="flex justify-between items-start">
            <span class="material-symbols-outlined text-emerald-900/60 text-3xl" style="font-variation-settings: 'FILL' 1;">pets</span>
            <span class="text-xs font-bold uppercase tracking-widest text-emerald-900/60">Total Animales</span>
          </div>
          <div>
            <h3 class="text-5xl font-extrabold font-headline text-emerald-900 tracking-tighter">${totalAnimales}</h3>
            <p class="text-sm font-medium text-emerald-900/70 mt-1">Registrados</p>
          </div>
        </div>

        <div class="p-8 bg-surface-container-high rounded-xl flex flex-col justify-between h-48">
          <div class="flex justify-between items-start">
            <span class="material-symbols-outlined text-on-surface text-3xl">female</span>
            <span class="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Hembras</span>
          </div>
          <div>
            <h3 class="text-5xl font-extrabold font-headline text-on-surface tracking-tighter">${hembras}</h3>
            <div class="w-full h-2 bg-outline-variant/20 rounded-full mt-4">
              <div class="h-full bg-emerald-600 rounded-full" style="width: ${hembrasPercent}%"></div>
            </div>
          </div>
        </div>

        <div class="p-8 bg-surface-container-high rounded-xl flex flex-col justify-between h-48">
          <div class="flex justify-between items-start">
            <span class="material-symbols-outlined text-on-surface text-3xl">male</span>
            <span class="text-xs font-bold uppercase tracking-widest text-on-surface-variant">Machos</span>
          </div>
          <div>
            <h3 class="text-5xl font-extrabold font-headline text-on-surface tracking-tighter">${machos}</h3>
            <div class="w-full h-2 bg-outline-variant/20 rounded-full mt-4">
              <div class="h-full bg-secondary rounded-full" style="width: ${machosPercent}%"></div>
            </div>
          </div>
        </div>

        <div class="p-8 bg-tertiary-container rounded-xl flex flex-col justify-between h-48">
          <div class="flex justify-between items-start">
            <span class="material-symbols-outlined text-on-tertiary-container text-3xl">scale</span>
            <span class="text-xs font-bold uppercase tracking-widest text-on-tertiary-container/60">Pesaje Pendiente</span>
          </div>
          <div>
            <h3 class="text-5xl font-extrabold font-headline text-on-tertiary-container tracking-tighter">${pesajePendiente}</h3>
            <p class="text-sm font-bold text-on-tertiary-container mt-1 underline">Acción requerida</p>
          </div>
        </div>
      </section>

      <!-- Main Content Area: Asymmetric Layout -->
      <div class="grid grid-cols-1 xl:grid-cols-3 gap-12">
        <!-- Animal List (Bento-inspired cards) -->
        <div class="xl:col-span-2 space-y-6">
          <div class="flex justify-between items-end mb-4 px-2">
            <h4 class="text-xl font-bold font-headline text-on-surface">Entradas Recientes</h4>
            <button class="text-sm font-bold text-emerald-700 flex items-center gap-1 hover:bg-emerald-50 px-3 py-1.5 rounded-full transition-colors">
              Ver Filtrados <span class="material-symbols-outlined text-[18px]">filter_list</span>
            </button>
          </div>
          
          <div class="grid gap-4">
            ${animales.map(a => {
              const statusVacunas = a.total_vacunas > 0 ? 'AL DÍA' : 'PENDIENTE';
              const isAlDia = statusVacunas === 'AL DÍA';
              
              const statusBg = isAlDia ? 'bg-primary-container' : 'bg-tertiary-container';
              const statusText = isAlDia ? 'text-on-primary-container' : 'text-on-tertiary-container';
              const statusIcon = isAlDia ? 'vaccines' : 'priority_high';
              const statusIconColorBg = isAlDia ? 'bg-emerald-500' : 'bg-tertiary';
              
              const randomImageSeed = a.id || a.nombre;
              const imageUrl = `https://api.dicebear.com/7.x/shapes/svg?seed=${randomImageSeed}&backgroundColor=f1ede6`;

              return `
                <div class="group bg-surface-container-low hover:bg-surface-container cursor-pointer transition-all p-3 pr-6 rounded-[2rem] flex flex-col sm:flex-row items-start sm:items-center gap-6" onclick="window.navigateTo('detalle_animal', '${a.id}')">
                  <div class="relative flex-shrink-0">
                    <img class="w-16 h-16 rounded-2xl object-cover bg-surface-variant" src="${imageUrl}" alt="${a.nombre}" />
                    <div class="absolute -bottom-1 -right-1 w-6 h-6 ${statusIconColorBg} rounded-full border-4 border-surface-container-low flex items-center justify-center">
                      <span class="material-symbols-outlined text-[10px] text-white" style="font-variation-settings: 'FILL' 1;">${statusIcon}</span>
                    </div>
                  </div>
                  
                  <div class="flex-1 w-full grid grid-cols-2 md:grid-cols-4 gap-4 items-center">
                    <div>
                      <p class="text-xs text-on-surface-variant font-bold uppercase tracking-wider">#${a.id.substring(0,4)} — ${a.nombre}</p>
                      <p class="text-sm font-bold text-on-surface">${a.raza || 'Bovino'}</p>
                    </div>
                    
                    <div>
                      <p class="text-xs text-on-surface-variant font-bold uppercase tracking-wider">Peso</p>
                      <p class="text-sm font-bold text-on-surface">${a.peso_actual || '0'} kg</p>
                    </div>
                    
                    <div class="hidden md:block">
                      <p class="text-xs text-on-surface-variant font-bold uppercase tracking-wider mb-1">Estado</p>
                      <div class="flex items-center gap-1.5 px-3 py-1 ${statusBg} ${statusText} rounded-full w-fit">
                        <span class="material-symbols-outlined text-[16px]" style="font-variation-settings: 'FILL' 1;">${statusIcon}</span>
                        <span class="text-[10px] font-bold uppercase">${statusVacunas}</span>
                      </div>
                    </div>
                    
                    <div class="text-right hidden sm:flex justify-end">
                      <button class="p-2 text-on-surface-variant hover:text-emerald-700 hover:bg-emerald-50 rounded-full transition-colors flex items-center justify-center" onclick="event.stopPropagation(); window.navigateTo('detalle_animal', '${a.id}')">
                        <span class="material-symbols-outlined">more_vert</span>
                      </button>
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
            
            ${animales.length === 0 ? `
              <div class="p-8 text-center bg-surface-container-low rounded-lg">
                <span class="material-symbols-outlined text-4xl text-on-surface-variant opacity-50 mb-2">pets</span>
                <p class="text-on-surface-variant font-medium">No hay animales registrados en el inventario.</p>
              </div>
            ` : ''}
          </div>

          ${animales.length > 5 ? `
          <button class="w-full mt-2 py-3.5 text-sm font-bold text-emerald-700 border-2 border-dashed border-emerald-700/30 rounded-full hover:bg-emerald-50 hover:border-emerald-700/50 transition-all">
              Cargar más registros
          </button>
          ` : ''}
        </div>
      </div>

      <!-- Floating Action Button -->
      <button id="btn-add-animal" class="fixed bottom-8 right-8 z-50 flex items-center gap-3 px-8 py-5 bg-gradient-to-br from-primary to-primary-dim text-white rounded-xl shadow-[0px_20px_40px_-10px_rgba(62,111,57,0.4)] glass-effect hover:scale-105 active:scale-95 transition-all duration-300">
        <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">add</span>
        <span class="font-headline font-bold text-sm">Registrar animal</span>
      </button>
    </div>
  `;
}
