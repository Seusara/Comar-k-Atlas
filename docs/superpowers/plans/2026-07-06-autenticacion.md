# Autenticación (alta/baja real de empresas + logout) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the read-only `/admin` empresa list with real create/delete flows (with rollback on partial failure), and add a working logout button across the app.

**Architecture:** Business logic (create/delete an empresa + its Auth user + the `usuarios_empresa` link, including manual rollback since there's no cross-service transaction between Postgres and Supabase Auth) lives in two plain, framework-independent functions under `src/lib/empresas/`. Next.js Route Handlers under `src/app/admin/empresas/` are thin wrappers: they check session + `super_admins` membership server-side, then call the plain functions. A new Client Component (`EmpresasManager`) drives the `/admin` page's modal-based create form and per-row delete buttons via `fetch()` against those routes. A shared `LogoutButton` component calls `supabase.auth.signOut()` from both the empresa-user Sidebar and the admin header.

**Tech Stack:** Next.js Route Handlers (App Router), `@supabase/supabase-js` Admin API (`auth.admin.createUser`/`deleteUser`), React Client Components, Vitest integration tests against the live Supabase project (same convention as sub-project 1).

## Global Constraints

- Reuse existing infrastructure — `createAdminClient()` (`src/lib/supabase/admin.ts`), `createClient()` server/browser variants, `Database` types. Do not redefine or duplicate these.
- Every Route Handler under `/admin/empresas` MUST check session + `super_admins` membership server-side (via the admin client, never the anon client — `super_admins` has RLS with no policy for anon/authenticated) before doing anything else. Never rely on the `/admin` page/UI being hidden as the only access control — the route is directly callable over HTTP regardless of what UI calls it.
- No native cross-service transaction exists between Postgres and Supabase Auth. Rollback on partial failure must be explicit, in reverse order of creation, with each step's error checked.
- Passwords must never be logged (no `console.log`/`console.error` of request bodies or full error objects that might embed them).
- TypeScript strict mode, no `any`, anywhere in new or touched code.
- Visual style matches the existing app's inline-style convention (see `src/components/Clientes.tsx`'s modal for the closest existing pattern) — no Tailwind utility classes introduced for these new components, no redesign.
- Package manager is pnpm.
- Integration tests hit the live Supabase project directly (same project used throughout sub-project 1) and clean up everything they create.
- Reference docs: `docs/superpowers/specs/2026-07-06-autenticacion-design.md` (spec for this sub-project), `docs/superpowers/specs/2026-07-06-schema.sql` (applied schema).

## Design decisions made during plan-writing (spec left these open)

