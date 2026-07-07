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
