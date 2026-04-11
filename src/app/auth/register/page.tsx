'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { toast } from 'sonner'

/**
 * Public self-registration page.
 *
 * Always creates a `retail_customer` profile. Wholesale customers and
 * salesmen are provisioned by staff from inside the app; there is no
 * public path to those roles.
 */
export default function RegisterPage() {
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    email: '',
    contact_number: '',
    password: '',
    confirm_password: '',
  })
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  function update(field: string, value: string) {
    setForm(prev => ({ ...prev, [field]: value }))
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    if (form.password !== form.confirm_password) {
      toast.error('Passwords do not match')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error } = await supabase.auth.signUp({
      email: form.email,
      password: form.password,
      options: {
        data: {
          first_name: form.first_name,
          last_name: form.last_name,
          contact_number: form.contact_number,
          role: 'retail_customer',
        },
      },
    })
    if (error) {
      toast.error(error.message)
      setLoading(false)
      return
    }
    toast.success('Account created! Check your email for confirmation, or sign in now.')
    router.push('/auth/login')
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[oklch(0.18_0.02_250)] to-[oklch(0.25_0.04_260)] px-4 py-8">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <Image src="/logo.jpg" alt="Finesse" width={56} height={56} className="mx-auto mb-3 rounded-lg" />
          <CardTitle className="text-2xl">Create Account</CardTitle>
          <CardDescription>Register for the Finesse Quote Portal</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleRegister} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="first_name">First Name</Label>
                <Input
                  id="first_name"
                  value={form.first_name}
                  onChange={e => update('first_name', e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="last_name">Last Name</Label>
                <Input
                  id="last_name"
                  value={form.last_name}
                  onChange={e => update('last_name', e.target.value)}
                  required
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={form.email}
                onChange={e => update('email', e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="contact_number">Contact Number</Label>
              <Input
                id="contact_number"
                type="tel"
                placeholder="+1 868 555 1234"
                value={form.contact_number}
                onChange={e => update('contact_number', e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={form.password}
                onChange={e => update('password', e.target.value)}
                required
                minLength={6}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm_password">Confirm Password</Label>
              <Input
                id="confirm_password"
                type="password"
                value={form.confirm_password}
                onChange={e => update('confirm_password', e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? 'Creating account...' : 'Create Account'}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="justify-center">
          <p className="text-sm text-muted-foreground">
            Already have an account?{' '}
            <Link href="/auth/login" className="text-primary underline">Sign In</Link>
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
