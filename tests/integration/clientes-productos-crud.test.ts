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

const empresaAEmail = `crud-test-a-${suffix}@example.com`
const empresaBEmail = `crud-test-b-${suffix}@example.com`
const password = 'Test-password-123!'

let empresaAId: string
let empresaBId: string
let userAId: string
let userBId: string
let clienteBId: string
let productoBId: string

beforeAll(async () => {
  const { data: empresaA, error: empresaAError } = await admin
    .from('empresas')
    .insert({ nombre: `CRUD Test Empresa A ${suffix}`, rfc_emisor: 'CTA010101AAA', regimen_fiscal: '601', cp_emisor: '00000' })
    .select('id')
    .single()
  if (empresaAError) throw empresaAError
  empresaAId = empresaA.id

  const { data: empresaB, error: empresaBError } = await admin
    .from('empresas')
    .insert({ nombre: `CRUD Test Empresa B ${suffix}`, rfc_emisor: 'CTB010101AAA', regimen_fiscal: '601', cp_emisor: '00000' })
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
    .insert({ empresa_id: empresaBId, nombre: 'Cliente de Empresa B', rfc: 'CDB010101AAA', regimen_fiscal: '601', codigo_postal: '00000', uso_cfdi: 'G03' })
    .select('id')
    .single()
  if (clienteBError) throw clienteBError
  clienteBId = clienteB.id

  const { data: productoB, error: productoBError } = await admin
    .from('productos')
    .insert({ empresa_id: empresaBId, clave_sat: '81161500', clave_unidad: 'E48', nombre: 'Producto de Empresa B', precio: 100, iva: 16 })
    .select('id')
    .single()
  if (productoBError) throw productoBError
  productoBId = productoB.id
})

afterAll(async () => {
  await admin.from('clientes').delete().in('empresa_id', [empresaAId, empresaBId])
  await admin.from('productos').delete().in('empresa_id', [empresaAId, empresaBId])
  await admin.auth.admin.deleteUser(userAId)
  await admin.auth.admin.deleteUser(userBId)
  await admin.from('usuarios_empresa').delete().in('empresa_id', [empresaAId, empresaBId])
  await admin.from('empresas').delete().in('id', [empresaAId, empresaBId])
})

describe('aislamiento RLS de clientes y productos entre empresas', () => {
  it('empresa A no puede leer, actualizar ni eliminar el cliente de empresa B', async () => {
    const anon = createSupabaseClient<Database>(url, anonKey)
    await anon.auth.signInWithPassword({ email: empresaAEmail, password })

    const { data: readResult } = await anon.from('clientes').select('id').eq('id', clienteBId)
    expect(readResult).toEqual([])

    const { data: updateResult } = await anon.from('clientes').update({ nombre: 'Hackeado' }).eq('id', clienteBId).select('id')
    expect(updateResult).toEqual([])

    const { data: deleteResult } = await anon.from('clientes').delete().eq('id', clienteBId).select('id')
    expect(deleteResult).toEqual([])

    const { data: stillThere } = await admin.from('clientes').select('id, nombre').eq('id', clienteBId).single()
    expect(stillThere!.nombre).toBe('Cliente de Empresa B')
  })

  it('empresa A no puede leer, actualizar ni eliminar el producto de empresa B', async () => {
    const anon = createSupabaseClient<Database>(url, anonKey)
    await anon.auth.signInWithPassword({ email: empresaAEmail, password })

    const { data: readResult } = await anon.from('productos').select('id').eq('id', productoBId)
    expect(readResult).toEqual([])

    const { data: updateResult } = await anon.from('productos').update({ precio: 1 }).eq('id', productoBId).select('id')
    expect(updateResult).toEqual([])

    const { data: deleteResult } = await anon.from('productos').delete().eq('id', productoBId).select('id')
    expect(deleteResult).toEqual([])

    const { data: stillThere } = await admin.from('productos').select('id, precio').eq('id', productoBId).single()
    expect(stillThere!.precio).toBe(100)
  })

  it('empresa A puede crear, leer, actualizar y eliminar su propio cliente', async () => {
    const anon = createSupabaseClient<Database>(url, anonKey)
    await anon.auth.signInWithPassword({ email: empresaAEmail, password })

    const { data: created, error: createError } = await anon
      .from('clientes')
      .insert({ empresa_id: empresaAId, nombre: 'Cliente propio A', rfc: 'CPA010101AAA', regimen_fiscal: '601', codigo_postal: '00000', uso_cfdi: 'G03' })
      .select('id')
      .single()
    expect(createError).toBeNull()

    const { data: updated, error: updateError } = await anon
      .from('clientes')
      .update({ nombre: 'Cliente propio A editado' })
      .eq('id', created!.id)
      .select('nombre')
      .single()
    expect(updateError).toBeNull()
    expect(updated!.nombre).toBe('Cliente propio A editado')

    const { error: deleteError } = await anon.from('clientes').delete().eq('id', created!.id)
    expect(deleteError).toBeNull()

    const { data: gone } = await admin.from('clientes').select('id').eq('id', created!.id).maybeSingle()
    expect(gone).toBeNull()
  })
})
