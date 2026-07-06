'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'

interface Empresa {
  id: string
  nombre: string
  rfc_emisor: string
  creada_en: string
}

const emptyForm = { nombre: '', rfcEmisor: '', regimenFiscal: '601', cpEmisor: '', email: '', password: '' }

export default function EmpresasManager({ empresas }: { empresas: Empresa[] }) {
  const router = useRouter()
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const res = await fetch('/admin/empresas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Error al crear la empresa')
      setSubmitting(false)
      return
    }

    setShowModal(false)
    setForm(emptyForm)
    setSubmitting(false)
    router.refresh()
  }

  async function handleDelete(id: string, nombre: string) {
    if (!confirm(`¿Eliminar la empresa "${nombre}"? Esta acción no se puede deshacer.`)) return

    const res = await fetch(`/admin/empresas/${id}`, { method: 'DELETE' })

    if (!res.ok) {
      const body = await res.json()
      setError(body.error ?? 'Error al eliminar la empresa')
      return
    }

    router.refresh()
  }

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: 0 }}>
          Empresas registradas ({empresas.length})
        </h2>
        <button
          onClick={() => setShowModal(true)}
          style={{ padding: '8px 14px', borderRadius: 8, border: 'none', backgroundColor: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
        >
          + Nueva empresa
        </button>
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              {['Nombre', 'RFC emisor', 'Alta', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {empresas.map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>{e.nombre}</td>
                <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#475569' }}>{e.rfc_emisor}</td>
                <td style={{ padding: '12px 16px', color: '#64748b' }}>{new Date(e.creada_en).toLocaleDateString('es-MX')}</td>
                <td style={{ padding: '12px 16px' }}>
                  <button
                    onClick={() => handleDelete(e.id, e.nombre)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', backgroundColor: '#fff5f5', color: '#dc2626', fontSize: 11.5, fontWeight: 500, cursor: 'pointer' }}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {empresas.length === 0 && (
              <tr>
                <td colSpan={4} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  Sin empresas registradas todavía
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 28, width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: '0 0 20px' }}>Nueva empresa</h3>
            <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <Field label="Razón social" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} required />
              <Field label="RFC emisor" value={form.rfcEmisor} onChange={v => setForm(f => ({ ...f, rfcEmisor: v }))} mono required />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>Régimen fiscal</label>
                  <select value={form.regimenFiscal} onChange={e => setForm(f => ({ ...f, regimenFiscal: e.target.value }))} style={inputStyle}>
                    <option value="601">601 – Gral. de Ley PF</option>
                    <option value="612">612 – Personas Físicas</option>
                    <option value="626">626 – Simplificado de confianza</option>
                  </select>
                </div>
                <Field label="Código postal" value={form.cpEmisor} onChange={v => setForm(f => ({ ...f, cpEmisor: v }))} mono required />
              </div>
              <Field label="Correo del primer usuario" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} type="email" required />
              <Field label="Contraseña del primer usuario" value={form.password} onChange={v => setForm(f => ({ ...f, password: v }))} type="password" required />

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ padding: '9px 16px', borderRadius: 8, border: '1px solid #e2e8f0', backgroundColor: '#fff', color: '#475569', fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
                  Cancelar
                </button>
                <button type="submit" disabled={submitting} style={{ padding: '9px 16px', borderRadius: 8, border: 'none', backgroundColor: '#4f46e5', color: '#fff', fontSize: 13, fontWeight: 600, cursor: submitting ? 'default' : 'pointer', opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? 'Creando…' : 'Crear empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }

function Field({ label, value, onChange, mono, required, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; mono?: boolean; required?: boolean; type?: string
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        required={required}
        style={{ ...inputStyle, fontFamily: mono ? 'monospace' : 'Inter, sans-serif' }}
      />
    </div>
  )
}
