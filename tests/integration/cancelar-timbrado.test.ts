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
