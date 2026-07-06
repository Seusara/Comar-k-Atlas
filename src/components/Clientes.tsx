'use client'

import { useState } from 'react'
import { Plus, Search, X } from 'lucide-react'

const clientesData = [
  { nombre: 'Grupo Alfa S.A. de C.V.', rfc: 'GAL900312JK8', regimen: '601 – Gral. Ley PF', cp: '64000', uso: 'G03 – Gastos en general', facturas: 24 },
  { nombre: 'Ferretería Martínez S.C.', rfc: 'FMA851120BN3', regimen: '612 – Pers. físicas', cp: '44100', uso: 'G01 – Adquisición de mercancias', facturas: 11 },
  { nombre: 'Distribuciones López S.A.', rfc: 'DLO920403RX5', regimen: '601 – Gral. Ley PF', cp: '06600', uso: 'G03 – Gastos en general', facturas: 38 },
  { nombre: 'Servicios Integrales JMH', rfc: 'SIJ881201MN9', regimen: '612 – Pers. físicas', cp: '72000', uso: 'S01 – Sin efectos fiscales', facturas: 7 },
  { nombre: 'Comercializadora Ruiz', rfc: 'CRU960715PQ2', regimen: '601 – Gral. Ley PF', cp: '31000', uso: 'G03 – Gastos en general', facturas: 15 },
  { nombre: 'Tecnologías Ágiles S.A.P.I.', rfc: 'TAG180522KL7', regimen: '601 – Gral. Ley PF', cp: '11560', uso: 'I06 – Construcciones', facturas: 9 },
]

export default function Clientes() {
  const [search, setSearch] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ nombre: '', rfc: '', regimen: '601', cp: '', uso: 'G03', email: '' })

  const filtered = clientesData.filter(c =>
    c.nombre.toLowerCase().includes(search.toLowerCase()) ||
    c.rfc.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>Clientes</h1>
          <p style={{ fontSize: 13.5, color: '#64748b', margin: '4px 0 0' }}>{clientesData.length} clientes registrados</p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          style={primaryBtn}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#4338ca')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#4f46e5')}
        >
          <Plus size={15} /> Agregar cliente
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16, maxWidth: 360 }}>
        <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre o RFC..."
          style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif' }}
        />
      </div>

      {/* Table */}
      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              {['Razón Social', 'RFC', 'Régimen Fiscal', 'C.P.', 'Uso de CFDI', 'Facturas'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '0 14px 10px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((c, i) => (
              <tr
                key={i}
                style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <td style={{ padding: '12px 14px', fontWeight: 600, color: '#0f172a' }}>{c.nombre}</td>
                <td style={{ padding: '12px 14px', color: '#475569', fontFamily: 'monospace', fontSize: 12 }}>{c.rfc}</td>
                <td style={{ padding: '12px 14px', color: '#64748b', fontSize: 12 }}>{c.regimen}</td>
                <td style={{ padding: '12px 14px', color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>{c.cp}</td>
                <td style={{ padding: '12px 14px', color: '#64748b', fontSize: 12 }}>{c.uso}</td>
                <td style={{ padding: '12px 14px' }}>
                  <span style={{ padding: '3px 10px', borderRadius: 99, backgroundColor: '#eef2ff', color: '#4f46e5', fontSize: 12, fontWeight: 600 }}>
                    {c.facturas}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {showModal && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 28, width: 500, boxShadow: '0 20px 60px rgba(0,0,0,0.15)', position: 'relative' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Nuevo cliente</h2>
              <button onClick={() => setShowModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <Field label="Razón Social / Nombre" value={form.nombre} onChange={v => setForm(f => ({ ...f, nombre: v }))} placeholder="Ej. Empresa Ejemplo S.A. de C.V." />
              <Field label="RFC" value={form.rfc} onChange={v => setForm(f => ({ ...f, rfc: v }))} placeholder="XAXX010101000" mono />
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div>
                  <label style={labelStyle}>Régimen Fiscal</label>
                  <select value={form.regimen} onChange={e => setForm(f => ({ ...f, regimen: e.target.value }))} style={inputStyle}>
                    <option value="601">601 – Gral. de Ley PF</option>
                    <option value="612">612 – Personas Físicas</option>
                    <option value="626">626 – Simplificado de confianza</option>
                    <option value="630">630 – Enajenación de acciones</option>
                  </select>
                </div>
                <Field label="Código Postal" value={form.cp} onChange={v => setForm(f => ({ ...f, cp: v }))} placeholder="06600" mono />
              </div>
              <div>
                <label style={labelStyle}>Uso de CFDI preferido</label>
                <select value={form.uso} onChange={e => setForm(f => ({ ...f, uso: e.target.value }))} style={inputStyle}>
                  <option value="G01">G01 – Adquisición de mercancias</option>
                  <option value="G03">G03 – Gastos en general</option>
                  <option value="I04">I04 – Equipo de cómputo y accesorios</option>
                  <option value="S01">S01 – Sin efectos fiscales</option>
                  <option value="CP01">CP01 – Pagos</option>
                </select>
              </div>
              <Field label="Correo electrónico" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} placeholder="contacto@empresa.com" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 22 }}>
              <button onClick={() => setShowModal(false)} style={{ ...secondaryBtn, padding: '9px 18px' }}>Cancelar</button>
              <button onClick={() => setShowModal(false)} style={{ ...primaryBtn, padding: '9px 18px' }}>Guardar cliente</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, placeholder, mono }: {
  label: string; value: string; onChange: (v: string) => void; placeholder?: string; mono?: boolean
}) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{ ...inputStyle, fontFamily: mono ? 'monospace' : 'Inter, sans-serif' }}
      />
    </div>
  )
}

const card: React.CSSProperties = { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff' }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }
const primaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: '#4f46e5', color: '#ffffff', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', transition: 'background-color 0.15s' }
const secondaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', backgroundColor: '#ffffff', color: '#475569', fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif' }
