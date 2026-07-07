'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { calculateQuoteTotals } from '@/lib/quote-engine'
import type { UserRole } from '@/types/database'

interface WhatIfPanelProps {
  config: {
    exchange_rate: number
    retail_markup_pct: number
    wholesale_markup_pct: number
    labor_cost_ttd: number
    installation_cost_ttd: number
  }
  /** A recent real quote used as the sensitivity sample. Null when no quotes exist yet. */
  sample: {
    id: string
    subtotal_usd: number
    priceable_count: number
    customer_role: UserRole
    total_ttd: number
  } | null
}

/**
 * Admin what-if pricing sliders (WS2 §7.3, carried from the old prototype).
 *
 * Recomputes a recent quote's grand total live as the sliders move so the
 * admin can see pricing sensitivity BEFORE committing changes via
 * Admin → Pricing. Purely a preview — nothing here writes to the database.
 */
export function WhatIfPanel({ config, sample }: WhatIfPanelProps) {
  const [rate, setRate] = useState(Number(config.exchange_rate))
  const [retail, setRetail] = useState(Number(config.retail_markup_pct))
  const [wholesale, setWholesale] = useState(Number(config.wholesale_markup_pct))

  const preview = useMemo(() => {
    if (!sample) return null
    const lines = [{ costs: { line_total_usd: Number(sample.subtotal_usd) } }]
    // Reconstruct the sample as one aggregate line + per-window charges.
    const totals = calculateQuoteTotals(lines, {
      exchange_rate: rate,
      retail_markup_pct: retail,
      wholesale_markup_pct: wholesale,
      labor_ttd: Number(config.labor_cost_ttd),
      installation_ttd: Number(config.installation_cost_ttd),
    }, sample.customer_role)
    // calculateQuoteTotals charges labour/installation per line — the sample
    // is aggregated to one line, so scale those per-window charges manually.
    const perWindowExtra =
      (Number(config.labor_cost_ttd) +
        (sample.customer_role === 'retail_customer' ? Number(config.installation_cost_ttd) : 0)) *
      (sample.priceable_count - 1)
    return Math.round((totals.grand_total_ttd + perWindowExtra) * 100) / 100
  }, [sample, rate, retail, wholesale, config.labor_cost_ttd, config.installation_cost_ttd])

  const dirty =
    rate !== Number(config.exchange_rate) ||
    retail !== Number(config.retail_markup_pct) ||
    wholesale !== Number(config.wholesale_markup_pct)

  const sliders = [
    { id: 'rate', label: `Exchange Rate — ${rate.toFixed(2)}`, min: 5, max: 9, step: 0.05, value: rate, set: setRate },
    { id: 'retail', label: `Retail Markup — ${retail.toFixed(0)}%`, min: 0, max: 100, step: 1, value: retail, set: setRetail },
    { id: 'wholesale', label: `Wholesale Markup — ${wholesale.toFixed(0)}%`, min: 0, max: 100, step: 1, value: wholesale, set: setWholesale },
  ]

  return (
    <Card>
      <CardHeader>
        <CardTitle>What-If Pricing</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {sliders.map(s => (
          <div key={s.id} className="space-y-1.5">
            <Label htmlFor={`whatif-${s.id}`} className="text-xs">{s.label}</Label>
            <input
              id={`whatif-${s.id}`}
              type="range"
              min={s.min}
              max={s.max}
              step={s.step}
              value={s.value}
              onChange={e => s.set(Number(e.target.value))}
              className="w-full accent-primary"
            />
          </div>
        ))}

        {sample && preview !== null ? (
          <div className="rounded-md bg-muted/50 p-3 text-sm">
            <p className="text-xs text-muted-foreground">
              Sample: quote #{sample.id.slice(0, 8)} ({sample.customer_role === 'retail_customer' ? 'retail' : 'wholesale'}, {sample.priceable_count} window{sample.priceable_count === 1 ? '' : 's'})
            </p>
            <div className="mt-1 flex items-baseline justify-between">
              <span>Current: <span className="font-medium">TTD ${Number(sample.total_ttd).toFixed(2)}</span></span>
              <span className={dirty ? 'font-semibold text-primary' : 'font-semibold'}>
                → TTD ${preview.toFixed(2)}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground">Generate a quote to see live sensitivity here.</p>
        )}

        <div className="flex items-center justify-between">
          <p className="text-xs text-muted-foreground">Preview only — nothing is saved.</p>
          <Link href="/admin/pricing">
            <Button variant="outline" size="sm">Open Pricing Settings</Button>
          </Link>
        </div>
      </CardContent>
    </Card>
  )
}
