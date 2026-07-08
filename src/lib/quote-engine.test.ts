import { describe, expect, it } from 'vitest'
import {
  calculateAwningLineItem,
  calculateBlindDimensions,
  calculateChainLength,
  calculateFabricArea,
  calculateLineItem,
  calculateQuoteTotals,
  lineItemTtd,
  resolveHardwareSpec,
} from '@/lib/quote-engine'
import { estimateWindowsTotals, estimateWindowTtd } from '@/lib/estimates'
import type { BlindHierarchy } from '@/lib/blind-hierarchy'
import type { AwningProduct, Component, HardwareSizeRule } from '@/types/database'

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

// ============================================================
// Room/window quantity multipliers (Batch 11 Part 2)
// ============================================================

describe('calculateQuoteTotals with quantity (units) multipliers', () => {
  it('quantity=1 (explicit or omitted) identity — matches the un-multiplied result', () => {
    const withoutUnits = calculateQuoteTotals(
      [{ costs: { line_total_usd: 100 } }, { costs: { line_total_usd: 50 } }],
      PRICING,
      'retail_customer'
    )
    const withUnitsOne = calculateQuoteTotals(
      [{ costs: { line_total_usd: 100 }, units: 1 }, { costs: { line_total_usd: 50 }, units: 1 }],
      PRICING,
      'retail_customer'
    )
    expect(withUnitsOne).toEqual(withoutUnits)
  })

  it('room x window multiplication scales subtotal, priceable_count, and grand total', () => {
    // One line at $100 USD/unit, quantity 3 (e.g. a room x1 with a window x3,
    // or vice versa — calculateQuoteTotals only sees the combined units).
    const t = calculateQuoteTotals(
      [{ costs: { line_total_usd: 100 }, units: 3 }],
      PRICING,
      'retail_customer'
    )
    expect(t.subtotal_usd).toBe(300) // 100 × 3
    expect(t.priceable_count).toBe(3)
    // 300 × 1.4 × 7 = 2940; + labour 3×30 = 3030; + install 3×60 = 3210
    expect(t.grand_total_ttd).toBe(3210)
    expect(t.installation_ttd).toBe(180)
  })

  it('labour and installation scale per unit, not per line', () => {
    // A hotel-style case: one room configured once (quantity 40 rooms),
    // one window per room, no window-level multiplier of its own.
    const t = calculateQuoteTotals(
      [{ costs: { line_total_usd: 10 }, units: 40 }],
      PRICING,
      'retail_customer'
    )
    // Labour: 30 × 40 = 1200. Installation: 60 × 40 = 2400.
    expect(t.installation_ttd).toBe(2400)
    // subtotal 400 × 1.4 × 7 = 3920; + labour 1200 = 5120; + install 2400 = 7520
    expect(t.grand_total_ttd).toBe(7520)
  })

  it('mixed units across lines sum correctly (e.g. one qty-1 window plus one qty-3 window)', () => {
    const t = calculateQuoteTotals(
      [
        { costs: { line_total_usd: 100 }, units: 1 },
        { costs: { line_total_usd: 50 }, units: 3 },
      ],
      PRICING,
      'wholesale_customer'
    )
    expect(t.priceable_count).toBe(4)
    expect(t.subtotal_usd).toBe(250) // 100×1 + 50×3
  })
})

describe('lineItemTtd with a units multiplier', () => {
  it('units=1 (default) matches the pre-quantity formula', () => {
    expect(lineItemTtd(100, 40, 7, 30)).toBe(lineItemTtd(100, 40, 7, 30, 1))
  })

  it('units=3 multiplies both the marked-up cost and the labour', () => {
    // (100 × 3) × 1.4 × 7 = 2940; + labour 30×3 = 90 -> 3030
    expect(lineItemTtd(100, 40, 7, 30, 3)).toBe(3030)
  })
})

