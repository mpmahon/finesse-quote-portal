import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  calculateBlindDimensions,
  calculateLineItem,
  calculateAwningLineItem,
  calculateQuoteTotals,
  resolveHardwareSpec,
} from '@/lib/quote-engine'
import type {
  AwningLineItemResult,
  LineItemResult,
  PricingParams,
} from '@/lib/quote-engine'
import { fetchBlindHierarchy, resolveStyleId, componentsForStyle } from '@/lib/blind-hierarchy'
import { BLIND_TYPE_NAME_TO_PRODUCT_SLUG } from '@/lib/constants'
import type { AwningProduct, HardwareSizeRule, HardwareSpec, MountType, UserRole } from '@/types/database'
import { isCustomerRole } from '@/types/database'

interface BlindRow {
  type: 'blind'
  window_id: string
  window_name: string
  room_name: string
  shade_type: string | null
  style: string | null
  colour: string | null
  /** Batch 7: Opacity name snapshot. */
  opacity: string | null
  /** Batch 7: Valance/Finisher name snapshot. */
  valance: string | null
  result: LineItemResult
  /** Resolved width-based hardware spec for this blind (null when the Type has no hardware slug mapping or no rule matches). */
  hardware_spec: HardwareSpec | null
  /** Effective unit multiplier: window_quantity x room_quantity. */
  units: number
  room_quantity: number
  window_quantity: number
}

interface AwningRow {
  type: 'awning'
  window_id: string
  window_name: string
  room_name: string
  awning_product_id: string
  awning_colour: string | null
  result: AwningLineItemResult
  units: number
  room_quantity: number
  window_quantity: number
}

interface ZeroRow {
  type: 'zero'
  window_id: string
  window_name: string
  room_name: string
  width_inches: number
  height_inches: number
  units: number
  room_quantity: number
  window_quantity: number
}

