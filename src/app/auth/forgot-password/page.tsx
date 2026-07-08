'use client'

import { useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { forgotPasswordSchema } from '@/lib/validators'

/**
 * Self-service "forgot password" request page.
 *
 * Always shows the same neutral success state once a well-formed email is
 * submitted, regardless of whether an account exists for it — Supabase
 * itself never reveals that, and neither do we, to prevent account
 * enumeration. The one failure mode we do surface distinctly is Supabase's
 * built-in mailer rate limit, since that's actionable ("try again later")
 * rather than a security-sensitive signal.
 */
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [submitted, setSubmitted] = useState(false)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const parsed = forgotPasswordSchema.safeParse({ email })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Enter a valid email address')
      return
    }

    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
      redirectTo: `${window.location.origin}/auth/reset-password`,
    })
    setLoading(false)

    if (error && (error.status === 429 || /rate limit/i.test(error.message))) {
      toast.error('Too many requests — try again in a few minutes.')
      return
    }

    // Neutral success regardless of any other error (including Supabase
    // silently no-op'ing for an email with no account) — no enumeration.
    setSubmitted(true)
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[oklch(0.18_0.02_250)] to-[oklch(0.25_0.04_260)] px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <Image src="/logo.jpg" alt="Finesse" width={56} height={56} className="mx-auto mb-3 rounded-lg" />
          <CardTitle className="text-2xl">Forgot Password</CardTitle>
          <CardDescription>
            {submitted
              ? 'Check your inbox for a reset link'
              : "Enter your account email and we'll send you a reset link"}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {submitted ? (
            <p className="text-center text-sm text-muted-foreground">
              If an account exists for that email, a reset link is on its way — check your inbox.
            </p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  required
                />
              </div>
              <Button type="submit" className="w-full" disabled={loading}>
                {loading ? 'Sending...' : 'Send Reset Link'}
              </Button>
            </form>
          )}
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            <Link href="/auth/login" className="text-primary underline">Back to Sign In</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
