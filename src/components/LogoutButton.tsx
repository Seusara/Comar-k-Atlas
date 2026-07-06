'use client'

import { useRouter } from 'next/navigation'
import { LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export default function LogoutButton({ variant = 'sidebar' }: { variant?: 'sidebar' | 'header' }) {
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  const style: React.CSSProperties =
    variant === 'sidebar'
      ? {
          width: '100%', display: 'flex', alignItems: 'center', gap: 10, padding: '8px 8px', borderRadius: 8,
          border: 'none', backgroundColor: 'transparent', color: '#475569', fontSize: 13.5, fontWeight: 400,
          textAlign: 'left', cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        }
      : {
          display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 8,
          border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', fontSize: 13, fontWeight: 500,
          cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        }

  return (
    <button onClick={handleLogout} style={style}>
      <LogOut size={16} strokeWidth={2} />
      Cerrar sesión
    </button>
  )
}
