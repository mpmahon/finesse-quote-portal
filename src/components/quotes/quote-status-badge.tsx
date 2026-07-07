import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { QUOTE_STATUS_LABELS } from '@/lib/constants'

interface QuoteStatusBadgeProps {
  /** Effective lifecycle status (use effectiveQuoteStatus() before passing). */
  status: string
  className?: string
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-100 text-slate-700 border-slate-200',
  sent: 'bg-blue-100 text-blue-700 border-blue-200',
  accepted: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  declined: 'bg-rose-100 text-rose-700 border-rose-200',
  expired: 'bg-amber-100 text-amber-800 border-amber-200',
}

/** Colour-coded lifecycle chip used on quote lists, detail pages, and dashboards. */
export function QuoteStatusBadge({ status, className }: QuoteStatusBadgeProps) {
  return (
    <Badge
      variant="outline"
      className={cn('capitalize', STATUS_STYLES[status] ?? STATUS_STYLES.draft, className)}
    >
      {QUOTE_STATUS_LABELS[status] ?? status}
    </Badge>
  )
}
