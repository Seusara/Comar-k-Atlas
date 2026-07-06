import { createAdminClient } from '@/lib/supabase/admin'

export default async function AdminPage() {
  const admin = createAdminClient()
  const { data: empresas, error } = await admin
    .from('empresas')
    .select('id, nombre, rfc_emisor, creada_en')
    .order('creada_en', { ascending: false })

  if (error) {
    return <p style={{ color: '#dc2626', fontSize: 13 }}>Error al cargar empresas: {error.message}</p>
  }

  return (
    <div>
      <h2 style={{ fontSize: 15, fontWeight: 600, color: '#0f172a', margin: '0 0 16px' }}>
        Empresas registradas ({empresas?.length ?? 0})
      </h2>
      <div style={{ backgroundColor: '#fff', border: '1px solid #e2e8f0', borderRadius: 12, overflow: 'hidden' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #f1f5f9' }}>
              {['Nombre', 'RFC emisor', 'Alta'].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {(empresas ?? []).map(e => (
              <tr key={e.id} style={{ borderBottom: '1px solid #f8fafc' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600, color: '#0f172a' }}>{e.nombre}</td>
                <td style={{ padding: '12px 16px', fontFamily: 'monospace', color: '#475569' }}>{e.rfc_emisor}</td>
                <td style={{ padding: '12px 16px', color: '#64748b' }}>{new Date(e.creada_en).toLocaleDateString('es-MX')}</td>
              </tr>
            ))}
            {(empresas ?? []).length === 0 && (
              <tr>
                <td colSpan={3} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                  Sin empresas registradas todavía
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
