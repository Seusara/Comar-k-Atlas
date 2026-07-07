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
