import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseRequiredStrings } from '@/lib/validation'
import { intentarTimbrado } from '@/lib/facturas/intentar-timbrado'
import type { Json } from '@/lib/supabase/database.types'

interface ConceptoPayload {
  clave_sat: string
  clave_unidad: string
  descripcion: string
  cantidad: number
  precio_unitario: number
  iva: number
}

function parseConceptos(value: unknown): ConceptoPayload[] | null {
  if (!Array.isArray(value) || value.length === 0) return null

  const parsed: ConceptoPayload[] = []
  for (const item of value) {
    if (typeof item !== 'object' || item === null) return null
    const c = item as Record<string, unknown>
    if (
      typeof c.claveSat !== 'string' || !c.claveSat ||
      typeof c.claveUnidad !== 'string' || !c.claveUnidad ||
      typeof c.descripcion !== 'string' || !c.descripcion ||
      typeof c.cantidad !== 'number' || !Number.isFinite(c.cantidad) ||
      typeof c.precioUnitario !== 'number' || !Number.isFinite(c.precioUnitario) ||
      typeof c.iva !== 'number' || !Number.isFinite(c.iva)
    ) {
      return null
    }
    parsed.push({
      clave_sat: c.claveSat,
      clave_unidad: c.claveUnidad,
      descripcion: c.descripcion,
      cantidad: c.cantidad,
      precio_unitario: c.precioUnitario,
      iva: c.iva,
    })
  }
  return parsed
}

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('facturas')
    .select('id, folio, uuid_fiscal, fecha, total, status, cliente_id, error_timbrado')
    .order('fecha', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ facturas: data })
}

export async function POST(request: NextRequest) {
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

  const parsedStrings = parseRequiredStrings(body, ['clienteId', 'formaPago', 'metodoPago'])
  if ('error' in parsedStrings) {
    return NextResponse.json({ error: parsedStrings.error }, { status: 400 })
  }

  const { conceptos } = body as Record<string, unknown>

  const conceptosParsed = parseConceptos(conceptos)
  if (!conceptosParsed) {
    return NextResponse.json({ error: 'La factura debe tener al menos un concepto válido' }, { status: 400 })
  }

  const { data: facturaCreada, error: crearError } = await supabase.rpc('crear_factura', {
    p_cliente_id: parsedStrings.data.clienteId,
    p_conceptos: conceptosParsed as unknown as Json,
    p_forma_pago: parsedStrings.data.formaPago,
    p_metodo_pago: parsedStrings.data.metodoPago,
  })

  if (crearError || !facturaCreada) {
    return NextResponse.json({ error: crearError?.message ?? 'No se pudo crear la factura' }, { status: 400 })
  }

  await intentarTimbrado(supabase, facturaCreada.id)

  const { data: factura, error: reloadError } = await supabase
    .from('facturas')
    .select('id, folio, uuid_fiscal, status, error_timbrado')
    .eq('id', facturaCreada.id)
    .single()

  if (reloadError || !factura) {
    return NextResponse.json({ error: 'No se pudo recargar la factura' }, { status: 400 })
  }

  return NextResponse.json({ factura }, { status: 201 })
}
