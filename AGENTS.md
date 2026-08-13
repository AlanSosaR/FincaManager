# Finca Manager — Guía de trabajo

Sistema multi-empresa colaborativo (PWA): ganado, motores, herramientas, potreros, personal, cafetal (lotes/aplicaciones/IFCAFE), gastos y cultivos. Auth y aislamiento por empresa, roles, invitaciones por email, selector de empresa.

## Comandos
- `npm run dev` — servidor Vite (proxy `/api/*` → Evolution API con apikey en `vite.config.js`).
- `npm run build` — única verificación (no hay lint ni tests). `vite preview` para probar el build.
- Deploy automático a Vercel con cada push a `main` (`.github/workflows/deploy.yml`). No desplegar manualmente.
- Migraciones SQL: aplicar a Supabase (proyecto `udhuizkqnmkhljmezzkd`) vía herramientas de management (MCP configurado en `opencode.json` con `SUPABASE_ACCESS_TOKEN` de env). `supabase/config.toml` es config local opcional.

## Acceso a datos — reglas críticas

- **NO usar el cliente `@supabase/supabase-js` en el frontend.** Dependencia en `package.json` es solo para la Edge Function. Todo va crudo por REST:
  - `authFetch` (auth.js) → `/auth/v1/*` (signup, token, user, recovery).
  - `restFetch(path, options)` → `/rest/v1/*`; usa `return=representation`. Lanza error si un PATCH no toca filas (auth.js:45); devuelve `[]` en 406. Filtra siempre con query-string PostgREST (`?id=eq.X&estado=eq.Y`).
  - `restInsert(path, body)` → POST sin `return=representation`; extrae `id` del header `Location` (regresa `{id}` o `{}`).
- `supabase.from('tabla')` (src/supabase.js) es un **QueryBuilder propio** (src/query-builder.js) sobre IndexedDB (Dexie) + REST. NO es supabase-js.
- QueryBuilder: cuando hay internet lee REST directo, con background refresh a IndexedDB; offline lee IndexedDB y encola writes (`_sync_queue` + `sync.js`). No soporta `gte`/`lt` — los filtros de rango de fechas se hacen **en JS** (ver `computeGastos()` en gastos.js).
- **Multi-empresa**: toda tabla de negocio se aísla por `empresa_id`. `window._currentEmpresaId` es la empresa activa; sesión en localStorage `supabase_session`, empresa en `current_empresa_id`.
- Insert via QueryBuilder agrega `empresa_id` automáticamente. Con `restInsert`/`restFetch` crudos **debes ponerlo tu** (`empresa_id: window._currentEmpresaId`).
- `restFetch` PATCH/UPDATE masivos (producto=fecha=estado=) son el patrón para actualizar/borrar lotes enteros de registros relacionados.

## Añadir una tabla nueva de negocio

Debes tocar toditos estos sitios, o la app fallará/morirá RLS:

1. Migración SQL en `supabase/migrations/` con RLS (`is_empresa_member()` select/insert/update/delete) + añadirla a la publicación `supabase_realtime` (REPLICA IDENTITY FULL).
2. `src/db.js` — nueva versión Dexie (v1..v6) con índice por `empresa_id`.
3. `BUSINESS_TABLES` en **tres** lugares: `src/sync.js`, `src/query-builder.js`, `src/realtime.js`.
4. Si requiere notificaciones WhatsApp: `WA_TRIGGER_TABLES` en `realtime.js`.
5. Registrar pantalla(es) en `src/main.js`: import, objeto `screens`, init en `renderAndInit`, y agregar al set `NO_CACHE` / `FORM_SCREENS` / `DETAIL_SCREENS` según corresponda.

## Pantallas y navegación

- `window.navigateTo('screen', id)` dispara `<CustomEvent navigate>`; `main.js` hace hash routing con **cache de HTML** (Stale-While-Revalidate).
- Detalle/form con estado editable: llamar `window.clearScreenCache?.('padre')` antes de navegar, o se verá HTML viejo.
- Detail screens renderizan solo shell y cargan datos en `init{Screen}()` — por eso están en `NO_CACHE`.
- Título de pantalla se define en el objeto `screens`; editar drawdown `title`, `backTo`, `noAuth` ahí.

