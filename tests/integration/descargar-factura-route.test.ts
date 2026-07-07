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
