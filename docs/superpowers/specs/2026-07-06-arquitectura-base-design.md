# Sub-proyecto 1: Arquitectura base y modelo de datos — Sistema Comar-K

Fecha: 2026-07-06

## Contexto

Este es el primero de 6 sub-proyectos para convertir el prototipo Figma Make (React+Vite, solo frontend, sin persistencia) en una app de facturación CFDI multiempresa real. Orden completo:

1. **Arquitectura base y modelo de datos** (este documento)
2. Autenticación
3. CRUD real (Clientes, Catálogo, Facturas)
4. Timbrado CFDI (PAC, CSD)
5. Reportes y Dashboard con datos reales
6. Calidad (TypeScript estricto y tests aplicados como criterio de aceptación en cada sub-proyecto 2–5, no como fase aparte)

## Decisiones tomadas

- **Multiempresa (multi-tenant)**: varias empresas usan la misma app, cada una ve solo sus datos.
- **Roles**: dos niveles. Super-admin (Comar-K, el dueño de la plataforma) crea y elimina empresas desde un panel `/admin` invisible para el resto. Dentro de cada empresa, todos los usuarios tienen las mismas funciones (sin sub-roles).
- **Alta de empresas**: solo el super-admin da de alta empresas y su primer usuario. No hay registro público self-service.
- **Acceso a datos**: Supabase client directo (`@supabase/ssr`), sin Prisma. RLS de Postgres aplica el aislamiento multiempresa.
- **Stack**: Next.js App Router (páginas + route handlers) desplegado en Vercel. Supabase (Postgres + Auth + Storage) como backend.
- **Repo**: se convierte la carpeta actual `figma-make-app` en el proyecto Next.js (no se crea repo aparte).
- **UI**: se reaprovechan los componentes visuales existentes (`Dashboard.tsx`, `Catalogo.tsx`, `Clientes.tsx`, `NuevaFactura.tsx`, `Historial.tsx`, `Reportes.tsx`, `Configuracion.tsx`, `Sidebar.tsx`, `StatusBadge.tsx`), convirtiendo la navegación por `useState<View>` en rutas reales de Next.js.
- **Proyecto Supabase ya creado**: URL `https://tarxoyhmfcccumhxatct.supabase.co`, publishable/anon key ya proporcionada. La service role key (secreta) se agregará solo como variable de entorno server-side, nunca en el frontend.

## Arquitectura

Next.js App Router es el único servidor: sirve las páginas (rutas equivalentes a las vistas actuales) y los route handlers que actúan como API hacia Supabase. Dos clientes de Supabase distintos:
- Cliente "usuario" (anon/publishable key) — respeta RLS, se usa en la mayoría de operaciones autenticadas.
- Cliente "admin" (service role key, solo en server, nunca expuesto al navegador) — se usa exclusivamente en las rutas de super-admin (crear/eliminar empresa y su primer usuario).

Middleware de Next.js revisa la sesión en cada request a rutas protegidas: si el usuario está en `super_admins` → acceso a `/admin`; si está en `usuarios_empresa` → acceso a `/dashboard` y demás rutas de negocio con su `empresa_id` en contexto; si no está en ninguna tabla, la sesión se considera inválida para la app. RLS es la segunda barrera de seguridad por si algo llega a Supabase sin pasar por Next.js.

## Modelo de datos (a crear en Supabase vía SQL Editor)

- **empresas**: id, nombre, rfc_emisor, regimen_fiscal, cp_emisor, creada_en
- **super_admins**: user_id (FK a auth.users), creado_en
- **usuarios_empresa**: user_id (FK a auth.users), empresa_id (FK a empresas), creado_en — un usuario pertenece a una sola empresa
- **clientes**: id, empresa_id (FK, RLS), nombre, rfc, regimen_fiscal, codigo_postal, uso_cfdi, creado_en
- **productos**: id, empresa_id (FK, RLS), clave_sat, clave_unidad, nombre, precio, iva, creado_en
- **facturas**: id, empresa_id (FK, RLS), cliente_id (FK), folio, uuid_fiscal (null hasta timbrar), fecha, subtotal, iva_total, total, status (enum: pendiente | timbrada | cancelada), xml_url (null hasta sub-proyecto 4), pdf_url (null hasta sub-proyecto 4)
- **conceptos**: id, factura_id (FK), clave_sat, descripcion, cantidad, precio_unitario, iva, importe

`status` se define una sola vez como enum de Postgres, reemplazando las definiciones duplicadas e inconsistentes que había en `Historial.tsx` y `StatusBadge.tsx`. El tipo TypeScript se genera desde el esquema de Supabase, no se redefine a mano por archivo.

Todas las tablas de negocio (`clientes`, `productos`, `facturas`) tienen policy RLS que compara `empresa_id` contra `auth.empresa_id()` (función que resuelve la empresa del usuario autenticado vía `usuarios_empresa`). `conceptos` hereda el aislamiento a través de `factura_id`.

## Criterios de aceptación

- Next.js corre con las pantallas existentes navegables por rutas reales (no `useState<View>`).
- Login funciona contra Supabase Auth real.
- Un usuario de la empresa A no puede leer datos de la empresa B, ni por API ni directo contra Supabase (RLS probado explícitamente).
- Panel `/admin` accesible solo para super-admin; un usuario normal que intente entrar es rechazado.
- Esquema aplicado en Supabase (vía SQL Editor, a cargo del usuario) y validado con al menos un insert de prueba por tabla.
- Service role key nunca aparece en código de cliente ni se commitea (solo en variable de entorno server-side / `.env.local` ignorado por git).
