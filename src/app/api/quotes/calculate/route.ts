import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  calculateLineItem,
  calculateAwningLineItem,
  calculateQuoteTotals,
} from '@/lib/quote-engine'
import type {
  AwningLineItemResult,
  LineItemResult,
  PricingParams,
} from '@/lib/quote-engine'
import type { AwningProduct, Component, UserRole } from '@/types/database'

interface BlindRow {
  type: 'blind'
  window_id: string
  window_name: string
  room_name: string
  product_id: string
  shade_type: string | null
  style: string | null
  colour: string | null
  result: LineItemResult
}

interface AwningRow {
  type: 'awning'
  window_id: string
  window_name: string
  room_name: string
  awning_product_id: string
  awning_colour: string | null
  result: AwningLineItemResult
}

interface ZeroRow {
  type: 'zero'
  window_id: string
  window_name: string
  room_name: string
  width_inches: number
  height_inches: number
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { property_id } = body as { property_id: string }

  if (!property_id) {
    return NextResponse.json({ error: 'property_id is required' }, { status: 400 })
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()
  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  const { data: config } = await supabase
    .from('pricing_config')
    .select('*')
    .eq('id', 1)
    .single()
  if (!config) return NextResponse.json({ error: 'Pricing config not found' }, { status: 500 })

  // Fetch ALL windows for this property + their products + awning products
  const { data: windows } = await supabase
    .from('windows')
    .select(`
      id, name, width_inches, height_inches, mount_type,
      has_blind, has_awning,
      product_id, shade_type, style, colour,
      awning_product_id, awning_colour,
      rooms!inner(name, property_id),
      products(id, make, model, components(*)),
      awning_products(*)
    `)
    .eq('rooms.property_id', property_id)

  if (!windows || windows.length === 0) {
    return NextResponse.json({ error: 'No windows found for this property' }, { status: 400 })
  }

  // Validate: any toggled-on product must be configured
  const unconfiguredBlinds = windows.filter(w => w.has_blind && !w.product_id)
  const unconfiguredAwnings = windows.filter(w => w.has_awning && !w.awning_product_id)
  if (unconfiguredBlinds.length > 0 || unconfiguredAwnings.length > 0) {
    const messages: string[] = []
    if (unconfiguredBlinds.length > 0) {
      messages.push(`${unconfiguredBlinds.length} window(s) with blinds are not configured`)
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
    mount_type: 'inside' | 'outside'
    has_blind: boolean
    has_awning: boolean
    product_id: string | null
    shade_type: string | null
    style: string | null
    colour: string | null
    awning_product_id: string | null
    awning_colour: string | null
    rooms: { name: string } | { name: string }[]
    products: { components: Component[] } | null
    awning_products: AwningProduct | null
  }

  const getRoomName = (w: WindowWithRelations): string => {
    const r = w.rooms
    if (Array.isArray(r)) return r[0]?.name || ''
    return r?.name || ''
  }

  for (const w of windows as unknown as WindowWithRelations[]) {
    const roomName = getRoomName(w)
    let hasPriceableLine = false

    if (w.has_blind && w.product_id && w.products) {
      const result = calculateLineItem(
        {
          width_inches: Number(w.width_inches),
          height_inches: Number(w.height_inches),
          mount_type: w.mount_type,
        },
        w.products.components
      )
      rows.push({
        type: 'blind',
        window_id: w.id,
        window_name: w.name,
        room_name: roomName,
        product_id: w.product_id,
        shade_type: w.shade_type,
        style: w.style,
        colour: w.colour,
        result,
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
        height_inches: Number(w.height_inches),
      })
    }
  }

  // Totals: blinds + awnings both contribute to subtotal. Labor/install
  // is counted per priceable line item (each install is an install).
  const priceableTotals: LineItemResult[] = []
  for (const row of rows) {
    if (row.type === 'blind') {
      priceableTotals.push(row.result)
    } else if (row.type === 'awning') {
      // Adapt awning result into LineItemResult shape for calculateQuoteTotals
      priceableTotals.push({
        blind_width: row.result.awning_width,
        blind_height: row.result.awning_depth,
        fabric_area: row.result.material_area,
        chain_length: 0,
        costs: {
          cassette_cost: row.result.costs.frame_cost,
          tube_cost: 0,
          bottom_rail_cost: 0,
          chain_cost: 0,
          fabric_cost: row.result.costs.material_cost,
          fixed_costs: row.result.costs.fixed_cost,
          line_total_usd: row.result.costs.line_total_usd,
        },
      })
    }
  }

  const pricingParams: PricingParams = {
    exchange_rate: Number(config.exchange_rate),
    markup_pct: Number(config.default_markup_pct),
    duty_pct: Number(config.duty_percent),
    shipping_ttd: Number(config.shipping_fee_ttd),
    labor_ttd: Number(config.labor_cost_ttd),
    installation_ttd: Number(config.installation_cost_ttd),
    reseller_discount_pct: Number(config.reseller_discount_pct),
  }

  const totals = calculateQuoteTotals(
    priceableTotals,
    pricingParams,
    profile.role as UserRole
  )

  const discountPercent = profile.role === 'salesman' ? Number(config.reseller_discount_pct) : 0

  const { data: quote, error: quoteError } = await supabase
    .from('quotes')
    .insert({
      user_id: user.id,
      property_id,
      status: 'final',
      exchange_rate: pricingParams.exchange_rate,
      markup_percent: pricingParams.markup_pct,
      discount_percent: discountPercent,
      duty_percent: pricingParams.duty_pct,
      shipping_fee_ttd: pricingParams.shipping_ttd,
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
        product_id: row.product_id,
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
      blind_width: row.width_inches,
      blind_height: row.height_inches,
      fabric_area: 0,
      chain_length: 0,
      shade_type: null,
      style: null,
      colour: null,
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
    const { error: lineItemError } = await supabase
      .from('quote_line_items')
      .insert(lineItemsToInsert)
    if (lineItemError) return NextResponse.json({ error: lineItemError.message }, { status: 500 })
  }

  return NextResponse.json({ quote_id: quote.id, totals })
}
