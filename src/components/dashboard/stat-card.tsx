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

/**
 * Compact KPI tile used across the role dashboards.
 *
 * Always renders the sub-label line (with a non-breaking space when `sub`
 * is omitted) so every card in a KPI row has an identical DOM shape and
 * therefore an identical natural height — mixing cards with/without a real
 * sub-label previously made the row look uneven (client feedback,
 * 2026-07-07 QA). `h-full` + `block` on the outer element (Link or Card)
 * additionally makes each card stretch to fill its grid cell when the
 * parent grid row is taller than this card's own content, e.g. a neighbour
 * wrapping to two lines.
 */
export function StatCard({ label, value, sub, href, className }: StatCardProps) {
  const body = (
    <Card className={cn('h-full', href && 'transition-colors hover:bg-accent/50', className)}>
      <CardContent className="flex h-full flex-col p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold">{value}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">{sub || ' '}</p>
      </CardContent>
    </Card>
  )
  return href ? <Link href={href} className="block h-full">{body}</Link> : body
}
