import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import Dashboard from './Dashboard'
import type { DashboardResumen } from '@/lib/dashboard/resumen'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

const resumenBase: DashboardResumen = {
  facturasEmitidas: { valor: 3, delta: 1, trend: 'up' },
  ingresos: { valor: 450.5, deltaPct: 20, trend: 'up' },
  pendientes: { cantidad: 2, totalPendiente: 300 },
  canceladas: { cantidad: 1, totalCancelado: 80 },
  chartMensual: [{ mes: 'Jul', ingresos: 450.5 }],
}

describe('Dashboard', () => {
  it('muestra los valores reales recibidos por props, no datos de ejemplo', () => {
    render(
      <Dashboard
        empresaNombre="Mi Empresa Real S.A. de C.V."
        periodo="Julio 2026"
        resumen={resumenBase}
        facturasRecientes={[
          { folio: 'A-0001', cliente: 'Cliente Real', rfc: 'CRE010101AAA', fecha: '2026-07-01T00:00:00Z', total: 450.5, status: 'timbrada' },
        ]}
      />
    )

    expect(screen.getByText(/Mi Empresa Real S.A. de C.V./)).toBeInTheDocument()
    expect(screen.getByText('3')).toBeInTheDocument()
    expect(screen.getByText('Cliente Real')).toBeInTheDocument()
    expect(screen.queryByText(/Empresa Demo/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Grupo Alfa/)).not.toBeInTheDocument()
    expect(screen.queryByText(/Próximo vencimiento/)).not.toBeInTheDocument()
  })

  it('muestra un mensaje cuando no hay facturas recientes', () => {
    render(
      <Dashboard
        empresaNombre="Mi Empresa"
        periodo="Julio 2026"
        resumen={{ ...resumenBase, facturasEmitidas: { valor: 0, delta: 0, trend: 'neutral' } }}
        facturasRecientes={[]}
      />
    )

    expect(screen.getByText('Aún no hay facturas registradas.')).toBeInTheDocument()
  })
})
