# Timbrado CFDI (Facturama Multiemisor) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stamp real CFDI 4.0 invoices through Facturama's Multiemisor/Lite sandbox API, using each empresa's own RFC (via an uploaded CSD), with retry, real cancellation, and XML/PDF download.

**Architecture:** A `src/lib/facturama/client.ts` module wraps Facturama's HTTP API (CSD registration, CFDI creation, download, cancellation). Orchestration lives in small `src/lib/csd/*` and `src/lib/facturas/*` functions that take a Supabase client + plain input and return `{ ok: true } | { error: string }` — the same shape already used by `src/lib/empresas/crear-empresa.ts`. Next.js route handlers stay thin: auth check, parse input, delegate, translate to `NextResponse`. CSDs are encrypted (AES-256-GCM) before being backed up to a private Supabase Storage bucket.

**Tech Stack:** Next.js route handlers, Supabase (Postgres + Storage + Auth), Facturama Multiemisor/Lite sandbox API, Vitest for tests.

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-07-timbrado-cfdi-design.md` — every requirement in it must map to a task below.
- Facturama sandbox base URL: `https://apisandbox.facturama.mx`. Auth: HTTP Basic, `FACTURAMA_API_USER` / `FACTURAMA_API_PASSWORD` (already in `.env.local`, gitignored).
- New env var `CSD_ENCRYPTION_KEY` (32 random bytes, base64) must be generated and added to `.env.local` before Task 2's tests can pass.
- All new SQL runs manually in the Supabase SQL Editor (this project has no CLI migration runner — follow the existing `docs/superpowers/specs/2026-07-06-schema*.sql` convention).
- Tests: `pnpm vitest run <path>` (or `pnpm test` for the whole suite). Existing integration tests hit the real Supabase test project via `SUPABASE_SERVICE_ROLE_KEY`/anon key already in `.env.local` — new tests follow the same pattern (see `tests/integration/crear-factura.test.ts`).
- Business logic functions take a Supabase client as an explicit parameter (see `src/lib/empresas/crear-empresa.ts`) — this is what makes them testable without mocking the database.
- Never log or return raw CSD certificate/key/password bytes in any error message or response body.

---

### Task 1: Schema migration — CSD/timbrado columns, updated `crear_factura`, Storage bucket

**Files:**
- Create: `docs/superpowers/specs/2026-07-07-schema-timbrado-cfdi.sql`
- Modify: `src/lib/supabase/database.types.ts`
- Modify: `tests/integration/crear-factura.test.ts`

**Interfaces:**
- Produces: `crear_factura(p_cliente_id uuid, p_conceptos jsonb, p_forma_pago text, p_metodo_pago text)` RPC (replaces the old 2-arg signature). Every later task that creates a factura calls this 4-arg form.
- Produces: `empresas.csd_status: 'sin_registrar' | 'registrado'`, `empresas.csd_actualizado_en: string | null`, `facturas.facturama_id: string | null`, `facturas.error_timbrado: string | null`, `facturas.forma_pago: string`, `facturas.metodo_pago: string`, `conceptos.clave_unidad: string` — all later tasks rely on these exact column names.
- Produces: private Storage bucket `csd-backups`, used by Task 5/6.

- [ ] **Step 1: Write the SQL migration file**

```sql
-- Sub-proyecto 4: timbrado CFDI — correr en Supabase SQL Editor

alter table empresas
  add column csd_status text not null default 'sin_registrar',
  add column csd_actualizado_en timestamptz;

alter table empresas
  add constraint empresas_csd_status_check check (csd_status in ('sin_registrar', 'registrado'));

alter table facturas
  add column facturama_id text,
  add column error_timbrado text,
  add column forma_pago text not null default '99',
  add column metodo_pago text not null default 'PUE';

alter table facturas alter column forma_pago drop default;
alter table facturas alter column metodo_pago drop default;

alter table conceptos
  add column clave_unidad text not null default 'H87';

alter table conceptos alter column clave_unidad drop default;

-- Bucket privado para respaldo cifrado de CSDs. Sin policies de storage.objects
-- para 'anon'/'authenticated': solo el cliente admin (service role) del
-- servidor lo lee/escribe, igual que otras operaciones sensibles de este proyecto.
insert into storage.buckets (id, name, public)
values ('csd-backups', 'csd-backups', false)
on conflict (id) do nothing;

drop function if exists crear_factura(uuid, jsonb);

create or replace function crear_factura(
  p_cliente_id uuid,
  p_conceptos jsonb,
  p_forma_pago text,
  p_metodo_pago text
)
returns facturas
language plpgsql
security invoker
as $$
declare
  v_empresa_id uuid;
  v_folio_numero integer;
  v_folio text;
  v_factura facturas;
  v_subtotal numeric(12,2) := 0;
  v_iva_total numeric(12,2) := 0;
  v_total numeric(12,2) := 0;
  v_concepto jsonb;
  v_cantidad numeric(12,2);
  v_precio_unitario numeric(12,2);
  v_iva numeric(5,2);
  v_importe numeric(12,2);
begin
  v_empresa_id := public.empresa_id();
  if v_empresa_id is null then
    raise exception 'No se pudo determinar la empresa del usuario autenticado';
  end if;

  if not exists (
    select 1 from clientes where id = p_cliente_id and empresa_id = v_empresa_id
  ) then
    raise exception 'El cliente % no pertenece a la empresa del usuario autenticado', p_cliente_id;
  end if;

  if jsonb_array_length(p_conceptos) = 0 then
    raise exception 'La factura debe tener al menos un concepto';
  end if;

  for v_concepto in select * from jsonb_array_elements(p_conceptos)
  loop
    v_cantidad := (v_concepto->>'cantidad')::numeric(12,2);
    v_precio_unitario := (v_concepto->>'precio_unitario')::numeric(12,2);
    v_iva := (v_concepto->>'iva')::numeric(5,2);
    if v_cantidad <= 0 or v_precio_unitario < 0 or v_iva < 0 then
      raise exception 'Cada concepto requiere cantidad > 0, precio_unitario >= 0 e iva >= 0';
    end if;
    if coalesce(v_concepto->>'clave_unidad', '') = '' then
      raise exception 'Cada concepto requiere clave_unidad';
    end if;
    v_importe := v_cantidad * v_precio_unitario;
    v_subtotal := v_subtotal + v_importe;
    v_iva_total := v_iva_total + (v_importe * v_iva / 100);
  end loop;
  v_total := v_subtotal + v_iva_total;

  insert into folios_empresa (empresa_id, siguiente_folio)
  values (v_empresa_id, 1)
  on conflict (empresa_id) do nothing;

  update folios_empresa
  set siguiente_folio = siguiente_folio + 1
  where empresa_id = v_empresa_id
  returning siguiente_folio - 1 into v_folio_numero;

  v_folio := 'A-' || lpad(v_folio_numero::text, 4, '0');

  insert into facturas (empresa_id, cliente_id, folio, subtotal, iva_total, total, status, forma_pago, metodo_pago)
  values (v_empresa_id, p_cliente_id, v_folio, v_subtotal, v_iva_total, v_total, 'pendiente', p_forma_pago, p_metodo_pago)
  returning * into v_factura;

  for v_concepto in select * from jsonb_array_elements(p_conceptos)
  loop
    v_cantidad := (v_concepto->>'cantidad')::numeric(12,2);
    v_precio_unitario := (v_concepto->>'precio_unitario')::numeric(12,2);
    v_iva := (v_concepto->>'iva')::numeric(5,2);
    insert into conceptos (factura_id, clave_sat, clave_unidad, descripcion, cantidad, precio_unitario, iva, importe)
    values (
      v_factura.id,
      v_concepto->>'clave_sat',
      v_concepto->>'clave_unidad',
      v_concepto->>'descripcion',
      v_cantidad,
      v_precio_unitario,
      v_iva,
      v_cantidad * v_precio_unitario
    );
  end loop;

  return v_factura;
end;
$$;

grant execute on function crear_factura(uuid, jsonb, text, text) to authenticated;
```

Run this file's contents in the Supabase SQL Editor for the project referenced by `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` before continuing.

- [ ] **Step 2: Update `database.types.ts`**

In `src/lib/supabase/database.types.ts`, replace the `empresas` table block:

```typescript
      empresas: {
        Row: {
          id: string
          nombre: string
          rfc_emisor: string
          regimen_fiscal: string
          cp_emisor: string
          creada_en: string
          csd_status: 'sin_registrar' | 'registrado'
          csd_actualizado_en: string | null
        }
        Insert: {
          id?: string
          nombre: string
          rfc_emisor: string
          regimen_fiscal: string
          cp_emisor: string
          creada_en?: string
          csd_status?: 'sin_registrar' | 'registrado'
          csd_actualizado_en?: string | null
        }
        Update: Partial<Database['public']['Tables']['empresas']['Insert']>
        Relationships: []
      }
```

Replace the `facturas` table block:

```typescript
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
          facturama_id: string | null
          error_timbrado: string | null
          forma_pago: string
          metodo_pago: string
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
          facturama_id?: string | null
          error_timbrado?: string | null
          forma_pago: string
          metodo_pago: string
        }
        Update: Partial<Database['public']['Tables']['facturas']['Insert']>
        Relationships: []
      }
```

Replace the `conceptos` table block:

```typescript
      conceptos: {
        Row: {
          id: string
          factura_id: string
          clave_sat: string
          clave_unidad: string
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
          clave_unidad: string
          descripcion: string
          cantidad: number
          precio_unitario: number
          iva: number
          importe: number
        }
        Update: Partial<Database['public']['Tables']['conceptos']['Insert']>
        Relationships: []
      }
```

Replace the `Functions.crear_factura` block:

```typescript
    Functions: {
      crear_factura: {
        Args: { p_cliente_id: string; p_conceptos: Json; p_forma_pago: string; p_metodo_pago: string }
        Returns: Database['public']['Tables']['facturas']['Row']
      }
    }
```

- [ ] **Step 3: Update the existing `crear_factura` test to use the new signature**

In `tests/integration/crear-factura.test.ts`, every `p_conceptos` array literal gains `clave_unidad`, and every `anon.rpc('crear_factura', {...})` call gains `p_forma_pago`/`p_metodo_pago`. Apply this replacement to all five call sites in the file (the concepto objects and the rpc args object):

```typescript
    const { data, error } = await anon.rpc('crear_factura', {
      p_cliente_id: clienteAId,
      p_conceptos: [{ clave_sat: '81161500', clave_unidad: 'H87', descripcion: 'Servicio de prueba', cantidad: 2, precio_unitario: 100, iva: 16 }],
      p_forma_pago: '01',
      p_metodo_pago: 'PUE',
    })
```

(same two added fields — `clave_unidad: 'H87'` in every concepto object, `p_forma_pago: '01', p_metodo_pago: 'PUE'` in every rpc args object — for the "rechaza un cliente_id...", "no crea la factura...", "rechaza una cantidad negativa...", and both calls inside "genera folios consecutivos..." tests).

Also add a new test at the end of the `describe('crear_factura', ...)` block:

```typescript
  it('rechaza un concepto sin clave_unidad', async () => {
    const anon = createSupabaseClient<Database>(url, anonKey)
    await anon.auth.signInWithPassword({ email: empresaAEmail, password })

    const { error } = await anon.rpc('crear_factura', {
      p_cliente_id: clienteAId,
      p_conceptos: [{ clave_sat: '81161500', clave_unidad: '', descripcion: 'Sin unidad', cantidad: 1, precio_unitario: 100, iva: 16 }],
      p_forma_pago: '01',
      p_metodo_pago: 'PUE',
    })

    expect(error).not.toBeNull()
  })

  it('persiste forma_pago y metodo_pago en la factura creada', async () => {
    const anon = createSupabaseClient<Database>(url, anonKey)
    await anon.auth.signInWithPassword({ email: empresaAEmail, password })

    const { data, error } = await anon.rpc('crear_factura', {
      p_cliente_id: clienteAId,
      p_conceptos: [{ clave_sat: '81161500', clave_unidad: 'H87', descripcion: 'Pago', cantidad: 1, precio_unitario: 100, iva: 16 }],
      p_forma_pago: '03',
      p_metodo_pago: 'PPD',
    })

    expect(error).toBeNull()
    expect(data!.forma_pago).toBe('03')
    expect(data!.metodo_pago).toBe('PPD')
  })
```

- [ ] **Step 4: Run the tests**

