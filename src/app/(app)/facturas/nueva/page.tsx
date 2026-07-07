import { createClient } from '@/lib/supabase/server'
import NuevaFactura from '@/components/NuevaFactura'

export default async function NuevaFacturaPage() {
  const supabase = await createClient()
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre, rfc, regimen_fiscal, uso_cfdi')
    .order('nombre', { ascending: true })

  return <NuevaFactura clientes={clientes ?? []} />
}
