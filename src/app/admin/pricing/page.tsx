import { createClient } from '@/lib/supabase/server'
import { PricingEditor } from '@/components/admin/pricing-editor'
import { WhatIfPanel } from '@/components/dashboard/what-if-panel'
import { ChevronDown } from 'lucide-react'
import type { UserRole } from '@/types/database'

export default async function AdminPricingPage() {
  const supabase = await createClient()

  const [{ data: config }, { data: sampleQuote }] = await Promise.all([
    supabase.from('pricing_config').select('*').eq('id', 1).single(),
    // Same sample-quote query the admin dashboard used to run to feed
    // WhatIfPanel (moved here in the Phase 1 UX redesign — pricing-impact
    // preview belongs next to the settings it previews, not on the
    // dashboard's action queue).
    supabase
      .from('quotes')
      .select('id, subtotal_usd, total_ttd, user_id, quote_line_items(id, line_type)')
      .gt('subtotal_usd', 0)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  const sample = sampleQuote
    ? {
        id: sampleQuote.id as string,
        subtotal_usd: Number(sampleQuote.subtotal_usd),
        priceable_count: ((sampleQuote.quote_line_items ?? []) as { line_type: string }[]).filter(li => li.line_type !== 'zero').length || 1,
        customer_role: 'retail_customer' as UserRole,
        total_ttd: Number(sampleQuote.total_ttd),
      }
    : null

  return (
    <div>
      <h1 className="mb-6 text-2xl font-bold">Pricing Configuration</h1>
      {config && <PricingEditor config={config} />}

      {config && (
        <details className="group mt-6 rounded-xl border bg-card ring-1 ring-foreground/10">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-base font-medium">
            Preview impact before saving
            <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
          </summary>
          <div className="border-t p-4">
            <WhatIfPanel config={config} sample={sample} />
          </div>
        </details>
      )}
    </div>
  )
}
