import { describe, expect, it } from 'vitest'
import {
  calculateAwningLineItem,
  calculateBlindDimensions,
  calculateChainLength,
  calculateFabricArea,
  calculateLineItem,
  calculateQuoteTotals,
  lineItemTtd,
} from '@/lib/quote-engine'
import { estimateWindowsTotals, estimateWindowTtd } from '@/lib/estimates'
import type { AwningProduct, Component } from '@/types/database'

/**
 * Canonical formula lock (design doc v2 §6, resolved 2026-07-07):
 *   inside mount:  blind_width = window_width
 *   outside mount: blind_width = window_width + 6
 *   both mounts:   blind_height = window_height + 14
 *   fabric_area   = blind_width × blind_height
 *   chain_length  = (window_height × 1.6) / 2
 * These tests exist so no future build re-litigates the math.
 */

function comp(name: string, unit: Component['unit'], usd_price: number): Component {
  return {
    id: `c-${name}`,
    product_id: 'p-1',
    name,
    unit,
    usd_price,
    created_at: '',
    updated_at: '',
  }
}

const COMPONENTS: Component[] = [
  comp('cassette', 'per_inch', 0.5),
  comp('tube', 'per_inch', 0.3),
  comp('bottom_rail', 'per_inch', 0.2),
  comp('chain', 'per_inch', 0.1),
  comp('fabric', 'per_sq_inch', 0.01),
  comp('brackets', 'fixed', 4),
]

const PRICING = {
  exchange_rate: 7,
  retail_markup_pct: 40,
  wholesale_markup_pct: 20,
  labor_ttd: 30,
  installation_ttd: 60,
}

describe('blind dimensions', () => {
  it('inside mount: width exact, height +14', () => {
    expect(calculateBlindDimensions({ width_inches: 36, height_inches: 48, mount_type: 'inside' }))
      .toEqual({ blind_width: 36, blind_height: 62 })
  })

  it('outside mount: width +6 only, height still +14 (canonical resolution)', () => {
    expect(calculateBlindDimensions({ width_inches: 36, height_inches: 48, mount_type: 'outside' }))
      .toEqual({ blind_width: 42, blind_height: 62 })
  })

  it('fabric area and chain length', () => {
    expect(calculateFabricArea(42, 62)).toBe(2604)
    // Raw engine value — rounding to 2dp happens at the line-item level.
    expect(calculateChainLength(48)).toBeCloseTo(38.4, 10)
  })
})

describe('calculateLineItem', () => {
  it('computes the full component breakdown (inside mount)', () => {
    const r = calculateLineItem(
      { width_inches: 36, height_inches: 48, mount_type: 'inside' },
      COMPONENTS
    )
    expect(r.blind_width).toBe(36)
    expect(r.blind_height).toBe(62)
    expect(r.fabric_area).toBe(2232)
    expect(r.chain_length).toBe(38.4)
    expect(r.costs.cassette_cost).toBe(18) // 0.5 × 36
    expect(r.costs.tube_cost).toBe(10.8) // 0.3 × 36
    expect(r.costs.bottom_rail_cost).toBe(7.2) // 0.2 × 36
    expect(r.costs.chain_cost).toBe(3.84) // 0.1 × 38.4 (chain uses chain length)
    expect(r.costs.fabric_cost).toBe(22.32) // 0.01 × 2232
    expect(r.costs.fixed_costs).toBe(4)
    expect(r.costs.line_total_usd).toBe(66.16)
    expect(r.excluded_names).toEqual([])
  })

  it('outside mount widens per-inch and fabric costs', () => {
    const r = calculateLineItem(
      { width_inches: 36, height_inches: 48, mount_type: 'outside' },
      COMPONENTS
    )
    expect(r.blind_width).toBe(42)
    expect(r.costs.cassette_cost).toBe(21) // 0.5 × 42
    expect(r.costs.fabric_cost).toBe(26.04) // 0.01 × 2604
  })

  it('honours excluded hardware and never excludes fabric', () => {
    const r = calculateLineItem(
      { width_inches: 36, height_inches: 48, mount_type: 'inside' },
      COMPONENTS,
      ['cassette', 'tube', 'fabric'] // fabric exclusion must be ignored
    )
    expect(r.costs.cassette_cost).toBe(0)
    expect(r.costs.tube_cost).toBe(0)
    expect(r.costs.fabric_cost).toBe(22.32)
    expect(r.excluded_names).toEqual(['cassette', 'tube'])
    expect(r.costs.line_total_usd).toBe(37.36) // 66.16 − 18 − 10.8
  })
})

