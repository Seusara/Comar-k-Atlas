import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { cancelarCfdi, FacturamaError, type MotivoCancelacion } from '@/lib/facturama/client'

export type { MotivoCancelacion }
export type CancelarTimbradoResult = { ok: true } | { error: string }

export async function cancelarTimbrado(
  supabase: SupabaseClient<Database>,
  facturaId: string,
  motivo: MotivoCancelacion,
  uuidSustitucion?: string,
): Promise<CancelarTimbradoResult> {
  const { data: factura, error: facturaError } = await supabase
    .from('facturas')
    .select('status, facturama_id')
    .eq('id', facturaId)
    .maybeSingle()

  if (facturaError || !factura) {
    return { error: 'La factura no existe' }
  }

  if (factura.status !== 'timbrada' || !factura.facturama_id) {
    return { error: 'La factura no está timbrada' }
  }

  if (motivo === '01' && !uuidSustitucion) {
    return { error: 'El motivo 01 requiere un UUID de sustitución' }
  }

  try {
    await cancelarCfdi(factura.facturama_id, motivo, uuidSustitucion)
  } catch (err) {
    return { error: err instanceof FacturamaError ? err.message : 'Error al cancelar en Facturama' }
  }

  const { error: updateError } = await supabase.from('facturas').update({ status: 'cancelada' }).eq('id', facturaId)

  if (updateError) {
    return { error: `Se canceló en Facturama pero no se pudo actualizar el estatus: ${updateError.message}` }
  }

  return { ok: true }
}
