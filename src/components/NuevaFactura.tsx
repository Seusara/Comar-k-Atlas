'use client'

import { useState } from 'react'
import { Search, Plus, Trash2, CheckCircle, AlertTriangle } from 'lucide-react'

interface Cliente {
  id: string
  nombre: string
  rfc: string
  regimen_fiscal: string
  uso_cfdi: string
}

interface Producto {
  id: string
  clave_sat: string
  clave_unidad: string
  nombre: string
  precio: number
  iva: number
}

interface Concepto {
  id: string
  claveSat: string
  claveUnidad: string
  descripcion: string
  cantidad: number
  precio: number
  iva: number
}

interface ResultadoFactura {
  folio: string
  status: 'timbrada' | 'pendiente' | 'cancelada'
  uuidFiscal: string | null
  errorTimbrado: string | null
  facturaId: string
}

export default function NuevaFactura({ clientes, productos }: { clientes: Cliente[]; productos: Producto[] }) {
  const [clienteSearch, setClienteSearch] = useState('')
  const [clienteSeleccionado, setClienteSeleccionado] = useState<Cliente | null>(null)
  const [showDropdown, setShowDropdown] = useState(false)
  const [conceptos, setConceptos] = useState<Concepto[]>([])
  const [showProductoDropdown, setShowProductoDropdown] = useState(false)
  const [productoSearch, setProductoSearch] = useState('')
  const [formaPago, setFormaPago] = useState('01')
  const [metodoPago, setMetodoPago] = useState('PUE')
  const [resultado, setResultado] = useState<ResultadoFactura | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const filteredClientes = clientes.filter(c =>
    c.nombre.toLowerCase().includes(clienteSearch.toLowerCase()) ||
    c.rfc.toLowerCase().includes(clienteSearch.toLowerCase())
  )

  const filteredProductos = productos.filter(p =>
    p.nombre.toLowerCase().includes(productoSearch.toLowerCase()) ||
    p.clave_sat.includes(productoSearch)
  )

  const subtotal = conceptos.reduce((acc, c) => acc + c.cantidad * c.precio, 0)
  const ivaTotal = conceptos.reduce((acc, c) => acc + c.cantidad * c.precio * (c.iva / 100), 0)
  const total = subtotal + ivaTotal

  function addConceptoDesdeProducto(producto: Producto) {
    setConceptos(prev => [...prev, {
      id: `${producto.id}-${Date.now()}`,
      claveSat: producto.clave_sat,
      claveUnidad: producto.clave_unidad,
      descripcion: producto.nombre,
      cantidad: 1,
      precio: producto.precio,
      iva: producto.iva,
    }])
    setShowProductoDropdown(false)
    setProductoSearch('')
  }

  const updateConcepto = (id: string, field: 'cantidad' | 'precio', value: number) => {
    setConceptos(prev => prev.map(c => c.id === id ? { ...c, [field]: value } : c))
  }

  const removeConcepto = (id: string) => {
    setConceptos(prev => prev.filter(c => c.id !== id))
  }

  function resetForm() {
    setResultado(null)
    setClienteSearch('')
    setClienteSeleccionado(null)
    setConceptos([])
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
        formaPago,
        metodoPago,
        conceptos: conceptos.map(c => ({
          claveSat: c.claveSat,
          claveUnidad: c.claveUnidad,
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
    setResultado({
      facturaId: factura.id,
      folio: factura.folio,
      status: factura.status,
      uuidFiscal: factura.uuid_fiscal,
      errorTimbrado: factura.error_timbrado,
    })
    setSubmitting(false)
  }

  if (resultado) {
    const timbrada = resultado.status === 'timbrada'
    return (
      <div style={{ padding: '80px 36px', maxWidth: 540, margin: '0 auto', textAlign: 'center' }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px',
          backgroundColor: timbrada ? '#dcfce7' : '#fef9c3',
        }}>
          {timbrada ? <CheckCircle size={32} color="#16a34a" /> : <AlertTriangle size={32} color="#d97706" />}
        </div>
        <h2 style={{ fontSize: 20, fontWeight: 700, color: '#0f172a', margin: '0 0 8px' }}>
          {timbrada ? '¡Factura timbrada!' : 'Factura registrada, pero el timbrado falló'}
        </h2>
        <p style={{ fontSize: 13.5, color: '#64748b', margin: '0 0 24px' }}>
          Folio: <strong>{resultado.folio}</strong>.
          {timbrada
            ? <> UUID fiscal: <strong>{resultado.uuidFiscal}</strong></>
            : <> {resultado.errorTimbrado}. Puedes reintentar el timbrado desde Historial.</>}
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button style={{ ...primaryBtn, width: 'auto', padding: '9px 20px' }} onClick={resetForm}>Nueva factura</button>
          {timbrada && (
            <>
              <a href={`/api/facturas/${resultado.facturaId}/xml`} style={{ ...secondaryBtn, width: 'auto', padding: '9px 20px', textDecoration: 'none' }}>
                Descargar XML
              </a>
              <a href={`/api/facturas/${resultado.facturaId}/pdf`} style={{ ...secondaryBtn, width: 'auto', padding: '9px 20px', textDecoration: 'none' }}>
                Descargar PDF
              </a>
            </>
          )}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

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

          <section style={card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, position: 'relative' }}>
              <h3 style={{ ...sectionTitle, margin: 0 }}>Conceptos</h3>
              <button onClick={() => setShowProductoDropdown(v => !v)} style={{ ...primaryBtn, width: 'auto', padding: '6px 12px', fontSize: 12 }}>
                <Plus size={12} /> Agregar desde catálogo
              </button>
              {showProductoDropdown && (
                <div style={{
                  position: 'absolute', zIndex: 20, top: '100%', right: 0, width: 320, backgroundColor: '#fff',
                  border: '1px solid #e2e8f0', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
                  marginTop: 4, maxHeight: 260, overflowY: 'auto',
                }}>
                  <div style={{ padding: 8 }}>
                    <input
                      autoFocus
                      value={productoSearch}
                      onChange={e => setProductoSearch(e.target.value)}
                      placeholder="Buscar producto por nombre o clave SAT..."
                      style={inputStyle}
                    />
                  </div>
                  {productos.length === 0 ? (
                    <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>
                      No tienes productos en tu catálogo. Agrega uno en Catálogo antes de facturar.
                    </div>
                  ) : filteredProductos.length === 0 ? (
                    <div style={{ padding: '10px 12px', fontSize: 13, color: '#94a3b8' }}>Sin resultados</div>
                  ) : filteredProductos.map(p => (
                    <div
                      key={p.id}
                      onClick={() => addConceptoDesdeProducto(p)}
                      style={{ padding: '10px 12px', cursor: 'pointer', borderBottom: '1px solid #f8fafc' }}
                      onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                      onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                    >
                      <div style={{ fontSize: 13, fontWeight: 500, color: '#0f172a' }}>{p.nombre}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', fontFamily: 'monospace' }}>{p.clave_sat} · {p.clave_unidad}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                    {['Clave SAT', 'Unidad', 'Descripción', 'Cant.', 'Precio unit.', 'IVA %', 'Importe', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '0 8px 8px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {conceptos.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 12 }}>{c.claveSat}</td>
                      <td style={{ padding: '6px 8px', fontFamily: 'monospace', fontSize: 12 }}>{c.claveUnidad}</td>
                      <td style={{ padding: '6px 8px' }}>{c.descripcion}</td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="number" value={c.cantidad} onChange={e => updateConcepto(c.id, 'cantidad', Number(e.target.value))} style={{ ...miniInput, width: 55, textAlign: 'center' }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>
                        <input type="number" value={c.precio} onChange={e => updateConcepto(c.id, 'precio', Number(e.target.value))} style={{ ...miniInput, width: 100 }} />
                      </td>
                      <td style={{ padding: '6px 8px' }}>{c.iva}%</td>
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
              {conceptos.length === 0 && (
                <div style={{ padding: '24px 8px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
                  Sin conceptos. Agrega uno desde el catálogo.
                </div>
              )}
            </div>
          </section>

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

        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, position: 'sticky', top: 24 }}>
          <div style={card}>
            <h3 style={sectionTitle}>Resumen</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <Row label="Subtotal" value={`$${subtotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`} />
              <Row label="IVA" value={`$${ivaTotal.toLocaleString('es-MX', { minimumFractionDigits: 2 })}`} />
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
            disabled={submitting || conceptos.length === 0}
            style={{ ...primaryBtn, width: '100%', padding: '12px', fontSize: 14, opacity: (submitting || conceptos.length === 0) ? 0.6 : 1, cursor: (submitting || conceptos.length === 0) ? 'not-allowed' : 'pointer' }}
          >
            {submitting ? 'Guardando…' : 'Timbrar factura'}
          </button>
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
