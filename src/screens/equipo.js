import { getEmpresaMembers, getEmpresaInvitations, inviteUser, revokeInvitation, getUser, getAccessToken, updateMemberRole, removeMember, sendRecoveryEmail, SUPABASE_URL, SUPABASE_KEY } from '../auth.js';




let currentEquipoSearchQuery = '';
let allEquipoMembers = [];
let _equipoCurrentUserId = null;

function filterEquipoMembers() {
  if (!currentEquipoSearchQuery) return allEquipoMembers;
  const q = currentEquipoSearchQuery.toLowerCase();
  return allEquipoMembers.filter(m =>
    (m.nombre || m.email || '').toLowerCase().includes(q) ||
    (m.email || '').toLowerCase().includes(q)
  );
}

function refreshEquipoMembers() {
  const container = document.getElementById('members-list');
  if (!container) return;
  container.innerHTML = filterEquipoMembers().map(m => renderMemberRow(m, _equipoCurrentUserId)).join('');
}

export async function renderEquipo() {
  const empresaId = window._currentEmpresaId;
  if (!empresaId) return '<div style="padding:24px;">Selecciona una empresa primero.</div>';

  const [members, invitations] = await Promise.all([
    getEmpresaMembers(empresaId),
    getEmpresaInvitations(empresaId),
  ]);

  allEquipoMembers = members;
  const currentUserId = await getUser().then(u => u?.id || null);
  _equipoCurrentUserId = currentUserId;
  const visibleMembers = filterEquipoMembers();

  return `
    <div class="m3-card-filled" style="margin-bottom:80px;">
      <!-- Search (green split control, sin menú) -->
      <div class="equipo-top-search-container" style="display:flex;justify-content:flex-end;margin:16px 0 8px;">
        <div class="ganado-split-ctrl expanded" id="equipo-search-wrapper" style="background:#edf1ed; border:1px solid rgba(45,62,44,0.16);">
          <button id="equipo-search-toggle" class="m3-icon-btn-tonal" style="margin:0;box-shadow:none;width:38px;height:38px;display:flex;align-items:center;justify-content:center;background:transparent;border:none;cursor:pointer;" title="Buscar">
            <span class="material-icons" style="color:#435b47;font-size:20px;">search</span>
          </button>
          <input type="text" id="equipo-search-input" placeholder="Buscar por nombre..." value="${currentEquipoSearchQuery}" style="border:none;background:transparent;outline:none;font-size:14px;color:#1e3e2b;padding:0 8px;flex:1;min-width:0;">
          <button id="equipo-search-clear" style="background:none;border:none;cursor:pointer;display:${currentEquipoSearchQuery?'flex':'none'};align-items:center;justify-content:center;padding:0 8px;color:#435b47;height:100%;" title="Limpiar búsqueda">
            <span class="material-icons" style="font-size:18px;">close</span>
          </button>
          <span class="ganado-split-ctrl-sep" style="width:1px;height:22px;background:rgba(45,62,44,0.18);align-self:center;"></span>
          <button class="ganado-split-ctrl-reg" onclick="window.toggleEquipoSplitMenu(event)" title="Más opciones" style="width:38px;height:38px;display:flex;align-items:center;justify-content:center;background:#e2e8e2;border:none;cursor:pointer;border-radius:0 9px 9px 0;">
            <span class="material-icons" style="color:#1e3e2b;font-size:20px;">arrow_drop_down</span>
          </button>
          <div class="ganado-split-menu" id="equipo-split-menu">
            <button class="ganado-split-item" onclick="window.toggleInviteInline(); document.getElementById('equipo-split-menu')?.classList.remove('open');">
              <span class="material-icons">person_add</span><span>Invitar miembro</span>
            </button>
          </div>
        </div>
      </div>
      

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 class="m3-title-medium m3-font-bold" style="color:#2d3e2c;">Miembros</h3>
      </div>

      <div id="members-list">
        ${visibleMembers.map(m => renderMemberRow(m, currentUserId)).join('')}
      </div>

      <div id="invite-inline-container" style="margin-top:16px;"></div>

      ${invitations.length > 0 ? `
        <div style="margin-top:24px;padding-top:24px;border-top:1px solid #eee;">
          <h4 class="m3-body-medium m3-font-bold" style="color:#888;margin-bottom:12px;">Invitaciones pendientes</h4>
          ${invitations.map(inv => `
            <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:var(--m3-surface-container-low);border-radius:12px;margin-bottom:8px;">
              <div>
                <div style="font-weight:600;font-size:14px;color:#2d3e2c;">${inv.email}</div>
                <div style="font-size:12px;color:#888;">${inv.rol} · Pendiente</div>
              </div>
              <button class="btn-revoke-invitation" data-id="${inv.id}" style="background:transparent;color:#ff4103;border:1px solid #ff4103;padding:6px 14px;border-radius:12px;font-size:12px;font-weight:600;cursor:pointer;">Revocar</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
    </div>
  `;
}


function getSuspendedUserIds(empresaId) {
  if (!empresaId) return [];
  try {
    return JSON.parse(localStorage.getItem('suspended_members_' + empresaId) || '[]');
  } catch { return []; }
}

function setMemberSuspended(empresaId, userId, suspend) {
  if (!empresaId || !userId) return;
  let list = getSuspendedUserIds(empresaId);
  if (suspend) {
    if (!list.includes(userId)) list.push(userId);
  } else {
    list = list.filter(id => id !== userId);
  }
  localStorage.setItem('suspended_members_' + empresaId, JSON.stringify(list));
  try {
    restFetch(`/rest/v1/usuario_empresas?empresa_id=eq.${encodeURIComponent(empresaId)}&usuario_id=eq.${encodeURIComponent(userId)}`, {
      method: 'PATCH',
      body: JSON.stringify({ activo: !suspend })
    }).catch(() => {});
  } catch {}
}

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, m => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[m]));
}