- **Route paths:** `POST /admin/empresas` → `src/app/admin/empresas/route.ts`; `DELETE /admin/empresas/:id` → `src/app/admin/empresas/[id]/route.ts`.
- **Create-empresa UI:** a modal (matching the existing "Nuevo cliente" modal pattern in the original prototype), not a separate page.
- **Testing strategy for the Route Handlers:** Next.js Route Handlers use `next/headers`, which only works inside the real Next.js request-handling runtime — you cannot import and invoke a Route Handler's exported function directly from Vitest the way sub-project 1's tests called Supabase directly. So the actual create/delete **business logic** (with its rollback behavior) is extracted into two plain functions — `crearEmpresa` and `eliminarEmpresa` — that take an already-constructed admin client and plain data, with no Next.js dependency at all. The integration tests call these functions directly (real Supabase, no mocking, matching sub-project 1's testing philosophy). The Route Handlers' own auth-guard behavior (a non-super-admin can't call these routes) is verified in Task 4's manual walkthrough, the same way sub-project 1 verified `/admin` page access control.

---

### Task 1: Business logic — `crearEmpresa` and `eliminarEmpresa`

**Files:**
- Create: `src/lib/empresas/crear-empresa.ts`, `src/lib/empresas/eliminar-empresa.ts`
- Test: `tests/integration/gestion-empresas.test.ts`

**Interfaces:**
- Consumes: `Database` type and `createAdminClient()` from sub-project 1 (`src/lib/supabase/database.types.ts`, `src/lib/supabase/admin.ts`).
- Produces: `crearEmpresa(admin: SupabaseClient<Database>, input: CrearEmpresaInput): Promise<CrearEmpresaResult>` and `eliminarEmpresa(admin: SupabaseClient<Database>, empresaId: string): Promise<EliminarEmpresaResult>`, where:
  ```ts
  export interface CrearEmpresaInput {
    nombre: string
    rfcEmisor: string
    regimenFiscal: string
    cpEmisor: string
    email: string
    password: string
  }
  export type CrearEmpresaResult = { empresaId: string } | { error: string }
  export type EliminarEmpresaResult = { success: true } | { error: string }
  ```
  Task 2's Route Handlers and Task 1's own tests both import these.

- [ ] **Step 1: Write the failing test — `tests/integration/gestion-empresas.test.ts`**

```ts
import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { crearEmpresa } from '@/lib/empresas/crear-empresa'
import { eliminarEmpresa } from '@/lib/empresas/eliminar-empresa'
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

describe('crearEmpresa', () => {
  it('crea empresa + usuario + vínculo, y el usuario puede iniciar sesión como usuario de empresa (no super-admin)', async () => {
    const email = `gestion-empresa-${suffix}@example.com`
    const password = 'Test-password-123!'

    const result = await crearEmpresa(admin, {
      nombre: `Empresa Gestión Test ${suffix}`,
      rfcEmisor: 'GET010101AAA',
      regimenFiscal: '601',
      cpEmisor: '00000',
      email,
      password,
    })

    expect('error' in result).toBe(false)
    if ('error' in result) throw new Error(result.error)

    try {
      const anon = createSupabaseClient<Database>(url, anonKey)
      const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password })
      expect(signInError).toBeNull()
      expect(signIn.user).not.toBeNull()

      const { data: link } = await admin
        .from('usuarios_empresa')
        .select('empresa_id')
        .eq('user_id', signIn.user!.id)
        .maybeSingle()
      expect(link?.empresa_id).toBe(result.empresaId)

      const { data: superAdminRow } = await admin
        .from('super_admins')
        .select('user_id')
        .eq('user_id', signIn.user!.id)
        .maybeSingle()
      expect(superAdminRow).toBeNull()
    } finally {
      await eliminarEmpresa(admin, result.empresaId)
    }
  })

  it('hace rollback de la empresa si falla la creación del usuario (email duplicado)', async () => {
    const email = `gestion-empresa-dup-${suffix}@example.com`
    const password = 'Test-password-123!'

    const { error: preCreateError } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    expect(preCreateError).toBeNull()

    try {
      const nombre = `Empresa Rollback Test ${suffix}`
      const result = await crearEmpresa(admin, {
        nombre,
        rfcEmisor: 'ROL010101AAA',
        regimenFiscal: '601',
        cpEmisor: '00000',
        email,
        password,
      })

      expect('error' in result).toBe(true)

      const { data: orphanedEmpresa } = await admin.from('empresas').select('id').eq('nombre', nombre).maybeSingle()
      expect(orphanedEmpresa).toBeNull()
    } finally {
      const { data: usersList } = await admin.auth.admin.listUsers()
      const preExisting = usersList.users.find(u => u.email === email)
      if (preExisting) await admin.auth.admin.deleteUser(preExisting.id)
    }
  })
})

describe('eliminarEmpresa', () => {
  it('elimina el usuario de Auth y no deja filas huérfanas en las tablas dependientes', async () => {
    const email = `gestion-empresa-delete-${suffix}@example.com`
    const password = 'Test-password-123!'

    const result = await crearEmpresa(admin, {
      nombre: `Empresa Eliminar Test ${suffix}`,
      rfcEmisor: 'ELI010101AAA',
      regimenFiscal: '601',
      cpEmisor: '00000',
      email,
      password,
    })
    if ('error' in result) throw new Error(result.error)
    const empresaId = result.empresaId

    await admin
      .from('clientes')
      .insert({ empresa_id: empresaId, nombre: 'Cliente de prueba', rfc: 'CDT010101AAA', regimen_fiscal: '601', codigo_postal: '00000', uso_cfdi: 'G03' })

    const deleteResult = await eliminarEmpresa(admin, empresaId)
    expect(deleteResult).toEqual({ success: true })

    const anon = createSupabaseClient<Database>(url, anonKey)
    const { error: signInError } = await anon.auth.signInWithPassword({ email, password })
    expect(signInError).not.toBeNull()

    const { data: remainingClientes } = await admin.from('clientes').select('id').eq('empresa_id', empresaId)
    expect(remainingClientes).toEqual([])

    const { data: remainingLink } = await admin.from('usuarios_empresa').select('user_id').eq('empresa_id', empresaId)
    expect(remainingLink).toEqual([])

    const { data: remainingEmpresa } = await admin.from('empresas').select('id').eq('id', empresaId).maybeSingle()
    expect(remainingEmpresa).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `pnpm test`
Expected: FAIL — `Cannot find module '@/lib/empresas/crear-empresa'` (and `eliminar-empresa`), since neither file exists yet.

- [ ] **Step 3: Write `src/lib/empresas/crear-empresa.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export interface CrearEmpresaInput {
  nombre: string
  rfcEmisor: string
  regimenFiscal: string
  cpEmisor: string
  email: string
  password: string
}

export type CrearEmpresaResult = { empresaId: string } | { error: string }

export async function crearEmpresa(admin: SupabaseClient<Database>, input: CrearEmpresaInput): Promise<CrearEmpresaResult> {
  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .insert({
      nombre: input.nombre,
      rfc_emisor: input.rfcEmisor,
      regimen_fiscal: input.regimenFiscal,
      cp_emisor: input.cpEmisor,
    })
    .select('id')
    .single()

  if (empresaError || !empresa) {
    return { error: `No se pudo crear la empresa: ${empresaError?.message ?? 'error desconocido'}` }
  }

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  })

  if (userError || !userData.user) {
    await admin.from('empresas').delete().eq('id', empresa.id)
    return { error: `No se pudo crear el usuario: ${userError?.message ?? 'error desconocido'}` }
  }

  const { error: linkError } = await admin
    .from('usuarios_empresa')
    .insert({ user_id: userData.user.id, empresa_id: empresa.id })

  if (linkError) {
    await admin.auth.admin.deleteUser(userData.user.id)
    await admin.from('empresas').delete().eq('id', empresa.id)
    return { error: `No se pudo vincular el usuario a la empresa: ${linkError.message}` }
  }

  return { empresaId: empresa.id }
}
```

- [ ] **Step 4: Write `src/lib/empresas/eliminar-empresa.ts`**

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export type EliminarEmpresaResult = { success: true } | { error: string }

export async function eliminarEmpresa(admin: SupabaseClient<Database>, empresaId: string): Promise<EliminarEmpresaResult> {
  const { data: link, error: linkError } = await admin
    .from('usuarios_empresa')
    .select('user_id')
    .eq('empresa_id', empresaId)
    .maybeSingle()

  if (linkError) {
    return { error: `No se pudo buscar el usuario de la empresa: ${linkError.message}` }
  }

  if (link) {
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(link.user_id)
    if (deleteUserError) {
      return { error: `No se pudo eliminar el usuario: ${deleteUserError.message}` }
    }
  }

  const { error: empresaError } = await admin.from('empresas').delete().eq('id', empresaId)
  if (empresaError) {
    return { error: `No se pudo eliminar la empresa: ${empresaError.message}` }
  }

  return { success: true }
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm test`
Expected: all 3 new cases pass (2 in `crearEmpresa`, 1 in `eliminarEmpresa`), plus the pre-existing 6 from sub-project 1 — 9/9 total.

