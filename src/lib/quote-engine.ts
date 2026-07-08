import type {
  AwningProduct,
  HardwareSizeRule,
  HardwareSpec,
  MountType,
  UnitType,
  UserRole,
} from '@/types/database'

// Re-exported so callers of the engine (and its test suite) can pull the
// hardware-sizing types from one place alongside the functions that use
// them. Canonical definitions live in @/types/database.ts.
export type { HardwareSizeRule, HardwareSpec }

/**
 * The minimal shape the engine actually needs from a priced component row.
 * Satisfied structurally by both the legacy per-product `Component` and the
 * new per-style `BlindStyleComponent` (see `@/types/database`) — the engine
 * only ever reads `name`/`unit`/`usd_price`, so it never needs to know which
 * table a row came from. This is what keeps the engine pure across the
 * blind-pricing-source change from `products` to `blind_styles`.
 */
export interface PricedComponent {
  name: string
  unit: UnitType
  usd_price: number
}

// ============================================================
// Shared types
// ============================================================

export interface WindowDimensions {
  width_inches: number
  height_inches: number
  mount_type: MountType
}

export interface BlindDimensions {
  blind_width: number
  blind_height: number
}

/**
 * Per-category cost breakdown for a single blind line item, stored in USD
 * (the supplier's cost currency). Categories whose hardware component was
 * excluded via the window's `excluded_components` array will be zero.
 */
export interface LineItemCosts {
  cassette_cost: number
  tube_cost: number
  bottom_rail_cost: number
  chain_cost: number
  fabric_cost: number
  fixed_costs: number
  /** Sum of all included component costs, in USD. */
  line_total_usd: number
}

export interface LineItemResult {
  blind_width: number
  blind_height: number
  fabric_area: number
  chain_length: number
  costs: LineItemCosts
  /**
   * Hardware component names that were excluded from cost calculation.
   * Empty when all hardware is included. Used to render a small footnote
   * on the window view and the quote: "Cassette, tube not included".
   */
  excluded_names: string[]
}

// ============================================================
// Pricing parameters and totals — customer-type-aware (Batch 4)
// ============================================================

export interface PricingParams {
  exchange_rate: number
  retail_markup_pct: number
  wholesale_markup_pct: number
  /** Labour cost per window in TTD. Rolled silently into each line item's customer-visible total — never shown as a separate line. */
  labor_ttd: number
  /** Installation cost per window in TTD. Applied only for retail customers; shown as a separate line. */
  installation_ttd: number
}

export interface QuoteTotals {
  /** Sum of all line item USD costs (before markup). Internal only — not shown to customer. */
  subtotal_usd: number
  /** The markup percentage that was applied (retail or wholesale). Stored on the quote for reference. */
  markup_pct: number
  /** Grand total in TTD: sum of per-window (cost × markup × exchange_rate + labour) + installation (retail only). */
  grand_total_ttd: number
  /** Installation total in TTD. Zero for wholesale customers. */
  installation_ttd: number
  /** Number of priceable windows (blind or awning lines, not zero-lines). Drives per-window charges. */
  priceable_count: number
}

// ============================================================
// Blind calculations
// ============================================================

