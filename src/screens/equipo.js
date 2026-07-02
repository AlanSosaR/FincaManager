import { getEmpresaMembers, getEmpresaInvitations, inviteUser, revokeInvitation, getUser, getAccessToken } from '../auth.js';

const SUPABASE_URL = 'https://udhuizkqnmkhljmezzkd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkaHVpemtxbm1raGxqbWV6emtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTM2MTYsImV4cCI6MjA5MTIyOTYxNn0.W9bJ1S8A45RUGaulhdVG6UohGmGNxGMjLBsc0Q7voPE';

export async function renderEquipo() {
  const empresaId = window._currentEmpresaId;
  if (!empresaId) return '<div style="padding:24px;">Selecciona una empresa primero.</div>';

  const [members, invitations] = await Promise.all([
    getEmpresaMembers(empresaId),
    getEmpresaInvitations(empresaId),
  ]);

  const currentUserId = await getUser().then(u => u?.id || null);

  return `
    <div class="m3-card-filled" style="margin-bottom:80px;">
      <h2 class="m3-headline-small m3-font-bold" style="color:#2d3e2c;margin-bottom:24px;">Equipo</h2>

      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
        <h3 class="m3-title-medium m3-font-bold" style="color:#2d3e2c;">Miembros</h3>
      </div>

      <div id="members-list">
        ${members.map(m => renderMemberRow(m, currentUserId)).join('')}
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
              <button class="btn-revoke-invitation" data-id="${inv.id}" style="background:transparent;color:#ff4103;border:1px solid #ff4103;padding:6px 14px;border-radius:20px;font-size:12px;font-weight:600;cursor:pointer;">Revocar</button>
            </div>
          `).join('')}
        </div>
      ` : ''}
      <button id="btn-invite-member" class="m3-fab" style="position:fixed;bottom:32px;right:32px;">
        <span class="material-icons">person_add</span>
        <span>Invitar</span>
      </button>
    </div>
  `;
}

function renderMemberRow(m, currentUserId) {
  const isSelf = m.id === currentUserId;
  const roleColors = { propietario: '#2d3e2c', admin: '#1565c0', visor: '#888' };
  return `
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px;background:var(--m3-surface-container-low);border-radius:12px;margin-bottom:8px;">
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
        <span class="m3-badge" style="background:${roleColors[m.rol] || '#888'};color:white;padding:4px 12px;border-radius:20px;font-size:12px;font-weight:600;">${m.rol}</span>
        ${!isSelf && !m._isReadonly ? `
          <div class="member-actions" style="position:relative;">
            <button class="btn-member-menu" data-userid="${m.id}" style="background:transparent;border:none;cursor:pointer;padding:4px;border-radius:50%;color:#666;">
              <span class="material-icons" style="font-size:20px;">more_vert</span>
            </button>
          </div>
        ` : ''}
      </div>
    </div>
  `;
}

export function initEquipo() {
  const btn = document.getElementById('btn-invite-member');
  if (btn) {
    btn.addEventListener('click', toggleInviteInline);
  }

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
    <div style="padding:20px;background:#f9fbf9;border-radius:16px;border:1px solid #e0e8e0;">
      <h4 style="font-size:14px;font-weight:700;color:#2d3e2c;margin:0 0 16px;">Nuevo miembro</h4>
      <form id="invite-form">
        <div class="m3-field" style="margin-bottom:16px;">
          <input type="email" id="invite-email" placeholder=" " required>
          <label>Correo electrónico</label>
        </div>
        <div class="m3-field" style="margin-bottom:16px;">
          <select id="invite-rol" style="width:100%;padding:16px 12px 8px;border:1px solid #ccc;border-radius:12px;font-family:'Work Sans',sans-serif;font-size:14px;background:white;">
            <option value="admin">Admin</option>
            <option value="visor" selected>Visor</option>
          </select>
        </div>
        <div style="display:flex;gap:12px;">
          <button type="button" id="invite-cancel-inline" style="flex:1;padding:12px;border-radius:40px;background:transparent;border:1px solid #ccc;color:#666;font-weight:600;cursor:pointer;">Cancelar</button>
          <button type="submit" id="invite-submit" style="flex:1;padding:12px;border-radius:40px;background:#2d3e2c;color:white;border:none;font-weight:700;cursor:pointer;">Invitar</button>
        </div>
      </form>
      <div id="invite-result" style="display:none;margin-top:16px;padding:16px;background:#eaf5ea;border-radius:12px;border:1px solid #c8e6c9;">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;">
          <span class="material-icons" style="color:#2d3e2c;font-size:20px;">check_circle</span>
          <span style="font-weight:700;font-size:14px;color:#2d3e2c;">Invitación creada</span>
        </div>
        <p style="font-size:12px;color:#555;margin-bottom:12px;line-height:1.4;">Comparte este enlace con la persona que quieres invitar.</p>
        <div style="display:flex;gap:8px;margin-bottom:12px;">
          <input type="text" id="invite-link" readonly style="flex:1;padding:10px 12px;border:1px solid #ccc;border-radius:10px;font-size:11px;background:white;color:#333;" value="">
          <button onclick="navigator.clipboard.writeText(document.getElementById('invite-link').value)" style="padding:10px 16px;border-radius:10px;background:#2d3e2c;color:white;border:none;font-weight:600;font-size:12px;cursor:pointer;white-space:nowrap;">Copiar</button>
        </div>
        <a id="invite-email-btn" href="#" target="_blank" style="display:flex;align-items:center;justify-content:center;gap:6px;width:100%;padding:10px;border-radius:40px;background:white;border:1px solid #2d3e2c;color:#2d3e2c;font-weight:600;font-size:12px;cursor:pointer;text-decoration:none;box-sizing:border-box;">
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
