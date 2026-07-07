import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { crearCfdi, FacturamaError } from '@/lib/facturama/client'

export type IntentarTimbradoResult = { ok: true } | { ok: false; error: string }

export async function intentarTimbrado(supabase: SupabaseClient<Database>, facturaId: string): Promise<IntentarTimbradoResult> {
  const { data: factura, error: facturaError } = await supabase
    .from('facturas')
    .select('id, empresa_id, cliente_id, folio, forma_pago, metodo_pago, status')
    .eq('id', facturaId)
    .single()

  if (facturaError || !factura) {
    return { ok: false, error: `No se pudo cargar la factura: ${facturaError?.message ?? 'no encontrada'}` }
  }

  if (factura.status !== 'pendiente') {
    return { ok: false, error: 'La factura no está pendiente de timbrado' }
  }

  const { data: empresa, error: empresaError } = await supabase
    .from('empresas')
    .select('rfc_emisor, nombre, regimen_fiscal, cp_emisor, csd_status')
    .eq('id', factura.empresa_id)
    .single()

  if (empresaError || !empresa) {
    return { ok: false, error: `No se pudo cargar la empresa: ${empresaError?.message ?? 'no encontrada'}` }
  }

  if (empresa.csd_status !== 'registrado') {
    const mensaje = 'Esta empresa no tiene un CSD registrado. Configúralo en Configuración → Certificados antes de timbrar.'
    await supabase.from('facturas').update({ error_timbrado: mensaje }).eq('id', facturaId)
    return { ok: false, error: mensaje }
  }

  const { data: cliente, error: clienteError } = await supabase
    .from('clientes')
    .select('rfc, nombre, uso_cfdi, regimen_fiscal, codigo_postal')
    .eq('id', factura.cliente_id)
    .single()

  if (clienteError || !cliente) {
    return { ok: false, error: `No se pudo cargar el cliente: ${clienteError?.message ?? 'no encontrado'}` }
  }

  const { data: conceptos, error: conceptosError } = await supabase
    .from('conceptos')
    .select('clave_sat, clave_unidad, descripcion, cantidad, precio_unitario, iva')
    .eq('factura_id', facturaId)

  if (conceptosError || !conceptos || conceptos.length === 0) {
    return { ok: false, error: `No se pudieron cargar los conceptos: ${conceptosError?.message ?? 'sin conceptos'}` }
  }

  try {
    const { facturamaId, uuidFiscal } = await crearCfdi({
      emisor: { rfc: empresa.rfc_emisor, nombre: empresa.nombre, regimenFiscal: empresa.regimen_fiscal },
      receptor: {
        rfc: cliente.rfc, nombre: cliente.nombre, usoCfdi: cliente.uso_cfdi,
        regimenFiscal: cliente.regimen_fiscal, codigoPostal: cliente.codigo_postal,
      },
      conceptos: conceptos.map(c => ({
        claveSat: c.clave_sat,
        claveUnidad: c.clave_unidad,
        descripcion: c.descripcion,
        cantidad: Number(c.cantidad),
        precioUnitario: Number(c.precio_unitario),
        iva: Number(c.iva),
      })),
      formaPago: factura.forma_pago,
      metodoPago: factura.metodo_pago,
      lugarExpedicion: empresa.cp_emisor,
      folio: factura.folio,
    })

    const { error: updateError } = await supabase
      .from('facturas')
      .update({
        status: 'timbrada',
        facturama_id: facturamaId,
        uuid_fiscal: uuidFiscal,
        xml_url: `/api/facturas/${facturaId}/xml`,
        pdf_url: `/api/facturas/${facturaId}/pdf`,
        error_timbrado: null,
      })
      .eq('id', facturaId)

    if (updateError) {
      return { ok: false, error: `Se timbró en Facturama pero no se pudo guardar el resultado: ${updateError.message}` }
    }

    return { ok: true }
  } catch (err) {
    const message = err instanceof FacturamaError ? err.message : 'Error desconocido al timbrar'
    await supabase.from('facturas').update({ error_timbrado: message }).eq('id', facturaId)
    return { ok: false, error: message }
  }
}
