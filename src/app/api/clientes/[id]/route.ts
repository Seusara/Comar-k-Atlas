import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseRequiredStrings } from '@/lib/validation'

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const parsed = parseRequiredStrings(body, ['nombre', 'rfc', 'regimenFiscal', 'codigoPostal', 'usoCfdi'])
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const { id } = await params

  const { data, error } = await supabase
    .from('clientes')
    .update({
      nombre: parsed.data.nombre,
      rfc: parsed.data.rfc,
      regimen_fiscal: parsed.data.regimenFiscal,
      codigo_postal: parsed.data.codigoPostal,
      uso_cfdi: parsed.data.usoCfdi,
    })
    .eq('id', id)
    .select('id, nombre, rfc, regimen_fiscal, codigo_postal, uso_cfdi, creado_en')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ cliente: data })
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { id } = await params

  const { data, error } = await supabase.from('clientes').delete().eq('id', id).select('id').maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Cliente no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
