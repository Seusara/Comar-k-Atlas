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
const password = 'Test-password-123!'
const userEmail = `cancelar-factura-${suffix}@example.com`

let empresaId: string
let userId: string
let clienteId: string
let facturaId: string

beforeAll(async () => {
  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .insert({ nombre: `Cancelar Test Empresa ${suffix}`, rfc_emisor: 'CAN010101AAA', regimen_fiscal: '601', cp_emisor: '00000' })
    .select('id')
    .single()
  if (empresaError) throw empresaError
  empresaId = empresa.id

  const { data: user, error: userError } = await admin.auth.admin.createUser({ email: userEmail, password, email_confirm: true })
  if (userError) throw userError
  userId = user.user.id

  const { error: linkError } = await admin.from('usuarios_empresa').insert({ user_id: userId, empresa_id: empresaId })
  if (linkError) throw linkError

  const { data: cliente, error: clienteError } = await admin
    .from('clientes')
    .insert({ empresa_id: empresaId, nombre: 'Cliente Cancelar', rfc: 'CLC010101AAA', regimen_fiscal: '601', codigo_postal: '00000', uso_cfdi: 'G03' })
    .select('id')
    .single()
  if (clienteError) throw clienteError
  clienteId = cliente.id

  const { data: factura, error: facturaError } = await admin
    .from('facturas')
    .insert({ empresa_id: empresaId, cliente_id: clienteId, folio: 'A-9001', subtotal: 100, iva_total: 16, total: 116, forma_pago: '01', metodo_pago: 'PUE' })
    .select('id')
    .single()
  if (facturaError) throw facturaError
  facturaId = factura.id
})

afterAll(async () => {
  await admin.from('facturas').delete().eq('id', facturaId)
  await admin.from('clientes').delete().eq('id', clienteId)
  await admin.auth.admin.deleteUser(userId)
  await admin.from('usuarios_empresa').delete().eq('empresa_id', empresaId)
  await admin.from('empresas').delete().eq('id', empresaId)
})

describe('cancelar factura', () => {
  it('cancela una factura pendiente', async () => {
    const anon = createSupabaseClient<Database>(url, anonKey)
    await anon.auth.signInWithPassword({ email: userEmail, password })

    const { data, error } = await anon
      .from('facturas')
      .update({ status: 'cancelada' })
      .eq('id', facturaId)
      .eq('status', 'pendiente')
      .select('status')
      .maybeSingle()

    expect(error).toBeNull()
    expect(data!.status).toBe('cancelada')
  })

  it('rechaza cancelar una factura que ya no está pendiente', async () => {
    const anon = createSupabaseClient<Database>(url, anonKey)
    await anon.auth.signInWithPassword({ email: userEmail, password })

    const { data, error } = await anon
      .from('facturas')
      .update({ status: 'cancelada' })
      .eq('id', facturaId)
      .eq('status', 'pendiente')
      .select('status')
      .maybeSingle()

    expect(error).toBeNull()
    expect(data).toBeNull()

    const { data: stillCancelada } = await admin.from('facturas').select('status').eq('id', facturaId).single()
    expect(stillCancelada!.status).toBe('cancelada')
  })
})