function openMemberBottomSheet(m) {
  let scrim = document.getElementById('m3-action-sheet-scrim');
  let sheet = document.getElementById('m3-action-sheet');

  if (!scrim) {
    scrim = document.createElement('div');
    scrim.id = 'm3-action-sheet-scrim';
    scrim.className = 'm3-action-sheet-scrim';
    scrim.onclick = () => window.closeActionBottomSheet?.();
    document.body.appendChild(scrim);
  }

  if (!sheet) {
    sheet = document.createElement('div');
    sheet.id = 'm3-action-sheet';
    sheet.className = 'm3-action-sheet';
    sheet.setAttribute('role', 'dialog');
    sheet.setAttribute('aria-modal', 'true');
    document.body.appendChild(sheet);
  }

  const isSelf = m.id === _equipoCurrentUserId;
  const isSuspended = getSuspendedUserIds(window._currentEmpresaId).includes(m.id);
  const nextRol = m.rol === 'admin' ? 'visitante' : 'admin';

  sheet.innerHTML = `
    <button type="button" class="m3-action-sheet-close-btn" id="sheet-btn-close" aria-label="Cerrar">
      <span class="material-icons">close</span>
    </button>
    <div class="m3-action-sheet-handle-box">
      <div class="m3-action-sheet-handle"></div>
    </div>
    <div class="m3-action-sheet-header">
      <div style="display:flex;align-items:center;gap:12px;margin-bottom:8px;">
        <div style="width:44px;height:44px;border-radius:50%;background:rgba(45,62,44,0.1);display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span class="material-icons" style="font-size:24px;color:#2d3e2c;">person</span>
        </div>
        <div style="min-width:0;flex:1;">
          <div class="m3-action-sheet-title" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#1e3e2b;">${escapeHtml(m.nombre || m.email)}${isSelf ? ' (tú)' : ''}</div>
          <div style="font-size:13px;color:#556b53;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(m.email)}</div>
        </div>
      </div>
    </div>
    <div class="m3-action-sheet-list">
      <button type="button" class="m3-action-sheet-item" id="sheet-btn-recover">
        <span class="material-icons">lock_reset</span>
        <span>Enviar enlace de recuperación</span>
      </button>

      ${!isSelf ? `
        <div class="m3-action-sheet-switch-row" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-radius:14px;background:#f2f4f2;margin:8px 0;border:1px solid rgba(45,62,44,0.08);">
          <div style="display:flex;align-items:center;gap:12px;">
            <span class="material-icons" style="color:${!isSuspended ? '#2d3e2c' : '#777'};font-size:22px;">${!isSuspended ? 'check_circle' : 'block'}</span>
            <div>
              <div style="font-weight:700;font-size:14px;color:#1e3e2b;">Acceso a la cuenta</div>
              <div style="font-size:12px;color:#556b53;font-weight:500;">${!isSuspended ? 'Acceso activo' : 'Acceso desactivado'}</div>
            </div>
          </div>
          <label class="m3-switch" style="position:relative;display:inline-block;width:50px;height:30px;cursor:pointer;margin:0;flex-shrink:0;">
            <input type="checkbox" id="sheet-btn-toggle-active" ${!isSuspended ? 'checked' : ''} style="opacity:0;width:0;height:0;position:absolute;">
            <span class="m3-switch-track" style="position:absolute;inset:0;background:${!isSuspended ? '#2d3e2c' : '#c5c9c5'};border-radius:30px;transition:all 0.25s cubic-bezier(0.2,0,0,1);">
              <span class="m3-switch-thumb" style="position:absolute;height:22px;width:22px;left:${!isSuspended ? '24px' : '4px'};bottom:4px;background:#ffffff;border-radius:50%;transition:all 0.25s cubic-bezier(0.2,0,0,1);box-shadow:0 2px 4px rgba(0,0,0,0.25);"></span>
            </span>
          </label>
        </div>

        <div class="m3-action-sheet-switch-row" style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-radius:14px;background:#f2f4f2;margin:8px 0;border:1px solid rgba(45,62,44,0.08);">
          <div style="display:flex;align-items:center;gap:12px;">
            <span class="material-icons" style="color:${m.rol === 'admin' ? '#1565c0' : '#777'};font-size:22px;">manage_accounts</span>
            <div>
              <div style="font-weight:700;font-size:14px;color:#1e3e2b;">Rol Administrador</div>
              <div style="font-size:12px;color:#556b53;font-weight:500;">${m.rol === 'admin' ? 'Acceso de administrador' : 'Acceso de visitante'}</div>
            </div>
          </div>
          <label class="m3-switch" style="position:relative;display:inline-block;width:50px;height:30px;cursor:pointer;margin:0;flex-shrink:0;">
            <input type="checkbox" id="sheet-btn-change-role" ${m.rol === 'admin' ? 'checked' : ''} style="opacity:0;width:0;height:0;position:absolute;">
            <span class="m3-switch-track" style="position:absolute;inset:0;background:${m.rol === 'admin' ? '#1565c0' : '#c5c9c5'};border-radius:30px;transition:all 0.25s cubic-bezier(0.2,0,0,1);">
              <span class="m3-switch-thumb" style="position:absolute;height:22px;width:22px;left:${m.rol === 'admin' ? '24px' : '4px'};bottom:4px;background:#ffffff;border-radius:50%;transition:all 0.25s cubic-bezier(0.2,0,0,1);box-shadow:0 2px 4px rgba(0,0,0,0.25);"></span>
            </span>
          </label>
        </div>

        <button type="button" class="m3-action-sheet-item delete" id="sheet-btn-delete-member">
          <span class="material-icons">person_remove</span>
          <span>Eliminar miembro</span>
        </button>
      ` : ''}
    </div>
  `;

  document.getElementById('sheet-btn-recover')?.addEventListener('click', async () => {
    window.closeActionBottomSheet?.();
    try {
      await sendRecoveryEmail(m.email);
      window.Snackbar?.show('Enlace de recuperación enviado a ' + m.email);
    } catch (err) {
      window.Snackbar?.show('Error al enviar enlace: ' + err.message, { type: 'error' });
    }
  });

  document.getElementById('sheet-btn-toggle-active')?.addEventListener('change', (e) => {
    const willSuspend = !e.target.checked;
    const actionTxt = willSuspend ? 'desactivar' : 'activar';
    window.Snackbar?.confirm(`¿Seguro que deseas ${actionTxt} el acceso a ${m.nombre || m.email}?`, () => {
      setMemberSuspended(window._currentEmpresaId, m.id, willSuspend);
      window.closeActionBottomSheet?.();
      window.Snackbar?.show(`Acceso ${willSuspend ? 'desactivado' : 'activado'}`);
      refreshEquipoMembers();
    }, () => {
      e.target.checked = !willSuspend;
    });
  });

  document.getElementById('sheet-btn-change-role')?.addEventListener('change', (e) => {
    const newRol = e.target.checked ? 'admin' : 'visitante';
    window.Snackbar?.confirm(`¿Cambiar el rol de ${m.nombre || m.email} a ${newRol}?`, async () => {
      window.closeActionBottomSheet?.();
      try {
        await updateMemberRole(window._currentEmpresaId, m.id, newRol);
        window.Snackbar?.show(`Rol actualizado a ${newRol} ✓`);
        allEquipoMembers = await getEmpresaMembers(window._currentEmpresaId);
        refreshEquipoMembers();
      } catch (err) {
        window.Snackbar?.show('Error al cambiar rol: ' + err.message, { type: 'error' });
      }
    }, () => {
      e.target.checked = !e.target.checked;
    });
  });

  document.getElementById('sheet-btn-delete-member')?.addEventListener('click', () => {
    window.closeActionBottomSheet?.();
    const btn = document.querySelector(`.btn-member-menu[data-userid="${m.id}"]`);
    if (btn) handleRemoveMember(btn);
  });

  document.getElementById('sheet-btn-close')?.addEventListener('click', () => {
    window.closeActionBottomSheet?.();
  });

  scrim.style.display = 'block';
  sheet.style.display = 'block';
  sheet.style.transform = '';

  requestAnimationFrame(() => {
    scrim.classList.add('open');
    sheet.classList.add('open');
  });
}