Run: `pnpm vitest run tests/integration/crear-factura.test.ts`
Expected: all tests PASS (7 total: 5 pre-existing + 2 new).

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors (this will surface any other file still using the old 2-arg `crear_factura` signature or old column shapes — there should be none yet since Task 1 is the only schema-touching task so far, but the compiler will also flag `src/app/api/facturas/route.ts`'s existing `crear_factura` call as a type error until Task 8 updates it — that is expected and gets fixed in Task 8, not here).

- [ ] **Step 6: Commit**

```bash
git add docs/superpowers/specs/2026-07-07-schema-timbrado-cfdi.sql src/lib/supabase/database.types.ts tests/integration/crear-factura.test.ts
git commit -m "feat: add CSD/timbrado columns, csd-backups bucket, and forma_pago/metodo_pago/clave_unidad to crear_factura"
```

---

### Task 2: CSD encryption module

**Files:**
- Create: `src/lib/csd-crypto.ts`
- Test: `src/lib/csd-crypto.test.ts`

**Interfaces:**
- Produces: `encryptCsd(payload: CsdPayload): Buffer`, `decryptCsd(blob: Buffer): CsdPayload`, `interface CsdPayload { certificateBase64: string; privateKeyBase64: string; password: string }`. Task 5/6 depend on these exact names and shapes.

- [ ] **Step 1: Generate the encryption key and add it to `.env.local`**

Run: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

Copy the output and add a line to `.env.local` (not `.env.local.example` — this is a real secret):

```
CSD_ENCRYPTION_KEY=<paste the generated value here>
```

Also add the blank placeholder to `.env.local.example`:

```
CSD_ENCRYPTION_KEY=
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/lib/csd-crypto.test.ts
import { describe, expect, it } from 'vitest'
import { encryptCsd, decryptCsd, type CsdPayload } from './csd-crypto'

describe('csd-crypto', () => {
  const payload: CsdPayload = {
    certificateBase64: 'ZmFrZS1jZXJ0aWZpY2F0ZS1ieXRlcw==',
    privateKeyBase64: 'ZmFrZS1wcml2YXRlLWtleS1ieXRlcw==',
    password: 'super-secreta-123',
  }

  it('descifra exactamente lo que se cifró', () => {
    const encrypted = encryptCsd(payload)
    const decrypted = decryptCsd(encrypted)
    expect(decrypted).toEqual(payload)
  })

  it('produce cifrados distintos cada vez (IV aleatorio)', () => {
    const first = encryptCsd(payload)
    const second = encryptCsd(payload)
    expect(first.equals(second)).toBe(false)
  })

  it('el texto cifrado no contiene el certificado en claro', () => {
    const encrypted = encryptCsd(payload)
    expect(encrypted.toString('utf8')).not.toContain(payload.certificateBase64)
    expect(encrypted.toString('utf8')).not.toContain(payload.password)
  })

  it('rechaza un blob alterado (autenticación falla)', () => {
    const encrypted = encryptCsd(payload)
    encrypted[encrypted.length - 1] ^= 0xff
    expect(() => decryptCsd(encrypted)).toThrow()
  })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run src/lib/csd-crypto.test.ts`
Expected: FAIL with "Cannot find module './csd-crypto'"

- [ ] **Step 4: Write the implementation**

```typescript
// src/lib/csd-crypto.ts
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto'

export interface CsdPayload {
  certificateBase64: string
  privateKeyBase64: string
  password: string
}

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12
const AUTH_TAG_LENGTH = 16

function getKey(): Buffer {
  const key = process.env.CSD_ENCRYPTION_KEY
  if (!key) {
    throw new Error('CSD_ENCRYPTION_KEY no está configurada')
  }
  const buffer = Buffer.from(key, 'base64')
  if (buffer.length !== 32) {
    throw new Error('CSD_ENCRYPTION_KEY debe decodificar a 32 bytes en base64')
  }
  return buffer
}

export function encryptCsd(payload: CsdPayload): Buffer {
  const key = getKey()
  const iv = randomBytes(IV_LENGTH)
  const cipher = createCipheriv(ALGORITHM, key, iv)
  const plaintext = Buffer.from(JSON.stringify(payload), 'utf8')
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()])
  const authTag = cipher.getAuthTag()
  return Buffer.concat([iv, authTag, ciphertext])
}

export function decryptCsd(blob: Buffer): CsdPayload {
  const key = getKey()
  const iv = blob.subarray(0, IV_LENGTH)
  const authTag = blob.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH)
  const ciphertext = blob.subarray(IV_LENGTH + AUTH_TAG_LENGTH)
  const decipher = createDecipheriv(ALGORITHM, key, iv)
  decipher.setAuthTag(authTag)
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()])
  return JSON.parse(plaintext.toString('utf8')) as CsdPayload
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/lib/csd-crypto.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Commit**

```bash
git add src/lib/csd-crypto.ts src/lib/csd-crypto.test.ts .env.local.example
git commit -m "feat: add AES-256-GCM encryption helpers for CSD backups"
```

---

### Task 3: Facturama client — auth, CSD registration, CFDI creation

**Files:**
- Create: `src/lib/facturama/client.ts`
- Test: `src/lib/facturama/client.test.ts`

**Interfaces:**
- Produces: `class FacturamaError extends Error`, `registrarCsd(rfc, certificateBase64, privateKeyBase64, privateKeyPassword): Promise<void>`, `buildCfdiPayload(input: CrearCfdiInput): Record<string, unknown>`, `crearCfdi(input: CrearCfdiInput): Promise<CrearCfdiResult>`, and the input/result types below. Task 5 uses `registrarCsd`; Task 8 uses `crearCfdi`.

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/facturama/client.test.ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { buildCfdiPayload, crearCfdi, registrarCsd, FacturamaError, type CrearCfdiInput } from './client'

afterEach(() => {
  vi.restoreAllMocks()
})

const sampleInput: CrearCfdiInput = {
  emisor: { rfc: 'EKU9003173C9', nombre: 'ESCUELA KEMPER URGATE', regimenFiscal: '601' },
  receptor: { rfc: 'URE180429TM6', nombre: 'UNIVERSIDAD ROBOTICA ESPAÑOLA', usoCfdi: 'G03', regimenFiscal: '601', codigoPostal: '65000' },
  conceptos: [{ claveSat: '81161500', claveUnidad: 'H87', descripcion: 'Servicio de prueba', cantidad: 2, precioUnitario: 100, iva: 16 }],
  formaPago: '01',
  metodoPago: 'PUE',
  lugarExpedicion: '06600',
  folio: 'A-0001',
}

describe('buildCfdiPayload', () => {
  it('mapea emisor, receptor y conceptos al formato Multiemisor de Facturama', () => {
    const payload = buildCfdiPayload(sampleInput) as any

    expect(payload.Issuer).toEqual({ Rfc: 'EKU9003173C9', Name: 'ESCUELA KEMPER URGATE', FiscalRegime: '601' })
    expect(payload.Receiver).toEqual({
      Rfc: 'URE180429TM6', Name: 'UNIVERSIDAD ROBOTICA ESPAÑOLA', CfdiUse: 'G03', FiscalRegime: '601', TaxZipCode: '65000',
    })
    expect(payload.Items).toHaveLength(1)
    expect(payload.Items[0]).toMatchObject({
      ProductCode: '81161500', UnitCode: 'H87', Description: 'Servicio de prueba', Quantity: 2, UnitPrice: 100,
      Subtotal: 200, TaxObject: '02', Total: 232,
    })
    expect(payload.Items[0].Taxes).toEqual([{ Name: 'IVA', Rate: 0.16, Base: 200, Total: 32, IsRetention: false }])
    expect(payload.CfdiType).toBe('I')
    expect(payload.Exportation).toBe('01')
    expect(payload.ExpeditionPlace).toBe('06600')
    expect(payload.Folio).toBe('A-0001')
  })

  it('incluye un arreglo Taxes con Rate 0 cuando el concepto tiene IVA 0%', () => {
    const input: CrearCfdiInput = { ...sampleInput, conceptos: [{ ...sampleInput.conceptos[0], iva: 0 }] }
    const payload = buildCfdiPayload(input) as any
    expect(payload.Items[0].Taxes).toEqual([{ Name: 'IVA', Rate: 0, Base: 200, Total: 0, IsRetention: false }])
  })
})

describe('crearCfdi', () => {
  it('retorna facturamaId y uuidFiscal cuando Facturama responde 200', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ Id: 'fact-123', Complement: { TaxStamp: { Uuid: 'uuid-abc' } } }),
      { status: 200 },
    ))

    const result = await crearCfdi(sampleInput)
    expect(result).toEqual({ facturamaId: 'fact-123', uuidFiscal: 'uuid-abc' })

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe('https://apisandbox.facturama.mx/api-lite/3/cfdis')
    expect(call[1].method).toBe('POST')
    expect(call[1].headers.Authorization).toMatch(/^Basic /)
  })

  it('lanza FacturamaError con el mensaje del proveedor cuando la respuesta no es exitosa', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ Message: 'El RFC del emisor no tiene CSD cargado' }),
      { status: 400 },
    ))

    await expect(crearCfdi(sampleInput)).rejects.toThrow(FacturamaError)
    await expect(crearCfdi(sampleInput)).rejects.toThrow('El RFC del emisor no tiene CSD cargado')
  })
})

describe('registrarCsd', () => {
  it('hace PUT a /api-lite/csds/{rfc} con Certificate/PrivateKey/PrivateKeyPassword', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

    await registrarCsd('EKU9003173C9', 'cert-b64', 'key-b64', 'pass123')

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe('https://apisandbox.facturama.mx/api-lite/csds/EKU9003173C9')
    expect(call[1].method).toBe('PUT')
    expect(JSON.parse(call[1].body)).toEqual({
      Rfc: 'EKU9003173C9', Certificate: 'cert-b64', PrivateKey: 'key-b64', PrivateKeyPassword: 'pass123',
    })
  })

  it('lanza FacturamaError cuando Facturama rechaza el CSD', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ Message: 'La contraseña de la llave privada es incorrecta' }),
      { status: 400 },
    ))

    await expect(registrarCsd('EKU9003173C9', 'cert-b64', 'key-b64', 'wrong')).rejects.toThrow(
      'La contraseña de la llave privada es incorrecta',
    )
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/facturama/client.test.ts`
Expected: FAIL with "Cannot find module './client'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/facturama/client.ts
const FACTURAMA_BASE_URL = 'https://apisandbox.facturama.mx'

export class FacturamaError extends Error {}

function authHeader(): string {
  const user = process.env.FACTURAMA_API_USER
  const password = process.env.FACTURAMA_API_PASSWORD
  if (!user || !password) {
    throw new Error('FACTURAMA_API_USER y FACTURAMA_API_PASSWORD deben estar configurados')
  }
  return 'Basic ' + Buffer.from(`${user}:${password}`).toString('base64')
}

async function readErrorMessage(res: Response, fallback: string): Promise<string> {
  const body = await res.json().catch(() => null)
  if (body && typeof body === 'object' && 'Message' in body) {
    return String((body as { Message: unknown }).Message)
  }
  return fallback
}

async function facturamaFetch(path: string, method: string, body?: unknown): Promise<Response> {
  return fetch(`${FACTURAMA_BASE_URL}${path}`, {
    method,
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  })
}

export async function registrarCsd(
  rfc: string,
  certificateBase64: string,
  privateKeyBase64: string,
  privateKeyPassword: string,
): Promise<void> {
  const res = await facturamaFetch(`/api-lite/csds/${rfc}`, 'PUT', {
    Rfc: rfc,
    Certificate: certificateBase64,
    PrivateKey: privateKeyBase64,
    PrivateKeyPassword: privateKeyPassword,
  })

  if (!res.ok) {
    throw new FacturamaError(await readErrorMessage(res, `Facturama respondió ${res.status} al registrar el CSD`))
  }
}

export interface FacturamaEmisor {
  rfc: string
  nombre: string
  regimenFiscal: string
}

export interface FacturamaReceptor {
  rfc: string
  nombre: string
  usoCfdi: string
  regimenFiscal: string
  codigoPostal: string
}

export interface FacturamaConcepto {
  claveSat: string
  claveUnidad: string
  descripcion: string
  cantidad: number
  precioUnitario: number
  iva: number
}

export interface CrearCfdiInput {
  emisor: FacturamaEmisor
  receptor: FacturamaReceptor
  conceptos: FacturamaConcepto[]
  formaPago: string
  metodoPago: string
  lugarExpedicion: string
  folio: string
}

export interface CrearCfdiResult {
  facturamaId: string
  uuidFiscal: string
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

export function buildCfdiPayload(input: CrearCfdiInput): Record<string, unknown> {
  return {
    CfdiType: 'I',
    ExpeditionPlace: input.lugarExpedicion,
    Folio: input.folio,
    PaymentForm: input.formaPago,
    PaymentMethod: input.metodoPago,
    Exportation: '01',
    Issuer: {
      Rfc: input.emisor.rfc,
      Name: input.emisor.nombre,
      FiscalRegime: input.emisor.regimenFiscal,
    },
    Receiver: {
      Rfc: input.receptor.rfc,
      Name: input.receptor.nombre,
      CfdiUse: input.receptor.usoCfdi,
      FiscalRegime: input.receptor.regimenFiscal,
      TaxZipCode: input.receptor.codigoPostal,
    },
    Items: input.conceptos.map(c => {
      const subtotal = round2(c.cantidad * c.precioUnitario)
      const ivaTotal = round2(subtotal * c.iva / 100)
      return {
        ProductCode: c.claveSat,
        UnitCode: c.claveUnidad,
        Description: c.descripcion,
        Quantity: c.cantidad,
        UnitPrice: c.precioUnitario,
        Subtotal: subtotal,
        TaxObject: '02',
        Taxes: [{ Name: 'IVA', Rate: c.iva / 100, Base: subtotal, Total: ivaTotal, IsRetention: false }],
        Total: round2(subtotal + ivaTotal),
      }
    }),
  }
}

export async function crearCfdi(input: CrearCfdiInput): Promise<CrearCfdiResult> {
  const res = await facturamaFetch('/api-lite/3/cfdis', 'POST', buildCfdiPayload(input))

  if (!res.ok) {
    throw new FacturamaError(await readErrorMessage(res, `Facturama respondió ${res.status} al timbrar`))
  }

  const body = (await res.json()) as { Id?: unknown; Complement?: { TaxStamp?: { Uuid?: unknown } } }
  const facturamaId = body.Id
  const uuidFiscal = body.Complement?.TaxStamp?.Uuid

  if (typeof facturamaId !== 'string' || typeof uuidFiscal !== 'string') {
    throw new FacturamaError('Facturama no devolvió un Id o UUID fiscal válido')
  }

  return { facturamaId, uuidFiscal }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/facturama/client.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/facturama/client.ts src/lib/facturama/client.test.ts
git commit -m "feat: add Facturama client for CSD registration and CFDI creation"
```

---

### Task 4: Facturama client — XML/PDF download and cancellation

**Files:**
- Modify: `src/lib/facturama/client.ts`
- Modify: `src/lib/facturama/client.test.ts`

**Interfaces:**
- Consumes: `authHeader()`, `readErrorMessage()`, `FacturamaError` from Task 3 (same file, not exported — used internally).
- Produces: `obtenerXml(facturamaId): Promise<{ content: Buffer; contentType: string }>`, `obtenerPdf(facturamaId): Promise<{ content: Buffer; contentType: string }>`, `cancelarCfdi(facturamaId, motivo: '01'|'02'|'03'|'04', uuidSustitucion?): Promise<void>`. Tasks 10/11 depend on these exact names.

- [ ] **Step 1: Add the failing tests**

Append to `src/lib/facturama/client.test.ts`:

```typescript
import { obtenerXml, obtenerPdf, cancelarCfdi } from './client'

describe('obtenerXml / obtenerPdf', () => {
  it('obtenerXml retorna el contenido y content-type application/xml', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('<cfdi>fake</cfdi>', { status: 200 }))

    const result = await obtenerXml('fact-123')
    expect(result.contentType).toBe('application/xml')
    expect(result.content.toString('utf8')).toBe('<cfdi>fake</cfdi>')

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe('https://apisandbox.facturama.mx/api-lite/cfdi/xml/issued/fact-123')
  })

  it('obtenerPdf retorna el contenido y content-type application/pdf', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('%PDF-fake', { status: 200 }))

    const result = await obtenerPdf('fact-123')
    expect(result.contentType).toBe('application/pdf')

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe('https://apisandbox.facturama.mx/api-lite/cfdi/pdf/issued/fact-123')
  })

  it('lanza FacturamaError si Facturama responde con error al descargar', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 404 }))
    await expect(obtenerXml('no-existe')).rejects.toThrow(FacturamaError)
  })
})

describe('cancelarCfdi', () => {
  it('hace DELETE con el motivo en query string', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

    await cancelarCfdi('fact-123', '02')

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe('https://apisandbox.facturama.mx/api-lite/3/cfdis/fact-123?motive=02')
    expect(call[1].method).toBe('DELETE')
  })

  it('incluye uuidReplacement cuando el motivo es 01', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(null, { status: 200 }))

    await cancelarCfdi('fact-123', '01', 'uuid-sustituto')

    const call = (global.fetch as any).mock.calls[0]
    expect(call[0]).toBe('https://apisandbox.facturama.mx/api-lite/3/cfdis/fact-123?motive=01&uuidReplacement=uuid-sustituto')
  })

  it('lanza FacturamaError cuando Facturama rechaza la cancelación', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ Message: 'CFDI ya cancelado' }), { status: 400 }))
    await expect(cancelarCfdi('fact-123', '02')).rejects.toThrow('CFDI ya cancelado')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/lib/facturama/client.test.ts`
Expected: FAIL with "obtenerXml is not a function" (and similar for the other three)

- [ ] **Step 3: Append the implementation**

Add to the end of `src/lib/facturama/client.ts`:

```typescript
async function descargar(path: string, contentType: string, notFoundMessage: string): Promise<{ content: Buffer; contentType: string }> {
  const res = await fetch(`${FACTURAMA_BASE_URL}${path}`, { headers: { Authorization: authHeader() } })
  if (!res.ok) {
    throw new FacturamaError(`Facturama respondió ${res.status} ${notFoundMessage}`)
  }
  const content = Buffer.from(await res.arrayBuffer())
  return { content, contentType }
}

export async function obtenerXml(facturamaId: string): Promise<{ content: Buffer; contentType: string }> {
  return descargar(`/api-lite/cfdi/xml/issued/${facturamaId}`, 'application/xml', 'al descargar el XML')
}

export async function obtenerPdf(facturamaId: string): Promise<{ content: Buffer; contentType: string }> {
  return descargar(`/api-lite/cfdi/pdf/issued/${facturamaId}`, 'application/pdf', 'al descargar el PDF')
}

