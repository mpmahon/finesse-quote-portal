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
import type { QuoteLineItem } from '@/types/database'

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

  const [
    { data: lineItems },
    { data: config },
    { data: components },
  ] = await Promise.all([
    supabase.from('quote_line_items').select('*').eq('quote_id', id).order('room_name'),
    supabase.from('pricing_config').select('updated_at').eq('id', 1).single(),
    supabase.from('components').select('product_id, updated_at'),
  ])

  // Group line items by room
  const byRoom: Record<string, QuoteLineItem[]> = {}
  for (const item of (lineItems || [])) {
    if (!byRoom[item.room_name]) byRoom[item.room_name] = []
    byRoom[item.room_name].push(item)
  }

  // Priceable line items (blind or awning) drive labor/install counts
  const priceableCount = (lineItems || []).filter(li => li.line_type !== 'zero').length

  const isExpired = quote.expires_at && new Date(quote.expires_at) < new Date()

  // Compute staleness
  const productIds = Array.from(new Set((lineItems || []).map(li => li.product_id)))
  const productLatest = buildProductLatestMap(components || [])
  const staleness = computeStaleness(
    quote.created_at,
    productIds,
    config?.updated_at || null,
    productLatest
  )

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

      {/* Quote Summary Card */}
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
          {Number(quote.discount_percent) > 0 && (
            <div className="flex justify-between text-green-600">
              <span>Reseller Discount</span>
              <span>-{Number(quote.discount_percent)}%</span>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Per-Room Breakdown */}
      {Object.entries(byRoom).map(([roomName, items]) => (
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
                  <TableHead className="text-right">Breakdown</TableHead>
                  <TableHead className="text-right">Total (USD)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map(item => {
                  const isBlind = item.line_type === 'blind'
                  const isAwning = item.line_type === 'awning'
                  const isZero = item.line_type === 'zero'
                  return (
                    <TableRow key={item.id} className={isZero ? 'text-muted-foreground' : ''}>
                      <TableCell className="font-medium">{item.window_name}</TableCell>
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
                      <TableCell className="text-right text-xs">
                        {isBlind && (
                          <span className="text-muted-foreground">
                            Cassette ${Number(item.cassette_cost).toFixed(2)} · Tube ${Number(item.tube_cost).toFixed(2)} · Rail ${Number(item.bottom_rail_cost).toFixed(2)} · Chain ${Number(item.chain_cost).toFixed(2)} · Fabric ${Number(item.fabric_cost).toFixed(2)} · Fixed ${Number(item.fixed_costs).toFixed(2)}
                          </span>
                        )}
                        {isAwning && (
                          <span className="text-muted-foreground">
                            Frame ${Number(item.cassette_cost).toFixed(2)} · Material ${Number(item.fabric_cost).toFixed(2)} · Fixed ${Number(item.fixed_costs).toFixed(2)}
                          </span>
                        )}
                        {isZero && <span>—</span>}
                      </TableCell>
                      <TableCell className="text-right font-semibold">${Number(item.line_total_usd).toFixed(2)}</TableCell>
                    </TableRow>
                  )
                })}
                <TableRow>
                  <TableCell colSpan={5} className="text-right font-semibold">Room Subtotal (USD)</TableCell>
                  <TableCell className="text-right font-semibold">
                    ${items.reduce((sum, i) => sum + Number(i.line_total_usd), 0).toFixed(2)}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      ))}

      {/* Grand Totals */}
      {/*
        Batch 1 note: exchange_rate, duty, shipping, and labour rows are hidden
        from the customer-facing view. The stored quote.total_ttd still reflects
        whatever pricing config was in effect at quote generation; Batch 4 will
        rewrite the engine so labour is rolled into line items and installation
        is applied only for retail customers.
      */}
      <Card>
        <CardHeader>
          <CardTitle>Grand Total</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">+ Installation ({priceableCount} window{priceableCount === 1 ? '' : 's'})</span>
            <span>TTD ${(priceableCount * Number(quote.installation_cost_ttd)).toFixed(2)}</span>
          </div>
          {Number(quote.discount_percent) > 0 && (
            <div className="flex justify-between text-green-600">
              <span>- Reseller Discount ({Number(quote.discount_percent)}%)</span>
              <span>applied</span>
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
