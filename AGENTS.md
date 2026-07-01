# Finca Manager — Progreso del Desarrollo

## Objetivo
Sistema multi-empresa colaborativo con auth, aislamiento por empresa, roles, invitaciones por email y selector de empresa.

## Constantes
- Color primario: `#2d3e2c` (verde bosque oscuro) con texto/iconos blancos.
- Estilos: Material 3 Expressive (`m3-*` classes).
- Usuarios nuevos empiezan vacíos; invitados se unen a empresa existente.
- Auth/DB: llamadas REST directas a Supabase (`authFetch`, `restFetch`, `restInsert`), NO usar `@supabase/supabase-js` ni QueryBuilder.
- Proyecto Supabase: `udhuizkqnmkhljmezzkd`.

## Lo Completado

### Auth (`src/auth.js`)
- `signUp`, `login`, `logout`, `isAuthenticated`, `getUser`, `getSession`, `getAccessToken`, `tryRefreshSession`
- `signUp` ahora acepta `empresaNombre` (5to parámetro) para personalizar el nombre de la empresa al registrarse
- `ensureUserSetup` recibe y usa `empresaNombre` en vez del hardcoded `'Mi Finca'`
- `restFetch`, `restInsert`, `buildHeaders` — helpers REST directos
- `inviteUser` — crea invitación y devuelve token
- `acceptInvitation` — procesa token, inserta `usuario_empresas`
- `getEmpresaMembers`, `getEmpresaInvitations`, `revokeInvitation`, `updateMemberRole`, `removeMember`
- `loadEmpresaId` — setea `window._currentEmpresaId` desde localStorage
- Auto-recuperación de empresa en `main.js`: si falta `current_empresa_id` al iniciar, lo busca vía `restFetch`
- `inviteUser` — crea invitación y devuelve token
- `acceptInvitation` — procesa token, inserta `usuario_empresas`
- `getEmpresaMembers`, `getEmpresaInvitations`, `revokeInvitation`, `updateMemberRole`, `removeMember`
- `loadEmpresaId` — setea `window._currentEmpresaId` desde localStorage
- Auto-recuperación de empresa en `main.js`: si falta `current_empresa_id` al iniciar, lo busca vía `restFetch`

### RLS Policies (vía `20250625_rls_fix.sql`)
- `usuarios_insert_own`, `usuario_empresas_insert_own` (INSERT)
- `usuario_empresas_select_own` (SELECT sin recursión)
- `usuario_empresas_update_own`, `usuario_empresas_delete_own`
- `empresas_select_all` (todos leen), `empresas_insert_own`
- `invitaciones_select_all`, `invitaciones_insert_member`, `invitaciones_update_member`, `invitaciones_update_invitee`, `invitaciones_delete_member`

### Edge Function `send-invite` — REWRITTEN 25/06
- Ubicación: `supabase/functions/send-invite/index.ts`
- Originalmente usaba `withSupabase` middleware, pero el middleware rechazaba los JWTs
- **Reescrita** para usar `npm:@supabase/supabase-js@2` con service_role key directamente (Deno.serve plano)
- Llama a `supabase.auth.admin.inviteUserByEmail()` para enviar el correo
- Lee `PUBLIC_SITE_URL` de secrets para el redirect (seteado en `https://finca-manager.vercel.app`)
- Desplegada con `--no-verify-jwt`
- Probada exitosamente vía PowerShell: responde correctamente (devuelve `email rate limit exceeded` cuando aplica)
- `deno.json` actualizado: importa `jsr:@supabase/functions-js@^2` y `npm:@supabase/supabase-js@^2`

### Flujo de Invitación — Probado Parcialmente 25/06
- `inviteUser()` devuelve token correctamente (verificado)
- Edge Function envió el primer email exitosamente (llegó al destinatario)
- Link en el email apuntaba a `localhost:5173` (con la config anterior)
- Se cambió `PUBLIC_SITE_URL` a `https://finca-manager.vercel.app`
- Intentos subsiguientes fallaron con `email rate limit exceeded` (rate limit de Supabase Auth)
- `configuracion.js`: se agregó manejo de errores con `.then().catch()` en el fetch a la Edge Function (antes tenía `try/catch {}` vacío que silenciaba errores)

