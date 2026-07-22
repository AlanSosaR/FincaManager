# Finca Manager — Progreso del Desarrollo

## Objetivo
Sistema multi-empresa colaborativo con auth, aislamiento por empresa, roles, invitaciones por email y selector de empresa.

## Constantes
- Color primario: `#2d3e2c` (verde bosque oscuro) con texto/iconos blancos.
- Estilos: Material 3 Expressive (`m3-*` classes).
- Usuarios nuevos empiezan vacíos; invitados se unen a empresa existente.
- Auth/DB: llamadas REST directas a Supabase (`authFetch`, `restFetch`, `restInsert`), NO usar `@supabase/supabase-js` ni QueryBuilder.
- Proyecto Supabase: `udhuizkqnmkhljmezzkd`.

## Lo Completado (22/07)

### Fix ERR_INSUFFICIENT_RESOURCES — Deduplicación y Cooldown en syncTable
- `sync.js`: añadidos `activeSyncPromises` (reutiliza promesas en curso para evitar peticiones duplicadas a la misma tabla) y `lastSyncTime` (cooldown de 15s entre descargas en segundo plano).
- `sync.js`: `incrementalSync()` procesa tablas en lotes de 3 en paralelo en lugar de 17 simultáneas para no saturar el pool de sockets HTTP del navegador.
- `query-builder.js`: `_refreshCacheAsync()` delega a `syncTable(this.tableName)` heredando la deduplicación y cooldown.
- Soluciona: `net::ERR_INSUFFICIENT_RESOURCES` causado por ráfagas de consultas a la API REST de Supabase al navegar o renderizar pantallas.

### Stale-while-revalidate en QueryBuilder — navegación instantánea sin forced full download
- `query-builder.js`: `_execute()` ahora implementa cache-first + background REST refresh.
- Flujo: leer IndexedDB primero → si hay datos, devolver instantáneo → en background disparar `_refreshCacheAsync()` que descarga todas las filas de la tabla y actualiza IndexedDB.
- Si IndexedDB está vacío (1ra vez tras borrar caché), espera REST como fallback.
- `_processLocally(results)`: lógica de filtrado/orden/paginación extraída a método propio, reutilizable desde cache y offline.
- `_refreshCacheAsync()`: descarga paginada (1000 por página), purga registros locales que ya no existen en servidor, hace `bulkPut()`.
- Sin forced `fullDownload` al iniciar — el cache se llena naturalmente al navegar entre pantallas.
- Navegación instantánea desde la 2da vez que visitas una pantalla.

### Fix supabaseFetch — headers sobrescritos por `...options` causaban 401
- `sync.js`: el spread `...options` en `supabaseFetch()` sobrescribía el objeto `headers` completo, eliminando `apikey` y haciendo que todas las consultas REST via QueryBuilder fallaran con 401.
- Fix: extraer `headers` de options antes de construir el fetch, igual que en `restFetch()` de auth.js.
- Fix: mejorar mensaje de error incluyendo body de respuesta para debugging.

### Fix Service Worker — auto-update + cache busting para evitar código JS antiguo
- `main.js`: reemplazado bloque manual de unregister + reject por `controllerchange` listener que recarga cuando un nuevo SW toma control.
- `main.js`: `registerSW({ immediate: true, onNeedRefresh() { window.location.reload() } })` — detecta contenido nuevo y recarga al instante.
- `vite.config.js`: `build.rollupOptions.output` con hashes en nombres de archivo (`[name]-[hash].js`) para que el navegador detecte cambios.
- `vite.config.js`: `cleanupOutdatedCaches: true` en workbox para eliminar caches viejos automáticamente.
- Soluciona: tras deploy de nuevo código, el service worker detecta hashes diferentes, hace skipWaiting + clientsClaim, y el controllerchange recarga la página con el código fresco.