/**
 * Generate a quote for a property.
 *
 * Batch 4 changes:
 * - Reads the property owner's role to decide retail vs wholesale markup.
 * - Reads each window's `excluded_components` to skip unchecked hardware.
 * - Uses the new customer-type-aware `calculateQuoteTotals`.
 * - Sets `created_by` on the quote insert.
 * - Duty, shipping, and reseller discount are NOT applied (kept in DB for
 *   the future Purchasing Module, but zeroed out on the quote snapshot).
 *
 * WS1 changes:
 * - Customers have no direct INSERT on quotes/quote_line_items (migration
 *   00009). Authorization happens here — the property must be visible to the
 *   caller via RLS — and then the inserts run on the service-role client.
 * - Window dimension limits from pricing_config are enforced server-side.
 * - expires_at honours pricing_config.quote_validity_days.
 *
 * Batch 7 pre-work: each blind line's width-based hardware spec (tube size +
 * control type, resolved from the product's `blind_type` and the fabricated
 * blind width via `resolveHardwareSpec`) is snapshotted onto
 * `quote_line_items.hardware_spec` and also fed into `calculateLineItem` so
 * any future cost overrides on the matched rule are applied. Seeded
 * overrides are null today, so this has no cost impact yet.
 *
 * Batch 11 Part 1: blind pricing moved from `products`/`components` to the
 * Blind Management hierarchy — each blind line's components come from
 * `blind_style_components` for the window's stored Style (resolved from its
 * Type/Opacity/Style name snapshot via `resolveStyleId`), and the
 * width-based hardware slug is rekeyed off the Type name directly
 * (`BLIND_TYPE_NAME_TO_PRODUCT_SLUG`) since there's no more product to carry
 * the `blind_type` tag.
 *
 * Batch 11 Part 2: each line's `units` (window quantity x its room's
 * quantity) scales both its USD cost contribution and its labour/
 * installation charge in `calculateQuoteTotals`, and is snapshotted onto
 * `quote_line_items.quantity`/`room_quantity`/`window_quantity` so a quote
 * never drifts if the room/window's quantity is edited afterwards.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { property_id } = body as { property_id: string }

  if (!property_id) {
    return NextResponse.json({ error: 'property_id is required' }, { status: 400 })
  }

  // Fetch caller's profile
  const { data: callerProfile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!callerProfile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Fetch the property to get the owning customer's id
  const { data: property } = await supabase
    .from('properties')
    .select('user_id')
    .eq('id', property_id)
    .single()
  if (!property) return NextResponse.json({ error: 'Property not found' }, { status: 404 })

  // Determine customer role for markup. Staff creating on behalf → use the
  // owner's role. Customer creating their own → use their own role.
  let customerRole: UserRole
  if (isCustomerRole(callerProfile.role as UserRole)) {
    customerRole = callerProfile.role as UserRole
  } else {
    // Staff: look up the property owner's role
    const { data: ownerProfile } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', property.user_id)
      .single()
    customerRole = (ownerProfile?.role ?? 'retail_customer') as UserRole
  }

  // Pricing config
  const { data: config } = await supabase
    .from('pricing_config')
    .select('*')
    .eq('id', 1)
    .single()
  if (!config) return NextResponse.json({ error: 'Pricing config not found' }, { status: 500 })

  // Width-based hardware size rules (Batch 7 pre-work) — resolved per blind
  // line below via resolveHardwareSpec. Small, admin-managed table; fetched
  // in full rather than per-window-filtered.
  const { data: hardwareRules } = await supabase
    .from('hardware_size_rules')
    .select('*')
  const allHardwareRules = (hardwareRules ?? []) as HardwareSizeRule[]

  // Blind pricing hierarchy (Batch 11 Part 1 — pricing moved from
  // products/components to blind_styles). Fetched with activeOnly: false so
  // an already-saved window's style still resolves even if it's since been
  // deactivated in Blind Management.
  const hierarchy = await fetchBlindHierarchy(supabase, { activeOnly: false })

  // Fetch ALL windows for this property + their room (for its quantity) +
  // awning products. Blind pricing no longer joins a product — it resolves
  // from the window's own hierarchy name snapshot via `hierarchy` above.
  const { data: windows } = await supabase
    .from('windows')
    .select(`
      id, name, width_inches, height_inches, mount_type,
      has_blind, has_awning,
      shade_type, style, colour, opacity, valance,
      awning_product_id, awning_colour,
      excluded_components, quantity,
      rooms!inner(name, property_id, quantity),
      awning_products(*)
    `)
    .eq('rooms.property_id', property_id)

  if (!windows || windows.length === 0) {
    return NextResponse.json({ error: 'No windows found for this property' }, { status: 400 })
  }

  // Enforce window dimension limits (WS1 §5.4) — mirror of the client-side
  // zod check, so out-of-range windows can't reach a quote via direct calls.
  const minSize = Number(config.min_window_size_in)
  const maxWidth = Number(config.max_window_width_in)
  const maxHeight = Number(config.max_window_height_in)
  const outOfRange = windows.filter(w => {
    const width = Number(w.width_inches)
    const height = Number(w.height_inches)
    return width < minSize || height < minSize || width > maxWidth || height > maxHeight
  })
  if (outOfRange.length > 0) {
    const names = outOfRange.map(w => w.name).join(', ')
    return NextResponse.json({
      error: `Window dimensions out of range (min ${minSize}", max ${maxWidth}"W × ${maxHeight}"H): ${names}. Update the window measurements before quoting.`,
    }, { status: 400 })
  }

  // Validate: any toggled-on blind/awning must be configured. Batch 11 Part
  // 1: a blind is "configured" once it has a Style selected — pricing
  // resolves from the style, not a product — and that style must actually
  // have pricing components set up in Blind Management.
  const unconfiguredBlinds = windows.filter(w => w.has_blind && !w.style)
  const unpricedBlinds = windows.filter(w => {
    if (!w.has_blind || !w.style) return false
    const styleId = resolveStyleId(hierarchy, { shadeType: w.shade_type, opacity: w.opacity, style: w.style })
    return componentsForStyle(hierarchy, styleId).length === 0
  })
  const unconfiguredAwnings = windows.filter(w => w.has_awning && !w.awning_product_id)
  if (unconfiguredBlinds.length > 0 || unpricedBlinds.length > 0 || unconfiguredAwnings.length > 0) {
    const messages: string[] = []
    if (unconfiguredBlinds.length > 0) {
      messages.push(`${unconfiguredBlinds.length} window(s) with blinds are not configured`)
    }
    if (unpricedBlinds.length > 0) {
      const names = unpricedBlinds.map(w => w.name).join(', ')
      messages.push(`${unpricedBlinds.length} window(s) have a blind Style with no pricing set up yet (${names}) — add its components in Admin > Blind Management`)
    }
    if (unconfiguredAwnings.length > 0) {
      messages.push(`${unconfiguredAwnings.length} window(s) with awnings are not configured`)
    }
    return NextResponse.json({
      error: messages.join('. ') + '. Configure them or toggle the feature off.',
    }, { status: 400 })
  }

  // Build rows
  const rows: (BlindRow | AwningRow | ZeroRow)[] = []

  type WindowWithRelations = {
    id: string
    name: string
    width_inches: number
    height_inches: number
    mount_type: MountType
    has_blind: boolean
    has_awning: boolean
    shade_type: string | null
    style: string | null
    colour: string | null
    /** Batch 7: Opacity name. */
    opacity: string | null
    /** Batch 7: Valance/Finisher name. */
    valance: string | null
    awning_product_id: string | null
    awning_colour: string | null
    excluded_components: string[]
    /** Batch 11 Part 2: this window's own identical-window multiplier. */
    quantity: number
    rooms: { name: string; quantity: number } | { name: string; quantity: number }[]
    awning_products: AwningProduct | null
  }

  const getRoom = (w: WindowWithRelations): { name: string; quantity: number } => {
    const r = w.rooms
    const room = Array.isArray(r) ? r[0] : r
    return { name: room?.name || '', quantity: room?.quantity ?? 1 }
  }

  for (const w of windows as unknown as WindowWithRelations[]) {
    const room = getRoom(w)
    const roomName = room.name
    const windowQuantity = Math.max(1, w.quantity)
    const roomQuantity = Math.max(1, room.quantity)
    const units = windowQuantity * roomQuantity
    let hasPriceableLine = false

    if (w.has_blind && w.style) {
      const windowConfig = {
        width_inches: Number(w.width_inches),
        height_inches: Number(w.height_inches),
        mount_type: w.mount_type,
      }

      const styleId = resolveStyleId(hierarchy, { shadeType: w.shade_type, opacity: w.opacity, style: w.style })
      const components = componentsForStyle(hierarchy, styleId)

      // Resolve the width-based hardware spec (Batch 7 pre-work) from the
      // FABRICATED blind width, not the raw window width, before pricing —
      // when the matched rule has cost overrides set, calculateLineItem
      // needs the rule itself, not just the derived spec. Rekeyed off the
      // window's Type name (Batch 11 Part 1 — the product's blind_type tag
      // is gone) via the same slug map the configurator uses.
      const blindWidth = calculateBlindDimensions(windowConfig).blind_width
      const hardwareSlug = w.shade_type ? BLIND_TYPE_NAME_TO_PRODUCT_SLUG[w.shade_type] : undefined
      const { spec: hardware_spec } = resolveHardwareSpec(
        hardwareSlug ?? null,
        blindWidth,
        allHardwareRules
      )
      const matchedRule = hardware_spec
        ? allHardwareRules.find(r => r.id === hardware_spec.rule_id) ?? null
        : null

      const result = calculateLineItem(
        windowConfig,
        components,
        w.excluded_components || [],
        matchedRule
      )
      rows.push({
        type: 'blind',
        window_id: w.id,
        window_name: w.name,
        room_name: roomName,
        shade_type: w.shade_type,
        style: w.style,
        colour: w.colour,
        opacity: w.opacity,
        valance: w.valance,
        result,
        hardware_spec,
        units,
        room_quantity: roomQuantity,
        window_quantity: windowQuantity,
      })
      hasPriceableLine = true
    }

    if (w.has_awning && w.awning_product_id && w.awning_products) {
      const result = calculateAwningLineItem(Number(w.width_inches), w.awning_products)
      rows.push({
        type: 'awning',
        window_id: w.id,
        window_name: w.name,
        room_name: roomName,
        awning_product_id: w.awning_product_id,
        awning_colour: w.awning_colour,
        result,
        units,
        room_quantity: roomQuantity,
        window_quantity: windowQuantity,
      })
      hasPriceableLine = true
    }

    if (!hasPriceableLine) {
      rows.push({
        type: 'zero',
        window_id: w.id,
        window_name: w.name,
        room_name: roomName,
        width_inches: Number(w.width_inches),
        units,
        room_quantity: roomQuantity,
        window_quantity: windowQuantity,
        height_inches: Number(w.height_inches),
      })
    }
  }

  // Collect priceable items for the totals calculation — `units` carries
  // each line's room x window quantity multiplier through to the engine.
  const priceableItems: { costs: { line_total_usd: number }; units: number }[] = []
  for (const row of rows) {
    if (row.type === 'blind' || row.type === 'awning') {
      priceableItems.push({ costs: { line_total_usd: row.result.costs.line_total_usd }, units: row.units })
    }
  }

  const pricingParams: PricingParams = {
    exchange_rate: Number(config.exchange_rate),
    retail_markup_pct: Number(config.retail_markup_pct),
    wholesale_markup_pct: Number(config.wholesale_markup_pct),
    labor_ttd: Number(config.labor_cost_ttd),
    installation_ttd: Number(config.installation_cost_ttd),
  }

  const totals = calculateQuoteTotals(priceableItems, pricingParams, customerRole)

  // Quote + line item inserts run on the service-role client: the caller has
  // already been authorized (property visible via RLS above), and customers
  // intentionally have no direct INSERT on these tables.
  const admin = createAdminClient()
  const validityDays = Math.max(1, Math.round(Number(config.quote_validity_days) || 14))
  const expiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString()

  // Staff-created quotes start as drafts (explicit "Send Quote" step);
  // customer self-generated quotes are already in the customer's hands, so
  // they go straight to 'sent' and can be accepted immediately.
  const isSelfService = user.id === property.user_id
  const initialStatus = isSelfService ? 'sent' : 'draft'

  const { data: quote, error: quoteError } = await admin
    .from('quotes')
    .insert({
      user_id: property.user_id,
      created_by: user.id,
      property_id,
      status: initialStatus,
      sent_at: isSelfService ? new Date().toISOString() : null,
      expires_at: expiresAt,
      exchange_rate: pricingParams.exchange_rate,
      markup_percent: totals.markup_pct,
      discount_percent: 0,
      duty_percent: 0,
      shipping_fee_ttd: 0,
      labor_cost_ttd: pricingParams.labor_ttd,
      installation_cost_ttd: pricingParams.installation_ttd,
      subtotal_usd: totals.subtotal_usd,
      total_ttd: totals.grand_total_ttd,
    })
    .select()
    .single()

  if (quoteError) return NextResponse.json({ error: quoteError.message }, { status: 500 })

  // Build line item rows. Awning rows reuse the blind columns semantically.
  const lineItemsToInsert = rows.map(row => {
    if (row.type === 'blind') {
      return {
        quote_id: quote.id,
        window_id: row.window_id,
        // Batch 11 Part 1: blind pricing no longer comes from a product —
        // this column is left null for new-style quotes (still nullable
        // since migration 00005; historical rows are untouched).
        product_id: null,
        awning_product_id: null,
        line_type: 'blind',
        room_name: row.room_name,
        window_name: row.window_name,
        blind_width: row.result.blind_width,
        blind_height: row.result.blind_height,
        fabric_area: row.result.fabric_area,
        chain_length: row.result.chain_length,
        shade_type: row.shade_type,
        style: row.style,
        colour: row.colour,
        opacity: row.opacity,
        valance: row.valance,
        hardware_spec: row.hardware_spec,
        quantity: row.units,
        room_quantity: row.room_quantity,
        window_quantity: row.window_quantity,
        ...row.result.costs,
      }
    }
    if (row.type === 'awning') {
      return {
        quote_id: quote.id,
        window_id: row.window_id,
        product_id: null,
        awning_product_id: row.awning_product_id,
        line_type: 'awning',
        room_name: row.room_name,
        window_name: row.window_name,
        blind_width: row.result.awning_width,
        blind_height: row.result.awning_depth,
        fabric_area: row.result.material_area,
        chain_length: 0,
        shade_type: null,
        style: null,
        colour: row.awning_colour,
        opacity: null,
        valance: null,
        hardware_spec: null,
        quantity: row.units,
        room_quantity: row.room_quantity,
        window_quantity: row.window_quantity,
        cassette_cost: row.result.costs.frame_cost,
        tube_cost: 0,
        bottom_rail_cost: 0,
        chain_cost: 0,
        fabric_cost: row.result.costs.material_cost,
        fixed_costs: row.result.costs.fixed_cost,
        line_total_usd: row.result.costs.line_total_usd,
      }
    }
    // zero
    return {
      quote_id: quote.id,
      window_id: row.window_id,
      product_id: null,
      awning_product_id: null,
      line_type: 'zero',
      room_name: row.room_name,
      window_name: row.window_name,
      hardware_spec: null,
      blind_width: row.width_inches,
      blind_height: row.height_inches,
      fabric_area: 0,
      chain_length: 0,
      shade_type: null,
      style: null,
      colour: null,
      opacity: null,
      valance: null,
      quantity: row.units,
      room_quantity: row.room_quantity,
      window_quantity: row.window_quantity,
      cassette_cost: 0,
      tube_cost: 0,
      bottom_rail_cost: 0,
      chain_cost: 0,
      fabric_cost: 0,
      fixed_costs: 0,
      line_total_usd: 0,
    }
  })

  if (lineItemsToInsert.length > 0) {
    const { error: lineItemError } = await admin
      .from('quote_line_items')
      .insert(lineItemsToInsert)
    if (lineItemError) {
      // Don't leave a header-only quote behind if line items failed.
      await admin.from('quotes').delete().eq('id', quote.id)
      return NextResponse.json({ error: lineItemError.message }, { status: 500 })
    }
  }

  return NextResponse.json({ quote_id: quote.id, totals })
}