function renderMemberRow(m, currentUserId) {
  const isSelf = m.id === currentUserId;
  const isSuspended = getSuspendedUserIds(window._currentEmpresaId).includes(m.id);
  const roleColors = { propietario: '#2d3e2c', admin: '#1565c0', visitante: '#888' };
  return `
    <div class="member-row" data-userid="${m.id}" data-email="${m.email}" data-nombre="${(m.nombre || m.email).replace(/"/g,'&quot;')}" data-rol="${m.rol}" style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--m3-surface-container-low);border-radius:12px;margin-bottom:8px;cursor:pointer;position:relative;">
      <div style="display:flex;align-items:center;gap:12px;min-width:0;">
        <div style="width:36px;height:36px;border-radius:50%;background:#2d3e2c;display:flex;align-items:center;justify-content:center;flex-shrink:0;">
          <span class="material-icons" style="font-size:18px;color:white;">person</span>
        </div>
        <div style="min-width:0;">
          <div style="font-weight:600;font-size:14px;color:#2d3e2c;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${m.nombre || m.email}${isSelf ? ' (tú)' : ''}</div>
          <div style="font-size:12px;color:#888;">${m.email}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
        ${isSuspended ? '<span class="m3-badge" style="background:#c62828;color:white;padding:3px 8px;border-radius:10px;font-size:11px;font-weight:700;">Inactivo</span>' : ''}
        <span class="m3-badge" style="background:${roleColors[m.rol] || '#888'};color:white;padding:4px 12px;border-radius:12px;font-size:12px;font-weight:600;">${m.rol}</span>
        ${!isSelf && !m._isReadonly ? `
          <div class="member-actions" style="position:relative;">
            <button class="btn-member-menu" data-userid="${m.id}" data-rol="${m.rol}" data-nombre="${(m.nombre || m.email).replace(/"/g,'&quot;')}" style="background:transparent;border:none;cursor:pointer;padding:4px;border-radius:50%;color:#666;">
              <span class="material-icons" style="font-size:20px;">more_vert</span>
            </button>
            <div class="member-menu-dropdown" style="display:none;position:absolute;right:0;top:100%;background:white;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.15);z-index:100;min-width:200px;padding:8px 0;margin-top:4px;">
              <button class="menu-option-role" style="display:flex;align-items:center;gap:12px;width:100%;padding:12px 16px;border:none;background:transparent;cursor:pointer;font-size:13px;color:#2d3e2c;text-align:left;font-family:'Work Sans',sans-serif;" onmouseover="this.style.background='#f5f5f5'" onmouseout="this.style.background='transparent'">
                <span class="material-icons" style="font-size:18px;color:#1565c0;">manage_accounts</span>
                <span>Cambiar rol a <strong>${m.rol === 'admin' ? 'visitante' : 'admin'}</strong></span>
              </button>
              <button class="menu-option-remove" style="display:flex;align-items:center;gap:12px;width:100%;padding:12px 16px;border:none;background:transparent;cursor:pointer;font-size:13px;color:#ff4103;text-align:left;font-family:'Work Sans',sans-serif;" onmouseover="this.style.background='#fff5f5'" onmouseout="this.style.background='transparent'">
                <span class="material-icons" style="font-size:18px;">person_remove</span>
                <span>Eliminar miembro</span>
              </button>
            </div>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