- [ ] **Step 6: Type-check**

Run: `pnpm run typecheck`
Expected: no new errors (the 2 pre-existing Recharts errors in `Dashboard.tsx`/`Reportes.tsx` remain, unrelated to this task).

- [ ] **Step 7: Commit**

```bash
git add src/lib/empresas tests/integration/gestion-empresas.test.ts
git commit -m "feat: add crearEmpresa/eliminarEmpresa business logic with rollback"
```

---

### Task 2: Route Handlers — `POST /admin/empresas`, `DELETE /admin/empresas/:id`

**Files:**
- Create: `src/app/admin/empresas/route.ts`, `src/app/admin/empresas/[id]/route.ts`

**Interfaces:**
- Consumes: `crearEmpresa`/`eliminarEmpresa` from Task 1, `createClient()` (server) and `createAdminClient()` from sub-project 1.
- Produces: `POST /admin/empresas` (JSON body: `{ nombre, rfcEmisor, regimenFiscal, cpEmisor, email, password }`, returns `201` with `{ empresaId }` or `400`/`401`/`403` with `{ error }`); `DELETE /admin/empresas/:id` (returns `200` with `{ success: true }` or `400`/`401`/`403` with `{ error }`) — both consumed by Task 3's `EmpresasManager`.

- [ ] **Step 1: Create `src/app/admin/empresas/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { crearEmpresa } from '@/lib/empresas/crear-empresa'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: superAdminRow } = await admin
    .from('super_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!superAdminRow) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const body = await request.json()
  const { nombre, rfcEmisor, regimenFiscal, cpEmisor, email, password } = body

  if (!nombre || !rfcEmisor || !regimenFiscal || !cpEmisor || !email || !password) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const result = await crearEmpresa(admin, { nombre, rfcEmisor, regimenFiscal, cpEmisor, email, password })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ empresaId: result.empresaId }, { status: 201 })
}
```