### Eliminación de forced full download al iniciar
- `main.js`: eliminados `showDownloadBanner()`, `showInitialPrompt()`, notificación "Descargar para usar sin internet".
- `sync.js`: eliminados `setSyncStatusCallback()`, `onSyncStatusChange`, `initSync()` (código muerto).
- `auth.js`: eliminado `finca_sync_complete` de `logout()` y `switchEmpresa()`.
- `query-builder.js`: `_execute()` ya no cae silenciosamente a IndexedDB vacío cuando REST falla. Cuando está online, usa REST directamente.
- `nuevo_personal.js`: `renderNuevoPersonal()` usa `restFetch()` en vez de `db.personal.get()`.
- `perfil.js`, `configuracion.js`: priorizan REST sobre IndexedDB.

## Lo Completado (15/07)

### Realtime WebSocket — Sincronización en vivo vía Supabase Realtime
- `src/realtime.js` (nuevo): módulo que crea un cliente WebSocket (`RealtimeClient`) conectado a `wss://udhuizkqnmkhljmezzkd.supabase.co/realtime/v1`.
- Se suscribe a `postgres_changes` en `public.*` y filtra solo las 17 tablas de negocio (`BUSINESS_TABLES`).
- Filtra por `empresa_id` del payload para respetar aislamiento multi-empresa.
- Al recibir un cambio: llama `syncTable(table)` y si es `animal_vacunas`, `animal_fumigaciones` o `lote_aplicaciones` programa check de WhatsApp con 1s de delay.
- `main.js`: `initRealtime()` se llama al iniciar app y al reconectar (evento `online`).
- `main.js`: los checkers de WhatsApp se separaron en intervalo propio de 60s (antes compartían el intervalo de sync de 5s). Se agregó `incrementalSync()` como safety net cada 5 min.

### Fix RLS — Eliminación de políticas "Allow public" que bypassaban aislamiento por empresa
- Se verificó en Supabase que 14 tablas aún tenían políticas "Allow public *" activas junto a las nuevas políticas `is_empresa_member()`, lo que anulaba el aislamiento multi-empresa.
- Se ejecutaron DROP POLICY para las 52 políticas públicas restantes en: `motores`, `motor_sesiones`, `motor_mantenimientos`, `potreros`, `potrero_eventos`, `herramientas`, `herramienta_mantenimientos`, `animal_pesajes`, `animal_vacunas`, `animal_fumigaciones`, `lote_aplicaciones`, `lote_personal`, `personal`, `personal_asistencia`.
- Names corregidos: las políticas creadas por Supabase Dashboard usaban nombres cortos (ej. `"Allow public read aplicaciones"`) que no coincidían con los DROP del migration original.

### Fix Realtime Publication — Tablas agregadas a `supabase_realtime`
- `supabase/migrations/20260715_realtime_publication.sql` (nuevo): migración que agrega las 17 tablas de negocio a la publicación `supabase_realtime` y habilita `REPLICA IDENTITY FULL` en cada una (necesario para que `empresa_id` esté disponible en el WAL).
- Antes del fix: la publicación existía pero estaba vacía → Postgres no enviaba cambios → Realtime no funcionaba.
- Commit: `7ee3161`

### opencode.json — MCP Supabase token seguro
- `SUPABASE_ACCESS_TOKEN` cambiado de hardcodeado a `{env:SUPABASE_ACCESS_TOKEN}` para no exponer el token en git.

## Lo Completado (09/07)

