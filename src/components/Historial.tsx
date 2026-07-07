'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Download, XCircle, RotateCw, Search, Filter, X } from 'lucide-react'
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
  error_timbrado: string | null
}

const MOTIVOS = [
  { value: '01', label: '01 – Comprobante con errores, con relación' },
  { value: '02', label: '02 – Comprobante con errores, sin relación' },
  { value: '03', label: '03 – La operación no se llevó a cabo' },
  { value: '04', label: '04 – Operación nominativa en factura global' },
]

export default function Historial({ facturas }: { facturas: Factura[] }) {
  const router = useRouter()
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState<FacturaStatus | 'all'>('all')
  const [error, setError] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [cancelModalId, setCancelModalId] = useState<string | null>(null)
  const [motivo, setMotivo] = useState('02')
  const [uuidSustitucion, setUuidSustitucion] = useState('')

  const filtered = facturas.filter(f => {
    const matchSearch = f.cliente_nombre.toLowerCase().includes(search.toLowerCase()) ||
      f.folio.toLowerCase().includes(search.toLowerCase()) ||
      f.cliente_rfc.toLowerCase().includes(search.toLowerCase())
    const matchStatus = filterStatus === 'all' || f.status === filterStatus
    return matchSearch && matchStatus
  })

  async function handleCancelarPendiente(id: string) {
    if (!confirm('¿Cancelar esta factura? Esta acción no se puede deshacer.')) return
    setBusyId(id)
    setError(null)

    const res = await fetch(`/api/facturas/${id}/cancelar`, { method: 'PATCH' })

    if (!res.ok) {
      try {
        const body = await res.json()
        setError(body.error ?? 'Error al cancelar la factura')
      } catch {
        setError('Error al cancelar la factura')
      }
      setBusyId(null)
      return
    }

    setBusyId(null)
    router.refresh()
  }

  async function handleReintentar(id: string) {
    setBusyId(id)
    setError(null)

    const res = await fetch(`/api/facturas/${id}/timbrar`, { method: 'POST' })

    if (!res.ok) {
      try {
        const body = await res.json()
        setError(body.error ?? 'Error al reintentar el timbrado')
      } catch {
        setError('Error al reintentar el timbrado')
      }
      setBusyId(null)
      return
    }

    setBusyId(null)
    router.refresh()
  }

  function abrirModalCancelar(id: string) {
    setCancelModalId(id)
    setMotivo('02')
    setUuidSustitucion('')
    setError(null)
  }

  async function confirmarCancelacionTimbrada() {
    if (!cancelModalId) return
    setBusyId(cancelModalId)
    setError(null)

    const res = await fetch(`/api/facturas/${cancelModalId}/cancelar-timbrado`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(motivo === '01' ? { motivo, uuidSustitucion } : { motivo }),
    })

    if (!res.ok) {
      try {
        const body = await res.json()
        setError(body.error ?? 'Error al cancelar la factura')
      } catch {
        setError('Error al cancelar la factura')
      }
      setBusyId(null)
      return
    }

    setBusyId(null)
    setCancelModalId(null)
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
              <tr key={f.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '11px 14px', fontWeight: 700, color: '#4f46e5', fontSize: 12 }}>{f.folio}</td>
                <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 11, color: '#94a3b8' }}>{f.uuid_fiscal ?? '—'}</td>
                <td style={{ padding: '11px 14px', fontWeight: 500, color: '#0f172a' }}>{f.cliente_nombre}</td>
                <td style={{ padding: '11px 14px', fontFamily: 'monospace', fontSize: 12, color: '#64748b' }}>{f.cliente_rfc}</td>
                <td style={{ padding: '11px 14px', color: '#64748b' }}>{new Date(f.fecha).toLocaleDateString('es-MX')}</td>
                <td style={{ padding: '11px 14px', fontWeight: 600, color: '#0f172a', whiteSpace: 'nowrap' }}>
                  ${Number(f.total).toLocaleString('es-MX', { minimumFractionDigits: 2 })}
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <StatusBadge status={f.status} />
                  {f.status === 'pendiente' && f.error_timbrado && (
                    <div style={{ fontSize: 10.5, color: '#dc2626', marginTop: 3, maxWidth: 160 }}>{f.error_timbrado}</div>
                  )}
                </td>
                <td style={{ padding: '11px 14px' }}>
                  <div style={{ display: 'flex', gap: 6 }}>
                    {f.status === 'pendiente' && (
                      <>
                        <ActionBtn
                          icon={<RotateCw size={13} />}
                          label={busyId === f.id ? 'Timbrando…' : 'Reintentar timbrado'}
                          onClick={() => handleReintentar(f.id)}
                          disabled={busyId === f.id}
                        />
                        <ActionBtn
                          icon={<XCircle size={13} />}
                          label={busyId === f.id ? 'Cancelando…' : 'Cancelar'}
                          danger
                          onClick={() => handleCancelarPendiente(f.id)}
                          disabled={busyId === f.id}
                        />
                      </>
                    )}
                    {f.status === 'timbrada' && (
                      <>
                        <a href={`/api/facturas/${f.id}/xml`} style={{ ...actionBtnStyle(false), textDecoration: 'none' }}>
                          <Download size={13} /> XML
                        </a>
                        <a href={`/api/facturas/${f.id}/pdf`} style={{ ...actionBtnStyle(false), textDecoration: 'none' }}>
                          <Download size={13} /> PDF
                        </a>
                        <ActionBtn icon={<XCircle size={13} />} label="Cancelar" danger onClick={() => abrirModalCancelar(f.id)} />
                      </>
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

      {cancelModalId && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.3)', zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div style={{ backgroundColor: '#fff', borderRadius: 14, padding: 28, width: 460, boxShadow: '0 20px 60px rgba(0,0,0,0.15)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#0f172a', margin: 0 }}>Cancelar factura timbrada</h2>
              <button onClick={() => setCancelModalId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#94a3b8' }}>
                <X size={18} />
              </button>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label htmlFor="motivo-cancelacion" style={labelStyle}>Motivo de cancelación</label>
                <select id="motivo-cancelacion" aria-label="Motivo de cancelación" value={motivo} onChange={e => setMotivo(e.target.value)} style={inputStyle}>
                  {MOTIVOS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              {motivo === '01' && (
                <div>
                  <label style={labelStyle}>UUID de sustitución</label>
                  <input
                    value={uuidSustitucion}
                    onChange={e => setUuidSustitucion(e.target.value)}
                    placeholder="UUID de sustitución"
                    style={{ ...inputStyle, fontFamily: 'monospace' }}
                  />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
                <button onClick={() => setCancelModalId(null)} style={{ ...secondaryBtn, padding: '9px 18px' }}>Cerrar</button>
                <button
                  onClick={confirmarCancelacionTimbrada}
                  disabled={busyId === cancelModalId || (motivo === '01' && !uuidSustitucion)}
                  style={{ ...primaryBtn, padding: '9px 18px', opacity: (busyId === cancelModalId || (motivo === '01' && !uuidSustitucion)) ? 0.6 : 1 }}
                >
                  {busyId === cancelModalId ? 'Cancelando…' : 'Confirmar cancelación'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ActionBtn({ icon, label, danger, onClick, disabled }: {
  icon: React.ReactNode; label: string; danger?: boolean; onClick?: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={actionBtnStyle(!!danger, disabled)}>
      {icon} {label}
    </button>
  )
}

function actionBtnStyle(danger: boolean, disabled?: boolean): React.CSSProperties {
  return {
    display: 'flex', alignItems: 'center', gap: 4, padding: '4px 10px', borderRadius: 6,
    border: `1px solid ${danger ? '#fecaca' : '#e2e8f0'}`,
    backgroundColor: danger ? '#fff5f5' : '#f8fafc',
    color: danger ? '#dc2626' : '#475569',
    fontSize: 11.5, fontWeight: 500, cursor: disabled ? 'not-allowed' : 'pointer', fontFamily: 'Inter, sans-serif',
    whiteSpace: 'nowrap', opacity: disabled ? 0.6 : 1,
  }
}

const card: React.CSSProperties = { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', overflow: 'hidden' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }
const primaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: '#4f46e5', color: '#ffffff', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', transition: 'background-color 0.15s' }
const secondaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 16px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', backgroundColor: '#ffffff', color: '#475569', fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif' }
