import { redirect } from 'next/navigation'
import Sidebar from '@/components/Sidebar'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const admin = createAdminClient()
  const { data: empresaRow } = await admin
    .from('usuarios_empresa')
    .select('empresa_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!empresaRow) redirect('/admin')

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: '#f8fafc' }}>
      <Sidebar />
      <main style={{ marginLeft: 240, flex: 1, minWidth: 0 }}>{children}</main>
    </div>
  )
}
