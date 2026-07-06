# Arquitectura base y modelo de datos — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the Figma Make Vite prototype into a real Next.js App Router application wired to a live Supabase project (Postgres + Auth), with real routes replacing `useState<View>`, session-based role routing (super-admin vs. empresa user), a unified `FacturaStatus` type, and an automated test proving RLS isolates data between empresas.

**Architecture:** Next.js App Router is the only server. Two Supabase clients for normal operation — a browser client and a server client, both using the anon key and subject to RLS — plus a service-role admin client used only in server-only code (middleware, the `/admin` panel, and test fixtures) for operations RLS must not allow anon/authenticated users to do (checking `super_admins` membership, provisioning empresas). Existing visual components move into route files unchanged in appearance; only their navigation mechanism changes.

**Tech Stack:** Next.js (App Router, TypeScript strict), React 19, Tailwind CSS v4 (`@tailwindcss/postcss`), `@supabase/ssr` + `@supabase/supabase-js`, Vitest + Testing Library + jsdom, pnpm.

## Global Constraints

- Keep Tailwind v4 and the existing visual design exactly as-is — connect functionality, don't redesign.
- TypeScript strict mode, no `any`, anywhere in new or touched code.
- Package manager is pnpm (already in use; `pnpm-lock.yaml` exists).
- `FacturaStatus` is defined in exactly one place and imported everywhere else — no more duplicated `Status` type in `Historial.tsx` and `StatusBadge.tsx`.
- The service-role Supabase key must never be imported by a file that can end up in the client bundle, and must never be committed to git.
- RLS in Postgres is the source of truth for tenant isolation — application code must not be the only thing preventing cross-empresa reads.
- Reference docs already approved for this sub-project: `docs/superpowers/specs/2026-07-06-arquitectura-base-design.md` and `docs/superpowers/specs/2026-07-06-schema.sql`.

---

## Plan self-review note on the existing schema

While reviewing `docs/superpowers/specs/2026-07-06-schema.sql` before writing this plan, I found one gap: RLS is enabled on `empresas`, `clientes`, `productos`, `facturas`, `conceptos`, and `usuarios_empresa`, but **not on `super_admins`**. In Supabase, a table without RLS enabled is readable/writable by the `anon` role by default — meaning anyone with the public anon key (which ships in every browser bundle) could currently run `select * from super_admins` and see who the super-admins are, or worse, `insert` a row and grant themselves super-admin. Task 2 below fixes this with a follow-up SQL patch before any app code goes live. Middleware and the admin panel are written to check `super_admins` exclusively through the service-role admin client, never through the anon-key client, so they don't depend on a select policy existing for that table at all.

---

### Task 1: Safety checkpoint — git init and baseline commit

**Files:**
- Create: `.gitignore`
- Modify: none (commits everything currently in the working tree)

**Interfaces:** none — this task only establishes version control before the migration starts touching files.

- [ ] **Step 1: Initialize git and add a `.gitignore`**

```bash
git init
```

Write `.gitignore`:

```
node_modules
.next
.env.local
*.tsbuildinfo
.DS_Store
```

- [ ] **Step 2: Commit the current Figma Make prototype as a rollback point**

```bash
git add -A
git commit -m "chore: snapshot Figma Make prototype before Next.js migration"
```

- [ ] **Step 3: Verify**

```bash
git log --oneline
git status
```

Expected: one commit listed, working tree clean.

---

### Task 2: Fix the `super_admins` RLS gap and set up environment variables

**Files:**
- Create: `docs/superpowers/specs/2026-07-06-schema-patch-rls-superadmins.sql`
- Create: `.env.local.example`
- Create: `.env.local` (gitignored — never committed)

**Interfaces:**
- Produces: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` environment variables consumed by every Supabase client in later tasks.

- [ ] **Step 1: Write the SQL patch for the RLS gap**

`docs/superpowers/specs/2026-07-06-schema-patch-rls-superadmins.sql`:

```sql
-- Patch: super_admins was missing RLS entirely, which meant the anon key
-- could read (and, if a future migration ever adds default grants, write)
-- this table directly. No select/insert/update/delete policy is added on
-- purpose: only the service-role client (which bypasses RLS) should ever
-- touch this table. App code must never query super_admins with the
-- anon-key client.

alter table super_admins enable row level security;
```

- [ ] **Step 2: Ask the user to run it, then wait for confirmation**

Ask: "Necesito que corras `docs/superpowers/specs/2026-07-06-schema-patch-rls-superadmins.sql` en el SQL Editor de tu proyecto Supabase (el mismo donde corriste `2026-07-06-schema.sql`). Avísame cuando esté aplicado."

Do not proceed to Task 5 (middleware) or Task 8 (admin panel) until confirmed — both rely on `super_admins` being locked down.

- [ ] **Step 3: Ask the user for the service role key**

Ask: "Necesito la service role key de tu proyecto Supabase (Project Settings → API → service_role secret) para el cliente admin server-only y para las pruebas de RLS. La guardo solo en `.env.local`, que ya está en `.gitignore` — nunca se commitea ni se expone al navegador. Pégala aquí."

- [ ] **Step 4: Write `.env.local.example` (committed, no real secrets)**

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

- [ ] **Step 5: Write `.env.local` (gitignored, real values)**

```
NEXT_PUBLIC_SUPABASE_URL=https://tarxoyhmfcccumhxatct.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sb_publishable_zVRbC6UarPIdcVxhNGpt4Q_SYlJpFBv
SUPABASE_SERVICE_ROLE_KEY=<value provided by user in Step 3>
```

- [ ] **Step 6: Verify `.env.local` is ignored**

```bash
git check-ignore -v .env.local
```

Expected: prints `.gitignore:3:.env.local	.env.local` (or similar — confirms the match).

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/specs/2026-07-06-schema-patch-rls-superadmins.sql .env.local.example
git commit -m "docs: patch super_admins RLS gap, add env var template"
```

