import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { cancelarTimbrado, type MotivoCancelacion } from '@/lib/facturas/cancelar-timbrado'

const MOTIVOS_VALIDOS: MotivoCancelacion[] = ['01', '02', '03', '04']

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 })
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 })
  }

  const { motivo, uuidSustitucion } = body as Record<string, unknown>

  if (typeof motivo !== 'string' || !MOTIVOS_VALIDOS.includes(motivo as MotivoCancelacion)) {
    return NextResponse.json({ error: 'Motivo inválido' }, { status: 400 })
  }

  if (motivo === '01' && (typeof uuidSustitucion !== 'string' || !uuidSustitucion)) {
    return NextResponse.json({ error: 'El motivo 01 requiere un UUID de sustitución' }, { status: 400 })
  }

  const { id } = await params
  const result = await cancelarTimbrado(
    supabase,
    id,
    motivo as MotivoCancelacion,
    typeof uuidSustitucion === 'string' ? uuidSustitucion : undefined,
  )

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 409 })
  }

  return NextResponse.json({ ok: true })
}
