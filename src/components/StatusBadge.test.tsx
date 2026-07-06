import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import StatusBadge from './StatusBadge'
import type { FacturaStatus } from '@/lib/supabase/database.types'

describe('StatusBadge', () => {
  const cases: { status: FacturaStatus; label: string }[] = [
    { status: 'timbrada', label: 'Timbrada' },
    { status: 'cancelada', label: 'Cancelada' },
    { status: 'pendiente', label: 'Pendiente' },
  ]

  it.each(cases)('renders the correct label for status "$status"', ({ status, label }) => {
    render(<StatusBadge status={status} />)
    expect(screen.getByText(label)).toBeInTheDocument()
  })
})