---

### Task 3: Scaffold the Next.js project in place of Vite

**Files:**
- Create: `next.config.ts`, `next-env.d.ts`, `postcss.config.mjs`, `src/app/layout.tsx`, `src/app/globals.css`, `src/app/page.tsx`
- Modify: `package.json`, `tsconfig.json`
- Delete: `vite.config.ts`, `index.html`, `src/main.tsx`, `src/vite-env.d.ts`, `src/App.tsx`, `src/index.css`, `.figma/` (Figma Make hosting config, no longer applicable once deployed to Vercel)

**Interfaces:**
- Produces: a booting `pnpm dev` (Next.js) on the project root, `@/*` path alias resolving to `src/*`, Tailwind v4 available via `globals.css`.

- [ ] **Step 1: Remove Vite/Figma Make-only files**

```bash
git rm vite.config.ts index.html src/main.tsx src/vite-env.d.ts src/App.tsx src/index.css
git rm -r .figma
```

- [ ] **Step 2: Remove Vite-only dependencies, add Next.js and Supabase dependencies**

```bash
pnpm remove @tailwindcss/vite vite
pnpm add next @supabase/ssr @supabase/supabase-js server-only
pnpm add -D @tailwindcss/postcss @testing-library/react @testing-library/jest-dom jsdom dotenv vitest
```

(`vite` and `@vitejs/plugin-react` stay listed as dependencies of `vitest` itself — Vitest uses Vite internally for its test transform pipeline even though the app is now built by Next.js, not Vite. Do not remove `@vitejs/plugin-react`.)

- [ ] **Step 3: Update `package.json` scripts**

Edit the `"scripts"` block to:

```json
{
  "dev": "next dev",
  "build": "next build",
  "start": "next start",
  "lint": "next lint",
  "test": "vitest run",
  "format": "oxfmt"
}
```

Also change `"name"` from `"figma-make-app"` to `"comar-k"`.

- [ ] **Step 4: Replace `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "react-jsx",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "baseUrl": ".",
    "paths": {
      "@/*": ["./src/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

(Correction found during Task 3 execution: this plan originally specified `"jsx": "preserve"`. Next.js 16.2.10 with Turbopack mandatorily rewrites this to `"react-jsx"` on every `pnpm dev`/`pnpm build`, printing "next.js uses the React automatic runtime" — `"preserve"` does not stick regardless of what's committed. `"react-jsx"` above reflects the framework's actual, verified requirement.)

- [ ] **Step 5: Create `next.config.ts`**

```ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {}

export default nextConfig
```

- [ ] **Step 6: Create `next-env.d.ts`**

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

- [ ] **Step 7: Create `postcss.config.mjs`**

```js
const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}

export default config
```

- [ ] **Step 8: Create `src/app/globals.css`** (moved from the deleted `src/index.css`, unchanged)

```css
@import 'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap';
@import 'tailwindcss';

@theme inline {
  --color-background: #f8fafc;
  --color-foreground: #0f172a;
  --color-card: #ffffff;
  --color-card-foreground: #0f172a;
  --color-primary: #4f46e5;
  --color-primary-foreground: #ffffff;
  --color-secondary: #f1f5f9;
  --color-secondary-foreground: #475569;
  --color-muted: #f1f5f9;
  --color-muted-foreground: #64748b;
  --color-accent: #eef2ff;
  --color-accent-foreground: #4338ca;
  --color-border: #e2e8f0;
  --color-ring: #4f46e5;
  --color-success: #16a34a;
  --color-warning: #d97706;
  --color-danger: #dc2626;
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
  --font-sans: 'Inter', system-ui, sans-serif;
}

* {
  box-sizing: border-box;
}

body {
  font-family: 'Inter', system-ui, sans-serif;
  background-color: #f8fafc;
  color: #0f172a;
  margin: 0;
  padding: 0;
  -webkit-font-smoothing: antialiased;
}

::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}
::-webkit-scrollbar-track {
  background: transparent;
}
::-webkit-scrollbar-thumb {
  background: #cbd5e1;
  border-radius: 3px;
}
::-webkit-scrollbar-thumb:hover {
  background: #94a3b8;
}
```

- [ ] **Step 9: Create `src/app/layout.tsx`**

```tsx
import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Comar-K · Facturación CFDI',
  description: 'Sistema de facturación electrónica CFDI para pequeños negocios en México.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  )
}
```

- [ ] **Step 10: Create `src/app/page.tsx`** (defensive fallback — middleware normally redirects `/` before this ever renders)

```tsx
import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/login')
}
```

- [ ] **Step 11: Verify the app boots**

```bash
pnpm dev
```

Expected: server starts on port 8443 (or `$PORT`), visiting `/` redirects toward `/login` (which will 404 until Task 6 — that 404 is expected at this point).

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "chore: scaffold Next.js App Router in place of Vite"
```

---

### Task 4: Supabase clients, shared database types, and the unified `FacturaStatus`

**Files:**
- Create: `src/lib/supabase/database.types.ts`, `src/lib/supabase/client.ts`, `src/lib/supabase/server.ts`, `src/lib/supabase/admin.ts`, `src/components/StatusBadge.test.tsx`
- Modify: `src/components/StatusBadge.tsx`, `src/components/Historial.tsx`
- Create: `vitest.config.ts`, `vitest.setup.ts`

**Interfaces:**
- Produces: `Database` type, `FacturaStatus` type (from `src/lib/supabase/database.types.ts`), `createClient()` (browser, in `client.ts`), `createClient()` (server, async, in `server.ts`), `createAdminClient()` (in `admin.ts`) — all consumed by every later task.

