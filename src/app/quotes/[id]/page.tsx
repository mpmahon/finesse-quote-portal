import { createClient } from '@/lib/supabase/server'
import { redirect, notFound } from 'next/navigation'
import { AlertTriangle } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { format } from 'date-fns'
import { QuotePdfButton } from '@/components/quotes/quote-pdf-button'
import { RegenerateQuoteButton } from '@/components/quotes/regenerate-quote-button'
import { QuoteStatusBadge } from '@/components/quotes/quote-status-badge'
import { QuoteLifecycleActions } from '@/components/quotes/quote-lifecycle-actions'
import { WindowDiagram } from '@/components/windows/window-diagram'
import { PageBreadcrumb } from '@/components/layout/page-breadcrumb'
import { computeStaleness, buildProductLatestMap } from '@/lib/quote-staleness'
import { lineItemTtd } from '@/lib/quote-engine'
import { effectiveQuoteStatus, isStaffRole } from '@/types/database'
import { QuoteNotesEditor } from '@/components/quotes/quote-notes-editor'
import type { QuoteNote, QuoteStatus, MountType, HardwareSpec } from '@/types/database'

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

  // `profiles!user_id(...)` disambiguates the join — quotes has two FKs to
  // profiles (user_id = customer, created_by = staff who created it).
  const { data: quote } = await supabase
    .from('quotes')
    .select('*, properties(name, address), profiles!user_id(first_name, last_name)')
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

  // Staff see the quote owner's name in the breadcrumb trail.
  const quoteOwner = Array.isArray(quote.profiles) ? quote.profiles[0] ?? null : quote.profiles
  const ownerName = quoteOwner ? `${quoteOwner.first_name} ${quoteOwner.last_name}` : null
  const quoteCrumbLabel =
    isStaff && ownerName
      ? `${ownerName} — ${quote.properties?.name ?? 'Quote'}`
      : quote.properties?.name ?? 'Quote'

  const [
    { data: lineItems },
    { data: config },
    { data: components },
    { data: legacyColourRows },
    { data: blindColourRows },
  ] = await Promise.all([
    supabase
      .from('quote_line_items')
      .select('*, windows(excluded_components, width_inches, height_inches, mount_type)')
      .eq('quote_id', id)
      .order('room_name'),
    supabase.from('pricing_config').select('updated_at').eq('id', 1).single(),
    supabase.from('components').select('product_id, updated_at'),
    // Legacy flat colours (pre-Batch-7 line items) + the new hierarchy's
    // colours (Batch 7 onward) — merged so a swatch renders correctly
    // whichever taxonomy generated this line item's `colour` text.
    supabase.from('legacy_colours').select('name, hex_code'),
    supabase.from('blind_colours').select('name, hex_code'),
  ])

  const hexByColour: Record<string, string> = {}
  for (const c of [...(legacyColourRows ?? []), ...(blindColourRows ?? [])]) {
    if (c.hex_code) hexByColour[c.name.toLowerCase()] = c.hex_code
  }

  // Snapshot values for TTD conversion
  const markupPct = Number(quote.markup_percent)
  const exchangeRate = Number(quote.exchange_rate)
  const laborTtd = Number(quote.labor_cost_ttd)
  const installPerWindow = Number(quote.installation_cost_ttd)

  type LineItemWithWindow = NonNullable<typeof lineItems>[number] & {
    windows: {
      excluded_components: string[]
      width_inches: number
      height_inches: number
      mount_type: MountType
    } | null
  }
  const items = (lineItems ?? []) as LineItemWithWindow[]

  // Group by room
  const byRoom: Record<string, LineItemWithWindow[]> = {}
  for (const item of items) {
    if (!byRoom[item.room_name]) byRoom[item.room_name] = []
    byRoom[item.room_name].push(item)
  }

  const priceableCount = items.filter(li => li.line_type !== 'zero').length
  const status = effectiveQuoteStatus(quote as { status: QuoteStatus; expires_at: string | null })
  const isOwner = quote.user_id === user.id

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
        <PageBreadcrumb
          className="mb-2"
          segments={[
            { label: 'Quotes', href: '/quotes' },
            { label: quoteCrumbLabel },
          ]}
        />
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Quote Detail</h1>
            <p className="text-muted-foreground">{quote.properties?.name}</p>
          </div>
          <QuotePdfButton quoteId={id} />
        </div>
      </div>

      {/* Lifecycle actions: Send (staff, draft) / Accept & Decline (sent) */}
      {(status === 'draft' || status === 'sent') && (
        <div className="mb-6">
          <QuoteLifecycleActions
            quoteId={id}
            status={status}
            isStaff={isStaff}
            isOwner={isOwner}
          />
        </div>
      )}

      {status === 'expired' && (
        <div className="mb-6 rounded-lg border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-900 dark:text-amber-200">
          This quote has expired. {isStaff ? 'Regenerate it to re-issue with current pricing.' : 'Contact us to re-issue it with current pricing.'}
        </div>
      )}

      {status === 'declined' && quote.decline_reason && isStaff && (
        <div className="mb-6 rounded-lg border border-rose-500/40 bg-rose-500/10 p-4 text-sm">
          <span className="font-medium">Decline reason:</span> {quote.decline_reason}
        </div>
      )}

      {staleness.is_stale && status !== 'accepted' && status !== 'declined' && (
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
            <QuoteStatusBadge status={status} />
          </div>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Date</span>
            <span>{format(new Date(quote.created_at), 'MMM d, yyyy')}</span>
          </div>
          {quote.sent_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Sent</span>
              <span>{format(new Date(quote.sent_at), 'MMM d, yyyy')}</span>
            </div>
          )}
          {quote.accepted_at && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Accepted</span>
              <span>{format(new Date(quote.accepted_at), 'MMM d, yyyy')}</span>
            </div>
          )}
          {quote.expires_at && status !== 'accepted' && status !== 'declined' && (
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
                    const hardwareSpec = (item.hardware_spec ?? null) as HardwareSpec | null

                    return (
                      <TableRow key={item.id} className={isZero ? 'text-muted-foreground' : ''}>
                        <TableCell>
                          <div className="flex items-start gap-3">
                            {item.windows && isBlind && (
                              <WindowDiagram
                                widthInches={Number(item.windows.width_inches)}
                                heightInches={Number(item.windows.height_inches)}
                                mountType={item.windows.mount_type}
                                blindColour={item.colour ? hexByColour[item.colour.toLowerCase()] ?? null : null}
                                className="hidden w-20 shrink-0 sm:block"
                              />
                            )}
                            <div>
                              <span className="font-medium">{item.window_name}</span>
                              {excluded.length > 0 && (
                                <p className="text-[11px] italic text-muted-foreground">
                                  {excluded.map(formatName).join(', ')} not included
                                </p>
                              )}
                              {hardwareSpec && (
                                <p className="text-[11px] text-muted-foreground">
                                  {hardwareSpec.tube_size} tube · {hardwareSpec.control_type} control
                                </p>
                              )}
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>
                          {isBlind && <Badge variant="default">Blind</Badge>}
                          {isAwning && <Badge variant="secondary">Awning</Badge>}
                          {isZero && <span className="text-xs italic">—</span>}
                          {hardwareSpec?.is_motorized && (
                            <Badge variant="outline" className="ml-1 border-amber-500/50 text-[10px] text-amber-700 dark:text-amber-400">
                              Motorized
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell>
                          {isZero ? (
                            <span className="text-xs italic">No blind/awning</span>
                          ) : (
                            <div className="text-xs">
                              {item.shade_type && <span className="capitalize">{item.shade_type}</span>}
                              {item.opacity && <span> · {item.opacity}</span>}
                              {item.style && <span> / {item.style}</span>}
                              {item.colour && <span> / {item.colour}</span>}
                              {item.valance && (
                                <p className="text-muted-foreground">Valance: {item.valance}</p>
                              )}
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
