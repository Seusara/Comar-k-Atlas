import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import Reportes from './Reportes'
import type { ReportesResumen } from '@/lib/reportes/resumen'

const resumenBase: ReportesResumen = {
  ingresosAcumulados: 12345,
  facturasEmitidas: 7,
  promedioMensualIngresos: 4115,
  promedioMensualFacturas: 2.33,
  barMensual: [{ mes: 'Ene', ingresos: 12345, facturas: 7 }],
  estadoFacturas: [
    { status: 'timbrada', label: 'Timbradas', value: 7 },
    { status: 'pendiente', label: 'Pendientes', value: 2 },
    { status: 'cancelada', label: 'Canceladas', value: 1 },
  ],
}

describe('Reportes', () => {
  it('muestra los valores reales recibidos por props, no datos de ejemplo', () => {
    render(<Reportes periodo="Enero – Marzo 2026" resumen={resumenBase} />)

    expect(screen.getByText('Enero – Marzo 2026')).toBeInTheDocument()
    expect(screen.getByText('$12,345')).toBeInTheDocument()
    expect(screen.getByText(/7 facturas emitidas/)).toBeInTheDocument()
    expect(screen.getByText('Timbradas')).toBeInTheDocument()
    expect(screen.queryByText(/2025/)).not.toBeInTheDocument()
  })
})
