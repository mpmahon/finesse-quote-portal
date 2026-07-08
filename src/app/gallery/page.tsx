import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import { GalleryClient } from '@/components/gallery/gallery-client'
import { lineItemTtd, calculateLineItem, calculateAwningLineItem } from '@/lib/quote-engine'
import { markupPctForRole, ESTIMATE_CONFIG_COLUMNS } from '@/lib/estimates'
import { fetchBlindHierarchy, componentsForStyle, coloursForStyle } from '@/lib/blind-hierarchy'
import { isCustomerRole, isStaffRole } from '@/types/database'
import type { AwningProduct, UserRole } from '@/types/database'
import type { CustomerOption, PropertyOption } from '@/components/gallery/quote-from-style-dialog'

/** Indicative pricing window: a standard 36" × 48" inside-mount window. */
const SAMPLE_WINDOW = { width_inches: 36, height_inches: 48, mount_type: 'inside' as const }

/**
 * Style Gallery (WS3 §8.2) — the browsable, filterable product range with
 * images, colour swatches, and "from ~TTD X" indicative pricing computed
 * through the real quote engine (customer-type aware).
 *
 * Batch 11 Part 1: blind cards are now blind Styles (the Blind Management
 * hierarchy is what Finesse sells) rather than products — each card joins
 * up to its Opacity/Type for captions and prices itself from its own
 * `blind_style_components`. Awning cards are unchanged (awnings still use
 * `awning_products`).
 */
export default async function GalleryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [{ data: profile }, hierarchy, { data: awningProducts }, { data: pricing }, { data: legacyColours }] = await Promise.all([
    supabase.from('profiles').select('role').eq('id', user.id).single(),
    fetchBlindHierarchy(supabase),
    supabase.from('awning_products').select('*').eq('is_active', true).order('make'),
    supabase.from('pricing_config').select(ESTIMATE_CONFIG_COLUMNS).eq('id', 1).single(),
    // Awning colours are still a legacy free-text array (awning_products
    // aren't part of the hierarchy) — used only for awning swatch chips.
    supabase.from('legacy_colours').select('name, hex_code'),
  ])

  const role = (profile?.role ?? 'retail_customer') as UserRole
  const isStaff = isStaffRole(role)
  // Customers see their own tier's indicative pricing; staff preview retail.
  const priceRole: UserRole = isCustomerRole(role) ? role : 'retail_customer'

  // "Quote from style" (staff only) needs the full customer + property list
  // up front so the picker dialog can offer existing properties, not just
  // "create new" — fetched here (read-only) rather than reusing the
  // properties route's own query, per the gallery flow's file boundary.
  let customers: CustomerOption[] = []
  let properties: PropertyOption[] = []
  if (isStaff) {
    const [{ data: customerRows }, { data: propertyRows }] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, first_name, last_name, email, role')
        .in('role', ['retail_customer', 'wholesale_customer'])
        .order('last_name', { ascending: true }),
      supabase
        .from('properties')
        .select('id, name, address, user_id')
        .order('created_at', { ascending: false }),
    ])
    customers = (customerRows ?? []).map(c => ({
      id: c.id,
      first_name: c.first_name,
      last_name: c.last_name,
      email: c.email,
      role: c.role as UserRole,
    }))
    properties = (propertyRows ?? []).map(p => ({
      id: p.id,
      name: p.name,
      address: p.address,
      user_id: p.user_id,
    }))
  }

  const markup = pricing ? markupPctForRole(priceRole, pricing) : null
  const rate = pricing ? Number(pricing.exchange_rate) : null
  const labor = pricing ? Number(pricing.labor_cost_ttd) : null

  const hexByColour: Record<string, string> = {}
  for (const c of legacyColours ?? []) {
    if (c.hex_code) hexByColour[c.name.toLowerCase()] = c.hex_code
  }

  const blindCards = hierarchy.styles.map(style => {
    const opacity = hierarchy.opacities.find(o => o.id === style.opacity_id) ?? null
    const type = opacity ? hierarchy.types.find(t => t.id === opacity.type_id) ?? null : null
    const components = componentsForStyle(hierarchy, style.id)

    let fromTtd: number | null = null
    if (pricing && markup !== null && rate !== null && labor !== null && components.length > 0) {
      const line = calculateLineItem(SAMPLE_WINDOW, components)
      fromTtd = lineItemTtd(line.costs.line_total_usd, markup, rate, labor)
    }

    return {
      id: style.id,
      kind: 'blind' as const,
      // Type name heads the card; Style name is the "model" line — mirrors
      // the old make/model card layout with minimal changes to gallery-client.tsx.
      make: type?.name ?? 'Blind',
      model: style.name,
      image_url: style.image_url,
      shade_types: opacity ? [opacity.name] : [],
      styles: [] as string[],
      colours: coloursForStyle(hierarchy, style.id).map(c => ({ name: c.name, hex: c.hex_code })),
      /** Batch 11 Part 1: the resolved Type NAME (not a product slug) — every style has a real Type, so this drives the Blind Type filter directly. */
      blind_type: type?.name ?? null,
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
      blind_type: null,
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
      <GalleryClient
        cards={[...blindCards, ...awningCards]}
        isStaff={isStaff}
        customers={customers}
        properties={properties}
      />
    </div>
  )
}
