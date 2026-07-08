import { createClient } from '@/lib/supabase/server'
import Dashboard from '@/components/Dashboard'
import { computeResumen } from '@/lib/dashboard/resumen'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: empresaRow } = user
    ? await supabase.from('usuarios_empresa').select('empresa_id').eq('user_id', user.id).maybeSingle()
    : { data: null }

  const { data: empresa } = empresaRow
    ? await supabase.from('empresas').select('nombre').eq('id', empresaRow.empresa_id).maybeSingle()
    : { data: null }

  const { data: facturas } = await supabase
    .from('facturas')
    .select('id, folio, fecha, total, status, cliente_id')
    .order('fecha', { ascending: false })

  const clienteIds = [...new Set((facturas ?? []).map(f => f.cliente_id))]
  const { data: clientes } =
    clienteIds.length > 0
      ? await supabase.from('clientes').select('id, nombre, rfc').in('id', clienteIds)
      : { data: [] }

  const clientesById = new Map((clientes ?? []).map(c => [c.id, c]))

  const now = new Date()
  const resumen = computeResumen((facturas ?? []).map(f => ({ fecha: f.fecha, total: f.total, status: f.status })), now)

  const facturasRecientes = (facturas ?? []).slice(0, 6).map(f => ({
    folio: f.folio,
    cliente: clientesById.get(f.cliente_id)?.nombre ?? 'Cliente desconocido',
    rfc: clientesById.get(f.cliente_id)?.rfc ?? '—',
    fecha: f.fecha,
    total: f.total,
    status: f.status,
  }))

  return (
    <Dashboard
      empresaNombre={empresa?.nombre ?? ''}
      periodo={`${MESES[now.getMonth()]} ${now.getFullYear()}`}
      resumen={resumen}
      facturasRecientes={facturasRecientes}
    />
  )
}
