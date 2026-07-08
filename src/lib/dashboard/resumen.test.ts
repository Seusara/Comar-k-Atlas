import { describe, expect, it } from 'vitest'
import { computeResumen, type FacturaResumenInput } from './resumen'

function factura(overrides: Partial<FacturaResumenInput>): FacturaResumenInput {
  return { fecha: '2026-07-15T12:00:00Z', total: 100, status: 'timbrada', ...overrides }
}

describe('computeResumen', () => {
  const now = new Date('2026-07-20T00:00:00Z')

  it('cuenta facturas timbradas del mes actual y compara contra el mes anterior', () => {
    const facturas = [
      factura({ fecha: '2026-07-05T00:00:00Z', status: 'timbrada' }),
      factura({ fecha: '2026-07-10T00:00:00Z', status: 'timbrada' }),
      factura({ fecha: '2026-07-12T00:00:00Z', status: 'pendiente' }),
      factura({ fecha: '2026-06-20T00:00:00Z', status: 'timbrada' }),
    ]

    const resumen = computeResumen(facturas, now)

    expect(resumen.facturasEmitidas.valor).toBe(2)
    expect(resumen.facturasEmitidas.delta).toBe(1)
    expect(resumen.facturasEmitidas.trend).toBe('up')
  })

  it('suma los ingresos timbrados del mes actual y calcula el cambio porcentual contra el mes anterior', () => {
    const facturas = [
      factura({ fecha: '2026-07-05T00:00:00Z', status: 'timbrada', total: 200 }),
      factura({ fecha: '2026-06-05T00:00:00Z', status: 'timbrada', total: 100 }),
    ]

    const resumen = computeResumen(facturas, now)

    expect(resumen.ingresos.valor).toBe(200)
    expect(resumen.ingresos.deltaPct).toBe(100)
    expect(resumen.ingresos.trend).toBe('up')
  })

  it('deltaPct de ingresos es null si el mes anterior no tuvo ingresos, pero la tendencia sigue siendo up', () => {
    const facturas = [factura({ fecha: '2026-07-05T00:00:00Z', status: 'timbrada', total: 200 })]

    const resumen = computeResumen(facturas, now)

    expect(resumen.ingresos.deltaPct).toBeNull()
    expect(resumen.ingresos.trend).toBe('up')
  })

  it('cuenta todas las facturas pendientes de timbrar sin importar el mes, y suma su total', () => {
    const facturas = [
      factura({ fecha: '2026-07-05T00:00:00Z', status: 'pendiente', total: 50 }),
      factura({ fecha: '2026-01-05T00:00:00Z', status: 'pendiente', total: 75 }),
      factura({ fecha: '2026-07-06T00:00:00Z', status: 'timbrada', total: 999 }),
    ]

    const resumen = computeResumen(facturas, now)

    expect(resumen.pendientes.cantidad).toBe(2)
    expect(resumen.pendientes.totalPendiente).toBe(125)
  })

  it('cuenta solo las facturas canceladas del mes actual', () => {
    const facturas = [
      factura({ fecha: '2026-07-05T00:00:00Z', status: 'cancelada', total: 30 }),
      factura({ fecha: '2026-06-05T00:00:00Z', status: 'cancelada', total: 999 }),
    ]

    const resumen = computeResumen(facturas, now)

    expect(resumen.canceladas.cantidad).toBe(1)
    expect(resumen.canceladas.totalCancelado).toBe(30)
  })

  it('arma la gráfica de los últimos 7 meses con ingresos timbrados, con 0 en meses sin facturas', () => {
    const facturas = [
      factura({ fecha: '2026-07-05T00:00:00Z', status: 'timbrada', total: 100 }),
      factura({ fecha: '2026-05-05T00:00:00Z', status: 'timbrada', total: 50 }),
      factura({ fecha: '2026-05-06T00:00:00Z', status: 'pendiente', total: 999 }),
    ]

    const resumen = computeResumen(facturas, now)

    expect(resumen.chartMensual).toEqual([
      { mes: 'Ene', ingresos: 0 },
      { mes: 'Feb', ingresos: 0 },
      { mes: 'Mar', ingresos: 0 },
      { mes: 'Abr', ingresos: 0 },
      { mes: 'May', ingresos: 50 },
      { mes: 'Jun', ingresos: 0 },
      { mes: 'Jul', ingresos: 100 },
    ])
  })
})