export type MotivoCancelacion = '01' | '02' | '03' | '04'

export async function cancelarCfdi(facturamaId: string, motivo: MotivoCancelacion, uuidSustitucion?: string): Promise<void> {
  const query = motivo === '01' && uuidSustitucion ? `?motive=${motivo}&uuidReplacement=${uuidSustitucion}` : `?motive=${motivo}`
  const res = await fetch(`${FACTURAMA_BASE_URL}/api-lite/3/cfdis/${facturamaId}${query}`, {
    method: 'DELETE',
    headers: { Authorization: authHeader() },
  })

  if (!res.ok) {
    throw new FacturamaError(await readErrorMessage(res, `Facturama respondió ${res.status} al cancelar`))
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/lib/facturama/client.test.ts`
Expected: PASS (12 tests total)

- [ ] **Step 5: Commit**

```bash
git add src/lib/facturama/client.ts src/lib/facturama/client.test.ts
git commit -m "feat: add Facturama XML/PDF download and cancellation"
```

---

### Task 5: CSD registration — orchestration function + upload route

**Files:**
- Create: `src/lib/csd/registrar-csd.ts`
- Create: `src/app/api/empresas/csd/route.ts`
- Test: `tests/integration/registrar-csd.test.ts`

**Interfaces:**
- Consumes: `registrarCsd` (Facturama, from Task 3 — imported as `registrarCsdFacturama` to avoid a name clash), `encryptCsd` (Task 2).
- Produces: `registrarCsd(admin: SupabaseClient<Database>, input: RegistrarCsdInput): Promise<{ ok: true } | { error: string }>`, `interface RegistrarCsdInput { empresaId: string; cerBuffer: Buffer; keyBuffer: Buffer; password: string }`. Task 8 (Configuracion UI) calls `POST /api/empresas/csd` which wraps this.

- [ ] **Step 1: Write the failing integration test**

```typescript
// tests/integration/registrar-csd.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarCsd } from '@/lib/csd/registrar-csd'
import * as facturamaClient from '@/lib/facturama/client'

if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar en .env.local para correr esta prueba.')
}

const admin = createAdminClient()
const suffix = Date.now()
let empresaId: string

beforeAll(async () => {
  const { data, error } = await admin
    .from('empresas')
    .insert({ nombre: `Registrar CSD Test ${suffix}`, rfc_emisor: `RCS${suffix % 100000}AAA`, regimen_fiscal: '601', cp_emisor: '00000' })
    .select('id')
    .single()
  if (error) throw error
  empresaId = data.id
})

afterAll(async () => {
  await admin.storage.from('csd-backups').remove([`${empresaId}.enc`])
  await admin.from('empresas').delete().eq('id', empresaId)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registrarCsd', () => {
  it('registra el CSD en Facturama, guarda un respaldo cifrado y marca csd_status=registrado', async () => {
    vi.spyOn(facturamaClient, 'registrarCsd').mockResolvedValue(undefined)

    const result = await registrarCsd(admin, {
      empresaId,
      cerBuffer: Buffer.from('fake-cer-bytes'),
      keyBuffer: Buffer.from('fake-key-bytes'),
      password: 'pass123',
    })

    expect(result).toEqual({ ok: true })

    const { data: empresa } = await admin.from('empresas').select('csd_status, csd_actualizado_en').eq('id', empresaId).single()
    expect(empresa!.csd_status).toBe('registrado')
    expect(empresa!.csd_actualizado_en).not.toBeNull()

    const { data: file, error: downloadError } = await admin.storage.from('csd-backups').download(`${empresaId}.enc`)
    expect(downloadError).toBeNull()
    const blob = Buffer.from(await file!.arrayBuffer())
    expect(blob.toString('utf8')).not.toContain('fake-cer-bytes')
  })

  it('no guarda nada ni cambia csd_status si Facturama rechaza el CSD', async () => {
    vi.spyOn(facturamaClient, 'registrarCsd').mockRejectedValue(new facturamaClient.FacturamaError('Contraseña incorrecta'))

    const result = await registrarCsd(admin, {
      empresaId,
      cerBuffer: Buffer.from('fake-cer-bytes'),
      keyBuffer: Buffer.from('fake-key-bytes'),
      password: 'wrong',
    })

    expect(result).toEqual({ error: 'Contraseña incorrecta' })

    const { data: empresa } = await admin.from('empresas').select('csd_status').eq('id', empresaId).single()
    expect(empresa!.csd_status).toBe('sin_registrar')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/registrar-csd.test.ts`
Expected: FAIL with "Cannot find module '@/lib/csd/registrar-csd'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/csd/registrar-csd.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { registrarCsd as registrarCsdFacturama, FacturamaError } from '@/lib/facturama/client'
import { encryptCsd } from '@/lib/csd-crypto'

export interface RegistrarCsdInput {
  empresaId: string
  cerBuffer: Buffer
  keyBuffer: Buffer
  password: string
}

export type RegistrarCsdResult = { ok: true } | { error: string }

export async function registrarCsd(admin: SupabaseClient<Database>, input: RegistrarCsdInput): Promise<RegistrarCsdResult> {
  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .select('rfc_emisor')
    .eq('id', input.empresaId)
    .single()

  if (empresaError || !empresa) {
    return { error: `No se pudo cargar la empresa: ${empresaError?.message ?? 'no encontrada'}` }
  }

  const certificateBase64 = input.cerBuffer.toString('base64')
  const privateKeyBase64 = input.keyBuffer.toString('base64')

  try {
    await registrarCsdFacturama(empresa.rfc_emisor, certificateBase64, privateKeyBase64, input.password)
  } catch (err) {
    return { error: err instanceof FacturamaError ? err.message : 'Error al registrar el CSD en Facturama' }
  }

  const encrypted = encryptCsd({ certificateBase64, privateKeyBase64, password: input.password })

  const { error: uploadError } = await admin.storage
    .from('csd-backups')
    .upload(`${input.empresaId}.enc`, encrypted, { contentType: 'application/octet-stream', upsert: true })

  if (uploadError) {
    return { error: `El CSD se registró en Facturama pero no se pudo guardar el respaldo: ${uploadError.message}` }
  }

  const { error: updateError } = await admin
    .from('empresas')
    .update({ csd_status: 'registrado', csd_actualizado_en: new Date().toISOString() })
    .eq('id', input.empresaId)

  if (updateError) {
    return { error: `El CSD se registró pero no se pudo actualizar el estatus: ${updateError.message}` }
  }

  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/integration/registrar-csd.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the upload route**

```typescript
// src/app/api/empresas/csd/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarCsd } from '@/lib/csd/registrar-csd'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data: empresaRow } = await supabase
    .from('usuarios_empresa')
    .select('empresa_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!empresaRow) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 })
  }

  const cer = formData.get('cer')
  const key = formData.get('key')
  const password = formData.get('password')

  if (!(cer instanceof File) || !(key instanceof File) || typeof password !== 'string' || !password) {
    return NextResponse.json({ error: 'Se requieren los archivos .cer, .key y la contraseña' }, { status: 400 })
  }

  const cerBuffer = Buffer.from(await cer.arrayBuffer())
  const keyBuffer = Buffer.from(await key.arrayBuffer())

  const admin = createAdminClient()
  const result = await registrarCsd(admin, { empresaId: empresaRow.empresa_id, cerBuffer, keyBuffer, password })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/csd/registrar-csd.ts src/app/api/empresas/csd/route.ts tests/integration/registrar-csd.test.ts
git commit -m "feat: add CSD registration (Facturama + encrypted Storage backup) and upload route"
```

---

### Task 6: CSD resync — orchestration function + resync route

**Files:**
- Create: `src/lib/csd/resincronizar-csd.ts`
- Create: `src/app/api/empresas/csd/resync/route.ts`
- Test: `tests/integration/resincronizar-csd.test.ts`

**Interfaces:**
- Consumes: `registrarCsd` (Facturama, Task 3), `decryptCsd` (Task 2), Storage object `csd-backups/{empresaId}.enc` written by Task 5.
- Produces: `resincronizarCsd(admin, empresaId): Promise<{ ok: true } | { error: string }>`.

- [ ] **Step 1: Write the failing integration test**

```typescript
// tests/integration/resincronizar-csd.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarCsd } from '@/lib/csd/registrar-csd'
import { resincronizarCsd } from '@/lib/csd/resincronizar-csd'
import * as facturamaClient from '@/lib/facturama/client'

if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar en .env.local para correr esta prueba.')
}

const admin = createAdminClient()
const suffix = Date.now()
let empresaId: string
let empresaSinCsdId: string

beforeAll(async () => {
  const { data, error } = await admin
    .from('empresas')
    .insert({ nombre: `Resync CSD Test ${suffix}`, rfc_emisor: `RSY${suffix % 100000}AAA`, regimen_fiscal: '601', cp_emisor: '00000' })
    .select('id')
    .single()
  if (error) throw error
  empresaId = data.id

  const { data: sinCsd, error: sinCsdError } = await admin
    .from('empresas')
    .insert({ nombre: `Sin CSD Test ${suffix}`, rfc_emisor: `NOC${suffix % 100000}AAA`, regimen_fiscal: '601', cp_emisor: '00000' })
    .select('id')
    .single()
  if (sinCsdError) throw sinCsdError
  empresaSinCsdId = sinCsd.id

  vi.spyOn(facturamaClient, 'registrarCsd').mockResolvedValue(undefined)
  await registrarCsd(admin, { empresaId, cerBuffer: Buffer.from('cer'), keyBuffer: Buffer.from('key'), password: 'pass123' })
  vi.restoreAllMocks()
})

afterAll(async () => {
  await admin.storage.from('csd-backups').remove([`${empresaId}.enc`])
  await admin.from('empresas').delete().in('id', [empresaId, empresaSinCsdId])
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('resincronizarCsd', () => {
  it('reenvía el CSD respaldado a Facturama sin pedir archivos de nuevo', async () => {
    const spy = vi.spyOn(facturamaClient, 'registrarCsd').mockResolvedValue(undefined)

    const result = await resincronizarCsd(admin, empresaId)

    expect(result).toEqual({ ok: true })
    expect(spy).toHaveBeenCalledWith(expect.any(String), expect.any(String), expect.any(String), 'pass123')
  })

  it('responde con error si no hay un CSD respaldado para la empresa', async () => {
    const result = await resincronizarCsd(admin, empresaSinCsdId)
    expect(result).toEqual({ error: 'No hay un CSD respaldado para esta empresa' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/resincronizar-csd.test.ts`
Expected: FAIL with "Cannot find module '@/lib/csd/resincronizar-csd'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/csd/resincronizar-csd.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { registrarCsd as registrarCsdFacturama, FacturamaError } from '@/lib/facturama/client'
import { decryptCsd } from '@/lib/csd-crypto'

export type ResincronizarCsdResult = { ok: true } | { error: string }

export async function resincronizarCsd(admin: SupabaseClient<Database>, empresaId: string): Promise<ResincronizarCsdResult> {
  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .select('rfc_emisor, csd_status')
    .eq('id', empresaId)
    .single()

  if (empresaError || !empresa) {
    return { error: `No se pudo cargar la empresa: ${empresaError?.message ?? 'no encontrada'}` }
  }

  if (empresa.csd_status !== 'registrado') {
    return { error: 'No hay un CSD respaldado para esta empresa' }
  }

  const { data: file, error: downloadError } = await admin.storage.from('csd-backups').download(`${empresaId}.enc`)
  if (downloadError || !file) {
    return { error: `No se pudo leer el respaldo del CSD: ${downloadError?.message ?? 'no encontrado'}` }
  }

  const blob = Buffer.from(await file.arrayBuffer())
  const { certificateBase64, privateKeyBase64, password } = decryptCsd(blob)

  try {
    await registrarCsdFacturama(empresa.rfc_emisor, certificateBase64, privateKeyBase64, password)
  } catch (err) {
    return { error: err instanceof FacturamaError ? err.message : 'Error al reenviar el CSD a Facturama' }
  }

  const { error: updateError } = await admin
    .from('empresas')
    .update({ csd_actualizado_en: new Date().toISOString() })
    .eq('id', empresaId)

  if (updateError) {
    return { error: `El CSD se reenvió pero no se pudo actualizar la fecha: ${updateError.message}` }
  }

  return { ok: true }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/integration/resincronizar-csd.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Write the resync route**

```typescript
// src/app/api/empresas/csd/resync/route.ts
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resincronizarCsd } from '@/lib/csd/resincronizar-csd'

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data: empresaRow } = await supabase
    .from('usuarios_empresa')
    .select('empresa_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!empresaRow) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const admin = createAdminClient()
  const result = await resincronizarCsd(admin, empresaRow.empresa_id)

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/csd/resincronizar-csd.ts src/app/api/empresas/csd/resync/route.ts tests/integration/resincronizar-csd.test.ts
git commit -m "feat: add CSD resync from encrypted backup"
```

---

### Task 7: Configuracion.tsx — wire the Certificados tab to real data and the CSD routes

**Files:**
- Modify: `src/app/(app)/configuracion/page.tsx`
- Modify: `src/components/Configuracion.tsx`
- Test: `src/components/Configuracion.test.tsx`

**Interfaces:**
- Consumes: `POST /api/empresas/csd` (Task 5), `POST /api/empresas/csd/resync` (Task 6).
- Produces: `Configuracion({ empresa }: { empresa: EmpresaConfig })` where `interface EmpresaConfig { nombre: string; rfcEmisor: string; csdStatus: 'sin_registrar' | 'registrado' }` — only this task and its page wrapper use this prop shape.

- [ ] **Step 1: Write the failing component test**

```typescript
// src/components/Configuracion.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Configuracion from './Configuracion'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

afterEach(() => {
  vi.restoreAllMocks()
  refresh.mockClear()
})

function selectTab() {
  fireEvent.click(screen.getByText('Certificados (CSD)'))
}

describe('Configuracion - certificados', () => {
  it('muestra el RFC real de la empresa y el badge "Sin certificado" cuando csdStatus es sin_registrar', () => {
    render(<Configuracion empresa={{ nombre: 'Empresa Demo S.A. de C.V.', rfcEmisor: 'DEM200101ABC', csdStatus: 'sin_registrar' }} />)
    selectTab()

    expect(screen.getByText(/DEM200101ABC/)).toBeInTheDocument()
    expect(screen.getByText('Sin certificado')).toBeInTheDocument()
    expect(screen.queryByText('Reintentar registro')).not.toBeInTheDocument()
  })

  it('muestra el badge "Registrado" y el botón de reintentar cuando csdStatus es registrado', () => {
    render(<Configuracion empresa={{ nombre: 'Empresa Demo', rfcEmisor: 'DEM200101ABC', csdStatus: 'registrado' }} />)
    selectTab()

    expect(screen.getByText('Registrado')).toBeInTheDocument()
    expect(screen.getByText('Reintentar registro')).toBeInTheDocument()
  })

  it('el botón Registrar CSD está deshabilitado hasta elegir ambos archivos y una contraseña', () => {
    render(<Configuracion empresa={{ nombre: 'Empresa Demo', rfcEmisor: 'DEM200101ABC', csdStatus: 'sin_registrar' }} />)
    selectTab()

    expect(screen.getByText('Registrar CSD')).toBeDisabled()

    fireEvent.change(screen.getByLabelText('Archivo .cer'), { target: { files: [new File(['cer'], 'test.cer')] } })
    fireEvent.change(screen.getByLabelText('Archivo .key'), { target: { files: [new File(['key'], 'test.key')] } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña de la llave privada'), { target: { value: 'pass123' } })

    expect(screen.getByText('Registrar CSD')).not.toBeDisabled()
  })

  it('envía el formulario a /api/empresas/csd y refresca en éxito', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    render(<Configuracion empresa={{ nombre: 'Empresa Demo', rfcEmisor: 'DEM200101ABC', csdStatus: 'sin_registrar' }} />)
    selectTab()

    fireEvent.change(screen.getByLabelText('Archivo .cer'), { target: { files: [new File(['cer'], 'test.cer')] } })
    fireEvent.change(screen.getByLabelText('Archivo .key'), { target: { files: [new File(['key'], 'test.key')] } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña de la llave privada'), { target: { value: 'pass123' } })
    fireEvent.click(screen.getByText('Registrar CSD'))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/empresas/csd', expect.objectContaining({ method: 'POST' }))
  })

  it('muestra el error del servidor si el registro falla', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ error: 'Contraseña incorrecta' }), { status: 400 }))
    render(<Configuracion empresa={{ nombre: 'Empresa Demo', rfcEmisor: 'DEM200101ABC', csdStatus: 'sin_registrar' }} />)
    selectTab()

    fireEvent.change(screen.getByLabelText('Archivo .cer'), { target: { files: [new File(['cer'], 'test.cer')] } })
    fireEvent.change(screen.getByLabelText('Archivo .key'), { target: { files: [new File(['key'], 'test.key')] } })
    fireEvent.change(screen.getByPlaceholderText('Contraseña de la llave privada'), { target: { value: 'wrong' } })
    fireEvent.click(screen.getByText('Registrar CSD'))

    await waitFor(() => expect(screen.getByText('Contraseña incorrecta')).toBeInTheDocument())
    expect(refresh).not.toHaveBeenCalled()
  })

  it('Reintentar registro llama a /api/empresas/csd/resync', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    render(<Configuracion empresa={{ nombre: 'Empresa Demo', rfcEmisor: 'DEM200101ABC', csdStatus: 'registrado' }} />)
    selectTab()

    fireEvent.click(screen.getByText('Reintentar registro'))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/empresas/csd/resync', expect.objectContaining({ method: 'POST' }))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/Configuracion.test.tsx`
Expected: FAIL (`Configuracion` doesn't accept an `empresa` prop yet; labels/text don't exist)

- [ ] **Step 3: Update the page wrapper**

```typescript
// src/app/(app)/configuracion/page.tsx
import { createClient } from '@/lib/supabase/server'
import Configuracion from '@/components/Configuracion'

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: empresaRow } = user
    ? await supabase.from('usuarios_empresa').select('empresa_id').eq('user_id', user.id).maybeSingle()
    : { data: null }

  const { data: empresa } = empresaRow
    ? await supabase.from('empresas').select('nombre, rfc_emisor, csd_status').eq('id', empresaRow.empresa_id).maybeSingle()
    : { data: null }

  return (
    <Configuracion
      empresa={{
        nombre: empresa?.nombre ?? '',
        rfcEmisor: empresa?.rfc_emisor ?? '',
        csdStatus: empresa?.csd_status ?? 'sin_registrar',
      }}
    />
  )
}
```

- [ ] **Step 4: Replace the certificados tab in `Configuracion.tsx`**

Change the component signature and imports at the top of `src/components/Configuracion.tsx`:

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, KeyRound, Bell, FileCheck } from 'lucide-react'

export interface EmpresaConfig {
  nombre: string
  rfcEmisor: string
  csdStatus: 'sin_registrar' | 'registrado'
}

export default function Configuracion({ empresa }: { empresa: EmpresaConfig }) {
  const router = useRouter()
  const [tab, setTab] = useState<'empresa' | 'certificados' | 'notificaciones' | 'cfdi'>('empresa')
  const [cerFile, setCerFile] = useState<File | null>(null)
  const [keyFile, setKeyFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resyncing, setResyncing] = useState(false)
  const [csdError, setCsdError] = useState<string | null>(null)

  async function handleRegistrarCsd() {
    if (!cerFile || !keyFile || !password) return
    setSubmitting(true)
    setCsdError(null)

    const formData = new FormData()
    formData.set('cer', cerFile)
    formData.set('key', keyFile)
    formData.set('password', password)

    const res = await fetch('/api/empresas/csd', { method: 'POST', body: formData })

    if (!res.ok) {
      try {
        const body = await res.json()
        setCsdError(body.error ?? 'Error al registrar el CSD')
      } catch {
        setCsdError('Error al registrar el CSD')
      }
      setSubmitting(false)
      return
    }

    setCerFile(null)
    setKeyFile(null)
    setPassword('')
    setSubmitting(false)
    router.refresh()
  }

  async function handleResync() {
    setResyncing(true)
    setCsdError(null)

    const res = await fetch('/api/empresas/csd/resync', { method: 'POST' })

    if (!res.ok) {
      try {
        const body = await res.json()
        setCsdError(body.error ?? 'Error al reintentar el registro')
      } catch {
        setCsdError('Error al reintentar el registro')
      }
      setResyncing(false)
      return
    }

    setResyncing(false)
    router.refresh()
  }

  const [form, setForm] = useState({
    razonSocial: empresa.nombre,
    rfc: empresa.rfcEmisor,
    regimen: '601',
    cp: '06600',
    calle: 'Av. Insurgentes Sur 123',
    colonia: 'Hipódromo',
    ciudad: 'Ciudad de México',
    estado: 'CDMX',
    email: 'facturacion@empresa.com',
    telefono: '55 1234 5678',
  })
```

Replace the entire `{tab === 'certificados' && (...)}` block with:

```typescript
      {tab === 'certificados' && (
        <div style={card}>
          <h3 style={sectionTitle}>Certificado de Sello Digital (CSD)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: 0 }}>{empresa.nombre} · {empresa.rfcEmisor}</p>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                  backgroundColor: empresa.csdStatus === 'registrado' ? '#dcfce7' : '#f1f5f9',
                  color: empresa.csdStatus === 'registrado' ? '#15803d' : '#64748b',
                }}>
                  {empresa.csdStatus === 'registrado' ? 'Registrado' : 'Sin certificado'}
                </span>
              </div>
            </div>

            {csdError && <p style={{ color: '#dc2626', fontSize: 13, margin: 0 }}>{csdError}</p>}

            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Carga tus archivos .cer y .key del SAT para habilitar el timbrado de facturas.</p>

            <div>
              <label htmlFor="csd-cer" style={labelStyle}>Archivo .cer</label>
              <input
                id="csd-cer"
                type="file"
                accept=".cer"
                onChange={e => setCerFile(e.target.files?.[0] ?? null)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="csd-key" style={labelStyle}>Archivo .key</label>
              <input
                id="csd-key"
                type="file"
                accept=".key"
                onChange={e => setKeyFile(e.target.files?.[0] ?? null)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Contraseña de la llave privada</label>
              <input
                type="password"
                placeholder="Contraseña de la llave privada"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleRegistrarCsd}
                disabled={!cerFile || !keyFile || !password || submitting}
                style={{ ...primaryBtn, opacity: (!cerFile || !keyFile || !password || submitting) ? 0.6 : 1 }}
              >
                {submitting ? 'Registrando…' : 'Registrar CSD'}
              </button>
              {empresa.csdStatus === 'registrado' && (
                <button onClick={handleResync} disabled={resyncing} style={{ ...secondaryBtn, opacity: resyncing ? 0.6 : 1 }}>
                  {resyncing ? 'Reintentando…' : 'Reintentar registro'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/components/Configuracion.test.tsx`
Expected: PASS (6 tests)

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/app/\(app\)/configuracion/page.tsx src/components/Configuracion.tsx src/components/Configuracion.test.tsx
git commit -m "feat: wire Configuracion certificados tab to real CSD registration/resync"
```

---

### Task 8: `intentarTimbrado` + wire into `POST /api/facturas`

**Files:**
- Create: `src/lib/facturas/intentar-timbrado.ts`
- Modify: `src/app/api/facturas/route.ts`
- Test: `tests/integration/intentar-timbrado.test.ts`

**Interfaces:**
- Consumes: `crearCfdi`, `FacturamaError` (Task 3); `empresas.csd_status`, `facturas.forma_pago/metodo_pago/facturama_id/error_timbrado`, `conceptos.clave_unidad` (Task 1).
- Produces: `intentarTimbrado(supabase: SupabaseClient<Database>, facturaId: string): Promise<{ ok: true } | { ok: false; error: string }>`. Task 9's retry route and this task's `POST /api/facturas` both call it.

- [ ] **Step 1: Write the failing integration test**

```typescript
// tests/integration/intentar-timbrado.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { intentarTimbrado } from '@/lib/facturas/intentar-timbrado'
import * as facturamaClient from '@/lib/facturama/client'
import type { Database } from '@/lib/supabase/database.types'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Variables de Supabase requeridas en .env.local para correr esta prueba.')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const admin = createAdminClient()
const suffix = Date.now()
const email = `intentar-timbrado-${suffix}@example.com`
const password = 'Test-password-123!'

let empresaId: string
let userId: string
let clienteId: string

async function crearFacturaPendiente() {
  const anon = createSupabaseClient<Database>(url, anonKey)
  await anon.auth.signInWithPassword({ email, password })
  const { data, error } = await anon.rpc('crear_factura', {
    p_cliente_id: clienteId,
    p_conceptos: [{ clave_sat: '81161500', clave_unidad: 'H87', descripcion: 'Servicio', cantidad: 1, precio_unitario: 100, iva: 16 }],
    p_forma_pago: '01',
    p_metodo_pago: 'PUE',
  })
  if (error) throw error
  return { factura: data!, anon }
}

beforeAll(async () => {
  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .insert({ nombre: `Timbrado Test ${suffix}`, rfc_emisor: `TIM${suffix % 100000}AAA`, regimen_fiscal: '601', cp_emisor: '06600' })
    .select('id')
    .single()
  if (empresaError) throw empresaError
  empresaId = empresa.id

  const { data: user, error: userError } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (userError) throw userError
  userId = user.user.id

  const { error: linkError } = await admin.from('usuarios_empresa').insert({ user_id: userId, empresa_id: empresaId })
  if (linkError) throw linkError

  const { data: cliente, error: clienteError } = await admin
    .from('clientes')
    .insert({ empresa_id: empresaId, nombre: 'Cliente Timbrado', rfc: 'CLT010101AAA', regimen_fiscal: '601', codigo_postal: '65000', uso_cfdi: 'G03' })
    .select('id')
    .single()
  if (clienteError) throw clienteError
  clienteId = cliente.id
})

afterAll(async () => {
  await admin.from('conceptos').delete().in('factura_id', (await admin.from('facturas').select('id').eq('empresa_id', empresaId)).data?.map(f => f.id) ?? [])
  await admin.from('facturas').delete().eq('empresa_id', empresaId)
  await admin.from('folios_empresa').delete().eq('empresa_id', empresaId)
  await admin.from('clientes').delete().eq('id', clienteId)
  await admin.auth.admin.deleteUser(userId)
  await admin.from('usuarios_empresa').delete().eq('empresa_id', empresaId)
  await admin.from('empresas').delete().eq('id', empresaId)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('intentarTimbrado', () => {
  it('falla sin llamar a Facturama si la empresa no tiene CSD registrado', async () => {
    const spy = vi.spyOn(facturamaClient, 'crearCfdi')
    const { factura, anon } = await crearFacturaPendiente()

    const result = await intentarTimbrado(anon, factura.id)

    expect(result).toEqual({
      ok: false,
      error: 'Esta empresa no tiene un CSD registrado. Configúralo en Configuración → Certificados antes de timbrar.',
    })
    expect(spy).not.toHaveBeenCalled()

    const { data: reloaded } = await admin.from('facturas').select('status, error_timbrado').eq('id', factura.id).single()
    expect(reloaded!.status).toBe('pendiente')
    expect(reloaded!.error_timbrado).toBe(
      'Esta empresa no tiene un CSD registrado. Configúralo en Configuración → Certificados antes de timbrar.',
    )
  })

  it('marca la factura como timbrada cuando Facturama responde con éxito', async () => {
    await admin.from('empresas').update({ csd_status: 'registrado' }).eq('id', empresaId)
    vi.spyOn(facturamaClient, 'crearCfdi').mockResolvedValue({ facturamaId: 'fact-1', uuidFiscal: 'uuid-1' })

    const { factura, anon } = await crearFacturaPendiente()
    const result = await intentarTimbrado(anon, factura.id)

    expect(result).toEqual({ ok: true })

    const { data: reloaded } = await admin.from('facturas').select('status, facturama_id, uuid_fiscal, xml_url, pdf_url').eq('id', factura.id).single()
    expect(reloaded!.status).toBe('timbrada')
    expect(reloaded!.facturama_id).toBe('fact-1')
    expect(reloaded!.uuid_fiscal).toBe('uuid-1')
    expect(reloaded!.xml_url).toBe(`/api/facturas/${factura.id}/xml`)
    expect(reloaded!.pdf_url).toBe(`/api/facturas/${factura.id}/pdf`)

    await admin.from('empresas').update({ csd_status: 'sin_registrar' }).eq('id', empresaId)
  })

  it('deja la factura pendiente con error_timbrado cuando Facturama falla', async () => {
    await admin.from('empresas').update({ csd_status: 'registrado' }).eq('id', empresaId)
    vi.spyOn(facturamaClient, 'crearCfdi').mockRejectedValue(new facturamaClient.FacturamaError('El RFC del receptor es inválido'))

    const { factura, anon } = await crearFacturaPendiente()
    const result = await intentarTimbrado(anon, factura.id)

    expect(result).toEqual({ ok: false, error: 'El RFC del receptor es inválido' })

    const { data: reloaded } = await admin.from('facturas').select('status, error_timbrado').eq('id', factura.id).single()
    expect(reloaded!.status).toBe('pendiente')
    expect(reloaded!.error_timbrado).toBe('El RFC del receptor es inválido')

    await admin.from('empresas').update({ csd_status: 'sin_registrar' }).eq('id', empresaId)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/intentar-timbrado.test.ts`
Expected: FAIL with "Cannot find module '@/lib/facturas/intentar-timbrado'"

- [ ] **Step 3: Write the implementation**

```typescript
// src/lib/facturas/intentar-timbrado.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { crearCfdi, FacturamaError } from '@/lib/facturama/client'

export type IntentarTimbradoResult = { ok: true } | { ok: false; error: string }

export async function intentarTimbrado(supabase: SupabaseClient<Database>, facturaId: string): Promise<IntentarTimbradoResult> {
  const { data: factura, error: facturaError } = await supabase
    .from('facturas')
    .select('id, empresa_id, cliente_id, folio, forma_pago, metodo_pago, status')
    .eq('id', facturaId)
    .single()

  if (facturaError || !factura) {
    return { ok: false, error: `No se pudo cargar la factura: ${facturaError?.message ?? 'no encontrada'}` }
  }

  if (factura.status !== 'pendiente') {
    return { ok: false, error: 'La factura no está pendiente de timbrado' }
  }

  const { data: empresa, error: empresaError } = await supabase
    .from('empresas')
    .select('rfc_emisor, nombre, regimen_fiscal, cp_emisor, csd_status')
    .eq('id', factura.empresa_id)
    .single()

  if (empresaError || !empresa) {
    return { ok: false, error: `No se pudo cargar la empresa: ${empresaError?.message ?? 'no encontrada'}` }
  }

  if (empresa.csd_status !== 'registrado') {
    const mensaje = 'Esta empresa no tiene un CSD registrado. Configúralo en Configuración → Certificados antes de timbrar.'
    await supabase.from('facturas').update({ error_timbrado: mensaje }).eq('id', facturaId)
    return { ok: false, error: mensaje }
  }

  const { data: cliente, error: clienteError } = await supabase
    .from('clientes')
    .select('rfc, nombre, uso_cfdi, regimen_fiscal, codigo_postal')
    .eq('id', factura.cliente_id)
    .single()

  if (clienteError || !cliente) {
    return { ok: false, error: `No se pudo cargar el cliente: ${clienteError?.message ?? 'no encontrado'}` }
  }

  const { data: conceptos, error: conceptosError } = await supabase
    .from('conceptos')
    .select('clave_sat, clave_unidad, descripcion, cantidad, precio_unitario, iva')
    .eq('factura_id', facturaId)

  if (conceptosError || !conceptos || conceptos.length === 0) {
    return { ok: false, error: `No se pudieron cargar los conceptos: ${conceptosError?.message ?? 'sin conceptos'}` }
  }

  try {
    const { facturamaId, uuidFiscal } = await crearCfdi({
      emisor: { rfc: empresa.rfc_emisor, nombre: empresa.nombre, regimenFiscal: empresa.regimen_fiscal },
      receptor: {
        rfc: cliente.rfc, nombre: cliente.nombre, usoCfdi: cliente.uso_cfdi,
        regimenFiscal: cliente.regimen_fiscal, codigoPostal: cliente.codigo_postal,
      },
      conceptos: conceptos.map(c => ({
        claveSat: c.clave_sat,
        claveUnidad: c.clave_unidad,
        descripcion: c.descripcion,
        cantidad: Number(c.cantidad),
        precioUnitario: Number(c.precio_unitario),
        iva: Number(c.iva),
      })),
      formaPago: factura.forma_pago,
      metodoPago: factura.metodo_pago,
      lugarExpedicion: empresa.cp_emisor,
      folio: factura.folio,
    })

    const { error: updateError } = await supabase
      .from('facturas')
      .update({
        status: 'timbrada',
        facturama_id: facturamaId,
        uuid_fiscal: uuidFiscal,
        xml_url: `/api/facturas/${facturaId}/xml`,
        pdf_url: `/api/facturas/${facturaId}/pdf`,
        error_timbrado: null,
      })
      .eq('id', facturaId)

    if (updateError) {
      return { ok: false, error: `Se timbró en Facturama pero no se pudo guardar el resultado: ${updateError.message}` }
    }

    return { ok: true }
  } catch (err) {
    const message = err instanceof FacturamaError ? err.message : 'Error desconocido al timbrar'
    await supabase.from('facturas').update({ error_timbrado: message }).eq('id', facturaId)
    return { ok: false, error: message }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/integration/intentar-timbrado.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Wire it into `POST /api/facturas`**

Replace `src/app/api/facturas/route.ts` entirely:

```typescript
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseRequiredStrings } from '@/lib/validation'
import { intentarTimbrado } from '@/lib/facturas/intentar-timbrado'
import type { Json } from '@/lib/supabase/database.types'

interface ConceptoPayload {
  clave_sat: string
  clave_unidad: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  iva: number
}

function parseConceptos(value: unknown): ConceptoPayload[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const parsed: ConceptoPayload[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null
    const c = item as Record<string, unknown>
    if (
      typeof c.claveSat !== 'string' || !c.claveSat ||
      typeof c.claveUnidad !== 'string' || !c.claveUnidad ||
      typeof c.descripcion !== 'string' || !c.descripcion ||
      typeof c.cantidad !== 'number' || !Number.isFinite(c.cantidad) ||
      typeof c.precioUnitario !== 'number' || !Number.isFinite(c.precioUnitario) ||
      typeof c.iva !== 'number' || !Number.isFinite(c.iva)
    ) {
      return null
    }
    parsed.push({
      clave_sat: c.claveSat,
      clave_unidad: c.claveUnidad,
      descripcion: c.descripcion,
      cantidad: c.cantidad,
      precio_unitario: c.precioUnitario,
      iva: c.iva,
    })
  }
  return parsed
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('facturas')
    .select('id, folio, uuid_fiscal, fecha, total, status, cliente_id, error_timbrado')
    .order('fecha', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ facturas: data })
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 })
  }

  const parsedStrings = parseRequiredStrings(body, ['clienteId', 'formaPago', 'metodoPago'])
  if ('error' in parsedStrings) {
    return NextResponse.json({ error: parsedStrings.error }, { status: 400 })
  }

  const { conceptos } = body as Record<string, unknown>

  const conceptosParsed = parseConceptos(conceptos)
  if (!conceptosParsed) {
    return NextResponse.json({ error: 'La factura debe tener al menos un concepto válido' }, { status: 400 })
  }

  const { data: facturaCreada, error: crearError } = await supabase.rpc('crear_factura', {
    p_cliente_id: parsedStrings.data.clienteId,
    p_conceptos: conceptosParsed as unknown as Json,
    p_forma_pago: parsedStrings.data.formaPago,
    p_metodo_pago: parsedStrings.data.metodoPago,
  })

  if (crearError || !facturaCreada) {
    return NextResponse.json({ error: crearError?.message ?? 'No se pudo crear la factura' }, { status: 400 })
  }

  await intentarTimbrado(supabase, facturaCreada.id)

  const { data: factura, error: reloadError } = await supabase
    .from('facturas')
    .select('id, folio, uuid_fiscal, status, error_timbrado')
    .eq('id', facturaCreada.id)
    .single()

  if (reloadError || !factura) {
    return NextResponse.json({ error: 'No se pudo recargar la factura' }, { status: 400 })
  }

  return NextResponse.json({ factura }, { status: 201 })
}
```

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/facturas/intentar-timbrado.ts src/app/api/facturas/route.ts tests/integration/intentar-timbrado.test.ts
git commit -m "feat: attempt real stamping right after crear_factura via intentarTimbrado"
```

---

### Task 9: `POST /api/facturas/:id/timbrar` — retry route

**Files:**
- Create: `src/app/api/facturas/[id]/timbrar/route.ts`
- Test: `tests/integration/timbrar-retry-route.test.ts`

**Interfaces:**
- Consumes: `intentarTimbrado` (Task 8).
- Produces: `POST /api/facturas/:id/timbrar` → `{ factura: { id, status, uuid_fiscal, error_timbrado } }` (200), or `{ error }` (409 if not pendiente). Task 13 (Historial "Reintentar timbrado" button) calls this.

Route handlers read cookies via `next/headers`, which throws outside a real request context. To test the route function directly (without a running dev server), this task mocks `@/lib/supabase/server` to hand back a real, already-signed-in Supabase client instead of the cookie-based one — the route body still runs for real against the test Supabase project.

- [ ] **Step 1: Write the failing route test**

```typescript
// tests/integration/timbrar-retry-route.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

const clienteActual: { current: unknown } = { current: null }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => clienteActual.current,
}))

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import * as facturamaClient from '@/lib/facturama/client'
import type { Database } from '@/lib/supabase/database.types'
import { POST } from '@/app/api/facturas/[id]/timbrar/route'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Variables de Supabase requeridas en .env.local para correr esta prueba.')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const admin = createAdminClient()
const suffix = Date.now()
const email = `timbrar-retry-${suffix}@example.com`
const password = 'Test-password-123!'

let empresaId: string
let clienteId: string
let facturaId: string

beforeAll(async () => {
  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .insert({ nombre: `Retry Route Test ${suffix}`, rfc_emisor: `RRT${suffix % 100000}AAA`, regimen_fiscal: '601', cp_emisor: '65000', csd_status: 'registrado' })
    .select('id')
    .single()
  if (empresaError) throw empresaError
  empresaId = empresa.id

  const { data: user, error: userError } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (userError) throw userError

  await admin.from('usuarios_empresa').insert({ user_id: user.user.id, empresa_id: empresaId })

  const { data: cliente, error: clienteError } = await admin
    .from('clientes')
    .insert({ empresa_id: empresaId, nombre: 'Cliente Retry', rfc: 'CLR010101AAA', regimen_fiscal: '601', codigo_postal: '65000', uso_cfdi: 'G03' })
    .select('id')
    .single()
  if (clienteError) throw clienteError
  clienteId = cliente.id

  const anon = createSupabaseClient<Database>(url, anonKey)
  await anon.auth.signInWithPassword({ email, password })
  clienteActual.current = anon

  const { data: factura, error: facturaError } = await anon.rpc('crear_factura', {
    p_cliente_id: clienteId,
    p_conceptos: [{ clave_sat: '81161500', clave_unidad: 'H87', descripcion: 'Servicio', cantidad: 1, precio_unitario: 100, iva: 16 }],
    p_forma_pago: '01',
    p_metodo_pago: 'PUE',
  })
  if (facturaError) throw facturaError
  facturaId = factura!.id
})

afterAll(async () => {
  await admin.from('conceptos').delete().eq('factura_id', facturaId)
  await admin.from('facturas').delete().eq('id', facturaId)
  await admin.from('folios_empresa').delete().eq('empresa_id', empresaId)
  await admin.from('clientes').delete().eq('id', clienteId)
  await admin.from('usuarios_empresa').delete().eq('empresa_id', empresaId)
  await admin.from('empresas').delete().eq('id', empresaId)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('POST /api/facturas/:id/timbrar', () => {
  it('timbra una factura pendiente y retorna status=timbrada', async () => {
    vi.spyOn(facturamaClient, 'crearCfdi').mockResolvedValue({ facturamaId: 'fact-retry-1', uuidFiscal: 'uuid-retry-1' })

    const res = await POST(new Request('http://localhost/api/facturas/x/timbrar') as never, { params: Promise.resolve({ id: facturaId }) })
    const body = await res.json()

    expect(res.status).toBe(200)
    expect(body.factura.status).toBe('timbrada')
    expect(body.factura.uuid_fiscal).toBe('uuid-retry-1')
  })

  it('responde 409 si la factura ya no está pendiente', async () => {
    const res = await POST(new Request('http://localhost/api/facturas/x/timbrar') as never, { params: Promise.resolve({ id: facturaId }) })
    const body = await res.json()

    expect(res.status).toBe(409)
    expect(body.error).toBe('La factura no existe o ya no está pendiente')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/timbrar-retry-route.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/facturas/[id]/timbrar/route'"

- [ ] **Step 3: Write the route**

```typescript
// src/app/api/facturas/[id]/timbrar/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { intentarTimbrado } from '@/lib/facturas/intentar-timbrado'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { id } = await params

  const { data: facturaAntes } = await supabase.from('facturas').select('status').eq('id', id).maybeSingle()
  if (!facturaAntes || facturaAntes.status !== 'pendiente') {
    return NextResponse.json({ error: 'La factura no existe o ya no está pendiente' }, { status: 409 })
  }

  await intentarTimbrado(supabase, id)

  const { data: factura, error } = await supabase
    .from('facturas')
    .select('id, status, uuid_fiscal, error_timbrado')
    .eq('id', id)
    .single()

  if (error || !factura) {
    return NextResponse.json({ error: 'No se pudo recargar la factura' }, { status: 400 })
  }

  return NextResponse.json({ factura })
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/integration/timbrar-retry-route.test.ts`
Expected: PASS (2 tests)

- [ ] **Step 5: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add src/app/api/facturas/\[id\]/timbrar/route.ts tests/integration/timbrar-retry-route.test.ts
git commit -m "feat: add POST /api/facturas/:id/timbrar retry route"
```

---

### Task 10: XML/PDF download routes

**Files:**
- Create: `src/app/api/facturas/[id]/xml/route.ts`
- Create: `src/app/api/facturas/[id]/pdf/route.ts`
- Test: `tests/integration/descargar-factura-route.test.ts`

**Interfaces:**
- Consumes: `obtenerXml`, `obtenerPdf`, `FacturamaError` (Task 4).
- Produces: `GET /api/facturas/:id/xml` and `GET /api/facturas/:id/pdf` → raw file bytes with `Content-Type`/`Content-Disposition`, or 404 JSON. Task 13 (Historial download links) points at these.

- [ ] **Step 1: Write the failing route test**

```typescript
// tests/integration/descargar-factura-route.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

const clienteActual: { current: unknown } = { current: null }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => clienteActual.current,
}))

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import * as facturamaClient from '@/lib/facturama/client'
import type { Database } from '@/lib/supabase/database.types'
import { GET as getXml } from '@/app/api/facturas/[id]/xml/route'
import { GET as getPdf } from '@/app/api/facturas/[id]/pdf/route'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Variables de Supabase requeridas en .env.local para correr esta prueba.')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const admin = createAdminClient()
const suffix = Date.now()
const email = `descargar-factura-${suffix}@example.com`
const password = 'Test-password-123!'

let empresaId: string
let clienteId: string
let facturaTimbradaId: string
let facturaPendienteId: string

beforeAll(async () => {
  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .insert({ nombre: `Descargar Test ${suffix}`, rfc_emisor: `DSC${suffix % 100000}AAA`, regimen_fiscal: '601', cp_emisor: '65000' })
    .select('id')
    .single()
  if (empresaError) throw empresaError
  empresaId = empresa.id

  const { data: user, error: userError } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (userError) throw userError
  await admin.from('usuarios_empresa').insert({ user_id: user.user.id, empresa_id: empresaId })

  const { data: cliente, error: clienteError } = await admin
    .from('clientes')
    .insert({ empresa_id: empresaId, nombre: 'Cliente Descarga', rfc: 'CLD010101AAA', regimen_fiscal: '601', codigo_postal: '65000', uso_cfdi: 'G03' })
    .select('id')
    .single()
  if (clienteError) throw clienteError
  clienteId = cliente.id

  const anon = createSupabaseClient<Database>(url, anonKey)
  await anon.auth.signInWithPassword({ email, password })
  clienteActual.current = anon

  const { data: timbrada } = await anon.rpc('crear_factura', {
    p_cliente_id: clienteId,
    p_conceptos: [{ clave_sat: '81161500', clave_unidad: 'H87', descripcion: 'S', cantidad: 1, precio_unitario: 100, iva: 16 }],
    p_forma_pago: '01', p_metodo_pago: 'PUE',
  })
  facturaTimbradaId = timbrada!.id
  await admin.from('facturas').update({ status: 'timbrada', facturama_id: 'fact-descarga-1' }).eq('id', facturaTimbradaId)

  const { data: pendiente } = await anon.rpc('crear_factura', {
    p_cliente_id: clienteId,
    p_conceptos: [{ clave_sat: '81161500', clave_unidad: 'H87', descripcion: 'S', cantidad: 1, precio_unitario: 100, iva: 16 }],
    p_forma_pago: '01', p_metodo_pago: 'PUE',
  })
  facturaPendienteId = pendiente!.id
})

afterAll(async () => {
  await admin.from('conceptos').delete().in('factura_id', [facturaTimbradaId, facturaPendienteId])
  await admin.from('facturas').delete().in('id', [facturaTimbradaId, facturaPendienteId])
  await admin.from('folios_empresa').delete().eq('empresa_id', empresaId)
  await admin.from('clientes').delete().eq('id', clienteId)
  await admin.from('usuarios_empresa').delete().eq('empresa_id', empresaId)
  await admin.from('empresas').delete().eq('id', empresaId)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('GET /api/facturas/:id/xml y /pdf', () => {
  it('descarga el XML de una factura timbrada', async () => {
    vi.spyOn(facturamaClient, 'obtenerXml').mockResolvedValue({ content: Buffer.from('<cfdi/>'), contentType: 'application/xml' })

    const res = await getXml(new Request('http://localhost') as never, { params: Promise.resolve({ id: facturaTimbradaId }) })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/xml')
    expect(await res.text()).toBe('<cfdi/>')
  })

  it('descarga el PDF de una factura timbrada', async () => {
    vi.spyOn(facturamaClient, 'obtenerPdf').mockResolvedValue({ content: Buffer.from('%PDF-fake'), contentType: 'application/pdf' })

    const res = await getPdf(new Request('http://localhost') as never, { params: Promise.resolve({ id: facturaTimbradaId }) })

    expect(res.status).toBe(200)
    expect(res.headers.get('Content-Type')).toBe('application/pdf')
  })

  it('responde 404 para una factura pendiente (sin facturama_id)', async () => {
    const res = await getXml(new Request('http://localhost') as never, { params: Promise.resolve({ id: facturaPendienteId }) })
    expect(res.status).toBe(404)
  })

  it('responde 404 para un id de factura inexistente', async () => {
    const res = await getXml(new Request('http://localhost') as never, { params: Promise.resolve({ id: '00000000-0000-0000-0000-000000000000' }) })
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/integration/descargar-factura-route.test.ts`
Expected: FAIL with "Cannot find module '@/app/api/facturas/[id]/xml/route'"

- [ ] **Step 3: Write the XML route**

```typescript
// src/app/api/facturas/[id]/xml/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obtenerXml, FacturamaError } from '@/lib/facturama/client'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { id } = await params

  const { data: factura } = await supabase
    .from('facturas')
    .select('folio, status, facturama_id')
    .eq('id', id)
    .maybeSingle()

  if (!factura || factura.status !== 'timbrada' || !factura.facturama_id) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  try {
    const { content, contentType } = await obtenerXml(factura.facturama_id)
    return new NextResponse(content, {
      headers: { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${factura.folio}.xml"` },
    })
  } catch (err) {
    const message = err instanceof FacturamaError ? err.message : 'Error al descargar el XML'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
```

- [ ] **Step 4: Write the PDF route**

```typescript
// src/app/api/facturas/[id]/pdf/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obtenerPdf, FacturamaError } from '@/lib/facturama/client'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { id } = await params

  const { data: factura } = await supabase
    .from('facturas')
    .select('folio, status, facturama_id')
    .eq('id', id)
    .maybeSingle()

  if (!factura || factura.status !== 'timbrada' || !factura.facturama_id) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  try {
    const { content, contentType } = await obtenerPdf(factura.facturama_id)
    return new NextResponse(content, {
      headers: { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${factura.folio}.pdf"` },
    })
  } catch (err) {
    const message = err instanceof FacturamaError ? err.message : 'Error al descargar el PDF'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run tests/integration/descargar-factura-route.test.ts`
Expected: PASS (4 tests)

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/app/api/facturas/\[id\]/xml/route.ts src/app/api/facturas/\[id\]/pdf/route.ts tests/integration/descargar-factura-route.test.ts
git commit -m "feat: add XML/PDF proxy download routes for timbrada facturas"
```

---

### Task 11: Real cancellation of timbrada facturas

**Files:**
- Create: `src/lib/facturas/cancelar-timbrado.ts`
- Create: `src/app/api/facturas/[id]/cancelar-timbrado/route.ts`
- Test: `tests/integration/cancelar-timbrado.test.ts`

**Interfaces:**
- Consumes: `cancelarCfdi`, `FacturamaError`, `type MotivoCancelacion` (Task 4).
- Produces: `cancelarTimbrado(supabase, facturaId, motivo, uuidSustitucion?): Promise<{ ok: true } | { error: string }>`; `POST /api/facturas/:id/cancelar-timbrado` with body `{ motivo, uuidSustitucion? }`. Task 13 (Historial cancel modal) calls this route.

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/integration/cancelar-timbrado.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))

const clienteActual: { current: unknown } = { current: null }
vi.mock('@/lib/supabase/server', () => ({
  createClient: async () => clienteActual.current,
}))

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { cancelarTimbrado } from '@/lib/facturas/cancelar-timbrado'
import * as facturamaClient from '@/lib/facturama/client'
import type { Database } from '@/lib/supabase/database.types'
import { POST as postCancelarTimbrado } from '@/app/api/facturas/[id]/cancelar-timbrado/route'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Variables de Supabase requeridas en .env.local para correr esta prueba.')
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const admin = createAdminClient()
const suffix = Date.now()
const email = `cancelar-timbrado-${suffix}@example.com`
const password = 'Test-password-123!'

let empresaId: string
let clienteId: string
let anon: ReturnType<typeof createSupabaseClient<Database>>

async function crearFacturaTimbrada(facturamaId: string) {
  const { data } = await anon.rpc('crear_factura', {
    p_cliente_id: clienteId,
    p_conceptos: [{ clave_sat: '81161500', clave_unidad: 'H87', descripcion: 'S', cantidad: 1, precio_unitario: 100, iva: 16 }],
    p_forma_pago: '01', p_metodo_pago: 'PUE',
  })
  await admin.from('facturas').update({ status: 'timbrada', facturama_id: facturamaId }).eq('id', data!.id)
  return data!.id as string
}

beforeAll(async () => {
  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .insert({ nombre: `Cancelar Timbrado Test ${suffix}`, rfc_emisor: `CTM${suffix % 100000}AAA`, regimen_fiscal: '601', cp_emisor: '65000' })
    .select('id')
    .single()
  if (empresaError) throw empresaError
  empresaId = empresa.id

  const { data: user, error: userError } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (userError) throw userError
  await admin.from('usuarios_empresa').insert({ user_id: user.user.id, empresa_id: empresaId })

  const { data: cliente, error: clienteError } = await admin
    .from('clientes')
    .insert({ empresa_id: empresaId, nombre: 'Cliente Cancelar T', rfc: 'CLK010101AAA', regimen_fiscal: '601', codigo_postal: '65000', uso_cfdi: 'G03' })
    .select('id')
    .single()
  if (clienteError) throw clienteError
  clienteId = cliente.id

  anon = createSupabaseClient<Database>(url, anonKey)
  await anon.auth.signInWithPassword({ email, password })
  clienteActual.current = anon
})

afterAll(async () => {
  const { data: facturas } = await admin.from('facturas').select('id').eq('empresa_id', empresaId)
  const ids = facturas?.map(f => f.id) ?? []
  await admin.from('conceptos').delete().in('factura_id', ids)
  await admin.from('facturas').delete().in('id', ids)
  await admin.from('folios_empresa').delete().eq('empresa_id', empresaId)
  await admin.from('clientes').delete().eq('id', clienteId)
  await admin.from('usuarios_empresa').delete().eq('empresa_id', empresaId)
  await admin.from('empresas').delete().eq('id', empresaId)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('cancelarTimbrado (lib)', () => {
  it('cancela con motivo 02 y actualiza status a cancelada', async () => {
    const facturaId = await crearFacturaTimbrada('fact-cancel-1')
    vi.spyOn(facturamaClient, 'cancelarCfdi').mockResolvedValue(undefined)

    const result = await cancelarTimbrado(anon, facturaId, '02')

    expect(result).toEqual({ ok: true })
    const { data } = await admin.from('facturas').select('status').eq('id', facturaId).single()
    expect(data!.status).toBe('cancelada')
  })

  it('rechaza motivo 01 sin uuidSustitucion antes de llamar a Facturama', async () => {
    const facturaId = await crearFacturaTimbrada('fact-cancel-2')
    const spy = vi.spyOn(facturamaClient, 'cancelarCfdi')

    const result = await cancelarTimbrado(anon, facturaId, '01')

    expect(result).toEqual({ error: 'El motivo 01 requiere un UUID de sustitución' })
    expect(spy).not.toHaveBeenCalled()
  })

  it('no cambia el status si Facturama rechaza la cancelación', async () => {
    const facturaId = await crearFacturaTimbrada('fact-cancel-3')
    vi.spyOn(facturamaClient, 'cancelarCfdi').mockRejectedValue(new facturamaClient.FacturamaError('CFDI ya cancelado'))

    const result = await cancelarTimbrado(anon, facturaId, '02')

    expect(result).toEqual({ error: 'CFDI ya cancelado' })
    const { data } = await admin.from('facturas').select('status').eq('id', facturaId).single()
    expect(data!.status).toBe('timbrada')
  })
})

describe('POST /api/facturas/:id/cancelar-timbrado (route)', () => {
  it('responde 400 si el motivo no es válido', async () => {
    const facturaId = await crearFacturaTimbrada('fact-cancel-4')
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ motivo: '99' }) })

    const res = await postCancelarTimbrado(req as never, { params: Promise.resolve({ id: facturaId }) })
    expect(res.status).toBe(400)
  })

  it('cancela exitosamente con motivo 03', async () => {
    const facturaId = await crearFacturaTimbrada('fact-cancel-5')
    vi.spyOn(facturamaClient, 'cancelarCfdi').mockResolvedValue(undefined)
    const req = new Request('http://localhost', { method: 'POST', body: JSON.stringify({ motivo: '03' }) })

    const res = await postCancelarTimbrado(req as never, { params: Promise.resolve({ id: facturaId }) })
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run tests/integration/cancelar-timbrado.test.ts`
Expected: FAIL with "Cannot find module '@/lib/facturas/cancelar-timbrado'"

- [ ] **Step 3: Write the lib function**

```typescript
// src/lib/facturas/cancelar-timbrado.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { cancelarCfdi, FacturamaError, type MotivoCancelacion } from '@/lib/facturama/client'

export type { MotivoCancelacion }
export type CancelarTimbradoResult = { ok: true } | { error: string }

export async function cancelarTimbrado(
  supabase: SupabaseClient<Database>,
  facturaId: string,
  motivo: MotivoCancelacion,
  uuidSustitucion?: string,
): Promise<CancelarTimbradoResult> {
  const { data: factura, error: facturaError } = await supabase
    .from('facturas')
    .select('status, facturama_id')
    .eq('id', facturaId)
    .maybeSingle()

  if (facturaError || !factura) {
    return { error: 'La factura no existe' }
  }

  if (factura.status !== 'timbrada' || !factura.facturama_id) {
    return { error: 'La factura no está timbrada' }
  }

  if (motivo === '01' && !uuidSustitucion) {
    return { error: 'El motivo 01 requiere un UUID de sustitución' }
  }

  try {
    await cancelarCfdi(factura.facturama_id, motivo, uuidSustitucion)
  } catch (err) {
    return { error: err instanceof FacturamaError ? err.message : 'Error al cancelar en Facturama' }
  }

  const { error: updateError } = await supabase.from('facturas').update({ status: 'cancelada' }).eq('id', facturaId)

  if (updateError) {
    return { error: `Se canceló en Facturama pero no se pudo actualizar el estatus: ${updateError.message}` }
  }

  return { ok: true }
}
```

- [ ] **Step 4: Write the route**

```typescript
// src/app/api/facturas/[id]/cancelar-timbrado/route.ts
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cancelarTimbrado, type MotivoCancelacion } from '@/lib/facturas/cancelar-timbrado'

const MOTIVOS_VALIDOS: MotivoCancelacion[] = ['01', '02', '03', '04']

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 })
  }

  const { motivo, uuidSustitucion } = body as Record<string, unknown>

  if (typeof motivo !== 'string' || !MOTIVOS_VALIDOS.includes(motivo as MotivoCancelacion)) {
    return NextResponse.json({ error: 'Motivo inválido' }, { status: 400 })
  }

  if (motivo === '01' && (typeof uuidSustitucion !== 'string' || !uuidSustitucion)) {
    return NextResponse.json({ error: 'El motivo 01 requiere un UUID de sustitución' }, { status: 400 })
  }

  const { id } = await params
  const result = await cancelarTimbrado(
    supabase,
    id,
    motivo as MotivoCancelacion,
    typeof uuidSustitucion === 'string' ? uuidSustitucion : undefined,
  )

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm vitest run tests/integration/cancelar-timbrado.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/lib/facturas/cancelar-timbrado.ts src/app/api/facturas/\[id\]/cancelar-timbrado/route.ts tests/integration/cancelar-timbrado.test.ts
git commit -m "feat: add real cancellation of timbrada facturas via Facturama"
```

---

### Task 12: NuevaFactura.tsx — catalog-sourced conceptos + outcome-aware success screen

**Files:**
- Modify: `src/app/(app)/facturas/nueva/page.tsx`
- Modify: `src/components/NuevaFactura.tsx`
- Test: `src/components/NuevaFactura.test.tsx`

**Interfaces:**
- Consumes: `POST /api/facturas` (Task 8), which now returns `{ factura: { id, folio, uuid_fiscal, status, error_timbrado } }`.
- Produces: `NuevaFactura({ clientes, productos }: { clientes: Cliente[]; productos: Producto[] })`.

- [ ] **Step 1: Write the failing component test**

```typescript
// src/components/NuevaFactura.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import NuevaFactura from './NuevaFactura'

const clientes = [{ id: 'cli-1', nombre: 'Cliente Uno', rfc: 'CUN010101AAA', regimen_fiscal: '601', uso_cfdi: 'G03' }]
const productos = [{ id: 'prod-1', clave_sat: '81161500', clave_unidad: 'H87', nombre: 'Consultoría', precio: 500, iva: 16 }]

afterEach(() => {
  vi.restoreAllMocks()
})

function seleccionarCliente() {
  fireEvent.change(screen.getByPlaceholderText('Buscar cliente por nombre o RFC...'), { target: { value: 'Cliente' } })
  fireEvent.click(screen.getByText('Cliente Uno'))
}

function agregarConceptoDelCatalogo() {
  fireEvent.click(screen.getByText('Agregar desde catálogo'))
  fireEvent.click(screen.getByText('Consultoría'))
}

describe('NuevaFactura - conceptos desde catálogo', () => {
  it('el botón Timbrar factura está deshabilitado sin conceptos', () => {
    render(<NuevaFactura clientes={clientes} productos={productos} />)
    expect(screen.getByText('Timbrar factura')).toBeDisabled()
  })

  it('agregar un producto del catálogo precarga clave SAT, unidad, descripción, precio e IVA', () => {
    render(<NuevaFactura clientes={clientes} productos={productos} />)
    agregarConceptoDelCatalogo()

    expect(screen.getByText('81161500')).toBeInTheDocument()
    expect(screen.getByText('H87')).toBeInTheDocument()
    expect(screen.getByText('Consultoría')).toBeInTheDocument()
    expect(screen.getByText('Timbrar factura')).not.toBeDisabled()
  })

  it('envía claveUnidad, formaPago y metodoPago en el body de POST /api/facturas', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ factura: { id: 'f1', folio: 'A-0001', uuid_fiscal: 'uuid-1', status: 'timbrada', error_timbrado: null } }),
      { status: 201 },
    ))

    render(<NuevaFactura clientes={clientes} productos={productos} />)
    seleccionarCliente()
    agregarConceptoDelCatalogo()
    fireEvent.click(screen.getByText('Timbrar factura'))

    await waitFor(() => expect(screen.getByText(/uuid-1/)).toBeInTheDocument())

    const [, options] = fetchMock.mock.calls[0]
    const body = JSON.parse((options as RequestInit).body as string)
    expect(body.formaPago).toBe('01')
    expect(body.metodoPago).toBe('PUE')
    expect(body.conceptos[0]).toMatchObject({ claveSat: '81161500', claveUnidad: 'H87' })
  })

  it('muestra el error de timbrado y el folio cuando la factura queda pendiente', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ factura: { id: 'f2', folio: 'A-0002', uuid_fiscal: null, status: 'pendiente', error_timbrado: 'CSD no registrado' } }),
      { status: 201 },
    ))

    render(<NuevaFactura clientes={clientes} productos={productos} />)
    seleccionarCliente()
    agregarConceptoDelCatalogo()
    fireEvent.click(screen.getByText('Timbrar factura'))

    await waitFor(() => expect(screen.getByText(/A-0002/)).toBeInTheDocument())
    expect(screen.getByText(/CSD no registrado/)).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/NuevaFactura.test.tsx`
Expected: FAIL (`productos` prop doesn't exist yet, "Agregar desde catálogo" text not found)

- [ ] **Step 3: Update the page wrapper**

```typescript
// src/app/(app)/facturas/nueva/page.tsx
import { createClient } from '@/lib/supabase/server'
import NuevaFactura from '@/components/NuevaFactura'

