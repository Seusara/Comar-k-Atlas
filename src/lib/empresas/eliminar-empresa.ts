import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export type EliminarEmpresaResult = { success: true } | { error: string }

export async function eliminarEmpresa(admin: SupabaseClient<Database>, empresaId: string): Promise<EliminarEmpresaResult> {
  const { data: link, error: linkError } = await admin
    .from('usuarios_empresa')
    .select('user_id')
    .eq('empresa_id', empresaId)
    .maybeSingle()

  if (linkError) {
    return { error: `No se pudo buscar el usuario de la empresa: ${linkError.message}` }
  }

  if (link) {
    const { error: deleteUserError } = await admin.auth.admin.deleteUser(link.user_id)
    if (deleteUserError) {
      return { error: `No se pudo eliminar el usuario: ${deleteUserError.message}` }
    }
  }

  const { error: empresaError } = await admin.from('empresas').delete().eq('id', empresaId)
  if (empresaError) {
    return { error: `No se pudo eliminar la empresa: ${empresaError.message}` }
  }

  return { success: true }
}
