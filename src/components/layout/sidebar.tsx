'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { cn } from '@/lib/utils'
import { Home, FileText, Shield, Package, DollarSign, ScrollText, LogOut, Users, Palette, Umbrella } from 'lucide-react'
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
  { href: '/admin', label: 'Overview', icon: Shield },
  { href: '/admin/users', label: 'Users', icon: Users },
  { href: '/admin/products', label: 'Blind Products', icon: Package },
  { href: '/admin/awning-products', label: 'Awning Products', icon: Umbrella },
  { href: '/admin/catalog', label: 'Catalog', icon: Palette },
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
    <aside className="flex w-64 flex-col bg-[oklch(0.18_0.02_250)] text-white">
      {/* Logo */}
      <Link href="/dashboard" className="block border-b border-white/10 p-4">
        <Image src="/logo.jpg" alt="Finesse" width={232} height={232} className="w-full rounded-lg" />
      </Link>

      {/* Navigation */}
      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems
          .filter(item => item.roles.includes(role))
          .map(item => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
                  ? 'bg-[oklch(0.55_0.18_250)] text-white shadow-md'
                  : 'text-white/60 hover:bg-white/8 hover:text-white'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}

        {role === 'administrator' && (
          <>
            <div className="my-4 border-t border-white/10 pt-4">
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-white/40">
                Admin
              </p>
            </div>
            {adminItems.map(item => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                  pathname === item.href || (item.href !== '/admin' && pathname.startsWith(item.href))
                    ? 'bg-[oklch(0.55_0.18_250)] text-white shadow-md'
                    : 'text-white/60 hover:bg-white/8 hover:text-white'
                )}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            ))}
          </>
        )}
      </nav>

      {/* User */}
      <div className="border-t border-white/10 p-4">
        <div className="mb-3 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[oklch(0.55_0.18_250)] text-sm font-semibold text-white">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="flex-1 overflow-hidden">
            <p className="truncate text-sm font-medium text-white">{userName}</p>
            <p className="text-xs capitalize text-white/50">{role}</p>
          </div>
        </div>
        <button
          onClick={handleLogout}
          className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-white/50 transition-colors hover:bg-white/8 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </button>
      </div>
    </aside>
  )
}