export function initEquipo() {
  // Search logic (sin menú registrar)
  const searchToggle  = document.getElementById('equipo-search-toggle');
  const searchWrapper = document.getElementById('equipo-search-wrapper');
  const searchInput   = document.getElementById('equipo-search-input');
  const searchClear   = document.getElementById('equipo-search-clear');

  if (searchToggle && searchInput && searchWrapper && searchClear) {
    searchToggle.addEventListener('click', () => {
      searchInput.focus();
    });

    searchClear.addEventListener('click', () => {
      currentEquipoSearchQuery = '';
      searchInput.value = '';
      searchClear.style.display = 'none';
      refreshEquipoMembers();
    });

    let searchTimeout;
    searchInput.addEventListener('input', (e) => {
      clearTimeout(searchTimeout);
      currentEquipoSearchQuery = e.target.value;
      searchTimeout = setTimeout(() => {
        refreshEquipoMembers();
      }, 500);
    });
  }

  // Split control (search + arrow) menu
  window.toggleEquipoSplitMenu = (e) => {
    if (e) e.stopPropagation();
    const menu = document.getElementById('equipo-split-menu');
    if (menu) menu.classList.toggle('open');
  };
  window.toggleInviteInline = toggleInviteInline;

  document.addEventListener('click', (e) => {
    const menu = document.getElementById('equipo-split-menu');
    if (menu && !e.target.closest('.ganado-split-ctrl')) menu.classList.remove('open');
  });

  document.querySelectorAll('.btn-revoke-invitation').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      try {
        await revokeInvitation(id);
        btn.closest('div[style*="display:flex"]')?.remove();
        window.Snackbar.show('Invitación eliminada');
      } catch (e) {
        window.Snackbar.show('Error: ' + e.message, { type: 'error' });
      }
    });
  });

  // Member menu (event delegation, robusto ante re-renders y caché de HTML)
  if (!window._memberMenuHandler) {
    window._memberMenuHandler = true;
    document.addEventListener('click', (e) => {
      const option = e.target.closest('.menu-option-role, .menu-option-remove');
      if (option) {
        e.stopPropagation();
        const dropdown = option.closest('.member-menu-dropdown');
        const btn = dropdown?.parentElement.querySelector('.btn-member-menu');
        if (!btn) return;
        dropdown.style.display = 'none';
        if (option.classList.contains('menu-option-role')) {
          handleMemberRoleChange(btn);
        } else {
          handleRemoveMember(btn);
        }
        return;
      }

      // On mobile (<= 768px): open Bottom Sheet on member row or 3-dots button
      const isMobile = window.matchMedia('(max-width: 768px)').matches;
      const memberRow = e.target.closest('.member-row');
      const btnMore = e.target.closest('.btn-member-menu');

      if (isMobile && (btnMore || memberRow)) {
        e.stopPropagation();
        const targetRow = btnMore ? btnMore.closest('.member-row') : memberRow;
        if (targetRow) {
          const userId = targetRow.dataset.userid;
          const member = allEquipoMembers.find(m => m.id === userId) || {
            id: userId,
            email: targetRow.dataset.email,
            nombre: targetRow.dataset.nombre,
            rol: targetRow.dataset.rol
          };
          openMemberBottomSheet(member);
          return;
        }
      }

      // On desktop (> 768px): open dropdown menu as currently is
      const btn = e.target.closest('.btn-member-menu');
      if (btn) {
        e.stopPropagation();
        const dropdown = btn.parentElement.querySelector('.member-menu-dropdown');
        if (!dropdown) return;
        const isOpen = dropdown.style.display === 'block';
        document.querySelectorAll('.member-menu-dropdown').forEach(d => d.style.display = 'none');
        dropdown.style.display = isOpen ? 'none' : 'block';
        return;
      }
      document.querySelectorAll('.member-menu-dropdown').forEach(d => d.style.display = 'none');
    });
  }
}

