'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Legend } from 'recharts'

const barData = [
  { mes: 'Ene', ingresos: 142000, facturas: 18 },
  { mes: 'Feb', ingresos: 168000, facturas: 22 },
  { mes: 'Mar', ingresos: 195000, facturas: 27 },
  { mes: 'Abr', ingresos: 178000, facturas: 25 },
  { mes: 'May', ingresos: 223000, facturas: 31 },
  { mes: 'Jun', ingresos: 198000, facturas: 28 },
  { mes: 'Jul', ingresos: 241000, facturas: 47 },
]

const pieData = [
  { name: 'Timbradas', value: 38 },
  { name: 'Pendientes', value: 9 },
  { name: 'Canceladas', value: 3 },
]
const COLORS = ['#4f46e5', '#d97706', '#dc2626']

export default function Reportes() {
  const totalAnual = barData.reduce((a, d) => a + d.ingresos, 0)
  const totalFacturas = barData.reduce((a, d) => a + d.facturas, 0)

  return (
    <div style={{ padding: '32px 36px', maxWidth: 1100 }}>
      <div style={{ marginBottom: 28 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>Reportes</h1>
        <p style={{ fontSize: 13.5, color: '#64748b', margin: '4px 0 0' }}>Enero – Julio 2025</p>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
        <div style={card}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Ingresos acumulados 2025</p>
          <p style={{ fontSize: 30, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>
            ${totalAnual.toLocaleString('es-MX')}
          </p>
          <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>MXN · {totalFacturas} facturas emitidas</p>
        </div>
        <div style={card}>
          <p style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 4px' }}>Promedio mensual</p>
          <p style={{ fontSize: 30, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.5px' }}>
            ${Math.round(totalAnual / 7).toLocaleString('es-MX')}
          </p>
          <p style={{ fontSize: 12, color: '#64748b', margin: '4px 0 0' }}>Por mes · ~{Math.round(totalFacturas / 7)} facturas</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
        <div style={card}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#0f172a', margin: '0 0 18px' }}>Ingresos y volumen por mes</h3>
          <ResponsiveContainer width="100%" height={240}>
            <BarChart data={barData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
              <XAxis dataKey="mes" tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v / 1000).toFixed(0)}k`} />
              <Tooltip
                contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }}
                formatter={(v: number, name: string) => [
                  name === 'ingresos' ? `$${v.toLocaleString('es-MX')}` : v,
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
              <Pie data={pieData} cx="50%" cy="50%" innerRadius={50} outerRadius={80} paddingAngle={3} dataKey="value">
                {pieData.map((_, i) => <Cell key={i} fill={COLORS[i]} />)}
              </Pie>
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
              <Tooltip contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e2e8f0' }} />
            </PieChart>
          </ResponsiveContainer>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {pieData.map((d, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: COLORS[i], flexShrink: 0 }} />
                  <span style={{ color: '#64748b' }}>{d.name}</span>
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
