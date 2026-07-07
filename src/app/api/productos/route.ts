import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseRequiredStrings, parseRequiredNumbers } from '@/lib/validation'

export async function GET() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data, error } = await supabase
    .from('productos')
    .select('id, clave_sat, clave_unidad, nombre, precio, iva, creado_en')
    .order('creado_en', { ascending: false })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ productos: data })
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

  const strings = parseRequiredStrings(body, ['claveSat', 'claveUnidad', 'nombre'])
  if ('error' in strings) {
    return NextResponse.json({ error: strings.error }, { status: 400 })
  }

  const numbers = parseRequiredNumbers(body, ['precio', 'iva'])
  if ('error' in numbers) {
    return NextResponse.json({ error: numbers.error }, { status: 400 })
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
    .from('productos')
    .insert({
      empresa_id: empresaRow.empresa_id,
      clave_sat: strings.data.claveSat,
      clave_unidad: strings.data.claveUnidad,
      nombre: strings.data.nombre,
      precio: numbers.data.precio,
      iva: numbers.data.iva,
    })
    .select('id, clave_sat, clave_unidad, nombre, precio, iva, creado_en')
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  return NextResponse.json({ producto: data }, { status: 201 })
}
