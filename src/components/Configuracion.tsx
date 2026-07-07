'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Building2, KeyRound, Bell, FileCheck } from 'lucide-react'

export interface EmpresaConfig {
  nombre: string
  rfcEmisor: string
  csdStatus: 'sin_registrar' | 'registrado'
}

export default function Configuracion({ empresa }: { empresa: EmpresaConfig }) {
  const router = useRouter()
  const [tab, setTab] = useState<'empresa' | 'certificados' | 'notificaciones' | 'cfdi'>('empresa')
  const [cerFile, setCerFile] = useState<File | null>(null)
  const [keyFile, setKeyFile] = useState<File | null>(null)
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resyncing, setResyncing] = useState(false)
  const [csdError, setCsdError] = useState<string | null>(null)

  async function handleRegistrarCsd() {
    if (!cerFile || !keyFile || !password) return
    setSubmitting(true)
    setCsdError(null)

    const formData = new FormData()
    formData.set('cer', cerFile)
    formData.set('key', keyFile)
    formData.set('password', password)

    const res = await fetch('/api/empresas/csd', { method: 'POST', body: formData })

    if (!res.ok) {
      try {
        const body = await res.json()
        setCsdError(body.error ?? 'Error al registrar el CSD')
      } catch {
        setCsdError('Error al registrar el CSD')
      }
      setSubmitting(false)
      return
    }

    setCerFile(null)
    setKeyFile(null)
    setPassword('')
    setSubmitting(false)
    router.refresh()
  }

  async function handleResync() {
    setResyncing(true)
    setCsdError(null)

    const res = await fetch('/api/empresas/csd/resync', { method: 'POST' })

    if (!res.ok) {
      try {
        const body = await res.json()
        setCsdError(body.error ?? 'Error al reintentar el registro')
      } catch {
        setCsdError('Error al reintentar el registro')
      }
      setResyncing(false)
      return
    }

    setResyncing(false)
    router.refresh()
  }

  const [form, setForm] = useState({
    razonSocial: empresa.nombre,
    rfc: empresa.rfcEmisor,
    regimen: '601',
    cp: '06600',
    calle: 'Av. Insurgentes Sur 123',
    colonia: 'Hipódromo',
    ciudad: 'Ciudad de México',
    estado: 'CDMX',
    email: 'facturacion@empresa.com',
    telefono: '55 1234 5678',
  })

  const tabs = [
    { id: 'empresa' as const, label: 'Datos de empresa', icon: Building2 },
    { id: 'certificados' as const, label: 'Certificados (CSD)', icon: KeyRound },
    { id: 'notificaciones' as const, label: 'Notificaciones', icon: Bell },
    { id: 'cfdi' as const, label: 'Config. CFDI', icon: FileCheck },
  ]

  return (
    <div style={{ padding: '32px 36px', maxWidth: 900 }}>
      <div style={{ marginBottom: 24 }}>
        <h1 style={{ fontSize: 22, fontWeight: 700, color: '#0f172a', margin: 0, letterSpacing: '-0.4px' }}>Configuración</h1>
        <p style={{ fontSize: 13.5, color: '#64748b', margin: '4px 0 0' }}>Administra tu cuenta y preferencias del sistema</p>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid #e2e8f0', marginBottom: 24 }}>
        {tabs.map(t => {
          const Icon = t.icon
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '10px 16px',
                border: 'none', background: 'none', cursor: 'pointer',
                fontSize: 13, fontWeight: tab === t.id ? 600 : 400,
                color: tab === t.id ? '#4f46e5' : '#64748b',
                borderBottom: tab === t.id ? '2px solid #4f46e5' : '2px solid transparent',
                marginBottom: -1, fontFamily: 'Inter, sans-serif',
              }}
            >
              <Icon size={14} /> {t.label}
            </button>
          )
        })}
      </div>

      {tab === 'empresa' && (
        <div style={card}>
          <h3 style={sectionTitle}>Datos fiscales</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Razón Social" value={form.razonSocial} onChange={v => setForm(f => ({ ...f, razonSocial: v }))} />
            </div>
            <Field label="RFC" value={form.rfc} onChange={v => setForm(f => ({ ...f, rfc: v }))} mono />
            <div>
              <label style={labelStyle}>Régimen Fiscal</label>
              <select value={form.regimen} onChange={e => setForm(f => ({ ...f, regimen: e.target.value }))} style={inputStyle}>
                <option value="601">601 – Gral. de Ley PF</option>
                <option value="612">612 – Personas Físicas</option>
                <option value="626">626 – Simplificado de confianza</option>
              </select>
            </div>
            <Field label="Código Postal" value={form.cp} onChange={v => setForm(f => ({ ...f, cp: v }))} mono />
            <Field label="Calle y número" value={form.calle} onChange={v => setForm(f => ({ ...f, calle: v }))} />
            <Field label="Colonia" value={form.colonia} onChange={v => setForm(f => ({ ...f, colonia: v }))} />
            <Field label="Ciudad / Municipio" value={form.ciudad} onChange={v => setForm(f => ({ ...f, ciudad: v }))} />
            <Field label="Estado" value={form.estado} onChange={v => setForm(f => ({ ...f, estado: v }))} />
            <Field label="Correo de facturación" value={form.email} onChange={v => setForm(f => ({ ...f, email: v }))} />
            <Field label="Teléfono" value={form.telefono} onChange={v => setForm(f => ({ ...f, telefono: v }))} />
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <button style={primaryBtn}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#4338ca')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#4f46e5')}
            >Guardar cambios</button>
          </div>
        </div>
      )}

      {tab === 'certificados' && (
        <div style={card}>
          <h3 style={sectionTitle}>Certificado de Sello Digital (CSD)</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ padding: '16px', backgroundColor: '#f8fafc', borderRadius: 10, border: '1px solid #e2e8f0' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: '#0f172a', margin: 0 }}>{empresa.nombre} · {empresa.rfcEmisor}</p>
                </div>
                <span style={{
                  padding: '3px 10px', borderRadius: 99, fontSize: 12, fontWeight: 600,
                  backgroundColor: empresa.csdStatus === 'registrado' ? '#dcfce7' : '#f1f5f9',
                  color: empresa.csdStatus === 'registrado' ? '#15803d' : '#64748b',
                }}>
                  {empresa.csdStatus === 'registrado' ? 'Registrado' : 'Sin certificado'}
                </span>
              </div>
            </div>

            {csdError && <p style={{ color: '#dc2626', fontSize: 13, margin: 0 }}>{csdError}</p>}

            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>Carga tus archivos .cer y .key del SAT para habilitar el timbrado de facturas.</p>

            <div>
              <label htmlFor="csd-cer" style={labelStyle}>Archivo .cer</label>
              <input
                id="csd-cer"
                type="file"
                accept=".cer"
                onChange={e => setCerFile(e.target.files?.[0] ?? null)}
                style={inputStyle}
              />
            </div>
            <div>
              <label htmlFor="csd-key" style={labelStyle}>Archivo .key</label>
              <input
                id="csd-key"
                type="file"
                accept=".key"
                onChange={e => setKeyFile(e.target.files?.[0] ?? null)}
                style={inputStyle}
              />
            </div>
            <div>
              <label style={labelStyle}>Contraseña de la llave privada</label>
              <input
                type="password"
                placeholder="Contraseña de la llave privada"
                value={password}
                onChange={e => setPassword(e.target.value)}
                style={inputStyle}
              />
            </div>

            <div style={{ display: 'flex', gap: 10 }}>
              <button
                onClick={handleRegistrarCsd}
                disabled={!cerFile || !keyFile || !password || submitting}
                style={{ ...primaryBtn, opacity: (!cerFile || !keyFile || !password || submitting) ? 0.6 : 1 }}
              >
                {submitting ? 'Registrando…' : 'Registrar CSD'}
              </button>
              {empresa.csdStatus === 'registrado' && (
                <button onClick={handleResync} disabled={resyncing} style={{ ...secondaryBtn, opacity: resyncing ? 0.6 : 1 }}>
                  {resyncing ? 'Reintentando…' : 'Reintentar registro'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === 'notificaciones' && (
        <div style={card}>
          <h3 style={sectionTitle}>Preferencias de notificación</h3>
          {[
            { label: 'Confirmación de timbrado', desc: 'Recibe un correo cuando una factura se timbre correctamente' },
            { label: 'Facturas por vencer', desc: 'Alerta 3 días antes del vencimiento de facturas pendientes' },
            { label: 'Resumen semanal', desc: 'Reporte de actividad cada lunes por la mañana' },
            { label: 'Alertas de cancelación', desc: 'Notificación cuando un cliente cancela una factura' },
          ].map(n => (
            <ToggleRow key={n.label} label={n.label} desc={n.desc} />
          ))}
        </div>
      )}

      {tab === 'cfdi' && (
        <div style={card}>
          <h3 style={sectionTitle}>Configuración predeterminada de CFDI</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={labelStyle}>Serie predeterminada</label>
              <input defaultValue="A" style={inputStyle} />
            </div>
            <div>
              <label style={labelStyle}>Folio inicial</label>
              <input defaultValue="00001" style={{ ...inputStyle, fontFamily: 'monospace' }} />
            </div>
            <div>
              <label style={labelStyle}>Forma de pago default</label>
              <select style={inputStyle}>
                <option>03 – Transferencia bancaria</option>
                <option>01 – Efectivo</option>
                <option>99 – Por definir</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>Método de pago default</label>
              <select style={inputStyle}>
                <option>PUE – Pago en una exhibición</option>
                <option>PPD – Pago en parcialidades</option>
              </select>
            </div>
          </div>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 20 }}>
            <button style={primaryBtn}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#4338ca')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = '#4f46e5')}
            >Guardar preferencias</button>
          </div>
        </div>
      )}
    </div>
  )
}