describe('shared estimate layer matches the engine to the cent', () => {
  /** Minimal single-style hierarchy fixture mirroring COMPONENTS as that style's pricing rows. */
  const HIERARCHY: BlindHierarchy = {
    types: [{ id: 't1', name: 'Roller Shade', is_active: true, sort_order: 0, created_at: '', updated_at: '' }],
    opacities: [{ id: 'o1', type_id: 't1', name: 'Sheer', is_active: true, sort_order: 0, created_at: '', updated_at: '' }],
    styles: [{ id: 's1', opacity_id: 'o1', name: 'Standard', image_url: null, is_active: true, sort_order: 0, created_at: '', updated_at: '' }],
    colours: [],
    valances: [],
    styleComponents: COMPONENTS.map(c => ({
      id: `sc-${c.name}`,
      style_id: 's1',
      name: c.name,
      unit: c.unit,
      usd_price: c.usd_price,
      created_at: '',
      updated_at: '',
    })),
  }

  const window36x48 = {
    width_inches: 36,
    height_inches: 48,
    mount_type: 'inside' as const,
    has_blind: true,
    has_awning: false,
    shade_type: 'Roller Shade',
    opacity: 'Sheer',
    style: 'Standard',
    awning_product_id: null,
    excluded_components: [],
    awning_products: null,
    quantity: 1,
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
    const estimated = estimateWindowsTotals([window36x48], config, 'retail_customer', HIERARCHY)
    expect(estimated.grand_total_ttd).toBe(direct.grand_total_ttd)
  })

  it('estimateWindowTtd = line TTD without installation', () => {
    const ttd = estimateWindowTtd(window36x48, config, 'retail_customer', HIERARCHY)
    expect(ttd).toBe(lineItemTtd(66.16, 40, 7, 30))
  })

  it('unconfigured window (no style) estimates to null', () => {
    expect(
      estimateWindowTtd({ ...window36x48, style: null }, config, 'retail_customer', HIERARCHY)
    ).toBeNull()
  })

  it('a style with no priced components estimates to null (not a silent $0)', () => {
    const emptyHierarchy: BlindHierarchy = { ...HIERARCHY, styleComponents: [] }
    expect(
      estimateWindowTtd(window36x48, config, 'retail_customer', emptyHierarchy)
    ).toBeNull()
  })

  it('room quantity multiplies the window estimate (hotel-style: one room x N)', () => {
    const timesFive = estimateWindowTtd(window36x48, config, 'retail_customer', HIERARCHY, 5)
    expect(timesFive).toBe(lineItemTtd(66.16, 40, 7, 30, 5))
  })

  it('window quantity x room quantity combine multiplicatively', () => {
    const window3x = { ...window36x48, quantity: 3 }
    // 3 identical windows (quantity 3) in a room quoted x2 (room quantity 2) = 6 units.
    const ttd = estimateWindowTtd(window3x, config, 'retail_customer', HIERARCHY, 2)
    expect(ttd).toBe(lineItemTtd(66.16, 40, 7, 30, 6))
  })

  it('estimateWindowsTotals applies the room quantity to every window passed in', () => {
    const totals = estimateWindowsTotals([window36x48, window36x48], config, 'retail_customer', HIERARCHY, 4)
    // Two windows, quantity 1 each, room quantity 4 -> 8 total units.
    expect(totals.priceable_count).toBe(8)
  })
})

// ============================================================
// Width-based hardware support rules (Batch 7 pre-work)
// ============================================================

function hwRule(
  overrides: Partial<HardwareSizeRule> & Pick<HardwareSizeRule, 'blind_type' | 'min_width_in' | 'max_width_in' | 'tube_size' | 'control_type'>
): HardwareSizeRule {
  return {
    id: `${overrides.blind_type}-${overrides.min_width_in}-${overrides.max_width_in}`,
    is_motorized: false,
    tube_usd_per_inch_override: null,
    control_fixed_usd: null,
    created_at: '',
    updated_at: '',
    ...overrides,
  }
}

