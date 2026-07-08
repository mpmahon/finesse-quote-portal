'use client'

import { useEffect, useState, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { resetPasswordSchema } from '@/lib/validators'

type VerifyStatus = 'verifying' | 'ready' | 'invalid'

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordForm />
    </Suspense>
  )
}

/**
 * Password-reset landing page — the redirect target of the emailed
 * recovery link (see `resetPasswordForEmail`'s `redirectTo` in
 * `/auth/forgot-password`).
 *
 * Supabase's hosted verify endpoint validates the recovery token and then
 * redirects here. Because this project's `@supabase/ssr` clients use the
 * PKCE flow (the same pattern `/auth/callback` uses for OAuth/magic-link),
 * the expected arrival shape is a `?code=` param that must be exchanged
 * for a session via `exchangeCodeForSession`. As a defensive fallback (in
 * case the project's auth settings are ever switched to the implicit
 * flow), we also watch for a session materialising from a URL hash
 * fragment that supabase-js parses automatically on client init, surfaced
 * via the `PASSWORD_RECOVERY` auth event. An `error`/`error_code` query
 * param (Supabase's own signal for an expired or already-used link) short
 * circuits straight to the invalid-link state.
 */
function ResetPasswordForm() {
  const searchParams = useSearchParams()
  // Supabase appends these on a failed/expired verify (link already used,
  // or older than the configured expiry) — read once per URL so the
  // initial render can already reflect it without waiting on an effect.
  const errorCode = searchParams.get('error') || searchParams.get('error_code')
  const code = searchParams.get('code')

  const [status, setStatus] = useState<VerifyStatus>(() => (errorCode ? 'invalid' : 'verifying'))
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const router = useRouter()

  useEffect(() => {
    // The invalid-link case is already captured in the initial state above
    // — nothing left to do for it here.
    if (errorCode) return

    let active = true
    const supabase = createClient()

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (active) setStatus(error ? 'invalid' : 'ready')
      })
      return () => {
        active = false
      }
    }

    // No `code` param — fall back to detecting a hash-based recovery
    // session (implicit flow). supabase-js parses the URL fragment during
    // client init and fires `PASSWORD_RECOVERY` once that completes;
    // `getSession()` covers the case where it has already finished by the
    // time this effect runs.
    const { data: authListener } = supabase.auth.onAuthStateChange(event => {
      if (event === 'PASSWORD_RECOVERY' && active) setStatus('ready')
    })

    supabase.auth.getSession().then(({ data }) => {
      if (active && data.session) setStatus('ready')
    })

    // Give the hash-parsing fallback a few seconds; if nothing resolves,
    // this was never a valid recovery link (e.g. opened without a token).
    const timeout = setTimeout(() => {
      setStatus(current => (current === 'verifying' ? 'invalid' : current))
    }, 4000)

    return () => {
      active = false
      authListener.subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [errorCode, code])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = resetPasswordSchema.safeParse({ password, confirm_password: confirmPassword })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Check your password entries')
      return
    }

    setSubmitting(true)
    const supabase = createClient()
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password })
    setSubmitting(false)

    if (error) {
      toast.error(error.message)
      return
    }

    toast.success('Password updated — you are signed in')
    router.push('/dashboard')
    router.refresh()
  }

  if (status === 'verifying') {
    return (
      <PageShell>
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Verifying your reset link…
        </CardContent>
      </PageShell>
    )
  }

  if (status === 'invalid') {
    return (
      <PageShell>
        <CardHeader className="text-center">
          <Image src="/logo.jpg" alt="Finesse" width={56} height={56} className="mx-auto mb-3 rounded-lg" />
          <CardTitle className="text-2xl">Link Expired</CardTitle>
          <CardDescription>This password reset link is invalid or has expired</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-center text-sm text-muted-foreground">
            Request a new one and we&apos;ll send a fresh link to your inbox.
          </p>
        </CardContent>
        <CardFooter className="justify-center">
          <Link href="/auth/forgot-password" className="text-sm text-primary underline">
            Request a new reset link
          </Link>
        </CardFooter>
      </PageShell>
    )
  }

  return (
    <PageShell>
      <CardHeader className="text-center">
        <Image src="/logo.jpg" alt="Finesse" width={56} height={56} className="mx-auto mb-3 rounded-lg" />
        <CardTitle className="text-2xl">Set New Password</CardTitle>
        <CardDescription>Choose a new password for your account</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">New Password</Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm_password">Confirm Password</Label>
            <Input
              id="confirm_password"
              type="password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              required
              minLength={8}
            />
          </div>
          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? 'Updating...' : 'Update Password'}
          </Button>
        </form>
      </CardContent>
    </PageShell>
  )
}

/** Shared gradient/card shell so the three reset-password states match the login page's visual style. */
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[oklch(0.18_0.02_250)] to-[oklch(0.25_0.04_260)] px-4">
      <Card className="w-full max-w-md shadow-xl">{children}</Card>
    </div>
  )
}
