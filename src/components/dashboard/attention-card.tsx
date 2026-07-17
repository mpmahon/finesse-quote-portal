import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatTtd } from '@/lib/format'
import { CircleCheck } from 'lucide-react'

interface AttentionCardProps {
  title: string
  icon: LucideIcon
  count: number
  /** TTD value tied up in this queue (e.g. sum of linked quote totals) — omit when not meaningful for the queue. */
  valueAtRisk?: number
  /** Deep-link into the filtered list this queue summarises; the footer link only renders when both this and `count > 0` are set. */
  viewAllHref?: string
  /** Message shown in place of the row list when `count === 0`. */
  emptyLabel?: string
  /** The top few rows for this queue — each should be its own ≤1-click `Link`. */
  children: ReactNode
}

/**
 * One tile in the admin dashboard's action queue (Phase 1 UX redesign).
 * Server-component-safe — purely presentational, no client state.
 *
 * Always renders, even at `count === 0` — an empty queue is itself useful
 * information ("nothing needs you here"), so it's shown as a quiet green
 * "all clear" state rather than being hidden, which would make the
 * dashboard's layout jump around as queues empty out.
 */
export function AttentionCard({
  title,
  icon: Icon,
  count,
  valueAtRisk,
  viewAllHref,
  emptyLabel = 'All clear',
  children,
}: AttentionCardProps) {
  const isEmpty = count === 0

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-2 text-base">
          <span className="flex items-center gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" />
            {title}
          </span>
          {!isEmpty && (
            <span className="flex items-center gap-1.5">
              <Badge variant="secondary">{count}</Badge>
              {valueAtRisk !== undefined && (
                <span className="text-xs font-normal text-muted-foreground">{formatTtd(valueAtRisk)}</span>
              )}
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {isEmpty ? (
          <p className="flex items-center gap-1.5 text-emerald-600">
            <CircleCheck className="h-4 w-4" />
            {emptyLabel}
          </p>
        ) : (
          <>
            <div className="space-y-1">{children}</div>
            {viewAllHref && (
              <Link href={viewAllHref} className="block pt-1 text-xs text-primary hover:underline">
                View all {count} →
              </Link>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
