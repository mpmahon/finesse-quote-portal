import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { calculateLineItem, calculateQuoteTotals } from '@/lib/quote-engine'
import type { PricingParams } from '@/lib/quote-engine'
import type { UserRole } from '@/types/database'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { property_id } = body as { property_id: string }

  if (!property_id) {
    return NextResponse.json({ error: 'property_id is required' }, { status: 400 })
  }

  // Get user profile for role
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single()

  if (!profile) return NextResponse.json({ error: 'Profile not found' }, { status: 404 })

  // Get pricing config
  const { data: config } = await supabase
    .from('pricing_config')
    .select('*')
    .eq('id', 1)
    .single()

  if (!config) return NextResponse.json({ error: 'Pricing config not found' }, { status: 500 })

  // Get all configured windows for this property
  const { data: windows } = await supabase
    .from('windows')
    .select(`
      *,
      rooms!inner(name, property_id),
      products!inner(id, make, model, components(*))
    `)
    .eq('rooms.property_id', property_id)
    .not('product_id', 'is', null)

  if (!windows || windows.length === 0) {
    return NextResponse.json({ error: 'No configured windows found for this property' }, { status: 400 })
  }

  // Calculate line items
  const pricingParams: PricingParams = {
    exchange_rate: Number(config.exchange_rate),
    markup_pct: Number(config.default_markup_pct),
    duty_pct: Number(config.duty_percent),
    shipping_ttd: Number(config.shipping_fee_ttd),
    labor_ttd: Number(config.labor_cost_ttd),
    installation_ttd: Number(config.installation_cost_ttd),
    reseller_discount_pct: Number(config.reseller_discount_pct),
  }

  const lineItemResults = windows.map(w => {
    const result = calculateLineItem(
      {
        width_inches: Number(w.width_inches),
        height_inches: Number(w.height_inches),
        mount_type: w.mount_type,
      },
      w.products.components
    )
    return { window: w, result }
  })

  const totals = calculateQuoteTotals(
    lineItemResults.map(li => li.result),
    pricingParams,
    profile.role as UserRole
  )

  // Determine discount percent
  const discountPercent = profile.role === 'salesman' ? Number(config.reseller_discount_pct) : 0

  // Create quote
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

  // Create line items
  const lineItems = lineItemResults.map(({ window: w, result }) => ({
    quote_id: quote.id,
    window_id: w.id,
    product_id: w.product_id!,
    room_name: w.rooms.name,
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

  const { error: lineItemError } = await supabase
    .from('quote_line_items')
    .insert(lineItems)

  if (lineItemError) return NextResponse.json({ error: lineItemError.message }, { status: 500 })

  return NextResponse.json({ quote_id: quote.id, totals })
}
