import { createClient } from '@/lib/supabase/server'
import Reportes from '@/components/Reportes'
import { computeReportes } from '@/lib/reportes/resumen'

const MESES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
]

export default async function ReportesPage() {
  const supabase = await createClient()

  const { data: facturas } = await supabase
    .from('facturas')
    .select('fecha, total, status')

  const now = new Date()
  const resumen = computeReportes((facturas ?? []).map(f => ({ fecha: f.fecha, total: f.total, status: f.status })), now)

  return <Reportes periodo={`${MESES[0]} – ${MESES[now.getMonth()]} ${now.getFullYear()}`} resumen={resumen} />
}
