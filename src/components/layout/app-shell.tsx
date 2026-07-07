'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Sidebar } from '@/components/layout/sidebar'
import type { UserRole } from '@/types/database'

interface AppShellProps {
  role: UserRole
  userName: string
  children: React.ReactNode
}

/** Human page title for the mobile app bar, derived from the first path segment. */
const SECTION_TITLES: Record<string, string> = {
  dashboard: 'Dashboard',
  properties: 'Properties',
  quotes: 'Quotes',
  gallery: 'Style Gallery',
  jobs: 'Jobs',
  admin: 'Admin',
}

/**
 * Responsive authenticated shell (WS2 §7.4).
 *
 * ≥ lg: fixed 256px sidebar, content beside it.
 * < lg: top app bar with a hamburger that opens the same sidebar in a sheet
 * drawer — the salesman persona quotes from a phone.
 */
export function AppShell({ role, userName, children }: AppShellProps) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()
  const section = pathname.split('/')[1] || 'dashboard'
  const title = SECTION_TITLES[section] ?? 'Finesse'

  return (
    <div className="flex h-screen flex-col lg:flex-row">
      {/* Mobile app bar */}
      <header className="flex items-center gap-3 border-b bg-[oklch(0.18_0.02_250)] px-3 py-2 text-white lg:hidden">
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          className="text-white hover:bg-white/10 hover:text-white"
          onClick={() => setOpen(true)}
        >
          <Menu className="h-5 w-5" />
        </Button>
        <span className="text-sm font-semibold">{title}</span>
      </header>

      {/* Mobile drawer */}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="left" showCloseButton={false} className="w-64 max-w-[80vw] border-0 bg-transparent p-0 shadow-xl">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <Sidebar role={role} userName={userName} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>

      {/* Desktop sidebar */}
      <div className="hidden lg:block">
        <Sidebar role={role} userName={userName} />
      </div>

      <main className="flex-1 overflow-y-auto">
        <div className="container mx-auto p-4 sm:p-6">
          {children}
        </div>
      </main>
    </div>
  )
}
