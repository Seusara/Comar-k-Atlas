import { createAdminClient } from '@/lib/supabase/admin'
import EmpresasManager from '@/components/admin/EmpresasManager'

export default async function AdminPage() {
  const admin = createAdminClient()
  const { data: empresas, error } = await admin
    .from('empresas')
    .select('id, nombre, rfc_emisor, creada_en')
    .order('creada_en', { ascending: false })

  if (error) {
    return <p style={{ color: '#dc2626', fontSize: 13 }}>Error al cargar empresas: {error.message}</p>
  }

  return <EmpresasManager empresas={empresas ?? []} />
}
