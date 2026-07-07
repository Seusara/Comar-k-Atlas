import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { intentarTimbrado } from '@/lib/facturas/intentar-timbrado'

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { id } = await params

  const { data: facturaAntes } = await supabase.from('facturas').select('status').eq('id', id).maybeSingle()
  if (!facturaAntes || facturaAntes.status !== 'pendiente') {
    return NextResponse.json({ error: 'La factura no existe o ya no está pendiente' }, { status: 409 })
  }

  await intentarTimbrado(supabase, id)

  const { data: factura, error } = await supabase
    .from('facturas')
    .select('id, status, uuid_fiscal, error_timbrado')
    .eq('id', id)
    .single()

  if (error || !factura) {
    return NextResponse.json({ error: 'No se pudo recargar la factura' }, { status: 400 })
  }

  return NextResponse.json({ factura })
}
