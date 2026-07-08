import type { FacturaStatus } from '@/lib/supabase/database.types'

export interface ReporteFacturaInput {
  fecha: string
  total: number
  status: FacturaStatus
}

export interface ReportesResumen {
  ingresosAcumulados: number
  facturasEmitidas: number
  promedioMensualIngresos: number
  promedioMensualFacturas: number
  barMensual: Array<{ mes: string; ingresos: number; facturas: number }>
  estadoFacturas: Array<{ status: FacturaStatus; label: string; value: number }>
}

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const ESTATUS_LABELS: Record<FacturaStatus, string> = { timbrada: 'Timbradas', pendiente: 'Pendientes', cancelada: 'Canceladas' }

export function computeReportes(facturas: ReporteFacturaInput[], now: Date): ReportesResumen {
  const anioActual = now.getUTCFullYear()
  const mesActual = now.getUTCMonth()
  const mesesTranscurridos = mesActual + 1

  const facturasDelAnio = facturas.filter(f => new Date(f.fecha).getUTCFullYear() === anioActual)

  let ingresosAcumulados = 0
  let facturasEmitidas = 0
  const conteoPorMes = Array.from({ length: mesesTranscurridos }, () => ({ ingresos: 0, facturas: 0 }))
  const conteoPorStatus: Record<FacturaStatus, number> = { timbrada: 0, pendiente: 0, cancelada: 0 }

  for (const f of facturasDelAnio) {
    conteoPorStatus[f.status]++

    if (f.status !== 'timbrada') continue

    ingresosAcumulados += f.total
    facturasEmitidas++

    const mes = new Date(f.fecha).getUTCMonth()
    if (mes < mesesTranscurridos) {
      conteoPorMes[mes].ingresos += f.total
      conteoPorMes[mes].facturas++
    }
  }

  return {
    ingresosAcumulados,
    facturasEmitidas,
    promedioMensualIngresos: ingresosAcumulados / mesesTranscurridos,
    promedioMensualFacturas: facturasEmitidas / mesesTranscurridos,
    barMensual: conteoPorMes.map((c, i) => ({ mes: MESES[i], ingresos: c.ingresos, facturas: c.facturas })),
    estadoFacturas: (['timbrada', 'pendiente', 'cancelada'] as const).map(status => ({
      status, label: ESTATUS_LABELS[status], value: conteoPorStatus[status],
    })),
  }
}
