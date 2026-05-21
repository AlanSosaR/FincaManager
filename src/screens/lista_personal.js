import { supabase } from '../supabase.js';

function getInitiales(nombre) {
  return nombre.split(' ').map(p => p[0]).join('').toUpperCase().slice(0, 2);
}

function getColor(seed) {
  const colors = ['var(--m3-primary)', 'var(--m3-tertiary)', '#7b4f9e', '#c75b39', '#2e7d32', '#1565c0', '#6a1b9a'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export async function renderListaPersonal() {
  try {
    const { data: personal, error } = await supabase
      .from('personal')
      .select('*')
      .order('nombre', { ascending: true });

    if (error) throw error;

    return `
      <style>
        .lp-list {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        .lp-card {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 18px 24px;
          background: var(--m3-surface-container-low);
          border-radius: 20px;
          cursor: pointer;
          transition: background 0.2s, transform 0.15s;
        }
        .lp-card:hover {
          background: var(--m3-surface-container-highest);
          transform: translateX(4px);
        }
        .lp-avatar {
          width: 52px;
          height: 52px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: 800;
          font-size: 20px;
          flex-shrink: 0;
        }
        @media (max-width: 768px) {
          .lp-card { padding: 14px 16px; }
        }
      </style>
      <div class="m3-pt-6 m3-pb-24 m3-p-4 m3-max-w-3xl m3-mx-auto m3-font-work-sans">
        <section class="m3-mb-6">
          <div class="m3-flex m3-items-center m3-justify-between m3-gap-4 m3-flex-wrap">
            <div>
              <h1 class="m3-display-medium m3-font-extrabold m3-text-on-surface m3-tracking-tight m3-font-manrope">Personal</h1>
              <p class="m3-label-medium m3-text-on-surface-variant">${(personal || []).length} trabajadores registrados</p>
            </div>
            <div style="width: 48px;"></div>
          </div>
        </section>

        <div class="lp-list">
          ${(personal || []).length > 0 ? personal.map(p => `
            <div class="lp-card" onclick="window.navigateTo('detalle_personal', '${p.id}', 'lista_personal')">
              <div class="m3-flex m3-items-center" style="gap: 16px;">
                <div class="lp-avatar" style="background: ${getColor(p.nombre)}; color: white;">${p.iniciales || getInitiales(p.nombre)}</div>
                <div>
                  <p class="m3-label-large m3-font-bold m3-text-on-surface">${p.nombre}</p>
                  <div class="m3-flex m3-items-center m3-gap-3 m3-mt-1">
                    ${p.rol ? `<span class="m3-label-small m3-text-on-surface-variant">${p.rol}</span>` : ''}
                    ${p.pago_diario ? `<span class="m3-label-small m3-font-bold m3-text-primary">L${Number(p.pago_diario).toLocaleString('es-HN')}/día</span>` : ''}
                  </div>
                </div>
              </div>
              <span class="material-symbols-outlined m3-text-outline-variant" style="font-size: 20px;">chevron_right</span>
            </div>
          `).join('') : `
            <div class="m3-p-8 m3-text-center" style="background: var(--m3-surface-container-low); border-radius: 24px;">
              <span class="material-symbols-outlined" style="font-size: 48px; display: block; margin-bottom: 12px; opacity: 0.3;">groups</span>
              <p class="m3-title-medium m3-font-bold m3-text-on-surface-variant m3-mt-4">No hay personal registrado</p>
              <p class="m3-label-medium m3-text-on-surface-variant">Agrega tu primer trabajador</p>
              <button onclick="window.navigateTo('nuevo_personal', 'lista_personal')" class="m3-mt-4 m3-text-primary m3-font-bold m3-bg-none m3-border-none" style="text-decoration: underline; cursor: pointer;">
                + Agregar Personal
              </button>
            </div>
          `}
        </div>
      </div>

      <button onclick="window.navigateTo('nuevo_personal', 'personal')" class="m3-fab-circle" style="position: fixed; bottom: 24px; right: 24px; z-index: 999; width: 56px; height: 56px; border-radius: 16px; background: var(--m3-primary); border: none; box-shadow: 0 4px 16px rgba(62,111,57,0.4); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='scale(1.08)'; this.style.boxShadow='0 6px 20px rgba(62,111,57,0.5)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 16px rgba(62,111,57,0.4)';" aria-label="Agregar personal">
        <span class="material-symbols-outlined" style="font-size: 28px; color: var(--m3-on-primary);">add</span>
      </button>
    `;
  } catch (err) {
    console.error('Error in renderListaPersonal:', err);
    return `<div style="padding: 24px; color: red;">Error: ${err.message}</div>`;
  }
}

export function initListaPersonal() {
}
