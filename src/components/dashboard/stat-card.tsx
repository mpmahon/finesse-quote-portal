import Link from 'next/link'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string
  sub?: string
  href?: string
  className?: string
}

/** Compact KPI tile used across the role dashboards. */
export function StatCard({ label, value, sub, href, className }: StatCardProps) {
  const body = (
    <Card className={cn(href && 'transition-colors hover:bg-accent/50', className)}>
      <CardContent className="p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        {sub && <p className="mt-0.5 text-xs text-muted-foreground">{sub}</p>}
      </CardContent>
    </Card>
  )
  return href ? <Link href={href}>{body}</Link> : body
}
