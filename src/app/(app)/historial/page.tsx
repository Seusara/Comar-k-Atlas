import { createClient } from '@/lib/supabase/server'
import Historial from '@/components/Historial'

export default async function HistorialPage() {
  const supabase = await createClient()
  const { data: facturas } = await supabase
    .from('facturas')
    .select('id, folio, uuid_fiscal, fecha, total, status, cliente_id')
    .order('fecha', { ascending: false })

  const clienteIds = [...new Set((facturas ?? []).map(f => f.cliente_id))]
  const { data: clientes } =
    clienteIds.length > 0
      ? await supabase.from('clientes').select('id, nombre, rfc').in('id', clienteIds)
      : { data: [] }

  const clientesById = new Map((clientes ?? []).map(c => [c.id, c]))

  const facturasConCliente = (facturas ?? []).map(f => ({
    id: f.id,
    folio: f.folio,
    uuid_fiscal: f.uuid_fiscal,
    fecha: f.fecha,
    total: f.total,
    status: f.status,
    cliente_nombre: clientesById.get(f.cliente_id)?.nombre ?? 'Cliente desconocido',
    cliente_rfc: clientesById.get(f.cliente_id)?.rfc ?? '—',
  }))

  return <Historial facturas={facturasConCliente} />
}
