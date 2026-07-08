import type { FacturaStatus } from '@/lib/supabase/database.types'

export interface FacturaResumenInput {
  fecha: string
  total: number
  status: FacturaStatus
}

export interface DashboardResumen {
  facturasEmitidas: { valor: number; delta: number; trend: 'up' | 'down' | 'neutral' }
  ingresos: { valor: number; deltaPct: number | null; trend: 'up' | 'down' | 'neutral' }
  pendientes: { cantidad: number; totalPendiente: number }
  canceladas: { cantidad: number; totalCancelado: number }
  chartMensual: Array<{ mes: string; ingresos: number }>
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${date.getUTCMonth()}`
}

function trendFromComparison(current: number, previous: number): 'up' | 'down' | 'neutral' {
  if (current > previous) return 'up'
  if (current < previous) return 'down'
  return 'neutral'
}

export function computeResumen(facturas: FacturaResumenInput[], now: Date): DashboardResumen {
  const mesActual = monthKey(now)
  const mesAnterior = monthKey(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)))

  let facturasEmitidasActual = 0
  let facturasEmitidasAnterior = 0
  let ingresosActual = 0
  let ingresosAnterior = 0
  let pendientesCantidad = 0
  let pendientesTotal = 0
  let canceladasCantidad = 0
  let canceladasTotal = 0

  for (const f of facturas) {
    const key = monthKey(new Date(f.fecha))

    if (f.status === 'timbrada' && key === mesActual) {
      facturasEmitidasActual++
      ingresosActual += f.total
    }
    if (f.status === 'timbrada' && key === mesAnterior) {
      facturasEmitidasAnterior++
      ingresosAnterior += f.total
    }
    if (f.status === 'pendiente') {
      pendientesCantidad++
      pendientesTotal += f.total
    }
    if (f.status === 'cancelada' && key === mesActual) {
      canceladasCantidad++
      canceladasTotal += f.total
    }
  }

  const chartBuckets = new Map<string, number>()
  const chartMeses: Array<{ key: string; mes: string }> = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = monthKey(d)
    chartMeses.push({ key, mes: MESES[d.getUTCMonth()] })
    chartBuckets.set(key, 0)
  }
  for (const f of facturas) {
    if (f.status !== 'timbrada') continue
    const key = monthKey(new Date(f.fecha))
    if (chartBuckets.has(key)) {
      chartBuckets.set(key, chartBuckets.get(key)! + f.total)
    }
  }

  return {
    facturasEmitidas: {
      valor: facturasEmitidasActual,
      delta: facturasEmitidasActual - facturasEmitidasAnterior,
      trend: trendFromComparison(facturasEmitidasActual, facturasEmitidasAnterior),
    },
    ingresos: {
      valor: ingresosActual,
      deltaPct: ingresosAnterior === 0 ? null : ((ingresosActual - ingresosAnterior) / ingresosAnterior) * 100,
      trend: trendFromComparison(ingresosActual, ingresosAnterior),
    },
    pendientes: { cantidad: pendientesCantidad, totalPendiente: pendientesTotal },
    canceladas: { cantidad: canceladasCantidad, totalCancelado: canceladasTotal },
    chartMensual: chartMeses.map(({ key, mes }) => ({ mes, ingresos: chartBuckets.get(key)! })),
  }
}