- [ ] **Step 1: Hand-author `src/lib/supabase/database.types.ts`**

Generated types normally come from `supabase gen types typescript`, which requires either Supabase CLI login or a direct Postgres connection string — neither is available non-interactively here. Since `2026-07-06-schema.sql` is the exact, already-applied source of truth, the type below is transcribed directly from it. If CLI access is set up later, regenerate and diff against this file.

```ts
export type FacturaStatus = 'pendiente' | 'timbrada' | 'cancelada'

export interface Database {
  public: {
    Tables: {
      empresas: {
        Row: {
          id: string
          nombre: string
          rfc_emisor: string
          regimen_fiscal: string
          cp_emisor: string
          creada_en: string
        }
        Insert: {
          id?: string
          nombre: string
          rfc_emisor: string
          regimen_fiscal: string
          cp_emisor: string
          creada_en?: string
        }
        Update: Partial<Database['public']['Tables']['empresas']['Insert']>
        Relationships: []
      }
      super_admins: {
        Row: { user_id: string; creado_en: string }
        Insert: { user_id: string; creado_en?: string }
        Update: Partial<Database['public']['Tables']['super_admins']['Insert']>
        Relationships: []
      }
      usuarios_empresa: {
        Row: { user_id: string; empresa_id: string; creado_en: string }
        Insert: { user_id: string; empresa_id: string; creado_en?: string }
        Update: Partial<Database['public']['Tables']['usuarios_empresa']['Insert']>
        Relationships: []
      }
      clientes: {
        Row: {
          id: string
          empresa_id: string
          nombre: string
          rfc: string
          regimen_fiscal: string
          codigo_postal: string
          uso_cfdi: string
          creado_en: string
        }
        Insert: {
          id?: string
          empresa_id: string
          nombre: string
          rfc: string
          regimen_fiscal: string
          codigo_postal: string
          uso_cfdi: string
          creado_en?: string
        }
        Update: Partial<Database['public']['Tables']['clientes']['Insert']>
        Relationships: []
      }
      productos: {
        Row: {
          id: string
          empresa_id: string
          clave_sat: string
          clave_unidad: string
          nombre: string
          precio: number
          iva: number
          creado_en: string
        }
        Insert: {
          id?: string
          empresa_id: string
          clave_sat: string
          clave_unidad: string
          nombre: string
          precio: number
          iva: number
          creado_en?: string
        }
        Update: Partial<Database['public']['Tables']['productos']['Insert']>
        Relationships: []
      }
      facturas: {
        Row: {
          id: string
          empresa_id: string
          cliente_id: string
          folio: string
          uuid_fiscal: string | null
          fecha: string
          subtotal: number
          iva_total: number
          total: number
          status: FacturaStatus
          xml_url: string | null
          pdf_url: string | null
        }
        Insert: {
          id?: string
          empresa_id: string
          cliente_id: string
          folio: string
          uuid_fiscal?: string | null
          fecha?: string
          subtotal: number
          iva_total: number
          total: number
          status?: FacturaStatus
          xml_url?: string | null
          pdf_url?: string | null
        }
        Update: Partial<Database['public']['Tables']['facturas']['Insert']>
        Relationships: []
      }
      conceptos: {
        Row: {
          id: string
          factura_id: string
          clave_sat: string
          descripcion: string
          cantidad: number
          precio_unitario: number
          iva: number
          importe: number
        }
        Insert: {
          id?: string
          factura_id: string
          clave_sat: string
          descripcion: string
          cantidad: number
          precio_unitario: number
          iva: number
          importe: number
        }
        Update: Partial<Database['public']['Tables']['conceptos']['Insert']>
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      factura_status: FacturaStatus
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}
```

(Correction found during Task 8 execution: the original hand-authored type omitted `Relationships` per table and `Views`/`Functions`/`CompositeTypes` at the schema level. `@supabase/postgrest-js`'s `GenericSchema` constraint needs these present for `.from(table).select(...)` to infer real row types instead of silently falling back to `never` — this only surfaced once a task actually dereferenced a queried row's properties, which no task before Task 8 did.)

- [ ] **Step 2: Create `src/lib/supabase/client.ts`** (browser, anon key)

```ts
import { createBrowserClient } from '@supabase/ssr'
import type { Database } from './database.types'

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
```

- [ ] **Step 3: Create `src/lib/supabase/server.ts`** (Server Components/route handlers, anon key + cookies)

```ts
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from './database.types'

export async function createClient() {
  const cookieStore = await cookies()

  return createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
          } catch {
            // Called from a Server Component render; middleware is what
            // actually refreshes the session cookie on each request.
          }
        },
      },
    },
  )
}
```

- [ ] **Step 4: Create `src/lib/supabase/admin.ts`** (service role, server-only)

```ts
import 'server-only'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

export function createAdminClient() {
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set. This client must never run in the browser.')
  }

  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } },
  )
}
```

The `server-only` import makes any accidental client-side import of this module fail the Next.js build, which is what actually enforces "service role key never in client code" rather than just a convention.

- [ ] **Step 5: Update `src/components/StatusBadge.tsx`** to import the shared type

Replace:

```ts
type Status = 'timbrada' | 'cancelada' | 'pendiente'
```

with:

```ts
import type { FacturaStatus } from '@/lib/supabase/database.types'

type Status = FacturaStatus
```

