import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { registrarCsd as registrarCsdFacturama, FacturamaError } from '@/lib/facturama/client'
import { decryptCsd } from '@/lib/csd-crypto'

export type ResincronizarCsdResult = { ok: true } | { error: string }

export async function resincronizarCsd(admin: SupabaseClient<Database>, empresaId: string): Promise<ResincronizarCsdResult> {
  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .select('rfc_emisor, csd_status')
    .eq('id', empresaId)
    .single()

  if (empresaError || !empresa) {
    return { error: `No se pudo cargar la empresa: ${empresaError?.message ?? 'no encontrada'}` }
  }

  if (empresa.csd_status !== 'registrado') {
    return { error: 'No hay un CSD respaldado para esta empresa' }
  }

  const { data: file, error: downloadError } = await admin.storage.from('csd-backups').download(`${empresaId}.enc`)
  if (downloadError || !file) {
    return { error: `No se pudo leer el respaldo del CSD: ${downloadError?.message ?? 'no encontrado'}` }
  }

  const blob = Buffer.from(await file.arrayBuffer())
  const { certificateBase64, privateKeyBase64, password } = decryptCsd(blob)

  try {
    await registrarCsdFacturama(empresa.rfc_emisor, certificateBase64, privateKeyBase64, password)
  } catch (err) {
    return { error: err instanceof FacturamaError ? err.message : 'Error al reenviar el CSD a Facturama' }
  }

  const { error: updateError } = await admin
    .from('empresas')
    .update({ csd_actualizado_en: new Date().toISOString() })
    .eq('id', empresaId)

  if (updateError) {
    return { error: `El CSD se reenvió pero no se pudo actualizar la fecha: ${updateError.message}` }
  }

  return { ok: true }
}
