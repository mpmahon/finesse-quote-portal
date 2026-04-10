import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateLineItem, calculateQuoteTotals } from '@/lib/quote-engine'
import type { LineItemResult, PricingParams } from '@/lib/quote-engine'
import type { Component, UserRole } from '@/types/database'

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

  // Fetch ALL windows for this property (including ones with no blind/awning)
  const { data: windows } = await supabase
    .from('windows')
    .select(`
      id, name, width_inches, height_inches, mount_type,
      has_blind, has_awning, product_id, shade_type, style, colour,
      rooms!inner(name, property_id),
      products(id, make, model, components(*))
    `)
    .eq('rooms.property_id', property_id)

  if (!windows || windows.length === 0) {
    return NextResponse.json({ error: 'No windows found for this property' }, { status: 400 })
  }

  // Validate: windows with a blind toggled on must have a product configured
  const unconfigured = windows.filter(
    w => w.has_blind && !w.product_id
  )
  if (unconfigured.length > 0) {
    return NextResponse.json({
      error: `${unconfigured.length} window(s) with blinds are not fully configured. Configure each window or toggle Blind off to track it as a zero-cost line item.`,
      unconfigured: unconfigured.map(w => ({ id: w.id, name: w.name })),
    }, { status: 400 })
  }

  // Categorize windows
  type WindowRow = typeof windows[number]
  const priceable: { window: WindowRow; result: LineItemResult }[] = []
  const zeroRows: WindowRow[] = []

  for (const w of windows) {
    if (w.has_blind && w.product_id && w.products) {
      const product = w.products as unknown as { id: string; make: string; model: string; components: Component[] }
      const result = calculateLineItem(
        {
          width_inches: Number(w.width_inches),
          height_inches: Number(w.height_inches),
          mount_type: w.mount_type,
        },
        product.components
      )
      priceable.push({ window: w, result })
    } else {
      // Either no blind/awning, or has_awning=true only (awnings not implemented).
      // Either way, this line item is zero-cost.
      zeroRows.push(w)
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

  // Only priceable windows contribute to labor/install counts and subtotal
  const totals = calculateQuoteTotals(
    priceable.map(li => li.result),
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

  // Build line items: priceable windows get real numbers, zero rows get zeros
  const getRoomName = (w: WindowRow): string => {
    const r = (w as unknown as { rooms: { name: string } | { name: string }[] }).rooms
    if (Array.isArray(r)) return r[0]?.name || ''
    return r?.name || ''
  }

  const priceableItems = priceable.map(({ window: w, result }) => ({
    quote_id: quote.id,
    window_id: w.id,
    product_id: w.product_id,
    room_name: getRoomName(w),
    window_name: w.name,
    blind_width: result.blind_width,
    blind_height: result.blind_height,
    fabric_area: result.fabric_area,
    chain_length: result.chain_length,
    shade_type: w.shade_type,
    style: w.style,
    colour: w.colour,
    ...result.costs,
  }))

  const zeroItems = zeroRows.map(w => ({
    quote_id: quote.id,
    window_id: w.id,
    product_id: null,
    room_name: getRoomName(w),
    window_name: w.name,
    blind_width: Number(w.width_inches),
    blind_height: Number(w.height_inches),
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
  }))

  const allItems = [...priceableItems, ...zeroItems]

  if (allItems.length > 0) {
    const { error: lineItemError } = await supabase
      .from('quote_line_items')
      .insert(allItems)
    if (lineItemError) return NextResponse.json({ error: lineItemError.message }, { status: 500 })
  }

  return NextResponse.json({ quote_id: quote.id, totals })
}
