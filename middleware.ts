import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl

  // Protected routes
  const protectedPaths = ['/dashboard', '/properties', '/quotes', '/admin', '/gallery', '/jobs']
  const isProtected = protectedPaths.some(p => pathname.startsWith(p))
  const isAuthEntry = pathname.startsWith('/auth/login') || pathname.startsWith('/auth/register')

  // Confine password-recovery sessions to the reset-password page.
  // Clicking an emailed reset link creates a FULL Supabase session — it
  // proves control of the account's email — but that session must only be
  // able to set a new password, never to browse the app or be auto-forwarded
  // into it from the sign-in page. Supabase records the sign-in method in the
  // JWT `amr` claim; a `recovery` entry marks exactly this case. We pay for
  // the claims lookup only on requests that would otherwise grant or forward
  // app access, and fail OPEN (treat as an ordinary session) if the claim
  // can't be read, so a claims hiccup can never lock legitimate users out.
  if (user && (isProtected || isAuthEntry)) {
    try {
      const { data: claimsData } = await supabase.auth.getClaims()
      const amr = claimsData?.claims?.amr as Array<{ method?: string }> | undefined
      if (Array.isArray(amr) && amr.some(entry => entry?.method === 'recovery')) {
        const url = request.nextUrl.clone()
        url.pathname = '/auth/reset-password'
        url.search = ''
        return NextResponse.redirect(url)
      }
    } catch {
      // Fail open — behave as if this were an ordinary session.
    }
  }

  if (isProtected && !user) {
    const url = request.nextUrl.clone()
    url.pathname = '/auth/login'
    url.searchParams.set('redirect', pathname)
    return NextResponse.redirect(url)
  }

  // Admin routes
  if (pathname.startsWith('/admin') && user) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profile?.role !== 'administrator') {
      const url = request.nextUrl.clone()
      url.pathname = '/dashboard'
      return NextResponse.redirect(url)
    }
  }

  // Redirect authenticated users away from auth pages. Deliberately scoped
  // to /auth/login and /auth/register only (not a /auth/* startsWith) —
  // this already excludes /auth/reset-password and /auth/forgot-password,
  // so a recovery-link session (which Supabase issues as a real, signed-in
  // `user`) is never bounced off the reset-password page before the user
  // can set a new password. Keep this narrow if you add more /auth/* pages.
  if (user && isAuthEntry) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