### IFCAFE 2026 — Plan de Fertilización (Completado 09/07)
- `utils/calculadora_dosis.js`: dosis por edad (vasito), plan 5 aplicaciones por zona (A/B), etiquetas, orden del día.
- `utils/vasito_medidor.js`: SVG vasito (1/4, 1/3, 1/2) con compacto para badges.
- `nuevo_lote.js`: al crear lote con edad+altura → pre-inserta 5 aplicaciones, envía WhatsApp con resumen del plan.
- `wa.js`: 4 checkers — checkAplicacionesDelMes, checkAnalisisSueloPendiente, checkEnmiendaCal, actualizarSaludPorPlan.
- `main.js`: ciclo 5s ejecuta los 4 checkers.
- `detalle_lote.js`: removido bloque visual del plan IFCAFE, solo enlace "📋 Ver Plan IFCAFE 2026".
- `dashboard.js`: enlace "📋 Plan IFCAFE 2026" debajo del título.
- `plan_ifcafe.js` (nuevo): pantalla dedicada con tarjetas expandibles, propósito por aplicación, estado, notificación WhatsApp, botones "Marcar como aplicada" y "Enviar notificación".
- `auth.js`: restFetch/restInsert ahora agregan automáticamente /rest/v1/ si el path no empieza con /.
- Migraciones SQL pendientes de aplicar en Supabase dashboard: `20250701_empresa_rls.sql`, `20250702_empresa_update_policy.sql`, `20250703_usuarios_select_member.sql`, `20260708_normalizacion_fase1.sql`, `20260709_normalizacion_fase2.sql`, `20260710_ifcafe_plan.sql`.
- Se agregó `empresa_id` en inserts de lotes y lote_aplicaciones para cumplir RLS.
- Fix: initPlanIfcafe() registrado en navigate, guard para empresaId undefined, dosisLabel → dosis.

### Fix Deploy a Vercel — proxy WhatsApp funcionando en producción
- `.github/workflows/deploy.yml`: agregadas `VERCEL_ORG_ID` y `VERCEL_PROJECT_ID` como `env:` (no `.vercel/project.json` porque está en `.gitignore`).
- `vercel.json`: rewrite corregida de `/((?!api/).*)` (causaba 404 en toda ruta `/api`) a dos reglas explícitas: `/api/wa-proxy/(.*)` → serverless function, `/(.*)` → SPA.
- `api/wa-proxy.js`: convertido de `module.exports` a `export default` para compatibilidad con ESM (`"type": "module"` en package.json).
- Secrets agregados en GitHub Actions: `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`.
- Commits: `750676b`, `81714a7`, `07f521c`, `ea908d7`

### IFCAFE 2026 — Plan de Fertilización (Completado 09/07)
- `utils/calculadora_dosis.js`: dosis por edad (vasito), plan 5 aplicaciones por zona (A/B), etiquetas, orden del día.
- `utils/vasito_medidor.js`: SVG vasito (1/4, 1/3, 1/2) con compacto para badges.
- `nuevo_lote.js`: al crear lote con edad+altura → pre-inserta 5 aplicaciones, envía WhatsApp con resumen del plan.
- `wa.js`: 4 checkers — checkAplicacionesDelMes, checkAnalisisSueloPendiente, checkEnmiendaCal, actualizarSaludPorPlan.
- `main.js`: ciclo 5s ejecuta los 4 checkers.
- `detalle_lote.js`: removido bloque visual del plan IFCAFE, solo enlace "📋 Ver Plan IFCAFE 2026".
- `dashboard.js`: enlace "📋 Plan IFCAFE 2026" debajo del título.
- `plan_ifcafe.js` (nuevo): pantalla dedicada con tarjetas expandibles, propósito por aplicación, estado, notificación WhatsApp, botones "Marcar como aplicada" y "Enviar notificación".
- `auth.js`: restFetch/restInsert ahora agregan automáticamente /rest/v1/ si el path no empieza con /.
- Migraciones SQL pendientes de aplicar en Supabase dashboard: `20250701_empresa_rls.sql`, `20250702_empresa_update_policy.sql`, `20250703_usuarios_select_member.sql`, `20260708_normalizacion_fase1.sql`, `20260709_normalizacion_fase2.sql`, `20260710_ifcafe_plan.sql`.
- Se agregó `empresa_id` en inserts de lotes y lote_aplicaciones para cumplir RLS.
- Fix: initPlanIfcafe() registrado en navigate, guard para empresaId undefined, dosisLabel → dosis.

