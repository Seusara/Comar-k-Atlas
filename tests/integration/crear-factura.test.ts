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
const empresaAEmail = `crear-factura-a-${suffix}@example.com`

let empresaAId: string
let empresaBId: string
let userAId: string
let userBId: string
let clienteAId: string
let clienteBId: string

beforeAll(async () => {
  const { data: empresaA, error: empresaAError } = await admin
    .from('empresas')
    .insert({ nombre: `Factura Test Empresa A ${suffix}`, rfc_emisor: 'FTA010101AAA', regimen_fiscal: '601', cp_emisor: '00000' })
    .select('id')
    .single()
  if (empresaAError) throw empresaAError
  empresaAId = empresaA.id

  const { data: empresaB, error: empresaBError } = await admin
    .from('empresas')
    .insert({ nombre: `Factura Test Empresa B ${suffix}`, rfc_emisor: 'FTB010101AAA', regimen_fiscal: '601', cp_emisor: '00000' })
    .select('id')
    .single()
  if (empresaBError) throw empresaBError
  empresaBId = empresaB.id

  const { data: userA, error: userAError } = await admin.auth.admin.createUser({ email: empresaAEmail, password, email_confirm: true })
  if (userAError) throw userAError
  userAId = userA.user.id

  const { data: userB, error: userBError } = await admin.auth.admin.createUser({ email: `crear-factura-b-${suffix}@example.com`, password, email_confirm: true })
  if (userBError) throw userBError
  userBId = userB.user.id

  const { error: linkAError } = await admin.from('usuarios_empresa').insert({ user_id: userAId, empresa_id: empresaAId })
  if (linkAError) throw linkAError

  const { error: linkBError } = await admin.from('usuarios_empresa').insert({ user_id: userBId, empresa_id: empresaBId })
  if (linkBError) throw linkBError

  const { data: clienteA, error: clienteAError } = await admin
    .from('clientes')
    .insert({ empresa_id: empresaAId, nombre: 'Cliente A', rfc: 'CLA010101AAA', regimen_fiscal: '601', codigo_postal: '00000', uso_cfdi: 'G03' })
    .select('id')
    .single()
  if (clienteAError) throw clienteAError
  clienteAId = clienteA.id

  const { data: clienteB, error: clienteBError } = await admin
    .from('clientes')
    .insert({ empresa_id: empresaBId, nombre: 'Cliente B', rfc: 'CLB010101AAA', regimen_fiscal: '601', codigo_postal: '00000', uso_cfdi: 'G03' })
    .select('id')
    .single()
  if (clienteBError) throw clienteBError
  clienteBId = clienteB.id
})

afterAll(async () => {
  await admin.from('conceptos').delete().in('factura_id',
    (await admin.from('facturas').select('id').in('empresa_id', [empresaAId, empresaBId])).data?.map(f => f.id) ?? [],
  )
  await admin.from('facturas').delete().in('empresa_id', [empresaAId, empresaBId])
  await admin.from('folios_empresa').delete().in('empresa_id', [empresaAId, empresaBId])
  await admin.from('clientes').delete().in('empresa_id', [empresaAId, empresaBId])
  await admin.auth.admin.deleteUser(userAId)
  await admin.auth.admin.deleteUser(userBId)
  await admin.from('usuarios_empresa').delete().in('empresa_id', [empresaAId, empresaBId])
  await admin.from('empresas').delete().in('id', [empresaAId, empresaBId])
})

describe('crear_factura', () => {
  it('crea una factura con folio, totales y conceptos calculados en servidor', async () => {
    const anon = createSupabaseClient<Database>(url, anonKey)
    await anon.auth.signInWithPassword({ email: empresaAEmail, password })

    const { data, error } = await anon.rpc('crear_factura', {
      p_cliente_id: clienteAId,
      p_conceptos: [{ clave_sat: '81161500', descripcion: 'Servicio de prueba', cantidad: 2, precio_unitario: 100, iva: 16 }],
    })

    expect(error).toBeNull()
    expect(data!.folio).toMatch(/^A-\d{4}$/)
    expect(Number(data!.subtotal)).toBe(200)
    expect(Number(data!.iva_total)).toBe(32)
    expect(Number(data!.total)).toBe(232)
    expect(data!.status).toBe('pendiente')

    const { data: conceptosRows } = await admin.from('conceptos').select('importe').eq('factura_id', data!.id)
    expect(conceptosRows).toHaveLength(1)
    expect(Number(conceptosRows![0].importe)).toBe(200)
  })

  it('rechaza un cliente_id que pertenece a otra empresa', async () => {
    const anon = createSupabaseClient<Database>(url, anonKey)
    await anon.auth.signInWithPassword({ email: empresaAEmail, password })

    const { error } = await anon.rpc('crear_factura', {
      p_cliente_id: clienteBId,
      p_conceptos: [{ clave_sat: '81161500', descripcion: 'Intento cruzado', cantidad: 1, precio_unitario: 100, iva: 16 }],
    })

    expect(error).not.toBeNull()

    const { data: leaked } = await admin.from('facturas').select('id').eq('cliente_id', clienteBId).eq('empresa_id', empresaAId)
    expect(leaked).toEqual([])
  })

  it('no crea la factura ni consume folio si un concepto es inválido (atomicidad)', async () => {
    const anon = createSupabaseClient<Database>(url, anonKey)
    await anon.auth.signInWithPassword({ email: empresaAEmail, password })

    const { data: before } = await admin.from('folios_empresa').select('siguiente_folio').eq('empresa_id', empresaAId).maybeSingle()
    const folioAntes = before?.siguiente_folio ?? 1

    const { error } = await anon.rpc('crear_factura', {
      p_cliente_id: clienteAId,
      // p_conceptos is typed as Json, which permits this malformed shape at compile
      // time — the point of this test is that Postgres itself rejects it at runtime
      // (the numeric cast inside crear_factura throws) and rolls back atomically.
      p_conceptos: [{ clave_sat: '81161500', descripcion: 'Concepto inválido', cantidad: 'no-es-un-numero', precio_unitario: 100, iva: 16 }],
    })

    expect(error).not.toBeNull()

    const { data: after } = await admin.from('folios_empresa').select('siguiente_folio').eq('empresa_id', empresaAId).maybeSingle()
    expect(after?.siguiente_folio ?? 1).toBe(folioAntes)
  })

  it('genera folios consecutivos y sin duplicados ante creación concurrente', async () => {
    const anon = createSupabaseClient<Database>(url, anonKey)
    await anon.auth.signInWithPassword({ email: empresaAEmail, password })

    const conceptos = [{ clave_sat: '81161500', descripcion: 'Concurrencia', cantidad: 1, precio_unitario: 50, iva: 16 }]

    const [r1, r2] = await Promise.all([
      anon.rpc('crear_factura', { p_cliente_id: clienteAId, p_conceptos: conceptos }),
      anon.rpc('crear_factura', { p_cliente_id: clienteAId, p_conceptos: conceptos }),
    ])

    expect(r1.error).toBeNull()
    expect(r2.error).toBeNull()
    expect(r1.data!.folio).not.toBe(r2.data!.folio)

    const nums = [r1.data!.folio, r2.data!.folio].map(f => parseInt(f.split('-')[1], 10)).sort((a, b) => a - b)
    expect(nums[1] - nums[0]).toBe(1)
  })
})
