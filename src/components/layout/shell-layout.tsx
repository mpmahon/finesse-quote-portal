import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { AppShell } from '@/components/layout/app-shell'
import type { UserRole } from '@/types/database'

interface ShellLayoutProps {
  children: React.ReactNode
  /** When set, redirect to /dashboard unless the viewer's role is in this list. */
  allowRoles?: UserRole[]
}

/**
 * Shared authenticated layout: verifies the session, loads the profile, and
 * renders the responsive AppShell. Every authed section layout delegates here
 * so the sidebar/mobile-drawer behaviour stays in one place.
 */
export async function ShellLayout({ children, allowRoles }: ShellLayoutProps) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  if (!profile) redirect('/auth/login')
  if (allowRoles && !allowRoles.includes(profile.role as UserRole)) redirect('/dashboard')

  const userName = [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.email

  return (
    <AppShell role={profile.role as UserRole} userName={userName}>
      {children}
    </AppShell>
  )
}
