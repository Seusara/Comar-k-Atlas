import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { obtenerXml, FacturamaError } from '@/lib/facturama/client'

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { id } = await params

  const { data: factura } = await supabase
    .from('facturas')
    .select('folio, status, facturama_id')
    .eq('id', id)
    .maybeSingle()

  if (!factura || factura.status !== 'timbrada' || !factura.facturama_id) {
    return NextResponse.json({ error: 'No encontrado' }, { status: 404 })
  }

  try {
    const { content, contentType } = await obtenerXml(factura.facturama_id)
    return new NextResponse(new Uint8Array(content), {
      headers: { 'Content-Type': contentType, 'Content-Disposition': `attachment; filename="${factura.folio}.xml"` },
    })
  } catch (err) {
    const message = err instanceof FacturamaError ? err.message : 'Error al descargar el XML'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