### `auth-callback.html`
- Ubicación: `public/auth-callback.html`
- Página estática que captura el redirect post-confirmación de email
- Guarda sesión en localStorage, busca `user_metadata.invite_token`, procesa la invitación (INSERT `usuario_empresas`, PATCH `invitaciones.estado = 'aceptada'`)
- Redirige al dashboard
- Verificado que se copia a `dist/` en el build de Vite

### Pantallas
- `configuracion.js`: lista miembros, invitaciones, modal de invitar con copiar link / enviar por correo, revocar invitación. Se agregó logging de errores al llamar a la Edge Function.
- `aceptar_invitacion.js`: maneja `?token=` en URL
- `perfil.js`: edición inline del nombre de empresa (clic → input → Enter guarda)
- `register.js`: campo "Nombre de tu finca/empresa" al crear cuenta

### Progreso de Sesiones Anteriores
- Auth completamente migrado a REST directo (sin `@supabase/supabase-js`)
- RLS policies aplicadas para `usuarios`, `empresas`, `usuario_empresas`, `invitaciones`
- Empresa auto-recovery en `main.js`
- `restInsert` helper para inserts sin `return=representation`

## Lo Que Falta (Por Fase)

### Fase 1c — Invitaciones Email (BLOQUEADO)
- [ ] Esperar que se resetee el rate limit de Supabase Auth (~1 hora)
- [ ] Probar flujo completo: invitar → recibir email → click link → auth-callback → unirse a empresa
- [ ] Si el rate limit persiste, considerar migrar a Resend/SendGrid como alternativa

### Fase 2 — Selector de Empresa (COMPLETADO 01/07)
- [x] Dropdown en el header (`index.html`) con estilo Material 3
- [x] Lista de empresas del usuario vía `getUserEmpresas()` en `main.js`
- [x] Modal selector con nombre, rol y check de empresa activa
- [x] Al cambiar: `switchEmpresa()` → cambia localStorage, limpia caché, navega al dashboard
- [x] Oculto si el usuario tiene ≤1 empresa
- [x] Se refresca con `window.location.reload()` tras login
- [x] Sidebar muestra el logo + nombre empresa + "Gestión Agrícola"
- [x] Al colapsar sidebar: solo se ve el icono (32px), se oculta el texto
- [x] Al editar el nombre desde perfil, se actualiza el sidebar automáticamente

### Fase 3 — Aislamiento por Empresa (COMPLETADO 01/07)
- [x] **QueryBuilder** (`src/query-builder.js`): auto-filtro `.eq('empresa_id', ...)` en todas las SELECT/UPDATE/DELETE de tablas de negocio (17 tablas) vía `_ensureEmpresaFilter()`
- [x] **Sync** (`src/sync.js`): `fullDownload()` filtra por `empresa_id` en tablas de negocio
- [x] **Insert** (ya existía): `query-builder.js` agrega `empresa_id` automáticamente al insertar
- [x] **RLS Policies** (`supabase/migrations/20250701_empresa_rls.sql`): policies SELECT/INSERT/UPDATE/DELETE para las 17 tablas de negocio, más función helper `is_empresa_member()`
- [x] Se eliminaron las policies públicas viejas (`Allow public read *`)

### Despliegue
- [ ] Build + deploy a Vercel después de cada cambio relevante
- [ ] `auth-callback.html` ya está siendo copiado a `dist/`

## Decisiones Técnicas
- `restInsert`: función que inserta sin `return=representation` para evitar errores de SELECT policy. Se usa para `empresas`, `usuarios`, `usuario_empresas`.
- `restFetch`: función genérica con `return=representation`. Se usa para SELECT y para `invitaciones` (tiene SELECT policy abierta).
- Edge Function usa service_role key internamente (funciona dentro de la red de Supabase).
- No usar `withSupabase` middleware — causa problemas con verificación de JWT. Usar `npm:@supabase/supabase-js@2` con `createClient` y service_role key desde `Deno.env`.
- Configuración de la sesión: `supabase_session` en localStorage, `current_empresa_id` en localStorage.
- `window._currentEmpresaId` es la empresa activa en memoria.