export default async function NuevaFacturaPage() {
  const supabase = await createClient()
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre, rfc, regimen_fiscal, uso_cfdi')
    .order('nombre', { ascending: true })

  const { data: productos } = await supabase
    .from('productos')
    .select('id, clave_sat, clave_unidad, nombre, precio, iva')
    .order('nombre', { ascending: true })

  return <NuevaFactura clientes={clientes ?? []} productos={productos ?? []} />
}
```

- [ ] **Step 4: Replace `src/components/NuevaFactura.tsx` entirely**

```typescript
'use client'

import { useState } from 'react'
import { Search, Plus, Trash2, CheckCircle, AlertTriangle } from 'lucide-react'

interface Cliente {
  id: string
  nombre: string
  rfc: string
  regimen_fiscal: string
  uso_cfdi: string
}

interface Producto {
  id: string
  clave_sat: string
  clave_unidad: string
  nombre: string
  precio: number
  iva: number
}

interface Concepto {
  id: string
  claveSat: string
  claveUnidad: string
  descripcion: string
  cantidad: number
  precio: number
  iva: number
}

interface ResultadoFactura {
  folio: string
  status: 'timbrada' | 'pendiente' | 'cancelada'
  uuidFiscal: string | null
  errorTimbrado: string | null
  facturaId: string
}

