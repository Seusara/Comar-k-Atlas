'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Plus, Search, X } from 'lucide-react'

interface Cliente {
  id: string
  nombre: string
  rfc: string
  regimen_fiscal: string
  codigo_postal: string
  uso_cfdi: string
  creado_en: string
}

const emptyForm = { nombre: '', rfc: '', regimenFiscal: '601', codigoPostal: '', usoCfdi: 'G03' }

export default function Clientes({ clientes }: { clientes: Cliente[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = clientes.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.rfc.toLowerCase().includes(search.toLowerCase())
  )

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
    setShowModal(true)
  }

  function openEdit(cliente: Cliente) {
    setEditingId(cliente.id)
    setForm({
      nombre: cliente.nombre,
      rfc: cliente.rfc,
      regimenFiscal: cliente.regimen_fiscal,
      codigoPostal: cliente.codigo_postal,
      usoCfdi: cliente.uso_cfdi,
    })
    setError(null)
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const url = editingId ? `/api/clientes/${editingId}` : '/api/clientes'
    const method = editingId ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    })

    if (!res.ok) {
      try {
        const body = await res.json()
        setError(body.error ?? 'Error al guardar el cliente')
      } catch {
        setError('Error al guardar el cliente')
      }
      setSubmitting(false)
      return
    }

    setShowModal(false)
    setForm(emptyForm)
    setEditingId(null)
    setSubmitting(false)
    router.refresh()
  }

  async function handleDelete(id: string, nombre: string) {
    if (!confirm(`¿Eliminar al cliente "${nombre}"? Esta acción no se puede deshacer.`)) return
    setError(null)

    const res = await fetch(`/api/clientes/${id}`, { method: 'DELETE' })

    if (!res.ok) {
      try {
        const body = await res.json()
        setError(body.error ?? 'Error al eliminar el cliente')
      } catch {
        setError('Error al eliminar el cliente')
      }
      return
    }

    router.refresh()
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>Clientes</h1>
          <p style={{ fontSize: 13.5, color: '#64748b', margin: '4px 0 0' }}>{clientes.length} clientes registrados</p>
        </div>
        <button
          onClick={openCreate}
          style={primaryBtn}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#4338ca')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#4f46e5')}
        >
          <Plus size={15} /> Agregar cliente
        </button>
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</p>}

      <div style={{ position: 'relative', marginBottom: 16, maxWidth: 360 }}>
        <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o RFC..."
          style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }}
        />
      </div>

      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              {['Razón Social', 'RFC', 'Régimen Fiscal', 'C.P.', 'Uso de CFDI', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '0 14px 10px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(c => (
              <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a', cursor: 'pointer' }} onClick={() => openEdit(c)}>{c.nombre}</td>
                <td style={{ padding: '12px 14px', color: '#475569', fontFamily: 'monospace', fontSize: 12 }}>{c.rfc}</td>
                <td style={{ padding: '12px 14px', color: '#64748b', fontSize: 12 }}>{c.regimen_fiscal}</td>
                <td style={{ padding: '12px 14px', color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>{c.codigo_postal}</td>
                <td style={{ padding: '12px 14px', color: '#64748b', fontSize: 12 }}>{c.uso_cfdi}</td>
                <td style={{ padding: '12px 14px' }}>
                  <button
                    onClick={() => handleDelete(c.id, c.nombre)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', backgroundColor: '#fff5f5', color: '#dc2626', fontSize: 11.5, fontWeight: 500, cursor: 'pointer' }}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={6} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  Sin clientes registrados todavía
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 28, width: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>{editingId ? 'Editar cliente' : 'Nuevo cliente'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Razón Social / Nombre" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder="Ej. Empresa Ejemplo S.A. de C.V." required />
              <Field label="RFC" value={form.rfc} onChange={v => setForm(f => ({ ...f, rfc: v }))} placeholder="XAXX010101000" mono required />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Régimen Fiscal</label>
                  <select value={form.regimenFiscal} onChange={e => setForm(f => ({ ...f, regimenFiscal: e.target.value }))} style={inputStyle}>
                    <option value="601">601 – Gral. de Ley PF</option>
                    <option value="612">612 – Personas Físicas</option>
                    <option value="626">626 – Simplificado de confianza</option>
                    <option value="630">630 – Enajenación de acciones</option>
                  </select>
                </div>
                <Field label="Código Postal" value={form.codigoPostal} onChange={v => setForm(f => ({ ...f, codigoPostal: v }))} placeholder="06600" mono required />
              </div>
              <div>
                <label style={labelStyle}>Uso de CFDI preferido</label>
                <select value={form.usoCfdi} onChange={e => setForm(f => ({ ...f, usoCfdi: e.target.value }))} style={inputStyle}>
                  <option value="G01">G01 – Adquisición de mercancias</option>
                  <option value="G03">G03 – Gastos en general</option>
                  <option value="I04">I04 – Equipo de cómputo y accesorios</option>
                  <option value="S01">S01 – Sin efectos fiscales</option>
                  <option value="CP01">CP01 – Pagos</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ ...secondaryBtn, padding: '9px 18px' }}>Cancelar</button>
                <button type="submit" disabled={submitting} style={{ ...primaryBtn, padding: '9px 18px', opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? 'Guardando…' : 'Guardar cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, mono, required }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; required?: boolean
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        required={required}
        style={{ ...inputStyle, fontFamily: mono ? 'monospace' : 'Inter, sans-serif' }}
      />
    </div>
  )
}

const card: React.CSSProperties = { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }
const primaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: '#4f46e5', color: '#ffffff', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', transition: 'background-color 0.15s' }
const secondaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', backgroundColor: '#ffffff', color: '#475569', fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif' }
