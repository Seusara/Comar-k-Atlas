import { createClient } from '@/lib/supabase/server'
import Catalogo from '@/components/Catalogo'

export default async function CatalogoPage() {
  const supabase = await createClient()
  const { data: productos } = await supabase
    .from('productos')
    .select('id, clave_sat, clave_unidad, nombre, precio, iva, creado_en')
    .order('creado_en', { ascending: false })

  return <Catalogo productos={productos ?? []} />
}
