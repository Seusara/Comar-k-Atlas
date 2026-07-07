import { afterAll, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createAdminClient } from '@/lib/supabase/admin'

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
    userId = user!.user!.id

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
      .insert({ empresa_id: empresaId, cliente_id: clienteId, folio: 'SMOKE-001', subtotal: 100, iva_total: 16, total: 116, forma_pago: '01', metodo_pago: 'PUE' })
      .select('id')
      .single()
    expect(facturaError).toBeNull()
    facturaId = factura!.id

    const { error: conceptoError } = await admin
      .from('conceptos')
      .insert({ factura_id: facturaId, clave_sat: '81161500', clave_unidad: 'H87', descripcion: 'Concepto de prueba', cantidad: 1, precio_unitario: 100, iva: 16, importe: 100 })
    expect(conceptoError).toBeNull()
  })
})