## Lo Completado (07/07)
- `wa.js`: `createInstance()` ahora incluye `qrcode: true` en el body.
- `wa.js`: `deleteInstance()` tolera 404 (instancia no existe) sin lanzar error.
- `configuracion.js`: `connectOrRecreate()` reintenta con delete + delay 1.5s si falla creación.
- `configuracion.js`: unificado connect/disconnect en `handleWaButtonClick()` (un solo botón).
- `configuracion.js`: `updateWhatsAppStatus()` usa flag `isWaConnected` en vez de onclick inline.
- `configuracion.js`: grupo ID visible si hay conexión O si ya hay grupo guardado.
- `configuracion.js`: botón "Buscar grupos" solo visible cuando conectado.
- Commits: `78276bf`, `10b7957`, `f646f1a`, `bcc48fc`

## Lo Completado (07/07)

### Sincronización automática en segundo plano (cada 5s + al navegar)
- `sync.js`: nueva función `syncTable(tableName)` — descarga UNA tabla desde Supabase y actualiza IndexedDB. Elimina registros locales que ya no existen en servidor.
- `sync.js`: `incrementalSync()` reescrito — ahora llama `syncTable()` para todas las tablas de negocio en paralelo (ya no usa `updated_at` que no existía en las tablas).
- `main.js`: al navegar a `#lotes`, `#potreros`, `#motores`, etc., llama `syncTable()` ANTES de renderizar — datos frescos al instante.
- `main.js`: intervalo de sync reducido de 15 min → **5 segundos**.
- `main.js`: `visibilitychange` y evento `online` también sincronizan todas las tablas.
- Todo 100% silencioso: sin banners, spinners ni refrescos visibles.
- Commits: `b44f231`, `37bb287`

### Lectura directa desde Supabase (restFetch) en detalle_personal y lista_personal
- `detalle_personal.js`: reemplazó todos los `supabase.from()` (QueryBuilder → IndexedDB) por `restFetch()` (lectura directa desde Supabase REST API). Incluye render inicial, refreshCalendar, toggle y set de asistencia.
- `lista_personal.js`: mismo cambio — listado y eliminación via `restFetch`.
- Soluciona que los datos corruptos en IndexedDB (registros sin `nombre`, `rol`, `iniciales`) ya no afectan la visualización.
- Importa `restFetch` de `auth.js` ya no `supabase` de `../supabase.js`.
- Commits: `a59875e`

### Prevención de datos corruptos en QueryBuilder
- `query-builder.js:170`: `_executeInsert()` ahora guarda `{ ...record, ...serverRecord }` (fusión de datos originales del formulario con respuesta del servidor). Así aunque Supabase devuelva algo inesperado, no se pierden campos.
- Commit: `a59875e`

### Guard contra datos incompletos (null safety)
- `detalle_personal.js` y `lista_personal.js`: `getColor(seed)` — si `seed` es `undefined`, retorna el primer color en vez de fallar con `seed.length`.
- `lista_personal.js`: `getInitiales(nombre)` — si `nombre` es `undefined`, retorna `'??'`.
- `detalle_personal.js`: template muestra `persona.nombre || 'Sin nombre'` y `persona.iniciales || '?'` para evitar mostrar "undefined".
- Commit: `a59875e`

### Fix pantalla de descarga inicial — "Error de conexión" → "Finalizando..."
- `sync.js`: cada tabla se descarga en un `try/catch` individual; si una falla, continúa con la siguiente.
- Mensaje de error cambiado de `"Error de conexión"` a `"Finalizando..."` con barra al 90% en vez de 0%.
- Timeout reducido de 3s a 2s.
- Commit: `a9c1f03`

### Perfil — Header oculto tras guardar (fix)
- `perfil.js`: save handler restaura `style.display` del header name/email a `''` después de cerrar el formulario.
- `window.clearScreenCache?.('perfil')` después de guardar.
- Edición de nombre de empresa inline (reemplazó `prompt()` por input + Guardar/Cancelar).
- Commit: `f1503b8`

