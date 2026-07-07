import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { id } = await params

  const { data, error } = await supabase
    .from('facturas')
    .update({ status: 'cancelada' })
    .eq('id', id)
    .eq('status', 'pendiente')
    .select('id, status')
    .maybeSingle()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 })
  }

  if (!data) {
    return NextResponse.json({ error: 'La factura no existe o ya no está pendiente' }, { status: 409 })
  }

  return NextResponse.json({ factura: data })
}