/** Calculate the physical blind dimensions from the window opening. Inside mount = exact width; outside mount = +6" overlap. Both add 14" to height for the roller mechanism. */
export function calculateBlindDimensions(config: WindowDimensions): BlindDimensions {
  if (config.mount_type === 'inside') {
    return {
      blind_width: config.width_inches,
      blind_height: config.height_inches + 14,
    }
  }
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

// ============================================================
// Width-based hardware support rules (Batch 7 pre-work)
// ============================================================

/**
 * Resolve the tube/control hardware spec for a blind given its client-tagged
 * `blind_type` and its FABRICATED width (i.e. `calculateBlindDimensions().blind_width`,
 * not the raw window width).
 *
 * Matching picks the smallest tier whose `max_width_in` covers the width
 * (rules sorted by max ascending), NOT a strict `[min, max]` containment:
 * the client's tiers step in whole inches (…–84, 85–…) but widths are
 * measured to 1/8", so strict containment would drop fractional widths like
 * 84.5" into a gap between tiers. Anything past a tier boundary rolls up to
 * the next tier's heavier hardware. `min_width_in` is display/admin metadata.
 * `exceedsMax` only trips when the width is beyond the largest max in the set.
 *
 * @param blindType  The product's `blind_type` tag, or null if untagged —
 *                    always resolves to a null spec (this feature doesn't
 *                    apply to untagged/legacy products).
 * @param blindWidthIn  Fabricated blind width in inches.
 * @param rules      All hardware_size_rules rows (unfiltered — this function
 *                    does the blind_type filtering).
 * @returns `spec` is the matched rule's hardware info (null if blindType is
 *   null, there are no rules for that type, or the width exceeds the max).
 *   `exceedsMax` is true only when a rule set exists for the type but the
 *   width is beyond its largest max_width_in — the caller should block
 *   saving/quoting in that case.
 */
export function resolveHardwareSpec(
  blindType: string | null,
  blindWidthIn: number,
  rules: HardwareSizeRule[]
): { spec: HardwareSpec | null; exceedsMax: boolean } {
  if (!blindType) return { spec: null, exceedsMax: false }

  const typeRules = rules.filter(r => r.blind_type === blindType)
  if (typeRules.length === 0) return { spec: null, exceedsMax: false }

  const matched = [...typeRules]
    .sort((a, b) => Number(a.max_width_in) - Number(b.max_width_in))
    .find(r => blindWidthIn <= Number(r.max_width_in))
  if (matched) {
    return {
      spec: {
        tube_size: matched.tube_size,
        control_type: matched.control_type,
        is_motorized: matched.is_motorized,
        blind_type: matched.blind_type,
        rule_id: matched.id,
      },
      exceedsMax: false,
    }
  }

  const largestMax = Math.max(...typeRules.map(r => Number(r.max_width_in)))
  return { spec: null, exceedsMax: blindWidthIn > largestMax }
}

/**
 * Calculate the USD cost breakdown for a single blind line item.
 *
 * @param config          Window dimensions + mount type.
 * @param components      All hardware + material components pricing this blind
 *                        (the selected blind Style's `blind_style_components`
 *                        rows as of the products->blind_styles pricing move;
 *                        any `PricedComponent`-shaped rows work).
 * @param excludedComponents  Names of hardware components the user has unchecked
 *                            (e.g. `['cassette', 'tube']`). Excluded components
 *                            contribute zero cost. Fabric is never excludable.
 * @param hardwareRule    The resolved width-based hardware rule for this blind
 *                        (see `resolveHardwareSpec`), or null/undefined when
 *                        none applies. When its `tube_usd_per_inch_override` is
 *                        set, it replaces the tube component's per-inch USD
 *                        price; when `control_fixed_usd` is set, it's added to
 *                        `fixed_costs`. A rule with both overrides null (the
 *                        seeded state) leaves costs identical to omitting it.
 */
export function calculateLineItem(
  config: WindowDimensions,
  components: PricedComponent[],
  excludedComponents: string[] = [],
  hardwareRule?: HardwareSizeRule | null
): LineItemResult {
  const dims = calculateBlindDimensions(config)
  const fabric_area = calculateFabricArea(dims.blind_width, dims.blind_height)
  const chain_length = calculateChainLength(config.height_inches)

  const excludedSet = new Set(excludedComponents.map(n => n.toLowerCase()))
  const excluded_names: string[] = []

  let cassette_cost = 0
  let tube_cost = 0
  let bottom_rail_cost = 0
  let chain_cost = 0
  let fabric_cost = 0
  let fixed_costs = 0

  for (const comp of components) {
    // Fabric is never excludable — it's material, not hardware.
    const isHardware = comp.name !== 'fabric'
    if (isHardware && excludedSet.has(comp.name.toLowerCase())) {
      // Track the excluded name for the footnote. Use the raw name once
      // (dedup via the Set check above).
      if (!excluded_names.includes(comp.name)) {
        excluded_names.push(comp.name)
      }
      continue
    }

    // The hardware rule's tube override, when set, replaces the tube
    // component's own per-inch USD price (client fabrication upcharge for
    // wider tubes). Null override (seeded state) falls through to the
    // component's stored price, so cost is unchanged.
    const tubeOverride = hardwareRule?.tube_usd_per_inch_override
    const price =
      comp.name === 'tube' && tubeOverride !== null && tubeOverride !== undefined
        ? Number(tubeOverride)
        : Number(comp.usd_price)
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

  // Control cost from the hardware rule (e.g. a motorized-control upcharge)
  // is a flat addition, not tied to any single component row. Null
  // (seeded state) adds nothing, preserving today's costs.
  if (hardwareRule?.control_fixed_usd !== null && hardwareRule?.control_fixed_usd !== undefined) {
    fixed_costs += Math.round(Number(hardwareRule.control_fixed_usd) * 100) / 100
  }

  const line_total_usd = Math.round(
    (cassette_cost + tube_cost + bottom_rail_cost + chain_cost + fabric_cost + fixed_costs) * 100
  ) / 100

  return {
    blind_width: dims.blind_width,
    blind_height: dims.blind_height,
    fabric_area: round2(fabric_area),
    chain_length: round2(chain_length),
    costs: {
      cassette_cost: round2(cassette_cost),
      tube_cost: round2(tube_cost),
      bottom_rail_cost: round2(bottom_rail_cost),
      chain_cost: round2(chain_cost),
      fabric_cost: round2(fabric_cost),
      fixed_costs: round2(fixed_costs),
      line_total_usd,
    },
    excluded_names,
  }
}

// ============================================================
// Quote totals — customer-type-aware
// ============================================================

/**
 * One priceable line's inputs to {@link calculateQuoteTotals}: its per-unit
 * USD cost plus how many identical units it represents.
 */
export interface QuoteLineItemInput {
  costs: { line_total_usd: number }
  /**
   * Effective unit multiplier for this line — window quantity x its room's
   * quantity (wholesale room/window multipliers). Defaults to 1 when
   * omitted, so pre-quantity callers/tests are unaffected.
   */
  units?: number
}

/**
 * Calculate the grand total for a property quote.
 *
 * Pricing logic (Batch 4):
 * - Each line item's USD cost is marked up by the customer-type-specific
 *   percentage (retail_markup_pct or wholesale_markup_pct).
 * - The marked-up USD is converted to TTD using the exchange rate.
 * - Labour (per window, in TTD) is rolled in silently — the customer never
 *   sees a "labour" line, it's baked into the per-window total.
 * - Installation (per window, in TTD) is applied **only for retail customers**
 *   and shown as a separate line.
 * - Duty and shipping are NOT applied — they belong to the Purchasing Module.
 * - Reseller discount is gone — salesmen are staff, not a discounted tier.
 *
 * Quantity multipliers (room x window, wholesale quoting): each line's
 * `units` (default 1) scales BOTH its USD cost contribution and its
 * labour/installation charge — a hotel room configured once at quantity 40
 * contributes 40x the component cost and 40x labour/installation, not just
 * 1x with a decorative counter. `priceable_count` becomes the sum of units
 * (total priceable window instances), not the row count.
 */
export function calculateQuoteTotals(
  lineItems: QuoteLineItemInput[],
  pricing: PricingParams,
  customerRole: UserRole
): QuoteTotals {
  const isRetail = customerRole === 'retail_customer'
  const markup_pct = isRetail ? pricing.retail_markup_pct : pricing.wholesale_markup_pct

  const priceable_count = lineItems.reduce((sum, li) => sum + (li.units ?? 1), 0)
  const subtotal_usd = lineItems.reduce(
    (sum, li) => sum + li.costs.line_total_usd * (li.units ?? 1),
    0
  )

  // Per-unit: (USD × markup) → TTD + labour, summed across all units
  const marked_up_usd = subtotal_usd * (1 + markup_pct / 100)
  const converted_ttd = marked_up_usd * pricing.exchange_rate
  const labor_total_ttd = pricing.labor_ttd * priceable_count
  const base_total_ttd = converted_ttd + labor_total_ttd

  // Installation: retail only, per priceable unit
  const installation_ttd = isRetail
    ? pricing.installation_ttd * priceable_count
    : 0

  const grand_total_ttd = base_total_ttd + installation_ttd

  return {
    subtotal_usd: round2(subtotal_usd),
    markup_pct,
    grand_total_ttd: round2(grand_total_ttd),
    installation_ttd: round2(installation_ttd),
    priceable_count,
  }
}

/**
 * Compute the customer-visible TTD price for a single line item.
 *
 * This is a display helper for the quote detail page and PDF — it
 * derives the per-window price from the stored quote-header values
 * so it doesn't need to re-run the full engine.
 *
 * Formula: ((line_total_usd × units) × (1 + markup_percent/100) × exchange_rate) + (labor_cost_ttd × units)
 *
 * @param units  Effective unit multiplier (window quantity x room quantity),
 *   default 1. `line_total_usd` is always the cost of ONE unit — this
 *   multiplies it (and its labour) out to the full quoted quantity.
 */
export function lineItemTtd(
  lineUsd: number,
  markupPct: number,
  exchangeRate: number,
  laborTtd: number,
  units: number = 1
): number {
  return round2(lineUsd * units * (1 + markupPct / 100) * exchangeRate + laborTtd * units)
}

function round2(n: number): number {
  return Math.round(n * 100) / 100
}

// ============================================================
// Awnings
// ============================================================

export interface AwningLineItemResult {
  awning_width: number
  awning_depth: number
  material_area: number
  costs: {
    frame_cost: number
    material_cost: number
    fixed_cost: number
    line_total_usd: number
  }
}

/** Awning width adds 6 inches to the window width for overhang. Depth is fixed per product model. Material area = awning_width × depth (square inches). */
export function calculateAwningDimensions(
  windowWidth: number,
  product: AwningProduct
): { awning_width: number; awning_depth: number } {
  return {
    awning_width: windowWidth + 6,
    awning_depth: Number(product.depth_inches),
  }
}

export function calculateAwningLineItem(
  windowWidth: number,
  product: AwningProduct
): AwningLineItemResult {
  const { awning_width, awning_depth } = calculateAwningDimensions(windowWidth, product)
  const material_area = awning_width * awning_depth

  const frame_cost = Number(product.frame_unit_price_usd) * awning_width
  const material_cost = Number(product.material_unit_price_usd) * material_area
  const fixed_cost = Number(product.fixed_cost_usd)
  const line_total_usd = frame_cost + material_cost + fixed_cost

  return {
    awning_width: round2(awning_width),
    awning_depth: round2(awning_depth),
    material_area: round2(material_area),
    costs: {
      frame_cost: round2(frame_cost),
      material_cost: round2(material_cost),
      fixed_cost: round2(fixed_cost),
      line_total_usd: round2(line_total_usd),
    },
  }
}