describe('awnings', () => {
  const awning: AwningProduct = {
    id: 'a-1',
    make: 'SunSetter',
    model: 'Classic',
    depth_inches: 36,
    frame_unit_price_usd: 1.5,
    material_unit_price_usd: 0.02,
    fixed_cost_usd: 50,
    colours: [],
    image_url: null,
    is_active: true,
    created_at: '',
    updated_at: '',
  }

  it('awning width +6, material area = width × depth', () => {
    const r = calculateAwningLineItem(36, awning)
    expect(r.awning_width).toBe(42)
    expect(r.material_area).toBe(1512)
    expect(r.costs.frame_cost).toBe(63) // 1.5 × 42
    expect(r.costs.material_cost).toBe(30.24) // 0.02 × 1512
    expect(r.costs.fixed_cost).toBe(50)
    expect(r.costs.line_total_usd).toBe(143.24)
  })
})

describe('calculateQuoteTotals', () => {
  const lines = [
    { costs: { line_total_usd: 100 } },
    { costs: { line_total_usd: 50 } },
  ]

  it('retail: markup 40%, labour + installation per line', () => {
    const t = calculateQuoteTotals(lines, PRICING, 'retail_customer')
    expect(t.subtotal_usd).toBe(150)
    expect(t.markup_pct).toBe(40)
    // 150 × 1.4 × 7 = 1470; + labour 2×30 = 1530; + install 2×60 = 1650
    expect(t.grand_total_ttd).toBe(1650)
    expect(t.installation_ttd).toBe(120)
    expect(t.priceable_count).toBe(2)
  })

  it('wholesale: markup 20%, no installation', () => {
    const t = calculateQuoteTotals(lines, PRICING, 'wholesale_customer')
    expect(t.markup_pct).toBe(20)
    // 150 × 1.2 × 7 = 1260; + labour 60 = 1320; no installation
    expect(t.grand_total_ttd).toBe(1320)
    expect(t.installation_ttd).toBe(0)
  })

  it('zero-cost quote (future-opportunity windows only)', () => {
    const t = calculateQuoteTotals([], PRICING, 'retail_customer')
    expect(t.grand_total_ttd).toBe(0)
    expect(t.priceable_count).toBe(0)
  })

  it('lineItemTtd matches the per-line share of the totals', () => {
    // one line: (100 × 1.4 × 7) + 30 labour = 1010
    expect(lineItemTtd(100, 40, 7, 30)).toBe(1010)
  })
})

describe('shared estimate layer matches the engine to the cent', () => {
  const window36x48 = {
    width_inches: 36,
    height_inches: 48,
    mount_type: 'inside' as const,
    has_blind: true,
    has_awning: false,
    product_id: 'p-1',
    awning_product_id: null,
    excluded_components: [],
    products: { components: COMPONENTS },
    awning_products: null,
  }

  const config = {
    exchange_rate: 7,
    retail_markup_pct: 40,
    wholesale_markup_pct: 20,
    labor_cost_ttd: 30,
    installation_cost_ttd: 60,
  }

  it('estimateWindowsTotals equals calculateQuoteTotals on the same lines', () => {
    const line = calculateLineItem(
      { width_inches: 36, height_inches: 48, mount_type: 'inside' },
      COMPONENTS
    )
    const direct = calculateQuoteTotals([line], PRICING, 'retail_customer')
    const estimated = estimateWindowsTotals([window36x48], config, 'retail_customer')
    expect(estimated.grand_total_ttd).toBe(direct.grand_total_ttd)
  })

  it('estimateWindowTtd = line TTD without installation', () => {
    const ttd = estimateWindowTtd(window36x48, config, 'retail_customer')
    expect(ttd).toBe(lineItemTtd(66.16, 40, 7, 30))
  })

  it('unconfigured window estimates to null', () => {
    expect(
      estimateWindowTtd({ ...window36x48, product_id: null }, config, 'retail_customer')
    ).toBeNull()
  })
})
