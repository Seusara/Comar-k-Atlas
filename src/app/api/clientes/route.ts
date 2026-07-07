import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseRequiredStrings } from '@/lib/validation'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('clientes')
    .select('id, nombre, rfc, regimen_fiscal, codigo_postal, uso_cfdi, creado_en')
    .order('creado_en', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ clientes: data })
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

  const parsed = parseRequiredStrings(body, ['nombre', 'rfc', 'regimenFiscal', 'codigoPostal', 'usoCfdi'])
  if ('error' in parsed) {
    return NextResponse.json({ error: parsed.error }, { status: 400 })
  }

  const { data: empresaRow } = await supabase
    .from('usuarios_empresa')
    .select('empresa_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!empresaRow) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  const { data, error } = await supabase
    .from('clientes')
    .insert({
      empresa_id: empresaRow.empresa_id,
      nombre: parsed.data.nombre,
      rfc: parsed.data.rfc,
      regimen_fiscal: parsed.data.regimenFiscal,
      codigo_postal: parsed.data.codigoPostal,
      uso_cfdi: parsed.data.usoCfdi,
    })
    .select('id, nombre, rfc, regimen_fiscal, codigo_postal, uso_cfdi, creado_en')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ cliente: data }, { status: 201 })
}