async function handleMemberRoleChange(btn) {
  const dropdown = btn.parentElement.querySelector('.member-menu-dropdown');
  const userId = btn.dataset.userid;
  const currentRol = btn.dataset.rol;
  const nombre = btn.dataset.nombre;
  const newRol = currentRol === 'admin' ? 'visitante' : 'admin';
  if (!confirm(`¿Cambiar rol de ${nombre} a "${newRol}"?`)) return;
  try {
    await updateMemberRole(window._currentEmpresaId, userId, newRol);
    btn.dataset.rol = newRol;
    const badge = btn.closest('div[style*="display:flex"]')?.querySelector('.m3-badge');
    if (badge) {
      const roleColors = { propietario: '#2d3e2c', admin: '#1565c0', visitante: '#888' };
      badge.textContent = newRol;
      badge.style.background = roleColors[newRol] || '#888';
    }
    const label = dropdown?.querySelector('.menu-option-role span:last-child');
    if (label) label.innerHTML = `Cambiar rol a <strong>${newRol === 'admin' ? 'visitante' : 'admin'}</strong>`;
    window.Snackbar.show(`Rol cambiado a "${newRol}"`);
  } catch (e) {
    window.Snackbar.show('Error: ' + e.message, { type: 'error' });
  }
}

async function handleRemoveMember(btn) {
  const userId = btn.dataset.userid;
  const nombre = btn.dataset.nombre;
  if (!confirm(`¿Eliminar a ${nombre} de la empresa?`)) return;
  try {
    await removeMember(window._currentEmpresaId, userId);
    btn.closest('div[style*="display:flex"]')?.remove();
    window.Snackbar.show('Miembro eliminado');
  } catch (e) {
    window.Snackbar.show('Error: ' + e.message, { type: 'error' });
  }
}