## Convenciones

- Color primario `#2d3e2c` (verde bosque) con texto/iconos blancos. UI en castellano. Estilos Material 3 Expressive: clases `m3-*` y CSS vars (`--m3-*`) definidas en `src/style.css` (el paleta lo regenera `gen_palette.mjs`). Usa esas clases y variables en vez de colores inline.
- Confirmaciones destructivas con `Snackbar.confirm`; avisos con `Snackbar.show`.
- Estados de agenda (vacunas/fumigaciones/aplicaciones): `Aplicada` | `Programada` | `Cancelada`. Regla: `fecha <= hoy` → `Aplicada`, futura → `Programada`. El número principal cuenta solo las `Aplicada`; `Programada` son "pendientes".
- Plantillas de UI devuelven strings HTML.

## WhatsApp (Evolution API)

- Frontend solo habla con `EVOLUTION_API = '/api/wa-proxy'` (src/wa.js); el apikey vive en el proxy (`api/wa-proxy.js` en Vercel + proxy de `vite.config.js` en dev). No pongas la apikey en el frontend.
- Checkers en `wa.js` se ejecutan cada 60s (`main.js:253-267`); deduplican con claves localStorage `wa_*_sent_<fecha>` o `wa_notified_*` por id. Cuando agregues un checker, cífelina la key por día.
- `sendWhatsApp` es fire-and-forget: no revienta si falla ni si no hay grupo.
- Config de grupo por empresa se guarda en la tabla `empresa_config` (`saveWhatsAppConfig`/`loadWhatsAppConfig` en auth.js).
- **Gotcha**: `window._empresaNombre` se lee en los mensajes pero nunca se asigna en el frontend → la línea `Finca:` sale vacía. No hay fix global actual.

## Edge Function / plantillas

- `supabase/functions/send-invite/index.ts`: usa `createClient` de `npm:@supabase/supabase-js@2` con service_role (NO usar `withSupabase` middleware), `verify_jwt=false` (config en `config.toml`). Verifica `DENO` local con `supabase functions serve` si tocas.
- Plantillas de email en `supabase/templates/`.

## Gotchas específicos

- `src/screens/detalle_animal.jsx` es **.jsx pero sin JSX real**: script plain JS con template strings. Vite lo deja sin transformar (plugin `skip-esbuild-detalle-animal` + `optimizeDeps.exclude`). No introduzcas sintaxis JSX ahí.
- Algunas tablas con datos corruptos en IndexedDB (sj. `personal` sin `nombre`/`rol`/`iniciales`) — los módulos de personal leen con `restFetch` (no IndexedDB) a propósito. No reviertas a IndexedDB sin motivo.
- No confíes en `schema.sql` (raíz): es el esquema inicial con políticas "Allow public"; la versión autoritativa es el conjunto de `supabase/migrations/`.
- Archivos `.tsv.`, `dist/`, `*.timestamp-*`, `.vercel/` son artefactos; no editar.
- El feature IFCAFE/flavor: el plan se calcula al vuelo en `calculadora_dosis.js` (NO se materializa en lote); matching de producto por `normalizarProducto()`.

## Estado de módulos (resumen)

Existentes y funcionales: Dashboard, Motores (sesiones/mantenimientos), Herramientas (CSV export), Potreros, Ganado (pesajes, vacunas, fumigación masiva con panel inline y aplicar prog/ todas, reproducción preñez-parto-crías), Cafetal (lotes, aplicaciones, plan IFCAFE, actividad), Gastos (período por mes), Cultivos, Personal (asistencia), Equipo (invites/roles), Configuración (WhatsApp, caché), Perfil, Multimercados (selector empresa).

Pendientes registrados por docs previas: revisar ajuste de URLs/plantillas de email en el dashboard de Supabase.