/** Mirrors the six seeded tiers from migration 00016, for 'roller_shade' only (the 'neolux' seed is identical). */
const ROLLER_RULES: HardwareSizeRule[] = [
  hwRule({ blind_type: 'roller_shade', min_width_in: 0, max_width_in: 84, tube_size: '1 1/4"', control_type: 'VTX 15' }),
  hwRule({ blind_type: 'roller_shade', min_width_in: 85, max_width_in: 108, tube_size: '1 1/2"', control_type: 'VTX 20' }),
  hwRule({ blind_type: 'roller_shade', min_width_in: 109, max_width_in: 120, tube_size: '1 3/4"', control_type: 'VTX 30' }),
  hwRule({ blind_type: 'roller_shade', min_width_in: 121, max_width_in: 144, tube_size: '2"', control_type: 'Motor', is_motorized: true }),
  hwRule({ blind_type: 'roller_shade', min_width_in: 145, max_width_in: 180, tube_size: '2 1/2"', control_type: 'Motor', is_motorized: true }),
  hwRule({ blind_type: 'roller_shade', min_width_in: 181, max_width_in: 228, tube_size: '3 1/4"', control_type: 'Motor', is_motorized: true }),
]

describe('resolveHardwareSpec', () => {
  it('null blind_type always resolves to a null spec, never exceedsMax', () => {
    expect(resolveHardwareSpec(null, 500, ROLLER_RULES)).toEqual({ spec: null, exceedsMax: false })
  })

  it('blind_type with no matching rules resolves to a null spec, never exceedsMax', () => {
    expect(resolveHardwareSpec('sliding_panel', 50, ROLLER_RULES)).toEqual({ spec: null, exceedsMax: false })
  })

  it('84 (tier 1 boundary) resolves VTX 15, not motorized', () => {
    const { spec, exceedsMax } = resolveHardwareSpec('roller_shade', 84, ROLLER_RULES)
    expect(exceedsMax).toBe(false)
    expect(spec).toMatchObject({ tube_size: '1 1/4"', control_type: 'VTX 15', is_motorized: false })
  })

  it('85 (tier 2 boundary) resolves VTX 20', () => {
    const { spec } = resolveHardwareSpec('roller_shade', 85, ROLLER_RULES)
    expect(spec).toMatchObject({ tube_size: '1 1/2"', control_type: 'VTX 20', is_motorized: false })
  })

  it('84.5 (fractional width between whole-inch tiers) rolls up to the next tier, not a gap', () => {
    // Widths are measured to 1/8"; the seeded tiers step 84 → 85. A width a
    // fraction past a tier max must resolve to the next (heavier) tier.
    const { spec, exceedsMax } = resolveHardwareSpec('roller_shade', 84.5, ROLLER_RULES)
    expect(exceedsMax).toBe(false)
    expect(spec).toMatchObject({ tube_size: '1 1/2"', control_type: 'VTX 20', is_motorized: false })
  })

  it('120.5 (fractional width at the motorization boundary) rolls up to Motor', () => {
    const { spec } = resolveHardwareSpec('roller_shade', 120.5, ROLLER_RULES)
    expect(spec).toMatchObject({ tube_size: '2"', control_type: 'Motor', is_motorized: true })
  })

  it('108 (tier 2 boundary) resolves VTX 20', () => {
    const { spec } = resolveHardwareSpec('roller_shade', 108, ROLLER_RULES)
    expect(spec).toMatchObject({ tube_size: '1 1/2"', control_type: 'VTX 20' })
  })

  it('109 (tier 3 boundary) resolves VTX 30', () => {
    const { spec } = resolveHardwareSpec('roller_shade', 109, ROLLER_RULES)
    expect(spec).toMatchObject({ tube_size: '1 3/4"', control_type: 'VTX 30', is_motorized: false })
  })

  it('120 (motorization boundary, still manual) resolves VTX 30, not motorized', () => {
    const { spec } = resolveHardwareSpec('roller_shade', 120, ROLLER_RULES)
    expect(spec).toMatchObject({ control_type: 'VTX 30', is_motorized: false })
  })

  it('121 (motorization boundary, now motorized) resolves Motor', () => {
    const { spec } = resolveHardwareSpec('roller_shade', 121, ROLLER_RULES)
    expect(spec).toMatchObject({ tube_size: '2"', control_type: 'Motor', is_motorized: true })
  })

  it('228 (absolute fabrication max) resolves fine, not exceeded', () => {
    const { spec, exceedsMax } = resolveHardwareSpec('roller_shade', 228, ROLLER_RULES)
    expect(exceedsMax).toBe(false)
    expect(spec).toMatchObject({ tube_size: '3 1/4"', control_type: 'Motor', is_motorized: true })
  })

  it('228.01 exceeds the fabrication max — null spec, exceedsMax true', () => {
    const { spec, exceedsMax } = resolveHardwareSpec('roller_shade', 228.01, ROLLER_RULES)
    expect(spec).toBeNull()
    expect(exceedsMax).toBe(true)
  })

  it('rule_id on the matched rule is passed through', () => {
    const { spec } = resolveHardwareSpec('roller_shade', 50, ROLLER_RULES)
    expect(spec?.rule_id).toBe(ROLLER_RULES[0].id)
    expect(spec?.blind_type).toBe('roller_shade')
  })
})

