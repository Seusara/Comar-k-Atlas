import { describe, expect, it, vi } from 'vitest'
vi.mock('server-only', () => ({}))
import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createAdminClient } from '@/lib/supabase/admin'
import { crearEmpresa } from '@/lib/empresas/crear-empresa'
import { eliminarEmpresa } from '@/lib/empresas/eliminar-empresa'
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

describe('crearEmpresa', () => {
  it('crea empresa + usuario + vínculo, y el usuario puede iniciar sesión como usuario de empresa (no super-admin)', async () => {
    const email = `gestion-empresa-${suffix}@example.com`
    const password = 'Test-password-123!'

    const result = await crearEmpresa(admin, {
      nombre: `Empresa Gestión Test ${suffix}`,
      rfcEmisor: 'GET010101AAA',
      regimenFiscal: '601',
      cpEmisor: '00000',
      email,
      password,
    })

    expect('error' in result).toBe(false)
    if ('error' in result) throw new Error(result.error)

    try {
      const anon = createSupabaseClient<Database>(url, anonKey)
      const { data: signIn, error: signInError } = await anon.auth.signInWithPassword({ email, password })
      expect(signInError).toBeNull()
      expect(signIn.user).not.toBeNull()

      const { data: link } = await admin
        .from('usuarios_empresa')
        .select('empresa_id')
        .eq('user_id', signIn.user!.id)
        .maybeSingle()
      expect(link?.empresa_id).toBe(result.empresaId)

      const { data: superAdminRow } = await admin
        .from('super_admins')
        .select('user_id')
        .eq('user_id', signIn.user!.id)
        .maybeSingle()
      expect(superAdminRow).toBeNull()
    } finally {
      await eliminarEmpresa(admin, result.empresaId)
    }
  })

  it('hace rollback de la empresa si falla la creación del usuario (email duplicado)', async () => {
    const email = `gestion-empresa-dup-${suffix}@example.com`
    const password = 'Test-password-123!'

    const { error: preCreateError } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
    expect(preCreateError).toBeNull()

    try {
      const nombre = `Empresa Rollback Test ${suffix}`
      const result = await crearEmpresa(admin, {
        nombre,
        rfcEmisor: 'ROL010101AAA',
        regimenFiscal: '601',
        cpEmisor: '00000',
        email,
        password,
      })

      expect('error' in result).toBe(true)

      const { data: orphanedEmpresa } = await admin.from('empresas').select('id').eq('nombre', nombre).maybeSingle()
      expect(orphanedEmpresa).toBeNull()
    } finally {
      const { data: usersList } = await admin.auth.admin.listUsers()
      const preExisting = usersList.users.find(u => u.email === email)
      if (preExisting) await admin.auth.admin.deleteUser(preExisting.id)
    }
  })
})

describe('eliminarEmpresa', () => {
  it('elimina el usuario de Auth y no deja filas huérfanas en las tablas dependientes', async () => {
    const email = `gestion-empresa-delete-${suffix}@example.com`
    const password = 'Test-password-123!'

    const result = await crearEmpresa(admin, {
      nombre: `Empresa Eliminar Test ${suffix}`,
      rfcEmisor: 'ELI010101AAA',
      regimenFiscal: '601',
      cpEmisor: '00000',
      email,
      password,
    })
    if ('error' in result) throw new Error(result.error)
    const empresaId = result.empresaId

    await admin
      .from('clientes')
      .insert({ empresa_id: empresaId, nombre: 'Cliente de prueba', rfc: 'CDT010101AAA', regimen_fiscal: '601', codigo_postal: '00000', uso_cfdi: 'G03' })

    const deleteResult = await eliminarEmpresa(admin, empresaId)
    expect(deleteResult).toEqual({ success: true })

    const anon = createSupabaseClient<Database>(url, anonKey)
    const { error: signInError } = await anon.auth.signInWithPassword({ email, password })
    expect(signInError).not.toBeNull()

    const { data: remainingClientes } = await admin.from('clientes').select('id').eq('empresa_id', empresaId)
    expect(remainingClientes).toEqual([])

    const { data: remainingLink } = await admin.from('usuarios_empresa').select('user_id').eq('empresa_id', empresaId)
    expect(remainingLink).toEqual([])

    const { data: remainingEmpresa } = await admin.from('empresas').select('id').eq('id', empresaId).maybeSingle()
    expect(remainingEmpresa).toBeNull()
  })
})