### Nuevo Personal — reescrito con restFetch + IndexedDB directo
- `nuevo_personal.js`: submit handler ahora usa `restFetch()` + `db.personal.put()` en vez de QueryBuilder.
- INSERT: POST a Supabase, almacena respuesta del servidor en IndexedDB; si falla, guarda local y encola sync.
- UPDATE: PATCH a Supabase, mergea con registro existente antes de `db.personal.put()`.
- Guard `if (personalId === 'null') personalId = null` en render e init.
- Commit: `a59875e`

### ClearScreenCache en navegación de formularios a listados
- `nuevo_motor.js`, `nuevo_potrero.js`, `nueva_herramienta.js`: añadido `window.clearScreenCache?.('motores')` (etc.) antes de `navigateTo()`.
- `main.js`: agregadas pantallas a `NO_CACHE` para forzar render fresco.
- Commit: `f1503b8`

## Lo Completado (03/07)

### Dashboard — Aplicaciones Recientes (rounded corners + fix borde mobile)
- `dashboard.js`: tarjeta `Aplicaciones Recientes` con `border-radius: 12px`
- Oculto scrollbar horizontal en `db-table-wrap` en mobile (`scrollbar-width: none`)
- Eliminado `border-bottom` de la última fila de la tabla para que no se vea línea gris al fondo
- Commits: `1f3e124`, `90dc9ef`

### Sidebar — Icono hamburguesa reemplazado por logo app
- `index.html`: `#menu-toggle` y `#sidebar-close` ahora muestran el logo SVG en vez del icono `menu`
- Logos a 40x40px en mobile
- `style.css`: `#menu-toggle` y `#sidebar-close` con fondo transparente (sin verde extra detrás del logo)
- `style.css`: `.sidebar .sidebar-logo` oculto en mobile (evita duplicado con botón menú)
- `style.css`: `.nav-link.header-main .sidebar-logo` a 64x64px en desktop
- `style.css`: `#sidebar-empresa-name` con `white-space: nowrap` y `font-size: 22px`
- Eliminado `outline: 2px solid #ffffff` del logo activo en perfil
- Commits: `1f3e124`, `90dc9ef`

### SVG Icono — Colores actualizados
- `public/pwa-512x512.svg`: fondo `#2E7D32`, hoja `#A5D6A7` al 70%, contorno hoja `#2d3e2c` al 30%, venas `#F0F8F0`, engranaje `#1B5E20` con centro y radios `#f0f0e8`
- Commit: `1f3e124`

### Iconos de ojo en registro
- `register.js`: iconos `visibility_off`/`visibility` en campos password y confirm, con toggle de tipo (igual que login)
- Commit: `c804777`

### Nombre de empresa vacío por defecto
- `register.js`: campo "Nombre de tu finca/empresa" aparece vacío si no viene de invitación; solo se llena (read-only) cuando hay `_pendingToken`
- Commit: `08376df`

### Sidebar actualiza nombre de empresa sin recargar
- `main.js`: en `navigate()`, al navegar a pantallas de app (no auth), se llama `updateSidebarEmpresaName()` + `initEmpresaSelector()` (una vez)
- Soluciona el bug donde tras login/registro el sidebar mostraba el nombre vacío hasta refrescar manualmente
- Commit: `7855dd1`

### Filtro invitaciones pendientes
- `auth.js:281`: `getEmpresaInvitations()` ahora filtra `&estado=eq.pendiente` — invitaciones aceptadas ya no aparecen con botón "Revocar"
- Commit: `d76ba83`

### Menú 3 puntos funcional en Equipo
- `equipo.js`: dropdown con opciones **"Cambiar rol"** (alterna admin/visitante) y **"Eliminar miembro"** — ambos con confirmación y Snackbar
- Badge de rol se actualiza inline sin recargar
- Importa `updateMemberRole` y `removeMember` de `auth.js`
- Commit: `3fb22f5`

