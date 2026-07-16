'use client'

import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'
import { loginSchema } from '@/lib/validators'

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  )
}

function LoginForm() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()
  const searchParams = useSearchParams()
  const redirect = searchParams.get('redirect') || '/dashboard'

  // Surface a reason handed back by the OAuth callback (e.g. a failed or
  // cancelled Google sign-in) instead of silently re-showing the form.
  const authError = searchParams.get('error')
  useEffect(() => {
    if (authError) toast.error(authError)
  }, [authError])

  // Success notices redirected here (e.g. after a completed password reset).
  const authMessage = searchParams.get('message')
  useEffect(() => {
    if (authMessage) toast.success(authMessage)
  }, [authMessage])

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    const parsed = loginSchema.safeParse({ email, password })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid credentials')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signInWithPassword(parsed.data)
    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }
    router.push(redirect)
    router.refresh()
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[oklch(0.18_0.02_250)] to-[oklch(0.25_0.04_260)] px-4">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <Image src="/logo.jpg" alt="Finesse" width={56} height={56} className="mx-auto mb-3 rounded-lg" />
          <CardTitle className="text-2xl">Sign In</CardTitle>
          <CardDescription>Sign in to your Finesse account</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
                <Link href="/auth/forgot-password" className="text-xs text-muted-foreground underline hover:text-primary">
                  Forgot password?
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Signing in...' : 'Sign In'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Don&apos;t have an account?{' '}
            <Link href="/auth/register" className="text-primary underline">Register</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