export default function NuevaFactura({ clientes, productos }: { clientes: Cliente[]; productos: Producto[] }) {
  const [clienteSearch, setClienteSearch] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [showProductoDropdown, setShowProductoDropdown] = useState(false)
  const [productoSearch, setProductoSearch] = useState('')
  const [formaPago, setFormaPago] = useState('01')
  const [metodoPago, setMetodoPago] = useState('PUE')
  const [resultado, setResultado] = useState<ResultadoFactura | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredClientes = clientes.filter(c =>
    c.nombre.toLowerCase().includes(clienteSearch.toLowerCase()) ||
    c.rfc.toLowerCase().includes(clienteSearch.toLowerCase())
  )

  const filteredProductos = productos.filter(p =>
    p.nombre.toLowerCase().includes(productoSearch.toLowerCase()) ||
    p.clave_sat.includes(productoSearch)
  )

  const subtotal = conceptos.reduce((acc, c) => acc + c.cantidad * c.precio, 0)
  const ivaTotal = conceptos.reduce((acc, c) => acc + c.cantidad * c.precio * (c.iva / 100), 0)
  const total = subtotal + ivaTotal

  function addConceptoDesdeProducto(producto: Producto) {
    setConceptos(prev => [...prev, {
      id: `${producto.id}-${Date.now()}`,
      claveSat: producto.clave_sat,
      claveUnidad: producto.clave_unidad,
      descripcion: producto.nombre,
      cantidad: 1,
      precio: producto.precio,
      iva: producto.iva,
    }])
    setShowProductoDropdown(false)
    setProductoSearch('')
  }

  const updateConcepto = (id: string, field: 'cantidad' | 'precio', value: number) => {
    setConceptos(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  const removeConcepto = (id: string) => {
    setConceptos(prev => prev.filter(c => c.id !== id))
  }

  function resetForm() {
    setResultado(null)
    setClienteSearch('')
    setClienteSeleccionado(null)
    setConceptos([])
  }

  async function handleTimbrar() {
    if (!clienteSeleccionado) {
      setError('Selecciona un cliente antes de crear la factura')
      return
    }

    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/facturas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: clienteSeleccionado.id,
        formaPago,
        metodoPago,
        conceptos: conceptos.map(c => ({
          claveSat: c.claveSat,
          claveUnidad: c.claveUnidad,
          descripcion: c.descripcion,
          cantidad: c.cantidad,
          precioUnitario: c.precio,
          iva: c.iva,
        })),
      }),
    })

    if (!res.ok) {
      try {
        const body = await res.json()
        setError(body.error ?? 'Error al crear la factura')
      } catch {
        setError('Error al crear la factura')
      }
      setSubmitting(false)
      return
    }

    const { factura } = await res.json()
    setResultado({
      facturaId: factura.id,
      folio: factura.folio,
      status: factura.status,
      uuidFiscal: factura.uuid_fiscal,
      errorTimbrado: factura.error_timbrado,
    })
    setSubmitting(false)
  }

  if (resultado) {
    const timbrada = resultado.status === 'timbrada'
    return (
      <div style={{ padding: '80px 36px', maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
          backgroundColor: timbrada ? '#dcfce7' : '#fef9c3',
        }}>
          {timbrada ? <CheckCircle size={32} color="#16a34a" /> : <AlertTriangle size={32} color="#d97706" />}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          {timbrada ? '¡Factura timbrada!' : 'Factura registrada, pero el timbrado falló'}
        </h2>
        <p style={{ fontSize: 13.5, color: '#64748b', margin: '0 0 24px' }}>
          Folio: <strong>{resultado.folio}</strong>.
          {timbrada
            ? <> UUID fiscal: <strong>{resultado.uuidFiscal}</strong></>
            : <> {resultado.errorTimbrado}. Puedes reintentar el timbrado desde Historial.</>}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button style={{ ...primaryBtn, width: 'auto', padding: '9px 20px' }} onClick={resetForm}>Nueva factura</button>
          {timbrada && (
            <>
              <a href={`/api/facturas/${resultado.facturaId}/xml`} style={{ ...secondaryBtn, width: 'auto', padding: '9px 20px', textDecoration: 'none' }}>
                Descargar XML
              </a>
              <a href={`/api/facturas/${resultado.facturaId}/pdf`} style={{ ...secondaryBtn, width: 'auto', padding: '9px 20px', textDecoration: 'none' }}>
                Descargar PDF
              </a>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>Nueva Factura (CFDI 4.0)</h1>
        <p style={{ fontSize: 13.5, color: '#64748b', margin: '4px 0 0' }}>Ingresa los datos del comprobante fiscal</p>
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          <section style={card}>
            <h3 style={sectionTitle}>Receptor</h3>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  value={clienteSearch}
                  onChange={e => { setClienteSearch(e.target.value); setShowDropdown(true); setClienteSeleccionado(null) }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Buscar cliente por nombre o RFC..."
                  style={{ ...inputStyle, paddingLeft: 32 }}
                />
              </div>
              {showDropdown && clienteSearch && (
                <div style={{
                  position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, backgroundColor: '#fff',
                  border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  marginTop: 4, maxHeight: 200, overflowY: 'auto',
                }}>
                  {filteredClientes.length === 0 ? (
                    <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>Sin resultados</div>
                  ) : filteredClientes.map(c => (
                    <div
                      key={c.id}
                      onClick={() => { setClienteSeleccionado(c); setClienteSearch(c.nombre); setShowDropdown(false) }}
                      style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{c.nombre}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{c.rfc} · Uso {c.uso_cfdi}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {clienteSeleccionado && (
              <div style={{ marginTop: 10, padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                  <div><span style={{ color: '#94a3b8' }}>RFC: </span><strong>{clienteSeleccionado.rfc}</strong></div>
                  <div><span style={{ color: '#94a3b8' }}>Régimen: </span><strong>{clienteSeleccionado.regimen_fiscal}</strong></div>
                  <div><span style={{ color: '#94a3b8' }}>Uso CFDI: </span><strong>{clienteSeleccionado.uso_cfdi}</strong></div>
                </div>
              </div>
            )}
          </section>

          <section style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, position: 'relative' }}>
              <h3 style={{ ...sectionTitle, margin: 0 }}>Conceptos</h3>
              <button onClick={() => setShowProductoDropdown(v => !v)} style={{ ...primaryBtn, width: 'auto', padding: '6px 12px', fontSize: 12 }}>
                <Plus size={12} /> Agregar desde catálogo
              </button>
              {showProductoDropdown && (
                <div style={{
                  position: 'absolute', zIndex: 20, top: '100%', right: 0, width: 320, backgroundColor: '#fff',
                  border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  marginTop: 4, maxHeight: 260, overflowY: 'auto',
                }}>
                  <div style={{ padding: 8 }}>
                    <input
                      autoFocus
                      value={productoSearch}
                      onChange={e => setProductoSearch(e.target.value)}
                      placeholder="Buscar producto por nombre o clave SAT..."
                      style={inputStyle}
                    />
                  </div>
                  {productos.length === 0 ? (
                    <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>
                      No tienes productos en tu catálogo. Agrega uno en Catálogo antes de facturar.
                    </div>
                  ) : filteredProductos.length === 0 ? (
                    <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>Sin resultados</div>
                  ) : filteredProductos.map(p => (
                    <div
                      key={p.id}
                      onClick={() => addConceptoDesdeProducto(p)}
                      style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{p.nombre}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{p.clave_sat} · {p.clave_unidad}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {['Clave SAT', 'Unidad', 'Descripción', 'Cant.', 'Precio unit.', 'IVA %', 'Importe', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '0 8px 8px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conceptos.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 12 }}>{c.claveSat}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 12 }}>{c.claveUnidad}</td>
                      <td style={{ padding: '6px 8px' }}>{c.descripcion}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="number" value={c.cantidad} onChange={e => updateConcepto(c.id, 'cantidad', Number(e.target.value))} style={{ ...miniInput, width: 55, textAlign: 'center' }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="number" value={c.precio} onChange={e => updateConcepto(c.id, 'precio', Number(e.target.value))} style={{ ...miniInput, width: 100 }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>{c.iva}%</td>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                        ${(c.cantidad * c.precio).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <button onClick={() => removeConcepto(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#dc2626')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {conceptos.length === 0 && (
                <div style={{ padding: '24px 8px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  Sin conceptos. Agrega uno desde el catálogo.
                </div>
              )}
            </div>
          </section>

          <section style={card}>
            <h3 style={sectionTitle}>Forma y método de pago</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Forma de pago</label>
                <select value={formaPago} onChange={e => setFormaPago(e.target.value)} style={inputStyle}>
                  <option value="01">01 – Efectivo</option>
                  <option value="03">03 – Transferencia</option>
                  <option value="04">04 – Tarjeta de crédito</option>
                  <option value="28">28 – Tarjeta de débito</option>
                  <option value="99">99 – Por definir</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Método de pago</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  {['PUE', 'PPD'].map(m => (
                    <button
                      key={m}
                      onClick={() => setMetodoPago(m)}
                      style={{
                        flex: 1, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        border: `1px solid ${metodoPago === m ? '#4f46e5' : '#e2e8f0'}`,
                        backgroundColor: metodoPago === m ? '#eef2ff' : '#fff',
                        color: metodoPago === m ? '#4f46e5' : '#64748b',
                        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 10.5, color: '#94a3b8', margin: '4px 0 0' }}>
                  {metodoPago === 'PUE' ? 'Pago en una sola exhibición' : 'Pago en parcialidades o diferido'}
                </p>
              </div>
            </div>
          </section>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 24 }}>
          <div style={card}>
            <h3 style={sectionTitle}>Resumen</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Row label="Subtotal" value={`$${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`} />
              <Row label="IVA" value={`$${ivaTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`} />
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Total</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>
                  ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div style={{ marginTop: 12, padding: '10px', backgroundColor: '#f8fafc', borderRadius: 8, fontSize: 11.5, color: '#64748b' }}>
              <div><strong>Moneda:</strong> MXN · Tipo de cambio: 1.0</div>
              <div><strong>Método:</strong> {metodoPago === 'PUE' ? 'Una exhibición' : 'Parcialidades'}</div>
            </div>
          </div>

          <button
            onClick={handleTimbrar}
            disabled={submitting || conceptos.length === 0}
            style={{ ...primaryBtn, width: '100%', padding: '12px', fontSize: 14, opacity: (submitting || conceptos.length === 0) ? 0.6 : 1, cursor: (submitting || conceptos.length === 0) ? 'not-allowed' : 'pointer' }}
          >
            {submitting ? 'Guardando…' : 'Timbrar factura'}
          </button>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontWeight: 500, color: '#0f172a' }}>{value}</span>
    </div>
  )
}

const card: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '20px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
}
const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#0f172a', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.06em' }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
  fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff',
}
const miniInput: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0',
  fontSize: 12, color: '#0f172a', outline: 'none', fontFamily: 'Inter, sans-serif',
}
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }
const primaryBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '9px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
  backgroundColor: '#4f46e5', color: '#ffffff', fontSize: 13, fontWeight: 600,
  fontFamily: 'Inter, sans-serif', transition: 'background-color 0.15s',
}
const secondaryBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer',
  backgroundColor: '#ffffff', color: '#475569', fontSize: 13, fontWeight: 500,
  fontFamily: 'Inter, sans-serif',
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/components/NuevaFactura.test.tsx`
Expected: PASS (4 tests)

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/facturas/nueva/page.tsx" src/components/NuevaFactura.tsx src/components/NuevaFactura.test.tsx
git commit -m "feat: source NuevaFactura conceptos from catalog and show real stamping outcome"
```

---

### Task 13: Historial.tsx — retry, real cancel modal, downloads

**Files:**
- Modify: `src/app/(app)/historial/page.tsx`
- Modify: `src/components/Historial.tsx`
- Test: `src/components/Historial.test.tsx`

**Interfaces:**
- Consumes: `POST /api/facturas/:id/timbrar` (Task 9), `GET /api/facturas/:id/xml`/`pdf` (Task 10), `POST /api/facturas/:id/cancelar-timbrado` (Task 11), existing `PATCH /api/facturas/:id/cancelar` (unchanged, sub-project 3).

- [ ] **Step 1: Write the failing component test**

```typescript
// src/components/Historial.test.tsx
import { afterEach, describe, expect, it, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import Historial from './Historial'

const refresh = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))

afterEach(() => {
  vi.restoreAllMocks()
  refresh.mockClear()
})

const facturaPendiente = {
  id: 'f-pend', folio: 'A-0001', uuid_fiscal: null, fecha: '2026-07-01T00:00:00Z', total: 100,
  status: 'pendiente' as const, cliente_nombre: 'Cliente A', cliente_rfc: 'CAA010101AAA', error_timbrado: 'CSD no registrado',
}
const facturaTimbrada = {
  id: 'f-timb', folio: 'A-0002', uuid_fiscal: 'uuid-abc', fecha: '2026-07-02T00:00:00Z', total: 200,
  status: 'timbrada' as const, cliente_nombre: 'Cliente B', cliente_rfc: 'CBB010101AAA', error_timbrado: null,
}

describe('Historial - acciones por estatus', () => {
  it('una factura pendiente muestra el error previo y el botón Reintentar timbrado', () => {
    render(<Historial facturas={[facturaPendiente]} />)
    expect(screen.getByText(/CSD no registrado/)).toBeInTheDocument()
    expect(screen.getByText('Reintentar timbrado')).toBeInTheDocument()
  })

  it('Reintentar timbrado llama a POST /api/facturas/:id/timbrar y refresca', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ factura: { status: 'timbrada' } }), { status: 200 }))
    render(<Historial facturas={[facturaPendiente]} />)

    fireEvent.click(screen.getByText('Reintentar timbrado'))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/facturas/f-pend/timbrar', expect.objectContaining({ method: 'POST' }))
  })

  it('una factura timbrada muestra enlaces de descarga habilitados', () => {
    render(<Historial facturas={[facturaTimbrada]} />)
    const xmlLink = screen.getByText('XML').closest('a')
    const pdfLink = screen.getByText('PDF').closest('a')
    expect(xmlLink).toHaveAttribute('href', '/api/facturas/f-timb/xml')
    expect(pdfLink).toHaveAttribute('href', '/api/facturas/f-timb/pdf')
  })

  it('Cancelar en una factura timbrada abre el modal de motivo y exige UUID de sustitución solo para motivo 01', async () => {
    render(<Historial facturas={[facturaTimbrada]} />)
    fireEvent.click(screen.getByText('Cancelar'))

    expect(screen.getByText('Cancelar factura timbrada')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('UUID de sustitución')).not.toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Motivo de cancelación'), { target: { value: '01' } })
    expect(screen.getByPlaceholderText('UUID de sustitución')).toBeInTheDocument()
  })

  it('confirma la cancelación con motivo 02 llamando a POST /api/facturas/:id/cancelar-timbrado', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }))
    render(<Historial facturas={[facturaTimbrada]} />)

    fireEvent.click(screen.getByText('Cancelar'))
    fireEvent.change(screen.getByLabelText('Motivo de cancelación'), { target: { value: '02' } })
    fireEvent.click(screen.getByText('Confirmar cancelación'))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(fetchMock).toHaveBeenCalledWith('/api/facturas/f-timb/cancelar-timbrado', expect.objectContaining({ method: 'POST' }))
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body).toEqual({ motivo: '02' })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/Historial.test.tsx`
Expected: FAIL ("Reintentar timbrado" / "Cancelar factura timbrada" text not found, `error_timbrado` prop not read)

- [ ] **Step 3: Update the page wrapper**

```typescript
// src/app/(app)/historial/page.tsx
import { createClient } from '@/lib/supabase/server'
import Historial from '@/components/Historial'

export default async function HistorialPage() {
  const supabase = await createClient()
  const { data: facturas } = await supabase
    .from('facturas')
    .select('id, folio, uuid_fiscal, fecha, total, status, cliente_id, error_timbrado')
    .order('fecha', { ascending: false })

  const clienteIds = [...new Set((facturas ?? []).map(f => f.cliente_id))]
  const { data: clientes } =
    clienteIds.length > 0
      ? await supabase.from('clientes').select('id, nombre, rfc').in('id', clienteIds)
      : { data: [] }

  const clientesById = new Map((clientes ?? []).map(c => [c.id, c]))

  const facturasConCliente = (facturas ?? []).map(f => ({
    id: f.id,
    folio: f.folio,
    uuid_fiscal: f.uuid_fiscal,
    fecha: f.fecha,
    total: f.total,
    status: f.status,
    error_timbrado: f.error_timbrado,
    cliente_nombre: clientesById.get(f.cliente_id)?.nombre ?? 'Cliente desconocido',
    cliente_rfc: clientesById.get(f.cliente_id)?.rfc ?? '—',
  }))

  return <Historial facturas={facturasConCliente} />
}
```

- [ ] **Step 4: Replace `src/components/Historial.tsx` entirely**

```typescript
'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, XCircle, RotateCw, Search, Filter, X } from 'lucide-react'
import StatusBadge from './StatusBadge'
import type { FacturaStatus } from '@/lib/supabase/database.types'

interface Factura {
  id: string
  folio: string
  uuid_fiscal: string | null
  fecha: string
  total: number
  status: FacturaStatus
  cliente_nombre: string
  cliente_rfc: string
  error_timbrado: string | null
}

const MOTIVOS = [
  { value: '01', label: '01 – Comprobante con errores, con relación' },
  { value: '02', label: '02 – Comprobante con errores, sin relación' },
  { value: '03', label: '03 – La operación no se llevó a cabo' },
  { value: '04', label: '04 – Operación nominativa en factura global' },
]

export default function Historial({ facturas }: { facturas: Factura[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FacturaStatus | 'all'>('all')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [cancelModalId, setCancelModalId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('02')
  const [uuidSustitucion, setUuidSustitucion] = useState('')

  const filtered = facturas.filter(f => {
    const matchSearch = f.cliente_nombre.toLowerCase().includes(search.toLowerCase()) ||
      f.folio.toLowerCase().includes(search.toLowerCase()) ||
      f.cliente_rfc.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || f.status === filterStatus
    return matchSearch && matchStatus
  })

  async function handleCancelarPendiente(id: string) {
    if (!confirm('¿Cancelar esta factura? Esta acción no se puede deshacer.')) return
    setBusyId(id)
    setError(null)

    const res = await fetch(`/api/facturas/${id}/cancelar`, { method: 'PATCH' })

    if (!res.ok) {
      try {
        const body = await res.json()
        setError(body.error ?? 'Error al cancelar la factura')
      } catch {
        setError('Error al cancelar la factura')
      }
      setBusyId(null)
      return
    }

    setBusyId(null)
    router.refresh()
  }

  async function handleReintentar(id: string) {
    setBusyId(id)
    setError(null)

    const res = await fetch(`/api/facturas/${id}/timbrar`, { method: 'POST' })

    if (!res.ok) {
      try {
        const body = await res.json()
        setError(body.error ?? 'Error al reintentar el timbrado')
      } catch {
        setError('Error al reintentar el timbrado')
      }
    }

    setBusyId(null)
    router.refresh()
  }

  function abrirModalCancelar(id: string) {
    setCancelModalId(id)
    setMotivo('02')
    setUuidSustitucion('')
    setError(null)
  }

  async function confirmarCancelacionTimbrada() {
    if (!cancelModalId) return
    setBusyId(cancelModalId)
    setError(null)

    const res = await fetch(`/api/facturas/${cancelModalId}/cancelar-timbrado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(motivo === '01' ? { motivo, uuidSustitucion } : { motivo }),
    })

    if (!res.ok) {
      try {
        const body = await res.json()
        setError(body.error ?? 'Error al cancelar la factura')
      } catch {
        setError('Error al cancelar la factura')
      }
      setBusyId(null)
      return
    }

    setBusyId(null)
    setCancelModalId(null)
    router.refresh()
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>Historial de facturas</h1>
        <p style={{ fontSize: 13.5, color: '#64748b', margin: '4px 0 0' }}>
          {facturas.length} comprobantes emitidos
        </p>
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 280px' }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por folio, cliente o RFC..."
            style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Filter size={14} color="#94a3b8" />
          {(['all', 'timbrada', 'pendiente', 'cancelada'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                border: `1px solid ${filterStatus === s ? '#4f46e5' : '#e2e8f0'}`,
                backgroundColor: filterStatus === s ? '#eef2ff' : '#fff',
                color: filterStatus === s ? '#4f46e5' : '#64748b',
                cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              }}
            >
              {s === 'all' ? 'Todas' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              {['Folio', 'UUID (folio fiscal)', 'Cliente', 'RFC', 'Fecha', 'Total', 'Estatus', 'Acciones'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '0 14px 10px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => (
              <tr key={f.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '11px 14px', fontWeight: 700, color: '#4f46e5', fontSize: 12 }}>{f.folio}</td>
                <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{f.uuid_fiscal ?? '—'}</td>
                <td style={{ padding: '11px 14px', fontWeight: 500, color: '#0f172a' }}>{f.cliente_nombre}</td>
                <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{f.cliente_rfc}</td>
                <td style={{ padding: '11px 14px', color: '#64748b' }}>{new Date(f.fecha).toLocaleDateString('es-MX')}</td>
                <td style={{ padding: '11px 14px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                  ${Number(f.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <StatusBadge status={f.status} />
                  {f.status === 'pendiente' && f.error_timbrado && (
                    <div style={{ fontSize: 10.5, color: '#dc2626', marginTop: 3, maxWidth: 160 }}>{f.error_timbrado}</div>
                  )}
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {f.status === 'pendiente' && (
                      <>
                        <ActionBtn
                          icon={<RotateCw size={13} />}
                          label={busyId === f.id ? 'Timbrando…' : 'Reintentar timbrado'}
                          onClick={() => handleReintentar(f.id)}
                          disabled={busyId === f.id}
                        />
                        <ActionBtn
                          icon={<XCircle size={13} />}
                          label={busyId === f.id ? 'Cancelando…' : 'Cancelar'}
                          danger
                          onClick={() => handleCancelarPendiente(f.id)}
                          disabled={busyId === f.id}
                        />
                      </>
                    )}
                    {f.status === 'timbrada' && (
                      <>
                        <a href={`/api/facturas/${f.id}/xml`} style={{ ...actionBtnStyle(false), textDecoration: 'none' }}>
                          <Download size={13} /> XML
                        </a>
                        <a href={`/api/facturas/${f.id}/pdf`} style={{ ...actionBtnStyle(false), textDecoration: 'none' }}>
                          <Download size={13} /> PDF
                        </a>
                        <ActionBtn icon={<XCircle size={13} />} label="Cancelar" danger onClick={() => abrirModalCancelar(f.id)} />
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            Sin resultados
          </div>
        )}
      </div>

      {cancelModalId && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 28, width: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Cancelar factura timbrada</h2>
              <button onClick={() => setCancelModalId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label htmlFor="motivo-cancelacion" style={labelStyle}>Motivo de cancelación</label>
                <select id="motivo-cancelacion" aria-label="Motivo de cancelación" value={motivo} onChange={e => setMotivo(e.target.value)} style={inputStyle}>
                  {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              {motivo === '01' && (
                <div>
                  <label style={labelStyle}>UUID de sustitución</label>
                  <input
                    value={uuidSustitucion}
                    onChange={e => setUuidSustitucion(e.target.value)}
                    placeholder="UUID de sustitución"
                    style={{ ...inputStyle, fontFamily: 'monospace' }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button onClick={() => setCancelModalId(null)} style={{ ...secondaryBtn, padding: '9px 18px' }}>Cerrar</button>
                <button
                  onClick={confirmarCancelacionTimbrada}
                  disabled={busyId === cancelModalId || (motivo === '01' && !uuidSustitucion)}
                  style={{ ...primaryBtn, padding: '9px 18px', opacity: (busyId === cancelModalId || (motivo === '01' && !uuidSustitucion)) ? 0.6 : 1 }}
                >
                  {busyId === cancelModalId ? 'Cancelando…' : 'Confirmar cancelación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ActionBtn({ icon, label, danger, onClick, disabled }: {
  icon: React.ReactNode; label: string; danger?: boolean; onClick?: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={actionBtnStyle(!!danger, disabled)}>
      {icon} {label}
    </button>
  )
}

function actionBtnStyle(danger: boolean, disabled?: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
    border: `1px solid ${danger ? '#fecaca' : '#e2e8f0'}`,
    backgroundColor: danger ? '#fff5f5' : '#f8fafc',
    color: danger ? '#dc2626' : '#475569',
    fontSize: 11.5, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif',
    whiteSpace: 'nowrap', opacity: disabled ? 0.6 : 1,
  }
}

const card: React.CSSProperties = { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }
const primaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: '#4f46e5', color: '#ffffff', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', transition: 'background-color 0.15s' }
const secondaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 16px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', backgroundColor: '#ffffff', color: '#475569', fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif' }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run src/components/Historial.test.tsx`
Expected: PASS (5 tests)

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/historial/page.tsx" src/components/Historial.tsx src/components/Historial.test.tsx
git commit -m "feat: add retry, real cancellation modal, and downloads to Historial"
```

---

### Task 14: Manual smoke test against the real Facturama sandbox

This task is a checklist, not automated code — it validates the parts that only the real Facturama sandbox can confirm (exact Multiemisor endpoint behavior for downloads/cancellation, whether Facturama accepts the alphanumeric folio format, real CSD acceptance).

**Files:** none (manual verification only).

- [ ] **Step 1: Obtain a Facturama sandbox test CSD**

Facturama's sandbox documentation provides downloadable test CSD files (a `.cer`/`.key` pair and password) tied to a test RFC, meant specifically for sandbox testing. Retrieve them from the Facturama sandbox portal/docs referenced in the design spec.

- [ ] **Step 2: Start the dev server**

Run: `pnpm dev`

- [ ] **Step 3: Register the test CSD**

Log in as a test empresa user, go to Configuración → Certificados, upload the test `.cer`/`.key` and enter the password. Confirm the badge flips to "Registrado".

If Facturama rejects the request, check whether the RFC in the test empresa's `rfc_emisor` matches the RFC the test CSD was issued for — Facturama validates that the CSD's RFC matches the one in the request path.

- [ ] **Step 4: Create and stamp a factura**

Go to Nueva Factura, pick a cliente, add at least one concepto from the catálogo, click "Timbrar factura". Confirm the result shows `status: timbrada` with a real-looking UUID (36 chars, hyphenated).

If Facturama responds with a Folio-format validation error, adjust `buildCfdiPayload` in `src/lib/facturama/client.ts` to split the folio into a `Serie`/numeric `Folio` pair instead of sending the full `"A-0007"` string, and re-run this step.

- [ ] **Step 5: Download XML and PDF**

From the success screen or Historial, click XML and PDF. Confirm both downloads succeed and contain plausible CFDI content (the XML should be well-formed and contain the stamped UUID; the PDF should open).

If either 404s or 502s, check the `/api-lite/cfdi/xml|pdf/issued/{id}` path assumption in `src/lib/facturama/client.ts` against the response from Step 4 (Facturama's response may include a direct download URL you should use instead).

- [ ] **Step 6: Cancel the factura**

From Historial, click Cancelar on the timbrada factura, pick motivo 02, confirm. Verify status flips to `cancelada` and Facturama's dashboard (if accessible) shows the CFDI as cancelled.

If the cancel call fails with a parameter error, check whether `motive`/`uuidReplacement` need to be sent as query params (current assumption) vs. path segments, and adjust `cancelarCfdi` in `src/lib/facturama/client.ts` accordingly.

- [ ] **Step 7: Record any endpoint corrections made**

If Steps 4–6 required adjusting `src/lib/facturama/client.ts`, commit those fixes separately with a message describing what the sandbox actually required, e.g.:

```bash
git add src/lib/facturama/client.ts
git commit -m "fix: correct Facturama Multiemisor folio/cancel param shape per live sandbox behavior"
```

---

## Self-Review

**Spec coverage:** Every section of `docs/superpowers/specs/2026-07-07-timbrado-cfdi-design.md` maps to a task — data model (Task 1), CSD encryption (Task 2), Facturama client (Tasks 3–4), CSD register/resync/UI (Tasks 5–7), timbrado creation/retry (Tasks 8–9), downloads (Task 10), real cancellation (Task 11), NuevaFactura/Historial UI (Tasks 12–13), and the explicit manual sandbox acceptance criterion (Task 14).

**Placeholder scan:** No "TBD"/"TODO" remain; the one open item (exact `/api-lite` download/cancel path shape) is explicitly resolved by Task 14's steps, which name the exact file and fallback to try, not a vague "handle it later."

**Type consistency:** `FacturamaError`, `MotivoCancelacion`, `CrearCfdiInput`/`CrearCfdiResult`, `RegistrarCsdInput`, and `IntentarTimbradoResult`/`CancelarTimbradoResult` shapes are defined once (Tasks 2–4, 5, 8, 11) and reused with the same names and fields by every later task that consumes them (8, 9, 10, 11, 12, 13) — checked against each task's "Consumes" line above.

---

Plan complete and saved to `docs/superpowers/plans/2026-07-07-timbrado-cfdi-plan.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints.

Which approach?
