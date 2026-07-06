import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export interface CrearEmpresaInput {
  nombre: string
  rfcEmisor: string
  regimenFiscal: string
  cpEmisor: string
  email: string
  password: string
}

export type CrearEmpresaResult = { empresaId: string } | { error: string }

export async function crearEmpresa(admin: SupabaseClient<Database>, input: CrearEmpresaInput): Promise<CrearEmpresaResult> {
  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .insert({
      nombre: input.nombre,
      rfc_emisor: input.rfcEmisor,
      regimen_fiscal: input.regimenFiscal,
      cp_emisor: input.cpEmisor,
    })
    .select('id')
    .single()

  if (empresaError || !empresa) {
    return { error: `No se pudo crear la empresa: ${empresaError?.message ?? 'error desconocido'}` }
  }

  const { data: userData, error: userError } = await admin.auth.admin.createUser({
    email: input.email,
    password: input.password,
    email_confirm: true,
  })

  if (userError || !userData.user) {
    const { error: rollbackError } = await admin.from('empresas').delete().eq('id', empresa.id)
    if (rollbackError) {
      return {
        error: `No se pudo crear el usuario: ${userError?.message ?? 'error desconocido'}. Además, no se pudo revertir la empresa creada (id ${empresa.id}): ${rollbackError.message}`,
      }
    }
    return { error: `No se pudo crear el usuario: ${userError?.message ?? 'error desconocido'}` }
  }

  const { error: linkError } = await admin
    .from('usuarios_empresa')
    .insert({ user_id: userData.user.id, empresa_id: empresa.id })

  if (linkError) {
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(userData.user.id)
    const { error: deleteEmpresaError } = await admin.from('empresas').delete().eq('id', empresa.id)

    if (deleteUserError || deleteEmpresaError) {
      const rollbackIssues = [
        deleteUserError && `no se pudo eliminar el usuario (id ${userData.user.id}): ${deleteUserError.message}`,
        deleteEmpresaError && `no se pudo revertir la empresa (id ${empresa.id}): ${deleteEmpresaError.message}`,
      ].filter(Boolean).join('; ')
      return { error: `No se pudo vincular el usuario a la empresa: ${linkError.message}. Además, ${rollbackIssues}` }
    }

    return { error: `No se pudo vincular el usuario a la empresa: ${linkError.message}` }
  }

  return { empresaId: empresa.id }
}
