import type { FacturaStatus } from '@/lib/supabase/database.types'

type Status = FacturaStatus

const config: Record<Status, { label: string; bg: string; color: string; dot: string }> = {
  timbrada: { label: 'Timbrada', bg: '#dcfce7', color: '#15803d', dot: '#16a34a' },
  cancelada: { label: 'Cancelada', bg: '#fee2e2', color: '#b91c1c', dot: '#dc2626' },
  pendiente: { label: 'Pendiente', bg: '#fef9c3', color: '#a16207', dot: '#d97706' },
}

export default function StatusBadge({ status }: { status: Status }) {
  const c = config[status]
  return (
    <span style={{
      display: 'inline-flex',
      alignItems: 'center',
      gap: 5,
      padding: '3px 9px',
      borderRadius: 99,
      backgroundColor: c.bg,
      color: c.color,
      fontSize: 11.5,
      fontWeight: 600,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: c.dot, flexShrink: 0 }} />
      {c.label}
    </span>
  )
}