### RLS: usuarios_select_member
- `20250703_usuarios_select_member.sql`: nueva policy que permite leer nombre/email de miembros que comparten empresa (vía `is_empresa_member()`)
- Soluciona que los datos de otros usuarios salieran en blanco en la pantalla Equipo
- Aplicada en Supabase vía `supabase db push --include-all`

### Gitignore
- `.gitignore`: agregados `.vscode/` y `vite.config.js.timestamp-*`

## Lo Completado (02/07)

### Sidebar
- `toggleSidebar()`: al abrir en mobile (≤1024px) se quita la clase `.collapsed` para mostrar logo + empresa + "Gestión Agrícola"
- "Cerrar sesión" movido de `perfil.js` al sidebar (`index.html`), dentro de `.nav-links` con separador, con color #ff4103, oculta `.nav-text` al colapsar

### Flujo de Invitación por Email (refinado 02/07)
- `handleAuthCallback()` en `main.js` redirige a `#aceptar_invitacion?token=X` (antes `#register`)
- Se usa `sessionStorage` flag `finca_from_invite_email` para distinguir: llegada desde email → muestra tarjeta; usuario ya logueado → auto-accept directo
- Tarjeta en `aceptar_invitacion.js`: "Has sido invitado a colaborar en **[empresa]**" con botón **"Aceptar"** (antes "Crear cuenta y aceptar")
- Botón "Aceptar" navega a `register` con token, empresa pre-cargada read-only
- Snackbar **"Invitación enviada por correo"** en `equipo.js` al enviar invitación exitosamente vía Edge Function

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

### `auth-callback` (eliminado)
- `public/auth-callback.html` eliminado — ahora el auth callback se maneja inline en SPA via `handleAuthCallback()` en `main.js`

### Pantallas
- `equipo.js` (nuevo 02/07): miembros, invitaciones, inline invite form, FAB (portado desde configuracion.js). Título "Equipo".
- `configuracion.js`: info del sistema (app, versión, navegador, estado), descargar datos, limpiar caché (portado desde perfil.js). Sin miembros/invitaciones.
- `perfil.js`: avatar, nombre de empresa editable inline, cerrar sesión. Sin info del sistema, sin descargar/caché, sin logout.
- `aceptar_invitacion.js`: maneja `?token=` en URL, cuando se llega desde email muestra tarjeta con "[empresa]" y botón "Aceptar" que va a register con empresa pre-cargada. Usuarios ya logueados auto-aceptan directo.
- `register.js`: campo "Nombre de tu finca/empresa" al crear cuenta. Cuando hay token de invitación: **read-only** con el nombre de la empresa que invitó. Si el usuario ya está autenticado (vino por email), crea `usuarios` + acepta invitación → dashboard. Si no, `signUp()` normal con token.
- `main.js`: permite que usuarios autenticados con token accedan a `register` y `aceptar_invitacion`. Redirige a `#aceptar_invitacion?token=X` desde `handleAuthCallback()`.

### Progreso de Sesiones Anteriores
- Auth completamente migrado a REST directo (sin `@supabase/supabase-js`)
- RLS policies aplicadas para `usuarios`, `empresas`, `usuario_empresas`, `invitaciones`
- Empresa auto-recovery en `main.js`
- `restInsert` helper para inserts sin `return=representation`

## Lo Que Falta (Por Fase)

### Fase 1c — Invitaciones Email (COMPLETADO 01/07)
- [x] Edge Function `send-invite` redeployeada con soporte para usuarios ya registrados
- [x] `auth-callback.html` redirige a register con token en vez de procesar la invitación
- [x] `register.js` muestra empresa read-only cuando hay token
- [x] Logo subido a Supabase Storage
- [x] `invitado_por_nombre` pasado a la Edge Function
- [x] Plantilla personalizada en `supabase/templates/invite.html`

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

