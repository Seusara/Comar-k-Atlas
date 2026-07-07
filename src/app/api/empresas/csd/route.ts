import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { registrarCsd } from '@/lib/csd/registrar-csd'

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  const { data: empresaRow } = await supabase
    .from('usuarios_empresa')
    .select('empresa_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (!empresaRow) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Cuerpo de la solicitud inválido' }, { status: 400 })
  }

  const cer = formData.get('cer')
  const key = formData.get('key')
  const password = formData.get('password')

  if (!(cer instanceof File) || !(key instanceof File) || typeof password !== 'string' || !password) {
    return NextResponse.json({ error: 'Se requieren los archivos .cer, .key y la contraseña' }, { status: 400 })
  }

  const cerBuffer = Buffer.from(await cer.arrayBuffer())
  const keyBuffer = Buffer.from(await key.arrayBuffer())

  const admin = createAdminClient()
  const result = await registrarCsd(admin, { empresaId: empresaRow.empresa_id, cerBuffer, keyBuffer, password })

  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
