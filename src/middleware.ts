import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import type { Database } from '@/lib/supabase/database.types'
import { createAdminClient } from '@/lib/supabase/admin'

const PUBLIC_PATHS = ['/login']

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  if (!user) {
    if (PUBLIC_PATHS.includes(path)) return response
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // super_admins has RLS enabled with no policy for anon/authenticated roles
  // (see Task 2's patch), so role lookups here must go through the
  // service-role admin client, never the user's own session client.
  const admin = createAdminClient()

  const { data: superAdminRow } = await admin
    .from('super_admins')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (superAdminRow) {
    if (path === '/login' || path === '/') return NextResponse.redirect(new URL('/admin', request.url))
    return response
  }

  const { data: empresaRow } = await admin
    .from('usuarios_empresa')
    .select('empresa_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (empresaRow) {
    if (path.startsWith('/admin')) return NextResponse.redirect(new URL('/dashboard', request.url))
    if (path === '/login' || path === '/') return NextResponse.redirect(new URL('/dashboard', request.url))
    return response
  }

  // Authenticated in Supabase Auth but linked to neither super_admins nor
  // usuarios_empresa — treat as invalid for this app.
  return NextResponse.redirect(new URL('/login', request.url))
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
