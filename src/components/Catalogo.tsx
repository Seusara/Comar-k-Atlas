'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Search, Plus, X } from 'lucide-react'

interface Producto {
  id: string
  clave_sat: string
  clave_unidad: string
  nombre: string
  precio: number
  iva: number
  creado_en: string
}

const emptyForm = { claveSat: '', claveUnidad: '', nombre: '', precio: '', iva: '16' }

export default function Catalogo({ productos }: { productos: Producto[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filtered = productos.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    p.clave_sat.includes(search) ||
    p.clave_unidad.toLowerCase().includes(search.toLowerCase())
  )

  function openCreate() {
    setEditingId(null)
    setForm(emptyForm)
    setError(null)
    setShowModal(true)
  }

  function openEdit(producto: Producto) {
    setEditingId(producto.id)
    setForm({
      claveSat: producto.clave_sat,
      claveUnidad: producto.clave_unidad,
      nombre: producto.nombre,
      precio: String(producto.precio),
      iva: String(producto.iva),
    })
    setError(null)
    setShowModal(true)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    const precio = Number(form.precio)
    const iva = Number(form.iva)

    if (!Number.isFinite(precio) || !Number.isFinite(iva)) {
      setError('Precio e IVA deben ser números válidos')
      setSubmitting(false)
      return
    }

    const url = editingId ? `/api/productos/${editingId}` : '/api/productos'
    const method = editingId ? 'PATCH' : 'POST'

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ claveSat: form.claveSat, claveUnidad: form.claveUnidad, nombre: form.nombre, precio, iva }),
    })

    if (!res.ok) {
      try {
        const body = await res.json()
        setError(body.error ?? 'Error al guardar el producto')
      } catch {
        setError('Error al guardar el producto')
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
    if (!confirm(`¿Eliminar el artículo "${nombre}"? Esta acción no se puede deshacer.`)) return
    setError(null)

    const res = await fetch(`/api/productos/${id}`, { method: 'DELETE' })

    if (!res.ok) {
      try {
        const body = await res.json()
        setError(body.error ?? 'Error al eliminar el producto')
      } catch {
        setError('Error al eliminar el producto')
      }
      return
    }

    router.refresh()
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>Catálogo de productos / servicios</h1>
          <p style={{ fontSize: 13.5, color: '#64748b', margin: '4px 0 0' }}>{productos.length} artículos · Claves SAT del catálogo oficial</p>
        </div>
        <button
          onClick={openCreate}
          style={primaryBtn}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#4338ca')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#4f46e5')}
        >
          <Plus size={15} /> Nuevo artículo
        </button>
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</p>}

      <div style={{ position: 'relative', marginBottom: 16, maxWidth: 400 }}>
        <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, clave SAT o unidad..."
          style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }}
        />
      </div>

      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              {['Clave SAT Producto', 'Clave Unidad', 'Nombre / Descripción', 'Precio unit.', 'IVA', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '0 16px 10px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '12px 16px', cursor: 'pointer' }} onClick={() => openEdit(p)}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: 4, color: '#475569' }}>{p.clave_sat}</span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, backgroundColor: '#eef2ff', padding: '2px 8px', borderRadius: 4, color: '#4f46e5' }}>{p.clave_unidad}</span>
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 500, color: '#0f172a' }}>{p.nombre}</td>
                <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>
                  ${p.precio.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 6, backgroundColor: '#dcfce7', color: '#15803d', fontSize: 12, fontWeight: 600 }}>{p.iva}%</span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <button
                    onClick={() => handleDelete(p.id, p.nombre)}
                    style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #fecaca', backgroundColor: '#fff5f5', color: '#dc2626', fontSize: 11.5, fontWeight: 500, cursor: 'pointer' }}
                  >
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            Sin resultados para "{search}"
          </div>
        )}
      </div>

      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 28, width: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>{editingId ? 'Editar artículo' : 'Nuevo artículo'}</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={18} />
              </button>
            </div>
            <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Clave SAT" value={form.claveSat} onChange={v => setForm(f => ({ ...f, claveSat: v }))} placeholder="81161500" mono required />
              <Field label="Clave Unidad" value={form.claveUnidad} onChange={v => setForm(f => ({ ...f, claveUnidad: v }))} placeholder="E48" mono required />
              <Field label="Nombre / Descripción" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder="Servicio de consultoría" required />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Precio unitario" value={form.precio} onChange={v => setForm(f => ({ ...f, precio: v }))} placeholder="25000" type="number" required />
                <div>
                  <label style={labelStyle}>IVA</label>
                  <select value={form.iva} onChange={e => setForm(f => ({ ...f, iva: e.target.value }))} style={inputStyle}>
                    <option value="0">0%</option>
                    <option value="8">8%</option>
                    <option value="16">16%</option>
                  </select>
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button type="button" onClick={() => setShowModal(false)} style={{ ...secondaryBtn, padding: '9px 18px' }}>Cancelar</button>
                <button type="submit" disabled={submitting} style={{ ...primaryBtn, padding: '9px 18px', opacity: submitting ? 0.7 : 1 }}>
                  {submitting ? 'Guardando…' : 'Guardar artículo'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, mono, required, type = 'text' }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean; required?: boolean; type?: string
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        type={type}
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
