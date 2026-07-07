import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { parseRequiredStrings, parseRequiredNumbers } from '@/lib/validation'

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

  const strings = parseRequiredStrings(body, ['claveSat', 'claveUnidad', 'nombre'])
  if ('error' in strings) {
    return NextResponse.json({ error: strings.error }, { status: 400 })
  }

  const numbers = parseRequiredNumbers(body, ['precio', 'iva'])
  if ('error' in numbers) {
    return NextResponse.json({ error: numbers.error }, { status: 400 })
  }

  const { id } = await params

  const { data, error } = await supabase
    .from('productos')
    .update({
      clave_sat: strings.data.claveSat,
      clave_unidad: strings.data.claveUnidad,
      nombre: strings.data.nombre,
      precio: numbers.data.precio,
      iva: numbers.data.iva,
    })
    .eq('id', id)
    .select('id, clave_sat, clave_unidad, nombre, precio, iva, creado_en')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ producto: data })
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

  const { data, error } = await supabase.from('productos').delete().eq('id', id).select('id').maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (!data) {
    return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 })
  }

  return NextResponse.json({ success: true })
}
