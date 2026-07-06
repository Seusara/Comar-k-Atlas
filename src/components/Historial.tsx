'use client'

import { useState } from 'react'
import { Download, XCircle, Search, Filter } from 'lucide-react'
import StatusBadge from './StatusBadge'
import type { FacturaStatus } from '@/lib/supabase/database.types'

type Status = FacturaStatus

const facturas = [
  { folio: 'A-00422', uuid: 'a8f3b...d91', cliente: 'Empresa Demo S.A.', rfc: 'GAL900312JK8', fecha: '06 Jul 2025', total: '$29,000.00', status: 'timbrada' as Status },
  { folio: 'A-00421', uuid: 'c2e1a...f44', cliente: 'Grupo Alfa S.A. de C.V.', rfc: 'GAL900312JK8', fecha: '02 Jul 2025', total: '$48,400.00', status: 'timbrada' as Status },
  { folio: 'A-00420', uuid: 'b7d9f...22a', cliente: 'Ferretería Martínez S.C.', rfc: 'FMA851120BN3', fecha: '01 Jul 2025', total: '$12,760.00', status: 'pendiente' as Status },
  { folio: 'A-00419', uuid: 'e1c5b...99f', cliente: 'Distribuciones López S.A.', rfc: 'DLO920403RX5', fecha: '30 Jun 2025', total: '$75,230.00', status: 'timbrada' as Status },
  { folio: 'A-00418', uuid: 'f3a8d...55c', cliente: 'Servicios Integrales JMH', rfc: 'SIJ881201MN9', fecha: '28 Jun 2025', total: '$9,280.00', status: 'cancelada' as Status },
  { folio: 'A-00417', uuid: 'd4b2e...11b', cliente: 'Comercializadora Ruiz', rfc: 'CRU960715PQ2', fecha: '27 Jun 2025', total: '$33,600.00', status: 'pendiente' as Status },
  { folio: 'A-00416', uuid: '9e7c1...6d8', cliente: 'Tecnologías Ágiles S.A.P.I.', rfc: 'TAG180522KL7', fecha: '25 Jun 2025', total: '$22,100.00', status: 'timbrada' as Status },
  { folio: 'A-00415', uuid: '5f6a2...3e1', cliente: 'Grupo Alfa S.A. de C.V.', rfc: 'GAL900312JK8', fecha: '22 Jun 2025', total: '$18,450.00', status: 'timbrada' as Status },
  { folio: 'A-00414', uuid: '2b4c8...7a3', cliente: 'Ferretería Martínez S.C.', rfc: 'FMA851120BN3', fecha: '20 Jun 2025', total: '$6,900.00', status: 'cancelada' as Status },
]

export default function Historial() {
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<Status | 'all'>('all')

  const filtered = facturas.filter(f => {
    const matchSearch = f.cliente.toLowerCase().includes(search.toLowerCase()) ||
      f.folio.toLowerCase().includes(search.toLowerCase()) ||
      f.rfc.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || f.status === filterStatus
    return matchSearch && matchStatus
  })

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>Historial de facturas</h1>
        <p style={{ fontSize: 13.5, color: '#64748b', margin: '4px 0 0' }}>
          {facturas.length} comprobantes emitidos
        </p>
      </div>

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
            {filtered.map((f, i) => (
              <tr
                key={i}
                style={{ borderBottom: '1px solid #f8fafc' }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <td style={{ padding: '11px 14px', fontWeight: 700, color: '#4f46e5', fontSize: 12 }}>{f.folio}</td>
                <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{f.uuid}</td>
                <td style={{ padding: '11px 14px', fontWeight: 500, color: '#0f172a' }}>{f.cliente}</td>
                <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{f.rfc}</td>
                <td style={{ padding: '11px 14px', color: '#64748b' }}>{f.fecha}</td>
                <td style={{ padding: '11px 14px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>{f.total}</td>
                <td style={{ padding: '11px 14px' }}><StatusBadge status={f.status} /></td>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <ActionBtn icon={<Download size={13} />} label="XML/PDF" />
                    {f.status !== 'cancelada' && (
                      <ActionBtn icon={<XCircle size={13} />} label="Cancelar" danger />
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

function ActionBtn({ icon, label, danger }: { icon: React.ReactNode; label: string; danger?: boolean }) {
  return (
    <button
      style={{
        display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
        border: `1px solid ${danger ? '#fecaca' : '#e2e8f0'}`,
        backgroundColor: danger ? '#fff5f5' : '#f8fafc',
        color: danger ? '#dc2626' : '#475569',
        fontSize: 11.5, fontWeight: 500, cursor: 'pointer', fontFamily: 'Inter, sans-serif',
        whiteSpace: 'nowrap',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.7')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {icon} {label}
    </button>
  )
}

const card: React.CSSProperties = { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }
