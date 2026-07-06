import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { crearEmpresa } from '@/lib/empresas/crear-empresa'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const admin = createAdminClient()
  const { data: superAdminRow } = await admin
    .from('super_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!superAdminRow) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
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

  const { nombre, rfcEmisor, regimenFiscal, cpEmisor, email, password } = body as Record<string, unknown>

  if (
    typeof nombre !== 'string' || !nombre ||
    typeof rfcEmisor !== 'string' || !rfcEmisor ||
    typeof regimenFiscal !== 'string' || !regimenFiscal ||
    typeof cpEmisor !== 'string' || !cpEmisor ||
    typeof email !== 'string' || !email ||
    typeof password !== 'string' || !password
  ) {
    return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
  }

  const result = await crearEmpresa(admin, { nombre, rfcEmisor, regimenFiscal, cpEmisor, email, password })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ empresaId: result.empresaId }, { status: 201 })
}
