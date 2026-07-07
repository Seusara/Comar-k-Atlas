import { createClient } from '@/lib/supabase/server'
import Clientes from '@/components/Clientes'

export default async function ClientesPage() {
  const supabase = await createClient()
  const { data: clientes } = await supabase
    .from('clientes')
    .select('id, nombre, rfc, regimen_fiscal, codigo_postal, uso_cfdi, creado_en')
    .order('creado_en', { ascending: false })

  return <Clientes clientes={clientes ?? []} />
}
