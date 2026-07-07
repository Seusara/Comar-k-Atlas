'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import logoIcon from '@/logo/icon.png'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      setError('Correo o contraseña incorrectos.')
      setLoading(false)
      return
    }

    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f8fafc' }}>
      <form onSubmit={handleSubmit} style={{ width: 360, backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, padding: 28, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        <Image src={logoIcon} alt="Comar-K" width={56} height={42} style={{ height: 42, width: 'auto', marginBottom: 12 }} priority />
        <h1 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 4px' }}>Comar-K</h1>
        <p style={{ fontSize: 13, color: '#64748b', margin: '0 0 20px' }}>Inicia sesión en tu cuenta</p>

        <label style={{ fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }}>Correo electrónico</label>
        <input
          type="email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
        />

        <label style={{ fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }}>Contraseña</label>
        <input
          type="password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, marginBottom: 14, boxSizing: 'border-box' }}
        />

        {error && <p style={{ fontSize: 12, color: '#dc2626', margin: '0 0 14px' }}>{error}</p>}

        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: '9px 14px', borderRadius: 8, border: 'none', backgroundColor: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 600, cursor: loading ? 'default' : 'pointer', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </div>
  )
}
