import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import Link from 'next/link'
import { ChevronLeft, AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { format } from 'date-fns'
import { QuotePdfButton } from '@/components/quotes/quote-pdf-button'
import { RegenerateQuoteButton } from '@/components/quotes/regenerate-quote-button'
import { computeStaleness, buildProductLatestMap } from '@/lib/quote-staleness'
import { lineItemTtd } from '@/lib/quote-engine'
import { isStaffRole } from '@/types/database'
import { QuoteNotesEditor } from '@/components/quotes/quote-notes-editor'
import type { QuoteNote } from '@/types/database'

/**
 * Quote detail page — customer-facing.
 *
 * Batch 4: the per-component USD breakdown is replaced with a single TTD
 * price per window, computed from the stored snapshot values:
 *
 *   per_window_ttd = line_total_usd × (1 + markup_percent/100) × exchange_rate + labor_cost_ttd
 *
 * The customer never sees individual component costs, markup percentage,
 * exchange rate, or labour amount — only the final per-window total and
 * the grand total. Installation is shown as a separate line for retail
 * customers (zero for wholesale).
 */
export default async function QuoteDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: quote } = await supabase
    .from('quotes')
    .select('*, properties(name, address)')
    .eq('id', id)
    .single()

  if (!quote) notFound()

  // Viewer role — staff can edit notes; customers see read-only
  const { data: viewerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  const isStaff = isStaffRole((viewerProfile?.role ?? 'retail_customer') as import('@/types/database').UserRole)

  const [
    { data: lineItems },
    { data: config },
    { data: components },
  ] = await Promise.all([
    supabase
      .from('quote_line_items')
      .select('*, windows(excluded_components)')
      .eq('quote_id', id)
      .order('room_name'),
    supabase.from('pricing_config').select('updated_at').eq('id', 1).single(),
    supabase.from('components').select('product_id, updated_at'),
  ])

  // Snapshot values for TTD conversion
  const markupPct = Number(quote.markup_percent)
  const exchangeRate = Number(quote.exchange_rate)
  const laborTtd = Number(quote.labor_cost_ttd)
  const installPerWindow = Number(quote.installation_cost_ttd)

  type LineItemWithWindow = NonNullable<typeof lineItems>[number] & {
    windows: { excluded_components: string[] } | null
  }
  const items = (lineItems ?? []) as LineItemWithWindow[]

  // Group by room
  const byRoom: Record<string, LineItemWithWindow[]> = {}
  for (const item of items) {
    if (!byRoom[item.room_name]) byRoom[item.room_name] = []
    byRoom[item.room_name].push(item)
  }

  const priceableCount = items.filter(li => li.line_type !== 'zero').length
  const isExpired = quote.expires_at && new Date(quote.expires_at) < new Date()

  // Staleness check
  const productIds = Array.from(new Set(items.map(li => li.product_id)))
  const productLatest = buildProductLatestMap(components || [])
  const staleness = computeStaleness(
    quote.created_at,
    productIds,
    config?.updated_at || null,
    productLatest
  )

  /** Pretty-print a component name for the footnote. */
  function formatName(n: string): string {
    return n.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
  }

  return (
    <div>
      <div className="mb-6">
        <Link href="/quotes" className="mb-2 inline-flex items-center text-sm text-muted-foreground hover:text-foreground">
          <ChevronLeft className="mr-1 h-4 w-4" />
          Back to Quotes
        </Link>
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quote Detail</h1>
            <p className="text-muted-foreground">{quote.properties?.name}</p>
          </div>
          <QuotePdfButton quoteId={id} />
        </div>
      </div>

      {staleness.is_stale && (
        <div className="mb-6 flex flex-col gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-5 w-5 flex-shrink-0 text-amber-600" />
            <div>
              <p className="font-medium text-amber-900 dark:text-amber-200">
                This quote is affected by pricing changes
              </p>
              <p className="text-xs text-amber-800/80 dark:text-amber-300/80">
                {staleness.reason === 'both'
                  ? 'Global pricing settings and component prices have both been updated since this quote was generated.'
                  : staleness.reason === 'config'
                  ? 'Global pricing settings have been updated since this quote was generated.'
                  : 'Component prices for one or more products in this quote have been updated since it was generated.'}
              </p>
            </div>
          </div>
          <RegenerateQuoteButton propertyId={quote.property_id} />
        </div>
      )}

      {/* Quote Summary */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Summary</CardTitle>
            <Badge variant={isExpired ? 'destructive' : 'default'}>
              {isExpired ? 'Expired' : quote.status}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date</span>
            <span>{format(new Date(quote.created_at), 'MMM d, yyyy')}</span>
          </div>
          {quote.expires_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Expires</span>
              <span>{format(new Date(quote.expires_at), 'MMM d, yyyy')}</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-Room Breakdown — one TTD price per window, no per-component USD */}
      {Object.entries(byRoom).map(([roomName, roomItems]) => {
        const roomTotalTtd = roomItems.reduce((sum, item) => {
          if (item.line_type === 'zero') return sum
          return sum + lineItemTtd(Number(item.line_total_usd), markupPct, exchangeRate, laborTtd)
        }, 0)

        return (
          <Card key={roomName} className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">{roomName}</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Window</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Details</TableHead>
                    <TableHead>Dimensions</TableHead>
                    <TableHead className="text-right">Price (TTD)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {roomItems.map(item => {
                    const isBlind = item.line_type === 'blind'
                    const isAwning = item.line_type === 'awning'
                    const isZero = item.line_type === 'zero'
                    const windowTtd = isZero
                      ? 0
                      : lineItemTtd(Number(item.line_total_usd), markupPct, exchangeRate, laborTtd)
                    const excluded = item.windows?.excluded_components ?? []

                    return (
                      <TableRow key={item.id} className={isZero ? 'text-muted-foreground' : ''}>
                        <TableCell>
                          <div>
                            <span className="font-medium">{item.window_name}</span>
                            {excluded.length > 0 && (
                              <p className="text-[11px] italic text-muted-foreground">
                                {excluded.map(formatName).join(', ')} not included
                              </p>
                            )}
                          </div>
                        </TableCell>
                        <TableCell>
                          {isBlind && <Badge variant="default">Blind</Badge>}
                          {isAwning && <Badge variant="secondary">Awning</Badge>}
                          {isZero && <span className="text-xs italic">—</span>}
                        </TableCell>
                        <TableCell>
                          {isZero ? (
                            <span className="text-xs italic">No blind/awning</span>
                          ) : (
                            <div className="text-xs">
                              {item.shade_type && <span className="capitalize">{item.shade_type}</span>}
                              {item.colour && <span> / {item.colour}</span>}
                            </div>
                          )}
                        </TableCell>
                        <TableCell className="text-xs">
                          {Number(item.blind_width)}&quot;x{Number(item.blind_height)}&quot;
                        </TableCell>
                        <TableCell className="text-right font-semibold">
                          {isZero ? '—' : `TTD $${windowTtd.toFixed(2)}`}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                  <TableRow>
                    <TableCell colSpan={4} className="text-right font-semibold">Room Subtotal</TableCell>
                    <TableCell className="text-right font-semibold">
                      TTD ${roomTotalTtd.toFixed(2)}
                    </TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )
      })}

      {/* Notes */}
      <QuoteNotesEditor
        quoteId={id}
        initialNotes={(quote.notes ?? []) as QuoteNote[]}
        isStaff={isStaff}
      />

      {/* Grand Total */}
      <Card>
        <CardHeader>
          <CardTitle>Grand Total</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          {installPerWindow > 0 && priceableCount > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">
                Installation ({priceableCount} window{priceableCount === 1 ? '' : 's'})
              </span>
              <span>TTD ${(installPerWindow * priceableCount).toFixed(2)}</span>
            </div>
          )}
          <Separator />
          <div className="flex justify-between text-lg font-bold">
            <span>Grand Total</span>
            <span>TTD ${Number(quote.total_ttd).toFixed(2)}</span>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
