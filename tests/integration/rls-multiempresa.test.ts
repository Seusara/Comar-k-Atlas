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