- [ ] **Step 2: Create `src/app/admin/empresas/[id]/route.ts`**

```ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { eliminarEmpresa } from '@/lib/empresas/eliminar-empresa'

export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: superAdminRow } = await admin
    .from('super_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!superAdminRow) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { id } = await params
  const result = await eliminarEmpresa(admin, id)

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ success: true })
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Verify with the dev server (unauthenticated only — full auth-guard verification happens in Task 4)**

```bash
pnpm dev
```

```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:3000/admin/empresas -H "Content-Type: application/json" -d "{}"
```

Expected: `401` (no session cookie sent).

- [ ] **Step 5: Commit**

```bash
git add src/app/admin/empresas
git commit -m "feat: add POST/DELETE route handlers for empresa management"
```

---

### Task 3: Admin UI — create modal and delete buttons

**Files:**
- Create: `src/components/admin/EmpresasManager.tsx`
- Modify: `src/app/admin/page.tsx`

**Interfaces:**
- Consumes: `POST /admin/empresas` and `DELETE /admin/empresas/:id` from Task 2.
- Produces: `<EmpresasManager empresas={empresas} />` consumed by `admin/page.tsx`.

- [ ] **Step 1: Create `src/components/admin/EmpresasManager.tsx`**

```tsx
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Empresa {
  id: string
  nombre: string
  rfc_emisor: string
  creada_en: string
}

const emptyForm = { nombre: '', rfcEmisor: '', regimenFiscal: '601', cpEmisor: '', email: '', password: '' }

