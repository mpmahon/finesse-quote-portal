import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GalleryClient } from '@/components/gallery/gallery-client'
import { lineItemTtd, calculateLineItem, calculateAwningLineItem } from '@/lib/quote-engine'
import { markupPctForRole, ESTIMATE_CONFIG_COLUMNS } from '@/lib/estimates'
import { isCustomerRole, isStaffRole } from '@/types/database'
import type { AwningProduct, Component, UserRole } from '@/types/database'

/** Indicative pricing window: a standard 36" × 48" inside-mount window. */
const SAMPLE_WINDOW = { width_inches: 36, height_inches: 48, mount_type: 'inside' as const }

/**
 * Style Gallery (WS3 §8.2) — the browsable, filterable product range with
 * images, colour swatches, and "from ~TTD X" indicative pricing computed
 * through the real quote engine (customer-type aware).
 */
export default async function GalleryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: profile }, { data: products }, { data: awningProducts }, { data: pricing }, { data: colours }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    supabase.from('products').select('*, components(*)').eq('is_active', true).order('make'),
    supabase.from('awning_products').select('*').eq('is_active', true).order('make'),
    supabase.from('pricing_config').select(ESTIMATE_CONFIG_COLUMNS).eq('id', 1).single(),
    supabase.from('colours').select('name, hex_code'),
  ])

  const role = (profile?.role ?? 'retail_customer') as UserRole
  const isStaff = isStaffRole(role)
  // Customers see their own tier's indicative pricing; staff preview retail.
  const priceRole: UserRole = isCustomerRole(role) ? role : 'retail_customer'

  const markup = pricing ? markupPctForRole(priceRole, pricing) : null
  const rate = pricing ? Number(pricing.exchange_rate) : null
  const labor = pricing ? Number(pricing.labor_cost_ttd) : null

  const hexByColour: Record<string, string> = {}
  for (const c of colours ?? []) {
    if (c.hex_code) hexByColour[c.name.toLowerCase()] = c.hex_code
  }

  const blindCards = ((products ?? []) as (import('@/types/database').Product & { components: Component[] })[]).map(p => {
    let fromTtd: number | null = null
    if (pricing && markup !== null && rate !== null && labor !== null && p.components.length > 0) {
      const line = calculateLineItem(SAMPLE_WINDOW, p.components)
      fromTtd = lineItemTtd(line.costs.line_total_usd, markup, rate, labor)
    }
    return {
      id: p.id,
      kind: 'blind' as const,
      make: p.make,
      model: p.model,
      image_url: p.image_url,
      shade_types: p.shade_types,
      styles: p.styles,
      colours: p.colours.map(c => ({ name: c, hex: hexByColour[c.toLowerCase()] ?? null })),
      from_ttd: fromTtd,
    }
  })

  const awningCards = ((awningProducts ?? []) as AwningProduct[]).map(p => {
    let fromTtd: number | null = null
    if (pricing && markup !== null && rate !== null && labor !== null) {
      const line = calculateAwningLineItem(SAMPLE_WINDOW.width_inches, p)
      fromTtd = lineItemTtd(line.costs.line_total_usd, markup, rate, labor)
    }
    return {
      id: p.id,
      kind: 'awning' as const,
      make: p.make,
      model: p.model,
      image_url: p.image_url,
      shade_types: [] as string[],
      styles: ['awning'],
      colours: p.colours.map(c => ({ name: c, hex: hexByColour[c.toLowerCase()] ?? null })),
      from_ttd: fromTtd,
    }
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">Style Gallery</h1>
        <p className="text-muted-foreground">
          Browse our range of blinds and awnings. Indicative pricing is for a standard 36&quot; × 48&quot; window — your quote is priced to your exact measurements.
        </p>
      </div>
      <GalleryClient cards={[...blindCards, ...awningCards]} isStaff={isStaff} />
    </div>
  )
}
