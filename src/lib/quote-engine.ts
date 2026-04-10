import type { Component, MountType, UserRole } from '@/types/database'

export interface WindowDimensions {
  width_inches: number
  height_inches: number
  mount_type: MountType
}

export interface BlindDimensions {
  blind_width: number
  blind_height: number
}

export interface LineItemCosts {
  cassette_cost: number
  tube_cost: number
  bottom_rail_cost: number
  chain_cost: number
  fabric_cost: number
  fixed_costs: number
  line_total_usd: number
}

export interface LineItemResult {
  blind_width: number
  blind_height: number
  fabric_area: number
  chain_length: number
  costs: LineItemCosts
}

export interface QuoteTotals {
  subtotal_usd: number
  markup_usd: number
  duty_usd: number
  total_usd: number
  total_ttd: number
  labor_ttd: number
  installation_ttd: number
  shipping_ttd: number
  discount_ttd: number
  grand_total_ttd: number
}

export interface PricingParams {
  exchange_rate: number
  markup_pct: number
  duty_pct: number
  shipping_ttd: number
  labor_ttd: number
  installation_ttd: number
  reseller_discount_pct: number
}

export function calculateBlindDimensions(config: WindowDimensions): BlindDimensions {
  if (config.mount_type === 'inside') {
    return {
      blind_width: config.width_inches,
      blind_height: config.height_inches + 14,
    }
  }
  // outside mount
  return {
    blind_width: config.width_inches + 6,
    blind_height: config.height_inches + 14,
  }
}

export function calculateFabricArea(blind_width: number, blind_height: number): number {
  return blind_width * blind_height
}

export function calculateChainLength(window_height: number): number {
  return (window_height * 1.6) / 2
}

export function calculateLineItem(
  config: WindowDimensions,
  components: Component[]
): LineItemResult {
  const dims = calculateBlindDimensions(config)
  const fabric_area = calculateFabricArea(dims.blind_width, dims.blind_height)
  const chain_length = calculateChainLength(config.height_inches)

  let cassette_cost = 0
  let tube_cost = 0
  let bottom_rail_cost = 0
  let chain_cost = 0
  let fabric_cost = 0
  let fixed_costs = 0

  for (const comp of components) {
    const price = Number(comp.usd_price)
    let cost = 0

    switch (comp.unit) {
      case 'per_inch':
        if (comp.name === 'chain') {
          cost = price * chain_length
        } else {
          cost = price * dims.blind_width
        }
        break
      case 'per_sq_inch':
        cost = price * fabric_area
        break
      case 'fixed':
        cost = price
        break
    }

    cost = Math.round(cost * 100) / 100

    // Categorize costs
    if (comp.name === 'cassette' || comp.name === 'cassette_insert') {
      cassette_cost += cost
    } else if (comp.name === 'tube') {
      tube_cost += cost
    } else if (comp.name.includes('bottom_rail') || comp.name.includes('adhesive')) {
      bottom_rail_cost += cost
    } else if (comp.name === 'chain') {
      chain_cost += cost
    } else if (comp.name === 'fabric') {
      fabric_cost += cost
    } else {
      // adapters, brackets, end_caps
      fixed_costs += cost
    }
  }

  const line_total_usd = Math.round(
    (cassette_cost + tube_cost + bottom_rail_cost + chain_cost + fabric_cost + fixed_costs) * 100
  ) / 100

  return {
    blind_width: dims.blind_width,
    blind_height: dims.blind_height,
    fabric_area: Math.round(fabric_area * 100) / 100,
    chain_length: Math.round(chain_length * 100) / 100,
    costs: {
      cassette_cost: Math.round(cassette_cost * 100) / 100,
      tube_cost: Math.round(tube_cost * 100) / 100,
      bottom_rail_cost: Math.round(bottom_rail_cost * 100) / 100,
      chain_cost: Math.round(chain_cost * 100) / 100,
      fabric_cost: Math.round(fabric_cost * 100) / 100,
      fixed_costs: Math.round(fixed_costs * 100) / 100,
      line_total_usd,
    },
  }
}

export function calculateQuoteTotals(
  lineItems: LineItemResult[],
  pricing: PricingParams,
  userRole: UserRole
): QuoteTotals {
  const numWindows = lineItems.length
  const subtotal_usd = lineItems.reduce((sum, li) => sum + li.costs.line_total_usd, 0)
  const markup_usd = subtotal_usd * (pricing.markup_pct / 100)
  const subtotal_marked_up = subtotal_usd + markup_usd
  const duty_usd = subtotal_marked_up * (pricing.duty_pct / 100)
  const total_usd = subtotal_marked_up + duty_usd
  const total_ttd = total_usd * pricing.exchange_rate
  const labor_ttd = pricing.labor_ttd * numWindows
  const installation_ttd = pricing.installation_ttd * numWindows
  const shipping_ttd = pricing.shipping_ttd

  let grand_total_ttd = total_ttd + labor_ttd + installation_ttd + shipping_ttd
  let discount_ttd = 0

  if (userRole === 'salesman') {
    discount_ttd = grand_total_ttd * (pricing.reseller_discount_pct / 100)
    grand_total_ttd -= discount_ttd
  }

  return {
    subtotal_usd: round2(subtotal_usd),
    markup_usd: round2(markup_usd),
    duty_usd: round2(duty_usd),
    total_usd: round2(total_usd),
    total_ttd: round2(total_ttd),
    labor_ttd: round2(labor_ttd),
    installation_ttd: round2(installation_ttd),
    shipping_ttd: round2(shipping_ttd),
    discount_ttd: round2(discount_ttd),
    grand_total_ttd: round2(grand_total_ttd),
  }
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}
