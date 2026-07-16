import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * OAuth / magic-link callback. Supabase redirects here after the provider
 * (e.g. Google) finishes, appending either a `?code=` to exchange for a
 * session, or `?error=`/`?error_description=` when the flow failed —
 * provider not enabled, redirect-URI mismatch, or the user cancelling.
 *
 * The error path must be surfaced rather than silently redirected onward:
 * previously any failure fell through to `/dashboard`, where middleware
 * bounces an unauthenticated user straight back to `/auth/login` with no
 * message — the classic "sign-in is just broken" symptom. We now send the
 * real reason to the login page so it can be shown to the user.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const oauthError = searchParams.get('error_description') || searchParams.get('error')
  const redirect = searchParams.get('redirect') || '/dashboard'

  const loginWithError = (message: string) =>
    NextResponse.redirect(`${origin}/auth/login?error=${encodeURIComponent(message)}`)

  // Provider returned an explicit failure (e.g. access_denied, misconfig).
  if (oauthError) {
    return loginWithError(oauthError)
  }

  if (code) {
    const supabase = await createClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) {
      return loginWithError(error.message)
    }
    return NextResponse.redirect(`${origin}${redirect}`)
  }

  // Reached the callback with neither a code nor an error — nothing to
  // exchange, so treat it as an incomplete sign-in rather than a success.
  return loginWithError('Sign-in did not complete. Please try again.')
}
