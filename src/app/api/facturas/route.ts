import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseRequiredStrings } from '@/lib/validation'
import type { Json } from '@/lib/supabase/database.types'

interface ConceptoPayload {
  clave_sat: string
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
      typeof c.descripcion !== 'string' || !c.descripcion ||
      typeof c.cantidad !== 'number' || !Number.isFinite(c.cantidad) ||
      typeof c.precioUnitario !== 'number' || !Number.isFinite(c.precioUnitario) ||
      typeof c.iva !== 'number' || !Number.isFinite(c.iva)
    ) {
      return null
    }
    parsed.push({
      clave_sat: c.claveSat,
      descripcion: c.descripcion,
      cantidad: c.cantidad,
      precio_unitario: c.precioUnitario,
      iva: c.iva,
    })
  }
  return parsed
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

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

  const parsedClienteId = parseRequiredStrings(body, ['clienteId'])
  if ('error' in parsedClienteId) {
    return NextResponse.json({ error: parsedClienteId.error }, { status: 400 })
  }

  const { conceptos } = body as Record<string, unknown>

  const conceptosParsed = parseConceptos(conceptos)
  if (!conceptosParsed) {
    return NextResponse.json({ error: 'La factura debe tener al menos un concepto válido' }, { status: 400 })
  }

  const { data, error } = await supabase.rpc('crear_factura', {
    p_cliente_id: parsedClienteId.data.clienteId,
    // ConceptoPayload is a plain interface (no index signature), so it isn't
    // structurally assignable to Json even though it's genuinely JSON-shaped —
    // this cast is the standard, safe way to bridge that TS limitation.
    p_conceptos: conceptosParsed as unknown as Json,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ factura: data }, { status: 201 })
}
