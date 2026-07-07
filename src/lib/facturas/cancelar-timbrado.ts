import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { cancelarCfdi, FacturamaError, type MotivoCancelacion } from '@/lib/facturama/client'

export type { MotivoCancelacion }
export type CancelarTimbradoResult = { ok: true } | { error: string }

const MENSAJE_RECONCILIACION_PENDIENTE =
  'La cancelación se confirmó en Facturama pero no se pudo actualizar el registro local. Verifica manualmente antes de reintentar.'

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
    // Facturama ya canceló el CFDI de forma irreversible; si no logramos reflejarlo
    // localmente dejamos un rastro explícito en error_timbrado para que un humano
    // verifique manualmente antes de reintentar (esto no bloquea por sí solo un
    // reintento automático — el status sigue en 'timbrada' hasta que se corrija).
    try {
      await supabase.from('facturas').update({ error_timbrado: MENSAJE_RECONCILIACION_PENDIENTE }).eq('id', facturaId)
    } catch {
      // best-effort: si esto también falla, el error original ya se retorna abajo
    }

    return { error: `Se canceló en Facturama pero no se pudo actualizar el estatus: ${updateError.message}` }
  }

  return { ok: true }
}
