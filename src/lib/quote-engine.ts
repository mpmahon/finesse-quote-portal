import type { AwningProduct, Component, MountType, UserRole } from '@/types/database'

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

/**
 * Calculate the USD cost breakdown for a single blind line item.
 *
 * @param config          Window dimensions + mount type.
 * @param components      All hardware + material components for the selected product.
 * @param excludedComponents  Names of hardware components the user has unchecked
 *                            (e.g. `['cassette', 'tube']`). Excluded components
 *                            contribute zero cost. Fabric is never excludable.
 */
export function calculateLineItem(
  config: WindowDimensions,
  components: Component[],
  excludedComponents: string[] = []
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
 */
export function calculateQuoteTotals(
  lineItems: { costs: { line_total_usd: number } }[],
  pricing: PricingParams,
  customerRole: UserRole
): QuoteTotals {
  const isRetail = customerRole === 'retail_customer'
  const markup_pct = isRetail ? pricing.retail_markup_pct : pricing.wholesale_markup_pct
  const priceable_count = lineItems.length

  const subtotal_usd = lineItems.reduce((sum, li) => sum + li.costs.line_total_usd, 0)

  // Per-window: (USD × markup) → TTD + labour
  const marked_up_usd = subtotal_usd * (1 + markup_pct / 100)
  const converted_ttd = marked_up_usd * pricing.exchange_rate
  const labor_total_ttd = pricing.labor_ttd * priceable_count
  const base_total_ttd = converted_ttd + labor_total_ttd

  // Installation: retail only, per priceable window
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
 * Formula: (line_total_usd × (1 + markup_percent/100) × exchange_rate) + labor_cost_ttd
 */
export function lineItemTtd(
  lineUsd: number,
  markupPct: number,
  exchangeRate: number,
  laborTtd: number
): number {
  return round2(lineUsd * (1 + markupPct / 100) * exchangeRate + laborTtd)
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
