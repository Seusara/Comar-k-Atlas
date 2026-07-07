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
  // intentarTimbrado makes several sequential round trips (factura, empresa,
  // cliente, conceptos selects, then an update) on top of the sign-in + RPC
  // call already inside crearFacturaPendiente. Against the real Supabase
  // cloud project this routinely exceeds vitest's 5000ms default, so each
  // test gets an explicit longer timeout.
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
  }, 20000)

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
  }, 20000)

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
  }, 20000)

  it('rechaza timbrar de nuevo si facturama_id ya existe aunque status siga pendiente', async () => {
    const spy = vi.spyOn(facturamaClient, 'crearCfdi')
    const { factura, anon } = await crearFacturaPendiente()
    await admin.from('facturas').update({ facturama_id: 'fact-ya-existente' }).eq('id', factura.id)

    const result = await intentarTimbrado(anon, factura.id)

    expect(result).toEqual({
      ok: false,
      error:
        'Esta factura ya se timbró en Facturama (facturama_id existente) pero no se reflejó localmente. Verifica manualmente antes de reintentar.',
    })
    expect(spy).not.toHaveBeenCalled()

    const { data: reloaded } = await admin.from('facturas').select('status, facturama_id').eq('id', factura.id).single()
    expect(reloaded!.status).toBe('pendiente')
    expect(reloaded!.facturama_id).toBe('fact-ya-existente')
  }, 20000)
})
