import { describe, expect, it } from 'vitest'
import { computeReportes, type ReporteFacturaInput } from './resumen'

function factura(overrides: Partial<ReporteFacturaInput>): ReporteFacturaInput {
  return { fecha: '2026-03-15T12:00:00Z', total: 100, status: 'timbrada', ...overrides }
}

describe('computeReportes', () => {
  const now = new Date('2026-03-20T00:00:00Z') // marzo: año en curso cubre Ene-Feb-Mar (3 meses)

  it('suma los ingresos acumulados del año en curso solo de facturas timbradas', () => {
    const facturas = [
      factura({ fecha: '2026-01-10T00:00:00Z', status: 'timbrada', total: 100 }),
      factura({ fecha: '2026-02-10T00:00:00Z', status: 'timbrada', total: 200 }),
      factura({ fecha: '2026-02-11T00:00:00Z', status: 'pendiente', total: 999 }),
      factura({ fecha: '2025-12-31T00:00:00Z', status: 'timbrada', total: 999 }),
    ]

    const resumen = computeReportes(facturas, now)

    expect(resumen.ingresosAcumulados).toBe(300)
  })

  it('cuenta las facturas emitidas (timbradas) del año en curso', () => {
    const facturas = [
      factura({ fecha: '2026-01-10T00:00:00Z', status: 'timbrada' }),
      factura({ fecha: '2026-02-10T00:00:00Z', status: 'timbrada' }),
      factura({ fecha: '2026-02-11T00:00:00Z', status: 'cancelada' }),
    ]

    const resumen = computeReportes(facturas, now)

    expect(resumen.facturasEmitidas).toBe(2)
  })

  it('calcula el promedio mensual de ingresos y facturas dividiendo entre los meses transcurridos', () => {
    const facturas = [
      factura({ fecha: '2026-01-10T00:00:00Z', status: 'timbrada', total: 300 }),
      factura({ fecha: '2026-02-10T00:00:00Z', status: 'timbrada', total: 300 }),
      factura({ fecha: '2026-03-10T00:00:00Z', status: 'timbrada', total: 300 }),
    ]

    const resumen = computeReportes(facturas, now)

    expect(resumen.promedioMensualIngresos).toBe(300)
    expect(resumen.promedioMensualFacturas).toBe(1)
  })

  it('arma las barras mensuales de enero al mes actual con ingresos y conteo de facturas timbradas, 0 en meses sin datos', () => {
    const facturas = [
      factura({ fecha: '2026-01-10T00:00:00Z', status: 'timbrada', total: 100 }),
      factura({ fecha: '2026-03-05T00:00:00Z', status: 'timbrada', total: 50 }),
      factura({ fecha: '2026-03-06T00:00:00Z', status: 'pendiente', total: 999 }),
    ]

    const resumen = computeReportes(facturas, now)

    expect(resumen.barMensual).toEqual([
      { mes: 'Ene', ingresos: 100, facturas: 1 },
      { mes: 'Feb', ingresos: 0, facturas: 0 },
      { mes: 'Mar', ingresos: 50, facturas: 1 },
    ])
  })

  it('cuenta las facturas por estatus dentro del año en curso, ignorando años anteriores', () => {
    const facturas = [
      factura({ fecha: '2026-01-10T00:00:00Z', status: 'timbrada' }),
      factura({ fecha: '2026-02-10T00:00:00Z', status: 'timbrada' }),
      factura({ fecha: '2026-02-11T00:00:00Z', status: 'pendiente' }),
      factura({ fecha: '2026-03-01T00:00:00Z', status: 'cancelada' }),
      factura({ fecha: '2025-06-01T00:00:00Z', status: 'timbrada' }),
    ]

    const resumen = computeReportes(facturas, now)

    expect(resumen.estadoFacturas).toEqual([
      { status: 'timbrada', label: 'Timbradas', value: 2 },
      { status: 'pendiente', label: 'Pendientes', value: 1 },
      { status: 'cancelada', label: 'Canceladas', value: 1 },
    ])
  })
})