export default function EmpresasManager({ empresas }: { empresas: Empresa[] }) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const res = await fetch('/admin/empresas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Error al crear la empresa')
      setSubmitting(false)
      return
    }

    setShowModal(false)
    setForm(emptyForm)
    setSubmitting(false)
    router.refresh()
  }

  async function handleDelete(id: string, nombre: string) {
    if (!confirm(`¿Eliminar la empresa "${nombre}"? Esta acción no se puede deshacer.`)) return

    const res = await fetch(`/admin/empresas/${id}`, { method: 'DELETE' })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Error al eliminar la empresa')
      return
    }

    router.refresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: 0 }}>
          Empresas registradas ({empresas.length})
        </h2>
        <button
          onClick={() => setShowModal(true)}
          style={{ padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + Nueva empresa
        </button>
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              {['Nombre', 'RFC emisor', 'Alta', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {empresas.map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>{e.nombre}</td>
                <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#475569' }}>{e.rfc_emisor}</td>
                <td style={{ padding: '12px 16px', color: '#64748b' }}>{new Date(e.creada_en).toLocaleDateString('es-MX')}</td>
                <td style={{ padding: '12px 16px' }}>
                  <button
                    onClick={() => handleDelete(e.id, e.nombre)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', backgroundColor: '#fff5f5', color: '#dc2626', fontSize: 11.5, fontWeight: 500, cursor: 'pointer' }}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {empresas.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  Sin empresas registradas todavía
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 28, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 20px' }}>Nueva empresa</h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Razón social" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} required />
              <Field label="RFC emisor" value={form.rfcEmisor} onChange={v => setForm(f => ({ ...f, rfcEmisor: v }))} mono required />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Régimen fiscal</label>
                  <select value={form.regimenFiscal} onChange={e => setForm(f => ({ ...f, regimenFiscal: e.target.value }))} style={inputStyle}>
                    <option value="601">601 – Gral. de Ley PF</option>
                    <option value="612">612 – Personas Físicas</option>
                    <option value="626">626 – Simplificado de confianza</option>
                  </select>
                </div>
                <Field label="Código postal" value={form.cpEmisor} onChange={v => setForm(f => ({ ...f, cpEmisor: v }))} mono required />
              </div>
              <Field label="Correo del primer usuario" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} type="email" required />
              <Field label="Contraseña del primer usuario" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} type="password" required />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={submitting} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', backgroundColor: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? 'Creando…' : 'Crear empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }

function Field({ label, value, onChange, mono, required, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; mono?: boolean; required?: boolean; type?: string
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        style={{ ...inputStyle, fontFamily: mono ? 'monospace' : 'Inter, sans-serif' }}
      />
    </div>
  )
}
```

- [ ] **Step 2: Update `src/app/admin/page.tsx`** to use `EmpresasManager`

Replace the entire file with:

```tsx
import { createAdminClient } from '@/lib/supabase/admin'
import EmpresasManager from '@/components/admin/EmpresasManager'

export default async function AdminPage() {
  const admin = createAdminClient()
  const { data: empresas, error } = await admin
    .from('empresas')
    .select('id, nombre, rfc_emisor, creada_en')
    .order('creada_en', { ascending: false })

  if (error) {
    return <p style={{ color: '#dc2626', fontSize: 13 }}>Error al cargar empresas: {error.message}</p>
  }

  return <EmpresasManager empresas={empresas ?? []} />
}
```

- [ ] **Step 3: Type-check**

Run: `pnpm run typecheck`
Expected: no new errors.

- [ ] **Step 4: Verify manually**

```bash
pnpm dev
```

Full click-through (creating a real empresa via the modal, deleting it) happens in Task 4's manual walkthrough once logout exists too — for now, just confirm the page compiles and the modal opens/closes without a logged-in super-admin session (you'll see the `/admin` layout's own redirect first, which is expected and already covered by sub-project 1).

- [ ] **Step 5: Commit**

```bash
git add src/components/admin/EmpresasManager.tsx src/app/admin/page.tsx
git commit -m "feat: add empresa create modal and delete buttons to admin panel"
```

---

### Task 4: Logout button, manual verification, and wrap-up

**Files:**
- Create: `src/components/LogoutButton.tsx`
- Modify: `src/components/Sidebar.tsx`, `src/app/admin/layout.tsx`

**Interfaces:**
- Consumes: `createClient()` (browser) from sub-project 1.
- Produces: `<LogoutButton variant="sidebar" | "header" />` consumed by `Sidebar.tsx` and `admin/layout.tsx`.

- [ ] **Step 1: Create `src/components/LogoutButton.tsx`**

```tsx
'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton({ variant = 'sidebar' }: { variant?: 'sidebar' | 'header' }) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const style: React.CSSProperties =
    variant === 'sidebar'
      ? {
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 8,
          border: 'none', backgroundColor: 'transparent', color: '#475569', fontSize: 13.5, fontWeight: 400,
          textAlign: 'left', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        }
      : {
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
          border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', fontSize: 13, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        }

  return (
    <button onClick={handleLogout} style={style}>
      <LogOut size={16} strokeWidth={2} />
      Cerrar sesión
    </button>
  )
}
```

- [ ] **Step 2: Add it to `src/components/Sidebar.tsx`**

Add the import at the top:

```tsx
import LogoutButton from '@/components/LogoutButton'
```

Update the bottom section (currently just the `Configuración` `NavItem`):

```tsx
      <div style={{ padding: '12px', borderTop: '1px solid #f1f5f9' }}>
        <NavItem item={navItems[6]} active={pathname === navItems[6].href} />
        <LogoutButton />
      </div>
```

- [ ] **Step 3: Add it to `src/app/admin/layout.tsx`**

Add the import:

```tsx
import LogoutButton from '@/components/LogoutButton'
```

Update the header to a flex row with the button on the right:

```tsx
      <header style={{ padding: '20px 32px', borderBottom: '1px solid #e2e8f0', backgroundColor: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ fontSize: 18, fontWeight: 700, color: '#0f172a', margin: 0 }}>Comar-K · Panel de super-admin</h1>
        <LogoutButton variant="header" />
      </header>
```

- [ ] **Step 4: Type-check**

Run: `pnpm run typecheck`
Expected: no new errors.

- [ ] **Step 5: Full manual walkthrough (Playwright or browser)**

```bash
pnpm dev
```

Verify, signed in as the empresa test user from sub-project 1 (`empresa-verificacion@comark.local`):
1. Sidebar shows "Cerrar sesión" below Configuración; clicking it redirects to `/login`, and visiting `/dashboard` afterward redirects back to `/login` (session actually cleared).

Verify, signed in as the super-admin test user (`superadmin-verificacion@comark.local`):
2. `/admin` shows the "+ Nueva empresa" button and a "Cerrar sesión" button in the header.
3. Click "+ Nueva empresa", fill the form with a throwaway email/password, submit — the new empresa appears in the list without a page reload feeling (via `router.refresh()`).
4. Sign out, sign in with the throwaway email/password just created — lands on `/dashboard` (not `/admin`), confirming the created account is a real empresa user.
5. Sign back in as the super-admin, click "Eliminar" on the throwaway empresa, confirm the browser `confirm()` dialog — the row disappears.
6. Attempt to sign in again with the deleted throwaway credentials — fails (account no longer exists).
7. **Auth-guard check:** while signed in as the empresa test user (not super-admin), open the browser devtools console and run:
   ```js
   fetch('/admin/empresas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }).then(r => r.status)
   ```
   Expected: `403` (not `401`, since this user IS authenticated, just not a super-admin).

- [ ] **Step 6: Run the full automated test suite one more time**

```bash
pnpm test
```

Expected: all 9 tests pass (6 from sub-project 1 + 3 new from Task 1).

- [ ] **Step 7: Commit**

```bash
git add src/components/LogoutButton.tsx src/components/Sidebar.tsx "src/app/admin/layout.tsx"
git commit -m "feat: add logout button to Sidebar and admin header"
```
