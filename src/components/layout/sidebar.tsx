'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, Building2, FileText, Settings, Shield, Package, DollarSign, ScrollText, LogOut } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import type { UserRole } from '@/types/database'

interface SidebarProps {
  role: UserRole
  userName: string
}

const navItems = [
  { href: '/dashboard', label: 'Dashboard', icon: Home, roles: ['customer', 'salesman', 'administrator'] },
  { href: '/quotes', label: 'Quotes', icon: FileText, roles: ['customer', 'salesman', 'administrator'] },
]

const adminItems = [
  { href: '/admin', label: 'Admin Overview', icon: Shield },
  { href: '/admin/products', label: 'Products', icon: Package },
  { href: '/admin/pricing', label: 'Pricing', icon: DollarSign },
  { href: '/admin/audit-logs', label: 'Audit Logs', icon: ScrollText },
]

export function Sidebar({ role, userName }: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/')
    router.refresh()
  }

  return (
    <aside className="flex w-64 flex-col border-r bg-card">
      <div className="flex h-16 items-center border-b px-6">
        <Link href="/dashboard" className="text-xl font-bold">Finesse</Link>
      </div>
      <nav className="flex-1 space-y-1 p-4">
        {navItems
          .filter(item => item.roles.includes(role))
          .map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}

        {role === 'administrator' && (
          <>
            <div className="my-4 border-t pt-4">
              <p className="mb-2 px-3 text-xs font-semibold uppercase text-muted-foreground">Admin</p>
            </div>
            {adminItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>
      <div className="border-t p-4">
        <p className="mb-2 truncate text-sm font-medium">{userName}</p>
        <p className="mb-3 text-xs capitalize text-muted-foreground">{role}</p>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