describe('calculateLineItem with a hardware rule', () => {
  it('a rule with both overrides null leaves costs identical to no rule at all', () => {
    const withoutRule = calculateLineItem(
      { width_inches: 36, height_inches: 48, mount_type: 'inside' },
      COMPONENTS
    )
    const nullOverrideRule = hwRule({
      blind_type: 'roller_shade', min_width_in: 0, max_width_in: 84,
      tube_size: '1 1/4"', control_type: 'VTX 15',
    })
    const withRule = calculateLineItem(
      { width_inches: 36, height_inches: 48, mount_type: 'inside' },
      COMPONENTS,
      [],
      nullOverrideRule
    )
    expect(withRule).toEqual(withoutRule)
  })

  it('a tube price override replaces the tube component cost', () => {
    const rule = hwRule({
      blind_type: 'roller_shade', min_width_in: 0, max_width_in: 84,
      tube_size: '1 1/4"', control_type: 'VTX 15',
      tube_usd_per_inch_override: 0.75,
    })
    const r = calculateLineItem(
      { width_inches: 36, height_inches: 48, mount_type: 'inside' },
      COMPONENTS,
      [],
      rule
    )
    expect(r.costs.tube_cost).toBe(27) // 0.75 × 36, not the component's 0.3 × 36
    expect(r.costs.line_total_usd).toBe(66.16 - 10.8 + 27) // swap the original tube cost for the override
  })

  it('a control_fixed_usd override adds to fixed_costs', () => {
    const rule = hwRule({
      blind_type: 'roller_shade', min_width_in: 121, max_width_in: 144,
      tube_size: '2"', control_type: 'Motor', is_motorized: true,
      control_fixed_usd: 45,
    })
    const r = calculateLineItem(
      { width_inches: 36, height_inches: 48, mount_type: 'inside' },
      COMPONENTS,
      [],
      rule
    )
    expect(r.costs.fixed_costs).toBe(49) // 4 (brackets) + 45 (control)
    expect(r.costs.line_total_usd).toBe(66.16 + 45)
  })

  it('excluded tube is still zero even with a tube override set', () => {
    const rule = hwRule({
      blind_type: 'roller_shade', min_width_in: 0, max_width_in: 84,
      tube_size: '1 1/4"', control_type: 'VTX 15',
      tube_usd_per_inch_override: 0.75,
    })
    const r = calculateLineItem(
      { width_inches: 36, height_inches: 48, mount_type: 'inside' },
      COMPONENTS,
      ['tube'],
      rule
    )
    expect(r.costs.tube_cost).toBe(0)
  })
})
