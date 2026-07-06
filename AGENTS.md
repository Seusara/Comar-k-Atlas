# Comar-K

Next.js + React + Supabase app for electronic invoice management.

## Development Server

Run `pnpm dev` to start the Next.js dev server on `$PORT` (default 8443).

## Key Files

- `src/app/` - Next.js App Router routes
- `src/components/` - shared UI components (Dashboard, Clientes, Catalogo, NuevaFactura, Historial, Reportes, Configuracion, Sidebar, StatusBadge)
- `src/lib/supabase/` - Supabase clients (browser, server, admin) and generated database types
- `src/middleware.ts` - session and role-based route protection
- `package.json` - Dependencies and scripts
- `next.config.ts` - Next.js configuration

## Styling

This project uses **Tailwind CSS v4** for styling. Use Tailwind utility classes directly in JSX. Tailwind is loaded via the Vite plugin — no PostCSS config needed.
