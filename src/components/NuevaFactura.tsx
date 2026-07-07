'use client'

import { useState } from 'react'
import { Search, Plus, Trash2, CheckCircle } from 'lucide-react'

interface Cliente {
  id: string
  nombre: string
  rfc: string
  regimen_fiscal: string
  uso_cfdi: string
}

interface Concepto {
  id: number
  claveSAT: string
  descripcion: string
  cantidad: number
  precio: number
  iva: number
}

export default function NuevaFactura({ clientes }: { clientes: Cliente[] }) {
  const [clienteSearch, setClienteSearch] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [conceptos, setConceptos] = useState<Concepto[]>([
    { id: 1, claveSAT: '81161500', descripcion: 'Servicio de consultoría', cantidad: 1, precio: 25000, iva: 16 },
  ])
  const [formaPago, setFormaPago] = useState('01')
  const [metodoPago, setMetodoPago] = useState('PUE')
  const [creada, setCreada] = useState(false)
  const [folioCreado, setFolioCreado] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredClientes = clientes.filter(c =>
    c.nombre.toLowerCase().includes(clienteSearch.toLowerCase()) ||
    c.rfc.toLowerCase().includes(clienteSearch.toLowerCase())
  )

  const subtotal = conceptos.reduce((acc, c) => acc + c.cantidad * c.precio, 0)
  const ivaTotal = conceptos.reduce((acc, c) => acc + c.cantidad * c.precio * (c.iva / 100), 0)
  const total = subtotal + ivaTotal

  const addConcepto = () => {
    setConceptos(prev => [...prev, { id: Date.now(), claveSAT: '', descripcion: '', cantidad: 1, precio: 0, iva: 16 }])
  }

  const updateConcepto = (id: number, field: keyof Concepto, value: string | number) => {
    setConceptos(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  const removeConcepto = (id: number) => {
    setConceptos(prev => prev.filter(c => c.id !== id))
  }

  function resetForm() {
    setCreada(false)
    setFolioCreado(null)
    setClienteSearch('')
    setClienteSeleccionado(null)
    setConceptos([{ id: Date.now(), claveSAT: '81161500', descripcion: 'Servicio de consultoría', cantidad: 1, precio: 25000, iva: 16 }])
  }

  async function handleTimbrar() {
    if (!clienteSeleccionado) {
      setError('Selecciona un cliente antes de crear la factura')
      return
    }

    setSubmitting(true)
    setError(null)

    const res = await fetch('/api/facturas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        clienteId: clienteSeleccionado.id,
        conceptos: conceptos.map(c => ({
          claveSat: c.claveSAT,
          descripcion: c.descripcion,
          cantidad: c.cantidad,
          precioUnitario: c.precio,
          iva: c.iva,
        })),
      }),
    })

    if (!res.ok) {
      try {
        const body = await res.json()
        setError(body.error ?? 'Error al crear la factura')
      } catch {
        setError('Error al crear la factura')
      }
      setSubmitting(false)
      return
    }

    const { factura } = await res.json()
    setFolioCreado(factura.folio)
    setSubmitting(false)
    setCreada(true)
  }

  if (creada) {
    return (
      <div style={{ padding: '80px 36px', maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', backgroundColor: '#dcfce7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
          <CheckCircle size={32} color="#16a34a" />
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>¡Factura registrada!</h2>
        <p style={{ fontSize: 13.5, color: '#64748b', margin: '0 0 24px' }}>
          Folio: <strong>{folioCreado}</strong>. Queda pendiente de timbrado ante el SAT (disponible en una próxima actualización).
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button style={{ ...primaryBtn, width: 'auto', padding: '9px 20px' }} onClick={resetForm}>Nueva factura</button>
          <button disabled style={{ ...secondaryBtn, width: 'auto', padding: '9px 20px', opacity: 0.5, cursor: 'not-allowed' }} title="Disponible cuando el timbrado real esté implementado">
            Descargar XML/PDF
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '32px 36px' }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>Nueva Factura (CFDI 4.0)</h1>
        <p style={{ fontSize: 13.5, color: '#64748b', margin: '4px 0 0' }}>Ingresa los datos del comprobante fiscal</p>
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</p>}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: 20, alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Cliente */}
          <section style={card}>
            <h3 style={sectionTitle}>Receptor</h3>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  value={clienteSearch}
                  onChange={e => { setClienteSearch(e.target.value); setShowDropdown(true); setClienteSeleccionado(null) }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="Buscar cliente por nombre o RFC..."
                  style={{ ...inputStyle, paddingLeft: 32 }}
                />
              </div>
              {showDropdown && clienteSearch && (
                <div style={{
                  position: 'absolute', zIndex: 20, top: '100%', left: 0, right: 0, backgroundColor: '#fff',
                  border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  marginTop: 4, maxHeight: 200, overflowY: 'auto',
                }}>
                  {filteredClientes.length === 0 ? (
                    <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>Sin resultados</div>
                  ) : filteredClientes.map(c => (
                    <div
                      key={c.id}
                      onClick={() => { setClienteSeleccionado(c); setClienteSearch(c.nombre); setShowDropdown(false) }}
                      style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{c.nombre}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{c.rfc} · Uso {c.uso_cfdi}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {clienteSeleccionado && (
              <div style={{ marginTop: 10, padding: '10px 12px', backgroundColor: '#f8fafc', borderRadius: 8, border: '1px solid #e2e8f0' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                  <div><span style={{ color: '#94a3b8' }}>RFC: </span><strong>{clienteSeleccionado.rfc}</strong></div>
                  <div><span style={{ color: '#94a3b8' }}>Régimen: </span><strong>{clienteSeleccionado.regimen_fiscal}</strong></div>
                  <div><span style={{ color: '#94a3b8' }}>Uso CFDI: </span><strong>{clienteSeleccionado.uso_cfdi}</strong></div>
                </div>
              </div>
            )}
          </section>

          {/* Conceptos */}
          <section style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
              <h3 style={{ ...sectionTitle, margin: 0 }}>Conceptos</h3>
              <button onClick={addConcepto} style={{ ...primaryBtn, width: 'auto', padding: '6px 12px', fontSize: 12 }}>
                <Plus size={12} /> Agregar
              </button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {['Clave SAT', 'Descripción', 'Cant.', 'Precio unit.', 'IVA %', 'Importe', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '0 8px 8px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conceptos.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '6px 8px' }}>
                        <input value={c.claveSAT} onChange={e => updateConcepto(c.id, 'claveSAT', e.target.value)} style={{ ...miniInput, width: 90 }} placeholder="81161500" />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input value={c.descripcion} onChange={e => updateConcepto(c.id, 'descripcion', e.target.value)} style={{ ...miniInput, width: 200 }} placeholder="Descripción del servicio" />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="number" value={c.cantidad} onChange={e => updateConcepto(c.id, 'cantidad', Number(e.target.value))} style={{ ...miniInput, width: 55, textAlign: 'center' }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="number" value={c.precio} onChange={e => updateConcepto(c.id, 'precio', Number(e.target.value))} style={{ ...miniInput, width: 100 }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <select value={c.iva} onChange={e => updateConcepto(c.id, 'iva', Number(e.target.value))} style={{ ...miniInput, width: 60 }}>
                          <option value={0}>0%</option>
                          <option value={8}>8%</option>
                          <option value={16}>16%</option>
                        </select>
                      </td>
                      <td style={{ padding: '6px 8px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                        ${(c.cantidad * c.precio).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <button onClick={() => removeConcepto(c.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8', padding: 2 }}
                          onMouseEnter={e => (e.currentTarget.style.color = '#dc2626')}
                          onMouseLeave={e => (e.currentTarget.style.color = '#94a3b8')}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          {/* Pago */}
          <section style={card}>
            <h3 style={sectionTitle}>Forma y método de pago</h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <label style={labelStyle}>Forma de pago</label>
                <select value={formaPago} onChange={e => setFormaPago(e.target.value)} style={inputStyle}>
                  <option value="01">01 – Efectivo</option>
                  <option value="03">03 – Transferencia</option>
                  <option value="04">04 – Tarjeta de crédito</option>
                  <option value="28">28 – Tarjeta de débito</option>
                  <option value="99">99 – Por definir</option>
                </select>
              </div>
              <div>
                <label style={labelStyle}>Método de pago</label>
                <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                  {['PUE', 'PPD'].map(m => (
                    <button
                      key={m}
                      onClick={() => setMetodoPago(m)}
                      style={{
                        flex: 1, padding: '8px', borderRadius: 8, fontSize: 13, fontWeight: 600,
                        border: `1px solid ${metodoPago === m ? '#4f46e5' : '#e2e8f0'}`,
                        backgroundColor: metodoPago === m ? '#eef2ff' : '#fff',
                        color: metodoPago === m ? '#4f46e5' : '#64748b',
                        cursor: 'pointer', fontFamily: 'Inter, sans-serif',
                      }}
                    >
                      {m}
                    </button>
                  ))}
                </div>
                <p style={{ fontSize: 10.5, color: '#94a3b8', margin: '4px 0 0' }}>
                  {metodoPago === 'PUE' ? 'Pago en una sola exhibición' : 'Pago en parcialidades o diferido'}
                </p>
              </div>
            </div>
          </section>
        </div>

        {/* Right column: totals */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 24 }}>
          <div style={card}>
            <h3 style={sectionTitle}>Resumen</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Row label="Subtotal" value={`$${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`} />
              <Row label="IVA (16%)" value={`$${ivaTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`} />
              <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>Total</span>
                <span style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.5px' }}>
                  ${total.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </span>
              </div>
            </div>
            <div style={{ marginTop: 12, padding: '10px', backgroundColor: '#f8fafc', borderRadius: 8, fontSize: 11.5, color: '#64748b' }}>
              <div><strong>Moneda:</strong> MXN · Tipo de cambio: 1.0</div>
              <div><strong>Método:</strong> {metodoPago === 'PUE' ? 'Una exhibición' : 'Parcialidades'}</div>
            </div>
          </div>

          <button
            onClick={handleTimbrar}
            disabled={submitting}
            style={{ ...primaryBtn, width: '100%', padding: '12px', fontSize: 14, opacity: submitting ? 0.7 : 1, cursor: submitting ? 'default' : 'pointer' }}
            onMouseEnter={e => { if (!submitting) e.currentTarget.style.backgroundColor = '#4338ca' }}
            onMouseLeave={e => { if (!submitting) e.currentTarget.style.backgroundColor = '#4f46e5' }}
          >
            {submitting ? 'Guardando…' : 'Timbrar factura'}
          </button>
          <p style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', margin: 0 }}>
            La factura queda registrada; el timbrado real ante el SAT llega en una próxima actualización
          </p>
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontWeight: 500, color: '#0f172a' }}>{value}</span>
    </div>
  )
}

const card: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '20px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
}
const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#0f172a', margin: '0 0 14px', textTransform: 'uppercase', letterSpacing: '0.06em' }
const inputStyle: React.CSSProperties = {
  width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0',
  fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff',
}
const miniInput: React.CSSProperties = {
  padding: '5px 8px', borderRadius: 6, border: '1px solid #e2e8f0',
  fontSize: 12, color: '#0f172a', outline: 'none', fontFamily: 'Inter, sans-serif',
}
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }
const primaryBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
  padding: '9px 14px', borderRadius: 8, border: 'none', cursor: 'pointer',
  backgroundColor: '#4f46e5', color: '#ffffff', fontSize: 13, fontWeight: 600,
  fontFamily: 'Inter, sans-serif', transition: 'background-color 0.15s',
}
const secondaryBtn: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  padding: '9px 14px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer',
  backgroundColor: '#ffffff', color: '#475569', fontSize: 13, fontWeight: 500,
  fontFamily: 'Inter, sans-serif',
}