let _inviteInlineVisible = false;

function toggleInviteInline() {
  const container = document.getElementById('invite-inline-container');
  if (!container) return;
  if (_inviteInlineVisible) {
    container.innerHTML = '';
    _inviteInlineVisible = false;
    return;
  }
  _inviteInlineVisible = true;
  renderInviteForm(container);
}

function renderInviteForm(container) {
  const empresaId = window._currentEmpresaId;
  container.innerHTML = `
    <div style="padding:20px;background:#f9fbf9;border-radius:12px;border:1px solid #e0e8e0;">
      <h4 style="font-size:14px;font-weight:700;color:#2d3e2c;margin:0 0 16px;">Nuevo miembro</h4>
      <form id="invite-form">
        <div class="m3-field" style="margin-bottom:16px;">
          <input type="email" id="invite-email" placeholder=" " required>
          <label>Correo electrónico</label>
        </div>
        <div style="margin-bottom:16px;">
          <label style="display:block;font-size:13px;font-weight:600;color:#666;margin-bottom:6px;">Tipo de acceso</label>
          <select id="invite-rol" style="width:100%;padding:12px;border:1px solid #ccc;border-radius:12px;font-family:'Work Sans',sans-serif;font-size:14px;background:white;">
            <option value="admin">Administrador</option>
            <option value="visitante" selected>Visitante</option>
          </select>
        </div>
        <div style="display:flex;gap:12px;">
          <button type="button" id="invite-cancel-inline" style="flex:1;padding:12px;border-radius:12px;background:transparent;border:1px solid #ccc;color:#666;font-weight:600;cursor:pointer;">Cancelar</button>
          <button type="submit" id="invite-submit" style="flex:1;padding:12px;border-radius:12px;background:#2d3e2c;color:white;border:none;font-weight:700;cursor:pointer;">Invitar</button>
        </div>
      </form>
      <div id="invite-result" style="display:none;margin-top:16px;padding:16px;background:#eaf5ea;border-radius:12px;border:1px solid #c8e6c9;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span class="material-icons" style="color:#2d3e2c;font-size:20px;">check_circle</span>
          <span style="font-weight:700;font-size:14px;color:#2d3e2c;">Invitación creada</span>
        </div>
        <p style="font-size:12px;color:#555;margin-bottom:12px;line-height:1.4;">Comparte este enlace con la persona que quieres invitar.</p>
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <input type="text" id="invite-link" readonly style="flex:1;padding:10px 12px;border:1px solid #ccc;border-radius:12px;font-size:11px;background:white;color:#333;" value="">
          <button onclick="navigator.clipboard.writeText(document.getElementById('invite-link').value)" style="padding:10px 16px;border-radius:12px;background:#2d3e2c;color:white;border:none;font-weight:600;font-size:12px;cursor:pointer;white-space:nowrap;">Copiar</button>
        </div>
        <a id="invite-email-btn" href="#" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px;border-radius:12px;background:white;border:1px solid #2d3e2c;color:#2d3e2c;font-weight:600;font-size:12px;cursor:pointer;text-decoration:none;box-sizing:border-box;">
          <span class="material-icons" style="font-size:16px;">mail</span> Enviar por correo
        </a>
      </div>
    </div>
  `;

  document.getElementById('invite-cancel-inline').onclick = () => {
    container.innerHTML = '';
    _inviteInlineVisible = false;
  };

  document.getElementById('invite-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('invite-email').value.trim();
    const rol = document.getElementById('invite-rol').value;
    const submitBtn = document.getElementById('invite-submit');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Enviando...';
    try {
      const token = await inviteUser(empresaId, email, rol);
      const inviter = await getUser();
      const inviterName = inviter?.user_metadata?.nombre || inviter?.email || 'Alguien';
      const inviteLink = `${window.location.origin}${window.location.pathname}#aceptar_invitacion?token=${token}`;
      document.getElementById('invite-form').style.display = 'none';
      document.getElementById('invite-result').style.display = 'block';
      document.getElementById('invite-link').value = inviteLink;
      document.getElementById('invite-email-btn').href = `mailto:${email}?subject=Invitación a unirse a la empresa&body=Has sido invitado a colaborar. Abre este enlace para unirte:%0A${encodeURIComponent(inviteLink)}`;
      fetch(`${SUPABASE_URL}/functions/v1/send-invite`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${getAccessToken()}`,
        },
        body: JSON.stringify({ email, empresa_id: empresaId, token, invitado_por_nombre: inviterName }),
      }).then(async (res) => {
        if (!res.ok) {
          const err = await res.text().catch(() => res.statusText);
          console.error('Send invite failed:', res.status, err);
        } else {
          window.Snackbar.show('Invitación enviada por correo');
        }
      }).catch((err) => {
        console.error('Send invite error:', err);
      });
    } catch (err) {
      window.Snackbar.show('Error: ' + err.message, { type: 'error' });
    }
    submitBtn.disabled = false;
    submitBtn.textContent = 'Invitar';
  });
}