(Keep the rest of the file — `config`, the component body — unchanged; only the type's source changes.)

- [ ] **Step 6: Update `src/components/Historial.tsx`** to import the shared type

Replace:

```ts
type Status = 'timbrada' | 'cancelada' | 'pendiente'
```

with:

```ts
import type { FacturaStatus } from '@/lib/supabase/database.types'

type Status = FacturaStatus
```

- [ ] **Step 7: Create `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
```

- [ ] **Step 8: Create `vitest.setup.ts`**

```ts
import '@testing-library/jest-dom/vitest'
import { config } from 'dotenv'

config({ path: '.env.local' })
```

- [ ] **Step 9: Write the failing test — `src/components/StatusBadge.test.tsx`**

```tsx
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from './StatusBadge'
import type { FacturaStatus } from '@/lib/supabase/database.types'

describe('StatusBadge', () => {
  const cases: { status: FacturaStatus; label: string }[] = [
    { status: 'timbrada', label: 'Timbrada' },
    { status: 'cancelada', label: 'Cancelada' },
    { status: 'pendiente', label: 'Pendiente' },
  ]

  it.each(cases)('renders the correct label for status "$status"', ({ status, label }) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})
```

- [ ] **Step 10: Run it to verify it fails before the source changes are in place**

If Steps 5–6 above were applied already (they're part of this same task), run the test now instead — this task doesn't have a meaningful red state since the type unification and its test land together. Skip straight to Step 11.

- [ ] **Step 11: Run the test suite**

```bash
pnpm test
```

Expected: `StatusBadge` suite passes (3 cases). This also exercises that both `StatusBadge.tsx` and `Historial.tsx` compile against the same imported `FacturaStatus`.

- [ ] **Step 12: Type-check to confirm no duplicated/divergent type remains**

```bash
pnpm exec tsc --noEmit
```

Expected: no errors. (Vitest transpiles but doesn't type-check — this is the step that actually proves the duplication is gone.)

- [ ] **Step 13: Commit**

```bash
git add src/lib/supabase src/components/StatusBadge.tsx src/components/Historial.tsx src/components/StatusBadge.test.tsx vitest.config.ts vitest.setup.ts package.json pnpm-lock.yaml
git commit -m "feat: add Supabase clients, shared database types, unify FacturaStatus"
```

---

### Task 5: Middleware for session and role-based routing

**Files:**
- Create: `src/middleware.ts`

**Interfaces:**
- Consumes: `Database` type from `src/lib/supabase/database.types.ts`, `createAdminClient()` from `src/lib/supabase/admin.ts`.
- Produces: redirect behavior relied on by every protected route in Tasks 7 and 8.

- [ ] **Step 1: Create `src/middleware.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/supabase/database.types'
import { createAdminClient } from '@/lib/supabase/admin'

const PUBLIC_PATHS = ['/login']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  // NextResponse.redirect() builds a brand-new response object, which does
  // NOT inherit cookies staged onto `response` by the setAll callback above.
  // Since this middleware also redirects already-authenticated users (the
  // role-based branches below), a token refresh from supabase.auth.getUser()
  // can be silently dropped on exactly those redirects. Route every redirect
  // through this helper so refreshed session cookies always propagate.
  function redirectTo(path: string) {
    const redirectResponse = NextResponse.redirect(new URL(path, request.url))
    response.cookies.getAll().forEach(cookie => redirectResponse.cookies.set(cookie))
    return redirectResponse
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  if (!user) {
    if (PUBLIC_PATHS.includes(path)) return response
    return redirectTo('/login')
  }

  // super_admins has RLS enabled with no policy for anon/authenticated roles
  // (see Task 2's patch), so role lookups here must go through the
  // service-role admin client, never the user's own session client.
  const admin = createAdminClient()

  const { data: superAdminRow } = await admin
    .from('super_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (superAdminRow) {
    // Mirror the empresa branch below: a super-admin is confined to /admin,
    // never /dashboard or any other app route, exactly like an empresa user
    // is confined away from /admin. Without this, a super-admin without a
    // usuarios_empresa row would pass through here to /dashboard and only
    // get caught by the (app) layout's own guard — two layers disagreeing
    // on the rule instead of one rule enforced consistently.
    if (!path.startsWith('/admin')) return redirectTo('/admin')
    return response
  }

  const { data: empresaRow } = await admin
    .from('usuarios_empresa')
    .select('empresa_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (empresaRow) {
    if (path.startsWith('/admin')) return redirectTo('/dashboard')
    if (path === '/login' || path === '/') return redirectTo('/dashboard')
    return response
  }

  // Authenticated in Supabase Auth but linked to neither super_admins nor
  // usuarios_empresa — treat as invalid for this app.
  return redirectTo('/login')
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
```

- [ ] **Step 2: Verify with the dev server**

```bash
pnpm dev
```

Visit `/dashboard` while logged out — expect a redirect to `/login` (login page itself doesn't exist until Task 6, so this will 404 at `/login`; confirm the redirect happened by checking the URL bar, not the page content).

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add session and role-based routing middleware"
```

---

### Task 6: Login page

**Files:**
- Create: `src/app/login/page.tsx`

**Interfaces:**
- Consumes: `createClient()` from `src/lib/supabase/client.ts`.

- [ ] **Step 1: Create `src/app/login/page.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError('Correo o contraseña incorrectos.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
      <form onSubmit={handleSubmit} style={{ width: 360, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Comar-K</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>Inicia sesión en tu cuenta</p>

        <label style={{ fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }}>Correo electrónico</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
        />

        <label style={{ fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }}>Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
        />

        {error && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 14px' }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: 'none', backgroundColor: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 600, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
```

- [ ] **Step 2: Verify manually**

```bash
pnpm dev
```

Visit `/login`. At this point there's no user in Supabase Auth yet to sign in with — confirm the form renders and an incorrect login shows "Correo o contraseña incorrectos." Real sign-in is verified in Task 9 once a test user exists.

- [ ] **Step 3: Commit**

```bash
git add src/app/login
git commit -m "feat: add login page"
```

---

### Task 7: Protected app shell — Sidebar rewrite and route pages

**Files:**
- Modify: `src/components/Sidebar.tsx`, `src/components/Dashboard.tsx`
- Create: `src/app/(app)/layout.tsx`, `src/app/(app)/dashboard/page.tsx`, `src/app/(app)/clientes/page.tsx`, `src/app/(app)/catalogo/page.tsx`, `src/app/(app)/facturas/nueva/page.tsx`, `src/app/(app)/historial/page.tsx`, `src/app/(app)/reportes/page.tsx`, `src/app/(app)/configuracion/page.tsx`

**Interfaces:**
- Consumes: `createClient()` (server) from Task 4, `createAdminClient()` from Task 4.
- Produces: working navigation for every existing screen under real URLs.

- [ ] **Step 1: Rewrite `src/components/Sidebar.tsx`** to use routes instead of `View`/`onNavigate`

```tsx
'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, FileText, Users, Package, ScrollText, BarChart3, Settings, Zap } from 'lucide-react'

const navItems: { href: string; label: string; icon: React.ComponentType<{ size?: number; strokeWidth?: number }> }[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/facturas/nueva', label: 'Facturar', icon: FileText },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/catalogo', label: 'Catálogo', icon: Package },
  { href: '/historial', label: 'Historial', icon: ScrollText },
  { href: '/reportes', label: 'Reportes', icon: BarChart3 },
  { href: '/configuracion', label: 'Configuración', icon: Settings },
]

export default function Sidebar() {
  const pathname = usePathname()

  return (
    <aside style={{ position: 'fixed', top: 0, left: 0, width: 240, height: '100vh', backgroundColor: '#ffffff', borderRight: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', zIndex: 50 }}>
      <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#4f46e5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Zap size={18} color="#ffffff" strokeWidth={2.5} />
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#0f172a', letterSpacing: '-0.3px' }}>Comar-K</div>
            <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>Sistema de facturación</div>
          </div>
        </div>
      </div>

      <nav style={{ flex: 1, padding: '12px 12px', overflowY: 'auto' }}>
        <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '8px 8px 4px' }}>Principal</div>
        {navItems.slice(0, 2).map(item => (
          <NavItem key={item.href} item={item} active={pathname === item.href} />
        ))}

        <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '16px 8px 4px' }}>Administración</div>
        {navItems.slice(2, 5).map(item => (
          <NavItem key={item.href} item={item} active={pathname === item.href} />
        ))}

        <div style={{ fontSize: 10, fontWeight: 600, color: '#94a3b8', letterSpacing: '0.08em', textTransform: 'uppercase', padding: '16px 8px 4px' }}>Análisis</div>
        {navItems.slice(5, 6).map(item => (
          <NavItem key={item.href} item={item} active={pathname === item.href} />
        ))}
      </nav>

      <div style={{ padding: '12px', borderTop: '1px solid #f1f5f9' }}>
        <NavItem item={navItems[6]} active={pathname === navItems[6].href} />
      </div>
    </aside>
  )
}

function NavItem({ item, active }: { item: (typeof navItems)[number]; active: boolean }) {
  const Icon = item.icon
  return (
    <Link
      href={item.href}
      style={{
        width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 8,
        backgroundColor: active ? '#eef2ff' : 'transparent', color: active ? '#4f46e5' : '#475569',
        fontSize: 13.5, fontWeight: active ? 600 : 400, textDecoration: 'none', marginBottom: 2, fontFamily: 'Inter, sans-serif',
      }}
    >
      <Icon size={16} strokeWidth={active ? 2.5 : 2} />
      {item.label}
    </Link>
  )
}
```

Note: the hardcoded "Empresa Demo S.A. de C.V. / Plan Profesional" footer block from the prototype is dropped rather than kept as fake data — showing the real signed-in empresa's name belongs in a later sub-project once that data is wired up.

- [ ] **Step 2: Update `src/components/Dashboard.tsx`** — add `'use client'`, replace the `onNavigate` prop with `useRouter`

Add at the top of the file:

```tsx
'use client'

import { useRouter } from 'next/navigation'
```

Remove the `DashboardProps` interface and the `onNavigate` parameter:

```tsx
export default function Dashboard() {
  const router = useRouter()
```

Replace each `onNavigate('facturar')` with `router.push('/facturas/nueva')`, `onNavigate('clientes')` with `router.push('/clientes')`, and the two `onNavigate('historial')` calls with `router.push('/historial')`. Remove the now-unused `import type { View } from '../App'` line.

- [ ] **Step 3: Add `'use client'` to the remaining interactive components**

Add `'use client'` as the first line of `src/components/Catalogo.tsx`, `src/components/Clientes.tsx`, `src/components/NuevaFactura.tsx`, `src/components/Historial.tsx`, and `src/components/Configuracion.tsx` (all use `useState`/event handlers, which require a Client Component boundary in the App Router). `StatusBadge.tsx` stays a Server Component — it has no hooks or handlers.

- [ ] **Step 4: Create `src/app/(app)/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: empresaRow } = await admin
    .from('usuarios_empresa')
    .select('empresa_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!empresaRow) redirect('/admin')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  )
}
```

This is a defense-in-depth check in addition to the middleware from Task 5 — if the middleware matcher is ever changed, this layout still enforces the same rule server-side.

- [ ] **Step 5: Create the seven thin route pages**

`src/app/(app)/dashboard/page.tsx`:

```tsx
import Dashboard from '@/components/Dashboard'

export default function DashboardPage() {
  return <Dashboard />
}
```

`src/app/(app)/clientes/page.tsx`:

```tsx
import Clientes from '@/components/Clientes'

export default function ClientesPage() {
  return <Clientes />
}
```

`src/app/(app)/catalogo/page.tsx`:

```tsx
import Catalogo from '@/components/Catalogo'

export default function CatalogoPage() {
  return <Catalogo />
}
```

`src/app/(app)/facturas/nueva/page.tsx`:

```tsx
import NuevaFactura from '@/components/NuevaFactura'

export default function NuevaFacturaPage() {
  return <NuevaFactura />
}
```

`src/app/(app)/historial/page.tsx`:

```tsx
import Historial from '@/components/Historial'

export default function HistorialPage() {
  return <Historial />
}
```

`src/app/(app)/reportes/page.tsx`:

```tsx
import Reportes from '@/components/Reportes'

export default function ReportesPage() {
  return <Reportes />
}
```

`src/app/(app)/configuracion/page.tsx`:

```tsx
import Configuracion from '@/components/Configuracion'

export default function ConfiguracionPage() {
  return <Configuracion />
}
```

- [ ] **Step 6: Verify by browsing manually**

```bash
pnpm dev
```

Without a real login yet, this can only be confirmed to compile and to redirect to `/login` (Task 5's middleware plus Step 4's layout guard both fire for an unauthenticated request). Full click-through happens in Task 9 once a test user exists — note that as a follow-up check, don't mark this done as "verified in-browser" until Task 9's manual pass.

- [ ] **Step 7: Commit**

```bash
git add src/components/Sidebar.tsx src/components/Dashboard.tsx src/components/Catalogo.tsx src/components/Clientes.tsx src/components/NuevaFactura.tsx src/components/Historial.tsx src/components/Configuracion.tsx "src/app/(app)"
git commit -m "feat: migrate views to real Next.js routes"
```

---

### Task 8: Admin panel (super-admin only, read-only empresa list)

**Files:**
- Create: `src/app/admin/layout.tsx`, `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `createClient()` (server) and `createAdminClient()` from Task 4.

- [ ] **Step 1: Create `src/app/admin/layout.tsx`**

```tsx
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: superAdminRow } = await admin
    .from('super_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!superAdminRow) redirect('/dashboard')

  return (
    <div style={{ minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <header style={{ padding: '20px 32px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>Comar-K · Panel de super-admin</h1>
      </header>
      <main style={{ padding: '32px' }}>{children}</main>
    </div>
  )
}
```

- [ ] **Step 2: Create `src/app/admin/page.tsx`**

```tsx
import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminPage() {
  const admin = createAdminClient()
  const { data: empresas, error } = await admin
    .from('empresas')
    .select('id, nombre, rfc_emisor, creada_en')
    .order('creada_en', { ascending: false })

  if (error) {
    return <p style={{ color: '#dc2626', fontSize: 13 }}>Error al cargar empresas: {error.message}</p>
  }

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: '0 0 16px' }}>
        Empresas registradas ({empresas?.length ?? 0})
      </h2>
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              {['Nombre', 'RFC emisor', 'Alta'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(empresas ?? []).map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>{e.nombre}</td>
                <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#475569' }}>{e.rfc_emisor}</td>
                <td style={{ padding: '12px 16px', color: '#64748b' }}>{new Date(e.creada_en).toLocaleDateString('es-MX')}</td>
              </tr>
            ))}
            {(empresas ?? []).length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  Sin empresas registradas todavía
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin
git commit -m "feat: add read-only super-admin panel"
```

(Manual verification of `/admin` access control happens in Task 9, once real super-admin and empresa-user test accounts exist to check both the allow and deny paths.)

---

### Task 9: RLS integration test and full manual verification

**Files:**
- Create: `tests/integration/rls-multiempresa.test.ts`, `tests/integration/schema-smoke.test.ts`

**Interfaces:**
- Consumes: `Database` type and `createAdminClient()` from Task 4.

(Correction found during Task 9 execution: both test files import `createAdminClient()`, which imports `server-only`, and crash at import time under Vitest with "This module cannot be imported from a Client Component module." `server-only`'s `package.json` only defines two export conditions — `react-server` (non-throwing, set by Next's own webpack config for RSC bundling) and `default` (throwing) — and Vite/Vitest's module resolution never sets `react-server`, so it always hits the throwing entry regardless of `test.environment` (jsdom vs. node only swaps DOM globals; it doesn't touch export-conditions resolution, which was the wrong theory tried and empirically disproven during this task). The correct, narrowly-scoped fix is `vi.mock('server-only', () => ({}))` at the top of each file, before the `createAdminClient` import — it neutralizes the guard only in these two files, which legitimately need to call the admin client directly as their entire purpose, while leaving the guard fully intact for every other file in the suite. A global fix via `vitest.config.ts`'s `resolve.alias` was considered and rejected: it would silently disable this safety check for the whole test suite, including any future test that accidentally renders a client component importing `admin.ts`.)

- [ ] **Step 1: Write the RLS test — `tests/integration/rls-multiempresa.test.ts`**

```ts
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error(
    'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY deben estar en .env.local para correr esta prueba.',
  )
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const admin = createAdminClient()

const suffix = Date.now()
const empresaAEmail = `rls-test-a-${suffix}@example.com`
const empresaBEmail = `rls-test-b-${suffix}@example.com`
const password = 'Test-password-123!'

let empresaAId: string
let empresaBId: string
let userAId: string
let userBId: string
let clienteBId: string

beforeAll(async () => {
  const { data: empresaA, error: empresaAError } = await admin
    .from('empresas')
    .insert({ nombre: `RLS Test Empresa A ${suffix}`, rfc_emisor: 'AAA010101AAA', regimen_fiscal: '601', cp_emisor: '00000' })
    .select('id')
    .single()
  if (empresaAError) throw empresaAError
  empresaAId = empresaA.id

  const { data: empresaB, error: empresaBError } = await admin
    .from('empresas')
    .insert({ nombre: `RLS Test Empresa B ${suffix}`, rfc_emisor: 'BBB010101BBB', regimen_fiscal: '601', cp_emisor: '00000' })
    .select('id')
    .single()
  if (empresaBError) throw empresaBError
  empresaBId = empresaB.id

  const { data: userA, error: userAError } = await admin.auth.admin.createUser({ email: empresaAEmail, password, email_confirm: true })
  if (userAError) throw userAError
  userAId = userA.user.id

  const { data: userB, error: userBError } = await admin.auth.admin.createUser({ email: empresaBEmail, password, email_confirm: true })
  if (userBError) throw userBError
  userBId = userB.user.id

  const { error: linkAError } = await admin.from('usuarios_empresa').insert({ user_id: userAId, empresa_id: empresaAId })
  if (linkAError) throw linkAError

  const { error: linkBError } = await admin.from('usuarios_empresa').insert({ user_id: userBId, empresa_id: empresaBId })
  if (linkBError) throw linkBError

  const { data: clienteB, error: clienteBError } = await admin
    .from('clientes')
    .insert({ empresa_id: empresaBId, nombre: 'Cliente secreto de Empresa B', rfc: 'CSE010101AAA', regimen_fiscal: '601', codigo_postal: '00000', uso_cfdi: 'G03' })
    .select('id')
    .single()
  if (clienteBError) throw clienteBError
  clienteBId = clienteB.id
})

afterAll(async () => {
  await admin.from('clientes').delete().eq('empresa_id', empresaBId)
  await admin.from('clientes').delete().eq('empresa_id', empresaAId)
  await admin.auth.admin.deleteUser(userAId)
  await admin.auth.admin.deleteUser(userBId)
  await admin.from('usuarios_empresa').delete().in('empresa_id', [empresaAId, empresaBId])
  await admin.from('empresas').delete().in('id', [empresaAId, empresaBId])
})

describe('RLS aisla datos entre empresas', () => {
  it('un usuario de la Empresa A no puede leer clientes de la Empresa B con el cliente anon', async () => {
    const anon = createSupabaseClient<Database>(url, anonKey)
    const { error: signInError } = await anon.auth.signInWithPassword({ email: empresaAEmail, password })
    expect(signInError).toBeNull()

    const { data: clientesVisibles, error: selectError } = await anon.from('clientes').select('id').eq('id', clienteBId)

    expect(selectError).toBeNull()
    expect(clientesVisibles).toEqual([])
  })

  it('un usuario de la Empresa A sigue viendo sus propios clientes', async () => {
    const { data: clienteA, error: clienteAError } = await admin
      .from('clientes')
      .insert({ empresa_id: empresaAId, nombre: 'Cliente propio de Empresa A', rfc: 'CPA010101AAA', regimen_fiscal: '601', codigo_postal: '00000', uso_cfdi: 'G03' })
      .select('id')
      .single()
    expect(clienteAError).toBeNull()

    const anon = createSupabaseClient<Database>(url, anonKey)
    await anon.auth.signInWithPassword({ email: empresaAEmail, password })

    const { data: propios, error: selectError } = await anon.from('clientes').select('id').eq('id', clienteA!.id)

    expect(selectError).toBeNull()
    expect(propios).toHaveLength(1)
  })
})
```

- [ ] **Step 2: Write the schema smoke test — `tests/integration/schema-smoke.test.ts`**

The RLS test above only exercises `empresas`, `usuarios_empresa`, and `clientes`. The design doc's acceptance criteria also require validating every table with a real insert (`productos`, `facturas`, `conceptos`, `super_admins`), which this test covers:

```ts
import { afterAll, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createAdminClient } from '@/lib/supabase/admin'
import type { Database } from '@/lib/supabase/database.types'

const admin = createAdminClient()
const suffix = Date.now()

let empresaId: string
let clienteId: string
let facturaId: string
let productoId: string
let userId: string

afterAll(async () => {
  if (facturaId) await admin.from('conceptos').delete().eq('factura_id', facturaId)
  if (facturaId) await admin.from('facturas').delete().eq('id', facturaId)
  if (clienteId) await admin.from('clientes').delete().eq('id', clienteId)
  if (productoId) await admin.from('productos').delete().eq('id', productoId)
  if (userId) await admin.from('super_admins').delete().eq('user_id', userId)
  if (userId) await admin.auth.admin.deleteUser(userId)
  if (empresaId) await admin.from('empresas').delete().eq('id', empresaId)
})

describe('esquema Supabase — smoke test de todas las tablas', () => {
  it('permite insertar una fila en cada tabla de negocio vía el cliente admin', async () => {
    const { data: empresa, error: empresaError } = await admin
      .from('empresas')
      .insert({ nombre: `Schema Smoke Test ${suffix}`, rfc_emisor: 'SST010101AAA', regimen_fiscal: '601', cp_emisor: '00000' })
      .select('id')
      .single()
    expect(empresaError).toBeNull()
    empresaId = empresa!.id

    const { data: user, error: userError } = await admin.auth.admin.createUser({
      email: `schema-smoke-${suffix}@example.com`,
      password: 'Test-password-123!',
      email_confirm: true,
    })
    expect(userError).toBeNull()
    userId = user!.user.id

    const { error: superAdminError } = await admin.from('super_admins').insert({ user_id: userId })
    expect(superAdminError).toBeNull()

    const { data: producto, error: productoError } = await admin
      .from('productos')
      .insert({ empresa_id: empresaId, clave_sat: '81161500', clave_unidad: 'E48', nombre: 'Producto de prueba', precio: 100, iva: 16 })
      .select('id')
      .single()
    expect(productoError).toBeNull()
    productoId = producto!.id

    const { data: cliente, error: clienteError } = await admin
      .from('clientes')
      .insert({ empresa_id: empresaId, nombre: 'Cliente de prueba', rfc: 'CDP010101AAA', regimen_fiscal: '601', codigo_postal: '00000', uso_cfdi: 'G03' })
      .select('id')
      .single()
    expect(clienteError).toBeNull()
    clienteId = cliente!.id

    const { data: factura, error: facturaError } = await admin
      .from('facturas')
      .insert({ empresa_id: empresaId, cliente_id: clienteId, folio: 'SMOKE-001', subtotal: 100, iva_total: 16, total: 116 })
      .select('id')
      .single()
    expect(facturaError).toBeNull()
    facturaId = factura!.id

    const { error: conceptoError } = await admin
      .from('conceptos')
      .insert({ factura_id: facturaId, clave_sat: '81161500', descripcion: 'Concepto de prueba', cantidad: 1, precio_unitario: 100, iva: 16, importe: 100 })
    expect(conceptoError).toBeNull()
  })
})
```

- [ ] **Step 3: Run both integration tests to verify they pass against the live Supabase project**

```bash
pnpm test
```

Expected: `rls-multiempresa` (2 cases) and `schema-smoke` (1 case) all pass. If the RLS case fails (Empresa B's client is visible), stop — it means either the RLS patch from Task 2 wasn't applied, or a policy in `2026-07-06-schema.sql` is wrong. If the schema smoke test fails on a specific table, that table's columns don't match `database.types.ts` or the applied schema — fix the mismatch before continuing. Do not proceed to sign this sub-project off until both pass.

- [ ] **Step 4: Manually create one super-admin account for end-to-end verification**

Ask the user: "Para probar el panel `/admin` de principio a fin necesito un usuario real marcado como super-admin. ¿Quieres que cree uno de prueba yo mismo (usando la service role key, vía un script puntual) o prefieres darme el user_id de una cuenta que ya exista en Supabase Auth para insertarlo en `super_admins`?" Act on their answer, inserting the row via the admin client (a one-off script or the Supabase SQL Editor, per their preference) — do not leave this ambiguous.

- [ ] **Step 5: Full manual walkthrough**

```bash
pnpm dev
```

Verify, in the browser:
1. Logged out, visiting `/dashboard` redirects to `/login`.
2. Signing in as the Empresa A test user (from Step 1's fixtures, or a fresh one) lands on `/dashboard`, and all seven sidebar links navigate correctly with the existing visual design intact.
3. Signing in as the super-admin account from Step 3 lands on `/admin` and lists at least the two RLS-test empresas (if the test's `afterAll` hasn't already cleaned them up — re-run only the `beforeAll` fixture manually if needed, or just confirm the table renders with whatever empresas currently exist).
4. Signing in as the Empresa A user and manually navigating to `/admin` redirects back to `/dashboard`.
5. Signing in as the super-admin and navigating to `/dashboard` redirects to `/admin` (per the middleware rule).

- [ ] **Step 6: Commit**

```bash
git add tests/integration/rls-multiempresa.test.ts tests/integration/schema-smoke.test.ts
git commit -m "test: verify RLS isolation and validate schema with a smoke test per table"
```

---

### Task 10: Final cleanup and documentation

**Files:**
- Modify: `AGENTS.md`
- Move: `prompt-claude-code-comar-k.md`, `prompt-claude-code-sub1-arquitectura.md` → `docs/superpowers/specs/`

**Interfaces:** none.

- [ ] **Step 1: Update `AGENTS.md`** to remove the now-false Figma Make/Vite description

Replace the "Development Server" section (which claims "A Vite development server is always running... `figma-make-app`... Preview URL: the user can access the running app through the preview panel") and the "Key Files" list (`src/App.tsx`, `vite.config.ts`) with:

```markdown
## Development Server

Run `pnpm dev` to start the Next.js dev server on `$PORT` (default 8443).

## Key Files

- `src/app/` - Next.js App Router routes
- `src/components/` - shared UI components (Dashboard, Clientes, Catalogo, NuevaFactura, Historial, Reportes, Configuracion, Sidebar, StatusBadge)
- `src/lib/supabase/` - Supabase clients (browser, server, admin) and generated database types
- `src/middleware.ts` - session and role-based route protection
- `package.json` - Dependencies and scripts
- `next.config.ts` - Next.js configuration
```

Also remove the "figma-make-app" project description line at the top if present, replacing it with a one-line description of Comar-K as a real Next.js + Supabase app (no longer a Figma Make prototype).

- [ ] **Step 2: Relocate the stray prompt files**

```bash
git mv prompt-claude-code-comar-k.md docs/superpowers/specs/2026-07-06-prompt-comar-k.md
git mv prompt-claude-code-sub1-arquitectura.md docs/superpowers/specs/2026-07-06-prompt-sub1-arquitectura.md
```

- [ ] **Step 3: Full acceptance-criteria pass**

Confirm each item from `docs/superpowers/specs/2026-07-06-arquitectura-base-design.md`:
- [ ] Next.js runs, all seven screens reachable by real routes (verified in Task 9, Step 5.2).
- [ ] Login works against real Supabase Auth (verified in Task 9, Step 5.2).
- [ ] RLS isolation proven by an automated test (Task 9, Step 3) — not just manually.
- [ ] Schema validated with a real insert per table (Task 9, Step 2's smoke test).
- [ ] `/admin` is super-admin-only (verified in Task 9, Steps 5.3–5.5).
- [ ] Service role key is read from `process.env.SUPABASE_SERVICE_ROLE_KEY` in exactly one place (`src/lib/supabase/admin.ts`) — every other consumer (middleware, layouts, tests) goes through `createAdminClient()` instead of reading the env var directly. Grep to confirm:

```bash
grep -rl "process.env.SUPABASE_SERVICE_ROLE_KEY" src/
```

Expected: only `src/lib/supabase/admin.ts` in the output.

- [ ] **Step 4: Commit**

```bash
git add AGENTS.md docs/superpowers/specs
git commit -m "docs: update AGENTS.md for Next.js, file away planning prompts"
```
