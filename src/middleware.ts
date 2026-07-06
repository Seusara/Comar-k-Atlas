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

  // NextResponse.redirect() builds a brand-new response object, which does
  // NOT inherit cookies staged onto `response` by the setAll callback above.
  // Since this middleware also redirects already-authenticated users (the
  // role-based branches below), a token refresh from supabase.auth.getUser()
  // can be silently dropped on exactly those redirects. Route every redirect
  // through this helper so refreshed session cookies always propagate.
  function redirectTo(path: string) {
    const redirectResponse = NextResponse.redirect(new URL(path, request.url))
    response.cookies.getAll().forEach(cookie => redirectResponse.cookies.set(cookie))
    return redirectResponse
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  const path = request.nextUrl.pathname

  if (!user) {
    if (PUBLIC_PATHS.includes(path)) return response
    return redirectTo('/login')
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
    // Mirror the empresa branch below: a super-admin is confined to /admin,
    // never /dashboard or any other app route, exactly like an empresa user
    // is confined away from /admin. Without this, a super-admin without a
    // usuarios_empresa row would pass through here to /dashboard and only
    // get caught by the (app) layout's own guard — two layers disagreeing
    // on the rule instead of one rule enforced consistently.
    if (!path.startsWith('/admin')) return redirectTo('/admin')
    return response
  }

  const { data: empresaRow } = await admin
    .from('usuarios_empresa')
    .select('empresa_id')
    .eq('user_id', user.id)
    .maybeSingle()

  if (empresaRow) {
    if (path.startsWith('/admin')) return redirectTo('/dashboard')
    if (path === '/login' || path === '/') return redirectTo('/dashboard')
    return response
  }

  // Authenticated in Supabase Auth but linked to neither super_admins nor
  // usuarios_empresa — treat as invalid for this app.
  return redirectTo('/login')
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
