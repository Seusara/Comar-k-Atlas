import { useState } from 'react'
import { Search, Plus } from 'lucide-react'

const productos = [
  { claveSAT: '81161500', claveUnidad: 'E48', nombre: 'Servicios de consultoría de negocios', precio: 25000, iva: '16%' },
  { claveSAT: '43211508', claveUnidad: 'H87', nombre: 'Laptop Dell Inspiron 15 5000', precio: 18500, iva: '16%' },
  { claveSAT: '80141606', claveUnidad: 'E48', nombre: 'Desarrollo de software a la medida', precio: 45000, iva: '16%' },
  { claveSAT: '44121618', claveUnidad: 'H87', nombre: 'Silla ergonómica de oficina', precio: 4800, iva: '16%' },
  { claveSAT: '81111801', claveUnidad: 'MO', nombre: 'Mantenimiento de equipo de cómputo', precio: 1500, iva: '16%' },
  { claveSAT: '80111614', claveUnidad: 'E48', nombre: 'Capacitación empresarial', precio: 8000, iva: '16%' },
  { claveSAT: '72154804', claveUnidad: 'E48', nombre: 'Renta de espacio de oficina', precio: 12000, iva: '16%' },
  { claveSAT: '43232104', claveUnidad: 'H87', nombre: 'Monitor LED 27 pulgadas', precio: 5400, iva: '16%' },
  { claveSAT: '81112100', claveUnidad: 'E48', nombre: 'Soporte técnico mensual', precio: 3200, iva: '16%' },
]

export default function Catalogo() {
  const [search, setSearch] = useState('')

  const filtered = productos.filter(p =>
    p.nombre.toLowerCase().includes(search.toLowerCase()) ||
    p.claveSAT.includes(search) ||
    p.claveUnidad.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 24 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>Catálogo de productos / servicios</h1>
          <p style={{ fontSize: 13.5, color: '#64748b', margin: '4px 0 0' }}>{productos.length} artículos · Claves SAT del catálogo oficial</p>
        </div>
        <button
          style={primaryBtn}
          onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#4338ca')}
          onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#4f46e5')}
        >
          <Plus size={15} /> Nuevo artículo
        </button>
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 16, maxWidth: 400 }}>
        <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por nombre, clave SAT o unidad..."
          style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif' }}
        />
      </div>

      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              {['Clave SAT Producto', 'Clave Unidad', 'Nombre / Descripción', 'Precio unit.', 'IVA'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '0 16px 10px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map((p, i) => (
              <tr
                key={i}
                style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, backgroundColor: '#f1f5f9', padding: '2px 8px', borderRadius: 4, color: '#475569' }}>{p.claveSAT}</span>
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 12, backgroundColor: '#eef2ff', padding: '2px 8px', borderRadius: 4, color: '#4f46e5' }}>{p.claveUnidad}</span>
                </td>
                <td style={{ padding: '12px 16px', fontWeight: 500, color: '#0f172a' }}>{p.nombre}</td>
                <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>
                  ${p.precio.toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ padding: '2px 8px', borderRadius: 6, backgroundColor: '#dcfce7', color: '#15803d', fontSize: 12, fontWeight: 600 }}>{p.iva}</span>
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
    </div>
  )
}

const card: React.CSSProperties = { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }
const primaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: '#4f46e5', color: '#ffffff', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', transition: 'background-color 0.15s' }
