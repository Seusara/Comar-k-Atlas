'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'
import type { ReportesResumen } from '@/lib/reportes/resumen'

export interface ReportesProps {
  periodo: string
  resumen: ReportesResumen
}

const COLORS = ['#4f46e5', '#d97706', '#dc2626']

export default function Reportes({ periodo, resumen }: ReportesProps) {
  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>Reportes</h1>
        <p style={{ fontSize: 13.5, color: '#64748b', margin: '4px 0 0' }}>{periodo}</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={card}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Ingresos acumulados</p>
          <p style={{ fontSize: 30, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>
            ${resumen.ingresosAcumulados.toLocaleString('es-MX')}
          </p>
          <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>MXN · {resumen.facturasEmitidas} facturas emitidas</p>
        </div>
        <div style={card}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Promedio mensual</p>
          <p style={{ fontSize: 30, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>
            ${Math.round(resumen.promedioMensualIngresos).toLocaleString('es-MX')}
          </p>
          <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>Por mes · ~{Math.round(resumen.promedioMensualFacturas)} facturas</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 18px' }}>Ingresos y volumen por mes</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={resumen.barMensual} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={(v, name) => [
                  name === 'ingresos' ? `$${Number(v).toLocaleString('es-MX')}` : v,
                  name === 'ingresos' ? 'Ingresos' : 'Facturas',
                ]}
              />
              <Bar dataKey="ingresos" fill="#4f46e5" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 18px' }}>Estado de facturas</h3>
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie data={resumen.estadoFacturas} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {resumen.estadoFacturas.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {resumen.estadoFacturas.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: COLORS[i], flexShrink: 0 }} />
                  <span style={{ color: '#64748b' }}>{d.label}</span>
                </div>
                <span style={{ fontWeight: 600, color: '#0f172a' }}>{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

const card: React.CSSProperties = { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }
