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
        .lp-card-right {
          display: flex;
          align-items: center;
          gap: 4px;
          position: relative;
        }
        .lp-btn-more {
          background: none;
          border: none;
          cursor: pointer;
          padding: 6px;
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          color: var(--m3-outline-variant);
          transition: background 0.2s;
        }
        .lp-btn-more:hover {
          background: rgba(0,0,0,0.05);
        }
        .action-menu {
          position: absolute;
          top: 100%;
          right: 0;
          z-index: 100;
          background: var(--m3-surface-container-high, #fff);
          border-radius: 16px;
          box-shadow: 0 4px 20px rgba(0,0,0,0.15);
          padding: 6px;
          min-width: 160px;
          display: none;
          overflow: hidden;
        }
        .action-menu.active {
          display: block;
        }
        .action-item {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 10px 14px;
          border: none;
          background: none;
          cursor: pointer;
          font-family: 'Work Sans', sans-serif;
          font-size: 13px;
          font-weight: 600;
          color: var(--m3-on-surface);
          width: 100%;
          text-align: left;
          border-radius: 12px;
          transition: background 0.15s;
        }
        .action-item:hover {
          background: var(--m3-surface-container-highest, rgba(0,0,0,0.05));
        }
        .action-item.delete {
          color: var(--m3-error, #b3261e);
        }
        .action-item .material-icons {
          font-size: 20px;
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
              <div class="lp-card" onclick="window.navigateTo('detalle_personal', '${p.id}', 'personal')">
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
                <div class="lp-card-right">
                  <button class="lp-btn-more" onclick="event.stopPropagation(); window.toggleActionMenu(this)" aria-label="Más opciones">
                    <span class="material-icons">more_vert</span>
                  </button>
                  <div class="action-menu">
                    <button class="action-item" onclick="event.stopPropagation(); window.navigateTo('nuevo_personal', '${p.id}', 'personal')">
                      <span class="material-icons">edit</span><span>Editar</span>
                    </button>
                    <button class="action-item delete" onclick="event.stopPropagation(); window.confirmDeletePersonal('${p.id}', '${p.nombre.replace(/'/g, "\\'")}')">
                      <span class="material-icons">delete</span><span>Eliminar</span>
                    </button>
                  </div>
                </div>
              </div>
          `).join('') : `
            <div class="m3-p-8 m3-text-center" style="background: var(--m3-surface-container-low); border-radius: 24px;">
              <span class="material-symbols-outlined" style="font-size: 48px; display: block; margin-bottom: 12px; opacity: 0.3;">groups</span>
              <p class="m3-title-medium m3-font-bold m3-text-on-surface-variant m3-mt-4">No hay personal registrado</p>
              <p class="m3-label-medium m3-text-on-surface-variant">Agrega tu primer trabajador</p>
              <button onclick="window.navigateTo('nuevo_personal', null, 'personal')" class="m3-mt-4 m3-text-primary m3-font-bold m3-bg-none m3-border-none" style="text-decoration: underline; cursor: pointer;">
                + Agregar Personal
              </button>
            </div>
          `}
        </div>
      </div>

      <button onclick="window.navigateTo('nuevo_personal', null, 'personal')" class="m3-fab-circle" style="position: fixed; bottom: 24px; right: 24px; z-index: 999; width: 56px; height: 56px; border-radius: 16px; background: var(--m3-primary); border: none; box-shadow: 0 4px 16px rgba(62,111,57,0.4); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: transform 0.2s, box-shadow 0.2s;" onmouseover="this.style.transform='scale(1.08)'; this.style.boxShadow='0 6px 20px rgba(62,111,57,0.5)';" onmouseout="this.style.transform='scale(1)'; this.style.boxShadow='0 4px 16px rgba(62,111,57,0.4)';" aria-label="Agregar personal">
        <span class="material-symbols-outlined" style="font-size: 28px; color: var(--m3-on-primary);">add</span>
      </button>
    `;
  } catch (err) {
    console.error('Error in renderListaPersonal:', err);
    return `<div style="padding: 24px; color: red;">Error: ${err.message}</div>`;
  }
}

export function initListaPersonal() {
  window.toggleActionMenu = (btn) => {
    const menu = btn.nextElementSibling;
    if (!menu) return;
    const isActive = menu.classList.contains('active');
    document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    if (!isActive) menu.classList.add('active');
  };

  window.confirmDeletePersonal = (id, name) => {
    window.Snackbar.confirm(`¿Eliminar a ${name}?`, async () => {
      const { error } = await supabase.from('personal').delete().eq('id', id);
      if (error) {
        window.Snackbar.show('Error: ' + error.message, { type: 'error' });
      } else {
        window.Snackbar.show('Personal eliminado');
        window.clearScreenCache?.('personal');
        window.navigateTo('personal');
      }
    });
  };

  document.addEventListener('click', (e) => {
    if (!e.target.closest('.action-menu') && !e.target.closest('.lp-btn-more')) {
      document.querySelectorAll('.action-menu.active').forEach(m => m.classList.remove('active'));
    }
  });
}
