export const SUPABASE_URL = 'https://udhuizkqnmkhljmezzkd.supabase.co';
export const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InVkaHVpemtxbm1raGxqbWV6emtkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU2NTM2MTYsImV4cCI6MjA5MTIyOTYxNn0.W9bJ1S8A45RUGaulhdVG6UohGmGNxGMjLBsc0Q7voPE';

async function authFetch(path, options = {}) {
  const session = getSession();
  const headers = {
    'apikey': SUPABASE_KEY,
    'Content-Type': 'application/json',
    ...options.headers,
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  const res = await fetch(`${SUPABASE_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.msg || body.error_description || body.error || `Auth error ${res.status}`);
  }
  return res.json();
}

function buildHeaders(headersOverrides = {}) {
  const session = getSession();
  const headers = {
    'apikey': SUPABASE_KEY,
    'Content-Type': 'application/json',
    ...headersOverrides,
  };
  if (session?.access_token) {
    headers['Authorization'] = `Bearer ${session.access_token}`;
  }
  return headers;
}

async function restFetch(path, options = {}) {
  const fullPath = path.startsWith('/') ? path : `/rest/v1/${path}`;
  const headers = buildHeaders({ Prefer: 'return=representation', ...options.headers });
  const res = await fetch(`${SUPABASE_URL}${fullPath}`, { ...options, headers });
  const body = res.headers.get('content-type')?.includes('application/json') ? await res.json() : null;
  if (!res.ok) {
    if (res.status === 406) return [];
    const msg = body?.message || body?.error || `REST error ${res.status}`;
    throw new Error(msg);
  }
  if (options.method === 'PATCH' && (!body || (Array.isArray(body) && body.length === 0))) {
    throw new Error('El servidor rechazó la actualización (posiblemente por permisos)');
  }
  return body;
}

async function restInsert(path, body) {
  const fullPath = path.startsWith('/') ? path : `/rest/v1/${path}`;
  const headers = buildHeaders();
  const res = await fetch(`${SUPABASE_URL}${fullPath}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = res.headers.get('content-type')?.includes('application/json') ? await res.json().catch(() => ({})) : {};
    const msg = errBody?.message || errBody?.error || `REST error ${res.status}`;
    throw new Error(msg);
  }
  const location = res.headers.get('Location') || '';
  const idMatch = location.match(/id=eq\.([a-f0-9-]+)/i);
  return idMatch ? { id: idMatch[1] } : {};
}

function getSession() {
  try {
    const raw = localStorage.getItem('supabase_session');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveSession(session) {
  if (session) {
    localStorage.setItem('supabase_session', JSON.stringify(session));
  } else {
    localStorage.removeItem('supabase_session');
  }
}

export { restFetch, restInsert };
export async function signUp(email, password, nombre, invitationToken, empresaNombre) {
  const data = await authFetch('/auth/v1/signup', {
    method: 'POST',
    body: JSON.stringify({ email, password, data: { nombre } }),
  });
  const session = data;
  if (session?.access_token) {
    saveSession(session);
    await ensureUserSetup(session.user.id, email, nombre, invitationToken, empresaNombre);
    loadEmpresaId();
  }
  return session;
}

export async function login(email, password) {
  const data = await authFetch('/auth/v1/token?grant_type=password', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
  if (data?.access_token) {
    saveSession(data);
    const user = await getUser();
    await ensureUserSetup(user.id, email, user.user_metadata?.nombre || '');
    loadEmpresaId();
    return { session: data, user };
  }
  throw new Error('Credenciales inválidas');
}

async function ensureUserSetup(userId, email, nombre, invitationToken, empresaNombre) {
  const existing = await restFetch(`/rest/v1/usuarios?id=eq.${encodeURIComponent(userId)}`);
  if (!existing || existing.length === 0) {
    await restInsert('/rest/v1/usuarios', { id: userId, email, nombre }).catch(() => {});
  }

  const ue = await restFetch(`/rest/v1/usuario_empresas?usuario_id=eq.${encodeURIComponent(userId)}`);
  if (ue && ue.length > 0) {
    localStorage.setItem('current_empresa_id', ue[0].empresa_id);
    return;
  }

  if (invitationToken) {
    await acceptInvitation(invitationToken, userId);
    return;
  }

  const pending = await restFetch(`/rest/v1/invitaciones?email=eq.${encodeURIComponent(email)}&estado=eq.pendiente`);
  if (pending && pending.length > 0) {
    await acceptInvitation(pending[0].token, userId);
    return;
  }

  const empresa = await restInsert('/rest/v1/empresas', { nombre: empresaNombre || 'Mi Finca' });
  if (empresa?.id) {
    await restInsert('/rest/v1/usuario_empresas', { usuario_id: userId, empresa_id: empresa.id, rol: 'propietario' });
    localStorage.setItem('current_empresa_id', empresa.id);
  }
}

export async function logout() {
  try {
    await authFetch('/auth/v1/logout', { method: 'POST' });
  } catch { /* ignore */ }
  saveSession(null);
  localStorage.removeItem('current_empresa_id');
}

export async function getUser() {
  try {
    const data = await authFetch('/auth/v1/user');
    return data;
  } catch {
    return null;
  }
}

export function onAuthChange(callback) {
  window.addEventListener('storage', (e) => {
    if (e.key === 'supabase_session') {
      callback(e.newValue ? JSON.parse(e.newValue) : null);
    }
  });
}

export function isAuthenticated() {
  return !!getSession()?.access_token;
}

export function getAccessToken() {
  const session = getSession();
  return session?.access_token || '';
}

export async function tryRefreshSession() {
  const session = getSession();
  if (!session?.refresh_token) return false;
  try {
    const data = await authFetch('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      body: JSON.stringify({ refresh_token: session.refresh_token }),
    });
    if (data?.access_token) {
      saveSession(data);
      return true;
    }
  } catch {
    saveSession(null);
  }
  return false;
}

export function loadEmpresaId() {
  const id = localStorage.getItem('current_empresa_id');
  window._currentEmpresaId = id || null;
  return window._currentEmpresaId;
}

export async function acceptInvitation(token, userId) {
  const inv = await restFetch(`/rest/v1/invitaciones?token=eq.${encodeURIComponent(token)}&estado=eq.pendiente`);
  if (!inv || inv.length === 0) throw new Error('Invitación no válida o ya expiró');
  await restInsert('/rest/v1/usuario_empresas', { usuario_id: userId, empresa_id: inv[0].empresa_id, rol: inv[0].rol });
  await restFetch(`/rest/v1/invitaciones?id=eq.${inv[0].id}`, {
    method: 'PATCH',
    body: JSON.stringify({ estado: 'aceptada' }),
  });
  localStorage.setItem('current_empresa_id', inv[0].empresa_id);
  loadEmpresaId();
  return inv[0];
}

export async function validateInvitation(token) {
  try {
    const data = await restFetch(`/rest/v1/invitaciones?token=eq.${encodeURIComponent(token)}&estado=eq.pendiente&select=id,empresa_id,rol,email`);
    if (!data || data.length === 0) return null;
    const empData = await restFetch(`/rest/v1/empresas?id=eq.${encodeURIComponent(data[0].empresa_id)}&select=nombre`);
    return {
      empresaId: data[0].empresa_id,
      empresaNombre: empData?.[0]?.nombre || 'Una finca',
      email: data[0].email,
      rol: data[0].rol,
    };
  } catch { return null; }
}

export async function getUserEmpresas() {
  const user = await getUser();
  if (!user) return [];
  try {
    const ue = await restFetch(`/rest/v1/usuario_empresas?usuario_id=eq.${encodeURIComponent(user.id)}&select=empresa_id,rol,empresas:empresa_id(nombre)`);
    return (ue || []).map((r) => ({
      id: r.empresa_id,
      nombre: r.empresas?.nombre || 'Sin nombre',
      rol: r.rol,
    }));
  } catch { return []; }
}

export async function switchEmpresa(empresaId) {
  localStorage.setItem('current_empresa_id', empresaId);
  loadEmpresaId();
  window.clearScreenCache?.();
  window.navigateTo?.('dashboard');
}

export async function inviteUser(empresaId, email, rol) {
  const data = await restFetch('/rest/v1/invitaciones', {
    method: 'POST',
    body: JSON.stringify({ empresa_id: empresaId, email, rol }),
  });
  const record = Array.isArray(data) ? data[0] : data;
  return record?.token || null;
}

export async function getEmpresaMembers(empresaId) {
  try {
    const data = await restFetch(`/rest/v1/usuario_empresas?empresa_id=eq.${encodeURIComponent(empresaId)}&select=usuario_id,rol,created_at,usuarios:usuario_id(email,nombre)`);
    return (data || []).map((m) => ({
      id: m.usuario_id,
      email: m.usuarios?.email || '',
      nombre: m.usuarios?.nombre || '',
      rol: m.rol,
      created_at: m.created_at,
    }));
  } catch { return []; }
}

export async function getEmpresaInvitations(empresaId) {
  try {
    return await restFetch(`/rest/v1/invitaciones?empresa_id=eq.${encodeURIComponent(empresaId)}&estado=eq.pendiente&order=created_at.desc`) || [];
  } catch { return []; }
}

export async function updateMemberRole(empresaId, usuarioId, nuevoRol) {
  await restFetch(`/rest/v1/usuario_empresas?empresa_id=eq.${encodeURIComponent(empresaId)}&usuario_id=eq.${encodeURIComponent(usuarioId)}`, {
    method: 'PATCH',
    body: JSON.stringify({ rol: nuevoRol }),
  });
}

export async function removeMember(empresaId, usuarioId) {
  await restFetch(`/rest/v1/usuario_empresas?empresa_id=eq.${encodeURIComponent(empresaId)}&usuario_id=eq.${encodeURIComponent(usuarioId)}`, {
    method: 'DELETE',
  });
}

export async function revokeInvitation(invitationId) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/invitaciones?id=eq.${invitationId}`, {
    method: 'DELETE',
    headers: buildHeaders(),
  });
  if (!res.ok) {
    const errBody = res.headers.get('content-type')?.includes('application/json') ? await res.json().catch(() => ({})) : {};
    const msg = errBody?.message || errBody?.error || `Error al eliminar invitación`;
    throw new Error(msg);
  }
}

export async function updateProfile({ nombre, email }) {
  const user = await getUser();
  if (!user) throw new Error('No autenticado');

  const body = {};
  if (nombre !== undefined && nombre !== null) {
    body.data = { nombre };
  }
  if (email !== undefined && email !== null) {
    body.email = email;
  }

  if (Object.keys(body).length > 0) {
    await authFetch('/auth/v1/user', {
      method: 'PUT',
      body: JSON.stringify(body),
    });
  }

  const dbBody = {};
  if (nombre !== undefined && nombre !== null) dbBody.nombre = nombre;
  if (email !== undefined && email !== null) dbBody.email = email;
  if (Object.keys(dbBody).length > 0) {
    await restFetch(`/rest/v1/usuarios?id=eq.${encodeURIComponent(user.id)}`, {
      method: 'PATCH',
      body: JSON.stringify(dbBody),
    });
  }
}

export async function verifyPassword(password) {
  const user = await getUser();
  if (!user?.email) return false;
  try {
    await authFetch('/auth/v1/token?grant_type=password', {
      method: 'POST',
      body: JSON.stringify({ email: user.email, password }),
    });
    return true;
  } catch {
    return false;
  }
}

export async function updatePassword(newPassword) {
  await authFetch('/auth/v1/user', {
    method: 'PUT',
    body: JSON.stringify({ password: newPassword }),
  });
}

export async function sendRecoveryEmail(email) {
  let data = {};
  try {
    const users = await restFetch(`/rest/v1/usuarios?email=eq.${encodeURIComponent(email)}&select=id`);
    if (users?.[0]?.id) {
      const ue = await restFetch(`/rest/v1/usuario_empresas?usuario_id=eq.${encodeURIComponent(users[0].id)}&select=empresas:empresa_id(nombre)&limit=1`);
      if (ue?.[0]?.empresas?.nombre) {
        data.empresa_nombre = ue[0].empresas.nombre;
      }
    }
  } catch {}
  await authFetch('/auth/v1/recover', {
    method: 'POST',
    body: JSON.stringify({ email, data }),
  });
}

export async function saveWhatsAppConfig(empresaId, config) {
  const existing = await restFetch(`/rest/v1/empresa_config?empresa_id=eq.${encodeURIComponent(empresaId)}&select=empresa_id`);
  const payload = { ...config, updated_at: new Date().toISOString() };
  if (existing && existing.length > 0) {
    await restFetch(`/rest/v1/empresa_config?empresa_id=eq.${encodeURIComponent(empresaId)}`, {
      method: 'PATCH',
      body: JSON.stringify(payload),
    });
  } else {
    await restInsert('/rest/v1/empresa_config', { empresa_id: empresaId, ...payload });
  }
  window._empresaWhatsAppConfig = { ...(window._empresaWhatsAppConfig || {}), ...config };
}

export async function loadWhatsAppConfig(empresaId) {
  try {
    const data = await restFetch(`/rest/v1/empresa_config?empresa_id=eq.${encodeURIComponent(empresaId)}&select=*`);
    if (data && data.length > 0) {
      window._empresaWhatsAppConfig = data[0];
      if (data[0].whatsapp_group_jid) {
        localStorage.setItem('whatsapp_group_jid', data[0].whatsapp_group_jid);
      }
      return data[0];
    }
  } catch {}
  window._empresaWhatsAppConfig = null;
  return null;
}
