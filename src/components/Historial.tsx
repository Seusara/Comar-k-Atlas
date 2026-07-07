'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, XCircle, Search, Filter } from 'lucide-react'
import StatusBadge from './StatusBadge'
import type { FacturaStatus } from '@/lib/supabase/database.types'

interface Factura {
  id: string
  folio: string
  uuid_fiscal: string | null
  fecha: string
  total: number
  status: FacturaStatus
  cliente_nombre: string
  cliente_rfc: string
}

export default function Historial({ facturas }: { facturas: Factura[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FacturaStatus | 'all'>('all')
  const [error, setError] = useState<string | null>(null)
  const [cancelandoId, setCancelandoId] = useState<string | null>(null)

  const filtered = facturas.filter(f => {
    const matchSearch = f.cliente_nombre.toLowerCase().includes(search.toLowerCase()) ||
      f.folio.toLowerCase().includes(search.toLowerCase()) ||
      f.cliente_rfc.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || f.status === filterStatus
    return matchSearch && matchStatus
  })

  async function handleCancelar(id: string) {
    if (!confirm('¿Cancelar esta factura? Esta acción no se puede deshacer.')) return
    setCancelandoId(id)
    setError(null)

    const res = await fetch(`/api/facturas/${id}/cancelar`, { method: 'PATCH' })

    if (!res.ok) {
      try {
        const body = await res.json()
        setError(body.error ?? 'Error al cancelar la factura')
      } catch {
        setError('Error al cancelar la factura')
      }
      setCancelandoId(null)
      return
    }

    setCancelandoId(null)
    router.refresh()
  }

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>Historial de facturas</h1>
        <p style={{ fontSize: 13.5, color: '#64748b', margin: '4px 0 0' }}>
          {facturas.length} comprobantes emitidos
        </p>
      </div>

      {error && <p style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>{error}</p>}

      {/* Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 16, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', flex: '1 1 280px' }}>
          <Search size={14} color="#94a3b8" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar por folio, cliente o RFC..."
            style={{ width: '100%', padding: '8px 10px 8px 32px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, outline: 'none', fontFamily: 'Inter, sans-serif', boxSizing: 'border-box' }}
          />
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Filter size={14} color="#94a3b8" />
          {(['all', 'timbrada', 'pendiente', 'cancelada'] as const).map(s => (
            <button
              key={s}
              onClick={() => setFilterStatus(s)}
              style={{
                padding: '6px 14px', borderRadius: 8, fontSize: 12, fontWeight: 500,
                border: `1px solid ${filterStatus === s ? '#4f46e5' : '#e2e8f0'}`,
                backgroundColor: filterStatus === s ? '#eef2ff' : '#fff',
                color: filterStatus === s ? '#4f46e5' : '#64748b',
                cursor: 'pointer', fontFamily: 'Inter, sans-serif',
              }}
            >
              {s === 'all' ? 'Todas' : s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div style={card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              {['Folio', 'UUID (folio fiscal)', 'Cliente', 'RFC', 'Fecha', 'Total', 'Estatus', 'Acciones'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '0 14px 10px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(f => (
              <tr
                key={f.id}
                style={{ borderBottom: '1px solid #f8fafc' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <td style={{ padding: '11px 14px', fontWeight: 700, color: '#4f46e5', fontSize: 12 }}>{f.folio}</td>
                <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{f.uuid_fiscal ?? '—'}</td>
                <td style={{ padding: '11px 14px', fontWeight: 500, color: '#0f172a' }}>{f.cliente_nombre}</td>
                <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{f.cliente_rfc}</td>
                <td style={{ padding: '11px 14px', color: '#64748b' }}>{new Date(f.fecha).toLocaleDateString('es-MX')}</td>
                <td style={{ padding: '11px 14px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                  ${Number(f.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </td>
                <td style={{ padding: '11px 14px' }}><StatusBadge status={f.status} /></td>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <ActionBtn icon={<Download size={13} />} label="XML/PDF" disabled title="Disponible cuando el timbrado real esté implementado" />
                    {f.status === 'pendiente' && (
                      <ActionBtn
                        icon={<XCircle size={13} />}
                        label={cancelandoId === f.id ? 'Cancelando…' : 'Cancelar'}
                        danger
                        onClick={() => handleCancelar(f.id)}
                        disabled={cancelandoId === f.id}
                      />
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: '40px', textAlign: 'center', color: '#94a3b8', fontSize: 13 }}>
            Sin resultados
          </div>
        )}
      </div>
    </div>
  )
}

function ActionBtn({ icon, label, danger, onClick, disabled, title }: {
  icon: React.ReactNode; label: string; danger?: boolean; onClick?: () => void; disabled?: boolean; title?: string
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      title={title}
      style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
        border: `1px solid ${danger ? '#fecaca' : '#e2e8f0'}`,
        backgroundColor: danger ? '#fff5f5' : '#f8fafc',
        color: danger ? '#dc2626' : '#475569',
        fontSize: 11.5, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif',
        whiteSpace: 'nowrap', opacity: disabled ? 0.6 : 1,
      }}
    >
      {icon} {label}
    </button>
  )
}

const card: React.CSSProperties = { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }
