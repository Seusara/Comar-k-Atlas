# Brief para Claude Code — Sub-proyecto 1: Arquitectura base y modelo de datos

Pega esto en Claude Code, en la terminal abierta dentro de la carpeta del proyecto.

## Contexto

Ya se corrió el SQL de esquema en el Supabase SQL Editor (ver `docs/superpowers/specs/2026-07-06-schema.sql`). El spec completo está en `docs/superpowers/specs/2026-07-06-arquitectura-base-design.md` — léelo primero.

Proyecto Supabase:
- URL: `https://tarxoyhmfcccumhxatct.supabase.co`
- Anon/publishable key: `sb_publishable_zVRbC6UarPIdcVxhNGpt4Q_SYlJpFBv`
- La service role key (secreta) la voy a pegar yo directo en `.env.local` — pídemela cuando la necesites, no la commitees nunca, y agrega `.env.local` a `.gitignore` si no está.

## Qué hacer

1. Convierte la carpeta actual (`figma-make-app`, Vite puro) en un proyecto Next.js (App Router, TypeScript estricto). Reaprovecha los componentes existentes en `src/` (`Dashboard.tsx`, `Catalogo.tsx`, `Clientes.tsx`, `NuevaFactura.tsx`, `Historial.tsx`, `Reportes.tsx`, `Configuracion.tsx`, `Sidebar.tsx`, `StatusBadge.tsx`) migrándolos a rutas reales (`/dashboard`, `/catalogo`, `/clientes`, `/facturas/nueva`, `/historial`, `/reportes`, `/configuracion`) en vez del `useState<View>` actual en `App.tsx`. Mantén el diseño visual y Tailwind v4 tal cual.

2. Configura `@supabase/ssr` con dos clientes: uno con la anon key (respeta RLS, para uso normal) y otro server-only con la service role key (solo para rutas de super-admin). Nunca expongas la service role key al bundle de cliente.

3. Implementa middleware de Next.js que redirija según sesión: usuario en `super_admins` → `/admin`; usuario en `usuarios_empresa` → `/dashboard`; sin sesión válida → `/login`. Crea una pantalla `/login` simple contra Supabase Auth (email/password). No hay registro público — no crees pantalla de sign-up para clientes finales.

4. Genera los tipos TypeScript del esquema de Supabase (usa el enum `factura_status` desde ahí, no lo redefinas a mano — hoy está duplicado en `Historial.tsx` y `StatusBadge.tsx`, corrígelo para que ambos importen el mismo tipo). Nota: las funciones helper de RLS son `public.empresa_id()` y `public.is_super_admin()` (no `auth.*` — ese esquema es reservado por Supabase y no permite crear funciones ahí).

5. Crea un panel `/admin` mínimo (aunque sea solo lectura por ahora) donde el super-admin pueda ver la lista de empresas — la funcionalidad completa de crear/eliminar empresa la haremos en el sub-proyecto de auth/admin si hace falta profundizar, pero deja la estructura de la ruta y su protección lista.

6. Escribe una prueba (puede ser con el test runner que prefieras, ej. Vitest) que confirme que un usuario de la empresa A no puede leer filas de la empresa B vía el cliente con anon key (prueba de RLS real contra Supabase, no mockeada).

## Criterios de aceptación (del spec)

- Next.js corre y las pantallas existentes son navegables por rutas reales.
- Login funciona contra Supabase Auth real.
- RLS probado: aislamiento entre empresas confirmado con test.
- `/admin` solo accesible para super-admin.
- Service role key no aparece en ningún archivo de cliente ni se commitea.

Muéstrame el plan de archivos/carpetas antes de migrar todo de golpe, y avísame en qué paso vas.
