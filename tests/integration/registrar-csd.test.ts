// tests/integration/registrar-csd.test.ts
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarCsd } from '@/lib/csd/registrar-csd'
import * as facturamaClient from '@/lib/facturama/client'

if (!process.env.SUPABASE_SERVICE_ROLE_KEY || !process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY deben estar en .env.local para correr esta prueba.')
}

const admin = createAdminClient()
const suffix = Date.now()
let empresaId: string

beforeAll(async () => {
  const { data, error } = await admin
    .from('empresas')
    .insert({ nombre: `Registrar CSD Test ${suffix}`, rfc_emisor: `RCS${suffix % 100000}AAA`, regimen_fiscal: '601', cp_emisor: '00000' })
    .select('id')
    .single()
  if (error) throw error
  empresaId = data.id
})

afterAll(async () => {
  await admin.storage.from('csd-backups').remove([`${empresaId}.enc`])
  await admin.from('empresas').delete().eq('id', empresaId)
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('registrarCsd', () => {
  // Ordered deliberately: this test must run before the "success" test below,
  // since both share the same empresaId and the DB state is asserted against
  // the prior test's outcome (csd_status starts at 'sin_registrar').
  it('no guarda nada ni cambia csd_status si Facturama rechaza el CSD', async () => {
    vi.spyOn(facturamaClient, 'registrarCsd').mockRejectedValue(new facturamaClient.FacturamaError('Contraseña incorrecta'))

    const result = await registrarCsd(admin, {
      empresaId,
      cerBuffer: Buffer.from('fake-cer-bytes'),
      keyBuffer: Buffer.from('fake-key-bytes'),
      password: 'wrong',
    })

    expect(result).toEqual({ error: 'Contraseña incorrecta' })

    const { data: empresa } = await admin.from('empresas').select('csd_status').eq('id', empresaId).single()
    expect(empresa!.csd_status).toBe('sin_registrar')
  })

  it('registra el CSD en Facturama, guarda un respaldo cifrado y marca csd_status=registrado', async () => {
    vi.spyOn(facturamaClient, 'registrarCsd').mockResolvedValue(undefined)

    const result = await registrarCsd(admin, {
      empresaId,
      cerBuffer: Buffer.from('fake-cer-bytes'),
      keyBuffer: Buffer.from('fake-key-bytes'),
      password: 'pass123',
    })

    expect(result).toEqual({ ok: true })

    const { data: empresa } = await admin.from('empresas').select('csd_status, csd_actualizado_en').eq('id', empresaId).single()
    expect(empresa!.csd_status).toBe('registrado')
    expect(empresa!.csd_actualizado_en).not.toBeNull()

    const { data: file, error: downloadError } = await admin.storage.from('csd-backups').download(`${empresaId}.enc`)
    expect(downloadError).toBeNull()
    const blob = Buffer.from(await file!.arrayBuffer())
    expect(blob.toString('utf8')).not.toContain('fake-cer-bytes')
  })
})