### Fase 1d — Flujo Invitación por Email (COMPLETADO 01/07)
- [x] `auth-callback.html`: ya no procesa la invitación, solo guarda sesión y redirige a `/#register?token=TOKEN`
- [x] `register.js`: cuando hay token, empresa field se muestra como **read-only** (disabled) con el nombre de la empresa que invitó
- [x] Usuario autenticado (vino por email): crea `usuarios` + `acceptInvitation()` → redirige al dashboard
- [x] Usuario no autenticado (link directo): `signUp()` normal con `ensureUserSetup()` y token
- [x] `main.js`: excepción para `noAuth` — permite register autenticado si hay token
- [x] RLS UPDATE policy para `empresas` (`20250702_empresa_update_policy.sql`) — ahora editar nombre desde perfil funciona
- [x] Logo subido a Supabase Storage: `https://udhuizkqnmkhljmezzkd.supabase.co/storage/v1/object/public/logo/pwa-512x512.svg`
- [x] Edge Function `send-invite` ahora acepta `invitado_por_nombre` en `user_metadata`
- [x] `handleAuthCallback()` redirige a `#aceptar_invitacion?token=X` con tarjeta "Has sido invitado" + botón "Aceptar"
- [x] `sessionStorage` flag `finca_from_invite_email` distingue email invite vs auto-accept directo
- [ ] **Pendiente**: cambios en Supabase dashboard (Site URL, Redirect URLs, Email Template)

## Lo Completado (08/07)

### Integración WhatsApp — Notificaciones de Vacunas
- `api/wa-proxy.js`: proxy Vercel serverless que reenvía peticiones a Evolution API (`132.145.42.123:8080`) con API key hardcodeada (no expuesta al frontend).
- `api/wa-proxy.js`: se agregó ruta `/group/join` pero Evolution API responde 404 (endpoint no disponible en v2).
- `src/wa.js`: módulo helper con funciones:
  - `createInstance()` — crea instancia en Evolution API
  - `deleteInstance()` — elimina instancia (útil si la config queda corrupta)
  - `getQR()` — obtiene QR para escanear con WhatsApp
  - `checkConnection()` — verifica si la instancia está conectada
  - `listGroups()` — obtiene lista de grupos donde está el número conectado
  - `sendWhatsApp(mensaje)` — envía texto al grupo configurado
  - `checkPendingVaccines()` — cada 5s busca vacunas con `fecha === hoy` y `estado === 'Programada'` y envía recordatorio
- `src/screens/configuracion.js`: sección "WhatsApp" con botón "Conectar WhatsApp" (QR), "Buscar grupos" (modal selector de grupos vía `listGroups`), campo "ID del Grupo de WhatsApp" y estado de conexión en vivo.
- `src/screens/detalle_animal.jsx`: al confirmar vacuna como "Aplicada", envía WhatsApp al grupo con los datos del animal, vacuna, fecha y finca.
- `src/main.js`: `checkPendingVaccines()` se ejecuta en el ciclo de sync cada 5s (junto a `processSyncQueue` e `incrementalSync`).
- `vite.config.js`: proxy `/api/` → `http://132.145.42.123:8080` en modo dev (inyecta `apikey` header automaticamente).
- `vercel.json`: rewrite SPA excluye `/api/*` para que las serverless functions funcionen.
- `.github/workflows/deploy.yml`: auto-deploy a Vercel en cada push a `main` (requiere secrets `VERCEL_TOKEN`, `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID`).
- Seguimiento de notificaciones vía localStorage (`wa_notified_vaccines`) — no requiere migración SQL.
- Grupo **"Finca Manager"** (`120363411244363102@g.us`) creado y conectado — mensaje de prueba enviado y recibido.
- `/group/join` no disponible en este servidor — se usa `listGroups` y selección manual del grupo desde la app.
- Instancia: `finca_mgr_6ed00acc`, API key: `429683C4C977415CAAFCCE10F7D57E11`, tipo: `WHATSAPP-BAILEYS`.
- Commits: `b83c542`, `64b27ab`, `7a261ae`, `698f533`, `8aca824`, `97579bc`

