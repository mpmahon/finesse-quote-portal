import {
  calculateAwningLineItem,
  calculateLineItem,
  calculateQuoteTotals,
  lineItemTtd,
} from '@/lib/quote-engine'
import type { PricingParams, QuoteTotals } from '@/lib/quote-engine'
import { componentsForStyle, resolveStyleId } from '@/lib/blind-hierarchy'
import type { BlindHierarchy } from '@/lib/blind-hierarchy'
import type { AwningProduct, MountType, UserRole } from '@/types/database'

/**
 * Shared estimate layer (WS1 §5.6).
 *
 * Every card/list "estimate" in the app goes through these functions so that
 * a property/room estimate always equals a freshly generated quote to the
 * cent. Do NOT re-implement summation loops in pages — extend this instead.
 *
 * Hardware size rules (Batch 7 pre-work, quote-engine.ts `resolveHardwareSpec`
 * / `calculateLineItem`'s `hardwareRule` param) are NOT wired in here. Their
 * seeded cost overrides are null, so they're cost-neutral today — this layer
 * intentionally doesn't fetch `hardware_size_rules` to avoid an unused query.
 * Once the client confirms upcharge pricing and overrides are set, this file
 * will need updating alongside the calculate route so card estimates keep
 * matching generated quotes to the cent.
 */

/**
 * Window shape as loaded by the properties/rooms pages. Blind pricing
 * (Batch 11 Part 1) is resolved from the window's stored hierarchy NAME
 * snapshot (`shade_type`/`opacity`/`style`) via the passed-in
 * {@link BlindHierarchy} rather than an embedded product — there's no more
 * per-window product to select.
 */
export interface EstimateWindow {
  width_inches: number | string
  height_inches: number | string
  mount_type: MountType
  has_blind: boolean
  has_awning: boolean
  /** Batch 7 Type name snapshot ("Roller Shade", etc). */
  shade_type: string | null
  /** Batch 7 Opacity name snapshot. */
  opacity: string | null
  /** Batch 7 Style name snapshot — resolved to a style id via the hierarchy to find its pricing components. */
  style: string | null
  awning_product_id: string | null
  excluded_components: string[] | null
  awning_products: AwningProduct | null
  /** Batch 11 Part 2 — identical-window multiplier for this row (combines with its room's own quantity). Default 1. */
  quantity: number
}

/** The pricing_config columns the estimate layer needs. */
export interface EstimateConfig {
  exchange_rate: number | string
  retail_markup_pct: number | string
  wholesale_markup_pct: number | string
  labor_cost_ttd: number | string
  installation_cost_ttd: number | string
}

/** Columns to select from pricing_config for estimates. */
export const ESTIMATE_CONFIG_COLUMNS =
  'exchange_rate, retail_markup_pct, wholesale_markup_pct, labor_cost_ttd, installation_cost_ttd'

/** Convert a pricing_config row into the engine's PricingParams. */
export function toPricingParams(config: EstimateConfig): PricingParams {
  return {
    exchange_rate: Number(config.exchange_rate),
    retail_markup_pct: Number(config.retail_markup_pct),
    wholesale_markup_pct: Number(config.wholesale_markup_pct),
    labor_ttd: Number(config.labor_cost_ttd),
    installation_ttd: Number(config.installation_cost_ttd),
  }
}

/** The markup percentage a given customer role attracts. */
export function markupPctForRole(role: UserRole, config: EstimateConfig): number {
  return role === 'retail_customer'
    ? Number(config.retail_markup_pct)
    : Number(config.wholesale_markup_pct)
}

/** This window's effective unit multiplier: its own quantity x the owning room's quantity. Both default-guard to at least 1 in case a stale row somehow has 0/negative (DB check constraint should prevent this, but estimates run over cached/joined data). */
function effectiveUnits(w: EstimateWindow, roomQuantity: number): number {
  return Math.max(1, w.quantity) * Math.max(1, roomQuantity)
}

/**
 * USD line totals for one window — one entry per priceable line (blind and/or
 * awning), honouring excluded_components. Mirrors the calculate route exactly:
 * a window with both a blind and an awning contributes two lines (and so two
 * labour/installation charges). Each line is the cost of ONE unit — quantity
 * multiplication happens in the callers below via `units`.
 */
export function windowLineTotalsUsd(w: EstimateWindow, hierarchy: BlindHierarchy): number[] {
  const lines: number[] = []
  if (w.has_blind) {
    const styleId = resolveStyleId(hierarchy, { shadeType: w.shade_type, opacity: w.opacity, style: w.style })
    const components = componentsForStyle(hierarchy, styleId)
    if (components.length > 0) {
      const result = calculateLineItem(
        {
          width_inches: Number(w.width_inches),
          height_inches: Number(w.height_inches),
          mount_type: w.mount_type,
        },
        components,
        w.excluded_components || []
      )
      lines.push(result.costs.line_total_usd)
    }
  }
  if (w.has_awning && w.awning_product_id && w.awning_products) {
    const result = calculateAwningLineItem(Number(w.width_inches), w.awning_products)
    lines.push(result.costs.line_total_usd)
  }
  return lines
}

/**
 * Full-formula estimate for a set of windows — identical math to quote
 * generation: per-line markup by customer type, currency conversion, labour
 * per line, installation per line for retail customers only.
 *
 * @param roomQuantity  The owning room's quantity multiplier (all windows
 *   passed in are assumed to belong to the same room, matching how the
 *   property page calls this once per room). Default 1.
 */
export function estimateWindowsTotals(
  windows: EstimateWindow[],
  config: EstimateConfig,
  customerRole: UserRole,
  hierarchy: BlindHierarchy,
  roomQuantity: number = 1
): QuoteTotals {
  const lineItems = windows.flatMap(w => {
    const units = effectiveUnits(w, roomQuantity)
    return windowLineTotalsUsd(w, hierarchy).map(usd => ({ costs: { line_total_usd: usd }, units }))
  })
  return calculateQuoteTotals(lineItems, toPricingParams(config), customerRole)
}

/**
 * Customer-visible TTD estimate for a single window (blind + awning lines,
 * labour rolled in per line; installation excluded — it is shown separately
 * on quotes). Returns null when nothing on the window is configured yet.
 *
 * @param roomQuantity  The owning room's quantity multiplier. Default 1.
 */
export function estimateWindowTtd(
  w: EstimateWindow,
  config: EstimateConfig,
  customerRole: UserRole,
  hierarchy: BlindHierarchy,
  roomQuantity: number = 1
): number | null {
  const lines = windowLineTotalsUsd(w, hierarchy)
  if (lines.length === 0) return null
  const units = effectiveUnits(w, roomQuantity)
  const markup = markupPctForRole(customerRole, config)
  const rate = Number(config.exchange_rate)
  const labor = Number(config.labor_cost_ttd)
  return lines.reduce((sum, usd) => sum + lineItemTtd(usd, markup, rate, labor, units), 0)
}