function Field({ label, value, onChange, mono }: { label: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <div>
      <label style={labelStyle}>{label}</label>
      <input value={value} onChange={e => onChange(e.target.value)} style={{ ...inputStyle, fontFamily: mono ? 'monospace' : 'Inter, sans-serif' }} />
    </div>
  )
}

function ToggleRow({ label, desc }: { label: string; desc: string }) {
  const [on, setOn] = useState(true)
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '14px 0', borderBottom: '1px solid #f1f5f9' }}>
      <div>
        <p style={{ fontSize: 13, fontWeight: 500, color: '#0f172a', margin: 0 }}>{label}</p>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '2px 0 0' }}>{desc}</p>
      </div>
      <button
        onClick={() => setOn(v => !v)}
        style={{
          width: 40, height: 22, borderRadius: 11, border: 'none', cursor: 'pointer',
          backgroundColor: on ? '#4f46e5' : '#e2e8f0', position: 'relative', flexShrink: 0,
          transition: 'background-color 0.2s',
        }}
      >
        <span style={{
          position: 'absolute', top: 3, left: on ? 21 : 3, width: 16, height: 16,
          borderRadius: '50%', backgroundColor: '#fff', transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)',
        }} />
      </button>
    </div>
  )
}

const card: React.CSSProperties = { backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: 12, padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }
const sectionTitle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: '#0f172a', margin: '0 0 18px', textTransform: 'uppercase', letterSpacing: '0.06em' }
const inputStyle: React.CSSProperties = { width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #e2e8f0', fontSize: 13, color: '#0f172a', outline: 'none', fontFamily: 'Inter, sans-serif', backgroundColor: '#fff', boxSizing: 'border-box' }
const labelStyle: React.CSSProperties = { fontSize: 12, fontWeight: 500, color: '#64748b', display: 'block', marginBottom: 4 }
const primaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '9px 18px', borderRadius: 8, border: 'none', cursor: 'pointer', backgroundColor: '#4f46e5', color: '#ffffff', fontSize: 13, fontWeight: 600, fontFamily: 'Inter, sans-serif', transition: 'background-color 0.15s' }
const secondaryBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '9px 16px', borderRadius: 8, border: '1px solid #e2e8f0', cursor: 'pointer', backgroundColor: '#ffffff', color: '#475569', fontSize: 13, fontWeight: 500, fontFamily: 'Inter, sans-serif' }
