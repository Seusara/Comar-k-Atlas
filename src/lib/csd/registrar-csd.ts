import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { registrarCsd as registrarCsdFacturama, FacturamaError } from '@/lib/facturama/client'
import { encryptCsd } from '@/lib/csd-crypto'

export interface RegistrarCsdInput {
  empresaId: string
  cerBuffer: Buffer
  keyBuffer: Buffer
  password: string
}

export type RegistrarCsdResult = { ok: true } | { error: string }

export async function registrarCsd(admin: SupabaseClient<Database>, input: RegistrarCsdInput): Promise<RegistrarCsdResult> {
  const { data: empresa, error: empresaError } = await admin
    .from('empresas')
    .select('rfc_emisor')
    .eq('id', input.empresaId)
    .single()

  if (empresaError || !empresa) {
    return { error: `No se pudo cargar la empresa: ${empresaError?.message ?? 'no encontrada'}` }
  }

  const certificateBase64 = input.cerBuffer.toString('base64')
  const privateKeyBase64 = input.keyBuffer.toString('base64')

  try {
    await registrarCsdFacturama(empresa.rfc_emisor, certificateBase64, privateKeyBase64, input.password)
  } catch (err) {
    return { error: err instanceof FacturamaError ? err.message : 'Error al registrar el CSD en Facturama' }
  }

  const encrypted = encryptCsd({ certificateBase64, privateKeyBase64, password: input.password })

  const { error: uploadError } = await admin.storage
    .from('csd-backups')
    .upload(`${input.empresaId}.enc`, encrypted, { contentType: 'application/octet-stream', upsert: true })

  if (uploadError) {
    return { error: `El CSD se registró en Facturama pero no se pudo guardar el respaldo: ${uploadError.message}` }
  }

  const { error: updateError } = await admin
    .from('empresas')
    .update({ csd_status: 'registrado', csd_actualizado_en: new Date().toISOString() })
    .eq('id', input.empresaId)

  if (updateError) {
    return { error: `El CSD se registró pero no se pudo actualizar el estatus: ${updateError.message}` }
  }

  return { ok: true }
}