### Despliegue
- [x] GitHub Actions workflow para auto-deploy a Vercel
- [x] Secrets configurados en GitHub: `VERCEL_TOKEN`, `VERCEL_ORG_ID` (`team_uifHxRsDbMUdKGvfT9pm3Xou`), `VERCEL_PROJECT_ID` (`prj_ddYNiSXVX2bABycPB2ZfZlg2oeK0`)

## Lo Completado (14/07)

### WhatsApp — Pairing Code + Grupo manual + Compartido en Supabase
- `wa.js`: `createInstance(number)` ahora acepta `number` opcional para pairing code; `connectPairing(phone)` reescrita: borra instancia → crea con `number` → extrae `qrcode.pairingCode` del response → fallback a `GET /connect/{name}`.
- `auth.js`: `saveWhatsAppConfig()`, `loadWhatsAppConfig()` — config compartida por empresa en tabla `empresa_config`.
- `configuracion.js`: tabs "Código" + "QR"; botón "Aceptar" para confirmar grupo; botón "Desconectar" visible solo para quien conectó o propietario; al conectar ya no auto-selecciona grupo (el usuario elige manualmente).
- `supabase/migrations/20260714_empresa_config.sql` — tabla + 3 RLS policies.
- Fix: servidor Evolution API v2.3.7 no tiene endpoint `connectPairing` — se usa `POST /instance/create` con `number` para obtener `pairingCode` del `qrcode` en la respuesta.

### QueryBuilder — Lectura directa desde Supabase REST cuando hay internet
- `query-builder.js`: nuevo método `_executeOnline()`: traduce cadena de métodos (`.eq()`, `.order()`, `.range()`, etc.) a parámetros REST y llama `supabaseFetch()`. Lee `content-range` para `count=exact`.
- `query-builder.js`: `_execute()` ahora ramifica: si hay internet → REST directo (con fallback a IndexedDB si falla); si no → IndexedDB como antes.
- `main.js`: eliminado `SCREEN_TABLE_MAP` y `syncTable()` en `navigate()` — ya no es necesario porque QueryBuilder lee directo de REST. Navegación más rápida (~0.5–2s por pantalla).

### Plan IFCAFE 2026 — Rediseño con selector de mes
- `plan_ifcafe.js`: nuevo estado `_ifcafeMonth` (persiste entre renders); al entrar preselecciona el mes actual (Mar-Jul) o "Todas".
- Nuevo select Material 3 con los 5 meses + "Todas las aplicaciones". Al cambiar, re-renderiza solo ese mes.
- Badge "X/5 realizadas" en cada lote. Modo "Todas" mantiene grid responsivo; modo mes específico muestra 1 tarjeta.

## Decisiones Técnicas
- `restInsert`: función que inserta sin `return=representation` para evitar errores de SELECT policy. Se usa para `empresas`, `usuarios`, `usuario_empresas`.
- `restFetch`: función genérica con `return=representation`. Se usa para SELECT y para `invitaciones` (tiene SELECT policy abierta).
- Edge Function usa service_role key internamente (funciona dentro de la red de Supabase).
- No usar `withSupabase` middleware — causa problemas con verificación de JWT. Usar `npm:@supabase/supabase-js@2` con `createClient` y service_role key desde `Deno.env`.
- Configuración de la sesión: `supabase_session` en localStorage, `current_empresa_id` en localStorage.
- `window._currentEmpresaId` es la empresa activa en memoria.
- SVG icono: fondo `#2E7D32`, hoja `#A5D6A7` (70%), contorno `#2d3e2c` (30%), venas `#F0F8F0`, engranaje `#1B5E20` con centro/radios `#f0f0e8`.
