'use client'

import { useRouter } from 'next/navigation'
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { FileText, DollarSign, Clock, XCircle, TrendingUp, TrendingDown } from 'lucide-react'
import StatusBadge from './StatusBadge'
import type { FacturaStatus } from '@/lib/supabase/database.types'
import type { DashboardResumen } from '@/lib/dashboard/resumen'

export interface FacturaReciente {
  folio: string
  cliente: string
  rfc: string
  fecha: string
  total: number
  status: FacturaStatus
}

export interface DashboardProps {
  empresaNombre: string
  periodo: string
  resumen: DashboardResumen
  facturasRecientes: FacturaReciente[]
}

function formatMoney(n: number): string {
  return `$${n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export default function Dashboard({ empresaNombre, periodo, resumen, facturasRecientes }: DashboardProps) {
  const router = useRouter()

  const ingresosSub = resumen.ingresos.deltaPct === null
    ? (resumen.ingresos.trend === 'up' ? 'Sin ingresos el mes anterior' : 'Sin cambios vs mes anterior')
    : `${resumen.ingresos.deltaPct >= 0 ? '+' : ''}${resumen.ingresos.deltaPct.toFixed(1)}% vs mes anterior`

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1200 }}>
      {/* Header */}
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>
          Dashboard
        </h1>
        <p style={{ fontSize: 13.5, color: '#64748b', margin: '4px 0 0' }}>
          {periodo}{empresaNombre ? ` · ${empresaNombre}` : ''}
        </p>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16, marginBottom: 28 }}>
        <KpiCard
          label="Facturas emitidas"
          value={String(resumen.facturasEmitidas.valor)}
          sub={`${resumen.facturasEmitidas.delta >= 0 ? '+' : ''}${resumen.facturasEmitidas.delta} vs mes anterior`}
          trend={resumen.facturasEmitidas.trend}
          icon={<FileText size={18} color="#4f46e5" />}
          iconBg="#eef2ff"
        />
        <KpiCard
          label="Ingresos del mes"
          value={formatMoney(resumen.ingresos.valor)}
          sub={ingresosSub}
          trend={resumen.ingresos.trend}
          icon={<DollarSign size={18} color="#16a34a" />}
          iconBg="#dcfce7"
        />
        <KpiCard
          label="Pendientes de timbrar"
          value={String(resumen.pendientes.cantidad)}
          sub={`${formatMoney(resumen.pendientes.totalPendiente)} por regularizar`}
          trend="neutral"
          icon={<Clock size={18} color="#d97706" />}
          iconBg="#fef3c7"
        />
        <KpiCard
          label="Canceladas este mes"
          value={String(resumen.canceladas.cantidad)}
          sub={`${formatMoney(resumen.canceladas.totalCancelado)} en canceladas`}
          trend={resumen.canceladas.cantidad > 0 ? 'down' : 'neutral'}
          icon={<XCircle size={18} color="#dc2626" />}
          iconBg="#fee2e2"
        />
      </div>

      {/* Chart + actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 280px', gap: 16, marginBottom: 28 }}>
        {/* Area Chart */}
        <div style={card}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0 }}>Ingresos por mes</h2>
              <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>Últimos 7 meses</p>
            </div>
            <span style={{ fontSize: 12, color: '#4f46e5', fontWeight: 500 }}>MXN</span>
          </div>
          <ResponsiveContainer width="100%" height={200}>
            <AreaChart data={resumen.chartMensual} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="gradIngr" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#4f46e5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}
                formatter={v => [`$${Number(v).toLocaleString('es-MX')}`, 'Ingresos']}
              />
              <Area type="monotone" dataKey="ingresos" stroke="#4f46e5" strokeWidth={2} fill="url(#gradIngr)" dot={false} activeDot={{ r: 4, fill: '#4f46e5' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        {/* Quick actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={card}>
            <p style={{ fontSize: 12, fontWeight: 600, color: '#64748b', margin: '0 0 12px', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Acciones rápidas</p>
            <button
              onClick={() => router.push('/facturas/nueva')}
              style={primaryBtn}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#4338ca')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#4f46e5')}
            >
              <FileText size={14} /> Nueva factura CFDI
            </button>
            <button
              onClick={() => router.push('/clientes')}
              style={secondaryBtn}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#ffffff')}
            >
              Agregar cliente
            </button>
            <button
              onClick={() => router.push('/historial')}
              style={secondaryBtn}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f1f5f9')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#ffffff')}
            >
              Ver historial
            </button>
          </div>
        </div>
      </div>

      {/* Recent invoices table */}
      <div style={card}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: 0 }}>Últimas facturas emitidas</h2>
          <button
            onClick={() => router.push('/historial')}
            style={{ fontSize: 12, color: '#4f46e5', fontWeight: 500, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
          >
            Ver todas →
          </button>
        </div>
        {facturasRecientes.length === 0 ? (
          <p style={{ fontSize: 13, color: '#94a3b8', padding: '12px 0' }}>Aún no hay facturas registradas.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
                {['Folio', 'Cliente', 'RFC', 'Fecha', 'Total', 'Estatus'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '0 12px 10px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {facturasRecientes.map((inv, i) => (
                <tr
                  key={i}
                  style={{ borderBottom: '1px solid #f8fafc', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#f8fafc')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  onClick={() => router.push('/historial')}
                >
                  <td style={{ padding: '11px 12px', fontWeight: 600, color: '#4f46e5', fontSize: 12 }}>{inv.folio}</td>
                  <td style={{ padding: '11px 12px', color: '#0f172a', fontWeight: 500 }}>{inv.cliente}</td>
                  <td style={{ padding: '11px 12px', color: '#64748b', fontFamily: 'monospace', fontSize: 12 }}>{inv.rfc}</td>
                  <td style={{ padding: '11px 12px', color: '#64748b' }}>{new Date(inv.fecha).toLocaleDateString('es-MX')}</td>
                  <td style={{ padding: '11px 12px', fontWeight: 600, color: '#0f172a' }}>{formatMoney(inv.total)}</td>
                  <td style={{ padding: '11px 12px' }}><StatusBadge status={inv.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}

function KpiCard({ label, value, sub, trend, icon, iconBg }: {
  label: string; value: string; sub: string; trend: 'up' | 'down' | 'neutral'
  icon: React.ReactNode; iconBg: string
}) {
  return (
    <div style={card}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <p style={{ fontSize: 11.5, color: '#64748b', margin: '0 0 8px', fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</p>
          <p style={{ fontSize: 26, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.5px', lineHeight: 1 }}>{value}</p>
        </div>
        <div style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          {icon}
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 12 }}>
        {trend === 'up' && <TrendingUp size={12} color="#16a34a" />}
        {trend === 'down' && <TrendingDown size={12} color="#dc2626" />}
        <span style={{ fontSize: 11.5, color: trend === 'up' ? '#16a34a' : trend === 'down' ? '#dc2626' : '#64748b' }}>{sub}</span>
      </div>
    </div>
  )
}

const card: React.CSSProperties = {
  backgroundColor: '#ffffff',
  border: '1px solid #e2e8f0',
  borderRadius: 12,
  padding: '20px 20px',
  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
}

const primaryBtn: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  padding: '9px 14px',
  borderRadius: 8,
  border: 'none',
  cursor: 'pointer',
  backgroundColor: '#4f46e5',
  color: '#ffffff',
  fontSize: 13,
  fontWeight: 600,
  fontFamily: 'Inter, sans-serif',
  marginBottom: 8,
  transition: 'background-color 0.15s',
}

const secondaryBtn: React.CSSProperties = {
  width: '100%',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: '9px 14px',
  borderRadius: 8,
  border: '1px solid #e2e8f0',
  cursor: 'pointer',
  backgroundColor: '#ffffff',
  color: '#475569',
  fontSize: 13,
  fontWeight: 500,
  fontFamily: 'Inter, sans-serif',
  marginBottom: 8,
  transition: 'background-color 0.15s',
}
