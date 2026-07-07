import { createClient } from '@/lib/supabase/server'
import Configuracion from '@/components/Configuracion'

export default async function ConfiguracionPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  const { data: empresaRow } = user
    ? await supabase.from('usuarios_empresa').select('empresa_id').eq('user_id', user.id).maybeSingle()
    : { data: null }

  const { data: empresa } = empresaRow
    ? await supabase.from('empresas').select('nombre, rfc_emisor, csd_status').eq('id', empresaRow.empresa_id).maybeSingle()
    : { data: null }

  return (
    <Configuracion
      empresa={{
        nombre: empresa?.nombre ?? '',
        rfcEmisor: empresa?.rfc_emisor ?? '',
        csdStatus: empresa?.csd_status ?? 'sin_registrar',
      }}
    />
  )
}
